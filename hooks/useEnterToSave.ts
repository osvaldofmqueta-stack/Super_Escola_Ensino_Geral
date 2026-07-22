import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';

export function useEnterToSave(saveFn: (() => void) | null | undefined, visible: boolean) {
  const lastCallRef = useRef(0);
  const saveFnRef = useRef(saveFn);

  useEffect(() => {
    saveFnRef.current = saveFn;
  });

  useEffect(() => {
    if (Platform.OS !== 'web' || !visible) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Enter') return;
      const target = e.target as HTMLElement;
      if (target.tagName === 'TEXTAREA') return;
      if (!target.matches('input')) return;

      const now = Date.now();
      if (now - lastCallRef.current < 200) return;
      lastCallRef.current = now;

      if (saveFnRef.current) {
        saveFnRef.current();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [visible]);
}
