import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useTabMemory } from '@/hooks/useTabMemory';
import {
  Clipboard, KeyboardAvoidingView, Modal, Platform, ScrollView,
  StyleSheet, Switch, Text, TextInput, TouchableOpacity, View, useWindowDimensions,
} from 'react-native';
import AppLoader from '@/components/AppLoader';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors } from '@/constants/colors';
import { useAuth } from '@/context/AuthContext';
import { useUsers } from '@/context/UsersContext';
import { useConfig } from '@/context/ConfigContext';
import {
  usePermissoes,
  FEATURE_CATEGORIES,
  ROLE_DEFAULTS,
  PermKey,
  FeatureDef,
} from '@/context/PermissoesContext';
import TopBar from '@/components/TopBar';
import { getRoleLabel } from '@/utils/genero';
import { StableSearchInput } from '@/components/StableSearchInput';
import { webAlert } from '@/utils/webAlert';
import { alertSucesso, alertErro } from '@/utils/toast';

const TIPO_CONTRATO = [
  { id: 'efectivo',           label: 'Efectivo',              color: '#4CAF50' },
  { id: 'colaborador',        label: 'Colaborador',           color: '#2196F3' },
  { id: 'contratado',         label: 'Contratado',            color: '#FF9800' },
  { id: 'prestacao_servicos', label: 'Prestação de Serviços', color: '#9C27B0' },
];

const PROFESSOR_ROLES = ['professor', 'diretor_turma'];
const ROLES_RESET_SENHA = ['ceo', 'pca', 'admin', 'director', 'subdiretor_administrativo', 'chefe_secretaria'];

const ROLE_COLOR: Record<string, string> = {
  ceo: '#8B5CF6', pca: '#F59E0B', admin: '#3B82F6', director: Colors.accent,
  subdiretor_administrativo: '#7C3AED',
  chefe_secretaria: '#E11D48',
  secretaria: Colors.gold, professor: Colors.info,
  diretor_turma: '#0EA5E9',
  aluno: Colors.success, financeiro: '#10B981',
  encarregado: '#F97316', rh: '#06B6D4',
  pedagogico: '#D97706',
  coordenador_curso: '#059669',
  membro_conselho_pedagogico: '#8B5CF6',
  membro_conselho_escola: '#D4AF37',
};
const ROLE_ICON: Record<string, string> = {
  admin: 'shield-checkmark', director: 'briefcase',
  subdiretor_administrativo: 'business',
  chefe_secretaria: 'star', secretaria: 'documents',
  professor: 'book', diretor_turma: 'ribbon',
  aluno: 'school', financeiro: 'cash',
  encarregado: 'people', rh: 'person-circle',
  pedagogico: 'medal',
  coordenador_curso: 'easel',
  membro_conselho_pedagogico: 'people-circle',
  membro_conselho_escola: 'business',
};

const MANAGEABLE_ROLES = [
  'professor', 'aluno', 'secretaria', 'financeiro', 'rh',
  'pedagogico', 'coordenador_curso', 'director', 'subdiretor_administrativo',
  'chefe_secretaria', 'admin', 'diretor_turma', 'encarregado',
  'membro_conselho_pedagogico', 'membro_conselho_escola',
];

const ALL_KEYS = FEATURE_CATEGORIES.flatMap(c => c.features.map(f => f.key));
const TOTAL_FEATURES = FEATURE_CATEGORIES.reduce((s, c) => s + c.features.length, 0);

function initials(nome: string) {
  return nome.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();
}

type TabType = 'funcionalidades' | 'utilizadores' | 'perfis' | 'pedidos';

