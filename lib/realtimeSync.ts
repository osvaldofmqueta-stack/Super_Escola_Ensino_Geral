type Listener = (entity: string) => void;
const listeners = new Set<Listener>();

export function emitDataChange(entity: string): void {
  for (const l of listeners) {
    try { l(entity); } catch { /* ignore */ }
  }
}

export function subscribeDataChange(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
