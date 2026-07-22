import React, { createContext, useContext, useState, useEffect, useMemo, ReactNode } from 'react';
import { Platform } from 'react-native';
import { api } from '../lib/api';
import { useAuth } from './AuthContext';
import { subscribeDataChange } from '@/lib/realtimeSync';
import { matchAno } from '@/utils/anoUtils';

const SIGA_SYNC_EVENT = 'siga:online-sync';
function isOfflineQueued(res: any): boolean {
  return !!(res && typeof res === 'object' && res.offlineQueued === true);
}
function tempId(prefix: string): string {
  return `${prefix}_tmp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export type TipoTaxa = 'propina' | 'matricula' | 'material' | 'exame' | 'multa' | 'outro';
export type FrequenciaTaxa = 'mensal' | 'trimestral' | 'anual' | 'unica';
export type StatusPagamento = 'pago' | 'pendente' | 'cancelado';
export type MetodoPagamento = 'dinheiro' | 'transferencia' | 'multicaixa' | 'referencia_bancaria';

export interface Taxa {
  id: string;
  tipo: TipoTaxa;
  descricao: string;
  valor: number;
  frequencia: FrequenciaTaxa;
  nivel: string;
  anoAcademico: string;
  ativo: boolean;
}

export interface Pagamento {
  id: string;
  alunoId: string;
  taxaId: string;
  valor: number;
  data: string;
  mes?: number;
  trimestre?: number;
  ano: string;
  status: StatusPagamento;
  metodoPagamento: MetodoPagamento;
  referencia?: string;
  observacao?: string;
  createdAt: string;
  criadoPor?: string;
}

export interface MultaConfig {
  percentagem: number;
  diasCarencia: number;
  ativo: boolean;
  dataLimitePagamento?: number;
  diaInicioMulta?: number;
  valorPorDia?: number;
  percentagemPorDia?: number;
}

export interface FaltasJustifConfig {
  ativo: boolean;
  faltasMinimas: number;
  valorPorFalta: number;
}

export interface IsencaoMulta {
  id: string;
  alunoId: string;
  solicitadoPor: string;
  justificativa: string;
  status: 'pendente' | 'aprovado' | 'rejeitado';
  aprovadoPor?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface MensagemFinanceira {
  id: string;
  alunoId: string;
  remetente: string;
  texto: string;
  data: string;
  lida: boolean;
  tipo: 'aviso' | 'bloqueio' | 'rupe' | 'geral';
}

export interface RUPEGerado {
  id: string;
  alunoId: string;
  taxaId: string;
  valor: number;
  referencia: string;
  dataGeracao: string;
  dataValidade: string;
  status: 'ativo' | 'pago' | 'expirado';
  fonte?: 'emis_api' | 'sandbox' | 'local';
  ambiente?: string;
  mes?: number;
  ano?: string;
}

export interface SaldoAluno {
  id: string;
  alunoId: string;
  saldo: number;
  dataProximaCobranca?: string;
  observacoes?: string;
  updatedAt: string;
}

export interface MovimentoSaldo {
  id: string;
  alunoId: string;
  tipo: 'credito' | 'debito' | 'transferencia_in' | 'transferencia_out' | 'pagamento_excesso';
  valor: number;
  descricao: string;
  pagamentoId?: string;
  criadoPor?: string;
  createdAt: string;
}

interface FinanceiroContextValue {
  taxas: Taxa[];
  pagamentos: Pagamento[];
  multaConfig: MultaConfig;
  faltasJustifConfig: FaltasJustifConfig;
  updateFaltasJustifConfig: (cfg: Partial<FaltasJustifConfig>) => Promise<void>;
  mensagens: MensagemFinanceira[];
  rupes: RUPEGerado[];
  bloqueados: string[];
  acessoLiberado: string[];
  saldos: SaldoAluno[];
  movimentosSaldo: MovimentoSaldo[];
  isencoes: IsencaoMulta[];
  isLoading: boolean;
  addTaxa: (t: Omit<Taxa, 'id'>) => Promise<void>;
  updateTaxa: (id: string, t: Partial<Taxa>) => Promise<void>;
  deleteTaxa: (id: string) => Promise<void>;
  addPagamento: (p: Omit<Pagamento, 'id' | 'createdAt'>) => Promise<Pagamento>;
  addPagamentoSelf: (p: Omit<Pagamento, 'id' | 'createdAt'>) => Promise<Pagamento>;
  updatePagamento: (id: string, p: Partial<Pagamento>) => Promise<void>;
  deletePagamento: (id: string) => Promise<void>;
  transferirPagamento: (pagamentoId: string, destino: 'saldo' | string, criadoPor?: string) => Promise<void>;
  getTotalRecebido: (anoAcademico?: string) => number;
  getTotalPendente: (anoAcademico?: string) => number;
  getPagamentosAluno: (alunoId: string) => Pagamento[];
  getTaxasByNivel: (nivel: string, anoAcademico?: string) => Taxa[];
  updateMultaConfig: (cfg: Partial<MultaConfig>) => Promise<void>;
  bloquearAluno: (alunoId: string) => Promise<void>;
  desbloquearAluno: (alunoId: string) => Promise<void>;
  isAlunoBloqueado: (alunoId: string) => boolean;
  togglePermitirAcessoPortal: (alunoId: string, valor: boolean) => Promise<void>;
  enviarMensagem: (alunoId: string, texto: string, remetente: string, tipo?: MensagemFinanceira['tipo']) => Promise<void>;
  getMensagensAluno: (alunoId: string) => MensagemFinanceira[];
  marcarMensagemLida: (id: string) => Promise<void>;
  gerarRUPE: (alunoId: string, taxaId: string, valor: number, mes?: number, ano?: string) => Promise<RUPEGerado>;
  updateRUPE: (id: string, r: Partial<RUPEGerado>) => Promise<void>;
  getRUPEsAluno: (alunoId: string) => RUPEGerado[];
  getMesesEmAtraso: (alunoId: string, anoAtual: string) => number;
  calcularMulta: (valorPropina: number, mesesAtraso: number) => number;
  getMultaAluno: (alunoId: string, valorPropina: number, mesesAtraso: number) => { valor: number; isento: boolean };
  getUnreadMensagensAluno: (alunoId: string) => number;
  getSaldoAluno: (alunoId: string) => SaldoAluno | null;
  getMovimentosAluno: (alunoId: string) => MovimentoSaldo[];
  creditarSaldo: (alunoId: string, valor: number, descricao: string, dataProximaCobranca?: string, observacoes?: string, criadoPor?: string) => Promise<SaldoAluno>;
  debitarSaldo: (alunoId: string, valor: number, descricao: string, criadoPor?: string) => Promise<SaldoAluno>;
  solicitarIsencaoMulta: (alunoId: string, justificativa: string, solicitadoPor: string) => Promise<void>;
  responderIsencaoMulta: (id: string, status: 'aprovado' | 'rejeitado', aprovadoPor: string) => Promise<void>;
  getIsencaoAluno: (alunoId: string) => IsencaoMulta | null;
}

const FinanceiroContext = createContext<FinanceiroContextValue | null>(null);

const DEFAULT_MULTA_CONFIG: MultaConfig = {
  percentagem: 10,
  diasCarencia: 5,
  ativo: true,
  diaInicioMulta: 10,
  valorPorDia: 0,
  percentagemPorDia: 0,
};

const DEFAULT_FALTAS_JUSTIF_CONFIG: FaltasJustifConfig = {
  ativo: false,
  faltasMinimas: 3,
  valorPorFalta: 0,
};

export function formatAOA(valor: number): string {
  return valor.toLocaleString('pt-AO') + ' Kz';
}

// Roles que têm acesso completo às APIs financeiras (requirePermission("financeiro"))
const ROLES_FINANCEIRO = new Set([
  'ceo', 'pca', 'admin', 'director', 'financeiro', 'chefe_secretaria',
  'subdiretor_administrativo',
]);

export function FinanceiroProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated, user } = useAuth();
  const isAluno = user?.role === 'aluno';
  const hasFinanceiroAccess = ROLES_FINANCEIRO.has(user?.role ?? '');
  const [taxas, setTaxas] = useState<Taxa[]>([]);
  const [pagamentos, setPagamentos] = useState<Pagamento[]>([]);
  const [multaConfig, setMultaConfig] = useState<MultaConfig>(DEFAULT_MULTA_CONFIG);
  const [faltasJustifConfig, setFaltasJustifConfig] = useState<FaltasJustifConfig>(DEFAULT_FALTAS_JUSTIF_CONFIG);
  const [mensagens, setMensagens] = useState<MensagemFinanceira[]>([]);
  const [rupes, setRupes] = useState<RUPEGerado[]>([]);
  const [bloqueados, setBloqueados] = useState<string[]>([]);
  const [acessoLiberado, setAcessoLiberado] = useState<string[]>([]);
  const [saldos, setSaldos] = useState<SaldoAluno[]>([]);
  const [movimentosSaldo, setMovimentosSaldo] = useState<MovimentoSaldo[]>([]);
  const [isencoes, setIsencoes] = useState<IsencaoMulta[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (isAuthenticated) loadData();
    else setIsLoading(false);
  }, [isAuthenticated]);

  // Re-sincroniza assim que a fila offline acaba de ser processada (rede voltou).
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const handler = () => { if (isAuthenticated) loadData(); };
    window.addEventListener(SIGA_SYNC_EVENT, handler);
    return () => window.removeEventListener(SIGA_SYNC_EVENT, handler);
  }, [isAuthenticated]);

  // Tempo real via WS — recarrega imediatamente quando os dados financeiros mudam
  useEffect(() => {
    if (!isAuthenticated) return;
    return subscribeDataChange((entity) => {
      if (['pagamentos', 'taxas', 'propinas', 'rupes', 'multas', 'isencoes', 'folhas_salario', 'config'].includes(entity)) {
        loadData();
      }
    });
  }, [isAuthenticated]);

  // Polling de fallback a cada 30s — garante sincronização mesmo sem WS
  useEffect(() => {
    if (!isAuthenticated) return;
    const interval = setInterval(() => { loadData(); }, 30000);
    return () => clearInterval(interval);
  }, [isAuthenticated]);

  async function loadData() {
    try {
      if (isAluno) {
        // Estudantes usam endpoints dedicados que não requerem permissão financeira
        const [t, p, msg, r, cfg] = await Promise.all([
          api.get<Taxa[]>('/api/taxas/self'),
          api.get<Pagamento[]>('/api/pagamentos/self'),
          api.get<MensagemFinanceira[]>('/api/mensagens-financeiras').catch(() => [] as MensagemFinanceira[]),
          api.get<RUPEGerado[]>('/api/rupes/self'),
          api.get<Record<string, unknown>>('/api/config'),
        ]);
        setTaxas(t);
        setPagamentos(p);
        setMensagens(msg);
        setRupes(r);
        if (cfg.multaConfig) {
          setMultaConfig({ ...DEFAULT_MULTA_CONFIG, ...(cfg.multaConfig as Partial<MultaConfig>) });
        }
        if (cfg.faltasJustifConfig) {
          setFaltasJustifConfig({ ...DEFAULT_FALTAS_JUSTIF_CONFIG, ...(cfg.faltasJustifConfig as Partial<FaltasJustifConfig>) });
        }
      } else if (hasFinanceiroAccess) {
        const sf = <T,>(p: string, fb: T) => api.get<T>(p).catch(() => fb);
        const [t, p, msg, r, alunos, cfg, s, mv, isen] = await Promise.all([
          sf<Taxa[]>('/api/taxas', []),
          sf<Pagamento[]>('/api/pagamentos', []),
          sf<MensagemFinanceira[]>('/api/mensagens-financeiras', []),
          sf<RUPEGerado[]>('/api/rupes', []),
          sf<Array<{ id: string; bloqueado: boolean }>>('/api/alunos', []),
          api.get<Record<string, unknown>>('/api/config').catch(() => ({} as Record<string, unknown>)),
          sf<SaldoAluno[]>('/api/saldo-alunos', []),
          sf<MovimentoSaldo[]>('/api/movimentos-saldo', []),
          sf<IsencaoMulta[]>('/api/multa-isencoes', []),
        ]);
        setTaxas(t);
        setPagamentos(p);
        setMensagens(msg);
        setRupes(r);
        setBloqueados(alunos.filter(a => a.bloqueado).map(a => a.id));
        setAcessoLiberado(alunos.filter(a => (a as any).permitirAcessoComPendencia).map(a => a.id));
        setSaldos(s);
        setMovimentosSaldo(mv);
        setIsencoes(isen);
        if (cfg.multaConfig) {
          setMultaConfig({ ...DEFAULT_MULTA_CONFIG, ...(cfg.multaConfig as Partial<MultaConfig>) });
        }
        if (cfg.faltasJustifConfig) {
          setFaltasJustifConfig({ ...DEFAULT_FALTAS_JUSTIF_CONFIG, ...(cfg.faltasJustifConfig as Partial<FaltasJustifConfig>) });
        }
      } else {
        // Roles sem acesso financeiro (professor, rh, secretaria, etc.) —
        // carregam apenas configuração geral; não chamam rotas protegidas por "financeiro".
        const cfg = await api.get<Record<string, unknown>>('/api/config').catch(() => ({} as Record<string, unknown>));
        if (cfg.multaConfig) {
          setMultaConfig({ ...DEFAULT_MULTA_CONFIG, ...(cfg.multaConfig as Partial<MultaConfig>) });
        }
        if (cfg.faltasJustifConfig) {
          setFaltasJustifConfig({ ...DEFAULT_FALTAS_JUSTIF_CONFIG, ...(cfg.faltasJustifConfig as Partial<FaltasJustifConfig>) });
        }
      }
    } catch (e) {
      console.error('FinanceiroContext load error', e);
    } finally {
      setIsLoading(false);
    }
  }

  async function addTaxa(t: Omit<Taxa, 'id'>) {
    // Optimista: aparece logo no ecrã, mesmo offline.
    const tmp: Taxa = { ...(t as any), id: tempId('taxa') } as Taxa;
    setTaxas(prev => [tmp, ...prev]);
    try {
      const novo = await api.post<Taxa>('/api/taxas', t);
      if (isOfflineQueued(novo)) return; // fica o tmp; sync vai realinhar
      setTaxas(prev => prev.map(x => x.id === tmp.id ? novo : x));
    } catch (e) {
      // erro real: reverte
      setTaxas(prev => prev.filter(x => x.id !== tmp.id));
      throw e;
    }
  }

  async function updateTaxa(id: string, t: Partial<Taxa>) {
    const previous = taxas.find(x => x.id === id);
    setTaxas(prev => prev.map(x => x.id === id ? { ...x, ...t } as Taxa : x));
    try {
      const updated = await api.put<Taxa>(`/api/taxas/${id}`, t);
      if (isOfflineQueued(updated)) return;
      setTaxas(prev => prev.map(x => x.id === id ? updated : x));
    } catch (e) {
      if (previous) setTaxas(prev => prev.map(x => x.id === id ? previous : x));
      throw e;
    }
  }

  async function deleteTaxa(id: string) {
    const previous = taxas.find(x => x.id === id);
    setTaxas(prev => prev.filter(x => x.id !== id));
    try {
      await api.delete(`/api/taxas/${id}`);
    } catch (e) {
      if (previous) setTaxas(prev => [previous, ...prev]);
      throw e;
    }
  }

  async function addPagamento(p: Omit<Pagamento, 'id' | 'createdAt'>): Promise<Pagamento> {
    const tmp: Pagamento = { ...(p as any), id: tempId('pag'), createdAt: new Date().toISOString() } as Pagamento;
    setPagamentos(prev => [tmp, ...prev]);
    try {
      const novo = await api.post<Pagamento>('/api/pagamentos', p);
      if (isOfflineQueued(novo)) return tmp;
      setPagamentos(prev => prev.map(x => x.id === tmp.id ? novo : x));
      return novo;
    } catch (e) {
      setPagamentos(prev => prev.filter(x => x.id !== tmp.id));
      throw e;
    }
  }

  async function addPagamentoSelf(p: Omit<Pagamento, 'id' | 'createdAt'>): Promise<Pagamento> {
    const tmp: Pagamento = { ...(p as any), id: tempId('pag'), createdAt: new Date().toISOString() } as Pagamento;
    setPagamentos(prev => [tmp, ...prev]);
    try {
      const novo = await api.post<Pagamento>('/api/pagamentos/self', p);
      if (isOfflineQueued(novo)) return tmp;
      setPagamentos(prev => prev.map(x => x.id === tmp.id ? novo : x));
      return novo;
    } catch (e) {
      setPagamentos(prev => prev.filter(x => x.id !== tmp.id));
      throw e;
    }
  }

  async function updatePagamento(id: string, p: Partial<Pagamento>) {
    const previous = pagamentos.find(x => x.id === id);
    setPagamentos(prev => prev.map(x => x.id === id ? { ...x, ...p } as Pagamento : x));
    try {
      const updated = await api.put<Pagamento>(`/api/pagamentos/${id}`, p);
      if (isOfflineQueued(updated)) return;
      setPagamentos(prev => prev.map(x => x.id === id ? updated : x));
      if (p.status === 'pago' && previous?.alunoId) {
        try {
          const saldosAtualizados = await api.get<SaldoAluno[]>('/api/saldo-alunos');
          setSaldos(saldosAtualizados);
        } catch {}
      }
    } catch (e) {
      if (previous) setPagamentos(prev => prev.map(x => x.id === id ? previous : x));
      throw e;
    }
  }

  async function deletePagamento(id: string) {
    const previous = pagamentos.find(x => x.id === id);
    setPagamentos(prev => prev.filter(x => x.id !== id));
    try {
      await api.delete(`/api/pagamentos/${id}`);
    } catch (e) {
      if (previous) setPagamentos(prev => [previous, ...prev]);
      throw e;
    }
  }

  function getTotalRecebido(anoAcademico?: string) {
    return pagamentos
      .filter(p => p.status === 'pago' && (!anoAcademico || matchAno(p.ano, anoAcademico)))
      .reduce((s, p) => s + (parseFloat(p.valor as any) || 0), 0);
  }

  function getTotalPendente(anoAcademico?: string) {
    return pagamentos
      .filter(p => p.status === 'pendente' && (!anoAcademico || matchAno(p.ano, anoAcademico)))
      .reduce((s, p) => s + (parseFloat(p.valor as any) || 0), 0);
  }

  function getPagamentosAluno(alunoId: string) {
    return pagamentos.filter(p => p.alunoId === alunoId);
  }

  function getTaxasByNivel(nivel: string, anoAcademico?: string) {
    return taxas.filter(t => (t.nivel === nivel || t.nivel === 'Todos') && (!anoAcademico || t.anoAcademico === anoAcademico) && t.ativo);
  }

  async function updateMultaConfig(cfg: Partial<MultaConfig>) {
    const updated = { ...multaConfig, ...cfg };
    setMultaConfig(updated);
    await api.put('/api/config', { multaConfig: updated });
  }

  async function updateFaltasJustifConfig(cfg: Partial<FaltasJustifConfig>) {
    const updated = { ...faltasJustifConfig, ...cfg };
    setFaltasJustifConfig(updated);
    await api.put('/api/config', { faltasJustifConfig: updated });
  }

  async function bloquearAluno(alunoId: string) {
    if (bloqueados.includes(alunoId)) return;
    await api.put(`/api/alunos/${alunoId}`, { bloqueado: true });
    setBloqueados(prev => [...prev, alunoId]);
  }

  async function desbloquearAluno(alunoId: string) {
    await api.put(`/api/alunos/${alunoId}`, { bloqueado: false });
    setBloqueados(prev => prev.filter(id => id !== alunoId));
  }

  function isAlunoBloqueado(alunoId: string) {
    if (acessoLiberado.includes(alunoId)) return false;
    return bloqueados.includes(alunoId);
  }

  async function togglePermitirAcessoPortal(alunoId: string, valor: boolean) {
    await api.patch(`/api/alunos/${alunoId}/permitir-acesso-pendencia`, { permitirAcessoComPendencia: valor });
    if (valor) {
      setAcessoLiberado(prev => prev.includes(alunoId) ? prev : [...prev, alunoId]);
    } else {
      setAcessoLiberado(prev => prev.filter(id => id !== alunoId));
    }
  }

  async function enviarMensagem(alunoId: string, texto: string, remetente: string, tipo: MensagemFinanceira['tipo'] = 'geral') {
    const nova = await api.post<MensagemFinanceira>('/api/mensagens-financeiras', {
      alunoId, remetente, texto,
      data: new Date().toISOString(),
      lida: false,
      tipo,
    });
    setMensagens(prev => [nova, ...prev]);
  }

  function getMensagensAluno(alunoId: string) {
    return mensagens.filter(m => m.alunoId === alunoId).sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime());
  }

  async function marcarMensagemLida(id: string) {
    await api.put(`/api/mensagens-financeiras/${id}`, { lida: true });
    setMensagens(prev => prev.map(m => m.id === id ? { ...m, lida: true } : m));
  }

  function getUnreadMensagensAluno(alunoId: string) {
    return mensagens.filter(m => m.alunoId === alunoId && !m.lida).length;
  }

  async function gerarRUPE(alunoId: string, taxaId: string, valor: number, mes?: number, ano?: string): Promise<RUPEGerado> {
    // Obter a descrição da rubrica para enviar à API EMIS
    const taxa = taxas.find(t => t.id === taxaId);
    const descricao = taxa?.descricao || 'Pagamento Escolar';

    // Estudantes usam endpoints /self (validam ownership); admins usam endpoints normais
    const emisEndpoint = isAluno ? '/api/emis/gerar-referencia/self' : '/api/emis/gerar-referencia';
    const rupeEndpoint = isAluno ? '/api/rupes/self' : '/api/rupes';

    // Chamar o endpoint que usa a API EMIS oficial (ou sandbox se não configurado)
    const emis = await api.post<{
      referencia: string;
      dataGeracao: string;
      dataValidade: string;
      fonte: 'emis_api' | 'sandbox' | 'local';
      ambiente: string;
      nota?: string;
    }>(emisEndpoint, { alunoId, valor, descricao });

    // Gravar o RUPE na base de dados com a referência oficial. Se mes/ano forem indicados
    // (propina de um mês específico), ficam associados para que, ao confirmar o pagamento,
    // o mês correspondente na caderneta seja marcado como pago automaticamente.
    const novo = await api.post<RUPEGerado>(rupeEndpoint, {
      alunoId,
      taxaId,
      valor,
      referencia: emis.referencia,
      dataGeracao: emis.dataGeracao,
      dataValidade: emis.dataValidade,
      status: 'ativo',
      mes: mes ?? undefined,
      ano: ano ?? undefined,
    });

    // Devolver com metadata de fonte para a UI poder indicar se é oficial
    const rupeComFonte: RUPEGerado = { ...novo, fonte: emis.fonte, ambiente: emis.ambiente };
    setRupes(prev => [rupeComFonte, ...prev]);
    return rupeComFonte;
  }

  async function updateRUPE(id: string, r: Partial<RUPEGerado>) {
    const updated = await api.put<RUPEGerado>(`/api/rupes/${id}`, r);
    setRupes(prev => prev.map(x => x.id === id ? { ...x, ...updated } : x));
  }

  function getRUPEsAluno(alunoId: string) {
    return rupes.filter(r => r.alunoId === alunoId).sort((a, b) => new Date(b.dataGeracao).getTime() - new Date(a.dataGeracao).getTime());
  }

  function getMesesEmAtraso(alunoId: string, anoAtual: string): number {
    const taxasPropina = taxas.filter(t => t.tipo === 'propina' && t.ativo && t.anoAcademico === anoAtual);
    if (taxasPropina.length === 0) return 0;

    const pagsAluno = pagamentos.filter(p => p.alunoId === alunoId && matchAno(p.ano, anoAtual) && p.status !== 'cancelado');
    const mesesPagos = new Set(pagsAluno.filter(p => p.status === 'pago').map(p => p.mes));
    const mesesPendentes = pagsAluno.filter(p => p.status === 'pendente').map(p => p.mes);

    const mesAtual = new Date().getMonth() + 1;
    const mesesLetivos = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
    const mesesPassados = mesesLetivos.filter(m => m <= mesAtual);

    let atraso = 0;
    for (const m of mesesPassados) {
      const pago = mesesPagos.has(m);
      const pendente = mesesPendentes.includes(m);
      if (!pago && !pendente) atraso++;
    }
    return atraso;
  }

  function calcularMulta(valorPropina: number, mesesAtraso: number): number {
    if (!multaConfig.ativo || mesesAtraso === 0) return 0;
    const hoje = new Date();
    const diaInicio = multaConfig.diaInicioMulta || 10;

    // ── Carência do mês mais recente ──────────────────────────────────────────
    // A multa de um mês M começa apenas a partir do dia diaInicioMulta do mês M+1.
    // Se hoje ainda não chegou o diaInicioMulta do mês corrente, o mês
    // imediatamente anterior ainda está em carência (sem multa).
    // Exemplo: diaInicioMulta=10, hoje=6 de Julho → Junho ainda sem multa.
    const mesesComMulta = (hoje.getDate() < diaInicio)
      ? Math.max(0, mesesAtraso - 1)
      : mesesAtraso;

    if (mesesComMulta === 0) return 0;

    if ((multaConfig.valorPorDia || 0) > 0) {
      const diasDesdeInicio = Math.max(0, hoje.getDate() - diaInicio);
      return Math.round((multaConfig.valorPorDia || 0) * (diasDesdeInicio + mesesComMulta * 30));
    }
    if ((multaConfig.percentagemPorDia || 0) > 0) {
      const diasDesdeInicio = Math.max(0, hoje.getDate() - diaInicio);
      const totalDias = diasDesdeInicio + mesesComMulta * 30;
      return Math.round(valorPropina * ((multaConfig.percentagemPorDia || 0) / 100) * totalDias);
    }
    return Math.round(valorPropina * (multaConfig.percentagem / 100) * mesesComMulta);
  }

  function getMultaAluno(alunoId: string, valorPropina: number, mesesAtraso: number): { valor: number; isento: boolean } {
    const isencao = isencoes.find(i => i.alunoId === alunoId && i.status === 'aprovado');
    if (isencao) return { valor: 0, isento: true };
    return { valor: calcularMulta(valorPropina, mesesAtraso), isento: false };
  }

  function getIsencaoAluno(alunoId: string): IsencaoMulta | null {
    return isencoes.find(i => i.alunoId === alunoId) || null;
  }

  async function solicitarIsencaoMulta(alunoId: string, justificativa: string, solicitadoPor: string): Promise<void> {
    const nova = await api.post<IsencaoMulta>('/api/multa-isencoes', { alunoId, justificativa, solicitadoPor });
    setIsencoes(prev => {
      const sem = prev.filter(i => i.alunoId !== alunoId);
      return [nova, ...sem];
    });
  }

  async function responderIsencaoMulta(id: string, status: 'aprovado' | 'rejeitado', aprovadoPor: string): Promise<void> {
    const updated = await api.put<IsencaoMulta>(`/api/multa-isencoes/${id}`, { status, aprovadoPor });
    setIsencoes(prev => prev.map(i => i.id === id ? updated : i));
  }

  function getSaldoAluno(alunoId: string): SaldoAluno | null {
    return saldos.find(s => s.alunoId === alunoId) || null;
  }

  function getMovimentosAluno(alunoId: string): MovimentoSaldo[] {
    return movimentosSaldo.filter(m => m.alunoId === alunoId).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async function creditarSaldo(alunoId: string, valor: number, descricao: string, dataProximaCobranca?: string, observacoes?: string, criadoPor?: string): Promise<SaldoAluno> {
    const result = await api.post<SaldoAluno>(`/api/saldo-alunos/${alunoId}/creditar`, { valor, descricao, dataProximaCobranca, observacoes, criadoPor });
    setSaldos(prev => {
      const idx = prev.findIndex(s => s.alunoId === alunoId);
      if (idx >= 0) return prev.map((s, i) => i === idx ? result : s);
      return [result, ...prev];
    });
    const novoMov: MovimentoSaldo = { id: Date.now().toString(), alunoId, tipo: 'credito', valor, descricao, criadoPor, createdAt: new Date().toISOString() };
    setMovimentosSaldo(prev => [novoMov, ...prev]);
    return result;
  }

  async function debitarSaldo(alunoId: string, valor: number, descricao: string, criadoPor?: string): Promise<SaldoAluno> {
    const result = await api.post<SaldoAluno>(`/api/saldo-alunos/${alunoId}/debitar`, { valor, descricao, criadoPor });
    setSaldos(prev => prev.map(s => s.alunoId === alunoId ? result : s));
    const novoMov: MovimentoSaldo = { id: Date.now().toString(), alunoId, tipo: 'debito', valor, descricao, criadoPor, createdAt: new Date().toISOString() };
    setMovimentosSaldo(prev => [novoMov, ...prev]);
    return result;
  }

  async function transferirPagamento(pagamentoId: string, destino: 'saldo' | string, criadoPor?: string): Promise<void> {
    const result = await api.post<{ pagamento: Pagamento; saldo?: SaldoAluno; novoPagamento?: Pagamento }>(
      `/api/pagamentos/${pagamentoId}/transferir`, { destino, criadoPor }
    );
    setPagamentos(prev => prev.map(p => p.id === pagamentoId ? { ...p, status: 'cancelado' } : p));
    if (result.saldo) {
      setSaldos(prev => {
        const idx = prev.findIndex(s => s.alunoId === result.saldo!.alunoId);
        if (idx >= 0) return prev.map((s, i) => i === idx ? result.saldo! : s);
        return [result.saldo!, ...prev];
      });
      const alunoId = result.pagamento.alunoId;
      const novoMov: MovimentoSaldo = { id: Date.now().toString(), alunoId, tipo: 'credito', valor: result.pagamento.valor, descricao: 'Pagamento transferido para saldo', pagamentoId, criadoPor, createdAt: new Date().toISOString() };
      setMovimentosSaldo(prev => [novoMov, ...prev]);
    }
    if (result.novoPagamento) {
      setPagamentos(prev => [result.novoPagamento!, ...prev]);
    }
  }

  const value = useMemo<FinanceiroContextValue>(() => ({
    taxas, pagamentos, multaConfig, faltasJustifConfig, mensagens, rupes, bloqueados, acessoLiberado, saldos, movimentosSaldo, isencoes, isLoading,
    addTaxa, updateTaxa, deleteTaxa,
    addPagamento, addPagamentoSelf, updatePagamento, deletePagamento, transferirPagamento,
    getTotalRecebido, getTotalPendente, getPagamentosAluno, getTaxasByNivel,
    updateMultaConfig, updateFaltasJustifConfig,
    bloquearAluno, desbloquearAluno, isAlunoBloqueado, togglePermitirAcessoPortal,
    enviarMensagem, getMensagensAluno, marcarMensagemLida, getUnreadMensagensAluno,
    gerarRUPE, updateRUPE, getRUPEsAluno,
    getMesesEmAtraso, calcularMulta, getMultaAluno,
    getSaldoAluno, getMovimentosAluno, creditarSaldo, debitarSaldo,
    solicitarIsencaoMulta, responderIsencaoMulta, getIsencaoAluno,
  }), [taxas, pagamentos, multaConfig, faltasJustifConfig, mensagens, rupes, bloqueados, acessoLiberado, saldos, movimentosSaldo, isencoes, isLoading]);

  return <FinanceiroContext.Provider value={value}>{children}</FinanceiroContext.Provider>;
}

export function useFinanceiro() {
  const ctx = useContext(FinanceiroContext);
  if (!ctx) throw new Error('useFinanceiro must be used within FinanceiroProvider');
  return ctx;
}
