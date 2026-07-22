import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Animated, StyleSheet, Text, View, Platform,
  TouchableWithoutFeedback, Easing,
} from 'react-native';
import { registerToastListener, ToastType } from '@/utils/toast';

interface Toast {
  id: number;
  message: string;
  type: ToastType;
  duration: number;
}

let _idCounter = 0;

const TYPE_CONFIG: Record<ToastType, {
  border: string;
  iconBg: string;
  progressColor: string;
  icon: string;
  label: string;
}> = {
  success: {
    border: '#22c55e',
    iconBg: 'rgba(34,197,94,0.18)',
    progressColor: '#22c55e',
    icon: '✓',
    label: 'Sucesso',
  },
  error: {
    border: '#ef4444',
    iconBg: 'rgba(239,68,68,0.18)',
    progressColor: '#ef4444',
    icon: '✕',
    label: 'Erro',
  },
  info: {
    border: '#3b82f6',
    iconBg: 'rgba(59,130,246,0.18)',
    progressColor: '#3b82f6',
    icon: 'ℹ',
    label: 'Info',
  },
  warning: {
    border: '#f59e0b',
    iconBg: 'rgba(245,158,11,0.18)',
    progressColor: '#f59e0b',
    icon: '⚠',
    label: 'Atenção',
  },
};

function ToastItem({ toast, onDone }: { toast: Toast; onDone: (id: number) => void }) {
  const slideAnim  = useRef(new Animated.Value(120)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const progressAnim = useRef(new Animated.Value(1)).current;
  const scaleAnim = useRef(new Animated.Value(0.92)).current;
  const dismissedRef = useRef(false);
  const cfg = TYPE_CONFIG[toast.type];
  const useNative = Platform.OS !== 'web';

  const dismiss = useCallback(() => {
    if (dismissedRef.current) return;
    dismissedRef.current = true;
    Animated.parallel([
      Animated.timing(opacityAnim, { toValue: 0, duration: 220, useNativeDriver: useNative }),
      Animated.timing(slideAnim,   { toValue: 100, duration: 220, useNativeDriver: useNative }),
    ]).start(() => onDone(toast.id));
  }, []);

  useEffect(() => {
    // Entrada: desliza de baixo + aparece
    Animated.parallel([
      Animated.spring(slideAnim, {
        toValue: 0, damping: 18, stiffness: 220,
        useNativeDriver: useNative,
      }),
      Animated.spring(opacityAnim, {
        toValue: 1, damping: 18, stiffness: 220,
        useNativeDriver: useNative,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1, damping: 18, stiffness: 220,
        useNativeDriver: useNative,
      }),
    ]).start();

    // Barra de progresso drena até 0
    Animated.timing(progressAnim, {
      toValue: 0,
      duration: toast.duration - 250,
      easing: Easing.linear,
      useNativeDriver: false,
    }).start();

    // Auto-dismiss
    const timer = setTimeout(dismiss, toast.duration);
    return () => clearTimeout(timer);
  }, []);

  return (
    <TouchableWithoutFeedback onPress={dismiss}>
      <Animated.View
        style={[
          styles.toast,
          {
            borderLeftColor: cfg.border,
            opacity: opacityAnim,
            transform: [
              { translateY: slideAnim },
              { scale: scaleAnim },
            ],
          },
        ]}
      >
        {/* Ícone */}
        <View style={[styles.iconWrap, { backgroundColor: cfg.iconBg }]}>
          <Text style={[styles.icon, { color: cfg.border }]}>{cfg.icon}</Text>
        </View>

        {/* Conteúdo */}
        <View style={styles.content}>
          <Text style={[styles.label, { color: cfg.border }]}>{cfg.label}</Text>
          <Text style={styles.message} numberOfLines={3}>{toast.message}</Text>
        </View>

        {/* Botão fechar */}
        <Text style={styles.close}>✕</Text>

        {/* Barra de progresso */}
        <Animated.View
          style={[
            styles.progress,
            {
              backgroundColor: cfg.progressColor,
              width: progressAnim.interpolate({
                inputRange: [0, 1],
                outputRange: ['0%', '100%'],
              }),
            },
          ]}
        />
      </Animated.View>
    </TouchableWithoutFeedback>
  );
}

function ToastContainer({ toasts, remove }: { toasts: Toast[]; remove: (id: number) => void }) {
  return (
    <View style={styles.container} pointerEvents="box-none">
      {toasts.map(t => (
        <ToastItem key={t.id} toast={t} onDone={remove} />
      ))}
    </View>
  );
}

export default function ToastManager() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const add = useCallback((message: string, type: ToastType, duration = 3500) => {
    const id = ++_idCounter;
    setToasts(prev => [...prev.slice(-2), { id, message, type, duration }]);
  }, []);

  const remove = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  useEffect(() => {
    registerToastListener(add);
  }, [add]);

  if (toasts.length === 0) return null;

  if (Platform.OS === 'web') {
    const ReactDOM = require('react-dom');
    return ReactDOM.createPortal(
      <ToastContainer toasts={toasts} remove={remove} />,
      document.body
    );
  }

  return <ToastContainer toasts={toasts} remove={remove} />;
}

const styles = StyleSheet.create({
  container: {
    position: Platform.OS === 'web' ? 'fixed' : 'absolute',
    bottom: Platform.OS === 'web' ? 28 : 90,
    left: 0,
    right: 0,
    zIndex: 2147483647,
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
  } as any,

  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    paddingRight: 38,
    borderRadius: 16,
    borderLeftWidth: 4,
    maxWidth: 440,
    width: '100%',
    overflow: 'hidden',
    backgroundColor: 'rgba(14,14,24,0.96)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.45,
    shadowRadius: 20,
    elevation: 12,
  },

  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  icon: {
    fontSize: 16,
    fontWeight: '800',
  },

  content: {
    flex: 1,
    gap: 2,
  },
  label: {
    fontSize: 11,
    fontFamily: 'Inter_700Bold',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  message: {
    fontSize: 13.5,
    fontFamily: 'Inter_500Medium',
    color: 'rgba(255,255,255,0.88)',
    lineHeight: 19,
  },

  close: {
    position: 'absolute',
    top: 10,
    right: 12,
    color: 'rgba(255,255,255,0.25)',
    fontSize: 11,
    fontWeight: '700',
  },

  progress: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    height: 3,
    borderRadius: 0,
  },
});
