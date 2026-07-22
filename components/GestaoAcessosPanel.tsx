import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Switch, TextInput, Platform, Modal, ActivityIndicator, Animated,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Colors } from '@/constants/colors';
import { useUsers } from '@/context/UsersContext';
import {
  usePermissoes,
  FEATURE_CATEGORIES,
  ROLE_DEFAULTS,
  PermKey,
} from '@/context/PermissoesContext';
import { useAuth, getAuthToken } from '@/context/AuthContext';
import { getRoleLabel } from '@/utils/genero';
import { StableSearchInput } from '@/components/StableSearchInput';
import AppLoader from '@/components/AppLoader';

// ── Catálogo de cargos ─────────────────────────────────────────────────────
const ROLES_CATALOG = [
  { key: 'ceo',                    label: 'CEO',                  icon: 'ribbon',            color: '#8B5CF6', desc: 'Controlo Total' },
  { key: 'pca',                    label: 'PCA Escolar',          icon: 'star',              color: '#F59E0B', desc: 'Presidente do Conselho' },
  { key: 'admin',                  label: 'Administrador',        icon: 'shield-checkmark',  color: '#3B82F6', desc: 'Gestão do Sistema' },
  { key: 'director',               label: 'Director',             icon: 'briefcase',         color: '#4A90D9', desc: 'Direcção Pedagógica' },
  { key: 'subdirector_pedagogico', label: 'Sub-Dir. Pedagógico',  icon: 'school',            color: '#0EA5E9', desc: 'Direcção Pedagógica' },
  { key: 'subdiretor_administrativo', label: 'Sub-Director Adm.',  icon: 'business',         color: '#7C3AED', desc: 'Direcção Administrativa' },
  { key: 'chefe_secretaria',       label: 'Chefe de Secretaria',  icon: 'key',               color: '#E11D48', desc: 'Secretaria' },
  { key: 'secretaria',             label: 'Secretária',           icon: 'documents',         color: '#F59E0B', desc: 'Serviços Administrativos' },
  { key: 'professor',              label: 'Professor',            icon: 'book',              color: '#06B6D4', desc: 'Corpo Docente' },
  { key: 'diretor_turma',          label: 'Director de Turma',    icon: 'ribbon',            color: '#0EA5E9', desc: 'Responsável de Turma' },
  { key: 'financeiro',             label: 'Financeiro',           icon: 'cash',              color: '#10B981', desc: 'Gestão Financeira' },
  { key: 'rh',                     label: 'Recursos Humanos',     icon: 'person-circle',     color: '#06B6D4', desc: 'Recursos Humanos' },
  { key: 'pedagogico',             label: 'Pedagógico',           icon: 'school',            color: '#8B5CF6', desc: 'Coordenação Pedagógica' },
  { key: 'coordenador_curso',      label: 'Coord. de Curso',      icon: 'albums',            color: '#F97316', desc: 'Coordenação de Curso' },
  { key: 'aluno',                  label: 'Aluno',                icon: 'person',            color: '#22C55E', desc: 'Corpo Discente' },
  { key: 'encarregado',            label: 'Encarregado',          icon: 'people',            color: '#F97316', desc: 'Encarregados de Educação' },
];

const TOTAL_FEATURES = FEATURE_CATEGORIES.reduce((s, c) => s + c.features.length, 0);

function initials(nome: string) {
  return nome.split(' ').filter(Boolean).map(n => n[0]).slice(0, 2).join('').toUpperCase();
}

// ── IntelBadge (permissões) ────────────────────────────────────────────────
function IntelBadge({ isOn, isRoleDefault }: { isOn: boolean; isRoleDefault: boolean }) {
  if (isOn && isRoleDefault)  return <View style={[badge.base, { backgroundColor: Colors.success + '20', borderColor: Colors.success + '44' }]}><Ionicons name="eye" size={9} color={Colors.success} /><Text style={[badge.text, { color: Colors.success }]}>Visível</Text></View>;
  if (isOn && !isRoleDefault) return <View style={[badge.base, { backgroundColor: Colors.info + '20', borderColor: Colors.info + '44' }]}><Ionicons name="add-circle" size={9} color={Colors.info} /><Text style={[badge.text, { color: Colors.info }]}>Extra</Text></View>;
  if (!isOn && isRoleDefault) return <View style={[badge.base, { backgroundColor: Colors.danger + '20', borderColor: Colors.danger + '44' }]}><Ionicons name="eye-off" size={9} color={Colors.danger} /><Text style={[badge.text, { color: Colors.danger }]}>Oculto</Text></View>;
  return <View style={[badge.base, { backgroundColor: Colors.border, borderColor: Colors.border }]}><Ionicons name="remove-circle-outline" size={9} color={Colors.textMuted} /><Text style={[badge.text, { color: Colors.textMuted }]}>Inactivo</Text></View>;
}
const badge = StyleSheet.create({
  base: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 5, paddingVertical: 2, borderRadius: 6, borderWidth: 1 },
  text: { fontSize: 9, fontFamily: 'Inter_600SemiBold' },
});

