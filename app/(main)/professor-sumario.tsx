import React, { useState, useMemo } from 'react';
import {FlatList, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '@/constants/colors';
import TopBar from '@/components/TopBar';
import ProfessorLoadingSkeleton from '@/components/ProfessorLoadingSkeleton';
import { useAuth } from '@/context/AuthContext';
import { useData } from '@/context/DataContext';
import { useProfessor } from '@/context/ProfessorContext';
import { useNotificacoes } from '@/context/NotificacoesContext';
import { webAlert } from '@/utils/webAlert';
import { useEnterToSave } from '@/hooks/useEnterToSave';

const PERIODOS = [
  { numero: 1, inicio: '07:00', fim: '07:45' },
  { numero: 2, inicio: '07:45', fim: '08:30' },
  { numero: 3, inicio: '08:30', fim: '09:15' },
  { numero: 4, inicio: '09:45', fim: '10:30' },
  { numero: 5, inicio: '10:30', fim: '11:15' },
  { numero: 6, inicio: '11:15', fim: '12:00' },
];

export default function ProfessorSumarioScreen() {
  const { user } = useAuth();
  const { professores, turmas, isLoading: dataLoading } = useData();
  const { sumarios, addSumario } = useProfessor();
  const { addNotificacao } = useNotificacoes();
  const insets = useSafeAreaInsets();
  const bottomInset = Platform.OS === 'web' ? 34 : insets.bottom;

  const [showForm, setShowForm] = useState(false);
  const [turmaId, setTurmaId] = useState('');
  const [disciplina, setDisciplina] = useState('');
  const [conteudo, setConteudo] = useState('');
  const [numeroAula, setNumeroAula] = useState('');
  const [periodoIdx, setPeriodoIdx] = useState(0);
  const [showTurmaList, setShowTurmaList] = useState(false);
  const [showDiscList, setShowDiscList] = useState(false);
  const [tab, setTab] = useState<'pendentes' | 'todos'>('todos');

  const prof = useMemo(() => professores.find(p => (user?.id && p.utilizadorId === user.id) || p.email === user?.email), [professores, user]);
  const minhasTurmas = useMemo(() => prof ? turmas.filter(t => (prof.turmasIds.includes(t.id) || (t.professoresIds ?? []).includes(prof.id)) && t.ativo) : [], [prof, turmas]);

  const meusSumarios = useMemo(() =>
    sumarios.filter(s => s.professorId === prof?.id)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [sumarios, prof]
  );

  const pendentes = meusSumarios.filter(s => s.status === 'pendente');
  const listaMostrar = tab === 'pendentes' ? pendentes : meusSumarios;

  const disciplinas = prof?.disciplinas || [];
  const periodo = PERIODOS[periodoIdx];

  const turmaAtual = minhasTurmas.find(t => t.id === turmaId);

  async function submeter() {
    if (!conteudo.trim() || !turmaId || !disciplina || !numeroAula || !prof) return;
    const turma = minhasTurmas.find(t => t.id === turmaId);
    const hoje = new Date();
    await addSumario({
      professorId: prof.id,
      professorNome: `${prof.nome} ${prof.apelido}`,
      turmaId,
      turmaNome: turma?.nome || '',
      disciplina,
      data: hoje.toISOString().split('T')[0],
      horaInicio: periodo.inicio,
      horaFim: periodo.fim,
      numeroAula: parseInt(numeroAula) || 1,
      conteudo,
      status: 'pendente',
    });

    await addNotificacao({
      titulo: 'Sumário Submetido',
      mensagem: `Sumário da aula ${numeroAula} de ${disciplina} (${turma?.nome}) enviado para aprovação.`,
      tipo: 'info',
      data: new Date().toISOString(),
    });

    setConteudo(''); setTurmaId(''); setDisciplina(''); setNumeroAula('');
    setShowForm(false);
    webAlert('Sumário enviado', 'O seu sumário foi enviado ao Recursos Humanos para validação.');
  }

  function statusColor(status: string) {
    return status === 'aceite' ? Colors.success : status === 'rejeitado' ? Colors.danger : Colors.warning;
  }
  function statusLabel(status: string) {
    return status === 'aceite' ? 'Aceite' : status === 'rejeitado' ? 'Rejeitado' : 'Pendente';
  }
  function statusIcon(status: string) {
    return status === 'aceite' ? 'checkmark-circle' : status === 'rejeitado' ? 'close-circle' : 'time';
  }

  useEnterToSave(submeter, showForm);

  if (dataLoading) {
    return (
      <View style={styles.container}>
        <TopBar title="Sumário / Presenças" subtitle="A sincronizar dados..." />
        <ProfessorLoadingSkeleton />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <TopBar title="Sumário / Presenças" subtitle="Registar aulas e marcar presença" />

      {/* Stats Bar */}
      <View style={styles.statsBar}>
        <View style={styles.statItem}>
          <Text style={[styles.statNum, { color: Colors.success }]}>{meusSumarios.filter(s => s.status === 'aceite').length}</Text>
          <Text style={styles.statLabel}>Aceites</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={[styles.statNum, { color: Colors.warning }]}>{pendentes.length}</Text>
          <Text style={styles.statLabel}>Pendentes</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={[styles.statNum, { color: Colors.danger }]}>{meusSumarios.filter(s => s.status === 'rejeitado').length}</Text>
          <Text style={styles.statLabel}>Rejeitados</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={[styles.statNum, { color: Colors.info }]}>{meusSumarios.length}</Text>
          <Text style={styles.statLabel}>Total</Text>
        </View>
      </View>

      {/* Info Banner */}
      <View style={styles.infoBanner}>
        <Ionicons name="information-circle" size={18} color={Colors.info} />
        <Text style={styles.infoText}>
          Após cada aula, registar o sumário. O RH (Recursos Humanos) valida e controla as presenças.
        </Text>
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        <TouchableOpacity style={[styles.tab, tab === 'todos' && styles.tabActive]} onPress={() => setTab('todos')}>
          <Text style={[styles.tabText, tab === 'todos' && styles.tabTextActive]}>Todos ({meusSumarios.length})</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tab, tab === 'pendentes' && styles.tabActive]} onPress={() => setTab('pendentes')}>
          <Text style={[styles.tabText, tab === 'pendentes' && styles.tabTextActive]}>
            Pendentes ({pendentes.length})
          </Text>
        </TouchableOpacity>
      </View>

      {/* List */}
      <FlatList
        data={listaMostrar}
        keyExtractor={s => s.id}
        contentContainerStyle={{ padding: 16, paddingBottom: bottomInset + 90 }}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <MaterialCommunityIcons name="clipboard-text-outline" size={52} color={Colors.textMuted} />
            <Text style={styles.emptyText}>Nenhum sumário registado</Text>
            <Text style={styles.emptySub}>Clique em + para registar uma aula</Text>
          </View>
        }
        renderItem={({ item: s }) => (
          <View style={[styles.sumCard, { borderLeftColor: statusColor(s.status), borderLeftWidth: 3 }]}>
            <View style={styles.sumTop}>
              <View style={{ flex: 1 }}>
                <Text style={styles.sumDisciplina}>{s.disciplina} — Aula {s.numeroAula}</Text>
                <Text style={styles.sumTurma}>{s.turmaNome} · {s.data}</Text>
                <Text style={styles.sumHora}>{s.horaInicio} – {s.horaFim}</Text>
              </View>
              <View style={[styles.statusBadge, { backgroundColor: statusColor(s.status) + '22' }]}>
                <Ionicons name={statusIcon(s.status) as any} size={14} color={statusColor(s.status)} />
                <Text style={[styles.statusText, { color: statusColor(s.status) }]}>{statusLabel(s.status)}</Text>
              </View>
            </View>
            <Text style={styles.sumConteudo} numberOfLines={3}>{s.conteudo}</Text>
            {s.status === 'rejeitado' && s.observacaoRH && (
              <View style={styles.observacaoBox}>
                <Ionicons name="alert-circle" size={14} color={Colors.danger} />
                <Text style={styles.observacaoText}>RH: {s.observacaoRH}</Text>
              </View>
            )}
          </View>
        )}
      />

      {/* FAB */}
      <TouchableOpacity style={styles.fab} onPress={() => setShowForm(true)}>
        <Ionicons name="add" size={20} color="#fff" />
        <Text style={styles.fabTxt}>Novo Sumário</Text>
      </TouchableOpacity>

      {/* Form Modal */}
      <Modal visible={showForm} transparent animationType="slide" onRequestClose={() => setShowForm(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={styles.overlay}>
          <View style={styles.modalBox}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Registar Sumário</Text>
              <TouchableOpacity onPress={() => setShowForm(false)} style={styles.closeBtn}>
                <Ionicons name="close" size={22} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.fieldLabel}>Turma</Text>
              <TouchableOpacity style={styles.selector} onPress={() => { setShowTurmaList(v => !v); setShowDiscList(false); }}>
                <Text style={turmaId ? styles.selectorValue : styles.selectorPlaceholder}>
                  {turmaId ? minhasTurmas.find(t => t.id === turmaId)?.nome : 'Selecionar turma...'}
                </Text>
                <Ionicons name="chevron-down" size={16} color={Colors.textMuted} />
              </TouchableOpacity>
              {showTurmaList && (
                <View style={styles.dropdownList}>
                  {minhasTurmas.map(t => (
                    <TouchableOpacity key={t.id} style={[styles.dropdownItem, turmaId === t.id && styles.dropdownItemActive]}
                      onPress={() => { setTurmaId(t.id); setShowTurmaList(false); }}>
                      <Text style={[styles.dropdownText, turmaId === t.id && { color: Colors.gold }]}>{t.nome}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              <Text style={styles.fieldLabel}>Disciplina</Text>
              <TouchableOpacity style={styles.selector} onPress={() => { setShowDiscList(v => !v); setShowTurmaList(false); }}>
                <Text style={disciplina ? styles.selectorValue : styles.selectorPlaceholder}>
                  {disciplina || 'Selecionar disciplina...'}
                </Text>
                <Ionicons name="chevron-down" size={16} color={Colors.textMuted} />
              </TouchableOpacity>
              {showDiscList && (
                <View style={styles.dropdownList}>
                  {disciplinas.map(d => (
                    <TouchableOpacity key={d} style={[styles.dropdownItem, disciplina === d && styles.dropdownItemActive]}
                      onPress={() => { setDisciplina(d); setShowDiscList(false); }}>
                      <Text style={[styles.dropdownText, disciplina === d && { color: Colors.gold }]}>{d}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              <Text style={styles.fieldLabel}>Período da Aula</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={styles.periodoRow}>
                  {PERIODOS.map((p, i) => (
                    <TouchableOpacity
                      key={p.numero}
                      style={[styles.periodoBtn, periodoIdx === i && styles.periodoBtnActive]}
                      onPress={() => setPeriodoIdx(i)}
                    >
                      <Text style={[styles.periodoBtnNum, periodoIdx === i && styles.periodoBtnNumActive]}>{p.numero}º</Text>
                      <Text style={[styles.periodoBtnTime, periodoIdx === i && styles.periodoBtnTimeActive]}>{p.inicio}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>

              <Text style={styles.fieldLabel}>Número da Aula</Text>
              <TextInput
                style={styles.input}
                placeholder="Ex: 1, 2, 3..."
                placeholderTextColor={Colors.textMuted}
                value={numeroAula}
                onChangeText={setNumeroAula}
                keyboardType="numeric"
                returnKeyType="next"
                blurOnSubmit={false}
              />

              <Text style={styles.fieldLabel}>Conteúdo / Sumário da Aula</Text>
              <TextInput
                style={[styles.input, { height: 140, textAlignVertical: 'top' }]}
                placeholder="Descreva o conteúdo lecionado nesta aula..."
                placeholderTextColor={Colors.textMuted}
                value={conteudo}
                onChangeText={setConteudo}
                multiline
              />

              <View style={styles.infoBox}>
                <Ionicons name="information-circle-outline" size={16} color={Colors.info} />
                <Text style={styles.infoBoxText}>
                  Este sumário será enviado ao RH para validação. Ficará como "Pendente" até ser aceite ou rejeitado.
                </Text>
              </View>

              <TouchableOpacity
                style={[styles.saveBtn, (!conteudo || !turmaId || !disciplina || !numeroAula) && styles.saveBtnDisabled]}
                onPress={submeter}
                disabled={!conteudo || !turmaId || !disciplina || !numeroAula}
              >
                <Ionicons name="send" size={18} color="#fff" />
                <Text style={styles.saveBtnText}>Submeter Sumário</Text>
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
  statsBar: { flexDirection: 'row', backgroundColor: Colors.backgroundCard, borderBottomWidth: 1, borderBottomColor: Colors.border, paddingVertical: 14 },
  statItem: { flex: 1, alignItems: 'center' },
  statNum: { fontSize: 22, fontFamily: 'Inter_700Bold' },
  statLabel: { fontSize: 10, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 2 },
  statDivider: { width: 1, backgroundColor: Colors.border },
  infoBanner: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, margin: 16, padding: 12, backgroundColor: Colors.info + '18', borderRadius: 12, borderWidth: 1, borderColor: Colors.info + '33' },
  infoText: { flex: 1, fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.info, lineHeight: 18 },
  tabs: { flexDirection: 'row', marginHorizontal: 16, marginBottom: 4, backgroundColor: Colors.surface, borderRadius: 12, padding: 4 },
  tab: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 10 },
  tabActive: { backgroundColor: Colors.backgroundCard },
  tabText: { fontSize: 13, fontFamily: 'Inter_500Medium', color: Colors.textMuted },
  tabTextActive: { color: Colors.gold, fontFamily: 'Inter_600SemiBold' },
  sumCard: { backgroundColor: Colors.backgroundCard, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: Colors.border },
  sumTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 8 },
  sumDisciplina: { fontSize: 14, fontFamily: 'Inter_600SemiBold', color: Colors.text },
  sumTurma: { fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.gold, marginTop: 2 },
  sumHora: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 1 },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  statusText: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  sumConteudo: { fontSize: 13, fontFamily: 'Inter_400Regular', color: Colors.textSecondary, lineHeight: 20 },
  observacaoBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: 8, padding: 10, backgroundColor: Colors.danger + '18', borderRadius: 8 },
  observacaoText: { flex: 1, fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.danger },
  fab: { position: 'absolute', bottom: 80, right: 20, height: 44, paddingHorizontal: 16, borderRadius: 22, backgroundColor: Colors.success, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6, elevation: 6, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8 },
  fabTxt: { color: '#fff', fontSize: 13, fontFamily: 'Inter_700Bold' },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'center', alignItems: 'center' },
  modalBox: { backgroundColor: Colors.backgroundCard, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, maxHeight: '92%', width: '100%', maxWidth: 480 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  modalTitle: { flex: 1, fontSize: 17, fontFamily: 'Inter_700Bold', color: Colors.text },
  closeBtn: { padding: 4 },
  fieldLabel: { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: Colors.textMuted, marginBottom: 6, marginTop: 14, textTransform: 'uppercase', letterSpacing: 0.8 },
  selector: { backgroundColor: Colors.surface, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: Colors.border },
  selectorValue: { fontSize: 14, fontFamily: 'Inter_400Regular', color: Colors.text },
  selectorPlaceholder: { fontSize: 14, fontFamily: 'Inter_400Regular', color: Colors.textMuted },
  dropdownList: { backgroundColor: Colors.surface, borderRadius: 12, marginTop: 4, borderWidth: 1, borderColor: Colors.border, maxHeight: 150, overflow: 'hidden' },
  dropdownItem: { paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.border },
  dropdownItemActive: { backgroundColor: 'rgba(240,165,0,0.1)' },
  dropdownText: { fontSize: 14, fontFamily: 'Inter_400Regular', color: Colors.text },
  periodoRow: { flexDirection: 'row', gap: 8 },
  periodoBtn: { alignItems: 'center', paddingVertical: 10, paddingHorizontal: 14, backgroundColor: Colors.surface, borderRadius: 12, borderWidth: 1, borderColor: Colors.border },
  periodoBtnActive: { backgroundColor: Colors.gold + '22', borderColor: Colors.gold + '66' },
  periodoBtnNum: { fontSize: 14, fontFamily: 'Inter_700Bold', color: Colors.textSecondary },
  periodoBtnNumActive: { color: Colors.gold },
  periodoBtnTime: { fontSize: 10, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 2 },
  periodoBtnTimeActive: { color: Colors.gold },
  input: { backgroundColor: Colors.surface, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, fontFamily: 'Inter_400Regular', color: Colors.text, borderWidth: 1, borderColor: Colors.border },
  infoBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 12, backgroundColor: Colors.info + '11', borderRadius: 10, marginTop: 12 },
  infoBoxText: { flex: 1, fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.info, lineHeight: 18 },
  saveBtn: { backgroundColor: Colors.success, borderRadius: 14, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 16, marginBottom: 8 },
  saveBtnDisabled: { opacity: 0.4 },
  saveBtnText: { fontSize: 15, fontFamily: 'Inter_700Bold', color: '#fff' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, gap: 12, minHeight: 250 },
  emptyText: { fontSize: 16, fontFamily: 'Inter_600SemiBold', color: Colors.textSecondary, textAlign: 'center' },
  emptySub: { fontSize: 13, fontFamily: 'Inter_400Regular', color: Colors.textMuted, textAlign: 'center' },
});
