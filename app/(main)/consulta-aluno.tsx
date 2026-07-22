import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useTabMemory } from '@/hooks/useTabMemory';
import { matchAno } from '@/utils/anoUtils';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, Platform, Linking,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors } from '@/constants/colors';
import { useAuth, getAuthToken } from '@/context/AuthContext';
import TopBar from '@/components/TopBar';
import AppLoader from '@/components/AppLoader';

// ─── Types ────────────────────────────────────────────────────────────────────
interface AlunoResult {
  id: string;
  nome: string;
  apelido: string;
  numeroMatricula: string;
  numeroBi?: string;
  genero?: string;
  dataNascimento?: string;
  situacao?: string;
  foto?: string;
  nomeEncarregado?: string;
  telefoneEncarregado?: string;
  turmaNome?: string;
  turmaClasse?: string;
  turmaTurno?: string;
  turmaAnoLetivo?: string;
  turmaNivel?: string;
}

interface Nota {
  id: string;
  disciplina: string;
  trimestre: number;
  mt1?: number; mt?: number; nf?: number;
  mac?: number; pg1?: number; pg2?: number;
  anoLetivo: string;
  turmaNome?: string;
  turmaNivel?: string;
}

interface Presenca {
  id: string;
  data: string;
  status: 'P' | 'F' | 'J';
  turmaNome?: string;
  disciplina?: string;
}

interface Propina {
  id: string;
  ano: number;
  mes: number;
  valor: number;
  status: string;
  taxaDescricao?: string;
  taxaTipo?: string;
  createdAt?: string;
}

interface Documento {
  id: string;
  tipo: string;
  emitidoEm: string;
  emitidoPor?: string;
  finalidade?: string;
}

interface Historico {
  aluno: AlunoResult & Record<string, any>;
  notas: Nota[];
  presencas: Presenca[];
  propinas: Propina[];
  anos: any[];
}

interface Reconfirmacao {
  id: string;
  alunoId: string;
  anoLetivo: string;
  status: string;
  data: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const MESES = ['', 'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

function fmtData(d?: string) {
  if (!d) return '—';
  try { return new Date(d).toLocaleDateString('pt-PT'); } catch { return d; }
}

function fmtAOA(v?: number) {
  if (v == null) return '—';
  return Number(v).toLocaleString('pt-AO', { maximumFractionDigits: 0 }) + ' Kz';
}

function calcIdade(dn?: string) {
  if (!dn) return '—';
  const diff = Date.now() - new Date(dn).getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24 * 365.25)) + ' anos';
}

function situacaoLabel(s?: string) {
  const map: Record<string, string> = {
    activo: 'Activo', desistente: 'Desistente', transferido: 'Transferido',
    excluido: 'Excluído', concluido: 'Concluído', anulacao_matricula: 'Anulação',
  };
  return map[s || ''] || s || 'Activo';
}

function situacaoColor(s?: string) {
  if (s === 'activo' || !s) return Colors.success;
  if (s === 'concluido') return Colors.info;
  return Colors.danger;
}

function gradeColor(n?: number) {
  if (n == null) return Colors.textMuted;
  if (n >= 14) return Colors.success;
  if (n >= 10) return Colors.warning;
  return Colors.danger;
}

function docTipoLabel(tipo: string) {
  const map: Record<string, string> = {
    declaracao: 'Declaração de Matrícula',
    certificado: 'Certificado de Habilitações',
    boletim: 'Boletim de Notas',
    atestado: 'Atestado de Frequência',
    historico: 'Histórico Escolar',
    ficha_individual: 'Ficha Individual',
  };
  return map[tipo] || tipo;
}

const TABS = ['Resumo', 'Identificação', 'Notas', 'Financeiro', 'Assiduidade', 'Documentos'] as const;
type Tab = typeof TABS[number];

// ─── Iniciais Avatar ──────────────────────────────────────────────────────────
function Avatar({ nome, apelido, genero, size = 56 }: { nome: string; apelido?: string; genero?: string; size?: number }) {
  const ini = `${(nome || '?').charAt(0)}${(apelido || '').charAt(0)}`.toUpperCase();
  const bg = genero === 'F' ? '#ec4899' : Colors.accent;
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: '#fff', fontWeight: '700', fontSize: size * 0.36 }}>{ini}</Text>
    </View>
  );
}

// ─── Section Header ────────────────────────────────────────────────────────────
function SectionHeader({ icon, label }: { icon: string; label: string }) {
  return (
    <View style={styles.sectionHeader}>
      <MaterialCommunityIcons name={icon as any} size={16} color={Colors.accent} />
      <Text style={styles.sectionHeaderText}>{label}</Text>
    </View>
  );
}

