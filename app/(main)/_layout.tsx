import React, { useEffect, useCallback, useRef, useState, useMemo } from 'react';
import { View, StyleSheet, Text } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Colors } from '@/constants/colors';
import AppLoader from '@/components/AppLoader';
import DrawerLeft from '@/components/DrawerLeft';
import DrawerRight from '@/components/DrawerRight';
import { useAuth, getAuthToken } from '@/context/AuthContext';
import { useLicense } from '@/context/LicenseContext';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import SessionTimeoutModal, { useSessionTimeout } from '@/components/SessionTimeoutModal';
import SubscricaoExpiradaModal from '@/components/SubscricaoExpiradaModal';
import ToastManager from '@/components/ToastManager';
import WelcomeModal from '@/components/WelcomeModal';
import FloatingChatButton from '@/components/FloatingChatButton';
import ExpiringBanner from '@/components/ExpiringBanner';
import SessaoLocalBadge from '@/components/SessaoLocalBadge';
import { AIAssistantProvider } from '@/context/AIAssistantContext';
import { TourProvider } from '@/contexts/TourContext';
import BottomNavBar, { BOTTOM_NAV_HEIGHT } from '@/components/BottomNavBar';
import { useRealtimeSocket } from '@/hooks/useRealtimeSocket';
import { useRealtimeInvalidator } from '@/hooks/useRealtimeInvalidator';
import DadosFaltaModal from '@/components/DadosFaltaModal';
import PerfilIncompletoBanner from '@/components/PerfilIncompletoBanner';
import { webAlert } from '@/utils/webAlert';

interface GraceInfo {
  emGracePeriod?: boolean;
  diasRestantes?: number | null;
  gracePeriodDias?: number;
  diasToleranciaRestantes?: number;
}

