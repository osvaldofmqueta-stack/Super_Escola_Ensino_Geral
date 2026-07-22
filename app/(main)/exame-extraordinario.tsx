import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Modal, ActivityIndicator, RefreshControl, Alert,
  Platform, Dimensions,
} from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '@/constants/colors';
import { useAuth } from '@/context/AuthContext';
import TopBar from '@/components/TopBar';
import { getApiBase } from '@/lib/server-config';

const { width } = Dimensions.get('window');
const isWide = width >= 768;

// ─── Tipos ──────────────────────────────────────────────────────────────────
interface ExameExtraordinario {
  id: string;
  alunoId: string;
  alunoNome: string;
  alunoNumeroMatricula: string;
  turmaIdOrigem: string;
  turmaNomeOrigem: string;
  turmaIdAtual?: string;
  turmaNomeAtual?: string;
  disciplina: string;
  anoLetivoOrigem: string;
  anoLetivoAtual: string;
  trimestre: number;
  nota?: number;
  notaAnterior?: number;
  resultado: 'pendente' | 'aprovado' | 'reprovado';
  status: 'pendente' | 'realizado' | 'cancelado';
  dataExame?: string;
  professorNome?: string;
  observacoes?: string;
  createdAt: string;
}

interface AlunoCondicional {
  id: string;
  nome: string;
  apelido: string;
  numeroMatricula: string;
  turmaId?: string;
  turmaNome?: string;
  classe?: string;
  anoLetivo?: string;
  disciplinasCondicionais: Array<{
    disciplina: string;
    anoLetivoOrigem: string;
    turmaIdOrigem: string;
    notaAnterior?: number;
  }>;
}

interface Estatisticas {
  pendentes: string;
  realizados: string;
  aprovados: string;
  reprovados: string;
  cancelados: string;
  alunosCondicionais: string;
  porDisciplina: Array<{
    disciplina: string;
    total: string;
    aprovados: string;
    reprovados: string;
    pendentes: string;
  }>;
  porTrimestre: Array<{
    trimestre: number;
    total: string;
    aprovados: string;
    reprovados: string;
  }>;
}

// ─── Helpers ────────────────────────────────────────────────────────────────
function getToken(): string | null {
  try {
    if (typeof localStorage !== 'undefined') return localStorage.getItem('@siga_token');
  } catch {}
  return null;
}

