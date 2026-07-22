import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  ActivityIndicator, StyleSheet, FlatList, Platform, Modal, Pressable,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Colors } from '@/constants/colors';
import { api } from '@/lib/api';
import { alertSucesso, alertErro } from '@/utils/toast';

interface AlunoEN {
  alunoId: string;
  nome: string;
  notaId: string | null;
  ex1: number;
  ex2: number;
  mt1: number;
  mt2: number;
  mact3: number;
  mt3: number;
}

interface Turma {
  id: string;
  nome: string;
  classe: string;
  anoLetivo: string;
  turno: string;
  cursoNome?: string;
}

interface ProgressoTurma {
  total: number;
  comEN: number;
}

function calcMFDComEN(classeNum: number, mt3: number, nen: number): number | null {
  if (!mt3 || !nen) return null;
  if (classeNum === 12) return Math.round((0.5 * mt3 + 0.5 * nen) * 10) / 10;
  return Math.round((0.6 * mt3 + 0.4 * nen) * 10) / 10;
}

function ProgressoBadge({ comEN, total }: { comEN: number; total: number }) {
  if (total === 0) return null;
  const completo = comEN === total;
  const parcial = comEN > 0 && comEN < total;
  const cor = completo ? Colors.success : parcial ? Colors.warning : Colors.textMuted;
  return (
    <View style={[pb.badge, { backgroundColor: cor + '22', borderColor: cor + '66' }]}>
      <Text style={[pb.txt, { color: cor }]}>{comEN}/{total}</Text>
    </View>
  );
}

const pb = StyleSheet.create({
  badge: {
    borderRadius: 10, borderWidth: 1,
    paddingHorizontal: 6, paddingVertical: 1, marginLeft: 4,
  },
  txt: { fontSize: 9, fontFamily: 'Inter_700Bold' },
});

/** Painel de Resultados: aprovados, reprovados e alerta de risco */
function PainelResultados({
  alunos, values, classeNum,
}: {
  alunos: AlunoEN[];
  values: Record<string, { ex1: string }>;
  classeNum: number;
}) {
  const comEN = alunos.filter(a => a.notaId && parseFloat(values[a.notaId]?.ex1 || '0') > 0);
  if (comEN.length === 0) return null;

  const resultados = comEN.map(a => {
    const nen = parseFloat(values[a.notaId!]?.ex1 || '0');
    const mfd = calcMFDComEN(classeNum, a.mt3, nen);
    return { ...a, mfd };
  });

  const aprovados  = resultados.filter(r => r.mfd !== null && r.mfd >= 10);
  const reprovados = resultados.filter(r => r.mfd !== null && r.mfd < 10);
  const semCalculo = resultados.filter(r => r.mfd === null);

  return (
    <View style={rp.card}>
      <View style={rp.headerRow}>
        <Ionicons name="bar-chart" size={14} color={Colors.gold} />
        <Text style={rp.headerTitle}>Resumo de Resultados EN</Text>
      </View>

      {/* Contadores */}
      <View style={rp.counters}>
        <View style={[rp.counter, { backgroundColor: Colors.success + '18', borderColor: Colors.success + '44' }]}>
          <Ionicons name="checkmark-circle" size={18} color={Colors.success} />
          <Text style={[rp.counterNum, { color: Colors.success }]}>{aprovados.length}</Text>
          <Text style={[rp.counterLabel, { color: Colors.success }]}>Aprovados</Text>
        </View>
        <View style={[rp.counter, { backgroundColor: Colors.danger + '18', borderColor: Colors.danger + '44' }]}>
          <Ionicons name="close-circle" size={18} color={Colors.danger} />
          <Text style={[rp.counterNum, { color: Colors.danger }]}>{reprovados.length}</Text>
          <Text style={[rp.counterLabel, { color: Colors.danger }]}>Reprovados</Text>
        </View>
        {semCalculo.length > 0 && (
          <View style={[rp.counter, { backgroundColor: Colors.textMuted + '18', borderColor: Colors.border }]}>
            <Ionicons name="time-outline" size={18} color={Colors.textMuted} />
            <Text style={[rp.counterNum, { color: Colors.textMuted }]}>{semCalculo.length}</Text>
            <Text style={[rp.counterLabel, { color: Colors.textMuted }]}>Sem MT₃</Text>
          </View>
        )}
      </View>

      {/* Barra visual aprovação */}
      {(aprovados.length + reprovados.length) > 0 && (
        <View style={rp.barWrap}>
          <View style={rp.barTrack}>
            <View style={[rp.barAprov, { flex: aprovados.length }]} />
            <View style={[rp.barReprov, { flex: reprovados.length }]} />
          </View>
          <Text style={rp.barLabel}>
            {Math.round(aprovados.length / (aprovados.length + reprovados.length) * 100)}% de aprovação
          </Text>
        </View>
      )}

      {/* Alunos em risco */}
      {reprovados.length > 0 && (
        <View style={rp.riscoBox}>
          <View style={rp.riscoHeader}>
            <Ionicons name="warning" size={13} color={Colors.warning} />
            <Text style={rp.riscoTitle}>Alunos com MFD &lt; 10 (risco de reprovação)</Text>
          </View>
          {reprovados.map(r => (
            <View key={r.alunoId} style={rp.riscoRow}>
              <Text style={rp.riscoNome} numberOfLines={1}>{r.nome}</Text>
              <View style={rp.mfdBadge}>
                <Text style={rp.mfdBadgeTxt}>{r.mfd?.toFixed(1)}</Text>
              </View>
              <Text style={rp.riscoFalta}>
                (faltam {(10 - (r.mfd ?? 0)).toFixed(1)} valores)
              </Text>
            </View>
          ))}
        </View>
      )}

      {aprovados.length > 0 && reprovados.length === 0 && (
        <View style={rp.todosBom}>
          <Ionicons name="trophy" size={14} color={Colors.success} />
          <Text style={rp.todosBomTxt}>Todos os alunos com EN estão aprovados!</Text>
        </View>
      )}
    </View>
  );
}

