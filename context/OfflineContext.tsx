import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
  ReactNode,
} from 'react';
import { Platform } from 'react-native';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import {
  OFFLINE_QUEUE_CHANGED_EVENT,
  processQueue,
  getQueue,
  getFailedOps,
  isNetworkError,
  purgeStale401FailedOps,
  type QueuedOperation,
  type FailedOperation,
} from '@/lib/offlineQueue';
import { getApiUrl } from '@/lib/query-client';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { showToast } from '@/utils/toast';
import { proactiveRefreshIfNeeded } from '@/lib/api';
import { getCacheStats, clearAllCache } from '@/lib/offlineCache';
import { useCachePrefetch } from '@/hooks/useCachePrefetch';

export const SIGA_SYNC_EVENT = 'siga:online-sync';

interface CacheStats {
  count: number;
  newestAt: number | null;
}

interface OfflineContextValue {
  isOnline: boolean;
  pendingCount: number;
  failedCount: number;
  pendingOps: QueuedOperation[];
  failedOps: FailedOperation[];
  isSyncing: boolean;
  lastSyncAt: Date | null;
  triggerSync: () => Promise<void>;
  cacheStats: CacheStats;
  clearCache: () => Promise<void>;
}

const OfflineContext = createContext<OfflineContextValue>({
  isOnline: true,
  pendingCount: 0,
  failedCount: 0,
  pendingOps: [],
  failedOps: [],
  isSyncing: false,
  lastSyncAt: null,
  triggerSync: async () => {},
  cacheStats: { count: 0, newestAt: null },
  clearCache: async () => {},
});

const TOKEN_KEY = '@siga_token';

async function getAuthToken(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

async function executeOperation(
  method: string,
  path: string,
  body?: unknown
): Promise<void> {
  const base = getApiUrl();
  const url = new URL(path, base).toString();
  const token = await getAuthToken();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-SIGA-Offline-Replay': 'true',
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'include',
  });

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`${res.status}: ${text}`);
  }
}

export function OfflineProvider({ children }: { children: ReactNode }) {
  const { isOnline } = useNetworkStatus();
  const [pendingOps, setPendingOps] = useState<QueuedOperation[]>([]);
  const [failedOps, setFailedOps] = useState<FailedOperation[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<Date | null>(null);
  const [cacheStats, setCacheStats] = useState<CacheStats>({ count: 0, newestAt: null });
  const wasOnline = useRef(isOnline);

  const refreshState = useCallback(async () => {
    const [q, f] = await Promise.all([getQueue(), getFailedOps()]);
    setPendingOps(q);
    setFailedOps(f);
  }, []);

  const refreshCacheStats = useCallback(async () => {
    if (Platform.OS === 'web') return;
    const stats = await getCacheStats();
    setCacheStats({ count: stats.count, newestAt: stats.newestAt });
  }, []);

  useEffect(() => {
    purgeStale401FailedOps().then(() => refreshState());
    refreshCacheStats();
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.addEventListener(OFFLINE_QUEUE_CHANGED_EVENT, refreshState);
    }
    const interval = setInterval(refreshState, 5000);
    const cacheInterval = setInterval(refreshCacheStats, 60_000);
    return () => {
      clearInterval(interval);
      clearInterval(cacheInterval);
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.removeEventListener(OFFLINE_QUEUE_CHANGED_EVENT, refreshState);
      }
    };
  }, [refreshState, refreshCacheStats]);

  const triggerSync = useCallback(async () => {
    if (isSyncing) return;
    const q = await getQueue();
    if (q.length === 0) {
      dispatchSyncEvent();
      return;
    }
    setIsSyncing(true);
    try {
      const result = await processQueue(executeOperation);
      await refreshState();
      setLastSyncAt(new Date());
      dispatchSyncEvent();
      if (result.sessionExpired) {
        showToast(
          'A sua sessão expirou enquanto estava offline. Faça login novamente para continuar.',
          'error',
          8000,
        );
      } else if (result.failedOps.length > 0) {
        const n = result.failedOps.length;
        showToast(
          n === 1
            ? 'Uma alteração offline foi rejeitada pelo servidor — abra o indicador online para ver os detalhes'
            : `${n} alterações offline foram rejeitadas pelo servidor — abra o indicador online para ver os detalhes`,
          'error',
          6000,
        );
      } else if (result.success > 0) {
        showToast(
          result.success === 1
            ? 'Alteração offline sincronizada com sucesso'
            : `${result.success} alterações offline sincronizadas com sucesso`,
          'success',
          3000,
        );
      }
    } catch (e) {
      if (!isNetworkError(e)) {
        console.warn('[OfflineContext] Sync error', e);
      }
    } finally {
      setIsSyncing(false);
    }
  }, [isSyncing, refreshState]);

  const clearCache = useCallback(async () => {
    await clearAllCache();
    setCacheStats({ count: 0, newestAt: null });
    showToast('Cache local limpa com sucesso.', 'success', 3000);
  }, []);

  useEffect(() => {
    if (isOnline && !wasOnline.current) {
      proactiveRefreshIfNeeded().finally(() => triggerSync());
      refreshCacheStats();
    }
    wasOnline.current = isOnline;
  }, [isOnline, triggerSync, refreshCacheStats]);

  return (
    <OfflineContext.Provider
      value={{
        isOnline,
        pendingCount: pendingOps.length,
        failedCount: failedOps.length,
        pendingOps,
        failedOps,
        isSyncing,
        lastSyncAt,
        triggerSync,
        cacheStats,
        clearCache,
      }}
    >
      {children}
    </OfflineContext.Provider>
  );
}

function dispatchSyncEvent() {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(SIGA_SYNC_EVENT));
  }
}

export function useOffline() {
  return useContext(OfflineContext);
}
