import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal, RefreshControl, Platform, Image, useWindowDimensions } from 'react-native';
import AppLoader from '@/components/AppLoader';
import { Ionicons, MaterialCommunityIcons, FontAwesome5 } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '@/constants/colors';
import { SkeletonList } from '@/components/Skeleton';
import { useAuth } from '@/context/AuthContext';
import { useData } from '@/context/DataContext';
import { useAnoAcademico } from '@/context/AnoAcademicoContext';
import { useConfig } from '@/context/ConfigContext';
import { api } from '@/lib/api';
import TopBar from '@/components/TopBar';
import { webAlert } from '@/utils/webAlert';

// ─── Types ────────────────────────────────────────────────────────────────────

interface QuadroEntry {
  id: string;
  alunoId: string;
  alunoNome: string;
  alunoNomeCompleto?: string;
  numeroMatricula?: string;
  foto?: string;
  turmaId: string;
  turmaNome: string;
  classe?: string;
  cursoId?: string;
  cursoNome?: string;
  anoLetivo: string;
  trimestre?: number;
  mediaGeral: number;
  posicaoClasse: number;
  posicaoGeral?: number;
  melhorEscola: boolean;
  melhorCurso?: boolean;
  mencionado: string;
  publicado: boolean;
  geradoPor: string;
  createdAt: string;
}

interface Turma { id: string; nome: string; classe: string; }

// ─── Constants ────────────────────────────────────────────────────────────────

const MENCAO_CONFIG: Record<string, { label: string; color: string; bg: string; icon: string }> = {
  excelencia: { label: 'Excelência', color: '#FFD700', bg: '#FFD70025', icon: 'trophy' },
  louvor:     { label: 'Louvor',     color: Colors.gold, bg: Colors.gold + '20', icon: 'star' },
  honra:      { label: 'Honra',      color: Colors.info,  bg: Colors.info + '20',  icon: 'ribbon' },
  '':         { label: 'Destaque',   color: Colors.textSecondary, bg: Colors.border, icon: 'account-star' },
};

const TRIMESTRE_LABELS: Record<number, string> = { 1: '1º Trimestre', 2: '2º Trimestre', 3: '3º Trimestre' };

function medaColor(m: number) {
  if (m >= 18) return '#FFD700';
  if (m >= 15) return Colors.gold;
  if (m >= 14) return Colors.success;
  if (m >= 10) return Colors.info;
  return Colors.danger;
}

