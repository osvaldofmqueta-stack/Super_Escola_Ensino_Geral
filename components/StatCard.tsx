import React, { useRef, useEffect } from 'react';
import { View, Text, StyleSheet, Animated, TouchableOpacity, Platform } from 'react-native';
import { Colors } from '@/constants/colors';

interface StatCardProps {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  color: string;
  subtitle?: string;
  onPress?: () => void;
  delay?: number;
}

export default function StatCard({ label, value, icon, color, subtitle, onPress, delay = 0 }: StatCardProps) {
  const scale = useRef(new Animated.Value(0.9)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    setTimeout(() => {
      Animated.parallel([
        Animated.spring(scale, { toValue: 1, useNativeDriver: Platform.OS !== 'web', damping: 15 }),
        Animated.timing(opacity, { toValue: 1, duration: 300, useNativeDriver: Platform.OS !== 'web' }),
      ]).start();
    }, delay);
  }, []);

  return (
    <Animated.View style={[styles.wrapper, { opacity, transform: [{ scale }] }]}>
      <TouchableOpacity
        style={[styles.card, { borderLeftColor: color, borderLeftWidth: 3 }]}
        onPress={onPress}
        activeOpacity={onPress ? 0.7 : 1}
      >
        <View style={[styles.iconContainer, { backgroundColor: `${color}18` }]}>
          {icon}
        </View>
        <View style={styles.content}>
          <Text style={styles.value}>{value}</Text>
          <Text style={styles.label}>{label}</Text>
          {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    minWidth: '45%',
  },
  card: {
    backgroundColor: Colors.backgroundCard,
    borderRadius: 16,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flex: 1,
  },
  value: {
    fontSize: 24,
    fontFamily: 'Inter_700Bold',
    color: Colors.text,
    lineHeight: 28,
  },
  label: {
    fontSize: 12,
    fontFamily: 'Inter_500Medium',
    color: Colors.textSecondary,
    marginTop: 2,
  },
  subtitle: {
    fontSize: 10,
    fontFamily: 'Inter_400Regular',
    color: Colors.textMuted,
    marginTop: 1,
  },
});
