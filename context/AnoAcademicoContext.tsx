import React, { createContext, useContext, useState, useEffect, useMemo, useRef, ReactNode } from 'react';
import { Platform } from 'react-native';
import { api } from '../lib/api';
import { apiRequest } from '../lib/query-client';
import { getAuthToken } from './AuthContext';
import { isOfflineQueued, tempId, subscribeOnlineSync } from '../lib/optimistic';
import { subscribeDataChange } from '@/lib/realtimeSync';
import { normalizeAnoLetivo, anoLetivoDeHoje, anoInicioDe } from '@/lib/anoLetivo';

export interface Trimestre {
  numero: 1 | 2 | 3;
  dataInicio: string;
  dataFim: string;
  dataInicioExames?: string;
  dataFimExames?: string;
  ativo: boolean;
}

export interface EpocaExameItem {
  dataInicio?: string;
  dataFim?: string;
  observacoes?: string;
}

export interface EpocasExame {
  normal?: EpocaExameItem;
  recurso?: EpocaExameItem;
  especial?: EpocaExameItem;
}

export interface AnoAcademico {
  id: string;
  ano: string;
  dataInicio: string;
  dataFim: string;
  ativo: boolean;
  trimestres: Trimestre[];
  epocasExame?: EpocasExame;
}

interface AnoAcademicoContextValue {
  anos: AnoAcademico[];
  anoAtivo: AnoAcademico | null;
  anoSelecionado: AnoAcademico | null;
  setAnoSelecionado: (ano: AnoAcademico) => void;
  addAno: (a: Omit<AnoAcademico, 'id'>) => Promise<void>;
  updateAno: (id: string, a: Partial<AnoAcademico>) => Promise<void>;
  deleteAno: (id: string) => Promise<void>;
  ativarAno: (id: string) => Promise<void>;
  isLoading: boolean;
  trimestreAtual: Trimestre | null;
  /**
   * Ano lectivo activo no formato canónico "YYYY/YYYY".
   * Nunca devolve um ano civil simples.
   * Usar este valor em todos os filtros, relatórios e documentos académicos.
   */
  anoLetivoStr: string;
  /**
   * Ano de início do ano lectivo activo (número inteiro).
   * Ex: se anoLetivoStr = "2025/2026", anoLetivoInicio = 2025.
   */
  anoLetivoInicio: number;
}

const AnoAcademicoContext = createContext<AnoAcademicoContextValue | null>(null);

