import { useState, useEffect, useMemo, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface LookupItem {
  id: number;
  categoria: string;
  valor: string;
  label: string;
  ordem: number;
  ativo: boolean;
  icon?: string | null;
  cor?: string | null;
}

const cache: Record<string, LookupItem[]> = {};
const pending: Record<string, Promise<LookupItem[]>> = {};
const subscribers: Record<string, Set<() => void>> = {};

const STORAGE_PREFIX = '@siga_lookup_';

function notify(categoria: string) {
  const subs = subscribers[categoria];
  if (!subs) return;
  subs.forEach(fn => {
    try { fn(); } catch { /* ignore */ }
  });
}

async function persistCache(categoria: string, data: LookupItem[]) {
  try {
    await AsyncStorage.setItem(STORAGE_PREFIX + categoria, JSON.stringify(data));
  } catch { /* ignore */ }
}

async function loadPersistedCache(categoria: string): Promise<LookupItem[] | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_PREFIX + categoria);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as LookupItem[]) : null;
  } catch {
    return null;
  }
}

async function fetchLookup(categoria: string): Promise<LookupItem[]> {
  if (pending[categoria]) return pending[categoria];
  const p = fetch(`/api/lookup/${categoria}`)
    .then(r => r.json())
    .then(async (data: unknown) => {
      if (Array.isArray(data) && data.length > 0) {
        cache[categoria] = data as LookupItem[];
        await persistCache(categoria, cache[categoria]);
        return cache[categoria];
      }
      return [] as LookupItem[];
    })
    .catch(async () => {
      // sem rede: tenta cache persistido
      const persisted = await loadPersistedCache(categoria);
      if (persisted && persisted.length > 0) {
        cache[categoria] = persisted;
        return persisted;
      }
      return [] as LookupItem[];
    })
    .finally(() => { delete pending[categoria]; });
  pending[categoria] = p;
  return p;
}

export function useLookup(categoria: string, fallback: string[] = []) {
  const toItems = (vals: string[]): LookupItem[] =>
    vals.map((v, i) => ({ id: i, categoria, valor: v, label: v, ordem: i, ativo: true }));

  const [items, setItems] = useState<LookupItem[]>(
    cache[categoria] ?? (fallback.length > 0 ? toItems(fallback) : [])
  );
  const [isLoading, setIsLoading] = useState(!cache[categoria]);

  useEffect(() => {
    let cancelled = false;

    const load = () => {
      if (cache[categoria]) {
        setItems(cache[categoria]);
        setIsLoading(false);
        return;
      }
      setIsLoading(true);
      // tenta cache persistido logo (mostra algo enquanto rede responde)
      loadPersistedCache(categoria).then(persisted => {
        if (cancelled) return;
        if (persisted && persisted.length > 0 && !cache[categoria]) {
          cache[categoria] = persisted;
          setItems(persisted);
        }
      });
      fetchLookup(categoria).then(data => {
        if (cancelled) return;
        if (data.length > 0) {
          setItems(data);
        } else if (fallback.length > 0 && !cache[categoria]) {
          setItems(toItems(fallback));
        }
        setIsLoading(false);
      });
    };

    load();

    if (!subscribers[categoria]) subscribers[categoria] = new Set();
    subscribers[categoria].add(load);

    return () => {
      cancelled = true;
      subscribers[categoria]?.delete(load);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoria]);

  const values = useMemo(() => items.map(i => i.valor), [items]);
  const labels = useMemo(() => items.map(i => i.label), [items]);
  const valueToLabel = useCallback(
    (val: string) => items.find(i => i.valor === val)?.label ?? val,
    [items]
  );
  const valueToItem = useCallback(
    (val: string) => items.find(i => i.valor === val) ?? null,
    [items]
  );

  return {
    items,
    isLoading,
    values,
    labels,
    valueToLabel,
    valueToItem,
  };
}

export function invalidateLookupCache(categoria?: string) {
  if (categoria) {
    delete cache[categoria];
    notify(categoria);
  } else {
    const cats = Object.keys(cache);
    cats.forEach(k => delete cache[k]);
    cats.forEach(notify);
  }
}

/**
 * Adiciona um item localmente (sem chamar API). Útil para mostrar imediatamente
 * itens criados offline. O servidor sincroniza depois via fila offline.
 */
export function addLookupItemLocal(categoria: string, item: Omit<LookupItem, 'categoria'>) {
  const existing = cache[categoria] ?? [];
  if (existing.some(i => i.valor === item.valor)) return;
  const next: LookupItem[] = [...existing, { ...item, categoria }];
  cache[categoria] = next;
  persistCache(categoria, next);
  notify(categoria);
}

/**
 * Remove um item local (não toca no servidor). Útil para reverter inserções
 * optimistas quando o servidor recusa a criação (401/403/422, etc.).
 */
export function removeLookupItemLocal(categoria: string, valor: string) {
  const existing = cache[categoria] ?? [];
  const next = existing.filter(i => i.valor !== valor);
  if (next.length === existing.length) return;
  cache[categoria] = next;
  persistCache(categoria, next);
  notify(categoria);
}
