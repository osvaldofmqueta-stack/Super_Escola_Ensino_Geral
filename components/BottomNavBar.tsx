import React, { useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Animated, Platform,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, usePathname } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Colors } from '@/constants/colors';
import { useAuth } from '@/context/AuthContext';
import { useDrawer } from '@/context/DrawerContext';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { useNotificacoes } from '@/context/NotificacoesContext';

export const BOTTOM_NAV_HEIGHT = 60;

interface TabItem {
  key: string;
  label: string;
  icon: string;
  iconLib?: 'ion' | 'mci';
  route?: string;
  action?: 'menu';
  badge?: number;
}

function getTabsForRole(role: string, unreadCount: number): TabItem[] {
  switch (role) {
    case 'ceo':
    case 'pca':
      return [
        { key: 'dashboard', label: 'Início',    icon: 'home',             route: '/(main)/dashboard' },
        { key: 'visao',     label: 'Visão',     icon: 'eye',              route: '/(main)/visao-geral' },
        { key: 'financeiro',label: 'Financeiro',icon: 'cash-multiple',    iconLib: 'mci', route: '/(main)/financeiro' },
        { key: 'sistema',   label: 'Sistema',   icon: 'settings',         route: '/(main)/admin' },
      ];
    case 'admin':
      return [
        { key: 'dashboard', label: 'Início',    icon: 'home',             route: '/(main)/dashboard' },
        { key: 'alunos',    label: 'Alunos',    icon: 'people',           route: '/(main)/alunos' },
        { key: 'financeiro',label: 'Financeiro',icon: 'cash-multiple',    iconLib: 'mci', route: '/(main)/financeiro' },
        { key: 'sistema',   label: 'Sistema',   icon: 'settings',         route: '/(main)/admin' },
      ];
    case 'director':
      return [
        { key: 'dashboard', label: 'Início',    icon: 'home',             route: '/(main)/dashboard' },
        { key: 'alunos',    label: 'Alunos',    icon: 'people',           route: '/(main)/alunos' },
        { key: 'pedagogico',label: 'Pedagógico',icon: 'book-open-variant',iconLib: 'mci', route: '/(main)/pedagogico' },
        { key: 'relatorios',label: 'Relatórios',icon: 'bar-chart',        route: '/(main)/relatorios' },
      ];
    case 'professor':
    case 'diretor_turma':
      return [
        { key: 'dashboard',  label: 'Início',    icon: 'home',             route: '/(main)/dashboard?section=painel' },
        { key: 'horario',    label: 'Horário',   icon: 'time',             route: '/(main)/horario' },
        { key: 'notas',      label: 'Notas',     icon: 'document-text',    route: '/(main)/notas' },
        { key: 'pautas',     label: 'Pautas',    icon: 'clipboard-list',   iconLib: 'mci', route: '/(main)/professor-pauta' },
      ];
    case 'aluno':
      return [
        { key: 'dashboard', label: 'Início',    icon: 'home',             route: '/(main)/dashboard' },
        { key: 'portal',    label: 'Portal',    icon: 'grid',             route: '/(main)/portal-estudante' },
        { key: 'horario',   label: 'Horário',   icon: 'time',             route: '/(main)/horario' },
        { key: 'historico', label: 'Histórico', icon: 'chart-timeline-variant', iconLib: 'mci', route: '/(main)/historico' },
      ];
    case 'encarregado':
      return [
        { key: 'dashboard', label: 'Início',    icon: 'home',             route: '/(main)/dashboard' },
        { key: 'portal',    label: 'Portal',    icon: 'account-child',    iconLib: 'mci', route: '/(main)/portal-encarregado' },
        { key: 'financeiro',label: 'Financeiro',icon: 'cash-multiple',    iconLib: 'mci', route: '/(main)/portal-encarregado?tab=financeiro' },
      ];
    case 'financeiro':
      return [
        { key: 'dashboard', label: 'Início',    icon: 'home',             route: '/(main)/dashboard' },
        { key: 'tesouraria',label: 'Tesouraria',icon: 'finance',          iconLib: 'mci', route: '/(main)/tesouraria' },
        { key: 'financeiro',label: 'Financeiro',icon: 'cash-multiple',    iconLib: 'mci', route: '/(main)/financeiro' },
        { key: 'relatorios',label: 'Relatórios',icon: 'bar-chart',        route: '/(main)/relatorios' },
      ];
    case 'secretaria':
    case 'chefe_secretaria':
      return [
        { key: 'dashboard', label: 'Início',    icon: 'home',             route: '/(main)/dashboard' },
        { key: 'alunos',    label: 'Alunos',    icon: 'people',           route: '/(main)/alunos' },
        { key: 'secretaria',label: 'Secretaria',icon: 'grid',             route: '/(main)/secretaria-hub' },
        { key: 'docs',      label: 'Documentos',icon: 'document-text',    route: '/(main)/editor-documentos' },
      ];
    case 'rh':
      return [
        { key: 'dashboard', label: 'Início',    icon: 'home',             route: '/(main)/dashboard' },
        { key: 'rh',        label: 'Pessoal',   icon: 'account-group',    iconLib: 'mci', route: '/(main)/rh-controle' },
        { key: 'payroll',   label: 'Folha',     icon: 'cash-multiple',    iconLib: 'mci', route: '/(main)/rh-payroll' },
        { key: 'faltas',    label: 'Faltas',    icon: 'calendar-remove',  iconLib: 'mci', route: '/(main)/rh-faltas-tempos' },
      ];
    case 'pedagogico':
    case 'coordenador_curso':
      return [
        { key: 'dashboard', label: 'Início',    icon: 'home',             route: '/(main)/dashboard' },
        { key: 'pedagogico',label: 'Pedagógico',icon: 'book-open-variant',iconLib: 'mci', route: '/(main)/pedagogico' },
        { key: 'pautas',    label: 'Pautas',    icon: 'document-text',    route: '/(main)/notas' },
        { key: 'relatorios',label: 'Relatórios',icon: 'bar-chart',        route: '/(main)/relatorios' },
      ];
    default:
      return [
        { key: 'dashboard', label: 'Início',    icon: 'home',             route: '/(main)/dashboard' },
      ];
  }
}

