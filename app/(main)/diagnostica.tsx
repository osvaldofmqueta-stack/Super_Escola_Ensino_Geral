import React, { useState, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Platform,
  TextInput, ActivityIndicator, FlatList, Modal, KeyboardAvoidingView,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { Colors } from '@/constants/colors';
import TopBar from '@/components/TopBar';
import { useAuth } from '@/context/AuthContext';
import { useData } from '@/context/DataContext';
import { useProfessor } from '@/context/ProfessorContext';
import { useAnoAcademico } from '@/context/AnoAcademicoContext';
import { api } from '@/lib/api';
import { webAlert } from '@/utils/webAlert';
import ProfessorLoadingSkeleton from '@/components/ProfessorLoadingSkeleton';

// ─── Tipos ────────────────────────────────────────────────────────────────────

type Nivel = 'nao_satisfaz' | 'satisfaz' | 'bom' | 'muito_bom';

interface RegistoDiag {
  alunoId: string;
  alunoNome: string;
  nivel: Nivel;
  nota: string;
  observacoes: string;
}

interface DiagSalvo {
  id: string;
  alunoId: string;
  alunoNome: string;
  nivel: Nivel;
  nota: number | null;
  observacoes: string;
  registadoEm: string;
}

interface TurmaDisc {
  turmaId: string;
  turmaNome: string;
  disciplinaId?: string;
  disciplinaNome: string;
}

// ─── Constantes ───────────────────────────────────────────────────────────────

const NIVEIS: { key: Nivel; label: string; cor: string; icone: string }[] = [
  { key: 'nao_satisfaz', label: 'Não Satisfaz', cor: '#ef4444', icone: 'close-circle' },
  { key: 'satisfaz',    label: 'Satisfaz',      cor: '#f59e0b', icone: 'checkmark-circle' },
  { key: 'bom',         label: 'Bom',           cor: '#3b82f6', icone: 'star-half' },
  { key: 'muito_bom',   label: 'Muito Bom',     cor: '#22c55e', icone: 'star' },
];

function nivelInfo(n: Nivel) {
  return NIVEIS.find(x => x.key === n) || NIVEIS[1];
}

const TRIMS = [1, 2, 3];
const PAGE_SIZE = 8;

// ─── Componente principal ─────────────────────────────────────────────────────

export default function DiagnosticaScreen() {
  const { user } = useAuth();
  const { turmas, alunos, isLoading: dataLoading } = useData();
  const { meusTurmaDisc } = useProfessor();
  const { anoLetivoStr } = useAnoAcademico();
  const insets = useSafeAreaInsets();
  const bottomPad = Platform.OS === 'web' ? 24 : insets.bottom;

  // Passos: 'sel_turma' → 'sel_disc' → 'sel_trim' → 'registar'
  const [step, setStep] = useState<'sel_turma' | 'sel_disc' | 'sel_trim' | 'registar'>('sel_turma');
  const [selectedTurmaId, setSelectedTurmaId] = useState<string>('');
  const [selectedDisc, setSelectedDisc] = useState<TurmaDisc | null>(null);
  const [selectedTrim, setSelectedTrim] = useState<number>(1);
  const [registos, setRegistos] = useState<RegistoDiag[]>([]);
  const [salvos, setSalvos] = useState<DiagSalvo[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pagina, setPagina] = useState(1);
  const [adminDiscs, setAdminDiscs] = useState<TurmaDisc[]>([]);
  const [loadingDiscs, setLoadingDiscs] = useState(false);

  // Modal de nível para cada aluno
  const [nivelModal, setNivelModal] = useState<{ alunoId: string } | null>(null);
  // Modal de observações
  const [obsModal, setObsModal] = useState<{ alunoId: string; obs: string } | null>(null);
  const [obsText, setObsText] = useState('');

  // ── Dados filtrados ──────────────────────────────────────────────────────────

  const isAdmin = ['admin', 'director', 'pedagogico', 'ceo', 'pca'].includes(user?.role || '');

  // Turmas disponíveis para o professor (ou todas se admin)
  const minhasTurmas = React.useMemo(() => {
    if (isAdmin) return turmas;
    const ids = new Set((meusTurmaDisc || []).map((x: any) => x.turmaId));
    return turmas.filter(t => ids.has(t.id));
  }, [turmas, meusTurmaDisc, isAdmin]);

  // Disciplinas para a turma seleccionada
  const disciplinasDaTurma = React.useMemo(() => {
    if (!selectedTurmaId) return [];
    if (isAdmin) {
      // Para admins: disciplinas carregadas via /api/turmas/:id/disciplinas
      return adminDiscs;
    }
    return (meusTurmaDisc || [])
      .filter((x: any) => x.turmaId === selectedTurmaId)
      .map((x: any) => ({
        turmaId: x.turmaId,
        turmaNome: x.turmaNome || '',
        disciplinaId: x.disciplinaId,
        disciplinaNome: x.disciplinaNome,
      }));
  }, [selectedTurmaId, meusTurmaDisc, isAdmin, adminDiscs]);

  // Alunos da turma seleccionada
  const alunosDaTurma = React.useMemo(() => {
    if (!selectedTurmaId) return [];
    return alunos
      .filter(a => a.turmaId === selectedTurmaId && a.ativo !== false)
      .sort((a, b) => (a.nome + ' ' + a.apelido).localeCompare(b.nome + ' ' + b.apelido));
  }, [alunos, selectedTurmaId]);

  // ── Carregar dados guardados ─────────────────────────────────────────────────

  const carregarSalvos = useCallback(async () => {
    if (!selectedDisc || !selectedTurmaId || !anoLetivoStr) return;
    setLoading(true);
    try {
      const res = await api.get<DiagSalvo[]>(
        `/api/diagnostica?turmaId=${selectedTurmaId}&disciplinaNome=${encodeURIComponent(selectedDisc.disciplinaNome)}&trimestre=${selectedTrim}&anoLetivo=${encodeURIComponent(anoLetivoStr)}`
      );
      setSalvos(res);

      // Pre-preencher registos com dados guardados
      const mapaExistente: Record<string, DiagSalvo> = {};
      (res || []).forEach(s => { mapaExistente[s.alunoId] = s; });

      setRegistos(alunosDaTurma.map(a => {
        const existente = mapaExistente[a.id];
        return {
          alunoId: a.id,
          alunoNome: (a.nome || '') + ' ' + (a.apelido || ''),
          nivel: (existente?.nivel as Nivel) || 'satisfaz',
          nota: existente?.nota != null ? String(existente.nota) : '',
          observacoes: existente?.observacoes || '',
        };
      }));
    } catch {
      setRegistos(alunosDaTurma.map(a => ({
        alunoId: a.id,
        alunoNome: (a.nome || '') + ' ' + (a.apelido || ''),
        nivel: 'satisfaz',
        nota: '',
        observacoes: '',
      })));
    } finally {
      setLoading(false);
    }
  }, [selectedDisc, selectedTurmaId, selectedTrim, anoLetivoStr, alunosDaTurma]);

  useFocusEffect(useCallback(() => {
    if (step === 'registar') carregarSalvos();
  }, [step, carregarSalvos]));

  // ── Helpers ──────────────────────────────────────────────────────────────────

  function setNivel(alunoId: string, nivel: Nivel) {
    setRegistos(prev => prev.map(r => r.alunoId === alunoId ? { ...r, nivel } : r));
  }
  function setNota(alunoId: string, nota: string) {
    setRegistos(prev => prev.map(r => r.alunoId === alunoId ? { ...r, nota } : r));
  }
  function setObs(alunoId: string, observacoes: string) {
    setRegistos(prev => prev.map(r => r.alunoId === alunoId ? { ...r, observacoes } : r));
  }

  // ── Guardar ──────────────────────────────────────────────────────────────────

  async function guardar() {
    if (!selectedDisc || !selectedTurmaId || !anoLetivoStr) return;
    setSaving(true);
    try {
      const turma = turmas.find(t => t.id === selectedTurmaId);
      await api.post('/api/diagnostica/lote', {
        turmaId: selectedTurmaId,
        turmaNome: turma?.nome || '',
        disciplinaId: selectedDisc.disciplinaId || null,
        disciplinaNome: selectedDisc.disciplinaNome,
        anoLetivo: anoLetivoStr,
        trimestre: selectedTrim,
        registos: registos.map(r => ({
          alunoId: r.alunoId,
          alunoNome: r.alunoNome,
          nivel: r.nivel,
          nota: r.nota ? parseFloat(r.nota) : null,
          observacoes: r.observacoes,
        })),
      });
      webAlert('Guardado', `Avaliação Diagnóstica do ${selectedTrim}º Trimestre guardada com sucesso para ${registos.length} aluno(s).`);
      await carregarSalvos();
    } catch (e: any) {
      webAlert('Erro', e?.message || 'Não foi possível guardar.');
    } finally {
      setSaving(false);
    }
  }

  // ── Navegação ────────────────────────────────────────────────────────────────

  async function irParaDisc(turmaId: string) {
    setSelectedTurmaId(turmaId);
    setSelectedDisc(null);
    setAdminDiscs([]);
    setStep('sel_disc');
    if (isAdmin) {
      setLoadingDiscs(true);
      try {
        const turma = turmas.find(t => t.id === turmaId);
        const rows = await api.get<any[]>(`/api/turmas/${turmaId}/disciplinas`);
        setAdminDiscs((rows || []).map((d: any) => ({
          turmaId,
          turmaNome: turma?.nome || '',
          disciplinaId: d.id,
          disciplinaNome: d.nome || '',
        })));
      } catch {
        setAdminDiscs([]);
      } finally {
        setLoadingDiscs(false);
      }
    }
  }
  function irParaTrim(disc: TurmaDisc) {
    setSelectedDisc(disc);
    setStep('sel_trim');
  }
  function irParaRegistar(trim: number) {
    setSelectedTrim(trim);
    setStep('registar');
  }
  function voltar() {
    if (step === 'registar') setStep('sel_trim');
    else if (step === 'sel_trim') setStep('sel_disc');
    else if (step === 'sel_disc') setStep('sel_turma');
  }

  // ── Paginação de turmas ──────────────────────────────────────────────────────

  const totalPaginas = Math.max(1, Math.ceil(minhasTurmas.length / PAGE_SIZE));
  const turmasPagina = minhasTurmas.slice((pagina - 1) * PAGE_SIZE, pagina * PAGE_SIZE);

  function irPagina(p: number) {
    setPagina(Math.max(1, Math.min(p, totalPaginas)));
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  if (dataLoading) return <ProfessorLoadingSkeleton />;

  const turmaActual = turmas.find(t => t.id === selectedTurmaId);

  return (
    <View style={styles.container}>
      <TopBar title="Avaliação Diagnóstica" subtitle="Art. 4º-d — Modalidade formativa" />

      {/* Breadcrumb */}
      <View style={styles.breadcrumb}>
        <TouchableOpacity onPress={() => setStep('sel_turma')} style={styles.bcItem}>
          <Text style={[styles.bcText, step === 'sel_turma' && styles.bcActive]}>Turma</Text>
        </TouchableOpacity>
        {step !== 'sel_turma' && (
          <>
            <Ionicons name="chevron-forward" size={12} color={Colors.textMuted} />
            <TouchableOpacity onPress={() => setStep('sel_disc')} style={styles.bcItem}>
              <Text style={[styles.bcText, step === 'sel_disc' && styles.bcActive]}>Disciplina</Text>
            </TouchableOpacity>
          </>
        )}
        {(step === 'sel_trim' || step === 'registar') && (
          <>
            <Ionicons name="chevron-forward" size={12} color={Colors.textMuted} />
            <TouchableOpacity onPress={() => setStep('sel_trim')} style={styles.bcItem}>
              <Text style={[styles.bcText, step === 'sel_trim' && styles.bcActive]}>Trimestre</Text>
            </TouchableOpacity>
          </>
        )}
        {step === 'registar' && (
          <>
            <Ionicons name="chevron-forward" size={12} color={Colors.textMuted} />
            <Text style={[styles.bcText, styles.bcActive]}>Registar</Text>
          </>
        )}
      </View>

      {/* ── PASSO 1: Seleccionar Turma ─────────────────────────────────────── */}
      {step === 'sel_turma' && (
        <ScrollView style={styles.scroll} contentContainerStyle={{ paddingBottom: bottomPad + 24 }}>
          <View style={styles.infoCard}>
            <MaterialCommunityIcons name="information-outline" size={18} color="#0ea5e9" />
            <Text style={styles.infoText}>
              A <Text style={{ fontFamily: 'Inter_600SemiBold' }}>Avaliação Diagnóstica</Text> é uma modalidade formativa prevista no Art. 4º-d do Regulamento de Avaliação. Regista o ponto de partida dos alunos no início de cada período. <Text style={{ fontFamily: 'Inter_600SemiBold' }}>Não conta para a nota final.</Text>
            </Text>
          </View>
          <Text style={styles.sectionLabel}>SELECCIONAR TURMA</Text>
          {minhasTurmas.length === 0 && (
            <Text style={styles.empty}>Não tem turmas atribuídas.</Text>
          )}
          {turmasPagina.map(t => (
            <TouchableOpacity key={t.id} style={styles.listCard} onPress={() => irParaDisc(t.id)} activeOpacity={0.8}>
              <View style={[styles.listIcon, { backgroundColor: '#0ea5e9' + '22' }]}>
                <Ionicons name="people" size={20} color="#0ea5e9" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.listTitle}>{t.nome}</Text>
                <Text style={styles.listSub}>{t.classe || ''}{t.turno ? ` · ${t.turno}` : ''}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
            </TouchableOpacity>
          ))}

          {/* ── Barra de Paginação ── */}
          {totalPaginas > 1 && (
            <View style={styles.paginacao}>
              {/* Botão anterior */}
              <TouchableOpacity
                style={[styles.pgBtn, pagina === 1 && styles.pgBtnDisabled]}
                onPress={() => irPagina(pagina - 1)}
                disabled={pagina === 1}
              >
                <Ionicons name="chevron-back" size={14} color={pagina === 1 ? Colors.textMuted : Colors.text} />
              </TouchableOpacity>

              {/* Números de página */}
              {Array.from({ length: totalPaginas }, (_, i) => i + 1).map(p => {
                const isActive = p === pagina;
                // Mostrar sempre: primeira, última, actual e ±1 da actual; resto → "…"
                const show = p === 1 || p === totalPaginas || Math.abs(p - pagina) <= 1;
                const showDotsBefore = p === pagina - 2 && pagina - 2 > 1;
                const showDotsAfter  = p === pagina + 2 && pagina + 2 < totalPaginas;
                if (!show) return null;
                return (
                  <React.Fragment key={p}>
                    {showDotsBefore && <Text style={styles.pgEllipsis}>…</Text>}
                    <TouchableOpacity
                      style={[styles.pgBtn, isActive && styles.pgBtnActive]}
                      onPress={() => irPagina(p)}
                    >
                      <Text style={[styles.pgBtnText, isActive && styles.pgBtnTextActive]}>{p}</Text>
                    </TouchableOpacity>
                    {showDotsAfter && <Text style={styles.pgEllipsis}>…</Text>}
                  </React.Fragment>
                );
              })}

              {/* Botão seguinte */}
              <TouchableOpacity
                style={[styles.pgBtn, pagina === totalPaginas && styles.pgBtnDisabled]}
                onPress={() => irPagina(pagina + 1)}
                disabled={pagina === totalPaginas}
              >
                <Ionicons name="chevron-forward" size={14} color={pagina === totalPaginas ? Colors.textMuted : Colors.text} />
              </TouchableOpacity>

              {/* Indicador textual */}
              <Text style={styles.pgInfo}>Página {pagina} de {totalPaginas}</Text>
            </View>
          )}
        </ScrollView>
      )}

      {/* ── PASSO 2: Seleccionar Disciplina ───────────────────────────────── */}
      {step === 'sel_disc' && (
        <ScrollView style={styles.scroll} contentContainerStyle={{ paddingBottom: bottomPad + 24 }}>
          <TouchableOpacity style={styles.backBtn} onPress={voltar}>
            <Ionicons name="arrow-back" size={16} color={Colors.textSecondary} />
            <Text style={styles.backText}>Turma: {turmaActual?.nome}</Text>
          </TouchableOpacity>
          <Text style={styles.sectionLabel}>SELECCIONAR DISCIPLINA</Text>
          {loadingDiscs && (
            <ActivityIndicator color={Colors.primary} style={{ marginTop: 32 }} />
          )}
          {!loadingDiscs && disciplinasDaTurma.length === 0 && (
            <Text style={styles.empty}>Sem disciplinas atribuídas nesta turma.</Text>
          )}
          {disciplinasDaTurma.map((d, i) => (
            <TouchableOpacity key={i} style={styles.listCard} onPress={() => irParaTrim(d)} activeOpacity={0.8}>
              <View style={[styles.listIcon, { backgroundColor: '#8b5cf6' + '22' }]}>
                <Ionicons name="book" size={20} color="#8b5cf6" />
              </View>
              <Text style={[styles.listTitle, { flex: 1 }]}>{d.disciplinaNome}</Text>
              <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* ── PASSO 3: Seleccionar Trimestre ────────────────────────────────── */}
      {step === 'sel_trim' && (
        <ScrollView style={styles.scroll} contentContainerStyle={{ paddingBottom: bottomPad + 24 }}>
          <TouchableOpacity style={styles.backBtn} onPress={voltar}>
            <Ionicons name="arrow-back" size={16} color={Colors.textSecondary} />
            <Text style={styles.backText}>{selectedDisc?.disciplinaNome}</Text>
          </TouchableOpacity>
          <Text style={styles.sectionLabel}>SELECCIONAR TRIMESTRE</Text>
          <View style={styles.infoCard}>
            <MaterialCommunityIcons name="information-outline" size={16} color="#f59e0b" />
            <Text style={[styles.infoText, { color: '#92400e' }]}>
              A avaliação diagnóstica é realizada no início de cada período, antes do início das actividades lectivas regulares.
            </Text>
          </View>
          {TRIMS.map(t => (
            <TouchableOpacity key={t} style={styles.listCard} onPress={() => irParaRegistar(t)} activeOpacity={0.8}>
              <View style={[styles.listIcon, { backgroundColor: '#22c55e' + '22' }]}>
                <Text style={{ fontSize: 20, color: '#22c55e', fontFamily: 'Inter_700Bold' }}>{t}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.listTitle}>{t}º Trimestre</Text>
                <Text style={styles.listSub}>
                  {t === 1 ? 'Início do ano lectivo' : t === 2 ? 'Início do 2º período' : 'Início do 3º período'}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* ── PASSO 4: Registar Avaliações ──────────────────────────────────── */}
      {step === 'registar' && (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.regHeader}>
            <TouchableOpacity style={styles.backBtn} onPress={voltar}>
              <Ionicons name="arrow-back" size={16} color={Colors.textSecondary} />
              <Text style={styles.backText}>Voltar</Text>
            </TouchableOpacity>
            <View style={{ flex: 1, marginLeft: 8 }}>
              <Text style={styles.regTitle}>{selectedDisc?.disciplinaNome}</Text>
              <Text style={styles.regSub}>{turmaActual?.nome} · {selectedTrim}º Trimestre · {anoLetivoStr}</Text>
            </View>
            <TouchableOpacity
              style={[styles.saveBtn, saving && { opacity: 0.6 }]}
              onPress={guardar}
              disabled={saving}
            >
              {saving
                ? <ActivityIndicator size="small" color="#fff" />
                : <><Ionicons name="checkmark" size={16} color="#fff" /><Text style={styles.saveBtnText}>Guardar</Text></>
              }
            </TouchableOpacity>
          </View>

          {/* Legenda de níveis */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.legendScroll} contentContainerStyle={styles.legendContent}>
            {NIVEIS.map(n => (
              <View key={n.key} style={[styles.legendItem, { borderColor: n.cor }]}>
                <Ionicons name={n.icone as any} size={13} color={n.cor} />
                <Text style={[styles.legendLabel, { color: n.cor }]}>{n.label}</Text>
              </View>
            ))}
          </ScrollView>

          {loading ? (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
              <ActivityIndicator color={Colors.primary} size="large" />
            </View>
          ) : (
            <FlatList
              data={registos}
              keyExtractor={r => r.alunoId}
              contentContainerStyle={{ paddingBottom: bottomPad + 80 }}
              renderItem={({ item: r, index }) => {
                const info = nivelInfo(r.nivel);
                const temObs = r.observacoes.trim().length > 0;
                return (
                  <View style={[styles.alunoRow, index % 2 === 1 && { backgroundColor: Colors.surface }]}>
                    <View style={styles.alunoNum}>
                      <Text style={styles.alunoNumText}>{index + 1}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.alunoNome} numberOfLines={1}>{r.alunoNome.trim()}</Text>
                      {temObs && (
                        <Text style={styles.alunoObs} numberOfLines={1}>"{r.observacoes}"</Text>
                      )}
                    </View>

                    {/* Nota (0-20) */}
                    <TextInput
                      style={styles.notaInput}
                      value={r.nota}
                      onChangeText={v => setNota(r.alunoId, v.replace(',', '.'))}
                      placeholder="—"
                      placeholderTextColor={Colors.textMuted}
                      keyboardType="decimal-pad"
                      maxLength={5}
                    />

                    {/* Botão Nível */}
                    <TouchableOpacity
                      style={[styles.nivelBtn, { borderColor: info.cor, backgroundColor: info.cor + '18' }]}
                      onPress={() => setNivelModal({ alunoId: r.alunoId })}
                      activeOpacity={0.8}
                    >
                      <Ionicons name={info.icone as any} size={14} color={info.cor} />
                      <Text style={[styles.nivelBtnText, { color: info.cor }]} numberOfLines={1}>{info.label}</Text>
                    </TouchableOpacity>

                    {/* Observações */}
                    <TouchableOpacity
                      style={[styles.obsBtn, temObs && { backgroundColor: '#0ea5e9' + '22' }]}
                      onPress={() => { setObsModal({ alunoId: r.alunoId, obs: r.observacoes }); setObsText(r.observacoes); }}
                    >
                      <Ionicons name={temObs ? 'chatbubble' : 'chatbubble-outline'} size={18} color={temObs ? '#0ea5e9' : Colors.textMuted} />
                    </TouchableOpacity>
                  </View>
                );
              }}
              ListEmptyComponent={
                <Text style={styles.empty}>Sem alunos nesta turma.</Text>
              }
            />
          )}
        </KeyboardAvoidingView>
      )}

      {/* ── Modal: Selecção de Nível ─────────────────────────────────────────── */}
      <Modal visible={!!nivelModal} transparent animationType="fade" onRequestClose={() => setNivelModal(null)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setNivelModal(null)}>
          <View style={styles.nivelModal}>
            <Text style={styles.nivelModalTitle}>Nível de Diagnóstico</Text>
            {NIVEIS.map(n => (
              <TouchableOpacity
                key={n.key}
                style={[styles.nivelOption, { borderColor: n.cor }]}
                onPress={() => {
                  if (nivelModal) setNivel(nivelModal.alunoId, n.key);
                  setNivelModal(null);
                }}
              >
                <Ionicons name={n.icone as any} size={20} color={n.cor} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.nivelOptLabel, { color: n.cor }]}>{n.label}</Text>
                  <Text style={styles.nivelOptDesc}>{nivelDescricao(n.key)}</Text>
                </View>
                {nivelModal && registos.find(r => r.alunoId === nivelModal.alunoId)?.nivel === n.key && (
                  <Ionicons name="checkmark-circle" size={18} color={n.cor} />
                )}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ── Modal: Observações ──────────────────────────────────────────────── */}
      <Modal visible={!!obsModal} transparent animationType="slide" onRequestClose={() => setObsModal(null)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setObsModal(null)}>
            <View style={styles.obsModal} onStartShouldSetResponder={() => true}>
              <Text style={styles.nivelModalTitle}>Observações</Text>
              <Text style={styles.obsAluno}>
                {registos.find(r => r.alunoId === obsModal?.alunoId)?.alunoNome || ''}
              </Text>
              <TextInput
                style={styles.obsInput}
                value={obsText}
                onChangeText={setObsText}
                placeholder="Ex: Demonstra dificuldades na interpretação de texto. Necessita de reforço em..."
                placeholderTextColor={Colors.textMuted}
                multiline
                numberOfLines={4}
                autoFocus
              />
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
                <TouchableOpacity style={styles.obsBtnCancel} onPress={() => setObsModal(null)}>
                  <Text style={{ color: Colors.textSecondary, fontFamily: 'Inter_500Medium' }}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.obsBtnSave]}
                  onPress={() => {
                    if (obsModal) setObs(obsModal.alunoId, obsText);
                    setObsModal(null);
                  }}
                >
                  <Text style={{ color: '#fff', fontFamily: 'Inter_600SemiBold' }}>Confirmar</Text>
                </TouchableOpacity>
              </View>
            </View>
          </TouchableOpacity>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

function nivelDescricao(n: Nivel): string {
  switch (n) {
    case 'nao_satisfaz': return 'O aluno não atingiu os objectivos mínimos do período anterior.';
    case 'satisfaz':     return 'O aluno atingiu os objectivos mínimos com dificuldades.';
    case 'bom':          return 'O aluno demonstra bom domínio dos conteúdos essenciais.';
    case 'muito_bom':    return 'O aluno evidencia domínio sólido e capacidade de aprofundamento.';
  }
}

// ─── Estilos ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  scroll: { flex: 1 },

  // Breadcrumb
  breadcrumb: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 16, paddingVertical: 10,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  bcItem: { paddingHorizontal: 4 },
  bcText: { fontSize: 12, color: Colors.textMuted, fontFamily: 'Inter_400Regular' },
  bcActive: { color: '#0ea5e9', fontFamily: 'Inter_600SemiBold' },

  // Info card
  infoCard: {
    flexDirection: 'row', gap: 10, alignItems: 'flex-start',
    backgroundColor: '#e0f2fe', borderRadius: 10, padding: 12,
    marginHorizontal: 16, marginTop: 14,
  },
  infoText: { flex: 1, fontSize: 12, color: '#0c4a6e', fontFamily: 'Inter_400Regular', lineHeight: 18 },

  // Labels
  sectionLabel: {
    fontSize: 11, fontFamily: 'Inter_600SemiBold', color: Colors.textMuted,
    letterSpacing: 1, marginTop: 18, marginBottom: 8, marginHorizontal: 16,
  },
  empty: { textAlign: 'center', color: Colors.textMuted, fontFamily: 'Inter_400Regular', marginTop: 32, fontSize: 14 },

  // List cards
  listCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: Colors.surface, marginHorizontal: 16, marginBottom: 8,
    borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: Colors.border,
  },
  listIcon: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  listTitle: { fontSize: 14, fontFamily: 'Inter_600SemiBold', color: Colors.text },
  listSub: { fontSize: 12, color: Colors.textSecondary, fontFamily: 'Inter_400Regular', marginTop: 2 },

  // Back button
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 6 },
  backText: { fontSize: 13, color: Colors.textSecondary, fontFamily: 'Inter_400Regular' },

  // Reg header
  regHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 12, paddingVertical: 10,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  regTitle: { fontSize: 14, fontFamily: 'Inter_700Bold', color: Colors.text },
  regSub: { fontSize: 11, color: Colors.textSecondary, fontFamily: 'Inter_400Regular' },

  // Save button
  saveBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: '#0ea5e9', borderRadius: 8,
    paddingHorizontal: 14, paddingVertical: 9,
  },
  saveBtnText: { color: '#fff', fontFamily: 'Inter_600SemiBold', fontSize: 13 },

  // Legenda
  legendScroll: { maxHeight: 40 },
  legendContent: { paddingHorizontal: 12, paddingVertical: 6, gap: 6 },
  legendItem: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderWidth: 1, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3,
  },
  legendLabel: { fontSize: 11, fontFamily: 'Inter_500Medium' },

  // Aluno row
  alunoRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 12, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: Colors.border + '80',
  },
  alunoNum: {
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: Colors.border + '80',
    alignItems: 'center', justifyContent: 'center',
  },
  alunoNumText: { fontSize: 11, color: Colors.textMuted, fontFamily: 'Inter_600SemiBold' },
  alunoNome: { fontSize: 13, fontFamily: 'Inter_500Medium', color: Colors.text, flex: 1 },
  alunoObs: { fontSize: 11, color: '#0ea5e9', fontFamily: 'Inter_400Regular', fontStyle: 'italic' },

  // Nota input
  notaInput: {
    width: 48, height: 34, borderRadius: 6,
    borderWidth: 1, borderColor: Colors.border,
    backgroundColor: Colors.card,
    textAlign: 'center',
    fontSize: 13, color: Colors.text,
    fontFamily: 'Inter_500Medium',
    paddingHorizontal: 4,
  },

  // Nivel button
  nivelBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderWidth: 1.5, borderRadius: 20,
    paddingHorizontal: 10, paddingVertical: 5,
    minWidth: 110, justifyContent: 'center',
  },
  nivelBtnText: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },

  // Obs button
  obsBtn: {
    width: 34, height: 34, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.border + '40',
  },

  // Modal
  modalOverlay: {
    flex: 1, backgroundColor: '#00000088',
    alignItems: 'center', justifyContent: 'center',
  },
  nivelModal: {
    backgroundColor: Colors.card, borderRadius: 16,
    padding: 20, width: 320, gap: 8,
  },
  nivelModalTitle: {
    fontSize: 15, fontFamily: 'Inter_700Bold', color: Colors.text,
    marginBottom: 4,
  },
  nivelOption: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderWidth: 1.5, borderRadius: 10, padding: 12,
  },
  nivelOptLabel: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  nivelOptDesc: { fontSize: 11, color: Colors.textSecondary, fontFamily: 'Inter_400Regular', marginTop: 2 },

  // Obs Modal
  obsModal: {
    backgroundColor: Colors.card, borderRadius: 16,
    padding: 20, width: 340,
  },
  obsAluno: { fontSize: 13, color: '#0ea5e9', fontFamily: 'Inter_500Medium', marginBottom: 10 },
  obsInput: {
    borderWidth: 1, borderColor: Colors.border, borderRadius: 10,
    padding: 12, minHeight: 100, textAlignVertical: 'top',
    color: Colors.text, fontFamily: 'Inter_400Regular', fontSize: 13,
    backgroundColor: Colors.surface,
  },
  obsBtnCancel: {
    flex: 1, borderWidth: 1, borderColor: Colors.border, borderRadius: 8,
    alignItems: 'center', paddingVertical: 10,
  },
  obsBtnSave: {
    flex: 1, backgroundColor: '#0ea5e9', borderRadius: 8,
    alignItems: 'center', paddingVertical: 10,
  },

  // Paginação
  paginacao: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 4, paddingVertical: 16, paddingHorizontal: 16, flexWrap: 'wrap',
  },
  pgBtn: {
    minWidth: 32, height: 32, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8,
    backgroundColor: Colors.surface,
    borderWidth: 1, borderColor: Colors.border,
  },
  pgBtnActive: {
    backgroundColor: '#0ea5e9',
    borderColor: '#0ea5e9',
  },
  pgBtnDisabled: {
    opacity: 0.35,
  },
  pgBtnText: {
    fontSize: 13, fontFamily: 'Inter_500Medium', color: Colors.text,
  },
  pgBtnTextActive: {
    color: '#fff', fontFamily: 'Inter_700Bold',
  },
  pgEllipsis: {
    fontSize: 13, color: Colors.textMuted, paddingHorizontal: 2,
    alignSelf: 'center',
  },
  pgInfo: {
    fontSize: 12, color: Colors.textMuted, fontFamily: 'Inter_400Regular',
    marginLeft: 8,
  },
});
