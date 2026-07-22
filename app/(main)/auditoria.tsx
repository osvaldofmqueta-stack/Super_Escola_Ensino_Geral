import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Platform, RefreshControl, ActivityIndicator,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '@/constants/colors';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';
import TopBar from '@/components/TopBar';
import { StableSearchInput } from '@/components/StableSearchInput';

// ─── TIPOS ────────────────────────────────────────────────────────────────────

interface AuditLog {
  id: string; userId: string; userEmail: string; userRole: string;
  userName?: string; acao: string; modulo: string; descricao: string;
  recursoId?: string; ipAddress?: string; userAgent?: string;
  dados?: unknown; criadoEm: string;
}

interface Stats {
  byAcao: { acao: string; total: string }[];
  byModulo: { modulo: string; total: string }[];
}

interface PainelControlo {
  geradoEm: string; anoLetivo: string; mesAtual: number; anoAtual: number;
  financeiro: {
    pagamentosPagosMes: { total: number; valor: number };
    pagamentosPendentes: { total: number; valor: number };
    rupesAtivos: number; bolsasAtivas: number;
  };
  pedagogico: {
    alunosActivos: number; alunosDesistentes: number;
    alunosTransferidos: number; alunosConcluidos: number; alunosBloqueados: number;
    pautas: Record<string, number>; planos: Record<string, number>;
    transferenciasPendentes: number; ocorrenciasAbertas: number;
    ocorrenciasGraves: number; taxaPresenca: number | null;
  };
  rh: {
    funcionariosAtivos: number;
    folhasMes: Record<string, { total: number; liquido: number }>;
    faltasInjustificadas: number; faltasJustificadas: number; meioDia: number;
  };
  actividade: {
    loginsUlt30: number; eventosUlt30: number; loginsFalhadosUlt30: number;
    eliminacoesUlt7: number; alunosNovosUlt30: number; docEmitidosUlt30: number;
  };
}

// ─── CONSTANTES ───────────────────────────────────────────────────────────────

const ACAO_LABELS: Record<string, { label: string; color: string; icon: string }> = {
  login:                        { label: 'Login',                color: '#3498DB', icon: 'log-in-outline' },
  login_falhado:                { label: 'Login Falhado',        color: '#E74C3C', icon: 'alert-circle-outline' },
  login_bloqueado:              { label: 'Login Bloqueado',      color: '#C0392B', icon: 'ban-outline' },
  alterar_senha_primeiro_acesso:{ label: 'Senha 1.º Acesso',    color: '#8E44AD', icon: 'key-outline' },
  reset_senha_admin:            { label: 'Reset Senha',          color: '#D35400', icon: 'refresh-circle-outline' },
  criar:                        { label: 'Criação',              color: '#2ECC71', icon: 'add-circle-outline' },
  atualizar:                    { label: 'Actualização',         color: '#F39C12', icon: 'create-outline' },
  eliminar:                     { label: 'Eliminação',           color: '#E74C3C', icon: 'trash-outline' },
  importar:                     { label: 'Importação',           color: '#1ABC9C', icon: 'cloud-upload-outline' },
  exportar:                     { label: 'Exportação',           color: '#9B59B6', icon: 'download-outline' },
  gerar_pdf:                    { label: 'PDF Gerado',           color: '#7F8C8D', icon: 'document-text-outline' },
  aprovar:                      { label: 'Aprovação',            color: '#27AE60', icon: 'checkmark-circle-outline' },
  rejeitar:                     { label: 'Rejeição',             color: '#C0392B', icon: 'close-circle-outline' },
  prorrogado:                   { label: 'Prorrogação',          color: '#E67E22', icon: 'time-outline' },
  banir_utilizador:             { label: 'Utilizador Suspenso',  color: '#E74C3C', icon: 'lock-closed-outline' },
  desbanir_utilizador:          { label: 'Suspensão Levantada',  color: '#2ECC71', icon: 'lock-open-outline' },
  sessao_encerrada:             { label: 'Sessão Encerrada',     color: '#95A5A6', icon: 'power-outline' },
};

const ACOES = [
  '', 'login', 'login_falhado', 'login_bloqueado',
  'criar', 'atualizar', 'eliminar', 'importar', 'exportar', 'gerar_pdf',
  'aprovar', 'rejeitar', 'prorrogado',
  'banir_utilizador', 'desbanir_utilizador', 'sessao_encerrada',
  'alterar_senha_primeiro_acesso', 'reset_senha_admin',
];

const MODULOS = [
  '', 'Autenticação', 'Controlo Online', 'Gestão de Acessos',
  'Alunos', 'Professores', 'Turmas', 'Notas', 'Presenças',
  'Horários', 'Eventos', 'Sumários', 'Pautas',
  'Taxas', 'Pagamentos', 'RUPEs', 'Tesouraria',
  'Utilizadores', 'Admissão', 'Folhas de Salários', 'RH',
  'Biblioteca', 'Documentos', 'Relatórios', 'Comunicados', 'Configurações',
];

const ROLE_LABELS: Record<string, string> = {
  ceo: 'CEO', pca: 'PCA', admin: 'Administrador', director: 'Director',
  chefe_secretaria: 'Chefe de Secretaria', professor: 'Professor',
  aluno: 'Aluno', encarregado: 'Encarregado',
};