export default function GestaoAcessosScreen() {
  const { user } = useAuth();
  const { users, isLoading: usersLoading } = useUsers();
  const { config } = useConfig();
  const {
    getUserPermissions, saveUserPermissions, resetUserPermissions,
    getRolePermissions, saveRolePermissions, resetRolePermissions,
    allUserPermissions, rolePermissions,
    isLoading: permsLoading, reload, hasPermission,
  } = usePermissoes();
  const isLoading = permsLoading;
  const isInitialLoading = usersLoading || permsLoading;
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isMobile = width < 768;
  const bottomInset = Platform.OS === 'web' ? 24 : insets.bottom;

  const [activeTab, setActiveTab] = useTabMemory<TabType>('gestao-acessos', 'funcionalidades');

  // ── Funcionalidades tab state ──
  const [searchFeature, setSearchFeature] = useState('');
  const [catFilter, setCatFilter]   = useState<string | null>(null);
  const catPillsScrollRef = useRef<ScrollView>(null);
  const [featPage, setFeatPage] = useState(0);
  const CATS_PER_PAGE = 3;
  const [featureModalVisible, setFeatureModalVisible] = useState(false);
  const [selectedFeature, setSelectedFeature] = useState<FeatureDef | null>(null);
  const [featureUserPerms, setFeatureUserPerms] = useState<Record<string, boolean>>({});
  const [featureOrigPerms, setFeatureOrigPerms] = useState<Record<string, boolean>>({});
  const [featureSaving, setFeatureSaving]   = useState(false);
  const [featureSearchUser, setFeatureSearchUser] = useState('');

  // ── Utilizadores tab state ──
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [editedPerms, setEditedPerms]         = useState<Record<string, boolean>>({});
  const [saving, setSaving]   = useState(false);
  const [saved, setSaved]     = useState(false);
  const [search, setSearch]   = useState('');
  const [searchPerms, setSearchPerms] = useState('');
  const [expandedCats, setExpandedCats] = useState<Set<string>>(
    new Set(FEATURE_CATEGORIES.map(c => c.categoria))
  );

  // ── Vínculo do professor ──
  const [professorRecordId, setProfessorRecordId] = useState<string | null>(null);
  const [selectedVinculo, setSelectedVinculo]     = useState<string>('efectivo');

  // ── Reset de senha ──
  const [resetModalVisible, setResetModalVisible] = useState(false);
  const [resetLoading, setResetLoading]   = useState(false);
  const [resetResult, setResetResult]     = useState<{ tempPassword: string; userNome: string; userEmail: string } | null>(null);
  const [resetError, setResetError]       = useState<string | null>(null);
  const [copied, setCopied]               = useState(false);

  // ── Pedidos de abertura de avaliação ──
  const [pedidosAbertura, setPedidosAbertura]       = useState<any[]>([]);
  const [pedidosLoading, setPedidosLoading]         = useState(false);
  const [respModal, setRespModal]                   = useState<any | null>(null);
  const [respObservacao, setRespObservacao]         = useState('');
  const [respSaving, setRespSaving]                 = useState(false);
  const [pedidosFiltro, setPedidosFiltro]           = useState<'pendente' | 'aprovada' | 'rejeitada' | 'todas'>('pendente');

  async function fetchPedidosAbertura() {
    setPedidosLoading(true);
    try {
      const token = await AsyncStorage.getItem('@siga_token');
      const res = await fetch('/api/pedidos-abertura-avaliacao', { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (res.ok) { const data = await res.json(); if (Array.isArray(data)) setPedidosAbertura(data); }
    } catch {} finally { setPedidosLoading(false); }
  }

  useEffect(() => {
    if (activeTab === 'pedidos') fetchPedidosAbertura();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  async function responderPedido(decisao: 'aprovada' | 'rejeitada') {
    if (!respModal) return;
    setRespSaving(true);
    try {
      const token = await AsyncStorage.getItem('@siga_token');
      const res = await fetch(`/api/pedidos-abertura-avaliacao/${respModal.id}/responder`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ decisao, observacao: respObservacao.trim() || null }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Erro');
      alertSucesso(decisao === 'aprovada' ? 'Pedido aprovado' : 'Pedido rejeitado', `O professor foi notificado.`);
      setRespModal(null); setRespObservacao('');
      await fetchPedidosAbertura();
    } catch (e: any) {
      alertErro('Erro', e?.message || 'Não foi possível responder ao pedido.');
    } finally { setRespSaving(false); }
  }

  const pedidosFiltrados = pedidosAbertura.filter(p => pedidosFiltro === 'todas' || p.status === pedidosFiltro);
  const pendentesCount   = pedidosAbertura.filter(p => p.status === 'pendente').length;

  const AVAL_LABEL: Record<string, string> = {
    aval1:'A1', aval2:'A2', aval3:'A3', aval4:'A4',
    aval5:'A5', aval6:'A6', aval7:'A7', aval8:'A8',
    pp1:'PP', ppt:'PT',
  };

  // ── Perfis tab state ──
  const [selectedRole, setSelectedRole]           = useState<string | null>(null);
  const [editedRolePerms, setEditedRolePerms]     = useState<Record<string, boolean>>({});
  const [savingRole, setSavingRole]       = useState(false);
  const [savedRole, setSavedRole]         = useState(false);
  const [searchRole, setSearchRole]       = useState('');
  const [searchRolePerms, setSearchRolePerms]     = useState('');
  const [expandedRoleCats, setExpandedRoleCats]   = useState<Set<string>>(
    new Set(FEATURE_CATEGORIES.map(c => c.categoria))
  );

  const canManage = ['ceo', 'pca', 'admin', 'director'].includes(user?.role ?? '') || hasPermission('gestao_acessos');
  const canResetSenha = user?.role ? ROLES_RESET_SENHA.includes(user.role) : false;

  // ── Compute user counts per feature ──────────────────────────────────────────
  const managedUsers = useMemo(
    () => users.filter(u => u.id !== user?.id),
    [users, user?.id]
  );

  const userCountsByFeature = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const cat of FEATURE_CATEGORIES) {
      for (const feat of cat.features) {
        let count = 0;
        for (const u of managedUsers) {
          const perms = getUserPermissions(u.id, u.role);
          if (perms[feat.key as PermKey]) count++;
        }
        counts[feat.key] = count;
      }
    }
    return counts;
  }, [managedUsers, allUserPermissions, rolePermissions, isLoading]);

  // ── Filtered categories for funcionalidades tab ───────────────────────────
  const filteredFeatureCats = useMemo(() => {
    let cats = FEATURE_CATEGORIES;
    if (catFilter) cats = cats.filter(c => c.categoria === catFilter);
    if (searchFeature.trim()) {
      const lq = searchFeature.toLowerCase();
      cats = cats
        .map(c => ({ ...c, features: c.features.filter(f => f.label.toLowerCase().includes(lq) || f.desc.toLowerCase().includes(lq)) }))
        .filter(c => c.features.length > 0);
    }
    return cats;
  }, [catFilter, searchFeature]);

  // Reset page when filter/search changes
  useEffect(() => { setFeatPage(0); }, [catFilter, searchFeature]);

  const featTotalPages = Math.ceil(filteredFeatureCats.length / CATS_PER_PAGE) || 1;
  const pagedFeatureCats = filteredFeatureCats.slice(featPage * CATS_PER_PAGE, (featPage + 1) * CATS_PER_PAGE);

  // ── Utilizadores tab helpers ───────────────────────────────────────────────
  const filteredUsers = managedUsers.filter(u =>
    u.nome.toLowerCase().includes(search.toLowerCase()) ||
    getRoleLabel(u.role, (u as any).genero).toLowerCase().includes(search.toLowerCase())
  );
  const selectedUser = users.find(u => u.id === selectedUserId);

  const filteredRoles = MANAGEABLE_ROLES.filter(role =>
    getRoleLabel(role, '').toLowerCase().includes(searchRole.toLowerCase())
  );

  function filterCategories(q: string) {
    if (!q.trim()) return FEATURE_CATEGORIES;
    const lq = q.toLowerCase();
    return FEATURE_CATEGORIES
      .map(cat => ({ ...cat, features: cat.features.filter(f => f.label.toLowerCase().includes(lq) || f.desc.toLowerCase().includes(lq)) }))
      .filter(cat => cat.features.length > 0);
  }
  const visibleCats     = filterCategories(searchPerms);
  const visibleRoleCats = filterCategories(searchRolePerms);

  useEffect(() => {
    if (!selectedUserId || !selectedUser) return;
    const perms = getUserPermissions(selectedUserId, selectedUser.role);
    setEditedPerms({ ...perms });
    setSaved(false);
  }, [selectedUserId, isLoading]);

  useEffect(() => {
    if (!selectedUserId || !selectedUser) { setProfessorRecordId(null); setSelectedVinculo('efectivo'); return; }
    if (!PROFESSOR_ROLES.includes(selectedUser.role)) { setProfessorRecordId(null); setSelectedVinculo('efectivo'); return; }
    (async () => {
      try {
        const token = await AsyncStorage.getItem('@siga_token');
        const res = await fetch('/api/professores', { headers: token ? { Authorization: `Bearer ${token}` } : {} });
        if (!res.ok) return;
        const data = await res.json();
        const list: any[] = Array.isArray(data) ? data : data.professores ?? [];
        const prof = list.find((p: any) =>
          (p.utilizadorId && (p.utilizadorId === selectedUserId || p.utilizadorId === String(selectedUserId))) ||
          (selectedUser?.email && p.email && p.email.toLowerCase() === selectedUser.email.toLowerCase())
        );
        if (prof) { setProfessorRecordId(prof.id); setSelectedVinculo(prof.tipoContrato ?? 'efectivo'); }
        else { setProfessorRecordId(null); setSelectedVinculo('efectivo'); }
      } catch { setProfessorRecordId(null); setSelectedVinculo('efectivo'); }
    })();
  }, [selectedUserId]);

  useEffect(() => {
    if (!selectedRole) return;
    const perms = getRolePermissions(selectedRole);
    setEditedRolePerms({ ...perms });
    setSavedRole(false);
  }, [selectedRole, isLoading]);

  // ── Funcionalidades modal ─────────────────────────────────────────────────
  function openFeatureModal(feat: FeatureDef) {
    const perms: Record<string, boolean> = {};
    for (const u of managedUsers) {
      const effectivePerms = getUserPermissions(u.id, u.role);
      perms[u.id] = effectivePerms[feat.key as PermKey] ?? false;
    }
    setSelectedFeature(feat);
    setFeatureUserPerms({ ...perms });
    setFeatureOrigPerms({ ...perms });
    setFeatureModalVisible(true);
    setFeatureSearchUser('');
  }

  function toggleFeatureUser(userId: string) {
    setFeatureUserPerms(prev => ({ ...prev, [userId]: !prev[userId] }));
  }

  const featureChangesCount = useMemo(() => {
    if (!selectedFeature) return 0;
    return Object.keys(featureUserPerms).filter(uid => featureUserPerms[uid] !== featureOrigPerms[uid]).length;
  }, [featureUserPerms, featureOrigPerms, selectedFeature]);

  async function handleSaveFeaturePerms() {
    if (!selectedFeature) return;
    setFeatureSaving(true);
    try {
      for (const u of managedUsers) {
        const newValue = featureUserPerms[u.id] ?? false;
        const origValue = featureOrigPerms[u.id] ?? false;
        if (newValue !== origValue) {
          const currentEffective = getUserPermissions(u.id, u.role);
          const updatedPerms: Record<string, boolean> = { ...currentEffective, [selectedFeature.key]: newValue };
          await saveUserPermissions(u.id, updatedPerms);
        }
      }
      setFeatureOrigPerms({ ...featureUserPerms });
      setFeatureModalVisible(false);
      alertSucesso('Acessos actualizados', `Permissões para "${selectedFeature.label}" guardadas com sucesso.`);
    } catch {
      alertErro('Erro ao guardar', 'Não foi possível actualizar os acessos.');
    } finally {
      setFeatureSaving(false);
    }
  }

  const featureModalUsers = useMemo(() => {
    if (!featureModalVisible) return { withAccess: [], withoutAccess: [] };
    const q = featureSearchUser.toLowerCase();
    const filtered = managedUsers.filter(u =>
      !q || u.nome.toLowerCase().includes(q) || getRoleLabel(u.role, (u as any).genero).toLowerCase().includes(q)
    );
    return {
      withAccess:    filtered.filter(u => featureUserPerms[u.id]),
      withoutAccess: filtered.filter(u => !featureUserPerms[u.id]),
    };
  }, [featureUserPerms, featureSearchUser, featureModalVisible, managedUsers]);

  // ── Toggle helpers ─────────────────────────────────────────────────────────
  function togglePerm(key: PermKey) { setEditedPerms(prev => ({ ...prev, [key]: !prev[key] })); setSaved(false); }
  function toggleRolePerm(key: PermKey) { setEditedRolePerms(prev => ({ ...prev, [key]: !prev[key] })); setSavedRole(false); }
  function toggleCategory(cat: string) {
    setExpandedCats(prev => { const n = new Set(prev); n.has(cat) ? n.delete(cat) : n.add(cat); return n; });
  }
  function toggleRoleCategory(cat: string) {
    setExpandedRoleCats(prev => { const n = new Set(prev); n.has(cat) ? n.delete(cat) : n.add(cat); return n; });
  }

  // ── Save / Reset ───────────────────────────────────────────────────────────
  async function handleSave() {
    if (!selectedUserId) return;
    setSaving(true);
    try {
      await saveUserPermissions(selectedUserId, editedPerms);
      if (professorRecordId && selectedUser && PROFESSOR_ROLES.includes(selectedUser.role)) {
        const token = await AsyncStorage.getItem('@siga_token');
        await fetch(`/api/professores/${professorRecordId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          body: JSON.stringify({ tipoContrato: selectedVinculo }),
        });
      }
      setSaved(true); setTimeout(() => setSaved(false), 2500);
      alertSucesso('Permissões guardadas', 'As permissões do utilizador foram actualizadas.');
    } finally { setSaving(false); }
  }

  async function handleReset() {
    if (!selectedUserId || !selectedUser) return;
    setSaving(true);
    try {
      await resetUserPermissions(selectedUserId);
      const defaults = ROLE_DEFAULTS[selectedUser.role] || [];
      const resetted: Record<string, boolean> = {};
      FEATURE_CATEGORIES.forEach(cat => cat.features.forEach(f => { resetted[f.key] = defaults.includes(f.key as PermKey); }));
      setEditedPerms(resetted); setSaved(true); setTimeout(() => setSaved(false), 2500);
      alertSucesso('Permissões repostas', 'As permissões foram repostas para os valores padrão.');
    } finally { setSaving(false); }
  }

  async function handleSaveRole() {
    if (!selectedRole) return;
    setSavingRole(true);
    try {
      await saveRolePermissions(selectedRole, editedRolePerms);
      setSavedRole(true); setTimeout(() => setSavedRole(false), 2500);
      alertSucesso('Perfil guardado', 'As permissões do perfil foram actualizadas.');
    } finally { setSavingRole(false); }
  }

  async function handleResetRole() {
    if (!selectedRole) return;
    setSavingRole(true);
    try {
      await resetRolePermissions(selectedRole);
      const defaults = ROLE_DEFAULTS[selectedRole] || [];
      const resetted: Record<string, boolean> = {};
      FEATURE_CATEGORIES.forEach(cat => cat.features.forEach(f => { resetted[f.key] = defaults.includes(f.key as PermKey); }));
      setEditedRolePerms(resetted); setSavedRole(true); setTimeout(() => setSavedRole(false), 2500);
      alertSucesso('Perfil reposto', 'As permissões do perfil foram repostas para os valores padrão.');
    } finally { setSavingRole(false); }
  }

  async function handleResetPassword() {
    if (!selectedUserId) return;
    setResetLoading(true); setResetError(null); setResetResult(null);
    try {
      const token = await AsyncStorage.getItem('@siga_token');
      const res = await fetch('/api/admin/reset-user-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ userId: selectedUserId }),
      });
      const data = await res.json();
      if (!res.ok) setResetError(data.error || 'Erro ao redefinir senha.');
      else setResetResult({ tempPassword: data.tempPassword, userNome: data.userNome, userEmail: data.userEmail });
    } catch { setResetError('Erro de ligação. Tente novamente.'); }
    finally { setResetLoading(false); }
  }

  function handleCopyPassword() {
    if (!resetResult) return;
    Clipboard.setString(resetResult.tempPassword);
    setCopied(true); setTimeout(() => setCopied(false), 2500);
  }

  // ── Quick actions ──────────────────────────────────────────────────────────
  function enableAll() { const a: Record<string,boolean> = {}; FEATURE_CATEGORIES.forEach(c => c.features.forEach(f => { a[f.key]=true; })); setEditedPerms(a); setSaved(false); }
  function disableAll() { const a: Record<string,boolean> = {}; FEATURE_CATEGORIES.forEach(c => c.features.forEach(f => { a[f.key]=false; })); setEditedPerms(a); setSaved(false); }
  function enableAllRole() { const a: Record<string,boolean> = {}; FEATURE_CATEGORIES.forEach(c => c.features.forEach(f => { a[f.key]=true; })); setEditedRolePerms(a); setSavedRole(false); }
  function disableAllRole() { const a: Record<string,boolean> = {}; FEATURE_CATEGORIES.forEach(c => c.features.forEach(f => { a[f.key]=false; })); setEditedRolePerms(a); setSavedRole(false); }
  function countActive(cat: typeof FEATURE_CATEGORIES[0], perms: Record<string, boolean>) { return cat.features.filter(f => perms[f.key]).length; }

  // ── Imprimir Ficha de Acesso ───────────────────────────────────────────────
  async function imprimirFicha(opts?: { tempPassword?: string }) {
    if (!selectedUser) return;
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const u = selectedUser as any;
    const tempPwd = opts?.tempPassword;
    let prof: any = null; let aluno: any = null;
    try {
      const token = await AsyncStorage.getItem('@siga_token');
      const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
      if (PROFESSOR_ROLES.includes(u.role)) {
        const r = await fetch('/api/professores', { headers }); if (r.ok) { const list = await r.json(); const arr: any[] = Array.isArray(list) ? list : (list.professores || []); prof = arr.find((p: any) => (p.utilizadorId && p.utilizadorId === u.id) || (u.email && p.email && p.email.toLowerCase() === u.email.toLowerCase())) || null; }
      } else if (u.role === 'aluno') {
        const r = await fetch('/api/alunos', { headers }); if (r.ok) { const list = await r.json(); const arr: any[] = Array.isArray(list) ? list : (list.alunos || []); aluno = arr.find((a: any) => (a.utilizadorId && a.utilizadorId === u.id) || (u.email && a.email && a.email.toLowerCase() === u.email.toLowerCase())) || null; }
      }
    } catch { }
    const isHashed = typeof u.senha === 'string' && /^\$2[aby]\$/.test(u.senha);
    const senha = tempPwd || (typeof u.senha === 'string' && !isHashed ? u.senha : null);
    const photo = u.avatar || prof?.foto || aluno?.foto || null;
    const roleLabel = getRoleLabel(u.role, u.genero);
    let categoria = '—'; let nivelAcademico = '—';
    const extraRows: Array<{ label: string; value: string }> = [];
    if (prof) { categoria = prof.categoria || prof.cargo || roleLabel; nivelAcademico = prof.habilitacoes || prof.nivelEnsino || '—'; if (prof.numeroProfessor) extraRows.push({ label: 'Nº Professor', value: prof.numeroProfessor }); if (prof.nivelEnsino) extraRows.push({ label: 'Nível de Ensino', value: prof.nivelEnsino }); if (Array.isArray(prof.disciplinas) && prof.disciplinas.length) { extraRows.push({ label: 'Disciplinas', value: prof.disciplinas.join(', ') }); } if (prof.tipoContrato) { const t = TIPO_CONTRATO.find(x => x.id === prof.tipoContrato); extraRows.push({ label: 'Tipo de Contrato', value: t?.label || prof.tipoContrato }); }
    } else if (aluno) { categoria = 'Aluno'; nivelAcademico = aluno.classe || '—'; if (aluno.numeroAluno) extraRows.push({ label: 'Nº Aluno', value: aluno.numeroAluno }); if (aluno.classe) extraRows.push({ label: 'Classe', value: aluno.classe }); if (aluno.curso || aluno.cursoNome) extraRows.push({ label: 'Curso', value: aluno.curso || aluno.cursoNome }); if (aluno.turma || aluno.turmaNome) extraRows.push({ label: 'Turma', value: aluno.turma || aluno.turmaNome });
    } else { categoria = u.cargo || roleLabel; nivelAcademico = u.departamento || '—'; }
    if (u.telefone) extraRows.push({ label: 'Telefone', value: u.telefone });
    const dataEmissao = new Date().toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const horaEmissao = new Date().toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });
    const impressoPor = user?.nome || user?.email || '—';
    const impressoPorRole = user?.role ? getRoleLabel(user.role, (user as any).genero) : '';
    let qrDataUrl: string | null = null;
    try {
      const QR = (await import('qrcode')).default;
      const nomeParts = (u.nome || '').trim().split(/\s+/);
      const primeiroNome = nomeParts[0] || u.nome || '';
      const ultimoNome = nomeParts.slice(1).join(' ') || '';
      const numero = prof?.numeroProfessor || aluno?.numeroAluno || u.id;
      const titulo = prof ? `${roleLabel} — ${categoria}` : roleLabel;
      const noteFields: string[] = [`Perfil: ${roleLabel}`, `ID: ${u.id}`];
      if (prof) { if (prof.numeroProfessor) noteFields.push(`Nº Professor: ${prof.numeroProfessor}`); if (prof.habilitacoes) noteFields.push(`Habilitações: ${prof.habilitacoes}`); if (prof.nivelEnsino) noteFields.push(`Nível: ${prof.nivelEnsino}`); if (Array.isArray(prof.disciplinas) && prof.disciplinas.length) { noteFields.push(`Disciplinas: ${prof.disciplinas.join(', ')}`); } } else if (aluno) { if (aluno.numeroAluno) noteFields.push(`Nº Aluno: ${aluno.numeroAluno}`); if (aluno.classe) noteFields.push(`Classe: ${aluno.classe}`); if (aluno.curso || aluno.cursoNome) noteFields.push(`Curso: ${aluno.curso || aluno.cursoNome}`); if (aluno.turma || aluno.turmaNome) noteFields.push(`Turma: ${aluno.turma || aluno.turmaNome}`); }
      const vcardEsc = (s: string) => String(s).replace(/[\\,;\n]/g, m => ({ '\\': '\\\\', ',': '\\,', ';': '\\;', '\n': '\\n' }[m] as string));
      const vcard = ['BEGIN:VCARD','VERSION:3.0',`N:${vcardEsc(ultimoNome)};${vcardEsc(primeiroNome)};;;`,`FN:${vcardEsc(u.nome || '')}`,`ORG:Super Escola — Sistema Integrado de Gestão Académica`,`TITLE:${vcardEsc(titulo)}`,`EMAIL;TYPE=INTERNET:${vcardEsc(u.email || '')}`,u.telefone ? `TEL;TYPE=CELL:${vcardEsc(u.telefone)}` : '',`NOTE:${vcardEsc(noteFields.join(' | '))}`,`UID:siga:${vcardEsc(String(numero))}`,`END:VCARD`].filter(Boolean).join('\r\n');
      qrDataUrl = await QR.toDataURL(vcard, { width: 220, margin: 1, errorCorrectionLevel: 'M' });
    } catch { }
    const esc = (v: any) => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c] as string));
    const ini = initials(u.nome);
    const html = `<!DOCTYPE html><html lang="pt"><head><meta charset="UTF-8"><title>Ficha de Acesso — ${esc(u.nome)}</title><style>@page{size:A4;margin:0}*{box-sizing:border-box}html,body{margin:0;padding:0}body{font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1f2937;background:#f3f4f6;padding:24px}.ficha{background:#fff;max-width:720px;margin:0 auto;border:1.5px solid #e5e7eb;border-radius:14px;padding:28px 32px;box-shadow:0 8px 24px rgba(0,0,0,.04)}.header{display:flex;align-items:center;gap:16px;padding-bottom:16px;border-bottom:3px solid #f59e0b;margin-bottom:22px}.logo{width:54px;height:54px;border-radius:12px;background:linear-gradient(135deg,#f59e0b,#d97706);display:flex;align-items:center;justify-content:center;color:#fff;font-size:24px;font-weight:800}.school h1{margin:0;font-size:17px;font-weight:700;color:#111827}.school p{margin:2px 0 0 0;font-size:11px;color:#6b7280}.doc-tag{margin-left:auto;text-align:right}.doc-tag .lbl{font-size:9px;letter-spacing:1.5px;color:#9ca3af;text-transform:uppercase}.doc-tag .val{font-size:14px;font-weight:700;color:#1f2937;margin-top:2px}.user-block{display:flex;gap:22px;align-items:flex-start;padding:4px 0 18px 0}.photo{width:108px;height:132px;border:2px solid #d1d5db;border-radius:8px;background:#f3f4f6;display:flex;align-items:center;justify-content:center;font-size:36px;font-weight:700;color:#9ca3af;flex-shrink:0;overflow:hidden}.photo img{width:100%;height:100%;object-fit:cover}.user-meta{flex:1}.user-meta h2{margin:0 0 8px 0;font-size:22px;color:#111827;line-height:1.2}.role-badge{display:inline-block;padding:4px 12px;border-radius:999px;background:#fef3c7;color:#92400e;font-size:11px;font-weight:700;letter-spacing:.5px;text-transform:uppercase}.meta-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px 20px;margin-top:14px}.meta-item{font-size:12px}.meta-item .lbl{color:#9ca3af;display:block;font-size:9px;text-transform:uppercase;letter-spacing:.8px;margin-bottom:2px}.meta-item .val{color:#1f2937;font-weight:600;font-size:13px}.section{margin-top:18px}.section h3{margin:0 0 10px 0;font-size:11px;text-transform:uppercase;letter-spacing:1.2px;color:#6b7280;padding-bottom:6px;border-bottom:1px dashed #e5e7eb;font-weight:700}.creds{background:#fefce8;border:1.5px solid #fde68a;border-radius:10px;padding:14px 16px}.creds .row{display:flex;padding:7px 0;font-size:13px;align-items:baseline}.creds .row .k{min-width:90px;color:#92400e;font-weight:700;font-size:11px;text-transform:uppercase;letter-spacing:.5px}.creds .row .v{color:#111827;font-family:'SFMono-Regular',Menlo,Consolas,monospace;font-weight:700;font-size:14px;word-break:break-all}.creds .row .v.muted{font-family:inherit;color:#6b7280;font-weight:500;font-size:12px}.creds .warn{margin-top:10px;font-size:11px;color:#92400e;padding:8px 10px;background:#fff7ed;border-radius:6px;border-left:3px solid #f59e0b;line-height:1.4}.info-rows{display:grid;gap:0}.info-row{display:flex;padding:8px 4px;font-size:12px;border-bottom:1px dotted #e5e7eb}.info-row:last-child{border-bottom:0}.info-row .k{min-width:170px;color:#6b7280;font-size:11px;text-transform:uppercase;letter-spacing:.4px}.info-row .v{color:#1f2937;font-weight:600;flex:1}.signatures{margin-top:38px;display:flex;gap:50px;padding-top:8px}.sig{flex:1;text-align:center}.sig .line{border-top:1.5px solid #1f2937;padding-top:6px;font-size:12px;font-weight:600;color:#1f2937}.sig .label{font-size:10px;color:#6b7280;margin-top:2px}.footer{margin-top:24px;padding-top:12px;border-top:1px solid #e5e7eb}.footer-row{display:flex;gap:24px;justify-content:space-between;align-items:flex-start}.footer-block{display:flex;flex-direction:column;gap:2px;min-width:0}.footer-block.right{text-align:right}.footer-lbl{font-size:8.5px;text-transform:uppercase;letter-spacing:1px;color:#9ca3af;font-weight:600}.footer-val{font-size:11px;color:#374151;font-weight:600}.footer-note{margin-top:8px;padding-top:6px;border-top:1px dotted #e5e7eb;font-size:9px;color:#9ca3af;text-align:center;font-style:italic}.actions{max-width:720px;margin:16px auto 0;display:flex;gap:8px;justify-content:flex-end}.btn{padding:9px 18px;border:1px solid #d1d5db;background:#fff;color:#1f2937;border-radius:8px;cursor:pointer;font-size:13px;font-weight:600;font-family:inherit}.btn:hover{background:#f9fafb}.btn.primary{background:#f59e0b;color:#fff;border-color:#f59e0b}.btn.primary:hover{background:#d97706}@media print{body{background:#fff;padding:0}.actions{display:none}.ficha{border:none;box-shadow:none;max-width:none;padding:0;border-radius:0}}</style></head><body><div class="ficha"><div class="header"><div class="logo">${esc((config?.nomeEscola || 'Super Escola').charAt(0))}</div><div class="school"><h1>${esc(config?.nomeEscola || 'Super Escola')}</h1><p>Sistema Integrado de Gestão Académica</p></div><div class="doc-tag"><div class="lbl">Emitido em</div><div class="val">${esc(dataEmissao)} às ${esc(horaEmissao)}</div></div></div><div class="user-block"><div class="photo" id="photo-container">${photo ? `<img src="${esc(photo)}" alt="Foto" onerror="this.parentElement.innerHTML='${esc(ini)}'; this.parentElement.style.fontSize='36px'; this.parentElement.style.color='#9ca3af';"/>` : esc(ini)}</div><div class="user-meta"><h2>${esc(u.nome)}</h2><span class="role-badge">${esc(roleLabel)}</span><div class="meta-grid"><div class="meta-item"><span class="lbl">Categoria</span><span class="val">${esc(categoria)}</span></div><div class="meta-item"><span class="lbl">Nível Académico</span><span class="val">${esc(nivelAcademico)}</span></div><div class="meta-item"><span class="lbl">Estado da Conta</span><span class="val" style="color:${u.ativo ? '#059669' : '#dc2626'}">${u.ativo ? 'Activa' : 'Inactiva'}</span></div><div class="meta-item"><span class="lbl">ID Interno</span><span class="val" style="font-family:monospace;font-size:11px">${esc(u.id)}</span></div></div></div></div><div class="section"><h3>Credenciais de Acesso</h3><div class="creds"><div class="row"><span class="k">Email</span><span class="v">${esc(u.email)}</span></div>${senha ? `<div class="row"><span class="k">Senha</span><span class="v">${esc(senha)}</span></div><div class="warn"><strong>⚠ Importante:</strong> Por motivos de segurança, o utilizador deve alterar esta senha no primeiro acesso ao sistema (Perfil → Alterar Senha).</div>` : `<div class="row"><span class="k">Senha</span><span class="v muted">Senha já personalizada pelo utilizador. Use "Reset Senha" para emitir uma nova senha temporária.</span></div>`}</div></div>${extraRows.length ? `<div class="section"><h3>Informação Adicional</h3><div class="info-rows">${extraRows.map(r => `<div class="info-row"><span class="k">${esc(r.label)}</span><span class="v">${esc(r.value)}</span></div>`).join('')}</div></div>` : ''}${qrDataUrl ? `<div class="section"><h3>Verificação Digital</h3><div style="display:flex;gap:18px;align-items:flex-start;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:14px"><img src="${qrDataUrl}" alt="QR Code" style="width:130px;height:130px;border:1px solid #e2e8f0;border-radius:6px;padding:4px;background:#fff;flex-shrink:0"/><div style="flex:1;font-size:11.5px;color:#475569;line-height:1.5"><div style="font-size:12px;font-weight:700;color:#1e293b;margin-bottom:6px;text-transform:uppercase;letter-spacing:.5px">Cartão Digital de Contacto</div><p style="margin:0 0 8px 0">Aponte a câmara para o código QR para guardar o contacto.</p></div></div></div>` : ''}<div class="signatures"><div class="sig"><div class="line">Assinatura do Utilizador</div><div class="label">Recebi e tomei conhecimento</div></div><div class="sig"><div class="line">Assinatura do Responsável</div><div class="label">RH / Secretaria / Direcção</div></div></div><div class="footer"><div class="footer-row"><div class="footer-block"><span class="footer-lbl">Documento</span><span class="footer-val">Ficha de Acesso</span></div><div class="footer-block"><span class="footer-lbl">Impresso por</span><span class="footer-val">${esc(impressoPor)}${impressoPorRole ? ' · ' + esc(impressoPorRole) : ''}</span></div><div class="footer-block right"><span class="footer-lbl">Página</span><span class="footer-val">1 de 1</span></div></div><div class="footer-note">Documento confidencial — uso interno · ${esc(config?.nomeEscola || 'Super Escola')}</div></div></div><div class="actions"><button class="btn" onclick="window.close()">Fechar</button><button class="btn primary" onclick="window.print()">🖨 Imprimir</button></div><script>window.addEventListener('load',function(){var img=document.querySelector('#photo-container img');if(img&&!img.complete){img.addEventListener('load',function(){setTimeout(function(){window.print();},200)});img.addEventListener('error',function(){setTimeout(function(){window.print();},200)})}else{setTimeout(function(){window.print();},300)}});<\/script></body></html>`;
    const win = window.open('', '_blank', 'width=900,height=1000');
    if (!win) { webAlert('Pop-up Bloqueado', 'O navegador bloqueou a janela de impressão. Permita pop-ups para este site e tente novamente.'); return; }
    win.document.open(); win.document.write(html); win.document.close(); win.focus();
  }

  // ── Access check ───────────────────────────────────────────────────────────
  if (!canManage) {
    return (
      <View style={styles.container}>
        <TopBar title="Gestão de Acessos" subtitle="Controlo de permissões" />
        <View style={styles.noAccess}>
          <Ionicons name="lock-closed" size={48} color={Colors.danger} />
          <Text style={styles.noAccessTitle}>Acesso Restrito</Text>
          <Text style={styles.noAccessSub}>Apenas CEO, PCA, Administrador e Director podem gerir permissões.</Text>
        </View>
      </View>
    );
  }

  const totalEnabled     = Object.values(editedPerms).filter(Boolean).length;
  const totalRoleEnabled = Object.values(editedRolePerms).filter(Boolean).length;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      <TopBar title="Acessos e Permissões" subtitle="Funcionalidades · Utilizadores · Perfis de cargo" />

      {/* ── Tab Switcher ── */}
      <View style={styles.tabBar}>
        {([
          { key: 'funcionalidades', icon: 'grid', label: 'Funcionalidades', sub: `${TOTAL_FEATURES} features`, color: Colors.gold },
          { key: 'utilizadores',   icon: 'people', label: 'Utilizadores',   sub: `${managedUsers.length} membros`, color: Colors.info },
          { key: 'perfis',         icon: 'shield-half', label: 'Perfis de Cargo', sub: `${MANAGEABLE_ROLES.length} cargos`, color: Colors.accent },
          { key: 'pedidos',        icon: 'mail-unread', label: 'Pedidos', sub: pendentesCount > 0 ? `${pendentesCount} pendente${pendentesCount !== 1 ? 's' : ''}` : 'Lançamentos', color: Colors.warning },
        ] as const).map(tab => {
          const isActive = activeTab === tab.key;
          return (
            <TouchableOpacity
              key={tab.key}
              style={[styles.tabItem, isActive && { borderBottomColor: tab.color }]}
              onPress={() => setActiveTab(tab.key)}
              activeOpacity={0.75}
            >
              <Ionicons name={tab.icon as any} size={15} color={isActive ? tab.color : Colors.textMuted} />
              <Text style={[styles.tabItemLabel, isActive && { color: tab.color }]} numberOfLines={1}>
                {tab.label}
              </Text>
              {!isMobile && (
                <View style={[styles.tabItemBadge, isActive && { backgroundColor: tab.color + '20' }]}>
                  <Text style={[styles.tabItemBadgeText, isActive && { color: tab.color }]}>{tab.sub}</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      {isInitialLoading && (
        <View style={styles.loadingBanner}>
          <AppLoader size="small" color={Colors.gold} />
          <Text style={styles.loadingBannerText}>A sincronizar dados de utilizadores e permissões…</Text>
        </View>
      )}

      {/* ══════════════════════════════════════════════════════════════
          TAB: FUNCIONALIDADES
      ══════════════════════════════════════════════════════════════ */}
      {activeTab === 'funcionalidades' && (
        <View style={{ flex: 1 }}>
          {/* Stats bar */}
          <View style={styles.featStatsBar}>
            {[
              { num: TOTAL_FEATURES,           label: 'permissões', color: Colors.gold },
              { num: FEATURE_CATEGORIES.length, label: 'categorias', color: Colors.textMuted },
              { num: managedUsers.length,        label: 'utilizadores', color: Colors.info },
            ].map((s, i) => (
              <View key={i} style={styles.featStatItem}>
                {i > 0 && <View style={styles.featStatDivider} />}
                <View style={styles.featStatContent}>
                  <Text style={[styles.featStatNum, { color: s.color }]}>{s.num}</Text>
                  <Text style={styles.featStatLabel}>{s.label}</Text>
                </View>
              </View>
            ))}
          </View>

          {/* Search */}
          <View style={styles.featSearchWrap}>
            <StableSearchInput
              value={searchFeature}
              onChangeText={setSearchFeature}
              inputStyle={styles.featSearchInput}
              placeholder="Pesquisar funcionalidade..."
              iconColor={Colors.textMuted}
            />
          </View>

          {/* Category filter pills */}
          <View style={styles.catPillsRow}>
            <ScrollView
              ref={catPillsScrollRef}
              horizontal
              showsHorizontalScrollIndicator={false}
              style={[styles.catPillsScroll, { flex: 1 }]}
              contentContainerStyle={styles.catPillsContent}
            >
              <TouchableOpacity
                style={[styles.catPill, catFilter === null && styles.catPillActive]}
                onPress={() => setCatFilter(null)}
              >
                <Text style={[styles.catPillText, catFilter === null && styles.catPillTextActive]}>Todas</Text>
              </TouchableOpacity>
              {FEATURE_CATEGORIES.map(cat => (
                <TouchableOpacity
                  key={cat.categoria}
                  style={[styles.catPill, catFilter === cat.categoria && styles.catPillActive]}
                  onPress={() => setCatFilter(prev => prev === cat.categoria ? null : cat.categoria)}
                >
                  <Ionicons
                    name={cat.icon as any}
                    size={11}
                    color={catFilter === cat.categoria ? Colors.dark : Colors.textMuted}
                    style={{ marginRight: 4 }}
                  />
                  <Text style={[styles.catPillText, catFilter === cat.categoria && styles.catPillTextActive]} numberOfLines={1}>
                    {cat.categoria}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity
              style={styles.catPillsArrow}
              onPress={() => catPillsScrollRef.current?.scrollTo({ x: 999, animated: true })}
              activeOpacity={0.7}
            >
              <Ionicons name="chevron-forward" size={16} color={Colors.gold} />
            </TouchableOpacity>
          </View>

          {/* Feature cards */}
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ padding: 14, paddingBottom: 8 }}
            showsVerticalScrollIndicator={false}
          >
            {filteredFeatureCats.length === 0 && (
              <View style={styles.noSearchResult}>
                <Ionicons name="search" size={36} color={Colors.border} />
                <Text style={styles.noSearchResultText}>Nenhuma funcionalidade encontrada</Text>
              </View>
            )}
            {pagedFeatureCats.map(cat => (
              <View key={cat.categoria} style={{ marginBottom: 20 }}>
                {/* Category header */}
                <View style={styles.featCatHeader}>
                  <View style={styles.featCatIconBox}>
                    <Ionicons name={cat.icon as any} size={15} color={Colors.gold} />
                  </View>
                  <Text style={styles.featCatTitle}>{cat.categoria}</Text>
                  <View style={styles.featCatCountBadge}>
                    <Text style={styles.featCatCountText}>{cat.features.length}</Text>
                  </View>
                </View>

                {/* Grid of feature cards */}
                <View style={[styles.featGrid, isMobile && styles.featGridMobile]}>
                  {cat.features.map(feat => {
                    const count = userCountsByFeature[feat.key] ?? 0;
                    const total = managedUsers.length;
                    const pct   = total > 0 ? Math.round((count / total) * 100) : 0;
                    const hasAny = count > 0;
                    const pctColor = pct >= 70 ? Colors.success : pct >= 30 ? Colors.warning : Colors.danger;
                    return (
                      <TouchableOpacity
                        key={feat.key}
                        style={styles.featCard}
                        onPress={() => openFeatureModal(feat)}
                        activeOpacity={0.72}
                      >
                        {/* Top: label + key hint */}
                        <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 6 }}>
                          <Text style={styles.featCardLabel} numberOfLines={2}>{feat.label}</Text>
                          <Text style={styles.featCardKey}>{feat.key.replace(/^can_/, '')}</Text>
                        </View>
                        <Text style={styles.featCardDesc} numberOfLines={1}>{feat.desc}</Text>
                        {/* Progress bar */}
                        <View style={styles.featCardProgress}>
                          <View style={[styles.featCardProgressFill, { width: `${pct}%` as any, backgroundColor: hasAny ? pctColor : Colors.border }]} />
                        </View>
                        {/* Footer */}
                        <View style={styles.featCardFooter}>
                          <View style={styles.featCardCountBadge}>
                            <View style={[styles.featCardCountDot, { backgroundColor: hasAny ? pctColor : Colors.border }]} />
                            <Text style={[styles.featCardCountNum, { color: hasAny ? pctColor : Colors.textMuted }]}>{count}/{total}</Text>
                            <Text style={styles.featCardCountSub}>{total > 0 ? `${pct}%` : '—'}</Text>
                          </View>
                          <Ionicons name="chevron-forward" size={12} color={Colors.textMuted} />
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            ))}
          </ScrollView>

          {/* Pagination bar */}
          {featTotalPages > 1 && (
            <View style={styles.featPagination}>
              <TouchableOpacity
                style={[styles.featPageBtn, featPage === 0 && styles.featPageBtnDisabled]}
                onPress={() => setFeatPage(p => Math.max(0, p - 1))}
                disabled={featPage === 0}
                activeOpacity={0.7}
              >
                <Ionicons name="chevron-back" size={13} color={featPage === 0 ? Colors.textMuted : Colors.text} />
              </TouchableOpacity>

              {Array.from({ length: featTotalPages }, (_, i) => {
                const show = i === 0 || i === featTotalPages - 1 || Math.abs(i - featPage) <= 1;
                const ellipsisBefore = i === featTotalPages - 1 && featPage < featTotalPages - 3;
                const ellipsisAfter  = i === 0 && featPage > 2;
                if (!show) return null;
                return (
                  <React.Fragment key={i}>
                    {ellipsisAfter  && <Text style={styles.featPageEllipsis}>…</Text>}
                    <TouchableOpacity
                      style={[styles.featPageBtn, featPage === i && styles.featPageBtnActive]}
                      onPress={() => setFeatPage(i)}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.featPageBtnText, featPage === i && styles.featPageBtnTextActive]}>{i + 1}</Text>
                    </TouchableOpacity>
                    {ellipsisBefore && <Text style={styles.featPageEllipsis}>…</Text>}
                  </React.Fragment>
                );
              })}

              <TouchableOpacity
                style={[styles.featPageBtn, featPage === featTotalPages - 1 && styles.featPageBtnDisabled]}
                onPress={() => setFeatPage(p => Math.min(featTotalPages - 1, p + 1))}
                disabled={featPage === featTotalPages - 1}
                activeOpacity={0.7}
              >
                <Ionicons name="chevron-forward" size={13} color={featPage === featTotalPages - 1 ? Colors.textMuted : Colors.text} />
              </TouchableOpacity>

              <Text style={styles.featPageLabel}>Página {featPage + 1} de {featTotalPages}</Text>
            </View>
          )}
        </View>
      )}

      {/* ══════════════════════════════════════════════════════════════
          TAB: UTILIZADORES
      ══════════════════════════════════════════════════════════════ */}
      {activeTab === 'utilizadores' && (
        <View style={[styles.body, isMobile && styles.bodyMobile]}>
          {/* Left panel */}
          <View style={[styles.leftPanel, isMobile && (selectedUserId ? { display: 'none' as const } : styles.leftPanelMobile)]}>
            <View style={styles.searchBox}>
              <StableSearchInput value={search} onChangeText={setSearch} inputStyle={styles.searchInput} placeholder="Pesquisar utilizador..." iconColor={Colors.textMuted} />
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              {isInitialLoading && filteredUsers.length === 0 && (
                <View>{[0,1,2,3,4,5].map(i => (<View key={i} style={styles.skelCard}><View style={styles.skelAvatar} /><View style={{ flex:1, gap:6 }}><View style={[styles.skelLine,{width:'70%'}]} /><View style={[styles.skelLine,{width:'40%',height:10}]} /><View style={[styles.skelLine,{width:'55%',height:9}]} /></View></View>))}</View>
              )}
              {!isInitialLoading && filteredUsers.length === 0 && <Text style={styles.emptyMsg}>Nenhum utilizador encontrado</Text>}
              {filteredUsers.map(u => {
                const isSelected = u.id === selectedUserId;
                const roleColor = ROLE_COLOR[u.role] || Colors.textMuted;
                const ini = initials(u.nome);
                const userOvCount = Object.values(getUserPermissions(u.id, u.role)).filter(Boolean).length;
                const pct = TOTAL_FEATURES > 0 ? (userOvCount / TOTAL_FEATURES) * 100 : 0;
                const barColor = pct >= 70 ? Colors.success : pct >= 30 ? Colors.warning : Colors.danger;
                return (
                  <TouchableOpacity key={u.id} style={[styles.listCard, isSelected && styles.listCardSelected]} onPress={() => { setSelectedUserId(u.id); setSaved(false); }} activeOpacity={0.75}>
                    {isSelected && <View style={[styles.listCardAccent, { backgroundColor: Colors.gold }]} />}
                    <View style={[styles.avatarBox, { backgroundColor: roleColor + '20', borderColor: roleColor + '40' }]}>
                      <Text style={[styles.avatarText, { color: roleColor }]}>{ini}</Text>
                    </View>
                    <View style={styles.listInfo}>
                      <Text style={[styles.listName, isSelected && { color: Colors.gold }]} numberOfLines={1}>{u.nome}</Text>
                      <View style={[styles.rolePill, { backgroundColor: roleColor + '15' }]}>
                        <View style={[styles.roleDot, { backgroundColor: roleColor }]} />
                        <Text style={[styles.rolePillText, { color: roleColor }]}>{getRoleLabel(u.role, (u as any).genero)}</Text>
                      </View>
                      <View style={styles.miniBarWrap}>
                        <View style={styles.miniBarBg}>
                          <View style={[styles.miniBarFill, { width: `${pct}%` as any, backgroundColor: barColor }]} />
                        </View>
                        <Text style={[styles.miniBarLabel, { color: barColor }]}>{userOvCount}/{TOTAL_FEATURES}</Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          {/* Right panel */}
          <View style={[styles.rightPanel, isMobile && !selectedUserId ? { display: 'none' as const } : null]}>
            {isMobile && selectedUserId && (
              <TouchableOpacity onPress={() => { setSelectedUserId(null); setSaved(false); }} style={styles.mobileBackBtn}>
                <Ionicons name="arrow-back" size={20} color={Colors.text} />
                <Text style={styles.mobileBackText}>Utilizadores</Text>
              </TouchableOpacity>
            )}
            {!selectedUserId ? (
              <View style={styles.noSelection}>
                <MaterialCommunityIcons name="account-key" size={52} color={Colors.border} />
                <Text style={styles.noSelTitle}>Selecione um utilizador</Text>
                <Text style={styles.noSelSub}>Escolha um utilizador na lista para ver e editar as suas permissões individuais.</Text>
              </View>
            ) : (
              <>
                {/* User header */}
                {(() => {
                  const rc = ROLE_COLOR[selectedUser?.role ?? ''] || Colors.textMuted;
                  const pct = TOTAL_FEATURES > 0 ? (totalEnabled / TOTAL_FEATURES) * 100 : 0;
                  const barColor = pct >= 70 ? Colors.success : pct >= 40 ? Colors.warning : Colors.danger;
                  return (
                    <View style={styles.permHeader}>
                      <View style={[styles.permUserAvatar, { backgroundColor: rc + '20', borderColor: rc + '40' }]}>
                        <Text style={[styles.permUserInitials, { color: rc }]}>{initials(selectedUser?.nome ?? '')}</Text>
                      </View>
                      <View style={{ flex: 1, gap: 3 }}>
                        <Text style={styles.permUserName} numberOfLines={1}>{selectedUser?.nome}</Text>
                        <Text style={styles.permUserEmail} numberOfLines={1}>{selectedUser?.email}</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                          <View style={[styles.rolePill, { backgroundColor: rc + '15' }]}>
                            <View style={[styles.roleDot, { backgroundColor: rc }]} />
                            <Text style={[styles.rolePillText, { color: rc }]}>{getRoleLabel(selectedUser?.role ?? '', (selectedUser as any)?.genero)}</Text>
                          </View>
                        </View>
                      </View>
                      <View style={styles.progressBox}>
                        <Text style={[styles.progressNum, { color: barColor }]}>{totalEnabled}</Text>
                        <Text style={styles.progressDen}>/{TOTAL_FEATURES}</Text>
                        <Text style={styles.progressLbl}>{Math.round(pct)}% activas</Text>
                      </View>
                    </View>
                  );
                })()}

                {(() => {
                  const pct = TOTAL_FEATURES > 0 ? (totalEnabled / TOTAL_FEATURES) * 100 : 0;
                  const barColor = pct >= 70 ? Colors.success : pct >= 40 ? Colors.warning : Colors.danger;
                  return (
                    <View style={styles.progressBarBg}>
                      <View style={[styles.progressBarFill, { width: `${pct}%` as any, backgroundColor: barColor }]} />
                    </View>
                  );
                })()}

                {/* Quick actions */}
                <View style={styles.quickActions}>
                  {[
                    { icon: 'checkmark-done', label: 'Activar Tudo', color: Colors.success, onPress: enableAll, lib: 'ion' },
                    { icon: 'close-circle-outline', label: 'Desactivar', color: Colors.danger, onPress: disableAll, lib: 'ion' },
                    { icon: 'restore', label: 'Repor Padrão', color: Colors.info, onPress: handleReset, lib: 'mci' },
                    ...(canResetSenha ? [{ icon: 'key', label: 'Reset Senha', color: Colors.warning, onPress: () => { setResetModalVisible(true); setResetResult(null); setResetError(null); }, lib: 'ion' }] : []),
                    ...(Platform.OS === 'web' ? [{ icon: 'print', label: 'Imprimir', color: Colors.textMuted, onPress: () => imprimirFicha(), lib: 'ion' }] : []),
                  ].map(action => (
                    <TouchableOpacity key={action.label} style={styles.qBtn} onPress={action.onPress}>
                      {action.lib === 'mci'
                        ? <MaterialCommunityIcons name={action.icon as any} size={13} color={action.color} />
                        : <Ionicons name={action.icon as any} size={13} color={action.color} />}
                      <Text style={[styles.qBtnText, { color: action.color }]}>{action.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Vínculo do professor */}
                {selectedUser && PROFESSOR_ROLES.includes(selectedUser.role) && professorRecordId && (
                  <View style={styles.vinculoSection}>
                    <Text style={styles.vinculoTitle}>Tipo de Vínculo</Text>
                    <View style={styles.vinculoRow}>
                      {TIPO_CONTRATO.map(t => {
                        const isActive = selectedVinculo === t.id;
                        return (
                          <TouchableOpacity key={t.id} style={[styles.vinculoTag, isActive && { backgroundColor: `${t.color}22`, borderColor: t.color + '99' }]} onPress={() => { setSelectedVinculo(t.id); setSaved(false); }} activeOpacity={0.75}>
                            {isActive && <Ionicons name="checkmark-circle" size={12} color={t.color} />}
                            <Text style={[styles.vinculoTagText, isActive && { color: t.color, fontFamily: 'Inter_600SemiBold' }]}>{t.label}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                    <Text style={styles.vinculoHint}>Afecta o cálculo salarial. Guardado junto com as permissões.</Text>
                  </View>
                )}

                <View style={styles.permSearchBox}>
                  <StableSearchInput value={searchPerms} onChangeText={setSearchPerms} inputStyle={styles.permSearchInput} placeholder="Pesquisar permissão..." iconColor={Colors.textMuted} />
                </View>

                <ScrollView style={styles.catScroll} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: bottomInset + 80 }}>
                  {visibleCats.length === 0 && (
                    <View style={styles.noSearchResult}><Ionicons name="search" size={32} color={Colors.border} /><Text style={styles.noSearchResultText}>Nenhuma permissão encontrada para "{searchPerms}"</Text></View>
                  )}
                  {visibleCats.map(cat => {
                    const isExpanded = searchPerms.trim() ? true : expandedCats.has(cat.categoria);
                    const activeInCat = countActive(cat, editedPerms);
                    const catPct = cat.features.length > 0 ? Math.round((activeInCat / cat.features.length) * 100) : 0;
                    const badgeColor = activeInCat === cat.features.length ? Colors.success : activeInCat === 0 ? Colors.danger : Colors.warning;
                    return (
                      <View key={cat.categoria} style={styles.catCard}>
                        <TouchableOpacity style={styles.catHeader} onPress={() => toggleCategory(cat.categoria)} activeOpacity={0.75}>
                          <View style={[styles.catIconBox, { backgroundColor: Colors.gold + '18' }]}>
                            <Ionicons name={cat.icon as any} size={14} color={Colors.gold} />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.catTitle}>{cat.categoria}</Text>
                            <View style={styles.catMiniBarBg}>
                              <View style={[styles.catMiniBarFill, { width: `${catPct}%` as any, backgroundColor: badgeColor }]} />
                            </View>
                          </View>
                          <Text style={[styles.catBadgeText, { color: badgeColor }]}>{activeInCat}/{cat.features.length}</Text>
                          <Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={14} color={Colors.textMuted} />
                        </TouchableOpacity>
                        {isExpanded && cat.features.map((feat, idx) => {
                          const isOn = editedPerms[feat.key] === true;
                          const isRoleDefault = selectedUser ? feat.roles.includes(selectedUser.role) : false;
                          return (
                            <View key={feat.key} style={[styles.featRow, idx === cat.features.length - 1 && { borderBottomWidth: 0 }, isOn && styles.featRowActive]}>
                              <View style={styles.featInfo}>
                                <View style={styles.featLabelRow}>
                                  <View style={[styles.featStatusDot, { backgroundColor: isOn ? Colors.success : Colors.border }]} />
                                  <Text style={[styles.featLabel, !isOn && { color: Colors.textMuted }]}>{feat.label}</Text>
                                  {!isRoleDefault && <View style={styles.outOfRolePill}><Text style={styles.outOfRoleText}>fora do cargo</Text></View>}
                                </View>
                                <Text style={styles.featDesc} numberOfLines={1}>{feat.desc}</Text>
                              </View>
                              <Switch value={isOn} onValueChange={() => togglePerm(feat.key as PermKey)} trackColor={{ false: Colors.border, true: Colors.success + '55' }} thumbColor={isOn ? Colors.success : Colors.textMuted} />
                            </View>
                          );
                        })}
                      </View>
                    );
                  })}
                </ScrollView>

                <View style={styles.saveBar}>
                  {saved ? (
                    <View style={styles.savedConfirm}><Ionicons name="checkmark-circle" size={18} color={Colors.success} /><Text style={styles.savedText}>Permissões guardadas!</Text></View>
                  ) : (
                    <TouchableOpacity style={[styles.saveBtn, saving && { opacity: 0.6 }]} onPress={handleSave} disabled={saving}>
                      {saving ? <AppLoader size="small" color="#fff" /> : <Ionicons name="save" size={18} color="#fff" />}
                      <Text style={styles.saveBtnText}>{saving ? 'A guardar...' : 'Guardar Alterações'}</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </>
            )}
          </View>
        </View>
      )}

      {/* ══════════════════════════════════════════════════════════════
          TAB: PERFIS
      ══════════════════════════════════════════════════════════════ */}
      {activeTab === 'perfis' && (
        <View style={[styles.body, isMobile && styles.bodyMobile]}>
          {/* Left panel */}
          <View style={[styles.leftPanel, isMobile && (selectedRole ? { display: 'none' as const } : styles.leftPanelMobile)]}>
            <View style={styles.profilesHeader}>
              <Ionicons name="shield-half" size={18} color={Colors.gold} />
              <Text style={styles.profilesHeaderTitle}>Perfis de Cargo</Text>
            </View>
            <Text style={styles.profilesHeaderDesc}>Alterações aqui afectam automaticamente todos os utilizadores do cargo.</Text>
            <View style={styles.searchBox}>
              <StableSearchInput value={searchRole} onChangeText={setSearchRole} inputStyle={styles.searchInput} placeholder="Pesquisar cargo..." iconColor={Colors.textMuted} />
            </View>
            <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }}>
              {filteredRoles.length === 0 && <Text style={styles.emptyMsg}>Nenhum cargo encontrado</Text>}
              {filteredRoles.map(role => {
                const isSelected = role === selectedRole;
                const roleColor = ROLE_COLOR[role] || Colors.textMuted;
                const icon = ROLE_ICON[role] || 'person';
                const usersOfRole = users.filter(u => u.role === role);
                const roleDefaults = ROLE_DEFAULTS[role] || [];
                const defPct = TOTAL_FEATURES > 0 ? (roleDefaults.length / TOTAL_FEATURES) * 100 : 0;
                const defBarColor = defPct >= 70 ? Colors.success : defPct >= 30 ? Colors.warning : Colors.danger;
                return (
                  <TouchableOpacity key={role} style={[styles.listCard, isSelected && styles.listCardSelected]} onPress={() => { setSelectedRole(role); setSavedRole(false); }} activeOpacity={0.75}>
                    {isSelected && <View style={[styles.listCardAccent, { backgroundColor: roleColor }]} />}
                    <View style={[styles.roleIconBox, { backgroundColor: roleColor + '18', borderColor: roleColor + '35' }]}>
                      <Ionicons name={icon as any} size={18} color={roleColor} />
                    </View>
                    <View style={styles.listInfo}>
                      <Text style={[styles.listName, isSelected && { color: roleColor }]} numberOfLines={1}>{getRoleLabel(role, '')}</Text>
                      <Text style={styles.permCount}>{usersOfRole.length} membro{usersOfRole.length !== 1 ? 's' : ''}</Text>
                      <View style={styles.miniBarWrap}>
                        <View style={styles.miniBarBg}>
                          <View style={[styles.miniBarFill, { width: `${defPct}%` as any, backgroundColor: defBarColor }]} />
                        </View>
                        <Text style={[styles.miniBarLabel, { color: defBarColor }]}>{roleDefaults.length}/{TOTAL_FEATURES}</Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          {/* Right panel */}
          <View style={[styles.rightPanel, isMobile && !selectedRole ? { display: 'none' as const } : null]}>
            {isMobile && selectedRole && (
              <TouchableOpacity onPress={() => { setSelectedRole(null); setSavedRole(false); }} style={styles.mobileBackBtn}>
                <Ionicons name="arrow-back" size={20} color={Colors.text} />
                <Text style={styles.mobileBackText}>Perfis de Cargo</Text>
              </TouchableOpacity>
            )}
            {!selectedRole ? (
              <View style={styles.noSelection}>
                <MaterialCommunityIcons name="shield-account" size={52} color={Colors.border} />
                <Text style={styles.noSelTitle}>Selecione um perfil de cargo</Text>
                <Text style={styles.noSelSub}>Escolha um cargo na lista. As permissões definidas aqui aplicam-se a todos os utilizadores desse cargo.</Text>
              </View>
            ) : (
              <>
                <View style={styles.permHeader}>
                  <View style={[styles.permUserAvatar, { backgroundColor: (ROLE_COLOR[selectedRole] || Colors.textMuted) + '18', borderColor: (ROLE_COLOR[selectedRole] || Colors.textMuted) + '40' }]}>
                    <Ionicons name={(ROLE_ICON[selectedRole] || 'person') as any} size={22} color={ROLE_COLOR[selectedRole] || Colors.textMuted} />
                  </View>
                  <View style={{ flex: 1, gap: 3 }}>
                    <Text style={styles.permUserName}>{getRoleLabel(selectedRole, '')}</Text>
                    <Text style={styles.permUserEmail}>{users.filter(u => u.role === selectedRole).length} membro(s) afectados</Text>
                    <View style={[styles.rolePill, { backgroundColor: (ROLE_COLOR[selectedRole] || Colors.textMuted) + '15', alignSelf: 'flex-start' }]}>
                      <View style={[styles.roleDot, { backgroundColor: ROLE_COLOR[selectedRole] || Colors.textMuted }]} />
                      <Text style={[styles.rolePillText, { color: ROLE_COLOR[selectedRole] || Colors.textMuted }]}>Perfil de Cargo</Text>
                    </View>
                  </View>
                  <View style={styles.progressBox}>
                    <Text style={[styles.progressNum, { color: totalRoleEnabled > TOTAL_FEATURES * 0.7 ? Colors.success : totalRoleEnabled > TOTAL_FEATURES * 0.4 ? Colors.warning : Colors.danger }]}>{totalRoleEnabled}</Text>
                    <Text style={styles.progressDen}>/{TOTAL_FEATURES}</Text>
                    <Text style={styles.progressLbl}>activas</Text>
                  </View>
                </View>

                <View style={styles.infoBanner}>
                  <Ionicons name="information-circle" size={16} color={Colors.info} />
                  <Text style={styles.infoBannerText}>Estas permissões aplicam-se a todos os <Text style={{ fontFamily: 'Inter_700Bold' }}>{getRoleLabel(selectedRole, '')}</Text> que não tenham configuração individual.</Text>
                </View>

                <View style={styles.progressBarBg}>
                  <View style={[styles.progressBarFill, { width: `${(totalRoleEnabled / TOTAL_FEATURES) * 100}%` as any, backgroundColor: totalRoleEnabled > TOTAL_FEATURES * 0.7 ? Colors.success : totalRoleEnabled > TOTAL_FEATURES * 0.4 ? Colors.warning : Colors.danger }]} />
                </View>

                <View style={styles.quickActions}>
                  <TouchableOpacity style={styles.qBtn} onPress={enableAllRole}><Ionicons name="checkmark-done" size={14} color={Colors.success} /><Text style={[styles.qBtnText, { color: Colors.success }]}>Activar Tudo</Text></TouchableOpacity>
                  <TouchableOpacity style={styles.qBtn} onPress={disableAllRole}><Ionicons name="close-circle-outline" size={14} color={Colors.danger} /><Text style={[styles.qBtnText, { color: Colors.danger }]}>Desactivar Tudo</Text></TouchableOpacity>
                  <TouchableOpacity style={styles.qBtn} onPress={handleResetRole}><MaterialCommunityIcons name="restore" size={14} color={Colors.info} /><Text style={[styles.qBtnText, { color: Colors.info }]}>Repor Padrão</Text></TouchableOpacity>
                </View>

                <View style={styles.permSearchBox}>
                  <StableSearchInput value={searchRolePerms} onChangeText={setSearchRolePerms} inputStyle={styles.permSearchInput} placeholder="Pesquisar permissão..." iconColor={Colors.textMuted} />
                </View>

                <ScrollView style={styles.catScroll} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: bottomInset + 80 }}>
                  {visibleRoleCats.length === 0 && (
                    <View style={styles.noSearchResult}><Ionicons name="search" size={32} color={Colors.border} /><Text style={styles.noSearchResultText}>Nenhuma permissão encontrada para "{searchRolePerms}"</Text></View>
                  )}
                  {visibleRoleCats.map(cat => {
                    const isExpanded = searchRolePerms.trim() ? true : expandedRoleCats.has(cat.categoria);
                    const activeInCat = countActive(cat, editedRolePerms);
                    const catPct = cat.features.length > 0 ? Math.round((activeInCat / cat.features.length) * 100) : 0;
                    const badgeColor = activeInCat === cat.features.length ? Colors.success : activeInCat === 0 ? Colors.danger : Colors.warning;
                    return (
                      <View key={cat.categoria} style={styles.catCard}>
                        <TouchableOpacity style={styles.catHeader} onPress={() => toggleRoleCategory(cat.categoria)} activeOpacity={0.75}>
                          <View style={[styles.catIconBox, { backgroundColor: Colors.gold + '18' }]}>
                            <Ionicons name={cat.icon as any} size={14} color={Colors.gold} />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.catTitle}>{cat.categoria}</Text>
                            <View style={styles.catMiniBarBg}>
                              <View style={[styles.catMiniBarFill, { width: `${catPct}%` as any, backgroundColor: badgeColor }]} />
                            </View>
                          </View>
                          <Text style={[styles.catBadgeText, { color: badgeColor }]}>{activeInCat}/{cat.features.length}</Text>
                          <Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={14} color={Colors.textMuted} />
                        </TouchableOpacity>
                        {isExpanded && cat.features.map((feat, idx) => {
                          const isOn = editedRolePerms[feat.key] === true;
                          const isRoleDefault = feat.roles.includes(selectedRole);
                          return (
                            <View key={feat.key} style={[styles.featRow, idx === cat.features.length - 1 && { borderBottomWidth: 0 }, isOn && styles.featRowActive]}>
                              <View style={styles.featInfo}>
                                <View style={styles.featLabelRow}>
                                  <View style={[styles.featStatusDot, { backgroundColor: isOn ? Colors.success : Colors.border }]} />
                                  <Text style={[styles.featLabel, !isOn && { color: Colors.textMuted }]}>{feat.label}</Text>
                                  {!isRoleDefault && <View style={styles.outOfRolePill}><Text style={styles.outOfRoleText}>fora do cargo</Text></View>}
                                </View>
                                <Text style={styles.featDesc} numberOfLines={1}>{feat.desc}</Text>
                              </View>
                              <Switch value={isOn} onValueChange={() => toggleRolePerm(feat.key as PermKey)} trackColor={{ false: Colors.border, true: Colors.success + '55' }} thumbColor={isOn ? Colors.success : Colors.textMuted} />
                            </View>
                          );
                        })}
                      </View>
                    );
                  })}
                </ScrollView>

                <View style={styles.saveBar}>
                  {savedRole ? (
                    <View style={styles.savedConfirm}><Ionicons name="checkmark-circle" size={18} color={Colors.success} /><Text style={styles.savedText}>Perfil guardado! Todos os {getRoleLabel(selectedRole, '')} foram actualizados.</Text></View>
                  ) : (
                    <TouchableOpacity style={[styles.saveBtn, savingRole && { opacity: 0.6 }]} onPress={handleSaveRole} disabled={savingRole}>
                      {savingRole ? <AppLoader size="small" color="#fff" /> : <Ionicons name="save" size={18} color="#fff" />}
                      <Text style={styles.saveBtnText}>{savingRole ? 'A guardar...' : `Guardar Perfil — ${getRoleLabel(selectedRole, '')}`}</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </>
            )}
          </View>
        </View>
      )}

      {/* ══════════════════════════════════════════════════════════════
          TAB: PEDIDOS DE ABERTURA DE AVALIAÇÃO
      ══════════════════════════════════════════════════════════════ */}
      {activeTab === 'pedidos' && (
        <View style={{ flex: 1 }}>
          {/* Header + filtro */}
          <View style={styles.pedidosHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.pedidosTitle}>Pedidos de Autorização de Lançamento</Text>
              <Text style={styles.pedidosSub}>Professores aguardam aprovação para introduzir notas</Text>
            </View>
            <TouchableOpacity style={styles.pedidosRefresh} onPress={fetchPedidosAbertura}>
              <Ionicons name="refresh" size={16} color={Colors.gold} />
            </TouchableOpacity>
          </View>

          {/* Filtro de estado */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 8, gap: 6, flexDirection: 'row' }}>
            {(['pendente', 'todas', 'aprovada', 'rejeitada'] as const).map(f => {
              const isAct = pedidosFiltro === f;
              const count = f === 'todas' ? pedidosAbertura.length : pedidosAbertura.filter(p => p.status === f).length;
              const col = f === 'pendente' ? Colors.warning : f === 'aprovada' ? Colors.success : f === 'rejeitada' ? Colors.danger : Colors.textMuted;
              return (
                <TouchableOpacity key={f} onPress={() => setPedidosFiltro(f)}
                  style={[styles.pedidoFiltroChip, isAct && { backgroundColor: col + '20', borderColor: col }]}>
                  <Text style={[styles.pedidoFiltroTxt, isAct && { color: col, fontFamily: 'Inter_700Bold' }]}>
                    {f === 'pendente' ? 'Pendentes' : f === 'aprovada' ? 'Aprovados' : f === 'rejeitada' ? 'Rejeitados' : 'Todos'}
                  </Text>
                  <View style={[styles.pedidoFiltroBadge, { backgroundColor: isAct ? col : Colors.border }]}>
                    <Text style={[styles.pedidoFiltroBadgeTxt, isAct && { color: '#fff' }]}>{count}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Lista */}
          {pedidosLoading ? (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
              <AppLoader size="small" color={Colors.gold} />
            </View>
          ) : pedidosFiltrados.length === 0 ? (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, opacity: 0.55 }}>
              <Ionicons name="mail-open-outline" size={40} color={Colors.textMuted} />
              <Text style={{ fontSize: 14, color: Colors.textMuted, fontFamily: 'Inter_400Regular' }}>
                {pedidosFiltro === 'pendente' ? 'Nenhum pedido pendente' : 'Sem pedidos nesta categoria'}
              </Text>
            </View>
          ) : (
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 12, gap: 10 }}>
              {pedidosFiltrados.map(p => {
                const isPend = p.status === 'pendente';
                const isAprov = p.status === 'aprovada';
                const stColor = isPend ? Colors.warning : isAprov ? Colors.success : Colors.danger;
                const stLabel = isPend ? 'Pendente' : isAprov ? 'Aprovado' : 'Rejeitado';
                const stIcon  = isPend ? 'time-outline' : isAprov ? 'checkmark-circle' : 'close-circle';
                const avalLabel = AVAL_LABEL[p.avaliacao] ?? p.avaliacao;
                return (
                  <View key={p.id} style={[styles.pedidoCard, { borderLeftColor: stColor }]}>
                    <View style={styles.pedidoCardTop}>
                      <View style={styles.pedidoCardBadge}>
                        <Text style={styles.pedidoCardBadgeTxt}>{avalLabel}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.pedidoCardProf}>{p.professorNome ?? 'Professor'}</Text>
                        <Text style={styles.pedidoCardMeta}>
                          {p.disciplina} · {p.turmaNome ?? 'Turma'} · {p.trimestre}º Trim.
                        </Text>
                      </View>
                      <View style={[styles.pedidoCardStatus, { backgroundColor: stColor + '18' }]}>
                        <Ionicons name={stIcon as any} size={11} color={stColor} />
                        <Text style={[styles.pedidoCardStatusTxt, { color: stColor }]}>{stLabel}</Text>
                      </View>
                    </View>

                    <View style={styles.pedidoCardBody}>
                      <Text style={styles.pedidoCardMotivoLabel}>Motivo:</Text>
                      <Text style={styles.pedidoCardMotivo}>{p.motivo}</Text>
                    </View>

                    <View style={styles.pedidoCardFooter}>
                      <Text style={styles.pedidoCardDate}>
                        {new Date(p.criadoEm).toLocaleDateString('pt-AO', { day: '2-digit', month: 'short', year: 'numeric' })}
                        {p.respondidoEm ? ` · Resp: ${new Date(p.respondidoEm).toLocaleDateString('pt-AO', { day: '2-digit', month: 'short' })}` : ''}
                      </Text>
                      {isPend && (
                        <TouchableOpacity style={styles.pedidoCardAction}
                          onPress={() => { setRespObservacao(''); setRespModal(p); }}>
                          <Ionicons name="checkmark-done" size={13} color={Colors.gold} />
                          <Text style={styles.pedidoCardActionTxt}>Responder</Text>
                        </TouchableOpacity>
                      )}
                      {!isPend && p.observacao && (
                        <Text style={[styles.pedidoCardDate, { color: stColor, fontFamily: 'Inter_500Medium' }]} numberOfLines={1}>
                          Obs: {p.observacao}
                        </Text>
                      )}
                    </View>
                  </View>
                );
              })}
            </ScrollView>
          )}
        </View>
      )}

      {/* ── Modal: Responder Pedido de Abertura ─────────────────────────────── */}
      <Modal visible={!!respModal} transparent animationType="fade" onRequestClose={() => setRespModal(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.respModal}>
            <View style={styles.respModalHeader}>
              <Ionicons name="mail-open-outline" size={20} color={Colors.gold} />
              <Text style={styles.respModalTitle}>Responder Pedido</Text>
              <TouchableOpacity onPress={() => setRespModal(null)} style={{ marginLeft: 'auto' as any }}>
                <Ionicons name="close" size={20} color={Colors.textMuted} />
              </TouchableOpacity>
            </View>
            {respModal && (
              <>
                <View style={styles.respModalInfo}>
                  <Text style={styles.respModalProf}>{respModal.professorNome ?? 'Professor'}</Text>
                  <Text style={styles.respModalMeta}>
                    {AVAL_LABEL[respModal.avaliacao] ?? respModal.avaliacao} · {respModal.disciplina} · {respModal.turmaNome ?? 'Turma'} · {respModal.trimestre}º Trim.
                  </Text>
                  <View style={{ marginTop: 10, backgroundColor: Colors.backgroundElevated, borderRadius: 8, padding: 10, borderLeftWidth: 3, borderLeftColor: Colors.gold }}>
                    <Text style={{ fontSize: 11, color: Colors.textMuted, fontFamily: 'Inter_600SemiBold', marginBottom: 3 }}>MOTIVO DO PEDIDO</Text>
                    <Text style={{ fontSize: 13, color: Colors.text, fontFamily: 'Inter_400Regular' }}>{respModal.motivo}</Text>
                  </View>
                </View>
                <Text style={styles.respModalLabel}>Observação (opcional)</Text>
                <TextInput
                  style={styles.respModalInput}
                  placeholder="Adicione um comentário para o professor..."
                  placeholderTextColor={Colors.textMuted}
                  value={respObservacao}
                  onChangeText={setRespObservacao}
                  multiline numberOfLines={2} textAlignVertical="top"
                  {...(Platform.OS === 'web' ? { outlineWidth: 0 } as any : {})}
                />
                <View style={styles.respModalBtns}>
                  <TouchableOpacity style={[styles.respModalBtnRejeitar, respSaving && { opacity: 0.6 }]}
                    onPress={() => responderPedido('rejeitada')} disabled={respSaving}>
                    <Ionicons name="close-circle" size={14} color={Colors.danger} />
                    <Text style={styles.respModalBtnRejeitarTxt}>Rejeitar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.respModalBtnAprovar, respSaving && { opacity: 0.6 }]}
                    onPress={() => responderPedido('aprovada')} disabled={respSaving}>
                    {respSaving
                      ? <AppLoader size="small" color="#fff" />
                      : <><Ionicons name="checkmark-circle" size={14} color="#fff" /><Text style={styles.respModalBtnAprovarTxt}>Aprovar</Text></>}
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* ══════════════════════════════════════════════════════════════
          MODAL: RESET DE SENHA
      ══════════════════════════════════════════════════════════════ */}
      <Modal visible={resetModalVisible} transparent animationType="fade" onRequestClose={() => setResetModalVisible(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <View style={styles.modalOverlay}>
            <View style={styles.resetModal}>
              <View style={styles.resetModalHeader}>
                <View style={styles.resetModalIconBox}><Ionicons name="key" size={22} color={Colors.warning} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.resetModalTitle}>Redefinir Senha</Text>
                  {selectedUser && <Text style={styles.resetModalSubtitle} numberOfLines={1}>{selectedUser.nome}</Text>}
                </View>
                <TouchableOpacity onPress={() => setResetModalVisible(false)}><Ionicons name="close" size={22} color={Colors.textMuted} /></TouchableOpacity>
              </View>
              {!resetResult ? (
                <>
                  <View style={styles.resetWarningBox}>
                    <Ionicons name="warning" size={16} color={Colors.warning} />
                    <Text style={styles.resetWarningText}>Isto vai gerar uma senha temporária e invalidar imediatamente a senha actual deste utilizador. Comunique a nova senha ao utilizador pessoalmente ou por canal seguro.</Text>
                  </View>
                  {resetError && (<View style={styles.resetErrorBox}><Ionicons name="alert-circle" size={14} color={Colors.danger} /><Text style={styles.resetErrorText}>{resetError}</Text></View>)}
                  <View style={styles.resetModalActions}>
                    <TouchableOpacity style={styles.resetCancelBtn} onPress={() => setResetModalVisible(false)}><Text style={styles.resetCancelText}>Cancelar</Text></TouchableOpacity>
                    <TouchableOpacity style={[styles.resetConfirmBtn, resetLoading && { opacity: 0.6 }]} onPress={handleResetPassword} disabled={resetLoading}>
                      {resetLoading ? <AppLoader size="small" color="#fff" /> : <Ionicons name="key" size={16} color="#fff" />}
                      <Text style={styles.resetConfirmText}>{resetLoading ? 'A redefinir...' : 'Confirmar Reset'}</Text>
                    </TouchableOpacity>
                  </View>
                </>
              ) : (
                <>
                  <View style={styles.resetSuccessBox}><Ionicons name="checkmark-circle" size={18} color={Colors.success} /><Text style={styles.resetSuccessText}>Senha redefinida com sucesso para <Text style={{ fontFamily: 'Inter_700Bold' }}>{resetResult.userNome}</Text></Text></View>
                  <Text style={styles.resetTempLabel}>Senha Temporária</Text>
                  <View style={styles.resetTempBox}>
                    <Text style={styles.resetTempPassword} selectable>{resetResult.tempPassword}</Text>
                    <TouchableOpacity style={styles.copyBtn} onPress={handleCopyPassword}><Ionicons name={copied ? 'checkmark' : 'copy-outline'} size={18} color={copied ? Colors.success : Colors.gold} /><Text style={[styles.copyBtnText, copied && { color: Colors.success }]}>{copied ? 'Copiado!' : 'Copiar'}</Text></TouchableOpacity>
                  </View>
                  <View style={styles.resetNoteBox}><Ionicons name="information-circle" size={14} color={Colors.info} /><Text style={styles.resetNoteText}>Comunique esta senha ao utilizador. Recomende que a altere no perfil após o primeiro acesso.</Text></View>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    {Platform.OS === 'web' && (
                      <TouchableOpacity style={[styles.resetDoneBtn, { flex: 1, backgroundColor: Colors.gold, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }]} onPress={() => imprimirFicha({ tempPassword: resetResult.tempPassword })}>
                        <Ionicons name="print" size={15} color="#000" /><Text style={[styles.resetDoneText, { color: '#000' }]}>Imprimir Ficha</Text>
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity style={[styles.resetDoneBtn, { flex: 1 }]} onPress={() => { setResetModalVisible(false); setResetResult(null); }}><Text style={styles.resetDoneText}>Fechar</Text></TouchableOpacity>
                  </View>
                </>
              )}
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ══════════════════════════════════════════════════════════════
          MODAL: ATRIBUIÇÃO DE UTILIZADORES A FUNCIONALIDADE
      ══════════════════════════════════════════════════════════════ */}
      <Modal visible={featureModalVisible} transparent animationType="slide" onRequestClose={() => setFeatureModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.featModal, isMobile && styles.featModalMobile]}>
            {/* Header */}
            <View style={styles.featModalHeader}>
              <View style={styles.featModalIconBox}>
                <Ionicons name="key" size={18} color={Colors.gold} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.featModalTitle} numberOfLines={1}>{selectedFeature?.label}</Text>
                <Text style={styles.featModalDesc} numberOfLines={2}>{selectedFeature?.desc}</Text>
              </View>
              <TouchableOpacity onPress={() => setFeatureModalVisible(false)} style={{ padding: 4 }}>
                <Ionicons name="close" size={22} color={Colors.textMuted} />
              </TouchableOpacity>
            </View>

            {/* Default roles */}
            {selectedFeature && selectedFeature.roles.length > 0 && (
              <View style={styles.featModalRoles}>
                <Text style={styles.featModalRolesLabel}>Perfis com acesso por defeito:</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 6 }}>
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    {selectedFeature.roles.map(role => (
                      <View key={role} style={[styles.featRolePill, { backgroundColor: (ROLE_COLOR[role] || Colors.textMuted) + '20', borderColor: (ROLE_COLOR[role] || Colors.textMuted) + '50' }]}>
                        <Text style={[styles.featRolePillText, { color: ROLE_COLOR[role] || Colors.textMuted }]}>
                          {getRoleLabel(role, '')}
                        </Text>
                      </View>
                    ))}
                  </View>
                </ScrollView>
              </View>
            )}

            {/* Divider + stats */}
            <View style={styles.featModalStats}>
              <View style={styles.featModalStatItem}>
                <Text style={[styles.featModalStatNum, { color: Colors.success }]}>{featureModalUsers.withAccess.length}</Text>
                <Text style={styles.featModalStatLabel}>Com acesso</Text>
              </View>
              <View style={styles.featModalStatDivider} />
              <View style={styles.featModalStatItem}>
                <Text style={[styles.featModalStatNum, { color: Colors.textMuted }]}>{featureModalUsers.withoutAccess.length}</Text>
                <Text style={styles.featModalStatLabel}>Sem acesso</Text>
              </View>
              <View style={styles.featModalStatDivider} />
              <View style={styles.featModalStatItem}>
                <Text style={[styles.featModalStatNum, { color: featureChangesCount > 0 ? Colors.warning : Colors.textMuted }]}>{featureChangesCount}</Text>
                <Text style={styles.featModalStatLabel}>Alteração(ões)</Text>
              </View>
            </View>

            {/* Search */}
            <View style={styles.featModalSearch}>
              <StableSearchInput
                value={featureSearchUser}
                onChangeText={setFeatureSearchUser}
                inputStyle={styles.featSearchInputSm}
                placeholder="Pesquisar utilizador..."
                iconColor={Colors.textMuted}
              />
            </View>

            {/* User list */}
            <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
              {featureModalUsers.withAccess.length === 0 && featureModalUsers.withoutAccess.length === 0 && (
                <View style={styles.noSearchResult}><Ionicons name="search" size={28} color={Colors.border} /><Text style={styles.noSearchResultText}>Nenhum utilizador encontrado</Text></View>
              )}

              {/* Com acesso */}
              {featureModalUsers.withAccess.length > 0 && (
                <>
                  <View style={styles.featUserSection}>
                    <View style={[styles.featUserSectionDot, { backgroundColor: Colors.success }]} />
                    <Text style={styles.featUserSectionLabel}>COM ACESSO ({featureModalUsers.withAccess.length})</Text>
                  </View>
                  {featureModalUsers.withAccess.map(u => {
                    const roleColor = ROLE_COLOR[u.role] || Colors.textMuted;
                    const changed = featureUserPerms[u.id] !== featureOrigPerms[u.id];
                    return (
                      <View key={u.id} style={[styles.featUserRow, changed && styles.featUserRowChanged]}>
                        <View style={[styles.featUserAvatar, { backgroundColor: roleColor + '22' }]}>
                          <Text style={[styles.featUserAvatarText, { color: roleColor }]}>{initials(u.nome)}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.featUserName} numberOfLines={1}>{u.nome}</Text>
                          <View style={[styles.rolePill, { backgroundColor: roleColor + '18', alignSelf: 'flex-start' }]}>
                            <Text style={[styles.rolePillText, { color: roleColor }]}>{getRoleLabel(u.role, (u as any).genero)}</Text>
                          </View>
                        </View>
                        {changed && <View style={styles.featChangedDot} />}
                        <Switch
                          value={featureUserPerms[u.id] ?? false}
                          onValueChange={() => toggleFeatureUser(u.id)}
                          trackColor={{ false: Colors.border, true: Colors.success + '66' }}
                          thumbColor={featureUserPerms[u.id] ? Colors.success : Colors.textMuted}
                        />
                      </View>
                    );
                  })}
                </>
              )}

              {/* Sem acesso */}
              {featureModalUsers.withoutAccess.length > 0 && (
                <>
                  <View style={styles.featUserSection}>
                    <View style={[styles.featUserSectionDot, { backgroundColor: Colors.border }]} />
                    <Text style={[styles.featUserSectionLabel, { color: Colors.textMuted }]}>SEM ACESSO ({featureModalUsers.withoutAccess.length})</Text>
                  </View>
                  {featureModalUsers.withoutAccess.map(u => {
                    const roleColor = ROLE_COLOR[u.role] || Colors.textMuted;
                    const changed = featureUserPerms[u.id] !== featureOrigPerms[u.id];
                    return (
                      <View key={u.id} style={[styles.featUserRow, changed && styles.featUserRowChanged]}>
                        <View style={[styles.featUserAvatar, { backgroundColor: roleColor + '15' }]}>
                          <Text style={[styles.featUserAvatarText, { color: roleColor + 'AA' }]}>{initials(u.nome)}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.featUserName, { color: Colors.textMuted }]} numberOfLines={1}>{u.nome}</Text>
                          <View style={[styles.rolePill, { backgroundColor: roleColor + '12', alignSelf: 'flex-start' }]}>
                            <Text style={[styles.rolePillText, { color: roleColor + 'AA' }]}>{getRoleLabel(u.role, (u as any).genero)}</Text>
                          </View>
                        </View>
                        {changed && <View style={[styles.featChangedDot, { backgroundColor: Colors.warning }]} />}
                        <Switch
                          value={featureUserPerms[u.id] ?? false}
                          onValueChange={() => toggleFeatureUser(u.id)}
                          trackColor={{ false: Colors.border, true: Colors.success + '66' }}
                          thumbColor={featureUserPerms[u.id] ? Colors.success : Colors.textMuted}
                        />
                      </View>
                    );
                  })}
                </>
              )}
              <View style={{ height: 16 }} />
            </ScrollView>

            {/* Footer */}
            <View style={styles.featModalFooter}>
              <TouchableOpacity style={styles.featModalCancelBtn} onPress={() => setFeatureModalVisible(false)}>
                <Text style={styles.featModalCancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveBtn, { flex: 1 }, (featureSaving || featureChangesCount === 0) && { opacity: 0.45 }]}
                onPress={handleSaveFeaturePerms}
                disabled={featureSaving || featureChangesCount === 0}
              >
                {featureSaving ? <AppLoader size="small" color="#fff" /> : <Ionicons name="save" size={16} color="#fff" />}
                <Text style={styles.saveBtnText}>
                  {featureSaving ? 'A guardar...' : featureChangesCount > 0 ? `Guardar (${featureChangesCount})` : 'Sem alterações'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ─── StyleSheet ───────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  // ── Tab bar (compact underline style) ────────────────────────────────────
  tabBar: { flexDirection: 'row', backgroundColor: Colors.backgroundCard, borderBottomWidth: 1, borderBottomColor: Colors.border },
  tabItem: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingHorizontal: 10, paddingVertical: 11, borderBottomWidth: 2.5, borderBottomColor: 'transparent' },
  tabItemLabel: { fontSize: 13, fontFamily: 'Inter_700Bold', color: Colors.textMuted },
  tabItemBadge: { backgroundColor: Colors.surface, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  tabItemBadgeText: { fontSize: 10, fontFamily: 'Inter_600SemiBold', color: Colors.textMuted },

  // ── Loading banner ────────────────────────────────────────────────────────
  loadingBanner: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 8, backgroundColor: Colors.gold + '0C', borderBottomWidth: 1, borderBottomColor: Colors.gold + '28' },
  loadingBannerText: { fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textMuted },

  // ── Layout ────────────────────────────────────────────────────────────────
  body: { flex: 1, flexDirection: 'row' },
  bodyMobile: { flexDirection: 'column' },
  leftPanel: { width: 268, borderRightWidth: 1, borderRightColor: Colors.border, backgroundColor: Colors.backgroundCard },
  leftPanelMobile: { width: '100%', borderRightWidth: 0, flex: 1 },
  rightPanel: { flex: 1, backgroundColor: Colors.background },

  // ── Profiles header (left panel) ─────────────────────────────────────────
  profilesHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingTop: 12, paddingBottom: 2 },
  profilesHeaderTitle: { fontSize: 13, fontFamily: 'Inter_700Bold', color: Colors.text },
  profilesHeaderDesc: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted, paddingHorizontal: 14, paddingBottom: 6, lineHeight: 15 },

  // ── Search ────────────────────────────────────────────────────────────────
  searchBox: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 10, marginVertical: 8, backgroundColor: Colors.surface, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7, borderWidth: 1, borderColor: Colors.border },
  searchInput: { flex: 1, fontSize: 13, fontFamily: 'Inter_400Regular', color: Colors.text, padding: 0 },

  // ── List cards (user & role lists in left panel) ──────────────────────────
  listCard: { position: 'relative', flexDirection: 'row', alignItems: 'center', gap: 9, paddingLeft: 16, paddingRight: 12, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: Colors.border },
  listCardSelected: { backgroundColor: Colors.gold + '08' },
  listCardAccent: { position: 'absolute', left: 0, top: 6, bottom: 6, width: 3, borderRadius: 99 },
  avatarBox: { width: 38, height: 38, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  avatarText: { fontSize: 13, fontFamily: 'Inter_700Bold' },
  roleIconBox: { width: 36, height: 36, borderRadius: 9, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  listInfo: { flex: 1, gap: 2 },
  listName: { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: Colors.text },
  permCount: { fontSize: 10, fontFamily: 'Inter_400Regular', color: Colors.textMuted },
  rolePill: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 99, paddingHorizontal: 7, paddingVertical: 2, alignSelf: 'flex-start' },
  roleDot: { width: 5, height: 5, borderRadius: 99 },
  rolePillText: { fontSize: 10, fontFamily: 'Inter_600SemiBold' },

  // Mini progress bar (in list cards)
  miniBarWrap: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 },
  miniBarBg: { flex: 1, height: 3, backgroundColor: Colors.border, borderRadius: 99, overflow: 'hidden' },
  miniBarFill: { height: 3, borderRadius: 99 },
  miniBarLabel: { fontSize: 10, fontFamily: 'Inter_700Bold', minWidth: 30, textAlign: 'right' },

  // ── Empty / no results ────────────────────────────────────────────────────
  noSelection: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 40 },
  noSelTitle: { fontSize: 17, fontFamily: 'Inter_700Bold', color: Colors.text, textAlign: 'center' },
  noSelSub: { fontSize: 13, fontFamily: 'Inter_400Regular', color: Colors.textMuted, textAlign: 'center', lineHeight: 20 },
  noAccess: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 40 },
  noAccessTitle: { fontSize: 17, fontFamily: 'Inter_700Bold', color: Colors.text },
  noAccessSub: { fontSize: 13, fontFamily: 'Inter_400Regular', color: Colors.textMuted, textAlign: 'center' },
  emptyMsg: { fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textMuted, textAlign: 'center', padding: 16 },
  noSearchResult: { alignItems: 'center', justifyContent: 'center', gap: 8, padding: 32 },
  noSearchResultText: { fontSize: 13, fontFamily: 'Inter_400Regular', color: Colors.textMuted, textAlign: 'center' },

  // ── Permission header (right panel) ──────────────────────────────────────
  permHeader: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.border, backgroundColor: Colors.backgroundCard },
  permUserAvatar: { width: 46, height: 46, borderRadius: 12, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  permUserInitials: { fontSize: 17, fontFamily: 'Inter_800ExtraBold' },
  permUserName: { fontSize: 14, fontFamily: 'Inter_700Bold', color: Colors.text },
  permUserEmail: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted },

  // Progress counter (top-right of perm header)
  progressBox: { alignItems: 'center', paddingLeft: 8, borderLeftWidth: 1, borderLeftColor: Colors.border },
  progressNum: { fontSize: 22, fontFamily: 'Inter_800ExtraBold' },
  progressDen: { fontSize: 10, fontFamily: 'Inter_400Regular', color: Colors.textMuted },
  progressLbl: { fontSize: 9, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 1 },
  progressBarBg: { height: 2, backgroundColor: Colors.border, marginHorizontal: 14, marginTop: 0, borderRadius: 99 },
  progressBarFill: { height: 2, borderRadius: 99 },

  // Info banner
  infoBanner: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginHorizontal: 14, marginTop: 8, padding: 10, backgroundColor: Colors.info + '10', borderRadius: 8, borderWidth: 1, borderColor: Colors.info + '28' },
  infoBannerText: { flex: 1, fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.text, lineHeight: 16 },

  // ── Quick actions strip ───────────────────────────────────────────────────
  quickActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.border, backgroundColor: Colors.backgroundCard },
  qBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.surface, borderRadius: 6, paddingHorizontal: 9, paddingVertical: 5, borderWidth: 1, borderColor: Colors.border },
  qBtnText: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },

  // ── Vínculo section ───────────────────────────────────────────────────────
  vinculoSection: { marginHorizontal: 14, marginTop: 8, marginBottom: 0, padding: 10, backgroundColor: Colors.backgroundCard, borderRadius: 10, borderWidth: 1, borderColor: Colors.border },
  vinculoTitle: { fontSize: 11, fontFamily: 'Inter_700Bold', color: Colors.text, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  vinculoRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 5 },
  vinculoTag: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 7, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface },
  vinculoTagText: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted },
  vinculoHint: { fontSize: 10, fontFamily: 'Inter_400Regular', color: Colors.textMuted, fontStyle: 'italic' },

  // ── Perm search ───────────────────────────────────────────────────────────
  permSearchBox: { marginHorizontal: 14, marginVertical: 6, backgroundColor: Colors.surface, borderRadius: 8, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 10, paddingVertical: 7 },
  permSearchInput: { flex: 1, fontSize: 13, fontFamily: 'Inter_400Regular', color: Colors.text, padding: 0 },
  catScroll: { flex: 1 },

  // ── Category cards ────────────────────────────────────────────────────────
  catCard: { marginHorizontal: 12, marginBottom: 8, backgroundColor: Colors.backgroundCard, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden' },
  catHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, paddingVertical: 9 },
  catIconBox: { width: 26, height: 26, borderRadius: 7, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  catTitle: { fontSize: 12, fontFamily: 'Inter_700Bold', color: Colors.text, marginBottom: 3 },
  catBadge: { backgroundColor: Colors.surface, borderRadius: 5, paddingHorizontal: 7, paddingVertical: 2 },
  catBadgeText: { fontSize: 11, fontFamily: 'Inter_700Bold' },
  catMiniBarBg: { height: 2, backgroundColor: Colors.border, borderRadius: 99, overflow: 'hidden', marginTop: 2 },
  catMiniBarFill: { height: 2, borderRadius: 99 },

  // ── Feature rows (inside expandable category card) ────────────────────────
  featRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 44, paddingRight: 12, paddingVertical: 9, borderTopWidth: 1, borderTopColor: Colors.border },
  featRowActive: { backgroundColor: Colors.success + '05' },
  featInfo: { flex: 1 },
  featLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'wrap' },
  featStatusDot: { width: 6, height: 6, borderRadius: 99, flexShrink: 0 },
  featLabel: { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: Colors.text },
  featDesc: { fontSize: 10, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 1 },
  outOfRolePill: { backgroundColor: Colors.warning + '18', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 },
  outOfRoleText: { fontSize: 9, fontFamily: 'Inter_600SemiBold', color: Colors.warning },

  // ── Save bar ──────────────────────────────────────────────────────────────
  saveBar: { paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: 1, borderTopColor: Colors.border, backgroundColor: Colors.backgroundCard },
  saveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: Colors.gold, borderRadius: 10, paddingVertical: 12, paddingHorizontal: 20 },
  saveBtnText: { fontSize: 14, fontFamily: 'Inter_700Bold', color: Colors.dark },
  savedConfirm: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 10 },
  savedText: { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: Colors.success },

  // ── Mobile back button ────────────────────────────────────────────────────
  mobileBackBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.border, backgroundColor: Colors.backgroundCard },
  mobileBackText: { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: Colors.text },

  // ── Skeleton loaders ──────────────────────────────────────────────────────
  skelCard: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderBottomWidth: 1, borderBottomColor: Colors.border },
  skelAvatar: { width: 38, height: 38, borderRadius: 10, backgroundColor: Colors.border },
  skelLine: { height: 11, borderRadius: 6, backgroundColor: Colors.border },

  // ── Funcionalidades tab — Stats bar ───────────────────────────────────────
  featStatsBar: { flexDirection: 'row', alignItems: 'stretch', backgroundColor: Colors.backgroundCard, borderBottomWidth: 1, borderBottomColor: Colors.border },
  featStatItem: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  featStatContent: { flex: 1, alignItems: 'center', paddingVertical: 10 },
  featStatNum: { fontSize: 22, fontFamily: 'Inter_800ExtraBold' },
  featStatLabel: { fontSize: 9, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 1, textTransform: 'uppercase', letterSpacing: 0.5 },
  featStatDivider: { width: 1, backgroundColor: Colors.border },

  // ── Funcionalidades tab — Search + Filter ─────────────────────────────────
  featSearchWrap: { paddingHorizontal: 12, paddingTop: 10, paddingBottom: 4 },
  featSearchInput: { flex: 1, fontSize: 13, fontFamily: 'Inter_400Regular', color: Colors.text, padding: 0 },
  catPillsRow: { flexDirection: 'row', alignItems: 'center' },
  catPillsScroll: { flexGrow: 0 },
  catPillsContent: { paddingHorizontal: 12, paddingBottom: 8, gap: 6, flexDirection: 'row' },
  catPillsArrow: { width: 28, height: 28, borderRadius: 14, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center', marginRight: 10, marginBottom: 8 },
  catPill: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 99, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
  catPillActive: { backgroundColor: Colors.gold, borderColor: Colors.gold },
  catPillText: { fontSize: 11, fontFamily: 'Inter_600SemiBold', color: Colors.textMuted },
  catPillTextActive: { color: Colors.dark },

  // ── Funcionalidades tab — Category section headers ────────────────────────
  featCatHeader: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 6, paddingHorizontal: 2 },
  featCatIconBox: { width: 24, height: 24, borderRadius: 7, backgroundColor: Colors.gold + '20', alignItems: 'center', justifyContent: 'center' },
  featCatTitle: { flex: 1, fontSize: 12, fontFamily: 'Inter_700Bold', color: Colors.text },
  featCatCountBadge: { backgroundColor: Colors.surface, borderRadius: 5, paddingHorizontal: 7, paddingVertical: 2, borderWidth: 1, borderColor: Colors.border },
  featCatCountText: { fontSize: 10, fontFamily: 'Inter_600SemiBold', color: Colors.textMuted },

  // ── Funcionalidades tab — Feature cards grid ──────────────────────────────
  featGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  featGridMobile: { flexDirection: 'column', gap: 6 },
  featCard: {
    flex: 1,
    minWidth: 170,
    maxWidth: 260,
    backgroundColor: Colors.backgroundCard,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 12,
    gap: 8,
  },
  featCardLabel: { fontSize: 12, fontFamily: 'Inter_700Bold', color: Colors.text, lineHeight: 16, flex: 1 },
  featCardKey: { fontSize: 9, fontFamily: 'Inter_700Bold', color: Colors.textMuted, backgroundColor: Colors.surface, borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2, letterSpacing: 0.3, flexShrink: 0, maxWidth: 80 },
  featCardDesc: { fontSize: 10, fontFamily: 'Inter_400Regular', color: Colors.textMuted, lineHeight: 14 },
  featCardProgress: { height: 2, backgroundColor: Colors.border, borderRadius: 99, overflow: 'hidden' },
  featCardProgressFill: { height: 2, borderRadius: 99 },
  featCardFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  featCardCountBadge: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  featCardCountDot: { width: 6, height: 6, borderRadius: 99 },
  featCardCountNum: { fontSize: 11, fontFamily: 'Inter_700Bold' },
  featCardCountSub: { fontSize: 10, fontFamily: 'Inter_400Regular', color: Colors.textMuted },

  // ── Funcionalidades tab — Pagination ──────────────────────────────────────
  featPagination: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 10, paddingHorizontal: 14, borderTopWidth: 1, borderTopColor: Colors.border },
  featPageBtn: { width: 28, height: 28, borderRadius: 7, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  featPageBtnActive: { backgroundColor: Colors.gold, borderColor: Colors.gold },
  featPageBtnDisabled: { opacity: 0.35 },
  featPageBtnText: { fontSize: 11, fontFamily: 'Inter_600SemiBold', color: Colors.text },
  featPageBtnTextActive: { color: Colors.dark },
  featPageEllipsis: { fontSize: 11, color: Colors.textMuted, paddingHorizontal: 2 },
  featPageLabel: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginLeft: 8 },

  // ── Feature modal ─────────────────────────────────────────────────────────
  featModal: { width: '90%', maxWidth: 520, maxHeight: '88%', backgroundColor: Colors.backgroundCard, borderRadius: 16, overflow: 'hidden', flexDirection: 'column' },
  featModalMobile: { width: '100%', maxWidth: '100%', borderBottomLeftRadius: 0, borderBottomRightRadius: 0, position: 'absolute', bottom: 0, maxHeight: '92%' },
  featModalHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 14, borderBottomWidth: 1, borderBottomColor: Colors.border },
  featModalIconBox: { width: 34, height: 34, borderRadius: 9, backgroundColor: Colors.gold + '20', alignItems: 'center', justifyContent: 'center' },
  featModalTitle: { fontSize: 14, fontFamily: 'Inter_700Bold', color: Colors.text },
  featModalDesc: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 2, lineHeight: 15 },
  featModalRoles: { padding: 10, borderBottomWidth: 1, borderBottomColor: Colors.border },
  featModalRolesLabel: { fontSize: 10, fontFamily: 'Inter_600SemiBold', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
  featRolePill: { borderRadius: 99, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1 },
  featRolePillText: { fontSize: 10, fontFamily: 'Inter_600SemiBold' },
  featModalStats: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 14, backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border },
  featModalStatItem: { flex: 1, alignItems: 'center' },
  featModalStatNum: { fontSize: 16, fontFamily: 'Inter_800ExtraBold' },
  featModalStatLabel: { fontSize: 9, fontFamily: 'Inter_400Regular', color: Colors.textMuted },
  featModalStatDivider: { width: 1, height: 20, backgroundColor: Colors.border },
  featModalSearch: { padding: 10, borderBottomWidth: 1, borderBottomColor: Colors.border },
  featSearchInputSm: { flex: 1, fontSize: 13, fontFamily: 'Inter_400Regular', color: Colors.text, padding: 0 },
  featUserSection: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 14, paddingVertical: 6, backgroundColor: Colors.surface },
  featUserSectionDot: { width: 7, height: 7, borderRadius: 99 },
  featUserSectionLabel: { fontSize: 10, fontFamily: 'Inter_700Bold', color: Colors.text, letterSpacing: 0.5, textTransform: 'uppercase' },
  featUserRow: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 14, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: Colors.border },
  featUserRowChanged: { backgroundColor: Colors.warning + '08' },
  featUserAvatar: { width: 34, height: 34, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  featUserAvatarText: { fontSize: 12, fontFamily: 'Inter_700Bold' },
  featUserName: { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: Colors.text },
  featChangedDot: { width: 6, height: 6, borderRadius: 99, backgroundColor: Colors.success },
  featModalFooter: { flexDirection: 'row', gap: 8, padding: 12, borderTopWidth: 1, borderTopColor: Colors.border, backgroundColor: Colors.backgroundCard },
  featModalCancelBtn: { paddingHorizontal: 16, paddingVertical: 11, borderRadius: 10, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
  featModalCancelText: { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: Colors.text },

  // ── Password reset modal ──────────────────────────────────────────────────
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  resetModal: { width: '100%', maxWidth: 440, backgroundColor: Colors.backgroundCard, borderRadius: 16, overflow: 'hidden' },
  resetModalHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderBottomWidth: 1, borderBottomColor: Colors.border },
  resetModalIconBox: { width: 38, height: 38, borderRadius: 10, backgroundColor: Colors.warning + '18', alignItems: 'center', justifyContent: 'center' },
  resetModalTitle: { fontSize: 15, fontFamily: 'Inter_700Bold', color: Colors.text },
  resetModalSubtitle: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 2 },
  resetWarningBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, margin: 12, padding: 11, backgroundColor: Colors.warning + '12', borderRadius: 9, borderWidth: 1, borderColor: Colors.warning + '35' },
  resetWarningText: { flex: 1, fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.text, lineHeight: 17 },
  resetErrorBox: { flexDirection: 'row', alignItems: 'center', gap: 6, marginHorizontal: 12, padding: 9, backgroundColor: Colors.danger + '12', borderRadius: 8 },
  resetErrorText: { flex: 1, fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.danger },
  resetModalActions: { flexDirection: 'row', gap: 8, padding: 12 },
  resetCancelBtn: { flex: 1, paddingVertical: 11, borderRadius: 9, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, alignItems: 'center' },
  resetCancelText: { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: Colors.text },
  resetConfirmBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 11, borderRadius: 9, backgroundColor: Colors.warning },
  resetConfirmText: { fontSize: 13, fontFamily: 'Inter_700Bold', color: '#fff' },
  resetSuccessBox: { flexDirection: 'row', alignItems: 'center', gap: 8, margin: 12, padding: 10, backgroundColor: Colors.success + '12', borderRadius: 9 },
  resetSuccessText: { flex: 1, fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.text },
  resetTempLabel: { fontSize: 10, fontFamily: 'Inter_600SemiBold', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginHorizontal: 12, marginBottom: 5 },
  resetTempBox: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 12, backgroundColor: Colors.surface, borderRadius: 9, borderWidth: 1, borderColor: Colors.border, padding: 10 },
  resetTempPassword: { flex: 1, fontSize: 20, fontFamily: 'Inter_800ExtraBold', color: Colors.gold, letterSpacing: 2.5 },
  copyBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  copyBtnText: { fontSize: 11, fontFamily: 'Inter_600SemiBold', color: Colors.gold },
  resetNoteBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, margin: 12, padding: 9, backgroundColor: Colors.info + '10', borderRadius: 8 },
  resetNoteText: { flex: 1, fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.text, lineHeight: 16 },
  resetDoneBtn: { paddingVertical: 11, borderRadius: 10, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center', margin: 0 },
  resetDoneText: { fontSize: 13, fontFamily: 'Inter_700Bold', color: Colors.text },

  // ── Tab Pedidos ─────────────────────────────────────────────────────────────
  pedidosHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.border, backgroundColor: Colors.backgroundCard },
  pedidosTitle: { fontSize: 14, fontFamily: 'Inter_700Bold', color: Colors.text },
  pedidosSub: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 2 },
  pedidosRefresh: { padding: 8, borderRadius: 8, backgroundColor: Colors.backgroundElevated, borderWidth: 1, borderColor: Colors.border },

  pedidoFiltroChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 99, backgroundColor: Colors.backgroundCard, borderWidth: 1, borderColor: Colors.border },
  pedidoFiltroTxt: { fontSize: 11, color: Colors.textMuted, fontFamily: 'Inter_600SemiBold' },
  pedidoFiltroBadge: { borderRadius: 99, paddingHorizontal: 6, paddingVertical: 1 },
  pedidoFiltroBadgeTxt: { fontSize: 10, fontFamily: 'Inter_700Bold', color: Colors.textMuted },

  pedidoCard: { backgroundColor: Colors.backgroundCard, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, borderLeftWidth: 3, overflow: 'hidden' },
  pedidoCardTop: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, paddingBottom: 8 },
  pedidoCardBadge: { width: 32, height: 32, borderRadius: 8, backgroundColor: Colors.gold + '18', alignItems: 'center', justifyContent: 'center' },
  pedidoCardBadgeTxt: { fontSize: 11, fontFamily: 'Inter_800ExtraBold', color: Colors.gold },
  pedidoCardProf: { fontSize: 13, fontFamily: 'Inter_700Bold', color: Colors.text },
  pedidoCardMeta: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 1 },
  pedidoCardStatus: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 99 },
  pedidoCardStatusTxt: { fontSize: 10, fontFamily: 'Inter_700Bold' },
  pedidoCardBody: { paddingHorizontal: 12, paddingBottom: 8 },
  pedidoCardMotivoLabel: { fontSize: 9, fontFamily: 'Inter_600SemiBold', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 3 },
  pedidoCardMotivo: { fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textSecondary, lineHeight: 17 },
  pedidoCardFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 8, borderTopWidth: 1, borderTopColor: Colors.border, backgroundColor: Colors.backgroundElevated + '60' },
  pedidoCardDate: { fontSize: 10, fontFamily: 'Inter_400Regular', color: Colors.textMuted },
  pedidoCardAction: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6, backgroundColor: Colors.gold + '18', borderWidth: 1, borderColor: Colors.gold + '40' },
  pedidoCardActionTxt: { fontSize: 11, fontFamily: 'Inter_700Bold', color: Colors.gold },

  // Responder modal
  respModal: { width: '90%', maxWidth: 480, backgroundColor: Colors.backgroundCard, borderRadius: 14, overflow: 'hidden' },
  respModalHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderBottomWidth: 1, borderBottomColor: Colors.border },
  respModalTitle: { fontSize: 15, fontFamily: 'Inter_700Bold', color: Colors.text },
  respModalInfo: { padding: 14, borderBottomWidth: 1, borderBottomColor: Colors.border },
  respModalProf: { fontSize: 14, fontFamily: 'Inter_700Bold', color: Colors.text },
  respModalMeta: { fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 2 },
  respModalLabel: { fontSize: 11, fontFamily: 'Inter_600SemiBold', color: Colors.textMuted, paddingHorizontal: 14, paddingTop: 12, paddingBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  respModalInput: { marginHorizontal: 14, marginBottom: 14, backgroundColor: Colors.backgroundElevated, borderRadius: 8, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 12, paddingVertical: 10, fontSize: 13, color: Colors.text, fontFamily: 'Inter_400Regular', minHeight: 60, textAlignVertical: 'top' },
  respModalBtns: { flexDirection: 'row', gap: 10, padding: 14, paddingTop: 0 },
  respModalBtnRejeitar: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 11, borderRadius: 9, backgroundColor: Colors.danger + '12', borderWidth: 1, borderColor: Colors.danger + '30' },
  respModalBtnRejeitarTxt: { fontSize: 13, fontFamily: 'Inter_700Bold', color: Colors.danger },
  respModalBtnAprovar: { flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 11, borderRadius: 9, backgroundColor: Colors.success },
  respModalBtnAprovarTxt: { fontSize: 13, fontFamily: 'Inter_700Bold', color: '#fff' },
});
