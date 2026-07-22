import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, RefreshControl, Image, Platform } from 'react-native';
import { Ionicons, MaterialCommunityIcons, FontAwesome5 } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Colors } from '@/constants/colors';
import { SkeletonList } from '@/components/Skeleton';
import { useAuth } from '@/context/AuthContext';
import { useAnoAcademico } from '@/context/AnoAcademicoContext';
import { useConfig } from '@/context/ConfigContext';
import { api } from '@/lib/api';
import TopBar from '@/components/TopBar';
import { StableSearchInput } from '@/components/StableSearchInput';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Finalista {
  id: string;
  numeroMatricula: string;
  nome: string;
  apelido: string;
  dataNascimento: string;
  genero: 'M' | 'F';
  foto?: string;
  turmaId: string;
  turmaNome: string;
  classe: string;
  turno: string;
  anoLetivo: string;
  cursoId?: string;
  cursoNome?: string;
  cursoCodigo?: string;
  areaFormacao?: string;
  nomeEncarregado?: string;
  telefoneEncarregado?: string;
}

interface GrupoCurso {
  cursoId: string | null;
  cursoNome: string;
  cursoCodigo: string;
  areaFormacao: string;
  alunos: Finalista[];
}

interface FinalistasData {
  total: number;
  grupos: GrupoCurso[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const CURSO_PALETTE = [
  '#4A90D9', '#22C47A', '#C89A2A', '#D94F4F',
  '#8B5CF6', '#F59E0B', '#3E9BD4', '#10B981',
  '#EF4444', '#6366F1', '#F97316', '#14B8A6',
];

function cursoColor(nome: string): string {
  let hash = 0;
  for (let i = 0; i < nome.length; i++) hash = nome.charCodeAt(i) + ((hash << 5) - hash);
  return CURSO_PALETTE[Math.abs(hash) % CURSO_PALETTE.length];
}

function calcIdade(dataNascimento: string): number {
  const diff = Date.now() - new Date(dataNascimento).getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24 * 365.25));
}

function initials(nome: string, apelido: string): string {
  return ((nome?.[0] ?? '') + (apelido?.[0] ?? '')).toUpperCase();
}

