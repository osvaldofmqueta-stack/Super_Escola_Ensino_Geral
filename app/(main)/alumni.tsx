import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Modal, FlatList, Platform, KeyboardAvoidingView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '@/constants/colors';
import TopBar from '@/components/TopBar';
import { SkeletonList } from '@/components/Skeleton';
import { api } from '@/lib/api';
import { alertSucesso, alertErro } from '@/utils/toast';
import { webAlert } from '@/utils/webAlert';
import { useAuth } from '@/context/AuthContext';
import { StableSearchInput } from '@/components/StableSearchInput';

// ─── Types ────────────────────────────────────────────────────────────────────

type SituacaoAtual =
  | 'empregado' | 'estudante' | 'empreendedor'
  | 'desempregado' | 'desconhecida' | 'outro';

interface Alumni {
  id: string;
  alunoId?: string;
  nome: string;
  email?: string;
  telefone?: string;
  dataNascimento?: string;
  genero?: 'M' | 'F';
  anoFormacao: string;
  classe: string;
  cursoId?: string;
  cursoNome: string;
  notaFinal?: number;
  situacaoAtual: SituacaoAtual;
  empregador?: string;
  cargo?: string;
  universidade?: string;
  areaProfissional?: string;
  localizacao?: string;
  foto?: string;
  observacoes?: string;
  criadoEm: string;
  atualizadoEm: string;
}

interface AlumniStats {
  total: number;
  empregados: number;
  estudantes: number;
  empreendedores: number;
  desempregados: number;
  desconhecidos: number;
  anos: number;
  mediaNotas?: number;
}

// ─── Configurações de situação ────────────────────────────────────────────────

const SITUACAO_CONFIG: Record<SituacaoAtual, { label: string; color: string; icon: string }> = {
  empregado:     { label: 'Empregado',     color: Colors.success,       icon: 'briefcase-outline' },
  estudante:     { label: 'Estudante',     color: Colors.info,          icon: 'school-outline' },
  empreendedor:  { label: 'Empreendedor',  color: Colors.gold,          icon: 'rocket-outline' },
  desempregado:  { label: 'Desempregado',  color: Colors.danger,        icon: 'close-circle-outline' },
  desconhecida:  { label: 'Desconhecida',  color: Colors.textMuted,     icon: 'help-circle-outline' },
  outro:         { label: 'Outro',         color: Colors.textSecondary, icon: 'ellipsis-horizontal-outline' },
};

const SITUACOES: SituacaoAtual[] = ['empregado', 'estudante', 'empreendedor', 'desempregado', 'outro', 'desconhecida'];
const ANOS_LETIVOS = Array.from({ length: 12 }, (_, i) => {
  const y = new Date().getFullYear() - i;
  return `${y}/${y + 1}`;
});

// ─── Formulário vazio ─────────────────────────────────────────────────────────

const FORM_EMPTY: Omit<Alumni, 'id' | 'criadoEm' | 'atualizadoEm'> = {
  nome: '', email: '', telefone: '', dataNascimento: '',
  genero: undefined, anoFormacao: ANOS_LETIVOS[1] ?? '',
  classe: '', cursoNome: '', notaFinal: undefined,
  situacaoAtual: 'desconhecida', empregador: '', cargo: '',
  universidade: '', areaProfissional: '', localizacao: '', observacoes: '',
};

// ─── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({ label, value, color, icon }: {
  label: string; value: number | string; color: string; icon: string;
}) {
  return (
    <View style={[sc.card, { borderLeftColor: color }]}>
      <Ionicons name={icon as any} size={22} color={color} />
      <Text style={[sc.value, { color }]}>{value}</Text>
      <Text style={sc.label}>{label}</Text>
    </View>
  );
}

