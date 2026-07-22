import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Modal, View, Text, StyleSheet, TouchableOpacity, Animated, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors } from '@/constants/colors';

const COUNTDOWN_SECONDS = 60;

function getTimeoutForRole(role?: string | null): number {
  const r = (role || '').toLowerCase();
  if (['admin', 'director', 'ceo', 'pca'].includes(r)) return 15 * 60 * 1000;
  if (['tesoureiro', 'financeiro', 'secretaria', 'chefe_secretaria'].includes(r)) return 10 * 60 * 1000;
  return 12 * 60 * 1000;
}

interface SessionTimeoutModalProps {
  onLogout: () => void;
  onContinue: () => void;
  enabled?: boolean;
}

export function useSessionTimeout(onLogout: () => void, enabled = true, role?: string | null) {
  const inactivityTimeout = getTimeoutForRole(role);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastActivityRef = useRef<number>(Date.now());
  const [showModal, setShowModal] = useState(false);
  const [countdown, setCountdown] = useState(COUNTDOWN_SECONDS);
  const [lastActivity, setLastActivity] = useState<number>(Date.now());
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isModalShown = useRef(false);

  const resetTimer = useCallback(() => {
    if (!enabled) return;
    if (isModalShown.current) return;

    lastActivityRef.current = Date.now();

    if (timerRef.current) clearTimeout(timerRef.current);

    timerRef.current = setTimeout(() => {
      isModalShown.current = true;
      setLastActivity(lastActivityRef.current);
      setCountdown(COUNTDOWN_SECONDS);
      setShowModal(true);
    }, inactivityTimeout);
  }, [enabled, inactivityTimeout]);

  const startCountdown = useCallback(() => {
    if (countdownRef.current) clearInterval(countdownRef.current);
    let remaining = COUNTDOWN_SECONDS;

    countdownRef.current = setInterval(() => {
      remaining -= 1;
      setCountdown(remaining);
      if (remaining <= 0) {
        if (countdownRef.current) clearInterval(countdownRef.current);
        setShowModal(false);
        isModalShown.current = false;
        onLogout();
      }
    }, 1000);
  }, [onLogout]);

  const handleContinue = useCallback(() => {
    if (countdownRef.current) clearInterval(countdownRef.current);
    setShowModal(false);
    isModalShown.current = false;
    resetTimer();
  }, [resetTimer]);

  const handleLogout = useCallback(() => {
    if (countdownRef.current) clearInterval(countdownRef.current);
    if (timerRef.current) clearTimeout(timerRef.current);
    setShowModal(false);
    isModalShown.current = false;
    onLogout();
  }, [onLogout]);

  useEffect(() => {
    if (showModal) {
      startCountdown();
    }
  }, [showModal, startCountdown]);

  useEffect(() => {
    if (!enabled) {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
      setShowModal(false);
      isModalShown.current = false;
      return;
    }

    resetTimer();

    if (Platform.OS === 'web') {
      const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'];
      const handler = () => resetTimer();
      events.forEach(e => document.addEventListener(e, handler, { passive: true }));
      return () => {
        events.forEach(e => document.removeEventListener(e, handler));
        if (timerRef.current) clearTimeout(timerRef.current);
        if (countdownRef.current) clearInterval(countdownRef.current);
      };
    }

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [enabled, resetTimer]);

  return { showModal, countdown, lastActivity, inactivityTimeout, handleContinue, handleLogout };
}

function formatLastActivity(ts: number): string {
  const diffMs = Date.now() - ts;
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return 'há menos de 1 minuto';
  if (mins === 1) return 'há 1 minuto';
  if (mins < 60) return `há ${mins} minutos`;
  const h = Math.floor(mins / 60);
  return h === 1 ? 'há 1 hora' : `há ${h} horas`;
}

export default function SessionTimeoutModal({
  onLogout,
  onContinue,
  visible,
  countdown,
  lastActivity,
}: {
  onLogout: () => void;
  onContinue: () => void;
  visible: boolean;
  countdown: number;
  lastActivity?: number;
}) {
  const pulse = useRef(new Animated.Value(1)).current;
  const fadeIn = useRef(new Animated.Value(0)).current;
  const cardScale = useRef(new Animated.Value(0.9)).current;
  const [hovering, setHovering] = useState(false);

  useEffect(() => {
    if (!visible) {
      fadeIn.setValue(0);
      cardScale.setValue(0.9);
      setHovering(false);
      return;
    }

    const nd = Platform.OS !== 'web';
    Animated.parallel([
      Animated.timing(fadeIn, { toValue: 1, duration: 250, useNativeDriver: nd }),
      Animated.spring(cardScale, { toValue: 1, damping: 18, stiffness: 160, useNativeDriver: nd }),
    ]).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.08, duration: 700, useNativeDriver: nd }),
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: nd }),
      ])
    ).start();
  }, [visible]);

  // Hover-to-renew (web only): if user hovers over modal, treat as activity
  useEffect(() => {
    if (!visible || !hovering) return;
    onContinue();
  }, [visible, hovering, onContinue]);

  const progress = Math.max(0, Math.min(1, countdown / COUNTDOWN_SECONDS));
  const isUrgent = countdown <= 15;
  const accentColor = isUrgent ? Colors.danger : Colors.warning;

  const webHoverProps =
    Platform.OS === 'web'
      ? ({
          onMouseEnter: () => setHovering(true),
          onMouseLeave: () => setHovering(false),
        } as any)
      : {};

  return (
    <Modal visible={visible} transparent animationType="none" statusBarTranslucent>
      <Animated.View style={[styles.overlay, { opacity: fadeIn }, Platform.OS === 'web' && styles.overlayWeb]}>
        <Animated.View
          style={[styles.card, { transform: [{ scale: cardScale }] }]}
          {...webHoverProps}
        >
          <View style={[styles.topAccent, { backgroundColor: accentColor }]} />

          <View style={styles.iconArea}>
            <Animated.View style={[styles.iconRing, { transform: [{ scale: pulse }], borderColor: accentColor }]}>
              <LinearGradient
                colors={isUrgent ? ['rgba(231,76,60,0.18)', 'rgba(231,76,60,0.06)'] : ['rgba(240,165,0,0.18)', 'rgba(240,165,0,0.06)']}
                style={styles.iconGrad}
              >
                <Ionicons
                  name={isUrgent ? 'alert-circle' : 'time-outline'}
                  size={40}
                  color={accentColor}
                />
              </LinearGradient>
            </Animated.View>
          </View>

          <Text style={styles.title}>Sessão Inactiva</Text>
          <Text style={styles.subtitle}>
            Por razões de segurança, a sua sessão irá terminar automaticamente.
          </Text>

          {lastActivity ? (
            <View style={styles.lastActivityRow}>
              <Ionicons name="pulse-outline" size={11} color={Colors.textMuted} />
              <Text style={styles.lastActivityText}>Última actividade {formatLastActivity(lastActivity)}</Text>
            </View>
          ) : null}

          <View style={styles.countdownArea}>
            <Text style={[styles.countdownNumber, { color: accentColor }]}>
              {countdown}
            </Text>
            <Text style={styles.countdownLabel}>segundos restantes</Text>
          </View>

          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, {
              width: `${progress * 100}%`,
              backgroundColor: accentColor,
            }]} />
          </View>

          {Platform.OS === 'web' ? (
            <Text style={styles.hoverHint}>Passe o rato sobre esta janela para renovar a sessão</Text>
          ) : null}

          <View style={styles.actions}>
            <TouchableOpacity style={styles.logoutBtn} onPress={onLogout} activeOpacity={0.8}>
              <Ionicons name="log-out-outline" size={16} color={Colors.textSecondary} />
              <Text style={styles.logoutText}>Terminar Sessão</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.continueBtn} onPress={onContinue} activeOpacity={0.85}>
              <LinearGradient
                colors={['#1A5276', '#2980B9']}
                style={styles.continueBtnGrad}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                <Ionicons name="checkmark-circle-outline" size={17} color="#fff" />
                <Text style={styles.continueText}>Continuar Sessão</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>

          <View style={styles.footer}>
            <View style={styles.securityBadge}>
              <Ionicons name="shield-checkmark" size={12} color={Colors.textMuted} />
              <Text style={styles.securityText}>QUETA · Protecção de Dados</Text>
            </View>
          </View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(4,10,28,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  overlayWeb: {
    zIndex: 999999,
  },
  card: {
    backgroundColor: '#0F1E42',
    borderRadius: 24,
    paddingBottom: 24,
    width: '100%',
    maxWidth: 360,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.6,
    shadowRadius: 40,
    elevation: 30,
  },
  topAccent: { height: 3, width: '100%' },
  iconArea: { alignItems: 'center', marginTop: 28, marginBottom: 6 },
  iconRing: {
    borderRadius: 44, overflow: 'hidden',
    borderWidth: 1.5,
  },
  iconGrad: {
    width: 80, height: 80, borderRadius: 40,
    alignItems: 'center', justifyContent: 'center',
  },
  title: {
    fontSize: 20, fontFamily: 'Inter_700Bold', color: Colors.text,
    textAlign: 'center', marginTop: 16, marginBottom: 8,
  },
  subtitle: {
    fontSize: 13, fontFamily: 'Inter_400Regular', color: Colors.textSecondary,
    textAlign: 'center', lineHeight: 20, paddingHorizontal: 24, marginBottom: 8,
  },
  lastActivityRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 5, marginBottom: 14,
  },
  lastActivityText: {
    fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted,
    fontStyle: 'italic',
  },
  countdownArea: { alignItems: 'center', marginBottom: 14 },
  countdownNumber: {
    fontSize: 56, fontFamily: 'Inter_700Bold', lineHeight: 64,
  },
  countdownLabel: {
    fontSize: 12, fontFamily: 'Inter_500Medium', color: Colors.textMuted, letterSpacing: 0.5,
  },
  progressTrack: {
    height: 4, backgroundColor: 'rgba(255,255,255,0.08)',
    marginHorizontal: 24, borderRadius: 4, overflow: 'hidden', marginBottom: 12,
  },
  progressFill: { height: '100%', borderRadius: 4 },
  hoverHint: {
    fontSize: 10, fontFamily: 'Inter_400Regular', color: Colors.textMuted,
    textAlign: 'center', paddingHorizontal: 24, marginBottom: 14, fontStyle: 'italic',
  },
  actions: { paddingHorizontal: 20, gap: 10 },
  continueBtn: { borderRadius: 14, overflow: 'hidden' },
  continueBtnGrad: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 14,
  },
  continueText: { fontSize: 15, fontFamily: 'Inter_600SemiBold', color: '#fff' },
  logoutBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 12, borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  logoutText: { fontSize: 14, fontFamily: 'Inter_500Medium', color: Colors.textSecondary },
  footer: { alignItems: 'center', marginTop: 18 },
  securityBadge: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  securityText: { fontSize: 10, fontFamily: 'Inter_400Regular', color: Colors.textMuted },
});