function normalize(str: string) {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

// ─── Student Card ────────────────────────────────────────────────────────────

function FinalistaCard({ aluno, color }: { aluno: Finalista; color: string }) {
  const idade = aluno.dataNascimento ? calcIdade(aluno.dataNascimento) : null;

  return (
    <View style={styles.card}>
      <View style={styles.cardLeft}>
        {aluno.foto ? (
          <Image source={{ uri: aluno.foto }} style={[styles.avatar, { borderColor: color }]} />
        ) : (
          <View style={[styles.avatarPlaceholder, { backgroundColor: color + '25', borderColor: color }]}>
            <Text style={[styles.avatarInitials, { color }]}>{initials(aluno.nome, aluno.apelido)}</Text>
          </View>
        )}
        <View style={[styles.finalistaBadge, { backgroundColor: color }]}>
          <MaterialCommunityIcons name="school" size={9} color="#fff" />
        </View>
      </View>

      <View style={styles.cardBody}>
        <View style={styles.cardNameRow}>
          <Text style={styles.cardName} numberOfLines={1}>
            {aluno.nome} {aluno.apelido}
          </Text>
          <View style={[styles.genBadge, { backgroundColor: aluno.genero === 'F' ? '#EC4899' + '25' : '#4A90D9' + '25' }]}>
            <Text style={[styles.genText, { color: aluno.genero === 'F' ? '#EC4899' : '#4A90D9' }]}>
              {aluno.genero === 'F' ? 'F' : 'M'}
            </Text>
          </View>
        </View>

        <Text style={styles.cardMatricula}>Nº {aluno.numeroMatricula}</Text>

        <View style={styles.cardMeta}>
          <View style={styles.metaChip}>
            <Ionicons name="people" size={11} color={Colors.textSecondary} />
            <Text style={styles.metaText}>{aluno.turmaNome}</Text>
          </View>
          <View style={styles.metaChip}>
            <Ionicons name="time" size={11} color={Colors.textSecondary} />
            <Text style={styles.metaText}>{aluno.turno}</Text>
          </View>
          {idade !== null && (
            <View style={styles.metaChip}>
              <Ionicons name="calendar" size={11} color={Colors.textSecondary} />
              <Text style={styles.metaText}>{idade} anos</Text>
            </View>
          )}
        </View>
      </View>
    </View>
  );
}

// ─── Course Group ─────────────────────────────────────────────────────────────

function GrupoCard({ grupo, searchQuery }: { grupo: GrupoCurso; searchQuery: string }) {
  const [expanded, setExpanded] = useState(true);
  const color = cursoColor(grupo.cursoNome);

  const filtered = useMemo(() => {
    if (!searchQuery) return grupo.alunos;
    const q = normalize(searchQuery);
    return grupo.alunos.filter(a =>
      normalize(`${a.nome} ${a.apelido}`).includes(q) ||
      normalize(a.numeroMatricula || '').includes(q) ||
      normalize(a.turmaNome || '').includes(q)
    );
  }, [grupo.alunos, searchQuery]);

  if (filtered.length === 0 && searchQuery) return null;

  const masc = filtered.filter(a => a.genero === 'M').length;
  const fem = filtered.filter(a => a.genero === 'F').length;

  return (
    <View style={styles.grupo}>
      <TouchableOpacity
        style={[styles.grupoHeader, { borderLeftColor: color }]}
        onPress={() => setExpanded(e => !e)}
        activeOpacity={0.8}
      >
        <View style={[styles.grupoIconWrap, { backgroundColor: color + '20' }]}>
          <MaterialCommunityIcons name="book-education" size={20} color={color} />
        </View>
        <View style={styles.grupoInfo}>
          <View style={styles.grupoTitleRow}>
            <Text style={styles.grupoTitle}>{grupo.cursoNome}</Text>
            {grupo.cursoCodigo ? (
              <View style={[styles.codigoChip, { backgroundColor: color + '25', borderColor: color + '60' }]}>
                <Text style={[styles.codigoText, { color }]}>{grupo.cursoCodigo}</Text>
              </View>
            ) : null}
          </View>
          {grupo.areaFormacao ? (
            <Text style={styles.areaText}>{grupo.areaFormacao}</Text>
          ) : null}
          <View style={styles.grupoStats}>
            <View style={styles.statPill}>
              <MaterialCommunityIcons name="account-school" size={12} color={color} />
              <Text style={[styles.statPillText, { color }]}>{filtered.length} finalistas</Text>
            </View>
            {masc > 0 && (
              <View style={styles.statPill}>
                <Text style={styles.statPillText}>👨 {masc}</Text>
              </View>
            )}
            {fem > 0 && (
              <View style={styles.statPill}>
                <Text style={styles.statPillText}>👩 {fem}</Text>
              </View>
            )}
          </View>
        </View>
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={18}
          color={Colors.textSecondary}
        />
      </TouchableOpacity>

      {expanded && (
        <View style={styles.grupoBody}>
          {filtered.map(aluno => (
            <FinalistaCard key={aluno.id} aluno={aluno} color={color} />
          ))}
        </View>
      )}
    </View>
  );
}

// ─── Main Screen ─────────────────────────────────────────────────────────────

export default function FinalistasScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const { anoAtivo, anoSelecionado } = useAnoAcademico();
  const { config } = useConfig();
  const tem13 = (config as any).temDecimaTermeira !== false;

  const [data, setData] = useState<FinalistasData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filterAno, setFilterAno] = useState<string>('');

  const anoEfetivo = (anoSelecionado || anoAtivo)?.ano ?? '';

  const load = useCallback(async (ano?: string) => {
    try {
      setError(null);
      const params = ano ? `?anoLetivo=${encodeURIComponent(ano)}` : '';
      const result = await api.get<FinalistasData>(`/api/finalistas${params}`);
      setData(result);
    } catch (e: any) {
      setError(e?.message || 'Erro ao carregar finalistas');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load(filterAno || anoEfetivo || '');
  }, [load, filterAno, anoEfetivo]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load(filterAno || anoEfetivo || '');
  }, [load, filterAno, anoEfetivo]);

  const visibleGrupos = useMemo(() => {
    if (!data) return [];
    if (!search) return data.grupos;
    const q = normalize(search);
    return data.grupos.map(g => ({
      ...g,
      alunos: g.alunos.filter(a =>
        normalize(`${a.nome} ${a.apelido}`).includes(q) ||
        normalize(a.numeroMatricula || '').includes(q) ||
        normalize(a.turmaNome || '').includes(q)
      ),
    })).filter(g => g.alunos.length > 0 || normalize(g.cursoNome).includes(q));
  }, [data, search]);

  const totalVisible = useMemo(() => visibleGrupos.reduce((s, g) => s + g.alunos.length, 0), [visibleGrupos]);
  const totalMasc = useMemo(() => visibleGrupos.reduce((s, g) => s + g.alunos.filter(a => a.genero === 'M').length, 0), [visibleGrupos]);
  const totalFem = useMemo(() => visibleGrupos.reduce((s, g) => s + g.alunos.filter(a => a.genero === 'F').length, 0), [visibleGrupos]);

  const paddingBottom = Platform.OS === 'web' ? 40 : insets.bottom + 24;

  return (
    <View style={styles.container}>
      <TopBar title="Estudantes Finalistas" />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.accent} />}
      >
        {/* Header Banner */}
        <LinearGradient
          colors={['#1A334F', '#0D1F35']}
          style={styles.banner}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <View style={styles.bannerIconWrap}>
            <MaterialCommunityIcons name="school" size={32} color={Colors.gold} />
          </View>
          <View style={styles.bannerText}>
            <Text style={styles.bannerTitle}>Estudantes Finalistas</Text>
            <Text style={styles.bannerSubtitle}>
              {tem13 ? '13ª Classe' : 'Finalistas'} — ano lectivo {filterAno || anoEfetivo || '—'}
            </Text>
          </View>
          <View style={[styles.finalistaBannerBadge]}>
            <FontAwesome5 name="graduation-cap" size={14} color={Colors.gold} />
            <Text style={styles.bannerBadgeText}>FINALISTAS</Text>
          </View>
        </LinearGradient>

        {/* Summary Stats */}
        {data && (
          <View style={styles.statsRow}>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{totalVisible}</Text>
              <Text style={styles.statLabel}>Total</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={[styles.statValue, { color: '#4A90D9' }]}>{totalMasc}</Text>
              <Text style={styles.statLabel}>Masculino</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={[styles.statValue, { color: '#EC4899' }]}>{totalFem}</Text>
              <Text style={styles.statLabel}>Feminino</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={[styles.statValue, { color: Colors.gold }]}>{visibleGrupos.length}</Text>
              <Text style={styles.statLabel}>Cursos</Text>
            </View>
          </View>
        )}

        {/* Search Bar */}
        <View style={styles.searchWrap}>
          <StableSearchInput
            value={search}
            onChangeText={setSearch}
            inputStyle={styles.searchInput}
            placeholder="Pesquisar por nome, número ou turma…"
            iconColor={Colors.textMuted}
          />
        </View>

        {/* Content */}
        {loading ? (
          <View style={{ padding: 12 }}>
            <SkeletonList rows={6} withAvatar />
          </View>
        ) : error ? (
          <View style={styles.center}>
            <MaterialCommunityIcons name="alert-circle-outline" size={40} color={Colors.danger} />
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={() => load(filterAno || anoEfetivo || '')}>
              <Text style={styles.retryText}>Tentar novamente</Text>
            </TouchableOpacity>
          </View>
        ) : visibleGrupos.length === 0 ? (
          <View style={styles.center}>
            <MaterialCommunityIcons name="school-outline" size={52} color={Colors.textMuted} />
            <Text style={styles.emptyTitle}>
              {search ? 'Nenhum resultado encontrado' : 'Nenhum finalista encontrado'}
            </Text>
            <Text style={styles.emptySubtitle}>
              {search
                ? 'Tente com outro nome ou número'
                : tem13 ? 'Os finalistas são alunos matriculados na 13ª Classe' : 'Nenhum finalista encontrado para este ano lectivo'}
            </Text>
          </View>
        ) : (
          visibleGrupos.map(grupo => (
            <GrupoCard key={grupo.cursoNome} grupo={grupo} searchQuery={search} />
          ))
        )}
      </ScrollView>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scroll: { flex: 1 },
  content: {
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 12,
  },

  // Banner
  banner: {
    borderRadius: 16,
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: Colors.gold + '30',
  },
  bannerIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: Colors.gold + '20',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bannerText: { flex: 1 },
  bannerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 2,
  },
  bannerSubtitle: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
  finalistaBannerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.gold + '20',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: Colors.gold + '50',
  },
  bannerBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.gold,
    letterSpacing: 0.5,
  },

  // Stats
  statsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  statCard: {
    flex: 1,
    backgroundColor: Colors.backgroundCard,
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  statValue: {
    fontSize: 22,
    fontWeight: '700',
    color: Colors.text,
  },
  statLabel: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 2,
  },

  // Search
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.backgroundCard,
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 44,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 8,
  },
  searchIcon: {},
  searchInput: {
    flex: 1,
    color: Colors.text,
    fontSize: 14,
    height: '100%',
  },

  // Group
  grupo: {
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.backgroundCard,
  },
  grupoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderLeftWidth: 4,
    gap: 12,
  },
  grupoIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  grupoInfo: { flex: 1, gap: 4 },
  grupoTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  grupoTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.text,
  },
  codigoChip: {
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderWidth: 1,
  },
  codigoText: {
    fontSize: 11,
    fontWeight: '700',
  },
  areaText: {
    fontSize: 11,
    color: Colors.textSecondary,
  },
  grupoStats: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 2,
  },
  statPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.border,
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  statPillText: {
    fontSize: 11,
    color: Colors.textSecondary,
  },

  // Group Body / Cards
  grupoBody: {
    paddingHorizontal: 12,
    paddingBottom: 12,
    gap: 8,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.backgroundElevated,
    borderRadius: 12,
    padding: 12,
    gap: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cardLeft: {
    position: 'relative',
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
  },
  avatarPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitials: {
    fontSize: 15,
    fontWeight: '700',
  },
  finalistaBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: Colors.backgroundCard,
  },
  cardBody: { flex: 1, gap: 3 },
  cardNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  cardName: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text,
    flex: 1,
  },
  genBadge: {
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  genText: {
    fontSize: 10,
    fontWeight: '700',
  },
  cardMatricula: {
    fontSize: 11,
    color: Colors.textSecondary,
  },
  cardMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 2,
  },
  metaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  metaText: {
    fontSize: 11,
    color: Colors.textSecondary,
  },

  // States
  center: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    gap: 10,
  },
  loadingText: {
    color: Colors.textSecondary,
    fontSize: 14,
    marginTop: 8,
  },
  errorText: {
    color: Colors.danger,
    fontSize: 14,
    textAlign: 'center',
    maxWidth: 280,
  },
  retryBtn: {
    marginTop: 6,
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: Colors.accent,
    borderRadius: 10,
  },
  retryText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.textSecondary,
    marginTop: 8,
  },
  emptySubtitle: {
    fontSize: 13,
    color: Colors.textMuted,
    textAlign: 'center',
    maxWidth: 280,
  },
});
