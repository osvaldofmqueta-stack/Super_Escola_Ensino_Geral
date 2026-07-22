import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Pressable,
  Animated, Dimensions, Platform, ScrollView,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Colors } from '@/constants/colors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useConfig } from '@/context/ConfigContext';

const { width: W, height: H } = Dimensions.get('window');
const IS_WEB = Platform.OS === 'web';
const IS_WIDE = W > 700;

interface ErrorConfig {
  iconName: string;
  iconLib: 'ion' | 'mci';
  accentColor: string;
  title: string;
  subtitle: string;
  description: string;
  badge: string;
  steps: string[];
  tip?: string;
  autoRetry?: boolean;
}

const CONFIGS: Record<number | 'default', ErrorConfig> = {
  401: {
    iconName: 'shield-lock-outline',
    iconLib: 'mci',
    accentColor: Colors.gold,
    title: 'Sessão Expirada',
    subtitle: 'Autenticação necessária',
    description: 'A sua sessão terminou ou as suas credenciais são inválidas. Por segurança, o sistema encerrou o acesso automaticamente.',
    badge: '401 · Não Autenticado',
    steps: ['Sessão encerrada pelo servidor', 'Token de acesso inválido ou expirado', 'Nova autenticação obrigatória'],
    tip: 'As sessões expiram ao fim de 8 horas de inatividade por razões de segurança.',
  },
  403: {
    iconName: 'shield-off-outline',
    iconLib: 'mci',
    accentColor: Colors.warning,
    title: 'Acesso Negado',
    subtitle: 'Permissões insuficientes',
    description: 'O seu perfil não possui as permissões necessárias para aceder a este recurso. Contacte o administrador.',
    badge: '403 · Proibido',
    steps: ['Credenciais validadas com sucesso', 'Perfil de utilizador identificado', 'Permissão de acesso negada pelo sistema'],
    tip: 'Cada perfil (Admin, Professor, Financeiro, RH) tem acessos específicos definidos pelo administrador.',
  },
  404: {
    iconName: 'map-search-outline',
    iconLib: 'mci',
    accentColor: Colors.info,
    title: 'Página Não Encontrada',
    subtitle: 'Recurso inexistente',
    description: 'A página ou recurso que procura não existe ou foi movido. Verifique o endereço e tente novamente.',
    badge: '404 · Não Encontrado',
    steps: ['Pedido enviado ao servidor', 'Servidor recebeu o pedido', 'Recurso não encontrado no sistema'],
    tip: 'Utilize o menu principal para navegar para as secções disponíveis do sistema.',
  },
  408: {
    iconName: 'timer-alert-outline',
    iconLib: 'mci',
    accentColor: Colors.warning,
    title: 'Tempo Esgotado',
    subtitle: 'Servidor sem resposta',
    description: 'O servidor demorou demasiado a responder. Pode ser devido a uma ligação lenta ou sobrecarga temporária.',
    badge: '408 · Tempo Limite',
    steps: ['Pedido enviado ao servidor', 'Aguardando resposta do servidor', 'Limite de tempo excedido (30s)'],
    tip: 'Verifique a sua ligação à Internet e tente novamente. Se persistir, contacte o suporte.',
    autoRetry: true,
  },
  429: {
    iconName: 'speedometer-slow',
    iconLib: 'mci',
    accentColor: '#E67E22',
    title: 'Muitos Pedidos',
    subtitle: 'Limite de taxa excedido',
    description: 'Foram enviados demasiados pedidos num curto espaço de tempo. Aguarde alguns segundos e tente novamente.',
    badge: '429 · Rate Limited',
    steps: ['Pedidos recebidos pelo servidor', 'Limite de taxa por utilizador atingido', 'Pedido temporariamente bloqueado'],
    tip: 'Aguarde 60 segundos antes de tentar novamente. O limite será reposto automaticamente.',
    autoRetry: true,
  },
  500: {
    iconName: 'server-network-off',
    iconLib: 'mci',
    accentColor: Colors.danger,
    title: 'Erro Interno do Servidor',
    subtitle: 'Falha no servidor Super Escola',
    description: 'Ocorreu um problema inesperado no servidor. A equipa técnica foi notificada automaticamente e está a resolver.',
    badge: '500 · Erro Interno',
    steps: ['Pedido recebido pelo servidor', 'Falha durante o processamento', 'Erro interno não recuperado'],
    tip: 'Geralmente resolve-se em minutos. Tente novamente em breve ou contacte o suporte.',
    autoRetry: true,
  },
  502: {
    iconName: 'transit-connection-variant',
    iconLib: 'mci',
    accentColor: Colors.danger,
    title: 'Gateway Inválido',
    subtitle: 'Resposta inválida do upstream',
    description: 'O servidor intermediário recebeu uma resposta inválida. Pode ser uma falha temporária de rede.',
    badge: '502 · Bad Gateway',
    steps: ['Pedido enviado ao gateway', 'Gateway contactou o servidor de destino', 'Resposta inválida ou corrompida recebida'],
    tip: 'Este tipo de erro costuma ser transitório. Aguarde um momento e tente novamente.',
    autoRetry: true,
  },
  503: {
    iconName: 'cloud-off-outline',
    iconLib: 'mci',
    accentColor: '#8B9DC3',
    title: 'Sistema Indisponível',
    subtitle: 'Manutenção ou sobrecarga',
    description: 'O sistema está temporariamente fora de serviço para manutenção programada ou sobrecarga de acessos.',
    badge: '503 · Indisponível',
    steps: ['Pedido recebido pelo balanceador', 'Nenhum servidor disponível', 'Serviço suspenso temporariamente'],
    tip: 'O sistema voltará ao normal em breve. Consulte os comunicados da escola para informações.',
    autoRetry: true,
  },
  default: {
    iconName: 'alert-rhombus-outline',
    iconLib: 'mci',
    accentColor: Colors.warning,
    title: 'Erro Inesperado',
    subtitle: 'Algo correu mal',
    description: 'Ocorreu um erro que não conseguimos identificar. Por favor, tente recarregar. Se o problema persistir, contacte o suporte.',
    badge: 'Erro · Desconhecido',
    steps: ['Pedido iniciado pelo cliente', 'Falha durante o processamento', 'Tipo de erro não classificado'],
    tip: 'Tente recarregar a aplicação. Mantenha o código de erro para referência ao contactar o suporte.',
  },
};

