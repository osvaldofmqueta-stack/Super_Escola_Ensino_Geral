import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  Modal,
  Platform,
  StyleSheet,
  Animated,
  Image,
  Easing,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors } from '@/constants/colors';
import type { AuthUser } from '@/context/AuthContext';
import { getRoleLabel } from '@/utils/genero';
import { useConfig } from '@/context/ConfigContext';

const DURATION = 2400;

function getInitials(nome: string): string {
  const parts = nome.trim().split(' ').filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function getFirstName(nome: string): string {
  return nome.trim().split(' ')[0] || nome;
}

interface WelcomeModalProps {
  visible: boolean;
  user: AuthUser | null;
  onFinish: () => void;
}

export default function WelcomeModal({ visible, user, onFinish }: WelcomeModalProps) {
  const { config } = useConfig();
  const progress = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const cardScale = useRef(new Animated.Value(0.88)).current;
  const cardOpacity = useRef(new Animated.Value(0)).current;
  const checkScale = useRef(new Animated.Value(0)).current;
  const checkOpacity = useRef(new Animated.Value(0)).current;
  const shimmer = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) {
      progress.setValue(0);
      opacity.setValue(0);
      cardScale.setValue(0.88);
      cardOpacity.setValue(0);
      checkScale.setValue(0);
      checkOpacity.setValue(0);
      shimmer.setValue(0);
      return;
    }

    const nd = Platform.OS !== 'web';
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 280, useNativeDriver: nd }),
      Animated.spring(cardScale, { toValue: 1, damping: 20, stiffness: 140, useNativeDriver: nd }),
      Animated.timing(cardOpacity, { toValue: 1, duration: 300, useNativeDriver: nd }),
    ]).start(() => {
      Animated.parallel([
        Animated.spring(checkScale, { toValue: 1, damping: 14, stiffness: 180, useNativeDriver: nd }),
        Animated.timing(checkOpacity, { toValue: 1, duration: 250, useNativeDriver: nd }),
      ]).start();

      Animated.loop(
        Animated.sequence([
          Animated.timing(shimmer, { toValue: 1, duration: 900, useNativeDriver: nd, easing: Easing.inOut(Easing.ease) }),
          Animated.timing(shimmer, { toValue: 0, duration: 900, useNativeDriver: nd, easing: Easing.inOut(Easing.ease) }),
        ])
      ).start();

      Animated.timing(progress, {
        toValue: 1,
        duration: DURATION,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }).start(() => {
        Animated.parallel([
          Animated.timing(cardOpacity, { toValue: 0, duration: 240, useNativeDriver: nd }),
          Animated.timing(opacity, { toValue: 0, duration: 320, useNativeDriver: nd }),
        ]).start(() => {
          onFinish();
        });
      });
    });
  }, [visible]);

  if (!user) return null;

  const progressWidth = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  const shimmerOpacity = shimmer.interpolate({
    inputRange: [0, 1],
    outputRange: [0.6, 1],
  });

  return (
    <Modal visible={visible} transparent animationType="none" statusBarTranslucent>
      <Animated.View style={[styles.overlay, { opacity }]}>
        <Animated.View
          style={[
            styles.card,
            {
              opacity: cardOpacity,
              transform: [{ scale: cardScale }],
            },
          ]}
        >
          <View style={styles.topAccent} />

          <View style={styles.checkRow}>
            <Animated.View
              style={[
                styles.checkWrap,
                {
                  opacity: checkOpacity,
                  transform: [{ scale: checkScale }],
                },
              ]}
            >
              <LinearGradient
                colors={['rgba(46,204,113,0.18)', 'rgba(46,204,113,0.06)']}
                style={styles.checkGrad}
              >
                <Ionicons name="checkmark-circle" size={40} color="#2ECC71" />
              </LinearGradient>
            </Animated.View>
          </View>

          <Animated.Text style={[styles.greeting, { opacity: checkOpacity }]}>
            Bem-vindo de volta
          </Animated.Text>

          <Animated.Text style={[styles.name, { opacity: checkOpacity }]}>
            {getFirstName(user.nome)} 👋
          </Animated.Text>

          <Animated.View style={[styles.avatarRow, { opacity: checkOpacity }]}>
            {user.avatar ? (
              <Image source={{ uri: user.avatar }} style={styles.avatar} />
            ) : (
              <LinearGradient
                colors={['#1F3D8A', '#1E3A5F']}
                style={styles.avatarPlaceholder}
              >
                <Text style={styles.avatarInitials}>{getInitials(user.nome)}</Text>
              </LinearGradient>
            )}
            <View style={styles.userInfo}>
              <Text style={styles.fullName} numberOfLines={1}>{user.nome}</Text>
              <View style={styles.roleBadge}>
                <View style={styles.roleDot} />
                <Text style={styles.roleText}>
                  {getRoleLabel(user.role, user.genero)}
                </Text>
              </View>
              {!!(config?.nomeEscola || user.escola) && (
                <Text style={styles.school} numberOfLines={1}>{config?.nomeEscola || user.escola}</Text>
              )}
            </View>
          </Animated.View>

          <View style={styles.divider} />

          <Animated.View style={[styles.progressSection, { opacity: checkOpacity }]}>
            <View style={styles.progressLabelRow}>
              <Text style={styles.progressLabel}>A carregar o sistema</Text>
              <Animated.Text style={[styles.progressDots, { opacity: shimmerOpacity }]}>
                ...
              </Animated.Text>
            </View>
            <View style={styles.progressTrack}>
              <Animated.View style={[styles.progressFill, { width: progressWidth }]}>
                <LinearGradient
                  colors={['#1A5276', '#2980B9', '#C89A2A']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={StyleSheet.absoluteFill}
                />
                <Animated.View style={[styles.progressShimmer, { opacity: shimmerOpacity }]} />
              </Animated.View>
            </View>
          </Animated.View>

          <View style={styles.footer}>
            <View style={styles.angolaBars}>
              <View style={[styles.angolaBar, { backgroundColor: '#CC0000' }]} />
              <View style={[styles.angolaBar, { backgroundColor: '#000' }]} />
            </View>
            <Text style={styles.footerText}>{config?.nomeEscola || 'Super Escola'}</Text>
          </View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(4,10,28,0.82)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 28,
  },
  card: {
    backgroundColor: '#0F1E42',
    borderRadius: 24,
    paddingBottom: 28,
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
  topAccent: {
    height: 3,
    backgroundColor: Colors.gold,
    width: '100%',
  },
  checkRow: {
    alignItems: 'center',
    marginTop: 28,
    marginBottom: 4,
  },
  checkWrap: {
    borderRadius: 40,
    overflow: 'hidden',
  },
  checkGrad: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(46,204,113,0.25)',
  },
  greeting: {
    fontSize: 12,
    fontFamily: 'Inter_500Medium',
    color: Colors.textMuted,
    textAlign: 'center',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginTop: 16,
  },
  name: {
    fontSize: 26,
    fontFamily: 'Inter_700Bold',
    color: Colors.text,
    textAlign: 'center',
    marginTop: 6,
    marginBottom: 20,
    paddingHorizontal: 20,
  },
  avatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginHorizontal: 24,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 2,
    borderColor: Colors.gold,
  },
  avatarPlaceholder: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(240,165,0,0.4)',
  },
  avatarInitials: {
    fontSize: 18,
    fontFamily: 'Inter_700Bold',
    color: Colors.gold,
  },
  userInfo: {
    flex: 1,
    gap: 3,
  },
  fullName: {
    fontSize: 15,
    fontFamily: 'Inter_600SemiBold',
    color: Colors.text,
  },
  roleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  roleDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#2ECC71',
  },
  roleText: {
    fontSize: 12,
    fontFamily: 'Inter_500Medium',
    color: Colors.textSecondary,
  },
  school: {
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
    color: Colors.textMuted,
    marginTop: 1,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
    marginHorizontal: 24,
    marginTop: 22,
    marginBottom: 18,
  },
  progressSection: {
    paddingHorizontal: 24,
    gap: 10,
  },
  progressLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  progressLabel: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    color: Colors.textMuted,
  },
  progressDots: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    color: Colors.gold,
    letterSpacing: 2,
    marginLeft: 2,
  },
  progressTrack: {
    height: 5,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
    overflow: 'hidden',
    position: 'relative',
  },
  progressShimmer: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    width: 40,
    backgroundColor: 'rgba(255,255,255,0.35)',
    borderRadius: 4,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 22,
    paddingHorizontal: 24,
  },
  angolaBars: {
    flexDirection: 'row',
    gap: 2,
  },
  angolaBar: {
    width: 10,
    height: 10,
    borderRadius: 2,
  },
  footerText: {
    fontSize: 10,
    fontFamily: 'Inter_400Regular',
    color: Colors.textMuted,
    letterSpacing: 0.4,
  },
});
