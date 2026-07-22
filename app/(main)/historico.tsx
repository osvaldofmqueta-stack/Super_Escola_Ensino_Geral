import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, FlatList, Dimensions, Modal, Platform } from 'react-native';
import AppLoader from '@/components/AppLoader';
import { SkeletonList, SkeletonTable } from '@/components/Skeleton';
import { Ionicons, MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Colors } from '@/constants/colors';
import TopBar from '@/components/TopBar';
import { LineChart } from '@/components/Charts';
import { useData } from '@/context/DataContext';
import { useAnoAcademico } from '@/context/AnoAcademicoContext';
import { useAuth, getAuthToken } from '@/context/AuthContext';
import { useRouter } from 'expo-router';
import { getPdfUrl } from '@/utils/pdfAuth';

const { width } = Dimensions.get('window');

type ViewMode = 'aluno' | 'turma';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function notaEfetiva(n: any): number {
  if (n.nf != null && n.nf > 0)   return Number(n.nf);
  if (n.mt1 != null && n.mt1 > 0) return Number(n.mt1);
  if (n.mac1 != null && n.mac1 > 0) return Number(n.mac1);
  if (n.mac != null && n.mac > 0)  return Number(n.mac);
  const avals = [n.aval1, n.aval2, n.aval3, n.aval4, n.aval5, n.aval6, n.aval7, n.aval8]
    .map(Number).filter(v => v > 0);
  if (avals.length > 0) return avals.reduce((s, v) => s + v, 0) / avals.length;
  return 0;
}

function notaLancada(n: any): boolean {
  return !!(n.lancado || (n.nf != null && Number(n.nf) > 0) || (n.mt1 != null && Number(n.mt1) > 0));
}

function formatDate(d: string | null | undefined): string {
  if (!d) return '—';
  try {
    const [y, m, day] = d.split('-');
    if (y && m && day) return `${day}/${m}/${y}`;
  } catch {}
  return d;
}

function calcularIdade(dataNascimento: string | null | undefined): number | null {
  if (!dataNascimento) return null;
  try {
    const hoje = new Date();
    const nasc = new Date(dataNascimento);
    let idade = hoje.getFullYear() - nasc.getFullYear();
    const m = hoje.getMonth() - nasc.getMonth();
    if (m < 0 || (m === 0 && hoje.getDate() < nasc.getDate())) idade--;
    return idade > 0 ? idade : null;
  } catch { return null; }
}

// ─── Sub-componentes ──────────────────────────────────────────────────────────

function SituacaoBadge({ situacao }: { situacao: string }) {
  const map: Record<string, { color: string; bg: string }> = {
    'Em curso':    { color: Colors.info,    bg: Colors.info + '22' },
    'Aprovado':    { color: Colors.success, bg: Colors.success + '22' },
    'Reprovado':   { color: Colors.danger,  bg: Colors.danger + '22' },
    'Transferido': { color: Colors.warning, bg: Colors.warning + '22' },
    'Desistiu':    { color: Colors.textMuted, bg: Colors.border },
  };
  const cfg = map[situacao] || { color: Colors.textMuted, bg: Colors.border };
  return (
    <View style={[S.badge, { backgroundColor: cfg.bg }]}>
      <Text style={[S.badgeText, { color: cfg.color }]}>{situacao}</Text>
    </View>
  );
}

function InfoRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={S.infoRow}>
      <Text style={S.infoLabel}>{label}</Text>
      <Text style={[S.infoValue, color ? { color } : {}]}>{value || '—'}</Text>
    </View>
  );
}

function StatBox({ value, label, color }: { value: string | number; label: string; color?: string }) {
  return (
    <View style={S.statBox}>
      <Text style={[S.statVal, { color: color || Colors.text }]}>{value}</Text>
      <Text style={S.statLbl}>{label}</Text>
    </View>
  );
}

function NotasTrimestreTable({ notas }: { notas: any[] }) {
  const trimestres = [1, 2, 3] as const;
  const comNotas = trimestres.filter(t => notas.some(n => n.trimestre === t));
  if (comNotas.length === 0) return null;

  const corTrim: Record<number, string> = { 1: Colors.info, 2: Colors.warning, 3: Colors.success };

  return (
    <View style={S.trimContainer}>
      {comNotas.map(t => {
        const nt = notas.filter(n => n.trimestre === t);
        const comValor = nt.filter(n => notaEfetiva(n) > 0);
        const media = comValor.length > 0
          ? comValor.reduce((s, n) => s + notaEfetiva(n), 0) / comValor.length : 0;
        const cor = corTrim[t];
        const todasLancadas = nt.every(n => notaLancada(n));

        return (
          <View key={t} style={[S.trimBlock, { borderColor: Colors.border }]}>
            <View style={[S.trimHeader, { borderLeftColor: cor, backgroundColor: Colors.backgroundElevated }]}>
              <View style={S.trimHeaderLeft}>
                <View style={[S.trimDot, { backgroundColor: cor }]} />
                <Text style={[S.trimTitle, { color: cor }]}>{t}º Trimestre</Text>
                {!todasLancadas && (
                  <View style={S.pendenteBadge}>
                    <Text style={S.pendenteText}>Em lançamento</Text>
                  </View>
                )}
              </View>
              <View style={[S.mediaBadge, { backgroundColor: cor + '20', borderColor: cor + '40' }]}>
                <Text style={[S.mediaBadgeText, { color: cor }]}>
                  Média: {media > 0 ? media.toFixed(1) : '—'}
                </Text>
              </View>
            </View>

            {/* Cabeçalho tabela */}
            <View style={S.tblHeader}>
              <Text style={[S.tblCol, { flex: 1 }]}>Disciplina</Text>
              <Text style={[S.tblCol, { width: 44, textAlign: 'center' }]}>MAC</Text>
              <Text style={[S.tblCol, { width: 34, textAlign: 'center' }]}>PP</Text>
              <Text style={[S.tblCol, { width: 34, textAlign: 'center' }]}>PT</Text>
              <Text style={[S.tblCol, { width: 46, textAlign: 'center' }]}>NF</Text>
              <Text style={[S.tblCol, { width: 26, textAlign: 'center' }]}></Text>
            </View>

            {nt.map(n => {
              const nfVal = notaEfetiva(n);
              const lancada = notaLancada(n);
              const macVal = n.mac1 > 0 ? n.mac1 : (n.mac > 0 ? n.mac : null);
              const aprovado = nfVal >= 10;
              return (
                <View key={n.id} style={S.tblRow}>
                  <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={S.tblCell} numberOfLines={1}>{n.disciplina}</Text>
                    {!lancada && <Text style={S.parcialTag}>parcial</Text>}
                  </View>
                  <Text style={[S.tblCell, { width: 44, textAlign: 'center' }]}>
                    {macVal != null && macVal > 0 ? Number(macVal).toFixed(1) : '—'}
                  </Text>
                  <Text style={[S.tblCell, { width: 34, textAlign: 'center' }]}>
                    {n.pp1 > 0 ? Number(n.pp1).toFixed(1) : '—'}
                  </Text>
                  <Text style={[S.tblCell, { width: 34, textAlign: 'center' }]}>
                    {n.ppt > 0 ? Number(n.ppt).toFixed(1) : '—'}
                  </Text>
                  <Text style={[S.tblCell, {
                    width: 46, textAlign: 'center', fontFamily: 'Inter_700Bold',
                    color: !lancada ? Colors.warning : (aprovado ? Colors.success : Colors.danger),
                  }]}>
                    {nfVal > 0 ? nfVal.toFixed(1) : '—'}
                  </Text>
                  <View style={{ width: 26, alignItems: 'center' }}>
                    {lancada && (
                      <Ionicons
                        name={aprovado ? 'checkmark-circle' : 'close-circle'}
                        size={14}
                        color={aprovado ? Colors.success : Colors.danger}
                      />
                    )}
                  </View>
                </View>
              );
            })}
          </View>
        );
      })}
    </View>
  );
}

