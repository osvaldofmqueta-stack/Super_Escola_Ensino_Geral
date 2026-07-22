import React, { useRef, useEffect, useState, useMemo } from 'react';
import {
  TouchableOpacity, View, Text, StyleSheet, Animated, Platform,
  Modal, ScrollView, FlatList, TextInput, KeyboardAvoidingView, ActivityIndicator,
  useWindowDimensions, Image, Alert,
} from 'react-native';
import { BOTTOM_NAV_HEIGHT } from '@/components/BottomNavBar';
import MarkdownText from '@/components/MarkdownText';
import AppLoader from '@/components/AppLoader';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { usePathname, useRouter } from 'expo-router';
import { Colors } from '@/constants/colors';
import { useChatInterno, type ChatAnexo } from '@/context/ChatInternoContext';
import { useAuth, getAuthToken } from '@/context/AuthContext';
import { useUsers } from '@/context/UsersContext';
import { getRoleLabel } from '@/utils/genero';
import { StableSearchInput } from '@/components/StableSearchInput';
import { useAIAssistant } from '@/context/AIAssistantContext';
import { labelData } from '@/lib/tempoRelativo';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { showToast } from '@/utils/toast';

const HIDDEN_ROUTES = ['/chat-interno', '/(main)/chat-interno'];

function TypingDotsIndicator() {
  const dot1 = useRef(new Animated.Value(0)).current;
  const dot2 = useRef(new Animated.Value(0)).current;
  const dot3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const createDotAnim = (dot: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(dot, { toValue: -7, duration: 320, useNativeDriver: false }),
          Animated.timing(dot, { toValue: 0, duration: 320, useNativeDriver: false }),
          Animated.delay(700),
        ])
      );
    const a1 = createDotAnim(dot1, 0);
    const a2 = createDotAnim(dot2, 160);
    const a3 = createDotAnim(dot3, 320);
    a1.start(); a2.start(); a3.start();
    return () => { a1.stop(); a2.stop(); a3.stop(); };
  }, []);

  const dotBase: object = {
    width: 9, height: 9, borderRadius: 5,
    marginHorizontal: 3.5,
  };

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 4 }}>
      <Animated.View style={[dotBase, { backgroundColor: '#7C9BFF', transform: [{ translateY: dot1 }] }]} />
      <Animated.View style={[dotBase, { backgroundColor: '#A78BFA', transform: [{ translateY: dot2 }] }]} />
      <Animated.View style={[dotBase, { backgroundColor: '#7C9BFF', opacity: 0.7, transform: [{ translateY: dot3 }] }]} />
    </View>
  );
}

