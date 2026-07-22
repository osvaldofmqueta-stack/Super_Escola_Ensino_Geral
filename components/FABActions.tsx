import React, { useState, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Animated, Platform,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Colors } from '@/constants/colors';
import { useAuth } from '@/context/AuthContext';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { BOTTOM_NAV_HEIGHT } from '@/components/BottomNavBar';

interface FABItem {
  label: string;
  icon: string;
  iconLib?: 'ion' | 'mci';
  route: string;
  color: string;
}

function getActionsForRole(role: string): FABItem[] {
  switch (role) {
    case 'ceo':
    case 'pca':
    case 'admin':
      return [
        { label: 'Nova Matrícula',   icon: 'account-school',  iconLib: 'mci', route: '/(main)/admissao',       color: Colors.success },
        { label: 'Novo Pagamento',   icon: 'cash-plus',       iconLib: 'mci', route: '/(main)/pagamentos-hub', color: Colors.accent },
        { label: 'Novo Aluno',       icon: 'person-add',                       route: '/(main)/alunos',         color: Colors.gold },
      ];
    case 'director':
      return [
        { label: 'Nova Matrícula',   icon: 'account-school',  iconLib: 'mci', route: '/(main)/admissao',       color: Colors.success },
        { label: 'Ver Alunos',       icon: 'people',                           route: '/(main)/alunos',         color: Colors.accent },
        { label: 'Ver Turmas',       icon: 'grid',                             route: '/(main)/turmas',         color: Colors.gold },
      ];
    case 'professor':
    case 'diretor_turma':
      return [
        { label: 'Lançar Notas',     icon: 'document-text',                   route: '/(main)/notas',              color: Colors.accent },
        { label: 'Registar Sumário', icon: 'clipboard-check', iconLib: 'mci', route: '/(main)/professor-sumario',  color: Colors.success },
        { label: 'Ver Turmas',       icon: 'class',           iconLib: 'mci', route: '/(main)/professor-turmas',   color: Colors.gold },
      ];
    case 'secretaria':
    case 'chefe_secretaria':
      return [
        { label: 'Nova Matrícula',   icon: 'account-school',  iconLib: 'mci', route: '/(main)/admissao',          color: Colors.success },
        { label: 'Emitir Documento', icon: 'newspaper',                        route: '/(main)/editor-documentos', color: Colors.accent },
        { label: 'Consultar Aluno',  icon: 'people',                           route: '/(main)/alunos',            color: Colors.gold },
      ];
    case 'financeiro':
      return [
        { label: 'Registar Pag.',    icon: 'cash-multiple',   iconLib: 'mci', route: '/(main)/pagamentos-hub',    color: Colors.success },
        { label: 'Emitir Recibo',    icon: 'receipt',          iconLib: 'mci', route: '/(main)/pagamentos-hub',    color: Colors.accent },
        { label: 'Ver Devedores',    icon: 'alert-circle-outline', iconLib: 'mci', route: '/(main)/financeiro',   color: Colors.warning },
      ];
    case 'rh':
      return [
        { label: 'Registar Falta',   icon: 'calendar-remove', iconLib: 'mci', route: '/(main)/rh-faltas-tempos',  color: Colors.warning },
        { label: 'Processar Folha',  icon: 'cash-multiple',   iconLib: 'mci', route: '/(main)/rh-payroll',        color: Colors.success },
      ];
    case 'aluno':
      return [
        { label: 'Solicitar Doc.',   icon: 'document-text',                   route: '/(main)/portal-estudante',   color: Colors.accent },
        { label: 'Ver Horário',      icon: 'time',                            route: '/(main)/horario',            color: Colors.success },
      ];
    case 'encarregado':
      return [
        { label: 'Ver Notas',        icon: 'document-text',                   route: '/(main)/portal-encarregado', color: Colors.accent },
        { label: 'Ver Propinas',     icon: 'cash-multiple',   iconLib: 'mci', route: '/(main)/portal-encarregado', color: Colors.warning },
      ];
    default:
      return [];
  }
}

function ActionIcon({ icon, iconLib, color }: { icon: string; iconLib?: string; color: string }) {
  if (iconLib === 'mci') {
    return <MaterialCommunityIcons name={icon as any} size={20} color={color} />;
  }
  return <Ionicons name={icon as any} size={20} color={color} />;
}