const rp = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface, borderRadius: 12,
    borderWidth: 1, borderColor: Colors.border,
    marginHorizontal: 12, marginBottom: 8, padding: 14,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
  headerTitle: { fontSize: 13, fontFamily: 'Inter_700Bold', color: Colors.text },
  counters: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  counter: {
    flex: 1, alignItems: 'center', gap: 3,
    borderRadius: 10, borderWidth: 1, paddingVertical: 10,
  },
  counterNum: { fontSize: 20, fontFamily: 'Inter_700Bold' },
  counterLabel: { fontSize: 10, fontFamily: 'Inter_600SemiBold' },
  barWrap: { marginBottom: 12 },
  barTrack: { flexDirection: 'row', height: 8, borderRadius: 6, overflow: 'hidden', marginBottom: 4 },
  barAprov: { backgroundColor: Colors.success },
  barReprov: { backgroundColor: Colors.danger },
  barLabel: { fontSize: 10, fontFamily: 'Inter_400Regular', color: Colors.textMuted, textAlign: 'right' },
  riscoBox: {
    backgroundColor: Colors.danger + '0D', borderRadius: 8,
    borderWidth: 1, borderColor: Colors.danger + '33', padding: 10,
  },
  riscoHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  riscoTitle: { fontSize: 11, fontFamily: 'Inter_700Bold', color: Colors.warning, flex: 1 },
  riscoRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: Colors.danger + '22',
  },
  riscoNome: { flex: 1, fontSize: 12, fontFamily: 'Inter_600SemiBold', color: Colors.text },
  mfdBadge: {
    backgroundColor: Colors.danger, borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 2,
  },
  mfdBadgeTxt: { fontSize: 11, fontFamily: 'Inter_700Bold', color: '#fff' },
  riscoFalta: { fontSize: 10, fontFamily: 'Inter_400Regular', color: Colors.textMuted },
  todosBom: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: Colors.success + '14', borderRadius: 8, padding: 10,
  },
  todosBomTxt: { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: Colors.success },
});

function ProgressoBarra({
  alunos, values, classeNum,
}: {
  alunos: AlunoEN[];
  values: Record<string, { ex1: string }>;
  classeNum: number;
}) {
  const comNota = alunos.filter(a => !!a.notaId);
  const total = comNota.length;
  if (total === 0) return null;

  // Conta quantos já têm EN guardado na BD (ex1 > 0 originalmente)
  const jaGuardados = alunos.filter(a => a.notaId && a.ex1 > 0).length;
  // Conta quantos têm valor introduzido no ecrã (incluindo novos)
  const comValor = comNota.filter(a => parseFloat(values[a.notaId!]?.ex1 || '0') > 0).length;
  const semNota = alunos.filter(a => !a.notaId).length;

  const pct = total > 0 ? Math.round((jaGuardados / total) * 100) : 0;
  const corBarra = pct === 100 ? Colors.success : pct > 0 ? Colors.warning : Colors.danger;
  const corTexto = pct === 100 ? Colors.success : pct > 0 ? Colors.warning : Colors.textSecondary;

  return (
    <View style={pg.card}>
      <View style={pg.topRow}>
        <View style={pg.leftCol}>
          <Ionicons name="stats-chart" size={14} color={corTexto} />
          <Text style={[pg.titulo, { color: corTexto }]}>Progresso do Exame Nacional</Text>
        </View>
        <Text style={[pg.pct, { color: corTexto }]}>{pct}%</Text>
      </View>

      {/* Barra */}
      <View style={pg.barTrack}>
        <View style={[pg.barFill, { width: `${pct}%` as any, backgroundColor: corBarra }]} />
      </View>

      {/* Contadores */}
      <View style={pg.counters}>
        <View style={pg.counter}>
          <View style={[pg.dot, { backgroundColor: Colors.success }]} />
          <Text style={pg.counterTxt}>{jaGuardados} guardados na BD</Text>
        </View>
        <View style={pg.counter}>
          <View style={[pg.dot, { backgroundColor: Colors.gold }]} />
          <Text style={pg.counterTxt}>{comValor - jaGuardados > 0 ? comValor - jaGuardados : 0} por guardar</Text>
        </View>
        <View style={pg.counter}>
          <View style={[pg.dot, { backgroundColor: Colors.danger + 'AA' }]} />
          <Text style={pg.counterTxt}>{total - jaGuardados} sem EN</Text>
        </View>
        {semNota > 0 && (
          <View style={pg.counter}>
            <View style={[pg.dot, { backgroundColor: Colors.textMuted }]} />
            <Text style={pg.counterTxt}>{semNota} sem nota T3</Text>
          </View>
        )}
      </View>

      {pct === 100 && (
        <View style={pg.completoBanner}>
          <Ionicons name="checkmark-circle" size={13} color={Colors.success} />
          <Text style={pg.completoTxt}>Todos os exames lançados para esta disciplina ✓</Text>
        </View>
      )}
    </View>
  );
}