// ─── Info Row ─────────────────────────────────────────────────────────────────
function InfoRow({ label, value, valueColor }: { label: string; value?: string; valueColor?: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={[styles.infoValue, valueColor ? { color: valueColor } : null]}>{value || '—'}</Text>
    </View>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function ConsultaAlunoScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();

  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<AlunoResult[]>([]);
  const [selected, setSelected] = useState<AlunoResult | null>(null);
  const [historico, setHistorico] = useState<Historico | null>(null);
  const [documentos, setDocumentos] = useState<Documento[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [activeTab, setActiveTab] = useTabMemory<Tab>('consulta-aluno', 'Resumo');
  const [pdfLoading, setPdfLoading] = useState(false);
  const [reconfirmacoes, setReconfirmacoes] = useState<Reconfirmacao[]>([]);

  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ─── Search ────────────────────────────────────────────────────────────────
  const [searchError, setSearchError] = useState<string | null>(null);

  const doSearch = useCallback(async (q: string) => {
    if (!q || q.trim().length < 2) { setResults([]); setSearching(false); setSearchError(null); return; }
    setSearching(true);
    setSearchError(null);
    try {
      const tok = await getAuthToken();
      const res = await fetch(`/api/alunos/busca?q=${encodeURIComponent(q.trim())}`, {
        headers: tok ? { Authorization: `Bearer ${tok}` } : {},
      });
      if (res.status === 401) {
        setSearchError('Sessão expirada. Por favor faça login novamente.');
        setResults([]);
        if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('siga:session-expired'));
        return;
      }
      if (!res.ok) {
        setSearchError('Erro ao pesquisar. Tente novamente.');
        setResults([]);
        return;
      }
      const data = await res.json();
      setResults(Array.isArray(data) ? data : []);
    } catch { setResults([]); setSearchError('Sem ligação ao servidor.'); }
    finally { setSearching(false); }
  }, []);

  const handleQueryChange = (v: string) => {
    setQuery(v);
    if (selected) { setSelected(null); setHistorico(null); setDocumentos([]); }
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => doSearch(v), 350);
  };

  // ─── Load Detail ──────────────────────────────────────────────────────────
  const loadDetail = useCallback(async (aluno: AlunoResult) => {
    setSelected(aluno);
    setResults([]);
    setActiveTab('Resumo');
    setLoadingDetail(true);
    setReconfirmacoes([]);
    try {
      const tok = await getAuthToken();
      const headers = tok ? { Authorization: `Bearer ${tok}` } : {};
      const [histRes, docsRes, reconfRes] = await Promise.all([
        fetch(`/api/historico/aluno/${aluno.id}`, { headers }),
        fetch(`/api/documentos-emitidos/aluno/${aluno.id}`, { headers }),
        fetch(`/api/reconfirmacoes-matricula?alunoId=${aluno.id}`, { headers }),
      ]);
      if (histRes.ok) {
        const d = await histRes.json();
        setHistorico(d);
      }
      if (docsRes.ok) {
        const d = await docsRes.json();
        setDocumentos(Array.isArray(d) ? d : []);
      }
      if (reconfRes.ok) {
        const d = await reconfRes.json();
        setReconfirmacoes(Array.isArray(d) ? d : []);
      }
    } catch { }
    finally { setLoadingDetail(false); }
  }, []);

  // ─── Open PDF ─────────────────────────────────────────────────────────────
  const openFicha = async () => {
    if (!selected) return;
    const tok = await getAuthToken();
    const url = `/api/alunos/${selected.id}/ficha?trimestre=anual`;
    const fullUrl = tok ? `${url}&token=${encodeURIComponent(tok)}` : url;
    if (Platform.OS === 'web') {
      window.open(fullUrl, '_blank');
    } else {
      Linking.openURL(fullUrl);
    }
  };

  // ─── Computed Stats ───────────────────────────────────────────────────────
  const stats = React.useMemo(() => {
    if (!historico) return null;
    const { notas, presencas, propinas } = historico;

    const totalFaltas = presencas.filter(p => p.status === 'F').length;
    const totalJust = presencas.filter(p => p.status === 'J').length;
    const totalPres = presencas.length;
    const assiduidade = totalPres > 0 ? Math.round(((totalPres - totalFaltas) / totalPres) * 100) : null;

    const pendentes = propinas.filter(p => p.status === 'pendente' || p.status === 'em_atraso');
    const totalDevido = pendentes.reduce((s, p) => s + Number(p.valor || 0), 0);
    const totalPago = propinas.filter(p => p.status === 'pago').reduce((s, p) => s + Number(p.valor || 0), 0);

    const disciplinas = Array.from(new Set(notas.map(n => n.disciplina)));
    const mediasDisc = disciplinas.map(disc => {
      const ns = notas.filter(n => n.disciplina === disc);
      const vals = ns.map(n => n.mt1 ?? n.mt).filter((v): v is number => v != null);
      return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
    }).filter((v): v is number => v != null);
    const mediaGeral = mediasDisc.length ? mediasDisc.reduce((a, b) => a + b, 0) / mediasDisc.length : null;
    const reprovadas = mediasDisc.filter(m => m < 10).length;

    return { totalFaltas, totalJust, totalPres, assiduidade, pendentes: pendentes.length, totalDevido, totalPago, mediaGeral, reprovadas, totalDisciplinas: disciplinas.length };
  }, [historico]);

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <View style={[styles.root, { paddingBottom: insets.bottom }]}>
      <TopBar title="Consulta de Aluno" leftAction={{ icon: 'arrow-back', onPress: () => router.back() }} />

      {/* Search Bar */}
      <View style={styles.searchWrap}>
        <Ionicons name="search" size={18} color={Colors.textMuted} style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={handleQueryChange}
          placeholder="Pesquisar por nome, nº de matrícula ou BI..."
          placeholderTextColor={Colors.textMuted}
          autoCorrect={false}
          autoCapitalize="words"
          returnKeyType="search"
        />
        {query.length > 0 && (
          <TouchableOpacity onPress={() => { setQuery(''); setResults([]); setSelected(null); setHistorico(null); }} style={styles.clearBtn}>
            <Ionicons name="close-circle" size={18} color={Colors.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      {/* Search Results Dropdown */}
      {(searching || results.length > 0 || !!searchError) && !selected && (
        <View style={styles.resultsList}>
          {searching ? (
            <View style={styles.resultLoading}>
              <ActivityIndicator size="small" color={Colors.accent} />
              <Text style={styles.resultLoadingText}>A pesquisar...</Text>
            </View>
          ) : searchError ? (
            <View style={styles.resultLoading}>
              <Ionicons name="alert-circle-outline" size={18} color={Colors.danger} />
              <Text style={[styles.resultLoadingText, { color: Colors.danger, marginLeft: 6 }]}>{searchError}</Text>
            </View>
          ) : (
            <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 320 }}>
              {results.length === 0 ? (
                <Text style={styles.noResults}>Nenhum aluno encontrado.</Text>
              ) : results.map(a => (
                <TouchableOpacity key={a.id} style={styles.resultItem} onPress={() => loadDetail(a)}>
                  <Avatar nome={a.nome} apelido={a.apelido} genero={a.genero} size={40} />
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={styles.resultName}>{a.nome} {a.apelido}</Text>
                    <Text style={styles.resultSub}>
                      {a.numeroMatricula ? `Nº ${a.numeroMatricula}` : ''}
                      {a.turmaNome ? ` · ${a.turmaNome}` : ''}
                      {a.turmaAnoLetivo ? ` · ${a.turmaAnoLetivo}` : ''}
                    </Text>
                  </View>
                  <View style={[styles.situacaoBadge, { backgroundColor: situacaoColor(a.situacao) + '22' }]}>
                    <Text style={[styles.situacaoText, { color: situacaoColor(a.situacao) }]}>{situacaoLabel(a.situacao)}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
        </View>
      )}

      {/* Empty State */}
      {!selected && results.length === 0 && !searching && query.length < 2 && (
        <View style={styles.emptyState}>
          <MaterialCommunityIcons name="account-search" size={72} color={Colors.textMuted} />
          <Text style={styles.emptyTitle}>Pesquisar Aluno</Text>
          <Text style={styles.emptySubtitle}>Digite o nome, número de matrícula ou BI do aluno para consultar o seu dossier completo.</Text>
        </View>
      )}

      {/* Detail View */}
      {selected && (
        <View style={{ flex: 1 }}>
          {/* Student Header Card */}
          <LinearGradient colors={[Colors.primaryDark, Colors.primary]} style={styles.studentHeader}>
            <View style={styles.headerRow}>
              <Avatar nome={selected.nome} apelido={selected.apelido} genero={selected.genero} size={60} />
              <View style={{ flex: 1, marginLeft: 14 }}>
                <Text style={styles.headerName}>{selected.nome} {selected.apelido}</Text>
                <Text style={styles.headerSub}>
                  {selected.turmaNome || 'Sem turma'}
                  {selected.turmaAnoLetivo ? ` · ${selected.turmaAnoLetivo}` : ''}
                  {selected.turmaClasse ? ` · ${selected.turmaClasse}` : ''}
                </Text>
                <View style={styles.headerBadges}>
                  <View style={[styles.badge, { backgroundColor: situacaoColor(selected.situacao) + '33' }]}>
                    <Text style={[styles.badgeText, { color: situacaoColor(selected.situacao) }]}>{situacaoLabel(selected.situacao)}</Text>
                  </View>
                  {selected.numeroMatricula && (
                    <View style={[styles.badge, { backgroundColor: Colors.accent + '33' }]}>
                      <Text style={[styles.badgeText, { color: Colors.accent }]}>Nº {selected.numeroMatricula}</Text>
                    </View>
                  )}
                </View>
              </View>
              <TouchableOpacity style={styles.pdfBtn} onPress={openFicha}>
                <MaterialCommunityIcons name="file-pdf-box" size={20} color="#fff" />
                <Text style={styles.pdfBtnText}>Ficha</Text>
              </TouchableOpacity>
            </View>
          </LinearGradient>

          {/* Tab Bar */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabBar} contentContainerStyle={styles.tabBarContent}>
            {TABS.map(tab => (
              <TouchableOpacity key={tab} style={[styles.tab, activeTab === tab && styles.tabActive]} onPress={() => setActiveTab(tab)}>
                <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>{tab}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Tab Content */}
          {loadingDetail ? (
            <View style={styles.detailLoading}>
              <ActivityIndicator size="large" color={Colors.accent} />
              <Text style={styles.detailLoadingText}>A carregar ficha do aluno...</Text>
            </View>
          ) : (
            <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.tabContent} showsVerticalScrollIndicator={false}>
              {activeTab === 'Resumo' && <ResumoTab aluno={selected} historico={historico} stats={stats} />}
              {activeTab === 'Identificação' && <IdentificacaoTab aluno={historico?.aluno || selected} reconfirmacoes={reconfirmacoes} />}
              {activeTab === 'Notas' && <NotasTab notas={historico?.notas || []} />}
              {activeTab === 'Financeiro' && <FinanceiroTab propinas={historico?.propinas || []} stats={stats} />}
              {activeTab === 'Assiduidade' && <AssiduidadeTab presencas={historico?.presencas || []} stats={stats} />}
              {activeTab === 'Documentos' && <DocumentosTab documentos={documentos} alunoId={selected.id} />}
            </ScrollView>
          )}
        </View>
      )}
    </View>
  );
}

// ─── Resumo Tab ────────────────────────────────────────────────────────────────
function ResumoTab({ aluno, historico, stats }: { aluno: AlunoResult; historico: Historico | null; stats: any }) {
  if (!historico || !stats) {
    return (
      <View style={styles.card}>
        <Text style={styles.noDataText}>Sem dados históricos disponíveis para este aluno.</Text>
      </View>
    );
  }

  const indicators = [
    {
      icon: 'cash-multiple',
      label: 'Situação Financeira',
      value: stats.pendentes === 0 ? 'Em dia' : `${stats.pendentes} propina(s) em dívida`,
      sub: stats.pendentes > 0 ? `Total em dívida: ${fmtAOA(stats.totalDevido)}` : `Total pago: ${fmtAOA(stats.totalPago)}`,
      color: stats.pendentes === 0 ? Colors.success : Colors.danger,
      ok: stats.pendentes === 0,
    },
    {
      icon: 'calendar-check',
      label: 'Assiduidade',
      value: stats.assiduidade != null ? `${stats.assiduidade}%` : '—',
      sub: `${stats.totalFaltas} faltas inj. · ${stats.totalJust} faltas just.`,
      color: stats.assiduidade == null ? Colors.textMuted : stats.assiduidade >= 75 ? Colors.success : Colors.danger,
      ok: stats.assiduidade == null || stats.assiduidade >= 75,
    },
    {
      icon: 'school',
      label: 'Desempenho Académico',
      value: stats.mediaGeral != null ? `Média: ${stats.mediaGeral.toFixed(1)}` : '—',
      sub: `${stats.reprovadas} disciplina(s) abaixo de 10 valores`,
      color: stats.mediaGeral == null ? Colors.textMuted : stats.mediaGeral >= 10 ? Colors.success : Colors.danger,
      ok: stats.mediaGeral == null || (stats.mediaGeral >= 10 && stats.reprovadas === 0),
    },
  ];

  return (
    <>
      <SectionHeader icon="chart-box" label="INDICADORES GERAIS" />
      {indicators.map((ind, i) => (
        <View key={i} style={[styles.card, styles.indicatorCard]}>
          <View style={[styles.indicatorIcon, { backgroundColor: ind.color + '22' }]}>
            <MaterialCommunityIcons name={ind.icon as any} size={24} color={ind.color} />
          </View>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={styles.indicatorLabel}>{ind.label}</Text>
            <Text style={[styles.indicatorValue, { color: ind.color }]}>{ind.value}</Text>
            <Text style={styles.indicatorSub}>{ind.sub}</Text>
          </View>
          <Ionicons name={ind.ok ? 'checkmark-circle' : 'alert-circle'} size={24} color={ind.color} />
        </View>
      ))}

      <SectionHeader icon="account-details" label="DADOS RÁPIDOS" />
      <View style={styles.card}>
        <InfoRow label="Data de Nascimento" value={fmtData(aluno.dataNascimento)} />
        <InfoRow label="Idade" value={calcIdade(aluno.dataNascimento)} />
        <InfoRow label="BI" value={aluno.numeroBi} />
        <InfoRow label="Encarregado" value={aluno.nomeEncarregado} />
        <InfoRow label="Contacto Encarregado" value={aluno.telefoneEncarregado} />
        <InfoRow label="Turma" value={aluno.turmaNome} />
        <InfoRow label="Ano Lectivo" value={aluno.turmaAnoLetivo} />
      </View>
    </>
  );
}

// ─── Identificação Tab ────────────────────────────────────────────────────────
function IdentificacaoTab({ aluno, reconfirmacoes }: { aluno: any; reconfirmacoes: Reconfirmacao[] }) {
  const nRepetencias = reconfirmacoes.length;
  const isRepetente  = nRepetencias > 1;

  function statusReconfLabel(s: string) {
    const m: Record<string, string> = {
      confirmado: 'Confirmado', pendente: 'Pendente', cancelado: 'Cancelado',
    };
    return m[s] || s;
  }
  function statusReconfColor(s: string) {
    if (s === 'confirmado') return Colors.success;
    if (s === 'cancelado')  return Colors.danger;
    return Colors.warning;
  }

  return (
    <>
      <SectionHeader icon="card-account-details" label="DADOS PESSOAIS" />
      <View style={styles.card}>
        <InfoRow label="Nome Completo" value={`${aluno.nome || ''} ${aluno.apelido || ''}`} />
        <InfoRow label="Género" value={aluno.genero === 'M' ? 'Masculino' : aluno.genero === 'F' ? 'Feminino' : undefined} />
        <InfoRow label="Data de Nascimento" value={fmtData(aluno.dataNascimento)} />
        <InfoRow label="Idade" value={calcIdade(aluno.dataNascimento)} />
        <InfoRow label="Província" value={aluno.provincia} />
        <InfoRow label="Município" value={aluno.municipio} />
        <InfoRow label="Morada" value={aluno.morada} />
      </View>

      <SectionHeader icon="shield-account" label="IDENTIFICAÇÃO OFICIAL" />
      <View style={styles.card}>
        <InfoRow label="Nº do Bilhete de Identidade" value={aluno.numeroBi} />
        <InfoRow label="Data de Emissão do BI" value={aluno.biDataEmissao} />
        <InfoRow label="Local de Emissão do BI" value={aluno.biLocalEmissao} />
        <InfoRow label="Nº da Cédula" value={aluno.numeroCedula} />
        <InfoRow label="Nº de Matrícula" value={aluno.numeroMatricula} />
      </View>

      <SectionHeader icon="account-supervisor" label="ENCARREGADO DE EDUCAÇÃO" />
      <View style={styles.card}>
        <InfoRow label="Nome" value={aluno.nomeEncarregado} />
        <InfoRow label="Telefone" value={aluno.telefoneEncarregado} />
        <InfoRow label="Email" value={aluno.emailEncarregado} />
        <InfoRow label="Profissão" value={aluno.encarregadoProfissao} />
        <InfoRow label="Local de Trabalho" value={aluno.encarregadoLocalTrabalho} />
        <InfoRow label="Residência" value={aluno.encarregadoResidencia} />
        <InfoRow label="Contacto 2" value={aluno.encarregadoContacto2} />
      </View>

      <SectionHeader icon="school" label="SITUAÇÃO ACADÉMICA" />
      <View style={styles.card}>
        <InfoRow label="Turma Actual" value={aluno.turmaNome} />
        <InfoRow label="Classe" value={aluno.turmaClasse} />
        <InfoRow label="Turno" value={aluno.turmaTurno} />
        <InfoRow label="Nível" value={aluno.turmaNivel} />
        <InfoRow label="Ano Lectivo" value={aluno.turmaAnoLetivo} />
        <InfoRow label="Situação" value={situacaoLabel(aluno.situacao)} valueColor={situacaoColor(aluno.situacao)} />
        <InfoRow label="Curso" value={aluno.cursoNome} />
        <InfoRow label="Data de Inscrição" value={fmtData(aluno.createdAt)} />
        <InfoRow
          label="Repetências"
          value={nRepetencias === 0 ? 'Sem repetências' : `${nRepetencias} vez(es)`}
          valueColor={isRepetente ? Colors.danger : nRepetencias === 1 ? Colors.warning : Colors.success}
        />
      </View>

      {/* ── Histórico de Repetências ── */}
      <SectionHeader icon="history" label={`HISTÓRICO DE REPETÊNCIAS${nRepetencias > 0 ? ` (${nRepetencias})` : ''}`} />
      <View style={styles.card}>
        {nRepetencias === 0 ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 }}>
            <MaterialCommunityIcons name="check-circle" size={20} color={Colors.success} />
            <Text style={{ color: Colors.success, fontSize: 13, fontWeight: '600' }}>
              Sem repetências registadas — progressão directa em todos os anos.
            </Text>
          </View>
        ) : (
          <>
            {/* Aviso visual se repetente (>1 reprovação) */}
            {isRepetente && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.danger + '15', borderRadius: 8, padding: 10, marginBottom: 10, borderLeftWidth: 3, borderLeftColor: Colors.danger }}>
                <MaterialCommunityIcons name="alert" size={18} color={Colors.danger} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: Colors.danger, fontSize: 12, fontWeight: '700' }}>
                    ALUNO REPETENTE — {nRepetencias} reprovações registadas
                  </Text>
                  <Text style={{ color: Colors.textMuted, fontSize: 11, marginTop: 2 }}>
                    Este aluno reprovou mais de uma vez ao longo do percurso escolar.
                  </Text>
                </View>
              </View>
            )}
            {reconfirmacoes
              .slice()
              .sort((a, b) => (b.anoLetivo || '').localeCompare(a.anoLetivo || ''))
              .map((r, i) => (
                <View key={r.id} style={[
                  { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 12 },
                  i < reconfirmacoes.length - 1 && { borderBottomWidth: 1, borderBottomColor: Colors.border },
                ]}>
                  <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: Colors.warning + '22', alignItems: 'center', justifyContent: 'center' }}>
                    <MaterialCommunityIcons name="refresh-circle" size={22} color={Colors.warning} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: Colors.text, fontSize: 14, fontWeight: '700' }}>
                      Ano Lectivo {r.anoLetivo}
                    </Text>
                    <Text style={{ color: Colors.textMuted, fontSize: 11, marginTop: 2 }}>
                      Reconfirmação de matrícula · {fmtData(r.data)}
                    </Text>
                  </View>
                  <View style={{ backgroundColor: statusReconfColor(r.status) + '20', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }}>
                    <Text style={{ color: statusReconfColor(r.status), fontSize: 11, fontWeight: '600' }}>
                      {statusReconfLabel(r.status)}
                    </Text>
                  </View>
                </View>
              ))
            }
          </>
        )}
      </View>

      {aluno.observacoes && (
        <>
          <SectionHeader icon="note-text" label="OBSERVAÇÕES" />
          <View style={styles.card}>
            <Text style={styles.observacoesText}>{aluno.observacoes}</Text>
          </View>
        </>
      )}
    </>
  );
}