function posicaoLabel(p: number) {
  if (p === 1) return '🥇';
  if (p === 2) return '🥈';
  if (p === 3) return '🥉';
  return `${p}º`;
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function QuadroHonraScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { user } = useAuth();
  const { anoAtivo } = useAnoAcademico();
  const { turmas: allTurmas } = useData();
  const { config } = useConfig();
  const notaMinimaHonra = (config as any).notaMinimaHonra ?? 14;

  const [entries, setEntries] = useState<QuadroEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [generating, setGenerating] = useState(false);

  const [filtroTrimestre, setFiltroTrimestre] = useState<number | null>(null);
  const [filtroTurma, setFiltroTurma] = useState('');
  const [viewMode, setViewMode] = useState<'geral' | 'classe' | 'curso'>('geral');
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  const anoLetivo = anoAtivo?.ano || '';
  const turmas: Turma[] = (allTurmas || []) as Turma[];

  // ── Fetch ──────────────────────────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    if (!anoLetivo) return;
    setLoading(true);
    try {
      let url = `/api/quadro-honra?anoLetivo=${encodeURIComponent(anoLetivo)}`;
      if (filtroTrimestre !== null) url += `&trimestre=${filtroTrimestre}`;
      if (filtroTurma) url += `&turmaId=${filtroTurma}`;
      const data = await api.get<QuadroEntry[]>(url);
      setEntries(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [anoLetivo, filtroTrimestre, filtroTurma]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const onRefresh = () => { setRefreshing(true); fetchData(); };

  // ── Generate Honor Roll ─────────────────────────────────────────────────────

  const handleGenerate = async () => {
    setShowConfirmModal(false);
    setGenerating(true);
    try {
      const result = await api.post<{ gerados: number }>('/api/quadro-honra/gerar', {
        anoLetivo,
        trimestre: filtroTrimestre,
        geradoPor: user?.nome || 'Sistema',
      });
      if ((result?.gerados ?? 0) > 0) {
        webAlert('Quadro de Honra Gerado', `${result.gerados} aluno(s) classificado(s) com sucesso.`);
      } else {
        webAlert('Sem Dados', 'Não há notas suficientes para gerar o quadro neste período.');
      }
      fetchData();
    } catch (e) {
      webAlert('Erro', (e as Error).message || 'Não foi possível gerar o quadro.');
    } finally {
      setGenerating(false);
    }
  };

  const handleDelete = () => {
    webAlert(
      'Limpar Quadro de Honra',
      `Tem a certeza que deseja eliminar o quadro de honra de ${anoLetivo}${filtroTrimestre ? ` — ${TRIMESTRE_LABELS[filtroTrimestre]}` : ''}?`,
      [
        { text: 'Cancelar' },
        {
          text: 'Eliminar', style: 'destructive',
          onPress: async () => {
            try {
              let url = `/api/quadro-honra?anoLetivo=${encodeURIComponent(anoLetivo)}`;
              if (filtroTrimestre !== null) url += `&trimestre=${filtroTrimestre}`;
              await api.delete(url);
              fetchData();
            } catch (e) { webAlert('Erro', (e as Error).message); }
          },
        },
      ]
    );
  };

  // ── Derived data ────────────────────────────────────────────────────────────

  const melhorEscola = useMemo(() => entries.find(e => e.melhorEscola), [entries]);

  const porClasse = useMemo(() => {
    const map: Record<string, QuadroEntry[]> = {};
    for (const e of entries) {
      const key = e.turmaNome;
      if (!map[key]) map[key] = [];
      map[key].push(e);
    }
    for (const k in map) map[k].sort((a, b) => a.posicaoClasse - b.posicaoClasse);
    return map;
  }, [entries]);

  const porCurso = useMemo(() => {
    const map: Record<string, QuadroEntry[]> = {};
    for (const e of entries) {
      if (!e.cursoNome) continue;
      const key = e.cursoNome;
      if (!map[key]) map[key] = [];
      map[key].push(e);
    }
    for (const k in map) map[k].sort((a, b) => (a.posicaoGeral ?? 999) - (b.posicaoGeral ?? 999));
    return map;
  }, [entries]);

  const melhorDeCadaClasse = useMemo(() =>
    entries.filter(e => e.posicaoClasse === 1).sort((a, b) => (a.posicaoGeral ?? 999) - (b.posicaoGeral ?? 999)),
  [entries]);

  const temCursos = useMemo(() => Object.keys(porCurso).length > 0, [porCurso]);
  const isCompact = width < 390;

  const entriesGeralSorted = useMemo(() =>
    [...entries].sort((a, b) => (a.posicaoGeral ?? 999) - (b.posicaoGeral ?? 999)),
  [entries]);

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <TopBar title="Quadro de Honra" subtitle={`Melhores alunos — ${anoLetivo}`} />

      {/* Controls */}
      <View style={styles.controls}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.controlsContent}
        >
          {/* Trimestre filter */}
          <TouchableOpacity
            style={[styles.chip, filtroTrimestre === null && styles.chipActive]}
            onPress={() => setFiltroTrimestre(null)}
          >
            <Text style={[styles.chipText, filtroTrimestre === null && styles.chipTextActive]}>Anual</Text>
          </TouchableOpacity>
          {[1, 2, 3].map(t => (
            <TouchableOpacity key={t} style={[styles.chip, filtroTrimestre === t && styles.chipActive]}
              onPress={() => setFiltroTrimestre(t)}>
              <Text style={[styles.chipText, filtroTrimestre === t && styles.chipTextActive]}>{t}º Trim.</Text>
            </TouchableOpacity>
          ))}
          <View style={styles.divider} />
          {/* View mode */}
          <TouchableOpacity style={[styles.chip, viewMode === 'geral' && styles.chipActive]}
            onPress={() => setViewMode('geral')}>
            <MaterialCommunityIcons name="format-list-numbered" size={14} color={viewMode === 'geral' ? Colors.gold : Colors.textSecondary} />
            <Text style={[styles.chipText, viewMode === 'geral' && styles.chipTextActive]}>Geral</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.chip, viewMode === 'classe' && styles.chipActive]}
            onPress={() => setViewMode('classe')}>
            <MaterialCommunityIcons name="google-classroom" size={14} color={viewMode === 'classe' ? Colors.gold : Colors.textSecondary} />
            <Text style={[styles.chipText, viewMode === 'classe' && styles.chipTextActive]}>Por Classe</Text>
          </TouchableOpacity>
          {temCursos && (
            <TouchableOpacity style={[styles.chip, viewMode === 'curso' && styles.chipActive]}
              onPress={() => setViewMode('curso')}>
              <MaterialCommunityIcons name="school" size={14} color={viewMode === 'curso' ? Colors.gold : Colors.textSecondary} />
              <Text style={[styles.chipText, viewMode === 'curso' && styles.chipTextActive]}>Por Curso</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      </View>

      {/* Action buttons */}
      <View style={[styles.actionBar, isCompact && styles.actionBarCompact]}>
        <TouchableOpacity style={styles.generateBtn} onPress={() => setShowConfirmModal(true)} disabled={generating}>
          {generating ? (
            <AppLoader size="small" color={Colors.primaryDark} />
          ) : (
            <>
              <MaterialCommunityIcons name="refresh" size={18} color={Colors.primaryDark} />
              <Text style={styles.generateBtnText}>Gerar Quadro</Text>
            </>
          )}
        </TouchableOpacity>
        {entries.length > 0 && (
          <TouchableOpacity style={styles.deleteBtn} onPress={handleDelete}>
            <Ionicons name="trash-outline" size={16} color={Colors.danger} />
          </TouchableOpacity>
        )}
      </View>

      {loading && !refreshing ? (
        <View style={{ padding: 16 }}>
          <SkeletonList rows={6} withAvatar />
          <Text style={[styles.loadingText, { textAlign: 'center', marginTop: 12 }]}>A calcular classificações...</Text>
        </View>
      ) : entries.length === 0 ? (
        <View style={styles.emptyContainer}>
          <MaterialCommunityIcons name="trophy-outline" size={64} color={Colors.textMuted} />
          <Text style={styles.emptyTitle}>Sem dados no Quadro de Honra</Text>
          <Text style={styles.emptySubtitle}>
            Prima "Gerar Quadro" para calcular as classificações com base nas notas lançadas.
          </Text>
        </View>
      ) : (
        <ScrollView
          style={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.gold} />}
        >
          {/* Melhor da Escola destaque */}
          {melhorEscola && (
            <MelhorEscolaCard entry={melhorEscola} />
          )}

          {/* Summary stats */}
          <View style={[styles.statsRow, isCompact && styles.statsRowCompact]}>
            <StatBox label="Alunos" value={entries.length} color={Colors.info} />
            <StatBox label="Classes" value={Object.keys(porClasse).length} color={Colors.gold} />
            <StatBox label="Excelência" value={entries.filter(e => e.mencionado === 'excelencia').length} color="#FFD700" />
            <StatBox label="Louvor" value={entries.filter(e => e.mencionado === 'louvor').length} color={Colors.gold} />
          </View>

          {viewMode === 'geral' ? (
            <GeralView entries={entriesGeralSorted} melhorDeCadaClasse={melhorDeCadaClasse} />
          ) : viewMode === 'classe' ? (
            <ClasseView porClasse={porClasse} />
          ) : (
            <CursoView porCurso={porCurso} />
          )}
        </ScrollView>
      )}

      {/* Confirm Generate Modal */}
      {showConfirmModal && (
        <Modal visible animationType="fade" transparent onRequestClose={() => setShowConfirmModal(false)}>
          <View style={styles.overlay}>
            <View style={styles.confirmModal}>
              <MaterialCommunityIcons name="trophy" size={48} color={Colors.gold} />
              <Text style={styles.confirmTitle}>Gerar Quadro de Honra</Text>
              <Text style={styles.confirmText}>
                Isto irá calcular as classificações de todos os alunos com notas lançadas em{' '}
                <Text style={{ color: Colors.gold, fontWeight: '700' }}>{anoLetivo}</Text>
                {filtroTrimestre ? ` — ${TRIMESTRE_LABELS[filtroTrimestre]}` : ' (anual)'}.{'\n\n'}
                Os dados existentes para este período serão substituídos.
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.gold + '15', borderRadius: 10, borderWidth: 1, borderColor: Colors.gold + '40', padding: 10, width: '100%' }}>
                <MaterialCommunityIcons name="medal-outline" size={18} color={Colors.gold} />
                <Text style={{ flex: 1, fontSize: 12, color: Colors.text, fontFamily: 'Inter_500Medium' }}>
                  Apenas alunos com média ≥{' '}
                  <Text style={{ color: Colors.gold, fontFamily: 'Inter_700Bold' }}>{notaMinimaHonra}</Text>
                  {' '}serão incluídos. Configure em Configurações → Notas e Aprovação.
                </Text>
              </View>
              <View style={styles.confirmBtns}>
                <TouchableOpacity style={styles.confirmCancel} onPress={() => setShowConfirmModal(false)}>
                  <Text style={styles.confirmCancelText}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.confirmOk} onPress={handleGenerate}>
                  <Text style={styles.confirmOkText}>Gerar</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
}

