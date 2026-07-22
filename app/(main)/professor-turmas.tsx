import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  ActivityIndicator,
} from 'react-native';
import { Ionicons, MaterialIcons, FontAwesome5, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '@/constants/colors';
import TopBar from '@/components/TopBar';
import { useAuth } from '@/context/AuthContext';
import { useData } from '@/context/DataContext';
import { useProfessor } from '@/context/ProfessorContext';
import ProfessorLoadingSkeleton from '@/components/ProfessorLoadingSkeleton';
import { api } from '@/lib/api';
import { webAlert } from '@/utils/webAlert';
import { useLocalSearchParams } from 'expo-router';

interface StaffPedagogico {
  id: string;
  nome: string;
  email: string;
  role: string;
}

function roleLabel(role: string) {
  const map: Record<string, string> = {
    chefe_secretaria: 'Chefe de Secretaria',
    secretaria: 'Secretaria',
    pedagogico: 'Pedagógico',
    admin: 'Administrador',
    director: 'Director',
    pca: 'PCA',
    ceo: 'CEO',
  };
  return map[role] || role;
}

export default function ProfessorTurmasScreen() {
  const { user } = useAuth();
  const { professores, turmas, alunos, isLoading: dataLoading } = useData();
  const { addMensagem } = useProfessor();
  const insets = useSafeAreaInsets();
  const bottomInset = Platform.OS === 'web' ? 34 : insets.bottom;
  const { view } = useLocalSearchParams<{ view?: string }>();

  const [showModal, setShowModal] = useState(false);
  const [staffList, setStaffList] = useState<StaffPedagogico[]>([]);
  const [selectedStaff, setSelectedStaff] = useState<StaffPedagogico | null>(null);
  const [assunto, setAssunto] = useState('Solicitação de Atribuição de Turma');
  const [corpo, setCorpo] = useState('');
  const [loadingStaff, setLoadingStaff] = useState(false);
  const [sending, setSending] = useState(false);
  const [enviado, setEnviado] = useState(false);

  const prof = useMemo(() =>
    professores.find(p => (user?.id && p.utilizadorId === user.id) || p.email === user?.email),
    [professores, user]
  );

  const minhasTurmas = useMemo(() =>
    prof
      ? turmas.filter(t =>
          (prof.turmasIds.includes(t.id) || (t.professoresIds ?? []).includes(prof.id)) && t.ativo
        )
      : [],
    [prof, turmas]
  );

  async function abrirModal() {
    setShowModal(true);
    setEnviado(false);
    setLoadingStaff(true);
    setAssunto('Solicitação de Atribuição de Turma');
    setCorpo('');
    setSelectedStaff(null);
    try {
      const data = await api.get<StaffPedagogico[]>('/api/secretaria-pedagogica');
      const lista = Array.isArray(data) ? data : [];
      setStaffList(lista);
      if (lista.length > 0) setSelectedStaff(lista[0]);
    } catch {
      setStaffList([]);
    } finally {
      setLoadingStaff(false);
    }
  }

  async function enviarSolicitacao() {
    if (!selectedStaff || !assunto.trim() || !corpo.trim()) {
      webAlert('Atenção', 'Preencha todos os campos antes de enviar.');
      return;
    }
    if (!prof) return;
    setSending(true);
    try {
      await addMensagem({
        remetenteId: prof.id,
        remetenteNome: `${prof.nome} ${prof.apelido}`,
        tipo: 'privada',
        destinatarioId: selectedStaff.id,
        destinatarioNome: selectedStaff.nome,
        destinatarioTipo: 'professor',
        assunto: assunto.trim(),
        corpo: corpo.trim(),
      } as any);
      setEnviado(true);
      setTimeout(() => {
        setShowModal(false);
        setEnviado(false);
      }, 2500);
    } catch (e: any) {
      webAlert('Erro', 'Não foi possível enviar a mensagem. Tente novamente.');
    } finally {
      setSending(false);
    }
  }

  if (dataLoading) {
    return (
      <View style={styles.container}>
        <TopBar title="Minhas Turmas" subtitle="A carregar..." />
        <ProfessorLoadingSkeleton />
      </View>
    );
  }

  if (!prof) {
    return (
      <View style={styles.container}>
        <TopBar title="Minhas Turmas" subtitle="Perfil não encontrado" />
        <View style={styles.emptyWrap}>
          <Ionicons name="warning-outline" size={52} color={Colors.textMuted} />
          <Text style={styles.emptyTitle}>Perfil não encontrado</Text>
          <Text style={styles.emptySub}>
            O seu e-mail não está associado a nenhum professor no sistema. Contacte o administrador.
          </Text>
        </View>
      </View>
    );
  }

  // ── Vista de Alunos ───────────────────────────────────────────────────────
  if (view === 'alunos') {
    const turmaIds = new Set(minhasTurmas.map(t => t.id));
    const meusAlunos = alunos.filter(a => a.ativo && a.turmaId && turmaIds.has(a.turmaId));
    const total = meusAlunos.length;

    return (
      <View style={styles.container}>
        <TopBar
          title="Meus Alunos"
          subtitle={total > 0 ? `${total} aluno${total !== 1 ? 's' : ''} nas minhas turmas` : 'Nenhum aluno'}
        />
        {total === 0 ? (
          <View style={styles.emptyWrap}>
            <Ionicons name="people-outline" size={52} color={Colors.textMuted} />
            <Text style={styles.emptyTitle}>Sem alunos registados</Text>
            <Text style={styles.emptySub}>Ainda não há alunos atribuídos às suas turmas.</Text>
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={{ padding: 16, paddingBottom: bottomInset + 32 }}
            showsVerticalScrollIndicator={false}
          >
            {minhasTurmas.map(turma => {
              const alunosDaTurma = meusAlunos.filter(a => a.turmaId === turma.id);
              if (alunosDaTurma.length === 0) return null;
              return (
                <View key={turma.id} style={{ marginBottom: 20 }}>
                  {/* Cabeçalho da turma */}
                  <View style={alunosVista.turmaHeader}>
                    <MaterialIcons name="class" size={15} color={Colors.gold} />
                    <Text style={alunosVista.turmaNome}>{turma.nome}</Text>
                    <View style={alunosVista.turmaBadge}>
                      <Text style={alunosVista.turmaBadgeText}>{alunosDaTurma.length}</Text>
                    </View>
                  </View>
                  {/* Lista de alunos */}
                  {alunosDaTurma.map((aluno, idx) => (
                    <View
                      key={aluno.id}
                      style={[alunosVista.alunoRow, idx === alunosDaTurma.length - 1 && { borderBottomWidth: 0 }]}
                    >
                      <View style={alunosVista.alunoAvatar}>
                        <Text style={alunosVista.alunoAvatarText}>
                          {(aluno.nome?.[0] ?? '?').toUpperCase()}
                        </Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={alunosVista.alunoNome}>{aluno.nome} {aluno.apelido}</Text>
                        {aluno.numeroCandidato ? (
                          <Text style={alunosVista.alunoNum}>Nº {aluno.numeroCandidato}</Text>
                        ) : null}
                      </View>
                      {aluno.turno ? (
                        <Text style={alunosVista.turnoTag}>{aluno.turno}</Text>
                      ) : null}
                    </View>
                  ))}
                </View>
              );
            })}
          </ScrollView>
        )}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <TopBar
        title="Minhas Turmas"
        subtitle={minhasTurmas.length > 0
          ? `${minhasTurmas.length} turma${minhasTurmas.length === 1 ? '' : 's'} atribuída${minhasTurmas.length === 1 ? '' : 's'}`
          : 'Nenhuma turma atribuída'}
      />

      {minhasTurmas.length === 0 ? (
        <ScrollView contentContainerStyle={[styles.emptyWrap, { paddingBottom: bottomInset + 32 }]}>
          <View style={styles.emptyIconWrap}>
            <FontAwesome5 name="chalkboard-teacher" size={48} color={Colors.textMuted} />
          </View>
          <Text style={styles.emptyTitle}>Ainda não tem turmas atribuídas</Text>
          <Text style={styles.emptySub}>
            Para ser adicionado a uma turma, solicite ao responsável da secretaria pedagógica/académica da escola.
          </Text>

          <View style={styles.infoCard}>
            <View style={styles.infoCardHeader}>
              <MaterialCommunityIcons name="information-outline" size={16} color={Colors.gold} />
              <Text style={styles.infoCardTitle}>Como proceder</Text>
            </View>
            <View style={styles.infoStep}>
              <View style={styles.infoStepNum}><Text style={styles.infoStepNumText}>1</Text></View>
              <Text style={styles.infoStepText}>Envie uma solicitação ao responsável da secretaria pedagógica/académica.</Text>
            </View>
            <View style={styles.infoStep}>
              <View style={styles.infoStepNum}><Text style={styles.infoStepNumText}>2</Text></View>
              <Text style={styles.infoStepText}>Solicite que seja associado às turmas e disciplinas que irá leccionar.</Text>
            </View>
            <View style={styles.infoStep}>
              <View style={styles.infoStepNum}><Text style={styles.infoStepNumText}>3</Text></View>
              <Text style={styles.infoStepText}>Após a associação, as suas turmas aparecerão automaticamente aqui.</Text>
            </View>
          </View>

          <TouchableOpacity style={styles.msgBtn} onPress={abrirModal} activeOpacity={0.85}>
            <Ionicons name="chatbubble-ellipses-outline" size={18} color={Colors.primaryDark} />
            <Text style={styles.msgBtnText}>Solicitar turma à secretaria</Text>
          </TouchableOpacity>
        </ScrollView>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: bottomInset + 32 }}
          showsVerticalScrollIndicator={false}
        >
          {minhasTurmas.map((turma) => {
            const numAlunos = alunos.filter(a => a.turmaId === turma.id && a.ativo).length;
            const disciplinasProf = prof.disciplinas?.length > 0 ? prof.disciplinas : [];

            return (
              <View key={turma.id} style={styles.turmaCard}>
                <View style={styles.turmaStripe} />
                <View style={styles.turmaBody}>
                  <View style={styles.turmaTop}>
                    <View style={styles.turmaIconWrap}>
                      <MaterialIcons name="class" size={20} color={Colors.gold} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.turmaNome}>{turma.nome}</Text>
                      <Text style={styles.turmaClasse}>{turma.classe}</Text>
                    </View>
                    <View style={[styles.turmaBadge,
                      { backgroundColor: turma.ativo ? Colors.success + '22' : Colors.danger + '22' }
                    ]}>
                      <View style={[styles.turmaBadgeDot,
                        { backgroundColor: turma.ativo ? Colors.success : Colors.danger }
                      ]} />
                      <Text style={[styles.turmaBadgeText,
                        { color: turma.ativo ? Colors.success : Colors.danger }
                      ]}>
                        {turma.ativo ? 'Activa' : 'Inactiva'}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.turmaDetails}>
                    {turma.turno ? (
                      <View style={styles.turmaDetailItem}>
                        <Ionicons name="time-outline" size={13} color={Colors.textMuted} />
                        <Text style={styles.turmaDetailText}>{turma.turno}</Text>
                      </View>
                    ) : null}
                    {turma.sala ? (
                      <View style={styles.turmaDetailItem}>
                        <Ionicons name="location-outline" size={13} color={Colors.textMuted} />
                        <Text style={styles.turmaDetailText}>{turma.sala}</Text>
                      </View>
                    ) : null}
                    {turma.nivel ? (
                      <View style={styles.turmaDetailItem}>
                        <Ionicons name="school-outline" size={13} color={Colors.textMuted} />
                        <Text style={styles.turmaDetailText}>{turma.nivel}</Text>
                      </View>
                    ) : null}
                    <View style={styles.turmaDetailItem}>
                      <Ionicons name="people-outline" size={13} color={Colors.info} />
                      <Text style={[styles.turmaDetailText, { color: Colors.info }]}>
                        {numAlunos} aluno{numAlunos !== 1 ? 's' : ''}
                      </Text>
                    </View>
                  </View>

                  {disciplinasProf.length > 0 && (
                    <View style={styles.disciplinasRow}>
                      <MaterialCommunityIcons name="book-open-outline" size={13} color={Colors.textMuted} />
                      <Text style={styles.disciplinasText} numberOfLines={2}>
                        {disciplinasProf.join(' · ')}
                      </Text>
                    </View>
                  )}
                </View>
              </View>
            );
          })}
        </ScrollView>
      )}

      {/* Modal de Solicitação de Turma */}
      <Modal visible={showModal} transparent animationType="fade" onRequestClose={() => !enviado && setShowModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <View style={modal.overlay}>
            <View style={modal.box}>

              {/* Estado de Sucesso */}
              {enviado ? (
                <View style={modal.successBox}>
                  <View style={modal.successIconWrap}>
                    <Ionicons name="checkmark-circle" size={56} color={Colors.success} />
                  </View>
                  <Text style={modal.successTitle}>Solicitação Enviada!</Text>
                  <Text style={modal.successMsg}>
                    A sua mensagem foi entregue a{'\n'}
                    <Text style={{ color: Colors.gold, fontFamily: 'Inter_700Bold' }}>{selectedStaff?.nome}</Text>.
                    {'\n'}Aguarde resposta em breve.
                  </Text>
                </View>
              ) : (
              <>
              {/* Cabeçalho */}
              <View style={modal.header}>
                <View style={modal.headerIconWrap}>
                  <MaterialCommunityIcons name="email-send-outline" size={20} color={Colors.gold} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={modal.title}>Solicitar Atribuição de Turma</Text>
                  <Text style={modal.subtitle}>Secretaria Pedagógica / Académica</Text>
                </View>
                <TouchableOpacity onPress={() => setShowModal(false)} style={modal.closeBtn} activeOpacity={0.7}>
                  <Ionicons name="close" size={18} color={Colors.textSecondary} />
                </TouchableOpacity>
              </View>

              <View style={modal.divider} />

              <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

                {/* Destinatário */}
                <View style={modal.fieldGroup}>
                  <Text style={modal.fieldLabel}>Destinatário</Text>
                  {loadingStaff ? (
                    <View style={modal.loadingRow}>
                      <ActivityIndicator size="small" color={Colors.gold} />
                      <Text style={modal.loadingText}>A procurar responsáveis disponíveis...</Text>
                    </View>
                  ) : staffList.length === 0 ? (
                    <View style={modal.alertRow}>
                      <Ionicons name="information-circle-outline" size={16} color={Colors.info} />
                      <Text style={modal.alertText}>Nenhum responsável encontrado no sistema.</Text>
                    </View>
                  ) : (
                    <View style={modal.dropdownWrap}>
                      <TouchableOpacity
                        style={modal.dropdownBtn}
                        onPress={() => {}}
                        activeOpacity={1}
                      >
                        <View style={modal.dropdownLeft}>
                          <View style={modal.recipientAvatar}>
                            <Text style={modal.recipientAvatarText}>
                              {selectedStaff ? selectedStaff.nome.split(' ').slice(0, 2).map((w: string) => w[0]).join('') : '?'}
                            </Text>
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={modal.recipientName} numberOfLines={1}>
                              {selectedStaff?.nome || 'Seleccionar responsável'}
                            </Text>
                            <Text style={modal.recipientRole}>
                              {selectedStaff ? roleLabel(selectedStaff.role) : ''}
                            </Text>
                          </View>
                        </View>
                        <View style={modal.recipientBadge}>
                          <View style={modal.recipientBadgeDot} />
                          <Text style={modal.recipientBadgeText}>Disponível</Text>
                        </View>
                      </TouchableOpacity>

                      {/* Lista de selecção */}
                      {staffList.length > 1 && (
                        <View style={modal.staffList}>
                          {staffList.map((s, idx) => (
                            <TouchableOpacity
                              key={s.id}
                              style={[
                                modal.staffRow,
                                idx < staffList.length - 1 && modal.staffRowBorder,
                                selectedStaff?.id === s.id && modal.staffRowActive,
                              ]}
                              onPress={() => setSelectedStaff(s)}
                              activeOpacity={0.75}
                            >
                              <View style={[modal.staffMini, { backgroundColor: selectedStaff?.id === s.id ? Colors.gold + '22' : Colors.surface }]}>
                                <Text style={[modal.staffMiniText, { color: selectedStaff?.id === s.id ? Colors.gold : Colors.textMuted }]}>
                                  {s.nome.split(' ').slice(0, 2).map((w: string) => w[0]).join('')}
                                </Text>
                              </View>
                              <View style={{ flex: 1 }}>
                                <Text style={[modal.staffRowName, selectedStaff?.id === s.id && { color: Colors.gold }]} numberOfLines={1}>
                                  {s.nome}
                                </Text>
                                <Text style={modal.staffRowRole}>{roleLabel(s.role)}</Text>
                              </View>
                              {selectedStaff?.id === s.id && (
                                <Ionicons name="checkmark-circle" size={16} color={Colors.gold} />
                              )}
                            </TouchableOpacity>
                          ))}
                        </View>
                      )}
                    </View>
                  )}
                </View>

                {/* Assunto */}
                <View style={modal.fieldGroup}>
                  <Text style={modal.fieldLabel}>Assunto</Text>
                  <TextInput
                    style={modal.input}
                    value={assunto}
                    onChangeText={setAssunto}
                    placeholder="Assunto da solicitação..."
                    placeholderTextColor={Colors.textMuted}
                  />
                </View>

                {/* Mensagem */}
                <View style={modal.fieldGroup}>
                  <Text style={modal.fieldLabel}>Mensagem</Text>
                  <TextInput
                    style={modal.textarea}
                    value={corpo}
                    onChangeText={setCorpo}
                    placeholder={'Escreva a sua mensagem aqui...\n\nExemplo: Venho por este meio solicitar a minha associação a uma ou mais turmas para o presente ano lectivo.'}
                    placeholderTextColor={Colors.textMuted}
                    multiline
                    textAlignVertical="top"
                  />
                </View>

                {/* Acções */}
                <View style={modal.actions}>
                  <TouchableOpacity style={modal.cancelBtn} onPress={() => setShowModal(false)} activeOpacity={0.7}>
                    <Text style={modal.cancelBtnText}>Cancelar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[modal.sendBtn, (sending || !assunto.trim() || !corpo.trim()) && modal.sendBtnDisabled]}
                    onPress={enviarSolicitacao}
                    disabled={sending || !assunto.trim() || !corpo.trim()}
                    activeOpacity={0.85}
                  >
                    {sending
                      ? <ActivityIndicator size="small" color={Colors.primaryDark} />
                      : <Ionicons name="send" size={15} color={Colors.primaryDark} />
                    }
                    <Text style={modal.sendBtnText}>{sending ? 'A enviar...' : 'Enviar Solicitação'}</Text>
                  </TouchableOpacity>
                </View>

              </ScrollView>
              </>
              )}

            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  emptyWrap: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
  },
  emptyIconWrap: {
    width: 96, height: 96, borderRadius: 48,
    backgroundColor: Colors.surface,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 20,
  },
  emptyTitle: {
    fontSize: 17, fontFamily: 'Inter_700Bold', color: Colors.text,
    textAlign: 'center', marginBottom: 10,
  },
  emptySub: {
    fontSize: 13, fontFamily: 'Inter_400Regular', color: Colors.textMuted,
    textAlign: 'center', lineHeight: 20, marginBottom: 24,
  },

  infoCard: {
    width: '100%', backgroundColor: Colors.surface,
    borderRadius: 14, borderWidth: 1, borderColor: Colors.border,
    padding: 16, marginBottom: 20, gap: 12,
  },
  infoCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  infoCardTitle: { fontSize: 13, fontFamily: 'Inter_700Bold', color: Colors.gold },
  infoStep: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  infoStepNum: {
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: Colors.gold + '22', borderWidth: 1, borderColor: Colors.gold + '55',
    alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1,
  },
  infoStepNumText: { fontSize: 11, fontFamily: 'Inter_700Bold', color: Colors.gold },
  infoStepText: { flex: 1, fontSize: 13, fontFamily: 'Inter_400Regular', color: Colors.textSecondary, lineHeight: 19 },

  msgBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: Colors.gold, borderRadius: 12,
    paddingHorizontal: 20, paddingVertical: 13,
  },
  msgBtnText: { fontSize: 14, fontFamily: 'Inter_700Bold', color: Colors.primaryDark },

  turmaCard: {
    flexDirection: 'row',
    backgroundColor: Colors.backgroundCard,
    borderRadius: 14, borderWidth: 1, borderColor: Colors.border,
    overflow: 'hidden',
  },
  turmaStripe: { width: 4, backgroundColor: Colors.gold },
  turmaBody: { flex: 1, padding: 14, gap: 10 },
  turmaTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  turmaIconWrap: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: Colors.gold + '18',
    alignItems: 'center', justifyContent: 'center',
  },
  turmaNome: { fontSize: 15, fontFamily: 'Inter_700Bold', color: Colors.text },
  turmaClasse: { fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 1 },
  turmaBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3,
  },
  turmaBadgeDot: { width: 6, height: 6, borderRadius: 3 },
  turmaBadgeText: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  turmaDetails: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  turmaDetailItem: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: Colors.surface, borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 4,
  },
  turmaDetailText: { fontSize: 11, fontFamily: 'Inter_500Medium', color: Colors.textSecondary },
  disciplinasRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 6,
    backgroundColor: Colors.surface, borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 7,
  },
  disciplinasText: {
    flex: 1, fontSize: 11, fontFamily: 'Inter_400Regular',
    color: Colors.textMuted, lineHeight: 16,
  },
});

