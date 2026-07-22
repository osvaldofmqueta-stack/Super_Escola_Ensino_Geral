import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform, Image, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import GlobalSearch from '@/components/GlobalSearch';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Colors } from '@/constants/colors';
import { useDrawer } from '@/context/DrawerContext';
import { useAuth } from '@/context/AuthContext';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { useNotificacoes } from '@/context/NotificacoesContext';
import { useChatInterno } from '@/context/ChatInternoContext';
import { useData } from '@/context/DataContext';
import { useFinanceiro, formatAOA } from '@/context/FinanceiroContext';
import { useAnoAcademico } from '@/context/AnoAcademicoContext';
import { useConfig } from '@/context/ConfigContext';
import { api } from '@/lib/api';
import {
  buildSmartGreeting,
  getGreetingPeriod,
  getTimeGreeting,
  firstName,
  firstAndLastName,
  isBirthday,
  getAniversarioIdade,
} from '@/utils/greetings';
import OfflineStatusBadge from '@/components/OfflineStatusBadge';

function formatTime(date: Date) {
  return date.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function formatDate(date: Date) {
  return date.toLocaleDateString('pt-PT', { weekday: 'short', day: '2-digit', month: 'short' });
}

interface AniversarianteHoje {
  id: string;
  nome: string;
  role: string;
  avatar?: string | null;
  idade: number | null;
}

interface TopBarProps {
  title: string;
  subtitle?: string;
  hideSubtitle?: boolean;
  hideNameInGreeting?: boolean;
  onBack?: () => void;
  leftAction?: { icon: string; onPress: () => void };
  rightAction?: { icon: string; onPress: () => void };
}

/** Banner de aniversário para outros utilizadores */
function BirthdayBanner({ aniversariantes, myId }: { aniversariantes: AniversarianteHoje[]; myId?: string }) {
  const others = aniversariantes.filter(a => a.id !== myId);
  const [dismissed, setDismissed] = useState(false);
  const fadeAnim = useState(() => new Animated.Value(1))[0];

  if (!others.length || dismissed) return null;

  const handleDismiss = () => {
    Animated.timing(fadeAnim, { toValue: 0, duration: 300, useNativeDriver: false }).start(() => setDismissed(true));
  };

  const names = others.map(a => {
    const fn = firstName(a.nome) ?? a.nome;
    return a.idade ? `${fn} (${a.idade} anos)` : fn;
  });
  const text = names.length === 1
    ? `🎂 ${names[0]} está a fazer anos hoje! Parabéns!`
    : `🎂 ${names.slice(0, -1).join(', ')} e ${names[names.length - 1]} estão a fazer anos hoje! Parabéns!`;

  return (
    <Animated.View style={[styles.birthdayBanner, { opacity: fadeAnim }]}>
      <View style={styles.birthdayBannerInner}>
        <Text style={styles.birthdayBannerIcon}>🎉</Text>
        <Text style={styles.birthdayBannerText} numberOfLines={2}>{text}</Text>
      </View>
      <TouchableOpacity onPress={handleDismiss} style={styles.birthdayBannerClose} activeOpacity={0.7}>
        <Ionicons name="close" size={14} color="#F59E0B" />
      </TouchableOpacity>
    </Animated.View>
  );
}

/** Bloco nome + saudação ao lado do avatar */
function UserNameBlock({
  nome,
  date,
  compact = false,
}: {
  nome?: string | null;
  date: Date;
  compact?: boolean;
}) {
  const fullDisplay = firstAndLastName(nome);
  const period = getGreetingPeriod(date);
  const greeting = getTimeGreeting(date);

  const periodColor: Record<typeof period, string> = {
    manha:     '#FBBF24',
    tarde:     '#34D399',
    noite:     '#A78BFA',
    madrugada: '#93C5FD',
  };
  const color = periodColor[period];

  if (!fullDisplay) return null;

  return (
    <View style={[styles.userNameBlock, compact && styles.userNameBlockCompact]}>
      <Text style={[styles.userNameGreeting, { color: color + 'DD' }]} numberOfLines={1}>
        {greeting}
      </Text>
      <Text style={styles.userNameText} numberOfLines={1}>
        {fullDisplay}
      </Text>
    </View>
  );
}

export default function TopBar({ title, subtitle, hideSubtitle, hideNameInGreeting, onBack, leftAction, rightAction }: TopBarProps) {
  const { openLeft, openRight, toggleDesktopSidebar, desktopCollapsed } = useDrawer();
  const { user } = useAuth();
  const { config } = useConfig();
  const { unreadCount } = useNotificacoes();
  const { unreadTotal: chatUnread } = useChatInterno();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isDesktop, isMobile } = useBreakpoint();
  const [now, setNow] = useState(new Date());
  const [searchVisible, setSearchVisible] = useState(false);
  const [aniversariantes, setAniversariantes] = useState<AniversarianteHoje[]>([]);
  const [canGoBack, setCanGoBack] = useState(false);

  useEffect(() => {
    try { setCanGoBack(router.canGoBack()); } catch { setCanGoBack(false); }
  });

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  // Carregar aniversários de hoje (uma vez por sessão)
  useEffect(() => {
    let cancel = false;
    api.get<AniversarianteHoje[]>('/api/aniversarios-hoje')
      .then(data => { if (!cancel && Array.isArray(data)) setAniversariantes(data); })
      .catch(() => {});
    return () => { cancel = true; };
  }, []);

  // ── Indicador financeiro do aluno ────────────────────────────────────
  const { alunos } = useData();
  const { taxas, getMesesEmAtraso, calcularMulta, pagamentos } = useFinanceiro();
  const { anoSelecionado } = useAnoAcademico();
  const [alunoSaldo, setAlunoSaldo] = useState<number>(0);

  const alunoFin = useMemo(() => {
    if (user?.role !== 'aluno') return null;
    const aluno = alunos.find(a =>
      (user?.id && a.utilizadorId === user.id) ||
      a.email === user?.email ||
      a.nome.includes((user?.nome || '').split(' ')[0])
    );
    if (!aluno) return null;
    const anoLetivo = anoSelecionado?.ano || new Date().getFullYear().toString();
    const taxaPropina = taxas.find((t: any) => t.tipo === 'propina' && t.ativo);
    const valorPropina = Number(taxaPropina?.valor || 0);
    const mesesAtraso = getMesesEmAtraso(aluno.id, anoLetivo);
    const multa = calcularMulta(valorPropina, mesesAtraso);
    const totalDevido = mesesAtraso * valorPropina + multa;
    return { aluno, mesesAtraso, totalDevido };
  }, [user?.role, user?.id, user?.email, user?.nome, alunos, taxas, anoSelecionado?.ano, getMesesEmAtraso, calcularMulta]);

  useEffect(() => {
    const id = alunoFin?.aluno?.id;
    if (!id) return;
    let cancel = false;
    api.get<{ saldo?: number }>(`/api/saldo-alunos/${id}`)
      .then(r => { if (!cancel) setAlunoSaldo(Number((r as any)?.saldo ?? 0)); })
      .catch(() => { if (!cancel) setAlunoSaldo(0); });
    return () => { cancel = true; };
  }, [alunoFin?.aluno?.id, pagamentos.length]);

  const finBadge = useMemo(() => {
    if (!alunoFin) return null;
    if (alunoFin.totalDevido > 0) {
      const m = alunoFin.mesesAtraso;
      return {
        cor: Colors.danger,
        icon: 'alert-circle' as const,
        label: formatAOA(alunoFin.totalDevido),
        mobileLabel: `${m} ${m === 1 ? 'mês' : 'meses'} em atraso`,
        tooltip: 'Propinas em atraso',
      };
    }
    if (alunoSaldo > 0) {
      return {
        cor: Colors.gold,
        icon: 'wallet' as const,
        label: formatAOA(alunoSaldo),
        mobileLabel: 'Saldo positivo',
        tooltip: 'Saldo disponível',
      };
    }
    return {
      cor: Colors.success,
      icon: 'checkmark-circle' as const,
      label: 'Em dia',
      mobileLabel: 'Propinas em dia',
      tooltip: 'Propinas em dia',
    };
  }, [alunoFin, alunoSaldo]);

  const topPad = isDesktop ? 0 : insets.top;

  const greetingText = subtitle ?? buildSmartGreeting(
    hideNameInGreeting ? null : user?.nome,
    now,
    user?.dataNascimento,
  );
  const isBday = greetingText.startsWith('🎉');
  const isSpecialDay = !isBday && (
    greetingText.includes('Feliz') ||
    greetingText.includes('Dia ') ||
    greetingText.includes('Boa Páscoa') ||
    greetingText.includes('Feliz Natal') ||
    greetingText.includes('Bom fim') ||
    greetingText.includes('🎊') ||
    greetingText.includes('🇦🇴') ||
    greetingText.includes('💜') ||
    greetingText.includes('❤️')
  );
  const mobileGreetingText = subtitle ?? (() => {
    if (isBday || isSpecialDay) return greetingText;
    const name = firstName(user?.nome);
    const time = getTimeGreeting(now);
    return name ? `${time}, ${name}` : time;
  })();
  const timeText = formatTime(now);
  const dateText = formatDate(now);

  const period = getGreetingPeriod(now);
  const periodIcon: Record<typeof period, string> = {
    manha:     'sunny-outline',
    tarde:     'partly-sunny-outline',
    noite:     'moon-outline',
    madrugada: 'moon-outline',
  };
  const periodColor: Record<typeof period, string> = {
    manha:     '#FBBF24',
    tarde:     '#34D399',
    noite:     '#A78BFA',
    madrugada: '#93C5FD',
  };
  const greetingIcon = periodIcon[period];
  const greetingColor = periodColor[period];
  const specialGreetingColor = isBday ? '#F59E0B' : isSpecialDay ? '#34D399' : greetingColor;

  // Banner de aniversário de outros utilizadores
  const birthdayBanner = aniversariantes.filter(a => a.id !== user?.id).length > 0 ? (
    <BirthdayBanner aniversariantes={aniversariantes} myId={user?.id} />
  ) : null;

  if (isMobile) {
    return (
      <>
      <View style={[styles.containerMobileWrapper, { paddingTop: topPad + 8 }]}>
        {/* Row 1: Hamburger | Logo | spacer | FinBadge | Search | Notifications | Avatar */}
        <View style={styles.mobileRow1}>
          <TouchableOpacity
            style={styles.hamburgerBtn}
            onPress={openLeft}
            activeOpacity={0.7}
            accessibilityLabel="Abrir menu lateral"
          >
            <Ionicons name="menu" size={22} color={Colors.text} />
          </TouchableOpacity>

          {config?.logoUrl ? (
            <TouchableOpacity onPress={() => router.push('/(main)/dashboard?section=resumo' as any)} activeOpacity={0.8}>
              <Image source={{ uri: config.logoUrl }} style={styles.topbarLogoMobile} resizeMode="contain" />
            </TouchableOpacity>
          ) : null}

          <View style={{ flex: 1 }} />

          <OfflineStatusBadge inline hideWhenHealthy />

          {finBadge && (
            <TouchableOpacity
              onPress={() => router.push('/(main)/portal-estudante' as any)}
              activeOpacity={0.7}
              style={[styles.finBadgeMobile, { backgroundColor: finBadge.cor + '15', borderColor: finBadge.cor + '60' }]}
            >
              <Ionicons name={finBadge.icon} size={13} color={finBadge.cor} />
              <Text style={[styles.finBadgeMobileText, { color: finBadge.cor }]} numberOfLines={1}>
                {finBadge.mobileLabel}
              </Text>
            </TouchableOpacity>
          )}

          {leftAction && (
            <TouchableOpacity style={styles.iconBtnMobile} onPress={leftAction.onPress} activeOpacity={0.7}>
              <Ionicons name={leftAction.icon as any} size={20} color={Colors.gold} />
            </TouchableOpacity>
          )}

          {rightAction && (
            <TouchableOpacity style={styles.iconBtnMobile} onPress={rightAction.onPress} activeOpacity={0.7}>
              <Ionicons name={rightAction.icon as any} size={20} color={Colors.text} />
            </TouchableOpacity>
          )}

          <TouchableOpacity style={styles.iconBtnMobile} onPress={() => setSearchVisible(true)} activeOpacity={0.7}>
            <Ionicons name="search" size={20} color={Colors.text} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.iconBtnMobile}
            onPress={() => router.push('/(main)/notificacoes' as any)}
            activeOpacity={0.7}
          >
            <Ionicons name="notifications" size={20} color={unreadCount > 0 ? Colors.gold : Colors.text} />
            {unreadCount > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{unreadCount > 99 ? '99+' : unreadCount}</Text>
              </View>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.avatarBtnMobile}
            onPress={openRight}
            activeOpacity={0.7}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            {(user as any)?.avatar ? (
              <Image source={{ uri: (user as any).avatar }} style={styles.avatarImgMobile} />
            ) : (
              <Text style={styles.avatarTextMobile}>{user?.nome?.charAt(0) ?? 'U'}</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Row 2: Voltar (se disponível) + Título + Saudação */}
        <View style={styles.mobileRow2}>
          {(onBack || canGoBack) && (
            <TouchableOpacity style={styles.backBtnMobile} onPress={onBack ?? (() => router.back())} activeOpacity={0.75}>
              <Ionicons name="arrow-back" size={15} color={Colors.textSecondary} />
              <Text style={styles.backBtnMobileText}>Voltar</Text>
            </TouchableOpacity>
          )}
          <View style={styles.titleAreaMobile}>
            <Text style={styles.titleMobile} numberOfLines={1}>{title}</Text>
            {(isBday || isSpecialDay) ? (
              <View style={[styles.specialGreetingBadge, { backgroundColor: specialGreetingColor + '22', borderColor: specialGreetingColor + '55' }]}>
                <Text style={[styles.specialGreetingText, { color: specialGreetingColor }]} numberOfLines={1}>
                  {mobileGreetingText}
                </Text>
              </View>
            ) : (
              <View style={styles.greetingRow}>
                <Ionicons name={greetingIcon as any} size={11} color={greetingColor} />
                <Text style={[styles.subtitleMobile, { color: specialGreetingColor + 'CC' }]} numberOfLines={1}>
                  {mobileGreetingText}
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* Banner de aniversário (mobile) */}
        {birthdayBanner}
      </View>
      <GlobalSearch visible={searchVisible} onClose={() => setSearchVisible(false)} />
      </>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: topPad + (isDesktop ? 16 : 8) }]}>
      {/* Botão hamburger */}
      {isDesktop ? (
        <TouchableOpacity
          style={styles.iconBtn}
          onPress={toggleDesktopSidebar}
          activeOpacity={0.7}
          accessibilityLabel={desktopCollapsed ? 'Expandir menu lateral' : 'Colapsar menu lateral'}
        >
          <Ionicons name={desktopCollapsed ? 'menu' : 'chevron-back'} size={22} color={Colors.text} />
        </TouchableOpacity>
      ) : !isDesktop && (
        <TouchableOpacity style={styles.iconBtn} onPress={openLeft} activeOpacity={0.7}>
          <Ionicons name="menu" size={24} color={Colors.text} />
        </TouchableOpacity>
      )}

      {/* Logótipo da escola */}
      {config?.logoUrl ? (
        <TouchableOpacity onPress={() => router.push('/(main)/dashboard?section=resumo' as any)} activeOpacity={0.8}>
          <Image source={{ uri: config.logoUrl }} style={styles.topbarLogo} resizeMode="contain" />
        </TouchableOpacity>
      ) : null}

      {/* Home button */}
      {!isMobile && (
        <TouchableOpacity
          style={styles.homeBtn}
          onPress={() => router.push('/(main)/dashboard?section=painel' as any)}
          activeOpacity={0.75}
        >
          <Ionicons name="home" size={19} color={Colors.gold} />
        </TouchableOpacity>
      )}

      {/* Botão Voltar (desktop/tablet) */}
      {!isMobile && (onBack || canGoBack) && (
        <TouchableOpacity
          style={styles.backBtn}
          onPress={onBack ?? (() => router.back())}
          activeOpacity={0.75}
        >
          <Ionicons name="arrow-back" size={16} color={Colors.textSecondary} />
          <Text style={styles.backBtnText}>Voltar</Text>
        </TouchableOpacity>
      )}

      {/* Área de título + saudação contextual */}
      <View style={styles.titleArea}>
        <Text style={[styles.title, isDesktop && styles.titleDesktop]} numberOfLines={1}>{title}</Text>
        {!hideSubtitle && (isBday || isSpecialDay) ? (
          <View style={[styles.specialGreetingBadge, { backgroundColor: specialGreetingColor + '22', borderColor: specialGreetingColor + '55' }]}>
            <Text style={[styles.specialGreetingText, { color: specialGreetingColor }]} numberOfLines={1}>
              {greetingText}
            </Text>
          </View>
        ) : !hideSubtitle ? (
          <View style={styles.greetingRow}>
            {!isBday && (
              <Ionicons name={greetingIcon as any} size={11} color={greetingColor} />
            )}
            <Text style={[styles.subtitle, { color: greetingColor + 'CC' }]} numberOfLines={1}>
              {greetingText}
            </Text>
          </View>
        ) : null}
      </View>

      {/* Banner aniversário outros utilizadores (desktop: inline) */}
      {birthdayBanner && (
        <View style={styles.birthdayBannerDesktopWrapper}>
          <BirthdayBanner aniversariantes={aniversariantes} myId={user?.id} />
        </View>
      )}

      {/* Relógio */}
      <View style={styles.clockWidget}>
        <View style={styles.clockAccentBar} />
        <View style={styles.clockInner}>
          <Text style={styles.clockTime}>{timeText}</Text>
          <Text style={styles.clockDate}>{dateText}</Text>
        </View>
      </View>

      <View style={styles.rightActions}>
        {/* Badge financeiro do aluno */}
        {finBadge && (
          <TouchableOpacity
            onPress={() => router.push('/(main)/portal-estudante' as any)}
            activeOpacity={0.7}
            style={[styles.finBadge, { backgroundColor: finBadge.cor + '15', borderColor: finBadge.cor + '60' }]}
          >
            <Ionicons name={finBadge.icon} size={16} color={finBadge.cor} />
            <View style={styles.finBadgeTexts}>
              <Text style={[styles.finBadgeLabel, { color: finBadge.cor + 'AA' }]}>{finBadge.tooltip}</Text>
              <Text style={[styles.finBadgeValue, { color: finBadge.cor }]} numberOfLines={1}>{finBadge.label}</Text>
            </View>
          </TouchableOpacity>
        )}

        {leftAction && (
          <TouchableOpacity style={styles.iconBtn} onPress={leftAction.onPress} activeOpacity={0.7}>
            <Ionicons name={leftAction.icon as any} size={22} color={Colors.gold} />
          </TouchableOpacity>
        )}

        {rightAction && (
          <TouchableOpacity style={styles.iconBtn} onPress={rightAction.onPress} activeOpacity={0.7}>
            <Ionicons name={rightAction.icon as any} size={22} color={Colors.text} />
          </TouchableOpacity>
        )}

        <OfflineStatusBadge inline hideWhenHealthy={false} />

        <TouchableOpacity
          style={styles.iconBtn}
          onPress={() => router.push('/(main)/notificacoes' as any)}
          activeOpacity={0.7}
        >
          <Ionicons name="notifications" size={22} color={unreadCount > 0 ? Colors.gold : Colors.text} />
          {unreadCount > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{unreadCount > 99 ? '99+' : unreadCount}</Text>
            </View>
          )}
        </TouchableOpacity>

        {/* Nome + saudação ao lado do avatar */}
        <UserNameBlock nome={user?.nome} date={now} />

        <TouchableOpacity style={styles.avatarBtn} onPress={openRight} activeOpacity={0.7}>
          {(user as any)?.avatar ? (
            <Image source={{ uri: (user as any).avatar }} style={styles.avatarImg} />
          ) : (
            <Text style={styles.avatarText}>{user?.nome?.charAt(0) ?? 'U'}</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  containerMobileWrapper: {
    flexDirection: 'column',
    paddingHorizontal: 10,
    paddingBottom: 8,
    backgroundColor: Colors.primaryDark,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: 6,
  },
  mobileRow1: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  mobileRow2: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  titleAreaMobile: {
    flex: 1,
    minWidth: 0,
  },
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: Colors.primaryDark,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: 10,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  iconBtnMobile: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  hamburgerBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: 'rgba(240,165,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  homeBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: 'rgba(240,165,0,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(240,165,0,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    height: 36,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  backBtnText: {
    fontSize: 13,
    fontFamily: 'Inter_500Medium',
    color: Colors.textSecondary,
  },
  backBtnMobile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 7,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    marginRight: 8,
    alignSelf: 'center',
  },
  backBtnMobileText: {
    fontSize: 12,
    fontFamily: 'Inter_500Medium',
    color: Colors.textSecondary,
  },
  titleArea: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 17,
    fontFamily: 'Inter_700Bold',
    color: Colors.text,
  },
  titleDesktop: {
    fontSize: 19,
  },
  titleMobile: {
    fontSize: 15,
    fontFamily: 'Inter_700Bold',
    color: Colors.text,
  },
  subtitleMobile: {
    fontSize: 11,
    fontFamily: 'Inter_500Medium',
  },
  greetingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  subtitle: {
    fontSize: 11,
    fontFamily: 'Inter_500Medium',
    color: Colors.textMuted,
  },
  specialGreetingBadge: {
    marginTop: 2,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  specialGreetingText: {
    fontSize: 10,
    fontFamily: 'Inter_700Bold',
    letterSpacing: 0.2,
  },
  clockWidget: {
    flexDirection: 'row',
    alignItems: 'stretch',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.2)',
    overflow: 'hidden',
    paddingRight: 14,
    paddingVertical: 7,
  },
  clockAccentBar: {
    width: 3,
    marginRight: 11,
    backgroundColor: Colors.gold,
    borderTopRightRadius: 1,
    borderBottomRightRadius: 1,
    alignSelf: 'stretch',
  },
  clockInner: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 2,
  },
  clockTime: {
    fontSize: 15,
    fontFamily: 'Inter_700Bold',
    color: '#EEF2FF',
    letterSpacing: 1.2,
    lineHeight: 18,
  },
  clockDate: {
    fontSize: 9,
    fontFamily: 'Inter_600SemiBold',
    color: Colors.gold + 'BB',
    textTransform: 'uppercase',
    lineHeight: 11,
    letterSpacing: 1.1,
  },
  rightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  rightActionsMobile: {
    gap: 5,
  },
  finBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    maxWidth: 170,
  },
  finBadgeCompact: {
    paddingHorizontal: 8,
    paddingVertical: 7,
    gap: 0,
  },
  finBadgeMobile: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 7,
    paddingVertical: 5,
    gap: 4,
    maxWidth: 130,
    borderRadius: 8,
    borderWidth: 1,
  },
  finBadgeMobileText: {
    fontSize: 10,
    fontFamily: 'Inter_600SemiBold',
    flexShrink: 1,
  },
  finBadgeTexts: {
    flexShrink: 1,
  },
  finBadgeLabel: {
    fontSize: 9,
    fontFamily: 'Inter_600SemiBold',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    lineHeight: 11,
  },
  finBadgeValue: {
    fontSize: 12,
    fontFamily: 'Inter_700Bold',
    lineHeight: 15,
    marginTop: 1,
  },
  badge: {
    position: 'absolute',
    top: -2, right: -2,
    backgroundColor: Colors.danger,
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
    borderWidth: 1.5,
    borderColor: Colors.primaryDark,
  },
  badgeText: {
    fontSize: 9,
    fontFamily: 'Inter_700Bold',
    color: '#fff',
  },
  avatarBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Colors.gold,
    overflow: 'hidden',
  },
  avatarBtnMobile: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: Colors.gold,
    overflow: 'hidden',
    ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
  },
  avatarImg: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  avatarImgMobile: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  avatarText: {
    fontSize: 15,
    fontFamily: 'Inter_700Bold',
    color: Colors.text,
  },
  avatarTextMobile: {
    fontSize: 14,
    fontFamily: 'Inter_700Bold',
    color: Colors.text,
  },
  topbarLogo: {
    width: 68,
    height: 68,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1.5,
    borderColor: 'rgba(240,165,0,0.35)',
  },
  topbarLogoMobile: {
    width: 52,
    height: 52,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1.5,
    borderColor: 'rgba(240,165,0,0.35)',
  },

  // ── Nome + saudação ao lado do avatar ─────────────────────────────
  userNameBlock: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    minWidth: 80,
    maxWidth: 140,
  },
  userNameBlockCompact: {
    minWidth: 60,
    maxWidth: 110,
  },
  userNameGreeting: {
    fontSize: 9,
    fontFamily: 'Inter_600SemiBold',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    lineHeight: 12,
  },
  userNameText: {
    fontSize: 12,
    fontFamily: 'Inter_700Bold',
    color: Colors.text,
    lineHeight: 15,
  },

  // ── Banner de aniversário ──────────────────────────────────────────
  birthdayBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(245,158,11,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.4)',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 6,
    marginTop: 4,
  },
  birthdayBannerInner: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  birthdayBannerIcon: {
    fontSize: 16,
  },
  birthdayBannerText: {
    flex: 1,
    fontSize: 11,
    fontFamily: 'Inter_600SemiBold',
    color: '#F59E0B',
    lineHeight: 15,
  },
  birthdayBannerClose: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(245,158,11,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  birthdayBannerDesktopWrapper: {
    flex: 1,
    maxWidth: 340,
  },
});
