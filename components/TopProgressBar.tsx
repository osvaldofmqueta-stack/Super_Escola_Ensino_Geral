import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Platform, StyleSheet, View } from 'react-native';
import { Colors } from '@/constants/colors';
import { syncProgress } from '@/lib/syncProgress';

const BAR_HEIGHT = 3;
const DONE_HOLD_MS = 500;
const FADE_OUT_MS = 300;
// Only show the bar if loading takes longer than this threshold — avoids flash on fast requests
const SHOW_DELAY_MS = 200;

type Phase = 'idle' | 'syncing' | 'done';

export default function TopProgressBar() {
  const [phase, setPhase] = useState<Phase>('idle');
  const [count, setCount] = useState(0);
  const translate = useRef(new Animated.Value(-1)).current;
  const barOpacity = useRef(new Animated.Value(0)).current;
  const pillOpacity = useRef(new Animated.Value(0)).current;
  const barColor = useRef(new Animated.Value(0)).current;
  const loopRef = useRef<Animated.CompositeAnimation | null>(null);
  const doneTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const nd = Platform.OS !== 'web';

  useEffect(() => {
    const unsub = syncProgress.subscribe((isActive, currentCount) => {
      setCount(currentCount);

      if (doneTimer.current) {
        clearTimeout(doneTimer.current);
        doneTimer.current = null;
      }

      if (isActive) {
        // Delay showing the bar — avoids flash on fast requests (< SHOW_DELAY_MS)
        if (!showTimer.current) {
          showTimer.current = setTimeout(() => {
            showTimer.current = null;
            setPhase('syncing');
          }, SHOW_DELAY_MS);
        }
      } else {
        // Cancel pending show if load finished before delay
        if (showTimer.current) {
          clearTimeout(showTimer.current);
          showTimer.current = null;
        }
        setPhase((prev) => {
          if (prev === 'idle') return 'idle'; // never showed — skip done animation
          return 'done';
        });
        doneTimer.current = setTimeout(() => setPhase('idle'), DONE_HOLD_MS + FADE_OUT_MS);
      }
    });
    return () => {
      unsub();
      if (doneTimer.current) clearTimeout(doneTimer.current);
      if (showTimer.current) clearTimeout(showTimer.current);
    };
  }, []);

  useEffect(() => {
    if (phase === 'idle') {
      if (loopRef.current) { loopRef.current.stop(); loopRef.current = null; }
      Animated.parallel([
        Animated.timing(barOpacity, { toValue: 0, duration: FADE_OUT_MS, useNativeDriver: nd }),
        Animated.timing(pillOpacity, { toValue: 0, duration: FADE_OUT_MS, useNativeDriver: nd }),
      ]).start();
      return;
    }

    if (phase === 'syncing') {
      Animated.timing(barColor, { toValue: 0, duration: 200, useNativeDriver: false }).start();
      Animated.timing(barOpacity, { toValue: 1, duration: 150, useNativeDriver: nd }).start();
      Animated.timing(pillOpacity, { toValue: 1, duration: 200, useNativeDriver: nd }).start();

      if (!loopRef.current) {
        translate.setValue(-1);
        const loop = Animated.loop(
          Animated.sequence([
            Animated.timing(translate, {
              toValue: 1,
              duration: 1100,
              easing: Easing.bezier(0.4, 0, 0.2, 1),
              useNativeDriver: nd,
            }),
            Animated.timing(translate, { toValue: -1, duration: 0, useNativeDriver: nd }),
          ]),
        );
        loopRef.current = loop;
        loop.start();
      }
      return;
    }

    if (phase === 'done') {
      if (loopRef.current) { loopRef.current.stop(); loopRef.current = null; }
      Animated.sequence([
        Animated.timing(barColor, { toValue: 1, duration: 200, useNativeDriver: false }),
        Animated.delay(DONE_HOLD_MS),
        Animated.parallel([
          Animated.timing(barOpacity, { toValue: 0, duration: FADE_OUT_MS, useNativeDriver: nd }),
          Animated.timing(pillOpacity, { toValue: 0, duration: FADE_OUT_MS, useNativeDriver: nd }),
        ]),
      ]).start();
    }
  }, [phase]);

  if (phase === 'idle') return null;

  const animatedBarColor = barColor.interpolate({
    inputRange: [0, 1],
    outputRange: [Colors.accent, Colors.success],
  });

  const animatedGlowColor = barColor.interpolate({
    inputRange: [0, 1],
    outputRange: [Colors.accent + 'AA', Colors.success + 'AA'],
  });

  const translateX = translate.interpolate({
    inputRange: [-1, 1],
    outputRange: ['-100%', '250%'] as any,
  });

  const isDone = phase === 'done';

  return (
    <View
      style={[styles.container, Platform.OS === 'web' ? styles.webFixed : null, { pointerEvents: 'none' } as any]}
    >
      <Animated.View style={[styles.track, { opacity: barOpacity }]}>
        {isDone ? (
          <Animated.View
            style={[styles.fullBar, { backgroundColor: animatedBarColor, shadowColor: animatedGlowColor }]}
          />
        ) : (
          <Animated.View
            style={[
              styles.bar,
              { backgroundColor: animatedBarColor, shadowColor: animatedGlowColor },
              { transform: [{ translateX } as any] },
            ]}
          />
        )}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100000,
  },
  webFixed: {
    position: 'fixed' as any,
  } as any,
  track: {
    height: BAR_HEIGHT,
    width: '100%',
    backgroundColor: Colors.accent + '18',
    overflow: 'hidden',
  },
  bar: {
    height: BAR_HEIGHT,
    width: '40%',
    borderRadius: 2,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 6,
    elevation: 4,
  },
  fullBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: BAR_HEIGHT,
    borderRadius: 2,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 6,
    elevation: 4,
  },
});
