import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, Animated, StyleSheet, Platform, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors } from '@/constants/colors';

interface Props {
  storageKey: string;
  title?: string;
  color?: string;
  action?: () => void;
  actionLabel?: string;
  defaultCollapsed?: boolean;
  headerStyle?: ViewStyle;
  children: React.ReactNode;
}

export default function CollapsibleStats({
  storageKey,
  title = 'Resumo',
  color,
  action,
  actionLabel,
  defaultCollapsed = false,
  headerStyle,
  children,
}: Props) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const [ready, setReady] = useState(false);
  const chevron = useRef(new Animated.Value(defaultCollapsed ? 1 : 0)).current;
  const barColor = color ?? Colors.accent;

  useEffect(() => {
    AsyncStorage.getItem(`cs:${storageKey}`)
      .then(val => {
        if (val !== null) {
          const c = val === '1';
          setCollapsed(c);
          chevron.setValue(c ? 1 : 0);
        }
      })
      .finally(() => setReady(true));
  }, [storageKey]);

  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    AsyncStorage.setItem(`cs:${storageKey}`, next ? '1' : '0');
    Animated.timing(chevron, {
      toValue: next ? 1 : 0,
      duration: 220,
      useNativeDriver: Platform.OS !== 'web',
    }).start();
  };

  const rotate = chevron.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '180deg'],
  });

  if (!ready) return null;

  return (
    <View>
      <View style={[styles.header, headerStyle]}>
        <TouchableOpacity style={styles.left} onPress={toggle} activeOpacity={0.7}>
          <View style={[styles.bar, { backgroundColor: barColor }]} />
          <Text style={styles.title}>{title}</Text>
          <Animated.View style={{ transform: [{ rotate }], marginLeft: 2 }}>
            <Ionicons name="chevron-up" size={13} color={Colors.textMuted} />
          </Animated.View>
        </TouchableOpacity>

        <View style={styles.right}>
          {action && actionLabel && (
            <TouchableOpacity onPress={action}>
              <Text style={[styles.actionText, { color: barColor }]}>{actionLabel}</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.toggleBtn} onPress={toggle} activeOpacity={0.7}>
            <Text style={styles.toggleText}>{collapsed ? 'Mostrar' : 'Ocultar'}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {!collapsed && children}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  bar: {
    width: 3,
    height: 14,
    borderRadius: 2,
  },
  title: {
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
    color: Colors.text,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  actionText: {
    fontSize: 12,
    fontFamily: 'Inter_500Medium',
  },
  toggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  toggleText: {
    fontSize: 11,
    fontFamily: 'Inter_500Medium',
    color: Colors.textMuted,
  },
});
