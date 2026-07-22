import React, { useEffect, useRef } from 'react';
import { Animated, Platform, View, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import { Colors } from '@/constants/colors';

type LoaderSize = 'tiny' | 'small' | 'medium' | 'large' | number;

interface AppLoaderProps {
  size?: LoaderSize;
  color?: string;
  style?: StyleProp<ViewStyle>;
}

function resolveDotSize(size: LoaderSize): { dot: number; gap: number } {
  if (typeof size === 'number') {
    const dot = Math.max(3, Math.round(size * 0.32));
    return { dot, gap: Math.max(2, Math.round(dot * 0.55)) };
  }
  switch (size) {
    case 'tiny':   return { dot: 4,  gap: 2.5 };
    case 'large':  return { dot: 11, gap: 6 };
    case 'medium': return { dot: 8,  gap: 4.5 };
    case 'small':
    default:       return { dot: 6,  gap: 3.5 };
  }
}

export default function AppLoader({
  size = 'small',
  color = Colors.gold,
  style,
}: AppLoaderProps) {
  const { dot, gap } = resolveDotSize(size);

  const a = useRef(new Animated.Value(0)).current;
  const b = useRef(new Animated.Value(0)).current;
  const c = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const cycleMs = 1100;
    const upMs = 360;
    const downMs = 360;
    const restMs = cycleMs - (upMs + downMs);

    const nd = Platform.OS !== 'web';
    const make = (val: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(val, { toValue: 1, duration: upMs, useNativeDriver: nd }),
          Animated.timing(val, { toValue: 0, duration: downMs, useNativeDriver: nd }),
          Animated.delay(Math.max(0, restMs - delay)),
        ]),
      );

    const animA = make(a, 0);
    const animB = make(b, 160);
    const animC = make(c, 320);
    animA.start();
    animB.start();
    animC.start();
    return () => {
      animA.stop();
      animB.stop();
      animC.stop();
    };
  }, [a, b, c]);

  const dotStyle = (val: Animated.Value): any => ({
    width: dot,
    height: dot,
    borderRadius: dot / 2,
    backgroundColor: color,
    marginHorizontal: gap / 2,
    opacity: val.interpolate({ inputRange: [0, 1], outputRange: [0.25, 1] }),
    transform: [
      { scale: val.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1.18] }) },
    ],
  });

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel="A carregar"
      style={[styles.row, style]}
    >
      <Animated.View style={dotStyle(a)} />
      <Animated.View style={dotStyle(b)} />
      <Animated.View style={dotStyle(c)} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
});
