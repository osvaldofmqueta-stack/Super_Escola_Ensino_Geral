import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Animated,
  Platform, ScrollView, Switch, Image, useWindowDimensions,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { checkBiometricAvailable } from '@/lib/biometric-bridge';
import { Colors } from '@/constants/colors';
import { useDrawer } from '@/context/DrawerContext';
import { useAuth } from '@/context/AuthContext';
import { useConfig } from '@/context/ConfigContext';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { getRoleLabel } from '@/utils/genero';
import { useResolvedGenero } from '@/hooks/useResolvedGenero';
import { useAnoAcademico } from '@/context/AnoAcademicoContext';

const roleColors: Record<string, string> = {
  ceo: '#8B5CF6', pca: Colors.gold, admin: Colors.info, director: Colors.gold,
  chefe_secretaria: '#E11D48',
  secretaria: Colors.info, professor: Colors.success, aluno: Colors.success,
  financeiro: Colors.warning, encarregado: '#F97316', rh: '#06B6D4',
};

const CEO_SHORTCUTS = [
  { label: 'Painel CEO', icon: 'crown' as const, color: '#FFD700', bg: 'rgba(255,215,0,0.12)', route: '/(main)/ceo' },
  { label: 'Relatórios', icon: 'chart-bar' as const, color: '#34D399', bg: 'rgba(52,211,153,0.12)', route: '/(main)/relatorios' },
  { label: 'Recursos Humanos', icon: 'account-tie' as const, color: '#60A5FA', bg: 'rgba(96,165,250,0.12)', route: '/(main)/rh-hub' },
  { label: 'Financeiro', icon: 'cash-multiple' as const, color: '#4ADE80', bg: 'rgba(74,222,128,0.12)', route: '/(main)/financeiro' },
  { label: 'Auditoria', icon: 'file-search-outline' as const, color: '#A78BFA', bg: 'rgba(167,139,250,0.12)', route: '/(main)/auditoria' },
  { label: 'Configurações', icon: 'cog' as const, color: '#94A3B8', bg: 'rgba(148,163,184,0.12)', route: '/(main)/admin' },
];

