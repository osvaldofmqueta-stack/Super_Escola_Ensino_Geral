import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {FlatList, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View} from 'react-native';
import AppLoader from '@/components/AppLoader';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors } from '@/constants/colors';
import { useAuth, getAuthToken } from '@/context/AuthContext';
import { useConfig } from '@/context/ConfigContext';
import TopBar from '@/components/TopBar';
import { SkeletonList } from '@/components/Skeleton';
import { alertSucesso, alertErro } from '@/utils/toast';
import { useLookup } from '@/hooks/useLookup';
import { webAlert } from '@/utils/webAlert';
import RequiredMark from '@/components/RequiredMark';
import { StableSearchInput } from '@/components/StableSearchInput';
import { api, refreshAccessToken } from '@/lib/api';
import { getApiUrl } from '@/lib/query-client';
import PaginationBar from '@/components/PaginationBar';

// ─── Constantes ─────────────────────────────────────────────────────────────

const COMPONENTES = [
  'Sócio-Cultural',
  'Científica',
  'Técnica, Tecnológica e Prática',
] as const;
type Componente = typeof COMPONENTES[number] | '';

const CATEGORIAS_FORMACAO = [
  { value: 'formacao_geral',     label: 'Formação Geral',      icon: 'book-open-variant', color: '#3B82F6' },
  { value: 'formacao_especifica',label: 'Formação Específica', icon: 'briefcase-outline',  color: '#8B5CF6' },
  { value: 'opcional',           label: 'Opcional',            icon: 'plus-circle-outline', color: '#10B981' },
] as const;
type CategoriaFormacao = 'formacao_geral' | 'formacao_especifica' | 'opcional' | '';

const COMPONENTE_COLORS: Record<string, string> = {
  'Sócio-Cultural':                   '#8B5CF6',
  'Científica':                        '#3B82F6',
  'Técnica, Tecnológica e Prática':   '#F59E0B',
};

const COMPONENTE_ICONS: Record<string, string> = {
  'Sócio-Cultural':                   'account-group',
  'Científica':                        'atom',
  'Técnica, Tecnológica e Prática':   'wrench',
};

const COMPONENTE_SHORT: Record<string, string> = {
  'Sócio-Cultural':                   'Sócio-Cultural',
  'Científica':                        'Científica',
  'Técnica, Tecnológica e Prática':   'Técnica / Prática',
};

// Partilhado com admin.tsx (areas_curso) — lista gerida pelo Admin em "Áreas de Formação"
const AREAS_DEFAULT = [
  'Ciências e Tecnologia',
  'Ciências Económicas, Jurídicas e Sociais',
  'Humanidades',
  'Artes',
  'Ciências de Informação e Comunicação',
  'Formação de Professores',
];

const CLASSES_DEFAULT = [
  'Iniciação',
  '1ª Classe', '2ª Classe', '3ª Classe', '4ª Classe', '5ª Classe', '6ª Classe',
  '7ª Classe', '8ª Classe', '9ª Classe',
  '10ª Classe', '11ª Classe', '12ª Classe', '13ª Classe',
];

function classeIdx(classe: string, lista: string[]): number {
  const i = lista.indexOf(classe);
  if (i !== -1) return i;
  const n = parseInt(classe.replace(/[^0-9]/g, ''));
  return isNaN(n) ? -1 : n;
}

// ─── Tipos ───────────────────────────────────────────────────────────────────

interface Disciplina {
  id: string;
  nome: string;
  codigo: string;
  area: string;
  descricao: string;
  ativo: boolean;
  tipo: string;
  classeInicio: string;
  classeFim: string;
  componente: string;
  nuclear: boolean;
  nuclearArt23: boolean;
  categoriaFormacao: string;
  createdAt: string;
}

interface FormState {
  nome: string;
  codigo: string;
  area: string;
  descricao: string;
  ativo: boolean;
  tipo: string;
  classeInicio: string;
  classeFim: string;
  componente: string;
  nuclear: boolean;
  nuclearArt23: boolean;
  categoriaFormacao: string;
}

const EMPTY_FORM: FormState = {
  nome: '',
  codigo: '',
  area: AREAS_DEFAULT[0],
  descricao: '',
  ativo: true,
  tipo: 'continuidade',
  classeInicio: '',
  classeFim: '',
  componente: '',
  nuclear: false,
  nuclearArt23: false,
  categoriaFormacao: '',
};

type PickerField = 'area' | 'classeInicio' | 'classeFim' | null;

// ─── Modal de Formulário ──────────────────────────────────────────────────────

