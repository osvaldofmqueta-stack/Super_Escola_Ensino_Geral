import React, { useState, useEffect, useMemo } from 'react';
import {KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View} from 'react-native';
import AppLoader from '@/components/AppLoader';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '@/constants/colors';
import { useAnoAcademico, Trimestre, AnoAcademico, EpocasExame, EpocaExameItem } from '@/context/AnoAcademicoContext';
import { useData, Evento } from '@/context/DataContext';
import { useProfessor, CalendarioProva } from '@/context/ProfessorContext';
import { useAuth } from '@/context/AuthContext';
import TopBar from '@/components/TopBar';
import { SkeletonList } from '@/components/Skeleton';
import { alertSucesso, alertErro } from '@/utils/toast';
import { webAlert } from '@/utils/webAlert';

import { HScrollTabBar } from '@/components/HScrollTabBar';
import { useTabMemory } from '@/hooks/useTabMemory';
// ─────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────
const TRIM_COLORS = ['#3498DB', '#2ECC71', '#E67E22'] as const;
const TRIM_NAMES  = ['1.º Trimestre', '2.º Trimestre', '3.º Trimestre'] as const;
const MESES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'] as const;
const MESES_FULL = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'] as const;

const FERIADOS_NACIONAIS = [
  { dia: '01-01', nome: 'Ano Novo' },
  { dia: '04-02', nome: 'Início da Luta Armada de Libertação Nacional' },
  { dia: '08-03', nome: 'Dia Internacional da Mulher' },
  { dia: '04-04', nome: 'Dia da Paz e Reconciliação Nacional' },
  { dia: '01-05', nome: 'Dia do Trabalhador' },
  { dia: '25-05', nome: 'Dia de África' },
  { dia: '01-06', nome: 'Dia Internacional da Criança' },
  { dia: '17-09', nome: 'Dia do Herói Nacional (Agostinho Neto)' },
  { dia: '02-11', nome: 'Dia dos Finados' },
  { dia: '11-11', nome: 'Dia da Proclamação da Independência Nacional' },
  { dia: '10-12', nome: 'Dia dos Direitos Humanos' },
  { dia: '25-12', nome: 'Natal' },
];

const PROVA_TIPO_COLOR: Record<string, string> = {
  teste:      Colors.info,
  exame:      Colors.danger,
  trabalho:   Colors.gold,
  prova_oral: '#9B59B6',
};
const PROVA_TIPO_LABEL: Record<string, string> = {
  teste:      'Teste',
  exame:      'Exame',
  trabalho:   'Trabalho',
  prova_oral: 'Prova Oral',
};

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────
function diffDays(a: string, b: string) {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000);
}
function diffWeeks(a: string, b: string) {
  return Math.round(diffDays(a, b) / 7);
}
function formatDate(d: string) {
  if (!d) return '—';
  const [y, m, dd] = d.split('-');
  return `${dd}/${m}/${y}`;
}
function todayStr() {
  return new Date().toISOString().split('T')[0];
}
function trimProgress(t: Trimestre): number {
  const today = todayStr();
  if (today < t.dataInicio) return 0;
  if (today > t.dataFim)    return 100;
  return Math.min(100, Math.round(diffDays(t.dataInicio, today) / diffDays(t.dataInicio, t.dataFim) * 100));
}

// ─────────────────────────────────────────────────────────────
// TRIMESTRE EDIT MODAL
// ─────────────────────────────────────────────────────────────
function TrimestreModal({ visible, trimestre, onClose, onSave }: {
  visible: boolean;
  trimestre: Trimestre | null;
  onClose: () => void;
  onSave: (t: Trimestre) => void;
}) {
  const [form, setForm] = useState<Trimestre>(trimestre ?? {
    numero: 1, dataInicio: '', dataFim: '', dataInicioExames: '', dataFimExames: '', ativo: false,
  });
  useEffect(() => {
    if (trimestre) setForm(trimestre);
  }, [trimestre]);

  const set = (k: keyof Trimestre, v: any) => setForm(f => ({ ...f, [k]: v }));

  function handleSave() {
    if (!form.dataInicio || !form.dataFim) {
      webAlert('Campos obrigatórios', 'Preencha Data Início e Data Fim do trimestre.');
      return;
    }
    if (form.dataFim < form.dataInicio) {
      webAlert('Datas inválidas', 'A data de fim deve ser posterior à data de início.');
      return;
    }
    onSave(form);
  }

  const idx = (form.numero || 1) - 1;
  const color = TRIM_COLORS[idx];

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
      <View style={mS.overlay}>
        <View style={mS.container}>
          <View style={[mS.header, { borderLeftColor: color, borderLeftWidth: 4 }]}>
            <Text style={mS.title}>{TRIM_NAMES[idx]}</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={22} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>
          <ScrollView showsVerticalScrollIndicator={false}>
            <Text style={mS.sectionLabel}>PERÍODO LECTIVO</Text>
            {[
              { label: 'Data de Início', key: 'dataInicio', ph: 'AAAA-MM-DD' },
              { label: 'Data de Fim', key: 'dataFim', ph: 'AAAA-MM-DD' },
            ].map(f => (
              <View key={f.key} style={mS.field}>
                <Text style={mS.fieldLabel}>{f.label}</Text>
                <TextInput
                  style={mS.input}
                  value={(form as any)[f.key] ?? ''}
                  onChangeText={v => set(f.key as keyof Trimestre, v)}
                  placeholder={f.ph}
                  placeholderTextColor={Colors.textMuted}
                  returnKeyType="done"
                  onSubmitEditing={handleSave}
                />
              </View>
            ))}

            <Text style={[mS.sectionLabel, { marginTop: 16 }]}>PERÍODO DE EXAMES</Text>
            {[
              { label: 'Início dos Exames', key: 'dataInicioExames', ph: 'AAAA-MM-DD (opcional)' },
              { label: 'Fim dos Exames', key: 'dataFimExames', ph: 'AAAA-MM-DD (opcional)' },
            ].map(f => (
              <View key={f.key} style={mS.field}>
                <Text style={mS.fieldLabel}>{f.label}</Text>
                <TextInput
                  style={mS.input}
                  value={(form as any)[f.key] ?? ''}
                  onChangeText={v => set(f.key as keyof Trimestre, v)}
                  placeholder={f.ph}
                  placeholderTextColor={Colors.textMuted}
                  returnKeyType="done"
                  onSubmitEditing={handleSave}
                />
              </View>
            ))}

            <View style={mS.field}>
              <TouchableOpacity
                style={[mS.toggleBtn, form.ativo && { backgroundColor: `${color}20`, borderColor: color }]}
                onPress={() => set('ativo', !form.ativo)}
              >
                <Ionicons name={form.ativo ? 'radio-button-on' : 'radio-button-off'} size={18} color={form.ativo ? color : Colors.textMuted} />
                <Text style={[mS.toggleText, form.ativo && { color }]}>Trimestre activo (em curso)</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>

          <TouchableOpacity style={[mS.saveBtn, { backgroundColor: color }]} onPress={handleSave}>
            <Ionicons name="checkmark" size={18} color="#fff" />
            <Text style={mS.saveBtnText}>Guardar</Text>
          </TouchableOpacity>
        </View>
      </View>
          </KeyboardAvoidingView>
</Modal>
  );
}

// ─────────────────────────────────────────────────────────────
// FERIADO MODAL
// ─────────────────────────────────────────────────────────────
function FeriadoModal({ visible, evento, anoAtivo, onClose, onSave }: {
  visible: boolean;
  evento: Evento | null;
  anoAtivo: AnoAcademico | null;
  onClose: () => void;
  onSave: (e: Partial<Evento>) => void;
}) {
  const ano = anoAtivo?.ano?.split('/')?.[0] ?? String(new Date().getFullYear());
  const [form, setForm] = useState<Partial<Evento>>(evento || {
    titulo: '', descricao: '', data: `${ano}-01-01`, hora: '', tipo: 'Feriado', local: '',
  });
  useEffect(() => {
    setForm(evento || { titulo: '', descricao: '', data: `${ano}-01-01`, hora: '', tipo: 'Feriado', local: '' });
  }, [evento, visible]);
  const set = (k: keyof Evento, v: any) => setForm(f => ({ ...f, [k]: v }));

  function handleSaveFeriado() {
    if (!form.titulo || !form.data) {
      webAlert('Campos obrigatórios', 'Preencha nome e data.'); return;
    }
    onSave(form);
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
      <View style={mS.overlay}>
        <View style={mS.container}>
          <View style={mS.header}>
            <Text style={mS.title}>{evento ? 'Editar Feriado' : 'Novo Feriado'}</Text>
            <TouchableOpacity onPress={onClose}><Ionicons name="close" size={22} color={Colors.textSecondary} /></TouchableOpacity>
          </View>
          <ScrollView showsVerticalScrollIndicator={false}>
            {[
              { label: 'Nome', key: 'titulo', ph: 'Ex: Dia da Independência' },
              { label: 'Data (AAAA-MM-DD)', key: 'data', ph: `${ano}-11-11` },
              { label: 'Descrição (opcional)', key: 'descricao', ph: 'Nota adicional...' },
            ].map(f => (
              <View key={f.key} style={mS.field}>
                <Text style={mS.fieldLabel}>{f.label}</Text>
                <TextInput
                  style={mS.input}
                  value={(form as any)[f.key] ?? ''}
                  onChangeText={v => set(f.key as keyof Evento, v)}
                  placeholder={f.ph}
                  placeholderTextColor={Colors.textMuted}
                  multiline={f.key === 'descricao'}
                  returnKeyType={f.key === 'descricao' ? undefined : 'done'}
                  onSubmitEditing={f.key === 'descricao' ? undefined : handleSaveFeriado}
                />
              </View>
            ))}
          </ScrollView>
          <TouchableOpacity style={[mS.saveBtn, { backgroundColor: Colors.warning }]} onPress={handleSaveFeriado}>
            <Ionicons name="checkmark" size={18} color="#fff" />
            <Text style={mS.saveBtnText}>Guardar Feriado</Text>
          </TouchableOpacity>
        </View>
      </View>
          </KeyboardAvoidingView>
</Modal>
  );
}

