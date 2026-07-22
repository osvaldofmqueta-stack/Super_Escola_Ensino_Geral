import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from '@expo-google-fonts/inter';
import { QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import React, { useEffect } from 'react';
import { Platform, View } from 'react-native';

import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { queryClient } from '@/lib/query-client';
import { AuthProvider } from '@/context/AuthContext';
import { DataProvider } from '@/context/DataContext';
import { DrawerProvider } from '@/context/DrawerContext';
import { AnoAcademicoProvider } from '@/context/AnoAcademicoContext';
import { FinanceiroProvider } from '@/context/FinanceiroContext';
import { NotificacoesProvider } from '@/context/NotificacoesContext';
import { LicenseProvider } from '@/context/LicenseContext';
import { UsersProvider } from '@/context/UsersContext';
import { RegistroProvider } from '@/context/RegistroContext';
import { ConfigProvider } from '@/context/ConfigContext';
import { ProfessorProvider } from '@/context/ProfessorContext';
import { PermissoesProvider } from '@/context/PermissoesContext';
import { ToastProvider } from '@/context/ToastContext';
import { ChatInternoProvider } from '@/context/ChatInternoContext';
import FlashScreenOverlay from '@/components/FlashScreenOverlay';
import GlobalLoadingSpinner from '@/components/GlobalLoadingSpinner';
import UpdateChecker from '@/components/UpdateChecker';
import CachePrefetchManager from '@/components/CachePrefetchManager';
import PwaInstallPrompt from '@/components/PwaInstallPrompt';
import { OfflineProvider } from '@/context/OfflineContext';
import OfflineBanner from '@/components/OfflineBanner';
import { WebAlertProvider } from '@/utils/webAlert';
import ToastManager from '@/components/ToastManager';
import { installOfflineFetchInterceptor } from '@/lib/offlineFetch';
import { initServerConfig } from '@/lib/server-config';

// Inicia o carregamento do URL do servidor guardado em AsyncStorage o mais cedo possível,
// antes de qualquer render, para reduzir a race condition entre providers e initServerConfig().
if (Platform.OS !== 'web') {
  initServerConfig().catch((error) => {
    console.warn('Erro ao inicializar configuração do servidor:', error);
  });
  SplashScreen.preventAutoHideAsync().catch((error) => {
    console.warn('Erro ao prevenir auto-hide do splash screen:', error);
  });
}

if (Platform.OS === 'web' && typeof console !== 'undefined') {
  const _warn = console.warn.bind(console);
  console.warn = (...args: unknown[]) => {
    const msg = typeof args[0] === 'string' ? args[0] : '';
    if (
      msg.includes('shadow') && msg.includes('style props are deprecated') ||
      msg.includes('useNativeDriver') && msg.includes('not supported') ||
      msg.includes('pointerEvents') && msg.includes('deprecated') ||
      msg.includes('aria-hidden') ||
      msg.includes('An update to') && msg.includes('inside a test was not wrapped in act')
    ) return;
    _warn(...args);
  };
}

// On web, expo-font's fontfaceobserver fires internally even without useFonts().
// Fonts are already loaded via @font-face CSS injected by the Express server.
// Intercept in capture phase (before Replit's logger) to suppress this non-fatal noise.
if (Platform.OS === 'web' && typeof window !== 'undefined') {
  installOfflineFetchInterceptor();

  // Não fazemos reload automático quando o service worker atualiza —
  // um reload forçado fecha modais e formulários abertos, causando perda de dados.
  // O novo SW já usa clients.claim() na activação, por isso os clientes existentes
  // passam automaticamente a ser controlados pela nova versão sem reload.
  // Na próxima navegação iniciada pelo utilizador, o bundle mais recente é servido.

  const isFontTimeout = (msg: unknown): boolean =>
    typeof msg === 'string' && msg.includes('ms timeout exceeded');

  window.addEventListener(
    'unhandledrejection',
    (e) => { if (isFontTimeout(e?.reason?.message)) e.preventDefault(); },
    true,
  );

  window.addEventListener(
    'error',
    (e) => {
      if (isFontTimeout(e?.message) || isFontTimeout((e as any)?.error?.message)) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    },
    true,
  );
}

function RootLayoutNav() {
  return (
    <Stack screenOptions={{
      headerShown: false,
      contentStyle: { backgroundColor: '#0D1F35' },
      animation: Platform.OS === 'web' ? 'none' : 'default',
    }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="login" />
      <Stack.Screen name="registro" />
      <Stack.Screen name="licenca" />
      <Stack.Screen name="validar/[serie]" options={{ title: 'Validar Documento' }} />
      <Stack.Screen name="(main)" />
    </Stack>
  );
}

// SafeKeyboardProvider: envolve o KeyboardProvider com um fallback seguro.
// Usa estado para evitar crashes nativos — se o módulo falhar, renderiza sem ele.
function SafeKeyboardProvider({ children }: { children: React.ReactNode }) {
  const [failed, setFailed] = React.useState(false);

  if (Platform.OS === 'web' || failed) {
    return <>{children}</>;
  }

  return (
    <ErrorBoundary
      FallbackComponent={({ resetError }) => {
        // Se o KeyboardProvider crashar, activa o fallback e reinicia o boundary
        React.useEffect(() => {
          setFailed(true);
          resetError();
        }, []);
        return <>{children}</>;
      }}
    >
      <KeyboardProvider>{children}</KeyboardProvider>
    </ErrorBoundary>
  );
}

function AppProviders() {
  // SafeAreaProvider e GestureHandlerRootView ficam FORA do ErrorBoundary
  // para que o ErrorFallback tenha sempre acesso a estes contextos.
  return (
    <SafeAreaProvider>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <ErrorBoundary>
          <QueryClientProvider client={queryClient}>
            <SafeKeyboardProvider>
              <OfflineProvider>
                <ConfigProvider>
                  <AuthProvider>
                    <CachePrefetchManager />
                    <PermissoesProvider>
                      <LicenseProvider>
                        <UsersProvider>
                          <RegistroProvider>
                            <DataProvider>
                              <AnoAcademicoProvider>
                                <FinanceiroProvider>
                                  <NotificacoesProvider>
                                    <ProfessorProvider>
                                      <ChatInternoProvider>
                                        <DrawerProvider>
                                          <ToastProvider>
                                            <WebAlertProvider>
                                              <View style={{ flex: 1 }}>
                                                <OfflineBanner />
                                                <View style={{ flex: 1 }}>
                                                  <RootLayoutNav />
                                                </View>
                                              </View>
                                              {Platform.OS === 'web' && <FlashScreenOverlay />}
                                              <GlobalLoadingSpinner />
                                              <ToastManager />
                                              <UpdateChecker />
                                              {Platform.OS === 'web' && <PwaInstallPrompt />}
                                            </WebAlertProvider>
                                          </ToastProvider>
                                        </DrawerProvider>
                                      </ChatInternoProvider>
                                    </ProfessorProvider>
                                  </NotificacoesProvider>
                                </FinanceiroProvider>
                              </AnoAcademicoProvider>
                            </DataProvider>
                          </RegistroProvider>
                        </UsersProvider>
                      </LicenseProvider>
                    </PermissoesProvider>
                  </AuthProvider>
                </ConfigProvider>
              </OfflineProvider>
            </SafeKeyboardProvider>
          </QueryClientProvider>
        </ErrorBoundary>
      </GestureHandlerRootView>
    </SafeAreaProvider>
  );
}

// Web layout: fonts are already loaded via @font-face CSS injected by the server.
// useFonts must NOT be called on web — even with {}, fontfaceobserver triggers a 6s timeout.
function WebRootLayout() {
  useEffect(() => {
    initServerConfig().catch(() => {});
    if (typeof window !== 'undefined' && typeof (window as any).hideSplash === 'function') {
      (window as any).hideSplash();
    }
  }, []);
  return <AppProviders />;
}

// Native layout: load fonts via expo-font, hide splash when ready.
function NativeRootLayout() {
  useEffect(() => { initServerConfig().catch(() => {}); }, []);
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });
  const [ready, setReady] = React.useState(false);
  const hiddenRef = React.useRef(false);

  function hideSplash() {
    if (hiddenRef.current) return;
    hiddenRef.current = true;
    SplashScreen.hideAsync().catch(() => {});
  }

  useEffect(() => {
    // Timeout de segurança aumentado: 5s máximo para evitar crash na inicialização
    // Garante que o splash nunca fica preso para sempre
    const timeout = setTimeout(() => {
      setReady(true);
      hideSplash();
    }, 5000);

    return () => clearTimeout(timeout);
  }, []);

  useEffect(() => {
    if (fontsLoaded || fontError) {
      // Aguarda 100ms após as fontes carregarem para garantir que a primeira
      // frame está renderizada antes de esconder o splash nativo.
      const t = setTimeout(() => {
        setReady(true);
        hideSplash();
      }, 100);
      return () => clearTimeout(t);
    }
  }, [fontsLoaded, fontError]);

  // Aguarda fontes — o splash nativo do Expo cobre este período no mobile
  if (!ready) {
    return null;
  }

  return <AppProviders />;
}

export default function RootLayout() {
  if (Platform.OS === 'web') {
    return <WebRootLayout />;
  }
  return <NativeRootLayout />;
}