// ══════════════════════════════════════════════════════════════════════════════
export default function GestaoAcessosPanel() {
  const { user: authUser } = useAuth();
  const { users, refreshUsers } = useUsers();
  const { getUserPermissions, saveUserPermissions, resetUserPermissions, isLoading, allUserPermissions } = usePermissoes();

  // ── View state ────────────────────────────────────────────────────────────
  const [selectedRole, setSelectedRole]   = useState<string | null>(null);
  const [showAddUser,  setShowAddUser]    = useState(false);
  const [addSearch,    setAddSearch]      = useState('');
  const [assigning,    setAssigning]      = useState<string | null>(null);
  const [roleSearch,   setRoleSearch]     = useState('');
  const [moveSuccess,  setMoveSuccess]    = useState<{ nome: string; fromRole: string } | null>(null);
  const successAnim = useRef(new Animated.Value(0)).current;

  // ── Permissions modal state ────────────────────────────────────────────────
  const [selectedUserId,  setSelectedUserId]  = useState<string | null>(null);
  const [editedPerms,     setEditedPerms]     = useState<Record<string, boolean>>({});
  const [saving,          setSaving]          = useState(false);
  const [saved,           setSaved]           = useState(false);
  const [expandedCats,    setExpandedCats]    = useState<Set<string>>(new Set());
  const [showPermModal,   setShowPermModal]   = useState(false);

  const managedUsers = useMemo(() => users.filter((u: any) => u.id !== authUser?.id), [users, authUser?.id]);

  // Group users by role
  const usersByRole = useMemo(() => {
    const map: Record<string, any[]> = {};
    for (const u of managedUsers) {
      if (!map[u.role]) map[u.role] = [];
      map[u.role].push(u);
    }
    return map;
  }, [managedUsers]);

  // Roles to show in grid: catalog + any extra roles in DB
  const rolesToShow = useMemo(() => {
    const catalogKeys = new Set(ROLES_CATALOG.map(r => r.key));
    const extraRoles = Object.keys(usersByRole).filter(r => !catalogKeys.has(r));
    const extras = extraRoles.map(r => ({
      key: r, label: getRoleLabel(r, null), icon: 'person-outline', color: Colors.textMuted, desc: r,
    }));
    return [...ROLES_CATALOG, ...extras];
  }, [usersByRole]);

  // Role detail
  const selectedRoleDef   = ROLES_CATALOG.find(r => r.key === selectedRole) ?? rolesToShow.find(r => r.key === selectedRole);
  const usersInRole       = selectedRole ? (usersByRole[selectedRole] || []) : [];
  const filteredRoleUsers = usersInRole.filter((u: any) =>
    !roleSearch || u.nome.toLowerCase().includes(roleSearch.toLowerCase())
  );

  // Users that can be added to the selected role (all users not in that role)
  const addCandidates = useMemo(() => {
    if (!selectedRole) return [];
    return managedUsers.filter((u: any) =>
      u.role !== selectedRole &&
      (!addSearch || u.nome.toLowerCase().includes(addSearch.toLowerCase()) || getRoleLabel(u.role, (u as any).genero).toLowerCase().includes(addSearch.toLowerCase()))
    );
  }, [selectedRole, managedUsers, addSearch]);

  // Permissions modal effects
  const selectedPermUser = users.find((u: any) => u.id === selectedUserId);
  useEffect(() => {
    if (!selectedUserId || !selectedPermUser) return;
    const perms = getUserPermissions(selectedUserId, selectedPermUser.role);
    setEditedPerms({ ...perms });
    setSaved(false);
    setExpandedCats(new Set(FEATURE_CATEGORIES.map(c => c.categoria)));
  }, [selectedUserId, isLoading]);

  function togglePerm(key: PermKey) { setEditedPerms(p => ({ ...p, [key]: !p[key] })); setSaved(false); }
  function toggleCat(cat: string) { setExpandedCats(p => { const n = new Set(p); if (n.has(cat)) n.delete(cat); else n.add(cat); return n; }); }
  function enableAll()  { const a: Record<string, boolean> = {}; FEATURE_CATEGORIES.forEach(c => c.features.forEach(f => { a[f.key] = true; })); setEditedPerms(a); setSaved(false); }
  function disableAll() { const a: Record<string, boolean> = {}; FEATURE_CATEGORIES.forEach(c => c.features.forEach(f => { a[f.key] = false; })); setEditedPerms(a); setSaved(false); }
  async function handleReset() {
    if (!selectedUserId || !selectedPermUser) return;
    setSaving(true);
    try {
      await resetUserPermissions(selectedUserId);
      const defaults = ROLE_DEFAULTS[selectedPermUser.role] || [];
      const reset: Record<string, boolean> = {};
      FEATURE_CATEGORIES.forEach(c => c.features.forEach(f => { reset[f.key] = defaults.includes(f.key as PermKey); }));
      setEditedPerms(reset); setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } finally { setSaving(false); }
  }
  async function handleSavePerms() {
    if (!selectedUserId) return;
    setSaving(true);
    try {
      await saveUserPermissions(selectedUserId, editedPerms);
      setSaved(true);
      setTimeout(() => { setSaved(false); setShowPermModal(false); }, 1800);
    } finally { setSaving(false); }
  }

  // Assign user to role
  async function handleAssign(userId: string) {
    if (!selectedRole || assigning) return;
    const movedUser = users.find((u: any) => u.id === userId);
    const fromRole = movedUser?.role || '';
    const fromName = movedUser?.nome || '';
    setAssigning(userId);
    try {
      const token = await getAuthToken();
      const res = await fetch(`/api/utilizadores/${userId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ role: selectedRole }),
      });
      if (res.ok) {
        if (typeof refreshUsers === 'function') await refreshUsers();
        setAssigning(null);
        successAnim.setValue(0);
        setMoveSuccess({ nome: fromName, fromRole });
        Animated.spring(successAnim, {
          toValue: 1,
          useNativeDriver: true,
          tension: 70,
          friction: 6,
        }).start();
        setTimeout(() => {
          Animated.timing(successAnim, {
            toValue: 0,
            duration: 260,
            useNativeDriver: true,
          }).start(() => {
            setMoveSuccess(null);
            successAnim.setValue(0);
            setShowAddUser(false);
            setAddSearch('');
          });
        }, 1900);
      }
    } catch {
      // erro silencioso — spinner limpo no finally
    } finally {
      setAssigning(null);
    }
  }

  function closeAddUserModal() {
    setShowAddUser(false);
    setAddSearch('');
    setAssigning(null);
    setMoveSuccess(null);
    successAnim.setValue(0);
  }

  // Stats
  const usersWithOverrides = allUserPermissions.filter((p: any) => Object.keys(p.permissoes).length > 0).length;
  const totalEnabled       = Object.values(editedPerms).filter(Boolean).length;
  const pctFill            = totalEnabled / TOTAL_FEATURES;
  const barColor           = pctFill > 0.7 ? Colors.success : pctFill > 0.4 ? Colors.warning : Colors.danger;
  const roleColor          = selectedPermUser ? (ROLES_CATALOG.find(r => r.key === selectedPermUser.role)?.color || Colors.textMuted) : Colors.textMuted;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <View style={s.root}>

      {/* ── Header ── */}
      <View style={s.header}>
        <View style={s.headerIcon}>
          <MaterialCommunityIcons name="account-key" size={20} color={Colors.gold} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle}>Centro de Controlo de Acessos</Text>
          <Text style={s.headerSub}>{managedUsers.length} utilizadores · {rolesToShow.filter(r => usersByRole[r.key]?.length).length} cargos activos · {usersWithOverrides} personalizados</Text>
        </View>
      </View>

      {/* ── Grelha de cargos ── */}
      <View style={s.roleGrid}>
        {rolesToShow.map(role => {
          const count = usersByRole[role.key]?.length ?? 0;
          const rc = role.color;
          return (
            <TouchableOpacity
              key={role.key}
              style={[s.roleCard, { borderColor: count > 0 ? rc + '55' : Colors.border }]}
              onPress={() => { setSelectedRole(role.key); setRoleSearch(''); }}
              activeOpacity={0.75}
            >
              <View style={[s.roleCardIcon, { backgroundColor: rc + '20' }]}>
                <Ionicons name={role.icon as any} size={18} color={rc} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={s.roleCardLabel} numberOfLines={1}>{role.label}</Text>
                <Text style={[s.roleCardDesc, { color: rc }]} numberOfLines={1}>{role.desc}</Text>
              </View>
              <View style={[s.roleBadge, { backgroundColor: count > 0 ? rc + '20' : Colors.border }]}>
                <Text style={[s.roleBadgeNum, { color: count > 0 ? rc : Colors.textMuted }]}>{count}</Text>
                <Text style={[s.roleBadgeLbl, { color: count > 0 ? rc : Colors.textMuted }]}>
                  {count === 1 ? 'user' : 'users'}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={14} color={Colors.textMuted} style={{ flexShrink: 0 }} />
            </TouchableOpacity>
          );
        })}
      </View>
      <View style={{ height: 14 }} />

      {/* ══════════════════════════════════════════════════
          MODAL — UTILIZADORES DO CARGO
      ══════════════════════════════════════════════════ */}
      <Modal
        visible={!!selectedRole && !showAddUser && !showPermModal}
        animationType="slide"
        transparent
        onRequestClose={() => setSelectedRole(null)}
      >
        <View style={s.modalOverlay}>
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => setSelectedRole(null)} />
          <View style={s.sheet}>
            {/* Barra de cor no topo */}
            {selectedRoleDef && (
              <View style={[s.sheetColorBar, { backgroundColor: selectedRoleDef.color }]} />
            )}
            <View style={s.handle} />

            {/* Header do cargo */}
            {selectedRoleDef && (
              <View style={s.sheetHeader}>
                <View style={[s.sheetIconWrap, { backgroundColor: selectedRoleDef.color + '25', borderColor: selectedRoleDef.color + '50' }]}>
                  <Ionicons name={selectedRoleDef.icon as any} size={24} color={selectedRoleDef.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.sheetTitle}>{selectedRoleDef.label}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 }}>
                    <View style={[s.statPill, { backgroundColor: selectedRoleDef.color + '18', borderColor: selectedRoleDef.color + '40' }]}>
                      <Ionicons name="people" size={10} color={selectedRoleDef.color} />
                      <Text style={[s.statPillTxt, { color: selectedRoleDef.color }]}>
                        {usersInRole.length} utilizador{usersInRole.length !== 1 ? 'es' : ''}
                      </Text>
                    </View>
                    <Text style={s.sheetSub}>{selectedRoleDef.desc}</Text>
                  </View>
                </View>
                <TouchableOpacity onPress={() => setSelectedRole(null)} style={s.closeBtn}>
                  <Ionicons name="close" size={16} color={Colors.textMuted} />
                </TouchableOpacity>
              </View>
            )}

            {/* Divider */}
            <View style={[s.divider, { backgroundColor: selectedRoleDef?.color ? selectedRoleDef.color + '20' : Colors.border }]} />

            {/* Botão Adicionar + Pesquisa */}
            <View style={s.sheetActions}>
              <TouchableOpacity
                style={[s.addBtn, { backgroundColor: selectedRoleDef?.color || Colors.accent, shadowColor: selectedRoleDef?.color || Colors.accent }]}
                onPress={() => { setShowAddUser(true); setAddSearch(''); }}
                activeOpacity={0.85}
              >
                <View style={s.addBtnIconWrap}>
                  <Ionicons name="person-add" size={16} color="#fff" />
                </View>
                <Text style={s.addBtnTxt}>Adicionar Utilizador</Text>
                <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.7)" style={{ marginLeft: 'auto' as any }} />
              </TouchableOpacity>
            </View>

            {/* Pesquisa dentro do cargo */}
            <View style={s.searchRow}>
              <Ionicons name="search" size={15} color={Colors.textMuted} />
              <TextInput
                style={s.searchInput}
                value={roleSearch}
                onChangeText={setRoleSearch}
                placeholder="Pesquisar neste cargo..."
                placeholderTextColor={Colors.textMuted}
              />
              {!!roleSearch && (
                <TouchableOpacity onPress={() => setRoleSearch('')}>
                  <Ionicons name="close-circle" size={16} color={Colors.textMuted} />
                </TouchableOpacity>
              )}
            </View>

            {/* Contador de resultados */}
            {filteredRoleUsers.length > 0 && (
              <View style={s.resultsBar}>
                <Text style={s.resultsBarTxt}>{filteredRoleUsers.length} utilizador{filteredRoleUsers.length !== 1 ? 'es' : ''}{roleSearch ? ` encontrado${filteredRoleUsers.length !== 1 ? 's' : ''}` : ''}</Text>
              </View>
            )}

            {/* Lista de utilizadores */}
            <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
              {filteredRoleUsers.length === 0 ? (
                <View style={s.emptyState}>
                  <View style={s.emptyIconWrap}>
                    <Ionicons name="person-outline" size={28} color={Colors.textMuted} />
                  </View>
                  <Text style={s.emptyTitle}>
                    {usersInRole.length === 0 ? 'Cargo vazio' : 'Sem resultados'}
                  </Text>
                  <Text style={s.emptyText}>
                    {usersInRole.length === 0
                      ? 'Nenhum utilizador atribuído a este cargo.'
                      : 'Tente uma pesquisa diferente.'}
                  </Text>
                </View>
              ) : (
                <View style={{ gap: 1, paddingTop: 4 }}>
                  {filteredRoleUsers.map((u: any, idx: number) => {
                    const rc = selectedRoleDef?.color || Colors.textMuted;
                    const perms = getUserPermissions(u.id, u.role);
                    const active = Object.values(perms).filter(Boolean).length;
                    const pct = active / TOTAL_FEATURES;
                    const barC = pct > 0.6 ? Colors.success : pct > 0.3 ? Colors.warning : Colors.danger;
                    const hasOverride = allUserPermissions.some((p: any) => p.userId === u.id && Object.keys(p.permissoes).length > 0);
                    return (
                      <View key={u.id} style={[s.userRow, idx === filteredRoleUsers.length - 1 && { borderBottomWidth: 0 }]}>
                        {/* Avatar */}
                        <View style={[s.userAvatar, { backgroundColor: rc + '20', borderColor: rc + '45' }]}>
                          <Text style={[s.userAvatarTxt, { color: rc }]}>{initials(u.nome)}</Text>
                        </View>

                        {/* Info */}
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                            <Text style={s.userName} numberOfLines={1}>{u.nome}</Text>
                            {hasOverride && (
                              <View style={s.customBadge}>
                                <Ionicons name="star" size={8} color={Colors.warning} />
                                <Text style={s.customBadgeTxt}>Personalizado</Text>
                              </View>
                            )}
                          </View>
                          <Text style={s.userEmail} numberOfLines={1}>{u.email}</Text>
                          {/* Barra de permissões */}
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 }}>
                            <View style={s.permBarBg}>
                              <View style={[s.permBarFill, { width: `${pct * 100}%` as any, backgroundColor: barC }]} />
                            </View>
                            <Text style={[s.permCount, { color: barC }]}>{active}/{TOTAL_FEATURES}</Text>
                          </View>
                        </View>

                        {/* Botão permissões */}
                        <TouchableOpacity
                          style={[s.permBtn, { backgroundColor: rc + '15', borderColor: rc + '40' }]}
                          onPress={() => {
                            setSelectedUserId(u.id);
                            setSaved(false);
                            setShowPermModal(true);
                          }}
                          activeOpacity={0.75}
                        >
                          <Ionicons name="key-outline" size={14} color={rc} />
                          <Text style={[s.permBtnTxt, { color: rc }]}>Permissões</Text>
                        </TouchableOpacity>
                      </View>
                    );
                  })}
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ══════════════════════════════════════════════════
          MODAL — ADICIONAR UTILIZADOR AO CARGO
      ══════════════════════════════════════════════════ */}
      <Modal
        visible={!!selectedRole && showAddUser}
        animationType="slide"
        transparent
        onRequestClose={closeAddUserModal}
      >
        <View style={s.modalOverlay}>
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={closeAddUserModal} />
          <View style={[s.sheet, { maxHeight: '85%' as any }]}>
            <View style={[s.sheetColorBar, { backgroundColor: selectedRoleDef?.color || Colors.accent }]} />
            <View style={s.handle} />
            <View style={s.sheetHeader}>
              <View style={[s.sheetIconWrap, { backgroundColor: (selectedRoleDef?.color || Colors.accent) + '25', borderColor: (selectedRoleDef?.color || Colors.accent) + '50' }]}>
                <Ionicons name="person-add" size={22} color={selectedRoleDef?.color || Colors.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.sheetTitle}>Atribuir Cargo</Text>
                <Text style={s.sheetSub}>Mover utilizador para <Text style={{ color: selectedRoleDef?.color || Colors.accent, fontFamily: 'Inter_600SemiBold' }}>{selectedRoleDef?.label}</Text></Text>
              </View>
              <TouchableOpacity onPress={closeAddUserModal} style={s.closeBtn}>
                <Ionicons name="close" size={16} color={Colors.textMuted} />
              </TouchableOpacity>
            </View>

            <View style={[s.divider, { backgroundColor: (selectedRoleDef?.color || Colors.border) + '20' }]} />

            <View style={[s.sheetActions, { paddingBottom: 4 }]}>
              <View style={s.searchRow}>
                <Ionicons name="search" size={15} color={Colors.textMuted} />
                <TextInput
                  style={s.searchInput}
                  value={addSearch}
                  onChangeText={setAddSearch}
                  placeholder="Pesquisar utilizador..."
                  placeholderTextColor={Colors.textMuted}
                  autoFocus
                />
                {!!addSearch && <TouchableOpacity onPress={() => setAddSearch('')}><Ionicons name="close-circle" size={16} color={Colors.textMuted} /></TouchableOpacity>}
              </View>
            </View>

            {addCandidates.length > 0 && (
              <View style={s.resultsBar}>
                <Text style={s.resultsBarTxt}>{addCandidates.length} utilizador{addCandidates.length !== 1 ? 'es' : ''} disponível{addCandidates.length !== 1 ? 'is' : ''}</Text>
              </View>
            )}

            <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
              {addCandidates.length === 0 ? (
                <View style={s.emptyState}>
                  <View style={s.emptyIconWrap}>
                    <Ionicons name="people-outline" size={28} color={Colors.textMuted} />
                  </View>
                  <Text style={s.emptyTitle}>{addSearch ? 'Sem resultados' : 'Nenhum disponível'}</Text>
                  <Text style={s.emptyText}>{addSearch ? 'Tente uma pesquisa diferente.' : 'Todos os utilizadores já pertencem a este cargo.'}</Text>
                </View>
              ) : (
                <View>
                  {addCandidates.map((u: any, idx: number) => {
                    const rc2 = ROLES_CATALOG.find(r => r.key === u.role)?.color || Colors.textMuted;
                    const rc3 = selectedRoleDef?.color || Colors.accent;
                    return (
                      <TouchableOpacity
                        key={u.id}
                        style={[s.candidateRow, idx === addCandidates.length - 1 && { borderBottomWidth: 0 }]}
                        onPress={() => handleAssign(u.id)}
                        disabled={!!assigning}
                        activeOpacity={0.7}
                      >
                        <View style={[s.userAvatar, { backgroundColor: rc2 + '22', borderColor: rc2 + '45' }]}>
                          <Text style={[s.userAvatarTxt, { color: rc2 }]}>{initials(u.nome)}</Text>
                        </View>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={s.userName} numberOfLines={1}>{u.nome}</Text>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 }}>
                            <View style={[s.currentRolePill, { backgroundColor: rc2 + '20', borderWidth: 1, borderColor: rc2 + '40' }]}>
                              <Text style={[s.currentRoleTxt, { color: rc2 }]}>{getRoleLabel(u.role, (u as any).genero)}</Text>
                            </View>
                            <Ionicons name="arrow-forward" size={11} color={Colors.textMuted} />
                            <View style={[s.currentRolePill, { backgroundColor: rc3 + '20', borderWidth: 1, borderColor: rc3 + '40' }]}>
                              <Text style={[s.currentRoleTxt, { color: rc3 }]}>{selectedRoleDef?.label}</Text>
                            </View>
                          </View>
                        </View>
                        {assigning === u.id
                          ? <ActivityIndicator size="small" color={rc3} />
                          : <View style={[s.assignBtn, {
                              backgroundColor: rc3 + '18',
                              borderWidth: 1,
                              borderColor: rc3 + '40',
                              opacity: assigning && assigning !== u.id ? 0.4 : 1,
                            }]}>
                              <Ionicons name="checkmark" size={14} color={rc3} />
                              <Text style={[s.assignBtnTxt, { color: rc3 }]}>Mover</Text>
                            </View>
                        }
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
            </ScrollView>

            {/* ── Overlay de sucesso animado ── */}
            {moveSuccess && (
              <Animated.View
                style={[
                  StyleSheet.absoluteFill,
                  s.successOverlay,
                  { opacity: successAnim },
                ]}
              >
                <Animated.View style={[
                  s.successCard,
                  {
                    transform: [{
                      scale: successAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0.78, 1],
                      }),
                    }],
                  },
                ]}>
                  {/* Anel exterior animado */}
                  <View style={[s.successRing, { borderColor: Colors.success + '30' }]}>
                    <View style={[s.successRingInner, { borderColor: Colors.success + '55' }]}>
                      <View style={[s.successIconBg, { backgroundColor: Colors.success + '18' }]}>
                        <Ionicons name="checkmark-circle" size={52} color={Colors.success} />
                      </View>
                    </View>
                  </View>

                  <Text style={s.successLabel}>Cargo Atribuído!</Text>
                  <Text style={s.successName} numberOfLines={2}>{moveSuccess.nome}</Text>

                  {/* Transição de cargo */}
                  <View style={s.successTransition}>
                    {(() => {
                      const fromColor = ROLES_CATALOG.find(r => r.key === moveSuccess.fromRole)?.color || Colors.textMuted;
                      const toColor   = selectedRoleDef?.color || Colors.success;
                      return (
                        <>
                          <View style={[s.successRolePill, { backgroundColor: fromColor + '20', borderColor: fromColor + '44' }]}>
                            <Text style={[s.successRoleTxt, { color: fromColor }]}>
                              {getRoleLabel(moveSuccess.fromRole, null)}
                            </Text>
                          </View>
                          <Ionicons name="arrow-forward" size={13} color={Colors.textMuted} />
                          <View style={[s.successRolePill, { backgroundColor: toColor + '22', borderColor: toColor + '55' }]}>
                            <Text style={[s.successRoleTxt, { color: toColor, fontFamily: 'Inter_700Bold' }]}>
                              {selectedRoleDef?.label}
                            </Text>
                          </View>
                        </>
                      );
                    })()}
                  </View>
                </Animated.View>
              </Animated.View>
            )}
          </View>
        </View>
      </Modal>

      {/* ══════════════════════════════════════════════════
          MODAL — EDITAR PERMISSÕES DO UTILIZADOR
      ══════════════════════════════════════════════════ */}
      <Modal
        visible={showPermModal && !!selectedPermUser}
        animationType="slide"
        transparent
        onRequestClose={() => setShowPermModal(false)}
      >
        <View style={s.modalOverlay}>
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => setShowPermModal(false)} />
          <View style={s.sheet}>
            <View style={s.handle} />

            {/* Cabeçalho */}
            <View style={s.modalHeader}>
              <View style={[s.selUserAvatar, { backgroundColor: roleColor + '22' }]}>
                <Text style={[s.selUserAvatarTxt, { color: roleColor }]}>
                  {selectedPermUser ? initials(selectedPermUser.nome) : '?'}
                </Text>
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={s.selUserName} numberOfLines={1}>{selectedPermUser?.nome}</Text>
                <View style={[s.rolePill, { backgroundColor: roleColor + '22', alignSelf: 'flex-start' }]}>
                  <Text style={[s.rolePillTxt, { color: roleColor }]}>
                    {selectedPermUser ? getRoleLabel(selectedPermUser.role, (selectedPermUser as any).genero) : ''}
                  </Text>
                </View>
              </View>
              <View style={s.permCounter}>
                <Text style={[s.permCountNum, { color: barColor }]}>{totalEnabled}</Text>
                <Text style={s.permCountDen}>/{TOTAL_FEATURES}</Text>
                <Text style={s.permCountLbl}>activas</Text>
              </View>
              <TouchableOpacity onPress={() => setShowPermModal(false)} style={s.closeBtn}>
                <Ionicons name="close" size={20} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {/* Barra de progresso */}
            <View style={s.progressBg}>
              <View style={[s.progressFill, { width: `${(totalEnabled / TOTAL_FEATURES) * 100}%` as any, backgroundColor: barColor }]} />
            </View>
            <Text style={s.progressLbl}>
              {totalEnabled === TOTAL_FEATURES ? 'Acesso total' : totalEnabled === 0 ? 'Sem acesso' : `${Math.round((totalEnabled / TOTAL_FEATURES) * 100)}% das funcionalidades activas`}
            </Text>

            {/* Acções rápidas */}
            <View style={s.quickActions}>
              <TouchableOpacity style={s.qBtn} onPress={enableAll}><Ionicons name="checkmark-done" size={13} color={Colors.success} /><Text style={[s.qBtnTxt, { color: Colors.success }]}>Activar Tudo</Text></TouchableOpacity>
              <TouchableOpacity style={s.qBtn} onPress={disableAll}><Ionicons name="close-circle-outline" size={13} color={Colors.danger} /><Text style={[s.qBtnTxt, { color: Colors.danger }]}>Desactivar Tudo</Text></TouchableOpacity>
              <TouchableOpacity style={s.qBtn} onPress={handleReset} disabled={saving}><MaterialCommunityIcons name="restore" size={13} color={Colors.info} /><Text style={[s.qBtnTxt, { color: Colors.info }]}>Repor Padrão</Text></TouchableOpacity>
            </View>

            {/* Legenda */}
            <View style={s.legendRow}>
              {[{ icon: 'eye', color: Colors.success, label: 'Visível (padrão)' }, { icon: 'add-circle', color: Colors.info, label: 'Extra' }, { icon: 'eye-off', color: Colors.danger, label: 'Oculto' }].map(l => (
                <View key={l.label} style={s.legendItem}><Ionicons name={l.icon as any} size={11} color={l.color} /><Text style={[s.legendTxt, { color: l.color }]}>{l.label}</Text></View>
              ))}
            </View>

            {/* Lista de funcionalidades */}
            <ScrollView style={{ flex: 1, minHeight: 0 }} showsVerticalScrollIndicator={false}>
              {selectedPermUser && FEATURE_CATEGORIES.map(cat => {
                const isExpanded   = expandedCats.has(cat.categoria);
                const activeInCat  = cat.features.filter(f => editedPerms[f.key]).length;
                const catColor     = activeInCat === cat.features.length ? Colors.success : activeInCat === 0 ? Colors.danger : Colors.warning;
                return (
                  <View key={cat.categoria} style={s.catCard}>
                    <TouchableOpacity style={s.catHeader} onPress={() => toggleCat(cat.categoria)} activeOpacity={0.75}>
                      <View style={[s.catIconWrap, { backgroundColor: Colors.gold + '18' }]}>
                        <Ionicons name={cat.icon as any} size={15} color={Colors.gold} />
                      </View>
                      <Text style={s.catTitle}>{cat.categoria}</Text>
                      <View style={[s.catBadge, { backgroundColor: catColor + '20' }]}>
                        <Text style={[s.catBadgeTxt, { color: catColor }]}>{activeInCat}/{cat.features.length}</Text>
                      </View>
                      <Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={15} color={Colors.textMuted} />
                    </TouchableOpacity>
                    {isExpanded && cat.features.map((feat, idx) => {
                      const isOn         = editedPerms[feat.key] === true;
                      const isRoleDefault = (ROLE_DEFAULTS[selectedPermUser.role] || []).includes(feat.key as PermKey);
                      return (
                        <View key={feat.key} style={[s.featRow, idx < cat.features.length - 1 && { borderBottomWidth: 1, borderBottomColor: Colors.border }, isOn ? { backgroundColor: Colors.success + '06' } : { backgroundColor: Colors.danger + '04' }]}>
                          <View style={[s.featSidebar, { backgroundColor: isOn ? Colors.success : Colors.danger }]} />
                          <View style={s.featInfo}>
                            <View style={s.featLabelRow}>
                              <Text style={[s.featLabel, !isOn && { color: Colors.textMuted }]}>{feat.label}</Text>
                              <IntelBadge isOn={isOn} isRoleDefault={isRoleDefault} />
                            </View>
                            <Text style={s.featDesc} numberOfLines={1}>{feat.desc}</Text>
                            <Text style={[s.featImpact, { color: isOn ? Colors.success : Colors.danger }]}>
                              {isOn ? '→ Menu visível & ecrã acessível' : '→ Menu ocultado & ecrã bloqueado'}
                            </Text>
                          </View>
                          <Switch value={isOn} onValueChange={() => togglePerm(feat.key as PermKey)} trackColor={{ false: Colors.danger + '44', true: Colors.success + '66' }} thumbColor={isOn ? Colors.success : Colors.danger} />
                        </View>
                      );
                    })}
                  </View>
                );
              })}
              <View style={{ height: 16 }} />
            </ScrollView>

            {/* Guardar */}
            <View style={s.saveArea}>
              {saved
                ? <View style={s.savedBanner}><Ionicons name="checkmark-circle" size={18} color={Colors.success} /><Text style={s.savedTxt}>Permissões guardadas!</Text></View>
                : <TouchableOpacity style={[s.saveBtn, saving && { opacity: 0.6 }]} onPress={handleSavePerms} disabled={saving} activeOpacity={0.8}>
                    {saving ? <AppLoader size="small" color="#fff" /> : <Ionicons name="save" size={18} color="#fff" />}
                    <Text style={s.saveBtnTxt}>{saving ? 'A guardar...' : 'Guardar Alterações'}</Text>
                  </TouchableOpacity>
              }
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ── Estilos ────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root: { backgroundColor: Colors.backgroundCard, borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: Colors.border, marginBottom: 4 },

  // Header
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderBottomWidth: 1, borderBottomColor: Colors.border, backgroundColor: Colors.surface },
  headerIcon: { width: 38, height: 38, borderRadius: 10, backgroundColor: Colors.gold + '18', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.gold + '33' },
  headerTitle: { fontSize: 14, fontFamily: 'Inter_700Bold', color: Colors.text },
  headerSub: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 1 },

  // Role grid
  roleGrid: { padding: 12, gap: 8 },
  roleCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 14, borderWidth: 1.5, backgroundColor: Colors.surface },
  roleCardIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  roleCardLabel: { fontSize: 13, fontFamily: 'Inter_700Bold', color: Colors.text, marginBottom: 2 },
  roleCardDesc: { fontSize: 11, fontFamily: 'Inter_500Medium' },
  roleBadge: { borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5, alignItems: 'center', minWidth: 46, flexShrink: 0 },
  roleBadgeNum: { fontSize: 16, fontFamily: 'Inter_700Bold', lineHeight: 18 },
  roleBadgeLbl: { fontSize: 9, fontFamily: 'Inter_500Medium', marginTop: 1 },

  // Modal
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.65)' },
  sheet: { backgroundColor: Colors.background, borderTopLeftRadius: 28, borderTopRightRadius: 28, maxHeight: '92%' as any, ...(Platform.OS === 'web' ? { maxHeight: '92vh' as any } : {}), overflow: 'hidden' },
  sheetColorBar: { height: 3, borderTopLeftRadius: 28, borderTopRightRadius: 28 },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: Colors.border, alignSelf: 'center', marginTop: 10, marginBottom: 6 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingBottom: 14, paddingTop: 4 },
  sheetIconWrap: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', flexShrink: 0, borderWidth: 1.5 },
  sheetTitle: { fontSize: 16, fontFamily: 'Inter_700Bold', color: Colors.text, letterSpacing: -0.3 },
  sheetSub: { fontSize: 11, fontFamily: 'Inter_500Medium', color: Colors.textMuted },
  statPill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 8, borderWidth: 1 },
  statPillTxt: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  divider: { height: 1, marginHorizontal: 0 },
  closeBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.border, flexShrink: 0 },

  // Actions bar
  sheetActions: { paddingHorizontal: 14, paddingTop: 14, paddingBottom: 10 },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 13, paddingHorizontal: 16, borderRadius: 14, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 8, elevation: 4 },
  addBtnIconWrap: { width: 28, height: 28, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  addBtnTxt: { fontSize: 14, fontFamily: 'Inter_700Bold', color: '#fff', flex: 1 },

  // Search
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 14, marginBottom: 6, backgroundColor: Colors.surface, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: Colors.border },
  searchInput: { flex: 1, fontSize: 13, fontFamily: 'Inter_400Regular', color: Colors.text, padding: 0 },
  resultsBar: { paddingHorizontal: 16, paddingBottom: 6 },
  resultsBarTxt: { fontSize: 11, fontFamily: 'Inter_500Medium', color: Colors.textMuted },

  // User row
  userRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: Colors.border },
  userAvatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', flexShrink: 0, borderWidth: 1.5 },
  userAvatarTxt: { fontSize: 15, fontFamily: 'Inter_700Bold' },
  userName: { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: Colors.text },
  userEmail: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 2 },
  permBarBg: { flex: 1, height: 4, borderRadius: 2, backgroundColor: Colors.border, overflow: 'hidden', maxWidth: 90 },
  permBarFill: { height: 4, borderRadius: 2 },
  permCount: { fontSize: 10, fontFamily: 'Inter_600SemiBold' },
  permBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 10, borderWidth: 1, flexShrink: 0 },
  permBtnTxt: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  customBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: Colors.warning + '20', borderRadius: 6, paddingHorizontal: 5, paddingVertical: 2, borderWidth: 1, borderColor: Colors.warning + '40' },
  customBadgeTxt: { fontSize: 9, fontFamily: 'Inter_700Bold', color: Colors.warning },

  // Candidate row
  candidateRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: Colors.border },
  currentRolePill: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  currentRoleTxt: { fontSize: 10, fontFamily: 'Inter_600SemiBold' },
  assignBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 10, flexShrink: 0 },
  assignBtnTxt: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },

  // Empty
  emptyState: { alignItems: 'center', paddingVertical: 40, gap: 8, paddingHorizontal: 20 },
  emptyIconWrap: { width: 64, height: 64, borderRadius: 20, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  emptyTitle: { fontSize: 14, fontFamily: 'Inter_700Bold', color: Colors.text },
  emptyText: { fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textMuted, textAlign: 'center', lineHeight: 18 },

  // Permissions modal
  modalHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderBottomWidth: 1, borderBottomColor: Colors.border, backgroundColor: Colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  selUserAvatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  selUserAvatarTxt: { fontSize: 16, fontFamily: 'Inter_700Bold' },
  selUserName: { fontSize: 14, fontFamily: 'Inter_700Bold', color: Colors.text, marginBottom: 3 },
  rolePill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  rolePillTxt: { fontSize: 10, fontFamily: 'Inter_600SemiBold' },
  permCounter: { alignItems: 'center', backgroundColor: Colors.backgroundCard, borderRadius: 10, padding: 8, minWidth: 52, borderWidth: 1, borderColor: Colors.border, flexShrink: 0 },
  permCountNum: { fontSize: 18, fontFamily: 'Inter_700Bold' },
  permCountDen: { fontSize: 10, fontFamily: 'Inter_400Regular', color: Colors.textMuted },
  permCountLbl: { fontSize: 9, fontFamily: 'Inter_400Regular', color: Colors.textMuted, textTransform: 'uppercase', marginTop: 1 },
  progressBg: { height: 5, backgroundColor: Colors.border, marginHorizontal: 14, marginTop: 10, borderRadius: 3 },
  progressFill: { height: 5, borderRadius: 3 },
  progressLbl: { fontSize: 10, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginHorizontal: 14, marginTop: 4, marginBottom: 2 },
  quickActions: { flexDirection: 'row', gap: 6, paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: 1, borderTopColor: Colors.border, backgroundColor: Colors.surface, flexWrap: 'wrap' },
  qBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.backgroundCard, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: Colors.border },
  qBtnTxt: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  legendRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 14, paddingVertical: 8, borderTopWidth: 1, borderTopColor: Colors.border, flexWrap: 'wrap', backgroundColor: Colors.backgroundCard },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendTxt: { fontSize: 10, fontFamily: 'Inter_500Medium' },
  catCard: { marginHorizontal: 12, marginBottom: 8, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden', backgroundColor: Colors.surface },
  catHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, backgroundColor: Colors.backgroundCard },
  catIconWrap: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  catTitle: { flex: 1, fontSize: 13, fontFamily: 'Inter_600SemiBold', color: Colors.text },
  catBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  catBadgeTxt: { fontSize: 11, fontFamily: 'Inter_700Bold' },
  featRow: { flexDirection: 'row', alignItems: 'center', gap: 0, paddingVertical: 10, paddingRight: 12 },
  featSidebar: { width: 3, alignSelf: 'stretch', marginRight: 10 },
  featInfo: { flex: 1, minWidth: 0 },
  featLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  featLabel: { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: Colors.text },
  featDesc: { fontSize: 10, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 2 },
  featImpact: { fontSize: 10, fontFamily: 'Inter_500Medium', marginTop: 2 },
  saveArea: { padding: 14, borderTopWidth: 1, borderTopColor: Colors.border, backgroundColor: Colors.surface },
  saveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: Colors.primary, borderRadius: 12, paddingVertical: 14 },
  saveBtnTxt: { fontSize: 14, fontFamily: 'Inter_700Bold', color: '#fff' },
  savedBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: Colors.success + '18', borderRadius: 12, paddingVertical: 14 },
  savedTxt: { fontSize: 14, fontFamily: 'Inter_600SemiBold', color: Colors.success },

  // Success overlay
  successOverlay: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.62)',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
  },
  successCard: {
    alignItems: 'center',
    backgroundColor: Colors.background,
    borderRadius: 24,
    paddingHorizontal: 32,
    paddingVertical: 32,
    marginHorizontal: 24,
    width: '85%' as any,
    maxWidth: 340,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.35,
    shadowRadius: 24,
    elevation: 20,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  successRing: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  successRingInner: {
    width: 84,
    height: 84,
    borderRadius: 42,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  successIconBg: {
    width: 70,
    height: 70,
    borderRadius: 35,
    alignItems: 'center',
    justifyContent: 'center',
  },
  successLabel: {
    fontSize: 18,
    fontFamily: 'Inter_700Bold',
    color: Colors.text,
    letterSpacing: -0.4,
    marginBottom: 6,
  },
  successName: {
    fontSize: 13,
    fontFamily: 'Inter_500Medium',
    color: Colors.textMuted,
    textAlign: 'center',
    marginBottom: 16,
  },
  successTransition: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  successRolePill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
  successRoleTxt: {
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
  },
});