async function apiFetch(path: string, opts?: RequestInit) {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(opts?.headers as Record<string, string> ?? {}),
  };
  const res = await fetch(`${getApiBase()}${path}`, { ...opts, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Erro ${res.status}`);
  return data;
}

function ResultadoBadge({ resultado }: { resultado: string }) {
  const cfg: Record<string, { color: string; label: string; icon: string }> = {
    aprovado:  { color: Colors.success,  label: 'Aprovado',  icon: 'checkmark-circle' },
    reprovado: { color: Colors.danger,   label: 'Reprovado', icon: 'close-circle'     },
    pendente:  { color: Colors.warning,  label: 'Pendente',  icon: 'time-outline'     },
  };
  const c = cfg[resultado] ?? cfg.pendente;
  return (
    <View style={[styles.badge, { backgroundColor: c.color + '22' }]}>
      <Ionicons name={c.icon as any} size={12} color={c.color} />
      <Text style={[styles.badgeText, { color: c.color }]}>{c.label}</Text>
    </View>
  );
}

// ─── Modal de Novo Exame ─────────────────────────────────────────────────────
function ModalNovoExame({
  visible, onClose, onSaved,
}: { visible: boolean; onClose: () => void; onSaved: () => void }) {
  const [loading, setLoading] = useState(false);
  const [alunos, setAlunos] = useState<{ id: string; nome: string; apelido: string; numeroMatricula: string; turmaId?: string; turmaNome?: string }[]>([]);
  const [turmas, setTurmas] = useState<{ id: string; nome: string; classe: string; anoLetivo: string }[]>([]);
  const [form, setForm] = useState({
    alunoId: '', turmaIdOrigem: '', disciplina: '',
    anoLetivoOrigem: '', anoLetivoAtual: '',
    notaAnterior: '', dataExame: '', observacoes: '',
  });

  useEffect(() => {
    if (!visible) return;
    Promise.all([
      apiFetch('/api/alunos'),
      apiFetch('/api/turmas'),
    ]).then(([a, t]) => {
      setAlunos(Array.isArray(a) ? a : []);
      setTurmas(Array.isArray(t) ? t : []);
    }).catch(() => {});
  }, [visible]);

  async function handleSave() {
    if (!form.alunoId || !form.disciplina || !form.anoLetivoOrigem || !form.anoLetivoAtual || !form.turmaIdOrigem) {
      Alert.alert('Campos obrigatórios', 'Preencha todos os campos obrigatórios.');
      return;
    }
    setLoading(true);
    try {
      await apiFetch('/api/exames-extraordinarios', {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          notaAnterior: form.notaAnterior ? Number(form.notaAnterior) : null,
        }),
      });
      onSaved();
      onClose();
      setForm({ alunoId: '', turmaIdOrigem: '', disciplina: '', anoLetivoOrigem: '', anoLetivoAtual: '', notaAnterior: '', dataExame: '', observacoes: '' });
    } catch (e: any) {
      Alert.alert('Erro', e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalBox}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Novo Exame Extraordinário</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={22} color={Colors.textMuted} />
            </TouchableOpacity>
          </View>
          <ScrollView showsVerticalScrollIndicator={false}>
            <Text style={styles.fieldLabel}>Aluno *</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.selectScrollWrap}>
              <View style={styles.selectChips}>
                {alunos.slice(0, 100).map(a => (
                  <TouchableOpacity
                    key={a.id}
                    style={[styles.chip, form.alunoId === a.id && styles.chipActive]}
                    onPress={() => setForm(f => ({ ...f, alunoId: a.id }))}
                  >
                    <Text style={[styles.chipText, form.alunoId === a.id && styles.chipTextActive]}>
                      {a.nome} {a.apelido} · {a.numeroMatricula}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            <Text style={styles.fieldLabel}>Turma de Origem *</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.selectScrollWrap}>
              <View style={styles.selectChips}>
                {turmas.map(t => (
                  <TouchableOpacity
                    key={t.id}
                    style={[styles.chip, form.turmaIdOrigem === t.id && styles.chipActive]}
                    onPress={() => setForm(f => ({ ...f, turmaIdOrigem: t.id }))}
                  >
                    <Text style={[styles.chipText, form.turmaIdOrigem === t.id && styles.chipTextActive]}>
                      {t.nome} · {t.anoLetivo}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            <Text style={styles.fieldLabel}>Disciplina com Negativa *</Text>
            <TextInput
              style={styles.input}
              placeholder="Ex: Matemática"
              placeholderTextColor={Colors.textMuted}
              value={form.disciplina}
              onChangeText={v => setForm(f => ({ ...f, disciplina: v }))}
            />

            <View style={styles.row2}>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>Ano Letivo Origem *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Ex: 2024/2025"
                  placeholderTextColor={Colors.textMuted}
                  value={form.anoLetivoOrigem}
                  onChangeText={v => setForm(f => ({ ...f, anoLetivoOrigem: v }))}
                />
              </View>
              <View style={{ width: 12 }} />
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>Ano Letivo Actual *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Ex: 2025/2026"
                  placeholderTextColor={Colors.textMuted}
                  value={form.anoLetivoAtual}
                  onChangeText={v => setForm(f => ({ ...f, anoLetivoAtual: v }))}
                />
              </View>
            </View>

            <View style={styles.row2}>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>Nota Anterior (0-20)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Ex: 7"
                  placeholderTextColor={Colors.textMuted}
                  keyboardType="numeric"
                  value={form.notaAnterior}
                  onChangeText={v => setForm(f => ({ ...f, notaAnterior: v }))}
                />
              </View>
              <View style={{ width: 12 }} />
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>Data Prevista do Exame</Text>
                <TextInput
                  style={styles.input}
                  placeholder="AAAA-MM-DD"
                  placeholderTextColor={Colors.textMuted}
                  value={form.dataExame}
                  onChangeText={v => setForm(f => ({ ...f, dataExame: v }))}
                />
              </View>
            </View>

            <Text style={styles.fieldLabel}>Observações</Text>
            <TextInput
              style={[styles.input, { height: 72, textAlignVertical: 'top' }]}
              placeholder="Notas adicionais..."
              placeholderTextColor={Colors.textMuted}
              multiline
              value={form.observacoes}
              onChangeText={v => setForm(f => ({ ...f, observacoes: v }))}
            />

            <TouchableOpacity style={styles.btnPrimary} onPress={handleSave} disabled={loading}>
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnPrimaryText}>Registar Exame</Text>}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ─── Modal de Resultado ──────────────────────────────────────────────────────
function ModalResultado({
  exame, visible, onClose, onSaved,
}: { exame: ExameExtraordinario | null; visible: boolean; onClose: () => void; onSaved: () => void }) {
  const [nota, setNota] = useState('');
  const [dataExame, setDataExame] = useState('');
  const [observacoes, setObservacoes] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (exame) {
      setNota(exame.nota != null ? String(exame.nota) : '');
      setDataExame(exame.dataExame ?? '');
      setObservacoes(exame.observacoes ?? '');
    }
  }, [exame]);

  async function handleSave() {
    const n = Number(nota);
    if (isNaN(n) || n < 0 || n > 20) {
      Alert.alert('Nota inválida', 'A nota deve ser entre 0 e 20.');
      return;
    }
    setLoading(true);
    try {
      const res = await apiFetch(`/api/exames-extraordinarios/${exame!.id}/registar-resultado`, {
        method: 'POST',
        body: JSON.stringify({ nota: n, dataExame, observacoes }),
      });
      const msg = res.resultado === 'aprovado'
        ? `✅ Aprovado com ${n} valores! A matrícula condicional foi levantada para esta disciplina.`
        : `❌ Reprovado com ${n} valores (mínimo: ${res.notaMinima}). O aluno mantém matrícula condicional.`;
      Alert.alert('Resultado registado', msg);
      onSaved();
      onClose();
    } catch (e: any) {
      Alert.alert('Erro', e.message);
    } finally {
      setLoading(false);
    }
  }

  if (!exame) return null;
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={[styles.modalBox, { maxHeight: 480 }]}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Registar Resultado</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={22} color={Colors.textMuted} />
            </TouchableOpacity>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Aluno:</Text>
            <Text style={styles.infoValue}>{exame.alunoNome}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Disciplina:</Text>
            <Text style={styles.infoValue}>{exame.disciplina}</Text>
          </View>
          {exame.notaAnterior != null && (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Nota anterior:</Text>
              <Text style={[styles.infoValue, { color: Colors.danger }]}>{exame.notaAnterior} valores</Text>
            </View>
          )}

          <Text style={styles.fieldLabel}>Nota do Exame Extraordinário (0–20) *</Text>
          <TextInput
            style={[styles.input, { fontSize: 22, textAlign: 'center', fontWeight: '700' }]}
            placeholder="0"
            placeholderTextColor={Colors.textMuted}
            keyboardType="numeric"
            value={nota}
            onChangeText={setNota}
          />

          <Text style={styles.fieldLabel}>Data de Realização</Text>
          <TextInput
            style={styles.input}
            placeholder="AAAA-MM-DD"
            placeholderTextColor={Colors.textMuted}
            value={dataExame}
            onChangeText={setDataExame}
          />

          <Text style={styles.fieldLabel}>Observações</Text>
          <TextInput
            style={[styles.input, { height: 60, textAlignVertical: 'top' }]}
            placeholder="Observações..."
            placeholderTextColor={Colors.textMuted}
            multiline
            value={observacoes}
            onChangeText={setObservacoes}
          />

          <TouchableOpacity style={styles.btnPrimary} onPress={handleSave} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnPrimaryText}>Confirmar Resultado</Text>}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ─── Ecrã Principal ──────────────────────────────────────────────────────────
export default function ExameExtraordinarioScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const [tab, setTab] = useState<'exames' | 'condicionais' | 'estatisticas'>('exames');
  const [exames, setExames] = useState<ExameExtraordinario[]>([]);
  const [condicionais, setCondicionais] = useState<AlunoCondicional[]>([]);
  const [stats, setStats] = useState<Estatisticas | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [filtroResultado, setFiltroResultado] = useState<'todos' | 'pendente' | 'aprovado' | 'reprovado'>('todos');
  const [search, setSearch] = useState('');
  const [modalNovoVisible, setModalNovoVisible] = useState(false);
  const [modalResultado, setModalResultado] = useState<ExameExtraordinario | null>(null);

  const canEdit = user && ['ceo', 'pca', 'admin', 'director', 'pedagogico', 'chefe_secretaria', 'secretaria'].includes(user.role);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const [ex, cond, st] = await Promise.all([
        apiFetch('/api/exames-extraordinarios'),
        apiFetch('/api/exames-extraordinarios/alunos-condicionais'),
        apiFetch('/api/exames-extraordinarios/estatisticas'),
      ]);
      setExames(Array.isArray(ex) ? ex : []);
      setCondicionais(Array.isArray(cond) ? cond : []);
      setStats(st);
    } catch (e: any) {
      if (!quiet) Alert.alert('Erro', e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const onRefresh = useCallback(() => { setRefreshing(true); load(true); }, [load]);

  const examesFiltrados = exames.filter(e => {
    const matchResultado = filtroResultado === 'todos' || e.resultado === filtroResultado;
    const q = search.toLowerCase();
    const matchSearch = !q || e.alunoNome.toLowerCase().includes(q) || e.disciplina.toLowerCase().includes(q);
    return matchResultado && matchSearch;
  });

  const condicionaisFiltrados = condicionais.filter(a => {
    const q = search.toLowerCase();
    return !q || `${a.nome} ${a.apelido}`.toLowerCase().includes(q);
  });

  async function handleRemoverCondicional(alunoId: string, nome: string) {
    Alert.alert(
      'Remover matrícula condicional',
      `Tem a certeza que pretende remover a matrícula condicional de ${nome}?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Remover', style: 'destructive',
          onPress: async () => {
            try {
              await apiFetch(`/api/alunos/${alunoId}/marcar-condicional`, {
                method: 'PATCH',
                body: JSON.stringify({ matriculaCondicional: false }),
              });
              load(true);
            } catch (e: any) { Alert.alert('Erro', e.message); }
          },
        },
      ]
    );
  }

  async function handleEliminarExame(id: string) {
    if (!['ceo', 'pca', 'admin'].includes(user?.role ?? '')) return;
    Alert.alert('Eliminar exame', 'Confirma a eliminação deste registo?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar', style: 'destructive',
        onPress: async () => {
          try {
            await apiFetch(`/api/exames-extraordinarios/${id}`, { method: 'DELETE' });
            load(true);
          } catch (e: any) { Alert.alert('Erro', e.message); }
        },
      },
    ]);
  }

  // ── Render Tab: Exames ────────────────────────────────────────────────────
  function renderTabExames() {
    return (
      <>
        {/* Filtros */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow}>
          {(['todos', 'pendente', 'aprovado', 'reprovado'] as const).map(f => (
            <TouchableOpacity
              key={f}
              style={[styles.filterChip, filtroResultado === f && styles.filterChipActive]}
              onPress={() => setFiltroResultado(f)}
            >
              <Text style={[styles.filterChipText, filtroResultado === f && styles.filterChipTextActive]}>
                {f === 'todos' ? 'Todos' : f.charAt(0).toUpperCase() + f.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {loading ? (
          <View style={styles.centered}><ActivityIndicator color={Colors.accent} size="large" /></View>
        ) : examesFiltrados.length === 0 ? (
          <View style={styles.emptyWrap}>
            <MaterialCommunityIcons name="clipboard-text-off-outline" size={48} color={Colors.textMuted} />
            <Text style={styles.emptyText}>Nenhum exame extraordinário registado</Text>
            {canEdit && (
              <TouchableOpacity style={styles.btnOutline} onPress={() => setModalNovoVisible(true)}>
                <Text style={styles.btnOutlineText}>Registar primeiro exame</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <View style={styles.cardsList}>
            {examesFiltrados.map(e => (
              <View key={e.id} style={styles.exameCard}>
                <View style={styles.exameCardTop}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.exameNome}>{e.alunoNome}</Text>
                    <Text style={styles.exameMatricula}>nº {e.alunoNumeroMatricula}</Text>
                  </View>
                  <ResultadoBadge resultado={e.resultado} />
                </View>

                <View style={styles.exameInfo}>
                  <View style={styles.exameInfoItem}>
                    <Ionicons name="book-outline" size={13} color={Colors.textMuted} />
                    <Text style={styles.exameInfoText}>{e.disciplina}</Text>
                  </View>
                  <View style={styles.exameInfoItem}>
                    <Ionicons name="school-outline" size={13} color={Colors.textMuted} />
                    <Text style={styles.exameInfoText}>{e.turmaNomeOrigem} → {e.turmaNomeAtual ?? '—'}</Text>
                  </View>
                  <View style={styles.exameInfoItem}>
                    <Ionicons name="calendar-outline" size={13} color={Colors.textMuted} />
                    <Text style={styles.exameInfoText}>{e.anoLetivoOrigem} → {e.anoLetivoAtual}</Text>
                  </View>
                  {e.notaAnterior != null && (
                    <View style={styles.exameInfoItem}>
                      <Ionicons name="trending-down-outline" size={13} color={Colors.danger} />
                      <Text style={[styles.exameInfoText, { color: Colors.danger }]}>
                        Nota anterior: {e.notaAnterior} val.
                      </Text>
                    </View>
                  )}
                  {e.nota != null && (
                    <View style={styles.exameInfoItem}>
                      <Ionicons name="checkmark-done-outline" size={13} color={e.resultado === 'aprovado' ? Colors.success : Colors.danger} />
                      <Text style={[styles.exameInfoText, { color: e.resultado === 'aprovado' ? Colors.success : Colors.danger }]}>
                        Nota exame: {e.nota} val. · {e.dataExame ?? ''}
                      </Text>
                    </View>
                  )}
                </View>

                {canEdit && e.status === 'pendente' && (
                  <View style={styles.exameActions}>
                    <TouchableOpacity
                      style={styles.btnAction}
                      onPress={() => setModalResultado(e)}
                    >
                      <Ionicons name="pencil-outline" size={14} color={Colors.accent} />
                      <Text style={styles.btnActionText}>Lançar Resultado</Text>
                    </TouchableOpacity>
                    {['ceo', 'pca', 'admin'].includes(user?.role ?? '') && (
                      <TouchableOpacity
                        style={[styles.btnAction, { marginLeft: 8, borderColor: Colors.danger + '44' }]}
                        onPress={() => handleEliminarExame(e.id)}
                      >
                        <Ionicons name="trash-outline" size={14} color={Colors.danger} />
                      </TouchableOpacity>
                    )}
                  </View>
                )}
              </View>
            ))}
          </View>
        )}
      </>
    );
  }

  // ── Render Tab: Condicionais ──────────────────────────────────────────────
  function renderTabCondicionais() {
    return (
      <>
        {condicionaisFiltrados.length === 0 ? (
          <View style={styles.emptyWrap}>
            <MaterialCommunityIcons name="account-check-outline" size={48} color={Colors.textMuted} />
            <Text style={styles.emptyText}>Nenhum aluno com matrícula condicional</Text>
          </View>
        ) : (
          <View style={styles.cardsList}>
            {condicionaisFiltrados.map(a => (
              <View key={a.id} style={styles.condCard}>
                <View style={styles.condCardTop}>
                  <View style={[styles.condAvatar, { backgroundColor: Colors.warning + '33' }]}>
                    <Ionicons name="person-outline" size={20} color={Colors.warning} />
                  </View>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={styles.condNome}>{a.nome} {a.apelido}</Text>
                    <Text style={styles.condMatricula}>Nº {a.numeroMatricula} · {a.turmaNome ?? '—'}</Text>
                  </View>
                  <View style={styles.condBadge}>
                    <Ionicons name="warning-outline" size={12} color={Colors.warning} />
                    <Text style={styles.condBadgeText}>Condicional</Text>
                  </View>
                </View>

                {(a.disciplinasCondicionais ?? []).length > 0 && (
                  <View style={styles.discList}>
                    <Text style={styles.discListLabel}>Disciplinas pendentes:</Text>
                    {(a.disciplinasCondicionais ?? []).map((d, i) => (
                      <View key={i} style={styles.discItem}>
                        <Ionicons name="alert-circle-outline" size={13} color={Colors.danger} />
                        <Text style={styles.discItemText}>
                          {d.disciplina}
                          {d.notaAnterior != null ? ` (${d.notaAnterior} val.)` : ''}
                          {' '}· {d.anoLetivoOrigem}
                        </Text>
                      </View>
                    ))}
                  </View>
                )}

                {canEdit && (
                  <View style={styles.exameActions}>
                    <TouchableOpacity
                      style={styles.btnAction}
                      onPress={() => {
                        setTab('exames');
                        setModalNovoVisible(true);
                      }}
                    >
                      <Ionicons name="add-circle-outline" size={14} color={Colors.accent} />
                      <Text style={styles.btnActionText}>Criar Exame</Text>
                    </TouchableOpacity>
                    {['ceo', 'pca', 'admin', 'director'].includes(user?.role ?? '') && (
                      <TouchableOpacity
                        style={[styles.btnAction, { marginLeft: 8, borderColor: Colors.danger + '44' }]}
                        onPress={() => handleRemoverCondicional(a.id, `${a.nome} ${a.apelido}`)}
                      >
                        <Ionicons name="close-circle-outline" size={14} color={Colors.danger} />
                        <Text style={[styles.btnActionText, { color: Colors.danger }]}>Remover Condicional</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}
              </View>
            ))}
          </View>
        )}
      </>
    );
  }

  // ── Render Tab: Estatísticas ──────────────────────────────────────────────
  function renderTabEstatisticas() {
    const cond   = parseInt(stats?.alunosCondicionais ?? '0') || 0;
    const pend   = parseInt(stats?.pendentes  ?? '0') || 0;
    const real   = parseInt(stats?.realizados ?? '0') || 0;
    const aprov  = parseInt(stats?.aprovados  ?? '0') || 0;
    const reprov = parseInt(stats?.reprovados ?? '0') || 0;
    const canc   = parseInt(stats?.cancelados ?? '0') || 0;
    const totalExames = pend + real;
    const taxaAprov = real  > 0 ? Math.round((aprov / real)  * 100) : 0;
    const taxaExec  = totalExames > 0 ? Math.round((real / totalExames) * 100) : 0;
    const taxaReprov = real > 0 ? Math.round((reprov / real) * 100) : 0;

    const porDisciplina = stats?.porDisciplina ?? [];
    const porTrimestre  = stats?.porTrimestre  ?? [];

    // ── Donut SVG ────────────────────────────────────────────────────────────
    const R = 60; const SW = 18;
    const center = R + SW; const svgSize = center * 2;
    const C = 2 * Math.PI * R;

    const segs = [
      { value: aprov,  color: Colors.success, label: 'Aprovados'  },
      { value: reprov, color: Colors.danger,  label: 'Reprovados' },
      { value: pend,   color: Colors.info,    label: 'Pendentes'  },
    ];
    const segTotal = segs.reduce((s, x) => s + x.value, 0);

    let accumulated = 0;
    const arcs = segs.map(seg => {
      const frac = segTotal > 0 ? seg.value / segTotal : 0;
      const dashLen = frac * C;
      const offset  = C / 4 - accumulated * C;
      accumulated += frac;
      return { ...seg, dasharray: `${dashLen} ${C}`, dashoffset: offset };
    });

    if (loading) {
      return (
        <View style={st.loadingWrap}>
          <ActivityIndicator color={Colors.accent} size="large" />
          <Text style={st.loadingText}>A carregar estatísticas…</Text>
        </View>
      );
    }

    return (
      <View style={styles.statsGrid}>

        {/* ── KPI strip ────────────────────────────────────────── */}
        <View style={st.kpiRow}>
          {[
            { label: 'Condicionais', value: cond,   color: Colors.warning, icon: 'alert-circle-outline' },
            { label: 'Pendentes',    value: pend,   color: Colors.info,    icon: 'time-outline'         },
            { label: 'Realizados',   value: real,   color: Colors.accent,  icon: 'checkmark-done-outline' },
            { label: 'Aprovados',    value: aprov,  color: Colors.success, icon: 'trophy-outline'       },
            { label: 'Reprovados',   value: reprov, color: Colors.danger,  icon: 'close-circle-outline' },
          ].map((k, i) => (
            <View key={i} style={[st.kpi, { borderTopColor: k.color }]}>
              <Ionicons name={k.icon as any} size={18} color={k.color} />
              <Text style={[st.kpiVal, { color: k.color }]}>{k.value}</Text>
              <Text style={st.kpiLabel}>{k.label}</Text>
            </View>
          ))}
        </View>

        {/* ── Taxas de resumo rápido ───────────────────────────── */}
        <View style={st.taxasRow}>
          {[
            { label: 'Taxa de Execução',  value: taxaExec,  icon: 'pulse-outline'    },
            { label: 'Taxa de Aprovação', value: taxaAprov, icon: 'trending-up-outline' },
            { label: 'Taxa de Reprovação',value: taxaReprov,icon: 'trending-down-outline' },
          ].map((t, i) => {
            const isReprov = i === 2;
            const cor = isReprov
              ? (t.value <= 20 ? Colors.success : t.value <= 40 ? Colors.warning : Colors.danger)
              : (t.value >= 70 ? Colors.success : t.value >= 40 ? Colors.warning : Colors.danger);
            return (
              <View key={i} style={[st.taxaBox, { borderColor: cor + '55', backgroundColor: cor + '12' }]}>
                <Ionicons name={t.icon as any} size={18} color={cor} style={{ marginBottom: 4 }} />
                <Text style={[st.taxaVal, { color: cor }]}>{t.value}%</Text>
                <Text style={st.taxaLabel}>{t.label}</Text>
              </View>
            );
          })}
        </View>

        {/* ── Charts row ───────────────────────────────────────── */}
        <View style={[st.chartsRow, isWide && { flexDirection: 'row', gap: 12 }]}>

          {/* Donut — resultado dos exames */}
          <View style={[st.chartCard, isWide && { flex: 1 }]}>
            <Text style={st.chartTitle}>Resultado dos Exames</Text>
            <View style={st.donutWrap}>
              <Svg width={svgSize} height={svgSize}>
                <Circle cx={center} cy={center} r={R} fill="none" stroke={Colors.border} strokeWidth={SW} />
                {segTotal > 0 ? arcs.map((arc, i) => (
                  <Circle
                    key={i}
                    cx={center} cy={center} r={R}
                    fill="none"
                    stroke={arc.color}
                    strokeWidth={SW}
                    strokeDasharray={arc.dasharray}
                    strokeDashoffset={arc.dashoffset}
                    strokeLinecap="butt"
                  />
                )) : (
                  <Circle cx={center} cy={center} r={R} fill="none" stroke={Colors.textMuted + '33'} strokeWidth={SW} />
                )}
              </Svg>
              <View style={st.donutCenter} pointerEvents="none">
                <Text style={st.donutPct}>{taxaAprov}%</Text>
                <Text style={st.donutSub}>aprovação</Text>
              </View>
            </View>
            <View style={st.legend}>
              {segs.map((l, i) => (
                <View key={i} style={st.legendItem}>
                  <View style={[st.legendDot, { backgroundColor: l.color }]} />
                  <Text style={st.legendText}>{l.label}</Text>
                  <Text style={[st.legendVal, { color: l.color }]}>{l.value}</Text>
                  {segTotal > 0 && (
                    <Text style={st.legendPct}>
                      {Math.round((l.value / segTotal) * 100)}%
                    </Text>
                  )}
                </View>
              ))}
              {canc > 0 && (
                <View style={st.legendItem}>
                  <View style={[st.legendDot, { backgroundColor: Colors.textMuted }]} />
                  <Text style={st.legendText}>Cancelados</Text>
                  <Text style={[st.legendVal, { color: Colors.textMuted }]}>{canc}</Text>
                </View>
              )}
            </View>
          </View>

          {/* Funil de execução */}
          <View style={[st.chartCard, isWide && { flex: 1 }]}>
            <Text style={st.chartTitle}>Funil de Execução</Text>
            <View style={{ gap: 16, marginTop: 4 }}>
              {[
                { label: 'Alunos condicionais', value: cond,  base: cond,              color: Colors.warning },
                { label: 'Exames realizados',   value: real,  base: totalExames || 1,  color: Colors.accent  },
                { label: 'Aprovados',           value: aprov, base: real || 1,         color: Colors.success },
                { label: 'Reprovados',          value: reprov,base: real || 1,         color: Colors.danger  },
              ].map((bar, i) => {
                const pct = bar.base > 0 ? Math.min(100, Math.round((bar.value / bar.base) * 100)) : 0;
                return (
                  <View key={i}>
                    <View style={st.barHeader}>
                      <Text style={st.barLabel}>{bar.label}</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={[st.barCount, { color: bar.color }]}>{bar.value}</Text>
                        <Text style={st.barPct}>{pct}%</Text>
                      </View>
                    </View>
                    <View style={st.barTrack}>
                      <View style={[st.barFill, { width: `${pct}%` as any, backgroundColor: bar.color }]} />
                    </View>
                  </View>
                );
              })}
            </View>
          </View>

        </View>

        {/* ── Por disciplina ───────────────────────────────────── */}
        {porDisciplina.length > 0 && (
          <View style={st.chartCard}>
            <Text style={st.chartTitle}>Resultados por Disciplina</Text>
            <View style={{ gap: 12, marginTop: 4 }}>
              {porDisciplina.map((d, i) => {
                const tot  = parseInt(d.total)     || 0;
                const apv  = parseInt(d.aprovados) || 0;
                const rpv  = parseInt(d.reprovados)|| 0;
                const pen  = parseInt(d.pendentes) || 0;
                const pctA = tot > 0 ? Math.round((apv / tot) * 100) : 0;
                const pctR = tot > 0 ? Math.round((rpv / tot) * 100) : 0;
                const pctP = tot > 0 ? Math.round((pen / tot) * 100) : 0;
                return (
                  <View key={i}>
                    <View style={st.barHeader}>
                      <Text style={[st.barLabel, { fontWeight: '600', flex: 1 }]} numberOfLines={1}>{d.disciplina}</Text>
                      <Text style={st.barCount}>{tot} exame{tot !== 1 ? 's' : ''}</Text>
                    </View>
                    {/* Barra empilhada */}
                    <View style={[st.barTrack, { height: 10, borderRadius: 5 }]}>
                      {apv > 0 && (
                        <View style={[st.barFill, { width: `${pctA}%` as any, backgroundColor: Colors.success, borderRadius: 0 }]} />
                      )}
                      {rpv > 0 && (
                        <View style={[st.barFill, { width: `${pctR}%` as any, backgroundColor: Colors.danger, borderRadius: 0 }]} />
                      )}
                      {pen > 0 && (
                        <View style={[st.barFill, { width: `${pctP}%` as any, backgroundColor: Colors.info, borderRadius: 0 }]} />
                      )}
                    </View>
                    <View style={{ flexDirection: 'row', gap: 10, marginTop: 3 }}>
                      {apv > 0 && <Text style={{ fontSize: 10, color: Colors.success }}>✓ {apv} aprov.</Text>}
                      {rpv > 0 && <Text style={{ fontSize: 10, color: Colors.danger  }}>✗ {rpv} reprov.</Text>}
                      {pen > 0 && <Text style={{ fontSize: 10, color: Colors.info    }}>⏱ {pen} pend.</Text>}
                    </View>
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {/* ── Por trimestre ────────────────────────────────────── */}
        {porTrimestre.length > 0 && (
          <View style={st.chartCard}>
            <Text style={st.chartTitle}>Distribuição por Trimestre</Text>
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
              {porTrimestre.map((t, i) => {
                const tot  = parseInt(t.total)     || 0;
                const apv  = parseInt(t.aprovados) || 0;
                const rpv  = parseInt(t.reprovados)|| 0;
                const taxa = tot > 0 ? Math.round((apv / tot) * 100) : 0;
                const cor  = taxa >= 70 ? Colors.success : taxa >= 40 ? Colors.warning : Colors.danger;
                return (
                  <View key={i} style={[st.trimCard, { borderTopColor: cor }]}>
                    <Text style={st.trimLabel}>{t.trimestre}º Trim.</Text>
                    <Text style={[st.trimVal, { color: Colors.text }]}>{tot}</Text>
                    <Text style={st.trimSub}>exame{tot !== 1 ? 's' : ''}</Text>
                    <View style={st.trimDivider} />
                    <Text style={[st.trimTaxa, { color: cor }]}>{taxa}%</Text>
                    <Text style={st.trimSub}>aprovação</Text>
                    <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 4, marginTop: 4 }}>
                      {apv > 0 && <Text style={{ fontSize: 9, color: Colors.success }}>✓{apv}</Text>}
                      {rpv > 0 && <Text style={{ fontSize: 9, color: Colors.danger  }}>✗{rpv}</Text>}
                    </View>
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {/* Info legal */}
        <View style={styles.infoBox}>
          <MaterialCommunityIcons name="information-outline" size={16} color={Colors.info} />
          <Text style={styles.infoBoxText}>
            Art. 23º §3 e §4 do Decreto do Ensino Geral: alunos não aprovados em disciplinas da 7.ª classe ficam inscritos de forma condicional na 8.ª classe e realizam Exame Extraordinário até ao final do 1.º trimestre do ano seguinte.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <TopBar title="Exame Extraordinário" onBack={() => router.back()} />

      {/* Barra de pesquisa + botão novo */}
      <View style={styles.searchRow}>
        <View style={styles.searchBox}>
          <Ionicons name="search-outline" size={16} color={Colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Pesquisar aluno ou disciplina..."
            placeholderTextColor={Colors.textMuted}
            value={search}
            onChangeText={setSearch}
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')}>
              <Ionicons name="close-circle" size={16} color={Colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>
        {canEdit && (
          <TouchableOpacity style={styles.btnAdd} onPress={() => setModalNovoVisible(true)}>
            <Ionicons name="add" size={20} color="#fff" />
          </TouchableOpacity>
        )}
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        {[
          { key: 'exames', label: 'Exames', icon: 'document-text-outline' },
          { key: 'condicionais', label: 'Condicionais', icon: 'warning-outline', badge: Number(stats?.alunosCondicionais ?? 0) },
          { key: 'estatisticas', label: 'Estatísticas', icon: 'bar-chart-outline' },
        ].map(t => (
          <TouchableOpacity
            key={t.key}
            style={[styles.tab, tab === t.key && styles.tabActive]}
            onPress={() => setTab(t.key as any)}
          >
            <Ionicons name={t.icon as any} size={15} color={tab === t.key ? Colors.accent : Colors.textMuted} />
            <Text style={[styles.tabText, tab === t.key && styles.tabTextActive]}>{t.label}</Text>
            {!!t.badge && t.badge > 0 && (
              <View style={styles.tabBadge}><Text style={styles.tabBadgeText}>{t.badge}</Text></View>
            )}
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.accent} />}
        showsVerticalScrollIndicator={false}
      >
        {tab === 'exames' && renderTabExames()}
        {tab === 'condicionais' && renderTabCondicionais()}
        {tab === 'estatisticas' && renderTabEstatisticas()}
      </ScrollView>

      <ModalNovoExame
        visible={modalNovoVisible}
        onClose={() => setModalNovoVisible(false)}
        onSaved={() => load(true)}
      />
      <ModalResultado
        exame={modalResultado}
        visible={!!modalResultado}
        onClose={() => setModalResultado(null)}
        onSaved={() => load(true)}
      />
    </View>
  );
}

// ─── Estilos ─────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  searchRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, gap: 10 },
  searchBox: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.backgroundCard, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, gap: 8, borderWidth: 1, borderColor: Colors.border },
  searchInput: { flex: 1, color: Colors.text, fontSize: 14 },
  btnAdd: { width: 40, height: 40, borderRadius: 10, backgroundColor: Colors.accent, alignItems: 'center', justifyContent: 'center' },

  tabs: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: Colors.border, marginHorizontal: 16 },
  tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 10 },
  tabActive: { borderBottomWidth: 2, borderBottomColor: Colors.accent },
  tabText: { fontSize: 12, color: Colors.textMuted },
  tabTextActive: { color: Colors.accent, fontWeight: '600' },
  tabBadge: { backgroundColor: Colors.warning, borderRadius: 8, minWidth: 16, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center' },
  tabBadgeText: { fontSize: 9, color: Colors.primaryDark, fontWeight: '800' },

  filterRow: { paddingHorizontal: 16, marginBottom: 12 },
  filterChip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: Colors.border, marginRight: 8, backgroundColor: Colors.backgroundCard },
  filterChipActive: { backgroundColor: Colors.accent + '22', borderColor: Colors.accent },
  filterChipText: { fontSize: 12, color: Colors.textMuted },
  filterChipTextActive: { color: Colors.accent, fontWeight: '600' },

  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60 },
  emptyWrap: { alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyText: { color: Colors.textMuted, fontSize: 14 },
  cardsList: { gap: 12 },

  // Exame card
  exameCard: { backgroundColor: Colors.backgroundCard, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: Colors.border },
  exameCardTop: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10 },
  exameNome: { color: Colors.text, fontSize: 15, fontWeight: '600' },
  exameMatricula: { color: Colors.textMuted, fontSize: 12, marginTop: 2 },
  exameInfo: { gap: 4, marginBottom: 10 },
  exameInfoItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  exameInfoText: { color: Colors.textSecondary, fontSize: 12 },
  exameActions: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: 10 },
  btnAction: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderColor: Colors.accent + '44', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  btnActionText: { color: Colors.accent, fontSize: 12, fontWeight: '600' },

  // Badge
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  badgeText: { fontSize: 11, fontWeight: '600' },

  // Condicional card
  condCard: { backgroundColor: Colors.backgroundCard, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: Colors.warning + '33' },
  condCardTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  condAvatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  condNome: { color: Colors.text, fontSize: 14, fontWeight: '600' },
  condMatricula: { color: Colors.textMuted, fontSize: 12, marginTop: 2 },
  condBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.warning + '22', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12 },
  condBadgeText: { fontSize: 10, color: Colors.warning, fontWeight: '600' },
  discList: { backgroundColor: Colors.background, borderRadius: 8, padding: 10, marginBottom: 10, gap: 4 },
  discListLabel: { color: Colors.textMuted, fontSize: 11, marginBottom: 4, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  discItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  discItemText: { color: Colors.textSecondary, fontSize: 12 },

  // Estatísticas
  statsGrid: { gap: 12 },
  statCard: { backgroundColor: Colors.backgroundCard, borderRadius: 14, padding: 16, alignItems: 'center', gap: 8, borderWidth: 1, borderColor: Colors.border },
  statCardWide: { flex: 1 },
  statIcon: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  statValue: { fontSize: 32, fontWeight: '800' },
  statLabel: { color: Colors.textMuted, fontSize: 13, textAlign: 'center' },
  infoBox: { flexDirection: 'row', gap: 10, backgroundColor: Colors.info + '15', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: Colors.info + '33' },
  infoBoxText: { flex: 1, color: Colors.textSecondary, fontSize: 12, lineHeight: 18 },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalBox: { backgroundColor: Colors.backgroundElevated, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '90%' },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  modalTitle: { color: Colors.text, fontSize: 17, fontWeight: '700' },
  fieldLabel: { color: Colors.textMuted, fontSize: 12, fontWeight: '600', marginBottom: 6, marginTop: 12, textTransform: 'uppercase', letterSpacing: 0.5 },
  input: { backgroundColor: Colors.background, borderRadius: 10, padding: 12, color: Colors.text, fontSize: 14, borderWidth: 1, borderColor: Colors.border },
  row2: { flexDirection: 'row' },
  selectScrollWrap: { marginBottom: 4 },
  selectChips: { flexDirection: 'row', gap: 8, paddingBottom: 4 },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border },
  chipActive: { backgroundColor: Colors.accent + '22', borderColor: Colors.accent },
  chipText: { color: Colors.textMuted, fontSize: 12 },
  chipTextActive: { color: Colors.accent, fontWeight: '600' },

  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  infoLabel: { color: Colors.textMuted, fontSize: 13, minWidth: 100 },
  infoValue: { color: Colors.text, fontSize: 13, fontWeight: '600', flex: 1 },

  btnPrimary: { backgroundColor: Colors.accent, borderRadius: 12, padding: 14, alignItems: 'center', marginTop: 20 },
  btnPrimaryText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  btnOutline: { borderWidth: 1, borderColor: Colors.accent, borderRadius: 12, paddingHorizontal: 20, paddingVertical: 10, marginTop: 8 },
  btnOutlineText: { color: Colors.accent, fontSize: 14, fontWeight: '600' },
});

// ─── Estilos das Estatísticas ─────────────────────────────────────────────────
const st = StyleSheet.create({
  loadingWrap:  { alignItems: 'center', paddingVertical: 60, gap: 12 },
  loadingText:  { color: Colors.textMuted, fontSize: 14 },

  // KPI strip
  kpiRow:   { flexDirection: 'row', gap: 6, marginBottom: 4 },
  kpi:      { flex: 1, backgroundColor: Colors.backgroundCard, borderRadius: 12, padding: 10, alignItems: 'center', gap: 3, borderTopWidth: 3, borderWidth: 1, borderColor: Colors.border },
  kpiVal:   { fontSize: 22, fontWeight: '800' },
  kpiLabel: { fontSize: 9, color: Colors.textMuted, textAlign: 'center', textTransform: 'uppercase', letterSpacing: 0.4 },

  // Taxas rápidas
  taxasRow: { flexDirection: 'row', gap: 8, marginBottom: 4 },
  taxaBox:  { flex: 1, borderWidth: 1, borderRadius: 14, padding: 14, alignItems: 'center', gap: 2 },
  taxaVal:  { fontSize: 24, fontWeight: '800' },
  taxaLabel:{ fontSize: 10, color: Colors.textMuted, textAlign: 'center' },

  // Cards e layout
  chartsRow:  { gap: 12 },
  chartCard:  { backgroundColor: Colors.backgroundCard, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: Colors.border },
  chartTitle: { color: Colors.text, fontSize: 14, fontWeight: '700', marginBottom: 10, letterSpacing: 0.2 },

  // Donut
  donutWrap:   { alignItems: 'center', justifyContent: 'center', position: 'relative', marginBottom: 14, alignSelf: 'center' },
  donutCenter: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  donutPct:    { color: Colors.text, fontSize: 30, fontWeight: '800' },
  donutSub:    { color: Colors.textMuted, fontSize: 11, marginTop: -2 },

  // Legenda
  legend:     { gap: 8 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  legendDot:  { width: 10, height: 10, borderRadius: 5 },
  legendText: { flex: 1, color: Colors.textSecondary, fontSize: 13 },
  legendVal:  { fontSize: 14, fontWeight: '700' },
  legendPct:  { fontSize: 11, color: Colors.textMuted, minWidth: 32, textAlign: 'right' },

  // Barras
  barHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 },
  barLabel:  { color: Colors.textSecondary, fontSize: 12 },
  barCount:  { fontSize: 13, fontWeight: '700', color: Colors.text },
  barPct:    { fontSize: 11, color: Colors.textMuted },
  barTrack:  { height: 8, backgroundColor: Colors.border, borderRadius: 4, overflow: 'hidden', flexDirection: 'row' },
  barFill:   { height: '100%' as any, borderRadius: 4 },

  // Trimestres
  trimCard:    { flex: 1, backgroundColor: Colors.background, borderRadius: 12, padding: 12, alignItems: 'center', borderTopWidth: 3, borderWidth: 1, borderColor: Colors.border, gap: 2 },
  trimLabel:   { color: Colors.textMuted, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: '600' },
  trimVal:     { fontSize: 26, fontWeight: '800' },
  trimSub:     { color: Colors.textMuted, fontSize: 10 },
  trimTaxa:    { fontSize: 18, fontWeight: '800' },
  trimDivider: { height: 1, backgroundColor: Colors.border, width: '80%', marginVertical: 6 },
});
