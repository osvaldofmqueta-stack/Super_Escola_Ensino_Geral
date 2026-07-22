import React, { useState, useMemo, useRef, useEffect } from 'react';
import {FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { Colors } from '@/constants/colors';
import { useData, Sala } from '@/context/DataContext';
import TopBar from '@/components/TopBar';
import PaginationBar from '@/components/PaginationBar';
import { alertSucesso, alertErro } from '@/utils/toast';
import { useLookup } from '@/hooks/useLookup';
import { webAlert } from '@/utils/webAlert';
import RequiredMark from '@/components/RequiredMark';
import { StableSearchInput } from '@/components/StableSearchInput';

const TIPOS_SALA_FALLBACK = ['Sala Normal', 'Laboratório', 'Sala de Informática', 'Auditório', 'Sala de Reunião'];

const TIPO_ICONS: Record<string, string> = {
  'Sala Normal': 'door-open',
  'Laboratório': 'flask',
  'Sala de Informática': 'desktop-tower-monitor',
  'Auditório': 'theater',
  'Sala de Reunião': 'account-group',
};

const TIPO_COLORS: Record<string, string> = {
  'Sala Normal': Colors.info,
  'Laboratório': Colors.success,
  'Sala de Informática': Colors.gold,
  'Auditório': Colors.accent,
  'Sala de Reunião': Colors.warning,
};

function SalaFormModal({ visible, onClose, onSave, sala }: { visible: boolean; onClose: () => void; onSave: (s: Partial<Sala>) => void; sala?: Sala | null }) {
  const { values: tiposSala } = useLookup('tipos_sala', TIPOS_SALA_FALLBACK);
  const defaultTipo = tiposSala[0] || 'Sala Normal';
  const [form, setForm] = useState<Partial<Sala>>(sala || {
    nome: '', bloco: '', capacidade: 30, tipo: defaultTipo, ativo: true,
  });
  const insets = useSafeAreaInsets();
  const bottomPad = Platform.OS === 'web' ? 34 : insets.bottom;

  React.useEffect(() => {
    if (visible) {
      setForm(sala || { nome: '', bloco: '', capacidade: 30, tipo: defaultTipo, ativo: true });
    }
  }, [visible, sala]);

  const set = (k: keyof Sala, v: any) => setForm(f => ({ ...f, [k]: v }));
  const blocoRef = useRef<any>(null);
  const capRef = useRef<any>(null);

  function handleSave() {
    if (!form.nome?.trim()) {
      webAlert('Campo obrigatório', 'Introduza o nome da sala.');
      return;
    }
    if (!form.capacidade || form.capacidade < 1) {
      webAlert('Capacidade inválida', 'A capacidade deve ser pelo menos 1.');
      return;
    }
    onSave(form);
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
      <View style={mS.overlay}>
        <View style={[mS.container, { paddingBottom: bottomPad + 16 }]}>
          <View style={mS.header}>
            <Text style={mS.title}>{sala ? 'Editar Sala' : 'Nova Sala de Aula'}</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={22} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            <View style={mS.field}>
              <Text style={mS.fieldLabel}>Nome da Sala<RequiredMark /></Text>
              <TextInput
                style={mS.input}
                value={form.nome ?? ''}
                onChangeText={v => set('nome', v)}
                placeholder="Ex: Sala 101, Lab. Química"
                placeholderTextColor={Colors.textMuted}
                returnKeyType="next"
                onSubmitEditing={() => blocoRef.current?.focus()}
              />
            </View>

            <View style={mS.field}>
              <Text style={mS.fieldLabel}>Bloco / Edifício</Text>
              <TextInput
                ref={blocoRef}
                style={mS.input}
                value={form.bloco ?? ''}
                onChangeText={v => set('bloco', v)}
                placeholder="Ex: Bloco A, Edifício Principal"
                placeholderTextColor={Colors.textMuted}
                returnKeyType="next"
                onSubmitEditing={() => capRef.current?.focus()}
              />
            </View>

            <View style={mS.field}>
              <Text style={mS.fieldLabel}>Capacidade (alunos)</Text>
              <TextInput
                ref={capRef}
                style={mS.input}
                value={String(form.capacidade ?? 30)}
                onChangeText={v => set('capacidade', parseInt(v) || 0)}
                keyboardType="number-pad"
                placeholder="30"
                placeholderTextColor={Colors.textMuted}
                returnKeyType="done"
                onSubmitEditing={handleSave}
              />
            </View>

            <View style={mS.field}>
              <Text style={mS.fieldLabel}>Tipo de Sala</Text>
              <View style={mS.tipoGrid}>
                {tiposSala.map(t => (
                  <TouchableOpacity
                    key={t}
                    style={[mS.tipoBtn, form.tipo === t && { backgroundColor: (TIPO_COLORS[t] || Colors.accent) + '22', borderColor: TIPO_COLORS[t] || Colors.accent }]}
                    onPress={() => set('tipo', t)}
                  >
                    <MaterialCommunityIcons
                      name={TIPO_ICONS[t] as any || 'door-open'}
                      size={18}
                      color={form.tipo === t ? (TIPO_COLORS[t] || Colors.accent) : Colors.textMuted}
                    />
                    <Text style={[mS.tipoText, form.tipo === t && { color: TIPO_COLORS[t] || Colors.accent }]}>
                      {t}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={mS.field}>
              <Text style={mS.fieldLabel}>Estado</Text>
              <View style={mS.toggleRow}>
                {[{ label: 'Activa', value: true }, { label: 'Inactiva', value: false }].map(opt => (
                  <TouchableOpacity
                    key={String(opt.value)}
                    style={[mS.toggleBtn, form.ativo === opt.value && mS.toggleActive]}
                    onPress={() => set('ativo', opt.value)}
                  >
                    <Text style={[mS.toggleText, form.ativo === opt.value && mS.toggleTextActive]}>
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </ScrollView>

          <View style={mS.actions}>
            <TouchableOpacity style={mS.cancelBtn} onPress={onClose}>
              <Text style={mS.cancelText}>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity style={mS.saveBtn} onPress={handleSave}>
              <Ionicons name="checkmark" size={18} color="#fff" />
              <Text style={mS.saveText}>{sala ? 'Actualizar' : 'Guardar'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
          </KeyboardAvoidingView>
</Modal>
  );
}

export default function SalasScreen() {
  const insets = useSafeAreaInsets();
  const { salas, turmas, addSala, updateSala, deleteSala } = useData();
  const { values: tiposSalaFiltro } = useLookup('tipos_sala', TIPOS_SALA_FALLBACK);
  const [search, setSearch] = useState('');
  const [filterTipo, setFilterTipo] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Sala | null>(null);
  const [currentPage, setCurrentPage] = useState(1);

  const bottomPad = Platform.OS === 'web' ? 34 : insets.bottom;
  const isWeb = Platform.OS === 'web';

  const ITEMS_PER_PAGE = 8;

  const filtered = useMemo(() => {
    return salas.filter(s => {
      const matchSearch = !search || s.nome.toLowerCase().includes(search.toLowerCase()) || (s.bloco || '').toLowerCase().includes(search.toLowerCase());
      const matchTipo = !filterTipo || s.tipo === filterTipo;
      return matchSearch && matchTipo;
    });
  }, [salas, search, filterTipo]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
  const safePage = Math.min(currentPage, totalPages);
  const pageItems = useMemo(() => {
    return filtered.slice((safePage - 1) * ITEMS_PER_PAGE, safePage * ITEMS_PER_PAGE);
  }, [filtered, safePage]);

  useEffect(() => { setCurrentPage(1); }, [search, filterTipo]);

  const stats = useMemo(() => ({
    total: salas.length,
    ativas: salas.filter(s => s.ativo).length,
    inativas: salas.filter(s => !s.ativo).length,
    capacidadeTotal: salas.filter(s => s.ativo).reduce((sum, s) => sum + s.capacidade, 0),
  }), [salas]);

  async function handleSave(form: Partial<Sala>) {
    if (Platform.OS !== 'web') await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    try {
      if (editing) {
        await updateSala(editing.id, form);
        alertSucesso('Sala actualizada', `"${form.nome}" foi actualizada com sucesso.`);
      } else {
        await addSala({
          nome: form.nome!,
          bloco: form.bloco || '',
          capacidade: form.capacidade || 30,
          tipo: form.tipo || 'Sala Normal',
          ativo: form.ativo ?? true,
        });
        alertSucesso('Sala criada', `"${form.nome}" foi adicionada com sucesso.`);
      }
    } catch {
      alertErro('Erro', 'Não foi possível guardar a sala. Tente novamente.');
    }
    setShowForm(false);
    setEditing(null);
  }

  function handleEdit(sala: Sala) { setEditing(sala); setShowForm(true); }

  function handleDelete(sala: Sala) {
    webAlert('Remover Sala', `Tem a certeza que deseja remover "${sala.nome}"? Esta acção não pode ser desfeita.`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Remover', style: 'destructive',
        onPress: async () => {
          if (Platform.OS !== 'web') await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
          try {
            await deleteSala(sala.id);
            alertSucesso('Sala removida', `"${sala.nome}" foi removida com sucesso.`);
          } catch { alertErro('Erro', 'Não foi possível remover a sala.'); }
        },
      },
    ]);
  }

  function handleToggleAtivo(sala: Sala) {
    updateSala(sala.id, { ativo: !sala.ativo });
    alertSucesso(sala.ativo ? 'Sala desactivada' : 'Sala activada', `"${sala.nome}" foi ${sala.ativo ? 'desactivada' : 'activada'}.`);
  }

  const renderCard = (item: Sala) => {
    const color = TIPO_COLORS[item.tipo] || Colors.accent;
    const icon = TIPO_ICONS[item.tipo] || 'door-open';
    const turmasNaSala = turmas.filter((t: any) => t.sala === item.nome && t.ativo !== false);
    return (
      <View key={item.id} style={[styles.card, isWeb && styles.cardWeb, !item.ativo && styles.cardInactive, { borderTopColor: color }]}>
        {/* Header row */}
        <View style={styles.cardHeader}>
          <View style={[styles.iconWrap, { backgroundColor: color + '18' }]}>
            <MaterialCommunityIcons name={icon as any} size={20} color={color} />
          </View>
          <View style={styles.cardInfo}>
            <Text style={styles.cardName} numberOfLines={1}>{item.nome}</Text>
            <Text style={styles.cardBloco} numberOfLines={1}>{item.bloco || '—'}</Text>
          </View>
          <View style={[styles.statusPill, { backgroundColor: item.ativo ? Colors.success + '18' : Colors.textMuted + '14', borderColor: item.ativo ? Colors.success + '40' : Colors.textMuted + '30' }]}>
            <View style={[styles.statusDot, { backgroundColor: item.ativo ? Colors.success : Colors.textMuted }]} />
            <Text style={[styles.statusText, { color: item.ativo ? Colors.success : Colors.textMuted }]}>
              {item.ativo ? 'Activa' : 'Inactiva'}
            </Text>
          </View>
        </View>

        {/* Meta row */}
        <View style={styles.metaRow}>
          <View style={[styles.tipoBadge, { backgroundColor: color + '14', borderColor: color + '35' }]}>
            <Text style={[styles.tipoLabel, { color }]}>{item.tipo}</Text>
          </View>
          <View style={styles.capRow}>
            <Ionicons name="people-outline" size={11} color={Colors.textMuted} />
            <Text style={styles.capText}>{item.capacidade} lugares</Text>
          </View>
        </View>

        {/* Turmas atribuídas */}
        {turmasNaSala.length > 0 ? (
          <View style={styles.turmasRow}>
            <Ionicons name="school-outline" size={11} color={Colors.textMuted} style={{ marginTop: 1 }} />
            <View style={styles.turmasChips}>
              {turmasNaSala.map((t: any) => (
                <View key={t.id} style={styles.turmaChip}>
                  <Text style={styles.turmaChipText}>{t.nome}</Text>
                  {t.classe ? <Text style={styles.turmaChipClasse}> · {t.classe}</Text> : null}
                  {t.turno ? <Text style={styles.turmaChipTurno}> {t.turno === 'Manhã' ? '☀️' : t.turno === 'Tarde' ? '🌤️' : '🌙'}</Text> : null}
                </View>
              ))}
            </View>
          </View>
        ) : (
          <View style={styles.turmasRow}>
            <Ionicons name="school-outline" size={11} color={Colors.textMuted} style={{ marginTop: 1 }} />
            <Text style={[styles.turmaChipText, { color: Colors.textMuted, fontStyle: 'italic' }]}>Sem turma atribuída</Text>
          </View>
        )}

        {/* Divider */}
        <View style={styles.cardDivider} />

        {/* Action buttons */}
        <View style={styles.cardActions}>
          <TouchableOpacity
            style={[styles.actionChip, { backgroundColor: item.ativo ? Colors.warning + '14' : Colors.success + '14', borderColor: item.ativo ? Colors.warning + '35' : Colors.success + '35' }]}
            onPress={() => handleToggleAtivo(item)} activeOpacity={0.75}>
            <Ionicons name={item.ativo ? 'pause-circle-outline' : 'play-circle-outline'} size={14} color={item.ativo ? Colors.warning : Colors.success} />
            <Text style={[styles.actionChipText, { color: item.ativo ? Colors.warning : Colors.success }]}>
              {item.ativo ? 'Desactivar' : 'Activar'}
            </Text>
          </TouchableOpacity>
          <View style={{ flex: 1 }} />
          <TouchableOpacity style={[styles.iconBtn, { backgroundColor: Colors.info + '14' }]} onPress={() => handleEdit(item)} activeOpacity={0.75}>
            <Ionicons name="pencil-outline" size={15} color={Colors.info} />
          </TouchableOpacity>
          <TouchableOpacity style={[styles.iconBtn, { backgroundColor: Colors.danger + '14' }]} onPress={() => handleDelete(item)} activeOpacity={0.75}>
            <Ionicons name="trash-outline" size={15} color={Colors.danger} />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const STAT_CONFIG = [
    { label: 'Total', value: stats.total, icon: 'grid-outline' as const, color: Colors.text },
    { label: 'Activas', value: stats.ativas, icon: 'checkmark-circle-outline' as const, color: Colors.success },
    { label: 'Inactivas', value: stats.inativas, icon: 'close-circle-outline' as const, color: Colors.danger },
    { label: 'Capacidade', value: stats.capacidadeTotal, icon: 'people-outline' as const, color: Colors.gold },
  ];

  return (
    <View style={styles.screen}>
      <TopBar
        title="Salas de Aula"
        rightAction={{ icon: 'add', onPress: () => { setEditing(null); setShowForm(true); } }}
      />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[styles.scroll, { paddingBottom: bottomPad + 24 }]}>

        {/* ── Stats ── */}
        <View style={styles.statsRow}>
          {STAT_CONFIG.map(s => (
            <View key={s.label} style={[styles.statCard, { borderColor: s.color + '28' }]}>
              <View style={[styles.statIconWrap, { backgroundColor: s.color + '16' }]}>
                <Ionicons name={s.icon} size={16} color={s.color} />
              </View>
              <Text style={[styles.statValue, { color: s.color }]}>{s.value}</Text>
              <Text style={styles.statLabel}>{s.label}</Text>
            </View>
          ))}
        </View>

        {/* ── Smart Search + Filter Panel ── */}
        <View style={styles.sfPanel}>

          {/* Row 1 — Search */}
          <View style={styles.sfSearchRow}>
            <StableSearchInput
              value={search}
              onChangeText={setSearch}
              inputStyle={styles.sfInput}
              placeholder="Pesquisar sala..."
              iconColor={Colors.textMuted}
            />
            <View style={[styles.sfCount, (search || filterTipo) && styles.sfCountActive]}>
              <Text style={[styles.sfCountTxt, (search || filterTipo) && styles.sfCountTxtActive]}>
                {filtered.length}
              </Text>
            </View>
          </View>

          {/* Divider */}
          <View style={styles.sfDivider} />

          {/* Row 2 — Filter tabs */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.sfTabs}>

            {/* Todos */}
            <TouchableOpacity
              style={[styles.sfTab, !filterTipo && styles.sfTabOn]}
              onPress={() => setFilterTipo(null)}
              activeOpacity={0.75}>
              <MaterialCommunityIcons name="filter-variant" size={11} color={!filterTipo ? Colors.accent : Colors.textMuted} />
              <Text style={[styles.sfTabLbl, !filterTipo && styles.sfTabLblOn]}>Todos</Text>
              <View style={[styles.sfBadge, !filterTipo && styles.sfBadgeOn]}>
                <Text style={[styles.sfBadgeTxt, !filterTipo && styles.sfBadgeTxtOn]}>{salas.length}</Text>
              </View>
            </TouchableOpacity>

            {tiposSalaFiltro.map(t => {
              const cor = TIPO_COLORS[t] || Colors.accent;
              const on = filterTipo === t;
              const cnt = salas.filter((s: Sala) => s.tipo === t).length;
              return (
                <TouchableOpacity
                  key={t}
                  style={[styles.sfTab, on && { backgroundColor: cor + '18', borderColor: cor + '50' }]}
                  onPress={() => setFilterTipo(on ? null : t)}
                  activeOpacity={0.75}>
                  <MaterialCommunityIcons name={(TIPO_ICONS[t] || 'door-open') as any} size={11} color={on ? cor : Colors.textMuted} />
                  <Text style={[styles.sfTabLbl, on && { color: cor, fontFamily: 'Inter_600SemiBold' }]}>{t}</Text>
                  <View style={[styles.sfBadge, on && { backgroundColor: cor + '25' }]}>
                    <Text style={[styles.sfBadgeTxt, on && { color: cor }]}>{cnt}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* ── Grid ── */}
        {filtered.length === 0 ? (
          <View style={styles.empty}>
            <View style={styles.emptyIconWrap}>
              <MaterialCommunityIcons name="door-open" size={32} color={Colors.textMuted} />
            </View>
            <Text style={styles.emptyTitle}>{search || filterTipo ? 'Nenhuma sala encontrada' : 'Sem salas registadas'}</Text>
            <Text style={styles.emptyDesc}>{search || filterTipo ? 'Tente alterar os filtros.' : 'Clique em + para adicionar a primeira sala.'}</Text>
          </View>
        ) : (
          <>
            <View style={[styles.grid, isWeb && styles.gridWeb]}>
              {pageItems.map(item => renderCard(item))}
            </View>

            <PaginationBar currentPage={safePage} totalPages={totalPages} onPageChange={setCurrentPage} />
          </>
        )}
      </ScrollView>

      <SalaFormModal
        visible={showForm}
        onClose={() => { setShowForm(false); setEditing(null); }}
        onSave={handleSave}
        sala={editing}
      />
    </View>
  );
}

const mS = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', zIndex: 1000, elevation: 1000 },
  container: {
    backgroundColor: Colors.primaryDark,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingTop: 20, paddingHorizontal: 20,
    maxHeight: '90%', width: '100%', maxWidth: 480,
    zIndex: 1001, elevation: 1001,
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  title: { fontSize: 18, fontFamily: 'Inter_700Bold', color: Colors.text },
  field: { marginBottom: 18 },
  fieldLabel: { fontSize: 12, fontFamily: 'Inter_500Medium', color: Colors.textMuted, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  input: { backgroundColor: Colors.surface, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, color: Colors.text, fontFamily: 'Inter_400Regular', fontSize: 15, borderWidth: 1, borderColor: Colors.border },
  tipoGrid: { gap: 8 },
  tipoBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 14, backgroundColor: Colors.surface, borderRadius: 10, borderWidth: 1, borderColor: Colors.border },
  tipoText: { fontSize: 13, fontFamily: 'Inter_500Medium', color: Colors.textSecondary, flex: 1 },
  toggleRow: { flexDirection: 'row', gap: 8 },
  toggleBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, backgroundColor: Colors.surface, alignItems: 'center', borderWidth: 1, borderColor: Colors.border },
  toggleActive: { backgroundColor: Colors.accent + '22', borderColor: Colors.accent },
  toggleText: { fontSize: 13, fontFamily: 'Inter_500Medium', color: Colors.textSecondary },
  toggleTextActive: { color: Colors.accent },
  actions: { flexDirection: 'row', gap: 10, marginTop: 20 },
  cancelBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, backgroundColor: Colors.surface, alignItems: 'center', borderWidth: 1, borderColor: Colors.border },
  cancelText: { fontSize: 14, fontFamily: 'Inter_600SemiBold', color: Colors.textSecondary },
  saveBtn: { flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 12, backgroundColor: Colors.accent },
  saveText: { fontSize: 14, fontFamily: 'Inter_600SemiBold', color: '#fff' },
});

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  scroll: { paddingHorizontal: 16, paddingTop: 10 },

  /* Stats */
  statsRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  statCard: {
    flex: 1, backgroundColor: Colors.surface, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 8,
    alignItems: 'center', gap: 4, borderWidth: 1, borderColor: Colors.border,
  },
  statIconWrap: { width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
  statValue: { fontSize: 20, fontFamily: 'Inter_700Bold', color: Colors.text },
  statLabel: { fontSize: 10, fontFamily: 'Inter_400Regular', color: Colors.textMuted, textAlign: 'center' },

  /* ── Smart Search + Filter Panel ── */
  sfPanel: {
    backgroundColor: Colors.surface, borderRadius: 16,
    borderWidth: 1, borderColor: Colors.border,
    marginBottom: 14, overflow: 'hidden',
  },
  sfSearchRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 8, gap: 8,
  },
  sfInput: { flex: 1, color: Colors.text, fontFamily: 'Inter_400Regular', fontSize: 14 },
  sfCount: {
    minWidth: 30, paddingHorizontal: 7, paddingVertical: 3,
    borderRadius: 8, backgroundColor: Colors.backgroundCard,
    borderWidth: 1, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  sfCountActive: { backgroundColor: Colors.accent + '20', borderColor: Colors.accent + '45' },
  sfCountTxt: { fontSize: 11, fontFamily: 'Inter_700Bold', color: Colors.textMuted },
  sfCountTxtActive: { color: Colors.accent },
  sfDivider: { height: 1, backgroundColor: Colors.border },
  sfTabs: { flexDirection: 'row', gap: 6, paddingHorizontal: 12, paddingVertical: 10 },
  sfTab: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8,
    backgroundColor: Colors.backgroundCard, borderWidth: 1, borderColor: Colors.border,
  },
  sfTabOn: { backgroundColor: Colors.accent + '18', borderColor: Colors.accent + '50' },
  sfTabLbl: { fontSize: 11, fontFamily: 'Inter_500Medium', color: Colors.textMuted },
  sfTabLblOn: { color: Colors.accent, fontFamily: 'Inter_600SemiBold' },
  sfBadge: {
    minWidth: 18, height: 16, borderRadius: 5, paddingHorizontal: 4,
    backgroundColor: Colors.border, alignItems: 'center', justifyContent: 'center',
  },
  sfBadgeOn: { backgroundColor: Colors.accent + '28' },
  sfBadgeTxt: { fontSize: 9, fontFamily: 'Inter_700Bold', color: Colors.textMuted },
  sfBadgeTxtOn: { color: Colors.accent },

  /* Grid */
  grid: { gap: 10 },
  gridWeb: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },

  /* Card */
  card: {
    backgroundColor: Colors.surface, borderRadius: 14,
    borderWidth: 1, borderColor: Colors.border,
    borderTopWidth: 3, padding: 14, gap: 10,
  },
  cardWeb: { width: '48.5%' },
  cardInactive: { opacity: 0.55 },

  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  iconWrap: { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  cardInfo: { flex: 1 },
  cardName: { fontSize: 14, fontFamily: 'Inter_600SemiBold', color: Colors.text, marginBottom: 2 },
  cardBloco: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted },

  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20, borderWidth: 1 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 10, fontFamily: 'Inter_600SemiBold' },

  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  tipoBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1 },
  tipoLabel: { fontSize: 10, fontFamily: 'Inter_600SemiBold' },
  capRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  capText: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted },

  cardDivider: { height: 1, backgroundColor: Colors.border },

  cardActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  actionChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, borderWidth: 1 },
  actionChipText: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  iconBtn: { width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },

  /* Turmas na sala */
  turmasRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  turmasChips: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  turmaChip: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6,
    backgroundColor: Colors.accent + '14', borderWidth: 1, borderColor: Colors.accent + '30',
  },
  turmaChipText: { fontSize: 10, fontFamily: 'Inter_600SemiBold', color: Colors.accent },
  turmaChipClasse: { fontSize: 10, fontFamily: 'Inter_400Regular', color: Colors.textMuted },
  turmaChipTurno: { fontSize: 10 },

  /* Empty */
  empty: { alignItems: 'center', paddingTop: 60, gap: 10 },
  emptyIconWrap: { width: 64, height: 64, borderRadius: 18, backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.border, marginBottom: 4 },
  emptyTitle: { fontSize: 15, fontFamily: 'Inter_600SemiBold', color: Colors.textSecondary },
  emptyDesc: { fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textMuted, textAlign: 'center', paddingHorizontal: 24 },
});
