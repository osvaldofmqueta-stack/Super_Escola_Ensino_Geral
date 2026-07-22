import React, { useState, useRef, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Switch, Platform, Image, Animated, Alert, Linking } from 'react-native';
import AppLoader from '@/components/AppLoader';
import { Ionicons, MaterialIcons, FontAwesome5, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { pickAndUploadPhoto } from '@/lib/uploadPhoto';
import { useRouter } from 'expo-router';
import { Colors } from '@/constants/colors';
import { useAuth } from '@/context/AuthContext';
import { useData } from '@/context/DataContext';
import { useLicense, diasAte, addDays, PLANO_LABEL, PLANO_DIAS } from '@/context/LicenseContext';
import { useConfig } from '@/context/ConfigContext';
import { useAnoAcademico } from '@/context/AnoAcademicoContext';
import { useFinanceiro, formatAOA } from '@/context/FinanceiroContext';
import TopBar from '@/components/TopBar';
import { alertSucesso } from '@/utils/toast';
import { api } from '@/lib/api';
import { getRoleLabel } from '@/utils/genero';
import CartaoFuncionarioVisual from '@/components/CartaoFuncionarioVisual';

interface PapRecord {
  alunoId: string;
  turmaId: string;
  nome?: string;
  apelido?: string;
  notaEstagio?: number | null;
  notaDefesa?: number | null;
  notasDisciplinas?: { nome: string; nota: number }[];
  notaPAP?: number | null;
}

function getEscolaStatusColor(dias: number, maxDias: number): string {
  if (dias <= 0) return '#FF3B30';
  if (dias <= 10) return '#FF3B30';
  if (dias <= Math.floor(maxDias * 0.5)) return '#FF9F0A';
  return '#30D158';
}

function EscolaStatusDot({ dias, maxDias }: { dias: number; maxDias: number }) {
  const cor = getEscolaStatusColor(dias, maxDias);
  const shouldBlink = dias <= 10;
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (shouldBlink) {
      const nd = Platform.OS !== 'web';
      const anim = Animated.loop(
        Animated.sequence([
          Animated.timing(opacity, { toValue: 0.2, duration: 500, useNativeDriver: nd }),
          Animated.timing(opacity, { toValue: 1, duration: 500, useNativeDriver: nd }),
        ])
      );
      anim.start();
      return () => anim.stop();
    }
  }, [shouldBlink]);

  return (
    <Animated.View style={[
      perfilStyles.escolaDot,
      { backgroundColor: cor, opacity: shouldBlink ? opacity : 1 },
    ]} />
  );
}

const perfilStyles = StyleSheet.create({
  escolaDot: { width: 10, height: 10, borderRadius: 5 },
  escolaCard: {
    margin: 16, marginBottom: 0, backgroundColor: Colors.backgroundCard,
    borderRadius: 16, padding: 16,
  },
  escolaRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  escolaInfo: { flex: 1, gap: 2 },
  escolaNome: { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: Colors.text },
  escolaMeta: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted },
  escolaBadge: {
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  escolaBadgeText: { fontSize: 10, fontFamily: 'Inter_700Bold' },
  escolaEmpty: { alignItems: 'center', paddingVertical: 20, gap: 6 },
  escolaEmptyText: { fontSize: 13, fontFamily: 'Inter_400Regular', color: Colors.textMuted },
});

