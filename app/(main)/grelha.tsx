import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useTabMemory } from '@/hooks/useTabMemory';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal, Platform, RefreshControl } from 'react-native';
import AppLoader from '@/components/AppLoader';
import { Ionicons, FontAwesome5, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '@/constants/colors';
import { useConfig } from '@/context/ConfigContext';
import TopBar from '@/components/TopBar';
import { SkeletonList } from '@/components/Skeleton';

// ─── Tipos ──────────────────────────────────────────────────────────────────

interface DiscRefLei {
  nome: string;
  codigo: string;
  horasSemana: number;
  horasAnuais: number;
  notaMinima: number;
  obrigatoria: boolean;
  observacao?: string;
}

// DiscII: disciplinas do II Ciclo lidas directamente de /api/disciplinas
interface DiscII {
  id: string;
  nome: string;
  codigo: string;
  area: string;
  categoriaFormacao?: string;
  cargaHoraria?: number;
  obrigatoria: boolean;
  classeInicio?: string;
  classeFim?: string;
  ordem?: number;
  ativo: boolean;
  nuclear?: boolean;
}

interface DiscCatalogo {
  id: string;
  nome: string;
  codigo: string;
  area: string;
  descricao?: string;
  tipo?: string;
  classeInicio?: string;
  classeFim?: string;
  ativo: boolean;
}

// ─── Dados Lei 17/16 (Primário e I Ciclo são imutáveis por lei) ─────────────

const PRIMARIO: DiscRefLei[] = [
  { nome: 'Língua Portuguesa', codigo: 'LP',  horasSemana: 8, horasAnuais: 320, notaMinima: 10, obrigatoria: true },
  { nome: 'Matemática',        codigo: 'MAT', horasSemana: 6, horasAnuais: 240, notaMinima: 10, obrigatoria: true },
  { nome: 'Estudo do Meio',    codigo: 'EM',  horasSemana: 3, horasAnuais: 120, notaMinima: 10, obrigatoria: true },
  { nome: 'Educação Física',   codigo: 'EF',  horasSemana: 2, horasAnuais: 80,  notaMinima: 10, obrigatoria: true },
  { nome: 'Educação Artística',codigo: 'EA',  horasSemana: 2, horasAnuais: 80,  notaMinima: 10, obrigatoria: true },
  { nome: 'Educação Moral e Cívica', codigo: 'EMC', horasSemana: 1, horasAnuais: 40, notaMinima: 10, obrigatoria: true },
  { nome: 'Língua Estrangeira', codigo: 'LE', horasSemana: 2, horasAnuais: 80, notaMinima: 10, obrigatoria: false, observacao: 'A partir da 4ª Classe' },
];

// Fonte: Plano Curricular do Ensino Secundário Geral — INIDE/MED, 2019 (5.5. Plano de Estudo, 1º Ciclo)
const I_CICLO: DiscRefLei[] = [
  { nome: 'Língua Portuguesa',       codigo: 'LP',  horasSemana: 3, horasAnuais: 270, notaMinima: 10, obrigatoria: true },
  { nome: 'Língua Estrangeira',      codigo: 'LE',  horasSemana: 3, horasAnuais: 270, notaMinima: 10, obrigatoria: true },
  { nome: 'Matemática',              codigo: 'MAT', horasSemana: 3, horasAnuais: 270, notaMinima: 10, obrigatoria: true },
  { nome: 'Biologia',                codigo: 'BIO', horasSemana: 2, horasAnuais: 210, notaMinima: 10, obrigatoria: true, observacao: '7ª: 2h · 8ª: 2h · 9ª: 3h' },
  { nome: 'Física',                  codigo: 'FIS', horasSemana: 2, horasAnuais: 210, notaMinima: 10, obrigatoria: true, observacao: '7ª: 3h · 8ª: 2h · 9ª: 2h' },
  { nome: 'Química',                 codigo: 'QUI', horasSemana: 2, horasAnuais: 210, notaMinima: 10, obrigatoria: true, observacao: '7ª: 2h · 8ª: 3h · 9ª: 2h' },
  { nome: 'Geografia',               codigo: 'GEO', horasSemana: 2, horasAnuais: 210, notaMinima: 10, obrigatoria: true, observacao: '7ª: 2h · 8ª: 2h · 9ª: 3h' },
  { nome: 'História',                codigo: 'HIS', horasSemana: 3, horasAnuais: 240, notaMinima: 10, obrigatoria: true, observacao: '7ª: 3h · 8ª: 3h · 9ª: 2h' },
  { nome: 'Educação Física',         codigo: 'EF',  horasSemana: 2, horasAnuais: 180, notaMinima: 10, obrigatoria: true },
  { nome: 'Ed. Moral e Cívica',      codigo: 'EMC', horasSemana: 1, horasAnuais: 90,  notaMinima: 10, obrigatoria: true },
  { nome: 'Ed. Visual e Plástica',   codigo: 'EVP', horasSemana: 2, horasAnuais: 180, notaMinima: 10, obrigatoria: true },
  { nome: 'Educação Laboral',        codigo: 'EDL', horasSemana: 2, horasAnuais: 180, notaMinima: 10, obrigatoria: true },
  { nome: 'Empreendedorismo',        codigo: 'EMP', horasSemana: 2, horasAnuais: 180, notaMinima: 10, obrigatoria: true },
];

const TABS = ['Primário', 'I Ciclo', 'II Ciclo', 'Catálogo'] as const;
type Tab = typeof TABS[number];

const TAB_COLORS: Record<Tab, string> = {
  'Primário': Colors.success,
  'I Ciclo':  Colors.info,
  'II Ciclo': Colors.gold,
  'Catálogo': '#8B5CF6',
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function calcTotalLei(discs: DiscRefLei[]) {
  return {
    count: discs.length,
    semana: discs.reduce((s, d) => s + d.horasSemana, 0),
    anual:  discs.reduce((s, d) => s + d.horasAnuais, 0),
  };
}

const AREA_COLORS: Record<string, string> = {
  'Ciências e Tecnologia':                          Colors.info,
  'Ciências Económicas Jurídicas e Sociais':        '#10B981',
  'Humanidades':                                    '#8B5CF6',
  'Artes':                                          '#EC4899',
  'Ciências de Informação e Comunicação':           '#06B6D4',
  'Formação de Professores':                        Colors.gold,
  'Ciências Exactas':                               Colors.info,
  'Ciências Naturais':                              '#10B981',
  'Ciências Sociais e Humanas':                     '#8B5CF6',
  'Línguas e Comunicação':                          '#F59E0B',
  'Artes e Expressão':                              '#EC4899',
  'Tecnologia e Informática':                       '#06B6D4',
  'Educação Física':                                '#F97316',
  'Formação Profissional':                          '#84CC16',
};

function areaColor(area: string) {
  return AREA_COLORS[area] || Colors.textMuted;
}

// ─── Componentes internos ────────────────────────────────────────────────────

function LeiDiscRow({ disc, cor, onPress }: { disc: DiscRefLei; cor: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.tableRow} onPress={onPress} activeOpacity={0.7}>
      <View style={{ flex: 1 }}>
        <View style={styles.discNameRow}>
          <View style={[styles.codBadge, { backgroundColor: cor + '22' }]}>
            <Text style={[styles.codText, { color: cor }]}>{disc.codigo}</Text>
          </View>
          <Text style={styles.discNome} numberOfLines={1}>{disc.nome}</Text>
          {!disc.obrigatoria && (
            <View style={[styles.optBadge, { borderColor: Colors.info + '60' }]}>
              <Text style={styles.optBadgeText}>Optativa</Text>
            </View>
          )}
        </View>
        {disc.observacao ? <Text style={styles.discObs}>{disc.observacao}</Text> : null}
      </View>
      <Text style={[styles.tableCell, { width: 40 }]}>{disc.horasSemana}h</Text>
      <Text style={[styles.tableCell, { width: 52, color: Colors.textMuted }]}>{disc.horasAnuais}h</Text>
      <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
    </TouchableOpacity>
  );
}

function SistemaAvaliacao() {
  return (
    <View style={styles.sistemaNota}>
      <View style={styles.sistemaHeader}>
        <Ionicons name="school" size={18} color={Colors.gold} />
        <Text style={styles.sistemaNoteTitle}>Sistema de Avaliação</Text>
      </View>
      <View style={styles.sistemaRow}>
        {[
          { label: 'PP — Prova Periódica',    value: '30%' },
          { label: 'MT — Média de Trabalhos', value: '30%' },
          { label: 'PT — Prova Trimestral',   value: '40%' },
        ].map(item => (
          <View key={item.label} style={styles.sistemaItem}>
            <Text style={styles.sistemaItemLabel}>{item.label}</Text>
            <Text style={styles.sistemaItemValue}>{item.value}</Text>
          </View>
        ))}
      </View>
      <View style={styles.macInfo}>
        <Text style={styles.macLabel}>MAC = (PP + MT + PT) / 3 — Mínimo de Aprovação: 10 valores</Text>
      </View>
    </View>
  );
}

// ─── Tab: Primário / I Ciclo ─────────────────────────────────────────────────

function TabRefLei({
  nivel, classes, descricao, cor, disciplinas,
}: {
  nivel: string; classes: string; descricao: string; cor: string; disciplinas: DiscRefLei[];
}) {
  const [detalhe, setDetalhe] = useState<DiscRefLei | null>(null);
  const total = calcTotalLei(disciplinas);

  return (
    <>
      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={[styles.enquadramentoCard, { borderLeftColor: cor }]}>
          <View style={styles.enquadramentoHeader}>
            <Ionicons name="information-circle" size={20} color={cor} />
            <Text style={styles.enquadramentoTitle}>Enquadramento Lei 17/16</Text>
          </View>
          <Text style={styles.enquadramentoClasses}>{classes}</Text>
          <Text style={styles.enquadramentoDesc}>{descricao}</Text>
          <View style={styles.enquadramentoLei}>
            <FontAwesome5 name="balance-scale" size={12} color={Colors.textMuted} />
            <Text style={styles.enquadramentoLeiText}>
              Lei n.º 17/16 de 7 de Outubro — Lei de Bases do Sistema de Educação e Ensino (Angola)
            </Text>
          </View>
        </View>

        <View style={styles.statsRow}>
          {[
            { label: 'Disciplinas', value: `${total.count}`, color: cor },
            { label: 'H/Semana',    value: `${total.semana}h`, color: cor },
            { label: 'H/Ano',       value: `${total.anual}h`,  color: cor },
            { label: 'Mín. Aprov.', value: '10',               color: Colors.success },
          ].map(s => (
            <View key={s.label} style={styles.statCard}>
              <Text style={[styles.statValue, { color: s.color }]}>{s.value}</Text>
              <Text style={styles.statLabel}>{s.label}</Text>
            </View>
          ))}
        </View>

        <Text style={styles.sectionTitle}>Disciplinas da Grelha</Text>
        <View style={styles.tableHeader}>
          <Text style={[styles.tableHeaderText, { flex: 1 }]}>Disciplina</Text>
          <Text style={[styles.tableHeaderText, { width: 40 }]}>H/Sem</Text>
          <Text style={[styles.tableHeaderText, { width: 52 }]}>H/Ano</Text>
          <View style={{ width: 24 }} />
        </View>

        {disciplinas.map((disc, i) => (
          <View key={disc.codigo} style={i % 2 !== 0 ? styles.tableRowAlt : undefined}>
            <LeiDiscRow disc={disc} cor={cor} onPress={() => setDetalhe(disc)} />
          </View>
        ))}

        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Total</Text>
          <Text style={[styles.totalValue, { width: 40, color: cor }]}>{total.semana}h</Text>
          <Text style={[styles.totalValue, { width: 52, color: Colors.textMuted }]}>{total.anual}h</Text>
          <View style={{ width: 24 }} />
        </View>

        <SistemaAvaliacao />
        <View style={{ height: 32 }} />
      </ScrollView>

      <Modal visible={!!detalhe} transparent animationType="slide" onRequestClose={() => setDetalhe(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            {detalhe && (
              <>
                <View style={styles.modalHeader}>
                  <View style={[styles.codBadgeLg, { backgroundColor: cor + '22' }]}>
                    <Text style={[styles.codTextLg, { color: cor }]}>{detalhe.codigo}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.modalTitle}>{detalhe.nome}</Text>
                    <Text style={styles.modalSub}>{nivel} — {classes}</Text>
                  </View>
                  <TouchableOpacity onPress={() => setDetalhe(null)} style={styles.modalClose}>
                    <Ionicons name="close" size={22} color={Colors.textSecondary} />
                  </TouchableOpacity>
                </View>
                <View style={styles.detalheGrid}>
                  {[
                    { label: 'Horas / Semana', value: `${detalhe.horasSemana}h`, color: cor },
                    { label: 'Horas / Ano',    value: `${detalhe.horasAnuais}h`, color: cor },
                    { label: 'Nota Mínima',    value: `${detalhe.notaMinima} val.`, color: Colors.success },
                    { label: 'Tipo',           value: detalhe.obrigatoria ? 'Obrigatória' : 'Optativa', color: detalhe.obrigatoria ? Colors.accent : Colors.info },
                  ].map(d => (
                    <View key={d.label} style={styles.detalheItem}>
                      <Text style={styles.detalheItemLabel}>{d.label}</Text>
                      <Text style={[styles.detalheItemValue, { color: d.color }]}>{d.value}</Text>
                    </View>
                  ))}
                </View>
                {detalhe.observacao ? (
                  <View style={styles.obsCard}>
                    <Ionicons name="information-circle-outline" size={16} color={Colors.info} />
                    <Text style={styles.obsText}>{detalhe.observacao}</Text>
                  </View>
                ) : null}
              </>
            )}
          </View>
        </View>
      </Modal>
    </>
  );
}

// ─── Tab: II Ciclo — organizado por Área de Formação ────────────────────────

const CATEGORIA_LABELS: Record<string, { label: string; cor: string }> = {
  formacao_geral:      { label: 'Formação Geral',      cor: Colors.info },
  formacao_especifica: { label: 'Formação Específica',  cor: '#f59e0b' },
  opcional:            { label: 'Optativas',            cor: Colors.textMuted },
};

function parseClasse(c: string | null | undefined): number {
  return parseInt((c || '').replace(/[^0-9]/g, ''), 10) || 0;
}

function TabIICiclo() {
  const cor = TAB_COLORS['II Ciclo'];
  const { config } = useConfig();
  const tem13 = (config as any).temDecimaTermeira !== false;
  const [allDiscs, setAllDiscs]     = useState<DiscII[]>([]);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [areaAtiva, setAreaAtiva]   = useState<string | null>(null);
  const areaScrollRef = useRef<ScrollView>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/disciplinas');
      if (res.ok) {
        const data = await res.json();
        setAllDiscs(Array.isArray(data) ? data : []);
      }
    } catch {
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  const onRefresh = () => { setRefreshing(true); load(); };

  // II Ciclo: activas + (classeInicio >= 10, ou sem classe mas com área definida)
  const disciplinas = allDiscs.filter(d => {
    if (!d.ativo) return false;
    if (!d.classeInicio) return !!d.area;
    return parseClasse(d.classeInicio) >= 10;
  });

  // Agrupamento: área → categoria → disciplinas
  const byArea = disciplinas.reduce<Record<string, DiscII[]>>((acc, d) => {
    const a = d.area || 'Sem Área';
    if (!acc[a]) acc[a] = [];
    acc[a].push(d);
    return acc;
  }, {});
  // "Formação Geral" / "Formação Profissional" são categorias de disciplina,
  // não áreas de formação — não devem aparecer como tabs de área.
  const CATEGORIAS_META = new Set([
    'formação geral', 'formacao geral',
    'formação profissional', 'formacao profissional',
    'formação', 'formacao',
    'sem área', 'sem area',
  ]);
  const areas = Object.keys(byArea)
    .filter(a => !CATEGORIAS_META.has(a.toLowerCase().trim()))
    .sort();

  // Garantir que areaAtiva não fica obsoleta após reload dos dados
  useEffect(() => {
    if (areaAtiva !== null && !areas.includes(areaAtiva)) {
      setAreaAtiva(null);
    }
  }, [areas.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  // Área activa validada (null = "Todas")
  const areaAtivaValida = areaAtiva !== null && areas.includes(areaAtiva) ? areaAtiva : null;

  // Navegar para a próxima área (ou "Todas" quando chega ao fim)
  const irParaProximaArea = () => {
    if (areas.length === 0) return;
    const idx = areaAtivaValida === null ? 0 : areas.indexOf(areaAtivaValida) + 1;
    setAreaAtiva(idx >= areas.length ? null : areas[idx]);
  };

  const totalDiscs = disciplinas.length;
  const totalObrig = disciplinas.filter(d => d.obrigatoria).length;
  const cargaTotal = disciplinas.reduce((s, d) => s + (d.cargaHoraria || 0), 0);

  if (loading) {
    return (
      <View style={styles.centerBox}>
        <AppLoader color={cor} size="large" />
        <Text style={styles.loadingText}>A carregar grelha...</Text>
      </View>
    );
  }

  if (disciplinas.length === 0) {
    return (
      <ScrollView
        contentContainerStyle={styles.emptyBox}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={cor} colors={[cor]} />}
      >
        <MaterialCommunityIcons name="book-open-variant" size={48} color={Colors.textMuted} />
        <Text style={styles.emptyTitle}>Sem disciplinas no II Ciclo</Text>
        <Text style={styles.emptyDesc}>
          Registe as disciplinas em Gestão Académica → Disciplinas com classe de início 10ª ou superior
          e defina a Área de Formação respectiva.
        </Text>
      </ScrollView>
    );
  }

  return (
    <ScrollView
      style={styles.scroll}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={cor} colors={[cor]} />}
    >
      {/* Enquadramento legal */}
      <View style={[styles.enquadramentoCard, { borderLeftColor: cor }]}>
        <View style={styles.enquadramentoHeader}>
          <Ionicons name="information-circle" size={20} color={cor} />
          <Text style={styles.enquadramentoTitle}>II Ciclo — 10ª a {tem13 ? '13ª' : '12ª'} Classe</Text>
        </View>
        <Text style={styles.enquadramentoDesc}>
          Segundo ciclo do Ensino Secundário. Organizado por áreas de formação especializadas.
          As disciplinas abaixo reflectem o catálogo registado no sistema para este ciclo.
        </Text>
        <View style={styles.enquadramentoLei}>
          <FontAwesome5 name="balance-scale" size={12} color={Colors.textMuted} />
          <Text style={styles.enquadramentoLeiText}>
            Lei n.º 17/16 — Plano curricular definido pela escola conforme área de formação aprovada pelo MED
          </Text>
        </View>
      </View>

      {/* Barra de navegação por Área de Formação */}
      {areas.length > 0 && (
        <View style={iiS.areaTabBar}>
          <ScrollView
            ref={areaScrollRef}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={iiS.areaTabScroll}
          >
            {/* Tab "Todas" */}
            <TouchableOpacity
              style={[iiS.areaTab, areaAtivaValida === null && iiS.areaTabTodasAtiva]}
              onPress={() => { setAreaAtiva(null); setExpandedArea(null); }}
              activeOpacity={0.75}
            >
              <MaterialCommunityIcons
                name="view-grid"
                size={11}
                color={areaAtivaValida === null ? cor : Colors.textMuted}
                style={{ marginBottom: 2 }}
              />
              <Text style={[iiS.areaTabText, areaAtivaValida === null && { color: cor }]}>Todas</Text>
            </TouchableOpacity>

            {/* Um tab por cada área */}
            {areas.map(area => {
              const isAtiva = areaAtivaValida === area;
              const acor = areaColor(area);
              const label = area.length > 18 ? area.split(' ').slice(0, 2).join(' ') : area;
              return (
                <TouchableOpacity
                  key={area}
                  style={[iiS.areaTab, isAtiva && { borderBottomColor: acor, borderBottomWidth: 2, borderBottomLeftRadius: 0, borderBottomRightRadius: 0 }]}
                  onPress={() => { setAreaAtiva(area); setExpandedArea(area); }}
                  activeOpacity={0.75}
                >
                  <View style={[iiS.areaTabDot, { backgroundColor: isAtiva ? acor : Colors.textMuted + '55' }]} />
                  <Text style={[iiS.areaTabText, isAtiva && { color: acor }]} numberOfLines={1}>{label}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Botão ">" para navegar pela próxima área */}
          <TouchableOpacity style={iiS.navBtn} onPress={irParaProximaArea} activeOpacity={0.8}>
            <Ionicons name="chevron-forward" size={15} color={Colors.text} />
          </TouchableOpacity>
        </View>
      )}

      {/* ── Vista "Todas": cartões compactos por área ─────────────────────── */}
      {areaAtivaValida === null && (
        <>
          {/* Estatísticas globais */}
          <View style={styles.statsRow}>
            {[
              { label: 'Áreas',        value: `${areas.length}`,                        color: cor },
              { label: 'Disciplinas',  value: `${totalDiscs}`,                           color: Colors.info },
              { label: 'Obrigatórias', value: `${totalObrig}`,                           color: Colors.accent },
              { label: 'Carga Total',  value: cargaTotal > 0 ? `${cargaTotal}h` : '—', color: Colors.gold },
            ].map(s => (
              <View key={s.label} style={styles.statCard}>
                <Text style={[styles.statValue, { color: s.color }]}>{s.value}</Text>
                <Text style={styles.statLabel}>{s.label}</Text>
              </View>
            ))}
          </View>

          {/* Um cartão por área — toque leva à vista detalhada */}
          {areas.map(area => {
            const discs     = (byArea[area] ?? []).slice().sort((a, b) => (a.ordem ?? 99) - (b.ordem ?? 99));
            const acor      = areaColor(area);
            const obrigArea = discs.filter(d => d.obrigatoria).length;
            const cargaArea = discs.reduce((s, d) => s + (d.cargaHoraria || 0), 0);
            const classes   = [...new Set(discs.flatMap(d => [d.classeInicio, d.classeFim].filter(Boolean)))].sort();
            return (
              <TouchableOpacity
                key={area}
                style={[iiS.areaCard, { borderLeftColor: acor }]}
                onPress={() => { setAreaAtiva(area); }}
                activeOpacity={0.8}
              >
                <View style={[iiS.areaCardIcon, { backgroundColor: acor + '20' }]}>
                  <MaterialCommunityIcons name="book-open-page-variant" size={20} color={acor} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={iiS.areaCardNome}>{area}</Text>
                  <View style={iiS.areaCardMeta}>
                    <View style={[iiS.areaCardBadge, { backgroundColor: Colors.info + '20' }]}>
                      <Text style={[iiS.areaCardBadgeTxt, { color: Colors.info }]}>
                        {discs.length} disc.
                      </Text>
                    </View>
                    {obrigArea > 0 && (
                      <View style={[iiS.areaCardBadge, { backgroundColor: Colors.accent + '20' }]}>
                        <Text style={[iiS.areaCardBadgeTxt, { color: Colors.accent }]}>
                          {obrigArea} obrig.
                        </Text>
                      </View>
                    )}
                    {cargaArea > 0 && (
                      <View style={[iiS.areaCardBadge, { backgroundColor: Colors.gold + '20' }]}>
                        <Text style={[iiS.areaCardBadgeTxt, { color: Colors.gold }]}>
                          {cargaArea}h
                        </Text>
                      </View>
                    )}
                    {classes.length > 0 && (
                      <Text style={iiS.areaCardClasses}>
                        {classes[0]}{classes.length > 1 ? ` → ${classes[classes.length - 1]}` : ''}
                      </Text>
                    )}
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
              </TouchableOpacity>
            );
          })}

          <SistemaAvaliacao />
          <View style={{ height: 32 }} />
        </>
      )}

      {/* ── Vista de área específica: tabela directa (sem acordeão) ─────── */}
      {areaAtivaValida !== null && (() => {
        const discs     = (byArea[areaAtivaValida] ?? []).slice().sort((a, b) => (a.ordem ?? 99) - (b.ordem ?? 99));
        const acor      = areaColor(areaAtivaValida);
        const obrigArea = discs.filter(d => d.obrigatoria).length;
        const cargaArea = discs.reduce((s, d) => s + (d.cargaHoraria || 0), 0);

        // Sub-agrupamento por categoriaFormacao
        const byCat    = discs.reduce<Record<string, DiscII[]>>((acc, d) => {
          const c = d.categoriaFormacao || '';
          if (!acc[c]) acc[c] = [];
          acc[c].push(d);
          return acc;
        }, {});
        const catOrder = ['formacao_geral', 'formacao_especifica', 'opcional', ''];
        const cats     = Object.keys(byCat).sort((a, b) => catOrder.indexOf(a) - catOrder.indexOf(b));

        return (
          <>
            {/* Cabeçalho da área seleccionada */}
            <View style={[iiS.areaDetalheHeader, { borderLeftColor: acor }]}>
              <View style={[iiS.areaCardIcon, { backgroundColor: acor + '20' }]}>
                <MaterialCommunityIcons name="book-open-page-variant" size={20} color={acor} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[iiS.areaCardNome, { color: acor }]}>{areaAtivaValida}</Text>
                <Text style={iiS.areaDetalheSubtitle}>
                  {discs.length} disciplina{discs.length !== 1 ? 's' : ''}
                  {obrigArea > 0 ? ` · ${obrigArea} obrigatória${obrigArea !== 1 ? 's' : ''}` : ''}
                  {cargaArea > 0 ? ` · ${cargaArea}h/semana` : ''}
                </Text>
              </View>
            </View>

            {/* Tabela directa — sem accordion */}
            <View style={iiS.block}>
              <View style={iiS.tblHead}>
                <Text style={[iiS.tblHCell, { flex: 1 }]}>Disciplina</Text>
                <Text style={[iiS.tblHCell, { width: 52 }]}>Carga</Text>
                <Text style={[iiS.tblHCell, { width: 70 }]}>Tipo</Text>
              </View>

              {cats.map(cat => {
                const catDiscs = byCat[cat];
                const catInfo  = CATEGORIA_LABELS[cat];
                return (
                  <React.Fragment key={cat || '__sem'}>
                    {catInfo && (
                      <View style={[iiS.catHead, { borderLeftColor: catInfo.cor }]}>
                        <Text style={[iiS.catLabel, { color: catInfo.cor }]}>{catInfo.label}</Text>
                        <View style={[iiS.catCount, { backgroundColor: catInfo.cor + '22' }]}>
                          <Text style={[iiS.catCountTxt, { color: catInfo.cor }]}>{catDiscs.length}</Text>
                        </View>
                      </View>
                    )}
                    {catDiscs.map((disc, i) => (
                      <View key={disc.id} style={[iiS.row, i % 2 !== 0 && styles.tableRowAlt]}>
                        <View style={{ flex: 1 }}>
                          <View style={styles.discNameRow}>
                            <View style={[styles.codBadge, { backgroundColor: acor + '22' }]}>
                              <Text style={[styles.codText, { color: acor }]}>{disc.codigo || '—'}</Text>
                            </View>
                            <Text style={styles.discNome} numberOfLines={1}>{disc.nome}</Text>
                            {disc.nuclear && (
                              <View style={iiS.nuclearBadge}>
                                <Text style={iiS.nuclearTxt}>Nuclear</Text>
                              </View>
                            )}
                          </View>
                          {(disc.classeInicio || disc.classeFim) && (
                            <Text style={styles.discObs}>
                              {disc.classeInicio === disc.classeFim
                                ? disc.classeInicio
                                : `${disc.classeInicio || '—'} → ${disc.classeFim || '—'}`}
                            </Text>
                          )}
                        </View>
                        <Text style={[styles.tableCell, { width: 52, color: Colors.textMuted }]}>
                          {disc.cargaHoraria ? `${disc.cargaHoraria}h` : '—'}
                        </Text>
                        <View style={{ width: 70, alignItems: 'center' }}>
                          <View style={[styles.tipoPill, {
                            backgroundColor: disc.obrigatoria ? Colors.accent + '20' : Colors.info + '20',
                          }]}>
                            <Text style={[styles.tipoPillText, {
                              color: disc.obrigatoria ? Colors.accent : Colors.info,
                            }]}>
                              {disc.obrigatoria ? 'Obrig.' : 'Optativa'}
                            </Text>
                          </View>
                        </View>
                      </View>
                    ))}
                  </React.Fragment>
                );
              })}

              {/* Total da área */}
              <View style={iiS.total}>
                <Text style={iiS.totalLabel}>Total · {areaAtivaValida}</Text>
                <Text style={[iiS.totalValue, { color: acor }]}>
                  {discs.length} disc.{cargaArea > 0 ? ` · ${cargaArea}h` : ''}
                </Text>
              </View>
            </View>

            <View style={{ height: 32 }} />
          </>
        );
      })()}
    </ScrollView>
  );
}

// ─── Tab: Catálogo de Disciplinas (dinâmico) ─────────────────────────────────

function TabCatalogo() {
  const cor = TAB_COLORS['Catálogo'];
  const [todasDiscs, setTodasDiscs] = useState<DiscCatalogo[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedArea, setExpandedArea] = useState<string | null>(null);
  const [mostrarInativas, setMostrarInativas] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/disciplinas');
      if (res.ok) {
        const data: DiscCatalogo[] = await res.json();
        setTodasDiscs(Array.isArray(data) ? data : []);
      }
    } catch {
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const onRefresh = () => { setRefreshing(true); load(); };

  const disciplinas = mostrarInativas ? todasDiscs : todasDiscs.filter(d => d.ativo);

  const byArea = disciplinas.reduce<Record<string, DiscCatalogo[]>>((acc, d) => {
    const a = d.area || 'Sem Área';
    if (!acc[a]) acc[a] = [];
    acc[a].push(d);
    return acc;
  }, {});

  const areas = Object.keys(byArea).sort();
  const totalInativas = todasDiscs.filter(d => !d.ativo).length;

  if (loading) {
    return (
      <View style={styles.centerBox}>
        <AppLoader color={cor} size="large" />
        <Text style={styles.loadingText}>A carregar catálogo...</Text>
      </View>
    );
  }

  if (todasDiscs.length === 0) {
    return (
      <ScrollView
        contentContainerStyle={styles.emptyBox}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={cor} colors={[cor]} />}
      >
        <MaterialCommunityIcons name="book-search-outline" size={48} color={Colors.textMuted} />
        <Text style={styles.emptyTitle}>Catálogo vazio</Text>
        <Text style={styles.emptyDesc}>Adicione disciplinas em Gestão Académica → Disciplinas.</Text>
      </ScrollView>
    );
  }

  const ativas = todasDiscs.filter(d => d.ativo).length;
  const continuidade = disciplinas.filter(d => d.tipo !== 'terminal').length;
  const terminal = disciplinas.filter(d => d.tipo === 'terminal').length;

  if (loading) return <SkeletonList rows={5} />;

  return (
    <ScrollView
      style={styles.scroll}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={cor} colors={[cor]} />}
    >
      <View style={styles.statsRow}>
        {[
          { label: 'Total',        value: `${todasDiscs.length}`, color: cor },
          { label: 'Activas',      value: `${ativas}`,            color: Colors.success },
          { label: 'Inactivas',    value: `${totalInativas}`,     color: Colors.textMuted },
          { label: 'Áreas',        value: `${areas.length}`,      color: Colors.info },
        ].map(s => (
          <View key={s.label} style={styles.statCard}>
            <Text style={[styles.statValue, { color: s.color }]}>{s.value}</Text>
            <Text style={styles.statLabel}>{s.label}</Text>
          </View>
        ))}
      </View>

      {totalInativas > 0 && (
        <TouchableOpacity
          style={styles.toggleInativasBtn}
          onPress={() => setMostrarInativas(v => !v)}
          activeOpacity={0.75}
        >
          <Ionicons
            name={mostrarInativas ? 'eye' : 'eye-off'}
            size={15}
            color={mostrarInativas ? cor : Colors.textMuted}
          />
          <Text style={[styles.toggleInativasText, { color: mostrarInativas ? cor : Colors.textMuted }]}>
            {mostrarInativas
              ? `Mostrar todas (incl. ${totalInativas} inactiva${totalInativas !== 1 ? 's' : ''})`
              : `Apenas activas — ${totalInativas} inactiva${totalInativas !== 1 ? 's' : ''} oculta${totalInativas !== 1 ? 's' : ''}`}
          </Text>
        </TouchableOpacity>
      )}

      {areas.map(area => {
        const discs = byArea[area];
        const isOpen = expandedArea === area;
        const acor = areaColor(area);
        const inativasNaArea = discs.filter(d => !d.ativo).length;
        return (
          <View key={area} style={styles.areaSection}>
            <TouchableOpacity
              style={[styles.areaHeader, { borderLeftColor: acor }]}
              onPress={() => setExpandedArea(isOpen ? null : area)}
              activeOpacity={0.75}
            >
              <View style={[styles.areaIconWrap, { backgroundColor: acor + '22' }]}>
                <MaterialCommunityIcons name="book-open-page-variant" size={18} color={acor} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.areaNome}>{area}</Text>
                <Text style={styles.areaCount}>
                  {discs.length} disciplina{discs.length !== 1 ? 's' : ''}
                  {inativasNaArea > 0 ? ` · ${inativasNaArea} inactiva${inativasNaArea !== 1 ? 's' : ''}` : ''}
                </Text>
              </View>
              <Ionicons name={isOpen ? 'chevron-up' : 'chevron-down'} size={18} color={Colors.textMuted} />
            </TouchableOpacity>

            {isOpen && discs.map((d, i) => (
              <View key={d.id} style={[styles.catalogoRow, i % 2 !== 0 && styles.tableRowAlt, !d.ativo && styles.catalogoRowInativa]}>
                <View style={[styles.codBadge, { backgroundColor: (d.ativo ? acor : Colors.textMuted) + '22' }]}>
                  <Text style={[styles.codText, { color: d.ativo ? acor : Colors.textMuted }]}>{d.codigo || '—'}</Text>
                </View>
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={[styles.discNome, !d.ativo && { color: Colors.textMuted }]}>{d.nome}</Text>
                    {!d.ativo && (
                      <View style={styles.inativaBadge}>
                        <Text style={styles.inativaBadgeText}>Inactiva</Text>
                      </View>
                    )}
                  </View>
                  {(d.classeInicio || d.classeFim) ? (
                    <Text style={styles.discObs}>
                      {d.classeInicio === d.classeFim
                        ? d.classeInicio
                        : `${d.classeInicio || '—'} → ${d.classeFim || '—'}`}
                    </Text>
                  ) : null}
                </View>
                <View style={[
                  styles.tipoPill,
                  { backgroundColor: d.tipo === 'terminal' ? Colors.warning + '20' : Colors.success + '20', opacity: d.ativo ? 1 : 0.5 },
                ]}>
                  <Text style={[
                    styles.tipoPillText,
                    { color: d.tipo === 'terminal' ? Colors.warning : Colors.success },
                  ]}>
                    {d.tipo === 'terminal' ? 'Terminal' : 'Continuidade'}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        );
      })}

      <View style={{ height: 32 }} />
    </ScrollView>
  );
}

// ─── Screen principal ────────────────────────────────────────────────────────

export default function GrelhaScreen() {
  const [tabAtiva, setTabAtiva] = useTabMemory<Tab>('grelha', 'Primário');
  const insets = useSafeAreaInsets();
  const { config } = useConfig();
  const tem13 = (config as any).temDecimaTermeira !== false;

  return (
    <View style={styles.container}>
      <TopBar title="Grelha Curricular" subtitle="Sistema Educativo Angolano — Lei 17/16" />

      <View style={styles.nivelTabs}>
        {TABS.map(tab => {
          const isActive = tabAtiva === tab;
          const cor = TAB_COLORS[tab];
          return (
            <TouchableOpacity
              key={tab}
              style={[styles.nivelTab, isActive && { borderBottomColor: cor, borderBottomWidth: 3 }]}
              onPress={() => setTabAtiva(tab)}
            >
              <Text style={[styles.nivelTabText, isActive && { color: cor }]}>{tab}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {tabAtiva === 'Primário' && (
        <TabRefLei
          nivel="Primário"
          classes="1ª — 6ª Classe"
          descricao="Ensino Primário obrigatório (6 anos). Foco no desenvolvimento de competências básicas de leitura, escrita e cálculo."
          cor={TAB_COLORS['Primário']}
          disciplinas={PRIMARIO}
        />
      )}
      {tabAtiva === 'I Ciclo' && (
        <TabRefLei
          nivel="I Ciclo"
          classes="7ª — 9ª Classe"
          descricao="Primeiro ciclo do Ensino Secundário (3 anos). Aprofundamento das ciências e humanidades com base multidisciplinar."
          cor={TAB_COLORS['I Ciclo']}
          disciplinas={I_CICLO}
        />
      )}
      {tabAtiva === 'II Ciclo' && <TabIICiclo />}
      {tabAtiva === 'Catálogo' && <TabCatalogo />}
    </View>
  );
}

// ─── Estilos ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container:      { flex: 1, backgroundColor: Colors.background },
  nivelTabs:      { flexDirection: 'row', backgroundColor: Colors.primaryDark, borderBottomWidth: 1, borderBottomColor: Colors.border },
  nivelTab:       { flex: 1, paddingVertical: 13, alignItems: 'center', borderBottomWidth: 3, borderBottomColor: 'transparent' },
  nivelTabText:   { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: Colors.textSecondary },
  scroll:         { flex: 1 },

  enquadramentoCard:     { margin: 16, backgroundColor: Colors.backgroundCard, borderRadius: 14, padding: 16, borderLeftWidth: 4 },
  enquadramentoHeader:   { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  enquadramentoTitle:    { fontSize: 13, fontFamily: 'Inter_700Bold', color: Colors.text },
  enquadramentoClasses:  { fontSize: 15, fontFamily: 'Inter_600SemiBold', color: Colors.text, marginBottom: 6 },
  enquadramentoDesc:     { fontSize: 13, fontFamily: 'Inter_400Regular', color: Colors.textSecondary, lineHeight: 20, marginBottom: 10 },
  enquadramentoLei:      { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  enquadramentoLeiText:  { flex: 1, fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted, fontStyle: 'italic', lineHeight: 16 },

  statsRow:   { flexDirection: 'row', paddingHorizontal: 16, gap: 8, marginBottom: 16 },
  statCard:   { flex: 1, backgroundColor: Colors.backgroundCard, borderRadius: 12, padding: 10, alignItems: 'center' },
  statValue:  { fontSize: 20, fontFamily: 'Inter_700Bold' },
  statLabel:  { fontSize: 9, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 2, textAlign: 'center' },

  sectionTitle:     { fontSize: 11, fontFamily: 'Inter_600SemiBold', color: Colors.textMuted, paddingHorizontal: 16, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 },
  tableHeader:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8, backgroundColor: Colors.surface },
  tableHeaderText:  { fontSize: 11, fontFamily: 'Inter_600SemiBold', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.8, textAlign: 'center' },
  tableRow:         { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.border },
  tableRowAlt:      { backgroundColor: 'rgba(26,43,95,0.3)' },
  totalRow:         { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: Colors.surface },
  totalLabel:       { flex: 1, fontSize: 14, fontFamily: 'Inter_700Bold', color: Colors.text },
  totalValue:       { fontSize: 14, fontFamily: 'Inter_700Bold', textAlign: 'center' },

  discNameRow:  { flexDirection: 'row', alignItems: 'center', gap: 8 },
  codBadge:     { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
  codText:      { fontSize: 10, fontFamily: 'Inter_700Bold' },
  discNome:     { flex: 1, fontSize: 14, fontFamily: 'Inter_500Medium', color: Colors.text },
  discObs:      { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.info, marginTop: 2, marginLeft: 50 },
  tableCell:    { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: Colors.text, textAlign: 'center' },
  optBadge:     { borderWidth: 1, borderRadius: 5, paddingHorizontal: 5, paddingVertical: 1 },
  optBadgeText: { fontSize: 9, fontFamily: 'Inter_500Medium', color: Colors.info },

  tipoPill:     { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 3 },
  tipoPillText: { fontSize: 9, fontFamily: 'Inter_600SemiBold' },

  sistemaNota:     { margin: 16, backgroundColor: Colors.backgroundCard, borderRadius: 14, padding: 16 },
  sistemaHeader:   { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  sistemaNoteTitle:{ fontSize: 14, fontFamily: 'Inter_700Bold', color: Colors.text },
  sistemaRow:      { gap: 8 },
  sistemaItem:     { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.border },
  sistemaItemLabel:{ fontSize: 13, fontFamily: 'Inter_400Regular', color: Colors.textSecondary },
  sistemaItemValue:{ fontSize: 13, fontFamily: 'Inter_700Bold', color: Colors.gold },
  macInfo:         { marginTop: 12, backgroundColor: Colors.surface, borderRadius: 8, padding: 10 },
  macLabel:        { fontSize: 12, fontFamily: 'Inter_500Medium', color: Colors.textSecondary, textAlign: 'center' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  modalBox:     { backgroundColor: Colors.backgroundCard, borderRadius: 24, padding: 24, width: '100%', maxWidth: 480 },
  modalHeader:  { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 20 },
  modalTitle:   { fontSize: 17, fontFamily: 'Inter_700Bold', color: Colors.text },
  modalSub:     { fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 2 },
  modalClose:   { padding: 4 },
  codBadgeLg:   { width: 44, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  codTextLg:    { fontSize: 14, fontFamily: 'Inter_700Bold' },
  detalheGrid:  { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 16 },
  detalheItem:  { width: '47%', backgroundColor: Colors.surface, borderRadius: 12, padding: 14 },
  detalheItemLabel: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginBottom: 4 },
  detalheItemValue: { fontSize: 18, fontFamily: 'Inter_700Bold' },
  obsCard:  { flexDirection: 'row', gap: 8, backgroundColor: Colors.surface, borderRadius: 10, padding: 12, alignItems: 'flex-start' },
  obsText:  { flex: 1, fontSize: 13, fontFamily: 'Inter_400Regular', color: Colors.info },

  cursoTabs:     { paddingHorizontal: 16, paddingBottom: 12, gap: 8 },
  cursoTab:      { minWidth: 120, maxWidth: 160, backgroundColor: Colors.backgroundCard, borderRadius: 12, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: Colors.border },
  cursoTabCode:  { fontSize: 11, fontFamily: 'Inter_700Bold', marginBottom: 4 },
  cursoTabNome:  { fontSize: 11, fontFamily: 'Inter_500Medium', color: Colors.textSecondary, textAlign: 'center' },

  cursoInfoCard: { marginHorizontal: 16, marginBottom: 12, backgroundColor: Colors.backgroundCard, borderRadius: 12, padding: 14, borderLeftWidth: 4 },
  cursoInfoArea: { fontSize: 11, fontFamily: 'Inter_600SemiBold', marginBottom: 4 },
  cursoInfoNome: { fontSize: 16, fontFamily: 'Inter_700Bold', color: Colors.text, marginBottom: 4 },
  cursoInfoDesc: { fontSize: 13, fontFamily: 'Inter_400Regular', color: Colors.textSecondary, lineHeight: 20 },

  areaSection: { marginHorizontal: 16, marginBottom: 8 },
  areaHeader:  { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: Colors.backgroundCard, borderRadius: 12, padding: 14, borderLeftWidth: 4 },
  areaIconWrap:{ width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  areaNome:    { fontSize: 14, fontFamily: 'Inter_600SemiBold', color: Colors.text },
  areaCount:   { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 2 },
  catalogoRow:        { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.border + '60' },
  catalogoRowInativa: { opacity: 0.6 },

  toggleInativasBtn:  { flexDirection: 'row', alignItems: 'center', gap: 6, marginHorizontal: 16, marginBottom: 12, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: Colors.backgroundCard, borderRadius: 10, borderWidth: 1, borderColor: Colors.border },
  toggleInativasText: { fontSize: 12, fontFamily: 'Inter_500Medium' },

  inativaBadge:     { backgroundColor: Colors.textMuted + '25', borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2 },
  inativaBadgeText: { fontSize: 9, fontFamily: 'Inter_600SemiBold', color: Colors.textMuted },

  centerBox:   { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { fontSize: 14, fontFamily: 'Inter_400Regular', color: Colors.textMuted },
  emptyBox:    { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32 },
  emptyTitle:  { fontSize: 16, fontFamily: 'Inter_600SemiBold', color: Colors.textSecondary },
  emptyDesc:   { fontSize: 13, fontFamily: 'Inter_400Regular', color: Colors.textMuted, textAlign: 'center', lineHeight: 20 },
  emptyInline: { alignItems: 'center', paddingVertical: 32, gap: 10 },
  emptyInlineText: { fontSize: 13, fontFamily: 'Inter_400Regular', color: Colors.textMuted, textAlign: 'center', lineHeight: 20 },
});

// Estilos exclusivos do TabIICiclo
const iiS = StyleSheet.create({
  block:       { backgroundColor: Colors.backgroundCard, borderBottomLeftRadius: 12, borderBottomRightRadius: 12, overflow: 'hidden', marginTop: 1 },
  tblHead:     { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 6, backgroundColor: Colors.surface },
  tblHCell:    { fontSize: 10, fontFamily: 'Inter_600SemiBold', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.8, textAlign: 'center' },
  catHead:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 6, backgroundColor: Colors.surface + 'cc', borderLeftWidth: 3 },
  catLabel:    { fontSize: 10, fontFamily: 'Inter_700Bold', textTransform: 'uppercase', letterSpacing: 1 },
  catCount:    { borderRadius: 5, paddingHorizontal: 7, paddingVertical: 2 },
  catCountTxt: { fontSize: 10, fontFamily: 'Inter_700Bold' },
  row:         { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.border + '50' },
  nuclearBadge:{ backgroundColor: Colors.gold + '25', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 },
  nuclearTxt:  { fontSize: 8, fontFamily: 'Inter_700Bold', color: Colors.gold },
  total:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 9, backgroundColor: Colors.surface },
  totalLabel:  { fontSize: 11, fontFamily: 'Inter_600SemiBold', color: Colors.textMuted },
  totalValue:  { fontSize: 11, fontFamily: 'Inter_700Bold' },

  // Barra de navegação por área de formação
  areaTabBar:       { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.primaryDark, borderBottomWidth: 1, borderBottomColor: Colors.border },
  areaTabScroll:    { flexDirection: 'row', paddingHorizontal: 8, paddingVertical: 6, gap: 4 },
  areaTab:          { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, borderBottomWidth: 2, borderBottomColor: 'transparent', gap: 2 },
  areaTabTodasAtiva:{ backgroundColor: Colors.gold + '18', borderBottomColor: Colors.gold, borderBottomWidth: 2, borderBottomLeftRadius: 0, borderBottomRightRadius: 0 },
  areaTabText:      { fontSize: 10, fontFamily: 'Inter_600SemiBold', color: Colors.textMuted },
  areaTabDot:       { width: 5, height: 5, borderRadius: 3 },
  navBtn:           {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: Colors.backgroundCard,
    borderWidth: 1, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center',
    marginRight: 10, marginLeft: 4,
  },

  // Cartão compacto de área (vista "Todas")
  areaCard:         { flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: 16, marginBottom: 8, backgroundColor: Colors.backgroundCard, borderRadius: 12, padding: 14, borderLeftWidth: 4 },
  areaCardIcon:     { width: 36, height: 36, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  areaCardNome:     { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: Colors.text, marginBottom: 5 },
  areaCardMeta:     { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 5 },
  areaCardBadge:    { borderRadius: 5, paddingHorizontal: 7, paddingVertical: 2 },
  areaCardBadgeTxt: { fontSize: 10, fontFamily: 'Inter_600SemiBold' },
  areaCardClasses:  { fontSize: 10, fontFamily: 'Inter_400Regular', color: Colors.textMuted },

  // Cabeçalho da vista de área individual
  areaDetalheHeader:   { flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: 16, marginTop: 4, marginBottom: 8, backgroundColor: Colors.backgroundCard, borderRadius: 12, padding: 14, borderLeftWidth: 4 },
  areaDetalheSubtitle: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 2 },
});
