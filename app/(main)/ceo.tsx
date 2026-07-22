import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import NeonStatusBanner from '@/components/NeonStatusBanner';
import NeonStatusChart from '@/components/NeonStatusChart';
import {ActivityIndicator, Animated, Clipboard, Image as RNImage, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View} from 'react-native';
import { Ionicons, MaterialCommunityIcons, FontAwesome5 } from '@expo/vector-icons';
import { refreshEmpresaCache } from '@/components/EmpresaBrand';
import { pickAndUploadPhoto } from '@/lib/uploadPhoto';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Colors } from '@/constants/colors';
import TopBar from '@/components/TopBar';
import {
  useLicense, TipoPlano, TipoNivel, CodigoAtivacao,
  PLANO_LABEL, PLANO_DIAS,
  NIVEL_LABEL, NIVEL_COLOR, NIVEL_EMOJI, NIVEL_DESC, NIVEL_FEATURES,
  PRECO_POR_ALUNO_DEFAULT,
} from '@/context/LicenseContext';
import { useAuth } from '@/context/AuthContext';
import { useData } from '@/context/DataContext';
import { api } from '@/lib/api';
import { webAlert } from '@/utils/webAlert';
import { useEnterToSave } from '@/hooks/useEnterToSave';
import { useTabMemory } from '@/hooks/useTabMemory';

import { HScrollTabBar } from '@/components/HScrollTabBar';
import { SkeletonPage } from '@/components/Skeleton';
import GuidedTour, { useGuidedTour } from '@/components/GuidedTour';
import { CEO_TOUR_STEPS, CEO_TOUR_KEY, PCA_TOUR_STEPS, PCA_TOUR_KEY } from '@/constants/tourSteps';
// ── Preço base por aluno por nível ──────────────────────────────────────────
export const PRECO_NIVEL: Record<TipoNivel, number> = {
  prata: 30,
  ouro: 50,
  rubi: 75,
};

// Multiplicador de desconto por duração (anual = 2 meses grátis ≈ 83%)
export const DESCONTO_PLANO: Record<TipoPlano, number> = {
  avaliacao: 0,
  mensal: 1.0,
  trimestral: 0.97,   // 3% desconto
  semestral: 0.92,    // 8% desconto
  anual: 0.83,        // ~17% desconto (2 meses grátis)
};

export const DESCONTO_LABEL: Record<TipoPlano, string> = {
  demo: 'Grátis · 5 dias',
  avaliacao: '',
  mensal: '',
  trimestral: '-3%',
  semestral: '-8%',
  anual: '2 meses grátis',
};

const PLANO_PRECO: Record<TipoPlano, string> = {
  demo: 'Grátis — apenas para testes',
  avaliacao: 'Grátis',
  mensal: '× alunos × KZ/aluno',
  trimestral: '× alunos × KZ/aluno  (-3%)',
  semestral: '× alunos × KZ/aluno  (-8%)',
  anual: '× alunos × KZ/aluno  (2 meses grátis)',
};

const PLANO_COLOR: Record<TipoPlano, string> = {
  demo: '#8B5CF6',
  avaliacao: Colors.textMuted,
  mensal: Colors.info,
  trimestral: Colors.warning,
  semestral: Colors.success,
  anual: Colors.gold,
};

type Section = 'dashboard' | 'codigos' | 'gerar' | 'historico' | 'empresa' | 'sistema' | 'seguranca' | 'manutencao';

// ── Painel de Estado da Ligação Neon ────────────────────────────────────────
function StatCard({ label, value, sub, color, icon }: {
  label: string; value: string; sub?: string; color: string; icon: string;
}) {
  return (
    <View style={[sS.statCard, { borderColor: color + '40' }]}>
      <View style={[sS.statIcon, { backgroundColor: color + '22' }]}>
        <Ionicons name={icon as any} size={24} color={color} />
      </View>
      <Text style={[sS.statValue, { color }]}>{value}</Text>
      <Text style={sS.statLabel}>{label}</Text>
      {sub && <Text style={sS.statSub}>{sub}</Text>}
    </View>
  );
}

