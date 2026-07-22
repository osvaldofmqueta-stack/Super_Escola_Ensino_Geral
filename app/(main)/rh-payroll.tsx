import React, { useState, useEffect, useCallback } from 'react';
import {KeyboardAvoidingView, Modal, Platform, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View} from 'react-native';
import { Ionicons, MaterialCommunityIcons, FontAwesome5 } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useAuth } from '../../context/AuthContext';
import { useConfig, calcIRT as calcIRTFromTabela, IrtEscalao } from '../../context/ConfigContext';
import { api } from '../../lib/api';
import { Colors } from '../../constants/colors';
import { SkeletonList } from '@/components/Skeleton';
import DateInput from '../../components/DateInput';
import { useToast } from '../../context/ToastContext';
import { webAlert } from '@/utils/webAlert';
import { useEnterToSave } from '@/hooks/useEnterToSave';
import { useTabMemory } from '@/hooks/useTabMemory';
import { BarChart, DonutChart } from '@/components/Charts';
import { StableSearchInput } from '@/components/StableSearchInput';

import { HScrollTabBar } from '@/components/HScrollTabBar';
// ─── Types ────────────────────────────────────────────────────────────────────
interface FolhaSalarios {
  id: string;
  mes: number;
  ano: number;
  descricao: string;
  status: 'rascunho' | 'processada' | 'aprovada' | 'paga';
  totalBruto: number;
  totalLiquido: number;
  totalInssEmpregado: number;
  totalInssPatronal: number;
  totalIrt: number;
  totalSubsidios: number;
  numFuncionarios: number;
  processadaPor: string | null;
  observacoes: string | null;
  criadoEm: string;
}

interface ItemFolha {
  id: string;
  folhaId: string;
  professorId: string;
  professorNome: string;
  cargo: string;
  categoria: string;
  salarioBase: number;
  subsidioAlimentacao: number;
  subsidioTransporte: number;
  subsidioHabitacao: number;
  outrosSubsidios: number;
  salarioBruto: number;
  inssEmpregado: number;
  inssPatronal: number;
  irt: number;
  descontoFaltas: number;
  numFaltasInj: number;
  numMeioDia: number;
  remuneracaoTempos: number;
  numTempos: number;
  outrosDescontos: number;
  totalDescontos: number;
  salarioLiquido: number;
  tipoFuncionario: string;
  departamento: string;
  seccao: string;
  observacao: string | null;
}

interface ProfessorSalario {
  id: string;
  nome: string;
  apelido: string;
  cargo: string | null;
  categoria: string | null;
  salarioBase: number | null;
  subsidioAlimentacao: number | null;
  subsidioTransporte: number | null;
  subsidioHabitacao: number | null;
  dataContratacao: string | null;
  tipoContrato: string | null;
  valorPorTempoLectivo: number | null;
  temposSemanais: number | null;
  ativo: boolean;
  email: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

const fmt = (n: number) =>
  new Intl.NumberFormat('pt-AO', { style: 'currency', currency: 'AOA', minimumFractionDigits: 2 })
    .format(n).replace('AOA', 'Kz');

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  rascunho:   { label: 'Rascunho',   color: '#aaa' },
  processada: { label: 'Processada', color: Colors.accent ?? '#4FC3F7' },
  aprovada:   { label: 'Aprovada',   color: '#66BB6A' },
  paga:       { label: 'Paga',       color: '#AB47BC' },
};

const CONTRATOS = ['efectivo', 'contratado', 'prestacao_servicos'];
const CONTRATO_LABELS: Record<string, string> = {
  efectivo: 'Efectivo', contratado: 'Contratado', prestacao_servicos: 'Prestação de Serviços',
};

