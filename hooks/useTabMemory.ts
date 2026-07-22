import { useState, useCallback } from 'react';
import { Platform } from 'react-native';

const STORAGE_PREFIX = 'siga.tab.';

function storageGet(key: string): string | null {
  try {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      return localStorage.getItem(STORAGE_PREFIX + key);
    }
  } catch {}
  return null;
}

function storageSet(key: string, value: string): void {
  try {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_PREFIX + key, value);
    }
  } catch {}
}

/**
 * Like useState, but persists the active tab in localStorage on web.
 * @param key     Unique storage key (ex: 'financeiro.tab')
 * @param defaultValue  Default tab when nothing is stored
 * @param urlOverride   If provided (from route params), takes priority over stored value
 */
export function useTabMemory<T extends string>(
  key: string,
  defaultValue: T,
  urlOverride?: T | null | undefined,
): [T, (tab: T) => void] {
  const [tab, setTabState] = useState<T>(() => {
    if (urlOverride) return urlOverride;
    const saved = storageGet(key);
    if (saved) return saved as T;
    return defaultValue;
  });

  const setTab = useCallback(
    (newTab: T) => {
      setTabState(newTab);
      storageSet(key, newTab);
    },
    [key],
  );

  return [tab, setTab];
}
