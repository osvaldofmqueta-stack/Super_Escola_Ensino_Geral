/**
 * GuidedTour — versão genérica do tour guiado com spotlight real nos itens do menu lateral.
 * Baseado no ProfessorTour original; aceita `steps` e `storageKey` para servir qualquer perfil
 * (Aluno, Director, PC, CEO, Pedagógico, Secretaria, RH, Financeiro, Encarregado, Conselhos, etc.).
 * Desktop: card tooltip aparece à direita do sidebar com seta apontando o item.
 * Mobile: card centrado no ecrã.
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Modal, View, Text, TouchableOpacity, Animated,
  StyleSheet, Dimensions, Platform, useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { Colors } from '@/constants/colors';
import { useTourCtx } from '@/contexts/TourContext';
import { useBreakpoint } from '@/hooks/useBreakpoint';

const SIDEBAR_W = 260;          // largura do DrawerLeft no desktop
const CARD_MARGIN = 20;         // margem mínima entre o cartão e as bordas do ecrã
const ARROW_HALF_H = 13;        // metade da altura da seta (borderTopWidth/borderBottomWidth)

// ─── Passos do tour ────────────────────────────────────────────────────────────
export interface TourStep {
  section: string;
  label: string;
  route: string;
  icon: React.ReactNode;
  color: string;
  description: string;
}

// ─── Barra de progresso ────────────────────────────────────────────────────────
function ProgressBar({ total, current, color }: { total: number; current: number; color: string }) {
  const pct = ((current + 1) / total) * 100;
  return (
    <View style={pb.track}>
      <Animated.View style={[pb.fill, { width: `${pct}%` as any, backgroundColor: color }]} />
    </View>
  );
}
const pb = StyleSheet.create({
  track: { height: 3, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden', marginHorizontal: 20, marginBottom: 14 },
  fill:  { height: 3, borderRadius: 2 },
});

// ─── Props ─────────────────────────────────────────────────────────────────────
interface GuidedTourProps {
  visible: boolean;
  onClose: () => void;
  onNavigate?: (route: string) => void;
  steps: TourStep[];
  storageKey: string;
}

// ─── Componente principal ──────────────────────────────────────────────────────
export default function GuidedTour({ visible, onClose, onNavigate, steps, storageKey }: GuidedTourProps) {
  const router = useRouter();
  const { isDesktop } = useBreakpoint();
  const { setTourRoute, tourItemRect } = useTourCtx();
  const { height: winHeight } = useWindowDimensions();

  const [step, setStep] = useState(0);
  const [cardHeight, setCardHeight] = useState(320);
  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(40)).current;
  const stepFade  = useRef(new Animated.Value(1)).current;
  const glowAnim  = useRef(new Animated.Value(0)).current;
  const glowLoop  = useRef<any>(null);

  const current = steps[step];
  const isFirst = step === 0;
  const isLast  = step === steps.length - 1;

  // ── Posicionamento dinâmico do cartão/seta no desktop ──────────────────────
  // Aponta o cartão exactamente para o item do menu lateral destacado
  // (tourItemRect vem do DrawerLeft, que mede a posição real do item em ecrã).
  const itemCenterY = tourItemRect ? tourItemRect.top + tourItemRect.height / 2 : winHeight / 2;
  const maxCardTop = Math.max(CARD_MARGIN, winHeight - cardHeight - CARD_MARGIN);
  const cardWrapperTop = Math.min(Math.max(itemCenterY - cardHeight / 2, CARD_MARGIN), maxCardTop);
  const arrowTop = Math.min(
    Math.max(itemCenterY - cardWrapperTop - ARROW_HALF_H, 16),
    Math.max(16, cardHeight - 16 - ARROW_HALF_H * 2)
  );

  // ── Publicar rota activa no contexto (DrawerLeft lê isto) ──────────────────
  useEffect(() => {
    if (visible && current) {
      setTourRoute(current.route);
    } else {
      setTourRoute(null);
    }
  }, [visible, step, setTourRoute, current]);

  // ── Entrada / saída ────────────────────────────────────────────────────────
  useEffect(() => {
    if (visible) {
      setStep(0);
      slideAnim.setValue(isDesktop ? -30 : 40);
      Animated.parallel([
        Animated.timing(fadeAnim,  { toValue: 1, duration: 260, useNativeDriver: true }),
        Animated.spring(slideAnim, { toValue: 0, damping: 22, stiffness: 220, useNativeDriver: true }),
      ]).start();

      glowLoop.current = Animated.loop(
        Animated.sequence([
          Animated.timing(glowAnim, { toValue: 1, duration: 1600, useNativeDriver: true }),
          Animated.timing(glowAnim, { toValue: 0, duration: 1600, useNativeDriver: true }),
        ])
      );
      glowLoop.current.start();
    } else {
      glowLoop.current?.stop();
      Animated.timing(fadeAnim, { toValue: 0, duration: 180, useNativeDriver: true }).start();
    }
    return () => glowLoop.current?.stop();
  }, [visible, isDesktop]);

  // ── Transição de passo ─────────────────────────────────────────────────────
  const goToStep = useCallback((next: number) => {
    const dir = next > step ? 1 : -1;
    Animated.timing(stepFade, { toValue: 0, duration: 120, useNativeDriver: true }).start(() => {
      slideAnim.setValue(dir * (isDesktop ? 20 : 30));
      setStep(next);
      Animated.parallel([
        Animated.spring(stepFade, { toValue: 1, damping: 20, stiffness: 260, useNativeDriver: true }),
        Animated.spring(slideAnim, { toValue: 0, damping: 20, stiffness: 260, useNativeDriver: true }),
      ]).start();
    });
  }, [step, stepFade, slideAnim, isDesktop]);

  const handleNext  = () => { if (isLast) { handleClose(); return; } goToStep(step + 1); };
  const handleBack  = () => { if (!isFirst) goToStep(step - 1); };

  const handleClose = useCallback(async () => {
    await AsyncStorage.setItem(storageKey, 'true').catch(() => {});
    onClose();
  }, [onClose, storageKey]);

  const handleGoNow = useCallback(() => {
    if (!current) { handleClose(); return; }
    if (current.route === '__ai_assistant__') {
      handleClose();
      return;
    }
    handleClose();
    setTimeout(() => {
      const [pathname, search] = current.route.split('?');
      if (search) {
        const params: Record<string, string> = {};
        search.split('&').forEach(pair => {
          const [k, v] = pair.split('=');
          if (k) params[decodeURIComponent(k)] = decodeURIComponent(v ?? '');
        });
        router.push({ pathname: pathname as any, params });
      } else {
        router.push(pathname as any);
      }
    }, 300);
    onNavigate?.(current.route);
  }, [current, handleClose, router, onNavigate]);

  const glowOpacity = glowAnim.interpolate({ inputRange: [0, 1], outputRange: [0.3, 0.7] });
  const glowScale   = glowAnim.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1.1] });

  if (!visible || !current || steps.length === 0) return null;

  // ── Card content (partilhado entre desktop e mobile) ──────────────────────
  const cardContent = (
    <Animated.View
      onLayout={isDesktop ? (e) => setCardHeight(e.nativeEvent.layout.height) : undefined}
      style={[
        styles.card,
        isDesktop && styles.cardDesktop,
        { opacity: fadeAnim, transform: [{ translateX: isDesktop ? slideAnim : undefined as any, translateY: !isDesktop ? slideAnim : undefined as any }] },
      ]}
    >
      {/* Barra de cor no topo */}
      <View style={[styles.cardTopBar, { backgroundColor: current.color }]} />

      {/* ── Cabeçalho: ícone + secção + título ── */}
      <Animated.View style={[styles.cardHeader, { opacity: stepFade }]}>
        {/* Ícone com glow */}
        <View style={styles.iconWrap}>
          <Animated.View style={[
            styles.glowRing,
            { borderColor: current.color + '50', opacity: glowOpacity, transform: [{ scale: glowScale }] },
          ]} />
          <View style={[styles.iconCircle, { backgroundColor: current.color + '25', borderColor: current.color + '55' }]}>
            {current.icon}
          </View>
        </View>

        <View style={styles.headerText}>
          <Text style={styles.sectionBadge}>{current.section}</Text>
          <Text style={[styles.stepTitle, { color: current.color }]} numberOfLines={1}>{current.label}</Text>
        </View>

        {/* Contador passo */}
        <View style={[styles.stepBadge, { backgroundColor: current.color + '18', borderColor: current.color + '40' }]}>
          <Text style={[styles.stepBadgeText, { color: current.color }]}>{step + 1}/{steps.length}</Text>
        </View>
      </Animated.View>

      {/* ── Separador ── */}
      <View style={[styles.divider, { backgroundColor: current.color + '30' }]} />

      {/* ── Descrição ── */}
      <Animated.View style={{ opacity: stepFade }}>
        <Text style={styles.stepDesc}>{current.description}</Text>
      </Animated.View>

      {/* ── Botão "Ir para X" ── */}
      <Animated.View style={[styles.goBtnWrap, { opacity: stepFade }]}>
        <TouchableOpacity
          style={[styles.goBtn, { backgroundColor: current.color, borderColor: current.color }]}
          onPress={handleGoNow}
          activeOpacity={0.82}
        >
          <Ionicons name="arrow-forward-circle-outline" size={16} color="#fff" />
          <Text style={styles.goBtnText}>
            {current.route === '__ai_assistant__' ? 'Fechar e usar o Assistente' : `Ir para ${current.label}`}
          </Text>
        </TouchableOpacity>
      </Animated.View>

      {/* ── Barra de progresso ── */}
      <ProgressBar total={steps.length} current={step} color={current.color} />

      {/* ── Navegação ── */}
      <View style={styles.navRow}>
        <TouchableOpacity
          style={[styles.navBtn, styles.navBtnBack, isFirst && styles.navBtnDisabled]}
          onPress={handleBack}
          disabled={isFirst}
          activeOpacity={0.75}
        >
          <Ionicons name="chevron-back" size={16} color={isFirst ? Colors.textMuted : Colors.textSecondary} />
          <Text style={[styles.navBtnBackText, isFirst && { color: Colors.textMuted }]}>Anterior</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.skipBtn} onPress={handleClose} activeOpacity={0.7}>
          <Text style={styles.skipText}>Fechar</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.navBtn, styles.navBtnNext, { backgroundColor: current.color + '20', borderColor: current.color + '55' }]}
          onPress={handleNext}
          activeOpacity={0.75}
        >
          <Text style={[styles.navBtnNextText, { color: current.color }]}>
            {isLast ? 'Concluir' : 'Próximo'}
          </Text>
          <Ionicons name={isLast ? 'checkmark-circle' : 'chevron-forward'} size={16} color={current.color} />
        </TouchableOpacity>
      </View>
    </Animated.View>
  );

  return (
    <Modal transparent animationType="none" visible={visible} onRequestClose={handleClose} statusBarTranslucent>
      <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, { opacity: fadeAnim }]}>

        {isDesktop ? (
          /* ── DESKTOP: tooltip apontando exactamente para o item destacado no sidebar ── */
          <View style={styles.desktopContainer} pointerEvents="box-none">
            {/* Área escura sobre o sidebar (clicável para fechar) */}
            <TouchableOpacity
              style={styles.sidebarOverlay}
              onPress={handleClose}
              activeOpacity={1}
            />
            {/* Posicionador: alinhado verticalmente com o item de menu em destaque */}
            <View style={[styles.cardPositioner, { top: cardWrapperTop }]} pointerEvents="box-none">
              <View style={styles.cardWithArrow}>
                {/* Seta apontando para o item exacto do sidebar */}
                <View style={[styles.arrow, { top: arrowTop, borderRightColor: Colors.backgroundElevated }]} />
                {/* Card */}
                {cardContent}
              </View>
            </View>
          </View>
        ) : (
          /* ── MOBILE: card centrado ── */
          <View style={styles.mobileContainer} pointerEvents="box-none">
            {cardContent}
          </View>
        )}

      </Animated.View>
    </Modal>
  );
}

