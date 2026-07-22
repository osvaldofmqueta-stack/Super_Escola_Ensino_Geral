import React, { createContext, useContext, useState, useEffect, useMemo, useRef, ReactNode } from 'react';
import { Platform } from 'react-native';
import { api } from '../lib/api';
import { apiRequest } from '../lib/query-client';
import { getAuthToken } from './AuthContext';
import { isOfflineQueued, tempId, subscribeOnlineSync } from '../lib/optimistic';
import { subscribeDataChange } from '@/lib/realtimeSync';

export type RegistroStatus = 'pendente' | 'aprovado' | 'rejeitado';

export interface SolicitacaoRegistro {
  id: string;
  nomeCompleto: string;
  dataNascimento: string;
  genero: 'M' | 'F';
  provincia: string;
  municipio: string;
  nivel: string;
  classe: string;
  nomeEncarregado: string;
  telefoneEncarregado: string;
  observacoes: string;
  status: RegistroStatus;
  criadoEm: string;
  avaliadoEm?: string;
  avaliadoPor?: string;
  motivoRejeicao?: string;
}

interface RegistroContextValue {
  solicitacoes: SolicitacaoRegistro[];
  isLoading: boolean;
  submeterSolicitacao: (data: Omit<SolicitacaoRegistro, 'id' | 'status' | 'criadoEm'>) => Promise<void>;
  aprovarSolicitacao: (id: string, avaliadorNome: string) => Promise<void>;
  rejeitarSolicitacao: (id: string, avaliadorNome: string, motivo: string) => Promise<void>;
  deletarSolicitacao: (id: string) => Promise<void>;
  pendentes: SolicitacaoRegistro[];
  aprovadas: SolicitacaoRegistro[];
  rejeitadas: SolicitacaoRegistro[];
}

const RegistroContext = createContext<RegistroContextValue | null>(null);

export function RegistroProvider({ children }: { children: ReactNode }) {
  const [solicitacoes, setSolicitacoes] = useState<SolicitacaoRegistro[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryCount = useRef(0);

  useEffect(() => {
    load();
    return () => {
      if (retryRef.current) clearTimeout(retryRef.current);
    };
  }, []);

  // Re-sincroniza assim que a fila offline drena.
  useEffect(() => subscribeOnlineSync(() => load()), []);

  // Tempo real via WS — recarrega quando há novas solicitações
  useEffect(() => {
    return subscribeDataChange((entity) => {
      if (['registros', 'solicitacoes'].includes(entity)) {
        load();
      }
    });
  }, []);

  // Polling de fallback a cada 30s — garante sincronização mesmo sem WS
  useEffect(() => {
    const interval = setInterval(async () => {
      const token = await getAuthToken();
      if (token) load();
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  async function load() {
    if (retryRef.current) { clearTimeout(retryRef.current); retryRef.current = null; }
    try {
      const res = await apiRequest('GET', '/api/registros');
      const data: SolicitacaoRegistro[] = await res.json();
      retryCount.current = 0;
      setSolicitacoes(data);
    } catch (e: any) {
      const msg = String(e?.message || '');
      const isAuthError = msg.startsWith('401') || msg.startsWith('403') || msg.includes('Unauthorized') || msg.includes('Forbidden');
      if (!isAuthError) {
        retryCount.current += 1;
        if (retryCount.current <= 5) {
          retryRef.current = setTimeout(() => load(), 5000);
        }
      }
    } finally {
      setIsLoading(false);
    }
  }

  async function submeterSolicitacao(data: Omit<SolicitacaoRegistro, 'id' | 'status' | 'criadoEm'>) {
    const tmp: SolicitacaoRegistro = {
      ...(data as any),
      id: tempId('reg'),
      status: 'pendente',
      criadoEm: new Date().toISOString(),
    };
    setSolicitacoes(prev => [tmp, ...prev]);
    try {
      const nova = await api.post<SolicitacaoRegistro>('/api/registros', { ...data, status: 'pendente' });
      if (isOfflineQueued(nova)) return;
      setSolicitacoes(prev => prev.map(s => s.id === tmp.id ? nova : s));
    } catch (e) {
      setSolicitacoes(prev => prev.filter(s => s.id !== tmp.id));
      throw e;
    }
  }

  async function aprovarSolicitacao(id: string, avaliadorNome: string) {
    const previous = solicitacoes.find(s => s.id === id);
    const patch: Partial<SolicitacaoRegistro> = {
      status: 'aprovado',
      avaliadoEm: new Date().toISOString(),
      avaliadoPor: avaliadorNome,
    };
    setSolicitacoes(prev => prev.map(s => s.id === id ? { ...s, ...patch } as SolicitacaoRegistro : s));
    try {
      const updated = await api.put<SolicitacaoRegistro>(`/api/registros/${id}`, patch);
      if (isOfflineQueued(updated)) return;
      setSolicitacoes(prev => prev.map(s => s.id === id ? updated : s));
    } catch (e) {
      if (previous) setSolicitacoes(prev => prev.map(s => s.id === id ? previous : s));
      throw e;
    }
  }

  async function rejeitarSolicitacao(id: string, avaliadorNome: string, motivo: string) {
    const previous = solicitacoes.find(s => s.id === id);
    const patch: Partial<SolicitacaoRegistro> = {
      status: 'rejeitado',
      avaliadoEm: new Date().toISOString(),
      avaliadoPor: avaliadorNome,
      motivoRejeicao: motivo,
    };
    setSolicitacoes(prev => prev.map(s => s.id === id ? { ...s, ...patch } as SolicitacaoRegistro : s));
    try {
      const updated = await api.put<SolicitacaoRegistro>(`/api/registros/${id}`, patch);
      if (isOfflineQueued(updated)) return;
      setSolicitacoes(prev => prev.map(s => s.id === id ? updated : s));
    } catch (e) {
      if (previous) setSolicitacoes(prev => prev.map(s => s.id === id ? previous : s));
      throw e;
    }
  }

  async function deletarSolicitacao(id: string) {
    const previous = solicitacoes.find(s => s.id === id);
    setSolicitacoes(prev => prev.filter(s => s.id !== id));
    try {
      await api.delete(`/api/registros/${id}`);
    } catch (e) {
      if (previous) setSolicitacoes(prev => [previous, ...prev]);
      throw e;
    }
  }

  const pendentes = useMemo(() => solicitacoes.filter(s => s.status === 'pendente'), [solicitacoes]);
  const aprovadas = useMemo(() => solicitacoes.filter(s => s.status === 'aprovado'), [solicitacoes]);
  const rejeitadas = useMemo(() => solicitacoes.filter(s => s.status === 'rejeitado'), [solicitacoes]);

  return (
    <RegistroContext.Provider value={{
      solicitacoes, isLoading,
      submeterSolicitacao, aprovarSolicitacao, rejeitarSolicitacao, deletarSolicitacao,
      pendentes, aprovadas, rejeitadas,
    }}>
      {children}
    </RegistroContext.Provider>
  );
}

export function useRegistro(): RegistroContextValue {
  const ctx = useContext(RegistroContext);
  if (!ctx) throw new Error('useRegistro must be used within RegistroProvider');
  return ctx;
}
