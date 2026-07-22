import React, { useState, useMemo, useEffect } from 'react';
import {FlatList, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { Colors } from '@/constants/colors';
import DateInput from '@/components/DateInput';
import { useData, Evento } from '@/context/DataContext';
import { useAuth } from '@/context/AuthContext';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import TopBar from '@/components/TopBar';
import { alertSucesso, alertErro } from '@/utils/toast';
import { webAlert } from '@/utils/webAlert';
import PaginationBar from '@/components/PaginationBar';

const PAGE_SIZE = 8;

const TIPOS = ['Académico', 'Cultural', 'Desportivo', 'Exame', 'Feriado', 'Reunião'] as const;

const TIPO_CONFIG: Record<string, { color: string; icon: string }> = {
  'Académico': { color: Colors.info, icon: 'school' },
  'Cultural': { color: Colors.gold, icon: 'musical-notes' },
  'Desportivo': { color: Colors.success, icon: 'football' },
  'Exame': { color: Colors.danger, icon: 'document-text' },
  'Feriado': { color: Colors.warning, icon: 'flag' },
  'Reunião': { color: Colors.textSecondary, icon: 'people' },
};

function EventoFormModal({ visible, onClose, onSave, evento }: any) {
  const [form, setForm] = useState<Partial<Evento>>(evento || {
    titulo: '', descricao: '', data: new Date().toISOString().split('T')[0],
    hora: '08:00', tipo: 'Académico', local: '', turmasIds: [],
  });
  const set = (k: keyof Evento, v: any) => setForm(f => ({ ...f, [k]: v }));
  const insets = useSafeAreaInsets();
  const bottomPad = Platform.OS === 'web' ? 34 : insets.bottom;

  function handleSave() {
    if (!form.titulo || !form.data) {
      webAlert('Campos obrigatórios', 'Preencha título e data.');
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
            <Text style={mS.title}>{evento ? 'Editar Evento' : 'Novo Evento'}</Text>
            <TouchableOpacity onPress={onClose}><Ionicons name="close" size={22} color={Colors.textSecondary} /></TouchableOpacity>
          </View>
          <ScrollView showsVerticalScrollIndicator={false}>
            {[
              { label: 'Título', key: 'titulo', placeholder: 'Nome do evento' },
              { label: 'Descrição', key: 'descricao', placeholder: 'Detalhes...' },
            ].map(f => (
              <View key={f.key} style={mS.field}>
                <Text style={mS.fieldLabel}>{f.label}</Text>
                <TextInput
                  style={mS.input}
                  value={(form as any)[f.key] ?? ''}
                  onChangeText={v => set(f.key as keyof Evento, v)}
                  placeholder={f.placeholder}
                  placeholderTextColor={Colors.textMuted}
                  multiline={f.key === 'descricao'}
                  numberOfLines={f.key === 'descricao' ? 3 : 1}
                  returnKeyType={f.key === 'descricao' ? undefined : 'done'}
                  onSubmitEditing={f.key === 'descricao' ? undefined : handleSave}
                />
              </View>
            ))}
            <View style={mS.field}>
              <Text style={mS.fieldLabel}>Data</Text>
              <DateInput style={mS.input} value={form.data ?? ''} onChangeText={v => set('data', v)} />
            </View>
            {[
              { label: 'Hora (HH:MM)', key: 'hora', placeholder: '08:00' },
              { label: 'Local', key: 'local', placeholder: 'Sala / Pátio / etc.' },
            ].map(f => (
              <View key={f.key} style={mS.field}>
                <Text style={mS.fieldLabel}>{f.label}</Text>
                <TextInput
                  style={mS.input}
                  value={(form as any)[f.key] ?? ''}
                  onChangeText={v => set(f.key as keyof Evento, v)}
                  placeholder={f.placeholder}
                  placeholderTextColor={Colors.textMuted}
                  returnKeyType="done"
                  onSubmitEditing={handleSave}
                />
              </View>
            ))}

            <View style={mS.field}>
              <Text style={mS.fieldLabel}>Tipo</Text>
              <View style={mS.toggleRow}>
                {TIPOS.map(t => {
                  const cfg = TIPO_CONFIG[t];
                  const active = form.tipo === t;
                  return (
                    <TouchableOpacity key={t} style={[mS.tipoBtn, active && { backgroundColor: `${cfg.color}20`, borderColor: cfg.color }]} onPress={() => set('tipo', t)}>
                      <Ionicons name={cfg.icon as any} size={14} color={active ? cfg.color : Colors.textMuted} />
                      <Text style={[mS.toggleText, active && { color: cfg.color, fontFamily: 'Inter_600SemiBold' }]}>{t}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          </ScrollView>
          <TouchableOpacity style={mS.saveBtn} onPress={handleSave}>
            <Ionicons name="checkmark" size={18} color={Colors.text} />
            <Text style={mS.saveBtnText}>Guardar Evento</Text>
          </TouchableOpacity>
        </View>
      </View>
          </KeyboardAvoidingView>
</Modal>
  );
}

export default function EventosScreen() {
  const { eventos, addEvento, updateEvento, deleteEvento } = useData();
  const { user } = useAuth();
  const { isMobile } = useBreakpoint();
  const insets = useSafeAreaInsets();
  const [filterTipo, setFilterTipo] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editEvento, setEditEvento] = useState<Evento | null>(null);
  const [viewMode, setViewMode] = useState<'lista' | 'calendario'>('lista');
  const [pageUpcoming, setPageUpcoming] = useState(1);
  const [pagePast, setPagePast] = useState(1);
  const bottomPad = Platform.OS === 'web' ? 34 : insets.bottom;
  const isAluno = user?.role === 'aluno';

  const today = new Date().toISOString().split('T')[0];

  const filtered = useMemo(() => {
    return eventos
      .filter(e => !filterTipo || e.tipo === filterTipo)
      .sort((a, b) => a.data.localeCompare(b.data));
  }, [eventos, filterTipo]);

  const upcoming = useMemo(() => filtered.filter(e => e.data >= today), [filtered, today]);
  const past = useMemo(() => filtered.filter(e => e.data < today), [filtered, today]);

  // Reset pages when filter changes
  useEffect(() => { setPageUpcoming(1); setPagePast(1); }, [filterTipo]);

  const totalPagesUpcoming = Math.max(1, Math.ceil(upcoming.length / PAGE_SIZE));
  const totalPagesPast = Math.max(1, Math.ceil(past.length / PAGE_SIZE));
  const safePageUpcoming = Math.min(pageUpcoming, totalPagesUpcoming);
  const safePagePast = Math.min(pagePast, totalPagesPast);

  const upcomingPage = upcoming.slice((safePageUpcoming - 1) * PAGE_SIZE, safePageUpcoming * PAGE_SIZE);
  const pastPage = past.slice((safePagePast - 1) * PAGE_SIZE, safePagePast * PAGE_SIZE);

  async function handleSave(form: Partial<Evento>) {
    if (editEvento) {
      await updateEvento(editEvento.id, form);
    } else {
      await addEvento(form as any);
    }
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    alertSucesso(
      editEvento ? 'Evento actualizado' : 'Evento criado',
      editEvento
        ? `"${form.titulo}" foi actualizado com sucesso.`
        : `"${form.titulo}" foi adicionado ao calendário.`
    );
    setShowForm(false);
    setEditEvento(null);
  }

  function confirmDelete(ev: Evento) {
    webAlert('Remover Evento', `Remover "${ev.titulo}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Remover', style: 'destructive', onPress: async () => {
          try {
            await deleteEvento(ev.id);
            alertSucesso('Evento removido', `"${ev.titulo}" foi removido do calendário.`);
          } catch {
            alertErro('Erro', 'Não foi possível remover o evento.');
          }
        }
      },
    ]);
  }

  function getDaysUntil(dateStr: string) {
    const diff = Math.ceil((new Date(dateStr).getTime() - new Date(today).getTime()) / (1000 * 60 * 60 * 24));
    if (diff === 0) return 'Hoje';
    if (diff === 1) return 'Amanhã';
    if (diff < 0) return `${Math.abs(diff)}d atrás`;
    return `Em ${diff} dias`;
  }

  const renderEvento = ({ item }: { item: Evento }) => {
    const cfg = TIPO_CONFIG[item.tipo] || { color: Colors.textMuted, icon: 'calendar' };
    const isPast = item.data < today;
    return (
      <View style={[styles.card, isPast && styles.cardPast]}>
        <View style={[styles.typeBar, { backgroundColor: cfg.color }]} />
        <View style={styles.cardContent}>
          <View style={styles.cardTop}>
            <View style={[styles.typeIcon, { backgroundColor: `${cfg.color}15` }]}>
              <Ionicons name={cfg.icon as any} size={18} color={cfg.color} />
            </View>
            <View style={styles.cardInfo}>
              <Text style={[styles.titulo, isPast && styles.titlePast]}>{item.titulo}</Text>
              <View style={styles.metaRow}>
                <Ionicons name="calendar-outline" size={11} color={Colors.textMuted} />
                <Text style={styles.metaText}>{item.data} · {item.hora}</Text>
                {item.local && (
                  <>
                    <Ionicons name="location-outline" size={11} color={Colors.textMuted} />
                    <Text style={styles.metaText}>{item.local}</Text>
                  </>
                )}
              </View>
            </View>
            <View style={[styles.daysBadge, { backgroundColor: `${cfg.color}15` }]}>
              <Text style={[styles.daysText, { color: cfg.color }]}>{getDaysUntil(item.data)}</Text>
            </View>
          </View>
          {item.descricao ? <Text style={styles.descricao} numberOfLines={1}>{item.descricao}</Text> : null}
          <View style={styles.cardActions}>
            <View style={[styles.tipoBadge, { backgroundColor: `${cfg.color}15` }]}>
              <Text style={[styles.tipoText, { color: cfg.color }]}>{item.tipo}</Text>
            </View>
            {!isAluno && (
              <View style={styles.actionBtns}>
                <TouchableOpacity style={[styles.actionBtn, styles.actionBtnPrimary]} onPress={() => { setEditEvento(item); setShowForm(true); }}>
                  <Ionicons name="create-outline" size={16} color={Colors.info} />
                </TouchableOpacity>
                <TouchableOpacity style={styles.actionBtn} onPress={() => confirmDelete(item)}>
                  <Ionicons name="trash-outline" size={16} color={Colors.danger} />
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.screen}>
      <TopBar
        title="Calendário"
        subtitle={`${upcoming.length} próximos`}
        rightAction={isAluno ? undefined : { icon: 'add', onPress: () => { setEditEvento(null); setShowForm(true); } }}
      />

      <View style={[styles.filterBar, isMobile && styles.filterBarMobile]}>
        {isMobile ? (
          <View style={styles.filterGrid}>
            <TouchableOpacity style={[styles.chip, styles.chipGrid, !filterTipo && styles.chipActive]} onPress={() => setFilterTipo('')}>
              <Ionicons name="grid-outline" size={13} color={!filterTipo ? Colors.goldLight : Colors.textMuted} />
              <Text style={[styles.chipText, !filterTipo && styles.chipTextActive]}>Todos</Text>
            </TouchableOpacity>
            {TIPOS.map(t => {
              const cfg = TIPO_CONFIG[t];
              const active = filterTipo === t;
              return (
                <TouchableOpacity key={t} style={[styles.chip, styles.chipGrid, active && { backgroundColor: `${cfg.color}20`, borderColor: cfg.color }]} onPress={() => setFilterTipo(active ? '' : t)}>
                  <Ionicons name={cfg.icon as any} size={13} color={active ? cfg.color : Colors.textMuted} />
                  <Text style={[styles.chipText, active && { color: cfg.color, fontFamily: 'Inter_600SemiBold' }]}>{t}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterContent}>
            <TouchableOpacity style={[styles.chip, !filterTipo && styles.chipActive]} onPress={() => setFilterTipo('')}>
              <Ionicons name="grid-outline" size={12} color={!filterTipo ? Colors.goldLight : Colors.textMuted} />
              <Text style={[styles.chipText, !filterTipo && styles.chipTextActive]}>Todos</Text>
            </TouchableOpacity>
            {TIPOS.map(t => {
              const cfg = TIPO_CONFIG[t];
              const active = filterTipo === t;
              return (
                <TouchableOpacity key={t} style={[styles.chip, active && { backgroundColor: `${cfg.color}20`, borderColor: cfg.color }]} onPress={() => setFilterTipo(active ? '' : t)}>
                  <Ionicons name={cfg.icon as any} size={12} color={active ? cfg.color : Colors.textMuted} />
                  <Text style={[styles.chipText, active && { color: cfg.color, fontFamily: 'Inter_600SemiBold' }]}>{t}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}
      </View>

      <ScrollView
        contentContainerStyle={[styles.listContent, { paddingBottom: bottomPad + 20 }]}
        showsVerticalScrollIndicator={false}
      >
        {upcoming.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Próximos Eventos</Text>
              <Text style={styles.sectionCount}>{upcoming.length} evento{upcoming.length !== 1 ? 's' : ''}</Text>
            </View>
            {upcomingPage.map(e => renderEvento({ item: e }))}
            {totalPagesUpcoming > 1 && (
              <PaginationBar
                currentPage={safePageUpcoming}
                totalPages={totalPagesUpcoming}
                onPageChange={setPageUpcoming}
              />
            )}
          </View>
        )}
        {past.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Eventos Passados</Text>
              <Text style={styles.sectionCount}>{past.length} evento{past.length !== 1 ? 's' : ''}</Text>
            </View>
            {pastPage.map(e => renderEvento({ item: e }))}
            {totalPagesPast > 1 && (
              <PaginationBar
                currentPage={safePagePast}
                totalPages={totalPagesPast}
                onPageChange={setPagePast}
              />
            )}
          </View>
        )}
        {filtered.length === 0 && (
          <View style={styles.empty}>
            <Ionicons name="calendar-outline" size={40} color={Colors.textMuted} />
            <Text style={styles.emptyText}>Nenhum evento encontrado</Text>
          </View>
        )}
      </ScrollView>

      {showForm && (
        <EventoFormModal visible={showForm} onClose={() => { setShowForm(false); setEditEvento(null); }} onSave={handleSave} evento={editEvento} />
      )}
    </View>
  );
}

const mS = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'center', alignItems: 'center' },
  container: { backgroundColor: Colors.backgroundCard, borderTopLeftRadius: 24, borderTopRightRadius: 24, borderTopWidth: 1, borderColor: Colors.border, padding: 20, maxHeight: '90%', width: '100%', maxWidth: 480 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  title: { fontSize: 18, fontFamily: 'Inter_700Bold', color: Colors.text },
  field: { marginBottom: 14 },
  fieldLabel: { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: Colors.textSecondary, marginBottom: 6 },
  input: { backgroundColor: Colors.surface, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, fontFamily: 'Inter_400Regular', color: Colors.text },
  toggleRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  tipoBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
  toggleText: { fontSize: 12, fontFamily: 'Inter_500Medium', color: Colors.textSecondary },
  saveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.accent, borderRadius: 14, paddingVertical: 16, gap: 8, marginTop: 12 },
  saveBtnText: { fontSize: 15, fontFamily: 'Inter_700Bold', color: Colors.text },
});

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  filterBar: { borderBottomWidth: 1, borderBottomColor: Colors.border, backgroundColor: Colors.background },
  filterBarMobile: { paddingHorizontal: 12, paddingVertical: 10 },
  filterContent: { paddingHorizontal: 16, paddingVertical: 10, gap: 8, alignItems: 'center' },
  filterGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
  chipGrid: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 },
  chipActive: { backgroundColor: `${Colors.gold}20`, borderColor: Colors.gold },
  chipText: { fontSize: 12, fontFamily: 'Inter_500Medium', color: Colors.textSecondary },
  chipTextActive: { color: Colors.goldLight, fontFamily: 'Inter_600SemiBold' },
  listContent: { padding: 16, gap: 8 },
  section: { gap: 8, marginBottom: 8 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 },
  sectionTitle: { fontSize: 13, fontFamily: 'Inter_700Bold', color: Colors.textSecondary, letterSpacing: 0.5, textTransform: 'uppercase' },
  sectionCount: { fontSize: 11, fontFamily: 'Inter_500Medium', color: Colors.textMuted },
  card: { backgroundColor: Colors.backgroundCard, borderRadius: 14, borderWidth: 1, borderColor: Colors.border, flexDirection: 'row', overflow: 'hidden' },
  cardPast: { opacity: 0.65 },
  typeBar: { width: 4 },
  cardContent: { flex: 1, padding: 11, gap: 5 },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  typeIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  cardInfo: { flex: 1, gap: 3 },
  titulo: { fontSize: 14, fontFamily: 'Inter_600SemiBold', color: Colors.text },
  titlePast: { color: Colors.textSecondary },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'wrap' },
  metaText: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted },
  daysBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  daysText: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  descricao: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textSecondary, lineHeight: 15 },
  cardActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 },
  tipoBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  tipoText: { fontSize: 10, fontFamily: 'Inter_600SemiBold' },
  actionBtns: { flexDirection: 'row', gap: 6 },
  actionBtn: { width: 44, height: 44, borderRadius: 10, backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center' },
  actionBtnPrimary: { backgroundColor: `${Colors.info}18`, borderWidth: 1, borderColor: `${Colors.info}35` },
  empty: { alignItems: 'center', gap: 10, paddingTop: 60 },
  emptyText: { fontSize: 14, fontFamily: 'Inter_400Regular', color: Colors.textMuted },
});
