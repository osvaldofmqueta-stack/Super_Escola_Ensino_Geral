import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Platform, FlatList } from 'react-native';
import AppLoader from '@/components/AppLoader';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '@/constants/colors';
import TopBar from '@/components/TopBar';
import { useAuth } from '@/context/AuthContext';
import { useData } from '@/context/DataContext';
import { useProfessor } from '@/context/ProfessorContext';
import { useAnoAcademico } from '@/context/AnoAcademicoContext';
import { showToast } from '@/utils/toast';
import { api } from '@/lib/api';
import RequiredMark from '@/components/RequiredMark';

interface Horario {
  id: string;
  turmaId: string;
  disciplina: string;
  professorId: string;
  diaSemana: number;
  periodo: number;
  horaInicio: string;
  horaFim: string;
}

interface EntradaDiario {
  data: string;
  diaSemana: number;
  horaInicio: string;
  horaFim: string;
  periodo: number;
  numeroAula: number;
  conteudo: string;
  observacaoAluno: string;
  sumarioId?: string;
  status?: 'pendente' | 'aceite' | 'rejeitado';
  observacaoRH?: string;
}

const DIAS_PT = ['', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

function fmtDataCurta(iso: string) {
  const d = new Date(iso + 'T12:00:00');
  return d.toLocaleDateString('pt-PT', { weekday: 'short', day: '2-digit', month: 'short' });
}

function fmtDataLonga(iso: string) {
  const d = new Date(iso + 'T12:00:00');
  return d.toLocaleDateString('pt-PT', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
}

function StatusChip({ status }: { status?: string }) {
  if (!status) return null;
  const cfg = {
    pendente: { bg: Colors.warning + '22', border: Colors.warning + '55', color: Colors.warning, label: 'Pendente' },
    aceite:   { bg: Colors.success + '22', border: Colors.success + '55', color: Colors.success, label: 'Aceite' },
    rejeitado: { bg: Colors.danger + '22', border: Colors.danger + '55', color: Colors.danger, label: 'Rejeitado' },
  }[status] ?? null;
  if (!cfg) return null;
  return (
    <View style={[sc.chip, { backgroundColor: cfg.bg, borderColor: cfg.border }]}>
      <Text style={[sc.chipText, { color: cfg.color }]}>{cfg.label}</Text>
    </View>
  );
}

const sc = StyleSheet.create({
  chip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, borderWidth: 1 },
  chipText: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
});

export default function DiarioClasseScreen() {
  const { user } = useAuth();
  const { professores, turmas } = useData();
  const { sumarios, addSumario } = useProfessor();
  const { anoAtivo } = useAnoAcademico();
  const insets = useSafeAreaInsets();
  const bottomPad = Platform.OS === 'web' ? 34 : insets.bottom;

  const [turmaId, setTurmaId] = useState('');
  const [disciplina, setDisciplina] = useState('');
  const [horarios, setHorarios] = useState<Horario[]>([]);
  const [feriados, setFeriados] = useState<string[]>([]);
  const [entradas, setEntradas] = useState<EntradaDiario[]>([]);
  const [gerado, setGerado] = useState(false);
  const [loading, setLoading] = useState(false);
  const [salvando, setSalvando] = useState<Record<string, boolean>>({});
  const [expandido, setExpandido] = useState<Record<string, boolean>>({});

  const prof = useMemo(
    () => professores.find(p => (user?.id && p.utilizadorId === user.id) || p.email === user?.email),
    [professores, user]
  );

  const minhasTurmas = useMemo(
    () => prof ? turmas.filter(t => (prof.turmasIds.includes(t.id) || (t.professoresIds ?? []).includes(prof.id)) && t.ativo) : [],
    [prof, turmas]
  );

  const disciplinasDaTurma = useMemo(() => {
    if (!turmaId || !prof) return prof?.disciplinas ?? [];
    return prof.disciplinas;
  }, [prof, turmaId]);

  useEffect(() => {
    if (!turmaId) return;
    fetch(`/api/turmas/${turmaId}/disciplinas`)
      .then(r => r.json())
      .then((list: { nome: string }[]) => {
        if (list?.length > 0 && prof) {
          const interseção = list.map(d => d.nome).filter(n => prof.disciplinas.includes(n));
          if (interseção.length > 0 && !interseção.includes(disciplina)) {
            setDisciplina(interseção[0]);
          }
        }
      })
      .catch(() => {});
  }, [turmaId]);

  useEffect(() => {
    setGerado(false);
    setEntradas([]);
  }, [turmaId, disciplina]);

  useEffect(() => {
    api.get<{ data: string }[]>('/api/feriados')
      .then(f => setFeriados(f.map(x => x.data)))
      .catch(() => setFeriados([]));
  }, []);

  const meusSumarios = useMemo(
    () => sumarios.filter(s =>
      s.professorId === prof?.id &&
      s.turmaId === turmaId &&
      s.disciplina === disciplina
    ),
    [sumarios, prof, turmaId, disciplina]
  );

  const gerarDatas = useCallback(async () => {
    if (!turmaId || !disciplina || !prof) return;
    setLoading(true);

    try {
      const todoosHorarios = await api.get<Horario[]>('/api/horarios');
      const meus = todoosHorarios.filter(
        h => h.turmaId === turmaId && h.disciplina === disciplina &&
          (h.professorId === prof.id || !h.professorId)
      );
      setHorarios(meus);

      if (meus.length === 0) {
        showToast('Não encontrado horário para esta turma/disciplina. Configure o horário primeiro.', 'error');
        setLoading(false);
        return;
      }

      const inicio = anoAtivo?.dataInicio
        ? new Date(anoAtivo.dataInicio + 'T00:00:00')
        : new Date(new Date().getFullYear(), 0, 1);
      const hoje = new Date();
      hoje.setHours(23, 59, 59, 999);

      const feriadosSet = new Set(feriados);
      const datasGeradas: EntradaDiario[] = [];
      const cur = new Date(inicio);
      let contadorAula = 1;

      while (cur <= hoje) {
        const diaSemana = cur.getDay() === 0 ? 7 : cur.getDay();
        const iso = cur.toISOString().split('T')[0];

        if (!feriadosSet.has(iso)) {
          const slots = meus.filter(h => h.diaSemana === diaSemana);
          for (const slot of slots.sort((a, b) => a.periodo - b.periodo)) {
            const sumario = meusSumarios.find(s => s.data === iso && s.horaInicio === slot.horaInicio);
            datasGeradas.push({
              data: iso,
              diaSemana,
              horaInicio: slot.horaInicio,
              horaFim: slot.horaFim,
              periodo: slot.periodo,
              numeroAula: contadorAula,
              conteudo: sumario?.conteudo ?? '',
              observacaoAluno: sumario?.observacaoAluno ?? '',
              sumarioId: sumario?.id,
              status: sumario?.status,
              observacaoRH: sumario?.observacaoRH,
            });
            contadorAula++;
          }
        }

        cur.setDate(cur.getDate() + 1);
      }

      setEntradas(datasGeradas.reverse());
      setGerado(true);

      const totalAulas = datasGeradas.length;
      const preenchidas = datasGeradas.filter(e => e.sumarioId).length;
      showToast(`${totalAulas} aulas geradas · ${preenchidas} já registadas`, 'success');
    } catch (e) {
      showToast('Erro ao gerar datas. Tente novamente.', 'error');
    } finally {
      setLoading(false);
    }
  }, [turmaId, disciplina, prof, anoAtivo, feriados, meusSumarios]);

  function updateConteudo(data: string, horaInicio: string, texto: string) {
    setEntradas(prev =>
      prev.map(e =>
        e.data === data && e.horaInicio === horaInicio
          ? { ...e, conteudo: texto }
          : e
      )
    );
  }

  function updateObservacaoAluno(data: string, horaInicio: string, texto: string) {
    setEntradas(prev =>
      prev.map(e =>
        e.data === data && e.horaInicio === horaInicio
          ? { ...e, observacaoAluno: texto }
          : e
      )
    );
  }

  async function submeterEntrada(entrada: EntradaDiario) {
    if (!prof || !entrada.conteudo.trim()) {
      showToast('Escreva o conteúdo da aula antes de submeter.', 'error');
      return;
    }
    if (entrada.sumarioId) return;

    const key = `${entrada.data}_${entrada.horaInicio}`;
    setSalvando(prev => ({ ...prev, [key]: true }));

    try {
      const turma = turmas.find(t => t.id === turmaId);
      await addSumario({
        professorId: prof.id,
        professorNome: `${prof.nome} ${prof.apelido}`,
        turmaId,
        turmaNome: turma?.nome ?? '',
        disciplina,
        data: entrada.data,
        horaInicio: entrada.horaInicio,
        horaFim: entrada.horaFim,
        numeroAula: entrada.numeroAula,
        conteudo: entrada.conteudo.trim(),
        observacaoAluno: entrada.observacaoAluno.trim() || null,
        status: 'pendente',
      });

      setEntradas(prev =>
        prev.map(e =>
          e.data === entrada.data && e.horaInicio === entrada.horaInicio
            ? { ...e, status: 'pendente', sumarioId: 'novo' }
            : e
        )
      );
      showToast('Sumário registado com sucesso!', 'success');
    } catch {
      showToast('Erro ao submeter sumário.', 'error');
    } finally {
      setSalvando(prev => ({ ...prev, [key]: false }));
    }
  }

  const stats = useMemo(() => {
    const total = entradas.length;
    const registadas = entradas.filter(e => e.sumarioId).length;
    const pendentes = entradas.filter(e => e.status === 'pendente').length;
    const aceites = entradas.filter(e => e.status === 'aceite').length;
    const rejeitadas = entradas.filter(e => e.status === 'rejeitado').length;
    const porPreencher = total - registadas;
    return { total, registadas, pendentes, aceites, rejeitadas, porPreencher };
  }, [entradas]);

  const turmaAtual = turmas.find(t => t.id === turmaId);

  return (
    <View style={s.screen}>
      <TopBar title="Diário de Classe" subtitle="Preenchimento automático por horário" />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: bottomPad + 24 }}>

        {/* Selecção de Turma */}
        <Text style={s.label}>Turma</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipRow}>
          {minhasTurmas.map(t => (
            <TouchableOpacity
              key={t.id}
              style={[s.chip, turmaId === t.id && s.chipActive]}
              onPress={() => { setTurmaId(t.id); setGerado(false); setEntradas([]); }}
            >
              <Text style={[s.chipText, turmaId === t.id && s.chipTextActive]}>{t.nome}</Text>
            </TouchableOpacity>
          ))}
          {minhasTurmas.length === 0 && (
            <Text style={s.empty}>Nenhuma turma atribuída</Text>
          )}
        </ScrollView>

        {/* Selecção de Disciplina */}
        {turmaId !== '' && (
          <>
            <Text style={s.label}>Disciplina</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipRow}>
              {disciplinasDaTurma.map(d => (
                <TouchableOpacity
                  key={d}
                  style={[s.chip, disciplina === d && s.chipActive]}
                  onPress={() => { setDisciplina(d); setGerado(false); setEntradas([]); }}
                >
                  <Text style={[s.chipText, disciplina === d && s.chipTextActive]}>{d}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </>
        )}

        {/* Botão Gerar */}
        {turmaId && disciplina && (
          <TouchableOpacity
            style={[s.gerarBtn, loading && { opacity: 0.6 }]}
            onPress={gerarDatas}
            disabled={loading}
            activeOpacity={0.8}
          >
            {loading ? (
              <AppLoader color={Colors.background} size="small" />
            ) : (
              <Ionicons name="calendar-outline" size={20} color={Colors.background} />
            )}
            <Text style={s.gerarBtnText}>
              {loading ? 'A gerar datas...' : gerado ? 'Regenerar Datas' : 'Gerar Datas'}
            </Text>
          </TouchableOpacity>
        )}

        {!turmaId && (
          <View style={s.emptyState}>
            <Ionicons name="book-outline" size={48} color={Colors.textMuted} />
            <Text style={s.emptyTitle}>Diário de Classe</Text>
            <Text style={s.emptyDesc}>
              Seleccione uma turma e disciplina, depois clique em "Gerar Datas" para o sistema preencher automaticamente todas as datas de aula com base no seu horário.
            </Text>
          </View>
        )}

        {/* Resumo de estatísticas */}
        {gerado && entradas.length > 0 && (
          <>
            <View style={s.statsBar}>
              {[
                { label: 'Total', value: stats.total, color: Colors.info },
                { label: 'Por preencher', value: stats.porPreencher, color: Colors.warning },
                { label: 'Pendentes', value: stats.pendentes, color: Colors.gold },
                { label: 'Aceites', value: stats.aceites, color: Colors.success },
              ].map(st => (
                <View key={st.label} style={s.statItem}>
                  <Text style={[s.statValue, { color: st.color }]}>{st.value}</Text>
                  <Text style={s.statLabel}>{st.label}</Text>
                </View>
              ))}
            </View>

            {/* Barra de progresso */}
            <View style={s.progressWrap}>
              <View style={s.progressBg}>
                <View style={[s.progressFill, {
                  width: `${stats.total > 0 ? Math.round((stats.registadas / stats.total) * 100) : 0}%` as any
                }]} />
              </View>
              <Text style={s.progressText}>
                {stats.total > 0 ? Math.round((stats.registadas / stats.total) * 100) : 0}% preenchido
              </Text>
            </View>
          </>
        )}

        {/* Lista de entradas */}
        {gerado && entradas.length === 0 && !loading && (
          <View style={s.emptyState}>
            <Ionicons name="calendar-outline" size={40} color={Colors.textMuted} />
            <Text style={s.emptyTitle}>Nenhuma aula encontrada</Text>
            <Text style={s.emptyDesc}>
              Não há horário configurado para {disciplina} na turma {turmaAtual?.nome}. Configure o horário primeiro.
            </Text>
          </View>
        )}

        {entradas.map((entrada) => {
          const key = `${entrada.data}_${entrada.horaInicio}`;
          const isExpanded = expandido[key] ?? (!entrada.sumarioId);
          const isSaving = salvando[key];
          const jaRegistada = !!entrada.sumarioId;

          return (
            <View key={key} style={[s.card, jaRegistada && s.cardRegistada]}>
              {/* Cabeçalho da entrada */}
              <TouchableOpacity
                style={s.cardHeader}
                onPress={() => setExpandido(prev => ({ ...prev, [key]: !isExpanded }))}
                activeOpacity={0.8}
              >
                <View style={[s.aulaBadge, { backgroundColor: jaRegistada ? Colors.success + '22' : Colors.gold + '22' }]}>
                  <Text style={[s.aulaBadgeText, { color: jaRegistada ? Colors.success : Colors.gold }]}>
                    Aula {entrada.numeroAula}
                  </Text>
                </View>
                <View style={s.cardInfo}>
                  <Text style={s.cardData}>{fmtDataLonga(entrada.data)}</Text>
                  <Text style={s.cardHora}>
                    {DIAS_PT[entrada.diaSemana]} · {entrada.horaInicio}–{entrada.horaFim} · Período {entrada.periodo}
                  </Text>
                </View>
                <View style={s.cardRight}>
                  {entrada.status && <StatusChip status={entrada.status} />}
                  {!jaRegistada && (
                    <View style={[s.dot, { backgroundColor: Colors.warning }]} />
                  )}
                  <Ionicons
                    name={isExpanded ? 'chevron-up' : 'chevron-down'}
                    size={16}
                    color={Colors.textMuted}
                  />
                </View>
              </TouchableOpacity>

              {/* Conteúdo expandido */}
              {isExpanded && (
                <View style={s.cardBody}>
                  <View style={s.divider} />

                  {entrada.observacaoRH && (
                    <View style={s.observacaoBox}>
                      <Ionicons name="information-circle" size={14} color={Colors.danger} />
                      <Text style={s.observacaoText}>{entrada.observacaoRH}</Text>
                    </View>
                  )}

                  {jaRegistada ? (
                    <View style={s.conteudoView}>
                      <Text style={s.conteudoLabel}>Conteúdo registado:</Text>
                      <Text style={s.conteudoText}>{entrada.conteudo}</Text>
                      {!!entrada.observacaoAluno && (
                        <>
                          <Text style={[s.conteudoLabel, { marginTop: 8 }]}>Observação para alunos:</Text>
                          <View style={s.obsAlunoBox}>
                            <Ionicons name="people-outline" size={13} color={Colors.info} />
                            <Text style={s.obsAlunoText}>{entrada.observacaoAluno}</Text>
                          </View>
                        </>
                      )}
                    </View>
                  ) : (
                    <>
                      <Text style={s.inputLabel}>Conteúdo da Aula<RequiredMark /></Text>
                      <TextInput
                        style={s.textarea}
                        value={entrada.conteudo}
                        onChangeText={t => updateConteudo(entrada.data, entrada.horaInicio, t)}
                        placeholder="Descreva os conteúdos leccionados nesta aula..."
                        placeholderTextColor={Colors.textMuted}
                        multiline
                        numberOfLines={4}
                        textAlignVertical="top"
                      />
                      <Text style={[s.inputLabel, { marginTop: 10 }]}>Observação para Alunos <Text style={{ color: Colors.textMuted }}>(opcional)</Text></Text>
                      <TextInput
                        style={[s.textarea, { minHeight: 60 }]}
                        value={entrada.observacaoAluno}
                        onChangeText={t => updateObservacaoAluno(entrada.data, entrada.horaInicio, t)}
                        placeholder="Recados, trabalho de casa, aviso para a próxima aula..."
                        placeholderTextColor={Colors.textMuted}
                        multiline
                        numberOfLines={3}
                        textAlignVertical="top"
                      />
                      <TouchableOpacity
                        style={[s.submitBtn, (!entrada.conteudo.trim() || isSaving) && s.submitBtnDisabled]}
                        onPress={() => submeterEntrada(entrada)}
                        disabled={!entrada.conteudo.trim() || isSaving}
                        activeOpacity={0.8}
                      >
                        {isSaving ? (
                          <AppLoader color="#fff" size="small" />
                        ) : (
                          <Ionicons name="checkmark-circle" size={16} color="#fff" />
                        )}
                        <Text style={s.submitBtnText}>
                          {isSaving ? 'A submeter...' : 'Submeter Sumário'}
                        </Text>
                      </TouchableOpacity>
                    </>
                  )}
                </View>
              )}
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  label: {
    fontSize: 11, fontFamily: 'Inter_700Bold', color: Colors.textMuted,
    textTransform: 'uppercase', letterSpacing: 1.1,
    marginHorizontal: 16, marginTop: 14, marginBottom: 6,
  },
  chipRow: { paddingHorizontal: 16, gap: 8, flexDirection: 'row', paddingBottom: 4 },
  chip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border,
  },
  chipActive: { backgroundColor: Colors.gold + '22', borderColor: Colors.gold },
  chipText: { fontSize: 13, fontFamily: 'Inter_500Medium', color: Colors.textSecondary },
  chipTextActive: { color: Colors.goldLight, fontFamily: 'Inter_600SemiBold' },
  empty: { fontSize: 13, fontFamily: 'Inter_400Regular', color: Colors.textMuted, paddingVertical: 8 },
  gerarBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: Colors.gold, marginHorizontal: 16, marginTop: 20, marginBottom: 8,
    paddingVertical: 14, borderRadius: 14,
  },
  gerarBtnText: { fontSize: 15, fontFamily: 'Inter_700Bold', color: Colors.background },
  statsBar: {
    flexDirection: 'row', backgroundColor: Colors.backgroundCard,
    marginHorizontal: 16, marginTop: 16, marginBottom: 6,
    borderRadius: 14, borderWidth: 1, borderColor: Colors.border, paddingVertical: 12,
  },
  statItem: { flex: 1, alignItems: 'center', gap: 2 },
  statValue: { fontSize: 20, fontFamily: 'Inter_700Bold' },
  statLabel: { fontSize: 10, fontFamily: 'Inter_400Regular', color: Colors.textMuted, textAlign: 'center' },
  progressWrap: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 16, marginBottom: 16 },
  progressBg: { flex: 1, height: 8, borderRadius: 4, backgroundColor: Colors.surface, overflow: 'hidden' },
  progressFill: { height: 8, borderRadius: 4, backgroundColor: Colors.success },
  progressText: { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: Colors.success, minWidth: 70, textAlign: 'right' },
  card: {
    backgroundColor: Colors.backgroundCard, borderRadius: 16,
    borderWidth: 1, borderColor: Colors.border,
    marginHorizontal: 16, marginBottom: 10, overflow: 'hidden',
  },
  cardRegistada: { borderColor: Colors.success + '33' },
  cardHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14,
  },
  aulaBadge: {
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, minWidth: 62, alignItems: 'center',
  },
  aulaBadgeText: { fontSize: 12, fontFamily: 'Inter_700Bold' },
  cardInfo: { flex: 1 },
  cardData: { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: Colors.text },
  cardHora: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 2 },
  cardRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  cardBody: { paddingHorizontal: 14, paddingBottom: 14 },
  divider: { height: 1, backgroundColor: Colors.border, marginBottom: 12 },
  observacaoBox: {
    flexDirection: 'row', gap: 6, alignItems: 'flex-start',
    backgroundColor: Colors.danger + '15', borderRadius: 10, padding: 10,
    borderWidth: 1, borderColor: Colors.danger + '33', marginBottom: 12,
  },
  observacaoText: { flex: 1, fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.danger },
  obsAlunoBox: {
    flexDirection: 'row', gap: 6, alignItems: 'flex-start',
    backgroundColor: Colors.info + '15', borderRadius: 10, padding: 10,
    borderWidth: 1, borderColor: Colors.info + '33',
  },
  obsAlunoText: { flex: 1, fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.info },
  conteudoView: { gap: 4 },
  conteudoLabel: { fontSize: 11, fontFamily: 'Inter_600SemiBold', color: Colors.textMuted },
  conteudoText: { fontSize: 13, fontFamily: 'Inter_400Regular', color: Colors.textSecondary, lineHeight: 20 },
  inputLabel: { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: Colors.textSecondary, marginBottom: 6 },
  textarea: {
    backgroundColor: Colors.surface, borderRadius: 12, borderWidth: 1, borderColor: Colors.border,
    padding: 12, fontSize: 13, fontFamily: 'Inter_400Regular', color: Colors.text,
    minHeight: 100, marginBottom: 10,
  },
  submitBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: Colors.success, paddingVertical: 12, borderRadius: 12,
  },
  submitBtnDisabled: { opacity: 0.45 },
  submitBtnText: { fontSize: 14, fontFamily: 'Inter_600SemiBold', color: '#fff' },
  emptyState: {
    alignItems: 'center', gap: 12, padding: 32, marginTop: 20,
    marginHorizontal: 16, backgroundColor: Colors.backgroundCard,
    borderRadius: 16, borderWidth: 1, borderColor: Colors.border,
  },
  emptyTitle: { fontSize: 16, fontFamily: 'Inter_700Bold', color: Colors.textSecondary },
  emptyDesc: { fontSize: 13, fontFamily: 'Inter_400Regular', color: Colors.textMuted, textAlign: 'center', lineHeight: 20 },
});
