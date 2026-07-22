/**
 * Hook de pré-carregamento de cache offline.
 * Após o utilizador fazer login, vai buscar os dados críticos ao servidor
 * e guarda-os em cache local. Se o dispositivo ficar offline, as listas
 * principais continuam a funcionar com dados em cache.
 */
import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { getApiUrl } from '@/lib/query-client';
import { saveToCache, CRITICAL_PREFETCH_ROUTES } from '@/lib/offlineCache';

const PREFETCH_DELAY_MS = 3000;
const PREFETCH_KEY = '@siga_last_prefetch';

async function getLastPrefetch(): Promise<number> {
  try {
    const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
    const raw = await AsyncStorage.getItem(PREFETCH_KEY);
    return raw ? parseInt(raw, 10) : 0;
  } catch {
    return 0;
  }
}

async function setLastPrefetch(): Promise<void> {
  try {
    const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
    await AsyncStorage.setItem(PREFETCH_KEY, Date.now().toString());
  } catch {}
}

async function getToken(): Promise<string | null> {
  try {
    const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
    return await AsyncStorage.getItem('@siga_token');
  } catch {
    return null;
  }
}

async function prefetchRoute(route: string, token: string | null): Promise<void> {
  try {
    const base = getApiUrl();
    const url = new URL(route, base).toString();
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);

    try {
      const res = await fetch(url, {
        headers,
        credentials: 'include',
        signal: controller.signal,
        cache: 'no-store',
      });
      if (res.ok) {
        const data = await res.json();
        await saveToCache(route, data);
      }
    } finally {
      clearTimeout(timer);
    }
  } catch {
  }
}

export function useCachePrefetch(isAuthenticated: boolean, isOnline: boolean) {
  const hasPrefetched = useRef(false);

  useEffect(() => {
    if (!isAuthenticated || !isOnline) return;
    if (Platform.OS === 'web') return;
    if (hasPrefetched.current) return;

    const run = async () => {
      const lastPrefetch = await getLastPrefetch();
      const ONE_HOUR = 60 * 60 * 1000;
      if (Date.now() - lastPrefetch < ONE_HOUR) return;

      hasPrefetched.current = true;
      const token = await getToken();

      for (const route of CRITICAL_PREFETCH_ROUTES) {
        await prefetchRoute(route, token);
        await new Promise((r) => setTimeout(r, 200));
      }

      await setLastPrefetch();
    };

    const timer = setTimeout(run, PREFETCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [isAuthenticated, isOnline]);
}
