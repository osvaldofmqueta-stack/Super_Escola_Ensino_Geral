import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Animated,
  Platform, ScrollView, Image, Modal, useWindowDimensions,
} from 'react-native';
import { Ionicons, MaterialIcons, MaterialCommunityIcons, FontAwesome5 } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, usePathname } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors } from '@/constants/colors';
import { useDrawer } from '@/context/DrawerContext';
import { useAuth, getAuthToken } from '@/context/AuthContext';
import { useConfig } from '@/context/ConfigContext';
import { useAnoAcademico } from '@/context/AnoAcademicoContext';
import { useLicense } from '@/context/LicenseContext';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { usePermissoes, PermKey } from '@/context/PermissoesContext';
import { getRoleLabel } from '@/utils/genero';
import { useResolvedGenero } from '@/hooks/useResolvedGenero';
import { useTourCtx } from '@/contexts/TourContext';

const SIDEBAR_WIDTH = 260;
const ICON_ONLY_WIDTH = 64;

function KzIcon({ color, size }: { color?: string; size?: number }) {
  return (
    <Text style={{ color: color || '#888', fontSize: (size || 20) * 0.72, fontWeight: '900', letterSpacing: 0.5, lineHeight: (size || 20) }}>
      Kz
    </Text>
  );
}

interface NavItem {
  label: string;
  route: string;
  icon: React.ReactNode;
  badgeCount?: number;
  permKey?: PermKey;
  subItems?: NavItem[];
}

interface NavSection {
  title: string;
  items: NavItem[];
}

