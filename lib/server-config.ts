import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = '@siga_server_url';

const DEFAULT_URL = process.env.EXPO_PUBLIC_API_URL?.trim() || '';

let _cached: string | null = DEFAULT_URL || null;
let _initialized = false;

/**
 * Devolve a URL base da API no momento da chamada.
 * Sempre actualizada: '' em web (URLs relativas), URL configurada em nativo.
 * Usar em vez da constante estática para suportar initServerConfig() assíncrono.
 */
export function getApiBase(): string {
  return _cached ?? '';
}

/** @deprecated usar getApiBase() — esta constante captura o valor inicial e não reflecte actualizações async */
export const apiBase: string = _cached ?? '';

export async function initServerConfig(): Promise<void> {
  if (_initialized) return;
  try {
    const stored = await AsyncStorage.getItem(KEY);
    if (stored && stored.trim()) {
      _cached = stored.trim();
    }
  } catch (error) {
    console.warn('Erro ao ler configuração do servidor do AsyncStorage:', error);
  }
  _initialized = true;
}

export function getStoredServerUrl(): string | null {
  return _cached;
}

export async function setServerUrl(url: string): Promise<void> {
  const clean = url.trim().replace(/\/$/, '');
  _cached = clean || null;
  if (clean) {
    await AsyncStorage.setItem(KEY, clean);
  } else {
    await AsyncStorage.removeItem(KEY);
  }
}

export async function resetServerUrl(): Promise<void> {
  _cached = null;
  _initialized = false;
  await AsyncStorage.removeItem(KEY);
}

export function getDefaultServerUrl(): string {
  return DEFAULT_URL;
}

export async function testServerConnection(url: string): Promise<{ ok: boolean; message: string }> {
  const clean = url.trim().replace(/\/$/, '');
  if (!clean) return { ok: false, message: 'URL vazia.' };
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    const res = await fetch(`${clean}/api/config`, { signal: controller.signal });
    clearTimeout(timeout);
    if (res.ok) return { ok: true, message: 'Ligação estabelecida com sucesso!' };
    return { ok: false, message: `Servidor respondeu com erro ${res.status}.` };
  } catch (e: any) {
    if (e?.name === 'AbortError') return { ok: false, message: 'Tempo limite excedido. Verifique o endereço.' };
    return { ok: false, message: 'Não foi possível ligar ao servidor.' };
  }
}