// ─────────────────────────────────────────────────────────────
// PROVA MODAL
// ─────────────────────────────────────────────────────────────
function ProvaModal({ visible, prova, onClose, onSave }: {
  visible: boolean;
  prova: CalendarioProva | null;
  onClose: () => void;
  onSave: (p: Partial<CalendarioProva>) => void;
}) {
  const [form, setForm] = useState<Partial<CalendarioProva>>(prova || {
    titulo: '', descricao: '', disciplina: '', data: todayStr(), hora: '08:00',
    tipo: 'teste', publicado: false, turmasIds: [],
  });
  useEffect(() => {
    setForm(prova || { titulo: '', descricao: '', disciplina: '', data: todayStr(), hora: '08:00', tipo: 'teste', publicado: false, turmasIds: [] });
  }, [prova, visible]);
  const set = (k: keyof CalendarioProva, v: any) => setForm(f => ({ ...f, [k]: v }));

  function handleSaveProva() {
    if (!form.titulo || !form.disciplina || !form.data) {
      webAlert('Campos obrigatórios', 'Preencha título, disciplina e data.'); return;
    }
    onSave(form);
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
      <View style={mS.overlay}>
        <View style={mS.container}>
          <View style={mS.header}>
            <Text style={mS.title}>{prova ? 'Editar Prova' : 'Nova Prova / Exame'}</Text>
            <TouchableOpacity onPress={onClose}><Ionicons name="close" size={22} color={Colors.textSecondary} /></TouchableOpacity>
          </View>
          <ScrollView showsVerticalScrollIndicator={false}>
            {[
              { label: 'Título', key: 'titulo', ph: 'Ex: Teste Formativo de Matemática' },
              { label: 'Disciplina', key: 'disciplina', ph: 'Ex: Matemática' },
              { label: 'Data (AAAA-MM-DD)', key: 'data', ph: '2025-03-15' },
              { label: 'Hora (HH:MM)', key: 'hora', ph: '08:00' },
              { label: 'Descrição (opcional)', key: 'descricao', ph: 'Conteúdos abrangidos...' },
            ].map(f => (
              <View key={f.key} style={mS.field}>
                <Text style={mS.fieldLabel}>{f.label}</Text>
                <TextInput
                  style={mS.input}
                  value={(form as any)[f.key] ?? ''}
                  onChangeText={v => set(f.key as keyof CalendarioProva, v)}
                  placeholder={f.ph}
                  placeholderTextColor={Colors.textMuted}
                  multiline={f.key === 'descricao'}
                  returnKeyType={f.key === 'descricao' ? undefined : 'done'}
                  onSubmitEditing={f.key === 'descricao' ? undefined : handleSaveProva}
                />
              </View>
            ))}
            <View style={mS.field}>
              <Text style={mS.fieldLabel}>Tipo</Text>
              <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                {(['teste','exame','trabalho','prova_oral'] as const).map(t => {
                  const active = form.tipo === t;
                  const col = PROVA_TIPO_COLOR[t];
                  return (
                    <TouchableOpacity key={t}
                      style={[mS.tipoBtn, active && { backgroundColor: `${col}20`, borderColor: col }]}
                      onPress={() => set('tipo', t)}
                    >
                      <Text style={[mS.tipoText, active && { color: col }]}>{PROVA_TIPO_LABEL[t]}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          </ScrollView>
          <TouchableOpacity style={[mS.saveBtn, { backgroundColor: Colors.danger }]} onPress={handleSaveProva}>
            <Ionicons name="checkmark" size={18} color="#fff" />
            <Text style={mS.saveBtnText}>Guardar</Text>
          </TouchableOpacity>
        </View>
      </View>
          </KeyboardAvoidingView>
</Modal>
  );
}

// ─────────────────────────────────────────────────────────────
// ÉPOCA CONFIGS
// ─────────────────────────────────────────────────────────────
const EPOCAS_CFG = [
  { key: 'normal',   label: 'Época Normal',     color: '#E74C3C', icon: 'school'          as const },
  { key: 'recurso',  label: 'Época de Recurso',  color: '#E67E22', icon: 'refresh-circle' as const },
  { key: 'especial', label: 'Época Especial',    color: '#9B59B6', icon: 'star'            as const },
] as const;

type EpocaKey = 'normal' | 'recurso' | 'especial';

// ─────────────────────────────────────────────────────────────
// CALENDAR RANGE PICKER (visual, tap to select)
// ─────────────────────────────────────────────────────────────
function CalRangePicker({ start, end, color, onChange }: {
  start: string; end: string; color: string;
  onChange: (s: string, e: string) => void;
}) {
  const today = todayStr();
  const getInitialYm = () => (start ? start.slice(0, 7) : today.slice(0, 7));
  const [ym, setYm] = useState(getInitialYm);

  useEffect(() => { if (start) setYm(start.slice(0, 7)); }, [start]);

  const [y, m0] = ym.split('-').map(Number);
  const m = m0 - 1;
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const firstDow = new Date(y, m, 1).getDay();

  const pad = (n: number) => String(n).padStart(2, '0');
  const toDate = (day: number) => `${y}-${pad(m + 1)}-${pad(day)}`;

  function prevMon() { const d = new Date(y, m - 1, 1); setYm(`${d.getFullYear()}-${pad(d.getMonth() + 1)}`); }
  function nextMon() { const d = new Date(y, m + 1, 1); setYm(`${d.getFullYear()}-${pad(d.getMonth() + 1)}`); }

  function handleDay(day: number) {
    const d = toDate(day);
    if (!start || (start && end)) {
      onChange(d, '');
    } else {
      if (d === start) { onChange('', ''); }
      else if (d < start) { onChange(d, start); }
      else { onChange(start, d); }
    }
  }

  return (
    <View style={crS.wrap}>
      <View style={crS.nav}>
        <TouchableOpacity style={crS.navBtn} onPress={prevMon}>
          <Ionicons name="chevron-back" size={18} color={Colors.text} />
        </TouchableOpacity>
        <Text style={crS.navLabel}>{MESES_FULL[m]} {y}</Text>
        <TouchableOpacity style={crS.navBtn} onPress={nextMon}>
          <Ionicons name="chevron-forward" size={18} color={Colors.text} />
        </TouchableOpacity>
      </View>

      <View style={crS.grid}>
        {['D','S','T','Q','Q','S','S'].map((lbl, i) => (
          <Text key={i} style={crS.dow}>{lbl}</Text>
        ))}
        {Array.from({ length: firstDow }, (_, i) => <View key={`e${i}`} style={crS.cell} />)}
        {Array.from({ length: daysInMonth }, (_, i) => {
          const day = i + 1;
          const d = toDate(day);
          const isStart = d === start;
          const isEnd = d === end;
          const inRange = !!(start && end && d > start && d < end);
          const isToday = d === today;
          return (
            <TouchableOpacity
              key={day}
              style={[
                crS.cell,
                inRange && { backgroundColor: `${color}28` },
                (isStart || isEnd) && { backgroundColor: color, borderRadius: 8 },
                isToday && !isStart && !isEnd && { borderWidth: 1.5, borderColor: color, borderRadius: 8 },
              ]}
              onPress={() => handleDay(day)}
              activeOpacity={0.7}
            >
              <Text style={[
                crS.cellNum,
                (isStart || isEnd) && { color: '#fff', fontFamily: 'Inter_700Bold' },
                isToday && !isStart && !isEnd && { color },
                !isStart && !isEnd && !inRange && !isToday && { color: Colors.textMuted },
              ]}>{day}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={crS.summary}>
        <View style={crS.summaryItem}>
          <Text style={crS.summaryLabel}>INÍCIO</Text>
          <Text style={[crS.summaryVal, { color: start ? color : Colors.textMuted }]}>{start ? formatDate(start) : '—'}</Text>
        </View>
        <Ionicons name="arrow-forward" size={14} color={Colors.border} />
        <View style={crS.summaryItem}>
          <Text style={crS.summaryLabel}>FIM</Text>
          <Text style={[crS.summaryVal, { color: end ? color : Colors.textMuted }]}>{end ? formatDate(end) : '—'}</Text>
        </View>
        {start && end && (
          <>
            <Ionicons name="arrow-forward" size={14} color={Colors.border} />
            <View style={crS.summaryItem}>
              <Text style={crS.summaryLabel}>DURAÇÃO</Text>
              <Text style={[crS.summaryVal, { color }]}>{diffDays(start, end) + 1} dias</Text>
            </View>
          </>
        )}
      </View>
    </View>
  );
}

const crS = StyleSheet.create({
  wrap:         { backgroundColor: Colors.surface, borderRadius: 14, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden' },
  nav:          { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.border },
  navBtn:       { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: Colors.backgroundCard, cursor: 'pointer' } as any,
  navLabel:     { fontSize: 14, fontFamily: 'Inter_700Bold', color: Colors.text },
  grid:         { flexDirection: 'row', flexWrap: 'wrap', padding: 8, gap: 2 },
  dow:          { width: '14.28%', textAlign: 'center', fontSize: 9, fontFamily: 'Inter_700Bold', color: Colors.textMuted, paddingBottom: 6, textTransform: 'uppercase' },
  cell:         { width: '14.28%', aspectRatio: 1, alignItems: 'center', justifyContent: 'center', cursor: 'pointer' } as any,
  cellNum:      { fontSize: 12, fontFamily: 'Inter_500Medium', color: Colors.text },
  summary:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 16, borderTopWidth: 1, borderTopColor: Colors.border, backgroundColor: Colors.backgroundCard },
  summaryItem:  { alignItems: 'center', gap: 2 },
  summaryLabel: { fontSize: 9, fontFamily: 'Inter_700Bold', color: Colors.textMuted, letterSpacing: 0.5 },
  summaryVal:   { fontSize: 13, fontFamily: 'Inter_700Bold' },
});

// ─────────────────────────────────────────────────────────────
// MAIN SCREEN
// ─────────────────────────────────────────────────────────────
type Tab = 'trimestres' | 'epocas' | 'feriados' | 'provas' | 'anual';

export default function CalendarioAcademicoScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { anos, anoAtivo, anoSelecionado, setAnoSelecionado, updateAno, isLoading: anoLoading } = useAnoAcademico();
  const { eventos, addEvento, updateEvento, deleteEvento } = useData();
  const { calendarioProvas, addCalendarioProva, updateCalendarioProva, deleteCalendarioProva } = useProfessor();

  const [tab, setTab] = useState<Tab>('trimestres');
  const [saving, setSaving] = useState(false);

  // Trimestre edit
  const [editTrim, setEditTrim] = useState<Trimestre | null>(null);
  const [showTrimModal, setShowTrimModal] = useState(false);

  // Feriado
  const [editFeriado, setEditFeriado] = useState<Evento | null>(null);
  const [showFeriadoModal, setShowFeriadoModal] = useState(false);

  // Prova
  const [editProva, setEditProva] = useState<CalendarioProva | null>(null);
  const [showProvaModal, setShowProvaModal] = useState(false);

  // Épocas de Exame – draft state
  const [epocasDraft, setEpocasDraft] = useState<EpocasExame>({});
  const [savingEpoca, setSavingEpoca] = useState<string | null>(null);

  const ano = anoSelecionado ?? anoAtivo;
  const isAdmin = user?.role === 'admin' || user?.role === 'director' || user?.role === 'chefe_secretaria';
  const today = todayStr();

  // Sync épocas draft whenever the active year changes
  useEffect(() => {
    setEpocasDraft(ano?.epocasExame ?? {});
  }, [ano?.id]);

  const feriados = useMemo(() =>
    eventos.filter(e => e.tipo === 'Feriado').sort((a, b) => a.data.localeCompare(b.data)),
    [eventos]
  );

  const provasOrdenadas = useMemo(() =>
    [...calendarioProvas].sort((a, b) => a.data.localeCompare(b.data)),
    [calendarioProvas]
  );

  // ── Save época de exame ───────────────────────────────────
  async function handleSaveEpoca(key: EpocaKey) {
    if (!ano) return;
    const epItem = epocasDraft[key] ?? {};
    if (epItem.dataInicio && epItem.dataFim && epItem.dataFim < epItem.dataInicio) {
      webAlert('Datas inválidas', 'A data de fim deve ser posterior à data de início.');
      return;
    }
    setSavingEpoca(key);
    try {
      const merged: EpocasExame = { ...(ano.epocasExame ?? {}), [key]: epItem };
      await updateAno(ano.id, { epocasExame: merged });
      const label = EPOCAS_CFG.find(e => e.key === key)?.label ?? key;
      alertSucesso('Época guardada', `"${label}" actualizada com sucesso.`);
    } catch {
      alertErro('Erro', 'Não foi possível guardar a época de exame.');
    } finally {
      setSavingEpoca(null);
    }
  }

  // ── Save trimestre ────────────────────────────────────────
  async function handleSaveTrimestre(updated: Trimestre) {
    if (!ano) return;
    setSaving(true);
    try {
      const newTrimestres = ano.trimestres.map(t => t.numero === updated.numero ? updated : t);
      await updateAno(ano.id, { trimestres: newTrimestres });
      setShowTrimModal(false);
      alertSucesso('Trimestre actualizado', `${TRIM_NAMES[updated.numero - 1]} guardado com sucesso.`);
    } catch { alertErro('Erro', 'Não foi possível guardar o trimestre.'); }
    finally { setSaving(false); }
  }

  // ── Seed feriados nacionais ───────────────────────────────
  async function seedFeriadosNacionais() {
    if (!ano) return;
    const anoBase = ano.ano.split('/')[0];
    const existingNames = feriados.map(f => f.titulo.toLowerCase());
    const missing = FERIADOS_NACIONAIS.filter(f => !existingNames.some(e => e.includes(f.nome.toLowerCase().slice(0, 10))));
    if (missing.length === 0) {
      webAlert('Feriados', 'Os feriados nacionais já estão todos registados.'); return;
    }
    webAlert(
      'Adicionar Feriados Nacionais',
      `Adicionar ${missing.length} feriado(s) oficial(is) de Angola para ${anoBase}?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Adicionar', onPress: async () => {
            setSaving(true);
            try {
              for (const f of missing) {
                await addEvento({ titulo: f.nome, descricao: 'Feriado Nacional de Angola', data: `${anoBase}-${f.dia}`, hora: '', tipo: 'Feriado', local: '', turmasIds: [] });
              }
              alertSucesso('Feriados adicionados', `${missing.length} feriado(s) nacional(is) registado(s).`);
            } catch { alertErro('Erro', 'Não foi possível adicionar os feriados.'); }
            finally { setSaving(false); }
          },
        },
      ]
    );
  }

  // ── Delete feriado ────────────────────────────────────────
  function confirmDeleteFeriado(ev: Evento) {
    webAlert('Remover Feriado', `Remover "${ev.titulo}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Remover', style: 'destructive', onPress: async () => {
          try { await deleteEvento(ev.id); alertSucesso('Removido', `"${ev.titulo}" foi removido.`); }
          catch { alertErro('Erro', 'Não foi possível remover.'); }
        }},
    ]);
  }

  // ── Save feriado ──────────────────────────────────────────
  async function handleSaveFeriado(form: Partial<Evento>) {
    setSaving(true);
    try {
      if (editFeriado) await updateEvento(editFeriado.id, form);
      else await addEvento({ ...form, tipo: 'Feriado' } as any);
      setShowFeriadoModal(false);
      setEditFeriado(null);
      alertSucesso(editFeriado ? 'Feriado actualizado' : 'Feriado adicionado', `"${form.titulo}" guardado.`);
    } catch { alertErro('Erro', 'Não foi possível guardar o feriado.'); }
    finally { setSaving(false); }
  }

  // ── Save prova ────────────────────────────────────────────
  async function handleSaveProva(form: Partial<CalendarioProva>) {
    setSaving(true);
    try {
      if (editProva) await updateCalendarioProva(editProva.id, form);
      else await addCalendarioProva({ ...form, publicado: false, turmasIds: [] } as any);
      setShowProvaModal(false);
      setEditProva(null);
      alertSucesso(editProva ? 'Prova actualizada' : 'Prova adicionada', `"${form.titulo}" guardada.`);
    } catch { alertErro('Erro', 'Não foi possível guardar a prova.'); }
    finally { setSaving(false); }
  }

  // ── Toggle publicado ──────────────────────────────────────
  async function togglePublicado(p: CalendarioProva) {
    try { await updateCalendarioProva(p.id, { publicado: !p.publicado }); }
    catch { alertErro('Erro', 'Não foi possível actualizar.'); }
  }

  // ── Delete prova ──────────────────────────────────────────
  function confirmDeleteProva(p: CalendarioProva) {
    webAlert('Remover Prova', `Remover "${p.titulo}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Remover', style: 'destructive', onPress: async () => {
          try { await deleteCalendarioProva(p.id); }
          catch { alertErro('Erro', 'Não foi possível remover.'); }
        }},
    ]);
  }

  // ── Determine which trimester a date belongs to ───────────
  function provaTrimestreNum(data: string): number {
    if (!ano) return 0;
    for (const t of ano.trimestres) {
      if (data >= t.dataInicio && data <= t.dataFim) return t.numero;
    }
    return 0;
  }

  // ─────────────────────────────────────────────────────────
  // RENDER: TRIMESTRES TAB
  // ─────────────────────────────────────────────────────────
  function renderTrimestres() {
    if (!ano) {
      return (
        <View style={styles.emptyState}>
          <MaterialCommunityIcons name="calendar-blank" size={44} color={Colors.textMuted} />
          <Text style={styles.emptyText}>Nenhum ano académico configurado.</Text>
          <Text style={styles.emptySubText}>Configure um ano académico no painel de administração.</Text>
        </View>
      );
    }
    const semanas = diffWeeks(ano.dataInicio, ano.dataFim);
    const totalDias = diffDays(ano.dataInicio, ano.dataFim);
    const diasPassados = Math.max(0, Math.min(totalDias, diffDays(ano.dataInicio, today)));
    const progressoAno = totalDias > 0 ? Math.round(diasPassados / totalDias * 100) : 0;

    return (
      <ScrollView contentContainerStyle={[styles.tabContent, styles.tabContentMobile, { paddingBottom: 120 }]} showsVerticalScrollIndicator={false}>
        {/* Year banner */}
        <View style={[styles.anoBanner, styles.anoBannerMobile]}>
          <View style={styles.anoBannerLeft}>
            <Text style={[styles.anoLabel, styles.anoLabelMobile]}>Ano Lectivo</Text>
            <Text style={[styles.anoValue, styles.anoValueMobile]}>{ano.ano}</Text>
            <Text style={[styles.anoDates, styles.anoDatesMobile]}>{formatDate(ano.dataInicio)} → {formatDate(ano.dataFim)}</Text>
          </View>
          <View style={styles.anoBannerRight}>
            <Text style={[styles.anoStat, styles.anoStatMobile]}>{semanas}</Text>
            <Text style={styles.anoStatLabel}>semanas</Text>
          </View>
        </View>

        {/* Global progress */}
        <View style={[styles.progressCard, styles.progressCardMobile]}>
          <View style={styles.progressHeader}>
            <Text style={[styles.progressLabel, styles.progressLabelMobile]}>Progresso do Ano Lectivo</Text>
            <Text style={[styles.progressPct, styles.progressPctMobile]}>{progressoAno}%</Text>
          </View>
          <View style={styles.progressBarBg}>
            <View style={[styles.progressBarFill, { width: `${progressoAno}%`, backgroundColor: Colors.gold }]} />
          </View>
          <Text style={[styles.progressSub, styles.progressSubMobile]}>{diasPassados} de {totalDias} dias lectivos decorridos</Text>
        </View>

        {/* Trimestre cards */}
        {ano.trimestres.map((t, idx) => {
          const color = TRIM_COLORS[idx] || Colors.textMuted;
          const prog = trimProgress(t);
          const weeks = diffWeeks(t.dataInicio, t.dataFim);
          const examDays = t.dataInicioExames && t.dataFimExames ? diffDays(t.dataInicioExames, t.dataFimExames) + 1 : 0;
          const isNow = today >= t.dataInicio && today <= t.dataFim;
          const isFuture = today < t.dataInicio;
          const isPast = today > t.dataFim;

          return (
            <View key={t.numero} style={[styles.trimCard, styles.trimCardMobile, { borderLeftColor: color, borderLeftWidth: 4 }]}>
              <View style={styles.trimCardHeader}>
                <View style={[styles.trimBadge, styles.trimBadgeMobile, { backgroundColor: `${color}20` }]}>
                  <Text style={[styles.trimBadgeText, styles.trimBadgeTextMobile, { color }]}>{TRIM_NAMES[idx]}</Text>
                </View>
                <View style={styles.trimStatusRow}>
                  {t.ativo && <View style={[styles.activePill, styles.activePillMobile, { backgroundColor: `${color}25`, borderColor: color }]}>
                    <View style={[styles.activeDot, { backgroundColor: color }]} />
                    <Text style={[styles.activePillText, styles.activePillTextMobile, { color }]}>Em curso</Text>
                  </View>}
                  {isNow && !t.ativo && <View style={styles.nowPill}><Text style={styles.nowPillText}>Período actual</Text></View>}
                  {isPast && <Text style={styles.pastLabel}>Concluído</Text>}
                  {isFuture && <Text style={styles.futureLabel}>Por iniciar</Text>}
                  {isAdmin && (
                    <TouchableOpacity style={styles.editBtn} onPress={() => { setEditTrim(t); setShowTrimModal(true); }}>
                      <Ionicons name="create-outline" size={16} color={color} />
                    </TouchableOpacity>
                  )}
                </View>
              </View>

              {/* Dates grid */}
              <View style={[styles.trimDatesGrid, styles.trimDatesGridMobile]}>
                <View style={[styles.trimDateCell, styles.trimDateCellMobile]}>
                  <Text style={styles.trimDateLabel}>INÍCIO</Text>
                  <Text style={[styles.trimDateValue, styles.trimDateValueMobile]}>{formatDate(t.dataInicio)}</Text>
                </View>
                <View style={[styles.trimDateSep, styles.trimDateSepMobile]} />
                <View style={[styles.trimDateCell, styles.trimDateCellMobile]}>
                  <Text style={styles.trimDateLabel}>FIM</Text>
                  <Text style={[styles.trimDateValue, styles.trimDateValueMobile]}>{formatDate(t.dataFim)}</Text>
                </View>
                <View style={[styles.trimDateSep, styles.trimDateSepMobile]} />
                <View style={[styles.trimDateCell, styles.trimDateCellMobile]}>
                  <Text style={styles.trimDateLabel}>SEMANAS</Text>
                  <Text style={[styles.trimDateValue, styles.trimDateValueMobile, { color }]}>{weeks}</Text>
                </View>
              </View>

              {/* Exam period */}
              {t.dataInicioExames && t.dataFimExames ? (
                <View style={[styles.examPeriod, styles.examPeriodMobile, { borderColor: `${color}40`, backgroundColor: `${color}08` }]}>
                  <Ionicons name="document-text" size={14} color={color} />
                  <Text style={[styles.examPeriodText, styles.examPeriodTextMobile, { color }]}>
                    Exames: {formatDate(t.dataInicioExames)} → {formatDate(t.dataFimExames)}
                    {examDays > 0 ? ` (${examDays} dias)` : ''}
                  </Text>
                </View>
              ) : isAdmin ? (
                <TouchableOpacity
                  style={[styles.addExamBtn, styles.addExamBtnMobile]}
                  onPress={() => { setEditTrim(t); setShowTrimModal(true); }}
                >
                  <Ionicons name="add-circle-outline" size={14} color={Colors.textMuted} />
                  <Text style={[styles.addExamBtnText, styles.addExamBtnTextMobile]}>Definir período de exames</Text>
                </TouchableOpacity>
              ) : null}

              {/* Progress */}
              <View style={[styles.trimProgressRow, styles.trimProgressRowMobile]}>
                <View style={styles.progressBarBg}>
                  <View style={[styles.progressBarFill, { width: `${prog}%`, backgroundColor: color }]} />
                </View>
                <Text style={[styles.trimProgPct, styles.trimProgPctMobile, { color }]}>{prog}%</Text>
              </View>
            </View>
          );
        })}

        {/* Year selector */}
        {anos.length > 1 && (
          <View style={styles.yearSelector}>
            <Text style={styles.yearSelectorLabel}>Outros anos:</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {anos.map(a => (
                  <TouchableOpacity
                    key={a.id}
                    style={[styles.yearBtn, styles.yearBtnMobile, a.id === ano?.id && styles.yearBtnActive]}
                    onPress={() => setAnoSelecionado(a)}
                  >
                    <Text style={[styles.yearBtnText, styles.yearBtnTextMobile, a.id === ano?.id && styles.yearBtnTextActive]}>{a.ano}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          </View>
        )}
      </ScrollView>
    );
  }

  // ─────────────────────────────────────────────────────────
  // RENDER: ÉPOCAS DE EXAME TAB
  // ─────────────────────────────────────────────────────────
  function renderEpocas() {
    if (!ano) {
      return (
        <View style={styles.emptyState}>
          <MaterialCommunityIcons name="calendar-blank" size={44} color={Colors.textMuted} />
          <Text style={styles.emptyText}>Nenhum ano académico configurado.</Text>
          <Text style={styles.emptySubText}>Configure um ano académico primeiro.</Text>
        </View>
      );
    }

    const getStatus = (ep: EpocaExameItem | undefined): { label: string; color: string } => {
      if (!ep?.dataInicio || !ep?.dataFim) return { label: 'Por definir', color: Colors.textMuted };
      if (today < ep.dataInicio) {
        const days = diffDays(today, ep.dataInicio);
        return { label: `Em ${days} dia${days !== 1 ? 's' : ''}`, color: Colors.info };
      }
      if (today > ep.dataFim) return { label: 'Concluída', color: Colors.textMuted };
      const days = diffDays(today, ep.dataFim);
      return { label: `Em curso · ${days} dia${days !== 1 ? 's' : ''} restante${days !== 1 ? 's' : ''}`, color: Colors.success };
    };

    return (
      <ScrollView contentContainerStyle={[styles.tabContent, { paddingBottom: 120 }]} showsVerticalScrollIndicator={false}>

        {/* Header info */}
        <View style={[epS.infoCard, epS.infoCardMobile]}>
          <Ionicons name="information-circle-outline" size={18} color={Colors.info} />
          <Text style={epS.infoText}>
            Defina os períodos de exame a nível do sistema. Toque num dia para seleccionar o início e depois o fim do período.
          </Text>
        </View>

        {EPOCAS_CFG.map(cfg => {
          const key = cfg.key as EpocaKey;
          const draft = epocasDraft[key] ?? {};
          const saved = ano.epocasExame?.[key] ?? {};
          const status = getStatus(saved);
          const isSaving = savingEpoca === key;
          const isNormal = key === 'normal';

          const isDirty =
            (draft.dataInicio ?? '') !== (saved.dataInicio ?? '') ||
            (draft.dataFim    ?? '') !== (saved.dataFim    ?? '') ||
            (draft.observacoes ?? '') !== (saved.observacoes ?? '');

          return (
            <View key={key} style={[epS.epochCard, epS.epochCardMobile, isNormal && epS.epochCardNormal, { borderLeftColor: cfg.color, borderLeftWidth: 4 }]}>
              {/* Card header */}
              <View style={epS.epochHeader}>
                <View style={[epS.epochIconWrap, { backgroundColor: `${cfg.color}20` }]}>
                  <Ionicons name={cfg.icon} size={18} color={cfg.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={epS.epochTitleRow}>
                    <Text style={[epS.epochTitle, { color: cfg.color }]}>{cfg.label}</Text>
                    {isNormal && (
                      <View style={epS.systemBadge}>
                        <Ionicons name="globe-outline" size={10} color={Colors.info} />
                        <Text style={epS.systemBadgeText}>Sistema</Text>
                      </View>
                    )}
                  </View>
                  <View style={epS.epochStatusRow}>
                    <View style={[epS.statusDot, { backgroundColor: status.color }]} />
                    <Text style={[epS.statusLabel, { color: status.color }]}>{status.label}</Text>
                  </View>
                </View>
                {saved.dataInicio && saved.dataFim && (
                  <View style={epS.epochDatesMini}>
                    <Text style={epS.epochDatesMiniText}>{formatDate(saved.dataInicio)}</Text>
                    <Text style={[epS.epochDatesMiniText, { color: Colors.textMuted }]}>→</Text>
                    <Text style={epS.epochDatesMiniText}>{formatDate(saved.dataFim)}</Text>
                  </View>
                )}
              </View>

              {/* Calendar picker – only for admins */}
              {isAdmin ? (
                <>
                  <Text style={epS.pickerHint}>
                    {!draft.dataInicio
                      ? 'Toque numa data para definir o início'
                      : !draft.dataFim
                      ? 'Agora toque na data de fim'
                      : 'Período seleccionado · toque numa data para redefinir'}
                  </Text>
                  <CalRangePicker
                    start={draft.dataInicio ?? ''}
                    end={draft.dataFim ?? ''}
                    color={cfg.color}
                    onChange={(s, e) =>
                      setEpocasDraft(prev => ({ ...prev, [key]: { ...(prev[key] ?? {}), dataInicio: s, dataFim: e } }))
                    }
                  />

                  {/* Observações */}
                  <View style={{ marginTop: 12 }}>
                    <Text style={epS.obsLabel}>OBSERVAÇÕES (opcional)</Text>
                    <TextInput
                      style={epS.obsInput}
                      value={draft.observacoes ?? ''}
                      onChangeText={v => setEpocasDraft(prev => ({ ...prev, [key]: { ...(prev[key] ?? {}), observacoes: v } }))}
                      placeholder="Ex: Aplica-se a todas as turmas do ensino secundário..."
                      placeholderTextColor={Colors.textMuted}
                      multiline
                    />
                  </View>

                  {/* Save button */}
                  <TouchableOpacity
                    style={[epS.saveBtn, { backgroundColor: cfg.color }, (!isDirty || isSaving) && epS.saveBtnDisabled]}
                    onPress={() => handleSaveEpoca(key)}
                    disabled={!isDirty || isSaving}
                  >
                    {isSaving
                      ? <AppLoader size="small" color="#fff" />
                      : <Ionicons name={isDirty ? 'save-outline' : 'checkmark-circle'} size={16} color="#fff" />
                    }
                    <Text style={epS.saveBtnText}>
                      {isSaving ? 'A guardar...' : isDirty ? 'Guardar' : 'Guardado'}
                    </Text>
                  </TouchableOpacity>
                </>
              ) : (
                /* Read-only view for non-admins */
                saved.dataInicio && saved.dataFim ? (
                  <View style={epS.readOnlyRow}>
                    <Ionicons name="calendar-outline" size={15} color={cfg.color} />
                    <Text style={epS.readOnlyText}>
                      {formatDate(saved.dataInicio)} → {formatDate(saved.dataFim)}
                      {' · '}{diffDays(saved.dataInicio, saved.dataFim) + 1} dias
                    </Text>
                  </View>
                ) : (
                  <Text style={epS.readOnlyNone}>Período ainda não definido</Text>
                )
              )}

              {saved.observacoes ? (
                <Text style={epS.obsDisplay}>{saved.observacoes}</Text>
              ) : null}
            </View>
          );
        })}

        {/* Year selector */}
        {anos.length > 1 && (
          <View style={styles.yearSelector}>
            <Text style={styles.yearSelectorLabel}>Outros anos:</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {anos.map(a => (
                  <TouchableOpacity
                    key={a.id}
                    style={[styles.yearBtn, a.id === ano?.id && styles.yearBtnActive]}
                    onPress={() => setAnoSelecionado(a)}
                  >
                    <Text style={[styles.yearBtnText, a.id === ano?.id && styles.yearBtnTextActive]}>{a.ano}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          </View>
        )}
      </ScrollView>
    );
  }

  // ─────────────────────────────────────────────────────────
  // RENDER: FERIADOS TAB
  // ─────────────────────────────────────────────────────────
  function renderFeriados() {
    return (
      <ScrollView contentContainerStyle={[styles.tabContent, { paddingBottom: 120 }]} showsVerticalScrollIndicator={false}>
        {/* KPIs */}
        <View style={styles.kpiRow}>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiValue}>{feriados.length}</Text>
            <Text style={styles.kpiLabel}>Total</Text>
          </View>
          <View style={styles.kpiCard}>
            <Text style={[styles.kpiValue, { color: Colors.success }]}>{feriados.filter(f => f.data >= today).length}</Text>
            <Text style={styles.kpiLabel}>Próximos</Text>
          </View>
          <View style={styles.kpiCard}>
            <Text style={[styles.kpiValue, { color: Colors.textMuted }]}>{feriados.filter(f => f.data < today).length}</Text>
            <Text style={styles.kpiLabel}>Passados</Text>
          </View>
        </View>

        {/* Actions */}
        {isAdmin && (
          <View style={styles.actionRow}>
            <TouchableOpacity style={styles.seedBtn} onPress={seedFeriadosNacionais} disabled={saving}>
              <Ionicons name="flag" size={14} color={Colors.warning} />
              <Text style={styles.seedBtnText}>Feriados Nacionais de Angola</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* List */}
        {feriados.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="flag-outline" size={40} color={Colors.textMuted} />
            <Text style={styles.emptyText}>Nenhum feriado registado</Text>
            {isAdmin && <Text style={styles.emptySubText}>Use o botão acima para adicionar os feriados nacionais</Text>}
          </View>
        ) : (
          feriados.map(ev => {
            const isPast = ev.data < today;
            const dDiff = diffDays(today, ev.data);
            return (
              <View key={ev.id} style={[styles.feriadoCard, isPast && { opacity: 0.6 }]}>
                <View style={[styles.feriadoDateBox, { backgroundColor: isPast ? Colors.surface : `${Colors.warning}20` }]}>
                  <Text style={[styles.feriadoDay, { color: isPast ? Colors.textMuted : Colors.warning }]}>
                    {ev.data.split('-')[2]}
                  </Text>
                  <Text style={[styles.feriadoMonth, { color: isPast ? Colors.textMuted : Colors.warning }]}>
                    {MESES[parseInt(ev.data.split('-')[1]) - 1]}
                  </Text>
                </View>
                <View style={styles.feriadoInfo}>
                  <Text style={styles.feriadoNome}>{ev.titulo}</Text>
                  {ev.descricao ? <Text style={styles.feriadoDesc} numberOfLines={1}>{ev.descricao}</Text> : null}
                  <Text style={[styles.feriadoCountdown, { color: isPast ? Colors.textMuted : Colors.warning }]}>
                    {dDiff === 0 ? 'Hoje' : dDiff > 0 ? `Em ${dDiff} dias` : `${Math.abs(dDiff)} dias atrás`}
                  </Text>
                </View>
                {isAdmin && (
                  <View style={styles.feriadoActions}>
                    <TouchableOpacity onPress={() => { setEditFeriado(ev); setShowFeriadoModal(true); }}>
                      <Ionicons name="create-outline" size={16} color={Colors.info} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => confirmDeleteFeriado(ev)}>
                      <Ionicons name="trash-outline" size={16} color={Colors.danger} />
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            );
          })
        )}
      </ScrollView>
    );
  }

  // ─────────────────────────────────────────────────────────
  // RENDER: PROVAS TAB
  // ─────────────────────────────────────────────────────────
  function renderProvas() {
    const upcoming = provasOrdenadas.filter(p => p.data >= today);
    const past = provasOrdenadas.filter(p => p.data < today);

    const renderProvaCard = (p: CalendarioProva) => {
      const color = PROVA_TIPO_COLOR[p.tipo] || Colors.textMuted;
      const isPast = p.data < today;
      const tn = provaTrimestreNum(p.data);
      return (
        <View key={p.id} style={[styles.provaCard, { borderLeftColor: color, borderLeftWidth: 3 }, isPast && { opacity: 0.65 }]}>
          <View style={styles.provaCardTop}>
            <View style={styles.provaInfo}>
              <Text style={styles.provaTitulo}>{p.titulo}</Text>
              <View style={styles.provaMetaRow}>
                <Text style={styles.provaMeta}>{p.disciplina}</Text>
                {tn > 0 && <Text style={[styles.provaTrimBadge, { color: TRIM_COLORS[tn - 1] }]}>T{tn}</Text>}
              </View>
              <Text style={styles.provaMeta}>{formatDate(p.data)} · {p.hora}</Text>
            </View>
            <View style={styles.provaRight}>
              <View style={[styles.tipoBadge, { backgroundColor: `${color}20` }]}>
                <Text style={[styles.tipoText, { color }]}>{PROVA_TIPO_LABEL[p.tipo]}</Text>
              </View>
              {isAdmin && (
                <TouchableOpacity
                  style={[styles.publicadoBtn, p.publicado && styles.publicadoBtnActive]}
                  onPress={() => togglePublicado(p)}
                >
                  <Ionicons name={p.publicado ? 'eye' : 'eye-off-outline'} size={12} color={p.publicado ? Colors.success : Colors.textMuted} />
                  <Text style={[styles.publicadoText, p.publicado && { color: Colors.success }]}>
                    {p.publicado ? 'Público' : 'Rascunho'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
          {p.descricao ? <Text style={styles.provaDesc} numberOfLines={2}>{p.descricao}</Text> : null}
          {isAdmin && (
            <View style={styles.provaActions}>
              <TouchableOpacity style={styles.actionBtn} onPress={() => { setEditProva(p); setShowProvaModal(true); }}>
                <Ionicons name="create-outline" size={15} color={Colors.info} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.actionBtn} onPress={() => confirmDeleteProva(p)}>
                <Ionicons name="trash-outline" size={15} color={Colors.danger} />
              </TouchableOpacity>
            </View>
          )}
        </View>
      );
    };

    return (
      <ScrollView contentContainerStyle={[styles.tabContent, { paddingBottom: 120 }]} showsVerticalScrollIndicator={false}>
        <View style={styles.kpiRow}>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiValue}>{provasOrdenadas.length}</Text>
            <Text style={styles.kpiLabel}>Total</Text>
          </View>
          <View style={styles.kpiCard}>
            <Text style={[styles.kpiValue, { color: Colors.success }]}>{upcoming.length}</Text>
            <Text style={styles.kpiLabel}>Próximas</Text>
          </View>
          <View style={styles.kpiCard}>
            <Text style={[styles.kpiValue, { color: Colors.warning }]}>{provasOrdenadas.filter(p => p.publicado).length}</Text>
            <Text style={styles.kpiLabel}>Publicadas</Text>
          </View>
        </View>

        {upcoming.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>PRÓXIMAS PROVAS</Text>
            {upcoming.map(renderProvaCard)}
          </View>
        )}
        {past.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>PROVAS PASSADAS</Text>
            {past.map(renderProvaCard)}
          </View>
        )}
        {provasOrdenadas.length === 0 && (
          <View style={styles.emptyState}>
            <Ionicons name="document-text-outline" size={40} color={Colors.textMuted} />
            <Text style={styles.emptyText}>Nenhuma prova agendada</Text>
            {isAdmin && <Text style={styles.emptySubText}>Use o botão + para agendar provas e exames</Text>}
          </View>
        )}
      </ScrollView>
    );
  }

  // ─────────────────────────────────────────────────────────
  // RENDER: ANNUAL CALENDAR TAB
  // ─────────────────────────────────────────────────────────
  function renderAnual() {
    if (!ano) {
      return (
        <View style={styles.emptyState}>
          <MaterialCommunityIcons name="calendar-blank" size={44} color={Colors.textMuted} />
          <Text style={styles.emptyText}>Nenhum ano académico configurado.</Text>
        </View>
      );
    }

    const anoBase = parseInt(ano.ano.split('/')[0]) || new Date().getFullYear();
    const feriadosDatas = new Set(feriados.map(f => f.data));
    const provasDatas = new Set(provasOrdenadas.map(p => p.data));

    const epocaNormal = ano.epocasExame?.normal;
    const epocaRecurso = ano.epocasExame?.recurso;
    const epocaEspecial = ano.epocasExame?.especial;

    function getDayInfo(year: number, month: number, day: number): {
      trimColor: string | null;
      isExam: boolean;
      isFeriado: boolean;
      isProva: boolean;
      isToday: boolean;
      isEpocaNormal: boolean;
      isEpocaRecurso: boolean;
      isEpocaEspecial: boolean;
    } {
      const d = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      let trimColor: string | null = null;
      let isExam = false;
      if (ano) {
        for (let i = 0; i < ano.trimestres.length; i++) {
          const t = ano.trimestres[i];
          if (d >= t.dataInicio && d <= t.dataFim) {
            trimColor = TRIM_COLORS[i];
            if (t.dataInicioExames && t.dataFimExames && d >= t.dataInicioExames && d <= t.dataFimExames) {
              isExam = true;
            }
          }
        }
      }
      const inEpoca = (ep: EpocaExameItem | undefined) =>
        !!(ep?.dataInicio && ep?.dataFim && d >= ep.dataInicio && d <= ep.dataFim);
      return {
        trimColor,
        isExam,
        isFeriado: feriadosDatas.has(d),
        isProva: provasDatas.has(d),
        isToday: d === today,
        isEpocaNormal:   inEpoca(epocaNormal),
        isEpocaRecurso:  inEpoca(epocaRecurso),
        isEpocaEspecial: inEpoca(epocaEspecial),
      };
    }

    return (
      <ScrollView contentContainerStyle={[styles.tabContent, { paddingBottom: 120 }]} showsVerticalScrollIndicator={false}>
        {/* Legend */}
        <View style={styles.legendRow}>
          {TRIM_COLORS.map((c, i) => (
            <View key={i} style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: c }]} />
              <Text style={styles.legendText}>T{i + 1}</Text>
            </View>
          ))}
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: Colors.danger, opacity: 0.7 }]} />
            <Text style={styles.legendText}>Exames</Text>
          </View>
          {epocaNormal?.dataInicio && epocaNormal?.dataFim && (
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: '#E74C3C' }]} />
              <Text style={styles.legendText}>Ép. Normal</Text>
            </View>
          )}
          {epocaRecurso?.dataInicio && epocaRecurso?.dataFim && (
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: '#E67E22' }]} />
              <Text style={styles.legendText}>Recurso</Text>
            </View>
          )}
          {epocaEspecial?.dataInicio && epocaEspecial?.dataFim && (
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: '#9B59B6' }]} />
              <Text style={styles.legendText}>Especial</Text>
            </View>
          )}
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: Colors.warning }]} />
            <Text style={styles.legendText}>Feriado</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: '#7F8C8D' }]} />
            <Text style={styles.legendText}>Prova</Text>
          </View>
        </View>

        {/* Month grids */}
        {Array.from({ length: 12 }, (_, mi) => {
          const year = mi >= 8 ? anoBase : anoBase + 1;
          const month = (mi + 8) % 12;
          const daysInMonth = new Date(year, month + 1, 0).getDate();
          const firstDow = new Date(year, month, 1).getDay();

          const hasContent = Array.from({ length: daysInMonth }, (_, d) => {
            const info = getDayInfo(year, month, d + 1);
            return info.trimColor || info.isFeriado || info.isProva;
          }).some(Boolean);

          return (
            <View key={mi} style={styles.monthBlock}>
              <Text style={styles.monthTitle}>{MESES_FULL[month]} {year}</Text>
              <View style={styles.monthGrid}>
                {['D','S','T','Q','Q','S','S'].map((d, di) => (
                  <Text key={di} style={styles.dowLabel}>{d}</Text>
                ))}
                {Array.from({ length: firstDow }, (_, i) => (
                  <View key={`e-${i}`} style={styles.dayCell} />
                ))}
                {Array.from({ length: daysInMonth }, (_, d) => {
                  const info = getDayInfo(year, month, d + 1);
                  const bgColor = info.isToday ? Colors.gold
                    : info.isFeriado ? Colors.warning
                    : info.isProva ? '#7F8C8D'
                    : info.isEpocaNormal ? '#E74C3C'
                    : info.isEpocaRecurso ? '#E67E22'
                    : info.isEpocaEspecial ? '#9B59B6'
                    : info.isExam ? `${info.trimColor}99`
                    : info.trimColor ? `${info.trimColor}35`
                    : 'transparent';
                  const isEpoca = info.isEpocaNormal || info.isEpocaRecurso || info.isEpocaEspecial;
                  return (
                    <View key={d} style={[styles.dayCell, { backgroundColor: bgColor }]}>
                      <Text style={[
                        styles.dayNum,
                        info.isToday && { color: '#0D1F35', fontFamily: 'Inter_700Bold' },
                        info.isFeriado && { color: '#fff' },
                        info.isProva && { color: '#fff' },
                        isEpoca && { color: '#fff', fontFamily: 'Inter_600SemiBold' },
                        !info.trimColor && !info.isToday && !isEpoca && { color: Colors.textMuted, opacity: 0.4 },
                      ]}>{d + 1}</Text>
                    </View>
                  );
                })}
              </View>
            </View>
          );
        })}
      </ScrollView>
    );
  }

  // ─────────────────────────────────────────────────────────
  // MAIN RENDER
  // ─────────────────────────────────────────────────────────
  const TABS: { key: Tab; label: string; icon: string }[] = [
    { key: 'trimestres', label: 'Trimestres',  icon: 'calendar' },
    { key: 'epocas',     label: 'Épocas',       icon: 'school' },
    { key: 'feriados',   label: 'Feriados',     icon: 'flag' },
    { key: 'provas',     label: 'Provas',        icon: 'document-text' },
    { key: 'anual',      label: 'Vista Anual',  icon: 'grid' },
  ];

  const FAB_VISIBLE = tab === 'feriados' || tab === 'provas';

  if (anoLoading) {
    return (
      <View style={styles.screen}>
        <View style={{ padding: 16 }}>
          <SkeletonList rows={6} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <TopBar
        title="Calendário Académico"
        subtitle={ano ? `${ano.ano} · ${ano.ativo ? 'Ano Activo' : 'Ano Inactivo'}` : 'Sem ano configurado'}
      />

      {/* Tabs */}
      <HScrollTabBar style={styles.tabBar} contentContainerStyle={styles.tabBarContent} keyboardShouldPersistTaps="handled">
        {TABS.map(t => (
          <TouchableOpacity
            key={t.key}
            style={[styles.tabBtn, tab === t.key && styles.tabBtnActive]}
            onPress={() => setTab(t.key)}
          >
            <Ionicons name={t.icon as any} size={14} color={tab === t.key ? Colors.gold : Colors.textMuted} />
            <Text style={[styles.tabBtnText, tab === t.key && styles.tabBtnTextActive]} numberOfLines={1}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </HScrollTabBar>

      {/* Tab content */}
      {tab === 'trimestres' && renderTrimestres()}
      {tab === 'epocas'     && renderEpocas()}
      {tab === 'feriados'   && renderFeriados()}
      {tab === 'provas'     && renderProvas()}
      {tab === 'anual'      && renderAnual()}

      {/* FAB */}
      {isAdmin && FAB_VISIBLE && (
        <TouchableOpacity
          style={[styles.fab, { bottom: (Platform.OS === 'web' ? 34 : insets.bottom) + 20 }]}
          onPress={() => {
            if (tab === 'feriados') { setEditFeriado(null); setShowFeriadoModal(true); }
            else if (tab === 'provas') { setEditProva(null); setShowProvaModal(true); }
          }}
        >
          <Ionicons name="add" size={26} color="#fff" />
        </TouchableOpacity>
      )}

      {/* Trimestre Modal */}
      <TrimestreModal
        visible={showTrimModal}
        trimestre={editTrim}
        onClose={() => setShowTrimModal(false)}
        onSave={handleSaveTrimestre}
      />

      {/* Feriado Modal */}
      <FeriadoModal
        visible={showFeriadoModal}
        evento={editFeriado}
        anoAtivo={ano}
        onClose={() => { setShowFeriadoModal(false); setEditFeriado(null); }}
        onSave={handleSaveFeriado}
      />

      {/* Prova Modal */}
      <ProvaModal
        visible={showProvaModal}
        prova={editProva}
        onClose={() => { setShowProvaModal(false); setEditProva(null); }}
        onSave={handleSaveProva}
      />
    </View>
  );
}

// ─────────────────────────────────────────────────────────────
// STYLES
// ─────────────────────────────────────────────────────────────
const mS = StyleSheet.create({
  overlay:      { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'center' },
  container:    { backgroundColor: Colors.backgroundCard, borderTopLeftRadius: 24, borderTopRightRadius: 24, borderTopWidth: 1, borderColor: Colors.border, padding: 20, maxHeight: '92%' },
  header:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, paddingLeft: 8 },
  title:        { fontSize: 18, fontFamily: 'Inter_700Bold', color: Colors.text },
  sectionLabel: { fontSize: 11, fontFamily: 'Inter_700Bold', color: Colors.textMuted, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 },
  field:        { marginBottom: 14 },
  fieldLabel:   { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: Colors.textSecondary, marginBottom: 6 },
  input:        { backgroundColor: Colors.surface, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, fontFamily: 'Inter_400Regular', color: Colors.text },
  toggleBtn:    { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: 12, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
  toggleText:   { fontSize: 14, fontFamily: 'Inter_500Medium', color: Colors.textSecondary },
  saveBtn:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderRadius: 14, paddingVertical: 16, gap: 8, marginTop: 12 },
  saveBtnText:  { fontSize: 15, fontFamily: 'Inter_700Bold', color: '#fff' },
  tipoBtn:      { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
  tipoText:     { fontSize: 12, fontFamily: 'Inter_500Medium', color: Colors.textSecondary },
});

const styles = StyleSheet.create({
  screen:         { flex: 1, backgroundColor: Colors.background },

  tabBar:         { borderBottomWidth: 1, borderBottomColor: Colors.border },
  tabBarContent:  { flexDirection: 'row', paddingVertical: 8, paddingHorizontal: 4, gap: 4, alignItems: 'center' },
  tabBarMobile:   { paddingVertical: 6, gap: 2 },
  tabBtn:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
  tabBtnActive:   { backgroundColor: `${Colors.gold}20`, borderColor: Colors.gold },
  tabBtnText:     { fontSize: 12, fontFamily: 'Inter_500Medium', color: Colors.textSecondary },
  tabBtnTextMobile: { fontSize: 11 },
  tabBtnTextActive: { color: Colors.gold, fontFamily: 'Inter_600SemiBold' },

  tabContent:     { padding: 16, gap: 12 },
  tabContentMobile: { padding: 12, gap: 10 },

  // Year banner
  anoBanner:      { backgroundColor: Colors.backgroundCard, borderRadius: 16, padding: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: Colors.border },
  anoBannerMobile:{ padding: 14, borderRadius: 14 },
  anoBannerLeft:  { gap: 3 },
  anoBannerRight: { alignItems: 'center' },
  anoLabel:       { fontSize: 11, fontFamily: 'Inter_600SemiBold', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  anoLabelMobile: { fontSize: 10 },
  anoValue:       { fontSize: 28, fontFamily: 'Inter_700Bold', color: Colors.gold },
  anoValueMobile: { fontSize: 24 },
  anoDates:       { fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textSecondary },
  anoDatesMobile: { fontSize: 11 },
  anoStat:        { fontSize: 28, fontFamily: 'Inter_700Bold', color: Colors.text },
  anoStatMobile:  { fontSize: 24 },
  anoStatLabel:   { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted },

  // Progress card
  progressCard:   { backgroundColor: Colors.backgroundCard, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: Colors.border, gap: 8 },
  progressCardMobile: { padding: 12, gap: 6 },
  progressHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  progressLabel:  { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: Colors.text },
  progressLabelMobile: { fontSize: 12 },
  progressPct:    { fontSize: 16, fontFamily: 'Inter_700Bold', color: Colors.gold },
  progressPctMobile: { fontSize: 14 },
  progressBarBg:  { height: 6, backgroundColor: Colors.surface, borderRadius: 4, flex: 1 },
  progressBarFill:{ height: 6, borderRadius: 4 },
  progressSub:    { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted },
  progressSubMobile: { fontSize: 10 },

  // Trimestre card
  trimCard:       { backgroundColor: Colors.backgroundCard, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: Colors.border, gap: 12 },
  trimCardMobile: { padding: 12, gap: 10, borderRadius: 14 },
  trimCardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  trimBadge:      { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 10 },
  trimBadgeMobile:{ paddingHorizontal: 10, paddingVertical: 4 },
  trimBadgeText:  { fontSize: 13, fontFamily: 'Inter_700Bold' },
  trimBadgeTextMobile: { fontSize: 12 },
  trimStatusRow:  { flexDirection: 'row', alignItems: 'center', gap: 8 },
  activePill:     { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, borderWidth: 1 },
  activePillMobile:{ paddingHorizontal: 8, paddingVertical: 3 },
  activeDot:      { width: 6, height: 6, borderRadius: 3 },
  activePillText: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  activePillTextMobile: { fontSize: 10 },
  nowPill:        { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, backgroundColor: `${Colors.info}20` },
  nowPillText:    { fontSize: 11, fontFamily: 'Inter_600SemiBold', color: Colors.info },
  pastLabel:      { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted },
  futureLabel:    { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textSecondary },
  editBtn:        { width: 44, height: 44, borderRadius: 10, backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center' },

  trimDatesGrid:  { flexDirection: 'row', alignItems: 'center' },
  trimDatesGridMobile: { flexWrap: 'wrap', gap: 8 },
  trimDateCell:   { flex: 1, alignItems: 'center', gap: 3 },
  trimDateCellMobile: { minWidth: '30%' },
  trimDateSep:    { width: 1, height: 32, backgroundColor: Colors.border },
  trimDateSepMobile: { display: 'none' },
  trimDateLabel:  { fontSize: 9, fontFamily: 'Inter_700Bold', color: Colors.textMuted, letterSpacing: 0.5 },
  trimDateValue:  { fontSize: 13, fontFamily: 'Inter_700Bold', color: Colors.text },
  trimDateValueMobile: { fontSize: 12 },

  examPeriod:     { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: 10, borderWidth: 1 },
  examPeriodMobile:{ padding: 8, gap: 6 },
  examPeriodText: { fontSize: 12, fontFamily: 'Inter_500Medium', flex: 1 },
  examPeriodTextMobile: { fontSize: 11 },
  addExamBtn:     { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 10 },
  addExamBtnMobile:{ paddingVertical: 8 },
  addExamBtnText: { fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textMuted },
  addExamBtnTextMobile: { fontSize: 11 },

  trimProgressRow:{ flexDirection: 'row', alignItems: 'center', gap: 10 },
  trimProgressRowMobile: { gap: 8 },
  trimProgPct:    { fontSize: 12, fontFamily: 'Inter_700Bold', minWidth: 34, textAlign: 'right' },
  trimProgPctMobile: { fontSize: 11, minWidth: 30 },

  // Year selector
  yearSelector:   { gap: 8, marginTop: 4 },
  yearSelectorLabel: { fontSize: 11, fontFamily: 'Inter_600SemiBold', color: Colors.textMuted, textTransform: 'uppercase' },
  yearBtn:        { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
  yearBtnMobile:  { paddingHorizontal: 12, paddingVertical: 6 },
  yearBtnActive:  { backgroundColor: `${Colors.gold}20`, borderColor: Colors.gold },
  yearBtnText:    { fontSize: 12, fontFamily: 'Inter_500Medium', color: Colors.textSecondary },
  yearBtnTextMobile: { fontSize: 11 },
  yearBtnTextActive: { color: Colors.gold },

  // KPIs
  kpiRow:         { flexDirection: 'row', gap: 10 },
  kpiRowMobile:   { gap: 8 },
  kpiCard:        { flex: 1, backgroundColor: Colors.backgroundCard, borderRadius: 14, padding: 14, alignItems: 'center', borderWidth: 1, borderColor: Colors.border, gap: 4 },
  kpiCardMobile:  { padding: 12, borderRadius: 12 },
  kpiValue:       { fontSize: 26, fontFamily: 'Inter_700Bold', color: Colors.text },
  kpiValueMobile: { fontSize: 22 },
  kpiLabel:       { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted },
  kpiLabelMobile: { fontSize: 10 },

  // Action row
  actionRow:      { flexDirection: 'row', gap: 8 },
  seedBtn:        { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12, backgroundColor: `${Colors.warning}15`, borderWidth: 1, borderColor: `${Colors.warning}40` },
  seedBtnText:    { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: Colors.warning },

  // Feriado card
  feriadoCard:    { backgroundColor: Colors.backgroundCard, borderRadius: 14, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: Colors.border },
  feriadoDateBox: { width: 52, height: 52, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  feriadoDay:     { fontSize: 20, fontFamily: 'Inter_700Bold' },
  feriadoMonth:   { fontSize: 10, fontFamily: 'Inter_600SemiBold', textTransform: 'uppercase' },
  feriadoInfo:    { flex: 1, gap: 2 },
  feriadoNome:    { fontSize: 14, fontFamily: 'Inter_600SemiBold', color: Colors.text },
  feriadoDesc:    { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted },
  feriadoCountdown: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  feriadoActions: { flexDirection: 'row', gap: 12 },

  // Prova card
  provaCard:      { backgroundColor: Colors.backgroundCard, borderRadius: 14, padding: 14, gap: 8, borderWidth: 1, borderColor: Colors.border },
  provaCardTop:   { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  provaInfo:      { flex: 1, gap: 3 },
  provaTitulo:    { fontSize: 14, fontFamily: 'Inter_600SemiBold', color: Colors.text },
  provaMetaRow:   { flexDirection: 'row', alignItems: 'center', gap: 8 },
  provaMeta:      { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted },
  provaTrimBadge: { fontSize: 10, fontFamily: 'Inter_700Bold' },
  provaRight:     { alignItems: 'flex-end', gap: 6 },
  tipoBadge:      { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  tipoText:       { fontSize: 10, fontFamily: 'Inter_600SemiBold' },
  publicadoBtn:   { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
  publicadoBtnActive: { backgroundColor: `${Colors.success}15`, borderColor: Colors.success },
  publicadoText:  { fontSize: 10, fontFamily: 'Inter_500Medium', color: Colors.textMuted },
  provaDesc:      { fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textSecondary },
  provaActions:   { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
  actionBtn:      { width: 44, height: 44, borderRadius: 10, backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center' },

  // Section
  section:        { gap: 8 },
  sectionTitle:   { fontSize: 11, fontFamily: 'Inter_700Bold', color: Colors.textSecondary, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 4 },

  // Annual calendar
  legendRow:      { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 4 },
  legendItem:     { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot:      { width: 10, height: 10, borderRadius: 5 },
  legendText:     { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textSecondary },
  monthBlock:     { backgroundColor: Colors.backgroundCard, borderRadius: 14, padding: 12, borderWidth: 1, borderColor: Colors.border },
  monthTitle:     { fontSize: 13, fontFamily: 'Inter_700Bold', color: Colors.text, marginBottom: 10 },
  monthGrid:      { flexDirection: 'row', flexWrap: 'wrap' },
  dowLabel:       { width: '14.28%', textAlign: 'center', fontSize: 9, fontFamily: 'Inter_600SemiBold', color: Colors.textMuted, paddingBottom: 6 },
  dayCell:        { width: '14.28%', aspectRatio: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 4, marginBottom: 2 },
  dayNum:         { fontSize: 10, fontFamily: 'Inter_400Regular', color: Colors.text },

  // Empty state
  emptyState:     { alignItems: 'center', gap: 10, paddingVertical: 60 },
  emptyText:      { fontSize: 15, fontFamily: 'Inter_600SemiBold', color: Colors.textSecondary },
  emptySubText:   { fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textMuted, textAlign: 'center', paddingHorizontal: 24 },

  // FAB
  fab:            { position: 'absolute', right: 20, width: 56, height: 56, borderRadius: 28, backgroundColor: Colors.gold, alignItems: 'center', justifyContent: 'center', elevation: 8, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, zIndex: 20 },
});

// ─────────────────────────────────────────────────────────────
// ÉPOCAS TAB STYLES
// ─────────────────────────────────────────────────────────────
const epS = StyleSheet.create({
  infoCard:        { flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: `${Colors.info}12`, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: `${Colors.info}30` },
  infoText:        { flex: 1, fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textSecondary, lineHeight: 18 },

  epochCard:       { backgroundColor: Colors.backgroundCard, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: Colors.border, gap: 14 },
  epochCardNormal: { borderWidth: 1.5, shadowColor: '#E74C3C', shadowOpacity: 0.08, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 3 },

  epochHeader:     { flexDirection: 'row', alignItems: 'center', gap: 12 },
  epochIconWrap:   { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  epochTitleRow:   { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 },
  epochTitle:      { fontSize: 16, fontFamily: 'Inter_700Bold' },

  systemBadge:     { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, backgroundColor: `${Colors.info}15`, borderWidth: 1, borderColor: `${Colors.info}30` },
  systemBadgeText: { fontSize: 9, fontFamily: 'Inter_600SemiBold', color: Colors.info, textTransform: 'uppercase', letterSpacing: 0.3 },

  epochStatusRow:  { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statusDot:       { width: 7, height: 7, borderRadius: 4 },
  statusLabel:     { fontSize: 12, fontFamily: 'Inter_500Medium' },

  epochDatesMini:  { alignItems: 'flex-end', gap: 2 },
  epochDatesMiniText: { fontSize: 11, fontFamily: 'Inter_500Medium', color: Colors.textSecondary },

  pickerHint:      { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted, textAlign: 'center', fontStyle: 'italic' },

  obsLabel:        { fontSize: 10, fontFamily: 'Inter_700Bold', color: Colors.textMuted, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 6 },
  obsInput:        { backgroundColor: Colors.surface, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 14, paddingVertical: 10, fontSize: 13, fontFamily: 'Inter_400Regular', color: Colors.text, minHeight: 56, textAlignVertical: 'top' },
  obsDisplay:      { fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textMuted, fontStyle: 'italic', paddingTop: 4, borderTopWidth: 1, borderTopColor: Colors.border },

  infoCardMobile:  {},
  epochCardMobile: {},
  saveBtn:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 12, paddingVertical: 14, cursor: 'pointer' } as any,
  saveBtnDisabled: { opacity: 0.45 },
  saveBtnText:     { fontSize: 14, fontFamily: 'Inter_700Bold', color: '#fff' },

  readOnlyRow:     { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, backgroundColor: Colors.surface, borderRadius: 10 },
  readOnlyText:    { fontSize: 13, fontFamily: 'Inter_500Medium', color: Colors.textSecondary, flex: 1 },
  readOnlyNone:    { fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textMuted, textAlign: 'center', paddingVertical: 8 },
});