// ─── Notas Tab ────────────────────────────────────────────────────────────────
function NotasTab({ notas }: { notas: Nota[] }) {
  const anos = Array.from(new Set(notas.map(n => n.anoLetivo))).sort().reverse();

  if (notas.length === 0) {
    return (
      <View style={styles.card}>
        <Text style={styles.noDataText}>Sem notas registadas para este aluno.</Text>
      </View>
    );
  }

  return (
    <>
      {anos.map(ano => {
        const notasAno = notas.filter(n => n.anoLetivo === ano);
        const disciplinas = Array.from(new Set(notasAno.map(n => n.disciplina))).sort();
        const turmaNome = notasAno[0]?.turmaNome || '';
        const nivel = notasAno[0]?.turmaNivel || '';

        return (
          <View key={ano}>
            <SectionHeader icon="calendar-text" label={`ANO LECTIVO ${ano}${turmaNome ? ` — ${turmaNome}` : ''}`} />
            <View style={styles.card}>
              {/* Header Row */}
              <View style={[styles.notaRow, styles.notaHeaderRow]}>
                <Text style={[styles.notaDisc, styles.notaHeader]}>DISCIPLINA</Text>
                <Text style={[styles.notaVal, styles.notaHeader]}>1ºT</Text>
                <Text style={[styles.notaVal, styles.notaHeader]}>2ºT</Text>
                <Text style={[styles.notaVal, styles.notaHeader]}>3ºT</Text>
                <Text style={[styles.notaVal, styles.notaHeader]}>MFD</Text>
              </View>
              {disciplinas.map((disc, idx) => {
                const ns = notasAno.filter(n => n.disciplina === disc);
                const get = (t: number) => ns.find(n => n.trimestre === t);
                const t1 = get(1); const t2 = get(2); const t3 = get(3);
                const mt = (n?: Nota) => n?.mt1 ?? n?.mt;
                const v1 = mt(t1); const v2 = mt(t2); const v3 = mt(t3);
                const vals = [v1, v2, v3].filter((v): v is number => v != null);
                const mfd = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;

                return (
                  <View key={disc} style={[styles.notaRow, idx % 2 === 1 && styles.notaRowAlt]}>
                    <Text style={styles.notaDisc} numberOfLines={1}>{disc}</Text>
                    <Text style={[styles.notaVal, { color: gradeColor(v1) }]}>{v1 != null ? v1.toFixed(0) : '—'}</Text>
                    <Text style={[styles.notaVal, { color: gradeColor(v2) }]}>{v2 != null ? v2.toFixed(0) : '—'}</Text>
                    <Text style={[styles.notaVal, { color: gradeColor(v3) }]}>{v3 != null ? v3.toFixed(0) : '—'}</Text>
                    <Text style={[styles.notaVal, { color: gradeColor(mfd ?? undefined), fontWeight: '700' }]}>{mfd != null ? mfd.toFixed(1) : '—'}</Text>
                  </View>
                );
              })}
            </View>
          </View>
        );
      })}
    </>
  );
}

