import React, { createContext, useContext, useState, useEffect, useMemo, ReactNode } from 'react';
import { api } from '../lib/api';
import { useAuth } from './AuthContext';
import { isOfflineQueued, tempId, subscribeOnlineSync } from '../lib/optimistic';
import { subscribeDataChange } from '@/lib/realtimeSync';

export interface Pauta {
  id: string;
  turmaId: string;
  disciplina: string;
  trimestre: 1 | 2 | 3;
  professorId: string;
  status: 'aberta' | 'fechada' | 'pendente_abertura' | 'rejeitada';
  anoLetivo: string;
  dataFecho?: string;
  createdAt: string;
  numero?: number;
}

export interface SolicitacaoAbertura {
  id: string;
  pautaId: string;
  turmaId: string;
  turmaNome: string;
  disciplina: string;
  trimestre: 1 | 2 | 3;
  professorId: string;
  professorNome: string;
  motivo: string;
  status: 'pendente' | 'aprovada' | 'rejeitada';
  createdAt: string;
  respondidoEm?: string;
  observacao?: string;
}

export interface Mensagem {
  id: string;
  remetenteId: string;
  remetenteNome: string;
  tipo: 'turma' | 'privada';
  turmaId?: string;
  turmaNome?: string;
  destinatarioId?: string;
  destinatarioNome?: string;
  destinatarioTipo?: 'professor' | 'aluno';
  assunto: string;
  corpo: string;
  lidaPor: string[];
  createdAt: string;
}

export interface Material {
  id: string;
  professorId: string;
  turmaId: string;
  turmaNome: string;
  disciplina: string;
  titulo: string;
  descricao: string;
  tipo: 'texto' | 'link' | 'resumo' | 'pdf' | 'docx' | 'ppt';
  conteudo: string;
  nomeArquivo?: string;
  tamanhoArquivo?: number;
  createdAt: string;
}

export interface Sumario {
  id: string;
  professorId: string;
  professorNome: string;
  turmaId: string;
  turmaNome: string;
  disciplina: string;
  data: string;
  horaInicio: string;
  horaFim: string;
  numeroAula: number;
  conteudo: string;
  status: 'pendente' | 'aceite' | 'rejeitado';
  observacaoRH?: string;
  createdAt: string;
}

export interface CalendarioProva {
  id: string;
  titulo: string;
  descricao: string;
  turmasIds: string[];
  disciplina: string;
  data: string;
  hora: string;
  tipo: 'teste' | 'exame' | 'trabalho' | 'prova_oral';
  publicado: boolean;
  createdAt: string;
}

interface ProfessorContextValue {
  pautas: Pauta[];
  solicitacoes: SolicitacaoAbertura[];
  mensagens: Mensagem[];
  materiais: Material[];
  sumarios: Sumario[];
  calendarioProvas: CalendarioProva[];
  isLoading: boolean;
  addPauta: (p: Omit<Pauta, 'id' | 'createdAt'>) => Promise<Pauta>;
  updatePauta: (id: string, p: Partial<Pauta>) => Promise<void>;
  getPautaByKey: (turmaId: string, disciplina: string, trimestre: 1 | 2 | 3) => Pauta | undefined;
  addSolicitacao: (s: Omit<SolicitacaoAbertura, 'id' | 'createdAt'>) => Promise<void>;
  updateSolicitacao: (id: string, s: Partial<SolicitacaoAbertura>) => Promise<void>;
  addMensagem: (m: Omit<Mensagem, 'id' | 'createdAt' | 'lidaPor'>) => Promise<void>;
  marcarMensagemLida: (id: string, userId: string) => Promise<void>;
  addMaterial: (m: Omit<Material, 'id' | 'createdAt'>) => Promise<void>;
  deleteMaterial: (id: string) => Promise<void>;
  addSumario: (s: Omit<Sumario, 'id' | 'createdAt'>) => Promise<void>;
  updateSumario: (id: string, s: Partial<Sumario>) => Promise<void>;
  addCalendarioProva: (c: Omit<CalendarioProva, 'id' | 'createdAt'>) => Promise<void>;
  updateCalendarioProva: (id: string, c: Partial<CalendarioProva>) => Promise<void>;
  deleteCalendarioProva: (id: string) => Promise<void>;
}