export function AnoAcademicoProvider({ children }: { children: ReactNode }) {
  const [anos, setAnos] = useState<AnoAcademico[]>([]);
  const [anoSelecionado, setAnoSelecionadoState] = useState<AnoAcademico | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryCount = useRef(0);

  useEffect(() => {
    loadAnos();
    return () => {
      if (retryRef.current) clearTimeout(retryRef.current);
    };
  }, []);

  useEffect(() => subscribeOnlineSync(() => loadAnos()), []);

  // Tempo real via WS — recarrega quando o ano académico é alterado
  useEffect(() => {
    return subscribeDataChange((entity) => {
      if (['anos_academicos'].includes(entity)) {
        loadAnos();
      }
    });
  }, []);

  // Polling de fallback a cada 60s — garante sincronização mesmo sem WS
  useEffect(() => {
    const interval = setInterval(async () => {
      const token = await getAuthToken();
      if (token) loadAnos();
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  async function loadAnos() {
    if (retryRef.current) { clearTimeout(retryRef.current); retryRef.current = null; }
    try {
      const res = await apiRequest('GET', '/api/anos-academicos');
      const data: AnoAcademico[] = await res.json();
      retryCount.current = 0;
      setAnos(data);
      const active = data.find(a => a.ativo) || data[data.length - 1] || null;
      setAnoSelecionadoState(active);
    } catch (e: any) {
      const msg = String(e?.message || '');
      const isAuthError = msg.startsWith('401') || msg.startsWith('403') || msg.includes('Unauthorized') || msg.includes('Forbidden');
      if (!isAuthError) {
        retryCount.current += 1;
        if (retryCount.current <= 5) {
          retryRef.current = setTimeout(() => loadAnos(), 5000);
        }
      }
    } finally {
      setIsLoading(false);
    }
  }

  async function addAno(a: Omit<AnoAcademico, 'id'>) {
    const tmp: AnoAcademico = { ...(a as any), id: tempId('ano') } as AnoAcademico;
    setAnos(prev => [...prev, tmp]);
    if (!anoSelecionado) setAnoSelecionadoState(tmp);
    try {
      const novo = await api.post<AnoAcademico>('/api/anos-academicos', a);
      if (isOfflineQueued(novo)) return;
      setAnos(prev => prev.map(x => x.id === tmp.id ? novo : x));
      if (anoSelecionado?.id === tmp.id || !anoSelecionado) setAnoSelecionadoState(novo);
    } catch (e) {
      setAnos(prev => prev.filter(x => x.id !== tmp.id));
      if (anoSelecionado?.id === tmp.id) setAnoSelecionadoState(null);
      throw e;
    }
  }

  async function updateAno(id: string, a: Partial<AnoAcademico>) {
    const previous = anos.find(x => x.id === id);
    const merged = previous ? { ...previous, ...a } as AnoAcademico : null;
    setAnos(prev => prev.map(x => x.id === id ? { ...x, ...a } as AnoAcademico : x));
    if (anoSelecionado?.id === id && merged) setAnoSelecionadoState(merged);
    try {
      const updated = await api.put<AnoAcademico>(`/api/anos-academicos/${id}`, a);
      if (isOfflineQueued(updated)) return;
      setAnos(prev => prev.map(x => x.id === id ? updated : x));
      if (anoSelecionado?.id === id) setAnoSelecionadoState(updated);
    } catch (e) {
      if (previous) {
        setAnos(prev => prev.map(x => x.id === id ? previous : x));
        if (anoSelecionado?.id === id) setAnoSelecionadoState(previous);
      }
      throw e;
    }
  }

  async function deleteAno(id: string) {
    const previous = anos.find(x => x.id === id);
    const updatedList = anos.filter(x => x.id !== id);
    setAnos(updatedList);
    if (anoSelecionado?.id === id) {
      const active = updatedList.find(a => a.ativo) || updatedList[updatedList.length - 1] || null;
      setAnoSelecionadoState(active);
    }
    try {
      await api.delete(`/api/anos-academicos/${id}`);
    } catch (e) {
      if (previous) {
        setAnos(prev => [...prev, previous]);
      }
      throw e;
    }
  }

  async function ativarAno(id: string) {
    // Otimista: marca o escolhido activo, todos os outros inactivos.
    const previous = anos;
    const optimistic = anos.map(x => ({ ...x, ativo: x.id === id }));
    setAnos(optimistic);
    const novoActivo = optimistic.find(x => x.id === id) || null;
    if (novoActivo) setAnoSelecionadoState(novoActivo);
    try {
      // Desactivar todos, depois activar o escolhido
      await Promise.all(previous.filter(a => a.ativo && a.id !== id).map(a => api.put(`/api/anos-academicos/${a.id}`, { ativo: false })));
      const updated = await api.put<AnoAcademico>(`/api/anos-academicos/${id}`, { ativo: true });
      if (!isOfflineQueued(updated)) {
        setAnos(prev => prev.map(x => x.id === id ? updated : x));
        setAnoSelecionadoState(updated);
      }
    } catch (e) {
      setAnos(previous);
      throw e;
    }
  }

  const anoAtivo = useMemo(() => anos.find(a => a.ativo) || null, [anos]);

  const trimestreAtual = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    const ref = anoAtivo ?? anoSelecionado;
    if (!ref) return null;
    return ref.trimestres.find(t => t.dataInicio <= today && today <= t.dataFim) || null;
  }, [anoAtivo, anoSelecionado]);

  /**
   * Ano lectivo activo no formato canónico "YYYY/YYYY".
   * Fallback inteligente: se não houver ano activo na BD, calcula
   * a partir da data de hoje (nunca devolve um ano civil simples).
   */
  const anoLetivoStr = useMemo(() => {
    const raw = anoAtivo?.ano;
    return normalizeAnoLetivo(raw) || anoLetivoDeHoje();
  }, [anoAtivo]);

  const anoLetivoInicio = useMemo(() => anoInicioDe(anoLetivoStr), [anoLetivoStr]);

  function setAnoSelecionado(ano: AnoAcademico) {
    setAnoSelecionadoState(ano);
  }

  return (
    <AnoAcademicoContext.Provider value={{
      anos, anoAtivo, anoSelecionado, setAnoSelecionado,
      addAno, updateAno, deleteAno, ativarAno,
      isLoading, trimestreAtual,
      anoLetivoStr, anoLetivoInicio,
    }}>
      {children}
    </AnoAcademicoContext.Provider>
  );
}

export function useAnoAcademico(): AnoAcademicoContextValue {
  const ctx = useContext(AnoAcademicoContext);
  if (!ctx) throw new Error('useAnoAcademico must be used within AnoAcademicoProvider');
  return ctx;
}
