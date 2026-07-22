import React, { useState, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Platform,
  TextInput, ActivityIndicator, FlatList, Modal, KeyboardAvoidingView, Alert,
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

type Nivel = 'muito_bom' | 'bom' | 'satisfatorio' | 'insuficiente';
type Step = 'sel_turma' | 'sel_disc' | 'sel_trim' | 'alunos' | 'registos_aluno';

interface TurmaDisc {
  turmaId: string;
  turmaNome: string;
  disciplinaId?: string;
  disciplinaNome: string;
}

interface RegistoFormativo {
  id: string;
  alunoId: string;
  alunoNome?: string;
  turmaId: string;
  disciplina: string;
  professorId?: string;
  anoLetivo: string;
  trimestre: number;
  categoria: string;
  descricao: string;
  nivel: Nivel;
  data: string;
  criadoEm: string;
}

interface ResumoAluno {
  alunoId: string;
  alunoNome: string;
  alunoNumero: string;
  total: number;
  nivelMaisFrequente: Nivel | null;
  ultimaAvaliacao: string | null;
}

interface ResultadoCalculo {
  aplicados: number;
  total: number;
  detalhes: Array<{ alunoNome: string; notaFormativa: number; totalRegistos: number }>;
}

// ─── Constantes ───────────────────────────────────────────────────────────────

const NIVEIS: { key: Nivel; label: string; cor: string; icone: string; desc: string }[] = [
  { key: 'muito_bom',    label: 'Muito Bom',    cor: '#22c55e', icone: 'star',            desc: 'Supera as expectativas. Iniciativa, criatividade e autonomia.' },
  { key: 'bom',          label: 'Bom',           cor: '#3b82f6', icone: 'star-half',       desc: 'Cumpre os objectivos com regularidade e empenho.' },
  { key: 'satisfatorio', label: 'Satisfatório',  cor: '#f59e0b', icone: 'checkmark-circle', desc: 'Atinge os objectivos mínimos com algum apoio.' },
  { key: 'insuficiente', label: 'Insuficiente',  cor: '#ef4444', icone: 'close-circle',    desc: 'Não atinge os objectivos. Necessita intervenção pedagógica.' },
];

const CATEGORIAS = [
  { key: 'participacao',    label: 'Participação',        icone: 'hand-left', cor: '#6366f1' },
  { key: 'trabalho',       label: 'Trabalho de Aula',    icone: 'pencil',    cor: '#0ea5e9' },
  { key: 'tpc',            label: 'T.P.C.',              icone: 'home',      cor: '#f59e0b' },
  { key: 'comportamento',  label: 'Comportamento',       icone: 'happy',     cor: '#22c55e' },
  { key: 'atitude',        label: 'Atitude / Valores',   icone: 'heart',     cor: '#ec4899' },
  { key: 'grupo',          label: 'Trabalho de Grupo',   icone: 'people',    cor: '#8b5cf6' },
  { key: 'oral',           label: 'Exposição Oral',      icone: 'mic',       cor: '#14b8a6' },
  { key: 'portfolio',      label: 'Portfólio / Projecto', icone: 'folder',   cor: '#f97316' },
];

const TRIMS = [1, 2, 3];

function nivelInfo(n: Nivel | null) {
  return NIVEIS.find(x => x.key === n) || NIVEIS[2];
}

function categoriaInfo(k: string) {
  return CATEGORIAS.find(c => c.key === k) || { key: k, label: k, icone: 'clipboard', cor: '#64748b' };
}

function formatData(iso: string | null) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('pt-AO', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch { return iso; }
}

// ─── Constantes ───────────────────────────────────────────────────────────────

const PAGE_SIZE = 8;

// ─── Componente principal ─────────────────────────────────────────────────────

export default function FormativaScreen() {
  const { user } = useAuth();
  const { turmas, alunos, isLoading: dataLoading } = useData();
  const { meusTurmaDisc } = useProfessor();
  const { anoLetivoStr } = useAnoAcademico();
  const insets = useSafeAreaInsets();
  const bottomPad = Platform.OS === 'web' ? 24 : insets.bottom;

  const [step, setStep] = useState<Step>('sel_turma');
  const [selectedTurmaId, setSelectedTurmaId] = useState('');
  const [selectedDisc, setSelectedDisc] = useState<TurmaDisc | null>(null);
  const [selectedTrim, setSelectedTrim] = useState(1);
  const [selectedAlunoId, setSelectedAlunoId] = useState('');
  const [selectedAlunoNome, setSelectedAlunoNome] = useState('');

  const [resumos, setResumos] = useState<ResumoAluno[]>([]);
  const [registosAluno, setRegistosAluno] = useState<RegistoFormativo[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [calculando, setCalculando] = useState(false);
  const [resultadoCalculo, setResultadoCalculo] = useState<ResultadoCalculo | null>(null);
  const [pagina, setPagina] = useState(1);
  const [adminDiscs, setAdminDiscs] = useState<TurmaDisc[]>([]);
  const [loadingDiscs, setLoadingDiscs] = useState(false);

  // Modal: novo registo
  const [showModal, setShowModal] = useState(false);
  const [editando, setEditando] = useState<RegistoFormativo | null>(null);
  const [formCategoria, setFormCategoria] = useState('participacao');
  const [formNivel, setFormNivel] = useState<Nivel>('bom');
  const [formDescricao, setFormDescricao] = useState('');
  const [formData, setFormData] = useState(() => new Date().toISOString().slice(0, 10));

  const isAdmin = ['admin', 'director', 'pedagogico', 'ceo', 'pca'].includes(user?.role || '');

  // ── Turmas e disciplinas ──────────────────────────────────────────────────

  const minhasTurmas = React.useMemo(() => {
    if (isAdmin) return turmas;
    const ids = new Set((meusTurmaDisc || []).map((x: any) => x.turmaId));
    return turmas.filter(t => ids.has(t.id));
  }, [turmas, meusTurmaDisc, isAdmin]);

  const disciplinasDaTurma = React.useMemo(() => {
    if (!selectedTurmaId) return [];
    if (isAdmin) return adminDiscs;
    return (meusTurmaDisc || [])
      .filter((x: any) => x.turmaId === selectedTurmaId)
      .map((x: any) => ({
        turmaId: x.turmaId,
        turmaNome: x.turmaNome || '',
        disciplinaId: x.disciplinaId,
        disciplinaNome: x.disciplinaNome,
      }));
  }, [selectedTurmaId, meusTurmaDisc, isAdmin, adminDiscs]);

  const alunosDaTurma = React.useMemo(() => {
    if (!selectedTurmaId) return [];
    return alunos
      .filter(a => a.turmaId === selectedTurmaId && a.ativo !== false)
      .sort((a, b) => ((a.nome || '') + (a.apelido || '')).localeCompare((b.nome || '') + (b.apelido || '')));
  }, [alunos, selectedTurmaId]);

  const turmaActual = turmas.find(t => t.id === selectedTurmaId);

  // ── Carregar resumo por turma/disciplina/trimestre ─────────────────────────

  const carregarResumos = useCallback(async () => {
    if (!selectedDisc || !selectedTurmaId || !anoLetivoStr) return;
    setLoading(true);
    try {
      const res = await api.get<ResumoAluno[]>(
        `/api/avaliacoes-formativas/resumo?turmaId=${selectedTurmaId}&disciplina=${encodeURIComponent(selectedDisc.disciplinaNome)}&trimestre=${selectedTrim}&anoLetivo=${encodeURIComponent(anoLetivoStr)}`
      );
      // Preencher com todos os alunos, mesmo sem registos
      const mapaResumo: Record<string, ResumoAluno> = {};
      (res || []).forEach(r => { mapaResumo[r.alunoId] = r; });
      const lista: ResumoAluno[] = alunosDaTurma.map(a => {
        const r = mapaResumo[a.id];
        return {
          alunoId: a.id,
          alunoNome: ((a.nome || '') + ' ' + (a.apelido || '')).trim(),
          alunoNumero: a.numeroMatricula || '',
          total: r?.total ? Number(r.total) : 0,
          nivelMaisFrequente: (r?.nivelMaisFrequente as Nivel) || null,
          ultimaAvaliacao: r?.ultimaAvaliacao || null,
        };
      });
      setResumos(lista);
    } catch {
      setResumos(alunosDaTurma.map(a => ({
        alunoId: a.id,
        alunoNome: ((a.nome || '') + ' ' + (a.apelido || '')).trim(),
        alunoNumero: a.numeroMatricula || '',
        total: 0,
        nivelMaisFrequente: null,
        ultimaAvaliacao: null,
      })));
    } finally {
      setLoading(false);
    }
  }, [selectedDisc, selectedTurmaId, selectedTrim, anoLetivoStr, alunosDaTurma]);

  useFocusEffect(useCallback(() => {
    if (step === 'alunos') carregarResumos();
  }, [step, carregarResumos]));

  // ── Carregar registos de um aluno ──────────────────────────────────────────

  const carregarRegistosAluno = useCallback(async () => {
    if (!selectedDisc || !selectedTurmaId || !selectedAlunoId || !anoLetivoStr) return;
    setLoading(true);
    try {
      const res = await api.get<RegistoFormativo[]>(
        `/api/avaliacoes-formativas?turmaId=${selectedTurmaId}&disciplina=${encodeURIComponent(selectedDisc.disciplinaNome)}&trimestre=${selectedTrim}&anoLetivo=${encodeURIComponent(anoLetivoStr)}&alunoId=${selectedAlunoId}`
      );
      setRegistosAluno(res || []);
    } catch {
      setRegistosAluno([]);
    } finally {
      setLoading(false);
    }
  }, [selectedDisc, selectedTurmaId, selectedAlunoId, selectedTrim, anoLetivoStr]);

  useFocusEffect(useCallback(() => {
    if (step === 'registos_aluno') carregarRegistosAluno();
  }, [step, carregarRegistosAluno]));

  // ── Guardar registo ────────────────────────────────────────────────────────

  async function guardarRegisto() {
    if (!selectedDisc || !selectedTurmaId || !selectedAlunoId || !anoLetivoStr) return;
    setSaving(true);
    try {
      if (editando) {
        await api.put(`/api/avaliacoes-formativas/${editando.id}`, {
          categoria: formCategoria,
          descricao: formDescricao,
          nivel: formNivel,
          data: formData,
        });
      } else {
        await api.post('/api/avaliacoes-formativas', {
          alunoId: selectedAlunoId,
          turmaId: selectedTurmaId,
          disciplina: selectedDisc.disciplinaNome,
          professorId: user?.professorId || user?.id || null,
          anoLetivo: anoLetivoStr,
          trimestre: selectedTrim,
          categoria: formCategoria,
          descricao: formDescricao,
          nivel: formNivel,
          data: formData,
        });
      }
      setShowModal(false);
      resetForm();
      await carregarRegistosAluno();
    } catch (e: any) {
      webAlert('Erro', e?.message || 'Não foi possível guardar o registo.');
    } finally {
      setSaving(false);
    }
  }

  async function eliminarRegisto(id: string) {
    if (Platform.OS === 'web') {
      if (!window.confirm('Eliminar este registo formativo?')) return;
    } else {
      await new Promise<void>(resolve => {
        Alert.alert('Eliminar', 'Eliminar este registo formativo?', [
          { text: 'Cancelar', style: 'cancel', onPress: () => resolve() },
          { text: 'Eliminar', style: 'destructive', onPress: () => resolve() },
        ]);
      });
    }
    try {
      await api.delete(`/api/avaliacoes-formativas/${id}`);
      await carregarRegistosAluno();
    } catch (e: any) {
      webAlert('Erro', e?.message || 'Não foi possível eliminar.');
    }
  }

  function abrirNovoRegisto() {
    setEditando(null);
    resetForm();
    setShowModal(true);
  }

  function abrirEditar(r: RegistoFormativo) {
    setEditando(r);
    setFormCategoria(r.categoria);
    setFormNivel(r.nivel);
    setFormDescricao(r.descricao || '');
    setFormData(r.data ? r.data.slice(0, 10) : new Date().toISOString().slice(0, 10));
    setShowModal(true);
  }

  function resetForm() {
    setFormCategoria('participacao');
    setFormNivel('bom');
    setFormDescricao('');
    setFormData(new Date().toISOString().slice(0, 10));
  }

  // ── Calcular e aplicar à pauta ─────────────────────────────────────────────

  async function calcularEAplicar() {
    if (!selectedDisc || !selectedTurmaId || !anoLetivoStr) return;
    setCalculando(true);
    setResultadoCalculo(null);
    try {
      const res = await api.post<ResultadoCalculo>('/api/avaliacoes-formativas/calcular', {
        turmaId: selectedTurmaId,
        disciplina: selectedDisc.disciplinaNome,
        trimestre: selectedTrim,
        anoLetivo: anoLetivoStr,
      });
      setResultadoCalculo(res);
    } catch (e: any) {
      webAlert('Erro ao calcular', e?.message || 'Não foi possível aplicar as notas formativas. Verifique se a Avaliação Formativa está activada nas Configurações.');
    } finally {
      setCalculando(false);
    }
  }

  // ── Navegação ──────────────────────────────────────────────────────────────

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

  function voltar() {
    if (step === 'registos_aluno') { setStep('alunos'); return; }
    if (step === 'alunos') { setStep('sel_trim'); return; }
    if (step === 'sel_trim') { setStep('sel_disc'); return; }
    if (step === 'sel_disc') { setStep('sel_turma'); return; }
  }

  function irParaAlunos(trim: number) {
    setSelectedTrim(trim);
    setResultadoCalculo(null);
    setStep('alunos');
  }

  function irParaRegistos(aluno: ResumoAluno) {
    setSelectedAlunoId(aluno.alunoId);
    setSelectedAlunoNome(aluno.alunoNome);
    setStep('registos_aluno');
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (dataLoading) return <ProfessorLoadingSkeleton />;

  return (
    <View style={styles.container}>
      <TopBar title="Avaliação Formativa" subtitle="Art. 8º §1 — Função contínua e reguladora" />

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
        {(step === 'sel_trim' || step === 'alunos' || step === 'registos_aluno') && (
          <>
            <Ionicons name="chevron-forward" size={12} color={Colors.textMuted} />
            <TouchableOpacity onPress={() => setStep('sel_trim')} style={styles.bcItem}>
              <Text style={[styles.bcText, step === 'sel_trim' && styles.bcActive]}>Trimestre</Text>
            </TouchableOpacity>
          </>
        )}
        {(step === 'alunos' || step === 'registos_aluno') && (
          <>
            <Ionicons name="chevron-forward" size={12} color={Colors.textMuted} />
            <TouchableOpacity onPress={() => setStep('alunos')} style={styles.bcItem}>
              <Text style={[styles.bcText, step === 'alunos' && styles.bcActive]}>Alunos</Text>
            </TouchableOpacity>
          </>
        )}
        {step === 'registos_aluno' && (
          <>
            <Ionicons name="chevron-forward" size={12} color={Colors.textMuted} />
            <Text style={[styles.bcText, styles.bcActive]} numberOfLines={1}>{selectedAlunoNome.split(' ')[0]}</Text>
          </>
        )}
      </View>

      {/* ── PASSO 1: Seleccionar Turma ─────────────────────────────────────── */}
      {step === 'sel_turma' && (
        <ScrollView style={styles.scroll} contentContainerStyle={{ paddingBottom: bottomPad + 24 }}>
          <View style={styles.infoCard}>
            <MaterialCommunityIcons name="information-outline" size={18} color="#22c55e" />
            <Text style={styles.infoText}>
              A <Text style={{ fontFamily: 'Inter_700Bold' }}>Avaliação Formativa</Text> é a principal modalidade do sistema de ensino (Art. 8º §1). Regista o progresso contínuo do aluno — participação, atitude, trabalho — de forma <Text style={{ fontFamily: 'Inter_700Bold' }}>separada das notas sumativas.</Text>
            </Text>
          </View>
          <Text style={styles.sectionLabel}>SELECCIONAR TURMA</Text>
          {minhasTurmas.length === 0 && <Text style={styles.empty}>Não tem turmas atribuídas.</Text>}
          {(() => {
            const totalPaginas = Math.max(1, Math.ceil(minhasTurmas.length / PAGE_SIZE));
            const turmasPagina = minhasTurmas.slice((pagina - 1) * PAGE_SIZE, pagina * PAGE_SIZE);
            function irPagina(p: number) { setPagina(Math.max(1, Math.min(p, totalPaginas))); }
            return (
              <>
                {turmasPagina.map(t => (
                  <TouchableOpacity
                    key={t.id}
                    style={styles.listCard}
                    onPress={() => irParaDisc(t.id)}
                    activeOpacity={0.8}
                  >
                    <View style={[styles.listIcon, { backgroundColor: '#22c55e22' }]}>
                      <Ionicons name="people" size={20} color="#22c55e" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.listTitle}>{t.nome}</Text>
                      <Text style={styles.listSub}>{t.classe || ''}{t.turno ? ` · ${t.turno}` : ''}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
                  </TouchableOpacity>
                ))}
                {totalPaginas > 1 && (
                  <View style={styles.paginacao}>
                    <TouchableOpacity style={[styles.pgBtn, pagina === 1 && styles.pgBtnDisabled]} onPress={() => irPagina(pagina - 1)} disabled={pagina === 1}>
                      <Ionicons name="chevron-back" size={14} color={pagina === 1 ? Colors.textMuted : Colors.text} />
                    </TouchableOpacity>
                    {Array.from({ length: totalPaginas }, (_, i) => i + 1).map(p => {
                      const isActive = p === pagina;
                      const show = p === 1 || p === totalPaginas || Math.abs(p - pagina) <= 1;
                      const showDotsBefore = p === pagina - 2 && pagina - 2 > 1;
                      const showDotsAfter  = p === pagina + 2 && pagina + 2 < totalPaginas;
                      if (!show) return null;
                      return (
                        <React.Fragment key={p}>
                          {showDotsBefore && <Text style={styles.pgEllipsis}>…</Text>}
                          <TouchableOpacity style={[styles.pgBtn, isActive && styles.pgBtnActive]} onPress={() => irPagina(p)}>
                            <Text style={[styles.pgBtnText, isActive && styles.pgBtnTextActive]}>{p}</Text>
                          </TouchableOpacity>
                          {showDotsAfter && <Text style={styles.pgEllipsis}>…</Text>}
                        </React.Fragment>
                      );
                    })}
                    <TouchableOpacity style={[styles.pgBtn, pagina === totalPaginas && styles.pgBtnDisabled]} onPress={() => irPagina(pagina + 1)} disabled={pagina === totalPaginas}>
                      <Ionicons name="chevron-forward" size={14} color={pagina === totalPaginas ? Colors.textMuted : Colors.text} />
                    </TouchableOpacity>
                    <Text style={styles.pgInfo}>Página {pagina} de {totalPaginas}</Text>
                  </View>
                )}
              </>
            );
          })()}
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
          {loadingDiscs && <ActivityIndicator color={Colors.primary} style={{ marginTop: 32 }} />}
          {!loadingDiscs && disciplinasDaTurma.length === 0 && <Text style={styles.empty}>Sem disciplinas atribuídas nesta turma.</Text>}
          {disciplinasDaTurma.map((d, i) => (
            <TouchableOpacity
              key={i}
              style={styles.listCard}
              onPress={() => { setSelectedDisc(d); setStep('sel_trim'); }}
              activeOpacity={0.8}
            >
              <View style={[styles.listIcon, { backgroundColor: '#8b5cf622' }]}>
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
              Cada registo formativo é datado e archivado por trimestre. O professor pode adicionar múltiplas observações ao longo do período.
            </Text>
          </View>
          {TRIMS.map(t => (
            <TouchableOpacity key={t} style={styles.listCard} onPress={() => irParaAlunos(t)} activeOpacity={0.8}>
              <View style={[styles.listIcon, { backgroundColor: '#22c55e22' }]}>
                <Text style={{ fontSize: 20, color: '#22c55e', fontFamily: 'Inter_700Bold' }}>{t}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.listTitle}>{t}º Trimestre</Text>
                <Text style={styles.listSub}>
                  {t === 1 ? 'Setembro – Dezembro' : t === 2 ? 'Janeiro – Março' : 'Abril – Junho'}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* ── PASSO 4: Lista de Alunos com Resumo ───────────────────────────── */}
      {step === 'alunos' && (
        <View style={{ flex: 1 }}>
          <View style={styles.regHeader}>
            <TouchableOpacity style={styles.backBtn} onPress={voltar}>
              <Ionicons name="arrow-back" size={16} color={Colors.textSecondary} />
              <Text style={styles.backText}>Voltar</Text>
            </TouchableOpacity>
            <View style={{ flex: 1 }}>
              <Text style={styles.regTitle}>{selectedDisc?.disciplinaNome}</Text>
              <Text style={styles.regSub}>{turmaActual?.nome} · {selectedTrim}º Trim · {anoLetivoStr}</Text>
            </View>
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
              data={resumos}
              keyExtractor={r => r.alunoId}
              contentContainerStyle={{ paddingBottom: bottomPad + 24 }}
              renderItem={({ item: r, index }) => {
                const nInfo = nivelInfo(r.nivelMaisFrequente);
                const temRegistos = r.total > 0;
                return (
                  <TouchableOpacity
                    style={[styles.alunoCard, index % 2 === 1 && { backgroundColor: Colors.surface }]}
                    onPress={() => irParaRegistos(r)}
                    activeOpacity={0.8}
                  >
                    <View style={styles.alunoNum}>
                      <Text style={styles.alunoNumText}>{index + 1}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.alunoNome} numberOfLines={1}>{r.alunoNome}</Text>
                      {r.ultimaAvaliacao && (
                        <Text style={styles.alunoSub}>Último: {formatData(r.ultimaAvaliacao)}</Text>
                      )}
                    </View>

                    {/* Badge total */}
                    <View style={[styles.totalBadge, { backgroundColor: temRegistos ? '#22c55e22' : Colors.border }]}>
                      <Text style={[styles.totalBadgeText, { color: temRegistos ? '#22c55e' : Colors.textMuted }]}>
                        {r.total} reg.
                      </Text>
                    </View>

                    {/* Nível mais frequente */}
                    {temRegistos ? (
                      <View style={[styles.nivelPill, { backgroundColor: nInfo.cor + '22', borderColor: nInfo.cor }]}>
                        <Ionicons name={nInfo.icone as any} size={13} color={nInfo.cor} />
                        <Text style={[styles.nivelPillText, { color: nInfo.cor }]} numberOfLines={1}>{nInfo.label}</Text>
                      </View>
                    ) : (
                      <View style={[styles.nivelPill, { backgroundColor: Colors.border }]}>
                        <Text style={[styles.nivelPillText, { color: Colors.textMuted }]}>Sem reg.</Text>
                      </View>
                    )}

                    <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} style={{ marginLeft: 4 }} />
                  </TouchableOpacity>
                );
              }}
              ListEmptyComponent={<Text style={styles.empty}>Sem alunos nesta turma.</Text>}
            ListFooterComponent={
              resumos.length > 0 ? (
                <View style={{ marginHorizontal: 16, marginTop: 16, marginBottom: 8 }}>
                  {/* Resultado do cálculo */}
                  {resultadoCalculo && (
                    <View style={{ backgroundColor: '#dcfce7', borderRadius: 12, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: '#22c55e55' }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                        <Ionicons name="checkmark-circle" size={18} color="#16a34a" />
                        <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 14, color: '#14532d' }}>
                          Notas formativas aplicadas!
                        </Text>
                      </View>
                      <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 13, color: '#166534' }}>
                        {resultadoCalculo.aplicados} de {resultadoCalculo.total} alunos actualizados com nota formativa.
                      </Text>
                      <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 11, color: '#16a34a', marginTop: 4 }}>
                        A nota formativa já é considerada no cálculo da MAC na pauta do professor. Abra a pauta para verificar o impacto.
                      </Text>
                    </View>
                  )}

                  {/* Botão Calcular e Aplicar */}
                  <View style={{ backgroundColor: '#f0fdf4', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#22c55e44' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                      <MaterialCommunityIcons name="calculator-variant" size={18} color="#16a34a" />
                      <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 13, color: '#14532d' }}>Aplicar à Pauta</Text>
                    </View>
                    <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 12, color: '#166534', lineHeight: 18, marginBottom: 12 }}>
                      Converte os registos formativos em nota numérica (escala 1–5) e actualiza a MAC de cada aluno conforme a percentagem configurada (Art. 8º §1). A Avaliação Formativa deve estar activada nas Configurações da escola.
                    </Text>
                    <TouchableOpacity
                      style={{
                        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
                        backgroundColor: calculando ? '#86efac' : '#22c55e',
                        borderRadius: 10, paddingVertical: 12, paddingHorizontal: 20,
                        opacity: calculando ? 0.8 : 1,
                      }}
                      onPress={calcularEAplicar}
                      disabled={calculando}
                      activeOpacity={0.8}
                    >
                      {calculando
                        ? <ActivityIndicator size="small" color="#fff" />
                        : <MaterialCommunityIcons name="calculator-variant" size={18} color="#fff" />
                      }
                      <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 14, color: '#fff' }}>
                        {calculando ? 'A calcular...' : 'Calcular e Aplicar à Pauta'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : null
            }
            />
          )}
        </View>
      )}

      {/* ── PASSO 5: Registos de um Aluno ─────────────────────────────────── */}
      {step === 'registos_aluno' && (
        <View style={{ flex: 1 }}>
          <View style={styles.regHeader}>
            <TouchableOpacity style={styles.backBtn} onPress={voltar}>
              <Ionicons name="arrow-back" size={16} color={Colors.textSecondary} />
              <Text style={styles.backText}>Voltar</Text>
            </TouchableOpacity>
            <View style={{ flex: 1 }}>
              <Text style={styles.regTitle} numberOfLines={1}>{selectedAlunoNome}</Text>
              <Text style={styles.regSub}>{selectedDisc?.disciplinaNome} · {selectedTrim}º Trim</Text>
            </View>
            <TouchableOpacity style={styles.addBtn} onPress={abrirNovoRegisto} activeOpacity={0.8}>
              <Ionicons name="add" size={18} color="#fff" />
              <Text style={styles.addBtnText}>Novo</Text>
            </TouchableOpacity>
          </View>

          {loading ? (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
              <ActivityIndicator color={Colors.primary} size="large" />
            </View>
          ) : registosAluno.length === 0 ? (
            <View style={styles.emptyState}>
              <MaterialCommunityIcons name="clipboard-text-outline" size={48} color={Colors.textMuted} />
              <Text style={styles.emptyStateTitle}>Sem registos formativos</Text>
              <Text style={styles.emptyStateSub}>Toque em "Novo" para adicionar o primeiro registo de observação.</Text>
              <TouchableOpacity style={styles.emptyBtn} onPress={abrirNovoRegisto}>
                <Ionicons name="add-circle" size={18} color="#fff" />
                <Text style={styles.emptyBtnText}>Adicionar Primeiro Registo</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <FlatList
              data={registosAluno}
              keyExtractor={r => r.id}
              contentContainerStyle={{ paddingBottom: bottomPad + 24, paddingHorizontal: 16, paddingTop: 12 }}
              renderItem={({ item: r }) => {
                const nInfo = nivelInfo(r.nivel);
                const catInfo = categoriaInfo(r.categoria);
                return (
                  <View style={styles.registoCard}>
                    {/* Topo: categoria + data + ações */}
                    <View style={styles.registoTop}>
                      <View style={[styles.catBadge, { backgroundColor: catInfo.cor + '22' }]}>
                        <Ionicons name={catInfo.icone as any} size={14} color={catInfo.cor} />
                        <Text style={[styles.catLabel, { color: catInfo.cor }]}>{catInfo.label}</Text>
                      </View>
                      <Text style={styles.registoData}>{formatData(r.data)}</Text>
                      <TouchableOpacity onPress={() => abrirEditar(r)} style={styles.registoAcao}>
                        <Ionicons name="pencil-outline" size={16} color={Colors.textMuted} />
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => eliminarRegisto(r.id)} style={styles.registoAcao}>
                        <Ionicons name="trash-outline" size={16} color="#ef4444" />
                      </TouchableOpacity>
                    </View>

                    {/* Nível */}
                    <View style={styles.registoNivelRow}>
                      <View style={[styles.nivelPill, { backgroundColor: nInfo.cor + '22', borderColor: nInfo.cor }]}>
                        <Ionicons name={nInfo.icone as any} size={13} color={nInfo.cor} />
                        <Text style={[styles.nivelPillText, { color: nInfo.cor }]}>{nInfo.label}</Text>
                      </View>
                    </View>

                    {/* Descrição / Observação */}
                    {!!r.descricao && (
                      <Text style={styles.registoDesc}>"{r.descricao}"</Text>
                    )}
                  </View>
                );
              }}
            />
          )}
        </View>
      )}

      {/* ── Modal: Novo / Editar Registo ──────────────────────────────────────── */}
      <Modal visible={showModal} transparent animationType="slide" onRequestClose={() => setShowModal(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalBox}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>{editando ? 'Editar Registo' : 'Novo Registo Formativo'}</Text>
                <TouchableOpacity onPress={() => setShowModal(false)}>
                  <Ionicons name="close" size={22} color={Colors.textSecondary} />
                </TouchableOpacity>
              </View>

              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 14 }}>

                {/* Categoria */}
                <View>
                  <Text style={styles.fieldLabel}>Categoria</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
                    {CATEGORIAS.map(c => (
                      <TouchableOpacity
                        key={c.key}
                        style={[styles.catChip, { borderColor: c.cor }, formCategoria === c.key && { backgroundColor: c.cor }]}
                        onPress={() => setFormCategoria(c.key)}
                        activeOpacity={0.8}
                      >
                        <Ionicons name={c.icone as any} size={14} color={formCategoria === c.key ? '#fff' : c.cor} />
                        <Text style={[styles.catChipText, { color: formCategoria === c.key ? '#fff' : c.cor }]}>{c.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>

                {/* Nível */}
                <View>
                  <Text style={styles.fieldLabel}>Nível de Desempenho</Text>
                  <View style={styles.nivelGrid}>
                    {NIVEIS.map(n => (
                      <TouchableOpacity
                        key={n.key}
                        style={[styles.nivelOpt, { borderColor: n.cor }, formNivel === n.key && { backgroundColor: n.cor }]}
                        onPress={() => setFormNivel(n.key)}
                        activeOpacity={0.8}
                      >
                        <Ionicons name={n.icone as any} size={16} color={formNivel === n.key ? '#fff' : n.cor} />
                        <Text style={[styles.nivelOptText, { color: formNivel === n.key ? '#fff' : n.cor }]}>{n.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <Text style={styles.nivelDesc}>{nivelInfo(formNivel).desc}</Text>
                </View>

                {/* Data */}
                <View>
                  <Text style={styles.fieldLabel}>Data da Observação</Text>
                  <TextInput
                    style={styles.input}
                    value={formData}
                    onChangeText={setFormData}
                    placeholder="AAAA-MM-DD"
                    placeholderTextColor={Colors.textMuted}
                    keyboardType="numeric"
                    maxLength={10}
                  />
                </View>

                {/* Observação / Descrição */}
                <View>
                  <Text style={styles.fieldLabel}>Observação / Feedback (opcional)</Text>
                  <TextInput
                    style={[styles.input, styles.inputMulti]}
                    value={formDescricao}
                    onChangeText={setFormDescricao}
                    placeholder="Ex: O aluno demonstrou grande empenho na resolução dos exercícios. Participou activamente na discussão..."
                    placeholderTextColor={Colors.textMuted}
                    multiline
                    numberOfLines={4}
                  />
                </View>

                {/* Botão Guardar */}
                <TouchableOpacity
                  style={[styles.saveBtn, saving && { opacity: 0.6 }]}
                  onPress={guardarRegisto}
                  disabled={saving}
                >
                  {saving
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <><Ionicons name="checkmark-circle" size={18} color="#fff" /><Text style={styles.saveBtnText}>{editando ? 'Actualizar' : 'Guardar Registo'}</Text></>
                  }
                </TouchableOpacity>
              </ScrollView>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

// ─── Estilos ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  scroll: { flex: 1 },

  breadcrumb: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 16, paddingVertical: 10,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  bcItem: { paddingHorizontal: 4 },
  bcText: { fontSize: 12, color: Colors.textMuted, fontFamily: 'Inter_400Regular' },
  bcActive: { color: '#22c55e', fontFamily: 'Inter_600SemiBold' },

  infoCard: {
    flexDirection: 'row', gap: 10, alignItems: 'flex-start',
    backgroundColor: '#dcfce7', borderRadius: 10, padding: 12,
    marginHorizontal: 16, marginTop: 14,
  },
  infoText: { flex: 1, fontSize: 12, color: '#14532d', fontFamily: 'Inter_400Regular', lineHeight: 18 },

  sectionLabel: {
    fontSize: 11, fontFamily: 'Inter_600SemiBold', color: Colors.textMuted,
    letterSpacing: 1, marginTop: 18, marginBottom: 8, marginHorizontal: 16,
  },
  empty: { textAlign: 'center', color: Colors.textMuted, fontFamily: 'Inter_400Regular', marginTop: 32, fontSize: 14 },

  listCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: Colors.surface, marginHorizontal: 16, marginBottom: 8,
    borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: Colors.border,
  },
  listIcon: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  listTitle: { fontSize: 14, fontFamily: 'Inter_600SemiBold', color: Colors.text },
  listSub: { fontSize: 12, color: Colors.textSecondary, fontFamily: 'Inter_400Regular', marginTop: 2 },

  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 6 },
  backText: { fontSize: 13, color: Colors.textSecondary, fontFamily: 'Inter_400Regular' },

  regHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 12, paddingVertical: 10,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  regTitle: { fontSize: 14, fontFamily: 'Inter_700Bold', color: Colors.text },
  regSub: { fontSize: 11, color: Colors.textSecondary, fontFamily: 'Inter_400Regular' },

  addBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#22c55e', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7,
  },
  addBtnText: { color: '#fff', fontFamily: 'Inter_600SemiBold', fontSize: 13 },

  legendScroll: { maxHeight: 38, backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border },
  legendContent: { paddingHorizontal: 12, paddingVertical: 6, gap: 8, alignItems: 'center' },
  legendItem: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderWidth: 1, borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3,
  },
  legendLabel: { fontSize: 11, fontFamily: 'Inter_500Medium' },

  // Aluno card (lista resumo)
  alunoCard: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 14, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  alunoNum: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: Colors.border, alignItems: 'center', justifyContent: 'center',
  },
  alunoNumText: { fontSize: 12, color: Colors.textSecondary, fontFamily: 'Inter_600SemiBold' },
  alunoNome: { fontSize: 14, fontFamily: 'Inter_600SemiBold', color: Colors.text },
  alunoSub: { fontSize: 11, color: Colors.textMuted, fontFamily: 'Inter_400Regular', marginTop: 2 },

  totalBadge: {
    borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3, minWidth: 48, alignItems: 'center',
  },
  totalBadgeText: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },

  nivelPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderRadius: 12, paddingHorizontal: 8, paddingVertical: 3,
    borderWidth: 1,
  },
  nivelPillText: { fontSize: 11, fontFamily: 'Inter_500Medium' },

  // Estado vazio
  emptyState: {
    flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12,
  },
  emptyStateTitle: { fontSize: 16, fontFamily: 'Inter_700Bold', color: Colors.text },
  emptyStateSub: { fontSize: 13, color: Colors.textSecondary, fontFamily: 'Inter_400Regular', textAlign: 'center', lineHeight: 20 },
  emptyBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#22c55e', borderRadius: 10, paddingHorizontal: 20, paddingVertical: 12, marginTop: 8,
  },
  emptyBtnText: { color: '#fff', fontFamily: 'Inter_600SemiBold', fontSize: 14 },

  // Registo card
  registoCard: {
    backgroundColor: Colors.surface, borderRadius: 12, padding: 14,
    marginBottom: 10, borderWidth: 1, borderColor: Colors.border, gap: 8,
  },
  registoTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  catBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, flex: 1,
  },
  catLabel: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  registoData: { fontSize: 11, color: Colors.textMuted, fontFamily: 'Inter_400Regular' },
  registoAcao: { padding: 4 },
  registoNivelRow: { flexDirection: 'row' },
  registoDesc: {
    fontSize: 13, color: Colors.textSecondary, fontFamily: 'Inter_400Regular',
    fontStyle: 'italic', lineHeight: 19,
    borderLeftWidth: 3, borderLeftColor: Colors.border, paddingLeft: 10,
  },

  // Modal
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalBox: {
    backgroundColor: Colors.background, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 20, maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16,
  },
  modalTitle: { fontSize: 16, fontFamily: 'Inter_700Bold', color: Colors.text },

  fieldLabel: {
    fontSize: 12, fontFamily: 'Inter_600SemiBold', color: Colors.textSecondary,
    marginBottom: 6, letterSpacing: 0.5,
  },

  catChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderWidth: 1.5, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5,
  },
  catChipText: { fontSize: 12, fontFamily: 'Inter_500Medium' },

  nivelGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  nivelOpt: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderWidth: 1.5, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8,
    minWidth: '47%',
  },
  nivelOptText: { fontSize: 13, fontFamily: 'Inter_500Medium' },
  nivelDesc: {
    fontSize: 11, color: Colors.textMuted, fontFamily: 'Inter_400Regular',
    fontStyle: 'italic', lineHeight: 16, marginTop: 6,
  },

  input: {
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border,
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10,
    fontSize: 14, color: Colors.text, fontFamily: 'Inter_400Regular',
  },
  inputMulti: { height: 100, textAlignVertical: 'top', paddingTop: 10 },

  saveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#22c55e', borderRadius: 12, paddingVertical: 14, marginTop: 4,
  },
  saveBtnText: { color: '#fff', fontFamily: 'Inter_700Bold', fontSize: 15 },

  // Paginação
  paginacao: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 4, paddingVertical: 16, paddingHorizontal: 16, flexWrap: 'wrap',
  },
  pgBtn: {
    minWidth: 32, height: 32, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8,
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border,
  },
  pgBtnActive: { backgroundColor: '#22c55e', borderColor: '#22c55e' },
  pgBtnDisabled: { opacity: 0.35 },
  pgBtnText: { fontSize: 13, fontFamily: 'Inter_500Medium', color: Colors.text },
  pgBtnTextActive: { color: '#fff', fontFamily: 'Inter_700Bold' },
  pgEllipsis: { fontSize: 13, color: Colors.textMuted, paddingHorizontal: 2, alignSelf: 'center' },
  pgInfo: { fontSize: 12, color: Colors.textMuted, fontFamily: 'Inter_400Regular', marginLeft: 8 },
});