// ─── Pagination ───────────────────────────────────────────────────────────────

const PAGE_SIZE_TURMA = 25;

function PaginationBar({ current, total, onChange }: { current: number; total: number; onChange: (p: number) => void }) {
  if (total <= 1) return null;
  const pages: (number | '…')[] = [];
  const add = (n: number) => { if (!pages.includes(n)) pages.push(n); };
  add(1);
  if (current - 1 > 2) pages.push('…');
  if (current - 1 > 1) add(current - 1);
  add(current);
  if (current + 1 < total) add(current + 1);
  if (current + 2 < total) pages.push('…');
  add(total);
  return (
    <View style={pgH.bar}>
      <TouchableOpacity style={[pgH.navBtn, current === 1 && pgH.disabled]} onPress={() => current > 1 && onChange(current - 1)} disabled={current === 1}>
        <Ionicons name="chevron-back" size={14} color={current === 1 ? '#3a4a6b' : '#9aa5be'} />
      </TouchableOpacity>
      {pages.map((p, i) =>
        p === '…' ? (
          <Text key={`e-${i}`} style={pgH.ellipsis}>…</Text>
        ) : (
          <TouchableOpacity key={p} style={[pgH.pageBtn, p === current && pgH.pageBtnActive]} onPress={() => onChange(p as number)}>
            <Text style={[pgH.pageTxt, p === current && pgH.pageTxtActive]}>{p}</Text>
          </TouchableOpacity>
        )
      )}
      <TouchableOpacity style={[pgH.navBtn, current === total && pgH.disabled]} onPress={() => current < total && onChange(current + 1)} disabled={current === total}>
        <Ionicons name="chevron-forward" size={14} color={current === total ? '#3a4a6b' : '#9aa5be'} />
      </TouchableOpacity>
      <Text style={pgH.label}>Página {current} de {total}</Text>
    </View>
  );
}

// ─── Screen principal ─────────────────────────────────────────────────────────

