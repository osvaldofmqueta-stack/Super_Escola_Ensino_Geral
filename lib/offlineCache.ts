/**
 * Cache de leitura para modo offline.
 * Guarda respostas GET no AsyncStorage com TTL.
 * Quando sem rede, serve dados em cache em vez de mostrar ecrã vazio.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const CACHE_PREFIX = '@siga_read_cache_';
const INDEX_KEY = '@siga_read_cache_index';

const TTL_DEFAULT = 24 * 60 * 60 * 1000;
const TTL_SHORT   =  1 * 60 * 60 * 1000;
const TTL_LONG    = 72 * 60 * 60 * 1000;

const SHORT_TTL_ROUTES = [
  '/api/pagamentos',
  '/api/rupes',
  '/api/saldo',
  '/api/presencas',
  '/api/notificacoes',
  '/api/sessoes',
];

const LONG_TTL_ROUTES = [
  '/api/config-geral',
  '/api/cursos',
  '/api/disciplinas',
  '/api/salas',
  '/api/feriados',
  '/api/lookup',
  '/api/doc-templates',
];

const SKIP_CACHE_ROUTES = [
  '/api/health',
  '/api/auth',
  '/api/login',
  '/api/logout',
  '/api/ai-',
  '/api/push/',
  '/api/export',
  '/api/pdf',
  '/api/saft',
];

function getTtlForRoute(route: string): number {
  if (SKIP_CACHE_ROUTES.some((r) => route.includes(r))) return 0;
  if (SHORT_TTL_ROUTES.some((r) => route.startsWith(r))) return TTL_SHORT;
  if (LONG_TTL_ROUTES.some((r) => route.startsWith(r))) return TTL_LONG;
  return TTL_DEFAULT;
}

function shouldCache(route: string): boolean {
  return getTtlForRoute(route) > 0;
}

interface CacheEntry {
  data: unknown;
  cachedAt: number;
  ttl: number;
  route: string;
}

function cacheKey(route: string): string {
  const safe = route.replace(/[^a-zA-Z0-9_\-/.]/g, '_').slice(0, 200);
  return CACHE_PREFIX + safe;
}

async function getIndex(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(INDEX_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

async function addToIndex(route: string): Promise<void> {
  try {
    const index = await getIndex();
    if (!index.includes(route)) {
      index.push(route);
      if (index.length > 500) index.splice(0, index.length - 500);
      await AsyncStorage.setItem(INDEX_KEY, JSON.stringify(index));
    }
  } catch {}
}

export async function saveToCache(route: string, data: unknown): Promise<void> {
  if (!shouldCache(route)) return;
  try {
    const entry: CacheEntry = {
      data,
      cachedAt: Date.now(),
      ttl: getTtlForRoute(route),
      route,
    };
    await AsyncStorage.setItem(cacheKey(route), JSON.stringify(entry));
    await addToIndex(route);
  } catch {}
}

export interface CacheResult {
  data: unknown;
  cachedAt: number;
  isStale: boolean;
}

export async function loadFromCache(route: string): Promise<CacheResult | null> {
  try {
    const raw = await AsyncStorage.getItem(cacheKey(route));
    if (!raw) return null;
    const entry: CacheEntry = JSON.parse(raw);
    const age = Date.now() - entry.cachedAt;
    const isStale = age > entry.ttl;
    return { data: entry.data, cachedAt: entry.cachedAt, isStale };
  } catch {
    return null;
  }
}

export async function clearCacheForRoute(route: string): Promise<void> {
  try {
    const prefix = route.split('?')[0];
    const index = await getIndex();
    const toRemove = index.filter((r) => r.startsWith(prefix));
    if (toRemove.length > 0) {
      await AsyncStorage.multiRemove(toRemove.map(cacheKey));
      const remaining = index.filter((r) => !r.startsWith(prefix));
      await AsyncStorage.setItem(INDEX_KEY, JSON.stringify(remaining));
    }
  } catch {}
}

export async function clearAllCache(): Promise<void> {
  try {
    const index = await getIndex();
    await AsyncStorage.multiRemove(index.map(cacheKey));
    await AsyncStorage.removeItem(INDEX_KEY);
  } catch {}
}

export async function getCacheStats(): Promise<{
  count: number;
  oldestAt: number | null;
  newestAt: number | null;
}> {
  try {
    const index = await getIndex();
    if (index.length === 0) return { count: 0, oldestAt: null, newestAt: null };
    const keys = index.map(cacheKey);
    const pairs = await AsyncStorage.multiGet(keys);
    let oldest: number | null = null;
    let newest: number | null = null;
    let count = 0;
    for (const [, raw] of pairs) {
      if (!raw) continue;
      try {
        const entry: CacheEntry = JSON.parse(raw);
        count++;
        if (oldest === null || entry.cachedAt < oldest) oldest = entry.cachedAt;
        if (newest === null || entry.cachedAt > newest) newest = entry.cachedAt;
      } catch {}
    }
    return { count, oldestAt: oldest, newestAt: newest };
  } catch {
    return { count: 0, oldestAt: null, newestAt: null };
  }
}

export const CRITICAL_PREFETCH_ROUTES = [
  '/api/config-geral',
  '/api/cursos',
  '/api/disciplinas',
  '/api/salas',
  '/api/turmas',
  '/api/alunos',
  '/api/professores',
  '/api/funcionarios',
  '/api/feriados',
  '/api/lookup/tipos-pagamento',
  '/api/lookup/tipos-documentos',
  '/api/doc-templates',
];
