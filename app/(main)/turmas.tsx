import React, { useState, useMemo, useEffect, useRef } from 'react';
import {FlatList, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View} from 'react-native';
import { useRouter } from 'expo-router';
import { SkeletonList } from '@/components/Skeleton';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { Colors } from '@/constants/colors';
import { useData, Turma, Sala } from '@/context/DataContext';
import { useConfig } from '@/context/ConfigContext';
import { useAnoAcademico } from '@/context/AnoAcademicoContext';
import TopBar from '@/components/TopBar';
import PaginationBar from '@/components/PaginationBar';
import { alertSucesso, alertErro } from '@/utils/toast';
import ExportMenu from '@/components/ExportMenu';
import { StableSearchInput } from '@/components/StableSearchInput';
import { useLookup } from '@/hooks/useLookup';
import { webAlert } from '@/utils/webAlert';
import { useEnterToSave } from '@/hooks/useEnterToSave';

interface Curso { id: string; nome: string; codigo: string; areaFormacao: string; ativo: boolean; }
interface DisciplinaCatalogo { id: string; nome: string; codigo: string; area: string; componente: string; }

const NIVEIS_FALLBACK = ['Primário', 'I Ciclo', 'II Ciclo'];
const TURNOS_FALLBACK = ['Manhã', 'Tarde', 'Noite'];
const CLASSES_FALLBACK = ['Iniciação', '1ª Classe', '2ª Classe', '3ª Classe', '4ª Classe', '5ª Classe', '6ª Classe', '7ª Classe', '8ª Classe', '9ª Classe', '10ª Classe', '11ª Classe', '12ª Classe', '13ª Classe'];

function classeNumero(c: string): number {
  return parseInt(c.replace(/[^0-9]/g, ''), 10) || 0;
}

function classesPorNivel(nivel: string, allClasses: string[]): string[] {
  const n = nivel?.toLowerCase() || '';
  if (n.includes('primário') || n.includes('primario')) {
    return allClasses.filter(c => {
      const num = classeNumero(c);
      return c.toLowerCase().includes('iniciação') || c.toLowerCase().includes('iniciacao') || (num >= 1 && num <= 6);
    });
  }
  if (n.includes('ii ciclo') || n === 'ii ciclo') {
    return allClasses.filter(c => { const num = classeNumero(c); return num >= 10 && num <= 13; });
  }
  if (n.includes('i ciclo') || n === 'i ciclo') {
    return allClasses.filter(c => { const num = classeNumero(c); return num >= 7 && num <= 9; });
  }
  return allClasses;
}

