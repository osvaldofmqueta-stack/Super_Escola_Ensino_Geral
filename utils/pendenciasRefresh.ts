const listeners = new Set<() => void>();

export function subscribePendenciasRefresh(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function triggerPendenciasRefresh() {
  listeners.forEach(fn => fn());
}
