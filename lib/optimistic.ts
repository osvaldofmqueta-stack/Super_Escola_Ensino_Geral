// Utilitários partilhados para mutações otimistas + sync offline.
// Usados pelos vários contextos para garantir que tudo aparece imediatamente
// no ecrã (mesmo offline) e re-sincroniza com o servidor quando a rede volta.

import { Platform } from 'react-native';

export const SIGA_SYNC_EVENT = 'siga:online-sync';

/** Verifica se a resposta de api.* é o stub devolvido quando o pedido foi guardado na fila offline. */
export function isOfflineQueued(res: any): boolean {
  return !!(res && typeof res === 'object' && res.offlineQueued === true);
}

/** Gera um id temporário (substituído pelo id do servidor após sync). */
export function tempId(prefix: string): string {
  return `${prefix}_tmp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Subscreve o evento de sincronização online. Retorna função de cleanup. No-op fora da web. */
export function subscribeOnlineSync(handler: () => void): () => void {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return () => {};
  window.addEventListener(SIGA_SYNC_EVENT, handler);
  return () => window.removeEventListener(SIGA_SYNC_EVENT, handler);
}