// ─── Avatar helper ────────────────────────────────────────────────────────────

function AlunoAvatar({ foto, nome, size = 48, borderColor = Colors.border }: {
  foto?: string; nome: string; size?: number; borderColor?: string;
}) {
  const initials = nome.split(' ').slice(0, 2).map(w => w[0] || '').join('').toUpperCase();
  if (foto) {
    return (
      <Image
        source={{ uri: foto }}
        style={[styles.avatarImg, { width: size, height: size, borderRadius: size / 2, borderColor }]}
      />
    );
  }
  return (
    <View style={[styles.avatarFallback, { width: size, height: size, borderRadius: size / 2, borderColor }]}>
      <Text style={[styles.avatarInitials, { fontSize: size * 0.35 }]}>{initials}</Text>
    </View>
  );
}

// ─── Melhor da Escola Card ────────────────────────────────────────────────────

function MelhorEscolaCard({ entry }: { entry: QuadroEntry }) {
  const nome = entry.alunoNomeCompleto || entry.alunoNome;
  return (
    <View style={styles.bestCard}>
      <View style={styles.bestCardBg} />
      <View style={styles.bestCardContent}>
        <View style={styles.bestCardAvatarWrap}>
          <AlunoAvatar foto={entry.foto} nome={nome} size={72} borderColor="#FFD700" />
          <View style={styles.bestCardTrophyBadge}>
            <Text style={{ fontSize: 18 }}>🏆</Text>
          </View>
        </View>
        <View style={styles.bestCardText}>
          <Text style={styles.bestCardLabel}>Melhor Aluno da Escola</Text>
          <Text style={styles.bestCardName}>{nome}</Text>
          <Text style={styles.bestCardSub}>{entry.turmaNome} · {entry.classe}</Text>
          <Text style={styles.bestCardMedia}>
            Média: <Text style={{ color: '#FFD700', fontSize: 22, fontWeight: '900' }}>{entry.mediaGeral.toFixed(1)}</Text>
            <Text style={{ fontSize: 14, color: Colors.textSecondary }}> / 20</Text>
          </Text>
        </View>
      </View>
      {entry.mencionado ? (
        <View style={[styles.mencaoBadge, { backgroundColor: '#FFD70030' }]}>
          <Text style={[styles.mencaoBadgeText, { color: '#FFD700' }]}>
            {MENCAO_CONFIG[entry.mencionado]?.label || 'Destaque'}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

// ─── Geral View ───────────────────────────────────────────────────────────────

function GeralView({ entries, melhorDeCadaClasse }: { entries: QuadroEntry[]; melhorDeCadaClasse: QuadroEntry[] }) {
  return (
    <View style={styles.section}>
      {/* Melhor de cada classe */}
      {melhorDeCadaClasse.length > 0 && (
        <View style={styles.classeSection}>
          <View style={styles.classeSectionHeader}>
            <MaterialCommunityIcons name="star-circle" size={18} color={Colors.gold} />
            <Text style={styles.classeSectionTitle}>Melhores por Classe</Text>
            <View style={styles.classeBadge}>
              <Text style={styles.classeBadgeText}>{melhorDeCadaClasse.length} classes</Text>
            </View>
          </View>
          {melhorDeCadaClasse.map(entry => (
            <EntryCard key={entry.id + '_classe'} entry={entry} showGeral={true} destacado />
          ))}
        </View>
      )}
      <Text style={styles.sectionTitle}>Classificação Geral</Text>
      {entries.map(entry => (
        <EntryCard key={entry.id} entry={entry} showGeral />
      ))}
    </View>
  );
}

// ─── Por Classe View ──────────────────────────────────────────────────────────

function ClasseView({ porClasse }: { porClasse: Record<string, QuadroEntry[]> }) {
  const classNames = Object.keys(porClasse).sort();
  return (
    <View style={styles.section}>
      {classNames.map(classe => (
        <View key={classe} style={styles.classeSection}>
          <View style={styles.classeSectionHeader}>
            <MaterialCommunityIcons name="google-classroom" size={18} color={Colors.gold} />
            <Text style={styles.classeSectionTitle}>{classe}</Text>
            <View style={styles.classeBadge}>
              <Text style={styles.classeBadgeText}>{porClasse[classe].length} alunos</Text>
            </View>
          </View>
          {porClasse[classe].map(entry => (
            <EntryCard key={entry.id} entry={entry} showGeral={false} destacado={entry.posicaoClasse === 1} />
          ))}
        </View>
      ))}
    </View>
  );
}

// ─── Por Curso View ───────────────────────────────────────────────────────────

function CursoView({ porCurso }: { porCurso: Record<string, QuadroEntry[]> }) {
  const cursoNames = Object.keys(porCurso).sort();
  return (
    <View style={styles.section}>
      {cursoNames.map(curso => {
        const melhor = porCurso[curso][0];
        return (
          <View key={curso} style={styles.classeSection}>
            <View style={styles.classeSectionHeader}>
              <MaterialCommunityIcons name="school" size={18} color={Colors.gold} />
              <Text style={styles.classeSectionTitle}>{curso}</Text>
              <View style={styles.classeBadge}>
                <Text style={styles.classeBadgeText}>{porCurso[curso].length} alunos</Text>
              </View>
            </View>
            {/* Melhor do curso em destaque */}
            {melhor && (
              <View style={styles.melhorCursoCard}>
                <View style={styles.melhorCursoLeft}>
                  <AlunoAvatar foto={melhor.foto} nome={melhor.alunoNomeCompleto || melhor.alunoNome} size={52} borderColor={Colors.gold} />
                  <View style={styles.melhorCursoBadge}>
                    <Text style={{ fontSize: 12 }}>🥇</Text>
                  </View>
                </View>
                <View style={styles.melhorCursoInfo}>
                  <Text style={styles.melhorCursoLabel}>Melhor do Curso</Text>
                  <Text style={styles.melhorCursoNome}>{melhor.alunoNomeCompleto || melhor.alunoNome}</Text>
                  <Text style={styles.melhorCursoSub}>{melhor.turmaNome}</Text>
                </View>
                <View style={styles.mediaBox}>
                  <Text style={[styles.mediaValue, { color: medaColor(melhor.mediaGeral) }]}>{melhor.mediaGeral.toFixed(1)}</Text>
                  <Text style={styles.mediaLabel}>/ 20</Text>
                </View>
              </View>
            )}
            {porCurso[curso].slice(1).map(entry => (
              <EntryCard key={entry.id} entry={entry} showGeral={true} />
            ))}
          </View>
        );
      })}
    </View>
  );
}

// ─── Entry Card ───────────────────────────────────────────────────────────────

function EntryCard({ entry, showGeral, destacado }: { entry: QuadroEntry; showGeral: boolean; destacado?: boolean }) {
  const mencao = MENCAO_CONFIG[entry.mencionado] || MENCAO_CONFIG[''];
  const pos = showGeral ? entry.posicaoGeral ?? entry.posicaoClasse : entry.posicaoClasse;
  const isTop3 = pos <= 3;
  const isFirst = pos === 1;
  const nome = entry.alunoNomeCompleto || entry.alunoNome;

  return (
    <View style={[
      styles.entryCard,
      destacado && styles.entryCardFirst,
      entry.melhorEscola && showGeral && styles.entryCardBest,
    ]}>
      {/* Position */}
      <View style={[styles.posBox, isFirst && { backgroundColor: '#FFD70030' }]}>
        <Text style={[styles.posText, { color: isTop3 ? medaColor(entry.mediaGeral) : Colors.textSecondary }]}>
          {posicaoLabel(pos)}
        </Text>
      </View>

      {/* Avatar */}
      <AlunoAvatar foto={entry.foto} nome={nome} size={38} borderColor={destacado ? Colors.gold : Colors.border} />

      {/* Info */}
      <View style={styles.entryInfo}>
        <Text style={[styles.entryName, entry.melhorEscola && showGeral && { color: '#FFD700' }]}>
          {nome}
          {entry.melhorEscola && showGeral ? ' 🏆' : ''}
          {entry.melhorCurso && showGeral && !entry.melhorEscola ? ' 🎓' : ''}
        </Text>
        <Text style={styles.entrySub}>
          {showGeral ? entry.turmaNome : `Nº ${entry.numeroMatricula || '—'}`}
          {entry.classe ? ` · ${entry.classe}` : ''}
        </Text>
        {entry.mencionado ? (
          <View style={[styles.mencaoBadgeSm, { backgroundColor: mencao.bg }]}>
            <Text style={[styles.mencaoBadgeSmText, { color: mencao.color }]}>{mencao.label}</Text>
          </View>
        ) : null}
      </View>

      {/* Media */}
      <View style={styles.mediaBox}>
        <Text style={[styles.mediaValue, { color: medaColor(entry.mediaGeral) }]}>
          {entry.mediaGeral.toFixed(1)}
        </Text>
        <Text style={styles.mediaLabel}>/ 20</Text>
      </View>
    </View>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function StatBox({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={[styles.statBox, { borderTopColor: color }]}>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  controls: { backgroundColor: Colors.backgroundCard, paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.border },
  controlsContent: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16, borderWidth: 1, borderColor: Colors.border, marginRight: 6 },
  chipActive: { backgroundColor: Colors.primary, borderColor: Colors.gold },
  chipText: { fontSize: 12, color: Colors.textSecondary },
  chipTextActive: { color: Colors.gold, fontWeight: '700' },
  divider: { width: 1, backgroundColor: Colors.border, marginHorizontal: 4 },

  actionBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, gap: 10 },
  actionBarCompact: { paddingHorizontal: 10, gap: 6 },
  generateBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: Colors.gold, borderRadius: 10, paddingVertical: 10 },
  generateBtnText: { fontSize: 14, fontWeight: '700', color: Colors.primaryDark },
  deleteBtn: { padding: 10, borderRadius: 10, borderWidth: 1, borderColor: Colors.danger + '60' },

  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  loadingText: { color: Colors.textSecondary, fontSize: 14 },

  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32, gap: 12 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: Colors.text, textAlign: 'center' },
  emptySubtitle: { fontSize: 14, color: Colors.textSecondary, textAlign: 'center', lineHeight: 22 },

  content: { flex: 1 },

  // Avatar
  avatarImg: { borderWidth: 2 },
  avatarFallback: { borderWidth: 2, backgroundColor: Colors.primary, justifyContent: 'center', alignItems: 'center' },
  avatarInitials: { color: Colors.gold, fontWeight: '800' },

  // Best of school card
  bestCard: { margin: 16, borderRadius: 16, overflow: 'hidden', backgroundColor: Colors.backgroundCard, borderWidth: 1.5, borderColor: '#FFD70060' },
  bestCardBg: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#FFD70008' },
  bestCardContent: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 14 },
  bestCardAvatarWrap: { position: 'relative' },
  bestCardTrophyBadge: { position: 'absolute', bottom: -4, right: -4, backgroundColor: Colors.backgroundCard, borderRadius: 12, padding: 2 },
  bestCardText: { flex: 1, gap: 3 },
  bestCardLabel: { fontSize: 12, color: Colors.textSecondary, fontWeight: '600', letterSpacing: 0.5 },
  bestCardName: { fontSize: 18, fontWeight: '900', color: '#FFD700' },
  bestCardSub: { fontSize: 13, color: Colors.textSecondary },
  bestCardMedia: { fontSize: 14, color: Colors.text, marginTop: 4 },
  mencaoBadge: { margin: 12, marginTop: 0, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, alignSelf: 'flex-start' },
  mencaoBadgeText: { fontSize: 13, fontWeight: '700' },

  // Melhor curso card
  melhorCursoCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.primary, borderRadius: 12, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: Colors.gold + '40', gap: 10 },
  melhorCursoLeft: { position: 'relative' },
  melhorCursoBadge: { position: 'absolute', bottom: -4, right: -4, backgroundColor: Colors.backgroundCard, borderRadius: 10, padding: 2 },
  melhorCursoInfo: { flex: 1, gap: 2 },
  melhorCursoLabel: { fontSize: 10, color: Colors.gold, fontWeight: '700', letterSpacing: 0.5 },
  melhorCursoNome: { fontSize: 14, fontWeight: '800', color: Colors.text },
  melhorCursoSub: { fontSize: 12, color: Colors.textSecondary },

  // Stats row
  statsRow: { flexDirection: 'row', paddingHorizontal: 16, gap: 8, marginBottom: 8 },
  statsRowCompact: { flexWrap: 'wrap' },
  statBox: { flex: 1, backgroundColor: Colors.backgroundCard, borderRadius: 10, padding: 12, alignItems: 'center', borderTopWidth: 3 },
  statValue: { fontSize: 22, fontWeight: '900' },
  statLabel: { fontSize: 11, color: Colors.textSecondary, marginTop: 2 },

  // Section
  section: { paddingHorizontal: 16, paddingBottom: 32 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: Colors.text, marginBottom: 12, marginTop: 4 },

  // Classe section
  classeSection: { marginBottom: 20 },
  classeSectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  classeSectionTitle: { fontSize: 15, fontWeight: '700', color: Colors.text, flex: 1 },
  classeBadge: { backgroundColor: Colors.primary, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 3 },
  classeBadgeText: { fontSize: 11, color: Colors.gold, fontWeight: '700' },

  // Entry card
  entryCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.backgroundCard, borderRadius: 12, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: Colors.border, gap: 10 },
  entryCardFirst: { borderColor: '#FFD70050', backgroundColor: Colors.backgroundCard },
  entryCardBest: { borderColor: '#FFD70060', borderWidth: 1.5 },

  posBox: { width: 42, height: 42, borderRadius: 21, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.backgroundElevated },
  posText: { fontSize: 14, fontWeight: '900' },

  entryInfo: { flex: 1, gap: 3 },
  entryName: { fontSize: 14, fontWeight: '700', color: Colors.text },
  entrySub: { fontSize: 12, color: Colors.textSecondary },

  mencaoBadgeSm: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8, alignSelf: 'flex-start', marginTop: 2 },
  mencaoBadgeSmText: { fontSize: 10, fontWeight: '700' },

  mediaBox: { alignItems: 'center' },
  mediaValue: { fontSize: 20, fontWeight: '900' },
  mediaLabel: { fontSize: 10, color: Colors.textMuted },

  // Modal
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  confirmModal: { backgroundColor: Colors.backgroundCard, borderRadius: 20, padding: 24, width: '100%', maxWidth: 400, alignItems: 'center', gap: 12, borderWidth: 1, borderColor: Colors.border },
  confirmTitle: { fontSize: 20, fontWeight: '800', color: Colors.text, textAlign: 'center' },
  confirmText: { fontSize: 14, color: Colors.textSecondary, textAlign: 'center', lineHeight: 22 },
  confirmBtns: { flexDirection: 'row', gap: 12, marginTop: 8, width: '100%' },
  confirmCancel: { flex: 1, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, alignItems: 'center' },
  confirmCancelText: { fontSize: 14, color: Colors.text },
  confirmOk: { flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: Colors.gold, alignItems: 'center' },
  confirmOkText: { fontSize: 14, fontWeight: '800', color: Colors.primaryDark },
});