const MESES_PT = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function formatDateShort(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fmtMoney(val: number): string {
  if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(1)}M Kz`;
  if (val >= 1_000)     return `${(val / 1_000).toFixed(0)}k Kz`;
  return `${Math.round(val)} Kz`;
}

// ─── COMPONENTES DE LOG (existentes) ─────────────────────────────────────────

function AcaoBadge({ acao }: { acao: string }) {
  const info = ACAO_LABELS[acao] ?? { label: acao, color: '#7F8C8D', icon: 'ellipse-outline' };
  return (
    <View style={[s.badge, { backgroundColor: `${info.color}22`, borderColor: `${info.color}55` }]}>
      <Ionicons name={info.icon as any} size={11} color={info.color} />
      <Text style={[s.badgeText, { color: info.color }]}>{info.label}</Text>
    </View>
  );
}

function UserAvatar({ name, email, role }: { name?: string; email: string; role: string }) {
  const initial = (name ?? email).charAt(0).toUpperCase();
  const roleColors: Record<string, string> = {
    ceo: '#F39C12', pca: '#E67E22', admin: '#3498DB', director: '#9B59B6',
    chefe_secretaria: '#1ABC9C', professor: '#2ECC71',
  };
  const bg = roleColors[role] ?? '#7F8C8D';
  return (
    <View style={[s.avatar, { backgroundColor: `${bg}33`, borderColor: `${bg}66` }]}>
      <Text style={[s.avatarText, { color: bg }]}>{initial}</Text>
    </View>
  );
}

function LogRow({ log }: { log: AuditLog }) {
  const [expanded, setExpanded] = useState(false);
  const info = ACAO_LABELS[log.acao];
  return (
    <TouchableOpacity onPress={() => setExpanded(!expanded)} style={s.logRow} activeOpacity={0.8}>
      <View style={[s.logColorBar, { backgroundColor: info?.color ?? '#7F8C8D' }]} />
      <View style={s.logContent}>
        <View style={s.logHeader}>
          <AcaoBadge acao={log.acao} />
          <View style={s.modulePill}><Text style={s.modulePillText}>{log.modulo}</Text></View>
          <Text style={s.logTime}>{formatDate(log.criadoEm)}</Text>
        </View>
        <Text style={s.logDesc}>{log.descricao}</Text>
        <View style={s.logMeta}>
          <Ionicons name="person-outline" size={12} color={Colors.textMuted} />
          <Text style={s.logMetaText}>
            {log.userName ?? log.userEmail}
            <Text style={s.logMetaRole}> ({log.userRole})</Text>
          </Text>
        </View>
        {expanded && (
          <View style={s.logExpanded}>
            <View style={s.expandedRow}>
              <Text style={s.expandedLabel}>Email</Text>
              <Text style={s.expandedValue}>{log.userEmail}</Text>
            </View>
            {log.recursoId && (
              <View style={s.expandedRow}>
                <Text style={s.expandedLabel}>ID Recurso</Text>
                <Text style={s.expandedValue}>{log.recursoId}</Text>
              </View>
            )}
            {log.ipAddress && (
              <View style={s.expandedRow}>
                <Text style={s.expandedLabel}>Endereço IP</Text>
                <Text style={s.expandedValue}>{log.ipAddress}</Text>
              </View>
            )}
            {log.userAgent && (
              <View style={s.expandedRow}>
                <Text style={s.expandedLabel}>Agente</Text>
                <Text style={[s.expandedValue, { fontSize: 10 }]} numberOfLines={2}>{log.userAgent}</Text>
              </View>
            )}
            {!!log.dados && (
              <View style={s.expandedRow}>
                <Text style={s.expandedLabel}>Dados</Text>
                <Text style={[s.expandedValue, s.codeText]} numberOfLines={5}>
                  {JSON.stringify(log.dados, null, 2)}
                </Text>
              </View>
            )}
          </View>
        )}
      </View>
      <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color={Colors.textMuted} style={{ marginTop: 4 }} />
    </TouchableOpacity>
  );
}

interface UserGroup {
  userId: string; userEmail: string; userName?: string; userRole: string;
  logs: AuditLog[]; countByAcao: Record<string, number>; lastSeen: string;
  ipAddress?: string; modulos: string[];
}

function UserGroupCard({ group }: { group: UserGroup }) {
  const [expanded, setExpanded] = useState(false);
  const mainAcoes = ['criar','atualizar','eliminar','login','login_falhado','aprovar','rejeitar','gerar_pdf'];
  const acaoSummary = mainAcoes.filter(a => (group.countByAcao[a] ?? 0) > 0).map(a => ({ acao: a, count: group.countByAcao[a] }));
  const otherTotal = Object.entries(group.countByAcao).filter(([a]) => !mainAcoes.includes(a)).reduce((sum, [,n]) => sum + n, 0);

  return (
    <View style={s.groupCard}>
      <TouchableOpacity onPress={() => setExpanded(!expanded)} activeOpacity={0.85} style={s.groupHeader}>
        <UserAvatar name={group.userName} email={group.userEmail} role={group.userRole} />
        <View style={s.groupInfo}>
          <View style={s.groupNameRow}>
            <Text style={s.groupName} numberOfLines={1}>{group.userName ?? group.userEmail}</Text>
            <View style={s.groupRolePill}><Text style={s.groupRolePillText}>{ROLE_LABELS[group.userRole] ?? group.userRole}</Text></View>
          </View>
          <Text style={s.groupEmail} numberOfLines={1}>{group.userEmail}</Text>
          <View style={s.groupAcaoRow}>
            {acaoSummary.map(({ acao, count }) => {
              const info = ACAO_LABELS[acao] ?? { color: '#7F8C8D', label: acao };
              return (
                <View key={acao} style={[s.acaoCount, { backgroundColor: `${info.color}22`, borderColor: `${info.color}44` }]}>
                  <Text style={[s.acaoCountNum, { color: info.color }]}>{count}</Text>
                  <Text style={[s.acaoCountLabel, { color: info.color }]}>{info.label}</Text>
                </View>
              );
            })}
            {otherTotal > 0 && (
              <View style={[s.acaoCount, { backgroundColor: '#ffffff11', borderColor: '#ffffff22' }]}>
                <Text style={[s.acaoCountNum, { color: Colors.textMuted }]}>{otherTotal}</Text>
                <Text style={[s.acaoCountLabel, { color: Colors.textMuted }]}>Outros</Text>
              </View>
            )}
          </View>
        </View>
        <View style={s.groupRight}>
          <View style={s.groupCountBadge}>
            <Text style={s.groupCountNum}>{group.logs.length}</Text>
            <Text style={s.groupCountLabel}>eventos</Text>
          </View>
          <Text style={s.groupLastSeen}>{formatDateShort(group.lastSeen)}</Text>
          <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={Colors.textMuted} style={{ marginTop: 4 }} />
        </View>
      </TouchableOpacity>
      {expanded && (
        <View style={s.groupExpanded}>
          <View style={s.groupMeta}>
            {group.ipAddress && (
              <View style={s.groupMetaRow}>
                <Ionicons name="globe-outline" size={11} color={Colors.textMuted} />
                <Text style={s.groupMetaText}>{group.ipAddress}</Text>
              </View>
            )}
            {group.modulos.length > 0 && (
              <View style={s.groupMetaRow}>
                <Ionicons name="layers-outline" size={11} color={Colors.textMuted} />
                <Text style={s.groupMetaText} numberOfLines={2}>{group.modulos.join(' · ')}</Text>
              </View>
            )}
          </View>
          <View style={s.groupEventList}>
            {group.logs.map(log => {
              const info = ACAO_LABELS[log.acao] ?? { color: '#7F8C8D', label: log.acao, icon: 'ellipse-outline' };
              return (
                <View key={log.id} style={s.groupEventRow}>
                  <View style={[s.groupEventDot, { backgroundColor: info.color }]} />
                  <View style={s.groupEventContent}>
                    <View style={s.groupEventTop}>
                      <AcaoBadge acao={log.acao} />
                      <View style={s.modulePill}><Text style={s.modulePillText}>{log.modulo}</Text></View>
                      <Text style={s.groupEventTime}>{formatDateShort(log.criadoEm)}</Text>
                    </View>
                    <Text style={s.groupEventDesc} numberOfLines={2}>{log.descricao}</Text>
                    {log.recursoId && <Text style={s.groupEventMeta}>ID: {log.recursoId}</Text>}
                  </View>
                </View>
              );
            })}
          </View>
        </View>
      )}
    </View>
  );
}

// ─── COMPONENTES DO PAINEL DE CONTROLO ───────────────────────────────────────

type StatusLevel = 'ok' | 'atencao' | 'critico' | 'neutro';

const STATUS_COLOR: Record<StatusLevel, string> = {
  ok:      '#22C55E',
  atencao: '#F59E0B',
  critico: '#EF4444',
  neutro:  '#6B7280',
};

const STATUS_LABEL: Record<StatusLevel, string> = {
  ok:      'Normal',
  atencao: 'Atenção',
  critico: 'Crítico',
  neutro:  '—',
};

function StatusDot({ level }: { level: StatusLevel }) {
  return <View style={[s.statusDot, { backgroundColor: STATUS_COLOR[level] }]} />;
}

function MetricRow({
  icon, label, value, sub, status, highlight,
}: {
  icon: string; label: string; value: string | number;
  sub?: string; status?: StatusLevel; highlight?: boolean;
}) {
  const color = status ? STATUS_COLOR[status] : Colors.text;
  return (
    <View style={[s.metricRow, highlight && s.metricRowHighlight]}>
      <View style={[s.metricIcon, { backgroundColor: `${color}18` }]}>
        <Ionicons name={icon as any} size={14} color={color} />
      </View>
      <View style={s.metricBody}>
        <Text style={s.metricLabel}>{label}</Text>
        {sub && <Text style={s.metricSub}>{sub}</Text>}
      </View>
      <View style={s.metricRight}>
        <Text style={[s.metricValue, { color }]}>{value}</Text>
        {status && status !== 'neutro' && (
          <View style={[s.metricStatus, { backgroundColor: `${STATUS_COLOR[status]}18`, borderColor: `${STATUS_COLOR[status]}44` }]}>
            <Text style={[s.metricStatusText, { color: STATUS_COLOR[status] }]}>{STATUS_LABEL[status]}</Text>
          </View>
        )}
      </View>
    </View>
  );
}

function PillarCard({
  icon, title, color, health, children,
}: {
  icon: string; title: string; color: string; health: StatusLevel; children: React.ReactNode;
}) {
  return (
    <View style={[s.pillarCard, { borderColor: `${color}40` }]}>
      <View style={[s.pillarHeader, { backgroundColor: `${color}12` }]}>
        <View style={[s.pillarIconWrap, { backgroundColor: `${color}25` }]}>
          <Ionicons name={icon as any} size={18} color={color} />
        </View>
        <Text style={[s.pillarTitle, { color }]}>{title}</Text>
        <View style={{ flex: 1 }} />
        <View style={[s.healthBadge, { backgroundColor: `${STATUS_COLOR[health]}15`, borderColor: `${STATUS_COLOR[health]}44` }]}>
          <View style={[s.statusDot, { backgroundColor: STATUS_COLOR[health], width: 7, height: 7 }]} />
          <Text style={[s.healthText, { color: STATUS_COLOR[health] }]}>{STATUS_LABEL[health]}</Text>
        </View>
      </View>
      <View style={s.pillarBody}>{children}</View>
    </View>
  );
}

function SectionDivider({ label }: { label: string }) {
  return (
    <View style={s.sectionDivider}>
      <View style={s.sectionDividerLine} />
      <Text style={s.sectionDividerText}>{label}</Text>
      <View style={s.sectionDividerLine} />
    </View>
  );
}

function ActivityCard({ painel }: { painel: PainelControlo }) {
  const { actividade } = painel;
  const items = [
    { icon: 'log-in-outline',        label: 'Logins (30 dias)',          value: actividade.loginsUlt30,          color: '#3498DB' },
    { icon: 'pulse-outline',         label: 'Eventos totais (30 dias)',   value: actividade.eventosUlt30,         color: Colors.gold },
    { icon: 'alert-circle-outline',  label: 'Tentativas falhadas',        value: actividade.loginsFalhadosUlt30,  color: actividade.loginsFalhadosUlt30 > 20 ? '#EF4444' : '#F59E0B' },
    { icon: 'trash-outline',         label: 'Eliminações (7 dias)',        value: actividade.eliminacoesUlt7,      color: actividade.eliminacoesUlt7 > 50 ? '#EF4444' : '#7F8C8D' },
    { icon: 'person-add-outline',    label: 'Novos alunos (30 dias)',      value: actividade.alunosNovosUlt30,     color: '#2ECC71' },
    { icon: 'document-text-outline', label: 'Documentos emitidos (30d)',  value: actividade.docEmitidosUlt30,     color: '#9B59B6' },
  ];
  return (
    <View style={s.activityCard}>
      <View style={s.activityHeader}>
        <Ionicons name="analytics-outline" size={16} color={Colors.gold} />
        <Text style={s.activityTitle}>Actividade Recente</Text>
      </View>
      <View style={s.activityGrid}>
        {items.map((item, i) => (
          <View key={i} style={s.activityItem}>
            <View style={[s.activityItemIcon, { backgroundColor: `${item.color}18` }]}>
              <Ionicons name={item.icon as any} size={16} color={item.color} />
            </View>
            <Text style={[s.activityNum, { color: item.color }]}>{item.value}</Text>
            <Text style={s.activityLabel} numberOfLines={2}>{item.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function PainelTab({
  painel, loading, onRefresh, refreshing,
}: {
  painel: PainelControlo | null; loading: boolean;
  onRefresh: () => void; refreshing: boolean;
}) {
  return (
    <ScrollView
      style={s.scroll}
      contentContainerStyle={loading || !painel ? s.scrollCenter : s.scrollContent}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.gold} />}
    >
      {(loading || !painel) ? (
        <ActivityIndicator size="large" color={Colors.gold} />
      ) : <PainelContent painel={painel} />}
    </ScrollView>
  );
}

function PainelContent({ painel }: { painel: PainelControlo }) {
  const { financeiro: f, pedagogico: p, rh } = painel;

  const ratioPendentes = f.pagamentosPendentes.total > 0
    ? f.pagamentosPendentes.total / Math.max(f.pagamentosPagosMes.total + f.pagamentosPendentes.total, 1)
    : 0;
  const saudeFin: StatusLevel =
    ratioPendentes > 0.5 ? 'critico' : ratioPendentes > 0.25 ? 'atencao' : 'ok';

  const pautasAbertas  = p.pautas['aberta']  ?? 0;
  const pautasFechadas = p.pautas['fechada'] ?? 0;
  const ratioPautas = pautasFechadas + pautasAbertas > 0
    ? pautasFechadas / (pautasFechadas + pautasAbertas) : 1;
  const saudePed: StatusLevel =
    p.ocorrenciasGraves > 5 || ratioPautas < 0.5 ? 'critico' :
    p.transferenciasPendentes > 0 || p.alunosBloqueados > 10 || ratioPautas < 0.8 ? 'atencao' : 'ok';

  const folhaStatuses  = Object.keys(rh.folhasMes);
  const folhaAprovada  = rh.folhasMes['aprovada'] || rh.folhasMes['paga'];
  const saudeRH: StatusLevel =
    rh.faltasInjustificadas > 10 ? 'atencao' :
    folhaStatuses.length === 0  ? 'atencao' :
    folhaAprovada ? 'ok' : 'atencao';

  const folhaStatusLabel: Record<string, string> = {
    rascunho: 'Rascunho', processada: 'Processada', aprovada: 'Aprovada', paga: 'Paga',
  };
  const folhaText = folhaStatuses.length === 0
    ? 'Não processada'
    : folhaStatuses.map(st => `${folhaStatusLabel[st] ?? st} (${rh.folhasMes[st].total})`).join(', ');
  const folhaLiquido = Object.values(rh.folhasMes).reduce((s, fv) => s + fv.liquido, 0);

  const pautasTotal      = Object.values(p.pautas).reduce((s, n) => s + n, 0);
  const planosAprovados  = p.planos['aprovado'] ?? 0;
  const planosPendentes  = (p.planos['pendente'] ?? 0) + (p.planos['rascunho'] ?? 0);
  const taxaColor: StatusLevel = p.taxaPresenca === null ? 'neutro' :
    p.taxaPresenca >= 85 ? 'ok' : p.taxaPresenca >= 70 ? 'atencao' : 'critico';

  return (
    <>
      {/* Cabeçalho do relatório */}
      <View style={s.reportHeader}>
        <View>
          <Text style={s.reportTitle}>Painel de Controlo</Text>
          <Text style={s.reportSub}>
            Ano lectivo {painel.anoLetivo} · {MESES_PT[painel.mesAtual - 1]} {painel.anoAtual}
          </Text>
        </View>
        <View style={s.reportTime}>
          <Ionicons name="time-outline" size={12} color={Colors.textMuted} />
          <Text style={s.reportTimeText}>
            {new Date(painel.geradoEm).toLocaleTimeString('pt-AO', { hour: '2-digit', minute: '2-digit' })}
          </Text>
        </View>
      </View>

      {/* Actividade Recente */}
      <ActivityCard painel={painel} />

      {/* ── PILAR FINANCEIRO ── */}
      <PillarCard icon="cash-outline" title="Financeiro" color="#22C55E" health={saudeFin}>
        <SectionDivider label="Cobranças" />
        <MetricRow
          icon="checkmark-circle-outline"
          label="Pagamentos cobrados"
          sub={`Este mês (${MESES_PT[painel.mesAtual - 1]})`}
          value={f.pagamentosPagosMes.total > 0 ? `${f.pagamentosPagosMes.total} · ${fmtMoney(f.pagamentosPagosMes.valor)}` : '—'}
          status={f.pagamentosPagosMes.total > 0 ? 'ok' : 'atencao'}
        />
        <MetricRow
          icon="hourglass-outline"
          label="Propinas pendentes"
          sub="Total acumulado"
          value={f.pagamentosPendentes.total > 0 ? `${f.pagamentosPendentes.total} · ${fmtMoney(f.pagamentosPendentes.valor)}` : 'Nenhuma'}
          status={f.pagamentosPendentes.total === 0 ? 'ok' : f.pagamentosPendentes.total < 50 ? 'atencao' : 'critico'}
          highlight={f.pagamentosPendentes.total > 100}
        />

        <SectionDivider label="Outros" />
        <MetricRow
          icon="barcode-outline"
          label="RUPEs activos"
          sub="Referências por pagar"
          value={f.rupesAtivos > 0 ? f.rupesAtivos : 'Nenhum'}
          status={f.rupesAtivos === 0 ? 'ok' : f.rupesAtivos < 20 ? 'atencao' : 'critico'}
        />
        <MetricRow
          icon="gift-outline"
          label="Bolsas activas"
          sub="Isenções e descontos"
          value={f.bolsasAtivas}
          status={f.bolsasAtivas > 0 ? 'ok' : 'neutro'}
        />
      </PillarCard>

      {/* ── PILAR PEDAGÓGICO ── */}
      <PillarCard icon="school-outline" title="Pedagógico" color="#3B82F6" health={saudePed}>
        <SectionDivider label="Alunos" />
        <MetricRow
          icon="people-outline"
          label="Alunos activos"
          sub="Matriculados neste ano"
          value={p.alunosActivos}
          status={p.alunosActivos > 0 ? 'ok' : 'critico'}
        />
        {p.alunosBloqueados > 0 && (
          <MetricRow
            icon="lock-closed-outline"
            label="Alunos bloqueados"
            sub="Acesso suspenso"
            value={p.alunosBloqueados}
            status={p.alunosBloqueados > 10 ? 'critico' : 'atencao'}
            highlight
          />
        )}
        {p.alunosDesistentes > 0 && (
          <MetricRow
            icon="exit-outline"
            label="Desistências"
            sub="Registadas neste ano"
            value={p.alunosDesistentes}
            status="atencao"
          />
        )}

        <SectionDivider label="Pautas" />
        <MetricRow
          icon="document-text-outline"
          label="Pautas fechadas"
          sub={`${pautasTotal} pautas no total`}
          value={`${pautasFechadas} / ${pautasTotal}`}
          status={ratioPautas >= 0.9 ? 'ok' : ratioPautas >= 0.6 ? 'atencao' : 'critico'}
        />
        {pautasAbertas > 0 && (
          <MetricRow
            icon="alert-outline"
            label="Pautas em aberto"
            sub="Aguardam fecho pelo professor"
            value={pautasAbertas}
            status={pautasAbertas < 5 ? 'atencao' : 'critico'}
            highlight={pautasAbertas > 10}
          />
        )}
        {(p.pautas['rejeitada'] ?? 0) > 0 && (
          <MetricRow
            icon="close-circle-outline"
            label="Pautas rejeitadas"
            sub="Aguardam correcção"
            value={p.pautas['rejeitada']}
            status="critico"
            highlight
          />
        )}

        <SectionDivider label="Planos de Aula" />
        <MetricRow
          icon="checkmark-done-outline"
          label="Planos aprovados"
          sub={`${planosPendentes} pendentes / rascunho`}
          value={planosAprovados}
          status={planosAprovados > 0 ? 'ok' : 'neutro'}
        />
        {planosPendentes > 0 && (
          <MetricRow
            icon="time-outline"
            label="Aguardam aprovação"
            sub="Pendentes ou em rascunho"
            value={planosPendentes}
            status={planosPendentes > 20 ? 'critico' : 'atencao'}
          />
        )}

        <SectionDivider label="Ocorrências e Presenças" />
        <MetricRow
          icon="warning-outline"
          label="Ocorrências abertas"
          sub={p.ocorrenciasGraves > 0 ? `${p.ocorrenciasGraves} de gravidade grave` : 'Por resolver'}
          value={p.ocorrenciasAbertas}
          status={p.ocorrenciasGraves > 0 ? 'critico' : p.ocorrenciasAbertas > 5 ? 'atencao' : p.ocorrenciasAbertas > 0 ? 'atencao' : 'ok'}
          highlight={p.ocorrenciasGraves > 0}
        />
        <MetricRow
          icon="swap-horizontal-outline"
          label="Transferências pendentes"
          sub="Aguardam resposta"
          value={p.transferenciasPendentes > 0 ? p.transferenciasPendentes : 'Nenhuma'}
          status={p.transferenciasPendentes > 0 ? 'atencao' : 'ok'}
        />
        {p.taxaPresenca !== null && (
          <MetricRow
            icon="calendar-outline"
            label="Taxa de presenças"
            sub="Últimos 30 dias"
            value={`${p.taxaPresenca}%`}
            status={taxaColor}
          />
        )}
      </PillarCard>

      {/* ── PILAR RH ── */}
      <PillarCard icon="people-circle-outline" title="Recursos Humanos" color="#A855F7" health={saudeRH}>
        <SectionDivider label="Pessoal" />
        <MetricRow
          icon="briefcase-outline"
          label="Funcionários activos"
          sub="Em funções neste ano"
          value={rh.funcionariosAtivos}
          status={rh.funcionariosAtivos > 0 ? 'ok' : 'critico'}
        />

        <SectionDivider label="Folha de Salário" />
        <MetricRow
          icon="wallet-outline"
          label={`Folha de ${MESES_PT[painel.mesAtual - 1]}`}
          sub={folhaLiquido > 0 ? `Total líquido: ${fmtMoney(folhaLiquido)}` : 'Valor a processar'}
          value={folhaText}
          status={
            folhaStatuses.length === 0 ? 'atencao' :
            folhaAprovada ? 'ok' :
            rh.folhasMes['processada'] ? 'atencao' : 'atencao'
          }
          highlight={folhaStatuses.length === 0}
        />

        <SectionDivider label="Faltas este mês" />
        <MetricRow
          icon="ban-outline"
          label="Faltas injustificadas"
          sub="Período actual"
          value={rh.faltasInjustificadas > 0 ? rh.faltasInjustificadas : 'Nenhuma'}
          status={rh.faltasInjustificadas === 0 ? 'ok' : rh.faltasInjustificadas > 10 ? 'critico' : 'atencao'}
          highlight={rh.faltasInjustificadas > 5}
        />
        {rh.faltasJustificadas > 0 && (
          <MetricRow
            icon="document-outline"
            label="Faltas justificadas"
            sub="Com comprovativo"
            value={rh.faltasJustificadas}
            status="neutro"
          />
        )}
        {rh.meioDia > 0 && (
          <MetricRow
            icon="partly-sunny-outline"
            label="Meio-dia"
            sub="Saídas ou entradas parciais"
            value={rh.meioDia}
            status="neutro"
          />
        )}
      </PillarCard>

      {/* Nota de rodapé */}
      <View style={s.footerNote}>
        <Ionicons name="information-circle-outline" size={13} color={Colors.textMuted} />
        <Text style={s.footerNoteText}>
          Dados em tempo real · Puxe para baixo para actualizar · Ano lectivo {painel.anoLetivo}
        </Text>
      </View>
    </>
  );
}

// ─── ECRÃ PRINCIPAL ───────────────────────────────────────────────────────────

type Tab = 'painel' | 'registo' | 'actividade';

export default function AuditoriaScreen() {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();

  const [activeTab, setActiveTab] = useState<Tab>('painel');

  // Registo de eventos (audit log)
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [filterAcao, setFilterAcao] = useState('');
  const [filterModulo, setFilterModulo] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  // Painel de controlo
  const [painel, setPainel] = useState<PainelControlo | null>(null);
  const [painelLoading, setPainelLoading] = useState(false);
  const [painelRefreshing, setPainelRefreshing] = useState(false);

  const allowedRoles = ['ceo', 'pca', 'admin', 'director', 'chefe_secretaria'];
  const hasAccess = user && allowedRoles.includes(user.role);

  const fetchPainel = useCallback(async (isRefresh = false) => {
    if (!hasAccess) return;
    if (isRefresh) setPainelRefreshing(true); else setPainelLoading(true);
    try {
      const data = await api.get<PainelControlo>('/api/audit-logs/painel-controlo');
      setPainel(data);
    } catch (e) {
      console.error('Painel fetch error', e);
    } finally {
      setPainelLoading(false);
      setPainelRefreshing(false);
    }
  }, [hasAccess]);

  const fetchLogs = useCallback(async (p = 1, isRefresh = false) => {
    if (!hasAccess) return;
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(p), limit: '50' });
      if (search)       params.set('search', search);
      if (filterAcao)   params.set('acao', filterAcao);
      if (filterModulo) params.set('modulo', filterModulo);
      const data = await api.get<{ logs: AuditLog[]; total: number; pages: number }>(`/api/audit-logs?${params}`);
      setLogs(data.logs);
      setTotal(data.total);
      setPages(data.pages);
      setPage(p);
    } catch (e) {
      console.error('Audit fetch error', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [hasAccess, search, filterAcao, filterModulo]);

  const fetchStats = useCallback(async () => {
    if (!hasAccess) return;
    try {
      const data = await api.get<Stats>('/api/audit-logs/stats');
      setStats(data);
    } catch { /* silent */ }
  }, [hasAccess]);

  // Carrega painel ao montar
  useEffect(() => { fetchPainel(); }, [fetchPainel]);

  // Carrega logs ao mudar para essa aba (apenas uma vez)
  useEffect(() => {
    if ((activeTab === 'registo' || activeTab === 'actividade') && logs.length === 0) {
      fetchLogs(1);
      fetchStats();
    }
  }, [activeTab, logs.length, fetchLogs, fetchStats]);

  const totalByAcao = useMemo(() => {
    const map: Record<string, number> = {};
    stats?.byAcao.forEach(r => { map[r.acao] = parseInt(r.total); });
    return map;
  }, [stats]);

  const userGroups = useMemo((): UserGroup[] => {
    const map = new Map<string, UserGroup>();
    for (const log of logs) {
      const key = log.userId || log.userEmail;
      if (!map.has(key)) {
        map.set(key, {
          userId: log.userId, userEmail: log.userEmail, userName: log.userName,
          userRole: log.userRole, logs: [], countByAcao: {}, lastSeen: log.criadoEm,
          ipAddress: log.ipAddress, modulos: [],
        });
      }
      const g = map.get(key)!;
      g.logs.push(log);
      g.countByAcao[log.acao] = (g.countByAcao[log.acao] ?? 0) + 1;
      if (log.criadoEm > g.lastSeen) g.lastSeen = log.criadoEm;
      if (!g.modulos.includes(log.modulo)) g.modulos.push(log.modulo);
    }
    return Array.from(map.values()).sort((a, b) => b.lastSeen.localeCompare(a.lastSeen));
  }, [logs]);

  const exportCSV = useCallback(() => {
    if (Platform.OS !== 'web') return;
    const header = ['Data/Hora','Utilizador','Email','Cargo','Ação','Módulo','Descrição','IP','ID Recurso'];
    const rows = logs.map(l => [
      formatDate(l.criadoEm), l.userName ?? '', l.userEmail, l.userRole,
      l.acao, l.modulo, l.descricao, l.ipAddress ?? '', l.recursoId ?? '',
    ]);
    const csv = [header, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-log-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [logs]);

  if (!hasAccess) {
    return (
      <View style={s.container}>
        <TopBar title="Auditoria" />
        <View style={s.accessDenied}>
          <Ionicons name="lock-closed-outline" size={64} color={Colors.textMuted} />
          <Text style={s.accessDeniedText}>Acesso Restrito</Text>
          <Text style={s.accessDeniedSub}>Apenas administradores têm acesso à auditoria.</Text>
        </View>
      </View>
    );
  }

  const tabs: { id: Tab; icon: string; label: string }[] = [
    { id: 'painel',     icon: 'grid-outline',        label: 'Painel' },
    { id: 'registo',    icon: 'list-outline',         label: 'Registo' },
    { id: 'actividade', icon: 'people-outline',       label: 'Por Utilizador' },
  ];

  return (
    <View style={[s.container, { paddingBottom: insets.bottom }]}>
      <TopBar title="Auditoria do Sistema" />

      {/* Tab Bar */}
      <View style={s.tabBar}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.tabBarContent}
        >
          {tabs.map(t => (
            <TouchableOpacity
              key={t.id}
              style={[s.tabBtn, activeTab === t.id && s.tabBtnActive]}
              onPress={() => setActiveTab(t.id)}
              activeOpacity={0.75}
            >
              <Ionicons name={t.icon as any} size={13} color={activeTab === t.id ? Colors.dark : Colors.textMuted} />
              <Text style={[s.tabText, activeTab === t.id && s.tabTextActive]}>{t.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* ── ABA: PAINEL ── */}
      {activeTab === 'painel' && (
        <PainelTab
          painel={painel}
          loading={painelLoading}
          onRefresh={() => fetchPainel(true)}
          refreshing={painelRefreshing}
        />
      )}

      {/* ── ABA: REGISTO ── */}
      {activeTab === 'registo' && (
        <ScrollView
          style={s.scroll}
          contentContainerStyle={s.scrollContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => fetchLogs(1, true)} tintColor={Colors.gold} />}
        >
          {/* Stats mini */}
          {stats && (
            <View style={s.statsRow}>
              {[
                { label: 'Total', value: total, color: Colors.text },
                { label: 'Logins', value: totalByAcao['login'] ?? 0, color: '#3498DB' },
                { label: 'Criações', value: totalByAcao['criar'] ?? 0, color: '#2ECC71' },
                { label: 'Eliminações', value: totalByAcao['eliminar'] ?? 0, color: '#E74C3C' },
              ].map(st => (
                <View key={st.label} style={s.statCard}>
                  <Text style={[s.statNumber, { color: st.color }]}>{st.value}</Text>
                  <Text style={s.statLabel}>{st.label}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Search + Filter */}
          <View style={s.searchBar}>
            <View style={s.searchInput}>
              <StableSearchInput
                value={search} onChangeText={setSearch}
                inputStyle={s.searchText}
                placeholder="Pesquisar por utilizador, descrição..."
                iconColor={Colors.textMuted} returnKeyType="search"
              />
            </View>
            <TouchableOpacity style={s.filterBtn} onPress={() => setShowFilters(!showFilters)}>
              <Ionicons name="options-outline" size={18} color={showFilters ? Colors.gold : Colors.textSecondary} />
            </TouchableOpacity>
            <TouchableOpacity style={s.filterBtn} onPress={exportCSV}>
              <Ionicons name="download-outline" size={18} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {showFilters && (
            <View style={s.filtersPanel}>
              <Text style={s.filtersTitle}>Filtros</Text>
              <View style={s.filterRow}>
                <Text style={s.filterLabel}>Ação</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.pillScroll}>
                  {ACOES.map(a => (
                    <TouchableOpacity key={a} style={[s.pill, filterAcao === a && s.pillActive]}
                      onPress={() => { setFilterAcao(a); fetchLogs(1); }}>
                      <Text style={[s.pillText, filterAcao === a && s.pillTextActive]}>
                        {a === '' ? 'Todas' : (ACAO_LABELS[a]?.label ?? a)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
              <View style={s.filterRow}>
                <Text style={s.filterLabel}>Módulo</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.pillScroll}>
                  {MODULOS.map(m => (
                    <TouchableOpacity key={m} style={[s.pill, filterModulo === m && s.pillActive]}
                      onPress={() => { setFilterModulo(m); fetchLogs(1); }}>
                      <Text style={[s.pillText, filterModulo === m && s.pillTextActive]}>
                        {m === '' ? 'Todos' : m}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            </View>
          )}

          <View style={s.resultsBar}>
            <Text style={s.resultsText}>{total} {total === 1 ? 'evento' : 'eventos'}</Text>
            {pages > 1 && <Text style={s.resultsPage}>Pág. {page}/{pages}</Text>}
          </View>

          {loading ? null : logs.length === 0 ? (
            <View style={s.empty}>
              <Ionicons name="shield-checkmark-outline" size={48} color={Colors.textMuted} />
              <Text style={s.emptyText}>Nenhum evento encontrado</Text>
            </View>
          ) : (
            <>
              {logs.map(log => <LogRow key={log.id} log={log} />)}
              {pages > 1 && (
                <View style={s.pagination}>
                  <TouchableOpacity style={[s.pageBtn, page === 1 && s.pageBtnDisabled]}
                    onPress={() => fetchLogs(page - 1)} disabled={page === 1}>
                    <Ionicons name="chevron-back" size={18} color={page === 1 ? Colors.textMuted : Colors.text} />
                    <Text style={[s.pageBtnText, page === 1 && { color: Colors.textMuted }]}>Anterior</Text>
                  </TouchableOpacity>
                  <Text style={s.pageIndicator}>{page} / {pages}</Text>
                  <TouchableOpacity style={[s.pageBtn, page === pages && s.pageBtnDisabled]}
                    onPress={() => fetchLogs(page + 1)} disabled={page === pages}>
                    <Text style={[s.pageBtnText, page === pages && { color: Colors.textMuted }]}>Próxima</Text>
                    <Ionicons name="chevron-forward" size={18} color={page === pages ? Colors.textMuted : Colors.text} />
                  </TouchableOpacity>
                </View>
              )}
            </>
          )}
        </ScrollView>
      )}

      {/* ── ABA: ACTIVIDADE POR UTILIZADOR ── */}
      {activeTab === 'actividade' && (
        <ScrollView
          style={s.scroll}
          contentContainerStyle={s.scrollContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => fetchLogs(1, true)} tintColor={Colors.gold} />}
        >
          <View style={s.resultsBar}>
            <Text style={s.resultsText}>
              {userGroups.length} {userGroups.length === 1 ? 'utilizador' : 'utilizadores'} · {total} eventos
            </Text>
          </View>
          {loading ? null : userGroups.length === 0 ? (
            <View style={s.empty}>
              <Ionicons name="people-outline" size={48} color={Colors.textMuted} />
              <Text style={s.emptyText}>Sem actividade registada</Text>
            </View>
          ) : (
            <>
              {userGroups.map(group => (
                <UserGroupCard key={group.userId || group.userEmail} group={group} />
              ))}
              <View style={s.groupedNote}>
                <Ionicons name="information-circle-outline" size={13} color={Colors.textMuted} />
                <Text style={s.groupedNoteText}>
                  Agrupamento dos {logs.length} eventos desta página · Use filtros no Registo para refinar
                </Text>
              </View>
            </>
          )}
        </ScrollView>
      )}
    </View>
  );
}

// ─── ESTILOS ──────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  scroll:    { flex: 1 },
  scrollContent: { padding: 14, paddingBottom: 40 },
  scrollCenter:  { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },

  // ── Tab Bar ──
  tabBar: {
    backgroundColor: Colors.backgroundCard,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
    paddingHorizontal: 12, paddingVertical: 8,
  },
  tabBarContent: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
  },
  tabBtn: {
    flexDirection: 'row', alignItems: 'center',
    gap: 5, paddingVertical: 6, paddingHorizontal: 14,
    borderRadius: 99, backgroundColor: Colors.surface,
    borderWidth: 1, borderColor: Colors.border,
  },
  tabBtnActive: { backgroundColor: Colors.gold, borderColor: Colors.gold },
  tabText: { fontSize: 12, color: Colors.textMuted, fontFamily: 'Inter_500Medium' },
  tabTextActive: { color: Colors.dark, fontFamily: 'Inter_600SemiBold' },

  // ── Painel: cabeçalho ──
  reportHeader: {
    flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between',
    marginBottom: 14,
  },
  reportTitle: { fontSize: 18, fontFamily: 'Inter_700Bold', color: Colors.text },
  reportSub:   { fontSize: 12, color: Colors.textMuted, fontFamily: 'Inter_400Regular', marginTop: 2 },
  reportTime:  { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  reportTimeText: { fontSize: 11, color: Colors.textMuted, fontFamily: 'Inter_400Regular' },

  // ── Actividade card ──
  activityCard: {
    backgroundColor: Colors.backgroundCard, borderRadius: 14,
    borderWidth: 1, borderColor: Colors.border, marginBottom: 14, overflow: 'hidden',
  },
  activityHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 14, paddingVertical: 10,
    backgroundColor: `${Colors.gold}10`,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  activityTitle: { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: Colors.gold },
  activityGrid:  { flexDirection: 'row', flexWrap: 'wrap', padding: 10, gap: 0 },
  activityItem:  { width: '33.33%', alignItems: 'center', padding: 10, gap: 4 },
  activityItemIcon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  activityNum:   { fontSize: 20, fontFamily: 'Inter_700Bold', lineHeight: 24 },
  activityLabel: { fontSize: 10, color: Colors.textMuted, fontFamily: 'Inter_400Regular', textAlign: 'center' },

  // ── Pilar card ──
  pillarCard: {
    backgroundColor: Colors.backgroundCard, borderRadius: 14,
    borderWidth: 1, marginBottom: 14, overflow: 'hidden',
  },
  pillarHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 14, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  pillarIconWrap: {
    width: 34, height: 34, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  pillarTitle: { fontSize: 15, fontFamily: 'Inter_700Bold' },
  pillarBody:  { paddingHorizontal: 14, paddingBottom: 8, paddingTop: 4 },

  healthBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1,
  },
  healthText: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  statusDot:  { width: 8, height: 8, borderRadius: 4 },

  // ── Section divider ──
  sectionDivider: { flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 10 },
  sectionDividerLine: { flex: 1, height: 1, backgroundColor: Colors.border },
  sectionDividerText: { fontSize: 10, color: Colors.textMuted, fontFamily: 'Inter_600SemiBold', textTransform: 'uppercase', letterSpacing: 0.8 },

  // ── Metric row ──
  metricRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: `${Colors.border}66`,
  },
  metricRowHighlight: { backgroundColor: `${'#EF4444'}08`, borderRadius: 8, paddingHorizontal: 6 },
  metricIcon: { width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  metricBody: { flex: 1, gap: 1 },
  metricLabel: { fontSize: 13, color: Colors.text, fontFamily: 'Inter_500Medium' },
  metricSub:   { fontSize: 11, color: Colors.textMuted, fontFamily: 'Inter_400Regular' },
  metricRight: { alignItems: 'flex-end', gap: 3 },
  metricValue: { fontSize: 14, fontFamily: 'Inter_700Bold', textAlign: 'right' },
  metricStatus: {
    borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1,
  },
  metricStatusText: { fontSize: 10, fontFamily: 'Inter_600SemiBold' },

  // ── Footer ──
  footerNote: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    justifyContent: 'center', paddingVertical: 12,
  },
  footerNoteText: { fontSize: 11, color: Colors.textMuted, fontFamily: 'Inter_400Regular', flex: 1 },

  // ── Stats mini (registo) ──
  statsRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  statCard: {
    flex: 1, backgroundColor: Colors.backgroundCard, borderRadius: 10,
    padding: 10, alignItems: 'center', borderWidth: 1, borderColor: Colors.border,
  },
  statNumber: { fontSize: 20, fontFamily: 'Inter_700Bold', color: Colors.text },
  statLabel:  { fontSize: 10, color: Colors.textMuted, fontFamily: 'Inter_400Regular', textAlign: 'center', marginTop: 1 },

  // ── Search ──
  searchBar: { flexDirection: 'row', gap: 8, marginBottom: 10, alignItems: 'center' },
  searchInput: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: Colors.backgroundCard, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: Colors.border,
  },
  searchText: { flex: 1, color: Colors.text, fontFamily: 'Inter_400Regular', fontSize: 14 },
  filterBtn: {
    backgroundColor: Colors.backgroundCard, borderRadius: 10, padding: 10,
    borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center',
  },

  // ── Filters panel ──
  filtersPanel: {
    backgroundColor: Colors.backgroundCard, borderRadius: 12, padding: 14, marginBottom: 10,
    borderWidth: 1, borderColor: Colors.border,
  },
  filtersTitle: { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: Colors.textMuted, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.8 },
  filterRow:  { marginBottom: 10 },
  filterLabel: { fontSize: 11, color: Colors.textMuted, fontFamily: 'Inter_400Regular', marginBottom: 6 },
  pillScroll: { flexGrow: 0 },
  pill: {
    backgroundColor: Colors.backgroundElevated, borderRadius: 20, paddingHorizontal: 12,
    paddingVertical: 5, marginRight: 6, borderWidth: 1, borderColor: Colors.border,
  },
  pillActive: { backgroundColor: `${Colors.gold}22`, borderColor: Colors.gold },
  pillText: { fontSize: 12, color: Colors.textSecondary, fontFamily: 'Inter_400Regular' },
  pillTextActive: { color: Colors.gold, fontFamily: 'Inter_600SemiBold' },

  // ── Results bar ──
  resultsBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  resultsText: { fontSize: 12, color: Colors.textMuted, fontFamily: 'Inter_400Regular', flex: 1 },
  resultsPage: { fontSize: 12, color: Colors.textMuted, fontFamily: 'Inter_400Regular' },

  // ── Log rows ──
  logRow: {
    backgroundColor: Colors.backgroundCard, borderRadius: 12, marginBottom: 8,
    borderWidth: 1, borderColor: Colors.border, flexDirection: 'row', overflow: 'hidden',
  },
  logColorBar: { width: 4 },
  logContent:  { flex: 1, padding: 12 },
  logHeader:   { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 6 },
  logTime:     { fontSize: 11, color: Colors.textMuted, fontFamily: 'Inter_400Regular', marginLeft: 'auto' },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1 },
  badgeText:   { fontSize: 10, fontFamily: 'Inter_600SemiBold' },
  modulePill:  { backgroundColor: Colors.backgroundElevated, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  modulePillText: { fontSize: 10, color: Colors.textSecondary, fontFamily: 'Inter_400Regular' },
  logDesc:     { fontSize: 13, color: Colors.text, fontFamily: 'Inter_500Medium', marginBottom: 6 },
  logMeta:     { flexDirection: 'row', alignItems: 'center', gap: 4 },
  logMetaText: { fontSize: 11, color: Colors.textMuted, fontFamily: 'Inter_400Regular' },
  logMetaRole: { color: Colors.textMuted, fontStyle: 'italic' },
  logExpanded: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: Colors.border, gap: 6 },
  expandedRow:   { flexDirection: 'row', gap: 10 },
  expandedLabel: { fontSize: 11, color: Colors.textMuted, fontFamily: 'Inter_600SemiBold', width: 90, flexShrink: 0 },
  expandedValue: { flex: 1, fontSize: 11, color: Colors.textSecondary, fontFamily: 'Inter_400Regular' },
  codeText: { fontFamily: Platform.OS === 'web' ? 'monospace' : 'Inter_400Regular', fontSize: 10, backgroundColor: Colors.backgroundElevated, padding: 6, borderRadius: 4 },

  // ── Grouped view ──
  avatar: { width: 44, height: 44, borderRadius: 22, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  avatarText: { fontSize: 18, fontFamily: 'Inter_700Bold' },
  groupCard: { backgroundColor: Colors.backgroundCard, borderRadius: 14, marginBottom: 10, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden' },
  groupHeader: { flexDirection: 'row', alignItems: 'flex-start', padding: 14, gap: 12 },
  groupInfo:   { flex: 1, gap: 4 },
  groupNameRow:    { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  groupName:       { fontSize: 14, fontFamily: 'Inter_600SemiBold', color: Colors.text, flexShrink: 1 },
  groupRolePill:   { backgroundColor: Colors.backgroundElevated, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  groupRolePillText: { fontSize: 10, color: Colors.textSecondary, fontFamily: 'Inter_400Regular' },
  groupEmail:      { fontSize: 11, color: Colors.textMuted, fontFamily: 'Inter_400Regular' },
  groupAcaoRow:    { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 6 },
  acaoCount: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1 },
  acaoCountNum:   { fontSize: 12, fontFamily: 'Inter_700Bold' },
  acaoCountLabel: { fontSize: 10, fontFamily: 'Inter_400Regular' },
  groupRight: { alignItems: 'flex-end', gap: 4 },
  groupCountBadge: { alignItems: 'center', backgroundColor: `${Colors.gold}22`, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: `${Colors.gold}44` },
  groupCountNum:   { fontSize: 16, fontFamily: 'Inter_700Bold', color: Colors.gold, lineHeight: 20 },
  groupCountLabel: { fontSize: 9, color: Colors.gold, fontFamily: 'Inter_400Regular' },
  groupLastSeen:   { fontSize: 10, color: Colors.textMuted, fontFamily: 'Inter_400Regular' },
  groupExpanded:   { borderTopWidth: 1, borderTopColor: Colors.border, paddingHorizontal: 14, paddingBottom: 10 },
  groupMeta:    { flexDirection: 'row', flexWrap: 'wrap', gap: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.border, marginBottom: 8 },
  groupMetaRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 5, flex: 1 },
  groupMetaText:{ fontSize: 11, color: Colors.textMuted, fontFamily: 'Inter_400Regular', flex: 1 },
  groupEventList: { gap: 0 },
  groupEventRow: { flexDirection: 'row', gap: 10, paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: `${Colors.border}88` },
  groupEventDot: { width: 8, height: 8, borderRadius: 4, marginTop: 5, flexShrink: 0 },
  groupEventContent: { flex: 1, gap: 4 },
  groupEventTop:  { flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'wrap' },
  groupEventTime: { fontSize: 10, color: Colors.textMuted, fontFamily: 'Inter_400Regular', marginLeft: 'auto' },
  groupEventDesc: { fontSize: 12, color: Colors.textSecondary, fontFamily: 'Inter_400Regular' },
  groupEventMeta: { fontSize: 10, color: Colors.textMuted, fontFamily: 'Inter_400Regular' },
  groupedNote: { flexDirection: 'row', alignItems: 'center', gap: 6, justifyContent: 'center', paddingTop: 12, paddingBottom: 4 },
  groupedNoteText: { fontSize: 11, color: Colors.textMuted, fontFamily: 'Inter_400Regular' },

  // ── Paginação ──
  pagination: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 20, paddingTop: 12, borderTopWidth: 1, borderTopColor: Colors.border },
  pageBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, padding: 8 },
  pageBtnDisabled: { opacity: 0.4 },
  pageBtnText: { fontSize: 13, color: Colors.text, fontFamily: 'Inter_500Medium' },
  pageIndicator: { fontSize: 13, color: Colors.textMuted, fontFamily: 'Inter_400Regular' },

  // ── Empty ──
  empty:     { alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyText: { fontSize: 15, color: Colors.textMuted, fontFamily: 'Inter_400Regular' },

  // ── Acesso negado ──
  accessDenied:    { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 32 },
  accessDeniedText:{ fontSize: 20, color: Colors.text, fontFamily: 'Inter_700Bold' },
  accessDeniedSub: { fontSize: 14, color: Colors.textMuted, fontFamily: 'Inter_400Regular', textAlign: 'center' },
});
