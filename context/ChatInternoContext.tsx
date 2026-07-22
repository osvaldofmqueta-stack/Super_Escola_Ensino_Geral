import React, {
  createContext, useContext, useState, useCallback, useEffect, ReactNode,
} from 'react';
import { useAuth } from './AuthContext';
import { api } from '@/lib/api';
import { isOfflineQueued, tempId, subscribeOnlineSync } from '@/lib/optimistic';
import { subscribeDataChange } from '@/lib/realtimeSync';

export interface ChatAnexo {
  url: string;
  nome: string;
  tipo: 'image' | 'file';
  tamanho: number;
}

export interface ChatReacao {
  emoji: string;
  count: number;
  myReaction: boolean;
}

export interface ChatMsg {
  id: string;
  remetenteId: string;
  remetenteNome: string;
  remetenteRole: string;
  destinatarioId: string;
  destinatarioNome: string;
  destinatarioRole: string;
  corpo: string;
  lida: boolean;
  createdAt: string;
  anexos?: ChatAnexo[];
  reacoes?: ChatReacao[];
}

interface Conversation {
  userId: string;
  userName: string;
  userRole: string;
  lastMsg: ChatMsg;
  unread: number;
  msgs: ChatMsg[];
}

interface ChatInternoCtx {
  mensagens: ChatMsg[];
  conversations: Conversation[];
  unreadTotal: number;
  isLoading: boolean;
  loadMensagens: () => Promise<void>;
  sendMensagem: (destinatarioId: string, destinatarioNome: string, destinatarioRole: string, corpo: string, anexos?: ChatAnexo[]) => Promise<void>;
  markRead: (id: string) => Promise<void>;
  markConversationRead: (otherUserId: string) => Promise<void>;
}

const Ctx = createContext<ChatInternoCtx | null>(null);

export function ChatInternoProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [mensagens, setMensagens] = useState<ChatMsg[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const loadMensagens = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);
    try {
      const data = await api.get<ChatMsg[]>('/api/chat-interno');
      setMensagens(data);
    } catch {
      // silently ignore
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;
    loadMensagens();
    const interval = setInterval(loadMensagens, 15000);
    return () => clearInterval(interval);
  }, [user, loadMensagens]);

  useEffect(() => subscribeOnlineSync(() => { if (user) loadMensagens(); }), [user, loadMensagens]);

  // Tempo real via WS — recarrega imediatamente quando há nova mensagem
  useEffect(() => {
    if (!user) return;
    return subscribeDataChange((entity) => {
      if (['chat_interno'].includes(entity)) {
        loadMensagens();
      }
    });
  }, [user, loadMensagens]);

  const conversations: Conversation[] = React.useMemo(() => {
    if (!user) return [];
    const map = new Map<string, { msgs: ChatMsg[]; user: { id: string; name: string; role: string } }>();

    for (const m of mensagens) {
      const otherId = m.remetenteId === user.id ? m.destinatarioId : m.remetenteId;
      const otherName = m.remetenteId === user.id ? m.destinatarioNome : m.remetenteNome;
      const otherRole = m.remetenteId === user.id ? m.destinatarioRole : m.remetenteRole;
      if (!map.has(otherId)) {
        map.set(otherId, { msgs: [], user: { id: otherId, name: otherName, role: otherRole } });
      }
      map.get(otherId)!.msgs.push(m);
    }

    return Array.from(map.values()).map(({ msgs, user: u }) => {
      const sorted = [...msgs].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      const unread = sorted.filter(m => !m.lida && m.destinatarioId === user.id).length;
      return {
        userId: u.id,
        userName: u.name,
        userRole: u.role,
        lastMsg: sorted[sorted.length - 1],
        unread,
        msgs: sorted,
      };
    }).sort((a, b) => new Date(b.lastMsg.createdAt).getTime() - new Date(a.lastMsg.createdAt).getTime());
  }, [mensagens, user]);

  const unreadTotal = React.useMemo(
    () => mensagens.filter(m => !m.lida && m.destinatarioId === user?.id).length,
    [mensagens, user],
  );

  const sendMensagem = useCallback(async (
    destinatarioId: string,
    destinatarioNome: string,
    destinatarioRole: string,
    corpo: string,
    anexos?: ChatAnexo[],
  ) => {
    if (!user) return;
    const tmp: ChatMsg = {
      id: tempId('chat'),
      remetenteId: user.id,
      remetenteNome: user.nome,
      remetenteRole: user.role,
      destinatarioId,
      destinatarioNome,
      destinatarioRole,
      corpo,
      lida: false,
      createdAt: new Date().toISOString(),
      anexos: anexos ?? [],
    };
    setMensagens(prev => [...prev, tmp]);
    try {
      const nova = await api.post<ChatMsg>('/api/chat-interno', {
        destinatarioId,
        destinatarioNome,
        destinatarioRole,
        corpo,
        anexos: anexos ?? [],
        remetenteNome: user.nome,
        remetenteRole: user.role,
      });
      if (isOfflineQueued(nova)) return;
      setMensagens(prev => prev.map(m => m.id === tmp.id ? nova : m));
    } catch (e) {
      setMensagens(prev => prev.filter(m => m.id !== tmp.id));
      throw e;
    }
  }, [user]);

  const markRead = useCallback(async (id: string) => {
    setMensagens(prev => prev.map(m => m.id === id ? { ...m, lida: true } : m));
    try {
      const updated = await api.put<ChatMsg>(`/api/chat-interno/${id}/ler`, {});
      if (isOfflineQueued(updated)) return;
      setMensagens(prev => prev.map(m => m.id === id ? updated : m));
    } catch {
      // já está marcada como lida no UI; servidor receberá no próximo sync
    }
  }, []);

  const markConversationRead = useCallback(async (otherUserId: string) => {
    const toMark = mensagens.filter(m => !m.lida && m.remetenteId === otherUserId && m.destinatarioId === user?.id);
    for (const m of toMark) {
      await markRead(m.id);
    }
  }, [mensagens, markRead, user]);

  return (
    <Ctx.Provider value={{ mensagens, conversations, unreadTotal, isLoading, loadMensagens, sendMensagem, markRead, markConversationRead }}>
      {children}
    </Ctx.Provider>
  );
}

export function useChatInterno() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useChatInterno must be used within ChatInternoProvider');
  return ctx;
}