function DisciplinaFormModal({
  visible, onClose, onSave, disciplina,
}: {
  visible: boolean;
  onClose: () => void;
  onSave: (form: FormState) => Promise<void>;
  disciplina: Disciplina | null;
}) {
  const { values: areas } = useLookup('areas_curso', AREAS_DEFAULT);
  const { values: classesRaw } = useLookup('classes', CLASSES_DEFAULT);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [activePicker, setActivePicker] = useState<PickerField>(null);
  const codigoRef = useRef<any>(null);
  const insets = useSafeAreaInsets();
  const bottomPad = Platform.OS === 'web' ? 34 : insets.bottom;

  useEffect(() => {
    if (disciplina) {
      setForm({
        nome: disciplina.nome,
        codigo: disciplina.codigo,
        area: disciplina.area || areas[0] || AREAS_DEFAULT[0],
        descricao: disciplina.descricao,
        ativo: disciplina.ativo,
        tipo: disciplina.tipo || 'continuidade',
        classeInicio: disciplina.classeInicio || '',
        classeFim: disciplina.classeFim || '',
        componente: disciplina.componente || '',
        nuclear: disciplina.nuclear ?? false,
        nuclearArt23: disciplina.nuclearArt23 ?? false,
        categoriaFormacao: disciplina.categoriaFormacao || '',
      });
    } else {
      setForm({ ...EMPTY_FORM, area: areas[0] || AREAS_DEFAULT[0] });
    }
  }, [disciplina, visible, areas]);

  const set = (k: keyof FormState, v: any) => setForm(f => ({
    ...f,
    [k]: v,
    ...(k === 'area' && v !== 'Formação Profissional' ? { componente: '' } : {}),
  }));

  async function handleSave() {
    if (!form.nome.trim()) {
      webAlert('Campo obrigatório', 'O nome da disciplina é obrigatório.');
      return;
    }
    if (form.classeInicio && form.classeFim) {
      const iI = classeIdx(form.classeInicio, classesRaw.length ? classesRaw : CLASSES_DEFAULT);
      const iF = classeIdx(form.classeFim, classesRaw.length ? classesRaw : CLASSES_DEFAULT);
      if (iI !== -1 && iF !== -1 && iI > iF) {
        webAlert('Intervalo de classes inválido', 'A Classe de Início não pode ser posterior à Classe de Fim. Corrija o intervalo antes de guardar.');
        return;
      }
    }
    setSaving(true);
    try {
      await onSave(form);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  const classesList = classesRaw.length ? classesRaw : CLASSES_DEFAULT;
  const classesFimFiltradas = form.classeInicio
    ? classesList.filter(c => classeIdx(c, classesList) >= classeIdx(form.classeInicio, classesList))
    : classesList;
  const classeErroOrdem = !!(form.classeInicio && form.classeFim &&
    classeIdx(form.classeInicio, classesList) > classeIdx(form.classeFim, classesList));

  const pickerOptions: Record<NonNullable<PickerField>, string[]> = {
    area: areas,
    classeInicio: classesList,
    classeFim: classesFimFiltradas,
  };

  const pickerTitles: Record<NonNullable<PickerField>, string> = {
    area: 'Área de Conhecimento',
    classeInicio: 'Classe de Início',
    classeFim: 'Classe de Fim',
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={mStyles.overlay}>
          <View style={[mStyles.container, { paddingBottom: bottomPad + 8 }]}>

            {/* ── Cabeçalho ── */}
            <View style={mStyles.header}>
              <View style={mStyles.headerLeft}>
                <View style={mStyles.headerIcon}>
                  <MaterialCommunityIcons name="book-open-variant" size={18} color={Colors.accent} />
                </View>
                <View>
                  <Text style={mStyles.title}>{disciplina ? 'Editar Disciplina' : 'Nova Disciplina'}</Text>
                  <Text style={mStyles.subtitle}>Catálogo de Disciplinas</Text>
                </View>
              </View>
              <TouchableOpacity onPress={onClose} disabled={saving} style={mStyles.closeBtn}>
                <Ionicons name="close" size={15} color={Colors.text} />
              </TouchableOpacity>
            </View>
            <View style={mStyles.accentLine} />

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

              {/* ── Secção: Identificação ── */}
              <Text style={mStyles.sectionLabel}>IDENTIFICAÇÃO</Text>

              {/* Nome */}
              <View style={mStyles.inputGroup}>
                <View style={mStyles.inputIconWrap}>
                  <MaterialCommunityIcons name="format-title" size={15} color={Colors.accent} />
                </View>
                <View style={mStyles.inputInner}>
                  <Text style={mStyles.floatLabel}>Nome da Disciplina <Text style={{ color: Colors.danger }}>*</Text></Text>
                  <TextInput
                    style={mStyles.inputText}
                    value={form.nome}
                    onChangeText={v => set('nome', v)}
                    placeholder="Ex: Matemática, Língua Portuguesa..."
                    placeholderTextColor={Colors.textMuted}
                    autoFocus
                    returnKeyType="next"
                    onSubmitEditing={() => codigoRef.current?.focus()}
                  />
                </View>
              </View>

              {/* Código + Área (row) */}
              <View style={{ flexDirection: 'row', gap: 10, marginBottom: 0 }}>
                <View style={[mStyles.inputGroup, { flex: 0.32, marginBottom: 10 }]}>
                  <View style={mStyles.inputIconWrap}>
                    <MaterialCommunityIcons name="pound" size={14} color={Colors.gold} />
                  </View>
                  <View style={mStyles.inputInner}>
                    <Text style={mStyles.floatLabel}>Código</Text>
                    <TextInput
                      ref={codigoRef}
                      style={mStyles.inputText}
                      value={form.codigo}
                      onChangeText={v => set('codigo', v.toUpperCase())}
                      placeholder="MAT"
                      placeholderTextColor={Colors.textMuted}
                      autoCapitalize="characters"
                      maxLength={6}
                      returnKeyType="done"
                      onSubmitEditing={handleSave}
                    />
                  </View>
                </View>
                <TouchableOpacity
                  style={[mStyles.inputGroup, { flex: 0.68, marginBottom: 10 }]}
                  onPress={() => setActivePicker('area')}
                >
                  <View style={[mStyles.inputIconWrap, { backgroundColor: areaColor(form.area) + '28' }]}>
                    <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: areaColor(form.area) }} />
                  </View>
                  <View style={[mStyles.inputInner, { flexDirection: 'column' }]}>
                    <Text style={mStyles.floatLabel}>Área de Conhecimento</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <Text style={[mStyles.inputText, { flex: 1 }]} numberOfLines={1}>
                        {form.area || 'Seleccionar...'}
                      </Text>
                      <Ionicons name="chevron-down" size={14} color={Colors.textMuted} />
                    </View>
                  </View>
                </TouchableOpacity>
              </View>

              {/* ── Componente (só Formação Profissional) ── */}
              {form.area === 'Formação Profissional' && (
                <>
                  <Text style={mStyles.sectionLabel}>COMPONENTE CURRICULAR</Text>
                  <View style={mStyles.compRow}>
                    {COMPONENTES.map(c => {
                      const active = form.componente === c;
                      const color = COMPONENTE_COLORS[c];
                      return (
                        <TouchableOpacity
                          key={c}
                          style={[mStyles.compBtn, active && { backgroundColor: color + '22', borderColor: color + '70' }]}
                          onPress={() => set('componente', active ? '' : c)}
                        >
                          <MaterialCommunityIcons name={COMPONENTE_ICONS[c] as any} size={16} color={active ? color : Colors.textMuted} />
                          <Text style={[mStyles.compBtnText, active && { color, fontFamily: 'Inter_600SemiBold' }]}>
                            {COMPONENTE_SHORT[c]}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </>
              )}

              {/* ── Tipo de Disciplina ── */}
              <Text style={[mStyles.sectionLabel, { marginTop: 14 }]}>TIPO DE DISCIPLINA</Text>
              <View style={mStyles.tipoRow}>
                <TouchableOpacity
                  style={[mStyles.tipoCard, form.tipo === 'continuidade' && mStyles.tipoCardCont]}
                  onPress={() => set('tipo', 'continuidade')}
                >
                  <View style={[mStyles.tipoCardIcon, { backgroundColor: Colors.info + '20' }]}>
                    <MaterialCommunityIcons name="arrow-right-bold-circle" size={22} color={form.tipo === 'continuidade' ? Colors.info : Colors.textMuted} />
                  </View>
                  <Text style={[mStyles.tipoCardTitle, form.tipo === 'continuidade' && { color: Colors.info }]}>Continuidade</Text>
                  <Text style={mStyles.tipoCardDesc}>Vários anos consecutivos</Text>
                  {form.tipo === 'continuidade' && (
                    <View style={mStyles.tipoCardCheck}>
                      <Ionicons name="checkmark-circle" size={15} color={Colors.info} />
                    </View>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  style={[mStyles.tipoCard, form.tipo === 'terminal' && mStyles.tipoCardTerm]}
                  onPress={() => set('tipo', 'terminal')}
                >
                  <View style={[mStyles.tipoCardIcon, { backgroundColor: Colors.warning + '20' }]}>
                    <MaterialCommunityIcons name="flag-checkered" size={22} color={form.tipo === 'terminal' ? Colors.warning : Colors.textMuted} />
                  </View>
                  <Text style={[mStyles.tipoCardTitle, form.tipo === 'terminal' && { color: Colors.warning }]}>Terminal</Text>
                  <Text style={mStyles.tipoCardDesc}>Encerra numa só classe</Text>
                  {form.tipo === 'terminal' && (
                    <View style={mStyles.tipoCardCheck}>
                      <Ionicons name="checkmark-circle" size={15} color={Colors.warning} />
                    </View>
                  )}
                </TouchableOpacity>
              </View>

              {/* ── Intervalo de Classes ── */}
              <Text style={[mStyles.sectionLabel, { marginTop: 14 }]}>INTERVALO DE CLASSES</Text>
              <View style={mStyles.classeRow}>
                <TouchableOpacity
                  style={[mStyles.classeCard, classeErroOrdem && mStyles.classeCardError]}
                  onPress={() => setActivePicker('classeInicio')}
                >
                  <Text style={[mStyles.classeCardLbl, classeErroOrdem && { color: Colors.danger }]}>INÍCIO</Text>
                  <Text style={[mStyles.classeCardVal, !form.classeInicio && { color: Colors.textMuted }, classeErroOrdem && { color: Colors.danger }]}>
                    {form.classeInicio ? form.classeInicio.replace(' Classe', '') : '—'}
                  </Text>
                  <Ionicons name="chevron-down" size={12} color={classeErroOrdem ? Colors.danger : Colors.textMuted} style={{ marginTop: 3 }} />
                </TouchableOpacity>

                <View style={mStyles.classeConnector}>
                  <View style={[mStyles.classeLine, classeErroOrdem && { backgroundColor: Colors.danger + '50' }]} />
                  <View style={[mStyles.classeArrowBox, classeErroOrdem && { borderColor: Colors.danger + '50', backgroundColor: Colors.danger + '12' }]}>
                    <Ionicons name="arrow-forward" size={11} color={classeErroOrdem ? Colors.danger : Colors.textMuted} />
                  </View>
                  <View style={[mStyles.classeLine, classeErroOrdem && { backgroundColor: Colors.danger + '50' }]} />
                </View>

                <TouchableOpacity
                  style={[mStyles.classeCard, classeErroOrdem && mStyles.classeCardError]}
                  onPress={() => setActivePicker('classeFim')}
                >
                  <Text style={[mStyles.classeCardLbl, classeErroOrdem && { color: Colors.danger }]}>FIM</Text>
                  <Text style={[mStyles.classeCardVal, !form.classeFim && { color: Colors.textMuted }, classeErroOrdem && { color: Colors.danger }]}>
                    {form.classeFim ? form.classeFim.replace(' Classe', '') : '—'}
                  </Text>
                  <Ionicons name="chevron-down" size={12} color={classeErroOrdem ? Colors.danger : Colors.textMuted} style={{ marginTop: 3 }} />
                </TouchableOpacity>
              </View>

              {classeErroOrdem && (
                <View style={mStyles.erroOrdemWrap}>
                  <Ionicons name="warning" size={12} color={Colors.danger} />
                  <Text style={mStyles.erroOrdemText}>A Classe de Início não pode ser posterior à Classe de Fim.</Text>
                </View>
              )}

              {/* ── Descrição ── */}
              <Text style={[mStyles.sectionLabel, { marginTop: 14 }]}>
                DESCRIÇÃO <Text style={{ color: Colors.textMuted, fontFamily: 'Inter_400Regular', fontSize: 9 }}>(OPCIONAL)</Text>
              </Text>
              <View style={[mStyles.inputGroup, { marginBottom: 14 }]}>
                <View style={mStyles.inputIconWrap}>
                  <MaterialCommunityIcons name="text-long" size={14} color={Colors.textMuted} />
                </View>
                <View style={mStyles.inputInner}>
                  <TextInput
                    style={[mStyles.inputText, { minHeight: 60, textAlignVertical: 'top', paddingTop: 2 }]}
                    value={form.descricao}
                    onChangeText={v => set('descricao', v)}
                    placeholder="Descrição breve da disciplina..."
                    placeholderTextColor={Colors.textMuted}
                    multiline
                    numberOfLines={3}
                  />
                </View>
              </View>

              {/* ── Activa ── */}
              <View style={mStyles.switchRow}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
                  <MaterialCommunityIcons
                    name={form.ativo ? 'check-decagram' : 'close-circle-outline'}
                    size={18}
                    color={form.ativo ? Colors.success : Colors.textMuted}
                  />
                  <View>
                    <Text style={mStyles.switchLabel}>Disciplina activa</Text>
                    <Text style={mStyles.switchSub}>{form.ativo ? 'Visível e disponível no catálogo' : 'Oculta do catálogo activo'}</Text>
                  </View>
                </View>
                <TouchableOpacity
                  style={[mStyles.toggleTrack, form.ativo && mStyles.toggleTrackOn]}
                  onPress={() => set('ativo', !form.ativo)}
                >
                  <View style={[mStyles.toggleThumb, form.ativo && mStyles.toggleThumbOn]} />
                </TouchableOpacity>
              </View>

              {/* ── Categoria para Certificado ── */}
              <Text style={[mStyles.sectionLabel, { marginTop: 14 }]}>
                CATEGORIA NO CERTIFICADO
                <Text style={{ color: Colors.textMuted, fontFamily: 'Inter_400Regular', fontSize: 9 }}> (DISTRIBUIÇÃO)</Text>
              </Text>
              <View style={mStyles.compRow}>
                {CATEGORIAS_FORMACAO.map(cat => {
                  const active = form.categoriaFormacao === cat.value;
                  return (
                    <TouchableOpacity
                      key={cat.value}
                      style={[mStyles.compBtn, active && { backgroundColor: cat.color + '22', borderColor: cat.color + '70' }]}
                      onPress={() => set('categoriaFormacao', active ? '' : cat.value)}
                    >
                      <MaterialCommunityIcons
                        name={cat.icon as any}
                        size={16}
                        color={active ? cat.color : Colors.textMuted}
                      />
                      <Text style={[mStyles.compBtnText, active && { color: cat.color, fontFamily: 'Inter_600SemiBold' }]}>
                        {cat.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              {!form.categoriaFormacao && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4, marginBottom: 2, paddingHorizontal: 4 }}>
                  <Ionicons name="information-circle-outline" size={13} color={Colors.textMuted} />
                  <Text style={{ color: Colors.textMuted, fontSize: 11, fontFamily: 'Inter_400Regular' }}>
                    Sem categoria — a disciplina não será agrupada no certificado
                  </Text>
                </View>
              )}

              {/* ── Nuclear / Exame Nacional ── */}
              <Text style={[mStyles.sectionLabel, { marginTop: 14 }]}>EXAME NACIONAL (DISCIPLINA NUCLEAR)</Text>
              <TouchableOpacity
                activeOpacity={0.85}
                style={[
                  mStyles.nuclearCard,
                  form.nuclear && mStyles.nuclearCardOn,
                ]}
                onPress={() => set('nuclear', !form.nuclear)}
              >
                <View style={[mStyles.nuclearIconWrap, { backgroundColor: form.nuclear ? '#DC2626' + '22' : Colors.surface }]}>
                  <MaterialCommunityIcons
                    name={form.nuclear ? 'school' : 'school-outline'}
                    size={22}
                    color={form.nuclear ? '#DC2626' : Colors.textMuted}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[mStyles.nuclearTitle, form.nuclear && { color: '#DC2626' }]}>
                    {form.nuclear ? '✅ Sujeita a Exame Nacional' : 'Disciplina Nuclear (Exame Nacional)'}
                  </Text>
                  <Text style={mStyles.nuclearDesc}>
                    {form.nuclear
                      ? 'Na 9ª e 12ª classe: MFD inclui a Nota do Exame Nacional (NEN). Negativa bloqueia aprovação mesmo dentro do limite de deficiências.'
                      : 'Activar para disciplinas com Exame Nacional (LP, Mat, CN, Hist, Geo…). A fórmula MFD usará NEN na 9ª e 12ª classe.'
                    }
                  </Text>
                </View>
                <View style={[mStyles.toggleTrack, form.nuclear && mStyles.toggleTrackDanger]}>
                  <View style={[mStyles.toggleThumb, form.nuclear && mStyles.toggleThumbDanger]} />
                </View>
              </TouchableOpacity>
              {form.nuclear && (
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: 6, paddingHorizontal: 4 }}>
                  <Ionicons name="information-circle-outline" size={13} color='#DC2626' style={{ marginTop: 1 }} />
                  <Text style={{ color: '#DC2626', fontSize: 11, fontFamily: 'Inter_400Regular', flex: 1, lineHeight: 15 }}>
                    Decreto Exec. nº 04/2026 — Fórmulas MFD: 9ª classe → 0,6×MT₃ + 0,4×NEN &nbsp;|&nbsp; 12ª classe → 0,5×MT₃ + 0,5×NEN
                  </Text>
                </View>
              )}

              {/* ── Nuclear Art. 23º §2 ── */}
              <Text style={[mStyles.sectionLabel, { marginTop: 14 }]}>RESTRIÇÃO ART. 23º §2 (I e II CICLO)</Text>
              <TouchableOpacity
                activeOpacity={0.85}
                style={[
                  mStyles.nuclearCard,
                  form.nuclearArt23 && { borderColor: '#7c3aed', borderWidth: 1.5, backgroundColor: '#7c3aed' + '10' },
                ]}
                onPress={() => set('nuclearArt23', !form.nuclearArt23)}
              >
                <View style={[mStyles.nuclearIconWrap, { backgroundColor: form.nuclearArt23 ? '#7c3aed' + '22' : Colors.surface }]}>
                  <MaterialCommunityIcons
                    name={form.nuclearArt23 ? 'shield-check' : 'shield-outline'}
                    size={22}
                    color={form.nuclearArt23 ? '#7c3aed' : Colors.textMuted}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[mStyles.nuclearTitle, form.nuclearArt23 && { color: '#7c3aed' }]}>
                    {form.nuclearArt23 ? '✅ Nuclear Art. 23 — bloqueia transição' : 'Disciplina Nuclear para Art. 23º §2'}
                  </Text>
                  <Text style={mStyles.nuclearDesc}>
                    {form.nuclearArt23
                      ? 'Quando TODAS as negativas do aluno são disciplinas com este marcador, a transição condicional é bloqueada (I e/ou II Ciclo).'
                      : 'Activar em disciplinas que, em conjunto, bloqueiam a transição condicional (ex: LP + Matemática). Aplica-se a 7ª/8ª e/ou 10ª–12ª conforme Config.'}
                  </Text>
                </View>
                <View style={[mStyles.toggleTrack, form.nuclearArt23 && { backgroundColor: '#7c3aed' + '55' }]}>
                  <View style={[mStyles.toggleThumb, form.nuclearArt23 && { backgroundColor: '#7c3aed', transform: [{ translateX: 18 }] }]} />
                </View>
              </TouchableOpacity>
              {form.nuclearArt23 && (
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: 6, paddingHorizontal: 4 }}>
                  <Ionicons name="information-circle-outline" size={13} color='#7c3aed' style={{ marginTop: 1 }} />
                  <Text style={{ color: '#7c3aed', fontSize: 11, fontFamily: 'Inter_400Regular', flex: 1, lineHeight: 15 }}>
                    Art. 23º §2 — Decreto Exec. nº 3/20. Para bloquear a transição são necessárias ≥ 2 disciplinas nucleares configuradas. Active também o toggle de ciclo em Configurações → Restrição Art. 23.
                  </Text>
                </View>
              )}

            </ScrollView>

            {/* ── Botão Guardar ── */}
            <TouchableOpacity
              style={[mStyles.saveBtn, (saving || classeErroOrdem) && { opacity: 0.7 }]}
              onPress={handleSave}
              disabled={saving || classeErroOrdem}
            >
              {saving
                ? <AppLoader color="#fff" />
                : <>
                  <Ionicons name="checkmark-circle" size={20} color="#fff" />
                  <Text style={mStyles.saveBtnText}>{disciplina ? 'Guardar Alterações' : 'Criar Disciplina'}</Text>
                </>
              }
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Picker Genérico ── */}
        {activePicker && (
          <Modal visible transparent animationType="fade" onRequestClose={() => setActivePicker(null)}>
            <TouchableOpacity style={mStyles.pickerOverlay} onPress={() => setActivePicker(null)} activeOpacity={1}>
              <View style={mStyles.pickerList}>
                <View style={mStyles.pickerHeader}>
                  <MaterialCommunityIcons
                    name={activePicker === 'area' ? 'tag-outline' : 'school-outline'}
                    size={15} color={Colors.accent}
                  />
                  <Text style={mStyles.pickerTitle}>{pickerTitles[activePicker]}</Text>
                </View>
                <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 340 }}>
                  {pickerOptions[activePicker].map(opt => {
                    const isActive = form[activePicker] === opt;
                    return (
                      <TouchableOpacity
                        key={opt}
                        style={[mStyles.pickerItem, isActive && mStyles.pickerItemActive]}
                        onPress={() => { set(activePicker, opt); setActivePicker(null); }}
                      >
                        {activePicker === 'area' && (
                          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: areaColor(opt), marginRight: 10 }} />
                        )}
                        <Text style={[mStyles.pickerItemText, isActive && mStyles.pickerItemTextActive]}>{opt}</Text>
                        {isActive && <Ionicons name="checkmark-circle" size={16} color={Colors.accent} />}
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            </TouchableOpacity>
          </Modal>
        )}
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const AREA_COLORS: Record<string, string> = {
  'Ciências Exactas': '#3B82F6',
  'Ciências Naturais': '#10B981',
  'Ciências Sociais e Humanas': '#8B5CF6',
  'Línguas e Comunicação': '#F59E0B',
  'Artes e Expressão': '#EC4899',
  'Tecnologia e Informática': '#06B6D4',
  'Educação Física': '#F97316',
  'Formação Profissional': '#84CC16',
  'Outra': Colors.textMuted,
};

function areaColor(area: string) {
  return AREA_COLORS[area] || Colors.textMuted;
}

function tipoBadge(tipo: string, classeInicio: string, classeFim: string) {
  const isTerminal = tipo === 'terminal';
  const range = classeInicio && classeFim
    ? (classeInicio === classeFim ? classeInicio : `${classeInicio} – ${classeFim}`)
    : classeInicio || classeFim || null;
  return { isTerminal, range };
}

// ─── Ecrã Principal ───────────────────────────────────────────────────────────

export default function DisciplinasScreen() {
  const { user } = useAuth();
  const { config } = useConfig();
  const insets = useSafeAreaInsets();
  const bottomPad = Platform.OS === 'web' ? 34 : insets.bottom;
  const tem13 = (config as any).temDecimaTermeira !== false;
  const CLASSES_DISPONIVEIS = tem13
    ? CLASSES_DEFAULT
    : CLASSES_DEFAULT.filter(c => c !== '13ª Classe');

  const [disciplinas, setDisciplinas] = useState<Disciplina[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 20;
  const [filterArea, setFilterArea] = useState<string>('Todas');
  const [filterTipo, setFilterTipo] = useState<string>('Todos');
  const [filterComp, setFilterComp] = useState<string>('Todas');
  const [filterSemCategoria, setFilterSemCategoria] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<Disciplina | null>(null);
  const [showAreaFilter, setShowAreaFilter] = useState(false);
  const [showTipoFilter, setShowTipoFilter] = useState(false);
  const [showCompFilter, setShowCompFilter] = useState(false);
  const [showProvaModal, setShowProvaModal] = useState(false);
  const [provaData, setProvaData] = useState<{ total: number; notaMin: number; alunos: any[] } | null>(null);
  const [provaLoading, setProvaLoading] = useState(false);
  const [notificando, setNotificando] = useState(false);

  const { values: areasFromDB } = useLookup('areas_curso', AREAS_DEFAULT);

  const canEdit = ['admin', 'ceo', 'pca', 'director', 'chefe_secretaria', 'secretaria'].includes(user?.role ?? '');

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/disciplinas');
      if (res.ok) setDisciplinas(await res.json());
    } catch {
      alertErro('Erro', 'Não foi possível carregar as disciplinas.');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadProvaData = useCallback(async () => {
    setProvaLoading(true);
    try {
      const data = await api.get<{ total: number; notaMin: number; alunos: any[] }>('/api/disciplinas/alunos-prova');
      setProvaData(data);
    } catch {
      alertErro('Erro', 'Não foi possível carregar os dados.');
    } finally {
      setProvaLoading(false);
    }
  }, []);

  async function notificarAlunos() {
    setNotificando(true);
    try {
      const data = await api.post<{ enviadas: number; error?: string }>('/api/disciplinas/alunos-prova/notificar', {});
      alertSucesso('Notificações enviadas', `${data.enviadas} encarregado(s) notificado(s).`);
    } catch (e: any) {
      alertErro('Erro', e?.message || 'Falha ao enviar notificações.');
    } finally {
      setNotificando(false);
    }
  }

  useEffect(() => { load(); }, [load]);

  const areas = ['Todas', ...areasFromDB];
  const tiposFilter = ['Todos', 'Continuidade', 'Terminal'];
  const compFilter = ['Todas', ...COMPONENTES, 'Sem componente'];

  const filtered = disciplinas.filter(d => {
    const matchSearch = d.nome.toLowerCase().includes(search.toLowerCase()) ||
      d.codigo.toLowerCase().includes(search.toLowerCase()) ||
      d.area.toLowerCase().includes(search.toLowerCase());
    const matchArea = filterArea === 'Todas' || d.area === filterArea;
    const matchTipo = filterTipo === 'Todos' ||
      (filterTipo === 'Terminal' && d.tipo === 'terminal') ||
      (filterTipo === 'Continuidade' && d.tipo !== 'terminal');
    const matchComp = filterComp === 'Todas' ||
      (filterComp === 'Sem componente' && !d.componente) ||
      d.componente === filterComp;
    const matchCategoria = !filterSemCategoria || !d.categoriaFormacao;
    return matchSearch && matchArea && matchTipo && matchComp && matchCategoria;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const paginatedDisc = useMemo(() => filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE), [filtered, safePage]);
  useEffect(() => { setCurrentPage(1); }, [search, filterArea, filterTipo, filterComp, filterSemCategoria]);

  // Contagens por componente
  const cSocio    = disciplinas.filter(d => d.componente === 'Sócio-Cultural').length;
  const cCiencia  = disciplinas.filter(d => d.componente === 'Científica').length;
  const cTec      = disciplinas.filter(d => d.componente === 'Técnica, Tecnológica e Prática').length;
  const cGeral    = disciplinas.filter(d => !d.componente).length;
  const semCategoria = disciplinas.filter(d => !d.categoriaFormacao).length;

  async function handleSave(form: FormState) {
    try {
      if (editItem) {
        const res = await fetch(`/api/disciplinas/${editItem.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        });
        if (!res.ok) throw new Error('Erro ao actualizar disciplina.');
        alertSucesso('Disciplina actualizada', `"${form.nome}" foi actualizada com sucesso.`);
      } else {
        const res = await fetch('/api/disciplinas', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        });
        if (!res.ok) throw new Error('Erro ao criar disciplina.');
        alertSucesso('Disciplina criada', `"${form.nome}" foi adicionada ao catálogo.`);
      }
      await load();
      setEditItem(null);
    } catch (e: any) {
      alertErro('Erro', e.message);
      throw e;
    }
  }

  function handleDelete(d: Disciplina) {
    webAlert(
      'Remover Disciplina',
      `Tem a certeza que deseja remover "${d.nome}"? Esta acção não pode ser revertida.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Remover', style: 'destructive',
          onPress: async () => {
            try {
              const res = await fetch(`/api/disciplinas/${d.id}`, { method: 'DELETE' });
              if (!res.ok) throw new Error('Erro ao remover disciplina.');
              alertSucesso('Disciplina removida', `"${d.nome}" foi removida do catálogo.`);
              await load();
            } catch (e: any) {
              alertErro('Erro', e.message);
            }
          },
        },
      ]
    );
  }

  const renderItem = ({ item }: { item: Disciplina }) => {
    const color = areaColor(item.area);
    const { isTerminal, range } = tipoBadge(item.tipo, item.classeInicio, item.classeFim);
    const compColor = item.componente ? COMPONENTE_COLORS[item.componente] : null;
    const semCat = !item.categoriaFormacao;
    return (
      <View style={[styles.card, !item.ativo && styles.cardInactive, semCat && styles.cardSemCategoria]}>
        <View style={[styles.cardLeft, { backgroundColor: color + '18', borderColor: color + '30' }]}>
          <MaterialCommunityIcons name="book-open-page-variant" size={20} color={color} />
        </View>
        <View style={styles.cardBody}>
          <View style={styles.cardTitleRow}>
            <Text style={styles.cardName}>{item.nome}</Text>
            {item.codigo ? (
              <View style={[styles.codeBadge, { backgroundColor: color + '20' }]}>
                <Text style={[styles.codeText, { color }]}>{item.codigo}</Text>
              </View>
            ) : null}
            <View style={[styles.tipoBadge, isTerminal ? styles.tipoBadgeTerminal : styles.tipoBadgeCont]}>
              <MaterialCommunityIcons
                name={isTerminal ? 'flag-checkered' : 'arrow-right-bold-circle'}
                size={10}
                color={isTerminal ? Colors.warning : Colors.info}
              />
              <Text style={[styles.tipoBadgeText, { color: isTerminal ? Colors.warning : Colors.info }]}>
                {isTerminal ? 'Terminal' : 'Continuidade'}
              </Text>
            </View>
            {!item.ativo && (
              <View style={styles.inactiveBadge}>
                <Text style={styles.inactiveText}>Inactiva</Text>
              </View>
            )}
          </View>

          {/* Componente badge */}
          {item.componente ? (
            <View style={[styles.compBadge, { backgroundColor: compColor! + '18', borderColor: compColor! + '40' }]}>
              <MaterialCommunityIcons
                name={COMPONENTE_ICONS[item.componente] as any}
                size={10}
                color={compColor!}
              />
              <Text style={[styles.compBadgeText, { color: compColor! }]}>
                {COMPONENTE_SHORT[item.componente]}
              </Text>
            </View>
          ) : null}

          {item.area ? (
            <View style={styles.areaRow}>
              <View style={[styles.areaDot, { backgroundColor: color }]} />
              <Text style={styles.areaText}>{item.area}</Text>
            </View>
          ) : null}
          {range ? (
            <View style={styles.classeRangeRow}>
              <Ionicons name="school-outline" size={11} color={Colors.textMuted} />
              <Text style={styles.classeRangeText}>{range}</Text>
            </View>
          ) : null}
          {item.descricao ? (
            <Text style={styles.descricao} numberOfLines={1}>{item.descricao}</Text>
          ) : null}
          {item.categoriaFormacao ? (() => {
            const cf = CATEGORIAS_FORMACAO.find(c => c.value === item.categoriaFormacao);
            return cf ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 }}>
                <MaterialCommunityIcons name={cf.icon as any} size={11} color={cf.color} />
                <Text style={{ fontSize: 10, color: cf.color, fontFamily: 'Inter_500Medium' }}>{cf.label}</Text>
              </View>
            ) : null;
          })() : (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 }}>
              <Ionicons name="warning-outline" size={11} color="#F59E0B" />
              <Text style={{ fontSize: 10, color: '#F59E0B', fontFamily: 'Inter_400Regular' }}>Sem categoria p/ certificado</Text>
            </View>
          )}
        </View>
        {canEdit && (
          <View style={styles.cardActions}>
            <TouchableOpacity
              style={styles.actionBtn}
              onPress={() => { setEditItem(item); setShowForm(true); }}
            >
              <Ionicons name="create-outline" size={17} color={Colors.info} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionBtn} onPress={() => handleDelete(item)}>
              <Ionicons name="trash-outline" size={17} color={Colors.danger} />
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };

  const hasActiveFilter = filterTipo !== 'Todos' || filterArea !== 'Todas' || filterComp !== 'Todas' || filterSemCategoria;

  return (
    <View style={styles.screen}>
      <TopBar
        title="Disciplinas"
        subtitle={`${disciplinas.length} no catálogo`}
        rightAction={canEdit ? { icon: 'add-circle', onPress: () => { setEditItem(null); setShowForm(true); } } : undefined}
      />

      {/* ── Pesquisa + filtros (FIXO no topo) ── */}
      <View style={styles.filterRow}>
        <View style={styles.searchBar}>
          <StableSearchInput
            value={search}
            onChangeText={setSearch}
            inputStyle={styles.searchInput}
            placeholder="Pesquisar disciplina..."
            iconColor={Colors.textMuted}
          />
        </View>
        <TouchableOpacity
          style={[styles.filterBtn, filterComp !== 'Todas' && { borderColor: COMPONENTE_COLORS[filterComp] + '70', backgroundColor: COMPONENTE_COLORS[filterComp] + '15' }]}
          onPress={() => setShowCompFilter(true)}
        >
          <MaterialCommunityIcons
            name="layers-triple"
            size={14}
            color={filterComp !== 'Todas' ? COMPONENTE_COLORS[filterComp] || Colors.gold : Colors.textMuted}
          />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterBtn, filterTipo !== 'Todos' && styles.filterBtnActive]}
          onPress={() => setShowTipoFilter(true)}
        >
          <MaterialCommunityIcons
            name="flag-checkered"
            size={14}
            color={filterTipo !== 'Todos' ? Colors.warning : Colors.textMuted}
          />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterBtn, filterArea !== 'Todas' && styles.filterBtnAreaActive]}
          onPress={() => setShowAreaFilter(true)}
        >
          <Ionicons name="filter" size={14} color={filterArea !== 'Todas' ? Colors.gold : Colors.textMuted} />
        </TouchableOpacity>
      </View>

      {/* Chips de filtros activos (FIXO) */}
      {hasActiveFilter && (
        <View style={styles.activeFiltersRow}>
          {filterComp !== 'Todas' && (
            <TouchableOpacity
              style={[styles.activeFilterChip, { backgroundColor: (COMPONENTE_COLORS[filterComp] || Colors.textMuted) + '18', borderColor: (COMPONENTE_COLORS[filterComp] || Colors.textMuted) + '40' }]}
              onPress={() => setFilterComp('Todas')}
            >
              <Text style={[styles.activeFilterText, { color: COMPONENTE_COLORS[filterComp] || Colors.textMuted }]}>
                {COMPONENTE_SHORT[filterComp] || filterComp}
              </Text>
              <Ionicons name="close" size={11} color={COMPONENTE_COLORS[filterComp] || Colors.textMuted} />
            </TouchableOpacity>
          )}
          {filterTipo !== 'Todos' && (
            <TouchableOpacity style={styles.activeFilterChip} onPress={() => setFilterTipo('Todos')}>
              <Text style={styles.activeFilterText}>{filterTipo}</Text>
              <Ionicons name="close" size={11} color={Colors.warning} />
            </TouchableOpacity>
          )}
          {filterArea !== 'Todas' && (
            <TouchableOpacity style={[styles.activeFilterChip, styles.activeFilterChipArea]} onPress={() => setFilterArea('Todas')}>
              <Text style={[styles.activeFilterText, { color: Colors.gold }]}>{filterArea.split(' ')[0]}</Text>
              <Ionicons name="close" size={11} color={Colors.gold} />
            </TouchableOpacity>
          )}
          {filterSemCategoria && (
            <TouchableOpacity
              style={[styles.activeFilterChip, { backgroundColor: '#F59E0B18', borderColor: '#F59E0B40' }]}
              onPress={() => setFilterSemCategoria(false)}
            >
              <Ionicons name="warning" size={11} color="#F59E0B" />
              <Text style={[styles.activeFilterText, { color: '#F59E0B' }]}>Sem categoria</Text>
              <Ionicons name="close" size={11} color="#F59E0B" />
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.clearAllBtn} onPress={() => { setFilterComp('Todas'); setFilterTipo('Todos'); setFilterArea('Todas'); setFilterSemCategoria(false); }}>
            <Text style={styles.clearAllText}>Limpar tudo</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── Lista (flex) com header scrollável ── */}
      {loading ? (
        <View style={{ flex: 1, padding: 12 }}>
          <SkeletonList rows={6} />
        </View>
      ) : (
        <View style={{ flex: 1 }}>
          <FlatList
            data={paginatedDisc}
            keyExtractor={i => i.id}
            renderItem={renderItem}
            contentContainerStyle={[styles.list, { paddingBottom: 8 }]}
            showsVerticalScrollIndicator={false}
            ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
            ListHeaderComponent={
              <View>
                {/* Hero compacto — rola com a lista */}
                <LinearGradient colors={['#0D1F35', '#112257']} style={styles.hero}>
                  <View style={styles.heroComps}>
                    {COMPONENTES.map(c => {
                      const count = c === 'Sócio-Cultural' ? cSocio : c === 'Científica' ? cCiencia : cTec;
                      const col = COMPONENTE_COLORS[c];
                      return (
                        <TouchableOpacity
                          key={c}
                          style={[styles.heroCompItem, filterComp === c && { backgroundColor: col + '25' }]}
                          onPress={() => setFilterComp(filterComp === c ? 'Todas' : c)}
                        >
                          <MaterialCommunityIcons name={COMPONENTE_ICONS[c] as any} size={15} color={col} />
                          <Text style={[styles.heroCompCount, { color: col }]}>{count}</Text>
                          <Text style={styles.heroCompLabel} numberOfLines={2}>{COMPONENTE_SHORT[c]}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                  <View style={styles.heroDividerH} />
                  {/* Stats em ScrollView horizontal — nunca corta */}
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.heroStats}>
                    <View style={styles.heroStat}>
                      <Text style={[styles.heroVal, { color: Colors.gold }]}>{disciplinas.length}</Text>
                      <Text style={styles.heroLbl}>Total</Text>
                    </View>
                    <View style={styles.heroDivider} />
                    <View style={styles.heroStat}>
                      <Text style={[styles.heroVal, { color: Colors.info }]}>{disciplinas.filter(d => d.tipo !== 'terminal').length}</Text>
                      <Text style={styles.heroLbl}>Continuidade</Text>
                    </View>
                    <View style={styles.heroDivider} />
                    <View style={styles.heroStat}>
                      <Text style={[styles.heroVal, { color: Colors.warning }]}>{disciplinas.filter(d => d.tipo === 'terminal').length}</Text>
                      <Text style={styles.heroLbl}>Terminais</Text>
                    </View>
                    <View style={styles.heroDivider} />
                    <View style={styles.heroStat}>
                      <Text style={[styles.heroVal, { color: '#84CC16' }]}>{cGeral}</Text>
                      <Text style={styles.heroLbl}>Ensino Geral</Text>
                    </View>
                  </ScrollView>
                </LinearGradient>

                {/* Botão Alunos a Exame */}
                {canEdit && (
                  <TouchableOpacity
                    style={styles.provaBtn}
                    onPress={() => { setShowProvaModal(true); loadProvaData(); }}
                  >
                    <View style={styles.provaBtnLeft}>
                      <View style={styles.provaBtnIcon}>
                        <MaterialCommunityIcons name="clipboard-list-outline" size={17} color={Colors.warning} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.provaBtnTitle}>Alunos Sujeitos a Exame</Text>
                        <Text style={styles.provaBtnSub}>Ver lista e notificar encarregados</Text>
                      </View>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
                  </TouchableOpacity>
                )}

                {/* Banner sem categoria */}
                {semCategoria > 0 && (
                  <TouchableOpacity
                    style={[styles.semCatBanner, filterSemCategoria && styles.semCatBannerActive]}
                    onPress={() => setFilterSemCategoria(v => !v)}
                    activeOpacity={0.82}
                  >
                    <View style={styles.semCatBannerLeft}>
                      <View style={styles.semCatBannerIcon}>
                        <Ionicons name="warning" size={15} color="#F59E0B" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.semCatBannerTitle}>
                          {semCategoria} {semCategoria === 1 ? 'disciplina sem' : 'disciplinas sem'} categoria no certificado
                        </Text>
                        <Text style={styles.semCatBannerSub}>
                          {filterSemCategoria ? 'A mostrar apenas as afectadas — toque para ver todas' : 'Toque para filtrar e configurar em massa'}
                        </Text>
                      </View>
                    </View>
                    <View style={[styles.semCatBannerBadge, filterSemCategoria && styles.semCatBannerBadgeActive]}>
                      <Text style={[styles.semCatBannerBadgeText, filterSemCategoria && { color: '#fff' }]}>
                        {filterSemCategoria ? 'Activo' : semCategoria.toString()}
                      </Text>
                    </View>
                  </TouchableOpacity>
                )}
              </View>
            }
            ListEmptyComponent={
              <View style={styles.empty}>
                <MaterialCommunityIcons name="book-open-page-variant-outline" size={44} color={Colors.textMuted} />
                <Text style={styles.emptyTitle}>
                  {search || hasActiveFilter
                    ? 'Nenhuma disciplina encontrada'
                    : 'Sem disciplinas no catálogo'}
                </Text>
                <Text style={styles.emptyDesc}>
                  {canEdit && !search && !hasActiveFilter
                    ? 'Clique em "+" para adicionar a primeira disciplina ao catálogo da escola.'
                    : 'Tente ajustar os filtros de pesquisa.'}
                </Text>
              </View>
            }
          />
          <PaginationBar currentPage={safePage} totalPages={totalPages} onPageChange={setCurrentPage} bottomPad={bottomPad} />
        </View>
      )}

      <DisciplinaFormModal
        visible={showForm}
        onClose={() => { setShowForm(false); setEditItem(null); }}
        onSave={handleSave}
        disciplina={editItem}
      />

      {/* Filtro por Componente */}
      <Modal visible={showCompFilter} transparent animationType="fade" onRequestClose={() => setShowCompFilter(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <TouchableOpacity style={mStyles.pickerOverlay} onPress={() => setShowCompFilter(false)} activeOpacity={1}>
          <View style={mStyles.pickerList}>
            <Text style={mStyles.pickerTitle}>Filtrar por Componente</Text>
            {compFilter.map(c => {
              const col = COMPONENTE_COLORS[c] || Colors.textMuted;
              const isNone = c === 'Sem componente';
              return (
                <TouchableOpacity
                  key={c}
                  style={[mStyles.pickerItem, filterComp === c && mStyles.pickerItemActive]}
                  onPress={() => { setFilterComp(c); setShowCompFilter(false); }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    {c !== 'Todas' && !isNone && (
                      <MaterialCommunityIcons name={COMPONENTE_ICONS[c] as any} size={14} color={col} />
                    )}
                    {isNone && <Ionicons name="remove-circle-outline" size={14} color={Colors.textMuted} />}
                    <Text style={[mStyles.pickerItemText, filterComp === c && mStyles.pickerItemTextActive, !isNone && c !== 'Todas' && { color: col }]}>{c}</Text>
                  </View>
                  {filterComp === c && <Ionicons name="checkmark" size={16} color={Colors.gold} />}
                </TouchableOpacity>
              );
            })}
          </View>
        </TouchableOpacity>
              </KeyboardAvoidingView>
</Modal>

      {/* Filtro por Tipo */}
      <Modal visible={showTipoFilter} transparent animationType="fade" onRequestClose={() => setShowTipoFilter(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <TouchableOpacity style={mStyles.pickerOverlay} onPress={() => setShowTipoFilter(false)} activeOpacity={1}>
          <View style={mStyles.pickerList}>
            <Text style={mStyles.pickerTitle}>Filtrar por Tipo</Text>
            {tiposFilter.map(t => (
              <TouchableOpacity
                key={t}
                style={[mStyles.pickerItem, filterTipo === t && mStyles.pickerItemActive]}
                onPress={() => { setFilterTipo(t); setShowTipoFilter(false); }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  {t === 'Terminal' && <MaterialCommunityIcons name="flag-checkered" size={14} color={Colors.warning} />}
                  {t === 'Continuidade' && <MaterialCommunityIcons name="arrow-right-bold-circle" size={14} color={Colors.info} />}
                  <Text style={[mStyles.pickerItemText, filterTipo === t && mStyles.pickerItemTextActive]}>{t}</Text>
                </View>
                {filterTipo === t && <Ionicons name="checkmark" size={16} color={Colors.gold} />}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
              </KeyboardAvoidingView>
</Modal>

      {/* Filtro por Área */}
      <Modal visible={showAreaFilter} transparent animationType="fade" onRequestClose={() => setShowAreaFilter(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <TouchableOpacity style={mStyles.pickerOverlay} onPress={() => setShowAreaFilter(false)} activeOpacity={1}>
          <View style={mStyles.pickerList}>
            <View style={mStyles.pickerHeader}>
              <MaterialCommunityIcons name="tag-outline" size={14} color={Colors.accent} />
              <Text style={mStyles.pickerTitle}>Filtrar por Área</Text>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 340 }}>
              {areas.map(a => (
                <TouchableOpacity
                  key={a}
                  style={[mStyles.pickerItem, filterArea === a && mStyles.pickerItemActive]}
                  onPress={() => { setFilterArea(a); setShowAreaFilter(false); }}
                >
                  {a !== 'Todas' && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: areaColor(a), marginRight: 10 }} />}
                  <Text style={[mStyles.pickerItemText, filterArea === a && mStyles.pickerItemTextActive]}>{a}</Text>
                  {filterArea === a && <Ionicons name="checkmark-circle" size={16} color={Colors.accent} />}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </TouchableOpacity>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Modal: Alunos Sujeitos a Exame ── */}
      <Modal visible={showProvaModal} animationType="slide" transparent onRequestClose={() => setShowProvaModal(false)}>
        <View style={styles.provaOverlay}>
          <View style={[styles.provaSheet, { paddingBottom: bottomPad + 8 }]}>
            {/* Cabeçalho */}
            <View style={styles.provaHeader}>
              <View style={styles.provaHeaderLeft}>
                <View style={styles.provaHeaderIcon}>
                  <MaterialCommunityIcons name="clipboard-list-outline" size={20} color={Colors.warning} />
                </View>
                <View>
                  <Text style={styles.provaHeaderTitle}>Alunos a Exame</Text>
                  <Text style={styles.provaHeaderSub}>
                    {provaData ? `${provaData.total} aluno(s) · nota mín. ${provaData.notaMin} val.` : 'A carregar...'}
                  </Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => setShowProvaModal(false)} style={mStyles.closeBtn}>
                <Ionicons name="close" size={15} color={Colors.text} />
              </TouchableOpacity>
            </View>
            <View style={[mStyles.accentLine, { backgroundColor: Colors.warning + '50' }]} />

            {/* Lista */}
            {provaLoading ? (
              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 40 }}>
                <AppLoader color={Colors.warning} />
                <Text style={{ color: Colors.textMuted, fontFamily: 'Inter_400Regular', fontSize: 13 }}>A carregar...</Text>
              </View>
            ) : provaData && provaData.alunos.length === 0 ? (
              <View style={{ alignItems: 'center', justifyContent: 'center', paddingVertical: 40, gap: 10 }}>
                <MaterialCommunityIcons name="check-circle-outline" size={48} color={Colors.success} />
                <Text style={{ fontSize: 15, fontFamily: 'Inter_600SemiBold', color: Colors.text }}>Nenhum aluno a exame</Text>
                <Text style={{ fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textMuted, textAlign: 'center' }}>
                  Todos os alunos têm média igual ou superior ao mínimo nas disciplinas de fecho.
                </Text>
              </View>
            ) : (
              <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 360 }}>
                {(provaData?.alunos ?? []).map((al: any, i: number) => {
                  const isTerm = al.tipoDisciplina === 'terminal';
                  const media = parseFloat(al.mediaAnual);
                  return (
                    <View key={i} style={styles.provaItem}>
                      <View style={[styles.provaItemBadge, { backgroundColor: isTerm ? Colors.warning + '20' : Colors.info + '15' }]}>
                        <MaterialCommunityIcons
                          name={isTerm ? 'flag-checkered' : 'arrow-right-bold-circle'}
                          size={14}
                          color={isTerm ? Colors.warning : Colors.info}
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.provaItemNome}>{al.alunoNome}</Text>
                        <Text style={styles.provaItemSub}>{al.classe} · {al.turmaNome} · {al.anoLetivo}</Text>
                        <Text style={styles.provaItemDisc}>{al.disciplina}</Text>
                      </View>
                      <View style={styles.provaItemMedia}>
                        <Text style={styles.provaItemMediaVal}>{media.toFixed(1)}</Text>
                        <Text style={styles.provaItemMediaLbl}>val.</Text>
                      </View>
                    </View>
                  );
                })}
              </ScrollView>
            )}

            {/* Acções */}
            <View style={styles.provaActions}>
              <TouchableOpacity
                style={styles.provaActionBtn}
                onPress={async () => {
                  if (Platform.OS === 'web') {
                    try {
                      let token = await getAuthToken();
                      if (!token) { alertErro('Sessão expirada', 'Faça login novamente.'); return; }
                      const base = getApiUrl();
                      const url = new URL('/api/disciplinas/alunos-prova/html', base).toString();
                      let resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, credentials: 'include' });
                      if (resp.status === 401) {
                        const newToken = await refreshAccessToken();
                        if (newToken) {
                          resp = await fetch(url, { headers: { Authorization: `Bearer ${newToken}` }, credentials: 'include' });
                        }
                      }
                      if (!resp.ok) { const t = await resp.text().catch(() => ''); throw new Error(t || `Erro ${resp.status}`); }
                      const html = await resp.text();
                      const blob = new Blob([html], { type: 'text/html' });
                      const blobUrl = URL.createObjectURL(blob);
                      window.open(blobUrl, '_blank');
                    } catch (e: any) { alertErro('Erro', e?.message || 'Não foi possível gerar o PDF.'); }
                  }
                }}
              >
                <MaterialCommunityIcons name="printer-outline" size={16} color={Colors.accent} />
                <Text style={[styles.provaActionBtnText, { color: Colors.accent }]}>Imprimir / PDF</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.provaActionBtn, styles.provaActionBtnPrimary, notificando && { opacity: 0.7 }]}
                onPress={notificarAlunos}
                disabled={notificando || !provaData || provaData.total === 0}
              >
                {notificando
                  ? <AppLoader color="#fff" />
                  : <>
                    <MaterialCommunityIcons name="bell-ring-outline" size={16} color="#fff" />
                    <Text style={[styles.provaActionBtnText, { color: '#fff' }]}>Notificar Encarregados</Text>
                  </>
                }
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

    </View>
  );
}

