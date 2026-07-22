import React, { useEffect, useRef, useState } from 'react';
import { Animated, Modal, Platform, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AppLoader from './AppLoader';
import { Colors } from '@/constants/colors';
import { PDF_PROGRESS_STEPS, PDF_STEP_DURATIONS } from '@/hooks/usePdfProgress';

interface Props {
  visible: boolean;
  step: number;
  label?: string;
  color?: string;
}

export default function PdfProgressModal({ visible, step, label = 'Documento', color = Colors.primary }: Props) {
  const progressAnim = useRef(new Animated.Value(0)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const prevStep = useRef(-1);
  const [displayPct, setDisplayPct] = useState(0);
  const nd = Platform.OS !== 'web';

  useEffect(() => {
    const id = progressAnim.addListener(({ value }) => setDisplayPct(Math.round(value)));
    return () => progressAnim.removeListener(id);
  }, [progressAnim]);

  useEffect(() => {
    if (visible && prevStep.current === -1) {
      prevStep.current = 0;
      Animated.timing(opacityAnim, { toValue: 1, duration: 220, useNativeDriver: nd }).start();
    }
    if (!visible) {
      prevStep.current = -1;
      progressAnim.setValue(0);
      setDisplayPct(0);
      Animated.timing(opacityAnim, { toValue: 0, duration: 260, useNativeDriver: nd }).start();
    }
  }, [visible]);

  useEffect(() => {
    if (!visible || step < 0 || step >= PDF_PROGRESS_STEPS.length) return;
    if (step === prevStep.current && step !== 0) return;
    prevStep.current = step;

    const target = PDF_PROGRESS_STEPS[step].pct;
    const duration = PDF_STEP_DURATIONS[step];

    Animated.timing(progressAnim, {
      toValue: target,
      duration,
      useNativeDriver: false,
    }).start();
  }, [step, visible]);

  if (!visible) return null;

  const info = PDF_PROGRESS_STEPS[Math.max(0, Math.min(step, PDF_PROGRESS_STEPS.length - 1))];
  const isDone = step >= PDF_PROGRESS_STEPS.length - 1;
  const activeColor = isDone ? Colors.success : color;

  return (
    <Modal visible={visible} transparent animationType="none" statusBarTranslucent>
      <Animated.View style={[styles.overlay, { opacity: opacityAnim }]}>
        <View style={styles.card}>

          {/* Ícone animado */}
          <View style={[styles.iconCircle, { backgroundColor: activeColor + '22', borderColor: activeColor + '55' }]}>
            <Ionicons name={info.icon} size={32} color={activeColor} />
          </View>

          {/* Nome do documento */}
          <Text style={styles.docLabel} numberOfLines={2}>{label}</Text>

          {/* Descrição do passo */}
          <Text style={[styles.stepText, isDone && { color: Colors.success }]}>
            {info.label}
          </Text>

          {/* Percentagem em destaque */}
          <Text style={[styles.pctBig, isDone && { color: Colors.success }]}>
            {displayPct}%
          </Text>

          {/* Barra de progresso */}
          <View style={styles.track}>
            <Animated.View
              style={[
                styles.fill,
                {
                  backgroundColor: activeColor,
                  width: progressAnim.interpolate({
                    inputRange: [0, 100],
                    outputRange: ['0%', '100%'],
                  }),
                },
              ]}
            />
          </View>

          {/* Indicadores de passo */}
          <View style={styles.dotsRow}>
            {PDF_PROGRESS_STEPS.map((ps, i) => {
              const done = step > i || (step === i && isDone);
              const active = step === i;
              return (
                <View key={i} style={styles.dotItem}>
                  <View style={[
                    styles.dot,
                    done && { backgroundColor: Colors.success, borderColor: Colors.success },
                    active && !done && { borderColor: color, backgroundColor: color + '22' },
                  ]}>
                    {done
                      ? <Ionicons name="checkmark" size={10} color="#fff" />
                      : active
                      ? <AppLoader size="small" color={color} style={{ transform: [{ scale: 0.5 }] }} />
                      : null}
                  </View>
                  <Text style={[
                    styles.dotLabel,
                    done && { color: Colors.success },
                    active && { color },
                  ]} numberOfLines={1}>
                    {ps.label.replace('…', '').replace('!', '')}
                  </Text>
                </View>
              );
            })}
          </View>

        </View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(5, 13, 24, 0.93)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  card: {
    backgroundColor: '#0d1a2d',
    borderRadius: 22,
    padding: 28,
    width: '100%',
    maxWidth: 380,
    alignItems: 'center',
    gap: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.45,
    shadowRadius: 28,
    elevation: 22,
  },
  iconCircle: {
    width: 66, height: 66, borderRadius: 33,
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 2,
  },
  docLabel: {
    fontSize: 14,
    fontFamily: 'Inter_700Bold',
    color: '#e8f0fe',
    textAlign: 'center',
    maxWidth: 300,
  },
  stepText: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    color: 'rgba(180,200,230,0.65)',
    textAlign: 'center',
  },
  pctBig: {
    fontSize: 44,
    fontFamily: 'Inter_700Bold',
    color: '#D4AF37',
    letterSpacing: -1,
    lineHeight: 52,
  },
  track: {
    width: '100%',
    height: 8,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 4,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 4,
  },
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginTop: 4,
    gap: 4,
  },
  dotItem: { flex: 1, alignItems: 'center', gap: 4 },
  dot: {
    width: 20, height: 20, borderRadius: 10,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.14)',
    justifyContent: 'center', alignItems: 'center',
    backgroundColor: 'transparent',
  },
  dotLabel: {
    fontSize: 9,
    color: 'rgba(180,200,230,0.38)',
    textAlign: 'center',
    fontWeight: '500',
  },
});