const pg = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 12, borderWidth: 1, borderColor: Colors.border,
    marginHorizontal: 12, marginBottom: 8, padding: 12,
  },
  topRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginBottom: 8,
  },
  leftCol: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  titulo: { fontSize: 12, fontFamily: 'Inter_700Bold' },
  pct: { fontSize: 16, fontFamily: 'Inter_700Bold' },
  barTrack: {
    height: 8, borderRadius: 6,
    backgroundColor: Colors.border, overflow: 'hidden', marginBottom: 10,
  },
  barFill: { height: '100%', borderRadius: 6 },
  counters: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  counter: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  counterTxt: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textSecondary },
  completoBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    marginTop: 8, backgroundColor: Colors.success + '18',
    borderRadius: 8, padding: 7,
  },
  completoTxt: { fontSize: 11, fontFamily: 'Inter_600SemiBold', color: Colors.success },
});

// ─── SmartSelect ─────────────────────────────────────────────────────────────
// Web: <select> nativo estilizado com <optgroup> por grupo (overflow-proof, ARIA)
// Native: bottom-sheet com pesquisa embutida e cabeçalhos de grupo
// ─────────────────────────────────────────────────────────────────────────────
interface SelectOption { value: string; label: string; sub?: string; group?: string }

function SmartSelect({
  label, iconName, options, value, onChange, placeholder, loading = false, disabled = false,
}: {
  label: string;
  iconName: keyof typeof Ionicons.glyphMap;
  options: SelectOption[];
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  loading?: boolean;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const selected = options.find(o => o.value === value);
  const ph = placeholder ?? `Seleccionar ${label.toLowerCase()}…`;

  // Agrupa as opções por 'group' (se existir)
  const hasGroups = options.some(o => o.group);
  const groups: Record<string, SelectOption[]> = {};
  const ungrouped: SelectOption[] = [];
  for (const o of options) {
    if (o.group) {
      if (!groups[o.group]) groups[o.group] = [];
      groups[o.group].push(o);
    } else {
      ungrouped.push(o);
    }
  }
  const groupKeys = Object.keys(groups).sort();

  // Filtro de pesquisa (nativo)
  const q = search.trim().toLowerCase();
  const filteredOptions = q
    ? options.filter(o =>
        o.label.toLowerCase().includes(q) || (o.sub ?? '').toLowerCase().includes(q)
      )
    : options;

  // ── Web: <select> com <optgroup> agrupado ────────────────────────────────
  if (Platform.OS === 'web') {
    return (
      <View style={sel.webWrap}>
        <View style={sel.labelRow}>
          <Ionicons name={iconName} size={11} color={Colors.textMuted} />
          <Text style={sel.labelTxt}>{label.toUpperCase()}</Text>
          {loading && <ActivityIndicator size="small" color={Colors.gold} style={{ marginLeft: 6 }} />}
        </View>
        <View style={sel.webSelectWrap}>
          <View style={sel.webChevron} pointerEvents="none">
            <Ionicons name="chevron-down" size={14} color={Colors.textMuted} />
          </View>
          <View style={sel.webIconLeft} pointerEvents="none">
            <Ionicons
              name={selected ? iconName : 'ellipse-outline'}
              size={13}
              color={selected ? Colors.gold : Colors.textMuted}
            />
          </View>
          <select
            value={value}
            disabled={disabled || loading || options.length === 0}
            onChange={(e: any) => onChange(e.target.value)}
            style={{
              appearance: 'none' as any,
              WebkitAppearance: 'none' as any,
              MozAppearance: 'none' as any,
              width: '100%',
              height: 44,
              backgroundColor: '#0D1F35',
              color: selected ? '#f4e9c8' : '#7a92a8',
              border: `1.5px solid ${value ? '#D4AF3766' : '#1e3a52'}`,
              borderRadius: 10,
              paddingLeft: 36,
              paddingRight: 36,
              paddingTop: 0,
              paddingBottom: 0,
              fontSize: 13,
              fontFamily: 'Inter_600SemiBold, system-ui, sans-serif',
              cursor: disabled ? 'not-allowed' : 'pointer',
              outline: 'none',
              transition: 'border-color 0.18s, box-shadow 0.18s',
              opacity: disabled ? 0.5 : 1,
              boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.3)',
            } as any}
            onFocus={(e: any) => {
              e.target.style.borderColor = '#D4AF37';
              e.target.style.boxShadow = `0 0 0 3px #D4AF3722, inset 0 1px 3px rgba(0,0,0,0.3)`;
            }}
            onBlur={(e: any) => {
              e.target.style.borderColor = value ? '#D4AF3766' : '#1e3a52';
              e.target.style.boxShadow = 'inset 0 1px 3px rgba(0,0,0,0.3)';
            }}
          >
            <option value="" style={{ color: '#7a92a8', backgroundColor: '#0D1F35' }}>
              {options.length === 0 && !loading ? 'Nenhuma opção disponível' : ph}
            </option>

            {hasGroups ? (
              <>
                {groupKeys.map(g => (
                  <optgroup
                    key={g}
                    label={`── ${g} ──`}
                    style={{ color: '#D4AF37', backgroundColor: '#091929' } as any}
                  >
                    {groups[g].map(o => (
                      <option
                        key={o.value}
                        value={o.value}
                        style={{ backgroundColor: '#0D1F35', color: '#f4e9c8' }}
                      >
                        {o.label}{o.sub ? `  ·  ${o.sub}` : ''}
                      </option>
                    ))}
                  </optgroup>
                ))}
                {ungrouped.map(o => (
                  <option key={o.value} value={o.value} style={{ backgroundColor: '#0D1F35', color: '#f4e9c8' }}>
                    {o.label}{o.sub ? `  ·  ${o.sub}` : ''}
                  </option>
                ))}
              </>
            ) : (
              options.map(o => (
                <option key={o.value} value={o.value} style={{ backgroundColor: '#0D1F35', color: '#f4e9c8' }}>
                  {o.label}{o.sub ? `  ·  ${o.sub}` : ''}
                </option>
              ))
            )}
          </select>
        </View>
      </View>
    );
  }

  // ── Native: bottom-sheet com pesquisa + cabeçalhos de grupo ─────────────
  return (
    <View style={sel.nativeWrap}>
      <View style={sel.labelRow}>
        <Ionicons name={iconName} size={11} color={Colors.textMuted} />
        <Text style={sel.labelTxt}>{label.toUpperCase()}</Text>
        {loading && <ActivityIndicator size="small" color={Colors.gold} style={{ marginLeft: 6 }} />}
      </View>

      <TouchableOpacity
        style={[sel.trigger, value && sel.triggerActive, (disabled || loading) && sel.triggerDis]}
        onPress={() => { if (!disabled && !loading && options.length > 0) { setSearch(''); setOpen(true); } }}
        activeOpacity={0.75}
      >
        <View style={sel.triggerLeft}>
          <Ionicons
            name={selected ? iconName : 'ellipse-outline'}
            size={14}
            color={selected ? Colors.gold : Colors.textMuted}
          />
          <Text style={[sel.triggerTxt, !selected && sel.triggerPh]} numberOfLines={1}>
            {selected ? selected.label : (options.length === 0 && !loading ? 'Nenhuma opção' : ph)}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          {selected?.sub ? (
            <View style={sel.triggerBadge}>
              <Text style={sel.triggerBadgeTxt}>{selected.sub}</Text>
            </View>
          ) : null}
          <Ionicons name="chevron-down" size={14} color={Colors.textMuted} />
        </View>
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <Pressable style={sel.overlay} onPress={() => setOpen(false)}>
          <Pressable style={sel.sheet} onPress={e => e.stopPropagation()}>
            {/* Handle bar */}
            <View style={sel.handleBar} />

            {/* Header */}
            <View style={sel.sheetHeader}>
              <View style={sel.sheetHeaderLeft}>
                <Ionicons name={iconName} size={16} color={Colors.gold} />
                <Text style={sel.sheetTitle}>{label}</Text>
                <View style={sel.countBadge}>
                  <Text style={sel.countBadgeTxt}>{options.length}</Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => setOpen(false)} hitSlop={14} style={sel.closeBtn}>
                <Ionicons name="close" size={18} color={Colors.textMuted} />
              </TouchableOpacity>
            </View>

            {/* Barra de pesquisa */}
            {options.length > 5 && (
              <View style={sel.searchRow}>
                <Ionicons name="search" size={14} color={search ? Colors.gold : Colors.textMuted} />
                <TextInput
                  style={sel.searchInput}
                  value={search}
                  onChangeText={setSearch}
                  placeholder="Pesquisar…"
                  placeholderTextColor={Colors.textMuted}
                  autoFocus={false}
                  clearButtonMode="while-editing"
                />
                {search.length > 0 && (
                  <TouchableOpacity onPress={() => setSearch('')} hitSlop={8}>
                    <Ionicons name="close-circle" size={16} color={Colors.textMuted} />
                  </TouchableOpacity>
                )}
              </View>
            )}

            {/* Lista com grupos */}
            <ScrollView style={sel.optionList} bounces={false} keyboardShouldPersistTaps="handled">
              {hasGroups && !q ? (
                <>
                  {groupKeys.map(g => (
                    <View key={g}>
                      <View style={sel.groupHeader}>
                        <Text style={sel.groupHeaderTxt}>{g}</Text>
                        <View style={sel.groupHeaderLine} />
                      </View>
                      {groups[g].map(o => {
                        const isActive = o.value === value;
                        return (
                          <TouchableOpacity
                            key={o.value}
                            style={[sel.option, isActive && sel.optionActive]}
                            onPress={() => { onChange(o.value); setSearch(''); setOpen(false); }}
                            activeOpacity={0.7}
                          >
                            <View style={{ flex: 1 }}>
                              <Text style={[sel.optTxt, isActive && sel.optTxtActive]} numberOfLines={1}>
                                {o.label}
                              </Text>
                              {o.sub ? (
                                <View style={sel.optSubRow}>
                                  <Text style={sel.optSub}>{o.sub}</Text>
                                </View>
                              ) : null}
                            </View>
                            {isActive && <Ionicons name="checkmark-circle" size={18} color={Colors.gold} />}
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  ))}
                </>
              ) : (
                filteredOptions.length === 0 ? (
                  <View style={sel.emptySearch}>
                    <Text style={sel.emptySearchTxt}>Sem resultados para "{search}"</Text>
                  </View>
                ) : (
                  filteredOptions.map(o => {
                    const isActive = o.value === value;
                    return (
                      <TouchableOpacity
                        key={o.value}
                        style={[sel.option, isActive && sel.optionActive]}
                        onPress={() => { onChange(o.value); setSearch(''); setOpen(false); }}
                        activeOpacity={0.7}
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={[sel.optTxt, isActive && sel.optTxtActive]} numberOfLines={1}>
                            {o.label}
                          </Text>
                          {o.sub ? (
                            <View style={sel.optSubRow}>
                              <Text style={sel.optSub}>{o.sub}</Text>
                            </View>
                          ) : null}
                        </View>
                        {isActive && <Ionicons name="checkmark-circle" size={18} color={Colors.gold} />}
                      </TouchableOpacity>
                    );
                  })
                )
              )}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const sel = StyleSheet.create({
  /* Web */
  webWrap:       { flex: 1 },
  webSelectWrap: { position: 'relative' },
  webChevron:    { position: 'absolute', right: 12, top: 0, bottom: 0, justifyContent: 'center', zIndex: 0 },
  webIconLeft:   { position: 'absolute', left: 12, top: 0, bottom: 0, justifyContent: 'center', zIndex: 0 },
  /* Native trigger */
  nativeWrap: { flex: 1 },
  trigger: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    height: 44, paddingHorizontal: 14, borderRadius: 12,
    backgroundColor: Colors.background,
    borderWidth: 1.5, borderColor: Colors.borderLight,
    gap: 8,
  },
  triggerActive: { borderColor: Colors.gold + '66' },
  triggerDis: { opacity: 0.45 },
  triggerLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  triggerTxt:  { flex: 1, fontSize: 13, fontFamily: 'Inter_600SemiBold', color: Colors.text },
  triggerPh:   { color: Colors.textSecondary, fontFamily: 'Inter_400Regular' },
  triggerBadge: {
    backgroundColor: Colors.gold + '22', borderRadius: 8,
    paddingHorizontal: 7, paddingVertical: 2, borderWidth: 1, borderColor: Colors.gold + '44',
  },
  triggerBadgeTxt: { fontSize: 9, fontFamily: 'Inter_700Bold', color: Colors.gold },
  /* Label row */
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 6 },
  labelTxt:  { fontSize: 10, fontFamily: 'Inter_700Bold', color: Colors.textMuted, letterSpacing: 0.8 },
  /* Modal overlay */
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: Colors.backgroundElevated,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    borderWidth: 1, borderColor: Colors.borderLight,
    maxHeight: '80%',
  },
  handleBar: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: Colors.borderLight,
    alignSelf: 'center', marginTop: 10, marginBottom: 2,
  },
  sheetHeader: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 18, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  sheetHeaderLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  sheetTitle: { fontSize: 15, fontFamily: 'Inter_700Bold', color: Colors.text },
  countBadge: {
    backgroundColor: Colors.gold + '22', borderRadius: 10,
    paddingHorizontal: 7, paddingVertical: 1,
  },
  countBadgeTxt: { fontSize: 11, fontFamily: 'Inter_700Bold', color: Colors.gold },
  closeBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: Colors.surface,
    alignItems: 'center', justifyContent: 'center',
  },
  /* Search */
  searchRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginHorizontal: 16, marginVertical: 10,
    backgroundColor: Colors.background, borderRadius: 10,
    borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: 12, paddingVertical: 9,
  },
  searchInput: {
    flex: 1, fontSize: 13, fontFamily: 'Inter_400Regular',
    color: Colors.text, padding: 0,
  },
  /* Groups */
  groupHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 18, paddingVertical: 8,
    backgroundColor: Colors.background,
  },
  groupHeaderTxt: {
    fontSize: 10, fontFamily: 'Inter_700Bold',
    color: Colors.gold, letterSpacing: 1, textTransform: 'uppercase',
  },
  groupHeaderLine: { flex: 1, height: 1, backgroundColor: Colors.gold + '30' },
  /* Options */
  optionList:  { paddingBottom: 12 },
  option: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 18, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: Colors.border + '88',
  },
  optionActive: { backgroundColor: Colors.gold + '12' },
  optTxt:       { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: Colors.text },
  optTxtActive: { color: Colors.gold },
  optSubRow:    { flexDirection: 'row', marginTop: 3 },
  optSub:       { fontSize: 10, fontFamily: 'Inter_400Regular', color: Colors.textMuted },
  /* Empty search */
  emptySearch: { padding: 28, alignItems: 'center' },
  emptySearchTxt: { fontSize: 13, fontFamily: 'Inter_400Regular', color: Colors.textMuted },
});
// ─── fim SmartSelect ──────────────────────────────────────────────────────────

