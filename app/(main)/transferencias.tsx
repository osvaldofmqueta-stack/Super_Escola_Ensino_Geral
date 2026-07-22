import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {FlatList, KeyboardAvoidingView, Modal, Platform, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View} from 'react-native';
import AppLoader from '@/components/AppLoader';
import { Ionicons, MaterialCommunityIcons, FontAwesome5 } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Colors } from '@/constants/colors';
import DateInput from '@/components/DateInput';
import { useAuth } from '@/context/AuthContext';
import { useConfig } from '@/context/ConfigContext';
import { useData } from '@/context/DataContext';
import { useToast } from '@/context/ToastContext';
import { api } from '@/lib/api';
import TopBar from '@/components/TopBar';
import { webAlert } from '@/utils/webAlert';
import { useEnterToSave } from '@/hooks/useEnterToSave';
import RequiredMark from '@/components/RequiredMark';
import { StableSearchInput } from '@/components/StableSearchInput';
import { SkeletonPage } from '@/components/Skeleton';

// ─── Types ───────────────────────────────────────────────────────────────────

type TransferTipo = 'entrada' | 'saida';
type TransferStatus = 'pendente' | 'aprovado' | 'concluido' | 'rejeitado';

interface Transferencia {
  id: string;
  tipo: TransferTipo;
  status: TransferStatus;
  nomeAluno: string;
  alunoId?: string | null;
  escolaOrigem?: string | null;
  escolaDestino?: string | null;
  classeOrigem?: string | null;
  classeDestino?: string | null;
  turmaDestinoId?: string | null;
  motivo?: string | null;
  observacoes?: string | null;
  documentosRecebidos?: string[];
  dataRequisicao?: string | null;
  dataAprovacao?: string | null;
  dataConclusao?: string | null;
  criadoPor?: string | null;
  criadoEm: string;
  atualizadoEm: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<TransferStatus, { label: string; color: string; bg: string; icon: string }> = {
  pendente:  { label: 'Pendente',  color: '#f59e0b', bg: '#fef3c7', icon: 'time-outline' },
  aprovado:  { label: 'Aprovado',  color: '#3b82f6', bg: '#dbeafe', icon: 'checkmark-circle-outline' },
  concluido: { label: 'Concluído', color: '#10b981', bg: '#d1fae5', icon: 'checkmark-done-circle-outline' },
  rejeitado: { label: 'Rejeitado', color: '#ef4444', bg: '#fee2e2', icon: 'close-circle-outline' },
};

const DOCS_OPCOES = [
  'Bilhete de Identidade / Cédula',
  'Certidão de Nascimento',
  'Guia de Transferência',
  'Boletim / Declaração de Notas',
  'Atestado de Frequência',
  'Fotografia (3x4)',
  'Cartão de Vacinação',
  'Histórico Académico',
];

const CLASSES_AO = ['1ª Classe','2ª Classe','3ª Classe','4ª Classe','5ª Classe','6ª Classe',
  '7ª Classe','8ª Classe','9ª Classe','10ª Classe','11ª Classe','12ª Classe','13ª Classe'];

const MOTIVOS_SAIDA = ['Mudança de residência','Transferência familiar','Melhor estabelecimento de ensino','Conclusão de ciclo','Outro'];
const MOTIVOS_ENTRADA = ['Mudança de residência','Transferência familiar','Melhor oferta académica','Admissão directa','Outro'];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtDate(iso?: string | null) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleDateString('pt-AO', { day: '2-digit', month: 'short', year: 'numeric' }); }
  catch { return iso; }
}

function today() { return new Date().toISOString().slice(0, 10); }

// ─── Empty Form ───────────────────────────────────────────────────────────────

function emptyForm(tipo: TransferTipo): Partial<Transferencia> {
  return {
    tipo,
    nomeAluno: '',
    escolaOrigem: '',
    escolaDestino: '',
    classeOrigem: '',
    classeDestino: '',
    motivo: '',
    observacoes: '',
    documentosRecebidos: [],
    dataRequisicao: today(),
  };
}

// ─── StatusBadge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: TransferStatus }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.pendente;
  return (
    <View style={[styles.badge, { backgroundColor: cfg.bg, borderColor: cfg.color }]}>
      <Ionicons name={cfg.icon as any} size={12} color={cfg.color} />
      <Text style={[styles.badgeText, { color: cfg.color }]}>{cfg.label}</Text>
    </View>
  );
}

// ─── TipoBadge ───────────────────────────────────────────────────────────────

function TipoBadge({ tipo }: { tipo: TransferTipo }) {
  const isEntrada = tipo === 'entrada';
  return (
    <View style={[styles.tipoBadge, { backgroundColor: isEntrada ? '#d1fae5' : '#dbeafe', borderColor: isEntrada ? '#10b981' : '#3b82f6' }]}>
      <Ionicons name={isEntrada ? 'arrow-down-circle' : 'arrow-up-circle'} size={12} color={isEntrada ? '#10b981' : '#3b82f6'} />
      <Text style={[styles.tipoBadgeText, { color: isEntrada ? '#10b981' : '#3b82f6' }]}>{isEntrada ? 'ENTRADA' : 'SAÍDA'}</Text>
    </View>
  );
}

// ─── Card ─────────────────────────────────────────────────────────────────────

