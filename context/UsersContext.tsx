import React, { createContext, useContext, useState, useEffect, useMemo, ReactNode } from 'react';
import { api } from '../lib/api';
import { UserRole, useAuth } from './AuthContext';
import { isOfflineQueued, tempId, subscribeOnlineSync } from '../lib/optimistic';
import { subscribeDataChange } from '@/lib/realtimeSync';

const ROLES_WITH_USER_ACCESS: UserRole[] = ['ceo', 'pca', 'admin', 'director'];

export interface StoredUser {
  id: string;
  nome: string;
  email: string;
  senha: string;
  role: UserRole;
  escola: string;
  ativo: boolean;
  alunoId?: string;
  telefone?: string;
  avatar?: string;
  genero?: 'M' | 'F' | '';
  departamento?: string;
  cargo?: string;
  cursoId?: string;
  criadoEm: string;
}

interface UsersContextValue {
  users: StoredUser[];
  isLoading: boolean;
  addUser: (u: Omit<StoredUser, 'id' | 'criadoEm'>) => Promise<StoredUser>;
  updateUser: (id: string, u: Partial<StoredUser>) => Promise<void>;
  deleteUser: (id: string) => Promise<void>;
  findByCredentials: (email: string, senha: string) => StoredUser | null;
  changePassword: (id: string, novaSenha: string) => Promise<void>;
  refreshUsers: () => Promise<void>;
}

const UsersContext = createContext<UsersContextValue | null>(null);

export function UsersProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated, user } = useAuth();
  const [users, setUsers] = useState<StoredUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const canAccessUsers = isAuthenticated && !!user?.role && ROLES_WITH_USER_ACCESS.includes(user.role);

  useEffect(() => {
    if (canAccessUsers) {
      load();
    } else {
      setIsLoading(false);
    }
  }, [canAccessUsers]);

  useEffect(() => subscribeOnlineSync(() => { if (canAccessUsers) load(); }), [canAccessUsers]);

  // Tempo real via WS — recarrega quando utilizadores são criados/editados
  useEffect(() => {
    if (!canAccessUsers) return;
    return subscribeDataChange((entity) => {
      if (['utilizadores'].includes(entity)) {
        load();
      }
    });
  }, [canAccessUsers]);

  // Polling de fallback a cada 30s — garante sincronização mesmo sem WS
  useEffect(() => {
    if (!canAccessUsers) return;
    const interval = setInterval(() => { load(); }, 30000);
    return () => clearInterval(interval);
  }, [canAccessUsers]);

  async function load() {
    try {
      const data = await api.get<StoredUser[]>('/api/utilizadores');
      setUsers(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setUsers([]);
    } finally {
      setIsLoading(false);
    }
  }

  async function addUser(u: Omit<StoredUser, 'id' | 'criadoEm'>): Promise<StoredUser> {
    const tmp: StoredUser = { ...(u as any), id: tempId('user'), criadoEm: new Date().toISOString() } as StoredUser;
    setUsers(prev => [...prev, tmp]);
    try {
      const novo = await api.post<StoredUser>('/api/utilizadores', u);
      if (isOfflineQueued(novo)) return tmp;
      setUsers(prev => prev.map(x => x.id === tmp.id ? novo : x));
      return novo;
    } catch (e) {
      setUsers(prev => prev.filter(x => x.id !== tmp.id));
      throw e;
    }
  }

  async function updateUser(id: string, u: Partial<StoredUser>) {
    const previous = users.find(x => x.id === id);
    setUsers(prev => prev.map(x => x.id === id ? { ...x, ...u } as StoredUser : x));
    try {
      const updated = await api.put<StoredUser>(`/api/utilizadores/${id}`, u);
      if (isOfflineQueued(updated)) return;
      setUsers(prev => prev.map(x => x.id === id ? updated : x));
    } catch (e) {
      if (previous) setUsers(prev => prev.map(x => x.id === id ? previous : x));
      throw e;
    }
  }

  async function deleteUser(id: string) {
    const previous = users.find(x => x.id === id);
    setUsers(prev => prev.filter(x => x.id !== id));
    try {
      await api.delete(`/api/utilizadores/${id}`);
    } catch (e) {
      if (previous) setUsers(prev => [...prev, previous]);
      throw e;
    }
  }

  function findByCredentials(email: string, senha: string): StoredUser | null {
    return users.find(u =>
      u.email.toLowerCase() === email.toLowerCase() && u.senha === senha && u.ativo
    ) || null;
  }

  async function changePassword(id: string, novaSenha: string) {
    await updateUser(id, { senha: novaSenha });
  }

  const value = useMemo<UsersContextValue>(() => ({
    users, isLoading,
    addUser, updateUser, deleteUser, findByCredentials, changePassword,
    refreshUsers: load,
  }), [users, isLoading]);

  return <UsersContext.Provider value={value}>{children}</UsersContext.Provider>;
}

export function useUsers() {
  const ctx = useContext(UsersContext);
  if (!ctx) throw new Error('useUsers must be used within UsersProvider');
  return ctx;
}