// ─── Professor Multi-Select (quem ensina nesta turma) ───────────────────────
function ProfessoresTurmaSelector({ professores, nivel, selected, onChange }: {
  professores: any[]; nivel: string; selected: string[]; onChange: (ids: string[]) => void;
}) {
  const [search, setSearch] = useState('');
  const nivelMatch = nivel?.toLowerCase() || '';
  const nivelLabel: Record<string, string> = { 'primário': 'Primário', 'i ciclo': 'I Ciclo', 'ii ciclo': 'II Ciclo' };
  const nivelNome = nivelLabel[nivelMatch] || nivel;

  const profsFiltrados = useMemo(() =>
    professores.filter((p: any) => (p.nivelEnsino || 'I Ciclo').toLowerCase() === nivelMatch),
    [professores, nivelMatch]
  );
  const profsSearch = useMemo(() => {
    if (!search.trim()) return profsFiltrados;
    const q = search.toLowerCase();
    return profsFiltrados.filter((p: any) => `${p.nome} ${p.apelido}`.toLowerCase().includes(q));
  }, [profsFiltrados, search]);

  function toggle(id: string) {
    if (selected.includes(id)) onChange(selected.filter(x => x !== id));
    else onChange([...selected, id]);
  }

  return (
    <View style={mS.selectorBox}>
      {/* Search bar */}
      <View style={mS.directorSearch}>
        <StableSearchInput
          value={search}
          onChangeText={setSearch}
          inputStyle={mS.directorSearchInput}
          placeholder={`Pesquisar professores de ${nivelNome}...`}
          iconSize={14}
        />
      </View>

      {profsFiltrados.length === 0 ? (
        <View style={{ padding: 14, alignItems: 'center', gap: 6 }}>
          <Ionicons name="people-outline" size={22} color={Colors.textMuted} />
          <Text style={{ fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted, textAlign: 'center' }}>
            Nenhum professor com nível {nivelNome}.{'\n'}Edite o perfil do professor para definir o nível.
          </Text>
        </View>
      ) : profsSearch.length === 0 ? (
        <View style={{ padding: 10, alignItems: 'center' }}>
          <Text style={{ fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted }}>Nenhum resultado para "{search}"</Text>
        </View>
      ) : (
        <ScrollView style={{ maxHeight: 180 }} showsVerticalScrollIndicator={false}>
          {profsSearch.map((p: any) => {
            const isChecked = selected.includes(p.id);
            return (
              <TouchableOpacity
                key={p.id}
                style={[mS.directorOption, isChecked && mS.directorOptionActive]}
                onPress={() => toggle(p.id)}
                activeOpacity={0.75}
              >
                <View style={[mS.directorOptionAvatar, isChecked && { backgroundColor: `${Colors.info}22` }]}>
                  <Ionicons name="person" size={14} color={isChecked ? Colors.info : Colors.textSecondary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[mS.directorOptionName, isChecked && { color: Colors.text }]}>{p.nome} {p.apelido}</Text>
                  <Text style={mS.directorOptionMeta}>{p.numeroProfessor} · {p.nivelEnsino || nivel}</Text>
                </View>
                <View style={[mS.checkbox, isChecked && mS.checkboxChecked]}>
                  {isChecked && <Ionicons name="checkmark" size={11} color="#fff" />}
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      {selected.length > 0 && (
        <View style={mS.directorFooter}>
          <Ionicons name="people" size={12} color={Colors.info} />
          <Text style={[mS.directorFooterText, { color: Colors.info }]}>
            {selected.length} professor{selected.length !== 1 ? 'es' : ''} seleccionado{selected.length !== 1 ? 's' : ''}
          </Text>
        </View>
      )}
    </View>
  );
}

// ─── Director Selector (entre os professores já escolhidos) ──────────────────
function DirectorSelector({ professores, professoresIds, nivel, value, onChange }: {
  professores: any[]; professoresIds: string[]; nivel: string; value: string; onChange: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const nivelLabel: Record<string, string> = { 'primário': 'Primário', 'i ciclo': 'I Ciclo', 'ii ciclo': 'II Ciclo' };
  const nivelNome = nivelLabel[nivel?.toLowerCase() || ''] || nivel;

  // Only professors already assigned to this turma
  const candidatos = useMemo(() =>
    professores.filter((p: any) => professoresIds.includes(p.id)),
    [professores, professoresIds]
  );

  const selected = candidatos.find((p: any) => p.id === value);

  // If the current director was removed from the turma list, clear
  useEffect(() => {
    if (value && !candidatos.find((p: any) => p.id === value)) {
      onChange('');
    }
  }, [professoresIds]);

  if (professoresIds.length === 0) {
    return (
      <View style={mS.directorEmptyHint}>
        <Ionicons name="information-circle-outline" size={15} color={Colors.textMuted} />
        <Text style={mS.directorEmptyText}>
          Seleccione os professores desta turma acima para depois designar o Director.
        </Text>
      </View>
    );
  }

  return (
    <View>
      <TouchableOpacity
        style={mS.directorTrigger}
        onPress={() => setExpanded(e => !e)}
        activeOpacity={0.8}
      >
        <View style={mS.directorTriggerLeft}>
          <View style={[mS.directorAvatar, selected && { backgroundColor: `${Colors.gold}20` }]}>
            <Ionicons name={selected ? 'shield-checkmark' : 'shield-outline'} size={16} color={selected ? Colors.gold : Colors.textMuted} />
          </View>
          <View style={{ flex: 1 }}>
            {selected ? (
              <>
                <Text style={mS.directorName}>{selected.nome} {selected.apelido}</Text>
                <Text style={mS.directorMeta}>{selected.numeroProfessor} · Nomeado como Director de Turma</Text>
              </>
            ) : (
              <Text style={mS.directorPlaceholder}>Nomear Director de Turma</Text>
            )}
          </View>
        </View>
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color={Colors.textMuted} />
      </TouchableOpacity>

      {expanded && (
        <View style={mS.directorDropdown}>
          <ScrollView style={{ maxHeight: 200 }} showsVerticalScrollIndicator={false}>
            {candidatos.map((p: any) => {
              const isActive = value === p.id;
              return (
                <TouchableOpacity
                  key={p.id}
                  style={[mS.directorOption, isActive && mS.directorOptionActive]}
                  onPress={() => { onChange(p.id); setExpanded(false); }}
                >
                  <View style={[mS.directorOptionAvatar, isActive && { backgroundColor: `${Colors.gold}25` }]}>
                    <Ionicons name={isActive ? 'shield-checkmark' : 'person'} size={14} color={isActive ? Colors.gold : Colors.textSecondary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[mS.directorOptionName, isActive && { color: Colors.goldLight }]}>{p.nome} {p.apelido}</Text>
                    <Text style={mS.directorOptionMeta}>{p.numeroProfessor} · {p.nivelEnsino || nivel}</Text>
                  </View>
                  {isActive && <Ionicons name="checkmark-circle" size={16} color={Colors.gold} />}
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <View style={mS.directorFooter}>
            <Ionicons name="people-outline" size={12} color={Colors.textMuted} />
            <Text style={mS.directorFooterText}>
              {candidatos.length} professor{candidatos.length !== 1 ? 'es' : ''} disponíve{candidatos.length !== 1 ? 'is' : 'l'} para director
            </Text>
          </View>
        </View>
      )}
    </View>
  );
}

// ─── Selector de Disciplinas (Primário / I Ciclo) ─────────────────────────────
function DisciplinasSelector({ disciplinas, selected, onChange, onNavigateToDisciplinas }: {
  disciplinas: DisciplinaCatalogo[]; selected: string[]; onChange: (ids: string[]) => void; onNavigateToDisciplinas?: () => void;
}) {
  const [search, setSearch] = useState('');
  const grouped = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = q ? disciplinas.filter(d => d.nome.toLowerCase().includes(q) || (d.componente || '').toLowerCase().includes(q)) : disciplinas;
    const map: Record<string, DisciplinaCatalogo[]> = {};
    for (const d of filtered) {
      const key = d.componente || 'Geral';
      if (!map[key]) map[key] = [];
      map[key].push(d);
    }
    return map;
  }, [disciplinas, search]);

  function toggle(id: string) {
    if (selected.includes(id)) onChange(selected.filter(x => x !== id));
    else onChange([...selected, id]);
  }
  function toggleAll() {
    if (selected.length === disciplinas.length) onChange([]);
    else onChange(disciplinas.map(d => d.id));
  }

  const totalSel = selected.length;

  return (
    <View style={mS.selectorBox}>
      {/* Barra de pesquisa + toggle-all */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <View style={[mS.directorSearch, { flex: 1, marginBottom: 0 }]}>
          <StableSearchInput
            value={search}
            onChangeText={setSearch}
            inputStyle={mS.directorSearchInput}
            placeholder="Pesquisar disciplina..."
            iconSize={14}
          />
        </View>
        <TouchableOpacity
          onPress={toggleAll}
          style={{ backgroundColor: totalSel === disciplinas.length ? `${Colors.gold}20` : Colors.surface, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7, borderWidth: 1, borderColor: totalSel === disciplinas.length ? Colors.gold : Colors.border }}
        >
          <Text style={{ fontSize: 10, fontFamily: 'Inter_600SemiBold', color: totalSel === disciplinas.length ? Colors.goldLight : Colors.textMuted }}>
            {totalSel === disciplinas.length ? 'Desmarcar' : 'Todas'}
          </Text>
        </TouchableOpacity>
      </View>

      {disciplinas.length === 0 ? (
        <View style={{ padding: 14, alignItems: 'center', gap: 10 }}>
          <Ionicons name="book-outline" size={22} color={Colors.textMuted} />
          <Text style={{ fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted, textAlign: 'center' }}>
            Nenhuma disciplina disponível para esta classe no catálogo.
          </Text>
          {onNavigateToDisciplinas && (
            <TouchableOpacity
              onPress={onNavigateToDisciplinas}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: `${Colors.accent}18`, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: `${Colors.accent}40` }}
            >
              <Ionicons name="add-circle-outline" size={14} color={Colors.accent} />
              <Text style={{ fontSize: 12, fontFamily: 'Inter_600SemiBold', color: Colors.accent }}>Ir para Disciplinas e criar</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <ScrollView style={{ maxHeight: 280 }} showsVerticalScrollIndicator={false} nestedScrollEnabled>
          {Object.entries(grouped).map(([componente, discs]) => (
            <View key={componente}>
              <View style={{ paddingHorizontal: 4, paddingVertical: 4, marginTop: 4 }}>
                <Text style={{ fontSize: 9, fontFamily: 'Inter_700Bold', color: Colors.textMuted, letterSpacing: 0.8, textTransform: 'uppercase' }}>{componente}</Text>
              </View>
              {discs.map(d => {
                const isSel = selected.includes(d.id);
                return (
                  <TouchableOpacity
                    key={d.id}
                    style={[mS.directorOption, isSel && mS.directorOptionActive]}
                    onPress={() => toggle(d.id)}
                  >
                    <View style={[mS.directorOptionAvatar, isSel && { backgroundColor: `${Colors.gold}25` }]}>
                      <Ionicons name="book-outline" size={13} color={isSel ? Colors.gold : Colors.textMuted} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[mS.directorOptionName, isSel && { color: Colors.goldLight }]}>{d.nome}</Text>
                      {d.codigo ? <Text style={mS.directorOptionMeta}>{d.codigo}</Text> : null}
                    </View>
                    {isSel && <Ionicons name="checkmark-circle" size={16} color={Colors.gold} />}
                  </TouchableOpacity>
                );
              })}
            </View>
          ))}
        </ScrollView>
      )}

      <View style={mS.directorFooter}>
        <Ionicons name="book-outline" size={12} color={Colors.textMuted} />
        <Text style={mS.directorFooterText}>
          {totalSel} disciplina{totalSel !== 1 ? 's' : ''} seleccionada{totalSel !== 1 ? 's' : ''}
        </Text>
      </View>
    </View>
  );
}

function TurmaFormModal({ visible, onClose, onSave, turma, professores, salas, config, allTurmas }: any) {
  useEnterToSave(handleSave, visible);
  const { anoSelecionado } = useAnoAcademico();
  const anoAtual = anoSelecionado?.ano || new Date().getFullYear().toString();
  const { values: niveis } = useLookup('niveis', NIVEIS_FALLBACK);
  const { values: turnos } = useLookup('turnos', TURNOS_FALLBACK);
  const { values: classesRaw } = useLookup('classes', CLASSES_FALLBACK);
  // Filtro client-side (garante consistência mesmo com fallback estático)
  const classes = (config as any).temDecimaTermeira !== false
    ? classesRaw
    : classesRaw.filter((c: string) => c !== '13ª Classe');
  const defaultNivel = turma?.nivel || niveis[1] || niveis[0] || 'I Ciclo';
  const defaultTurno = turma?.turno || turnos[0] || 'Manhã';
  const defaultClassesPorNivel = classesPorNivel(defaultNivel, classes);
  const defaultClasse = turma?.classe || defaultClassesPorNivel[0] || classes[0] || '7ª Classe';
  const [form, setForm] = useState<Partial<Turma>>(turma || {
    nome: '', classe: defaultClasse, turno: defaultTurno, anoLetivo: anoAtual,
    nivel: defaultNivel, professorId: '', professoresIds: [], sala: '', capacidade: 35, ativo: true,
  });
  const [cursos, setCursos] = useState<Curso[]>([]);
  const [disciplinasCatalogo, setDisciplinasCatalogo] = useState<DisciplinaCatalogo[]>([]);
  const [selectedDisciplinaIds, setSelectedDisciplinaIds] = useState<string[]>([]);
  const cursoScrollRef = useRef<ScrollView>(null);
  const router = useRouter();
  const set = (k: keyof Turma, v: any) => setForm(f => ({ ...f, [k]: v }));

  function navigateAndClose(path: string, params?: Record<string, string>) {
    onClose();
    setTimeout(() => router.push(params ? ({ pathname: path, params } as any) : (path as any)), 150);
  }
  const insets = useSafeAreaInsets();
  const bottomPad = Platform.OS === 'web' ? 34 : insets.bottom;

  const classesDoNivel = classesPorNivel(form.nivel || defaultNivel, classes);
  const isIICiclo = (form.nivel || '').toLowerCase().includes('ii ciclo');
  const isNaoIICiclo = !isIICiclo;

  function handleNivelChange(n: string) {
    const classesNivel = classesPorNivel(n, classes);
    const primeiraClasse = classesNivel[0] || classes[0] || '';
    setForm(f => ({ ...f, nivel: n, classe: primeiraClasse, professorId: '', professoresIds: [] }));
    setSelectedDisciplinaIds([]);
  }

  useEffect(() => {
    if (visible) {
      fetch('/api/cursos').then(r => r.json()).then((list: Curso[]) => setCursos(list.filter(c => c.ativo))).catch(() => {});
    }
  }, [visible]);

  // Carregar catálogo de disciplinas para a classe seleccionada (só Primário/I Ciclo)
  useEffect(() => {
    if (!visible || isIICiclo) { setDisciplinasCatalogo([]); return; }
    const classe = form.classe || '';
    if (!classe) return;
    fetch(`/api/disciplinas/por-classe?classe=${encodeURIComponent(classe)}`)
      .then(r => r.json())
      .then((list: DisciplinaCatalogo[]) => setDisciplinasCatalogo(Array.isArray(list) ? list : []))
      .catch(() => setDisciplinasCatalogo([]));
  }, [visible, form.classe, isIICiclo]);

  // Carregar disciplinas já atribuídas (modo edição)
  useEffect(() => {
    if (!visible || isIICiclo || !turma?.id) { if (!turma) setSelectedDisciplinaIds([]); return; }
    fetch(`/api/turmas/${turma.id}/disciplinas`)
      .then(r => r.json())
      .then((list: { id: string }[]) => setSelectedDisciplinaIds(Array.isArray(list) ? list.map(d => d.id) : []))
      .catch(() => setSelectedDisciplinaIds([]));
  }, [visible, turma?.id, isIICiclo]);

  const salasAtivas: Sala[] = (salas || []).filter((s: Sala) => s.ativo);
  const salaSelected = salasAtivas.find((s: Sala) => s.nome === form.sala);
  const salaScrollRef = useRef<ScrollView>(null);
  const SALA_SCROLL_STEP = 200;

  function scrollSalas(dir: 'left' | 'right') {
    salaScrollRef.current?.scrollTo?.({ x: dir === 'right' ? SALA_SCROLL_STEP : -SALA_SCROLL_STEP, animated: true });
  }

  // usar posição acumulada para scroll relativo
  const salaScrollX = useRef(0);
  function scrollSalasBy(dir: 'left' | 'right') {
    const next = salaScrollX.current + (dir === 'right' ? SALA_SCROLL_STEP : -SALA_SCROLL_STEP);
    salaScrollRef.current?.scrollTo?.({ x: Math.max(0, next), animated: true });
  }

  function handleSelectSala(s: Sala) {
    setForm(f => ({ ...f, sala: s.nome, capacidade: s.capacidade }));
  }

  function handleSave() {
    if (!form.nome) {
      webAlert('Campo obrigatório', 'Preencha o nome da turma.');
      return;
    }
    if (!form.sala) {
      webAlert('Sala obrigatória', 'Seleccione uma sala para a turma.');
      return;
    }
    if (!form.professorId) {
      webAlert('Director obrigatório', 'Seleccione primeiro os professores da turma e nomeie o Director de Turma. Uma turma não pode ser criada sem Director.');
      return;
    }
    onSave(form, isNaoIICiclo ? selectedDisciplinaIds : []);
  }

  const nivelAtual = form.nivel || defaultNivel;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
      <View style={mS.overlay}>
        <View style={[mS.container, { paddingBottom: bottomPad + 16 }]}>
          <View style={mS.header}>
            <Text style={mS.title}>{turma ? 'Editar Turma' : 'Nova Turma'}</Text>
            <TouchableOpacity onPress={onClose}><Ionicons name="close" size={22} color={Colors.textSecondary} /></TouchableOpacity>
          </View>
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <View style={mS.field}>
              <Text style={mS.fieldLabel}>Nome da Turma (ex: 7ª A)</Text>
              <TextInput
                style={mS.input}
                value={form.nome ?? ''}
                onChangeText={v => set('nome', v)}
                placeholder="Nome da Turma (ex: 7ª A)"
                placeholderTextColor={Colors.textMuted}
                returnKeyType="done"
                onSubmitEditing={handleSave}
              />
            </View>

            <View style={[mS.field, { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: `${Colors.info}10`, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: `${Colors.info}25` }]}>
              <Ionicons name="calendar-outline" size={14} color={Colors.info} />
              <Text style={{ fontSize: 12, fontFamily: 'Inter_500Medium', color: Colors.info, flex: 1 }}>
                Ano Lectivo: <Text style={{ fontFamily: 'Inter_700Bold' }}>{anoAtual}</Text>
              </Text>
            </View>

            <View style={mS.field}>
              <Text style={mS.fieldLabel}>Sala</Text>
              {salasAtivas.length === 0 ? (
                <View style={mS.emptyRoomHint}>
                  <Ionicons name="alert-circle-outline" size={15} color={Colors.warning} />
                  <Text style={mS.emptyRoomText}>Nenhuma sala registada. Crie uma sala primeiro.</Text>
                </View>
              ) : (
                <View style={mS.salaScrollWrapper}>
                  <TouchableOpacity style={mS.salaArrow} onPress={() => scrollSalasBy('left')}>
                    <Ionicons name="chevron-back" size={18} color={Colors.textSecondary} />
                  </TouchableOpacity>
                  <ScrollView
                    ref={salaScrollRef}
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={{ flex: 1 }}
                    onScroll={e => { salaScrollX.current = e.nativeEvent.contentOffset.x; }}
                    scrollEventThrottle={16}
                  >
                    <View style={mS.toggleRow}>
                      {salasAtivas.map((s: Sala) => {
                        const isActive = form.sala === s.nome;
                        return (
                          <TouchableOpacity key={s.id} style={[mS.salaCard, isActive && mS.salaCardActive]} onPress={() => handleSelectSala(s)}>
                            <Ionicons name="business-outline" size={14} color={isActive ? Colors.gold : Colors.textMuted} />
                            <Text style={[mS.salaName, isActive && mS.salaNameActive]}>{s.nome}</Text>
                            <Text style={[mS.salaMeta, isActive && mS.salaMetaActive]}>{s.bloco} · {s.capacidade} lug.</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </ScrollView>
                  <TouchableOpacity style={mS.salaArrow} onPress={() => scrollSalasBy('right')}>
                    <Ionicons name="chevron-forward" size={18} color={Colors.textSecondary} />
                  </TouchableOpacity>
                </View>
              )}
              {salaSelected && (
                <View style={mS.salaInfo}>
                  <Ionicons name="checkmark-circle" size={13} color={Colors.success} />
                  <Text style={mS.salaInfoText}>
                    {salaSelected.nome} — {salaSelected.tipo} — Capacidade: {salaSelected.capacidade} alunos
                  </Text>
                </View>
              )}
            </View>

            <View style={mS.field}>
              <Text style={mS.fieldLabel}>Nível</Text>
              <View style={mS.toggleRow}>
                {niveis.map(n => (
                  <TouchableOpacity key={n} style={[mS.toggleBtn, form.nivel === n && mS.toggleActive]} onPress={() => handleNivelChange(n)}>
                    <Text style={[mS.toggleText, form.nivel === n && mS.toggleTextActive]}>{n}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={mS.field}>
              <Text style={mS.fieldLabel}>Classe</Text>
              {classesDoNivel.length === 0 ? (
                <View style={mS.emptyRoomHint}>
                  <Ionicons name="alert-circle-outline" size={15} color={Colors.warning} />
                  <Text style={mS.emptyRoomText}>Seleccione um nível para ver as classes disponíveis.</Text>
                </View>
              ) : (
                <View style={mS.toggleRow}>
                  {classesDoNivel.map(c => (
                    <TouchableOpacity key={c} style={[mS.toggleBtn, form.classe === c && mS.toggleActive]} onPress={() => set('classe', c)}>
                      <Text style={[mS.toggleText, form.classe === c && mS.toggleTextActive]}>{c}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>

            <View style={mS.field}>
              <Text style={mS.fieldLabel}>Turno</Text>
              <View style={mS.toggleRow}>
                {turnos.map(t => (
                  <TouchableOpacity key={t} style={[mS.toggleBtn, form.turno === t && mS.toggleActive]} onPress={() => set('turno', t)}>
                    <Text style={[mS.toggleText, form.turno === t && mS.toggleTextActive]}>{t}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* ── Secção 1: Professores da Turma ── */}
            <View style={mS.field}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <View style={mS.sectionNumBadge}>
                    <Text style={mS.sectionNumText}>1</Text>
                  </View>
                  <Text style={mS.fieldLabel}>Professores desta Turma</Text>
                </View>
                <View style={mS.nivelBadge}>
                  <Ionicons name="filter-outline" size={10} color={Colors.info} />
                  <Text style={mS.nivelBadgeText}>{nivelAtual}</Text>
                </View>
              </View>
              <Text style={mS.sectionHint}>
                Seleccione todos os professores que leccionam nesta turma.
              </Text>
              <ProfessoresTurmaSelector
                professores={professores}
                nivel={nivelAtual}
                selected={form.professoresIds || []}
                onChange={(ids: string[]) => {
                  const maxTurmas = config?.maxTurmasProfessor ?? 8;
                  const currentIds: string[] = form.professoresIds || [];
                  const newlyAdded = ids.filter((id: string) => !currentIds.includes(id));
                  for (const profId of newlyAdded) {
                    const turmasDoProf = (allTurmas || []).filter((t: any) =>
                      t.id !== turma?.id && (t.professoresIds || []).includes(profId)
                    ).length;
                    if (turmasDoProf >= maxTurmas) {
                      const prof = professores.find((p: any) => p.id === profId);
                      webAlert(
                        'Limite de Turmas Atingido',
                        `${prof?.nome ?? ''} ${prof?.apelido ?? ''} já tem ${turmasDoProf} turma(s) atribuída(s). O limite máximo configurado é de ${maxTurmas} turma(s) por professor.`
                      );
                      return;
                    }
                  }
                  set('professoresIds', ids);
                }}
              />
            </View>

            {/* ── Divider ── */}
            <View style={mS.sectionDivider}>
              <View style={mS.sectionDividerLine} />
              <Ionicons name="chevron-down" size={14} color={Colors.textMuted} style={{ marginHorizontal: 8 }} />
              <View style={mS.sectionDividerLine} />
            </View>

            {/* ── Secção 2: Director de Turma ── */}
            <View style={mS.field}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <View style={[mS.sectionNumBadge, { backgroundColor: `${Colors.gold}22` }]}>
                  <Text style={[mS.sectionNumText, { color: Colors.gold }]}>2</Text>
                </View>
                <Text style={mS.fieldLabel}>
                  Director de Turma{' '}
                  <Text style={{ color: Colors.danger, fontFamily: 'Inter_600SemiBold' }}>*</Text>
                </Text>
              </View>
              <Text style={mS.sectionHint}>
                Obrigatório. Entre os professores acima seleccionados, nomeie um Director. O Director recebe permissões adicionais: gestão disciplinar, comunicação com encarregados e coordenação pedagógica da turma.
              </Text>
              <DirectorSelector
                professores={professores}
                professoresIds={form.professoresIds || []}
                nivel={nivelAtual}
                value={form.professorId || ''}
                onChange={(id) => set('professorId', id)}
              />
            </View>

            {/* ── Secção 3: Disciplinas (Primário / I Ciclo) ── */}
            {isNaoIICiclo && (
              <>
                <View style={mS.sectionDivider}>
                  <View style={mS.sectionDividerLine} />
                  <Ionicons name="chevron-down" size={14} color={Colors.textMuted} style={{ marginHorizontal: 8 }} />
                  <View style={mS.sectionDividerLine} />
                </View>
                <View style={mS.field}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <View style={[mS.sectionNumBadge, { backgroundColor: `${Colors.accent}22` }]}>
                        <Text style={[mS.sectionNumText, { color: Colors.accent }]}>3</Text>
                      </View>
                      <Text style={mS.fieldLabel}>Disciplinas desta Turma</Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      {selectedDisciplinaIds.length > 0 && (
                        <View style={{ backgroundColor: `${Colors.success}18`, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: `${Colors.success}30` }}>
                          <Text style={{ fontSize: 10, fontFamily: 'Inter_700Bold', color: Colors.success }}>{selectedDisciplinaIds.length} selec.</Text>
                        </View>
                      )}
                      <TouchableOpacity
                        onPress={() => navigateAndClose('/(main)/disciplinas')}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: `${Colors.accent}15`, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: `${Colors.accent}35` }}
                      >
                        <Ionicons name="add" size={11} color={Colors.accent} />
                        <Text style={{ fontSize: 10, fontFamily: 'Inter_600SemiBold', color: Colors.accent }}>Criar</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                  <Text style={mS.sectionHint}>
                    Seleccione as disciplinas que fazem parte do currículo desta turma. Só estas disciplinas aparecerão nas pautas e lançamento de notas.
                  </Text>
                  <DisciplinasSelector
                    disciplinas={disciplinasCatalogo}
                    selected={selectedDisciplinaIds}
                    onChange={setSelectedDisciplinaIds}
                    onNavigateToDisciplinas={() => navigateAndClose('/(main)/disciplinas')}
                  />
                </View>
              </>
            )}

            {isIICiclo && (
              <View style={mS.field}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <Text style={mS.fieldLabel}>Curso <Text style={{ color: Colors.textMuted, fontFamily: 'Inter_400Regular' }}>(opcional)</Text></Text>
                  <TouchableOpacity
                    onPress={() => navigateAndClose('/(main)/admin', { section: 'cursos' })}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: `${Colors.gold}15`, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: `${Colors.gold}35` }}
                  >
                    <Ionicons name="add" size={11} color={Colors.gold} />
                    <Text style={{ fontSize: 10, fontFamily: 'Inter_600SemiBold', color: Colors.goldLight }}>Gerir Cursos</Text>
                  </TouchableOpacity>
                </View>
                {cursos.length === 0 ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: `${Colors.warning}10`, borderRadius: 10, padding: 12, borderWidth: 1, borderColor: `${Colors.warning}25` }}>
                    <Ionicons name="school-outline" size={18} color={Colors.warning} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 12, fontFamily: 'Inter_600SemiBold', color: Colors.warning, marginBottom: 2 }}>Nenhum curso criado</Text>
                      <Text style={{ fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted, lineHeight: 15 }}>
                        Vá a <Text style={{ color: Colors.gold, fontFamily: 'Inter_600SemiBold' }}>Gestão de Cursos</Text> para criar os cursos do II Ciclo antes de criar a turma.
                      </Text>
                    </View>
                  </View>
                ) : (
                  <View style={mS.salaScrollWrapper}>
                    <ScrollView ref={cursoScrollRef} horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }}>
                      <View style={mS.toggleRow}>
                        <TouchableOpacity style={[mS.toggleBtn, !form.cursoId && mS.toggleActive]} onPress={() => set('cursoId', undefined)}>
                          <Text style={[mS.toggleText, !form.cursoId && mS.toggleTextActive]}>Nenhum</Text>
                        </TouchableOpacity>
                        {cursos.map((c: Curso) => (
                          <TouchableOpacity key={c.id} style={[mS.toggleBtn, form.cursoId === c.id && mS.toggleActive]} onPress={() => set('cursoId', c.id)}>
                            <Text style={[mS.toggleText, form.cursoId === c.id && mS.toggleTextActive]}>{c.nome}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </ScrollView>
                    <TouchableOpacity
                      style={mS.salaArrow}
                      onPress={() => cursoScrollRef.current?.scrollTo({ x: 300, animated: true })}
                    >
                      <Ionicons name="chevron-forward" size={16} color={Colors.textSecondary} />
                    </TouchableOpacity>
                  </View>
                )}
                {form.cursoId && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6, backgroundColor: `${Colors.success}12`, borderRadius: 8, padding: 8 }}>
                    <Ionicons name="checkmark-circle" size={13} color={Colors.success} />
                    <Text style={{ fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.success }}>
                      As disciplinas do curso serão usadas nas pautas e notas desta turma.
                    </Text>
                  </View>
                )}
              </View>
            )}
          </ScrollView>
          <TouchableOpacity style={mS.saveBtn} onPress={handleSave}>
            <Ionicons name="checkmark" size={18} color={Colors.text} />
            <Text style={mS.saveBtnText}>Guardar</Text>
          </TouchableOpacity>
        </View>
      </View>
          </KeyboardAvoidingView>
</Modal>
  );
}

export default function TurmasScreen() {
  const { turmas, professores, alunos, salas, addTurma, updateTurma, deleteTurma, isLoading } = useData();
  const { config } = useConfig();
  const { values: nivelsFiltro } = useLookup('niveis', NIVEIS_FALLBACK);
  const insets = useSafeAreaInsets();
  const [filterNivel, setFilterNivel] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editTurma, setEditTurma] = useState<Turma | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 8;
  const bottomPad = Platform.OS === 'web' ? 34 : insets.bottom;

  const filtered = useMemo(() => {
    return turmas.filter(t => !filterNivel || t.nivel === filterNivel);
  }, [turmas, filterNivel]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
  const safePage = Math.min(currentPage, totalPages);
  const paginated = useMemo(() => {
    return filtered.slice((safePage - 1) * ITEMS_PER_PAGE, safePage * ITEMS_PER_PAGE);
  }, [filtered, safePage]);

  useEffect(() => { setCurrentPage(1); }, [filterNivel]);

  async function handleSave(form: Partial<Turma>, disciplinaIds: string[] = []) {
    try {
      let turmaId: string;
      if (editTurma) {
        await updateTurma(editTurma.id, form);
        turmaId = editTurma.id;
      } else {
        const nova = await addTurma({ ...form } as any);
        turmaId = nova.id;
      }
      // Atribuir disciplinas (Primário / I Ciclo)
      if (disciplinaIds.length >= 0 && !(form.nivel || '').toLowerCase().includes('ii ciclo')) {
        fetch(`/api/turmas/${turmaId}/disciplinas`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ disciplinaIds }),
        }).catch(() => {});
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      alertSucesso(
        editTurma ? 'Turma actualizada' : 'Turma criada',
        editTurma
          ? `A turma "${form.nome}" foi actualizada com sucesso.`
          : `A turma "${form.nome}" foi criada com sucesso.`
      );
      setShowForm(false);
      setEditTurma(null);
    } catch (e) {
      alertErro('Erro', 'Não foi possível guardar a turma. Tente novamente.');
    }
  }

  function confirmDelete(t: Turma) {
    webAlert('Remover Turma', `Remover turma ${t.nome}?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Remover', style: 'destructive', onPress: async () => {
          try {
            await deleteTurma(t.id);
            alertSucesso('Turma removida', `A turma "${t.nome}" foi removida.`);
          } catch {
            alertErro('Erro', 'Não foi possível remover a turma.');
          }
        }
      },
    ]);
  }

  const nivelColors: Record<string, string> = { 'Primário': Colors.success, 'I Ciclo': Colors.gold, 'II Ciclo': Colors.accent };
  const turnoColors: Record<string, string> = { 'Manhã': Colors.info, 'Tarde': Colors.warning, 'Noite': Colors.textSecondary };

  const renderTurma = ({ item }: { item: Turma }) => {
    const director = professores.find(p => p.id === item.professorId);
    const numAlunos = alunos.filter(a => a.turmaId === item.id).length;
    const nColor = nivelColors[item.nivel] || Colors.textMuted;
    const tColor = turnoColors[item.turno] || Colors.textMuted;
    return (
      <View style={styles.card}>
        <View style={[styles.cardTop, { borderBottomColor: nColor }]}>
          <View style={styles.cardTopLeft}>
            <Text style={styles.turmaNome}>{item.nome}</Text>
            <Text style={styles.turmaClasse}>{item.classe}</Text>
          </View>
          <View style={styles.badges}>
            <View style={[styles.badge, { backgroundColor: `${nColor}18` }]}>
              <Text style={[styles.badgeText, { color: nColor }]}>{item.nivel}</Text>
            </View>
            <View style={[styles.badge, { backgroundColor: `${tColor}18` }]}>
              <Text style={[styles.badgeText, { color: tColor }]}>{item.turno}</Text>
            </View>
          </View>
        </View>
        <View style={styles.cardBody}>
          <View style={styles.infoRow}>
            <Ionicons name="people-outline" size={14} color={Colors.textMuted} />
            <Text style={styles.infoText}>{numAlunos}/{item.capacidade} alunos · Sala {item.sala}</Text>
          </View>
          {director && (
            <View style={styles.infoRow}>
              <Ionicons name="person-outline" size={14} color={Colors.textMuted} />
              <Text style={styles.infoText}>Dir: {director.nome} {director.apelido}</Text>
            </View>
          )}
        </View>
        <View style={styles.cardFooter}>
          <TouchableOpacity style={styles.actionBtn} onPress={() => { setEditTurma(item); setShowForm(true); }}>
            <Ionicons name="create-outline" size={16} color={Colors.info} />
            <Text style={styles.actionBtnText}>Editar</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionBtn, { borderColor: `${Colors.danger}30` }]} onPress={() => confirmDelete(item)}>
            <Ionicons name="trash-outline" size={16} color={Colors.danger} />
            <Text style={[styles.actionBtnText, { color: Colors.danger }]}>Remover</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.screen}>
      <TopBar title="Turmas" subtitle={`${filtered.length} turmas`} rightAction={{ icon: 'add-circle', onPress: () => { setEditTurma(null); setShowForm(true); } }} />

      <View style={{ flexDirection: 'row', alignItems: 'center', paddingRight: 14, paddingTop: 4 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={[styles.filterScroll, { flex: 1 }]} contentContainerStyle={styles.filterContent}>
          {['', ...nivelsFiltro].map(n => (
            <TouchableOpacity key={n} style={[styles.filterChip, filterNivel === n && styles.filterChipActive]} onPress={() => setFilterNivel(n)}>
              <Text style={[styles.filterChipText, filterNivel === n && styles.filterChipTextActive]}>{n || 'Todos'}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        <ExportMenu
          title="Lista de Turmas"
          columns={[
            { header: 'Turma', key: 'nome', width: 16 },
            { header: 'Classe', key: 'classe', width: 14 },
            { header: 'Nível', key: 'nivel', width: 12 },
            { header: 'Turno', key: 'turno', width: 10 },
            { header: 'Ano Lectivo', key: 'anoLetivo', width: 14 },
            { header: 'Alunos', key: 'numAlunos', width: 10 },
            { header: 'Capacidade', key: 'capacidade', width: 12 },
            { header: 'Sala', key: 'sala', width: 12 },
            { header: 'Director de Turma', key: 'director', width: 24 },
          ]}
          rows={filtered.map(t => ({
            nome: t.nome,
            classe: t.classe,
            nivel: t.nivel,
            turno: t.turno,
            anoLetivo: t.anoLetivo,
            numAlunos: alunos.filter(a => a.turmaId === t.id).length,
            capacidade: t.capacidade,
            sala: t.sala,
            director: professores.find(p => p.id === t.professorId) ? `${professores.find(p => p.id === t.professorId)!.nome} ${professores.find(p => p.id === t.professorId)!.apelido}` : '—',
          }))}
          school={{ nomeEscola: config?.nomeEscola ?? 'Super Escola' }}
          filename="lista_turmas"
          landscape
        />
      </View>

      {isLoading && turmas.length === 0 ? (
        <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
          <SkeletonList rows={6} />
        </View>
      ) : (
        <>
          <FlatList
            data={paginated}
            keyExtractor={i => i.id}
            renderItem={renderTurma}
            contentContainerStyle={[styles.list, { paddingBottom: 8 }]}
            showsVerticalScrollIndicator={false}
            ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
            ListEmptyComponent={<View style={styles.empty}><MaterialIcons name="class" size={40} color={Colors.textMuted} /><Text style={styles.emptyText}>Nenhuma turma</Text></View>}
          />

          <PaginationBar currentPage={safePage} totalPages={totalPages} onPageChange={setCurrentPage} bottomPad={bottomPad} />
        </>
      )}

      {showForm && (
        <TurmaFormModal visible={showForm} onClose={() => { setShowForm(false); setEditTurma(null); }} onSave={handleSave} turma={editTurma} professores={professores} salas={salas} config={config} allTurmas={turmas} />
      )}
    </View>
  );
}

const mS = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'center', alignItems: 'center', zIndex: 1000, elevation: 1000 },
  container: { backgroundColor: Colors.backgroundCard, borderTopLeftRadius: 24, borderTopRightRadius: 24, borderTopWidth: 1, borderColor: Colors.border, padding: 20, maxHeight: '90%', width: '100%', maxWidth: 480, zIndex: 1001, elevation: 1001 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  title: { fontSize: 18, fontFamily: 'Inter_700Bold', color: Colors.text },
  field: { marginBottom: 14 },
  fieldLabel: { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: Colors.textSecondary, marginBottom: 6 },
  input: { backgroundColor: Colors.surface, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, fontFamily: 'Inter_400Regular', color: Colors.text },
  toggleRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  toggleBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
  toggleActive: { backgroundColor: `${Colors.gold}20`, borderColor: Colors.gold },
  toggleText: { fontSize: 13, fontFamily: 'Inter_500Medium', color: Colors.textSecondary },
  toggleTextActive: { color: Colors.goldLight, fontFamily: 'Inter_600SemiBold' },
  saveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.accent, borderRadius: 14, paddingVertical: 16, gap: 8, marginTop: 12 },
  saveBtnText: { fontSize: 15, fontFamily: 'Inter_700Bold', color: Colors.text },
  salaScrollWrapper: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
  },
  salaArrow: {
    width: 30, height: 30, borderRadius: 15, backgroundColor: Colors.surface,
    borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  salaCard: {
    alignItems: 'center', paddingHorizontal: 12, paddingVertical: 9, borderRadius: 12,
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, gap: 2, minWidth: 78, flexGrow: 1,
  },
  salaCardActive: { backgroundColor: `${Colors.gold}18`, borderColor: Colors.gold },
  salaName: { fontSize: 11, fontFamily: 'Inter_600SemiBold', color: Colors.textSecondary, textAlign: 'center' },
  salaNameActive: { color: Colors.goldLight },
  salaMeta: { fontSize: 9, fontFamily: 'Inter_400Regular', color: Colors.textMuted, textAlign: 'center' },
  salaMetaActive: { color: `${Colors.gold}CC` },
  salaInfo: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 8, backgroundColor: `${Colors.success}12`, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: `${Colors.success}25` },
  salaInfoText: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.success, flex: 1 },
  emptyRoomHint: { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: `${Colors.warning}12`, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: `${Colors.warning}25` },
  emptyRoomText: { fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.warning, flex: 1 },
  nivelBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: `${Colors.info}15`, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: `${Colors.info}30` },
  nivelBadgeText: { fontSize: 10, fontFamily: 'Inter_600SemiBold', color: Colors.info },
  directorTrigger: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: Colors.surface, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
  directorTriggerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  directorAvatar: { width: 34, height: 34, borderRadius: 10, backgroundColor: `${Colors.gold}15`, alignItems: 'center', justifyContent: 'center' },
  directorName: { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: Colors.text },
  directorMeta: { fontSize: 9, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 1 },
  directorPlaceholder: { fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textMuted },
  directorDropdown: { marginTop: 6, backgroundColor: Colors.surface, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden' },
  directorSearch: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.border },
  directorSearchInput: { flex: 1, fontSize: 13, fontFamily: 'Inter_400Regular', color: Colors.text },
  directorOption: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: `${Colors.border}60` },
  directorOptionActive: { backgroundColor: `${Colors.gold}10` },
  directorOptionAvatar: { width: 30, height: 30, borderRadius: 8, backgroundColor: `${Colors.textMuted}18`, alignItems: 'center', justifyContent: 'center' },
  directorOptionName: { fontSize: 13, fontFamily: 'Inter_500Medium', color: Colors.text },
  directorOptionMeta: { fontSize: 10, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 1 },
  directorFooter: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: `${Colors.info}08`, borderTopWidth: 1, borderTopColor: Colors.border },
  directorFooterText: { fontSize: 10, fontFamily: 'Inter_400Regular', color: Colors.textMuted },
  directorEmptyHint: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: 'rgba(232,238,246,0.05)', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: 'rgba(232,238,246,0.12)' },
  directorEmptyText: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted, flex: 1, lineHeight: 16 },
  selectorBox: { backgroundColor: Colors.surface, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden' },
  checkbox: { width: 18, height: 18, borderRadius: 5, borderWidth: 1.5, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: 'transparent' },
  checkboxChecked: { backgroundColor: Colors.info, borderColor: Colors.info },
  sectionNumBadge: { width: 20, height: 20, borderRadius: 10, backgroundColor: `${Colors.info}22`, alignItems: 'center', justifyContent: 'center' },
  sectionNumText: { fontSize: 11, fontFamily: 'Inter_700Bold', color: Colors.info },
  sectionHint: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginBottom: 8, lineHeight: 15 },
  sectionDivider: { flexDirection: 'row', alignItems: 'center', marginVertical: 4, paddingHorizontal: 4 },
  sectionDividerLine: { flex: 1, height: 1, backgroundColor: Colors.border },
});

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  filterScroll: { maxHeight: 50 },
  filterContent: { paddingHorizontal: 16, paddingVertical: 8, gap: 8, alignItems: 'center' },
  filterChip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
  filterChipActive: { backgroundColor: `${Colors.gold}20`, borderColor: Colors.gold },
  filterChipText: { fontSize: 12, fontFamily: 'Inter_500Medium', color: Colors.textSecondary },
  filterChipTextActive: { color: Colors.goldLight, fontFamily: 'Inter_600SemiBold' },
  list: { padding: 16 },
  card: { backgroundColor: Colors.backgroundCard, borderRadius: 16, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden' },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14, borderBottomWidth: 1 },
  cardTopLeft: { gap: 2 },
  turmaNome: { fontSize: 18, fontFamily: 'Inter_700Bold', color: Colors.text },
  turmaClasse: { fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textSecondary },
  badges: { flexDirection: 'row', gap: 6 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  badgeText: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  cardBody: { padding: 14, gap: 6 },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  infoText: { fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textSecondary },
  cardFooter: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: Colors.border, padding: 10, gap: 8 },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: `${Colors.info}30` },
  actionBtnText: { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: Colors.info },
  empty: { alignItems: 'center', gap: 10, paddingTop: 60 },
  emptyText: { fontSize: 14, fontFamily: 'Inter_400Regular', color: Colors.textMuted },
});