function TransferenciaCard({
  item, onPress, onStatusChange,
}: { item: Transferencia; onPress: () => void; onStatusChange: (t: Transferencia) => void }) {
  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.85}>
      <View style={styles.cardHeader}>
        <View style={styles.cardHeaderLeft}>
          <TipoBadge tipo={item.tipo} />
          <StatusBadge status={item.status} />
        </View>
        <Text style={styles.cardDate}>{fmtDate(item.dataRequisicao)}</Text>
      </View>

      <Text style={styles.cardName}>{item.nomeAluno}</Text>

      {item.tipo === 'saida' ? (
        <View style={styles.cardRoute}>
          <MaterialCommunityIcons name="school" size={13} color={Colors.textSecondary} />
          <Text style={styles.cardRouteText}>Para: {item.escolaDestino || '—'}</Text>
          {item.classeDestino ? <Text style={styles.cardRouteClass}>· {item.classeDestino}</Text> : null}
        </View>
      ) : (
        <View style={styles.cardRoute}>
          <MaterialCommunityIcons name="school-outline" size={13} color={Colors.textSecondary} />
          <Text style={styles.cardRouteText}>De: {item.escolaOrigem || '—'}</Text>
          {item.classeOrigem ? <Text style={styles.cardRouteClass}>· {item.classeOrigem}</Text> : null}
        </View>
      )}

      {item.motivo ? (
        <Text style={styles.cardMotivo} numberOfLines={1}>Motivo: {item.motivo}</Text>
      ) : null}

      {item.status === 'pendente' && (
        <View style={styles.cardActions}>
          <TouchableOpacity style={styles.cardActionBtn} onPress={() => onStatusChange({ ...item, status: 'aprovado' })}>
            <Ionicons name="checkmark" size={14} color="#3b82f6" />
            <Text style={[styles.cardActionText, { color: '#3b82f6' }]}>Aprovar</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.cardActionBtn, { borderColor: '#ef4444' }]} onPress={() => onStatusChange({ ...item, status: 'rejeitado' })}>
            <Ionicons name="close" size={14} color="#ef4444" />
            <Text style={[styles.cardActionText, { color: '#ef4444' }]}>Rejeitar</Text>
          </TouchableOpacity>
        </View>
      )}
      {item.status === 'aprovado' && (
        <View style={styles.cardActions}>
          <TouchableOpacity style={[styles.cardActionBtn, { borderColor: '#10b981' }]} onPress={() => onStatusChange({ ...item, status: 'concluido' })}>
            <Ionicons name="checkmark-done" size={14} color="#10b981" />
            <Text style={[styles.cardActionText, { color: '#10b981' }]}>Concluir</Text>
          </TouchableOpacity>
        </View>
      )}
    </TouchableOpacity>
  );
}

// ─── Form Modal ───────────────────────────────────────────────────────────────

