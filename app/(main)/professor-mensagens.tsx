import React, { useState, useMemo, useEffect } from 'react';
import {FlatList, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '@/constants/colors';
import TopBar from '@/components/TopBar';
import { useAuth } from '@/context/AuthContext';
import { useData } from '@/context/DataContext';
import { useProfessor } from '@/context/ProfessorContext';
import { useNotificacoes, timeAgo } from '@/context/NotificacoesContext';
import { webAlert } from '@/utils/webAlert';
import { useEnterToSave } from '@/hooks/useEnterToSave';
import { useTabMemory } from '@/hooks/useTabMemory';
import { StableSearchInput } from '@/components/StableSearchInput';

import { HScrollTabBar } from '@/components/HScrollTabBar';
import PaginationBar from '@/components/PaginationBar';
type Tab = 'recebidas' | 'enviadas' | 'nova';
type MsgTipo = 'turma' | 'privada';
type PrivSubTipo = 'professor' | 'aluno';

export default function ProfessorMensagensScreen() {
  const { user } = useAuth();
  const { professores, turmas, alunos } = useData();
  const { mensagens, addMensagem, marcarMensagemLida } = useProfessor();
  const { addNotificacao } = useNotificacoes();
  const insets = useSafeAreaInsets();
  const bottomInset = Platform.OS === 'web' ? 34 : insets.bottom;

  const [tab, setTab] = useState<Tab>('recebidas');
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 15;
  const [selectedMsg, setSelectedMsg] = useState<string | null>(null);
  const [showCompor, setShowCompor] = useState(false);
  const [tipo, setTipo] = useState<MsgTipo>('privada');
  const [privSubTipo, setPrivSubTipo] = useState<PrivSubTipo>('professor');
  const [assunto, setAssunto] = useState('');
  const [corpo, setCorpo] = useState('');
  const [destinatarioId, setDestinatarioId] = useState('');
  const [showDestList, setShowDestList] = useState(false);
  const [searchDest, setSearchDest] = useState('');

  const prof = useMemo(() => professores.find(p => (user?.id && p.utilizadorId === user.id) || p.email === user?.email), [professores, user]);
  const minhasTurmas = useMemo(() => prof ? turmas.filter(t => (prof.turmasIds.includes(t.id) || (t.professoresIds ?? []).includes(prof.id)) && t.ativo) : [], [prof, turmas]);

  const colegasProfessores = useMemo(() => {
    if (!prof) return [];
    // Incluir TODOS os professores activos (não apenas os das mesmas turmas)
    return professores.filter(p => p.id !== prof.id && p.ativo);
  }, [professores, prof]);

  const meusAlunos = useMemo(() => {
    if (!prof) return [];
    const minhaTurmaIds = new Set(minhasTurmas.map(t => t.id));
    return alunos.filter(a => a.ativo && minhaTurmaIds.has(a.turmaId));
  }, [alunos, prof, minhasTurmas]);

  const recebidas = useMemo(() =>
    mensagens.filter(m =>
      (m.tipo === 'privada' && m.destinatarioId === prof?.id) ||
      (m.tipo === 'turma' && minhasTurmas.some(t => t.id === m.turmaId))
    ).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [mensagens, prof, minhasTurmas]
  );

  const enviadas = useMemo(() =>
    mensagens.filter(m => m.remetenteId === prof?.id)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [mensagens, prof]
  );

  const naoLidas = recebidas.filter(m => !m.lidaPor.includes(prof?.id || '')).length;

  const activeList = tab === 'recebidas' ? recebidas : enviadas;
  const totalPages = Math.max(1, Math.ceil(activeList.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const pagedList = useMemo(() => activeList.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE), [activeList, safePage]);
  useEffect(() => { setCurrentPage(1); }, [tab]);

  async function enviarMensagem() {
    if (!assunto.trim() || !corpo.trim() || !prof) return;
    if (tipo === 'privada' && !destinatarioId) {
      webAlert('Erro', 'Selecione um destinatário.');
      return;
    }
    if (tipo === 'turma' && !destinatarioId) {
      webAlert('Erro', 'Selecione uma turma.');
      return;
    }

    const turma = tipo === 'turma' ? turmas.find(t => t.id === destinatarioId) : undefined;
    const colega = (tipo === 'privada' && privSubTipo === 'professor')
      ? professores.find(p => p.id === destinatarioId)
      : undefined;
    const aluno = (tipo === 'privada' && privSubTipo === 'aluno')
      ? alunos.find(a => a.id === destinatarioId)
      : undefined;

    const destinatarioNome = colega
      ? `${colega.nome} ${colega.apelido}`
      : aluno
      ? `${aluno.nome} ${aluno.apelido}`
      : undefined;

    await addMensagem({
      remetenteId: prof.id,
      remetenteNome: `${prof.nome} ${prof.apelido}`,
      tipo,
      turmaId: tipo === 'turma' ? destinatarioId : undefined,
      turmaNome: tipo === 'turma' ? turma?.nome : undefined,
      destinatarioId: tipo === 'privada' ? destinatarioId : undefined,
      destinatarioNome,
      destinatarioTipo: tipo === 'privada' ? privSubTipo : undefined,
      assunto,
      corpo,
    });

    const notifTitulo = tipo === 'turma'
      ? `Mensagem para ${turma?.nome || 'Turma'}`
      : `Mensagem privada para ${destinatarioNome || 'destinatário'}`;

    await addNotificacao({
      titulo: notifTitulo,
      mensagem: `${assunto}: ${corpo.substring(0, 60)}${corpo.length > 60 ? '...' : ''}`,
      tipo: 'info',
      data: new Date().toISOString(),
    });

    setAssunto('');
    setCorpo('');
    setDestinatarioId('');
    setSearchDest('');
    setShowCompor(false);
    setTab('enviadas');
    webAlert('Sucesso', 'Mensagem enviada com sucesso.');
  }

  function openMsg(msg: typeof mensagens[0]) {
    setSelectedMsg(msg.id);
    if (prof && !msg.lidaPor.includes(prof.id)) {
      marcarMensagemLida(msg.id, prof.id);
    }
  }

  function resetCompor() {
    setTipo('turma');
    setPrivSubTipo('professor');
    setAssunto('');
    setCorpo('');
    setDestinatarioId('');
    setSearchDest('');
    setShowDestList(false);
  }

  const msgSelecionada = mensagens.find(m => m.id === selectedMsg);

  const destOptions = useMemo(() => {
    if (tipo === 'turma') {
      return minhasTurmas.map(t => ({ id: t.id, nome: t.nome, sub: t.nivel, icon: 'people' as const }));
    }
    if (privSubTipo === 'professor') {
      return colegasProfessores.map(p => ({
        id: p.id,
        nome: `${p.nome} ${p.apelido}`,
        sub: p.disciplinas.join(', '),
        icon: 'person' as const,
      }));
    }
    return meusAlunos.map(a => ({
      id: a.id,
      nome: `${a.nome} ${a.apelido}`,
      sub: turmas.find(t => t.id === a.turmaId)?.nome || '',
      icon: 'school' as const,
    }));
  }, [tipo, privSubTipo, minhasTurmas, colegasProfessores, meusAlunos, turmas]);

  const filteredDestOptions = useMemo(() => {
    if (!searchDest.trim()) return destOptions;
    return destOptions.filter(d => d.nome.toLowerCase().includes(searchDest.toLowerCase()) || d.sub.toLowerCase().includes(searchDest.toLowerCase()));
  }, [destOptions, searchDest]);

  const destNome = destinatarioId
    ? destOptions.find(d => d.id === destinatarioId)?.nome || ''
    : '';

  function getMsgIcon(msg: typeof mensagens[0]) {
    if (msg.tipo === 'turma') return { name: 'people' as const, color: Colors.info };
    if (msg.destinatarioTipo === 'aluno') return { name: 'school' as const, color: Colors.success };
    return { name: 'person' as const, color: Colors.gold };
  }

  function getMsgBgColor(msg: typeof mensagens[0]) {
    if (msg.tipo === 'turma') return Colors.info + '22';
    if (msg.destinatarioTipo === 'aluno') return Colors.success + '22';
    return Colors.gold + '22';
  }

  function getMsgTipoLabel(msg: typeof mensagens[0]) {
    if (msg.tipo === 'turma') return 'Turma';
    if (msg.destinatarioTipo === 'aluno') return 'Aluno';
    return 'Privada';
  }

  function getMsgTipoColor(msg: typeof mensagens[0]) {
    if (msg.tipo === 'turma') return Colors.info;
    if (msg.destinatarioTipo === 'aluno') return Colors.success;
    return Colors.gold;
  }

  const placeholderDest = tipo === 'turma'
    ? 'Selecionar turma...'
    : privSubTipo === 'professor'
    ? 'Selecionar professor...'
    : 'Selecionar aluno...';

  useEnterToSave(enviarMensagem, showCompor);

  return (
    <View style={styles.container}>
      <TopBar title="Mensagens" subtitle="Comunicação da turma e privada" />

      {/* Tabs */}
      <HScrollTabBar style={styles.tabRow} contentContainerStyle={{ flexDirection: 'row', flex: 1 }} keyboardShouldPersistTaps="handled">
        {(['recebidas', 'enviadas', 'nova'] as Tab[]).map(t => (
          <TouchableOpacity
            key={t}
            style={[styles.tab, tab === t && styles.tabActive]}
            onPress={() => {
              setTab(t);
              if (t === 'nova') { resetCompor(); setShowCompor(true); }
            }}
          >
            <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
              {t === 'recebidas' ? `Recebidas${naoLidas > 0 ? ` (${naoLidas})` : ''}` : t === 'enviadas' ? 'Enviadas' : '+ Nova'}
            </Text>
          </TouchableOpacity>
        ))}
      </HScrollTabBar>

      {/* Message List */}
      {tab !== 'nova' && (
        <FlatList
          data={pagedList}
          keyExtractor={m => m.id}
          contentContainerStyle={{ padding: 16, paddingBottom: 8 }}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="chatbubbles-outline" size={48} color={Colors.textMuted} />
              <Text style={styles.emptyText}>Nenhuma mensagem</Text>
            </View>
          }
          renderItem={({ item: msg }) => {
            const naoLida = tab === 'recebidas' && !msg.lidaPor.includes(prof?.id || '');
            const icon = getMsgIcon(msg);
            const bgColor = getMsgBgColor(msg);
            const tipoLabel = getMsgTipoLabel(msg);
            const tipoColor = getMsgTipoColor(msg);
            return (
              <TouchableOpacity
                style={[styles.msgCard, naoLida && styles.msgCardUnread]}
                onPress={() => openMsg(msg)}
                activeOpacity={0.8}
              >
                <View style={[styles.msgTypeIcon, { backgroundColor: bgColor }]}>
                  <Ionicons name={icon.name} size={18} color={icon.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={styles.msgHeader}>
                    <Text style={styles.msgAssunto} numberOfLines={1}>{msg.assunto}</Text>
                    {naoLida && <View style={styles.unreadDot} />}
                  </View>
                  <Text style={styles.msgRemetente}>
                    {tab === 'recebidas'
                      ? `De: ${msg.remetenteNome}`
                      : msg.tipo === 'turma'
                        ? `Para: Turma ${msg.turmaNome || ''}`
                        : `Para: ${msg.destinatarioNome}`}
                  </Text>
                  <Text style={styles.msgPreview} numberOfLines={1}>{msg.corpo}</Text>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 4 }}>
                  <Text style={styles.msgTime}>{timeAgo(msg.createdAt)}</Text>
                  <View style={[styles.tipoBadge, { backgroundColor: tipoColor + '22' }]}>
                    <Text style={[styles.tipoText, { color: tipoColor }]}>{tipoLabel}</Text>
                  </View>
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}

      {tab !== 'nova' && <PaginationBar currentPage={safePage} totalPages={totalPages} onPageChange={setCurrentPage} bottomPad={bottomInset} />}

      {/* FAB to compose */}
      {tab !== 'nova' && (
        <TouchableOpacity
          style={styles.fab}
          onPress={() => { resetCompor(); setShowCompor(true); }}
        >
          <Ionicons name="create" size={24} color="#fff" />
        </TouchableOpacity>
      )}

      {/* View Message Modal */}
      <Modal visible={!!msgSelecionada} transparent animationType="slide" onRequestClose={() => setSelectedMsg(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={styles.overlay}>
          <View style={styles.modalBox}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle} numberOfLines={2}>{msgSelecionada?.assunto}</Text>
              <TouchableOpacity onPress={() => setSelectedMsg(null)} style={styles.closeBtn}>
                <Ionicons name="close" size={22} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalMeta}>
              De: {msgSelecionada?.remetenteNome} · {msgSelecionada ? timeAgo(msgSelecionada.createdAt) : ''}
            </Text>
            {msgSelecionada?.tipo === 'turma' && (
              <Text style={styles.modalMeta}>Para: Turma {msgSelecionada.turmaNome}</Text>
            )}
            {msgSelecionada?.tipo === 'privada' && (
              <Text style={styles.modalMeta}>
                Para: {msgSelecionada.destinatarioNome}
                {msgSelecionada.destinatarioTipo === 'aluno' ? ' (Aluno)' : ' (Professor)'}
              </Text>
            )}
            <View style={styles.modalDivider} />
            <ScrollView style={{ maxHeight: 300 }}>
              <Text style={styles.modalCorpo}>{msgSelecionada?.corpo}</Text>
            </ScrollView>
          </View>
        </View>
              </KeyboardAvoidingView>
</Modal>

      {/* Compose Modal */}
      <Modal
        visible={showCompor}
        transparent
        animationType="slide"
        onRequestClose={() => setShowCompor(false)}
      >
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={styles.overlay}>
          <View style={styles.modalBox}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Nova Mensagem</Text>
              <TouchableOpacity onPress={() => setShowCompor(false)} style={styles.closeBtn}>
                <Ionicons name="close" size={22} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>

              {/* Tipo principal: Turma / Privada — Turma só visível se professor tiver turmas */}
              {minhasTurmas.length > 0 && (
                <>
                  <Text style={styles.fieldLabel}>Canal</Text>
                  <View style={styles.tipoRow}>
                    <TouchableOpacity
                      style={[styles.tipoBtn, tipo === 'turma' && styles.tipoBtnTurmaActive]}
                      onPress={() => { setTipo('turma'); setDestinatarioId(''); setSearchDest(''); }}
                    >
                      <Ionicons name="people" size={16} color={tipo === 'turma' ? Colors.info : Colors.textMuted} />
                      <Text style={[styles.tipoBtnText, tipo === 'turma' && { color: Colors.info }]}>Turma</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.tipoBtn, tipo === 'privada' && styles.tipoBtnPrivadaActive]}
                      onPress={() => { setTipo('privada'); setDestinatarioId(''); setSearchDest(''); }}
                    >
                      <Ionicons name="lock-closed" size={16} color={tipo === 'privada' ? Colors.gold : Colors.textMuted} />
                      <Text style={[styles.tipoBtnText, tipo === 'privada' && { color: Colors.gold }]}>Privada</Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}

              {/* Sub-tipo para mensagem privada */}
              {tipo === 'privada' && (
                <>
                  <Text style={styles.fieldLabel}>Enviar Para</Text>
                  <View style={styles.tipoRow}>
                    <TouchableOpacity
                      style={[styles.subTipoBtn, privSubTipo === 'professor' && styles.subTipoBtnActive]}
                      onPress={() => { setPrivSubTipo('professor'); setDestinatarioId(''); setSearchDest(''); }}
                    >
                      <Ionicons name="person" size={14} color={privSubTipo === 'professor' ? Colors.gold : Colors.textMuted} />
                      <Text style={[styles.subTipoBtnText, privSubTipo === 'professor' && { color: Colors.gold }]}>Professor</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.subTipoBtn, privSubTipo === 'aluno' && styles.subTipoBtnActive]}
                      onPress={() => { setPrivSubTipo('aluno'); setDestinatarioId(''); setSearchDest(''); }}
                    >
                      <Ionicons name="school" size={14} color={privSubTipo === 'aluno' ? Colors.success : Colors.textMuted} />
                      <Text style={[styles.subTipoBtnText, privSubTipo === 'aluno' && { color: Colors.success }]}>Aluno</Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}

              {/* Destinatário / Turma selector */}
              <Text style={styles.fieldLabel}>
                {tipo === 'turma' ? 'Turma' : privSubTipo === 'professor' ? 'Professor' : 'Aluno'}
              </Text>
              <TouchableOpacity
                style={styles.selector}
                onPress={() => { setShowDestList(v => !v); setSearchDest(''); }}
              >
                <Text style={destNome ? styles.selectorValue : styles.selectorPlaceholder}>
                  {destNome || placeholderDest}
                </Text>
                <Ionicons name={showDestList ? 'chevron-up' : 'chevron-down'} size={16} color={Colors.textMuted} />
              </TouchableOpacity>

              {showDestList && (
                <View style={styles.dropdownList}>
                  <StableSearchInput
                    value={searchDest}
                    onChangeText={setSearchDest}
                    inputStyle={styles.searchInput}
                    placeholder="Pesquisar..."
                    iconColor={Colors.textMuted}
                  />
                  {filteredDestOptions.length === 0 ? (
                    <View style={{ padding: 12, alignItems: 'center' }}>
                      <Text style={{ fontSize: 13, fontFamily: 'Inter_400Regular', color: Colors.textMuted }}>Nenhum resultado</Text>
                    </View>
                  ) : (
                    filteredDestOptions.map(d => (
                      <TouchableOpacity
                        key={d.id}
                        style={[styles.dropdownItem, destinatarioId === d.id && styles.dropdownItemActive]}
                        onPress={() => { setDestinatarioId(d.id); setShowDestList(false); setSearchDest(''); }}
                      >
                        <View style={styles.dropdownItemRow}>
                          <Ionicons name={d.icon} size={14} color={destinatarioId === d.id ? Colors.gold : Colors.textMuted} />
                          <View style={{ flex: 1 }}>
                            <Text style={[styles.dropdownText, destinatarioId === d.id && { color: Colors.gold }]}>{d.nome}</Text>
                            {!!d.sub && <Text style={styles.dropdownSub}>{d.sub}</Text>}
                          </View>
                          {destinatarioId === d.id && <Ionicons name="checkmark" size={14} color={Colors.gold} />}
                        </View>
                      </TouchableOpacity>
                    ))
                  )}
                </View>
              )}

              <Text style={styles.fieldLabel}>Assunto</Text>
              <TextInput
                style={styles.input}
                placeholder="Assunto da mensagem..."
                placeholderTextColor={Colors.textMuted}
                value={assunto}
                onChangeText={setAssunto}
              />

              <Text style={styles.fieldLabel}>Mensagem</Text>
              <TextInput
                style={[styles.input, { height: 120, textAlignVertical: 'top' }]}
                placeholder="Escreva a sua mensagem aqui..."
                placeholderTextColor={Colors.textMuted}
                value={corpo}
                onChangeText={setCorpo}
                multiline
              />

              <TouchableOpacity
                style={[styles.sendBtn, (!assunto || !corpo || !destinatarioId) && styles.sendBtnDisabled]}
                onPress={enviarMensagem}
                disabled={!assunto || !corpo || !destinatarioId}
              >
                <Ionicons name="send" size={18} color="#fff" />
                <Text style={styles.sendBtnText}>Enviar Mensagem</Text>
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
  tabRow: { flexDirection: 'row', backgroundColor: Colors.primaryDark, borderBottomWidth: 1, borderBottomColor: Colors.border },
  tab: { flex: 1, paddingVertical: 12, alignItems: 'center' },
  tabActive: { borderBottomWidth: 2, borderBottomColor: Colors.gold },
  tabText: { fontSize: 13, fontFamily: 'Inter_500Medium', color: Colors.textMuted },
  tabTextActive: { color: Colors.gold, fontFamily: 'Inter_600SemiBold' },
  msgCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, backgroundColor: Colors.backgroundCard, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: Colors.border },
  msgCardUnread: { borderLeftWidth: 3, borderLeftColor: Colors.info },
  msgTypeIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  msgHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  msgAssunto: { flex: 1, fontSize: 14, fontFamily: 'Inter_600SemiBold', color: Colors.text },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.info },
  msgRemetente: { fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 2 },
  msgPreview: { fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textSecondary, marginTop: 3 },
  msgTime: { fontSize: 10, fontFamily: 'Inter_400Regular', color: Colors.textMuted },
  tipoBadge: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  tipoText: { fontSize: 10, fontFamily: 'Inter_600SemiBold' },
  fab: { position: 'absolute', bottom: 80, right: 20, width: 54, height: 54, borderRadius: 27, backgroundColor: Colors.accent, alignItems: 'center', justifyContent: 'center', elevation: 6 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'center', alignItems: 'center' },
  modalBox: { backgroundColor: Colors.backgroundCard, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, maxHeight: '95%', width: '100%', maxWidth: 480 },
  modalHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 8 },
  modalTitle: { flex: 1, fontSize: 17, fontFamily: 'Inter_700Bold', color: Colors.text },
  closeBtn: { padding: 4 },
  modalMeta: { fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginBottom: 3 },
  modalDivider: { height: 1, backgroundColor: Colors.border, marginVertical: 12 },
  modalCorpo: { fontSize: 15, fontFamily: 'Inter_400Regular', color: Colors.text, lineHeight: 24 },
  fieldLabel: { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: Colors.textMuted, marginBottom: 6, marginTop: 14, textTransform: 'uppercase', letterSpacing: 0.8 },
  tipoRow: { flexDirection: 'row', gap: 10 },
  tipoBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 12, borderRadius: 12, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
  tipoBtnTurmaActive: { borderColor: Colors.info + '66', backgroundColor: Colors.info + '11' },
  tipoBtnPrivadaActive: { borderColor: Colors.gold + '66', backgroundColor: Colors.gold + '11' },
  tipoBtnText: { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: Colors.textMuted },
  subTipoBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 9, paddingHorizontal: 12, borderRadius: 10, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
  subTipoBtnActive: { borderColor: Colors.gold + '55', backgroundColor: Colors.gold + '11' },
  subTipoBtnText: { fontSize: 12, fontFamily: 'Inter_500Medium', color: Colors.textMuted },
  selector: { backgroundColor: Colors.surface, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: Colors.border },
  selectorValue: { fontSize: 14, fontFamily: 'Inter_400Regular', color: Colors.text },
  selectorPlaceholder: { fontSize: 14, fontFamily: 'Inter_400Regular', color: Colors.textMuted },
  dropdownList: { backgroundColor: Colors.surface, borderRadius: 12, marginTop: 4, borderWidth: 1, borderColor: Colors.border, maxHeight: 240, overflow: 'hidden' },
  searchInput: { paddingHorizontal: 14, paddingVertical: 10, fontSize: 13, fontFamily: 'Inter_400Regular', color: Colors.text, borderBottomWidth: 1, borderBottomColor: Colors.border },
  dropdownItem: { paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.border },
  dropdownItemActive: { backgroundColor: 'rgba(240,165,0,0.08)' },
  dropdownItemRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dropdownText: { fontSize: 14, fontFamily: 'Inter_500Medium', color: Colors.text },
  dropdownSub: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 2 },
  input: { backgroundColor: Colors.surface, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, fontFamily: 'Inter_400Regular', color: Colors.text, borderWidth: 1, borderColor: Colors.border },
  sendBtn: { backgroundColor: Colors.accent, borderRadius: 14, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 16, marginBottom: 8 },
  sendBtnDisabled: { opacity: 0.4 },
  sendBtnText: { fontSize: 15, fontFamily: 'Inter_700Bold', color: '#fff' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, gap: 12, minHeight: 200 },
  emptyText: { fontSize: 16, fontFamily: 'Inter_600SemiBold', color: Colors.textSecondary, textAlign: 'center' },
});
