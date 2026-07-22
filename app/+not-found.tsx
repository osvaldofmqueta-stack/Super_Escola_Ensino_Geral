import React from 'react';
import { Stack, useRouter } from 'expo-router';
import ErrorScreen from '@/components/ErrorScreen';

export default function NotFoundScreen() {
  const router = useRouter();

  return (
    <>
      <Stack.Screen options={{ headerShown: false, title: '404 — Página Não Encontrada' }} />
      <ErrorScreen
        code={404}
        onPrimaryAction={() => {
          if (router.canGoBack()) {
            router.back();
          } else {
            router.replace('/login' as any);
          }
        }}
        primaryLabel="Voltar"
        onSecondaryAction={() => router.replace('/login' as any)}
        secondaryLabel="Ir ao Login"
      />
    </>
  );
}