export default function DrawerLeft({ temPerfilIncompleto = false }: { temPerfilIncompleto?: boolean }) {
  const { leftOpen, closeLeft, toggleLeft, desktopCollapsed, toggleDesktopSidebar } = useDrawer();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useAuth();
  const { config } = useConfig();
  const { anos, anoAtivo, anoSelecionado, setAnoSelecionado, trimestreAtual } = useAnoAcademico();
  const { isLicencaValida, diasRestantes } = useLicense();
  const { isDesktop } = useBreakpoint();
  const resolvedGenero = useResolvedGenero();
  const { width: winWidth } = useWindowDimensions();
  const { tourRoute, setTourItemRect } = useTourCtx();

  /** Verifica se este item do menu é o passo actual do tour */
  const isTourItem = (route: string) => {
    if (!tourRoute) return false;
    // Comparação exacta — garante que admin?section=escola não ilumina admin?section=config
    return tourRoute === route;
  };

  /** Ref para o item de menu actualmente destacado pelo tour — usado para medir a
   * sua posição em ecrã e permitir que o cartão do GuidedTour aponte exactamente
   * para ele, em vez de ficar sempre centrado. */
  const activeTourItemRef = useRef<any>(null);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    if (!tourRoute) {
      setTourItemRect(null);
      return;
    }
    const measure = () => {
      const el: any = activeTourItemRef.current;
      if (!el) return;
      // `measureInWindow` é o método padrão RN (funciona também em react-native-web,
      // devolvendo coordenadas relativas à janela) — mais fiável do que assumir
      // que o ref é directamente um nó DOM com getBoundingClientRect.
      if (typeof el.measureInWindow === 'function') {
        el.measureInWindow((x: number, y: number, width: number, height: number) => {
          if (width > 0 && height > 0) setTourItemRect({ top: y, height });
        });
      } else if (typeof el.getBoundingClientRect === 'function') {
        const rect = el.getBoundingClientRect();
        setTourItemRect({ top: rect.top, height: rect.height });
      }
    };
    // Pequeno atraso para garantir que o layout (scroll, expandir secção, etc.) já assentou
    const raf1 = requestAnimationFrame(() => requestAnimationFrame(measure));
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      cancelAnimationFrame(raf1);
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [tourRoute]);

  const drawerWidth = Math.min(winWidth * 0.85, 300);

  const [yearDropdownOpen, setYearDropdownOpen] = useState(false);
  const [pendentesCount, setPendentesCount] = useState<number>(0);
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});
  const [expandedNavItems, setExpandedNavItems] = useState<Record<string, boolean>>(() => {
    return { '/(main)/rh-hub': true };
  });
  const translateX = useRef(new Animated.Value(-300)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const desktopWidthAnim = useRef(new Animated.Value(SIDEBAR_WIDTH)).current;

  const toggleSection = (title: string) => {
    setCollapsedSections(prev => ({ ...prev, [title]: !prev[title] }));
  };

  const toggleNavItem = (route: string) => {
    setExpandedNavItems(prev => ({ ...prev, [route]: !prev[route] }));
  };

  useEffect(() => {
    if (isDesktop) return;
    const nd = Platform.OS !== 'web';
    Animated.parallel([
      Animated.spring(translateX, {
        toValue: leftOpen ? 0 : -drawerWidth,
        useNativeDriver: nd,
        damping: 20,
        stiffness: 200,
      }),
      Animated.timing(opacity, {
        toValue: leftOpen ? 1 : 0,
        duration: 250,
        useNativeDriver: nd,
      }),
    ]).start();
  }, [leftOpen, isDesktop]);

  const navigate = (route: string) => {
    if (!isDesktop) closeLeft();
    setTimeout(() => router.push(route as any), isDesktop ? 0 : 150);
  };

  // Inject web-specific CSS for hover effects and keyboard navigation
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const id = 'drawer-nav-styles';
    if (document.getElementById(id)) return;
    const style = document.createElement('style');
    style.id = id;
    style.textContent = `
      /* Hover states for nav items */
      .drawer-nav-item {
        transition: background-color 0.18s ease, transform 0.15s ease;
      }
      .drawer-nav-item:hover {
        background-color: rgba(255,255,255,0.075) !important;
      }
      .drawer-nav-item:active {
        background-color: rgba(255,255,255,0.11) !important;
        transform: scale(0.99);
      }
      .drawer-section-header:hover {
        background-color: rgba(255,255,255,0.05) !important;
        transition: background-color 0.15s ease;
      }
      .drawer-sub-item {
        transition: background-color 0.18s ease;
      }
      .drawer-sub-item:hover {
        background-color: rgba(255,255,255,0.06) !important;
      }
      .drawer-cta-card {
        transition: transform 0.22s cubic-bezier(0.34,1.56,0.64,1), filter 0.18s ease, box-shadow 0.2s ease;
        will-change: transform;
      }
      .drawer-cta-card:hover {
        transform: translateY(-2px) scale(1.015);
        filter: brightness(1.18) saturate(1.1);
        box-shadow: 0 10px 32px rgba(0,0,0,0.5) !important;
      }
      .drawer-cta-card:active {
        transform: scale(0.975);
        filter: brightness(0.94);
        transition: transform 0.08s ease, filter 0.08s ease;
      }
      /* Touch scroll fix for mobile browsers */
      .drawer-scroll {
        -webkit-overflow-scrolling: touch !important;
        touch-action: pan-y !important;
        overscroll-behavior-y: contain;
        overflow-y: auto !important;
        overflow-x: hidden !important;
      }
      /* RNW may add an inner wrapper — ensure it also allows pan-y */
      .drawer-scroll > div,
      .drawer-scroll > div > div {
        touch-action: pan-y !important;
      }
      /* Buttons/cards inside the scroll must respond to taps on mobile.
         Uses higher-specificity selectors (2 classes = 0-2-0) to beat the
         wrapper rule above (1 class + 2 elements = 0-1-2). */
      .drawer-scroll .drawer-cta-card,
      .drawer-scroll .drawer-nav-item,
      .drawer-scroll .drawer-section-header,
      .drawer-scroll .drawer-sub-item,
      .drawer-scroll [role="button"] {
        touch-action: manipulation !important;
        -webkit-tap-highlight-color: rgba(0,0,0,0);
        cursor: pointer;
      }
      /* Icon-only mode hover highlight */
      .drawer-icon-only-item:hover {
        background-color: rgba(255,255,255,0.07) !important;
      }
      /* Show scrollbar in sidebar — desktop visible */
      .drawer-scroll {
        scrollbar-width: thin;
        scrollbar-color: rgba(255,255,255,0.28) transparent;
      }
      .drawer-scroll::-webkit-scrollbar {
        width: 6px;
      }
      .drawer-scroll::-webkit-scrollbar-track {
        background: rgba(255,255,255,0.04);
        border-radius: 6px;
        margin: 4px 0;
      }
      .drawer-scroll::-webkit-scrollbar-thumb {
        background: rgba(255,255,255,0.28);
        border-radius: 6px;
        min-height: 40px;
      }
      .drawer-scroll::-webkit-scrollbar-thumb:hover {
        background: rgba(255,255,255,0.50);
      }
      .drawer-scroll::-webkit-scrollbar-thumb:active {
        background: rgba(240,165,0,0.65);
      }
      /* Keyboard focus visible ring */
      .drawer-nav-item:focus-visible,
      .drawer-section-header:focus-visible,
      .drawer-sub-item:focus-visible {
        outline: 2px solid rgba(240,165,0,0.7) !important;
        outline-offset: -2px;
      }
    `;
    document.head.appendChild(style);
  }, []);

  // Animate desktop sidebar width when collapsed/expanded
  useEffect(() => {
    Animated.timing(desktopWidthAnim, {
      toValue: desktopCollapsed ? ICON_ONLY_WIDTH : SIDEBAR_WIDTH,
      duration: 220,
      useNativeDriver: false,
    }).start();
  }, [desktopCollapsed]);

  // Alt+M keyboard shortcut: toggle sidebar
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.altKey && (e.key === 'm' || e.key === 'M')) {
        e.preventDefault();
        if (isDesktop) {
          toggleDesktopSidebar();
        } else {
          toggleLeft();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isDesktop, toggleLeft, toggleDesktopSidebar]);

  // Swipe gesture: swipe right from left edge to open, swipe left to close (web + mobile browser)
  useEffect(() => {
    if (Platform.OS !== 'web' || isDesktop) return;
    let startX = 0;
    let startY = 0;

    const onTouchStart = (e: TouchEvent) => {
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
    };

    const onTouchEnd = (e: TouchEvent) => {
      const dx = e.changedTouches[0].clientX - startX;
      const dy = Math.abs(e.changedTouches[0].clientY - startY);
      // Só aceita gestos predominantemente horizontais
      if (dy > 80) return;
      // Deslizar para a direita a partir da borda esquerda → abrir drawer
      if (!leftOpen && startX < 32 && dx > 55) {
        toggleLeft();
        return;
      }
      // Deslizar para a esquerda quando drawer está aberto → fechar
      if (leftOpen && dx < -55) {
        closeLeft();
      }
    };

    document.addEventListener('touchstart', onTouchStart, { passive: true });
    document.addEventListener('touchend', onTouchEnd, { passive: true });
    return () => {
      document.removeEventListener('touchstart', onTouchStart);
      document.removeEventListener('touchend', onTouchEnd);
    };
  }, [isDesktop, leftOpen, toggleLeft, closeLeft]);

  // Auto-expand any parent item whose child is currently active
  useEffect(() => {
    if (!pathname) return;
    setExpandedNavItems(prev => {
      const updates: Record<string, boolean> = {};
      const allSections = [
        ...RAW_SECTIONS.flatMap(s => s.items),
      ];
      for (const item of allSections) {
        if (item.subItems && item.subItems.some(sub => {
          const r = sub.route.replace('/(main)/', '');
          return pathname.includes(r);
        })) {
          if (!prev[item.route]) updates[item.route] = true;
        }
      }
      return Object.keys(updates).length ? { ...prev, ...updates } : prev;
    });
  }, [pathname]);

  // Auto-expand parent item + descollapsar secção quando o tour avança para um sub-item
  useEffect(() => {
    if (!tourRoute) return;
    // Expandir o item pai cujo subItem corresponde exactamente à rota do tour
    setExpandedNavItems(prev => {
      const updates: Record<string, boolean> = {};
      for (const item of RAW_SECTIONS.flatMap(s => s.items)) {
        if (item.subItems && item.subItems.some(sub => sub.route === tourRoute)) {
          if (!prev[item.route]) updates[item.route] = true;
        }
      }
      return Object.keys(updates).length ? { ...prev, ...updates } : prev;
    });
    // Descollapsar a secção que contém o item do tour (seja item directo ou sub-item)
    setCollapsedSections(prev => {
      const updates: Record<string, boolean> = {};
      for (const section of RAW_SECTIONS) {
        const hasMatch = section.items.some(item =>
          item.route === tourRoute ||
          (item.subItems && item.subItems.some(sub => sub.route === tourRoute))
        );
        if (hasMatch && prev[section.title]) {
          updates[section.title] = false;
        }
      }
      return Object.keys(updates).length ? { ...prev, ...updates } : prev;
    });
  }, [tourRoute]);

  const isActive = (route: string) => {
    const routeName = route.replace('/(main)/', '');
    return pathname.includes(routeName);
  };

  const isCeo = user?.role === 'ceo';
  const isPca = user?.role === 'pca';
  const isAdmin = user?.role === 'admin';
  const isDirector = user?.role === 'director';

  // Polling do contador de solicitações pendentes (apenas CEO)
  useEffect(() => {
    if (!isCeo) return;
    let alive = true;
    const fetchCount = async () => {
      try {
        const tok = (await getAuthToken()) || '';
        const r = await fetch('/api/licenca/solicitacoes/pendentes-count', { headers: tok ? { Authorization: `Bearer ${tok}` } : {} });
        if (r.ok && alive) {
          const d = await r.json();
          setPendentesCount(Number(d.count) || 0);
        }
      } catch {}
    };
    fetchCount();
    const t = setInterval(fetchCount, 30000);
    return () => { alive = false; clearInterval(t); };
  }, [isCeo]);

  const canAccessLicenca = isCeo || isPca || isAdmin || isDirector;

  const isProf = user?.role === 'professor';
  const isAluno = user?.role === 'aluno';
  const isFinanceiro = user?.role === 'financeiro';
  const isSecretaria = user?.role === 'secretaria';
  const isChefeSec = user?.role === 'chefe_secretaria';
  const isRhRole = user?.role === 'rh';
  const isRH = isDirector || isAdmin || isRhRole;
  const isEncarregado = user?.role === 'encarregado';
  const isPedagogico = user?.role === 'pedagogico';
  const isMembroConselhoPed = user?.role === 'membro_conselho_pedagogico';
  const isMembroConselhoEsc = user?.role === 'membro_conselho_escola';

  const { hasPermission } = usePermissoes();

  const ALUNO_SECTIONS: NavSection[] = [
    {
      title: 'Meu Portal',
      items: [
        { label: 'Portal do Estudante', route: '/(main)/portal-estudante', icon: <Ionicons name="grid" size={20} color="inherit" />, permKey: 'portal_estudante' },
      ],
    },
    {
      title: 'Área Pedagógica',
      items: [
        { label: 'Horário', route: '/(main)/horario', icon: <Ionicons name="time" size={20} color="inherit" />, permKey: 'horario' },
        { label: 'Histórico', route: '/(main)/historico', icon: <MaterialCommunityIcons name="chart-timeline-variant" size={20} color="inherit" />, permKey: 'historico' },
        { label: 'Calendário', route: '/(main)/eventos', icon: <Ionicons name="calendar" size={20} color="inherit" />, permKey: 'eventos' },
      ],
    },
    {
      title: 'Financeiro',
      items: [
        { label: 'Pagamentos & Saldo', route: '/(main)/portal-estudante?tab=financeiro', icon: <KzIcon size={20} color="inherit" />, permKey: 'portal_estudante' },
        { label: 'Referências RUPE', route: '/(main)/portal-estudante?tab=rupes', icon: <Ionicons name="receipt" size={20} color="inherit" />, permKey: 'portal_estudante' },
      ],
    },
  ];

  const ENCARREGADO_SECTIONS: NavSection[] = [
    {
      title: 'Portal do Encarregado',
      items: [
        { label: 'Painel do Educando', route: '/(main)/portal-encarregado?tab=painel', icon: <MaterialCommunityIcons name="account-child" size={20} color="inherit" />, permKey: 'portal_encarregado' },
        { label: 'Notas', route: '/(main)/portal-encarregado?tab=notas', icon: <Ionicons name="document-text" size={20} color="inherit" />, permKey: 'portal_encarregado' },
        { label: 'Presenças', route: '/(main)/portal-encarregado?tab=presencas', icon: <Ionicons name="checkmark-circle-outline" size={20} color="inherit" />, permKey: 'portal_encarregado' },
        { label: 'Faltas', route: '/(main)/portal-encarregado?tab=faltas', icon: <Ionicons name="close-circle-outline" size={20} color="inherit" />, permKey: 'portal_encarregado' },
        { label: 'Diário', route: '/(main)/portal-encarregado?tab=diario', icon: <Ionicons name="book-outline" size={20} color="inherit" />, permKey: 'portal_encarregado' },
        { label: 'Horário', route: '/(main)/portal-encarregado?tab=horario', icon: <Ionicons name="time-outline" size={20} color="inherit" />, permKey: 'portal_encarregado' },
        { label: 'Materiais', route: '/(main)/portal-encarregado?tab=materiais', icon: <Ionicons name="library-outline" size={20} color="inherit" />, permKey: 'portal_encarregado' },
        { label: 'Calendário', route: '/(main)/portal-encarregado?tab=calendario', icon: <Ionicons name="calendar-outline" size={20} color="inherit" />, permKey: 'portal_encarregado' },
        { label: 'Financeiro', route: '/(main)/portal-encarregado?tab=financeiro', icon: <MaterialCommunityIcons name="cash" size={20} color="inherit" />, permKey: 'portal_encarregado' },
        { label: 'Mensagens', route: '/(main)/portal-encarregado?tab=mensagens', icon: <Ionicons name="chatbubbles-outline" size={20} color="inherit" />, permKey: 'portal_encarregado' },
      ],
    },
    {
      title: 'Conta',
      items: [
        { label: 'Meu Perfil', route: '/(main)/perfil', icon: <Ionicons name="person-outline" size={20} color="inherit" /> },
      ],
    },
  ];

  const PROFESSOR_SECTIONS: NavSection[] = [
    {
      title: 'Painel do Professor',
      items: [
        { label: 'Meu Painel', route: '/(main)/professor-hub', icon: <Ionicons name="grid" size={20} color="inherit" />, permKey: 'professor_hub' },
      ],
    },
    {
      title: 'Área Pedagógica',
      items: [
        { label: 'Minhas Turmas', route: '/(main)/professor-turmas', icon: <MaterialIcons name="class" size={20} color="inherit" />, permKey: 'professor_turmas' },
        { label: 'Notas & Lançamentos', route: '/(main)/notas', icon: <Ionicons name="document-text" size={20} color="inherit" />, permKey: 'notas' },
        { label: 'Gestão de Pautas', route: '/(main)/professor-pauta', icon: <MaterialCommunityIcons name="file-lock-outline" size={20} color="inherit" />, permKey: 'professor_pauta' },
        { label: 'Horário', route: '/(main)/horario', icon: <Ionicons name="time" size={20} color="inherit" />, permKey: 'horario' },
        { label: 'Sumário / Presenças', route: '/(main)/professor-sumario', icon: <MaterialCommunityIcons name="clipboard-check" size={20} color="inherit" />, permKey: 'professor_sumario' },
        { label: 'Planificações', route: '/(main)/pedagogico?tab=planificacoes', icon: <MaterialCommunityIcons name="clipboard-list" size={20} color="inherit" />, permKey: 'pedagogico' },
        { label: 'Programa Curricular', route: '/(main)/pedagogico?tab=programa', icon: <MaterialCommunityIcons name="book-open-variant" size={20} color="inherit" />, permKey: 'pedagogico' },
        { label: 'Resultados Pedagógicos', route: '/(main)/pedagogico?tab=resultados', icon: <MaterialCommunityIcons name="chart-bar" size={20} color="inherit" />, permKey: 'pedagogico' },
        { label: 'Ocorrências', route: '/(main)/pedagogico?tab=ocorrencias', icon: <MaterialCommunityIcons name="alert-circle-outline" size={20} color="inherit" />, permKey: 'pedagogico' },
        { label: 'Avaliação de Professores', route: '/(main)/avaliacao-professores', icon: <MaterialCommunityIcons name="star-check-outline" size={20} color="inherit" />, permKey: 'avaliacao_professores' },
        { label: 'Biblioteca', route: '/(main)/biblioteca', icon: <Ionicons name="library" size={20} color="inherit" />, permKey: 'biblioteca' },
        { label: 'Trabalhos Finais de Curso', route: '/(main)/trabalhos-finais', icon: <MaterialCommunityIcons name="book-education-outline" size={20} color="inherit" /> },
        { label: 'Calendário', route: '/(main)/eventos', icon: <Ionicons name="calendar" size={20} color="inherit" />, permKey: 'eventos' },
      ],
    },
    {
      title: 'Comunicação',
      items: [
        { label: 'Materiais', route: '/(main)/professor-materiais', icon: <Ionicons name="folder-open" size={20} color="inherit" />, permKey: 'professor_materiais' },
        { label: 'Chat — Conversa Interna', route: '/(main)/chat-interno', icon: <Ionicons name="chatbubbles" size={20} color="inherit" /> },
        { label: 'Portaria — Validar Cartão', route: '/(main)/portaria', icon: <MaterialCommunityIcons name="qrcode-scan" size={20} color="inherit" /> },
      ],
    },
  ];

  const FINANCEIRO_SECTIONS: NavSection[] = [
    {
      title: 'Painel Financeiro',
      items: [
        { label: 'Tesouraria', route: '/(main)/tesouraria', icon: <MaterialCommunityIcons name="finance" size={20} color="inherit" />, permKey: 'financeiro' },
        { label: 'Gestão Financeira', route: '/(main)/financeiro?tab=painel', icon: <MaterialCommunityIcons name="cash" size={20} color="inherit" />, permKey: 'financeiro' },
        { label: 'Resumo Financeiro', route: '/(main)/financeiro?tab=resumo', icon: <MaterialCommunityIcons name="chart-pie" size={20} color="inherit" />, permKey: 'financeiro' },
        { label: 'Em Atraso', route: '/(main)/financeiro?tab=em_atraso', icon: <MaterialCommunityIcons name="alert-circle-outline" size={20} color="inherit" />, permKey: 'financeiro' },
        { label: 'Mensagens', route: '/(main)/financeiro?tab=mensagens', icon: <MaterialCommunityIcons name="message-text-outline" size={20} color="inherit" />, permKey: 'financeiro' },
        { label: 'Por Aluno', route: '/(main)/financeiro?tab=por_aluno', icon: <MaterialCommunityIcons name="account-details" size={20} color="inherit" />, permKey: 'financeiro' },
        { label: 'Pagamentos', route: '/(main)/financeiro?tab=pagamentos', icon: <MaterialCommunityIcons name="cash-multiple" size={20} color="inherit" />, permKey: 'financeiro' },
        { label: 'Rubricas / Taxas', route: '/(main)/financeiro?tab=rubricas', icon: <MaterialCommunityIcons name="format-list-bulleted-type" size={20} color="inherit" />, permKey: 'financeiro' },
        { label: 'Orçamento Anual', route: '/(main)/financeiro?tab=orcamento', icon: <MaterialCommunityIcons name="speedometer" size={20} color="inherit" />, permKey: 'financeiro' },
        { label: 'Pag. por Rubrica', route: '/(main)/financeiro?tab=pag_rubrica', icon: <MaterialCommunityIcons name="layers-outline" size={20} color="inherit" />, permKey: 'financeiro' },
        { label: 'Análise de Resultados', route: '/(main)/financeiro?tab=relatorios', icon: <MaterialCommunityIcons name="chart-bar" size={20} color="inherit" />, permKey: 'financeiro' },
        { label: 'Rel. Financeiros', route: '/(main)/financeiro?tab=relatorios_fin', icon: <MaterialCommunityIcons name="chart-line" size={20} color="inherit" />, permKey: 'financeiro' },
        { label: 'Plano de Contas', route: '/(main)/financeiro?tab=plano_contas', icon: <MaterialCommunityIcons name="file-tree" size={20} color="inherit" />, permKey: 'financeiro' },
        { label: 'Contas a Pagar', route: '/(main)/financeiro?tab=contas_pagar', icon: <MaterialCommunityIcons name="credit-card-clock" size={20} color="inherit" />, permKey: 'financeiro' },
        { label: 'Configuração Fiscal', route: '/(main)/financeiro?tab=config_fiscal', icon: <MaterialCommunityIcons name="file-percent" size={20} color="inherit" />, permKey: 'financeiro' },
        { label: 'Feriados', route: '/(main)/financeiro?tab=feriados', icon: <MaterialCommunityIcons name="calendar-star" size={20} color="inherit" />, permKey: 'financeiro' },
        { label: 'Solicitações de Documentos', route: '/(main)/financeiro?tab=solicitacoes_docs', icon: <MaterialCommunityIcons name="file-document-edit" size={20} color="inherit" />, permKey: 'financeiro' },
        { label: 'Fecho de Caixa', route: '/(main)/financeiro?tab=fecho_caixa', icon: <MaterialCommunityIcons name="lock-check-outline" size={20} color="inherit" />, permKey: 'financeiro' },
        { label: 'Hub de Pagamentos', route: '/(main)/pagamentos-hub', icon: <KzIcon size={20} color="inherit" />, permKey: 'financeiro' },
        { label: 'Portaria — Validar Cartão', route: '/(main)/portaria', icon: <MaterialCommunityIcons name="qrcode-scan" size={20} color="inherit" />, permKey: 'secretaria_hub' },
        { label: 'Documentos & Multicaixa', route: '/(main)/documentos-hub', icon: <MaterialCommunityIcons name="file-document-multiple" size={20} color="inherit" />, permKey: 'financeiro' },
        { label: 'Extracto de Propinas', route: '/(main)/extrato-propinas', icon: <FontAwesome5 name="file-invoice-dollar" size={20} color="inherit" /> },
        { label: 'Histórico de RUPEs', route: '/(main)/rupes-historico', icon: <Ionicons name="receipt" size={20} color="inherit" /> },
        { label: 'Bolsas & Descontos', route: '/(main)/bolsas', icon: <MaterialCommunityIcons name="school-outline" size={20} color="inherit" />, permKey: 'financeiro' },
      ],
    },
  ];

  const RH_SECTIONS: NavSection[] = [
    {
      title: 'Recursos Humanos · Pessoal',
      items: [
        { label: 'Gestão de Pessoal', route: '/(main)/rh-controle?tab=pessoal', icon: <MaterialCommunityIcons name="account-group" size={20} color="inherit" />, permKey: 'rh_hub' },
        { label: 'Sumários (RH)', route: '/(main)/rh-controle?tab=sumarios', icon: <MaterialCommunityIcons name="clipboard-text-outline" size={20} color="inherit" />, permKey: 'rh_hub' },
        { label: 'Solicitações de Pessoal', route: '/(main)/rh-controle?tab=solicitacoes', icon: <MaterialCommunityIcons name="email-outline" size={20} color="inherit" />, permKey: 'rh_hub' },
        { label: 'Calendário de Provas', route: '/(main)/rh-controle?tab=calendario', icon: <MaterialCommunityIcons name="calendar-check-outline" size={20} color="inherit" />, permKey: 'rh_hub' },
      ],
    },
    {
      title: 'Faltas & Tempos',
      items: [
        { label: 'Faltas dos Funcionários', route: '/(main)/rh-faltas-tempos?tab=faltas', icon: <MaterialCommunityIcons name="calendar-remove" size={20} color="inherit" />, permKey: 'rh_hub' },
        { label: 'Faltas dos Professores', route: '/(main)/rh-faltas-tempos?tab=professores', icon: <MaterialCommunityIcons name="account-tie" size={20} color="inherit" />, permKey: 'rh_hub' },
        { label: 'Administração de Faltas', route: '/(main)/rh-faltas-tempos?tab=admin', icon: <MaterialCommunityIcons name="shield-account" size={20} color="inherit" />, permKey: 'rh_hub' },
        { label: 'Configuração de Faltas', route: '/(main)/rh-faltas-tempos?tab=configuracao', icon: <MaterialCommunityIcons name="cog-outline" size={20} color="inherit" />, permKey: 'rh_hub' },
        { label: 'Sumários (Faltas)', route: '/(main)/rh-faltas-tempos?tab=sumarios', icon: <MaterialCommunityIcons name="clipboard-check-outline" size={20} color="inherit" />, permKey: 'rh_hub' },
        { label: 'Relatórios de Faltas', route: '/(main)/rh-faltas-tempos?tab=relatorios', icon: <MaterialCommunityIcons name="chart-box-outline" size={20} color="inherit" />, permKey: 'rh_hub' },
      ],
    },
    {
      title: 'Folha Salarial',
      items: [
        { label: 'Painel da Folha', route: '/(main)/rh-payroll?tab=painel', icon: <MaterialCommunityIcons name="cash-multiple" size={20} color="inherit" />, permKey: 'rh_hub' },
        { label: 'Folhas de Pagamento', route: '/(main)/rh-payroll?tab=folhas', icon: <MaterialCommunityIcons name="receipt" size={20} color="inherit" />, permKey: 'rh_hub' },
        { label: 'Funcionários (Folha)', route: '/(main)/rh-payroll?tab=funcionarios', icon: <MaterialCommunityIcons name="account-cash" size={20} color="inherit" />, permKey: 'rh_hub' },
      ],
    },
    {
      title: 'Controlo',
      items: [
        { label: 'Sumários', route: '/(main)/professor-sumario', icon: <MaterialCommunityIcons name="clipboard-check" size={20} color="inherit" />, permKey: 'professor_sumario' },
        { label: 'Calendário Académico', route: '/(main)/calendario-academico', icon: <Ionicons name="calendar" size={20} color="inherit" />, permKey: 'eventos' },
        { label: 'Portaria — Validar Cartão', route: '/(main)/portaria', icon: <MaterialCommunityIcons name="qrcode-scan" size={20} color="inherit" /> },
      ],
    },
  ];

  const SECRETARIA_SECTIONS: NavSection[] = [
    {
      title: 'Secretaria',
      items: [
        { label: 'Painel da Secretaria', route: '/(main)/secretaria-hub?tab=visao', icon: <Ionicons name="grid" size={20} color="inherit" />, permKey: 'secretaria_hub' },
        { label: 'Consulta de Aluno', route: '/(main)/consulta-aluno', icon: <MaterialCommunityIcons name="account-search" size={20} color="inherit" />, permKey: 'consultar_aluno' },
        { label: 'Pautas (Hub)', route: '/(main)/secretaria-hub?tab=pautas', icon: <Ionicons name="ribbon" size={20} color="inherit" />, permKey: 'secretaria_hub' },
        { label: 'Cursos (Hub)', route: '/(main)/secretaria-hub?tab=cursos', icon: <Ionicons name="school" size={20} color="inherit" />, permKey: 'secretaria_hub' },
        { label: 'Documentos (Hub)', route: '/(main)/secretaria-hub?tab=documentos', icon: <Ionicons name="document-text" size={20} color="inherit" />, permKey: 'secretaria_hub' },
        { label: 'Justif. de Faltas', route: '/(main)/secretaria-hub?tab=justificacoes', icon: <Ionicons name="clipboard" size={20} color="inherit" />, permKey: 'secretaria_hub' },
        { label: 'Processo de Admissão', route: '/(main)/admissao', icon: <MaterialCommunityIcons name="account-school" size={20} color="inherit" />, permKey: 'admissao' },
        { label: 'Organizar Alunos em Turmas', route: '/(main)/organizar-turmas', icon: <MaterialCommunityIcons name="account-group" size={20} color="inherit" />, permKey: 'admissao' },
        { label: 'Matrícula em Lote', route: '/(main)/matricula-lote', icon: <MaterialCommunityIcons name="account-multiple-plus" size={20} color="inherit" />, permKey: 'alunos' },
        { label: 'Rematrícula em Lote', route: '/(main)/rematricula-lote', icon: <MaterialCommunityIcons name="account-multiple-check" size={20} color="inherit" />, permKey: 'alunos' },
        { label: 'Estatísticas de Matrículas', route: '/(main)/estatisticas-matriculas', icon: <Ionicons name="bar-chart" size={20} color="inherit" />, permKey: 'secretaria_hub' },
        { label: 'Hub de Pagamentos', route: '/(main)/pagamentos-hub', icon: <KzIcon size={20} color="inherit" />, permKey: 'financeiro' },
        { label: 'Portaria — Validar Cartão', route: '/(main)/portaria', icon: <MaterialCommunityIcons name="qrcode-scan" size={20} color="inherit" />, permKey: 'secretaria_hub' },
        { label: 'Editor de Documentos', route: '/(main)/editor-documentos', icon: <Ionicons name="newspaper" size={20} color="inherit" />, permKey: 'editor_documentos' },
        { label: 'Arquivo de Documentos', route: '/(main)/arquivo-documentos', icon: <MaterialCommunityIcons name="folder-multiple" size={20} color="inherit" />, permKey: 'arquivo_documentos' },
        { label: 'Arquivo de Pautas', route: '/(main)/arquivo-pautas', icon: <MaterialCommunityIcons name="archive-outline" size={20} color="inherit" />, permKey: 'pedagogico' },
        { label: 'Exame Nacional', route: '/(main)/exame-nacional', icon: <MaterialCommunityIcons name="certificate-outline" size={20} color="inherit" />, permKey: 'pedagogico' },
        { label: 'Exame de Recurso', route: '/(main)/exame-recurso', icon: <MaterialCommunityIcons name="refresh-circle" size={20} color="inherit" />, permKey: 'pedagogico' },
        { label: 'Melhoria de Nota', route: '/(main)/melhoria-nota', icon: <MaterialCommunityIcons name="trending-up" size={20} color="inherit" />, permKey: 'pedagogico' },
        { label: 'Pedido de Reapreciação', route: '/(main)/pedidos-reapreciacao', icon: <MaterialCommunityIcons name="file-document-edit-outline" size={20} color="inherit" />, permKey: 'pedagogico' },
        { label: 'Conselho de Avaliação', route: '/(main)/conselho', icon: <MaterialCommunityIcons name="account-group" size={20} color="inherit" />, permKey: 'pedagogico' },
        { label: 'Avaliação Diagnóstica', route: '/(main)/diagnostica', icon: <MaterialCommunityIcons name="clipboard-pulse-outline" size={20} color="inherit" />, permKey: 'pedagogico' },
        { label: 'Avaliação Formativa', route: '/(main)/formativa', icon: <MaterialCommunityIcons name="chart-bar" size={20} color="inherit" />, permKey: 'pedagogico' },
      ],
    },
    {
      title: 'Gestão Académica',
      items: [
        { label: 'Alunos', route: '/(main)/alunos', icon: <Ionicons name="people" size={20} color="inherit" />, permKey: 'alunos' },
        { label: 'Transferências', route: '/(main)/transferencias', icon: <MaterialCommunityIcons name="transfer" size={20} color="inherit" />, permKey: 'transferencias' },
        { label: 'Professores', route: '/(main)/professores', icon: <FontAwesome5 name="chalkboard-teacher" size={18} color="inherit" />, permKey: 'professores' },
        { label: 'Turmas', route: '/(main)/turmas', icon: <MaterialIcons name="class" size={20} color="inherit" />, permKey: 'turmas' },
        { label: 'Salas de Aula', route: '/(main)/salas', icon: <MaterialCommunityIcons name="door-open" size={20} color="inherit" />, permKey: 'salas' },
        { label: 'Presenças', route: '/(main)/presencas', icon: <Ionicons name="checkmark-circle-outline" size={20} color="inherit" />, permKey: 'presencas' },
        { label: 'Notas & Pautas', route: '/(main)/notas', icon: <Ionicons name="document-text" size={20} color="inherit" />, permKey: 'notas' },
        { label: 'Horário', route: '/(main)/horario', icon: <Ionicons name="time" size={20} color="inherit" />, permKey: 'horario' },
        { label: 'Histórico', route: '/(main)/historico', icon: <MaterialCommunityIcons name="chart-timeline-variant" size={20} color="inherit" />, permKey: 'historico' },
        { label: 'Disciplinas', route: '/(main)/disciplinas', icon: <MaterialCommunityIcons name="book-outline" size={20} color="inherit" />, permKey: 'disciplinas' },
        { label: 'Gestão de Cursos', route: '/(main)/admin?section=cursos&group=academico', icon: <MaterialCommunityIcons name="book-open-variant" size={20} color="inherit" />, permKey: 'gestao_academica' },
        { label: 'Biblioteca', route: '/(main)/biblioteca', icon: <Ionicons name="library" size={20} color="inherit" />, permKey: 'biblioteca' },
        { label: 'Trabalhos Finais de Curso', route: '/(main)/trabalhos-finais', icon: <MaterialCommunityIcons name="book-education-outline" size={20} color="inherit" /> },
        { label: 'Estudantes Finalistas', route: '/(main)/finalistas', icon: <MaterialCommunityIcons name="school" size={20} color="inherit" /> },
        { label: 'Antigos Alunos (Alumni)', route: '/(main)/alumni', icon: <MaterialCommunityIcons name="account-group-outline" size={20} color="inherit" /> },
      ],
    },
    {
      title: 'Planeamento',
      items: [
        { label: 'Calendário Académico', route: '/(main)/calendario-academico', icon: <MaterialCommunityIcons name="calendar-month" size={20} color="inherit" />, permKey: 'eventos' },
        { label: 'Eventos Escolares', route: '/(main)/eventos', icon: <Ionicons name="calendar" size={20} color="inherit" />, permKey: 'eventos' },
        { label: 'Calendário de Provas', route: '/(main)/pedagogico?tab=provas', icon: <MaterialCommunityIcons name="calendar-check" size={20} color="inherit" />, permKey: 'pedagogico' },
        { label: 'Grelha Curricular', route: '/(main)/grelha', icon: <Ionicons name="library" size={20} color="inherit" />, permKey: 'grelha' },
      ],
    },
    {
      title: 'Análise',
      items: [
        { label: 'Visão Geral Multi-Ano', route: '/(main)/visao-geral', icon: <MaterialCommunityIcons name="chart-line" size={20} color="inherit" />, permKey: 'visao_geral' },
        { label: 'Relatórios', route: '/(main)/relatorios', icon: <Ionicons name="bar-chart" size={20} color="inherit" />, permKey: 'relatorios' },
      ],
    },
    {
      title: 'Financeiro',
      items: [
        { label: 'Portaria — Validar Cartão', route: '/(main)/portaria', icon: <MaterialCommunityIcons name="qrcode-scan" size={20} color="inherit" />, permKey: 'secretaria_hub' },
        { label: 'Pagamentos', route: '/(main)/financeiro', icon: <MaterialCommunityIcons name="cash" size={20} color="inherit" />, permKey: 'financeiro' },
        { label: 'Hub de Pagamentos', route: '/(main)/pagamentos-hub', icon: <KzIcon size={20} color="inherit" />, permKey: 'financeiro' },
        { label: 'Bolsas & Descontos', route: '/(main)/bolsas', icon: <MaterialCommunityIcons name="school-outline" size={20} color="inherit" />, permKey: 'financeiro' },
      ],
    },
    {
      title: 'Recursos Humanos',
      items: [
        {
          label: 'Recursos Humanos', route: '/(main)/rh-hub', icon: <MaterialCommunityIcons name="account-tie" size={20} color="inherit" />, permKey: 'rh_hub',
          subItems: [
            { label: 'Gestão de Pessoal', route: '/(main)/rh-controle', icon: <MaterialCommunityIcons name="account-group" size={18} color="inherit" />, permKey: 'rh_hub' },
            { label: 'Faltas & Remunerações', route: '/(main)/rh-faltas-tempos', icon: <MaterialCommunityIcons name="calendar-remove" size={18} color="inherit" />, permKey: 'rh_hub' },
            { label: 'Folha de Salários', route: '/(main)/rh-payroll', icon: <MaterialCommunityIcons name="cash-multiple" size={18} color="inherit" />, permKey: 'rh_hub' },
          ],
        },
      ],
    },
  ];

  const CEO_PCA_SECTIONS: NavSection[] = [
    {
      title: isCeo ? 'Painel CEO' : 'Principal',
      items: [
        ...(isCeo ? [{ label: 'Painel CEO (Subscrição)', route: '/(main)/ceo', icon: <MaterialCommunityIcons name="crown" size={20} color="inherit" />, permKey: 'ceo_dashboard' as PermKey }] : []),
        { label: 'Dashboard Escolar', route: '/(main)/dashboard', icon: <Ionicons name="grid" size={20} color="inherit" />, permKey: 'dashboard' },
      ],
    },
    {
      title: 'Secretaria',
      items: [
        { label: 'Painel da Secretaria', route: '/(main)/secretaria-hub?tab=visao', icon: <Ionicons name="grid" size={20} color="inherit" />, permKey: 'secretaria_hub' },
        { label: 'Calendário Académico', route: '/(main)/calendario-academico', icon: <MaterialCommunityIcons name="calendar-month" size={20} color="inherit" />, permKey: 'eventos' },
        { label: 'Eventos Escolares', route: '/(main)/eventos', icon: <Ionicons name="calendar" size={20} color="inherit" />, permKey: 'eventos' },
        {
          label: 'Área Pedagógica', route: '/(main)/pedagogico', icon: <MaterialCommunityIcons name="clipboard-list" size={20} color="inherit" />, permKey: 'pedagogico',
          subItems: [
            { label: 'Alunos', route: '/(main)/alunos', icon: <Ionicons name="people" size={18} color="inherit" />, permKey: 'alunos' },
            { label: 'Processo de Admissão', route: '/(main)/admissao', icon: <MaterialCommunityIcons name="account-school" size={18} color="inherit" />, permKey: 'admissao' },
            { label: 'Transferências', route: '/(main)/transferencias', icon: <MaterialCommunityIcons name="transfer" size={18} color="inherit" />, permKey: 'transferencias' },
            { label: 'Professores', route: '/(main)/professores', icon: <FontAwesome5 name="chalkboard-teacher" size={16} color="inherit" />, permKey: 'professores' },
            { label: 'Turmas', route: '/(main)/turmas', icon: <MaterialIcons name="class" size={18} color="inherit" />, permKey: 'turmas' },
            { label: 'Salas de Aula', route: '/(main)/salas', icon: <MaterialCommunityIcons name="door-open" size={18} color="inherit" />, permKey: 'salas' },
            { label: 'Notas', route: '/(main)/notas', icon: <Ionicons name="document-text" size={18} color="inherit" />, permKey: 'notas' },
            { label: 'Presenças', route: '/(main)/presencas', icon: <Ionicons name="checkmark-circle-outline" size={18} color="inherit" />, permKey: 'presencas' },
            { label: 'Horário', route: '/(main)/horario', icon: <Ionicons name="time" size={18} color="inherit" />, permKey: 'horario' },
            { label: 'Histórico', route: '/(main)/historico', icon: <MaterialCommunityIcons name="chart-timeline-variant" size={18} color="inherit" />, permKey: 'historico' },
            { label: 'Grelha Curricular', route: '/(main)/grelha', icon: <Ionicons name="library" size={18} color="inherit" />, permKey: 'grelha' },
            { label: 'Biblioteca', route: '/(main)/biblioteca', icon: <Ionicons name="library" size={18} color="inherit" />, permKey: 'biblioteca' },
            { label: 'Trabalhos Finais de Curso', route: '/(main)/trabalhos-finais', icon: <MaterialCommunityIcons name="book-education-outline" size={18} color="inherit" /> },
            { label: 'Avaliação de Professores', route: '/(main)/avaliacao-professores', icon: <MaterialCommunityIcons name="star-check-outline" size={18} color="inherit" />, permKey: 'avaliacao_professores' },
            { label: 'Disciplinas', route: '/(main)/disciplinas', icon: <MaterialCommunityIcons name="book-outline" size={18} color="inherit" />, permKey: 'disciplinas' },
            { label: 'Exclusões & Faltas', route: '/(main)/exclusoes-faltas', icon: <MaterialCommunityIcons name="account-cancel" size={18} color="inherit" />, permKey: 'pedagogico' },
            { label: 'Quadro de Honra', route: '/(main)/quadro-honra', icon: <MaterialCommunityIcons name="trophy" size={18} color="inherit" />, permKey: 'pedagogico' },
            { label: 'Estudantes Finalistas', route: '/(main)/finalistas', icon: <MaterialCommunityIcons name="school" size={18} color="inherit" /> },
            { label: 'Antigos Alunos (Alumni)', route: '/(main)/alumni', icon: <MaterialCommunityIcons name="account-group-outline" size={18} color="inherit" /> },
            { label: 'Acompanhamento de Pautas', route: '/(main)/acompanhamento-pautas', icon: <MaterialCommunityIcons name="file-clock-outline" size={18} color="inherit" />, permKey: 'pedagogico' },
            { label: 'Exame Extraordinário', route: '/(main)/exame-extraordinario', icon: <MaterialCommunityIcons name="file-document-alert-outline" size={18} color="inherit" />, permKey: 'pedagogico' },
            { label: 'Exame Nacional', route: '/(main)/exame-nacional', icon: <MaterialCommunityIcons name="certificate-outline" size={18} color="inherit" />, permKey: 'pedagogico' },
            { label: 'Arquivo de Pautas', route: '/(main)/arquivo-pautas', icon: <MaterialCommunityIcons name="archive-outline" size={18} color="inherit" />, permKey: 'pedagogico' },
            { label: 'Exame de Recurso', route: '/(main)/exame-recurso', icon: <MaterialCommunityIcons name="refresh-circle" size={18} color="inherit" />, permKey: 'pedagogico' },
            { label: 'Melhoria de Nota', route: '/(main)/melhoria-nota', icon: <MaterialCommunityIcons name="trending-up" size={18} color="inherit" />, permKey: 'pedagogico' },
            { label: 'Pedido de Reapreciação', route: '/(main)/pedidos-reapreciacao', icon: <MaterialCommunityIcons name="file-document-edit-outline" size={18} color="inherit" />, permKey: 'pedagogico' },
            { label: 'Conselho de Avaliação', route: '/(main)/conselho', icon: <MaterialCommunityIcons name="account-group" size={18} color="inherit" />, permKey: 'pedagogico' },
            { label: 'Avaliação Diagnóstica', route: '/(main)/diagnostica', icon: <MaterialCommunityIcons name="clipboard-pulse-outline" size={18} color="inherit" />, permKey: 'pedagogico' },
            { label: 'Avaliação Formativa', route: '/(main)/formativa', icon: <MaterialCommunityIcons name="chart-bar" size={18} color="inherit" />, permKey: 'pedagogico' },
          ],
        },
        { label: 'Consulta de Aluno', route: '/(main)/consulta-aluno', icon: <MaterialCommunityIcons name="account-search" size={20} color="inherit" />, permKey: 'consultar_aluno' },
        { label: 'Editor de Documentos', route: '/(main)/editor-documentos', icon: <Ionicons name="newspaper" size={20} color="inherit" />, permKey: 'editor_documentos' },
        { label: 'Arquivo de Documentos', route: '/(main)/arquivo-documentos', icon: <MaterialCommunityIcons name="folder-multiple" size={20} color="inherit" />, permKey: 'arquivo_documentos' },
      ],
    },
    {
      title: 'Análise',
      items: [
        { label: 'Visão Geral Multi-Ano', route: '/(main)/visao-geral', icon: <MaterialCommunityIcons name="chart-line" size={20} color="inherit" />, permKey: 'visao_geral' },
        { label: 'Relatórios', route: '/(main)/relatorios', icon: <Ionicons name="bar-chart" size={20} color="inherit" />, permKey: 'relatorios' },
      ],
    },
    {
      title: 'Financeiro',
      items: [
        { label: 'Tesouraria', route: '/(main)/tesouraria', icon: <MaterialCommunityIcons name="finance" size={20} color="inherit" /> },
        {
          label: 'Módulo Financeiro', route: '/(main)/financeiro', icon: <MaterialCommunityIcons name="cash" size={20} color="inherit" />, permKey: 'financeiro',
          subItems: [
            { label: 'Extracto de Propinas', route: '/(main)/extrato-propinas', icon: <FontAwesome5 name="file-invoice-dollar" size={16} color="inherit" /> },
            { label: 'Bolsas & Descontos', route: '/(main)/bolsas', icon: <MaterialCommunityIcons name="school-outline" size={18} color="inherit" />, permKey: 'financeiro' },
            { label: 'Histórico de RUPEs', route: '/(main)/rupes-historico', icon: <Ionicons name="receipt" size={18} color="inherit" /> },
            { label: 'Pag. por Rubrica', route: '/(main)/financeiro?tab=pag_rubrica', icon: <MaterialCommunityIcons name="layers-outline" size={16} color="inherit" />, permKey: 'financeiro' },
          ],
        },
      ],
    },
    {
      title: 'Recursos Humanos',
      items: [
        {
          label: 'Recursos Humanos', route: '/(main)/rh-hub', icon: <MaterialCommunityIcons name="account-tie" size={20} color="inherit" />, permKey: 'rh_hub',
          subItems: [
            { label: 'Gestão de Pessoal', route: '/(main)/rh-controle', icon: <MaterialCommunityIcons name="account-group" size={18} color="inherit" />, permKey: 'rh_hub' },
            { label: 'Faltas & Remunerações', route: '/(main)/rh-faltas-tempos', icon: <MaterialCommunityIcons name="calendar-remove" size={18} color="inherit" />, permKey: 'rh_hub' },
            { label: 'Folha de Salários', route: '/(main)/rh-payroll', icon: <MaterialCommunityIcons name="cash-multiple" size={18} color="inherit" />, permKey: 'rh_hub' },
          ],
        },
      ],
    },
    {
      title: 'Administração · Académico',
      items: [
        { label: 'Matrículas Pendentes', route: '/(main)/admin?section=matriculas&group=academico', icon: <MaterialCommunityIcons name="account-plus" size={20} color="inherit" />, permKey: 'admin' },
        { label: 'Gestão de Cursos', route: '/(main)/admin?section=cursos&group=academico', icon: <MaterialCommunityIcons name="book-open-variant" size={20} color="inherit" />, permKey: 'admin' },
        { label: 'Disciplinas (Admin)', route: '/(main)/admin?section=disciplinas&group=academico', icon: <MaterialCommunityIcons name="book-outline" size={20} color="inherit" />, permKey: 'admin' },
        { label: 'Ano Académico', route: '/(main)/admin?section=anos&group=academico', icon: <Ionicons name="calendar" size={20} color="inherit" />, permKey: 'admin' },
        { label: 'Reabertura de Notas', route: '/(main)/admin?section=reabertura&group=academico', icon: <MaterialCommunityIcons name="lock-open-variant" size={20} color="inherit" />, permKey: 'admin' },
        { label: 'Lançamento de Notas', route: '/(main)/admin?section=solicit_avaliacao&group=academico', icon: <MaterialCommunityIcons name="key-variant" size={20} color="inherit" />, permKey: 'admin' },
      ],
    },
    {
      title: 'Administração · Pessoal & Acesso',
      items: [
        { label: 'Utilizadores', route: '/(main)/admin?section=usuarios&group=pessoal', icon: <Ionicons name="people" size={20} color="inherit" />, permKey: 'admin' },
        { label: 'Permissões / Acessos', route: '/(main)/admin?section=acessos&group=pessoal', icon: <MaterialCommunityIcons name="account-key" size={20} color="inherit" />, permKey: 'admin' },
        { label: 'Perfis Pendentes', route: '/(main)/perfis-pendentes', icon: <MaterialCommunityIcons name="account-clock" size={20} color="inherit" />, permKey: 'perfis_pendentes' as PermKey },
      ],
    },
    {
      title: 'Administração · Sistema',
      items: [
        ...(isCeo ? [{ label: 'Configuração da Escola', route: '/(main)/admin?section=escola&group=sistema', icon: <Ionicons name="school" size={20} color="inherit" />, permKey: 'admin' as PermKey }] : []),
        { label: 'Configurações Gerais', route: '/(main)/admin?section=config&group=sistema', icon: <Ionicons name="settings" size={20} color="inherit" />, permKey: 'admin' as PermKey },
        { label: 'Comunicações', route: '/(main)/admin?section=comunicacoes&group=sistema', icon: <Ionicons name="megaphone" size={20} color="inherit" />, permKey: 'admin' as PermKey },
        { label: 'Segurança & Backups', route: '/(main)/admin?section=seguranca&group=sistema', icon: <Ionicons name="shield-checkmark" size={20} color="inherit" />, permKey: 'admin' as PermKey },
      ],
    },
  ];

  const ADMIN_DIRECTOR_SECTIONS: NavSection[] = [
    {
      title: 'Principal',
      items: [
        { label: 'Dashboard', route: '/(main)/dashboard', icon: <Ionicons name="grid" size={20} color="inherit" />, permKey: 'dashboard' },
      ],
    },
    {
      title: 'Secretaria',
      items: [
        { label: 'Painel da Secretaria', route: '/(main)/secretaria-hub?tab=visao', icon: <Ionicons name="grid" size={20} color="inherit" />, permKey: 'secretaria_hub' },
        { label: 'Calendário Académico', route: '/(main)/calendario-academico', icon: <MaterialCommunityIcons name="calendar-month" size={20} color="inherit" />, permKey: 'eventos' },
        { label: 'Eventos Escolares', route: '/(main)/eventos', icon: <Ionicons name="calendar" size={20} color="inherit" />, permKey: 'eventos' },
        {
          label: 'Área Pedagógica', route: '/(main)/pedagogico', icon: <MaterialCommunityIcons name="clipboard-list" size={20} color="inherit" />, permKey: 'pedagogico',
          subItems: [
            { label: 'Alunos', route: '/(main)/alunos', icon: <Ionicons name="people" size={18} color="inherit" />, permKey: 'alunos' },
            { label: 'Processo de Admissão', route: '/(main)/admissao', icon: <MaterialCommunityIcons name="account-school" size={18} color="inherit" />, permKey: 'admissao' },
            { label: 'Transferências', route: '/(main)/transferencias', icon: <MaterialCommunityIcons name="transfer" size={18} color="inherit" />, permKey: 'transferencias' },
            { label: 'Professores', route: '/(main)/professores', icon: <FontAwesome5 name="chalkboard-teacher" size={16} color="inherit" />, permKey: 'professores' },
            { label: 'Turmas', route: '/(main)/turmas', icon: <MaterialIcons name="class" size={18} color="inherit" />, permKey: 'turmas' },
            { label: 'Salas de Aula', route: '/(main)/salas', icon: <MaterialCommunityIcons name="door-open" size={18} color="inherit" />, permKey: 'salas' },
            { label: 'Notas', route: '/(main)/notas', icon: <Ionicons name="document-text" size={18} color="inherit" />, permKey: 'notas' },
            { label: 'Presenças', route: '/(main)/presencas', icon: <Ionicons name="checkmark-circle-outline" size={18} color="inherit" />, permKey: 'presencas' },
            { label: 'Horário', route: '/(main)/horario', icon: <Ionicons name="time" size={18} color="inherit" />, permKey: 'horario' },
            { label: 'Histórico', route: '/(main)/historico', icon: <MaterialCommunityIcons name="chart-timeline-variant" size={18} color="inherit" />, permKey: 'historico' },
            { label: 'Grelha Curricular', route: '/(main)/grelha', icon: <Ionicons name="library" size={18} color="inherit" />, permKey: 'grelha' },
            { label: 'Biblioteca', route: '/(main)/biblioteca', icon: <Ionicons name="library" size={18} color="inherit" />, permKey: 'biblioteca' },
            { label: 'Trabalhos Finais de Curso', route: '/(main)/trabalhos-finais', icon: <MaterialCommunityIcons name="book-education-outline" size={18} color="inherit" /> },
            { label: 'Avaliação de Professores', route: '/(main)/avaliacao-professores', icon: <MaterialCommunityIcons name="star-check-outline" size={18} color="inherit" />, permKey: 'avaliacao_professores' },
            { label: 'Disciplinas', route: '/(main)/disciplinas', icon: <MaterialCommunityIcons name="book-outline" size={18} color="inherit" />, permKey: 'disciplinas' },
            { label: 'Exclusões & Faltas', route: '/(main)/exclusoes-faltas', icon: <MaterialCommunityIcons name="account-cancel" size={18} color="inherit" />, permKey: 'pedagogico' },
            { label: 'Quadro de Honra', route: '/(main)/quadro-honra', icon: <MaterialCommunityIcons name="trophy" size={18} color="inherit" />, permKey: 'pedagogico' },
            { label: 'Estudantes Finalistas', route: '/(main)/finalistas', icon: <MaterialCommunityIcons name="school" size={18} color="inherit" /> },
            { label: 'Antigos Alunos (Alumni)', route: '/(main)/alumni', icon: <MaterialCommunityIcons name="account-group-outline" size={18} color="inherit" /> },
            { label: 'Acompanhamento de Pautas', route: '/(main)/acompanhamento-pautas', icon: <MaterialCommunityIcons name="file-clock-outline" size={18} color="inherit" />, permKey: 'pedagogico' },
            { label: 'Exame Extraordinário', route: '/(main)/exame-extraordinario', icon: <MaterialCommunityIcons name="file-document-alert-outline" size={18} color="inherit" />, permKey: 'pedagogico' },
            { label: 'Exame Nacional', route: '/(main)/exame-nacional', icon: <MaterialCommunityIcons name="certificate-outline" size={18} color="inherit" />, permKey: 'pedagogico' },
            { label: 'Arquivo de Pautas', route: '/(main)/arquivo-pautas', icon: <MaterialCommunityIcons name="archive-outline" size={18} color="inherit" />, permKey: 'pedagogico' },
            { label: 'Exame de Recurso', route: '/(main)/exame-recurso', icon: <MaterialCommunityIcons name="refresh-circle" size={18} color="inherit" />, permKey: 'pedagogico' },
            { label: 'Melhoria de Nota', route: '/(main)/melhoria-nota', icon: <MaterialCommunityIcons name="trending-up" size={18} color="inherit" />, permKey: 'pedagogico' },
            { label: 'Pedido de Reapreciação', route: '/(main)/pedidos-reapreciacao', icon: <MaterialCommunityIcons name="file-document-edit-outline" size={18} color="inherit" />, permKey: 'pedagogico' },
            { label: 'Conselho de Avaliação', route: '/(main)/conselho', icon: <MaterialCommunityIcons name="account-group" size={18} color="inherit" />, permKey: 'pedagogico' },
            { label: 'Avaliação Diagnóstica', route: '/(main)/diagnostica', icon: <MaterialCommunityIcons name="clipboard-pulse-outline" size={18} color="inherit" />, permKey: 'pedagogico' },
            { label: 'Avaliação Formativa', route: '/(main)/formativa', icon: <MaterialCommunityIcons name="chart-bar" size={18} color="inherit" />, permKey: 'pedagogico' },
          ],
        },
        { label: 'Consulta de Aluno', route: '/(main)/consulta-aluno', icon: <MaterialCommunityIcons name="account-search" size={20} color="inherit" />, permKey: 'consultar_aluno' },
        { label: 'Editor de Documentos', route: '/(main)/editor-documentos', icon: <Ionicons name="newspaper" size={20} color="inherit" />, permKey: 'editor_documentos' },
        { label: 'Arquivo de Documentos', route: '/(main)/arquivo-documentos', icon: <MaterialCommunityIcons name="folder-multiple" size={20} color="inherit" />, permKey: 'arquivo_documentos' },
      ],
    },
    {
      title: 'Análise',
      items: [
        { label: 'Visão Geral Multi-Ano', route: '/(main)/visao-geral', icon: <MaterialCommunityIcons name="chart-line" size={20} color="inherit" />, permKey: 'visao_geral' },
        { label: 'Relatórios', route: '/(main)/relatorios', icon: <Ionicons name="bar-chart" size={20} color="inherit" />, permKey: 'relatorios' },
      ],
    },
    {
      title: 'Financeiro',
      items: [
        { label: 'Tesouraria', route: '/(main)/tesouraria', icon: <MaterialCommunityIcons name="finance" size={20} color="inherit" /> },
        {
          label: 'Módulo Financeiro', route: '/(main)/financeiro', icon: <MaterialCommunityIcons name="cash" size={20} color="inherit" />, permKey: 'financeiro',
          subItems: [
            { label: 'Extracto de Propinas', route: '/(main)/extrato-propinas', icon: <FontAwesome5 name="file-invoice-dollar" size={16} color="inherit" /> },
            { label: 'Bolsas & Descontos', route: '/(main)/bolsas', icon: <MaterialCommunityIcons name="school-outline" size={18} color="inherit" />, permKey: 'financeiro' },
            { label: 'Pag. por Rubrica', route: '/(main)/financeiro?tab=pag_rubrica', icon: <MaterialCommunityIcons name="layers-outline" size={16} color="inherit" />, permKey: 'financeiro' },
          ],
        },
        { label: 'Histórico de RUPEs', route: '/(main)/rupes-historico', icon: <Ionicons name="receipt" size={20} color="inherit" /> },
      ],
    },
    ...(isRH ? [{
      title: 'Recursos Humanos',
      items: [{
        label: 'Recursos Humanos', route: '/(main)/rh-hub', icon: <MaterialCommunityIcons name="account-tie" size={20} color="inherit" />, permKey: 'rh_hub' as PermKey,
        subItems: [
          { label: 'Gestão de Pessoal', route: '/(main)/rh-controle', icon: <MaterialCommunityIcons name="account-group" size={18} color="inherit" />, permKey: 'rh_controle' as PermKey },
          { label: 'Faltas & Remunerações', route: '/(main)/rh-faltas-tempos', icon: <MaterialCommunityIcons name="calendar-remove" size={18} color="inherit" />, permKey: 'rh_hub' as PermKey },
          { label: 'Folha de Salários', route: '/(main)/rh-payroll', icon: <MaterialCommunityIcons name="cash-multiple" size={18} color="inherit" />, permKey: 'rh_hub' as PermKey },
        ],
      }],
    }] : []),
  ];

  const CHEFE_SECRETARIA_SECTIONS: NavSection[] = [
    {
      title: 'Principal',
      items: [
        { label: 'Dashboard', route: '/(main)/dashboard', icon: <Ionicons name="grid" size={20} color="inherit" />, permKey: 'dashboard' },
        { label: 'Painel da Secretaria', route: '/(main)/secretaria-hub?tab=visao', icon: <MaterialCommunityIcons name="briefcase-account" size={20} color="inherit" />, permKey: 'secretaria_hub' },
        { label: 'Consulta de Aluno', route: '/(main)/consulta-aluno', icon: <MaterialCommunityIcons name="account-search" size={20} color="inherit" />, permKey: 'consultar_aluno' },
        { label: 'Processo de Admissão', route: '/(main)/admissao', icon: <MaterialCommunityIcons name="account-school" size={20} color="inherit" />, permKey: 'admissao' },

      ],
    },
    {
      title: 'Gestão Académica',
      items: [
        { label: 'Alunos', route: '/(main)/alunos', icon: <Ionicons name="people" size={20} color="inherit" />, permKey: 'alunos' },
        { label: 'Professores', route: '/(main)/professores', icon: <FontAwesome5 name="chalkboard-teacher" size={18} color="inherit" />, permKey: 'professores' },
        { label: 'Turmas', route: '/(main)/turmas', icon: <MaterialIcons name="class" size={20} color="inherit" />, permKey: 'turmas' },
        { label: 'Salas de Aula', route: '/(main)/salas', icon: <MaterialCommunityIcons name="door-open" size={20} color="inherit" />, permKey: 'salas' },
        { label: 'Notas & Pautas', route: '/(main)/notas', icon: <Ionicons name="document-text" size={20} color="inherit" />, permKey: 'notas' },
        { label: 'Presenças', route: '/(main)/presencas', icon: <Ionicons name="checkmark-circle-outline" size={20} color="inherit" />, permKey: 'presencas' },
        { label: 'Horário', route: '/(main)/horario', icon: <Ionicons name="time" size={20} color="inherit" />, permKey: 'horario' },
        { label: 'Histórico', route: '/(main)/historico', icon: <MaterialCommunityIcons name="chart-timeline-variant" size={20} color="inherit" />, permKey: 'historico' },
        { label: 'Grelha Curricular', route: '/(main)/grelha', icon: <Ionicons name="library" size={20} color="inherit" />, permKey: 'grelha' },
        { label: 'Disciplinas', route: '/(main)/disciplinas', icon: <MaterialCommunityIcons name="book-outline" size={20} color="inherit" />, permKey: 'disciplinas' },
        { label: 'Gestão de Cursos', route: '/(main)/admin?section=cursos&group=academico', icon: <MaterialCommunityIcons name="book-open-variant" size={20} color="inherit" />, permKey: 'gestao_academica' },
        { label: 'Estudantes Finalistas', route: '/(main)/finalistas', icon: <MaterialCommunityIcons name="school" size={20} color="inherit" /> },
        { label: 'Antigos Alunos (Alumni)', route: '/(main)/alumni', icon: <MaterialCommunityIcons name="account-group-outline" size={20} color="inherit" /> },
      ],
    },
    {
      title: 'Documentos & Comunicação',
      items: [
        { label: 'Editor de Documentos', route: '/(main)/editor-documentos', icon: <Ionicons name="newspaper" size={20} color="inherit" />, permKey: 'editor_documentos' },
        { label: 'Arquivo de Documentos', route: '/(main)/arquivo-documentos', icon: <MaterialCommunityIcons name="folder-multiple" size={20} color="inherit" />, permKey: 'arquivo_documentos' },
        { label: 'Arquivo de Pautas', route: '/(main)/arquivo-pautas', icon: <MaterialCommunityIcons name="archive-outline" size={20} color="inherit" />, permKey: 'pedagogico' },
        { label: 'Exame Nacional', route: '/(main)/exame-nacional', icon: <MaterialCommunityIcons name="certificate-outline" size={20} color="inherit" />, permKey: 'pedagogico' },
        { label: 'Exame de Recurso', route: '/(main)/exame-recurso', icon: <MaterialCommunityIcons name="refresh-circle" size={20} color="inherit" />, permKey: 'pedagogico' },
        { label: 'Melhoria de Nota', route: '/(main)/melhoria-nota', icon: <MaterialCommunityIcons name="trending-up" size={20} color="inherit" />, permKey: 'pedagogico' },
        { label: 'Pedido de Reapreciação', route: '/(main)/pedidos-reapreciacao', icon: <MaterialCommunityIcons name="file-document-edit-outline" size={20} color="inherit" />, permKey: 'pedagogico' },
        { label: 'Conselho de Avaliação', route: '/(main)/conselho', icon: <MaterialCommunityIcons name="account-group" size={20} color="inherit" />, permKey: 'pedagogico' },
        { label: 'Avaliação Diagnóstica', route: '/(main)/diagnostica', icon: <MaterialCommunityIcons name="clipboard-pulse-outline" size={20} color="inherit" />, permKey: 'pedagogico' },
        { label: 'Avaliação Formativa', route: '/(main)/formativa', icon: <MaterialCommunityIcons name="chart-bar" size={20} color="inherit" />, permKey: 'pedagogico' },
        { label: 'Calendário Académico', route: '/(main)/calendario-academico', icon: <MaterialCommunityIcons name="calendar-month" size={20} color="inherit" />, permKey: 'eventos' },
        { label: 'Eventos Escolares', route: '/(main)/eventos', icon: <Ionicons name="calendar" size={20} color="inherit" />, permKey: 'eventos' },
      ],
    },
    {
      title: 'Financeiro',
      items: [
        { label: 'Gestão Financeira', route: '/(main)/financeiro?tab=painel', icon: <MaterialCommunityIcons name="cash" size={20} color="inherit" />, permKey: 'financeiro' },
        { label: 'Resumo Financeiro', route: '/(main)/financeiro?tab=resumo', icon: <MaterialCommunityIcons name="chart-pie" size={20} color="inherit" />, permKey: 'financeiro' },
        { label: 'Em Atraso', route: '/(main)/financeiro?tab=em_atraso', icon: <MaterialCommunityIcons name="alert-circle-outline" size={20} color="inherit" />, permKey: 'financeiro' },
        { label: 'Mensagens', route: '/(main)/financeiro?tab=mensagens', icon: <MaterialCommunityIcons name="message-text-outline" size={20} color="inherit" />, permKey: 'financeiro' },
        { label: 'Por Aluno', route: '/(main)/financeiro?tab=por_aluno', icon: <MaterialCommunityIcons name="account-details" size={20} color="inherit" />, permKey: 'financeiro' },
        { label: 'Pagamentos', route: '/(main)/financeiro?tab=pagamentos', icon: <MaterialCommunityIcons name="cash-multiple" size={20} color="inherit" />, permKey: 'financeiro' },
        { label: 'Rubricas / Taxas', route: '/(main)/financeiro?tab=rubricas', icon: <MaterialCommunityIcons name="format-list-bulleted-type" size={20} color="inherit" />, permKey: 'financeiro' },
        { label: 'Orçamento Anual', route: '/(main)/financeiro?tab=orcamento', icon: <MaterialCommunityIcons name="speedometer" size={20} color="inherit" />, permKey: 'financeiro' },
        { label: 'Pag. por Rubrica', route: '/(main)/financeiro?tab=pag_rubrica', icon: <MaterialCommunityIcons name="layers-outline" size={20} color="inherit" />, permKey: 'financeiro' },
        { label: 'Análise de Resultados', route: '/(main)/financeiro?tab=relatorios', icon: <MaterialCommunityIcons name="chart-bar" size={20} color="inherit" />, permKey: 'financeiro' },
        { label: 'Rel. Financeiros', route: '/(main)/financeiro?tab=relatorios_fin', icon: <MaterialCommunityIcons name="chart-line" size={20} color="inherit" />, permKey: 'financeiro' },
        { label: 'Plano de Contas', route: '/(main)/financeiro?tab=plano_contas', icon: <MaterialCommunityIcons name="file-tree" size={20} color="inherit" />, permKey: 'financeiro' },
        { label: 'Contas a Pagar', route: '/(main)/financeiro?tab=contas_pagar', icon: <MaterialCommunityIcons name="credit-card-clock" size={20} color="inherit" />, permKey: 'financeiro' },
        { label: 'Configuração Fiscal', route: '/(main)/financeiro?tab=config_fiscal', icon: <MaterialCommunityIcons name="file-percent" size={20} color="inherit" />, permKey: 'financeiro' },
        { label: 'Portaria — Validar Cartão', route: '/(main)/portaria', icon: <MaterialCommunityIcons name="qrcode-scan" size={20} color="inherit" />, permKey: 'secretaria_hub' },
        { label: 'Feriados', route: '/(main)/financeiro?tab=feriados', icon: <MaterialCommunityIcons name="calendar-star" size={20} color="inherit" />, permKey: 'financeiro' },
        { label: 'Solicitações de Documentos', route: '/(main)/financeiro?tab=solicitacoes_docs', icon: <MaterialCommunityIcons name="file-document-edit" size={20} color="inherit" />, permKey: 'financeiro' },
        { label: 'Fecho de Caixa', route: '/(main)/financeiro?tab=fecho_caixa', icon: <MaterialCommunityIcons name="lock-check-outline" size={20} color="inherit" />, permKey: 'financeiro' },
        { label: 'Hub de Pagamentos', route: '/(main)/pagamentos-hub', icon: <KzIcon size={20} color="inherit" />, permKey: 'financeiro' },
        { label: 'Documentos & Multicaixa', route: '/(main)/documentos-hub', icon: <MaterialCommunityIcons name="file-document-multiple" size={20} color="inherit" />, permKey: 'financeiro' },
        { label: 'Bolsas & Descontos', route: '/(main)/bolsas', icon: <MaterialCommunityIcons name="school-outline" size={20} color="inherit" />, permKey: 'financeiro' },
      ],
    },
    {
      title: 'Recursos Humanos',
      items: [
        {
          label: 'Recursos Humanos', route: '/(main)/rh-hub', icon: <MaterialCommunityIcons name="account-tie" size={20} color="inherit" />, permKey: 'rh_hub',
          subItems: [
            { label: 'Gestão de Pessoal', route: '/(main)/rh-controle', icon: <MaterialCommunityIcons name="account-group" size={18} color="inherit" />, permKey: 'rh_hub' },
            { label: 'Faltas & Remunerações', route: '/(main)/rh-faltas-tempos', icon: <MaterialCommunityIcons name="calendar-remove" size={18} color="inherit" />, permKey: 'rh_hub' },
            { label: 'Folha de Salários', route: '/(main)/rh-payroll', icon: <MaterialCommunityIcons name="cash-multiple" size={18} color="inherit" />, permKey: 'rh_hub' },
          ],
        },
      ],
    },
    {
      title: 'Análise',
      items: [
        { label: 'Visão Geral Multi-Ano', route: '/(main)/visao-geral', icon: <MaterialCommunityIcons name="chart-line" size={20} color="inherit" />, permKey: 'visao_geral' },
        { label: 'Relatórios', route: '/(main)/relatorios', icon: <Ionicons name="bar-chart" size={20} color="inherit" />, permKey: 'relatorios' },
      ],
    },
    {
      title: 'Administração · Académico',
      items: [
        { label: 'Matrículas Pendentes', route: '/(main)/admin?section=matriculas&group=academico', icon: <MaterialCommunityIcons name="account-plus" size={20} color="inherit" />, permKey: 'admin' },
        { label: 'Gestão de Cursos', route: '/(main)/admin?section=cursos&group=academico', icon: <MaterialCommunityIcons name="book-open-variant" size={20} color="inherit" />, permKey: 'admin' },
        { label: 'Disciplinas (Admin)', route: '/(main)/admin?section=disciplinas&group=academico', icon: <MaterialCommunityIcons name="book-outline" size={20} color="inherit" />, permKey: 'admin' },
        { label: 'Ano Académico', route: '/(main)/admin?section=anos&group=academico', icon: <Ionicons name="calendar" size={20} color="inherit" />, permKey: 'admin' },
        { label: 'Reabertura de Notas', route: '/(main)/admin?section=reabertura&group=academico', icon: <MaterialCommunityIcons name="lock-open-variant" size={20} color="inherit" />, permKey: 'admin' },
        { label: 'Lançamento de Notas', route: '/(main)/admin?section=solicit_avaliacao&group=academico', icon: <MaterialCommunityIcons name="key-variant" size={20} color="inherit" />, permKey: 'admin' },
      ],
    },
    {
      title: 'Administração · Pessoal & Acesso',
      items: [
        { label: 'Utilizadores', route: '/(main)/admin?section=usuarios&group=pessoal', icon: <Ionicons name="people" size={20} color="inherit" />, permKey: 'admin' },
        { label: 'Permissões / Acessos', route: '/(main)/admin?section=acessos&group=pessoal', icon: <MaterialCommunityIcons name="account-key" size={20} color="inherit" />, permKey: 'gestao_acessos' },
        { label: 'Perfis Pendentes', route: '/(main)/perfis-pendentes', icon: <MaterialCommunityIcons name="account-clock" size={20} color="inherit" />, permKey: 'perfis_pendentes' as PermKey },
      ],
    },
    {
      title: 'Administração · Sistema',
      items: [
        { label: 'Configurações Gerais', route: '/(main)/admin?section=config&group=sistema', icon: <Ionicons name="settings" size={20} color="inherit" />, permKey: 'admin' },
        { label: 'Comunicações', route: '/(main)/admin?section=comunicacoes&group=sistema', icon: <Ionicons name="megaphone" size={20} color="inherit" />, permKey: 'admin' },
        { label: 'Segurança & Backups', route: '/(main)/admin?section=seguranca&group=sistema', icon: <Ionicons name="shield-checkmark" size={20} color="inherit" />, permKey: 'admin' },
      ],
    },
  ];

  const PEDAGOGICO_SECTIONS: NavSection[] = [
    {
      title: 'Principal',
      items: [
        { label: 'Dashboard', route: '/(main)/dashboard', icon: <Ionicons name="grid" size={20} color="inherit" />, permKey: 'dashboard' },
        { label: 'Calendário Académico', route: '/(main)/calendario-academico', icon: <MaterialCommunityIcons name="calendar-month" size={20} color="inherit" />, permKey: 'eventos' },
        { label: 'Eventos Escolares', route: '/(main)/eventos', icon: <Ionicons name="calendar" size={20} color="inherit" />, permKey: 'eventos' },

      ],
    },
    {
      title: 'Área Pedagógica',
      items: [
        {
          label: 'Área Pedagógica', route: '/(main)/pedagogico', icon: <MaterialCommunityIcons name="clipboard-list" size={20} color="inherit" />, permKey: 'pedagogico',
          subItems: [
            { label: 'Alunos', route: '/(main)/alunos', icon: <Ionicons name="people" size={18} color="inherit" />, permKey: 'alunos' },
            { label: 'Processo de Admissão', route: '/(main)/admissao', icon: <MaterialCommunityIcons name="account-school" size={18} color="inherit" />, permKey: 'admissao' },
            { label: 'Transferências', route: '/(main)/transferencias', icon: <MaterialCommunityIcons name="transfer" size={18} color="inherit" />, permKey: 'transferencias' },
            { label: 'Professores', route: '/(main)/professores', icon: <FontAwesome5 name="chalkboard-teacher" size={16} color="inherit" />, permKey: 'professores' },
            { label: 'Turmas', route: '/(main)/turmas', icon: <MaterialIcons name="class" size={18} color="inherit" />, permKey: 'turmas' },
            { label: 'Salas de Aula', route: '/(main)/salas', icon: <MaterialCommunityIcons name="door-open" size={18} color="inherit" />, permKey: 'salas' },
            { label: 'Notas & Pautas', route: '/(main)/notas', icon: <Ionicons name="document-text" size={18} color="inherit" />, permKey: 'notas' },
            { label: 'Presenças', route: '/(main)/presencas', icon: <Ionicons name="checkmark-circle-outline" size={18} color="inherit" />, permKey: 'presencas' },
            { label: 'Horário', route: '/(main)/horario', icon: <Ionicons name="time" size={18} color="inherit" />, permKey: 'horario' },
            { label: 'Histórico', route: '/(main)/historico', icon: <MaterialCommunityIcons name="chart-timeline-variant" size={18} color="inherit" />, permKey: 'historico' },
            { label: 'Grelha Curricular', route: '/(main)/grelha', icon: <Ionicons name="library" size={18} color="inherit" />, permKey: 'grelha' },
            { label: 'Disciplinas', route: '/(main)/disciplinas', icon: <MaterialCommunityIcons name="book-outline" size={18} color="inherit" />, permKey: 'disciplinas' },
            { label: 'Biblioteca', route: '/(main)/biblioteca', icon: <Ionicons name="library" size={18} color="inherit" />, permKey: 'biblioteca' },
            { label: 'Avaliação de Professores', route: '/(main)/avaliacao-professores', icon: <MaterialCommunityIcons name="star-check-outline" size={18} color="inherit" />, permKey: 'avaliacao_professores' },
            { label: 'Exclusões & Faltas', route: '/(main)/exclusoes-faltas', icon: <MaterialCommunityIcons name="account-cancel" size={18} color="inherit" />, permKey: 'pedagogico' },
            { label: 'Quadro de Honra', route: '/(main)/quadro-honra', icon: <MaterialCommunityIcons name="trophy" size={18} color="inherit" />, permKey: 'pedagogico' },
            { label: 'Estudantes Finalistas', route: '/(main)/finalistas', icon: <MaterialCommunityIcons name="school" size={18} color="inherit" /> },
            { label: 'Antigos Alunos (Alumni)', route: '/(main)/alumni', icon: <MaterialCommunityIcons name="account-group-outline" size={18} color="inherit" /> },
            { label: 'Gestão Académica', route: '/(main)/gestao-academica', icon: <MaterialCommunityIcons name="school" size={18} color="inherit" />, permKey: 'gestao_academica' },
            { label: 'Acompanhamento de Pautas', route: '/(main)/acompanhamento-pautas', icon: <MaterialCommunityIcons name="file-clock-outline" size={18} color="inherit" />, permKey: 'pedagogico' },
            { label: 'Exame Extraordinário', route: '/(main)/exame-extraordinario', icon: <MaterialCommunityIcons name="file-document-alert-outline" size={18} color="inherit" />, permKey: 'pedagogico' },
            { label: 'Exame Nacional', route: '/(main)/exame-nacional', icon: <MaterialCommunityIcons name="certificate-outline" size={18} color="inherit" />, permKey: 'pedagogico' },
            { label: 'Arquivo de Pautas', route: '/(main)/arquivo-pautas', icon: <MaterialCommunityIcons name="archive-outline" size={18} color="inherit" />, permKey: 'pedagogico' },
            { label: 'Exame de Recurso', route: '/(main)/exame-recurso', icon: <MaterialCommunityIcons name="refresh-circle" size={18} color="inherit" />, permKey: 'pedagogico' },
            { label: 'Melhoria de Nota', route: '/(main)/melhoria-nota', icon: <MaterialCommunityIcons name="trending-up" size={18} color="inherit" />, permKey: 'pedagogico' },
            { label: 'Pedido de Reapreciação', route: '/(main)/pedidos-reapreciacao', icon: <MaterialCommunityIcons name="file-document-edit-outline" size={18} color="inherit" />, permKey: 'pedagogico' },
            { label: 'Conselho de Avaliação', route: '/(main)/conselho', icon: <MaterialCommunityIcons name="account-group" size={18} color="inherit" />, permKey: 'pedagogico' },
            { label: 'Avaliação Diagnóstica', route: '/(main)/diagnostica', icon: <MaterialCommunityIcons name="clipboard-pulse-outline" size={18} color="inherit" />, permKey: 'pedagogico' },
            { label: 'Avaliação Formativa', route: '/(main)/formativa', icon: <MaterialCommunityIcons name="chart-bar" size={18} color="inherit" />, permKey: 'pedagogico' },
          ],
        },
      ],
    },
    {
      title: 'Documentos & Análise',
      items: [
        { label: 'Editor de Documentos', route: '/(main)/editor-documentos', icon: <Ionicons name="newspaper" size={20} color="inherit" />, permKey: 'editor_documentos' },

        { label: 'Relatórios', route: '/(main)/relatorios', icon: <Ionicons name="bar-chart" size={20} color="inherit" />, permKey: 'relatorios' },
        { label: 'Análise de Desempenho', route: '/(main)/desempenho', icon: <MaterialCommunityIcons name="chart-areaspline" size={20} color="inherit" />, permKey: 'desempenho' },
        { label: 'Visão Geral Multi-Ano', route: '/(main)/visao-geral', icon: <MaterialCommunityIcons name="chart-line" size={20} color="inherit" />, permKey: 'visao_geral' },
      ],
    },
  ];

  const CONSELHO_PEDAGOGICO_SECTIONS: NavSection[] = [
    {
      title: 'Principal',
      items: [
        { label: 'Dashboard', route: '/(main)/dashboard', icon: <Ionicons name="grid" size={20} color="inherit" />, permKey: 'dashboard' },
        { label: 'Calendário Académico', route: '/(main)/calendario-academico', icon: <MaterialCommunityIcons name="calendar-month" size={20} color="inherit" />, permKey: 'eventos' },
        { label: 'Eventos Escolares', route: '/(main)/eventos', icon: <Ionicons name="calendar" size={20} color="inherit" />, permKey: 'eventos' },
      ],
    },
    {
      title: 'Conselho Pedagógico',
      items: [
        { label: 'Conselho Pedagógico', route: '/(main)/conselho?tipo=pedagogico', icon: <MaterialCommunityIcons name="account-group" size={20} color="inherit" />, permKey: 'conselho_pedagogico' },
        { label: 'Reuniões', route: '/(main)/conselho?tipo=pedagogico&tab=reunioes', icon: <MaterialCommunityIcons name="calendar-clock" size={20} color="inherit" />, permKey: 'conselho_pedagogico' },
        { label: 'Deliberações', route: '/(main)/conselho?tipo=pedagogico&tab=deliberacoes', icon: <MaterialCommunityIcons name="vote" size={20} color="inherit" />, permKey: 'conselho_pedagogico' },
        { label: 'Validação de Pautas', route: '/(main)/conselho?tipo=pedagogico&tab=validacoes', icon: <MaterialCommunityIcons name="file-check" size={20} color="inherit" />, permKey: 'conselho_pedagogico' },
        { label: 'Membros', route: '/(main)/conselho?tipo=pedagogico&tab=membros', icon: <MaterialCommunityIcons name="account-multiple-check" size={20} color="inherit" />, permKey: 'conselho_pedagogico' },
      ],
    },
    {
      title: 'Área Académica',
      items: [
        { label: 'Notas & Pautas', route: '/(main)/notas', icon: <Ionicons name="document-text" size={20} color="inherit" />, permKey: 'notas' },
        { label: 'Alunos', route: '/(main)/alunos', icon: <Ionicons name="people" size={20} color="inherit" />, permKey: 'alunos' },
        { label: 'Professores', route: '/(main)/professores', icon: <MaterialCommunityIcons name="chalkboard" size={20} color="inherit" />, permKey: 'professores' },
        { label: 'Turmas', route: '/(main)/turmas', icon: <MaterialCommunityIcons name="layers" size={20} color="inherit" />, permKey: 'turmas' },
        { label: 'Análise de Desempenho', route: '/(main)/desempenho', icon: <MaterialCommunityIcons name="chart-areaspline" size={20} color="inherit" />, permKey: 'desempenho' },
        { label: 'Relatórios', route: '/(main)/relatorios', icon: <Ionicons name="bar-chart" size={20} color="inherit" />, permKey: 'relatorios' },
      ],
    },
  ];

  const CONSELHO_ESCOLA_SECTIONS: NavSection[] = [
    {
      title: 'Principal',
      items: [
        { label: 'Dashboard', route: '/(main)/dashboard', icon: <Ionicons name="grid" size={20} color="inherit" />, permKey: 'dashboard' },
        { label: 'Calendário Académico', route: '/(main)/calendario-academico', icon: <MaterialCommunityIcons name="calendar-month" size={20} color="inherit" />, permKey: 'eventos' },
        { label: 'Eventos Escolares', route: '/(main)/eventos', icon: <Ionicons name="calendar" size={20} color="inherit" />, permKey: 'eventos' },
      ],
    },
    {
      title: 'Conselho de Escola',
      items: [
        { label: 'Conselho de Escola', route: '/(main)/conselho?tipo=escola', icon: <MaterialCommunityIcons name="office-building" size={20} color="inherit" />, permKey: 'conselho_escola' },
        { label: 'Reuniões', route: '/(main)/conselho?tipo=escola&tab=reunioes', icon: <MaterialCommunityIcons name="calendar-clock" size={20} color="inherit" />, permKey: 'conselho_escola' },
        { label: 'Deliberações', route: '/(main)/conselho?tipo=escola&tab=deliberacoes', icon: <MaterialCommunityIcons name="vote" size={20} color="inherit" />, permKey: 'conselho_escola' },
        { label: 'Membros', route: '/(main)/conselho?tipo=escola&tab=membros', icon: <MaterialCommunityIcons name="account-multiple-check" size={20} color="inherit" />, permKey: 'conselho_escola' },
      ],
    },
    {
      title: 'Supervisão',
      items: [
        { label: 'Alunos', route: '/(main)/alunos', icon: <Ionicons name="people" size={20} color="inherit" />, permKey: 'alunos' },
        { label: 'Histórico Académico', route: '/(main)/historico', icon: <MaterialCommunityIcons name="chart-timeline-variant" size={20} color="inherit" />, permKey: 'historico' },
        { label: 'Relatórios', route: '/(main)/relatorios', icon: <Ionicons name="bar-chart" size={20} color="inherit" />, permKey: 'relatorios' },
        { label: 'Análise de Desempenho', route: '/(main)/desempenho', icon: <MaterialCommunityIcons name="chart-areaspline" size={20} color="inherit" />, permKey: 'desempenho' },
        { label: 'Visão Geral Multi-Ano', route: '/(main)/visao-geral', icon: <MaterialCommunityIcons name="chart-line" size={20} color="inherit" />, permKey: 'visao_geral' },
      ],
    },
  ];

  const RAW_SECTIONS: NavSection[] = isSecretaria ? SECRETARIA_SECTIONS
    : (isCeo || isPca) ? CEO_PCA_SECTIONS
    : isChefeSec ? CHEFE_SECRETARIA_SECTIONS
    : isProf ? PROFESSOR_SECTIONS
    : isAluno ? ALUNO_SECTIONS
    : isEncarregado ? ENCARREGADO_SECTIONS
    : isFinanceiro ? FINANCEIRO_SECTIONS
    : isRhRole ? RH_SECTIONS
    : isPedagogico ? PEDAGOGICO_SECTIONS
    : isMembroConselhoPed ? CONSELHO_PEDAGOGICO_SECTIONS
    : isMembroConselhoEsc ? CONSELHO_ESCOLA_SECTIONS
    : ADMIN_DIRECTOR_SECTIONS;

  // CEO/PCA/ChefeSec always see everything; others get filtered by permissions
  const NAV_SECTIONS: NavSection[] = (isCeo || isPca || isChefeSec) ? RAW_SECTIONS : RAW_SECTIONS.map(section => ({
    ...section,
    items: section.items
      .filter(item => !item.permKey || hasPermission(item.permKey))
      .map(item => ({
        ...item,
        subItems: item.subItems?.filter(sub => !sub.permKey || hasPermission(sub.permKey)),
      })),
  })).filter(section => section.items.length > 0);

  function renderNavContent(showClose: boolean, iconOnly = false) {
    return (
      <View style={{ flex: 1, flexDirection: 'column' }}>
        {/* Cabeçalho mobile — apenas botão fechar */}
        {showClose && (
          <View style={styles.mobileDrawerHeader}>
            <TouchableOpacity
              onPress={closeLeft}
              style={styles.mobileDrawerCloseBtn}
              activeOpacity={0.7}
              accessibilityLabel="Fechar menu"
            >
              <Ionicons name="close" size={20} color={Colors.text} />
            </TouchableOpacity>
          </View>
        )}

        {/* CEO Badge */}
        {isCeo && !iconOnly && (
          <View style={styles.ceoBadge}>
            <MaterialCommunityIcons name="crown" size={14} color="#FFD700" />
            <Text style={styles.ceoBadgeText}>CEO — Controlo Total</Text>
          </View>
        )}

        {/* Sino — solicitações de subscrição pendentes (CEO) */}
        {isCeo && pendentesCount > 0 && !iconOnly && (
          <TouchableOpacity
            style={drawerSinoStyles.sinoCard}
            onPress={() => router.push('/licenca' as any)}
            activeOpacity={0.85}
          >
            <View style={drawerSinoStyles.sinoIconWrap}>
              <MaterialCommunityIcons name="bell-ring" size={18} color="#FF9F0A" />
              <View style={drawerSinoStyles.sinoBadge}>
                <Text style={drawerSinoStyles.sinoBadgeText}>{pendentesCount > 99 ? '99+' : pendentesCount}</Text>
              </View>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={drawerSinoStyles.sinoTitle}>
                {pendentesCount} solicitaç{pendentesCount === 1 ? 'ão' : 'ões'}
              </Text>
              <Text style={drawerSinoStyles.sinoSub}>de subscrição pendente{pendentesCount === 1 ? '' : 's'}</Text>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={18} color="#FF9F0A" />
          </TouchableOpacity>
        )}

        {/* Chefe de Secretaria Badge */}
        {isChefeSec && !iconOnly && (
          <View style={[styles.ceoBadge, { backgroundColor: '#E11D4820', borderColor: '#E11D4840' }]}>
            <MaterialCommunityIcons name="briefcase-account" size={14} color="#E11D48" />
            <Text style={[styles.ceoBadgeText, { color: '#E11D48' }]}>Chefe de Secretaria — Parametrização Total</Text>
          </View>
        )}

        {/* Licence Status — estilo antivírus */}
        {!isCeo && !isAluno && !iconOnly && (
          <TouchableOpacity
            style={[
              styles.licCard,
              diasRestantes > 0 && diasRestantes < 5 && {
                borderWidth: 2,
                borderColor: '#FF3B30',
                shadowColor: '#FF3B30',
                shadowOpacity: 0.6,
                shadowRadius: 12,
                shadowOffset: { width: 0, height: 0 },
                ...(Platform.OS === 'web' ? { animation: 'siga-pulse-critical 1.4s ease-in-out infinite' as any } : {}),
              },
            ]}
            onPress={() => {
              if (isPca || isAdmin || isDirector) router.push('/licenca' as any);
            }}
            activeOpacity={(isPca || isAdmin || isDirector) ? 0.85 : 1}
          >
            {/* Faixa de cor lateral */}
            <View style={[styles.licCardStripe, {
              backgroundColor: diasRestantes <= 0
                ? '#FF3B30'
                : diasRestantes <= 7
                ? '#FF3B30'
                : diasRestantes <= 30
                ? '#FF9F0A'
                : '#30D158',
            }]} />

            <View style={styles.licCardBody}>
              {/* Linha de estado */}
              <View style={styles.licCardTop}>
                <MaterialCommunityIcons
                  name={diasRestantes <= 0 ? 'shield-off' : diasRestantes <= 7 ? 'shield-alert' : 'shield-check'}
                  size={13}
                  color={diasRestantes <= 0 ? '#FF3B30' : diasRestantes <= 7 ? '#FF3B30' : diasRestantes <= 30 ? '#FF9F0A' : '#30D158'}
                />
                <Text style={[styles.licCardStatus, {
                  color: diasRestantes <= 0 ? '#FF3B30' : diasRestantes <= 7 ? '#FF3B30' : diasRestantes <= 30 ? '#FF9F0A' : '#30D158',
                }]}>
                  {diasRestantes <= 0 ? 'EXPIRADA' : diasRestantes <= 7 ? 'EXPIRA EM BREVE' : diasRestantes <= 30 ? 'RENOVE EM BREVE' : 'ACTIVA'}
                </Text>
              </View>

              {/* Contador de dias em destaque */}
              <View style={styles.licCardDaysRow}>
                <Text style={[styles.licCardDaysNum, {
                  color: diasRestantes <= 0 ? '#FF3B30' : diasRestantes <= 7 ? '#FF3B30' : diasRestantes <= 30 ? '#FF9F0A' : '#30D158',
                }]}>
                  {diasRestantes <= 0 ? '0' : diasRestantes}
                </Text>
                <View>
                  <Text style={styles.licCardDaysLabel}>DIAS</Text>
                  <Text style={styles.licCardDaysLabel}>RESTANTES</Text>
                </View>
              </View>

              {/* Barra de progresso */}
              <View style={styles.licCardBarTrack}>
                <View style={[styles.licCardBarFill, {
                  width: `${Math.max(0, Math.min(100, (diasRestantes / 30) * 100))}%` as any,
                  backgroundColor: diasRestantes <= 0 ? '#FF3B30' : diasRestantes <= 7 ? '#FF3B30' : diasRestantes <= 30 ? '#FF9F0A' : '#30D158',
                }]} />
              </View>
              <Text style={styles.licCardExpiry}>
                {diasRestantes <= 0
                  ? ((isPca || isAdmin || isDirector) ? 'Clique para renovar a licença' : 'Contacte o administrador')
                  : (isPca || isAdmin || isDirector)
                    ? `Clique para renovar · ${diasRestantes} dia${diasRestantes === 1 ? '' : 's'}`
                    : `${diasRestantes} dia${diasRestantes === 1 ? '' : 's'} para expirar`}
              </Text>
            </View>
          </TouchableOpacity>
        )}

        {/* Year Selector — apenas CEO, PCA, Admin e Director podem alterar */}
        {(isCeo || isPca || isAdmin || isDirector) && anos.length > 0 && !iconOnly && (
          <View style={styles.yearSelector}>
            <Text style={styles.yearLabel}>Ano Académico</Text>
            <TouchableOpacity
              style={styles.yearDropdownBtn}
              onPress={() => setYearDropdownOpen(true)}
              activeOpacity={0.82}
            >
              <View style={styles.yearDropdownLeft}>
                <View style={styles.yearDropdownIconWrap}>
                  <Ionicons name="calendar" size={14} color={Colors.gold} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.yearDropdownValue} numberOfLines={1}>
                    {anoSelecionado?.ano?.replace('/', '-') ?? '—'}
                  </Text>
                  {anoSelecionado?.id === anoAtivo?.id ? (
                    <Text style={styles.yearDropdownBadgeActive}>● Ano activo</Text>
                  ) : anoSelecionado ? (
                    <Text style={styles.yearDropdownBadgeHistory}>Histórico</Text>
                  ) : null}
                </View>
              </View>
              <Ionicons name="chevron-down" size={15} color={Colors.textMuted} />
            </TouchableOpacity>
          </View>
        )}

        {/* Ano Académico — leitura apenas para outros utilizadores (excepto alunos) */}
        {!isCeo && !isPca && !isAdmin && !isDirector && !isAluno && anoSelecionado && !iconOnly && (
          <View style={styles.yearSelector}>
            <Text style={styles.yearLabel}>Ano Académico</Text>
            <View style={[styles.yearDropdownBtn, { opacity: 0.85 }]}>
              <View style={styles.yearDropdownLeft}>
                <View style={styles.yearDropdownIconWrap}>
                  <Ionicons name="calendar" size={14} color={Colors.gold} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.yearDropdownValue} numberOfLines={1}>
                    {anoSelecionado?.ano?.replace('/', '-') ?? '—'}
                  </Text>
                  {anoSelecionado?.id === anoAtivo?.id ? (
                    <Text style={styles.yearDropdownBadgeActive}>● Ano activo</Text>
                  ) : (
                    <Text style={styles.yearDropdownBadgeHistory}>Histórico</Text>
                  )}
                </View>
              </View>
            </View>
          </View>
        )}

        {/* ── Barra de Progresso — Trimestres ── */}
        {anoSelecionado && !iconOnly && Array.isArray(anoSelecionado.trimestres) && anoSelecionado.trimestres.length > 0 && (
          (() => {
            const isAnoAtivo = anoSelecionado.id === anoAtivo?.id;
            const hoje = new Date();
            const hojeStr = hoje.toISOString().split('T')[0];

            // Progresso global do ano académico (0–100)
            const anoStart = anoSelecionado.dataInicio ? new Date(anoSelecionado.dataInicio + 'T00:00:00') : null;
            const anoEnd = anoSelecionado.dataFim ? new Date(anoSelecionado.dataFim + 'T23:59:59') : null;
            const yearPct = (anoStart && anoEnd && isAnoAtivo)
              ? Math.max(0, Math.min(100, ((hoje.getTime() - anoStart.getTime()) / (anoEnd.getTime() - anoStart.getTime())) * 100))
              : (!isAnoAtivo && anoEnd && hoje > anoEnd) ? 100 : 0;

            // Trimestre actual (apenas se o ano for o activo)
            const trimAtual = anoSelecionado.trimestres.find(
              (t: any) => t.dataInicio <= hojeStr && hojeStr <= t.dataFim
            ) ?? null;
            const numAtual = isAnoAtivo && trimAtual ? trimAtual.numero : null;

            // Ordena os trimestres por número para garantir ordem
            const trimestresSorted = [...anoSelecionado.trimestres].sort((a: any, b: any) => a.numero - b.numero);

            const ordinals = ['1.º', '2.º', '3.º'];

            return (
              <View style={styles.trimestreWrap}>

                {/* Cabeçalho: label + % do ano */}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <Text style={{ fontSize: 10, fontFamily: 'Inter_600SemiBold', color: 'rgba(255,255,255,0.4)', letterSpacing: 0.8, textTransform: 'uppercase' }}>
                    Progresso do Ano
                  </Text>
                  {isAnoAtivo && (
                    <Text style={{ fontSize: 11, fontFamily: 'Inter_700Bold', color: yearPct >= 100 ? 'rgba(48,209,88,0.9)' : Colors.gold }}>
                      {Math.round(yearPct)}%
                    </Text>
                  )}
                  {!isAnoAtivo && (
                    <Text style={{ fontSize: 10, fontFamily: 'Inter_500Medium', color: 'rgba(255,255,255,0.3)' }}>
                      {anoSelecionado.ativo ? 'activo' : 'histórico'}
                    </Text>
                  )}
                </View>

                {/* Barra contínua com 3 segmentos */}
                <View style={{ height: 6, flexDirection: 'row', borderRadius: 6, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.07)', marginBottom: 10 }}>
                  {trimestresSorted.map((trim: any, idx: number) => {
                    const isConcluido = numAtual !== null && trim.numero < numAtual;
                    const isAtual = trim.numero === numAtual;
                    const trimStart = trim.dataInicio ? new Date(trim.dataInicio + 'T00:00:00') : null;
                    const trimEnd = trim.dataFim ? new Date(trim.dataFim + 'T23:59:59') : null;
                    const trimPct = isAtual && trimStart && trimEnd
                      ? Math.max(0, Math.min(100, ((hoje.getTime() - trimStart.getTime()) / (trimEnd.getTime() - trimStart.getTime())) * 100))
                      : isConcluido ? 100 : 0;
                    const isLast = idx === trimestresSorted.length - 1;
                    return (
                      <View key={trim.numero} style={{ flex: 1, marginRight: isLast ? 0 : 2, position: 'relative' }}>
                        {/* fundo do segmento */}
                        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(255,255,255,0.06)' }} />
                        {/* preenchimento de progresso */}
                        {(isConcluido || isAtual) && (
                          <View style={{
                            position: 'absolute', top: 0, left: 0, bottom: 0,
                            width: `${isConcluido ? 100 : trimPct}%`,
                            backgroundColor: isConcluido ? 'rgba(48,209,88,0.6)' : Colors.gold,
                            borderRadius: 3,
                          }} />
                        )}
                      </View>
                    );
                  })}
                </View>

                {/* Segmentos com label e % interna */}
                <View style={styles.trimestreRow}>
                  {trimestresSorted.map((trim: any) => {
                    const isAtual = numAtual === trim.numero;
                    const isConcluido = numAtual !== null && trim.numero < numAtual;
                    const trimStart = trim.dataInicio ? new Date(trim.dataInicio + 'T00:00:00') : null;
                    const trimEnd = trim.dataFim ? new Date(trim.dataFim + 'T23:59:59') : null;
                    const trimPct = isAtual && trimStart && trimEnd
                      ? Math.round(Math.max(0, Math.min(100, ((hoje.getTime() - trimStart.getTime()) / (trimEnd.getTime() - trimStart.getTime())) * 100)))
                      : isConcluido ? 100 : null;
                    return (
                      <View
                        key={trim.numero}
                        style={[
                          styles.trimestreSegment,
                          isAtual && styles.trimestreSegmentAtual,
                          isConcluido && styles.trimestreSegmentConcluido,
                        ]}
                      >
                        {isAtual && <View style={styles.trimestreIndicator} />}
                        <Text style={[
                          styles.trimestreSegmentLabel,
                          isAtual && styles.trimestreSegmentLabelAtual,
                          isConcluido && styles.trimestreSegmentLabelConcluido,
                        ]}>T{trim.numero}</Text>
                        {trimPct !== null && (
                          <Text style={{
                            fontSize: 8, fontFamily: 'Inter_600SemiBold',
                            color: isConcluido ? 'rgba(48,209,88,0.7)' : 'rgba(200,154,42,0.8)',
                            marginTop: 1,
                          }}>{trimPct}%</Text>
                        )}
                      </View>
                    );
                  })}
                </View>

                {/* Texto de status */}
                <Text style={styles.trimestreStatusLabel}>
                  {numAtual
                    ? `📍 ${ordinals[numAtual - 1]} Trimestre em curso`
                    : isAnoAtivo
                      ? (yearPct >= 100 ? '✓ Ano lectivo concluído' : '— Fora do período lectivo')
                      : (yearPct >= 100 ? '✓ Ano concluído' : `Ano ${anoSelecionado.ativo ? 'activo' : 'histórico'}`)}
                </Text>
              </View>
            );
          })()
        )}

        {/* Year Dropdown Modal */}
        <Modal
          visible={yearDropdownOpen}
          transparent
          animationType="fade"
          onRequestClose={() => setYearDropdownOpen(false)}
        >
          <TouchableOpacity
            style={styles.yearModalOverlay}
            activeOpacity={1}
            onPress={() => setYearDropdownOpen(false)}
          >
            <View style={styles.yearModalCard}>
              <View style={styles.yearModalHeader}>
                <View style={styles.yearModalHeaderLeft}>
                  <Ionicons name="calendar-outline" size={16} color={Colors.gold} />
                  <Text style={styles.yearModalTitle}>Seleccionar Ano Académico</Text>
                </View>
                <TouchableOpacity onPress={() => setYearDropdownOpen(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="close" size={18} color={Colors.textMuted} />
                </TouchableOpacity>
              </View>
              <Text style={styles.yearModalSub}>
                Toda a informação do sistema será filtrada pelo ano seleccionado.
              </Text>
              <ScrollView style={styles.yearModalList} showsVerticalScrollIndicator={false}>
                {[...anos].sort((a, b) => b.ano.localeCompare(a.ano)).map(ano => {
                  const isSelected = anoSelecionado?.id === ano.id;
                  const isActive = ano.id === anoAtivo?.id;
                  const today = new Date().toISOString().split('T')[0];
                  const isFuture = ano.dataInicio > today;
                  const isPast = !isActive && !isFuture;
                  return (
                    <TouchableOpacity
                      key={ano.id}
                      style={[styles.yearModalItem, isSelected && styles.yearModalItemSelected]}
                      onPress={() => { setAnoSelecionado(ano); setYearDropdownOpen(false); }}
                      activeOpacity={0.8}
                    >
                      <View style={styles.yearModalItemLeft}>
                        <View style={[styles.yearModalDot, isActive && styles.yearModalDotActive, isFuture && styles.yearModalDotFuture]} />
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.yearModalItemYear, isSelected && styles.yearModalItemYearSelected]}>
                            {ano.ano}
                          </Text>
                          {(ano.dataInicio || ano.dataFim) && (
                            <Text style={styles.yearModalItemDates}>
                              {ano.dataInicio} — {ano.dataFim}
                            </Text>
                          )}
                        </View>
                      </View>
                      <View style={styles.yearModalItemRight}>
                        {isActive && (
                          <View style={styles.yearBadgeActive}>
                            <Text style={styles.yearBadgeActiveText}>Activo</Text>
                          </View>
                        )}
                        {isFuture && (
                          <View style={styles.yearBadgeFuture}>
                            <Text style={styles.yearBadgeFutureText}>Futuro</Text>
                          </View>
                        )}
                        {isPast && !isActive && (
                          <View style={styles.yearBadgeHistory}>
                            <Text style={styles.yearBadgeHistoryText}>Histórico</Text>
                          </View>
                        )}
                        {isSelected && (
                          <Ionicons name="checkmark-circle" size={18} color={Colors.gold} style={{ marginLeft: 6 }} />
                        )}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          </TouchableOpacity>
        </Modal>

        <View style={styles.divider} />

        <ScrollView showsVerticalScrollIndicator={true} style={styles.scroll} {...(Platform.OS === 'web' ? { className: 'drawer-scroll' } as any : {})}>
          {/* ── Acesso Rápido — secção compacta moderna ── */}
          {(isCeo || isPca || isAdmin || isDirector || isChefeSec || isRH) && !iconOnly && (
            <View style={styles.quickSection}>
              <Text style={styles.quickSectionLabel}>ACESSO RÁPIDO</Text>


              {isCeo && (
                <TouchableOpacity style={styles.quickItem} onPress={() => { router.push('/(main)/admin' as any); closeLeft && closeLeft(); }} activeOpacity={0.72} {...(Platform.OS === 'web' ? { className: 'drawer-quick-item' } as any : {})}>
                  <View style={[styles.quickItemIcon, { backgroundColor: 'rgba(255,69,58,0.13)', borderColor: 'rgba(255,69,58,0.25)' }]}>
                    <MaterialCommunityIcons name="shield-crown" size={16} color="#FF453A" />
                  </View>
                  <View style={styles.quickItemBody}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                      <Text style={styles.quickItemTitle}>Super Admin</Text>
                      <View style={styles.quickItemBadge}><Text style={styles.quickItemBadgeText}>RESTRITO</Text></View>
                    </View>
                    <Text style={styles.quickItemSub}>Utilizadores · Escola · Segurança</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={12} color="rgba(255,255,255,0.2)" />
                </TouchableOpacity>
              )}

              {(isCeo || isPca || isAdmin || isDirector || isChefeSec) && (
                <TouchableOpacity style={styles.quickItem} onPress={() => { router.push('/(main)/auditoria' as any); closeLeft && closeLeft(); }} activeOpacity={0.72} {...(Platform.OS === 'web' ? { className: 'drawer-quick-item' } as any : {})}>
                  <View style={[styles.quickItemIcon, { backgroundColor: 'rgba(167,139,250,0.13)', borderColor: 'rgba(167,139,250,0.25)' }]}>
                    <MaterialCommunityIcons name="file-search-outline" size={16} color="#A78BFA" />
                  </View>
                  <View style={styles.quickItemBody}>
                    <Text style={styles.quickItemTitle}>Auditoria do Sistema</Text>
                    <Text style={styles.quickItemSub}>Logs · Rastreio · Segurança</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={12} color="rgba(255,255,255,0.2)" />
                </TouchableOpacity>
              )}

              {(isCeo || isPca || isAdmin || isDirector || isChefeSec) && (
                <TouchableOpacity style={styles.quickItem} onPress={() => { router.push('/(main)/med-integracao' as any); closeLeft && closeLeft(); }} activeOpacity={0.72} {...(Platform.OS === 'web' ? { className: 'drawer-quick-item' } as any : {})}>
                  <View style={[styles.quickItemIcon, { backgroundColor: 'rgba(74,144,217,0.13)', borderColor: 'rgba(74,144,217,0.25)' }]}>
                    <MaterialCommunityIcons name="shield-star-outline" size={16} color="#4A90D9" />
                  </View>
                  <View style={styles.quickItemBody}>
                    <Text style={styles.quickItemTitle}>Integração MED</Text>
                    <Text style={styles.quickItemSub}>Exportar dados para SIGE Gov</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={12} color="rgba(255,255,255,0.2)" />
                </TouchableOpacity>
              )}

              {(isCeo || isPca || isAdmin) && (
                <TouchableOpacity style={styles.quickItem} onPress={() => { router.push('/(main)/editor-documentos' as any); closeLeft && closeLeft(); }} activeOpacity={0.72} {...(Platform.OS === 'web' ? { className: 'drawer-quick-item' } as any : {})}>
                  <View style={[styles.quickItemIcon, { backgroundColor: 'rgba(245,158,11,0.13)', borderColor: 'rgba(245,158,11,0.25)' }]}>
                    <Ionicons name="newspaper" size={16} color="#F59E0B" />
                  </View>
                  <View style={styles.quickItemBody}>
                    <Text style={styles.quickItemTitle}>Editor de Documentos</Text>
                    <Text style={styles.quickItemSub}>Modelos · Declarações · Certificados</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={12} color="rgba(255,255,255,0.2)" />
                </TouchableOpacity>
              )}

              {isRH && (
                <TouchableOpacity style={styles.quickItem} onPress={() => { router.push('/(main)/rh-hub' as any); closeLeft && closeLeft(); }} activeOpacity={0.72} {...(Platform.OS === 'web' ? { className: 'drawer-quick-item' } as any : {})}>
                  <View style={[styles.quickItemIcon, { backgroundColor: 'rgba(52,211,153,0.13)', borderColor: 'rgba(52,211,153,0.25)' }]}>
                    <MaterialCommunityIcons name="account-tie" size={16} color="#34D399" />
                  </View>
                  <View style={styles.quickItemBody}>
                    <Text style={styles.quickItemTitle}>Recursos Humanos</Text>
                    <Text style={styles.quickItemSub}>Pessoal · Faltas · Salários</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={12} color="rgba(255,255,255,0.2)" />
                </TouchableOpacity>
              )}

              {(isCeo || isPca || isAdmin || isDirector) && (
                <TouchableOpacity style={styles.quickItem} onPress={() => { router.push('/(main)/gestao-acessos' as any); closeLeft && closeLeft(); }} activeOpacity={0.72} {...(Platform.OS === 'web' ? { className: 'drawer-quick-item' } as any : {})}>
                  <View style={[styles.quickItemIcon, { backgroundColor: 'rgba(129,140,248,0.13)', borderColor: 'rgba(129,140,248,0.25)' }]}>
                    <MaterialCommunityIcons name="account-key" size={16} color="#818CF8" />
                  </View>
                  <View style={styles.quickItemBody}>
                    <Text style={styles.quickItemTitle}>Gestão de Acessos</Text>
                    <Text style={styles.quickItemSub}>Perfis · Permissões · Controlo</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={12} color="rgba(255,255,255,0.2)" />
                </TouchableOpacity>
              )}
            </View>
          )}

          {(isCeo || isPca || isAdmin || isDirector) && <View style={styles.divider} />}

          {NAV_SECTIONS.map((section) => {
            const isCollapsible = isCeo || isPca;
            const isCollapsed = isCollapsible && !!collapsedSections[section.title];
            return (
              <View key={section.title} style={styles.section}>
                {!iconOnly && (isCollapsible ? (
                  <TouchableOpacity
                    style={styles.sectionHeader}
                    onPress={() => toggleSection(section.title)}
                    activeOpacity={0.7}
                    {...(Platform.OS === 'web' ? { className: 'drawer-section-header' } as any : {})}
                  >
                    <Text style={styles.sectionTitle}>{section.title}</Text>
                    <Ionicons
                      name={isCollapsed ? 'chevron-forward' : 'chevron-down'}
                      size={15}
                      color={Colors.textMuted}
                      style={{ marginRight: 16 }}
                    />
                  </TouchableOpacity>
                ) : (
                  <Text style={styles.sectionTitle}>{section.title}</Text>
                ))}
                {iconOnly && <View style={{ height: 4 }} />}
                {!isCollapsed && section.items.map((item) => {
                  const active = isActive(item.route);
                  const hasChildren = item.subItems && item.subItems.length > 0;
                  const isExpanded = !!expandedNavItems[item.route];
                  const anyChildActive = hasChildren && item.subItems!.some(s => isActive(s.route));
                  const itemActive = (!hasChildren && active) || (hasChildren && anyChildActive);
                  const tourActive = isTourItem(item.route);

                  if (iconOnly) {
                    return (
                      <TouchableOpacity
                        key={item.route}
                        ref={tourActive ? activeTourItemRef : undefined}
                        style={[styles.navItemIconOnly, itemActive && styles.navItemActive, tourActive && styles.navItemTourHighlight]}
                        onPress={() => navigate(hasChildren ? (item.subItems![0]?.route ?? item.route) : item.route)}
                        activeOpacity={0.7}
                        {...(Platform.OS === 'web' ? { className: 'drawer-icon-only-item drawer-nav-item', title: item.label } as any : {})}
                      >
                        <View style={[styles.navIcon, itemActive && styles.navIconActive]}>
                          {React.cloneElement(item.icon as React.ReactElement<any>, {
                            color: itemActive ? Colors.gold : 'rgba(255,255,255,0.45)',
                          } as any)}
                        </View>
                      </TouchableOpacity>
                    );
                  }

                  return (
                    <View key={item.route}>
                      <TouchableOpacity
                        ref={tourActive ? activeTourItemRef : undefined}
                        style={[
                          styles.navItem,
                          !hasChildren && active && styles.navItemActive,
                          hasChildren && anyChildActive && styles.navItemParentActive,
                          tourActive && styles.navItemTourHighlight,
                        ]}
                        onPress={() => {
                          if (hasChildren) {
                            toggleNavItem(item.route);
                          } else {
                            navigate(item.route);
                          }
                        }}
                        activeOpacity={0.7}
                        {...(Platform.OS === 'web' ? { className: 'drawer-nav-item' } as any : {})}
                      >
                        <View style={itemActive ? styles.navItemActiveBar : styles.navItemInactiveBar} />
                        <View style={styles.navItemMain}>
                          <View style={[styles.navIcon, itemActive && styles.navIconActive]}>
                          {React.cloneElement(item.icon as React.ReactElement<any>, {
                            color: itemActive ? Colors.gold : 'rgba(255,255,255,0.45)',
                          } as any)}
                          </View>
                          <Text style={[styles.navLabel, itemActive && styles.navLabelActive]}>{item.label}</Text>
                          {!hasChildren && item.badgeCount !== undefined && item.badgeCount > 0 && (
                            <View style={styles.badge}>
                              <Text style={styles.badgeText}>{item.badgeCount > 99 ? '99+' : item.badgeCount}</Text>
                            </View>
                          )}
                          {!hasChildren && active && !item.badgeCount && <View style={styles.activeIndicator} />}
                        </View>
                        {hasChildren && (
                          <View style={styles.navItemChevron}>
                            <Ionicons
                              name={isExpanded ? 'chevron-down' : 'chevron-forward'}
                              size={15}
                              color={anyChildActive ? Colors.gold : 'rgba(255,255,255,0.3)'}
                            />
                          </View>
                        )}
                      </TouchableOpacity>
                      {hasChildren && isExpanded && item.subItems!.map((sub) => {
                        const subActive = isActive(sub.route);
                        return (
                          <TouchableOpacity
                            key={sub.route}
                            style={[styles.navSubItem, subActive && styles.navItemActive]}
                            onPress={() => navigate(sub.route)}
                            activeOpacity={0.7}
                            {...(Platform.OS === 'web' ? { className: 'drawer-sub-item' } as any : {})}
                          >
                            <View style={styles.navSubLine} />
                            <View style={[styles.navSubIcon, subActive && styles.navIconActive]}>
                              {React.cloneElement(sub.icon as React.ReactElement<any>, {
                                color: subActive ? Colors.gold : Colors.textSecondary,
                                size: 16,
                              } as any)}
                            </View>
                            <Text style={[styles.navSubLabel, subActive && styles.navLabelActive]}>{sub.label}</Text>
                            {subActive && <View style={styles.activeIndicator} />}
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  );
                })}
              </View>
            );
          })}
        </ScrollView>

        {/* Footer */}
        <View style={[styles.footer, { borderTopColor: Colors.border }, iconOnly && styles.footerIconOnly]}>

          {iconOnly ? (
            /* Icon-only footer: avatar centrado + botão expandir */
            <View style={{ alignItems: 'center', gap: 8, paddingVertical: 4 }}>
              <TouchableOpacity
                onPress={() => navigate('/(main)/perfil')}
                activeOpacity={0.7}
                {...(Platform.OS === 'web' ? { className: 'drawer-icon-only-item', title: user?.nome || 'Perfil' } as any : {})}
              >
                <View style={{ position: 'relative' }}>
                  <View style={[styles.perfilAvatar, { marginLeft: 0 }]}>
                    {user?.avatar ? (
                      <Image source={{ uri: user.avatar }} style={styles.perfilAvatarImg} />
                    ) : (
                      <Text style={styles.perfilAvatarText}>
                        {user?.nome?.split(' ').map(n => n[0]).slice(0, 2).join('') || 'U'}
                      </Text>
                    )}
                  </View>
                  {temPerfilIncompleto && (
                    <View style={styles.perfilBadge}>
                      <Ionicons name="warning" size={9} color="#fff" />
                    </View>
                  )}
                </View>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.expandBtn}
                onPress={toggleDesktopSidebar}
                activeOpacity={0.75}
                accessibilityLabel="Expandir menu lateral"
                {...(Platform.OS === 'web' ? { className: 'drawer-icon-only-item', title: 'Expandir menu' } as any : {})}
              >
                <Ionicons name="chevron-forward-outline" size={16} color="rgba(255,255,255,0.45)" />
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <TouchableOpacity
                style={[styles.perfilBtn, temPerfilIncompleto && { borderColor: 'rgba(234,179,8,0.4)', backgroundColor: 'rgba(234,179,8,0.06)' }]}
                onPress={() => navigate('/(main)/perfil')}
              >
                <View style={{ position: 'relative' }}>
                  <View style={styles.perfilAvatar}>
                    {user?.avatar ? (
                      <Image source={{ uri: user.avatar }} style={styles.perfilAvatarImg} />
                    ) : (
                      <Text style={styles.perfilAvatarText}>
                        {user?.nome?.split(' ').map(n => n[0]).slice(0, 2).join('') || 'U'}
                      </Text>
                    )}
                  </View>
                  {temPerfilIncompleto && (
                    <View style={styles.perfilBadge}>
                      <Ionicons name="warning" size={9} color="#fff" />
                    </View>
                  )}
                </View>
                <View style={styles.perfilInfo}>
                  <Text style={styles.perfilNome} numberOfLines={1}>{user?.nome}</Text>
                  {temPerfilIncompleto ? (
                    <Text style={styles.perfilIncompletoText} numberOfLines={1}>Perfil incompleto</Text>
                  ) : (
                    <Text style={[styles.roleText, user?.role === 'ceo' && { color: '#FFD700' }]}>
                      {getRoleLabel(user?.role ?? '', resolvedGenero)}
                    </Text>
                  )}
                </View>
                <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
              </TouchableOpacity>

              {/* Botão recolher — só visível em desktop */}
              {isDesktop && (
                <TouchableOpacity
                  style={styles.collapseBtn}
                  onPress={toggleDesktopSidebar}
                  activeOpacity={0.75}
                  accessibilityLabel="Recolher menu lateral"
                >
                  <Ionicons name="chevron-back-outline" size={14} color="rgba(255,255,255,0.35)" />
                  <Text style={styles.collapseBtnText}>Recolher menu</Text>
                </TouchableOpacity>
              )}

              <Text style={styles.version}>Super Escola v1.03</Text>
            </>
          )}
        </View>
      </View>
    );
  }

  /* ── DESKTOP: persistent static sidebar ───────────────────── */
  if (isDesktop) {
    return (
      <Animated.View style={[styles.sidebarDesktop, { width: desktopWidthAnim, overflow: 'hidden' }]}>
        {renderNavContent(false, desktopCollapsed)}
      </Animated.View>
    );
  }

  /* ── MOBILE: animated overlay drawer ──────────────────────── */
  const topInset = insets.top;
  const bottomInset = insets.bottom;

  return (
    <View style={[
      StyleSheet.absoluteFill,
      {
        pointerEvents: leftOpen ? 'auto' : 'none',
        zIndex: leftOpen ? 999 : -1,
      } as any,
    ]}>
      <Animated.View style={[styles.overlay, { opacity, pointerEvents: 'box-none' } as any]}>
        <TouchableOpacity style={[StyleSheet.absoluteFill, { left: drawerWidth }]} onPress={closeLeft} activeOpacity={1} />
      </Animated.View>
      <Animated.View style={[
        styles.drawer,
        { width: drawerWidth, transform: [{ translateX }], paddingTop: topInset + 12, paddingBottom: bottomInset },
      ]}>
        {renderNavContent(true)}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  /* Desktop sidebar */
  sidebarDesktop: {
    width: SIDEBAR_WIDTH,
    flexDirection: 'column',
    alignSelf: 'stretch',
    ...(Platform.OS === 'web' ? { height: '100%' as any } : {}),
    backgroundColor: Colors.primaryDark,
    borderRightWidth: 1,
    borderRightColor: Colors.border,
    paddingTop: 20,
    paddingBottom: 12,
  },

  /* Mobile drawer */
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  drawer: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: Colors.primaryDark,
    borderRightWidth: 1,
    borderRightColor: Colors.border,
  },

  /* Mobile drawer header */
  mobileDrawerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 4,
  },
  mobileDrawerHeaderLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minWidth: 0,
  },
  mobileDrawerLogo: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(240,165,0,0.4)',
    flexShrink: 0,
  },
  mobileDrawerLogoPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: 'rgba(240,165,0,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(240,165,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  mobileDrawerSchoolName: {
    fontSize: 13,
    fontFamily: 'Inter_700Bold',
    color: Colors.text,
    lineHeight: 17,
  },
  mobileDrawerMenuLabel: {
    fontSize: 10,
    fontFamily: 'Inter_400Regular',
    color: Colors.textMuted,
    lineHeight: 14,
  },
  mobileDrawerCloseBtn: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },

  /* Shared (legacy — kept for compat) */
  closeBtnRow: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingTop: 6,
    paddingRight: 6,
  },
  logoCloseBtn: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 26,
    height: 26,
    borderRadius: 7,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  schoolInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    marginBottom: 4,
  },
  schoolName: {
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
    color: Colors.text,
    lineHeight: 18,
  },
  anoLetivo: {
    fontSize: 10,
    fontFamily: 'Inter_400Regular',
    color: Colors.textMuted,
    marginTop: 2,
    letterSpacing: 0.2,
  },
  closeBtn: {
    padding: 4,
  },
  yearSelector: {
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  yearLabel: {
    fontSize: 10,
    fontFamily: 'Inter_600SemiBold',
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 6,
    paddingHorizontal: 4,
  },
  yearDropdownBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(240,165,0,0.25)',
    paddingHorizontal: 10,
    paddingVertical: 9,
    gap: 8,
  },
  yearDropdownLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  yearDropdownIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: 'rgba(240,165,0,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(240,165,0,0.2)',
  },
  yearDropdownValue: {
    fontSize: 13,
    fontFamily: 'Inter_700Bold',
    color: Colors.text,
  },
  yearDropdownBadgeActive: {
    fontSize: 10,
    fontFamily: 'Inter_500Medium',
    color: Colors.success,
    marginTop: 1,
  },
  yearDropdownBadgeHistory: {
    fontSize: 10,
    fontFamily: 'Inter_500Medium',
    color: Colors.textMuted,
    marginTop: 1,
  },
  trimestreWrap: {
    marginHorizontal: 12,
    marginTop: 6,
    marginBottom: 4,
  },
  trimestreRow: {
    flexDirection: 'row',
    gap: 5,
    marginBottom: 6,
  },
  trimestreSegment: {
    flex: 1,
    height: 30,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    overflow: 'hidden',
  },
  trimestreSegmentAtual: {
    backgroundColor: 'rgba(200,154,42,0.18)',
    borderColor: 'rgba(200,154,42,0.55)',
  },
  trimestreSegmentConcluido: {
    backgroundColor: 'rgba(48,209,88,0.1)',
    borderColor: 'rgba(48,209,88,0.25)',
  },
  trimestreIndicator: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: '#C89A2A',
    borderRadius: 2,
  },
  trimestreSegmentLabel: {
    fontSize: 11,
    fontFamily: 'Inter_700Bold',
    color: 'rgba(255,255,255,0.25)',
    letterSpacing: 0.5,
  },
  trimestreSegmentLabelAtual: {
    color: '#C89A2A',
  },
  trimestreSegmentLabelConcluido: {
    color: 'rgba(48,209,88,0.7)',
  },
  trimestreStatusLabel: {
    fontSize: 10,
    fontFamily: 'Inter_500Medium',
    color: 'rgba(255,255,255,0.32)',
    textAlign: 'center',
    letterSpacing: 0.2,
  },
  yearModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(6,16,41,0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  yearModalCard: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: '#122540',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(240,165,0,0.2)',
    overflow: 'hidden',
    paddingTop: 20,
    paddingBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.45,
    shadowRadius: 32,
    elevation: 24,
  },
  yearModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginBottom: 6,
  },
  yearModalHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  yearModalTitle: {
    fontSize: 15,
    fontFamily: 'Inter_700Bold',
    color: Colors.text,
  },
  yearModalSub: {
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
    color: Colors.textMuted,
    paddingHorizontal: 20,
    marginBottom: 14,
    lineHeight: 16,
  },
  yearModalList: {
    maxHeight: 320,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  yearModalItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    marginBottom: 4,
    borderWidth: 1,
    borderColor: 'transparent',
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  yearModalItemSelected: {
    backgroundColor: 'rgba(240,165,0,0.1)',
    borderColor: 'rgba(240,165,0,0.3)',
  },
  yearModalItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  yearModalDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.textMuted,
  },
  yearModalDotActive: {
    backgroundColor: Colors.success,
  },
  yearModalDotFuture: {
    backgroundColor: Colors.info,
  },
  yearModalItemYear: {
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
    color: Colors.textSecondary,
  },
  yearModalItemYearSelected: {
    color: Colors.gold,
  },
  yearModalItemDates: {
    fontSize: 10,
    fontFamily: 'Inter_400Regular',
    color: Colors.textMuted,
    marginTop: 2,
  },
  yearModalItemRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  yearBadgeActive: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: 'rgba(46,204,113,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(46,204,113,0.3)',
  },
  yearBadgeActiveText: {
    fontSize: 9,
    fontFamily: 'Inter_700Bold',
    color: Colors.success,
    letterSpacing: 0.5,
  },
  yearBadgeFuture: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: 'rgba(52,152,219,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(52,152,219,0.3)',
  },
  yearBadgeFutureText: {
    fontSize: 9,
    fontFamily: 'Inter_700Bold',
    color: Colors.info,
    letterSpacing: 0.5,
  },
  yearBadgeHistory: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  yearBadgeHistoryText: {
    fontSize: 9,
    fontFamily: 'Inter_700Bold',
    color: Colors.textMuted,
    letterSpacing: 0.5,
  },
  yearBtns: { flexDirection: 'row', gap: 6 },
  yearBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 5, borderRadius: 10, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
  yearBtnActive: { backgroundColor: 'rgba(240,165,0,0.15)', borderColor: Colors.gold + '66' },
  yearBtnText: { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: Colors.textSecondary },
  yearBtnTextActive: { color: Colors.gold },
  yearActiveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.success },
  divider: {
    height: 1,
    backgroundColor: Colors.border,
    marginHorizontal: 16,
    marginBottom: 4,
  },
  scroll: {
    flex: 1,
  },
  section: {
    paddingTop: 4,
    paddingBottom: 4,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 36,
    borderRadius: 8,
    marginHorizontal: 4,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : {}),
  },
  sectionTitle: {
    fontSize: 10,
    fontFamily: 'Inter_700Bold',
    color: 'rgba(255,255,255,0.32)',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    paddingHorizontal: 16,
    paddingBottom: 6,
    paddingTop: 18,
    flex: 1,
  },
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 0,
    paddingHorizontal: 0,
    marginHorizontal: 6,
    borderRadius: 12,
    gap: 0,
    marginBottom: 1,
    minHeight: 46,
    overflow: 'hidden',
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : {}),
  },
  navItemIconOnly: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 6,
    marginBottom: 2,
    borderRadius: 12,
    minHeight: 44,
    overflow: 'visible',
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : {}),
  },
  navItemActive: {
    backgroundColor: 'rgba(240,165,0,0.13)',
    shadowColor: Colors.gold,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 2,
  },
  navItemTourHighlight: {
    backgroundColor: 'rgba(56,189,248,0.18)',
    borderWidth: 1.5,
    borderColor: 'rgba(56,189,248,0.65)',
    borderRadius: 12,
    ...(Platform.OS === 'web' ? {
      boxShadow: '0 0 0 3px rgba(56,189,248,0.18), 0 0 20px rgba(56,189,248,0.35)',
    } as any : {
      shadowColor: '#38BDF8',
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.55,
      shadowRadius: 14,
      elevation: 8,
    }),
  },
  navItemActiveBar: {
    width: 4,
    alignSelf: 'stretch',
    backgroundColor: Colors.gold,
    borderTopRightRadius: 3,
    borderBottomRightRadius: 3,
    marginRight: 0,
    flexShrink: 0,
    shadowColor: Colors.gold,
    shadowOffset: { width: 2, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 6,
  },
  navItemInactiveBar: {
    width: 4,
    alignSelf: 'stretch',
    backgroundColor: 'transparent',
    marginRight: 0,
    flexShrink: 0,
  },
  navIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  navIconActive: {
    backgroundColor: 'rgba(240,165,0,0.2)',
    borderColor: 'rgba(240,165,0,0.3)',
  },
  navLabel: {
    flex: 1,
    fontSize: 13.5,
    fontFamily: 'Inter_500Medium',
    color: 'rgba(255,255,255,0.68)',
    letterSpacing: 0.1,
  },
  navLabelActive: {
    color: Colors.goldLight,
    fontFamily: 'Inter_600SemiBold',
    letterSpacing: 0.15,
  },
  badge: {
    backgroundColor: Colors.accent,
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  badgeText: {
    fontSize: 11,
    fontFamily: 'Inter_700Bold',
    color: '#fff',
  },
  activeIndicator: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: Colors.gold,
    opacity: 0.7,
  },
  navItemParentActive: {
    backgroundColor: 'rgba(74,144,217,0.07)',
  },
  navItemMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 6,
    paddingHorizontal: 10,
    minHeight: 44,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : {}),
  },
  navItemChevron: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
    marginRight: 6,
    minHeight: 40,
    minWidth: 38,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : {}),
  },
  navSubItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingRight: 14,
    paddingLeft: 18,
    marginHorizontal: 6,
    marginLeft: 16,
    borderRadius: 12,
    gap: 8,
    marginBottom: 2,
    minHeight: 44,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : {}),
  },
  navSubLine: {
    width: 2,
    height: 18,
    backgroundColor: 'rgba(255,255,255,0.16)',
    marginRight: 4,
    borderRadius: 2,
  },
  navSubIcon: {
    width: 30,
    height: 30,
    borderRadius: 9,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  navSubLabel: {
    flex: 1,
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    color: 'rgba(255,255,255,0.52)',
    letterSpacing: 0.1,
  },
  footer: {
    borderTopWidth: 1,
    paddingTop: 10,
    paddingHorizontal: 10,
    paddingBottom: 4,
  },
  perfilBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    marginBottom: 8,
  },
  perfilAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Colors.gold,
  },
  perfilBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#D97706',
    borderWidth: 2,
    borderColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  perfilIncompletoText: {
    fontSize: 11,
    fontFamily: 'Inter_500Medium',
    color: '#D97706',
    marginTop: 2,
  },
  perfilAvatarImg: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  perfilAvatarText: {
    fontSize: 14,
    fontFamily: 'Inter_700Bold',
    color: '#fff',
  },
  perfilInfo: {
    flex: 1,
  },
  perfilNome: {
    fontSize: 13.5,
    fontFamily: 'Inter_600SemiBold',
    color: Colors.text,
    letterSpacing: 0.1,
  },
  roleText: {
    fontSize: 11.5,
    fontFamily: 'Inter_500Medium',
    color: Colors.gold,
    marginTop: 2,
    opacity: 0.85,
  },
  version: {
    fontSize: 10,
    fontFamily: 'Inter_400Regular',
    color: 'rgba(255,255,255,0.22)',
    textAlign: 'center',
    paddingBottom: 4,
    letterSpacing: 0.5,
  },
  collapseBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 7,
    borderRadius: 8,
    marginBottom: 4,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : {}),
  },
  collapseBtnText: {
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
    color: 'rgba(255,255,255,0.3)',
    letterSpacing: 0.2,
  },
  footerIconOnly: {
    alignItems: 'center',
    paddingHorizontal: 0,
    paddingVertical: 10,
  },
  expandBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : {}),
  },
  ceoBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginHorizontal: 16,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: 'rgba(255,215,0,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,215,0,0.3)',
  },
  ceoBadgeText: {
    fontSize: 12,
    fontFamily: 'Inter_700Bold',
    color: '#FFD700',
  },
  licCard: {
    flexDirection: 'row',
    marginHorizontal: 12,
    marginBottom: 10,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  licCardStripe: {
    width: 4,
    borderRadius: 0,
  },
  licCardBody: {
    flex: 1,
    padding: 10,
    gap: 6,
  },
  licCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  licCardStatus: {
    fontSize: 9,
    fontFamily: 'Inter_700Bold',
    letterSpacing: 1.2,
  },
  licCardDaysRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  licCardDaysNum: {
    fontSize: 36,
    fontFamily: 'Inter_700Bold',
    lineHeight: 40,
  },
  licCardDaysLabel: {
    fontSize: 9,
    fontFamily: 'Inter_700Bold',
    color: 'rgba(255,255,255,0.35)',
    letterSpacing: 1.5,
    lineHeight: 13,
  },
  licCardBarTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  licCardBarFill: {
    height: '100%',
    borderRadius: 2,
  },
  licCardExpiry: {
    fontSize: 10,
    fontFamily: 'Inter_400Regular',
    color: 'rgba(255,255,255,0.35)',
  },
  /* ── Acesso Rápido — estilos compactos modernos ── */
  quickSection: {
    paddingHorizontal: 10,
    paddingTop: 4,
    paddingBottom: 6,
    gap: 2,
  },
  quickSectionLabel: {
    fontSize: 9,
    fontFamily: 'Inter_700Bold',
    color: 'rgba(255,255,255,0.25)',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    paddingHorizontal: 6,
    paddingTop: 8,
    paddingBottom: 6,
  },
  quickItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 11,
    marginBottom: 2,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : {}),
  },
  quickItemIcon: {
    width: 32,
    height: 32,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    flexShrink: 0,
  },
  quickItemBody: {
    flex: 1,
    minWidth: 0,
  },
  quickItemTitle: {
    fontSize: 12.5,
    fontFamily: 'Inter_600SemiBold',
    color: 'rgba(255,255,255,0.82)',
    letterSpacing: 0.1,
  },
  quickItemSub: {
    fontSize: 10,
    fontFamily: 'Inter_400Regular',
    color: 'rgba(255,255,255,0.38)',
    marginTop: 1,
  },
  quickItemBadge: {
    backgroundColor: 'rgba(255,69,58,0.18)',
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderWidth: 1,
    borderColor: 'rgba(255,69,58,0.35)',
  },
  quickItemBadgeText: {
    fontSize: 7.5,
    fontFamily: 'Inter_700Bold',
    color: '#FF453A',
    letterSpacing: 0.8,
  },
});


const drawerSinoStyles = StyleSheet.create({
  sinoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(255,159,10,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255,159,10,0.45)',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginHorizontal: 12,
    marginBottom: 8,
  },
  sinoIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,159,10,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  sinoBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 4,
    backgroundColor: '#FF453A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sinoBadgeText: {
    color: '#fff',
    fontSize: 9,
    fontFamily: 'Inter_700Bold',
  },
  sinoTitle: {
    fontSize: 12,
    fontFamily: 'Inter_700Bold',
    color: '#FF9F0A',
  },
  sinoSub: {
    fontSize: 10,
    fontFamily: 'Inter_400Regular',
    color: 'rgba(255,255,255,0.55)',
    marginTop: 1,
  },
});