function CodigoCard({ cod, onCopy, onRevogar }: {
  cod: CodigoAtivacao;
  onCopy: () => void;
  onRevogar: () => void;
}) {
  const cor = PLANO_COLOR[cod.plano];
  const expirado = new Date(cod.dataExpiracaoCodigo) < new Date();
  return (
    <View style={[cS.card, cod.usado && cS.cardUsado, expirado && !cod.usado && cS.cardExpirado]}>
      <View style={cS.cardTop}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={[cS.planoPill, { backgroundColor: NIVEL_COLOR[cod.nivel || 'rubi'] + '22', borderColor: NIVEL_COLOR[cod.nivel || 'rubi'] + '55' }]}>
            <Text style={{ fontSize: 10 }}>{NIVEL_EMOJI[cod.nivel || 'rubi']}</Text>
            <Text style={[cS.planoText, { color: NIVEL_COLOR[cod.nivel || 'rubi'] }]}>{NIVEL_LABEL[cod.nivel || 'rubi']}</Text>
          </View>
          <View style={[cS.planoPill, { backgroundColor: cor + '22', borderColor: cor + '55' }]}>
            <Text style={[cS.planoText, { color: cor }]}>{PLANO_LABEL[cod.plano]}</Text>
          </View>
        </View>
        <View style={cS.actions}>
          {!cod.usado && !expirado && (
            <TouchableOpacity onPress={onCopy} style={cS.actionBtn}>
              <Ionicons name="copy-outline" size={16} color={Colors.gold} />
            </TouchableOpacity>
          )}
          {!cod.usado && (
            <TouchableOpacity onPress={onRevogar} style={[cS.actionBtn, { backgroundColor: Colors.danger + '22' }]}>
              <Ionicons name="trash-outline" size={16} color={Colors.danger} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <Text style={cS.codigo} selectable>{cod.codigo}</Text>

      <View style={cS.metaRow}>
        <View style={cS.metaItem}>
          <Ionicons name="time-outline" size={12} color={Colors.textMuted} />
          <Text style={cS.metaText}>{cod.diasValidade} dias</Text>
        </View>
        {(cod.valorFinal != null && cod.valorFinal >= 0) ? (
          <View style={cS.metaItem}>
            <Ionicons name="cash-outline" size={12} color={Colors.gold} />
            <Text style={[cS.metaText, { color: Colors.gold }]}>
              {(cod.valorFinal).toLocaleString('pt-AO')} KZ
            </Text>
          </View>
        ) : null}
        {(cod.totalAlunos != null && cod.totalAlunos > 0) ? (
          <View style={cS.metaItem}>
            <Ionicons name="people-outline" size={12} color={Colors.textMuted} />
            <Text style={cS.metaText}>{cod.totalAlunos} alunos</Text>
          </View>
        ) : null}
        <View style={cS.metaItem}>
          <Ionicons name="calendar-outline" size={12} color={Colors.textMuted} />
          <Text style={cS.metaText}>Gerado: {cod.dataGeracao}</Text>
        </View>
      </View>

      {cod.notas ? <Text style={cS.notas}>{cod.notas}</Text> : null}

      <View style={cS.statusRow}>
        {cod.usado ? (
          <View style={cS.statusUsado}>
            <Ionicons name="checkmark-circle" size={14} color={Colors.success} />
            <Text style={[cS.statusText, { color: Colors.success }]}>
              Usado por {cod.usadoPor} em {cod.usadoEm}
            </Text>
          </View>
        ) : expirado ? (
          <View style={cS.statusUsado}>
            <Ionicons name="close-circle" size={14} color={Colors.danger} />
            <Text style={[cS.statusText, { color: Colors.danger }]}>Código expirado</Text>
          </View>
        ) : (
          <View style={cS.statusUsado}>
            <Ionicons name="ellipse" size={10} color={Colors.success} />
            <Text style={[cS.statusText, { color: Colors.success }]}>
              Disponível — expira em {cod.dataExpiracaoCodigo}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

/* ─────────────────────────────────────────────────────────
   Painel de Recursos Humanos para CEO/PCA
───────────────────────────────────────────────────────── */
interface RHStats {
  totalFuncionarios: number;
  totalProfessores: number;
  totalAdmin: number;
  faltasThisMonth: number;
  ultimaFolha: { mes: string; total: number; estado: string } | null;
  totalSalariosUltimaFolha: number;
  deptBreakdown: { departamento: string; count: number }[];
}

function RHPanelCEO({ router }: { router: ReturnType<typeof useRouter> }) {
  const [stats, setStats] = useState<RHStats | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchRHStats = useCallback(async () => {
    try {
      setLoading(true);
      const [funcsRes, faltasRes, folhasRes] = await Promise.all([
        api.get<any[]>('/api/funcionarios'),
        api.get<any[]>('/api/faltas-funcionarios'),
        api.get<any[]>('/api/folhas-salarios'),
      ]);

      const funcs: any[] = Array.isArray(funcsRes) ? funcsRes : [];
      const faltas: any[] = Array.isArray(faltasRes) ? faltasRes : [];
      const folhas: any[] = Array.isArray(folhasRes) ? folhasRes : [];

      const now = new Date();
      const mesAtual = now.getMonth() + 1;
      const anoAtual = now.getFullYear();

      const faltasMes = faltas.filter(f => {
        const d = new Date(f.data);
        return d.getMonth() + 1 === mesAtual && d.getFullYear() === anoAtual;
      }).length;

      const profs = funcs.filter(f =>
        (f.departamento || '').toLowerCase().includes('pedagog') ||
        (f.cargo || '').toLowerCase().includes('professor')
      );
      const admin = funcs.filter(f =>
        !(f.departamento || '').toLowerCase().includes('pedagog') &&
        !(f.cargo || '').toLowerCase().includes('professor')
      );

      const deptMap: Record<string, number> = {};
      funcs.forEach(f => {
        const dept = f.departamento || 'Sem Departamento';
        deptMap[dept] = (deptMap[dept] || 0) + 1;
      });
      const deptBreakdown = Object.entries(deptMap)
        .map(([departamento, count]) => ({ departamento, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

      let ultimaFolha = null;
      let totalSalariosUltimaFolha = 0;
      if (folhas.length > 0) {
        const folha = folhas.sort((a: any, b: any) => b.id - a.id)[0];
        try {
          const itensRes = await api.get<any[]>(`/api/folhas-salarios/${folha.id}/itens`);
          const itens: any[] = Array.isArray(itensRes) ? itensRes : [];
          totalSalariosUltimaFolha = itens.reduce((s: number, i: any) => s + (i.salarioLiquido || 0), 0);
        } catch (_) {}
        ultimaFolha = {
          mes: folha.mes,
          total: totalSalariosUltimaFolha,
          estado: folha.estado || 'rascunho',
        };
      }

      setStats({
        totalFuncionarios: funcs.length,
        totalProfessores: profs.length,
        totalAdmin: admin.length,
        faltasThisMonth: faltasMes,
        ultimaFolha,
        totalSalariosUltimaFolha,
        deptBreakdown,
      });
    } catch (e) {
      console.error('RHPanelCEO error:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchRHStats(); }, [fetchRHStats]);

  function formatAOA(v: number) {
    return v.toLocaleString('pt-AO', { style: 'currency', currency: 'AOA', maximumFractionDigits: 0 });
  }

  const ESTADO_COLOR: Record<string, string> = {
    processada: Colors.success,
    paga: Colors.info,
    rascunho: Colors.textMuted,
    pendente: Colors.warning,
  };

  return (
    <>
      <View style={rhS.header}>
        <MaterialCommunityIcons name="account-group" size={20} color={Colors.gold} />
        <Text style={rhS.headerTitle}>Recursos Humanos</Text>
        <TouchableOpacity onPress={fetchRHStats} style={{ marginLeft: 'auto' }}>
          <Ionicons name="refresh-outline" size={16} color={Colors.textMuted} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={rhS.loadingBox}>
          <Text style={{ color: Colors.textMuted, fontSize: 13 }}>A carregar dados RH...</Text>
        </View>
      ) : (
        <>
          {/* KPI Grid */}
          <View style={rhS.grid}>
            <View style={[rhS.kpi, { borderLeftColor: Colors.info }]}>
              <Text style={rhS.kpiValue}>{stats?.totalFuncionarios ?? 0}</Text>
              <Text style={rhS.kpiLabel}>Total Funcionários</Text>
            </View>
            <View style={[rhS.kpi, { borderLeftColor: Colors.success }]}>
              <Text style={rhS.kpiValue}>{stats?.totalProfessores ?? 0}</Text>
              <Text style={rhS.kpiLabel}>Docentes</Text>
            </View>
            <View style={[rhS.kpi, { borderLeftColor: Colors.warning }]}>
              <Text style={rhS.kpiValue}>{stats?.totalAdmin ?? 0}</Text>
              <Text style={rhS.kpiLabel}>Administrativos</Text>
            </View>
            <View style={[rhS.kpi, { borderLeftColor: Colors.danger }]}>
              <Text style={rhS.kpiValue}>{stats?.faltasThisMonth ?? 0}</Text>
              <Text style={rhS.kpiLabel}>Faltas este mês</Text>
            </View>
          </View>

          {/* Última Folha de Salários */}
          {stats?.ultimaFolha && (
            <View style={rhS.folhaCard}>
              <View style={rhS.folhaHeader}>
                <MaterialCommunityIcons name="file-document-outline" size={16} color={Colors.gold} />
                <Text style={rhS.folhaTitle}>Última Folha de Salários</Text>
                <View style={[rhS.folhaEstado, { backgroundColor: (ESTADO_COLOR[stats.ultimaFolha.estado] || Colors.textMuted) + '22' }]}>
                  <Text style={[rhS.folhaEstadoText, { color: ESTADO_COLOR[stats.ultimaFolha.estado] || Colors.textMuted }]}>
                    {stats.ultimaFolha.estado.charAt(0).toUpperCase() + stats.ultimaFolha.estado.slice(1)}
                  </Text>
                </View>
              </View>
              <View style={rhS.folhaBody}>
                <View>
                  <Text style={rhS.folhaMes}>{stats.ultimaFolha.mes}</Text>
                  <Text style={rhS.folhaLabel}>Período</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={[rhS.folhaMes, { color: Colors.success }]}>{formatAOA(stats.ultimaFolha.total)}</Text>
                  <Text style={rhS.folhaLabel}>Total Salários Líquidos</Text>
                </View>
              </View>
            </View>
          )}

          {/* Distribuição por Departamento */}
          {(stats?.deptBreakdown ?? []).length > 0 && (
            <View style={rhS.deptCard}>
              <Text style={rhS.deptTitle}>Pessoal por Departamento</Text>
              {stats!.deptBreakdown.map((d, i) => {
                const total = stats!.totalFuncionarios || 1;
                const pct = Math.round((d.count / total) * 100);
                const DEPT_COLORS = [Colors.info, Colors.success, Colors.warning, '#8b5cf6', Colors.gold];
                const cor = DEPT_COLORS[i % DEPT_COLORS.length];
                return (
                  <View key={d.departamento} style={rhS.deptRow}>
                    <View style={{ flex: 1 }}>
                      <View style={rhS.deptLabelRow}>
                        <Text style={rhS.deptName} numberOfLines={1}>{d.departamento}</Text>
                        <Text style={rhS.deptCount}>{d.count} ({pct}%)</Text>
                      </View>
                      <View style={rhS.deptBarBg}>
                        <View style={[rhS.deptBar, { width: `${pct}%` as any, backgroundColor: cor }]} />
                      </View>
                    </View>
                  </View>
                );
              })}
            </View>
          )}

          {/* Atalhos RH */}
          <Text style={[styles.escolaSectionTitle, { marginTop: 16 }]}>Módulos de Recursos Humanos</Text>
          {[
            { label: 'Controlo de Pessoal', sub: 'Ficha e gestão de funcionários', route: '/(main)/rh-controle', icon: 'people', color: Colors.info },
            { label: 'Faltas & Tempos Lectivos', sub: 'Registo de faltas e tempos', route: '/(main)/rh-faltas-tempos', icon: 'time', color: Colors.warning },
            { label: 'Folhas de Salários', sub: 'Processamento e emissão de recibos', route: '/(main)/rh-payroll', icon: 'cash', color: Colors.success },
          ].map(item => (
            <TouchableOpacity
              key={item.route}
              style={styles.escolaShortcut}
              onPress={() => router.push(item.route as any)}
              activeOpacity={0.8}
            >
              <View style={[styles.escolaShortcutIcon, { backgroundColor: item.color + '22' }]}>
                <Ionicons name={item.icon as any} size={18} color={item.color} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.escolaShortcutLabel}>{item.label}</Text>
                <Text style={styles.escolaShortcutSub}>{item.sub}</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
            </TouchableOpacity>
          ))}
        </>
      )}
    </>
  );
}

const rhS = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 20, marginBottom: 12 },
  headerTitle: { fontSize: 15, fontWeight: '700', color: Colors.text },
  loadingBox: { alignItems: 'center', padding: 24 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  kpi: {
    flex: 1, minWidth: '44%', backgroundColor: Colors.card, borderRadius: 10, padding: 12,
    borderLeftWidth: 3,
  },
  kpiValue: { fontSize: 22, fontWeight: '800', color: Colors.text, marginBottom: 2 },
  kpiLabel: { fontSize: 11, color: Colors.textMuted },
  folhaCard: { backgroundColor: Colors.card, borderRadius: 10, padding: 14, marginBottom: 10 },
  folhaHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  folhaTitle: { fontSize: 13, fontWeight: '700', color: Colors.text, flex: 1 },
  folhaEstado: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  folhaEstadoText: { fontSize: 11, fontWeight: '700' },
  folhaBody: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  folhaMes: { fontSize: 15, fontWeight: '700', color: Colors.text },
  folhaLabel: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
  deptCard: { backgroundColor: Colors.card, borderRadius: 10, padding: 14, marginBottom: 10 },
  deptTitle: { fontSize: 13, fontWeight: '700', color: Colors.text, marginBottom: 10 },
  deptRow: { marginBottom: 8 },
  deptLabelRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  deptName: { fontSize: 12, color: Colors.text, flex: 1 },
  deptCount: { fontSize: 12, color: Colors.textMuted, fontWeight: '600' },
  deptBarBg: { height: 5, backgroundColor: Colors.border, borderRadius: 3, overflow: 'hidden' },
  deptBar: { height: 5, borderRadius: 3 },
});

export default function CeoScreen() {
  const { user } = useAuth();
  const { licenca, codigosGerados, isLicencaValida, diasRestantes, gerarCodigo, revogarCodigo, adicionarSaldo, adicionarCreditoAcumulado } = useLicense();
  const { alunos, turmas, professores, notas } = useData();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const bottomPad = Platform.OS === 'web' ? 34 : insets.bottom;

  const isPca = user?.role === 'pca';
  const TOUR_STEPS = isPca ? PCA_TOUR_STEPS : CEO_TOUR_STEPS;
  const TOUR_KEY = isPca ? PCA_TOUR_KEY : CEO_TOUR_KEY;
  const { tourVisible, checkAndShow, openTour, closeTour } = useGuidedTour(TOUR_KEY);

  // Auto-mostrar tour na primeira visita
  useEffect(() => {
    const t = setTimeout(() => checkAndShow(), 800);
    return () => clearTimeout(t);
  }, []);

  const [mainTab, setMainTab] = useState<'ceo' | 'escola'>('ceo');
  const [section, setSection] = useState<Section>('dashboard');
  const [sectionCollapsed, setSectionCollapsed] = useState(false);
  const [showGerar, setShowGerar] = useState(false);
  const [formPlano, setFormPlano] = useState<TipoPlano>('anual');
  const [formNivel, setFormNivel] = useState<TipoNivel>('rubi');
  const [formPrecoPorAluno, setFormPrecoPorAluno] = useState(String(PRECO_POR_ALUNO_DEFAULT));
  const [formCreditoAplicar, setFormCreditoAplicar] = useState('0');
  const [alunosMatriculados, setAlunosMatriculados] = useState<number | null>(null);
  const [erroAlunos, setErroAlunos] = useState<string | null>(null);
  const [formNotas, setFormNotas] = useState('');
  const [showSaldo, setShowSaldo] = useState(false);
  const [formAddSaldo, setFormAddSaldo] = useState('');
  const [codigoGerado, setCodigoGerado] = useState<CodigoAtivacao | null>(null);
  const [filterUsado, setFilterUsado] = useState<'todos' | 'disponivel' | 'usado'>('todos');

  type EscalaoVol = { min: number; max: number | null; perc: number; label: string };
  const [escaloesList, setEscaloesList] = useState<EscalaoVol[]>([]);
  const [escaloesDraft, setEscaloesDraft] = useState<EscalaoVol[]>([]);
  const [precoBaseEsc, setPrecoBaseEsc] = useState(50);
  const [showEscaloesEditor, setShowEscaloesEditor] = useState(false);
  const [salvandoEscaloes, setSalvandoEscaloes] = useState(false);

  // ── Dados de Pagamento de Licença ─────────────────────────────────────────
  const [licPag, setLicPag] = useState({ licencaIban: '', licencaBic: '', licencaMulticaixaRef: '', licencaBeneficiario: '' });
  const [licPagLoading, setLicPagLoading] = useState(false);
  const [licPagSaving, setLicPagSaving] = useState(false);
  const [licPagSaved, setLicPagSaved] = useState(false);

  const fetchLicPag = useCallback(async () => {
    setLicPagLoading(true);
    try {
      const d = await api.get<any>('/api/config');
      setLicPag({
        licencaIban: d?.licencaIban || '',
        licencaBic: d?.licencaBic || '',
        licencaMulticaixaRef: d?.licencaMulticaixaRef || '',
        licencaBeneficiario: d?.licencaBeneficiario || '',
      });
    } catch { /* silencioso */ } finally { setLicPagLoading(false); }
  }, []);

  const saveLicPag = useCallback(async () => {
    setLicPagSaving(true);
    try {
      await api.put('/api/config', licPag);
      setLicPagSaved(true);
      setTimeout(() => setLicPagSaved(false), 2500);
    } catch (e: any) {
      webAlert('Erro', e?.message || 'Não foi possível guardar.');
    } finally { setLicPagSaving(false); }
  }, [licPag]);

  // ── Segurança ─────────────────────────────────────────────────────────────
  type AuditLog = { id: string; acao: string; modulo: string; descricao: string; userEmail: string; userName: string; userRole: string; ipAddress: string; criadoEm: string };
  const [loginAprovAtiva, setLoginAprovAtiva] = useState<boolean>(false);
  const [loginAprovLoading, setLoginAprovLoading] = useState(false);
  const [emailStatus, setEmailStatus] = useState<boolean | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditFiltro, setAuditFiltro] = useState<'todos' | 'login'>('login');
  const [auditPage, setAuditPage] = useState(1);
  const [auditTotal, setAuditTotal] = useState(0);

  const fetchEmailStatus = useCallback(async () => {
    try {
      const d = await api.get<{ configured: boolean }>('/api/config/email-status');
      setEmailStatus(d?.configured === true);
    } catch { setEmailStatus(false); }
  }, []);

  const fetchLoginAprovConfig = useCallback(async () => {
    try {
      const d = await api.get<{ loginAprovacaoAtiva: boolean }>('/api/config');
      setLoginAprovAtiva(d?.loginAprovacaoAtiva === true);
    } catch { /* silencioso */ }
  }, []);

  const fetchAuditLogs = useCallback(async (page = 1, filtro = auditFiltro) => {
    setAuditLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      if (filtro === 'login') params.set('modulo', 'login-aprovacao');
      const d = await api.get<{ logs: AuditLog[]; total: number }>(`/api/audit-logs?${params}`);
      setAuditLogs(d?.logs || []);
      setAuditTotal(d?.total || 0);
    } catch { /* silencioso */ } finally {
      setAuditLoading(false);
    }
  }, [auditFiltro]);

  const toggleLoginAprovacao = useCallback(async (val: boolean) => {
    setLoginAprovLoading(true);
    try {
      await api.put('/api/config', { loginAprovacaoAtiva: val });
      setLoginAprovAtiva(val);
    } catch (e: any) {
      webAlert('Erro', e?.message || 'Não foi possível guardar a configuração.');
    } finally {
      setLoginAprovLoading(false);
    }
  }, []);

  useEffect(() => {
    if (section === 'seguranca') {
      fetchEmailStatus();
      fetchLoginAprovConfig();
      fetchAuditLogs(1, auditFiltro);
    }
    if (section === 'sistema') {
      fetchLicPag();
    }
    if (section === 'manutencao') {
      fetchManutencao();
    }
  }, [section]);

  // ── Manutenção ────────────────────────────────────────────────────────────
  const [manutAtiva, setManutAtiva] = useState(false);
  const [manutMensagem, setManutMensagem] = useState('');
  const [manutActivadaEm, setManutActivadaEm] = useState<string | null>(null);
  const [manutLoading, setManutLoading] = useState(false);
  const [manutSaving, setManutSaving] = useState(false);
  const [manutFeedback, setManutFeedback] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);

  // ── Versão APK ──
  const [apkVersion, setApkVersion] = useState('');
  const [apkExternalUrl, setApkExternalUrl] = useState('');
  const [apkSaving, setApkSaving] = useState(false);
  const [apkSaved, setApkSaved] = useState(false);
  const [apkLoaded, setApkLoaded] = useState(false);

  useEffect(() => {
    if (apkLoaded) return;
    (async () => {
      try {
        const r = await fetch('/api/version');
        if (r.ok) {
          const d = await r.json();
          setApkVersion(d.version ?? '');
          setApkExternalUrl(d.apkUrl && !d.apkUrl.startsWith('/') ? d.apkUrl : '');
          setApkLoaded(true);
        }
      } catch {}
    })();
  }, [apkLoaded]);

  async function salvarApkVersion() {
    const ver = apkVersion.trim();
    if (!ver) { webAlert('Campo obrigatório', 'Introduza a versão do APK (ex.: 2.1.1).'); return; }
    if (!/^\d+\.\d+(\.\d+)?$/.test(ver)) { webAlert('Formato inválido', 'Use o formato X.Y ou X.Y.Z (ex.: 2.1.1).'); return; }
    setApkSaving(true);
    try {
      await api.put('/api/config', { apkVersion: ver, apkExternalUrl: apkExternalUrl.trim() || null });
      setApkSaved(true);
      setTimeout(() => setApkSaved(false), 2500);
      setApkLoaded(false);
    } catch (e: any) {
      webAlert('Erro', e?.message ?? 'Não foi possível guardar a versão.');
    } finally { setApkSaving(false); }
  }

  async function fetchManutencao() {
    setManutLoading(true);
    try {
      const r = await api.get<any>('/api/admin/manutencao');
      setManutAtiva(r.active || false);
      setManutMensagem(r.message || '');
      setManutActivadaEm(r.activatedAt || null);
    } catch { /* ignora */ }
    finally { setManutLoading(false); }
  }

  async function activarManutencao() {
    if (!manutMensagem.trim()) {
      setManutFeedback({ tipo: 'erro', texto: 'Escreve uma mensagem antes de activar.' });
      return;
    }
    setManutSaving(true);
    setManutFeedback(null);
    try {
      const r = await api.post<any>('/api/admin/manutencao/ativar', { message: manutMensagem.trim() });
      if (r.ok) {
        setManutAtiva(true);
        setManutActivadaEm(r.data?.activatedAt || new Date().toISOString());
        setManutFeedback({ tipo: 'ok', texto: '⚠️ Manutenção activada. Utilizadores em produção já vêem a página de manutenção.' });
      }
    } catch (e: any) {
      setManutFeedback({ tipo: 'erro', texto: e?.message || 'Erro ao activar manutenção.' });
    } finally { setManutSaving(false); }
  }

  async function desactivarManutencao() {
    setManutSaving(true);
    setManutFeedback(null);
    try {
      const r = await api.post<any>('/api/admin/manutencao/desativar', {});
      if (r.ok) {
        setManutAtiva(false);
        setManutActivadaEm(null);
        setManutFeedback({ tipo: 'ok', texto: '✅ Manutenção desactivada. Sistema voltou ao normal.' });
      }
    } catch (e: any) {
      setManutFeedback({ tipo: 'erro', texto: e?.message || 'Erro ao desactivar manutenção.' });
    } finally { setManutSaving(false); }
  }

  // ── Reset DB ──────────────────────────────────────────────────────────────
  const [showResetModal, setShowResetModal] = useState(false);
  const [loadingDemo, setLoadingDemo] = useState(false);
  const [codigoDemo, setCodigoDemo] = useState<string | null>(null);
  const [historicoDemo, setHistoricoDemo] = useState<any[]>([]);
  const [loadingHistoricoDemo, setLoadingHistoricoDemo] = useState(false);
  const [resetStep, setResetStep] = useState<1 | 2 | 3>(1);
  const [resetConfirmText, setResetConfirmText] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [resetResultado, setResetResultado] = useState<string | null>(null);

  async function handleDbReset() {
    if (resetConfirmText !== 'RESETAR') return;
    setResetLoading(true);
    try {
      const tok = await import('@/context/AuthContext').then(m => m.getAuthToken());
      const r = await fetch('/api/ceo/db-reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: `Bearer ${tok}` } : {}) },
        body: JSON.stringify({ confirmacao: 'RESETAR' }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Erro desconhecido');
      setResetResultado(d.mensagem || 'Base de dados resetada com sucesso.');
      setResetStep(3);
    } catch (e: any) {
      setResetResultado('Erro: ' + (e.message || 'Falha no reset.'));
      setResetStep(3);
    } finally {
      setResetLoading(false);
    }
  }

  function fecharResetModal() {
    setShowResetModal(false);
    setResetStep(1);
    setResetConfirmText('');
    setResetResultado(null);
  }

  const fetchAlunosMatriculados = useCallback(async () => {
    setErroAlunos(null);
    setAlunosMatriculados(null);
    try {
      const d = await api.get<{ total: number }>('/api/licenca/alunos-matriculados');
      if (typeof d?.total === 'number') {
        setAlunosMatriculados(d.total);
      } else {
        setErroAlunos('Resposta inválida do servidor.');
      }
    } catch (e: any) {
      const raw = e?.message || 'Falha ao obter contagem de alunos.';
      // Erros de JSON parse (HTML em vez de JSON) → mostra mensagem mais útil
      const friendly = /Unexpected token|JSON|<!DOCTYPE/i.test(raw)
        ? 'Servidor devolveu uma resposta inválida. Tente novamente.'
        : raw;
      setErroAlunos(friendly);
    }
  }, []);

  useEffect(() => { fetchAlunosMatriculados(); }, [fetchAlunosMatriculados]);

  type StatsConv = {
    gerados: number; activados: number; disponiveis: number; expirados: number;
    taxaRedencao: number; tempoMedioDias: number | null;
    valorActivado: number; valorPotencial: number;
    ultimosActivados: Array<{
      codigo: string; plano: TipoPlano; nivel: TipoNivel;
      usadoPor: string | null; usadoEm: string | null;
      dataGeracao: string; valorFinal: number; diasParaActivar: number | null;
    }>;
  };
  const [statsConv, setStatsConv] = useState<StatsConv | null>(null);
  const [loadingStatsConv, setLoadingStatsConv] = useState(false);

  const fetchStatsConv = useCallback(async () => {
    setLoadingStatsConv(true);
    try {
      const d = await api.get<StatsConv>('/api/licenca/codigos/stats');
      setStatsConv(d);
    } catch { /* silencioso — utilizadores não-CEO recebem 403 */ }
    finally { setLoadingStatsConv(false); }
  }, []);

  useEffect(() => { fetchStatsConv(); }, [fetchStatsConv, codigosGerados.length]);

  // ── Histórico de activações (tabela permanente licenca_historico) ──────────
  type HistoricoItem = {
    id: string; plano: string; nivel: string; totalAlunos: number;
    precoPorAluno: number; valorTotal: number; descontoAplicado: number; valorPago: number;
    dataAtivacao: string; dataExpiracao: string; ativadoPor: string;
    metodo: string; observacao: string | null; criadoEm: string;
    totalEmissoes: number;
  };
  const [historicoDB, setHistoricoDB] = useState<HistoricoItem[]>([]);
  const [loadingHistorico, setLoadingHistorico] = useState(false);

  const fetchHistoricoDB = useCallback(async () => {
    setLoadingHistorico(true);
    try {
      const d = await api.get<HistoricoItem[]>('/api/licenca/historico');
      if (Array.isArray(d)) setHistoricoDB(d);
    } catch { /* silencioso */ }
    finally { setLoadingHistorico(false); }
  }, []);

  useEffect(() => {
    if (section === 'historico') fetchHistoricoDB();
  }, [section, fetchHistoricoDB]);

  const fetchEscaloes = useCallback(async () => {
    try {
      const d = await api.get<{ escaloes: EscalaoVol[] }>('/api/licenca/escaloes');
      if (Array.isArray(d?.escaloes) && d.escaloes.length > 0) {
        setEscaloesList(d.escaloes);
        setEscaloesDraft(d.escaloes);
      }
    } catch {}
    try {
      const cfg = await api.get<{ licencaPrecoPorAluno?: number }>('/api/config');
      if (cfg?.licencaPrecoPorAluno) setPrecoBaseEsc(Number(cfg.licencaPrecoPorAluno));
    } catch {}
  }, []);
  useEffect(() => { fetchEscaloes(); }, [fetchEscaloes]);

  useEffect(() => {
    if (!showGerar) return;
    fetchAlunosMatriculados();
    const saldoDisponivel = licenca?.saldoCreditoAcumulado || 0;
    if (saldoDisponivel > 0) {
      setFormCreditoAplicar(String(saldoDisponivel));
    } else {
      setFormCreditoAplicar('0');
    }
  }, [showGerar]);

  // Quando o nível muda, actualiza automaticamente o preço por aluno
  useEffect(() => {
    setFormPrecoPorAluno(String(PRECO_NIVEL[formNivel]));
  }, [formNivel]);

  const stats = useMemo(() => {
    const total = codigosGerados.length;
    const usados = codigosGerados.filter(c => c.usado).length;
    const disponiveis = codigosGerados.filter(c => !c.usado && new Date(c.dataExpiracaoCodigo) >= new Date()).length;
    const expirados = codigosGerados.filter(c => !c.usado && new Date(c.dataExpiracaoCodigo) < new Date()).length;
    return { total, usados, disponiveis, expirados };
  }, [codigosGerados]);

  const codigosFiltrados = useMemo(() => {
    return codigosGerados
      .filter(c => {
        if (filterUsado === 'disponivel') return !c.usado && new Date(c.dataExpiracaoCodigo) >= new Date();
        if (filterUsado === 'usado') return c.usado;
        return true;
      })
      .sort((a, b) => b.dataGeracao.localeCompare(a.dataGeracao));
  }, [codigosGerados, filterUsado]);

  const calcPreco = useMemo(() => {
    const precoPorAluno = parseInt(formPrecoPorAluno) || PRECO_NIVEL[formNivel];
    const total = alunosMatriculados ?? 0;
    const desconto = DESCONTO_PLANO[formPlano];
    const valorBruto = precoPorAluno * total;
    // Aplica desconto por duração (ex: anual = 83% do valor mensal × 12)
    const meses = formPlano === 'mensal' ? 1 : formPlano === 'trimestral' ? 3 : formPlano === 'semestral' ? 6 : 12;
    const valorSemDesconto = valorBruto * meses;
    const valorComDesconto = Math.round(valorSemDesconto * desconto);
    const descontoKz = valorSemDesconto - valorComDesconto;
    const credito = Math.min(parseInt(formCreditoAplicar) || 0, valorComDesconto);
    const valorFinal = Math.max(0, valorComDesconto - credito);
    return { precoPorAluno, total, meses, valorBruto, valorSemDesconto, valorComDesconto, descontoKz, credito, valorFinal };
  }, [formPrecoPorAluno, formNivel, formPlano, alunosMatriculados, formCreditoAplicar]);

  const carregarHistoricoDemo = useCallback(async () => {
    setLoadingHistoricoDemo(true);
    try {
      const todos = await api.get<any[]>('/api/licenca/codigos');
      setHistoricoDemo((todos || []).filter((c: any) => c.plano === 'demo'));
    } catch {
      // silently ignore
    } finally {
      setLoadingHistoricoDemo(false);
    }
  }, []);

  useEffect(() => { carregarHistoricoDemo(); }, [carregarHistoricoDemo]);

  async function handleGerarDemo() {
    setLoadingDemo(true);
    setCodigoDemo(null);
    try {
      const result = await api.post<any>('/api/licenca/gerar-demo', {});
      setCodigoDemo(result.codigo as string);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      carregarHistoricoDemo();
    } catch (e: any) {
      webAlert('Erro', e?.message || 'Não foi possível gerar o código demo.');
    } finally {
      setLoadingDemo(false);
    }
  }

  async function handleGerar() {
    const { precoPorAluno, total, credito, valorFinal, valorComDesconto, descontoKz } = calcPreco;
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    const cod = await gerarCodigo(formPlano, formNivel, precoPorAluno, total, credito, formNotas);
    setCodigoGerado(cod);
    setFormNotas('');
    setFormCreditoAplicar('0');
  }

  async function copiarCodigo(codigo: string) {
    let copiado = false;

    // 1) API moderna do browser (web/HTTPS) — funciona na maioria dos casos
    if (Platform.OS === 'web' && typeof navigator !== 'undefined') {
      try {
        if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
          await navigator.clipboard.writeText(codigo);
          copiado = true;
        }
      } catch {
        // pode falhar em iframes sem permissões — caímos para o fallback
      }

      // 2) Fallback: textarea + execCommand (browsers antigos / iframes)
      if (!copiado && typeof document !== 'undefined') {
        try {
          const ta = document.createElement('textarea');
          ta.value = codigo;
          ta.setAttribute('readonly', '');
          ta.style.position = 'fixed';
          ta.style.left = '-9999px';
          ta.style.top = '0';
          document.body.appendChild(ta);
          ta.focus();
          ta.select();
          ta.setSelectionRange(0, codigo.length);
          // eslint-disable-next-line deprecation/deprecation
          copiado = document.execCommand('copy');
          document.body.removeChild(ta);
        } catch {}
      }
    } else {
      // Mobile (iOS/Android) — Clipboard do react-native funciona aqui
      try {
        Clipboard.setString(codigo);
        copiado = true;
      } catch {}
    }

    if (copiado) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      webAlert('Copiado!', `Código ${codigo} copiado para a área de transferência. Cole-o no campo "Já tem um código do CEO?" para activar.`);
    } else {
      // Último recurso: pede ao utilizador para copiar manualmente
      if (Platform.OS === 'web' && typeof window !== 'undefined' && typeof window.prompt === 'function') {
        try { window.prompt('Copie o código abaixo (Ctrl+C / Cmd+C):', codigo); } catch {}
      } else {
        webAlert('Não foi possível copiar', `Anote este código manualmente:\n\n${codigo}`);
      }
    }
  }

  async function handleRevogar(cod: CodigoAtivacao) {
    webAlert('Revogar Código', `Revogar o código ${cod.codigo}?`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Revogar', style: 'destructive', onPress: async () => {
        await revogarCodigo(cod.id);
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      }},
    ]);
  }

  async function handleAddSaldo() {
    const val = parseInt(formAddSaldo);
    if (!val || val <= 0) { webAlert('Erro', 'Valor inválido. Introduza um valor positivo em KZ.'); return; }
    await adicionarCreditoAcumulado(val);
    setShowSaldo(false);
    setFormAddSaldo('');
    webAlert('Crédito Adicionado', `${val.toLocaleString('pt-AO')} KZ de crédito acumulado. Este valor será automaticamente preenchido no campo "Crédito a Aplicar" na próxima geração de código.`);
  }

  async function handleSalvarEscaloes() {
    setSalvandoEscaloes(true);
    try {
      await api.put('/licenca/escaloes', { escaloes: escaloesDraft });
      setEscaloesList(escaloesDraft);
      setShowEscaloesEditor(false);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      webAlert('Guardado', 'Tabela de escalões de volume actualizada com sucesso.');
    } catch (e: any) {
      webAlert('Erro', e?.message || 'Não foi possível guardar os escalões.');
    } finally {
      setSalvandoEscaloes(false);
    }
  }

  function updateEscalaoDraft(index: number, val: string) {
    const num = Math.max(0, Math.min(10, parseFloat(val.replace(',', '.')) || 0));
    setEscaloesDraft(prev => prev.map((e, i) => i === index ? { ...e, perc: num } : e));
  }

  const sections = [
    { key: 'dashboard', label: 'Dashboard', icon: 'grid' },
    { key: 'codigos', label: 'Códigos', icon: 'key' },
    { key: 'historico', label: 'Histórico', icon: 'time' },
    { key: 'empresa', label: 'Identidade', icon: 'business' },
    { key: 'seguranca', label: 'Segurança', icon: 'shield-checkmark' },
    { key: 'sistema', label: 'Sistema', icon: 'settings' },
    { key: 'manutencao', label: 'Manutenção', icon: 'construct' },
  ] as const;

  function irParaGestaoPLanos() {
    router.push('/(main)/gestao-planos' as any);
  }

  const alunosActivos = alunos.filter(a => a.ativo !== false).length;
  const turmasActivas = turmas.length;
  const professoresActivos = professores.filter(p => p.ativo !== false).length;
  const totalNotas = notas.length;

  // ── Pagamentos em Tempo Real ─────────────────────────────────────────────
  type Pagamento = {
    id: string; alunoId: string; taxaId: string; valor: number;
    data: string; status: string; metodoPagamento: string;
    referencia?: string; observacao?: string; createdAt: string;
  };
  type Taxa = { id: string; tipo: string; descricao: string };

  const [pagamentosAoVivo, setPagamentosAoVivo] = useState<Pagamento[]>([]);
  const [taxasMap, setTaxasMap] = useState<Record<string, Taxa>>({});
  const [ultimoUpdate, setUltimoUpdate] = useState<Date | null>(null);
  const [isLive, setIsLive] = useState(false);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const newItemAnim = useRef<Record<string, Animated.Value>>({});
  const previousIds = useRef<Set<string>>(new Set());

  const pulseLoop = useCallback(() => {
    const nd = Platform.OS !== 'web';
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 0.3, duration: 800, useNativeDriver: nd }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: nd }),
      ])
    ).start();
  }, [pulseAnim]);

  const fetchPagamentos = useCallback(async () => {
    try {
      const [pags, txs] = await Promise.all([
        api.get<Pagamento[]>('/api/pagamentos'),
        api.get<Taxa[]>('/api/taxas'),
      ]);
      const sorted = (pags || [])
        .filter(p => p.status === 'pago')
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 20);
      const map: Record<string, Taxa> = {};
      (txs || []).forEach(t => { map[t.id] = t; });
      const newIds = new Set(sorted.map(p => p.id));
      const hasNew = sorted.some(p => !previousIds.current.has(p.id));
      if (hasNew && previousIds.current.size > 0) {
        sorted.forEach(p => {
          if (!previousIds.current.has(p.id)) {
            newItemAnim.current[p.id] = new Animated.Value(0);
            Animated.timing(newItemAnim.current[p.id], {
              toValue: 1, duration: 600, useNativeDriver: Platform.OS !== 'web',
            }).start();
          }
        });
        if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      previousIds.current = newIds;
      setPagamentosAoVivo(sorted);
      setTaxasMap(map);
      setUltimoUpdate(new Date());
      setIsLive(true);
    } catch { setIsLive(false); }
  }, []);

  useEffect(() => {
    fetchPagamentos();
    pulseLoop();
    const interval = setInterval(fetchPagamentos, 6000);
    return () => clearInterval(interval);
  }, [fetchPagamentos, pulseLoop]);

  function tempoRelativo(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime();
    const s = Math.floor(diff / 1000);
    if (s < 60) return `${s}s atrás`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m atrás`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h atrás`;
    return new Date(dateStr).toLocaleDateString('pt-AO', { day: '2-digit', month: 'short' });
  }

  function formatAOA(valor: number): string {
    return valor.toLocaleString('pt-AO', { minimumFractionDigits: 0 }) + ' Kz';
  }

  const METODO_ICON: Record<string, string> = {
    dinheiro: 'cash-outline',
    transferencia: 'swap-horizontal-outline',
    multicaixa: 'card-outline',
  };

  const totalHoje = pagamentosAoVivo
    .filter(p => new Date(p.createdAt).toDateString() === new Date().toDateString())
    .reduce((acc, p) => acc + p.valor, 0);

  const alunosMap = useMemo(() => {
    const m: Record<string, string> = {};
    alunos.forEach(a => { m[a.id] = (a.nome || '') + (a.apelido ? ' ' + a.apelido : ''); });
    return m;
  }, [alunos]);

  function EscolaStatCard({ label, value, icon, color }: { label: string; value: string; icon: string; color: string }) {
    return (
      <View style={[styles.escolaStatCard, { borderColor: color + '40' }]}>
        <View style={[styles.escolaStatIcon, { backgroundColor: color + '22' }]}>
          <Ionicons name={icon as any} size={18} color={color} />
        </View>
        <Text style={[styles.escolaStatValue, { color }]}>{value}</Text>
        <Text style={styles.escolaStatLabel}>{label}</Text>
      </View>
    );
  }

  useEnterToSave(handleGerar, showGerar);
  useEnterToSave(handleAddSaldo, showSaldo);

  // ── Guarda de acesso: exclusivo para o CEO — redireciona qualquer outro role ──
  useEffect(() => {
    if (user && user.role !== 'ceo') {
      router.replace('/(main)/dashboard' as any);
    }
  }, [user, router]);

  if (!user || user.role !== 'ceo') {
    return (
      <View style={{ flex: 1, backgroundColor: '#0D1F35', alignItems: 'center', justifyContent: 'center', gap: 14 }}>
        <Ionicons name="lock-closed" size={52} color="#D4AF37" />
        <Text style={{ color: '#f4e9c8', fontSize: 17, fontFamily: 'Inter_700Bold', textAlign: 'center' }}>
          Acesso Restrito
        </Text>
        <Text style={{ color: 'rgba(244,233,200,0.45)', fontSize: 13, fontFamily: 'Inter_400Regular', textAlign: 'center', paddingHorizontal: 40 }}>
          Este painel é exclusivo do CEO.{'\n'}Não tem permissões para aceder a esta área.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <GuidedTour visible={tourVisible} onClose={closeTour} steps={TOUR_STEPS} storageKey={TOUR_KEY} />
      <TopBar
        title="Painel CEO"
        subtitle="Gestão do Sistema SIGA"
        rightAction={mainTab === 'ceo' ? { icon: 'add-circle', onPress: () => setShowGerar(true) } : undefined}
      />

      {/* CEO Badge */}
      <View style={styles.ceoBadgeBar}>
        <MaterialCommunityIcons name="crown" size={16} color="#FFD700" />
        <Text style={[styles.ceoBadgeText, { flex: 1 }]}>Acesso Total ao Sistema · Super Administrador</Text>
        <TouchableOpacity onPress={openTour} activeOpacity={0.75}>
          <Ionicons name="compass-outline" size={22} color={Colors.accent} />
        </TouchableOpacity>
      </View>

      {/* ── Abas de Topo: Dashboard CEO / Dashboard Escola ── */}
      <View style={styles.mainTabBar}>
        <TouchableOpacity
          style={[styles.mainTab, mainTab === 'ceo' && styles.mainTabActive]}
          onPress={() => { setMainTab('ceo'); setSectionCollapsed(false); }}
        >
          <MaterialCommunityIcons name="crown" size={15} color={mainTab === 'ceo' ? Colors.gold : Colors.textSecondary} />
          <Text style={[styles.mainTabText, mainTab === 'ceo' && styles.mainTabTextActive]}>Dashboard CEO</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.mainTab, mainTab === 'escola' && styles.mainTabActive]}
          onPress={() => setMainTab('escola')}
        >
          <Ionicons name="school" size={15} color={mainTab === 'escola' ? Colors.gold : Colors.textSecondary} />
          <Text style={[styles.mainTabText, mainTab === 'escola' && styles.mainTabTextActive]}>Dashboard Escola</Text>
        </TouchableOpacity>
      </View>

      {/* ── CONTEÚDO: Dashboard Escola ── */}
      {mainTab === 'escola' && (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: bottomPad + 96 }} showsVerticalScrollIndicator={false}>
          <View style={styles.escolaHeader}>
            <Ionicons name="school-outline" size={22} color={Colors.gold} />
            <View style={{ flex: 1 }}>
              <Text style={styles.escolaHeaderTitle}>Visão Geral da Escola</Text>
              <Text style={styles.escolaHeaderSub}>Dados do ano lectivo actual</Text>
            </View>
            <TouchableOpacity
              style={styles.escolaDashBtn}
              onPress={() => router.push('/(main)/dashboard' as any)}
            >
              <Text style={styles.escolaDashBtnText}>Ver Completo</Text>
              <Ionicons name="chevron-forward" size={14} color={Colors.gold} />
            </TouchableOpacity>
          </View>

          {/* ── Alerta de Subscrição — visível apenas para o CEO no painel da escola ── */}
          {diasRestantes != null && (
            <View style={[ceoLicStyles.alertBox, {
              borderColor: diasRestantes <= 0 ? '#FF3B3066' : diasRestantes <= 7 ? '#FF3B3066' : diasRestantes <= 30 ? '#FF9F0A66' : '#30D15866',
              backgroundColor: diasRestantes <= 0 ? '#FF3B300F' : diasRestantes <= 7 ? '#FF3B300F' : diasRestantes <= 30 ? '#FF9F0A0F' : '#30D1580F',
            }]}>
              <MaterialCommunityIcons
                name={diasRestantes <= 0 ? 'shield-off' : diasRestantes <= 7 ? 'shield-alert' : diasRestantes <= 30 ? 'shield-alert-outline' : 'shield-check'}
                size={20}
                color={diasRestantes <= 0 ? '#FF3B30' : diasRestantes <= 7 ? '#FF3B30' : diasRestantes <= 30 ? '#FF9F0A' : '#30D158'}
              />
              <View style={{ flex: 1 }}>
                <Text style={[ceoLicStyles.alertTitle, {
                  color: diasRestantes <= 0 ? '#FF3B30' : diasRestantes <= 7 ? '#FF3B30' : diasRestantes <= 30 ? '#FF9F0A' : '#30D158',
                }]}>
                  {diasRestantes <= 0
                    ? '⚠ Subscrição expirada — acesso da escola em risco'
                    : diasRestantes <= 7
                    ? `⚠ Subscrição expira em ${diasRestantes} dia${diasRestantes === 1 ? '' : 's'} — acção necessária`
                    : diasRestantes <= 30
                    ? `Subscrição expira em ${diasRestantes} dias — planifique a renovação`
                    : `Subscrição activa · ${diasRestantes} dias restantes`}
                </Text>
                <Text style={ceoLicStyles.alertSub}>
                  {diasRestantes <= 0
                    ? 'Esta escola não tem subscrição activa. Contacte o responsável para renovar imediatamente.'
                    : diasRestantes <= 7
                    ? 'Sem renovação, o acesso dos utilizadores desta escola será bloqueado em breve.'
                    : diasRestantes <= 30
                    ? 'Certifique-se de que a escola renova antes do prazo para evitar interrupções.'
                    : 'Controlo CEO · A escola está dentro do período de subscrição válido.'}
                </Text>
              </View>
              <TouchableOpacity style={[ceoLicStyles.alertBtn, {
                backgroundColor: diasRestantes <= 7 ? '#FF3B30' : diasRestantes <= 30 ? '#FF9F0A' : Colors.gold,
              }]} onPress={() => router.push('/licenca' as any)}>
                <Text style={ceoLicStyles.alertBtnText}>Gerir</Text>
              </TouchableOpacity>
            </View>
          )}

          <View style={styles.escolaStatsGrid}>
            <EscolaStatCard label="Alunos" value={String(alunosActivos)} icon="people" color={Colors.info} />
            <EscolaStatCard label="Turmas" value={String(turmasActivas)} icon="grid" color={Colors.warning} />
            <EscolaStatCard label="Professores" value={String(professoresActivos)} icon="person" color={Colors.success} />
            <EscolaStatCard label="Lançamentos" value={String(totalNotas)} icon="document-text" color="#8b5cf6" />
          </View>

          {/* ── Pagamentos em Tempo Real ── */}
          <View style={styles.liveHeader}>
            <View style={styles.liveBadge}>
              <Animated.View style={[styles.liveDot, { opacity: pulseAnim }]} />
              <Text style={styles.liveText}>AO VIVO</Text>
            </View>
            <Text style={styles.liveTitleText}>Pagamentos Recentes</Text>
            <TouchableOpacity onPress={fetchPagamentos} style={styles.liveRefreshBtn}>
              <Ionicons name="refresh-outline" size={16} color={Colors.textMuted} />
            </TouchableOpacity>
          </View>

          {/* Resumo do dia */}
          <View style={styles.liveSummaryRow}>
            <View style={styles.liveSummaryCard}>
              <Ionicons name="today-outline" size={16} color={Colors.success} />
              <View>
                <Text style={styles.liveSummaryLabel}>Total Hoje</Text>
                <Text style={[styles.liveSummaryValue, { color: Colors.success }]}>{formatAOA(totalHoje)}</Text>
              </View>
            </View>
            <View style={styles.liveSummaryCard}>
              <Ionicons name="receipt-outline" size={16} color={Colors.info} />
              <View>
                <Text style={styles.liveSummaryLabel}>Transacções</Text>
                <Text style={[styles.liveSummaryValue, { color: Colors.info }]}>
                  {pagamentosAoVivo.filter(p => new Date(p.createdAt).toDateString() === new Date().toDateString()).length}
                </Text>
              </View>
            </View>
            <View style={styles.liveSummaryCard}>
              <Animated.View style={{ opacity: pulseAnim }}>
                <Ionicons name="wifi-outline" size={16} color={isLive ? Colors.success : Colors.danger} />
              </Animated.View>
              <View>
                <Text style={styles.liveSummaryLabel}>Estado</Text>
                <Text style={[styles.liveSummaryValue, { color: isLive ? Colors.success : Colors.danger }]}>
                  {isLive ? 'Ligado' : 'Erro'}
                </Text>
              </View>
            </View>
          </View>

          {ultimoUpdate && (
            <Text style={styles.liveLastUpdate}>
              Actualizado: {ultimoUpdate.toLocaleTimeString('pt-AO', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </Text>
          )}

          {pagamentosAoVivo.length === 0 ? (
            <View style={styles.liveEmpty}>
              <Ionicons name="wallet-outline" size={36} color={Colors.textMuted} />
              <Text style={styles.liveEmptyText}>Sem pagamentos registados ainda</Text>
            </View>
          ) : (
            pagamentosAoVivo.map((p) => {
              const isNew = newItemAnim.current[p.id];
              const taxa = taxasMap[p.taxaId];
              const nomeAluno = alunosMap[p.alunoId] || 'Aluno';
              const metIcon = METODO_ICON[p.metodoPagamento] || 'cash-outline';
              const metColor: Record<string, string> = {
                dinheiro: Colors.success,
                transferencia: Colors.info,
                multicaixa: Colors.warning,
              };
              const cor = metColor[p.metodoPagamento] || Colors.textMuted;
              return (
                <Animated.View
                  key={p.id}
                  style={[
                    styles.liveItem,
                    isNew && {
                      opacity: isNew,
                      transform: [{ translateY: isNew.interpolate({ inputRange: [0, 1], outputRange: [-10, 0] }) }],
                    },
                  ]}
                >
                  <View style={[styles.liveItemIcon, { backgroundColor: cor + '20' }]}>
                    <Ionicons name={metIcon as any} size={18} color={cor} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.liveItemName} numberOfLines={1}>{nomeAluno}</Text>
                    <Text style={styles.liveItemTaxa} numberOfLines={1}>
                      {taxa ? taxa.descricao : p.taxaId}
                    </Text>
                  </View>
                  <View style={styles.liveItemRight}>
                    <Text style={[styles.liveItemValor, { color: Colors.success }]}>+{formatAOA(p.valor)}</Text>
                    <Text style={styles.liveItemTime}>{tempoRelativo(p.createdAt)}</Text>
                  </View>
                </Animated.View>
              );
            })
          )}

          <TouchableOpacity
            style={styles.liveVerTudoBtn}
            onPress={() => router.push('/(main)/financeiro' as any)}
          >
            <Text style={styles.liveVerTudoText}>Ver módulo financeiro completo</Text>
            <Ionicons name="arrow-forward" size={14} color={Colors.gold} />
          </TouchableOpacity>

          {/* Atalhos Académicos */}
          <Text style={styles.escolaSectionTitle}>Ferramentas Académicas</Text>
          {[
            { label: 'Consulta de Aluno', sub: 'Dossier completo: notas, pagamentos e documentos', route: '/(main)/consulta-aluno', icon: 'search', color: '#0EA5E9' },
            { label: 'Gestão de Alunos', sub: 'Matrículas, turmas e situação académica', route: '/(main)/alunos', icon: 'people', color: Colors.info },
            { label: 'Desempenho Académico', sub: 'Análise de notas e resultados por turma', route: '/(main)/desempenho', icon: 'stats-chart', color: '#8b5cf6' },
          ].map(item => (
            <TouchableOpacity
              key={item.route}
              style={styles.escolaShortcut}
              onPress={() => router.push(item.route as any)}
              activeOpacity={0.8}
            >
              <View style={[styles.escolaShortcutIcon, { backgroundColor: item.color + '22' }]}>
                <Ionicons name={item.icon as any} size={18} color={item.color} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.escolaShortcutLabel}>{item.label}</Text>
                <Text style={styles.escolaShortcutSub}>{item.sub}</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
            </TouchableOpacity>
          ))}

          {/* Atalhos financeiros */}
          <Text style={styles.escolaSectionTitle}>Controlo Financeiro</Text>
          {[
            { label: 'Módulo Financeiro', sub: 'Painel central de finanças', route: '/(main)/financeiro', icon: 'cash', color: Colors.success },
            { label: 'Propinas', sub: 'Gestão de propinas por aluno', route: '/(main)/financeiro', icon: 'wallet', color: Colors.info },
            { label: 'Pagamentos', sub: 'Histórico de transacções', route: '/(main)/financeiro', icon: 'receipt', color: Colors.gold },
            { label: 'Em Atraso', sub: 'Alunos com dívidas pendentes', route: '/(main)/financeiro', icon: 'alert-circle', color: Colors.danger },
            { label: 'Rubricas', sub: 'Taxas e tipos de cobrança', route: '/(main)/financeiro', icon: 'pricetag', color: '#8b5cf6' },
            { label: 'Relatórios Fin.', sub: 'Análise e exportação', route: '/(main)/financeiro', icon: 'bar-chart', color: Colors.warning },
          ].map(item => (
            <TouchableOpacity
              key={item.route}
              style={styles.escolaShortcut}
              onPress={() => router.push(item.route as any)}
              activeOpacity={0.8}
            >
              <View style={[styles.escolaShortcutIcon, { backgroundColor: item.color + '22' }]}>
                <Ionicons name={item.icon as any} size={18} color={item.color} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.escolaShortcutLabel}>{item.label}</Text>
                <Text style={styles.escolaShortcutSub}>{item.sub}</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
            </TouchableOpacity>
          ))}

          {/* ── Recursos Humanos ── */}
          <RHPanelCEO router={router} />
        </ScrollView>
      )}

      {/* ── CONTEÚDO: Dashboard CEO ── */}
      {mainTab === 'ceo' && (
      <>

      {/* Nav Tabs */}
      <HScrollTabBar
        style={styles.tabBar}
        contentContainerStyle={styles.tabBarContent}
        keyboardShouldPersistTaps="handled"
        stickyCount={1}
      >
        {sections.map(s => (
          <TouchableOpacity
            key={s.key}
            style={[styles.tab, section === s.key && styles.tabActive]}
            onPress={() => {
              if (section === s.key) {
                setSectionCollapsed(v => !v);
              } else {
                setSection(s.key as Section);
                setSectionCollapsed(false);
              }
            }}
          >
            <Ionicons name={s.icon as any} size={15} color={section === s.key ? Colors.gold : Colors.textSecondary} />
            <Text style={[styles.tabText, section === s.key && styles.tabTextActive]}>{s.label}</Text>
            {section === s.key && (
              <Ionicons
                name={sectionCollapsed ? 'chevron-down' : 'chevron-up'}
                size={11}
                color={Colors.gold}
                style={{ marginLeft: 2 }}
              />
            )}
          </TouchableOpacity>
        ))}
      </HScrollTabBar>

      {sectionCollapsed && (
        <TouchableOpacity
          style={styles.collapsedBar}
          onPress={() => setSectionCollapsed(false)}
          activeOpacity={0.7}
        >
          <Ionicons name="chevron-down" size={16} color={Colors.textMuted} />
          <Text style={styles.collapsedBarText}>Toca para expandir</Text>
        </TouchableOpacity>
      )}

      <ScrollView style={[{ flex: 1 }, sectionCollapsed && { display: 'none' } as any]} contentContainerStyle={{ paddingBottom: bottomPad + 96 }} showsVerticalScrollIndicator={false}>

        {/* ── DASHBOARD ── */}
        {section === 'dashboard' && (
          <View style={styles.section}>
            {/* Painel de Estado da Base de Dados Neon */}
            <NeonStatusBanner />
            <NeonStatusChart />
            {/* Licença actual */}
            <TouchableOpacity
              style={[styles.licencaCard, { borderColor: isLicencaValida ? Colors.success + '55' : Colors.danger + '55' }]}
              onPress={() => router.push('/licenca' as any)}
              activeOpacity={0.85}
            >
              <View style={styles.licencaCardHeader}>
                <View style={styles.licencaCardHeaderLeft}>
                  <MaterialCommunityIcons name="shield-check" size={22} color={isLicencaValida ? Colors.success : Colors.danger} />
                  <View>
                    <Text style={styles.licencaCardTitle}>Licença do Sistema</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                      <View style={[styles.nivelPill, { backgroundColor: NIVEL_COLOR[licenca?.nivel || 'rubi'] + '22', borderColor: NIVEL_COLOR[licenca?.nivel || 'rubi'] + '55' }]}>
                        <Text style={{ fontSize: 10 }}>{NIVEL_EMOJI[licenca?.nivel || 'rubi']}</Text>
                        <Text style={[styles.nivelPillText, { color: NIVEL_COLOR[licenca?.nivel || 'rubi'] }]}>
                          {NIVEL_LABEL[licenca?.nivel || 'rubi']}
                        </Text>
                      </View>
                      <Text style={[styles.licencaCardPlano, { color: PLANO_COLOR[licenca?.plano || 'avaliacao'] }]}>
                        {PLANO_LABEL[licenca?.plano || 'avaliacao']}
                      </Text>
                    </View>
                  </View>
                </View>
                <View style={[styles.licencaStatusBadge, { backgroundColor: isLicencaValida ? Colors.success + '22' : Colors.danger + '22' }]}>
                  <Ionicons name={isLicencaValida ? 'checkmark-circle' : 'close-circle'} size={14} color={isLicencaValida ? Colors.success : Colors.danger} />
                  <Text style={[styles.licencaStatusText, { color: isLicencaValida ? Colors.success : Colors.danger }]}>
                    {isLicencaValida ? 'Activa' : 'Expirada'}
                  </Text>
                </View>
              </View>
              <View style={styles.licencaInfoRow}>
                <View style={styles.licencaInfoItem}>
                  <Text style={styles.licencaInfoLabel}>Activação</Text>
                  <Text style={styles.licencaInfoValue}>{licenca?.dataAtivacao || '—'}</Text>
                </View>
                <View style={styles.licencaInfoItem}>
                  <Text style={styles.licencaInfoLabel}>Expiração</Text>
                  <Text style={[styles.licencaInfoValue, { color: diasRestantes <= 7 ? Colors.danger : Colors.text }]}>
                    {licenca?.dataExpiracao || '—'}
                  </Text>
                </View>
                <View style={styles.licencaInfoItem}>
                  <Text style={styles.licencaInfoLabel}>Restam</Text>
                  <Text style={[styles.licencaInfoValue, { color: diasRestantes <= 7 ? Colors.danger : Colors.success, fontWeight: '700', fontSize: 17 }]}>
                    {diasRestantes} dias
                  </Text>
                </View>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: Colors.border + '44' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Text style={{ fontSize: 12, color: Colors.gold, fontWeight: '600' }}>Ver Subscrição Completa</Text>
                  <Ionicons name="chevron-forward" size={13} color={Colors.gold} />
                </View>
              </View>
            </TouchableOpacity>

            {/* Aviso de expiração de licença */}
            {isLicencaValida && diasRestantes <= 30 && (
              <View style={[styles.licencaAvisoCard, {
                backgroundColor: diasRestantes <= 7 ? Colors.danger + '18' : diasRestantes <= 15 ? '#f97316' + '18' : Colors.gold + '18',
                borderColor: diasRestantes <= 7 ? Colors.danger + '55' : diasRestantes <= 15 ? '#f97316' + '55' : Colors.gold + '55',
              }]}>
                <Ionicons
                  name={diasRestantes <= 7 ? 'warning' : 'time-outline'}
                  size={22}
                  color={diasRestantes <= 7 ? Colors.danger : diasRestantes <= 15 ? '#f97316' : Colors.gold}
                />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.licencaAvisoTitulo, {
                    color: diasRestantes <= 7 ? Colors.danger : diasRestantes <= 15 ? '#f97316' : Colors.gold,
                  }]}>
                    {diasRestantes <= 7 ? 'Licença a expirar em breve!' : 'Licença expira em breve'}
                  </Text>
                  <Text style={styles.licencaAvisoDesc}>
                    {diasRestantes <= 1
                      ? 'A licença expira hoje. Renova agora para não perder o acesso.'
                      : `Restam ${diasRestantes} dias até à expiração. Renova a licença para garantir continuidade.`}
                  </Text>
                </View>
                <TouchableOpacity
                  style={[styles.licencaAvisoBtn, {
                    backgroundColor: diasRestantes <= 7 ? Colors.danger : diasRestantes <= 15 ? '#f97316' : Colors.gold,
                  }]}
                  onPress={() => setSection('codigos' as any)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.licencaAvisoBtnText}>Renovar</Text>
                </TouchableOpacity>
              </View>
            )}
            {!isLicencaValida && (
              <View style={[styles.licencaAvisoCard, { backgroundColor: Colors.danger + '18', borderColor: Colors.danger + '55' }]}>
                <Ionicons name="close-circle" size={22} color={Colors.danger} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.licencaAvisoTitulo, { color: Colors.danger }]}>Licença expirada</Text>
                  <Text style={styles.licencaAvisoDesc}>O acesso ao sistema pode estar limitado. Renova a licença imediatamente.</Text>
                </View>
                <TouchableOpacity
                  style={[styles.licencaAvisoBtn, { backgroundColor: Colors.danger }]}
                  onPress={() => setSection('codigos' as any)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.licencaAvisoBtnText}>Renovar</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Stats */}
            <View style={styles.statsGrid}>
              <StatCard label="Total Códigos" value={String(stats.total)} icon="key" color={Colors.info} />
              <StatCard label="Disponíveis" value={String(stats.disponiveis)} icon="checkmark-circle" color={Colors.success} />
              <StatCard label="Utilizados" value={String(stats.usados)} icon="people" color={Colors.gold} />
              <StatCard label="Expirados" value={String(stats.expirados)} icon="time" color={Colors.accent} />
            </View>

            {/* ── Estatísticas de Conversão ── */}
            <View style={convStyles.card}>
              <View style={convStyles.header}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <MaterialCommunityIcons name="chart-line" size={18} color={Colors.gold} />
                  <Text style={convStyles.title}>Conversão de Códigos</Text>
                </View>
                <TouchableOpacity onPress={fetchStatsConv} disabled={loadingStatsConv} style={convStyles.refreshBtn}>
                  {loadingStatsConv
                    ? <ActivityIndicator size="small" color={Colors.gold} />
                    : <Ionicons name="refresh" size={16} color={Colors.gold} />}
                </TouchableOpacity>
              </View>

              {!statsConv && !loadingStatsConv ? (
                <Text style={convStyles.empty}>Sem dados disponíveis.</Text>
              ) : statsConv ? (
                <>
                  {/* Barra de redenção */}
                  <View style={convStyles.taxaRow}>
                    <Text style={convStyles.taxaLabel}>Taxa de Redenção</Text>
                    <Text style={[convStyles.taxaValor, {
                      color: statsConv.taxaRedencao >= 70 ? Colors.success
                        : statsConv.taxaRedencao >= 40 ? Colors.gold
                        : Colors.accent,
                    }]}>
                      {statsConv.taxaRedencao.toFixed(1)}%
                    </Text>
                  </View>
                  <View style={convStyles.barTrack}>
                    <View style={[convStyles.barFill, {
                      width: `${Math.min(100, statsConv.taxaRedencao)}%`,
                      backgroundColor: statsConv.taxaRedencao >= 70 ? Colors.success
                        : statsConv.taxaRedencao >= 40 ? Colors.gold
                        : Colors.accent,
                    }]} />
                  </View>
                  <Text style={convStyles.taxaSub}>
                    {statsConv.activados} de {statsConv.gerados} códigos activados
                  </Text>

                  {/* KPIs lado-a-lado */}
                  <View style={convStyles.kpiRow}>
                    <View style={convStyles.kpiBox}>
                      <Text style={convStyles.kpiLabel}>Tempo médio</Text>
                      <Text style={convStyles.kpiValue}>
                        {statsConv.tempoMedioDias != null
                          ? `${statsConv.tempoMedioDias.toFixed(1)}d`
                          : '—'}
                      </Text>
                      <Text style={convStyles.kpiHint}>geração → activação</Text>
                    </View>
                    <View style={convStyles.kpiBox}>
                      <Text style={convStyles.kpiLabel}>Receita activada</Text>
                      <Text style={[convStyles.kpiValue, { color: Colors.success }]}>
                        {statsConv.valorActivado.toLocaleString('pt-AO')}
                      </Text>
                      <Text style={convStyles.kpiHint}>KZ confirmados</Text>
                    </View>
                    <View style={convStyles.kpiBox}>
                      <Text style={convStyles.kpiLabel}>Em aberto</Text>
                      <Text style={[convStyles.kpiValue, { color: Colors.gold }]}>
                        {Math.max(0, statsConv.valorPotencial - statsConv.valorActivado).toLocaleString('pt-AO')}
                      </Text>
                      <Text style={convStyles.kpiHint}>KZ por activar</Text>
                    </View>
                  </View>

                  {/* Últimas activações */}
                  {statsConv.ultimosActivados.length > 0 && (
                    <>
                      <Text style={convStyles.subtitle}>Últimas activações</Text>
                      {statsConv.ultimosActivados.map(u => (
                        <View key={u.codigo} style={convStyles.row}>
                          <View style={{ flex: 1, minWidth: 0 }}>
                            <Text style={convStyles.rowCodigo} numberOfLines={1}>{u.codigo}</Text>
                            <Text style={convStyles.rowMeta} numberOfLines={1}>
                              {u.usadoPor || '—'} · {u.usadoEm || '—'}
                            </Text>
                          </View>
                          <View style={convStyles.rowRight}>
                            <View style={[convStyles.nivelTag, { borderColor: NIVEL_COLOR[u.nivel] + '66', backgroundColor: NIVEL_COLOR[u.nivel] + '18' }]}>
                              <Text style={[convStyles.nivelTagText, { color: NIVEL_COLOR[u.nivel] }]}>
                                {NIVEL_LABEL[u.nivel]}
                              </Text>
                            </View>
                            <Text style={convStyles.rowDias}>
                              {u.diasParaActivar != null ? `${Number(u.diasParaActivar).toFixed(1)}d` : '—'}
                            </Text>
                          </View>
                        </View>
                      ))}
                    </>
                  )}
                </>
              ) : null}
            </View>

            {/* ── Código Demo ──────────────────────────────────────────────── */}
            <Text style={styles.sectionTitle}>Código Demo</Text>
            <View style={{ backgroundColor: '#8B5CF611', borderRadius: 14, borderWidth: 1, borderColor: '#8B5CF633', padding: 16, marginBottom: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <MaterialCommunityIcons name="flask-outline" size={22} color="#8B5CF6" />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: '#C4B5FD', fontWeight: '700', fontSize: 14 }}>Demo · 5 dias · Acesso Ruby completo</Text>
                  <Text style={{ color: Colors.textMuted, fontSize: 12, marginTop: 2 }}>
                    Envia este código a quem quer testar a aplicação. Quando activarem a subscrição real, o sistema substitui automaticamente.
                  </Text>
                </View>
              </View>
              {codigoDemo ? (
                <View style={{ backgroundColor: '#1a1040', borderRadius: 10, padding: 12, marginTop: 4 }}>
                  <Text style={{ color: Colors.textMuted, fontSize: 11, marginBottom: 4, letterSpacing: 1 }}>CÓDIGO GERADO</Text>
                  <Text style={{ color: '#C4B5FD', fontSize: 20, fontWeight: '800', letterSpacing: 2, fontFamily: 'monospace' }}>{codigoDemo}</Text>
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                    <TouchableOpacity
                      style={{ flex: 1, backgroundColor: '#8B5CF6', borderRadius: 8, padding: 10, alignItems: 'center' }}
                      onPress={() => copiarCodigo(codigoDemo)}
                    >
                      <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>Copiar Código</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={{ flex: 1, backgroundColor: '#2a1a60', borderRadius: 8, padding: 10, alignItems: 'center' }}
                      onPress={handleGerarDemo}
                    >
                      <Text style={{ color: '#C4B5FD', fontWeight: '600', fontSize: 13 }}>Gerar Novo</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <TouchableOpacity
                  style={{ backgroundColor: '#8B5CF6', borderRadius: 10, padding: 12, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8, marginTop: 4, opacity: loadingDemo ? 0.6 : 1 }}
                  onPress={handleGerarDemo}
                  disabled={loadingDemo}
                >
                  <MaterialCommunityIcons name="flash" size={18} color="#fff" />
                  <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>
                    {loadingDemo ? 'A gerar...' : 'Gerar Código Demo'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            {/* ── Histórico de Códigos Demo ───────────────────────────── */}
            {(loadingHistoricoDemo || historicoDemo.length > 0) && (
              <View style={{ marginBottom: 16 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <Text style={{ color: '#C4B5FD', fontWeight: '700', fontSize: 13, letterSpacing: 0.5 }}>
                    HISTÓRICO DEMO ({historicoDemo.length})
                  </Text>
                  <TouchableOpacity onPress={carregarHistoricoDemo} disabled={loadingHistoricoDemo}>
                    <MaterialCommunityIcons name="refresh" size={16} color={loadingHistoricoDemo ? Colors.textMuted : '#8B5CF6'} />
                  </TouchableOpacity>
                </View>
                {loadingHistoricoDemo ? (
                  <ActivityIndicator size="small" color="#8B5CF6" />
                ) : (
                  historicoDemo.slice(0, 10).map((c: any) => {
                    const expirou = c.dataExpiracaoCodigo && new Date(c.dataExpiracaoCodigo) < new Date();
                    const estado = c.usado ? 'usado' : expirou ? 'expirado' : 'disponível';
                    const corEstado = c.usado ? '#22C55E' : expirou ? '#EF4444' : '#8B5CF6';
                    const bgEstado = c.usado ? '#22C55E18' : expirou ? '#EF444418' : '#8B5CF618';
                    const dataGeracao = c.criadoEm ? new Date(c.criadoEm).toLocaleDateString('pt-PT') : '—';
                    const dataUso = c.usadoEm ? new Date(c.usadoEm).toLocaleDateString('pt-PT') : null;
                    return (
                      <View
                        key={c.id}
                        style={{ backgroundColor: '#0f0a24', borderRadius: 10, borderWidth: 1, borderColor: corEstado + '33', padding: 12, marginBottom: 8 }}
                      >
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                          <Text style={{ color: '#C4B5FD', fontWeight: '800', fontSize: 14, letterSpacing: 1.5, fontFamily: 'monospace' }}>
                            {c.codigo}
                          </Text>
                          <TouchableOpacity
                            style={{ backgroundColor: bgEstado, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }}
                            onPress={() => copiarCodigo(c.codigo)}
                          >
                            <Text style={{ color: corEstado, fontWeight: '700', fontSize: 11 }}>
                              {estado.toUpperCase()}
                            </Text>
                          </TouchableOpacity>
                        </View>
                        <View style={{ flexDirection: 'row', gap: 12, flexWrap: 'wrap' }}>
                          <Text style={{ color: Colors.textMuted, fontSize: 11 }}>
                            🗓 Gerado: {dataGeracao}
                          </Text>
                          {dataUso && (
                            <Text style={{ color: '#22C55E', fontSize: 11 }}>
                              ✅ Activado: {dataUso}
                            </Text>
                          )}
                          {c.usadoPor && (
                            <Text style={{ color: Colors.textMuted, fontSize: 11 }}>
                              por {c.usadoPor}
                            </Text>
                          )}
                          {!c.usado && !expirou && c.dataExpiracaoCodigo && (
                            <Text style={{ color: Colors.textMuted, fontSize: 11 }}>
                              ⏳ Expira: {new Date(c.dataExpiracaoCodigo).toLocaleDateString('pt-PT')}
                            </Text>
                          )}
                        </View>
                      </View>
                    );
                  })
                )}
                {historicoDemo.length > 10 && (
                  <Text style={{ color: Colors.textMuted, fontSize: 12, textAlign: 'center', marginTop: 4 }}>
                    +{historicoDemo.length - 10} códigos mais antigos
                  </Text>
                )}
              </View>
            )}

            {/* Níveis de Subscrição */}
            <Text style={styles.sectionTitle}>Níveis de Subscrição</Text>
            {(['prata', 'ouro', 'rubi'] as TipoNivel[]).map(n => (
              <View key={n} style={[styles.planoRow, { borderColor: NIVEL_COLOR[n] + '44' }]}>
                <Text style={{ fontSize: 18 }}>{NIVEL_EMOJI[n]}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.planoNome, { color: NIVEL_COLOR[n] }]}>{NIVEL_LABEL[n]}</Text>
                  <Text style={styles.planoDias}>{NIVEL_DESC[n]}</Text>
                  <Text style={[styles.planoDias, { color: Colors.textMuted }]}>
                    {NIVEL_FEATURES[n].length} funcionalidades incluídas
                  </Text>
                </View>
                <TouchableOpacity
                  style={[styles.planoGerarBtn, { backgroundColor: NIVEL_COLOR[n] + 'dd' }]}
                  onPress={() => { setFormNivel(n); setShowGerar(true); }}
                >
                  <Text style={styles.planoGerarText}>Gerar</Text>
                </TouchableOpacity>
              </View>
            ))}

            <TouchableOpacity
              style={[styles.planoRow, { backgroundColor: Colors.gold + '10', borderColor: Colors.gold + '33' }]}
              onPress={irParaGestaoPLanos}
            >
              <MaterialCommunityIcons name="view-list" size={18} color={Colors.gold} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.planoNome, { color: Colors.gold }]}>Ver Comparação de Planos</Text>
                <Text style={styles.planoDias}>Funcionalidades por nível • Premium, Golden, Ruby</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={Colors.gold} />
            </TouchableOpacity>

            {/* Planos de Duração */}
            <Text style={styles.sectionTitle}>Duração dos Planos</Text>
            {(['mensal', 'trimestral', 'semestral', 'anual'] as TipoPlano[]).map(plano => (
              <View key={plano} style={styles.planoRow}>
                <View style={[styles.planoDot, { backgroundColor: PLANO_COLOR[plano] }]} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.planoNome}>{PLANO_LABEL[plano]}</Text>
                  <Text style={styles.planoDias}>{PLANO_DIAS[plano]} dias de validade</Text>
                </View>
                <TouchableOpacity
                  style={styles.planoGerarBtn}
                  onPress={() => { setFormPlano(plano); setShowGerar(true); }}
                >
                  <Text style={styles.planoGerarText}>Gerar</Text>
                </TouchableOpacity>
              </View>
            ))}

            {/* ── Escalões de Volume ── */}
            <Text style={styles.sectionTitle}>Escalões de Desconto por Volume</Text>
            <View style={styles.escaloesCard}>
              {/* Header */}
              <TouchableOpacity
                style={styles.escaloesCardHeader}
                onPress={() => {
                  setEscaloesDraft(escaloesList);
                  setShowEscaloesEditor(s => !s);
                }}
                activeOpacity={0.8}
              >
                <View style={styles.escaloesHeaderLeft}>
                  <MaterialCommunityIcons name="tag-multiple" size={20} color={Colors.gold} />
                  <View>
                    <Text style={styles.escaloesHeaderTitle}>Tabela de Escalões</Text>
                    <Text style={styles.escaloesHeaderSub}>Desconto máx: 10% · {escaloesList.length} faixas configuradas</Text>
                  </View>
                </View>
                <Ionicons
                  name={showEscaloesEditor ? 'chevron-up' : 'chevron-down'}
                  size={18}
                  color={Colors.textMuted}
                />
              </TouchableOpacity>

              {/* Tabela colapsável */}
              {showEscaloesEditor && (
                <View style={styles.escaloesBody}>
                  {/* Cabeçalho da tabela */}
                  <View style={styles.escaloesTableHead}>
                    <Text style={[styles.escaloesThText, { flex: 2 }]}>Intervalo</Text>
                    <Text style={[styles.escaloesThText, { flex: 1, textAlign: 'center' }]}>Desc. (%)</Text>
                    <Text style={[styles.escaloesThText, { flex: 1.3, textAlign: 'right' }]}>Preço/aluno</Text>
                  </View>

                  {escaloesDraft.map((esc, idx) => {
                    const precoFinal = Math.round(precoBaseEsc * (1 - esc.perc / 100));
                    return (
                      <View key={idx} style={[styles.escaloesTableRow, idx % 2 === 0 ? styles.escaloesRowEven : styles.escaloesRowOdd]}>
                        <Text style={[styles.escaloesLabel, { flex: 2 }]}>{esc.label}</Text>
                        <View style={[{ flex: 1, alignItems: 'center' }]}>
                          <TextInput
                            style={styles.escaloesInput}
                            value={String(esc.perc)}
                            keyboardType="decimal-pad"
                            onChangeText={v => updateEscalaoDraft(idx, v)}
                            maxLength={4}
                            selectTextOnFocus
                          />
                        </View>
                        <View style={{ flex: 1.3, alignItems: 'flex-end' }}>
                          <Text style={styles.escaloesPreco}>
                            {precoFinal} KZ{esc.perc > 0 ? ` (-${esc.perc}%)` : ''}
                          </Text>
                        </View>
                      </View>
                    );
                  })}

                  <Text style={styles.escaloesCap}>
                    * Preço base usado no simulador: {precoBaseEsc} KZ/aluno. Desconto limitado a 10%.
                  </Text>

                  {/* Botões */}
                  <View style={styles.escaloesActions}>
                    <TouchableOpacity
                      style={styles.escaloesReporBtn}
                      onPress={() => setEscaloesDraft(escaloesList)}
                    >
                      <Ionicons name="refresh-outline" size={14} color={Colors.textMuted} />
                      <Text style={styles.escaloesReporText}>Repor</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.escaloesGuardarBtn, salvandoEscaloes && { opacity: 0.6 }]}
                      onPress={handleSalvarEscaloes}
                      disabled={salvandoEscaloes}
                    >
                      {salvandoEscaloes
                        ? <ActivityIndicator size="small" color="#fff" />
                        : <Ionicons name="checkmark" size={14} color="#fff" />}
                      <Text style={styles.escaloesGuardarText}>
                        {salvandoEscaloes ? 'A guardar…' : 'Guardar Alterações'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>
          </View>
        )}

        {/* ── CÓDIGOS ACTIVOS ── */}
        {section === 'codigos' && (
          <View style={styles.section}>
            <View style={styles.filterRow}>
              {(['todos', 'disponivel', 'usado'] as const).map(f => (
                <TouchableOpacity
                  key={f}
                  style={[styles.filterBtn, filterUsado === f && styles.filterBtnActive]}
                  onPress={() => setFilterUsado(f)}
                >
                  <Text style={[styles.filterBtnText, filterUsado === f && styles.filterBtnTextActive]}>
                    {f === 'todos' ? 'Todos' : f === 'disponivel' ? 'Disponíveis' : 'Usados'}
                  </Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity style={styles.novoCodeBtn} onPress={() => setShowGerar(true)}>
                <Ionicons name="add" size={16} color="#fff" />
                <Text style={styles.novoCodeText}>Novo</Text>
              </TouchableOpacity>
            </View>

            {codigosFiltrados.length === 0 && (
              <View style={styles.empty}>
                <Ionicons name="key-outline" size={44} color={Colors.textMuted} />
                <Text style={styles.emptyTitle}>Sem códigos</Text>
                <Text style={styles.emptyMsg}>Gere um código de activação para uma escola.</Text>
              </View>
            )}

            {codigosFiltrados.map(cod => (
              <CodigoCard
                key={cod.id}
                cod={cod}
                onCopy={() => copiarCodigo(cod.codigo)}
                onRevogar={() => handleRevogar(cod)}
              />
            ))}
          </View>
        )}

        {/* ── IDENTIDADE ── */}
        {section === 'empresa' && <EmpresaIdentidadeSection />}

        {/* ── SEGURANÇA ── */}
        {section === 'seguranca' && (
          <View style={styles.section}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: Colors.info + '22', alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="shield-checkmark" size={22} color={Colors.info} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.sectionTitle}>Segurança & Auditoria</Text>
                <Text style={{ fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textMuted }}>Controlo de acessos e registo de eventos</Text>
              </View>
            </View>

            {/* ── Aprovação de Login ── */}
            <View style={{ backgroundColor: Colors.surface, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: Colors.border, marginBottom: 14, marginTop: 16 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <Ionicons name="mail-open-outline" size={18} color={Colors.warning} />
                <Text style={{ fontSize: 14, fontFamily: 'Inter_700Bold', color: Colors.text }}>Aprovação de Login por Email</Text>
              </View>

              {/* Email status */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: (emailStatus === true ? Colors.success : Colors.danger) + '18', borderRadius: 10, padding: 10, marginBottom: 14 }}>
                <Ionicons name={emailStatus === true ? 'checkmark-circle' : 'close-circle'} size={16} color={emailStatus === true ? Colors.success : Colors.danger} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 12, fontFamily: 'Inter_600SemiBold', color: emailStatus === true ? Colors.success : Colors.danger }}>
                    {emailStatus === null ? 'A verificar serviço de email...' : emailStatus ? 'Serviço de email configurado (Resend)' : 'Email NÃO configurado — aprovação não funciona sem RESEND_API_KEY'}
                  </Text>
                  {emailStatus === false && (
                    <Text style={{ fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 2 }}>
                      Configure RESEND_API_KEY e EMAIL_FROM nas variáveis de ambiente para activar esta funcionalidade.
                    </Text>
                  )}
                </View>
              </View>

              {/* Toggle */}
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View style={{ flex: 1, marginRight: 12 }}>
                  <Text style={{ fontSize: 13, fontFamily: 'Inter_600SemiBold', color: Colors.text }}>Activar aprovação de login</Text>
                  <Text style={{ fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 2, lineHeight: 16 }}>
                    {loginAprovAtiva
                      ? 'Activo — cada login envia email ao utilizador para aprovação'
                      : 'Inactivo — login directo sem confirmação por email'}
                  </Text>
                </View>
                {loginAprovLoading ? (
                  <ActivityIndicator size="small" color={Colors.gold} />
                ) : (
                  <Switch
                    value={loginAprovAtiva}
                    onValueChange={v => {
                      if (v && emailStatus === false) {
                        webAlert('Email não configurado', 'Configure RESEND_API_KEY e EMAIL_FROM antes de activar a aprovação de login.');
                        return;
                      }
                      toggleLoginAprovacao(v);
                    }}
                    trackColor={{ false: Colors.border, true: Colors.info + '88' }}
                    thumbColor={loginAprovAtiva ? Colors.info : Colors.textMuted}
                    disabled={loginAprovLoading}
                  />
                )}
              </View>

              {loginAprovAtiva && emailStatus === true && (
                <View style={{ backgroundColor: Colors.info + '12', borderRadius: 8, padding: 10, marginTop: 12 }}>
                  <Text style={{ fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.info, lineHeight: 16 }}>
                    ✅ Quando activo, cada tentativa de login envia um email ao utilizador com botões "Autorizar" / "Recusar". O utilizador aguarda na app durante 10 minutos.
                  </Text>
                </View>
              )}
            </View>

            {/* ── Auditoria de Login ── */}
            <View style={{ backgroundColor: Colors.surface, borderRadius: 14, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden', marginBottom: 14 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14, borderBottomWidth: 1, borderBottomColor: Colors.border }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Ionicons name="list-outline" size={18} color={Colors.textSecondary} />
                  <Text style={{ fontSize: 14, fontFamily: 'Inter_700Bold', color: Colors.text }}>Registo de Auditoria</Text>
                </View>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  {(['login', 'todos'] as const).map(f => (
                    <TouchableOpacity
                      key={f}
                      style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, backgroundColor: auditFiltro === f ? Colors.info + '22' : Colors.card, borderWidth: 1, borderColor: auditFiltro === f ? Colors.info + '66' : Colors.border }}
                      onPress={() => { setAuditFiltro(f); setAuditPage(1); fetchAuditLogs(1, f); }}
                    >
                      <Text style={{ fontSize: 11, fontFamily: 'Inter_600SemiBold', color: auditFiltro === f ? Colors.info : Colors.textMuted }}>
                        {f === 'login' ? 'Login' : 'Todos'}
                      </Text>
                    </TouchableOpacity>
                  ))}
                  <TouchableOpacity
                    style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.border }}
                    onPress={() => fetchAuditLogs(auditPage, auditFiltro)}
                  >
                    <Ionicons name="refresh-outline" size={14} color={Colors.textMuted} />
                  </TouchableOpacity>
                </View>
              </View>

              {auditLoading ? (
                <View style={{ padding: 24, alignItems: 'center' }}>
                  <ActivityIndicator size="small" color={Colors.gold} />
                  <Text style={{ fontSize: 12, color: Colors.textMuted, marginTop: 8 }}>A carregar registos...</Text>
                </View>
              ) : auditLogs.length === 0 ? (
                <View style={{ padding: 24, alignItems: 'center' }}>
                  <Ionicons name="document-text-outline" size={32} color={Colors.textMuted} />
                  <Text style={{ fontSize: 13, color: Colors.textMuted, marginTop: 8 }}>Sem registos de auditoria</Text>
                  <Text style={{ fontSize: 11, color: Colors.textMuted, marginTop: 4 }}>
                    {auditFiltro === 'login' ? 'Nenhum pedido de aprovação de login registado ainda.' : 'Ainda não há eventos de auditoria.'}
                  </Text>
                </View>
              ) : (
                <>
                  {auditLogs.map((log, idx) => {
                    const isAprovado = log.acao === 'login_aprovado';
                    const isRecusado = log.acao === 'login_recusado';
                    const isSolicitado = log.acao === 'login_aprovacao_solicitada';
                    const cor = isAprovado ? Colors.success : isRecusado ? Colors.danger : Colors.warning;
                    const icone = isAprovado ? 'checkmark-circle' : isRecusado ? 'close-circle' : 'time';
                    const dataStr = log.criadoEm ? new Date(log.criadoEm).toLocaleString('pt-AO', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';
                    return (
                      <View key={log.id ?? idx} style={{ padding: 12, borderBottomWidth: idx < auditLogs.length - 1 ? 1 : 0, borderBottomColor: Colors.border, flexDirection: 'row', gap: 10 }}>
                        <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: cor + '22', alignItems: 'center', justifyContent: 'center', marginTop: 2 }}>
                          <Ionicons name={icone as any} size={16} color={cor} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                            <Text style={{ fontSize: 12, fontFamily: 'Inter_600SemiBold', color: cor, flexShrink: 1 }}>
                              {log.acao.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                            </Text>
                            <Text style={{ fontSize: 10, fontFamily: 'Inter_400Regular', color: Colors.textMuted }}>{dataStr}</Text>
                          </View>
                          <Text style={{ fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textSecondary, marginTop: 2, lineHeight: 15 }} numberOfLines={2}>
                            {log.descricao}
                          </Text>
                          {log.userEmail && (
                            <Text style={{ fontSize: 10, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 2 }}>
                              {log.userName ? `${log.userName} · ` : ''}{log.userEmail}
                            </Text>
                          )}
                        </View>
                      </View>
                    );
                  })}

                  {/* Paginação */}
                  {auditTotal > 20 && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, padding: 12, borderTopWidth: 1, borderTopColor: Colors.border }}>
                      <TouchableOpacity
                        style={{ opacity: auditPage <= 1 ? 0.3 : 1 }}
                        onPress={() => { const p = Math.max(1, auditPage - 1); setAuditPage(p); fetchAuditLogs(p, auditFiltro); }}
                        disabled={auditPage <= 1}
                      >
                        <Ionicons name="chevron-back" size={18} color={Colors.textSecondary} />
                      </TouchableOpacity>
                      <Text style={{ fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textMuted }}>
                        Página {auditPage} de {Math.ceil(auditTotal / 20)}
                      </Text>
                      <TouchableOpacity
                        style={{ opacity: auditPage >= Math.ceil(auditTotal / 20) ? 0.3 : 1 }}
                        onPress={() => { const p = Math.min(Math.ceil(auditTotal / 20), auditPage + 1); setAuditPage(p); fetchAuditLogs(p, auditFiltro); }}
                        disabled={auditPage >= Math.ceil(auditTotal / 20)}
                      >
                        <Ionicons name="chevron-forward" size={18} color={Colors.textSecondary} />
                      </TouchableOpacity>
                    </View>
                  )}
                </>
              )}
            </View>

            {/* ── Info adicional ── */}
            <View style={{ backgroundColor: Colors.card, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: Colors.border }}>
              <Text style={{ fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted, lineHeight: 17 }}>
                📋 Todos os eventos de aprovação de login são registados automaticamente no sistema de auditoria, incluindo o IP e dispositivo do utilizador. Estes registos são imutáveis e não podem ser eliminados pelos administradores.
              </Text>
            </View>
          </View>
        )}

        {/* ── SISTEMA ── */}
        {section === 'sistema' && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Gestão do Sistema</Text>
            <Text style={[styles.sectionTitle, { fontSize: 13, fontWeight: '400', marginBottom: 20 }]}>
              Operações administrativas de alto nível. Exclusivo para o CEO.
            </Text>

            {/* ── Dados de Pagamento de Licença ── */}
            <View style={{ backgroundColor: Colors.surface, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: Colors.border, marginBottom: 16 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: Colors.gold + '22', alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="card-outline" size={22} color={Colors.gold} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, fontFamily: 'Inter_700Bold', color: Colors.text }}>Dados de Pagamento de Licença</Text>
                  <Text style={{ fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 2 }}>Informações bancárias exibidas nos avisos de renovação enviados às escolas clientes</Text>
                </View>
                {licPagLoading && <ActivityIndicator size="small" color={Colors.gold} />}
              </View>

              {[
                { key: 'licencaBeneficiario', label: 'Beneficiário / Nome da Empresa', placeholder: 'Ex: Queta Tech, Lda.', icon: 'business-outline' },
                { key: 'licencaIban', label: 'IBAN (Banco)', placeholder: 'Ex: AO06 0040 0000 1234 5678 9012 3', icon: 'card-outline' },
                { key: 'licencaBic', label: 'BIC / SWIFT', placeholder: 'Ex: BAIAAOLU', icon: 'globe-outline' },
                { key: 'licencaMulticaixaRef', label: 'Referência Multicaixa Express', placeholder: 'Ex: 923 456 789', icon: 'phone-portrait-outline' },
              ].map(field => (
                <View key={field.key} style={{ marginBottom: 12 }}>
                  <Text style={{ fontSize: 11, fontFamily: 'Inter_600SemiBold', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 5 }}>{field.label}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.card, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 12, gap: 8 }}>
                    <Ionicons name={field.icon as any} size={15} color={Colors.textMuted} />
                    <TextInput
                      style={{ flex: 1, fontSize: 14, color: Colors.text, fontFamily: 'Inter_400Regular', paddingVertical: 11 }}
                      value={(licPag as any)[field.key]}
                      onChangeText={v => setLicPag(p => ({ ...p, [field.key]: v }))}
                      placeholder={field.placeholder}
                      placeholderTextColor={Colors.textMuted}
                      autoCapitalize="none"
                    />
                  </View>
                </View>
              ))}

              <TouchableOpacity
                style={{ backgroundColor: licPagSaved ? Colors.success : Colors.gold, borderRadius: 12, paddingVertical: 13, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8, opacity: licPagSaving ? 0.7 : 1 }}
                onPress={saveLicPag}
                disabled={licPagSaving}
                activeOpacity={0.85}
              >
                {licPagSaving
                  ? <ActivityIndicator size="small" color="#000" />
                  : <Ionicons name={licPagSaved ? 'checkmark-circle' : 'save-outline'} size={17} color="#000" />}
                <Text style={{ fontSize: 14, fontFamily: 'Inter_700Bold', color: '#000' }}>
                  {licPagSaving ? 'A guardar...' : licPagSaved ? 'Guardado!' : 'Guardar Dados de Pagamento'}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Reset DB Card */}
            <View style={{ backgroundColor: Colors.danger + '12', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: Colors.danger + '44', marginBottom: 16 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: Colors.danger + '22', alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="nuclear-outline" size={22} color={Colors.danger} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, fontFamily: 'Inter_700Bold', color: Colors.danger }}>Reset Completo da Base de Dados</Text>
                  <Text style={{ fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 2 }}>Apaga todos os dados operacionais da escola</Text>
                </View>
              </View>

              <View style={{ backgroundColor: Colors.danger + '18', borderRadius: 10, padding: 10, marginBottom: 14, gap: 4 }}>
                <Text style={{ fontSize: 12, fontFamily: 'Inter_600SemiBold', color: Colors.danger, marginBottom: 4 }}>⚠️ O que será apagado:</Text>
                {['Todos os alunos e matrículas', 'Notas, presenças e pautas', 'Pagamentos e rubricas financeiras', 'Funcionários e folhas de salário', 'Turmas, horários e sumários', 'Documentos emitidos e notificações'].map(item => (
                  <Text key={item} style={{ fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted }}>• {item}</Text>
                ))}
                <Text style={{ fontSize: 11, fontFamily: 'Inter_600SemiBold', color: Colors.success, marginTop: 6 }}>✓ Configurações, utilizadores e licença são mantidos.</Text>
              </View>

              <TouchableOpacity
                style={{ backgroundColor: Colors.danger, borderRadius: 12, paddingVertical: 14, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 }}
                onPress={() => { setShowResetModal(true); setResetStep(1); }}
                activeOpacity={0.8}
              >
                <Ionicons name="warning-outline" size={18} color="#fff" />
                <Text style={{ fontSize: 14, fontFamily: 'Inter_700Bold', color: '#fff' }}>Iniciar Reset da Base de Dados</Text>
              </TouchableOpacity>
            </View>

            {/* Info do sistema */}
            <View style={{ backgroundColor: Colors.surface, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: Colors.border }}>
              <Text style={{ fontSize: 12, fontFamily: 'Inter_600SemiBold', color: Colors.textMuted, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.6 }}>Informações do Sistema</Text>
              {[
                { label: 'Versão', value: 'Super Escola v1.03' },
                { label: 'Base de dados', value: 'Neon PostgreSQL' },
                { label: 'Ambiente', value: 'Produção' },
                { label: 'Linguagem', value: 'Node.js + TypeScript' },
              ].map(row => (
                <View key={row.label} style={{ paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: Colors.border }}>
                  <Text style={{ fontSize: 10, fontFamily: 'Inter_400Regular', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 }}>{row.label}</Text>
                  <Text style={{ fontSize: 14, fontFamily: 'Inter_500Medium', color: Colors.text, marginTop: 2 }}>{row.value}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* ── MANUTENÇÃO ── */}
        {section === 'manutencao' && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Controlo de Manutenção</Text>
            <Text style={[styles.sectionTitle, { fontSize: 13, fontWeight: '400', marginBottom: 20 }]}>
              Activa a manutenção para bloquear o acesso dos utilizadores em produção enquanto trabalhas.
            </Text>

            {manutLoading ? (
              <ActivityIndicator size="large" color={Colors.gold} style={{ marginTop: 40 }} />
            ) : (
              <>
                {/* ── Status Card ── */}
                <View style={{
                  backgroundColor: manutAtiva ? Colors.warning + '14' : Colors.success + '12',
                  borderRadius: 20, padding: 20, borderWidth: 1,
                  borderColor: manutAtiva ? Colors.warning + '55' : Colors.success + '44',
                  marginBottom: 16, flexDirection: 'row', alignItems: 'center', gap: 16,
                }}>
                  <View style={{
                    width: 56, height: 56, borderRadius: 16,
                    backgroundColor: manutAtiva ? Colors.warning + '22' : Colors.success + '22',
                    alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Ionicons name={manutAtiva ? 'construct' : 'checkmark-circle'} size={28}
                      color={manutAtiva ? Colors.warning : Colors.success} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 16, fontFamily: 'Inter_700Bold', color: Colors.text }}>
                      {manutAtiva ? 'Manutenção ACTIVA' : 'Sistema NORMAL'}
                    </Text>
                    <Text style={{ fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 3 }}>
                      {manutAtiva
                        ? `Utilizadores em produção vêem a página de manutenção`
                        : 'Todos os utilizadores têm acesso normal ao sistema'}
                    </Text>
                    {manutAtiva && manutActivadaEm && (
                      <Text style={{ fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.warning + 'AA', marginTop: 4 }}>
                        Activa desde {new Date(manutActivadaEm).toLocaleString('pt-PT')}
                      </Text>
                    )}
                  </View>
                  <View style={{
                    width: 12, height: 12, borderRadius: 6,
                    backgroundColor: manutAtiva ? Colors.warning : Colors.success,
                  }} />
                </View>

                {/* ── Mensagem ── */}
                <View style={{ backgroundColor: Colors.surface, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: Colors.border, marginBottom: 16 }}>
                  <Text style={{ fontSize: 11, fontFamily: 'Inter_600SemiBold', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 }}>
                    Mensagem para os utilizadores
                  </Text>
                  <View style={{ backgroundColor: Colors.card, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 14, paddingVertical: 4, flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
                    <Ionicons name="chatbubble-ellipses-outline" size={16} color={Colors.textMuted} style={{ marginTop: 12 }} />
                    <TextInput
                      style={{ flex: 1, fontSize: 14, color: Colors.text, fontFamily: 'Inter_400Regular', paddingVertical: 12, minHeight: 80, textAlignVertical: 'top' }}
                      value={manutMensagem}
                      onChangeText={setManutMensagem}
                      placeholder="Ex: Parametrização da documentação escolar interna"
                      placeholderTextColor={Colors.textMuted}
                      multiline
                      numberOfLines={3}
                    />
                  </View>
                  <Text style={{ fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 8 }}>
                    Este texto aparece na página de manutenção que os utilizadores vêem.
                  </Text>
                </View>

                {/* ── Aviso de ambiente ── */}
                <View style={{ backgroundColor: Colors.info + '12', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: Colors.info + '33', marginBottom: 20, flexDirection: 'row', gap: 10 }}>
                  <Ionicons name="information-circle-outline" size={18} color={Colors.info} style={{ flexShrink: 0, marginTop: 1 }} />
                  <Text style={{ flex: 1, fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textMuted, lineHeight: 18 }}>
                    A manutenção só bloqueia o acesso em <Text style={{ color: Colors.info, fontFamily: 'Inter_600SemiBold' }}>produção</Text>. No Replit (desenvolvimento) continuas a trabalhar normalmente sem bloqueio.
                  </Text>
                </View>

                {/* ── Feedback ── */}
                {manutFeedback && (
                  <View style={{
                    backgroundColor: manutFeedback.tipo === 'ok' ? Colors.success + '14' : Colors.danger + '14',
                    borderRadius: 12, padding: 14, borderWidth: 1,
                    borderColor: manutFeedback.tipo === 'ok' ? Colors.success + '44' : Colors.danger + '44',
                    marginBottom: 16,
                  }}>
                    <Text style={{ fontSize: 13, fontFamily: 'Inter_500Medium', color: manutFeedback.tipo === 'ok' ? Colors.success : Colors.danger, lineHeight: 20 }}>
                      {manutFeedback.texto}
                    </Text>
                  </View>
                )}

                {/* ── Botões ── */}
                {!manutAtiva ? (
                  <TouchableOpacity
                    style={{ backgroundColor: Colors.warning, borderRadius: 14, paddingVertical: 15, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 10, opacity: manutSaving ? 0.7 : 1 }}
                    onPress={activarManutencao}
                    disabled={manutSaving}
                    activeOpacity={0.85}
                  >
                    {manutSaving
                      ? <ActivityIndicator size="small" color="#000" />
                      : <Ionicons name="construct" size={18} color="#000" />}
                    <Text style={{ fontSize: 15, fontFamily: 'Inter_700Bold', color: '#000' }}>
                      {manutSaving ? 'A activar...' : 'Activar Manutenção'}
                    </Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    style={{ backgroundColor: Colors.success, borderRadius: 14, paddingVertical: 15, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 10, opacity: manutSaving ? 0.7 : 1 }}
                    onPress={desactivarManutencao}
                    disabled={manutSaving}
                    activeOpacity={0.85}
                  >
                    {manutSaving
                      ? <ActivityIndicator size="small" color="#fff" />
                      : <Ionicons name="checkmark-circle" size={18} color="#fff" />}
                    <Text style={{ fontSize: 15, fontFamily: 'Inter_700Bold', color: '#fff' }}>
                      {manutSaving ? 'A desactivar...' : 'Desactivar Manutenção'}
                    </Text>
                  </TouchableOpacity>
                )}

                {/* ── Versão do APK ── */}
                <View style={{ backgroundColor: Colors.surface, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: 'rgba(52,199,89,0.25)', marginTop: 20 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                    <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(52,199,89,0.15)', alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name="phone-portrait-outline" size={20} color="#34C759" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 15, color: Colors.text }}>Versão do APK</Text>
                      <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 11, color: Colors.textMuted, marginTop: 1 }}>
                        Define a versão e URL de download do APK Android
                      </Text>
                    </View>
                  </View>

                  <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 11, color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6 }}>
                    Número de versão
                  </Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: Colors.card, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 14 }}>
                    <Ionicons name="git-branch-outline" size={16} color={Colors.textMuted} />
                    <TextInput
                      style={{ flex: 1, fontFamily: 'Inter_400Regular', fontSize: 14, color: Colors.text, paddingVertical: 0 }}
                      placeholder="ex.: 2.1.1"
                      placeholderTextColor={Colors.textMuted}
                      value={apkVersion}
                      onChangeText={setApkVersion}
                      keyboardType="decimal-pad"
                      returnKeyType="next"
                    />
                    {apkVersion.length > 0 && /^\d+\.\d+(\.\d+)?$/.test(apkVersion) && (
                      <Ionicons name="checkmark-circle" size={16} color="#34C759" />
                    )}
                  </View>

                  <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 11, color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6 }}>
                    URL de download externo <Text style={{ fontFamily: 'Inter_400Regular', textTransform: 'none' }}>(opcional)</Text>
                  </Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: Colors.card, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 6 }}>
                    <Ionicons name="link-outline" size={16} color={Colors.textMuted} />
                    <TextInput
                      style={{ flex: 1, fontFamily: 'Inter_400Regular', fontSize: 13, color: Colors.text, paddingVertical: 0 }}
                      placeholder="https://github.com/.../SuperEscola.apk"
                      placeholderTextColor={Colors.textMuted}
                      value={apkExternalUrl}
                      onChangeText={setApkExternalUrl}
                      autoCapitalize="none"
                      keyboardType="url"
                      returnKeyType="done"
                      onSubmitEditing={salvarApkVersion}
                    />
                    {apkExternalUrl.length > 0 && (
                      <TouchableOpacity onPress={() => setApkExternalUrl('')} hitSlop={8}>
                        <Ionicons name="close-circle" size={16} color={Colors.textMuted} />
                      </TouchableOpacity>
                    )}
                  </View>
                  <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 11, color: Colors.textMuted, marginBottom: 14, lineHeight: 16 }}>
                    Se vazio, usa o ficheiro local <Text style={{ fontFamily: 'Inter_500Medium', color: Colors.textSecondary }}>public/downloads/superescola.apk</Text>
                  </Text>

                  <TouchableOpacity
                    style={{ backgroundColor: apkSaved ? Colors.success : '#34C759', borderRadius: 12, paddingVertical: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: apkSaving ? 0.65 : 1 }}
                    onPress={salvarApkVersion}
                    disabled={apkSaving}
                    activeOpacity={0.8}
                  >
                    {apkSaving
                      ? <ActivityIndicator size="small" color="#fff" />
                      : <Ionicons name={apkSaved ? 'checkmark-circle' : 'save-outline'} size={17} color="#fff" />
                    }
                    <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 14, color: '#fff' }}>
                      {apkSaving ? 'A guardar...' : apkSaved ? 'Guardado!' : 'Guardar Versão'}
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* ── Instrução terminal ── */}
                <View style={{ backgroundColor: Colors.card, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: Colors.border, marginTop: 20 }}>
                  <Text style={{ fontSize: 11, fontFamily: 'Inter_600SemiBold', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 }}>
                    Alternativa via Terminal
                  </Text>
                  <View style={{ backgroundColor: '#060f1e', borderRadius: 8, padding: 12 }}>
                    <Text style={{ fontSize: 12, fontFamily: 'Inter_400Regular', color: '#4ade80' }}>
                      {'# Activar\n'}
                      <Text style={{ color: '#93c5fd' }}>{'bash scripts/manutencao.sh on "mensagem"\n\n'}</Text>
                      {'# Desactivar\n'}
                      <Text style={{ color: '#93c5fd' }}>{'bash scripts/manutencao.sh off'}</Text>
                    </Text>
                  </View>
                </View>
              </>
            )}
          </View>
        )}

        {/* ── MODAL DE RESET ── */}
        <Modal visible={showResetModal} transparent animationType="fade" onRequestClose={fecharResetModal}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.82)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
            <View style={{ backgroundColor: Colors.backgroundCard, borderRadius: 24, padding: 24, width: '100%', maxWidth: 420, borderWidth: 1, borderColor: Colors.danger + '55' }}>

              {/* Passo 1 — Aviso */}
              {resetStep === 1 && (
                <>
                  <View style={{ alignItems: 'center', marginBottom: 18 }}>
                    <View style={{ width: 60, height: 60, borderRadius: 30, backgroundColor: Colors.danger + '22', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
                      <Ionicons name="warning" size={32} color={Colors.danger} />
                    </View>
                    <Text style={{ fontSize: 18, fontFamily: 'Inter_700Bold', color: Colors.danger, textAlign: 'center' }}>Operação Irreversível</Text>
                    <Text style={{ fontSize: 13, fontFamily: 'Inter_400Regular', color: Colors.textSecondary, textAlign: 'center', marginTop: 8, lineHeight: 20 }}>
                      Esta operação irá apagar PERMANENTEMENTE todos os dados operacionais da escola. Esta ação não pode ser desfeita.
                    </Text>
                  </View>
                  <View style={{ backgroundColor: Colors.warning + '18', borderRadius: 10, padding: 12, marginBottom: 20 }}>
                    <Text style={{ fontSize: 12, fontFamily: 'Inter_600SemiBold', color: Colors.warning, textAlign: 'center' }}>
                      Certifique-se de ter feito um backup antes de continuar.
                    </Text>
                  </View>
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <TouchableOpacity style={{ flex: 1, backgroundColor: Colors.surface, borderRadius: 12, paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: Colors.border }} onPress={fecharResetModal}>
                      <Text style={{ fontSize: 14, fontFamily: 'Inter_600SemiBold', color: Colors.textSecondary }}>Cancelar</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={{ flex: 1, backgroundColor: Colors.danger, borderRadius: 12, paddingVertical: 14, alignItems: 'center' }} onPress={() => setResetStep(2)}>
                      <Text style={{ fontSize: 14, fontFamily: 'Inter_700Bold', color: '#fff' }}>Continuar</Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}

              {/* Passo 2 — Confirmação por texto */}
              {resetStep === 2 && (
                <>
                  <View style={{ alignItems: 'center', marginBottom: 18 }}>
                    <View style={{ width: 60, height: 60, borderRadius: 30, backgroundColor: Colors.danger + '22', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
                      <Ionicons name="nuclear" size={32} color={Colors.danger} />
                    </View>
                    <Text style={{ fontSize: 17, fontFamily: 'Inter_700Bold', color: Colors.text, textAlign: 'center' }}>Confirmação Final</Text>
                    <Text style={{ fontSize: 13, fontFamily: 'Inter_400Regular', color: Colors.textSecondary, textAlign: 'center', marginTop: 8, lineHeight: 20 }}>
                      Para confirmar, escreva{' '}
                      <Text style={{ fontFamily: 'Inter_700Bold', color: Colors.danger }}>RESETAR</Text>
                      {' '}no campo abaixo:
                    </Text>
                  </View>
                  <TextInput
                    style={{ backgroundColor: Colors.surface, borderRadius: 12, borderWidth: 2, borderColor: resetConfirmText === 'RESETAR' ? Colors.danger : Colors.border, paddingHorizontal: 16, paddingVertical: 14, fontSize: 18, fontFamily: 'Inter_700Bold', color: Colors.danger, textAlign: 'center', marginBottom: 20 }}
                    value={resetConfirmText}
                    onChangeText={setResetConfirmText}
                    placeholder="Escreva RESETAR"
                    placeholderTextColor={Colors.textMuted}
                    autoCapitalize="characters"
                    autoCorrect={false}
                  />
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <TouchableOpacity style={{ flex: 1, backgroundColor: Colors.surface, borderRadius: 12, paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: Colors.border }} onPress={() => setResetStep(1)}>
                      <Text style={{ fontSize: 14, fontFamily: 'Inter_600SemiBold', color: Colors.textSecondary }}>Voltar</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={{ flex: 2, backgroundColor: resetConfirmText === 'RESETAR' ? Colors.danger : Colors.border, borderRadius: 12, paddingVertical: 14, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 }}
                      onPress={handleDbReset}
                      disabled={resetConfirmText !== 'RESETAR' || resetLoading}
                    >
                      {resetLoading ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="nuclear" size={16} color="#fff" />}
                      <Text style={{ fontSize: 14, fontFamily: 'Inter_700Bold', color: '#fff' }}>{resetLoading ? 'A resetar...' : 'Executar Reset'}</Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}

              {/* Passo 3 — Resultado */}
              {resetStep === 3 && (
                <>
                  <View style={{ alignItems: 'center', marginBottom: 18 }}>
                    <View style={{ width: 60, height: 60, borderRadius: 30, backgroundColor: (resetResultado?.startsWith('Erro') ? Colors.danger : Colors.success) + '22', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
                      <Ionicons name={resetResultado?.startsWith('Erro') ? 'close-circle' : 'checkmark-circle'} size={36} color={resetResultado?.startsWith('Erro') ? Colors.danger : Colors.success} />
                    </View>
                    <Text style={{ fontSize: 17, fontFamily: 'Inter_700Bold', color: Colors.text, textAlign: 'center' }}>
                      {resetResultado?.startsWith('Erro') ? 'Erro no Reset' : 'Reset Concluído'}
                    </Text>
                    <Text style={{ fontSize: 13, fontFamily: 'Inter_400Regular', color: Colors.textSecondary, textAlign: 'center', marginTop: 10, lineHeight: 20 }}>
                      {resetResultado}
                    </Text>
                  </View>
                  <TouchableOpacity style={{ backgroundColor: Colors.accent, borderRadius: 12, paddingVertical: 14, alignItems: 'center' }} onPress={fecharResetModal}>
                    <Text style={{ fontSize: 14, fontFamily: 'Inter_700Bold', color: '#fff' }}>Fechar</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          </View>
                  </KeyboardAvoidingView>
</Modal>

        {/* ── HISTÓRICO ── */}
        {section === 'historico' && (
          <View style={styles.section}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text style={styles.sectionTitle}>Escolas Activadas</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: Colors.info + '18', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7, borderWidth: 1, borderColor: Colors.info + '44' }}
                  onPress={() => fetchHistoricoDB()}
                >
                  <Ionicons name="refresh-outline" size={14} color={Colors.info} />
                </TouchableOpacity>
                {historicoDB.length > 0 && (
                  <TouchableOpacity
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: Colors.danger + '18', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7, borderWidth: 1, borderColor: Colors.danger + '44' }}
                    onPress={async () => {
                      if (Platform.OS === 'web') {
                        const tok = await import('@/context/AuthContext').then(m => m.getAuthToken()).catch(() => null);
                        window.open(`/api/ceo/historico/pdf${tok ? '?token=' + encodeURIComponent(tok) : ''}`, '_blank');
                      }
                    }}
                  >
                    <Ionicons name="document-text-outline" size={14} color={Colors.danger} />
                    <Text style={{ fontSize: 12, fontFamily: 'Inter_600SemiBold', color: Colors.danger }}>PDF</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>

            {loadingHistorico && (
              <View style={{ alignItems: 'center', paddingVertical: 32 }}>
                <ActivityIndicator color={Colors.accent} />
                <Text style={{ color: Colors.textSecondary, fontSize: 12, marginTop: 8 }}>A carregar histórico...</Text>
              </View>
            )}

            {!loadingHistorico && historicoDB.length === 0 && (
              <View style={styles.empty}>
                <Ionicons name="business-outline" size={44} color={Colors.textMuted} />
                <Text style={styles.emptyTitle}>Sem activações</Text>
                <Text style={styles.emptyMsg}>Nenhuma escola activou a licença ainda.</Text>
              </View>
            )}

            {!loadingHistorico && historicoDB.map(hist => {
              const nivelKey = (hist.nivel || 'rubi') as keyof typeof NIVEL_COLOR;
              const planoKey = (hist.plano || 'mensal') as keyof typeof PLANO_COLOR;
              const diasValidade = hist.dataAtivacao && hist.dataExpiracao
                ? Math.round((new Date(hist.dataExpiracao).getTime() - new Date(hist.dataAtivacao).getTime()) / 86400000)
                : null;
              const agora = new Date();
              const expiracao = hist.dataExpiracao ? new Date(hist.dataExpiracao) : null;
              const activo = expiracao ? expiracao >= agora : false;
              return (
                <View key={hist.id} style={styles.histCard}>
                  <View style={{ alignItems: 'center', gap: 2 }}>
                    <Text style={{ fontSize: 18 }}>{NIVEL_EMOJI[nivelKey] || '💎'}</Text>
                    <View style={[styles.histPlanoDot, { backgroundColor: PLANO_COLOR[planoKey] || Colors.info }]} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.histEscola}>{hist.ativadoPor || '—'}</Text>
                    <Text style={[styles.histMeta, { color: NIVEL_COLOR[nivelKey] || Colors.accent }]}>
                      {NIVEL_LABEL[nivelKey] || hist.nivel} · {PLANO_LABEL[planoKey] || hist.plano}
                      {diasValidade ? ` · ${diasValidade} dias` : ''}
                    </Text>
                    {Number(hist.valorPago) > 0 && (
                      <Text style={[styles.histMeta, { color: Colors.gold }]}>
                        {Number(hist.valorPago).toLocaleString('pt-AO')} KZ
                        {Number(hist.descontoAplicado) > 0 && ` (−${Number(hist.descontoAplicado).toLocaleString('pt-AO')} KZ crédito)`}
                      </Text>
                    )}
                    <Text style={styles.histData}>
                      Activado em {hist.dataAtivacao ? new Date(hist.dataAtivacao).toLocaleDateString('pt-PT') : '—'}
                      {hist.dataExpiracao ? `  ·  Expira ${new Date(hist.dataExpiracao).toLocaleDateString('pt-PT')}` : ''}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 6 }}>
                    <View style={[styles.histStatusBadge, { backgroundColor: (activo ? Colors.success : Colors.textMuted) + '22' }]}>
                      <Text style={[styles.histStatusText, { color: activo ? Colors.success : Colors.textMuted }]}>
                        {activo ? 'Activo' : 'Expirado'}
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: Colors.gold + '18', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 }}
                      onPress={async () => {
                        if (Platform.OS === 'web') {
                          const tok = await import('@/context/AuthContext').then(m => m.getAuthToken()).catch(() => null);
                          window.open(`/api/licenca/recibo/${hist.id}${tok ? '?token=' + encodeURIComponent(tok) : ''}`, '_blank');
                        }
                      }}
                    >
                      <Ionicons name="document-text-outline" size={12} color={Colors.gold} />
                      <Text style={{ fontSize: 10, fontFamily: 'Inter_600SemiBold', color: Colors.gold }}>Rel.</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* Modal Gerar Código */}
      <Modal visible={showGerar} transparent animationType="slide" onRequestClose={() => { setShowGerar(false); setCodigoGerado(null); }}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={mS.overlay}>
          <View style={[mS.sheet, { paddingBottom: (Platform.OS === 'web' ? 34 : insets.bottom) + 16 }]}>
            <View style={mS.header}>
              <Text style={mS.title}>Gerar Código de Activação</Text>
              <TouchableOpacity onPress={() => { setShowGerar(false); setCodigoGerado(null); }}>
                <Ionicons name="close" size={22} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {codigoGerado ? (
              <View style={mS.codigoResult}>
                <Ionicons name="checkmark-circle" size={48} color={Colors.success} />
                <Text style={mS.codigoResultTitle}>Código Gerado!</Text>
                <TouchableOpacity
                  style={mS.codigoCopyBox}
                  onPress={() => copiarCodigo(codigoGerado.codigo)}
                  activeOpacity={0.7}
                >
                  <Text style={mS.codigoCopyText} selectable>{codigoGerado.codigo}</Text>
                  <Ionicons name="copy-outline" size={18} color={Colors.gold} />
                </TouchableOpacity>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <Text style={{ fontSize: 16 }}>{NIVEL_EMOJI[codigoGerado.nivel || 'rubi']}</Text>
                  <Text style={[mS.codigoMeta, { color: NIVEL_COLOR[codigoGerado.nivel || 'rubi'] }]}>
                    {NIVEL_LABEL[codigoGerado.nivel || 'rubi']}
                  </Text>
                  <Text style={mS.codigoMeta}>· {PLANO_LABEL[codigoGerado.plano]} · {codigoGerado.diasValidade} dias</Text>
                </View>
                <Text style={[mS.codigoMeta, { color: Colors.gold, fontFamily: 'Inter_700Bold' }]}>
                  Valor Final: {(codigoGerado.valorFinal || 0).toLocaleString('pt-AO')} KZ
                </Text>
                {(codigoGerado.creditoAplicado || 0) > 0 && (
                  <Text style={[mS.codigoMeta, { color: Colors.success }]}>
                    Crédito aplicado: −{codigoGerado.creditoAplicado.toLocaleString('pt-AO')} KZ
                  </Text>
                )}
                <Text style={mS.codigoExp}>
                  {codigoGerado.totalAlunos} alunos × {codigoGerado.precoPorAluno} KZ · expira em {codigoGerado.dataExpiracaoCodigo}
                </Text>
                <TouchableOpacity style={mS.novoBtn} onPress={() => setCodigoGerado(null)}>
                  <Text style={mS.novoBtnText}>Gerar Outro</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <ScrollView showsVerticalScrollIndicator={false}>
                {/* ── NÍVEL ── */}
                <Text style={mS.fieldLabel}>Nível de Subscrição</Text>
                <View style={mS.planosGrid}>
                  {(['prata', 'ouro', 'rubi'] as TipoNivel[]).map(n => {
                    const active = formNivel === n;
                    const cor = NIVEL_COLOR[n];
                    return (
                      <TouchableOpacity
                        key={n}
                        style={[mS.nivelBtn, active && { borderColor: cor, backgroundColor: cor + '18' }]}
                        onPress={() => setFormNivel(n)}
                      >
                        <Text style={{ fontSize: 20 }}>{NIVEL_EMOJI[n]}</Text>
                        <Text style={[mS.planoBtnLabel, { color: active ? cor : Colors.text, marginTop: 4 }]}>
                          {NIVEL_LABEL[n]}
                        </Text>
                        <View style={[mS.precoPill, { backgroundColor: active ? cor + '22' : Colors.surface, borderColor: active ? cor + '55' : Colors.border }]}>
                          <Text style={[mS.precoKz, { color: active ? cor : Colors.textMuted }]}>
                            {PRECO_NIVEL[n]} KZ
                          </Text>
                          <Text style={[mS.precoSub, { color: active ? cor + 'aa' : Colors.textMuted }]}>/aluno</Text>
                        </View>
                        <Text style={[mS.planoBtnDias, active && { color: cor }]}>
                          {NIVEL_FEATURES[n].length} func.
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* ── DURAÇÃO ── */}
                <Text style={mS.fieldLabel}>Duração do Plano</Text>
                <View style={mS.planosGrid}>
                  {(['mensal', 'trimestral', 'semestral', 'anual'] as TipoPlano[]).map(p => {
                    const active = formPlano === p;
                    const cor = PLANO_COLOR[p];
                    const label = DESCONTO_LABEL[p];
                    return (
                      <TouchableOpacity
                        key={p}
                        style={[mS.planoBtn, active && { borderColor: cor, backgroundColor: cor + '18' }]}
                        onPress={() => setFormPlano(p)}
                      >
                        <Text style={[mS.planoBtnLabel, active && { color: cor }]}>{PLANO_LABEL[p]}</Text>
                        <Text style={[mS.planoBtnDias, active && { color: cor }]}>{PLANO_DIAS[p]}d</Text>
                        {label !== '' && (
                          <View style={[mS.descontoBadge, { backgroundColor: active ? cor + '22' : Colors.success + '14' }]}>
                            <Text style={[mS.descontoBadgeText, { color: active ? cor : Colors.success }]}>{label}</Text>
                          </View>
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* ── CONTAGEM DE ALUNOS MATRICULADOS ── */}
                <View style={mS.alunosRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={mS.alunosLabel}>Alunos matriculados na escola</Text>
                    {erroAlunos ? (
                      <Text style={[mS.alunosVal, { color: Colors.danger, fontSize: 13 }]}>
                        Erro: {erroAlunos}
                      </Text>
                    ) : alunosMatriculados === null ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <ActivityIndicator size="small" color={Colors.info} />
                        <Text style={[mS.alunosVal, { color: Colors.textMuted, fontSize: 14 }]}>
                          A carregar contagem…
                        </Text>
                      </View>
                    ) : (
                      <Text style={mS.alunosVal}>{alunosMatriculados} alunos</Text>
                    )}
                  </View>
                  <TouchableOpacity onPress={fetchAlunosMatriculados} style={mS.refreshBtn}>
                    <Ionicons name="refresh-outline" size={14} color={Colors.info} />
                    <Text style={mS.refreshText}>Actualizar</Text>
                  </TouchableOpacity>
                </View>
                {alunosMatriculados === 0 && !erroAlunos && (
                  <Text style={{ fontSize: 11, color: Colors.warning, fontFamily: 'Inter_400Regular', marginTop: 4, marginBottom: 6, paddingHorizontal: 4 }}>
                    Sem alunos matriculados activos. O total a cobrar fica em 0 KZ — registe os alunos antes de gerar o código.
                  </Text>
                )}

                {/* ── PREÇO POR ALUNO (editável) ── */}
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6, marginTop: 8 }}>
                  <Text style={[mS.fieldLabel, { marginBottom: 0, marginTop: 0 }]}>
                    Preço por aluno (KZ)
                  </Text>
                  <TouchableOpacity
                    onPress={() => setFormPrecoPorAluno(String(PRECO_NIVEL[formNivel]))}
                    style={{ backgroundColor: NIVEL_COLOR[formNivel] + '18', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}
                  >
                    <Text style={{ fontSize: 11, fontFamily: 'Inter_600SemiBold', color: NIVEL_COLOR[formNivel] }}>
                      Repor {PRECO_NIVEL[formNivel]} KZ ({NIVEL_LABEL[formNivel]})
                    </Text>
                  </TouchableOpacity>
                </View>
                <TextInput
                  style={mS.input}
                  value={formPrecoPorAluno}
                  onChangeText={setFormPrecoPorAluno}
                  keyboardType="number-pad"
                  placeholder={String(PRECO_NIVEL[formNivel])}
                  placeholderTextColor={Colors.textMuted}
                />

                {/* ── CRÉDITO ACUMULADO ── */}
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <Text style={[mS.fieldLabel, { marginBottom: 0, marginTop: 0 }]}>Crédito a descontar (KZ)</Text>
                  {(licenca?.saldoCreditoAcumulado ?? 0) > 0 && (
                    <TouchableOpacity
                      onPress={() => setFormCreditoAplicar(String(licenca?.saldoCreditoAcumulado ?? 0))}
                      style={{ backgroundColor: Colors.success + '18', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}
                    >
                      <Text style={{ fontSize: 11, fontFamily: 'Inter_600SemiBold', color: Colors.success }}>
                        Usar {(licenca?.saldoCreditoAcumulado ?? 0).toLocaleString('pt-AO')} KZ acumulado
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
                <TextInput
                  style={mS.input}
                  value={formCreditoAplicar}
                  onChangeText={setFormCreditoAplicar}
                  keyboardType="number-pad"
                  placeholder="0"
                  placeholderTextColor={Colors.textMuted}
                />

                <Text style={mS.fieldLabel}>Notas (opcional)</Text>
                <TextInput
                  style={[mS.input, { height: 72, textAlignVertical: 'top' }]}
                  value={formNotas}
                  onChangeText={setFormNotas}
                  multiline
                  placeholder="Ex: Escola Secundária de Benguela — contrato anual"
                  placeholderTextColor={Colors.textMuted}
                />

                <View style={mS.resumo}>
                  <Text style={mS.resumoTitle}>Resumo de Cobrança</Text>

                  {/* Pacote */}
                  <View style={mS.resumoRow}>
                    <Text style={mS.resumoLabel}>Pacote</Text>
                    <Text style={[mS.resumoVal, { color: NIVEL_COLOR[formNivel] }]}>
                      {NIVEL_EMOJI[formNivel]} {NIVEL_LABEL[formNivel]} — {PRECO_NIVEL[formNivel]} KZ/aluno
                    </Text>
                  </View>

                  {/* Duração */}
                  <View style={mS.resumoRow}>
                    <Text style={mS.resumoLabel}>Duração</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={[mS.resumoVal, { color: PLANO_COLOR[formPlano] }]}>
                        {PLANO_LABEL[formPlano]} ({calcPreco.meses} {calcPreco.meses === 1 ? 'mês' : 'meses'})
                      </Text>
                      {DESCONTO_LABEL[formPlano] !== '' && (
                        <View style={{ backgroundColor: Colors.success + '22', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
                          <Text style={{ fontSize: 10, fontFamily: 'Inter_700Bold', color: Colors.success }}>
                            {DESCONTO_LABEL[formPlano]}
                          </Text>
                        </View>
                      )}
                    </View>
                  </View>

                  {/* Cálculo base */}
                  <View style={mS.resumoRow}>
                    <Text style={mS.resumoLabel}>
                      {calcPreco.total} alunos × {calcPreco.precoPorAluno} KZ × {calcPreco.meses}m
                    </Text>
                    <Text style={mS.resumoVal}>{calcPreco.valorSemDesconto.toLocaleString('pt-AO')} KZ</Text>
                  </View>

                  {/* Desconto por duração */}
                  {calcPreco.descontoKz > 0 && (
                    <View style={mS.resumoRow}>
                      <Text style={[mS.resumoLabel, { color: Colors.success }]}>
                        Desconto {DESCONTO_LABEL[formPlano]}
                      </Text>
                      <Text style={[mS.resumoVal, { color: Colors.success }]}>
                        −{calcPreco.descontoKz.toLocaleString('pt-AO')} KZ
                      </Text>
                    </View>
                  )}

                  {/* Valor após desconto de duração */}
                  {calcPreco.descontoKz > 0 && (
                    <View style={mS.resumoRow}>
                      <Text style={mS.resumoLabel}>Valor com desconto</Text>
                      <Text style={[mS.resumoVal, { color: PLANO_COLOR[formPlano] }]}>
                        {calcPreco.valorComDesconto.toLocaleString('pt-AO')} KZ
                      </Text>
                    </View>
                  )}

                  {/* Crédito acumulado */}
                  {calcPreco.credito > 0 && (
                    <View style={mS.resumoRow}>
                      <Text style={[mS.resumoLabel, { color: Colors.success }]}>Crédito acumulado</Text>
                      <Text style={[mS.resumoVal, { color: Colors.success }]}>
                        −{calcPreco.credito.toLocaleString('pt-AO')} KZ
                      </Text>
                    </View>
                  )}

                  {/* Linha final */}
                  <View style={[mS.resumoRow, { borderBottomWidth: 0, paddingTop: 10, marginTop: 4, borderTopWidth: 1, borderTopColor: Colors.gold + '33' }]}>
                    <Text style={[mS.resumoLabel, { fontFamily: 'Inter_700Bold', color: Colors.text, fontSize: 14 }]}>
                      Total a Cobrar
                    </Text>
                    <Text style={[mS.resumoVal, { color: Colors.gold, fontSize: 17, fontFamily: 'Inter_700Bold' }]}>
                      {calcPreco.valorFinal.toLocaleString('pt-AO')} KZ
                    </Text>
                  </View>
                </View>

                <TouchableOpacity
                  style={[mS.gerarBtn, (alunosMatriculados === null || !!erroAlunos) && { opacity: 0.5 }]}
                  onPress={erroAlunos ? fetchAlunosMatriculados : handleGerar}
                  disabled={alunosMatriculados === null && !erroAlunos}
                >
                  {erroAlunos ? (
                    <Ionicons name="refresh" size={20} color="#fff" />
                  ) : alunosMatriculados === null ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <MaterialCommunityIcons name="key-plus" size={20} color="#fff" />
                  )}
                  <Text style={mS.gerarBtnText}>
                    {erroAlunos
                      ? 'Tentar Novamente'
                      : alunosMatriculados === null
                        ? 'A carregar contagem…'
                        : 'Gerar Código'}
                  </Text>
                </TouchableOpacity>
              </ScrollView>
            )}
          </View>
        </View>
              </KeyboardAvoidingView>
</Modal>

      {/* Modal Adicionar Crédito Acumulado */}
      <Modal visible={showSaldo} transparent animationType="slide" onRequestClose={() => { setShowSaldo(false); setFormAddSaldo(''); }}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={mS.overlay}>
          <View style={[mS.sheet, { paddingBottom: (Platform.OS === 'web' ? 34 : insets.bottom) + 16 }]}>
            <View style={mS.header}>
              <Text style={mS.title}>Crédito para Escola</Text>
              <TouchableOpacity onPress={() => { setShowSaldo(false); setFormAddSaldo(''); }}>
                <Ionicons name="close" size={22} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {/* Explicação do crédito */}
            <View style={mS.creditoInfoBox}>
              <Ionicons name="information-circle-outline" size={18} color={Colors.info} />
              <Text style={mS.creditoInfoText}>
                Use esta opção quando a escola não tem saldo para pagar a subscrição. O crédito será acumulado e descontado automaticamente na próxima geração de código de activação.
              </Text>
            </View>

            {/* Saldo atual acumulado */}
            {(licenca?.saldoCreditoAcumulado ?? 0) > 0 && (
              <View style={mS.creditoAtualBox}>
                <Text style={mS.creditoAtualLabel}>Crédito acumulado actual:</Text>
                <Text style={mS.creditoAtualVal}>{(licenca?.saldoCreditoAcumulado ?? 0).toLocaleString('pt-AO')} KZ</Text>
              </View>
            )}

            <Text style={mS.fieldLabel}>Valor a Adicionar (KZ)</Text>
            <View style={mS.saldoPresets}>
              {[1000, 2500, 5000, 10000].map(v => (
                <TouchableOpacity
                  key={v}
                  style={[mS.preset, formAddSaldo === String(v) && mS.presetActive]}
                  onPress={() => setFormAddSaldo(String(v))}
                >
                  <Text style={[mS.presetText, formAddSaldo === String(v) && mS.presetTextActive]}>
                    {v.toLocaleString('pt-AO')} KZ
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput
              style={mS.input}
              value={formAddSaldo}
              onChangeText={setFormAddSaldo}
              keyboardType="number-pad"
              placeholder="Ex: 3500"
              placeholderTextColor={Colors.textMuted}
            />
            {formAddSaldo !== '' && parseInt(formAddSaldo) > 0 && (
              <View style={mS.creditoPreviewBox}>
                <Text style={mS.creditoPreviewLabel}>Total acumulado após adição:</Text>
                <Text style={mS.creditoPreviewVal}>
                  {((licenca?.saldoCreditoAcumulado ?? 0) + (parseInt(formAddSaldo) || 0)).toLocaleString('pt-AO')} KZ
                </Text>
              </View>
            )}
            <TouchableOpacity style={mS.gerarBtn} onPress={handleAddSaldo}>
              <Ionicons name="add-circle" size={20} color="#fff" />
              <Text style={mS.gerarBtnText}>Adicionar Crédito Acumulado</Text>
            </TouchableOpacity>
          </View>
        </View>
              </KeyboardAvoidingView>
</Modal>
      </>
      )}
    </View>
  );
}

const sS = StyleSheet.create({
  statCard: {
    flex: 1, backgroundColor: Colors.backgroundCard, borderRadius: 12, padding: 14,
    alignItems: 'center', borderWidth: 1, minWidth: '45%',
  },
  statIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  statValue: { fontSize: 28, fontFamily: 'Inter_700Bold' },
  statLabel: { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: Colors.textSecondary, textAlign: 'center', marginTop: 4 },
  statSub: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted },
});

const cS = StyleSheet.create({
  card: {
    backgroundColor: Colors.backgroundCard, borderRadius: 14, padding: 14,
    marginBottom: 10, borderWidth: 1, borderColor: Colors.border,
  },
  cardUsado: { opacity: 0.7, borderColor: Colors.success + '33' },
  cardExpirado: { opacity: 0.6, borderColor: Colors.danger + '33' },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  planoPill: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10, borderWidth: 1 },
  planoText: { fontSize: 11, fontFamily: 'Inter_700Bold' },
  actions: { flexDirection: 'row', gap: 6 },
  actionBtn: { padding: 6, borderRadius: 8, backgroundColor: Colors.gold + '22' },
  codigo: { fontSize: 15, fontFamily: 'Inter_700Bold', color: Colors.text, letterSpacing: 1.5, marginBottom: 10 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 6 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted },
  notas: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textSecondary, marginBottom: 6, fontStyle: 'italic' },
  statusRow: { borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: 8, marginTop: 4 },
  statusUsado: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statusText: { fontSize: 12, fontFamily: 'Inter_500Medium' },
});

const mS = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'center', alignItems: 'center' },
  sheet: {
    backgroundColor: Colors.backgroundCard, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    borderTopWidth: 1, borderColor: Colors.border, padding: 20, maxHeight: '92%', width: '100%', maxWidth: 480,
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  title: { fontSize: 18, fontFamily: 'Inter_700Bold', color: Colors.text },
  fieldLabel: { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: Colors.textSecondary, marginBottom: 8, marginTop: 4 },
  input: {
    backgroundColor: Colors.surface, borderRadius: 12, borderWidth: 1, borderColor: Colors.border,
    padding: 14, fontSize: 15, fontFamily: 'Inter_500Medium', color: Colors.text, marginBottom: 12,
  },
  planosGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  planoBtn: {
    flex: 1, minWidth: '28%', backgroundColor: Colors.surface, borderRadius: 12,
    borderWidth: 1, borderColor: Colors.border, padding: 10, alignItems: 'center',
  },
  planoBtnLabel: { fontSize: 12, fontFamily: 'Inter_700Bold', color: Colors.text },
  planoBtnDias: { fontSize: 10, fontFamily: 'Inter_400Regular', color: Colors.textMuted },
  planoBtnPreco: { fontSize: 11, fontFamily: 'Inter_600SemiBold', marginTop: 2 },

  nivelBtn: {
    flex: 1, minWidth: '28%', backgroundColor: Colors.surface, borderRadius: 12,
    borderWidth: 1.5, borderColor: Colors.border, padding: 10, alignItems: 'center', gap: 4,
  },
  precoPill: {
    flexDirection: 'row', alignItems: 'baseline', gap: 1,
    borderRadius: 8, borderWidth: 1, paddingHorizontal: 7, paddingVertical: 3, marginTop: 2,
  },
  precoKz: { fontSize: 13, fontFamily: 'Inter_700Bold' },
  precoSub: { fontSize: 9, fontFamily: 'Inter_400Regular' },

  descontoBadge: {
    borderRadius: 6, paddingHorizontal: 5, paddingVertical: 2, marginTop: 3,
  },
  descontoBadgeText: { fontSize: 10, fontFamily: 'Inter_700Bold' },

  alunosRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: Colors.info + '12', borderRadius: 10, padding: 10, marginBottom: 10,
    borderWidth: 1, borderColor: Colors.info + '33',
  },
  alunosLabel: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted },
  alunosVal: { fontSize: 15, fontFamily: 'Inter_700Bold', color: Colors.info, marginTop: 2 },
  refreshBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: Colors.info + '22', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6,
  },
  refreshText: { fontSize: 11, fontFamily: 'Inter_600SemiBold', color: Colors.info },

  resumo: {
    backgroundColor: Colors.surface, borderRadius: 12, padding: 12, marginBottom: 12,
    borderWidth: 1, borderColor: Colors.border,
  },
  resumoTitle: { fontSize: 12, fontFamily: 'Inter_700Bold', color: Colors.textMuted, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.8 },
  resumoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: Colors.border },
  resumoLabel: { fontSize: 13, fontFamily: 'Inter_400Regular', color: Colors.textSecondary },
  resumoVal: { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: Colors.text },
  gerarBtn: {
    backgroundColor: Colors.gold, borderRadius: 14, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 8, paddingVertical: 16, marginBottom: 4,
  },
  gerarBtnText: { fontSize: 16, fontFamily: 'Inter_700Bold', color: '#fff' },
  codigoResult: { alignItems: 'center', paddingVertical: 20 },
  codigoResultTitle: { fontSize: 20, fontFamily: 'Inter_700Bold', color: Colors.text, marginTop: 12, marginBottom: 16 },
  codigoCopyBox: {
    flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: Colors.surface,
    borderRadius: 14, padding: 16, borderWidth: 1, borderColor: Colors.gold + '55', marginBottom: 10,
  },
  codigoCopyText: { fontSize: 16, fontFamily: 'Inter_700Bold', color: Colors.gold, letterSpacing: 2, flex: 1, textAlign: 'center' },
  codigoMeta: { fontSize: 13, fontFamily: 'Inter_500Medium', color: Colors.textSecondary, marginBottom: 4 },
  codigoExp: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginBottom: 20 },
  novoBtn: { borderWidth: 1, borderColor: Colors.gold, borderRadius: 12, paddingHorizontal: 24, paddingVertical: 10 },
  novoBtnText: { fontSize: 14, fontFamily: 'Inter_600SemiBold', color: Colors.gold },
  saldoPresets: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  preset: { flex: 1, minWidth: '44%', borderRadius: 10, borderWidth: 1, borderColor: Colors.border, padding: 10, alignItems: 'center', backgroundColor: Colors.surface },
  presetActive: { backgroundColor: Colors.gold + '22', borderColor: Colors.gold },
  presetText: { fontSize: 13, fontFamily: 'Inter_700Bold', color: Colors.textSecondary },
  presetTextActive: { color: Colors.gold },
  creditoInfoBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: Colors.info + '14', borderRadius: 10, padding: 12, marginBottom: 14,
    borderWidth: 1, borderColor: Colors.info + '33',
  },
  creditoInfoText: { fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textSecondary, flex: 1, lineHeight: 18 },
  creditoAtualBox: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: Colors.success + '14', borderRadius: 10, padding: 12, marginBottom: 12,
    borderWidth: 1, borderColor: Colors.success + '33',
  },
  creditoAtualLabel: { fontSize: 12, fontFamily: 'Inter_500Medium', color: Colors.textSecondary },
  creditoAtualVal: { fontSize: 15, fontFamily: 'Inter_700Bold', color: Colors.success },
  creditoPreviewBox: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: Colors.warning + '14', borderRadius: 10, padding: 12, marginBottom: 12,
    borderWidth: 1, borderColor: Colors.warning + '33',
  },
  creditoPreviewLabel: { fontSize: 12, fontFamily: 'Inter_500Medium', color: Colors.textSecondary },
  creditoPreviewVal: { fontSize: 15, fontFamily: 'Inter_700Bold', color: Colors.warning },
});

const convStyles = StyleSheet.create({
  card: {
    marginTop: 12, padding: 14, borderRadius: 14,
    backgroundColor: Colors.surface,
    borderWidth: 1, borderColor: Colors.gold + '33',
    gap: 10,
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 14, fontFamily: 'Inter_700Bold', color: Colors.text },
  refreshBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: Colors.gold + '14', alignItems: 'center', justifyContent: 'center',
  },
  empty: { fontSize: 12, color: Colors.textMuted, textAlign: 'center', paddingVertical: 12 },
  taxaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  taxaLabel: { fontSize: 12, fontFamily: 'Inter_500Medium', color: Colors.textSecondary },
  taxaValor: { fontSize: 22, fontFamily: 'Inter_700Bold' },
  barTrack: {
    height: 8, borderRadius: 4, backgroundColor: Colors.background, overflow: 'hidden',
  },
  barFill: { height: '100%', borderRadius: 4 },
  taxaSub: { fontSize: 11, color: Colors.textMuted },
  kpiRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  kpiBox: {
    flex: 1, padding: 10, borderRadius: 10,
    backgroundColor: Colors.background,
    borderWidth: 1, borderColor: Colors.border + '55',
    minWidth: 0,
  },
  kpiLabel: { fontSize: 10, fontFamily: 'Inter_500Medium', color: Colors.textMuted, marginBottom: 4 },
  kpiValue: { fontSize: 16, fontFamily: 'Inter_700Bold', color: Colors.text },
  kpiHint: { fontSize: 9, color: Colors.textMuted, marginTop: 2 },
  subtitle: {
    fontSize: 12, fontFamily: 'Inter_700Bold', color: Colors.textSecondary,
    marginTop: 6, textTransform: 'uppercase', letterSpacing: 0.6,
  },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 8, borderTopWidth: 1, borderTopColor: Colors.border + '33',
  },
  rowCodigo: { fontSize: 12, fontFamily: 'Inter_700Bold', color: Colors.text },
  rowMeta: { fontSize: 10, color: Colors.textMuted, marginTop: 2 },
  rowRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  nivelTag: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, borderWidth: 1 },
  nivelTagText: { fontSize: 9, fontFamily: 'Inter_700Bold', textTransform: 'uppercase', letterSpacing: 0.4 },
  rowDias: { fontSize: 11, fontFamily: 'Inter_700Bold', color: Colors.gold, minWidth: 38, textAlign: 'right' },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  ceoBadgeBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 16, paddingVertical: 8,
    backgroundColor: 'rgba(255,215,0,0.08)',
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,215,0,0.2)',
  },
  ceoBadgeText: { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: '#FFD700' },

  tabBar: { flexGrow: 0, backgroundColor: Colors.primaryDark, borderBottomWidth: 1, borderBottomColor: Colors.border },
  tabBarContent: { flexDirection: 'row', paddingHorizontal: 4 },
  tab: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 11, paddingHorizontal: 14, borderBottomWidth: 3, borderBottomColor: 'transparent' },
  tabActive: { borderBottomColor: Colors.gold },
  tabText: { fontSize: 12, fontFamily: 'Inter_500Medium', color: Colors.textSecondary },
  tabTextActive: { color: Colors.gold, fontFamily: 'Inter_600SemiBold' },

  collapsedBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 10, backgroundColor: Colors.primaryDark,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  collapsedBarText: { fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textMuted },

  section: { padding: 16, gap: 12 },

  licencaCard: {
    backgroundColor: Colors.backgroundCard, borderRadius: 16, padding: 16, borderWidth: 1,
  },
  licencaCardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  licencaCardHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  licencaCardTitle: { fontSize: 14, fontFamily: 'Inter_700Bold', color: Colors.text },
  licencaCardPlano: { fontSize: 12, fontFamily: 'Inter_600SemiBold', marginTop: 1 },
  licencaStatusBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  licencaStatusText: { fontSize: 12, fontFamily: 'Inter_700Bold' },
  licencaInfoRow: { flexDirection: 'row', gap: 8 },
  licencaInfoItem: { flex: 1, backgroundColor: Colors.surface, borderRadius: 10, padding: 10, alignItems: 'center' },
  licencaInfoLabel: { fontSize: 10, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginBottom: 3 },
  licencaInfoValue: { fontSize: 13, fontFamily: 'Inter_700Bold', color: Colors.text, textAlign: 'center' },

  saldoCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: Colors.backgroundCard, borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: Colors.gold + '33',
  },
  saldoLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  saldoLabel: { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: Colors.text },
  saldoEscola: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 1 },
  saldoRight: { alignItems: 'flex-end' },
  saldoValor: { fontSize: 24, fontFamily: 'Inter_700Bold', color: Colors.gold },
  saldoUnidade: { fontSize: 10, fontFamily: 'Inter_400Regular', color: Colors.textMuted },
  addSaldoBtn: {
    backgroundColor: Colors.success, borderRadius: 12,
    padding: 10, minWidth: 44, minHeight: 44,
    justifyContent: 'center', alignItems: 'center',
  },

  licencaAvisoCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderRadius: 14, padding: 14, borderWidth: 1,
  },
  licencaAvisoTitulo: { fontSize: 13, fontFamily: 'Inter_600SemiBold', marginBottom: 2 },
  licencaAvisoDesc: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted, lineHeight: 16 },
  licencaAvisoBtn: {
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8,
    justifyContent: 'center', alignItems: 'center',
  },
  licencaAvisoBtnText: { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: '#fff' },

  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },

  sectionTitle: { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 1, marginTop: 4 },

  planoRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: Colors.backgroundCard, borderRadius: 12, padding: 12,
    borderWidth: 1, borderColor: Colors.border,
  },
  planoDot: { width: 10, height: 10, borderRadius: 5 },
  planoNome: { fontSize: 14, fontFamily: 'Inter_600SemiBold', color: Colors.text },
  planoDias: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 1 },
  planoPreco: { fontSize: 13, fontFamily: 'Inter_700Bold' },
  planoGerarBtn: { backgroundColor: Colors.accent, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  planoGerarText: { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: '#fff' },

  filterRow: { flexDirection: 'row', gap: 8, alignItems: 'center', flexWrap: 'wrap' },
  filterBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
  filterBtnActive: { backgroundColor: Colors.gold + '20', borderColor: Colors.gold },
  filterBtnText: { fontSize: 12, fontFamily: 'Inter_500Medium', color: Colors.textSecondary },
  filterBtnTextActive: { color: Colors.gold, fontFamily: 'Inter_600SemiBold' },
  novoCodeBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: Colors.accent, marginLeft: 'auto' },
  novoCodeText: { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: '#fff' },

  histCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    backgroundColor: Colors.backgroundCard, borderRadius: 12, padding: 12,
    borderWidth: 1, borderColor: Colors.border,
  },
  nivelPill: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, borderWidth: 1 },
  nivelPillText: { fontSize: 11, fontFamily: 'Inter_700Bold' },
  histPlanoDot: { width: 10, height: 10, borderRadius: 5, marginTop: 4 },
  histEscola: { fontSize: 14, fontFamily: 'Inter_600SemiBold', color: Colors.text },
  histMeta: { fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textSecondary, marginTop: 2 },
  histData: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 2 },
  histStatusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  histStatusText: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },

  empty: { alignItems: 'center', paddingVertical: 48 },
  emptyTitle: { fontSize: 16, fontFamily: 'Inter_700Bold', color: Colors.text, marginTop: 12 },
  emptyMsg: { fontSize: 13, fontFamily: 'Inter_400Regular', color: Colors.textMuted, textAlign: 'center', marginTop: 6 },

  mainTabBar: {
    flexDirection: 'row', backgroundColor: Colors.primaryDark,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  mainTab: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 11, borderBottomWidth: 3, borderBottomColor: 'transparent',
  },
  mainTabActive: { borderBottomColor: Colors.gold },
  mainTabText: { fontSize: 13, fontFamily: 'Inter_500Medium', color: Colors.textSecondary },
  mainTabTextActive: { color: Colors.gold, fontFamily: 'Inter_600SemiBold' },

  escolaHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: Colors.backgroundCard, borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: Colors.border, marginBottom: 14,
  },
  escolaHeaderTitle: { fontSize: 15, fontFamily: 'Inter_700Bold', color: Colors.text },
  escolaHeaderSub: { fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 2 },
  escolaDashBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 10, paddingVertical: 6,
    backgroundColor: Colors.gold + '18', borderRadius: 10,
  },
  escolaDashBtnText: { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: Colors.gold },

  escolaStatsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 20 },
  escolaStatCard: {
    width: '47%', flexGrow: 1,
    backgroundColor: Colors.backgroundCard, borderRadius: 14,
    padding: 16, alignItems: 'center', borderWidth: 1,
  },
  escolaStatIcon: {
    width: 44, height: 44, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center', marginBottom: 10,
  },
  escolaStatValue: { fontSize: 28, fontFamily: 'Inter_700Bold', marginBottom: 4 },
  escolaStatLabel: { fontSize: 12, fontFamily: 'Inter_500Medium', color: Colors.textMuted, textAlign: 'center' },

  escolaSectionTitle: {
    fontSize: 12, fontFamily: 'Inter_700Bold', color: Colors.textMuted,
    textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10,
  },
  escolaShortcut: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: Colors.backgroundCard, borderRadius: 14,
    padding: 14, marginBottom: 10,
    borderWidth: 1, borderColor: Colors.border,
  },
  escolaShortcutIcon: {
    width: 44, height: 44, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  escolaShortcutLabel: { fontSize: 14, fontFamily: 'Inter_600SemiBold', color: Colors.text },
  escolaShortcutSub: { fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 2 },

  liveHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12,
  },
  liveBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: '#dc2626' + '20', borderRadius: 20,
    paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: '#dc2626' + '40',
  },
  liveDot: {
    width: 7, height: 7, borderRadius: 4, backgroundColor: '#dc2626',
  },
  liveText: { fontSize: 10, fontFamily: 'Inter_700Bold', color: '#dc2626', letterSpacing: 1 },
  liveTitleText: { flex: 1, fontSize: 14, fontFamily: 'Inter_700Bold', color: Colors.text },
  liveRefreshBtn: {
    padding: 6, borderRadius: 8, backgroundColor: Colors.surface,
    borderWidth: 1, borderColor: Colors.border,
  },

  liveSummaryRow: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  liveSummaryCard: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: Colors.backgroundCard, borderRadius: 12,
    padding: 12, borderWidth: 1, borderColor: Colors.border,
  },
  liveSummaryLabel: { fontSize: 10, fontFamily: 'Inter_400Regular', color: Colors.textMuted },
  liveSummaryValue: { fontSize: 13, fontFamily: 'Inter_700Bold' },

  liveLastUpdate: {
    fontSize: 10, fontFamily: 'Inter_400Regular', color: Colors.textMuted,
    textAlign: 'right', marginBottom: 10,
  },

  liveEmpty: {
    alignItems: 'center', paddingVertical: 32,
    backgroundColor: Colors.backgroundCard, borderRadius: 14,
    marginBottom: 14, borderWidth: 1, borderColor: Colors.border,
  },
  liveEmptyText: { fontSize: 13, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 10 },

  liveItem: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: Colors.backgroundCard, borderRadius: 12,
    padding: 12, marginBottom: 8,
    borderWidth: 1, borderColor: Colors.border,
  },
  liveItemIcon: {
    width: 40, height: 40, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  liveItemName: { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: Colors.text },
  liveItemTaxa: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 1 },
  liveItemRight: { alignItems: 'flex-end' },
  liveItemValor: { fontSize: 13, fontFamily: 'Inter_700Bold' },
  liveItemTime: { fontSize: 10, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 2 },

  liveVerTudoBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 12, marginBottom: 20,
    backgroundColor: Colors.gold + '12', borderRadius: 12,
    borderWidth: 1, borderColor: Colors.gold + '30',
  },
  liveVerTudoText: { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: Colors.gold },

  escaloesCard: {
    backgroundColor: Colors.backgroundCard, borderRadius: 14,
    borderWidth: 1, borderColor: Colors.gold + '33', overflow: 'hidden',
  },
  escaloesCardHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 14,
  },
  escaloesHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  escaloesHeaderTitle: { fontSize: 14, fontFamily: 'Inter_600SemiBold', color: Colors.text },
  escaloesHeaderSub: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 1 },
  escaloesBody: { borderTopWidth: 1, borderTopColor: Colors.border, paddingBottom: 12 },
  escaloesTableHead: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 8,
    backgroundColor: Colors.surface,
  },
  escaloesThText: { fontSize: 10, fontFamily: 'Inter_700Bold', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.6 },
  escaloesTableRow: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 6,
  },
  escaloesRowEven: { backgroundColor: Colors.background + 'aa' },
  escaloesRowOdd: { backgroundColor: 'transparent' },
  escaloesLabel: { fontSize: 12, fontFamily: 'Inter_500Medium', color: Colors.textSecondary },
  escaloesInput: {
    backgroundColor: Colors.surface, borderRadius: 8, borderWidth: 1, borderColor: Colors.gold + '55',
    paddingHorizontal: 8, paddingVertical: 4, fontSize: 13, fontFamily: 'Inter_700Bold',
    color: Colors.gold, textAlign: 'center', width: 54,
  },
  escaloesPreco: { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: Colors.text },
  escaloesCap: {
    fontSize: 10, fontFamily: 'Inter_400Regular', color: Colors.textMuted,
    marginHorizontal: 14, marginTop: 8, fontStyle: 'italic',
  },
  escaloesActions: {
    flexDirection: 'row', gap: 8, marginHorizontal: 14, marginTop: 12,
  },
  escaloesReporBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10,
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border,
  },
  escaloesReporText: { fontSize: 13, fontFamily: 'Inter_500Medium', color: Colors.textSecondary },
  escaloesGuardarBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 10, borderRadius: 10, backgroundColor: Colors.gold,
  },
  escaloesGuardarText: { fontSize: 13, fontFamily: 'Inter_700Bold', color: '#fff' },
});