export default function MainLayout() {
  const { user, isLoading: authLoading, logout } = useAuth();
  const { isLicencaValida, diasRestantes, isLoading: licLoading } = useLicense();
  const [graceInfo, setGraceInfo] = useState<GraceInfo | null>(null);
  const [graceChecked, setGraceChecked] = useState(false);
  const router = useRouter();
  const { isDesktop } = useBreakpoint();
  const [showWelcome, setShowWelcome] = useState(false);
  const [showSubscricaoExpirada, setShowSubscricaoExpirada] = useState(false);
  const [diasToleranciaAviso, setDiasToleranciaAviso] = useState(0);
  const firstLoadChecked = useRef(false);
  const toleranciaAvisoMostrado = useRef(false);
  const graceCheckUserId = useRef<string | null>(null);
  const dadosFaltaChecked = useRef<string | null>(null);
  const [dadosFaltaInfo, setDadosFaltaInfo] = useState<any>(null);
  const [showDadosFalta, setShowDadosFalta] = useState(false);
  const [dadosFaltaSkips, setDadosFaltaSkips] = useState(3);
  const [dadosFaltaSessoes, setDadosFaltaSessoes] = useState(0);
  const [showPerfilBanner, setShowPerfilBanner] = useState(false);

  // Chaves de armazenamento por utilizador
  const skipsKey    = user ? `siga_dados_falta_skips_${user.id}`    : null; // sessionStorage — skips desta sessão
  const sessoesKey  = user ? `siga_perfil_sessoes_${user.id}`        : null; // localStorage  — sessões consecutivas com dados em falta

  // Carregar contagem de skips restantes da sessão actual
  useEffect(() => {
    if (!skipsKey || !sessoesKey) return;
    try {
      // Skips dentro desta sessão
      const storedSkips = sessionStorage.getItem(skipsKey);
      const sessoesUsadas = parseInt(localStorage.getItem(sessoesKey) ?? '0', 10) || 0;
      setDadosFaltaSessoes(sessoesUsadas);
      // Se já esgotou as 3 sessões → sem possibilidade de skip
      if (sessoesUsadas >= 3) {
        setDadosFaltaSkips(0);
      } else if (storedSkips !== null) {
        setDadosFaltaSkips(parseInt(storedSkips, 10));
      } else {
        setDadosFaltaSkips(3);
      }
    } catch {}
  }, [skipsKey, sessoesKey]);

  // Ligação WebSocket global — todos os utilizadores autenticados recebem actualizações em tempo real
  useRealtimeSocket(user?.role, undefined);

  // Invalidação automática de queries em tempo real — qualquer mutação no servidor
  // (POST/PUT/PATCH/DELETE) propaga-se via WS e actualiza imediatamente os dados no ecrã
  useRealtimeInvalidator();

  // Papéis isentos de bloqueio por expiração de licença
  const roleIsento = (r?: string) => r === 'ceo' || r === 'aluno' || r === 'estudante' || r === 'encarregado';

  // Buscar info de grace period do servidor (apenas para utilizadores não isentos)
  // Depende de user?.id (string estável) em vez do objecto user inteiro para evitar
  // que o efeito re-corra quando o objecto é recriado (ex: após WS/TanStack Query)
  // sem que o utilizador tenha mudado — o que causava um flash do spinner.
  useEffect(() => {
    if (!user || authLoading) {
      graceCheckUserId.current = null;
      setGraceChecked(true);
      return;
    }
    if (roleIsento(user.role)) {
      graceCheckUserId.current = user.id;
      setGraceChecked(true);
      return;
    }
    // Já verificado para este utilizador — não repetir para evitar flash
    if (graceCheckUserId.current === user.id) return;
    graceCheckUserId.current = user.id;

    let alive = true;
    setGraceChecked(false);
    (async () => {
      try {
        const tok = (await getAuthToken()) || '';
        const r = await fetch('/api/licenca/expiracao-info', {
          headers: tok ? { Authorization: `Bearer ${tok}` } : {},
        });
        if (r.ok && alive) {
          const data = await r.json();
          setGraceInfo(data);
        }
      } catch {}
      finally {
        if (alive) setGraceChecked(true);
      }
    })();
    return () => { alive = false; };
  }, [user?.id, authLoading]);

  // Redireccionar se não autenticado
  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace('/login' as any);
      return;
    }
    if (!firstLoadChecked.current) {
      firstLoadChecked.current = true;
      setShowWelcome(true);
    }
  }, [user, authLoading, router]);

  // Verificar dados em falta após o utilizador entrar na app
  useEffect(() => {
    if (!user || authLoading) return;
    const rolesComDados = ['professor', 'aluno', 'rh', 'financeiro'];
    if (!rolesComDados.includes(user.role)) return;
    if (dadosFaltaChecked.current === user.id) return;
    dadosFaltaChecked.current = user.id;
    (async () => {
      try {
        const tok = await getAuthToken();
        const r = await fetch('/api/meu-perfil/dados-falta', {
          headers: tok ? { Authorization: `Bearer ${tok}` } : {},
        });
        if (!r.ok) return;
        const data = await r.json();
        if (data.temDadosFalta) {
          setDadosFaltaInfo(data);
          // Incrementar contador de sessões com dados em falta (localStorage)
          try {
            const key = `siga_perfil_sessoes_${user.id}`;
            const prev = parseInt(localStorage.getItem(key) ?? '0', 10) || 0;
            const novo = prev + 1;
            localStorage.setItem(key, String(novo));
            setDadosFaltaSessoes(novo);
            // Se esgotou as 3 sessões → forçar skips a 0
            if (novo >= 3) setDadosFaltaSkips(0);
          } catch {}
          setTimeout(() => setShowDadosFalta(true), 1200);
        }
      } catch {}
    })();
  }, [user?.id, authLoading]);

  // Decisão de bloqueio: só calcula quando tudo está carregado
  const decisaoLicenca = useMemo(() => {
    if (authLoading || licLoading || !graceChecked) return 'pendente' as const;
    if (!user) return 'pendente' as const;
    if (roleIsento(user.role)) return 'permitido' as const;
    // Tolerância só vale enquanto restar pelo menos 1 dia
    const restGrace = graceInfo?.diasToleranciaRestantes ?? 0;
    if (graceInfo?.emGracePeriod && restGrace > 0) return 'tolerancia' as const;
    if (!isLicencaValida || diasRestantes < 0) return 'bloqueado' as const;
    return 'permitido' as const;
  }, [authLoading, licLoading, graceChecked, user, graceInfo, isLicencaValida, diasRestantes]);

  // Redireccionar para tela de subscrição se bloqueado
  useEffect(() => {
    if (decisaoLicenca === 'bloqueado') {
      router.replace('/licenca' as any);
    }
  }, [decisaoLicenca, router]);

  // Mostrar aviso uma vez de "X dias de tolerância" ao entrar
  useEffect(() => {
    if (decisaoLicenca !== 'tolerancia') return;
    if (toleranciaAvisoMostrado.current) return;
    toleranciaAvisoMostrado.current = true;
    const restGrace = graceInfo?.diasToleranciaRestantes
      ?? Math.max(0, (graceInfo?.gracePeriodDias || 2) + (graceInfo?.diasRestantes || 0));
    const t = setTimeout(() => {
      setDiasToleranciaAviso(restGrace);
      setShowSubscricaoExpirada(true);
    }, 800);
    return () => clearTimeout(t);
  }, [decisaoLicenca, graceInfo]);

  // Aviso antes de terminar sessão se dados ainda em falta
  const handleSessionLogout = useCallback(async () => {
    if (dadosFaltaInfo) {
      const confirmed = await new Promise<boolean>(resolve => {
        webAlert(
          'Perfil Incompleto',
          'Os seus dados de perfil ainda estão em falta.\n\nNo próximo login será novamente solicitado a preencher. Após 3 sessões sem preencher, o acesso ficará bloqueado.\n\nDeseja terminar sessão mesmo assim?',
          [
            { text: 'Cancelar', style: 'cancel', onPress: () => resolve(false) },
            { text: 'Terminar Sessão', style: 'destructive', onPress: () => resolve(true) },
          ]
        );
      });
      if (!confirmed) return;
    }
    try { if (skipsKey) sessionStorage.removeItem(skipsKey); } catch {}
    await logout();
    router.replace('/login' as any);
  }, [logout, router, dadosFaltaInfo, skipsKey]);

  const { showModal, countdown, lastActivity, handleContinue, handleLogout } = useSessionTimeout(
    handleSessionLogout,
    !!user,
    user?.role
  );

  // ── Bloquear renderização até a verificação de licença estar concluída ──
  // Isto evita o "flicker" em que o dashboard aparece e logo a seguir é fechado.
  if (decisaoLicenca === 'pendente' || decisaoLicenca === 'bloqueado' || !user) {
    return (
      <View style={styles.blockingContainer}>
        <AppLoader />
        {decisaoLicenca === 'bloqueado' && (
          <Text style={styles.blockingText}>A redireccionar para a área de subscrição…</Text>
        )}
      </View>
    );
  }

  return (
    <TourProvider>
    <AIAssistantProvider>
    <View style={isDesktop ? styles.desktopContainer : styles.container}>
      {isDesktop && <DrawerLeft temPerfilIncompleto={!!dadosFaltaInfo} />}
      <View style={isDesktop ? styles.desktopContent : styles.flex}>
        <SessaoLocalBadge />
        <ExpiringBanner />
        {showPerfilBanner && dadosFaltaInfo && (
          <PerfilIncompletoBanner
            sessoesUsadas={dadosFaltaSessoes}
            onCompletar={() => {
              setShowPerfilBanner(false);
              setShowDadosFalta(true);
            }}
          />
        )}
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: Colors.background, paddingBottom: isDesktop ? 0 : BOTTOM_NAV_HEIGHT } }}>
          <Stack.Screen name="dashboard" />
          <Stack.Screen name="alunos" />
          <Stack.Screen name="professores" />
          <Stack.Screen name="turmas" />
          <Stack.Screen name="salas" />
          <Stack.Screen name="notas" />
          <Stack.Screen name="presencas" />
          <Stack.Screen name="eventos" />
          <Stack.Screen name="relatorios" />
          <Stack.Screen name="horario" />
          <Stack.Screen name="grelha" />
          <Stack.Screen name="financeiro" />
          <Stack.Screen name="notificacoes" />
          <Stack.Screen name="perfil" />
          <Stack.Screen name="admin" />
          <Stack.Screen name="historico" />
          <Stack.Screen name="ceo" />
          <Stack.Screen name="professor-hub" />
          <Stack.Screen name="professor-pauta" />
          <Stack.Screen name="professor-turmas" />
          <Stack.Screen name="professor-mensagens" />
          <Stack.Screen name="professor-materiais" />
          <Stack.Screen name="professor-sumario" />
          <Stack.Screen name="rh-controle" />
          <Stack.Screen name="portal-estudante" />
          <Stack.Screen name="secretaria-hub" />
          <Stack.Screen name="gestao-academica" />
          <Stack.Screen name="editor-documentos" />
          <Stack.Screen name="boletim-matricula" />
          <Stack.Screen name="boletim-propina" />
          <Stack.Screen name="boletins-secretaria" />
          <Stack.Screen name="gestao-acessos" />
          <Stack.Screen name="portal-encarregado" />

          <Stack.Screen name="acompanhamento-pautas" />
          <Stack.Screen name="admissao" />
          <Stack.Screen name="organizar-turmas" />
          <Stack.Screen name="visao-geral" />
          <Stack.Screen name="rh-hub" />
          <Stack.Screen name="rh-payroll" />
          <Stack.Screen name="pedagogico" />
          <Stack.Screen name="calendario-academico" />
          <Stack.Screen name="biblioteca" />
          <Stack.Screen name="bolsas" />
          <Stack.Screen name="avaliacao-professores" />
          <Stack.Screen name="desempenho-professores" />
          <Stack.Screen name="chat-interno" />
          <Stack.Screen name="auditoria" />
          <Stack.Screen name="med-integracao" />
          <Stack.Screen name="pagamentos-hub" />
          <Stack.Screen name="documentos-hub" />
          <Stack.Screen name="exclusoes-faltas" />
          <Stack.Screen name="quadro-honra" />
          <Stack.Screen name="disciplinas" />
          <Stack.Screen name="trabalhos-finais" />
          <Stack.Screen name="transferencias" />
          <Stack.Screen name="desempenho" />
          <Stack.Screen name="extrato-propinas" />
          <Stack.Screen name="professor-plano-aula" />
          <Stack.Screen name="gerar-documento" />
          <Stack.Screen name="rh-faltas-tempos" />
          <Stack.Screen name="director-turma" />
          <Stack.Screen name="relatorio-faltas" />
          <Stack.Screen name="relatorio-transicao-condicional" />
          <Stack.Screen name="exame-extraordinario" />
          <Stack.Screen name="exame-recurso" />
          <Stack.Screen name="melhoria-nota" />
          <Stack.Screen name="diario-classe" />
          <Stack.Screen name="finalistas" />
          <Stack.Screen name="alumni" />
          <Stack.Screen name="arquivo-documentos" />
          <Stack.Screen name="arquivo-pautas" />
          <Stack.Screen name="pauta-rapida" />
          <Stack.Screen name="aluno-perfil" />
          <Stack.Screen name="estudio-emissao" />
          <Stack.Screen name="centro-emissao" />
          <Stack.Screen name="rupes-historico" />
          <Stack.Screen name="tesouraria" />
          <Stack.Screen name="solicitacoes-secretaria" />
          <Stack.Screen name="assistente" />
        </Stack>
        {isDesktop && <DrawerRight />}
      </View>
      {!isDesktop && <DrawerLeft temPerfilIncompleto={!!dadosFaltaInfo} />}
      {!isDesktop && <DrawerRight />}
      <SessionTimeoutModal
        visible={showModal}
        countdown={countdown}
        lastActivity={lastActivity}
        onContinue={handleContinue}
        onLogout={handleLogout}
      />
      <ToastManager />
      <FloatingChatButton />
      {!isDesktop && <BottomNavBar />}
      <WelcomeModal
        visible={showWelcome}
        user={user}
        onFinish={() => setShowWelcome(false)}
      />
      <SubscricaoExpiradaModal
        visible={showSubscricaoExpirada}
        diasTolerancia={diasToleranciaAviso}
        onClose={() => setShowSubscricaoExpirada(false)}
        onRenovar={() => {
          setShowSubscricaoExpirada(false);
          router.push('/licenca' as any);
        }}
      />
      <DadosFaltaModal
        visible={showDadosFalta}
        info={dadosFaltaInfo}
        skipsLeft={dadosFaltaSkips}
        onCompleted={() => {
          setShowDadosFalta(false);
          setDadosFaltaInfo(null);
          setShowPerfilBanner(false);
          setDadosFaltaSessoes(0);
          // Limpar contadores — dados preenchidos com sucesso
          try {
            if (skipsKey) sessionStorage.removeItem(skipsKey);
            if (sessoesKey) localStorage.removeItem(sessoesKey);
          } catch {}
        }}
        onSkip={() => {
          const newSkips = Math.max(0, dadosFaltaSkips - 1);
          setDadosFaltaSkips(newSkips);
          try { if (skipsKey) sessionStorage.setItem(skipsKey, String(newSkips)); } catch {}
          if (newSkips > 0) {
            setShowDadosFalta(false);
            setShowPerfilBanner(true);
          }
          // Se newSkips === 0 → modal fica visível sem botão skip
        }}
      />
    </View>
    </AIAssistantProvider>
    </TourProvider>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    position: 'relative',
    overflow: 'hidden',
  } as any,
  desktopContainer: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: Colors.background,
    position: 'relative',
    overflow: 'hidden',
  } as any,
  desktopContent: {
    flex: 1,
    position: 'relative',
    overflow: 'hidden',
  } as any,
  blockingContainer: {
    flex: 1,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
  },
  blockingText: {
    fontSize: 13,
    fontFamily: 'Inter_500Medium',
    color: Colors.textMuted,
    textAlign: 'center',
    paddingHorizontal: 32,
  },
});
