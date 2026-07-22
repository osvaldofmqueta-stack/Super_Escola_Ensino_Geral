import { useState, useEffect, useRef } from 'react';
import { Platform } from 'react-native';

export function useNetworkStatus() {
  const [isOnline, setIsOnline] = useState<boolean>(() => {
    if (typeof navigator !== 'undefined' && 'onLine' in navigator) {
      return navigator.onLine;
    }
    return true;
  });

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (Platform.OS === 'web') {
      // Web: use native browser events
      const handleOnline  = () => setIsOnline(true);
      const handleOffline = () => setIsOnline(false);
      window.addEventListener('online',  handleOnline);
      window.addEventListener('offline', handleOffline);
      setIsOnline(navigator.onLine);
      return () => {
        window.removeEventListener('online',  handleOnline);
        window.removeEventListener('offline', handleOffline);
      };
    }

    // Native (iOS / Android): use expo-network with polling fallback
    let cancelled = false;

    async function checkNativeConnectivity() {
      try {
        const Network = await import('expo-network');
        const state = await Network.getNetworkStateAsync();
        if (!cancelled) {
          setIsOnline(state.isConnected === true && state.isInternetReachable !== false);
        }

        // Set up polling every 5 seconds for native
        intervalRef.current = setInterval(async () => {
          try {
            const s = await Network.getNetworkStateAsync();
            if (!cancelled) {
              setIsOnline(s.isConnected === true && s.isInternetReachable !== false);
            }
          } catch {
            // Keep last known state
          }
        }, 5000);
      } catch {
        // expo-network unavailable: default to true and skip polling
        if (!cancelled) setIsOnline(true);
      }
    }

    checkNativeConnectivity();

    return () => {
      cancelled = true;
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  return { isOnline };
}