const sc = StyleSheet.create({
  card: {
    flex: 1, minWidth: 100, backgroundColor: Colors.surface, borderRadius: 12,
    padding: 12, alignItems: 'center', gap: 4,
    borderLeftWidth: 3, borderWidth: 1, borderColor: Colors.border,
  },
  value: { fontSize: 22, fontFamily: 'Inter_700Bold' },
  label: { fontSize: 10, fontFamily: 'Inter_500Medium', color: Colors.textMuted, textAlign: 'center', textTransform: 'uppercase', letterSpacing: 0.5 },
});

// ─── Alumni Card ──────────────────────────────────────────────────────────────

function AlumniCard({ item, onEdit, onDelete, canEdit }: {
  item: Alumni;
  onEdit: (a: Alumni) => void;
  onDelete: (id: string) => void;
  canEdit: boolean;
}) {
  const sit = SITUACAO_CONFIG[item.situacaoAtual] ?? SITUACAO_CONFIG.desconhecida;
  return (
    <View style={ac.card}>
      <View style={ac.top}>
        {/* Avatar inicial */}
        <View style={[ac.avatar, { backgroundColor: sit.color + '22' }]}>
          <Text style={[ac.avatarTxt, { color: sit.color }]}>
            {(item.nome.split(' ')[0]?.[0] ?? '?').toUpperCase()}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={ac.nome}>{item.nome}</Text>
          <Text style={ac.meta}>
            {item.classe || '—'}{item.cursoNome ? ` · ${item.cursoNome}` : ''} · {item.anoFormacao}
          </Text>
          {item.notaFinal != null && (
            <Text style={ac.nota}>Nota final: <Text style={{ color: item.notaFinal >= 10 ? Colors.success : Colors.danger, fontFamily: 'Inter_700Bold' }}>{item.notaFinal} val.</Text></Text>
          )}
        </View>
        <View style={[ac.badge, { backgroundColor: sit.color + '18', borderColor: sit.color + '44' }]}>
          <Ionicons name={sit.icon as any} size={11} color={sit.color} />
          <Text style={[ac.badgeTxt, { color: sit.color }]}>{sit.label}</Text>
        </View>
      </View>

      {/* Detalhes */}
      <View style={ac.details}>
        {item.empregador ? (
          <View style={ac.row}>
            <Ionicons name="business-outline" size={13} color={Colors.textMuted} />
            <Text style={ac.detailTxt}>{item.cargo ? `${item.cargo} — ` : ''}{item.empregador}</Text>
          </View>
        ) : null}
        {item.universidade ? (
          <View style={ac.row}>
            <Ionicons name="school-outline" size={13} color={Colors.textMuted} />
            <Text style={ac.detailTxt}>{item.universidade}</Text>
          </View>
        ) : null}
        {item.localizacao ? (
          <View style={ac.row}>
            <Ionicons name="location-outline" size={13} color={Colors.textMuted} />
            <Text style={ac.detailTxt}>{item.localizacao}</Text>
          </View>
        ) : null}
        {item.email ? (
          <View style={ac.row}>
            <Ionicons name="mail-outline" size={13} color={Colors.textMuted} />
            <Text style={ac.detailTxt}>{item.email}</Text>
          </View>
        ) : null}
      </View>

      {/* Acções — apenas para utilizadores autorizados */}
      {canEdit && (
        <View style={ac.actions}>
          <TouchableOpacity style={ac.btn} onPress={() => onEdit(item)}>
            <Ionicons name="create-outline" size={15} color={Colors.gold} />
            <Text style={[ac.btnTxt, { color: Colors.gold }]}>Editar</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[ac.btn, { borderColor: Colors.danger + '33' }]} onPress={() => onDelete(item.id)}>
            <Ionicons name="trash-outline" size={15} color={Colors.danger} />
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const ac = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface, borderRadius: 14, borderWidth: 1,
    borderColor: Colors.border, marginBottom: 10, overflow: 'hidden',
  },
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 14, paddingBottom: 10 },
  avatar: {
    width: 42, height: 42, borderRadius: 21,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarTxt: { fontSize: 18, fontFamily: 'Inter_700Bold' },
  nome: { fontSize: 15, fontFamily: 'Inter_700Bold', color: Colors.text },
  meta: { fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 1 },
  nota: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textSecondary, marginTop: 2 },
  badge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20,
    borderWidth: 1, alignSelf: 'flex-start',
  },
  badgeTxt: { fontSize: 10, fontFamily: 'Inter_600SemiBold' },
  details: { paddingHorizontal: 14, paddingBottom: 8, gap: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  detailTxt: { fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textSecondary, flex: 1 },
  actions: {
    flexDirection: 'row', gap: 8, paddingHorizontal: 14, paddingBottom: 12, paddingTop: 4,
  },
  btn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8,
    borderWidth: 1, borderColor: Colors.gold + '44', backgroundColor: Colors.gold + '10',
  },
  btnTxt: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
});

