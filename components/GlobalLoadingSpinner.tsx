import React, { useEffect, useRef, useState } from 'react';
import { Animated, Platform, StyleSheet, View } from 'react-native';
import { useIsMutating } from '@tanstack/react-query';

const SHOW_DELAY_MS = 150;
const MIN_SHOW_MS = 350;
const FADE_IN_MS = 150;
const FADE_OUT_MS = 200;

export default function GlobalLoadingSpinner() {
  // Apenas mutações (escritas) activam o spinner — fetches de leitura em
  // background (chat, notificações, pollings) não devem bloquear a UI.
  const isMutating = useIsMutating();
  const isActive = isMutating > 0;

  const [mounted, setMounted] = useState(false);
  const showTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shownAt = useRef<number | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const rotate = useRef(new Animated.Value(0)).current;
  const spinRef = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    spinRef.current = Animated.loop(
      Animated.timing(rotate, {
        toValue: 1,
        duration: 750,
        useNativeDriver: Platform.OS !== 'web',
      })
    );
    spinRef.current.start();
    return () => spinRef.current?.stop();
  }, [rotate]);

  useEffect(() => {
    if (isActive) {
      if (hideTimer.current) { clearTimeout(hideTimer.current); hideTimer.current = null; }
      if (!mounted && !showTimer.current) {
        showTimer.current = setTimeout(() => {
          showTimer.current = null;
          shownAt.current = Date.now();
          setMounted(true);
          Animated.timing(opacity, {
            toValue: 1,
            duration: FADE_IN_MS,
            useNativeDriver: Platform.OS !== 'web',
          }).start();
        }, SHOW_DELAY_MS);
      }
    } else {
      if (showTimer.current) { clearTimeout(showTimer.current); showTimer.current = null; }
      if (mounted && !hideTimer.current) {
        const elapsed = shownAt.current ? Date.now() - shownAt.current : MIN_SHOW_MS;
        const remaining = Math.max(0, MIN_SHOW_MS - elapsed);
        hideTimer.current = setTimeout(() => {
          Animated.timing(opacity, {
            toValue: 0,
            duration: FADE_OUT_MS,
            useNativeDriver: Platform.OS !== 'web',
          }).start();
          hideTimer.current = setTimeout(() => {
            hideTimer.current = null;
            shownAt.current = null;
            setMounted(false);
            rotate.setValue(0);
          }, FADE_OUT_MS + 30);
        }, remaining);
      }
    }
  }, [isActive, mounted, opacity, rotate]);

  if (!mounted) return null;

  if (Platform.OS === 'web') {
    return (
      <Animated.View
        style={[StyleSheet.absoluteFill, styles.overlay, { opacity }]}
        pointerEvents="none"
      >
        <style>{`
          @keyframes __siga_spin { to { transform: rotate(360deg); } }
          .__siga_ring { animation: __siga_spin 0.75s linear infinite; }
        `}</style>
        <View style={styles.card}>
          <div
            className="__siga_ring"
            style={{
              width: 38,
              height: 38,
              borderRadius: '50%',
              border: '3.5px solid rgba(212,175,55,0.18)',
              borderTopColor: '#D4AF37',
              borderRightColor: '#D4AF37',
              boxSizing: 'border-box',
              flexShrink: 0,
            } as React.CSSProperties}
          />
        </View>
      </Animated.View>
    );
  }

  const spin = rotate.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <Animated.View
      style={[StyleSheet.absoluteFill, styles.overlay, { opacity }]}
      pointerEvents="none"
    >
      <View style={styles.card}>
        <Animated.View style={[styles.ring, { transform: [{ rotate: spin }] }]} />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    zIndex: 99980,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: 'rgba(10, 24, 40, 0.88)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45,
    shadowRadius: 16,
    elevation: 16,
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.12)',
  },
  ring: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 3.5,
    borderColor: 'rgba(212,175,55,0.18)',
    borderTopColor: '#D4AF37',
    borderRightColor: '#D4AF37',
  },
});
