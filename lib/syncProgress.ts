type Listener = (active: boolean, count: number) => void;

let count = 0;
const listeners = new Set<Listener>();

function emit() {
  const active = count > 0;
  listeners.forEach((l) => {
    try { l(active, count); } catch {}
  });
}

export const syncProgress = {
  start(): () => void {
    count += 1;
    emit();
    let stopped = false;
    return () => {
      if (stopped) return;
      stopped = true;
      count = Math.max(0, count - 1);
      emit();
    };
  },
  isActive(): boolean {
    return count > 0;
  },
  getCount(): number {
    return count;
  },
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    listener(count > 0, count);
    return () => { listeners.delete(listener); };
  },
};