function FormModal({
  visible, onClose, onSave, initial, alunos, turmas,
}: {
  visible: boolean;
  onClose: () => void;
  onSave: (data: Partial<Transferencia>) => void;
  initial: Partial<Transferencia> | null;
  alunos: any[];
  turmas: any[];
}) {
  const { config: cfgModal } = useConfig();
  const temDecimaTermeiraModal = (cfgModal as any).temDecimaTermeira !== false;
  const CLASSES_FORM = temDecimaTermeiraModal ? CLASSES_AO : CLASSES_AO.filter(c => c !== '13ª Classe');
  const [form, setForm] = useState<Partial<Transferencia>>(initial || emptyForm('saida'));
  const [docsOpen, setDocsOpen] = useState(false);
  useEnterToSave(handleSave, visible);
  const [alunoSearch, setAlunoSearch] = useState('');
  const [filterTurmaId, setFilterTurmaId] = useState<string | null>(null);
  const insets = useSafeAreaInsets();

  /** Devolve "Nª Classe" a partir da turma do aluno (usa campo `classe` se disponível, senão parseia o nome) */
  function classeFromTurma(turmaId: string | null | undefined): string {
    if (!turmaId) return '';
    const t = turmas.find((tr: any) => tr.id === turmaId);
    if (!t) return '';
    // Prefer the explicit `classe` field (numeric or "11", "6", etc.)
    const num = t.classe ? String(t.classe) : (() => {
      const m = t.nome?.match(/^(\d+)[ºª°]/);
      return m ? m[1] : '';
    })();
    if (!num) return '';
    return CLASSES_AO.find(c => c.startsWith(num + 'ª')) ?? '';
  }

  const alunosFiltrados = useMemo(() => {
    let list = alunos;
    if (filterTurmaId) list = list.filter((a: any) => a.turmaId === filterTurmaId);
    if (alunoSearch.trim()) {
      const q = alunoSearch.trim().toLowerCase();
      list = list.filter((a: any) =>
        `${a.nome} ${a.apelido}`.toLowerCase().includes(q) ||
        (a.numeroBi ?? '').toLowerCase().includes(q)
      );
    }
    return list.slice(0, 50);
  }, [alunos, filterTurmaId, alunoSearch]);

  useEffect(() => {
    setForm(initial || emptyForm('saida'));
  }, [initial, visible]);

  const set = (k: keyof Transferencia, v: any) => setForm(f => ({ ...f, [k]: v }));

  const toggleDoc = (doc: string) => {
    const curr = form.documentosRecebidos ?? [];
    set('documentosRecebidos', curr.includes(doc) ? curr.filter(d => d !== doc) : [...curr, doc]);
  };

  function handleSave() {
    if (!form.nomeAluno?.trim()) {
      webAlert('Campo obrigatório', 'Preencha o nome do aluno.');
      return;
    }
    onSave(form);
  }

  const isSaida = form.tipo === 'saida';
  const motivoOpts = isSaida ? MOTIVOS_SAIDA : MOTIVOS_ENTRADA;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
      <View style={fStyles.overlay}>
        <View style={[fStyles.container, { paddingBottom: (Platform.OS === 'web' ? 24 : insets.bottom) + 16 }]}>
          <View style={fStyles.header}>
            <Text style={fStyles.title}>{initial?.id ? 'Editar Transferência' : 'Nova Transferência'}</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={22} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

            {/* Tipo */}
            {!initial?.id && (
              <>
                <Text style={fStyles.label}>Tipo de Transferência</Text>
                <View style={fStyles.tipoRow}>
                  {(['saida', 'entrada'] as TransferTipo[]).map(t => (
                    <TouchableOpacity
                      key={t}
                      style={[fStyles.tipoBtn, form.tipo === t && fStyles.tipoBtnActive]}
                      onPress={() => set('tipo', t)}
                    >
                      <Ionicons
                        name={t === 'saida' ? 'arrow-up-circle' : 'arrow-down-circle'}
                        size={18}
                        color={form.tipo === t ? '#fff' : Colors.textSecondary}
                      />
                      <Text style={[fStyles.tipoBtnText, form.tipo === t && fStyles.tipoBtnTextActive]}>
                        {t === 'saida' ? 'Saída (aluno sai)' : 'Entrada (aluno chega)'}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}

            {/* Nome do aluno */}
            {isSaida ? (
              <>
                <Text style={fStyles.label}>Aluno<RequiredMark /></Text>

                {/* Selected student display */}
                {form.alunoId ? (
                  <View style={fStyles.alunoSelectedRow}>
                    <View style={fStyles.alunoSelectedIcon}>
                      <Ionicons name="person" size={16} color={Colors.gold} />
                    </View>
                    <Text style={fStyles.alunoSelectedName}>{form.nomeAluno}</Text>
                    <TouchableOpacity onPress={() => { set('alunoId', null); set('nomeAluno', ''); set('classeOrigem', ''); }}>
                      <Ionicons name="close-circle" size={18} color={Colors.textMuted} />
                    </TouchableOpacity>
                  </View>
                ) : null}

                {/* Search input */}
                <View style={fStyles.searchBox}>
                  <StableSearchInput
                    value={alunoSearch}
                    onChangeText={setAlunoSearch}
                    inputStyle={fStyles.searchInput}
                    placeholder="Pesquisar por nome ou BI..."
                    iconColor={Colors.textMuted}
                  />
                </View>

                {/* Turma filter chips */}
                {turmas.length > 0 && (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
                    <View style={{ flexDirection: 'row', gap: 6, paddingVertical: 2 }}>
                      <TouchableOpacity
                        style={[fStyles.filterChip, !filterTurmaId && fStyles.filterChipActive]}
                        onPress={() => setFilterTurmaId(null)}
                      >
                        <Text style={[fStyles.filterChipText, !filterTurmaId && fStyles.filterChipTextActive]}>Todas</Text>
                      </TouchableOpacity>
                      {turmas.map((t: any) => (
                        <TouchableOpacity
                          key={t.id}
                          style={[fStyles.filterChip, filterTurmaId === t.id && fStyles.filterChipActive]}
                          onPress={() => setFilterTurmaId(t.id === filterTurmaId ? null : t.id)}
                        >
                          <Text style={[fStyles.filterChipText, filterTurmaId === t.id && fStyles.filterChipTextActive]}>
                            {t.nome}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </ScrollView>
                )}

                {/* Filtered student list */}
                <View style={fStyles.alunoList}>
                  {alunosFiltrados.length === 0 ? (
                    <View style={fStyles.alunoEmptyRow}>
                      <Ionicons name="person-outline" size={20} color={Colors.textMuted} />
                      <Text style={fStyles.alunoEmptyText}>
                        {alunoSearch || filterTurmaId ? 'Nenhum aluno encontrado com esses filtros.' : 'Sem alunos registados.'}
                      </Text>
                    </View>
                  ) : (
                    alunosFiltrados.map((a: any) => {
                      const turma = turmas.find((t: any) => t.id === a.turmaId);
                      const isSelected = form.alunoId === a.id;
                      return (
                        <TouchableOpacity
                          key={a.id}
                          style={[fStyles.alunoRow, isSelected && fStyles.alunoRowActive]}
                          onPress={() => {
                            set('alunoId', a.id);
                            set('nomeAluno', `${a.nome} ${a.apelido}`);
                            const autoClasse = classeFromTurma(a.turmaId);
                            if (autoClasse) set('classeOrigem', autoClasse);
                          }}
                        >
                          <View style={[fStyles.alunoRowAvatar, isSelected && { backgroundColor: 'rgba(240,165,0,0.2)' }]}>
                            <Text style={[fStyles.alunoRowInitials, isSelected && { color: Colors.gold }]}>
                              {a.nome?.[0]}{a.apelido?.[0]}
                            </Text>
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={[fStyles.alunoRowName, isSelected && { color: Colors.gold }]}>
                              {a.nome} {a.apelido}
                            </Text>
                            {turma && (
                              <Text style={fStyles.alunoRowSub}>{turma.nome}</Text>
                            )}
                          </View>
                          {isSelected && <Ionicons name="checkmark-circle" size={18} color={Colors.gold} />}
                        </TouchableOpacity>
                      );
                    })
                  )}
                </View>

                {alunos.length === 0 && (
                  <TextInput
                    style={fStyles.input}
                    placeholder="Nome completo do aluno"
                    placeholderTextColor={Colors.textMuted}
                    value={form.nomeAluno}
                    onChangeText={v => set('nomeAluno', v)}
                  />
                )}
              </>
            ) : (
              <>
                <Text style={fStyles.label}>Aluno<RequiredMark /></Text>

                {/* Selected student display */}
                {form.alunoId ? (
                  <View style={fStyles.alunoSelectedRow}>
                    <View style={fStyles.alunoSelectedIcon}>
                      <Ionicons name="person" size={16} color={Colors.gold} />
                    </View>
                    <Text style={fStyles.alunoSelectedName}>{form.nomeAluno}</Text>
                    <TouchableOpacity onPress={() => { set('alunoId', null); set('nomeAluno', ''); }}>
                      <Ionicons name="close-circle" size={18} color={Colors.textMuted} />
                    </TouchableOpacity>
                  </View>
                ) : null}

                {/* Search input */}
                <View style={fStyles.searchBox}>
                  <StableSearchInput
                    value={alunoSearch}
                    onChangeText={v => { setAlunoSearch(v); if (!form.alunoId) set('nomeAluno', v); }}
                    inputStyle={fStyles.searchInput}
                    placeholder="Pesquisar aluno existente ou escreva o nome..."
                    iconColor={Colors.textMuted}
                  />
                </View>

                {/* Turma filter chips */}
                {turmas.length > 0 && (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
                    <View style={{ flexDirection: 'row', gap: 6, paddingVertical: 2 }}>
                      <TouchableOpacity
                        style={[fStyles.filterChip, !filterTurmaId && fStyles.filterChipActive]}
                        onPress={() => setFilterTurmaId(null)}
                      >
                        <Text style={[fStyles.filterChipText, !filterTurmaId && fStyles.filterChipTextActive]}>Todas</Text>
                      </TouchableOpacity>
                      {turmas.map((t: any) => (
                        <TouchableOpacity
                          key={t.id}
                          style={[fStyles.filterChip, filterTurmaId === t.id && fStyles.filterChipActive]}
                          onPress={() => setFilterTurmaId(t.id === filterTurmaId ? null : t.id)}
                        >
                          <Text style={[fStyles.filterChipText, filterTurmaId === t.id && fStyles.filterChipTextActive]}>
                            {t.nome}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </ScrollView>
                )}

                {/* Filtered student list (existing students — e.g. re-enrolment) */}
                {alunosFiltrados.length > 0 && (
                  <View style={fStyles.alunoList}>
                    {alunosFiltrados.map((a: any) => {
                      const turma = turmas.find((t: any) => t.id === a.turmaId);
                      const isSelected = form.alunoId === a.id;
                      return (
                        <TouchableOpacity
                          key={a.id}
                          style={[fStyles.alunoRow, isSelected && fStyles.alunoRowActive]}
                          onPress={() => { set('alunoId', a.id); set('nomeAluno', `${a.nome} ${a.apelido}`); setAlunoSearch(`${a.nome} ${a.apelido}`); }}
                        >
                          <View style={[fStyles.alunoRowAvatar, isSelected && { backgroundColor: 'rgba(240,165,0,0.2)' }]}>
                            <Text style={[fStyles.alunoRowInitials, isSelected && { color: Colors.gold }]}>
                              {a.nome?.[0]}{a.apelido?.[0]}
                            </Text>
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={[fStyles.alunoRowName, isSelected && { color: Colors.gold }]}>
                              {a.nome} {a.apelido}
                            </Text>
                            {turma && <Text style={fStyles.alunoRowSub}>{turma.nome}</Text>}
                          </View>
                          {isSelected && <Ionicons name="checkmark-circle" size={18} color={Colors.gold} />}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}
              </>
            )}

            {/* Escola */}
            {isSaida ? (
              <>
                <Text style={fStyles.label}>Escola de Destino</Text>
                <TextInput
                  style={fStyles.input}
                  placeholder="Nome da escola para onde o aluno vai"
                  placeholderTextColor={Colors.textMuted}
                  value={form.escolaDestino ?? ''}
                  onChangeText={v => set('escolaDestino', v)}
                  returnKeyType="next"
                  blurOnSubmit={false}
                />
              </>
            ) : (
              <>
                <Text style={fStyles.label}>Escola de Origem</Text>
                <TextInput
                  style={fStyles.input}
                  placeholder="Nome da escola de onde o aluno vem"
                  placeholderTextColor={Colors.textMuted}
                  value={form.escolaOrigem ?? ''}
                  onChangeText={v => set('escolaOrigem', v)}
                  returnKeyType="next"
                  blurOnSubmit={false}
                />
              </>
            )}

            {/* Classe */}
            <View style={fStyles.row2}>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <Text style={fStyles.label}>{isSaida ? 'Classe Actual' : 'Classe de Origem'}</Text>
                  {isSaida && form.alunoId && form.classeOrigem ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4,
                      backgroundColor: Colors.success + '18', borderRadius: 20,
                      paddingHorizontal: 8, paddingVertical: 2,
                      borderWidth: 1, borderColor: Colors.success + '44' }}>
                      <Ionicons name="sparkles-outline" size={10} color={Colors.success} />
                      <Text style={{ fontSize: 9, fontFamily: 'Inter_600SemiBold', color: Colors.success }}>
                        Auto-detectada
                      </Text>
                    </View>
                  ) : null}
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    {CLASSES_FORM.map(c => (
                      <TouchableOpacity
                        key={c}
                        style={[fStyles.classeChip, form.classeOrigem === c && fStyles.classeChipActive]}
                        onPress={() => set('classeOrigem', c)}
                      >
                        <Text style={[fStyles.classeChipText, form.classeOrigem === c && fStyles.classeChipTextActive]}>{c}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>
              </View>
            </View>

            <View style={{ marginBottom: 12 }}>
              <Text style={fStyles.label}>{isSaida ? 'Classe de Destino' : 'Classe que vai frequentar'}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  {CLASSES_FORM.map(c => (
                    <TouchableOpacity
                      key={c}
                      style={[fStyles.classeChip, form.classeDestino === c && fStyles.classeChipActive]}
                      onPress={() => set('classeDestino', c)}
                    >
                      <Text style={[fStyles.classeChipText, form.classeDestino === c && fStyles.classeChipTextActive]}>{c}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
            </View>

            {/* Turma de destino (entradas) */}
            {!isSaida && turmas.length > 0 && (
              <>
                <Text style={fStyles.label}>Turma de Destino (opcional)</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    <TouchableOpacity
                      style={[fStyles.classeChip, !form.turmaDestinoId && fStyles.classeChipActive]}
                      onPress={() => set('turmaDestinoId', null)}
                    >
                      <Text style={[fStyles.classeChipText, !form.turmaDestinoId && fStyles.classeChipTextActive]}>Nenhuma</Text>
                    </TouchableOpacity>
                    {turmas.map(t => (
                      <TouchableOpacity
                        key={t.id}
                        style={[fStyles.classeChip, form.turmaDestinoId === t.id && fStyles.classeChipActive]}
                        onPress={() => set('turmaDestinoId', t.id)}
                      >
                        <Text style={[fStyles.classeChipText, form.turmaDestinoId === t.id && fStyles.classeChipTextActive]}>{t.nome}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>
              </>
            )}

            {/* Motivo */}
            <Text style={fStyles.label}>Motivo</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                {motivoOpts.map(m => (
                  <TouchableOpacity
                    key={m}
                    style={[fStyles.classeChip, form.motivo === m && fStyles.classeChipActive]}
                    onPress={() => set('motivo', m)}
                  >
                    <Text style={[fStyles.classeChipText, form.motivo === m && fStyles.classeChipTextActive]}>{m}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
            <TextInput
              style={[fStyles.input, { marginBottom: 12 }]}
              placeholder="Ou escreva o motivo..."
              placeholderTextColor={Colors.textMuted}
              value={form.motivo ?? ''}
              onChangeText={v => set('motivo', v)}
              returnKeyType="done"
              onSubmitEditing={handleSave}
            />

            {/* Data de requisição */}
            <Text style={fStyles.label}>Data de Requisição</Text>
            <DateInput
              style={fStyles.input}
              value={form.dataRequisicao ?? ''}
              onChangeText={v => set('dataRequisicao', v)}
            />

            {/* Documentos recebidos (entradas) */}
            {!isSaida && (
              <>
                <TouchableOpacity style={fStyles.docsToggle} onPress={() => setDocsOpen(o => !o)}>
                  <MaterialCommunityIcons name="file-document-multiple-outline" size={16} color={Colors.accent ?? '#4FC3F7'} />
                  <Text style={fStyles.docsToggleText}>
                    Documentos recebidos ({(form.documentosRecebidos ?? []).length})
                  </Text>
                  <Ionicons name={docsOpen ? 'chevron-up' : 'chevron-down'} size={14} color={Colors.textSecondary} />
                </TouchableOpacity>
                {docsOpen && (
                  <View style={fStyles.docsGrid}>
                    {DOCS_OPCOES.map(d => {
                      const checked = (form.documentosRecebidos ?? []).includes(d);
                      return (
                        <TouchableOpacity key={d} style={fStyles.docItem} onPress={() => toggleDoc(d)}>
                          <Ionicons
                            name={checked ? 'checkbox' : 'square-outline'}
                            size={18}
                            color={checked ? Colors.accent ?? '#4FC3F7' : Colors.textMuted}
                          />
                          <Text style={[fStyles.docItemText, checked && { color: Colors.text }]}>{d}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}
              </>
            )}

            {/* Observações */}
            <Text style={fStyles.label}>Observações</Text>
            <TextInput
              style={[fStyles.input, { height: 72, textAlignVertical: 'top' }]}
              placeholder="Notas adicionais..."
              placeholderTextColor={Colors.textMuted}
              multiline
              value={form.observacoes ?? ''}
              onChangeText={v => set('observacoes', v)}
            />

            <TouchableOpacity style={fStyles.saveBtn} onPress={handleSave}>
              <Ionicons name="checkmark-circle" size={18} color="#fff" />
              <Text style={fStyles.saveBtnText}>{initial?.id ? 'Guardar Alterações' : 'Registar Transferência'}</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
          </KeyboardAvoidingView>
</Modal>
  );
}

// ─── Detail Modal ─────────────────────────────────────────────────────────────

function DetailModal({
  item, onClose, onEdit, onStatusChange, onDelete, onGuia,
}: {
  item: Transferencia | null;
  onClose: () => void;
  onEdit: () => void;
  onStatusChange: (status: TransferStatus) => void;
  onDelete: () => void;
  onGuia: () => void;
}) {
  if (!item) return null;
  const cfg = STATUS_CONFIG[item.status];
  const isSaida = item.tipo === 'saida';

  const Row = ({ label, val }: { label: string; val?: string | null }) =>
    val ? (
      <View style={dStyles.row}>
        <Text style={dStyles.rowLabel}>{label}</Text>
        <Text style={dStyles.rowVal}>{val}</Text>
      </View>
    ) : null;

  return (
    <Modal visible={!!item} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
      <View style={dStyles.overlay}>
        <ScrollView contentContainerStyle={dStyles.scrollContent}>
          <View style={dStyles.container}>

            <View style={dStyles.headerRow}>
              <View>
                <TipoBadge tipo={item.tipo} />
                <Text style={dStyles.name}>{item.nomeAluno}</Text>
              </View>
              <TouchableOpacity onPress={onClose} style={dStyles.closeBtn}>
                <Ionicons name="close" size={20} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <View style={[dStyles.statusBar, { backgroundColor: cfg.bg, borderColor: cfg.color }]}>
              <Ionicons name={cfg.icon as any} size={16} color={cfg.color} />
              <Text style={[dStyles.statusText, { color: cfg.color }]}>{cfg.label}</Text>
            </View>

            <View style={dStyles.section}>
              <Text style={dStyles.sectionLabel}>{isSaida ? 'DESTINO' : 'ORIGEM'}</Text>
              <Row label="Escola" val={isSaida ? item.escolaDestino : item.escolaOrigem} />
              <Row label="Classe de Origem" val={item.classeOrigem} />
              <Row label="Classe de Destino" val={item.classeDestino} />
            </View>

            <View style={dStyles.section}>
              <Text style={dStyles.sectionLabel}>DETALHES</Text>
              <Row label="Motivo" val={item.motivo} />
              <Row label="Data Requisição" val={fmtDate(item.dataRequisicao)} />
              <Row label="Data Aprovação" val={fmtDate(item.dataAprovacao)} />
              <Row label="Data Conclusão" val={fmtDate(item.dataConclusao)} />
            </View>

            {!isSaida && (item.documentosRecebidos ?? []).length > 0 && (
              <View style={dStyles.section}>
                <Text style={dStyles.sectionLabel}>DOCUMENTOS RECEBIDOS</Text>
                {(item.documentosRecebidos ?? []).map(d => (
                  <View key={d} style={dStyles.docRow}>
                    <Ionicons name="document-text" size={13} color={Colors.accent ?? '#4FC3F7'} />
                    <Text style={dStyles.docText}>{d}</Text>
                  </View>
                ))}
              </View>
            )}

            {item.observacoes ? (
              <View style={dStyles.section}>
                <Text style={dStyles.sectionLabel}>OBSERVAÇÕES</Text>
                <Text style={dStyles.obs}>{item.observacoes}</Text>
              </View>
            ) : null}

            {/* Status actions */}
            {item.status === 'pendente' && (
              <View style={dStyles.actionsRow}>
                <TouchableOpacity style={[dStyles.actionBtn, { borderColor: '#3b82f6' }]} onPress={() => onStatusChange('aprovado')}>
                  <Ionicons name="checkmark-circle" size={15} color="#3b82f6" />
                  <Text style={[dStyles.actionBtnText, { color: '#3b82f6' }]}>Aprovar</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[dStyles.actionBtn, { borderColor: '#ef4444' }]} onPress={() => onStatusChange('rejeitado')}>
                  <Ionicons name="close-circle" size={15} color="#ef4444" />
                  <Text style={[dStyles.actionBtnText, { color: '#ef4444' }]}>Rejeitar</Text>
                </TouchableOpacity>
              </View>
            )}
            {item.status === 'aprovado' && (
              <TouchableOpacity style={[dStyles.actionBtn, { borderColor: '#10b981', marginBottom: 12 }]} onPress={() => onStatusChange('concluido')}>
                <Ionicons name="checkmark-done-circle" size={15} color="#10b981" />
                <Text style={[dStyles.actionBtnText, { color: '#10b981' }]}>Marcar como Concluída</Text>
              </TouchableOpacity>
            )}

            {isSaida && (
              <TouchableOpacity style={dStyles.guiaBtn} onPress={onGuia}>
                <MaterialCommunityIcons name="file-document-edit-outline" size={16} color="#fff" />
                <Text style={dStyles.guiaBtnText}>Gerar Guia de Transferência</Text>
              </TouchableOpacity>
            )}

            <View style={dStyles.footerRow}>
              <TouchableOpacity style={dStyles.editBtn} onPress={onEdit}>
                <Ionicons name="pencil" size={14} color={Colors.accent ?? '#4FC3F7'} />
                <Text style={[dStyles.editBtnText, { color: Colors.accent ?? '#4FC3F7' }]}>Editar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={dStyles.delBtn} onPress={onDelete}>
                <Ionicons name="trash-outline" size={14} color="#ef4444" />
                <Text style={dStyles.delBtnText}>Eliminar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={dStyles.closeFooterBtn} onPress={onClose}>
                <Text style={dStyles.closeFooterBtnText}>Fechar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </View>
          </KeyboardAvoidingView>
</Modal>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function TransferenciasScreen() {
  const { user } = useAuth();
  const { config } = useConfig();
  const { alunos, turmas } = useData();
  const tem13 = (config as any).temDecimaTermeira !== false;
  const CLASSES_AO_FILTRADAS = tem13
    ? CLASSES_AO
    : CLASSES_AO.filter(c => c !== '13ª Classe');
  const { showToast } = useToast();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [transferencias, setTransferencias] = useState<Transferencia[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [filter, setFilter] = useState<'todos' | 'saida' | 'entrada'>('todos');
  const [statusFilter, setStatusFilter] = useState<TransferStatus | 'todos'>('todos');
  const [search, setSearch] = useState('');

  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<Partial<Transferencia> | null>(null);
  const [detailItem, setDetailItem] = useState<Transferencia | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const rows = await api.get<Transferencia[]>('/api/transferencias');
      setTransferencias(rows ?? []);
    } catch (e: any) {
      if (!silent) showToast('Erro ao carregar transferências', 'error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const onRefresh = useCallback(() => { setRefreshing(true); load(true); }, [load]);

  const filtered = useMemo(() => {
    let list = transferencias;
    if (filter !== 'todos') list = list.filter(t => t.tipo === filter);
    if (statusFilter !== 'todos') list = list.filter(t => t.status === statusFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(t =>
        t.nomeAluno.toLowerCase().includes(q) ||
        (t.escolaOrigem ?? '').toLowerCase().includes(q) ||
        (t.escolaDestino ?? '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [transferencias, filter, statusFilter, search]);

  const stats = useMemo(() => ({
    total: transferencias.length,
    saidas: transferencias.filter(t => t.tipo === 'saida').length,
    entradas: transferencias.filter(t => t.tipo === 'entrada').length,
    pendentes: transferencias.filter(t => t.status === 'pendente').length,
  }), [transferencias]);

  async function handleSave(data: Partial<Transferencia>) {
    try {
      if (editItem?.id) {
        const updated = await api.put<Transferencia>(`/api/transferencias/${editItem.id}`, data);
        setTransferencias(prev => prev.map(t => t.id === updated.id ? updated : t));
        showToast('Transferência actualizada', 'success');
      } else {
        const created = await api.post<Transferencia>('/api/transferencias', { ...data, criadoPor: user?.email });
        setTransferencias(prev => [created, ...prev]);
        showToast('Transferência registada', 'success');
      }
      setShowForm(false);
      setEditItem(null);
    } catch (e: any) {
      showToast('Erro ao guardar transferência', 'error');
    }
  }

  async function handleStatusChange(item: Transferencia, status: TransferStatus) {
    try {
      const updated = await api.patch<Transferencia>(`/api/transferencias/${item.id}/status`, { status });
      setTransferencias(prev => prev.map(t => t.id === updated.id ? updated : t));
      if (detailItem?.id === item.id) setDetailItem(updated);
      showToast(`Transferência marcada como ${STATUS_CONFIG[status].label.toLowerCase()}`, 'success');
    } catch (e: any) {
      showToast('Erro ao actualizar estado', 'error');
    }
  }

  function handleDelete(item: Transferencia) {
    webAlert(
      'Eliminar Transferência',
      `Confirma a eliminação do processo de transferência de "${item.nomeAluno}"?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar', style: 'destructive',
          onPress: async () => {
            try {
              await api.delete(`/api/transferencias/${item.id}`);
              setTransferencias(prev => prev.filter(t => t.id !== item.id));
              setDetailItem(null);
              showToast('Transferência eliminada', 'success');
            } catch { showToast('Erro ao eliminar', 'error'); }
          }
        }
      ]
    );
  }

  function openGuia(item: Transferencia) {
    setDetailItem(null);
    router.push('/(main)/gerar-documento' as any);
  }

  if (loading) return <SkeletonPage variant="stats-list" />;

  return (
    <View style={styles.root}>
      <TopBar title="Transferências" />

      {/* Stats */}
      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statNum}>{stats.total}</Text>
          <Text style={styles.statLabel}>Total</Text>
        </View>
        <View style={[styles.statCard, { borderColor: '#3b82f6' }]}>
          <Text style={[styles.statNum, { color: '#3b82f6' }]}>{stats.saidas}</Text>
          <Text style={styles.statLabel}>Saídas</Text>
        </View>
        <View style={[styles.statCard, { borderColor: '#10b981' }]}>
          <Text style={[styles.statNum, { color: '#10b981' }]}>{stats.entradas}</Text>
          <Text style={styles.statLabel}>Entradas</Text>
        </View>
        <View style={[styles.statCard, { borderColor: '#f59e0b' }]}>
          <Text style={[styles.statNum, { color: '#f59e0b' }]}>{stats.pendentes}</Text>
          <Text style={styles.statLabel}>Pendentes</Text>
        </View>
      </View>

      {/* Search */}
      <View style={styles.searchRow}>
        <View style={styles.searchBox}>
          <StableSearchInput
            value={search}
            onChangeText={setSearch}
            inputStyle={styles.searchInput}
            placeholder="Pesquisar aluno ou escola..."
            iconColor={Colors.textMuted}
          />
        </View>
      </View>

      {/* Filters */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filtersScroll} contentContainerStyle={styles.filtersContent}>
        {([['todos', 'Todos'], ['saida', 'Saídas'], ['entrada', 'Entradas']] as const).map(([val, label]) => (
          <TouchableOpacity
            key={val}
            style={[styles.filterChip, filter === val && styles.filterChipActive]}
            onPress={() => setFilter(val)}
          >
            <Text style={[styles.filterChipText, filter === val && styles.filterChipTextActive]}>{label}</Text>
          </TouchableOpacity>
        ))}
        <View style={styles.filterSep} />
        {([['todos', 'Qualquer estado'], ['pendente', 'Pendentes'], ['aprovado', 'Aprovados'], ['concluido', 'Concluídos'], ['rejeitado', 'Rejeitados']] as const).map(([val, label]) => (
          <TouchableOpacity
            key={val}
            style={[styles.filterChip, statusFilter === val && styles.filterChipActive]}
            onPress={() => setStatusFilter(val)}
          >
            <Text style={[styles.filterChipText, statusFilter === val && styles.filterChipTextActive]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* List */}
      {loading ? (
        <View style={styles.center}>
          <AppLoader color={Colors.accent ?? '#4FC3F7'} size="large" />
        </View>
      ) : filtered.length === 0 ? (
        <View style={styles.center}>
          <MaterialCommunityIcons name="transfer" size={48} color={Colors.textMuted} />
          <Text style={styles.emptyText}>
            {transferencias.length === 0
              ? 'Nenhuma transferência registada.\nUse o botão + para registar.'
              : 'Nenhum resultado encontrado.'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={i => i.id}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 80 }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.accent ?? '#4FC3F7'} />}
          renderItem={({ item }) => (
            <TransferenciaCard
              item={item}
              onPress={() => setDetailItem(item)}
              onStatusChange={t => handleStatusChange(t, t.status)}
            />
          )}
        />
      )}

      {/* FAB */}
      <View style={[styles.fab, { bottom: insets.bottom + 20 }]}>
        <TouchableOpacity style={[styles.fabBtn, { backgroundColor: '#3b82f6' }]} onPress={() => { setEditItem(emptyForm('saida')); setShowForm(true); }}>
          <Ionicons name="arrow-up-circle" size={20} color="#fff" />
          <Text style={styles.fabText}>Nova Saída</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.fabBtn, { backgroundColor: '#10b981' }]} onPress={() => { setEditItem(emptyForm('entrada')); setShowForm(true); }}>
          <Ionicons name="arrow-down-circle" size={20} color="#fff" />
          <Text style={styles.fabText}>Nova Entrada</Text>
        </TouchableOpacity>
      </View>

      {/* Modals */}
      <FormModal
        visible={showForm}
        onClose={() => { setShowForm(false); setEditItem(null); }}
        onSave={handleSave}
        initial={editItem}
        alunos={alunos}
        turmas={turmas}
      />

      <DetailModal
        item={detailItem}
        onClose={() => setDetailItem(null)}
        onEdit={() => { setEditItem(detailItem); setDetailItem(null); setShowForm(true); }}
        onStatusChange={s => detailItem && handleStatusChange(detailItem, s)}
        onDelete={() => detailItem && handleDelete(detailItem)}
        onGuia={() => detailItem && openGuia(detailItem)}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const GLASS = 'rgba(255,255,255,0.06)';
const BORDER = 'rgba(255,255,255,0.1)';

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 32 },
  emptyText: { color: Colors.textSecondary, textAlign: 'center', fontSize: 14, lineHeight: 22 },

  statsRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4, flexWrap: 'wrap' },
  statCard: { flex: 1, minWidth: 76, backgroundColor: GLASS, borderWidth: 1, borderColor: BORDER, borderRadius: 10, padding: 10, alignItems: 'center' },
  statNum: { fontSize: 20, fontWeight: '700', color: Colors.text },
  statLabel: { fontSize: 11, color: Colors.textSecondary, marginTop: 2 },

  searchRow: { paddingHorizontal: 16, paddingVertical: 8 },
  searchBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: GLASS, borderWidth: 1, borderColor: BORDER, borderRadius: 10, paddingHorizontal: 12, gap: 8 },
  searchInput: { flex: 1, color: Colors.text, fontSize: 14, paddingVertical: 10 },

  filtersScroll: { maxHeight: 58 },
  filtersContent: { paddingHorizontal: 16, gap: 8, alignItems: 'center' },
  filterChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: GLASS, borderWidth: 1, borderColor: BORDER },
  filterChipActive: { backgroundColor: Colors.accent ?? '#4FC3F7', borderColor: Colors.accent ?? '#4FC3F7' },
  filterChipText: { color: Colors.textSecondary, fontSize: 12, fontWeight: '500' },
  filterChipTextActive: { color: '#fff' },
  filterSep: { width: 1, height: 20, backgroundColor: BORDER },

  list: { paddingHorizontal: 16, paddingTop: 8, gap: 10 },

  card: { backgroundColor: GLASS, borderWidth: 1, borderColor: BORDER, borderRadius: 14, padding: 14 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  cardHeaderLeft: { flexDirection: 'row', gap: 6 },
  cardDate: { fontSize: 11, color: Colors.textMuted },
  cardName: { fontSize: 15, fontWeight: '700', color: Colors.text, marginBottom: 4 },
  cardRoute: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 4 },
  cardRouteText: { fontSize: 13, color: Colors.textSecondary },
  cardRouteClass: { fontSize: 12, color: Colors.textMuted },
  cardMotivo: { fontSize: 12, color: Colors.textMuted, marginBottom: 8 },
  cardActions: { flexDirection: 'row', gap: 8, marginTop: 4 },
  cardActionBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, borderWidth: 1, borderColor: '#3b82f6' },
  cardActionText: { fontSize: 12, fontWeight: '600' },

  badge: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6, borderWidth: 1 },
  badgeText: { fontSize: 11, fontWeight: '600' },
  tipoBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6, borderWidth: 1 },
  tipoBadgeText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },

  fab: { position: 'absolute', left: 12, flexDirection: 'column', gap: 8, alignItems: 'flex-start' },
  fabBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 24, elevation: 4, minWidth: 112, justifyContent: 'center' },
  fabText: { color: '#fff', fontWeight: '700', fontSize: 13 },
});

const fStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center' },
  container: { backgroundColor: Colors.surface ?? '#1a2540', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '92%' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  title: { fontSize: 18, fontWeight: '700', color: Colors.text },
  label: { fontSize: 12, fontWeight: '600', color: Colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6, marginTop: 12 },
  input: { backgroundColor: 'rgba(255,255,255,0.07)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', borderRadius: 10, color: Colors.text, fontSize: 14, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 4 },
  tipoRow: { gap: 8, marginBottom: 4 },
  tipoBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', backgroundColor: 'rgba(255,255,255,0.04)' },
  tipoBtnActive: { backgroundColor: Colors.accent ?? '#4FC3F7', borderColor: Colors.accent ?? '#4FC3F7' },
  tipoBtnText: { color: Colors.textSecondary, fontWeight: '600', fontSize: 14 },
  tipoBtnTextActive: { color: '#fff' },
  searchBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.07)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, marginBottom: 8 },
  searchInput: { flex: 1, color: Colors.text, fontSize: 14, paddingVertical: 0 },
  filterChip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  filterChipActive: { backgroundColor: 'rgba(240,165,0,0.2)', borderColor: Colors.gold },
  filterChipText: { color: Colors.textSecondary, fontSize: 12, fontWeight: '500' },
  filterChipTextActive: { color: Colors.gold, fontWeight: '700' },
  alunoList: { borderRadius: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', overflow: 'hidden', marginBottom: 4, maxHeight: 220 },
  alunoRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)', backgroundColor: 'rgba(255,255,255,0.03)' },
  alunoRowActive: { backgroundColor: 'rgba(240,165,0,0.1)', borderLeftWidth: 3, borderLeftColor: Colors.gold },
  alunoRowAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' },
  alunoRowInitials: { fontSize: 13, fontWeight: '700', color: Colors.textSecondary },
  alunoRowName: { fontSize: 14, fontWeight: '600', color: Colors.text },
  alunoRowSub: { fontSize: 11, color: Colors.textMuted, marginTop: 1 },
  alunoEmptyRow: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 16, justifyContent: 'center' },
  alunoEmptyText: { color: Colors.textMuted, fontSize: 13 },
  alunoSelectedRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: 'rgba(240,165,0,0.1)', borderWidth: 1, borderColor: 'rgba(240,165,0,0.3)', borderRadius: 10, padding: 10, marginBottom: 8 },
  alunoSelectedIcon: { width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(240,165,0,0.15)', alignItems: 'center', justifyContent: 'center' },
  alunoSelectedName: { flex: 1, color: Colors.text, fontSize: 14, fontWeight: '600' },
  classeChip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  classeChipActive: { backgroundColor: Colors.primary ?? '#3b5bdb', borderColor: Colors.primary ?? '#3b5bdb' },
  classeChipText: { color: Colors.textSecondary, fontSize: 12 },
  classeChipTextActive: { color: '#fff' },
  row2: { flexDirection: 'row', gap: 12 },
  docsToggle: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 10, borderTopWidth: 1, borderBottomWidth: 1, borderColor: 'rgba(255,255,255,0.08)', marginTop: 8, marginBottom: 4 },
  docsToggleText: { flex: 1, color: Colors.textSecondary, fontSize: 13, fontWeight: '600' },
  docsGrid: { gap: 4, marginBottom: 8 },
  docItem: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
  docItemText: { color: Colors.textMuted, fontSize: 13 },
  saveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: Colors.accent ?? '#4FC3F7', borderRadius: 12, paddingVertical: 14, marginTop: 20 },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});

const dStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' },
  scrollContent: { flexGrow: 1, justifyContent: 'flex-end' },
  container: { backgroundColor: Colors.surface ?? '#1a2540', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
  name: { fontSize: 18, fontWeight: '700', color: Colors.text, marginTop: 6 },
  closeBtn: { padding: 4 },
  statusBar: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: 10, borderWidth: 1, marginBottom: 16 },
  statusText: { fontWeight: '700', fontSize: 14 },
  section: { marginBottom: 14, backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: 12 },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: Colors.textMuted, letterSpacing: 0.8, marginBottom: 8 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  rowLabel: { fontSize: 13, color: Colors.textSecondary, flex: 1 },
  rowVal: { fontSize: 13, color: Colors.text, flex: 2, textAlign: 'right' },
  docRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 3 },
  docText: { fontSize: 13, color: Colors.textSecondary },
  obs: { fontSize: 13, color: Colors.textSecondary, lineHeight: 20 },
  actionsRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 10, borderWidth: 1 },
  actionBtnText: { fontWeight: '700', fontSize: 13 },
  guiaBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#1d4ed8', borderRadius: 10, paddingVertical: 12, marginBottom: 14 },
  guiaBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  footerRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  editBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: Colors.accent ?? '#4FC3F7' },
  editBtnText: { fontWeight: '600', fontSize: 13 },
  delBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: '#ef4444' },
  delBtnText: { color: '#ef4444', fontWeight: '600', fontSize: 13 },
  closeFooterBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 10, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.07)' },
  closeFooterBtnText: { color: Colors.textSecondary, fontWeight: '600', fontSize: 13 },
});