export default function HistoricoScreen() {
  const { alunos, turmas, notas: notasCtx, presencas: presCtx } = useData();
  const { anos, anoSelecionado } = useAnoAcademico();
  const { user } = useAuth();
  const router = useRouter();

  const isAlunoRole = user?.role === 'aluno';

  const [viewMode, setViewMode]              = useState<ViewMode>('aluno');
  const [selectedAlunoId, setSelectedAlunoId]= useState<string | null>(null);
  const [selectedTurmaId, setSelectedTurmaId]= useState<string>('');
  const [showAlunoSelector, setShowAlunoSelector] = useState(false);
  const [showTurmaSelector, setShowTurmaSelector] = useState(false);
  const [previewUrl, setPreviewUrl]          = useState<string | null>(null);
  const [currentPageTurma, setCurrentPageTurma] = useState(1);

  // Dados do endpoint dedicado
  const [historicoData, setHistoricoData] = useState<any>(null);
  const [turmaData, setTurmaData]         = useState<any>(null);
  const [loadingAluno, setLoadingAluno]   = useState(false);
  const [loadingTurma, setLoadingTurma]   = useState(false);

  // Situação de promoção do aluno seleccionado
  const [promocaoSit, setPromocaoSit] = useState<any>(null);
  const [promocaoLoading, setPromocaoLoading] = useState(false);

  const alunosAtivos  = alunos.filter(a => a.ativo);
  const turmasAtivas  = turmas.filter(t => t.ativo);

  // Auto-selecionar primeira turma
  useEffect(() => {
    if (turmasAtivas.length > 0 && !selectedTurmaId) {
      setSelectedTurmaId(turmasAtivas[0].id);
    }
  }, [turmasAtivas]);

  // Reset página ao mudar de turma
  useEffect(() => { setCurrentPageTurma(1); }, [selectedTurmaId]);

  // Auto-selecionar aluno logado
  useEffect(() => {
    if (isAlunoRole && user && alunos.length > 0 && !selectedAlunoId) {
      const nome = user.nome?.split(' ')[0]?.toLowerCase() || '';
      const found = alunos.find(a =>
        a.nome.toLowerCase().includes(nome) ||
        `${a.nome} ${a.apelido}`.toLowerCase().includes((user.nome || '').toLowerCase())
      );
      if (found) setSelectedAlunoId(found.id);
    }
  }, [isAlunoRole, user, alunos]);

  // Carregar histórico do aluno via API dedicada
  const carregarHistoricoAluno = useCallback(async (alunoId: string) => {
    setLoadingAluno(true);
    try {
      const tok = await getAuthToken();
      const resp = await fetch(`/api/historico/aluno/${alunoId}`, {
        headers: { Authorization: `Bearer ${tok ?? ''}` },
      });
      if (resp.ok) {
        const data = await resp.json();
        setHistoricoData(data);
      }
    } catch {}
    setLoadingAluno(false);
  }, []);

  // Carregar histórico da turma via API dedicada
  const carregarHistoricoTurma = useCallback(async (turmaId: string) => {
    setLoadingTurma(true);
    try {
      const tok = await getAuthToken();
      const ano = anoSelecionado?.ano || '';
      const resp = await fetch(
        `/api/historico/turma/${turmaId}${ano ? `?anoLetivo=${encodeURIComponent(ano)}` : ''}`,
        { headers: { Authorization: `Bearer ${tok ?? ''}` } }
      );
      if (resp.ok) {
        const data = await resp.json();
        setTurmaData(data);
      }
    } catch {}
    setLoadingTurma(false);
  }, [anoSelecionado]);

  useEffect(() => {
    if (selectedAlunoId) carregarHistoricoAluno(selectedAlunoId);
    else setHistoricoData(null);
  }, [selectedAlunoId]);

  useEffect(() => {
    if (!selectedAlunoId) { setPromocaoSit(null); return; }
    setPromocaoLoading(true);
    setPromocaoSit(null);
    getAuthToken().then(tok =>
      fetch(`/api/promocao/situacao/${selectedAlunoId}`, {
        headers: { Authorization: `Bearer ${tok ?? ''}` },
      })
        .then(r => r.ok ? r.json() : null)
        .then(d => setPromocaoSit(d))
        .catch(() => setPromocaoSit(null))
        .finally(() => setPromocaoLoading(false))
    );
  }, [selectedAlunoId]);

  useEffect(() => {
    if (viewMode === 'turma' && selectedTurmaId) carregarHistoricoTurma(selectedTurmaId);
  }, [viewMode, selectedTurmaId, anoSelecionado]);

  // Dados do aluno seleccionado (fallback para context se API ainda não respondeu)
  const selectedAluno = historicoData?.aluno || alunos.find(a => a.id === selectedAlunoId) || null;
  const selectedTurma = turmas.find(t => t.id === selectedTurmaId) || null;

  // Historial anual calculado a partir dos dados da API (ou fallback para context)
  const notasAluno: any[]    = historicoData?.notas    || notasCtx.filter(n => n.alunoId === selectedAlunoId);
  const presencasAluno: any[] = historicoData?.presencas || presCtx.filter(p => p.alunoId === selectedAlunoId);
  const anosData: any[]       = historicoData?.anos     || anos;

  const historicoAnual = useMemo(() => {
    if (!selectedAluno) return [];
    return anosData.map((ano: any) => {
      const anoKey = ano.ano || ano;
      const notasAno = notasAluno.filter((n: any) => n.anoLetivo === anoKey);
      const presAno  = presencasAluno.filter((p: any) => {
        // Tentar filtrar por ano se tiver campo data
        if (p.data) return p.data.startsWith(anoKey?.slice(0, 4) || '');
        return true;
      });

      const notasComValor = notasAno.filter((n: any) => notaEfetiva(n) > 0);
      const mediaGeral = notasComValor.length > 0
        ? notasComValor.reduce((s: number, n: any) => s + notaEfetiva(n), 0) / notasComValor.length
        : null;

      const totalPresencas = presAno.length;
      const presentes      = presAno.filter((p: any) => p.status === 'P').length;
      const faltas         = presAno.filter((p: any) => p.status === 'F').length;
      const presencasPct   = totalPresencas > 0 ? Math.round((presentes / totalPresencas) * 100) : 100;

      // Disciplinas com NF lançada
      const discComNF     = notasAno.filter((n: any) => notaLancada(n));
      const discAprovadas = discComNF.filter((n: any) => notaEfetiva(n) >= 10).length;
      const discReprovadas = discComNF.filter((n: any) => notaEfetiva(n) < 10 && notaEfetiva(n) > 0).length;

      // Turma usada neste ano (via notas)
      const turmaDoAno = notasAno[0]?.turmaNome || notasAno[0]?.['turmaNome'] || null;
      const nivelDoAno = notasAno[0]?.turmaNivel || notasAno[0]?.['turmaNivel'] || null;

      const anoAtivo = ano.ativo ?? false;
      const situacao = anoAtivo
        ? 'Em curso'
        : (mediaGeral === null ? 'Em curso' : (mediaGeral >= 10 ? 'Aprovado' : 'Reprovado'));

      const trimestresResumo = [1, 2, 3].map(t => {
        const nt = notasAno.filter((n: any) => n.trimestre === t);
        const cv = nt.filter((n: any) => notaEfetiva(n) > 0);
        const mt = cv.length > 0 ? cv.reduce((s: number, n: any) => s + notaEfetiva(n), 0) / cv.length : null;
        return { trimestre: t, notas: nt, media: mt };
      });

      return {
        ano, anoKey, notasAno, mediaGeral, presencasPct, faltas, totalPresencas,
        discAprovadas, discReprovadas, discComNF: discComNF.length,
        turmaDoAno, nivelDoAno, situacao, trimestresResumo, anoAtivo,
      };
    }).filter((h: any) => h.notasAno.length > 0 || h.anoAtivo);
  }, [selectedAluno, notasAluno, presencasAluno, anosData]);

  const chartData = useMemo(() =>
    historicoAnual
      .filter(h => h.mediaGeral !== null && h.mediaGeral > 0)
      .map(h => ({ label: String(h.anoKey).slice(2), value: parseFloat((h.mediaGeral || 0).toFixed(1)) }))
      .reverse(),
    [historicoAnual]
  );

  // Stats globais
  const statsGlobais = useMemo(() => {
    const todasNotas   = notasAluno.filter((n: any) => notaEfetiva(n) > 0);
    const mediaGlobal  = todasNotas.length > 0
      ? todasNotas.reduce((s: number, n: any) => s + notaEfetiva(n), 0) / todasNotas.length : 0;
    const totalFaltas  = presencasAluno.filter((p: any) => p.status === 'F').length;
    const anosComNotas = new Set(notasAluno.filter((n: any) => notaEfetiva(n) > 0).map((n: any) => n.anoLetivo)).size;
    const discAprov    = notasAluno.filter((n: any) => notaLancada(n) && notaEfetiva(n) >= 10).length;
    const discReprov   = notasAluno.filter((n: any) => notaLancada(n) && notaEfetiva(n) < 10 && notaEfetiva(n) > 0).length;
    return { mediaGlobal, totalFaltas, anosComNotas, discAprov, discReprov };
  }, [notasAluno, presencasAluno]);

  // Dados Por Turma (da API ou fallback)
  const turmaAlunos: any[] = useMemo(() => {
    const apiAlunos = turmaData?.alunos || [];
    const apiNotas  = turmaData?.notas  || [];
    const apiPres   = turmaData?.presencas || [];

    // Fallback para context se API não retornou ainda
    const fonte = apiAlunos.length > 0 ? apiAlunos : (() => {
      const idsViaNotas = new Set(
        notasCtx.filter(n => n.turmaId === selectedTurmaId).map(n => n.alunoId)
      );
      return alunos.filter(a => a.ativo && (a.turmaId === selectedTurmaId || idsViaNotas.has(a.id)));
    })();

    return fonte.map((aluno: any) => {
      const notasA = (apiNotas.length > 0 ? apiNotas : notasCtx)
        .filter((n: any) => n.alunoId === aluno.id);
      const presA  = (apiPres.length > 0 ? apiPres : presCtx)
        .filter((p: any) => p.alunoId === aluno.id);

      const comValor = notasA.filter((n: any) => notaEfetiva(n) > 0);
      const media    = comValor.length > 0
        ? comValor.reduce((s: number, n: any) => s + notaEfetiva(n), 0) / comValor.length : 0;
      const faltas   = presA.filter((p: any) => p.status === 'F').length;
      const aprovadas  = notasA.filter((n: any) => notaLancada(n) && notaEfetiva(n) >= 10).length;
      const reprovadas = notasA.filter((n: any) => notaLancada(n) && notaEfetiva(n) < 10 && notaEfetiva(n) > 0).length;

      const situacao = notasA.length === 0 ? 'Em curso'
        : (anoSelecionado?.ativo ? 'Em curso' : (media >= 10 ? 'Aprovado' : 'Reprovado'));

      const porTrimestre = [1, 2, 3].map(t => {
        const nt  = notasA.filter((n: any) => n.trimestre === t);
        const cv  = nt.filter((n: any) => notaEfetiva(n) > 0);
        const med = cv.length > 0 ? cv.reduce((s: number, n: any) => s + notaEfetiva(n), 0) / cv.length : null;
        return { trimestre: t, media: med };
      });

      return { aluno, media, faltas, aprovadas, reprovadas, situacao, porTrimestre };
    }).sort((a: any, b: any) => b.media - a.media);
  }, [turmaData, alunos, notasCtx, presCtx, selectedTurmaId, anoSelecionado]);

  const totalAlunos  = turmaAlunos.length;
  const aprovados    = turmaAlunos.filter(x => x.situacao === 'Aprovado').length;
  const reprovados   = turmaAlunos.filter(x => x.situacao === 'Reprovado').length;
  const mediaTurma   = totalAlunos > 0 ? turmaAlunos.reduce((s, x) => s + x.media, 0) / totalAlunos : 0;

  // Paginação da tabela de alunos por turma
  const totalPagesTurma = Math.max(1, Math.ceil(totalAlunos / PAGE_SIZE_TURMA));
  const safePageTurma   = Math.min(currentPageTurma, totalPagesTurma);
  const paginatedTurmaAlunos = turmaAlunos.slice((safePageTurma - 1) * PAGE_SIZE_TURMA, safePageTurma * PAGE_SIZE_TURMA);

  function handlePrintPreview() {
    if (Platform.OS !== 'web') return;
    const iframe = document.getElementById('hist-pdf-iframe') as HTMLIFrameElement | null;
    if (iframe?.contentWindow) iframe.contentWindow.print();
  }

  const corTrim: Record<number, string> = { 1: Colors.info, 2: Colors.warning, 3: Colors.success };

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <View style={S.container}>

      {/* Modal PDF */}
      {Platform.OS === 'web' && (
        <Modal visible={!!previewUrl} animationType="fade" transparent={false} onRequestClose={() => setPreviewUrl(null)}>
          <View style={S.previewModal}>
            <View style={S.previewHeader}>
              <View style={{ flex: 1 }}>
                <Text style={S.previewTitle}>Histórico Académico</Text>
                <Text style={S.previewSub}>Formato A4 · Pré-visualização</Text>
              </View>
              <TouchableOpacity style={S.previewPrintBtn} onPress={handlePrintPreview}>
                <Ionicons name="print-outline" size={16} color="#fff" />
                <Text style={S.previewPrintTxt}>Imprimir / PDF</Text>
              </TouchableOpacity>
              <TouchableOpacity style={S.previewCloseBtn} onPress={() => setPreviewUrl(null)}>
                <Ionicons name="close" size={22} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <View style={S.previewBody}>
              {previewUrl && (
                <iframe
                  id="hist-pdf-iframe"
                  src={previewUrl}
                  style={{ flex: 1, border: 'none', width: '100%', height: '100%', minHeight: 600, background: '#f0f0f0' } as any}
                  title="Histórico Académico"
                />
              )}
            </View>
          </View>
        </Modal>
      )}

      <TopBar title="Histórico Académico" subtitle={anoSelecionado?.ano || ''} />

      {/* Aviso */}
      <View style={S.banner}>
        <Ionicons name="shield-checkmark-outline" size={13} color={Colors.textMuted} />
        <Text style={S.bannerText}>
          Registo permanente e imutável — cresce automaticamente com a actividade académica
        </Text>
      </View>

      {/* Tabs de modo */}
      {!isAlunoRole && (
        <View style={S.tabs}>
          {(['aluno', 'turma'] as const).map(m => (
            <TouchableOpacity key={m} style={[S.tab, viewMode === m && S.tabActive]} onPress={() => setViewMode(m)}>
              {m === 'aluno'
                ? <Ionicons name="person" size={15} color={viewMode === m ? Colors.gold : Colors.textSecondary} />
                : <MaterialIcons name="class" size={15} color={viewMode === m ? Colors.gold : Colors.textSecondary} />}
              <Text style={[S.tabText, viewMode === m && S.tabTextActive]}>
                {m === 'aluno' ? 'Por Aluno' : 'Por Turma'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* ─── POR ALUNO ─────────────────────────────────────────────────── */}
      {(viewMode === 'aluno' || isAlunoRole) && (
        <ScrollView style={S.scroll} showsVerticalScrollIndicator={false}>

          {/* Selector de aluno */}
          {!isAlunoRole && (
            <>
              <TouchableOpacity style={S.selector} onPress={() => setShowAlunoSelector(v => !v)}>
                <Ionicons name="person" size={18} color={Colors.gold} />
                <Text style={selectedAluno ? S.selectorVal : S.selectorPlh}>
                  {selectedAluno ? `${selectedAluno.nome} ${selectedAluno.apelido}` : 'Selecionar aluno...'}
                </Text>
                <Ionicons name={showAlunoSelector ? 'chevron-up' : 'chevron-down'} size={16} color={Colors.textMuted} />
              </TouchableOpacity>
              {showAlunoSelector && (
                <View style={S.dropdown}>
                  {alunosAtivos.length === 0 && (
                    <Text style={[S.dropdownText, { padding: 16, color: Colors.textMuted }]}>Nenhum aluno registado.</Text>
                  )}
                  {alunosAtivos.map(a => (
                    <TouchableOpacity
                      key={a.id}
                      style={[S.dropItem, selectedAlunoId === a.id && S.dropItemActive]}
                      onPress={() => { setSelectedAlunoId(a.id); setShowAlunoSelector(false); }}
                    >
                      <View style={S.dropAvatar}>
                        <Text style={S.dropAvatarText}>{a.nome[0]}{a.apelido?.[0] || ''}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[S.dropdownText, selectedAlunoId === a.id && { color: Colors.gold, fontFamily: 'Inter_600SemiBold' }]}>
                          {a.nome} {a.apelido}
                        </Text>
                        <Text style={S.dropSub}>{a.numeroMatricula}</Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </>
          )}

          {/* Estado vazio */}
          {!selectedAluno && !loadingAluno && (
            <View style={S.empty}>
              <MaterialCommunityIcons name="book-open-page-variant-outline" size={56} color={Colors.textMuted} />
              <Text style={S.emptyTitle}>{isAlunoRole ? 'A carregar histórico...' : 'Selecione um aluno'}</Text>
              <Text style={S.emptyMsg}>
                {isAlunoRole
                  ? 'O seu histórico académico completo aparecerá aqui.'
                  : 'Escolha um aluno acima para visualizar o seu percurso académico completo — notas, presenças e progressão por ano.'}
              </Text>
            </View>
          )}

          {loadingAluno && (
            <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
              <SkeletonList rows={5} withAvatar />
            </View>
          )}

          {selectedAluno && !loadingAluno && (
            <>
              {/* ── Cartão do Aluno ── */}
              <View style={S.alunoCard}>
                <View style={S.alunoAvatar}>
                  <Text style={S.alunoAvatarText}>{selectedAluno.nome?.[0]}{selectedAluno.apelido?.[0]}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={S.alunoNome}>{selectedAluno.nome} {selectedAluno.apelido}</Text>
                  <Text style={S.alunoMat}>{selectedAluno.numeroMatricula}</Text>
                  {(selectedAluno.turmaNomeAtual || selectedAluno.turmaId) && (
                    <View style={S.turmaTag}>
                      <MaterialIcons name="class" size={11} color={Colors.gold} />
                      <Text style={S.turmaTagText}>
                        {selectedAluno.turmaNomeAtual || '—'}{selectedAluno.turmaNivelAtual ? ` · ${selectedAluno.turmaNivelAtual}` : ''}
                      </Text>
                    </View>
                  )}
                </View>
                <View style={{ alignItems: 'flex-end', gap: 8 }}>
                  <SituacaoBadge situacao={historicoAnual.find(h => h.anoAtivo)?.situacao || 'Em curso'} />
                  {Platform.OS === 'web' && selectedAlunoId && (
                    <TouchableOpacity
                      style={S.pdfBtn}
                      onPress={async () => {
                        const url = await getPdfUrl(`/api/pdf/historico-academico/${selectedAlunoId}?autoprint=false`);
                        setPreviewUrl(url);
                      }}
                    >
                      <Ionicons name="document-text-outline" size={14} color={Colors.gold} />
                      <Text style={S.pdfBtnText}>Ver / Imprimir</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>

              {/* ── Dados pessoais ── */}
              <View style={S.section}>
                <Text style={S.sectionTitle}>Dados Pessoais</Text>
                <View style={S.infoGrid}>
                  <View style={S.infoGridCol}>
                    <InfoRow label="Data de Nascimento"
                      value={selectedAluno.dataNascimento
                        ? `${formatDate(selectedAluno.dataNascimento)}${calcularIdade(selectedAluno.dataNascimento) ? ` (${calcularIdade(selectedAluno.dataNascimento)} anos)` : ''}`
                        : '—'} />
                    <InfoRow label="Género" value={selectedAluno.genero} />
                    <InfoRow label="Província" value={selectedAluno.provincia} />
                    <InfoRow label="Município"  value={selectedAluno.municipio} />
                  </View>
                  <View style={S.infoGridCol}>
                    <InfoRow label="Encarregado" value={selectedAluno.nomeEncarregado} />
                    <InfoRow label="Contacto" value={selectedAluno.telefoneEncarregado} />
                    <InfoRow label="Curso" value={selectedAluno.cursoNome || '—'} />
                    <InfoRow label="Matrícula" value={selectedAluno.numeroMatricula} />
                  </View>
                </View>
              </View>

              {/* ── Estatísticas globais ── */}
              <View style={S.section}>
                <Text style={S.sectionTitle}>Resumo Geral</Text>
                <View style={S.statsRow}>
                  <StatBox value={statsGlobais.mediaGlobal.toFixed(1)} label="Média Global" color={Colors.gold} />
                  <StatBox value={statsGlobais.anosComNotas} label="Anos Lectivos" color={Colors.info} />
                  <StatBox value={statsGlobais.discAprov} label="Disc. Aprovadas" color={Colors.success} />
                  <StatBox value={statsGlobais.discReprov} label="Disc. Reprovadas" color={Colors.danger} />
                  <StatBox value={statsGlobais.totalFaltas} label="Total Faltas"
                    color={statsGlobais.totalFaltas > 15 ? Colors.danger : Colors.success} />
                </View>
              </View>

              {/* ── Situação de Promoção ── */}
              {(promocaoLoading || promocaoSit) && (
                <View style={S.section}>
                  <Text style={S.sectionTitle}>Situação de Promoção</Text>
                  {promocaoLoading ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10 }}>
                      <AppLoader size="small" color={Colors.gold} />
                      <Text style={{ fontSize: 12, color: Colors.textMuted }}>A calcular situação de promoção...</Text>
                    </View>
                  ) : promocaoSit && (
                    <View style={{
                      borderRadius: 12, padding: 14, borderWidth: 1.5,
                      borderColor: promocaoSit.situacao === 'Aprovado' ? Colors.success + '60' : promocaoSit.situacao === 'Reprovado' ? Colors.danger + '60' : Colors.warning + '60',
                      backgroundColor: promocaoSit.situacao === 'Aprovado' ? Colors.success + '10' : promocaoSit.situacao === 'Reprovado' ? Colors.danger + '10' : Colors.warning + '10',
                    }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                        <Ionicons
                          name={promocaoSit.situacao === 'Aprovado' ? 'checkmark-circle' : promocaoSit.situacao === 'Reprovado' ? 'close-circle' : 'time'}
                          size={24}
                          color={promocaoSit.situacao === 'Aprovado' ? Colors.success : promocaoSit.situacao === 'Reprovado' ? Colors.danger : Colors.warning}
                        />
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 15, fontFamily: 'Inter_700Bold', color: Colors.text }}>
                            {promocaoSit.situacao}
                          </Text>
                          {promocaoSit.classe && (
                            <Text style={{ fontSize: 11, color: Colors.textMuted, fontFamily: 'Inter_400Regular' }}>
                              {promocaoSit.classe} · {promocaoSit.anoLetivo}
                            </Text>
                          )}
                        </View>
                        {promocaoSit.mediaFinal != null && (
                          <View style={{ alignItems: 'center' }}>
                            <Text style={{ fontSize: 18, fontFamily: 'Inter_700Bold', color: Colors.gold }}>
                              {Number(promocaoSit.mediaFinal).toFixed(1)}
                            </Text>
                            <Text style={{ fontSize: 10, color: Colors.textMuted }}>Média</Text>
                          </View>
                        )}
                      </View>
                      {promocaoSit.motivo && (
                        <Text style={{ fontSize: 12, color: Colors.textSecondary, fontFamily: 'Inter_400Regular', lineHeight: 18, marginBottom: 4 }}>
                          {promocaoSit.motivo}
                        </Text>
                      )}
                      {Array.isArray(promocaoSit.disciplinasNegativas) && promocaoSit.disciplinasNegativas.length > 0 && (
                        <View style={{ marginTop: 4 }}>
                          <Text style={{ fontSize: 11, fontFamily: 'Inter_600SemiBold', color: Colors.danger, marginBottom: 2 }}>
                            Disciplinas com negativa:
                          </Text>
                          {promocaoSit.disciplinasNegativas.map((d: any, i: number) => (
                            <Text key={i} style={{ fontSize: 11, color: Colors.textMuted }}>
                              · {d.disciplina}: {Number(d.nf).toFixed(1)}
                            </Text>
                          ))}
                        </View>
                      )}
                    </View>
                  )}
                </View>
              )}

              {/* ── Gráfico de evolução ── */}
              {chartData.length >= 2 && (
                <View style={S.section}>
                  <Text style={S.sectionTitle}>Evolução da Média por Ano</Text>
                  <View style={S.chartBox}>
                    <LineChart data={chartData} color={Colors.accent} height={140} width={width - 96} />
                    <View style={S.chartLegend}>
                      <View style={[S.chartLegendLine, { backgroundColor: Colors.success + '40' }]}>
                        <Text style={S.chartLegendText}>Aprovação ≥ 10</Text>
                      </View>
                    </View>
                  </View>
                </View>
              )}

              {/* ── Histórico por ano ── */}
              <Text style={S.timelineLabel}>
                <MaterialCommunityIcons name="timeline-text-outline" size={12} color={Colors.textMuted} />
                {'  '}Percurso Académico Anual
              </Text>

              {historicoAnual.length === 0 && (
                <View style={S.anoVazio}>
                  <Ionicons name="document-outline" size={32} color={Colors.textMuted} />
                  <Text style={[S.emptyMsg, { marginTop: 12, textAlign: 'center' }]}>
                    Nenhuma nota lançada ainda.{'\n'}O histórico crescerá automaticamente com a actividade académica.
                  </Text>
                </View>
              )}

              {historicoAnual.map(h => (
                <View key={h.anoKey} style={[S.anoCard, h.anoAtivo && S.anoCardActive]}>
                  {/* Cabeçalho do ano */}
                  <View style={S.anoCardHeader}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <Text style={[S.anoLabel, h.anoAtivo && { color: Colors.gold }]}>{h.anoKey}</Text>
                      {h.anoAtivo && (
                        <View style={S.actualBadge}>
                          <Text style={S.actualBadgeText}>Actual</Text>
                        </View>
                      )}
                      {(h.turmaDoAno || h.nivelDoAno) && (
                        <View style={S.anoTurmaTag}>
                          <MaterialIcons name="class" size={10} color={Colors.textMuted} />
                          <Text style={S.anoTurmaText}>
                            {h.turmaDoAno}{h.nivelDoAno ? ` · ${h.nivelDoAno}` : ''}
                          </Text>
                        </View>
                      )}
                    </View>
                    <SituacaoBadge situacao={h.situacao} />
                  </View>

                  {/* Stats do ano */}
                  <View style={S.anoStats}>
                    <View style={S.anoStatItem}>
                      <Text style={S.anoStatLbl}>Média Geral</Text>
                      <Text style={[S.anoStatVal, {
                        color: h.mediaGeral !== null
                          ? (h.mediaGeral >= 10 ? Colors.success : Colors.danger)
                          : Colors.textMuted,
                      }]}>
                        {h.mediaGeral !== null ? h.mediaGeral.toFixed(1) : '—'}
                      </Text>
                    </View>
                    <View style={S.anoStatItem}>
                      <Text style={S.anoStatLbl}>Presenças</Text>
                      <Text style={[S.anoStatVal, { color: h.presencasPct >= 75 ? Colors.success : Colors.warning }]}>
                        {h.presencasPct}%
                      </Text>
                    </View>
                    <View style={S.anoStatItem}>
                      <Text style={S.anoStatLbl}>Faltas</Text>
                      <Text style={[S.anoStatVal, { color: h.faltas > 10 ? Colors.danger : Colors.text }]}>
                        {h.faltas}
                      </Text>
                    </View>
                    <View style={S.anoStatItem}>
                      <Text style={S.anoStatLbl}>Aprovadas</Text>
                      <Text style={[S.anoStatVal, { color: Colors.success }]}>{h.discAprovadas}</Text>
                    </View>
                    <View style={S.anoStatItem}>
                      <Text style={S.anoStatLbl}>Reprovadas</Text>
                      <Text style={[S.anoStatVal, { color: h.discReprovadas > 0 ? Colors.danger : Colors.textMuted }]}>
                        {h.discReprovadas}
                      </Text>
                    </View>
                  </View>

                  {/* Pills de trimestre */}
                  {h.trimestresResumo.filter(tr => tr.notas.length > 0).length > 0 && (
                    <View style={S.trimPills}>
                      {h.trimestresResumo.filter(tr => tr.notas.length > 0).map(tr => (
                        <View key={tr.trimestre} style={[S.trimPill, { borderColor: corTrim[tr.trimestre] + '50', backgroundColor: corTrim[tr.trimestre] + '10' }]}>
                          <Text style={[S.trimPillLabel, { color: corTrim[tr.trimestre] }]}>{tr.trimestre}º Tri</Text>
                          <Text style={[S.trimPillVal, {
                            color: tr.media !== null
                              ? (tr.media >= 10 ? Colors.success : Colors.danger)
                              : Colors.textMuted,
                          }]}>
                            {tr.media !== null ? tr.media.toFixed(1) : '—'}
                          </Text>
                        </View>
                      ))}
                    </View>
                  )}

                  {/* Notas detalhadas */}
                  {h.notasAno.length > 0 && <NotasTrimestreTable notas={h.notasAno} />}

                  {h.notasAno.length === 0 && (
                    <View style={S.semNotas}>
                      <Ionicons name="document-outline" size={18} color={Colors.textMuted} />
                      <Text style={S.semNotasText}>
                        {h.anoAtivo ? 'Nenhuma nota lançada ainda.' : 'Sem notas registadas neste ano.'}
                      </Text>
                    </View>
                  )}
                </View>
              ))}
            </>
          )}
          <View style={{ height: 48 }} />
        </ScrollView>
      )}

      {/* ─── POR TURMA ─────────────────────────────────────────────────── */}
      {viewMode === 'turma' && (
        <View style={{ flex: 1 }}>

          {/* Selector de turma */}
          <TouchableOpacity style={S.selector} onPress={() => setShowTurmaSelector(v => !v)}>
            <MaterialIcons name="class" size={18} color={Colors.gold} />
            <Text style={selectedTurma ? S.selectorVal : S.selectorPlh}>
              {selectedTurma ? `${selectedTurma.nome} — ${selectedTurma.nivel}` : 'Selecionar turma...'}
            </Text>
            <Ionicons name={showTurmaSelector ? 'chevron-up' : 'chevron-down'} size={16} color={Colors.textMuted} />
          </TouchableOpacity>

          {showTurmaSelector && (
            <View style={S.dropdown}>
              {turmasAtivas.map(t => (
                <TouchableOpacity
                  key={t.id}
                  style={[S.dropItem, selectedTurmaId === t.id && S.dropItemActive]}
                  onPress={() => { setSelectedTurmaId(t.id); setShowTurmaSelector(false); }}
                >
                  <MaterialIcons name="class" size={18} color={Colors.gold} style={{ marginRight: 8 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={[S.dropdownText, selectedTurmaId === t.id && { color: Colors.gold, fontFamily: 'Inter_600SemiBold' }]}>
                      {t.nome}
                    </Text>
                    <Text style={S.dropSub}>{t.nivel} — {t.turno}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {loadingTurma && (
            <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
              <SkeletonTable rows={8} cols={4} />
            </View>
          )}

          {!loadingTurma && selectedTurma && (
            <>
              {/* Cabeçalho da turma */}
              <View style={S.turmaHeader}>
                <View style={S.turmaHeaderLeft}>
                  <Text style={S.turmaNome}>{selectedTurma.nome}</Text>
                  <Text style={S.turmaSub}>{selectedTurma.nivel} — {selectedTurma.turno}</Text>
                </View>
                <Text style={S.turmaAno}>{anoSelecionado?.ano || ''}</Text>
              </View>

              {/* Estatísticas da turma */}
              <View style={S.turmaStats}>
                <StatBox value={totalAlunos} label="Alunos" color={Colors.info} />
                <StatBox value={aprovados} label="Aprovados" color={Colors.success} />
                <StatBox value={reprovados} label="Reprovados" color={Colors.danger} />
                <StatBox value={mediaTurma > 0 ? mediaTurma.toFixed(1) : '—'} label="Média" color={Colors.gold} />
              </View>

              {/* Estado vazio com CTA */}
              {totalAlunos === 0 && (
                <View style={S.empty}>
                  <MaterialCommunityIcons name="account-group-outline" size={56} color={Colors.textMuted} />
                  <Text style={S.emptyTitle}>Nenhum aluno nesta turma</Text>
                  <Text style={S.emptyMsg}>
                    Os alunos precisam de ser atribuídos à turma para aparecerem no histórico.
                    {'\n'}Aceda à gestão de alunos para fazer essa atribuição.
                  </Text>
                  <TouchableOpacity
                    style={S.ctaBtn}
                    onPress={() => router.push('/(main)/alunos' as any)}
                  >
                    <Ionicons name="person-add-outline" size={16} color="#fff" />
                    <Text style={S.ctaBtnText}>Gerir Alunos</Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* Tabela de alunos */}
              {totalAlunos > 0 && (
                <>
                  <View style={S.tblHeader2}>
                    <Text style={[S.tblCol2, { flex: 1 }]}>Aluno</Text>
                    <Text style={[S.tblCol2, { width: 36, textAlign: 'center', color: Colors.info }]}>T1</Text>
                    <Text style={[S.tblCol2, { width: 36, textAlign: 'center', color: Colors.warning }]}>T2</Text>
                    <Text style={[S.tblCol2, { width: 36, textAlign: 'center', color: Colors.success }]}>T3</Text>
                    <Text style={[S.tblCol2, { width: 50, textAlign: 'center' }]}>Média</Text>
                    <Text style={[S.tblCol2, { width: 74, textAlign: 'right' }]}>Situação</Text>
                  </View>
                  <FlatList
                    data={paginatedTurmaAlunos}
                    keyExtractor={item => item.aluno.id}
                    renderItem={({ item, index }) => (
                      <TouchableOpacity
                        style={[S.turmaRow, index % 2 === 0 && S.turmaRowAlt]}
                        onPress={() => { setSelectedAlunoId(item.aluno.id); setViewMode('aluno'); }}
                        activeOpacity={0.75}
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={S.turmaAlunoNome}>{item.aluno.nome} {item.aluno.apelido}</Text>
                          <Text style={S.turmaAlunoMat}>{item.aluno.numeroMatricula}</Text>
                        </View>
                        {item.porTrimestre.map((pt: any) => (
                          <Text key={pt.trimestre} style={[S.turmaTrimVal, {
                            color: pt.media !== null ? (pt.media >= 10 ? Colors.success : Colors.danger) : Colors.textMuted,
                          }]}>
                            {pt.media !== null ? pt.media.toFixed(1) : '—'}
                          </Text>
                        ))}
                        <Text style={[S.turmaMediaVal, { color: item.media >= 10 ? Colors.success : Colors.danger }]}>
                          {item.media > 0 ? item.media.toFixed(1) : '—'}
                        </Text>
                        <View style={{ width: 74, alignItems: 'flex-end' }}>
                          <SituacaoBadge situacao={item.situacao} />
                        </View>
                      </TouchableOpacity>
                    )}
                    showsVerticalScrollIndicator={false}
                    ListFooterComponent={<PaginationBar current={safePageTurma} total={totalPagesTurma} onChange={setCurrentPageTurma} />}
                  />
                </>
              )}
            </>
          )}
        </View>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const S = StyleSheet.create({
  container:      { flex: 1, backgroundColor: Colors.background },

  banner:         { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 8, backgroundColor: Colors.backgroundCard, borderBottomWidth: 1, borderBottomColor: Colors.border },
  bannerText:     { flex: 1, fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted, fontStyle: 'italic' },

  tabs:           { flexDirection: 'row', backgroundColor: Colors.primaryDark, borderBottomWidth: 1, borderBottomColor: Colors.border },
  tab:            { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderBottomWidth: 3, borderBottomColor: 'transparent' },
  tabActive:      { borderBottomColor: Colors.gold },
  tabText:        { fontSize: 14, fontFamily: 'Inter_600SemiBold', color: Colors.textSecondary },
  tabTextActive:  { color: Colors.gold },

  scroll:         { flex: 1 },

  selector:       { flexDirection: 'row', alignItems: 'center', gap: 10, margin: 16, marginBottom: 0, backgroundColor: Colors.backgroundCard, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: Colors.border },
  selectorVal:    { flex: 1, fontSize: 14, fontFamily: 'Inter_500Medium', color: Colors.text },
  selectorPlh:    { flex: 1, fontSize: 14, fontFamily: 'Inter_400Regular', color: Colors.textMuted },

  dropdown:       { marginHorizontal: 16, marginTop: 2, backgroundColor: Colors.surface, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, maxHeight: 220, overflow: 'hidden' },
  dropItem:       { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: Colors.border },
  dropItemActive: { backgroundColor: Colors.gold + '15' },
  dropAvatar:     { width: 32, height: 32, borderRadius: 16, backgroundColor: Colors.accent, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  dropAvatarText: { fontSize: 13, fontFamily: 'Inter_700Bold', color: '#fff' },
  dropdownText:   { fontSize: 14, fontFamily: 'Inter_400Regular', color: Colors.text },
  dropSub:        { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 2 },

  empty:          { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 48 },
  emptyTitle:     { fontSize: 17, fontFamily: 'Inter_700Bold', color: Colors.text, marginTop: 16, marginBottom: 8 },
  emptyMsg:       { fontSize: 13, fontFamily: 'Inter_400Regular', color: Colors.textMuted, textAlign: 'center', lineHeight: 20 },

  ctaBtn:         { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 20, backgroundColor: Colors.accent, borderRadius: 12, paddingHorizontal: 20, paddingVertical: 12 },
  ctaBtnText:     { fontSize: 14, fontFamily: 'Inter_600SemiBold', color: '#fff' },

  // Aluno Card
  alunoCard:      { flexDirection: 'row', alignItems: 'center', gap: 14, margin: 16, marginBottom: 0, backgroundColor: Colors.backgroundCard, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: Colors.border },
  alunoAvatar:    { width: 52, height: 52, borderRadius: 26, backgroundColor: Colors.accent, alignItems: 'center', justifyContent: 'center' },
  alunoAvatarText:{ fontSize: 18, fontFamily: 'Inter_700Bold', color: '#fff' },
  alunoNome:      { fontSize: 16, fontFamily: 'Inter_700Bold', color: Colors.text },
  alunoMat:       { fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 2 },
  turmaTag:       { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  turmaTagText:   { fontSize: 11, fontFamily: 'Inter_500Medium', color: Colors.gold },

  // Sections
  section:        { marginHorizontal: 16, marginTop: 16, backgroundColor: Colors.backgroundCard, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: Colors.border },
  sectionTitle:   { fontSize: 11, fontFamily: 'Inter_700Bold', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 14 },

  // Info grid
  infoGrid:       { flexDirection: 'row', gap: 12 },
  infoGridCol:    { flex: 1, gap: 8 },
  infoRow:        { gap: 2 },
  infoLabel:      { fontSize: 10, fontFamily: 'Inter_400Regular', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  infoValue:      { fontSize: 13, fontFamily: 'Inter_500Medium', color: Colors.text },

  // Stats
  statsRow:       { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  statBox:        { flex: 1, minWidth: 70, backgroundColor: Colors.backgroundElevated, borderRadius: 12, padding: 12, alignItems: 'center' },
  statVal:        { fontSize: 22, fontFamily: 'Inter_700Bold' },
  statLbl:        { fontSize: 10, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 3, textAlign: 'center' },

  // Chart
  chartBox:       { alignItems: 'center' },
  chartLegend:    { marginTop: 6, alignSelf: 'flex-start' },
  chartLegendLine:{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  chartLegendText:{ fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted },

  // Timeline
  timelineLabel:  { fontSize: 11, fontFamily: 'Inter_600SemiBold', color: Colors.textMuted, paddingHorizontal: 16, paddingTop: 20, paddingBottom: 8, textTransform: 'uppercase', letterSpacing: 1 },

  // Ano Card
  anoCard:        { marginHorizontal: 16, marginBottom: 14, backgroundColor: Colors.backgroundCard, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: Colors.border },
  anoCardActive:  { borderColor: Colors.gold + '55', backgroundColor: Colors.backgroundCard },
  anoCardHeader:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  anoLabel:       { fontSize: 20, fontFamily: 'Inter_700Bold', color: Colors.text },
  actualBadge:    { backgroundColor: Colors.gold + '30', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  actualBadgeText:{ fontSize: 10, fontFamily: 'Inter_700Bold', color: Colors.gold },
  anoTurmaTag:    { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.surface, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  anoTurmaText:   { fontSize: 10, fontFamily: 'Inter_500Medium', color: Colors.textSecondary },

  anoStats:       { flexDirection: 'row', gap: 6, marginBottom: 14 },
  anoStatItem:    { flex: 1, backgroundColor: Colors.backgroundElevated, borderRadius: 10, padding: 10, alignItems: 'center' },
  anoStatLbl:     { fontSize: 9, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginBottom: 4, textAlign: 'center', textTransform: 'uppercase', letterSpacing: 0.4 },
  anoStatVal:     { fontSize: 16, fontFamily: 'Inter_700Bold' },

  // Trim pills
  trimPills:      { flexDirection: 'row', gap: 8, marginBottom: 14 },
  trimPill:       { flex: 1, alignItems: 'center', borderRadius: 10, borderWidth: 1, padding: 10 },
  trimPillLabel:  { fontSize: 10, fontFamily: 'Inter_700Bold', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 3 },
  trimPillVal:    { fontSize: 18, fontFamily: 'Inter_700Bold' },

  // Notas table
  trimContainer:  { gap: 10 },
  trimBlock:      { borderRadius: 12, overflow: 'hidden', borderWidth: 1 },
  trimHeader:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 10, borderLeftWidth: 3 },
  trimHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  trimDot:        { width: 8, height: 8, borderRadius: 4 },
  trimTitle:      { fontSize: 13, fontFamily: 'Inter_700Bold' },
  pendenteBadge:  { backgroundColor: Colors.warning + '22', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  pendenteText:   { fontSize: 9, fontFamily: 'Inter_600SemiBold', color: Colors.warning },
  mediaBadge:     { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, borderWidth: 1 },
  mediaBadgeText: { fontSize: 12, fontFamily: 'Inter_700Bold' },
  tblHeader:      { flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 8, backgroundColor: Colors.primaryLight },
  tblCol:         { fontSize: 10, fontFamily: 'Inter_700Bold', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  tblRow:         { flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 9, borderTopWidth: 1, borderTopColor: Colors.border, alignItems: 'center' },
  tblCell:        { fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.text },
  parcialTag:     { fontSize: 8, fontFamily: 'Inter_600SemiBold', color: Colors.warning, backgroundColor: Colors.warning + '20', borderRadius: 4, paddingHorizontal: 4, paddingVertical: 1 },

  semNotas:       { paddingVertical: 14, alignItems: 'center', gap: 4 },
  semNotasText:   { fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textMuted },

  anoVazio:       { margin: 16, backgroundColor: Colors.backgroundCard, borderRadius: 16, padding: 32, alignItems: 'center', borderWidth: 1, borderColor: Colors.border },

  // Turma view
  turmaHeader:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, backgroundColor: Colors.backgroundCard, borderBottomWidth: 1, borderBottomColor: Colors.border },
  turmaHeaderLeft:{ gap: 3 },
  turmaNome:      { fontSize: 18, fontFamily: 'Inter_700Bold', color: Colors.text },
  turmaSub:       { fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textMuted },
  turmaAno:       { fontSize: 14, fontFamily: 'Inter_600SemiBold', color: Colors.gold },

  turmaStats:     { flexDirection: 'row', paddingHorizontal: 16, paddingTop: 14, paddingBottom: 4, gap: 8 },

  tblHeader2:     { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, backgroundColor: Colors.surface, borderTopWidth: 1, borderTopColor: Colors.border, marginTop: 8 },
  tblCol2:        { fontSize: 10, fontFamily: 'Inter_700Bold', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },

  turmaRow:       { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: Colors.border },
  turmaRowAlt:    { backgroundColor: Colors.backgroundCard },
  turmaAlunoNome: { fontSize: 13, fontFamily: 'Inter_500Medium', color: Colors.text },
  turmaAlunoMat:  { fontSize: 10, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 1 },
  turmaTrimVal:   { width: 36, fontSize: 13, fontFamily: 'Inter_600SemiBold', textAlign: 'center' },
  turmaMediaVal:  { width: 50, fontSize: 15, fontFamily: 'Inter_700Bold', textAlign: 'center' },

  // Badge
  badge:          { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  badgeText:      { fontSize: 11, fontFamily: 'Inter_600SemiBold' },

  // Botão Ver / Imprimir PDF
  pdfBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 9,
    backgroundColor: Colors.gold + '1F',
    borderWidth: 1,
    borderColor: Colors.gold + '66',
  },
  pdfBtnText: {
    fontSize: 12,
    fontFamily: 'Inter_700Bold',
    color: Colors.gold,
  },

  // PDF preview
  previewModal:   { flex: 1, backgroundColor: Colors.background },
  previewHeader:  { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 12, backgroundColor: Colors.primaryDark, borderBottomWidth: 1, borderBottomColor: Colors.border },
  previewTitle:   { fontSize: 15, fontFamily: 'Inter_700Bold', color: Colors.text },
  previewSub:     { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 2 },
  previewPrintBtn:{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.accent, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 9 },
  previewPrintTxt:{ fontSize: 13, fontFamily: 'Inter_600SemiBold', color: '#fff' },
  previewCloseBtn:{ padding: 6 },
  previewBody:    { flex: 1 },
});

const pgH = StyleSheet.create({
  bar:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', gap: 4, paddingVertical: 10, paddingHorizontal: 12, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.07)', backgroundColor: Colors.background },
  navBtn:      { width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  disabled:    { opacity: 0.35 },
  pageBtn:     { minWidth: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6, backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  pageBtnActive: { backgroundColor: Colors.gold, borderColor: Colors.gold },
  pageTxt:     { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: '#9aa5be' },
  pageTxtActive: { color: '#0a0f1e' },
  ellipsis:    { fontSize: 12, color: '#3a4a6b', paddingHorizontal: 2 },
  label:       { fontSize: 11, fontFamily: 'Inter_400Regular', color: '#4a5a7b', marginLeft: 8 },
});