// ─── Estilos do Modal (v2 — moderno) ─────────────────────────────────────────

const mStyles = StyleSheet.create({
  // Fundo semitransparente
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.72)',
    justifyContent: 'flex-end', alignItems: 'center',
  },
  // Folha principal
  container: {
    backgroundColor: Colors.backgroundCard,
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    borderTopWidth: 1, borderLeftWidth: 1, borderRightWidth: 1,
    borderColor: Colors.borderLight,
    paddingHorizontal: 20, paddingTop: 0,
    maxHeight: '94%', width: '100%', maxWidth: 560,
  },
  // Cabeçalho
  header: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 20, paddingBottom: 14,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerIcon: {
    width: 40, height: 40, borderRadius: 13,
    backgroundColor: Colors.accent + '1A',
    borderWidth: 1, borderColor: Colors.accent + '35',
    alignItems: 'center', justifyContent: 'center',
  },
  title: { fontSize: 16, fontFamily: 'Inter_700Bold', color: Colors.text },
  subtitle: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 1 },
  closeBtn: {
    width: 32, height: 32, borderRadius: 10,
    backgroundColor: Colors.surface,
    borderWidth: 1, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  // Linha de destaque sob o cabeçalho
  accentLine: {
    height: 2, borderRadius: 2,
    backgroundColor: Colors.accent + '45',
    marginBottom: 16,
  },
  // Rótulo de secção
  sectionLabel: {
    fontSize: 10, fontFamily: 'Inter_700Bold', color: Colors.textMuted,
    letterSpacing: 1, marginBottom: 10,
  },
  // Grupos de input estilo "card com ícone lateral"
  inputGroup: {
    flexDirection: 'row', alignItems: 'stretch',
    backgroundColor: Colors.surface,
    borderRadius: 14, borderWidth: 1, borderColor: Colors.border,
    marginBottom: 10, overflow: 'hidden',
  },
  inputIconWrap: {
    width: 44, alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.backgroundElevated,
    borderRightWidth: 1, borderRightColor: Colors.border,
  },
  inputInner: { flex: 1, paddingHorizontal: 13, paddingVertical: 9 },
  floatLabel: {
    fontSize: 10, fontFamily: 'Inter_600SemiBold',
    color: Colors.textMuted, marginBottom: 3,
  },
  inputText: {
    fontSize: 14, fontFamily: 'Inter_400Regular', color: Colors.text,
  },
  // Componente
  compRow: { gap: 8, marginBottom: 4 },
  compBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 10, paddingHorizontal: 14, borderRadius: 12,
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border,
  },
  compBtnText: { fontSize: 13, fontFamily: 'Inter_500Medium', color: Colors.textMuted, flex: 1 },
  // Tipo — cards visuais
  tipoRow: { flexDirection: 'row', gap: 10, marginBottom: 4 },
  tipoCard: {
    flex: 1, alignItems: 'center', paddingVertical: 14, paddingHorizontal: 8,
    backgroundColor: Colors.surface, borderRadius: 16,
    borderWidth: 1.5, borderColor: Colors.border,
    position: 'relative',
  },
  tipoCardCont: { borderColor: Colors.info + '55', backgroundColor: Colors.info + '0C' },
  tipoCardTerm: { borderColor: Colors.warning + '55', backgroundColor: Colors.warning + '0C' },
  tipoCardIcon: {
    width: 42, height: 42, borderRadius: 13,
    alignItems: 'center', justifyContent: 'center', marginBottom: 8,
  },
  tipoCardTitle: { fontSize: 13, fontFamily: 'Inter_700Bold', color: Colors.textSecondary, marginBottom: 2 },
  tipoCardDesc: { fontSize: 10, fontFamily: 'Inter_400Regular', color: Colors.textMuted, textAlign: 'center' },
  tipoCardCheck: { position: 'absolute', top: 8, right: 8 },
  // Intervalo de classes
  classeRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  classeCard: {
    flex: 1, alignItems: 'center', paddingVertical: 13, paddingHorizontal: 6,
    backgroundColor: Colors.surface, borderRadius: 14,
    borderWidth: 1.5, borderColor: Colors.border,
  },
  classeCardError: { borderColor: Colors.danger + '55', backgroundColor: Colors.danger + '0A' },
  classeCardLbl: {
    fontSize: 9, fontFamily: 'Inter_700Bold', color: Colors.textMuted,
    letterSpacing: 0.7, marginBottom: 5,
  },
  classeCardVal: { fontSize: 13, fontFamily: 'Inter_700Bold', color: Colors.text, textAlign: 'center' },
  classeConnector: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 6 },
  classeLine: { width: 12, height: 1.5, backgroundColor: Colors.border },
  classeArrowBox: {
    width: 28, height: 28, borderRadius: 9,
    backgroundColor: Colors.backgroundElevated,
    borderWidth: 1, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  erroOrdemWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: Colors.danger + '10',
    borderRadius: 9, borderWidth: 1, borderColor: Colors.danger + '30',
    paddingHorizontal: 10, paddingVertical: 7, marginBottom: 12,
  },
  erroOrdemText: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.danger, flex: 1 },
  // Linha activo/inactivo
  switchRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginBottom: 14,
    backgroundColor: Colors.surface,
    borderRadius: 14, borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: 14, paddingVertical: 11,
  },
  switchLabel: { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: Colors.textSecondary },
  switchSub: { fontSize: 10, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 1 },
  toggleTrack: {
    width: 46, height: 26, borderRadius: 13,
    backgroundColor: Colors.backgroundElevated,
    borderWidth: 1, borderColor: Colors.border,
    justifyContent: 'center', paddingHorizontal: 3,
  },
  toggleTrackOn: { backgroundColor: Colors.success + '40', borderColor: Colors.success + '70' },
  toggleTrackDanger: { backgroundColor: '#DC262640', borderColor: '#DC262670' },
  toggleThumb: {
    width: 20, height: 20, borderRadius: 10,
    backgroundColor: Colors.textMuted, alignSelf: 'flex-start',
  },
  toggleThumbOn: { backgroundColor: Colors.success, alignSelf: 'flex-end' },
  toggleThumbDanger: { backgroundColor: '#DC2626', alignSelf: 'flex-end' },
  // Card Nuclear
  nuclearCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: Colors.surface,
    borderRadius: 14, borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: 14, paddingVertical: 13, marginBottom: 14,
  },
  nuclearCardOn: {
    backgroundColor: '#DC262610',
    borderColor: '#DC262650',
  },
  nuclearIconWrap: {
    width: 42, height: 42, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  nuclearTitle: {
    fontSize: 13, fontFamily: 'Inter_600SemiBold',
    color: Colors.textSecondary, marginBottom: 2,
  },
  nuclearDesc: {
    fontSize: 10, fontFamily: 'Inter_400Regular',
    color: Colors.textMuted, lineHeight: 14,
  },
  // Botão guardar
  saveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.accent, borderRadius: 16,
    paddingVertical: 15, gap: 10, marginTop: 4, marginBottom: 4,
  },
  saveBtnText: { fontSize: 15, fontFamily: 'Inter_700Bold', color: '#fff' },
  // Picker dropdown
  pickerOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.62)',
    justifyContent: 'center', alignItems: 'center', padding: 24,
  },
  pickerList: {
    backgroundColor: Colors.backgroundCard,
    borderRadius: 20, width: '100%', maxWidth: 390,
    borderWidth: 1, borderColor: Colors.border,
    overflow: 'hidden',
  },
  pickerHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 16, paddingVertical: 13,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
    backgroundColor: Colors.backgroundElevated,
  },
  pickerTitle: { fontSize: 13, fontFamily: 'Inter_700Bold', color: Colors.text, flex: 1 },
  pickerItem: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 13, paddingHorizontal: 16,
    borderBottomWidth: 1, borderBottomColor: Colors.border + '50',
  },
  pickerItemActive: { backgroundColor: Colors.accent + '15' },
  pickerItemText: { flex: 1, fontSize: 14, fontFamily: 'Inter_400Regular', color: Colors.text },
  pickerItemTextActive: { fontFamily: 'Inter_600SemiBold', color: Colors.accent },
});