export default function FABActions() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const { isDesktop } = useBreakpoint();
  const [open, setOpen] = useState(false);

  const rotateAnim = useRef(new Animated.Value(0)).current;
  const backdropAnim = useRef(new Animated.Value(0)).current;
  const itemAnims = useRef<Animated.Value[]>([]).current;

  if (isDesktop || !user) return null;

  const actions = getActionsForRole(user.role);
  if (actions.length === 0) return null;

  while (itemAnims.length < actions.length) {
    itemAnims.push(new Animated.Value(0));
  }

  const nd = Platform.OS !== 'web';
  const bottomOffset = BOTTOM_NAV_HEIGHT + insets.bottom + 16;

  const toggleOpen = () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    }

    if (!open) {
      setOpen(true);
      Animated.parallel([
        Animated.spring(rotateAnim, { toValue: 1, useNativeDriver: nd, speed: 20, bounciness: 6 }),
        Animated.timing(backdropAnim, { toValue: 1, duration: 200, useNativeDriver: nd }),
        ...itemAnims.map((anim, i) =>
          Animated.spring(anim, {
            toValue: 1,
            useNativeDriver: nd,
            speed: 20,
            bounciness: 10,
            delay: i * 40,
          } as any)
        ),
      ]).start();
    } else {
      Animated.parallel([
        Animated.spring(rotateAnim, { toValue: 0, useNativeDriver: nd, speed: 20, bounciness: 6 }),
        Animated.timing(backdropAnim, { toValue: 0, duration: 150, useNativeDriver: nd }),
        ...itemAnims.map((anim) =>
          Animated.timing(anim, { toValue: 0, duration: 120, useNativeDriver: nd })
        ),
      ]).start(() => setOpen(false));
    }
  };

  const handleAction = (item: FABItem) => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
    toggleOpen();
    setTimeout(() => router.push(item.route as any), 200);
  };

  const rotate = rotateAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '45deg'] });

  return (
    <>
      {/* Backdrop visual — pointerEvents none para não interceptar cliques */}
      {open && (
        <Animated.View
          style={[StyleSheet.absoluteFill, styles.backdrop, { opacity: backdropAnim }]}
          pointerEvents="none"
        />
      )}

      {/* Camada de fecho ao clicar fora — zIndex abaixo dos botões de acção */}
      {open && (
        <TouchableOpacity
          style={[StyleSheet.absoluteFill, { zIndex: 89 }]}
          onPress={toggleOpen}
          activeOpacity={1}
        />
      )}

      <View style={[styles.fabContainer, { bottom: bottomOffset }]} pointerEvents="box-none">
        {actions.map((item, i) => {
          const anim = itemAnims[i];
          const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] });
          return (
            <Animated.View
              key={item.label}
              style={[
                styles.actionRow,
                {
                  opacity: anim,
                  transform: [{ translateY }],
                  zIndex: 101,
                },
              ]}
              pointerEvents={open ? 'auto' : 'none'}
            >
              <TouchableOpacity
                onPress={() => handleAction(item)}
                activeOpacity={0.85}
                style={styles.actionRowTouchable}
              >
                <Text style={styles.actionLabel}>{item.label}</Text>
                <View style={[styles.actionBtn, { backgroundColor: Colors.backgroundElevated }]}>
                  <ActionIcon icon={item.icon} iconLib={item.iconLib} color={item.color} />
                </View>
              </TouchableOpacity>
            </Animated.View>
          );
        })}

        <TouchableOpacity style={[styles.fab, { zIndex: 101 }]} onPress={toggleOpen} activeOpacity={0.85}>
          <Animated.View style={{ transform: [{ rotate }] }}>
            <Ionicons name="add" size={28} color="#fff" />
          </Animated.View>
        </TouchableOpacity>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    backgroundColor: 'rgba(0,0,0,0.45)',
    zIndex: 90,
  },
  fabContainer: {
    position: 'absolute',
    right: 16,
    alignItems: 'flex-end',
    zIndex: 100,
    gap: 10,
  } as any,
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionRowTouchable: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  actionLabel: {
    color: Colors.text,
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
    backgroundColor: Colors.backgroundElevated,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    overflow: 'hidden',
  } as any,
  actionBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  fab: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  } as any,
});