interface ErrorScreenProps {
  code?: number;
  customMessage?: string;
  onPrimaryAction?: () => void;
  onSecondaryAction?: () => void;
  primaryLabel?: string;
  secondaryLabel?: string;
}

export default function ErrorScreen({
  code,
  customMessage,
  onPrimaryAction,
  onSecondaryAction,
  primaryLabel,
  secondaryLabel,
}: ErrorScreenProps) {
  const insets = useSafeAreaInsets();
  const { config } = useConfig();
  const cfg = CONFIGS[code as keyof typeof CONFIGS] ?? CONFIGS.default;
  const displayCode = code ?? '—';

  const [showDetails, setShowDetails] = useState(false);
  const [countdown, setCountdown] = useState(cfg.autoRetry ? 30 : 0);
  const [stepVisible, setStepVisible] = useState([false, false, false]);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(40)).current;
  const scaleAnim = useRef(new Animated.Value(0.88)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const glowAnim = useRef(new Animated.Value(0)).current;
  const detailsAnim = useRef(new Animated.Value(0)).current;
  const rippleAnim = useRef(new Animated.Value(0)).current;

  const stepAnims = useRef([
    new Animated.Value(0),
    new Animated.Value(0),
    new Animated.Value(0),
  ]).current;

  useEffect(() => {
    const ND = !IS_WEB;
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: ND }),
      Animated.spring(slideAnim, { toValue: 0, tension: 55, friction: 9, useNativeDriver: ND }),
      Animated.spring(scaleAnim, { toValue: 1, tension: 55, friction: 9, useNativeDriver: ND }),
    ]).start(() => {
      cfg.steps.forEach((_, i) => {
        setTimeout(() => {
          Animated.spring(stepAnims[i], { toValue: 1, tension: 70, friction: 8, useNativeDriver: false }).start();
          setStepVisible(prev => { const n = [...prev]; n[i] = true; return n; });
        }, 200 + i * 280);
      });
    });

    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.12, duration: 2200, useNativeDriver: ND }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 2200, useNativeDriver: ND }),
      ])
    ).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, { toValue: 1, duration: 2000, useNativeDriver: ND }),
        Animated.timing(glowAnim, { toValue: 0, duration: 2000, useNativeDriver: ND }),
      ])
    ).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(rippleAnim, { toValue: 1, duration: 3000, useNativeDriver: ND }),
        Animated.delay(1000),
      ])
    ).start();
  }, []);

  useEffect(() => {
    if (!cfg.autoRetry) return;
    if (countdown <= 0) return;
    const timer = setInterval(() => setCountdown(c => c - 1), 1000);
    return () => clearInterval(timer);
  }, [cfg.autoRetry]);

  useEffect(() => {
    Animated.timing(detailsAnim, {
      toValue: showDetails ? 1 : 0,
      duration: 280,
      useNativeDriver: false,
    }).start();
  }, [showDetails]);

  const toggleDetails = useCallback(() => setShowDetails(v => !v), []);

  const is401 = code === 401;
  const is5xx = code && code >= 500;
  const stepStatuses: Array<'done' | 'error' | 'pending'> = cfg.steps.map((_, i) => {
    if (i < cfg.steps.length - 1) return 'done';
    return 'error';
  });

  const defaultPrimary = is401 ? 'Iniciar Sessão' : code === 403 ? 'Voltar' : 'Tentar Novamente';
  const defaultSecondary = is401 ? undefined : 'Ir ao Dashboard';

  const rippleScale = rippleAnim.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1.6] });
  const rippleOpacity = rippleAnim.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0.25, 0.1, 0] });

  return (
    <View style={[styles.root, { paddingTop: insets.top || (IS_WEB ? 0 : 20), paddingBottom: insets.bottom || 16 }]}>

      {/* === Background Mesh === */}
      <View style={[StyleSheet.absoluteFill, { pointerEvents: 'none' } as any]}>
        <View style={[styles.bgGradTop, { backgroundColor: cfg.accentColor + '08' }]} />
        <View style={[styles.bgGradBottom, { backgroundColor: Colors.primaryDark }]} />
        {[...Array(IS_WIDE ? 8 : 5)].map((_, i) => (
          <View
            key={i}
            style={[
              styles.gridLine,
              { left: (W / (IS_WIDE ? 8 : 5)) * i, backgroundColor: Colors.text + '04' },
            ]}
          />
        ))}
        <View style={[styles.bgOrb, styles.bgOrb1, { backgroundColor: cfg.accentColor + '0C' }]} />
        <View style={[styles.bgOrb, styles.bgOrb2, { backgroundColor: Colors.primary + '18' }]} />
        <View style={[styles.bgOrb, styles.bgOrb3, { backgroundColor: cfg.accentColor + '06' }]} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        {/* === Header Bar === */}
        <View style={styles.headerBar}>
          <View style={styles.brandLockup}>
            <View style={[styles.brandSquare, { backgroundColor: cfg.accentColor }]} />
            <Text style={styles.brandText}>{config?.nomeEscola || 'Super Escola'}</Text>
            <Text style={styles.brandSub}>Sistema de Gestão Escolar</Text>
          </View>
          <View style={[styles.statusPill, { backgroundColor: cfg.accentColor + '18', borderColor: cfg.accentColor + '35' }]}>
            <View style={[styles.statusDot, { backgroundColor: cfg.accentColor }]} />
            <Text style={[styles.statusText, { color: cfg.accentColor }]}>{cfg.badge}</Text>
          </View>
        </View>

        {/* === Main Card === */}
        <Animated.View style={[styles.card, { opacity: fadeAnim, transform: [{ translateY: slideAnim }, { scale: scaleAnim }] }]}>

          {/* Card top accent bar */}
          <View style={[styles.cardAccentBar, { backgroundColor: cfg.accentColor }]} />

          <View style={IS_WIDE ? styles.cardInnerWide : styles.cardInner}>

            {/* LEFT: Icon Column */}
            <View style={IS_WIDE ? styles.iconColWide : styles.iconColNarrow}>
              {/* Ghost code */}
              <Text style={[styles.ghostCode, { color: cfg.accentColor + '12' }]}>{displayCode}</Text>

              {/* Ripple + Icon */}
              <View style={styles.iconStack}>
                <Animated.View style={[styles.ripple, styles.ripple3, {
                  borderColor: cfg.accentColor + '08',
                  transform: [{ scale: rippleScale }],
                  opacity: rippleOpacity,
                }]} />
                <Animated.View style={[styles.ripple, styles.ripple2, {
                  borderColor: cfg.accentColor + '14',
                  transform: [{ scale: pulseAnim }],
                }]} />
                <View style={[styles.iconBg, {
                  backgroundColor: cfg.accentColor + '12',
                  borderColor: cfg.accentColor + '28',
                }]}>
                  <Animated.View style={[styles.iconGlowLayer, {
                    backgroundColor: cfg.accentColor + '10',
                    opacity: glowAnim,
                  }]} />
                  {cfg.iconLib === 'ion' ? (
                    <Ionicons name={cfg.iconName as any} size={46} color={cfg.accentColor} />
                  ) : (
                    <MaterialCommunityIcons name={cfg.iconName as any} size={46} color={cfg.accentColor} />
                  )}
                </View>
              </View>

              {/* Code pill */}
              <View style={[styles.codePill, { backgroundColor: cfg.accentColor + '15', borderColor: cfg.accentColor + '30' }]}>
                <Text style={[styles.codePillText, { color: cfg.accentColor }]}>HTTP {displayCode}</Text>
              </View>
            </View>

            {/* RIGHT: Content Column */}
            <View style={IS_WIDE ? styles.contentColWide : styles.contentColNarrow}>

              {/* Subtitle */}
              <Text style={[styles.subtitle, { color: cfg.accentColor }]}>{cfg.subtitle.toUpperCase()}</Text>

              {/* Title */}
              <Text style={styles.title}>{cfg.title}</Text>

              {/* Description */}
              <Text style={styles.description}>{customMessage || cfg.description}</Text>

              {/* Divider */}
              <View style={[styles.hairline, { backgroundColor: cfg.accentColor + '30' }]} />

              {/* === Steps Timeline === */}
              <Text style={styles.sectionLabel}>DIAGNÓSTICO DO PEDIDO</Text>
              <View style={styles.stepsContainer}>
                {cfg.steps.map((step, i) => {
                  const status = stepStatuses[i];
                  const dotColor = status === 'done' ? Colors.success : status === 'error' ? cfg.accentColor : Colors.textMuted;
                  const isLast = i === cfg.steps.length - 1;
                  return (
                    <Animated.View
                      key={i}
                      style={[styles.stepRow, { opacity: stepAnims[i], transform: [{ translateX: stepAnims[i].interpolate({ inputRange: [0, 1], outputRange: [-12, 0] }) }] }]}
                    >
                      <View style={styles.stepLeftCol}>
                        <View style={[styles.stepDot, { backgroundColor: dotColor, borderColor: dotColor + '40' }]}>
                          {status === 'done' && <Ionicons name="checkmark" size={9} color="#fff" />}
                          {status === 'error' && <Ionicons name="close" size={9} color="#fff" />}
                        </View>
                        {!isLast && <View style={[styles.stepLine, { backgroundColor: i < cfg.steps.length - 2 ? Colors.success + '50' : Colors.border }]} />}
                      </View>
                      <View style={styles.stepContent}>
                        <Text style={[styles.stepText, { color: status === 'error' ? cfg.accentColor : status === 'done' ? Colors.textSecondary : Colors.textMuted }]}>
                          {step}
                        </Text>
                        {status === 'error' && (
                          <View style={[styles.stepErrorBadge, { backgroundColor: cfg.accentColor + '15' }]}>
                            <Text style={[styles.stepErrorText, { color: cfg.accentColor }]}>FALHOU</Text>
                          </View>
                        )}
                      </View>
                    </Animated.View>
                  );
                })}
              </View>

              {/* Tip box */}
              {cfg.tip && (
                <View style={[styles.tipBox, { backgroundColor: Colors.surface + 'AA', borderColor: cfg.accentColor + '25', borderLeftColor: cfg.accentColor }]}>
                  <Ionicons name="bulb-outline" size={15} color={cfg.accentColor} style={{ marginTop: 1 }} />
                  <Text style={styles.tipText}>{cfg.tip}</Text>
                </View>
              )}

              {/* Auto-retry countdown */}
              {cfg.autoRetry && countdown > 0 && onPrimaryAction && (
                <View style={[styles.countdownRow, { backgroundColor: Colors.surface + '80' }]}>
                  <Ionicons name="refresh-outline" size={13} color={Colors.textMuted} />
                  <Text style={styles.countdownText}>
                    Tentar novamente automaticamente em <Text style={{ color: Colors.text }}>{countdown}s</Text>
                  </Text>
                </View>
              )}

              {/* === Action Buttons === */}
              <View style={styles.actions}>
                {onPrimaryAction && (
                  <Pressable
                    style={({ pressed }) => [
                      styles.primaryBtn,
                      { backgroundColor: cfg.accentColor, opacity: pressed ? 0.88 : 1 },
                    ]}
                    onPress={onPrimaryAction}
                  >
                    <Ionicons
                      name={is401 ? 'log-in-outline' : code === 403 ? 'arrow-back-outline' : 'refresh-outline'}
                      size={17}
                      color={Colors.primaryDark}
                    />
                    <Text style={styles.primaryBtnText}>{primaryLabel ?? defaultPrimary}</Text>
                  </Pressable>
                )}
                {onSecondaryAction && (secondaryLabel ?? defaultSecondary) && (
                  <Pressable
                    style={({ pressed }) => [
                      styles.secondaryBtn,
                      { borderColor: Colors.borderLight, opacity: pressed ? 0.7 : 1 },
                    ]}
                    onPress={onSecondaryAction}
                  >
                    <Ionicons name="grid-outline" size={15} color={Colors.textSecondary} />
                    <Text style={styles.secondaryBtnText}>{secondaryLabel ?? defaultSecondary}</Text>
                  </Pressable>
                )}
              </View>

              {/* === Expandable Technical Details === */}
              <Pressable style={styles.detailsToggle} onPress={toggleDetails}>
                <Text style={styles.detailsToggleText}>Detalhes técnicos</Text>
                <Ionicons
                  name={showDetails ? 'chevron-up' : 'chevron-down'}
                  size={14}
                  color={Colors.textMuted}
                />
              </Pressable>

              {showDetails && (
                <View style={[styles.detailsBox, { borderColor: Colors.border }]}>
                  <DetailRow label="Código HTTP" value={String(displayCode)} accent={cfg.accentColor} />
                  <DetailRow label="Tipo" value={cfg.badge} accent={cfg.accentColor} />
                  <DetailRow label="Timestamp" value={new Date().toLocaleString('pt-AO', { dateStyle: 'short', timeStyle: 'medium' })} />
                  <DetailRow label="Plataforma" value={Platform.OS === 'web' ? 'Web (Browser)' : Platform.OS === 'ios' ? 'iOS' : 'Android'} />
                  <DetailRow label="Suporte" value="osvaldofernandomuondoqueta@gmail.com" last />
                </View>
              )}

            </View>
          </View>
        </Animated.View>

        {/* === Footer === */}
        <View style={styles.footer}>
          <View style={styles.footerLeft}>
            <View style={[styles.footerDot, { backgroundColor: Colors.success }]} />
            <Text style={styles.footerText}>{config?.nomeEscola || 'Super Escola'} · Angola</Text>
          </View>
          <Text style={styles.footerTime}>
            {new Date().toLocaleTimeString('pt-AO', { hour: '2-digit', minute: '2-digit' })}
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

function DetailRow({ label, value, accent, last }: { label: string; value: string; accent?: string; last?: boolean }) {
  return (
    <View style={[styles.detailRow, !last && { borderBottomWidth: 1, borderBottomColor: Colors.border }]}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={[styles.detailValue, accent ? { color: accent } : {}]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.background,
  },

  scroll: {
    flexGrow: 1,
    paddingHorizontal: IS_WEB ? (IS_WIDE ? 40 : 20) : 16,
    paddingBottom: 24,
    paddingTop: 8,
  },

  /* Background */
  bgGradTop: { position: 'absolute', top: 0, left: 0, right: 0, height: H * 0.45 },
  bgGradBottom: { position: 'absolute', bottom: 0, left: 0, right: 0, height: H * 0.3 },
  gridLine: { position: 'absolute', top: 0, bottom: 0, width: 1 },
  bgOrb: { position: 'absolute', borderRadius: 9999 },
  bgOrb1: { width: W * 0.8, height: W * 0.8, top: -W * 0.3, right: -W * 0.2 },
  bgOrb2: { width: W * 0.6, height: W * 0.6, bottom: -W * 0.2, left: -W * 0.15 },
  bgOrb3: { width: W * 0.4, height: W * 0.4, top: H * 0.4, right: W * 0.1 },

  /* Header */
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    marginBottom: 12,
  },
  brandLockup: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  brandSquare: { width: 8, height: 8, borderRadius: 2 },
  brandText: { fontSize: 15, fontFamily: 'Inter_700Bold', color: Colors.text, letterSpacing: 2.5 },
  brandSub: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted, letterSpacing: 0.2 },
  statusPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 20, borderWidth: 1,
  },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 11, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.5 },

  /* Card */
  card: {
    backgroundColor: Colors.backgroundCard,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
    ...(IS_WEB ? {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.3,
      shadowRadius: 24,
    } : { elevation: 12 }),
  },
  cardAccentBar: { height: 3, width: '100%' },
  cardInner: { padding: 28, gap: 24 },
  cardInnerWide: { flexDirection: 'row', padding: 36, gap: 40, alignItems: 'flex-start' },

  /* Icon Column */
  iconColNarrow: { alignItems: 'center', marginBottom: 4 },
  iconColWide: { alignItems: 'center', width: 180, paddingTop: 12, flexShrink: 0 },
  ghostCode: {
    position: 'absolute',
    fontSize: IS_WIDE ? 130 : 100,
    fontFamily: 'Inter_700Bold',
    letterSpacing: -6,
    top: IS_WIDE ? -20 : -10,
    alignSelf: 'center',
    ...(IS_WEB ? { userSelect: 'none' } as any : {}),
  },
  iconStack: {
    width: 120, height: 120,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 16,
    position: 'relative',
  },
  ripple: { position: 'absolute', borderRadius: 9999, borderWidth: 1.5 },
  ripple2: { width: 100, height: 100 },
  ripple3: { width: 130, height: 130 },
  iconBg: {
    width: 80, height: 80, borderRadius: 40,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, overflow: 'hidden',
  },
  iconGlowLayer: { position: 'absolute', inset: 0, borderRadius: 40 } as any,
  codePill: {
    paddingHorizontal: 14, paddingVertical: 6,
    borderRadius: 20, borderWidth: 1,
  },
  codePillText: { fontSize: 12, fontFamily: 'Inter_700Bold', letterSpacing: 1.5 },

  /* Content Column */
  contentColNarrow: { width: '100%', gap: 0 },
  contentColWide: { flex: 1, gap: 0 },

  subtitle: {
    fontSize: 10,
    fontFamily: 'Inter_600SemiBold',
    letterSpacing: 2,
    marginBottom: 6,
  },
  title: {
    fontSize: IS_WIDE ? 30 : 26,
    fontFamily: 'Inter_700Bold',
    color: Colors.text,
    lineHeight: IS_WIDE ? 38 : 34,
    marginBottom: 10,
  },
  description: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    color: Colors.textSecondary,
    lineHeight: 22,
    marginBottom: 20,
  },
  hairline: { height: 1, width: '100%', marginBottom: 18 },
  sectionLabel: {
    fontSize: 10, fontFamily: 'Inter_600SemiBold',
    color: Colors.textMuted, letterSpacing: 1.8,
    marginBottom: 14,
  },

  /* Steps */
  stepsContainer: { gap: 0, marginBottom: 18 },
  stepRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, minHeight: 36 },
  stepLeftCol: { alignItems: 'center', width: 18 },
  stepDot: {
    width: 18, height: 18, borderRadius: 9,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2,
  },
  stepLine: { width: 1.5, flex: 1, minHeight: 12, marginTop: 2 },
  stepContent: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, paddingBottom: 10 },
  stepText: { flex: 1, fontSize: 13, fontFamily: 'Inter_400Regular', lineHeight: 18 },
  stepErrorBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  stepErrorText: { fontSize: 9, fontFamily: 'Inter_700Bold', letterSpacing: 1 },

  /* Tip */
  tipBox: {
    flexDirection: 'row', gap: 10, alignItems: 'flex-start',
    padding: 12, borderRadius: 10,
    borderWidth: 1, borderLeftWidth: 3,
    marginBottom: 18,
  },
  tipText: {
    flex: 1, fontSize: 12, fontFamily: 'Inter_400Regular',
    color: Colors.textSecondary, lineHeight: 18,
  },

  /* Countdown */
  countdownRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: 8, marginBottom: 14,
  },
  countdownText: { fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textMuted },

  /* Actions */
  actions: { gap: 10, marginBottom: 18 },
  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 14, paddingHorizontal: 24, borderRadius: 12,
    ...(IS_WEB ? {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.2,
      shadowRadius: 8,
    } : { elevation: 4 }),
  },
  primaryBtnText: { fontSize: 15, fontFamily: 'Inter_600SemiBold', color: Colors.primaryDark },
  secondaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 12, paddingHorizontal: 24,
    borderRadius: 10, borderWidth: 1, backgroundColor: Colors.surface + '50',
  },
  secondaryBtnText: { fontSize: 14, fontFamily: 'Inter_500Medium', color: Colors.textSecondary },

  /* Details Toggle */
  detailsToggle: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 8,
  },
  detailsToggleText: { fontSize: 12, fontFamily: 'Inter_500Medium', color: Colors.textMuted },

  /* Details Box */
  detailsBox: {
    borderWidth: 1, borderRadius: 10, overflow: 'hidden',
    backgroundColor: Colors.backgroundElevated + '70',
    marginTop: 4,
  },
  detailRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingHorizontal: 14, paddingVertical: 9,
  },
  detailLabel: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted },
  detailValue: { fontSize: 11, fontFamily: 'Inter_600SemiBold', color: Colors.textSecondary },

  /* Footer */
  footer: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4, paddingTop: 16,
  },
  footerLeft: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  footerDot: { width: 6, height: 6, borderRadius: 3 },
  footerText: { fontSize: 10, fontFamily: 'Inter_400Regular', color: Colors.textMuted },
  footerTime: { fontSize: 10, fontFamily: 'Inter_500Medium', color: Colors.textMuted },
});