export default function ExameNacionalTab() {
  const [turmas, setTurmas] = useState<Turma[]>([]);
  const [turmaId, setTurmaId] = useState('');
  const [disciplinas, setDisciplinas] = useState<string[]>([]);
  const [disciplina, setDisciplina] = useState('');
  const [alunos, setAlunos] = useState<AlunoEN[]>([]);
  const [classeNum, setClasseNum] = useState(0);
  const [isNuclear, setIsNuclear] = useState(false);
  const [values, setValues] = useState<Record<string, { ex1: string }>>({});
  const [saving, setSaving] = useState<Set<string>>(new Set());
  const [savingAll, setSavingAll] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingTurmas, setLoadingTurmas] = useState(true);
  const [loadingDiscs, setLoadingDiscs] = useState(false);
  const [progresso, setProgresso] = useState<Record<string, ProgressoTurma>>({});

  const fetchProgresso = useCallback(() => {
    api.get('/api/exame-nacional/progresso')
      .then((r: any) => setProgresso(r || {}))
      .catch(() => {});
  }, []);

  useEffect(() => {
    setLoadingTurmas(true);
    api.get('/api/exame-nacional/turmas')
      .then((r: any) => setTurmas(Array.isArray(r) ? r : []))
      .catch(() => setTurmas([]))
      .finally(() => setLoadingTurmas(false));
    fetchProgresso();
  }, [fetchProgresso]);

  useEffect(() => {
    if (!turmaId) { setDisciplinas([]); setDisciplina(''); setAlunos([]); return; }
    setLoadingDiscs(true);
    api.get(`/api/exame-nacional/disciplinas-nucleares?turmaId=${turmaId}`)
      .then((r: any) => {
        const discs: string[] = Array.isArray(r) ? r : [];
        setDisciplinas(discs);
        setDisciplina(discs[0] || '');
      })
      .catch(() => { setDisciplinas([]); setDisciplina(''); })
      .finally(() => setLoadingDiscs(false));
  }, [turmaId]);

  const loadDados = useCallback(() => {
    if (!turmaId || !disciplina) { setAlunos([]); return; }
    setLoading(true);
    api.get(`/api/exame-nacional/dados?turmaId=${turmaId}&disciplina=${encodeURIComponent(disciplina)}`)
      .then((r: any) => {
        const data = r || {};
        const list: AlunoEN[] = data.alunos || [];
        setAlunos(list);
        setClasseNum(data.classeNum || 0);
        setIsNuclear(data.isNuclear ?? true);
        const init: Record<string, { ex1: string }> = {};
        for (const a of list) {
          if (a.notaId) {
            init[a.notaId] = { ex1: a.ex1 > 0 ? String(a.ex1) : '' };
          }
        }
        setValues(init);
      })
      .catch(() => alertErro('Erro ao carregar dados'))
      .finally(() => setLoading(false));
  }, [turmaId, disciplina]);

  useEffect(() => { loadDados(); }, [loadDados]);

  const updateValue = (notaId: string, txt: string) => {
    setValues(prev => ({
      ...prev,
      [notaId]: { ex1: txt },
    }));
  };

  const buildPayload = (aluno: AlunoEN, v: { ex1: string }) => {
    const nen = parseFloat(v.ex1) || 0;
    const mfd = calcMFDComEN(classeNum, aluno.mt3, nen);
    return { ex1: nen, ex2: 0, ...(mfd !== null ? { nf: mfd } : {}) };
  };

  const saveRow = async (aluno: AlunoEN) => {
    if (!aluno.notaId) { alertErro('Aluno não tem nota T3 lançada pelo professor'); return; }
    const v = values[aluno.notaId] || { ex1: '' };
    setSaving(prev => new Set(prev).add(aluno.notaId!));
    try {
      await api.put(`/api/notas/${aluno.notaId}`, buildPayload(aluno, v));
      alertSucesso(`EN guardado — ${aluno.nome.split(' ')[0]}`);
      fetchProgresso();
      loadDados();
    } catch {
      alertErro('Erro ao guardar. Tente novamente.');
    } finally {
      setSaving(prev => { const s = new Set(prev); s.delete(aluno.notaId!); return s; });
    }
  };

  const saveAll = async () => {
    const comEN = alunos.filter(a => a.notaId && parseFloat(values[a.notaId]?.ex1 || '0') > 0);
    if (!comEN.length) { alertErro('Introduza pelo menos um EN antes de guardar'); return; }
    setSavingAll(true);
    let ok = 0; let errs = 0;
    for (const aluno of comEN) {
      const v = values[aluno.notaId!] || { ex1: '' };
      try {
        await api.put(`/api/notas/${aluno.notaId}`, buildPayload(aluno, v));
        ok++;
      } catch { errs++; }
    }
    setSavingAll(false);
    if (ok > 0) {
      alertSucesso(`${ok} aluno(s) guardados com sucesso`);
      fetchProgresso();
      loadDados();
    }
    if (errs > 0) alertErro(`${errs} erro(s) ao guardar`);
  };

  const notaMin = 10;

  const renderAluno = ({ item: aluno, index }: { item: AlunoEN; index: number }) => {
    const v = aluno.notaId ? (values[aluno.notaId] || { ex1: '' }) : { ex1: '' };
    const nenNum = parseFloat(v.ex1) || 0;
    const mfd = calcMFDComEN(classeNum, aluno.mt3, nenNum);
    const isSav = aluno.notaId ? saving.has(aluno.notaId) : false;
    const rowBg = index % 2 === 0 ? Colors.surface : Colors.background;
    const semNota = !aluno.notaId;
    const mfdColor = mfd === null ? Colors.textMuted : mfd >= notaMin ? Colors.success : Colors.danger;
    const jaGuardado = aluno.ex1 > 0;

    return (
      <View style={[s.row, { backgroundColor: rowBg }, semNota && s.rowDisabled]}>
        <View style={s.cellNome}>
          <Text style={s.tdNum}>{String(index + 1).padStart(2, '0')}</Text>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Text style={s.tdNome} numberOfLines={1}>{aluno.nome}</Text>
              {jaGuardado && !semNota && (
                <View style={s.guardadoBadge}>
                  <Ionicons name="checkmark" size={9} color={Colors.success} />
                </View>
              )}
            </View>
            {semNota && <Text style={s.semNotaHint}>Sem nota T3 lançada</Text>}
          </View>
        </View>

        <Text style={s.tdVal}>{aluno.mt1 > 0 ? aluno.mt1.toFixed(1) : '—'}</Text>
        <Text style={s.tdVal}>{aluno.mt2 > 0 ? aluno.mt2.toFixed(1) : '—'}</Text>
        <Text style={[s.tdVal, { color: Colors.info }]}>{aluno.mact3 > 0 ? aluno.mact3.toFixed(1) : '—'}</Text>
        <Text style={[s.tdVal, { fontFamily: 'Inter_700Bold' }]}>{aluno.mt3 > 0 ? aluno.mt3.toFixed(1) : '—'}</Text>

        <TextInput
          style={[s.enInput, semNota && s.enInputDis, jaGuardado && s.enInputSaved]}
          value={v.ex1}
          onChangeText={txt => aluno.notaId && updateValue(aluno.notaId, txt)}
          keyboardType="numeric"
          placeholder="—"
          placeholderTextColor={Colors.textMuted}
          editable={!semNota}
          maxLength={4}
        />

        <Text style={[s.tdMFD, { color: mfdColor }]}>
          {mfd !== null ? mfd.toFixed(1) : '—'}
        </Text>

        <TouchableOpacity
          style={[s.saveBtn, (semNota || isSav) && s.saveBtnDis]}
          onPress={() => saveRow(aluno)}
          disabled={semNota || isSav}
        >
          {isSav
            ? <ActivityIndicator size="small" color="#fff" />
            : <Ionicons name="save-outline" size={14} color="#fff" />
          }
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <View style={s.wrap}>
      {/* Info banner */}
      <View style={s.infoBanner}>
        <Ionicons name="school" size={15} color={Colors.gold} />
        <Text style={s.infoText}>
          Lançamento do Exame Nacional (EN) para a <Text style={{ fontFamily: 'Inter_700Bold' }}>Secretaria</Text>.
          Apenas disciplinas <Text style={{ fontFamily: 'Inter_700Bold' }}>nucleares</Text> de turmas da{' '}
          <Text style={{ fontFamily: 'Inter_700Bold' }}>6ª, 9ª e 12ª</Text> classe são afectadas pelo EN.
        </Text>
      </View>

      {/* ── Selectors: Turma + Disciplina em linha ── */}
      <View style={s.selectorsRow}>
        {/* Turma */}
        <SmartSelect
          label="Turma de Exame"
          iconName="layers"
          loading={loadingTurmas}
          value={turmaId}
          onChange={setTurmaId}
          placeholder="Seleccionar turma…"
          options={turmas.map(t => {
            const prog = progresso[t.id];
            const classeRaw = t.classe?.replace('ª Classe', 'ª') ?? '';
            const badge = prog && prog.total > 0
              ? `${prog.comEN}/${prog.total} EN`
              : undefined;
            const grupoClasse = classeRaw ? `${classeRaw} Classe` : undefined;
            return {
              value: t.id,
              label: `${t.nome}${t.turno ? ` · ${t.turno}` : ''}`,
              sub: badge,
              group: grupoClasse,
            };
          })}
        />

        {/* Disciplina — só aparece quando turma seleccionada */}
        {!!turmaId && (
          <SmartSelect
            label="Disciplina Nuclear"
            iconName="book"
            loading={loadingDiscs}
            value={disciplina}
            onChange={setDisciplina}
            placeholder="Seleccionar disciplina…"
            options={disciplinas.map(d => ({ value: d, label: d }))}
            disabled={!turmaId}
          />
        )}
      </View>

      {/* Fórmula banner */}
      {!!turmaId && !!disciplina && classeNum > 0 && (
        <View style={s.formulaBanner}>
          <View style={s.formulaRow}>
            <Ionicons name="calculator" size={14} color={Colors.info} />
            <Text style={s.formulaTitle}>Decreto nº 04/2026 — {classeNum}ª Classe</Text>
          </View>
          <Text style={s.formulaLine}>
            MT = (MT₁ + MT₂ + MACT₃) ÷ 3
          </Text>
          {classeNum === 12
            ? <Text style={[s.formulaLine, { fontFamily: 'Inter_700Bold', color: Colors.info }]}>
                MFD = 0,5 × MT + 0,5 × NEN
              </Text>
            : <Text style={[s.formulaLine, { fontFamily: 'Inter_700Bold', color: Colors.info }]}>
                MFD = 0,6 × MT + 0,4 × NEN
              </Text>
          }
          <Text style={[s.formulaLine, { fontSize: 10, color: Colors.textMuted, marginTop: 2 }]}>
            {classeNum === 12
              ? 'Anexo III §4d — sem exames combinados'
              : 'Anexo III §4b — sem exames combinados'}
          </Text>
        </View>
      )}

      {/* Loading */}
      {loading && <ActivityIndicator color={Colors.gold} style={{ margin: 24 }} />}

      {/* Barra de progresso por disciplina */}
      {!loading && alunos.length > 0 && (
        <ProgressoBarra alunos={alunos} values={values} classeNum={classeNum} />
      )}

      {/* Table */}
      {!loading && alunos.length > 0 && (
        <>
          {/* Header */}
          <View style={s.tableHead}>
            <Text style={[s.th, { flex: 3.5 }]}>ALUNO</Text>
            <Text style={s.th}>MT₁</Text>
            <Text style={s.th}>MT₂</Text>
            <Text style={[s.th, { color: '#a8d8f0' }]}>MACT₃</Text>
            <Text style={[s.th, { fontFamily: 'Inter_700Bold' }]}>MT</Text>
            <Text style={[s.th, { color: Colors.gold }]}>NEN</Text>
            <Text style={[s.th, { color: '#8ef58e' }]}>MFD*</Text>
            <Text style={[s.th, { flex: 0.7 }]}> </Text>
          </View>

          <FlatList
            data={alunos}
            keyExtractor={a => a.alunoId}
            renderItem={renderAluno}
            scrollEnabled={false}
          />

          {/* Painel de Resultados EN */}
          <PainelResultados alunos={alunos} values={values} classeNum={classeNum} />

          {/* Actions */}
          <View style={s.actionsRow}>
            <TouchableOpacity
              style={[s.saveAllBtn, savingAll && { opacity: 0.6 }]}
              onPress={saveAll}
              disabled={savingAll}
            >
              {savingAll
                ? <ActivityIndicator color="#fff" />
                : <Ionicons name="checkmark-circle" size={18} color="#fff" />
              }
              <Text style={s.saveAllText}>Guardar Todos os Exames</Text>
            </TouchableOpacity>
          </View>
          <Text style={s.footNote}>
            * MFD previsto com base no EN introduzido · aprovação ≥ 10,0
          </Text>
        </>
      )}

      {/* Empty states */}
      {!loading && alunos.length === 0 && !!turmaId && !!disciplina && (
        <View style={s.emptyState}>
          <MaterialCommunityIcons name="file-alert-outline" size={42} color={Colors.textMuted} />
          <Text style={s.emptyTitle}>Sem notas T3 para esta disciplina</Text>
          <Text style={s.emptySub}>
            O professor deve primeiro lançar as notas do 3º Trimestre antes de ser possível registar o EN.
          </Text>
        </View>
      )}

      {!loading && (!turmaId || !disciplina) && (
        <View style={s.emptyState}>
          <MaterialCommunityIcons name="school-outline" size={42} color={Colors.textMuted} />
          <Text style={s.emptyTitle}>
            {!turmaId ? 'Seleccione uma turma de exame' : 'Seleccione uma disciplina nuclear'}
          </Text>
          <Text style={s.emptySub}>
            O EN aplica-se às classes 6ª, 9ª e 12ª nas disciplinas marcadas como nucleares.
          </Text>
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1 },

  infoBanner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: Colors.gold + '14', borderRadius: 12,
    padding: 12, margin: 12, marginBottom: 6,
  },
  infoText: {
    flex: 1, fontSize: 12, fontFamily: 'Inter_400Regular',
    color: Colors.textSecondary, lineHeight: 18,
  },

  // Linha de selectors (turma + disciplina lado a lado quando há espaço)
  selectorsRow: {
    flexDirection: Platform.OS === 'web' ? 'row' : 'column',
    gap: 10,
    paddingHorizontal: 12,
    marginBottom: 8,
  },

  formulaBanner: {
    backgroundColor: Colors.info + '12', borderRadius: 10, borderLeftWidth: 3,
    borderLeftColor: Colors.info, padding: 12, marginHorizontal: 12, marginBottom: 6,
  },
  formulaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  formulaTitle: { fontSize: 12, fontFamily: 'Inter_700Bold', color: Colors.info },
  formulaLine: { fontSize: 12, fontFamily: 'Inter_500Medium', color: Colors.text, marginBottom: 2 },

  tableHead: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#1a4a2e', paddingHorizontal: 12,
    paddingVertical: 9, marginTop: 6,
  },
  th: {
    flex: 1, fontSize: 8.5, fontFamily: 'Inter_700Bold',
    color: '#fff', textAlign: 'center', textTransform: 'uppercase',
  },

  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 7,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  rowDisabled: { opacity: 0.55 },

  cellNome: { flex: 3.5, flexDirection: 'row', alignItems: 'center', gap: 6 },
  tdNum: { fontSize: 10, fontFamily: 'Inter_700Bold', color: Colors.textMuted, width: 22 },
  tdNome: { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: Colors.text, flex: 1 },
  semNotaHint: { fontSize: 9, fontFamily: 'Inter_400Regular', color: Colors.warning },

  guardadoBadge: {
    width: 14, height: 14, borderRadius: 7,
    backgroundColor: Colors.success + '22',
    alignItems: 'center', justifyContent: 'center',
  },

  tdVal: { flex: 1, fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.text, textAlign: 'center' },
  tdMFD: { flex: 1, fontSize: 12, fontFamily: 'Inter_700Bold', textAlign: 'center' },

  enInput: {
    flex: 1, borderWidth: 1.5, borderColor: Colors.gold + '80',
    borderRadius: 7, paddingHorizontal: 4, paddingVertical: 5,
    fontSize: 13, fontFamily: 'Inter_700Bold',
    color: Colors.text, backgroundColor: Colors.gold + '0D',
    textAlign: 'center', marginHorizontal: 2,
  },
  enInputDis: { borderColor: Colors.border, backgroundColor: Colors.surface, opacity: 0.5 },
  enInputSaved: { borderColor: Colors.success + 'AA', backgroundColor: Colors.success + '0D' },

  saveBtn: {
    width: 30, height: 28, borderRadius: 7,
    backgroundColor: Colors.info, alignItems: 'center', justifyContent: 'center',
  },
  saveBtnDis: { opacity: 0.35 },

  actionsRow: { margin: 12, marginTop: 16 },
  saveAllBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#1a6b3c', paddingVertical: 14, borderRadius: 12,
  },
  saveAllText: { fontSize: 14, fontFamily: 'Inter_700Bold', color: '#fff' },
  footNote: {
    textAlign: 'center', fontSize: 10, fontFamily: 'Inter_400Regular',
    color: Colors.textMuted, marginBottom: 12, marginHorizontal: 12,
  },

  emptyState: {
    alignItems: 'center', justifyContent: 'center',
    padding: 40, gap: 10, marginTop: 20,
  },
  emptyTitle: {
    fontSize: 14, fontFamily: 'Inter_600SemiBold',
    color: Colors.textSecondary, textAlign: 'center',
  },
  emptySub: {
    fontSize: 12, fontFamily: 'Inter_400Regular',
    color: Colors.textMuted, textAlign: 'center', lineHeight: 18,
  },
});