// ─── Glass Card ───────────────────────────────────────────────────────────────
function Card({ children, style }: { children: React.ReactNode; style?: object }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

const VINCULO_META: Record<string, { label: string; color: string }> = {
  efectivo:           { label: 'Efectivo',              color: '#4CAF50' },
  colaborador:        { label: 'Colaborador',            color: '#2196F3' },
  contratado:         { label: 'Contratado',             color: '#FF9800' },
  prestacao_servicos: { label: 'Prest. Serviços',        color: '#9C27B0' },
};

// ─── Simulador Salarial ───────────────────────────────────────────────────────
function SimuladorSalarial({ profs, inssEmpPerc = 3, inssPatrPerc = 8, irtTabela }: {
  profs: ProfessorSalario[];
  inssEmpPerc?: number;
  inssPatrPerc?: number;
  irtTabela?: IrtEscalao[];
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const calcRow = (p: ProfessorSalario) => {
    const base = p.salarioBase ?? 0;
    const subAlim = p.subsidioAlimentacao ?? 0;
    const subTrans = p.subsidioTransporte ?? 0;
    const subHab = p.subsidioHabitacao ?? 0;
    const subs = subAlim + subTrans + subHab;
    const bruto = base + subs;
    const inssEmp = Math.round(base * (inssEmpPerc / 100) * 100) / 100;
    const inssPatr = Math.round(base * (inssPatrPerc / 100) * 100) / 100;
    const irt = Math.round((irtTabela ? calcIRTFromTabela(base, irtTabela) : calcIRT(base)) * 100) / 100;
    const liquido = Math.round((bruto - inssEmp - irt) * 100) / 100;
    return { base, subAlim, subTrans, subHab, subs, bruto, inssEmp, inssPatr, irt, liquido };
  };

  const totals = profs.reduce(
    (acc, p) => {
      const r = calcRow(p);
      return {
        bruto: acc.bruto + r.bruto,
        inssEmp: acc.inssEmp + r.inssEmp,
        inssPatr: acc.inssPatr + r.inssPatr,
        irt: acc.irt + r.irt,
        liquido: acc.liquido + r.liquido,
      };
    },
    { bruto: 0, inssEmp: 0, inssPatr: 0, irt: 0, liquido: 0 },
  );

  return (
    <>
      {/* Totals header */}
      <View style={simStyles.totalsRow}>
        <View style={{ flex: 1 }}>
          <Text style={simStyles.totalsLabel}>Total Bruto</Text>
          <Text style={simStyles.totalsVal}>{fmt(Math.round(totals.bruto * 100) / 100)}</Text>
        </View>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={simStyles.totalsLabel}>Descontos</Text>
          <Text style={[simStyles.totalsVal, { color: '#EF5350' }]}>
            {fmt(Math.round((totals.inssEmp + totals.irt) * 100) / 100)}
          </Text>
        </View>
        <View style={{ flex: 1, alignItems: 'flex-end' }}>
          <Text style={simStyles.totalsLabel}>Total Líquido</Text>
          <Text style={[simStyles.totalsVal, { color: '#66BB6A' }]}>
            {fmt(Math.round(totals.liquido * 100) / 100)}
          </Text>
        </View>
      </View>
      <View style={simStyles.divider} />

      {/* Per-employee rows */}
      {profs.map(p => {
        const r = calcRow(p);
        const isOpen = expandedId === p.id;
        return (
          <TouchableOpacity
            key={p.id}
            style={simStyles.empRow}
            onPress={() => setExpandedId(isOpen ? null : p.id)}
            activeOpacity={0.8}
          >
            <View style={simStyles.empRowTop}>
              <View style={{ flex: 1 }}>
                <Text style={simStyles.empName}>{p.nome} {p.apelido}</Text>
                <Text style={simStyles.empCargo}>{p.cargo ?? 'Professor'}</Text>
              </View>
              <View style={simStyles.empAmounts}>
                <Text style={simStyles.empBruto}>{fmt(r.bruto)}</Text>
                <Text style={[simStyles.empLiquido, { color: '#66BB6A' }]}>{fmt(r.liquido)}</Text>
                {(() => {
                  const tc = p.tipoContrato ?? 'efectivo';
                  const vm = VINCULO_META[tc] ?? VINCULO_META.efectivo;
                  return (
                    <View style={{ backgroundColor: vm.color + '22', borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2, marginTop: 3, borderWidth: 1, borderColor: vm.color + '55', alignSelf: 'flex-end' }}>
                      <Text style={{ fontSize: 9, fontWeight: '700', color: vm.color, letterSpacing: 0.3 }}>{vm.label.toUpperCase()}</Text>
                    </View>
                  );
                })()}
              </View>
              <Ionicons
                name={isOpen ? 'chevron-up' : 'chevron-down'}
                size={16}
                color="#aaa"
                style={{ marginLeft: 6 }}
              />
            </View>

            {isOpen && (
              <View style={simStyles.breakdown}>
                <SimRow label="Salário Base" val={fmt(r.base)} />
                {r.subAlim > 0 && <SimRow label="Subsídio Alimentação" val={fmt(r.subAlim)} />}
                {r.subTrans > 0 && <SimRow label="Subsídio Transporte" val={fmt(r.subTrans)} />}
                {r.subHab > 0 && <SimRow label="Subsídio Habitação" val={fmt(r.subHab)} />}
                <View style={simStyles.breakdownDivider} />
                <SimRow label="Salário Bruto" val={fmt(r.bruto)} bold />
                <SimRow label={`INSS Empregado (${inssEmpPerc}%)`} val={`- ${fmt(r.inssEmp)}`} color="#EF5350" />
                <SimRow label="IRT (tabela Angola)" val={`- ${fmt(r.irt)}`} color="#EF5350" />
                <View style={simStyles.breakdownDivider} />
                <SimRow label="Salário Líquido" val={fmt(r.liquido)} bold color="#66BB6A" />
                <View style={[simStyles.breakdownDivider, { marginTop: 6 }]} />
                <SimRow label={`INSS Patronal (${inssPatrPerc}%)`} val={fmt(r.inssPatr)} color="#FF7141" />
                <Text style={simStyles.patronalNote}>Custo adicional para a instituição (não desconta no funcionário)</Text>
              </View>
            )}
          </TouchableOpacity>
        );
      })}
    </>
  );
}

function SimRow({ label, val, bold, color }: { label: string; val: string; bold?: boolean; color?: string }) {
  return (
    <View style={simStyles.simRow}>
      <Text style={[simStyles.simLabel, bold && { color: '#fff', fontWeight: '700' }]}>{label}</Text>
      <Text style={[simStyles.simVal, bold && { fontWeight: '700' }, color ? { color } : {}]}>{val}</Text>
    </View>
  );
}

function RLine({ label, val, bold, accent, deducao }: {
  label: string; val: string; bold?: boolean; accent?: boolean; deducao?: boolean;
}) {
  return (
    <View style={reciboStyles.rline}>
      <Text style={[reciboStyles.rlineLabel, bold && { fontWeight: '700', color: '#fff' }]}>{label}</Text>
      <Text style={[
        reciboStyles.rlineVal,
        bold && { fontWeight: '700' },
        accent && { color: '#4FC3F7' },
        deducao && { color: '#EF5350' },
      ]}>
        {deducao ? `- ${val}` : val}
      </Text>
    </View>
  );
}

// ─── KPI Tile ────────────────────────────────────────────────────────────────
function KpiTile({ icon, label, value, sub, color }: {
  icon: React.ReactNode; label: string; value: string; sub?: string; color?: string;
}) {
  return (
    <View style={[styles.kpi, { borderLeftColor: color ?? Colors.primary }]}>
      <View style={styles.kpiIcon}>{icon}</View>
      <Text style={styles.kpiLabel}>{label}</Text>
      <Text style={[styles.kpiValue, color ? { color } : {}]}>{value}</Text>
      {sub && <Text style={styles.kpiSub}>{sub}</Text>}
    </View>
  );
}

// ─── Main Screen ─────────────────────────────────────────────────────────────
export default function RhPayrollScreen() {
  const { user } = useAuth();
  const { config } = useConfig();
  const router = useRouter();
  const { showToast } = useToast();

  const inssEmpPerc = config.inssEmpPerc;
  const inssPatrPerc = config.inssPatrPerc;
  const irtTabela = config.irtTabela;

  type PayrollTab = 'painel' | 'folhas' | 'funcionarios' | 'detalhe';
  const PAYROLL_PUBLIC_TABS: PayrollTab[] = ['painel', 'folhas', 'funcionarios'];
  const routeParamsPayroll = useLocalSearchParams<{ tab?: string }>();
  const initialPayrollTab = (PAYROLL_PUBLIC_TABS.find(t => t === String(routeParamsPayroll?.tab || '')) || 'painel') as PayrollTab;
  const [tab, setTab] = useState<PayrollTab>(initialPayrollTab);
  useEffect(() => {
    const t = String(routeParamsPayroll?.tab || '');
    if (t && (PAYROLL_PUBLIC_TABS as string[]).includes(t)) setTab(t as PayrollTab);
  }, [routeParamsPayroll?.tab]);
  const [folhas, setFolhas] = useState<FolhaSalarios[]>([]);
  const [profs, setProfs] = useState<ProfessorSalario[]>([]);
  const [selectedFolha, setSelectedFolha] = useState<FolhaSalarios | null>(null);
  const [itensFolha, setItensFolha] = useState<ItemFolha[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Modals
  const [showNovaFolha, setShowNovaFolha] = useState(false);
  const [showProcessar, setShowProcessar] = useState(false);
  const [showProfModal, setShowProfModal] = useState(false);
  const [editingProf, setEditingProf] = useState<ProfessorSalario | null>(null);
  const [reciboItem, setReciboItem] = useState<ItemFolha | null>(null);

  // Nova Folha form
  const now = new Date();
  const [newMes, setNewMes] = useState(now.getMonth() + 1);
  const [newAno, setNewAno] = useState(now.getFullYear());
  const [newDescricao, setNewDescricao] = useState('');

  // Prof edit form — includes tempo lectivo fields
  const [profForm, setProfForm] = useState({
    cargo: '', categoria: '', salarioBase: '', subsidioAlimentacao: '',
    subsidioTransporte: '', subsidioHabitacao: '', dataContratacao: '', tipoContrato: 'efectivo',
    valorPorTempoLectivo: '', temposSemanais: '',
  });

  // Filter + paginação funcionários
  const [profSearch, setProfSearch] = useState('');
  const [profPagina, setProfPagina] = useState(1);
  const PROF_PAGE_SIZE = 10;

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [f, p] = await Promise.all([
        api.get<FolhaSalarios[]>('/api/folhas-salarios'),
        api.get<ProfessorSalario[]>('/api/professores'),
      ]);
      setFolhas(f);
      setProfs(p);
    } catch {
      showToast('Erro ao carregar dados de payroll', 'error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const loadItens = useCallback(async (folhaId: string) => {
    try {
      const items = await api.get<ItemFolha[]>(`/api/folhas-salarios/${folhaId}/itens`);
      setItensFolha(items);
    } catch { showToast('Erro ao carregar detalhes da folha', 'error'); }
  }, []);

  const openFolha = (f: FolhaSalarios) => {
    setSelectedFolha(f);
    setItensFolha([]);
    loadItens(f.id);
    setTab('detalhe');
  };

  // ─── Computed KPIs ─────────────────────────────────────────────────────────
  const latestFolha = folhas[0];
  const profsComSalario = profs.filter(p => p.ativo && p.salarioBase && p.salarioBase > 0);
  const totalMassaSalarial = profsComSalario.reduce((s, p) => s + (p.salarioBase ?? 0), 0);

  // ─── Nova Folha ─────────────────────────────────────────────────────────────
  const criarFolha = async () => {
    try {
      await api.post('/api/folhas-salarios', {
        mes: newMes, ano: newAno, descricao: newDescricao,
      });
      showToast('Folha de salários criada', 'success');
      setShowNovaFolha(false);
      await loadData();
    } catch (e: unknown) {
      showToast((e as Error).message.includes('409') || (e as Error).message.includes('Já existe')
        ? 'Já existe uma folha para este mês/ano' : 'Erro ao criar folha', 'error');
    }
  };

  // ─── Processar ──────────────────────────────────────────────────────────────
  const processarFolha = async () => {
    if (!selectedFolha) return;
    try {
      const res = await api.post<{ folha: FolhaSalarios; numProcessados: number }>(
        `/api/folhas-salarios/${selectedFolha.id}/processar`,
        { processadaPor: user?.nome ?? 'Sistema' },
      );
      showToast(`Folha processada — ${res.numProcessados} funcionários`, 'success');
      setShowProcessar(false);
      if (res.folha) setSelectedFolha(res.folha);
      await Promise.all([loadData(), loadItens(selectedFolha.id)]);
    } catch { showToast('Erro ao processar folha', 'error'); }
  };

  // ─── Aprovar / Pagar ────────────────────────────────────────────────────────
  const mudarStatus = async (folha: FolhaSalarios, novoStatus: string) => {
    try {
      await api.put(`/api/folhas-salarios/${folha.id}`, { status: novoStatus });
      showToast(`Folha marcada como ${STATUS_LABELS[novoStatus]?.label}`, 'success');
      await loadData();
      if (selectedFolha?.id === folha.id) setSelectedFolha({ ...folha, status: novoStatus as FolhaSalarios['status'] });
    } catch { showToast('Erro ao atualizar estado', 'error'); }
  };

  const imprimirRecibo = (item: ItemFolha, folha: FolhaSalarios) => {
    const fmtKz = (n: number) => n.toLocaleString('pt-PT', { minimumFractionDigits: 2 }) + ' Kz';
    const mesAno = `${MESES[(folha.mes ?? 1) - 1]} ${folha.ano}`;
    const docRef = `REC-${folha.ano}-${String(folha.mes).padStart(2, '0')}-${item.id.slice(0, 6).toUpperCase()}`;
    const qrData = encodeURIComponent(`${config.nomeEscola}|RECIBO|${docRef}|${item.professorNome}|${mesAno}`);
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=90x90&data=${qrData}`;

    const html = `<!DOCTYPE html><html lang="pt"><head><meta charset="utf-8"/>
    <title>Recibo de Vencimento — ${item.professorNome}</title>
    <style>
      *{box-sizing:border-box;margin:0;padding:0}
      body{font-family:Arial,Helvetica,sans-serif;color:#111;font-size:9pt;padding:24px;max-width:210mm;margin:0 auto}
      .header{text-align:center;border-bottom:3px solid #1a2b5f;padding-bottom:10px;margin-bottom:14px}
      .header-brasao{width:60px;height:auto;display:block;margin:0 auto 5px}
      .header-rep{font-size:8pt;line-height:1.6;margin:0;color:#555}
      .school-name{font-size:12pt;font-weight:700;color:#1a2b5f;margin-top:4px}
      .doc-title{text-align:center;margin-top:6px}
      .doc-label{font-size:6pt;letter-spacing:2px;color:#6b7280;text-transform:uppercase}
      .doc-main{font-size:12pt;font-weight:800;color:#1a2b5f;margin:2px 0}
      .doc-period{font-size:9pt;color:#6b7280}
      .info-box{background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:9px 12px;margin-bottom:12px}
      .info-title{font-size:7pt;font-weight:700;color:#1a2b5f;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:7px}
      .info-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px}
      .info-label{font-size:6.5pt;color:#9ca3af;text-transform:uppercase;letter-spacing:.5px}
      .info-val{font-size:9pt;font-weight:600;color:#1e293b}
      table{width:100%;border-collapse:collapse;margin-bottom:12px;font-size:8.5pt}
      th{padding:7px 9px;color:#fff;font-size:8pt;text-align:left}
      th.r{text-align:right}
      td{padding:6px 9px;border:1px solid #e2e8f0;font-size:8.5pt}
      td.r{text-align:right;font-weight:600}
      .th-venc{background:#1a2b5f}
      .th-desc{background:#7f1d1d}
      .red{color:#dc2626}
      .liquido{background:#1a2b5f;color:#fff;border-radius:8px;padding:12px 16px;margin-bottom:12px;display:flex;justify-content:space-between;align-items:center}
      .liq-label{font-size:7pt;opacity:.7;letter-spacing:1.5px;text-transform:uppercase}
      .liq-val{font-size:18pt;font-weight:800}
      .liq-right{text-align:right}
      .liq-status{font-size:9pt;font-weight:700}
      .patr{background:#fff5f0;border:1px solid #ffccb0;border-radius:6px;padding:7px 10px;font-size:8pt;color:#c2410c;display:flex;justify-content:space-between}
      .footer-row{display:flex;justify-content:space-between;align-items:flex-end;margin-top:20px;gap:16px}
      .qr-box{display:flex;align-items:center;gap:8px}
      .qr-label{font-size:7pt;color:#9ca3af;line-height:1.4}
      .sigs{flex:1;display:flex;justify-content:space-around}
      .sig{text-align:center}
      .sig-line{border-top:1px solid #374151;margin:30px 8px 4px;width:110px}
      .sig-label{font-size:7pt;color:#6b7280}
      .doc-footer{text-align:center;font-size:6.5pt;color:#9ca3af;margin-top:14px;border-top:1px dashed #e5e7eb;padding-top:6px}
      @media print{body{padding:0}}
    </style>
    </head><body>
    <div class="header">
      <img class="header-brasao" src="/angola-brasao.png" alt="Insígnia da República de Angola" onerror="this.style.display='none'"/>
      <p class="header-rep">REPÚBLICA DE ANGOLA</p>
      <p class="header-rep">MINISTÉRIO DA EDUCAÇÃO</p>
      <p class="header-rep">ENSINO GERAL</p>
      <div class="school-name">${config.nomeEscola}</div>
      <div class="doc-title">
        <div class="doc-main">RECIBO DE VENCIMENTO</div>
        <div class="doc-period">${mesAno}</div>
        <div style="font-size:7pt;color:#9ca3af;margin-top:2px">Ref: ${docRef}</div>
      </div>
    </div>

    <div class="info-box">
      <div class="info-title">Dados do Funcionário</div>
      <div class="info-grid">
        <div><div class="info-label">Nome Completo</div><div class="info-val">${item.professorNome}</div></div>
        <div><div class="info-label">Cargo</div><div class="info-val">${item.cargo ?? '—'}</div></div>
        <div><div class="info-label">Categoria</div><div class="info-val">${item.categoria ?? '—'}</div></div>
      </div>
    </div>

    <table>
      <thead><tr>
        <th class="th-venc">VENCIMENTOS</th>
        <th class="th-venc r" style="width:130px">VALOR (Kz)</th>
        <th class="th-desc" style="width:160px">DESCONTOS</th>
        <th class="th-desc r" style="width:130px">VALOR (Kz)</th>
      </tr></thead>
      <tbody>
        <tr><td>Salário Base</td><td class="r">${fmtKz(item.salarioBase)}</td><td>INSS Empregado (${inssEmpPerc}%)</td><td class="r red">${fmtKz(item.inssEmpregado)}</td></tr>
        ${item.subsidioAlimentacao > 0 ? `<tr><td>Subsídio Alimentação</td><td class="r">${fmtKz(item.subsidioAlimentacao)}</td><td>IRT (tabela progressiva)</td><td class="r red">${fmtKz(item.irt)}</td></tr>` : `<tr><td colspan="2"></td><td>IRT (tabela progressiva)</td><td class="r red">${fmtKz(item.irt)}</td></tr>`}
        ${item.subsidioTransporte > 0 ? `<tr><td>Subsídio Transporte</td><td class="r">${fmtKz(item.subsidioTransporte)}</td>${(item.descontoFaltas ?? 0) > 0 ? `<td>Faltas (${item.numFaltasInj ?? 0} inj. + ${item.numMeioDia ?? 0} meio-dia)</td><td class="r red">${fmtKz(item.descontoFaltas)}</td>` : '<td colspan="2"></td>'}</tr>` : ''}
        ${item.subsidioHabitacao > 0 ? `<tr><td>Subsídio Habitação</td><td class="r">${fmtKz(item.subsidioHabitacao)}</td><td colspan="2"></td></tr>` : ''}
        ${(item.remuneracaoTempos ?? 0) > 0 ? `<tr><td>Tempos Lectivos (${item.numTempos ?? 0} unid.)</td><td class="r">${fmtKz(item.remuneracaoTempos)}</td><td colspan="2"></td></tr>` : ''}
        <tr style="background:#eef2ff"><td style="font-weight:700;color:#1a2b5f">TOTAL BRUTO</td><td class="r" style="font-weight:700;color:#1a2b5f">${fmtKz(item.salarioBruto)}</td><td style="font-weight:700;color:#dc2626">TOTAL DESCONTOS</td><td class="r red" style="font-weight:700">${fmtKz(item.totalDescontos)}</td></tr>
      </tbody>
    </table>

    <div class="liquido">
      <div>
        <div class="liq-label">Salário Líquido a Receber</div>
        <div class="liq-val">${fmtKz(item.salarioLiquido)}</div>
      </div>
      <div class="liq-right">
        <div class="liq-label">Estado da Folha</div>
        <div class="liq-status">${folha.status?.toUpperCase() ?? '—'}</div>
        <div style="font-size:7pt;opacity:.6;margin-top:4px">INSS Patronal (${inssPatrPerc}%): ${fmtKz(item.inssPatronal)}</div>
      </div>
    </div>

    <div class="footer-row">
      <div class="qr-box">
        <img src="${qrUrl}" width="90" height="90" alt="QR Code"/>
        <div class="qr-label">Escaneie para<br/>verificar autenticidade<br/><strong>${docRef}</strong></div>
      </div>
      <div class="sigs">
        <div class="sig"><div class="sig-line"></div><div class="sig-label">Responsável RH</div></div>
        <div class="sig"><div class="sig-line"></div><div class="sig-label">Director(a) Geral</div></div>
        <div class="sig"><div class="sig-line"></div><div class="sig-label">Funcionário</div></div>
      </div>
    </div>

    <div class="doc-footer">
      Emitido em ${new Date().toLocaleDateString('pt-AO')} · ${config.nomeEscola} · Documento Oficial
    </div>
    </body></html>`;

    const w = window.open('', '_blank');
    if (w) { w.document.write(html); w.document.close(); setTimeout(() => w.print(), 500); }
  };

  const exportarFolhaPDF = (folha: FolhaSalarios, itens: ItemFolha[]) => {
    if (Platform.OS !== 'web') return;
    const fmtKz = (n: number) => (n ?? 0).toLocaleString('pt-PT', { minimumFractionDigits: 2 }) + ' Kz';
    const mesAno = `${MESES[(folha.mes ?? 1) - 1]} ${folha.ano}`;
    const docRef = `FS-${folha.ano}-${String(folha.mes).padStart(2,'0')}-${folha.id.slice(0,6).toUpperCase()}`;
    const qrData = encodeURIComponent(`${config.nomeEscola}|FOLHA|${docRef}|${mesAno}|${itens.length}func`);
    const qrUrl  = `https://api.qrserver.com/v1/create-qr-code/?size=80x80&data=${qrData}`;
    const dataEmissao = new Date().toLocaleDateString('pt-AO');
    const st = STATUS_LABELS[folha.status] ?? STATUS_LABELS.rascunho;

    const linhas = itens.map((it, i) => `
      <tr style="background:${i%2===0?'#fff':'#f8fafc'}">
        <td>${it.professorNome}</td>
        <td>${it.cargo ?? '—'}</td>
        <td style="text-align:right">${fmtKz(it.salarioBase)}</td>
        <td style="text-align:right">${fmtKz((it.subsidioAlimentacao??0)+(it.subsidioTransporte??0)+(it.subsidioHabitacao??0)+(it.outrosSubsidios??0))}</td>
        <td style="text-align:right;font-weight:600">${fmtKz(it.salarioBruto)}</td>
        <td style="text-align:right;color:#dc2626">${fmtKz(it.inssEmpregado)}</td>
        <td style="text-align:right;color:#dc2626">${fmtKz(it.irt)}</td>
        <td style="text-align:right;color:#dc2626">${fmtKz(it.descontoFaltas??0)}</td>
        <td style="text-align:right;font-weight:700;color:#15803d">${fmtKz(it.salarioLiquido)}</td>
      </tr>`).join('');

    const html = `<!DOCTYPE html><html lang="pt"><head><meta charset="utf-8"/>
    <title>Folha de Salários — ${mesAno}</title>
    <style>
      *{box-sizing:border-box;margin:0;padding:0}
      @page{size:A4 landscape;margin:14mm 12mm 14mm 12mm}
      body{font-family:Arial,Helvetica,sans-serif;font-size:8.5pt;color:#111}
      .hdr{text-align:center;border-bottom:3px solid #1a2b5f;padding-bottom:8px;margin-bottom:12px}
      .hdr-rep{font-size:7.5pt;color:#555;line-height:1.6;margin:0}
      .hdr-escola{font-size:12pt;font-weight:700;color:#1a2b5f;margin-top:3px}
      .doc-title{font-size:14pt;font-weight:800;color:#1a2b5f;margin:4px 0 2px}
      .doc-sub{font-size:9pt;color:#6b7280}
      .status-pill{display:inline-block;padding:2px 10px;border-radius:12px;font-size:8pt;font-weight:700;margin-top:4px;background:${st.color}22;color:${st.color};border:1px solid ${st.color}55}
      .ref{font-size:7pt;color:#9ca3af;margin-top:2px}
      .totais{display:grid;grid-template-columns:repeat(6,1fr);gap:6px;margin-bottom:14px}
      .tot{border:1px solid #e2e8f0;border-radius:6px;padding:7px 10px;text-align:center}
      .tot-lbl{font-size:6.5pt;color:#9ca3af;text-transform:uppercase;letter-spacing:.5px}
      .tot-val{font-size:10pt;font-weight:700;margin-top:2px}
      table{width:100%;border-collapse:collapse;font-size:7.5pt}
      thead tr{background:#1a2b5f}
      thead th{color:#fff;padding:6px 7px;text-align:left;font-size:7pt;white-space:nowrap}
      thead th.r{text-align:right}
      tbody td{padding:5px 7px;border-bottom:1px solid #e5e7eb}
      tfoot tr{background:#1e3a5f}
      tfoot td{color:#fff;padding:6px 7px;font-weight:700;font-size:7.5pt}
      tfoot td.r{text-align:right}
      .footer{display:flex;justify-content:space-between;align-items:flex-end;margin-top:18px}
      .sigs{display:flex;gap:40px}
      .sig{text-align:center}
      .sig-line{border-top:1px solid #374151;width:120px;margin:28px auto 4px}
      .sig-lbl{font-size:7pt;color:#6b7280}
      .qr-box{text-align:center}
      .qr-lbl{font-size:6.5pt;color:#9ca3af;margin-top:3px}
      .doc-footer{text-align:center;font-size:6.5pt;color:#9ca3af;margin-top:10px;border-top:1px dashed #e5e7eb;padding-top:5px}
    </style></head><body>
    <div class="hdr">
      <img src="/angola-brasao.png" width="52" height="auto" style="display:block;margin:0 auto 4px" onerror="this.style.display='none'"/>
      <p class="hdr-rep">REPÚBLICA DE ANGOLA · MINISTÉRIO DA EDUCAÇÃO · ENSINO GERAL</p>
      <div class="hdr-escola">${config.nomeEscola}</div>
      <div class="doc-title">FOLHA DE SALÁRIOS</div>
      <div class="doc-sub">${mesAno}</div>
      <div class="status-pill">${st.label.toUpperCase()}</div>
      <div class="ref">Ref: ${docRef} · Emitido em ${dataEmissao}${folha.processadaPor ? ` · Processado por: ${folha.processadaPor}` : ''}</div>
    </div>

    <div class="totais">
      <div class="tot"><div class="tot-lbl">Funcionários</div><div class="tot-val" style="color:#1a2b5f">${itens.length}</div></div>
      <div class="tot"><div class="tot-lbl">Total Bruto</div><div class="tot-val" style="color:#1a2b5f">${fmtKz(folha.totalBruto)}</div></div>
      <div class="tot"><div class="tot-lbl">INSS Empregado</div><div class="tot-val" style="color:#dc2626">${fmtKz(folha.totalInssEmpregado)}</div></div>
      <div class="tot"><div class="tot-lbl">INSS Patronal</div><div class="tot-val" style="color:#ea580c">${fmtKz(folha.totalInssPatronal)}</div></div>
      <div class="tot"><div class="tot-lbl">IRT Total</div><div class="tot-val" style="color:#dc2626">${fmtKz(folha.totalIrt)}</div></div>
      <div class="tot" style="border-color:#15803d55;background:#f0fdf4"><div class="tot-lbl">Total Líquido</div><div class="tot-val" style="color:#15803d">${fmtKz(folha.totalLiquido)}</div></div>
    </div>

    <table>
      <thead><tr>
        <th style="min-width:130px">Nome do Funcionário</th>
        <th>Cargo</th>
        <th class="r">Sal. Base</th>
        <th class="r">Subsídios</th>
        <th class="r">Bruto</th>
        <th class="r">INSS Emp.</th>
        <th class="r">IRT</th>
        <th class="r">Faltas</th>
        <th class="r">Líquido</th>
      </tr></thead>
      <tbody>${linhas}</tbody>
      <tfoot><tr>
        <td colspan="2">TOTAIS (${itens.length} funcionários)</td>
        <td class="r">${fmtKz(itens.reduce((s,i)=>s+(i.salarioBase??0),0))}</td>
        <td class="r">${fmtKz(itens.reduce((s,i)=>s+(i.subsidioAlimentacao??0)+(i.subsidioTransporte??0)+(i.subsidioHabitacao??0)+(i.outrosSubsidios??0),0))}</td>
        <td class="r">${fmtKz(folha.totalBruto)}</td>
        <td class="r">${fmtKz(folha.totalInssEmpregado)}</td>
        <td class="r">${fmtKz(folha.totalIrt)}</td>
        <td class="r">${fmtKz(itens.reduce((s,i)=>s+(i.descontoFaltas??0),0))}</td>
        <td class="r">${fmtKz(folha.totalLiquido)}</td>
      </tr></tfoot>
    </table>

    <div class="footer">
      <div class="sigs">
        <div class="sig"><div class="sig-line"></div><div class="sig-lbl">Técnico de RH</div></div>
        <div class="sig"><div class="sig-line"></div><div class="sig-lbl">Director(a) Geral</div></div>
        <div class="sig"><div class="sig-line"></div><div class="sig-lbl">Responsável Financeiro</div></div>
      </div>
      <div class="qr-box">
        <img src="${qrUrl}" width="80" height="80"/>
        <div class="qr-lbl">Verificar autenticidade<br/><strong>${docRef}</strong></div>
      </div>
    </div>
    <div class="doc-footer">${config.nomeEscola} · Folha de Salários · ${mesAno} · ${docRef} · Documento Oficial</div>
    </body></html>`;

    const w = window.open('', '_blank');
    if (w) { w.document.write(html); w.document.close(); setTimeout(() => w.print(), 500); }
  };

  const eliminarFolha = async (id: string) => {
    try {
      await api.delete(`/api/folhas-salarios/${id}`);
      showToast('Folha eliminada', 'success');
      if (selectedFolha?.id === id) { setSelectedFolha(null); setTab('folhas'); }
      await loadData();
    } catch { showToast('Erro ao eliminar folha', 'error'); }
  };

  // ─── Prof Edit ──────────────────────────────────────────────────────────────
  const openProfEdit = (p: ProfessorSalario) => {
    setEditingProf(p);
    setProfForm({
      cargo: p.cargo ?? 'Professor',
      categoria: p.categoria ?? '',
      salarioBase: String(p.salarioBase ?? 0),
      subsidioAlimentacao: String(p.subsidioAlimentacao ?? 0),
      subsidioTransporte: String(p.subsidioTransporte ?? 0),
      subsidioHabitacao: String(p.subsidioHabitacao ?? 0),
      dataContratacao: p.dataContratacao ?? '',
      tipoContrato: p.tipoContrato ?? 'efectivo',
      valorPorTempoLectivo: String(p.valorPorTempoLectivo ?? 0),
      temposSemanais: String(p.temposSemanais ?? 0),
    });
    setShowProfModal(true);
  };

  const guardarProf = async () => {
    if (!editingProf) return;
    try {
      await api.put(`/api/professores/${editingProf.id}`, {
        cargo: profForm.cargo,
        categoria: profForm.categoria,
        salarioBase: Number(profForm.salarioBase),
        subsidioAlimentacao: Number(profForm.subsidioAlimentacao),
        subsidioTransporte: Number(profForm.subsidioTransporte),
        subsidioHabitacao: Number(profForm.subsidioHabitacao),
        dataContratacao: profForm.dataContratacao,
        tipoContrato: profForm.tipoContrato,
        valorPorTempoLectivo: Number(profForm.valorPorTempoLectivo),
        temposSemanais: Number(profForm.temposSemanais),
      });
      showToast('Dados salariais atualizados', 'success');
      setShowProfModal(false);
      setEditingProf(null);
      await loadData();
    } catch { showToast('Erro ao guardar dados salariais', 'error'); }
  };

  const filteredProfs = profs.filter(p => {
    const q = profSearch.toLowerCase();
    return `${p.nome} ${p.apelido}`.toLowerCase().includes(q) ||
      (p.cargo ?? '').toLowerCase().includes(q);
  });

  // Reset page when search changes
  React.useEffect(() => { setProfPagina(1); }, [profSearch]);

  useEnterToSave(criarFolha, showNovaFolha);
  useEnterToSave(guardarProf, showProfModal);

  // ─── Render Helpers ─────────────────────────────────────────────────────────
  const renderFolhaRow = (f: FolhaSalarios) => {
    const st = STATUS_LABELS[f.status] ?? STATUS_LABELS.rascunho;
    return (
      <TouchableOpacity key={f.id} style={styles.row} onPress={() => openFolha(f)} activeOpacity={0.8}>
        <View style={styles.rowLeft}>
          <Text style={styles.rowTitle}>{MESES[f.mes - 1]} {f.ano}</Text>
          {f.descricao ? <Text style={styles.rowSub}>{f.descricao}</Text> : null}
          <Text style={styles.rowMeta}>{f.numFuncionarios} funcionários · {fmt(f.totalLiquido)} líquido</Text>
        </View>
        <View style={styles.rowRight}>
          <View style={[styles.badge, { backgroundColor: st.color + '28', borderColor: st.color }]}>
            <Text style={[styles.badgeText, { color: st.color }]}>{st.label}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={Colors.textSecondary ?? '#aaa'} />
        </View>
      </TouchableOpacity>
    );
  };

  const renderProfRow = (p: ProfessorSalario) => (
    <TouchableOpacity key={p.id} style={styles.row} onPress={() => openProfEdit(p)} activeOpacity={0.8}>
      <View style={styles.rowLeft}>
        <Text style={styles.rowTitle}>{p.nome} {p.apelido}</Text>
        <Text style={styles.rowSub}>{p.cargo ?? 'Professor'} {p.categoria ? `· ${p.categoria}` : ''}</Text>
        <Text style={styles.rowMeta}>
          Base: {fmt(p.salarioBase ?? 0)}
          {p.subsidioAlimentacao ? ` · Alim.: ${fmt(p.subsidioAlimentacao)}` : ''}
          {p.subsidioTransporte ? ` · Transp.: ${fmt(p.subsidioTransporte)}` : ''}
        </Text>
      </View>
      <View style={styles.rowRight}>
        {!p.salarioBase || p.salarioBase === 0 ? (
          <View style={[styles.badge, { backgroundColor: '#FF714128', borderColor: '#FF7141' }]}>
            <Text style={[styles.badgeText, { color: '#FF7141' }]}>Sem salário</Text>
          </View>
        ) : (
          <View style={[styles.badge, { backgroundColor: '#66BB6A28', borderColor: '#66BB6A' }]}>
            <Text style={[styles.badgeText, { color: '#66BB6A' }]}>{fmt(p.salarioBase)}</Text>
          </View>
        )}
        <Ionicons name="pencil" size={16} color={Colors.textSecondary ?? '#aaa'} />
      </View>
    </TouchableOpacity>
  );

  const renderItemRow = (item: ItemFolha) => (
    <TouchableOpacity key={item.id} style={styles.itemRow} onPress={() => setReciboItem(item)} activeOpacity={0.8}>
      <View style={styles.itemHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.rowTitle}>{item.professorNome}</Text>
          <Text style={styles.rowSub}>
            {item.cargo}{item.categoria ? ` · ${item.categoria}` : ''}
            {item.seccao ? ` · ${item.seccao}` : ''}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 4 }}>
          {item.numFaltasInj > 0 && (
            <View style={[styles.badge, { backgroundColor: '#EF535028', borderColor: '#EF5350' }]}>
              <Ionicons name="warning-outline" size={11} color="#EF5350" />
              <Text style={[styles.badgeText, { color: '#EF5350', marginLeft: 3 }]}>{item.numFaltasInj}F</Text>
            </View>
          )}
          {item.numTempos > 0 && (
            <View style={[styles.badge, { backgroundColor: '#FF714128', borderColor: '#FF7141' }]}>
              <Ionicons name="time-outline" size={11} color="#FF7141" />
              <Text style={[styles.badgeText, { color: '#FF7141', marginLeft: 3 }]}>{item.numTempos}T</Text>
            </View>
          )}
          <View style={[styles.badge, { backgroundColor: '#5E6AD228', borderColor: '#5E6AD2' }]}>
            <Ionicons name="document-text-outline" size={12} color="#5E6AD2" />
            <Text style={[styles.badgeText, { color: '#5E6AD2', marginLeft: 4 }]}>Recibo</Text>
          </View>
        </View>
      </View>
      <View style={styles.itemCols}>
        <View style={styles.itemCol}>
          <Text style={styles.itemColLabel}>Bruto</Text>
          <Text style={styles.itemColVal}>{fmt(item.salarioBruto)}</Text>
        </View>
        <View style={styles.itemCol}>
          <Text style={[styles.itemColLabel, { color: '#EF5350' }]}>INSS</Text>
          <Text style={[styles.itemColVal, { color: '#EF5350' }]}>{fmt(item.inssEmpregado)}</Text>
        </View>
        <View style={styles.itemCol}>
          <Text style={[styles.itemColLabel, { color: '#EF5350' }]}>IRT</Text>
          <Text style={[styles.itemColVal, { color: '#EF5350' }]}>{fmt(item.irt)}</Text>
        </View>
        {(item.descontoFaltas ?? 0) > 0 && (
          <View style={styles.itemCol}>
            <Text style={[styles.itemColLabel, { color: '#EF5350' }]}>Faltas</Text>
            <Text style={[styles.itemColVal, { color: '#EF5350' }]}>-{fmt(item.descontoFaltas)}</Text>
          </View>
        )}
        <View style={styles.itemCol}>
          <Text style={[styles.itemColLabel, { color: '#66BB6A' }]}>Líquido</Text>
          <Text style={[styles.itemColVal, { color: '#66BB6A', fontWeight: '700' }]}>{fmt(item.salarioLiquido)}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );

  // ─── Tabs ──────────────────────────────────────────────────────────────────
  const TABS: Array<{ key: typeof tab; label: string; icon: string }> = [
    { key: 'painel', label: 'Painel', icon: 'home-outline' },
    { key: 'folhas', label: 'Folhas', icon: 'receipt-outline' },
    { key: 'funcionarios', label: 'Funcionários', icon: 'people-outline' },
  ];

  return (
    <View style={styles.root}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <View>
          <Text style={styles.headerTitle}>
            {tab === 'detalhe' && selectedFolha
              ? `${MESES[selectedFolha.mes - 1]} ${selectedFolha.ano}`
              : 'Folha de Salários'}
          </Text>
          <Text style={styles.headerSub}>Processamento Salarial · Angola</Text>
        </View>
        {tab === 'folhas' && (
          <TouchableOpacity style={styles.addBtn} onPress={() => setShowNovaFolha(true)}>
            <Ionicons name="add" size={18} color="#fff" />
            <Text style={styles.addBtnTxt}>Nova Folha</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Tab Bar — hidden on detalhe */}
      {tab !== 'detalhe' && (
        <HScrollTabBar style={styles.tabBar} contentContainerStyle={{ flexDirection: 'row', flex: 1 }} keyboardShouldPersistTaps="handled">
          {TABS.map(t => (
            <TouchableOpacity key={t.key} style={[styles.tabItem, tab === t.key && styles.tabItemActive]}
              onPress={() => setTab(t.key)}>
              <Ionicons name={t.icon as never} size={18} color={tab === t.key ? '#fff' : Colors.textSecondary ?? '#aaa'} />
              <Text style={[styles.tabLabel, tab === t.key && styles.tabLabelActive]}>{t.label}</Text>
            </TouchableOpacity>
          ))}
        </HScrollTabBar>
      )}

      {loading && !refreshing ? (
        <View style={{ padding: 12, width: '100%' }}>
          <SkeletonList rows={6} withAvatar />
          <Text style={styles.loadingText}>A carregar dados...</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(); }} tintColor={Colors.primary} />}
        >
          {/* ── PAINEL ── */}
          {tab === 'painel' && (
            <>
              <Text style={styles.sectionTitle}>Resumo Salarial</Text>
              <View style={styles.kpiGrid}>
                <KpiTile
                  icon={<MaterialCommunityIcons name="account-group" size={24} color={Colors.primary} />}
                  label="Funcionários c/ Salário"
                  value={String(profsComSalario.length)}
                  sub={`de ${profs.length} docentes`}
                  color={Colors.primary}
                />
                <KpiTile
                  icon={<FontAwesome5 name="money-bill-wave" size={20} color="#66BB6A" />}
                  label="Massa Salarial Base"
                  value={fmt(totalMassaSalarial)}
                  sub="soma dos salários base"
                  color="#66BB6A"
                />
                <KpiTile
                  icon={<MaterialCommunityIcons name="calculator" size={24} color="#FF7141" />}
                  label="INSS Patronal Total"
                  value={fmt(totalMassaSalarial * (inssPatrPerc / 100))}
                  sub={`estimativa (${inssPatrPerc}% base)`}
                  color="#FF7141"
                />
                <KpiTile
                  icon={<MaterialCommunityIcons name="file-document" size={24} color={Colors.accent ?? '#4FC3F7'} />}
                  label="Folhas Processadas"
                  value={String(folhas.filter(f => f.status !== 'rascunho').length)}
                  sub={`de ${folhas.length} total`}
                  color={Colors.accent ?? '#4FC3F7'}
                />
              </View>

              {/* ── Gráficos Salariais ─────────────────────────────────────── */}
              {(latestFolha || totalMassaSalarial > 0) && (
                <>
                  <Text style={styles.sectionTitle}>Análise Visual</Text>

                  {/* DonutChart: Distribuição da massa salarial */}
                  {totalMassaSalarial > 0 && (() => {
                    const inssPatr = totalMassaSalarial * (inssPatrPerc / 100);
                    const inssEmp = totalMassaSalarial * (inssEmpPerc / 100);
                    const estIRT = Math.max(0, totalMassaSalarial * 0.05);
                    const liquido = Math.max(0, totalMassaSalarial - inssEmp - estIRT);
                    const donutData = [
                      { label: 'Líquido', value: Math.round(liquido), color: '#66BB6A' },
                      { label: 'INSS Emp.', value: Math.round(inssEmp), color: '#FFA726' },
                      { label: 'IRT (est.)', value: Math.round(estIRT), color: '#EF5350' },
                    ].filter(d => d.value > 0);
                    const fmtK = (v: number) => v >= 1000000
                      ? `${(v / 1000000).toFixed(1)}M`
                      : v >= 1000 ? `${(v / 1000).toFixed(0)}K` : String(v);
                    return donutData.length > 0 ? (
                      <View style={{ backgroundColor: Colors.surface, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: Colors.border }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                          <MaterialCommunityIcons name="chart-donut" size={18} color="#66BB6A" />
                          <Text style={{ color: Colors.text ?? '#fff', fontWeight: '700', fontSize: 13 }}>
                            Distribuição da Massa Salarial
                          </Text>
                        </View>
                        <View style={{ alignItems: 'center' }}>
                          <DonutChart
                            data={donutData}
                            size={160}
                            thickness={28}
                            centerLabel={fmtK(totalMassaSalarial)}
                            centerSub="Kz base"
                          />
                        </View>
                      </View>
                    ) : null;
                  })()}

                  {/* BarChart: Histórico de folhas (últimas 6) */}
                  {folhas.length > 0 && (() => {
                    const mesesAbrev = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
                    const last6 = [...folhas].reverse().slice(-6);
                    const barData = last6.map(f => ({
                      label: mesesAbrev[(f.mes - 1)] ?? `M${f.mes}`,
                      value: Math.round(f.totalLiquido || 0),
                      color: f.status === 'paga' ? '#66BB6A' : f.status === 'aprovada' ? '#4FC3F7' : '#FFA726',
                    }));
                    return barData.length >= 1 ? (
                      <View style={{ backgroundColor: Colors.surface, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: Colors.border }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                          <MaterialCommunityIcons name="chart-bar" size={18} color="#4FC3F7" />
                          <Text style={{ color: Colors.text ?? '#fff', fontWeight: '700', fontSize: 13 }}>
                            Líquido por Folha (últimas {last6.length})
                          </Text>
                        </View>
                        <Text style={{ color: Colors.textMuted, fontSize: 10, marginBottom: 8 }}>
                          Verde = Paga · Azul = Aprovada · Laranja = Em processamento
                        </Text>
                        <View style={{ alignItems: 'center' }}>
                          <BarChart data={barData} height={160} width={320} />
                        </View>
                      </View>
                    ) : null;
                  })()}
                </>
              )}

              {profsComSalario.length > 0 && (
                <>
                  <Text style={styles.sectionTitle}>Simulação de Salários — Mês Corrente</Text>
                  <Card>
                    <SimuladorSalarial profs={profsComSalario} inssEmpPerc={inssEmpPerc} inssPatrPerc={inssPatrPerc} irtTabela={irtTabela} />
                  </Card>
                </>
              )}

              {latestFolha && (
                <>
                  <Text style={styles.sectionTitle}>Última Folha</Text>
                  <Card>
                    <View style={styles.cardRow}>
                      <Text style={styles.cardLabel}>Período</Text>
                      <Text style={styles.cardValue}>{MESES[latestFolha.mes - 1]} {latestFolha.ano}</Text>
                    </View>
                    <View style={styles.cardRow}>
                      <Text style={styles.cardLabel}>Estado</Text>
                      <View style={[styles.badge, {
                        backgroundColor: (STATUS_LABELS[latestFolha.status]?.color ?? '#aaa') + '28',
                        borderColor: STATUS_LABELS[latestFolha.status]?.color ?? '#aaa',
                      }]}>
                        <Text style={[styles.badgeText, { color: STATUS_LABELS[latestFolha.status]?.color ?? '#aaa' }]}>
                          {STATUS_LABELS[latestFolha.status]?.label ?? latestFolha.status}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.cardRow}>
                      <Text style={styles.cardLabel}>Total Bruto</Text>
                      <Text style={styles.cardValue}>{fmt(latestFolha.totalBruto)}</Text>
                    </View>
                    <View style={styles.cardRow}>
                      <Text style={styles.cardLabel}>INSS Empregado</Text>
                      <Text style={[styles.cardValue, { color: '#EF5350' }]}>{fmt(latestFolha.totalInssEmpregado)}</Text>
                    </View>
                    <View style={styles.cardRow}>
                      <Text style={styles.cardLabel}>INSS Patronal</Text>
                      <Text style={[styles.cardValue, { color: '#EF5350' }]}>{fmt(latestFolha.totalInssPatronal)}</Text>
                    </View>
                    <View style={styles.cardRow}>
                      <Text style={styles.cardLabel}>IRT Total</Text>
                      <Text style={[styles.cardValue, { color: '#EF5350' }]}>{fmt(latestFolha.totalIrt)}</Text>
                    </View>
                    <View style={[styles.cardRow, styles.cardRowLast]}>
                      <Text style={[styles.cardLabel, { fontWeight: '700', color: '#fff' }]}>Total Líquido</Text>
                      <Text style={[styles.cardValue, { color: '#66BB6A', fontWeight: '700', fontSize: 16 }]}>{fmt(latestFolha.totalLiquido)}</Text>
                    </View>
                    <TouchableOpacity style={styles.viewBtn} onPress={() => openFolha(latestFolha)}>
                      <Text style={styles.viewBtnText}>Ver detalhes</Text>
                      <Ionicons name="arrow-forward" size={16} color={Colors.primary} />
                    </TouchableOpacity>
                  </Card>
                </>
              )}

              <Text style={styles.sectionTitle}>Tabela IRT Angola (2024)</Text>
              <Card>
                {[
                  ['0 – 70.000 Kz', '0%', '0 Kz'],
                  ['70.001 – 100.000 Kz', '10%', 'sobre excedente a 70.000'],
                  ['100.001 – 150.000 Kz', '13%', '+ 3.000 Kz'],
                  ['150.001 – 200.000 Kz', '16%', '+ 9.500 Kz'],
                  ['200.001 – 300.000 Kz', '18%', '+ 17.500 Kz'],
                  ['300.001 – 500.000 Kz', '19%', '+ 35.500 Kz'],
                  ['500.001 – 1.000.000 Kz', '20%', '+ 73.500 Kz'],
                  ['> 1.000.000 Kz', '25%', '+ 173.500 Kz'],
                ].map(([escalao, taxa, parcela], i) => (
                  <View key={i} style={[styles.irtRow, i % 2 === 0 && styles.irtRowAlt]}>
                    <Text style={styles.irtEscalao}>{escalao}</Text>
                    <Text style={styles.irtTaxa}>{taxa}</Text>
                    <Text style={styles.irtParcela}>{parcela}</Text>
                  </View>
                ))}
                <View style={styles.irtNote}>
                  <Ionicons name="information-circle-outline" size={14} color={Colors.textSecondary ?? '#aaa'} />
                  <Text style={styles.irtNoteText}>{`INSS: ${inssEmpPerc}% (empregado) + ${inssPatrPerc}% (patronal) sobre salário base`}</Text>
                </View>
              </Card>
            </>
          )}

          {/* ── FOLHAS ── */}
          {tab === 'folhas' && (
            <>
              {folhas.length === 0 ? (
                <Card style={styles.emptyCard}>
                  <MaterialCommunityIcons name="file-document-outline" size={48} color={Colors.textSecondary ?? '#aaa'} />
                  <Text style={styles.emptyText}>Nenhuma folha de salários criada</Text>
                  <TouchableOpacity style={styles.emptyBtn} onPress={() => setShowNovaFolha(true)}>
                    <Text style={styles.emptyBtnText}>Criar primeira folha</Text>
                  </TouchableOpacity>
                </Card>
              ) : (
                <Card>{folhas.map(renderFolhaRow)}</Card>
              )}
            </>
          )}

          {/* ── FUNCIONÁRIOS ── */}
          {tab === 'funcionarios' && (
            <>
              <View style={styles.searchRow}>
                <StableSearchInput
                  value={profSearch}
                  onChangeText={setProfSearch}
                  inputStyle={styles.searchInput}
                  placeholder="Pesquisar funcionário..."
                  iconColor={Colors.textSecondary ?? '#aaa'}
                />
              </View>
              {profsComSalario.length < profs.filter(p => p.ativo).length && (
                <View style={styles.alertBox}>
                  <Ionicons name="warning-outline" size={16} color="#FF7141" />
                  <Text style={styles.alertText}>
                    {profs.filter(p => p.ativo && (!p.salarioBase || p.salarioBase === 0)).length} funcionário(s) sem salário base definido
                  </Text>
                </View>
              )}
              {(() => {
                const totalPaginas = Math.max(1, Math.ceil(filteredProfs.length / PROF_PAGE_SIZE));
                const paginaActual = Math.min(profPagina, totalPaginas);
                const fatia = filteredProfs.slice((paginaActual - 1) * PROF_PAGE_SIZE, paginaActual * PROF_PAGE_SIZE);
                function irPagina(p: number) { setProfPagina(Math.max(1, Math.min(p, totalPaginas))); }
                return (
                  <>
                    <Card>{fatia.map(renderProfRow)}</Card>
                    {totalPaginas > 1 && (
                      <View style={styles.paginacao}>
                        <TouchableOpacity style={[styles.pgBtn, paginaActual === 1 && styles.pgBtnDisabled]} onPress={() => irPagina(paginaActual - 1)} disabled={paginaActual === 1}>
                          <Ionicons name="chevron-back" size={14} color={paginaActual === 1 ? '#555' : '#fff'} />
                        </TouchableOpacity>
                        {Array.from({ length: totalPaginas }, (_, i) => i + 1).map(p => {
                          const isActive = p === paginaActual;
                          const show = p === 1 || p === totalPaginas || Math.abs(p - paginaActual) <= 1;
                          const showDotsBefore = p === paginaActual - 2 && paginaActual - 2 > 1;
                          const showDotsAfter  = p === paginaActual + 2 && paginaActual + 2 < totalPaginas;
                          if (!show) return null;
                          return (
                            <React.Fragment key={p}>
                              {showDotsBefore && <Text style={styles.pgEllipsis}>…</Text>}
                              <TouchableOpacity style={[styles.pgBtn, isActive && styles.pgBtnActive]} onPress={() => irPagina(p)}>
                                <Text style={[styles.pgBtnText, isActive && styles.pgBtnTextActive]}>{p}</Text>
                              </TouchableOpacity>
                              {showDotsAfter && <Text style={styles.pgEllipsis}>…</Text>}
                            </React.Fragment>
                          );
                        })}
                        <TouchableOpacity style={[styles.pgBtn, paginaActual === totalPaginas && styles.pgBtnDisabled]} onPress={() => irPagina(paginaActual + 1)} disabled={paginaActual === totalPaginas}>
                          <Ionicons name="chevron-forward" size={14} color={paginaActual === totalPaginas ? '#555' : '#fff'} />
                        </TouchableOpacity>
                        <Text style={styles.pgInfo}>Página {paginaActual} de {totalPaginas}</Text>
                      </View>
                    )}
                  </>
                );
              })()}
            </>
          )}

          {/* ── DETALHE ── */}
          {tab === 'detalhe' && selectedFolha && (
            <>
              <TouchableOpacity style={styles.backLink} onPress={() => setTab('folhas')}>
                <Ionicons name="arrow-back" size={16} color={Colors.primary} />
                <Text style={styles.backLinkText}>Voltar às folhas</Text>
              </TouchableOpacity>

              {/* Summary card */}
              <Card>
                <View style={styles.detalheTitleRow}>
                  <Text style={styles.detalheTitle}>{MESES[selectedFolha.mes - 1]} {selectedFolha.ano}</Text>
                  <View style={[styles.badge, {
                    backgroundColor: (STATUS_LABELS[selectedFolha.status]?.color ?? '#aaa') + '28',
                    borderColor: STATUS_LABELS[selectedFolha.status]?.color ?? '#aaa',
                  }]}>
                    <Text style={[styles.badgeText, { color: STATUS_LABELS[selectedFolha.status]?.color ?? '#aaa' }]}>
                      {STATUS_LABELS[selectedFolha.status]?.label ?? selectedFolha.status}
                    </Text>
                  </View>
                </View>

                <View style={styles.summaryGrid}>
                  <View style={styles.summaryItem}>
                    <Text style={styles.summaryLabel}>Funcionários</Text>
                    <Text style={styles.summaryVal}>{selectedFolha.numFuncionarios}</Text>
                  </View>
                  <View style={styles.summaryItem}>
                    <Text style={styles.summaryLabel}>Total Bruto</Text>
                    <Text style={styles.summaryVal}>{fmt(selectedFolha.totalBruto)}</Text>
                  </View>
                  <View style={styles.summaryItem}>
                    <Text style={[styles.summaryLabel, { color: '#EF5350' }]}>INSS Emp.</Text>
                    <Text style={[styles.summaryVal, { color: '#EF5350' }]}>{fmt(selectedFolha.totalInssEmpregado)}</Text>
                  </View>
                  <View style={styles.summaryItem}>
                    <Text style={[styles.summaryLabel, { color: '#EF5350' }]}>INSS Patr.</Text>
                    <Text style={[styles.summaryVal, { color: '#EF5350' }]}>{fmt(selectedFolha.totalInssPatronal)}</Text>
                  </View>
                  <View style={styles.summaryItem}>
                    <Text style={[styles.summaryLabel, { color: '#EF5350' }]}>IRT Total</Text>
                    <Text style={[styles.summaryVal, { color: '#EF5350' }]}>{fmt(selectedFolha.totalIrt)}</Text>
                  </View>
                  <View style={styles.summaryItem}>
                    <Text style={[styles.summaryLabel, { color: '#66BB6A' }]}>Total Líquido</Text>
                    <Text style={[styles.summaryVal, { color: '#66BB6A', fontWeight: '700' }]}>{fmt(selectedFolha.totalLiquido)}</Text>
                  </View>
                </View>

                {selectedFolha.processadaPor && (
                  <Text style={styles.processadaPor}>Processada por: {selectedFolha.processadaPor}</Text>
                )}
              </Card>

              {/* Action buttons */}
              <View style={styles.actionRow}>
                <TouchableOpacity style={styles.actionBtn} onPress={() => setShowProcessar(true)}>
                  <MaterialCommunityIcons name="cog-sync" size={18} color="#fff" />
                  <Text style={styles.actionBtnText}>Processar</Text>
                </TouchableOpacity>
                {selectedFolha.status === 'processada' && (
                  <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#66BB6A' }]}
                    onPress={() => mudarStatus(selectedFolha, 'aprovada')}>
                    <Ionicons name="checkmark-circle" size={18} color="#fff" />
                    <Text style={styles.actionBtnText}>Aprovar</Text>
                  </TouchableOpacity>
                )}
                {selectedFolha.status === 'aprovada' && (
                  <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#AB47BC' }]}
                    onPress={() => mudarStatus(selectedFolha, 'paga')}>
                    <MaterialCommunityIcons name="cash-check" size={18} color="#fff" />
                    <Text style={styles.actionBtnText}>Marcar Paga</Text>
                  </TouchableOpacity>
                )}
                {itensFolha.length > 0 && (
                  <TouchableOpacity
                    style={[styles.actionBtn, { backgroundColor: '#1a2b5f' }]}
                    onPress={() => exportarFolhaPDF(selectedFolha, itensFolha)}
                  >
                    <MaterialCommunityIcons name="file-pdf-box" size={18} color="#fff" />
                    <Text style={styles.actionBtnText}>Exportar PDF</Text>
                  </TouchableOpacity>
                )}
                {selectedFolha.status === 'rascunho' && (
                  <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#EF5350' }]}
                    onPress={() => {
                      webAlert('Eliminar Folha', 'Tem a certeza que pretende eliminar esta folha?', [
                        { text: 'Cancelar', style: 'cancel' },
                        { text: 'Eliminar', style: 'destructive', onPress: () => eliminarFolha(selectedFolha.id) },
                      ]);
                    }}>
                    <Ionicons name="trash" size={18} color="#fff" />
                    <Text style={styles.actionBtnText}>Eliminar</Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* Items */}
              {itensFolha.length > 0 ? (
                <>
                  <Text style={styles.sectionTitle}>Detalhes por Funcionário</Text>
                  <Card>{itensFolha.map(renderItemRow)}</Card>
                </>
              ) : (
                <Card style={styles.emptyCard}>
                  <MaterialCommunityIcons name="account-clock" size={40} color={Colors.textSecondary ?? '#aaa'} />
                  <Text style={styles.emptyText}>Folha ainda não foi processada</Text>
                  <Text style={styles.emptySub}>Prima "Processar" para calcular os salários</Text>
                </Card>
              )}
            </>
          )}
        </ScrollView>
      )}

      {/* ── Modal: Nova Folha ── */}
      <Modal visible={showNovaFolha} transparent animationType="fade" onRequestClose={() => setShowNovaFolha(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Nova Folha de Salários</Text>

            <Text style={styles.fieldLabel}>Mês</Text>
            <View style={styles.monthGrid}>
              {MESES.map((m, i) => (
                <TouchableOpacity key={i} style={[styles.monthBtn, newMes === i + 1 && styles.monthBtnActive]}
                  onPress={() => setNewMes(i + 1)}>
                  <Text style={[styles.monthBtnText, newMes === i + 1 && styles.monthBtnTextActive]}>{m.slice(0, 3)}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.fieldLabel}>Ano</Text>
            <View style={styles.yearRow}>
              {[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map(y => (
                <TouchableOpacity key={y} style={[styles.yearBtn, newAno === y && styles.yearBtnActive]}
                  onPress={() => setNewAno(y)}>
                  <Text style={[styles.yearBtnText, newAno === y && styles.yearBtnTextActive]}>{y}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.fieldLabel}>Descrição (opcional)</Text>
            <TextInput
              style={styles.textInput}
              value={newDescricao}
              onChangeText={setNewDescricao}
              placeholder="Ex: Salários referentes a Janeiro 2025"
              placeholderTextColor={Colors.textSecondary ?? '#aaa'}
            />

            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.modalBtnCancel} onPress={() => setShowNovaFolha(false)}>
                <Text style={styles.modalBtnCancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalBtnPrimary} onPress={criarFolha}>
                <Text style={styles.modalBtnPrimaryText}>Criar Folha</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
              </KeyboardAvoidingView>
</Modal>

      {/* ── Modal: Processar ── */}
      <Modal visible={showProcessar} transparent animationType="fade" onRequestClose={() => setShowProcessar(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <MaterialCommunityIcons name="cog-sync" size={40} color={Colors.primary} style={{ alignSelf: 'center', marginBottom: 12 }} />
            <Text style={styles.modalTitle}>Processar Folha</Text>
            <Text style={styles.modalBody}>
              Serão calculados os salários de {profsComSalario.length} funcionário(s) com salário base definido.{'\n\n'}
              O cálculo inclui:{'\n'}
              · INSS Empregado: 3% do salário base{'\n'}
              · INSS Patronal: 8% do salário base{'\n'}
              · IRT: tabela progressiva Angola 2024{'\n\n'}
              Subsídios (alimentação, transporte, habitação) são adicionados ao bruto mas não incluídos na base tributável.
            </Text>
            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.modalBtnCancel} onPress={() => setShowProcessar(false)}>
                <Text style={styles.modalBtnCancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalBtnPrimary} onPress={processarFolha}>
                <Text style={styles.modalBtnPrimaryText}>Processar Agora</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
              </KeyboardAvoidingView>
</Modal>

      {/* ── Modal: Editar Dados Salariais Prof ── */}
      <Modal visible={showProfModal} transparent animationType="slide" onRequestClose={() => setShowProfModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={styles.modalOverlay}>
          <ScrollView contentContainerStyle={styles.modalScrollContent}>
            <View style={styles.modalBox}>
              <Text style={styles.modalTitle}>Dados Salariais</Text>
              {editingProf && (
                <Text style={styles.modalSubTitle}>{editingProf.nome} {editingProf.apelido}</Text>
              )}

              <Text style={styles.fieldLabel}>Cargo</Text>
              <TextInput style={styles.textInput} placeholderTextColor={Colors.textMuted} value={profForm.cargo}
                onChangeText={v => setProfForm(f => ({ ...f, cargo: v }))}
                placeholderTextColor={Colors.textSecondary ?? '#aaa'} placeholder="Ex: Professor" returnKeyType="done" onSubmitEditing={guardarProf} />

              <Text style={styles.fieldLabel}>Categoria</Text>
              <TextInput style={styles.textInput} placeholderTextColor={Colors.textMuted} value={profForm.categoria}
                onChangeText={v => setProfForm(f => ({ ...f, categoria: v }))}
                placeholderTextColor={Colors.textSecondary ?? '#aaa'} placeholder="Ex: Técnico Superior" returnKeyType="done" onSubmitEditing={guardarProf} />

              <Text style={styles.fieldLabel}>Salário Base (Kz)</Text>
              <TextInput style={styles.textInput} placeholderTextColor={Colors.textMuted} value={profForm.salarioBase}
                onChangeText={v => setProfForm(f => ({ ...f, salarioBase: v }))}
                keyboardType="numeric" placeholderTextColor={Colors.textSecondary ?? '#aaa'} placeholder="0.00" returnKeyType="done" onSubmitEditing={guardarProf} />

              <Text style={styles.fieldLabel}>Subsídio de Alimentação (Kz)</Text>
              <TextInput style={styles.textInput} placeholderTextColor={Colors.textMuted} value={profForm.subsidioAlimentacao}
                onChangeText={v => setProfForm(f => ({ ...f, subsidioAlimentacao: v }))}
                keyboardType="numeric" placeholderTextColor={Colors.textSecondary ?? '#aaa'} placeholder="0.00" returnKeyType="done" onSubmitEditing={guardarProf} />

              <Text style={styles.fieldLabel}>Subsídio de Transporte (Kz)</Text>
              <TextInput style={styles.textInput} placeholderTextColor={Colors.textMuted} value={profForm.subsidioTransporte}
                onChangeText={v => setProfForm(f => ({ ...f, subsidioTransporte: v }))}
                keyboardType="numeric" placeholderTextColor={Colors.textSecondary ?? '#aaa'} placeholder="0.00" returnKeyType="done" onSubmitEditing={guardarProf} />

              <Text style={styles.fieldLabel}>Subsídio de Habitação (Kz)</Text>
              <TextInput style={styles.textInput} placeholderTextColor={Colors.textMuted} value={profForm.subsidioHabitacao}
                onChangeText={v => setProfForm(f => ({ ...f, subsidioHabitacao: v }))}
                keyboardType="numeric" placeholderTextColor={Colors.textSecondary ?? '#aaa'} placeholder="0.00" returnKeyType="done" onSubmitEditing={guardarProf} />

              <Text style={styles.fieldLabel}>Data de Contratação</Text>
              <DateInput style={styles.textInput} value={profForm.dataContratacao}
                onChangeText={v => setProfForm(f => ({ ...f, dataContratacao: v }))}
                placeholderTextColor={Colors.textSecondary ?? '#aaa'} />

              <Text style={styles.fieldLabel}>Tipo de Contrato</Text>
              <View style={styles.contractRow}>
                {CONTRATOS.map(c => (
                  <TouchableOpacity key={c}
                    style={[styles.contractBtn, profForm.tipoContrato === c && styles.contractBtnActive]}
                    onPress={() => setProfForm(f => ({ ...f, tipoContrato: c }))}>
                    <Text style={[styles.contractBtnText, profForm.tipoContrato === c && styles.contractBtnTextActive]}>
                      {CONTRATO_LABELS[c]}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.fieldLabel}>Valor por Tempo Lectivo (Kz)</Text>
              <TextInput style={styles.textInput} placeholderTextColor={Colors.textMuted}
                value={profForm.valorPorTempoLectivo}
                onChangeText={v => setProfForm(f => ({ ...f, valorPorTempoLectivo: v }))}
                keyboardType="numeric"
                placeholderTextColor={Colors.textSecondary ?? '#aaa'}
                placeholder="0.00 — usado para colaboradores e desconto de efectivos"
                returnKeyType="done" onSubmitEditing={guardarProf} />

              <Text style={styles.fieldLabel}>Tempos Lectivos por Semana</Text>
              <TextInput style={styles.textInput} placeholderTextColor={Colors.textMuted}
                value={profForm.temposSemanais}
                onChangeText={v => setProfForm(f => ({ ...f, temposSemanais: v }))}
                keyboardType="numeric"
                placeholderTextColor={Colors.textSecondary ?? '#aaa'}
                placeholder="Ex: 8 — número de tempos semanais atribuídos"
                returnKeyType="done" onSubmitEditing={guardarProf} />

              {/* Pré-visualização para colaboradores sem salário base */}
              {['colaborador', 'contratado', 'prestacao_servicos'].includes(profForm.tipoContrato) &&
               Number(profForm.valorPorTempoLectivo) > 0 && Number(profForm.temposSemanais) > 0 && (
                <View style={styles.calcPreview}>
                  <Text style={styles.calcPreviewTitle}>Estimativa Mensal (Colaborador)</Text>
                  <View style={styles.calcRow}>
                    <Text style={styles.calcLabel}>Tempos × Semanas × Valor</Text>
                    <Text style={[styles.calcVal, { color: '#66BB6A', fontWeight: '700' }]}>
                      {fmt(Number(profForm.temposSemanais) * 4 * Number(profForm.valorPorTempoLectivo))}
                    </Text>
                  </View>
                </View>
              )}

              {/* Preview calculation */}
              {Number(profForm.salarioBase) > 0 && (
                <View style={styles.calcPreview}>
                  <Text style={styles.calcPreviewTitle}>Pré-visualização do Cálculo</Text>
                  {(() => {
                    const base = Number(profForm.salarioBase);
                    const subs = Number(profForm.subsidioAlimentacao) + Number(profForm.subsidioTransporte) + Number(profForm.subsidioHabitacao);
                    const bruto = base + subs;
                    const inssEmp = Math.round(base * (inssEmpPerc / 100) * 100) / 100;
                    const inssPatr = Math.round(base * (inssPatrPerc / 100) * 100) / 100;
                    const irt = Math.round(calcIRTFromTabela(base, irtTabela) * 100) / 100;
                    const liquido = Math.round((bruto - inssEmp - irt) * 100) / 100;
                    return (
                      <>
                        <View style={styles.calcRow}><Text style={styles.calcLabel}>Salário Bruto</Text><Text style={styles.calcVal}>{fmt(bruto)}</Text></View>
                        <View style={styles.calcRow}><Text style={[styles.calcLabel, { color: '#EF5350' }]}>{`INSS Empregado (${inssEmpPerc}%)`}</Text><Text style={[styles.calcVal, { color: '#EF5350' }]}>- {fmt(inssEmp)}</Text></View>
                        <View style={styles.calcRow}><Text style={[styles.calcLabel, { color: '#FF7141' }]}>{`INSS Patronal (${inssPatrPerc}%)`}</Text><Text style={[styles.calcVal, { color: '#FF7141' }]}>{fmt(inssPatr)}</Text></View>
                        <View style={styles.calcRow}><Text style={[styles.calcLabel, { color: '#EF5350' }]}>IRT</Text><Text style={[styles.calcVal, { color: '#EF5350' }]}>- {fmt(irt)}</Text></View>
                        <View style={[styles.calcRow, { borderTopWidth: 1, borderTopColor: '#ffffff22', marginTop: 6, paddingTop: 6 }]}>
                          <Text style={[styles.calcLabel, { fontWeight: '700', color: '#fff' }]}>Salário Líquido</Text>
                          <Text style={[styles.calcVal, { color: '#66BB6A', fontWeight: '700' }]}>{fmt(liquido)}</Text>
                        </View>
                      </>
                    );
                  })()}
                </View>
              )}

              <View style={styles.modalBtns}>
                <TouchableOpacity style={styles.modalBtnCancel} onPress={() => setShowProfModal(false)}>
                  <Text style={styles.modalBtnCancelText}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.modalBtnPrimary} onPress={guardarProf}>
                  <Text style={styles.modalBtnPrimaryText}>Guardar</Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </View>
              </KeyboardAvoidingView>
</Modal>

      {/* ── Modal: Recibo de Vencimento ── */}
      <Modal visible={!!reciboItem} transparent animationType="slide" onRequestClose={() => setReciboItem(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={styles.modalOverlay}>
          <ScrollView contentContainerStyle={styles.modalScrollContent}>
            <View style={[styles.modalBox, reciboStyles.reciboBox]}>

              {/* Cabeçalho */}
              <View style={reciboStyles.reciboHeader}>
                <MaterialCommunityIcons name="school" size={32} color={Colors.primary ?? '#5E6AD2'} />
                <Text style={reciboStyles.reciboTitle}>RECIBO DE VENCIMENTO</Text>
                <Text style={reciboStyles.reciboSubTitle}>
                  {selectedFolha ? `${MESES[(selectedFolha.mes ?? 1) - 1]} ${selectedFolha.ano}` : ''}
                </Text>
              </View>

              <View style={reciboStyles.divider} />

              {/* Dados do Funcionário */}
              {reciboItem && (
                <>
                  <Text style={reciboStyles.sectionLabel}>FUNCIONÁRIO</Text>
                  <View style={reciboStyles.infoGrid}>
                    <RLine label="Nome" val={reciboItem.professorNome} />
                    <RLine label="Cargo" val={reciboItem.cargo} />
                    {reciboItem.categoria ? <RLine label="Categoria" val={reciboItem.categoria} /> : null}
                  </View>

                  <View style={reciboStyles.divider} />

                  {/* Vencimentos */}
                  <Text style={reciboStyles.sectionLabel}>VENCIMENTOS</Text>
                  <View style={reciboStyles.infoGrid}>
                    <RLine label="Salário Base" val={fmt(reciboItem.salarioBase)} />
                    {reciboItem.subsidioAlimentacao > 0 && <RLine label="Subsídio Alimentação" val={fmt(reciboItem.subsidioAlimentacao)} />}
                    {reciboItem.subsidioTransporte > 0 && <RLine label="Subsídio Transporte" val={fmt(reciboItem.subsidioTransporte)} />}
                    {reciboItem.subsidioHabitacao > 0 && <RLine label="Subsídio Habitação" val={fmt(reciboItem.subsidioHabitacao)} />}
                    {reciboItem.outrosSubsidios > 0 && <RLine label="Outros Subsídios" val={fmt(reciboItem.outrosSubsidios)} />}
                    <RLine label="Total Bruto" val={fmt(reciboItem.salarioBruto)} bold accent />
                  </View>

                  <View style={reciboStyles.divider} />

                  {/* Remuneração por Tempos Lectivos */}
                  {(reciboItem.remuneracaoTempos ?? 0) > 0 && (
                    <>
                      <Text style={reciboStyles.sectionLabel}>TEMPOS LECTIVOS / DIAS TRABALHADOS</Text>
                      <View style={reciboStyles.infoGrid}>
                        <RLine label="Nº de Unidades" val={String(reciboItem.numTempos ?? 0)} />
                        <RLine label="Remuneração por Tempos" val={fmt(reciboItem.remuneracaoTempos)} accent />
                      </View>
                      <View style={reciboStyles.divider} />
                    </>
                  )}

                  {/* Descontos */}
                  <Text style={reciboStyles.sectionLabel}>DESCONTOS</Text>
                  <View style={reciboStyles.infoGrid}>
                    <RLine label={`INSS Empregado (${inssEmpPerc}%)`} val={fmt(reciboItem.inssEmpregado)} deducao />
                    <RLine label="IRT (tabela progressiva)" val={fmt(reciboItem.irt)} deducao />
                    {(reciboItem.descontoFaltas ?? 0) > 0 && (
                      <RLine label={`Faltas (${reciboItem.numFaltasInj ?? 0} inj. + ${reciboItem.numMeioDia ?? 0} meio-dia)`} val={fmt(reciboItem.descontoFaltas)} deducao />
                    )}
                    {reciboItem.outrosDescontos > 0 && <RLine label="Outros Descontos" val={fmt(reciboItem.outrosDescontos)} deducao />}
                    <RLine label="Total Descontos" val={fmt(reciboItem.totalDescontos)} bold deducao />
                  </View>

                  <View style={reciboStyles.divider} />

                  {/* Líquido a receber */}
                  <View style={reciboStyles.liquidoBox}>
                    <Text style={reciboStyles.liquidoLabel}>SALÁRIO LÍQUIDO A RECEBER</Text>
                    <Text style={reciboStyles.liquidoVal}>{fmt(reciboItem.salarioLiquido)}</Text>
                  </View>

                  {/* Encargos patronais (informativo) */}
                  <View style={reciboStyles.patronalBox}>
                    <Text style={reciboStyles.patronalLabel}>{`Encargo patronal INSS (${inssPatrPerc}%) — não desconta no funcionário`}</Text>
                    <Text style={reciboStyles.patronalVal}>{fmt(reciboItem.inssPatronal)}</Text>
                  </View>

                  {reciboItem.observacao ? (
                    <View style={reciboStyles.obsBox}>
                      <Text style={reciboStyles.sectionLabel}>OBSERVAÇÃO</Text>
                      <Text style={reciboStyles.obsText}>{reciboItem.observacao}</Text>
                    </View>
                  ) : null}

                  <View style={reciboStyles.divider} />

                  {/* Rodapé */}
                  <Text style={reciboStyles.footer}>
                    Documento gerado pelo QUETA · {new Date().toLocaleDateString('pt-AO')}
                  </Text>

                  {/* Estado da folha */}
                  {selectedFolha && (
                    <View style={reciboStyles.statusRow}>
                      <View style={[styles.badge, {
                        backgroundColor: (STATUS_LABELS[selectedFolha.status]?.color ?? '#aaa') + '28',
                        borderColor: STATUS_LABELS[selectedFolha.status]?.color ?? '#aaa',
                        alignSelf: 'center',
                      }]}>
                        <Text style={[styles.badgeText, { color: STATUS_LABELS[selectedFolha.status]?.color ?? '#aaa' }]}>
                          {STATUS_LABELS[selectedFolha.status]?.label ?? selectedFolha.status}
                        </Text>
                      </View>
                    </View>
                  )}
                </>
              )}

              <View style={{ flexDirection: 'row', gap: 10, marginTop: 20, flexWrap: 'wrap' }}>
                <TouchableOpacity
                  style={[styles.modalBtnCancel, { flex: 1, minWidth: 120, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }]}
                  onPress={() => { setReciboItem(null); router.push('/(main)/editor-documentos' as any); }}
                >
                  <Ionicons name="document-text-outline" size={16} color={Colors.accent ?? '#4FC3F7'} />
                  <Text style={[styles.modalBtnCancelText, { color: Colors.accent ?? '#4FC3F7' }]}>Editar Modelo</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalBtnCancel, { flex: 1, minWidth: 120, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }]}
                  onPress={() => reciboItem && selectedFolha && imprimirRecibo(reciboItem, selectedFolha)}
                >
                  <Ionicons name="print-outline" size={16} color="#66BB6A" />
                  <Text style={[styles.modalBtnCancelText, { color: '#66BB6A' }]}>Imprimir</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.modalBtnPrimary, { flex: 1, minWidth: 120 }]} onPress={() => setReciboItem(null)}>
                  <Text style={styles.modalBtnPrimaryText}>Fechar</Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </View>
              </KeyboardAvoidingView>
</Modal>
    </View>
  );
}

// IRT client-side preview (mirrors server calculation)
function calcIRT(base: number): number {
  if (base <= 70000)    return 0;
  if (base <= 100000)   return (base - 70000) * 0.10;
  if (base <= 150000)   return 3000  + (base - 100000) * 0.13;
  if (base <= 200000)   return 9500  + (base - 150000) * 0.16;
  if (base <= 300000)   return 17500 + (base - 200000) * 0.18;
  if (base <= 500000)   return 35500 + (base - 300000) * 0.19;
  if (base <= 1000000)  return 73500 + (base - 500000) * 0.20;
  return 173500 + (base - 1000000) * 0.25;
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const GLASS = 'rgba(255,255,255,0.06)';
const BORDER = 'rgba(255,255,255,0.12)';

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background ?? '#0a0a1a' },

  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingTop: 52, paddingBottom: 16,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderBottomWidth: 1, borderBottomColor: BORDER,
  },
  backBtn: { padding: 4 },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: '700', flex: 1 },
  headerSub: { color: Colors.textSecondary ?? '#aaa', fontSize: 12 },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 40, paddingHorizontal: 14, borderRadius: 20, backgroundColor: Colors.primary ?? '#5E6AD2' },
  addBtnTxt: { color: '#fff', fontSize: 13, fontFamily: 'Inter_700Bold' },

  tabBar: {
    borderBottomWidth: 1, borderBottomColor: BORDER,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  tabItem: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 12, paddingHorizontal: 12, borderBottomWidth: 2, borderBottomColor: 'transparent',
  },
  tabItemActive: { borderBottomColor: Colors.primary ?? '#5E6AD2' },
  tabLabel: { fontSize: 13, color: Colors.textSecondary ?? '#aaa' },
  tabLabelActive: { color: '#fff', fontWeight: '600' },

  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 40 },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { color: Colors.textSecondary ?? '#aaa', fontSize: 14 },

  sectionTitle: { color: '#fff', fontSize: 15, fontWeight: '700', marginTop: 8, marginBottom: 10 },

  card: {
    backgroundColor: GLASS, borderRadius: 16,
    borderWidth: 1, borderColor: BORDER,
    marginBottom: 16, overflow: 'hidden',
  },

  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 },
  kpi: {
    flex: 1, minWidth: '46%',
    backgroundColor: GLASS, borderRadius: 14,
    borderWidth: 1, borderColor: BORDER,
    borderLeftWidth: 3, padding: 14, gap: 4,
  },
  kpiIcon: { marginBottom: 4 },
  kpiLabel: { color: Colors.textSecondary ?? '#aaa', fontSize: 11, fontWeight: '600' },
  kpiValue: { color: '#fff', fontSize: 20, fontWeight: '700' },
  kpiSub: { color: Colors.textSecondary ?? '#aaa', fontSize: 11 },

  row: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: BORDER, gap: 10,
  },
  rowLeft: { flex: 1 },
  rowRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowTitle: { color: '#fff', fontSize: 14, fontWeight: '600' },
  rowSub: { color: Colors.textSecondary ?? '#aaa', fontSize: 12, marginTop: 2 },
  rowMeta: { color: Colors.textSecondary ?? '#aaa', fontSize: 11, marginTop: 3 },

  badge: {
    borderRadius: 6, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 3,
  },
  badgeText: { fontSize: 11, fontWeight: '700' },

  cardRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: BORDER,
  },
  cardRowLast: { borderBottomWidth: 0 },
  cardLabel: { color: Colors.textSecondary ?? '#aaa', fontSize: 13 },
  cardValue: { color: '#fff', fontSize: 13, fontWeight: '600' },
  viewBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6, padding: 12,
    justifyContent: 'center', borderTopWidth: 1, borderTopColor: BORDER,
  },
  viewBtnText: { color: Colors.primary ?? '#5E6AD2', fontSize: 14, fontWeight: '600' },

  irtRow: { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 8, gap: 8 },
  irtRowAlt: { backgroundColor: 'rgba(255,255,255,0.03)' },
  irtEscalao: { flex: 2, color: '#fff', fontSize: 11 },
  irtTaxa: { flex: 1, color: Colors.primary ?? '#5E6AD2', fontSize: 11, fontWeight: '700', textAlign: 'center' },
  irtParcela: { flex: 2, color: Colors.textSecondary ?? '#aaa', fontSize: 10, textAlign: 'right' },
  irtNote: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    padding: 12, borderTopWidth: 1, borderTopColor: BORDER, marginTop: 4,
  },
  irtNoteText: { color: Colors.textSecondary ?? '#aaa', fontSize: 11, flex: 1 },

  emptyCard: { alignItems: 'center', justifyContent: 'center', padding: 40, gap: 12 },
  emptyText: { color: Colors.textSecondary ?? '#aaa', fontSize: 15, textAlign: 'center' },
  emptySub: { color: Colors.textSecondary ?? '#aaa', fontSize: 12, textAlign: 'center' },
  emptyBtn: {
    backgroundColor: Colors.primary ?? '#5E6AD2', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10,
  },
  emptyBtnText: { color: '#fff', fontWeight: '700' },

  searchRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: GLASS, borderRadius: 10, borderWidth: 1, borderColor: BORDER,
    paddingHorizontal: 12, paddingVertical: 10, marginBottom: 12,
  },
  searchInput: { flex: 1, color: '#fff', fontSize: 16 },

  alertBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#FF714118', borderRadius: 10, borderWidth: 1, borderColor: '#FF714144',
    padding: 12, marginBottom: 12,
  },
  alertText: { color: '#FF7141', fontSize: 13, flex: 1 },

  backLink: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
  backLinkText: { color: Colors.primary ?? '#5E6AD2', fontSize: 14 },

  detalheTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16 },
  detalheTitle: { color: '#fff', fontSize: 18, fontWeight: '700' },

  summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', padding: 8, gap: 8 },
  summaryItem: {
    flex: 1, minWidth: '30%',
    backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: 12,
    borderWidth: 1, borderColor: BORDER,
  },
  summaryLabel: { color: Colors.textSecondary ?? '#aaa', fontSize: 11, marginBottom: 4 },
  summaryVal: { color: '#fff', fontSize: 14, fontWeight: '700' },

  processadaPor: {
    color: Colors.textSecondary ?? '#aaa', fontSize: 11, padding: 12,
    borderTopWidth: 1, borderTopColor: BORDER,
  },

  actionRow: { flexDirection: 'row', gap: 10, marginBottom: 16, flexWrap: 'wrap' },
  actionBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, backgroundColor: Colors.primary ?? '#5E6AD2',
    paddingVertical: 12, borderRadius: 10,
  },
  actionBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },

  itemRow: {
    flexDirection: 'column',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: BORDER,
  },
  itemHeader: {
    flexDirection: 'row', alignItems: 'center', marginBottom: 10,
  },
  itemCols: { flexDirection: 'row', gap: 8, justifyContent: 'space-between' },
  itemCol: { alignItems: 'flex-start', flex: 1 },
  itemColLabel: { color: Colors.textSecondary ?? '#aaa', fontSize: 10 },
  itemColVal: { color: '#fff', fontSize: 12, fontWeight: '600' },

  // Modals
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center', alignItems: 'center',
  },
  modalScrollContent: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 16 },
  modalBox: {
    backgroundColor: '#141428', borderRadius: 20,
    borderWidth: 1, borderColor: BORDER,
    padding: 24, width: '100%', maxWidth: 440,
  },
  modalTitle: { color: '#fff', fontSize: 18, fontWeight: '700', marginBottom: 4, textAlign: 'center' },
  modalSubTitle: { color: Colors.textSecondary ?? '#aaa', fontSize: 13, textAlign: 'center', marginBottom: 16 },
  modalBody: { color: Colors.textSecondary ?? '#aaa', fontSize: 13, lineHeight: 20, marginVertical: 12 },

  fieldLabel: { color: Colors.textSecondary ?? '#aaa', fontSize: 12, fontWeight: '600', marginTop: 12, marginBottom: 6 },
  textInput: {
    backgroundColor: GLASS, borderWidth: 1, borderColor: BORDER, borderRadius: 10,
    color: '#fff', fontSize: 14, paddingHorizontal: 14, paddingVertical: 11,
  },

  monthGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 4 },
  monthBtn: {
    paddingHorizontal: 10, paddingVertical: 8, borderRadius: 8,
    backgroundColor: GLASS, borderWidth: 1, borderColor: BORDER, minWidth: 54, alignItems: 'center',
  },
  monthBtnActive: { backgroundColor: Colors.primary + '44', borderColor: Colors.primary ?? '#5E6AD2' },
  monthBtnText: { color: Colors.textSecondary ?? '#aaa', fontSize: 12, fontWeight: '600' },
  monthBtnTextActive: { color: '#fff' },

  yearRow: { flexDirection: 'row', gap: 8, marginBottom: 4 },
  yearBtn: {
    flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: 'center',
    backgroundColor: GLASS, borderWidth: 1, borderColor: BORDER,
  },
  yearBtnActive: { backgroundColor: Colors.primary + '44', borderColor: Colors.primary ?? '#5E6AD2' },
  yearBtnText: { color: Colors.textSecondary ?? '#aaa', fontWeight: '600' },
  yearBtnTextActive: { color: '#fff' },

  contractRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 4 },
  contractBtn: {
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8,
    backgroundColor: GLASS, borderWidth: 1, borderColor: BORDER,
  },
  contractBtnActive: { backgroundColor: Colors.primary + '44', borderColor: Colors.primary ?? '#5E6AD2' },
  contractBtnText: { color: Colors.textSecondary ?? '#aaa', fontSize: 12, fontWeight: '600' },
  contractBtnTextActive: { color: '#fff' },

  calcPreview: {
    backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 12,
    borderWidth: 1, borderColor: BORDER, padding: 14, marginTop: 12,
  },
  calcPreviewTitle: { color: '#fff', fontSize: 13, fontWeight: '700', marginBottom: 10 },
  calcRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  calcLabel: { color: Colors.textSecondary ?? '#aaa', fontSize: 12 },
  calcVal: { color: '#fff', fontSize: 12, fontWeight: '600' },

  modalBtns: { flexDirection: 'row', gap: 10, marginTop: 20 },
  modalBtnCancel: {
    flex: 1, paddingVertical: 12, borderRadius: 10,
    backgroundColor: GLASS, borderWidth: 1, borderColor: BORDER, alignItems: 'center',
  },
  modalBtnCancelText: { color: Colors.textSecondary ?? '#aaa', fontWeight: '600' },
  modalBtnPrimary: {
    flex: 1, paddingVertical: 12, borderRadius: 10,
    backgroundColor: Colors.primary ?? '#5E6AD2', alignItems: 'center',
  },
  modalBtnPrimaryText: { color: '#fff', fontWeight: '700' },

  // Paginação Funcionários
  paginacao: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 4, paddingVertical: 16, flexWrap: 'wrap',
  },
  pgBtn: {
    minWidth: 32, height: 32, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8,
    backgroundColor: '#1a2b5f', borderWidth: 1, borderColor: '#2A4A78',
  },
  pgBtnActive: { backgroundColor: '#3B82F6', borderColor: '#3B82F6' },
  pgBtnDisabled: { opacity: 0.35 },
  pgBtnText: { fontSize: 13, fontWeight: '500', color: '#fff' },
  pgBtnTextActive: { color: '#fff', fontWeight: '700' },
  pgEllipsis: { fontSize: 13, color: '#666', paddingHorizontal: 2, alignSelf: 'center' },
  pgInfo: { fontSize: 12, color: '#888', marginLeft: 6 },
});

const simStyles = StyleSheet.create({
  totalsRow: {
    flexDirection: 'row', padding: 16, gap: 8,
  },
  totalsLabel: { color: '#aaa', fontSize: 11, fontWeight: '600', marginBottom: 4 },
  totalsVal: { color: '#fff', fontSize: 15, fontWeight: '700' },
  divider: { height: 1, backgroundColor: 'rgba(255,255,255,0.10)', marginHorizontal: 16 },
  breakdownDivider: { height: 1, backgroundColor: 'rgba(255,255,255,0.08)', marginVertical: 6 },

  empRow: {
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  empRowTop: { flexDirection: 'row', alignItems: 'center' },
  empName: { color: '#fff', fontSize: 14, fontWeight: '600' },
  empCargo: { color: '#aaa', fontSize: 11, marginTop: 2 },
  empAmounts: { alignItems: 'flex-end', marginRight: 4 },
  empBruto: { color: '#aaa', fontSize: 12 },
  empLiquido: { fontSize: 14, fontWeight: '700', marginTop: 2 },

  breakdown: {
    marginTop: 12,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  simRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  simLabel: { color: '#aaa', fontSize: 12 },
  simVal: { color: '#fff', fontSize: 12, fontWeight: '600' },
  patronalNote: { color: '#aaa', fontSize: 10, marginTop: 4, fontStyle: 'italic' },
});

const reciboStyles = StyleSheet.create({
  reciboBox: { backgroundColor: '#0f0f22', maxWidth: 480, width: '100%' },
  reciboHeader: { alignItems: 'center', gap: 6, paddingVertical: 8 },
  reciboTitle: { color: '#fff', fontSize: 16, fontWeight: '800', letterSpacing: 1.5 },
  reciboSubTitle: { color: '#aaa', fontSize: 13, fontWeight: '600' },
  divider: { height: 1, backgroundColor: 'rgba(255,255,255,0.12)', marginVertical: 14 },
  sectionLabel: {
    color: '#5E6AD2', fontSize: 10, fontWeight: '800', letterSpacing: 1.5,
    marginBottom: 8,
  },
  infoGrid: { gap: 2 },
  rline: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  rlineLabel: { color: '#aaa', fontSize: 13 },
  rlineVal: { color: '#fff', fontSize: 13, fontWeight: '500' },
  liquidoBox: {
    backgroundColor: 'rgba(94,106,210,0.15)', borderRadius: 12,
    borderWidth: 1, borderColor: 'rgba(94,106,210,0.4)',
    padding: 16, alignItems: 'center', gap: 4,
  },
  liquidoLabel: { color: '#aaa', fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  liquidoVal: { color: '#66BB6A', fontSize: 28, fontWeight: '800' },
  patronalBox: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: 'rgba(255,113,65,0.08)', borderRadius: 8,
    borderWidth: 1, borderColor: 'rgba(255,113,65,0.25)',
    padding: 10, marginTop: 8,
  },
  patronalLabel: { color: '#FF7141', fontSize: 11, flex: 1 },
  patronalVal: { color: '#FF7141', fontSize: 12, fontWeight: '700' },
  obsBox: { marginTop: 4 },
  obsText: { color: '#aaa', fontSize: 12 },
  footer: { color: '#555', fontSize: 11, textAlign: 'center', marginTop: 4 },
  statusRow: { alignItems: 'center', marginTop: 6 },

});