export default function DrawerRight() {
  const { rightOpen, closeRight } = useDrawer();
  const resolvedGenero = useResolvedGenero();
  const insets = useSafeAreaInsets();
  const { user, logout, setBiometric } = useAuth();
  const { config } = useConfig();
  const router = useRouter();
  const { isDesktop } = useBreakpoint();
  const { anoSelecionado } = useAnoAcademico();
  const { width: winWidth } = useWindowDimensions();

  const drawerWidth = Math.min(winWidth * 0.88, 320);

  const [confirmLogout, setConfirmLogout] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const translateX = useRef(new Animated.Value(320)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const confirmAnim = useRef(new Animated.Value(0)).current;

  const isCeo = user?.role === 'ceo';
  const isPca = user?.role === 'pca';

  useEffect(() => {
    const nd = Platform.OS !== 'web';
    Animated.parallel([
      Animated.spring(translateX, {
        toValue: rightOpen ? 0 : drawerWidth,
        useNativeDriver: nd,
        damping: 20,
        stiffness: 200,
      }),
      Animated.timing(opacity, {
        toValue: rightOpen ? 1 : 0,
        duration: 250,
        useNativeDriver: nd,
      }),
    ]).start();

    if (!rightOpen) {
      setConfirmLogout(false);
    }
  }, [rightOpen, drawerWidth]);

  useEffect(() => {
    const nd = Platform.OS !== 'web';
    Animated.spring(confirmAnim, {
      toValue: confirmLogout ? 1 : 0,
      useNativeDriver: nd,
      damping: 18,
      stiffness: 200,
    }).start();
  }, [confirmLogout]);

  const topInset = isDesktop ? 0 : insets.top;
  const bottomInset = isDesktop ? 0 : insets.bottom;

  async function toggleBiometric(val: boolean) {
    if (val) {
      const { available } = await checkBiometricAvailable();
      if (!available) return;
    }
    await setBiometric(val);
  }

  async function doLogout() {
    setIsLoggingOut(true);
    try {
      await logout();
      closeRight();
      router.replace('/login' as any);
    } catch {
      setIsLoggingOut(false);
      setConfirmLogout(false);
    }
  }

  function navigate(route: string) {
    closeRight();
    setTimeout(() => router.push(route as any), 150);
  }

  const roleColor = roleColors[user?.role ?? ''] ?? Colors.success;
  const initials = user?.nome?.split(' ').map((n: string) => n[0]).slice(0, 2).join('') ?? 'U';

  return (
    <View style={[StyleSheet.absoluteFill, { pointerEvents: rightOpen ? 'auto' : 'none', zIndex: rightOpen ? 999 : -1 } as any]}>
      <Animated.View style={[styles.overlay, { opacity }]}>
        <TouchableOpacity style={StyleSheet.absoluteFill} onPress={closeRight} activeOpacity={1} />
      </Animated.View>

      <Animated.View style={[styles.drawer, { width: drawerWidth, transform: [{ translateX }], paddingTop: topInset + 12, paddingBottom: bottomInset }]}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={closeRight} style={styles.closeBtn}>
            <Ionicons name="close" size={22} color={Colors.textSecondary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Perfil</Text>
          {isCeo && (
            <View style={styles.ceoHeaderBadge}>
              <MaterialCommunityIcons name="crown" size={11} color="#FFD700" />
              <Text style={styles.ceoHeaderBadgeText}>CEO</Text>
            </View>
          )}
        </View>

        <ScrollView showsVerticalScrollIndicator={false} style={{ flexGrow: 0, flexShrink: 1 }}>

          {/* Avatar Section — CEO premium version */}
          {isCeo ? (
            <LinearGradient
              colors={['#2D1B69', '#1A0F3D', '#0D052A']}
              style={styles.ceoAvatarSection}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <View style={styles.ceoAvatarGlow}>
                {user?.avatar ? (
                  <Image
                    source={{ uri: user.avatar }}
                    style={styles.ceoAvatar}
                  />
                ) : (
                  <View style={styles.ceoAvatar}>
                    <Text style={styles.ceoAvatarText}>{initials}</Text>
                  </View>
                )}
                <View style={styles.crownBadge}>
                  <MaterialCommunityIcons name="crown" size={12} color="#FFD700" />
                </View>
              </View>
              <Text style={styles.ceoUserName}>{user?.nome}</Text>
              <Text style={styles.ceoUserEmail}>{user?.email}</Text>
              <View style={styles.ceoRoleBadge}>
                <MaterialCommunityIcons name="shield-crown" size={12} color="#8B5CF6" />
                <Text style={styles.ceoRoleText}>CEO — Controlo Total</Text>
              </View>
              <View style={styles.ceoEscolaRow}>
                <Ionicons name="school-outline" size={13} color="rgba(255,255,255,0.5)" />
              <Text style={styles.ceoEscolaText}>{config?.nomeEscola || 'Super Escola'}</Text>
              </View>
            </LinearGradient>
          ) : (
            <View style={styles.avatarSection}>
              {user?.avatar ? (
                <Image
                  source={{ uri: user.avatar }}
                  style={[styles.avatar, { borderColor: roleColor }]}
                />
              ) : (
                <View style={[styles.avatar, { borderColor: roleColor }]}>
                  <Text style={styles.avatarText}>{initials}</Text>
                </View>
              )}
              <Text style={styles.userName}>{user?.nome}</Text>
              <Text style={styles.userEmail}>{user?.email}</Text>
              <View style={[styles.roleBadge, { backgroundColor: `${roleColor}20` }]}>
                <Text style={[styles.roleText, { color: roleColor }]}>
                  {getRoleLabel(user?.role ?? '', resolvedGenero)}
                </Text>
              </View>
            </View>
          )}

          <View style={styles.divider} />

          {/* CEO Quick Access */}
          {isCeo && (
            <>
              <Text style={styles.sectionTitle}>Acesso Rápido</Text>
              <View style={styles.shortcutGrid}>
                {CEO_SHORTCUTS.map((s) => (
                  <TouchableOpacity
                    key={s.route}
                    style={[styles.shortcutItem, { backgroundColor: s.bg }]}
                    onPress={() => navigate(s.route)}
                    activeOpacity={0.75}
                  >
                    <View style={[styles.shortcutIcon, { borderColor: `${s.color}40` }]}>
                      <MaterialCommunityIcons name={s.icon} size={20} color={s.color} />
                    </View>
                    <Text style={[styles.shortcutLabel, { color: s.color }]} numberOfLines={2}>{s.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={styles.divider} />
            </>
          )}

          {/* PCA Quick Access */}
          {isPca && (
            <>
              <Text style={styles.sectionTitle}>Acesso Rápido</Text>
              <View style={styles.quickRow}>
                <TouchableOpacity style={styles.quickRowBtn} onPress={() => navigate('/(main)/dashboard')} activeOpacity={0.8}>
                  <Ionicons name="grid" size={18} color={Colors.gold} />
                  <Text style={styles.quickRowLabel}>Dashboard</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.quickRowBtn} onPress={() => navigate('/(main)/relatorios')} activeOpacity={0.8}>
                  <Ionicons name="bar-chart" size={18} color={Colors.gold} />
                  <Text style={styles.quickRowLabel}>Relatórios</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.quickRowBtn} onPress={() => navigate('/(main)/admin')} activeOpacity={0.8}>
                  <Ionicons name="settings" size={18} color={Colors.gold} />
                  <Text style={styles.quickRowLabel}>Configurações</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.divider} />
            </>
          )}

          {/* Perfil completo button */}
          <TouchableOpacity
            style={styles.perfilCompletoBtn}
            onPress={() => navigate('/(main)/perfil')}
            activeOpacity={0.8}
          >
            <View style={styles.perfilCompletoLeft}>
              <Ionicons name="person-circle-outline" size={20} color={Colors.textSecondary} />
              <Text style={styles.perfilCompletoLabel}>Ver Perfil Completo</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
          </TouchableOpacity>

          <Text style={styles.sectionTitle}>Segurança</Text>

          <View style={styles.settingRow}>
            <View style={styles.settingIcon}>
              <Ionicons name="finger-print" size={20} color={Colors.gold} />
            </View>
            <View style={styles.settingText}>
              <Text style={styles.settingLabel}>Autenticação Biométrica</Text>
              <Text style={styles.settingDesc}>Impressão digital / Face ID</Text>
            </View>
            <Switch
              value={user?.biometricEnabled ?? false}
              onValueChange={toggleBiometric}
              trackColor={{ false: Colors.surface, true: Colors.gold }}
              thumbColor={Colors.text}
            />
          </View>

          <Text style={styles.sectionTitle}>Escola</Text>

          <View style={styles.infoRow}>
            <Ionicons name="school-outline" size={18} color={Colors.textSecondary} />
            <View style={styles.infoContent}>
              <Text style={styles.infoLabel}>Instituição</Text>
              <Text style={styles.infoValue}>{config?.nomeEscola || 'Super Escola'}</Text>
            </View>
          </View>

          <View style={styles.infoRow}>
            <Ionicons name="calendar-outline" size={18} color={Colors.textSecondary} />
            <View style={styles.infoContent}>
              <Text style={styles.infoLabel}>Ano Lectivo</Text>
              <Text style={styles.infoValue}>{anoSelecionado?.ano ?? new Date().getFullYear().toString()}</Text>
            </View>
          </View>

          <View style={styles.infoRow}>
            <Ionicons name="location-outline" size={18} color={Colors.textSecondary} />
            <View style={styles.infoContent}>
              <Text style={styles.infoLabel}>País</Text>
              <Text style={styles.infoValue}>Angola</Text>
            </View>
          </View>

          <Text style={styles.sectionTitle}>Sobre</Text>
          <View style={styles.infoRow}>
            <Ionicons name="information-circle-outline" size={18} color={Colors.textSecondary} />
            <View style={styles.infoContent}>
              <Text style={styles.infoLabel}>Versão</Text>
              <Text style={styles.infoValue}>{config.nomeEscola || 'Super Escola'} v1.03</Text>
            </View>
          </View>

          <View style={{ height: 16 }} />
        </ScrollView>

        {/* Logout area */}
        {!confirmLogout ? (
          <TouchableOpacity
            style={styles.logoutBtn}
            onPress={() => setConfirmLogout(true)}
            activeOpacity={0.8}
          >
            <Ionicons name="log-out-outline" size={18} color={Colors.danger} />
            <Text style={styles.logoutText}>Terminar Sessão</Text>
          </TouchableOpacity>
        ) : (
          <Animated.View style={[styles.confirmBox, { opacity: confirmAnim, transform: [{ scale: confirmAnim.interpolate({ inputRange: [0, 1], outputRange: [0.95, 1] }) }] }]}>
            <View style={styles.confirmIconWrap}>
              <Ionicons name="log-out" size={24} color={Colors.danger} />
            </View>
            <Text style={styles.confirmTitle}>Terminar Sessão?</Text>
            <Text style={styles.confirmSub}>A sua sessão será encerrada.</Text>
            <View style={styles.confirmBtns}>
              <TouchableOpacity
                style={styles.confirmCancelBtn}
                onPress={() => setConfirmLogout(false)}
                disabled={isLoggingOut}
              >
                <Text style={styles.confirmCancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.confirmSairBtn, isLoggingOut && { opacity: 0.6 }]}
                onPress={doLogout}
                disabled={isLoggingOut}
              >
                <Ionicons name={isLoggingOut ? 'ellipsis-horizontal' : 'log-out'} size={15} color="#fff" />
                <Text style={styles.confirmSairText}>{isLoggingOut ? 'A sair...' : 'Sair'}</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        )}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  drawer: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: Colors.primaryDark,
    borderLeftWidth: 1,
    borderLeftColor: Colors.border,
    paddingHorizontal: 0,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  closeBtn: { padding: 4 },
  headerTitle: {
    fontSize: 18,
    fontFamily: 'Inter_700Bold',
    color: Colors.text,
    flex: 1,
  },
  ceoHeaderBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,215,0,0.12)',
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: 'rgba(255,215,0,0.25)',
  },
  ceoHeaderBadgeText: {
    fontSize: 10,
    fontFamily: 'Inter_700Bold',
    color: '#FFD700',
    letterSpacing: 0.5,
  },

  /* CEO Avatar Section */
  ceoAvatarSection: {
    alignItems: 'center',
    paddingVertical: 24,
    paddingHorizontal: 16,
    marginHorizontal: 12,
    borderRadius: 16,
    marginBottom: 4,
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.3)',
  },
  ceoAvatarGlow: {
    position: 'relative',
    marginBottom: 12,
  },
  ceoAvatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(139,92,246,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#8B5CF6',
  },
  ceoAvatarText: {
    fontSize: 26,
    fontFamily: 'Inter_700Bold',
    color: '#fff',
  },
  crownBadge: {
    position: 'absolute',
    bottom: -4,
    right: -4,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(20,10,50,0.95)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#FFD700',
  },
  ceoUserName: {
    fontSize: 16,
    fontFamily: 'Inter_700Bold',
    color: '#fff',
    marginBottom: 3,
    textAlign: 'center',
  },
  ceoUserEmail: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    color: 'rgba(255,255,255,0.55)',
    marginBottom: 10,
    textAlign: 'center',
  },
  ceoRoleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(139,92,246,0.2)',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.4)',
    marginBottom: 8,
  },
  ceoRoleText: {
    fontSize: 11,
    fontFamily: 'Inter_600SemiBold',
    color: '#A78BFA',
    letterSpacing: 0.3,
  },
  ceoEscolaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  ceoEscolaText: {
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
    color: 'rgba(255,255,255,0.45)',
  },

  /* Standard Avatar Section */
  avatarSection: {
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
    borderWidth: 3,
    borderColor: Colors.gold,
  },
  avatarText: {
    fontSize: 28,
    fontFamily: 'Inter_700Bold',
    color: Colors.text,
  },
  userName: {
    fontSize: 16,
    fontFamily: 'Inter_700Bold',
    color: Colors.text,
    marginBottom: 4,
  },
  userEmail: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    color: Colors.textSecondary,
    marginBottom: 8,
  },
  roleBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 20,
  },
  roleText: {
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
  },

  divider: {
    height: 1,
    backgroundColor: Colors.border,
    marginHorizontal: 16,
    marginVertical: 8,
  },

  /* CEO Quick Access Grid */
  shortcutGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 12,
    gap: 8,
    marginBottom: 4,
  },
  shortcutItem: {
    width: '30%',
    flexGrow: 1,
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    gap: 6,
  },
  shortcutIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  shortcutLabel: {
    fontSize: 10,
    fontFamily: 'Inter_600SemiBold',
    textAlign: 'center',
    lineHeight: 13,
  },

  /* PCA Quick Row */
  quickRow: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    gap: 8,
    marginBottom: 4,
  },
  quickRowBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: 'rgba(240,165,0,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(240,165,0,0.2)',
    gap: 4,
  },
  quickRowLabel: {
    fontSize: 10,
    fontFamily: 'Inter_600SemiBold',
    color: Colors.gold,
    textAlign: 'center',
  },

  /* Perfil Completo Button */
  perfilCompletoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 12,
    marginBottom: 4,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 12,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  perfilCompletoLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  perfilCompletoLabel: {
    fontSize: 13,
    fontFamily: 'Inter_500Medium',
    color: Colors.textSecondary,
  },

  sectionTitle: {
    fontSize: 10,
    fontFamily: 'Inter_600SemiBold',
    color: Colors.textMuted,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 6,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 12,
  },
  settingIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(240,165,0,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingText: { flex: 1 },
  settingLabel: {
    fontSize: 13,
    fontFamily: 'Inter_500Medium',
    color: Colors.text,
  },
  settingDesc: {
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
    color: Colors.textMuted,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 12,
  },
  infoContent: { flex: 1 },
  infoLabel: {
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
    color: Colors.textMuted,
    marginBottom: 2,
  },
  infoValue: {
    fontSize: 13,
    fontFamily: 'Inter_500Medium',
    color: Colors.text,
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 8,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: 'rgba(231,76,60,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(231,76,60,0.3)',
  },
  logoutText: {
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
    color: Colors.danger,
  },
  confirmBox: {
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 16,
    backgroundColor: Colors.backgroundCard,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(231,76,60,0.35)',
    alignItems: 'center',
    gap: 6,
  },
  confirmIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(231,76,60,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  confirmTitle: {
    fontSize: 15,
    fontFamily: 'Inter_700Bold',
    color: Colors.text,
  },
  confirmSub: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    color: Colors.textMuted,
    marginBottom: 8,
    textAlign: 'center',
  },
  confirmBtns: {
    flexDirection: 'row',
    gap: 8,
    width: '100%',
  },
  confirmCancelBtn: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 10,
    backgroundColor: Colors.surface,
    alignItems: 'center',
  },
  confirmCancelText: {
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
    color: Colors.textSecondary,
  },
  confirmSairBtn: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 10,
    backgroundColor: Colors.danger,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 5,
  },
  confirmSairText: {
    fontSize: 13,
    fontFamily: 'Inter_700Bold',
    color: '#fff',
  },
});
