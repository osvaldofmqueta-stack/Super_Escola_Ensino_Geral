import { Redirect } from 'expo-router';
import React, { useEffect, useState, useCallback } from 'react';
import { Platform, View } from 'react-native';
import ServerErrorScreen from '@/components/ServerErrorScreen';
import { useAuth } from '@/context/AuthContext';
import { getApiUrl } from '@/lib/query-client';

type ServerStatus = 'checking' | 'ok' | 'error';

const SERVER_TIMEOUT_MS = 8000;

async function checkServerReachable(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), SERVER_TIMEOUT_MS);
    try {
      const url = new URL('/api/health', getApiUrl()).toString();
      const res = await fetch(url, {
        method: 'GET',
        signal: controller.signal,
        cache: 'no-store',
      });
      return res.ok || res.status < 500;
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return false;
  }
}

export default function IndexScreen() {
  const { isAuthenticated, isLoading } = useAuth();
  const [serverStatus, setServerStatus] = useState<ServerStatus>(
    Platform.OS === 'web' ? 'ok' : 'checking'
  );
  const [retrying, setRetrying] = useState(false);

  const runServerCheck = useCallback(async () => {
    const ok = await checkServerReachable();
    setServerStatus(ok ? 'ok' : 'error');
  }, []);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    runServerCheck();
  }, []);

  const handleRetry = useCallback(async () => {
    setRetrying(true);
    setServerStatus('checking');
    const ok = await checkServerReachable();
    setRetrying(false);
    setServerStatus(ok ? 'ok' : 'error');
  }, []);

  if (serverStatus === 'checking') {
    return <View style={{ flex: 1, backgroundColor: '#0D1117' }} />;
  }

  if (serverStatus === 'error') {
    return <ServerErrorScreen onRetry={handleRetry} retrying={retrying} />;
  }

  if (isLoading) {
    return <View style={{ flex: 1, backgroundColor: '#0D1117' }} />;
  }

  if (isAuthenticated) {
    return <Redirect href="/(main)/dashboard" />;
  }

  return <Redirect href="/login" />;
}