// ─── Modal de Formulário ──────────────────────────────────────────────────────

function AlumniFormModal({ visible, onClose, onSave, initial }: {
  visible: boolean;
  onClose: () => void;
  onSave: (data: Omit<Alumni, 'id' | 'criadoEm' | 'atualizadoEm'>) => void;
  initial?: Alumni | null;
}) {
  const [form, setForm] = useState<Omit<Alumni, 'id' | 'criadoEm' | 'atualizadoEm'>>(FORM_EMPTY);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (visible) {
      setForm(initial ? {
        alunoId: initial.alunoId,
        nome: initial.nome, email: initial.email ?? '', telefone: initial.telefone ?? '',
        dataNascimento: initial.dataNascimento ?? '', genero: initial.genero,
        anoFormacao: initial.anoFormacao, classe: initial.classe,
        cursoId: initial.cursoId, cursoNome: initial.cursoNome,
        notaFinal: initial.notaFinal,
        situacaoAtual: initial.situacaoAtual, empregador: initial.empregador ?? '',
        cargo: initial.cargo ?? '', universidade: initial.universidade ?? '',
        areaProfissional: initial.areaProfissional ?? '',
        localizacao: initial.localizacao ?? '', observacoes: initial.observacoes ?? '',
      } : { ...FORM_EMPTY });
    }
  }, [visible, initial]);

  function set(k: string, v: unknown) { setForm(p => ({ ...p, [k]: v })); }

  function Field({ label, fieldKey, placeholder, multiline }: {
    label: string; fieldKey: string; placeholder?: string; multiline?: boolean;
  }) {
    return (
      <View style={fm.field}>
        <Text style={fm.lbl}>{label}</Text>
        <TextInput
          style={[fm.input, multiline && { minHeight: 70, textAlignVertical: 'top' }]}
          value={(form as any)[fieldKey] ?? ''}
          onChangeText={v => set(fieldKey, v)}
          placeholder={placeholder ?? label}
          placeholderTextColor={Colors.textMuted}
          multiline={multiline}
        />
      </View>
    );
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={fm.overlay}>
          <View style={[fm.container, { paddingBottom: (insets.bottom || 16) + 16 }]}>
            {/* Header */}
            <View style={fm.header}>
              <Text style={fm.title}>{initial ? 'Editar Alumni' : 'Novo Alumni'}</Text>
              <TouchableOpacity onPress={onClose}>
                <Ionicons name="close" size={22} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {/* Dados Pessoais */}
              <Text style={fm.section}>Dados Pessoais</Text>
              <Field label="Nome Completo *" fieldKey="nome" placeholder="Nome do alumni" />
              <View style={fm.row2}>
                <View style={{ flex: 1 }}><Field label="Email" fieldKey="email" placeholder="email@exemplo.com" /></View>
                <View style={{ flex: 1 }}><Field label="Telefone" fieldKey="telefone" placeholder="+244 9XX XXX XXX" /></View>
              </View>
              <View style={fm.row2}>
                <View style={{ flex: 1 }}>
                  <Text style={fm.lbl}>Género</Text>
                  <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
                    {(['M', 'F'] as const).map(g => (
                      <TouchableOpacity
                        key={g}
                        style={[fm.chip, form.genero === g && fm.chipActive]}
                        onPress={() => set('genero', g)}
                      >
                        <Text style={[fm.chipTxt, form.genero === g && fm.chipActiveTxt]}>{g === 'M' ? 'Masculino' : 'Feminino'}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
                <View style={{ flex: 1 }}><Field label="Data de Nascimento" fieldKey="dataNascimento" placeholder="AAAA-MM-DD" /></View>
              </View>

              {/* Dados Académicos */}
              <Text style={fm.section}>Dados Académicos</Text>
              <View style={fm.row2}>
                <View style={{ flex: 1 }}>
                  <Text style={fm.lbl}>Ano de Formação *</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
                    <View style={{ flexDirection: 'row', gap: 6 }}>
                      {ANOS_LETIVOS.map(a => (
                        <TouchableOpacity key={a} style={[fm.chip, form.anoFormacao === a && fm.chipActive]} onPress={() => set('anoFormacao', a)}>
                          <Text style={[fm.chipTxt, form.anoFormacao === a && fm.chipActiveTxt]}>{a}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </ScrollView>
                </View>
              </View>
              <View style={fm.row2}>
                <View style={{ flex: 1 }}><Field label="Classe" fieldKey="classe" placeholder="Ex: 13ª Classe" /></View>
                <View style={{ flex: 1 }}><Field label="Curso" fieldKey="cursoNome" placeholder="Ex: Gestão e Contabilidade" /></View>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={fm.lbl}>Nota Final</Text>
                <TextInput
                  style={fm.input}
                  value={form.notaFinal != null ? String(form.notaFinal) : ''}
                  onChangeText={v => set('notaFinal', v === '' ? undefined : parseFloat(v))}
                  placeholder="Ex: 14.5"
                  placeholderTextColor={Colors.textMuted}
                  keyboardType="decimal-pad"
                />
              </View>

              {/* Situação Actual */}
              <Text style={fm.section}>Situação Actual</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                {SITUACOES.map(s => {
                  const cfg = SITUACAO_CONFIG[s];
                  const active = form.situacaoAtual === s;
                  return (
                    <TouchableOpacity
                      key={s}
                      style={[fm.chip, active && { backgroundColor: cfg.color, borderColor: cfg.color }]}
                      onPress={() => set('situacaoAtual', s)}
                    >
                      <Ionicons name={cfg.icon as any} size={13} color={active ? '#fff' : cfg.color} />
                      <Text style={[fm.chipTxt, active && { color: '#fff' }]}>{cfg.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {(form.situacaoAtual === 'empregado' || form.situacaoAtual === 'empreendedor') && (
                <>
                  <View style={fm.row2}>
                    <View style={{ flex: 1 }}><Field label="Empregador / Empresa" fieldKey="empregador" placeholder="Nome da empresa" /></View>
                    <View style={{ flex: 1 }}><Field label="Cargo / Função" fieldKey="cargo" placeholder="Ex: Técnico de Contabilidade" /></View>
                  </View>
                  <Field label="Área Profissional" fieldKey="areaProfissional" placeholder="Ex: Finanças, Tecnologia..." />
                </>
              )}
              {form.situacaoAtual === 'estudante' && (
                <Field label="Universidade / Instituição" fieldKey="universidade" placeholder="Ex: Universidade Agostinho Neto" />
              )}
              <Field label="Localização" fieldKey="localizacao" placeholder="Ex: Luanda, Angola" />
              <Field label="Observações" fieldKey="observacoes" placeholder="Notas adicionais..." multiline />
            </ScrollView>

            {/* Botões */}
            <View style={fm.footer}>
              <TouchableOpacity style={fm.cancelBtn} onPress={onClose}>
                <Text style={fm.cancelTxt}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={fm.saveBtn}
                onPress={() => {
                  if (!form.nome.trim()) { webAlert('Aviso', 'O nome é obrigatório.'); return; }
                  if (!form.anoFormacao) { webAlert('Aviso', 'O ano de formação é obrigatório.'); return; }
                  onSave(form);
                }}
              >
                <Ionicons name="checkmark-circle" size={18} color="#fff" />
                <Text style={fm.saveTxt}>Guardar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const fm = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  container: {
    backgroundColor: Colors.background, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingHorizontal: 20, paddingTop: 20, maxHeight: '92%',
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  title: { fontSize: 18, fontFamily: 'Inter_700Bold', color: Colors.text },
  section: {
    fontSize: 11, fontFamily: 'Inter_600SemiBold', color: Colors.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10, marginTop: 8,
  },
  field: { marginBottom: 12 },
  lbl: { fontSize: 11, fontFamily: 'Inter_600SemiBold', color: Colors.textSecondary, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.4 },
  input: {
    backgroundColor: Colors.backgroundElevated, borderWidth: 1, borderColor: Colors.border,
    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 14, fontFamily: 'Inter_400Regular', color: Colors.text,
    outlineStyle: 'none' as any,
  },
  row2: { flexDirection: 'row', gap: 12 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20,
    borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.backgroundElevated,
  },
  chipActive: { backgroundColor: Colors.gold, borderColor: Colors.gold },
  chipTxt: { fontSize: 12, fontFamily: 'Inter_500Medium', color: Colors.textSecondary },
  chipActiveTxt: { color: '#fff' },
  footer: { flexDirection: 'row', gap: 10, marginTop: 16 },
  cancelBtn: {
    flex: 1, paddingVertical: 13, borderRadius: 12,
    borderWidth: 1, borderColor: Colors.border, alignItems: 'center',
  },
  cancelTxt: { fontSize: 15, fontFamily: 'Inter_600SemiBold', color: Colors.textSecondary },
  saveBtn: {
    flex: 2, paddingVertical: 13, borderRadius: 12,
    backgroundColor: Colors.gold, alignItems: 'center', flexDirection: 'row',
    justifyContent: 'center', gap: 8,
  },
  saveTxt: { fontSize: 15, fontFamily: 'Inter_700Bold', color: '#fff' },
});

// ─── Ecrã Principal ───────────────────────────────────────────────────────────

export default function AlumniScreen() {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();

  const [alumni, setAlumni] = useState<Alumni[]>([]);
  const [stats, setStats] = useState<AlumniStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [filterSituacao, setFilterSituacao] = useState<SituacaoAtual | 'todos'>('todos');
  const [filterAno, setFilterAno] = useState<string>('todos');
  const [modalVisible, setModalVisible] = useState(false);
  const [editing, setEditing] = useState<Alumni | null>(null);

  const canEdit = ['admin', 'director', 'subdirector_pedagogico', 'chefe_secretaria', 'secretaria', 'ceo', 'pca'].includes(user?.role ?? '');

  // Carregar dados
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [alumniData, statsData] = await Promise.all([
        api.get<Alumni[]>('/api/alumni'),
        api.get<AlumniStats>('/api/alumni/stats'),
      ]);
      setAlumni(alumniData ?? []);
      setStats(statsData ?? null);
    } catch {
      setAlumni([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Filtros
  const anosDisponiveis = useMemo(() => {
    const anos = [...new Set(alumni.map(a => a.anoFormacao))].sort((a, b) => b.localeCompare(a));
    return anos;
  }, [alumni]);

  const filtered = useMemo(() => {
    return alumni.filter(a => {
      const matchSearch = !search || a.nome.toLowerCase().includes(search.toLowerCase())
        || (a.email ?? '').toLowerCase().includes(search.toLowerCase())
        || (a.cursoNome ?? '').toLowerCase().includes(search.toLowerCase())
        || (a.empregador ?? '').toLowerCase().includes(search.toLowerCase());
      const matchSit = filterSituacao === 'todos' || a.situacaoAtual === filterSituacao;
      const matchAno = filterAno === 'todos' || a.anoFormacao === filterAno;
      return matchSearch && matchSit && matchAno;
    });
  }, [alumni, search, filterSituacao, filterAno]);

  // CRUD
  async function handleSave(data: Omit<Alumni, 'id' | 'criadoEm' | 'atualizadoEm'>) {
    setSaving(true);
    try {
      if (editing) {
        const updated = await api.put<Alumni>(`/api/alumni/${editing.id}`, data);
        setAlumni(prev => prev.map(a => a.id === editing.id ? { ...a, ...updated } : a));
        alertSucesso('Alumni actualizado com sucesso!');
      } else {
        const created = await api.post<Alumni>('/api/alumni', data);
        setAlumni(prev => [created, ...prev]);
        alertSucesso('Alumni adicionado com sucesso!');
      }
      setModalVisible(false);
      setEditing(null);
      loadData(); // refresh stats
    } catch (e: any) {
      alertErro(e?.message || 'Erro ao guardar.');
    } finally {
      setSaving(false);
    }
  }

  function handleEdit(a: Alumni) {
    setEditing(a);
    setModalVisible(true);
  }

  function handleDelete(id: string) {
    webAlert('Eliminar', 'Tem a certeza que deseja eliminar este registo de alumni?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar', style: 'destructive', onPress: async () => {
          try {
            await api.delete(`/api/alumni/${id}`);
            setAlumni(prev => prev.filter(a => a.id !== id));
            alertSucesso('Registo eliminado.');
            loadData();
          } catch { alertErro('Erro ao eliminar.'); }
        },
      },
    ]);
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <View style={[s.root, { paddingBottom: insets.bottom }]}>
      <TopBar title="Antigos Alunos" subtitle={stats ? `${stats.total} alumni registados` : undefined} />

      {/* Stats */}
      {stats && stats.total > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.statsRow} contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}>
          <StatCard label="Total" value={stats.total} color={Colors.gold} icon="people-outline" />
          <StatCard label="Empregados" value={stats.empregados} color={Colors.success} icon="briefcase-outline" />
          <StatCard label="Estudantes" value={stats.estudantes} color={Colors.info} icon="school-outline" />
          <StatCard label="Empreendedores" value={stats.empreendedores} color={Colors.gold} icon="rocket-outline" />
          <StatCard label="Anos letivos" value={stats.anos} color={Colors.textSecondary} icon="calendar-outline" />
          {stats.mediaNotas != null && (
            <StatCard label="Média Notas" value={`${Number(stats.mediaNotas).toFixed(1)} val.`} color={Colors.info} icon="star-outline" />
          )}
        </ScrollView>
      )}

      {/* Barra de acções */}
      <View style={s.toolbar}>
        <View style={{ flex: 1 }}>
          <StableSearchInput
            placeholder="Pesquisar alumni..."
            value={search}
            onChangeText={setSearch}
          />
        </View>
        {canEdit && (
          <TouchableOpacity style={s.addBtn} onPress={() => { setEditing(null); setModalVisible(true); }}>
            <Ionicons name="add" size={20} color="#fff" />
            <Text style={s.addBtnTxt}>Novo</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Filtros por situação */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.filtersRow} contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}>
        <TouchableOpacity style={[s.fChip, filterSituacao === 'todos' && s.fChipActive]} onPress={() => setFilterSituacao('todos')}>
          <Text style={[s.fChipTxt, filterSituacao === 'todos' && s.fChipActiveTxt]}>Todos</Text>
        </TouchableOpacity>
        {SITUACOES.map(s2 => {
          const cfg = SITUACAO_CONFIG[s2];
          const active = filterSituacao === s2;
          return (
            <TouchableOpacity
              key={s2}
              style={[s.fChip, active && { backgroundColor: cfg.color, borderColor: cfg.color }]}
              onPress={() => setFilterSituacao(s2)}
            >
              <Ionicons name={cfg.icon as any} size={12} color={active ? '#fff' : cfg.color} />
              <Text style={[s.fChipTxt, active && { color: '#fff' }]}>{cfg.label}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Filtro por ano */}
      {anosDisponiveis.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.filtersRow} contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}>
          <TouchableOpacity style={[s.fChip, filterAno === 'todos' && s.fChipActive]} onPress={() => setFilterAno('todos')}>
            <Text style={[s.fChipTxt, filterAno === 'todos' && s.fChipActiveTxt]}>Todos os anos</Text>
          </TouchableOpacity>
          {anosDisponiveis.map(ano => (
            <TouchableOpacity key={ano} style={[s.fChip, filterAno === ano && s.fChipActive]} onPress={() => setFilterAno(ano)}>
              <Text style={[s.fChipTxt, filterAno === ano && s.fChipActiveTxt]}>{ano}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* Lista */}
      {loading ? (
        <View style={{ padding: 16 }}><SkeletonList rows={5} /></View>
      ) : filtered.length === 0 ? (
        <View style={s.empty}>
          <MaterialCommunityIcons name="account-group-outline" size={64} color={Colors.textMuted} />
          <Text style={s.emptyTitle}>
            {alumni.length === 0 ? 'Nenhum alumni registado' : 'Sem resultados para a pesquisa'}
          </Text>
          <Text style={s.emptySub}>
            {alumni.length === 0
              ? 'Adicione antigos alunos para acompanhar o seu percurso após a formação.'
              : 'Tente alterar os filtros ou a pesquisa.'}
          </Text>
          {canEdit && alumni.length === 0 && (
            <TouchableOpacity style={s.emptyBtn} onPress={() => { setEditing(null); setModalVisible(true); }}>
              <Ionicons name="add-circle" size={18} color="#fff" />
              <Text style={s.emptyBtnTxt}>Adicionar Alumni</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={a => a.id}
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 80 }}
          renderItem={({ item }) => (
            <AlumniCard item={item} onEdit={handleEdit} onDelete={handleDelete} canEdit={canEdit} />
          )}
          ListHeaderComponent={
            <Text style={s.resultCount}>
              {filtered.length} de {alumni.length} alumni
            </Text>
          }
        />
      )}

      {/* Modal */}
      <AlumniFormModal
        visible={modalVisible}
        onClose={() => { setModalVisible(false); setEditing(null); }}
        onSave={handleSave}
        initial={editing}
      />
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  statsRow: { maxHeight: 100, marginVertical: 10 },
  toolbar: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, marginBottom: 8 },
  addBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: Colors.gold, paddingHorizontal: 16, paddingVertical: 10,
    borderRadius: 12,
  },
  addBtnTxt: { fontSize: 14, fontFamily: 'Inter_700Bold', color: '#fff' },
  filtersRow: { maxHeight: 44, marginBottom: 4 },
  fChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20,
    borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface,
  },
  fChipActive: { backgroundColor: Colors.gold, borderColor: Colors.gold },
  fChipTxt: { fontSize: 12, fontFamily: 'Inter_500Medium', color: Colors.textSecondary },
  fChipActiveTxt: { color: '#fff' },
  resultCount: {
    fontSize: 12, fontFamily: 'Inter_500Medium', color: Colors.textMuted,
    marginBottom: 10, textAlign: 'right',
  },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, gap: 10 },
  emptyTitle: { fontSize: 18, fontFamily: 'Inter_700Bold', color: Colors.text, textAlign: 'center' },
  emptySub: { fontSize: 14, fontFamily: 'Inter_400Regular', color: Colors.textMuted, textAlign: 'center', lineHeight: 20 },
  emptyBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: Colors.gold, paddingHorizontal: 20, paddingVertical: 12,
    borderRadius: 12, marginTop: 8,
  },
  emptyBtnTxt: { fontSize: 14, fontFamily: 'Inter_700Bold', color: '#fff' },
});