function TabIcon({ item, active }: { item: TabItem; active: boolean }) {
  const color = active ? Colors.accent : Colors.textMuted;
  const size = 22;
  if (item.iconLib === 'mci') {
    return <MaterialCommunityIcons name={item.icon as any} size={size} color={color} />;
  }
  return <Ionicons name={item.icon as any} size={size} color={color} />;
}

export default function BottomNavBar() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useAuth();
  const { openLeft } = useDrawer();
  const { isDesktop } = useBreakpoint();
  const { unreadCount } = useNotificacoes();

  const scaleAnims = useRef<Record<string, Animated.Value>>({}).current;

  if (isDesktop || !user) return null;

  const tabs = getTabsForRole(user.role, unreadCount);

  tabs.forEach(tab => {
    if (!scaleAnims[tab.key]) {
      scaleAnims[tab.key] = new Animated.Value(1);
    }
  });

  const isActive = (tab: TabItem) => {
    if (!tab.route) return false;
    const routeName = tab.route.replace('/(main)/', '').split('?')[0];
    return pathname?.includes(routeName) ?? false;
  };

  const handlePress = (tab: TabItem) => {
    const nd = Platform.OS !== 'web';
    Animated.sequence([
      Animated.timing(scaleAnims[tab.key], { toValue: 0.82, duration: 80, useNativeDriver: nd }),
      Animated.spring(scaleAnims[tab.key], { toValue: 1, useNativeDriver: nd, speed: 24, bounciness: 8 }),
    ]).start();

    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }

    if (tab.action === 'menu') {
      openLeft();
    } else if (tab.route) {
      router.push(tab.route as any);
    }
  };

  const totalHeight = BOTTOM_NAV_HEIGHT + insets.bottom;

  return (
    <View style={[styles.container, { height: totalHeight, paddingBottom: insets.bottom }]}>
      <View style={styles.border} />
      {tabs.map(tab => {
        const active = isActive(tab);
        return (
          <TouchableOpacity
            key={tab.key}
            style={styles.tab}
            onPress={() => handlePress(tab)}
            activeOpacity={0.7}
          >
            <Animated.View style={[styles.iconWrap, { transform: [{ scale: scaleAnims[tab.key] }] }]}>
              {active && <View style={styles.activePill} />}
              <View style={styles.iconContainer}>
                <TabIcon item={tab} active={active} />
                {!!tab.badge && tab.badge > 0 && (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{tab.badge > 99 ? '99+' : tab.badge}</Text>
                  </View>
                )}
              </View>
            </Animated.View>
            <Text style={[styles.label, active && styles.labelActive]} numberOfLines={1}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: Colors.primaryDark,
    alignItems: 'flex-start',
    paddingTop: 6,
  } as any,
  border: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: Colors.borderLight,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 3,
    paddingTop: 2,
  },
  iconWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 44,
    height: 32,
  },
  activePill: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 16,
    backgroundColor: Colors.accent + '20',
  },
  iconContainer: {
    position: 'relative',
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -6,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: Colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  badgeText: {
    color: '#fff',
    fontSize: 9,
    fontFamily: 'Inter_700Bold',
  },
  label: {
    fontSize: 10,
    fontFamily: 'Inter_500Medium',
    color: Colors.textMuted,
    textAlign: 'center',
  },
  labelActive: {
    color: Colors.accent,
    fontFamily: 'Inter_600SemiBold',
  },
});
