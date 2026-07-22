import React, { createContext, useContext, useState, useEffect, useMemo, ReactNode } from 'react';
import { api } from '../lib/api';
import { useAuth } from './AuthContext';
import { isOfflineQueued, tempId, subscribeOnlineSync } from '../lib/optimistic';
import { tempoRelativo } from '../lib/tempoRelativo';
import { subscribeDataChange } from '@/lib/realtimeSync';

export type TipoNotificacao = 'info' | 'aviso' | 'urgente' | 'sucesso' | 'reabertura_aprovada' | string;

export interface Notificacao {
  id: string;
  titulo: string;
  mensagem: string;
  tipo: TipoNotificacao;
  data: string;
  lida: boolean;
  link?: string;
  enviadoPor?: string;
  createdAt: string;
}

interface NotificacoesContextValue {
  notificacoes: Notificacao[];
  unreadCount: number;
  isLoading: boolean;
  load: () => Promise<void>;
  addNotificacao: (n: Omit<Notificacao, 'id' | 'createdAt' | 'lida'>) => Promise<void>;
  marcarLida: (id: string) => Promise<void>;
  marcarTodasLidas: () => Promise<void>;
  deletarNotificacao: (id: string) => Promise<void>;
  limparTodas: () => Promise<void>;
}

const NotificacoesContext = createContext<NotificacoesContextValue | null>(null);

/** @deprecated Use tempoRelativo() from lib/tempoRelativo instead */
export function timeAgo(dateStr: string): string {
  return tempoRelativo(dateStr);
}

export function NotificacoesProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();
  const [notificacoes, setNotificacoes] = useState<Notificacao[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) return;
    load();
  }, [isAuthenticated]);

  useEffect(() => subscribeOnlineSync(() => { if (isAuthenticated) load(); }), [isAuthenticated]);

  // Tempo real via WS — recarrega quando há nova notificação ou mensagem
  useEffect(() => {
    if (!isAuthenticated) return;
    return subscribeDataChange((entity) => {
      if (['notificacoes', 'chat_interno', 'mensagens'].includes(entity)) {
        load();
      }
    });
  }, [isAuthenticated]);

  // Polling de fallback a cada 15s — garante sincronização mesmo sem WS
  useEffect(() => {
    if (!isAuthenticated) return;
    const interval = setInterval(() => { load(); }, 15000);
    return () => clearInterval(interval);
  }, [isAuthenticated]);

  async function load() {
    if (!isAuthenticated) return;
    try {
      const data = await api.get<Notificacao[]>('/api/notificacoes');
      setNotificacoes(data);
    } catch (e: any) {
      const msg = String(e?.message || '');
      const isAuthError = msg.startsWith('401') || msg.startsWith('403') || msg.includes('Unauthorized') || msg.includes('Forbidden');
      if (!isAuthError) {
        console.error('NotificacoesContext load error', e);
      }
    } finally {
      setIsLoading(false);
    }
  }

  async function addNotificacao(n: Omit<Notificacao, 'id' | 'createdAt' | 'lida'>) {
    const tmp: Notificacao = {
      ...(n as any),
      id: tempId('notif'),
      lida: false,
      createdAt: new Date().toISOString(),
    } as Notificacao;
    setNotificacoes(prev => [tmp, ...prev]);
    try {
      const nova = await api.post<Notificacao>('/api/notificacoes', { ...n, lida: false });
      if (isOfflineQueued(nova)) return;
      setNotificacoes(prev => prev.map(x => x.id === tmp.id ? nova : x));
    } catch (e) {
      setNotificacoes(prev => prev.filter(x => x.id !== tmp.id));
      throw e;
    }
  }

  async function marcarLida(id: string) {
    setNotificacoes(prev => prev.map(n => n.id === id ? { ...n, lida: true } : n));
    try {
      await api.put(`/api/notificacoes/${id}`, { lida: true });
    } catch (e) {
      setNotificacoes(prev => prev.map(n => n.id === id ? { ...n, lida: false } : n));
      throw e;
    }
  }

  async function marcarTodasLidas() {
    const previous = notificacoes;
    const unread = notificacoes.filter(n => !n.lida);
    setNotificacoes(prev => prev.map(n => ({ ...n, lida: true })));
    try {
      await Promise.all(unread.map(n => api.put(`/api/notificacoes/${n.id}`, { lida: true })));
    } catch (e) {
      setNotificacoes(previous);
      throw e;
    }
  }

  async function deletarNotificacao(id: string) {
    const previous = notificacoes.find(n => n.id === id);
    setNotificacoes(prev => prev.filter(n => n.id !== id));
    try {
      await api.delete(`/api/notificacoes/${id}`);
    } catch (e) {
      if (previous) setNotificacoes(prev => [previous, ...prev]);
      throw e;
    }
  }

  async function limparTodas() {
    const previous = notificacoes;
    setNotificacoes([]);
    try {
      await api.delete('/api/notificacoes');
    } catch (e) {
      setNotificacoes(previous);
      throw e;
    }
  }

  const unreadCount = useMemo(() => notificacoes.filter(n => !n.lida).length, [notificacoes]);

  return (
    <NotificacoesContext.Provider value={{
      notificacoes, unreadCount, isLoading,
      load,
      addNotificacao, marcarLida, marcarTodasLidas,
      deletarNotificacao, limparTodas,
    }}>
      {children}
    </NotificacoesContext.Provider>
  );
}

export function useNotificacoes(): NotificacoesContextValue {
  const ctx = useContext(NotificacoesContext);
  if (!ctx) throw new Error('useNotificacoes must be used within NotificacoesProvider');
  return ctx;
}
