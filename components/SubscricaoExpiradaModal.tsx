import React, { useEffect, useRef } from 'react';
import {
  Modal, View, Text, StyleSheet, TouchableOpacity, Animated, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors } from '@/constants/colors';
import { useConfig } from '@/context/ConfigContext';

interface Props {
  visible: boolean;
  diasTolerancia: number;
  onClose: () => void;
  onRenovar?: () => void;
}

export default function SubscricaoExpiradaModal({ visible, diasTolerancia, onClose, onRenovar }: Props) {
  const { config } = useConfig();
  const podeContinuar = diasTolerancia > 0;
  const fadeIn = useRef(new Animated.Value(0)).current;
  const cardScale = useRef(new Animated.Value(0.92)).current;
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!visible) {
      fadeIn.setValue(0);
      cardScale.setValue(0.92);
      return;
    }
    const nd = Platform.OS !== 'web';
    Animated.parallel([
      Animated.timing(fadeIn, { toValue: 1, duration: 240, useNativeDriver: nd }),
      Animated.spring(cardScale, { toValue: 1, damping: 18, stiffness: 160, useNativeDriver: nd }),
    ]).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.06, duration: 800, useNativeDriver: nd }),
        Animated.timing(pulse, { toValue: 1, duration: 800, useNativeDriver: nd }),
      ])
    ).start();
  }, [visible]);

  const plural = diasTolerancia === 1 ? '' : 's';

  return (
    <Modal visible={visible} transparent animationType="none" statusBarTranslucent onRequestClose={onClose}>
      <Animated.View style={[styles.overlay, { opacity: fadeIn }, Platform.OS === 'web' && styles.overlayWeb]}>
        <Animated.View style={[styles.card, { transform: [{ scale: cardScale }] }]}>
          <View style={styles.topAccent} />

          <View style={styles.iconArea}>
            <Animated.View style={[styles.iconRing, { transform: [{ scale: pulse }] }]}>
              <LinearGradient
                colors={['rgba(212,146,14,0.22)', 'rgba(212,146,14,0.06)']}
                style={styles.iconGrad}
              >
                <Ionicons name="alert-circle" size={42} color={Colors.warning} />
              </LinearGradient>
            </Animated.View>
          </View>

          <Text style={styles.title}>Subscrição Expirada</Text>
          <Text style={styles.subtitle}>
            A sua subscrição expirou. Para continuar a usar o sistema sem interrupções,
            regularize o pagamento o quanto antes.
          </Text>

          <View style={styles.infoBox}>
            <View style={styles.infoRow}>
              <Ionicons name="time-outline" size={16} color={Colors.warning} />
              <Text style={styles.infoLabel}>Período de tolerância</Text>
            </View>
            <Text style={styles.infoValue}>
              {diasTolerancia} dia{plural} restante{plural}
            </Text>
          </View>

          <View style={styles.warningRow}>
            <Ionicons name="information-circle-outline" size={14} color={Colors.textMuted} />
            <Text style={styles.warningText}>
              {podeContinuar
                ? 'Após esse período, o acesso será restringido apenas à área de subscrição.'
                : 'O período de tolerância terminou. Renove agora para retomar o acesso.'}
            </Text>
          </View>

          <View style={styles.actions}>
            {onRenovar && (
              <TouchableOpacity style={styles.renovarBtn} onPress={onRenovar} activeOpacity={0.85}>
                <LinearGradient
                  colors={['#D4920E', '#E8B340']}
                  style={styles.okBtnGrad}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                >
                  <Ionicons name="rocket-outline" size={17} color="#0F1E42" />
                  <Text style={styles.renovarText}>Renovar Agora</Text>
                </LinearGradient>
              </TouchableOpacity>
            )}

            {podeContinuar && (
              <TouchableOpacity style={styles.okBtn} onPress={onClose} activeOpacity={0.85}>
                <View style={styles.okBtnGhost}>
                  <Ionicons name="checkmark-circle-outline" size={16} color={Colors.textSecondary} />
                  <Text style={styles.okTextGhost}>Compreendido — continuar</Text>
                </View>
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.footer}>
            <View style={styles.brandBadge}>
              <Ionicons name="shield-checkmark" size={12} color={Colors.textMuted} />
              <Text style={styles.brandText}>{config?.nomeEscola || 'Super Escola'} · Gestão de Licença</Text>
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
    maxWidth: 380,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.6,
    shadowRadius: 40,
    elevation: 30,
  },
  topAccent: { height: 3, width: '100%', backgroundColor: Colors.warning },
  iconArea: { alignItems: 'center', marginTop: 28, marginBottom: 6 },
  iconRing: {
    borderRadius: 44,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: Colors.warning,
  },
  iconGrad: {
    width: 84, height: 84, borderRadius: 42,
    alignItems: 'center', justifyContent: 'center',
  },
  title: {
    fontSize: 20, fontFamily: 'Inter_700Bold', color: Colors.text,
    textAlign: 'center', marginTop: 18, marginBottom: 10,
  },
  subtitle: {
    fontSize: 13, fontFamily: 'Inter_400Regular', color: Colors.textSecondary,
    textAlign: 'center', lineHeight: 20, paddingHorizontal: 24, marginBottom: 18,
  },
  infoBox: {
    marginHorizontal: 24,
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(212,146,14,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(212,146,14,0.25)',
    borderRadius: 14,
    alignItems: 'center',
    marginBottom: 12,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  infoLabel: {
    fontSize: 11,
    fontFamily: 'Inter_500Medium',
    color: Colors.textMuted,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  infoValue: {
    fontSize: 18,
    fontFamily: 'Inter_700Bold',
    color: Colors.warning,
  },
  warningRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    paddingHorizontal: 24,
    marginBottom: 20,
  },
  warningText: {
    flex: 1,
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
    color: Colors.textMuted,
    lineHeight: 16,
    fontStyle: 'italic',
  },
  actions: { paddingHorizontal: 20, gap: 10 },
  renovarBtn: { borderRadius: 14, overflow: 'hidden' },
  okBtn: { borderRadius: 14, overflow: 'hidden' },
  okBtnGrad: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 14,
  },
  okBtnGhost: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 12,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.03)',
  },
  okText: { fontSize: 15, fontFamily: 'Inter_600SemiBold', color: '#fff' },
  renovarText: { fontSize: 15, fontFamily: 'Inter_700Bold', color: '#0F1E42' },
  okTextGhost: { fontSize: 13, fontFamily: 'Inter_500Medium', color: Colors.textSecondary },
  footer: { alignItems: 'center', marginTop: 18 },
  brandBadge: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  brandText: { fontSize: 10, fontFamily: 'Inter_400Regular', color: Colors.textMuted },
});
