import React from 'react';
import { Stack, useRouter, useLocalSearchParams } from 'expo-router';
import ErrorScreen from '@/components/ErrorScreen';

export default function ErrorPage() {
  const router = useRouter();
  const params = useLocalSearchParams<{ code?: string; message?: string }>();
  const code = params.code ? parseInt(params.code, 10) : undefined;

  function handlePrimary() {
    if (code === 401) {
      router.replace('/login' as any);
    } else if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/login' as any);
    }
  }

  function handleSecondary() {
    if (code === 401) {
      router.replace('/login' as any);
    } else {
      try {
        router.replace('/(main)/dashboard' as any);
      } catch {
        router.replace('/login' as any);
      }
    }
  }

  const primaryLabel =
    code === 401 ? 'Iniciar Sessão' :
    code === 403 ? 'Voltar' :
    'Tentar Novamente';

  const secondaryLabel =
    code === 401 ? undefined :
    code === 500 || code === 503 || code === 502 ? 'Ir ao Dashboard' :
    code === 403 ? 'Ir ao Dashboard' :
    'Ir ao Dashboard';

  return (
    <>
      <Stack.Screen options={{ headerShown: false, title: `Erro ${code ?? ''}` }} />
      <ErrorScreen
        code={code}
        customMessage={params.message}
        onPrimaryAction={handlePrimary}
        primaryLabel={primaryLabel}
        onSecondaryAction={secondaryLabel ? handleSecondary : undefined}
        secondaryLabel={secondaryLabel}
      />
    </>
  );
}