// ─── Hook auxiliar ─────────────────────────────────────────────────────────────
export function useGuidedTour(storageKey: string) {
  const [tourVisible, setTourVisible] = useState(false);

  const checkAndShow = useCallback(async () => {
    try {
      const done = await AsyncStorage.getItem(storageKey);
      if (!done) setTourVisible(true);
    } catch { /* ignore */ }
  }, [storageKey]);

  const openTour  = useCallback(() => setTourVisible(true), []);
  const closeTour = useCallback(() => setTourVisible(false), []);

  return { tourVisible, checkAndShow, openTour, closeTour };
}

// ─── Estilos ───────────────────────────────────────────────────────────────────
const { width: SW, height: SH } = Dimensions.get('window');

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(6, 12, 22, 0.78)',
  },

  // ── Desktop layout ──────────────────────────────────────────────────────────
  desktopContainer: {
    flex: 1,
    flexDirection: 'row',
  },
  sidebarOverlay: {
    width: SIDEBAR_W,
    height: '100%',
  },
  // Posicionador absoluto: o `top` é calculado dinamicamente (cardWrapperTop)
  // para alinhar o cartão com o item de menu destacado.
  cardPositioner: {
    position: 'absolute',
    left: SIDEBAR_W,
    right: 24,
  },
  cardWithArrow: {
    position: 'relative',
    paddingLeft: 14,
  },

  // Seta triangular apontando para o item exacto do sidebar (posição `top` dinâmica)
  arrow: {
    position: 'absolute',
    left: 0,
    width: 0,
    height: 0,
    borderTopWidth: 13,
    borderBottomWidth: 13,
    borderRightWidth: 14,
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
    // borderRightColor é definido inline para usar a cor do card
  },

  // ── Mobile layout ───────────────────────────────────────────────────────────
  mobileContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },

  // ── Card ────────────────────────────────────────────────────────────────────
  card: {
    backgroundColor: Colors.backgroundElevated,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    overflow: 'hidden',
    width: Math.min(SW - 40, 380),
    ...(Platform.OS === 'web'
      ? { boxShadow: '0 24px 80px rgba(0,0,0,0.65), 0 0 0 1px rgba(255,255,255,0.05)' }
      : {
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 16 },
          shadowOpacity: 0.55,
          shadowRadius: 32,
          elevation: 24,
        }),
  },
  cardDesktop: {
    // No desktop o card pode ser ligeiramente mais largo
    width: Math.min(SW - SIDEBAR_W - 80, 420),
    borderRadius: 18,
  },
  cardTopBar: {
    height: 4,
    width: '100%',
  },

  // ── Cabeçalho ───────────────────────────────────────────────────────────────
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
  },
  iconWrap: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  glowRing: {
    position: 'absolute',
    width: 66,
    height: 66,
    borderRadius: 33,
    borderWidth: 1.5,
  },
  iconCircle: {
    width: 52,
    height: 52,
    borderRadius: 14,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: {
    flex: 1,
    gap: 2,
  },
  sectionBadge: {
    fontSize: 9,
    fontFamily: 'Inter_700Bold',
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1.3,
  },
  stepTitle: {
    fontSize: 18,
    fontFamily: 'Inter_700Bold',
  },
  stepBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
    flexShrink: 0,
  },
  stepBadgeText: {
    fontSize: 11,
    fontFamily: 'Inter_700Bold',
  },

  divider: {
    height: 1,
    marginHorizontal: 0,
  },

  // ── Descrição ────────────────────────────────────────────────────────────────
  stepDesc: {
    fontSize: 13.5,
    fontFamily: 'Inter_400Regular',
    color: Colors.textSecondary,
    lineHeight: 20,
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 2,
  },

  // ── Botão Ir ─────────────────────────────────────────────────────────────────
  goBtnWrap: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
  },
  goBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingVertical: 11,
    borderRadius: 12,
    borderWidth: 0,
  },
  goBtnText: {
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
    color: '#fff',
  },

  // ── Navegação ────────────────────────────────────────────────────────────────
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 8,
  },
  navBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 12,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
  },
  navBtnBack: {
    borderColor: Colors.border,
    backgroundColor: Colors.backgroundCard,
  },
  navBtnNext: {
    // borderColor e backgroundColor definidos inline
  },
  navBtnDisabled: {
    opacity: 0.38,
  },
  navBtnBackText: {
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
    color: Colors.textSecondary,
  },
  navBtnNextText: {
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
  },
  skipBtn: {
    paddingHorizontal: 8,
    paddingVertical: 9,
    alignItems: 'center',
    flexShrink: 0,
  },
  skipText: {
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
    color: Colors.textMuted,
    textDecorationLine: 'underline',
  },
});