// ─── Financeiro Tab ───────────────────────────────────────────────────────────
function FinanceiroTab({ propinas, stats }: { propinas: Propina[]; stats: any }) {
  if (propinas.length === 0) {
    return (
      <View style={styles.card}>
        <Text style={styles.noDataText}>Sem registos financeiros para este aluno.</Text>
      </View>
    );
  }

  const anos = Array.from(new Set(propinas.map(p => p.ano))).sort().reverse();

  return (
    <>
      {stats && (
        <>
          <SectionHeader icon="cash-multiple" label="RESUMO FINANCEIRO" />
          <View style={styles.card}>
            <View style={styles.finSummaryRow}>
              <View style={[styles.finSummaryBox, { borderColor: Colors.success }]}>
                <Text style={[styles.finSummaryVal, { color: Colors.success }]}>{fmtAOA(stats.totalPago)}</Text>
                <Text style={styles.finSummaryLabel}>Total Pago</Text>
              </View>
              <View style={[styles.finSummaryBox, { borderColor: stats.totalDevido > 0 ? Colors.danger : Colors.border }]}>
                <Text style={[styles.finSummaryVal, { color: stats.totalDevido > 0 ? Colors.danger : Colors.textMuted }]}>{fmtAOA(stats.totalDevido)}</Text>
                <Text style={styles.finSummaryLabel}>Em Dívida</Text>
              </View>
              <View style={[styles.finSummaryBox, { borderColor: stats.pendentes > 0 ? Colors.danger : Colors.border }]}>
                <Text style={[styles.finSummaryVal, { color: stats.pendentes > 0 ? Colors.danger : Colors.textMuted }]}>{stats.pendentes}</Text>
                <Text style={styles.finSummaryLabel}>Meses em Atraso</Text>
              </View>
            </View>
          </View>
        </>
      )}

      {anos.map(ano => {
        const ps = propinas.filter(p => matchAno(p.ano, ano)).sort((a, b) => a.mes - b.mes);
        return (
          <View key={ano}>
            <SectionHeader icon="calendar-blank" label={`ANO ${ano}`} />
            <View style={styles.card}>
              {ps.map(p => {
                const isPago = p.status === 'pago';
                const isPend = p.status === 'pendente' || p.status === 'em_atraso';
                const color = isPago ? Colors.success : isPend ? Colors.danger : Colors.warning;
                return (
                  <View key={p.id} style={styles.propRow}>
                    <View style={styles.propLeft}>
                      <Text style={styles.propMes}>{MESES[p.mes] || p.mes}</Text>
                      {p.taxaDescricao ? <Text style={styles.propDesc}>{p.taxaDescricao}</Text> : null}
                    </View>
                    <Text style={styles.propValor}>{fmtAOA(p.valor)}</Text>
                    <View style={[styles.propStatusBadge, { backgroundColor: color + '22' }]}>
                      <Text style={[styles.propStatusText, { color }]}>
                        {isPago ? 'Pago' : isPend ? 'Pendente' : p.status}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </View>
          </View>
        );
      })}
    </>
  );
}

// ─── Assiduidade Tab ──────────────────────────────────────────────────────────
function AssiduidadeTab({ presencas, stats }: { presencas: Presenca[]; stats: any }) {
  if (presencas.length === 0) {
    return (
      <View style={styles.card}>
        <Text style={styles.noDataText}>Sem registos de assiduidade para este aluno.</Text>
      </View>
    );
  }

  // Group by year/month
  const grouped: Record<string, { pres: number; fInj: number; fJus: number }> = {};
  for (const p of presencas) {
    const d = new Date(p.data);
    if (isNaN(d.getTime())) continue;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (!grouped[key]) grouped[key] = { pres: 0, fInj: 0, fJus: 0 };
    if (p.status === 'P') grouped[key].pres++;
    else if (p.status === 'F') grouped[key].fInj++;
    else if (p.status === 'J') grouped[key].fJus++;
  }

  const keys = Object.keys(grouped).sort().reverse();

  return (
    <>
      {stats && (
        <>
          <SectionHeader icon="chart-bar" label="RESUMO DE ASSIDUIDADE" />
          <View style={styles.card}>
            <InfoRow label="Total de registos" value={String(stats.totalPres)} />
            <InfoRow label="Presenças" value={String(stats.totalPres - stats.totalFaltas - stats.totalJust)} />
            <InfoRow label="Faltas Injustificadas" value={String(stats.totalFaltas)} valueColor={stats.totalFaltas > 0 ? Colors.danger : undefined} />
            <InfoRow label="Faltas Justificadas" value={String(stats.totalJust)} valueColor={stats.totalJust > 0 ? Colors.warning : undefined} />
            <InfoRow label="Taxa de Assiduidade" value={stats.assiduidade != null ? `${stats.assiduidade}%` : '—'} valueColor={stats.assiduidade != null && stats.assiduidade < 75 ? Colors.danger : Colors.success} />
          </View>
        </>
      )}

      <SectionHeader icon="calendar-month" label="POR MÊS" />
      <View style={styles.card}>
        <View style={[styles.presRowHeader]}>
          <Text style={[styles.presMes, styles.presHeaderText]}>MÊS</Text>
          <Text style={[styles.presVal, styles.presHeaderText]}>PRES</Text>
          <Text style={[styles.presVal, styles.presHeaderText, { color: Colors.danger }]}>INJ.</Text>
          <Text style={[styles.presVal, styles.presHeaderText, { color: Colors.warning }]}>JUST.</Text>
        </View>
        {keys.map(key => {
          const [y, m] = key.split('-');
          const g = grouped[key];
          return (
            <View key={key} style={styles.presRow}>
              <Text style={styles.presMes}>{MESES[parseInt(m)] || m}/{y}</Text>
              <Text style={[styles.presVal, { color: Colors.success }]}>{g.pres}</Text>
              <Text style={[styles.presVal, { color: g.fInj > 0 ? Colors.danger : Colors.textMuted }]}>{g.fInj}</Text>
              <Text style={[styles.presVal, { color: g.fJus > 0 ? Colors.warning : Colors.textMuted }]}>{g.fJus}</Text>
            </View>
          );
        })}
      </View>
    </>
  );
}

// ─── Documentos Tab ───────────────────────────────────────────────────────────
function DocumentosTab({ documentos, alunoId }: { documentos: Documento[]; alunoId: string }) {
  if (documentos.length === 0) {
    return (
      <View style={styles.card}>
        <Text style={styles.noDataText}>Nenhum documento emitido para este aluno.</Text>
      </View>
    );
  }

  return (
    <>
      <SectionHeader icon="file-multiple" label={`DOCUMENTOS EMITIDOS (${documentos.length})`} />
      <View style={styles.card}>
        {documentos.map((d, i) => (
          <View key={d.id} style={[styles.docRow, i < documentos.length - 1 && styles.docRowBorder]}>
            <View style={[styles.docIconWrap, { backgroundColor: Colors.accent + '22' }]}>
              <MaterialCommunityIcons name="file-document" size={20} color={Colors.accent} />
            </View>
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={styles.docTipo}>{docTipoLabel(d.tipo)}</Text>
              <Text style={styles.docData}>{fmtData(d.emitidoEm)}</Text>
              {d.finalidade && <Text style={styles.docFinal}>{d.finalidade}</Text>}
            </View>
          </View>
        ))}
      </View>
    </>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },

  searchWrap: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.backgroundCard, borderRadius: 10, margin: 12,
    paddingHorizontal: 10, borderWidth: 1, borderColor: Colors.border,
  },
  searchIcon: { marginRight: 6 },
  searchInput: {
    flex: 1, height: 44, color: Colors.text, fontSize: 14,
    ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {}),
  },
  clearBtn: { padding: 6 },

  resultsList: {
    backgroundColor: Colors.backgroundElevated, marginHorizontal: 12,
    borderRadius: 10, borderWidth: 1, borderColor: Colors.border,
    zIndex: 100, elevation: 8, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 4 },
  },
  resultLoading: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 10 },
  resultLoadingText: { color: Colors.textMuted, fontSize: 13 },
  resultItem: { flexDirection: 'row', alignItems: 'center', padding: 12, borderBottomWidth: 1, borderBottomColor: Colors.border },
  resultName: { color: Colors.text, fontWeight: '600', fontSize: 14 },
  resultSub: { color: Colors.textMuted, fontSize: 12, marginTop: 2 },
  noResults: { color: Colors.textMuted, textAlign: 'center', padding: 16, fontSize: 13 },
  situacaoBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  situacaoText: { fontSize: 11, fontWeight: '600' },

  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  emptyTitle: { color: Colors.text, fontSize: 20, fontWeight: '700', marginTop: 16 },
  emptySubtitle: { color: Colors.textMuted, fontSize: 14, textAlign: 'center', marginTop: 8, lineHeight: 22 },

  studentHeader: { paddingHorizontal: 16, paddingVertical: 16 },
  headerRow: { flexDirection: 'row', alignItems: 'center' },
  headerName: { color: '#fff', fontSize: 18, fontWeight: '700' },
  headerSub: { color: 'rgba(255,255,255,0.7)', fontSize: 12, marginTop: 3 },
  headerBadges: { flexDirection: 'row', gap: 6, marginTop: 6, flexWrap: 'wrap' },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  badgeText: { fontSize: 11, fontWeight: '600' },
  pdfBtn: { backgroundColor: Colors.accent, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 8 },
  pdfBtnText: { color: '#fff', fontSize: 12, fontWeight: '600' },

  tabBar: { backgroundColor: Colors.backgroundCard, borderBottomWidth: 1, borderBottomColor: Colors.border, maxHeight: 44 },
  tabBarContent: { paddingHorizontal: 8, paddingVertical: 4, gap: 4 },
  tab: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 8, minWidth: 70, alignItems: 'center' },
  tabActive: { backgroundColor: Colors.accent },
  tabText: { color: Colors.textMuted, fontSize: 13, fontWeight: '500' },
  tabTextActive: { color: '#fff', fontWeight: '600' },

  tabContent: { padding: 12, paddingBottom: 40 },

  detailLoading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  detailLoadingText: { color: Colors.textMuted, fontSize: 14 },

  card: { backgroundColor: Colors.backgroundCard, borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: Colors.border },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8, marginTop: 4 },
  sectionHeaderText: { color: Colors.accent, fontSize: 11, fontWeight: '700', letterSpacing: 0.6 },

  infoRow: { flexDirection: 'row', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: Colors.border },
  infoLabel: { flex: 1, color: Colors.textMuted, fontSize: 13 },
  infoValue: { flex: 1.2, color: Colors.text, fontSize: 13, fontWeight: '500', textAlign: 'right' },

  indicatorCard: { flexDirection: 'row', alignItems: 'center' },
  indicatorIcon: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  indicatorLabel: { color: Colors.textMuted, fontSize: 11, marginBottom: 2 },
  indicatorValue: { fontSize: 15, fontWeight: '700' },
  indicatorSub: { color: Colors.textMuted, fontSize: 11, marginTop: 2 },

  noDataText: { color: Colors.textMuted, textAlign: 'center', fontSize: 13, paddingVertical: 10 },
  observacoesText: { color: Colors.text, fontSize: 13, lineHeight: 20 },

  notaRow: { flexDirection: 'row', paddingVertical: 6, alignItems: 'center' },
  notaHeaderRow: { borderBottomWidth: 1, borderBottomColor: Colors.borderLight, marginBottom: 4, paddingBottom: 8 },
  notaRowAlt: { backgroundColor: Colors.backgroundElevated + '88' },
  notaHeader: { color: Colors.textMuted, fontSize: 10, fontWeight: '700' },
  notaDisc: { flex: 3, color: Colors.text, fontSize: 12 },
  notaVal: { flex: 1, color: Colors.text, fontSize: 12, textAlign: 'center' },

  finSummaryRow: { flexDirection: 'row', gap: 8, justifyContent: 'space-between' },
  finSummaryBox: { flex: 1, alignItems: 'center', borderWidth: 1, borderRadius: 8, padding: 10 },
  finSummaryVal: { fontSize: 14, fontWeight: '700' },
  finSummaryLabel: { color: Colors.textMuted, fontSize: 10, marginTop: 3, textAlign: 'center' },

  propRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.border },
  propLeft: { flex: 2 },
  propMes: { color: Colors.text, fontSize: 13, fontWeight: '600' },
  propDesc: { color: Colors.textMuted, fontSize: 11 },
  propValor: { flex: 1.5, color: Colors.text, fontSize: 13, textAlign: 'right', marginRight: 8 },
  propStatusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  propStatusText: { fontSize: 11, fontWeight: '600' },

  presRowHeader: { flexDirection: 'row', paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: Colors.borderLight, marginBottom: 4 },
  presRow: { flexDirection: 'row', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: Colors.border },
  presHeaderText: { color: Colors.textMuted, fontSize: 10, fontWeight: '700', textAlign: 'center' },
  presMes: { flex: 2, color: Colors.text, fontSize: 13 },
  presVal: { flex: 1, color: Colors.text, fontSize: 13, textAlign: 'center', fontWeight: '600' },

  docRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 },
  docRowBorder: { borderBottomWidth: 1, borderBottomColor: Colors.border },
  docIconWrap: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  docTipo: { color: Colors.text, fontSize: 13, fontWeight: '600' },
  docData: { color: Colors.textMuted, fontSize: 11, marginTop: 2 },
  docFinal: { color: Colors.textMuted, fontSize: 11, fontStyle: 'italic' },
});