function AvatarCircle({ nome, avatar, size = 72, fontSize = 28 }: { nome: string; avatar?: string; size?: number; fontSize?: number }) {
  const [imgError, setImgError] = React.useState(false);
  const initials = nome.split(' ').filter(Boolean).map(n => n[0]).slice(0, 2).join('').toUpperCase();
  if (avatar && !imgError) {
    const uri = avatar.startsWith('http') ? avatar : avatar;
    return (
      <Image
        source={{ uri }}
        style={[styles.avatarCircle, { width: size, height: size, borderRadius: size / 2 }]}
        onError={() => setImgError(true)}
      />
    );
  }
  return (
    <View style={[styles.avatarCircle, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={[styles.avatarText, { fontSize }]}>{initials}</Text>
    </View>
  );
}

function SectionHeader({ title, icon }: { title: string; icon: string }) {
  return (
    <View style={styles.sectionHeader}>
      <Ionicons name={icon as any} size={16} color={Colors.gold} />
      <Text style={styles.sectionHeaderText}>{title}</Text>
    </View>
  );
}

function InfoRow({ label, value, editable, onEdit }: { label: string; value: string; editable?: boolean; onEdit?: () => void }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <View style={styles.infoValueRow}>
        <Text style={styles.infoValue} numberOfLines={2}>{value || '—'}</Text>
        {editable && (
          <TouchableOpacity onPress={onEdit} style={styles.editIcon}>
            <Ionicons name="pencil" size={14} color={Colors.gold} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const ROLE_COLOR: Record<string, string> = {
  ceo: '#8B5CF6', pca: '#F59E0B', admin: '#3B82F6', director: Colors.accent,
  secretaria: Colors.gold, professor: Colors.info, aluno: Colors.success,
  financeiro: '#10B981', encarregado: '#F97316',
};

export default function PerfilScreen() {
  const { user, updateUser, setBiometric, logout } = useAuth();
  const { alunos, professores, turmas, notas, presencas, updateAluno, updateProfessor } = useData();
  const { codigosGerados } = useLicense();
  const { config } = useConfig();
  const { anoSelecionado } = useAnoAcademico();
  const { taxas, pagamentos, multaConfig, getMesesEmAtraso, calcularMulta } = useFinanceiro();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const bottomInset = Platform.OS === 'web' ? 34 : insets.bottom;

  // Saldo do aluno (para alunos, é carregado directamente — o contexto não o preenche).
  const [alunoSaldo, setAlunoSaldo] = useState<number>(0);

  const [editField, setEditField] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [editValue, setEditValue] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [biometricEnabled, setBiometricState] = useState(user?.biometricEnabled || false);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  // Password change modal state
  const [showSenhaModal, setShowSenhaModal] = useState(false);
  const [senhaAtual, setSenhaAtual] = useState('');
  const senhaNovaRef = useRef<any>(null);
  const senhaConfirmRef = useRef<any>(null);
  const [senhaNova, setSenhaNova] = useState('');
  const [senhaConfirm, setSenhaConfirm] = useState('');
  const [senhaError, setSenhaError] = useState('');
  const [isSavingSenha, setIsSavingSenha] = useState(false);

  // Telegram OTP link state
  const [telegramLinked, setTelegramLinked] = useState(false);
  const [telegramBotUsername, setTelegramBotUsername] = useState('');
  const [telegramConfigured, setTelegramConfigured] = useState(false);
  const [telegramLinking, setTelegramLinking] = useState(false);
  const [telegramUnlinking, setTelegramUnlinking] = useState(false);
  const [telegramLinkUrl, setTelegramLinkUrl] = useState('');

  // Inline profile edit state
  const [perfilNome, setPerfilNome] = useState(user?.nome ?? '');
  const [perfilTelefone, setPerfilTelefone] = useState(user?.telefone ?? '');
  const [showInlineSenha, setShowInlineSenha] = useState(false);
  const [perfilSaveError, setPerfilSaveError] = useState('');
  const [perfilSaveOk, setPerfilSaveOk] = useState(false);

  useEffect(() => {
    if (user) {
      setPerfilNome(user.nome ?? '');
      setPerfilTelefone(user.telefone ?? '');
    }
  }, [user?.id]);

  // Irregularidades de alunos (gestão financeira e pedagógica)
  const [irregularidades, setIrregularidades] = useState<any[]>([]);
  const [irregLoading, setIrregLoading] = useState(false);

  // Roles que podem ver irregularidades
  const IREG_ROLES = ['admin', 'ceo', 'pca', 'director', 'secretaria', 'chefe_secretaria', 'financeiro', 'pedagogico'];
  // Roles que só vêem área financeira
  const IREG_FIN_ONLY = ['financeiro'];
  // Roles que só vêem área pedagógica
  const IREG_PED_ONLY = ['pedagogico'];

  // Salary estimation (for all non-aluno, non-encarregado users)
  const [salEst, setSalEst] = useState<Record<string, any> | null>(null);
  const [salEstLoading, setSalEstLoading] = useState(false);

  useEffect(() => {
    if (!user) return;
    if (!IREG_ROLES.includes(user.role)) return;
    setIrregLoading(true);
    api.get('/api/pendencias-alunos')
      .then((data: any) => setIrregularidades(Array.isArray(data) ? data : []))
      .catch(() => setIrregularidades([]))
      .finally(() => setIrregLoading(false));
  }, [user?.id]);

  useEffect(() => {
    if (!user) return;
    const skipRoles = ['aluno', 'encarregado'];
    if (skipRoles.includes(user.role)) return;
    const now = new Date();
    setSalEstLoading(true);
    api.get(`/api/meu-recibo-estimado?mes=${now.getMonth() + 1}&ano=${now.getFullYear()}`)
      .then((d: any) => {
        const data = d?.data ?? d;
        if (data && !data.semPerfil) setSalEst(data);
      })
      .catch(() => {})
      .finally(() => setSalEstLoading(false));
  }, [user?.id]);

  // PAP data for professor with 13ª Classe turmas
  const [papData, setPapData] = useState<Record<string, PapRecord[]>>({});

  useEffect(() => {
    if (!user || user.role !== 'professor' || !config.papHabilitado) return;
    if ((config as any).temDecimaTermeira === false) return;
    const prof = professores.find(p => (user.id && p.utilizadorId === user.id) || p.email === user.email);
    if (!prof) return;
    const turmas13 = turmas.filter(t => ((Array.isArray(prof.turmasIds) ? prof.turmasIds : []).includes(t.id) || (t.professoresIds ?? []).includes(prof.id)) && t.ativo &&
      (t.classe === '13ª Classe' || t.classe === '13'));
    if (turmas13.length === 0) return;
    const anoLetivo = anoSelecionado?.ano || new Date().getFullYear().toString();
    const fetchAll = async () => {
      const results: Record<string, PapRecord[]> = {};
      await Promise.all(turmas13.map(async (t) => {
        try {
          const resp = await fetch(`/api/pap-alunos?turmaId=${t.id}&anoLetivo=${anoLetivo}`);
          if (resp.ok) {
            const data: PapRecord[] = await resp.json();
            results[t.id] = data;
          } else {
            results[t.id] = [];
          }
        } catch {
          results[t.id] = [];
        }
      }));
      setPapData(results);
    };
    fetchAll();
  }, [user, professores, turmas, config.papHabilitado, anoSelecionado]);

  if (!user) return null;

  const roleLabel = getRoleLabel(user.role, user.genero);

  const roleBadgeColor = ({
    ceo: '#8B5CF6',
    pca: '#F59E0B',
    admin: '#3B82F6',
    director: Colors.accent,
    secretaria: Colors.gold,
    professor: Colors.info,
    aluno: Colors.success,
  } as Record<string, string>)[user.role] || Colors.textMuted;

  function startEdit(field: string, currentValue: string, label: string) {
    setEditField(field);
    setEditLabel(label);
    setEditValue(currentValue || '');
    setSaveError('');
  }

  async function saveEdit() {
    if (!editField) return;
    setIsSaving(true);
    setSaveError('');
    try {
      await updateUser({ [editField]: editValue } as any);
      setEditField(null);
      alertSucesso('Perfil actualizado', 'As suas informações foram actualizadas com sucesso.');
    } catch (err: any) {
      setSaveError(err?.message || 'Erro ao guardar. Tente novamente.');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleChangeSenha() {
    setSenhaError('');
    if (!senhaAtual) { setSenhaError('Indique a sua senha actual.'); return; }
    if (!senhaNova || senhaNova.length < 6) { setSenhaError('A nova senha deve ter pelo menos 6 caracteres.'); return; }
    if (senhaNova !== senhaConfirm) { setSenhaError('As senhas não coincidem. Verifique e tente novamente.'); return; }
    setIsSavingSenha(true);
    try {
      const token = await import('@react-native-async-storage/async-storage').then(m => m.default.getItem('@siga_token'));
      const res = await fetch('/api/perfil', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ senhaAtual, senhaNova }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setSenhaError((data as any)?.error || 'Erro ao alterar senha.'); return; }
      setShowSenhaModal(false);
      setSenhaAtual(''); setSenhaNova(''); setSenhaConfirm('');
      alertSucesso('Senha alterada', 'A sua senha foi alterada com sucesso.');
    } catch {
      setSenhaError('Erro de rede. Verifique a sua ligação.');
    } finally {
      setIsSavingSenha(false);
    }
  }

  async function savePerfilDados() {
    setPerfilSaveError('');
    setPerfilSaveOk(false);
    const trimNome = perfilNome.trim();
    if (!trimNome) { setPerfilSaveError('O nome não pode estar vazio.'); return; }
    setIsSaving(true);
    try {
      await updateUser({ nome: trimNome, telefone: perfilTelefone.trim() });
      setPerfilSaveOk(true);
      setTimeout(() => setPerfilSaveOk(false), 3000);
      alertSucesso('Perfil actualizado', 'Os seus dados foram guardados com sucesso.');
    } catch (err: any) {
      setPerfilSaveError(err?.message || 'Erro ao guardar. Tente novamente.');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleBiometric(val: boolean) {
    setBiometricState(val);
    await setBiometric(val);
  }

  async function handlePickPhoto() {
    try {
      const url = await pickAndUploadPhoto();
      if (url) {
        try {
          await updateUser({ avatar: url });
        } catch (authErr: any) {
          const msg = authErr?.message ?? '';
          if (msg.includes('expirada') || msg.includes('inválida') || msg.includes('autenticado')) {
            Alert.alert('Sessão expirada', 'A sua sessão expirou. Por favor, faça login novamente.');
            await logout();
            router.replace('/login' as any);
            return;
          }
          Alert.alert('Erro', msg || 'Não foi possível actualizar a foto de perfil.');
          return;
        }
        // Sync photo to linked record — best-effort, never shows error to user
        try {
          if (user.role === 'aluno') {
            const aluno = alunos.find(a => (user.id && a.utilizadorId === user.id) || a.email === user.email || a.nome.includes(user.nome.split(' ')[0]));
            if (aluno) await updateAluno(aluno.id, { foto: url });
          } else if (user.role === 'professor') {
            const prof = professores.find(p => (user.id && p.utilizadorId === user.id) || p.email === user.email);
            if (prof) await updateProfessor(prof.id, { foto: url });
          }
        } catch {
          // Sync is best-effort — avatar is already saved in utilizadores.avatar
        }
      }
    } catch (e: any) {
      Alert.alert('Erro', e?.message || 'Não foi possível actualizar a foto de perfil.');
    }
  }

  const alunoRecord = alunos.find(a => (user?.id && a.utilizadorId === user.id) || a.email === user?.email || a.nome.includes((user?.nome || '').split(' ')[0]));
  const profRecord = professores.find(p => (user?.id && p.utilizadorId === user.id) || p.email === user?.email);
  const avatarUri = user?.avatar || (user?.role === 'aluno' ? alunoRecord?.foto : profRecord?.foto) || undefined;

  // Carrega saldo do aluno (não vem no contexto para role=aluno)
  useEffect(() => {
    if (user?.role !== 'aluno' || !alunoRecord?.id) return;
    let cancel = false;
    api.get<{ saldo?: number }>(`/api/saldo-alunos/${alunoRecord.id}`)
      .then(r => { if (!cancel) setAlunoSaldo(Number((r as any)?.saldo ?? 0)); })
      .catch(() => { if (!cancel) setAlunoSaldo(0); });
    return () => { cancel = true; };
  }, [user?.role, alunoRecord?.id, pagamentos.length]);

  // Carregar estado Telegram ao montar
  useEffect(() => {
    if (!user?.id) return;
    api.get<{ linked: boolean; botUsername: string; configured: boolean }>('/api/telegram/status')
      .then(r => {
        setTelegramLinked(!!(r as any)?.linked);
        setTelegramBotUsername((r as any)?.botUsername || '');
        setTelegramConfigured(!!(r as any)?.configured);
      })
      .catch(() => {});
  }, [user?.id]);

  async function doLogout() {
    setIsLoggingOut(true);
    try {
      await logout();
      router.replace('/login' as any);
    } catch {
      setIsLoggingOut(false);
      setConfirmLogout(false);
    }
  }

  // Role-specific stats
  function renderRoleSection() {
    if (user.role === 'ceo' || user.role === 'pca' || user.role === 'admin') {
      const totalAlunos = alunos.filter(a => a.ativo).length;
      const totalProf = professores.filter(p => p.ativo).length;
      const totalTurmas = turmas.filter(t => t.ativo).length;
      const mediaNotas = notas.length > 0 ? (notas.reduce((s, n) => s + n.mac, 0) / notas.length).toFixed(1) : '—';

      const escolasInstaladas = codigosGerados
        .filter(c => c.usado && c.usadoPor && c.usadoEm)
        .map(c => {
          const maxDias = PLANO_DIAS[c.plano] ?? 30;
          const dataExp = addDays(c.usadoEm!, c.diasValidade);
          const diasRest = Math.max(0, diasAte(dataExp));
          const cor = getEscolaStatusColor(diasRest, maxDias);
          return { id: c.id, nome: c.usadoPor!, plano: c.plano, maxDias, diasRest, dataExp, cor };
        })
        .sort((a, b) => a.diasRest - b.diasRest);

      return (
        <>
          <View style={styles.card}>
            <SectionHeader title="Visão Geral do Sistema" icon="shield-checkmark" />
            <View style={styles.statsGrid}>
              <View style={styles.statItem}>
                <Text style={[styles.statNum, { color: Colors.info }]}>{totalAlunos}</Text>
                <Text style={styles.statLbl}>Alunos</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={[styles.statNum, { color: Colors.gold }]}>{totalProf}</Text>
                <Text style={styles.statLbl}>Professores</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={[styles.statNum, { color: Colors.success }]}>{totalTurmas}</Text>
                <Text style={styles.statLbl}>Turmas</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={[styles.statNum, { color: Colors.accent }]}>{mediaNotas}</Text>
                <Text style={styles.statLbl}>Média Geral</Text>
              </View>
            </View>
            <InfoRow label="Cargo" value={roleLabel} />
            <InfoRow label="Instituição" value={user.escola} />
          </View>

          {/* Irregularidades de alunos — visível para todos os perfis de gestão */}
          {IREG_ROLES.includes(user.role) && (() => {
            // Filtrar conforme a área do perfil
            const visibleIrreg = IREG_FIN_ONLY.includes(user.role)
              ? irregularidades.filter(p => p.area === 'Financeiro' || p.area === 'Secretaria')
              : IREG_PED_ONLY.includes(user.role)
                ? irregularidades.filter(p => p.area === 'Pedagógico')
                : irregularidades;

            const tituloArea = IREG_FIN_ONLY.includes(user.role)
              ? 'Irregularidades Financeiras'
              : IREG_PED_ONLY.includes(user.role)
                ? 'Irregularidades Pedagógicas'
                : 'Irregularidades de Alunos';

            const urgente = visibleIrreg.filter(p => p.severidade === 'urgente').length;
            const aviso = visibleIrreg.filter(p => p.severidade === 'aviso').length;
            const info = visibleIrreg.filter(p => p.severidade === 'info').length;

            const tipoLabel: Record<string, string> = {
              propina: 'Propina', bloqueio: 'Bloqueio', rupe: 'RUPE',
              aviso_financeiro: 'Aviso Financeiro', nota_negativa: 'Nota Negativa', faltas_excessivas: 'Faltas Excessivas',
            };

            return (
              <View style={[styles.card, { borderLeftWidth: 3, borderLeftColor: Colors.danger }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <MaterialCommunityIcons name="alert-decagram" size={18} color={Colors.warning} />
                  <Text style={{ fontSize: 14, fontFamily: 'Inter_700Bold', color: Colors.text, flex: 1 }}>
                    {tituloArea}
                  </Text>
                  {irregLoading ? (
                    <AppLoader size="small" color={Colors.gold} />
                  ) : (
                    <View style={{ backgroundColor: visibleIrreg.length > 0 ? Colors.danger + '22' : Colors.success + '22', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
                      <Text style={{ fontSize: 11, fontFamily: 'Inter_700Bold', color: visibleIrreg.length > 0 ? Colors.danger : Colors.success }}>
                        {visibleIrreg.length} activas
                      </Text>
                    </View>
                  )}
                </View>

                {/* Contadores por severidade */}
                {!irregLoading && visibleIrreg.length > 0 && (
                  <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
                    {urgente > 0 && (
                      <View style={{ flex: 1, backgroundColor: Colors.danger + '18', borderRadius: 10, padding: 10, alignItems: 'center', borderWidth: 1, borderColor: Colors.danger + '44' }}>
                        <Text style={{ fontSize: 20, fontFamily: 'Inter_700Bold', color: Colors.danger }}>{urgente}</Text>
                        <Text style={{ fontSize: 10, fontFamily: 'Inter_500Medium', color: Colors.danger, marginTop: 2 }}>Urgente</Text>
                      </View>
                    )}
                    {aviso > 0 && (
                      <View style={{ flex: 1, backgroundColor: Colors.warning + '18', borderRadius: 10, padding: 10, alignItems: 'center', borderWidth: 1, borderColor: Colors.warning + '44' }}>
                        <Text style={{ fontSize: 20, fontFamily: 'Inter_700Bold', color: Colors.warning }}>{aviso}</Text>
                        <Text style={{ fontSize: 10, fontFamily: 'Inter_500Medium', color: Colors.warning, marginTop: 2 }}>Aviso</Text>
                      </View>
                    )}
                    {info > 0 && (
                      <View style={{ flex: 1, backgroundColor: Colors.info + '18', borderRadius: 10, padding: 10, alignItems: 'center', borderWidth: 1, borderColor: Colors.info + '44' }}>
                        <Text style={{ fontSize: 20, fontFamily: 'Inter_700Bold', color: Colors.info }}>{info}</Text>
                        <Text style={{ fontSize: 10, fontFamily: 'Inter_500Medium', color: Colors.info, marginTop: 2 }}>Info</Text>
                      </View>
                    )}
                  </View>
                )}

                {/* Lista das pendências (máx. 5) */}
                {!irregLoading && visibleIrreg.length === 0 && (
                  <View style={{ alignItems: 'center', paddingVertical: 16, gap: 8 }}>
                    <Ionicons name="checkmark-circle-outline" size={28} color={Colors.success} />
                    <Text style={{ fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textMuted }}>Sem irregularidades activas</Text>
                  </View>
                )}

                {!irregLoading && visibleIrreg.slice(0, 5).map((p: any, idx: number) => {
                  const sevColor = p.severidade === 'urgente' ? Colors.danger : p.severidade === 'aviso' ? Colors.warning : Colors.info;
                  return (
                    <View key={p.id ?? idx} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 8, borderTopWidth: idx === 0 ? 0 : 1, borderTopColor: Colors.border }}>
                      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: sevColor, marginTop: 5 }} />
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 12, fontFamily: 'Inter_600SemiBold', color: Colors.text }} numberOfLines={1}>
                          {p.nome} {p.apelido}
                        </Text>
                        <Text style={{ fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted }} numberOfLines={1}>
                          {tipoLabel[p.tipoPendencia] ?? p.tipoPendencia} · {p.descricao}
                        </Text>
                      </View>
                      <View style={{ backgroundColor: sevColor + '22', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
                        <Text style={{ fontSize: 9, fontFamily: 'Inter_700Bold', color: sevColor }}>{p.area}</Text>
                      </View>
                    </View>
                  );
                })}

                {!irregLoading && visibleIrreg.length > 5 && (
                  <TouchableOpacity
                    style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 10, paddingVertical: 8, backgroundColor: Colors.primaryDark, borderRadius: 10 }}
                    onPress={() => router.push('/(main)/visao-geral' as any)}
                    activeOpacity={0.75}
                  >
                    <MaterialCommunityIcons name="alert-decagram" size={13} color={Colors.warning} />
                    <Text style={{ fontSize: 12, fontFamily: 'Inter_500Medium', color: Colors.textSecondary }}>
                      Ver todas as {visibleIrreg.length} irregularidades
                    </Text>
                    <Ionicons name="chevron-forward" size={13} color={Colors.textMuted} />
                  </TouchableOpacity>
                )}
              </View>
            );
          })()}

          {user.role === 'pca' && (
            <View style={perfilStyles.escolaCard}>
              <SectionHeader title="Controlo das Escolas Instaladas" icon="business" />
              {escolasInstaladas.length === 0 ? (
                <View style={perfilStyles.escolaEmpty}>
                  <MaterialCommunityIcons name="school-outline" size={32} color={Colors.textMuted} />
                  <Text style={perfilStyles.escolaEmptyText}>Nenhuma escola instalada ainda.</Text>
                </View>
              ) : (
                escolasInstaladas.map(e => (
                  <View key={e.id} style={perfilStyles.escolaRow}>
                    <EscolaStatusDot dias={e.diasRest} maxDias={e.maxDias} />
                    <View style={perfilStyles.escolaInfo}>
                      <Text style={perfilStyles.escolaNome}>{e.nome}</Text>
                      <Text style={perfilStyles.escolaMeta}>
                        {e.diasRest <= 0
                          ? 'Licença expirada'
                          : `${e.diasRest} dia${e.diasRest === 1 ? '' : 's'} restantes · expira ${e.dataExp}`}
                      </Text>
                    </View>
                    <View style={[perfilStyles.escolaBadge, { borderWidth: 1, borderColor: e.cor + '44' }]}>
                      <Text style={[perfilStyles.escolaBadgeText, { color: e.cor }]}>
                        {PLANO_LABEL[e.plano]}
                      </Text>
                    </View>
                  </View>
                ))
              )}
              <View style={{ flexDirection: 'row', gap: 16, marginTop: 14, paddingTop: 10 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#30D158' }} />
                  <Text style={{ fontSize: 10, fontFamily: 'Inter_400Regular', color: Colors.textMuted }}>Activa</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#FF9F0A' }} />
                  <Text style={{ fontSize: 10, fontFamily: 'Inter_400Regular', color: Colors.textMuted }}>Renovar em breve</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#FF3B30' }} />
                  <Text style={{ fontSize: 10, fontFamily: 'Inter_400Regular', color: Colors.textMuted }}>Crítico / Expirado</Text>
                </View>
              </View>
            </View>
          )}
        </>
      );
    }

    if (user.role === 'director') {
      const totalAlunos = alunos.filter(a => a.ativo).length;
      const totalProf = professores.filter(p => p.ativo).length;
      const totalTurmas = turmas.filter(t => t.ativo).length;
      const mediaNotas = notas.length > 0 ? (notas.reduce((s, n) => s + n.mac, 0) / notas.length).toFixed(1) : '—';
      return (
        <View style={styles.card}>
          <SectionHeader title="Estatísticas da Escola" icon="bar-chart" />
          <View style={styles.statsGrid}>
            <View style={styles.statItem}>
              <Text style={[styles.statNum, { color: Colors.info }]}>{totalAlunos}</Text>
              <Text style={styles.statLbl}>Alunos</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={[styles.statNum, { color: Colors.gold }]}>{totalProf}</Text>
              <Text style={styles.statLbl}>Professores</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={[styles.statNum, { color: Colors.success }]}>{totalTurmas}</Text>
              <Text style={styles.statLbl}>Turmas</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={[styles.statNum, { color: Colors.accent }]}>{mediaNotas}</Text>
              <Text style={styles.statLbl}>Média Notas</Text>
            </View>
          </View>
          <InfoRow label="Cargo" value="Director Geral" editable onEdit={() => {}} />
          <InfoRow label="Departamento" value="Direcção Académica" editable onEdit={() => {}} />
        </View>
      );
    }

    if (user.role === 'secretaria') {
      const totalRegistos = alunos.length;
      const totalEventos = 12;
      return (
        <View style={styles.card}>
          <SectionHeader title="Dados da Secretaria" icon="document-text" />
          <View style={styles.statsGrid}>
            <View style={styles.statItem}>
              <Text style={[styles.statNum, { color: Colors.info }]}>{totalRegistos}</Text>
              <Text style={styles.statLbl}>Registos</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={[styles.statNum, { color: Colors.gold }]}>{totalEventos}</Text>
              <Text style={styles.statLbl}>Processos</Text>
            </View>
          </View>
          <InfoRow label="Cargo" value="Técnica de Secretaria" editable onEdit={() => {}} />
          <InfoRow label="Departamento" value="Secretaria Escolar" editable onEdit={() => {}} />
        </View>
      );
    }

    if (user.role === 'professor') {
      const prof = professores.find(p => (user.id && p.utilizadorId === user.id) || p.email === user.email);
      const minhasTurmas = prof ? turmas.filter(t => (Array.isArray(prof.turmasIds) ? prof.turmasIds : []).includes(t.id) || (t.professoresIds ?? []).includes(prof.id)) : [];
      const meusAlunos = prof ? alunos.filter(a => minhasTurmas.some(t => t.id === a.turmaId)).length : 0;
      const turmas13 = minhasTurmas.filter(t => t.ativo && (t.classe === '13ª Classe' || t.classe === '13'));
      const hasPap = config.papHabilitado && (config as any).temDecimaTermeira !== false && turmas13.length > 0;

      return (
        <>
          <View style={styles.card}>
            <SectionHeader title="Dados do Professor" icon="school" />
            {prof && (
              <>
                <View style={styles.statsGrid}>
                  <View style={styles.statItem}>
                    <Text style={[styles.statNum, { color: Colors.info }]}>{minhasTurmas.length}</Text>
                    <Text style={styles.statLbl}>Turmas</Text>
                  </View>
                  <View style={styles.statItem}>
                    <Text style={[styles.statNum, { color: Colors.gold }]}>{meusAlunos}</Text>
                    <Text style={styles.statLbl}>Alunos</Text>
                  </View>
                  <View style={styles.statItem}>
                    <Text style={[styles.statNum, { color: Colors.success }]}>{(Array.isArray(prof.disciplinas) ? prof.disciplinas : []).length}</Text>
                    <Text style={styles.statLbl}>Disciplinas</Text>
                  </View>
                </View>
                <InfoRow label="N.º Professor" value={prof.numeroProfessor} />
                <InfoRow label="Habilitações" value={prof.habilitacoes} />
                <InfoRow label="Disciplinas" value={(Array.isArray(prof.disciplinas) ? prof.disciplinas : []).join(', ')} />
                <InfoRow label="Turmas" value={minhasTurmas.map(t => t.nome).join(', ')} />
                {/* Vínculo Contratual */}
                {(() => {
                  const VINCULO_MAP: Record<string, { label: string; color: string }> = {
                    efectivo:            { label: 'Efectivo',             color: Colors.success },
                    colaborador:         { label: 'Colaborador',          color: Colors.info },
                    contratado:          { label: 'Contratado',           color: '#FF9F0A' },
                    prestacao_servicos:  { label: 'Prestação de Serviços', color: '#AF52DE' },
                  };
                  const v = VINCULO_MAP[prof.tipoContrato as string] ?? { label: prof.tipoContrato || '—', color: Colors.textMuted };
                  return (
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, borderTopWidth: 1, borderTopColor: Colors.border, marginTop: 4 }}>
                      <Text style={{ fontSize: 12, fontFamily: 'Inter_500Medium', color: Colors.textSecondary }}>Vínculo Contratual</Text>
                      <View style={{ backgroundColor: v.color + '22', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 }}>
                        <Text style={{ fontSize: 12, fontFamily: 'Inter_700Bold', color: v.color }}>{v.label}</Text>
                      </View>
                    </View>
                  );
                })()}
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, borderTopWidth: 1, borderTopColor: Colors.border, marginTop: 4 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 12, fontFamily: 'Inter_500Medium', color: Colors.textSecondary }}>Notas no Portal do Estudante</Text>
                    <Text style={{ fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 2 }}>
                      {config.notasVisiveis ? 'Os estudantes podem ver as notas lançadas' : 'As notas estão ocultas para os estudantes'}
                    </Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: config.notasVisiveis ? Colors.success + '20' : 'rgba(232,238,246,0.12)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 }}>
                    <Ionicons name={config.notasVisiveis ? 'eye-outline' : 'eye-off-outline'} size={13} color={config.notasVisiveis ? Colors.success : Colors.textMuted} />
                    <Text style={{ fontSize: 11, fontFamily: 'Inter_700Bold', color: config.notasVisiveis ? Colors.success : Colors.textMuted }}>
                      {config.notasVisiveis ? 'Visíveis' : 'Ocultas'}
                    </Text>
                  </View>
                </View>
              </>
            )}
          </View>

          {/* PAP — Prova de Aptidão Profissional (13ª Classe) */}
          {hasPap && (
            <View style={styles.card}>
              <SectionHeader title="PAP — Prova de Aptidão Profissional" icon="ribbon" />
              <View style={{ flexDirection: 'row', gap: 8, backgroundColor: Colors.gold + '15', borderRadius: 10, padding: 10, marginBottom: 12, alignItems: 'flex-start' }}>
                <Ionicons name="information-circle-outline" size={15} color={Colors.gold} />
                <Text style={{ flex: 1, fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.gold + 'DD', lineHeight: 16 }}>
                  Nota PAP = (Estágio + Defesa{config.papDisciplinasContribuintes?.length ? ' + Média Disciplinas' : ''}) ÷ 3 — esta nota consta no certificado do aluno.
                </Text>
              </View>

              {turmas13.map(turma => {
                const papTurma = papData[turma.id] || [];
                const alunosTurma = alunos.filter(a => a.turmaId === turma.id && a.ativo);
                const totalComPAP = papTurma.filter(p => p.notaPAP != null).length;
                const totalSemPAP = alunosTurma.length - totalComPAP;

                return (
                  <View key={turma.id} style={{ marginBottom: 14 }}>
                    {/* Turma header */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                      <Ionicons name="people-outline" size={14} color={Colors.gold} />
                      <Text style={{ fontSize: 13, fontFamily: 'Inter_700Bold', color: Colors.text, flex: 1 }}>{turma.nome}</Text>
                      <View style={{ backgroundColor: totalComPAP === alunosTurma.length ? Colors.success + '22' : Colors.warning + '22', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
                        <Text style={{ fontSize: 10, fontFamily: 'Inter_700Bold', color: totalComPAP === alunosTurma.length ? Colors.success : Colors.warning }}>
                          {totalComPAP}/{alunosTurma.length} lançados
                        </Text>
                      </View>
                    </View>

                    {/* Column headers */}
                    <View style={{ flexDirection: 'row', paddingHorizontal: 8, paddingVertical: 6, backgroundColor: Colors.primaryDark, borderRadius: 8, marginBottom: 4 }}>
                      <Text style={{ flex: 1, fontSize: 10, fontFamily: 'Inter_700Bold', color: Colors.textMuted }}>Aluno</Text>
                      <Text style={{ width: 50, fontSize: 10, fontFamily: 'Inter_700Bold', color: Colors.textMuted, textAlign: 'center' }}>Estágio</Text>
                      <Text style={{ width: 50, fontSize: 10, fontFamily: 'Inter_700Bold', color: Colors.textMuted, textAlign: 'center' }}>Defesa</Text>
                      <Text style={{ width: 50, fontSize: 10, fontFamily: 'Inter_700Bold', color: Colors.gold, textAlign: 'center' }}>PAP</Text>
                    </View>

                    {/* Students with PAP launched */}
                    {alunosTurma.map((aluno, idx) => {
                      const pap = papTurma.find(p => p.alunoId === aluno.id);
                      const papColor = pap?.notaPAP != null
                        ? (pap.notaPAP >= (config.notaMinimaAprovacao ?? 10) ? Colors.success : Colors.danger)
                        : Colors.textMuted;
                      const isEven = idx % 2 === 0;
                      return (
                        <View key={aluno.id} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 7, backgroundColor: isEven ? Colors.backgroundCard : Colors.surface, borderRadius: 6, marginBottom: 2 }}>
                          <Text style={{ flex: 1, fontSize: 12, fontFamily: 'Inter_500Medium', color: Colors.text }} numberOfLines={1}>
                            {aluno.nome} {aluno.apelido}
                          </Text>
                          <Text style={{ width: 50, fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textSecondary, textAlign: 'center' }}>
                            {pap?.notaEstagio != null ? pap.notaEstagio.toFixed(1) : '—'}
                          </Text>
                          <Text style={{ width: 50, fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textSecondary, textAlign: 'center' }}>
                            {pap?.notaDefesa != null ? pap.notaDefesa.toFixed(1) : '—'}
                          </Text>
                          <View style={{ width: 50, alignItems: 'center' }}>
                            {pap?.notaPAP != null ? (
                              <View style={{ backgroundColor: papColor + '22', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
                                <Text style={{ fontSize: 13, fontFamily: 'Inter_700Bold', color: papColor }}>
                                  {pap.notaPAP.toFixed(1)}
                                </Text>
                              </View>
                            ) : (
                              <Text style={{ fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textMuted }}>—</Text>
                            )}
                          </View>
                        </View>
                      );
                    })}

                    {totalSemPAP > 0 && (
                      <View style={{ flexDirection: 'row', gap: 6, marginTop: 6, alignItems: 'center', backgroundColor: Colors.warning + '12', borderRadius: 8, padding: 8 }}>
                        <Ionicons name="alert-circle-outline" size={14} color={Colors.warning} />
                        <Text style={{ fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.warning }}>
                          {totalSemPAP} aluno{totalSemPAP > 1 ? 's' : ''} sem PAP lançado
                        </Text>
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          )}
        </>
      );
    }

    if (user.role === 'aluno') {
      const aluno = alunos.find(a => a.nome.includes(user.nome.split(' ')[0]));
      const turmaAluno = aluno ? turmas.find(t => t.id === aluno.turmaId) : null;
      const notasAluno = aluno ? notas.filter(n => n.alunoId === aluno.id) : [];
      const mediaAluno = notasAluno.length > 0 ? (notasAluno.reduce((s, n) => s + n.mac, 0) / notasAluno.length).toFixed(1) : '—';
      const presAluno = aluno ? presencas.filter(p => p.alunoId === aluno.id) : [];
      const pctPresenca = presAluno.length > 0 ? Math.round((presAluno.filter(p => p.status === 'P').length / presAluno.length) * 100) : 100;

      return (
        <>
          {/* ── Dados Académicos (existente) ─────────────────────────────── */}
          <View style={styles.card}>
            <SectionHeader title="Dados Académicos" icon="library" />
            {aluno && (
              <>
                <View style={styles.statsGrid}>
                  <View style={styles.statItem}>
                    <Text style={[styles.statNum, { color: Colors.gold }]}>{mediaAluno}</Text>
                    <Text style={styles.statLbl}>Média</Text>
                  </View>
                  <View style={styles.statItem}>
                    <Text style={[styles.statNum, { color: Colors.success }]}>{pctPresenca}%</Text>
                    <Text style={styles.statLbl}>Presenças</Text>
                  </View>
                  <View style={styles.statItem}>
                    <Text style={[styles.statNum, { color: Colors.info }]}>{notasAluno.length}</Text>
                    <Text style={styles.statLbl}>Avaliações</Text>
                  </View>
                </View>
                <InfoRow label="N.º Matrícula" value={aluno.numeroMatricula} />
                <InfoRow label="Turma" value={turmaAluno?.nome || '—'} />
                <InfoRow label="Nível" value={turmaAluno?.nivel || '—'} />
                <InfoRow label="Encarregado" value={aluno.nomeEncarregado} />
                <InfoRow label="Tel. Encarregado" value={aluno.telefoneEncarregado} />
                <TouchableOpacity
                  style={styles.portalBtn}
                  onPress={() => router.push('/(main)/portal-estudante' as any)}
                >
                  <Ionicons name="grid" size={18} color="#fff" />
                  <Text style={styles.portalBtnText}>Aceder ao Portal do Estudante</Text>
                  <Ionicons name="chevron-forward" size={16} color="#fff" />
                </TouchableOpacity>
              </>
            )}
          </View>
        </>
      );
    }
    return null;
  }

  function renderSalaryCard() {
    const skipRoles = ['aluno', 'encarregado'];
    if (!user || skipRoles.includes(user.role)) return null;
    // For professors the EstimativaSalarialCard is in professor-hub; skip duplicate
    if (user.role === 'professor' && salEst) {
      // Still show below as standalone mini card
    }
    if (salEstLoading) {
      return (
        <View style={[styles.card, { alignItems: 'center', paddingVertical: 20 }]}>
          <AppLoader size="small" color={Colors.gold} />
          <Text style={{ color: Colors.textMuted, fontSize: 12, fontFamily: 'Inter_500Medium', marginTop: 8 }}>A calcular estimativa salarial...</Text>
        </View>
      );
    }
    if (!salEst) return null;

    const fmt = (v: number) => v.toLocaleString('pt-AO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' Kz';
    const mesNome = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'][Number(salEst.mes) - 1] ?? salEst.mes;
    const isColaborador = ['colaborador', 'contratado', 'prestacao_servicos'].includes(salEst.tipoContrato);

    const VINCULO_MAP: Record<string, { label: string; color: string }> = {
      efectivo:           { label: 'Efectivo',              color: Colors.success },
      colaborador:        { label: 'Colaborador',           color: Colors.info },
      contratado:         { label: 'Contratado',            color: '#FF9F0A' },
      prestacao_servicos: { label: 'Prestação de Serviços', color: '#AF52DE' },
    };
    const vinculo = VINCULO_MAP[salEst.tipoContrato] ?? { label: salEst.tipoContrato || 'Efectivo', color: Colors.success };

    return (
      <View style={[styles.card, { borderLeftWidth: 3, borderLeftColor: Colors.gold }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Ionicons name="wallet-outline" size={18} color={Colors.gold} />
            <Text style={{ fontSize: 14, fontFamily: 'Inter_700Bold', color: Colors.text }}>Estimativa Salarial</Text>
          </View>
          <View style={{ backgroundColor: Colors.gold + '22', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
            <Text style={{ fontSize: 11, fontFamily: 'Inter_600SemiBold', color: Colors.gold }}>{mesNome} {salEst.ano}</Text>
          </View>
        </View>
        {/* Vínculo contratual badge */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 }}>
          <Ionicons name="document-text-outline" size={13} color={vinculo.color} />
          <Text style={{ fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted }}>Vínculo:</Text>
          <View style={{ backgroundColor: vinculo.color + '22', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 }}>
            <Text style={{ fontSize: 11, fontFamily: 'Inter_700Bold', color: vinculo.color }}>{vinculo.label}</Text>
          </View>
        </View>

        {/* Tempos */}
        {salEst.temposSemanais > 0 && (
          <View style={{ marginBottom: 10, padding: 10, backgroundColor: Colors.primaryDark, borderRadius: 10, gap: 6 }}>
            <Text style={{ fontSize: 10, fontFamily: 'Inter_700Bold', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>
              Tempos Lectivos
            </Text>
            {/* Cálculo: semanais × 4 semanas = mensal */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={{ fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textMuted }}>Tempos por semana</Text>
              <Text style={{ fontSize: 13, fontFamily: 'Inter_700Bold', color: Colors.text }}>{salEst.temposSemanais}</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={{ fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textMuted }}>× 4 semanas/mês</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Text style={{ fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted }}>=</Text>
                <Text style={{ fontSize: 13, fontFamily: 'Inter_700Bold', color: Colors.info }}>{salEst.temposEsperados} tempos/mês</Text>
              </View>
            </View>
            <View style={{ height: 1, backgroundColor: Colors.border }} />
            {/* Trabalhados e Faltas */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <View style={{ alignItems: 'center', flex: 1 }}>
                <Text style={{ fontSize: 10, fontFamily: 'Inter_400Regular', color: Colors.textMuted }}>Total Esperado</Text>
                <Text style={{ fontSize: 16, fontFamily: 'Inter_700Bold', color: Colors.text }}>{salEst.temposEsperados}</Text>
              </View>
              <View style={{ width: 1, backgroundColor: Colors.border }} />
              <View style={{ alignItems: 'center', flex: 1 }}>
                <Text style={{ fontSize: 10, fontFamily: 'Inter_400Regular', color: Colors.textMuted }}>Trabalhados</Text>
                <Text style={{ fontSize: 16, fontFamily: 'Inter_700Bold', color: Colors.success }}>{salEst.temposTrabalhados}</Text>
              </View>
              <View style={{ width: 1, backgroundColor: Colors.border }} />
              <View style={{ alignItems: 'center', flex: 1 }}>
                <Text style={{ fontSize: 10, fontFamily: 'Inter_400Regular', color: Colors.danger }}>Faltas</Text>
                <Text style={{ fontSize: 16, fontFamily: 'Inter_700Bold', color: salEst.faltasMes > 0 ? Colors.danger : Colors.textMuted }}>{salEst.faltasMes}</Text>
              </View>
            </View>
            {salEst.temposComDadosReais && (
              <View style={{ alignSelf: 'flex-end', backgroundColor: Colors.success + '22', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 }}>
                <Text style={{ fontSize: 9, fontFamily: 'Inter_600SemiBold', color: Colors.success }}>✓ Dados Reais</Text>
              </View>
            )}
          </View>
        )}
        {/* Faltas visíveis mesmo sem tempos configurados */}
        {salEst.temposSemanais === 0 && salEst.faltasMes > 0 && (
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, padding: 10, backgroundColor: Colors.danger + '18', borderRadius: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name="warning-outline" size={14} color={Colors.danger} />
              <Text style={{ fontSize: 12, fontFamily: 'Inter_600SemiBold', color: Colors.danger }}>Faltas registadas</Text>
            </View>
            <Text style={{ fontSize: 15, fontFamily: 'Inter_700Bold', color: Colors.danger }}>{salEst.faltasMes}</Text>
          </View>
        )}

        {/* Breakdown — varies by contract type */}
        <View style={{ gap: 4 }}>

          {isColaborador && salEst.valorPorTempoLectivo > 0 ? (
            /* ── Colaborador / Contratado / Prestação de Serviços: pago por tempos ── */
            <>
              <View style={{ backgroundColor: Colors.primaryDark, borderRadius: 10, padding: 10, marginBottom: 4, gap: 5 }}>
                <Text style={{ fontSize: 10, fontFamily: 'Inter_700Bold', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>
                  Cálculo da Remuneração
                </Text>
                {/* Fórmula: tempos/semana × 4 semanas = tempos/mês */}
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text style={{ fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textMuted }}>{salEst.temposSemanais} tempos/sem × 4 sem</Text>
                  <Text style={{ fontSize: 12, fontFamily: 'Inter_600SemiBold', color: Colors.info }}>{salEst.temposEsperados} tempos/mês</Text>
                </View>
                {salEst.faltasMes > 0 && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Text style={{ fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.danger }}>− Faltas ({salEst.faltasMes})</Text>
                    <Text style={{ fontSize: 12, fontFamily: 'Inter_600SemiBold', color: Colors.danger }}>{salEst.temposTrabalhados} tempos</Text>
                  </View>
                )}
                <View style={{ height: 1, backgroundColor: Colors.border, marginVertical: 2 }} />
                {/* Cálculo final: tempos trabalhados × valor/tempo */}
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text style={{ fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textMuted }}>Valor por tempo</Text>
                  <Text style={{ fontSize: 12, fontFamily: 'Inter_600SemiBold', color: Colors.text }}>{fmt(salEst.valorPorTempoLectivo)}</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text style={{ fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textMuted }}>× {salEst.temposTrabalhados} tempos trabalhados</Text>
                  <Text style={{ fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted }}>=</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 2 }}>
                  <Text style={{ fontSize: 13, fontFamily: 'Inter_700Bold', color: Colors.text }}>Remuneração Bruta</Text>
                  <Text style={{ fontSize: 14, fontFamily: 'Inter_700Bold', color: vinculo.color }}>{fmt(salEst.salColaborador || (salEst.valorPorTempoLectivo * salEst.temposTrabalhados))}</Text>
                </View>
              </View>
              {salEst.salarioBase > 0 && (
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textMuted }}>+ Salário Base Fixo</Text>
                  <Text style={{ fontSize: 12, fontFamily: 'Inter_500Medium', color: Colors.text }}>{fmt(salEst.salarioBase)}</Text>
                </View>
              )}
            </>
          ) : (
            /* ── Efectivo: fixed monthly salary ── */
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                <Text style={{ fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textMuted }}>Salário Base</Text>
                <View style={{ backgroundColor: Colors.success + '18', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 }}>
                  <Text style={{ fontSize: 9, fontFamily: 'Inter_700Bold', color: Colors.success }}>Mensal fixo</Text>
                </View>
              </View>
              <Text style={{ fontSize: 12, fontFamily: 'Inter_500Medium', color: Colors.text }}>{fmt(salEst.salarioBase)}</Text>
            </View>
          )}

          {salEst.subsidioAlimentacao > 0 && (
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textMuted }}>Subsídio Alimentação</Text>
              <Text style={{ fontSize: 12, fontFamily: 'Inter_500Medium', color: Colors.text }}>+{fmt(salEst.subsidioAlimentacao)}</Text>
            </View>
          )}
          {salEst.subsidioTransporte > 0 && (
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textMuted }}>Subsídio Transporte</Text>
              <Text style={{ fontSize: 12, fontFamily: 'Inter_500Medium', color: Colors.text }}>+{fmt(salEst.subsidioTransporte)}</Text>
            </View>
          )}
          {salEst.descontoTempos > 0 && (
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.danger }}>Desconto Tempos</Text>
              <Text style={{ fontSize: 12, fontFamily: 'Inter_500Medium', color: Colors.danger }}>-{fmt(salEst.descontoTempos)}</Text>
            </View>
          )}
          {!isColaborador && salEst.descontoFaltas > 0 && (
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.danger }}>Desconto Faltas</Text>
              <Text style={{ fontSize: 12, fontFamily: 'Inter_500Medium', color: Colors.danger }}>-{fmt(salEst.descontoFaltas)}</Text>
            </View>
          )}
          <View style={{ height: 1, backgroundColor: Colors.border, marginVertical: 4 }} />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textMuted }}>Salário Bruto</Text>
            <Text style={{ fontSize: 12, fontFamily: 'Inter_600SemiBold', color: Colors.text }}>{fmt(salEst.salarioBruto)}</Text>
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textMuted }}>INSS ({salEst.inssEmpPerc}%)</Text>
            <Text style={{ fontSize: 12, fontFamily: 'Inter_500Medium', color: Colors.danger }}>-{fmt(salEst.inssEmpregado)}</Text>
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textMuted }}>IRT</Text>
            <Text style={{ fontSize: 12, fontFamily: 'Inter_500Medium', color: Colors.danger }}>-{fmt(salEst.irt)}</Text>
          </View>
          <View style={{ height: 1, backgroundColor: Colors.border, marginVertical: 4 }} />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ fontSize: 13, fontFamily: 'Inter_700Bold', color: Colors.text }}>Salário Líquido</Text>
            <Text style={{ fontSize: 16, fontFamily: 'Inter_700Bold', color: Colors.success }}>{fmt(salEst.salarioLiquido)}</Text>
          </View>
        </View>
        {/* Legenda: taxa por tempo + desconto por falta */}
        <View style={{ marginTop: 10, padding: 10, backgroundColor: Colors.primaryDark, borderRadius: 10, gap: 4 }}>
          <Text style={{ fontSize: 10, fontFamily: 'Inter_700Bold', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>
            Referência de Taxas
          </Text>
          {salEst.valorPorTempoLectivo > 0 && (
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted }}>Ganho por tempo lectivo</Text>
              <Text style={{ fontSize: 11, fontFamily: 'Inter_600SemiBold', color: Colors.success }}>{fmt(salEst.valorPorTempoLectivo)}</Text>
            </View>
          )}
          {salEst.valorPorFaltaAplicado > 0 && (
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted }}>Desconto por falta</Text>
              <Text style={{ fontSize: 11, fontFamily: 'Inter_600SemiBold', color: Colors.danger }}>-{fmt(salEst.valorPorFaltaAplicado)}</Text>
            </View>
          )}
        </View>
        <Text style={{ fontSize: 10, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 8, textAlign: 'right' }}>
          * Estimativa baseada nos dados actuais. Sujeito a revisão pelo departamento de RH.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <TopBar title="Perfil" subtitle="Dados pessoais e configurações" />

      <ScrollView style={styles.scroll} contentContainerStyle={{ paddingBottom: bottomInset + 32 }} showsVerticalScrollIndicator={false}>
        {/* ── Editar Perfil — bloco único com foto + dados + senha ── */}
        <View style={styles.editPerfilCard}>
          {/* Avatar + câmara */}
          <View style={{ alignItems: 'center', marginBottom: 12 }}>
            <TouchableOpacity style={styles.avatarWrapper} onPress={handlePickPhoto} activeOpacity={0.8}>
              <AvatarCircle nome={user.nome} avatar={avatarUri} size={88} fontSize={34} />
              <View style={styles.cameraOverlay}>
                <Ionicons name="camera" size={15} color="#fff" />
              </View>
            </TouchableOpacity>
            <View style={[styles.roleIndicator, { backgroundColor: roleBadgeColor, marginTop: 10 }]}>
              <Text style={styles.roleIndicatorText}>{roleLabel}</Text>
            </View>
            <Text style={{ fontSize: 11, color: Colors.textMuted, fontFamily: 'Inter_400Regular', marginTop: 6 }}>
              Toca na foto para alterar
            </Text>
          </View>

          <View style={{ height: 1, backgroundColor: Colors.border, marginBottom: 16 }} />

          {/* Nome */}
          <Text style={styles.editPerfilLabel}>Nome de apresentação</Text>
          <TextInput
            style={styles.editPerfilInput}
            value={perfilNome}
            onChangeText={v => { setPerfilNome(v); setPerfilSaveError(''); setPerfilSaveOk(false); }}
            placeholder="Nome completo"
            placeholderTextColor={Colors.textMuted}
            autoCapitalize="words"
            returnKeyType="next"
            editable={!['aluno', 'encarregado'].includes(user.role)}
          />

          {/* Telemóvel */}
          <Text style={styles.editPerfilLabel}>Telemóvel</Text>
          <TextInput
            style={styles.editPerfilInput}
            value={perfilTelefone}
            onChangeText={v => { setPerfilTelefone(v); setPerfilSaveError(''); setPerfilSaveOk(false); }}
            placeholder="+244 9xx xxx xxx"
            placeholderTextColor={Colors.textMuted}
            keyboardType="phone-pad"
            returnKeyType="done"
          />

          {/* Email (só leitura) */}
          <Text style={styles.editPerfilLabel}>Email institucional</Text>
          <View style={[styles.editPerfilInput, { justifyContent: 'center', opacity: 0.55 }]}>
            <Text style={{ fontSize: 14, fontFamily: 'Inter_400Regular', color: Colors.text }}>{user.email}</Text>
          </View>

          {/* Feedback de guardar */}
          {!!perfilSaveError && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.danger + '18', borderRadius: 10, padding: 10, marginBottom: 10 }}>
              <Ionicons name="alert-circle-outline" size={15} color={Colors.danger} />
              <Text style={{ flex: 1, fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.danger }}>{perfilSaveError}</Text>
            </View>
          )}
          {perfilSaveOk && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.success + '18', borderRadius: 10, padding: 10, marginBottom: 10 }}>
              <Ionicons name="checkmark-circle-outline" size={15} color={Colors.success} />
              <Text style={{ flex: 1, fontSize: 12, fontFamily: 'Inter_600SemiBold', color: Colors.success }}>Dados guardados com sucesso.</Text>
            </View>
          )}

          {/* Botão Guardar Dados */}
          <TouchableOpacity
            style={[styles.editPerfilSaveBtn, { opacity: isSaving ? 0.6 : 1 }]}
            onPress={savePerfilDados}
            disabled={isSaving}
            activeOpacity={0.8}
          >
            {isSaving
              ? <AppLoader size="small" color="#fff" />
              : <>
                  <Ionicons name="checkmark-circle" size={17} color="#fff" />
                  <Text style={styles.editPerfilSaveTxt}>Guardar Dados</Text>
                </>
            }
          </TouchableOpacity>

          {/* Divisor */}
          <View style={{ height: 1, backgroundColor: Colors.border, marginVertical: 18 }} />

          {/* Secção Alterar Senha — toggle inline */}
          <TouchableOpacity
            style={styles.editPerfilSenhaToggle}
            onPress={() => {
              setShowInlineSenha(!showInlineSenha);
              if (showInlineSenha) { setSenhaAtual(''); setSenhaNova(''); setSenhaConfirm(''); setSenhaError(''); }
            }}
            activeOpacity={0.75}
          >
            <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: Colors.gold + '22', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="key" size={17} color={Colors.gold} />
            </View>
            <Text style={styles.editPerfilSenhaTogTxt}>Alterar Senha</Text>
            <Ionicons name={showInlineSenha ? 'chevron-up' : 'chevron-down'} size={16} color={Colors.textMuted} />
          </TouchableOpacity>

          {showInlineSenha && (
            <View style={{ marginTop: 14, gap: 8 }}>
              <Text style={styles.editPerfilLabel}>Senha actual</Text>
              <TextInput
                style={styles.editPerfilInput}
                value={senhaAtual}
                onChangeText={v => { setSenhaAtual(v); setSenhaError(''); }}
                secureTextEntry
                placeholder="Introduz a senha actual"
                placeholderTextColor={Colors.textMuted}
                autoFocus
                returnKeyType="next"
                onSubmitEditing={() => senhaNovaRef.current?.focus()}
              />
              <Text style={styles.editPerfilLabel}>Nova senha</Text>
              <TextInput
                ref={senhaNovaRef}
                style={styles.editPerfilInput}
                value={senhaNova}
                onChangeText={v => { setSenhaNova(v); setSenhaError(''); }}
                secureTextEntry
                placeholder="Mínimo 6 caracteres"
                placeholderTextColor={Colors.textMuted}
                returnKeyType="next"
                onSubmitEditing={() => senhaConfirmRef.current?.focus()}
              />
              <Text style={styles.editPerfilLabel}>Confirmar nova senha</Text>
              <TextInput
                ref={senhaConfirmRef}
                style={styles.editPerfilInput}
                value={senhaConfirm}
                onChangeText={v => { setSenhaConfirm(v); setSenhaError(''); }}
                secureTextEntry
                placeholder="Repetir nova senha"
                placeholderTextColor={Colors.textMuted}
                returnKeyType="done"
                onSubmitEditing={handleChangeSenha}
              />
              {!!senhaError && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.danger + '18', borderRadius: 10, padding: 10 }}>
                  <Ionicons name="alert-circle-outline" size={15} color={Colors.danger} />
                  <Text style={{ flex: 1, fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.danger }}>{senhaError}</Text>
                </View>
              )}
              <TouchableOpacity
                style={[styles.editPerfilSaveBtn, { backgroundColor: Colors.gold, opacity: isSavingSenha ? 0.6 : 1 }]}
                onPress={handleChangeSenha}
                disabled={isSavingSenha}
                activeOpacity={0.8}
              >
                {isSavingSenha
                  ? <AppLoader size="small" color="#fff" />
                  : <>
                      <Ionicons name="lock-closed" size={16} color="#fff" />
                      <Text style={styles.editPerfilSaveTxt}>Confirmar Nova Senha</Text>
                    </>
                }
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Role-specific section */}
        {renderRoleSection()}

        {/* Salary estimation card */}
        {renderSalaryCard()}

        {/* Dados institucionais (só leitura) */}
        <View style={styles.card}>
          <SectionHeader title="Conta Institucional" icon="business" />
          <InfoRow label="Instituição" value={user.escola} />
          <InfoRow label="Perfil de acesso" value={roleLabel} />
        </View>

        {/* Segurança — só biometria (senha está no bloco de editar perfil acima) */}
        <View style={styles.card}>
          <SectionHeader title="Segurança" icon="lock-closed" />
          <View style={styles.switchRow}>
            <View style={styles.switchInfo}>
              <Ionicons name="finger-print" size={20} color={Platform.OS === 'web' ? Colors.textMuted : Colors.info} />
              <View>
                <Text style={[styles.switchLabel, Platform.OS === 'web' && { color: Colors.textMuted }]}>Autenticação Biométrica</Text>
                <Text style={styles.switchSub}>
                  {Platform.OS === 'web' ? 'Disponível apenas na app móvel' : 'Face ID / Impressão Digital'}
                </Text>
              </View>
            </View>
            <Switch
              value={Platform.OS === 'web' ? false : biometricEnabled}
              onValueChange={Platform.OS === 'web' ? undefined : handleBiometric}
              disabled={Platform.OS === 'web'}
              trackColor={{ false: Colors.border, true: Colors.info + '66' }}
              thumbColor={!Platform.OS || Platform.OS === 'web' ? Colors.border : biometricEnabled ? Colors.info : Colors.textMuted}
            />
          </View>
          {Platform.OS === 'web' && (
            <View style={styles.webBioNote}>
              <Ionicons name="information-circle-outline" size={14} color={Colors.textMuted} />
              <Text style={styles.webBioNoteText}>Para usar biometria, instale a app Super Escola no seu telemóvel.</Text>
            </View>
          )}
        </View>

        {/* Sessão */}
        <View style={styles.card}>
          <SectionHeader title="Sessão" icon="time" />
          <InfoRow label="Último acesso" value={new Date().toLocaleDateString('pt-PT', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })} />
          <InfoRow label="Dispositivo" value={Platform.OS === 'web' ? 'Navegador Web' : Platform.OS === 'ios' ? 'iPhone' : 'Android'} />
          <InfoRow label="Versão" value={`${config.nomeEscola || 'Super Escola'} v1.03`} />
        </View>

        {/* Cartão Digital — apenas para funcionários */}
        {!['aluno', 'encarregado'].includes(user.role) && (
          <View style={styles.card}>
            <SectionHeader title="Cartão Digital de Funcionário" icon="id-card" />
            <View style={{ marginTop: 8 }}>
              <CartaoFuncionarioVisual nomeEscola={config?.nomeEscola || 'Super Escola'} />
            </View>
          </View>
        )}

        {/* ── Segurança — Telegram OTP ──────────────────────────────────────── */}
        <View style={[styles.card, { borderLeftWidth: 3, borderLeftColor: telegramConfigured ? '#229ED9' : Colors.textMuted }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: telegramConfigured ? 'rgba(34,158,217,0.15)' : 'rgba(255,255,255,0.06)', alignItems: 'center', justifyContent: 'center' }}>
                <MaterialCommunityIcons name="send" size={18} color={telegramConfigured ? '#229ED9' : Colors.textMuted} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontFamily: 'Inter_700Bold', color: Colors.text }}>Verificação via Telegram</Text>
                <Text style={{ fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 1 }}>
                  Receba o código OTP no Telegram em vez do email
                </Text>
              </View>
              <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, backgroundColor: telegramLinked ? 'rgba(48,209,88,0.15)' : 'rgba(255,255,255,0.06)' }}>
                <Text style={{ fontSize: 10, fontFamily: 'Inter_600SemiBold', color: telegramLinked ? Colors.success : Colors.textMuted }}>
                  {telegramLinked ? 'Ligado' : telegramConfigured ? 'Desligado' : 'Inactivo'}
                </Text>
              </View>
            </View>

            {!telegramConfigured ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 10 }}>
                <Ionicons name="information-circle-outline" size={16} color={Colors.textMuted} />
                <Text style={{ flex: 1, fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textMuted, lineHeight: 18 }}>
                  O Telegram OTP não está activo neste servidor. Contacte o administrador para configurar o bot.
                </Text>
              </View>
            ) : telegramLinked ? (
              <View style={{ gap: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, backgroundColor: 'rgba(48,209,88,0.08)', borderRadius: 10 }}>
                  <Ionicons name="checkmark-circle" size={16} color={Colors.success} />
                  <Text style={{ flex: 1, fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textMuted }}>
                    Telegram ligado. Os códigos de login serão enviados para a sua conta Telegram.
                  </Text>
                </View>
                <TouchableOpacity
                  style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, padding: 10, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(231,76,60,0.3)', backgroundColor: 'rgba(231,76,60,0.06)' }}
                  onPress={async () => {
                    if (telegramUnlinking) return;
                    Alert.alert(
                      'Desligar Telegram',
                      'Tem a certeza? Os códigos OTP voltarão a ser enviados por email.',
                      [
                        { text: 'Cancelar', style: 'cancel' },
                        {
                          text: 'Desligar', style: 'destructive',
                          onPress: async () => {
                            setTelegramUnlinking(true);
                            try {
                              await api.delete('/api/telegram/unlink');
                              setTelegramLinked(false);
                              setTelegramLinkUrl('');
                            } catch {
                              Alert.alert('Erro', 'Não foi possível desligar o Telegram. Tente novamente.');
                            } finally {
                              setTelegramUnlinking(false);
                            }
                          },
                        },
                      ]
                    );
                  }}
                >
                  {telegramUnlinking
                    ? <AppLoader size="small" color={Colors.danger} />
                    : <MaterialCommunityIcons name="link-off" size={14} color={Colors.danger} />}
                  <Text style={{ fontSize: 13, fontFamily: 'Inter_600SemiBold', color: Colors.danger }}>
                    {telegramUnlinking ? 'A desligar...' : 'Desligar Telegram'}
                  </Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={{ gap: 8 }}>
                <Text style={{ fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textMuted, lineHeight: 18 }}>
                  Ligue a sua conta ao Telegram para receber os códigos de verificação de forma instantânea e fiável, sem depender do email.
                </Text>
                {telegramLinkUrl ? (
                  <View style={{ gap: 6 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, backgroundColor: 'rgba(34,158,217,0.08)', borderRadius: 10 }}>
                      <Ionicons name="information-circle-outline" size={16} color="#229ED9" />
                      <Text style={{ flex: 1, fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textMuted }}>
                        Clique no botão abaixo para abrir o Telegram e confirmar a ligação. O link expira em 15 minutos.
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 12, borderRadius: 10, backgroundColor: '#229ED9' }}
                      onPress={() => Linking.openURL(telegramLinkUrl).catch(() => Alert.alert('Erro', 'Não foi possível abrir o Telegram. Instale a aplicação e tente novamente.'))}
                    >
                      <MaterialCommunityIcons name="send" size={16} color="#fff" />
                      <Text style={{ fontSize: 14, fontFamily: 'Inter_700Bold', color: '#fff' }}>Abrir no Telegram</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={{ alignItems: 'center', padding: 8 }}
                      onPress={async () => {
                        setTelegramLinking(true);
                        try {
                          const r = await api.post<{ url: string }>('/api/telegram/link', {});
                          setTelegramLinkUrl((r as any)?.url || '');
                        } catch {
                          Alert.alert('Erro', 'Não foi possível gerar novo link.');
                        } finally {
                          setTelegramLinking(false);
                        }
                      }}
                    >
                      <Text style={{ fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textMuted }}>Gerar novo link</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={{ alignItems: 'center', padding: 6 }}
                      onPress={async () => {
                        const r = await api.get<{ linked: boolean }>('/api/telegram/status').catch(() => null);
                        if ((r as any)?.linked) {
                          setTelegramLinked(true);
                          setTelegramLinkUrl('');
                        } else {
                          Alert.alert('Ainda não ligado', 'Abra o link no Telegram e confirme a ligação primeiro.');
                        }
                      }}
                    >
                      <Text style={{ fontSize: 12, fontFamily: 'Inter_500Medium', color: Colors.gold }}>✓ Já confirmei no Telegram</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 12, borderRadius: 10, backgroundColor: 'rgba(34,158,217,0.15)', borderWidth: 1, borderColor: 'rgba(34,158,217,0.4)' }}
                    onPress={async () => {
                      if (telegramLinking) return;
                      setTelegramLinking(true);
                      try {
                        // Obter token explicitamente e incluir na query string como fallback
                        const { getAuthToken } = await import('@/context/AuthContext');
                        const tok = await getAuthToken();
                        const qs = tok ? `?token=${encodeURIComponent(tok)}` : '';
                        const r = await api.post<{ url: string }>(`/api/telegram/link${qs}`, {});
                        const url = (r as any)?.url;
                        if (url) {
                          setTelegramLinkUrl(url);
                        } else {
                          Alert.alert('Erro', 'O servidor não devolveu o link. Tente novamente.');
                        }
                      } catch (err: any) {
                        Alert.alert('Erro', err?.message || 'Não foi possível gerar o link Telegram.');
                      } finally {
                        setTelegramLinking(false);
                      }
                    }}
                  >
                    {telegramLinking
                      ? <AppLoader size="small" color="#229ED9" />
                      : <MaterialCommunityIcons name="send" size={16} color="#229ED9" />}
                    <Text style={{ fontSize: 14, fontFamily: 'Inter_700Bold', color: '#229ED9' }}>
                      {telegramLinking ? 'A gerar link...' : 'Ligar ao Telegram'}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>

        {/* Logout */}
        <TouchableOpacity style={styles.logoutBtn} onPress={() => setConfirmLogout(true)}>
          <Ionicons name="log-out-outline" size={20} color={Colors.accent} />
          <Text style={styles.logoutText}>Terminar Sessão</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Logout Confirm Modal */}
      {confirmLogout && (
        <View style={styles.editOverlay}>
          <View style={[styles.editBox, { alignItems: 'center', gap: 6 }]}>
            <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: 'rgba(231,76,60,0.12)', alignItems: 'center', justifyContent: 'center', marginBottom: 4 }}>
              <Ionicons name="log-out" size={26} color={Colors.danger} />
            </View>
            <Text style={[styles.editTitle, { textAlign: 'center' }]}>Terminar Sessão?</Text>
            <Text style={{ fontSize: 13, fontFamily: 'Inter_400Regular', color: Colors.textMuted, textAlign: 'center', marginBottom: 12 }}>
              A sua sessão será encerrada.
            </Text>
            <View style={styles.editActions}>
              <TouchableOpacity
                style={styles.editCancelBtn}
                onPress={() => setConfirmLogout(false)}
                disabled={isLoggingOut}
              >
                <Text style={styles.editCancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.editSaveBtn, { backgroundColor: Colors.danger, opacity: isLoggingOut ? 0.6 : 1 }]}
                onPress={doLogout}
                disabled={isLoggingOut}
              >
                <Text style={styles.editSaveText}>{isLoggingOut ? 'A sair...' : 'Sair'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {/* Edit Modal (fallback, used by other role-specific sections if needed) */}
      {editField && (
        <View style={styles.editOverlay}>
          <View style={styles.editBox}>
            <Text style={styles.editTitle}>{editLabel || 'Editar Campo'}</Text>
            <TextInput
              style={styles.editInput}
              value={editValue}
              onChangeText={v => { setEditValue(v); setSaveError(''); }}
              autoFocus
              placeholderTextColor={Colors.textMuted}
              keyboardType={editField === 'telefone' ? 'phone-pad' : editField === 'email' ? 'email-address' : 'default'}
              autoCapitalize={editField === 'email' ? 'none' : 'words'}
              returnKeyType="done"
              onSubmitEditing={saveEdit}
            />
            {!!saveError && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10, backgroundColor: Colors.danger + '18', borderRadius: 8, padding: 10 }}>
                <Ionicons name="alert-circle-outline" size={15} color={Colors.danger} />
                <Text style={{ flex: 1, fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.danger }}>{saveError}</Text>
              </View>
            )}
            <View style={styles.editActions}>
              <TouchableOpacity style={styles.editCancelBtn} onPress={() => setEditField(null)} disabled={isSaving}>
                <Text style={styles.editCancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.editSaveBtn, { opacity: isSaving ? 0.6 : 1 }]} onPress={saveEdit} disabled={isSaving}>
                {isSaving ? <AppLoader size="small" color="#fff" /> : <Text style={styles.editSaveText}>Guardar</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  scroll: { flex: 1 },
  // ── Editar Perfil inline card ──
  editPerfilCard: {
    margin: 16,
    marginBottom: 0,
    backgroundColor: Colors.backgroundCard,
    borderRadius: 18,
    padding: 20,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  editPerfilLabel: {
    fontSize: 10,
    fontFamily: 'Inter_600SemiBold',
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 6,
    marginTop: 4,
  },
  editPerfilInput: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    color: Colors.text,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 10,
  },
  editPerfilSaveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.accent,
    borderRadius: 12,
    paddingVertical: 13,
    marginTop: 4,
  },
  editPerfilSaveTxt: {
    fontSize: 14,
    fontFamily: 'Inter_700Bold',
    color: '#fff',
  },
  editPerfilSenhaToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 4,
  },
  editPerfilSenhaTogTxt: {
    flex: 1,
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
    color: Colors.text,
  },
  // ── Legacy (kept for other sections) ──
  profileHeader: { alignItems: 'center', padding: 28, paddingBottom: 20, backgroundColor: Colors.primaryDark, borderBottomWidth: 1, borderBottomColor: Colors.border },
  avatarWrapper: { alignItems: 'center', marginBottom: 12, position: 'relative' },
  cameraOverlay: { position: 'absolute', bottom: 0, right: -4, backgroundColor: Colors.accent, borderRadius: 14, width: 28, height: 28, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: Colors.backgroundCard },
  avatarCircle: { backgroundColor: Colors.accent, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: Colors.gold },
  avatarText: { fontFamily: 'Inter_700Bold', color: '#fff' },
  roleIndicator: { marginTop: 8, paddingHorizontal: 14, paddingVertical: 4, borderRadius: 12 },
  roleIndicatorText: { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: '#fff' },
  profileName: { fontSize: 22, fontFamily: 'Inter_700Bold', color: Colors.text, marginBottom: 4 },
  profileEmail: { fontSize: 14, fontFamily: 'Inter_400Regular', color: Colors.textSecondary, marginBottom: 2 },
  profileEscola: { fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textMuted },
  card: { margin: 16, marginBottom: 0, backgroundColor: Colors.backgroundCard, borderRadius: 16, padding: 16 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: Colors.border },
  sectionHeaderText: { fontSize: 13, fontFamily: 'Inter_700Bold', color: Colors.text, textTransform: 'uppercase', letterSpacing: 1 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  statItem: { flex: 1, minWidth: '22%', backgroundColor: Colors.surface, borderRadius: 12, padding: 12, alignItems: 'center' },
  statNum: { fontSize: 22, fontFamily: 'Inter_700Bold' },
  statLbl: { fontSize: 10, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 2, textAlign: 'center' },
  infoRow: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.border },
  infoLabel: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginBottom: 3, textTransform: 'uppercase', letterSpacing: 0.6 },
  infoValueRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  infoValue: { flex: 1, fontSize: 14, fontFamily: 'Inter_500Medium', color: Colors.text },
  editIcon: { padding: 4 },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.border },
  switchInfo: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  switchLabel: { fontSize: 14, fontFamily: 'Inter_500Medium', color: Colors.text },
  switchSub: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted },
  webBioNote: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 4 },
  webBioNoteText: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted, flex: 1 },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  actionLabel: { flex: 1, fontSize: 14, fontFamily: 'Inter_500Medium', color: Colors.text },
  logoutBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, margin: 16, marginTop: 16, padding: 15, backgroundColor: Colors.accent + '22', borderRadius: 14, borderWidth: 1, borderColor: Colors.accent + '44' },
  logoutText: { fontSize: 15, fontFamily: 'Inter_600SemiBold', color: Colors.accent },
  portalBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 14, padding: 13, backgroundColor: Colors.accent, borderRadius: 12 },
  portalBtnText: { flex: 1, fontSize: 14, fontFamily: 'Inter_700Bold', color: '#fff', textAlign: 'center' },
  editOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  editBox: { backgroundColor: Colors.backgroundCard, borderRadius: 16, padding: 20, width: '100%' },
  editTitle: { fontSize: 16, fontFamily: 'Inter_700Bold', color: Colors.text, marginBottom: 14 },
  editInput: { backgroundColor: Colors.surface, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, fontFamily: 'Inter_400Regular', color: Colors.text, borderWidth: 1, borderColor: Colors.border, marginBottom: 16 },
  editActions: { flexDirection: 'row', gap: 10 },
  editCancelBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: Colors.surface, alignItems: 'center' },
  editCancelText: { fontSize: 14, fontFamily: 'Inter_600SemiBold', color: Colors.textSecondary },
  editSaveBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: Colors.accent, alignItems: 'center' },
  editSaveText: { fontSize: 14, fontFamily: 'Inter_700Bold', color: '#fff' },
});