// ─────────────────────────────────────────────────────────────────────────────
// SECÇÃO: IDENTIDADE DA EMPRESA (Super Escola) — apenas o CEO pode editar
// ─────────────────────────────────────────────────────────────────────────────

interface EmpresaForm {
  empresaNome: string;
  empresaTelefone: string;
  empresaEmail: string;
  empresaLogo: string;
  empresaWebsite: string;
}

function EmpresaIdentidadeSection() {
  const [form, setForm] = useState<EmpresaForm>({
    empresaNome: 'Super Escola',
    empresaTelefone: '',
    empresaEmail: '',
    empresaLogo: '',
    empresaWebsite: '',
  });
  const [carregando, setCarregando] = useState(true);
  const [a_gravar, setAGravar] = useState(false);
  const [a_carregarLogo, setACarregarLogo] = useState(false);
  const [a_carregarFavicon, setACarregarFavicon] = useState(false);
  const [faviconActivo, setFaviconActivo] = useState(false);

  useEffect(() => {
    let cancel = false;
    api.get<any>('/api/config').then(d => {
      if (cancel) return;
      setForm({
        empresaNome: d?.empresaNome || 'Super Escola',
        empresaTelefone: d?.empresaTelefone || '',
        empresaEmail: d?.empresaEmail || '',
        empresaLogo: d?.empresaLogo || '',
        empresaWebsite: d?.empresaWebsite || '',
      });
      setFaviconActivo(!!d?.faviconUrl);
    }).catch(() => {}).finally(() => { if (!cancel) setCarregando(false); });
    return () => { cancel = true; };
  }, []);

  const set = (k: keyof EmpresaForm, v: string) => setForm(f => ({ ...f, [k]: v }));

  async function escolherLogo() {
    setACarregarLogo(true);
    try {
      const url = await pickAndUploadPhoto();
      if (url) set('empresaLogo', url);
    } finally {
      setACarregarLogo(false);
    }
  }

  async function escolherFavicon() {
    if (Platform.OS !== 'web') {
      webAlert('Não suportado', 'O upload de favicon só está disponível na versão web.');
      return;
    }
    setACarregarFavicon(true);
    try {
      const token = await import('@/context/AuthContext').then(m => m.getAuthToken()).catch(() => null);
      await new Promise<void>((resolve) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/png,image/jpeg,image/webp,image/x-icon';
        input.onchange = async (e: Event) => {
          const file = (e.target as HTMLInputElement).files?.[0];
          if (!file) { resolve(); return; }
          try {
            const fd = new FormData();
            fd.append('file', file);
            const hdrs: Record<string, string> = {};
            if (token) hdrs['Authorization'] = `Bearer ${token}`;
            const res = await fetch('/api/upload-favicon', { method: 'POST', body: fd, headers: hdrs });
            if (res.ok) {
              setFaviconActivo(true);
              webAlert('Favicon actualizado', 'O ícone do separador do browser foi actualizado. Recarregue a página para ver a mudança.');
            } else {
              const d = await res.json().catch(() => ({}));
              webAlert('Erro', (d as any)?.error || 'Não foi possível enviar o favicon.');
            }
          } catch { webAlert('Erro', 'Não foi possível enviar o favicon.'); }
          resolve();
        };
        input.click();
      });
    } finally {
      setACarregarFavicon(false);
    }
  }

  async function gravar() {
    if (!form.empresaNome.trim()) {
      webAlert('Campo obrigatório', 'O nome da empresa não pode ficar vazio.');
      return;
    }
    if (form.empresaEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.empresaEmail)) {
      webAlert('Email inválido', 'Introduza um email de suporte válido.');
      return;
    }
    setAGravar(true);
    try {
      await api.put('/api/config', {
        empresaNome: form.empresaNome.trim(),
        empresaTelefone: form.empresaTelefone.trim(),
        empresaEmail: form.empresaEmail.trim(),
        empresaLogo: form.empresaLogo.trim(),
        empresaWebsite: form.empresaWebsite.trim(),
      });
      await refreshEmpresaCache();
      webAlert('Identidade gravada', 'A identidade da empresa foi actualizada e já aparece em toda a aplicação.');
    } catch (e: any) {
      webAlert('Erro', e?.message || 'Não foi possível gravar a identidade da empresa.');
    } finally {
      setAGravar(false);
    }
  }

  if (carregando) {
    return (
      <View style={empS.section}>
        <Text style={empS.muted}>A carregar identidade da empresa...</Text>
      </View>
    );
  }

  return (
    <View style={empS.section}>
      <View style={empS.header}>
        <Ionicons name="business" size={20} color={Colors.gold} />
        <Text style={empS.title}>Identidade da Empresa</Text>
      </View>
      <Text style={empS.subtitle}>
        Estes dados aparecem no rodapé da aplicação e na marca do topo. Apenas o CEO pode alterá-los.
      </Text>

      {/* Pré-visualização do logotipo */}
      <View style={empS.previewBox}>
        <View style={empS.previewLeft}>
          {form.empresaLogo ? (
            <RNImage source={{ uri: form.empresaLogo }} style={empS.logoPreview} resizeMode="cover" />
          ) : (
            <View style={empS.iniciaisBadge}>
              <Text style={empS.iniciaisText}>SE</Text>
            </View>
          )}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={empS.previewNome}>{form.empresaNome || 'Super Escola'}</Text>
          <Text style={empS.previewMeta}>
            {form.empresaLogo ? 'Logotipo personalizado activo' : 'Sem logotipo — mostra iniciais "SE"'}
          </Text>
          <View style={empS.logoBtnRow}>
            <TouchableOpacity style={empS.logoBtn} onPress={escolherLogo} disabled={a_carregarLogo} activeOpacity={0.7}>
              <Ionicons name="cloud-upload-outline" size={14} color={Colors.gold} />
              <Text style={empS.logoBtnText}>{a_carregarLogo ? 'A enviar...' : (form.empresaLogo ? 'Trocar logotipo' : 'Carregar logotipo')}</Text>
            </TouchableOpacity>
            {form.empresaLogo ? (
              <TouchableOpacity style={[empS.logoBtn, { borderColor: Colors.danger + '60' }]} onPress={() => set('empresaLogo', '')} activeOpacity={0.7}>
                <Ionicons name="trash-outline" size={14} color={Colors.danger} />
                <Text style={[empS.logoBtnText, { color: Colors.danger }]}>Remover</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      </View>

      {/* Favicon */}
      <View style={empS.faviconBox}>
        <View style={empS.faviconLeft}>
          <Ionicons name="globe-outline" size={28} color={faviconActivo ? Colors.gold : Colors.textMuted} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={empS.previewNome}>Favicon (ícone do browser)</Text>
          <Text style={empS.previewMeta}>
            {faviconActivo ? 'Favicon personalizado activo' : 'A usar o ícone predefinido da aplicação'}
          </Text>
          <View style={empS.logoBtnRow}>
            <TouchableOpacity style={empS.logoBtn} onPress={escolherFavicon} disabled={a_carregarFavicon} activeOpacity={0.7}>
              <Ionicons name="cloud-upload-outline" size={14} color={Colors.gold} />
              <Text style={empS.logoBtnText}>{a_carregarFavicon ? 'A enviar...' : (faviconActivo ? 'Trocar favicon' : 'Carregar favicon')}</Text>
            </TouchableOpacity>
          </View>
          <Text style={[empS.previewMeta, { marginTop: 4 }]}>Formatos: PNG, JPG, WEBP ou ICO · Recomendado: 32×32 px</Text>
        </View>
      </View>

      {/* Campos */}
      <View style={empS.field}>
        <Text style={empS.label}>Nome da Empresa *</Text>
        <TextInput
          style={empS.input}
          value={form.empresaNome}
          onChangeText={v => set('empresaNome', v)}
          placeholder="Ex: Super Escola"
          placeholderTextColor={Colors.textMuted}
        />
      </View>

      <View style={empS.field}>
        <Text style={empS.label}>Número de Suporte</Text>
        <TextInput
          style={empS.input}
          value={form.empresaTelefone}
          onChangeText={v => set('empresaTelefone', v)}
          placeholder="+244 9XX XXX XXX"
          placeholderTextColor={Colors.textMuted}
          keyboardType="phone-pad"
        />
      </View>

      <View style={empS.field}>
        <Text style={empS.label}>Email de Suporte</Text>
        <TextInput
          style={empS.input}
          value={form.empresaEmail}
          onChangeText={v => set('empresaEmail', v)}
          placeholder="suporte@superescola.ao"
          placeholderTextColor={Colors.textMuted}
          keyboardType="email-address"
          autoCapitalize="none"
        />
      </View>

      <View style={empS.field}>
        <Text style={empS.label}>Website (opcional)</Text>
        <TextInput
          style={empS.input}
          value={form.empresaWebsite}
          onChangeText={v => set('empresaWebsite', v)}
          placeholder="www.superescola.ao"
          placeholderTextColor={Colors.textMuted}
          autoCapitalize="none"
        />
      </View>

      <TouchableOpacity style={[empS.saveBtn, a_gravar && { opacity: 0.6 }]} onPress={gravar} disabled={a_gravar} activeOpacity={0.8}>
        <Ionicons name="checkmark-circle" size={18} color={Colors.primaryDark} />
        <Text style={empS.saveBtnText}>{a_gravar ? 'A gravar...' : 'Gravar identidade'}</Text>
      </TouchableOpacity>
    </View>
  );
}

const empS = StyleSheet.create({
  section: { paddingHorizontal: 16, paddingVertical: 18 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  title: { fontSize: 16, fontFamily: 'Inter_700Bold', color: Colors.text },
  subtitle: { fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginBottom: 16 },
  muted: { fontSize: 13, color: Colors.textMuted, fontFamily: 'Inter_400Regular' },

  previewBox: {
    flexDirection: 'row', gap: 14, padding: 14, borderRadius: 12,
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, marginBottom: 18,
  },
  previewLeft: { width: 72, height: 72, alignItems: 'center', justifyContent: 'center' },
  logoPreview: { width: 72, height: 72, borderRadius: 36, backgroundColor: Colors.card },
  iniciaisBadge: {
    width: 72, height: 72, borderRadius: 36, backgroundColor: Colors.gold,
    alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: Colors.gold,
  },
  iniciaisText: { fontSize: 26, fontFamily: 'Inter_700Bold', color: Colors.primaryDark, letterSpacing: 1 },
  previewNome: { fontSize: 15, fontFamily: 'Inter_700Bold', color: Colors.text },
  previewMeta: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 2, marginBottom: 8 },
  faviconBox: {
    flexDirection: 'row', gap: 14, padding: 14, borderRadius: 12,
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, marginBottom: 18,
  },
  faviconLeft: { width: 52, height: 52, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.border },
  logoBtnRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  logoBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8,
    backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.gold + '60',
  },
  logoBtnText: { fontSize: 11, fontFamily: 'Inter_600SemiBold', color: Colors.gold },

  field: { marginBottom: 14 },
  label: { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: Colors.textSecondary, marginBottom: 6 },
  input: {
    backgroundColor: Colors.surface, borderRadius: 10, borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 14,
    fontFamily: 'Inter_400Regular', color: Colors.text,
  },
  saveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: Colors.gold, borderRadius: 12, paddingVertical: 14, marginTop: 8,
  },
  saveBtnText: { fontSize: 14, fontFamily: 'Inter_700Bold', color: Colors.primaryDark },
});

const ceoLicStyles = StyleSheet.create({
  alertBox: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderWidth: 1, borderRadius: 12,
    padding: 12, marginBottom: 14,
  },
  alertTitle: { fontSize: 13, fontFamily: 'Inter_700Bold', marginBottom: 2 },
  alertSub: { fontSize: 11, fontFamily: 'Inter_400Regular', color: 'rgba(255,255,255,0.6)', lineHeight: 15 },
  alertBtn: {
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center',
  },
  alertBtnText: { fontSize: 11, fontFamily: 'Inter_700Bold', color: '#fff' },
});