function AuthImage({ url, style, thumbStyle }: { url: string; style?: object; thumbStyle?: object }) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    let revoked = false;
    let objectUrl = '';
    (async () => {
      try {
        const tok = await getAuthToken();
        const r = await fetch(url, { headers: tok ? { Authorization: `Bearer ${tok}` } : {} });
        if (!r.ok) throw new Error('erro');
        const blob = await r.blob();
        objectUrl = URL.createObjectURL(blob);
        if (!revoked) { setBlobUrl(objectUrl); setLoading(false); }
      } catch {
        if (!revoked) { setError(true); setLoading(false); }
      }
    })();
    return () => { revoked = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [url]);

  if (Platform.OS !== 'web') return null;

  const containerStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.15)', overflow: 'hidden',
    borderRadius: 10,
    ...(style as React.CSSProperties ?? {}),
  };

  if (loading) {
    return (
      <View style={[{ alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.15)', borderRadius: 10 }, style as any]}>
        <ActivityIndicator size="small" color={Colors.primary} />
      </View>
    );
  }
  if (error || !blobUrl) {
    return (
      <View style={[{ alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.15)', borderRadius: 10, gap: 4 }, style as any]}>
        <Ionicons name="image-outline" size={22} color={Colors.textMuted} />
      </View>
    );
  }

  return (
    // @ts-ignore — usar img nativo no web para carregar com blob URL autenticado
    <img src={blobUrl} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 10, display: 'block', ...(thumbStyle as React.CSSProperties ?? {}) }} alt="imagem" />
  );
}

const ROLE_COLORS: Record<string, string> = {
  admin: '#8B5CF6', director: '#EF4444', secretaria: '#F59E0B',
  chefe_secretaria: '#D97706', professor: '#3B82F6', financeiro: '#10B981',
  rh: '#EC4899', ceo: '#6366F1', pca: '#6366F1',
};

function roleColor(role: string) {
  return ROLE_COLORS[role] ?? '#64748B';
}


function Avatar({ name, role, size = 40, online }: { name: string; role: string; size?: number; online?: boolean }) {
  const initials = name.split(' ').slice(0, 2).map((w: string) => w[0]).join('').toUpperCase();
  const rc = roleColor(role);
  return (
    <View style={{ position: 'relative', width: size, height: size }}>
      <View style={[{
        width: size, height: size, borderRadius: size / 2,
        backgroundColor: rc + '22',
        borderWidth: 1.5, borderColor: rc + '60',
        alignItems: 'center', justifyContent: 'center',
      }]}>
        <Text style={{ color: rc, fontFamily: 'Inter_700Bold', fontSize: size * 0.36 }}>{initials}</Text>
      </View>
      {online && (
        <View style={{
          position: 'absolute', bottom: 0, right: 0,
          width: size * 0.28, height: size * 0.28,
          borderRadius: size * 0.14,
          backgroundColor: '#22C55E',
          borderWidth: 2, borderColor: '#0F1829',
        }} />
      )}
    </View>
  );
}

interface StaffContact { id: string; nome: string; role: string; escola: string; }

interface AiAction { label: string; route: string; icon: string; }
interface AiMessage { id: string; role: 'user' | 'assistant'; content: string; ts: Date; rating?: 'up' | 'down'; actions?: AiAction[]; provider?: string; streaming?: boolean; error?: boolean; retryMsg?: string; }
interface DynSug { text: string; icon: string; urgent?: boolean; }
interface HistoryConversa { id: string; titulo: string; mensagens: any[]; criado_em: string; atualizado_em: string; }

const AI_QUICK_PROMPTS: Record<string, string[]> = {
  aluno: [
    'Qual é a minha média actual?',
    'Tenho propinas em atraso?',
    'Qual é o meu horário de hoje?',
    'Como posso pedir um documento?',
    'Quantas faltas tenho este mês?',
  ],
  encarregado: [
    'Como estão as notas do meu educando?',
    'Tem propinas em atraso?',
    'Quando é a próxima reunião?',
    'Quais são as faltas do mês?',
    'Como contacto a secretaria?',
  ],
  professor: [
    'Que turmas tenho hoje?',
    'Como lançar notas de avaliação?',
    'Tenho pautas por fechar?',
    'Como registar presenças?',
    'Como criar um sumário?',
  ],
  secretaria: [
    'Como processar uma matrícula?',
    'Como emitir uma declaração?',
    'Quais os documentos necessários?',
    'Como registar um novo aluno?',
    'Como gerar um boletim?',
  ],
  chefe_secretaria: [
    'Quais os processos pendentes?',
    'Como gerar relatório de matrículas?',
    'Quem está em falta na secretaria?',
    'Como supervisionar os documentos?',
    'Relatório de inscrições do mês',
  ],
  financeiro: [
    'Quais as propinas em atraso?',
    'Como emitir um recibo?',
    'Total cobrado este mês?',
    'Como registar um pagamento?',
    'Alunos com dívidas acima de 30 dias',
  ],
  director: [
    'Resumo académico do mês',
    'Situação financeira geral',
    'Quantos alunos estão matriculados?',
    'Turmas com mais faltas?',
    'Professores com pautas em atraso',
  ],
  admin: [
    'Como criar um novo utilizador?',
    'Como configurar o ano lectivo?',
    'Como definir permissões?',
    'Como fazer backup da base de dados?',
    'Como activar um módulo?',
  ],
  rh: [
    'Como registar uma falta de funcionário?',
    'Processar folha salarial do mês',
    'Funcionários em contrato temporário',
    'Como emitir recibo de ordenado?',
    'Relatório de presenças do pessoal',
  ],
  ceo: [
    'Indicadores chave do mês',
    'Comparativo de receita vs despesa',
    'Taxa de retenção de alunos',
    'Desempenho académico global',
    'Situação da licença e subscrição',
  ],
  pca: [
    'Relatório executivo do mês',
    'Indicadores de governança',
    'Situação financeira consolidada',
    'Desempenho por área',
    'Pontos de atenção prioritários',
  ],
};

const AI_WELCOME = (role: string): string => {
  const greetings: Record<string, string> = {
    aluno: 'Olá! Sou o teu assistente escolar. Posso ajudar-te com notas, propinas, horários, faltas e documentos. Como posso ajudar?',
    encarregado: 'Olá! Sou o assistente de apoio aos encarregados de educação. Posso ajudar com informações sobre o seu educando. Como posso ajudar?',
    professor: 'Olá! Sou o seu assistente pedagógico. Posso ajudar com pautas, presenças, turmas e muito mais. O que precisa?',
    secretaria: 'Olá! Sou o assistente da secretaria. Posso ajudar com matrículas, documentos e procedimentos administrativos. O que precisa?',
    chefe_secretaria: 'Olá! Sou o seu assistente de gestão. Posso ajudar com supervisão de processos, documentos e relatórios. O que precisa?',
    financeiro: 'Olá! Sou o assistente financeiro. Posso ajudar com propinas, pagamentos, cobranças e relatórios financeiros. O que precisa?',
    director: 'Olá! Sou o assistente da direção. Tenho acesso a informação global sobre académico, financeiro e pessoal. Como posso ajudar?',
    admin: 'Olá! Sou o assistente do administrador. Posso ajudar com configuração, utilizadores, permissões e todos os módulos. O que precisa?',
    rh: 'Olá! Sou o assistente de Recursos Humanos. Posso ajudar com gestão de pessoal, contratos e relatórios RH. O que precisa?',
    ceo: 'Olá! Sou o seu assistente executivo. Posso ajudar com indicadores globais, relatórios e informação estratégica. O que precisa?',
    pca: 'Olá! Sou o seu assistente de governança. Posso ajudar com indicadores globais, relatórios e tomada de decisão. O que precisa?',
  };
  return greetings[role] ?? 'Olá! Sou o assistente do sistema Super Escola. Como posso ajudar?';
};

export default function FloatingChatButton() {
  const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = useWindowDimensions();
  const isWeb = Platform.OS === 'web';
  const isMobileSize = SCREEN_WIDTH < 768;
  const isDesktop = isWeb && !isMobileSize;
  const PANEL_W = isDesktop ? Math.min(SCREEN_WIDTH * 0.38, 420) : Math.min(SCREEN_WIDTH - 16, 420);
  const PANEL_H = isDesktop ? Math.min(SCREEN_HEIGHT * 0.88, 720) : Math.min(SCREEN_HEIGHT * 0.85, 680);

  const pathname = usePathname();
  const { unreadTotal, conversations, sendMensagem, markConversationRead, isLoading, loadMensagens } = useChatInterno();
  const { user } = useAuth();
  const { users: utilizadores } = useUsers();
  const { registerOpenPanel } = useAIAssistant();

  const scaleAnim = useRef(new Animated.Value(1)).current;
  const badgeAnim = useRef(new Animated.Value(0)).current;
  const prevUnread = useRef(0);
  const dragStartY = useRef(0);
  const flatListRef = useRef<FlatList>(null);
  const aiScrollRef = useRef<ScrollView>(null);

  const [panelOpen, setPanelOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'mensagens' | 'assistente'>('mensagens');
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);
  const [showNewChat, setShowNewChat] = useState(false);
  const [searchContact, setSearchContact] = useState('');

  const [aiMessages, setAiMessages] = useState<AiMessage[]>([]);
  const [aiInput, setAiInput] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiProvider, setAiProvider] = useState('Google Gemini');
  const [aiModel, setAiModel] = useState('gemini-2.0-flash');
  const [voiceActive, setVoiceActive] = useState(false);
  const [speakingMsgId, setSpeakingMsgId] = useState<string | null>(null);
  const [dynSugs, setDynSugs] = useState<DynSug[]>([]);
  // ── Histórico de conversas ────────────────────────────────────────────────
  const [showHistory, setShowHistory] = useState(false);
  const [historyConversas, setHistoryConversas] = useState<HistoryConversa[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const currentConversaIdRef = useRef<string | null>(null);
  const recRef = useRef<any>(null);
  const router = useRouter();

  const [pendingAnexos, setPendingAnexos] = useState<ChatAnexo[]>([]);
  const [uploadingFile, setUploadingFile] = useState(false);

  const { data: onlineData } = useQuery({
    queryKey: ['chat-online-users'],
    queryFn: () => api.get<{ onlineIds: string[] }>('/api/chat-interno/online-users').then(r => r.onlineIds ?? []),
    staleTime: 20_000,
    refetchInterval: 30_000,
    enabled: panelOpen,
  });
  const onlineSet = useMemo(() => new Set<string>(onlineData ?? []), [onlineData]);

  useEffect(() => {
    if (user?.role && aiMessages.length === 0) {
      setAiMessages([{
        id: 'welcome',
        role: 'assistant',
        content: AI_WELCOME(user.role),
        ts: new Date(),
      }]);
    }
  }, [user?.role]);

  useEffect(() => {
    registerOpenPanel(() => {
      setActiveTab('assistente');
      setPanelOpen(true);
    });
  }, [registerOpenPanel]);

  const staffContacts: StaffContact[] = useMemo(() => {
    if (!utilizadores) return [];
    const staffRoles = ['admin', 'director', 'secretaria', 'chefe_secretaria', 'professor', 'financeiro', 'rh', 'ceo', 'pca'];
    return utilizadores
      .filter((u: any) => u.id !== user?.id && staffRoles.includes(u.role) && u.ativo !== false)
      .sort((a: any, b: any) => a.nome.localeCompare(b.nome));
  }, [utilizadores, user]);

  const filteredContacts = useMemo(() => {
    const q = searchContact.toLowerCase().trim();
    if (!q) return staffContacts;
    return staffContacts.filter((c: StaffContact) =>
      c.nome.toLowerCase().includes(q) ||
      getRoleLabel(c.role, (c as any).genero).toLowerCase().includes(q)
    );
  }, [staffContacts, searchContact]);

  const selectedConv = useMemo(
    () => conversations.find(c => c.userId === selectedUserId),
    [conversations, selectedUserId]
  );

  const selectedContact = useMemo(
    () => staffContacts.find(c => c.id === selectedUserId),
    [staffContacts, selectedUserId]
  );

  useEffect(() => {
    if (unreadTotal > prevUnread.current) {
      const nd = Platform.OS !== 'web';
      Animated.sequence([
        Animated.spring(scaleAnim, { toValue: 1.25, useNativeDriver: nd, speed: 20 }),
        Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: nd, speed: 20 }),
      ]).start();
      Animated.spring(badgeAnim, { toValue: 1, useNativeDriver: nd, speed: 20, bounciness: 14 }).start();
    }
    prevUnread.current = unreadTotal;
  }, [unreadTotal]);

  useEffect(() => {
    if (selectedUserId) markConversationRead(selectedUserId);
  }, [selectedUserId, conversations]);

  useEffect(() => {
    if (flatListRef.current && selectedConv?.msgs.length) {
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [selectedConv?.msgs?.length]);

  useEffect(() => {
    if (aiMessages.length > 0) {
      setTimeout(() => aiScrollRef.current?.scrollToEnd({ animated: true }), 150);
    }
  }, [aiMessages.length]);

  useEffect(() => {
    if (!user?.role) return;
    (async () => {
      try {
        const tok = await getAuthToken();
        const r = await fetch('/api/ai-dynamic-suggestions', { headers: tok ? { Authorization: `Bearer ${tok}` } : {} });
        if (r.ok) { const d = await r.json(); setDynSugs(Array.isArray(d) ? d : []); }
      } catch { }
    })();
  }, [user?.role]);

  const isHidden = HIDDEN_ROUTES.some(() => pathname?.includes('chat-interno'));
  if (isHidden) return null;

  async function handleSend() {
    if ((!inputText.trim() && pendingAnexos.length === 0) || !selectedUserId || sending) return;
    const contact = selectedContact ?? { nome: selectedConv?.userName ?? '', role: selectedConv?.userRole ?? '' };
    setSending(true);
    const anexosToSend = [...pendingAnexos];
    try {
      await sendMensagem(selectedUserId, contact.nome, contact.role, inputText.trim(), anexosToSend);
      setInputText('');
      setPendingAnexos([]);
    } catch (err: any) {
      const isAuth = err?.message?.includes('401') || err?.message?.includes('autenticado');
      if (isAuth) {
        showToast('Sessão expirada. Por favor faça login novamente para enviar mensagens.', 'warning', 5000);
      } else {
        showToast('Não foi possível enviar a mensagem. Verifique a ligação e tente novamente.', 'error');
      }
    } finally {
      setSending(false);
    }
  }

  async function handlePickFile() {
    if (Platform.OS !== 'web') return;
    const input = document.createElement('input');
    input.type = 'file';
    input.id = 'chat-file-upload';
    input.name = 'chat-file-upload';
    input.accept = 'image/*,application/pdf,.doc,.docx,.txt';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      if (file.size > 15 * 1024 * 1024) { showToast('Ficheiro demasiado grande (máx. 15 MB).', 'warning'); return; }
      setUploadingFile(true);
      try {
        const tok = await getAuthToken();
        const form = new FormData();
        form.append('file', file);
        const r = await fetch('/api/chat-interno/upload', {
          method: 'POST',
          headers: tok ? { Authorization: `Bearer ${tok}` } : {},
          body: form,
        });
        if (!r.ok) throw new Error('upload falhou');
        const anexo: ChatAnexo = await r.json();
        setPendingAnexos(prev => [...prev, anexo]);
      } catch {
        showToast('Não foi possível fazer upload do ficheiro.', 'error');
      } finally {
        setUploadingFile(false);
      }
    };
    input.click();
  }

  async function execAiSend(msg: string, base: AiMessage[]) {
    const streamId = (Date.now() + 1).toString();
    const history = base.filter(m => m.id !== 'welcome' && !m.error).slice(-12).map(m => ({ role: m.role, content: m.content }));
    setAiMessages(prev => [...prev, { id: streamId, role: 'assistant', content: '', ts: new Date(), streaming: true }]);
    setAiLoading(true);
    try {
      const tok = await getAuthToken();
      const res = await fetch('/api/ai-support', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: `Bearer ${tok}` } : {}) },
        body: JSON.stringify({ message: msg, history: history.slice(0, -1), stream: true, currentScreen: pathname ?? '', userName: user?.nome ?? '' }),
      });
      if (!res.ok || !res.body) throw new Error('network');
      const reader = (res.body as any).getReader();
      const decoder = new TextDecoder();
      let buf = '', full = '', finalActions: AiAction[] = [], prov = 'Google Gemini', mod = 'gemini-2.0-flash';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const parts = buf.split('\n'); buf = parts.pop() ?? '';
        for (const line of parts) {
          if (!line.startsWith('data: ')) continue;
          const raw = line.slice(6).trim();
          try {
            const p = JSON.parse(raw);
            if (p.error) throw new Error(p.error);
            if (p.chunk) {
              full += p.chunk;
              setAiMessages(prev => prev.map(m => m.id === streamId ? { ...m, content: full } : m));
              setTimeout(() => aiScrollRef.current?.scrollToEnd({ animated: false }), 0);
            }
            if (p.done) {
              finalActions = p.actions ?? [];
              prov = p.provider ?? 'Google Gemini';
              mod = (p.model ?? '').includes('gemini') ? (p.model ?? 'gemini-2.0-flash') : (p.model ?? '').includes('gpt-4o') ? 'GPT-4o' : p.model ?? 'IA';
            }
          } catch (e: any) { if (e?.message && !e.message.includes('JSON')) throw e; }
        }
      }
      setAiProvider(prov); setAiModel(mod);
      setAiMessages(prev => {
        const updated = prev.map(m => m.id === streamId ? { ...m, streaming: false, actions: finalActions, provider: prov } : m);
        // Auto-save after each AI response
        saveCurrentConversa(updated);
        return updated;
      });
    } catch {
      setAiMessages(prev => prev.map(m => m.id === streamId ? { ...m, streaming: false, error: true, content: '⚠️ Não foi possível contactar o assistente. Verifique a ligação.', retryMsg: msg } : m));
    } finally { setAiLoading(false); }
  }

  async function handleQuickPrompt(prompt: string) {
    if (aiLoading) return;
    const userMsg: AiMessage = { id: Date.now().toString(), role: 'user', content: prompt, ts: new Date() };
    const next = [...aiMessages, userMsg];
    setAiMessages(next);
    await execAiSend(prompt, next);
  }

  async function handleAiSend() {
    const msg = aiInput.trim();
    if (!msg || aiLoading) return;
    const userMsg: AiMessage = { id: Date.now().toString(), role: 'user', content: msg, ts: new Date() };
    const next = [...aiMessages, userMsg];
    setAiMessages(next); setAiInput('');
    await execAiSend(msg, next);
  }

  async function retryAiMsg(msg: AiMessage) {
    if (!msg.retryMsg || aiLoading) return;
    const cleaned = aiMessages.filter(m => m.id !== msg.id);
    setAiMessages(cleaned);
    await execAiSend(msg.retryMsg, cleaned);
  }

  function toggleSpeak(msgId: string, text: string) {
    if (Platform.OS !== 'web') return;
    const synth = (window as any).speechSynthesis as SpeechSynthesis | undefined;
    if (!synth) return;

    if (speakingMsgId === msgId) {
      synth.cancel();
      setSpeakingMsgId(null);
      return;
    }

    synth.cancel();
    // Strip markdown symbols before speaking
    const clean = text
      .replace(/\*\*(.*?)\*\*/g, '$1')
      .replace(/\*(.*?)\*/g, '$1')
      .replace(/`{1,3}[^`]*`{1,3}/g, '')
      .replace(/#+\s/g, '')
      .replace(/[-•]\s/g, '')
      .replace(/\n+/g, '. ')
      .trim();

    const utt = new SpeechSynthesisUtterance(clean);
    utt.lang = 'pt-PT';
    utt.rate = 1.0;
    utt.pitch = 1.0;

    // Try to find a Portuguese voice
    const voices = synth.getVoices();
    const ptVoice = voices.find(v => v.lang.startsWith('pt')) ?? null;
    if (ptVoice) utt.voice = ptVoice;

    utt.onend = () => setSpeakingMsgId(null);
    utt.onerror = () => setSpeakingMsgId(null);

    setSpeakingMsgId(msgId);
    synth.speak(utt);
  }

  function toggleVoice() {
    if (Platform.OS !== 'web') return;
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { showToast('O seu browser não suporta reconhecimento de voz. Use o Chrome ou Edge.', 'warning', 5000); return; }
    if (voiceActive) { recRef.current?.stop(); setVoiceActive(false); return; }
    const rec = new SR();
    rec.lang = 'pt-PT'; rec.continuous = false; rec.interimResults = false;
    rec.onresult = (e: any) => { setAiInput(prev => (prev ? prev + ' ' : '') + e.results[0][0].transcript); setVoiceActive(false); };
    rec.onerror = () => setVoiceActive(false);
    rec.onend = () => setVoiceActive(false);
    recRef.current = rec; rec.start(); setVoiceActive(true);
  }

  async function handleRating(msgId: string, rating: 'up' | 'down') {
    const msg = aiMessages.find(m => m.id === msgId);
    if (!msg || msg.rating) return;
    setAiMessages(prev => prev.map(m => m.id === msgId ? { ...m, rating } : m));
    try {
      const tok = await getAuthToken();
      const prevUserMsg = aiMessages[aiMessages.findIndex(m => m.id === msgId) - 1];
      await fetch('/api/ai-feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: `Bearer ${tok}` } : {}) },
        body: JSON.stringify({ mensagemId: msgId, mensagem: prevUserMsg?.content ?? '', resposta: msg.content, rating }),
      });
    } catch { }
  }

  function startChat(contact: StaffContact) {
    setSelectedUserId(contact.id);
    setShowNewChat(false);
    setSearchContact('');
  }

  function closePanel() {
    setPanelOpen(false);
    setSelectedUserId(null);
    setInputText('');
    setShowNewChat(false);
    setSearchContact('');
    setShowHistory(false);
    // Stop any TTS that may be playing
    if (Platform.OS === 'web') {
      (window as any).speechSynthesis?.cancel();
      setSpeakingMsgId(null);
    }
  }

  // ── Histórico ────────────────────────────────────────────────────────────
  async function loadHistory() {
    setHistoryLoading(true);
    try {
      const tok = await getAuthToken();
      const r = await fetch('/api/ai/conversas', { headers: tok ? { Authorization: `Bearer ${tok}` } : {} });
      if (r.ok) { const d = await r.json(); setHistoryConversas(Array.isArray(d) ? d : []); }
    } catch { } finally { setHistoryLoading(false); }
  }

  async function saveCurrentConversa(msgs: AiMessage[]) {
    const realMsgs = msgs.filter(m => m.id !== 'welcome' && !m.error && !m.streaming);
    if (realMsgs.length < 2) return;
    const firstUser = realMsgs.find(m => m.role === 'user');
    const titulo = firstUser ? firstUser.content.slice(0, 60) : 'Nova conversa';
    const payload = realMsgs.map(m => ({ role: m.role, content: m.content, ts: m.ts.toISOString() }));
    try {
      const tok = await getAuthToken();
      const headers = { 'Content-Type': 'application/json', ...(tok ? { Authorization: `Bearer ${tok}` } : {}) };
      if (!currentConversaIdRef.current) {
        const r = await fetch('/api/ai/conversas', { method: 'POST', headers, body: JSON.stringify({ titulo, mensagens: payload }) });
        if (r.ok) { const d = await r.json(); currentConversaIdRef.current = d.id; }
      } else {
        await fetch(`/api/ai/conversas/${currentConversaIdRef.current}`, { method: 'PUT', headers, body: JSON.stringify({ titulo, mensagens: payload }) });
      }
    } catch { }
  }

  function resumeConversa(conversa: HistoryConversa) {
    currentConversaIdRef.current = conversa.id;
    const msgs: AiMessage[] = (conversa.mensagens ?? []).map((m: any, i: number) => ({
      id: `hist-${i}`,
      role: m.role as 'user' | 'assistant',
      content: m.content,
      ts: m.ts ? new Date(m.ts) : new Date(conversa.atualizado_em),
    }));
    if (msgs.length === 0) msgs.push({ id: 'welcome', role: 'assistant', content: AI_WELCOME(user?.role ?? ''), ts: new Date() });
    setAiMessages(msgs);
    setShowHistory(false);
  }

  async function startNewConversation() {
    await saveCurrentConversa(aiMessages);
    currentConversaIdRef.current = null;
    setAiMessages([{ id: 'welcome', role: 'assistant', content: AI_WELCOME(user?.role ?? ''), ts: new Date() }]);
    setShowHistory(false);
  }

  async function deleteHistoryConversa(id: string) {
    try {
      const tok = await getAuthToken();
      await fetch(`/api/ai/conversas/${id}`, { method: 'DELETE', headers: tok ? { Authorization: `Bearer ${tok}` } : {} });
      setHistoryConversas(prev => prev.filter(c => c.id !== id));
      if (currentConversaIdRef.current === id) { currentConversaIdRef.current = null; }
    } catch { }
  }

  const chatName = selectedConv?.userName ?? selectedContact?.nome ?? '';
  const chatRole = selectedConv?.userRole ?? selectedContact?.role ?? '';

  return (
    <>
      {/* Floating Button */}
      <Animated.View
        style={[styles.container, { transform: [{ scale: scaleAnim }], pointerEvents: 'box-none', bottom: isDesktop ? 72 : 24 + BOTTOM_NAV_HEIGHT + 72 } as any]}
      >
        <TouchableOpacity
          style={[styles.btn, panelOpen && styles.btnActive]}
          onPress={() => setPanelOpen(v => !v)}
          activeOpacity={0.85}
        >
          <Ionicons name={panelOpen ? 'close' : 'chatbubbles'} size={24} color="#fff" />
          {!panelOpen && unreadTotal > 0 && (
            <Animated.View style={[styles.badge, { transform: [{ scale: badgeAnim }] }]}>
              <Text style={styles.badgeText}>{unreadTotal > 99 ? '99+' : unreadTotal}</Text>
            </Animated.View>
          )}
        </TouchableOpacity>
      </Animated.View>

      {/* Chat Panel Modal */}
      <Modal
        visible={panelOpen}
        transparent
        animationType="slide"
        onRequestClose={closePanel}
      >
        <View style={[styles.modalOverlay, isMobileSize && { alignItems: 'center', paddingRight: 0, paddingLeft: 0, paddingBottom: 16 }]}>
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={closePanel} />
          <View style={[styles.panel, { width: PANEL_W, maxHeight: PANEL_H }, isMobileSize && { borderRadius: 20 }]}>

            {/* Drag handle — swipe down to close (mobile only) */}
            {isMobileSize && (
              <View
                style={styles.dragHandleBar}
                onStartShouldSetResponder={() => true}
                onMoveShouldSetResponder={() => true}
                onResponderGrant={(e) => { dragStartY.current = e.nativeEvent.pageY; }}
                onResponderMove={(e) => {
                  const dy = e.nativeEvent.pageY - dragStartY.current;
                  if (dy > 80) closePanel();
                }}
                onResponderRelease={() => { dragStartY.current = 0; }}
              >
                <View style={styles.dragHandleIndicator} />
              </View>
            )}

            {/* Panel Header */}
            <View style={styles.panelHeader}>
              <View style={styles.panelHeaderLeft}>
                <View style={styles.panelHeaderIcon}>
                  <Ionicons name={activeTab === 'assistente' ? 'sparkles' : 'chatbubbles'} size={18} color={Colors.primary} />
                </View>
                <View>
                  <Text style={styles.panelTitle}>
                    {activeTab === 'assistente' ? 'Assistente IA' : 'Chat Interno'}
                  </Text>
                  {activeTab === 'mensagens' && unreadTotal > 0 && (
                    <Text style={styles.panelSubtitle}>{unreadTotal} mensagem{unreadTotal > 1 ? 's' : ''} não lida{unreadTotal > 1 ? 's' : ''}</Text>
                  )}
                  {activeTab === 'assistente' && (
                    <Text style={styles.panelSubtitle}>{aiProvider} · {aiModel} · Dados em tempo real</Text>
                  )}
                </View>
              </View>
              <View style={styles.panelHeaderRight}>
                {activeTab === 'mensagens' && selectedUserId && (
                  <TouchableOpacity onPress={loadMensagens} style={styles.headerIconBtn}>
                    <Ionicons name="refresh-outline" size={18} color={Colors.textMuted} />
                  </TouchableOpacity>
                )}
                {activeTab === 'mensagens' && (
                  <TouchableOpacity onPress={() => setShowNewChat(true)} style={styles.newChatBtn}>
                    <Ionicons name="pencil-outline" size={16} color="#fff" />
                  </TouchableOpacity>
                )}
                {activeTab === 'assistente' && (
                  <TouchableOpacity
                    onPress={() => { loadHistory(); setShowHistory(true); }}
                    style={styles.headerIconBtn}
                  >
                    <Ionicons name="time-outline" size={18} color={Colors.textMuted} />
                  </TouchableOpacity>
                )}
                {activeTab === 'assistente' && aiMessages.length > 1 && (
                  <TouchableOpacity onPress={startNewConversation} style={styles.headerIconBtn}>
                    <Ionicons name="add-circle-outline" size={20} color={Colors.textMuted} />
                  </TouchableOpacity>
                )}
                <TouchableOpacity onPress={closePanel} style={[styles.headerIconBtn, styles.closeIconBtn]}>
                  <Ionicons name="close" size={20} color={Colors.textSecondary} />
                </TouchableOpacity>
              </View>
            </View>

            {/* Tab Switcher */}
            <View style={styles.tabBar}>
              <TouchableOpacity
                style={[styles.tab, activeTab === 'mensagens' && styles.tabActive]}
                onPress={() => { setActiveTab('mensagens'); setSelectedUserId(null); }}
              >
                <Ionicons name="chatbubbles-outline" size={14} color={activeTab === 'mensagens' ? Colors.accent : Colors.textMuted} />
                <Text style={[styles.tabText, activeTab === 'mensagens' && styles.tabTextActive]}>Mensagens</Text>
                {unreadTotal > 0 && (
                  <View style={styles.tabBadge}>
                    <Text style={styles.tabBadgeText}>{unreadTotal > 9 ? '9+' : unreadTotal}</Text>
                  </View>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.tab, activeTab === 'assistente' && styles.tabActive]}
                onPress={() => setActiveTab('assistente')}
              >
                <Ionicons name="sparkles-outline" size={14} color={activeTab === 'assistente' ? Colors.accent : Colors.textMuted} />
                <Text style={[styles.tabText, activeTab === 'assistente' && styles.tabTextActive]}>Assistente IA</Text>
              </TouchableOpacity>
            </View>

            {/* ── HISTÓRICO DE CONVERSAS ── */}
            {activeTab === 'assistente' && showHistory && (
              <View style={histStyles.overlay}>
                <View style={histStyles.header}>
                  <Text style={histStyles.headerTitle}>Histórico de Conversas</Text>
                  <TouchableOpacity onPress={() => setShowHistory(false)} style={histStyles.closeBtn}>
                    <Ionicons name="close" size={18} color={Colors.textSecondary} />
                  </TouchableOpacity>
                </View>
                <TouchableOpacity style={histStyles.newBtn} onPress={startNewConversation} activeOpacity={0.8}>
                  <Ionicons name="add-circle-outline" size={16} color="#fff" />
                  <Text style={histStyles.newBtnText}>Nova conversa</Text>
                </TouchableOpacity>
                {historyLoading ? (
                  <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                    <ActivityIndicator color={Colors.accent} />
                    <Text style={histStyles.emptyText}>A carregar...</Text>
                  </View>
                ) : historyConversas.length === 0 ? (
                  <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                    <Ionicons name="chatbubble-ellipses-outline" size={36} color={Colors.textMuted} />
                    <Text style={histStyles.emptyText}>Nenhuma conversa guardada</Text>
                    <Text style={[histStyles.emptyText, { fontSize: 12 }]}>As conversas são guardadas automaticamente</Text>
                  </View>
                ) : (
                  <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
                    {historyConversas.map(c => {
                      const isCurrent = currentConversaIdRef.current === c.id;
                      const date = new Date(c.atualizado_em);
                      const dateStr = date.toLocaleDateString('pt-PT', { day: '2-digit', month: 'short' });
                      const timeStr = date.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });
                      const msgCount = (c.mensagens ?? []).length;
                      return (
                        <TouchableOpacity
                          key={c.id}
                          style={[histStyles.item, isCurrent && histStyles.itemActive]}
                          onPress={() => resumeConversa(c)}
                          activeOpacity={0.75}
                        >
                          <View style={histStyles.itemIcon}>
                            <Ionicons name="chatbubble-outline" size={16} color={isCurrent ? Colors.accent : Colors.textMuted} />
                          </View>
                          <View style={{ flex: 1, gap: 2 }}>
                            <Text style={histStyles.itemTitle} numberOfLines={2}>{c.titulo}</Text>
                            <Text style={histStyles.itemMeta}>{msgCount} mensagem{msgCount !== 1 ? 's' : ''} · {dateStr} {timeStr}</Text>
                          </View>
                          <TouchableOpacity onPress={() => deleteHistoryConversa(c.id)} style={histStyles.deleteBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                            <Ionicons name="trash-outline" size={14} color="#F87171" />
                          </TouchableOpacity>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                )}
              </View>
            )}

            {/* ── ASSISTENTE IA ── */}
            {activeTab === 'assistente' && !showHistory && (
              <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                <ScrollView
                  ref={aiScrollRef}
                  style={{ flex: 1 }}
                  contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 10, flexGrow: 1, justifyContent: 'flex-end' }}
                  showsVerticalScrollIndicator={false}
                  onContentSizeChange={() => aiScrollRef.current?.scrollToEnd({ animated: false })}
                >
                  {aiMessages.map(msg => {
                    const isUser = msg.role === 'user';
                    const canRate = !isUser && msg.id !== 'welcome';
                    return (
                      <View
                        key={msg.id}
                        style={[
                          styles.bubbleRow,
                          isUser ? styles.bubbleRowMine : styles.bubbleRowTheirs,
                          { marginBottom: canRate ? 4 : 10 },
                        ]}
                      >
                        {!isUser && (
                          <View style={styles.aiBotAvatar}>
                            <Ionicons name="sparkles" size={14} color="#fff" />
                          </View>
                        )}
                        <View style={{ maxWidth: '85%' }}>
                          <View style={[
                            styles.bubble,
                            isUser ? styles.bubbleMine : styles.aiBubble,
                          ]}>
                            {isUser ? (
                              <Text style={[styles.bubbleText, styles.bubbleTextMine]}>{msg.content}</Text>
                            ) : (
                              <MarkdownText content={msg.content} isUser={false} />
                            )}
                            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 4 }}>
                              <Text style={[styles.bubbleTime, isUser ? styles.bubbleTimeMine : styles.bubbleTimeTheirs]}>
                                {msg.ts.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}
                              </Text>
                            </View>
                          </View>
                          {canRate && (
                            <View style={ratingStyles.row}>
                              {/* Speaker button — always visible for AI messages */}
                              {Platform.OS === 'web' && (
                                <TouchableOpacity
                                  style={[ratingStyles.btn, speakingMsgId === msg.id && ratingStyles.speakBtnActive]}
                                  onPress={() => toggleSpeak(msg.id, msg.content)}
                                  activeOpacity={0.7}
                                >
                                  <Ionicons
                                    name={speakingMsgId === msg.id ? 'stop-circle-outline' : 'volume-high-outline'}
                                    size={13}
                                    color={speakingMsgId === msg.id ? '#fff' : Colors.textMuted}
                                  />
                                </TouchableOpacity>
                              )}
                              {msg.rating ? (
                                <Text style={ratingStyles.thanksText}>
                                  {msg.rating === 'up' ? '👍 Obrigado pelo feedback!' : '👎 Vamos melhorar!'}
                                </Text>
                              ) : (
                                <>
                                  <TouchableOpacity
                                    style={[ratingStyles.btn, ratingStyles.upBtn]}
                                    onPress={() => handleRating(msg.id, 'up')}
                                    activeOpacity={0.7}
                                  >
                                    <Ionicons name="thumbs-up-outline" size={13} color="#34D399" />
                                  </TouchableOpacity>
                                  <TouchableOpacity
                                    style={[ratingStyles.btn, ratingStyles.downBtn]}
                                    onPress={() => handleRating(msg.id, 'down')}
                                    activeOpacity={0.7}
                                  >
                                    <Ionicons name="thumbs-down-outline" size={13} color="#F87171" />
                                  </TouchableOpacity>
                                </>
                              )}
                            </View>
                          )}
                        </View>
                      </View>
                    );
                  })}
                  {aiLoading && !aiMessages.some(m => m.streaming) && (
                    <View style={[styles.bubbleRow, styles.bubbleRowTheirs, { marginBottom: 10 }]}>
                      <View style={styles.aiBotAvatar}>
                        <Ionicons name="sparkles" size={14} color="#fff" />
                      </View>
                      <View style={[styles.bubble, styles.aiBubble, { paddingVertical: 10, paddingHorizontal: 14 }]}>
                        <TypingDotsIndicator />
                      </View>
                    </View>
                  )}

                </ScrollView>

                {/* Sugestões rápidas — só aparecem antes de qualquer mensagem do utilizador */}
                {!aiLoading && !aiMessages.some(m => m.role === 'user') && (() => {
                  const prompts = AI_QUICK_PROMPTS[user?.role ?? ''] ?? [];
                  if (!prompts.length) return null;
                  return (
                    <View style={quickStyles.bar}>
                      {prompts.map((p, i) => (
                        <TouchableOpacity
                          key={i}
                          style={quickStyles.chip}
                          onPress={() => handleQuickPrompt(p)}
                          activeOpacity={0.75}
                        >
                          <Ionicons name="flash-outline" size={11} color="#A78BFA" />
                          <Text style={quickStyles.chipText}>{p}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  );
                })()}

                <View style={styles.inputRow}>
                  {Platform.OS === 'web' && (
                    <TouchableOpacity
                      style={[styles.voiceBtn, voiceActive && styles.voiceBtnActive]}
                      onPress={toggleVoice}
                      activeOpacity={0.75}
                    >
                      <Ionicons name={voiceActive ? 'mic' : 'mic-outline'} size={18} color={voiceActive ? '#fff' : Colors.textMuted} />
                    </TouchableOpacity>
                  )}
                  <TextInput
                    style={styles.textInput}
                    placeholder="Pergunte ao assistente..."
                    placeholderTextColor={Colors.textMuted}
                    value={aiInput}
                    onChangeText={setAiInput}
                    multiline
                    maxLength={800}
                    onKeyPress={({ nativeEvent }: any) => {
                      if (Platform.OS === 'web' && nativeEvent.key === 'Enter' && !nativeEvent.shiftKey) {
                        nativeEvent.preventDefault?.();
                        handleAiSend();
                      }
                    }}
                  />
                  <TouchableOpacity
                    style={[styles.sendBtn, styles.aiSendBtn, (!aiInput.trim() || aiLoading) && { opacity: 0.4 }]}
                    onPress={handleAiSend}
                    disabled={!aiInput.trim() || aiLoading}
                  >
                    {aiLoading
                      ? <ActivityIndicator size="small" color="#fff" />
                      : <Ionicons name="send" size={18} color="#fff" />
                    }
                  </TouchableOpacity>
                </View>
              </KeyboardAvoidingView>
            )}

            {/* ── MENSAGENS INTERNAS ── */}
            {activeTab === 'mensagens' && (selectedUserId ? (
              <KeyboardAvoidingView
                style={{ flex: 1 }}
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
              >
                {/* Chat sub-header */}
                <View style={styles.chatSubHeader}>
                  <TouchableOpacity onPress={() => setSelectedUserId(null)} style={styles.backBtn}>
                    <Ionicons name="arrow-back" size={20} color={Colors.text} />
                  </TouchableOpacity>
                  <Avatar name={chatName} role={chatRole} size={34} online={selectedUserId ? onlineSet.has(selectedUserId) : false} />
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={styles.chatSubHeaderName}>{chatName}</Text>
                    {onlineData && selectedUserId ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
                        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: onlineSet.has(selectedUserId) ? '#22C55E' : '#64748B' }} />
                        <Text style={{ fontSize: 10, fontFamily: 'Inter_500Medium', color: onlineSet.has(selectedUserId) ? '#22C55E' : Colors.textMuted }}>
                          {onlineSet.has(selectedUserId) ? 'Online agora' : 'Offline'}
                        </Text>
                      </View>
                    ) : (
                      <Text style={[styles.chatSubHeaderRole, { color: roleColor(chatRole) }]}>
                        {getRoleLabel(chatRole, undefined)}
                      </Text>
                    )}
                  </View>
                </View>

                {/* Messages */}
                <FlatList
                  ref={flatListRef}
                  data={selectedConv?.msgs ?? []}
                  keyExtractor={m => m.id}
                  renderItem={({ item: msg }) => {
                    const mine = msg.remetenteId === user?.id;
                    const anexos: ChatAnexo[] = Array.isArray(msg.anexos) ? msg.anexos : [];
                    return (
                      <View style={[styles.bubbleRow, mine ? styles.bubbleRowMine : styles.bubbleRowTheirs]}>
                        {!mine && <Avatar name={msg.remetenteNome} role={msg.remetenteRole} size={26} />}
                        <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs, { paddingHorizontal: anexos.length > 0 ? 8 : 13 }]}>
                          {anexos.map((a, i) => (
                            a.tipo === 'image' ? (
                              <TouchableOpacity key={i} onPress={() => Platform.OS === 'web' && window.open(a.url, '_blank')} activeOpacity={0.85}>
                                <View style={{ width: 180, height: 130, borderRadius: 10, marginBottom: 4, overflow: 'hidden' }}>
                                  <AuthImage url={a.url} style={{ width: 180, height: 130 }} />
                                </View>
                              </TouchableOpacity>
                            ) : (
                              <TouchableOpacity key={i} onPress={() => Platform.OS === 'web' && window.open(a.url, '_blank')} activeOpacity={0.8}
                                style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: mine ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.08)', borderRadius: 8, padding: 8, marginBottom: 4 }}>
                                <Ionicons name="document-attach-outline" size={18} color={mine ? '#fff' : Colors.textMuted} />
                                <Text style={{ flex: 1, fontSize: 12, color: mine ? '#fff' : Colors.text, fontFamily: 'Inter_500Medium' }} numberOfLines={1}>{a.nome}</Text>
                              </TouchableOpacity>
                            )
                          ))}
                          {!!msg.corpo && (
                            <Text style={[styles.bubbleText, mine ? styles.bubbleTextMine : styles.bubbleTextTheirs]}>
                              {msg.corpo}
                            </Text>
                          )}
                          <View style={styles.bubbleMeta}>
                            <Text style={[styles.bubbleTime, mine ? styles.bubbleTimeMine : styles.bubbleTimeTheirs]}>
                              {labelData(msg.createdAt)}
                            </Text>
                            {mine && (
                              <View style={{ flexDirection: 'row', alignItems: 'center', marginLeft: 3, gap: 2 }}>
                                <Ionicons
                                  name={msg.lida ? 'checkmark-done' : 'checkmark'}
                                  size={11}
                                  color={msg.lida ? '#93C5FD' : 'rgba(255,255,255,0.5)'}
                                />
                                {msg.lida && <Text style={{ fontSize: 9, color: '#93C5FD', fontFamily: 'Inter_500Medium' }}>Leu</Text>}
                              </View>
                            )}
                          </View>
                        </View>
                      </View>
                    );
                  }}
                  contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 10, flexGrow: 1 }}
                  showsVerticalScrollIndicator={false}
                  ListEmptyComponent={
                    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 40 }}>
                      <MaterialCommunityIcons name="message-text-outline" size={36} color={Colors.textMuted} />
                      <Text style={{ color: Colors.textMuted, fontSize: 13, marginTop: 10 }}>
                        Inicie a conversa com {chatName}
                      </Text>
                    </View>
                  }
                  onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
                />

                {/* Pré-visualização de anexos pendentes */}
                {pendingAnexos.length > 0 && (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}
                    style={{ paddingHorizontal: 12, paddingTop: 8, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)' }}>
                    {pendingAnexos.map((a, i) => (
                      <View key={i} style={{ marginRight: 8, position: 'relative' }}>
                        {a.tipo === 'image' ? (
                          <View style={{ width: 56, height: 56, borderRadius: 8, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.1)' }}>
                            <AuthImage url={a.url} style={{ width: 56, height: 56 }} />
                          </View>
                        ) : (
                          <View style={{ width: 56, height: 56, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' }}>
                            <Ionicons name="document-outline" size={22} color={Colors.textMuted} />
                          </View>
                        )}
                        <TouchableOpacity onPress={() => setPendingAnexos(prev => prev.filter((_, j) => j !== i))}
                          style={{ position: 'absolute', top: -4, right: -4, backgroundColor: '#EF4444', borderRadius: 8, width: 16, height: 16, alignItems: 'center', justifyContent: 'center' }}>
                          <Ionicons name="close" size={10} color="#fff" />
                        </TouchableOpacity>
                      </View>
                    ))}
                  </ScrollView>
                )}

                {/* Input row */}
                <View style={styles.inputRow}>
                  {Platform.OS === 'web' && (
                    <TouchableOpacity
                      style={[styles.voiceBtn, uploadingFile && { opacity: 0.5 }]}
                      onPress={handlePickFile}
                      disabled={uploadingFile}
                      activeOpacity={0.75}
                    >
                      {uploadingFile
                        ? <ActivityIndicator size="small" color={Colors.textMuted} />
                        : <Ionicons name="attach-outline" size={18} color={Colors.textMuted} />}
                    </TouchableOpacity>
                  )}
                  <TextInput
                    style={styles.textInput}
                    placeholder="Escreva uma mensagem..."
                    placeholderTextColor={Colors.textMuted}
                    value={inputText}
                    onChangeText={setInputText}
                    multiline
                    maxLength={1000}
                    onKeyPress={({ nativeEvent }: any) => {
                      if (Platform.OS === 'web' && nativeEvent.key === 'Enter' && !nativeEvent.shiftKey) {
                        nativeEvent.preventDefault?.();
                        handleSend();
                      }
                    }}
                  />
                  <TouchableOpacity
                    style={[styles.sendBtn, ((!inputText.trim() && pendingAnexos.length === 0) || sending) && { opacity: 0.4 }]}
                    onPress={handleSend}
                    disabled={(!inputText.trim() && pendingAnexos.length === 0) || sending}
                  >
                    {sending
                      ? <AppLoader size="small" color="#fff" />
                      : <Ionicons name="send" size={18} color="#fff" />
                    }
                  </TouchableOpacity>
                </View>
              </KeyboardAvoidingView>
            ) : (
              /* Conversations list */
              <View style={{ flex: 1 }}>
                {isLoading && conversations.length === 0 ? (
                  <AppLoader color={Colors.primary} style={{ marginTop: 40 }} />
                ) : conversations.length === 0 ? (
                  <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
                    <MaterialCommunityIcons name="chat-outline" size={48} color={Colors.textMuted} />
                    <Text style={{ color: Colors.text, fontSize: 15, fontWeight: '600', marginTop: 12 }}>
                      Sem conversas ainda
                    </Text>
                    <Text style={{ color: Colors.textMuted, fontSize: 13, marginTop: 4, textAlign: 'center' }}>
                      Toque em ✏️ para iniciar uma conversa
                    </Text>
                    <TouchableOpacity
                      onPress={() => setShowNewChat(true)}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.primary, borderRadius: 8, paddingHorizontal: 16, paddingVertical: 10, marginTop: 16 }}
                    >
                      <Ionicons name="create-outline" size={16} color="#fff" />
                      <Text style={{ color: '#fff', fontWeight: '600', fontSize: 14 }}>Nova Conversa</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <ScrollView showsVerticalScrollIndicator={false}>
                    {conversations.map(conv => {
                      const mine = conv.lastMsg.remetenteId === user?.id;
                      return (
                        <TouchableOpacity
                          key={conv.userId}
                          style={[styles.convItem, selectedUserId === conv.userId && styles.convItemActive]}
                          onPress={() => setSelectedUserId(conv.userId)}
                          activeOpacity={0.78}
                        >
                          <Avatar name={conv.userName} role={conv.userRole} size={46} online />
                          <View style={styles.convInfo}>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                              <Text style={styles.convName} numberOfLines={1}>{conv.userName}</Text>
                              <Text style={styles.convTime}>{labelData(conv.lastMsg.createdAt)}</Text>
                            </View>
                            <Text style={[styles.convPreview, conv.unread > 0 && styles.convPreviewUnread]} numberOfLines={1}>
                              {mine ? <Text style={{ color: Colors.textMuted }}>Você: </Text> : ''}{conv.lastMsg.corpo}
                            </Text>
                            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 3 }}>
                              <Text style={[styles.roleChip, { color: roleColor(conv.userRole) }]}>
                                {getRoleLabel(conv.userRole, (conv as any).genero)}
                              </Text>
                              {conv.unread > 0 && (
                                <View style={styles.unreadBadge}>
                                  <Text style={styles.unreadBadgeText}>{conv.unread}</Text>
                                </View>
                              )}
                              {mine && conv.unread === 0 && (
                                <Ionicons name="checkmark-done" size={14} color={Colors.info} />
                              )}
                            </View>
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                )}
              </View>
            ))}

            {/* Nova Conversa — overlay absoluto DENTRO do painel (não Modal separado) */}
            {showNewChat && (
              <View style={[StyleSheet.absoluteFillObject, { zIndex: 200 }]} pointerEvents="box-none">
                {/* Backdrop — separado do sheet para que o foco no TextInput não dispare o dismiss */}
                <TouchableOpacity
                  style={StyleSheet.absoluteFillObject}
                  activeOpacity={1}
                  onPress={() => { setShowNewChat(false); setSearchContact(''); }}
                />
                {/* Sheet — irmão do backdrop, não filho; aparece sobre ele por ordem DOM */}
                <View style={styles.newChatSheet} onStartShouldSetResponder={() => true}>
                  <View style={styles.newChatHeader}>
                    <Text style={styles.newChatTitle}>Nova Conversa</Text>
                    <TouchableOpacity onPress={() => { setShowNewChat(false); setSearchContact(''); }}>
                      <Ionicons name="close" size={22} color={Colors.textMuted} />
                    </TouchableOpacity>
                  </View>
                  <View style={styles.searchBox}>
                    <StableSearchInput
                      value={searchContact}
                      onChangeText={setSearchContact}
                      inputStyle={styles.searchInput}
                      placeholder="Pesquisar todos os funcionários"
                      iconColor={Colors.textMuted}
                    />
                  </View>
                  <ScrollView style={styles.contactList} showsVerticalScrollIndicator={false}>
                    {filteredContacts.length === 0 ? (
                      <Text style={{ color: Colors.textMuted, fontSize: 14, textAlign: 'center', marginTop: 20 }}>
                        Nenhum funcionário encontrado.
                      </Text>
                    ) : filteredContacts.map((c: StaffContact) => (
                      <TouchableOpacity key={c.id} style={styles.contactItem} onPress={() => startChat(c)}>
                        <Avatar name={c.nome} role={c.role} size={40} />
                        <View style={{ flex: 1, marginLeft: 12 }}>
                          <Text style={styles.contactName}>{c.nome}</Text>
                          <Text style={[styles.contactRole, { color: roleColor(c.role) }]}>
                            {getRoleLabel(c.role, (c as any).genero)}
                          </Text>
                        </View>
                        <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              </View>
            )}
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 24,
    right: 16,
    zIndex: 9999,
    ...(Platform.OS === 'web' ? { position: 'fixed' as any } : {}),
  },
  btn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 10,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  btnActive: {
    backgroundColor: Colors.primaryDark,
    borderColor: Colors.primary,
  },
  badge: {
    position: 'absolute',
    top: -5,
    right: -5,
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
    borderWidth: 2,
    borderColor: Colors.background,
  },
  badgeText: {
    fontSize: 10,
    fontFamily: 'Inter_700Bold',
    color: '#fff',
    lineHeight: 13,
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
    alignItems: Platform.OS === 'web' ? 'flex-end' : 'center',
    paddingBottom: Platform.OS === 'web' ? 88 : 12,
    paddingRight: Platform.OS === 'web' ? 20 : 0,
  },

  panel: {
    backgroundColor: '#0F1829',
    borderRadius: Platform.OS === 'web' ? 18 : 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    shadowColor: '#000',
    shadowOffset: { width: -4, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 32,
    elevation: 24,
    flex: 1,
  },
  dragHandleBar: {
    width: '100%',
    paddingTop: 10,
    paddingBottom: 6,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.card,
    cursor: 'grab' as any,
  },
  dragHandleIndicator: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  panelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.07)',
    backgroundColor: '#0D1422',
  },
  panelHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  panelHeaderIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: `${Colors.accent}22`,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: `${Colors.accent}40`,
  },
  panelTitle: {
    fontSize: 15,
    fontFamily: 'Inter_700Bold',
    color: '#F1F5F9',
    letterSpacing: 0.2,
  },
  panelSubtitle: {
    fontSize: 10,
    fontFamily: 'Inter_400Regular',
    color: 'rgba(250,204,21,0.8)',
    marginTop: 1,
  },
  panelHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  headerIconBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  newChatBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeIconBtn: {
    backgroundColor: 'rgba(231,76,60,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(231,76,60,0.2)',
  },

  /* Tab bar */
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
    backgroundColor: '#0F1829',
    paddingHorizontal: 8,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 11,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
    marginBottom: -1,
  },
  tabActive: {
    borderBottomColor: Colors.accent,
  },
  tabText: {
    fontSize: 13,
    fontFamily: 'Inter_500Medium',
    color: 'rgba(255,255,255,0.4)',
  },
  tabTextActive: {
    color: Colors.accent,
    fontFamily: 'Inter_700Bold',
  },
  tabBadge: {
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  tabBadgeText: {
    fontSize: 9,
    color: '#fff',
    fontFamily: 'Inter_700Bold',
  },

  /* Chat sub-header */
  chatSubHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.07)',
    backgroundColor: '#0D1422',
    gap: 10,
  },
  backBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.07)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chatSubHeaderName: {
    fontSize: 14,
    fontFamily: 'Inter_700Bold',
    color: '#F1F5F9',
    letterSpacing: 0.1,
  },
  chatSubHeaderRole: {
    fontSize: 11,
    fontFamily: 'Inter_500Medium',
    marginTop: 2,
  },

  /* Bubbles */
  bubbleRow: { flexDirection: 'row', marginBottom: 6, alignItems: 'flex-end' },
  bubbleRowMine: { justifyContent: 'flex-end', paddingRight: 4 },
  bubbleRowTheirs: { justifyContent: 'flex-start', gap: 8, paddingLeft: 4 },
  bubble: {
    maxWidth: '78%',
    minWidth: 80,
    borderRadius: 18,
    paddingHorizontal: 13,
    paddingVertical: 9,
  },
  bubbleMine: {
    backgroundColor: Colors.accent,
    borderBottomRightRadius: 5,
  },
  bubbleTheirs: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderBottomLeftRadius: 5,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  aiBubble: {
    backgroundColor: 'rgba(139,92,246,0.12)',
    borderBottomLeftRadius: 5,
    borderWidth: 1,
    borderColor: `${Colors.accent}30`,
  },
  bubbleText: { fontSize: 14, lineHeight: 20 },
  bubbleTextMine: { color: '#fff', fontFamily: 'Inter_400Regular' },
  bubbleTextTheirs: { color: '#E2E8F0', fontFamily: 'Inter_400Regular' },
  aiBubbleText: { color: '#E2E8F0', fontFamily: 'Inter_400Regular', lineHeight: 21 },
  bubbleMeta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', marginTop: 3 },
  bubbleTime: { fontSize: 10 },
  bubbleTimeMine: { color: 'rgba(255,255,255,0.45)' },
  bubbleTimeTheirs: { color: 'rgba(255,255,255,0.35)' },

  /* AI bot avatar */
  aiBotAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.accent,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
  },

  /* Conversations list */
  convItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.04)',
    gap: 12,
  },
  convItemActive: { backgroundColor: 'rgba(139,92,246,0.08)', borderLeftWidth: 3, borderLeftColor: Colors.accent },
  convInfo: { flex: 1, minWidth: 0 },
  convName: { fontSize: 14, fontFamily: 'Inter_700Bold', color: '#F1F5F9', flex: 1, marginRight: 4 },
  convTime: { fontSize: 10, color: 'rgba(255,255,255,0.35)', fontFamily: 'Inter_400Regular' },
  convPreview: { fontSize: 12, color: 'rgba(255,255,255,0.45)', flex: 1, fontFamily: 'Inter_400Regular' },
  convPreviewUnread: { color: '#E2E8F0', fontFamily: 'Inter_500Medium' },
  roleChip: { fontSize: 10, fontFamily: 'Inter_500Medium', marginTop: 1 },
  unreadBadge: {
    minWidth: 18, height: 18, borderRadius: 9,
    backgroundColor: Colors.accent, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 4,
  },
  unreadBadgeText: { fontSize: 9, color: '#fff', fontFamily: 'Inter_700Bold' },

  /* Input row */
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
    backgroundColor: '#0D1422',
    gap: 8,
  },
  textInput: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 10,
    color: '#F1F5F9',
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    maxHeight: 100,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
  },
  aiSendBtn: {
    backgroundColor: Colors.accent,
    shadowColor: Colors.accent,
  },
  voiceBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  voiceBtnActive: {
    backgroundColor: '#EF4444',
    borderColor: '#EF4444',
  },

  /* New Chat Sheet */
  newChatOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingBottom: 110,
  },
  newChatSheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#0F1829',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: 'hidden',
    maxHeight: 440,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  newChatHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.07)',
    backgroundColor: '#0D1422',
  },
  newChatTitle: {
    fontSize: 15,
    fontFamily: 'Inter_700Bold',
    color: '#F1F5F9',
    letterSpacing: 0.2,
  },
  searchBox: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  searchInput: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 12,
    color: '#F1F5F9',
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  contactList: { maxHeight: 340 },
  contactItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.04)',
  },
  contactName: { fontSize: 14, fontFamily: 'Inter_700Bold', color: '#F1F5F9' },
  contactRole: { fontSize: 11, fontFamily: 'Inter_500Medium', marginTop: 3 },
});

const ratingStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
    marginBottom: 8,
    paddingLeft: 4,
  },
  btn: {
    width: 26,
    height: 26,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  upBtn: {
    backgroundColor: 'rgba(52,211,153,0.08)',
    borderColor: 'rgba(52,211,153,0.3)',
  },
  downBtn: {
    backgroundColor: 'rgba(248,113,113,0.08)',
    borderColor: 'rgba(248,113,113,0.3)',
  },
  speakBtnActive: {
    backgroundColor: Colors.accent,
    borderColor: Colors.accent,
  },
  thanksText: {
    fontSize: 11,
    color: 'rgba(196,181,253,0.7)',
    fontFamily: 'Inter_400Regular',
  },
});

const histStyles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: Colors.background,
    zIndex: 10,
    flexDirection: 'column',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerTitle: {
    fontSize: 15,
    fontFamily: 'Inter_700Bold',
    color: Colors.text,
  },
  closeBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  newBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    margin: 12,
    marginBottom: 6,
    backgroundColor: Colors.accent,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  newBtnText: {
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
    color: '#fff',
  },
  item: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.04)',
  },
  itemActive: {
    backgroundColor: 'rgba(139,92,246,0.08)',
    borderLeftWidth: 2,
    borderLeftColor: Colors.accent,
  },
  itemIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  itemTitle: {
    fontSize: 13,
    fontFamily: 'Inter_500Medium',
    color: Colors.text,
    lineHeight: 18,
  },
  itemMeta: {
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
    color: Colors.textMuted,
    marginTop: 2,
  },
  deleteBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  emptyText: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    color: Colors.textMuted,
    textAlign: 'center',
    marginTop: 8,
  },
});

const quickStyles = StyleSheet.create({
  bar: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 5,
    flexDirection: 'column',
  },
  wrap: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  label: {
    fontSize: 10,
    fontFamily: 'Inter_600SemiBold',
    color: 'rgba(196,181,253,0.6)',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 8,
    paddingHorizontal: 2,
  },
  chips: {
    flexDirection: 'column',
    gap: 5,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(167,139,250,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(167,139,250,0.35)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  chipText: {
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
    color: '#E9D5FF',
    flex: 1,
  },
});