// ─── Estilos da Lista ─────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  hero: {
    marginHorizontal: 16, marginTop: 8, borderRadius: 18,
    padding: 14,
  },
  heroLabel: {
    fontSize: 10, fontFamily: 'Inter_600SemiBold', color: Colors.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10,
  },
  heroComps: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  heroCompItem: {
    flex: 1, alignItems: 'center', gap: 3,
    borderRadius: 12, padding: 9,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  heroCompCount: { fontSize: 17, fontFamily: 'Inter_700Bold' },
  heroCompLabel: {
    fontSize: 9, fontFamily: 'Inter_500Medium', color: Colors.textMuted,
    textAlign: 'center', lineHeight: 12,
  },
  heroDividerH: { height: 1, backgroundColor: 'rgba(255,255,255,0.08)', marginBottom: 10 },
  heroStats: { flexDirection: 'row', alignItems: 'center', paddingBottom: 2 },
  heroStat: { alignItems: 'center', paddingHorizontal: 16, minWidth: 72 },
  heroDivider: { width: 1, height: 28, backgroundColor: 'rgba(255,255,255,0.10)' },
  heroVal: { fontSize: 20, fontFamily: 'Inter_700Bold' },
  heroLbl: { fontSize: 9, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 2 },

  filterRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 16, marginTop: 12, marginBottom: 4,
  },
  searchBar: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.backgroundCard, borderRadius: 12,
    borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 12, height: 42, gap: 8,
  },
  searchInput: { flex: 1, fontSize: 16, fontFamily: 'Inter_400Regular', color: Colors.text },
  filterBtn: {
    width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.backgroundCard, borderWidth: 1, borderColor: Colors.border,
  },
  filterBtnActive: { borderColor: Colors.warning + '60', backgroundColor: Colors.warning + '10' },
  filterBtnAreaActive: { borderColor: Colors.gold + '60', backgroundColor: Colors.gold + '10' },

  activeFiltersRow: {
    flexDirection: 'row', gap: 8, paddingHorizontal: 16, marginBottom: 4, flexWrap: 'wrap', alignItems: 'center',
  },
  activeFilterChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: Colors.warning + '18', borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 4,
    borderWidth: 1, borderColor: Colors.warning + '40',
  },
  activeFilterChipArea: {
    backgroundColor: Colors.gold + '18', borderColor: Colors.gold + '40',
  },
  activeFilterText: {
    fontSize: 11, fontFamily: 'Inter_600SemiBold', color: Colors.warning,
  },
  clearAllBtn: { paddingHorizontal: 8, paddingVertical: 4 },
  clearAllText: { fontSize: 11, fontFamily: 'Inter_500Medium', color: Colors.textMuted },

  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { fontSize: 13, fontFamily: 'Inter_400Regular', color: Colors.textMuted },

  list: { padding: 16, paddingTop: 12 },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: Colors.backgroundCard, borderRadius: 14,
    borderWidth: 1, borderColor: Colors.border, padding: 14,
  },
  cardInactive: { opacity: 0.6 },
  cardSemCategoria: {
    borderLeftWidth: 3, borderLeftColor: '#F59E0B',
    borderColor: '#F59E0B30', backgroundColor: '#F59E0B05',
  },

  semCatBanner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginHorizontal: 16, marginTop: 10, marginBottom: 2,
    backgroundColor: '#F59E0B12',
    borderWidth: 1, borderColor: '#F59E0B35',
    borderRadius: 14, paddingHorizontal: 14, paddingVertical: 11,
  },
  semCatBannerActive: {
    backgroundColor: '#F59E0B1E', borderColor: '#F59E0B70',
  },
  semCatBannerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  semCatBannerIcon: {
    width: 34, height: 34, borderRadius: 10,
    backgroundColor: '#F59E0B20', borderWidth: 1, borderColor: '#F59E0B40',
    alignItems: 'center', justifyContent: 'center',
  },
  semCatBannerTitle: {
    fontSize: 12, fontFamily: 'Inter_600SemiBold', color: '#F59E0B',
  },
  semCatBannerSub: {
    fontSize: 10, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 1,
  },
  semCatBannerBadge: {
    paddingHorizontal: 10, paddingVertical: 4,
    backgroundColor: '#F59E0B25', borderRadius: 8,
    borderWidth: 1, borderColor: '#F59E0B50',
    minWidth: 30, alignItems: 'center',
  },
  semCatBannerBadgeActive: {
    backgroundColor: '#F59E0B', borderColor: '#F59E0B',
  },
  semCatBannerBadgeText: {
    fontSize: 11, fontFamily: 'Inter_700Bold', color: '#F59E0B',
  },
  cardLeft: {
    width: 44, height: 44, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1,
  },
  cardBody: { flex: 1 },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'wrap' },
  cardName: { fontSize: 14, fontFamily: 'Inter_600SemiBold', color: Colors.text },
  codeBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
  codeText: { fontSize: 10, fontFamily: 'Inter_700Bold' },
  tipoBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6,
  },
  tipoBadgeTerminal: { backgroundColor: Colors.warning + '18' },
  tipoBadgeCont: { backgroundColor: Colors.info + '18' },
  tipoBadgeText: { fontSize: 10, fontFamily: 'Inter_600SemiBold' },
  inactiveBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, backgroundColor: 'rgba(232,238,246,0.12)' },
  inactiveText: { fontSize: 10, fontFamily: 'Inter_500Medium', color: Colors.textMuted },
  // Componente badge na lista
  compBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    alignSelf: 'flex-start',
    paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6,
    borderWidth: 1, marginTop: 5,
  },
  compBadgeText: { fontSize: 10, fontFamily: 'Inter_600SemiBold' },
  areaRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 },
  areaDot: { width: 6, height: 6, borderRadius: 3 },
  areaText: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textSecondary },
  classeRangeRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
  classeRangeText: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted },
  descricao: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 2 },
  cardActions: { flexDirection: 'column', gap: 6 },
  actionBtn: {
    width: 34, height: 34, borderRadius: 10,
    backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center',
  },
  empty: { alignItems: 'center', paddingTop: 60, gap: 10, paddingHorizontal: 32 },
  emptyTitle: { fontSize: 15, fontFamily: 'Inter_600SemiBold', color: Colors.textSecondary, textAlign: 'center' },
  emptyDesc: { fontSize: 13, fontFamily: 'Inter_400Regular', color: Colors.textMuted, textAlign: 'center', lineHeight: 20 },

  // ── Alunos a Exame (botão + modal) ─────────────────────────────────────────
  provaBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginHorizontal: 16, marginTop: 10, marginBottom: 4,
    backgroundColor: Colors.backgroundCard,
    borderRadius: 14, borderWidth: 1, borderColor: Colors.warning + '35',
    paddingHorizontal: 14, paddingVertical: 11,
  },
  provaBtnLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  provaBtnIcon: {
    width: 36, height: 36, borderRadius: 11,
    backgroundColor: Colors.warning + '18',
    borderWidth: 1, borderColor: Colors.warning + '35',
    alignItems: 'center', justifyContent: 'center',
  },
  provaBtnTitle: { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: Colors.text },
  provaBtnSub: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 1 },

  provaOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.72)',
    justifyContent: 'flex-end', alignItems: 'center',
  },
  provaSheet: {
    backgroundColor: Colors.backgroundCard,
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    borderTopWidth: 1, borderLeftWidth: 1, borderRightWidth: 1,
    borderColor: Colors.borderLight,
    paddingHorizontal: 20, paddingTop: 0,
    width: '100%', maxWidth: 560,
  },
  provaHeader: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 20, paddingBottom: 14,
  },
  provaHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  provaHeaderIcon: {
    width: 40, height: 40, borderRadius: 13,
    backgroundColor: Colors.warning + '1A',
    borderWidth: 1, borderColor: Colors.warning + '35',
    alignItems: 'center', justifyContent: 'center',
  },
  provaHeaderTitle: { fontSize: 16, fontFamily: 'Inter_700Bold', color: Colors.text },
  provaHeaderSub: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 1 },

  provaItem: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 11, paddingHorizontal: 2,
    borderBottomWidth: 1, borderBottomColor: Colors.border + '60',
  },
  provaItemBadge: {
    width: 32, height: 32, borderRadius: 9,
    alignItems: 'center', justifyContent: 'center',
  },
  provaItemNome: { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: Colors.text },
  provaItemSub: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 1 },
  provaItemDisc: { fontSize: 11, fontFamily: 'Inter_500Medium', color: Colors.accent, marginTop: 2 },
  provaItemMedia: { alignItems: 'center' },
  provaItemMediaVal: { fontSize: 16, fontFamily: 'Inter_700Bold', color: Colors.danger },
  provaItemMediaLbl: { fontSize: 9, fontFamily: 'Inter_400Regular', color: Colors.textMuted },

  provaActions: {
    flexDirection: 'row', gap: 10,
    paddingTop: 14, paddingBottom: 4,
  },
  provaActionBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 13, borderRadius: 14,
    backgroundColor: Colors.surface,
    borderWidth: 1, borderColor: Colors.accent + '40',
  },
  provaActionBtnPrimary: {
    backgroundColor: Colors.warning,
    borderColor: 'transparent',
  },
  provaActionBtnText: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
});
