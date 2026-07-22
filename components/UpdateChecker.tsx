import React, { useEffect, useState, useRef } from 'react';
import {
  Animated,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BOTTOM_NAV_HEIGHT } from '@/components/BottomNavBar';
import { useBreakpoint } from '@/hooks/useBreakpoint';

const APK_VERSION_KEY = 'siga_last_apk_version';
const APK_DISMISSED_KEY = 'siga_dismissed_apk_version';
const CHECK_INTERVAL_MS = 30 * 60 * 1000; // 30 min

interface ServerVersion {
  version: string;
  apkAvailable: boolean;
  apkUrl: string | null;
}

function getStorage() {
  try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch { return null; }
}

function storedGet(key: string): string | null {
  try { return getStorage()?.getItem(key) ?? null; } catch { return null; }
}

function storedSet(key: string, value: string) {
  try { getStorage()?.setItem(key, value); } catch {}
}

function isAndroid(): boolean {
  if (Platform.OS === 'android') return true;
  if (Platform.OS === 'web' && typeof navigator !== 'undefined') {
    return /android/i.test(navigator.userAgent);
  }
  return false;
}

function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = pa[i] ?? 0;
    const nb = pb[i] ?? 0;
    if (na > nb) return 1;
    if (na < nb) return -1;
  }
  return 0;
}

export default function UpdateChecker() {
  const [serverInfo, setServerInfo] = useState<ServerVersion | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const slideAnim = useRef(new Animated.Value(80)).current;
  const { isDesktop } = useBreakpoint();

  const shouldShow = !!serverInfo && !dismissed;

  useEffect(() => {
    if (shouldShow) {
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        damping: 18,
        stiffness: 200,
      }).start();
    } else {
      Animated.timing(slideAnim, {
        toValue: 80,
        duration: 220,
        useNativeDriver: true,
      }).start();
    }
  }, [shouldShow]);

  async function checkWebVersion() {
    try {
      const res = await fetch('/api/version');
      if (!res.ok) return;
      const data: ServerVersion = await res.json();

      const dismissedVer = storedGet(APK_DISMISSED_KEY);
      if (dismissedVer && compareVersions(data.version, dismissedVer) <= 0) return;

      const lastKnown = storedGet(APK_VERSION_KEY);

      if (!lastKnown) {
        storedSet(APK_VERSION_KEY, data.version);
        return;
      }

      if (compareVersions(data.version, lastKnown) > 0 && data.apkAvailable) {
        setServerInfo(data);
      } else {
        storedSet(APK_VERSION_KEY, data.version);
      }
    } catch {}
  }

  async function checkNativeUpdate() {
    if (!__DEV__) {
      try {
        const Updates = await import('expo-updates');
        const result = await Updates.checkForUpdateAsync();
        if (result.isAvailable) {
          setServerInfo({ version: 'nova', apkAvailable: false, apkUrl: null });
        }
      } catch {}
    }
  }

  useEffect(() => {
    const delay = setTimeout(() => {
      if (Platform.OS === 'web') {
        checkWebVersion();
        const interval = setInterval(checkWebVersion, CHECK_INTERVAL_MS);
        return () => clearInterval(interval);
      } else {
        checkNativeUpdate();
      }
    }, 10000);
    return () => clearTimeout(delay);
  }, []);

  async function handleUpdate() {
    if (!serverInfo) return;
    setDownloading(true);

    if (Platform.OS === 'web') {
      if (serverInfo.apkUrl && isAndroid()) {
        const link = document.createElement('a');
        link.href = serverInfo.apkUrl;
        link.download = 'SuperEscola.apk';
        link.click();
        storedSet(APK_VERSION_KEY, serverInfo.version);
        handleDismiss();
      } else {
        window.location.reload();
      }
      setDownloading(false);
      return;
    }

    try {
      const Updates = await import('expo-updates');
      await Updates.fetchUpdateAsync();
      await new Promise(res => setTimeout(res, 500));
      await Updates.reloadAsync();
    } catch {
      setDownloading(false);
    }
  }

  function handleDismiss() {
    if (serverInfo?.version) {
      storedSet(APK_DISMISSED_KEY, serverInfo.version);
    }
    setDismissed(true);
  }

  const bottomOffset = isDesktop ? 0 : BOTTOM_NAV_HEIGHT;

  return (
    <Animated.View
      style={[
        styles.bar,
        { bottom: bottomOffset, transform: [{ translateY: slideAnim }] },
      ]}
      pointerEvents={shouldShow ? 'box-none' : 'none'}
    >
      {shouldShow && (
        <Pressable style={styles.inner} onPress={handleUpdate} android_ripple={{ color: 'rgba(255,255,255,0.12)' }}>
          <View style={styles.iconWrap}>
            {downloading ? (
              <Ionicons name="sync" size={18} color="#fff" style={{ opacity: 0.9 }} />
            ) : (
              <Ionicons name="arrow-up-circle" size={20} color="#fff" />
            )}
          </View>

          <View style={styles.textWrap}>
            <Text style={styles.label} numberOfLines={1}>
              {downloading
                ? 'A descarregar actualização…'
                : Platform.OS !== 'web'
                  ? 'Nova versão disponível'
                  : isAndroid()
                    ? `Nova versão do APK · v${serverInfo?.version}`
                    : 'Nova versão disponível'}
            </Text>
            {!downloading && (
              <Text style={styles.sublabel} numberOfLines={1}>
                {Platform.OS === 'web' && isAndroid()
                  ? 'Toca para descarregar o APK actualizado'
                  : 'Toca para actualizar agora'}
              </Text>
            )}
          </View>

          <View style={styles.ctaWrap}>
            <Text style={styles.ctaText}>
              {downloading ? '…' : 'Atualizar Agora'}
            </Text>
          </View>

          <Pressable
            style={styles.closeBtn}
            onPress={handleDismiss}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Ionicons name="close" size={16} color="rgba(255,255,255,0.75)" />
          </Pressable>
        </Pressable>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 9990,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 16,
  } as any,
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A56DB',
    paddingHorizontal: 14,
    paddingVertical: 11,
    gap: 10,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  textWrap: {
    flex: 1,
    minWidth: 0,
  },
  label: {
    fontSize: 13,
    fontFamily: 'Inter_700Bold',
    color: '#fff',
    lineHeight: 17,
  },
  sublabel: {
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
    color: 'rgba(255,255,255,0.72)',
    lineHeight: 15,
    marginTop: 1,
  },
  ctaWrap: {
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    flexShrink: 0,
  },
  ctaText: {
    fontSize: 12,
    fontFamily: 'Inter_700Bold',
    color: '#fff',
    letterSpacing: 0.3,
  },
  closeBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
});