const ProfessorContext = createContext<ProfessorContextValue | null>(null);

export function ProfessorProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [pautas, setPautas] = useState<Pauta[]>([]);
  const [solicitacoes, setSolicitacoes] = useState<SolicitacaoAbertura[]>([]);
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [materiais, setMateriais] = useState<Material[]>([]);
  const [sumarios, setSumarios] = useState<Sumario[]>([]);
  const [calendarioProvas, setCalendarioProvas] = useState<CalendarioProva[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      setPautas([]);
      setSolicitacoes([]);
      setMensagens([]);
      setMateriais([]);
      setSumarios([]);
      setCalendarioProvas([]);
      setIsLoading(false);
      return;
    }
    loadAll();
  }, [authLoading, isAuthenticated]);

  useEffect(() => subscribeOnlineSync(() => { if (isAuthenticated) loadAll(); }), [isAuthenticated]);

  // Tempo real via WS — recarrega imediatamente quando dados do professor mudam
  useEffect(() => {
    if (!isAuthenticated) return;
    return subscribeDataChange((entity) => {
      if (['pautas', 'sumarios', 'planificacoes', 'presencas', 'notas', 'horarios', 'professor_materiais'].includes(entity)) {
        loadAll({ silent: true });
      }
    });
  }, [isAuthenticated]);

  // Polling de fallback a cada 2min (reduzido de 5min) — garante sincronização mesmo sem WS
  useEffect(() => {
    if (!isAuthenticated) return;
    const interval = setInterval(() => { loadAll({ silent: true }); }, 120000);
    return () => clearInterval(interval);
  }, [isAuthenticated]);

  async function safeFetch<T>(path: string, fallback: T): Promise<T> {
    try { return await api.get<T>(path); } catch { return fallback; }
  }

  async function loadAll({ silent = false }: { silent?: boolean } = {}) {
    try {
      if (!silent) setIsLoading(true);
      const [p, s, m, mat, sum, cal] = await Promise.all([
        safeFetch<Pauta[]>('/api/pautas', []),
        safeFetch<SolicitacaoAbertura[]>('/api/solicitacoes-abertura', []),
        safeFetch<Mensagem[]>('/api/mensagens', []),
        safeFetch<Material[]>('/api/materiais', []),
        safeFetch<Sumario[]>('/api/sumarios', []),
        safeFetch<CalendarioProva[]>('/api/calendario-provas', []),
      ]);
      setPautas(p);
      setSolicitacoes(s);
      setMensagens(m);
      setMateriais(mat);
      setSumarios(sum);
      setCalendarioProvas(cal);
    } catch (e) {
      console.error('ProfessorContext load error', e);
    } finally {
      if (!silent) setIsLoading(false);
    }
  }

  async function addPauta(p: Omit<Pauta, 'id' | 'createdAt'>): Promise<Pauta> {
    const tmp: Pauta = { ...(p as any), id: tempId('pauta'), createdAt: new Date().toISOString() } as Pauta;
    setPautas(prev => [tmp, ...prev]);
    try {
      const nova = await api.post<Pauta>('/api/pautas', p);
      if (isOfflineQueued(nova)) return tmp;
      setPautas(prev => prev.map(x => x.id === tmp.id ? nova : x));
      return nova;
    } catch (e) {
      setPautas(prev => prev.filter(x => x.id !== tmp.id));
      throw e;
    }
  }

  async function updatePauta(id: string, p: Partial<Pauta>) {
    const previous = pautas.find(x => x.id === id);
    setPautas(prev => prev.map(x => x.id === id ? { ...x, ...p } as Pauta : x));
    try {
      const updated = await api.put<Pauta>(`/api/pautas/${id}`, p);
      if (isOfflineQueued(updated)) return;
      setPautas(prev => prev.map(x => x.id === id ? updated : x));
    } catch (e) {
      if (previous) setPautas(prev => prev.map(x => x.id === id ? previous : x));
      throw e;
    }
  }

  function getPautaByKey(turmaId: string, disciplina: string, trimestre: 1 | 2 | 3): Pauta | undefined {
    return pautas.find(p => p.turmaId === turmaId && p.disciplina === disciplina && p.trimestre === trimestre);
  }

  async function addSolicitacao(s: Omit<SolicitacaoAbertura, 'id' | 'createdAt'>) {
    const tmp: SolicitacaoAbertura = { ...(s as any), id: tempId('sol'), createdAt: new Date().toISOString() } as SolicitacaoAbertura;
    setSolicitacoes(prev => [tmp, ...prev]);
    try {
      const nova = await api.post<SolicitacaoAbertura>('/api/solicitacoes-abertura', s);
      if (isOfflineQueued(nova)) return;
      setSolicitacoes(prev => prev.map(x => x.id === tmp.id ? nova : x));
    } catch (e) {
      setSolicitacoes(prev => prev.filter(x => x.id !== tmp.id));
      throw e;
    }
  }

  async function updateSolicitacao(id: string, s: Partial<SolicitacaoAbertura>) {
    const previous = solicitacoes.find(x => x.id === id);
    setSolicitacoes(prev => prev.map(x => x.id === id ? { ...x, ...s } as SolicitacaoAbertura : x));
    try {
      const updated = await api.put<SolicitacaoAbertura>(`/api/solicitacoes-abertura/${id}`, s);
      if (isOfflineQueued(updated)) return;
      setSolicitacoes(prev => prev.map(x => x.id === id ? updated : x));
    } catch (e) {
      if (previous) setSolicitacoes(prev => prev.map(x => x.id === id ? previous : x));
      throw e;
    }
  }

  async function addMensagem(m: Omit<Mensagem, 'id' | 'createdAt' | 'lidaPor'>) {
    const tmp: Mensagem = { ...(m as any), id: tempId('msg'), createdAt: new Date().toISOString(), lidaPor: [m.remetenteId] } as Mensagem;
    setMensagens(prev => [tmp, ...prev]);
    try {
      const nova = await api.post<Mensagem>('/api/mensagens', { ...m, lidaPor: [m.remetenteId] });
      if (isOfflineQueued(nova)) return;
      setMensagens(prev => prev.map(x => x.id === tmp.id ? nova : x));
    } catch (e) {
      setMensagens(prev => prev.filter(x => x.id !== tmp.id));
      throw e;
    }
  }

  async function marcarMensagemLida(id: string, userId: string) {
    const msg = mensagens.find(x => x.id === id);
    if (!msg || msg.lidaPor.includes(userId)) return;
    const novaLidaPor = [...msg.lidaPor, userId];
    setMensagens(prev => prev.map(x => x.id === id ? { ...x, lidaPor: novaLidaPor } : x));
    try {
      const updated = await api.put<Mensagem>(`/api/mensagens/${id}`, { lidaPor: novaLidaPor });
      if (isOfflineQueued(updated)) return;
      setMensagens(prev => prev.map(x => x.id === id ? updated : x));
    } catch (e) {
      setMensagens(prev => prev.map(x => x.id === id ? msg : x));
      throw e;
    }
  }

  async function addMaterial(m: Omit<Material, 'id' | 'createdAt'>) {
    const tmp: Material = { ...(m as any), id: tempId('mat'), createdAt: new Date().toISOString() } as Material;
    setMateriais(prev => [tmp, ...prev]);
    try {
      const novo = await api.post<Material>('/api/materiais', m);
      if (isOfflineQueued(novo)) return;
      setMateriais(prev => prev.map(x => x.id === tmp.id ? novo : x));
    } catch (e) {
      setMateriais(prev => prev.filter(x => x.id !== tmp.id));
      throw e;
    }
  }

  async function deleteMaterial(id: string) {
    const previous = materiais.find(x => x.id === id);
    setMateriais(prev => prev.filter(x => x.id !== id));
    try {
      await api.delete(`/api/materiais/${id}`);
    } catch (e) {
      if (previous) setMateriais(prev => [previous, ...prev]);
      throw e;
    }
  }

  async function addSumario(s: Omit<Sumario, 'id' | 'createdAt'>) {
    const tmp: Sumario = { ...(s as any), id: tempId('sum'), createdAt: new Date().toISOString() } as Sumario;
    setSumarios(prev => [tmp, ...prev]);
    try {
      const novo = await api.post<Sumario>('/api/sumarios', s);
      if (isOfflineQueued(novo)) return;
      setSumarios(prev => prev.map(x => x.id === tmp.id ? novo : x));
    } catch (e) {
      setSumarios(prev => prev.filter(x => x.id !== tmp.id));
      throw e;
    }
  }

  async function updateSumario(id: string, s: Partial<Sumario>) {
    const previous = sumarios.find(x => x.id === id);
    setSumarios(prev => prev.map(x => x.id === id ? { ...x, ...s } as Sumario : x));
    try {
      const updated = await api.put<Sumario>(`/api/sumarios/${id}`, s);
      if (isOfflineQueued(updated)) return;
      setSumarios(prev => prev.map(x => x.id === id ? updated : x));
    } catch (e) {
      if (previous) setSumarios(prev => prev.map(x => x.id === id ? previous : x));
      throw e;
    }
  }

  async function addCalendarioProva(c: Omit<CalendarioProva, 'id' | 'createdAt'>) {
    const tmp: CalendarioProva = { ...(c as any), id: tempId('prova'), createdAt: new Date().toISOString() } as CalendarioProva;
    setCalendarioProvas(prev => [tmp, ...prev]);
    try {
      const nova = await api.post<CalendarioProva>('/api/calendario-provas', c);
      if (isOfflineQueued(nova)) return;
      setCalendarioProvas(prev => prev.map(x => x.id === tmp.id ? nova : x));
    } catch (e) {
      setCalendarioProvas(prev => prev.filter(x => x.id !== tmp.id));
      throw e;
    }
  }

  async function updateCalendarioProva(id: string, c: Partial<CalendarioProva>) {
    const previous = calendarioProvas.find(x => x.id === id);
    setCalendarioProvas(prev => prev.map(x => x.id === id ? { ...x, ...c } as CalendarioProva : x));
    try {
      const updated = await api.put<CalendarioProva>(`/api/calendario-provas/${id}`, c);
      if (isOfflineQueued(updated)) return;
      setCalendarioProvas(prev => prev.map(x => x.id === id ? updated : x));
    } catch (e) {
      if (previous) setCalendarioProvas(prev => prev.map(x => x.id === id ? previous : x));
      throw e;
    }
  }

  async function deleteCalendarioProva(id: string) {
    const previous = calendarioProvas.find(x => x.id === id);
    setCalendarioProvas(prev => prev.filter(x => x.id !== id));
    try {
      await api.delete(`/api/calendario-provas/${id}`);
    } catch (e) {
      if (previous) setCalendarioProvas(prev => [previous, ...prev]);
      throw e;
    }
  }

  const value = useMemo<ProfessorContextValue>(() => ({
    pautas, solicitacoes, mensagens, materiais, sumarios, calendarioProvas, isLoading,
    addPauta, updatePauta, getPautaByKey,
    addSolicitacao, updateSolicitacao,
    addMensagem, marcarMensagemLida,
    addMaterial, deleteMaterial,
    addSumario, updateSumario,
    addCalendarioProva, updateCalendarioProva, deleteCalendarioProva,
  }), [pautas, solicitacoes, mensagens, materiais, sumarios, calendarioProvas, isLoading]);

  return <ProfessorContext.Provider value={value}>{children}</ProfessorContext.Provider>;
}

export function useProfessor() {
  const ctx = useContext(ProfessorContext);
  if (!ctx) throw new Error('useProfessor must be used within ProfessorProvider');
  return ctx;
}
