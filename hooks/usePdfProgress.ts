import { useCallback, useEffect, useRef, useState } from 'react';

export const PDF_PROGRESS_STEPS = [
  { label: 'A preparar dados…',  icon: 'server-outline' as const,          pct: 20 },
  { label: 'A construir o PDF…', icon: 'document-text-outline' as const,   pct: 65 },
  { label: 'A finalizar…',       icon: 'checkmark-done-outline' as const,  pct: 92 },
  { label: 'Documento pronto!',  icon: 'print-outline' as const,            pct: 100 },
];

export const PDF_STEP_DURATIONS = [700, 1300, 1000, 400];

export function usePdfProgress() {
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearTimers = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }, []);

  const start = useCallback(() => {
    clearTimers();
    setStep(0);
    setVisible(true);

    let elapsed = PDF_STEP_DURATIONS[0];
    for (let i = 1; i < PDF_PROGRESS_STEPS.length - 1; i++) {
      const idx = i;
      const t = setTimeout(() => setStep(idx), elapsed);
      timers.current.push(t);
      elapsed += PDF_STEP_DURATIONS[idx];
    }
  }, [clearTimers]);

  const complete = useCallback((onDone?: () => void) => {
    clearTimers();
    setStep(PDF_PROGRESS_STEPS.length - 1);
    const t = setTimeout(() => {
      setVisible(false);
      onDone?.();
    }, 800);
    timers.current.push(t);
  }, [clearTimers]);

  const cancel = useCallback(() => {
    clearTimers();
    setVisible(false);
  }, [clearTimers]);

  useEffect(() => () => { timers.current.forEach(clearTimeout); }, []);

  return { visible, step, start, complete, cancel };
}