const modal = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  box: {
    backgroundColor: Colors.backgroundCard,
    borderRadius: 20,
    width: '100%',
    maxWidth: 520,
    maxHeight: '92%',
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },

  /* Cabeçalho */
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 20,
    paddingBottom: 16,
  },
  headerIconWrap: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: Colors.gold + '18',
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  title: {
    fontSize: 16, fontFamily: 'Inter_700Bold', color: Colors.text,
  },
  subtitle: {
    fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 2,
  },
  closeBtn: {
    width: 32, height: 32, borderRadius: 8,
    backgroundColor: Colors.surface,
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  divider: {
    height: 1, backgroundColor: Colors.border, marginHorizontal: 0,
  },

  /* Campos */
  fieldGroup: { paddingHorizontal: 20, paddingTop: 18 },
  fieldLabel: {
    fontSize: 10, fontFamily: 'Inter_700Bold', color: Colors.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.8,
    marginBottom: 8,
  },

  /* Loading */
  loadingRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: Colors.surface, borderRadius: 12,
    borderWidth: 1, borderColor: Colors.border,
    padding: 14,
  },
  loadingText: { fontSize: 13, fontFamily: 'Inter_400Regular', color: Colors.textMuted },

  /* Aviso sem staff */
  alertRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: Colors.info + '12', borderRadius: 10,
    borderWidth: 1, borderColor: Colors.info + '30',
    padding: 12,
  },
  alertText: { flex: 1, fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textSecondary },

  /* Destinatário — seleccionado em destaque */
  dropdownWrap: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  dropdownBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.gold + '10',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
  },
  dropdownLeft: {
    flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1,
  },
  recipientAvatar: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: Colors.gold,
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  recipientAvatarText: {
    fontSize: 14, fontFamily: 'Inter_700Bold', color: Colors.primaryDark,
  },
  recipientName: {
    fontSize: 14, fontFamily: 'Inter_700Bold', color: Colors.text,
  },
  recipientRole: {
    fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 2,
  },
  recipientBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: Colors.success + '18',
    borderRadius: 20,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  recipientBadgeDot: {
    width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.success,
  },
  recipientBadgeText: {
    fontSize: 10, fontFamily: 'Inter_600SemiBold', color: Colors.success,
  },

  /* Lista de outros responsáveis */
  staffList: {
    backgroundColor: Colors.surface,
  },
  staffRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 14, paddingVertical: 11,
  },
  staffRowBorder: {
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  staffRowActive: {
    backgroundColor: Colors.gold + '08',
  },
  staffMini: {
    width: 32, height: 32, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  staffMiniText: {
    fontSize: 11, fontFamily: 'Inter_700Bold',
  },
  staffRowName: {
    fontSize: 13, fontFamily: 'Inter_600SemiBold', color: Colors.text,
  },
  staffRowRole: {
    fontSize: 10, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 1,
  },

  /* Inputs */
  input: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    color: Colors.text,
  },
  textarea: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 12,
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    color: Colors.text,
    height: 130,
  },

  /* Acções */
  actions: {
    flexDirection: 'row',
    gap: 10,
    padding: 20,
    paddingTop: 18,
  },
  cancelBtn: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 13,
  },
  cancelBtnText: {
    fontSize: 14, fontFamily: 'Inter_600SemiBold', color: Colors.textSecondary,
  },
  sendBtn: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.gold,
    borderRadius: 12,
    paddingVertical: 13,
  },
  sendBtnDisabled: { opacity: 0.4 },
  sendBtnText: { fontSize: 14, fontFamily: 'Inter_700Bold', color: Colors.primaryDark },

  /* Estado de Sucesso */
  successBox: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
    paddingVertical: 48,
    gap: 12,
  },
  successIconWrap: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: Colors.success + '18',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  successTitle: {
    fontSize: 20,
    fontFamily: 'Inter_700Bold',
    color: Colors.text,
    textAlign: 'center',
  },
  successMsg: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
});

const alunosVista = StyleSheet.create({
  turmaHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: Colors.backgroundCard,
    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8,
    marginBottom: 4, borderWidth: 1, borderColor: Colors.gold + '33',
  },
  turmaNome: { flex: 1, fontSize: 13, fontFamily: 'Inter_700Bold', color: Colors.gold },
  turmaBadge: {
    backgroundColor: Colors.gold + '22', borderRadius: 12,
    paddingHorizontal: 8, paddingVertical: 2,
  },
  turmaBadgeText: { fontSize: 11, fontFamily: 'Inter_700Bold', color: Colors.gold },
  alunoRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: Colors.backgroundCard,
    paddingHorizontal: 12, paddingVertical: 11,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  alunoAvatar: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: Colors.info + '22',
    alignItems: 'center', justifyContent: 'center',
  },
  alunoAvatarText: { fontSize: 15, fontFamily: 'Inter_700Bold', color: Colors.info },
  alunoNome: { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: Colors.text },
  alunoNum: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 1 },
  turnoTag: {
    fontSize: 10, fontFamily: 'Inter_600SemiBold', color: Colors.textMuted,
    backgroundColor: Colors.border, borderRadius: 6,
    paddingHorizontal: 7, paddingVertical: 2,
  },
});
