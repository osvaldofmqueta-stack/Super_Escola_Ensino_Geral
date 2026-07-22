import React, { useRef, useEffect } from 'react';
import {
  Animated,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Easing,
  Dimensions,
} from 'react-native';
import { Colors } from '@/constants/colors';

const { width } = Dimensions.get('window');
const CARD_W = Math.min(width * 0.88, 360);

type Props = {
  onRetry: () => void;
  retrying?: boolean;
};

export default function ServerErrorScreen({ onRetry, retrying = false }: Props) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const spinAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 500,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 500,
        easing: Easing.out(Easing.back(1.2)),
        useNativeDriver: true,
      }),
    ]).start();

    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.08,
          duration: 1200,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1200,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, []);

  useEffect(() => {
    if (retrying) {
      const spin = Animated.loop(
        Animated.timing(spinAnim, {
          toValue: 1,
          duration: 900,
          easing: Easing.linear,
          useNativeDriver: true,
        })
      );
      spin.start();
      return () => spin.stop();
    } else {
      spinAnim.setValue(0);
    }
  }, [retrying]);

  const spinInterpolate = spinAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <View style={styles.container}>
      <Animated.View
        style={[
          styles.card,
          { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
        ]}
      >
        <Animated.View
          style={[styles.iconWrap, { transform: [{ scale: pulseAnim }] }]}
        >
          <View style={styles.iconCircle}>
            <Text style={styles.iconEmoji}>📡</Text>
          </View>
        </Animated.View>

        <Text style={styles.title}>Servidor indisponível</Text>
        <Text style={styles.subtitle}>
          Não foi possível ligar ao servidor.{'\n'}
          Verifique a sua ligação à internet e tente novamente.
        </Text>

        <View style={styles.divider} />

        <View style={styles.infoRow}>
          <View style={styles.infoBadge}>
            <Text style={styles.infoBadgeText}>SIGA</Text>
          </View>
          <Text style={styles.infoText}>Super Escola — Sistema Integrado</Text>
        </View>

        <TouchableOpacity
          style={[styles.retryBtn, retrying && styles.retryBtnDisabled]}
          onPress={onRetry}
          disabled={retrying}
          activeOpacity={0.8}
        >
          {retrying ? (
            <Animated.Text
              style={[styles.retryBtnText, { transform: [{ rotate: spinInterpolate }] }]}
            >
              ↻
            </Animated.Text>
          ) : null}
          <Text style={styles.retryBtnText}>
            {retrying ? '  A ligar...' : 'Tentar novamente'}
          </Text>
        </TouchableOpacity>

        <Text style={styles.hint}>
          Se o problema persistir, contacte o administrador da escola.
        </Text>
      </Animated.View>

      <Text style={styles.version}>Super Escola © Queta Tech</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  card: {
    width: CARD_W,
    backgroundColor: Colors.backgroundCard,
    borderRadius: 20,
    padding: 28,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 10,
  },
  iconWrap: {
    marginBottom: 20,
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(220, 53, 69, 0.12)',
    borderWidth: 1.5,
    borderColor: 'rgba(220, 53, 69, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconEmoji: {
    fontSize: 36,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.text,
    textAlign: 'center',
    marginBottom: 10,
    letterSpacing: 0.3,
  },
  subtitle: {
    fontSize: 14,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 20,
  },
  divider: {
    width: '100%',
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
    marginBottom: 16,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 24,
  },
  infoBadge: {
    backgroundColor: Colors.gold,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  infoBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: Colors.background,
    letterSpacing: 1,
  },
  infoText: {
    fontSize: 12,
    color: Colors.textMuted,
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 32,
    width: '100%',
    marginBottom: 16,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 6,
  },
  retryBtnDisabled: {
    opacity: 0.65,
  },
  retryBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 0.3,
  },
  hint: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.3)',
    textAlign: 'center',
    lineHeight: 18,
  },
  version: {
    position: 'absolute',
    bottom: 24,
    fontSize: 11,
    color: 'rgba(255,255,255,0.18)',
    letterSpacing: 0.5,
  },
});
