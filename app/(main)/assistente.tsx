import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput,
  TouchableOpacity, ActivityIndicator, KeyboardAvoidingView,
  Platform, Dimensions, Modal, FlatList,
} from 'react-native';
import MarkdownText from '@/components/MarkdownText';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '@/constants/colors';
import { useAuth, getAuthToken } from '@/context/AuthContext';
import { usePathname, useRouter } from 'expo-router';
import TopBar from '@/components/TopBar';

const { width: SCREEN_W } = Dimensions.get('window');

interface AiAction { label: string; route: string; icon: string; }
interface AiMsg {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  ts: Date;
  rating?: 'up' | 'down';
  actions?: AiAction[];
  provider?: string;
  streaming?: boolean;
  error?: boolean;
  retryMsg?: string;
}
interface Conversa {
  id: string; titulo: string; mensagens: AiMsg[];
  criado_em: string; atualizado_em: string;
}
interface DynamicSug { text: string; icon: string; urgent?: boolean; }

function roleWelcome(role: string, nome: string): string {
  const n = nome?.split(' ')[0] || 'utilizador';
  const map: Record<string, string> = {
    aluno: `Olá, ${n}! Sou o teu Assistente Escolar com dados em tempo real.\n\n• Notas e pautas actuais\n• Propinas e pagamentos\n• Faltas e presenças\n• Documentos e declarações\n\nO que precisas?`,
    encarregado: `Olá, ${n}! Sou o Assistente de Apoio para Encarregados.\n\n• Aproveitamento do educando\n• Propinas e pagamentos\n• Faltas e presenças\n• Comunicações com a escola\n\nComo posso ajudar?`,
    professor: `Olá, ${n}! Sou o seu Assistente Pedagógico.\n\n• Pautas e lançamento de notas\n• Registo de presenças\n• Turmas e disciplinas\n• Prazos e procedimentos\n\nO que precisa?`,
    secretaria: `Olá, ${n}! Sou o Assistente da Secretaria.\n\n• Processos de matrícula\n• Emissão de documentos\n• Gestão de alunos\n• Horários e turmas\n\nComo posso ajudar?`,
    financeiro: `Olá, ${n}! Sou o Assistente Financeiro com dados reais.\n\n• Propinas e cobranças\n• Relatórios financeiros\n• Dívidas e devedores\n• Referências RUPE\n\nComo posso ajudar?`,
    director: `Olá, ${n}! Sou o seu Assistente de Direcção.\n\n• Indicadores académicos e financeiros\n• Gestão de pessoal e turmas\n• Relatórios executivos\n• Tomada de decisão\n\nO que precisa?`,
    admin: `Olá, ${n}! Sou o Assistente do Administrador.\n\n• Configuração do sistema\n• Gestão de utilizadores\n• Todos os módulos\n• Suporte técnico\n\nO que precisa?`,
    rh: `Olá, ${n}! Sou o Assistente de RH.\n\n• Gestão de funcionários\n• Folha salarial e IRT\n• Contratos e assiduidade\n• Relatórios de RH\n\nComo posso ajudar?`,
    ceo: `Olá, ${n}! Sou o seu Assistente Executivo com dados em tempo real.\n\n• Indicadores globais da escola\n• Relatórios financeiros e académicos\n• Visão estratégica\n• Geração de relatórios executivos (botão 📊)\n\nO que precisa?`,
    pca: `Olá, ${n}! Sou o seu Assistente de Governança.\n\n• Indicadores de desempenho\n• Relatórios consolidados\n• Decisões estratégicas\n• Relatórios executivos (botão 📊)\n\nO que precisa?`,
  };
  return map[role] ?? `Olá, ${n}! Sou o Assistente da Super Escola. Como posso ajudar?`;
}

function welcomeMsg(user: any): AiMsg {
  return { id: 'welcome', role: 'assistant', content: roleWelcome(user.role, user.nome), ts: new Date() };
}

function fmtData(iso: string): string {
  const d = new Date(iso), hoje = new Date(), ontem = new Date(hoje);
  ontem.setDate(ontem.getDate() - 1);
  if (d.toDateString() === hoje.toDateString()) return 'Hoje';
  if (d.toDateString() === ontem.toDateString()) return 'Ontem';
  return d.toLocaleDateString('pt-PT', { day: '2-digit', month: 'short' });
}

async function apiFetch(path: string, opts: RequestInit = {}) {
  const tok = await getAuthToken();
  return fetch(path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: `Bearer ${tok}` } : {}), ...(opts.headers as any ?? {}) },
  });
}

const REPORT_ROLES = ['ceo', 'pca', 'director', 'admin'];

function getStaticSugs(role: string): DynamicSug[] {
  const map: Record<string, string[]> = {
    aluno: ['Quais são as minhas notas?', 'Tenho propinas em atraso?', 'Como justificar uma falta?', 'Como pedir uma declaração?'],
    encarregado: ['Notas do meu educando', 'Propinas em atraso', 'Faltas deste mês', 'Como contactar o professor?'],
    professor: ['Como lançar notas na pauta?', 'Como registar presenças?', 'Tenho pautas por fechar?', 'Qual é o prazo de entrega?'],
    secretaria: ['Como fazer uma matrícula?', 'Como emitir uma declaração?', 'Quais os documentos necessários?', 'Como criar um horário?'],
    financeiro: ['Pagamentos pendentes', 'Como gerar referência RUPE?', 'Dívidas em atraso', 'Cobranças do mês'],
    director: ['Resumo académico do mês', 'Situação financeira geral', 'Pautas em atraso', 'Taxa de presença'],
    admin: ['Como activar professor/funcionário pendente?', 'Como fazer backup e enviar por email?', 'Como criar utilizadores?', 'Como usar o Editor de Documentos?'],
    rh: ['Funcionários em contrato temporário', 'Processar folha salarial', 'Contratos a expirar', 'Relatório de presenças'],
    ceo: ['Indicadores chave do mês', 'Como activar perfis pendentes de professores?', 'Como disparar backup com relatório por email?', 'Desempenho académico global'],
    pca: ['Relatório executivo do mês', 'Situação financeira consolidada', 'Indicadores de governança', 'Pontos de atenção'],
  };
  return (map[role] ?? ['Como posso usar esta aplicação?', 'Quais funcionalidades estão disponíveis?']).map(text => ({ text, icon: 'flash-outline' }));
}

export default function AssistenteScreen() {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const router = useRouter();
  const pathname = usePathname();

  const [messages, setMessages] = useState<AiMsg[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [provider, setProvider] = useState('Groq');
  const [modelLabel, setModelLabel] = useState('Llama 3.3');
  const [voiceActive, setVoiceActive] = useState(false);
  const recRef = useRef<any>(null);

  const [dynSugs, setDynSugs] = useState<DynamicSug[]>([]);
  const [generatingReport, setGeneratingReport] = useState(false);

  const [conversaId, setConversaId] = useState<string | null>(null);
  const [conversas, setConversas] = useState<Conversa[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadDynSugs = useCallback(async () => {
    try {
      const r = await apiFetch('/api/ai-dynamic-suggestions');
      if (r.ok) { const d = await r.json(); setDynSugs(Array.isArray(d) ? d : []); }
    } catch { }
  }, []);

  const loadConversas = useCallback(async () => {
    setLoadingHistory(true);
    try { const r = await apiFetch('/api/ai/conversas'); if (r.ok) setConversas(await r.json()); }
    catch { } finally { setLoadingHistory(false); }
  }, []);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const r = await apiFetch('/api/ai/conversas');
        if (r.ok) {
          const data: Conversa[] = await r.json();
          setConversas(data);
          if (data.length > 0) {
            const l = data[0];
            setMessages([welcomeMsg(user), ...(l.mensagens || []).map((m: any) => ({ ...m, ts: new Date(m.ts) }))]);
            setConversaId(l.id);
            loadDynSugs();
            return;
          }
        }
      } catch { }
      setMessages([welcomeMsg(user)]);
      loadDynSugs();
    })();
  }, [user?.id]);

  useEffect(() => { setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 120); }, [messages.length]);

  async function saveConversa(msgs: AiMsg[]) {
    const reais = msgs.filter(m => m.id !== 'welcome' && !m.error);
    if (reais.length < 2) return;
    const titulo = reais[0]?.content?.slice(0, 60) + (reais[0]?.content?.length > 60 ? '…' : '');
    const payload = reais.map(m => ({ id: m.id, role: m.role, content: m.content, ts: m.ts.toISOString(), rating: m.rating }));
    try {
      if (conversaId) await apiFetch(`/api/ai/conversas/${conversaId}`, { method: 'PUT', body: JSON.stringify({ titulo, mensagens: payload }) });
      else { const r = await apiFetch('/api/ai/conversas', { method: 'POST', body: JSON.stringify({ titulo, mensagens: payload }) }); if (r.ok) { const d = await r.json(); setConversaId(d.id); } }
    } catch { }
  }

  function abrirConversa(c: Conversa) {
    if (!user) return;
    setMessages([welcomeMsg(user), ...(c.mensagens || []).map((m: any) => ({ ...m, ts: new Date(m.ts) }))]);
    setConversaId(c.id); setShowHistory(false);
  }

  function novaConversa() {
    if (!user) return;
    setMessages([welcomeMsg(user)]); setConversaId(null); setShowHistory(false);
  }

  async function apagarConversa(id: string) {
    setDeletingId(id);
    try {
      await apiFetch(`/api/ai/conversas/${id}`, { method: 'DELETE' });
      setConversas(prev => prev.filter(c => c.id !== id));
      if (conversaId === id) novaConversa();
    } catch { } finally { setDeletingId(null); }
  }

  // ── STREAMING SEND ──────────────────────────────────────────────────────────
  async function execSend(msg: string, baseMessages: AiMsg[]) {
    const streamId = (Date.now() + 1).toString();
    const history = baseMessages
      .filter(m => m.id !== 'welcome' && !m.error)
      .slice(-20).map(m => ({ role: m.role, content: m.content }));

    setMessages(prev => [...prev, { id: streamId, role: 'assistant', content: '', ts: new Date(), streaming: true }]);
    setLoading(true);

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
      let buf = '', fullContent = '';
      let finalActions: AiAction[] = [], prov = 'Groq', mod = 'Llama 3.3';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n'); buf = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const raw = line.slice(6).trim();
          try {
            const p = JSON.parse(raw);
            if (p.error) throw new Error(p.error);
            if (p.chunk) {
              fullContent += p.chunk;
              setMessages(prev => prev.map(m => m.id === streamId ? { ...m, content: fullContent } : m));
              setTimeout(() => scrollRef.current?.scrollToEnd({ animated: false }), 0);
            }
            if (p.done) {
              finalActions = p.actions ?? [];
              prov = p.provider ?? 'Groq';
              mod = (p.model ?? '').includes('llama') ? 'Llama 3.3' : (p.model ?? '').includes('gpt-4o') ? 'GPT-4o' : p.model ?? 'IA';
            }
          } catch (e: any) { if (e?.message && !e.message.includes('JSON')) throw e; }
        }
      }
      setProvider(prov); setModelLabel(mod);
      setMessages(prev => {
        const updated = prev.map(m => m.id === streamId ? { ...m, streaming: false, actions: finalActions, provider: prov } : m);
        saveConversa(updated);
        return updated;
      });
    } catch {
      setMessages(prev => prev.map(m => m.id === streamId ? {
        ...m, streaming: false, error: true,
        content: '⚠️ Não foi possível obter resposta. Toque em **Tentar novamente**.',
        retryMsg: msg,
      } : m));
    } finally { setLoading(false); }
  }

  async function send() {
    const msg = input.trim(); if (!msg || loading) return;
    const userMsg: AiMsg = { id: Date.now().toString(), role: 'user', content: msg, ts: new Date() };
    const next = [...messages, userMsg];
    setMessages(next); setInput('');
    await execSend(msg, next);
  }

  async function sendPrompt(prompt: string) {
    if (loading) return;
    const userMsg: AiMsg = { id: Date.now().toString(), role: 'user', content: prompt, ts: new Date() };
    const next = [...messages, userMsg];
    setMessages(next);
    await execSend(prompt, next);
  }

  async function retryMsg(msg: AiMsg) {
    if (!msg.retryMsg || loading) return;
    const cleaned = messages.filter(m => m.id !== msg.id);
    setMessages(cleaned);
    await execSend(msg.retryMsg, cleaned);
  }

  async function handleRating(msgId: string, rating: 'up' | 'down') {
    const msg = messages.find(m => m.id === msgId);
    if (!msg || msg.rating) return;
    const updated = messages.map(m => m.id === msgId ? { ...m, rating } : m);
    setMessages(updated); saveConversa(updated);
    try {
      const prev = messages[messages.findIndex(m => m.id === msgId) - 1];
      await apiFetch('/api/ai-feedback', { method: 'POST', body: JSON.stringify({ mensagemId: msgId, mensagem: prev?.content ?? '', resposta: msg.content, rating }) });
    } catch { }
  }

  async function copyMsg(content: string) {
    try {
      if (Platform.OS === 'web' && navigator?.clipboard) await navigator.clipboard.writeText(content);
    } catch { }
  }

  // ── VOICE INPUT ─────────────────────────────────────────────────────────────
  function toggleVoice() {
    if (Platform.OS !== 'web') return;
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { alert('O seu browser não suporta reconhecimento de voz. Use o Chrome ou Edge.'); return; }
    if (voiceActive) { recRef.current?.stop(); setVoiceActive(false); return; }
    const rec = new SR();
    rec.lang = 'pt-PT'; rec.continuous = false; rec.interimResults = false;
    rec.onresult = (e: any) => { setInput(prev => (prev ? prev + ' ' : '') + e.results[0][0].transcript); setVoiceActive(false); };
    rec.onerror = () => setVoiceActive(false);
    rec.onend = () => setVoiceActive(false);
    recRef.current = rec; rec.start(); setVoiceActive(true);
  }

  // ── AI REPORT ───────────────────────────────────────────────────────────────
  async function generateReport() {
    if (generatingReport || loading) return;
    setGeneratingReport(true);
    const repId = Date.now().toString();
    const reqMsg: AiMsg = { id: repId + '_req', role: 'user', content: '📊 Gerar Relatório Executivo', ts: new Date() };
    setMessages(prev => [...prev, reqMsg, { id: repId, role: 'assistant', content: '', ts: new Date(), streaming: true }]);
    try {
      const r = await apiFetch('/api/ai-report', { method: 'POST' });
      if (!r.ok) throw new Error();
      const d = await r.json();
      setMessages(prev => {
        const updated = prev.map(m => m.id === repId ? { ...m, streaming: false, content: d.report ?? 'Relatório gerado sem conteúdo.' } : m);
        saveConversa(updated); return updated;
      });
    } catch {
      setMessages(prev => prev.map(m => m.id === repId ? { ...m, streaming: false, error: true, content: '⚠️ Não foi possível gerar o relatório. Verifique a ligação.' } : m));
    } finally { setGeneratingReport(false); }
  }

  function clearChat() { if (!user) return; setMessages([welcomeMsg(user)]); setConversaId(null); }

  const msgCount = messages.filter(m => m.id !== 'welcome').length;
  const sugsToShow: DynamicSug[] = dynSugs.length > 0 ? dynSugs : getStaticSugs(user?.role ?? '');

  return (
    <View style={[S.root, { paddingBottom: insets.bottom }]}>
      <TopBar title="Assistente IA" />

      {/* Header */}
      <View style={S.banner}>
        <View style={S.bannerIcon}>
          <Ionicons name="sparkles" size={17} color="#fff" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={S.bannerTitle}>Assistente Inteligente</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <View style={[S.provDot, { backgroundColor: provider === 'OpenAI' ? '#10A37F' : '#F55036' }]} />
            <Text style={S.bannerSub}>{provider} · {modelLabel} · Dados em tempo real</Text>
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {REPORT_ROLES.includes(user?.role ?? '') && (
            <TouchableOpacity style={S.hBtn} onPress={generateReport} disabled={generatingReport || loading}>
              {generatingReport ? <ActivityIndicator size="small" color={Colors.gold} /> : <Ionicons name="analytics-outline" size={17} color={Colors.gold} />}
            </TouchableOpacity>
          )}
          <TouchableOpacity style={S.hBtn} onPress={() => { loadConversas(); setShowHistory(true); }}>
            <Ionicons name="time-outline" size={17} color={Colors.textMuted} />
          </TouchableOpacity>
          {msgCount > 0 && (
            <TouchableOpacity style={S.hBtn} onPress={clearChat}>
              <Ionicons name="add-outline" size={18} color={Colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}>
        <ScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          contentContainerStyle={[S.msgList, { justifyContent: 'flex-end' }]}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
        >
          {messages.map(msg => {
            const isUser = msg.role === 'user';
            const canRate = !isUser && msg.id !== 'welcome' && !msg.streaming && !msg.error;
            return (
              <View key={msg.id} style={[S.row, isUser ? S.rowUser : S.rowAi, { marginBottom: 4 }]}>
                {!isUser && <View style={S.aiAvatar}><Ionicons name="sparkles" size={12} color="#fff" /></View>}
                <View style={{ flex: isUser ? undefined : 1, maxWidth: isUser ? Math.min(SCREEN_W * 0.8, 480) : undefined, alignItems: isUser ? 'flex-end' : 'flex-start' }}>
                  <View style={[S.bubble, isUser ? S.bubbleUser : msg.error ? S.bubbleError : S.bubbleAi, { maxWidth: Math.min(SCREEN_W * 0.8, 480) }]}>
                    {isUser ? (
                      <Text style={S.bubbleTextUser}>{msg.content}</Text>
                    ) : msg.streaming ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        {msg.content
                          ? <MarkdownText content={msg.content} isUser={false} />
                          : <ActivityIndicator size="small" color={Colors.accent} />}
                        {!!msg.content && <Text style={{ color: Colors.textMuted, fontSize: 18 }}>▋</Text>}
                      </View>
                    ) : (
                      <MarkdownText content={msg.content} isUser={false} />
                    )}
                  </View>

                  <Text style={[S.ts, isUser ? S.tsUser : S.tsAi]}>
                    {msg.ts.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}
                    {!isUser && msg.provider && !msg.streaming && <Text style={{ opacity: 0.45 }}> · {msg.provider}</Text>}
                  </Text>

                  {/* Action buttons */}
                  {!isUser && !msg.streaming && (msg.actions?.length ?? 0) > 0 && (
                    <View style={S.actionsRow}>
                      {msg.actions!.map((a, i) => (
                        <TouchableOpacity key={i} style={S.actionBtn} onPress={() => router.push(a.route as any)} activeOpacity={0.8}>
                          <Ionicons name={a.icon as any} size={12} color={Colors.accent} />
                          <Text style={S.actionBtnText}>{a.label}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}

                  {/* Retry */}
                  {msg.error && msg.retryMsg && (
                    <TouchableOpacity style={S.retryBtn} onPress={() => retryMsg(msg)} activeOpacity={0.8}>
                      <Ionicons name="refresh-outline" size={13} color={Colors.warning} />
                      <Text style={S.retryBtnText}>Tentar novamente</Text>
                    </TouchableOpacity>
                  )}

                  {/* Rating + Copy */}
                  {canRate && (
                    <View style={RS.row}>
                      {msg.rating ? (
                        <Text style={RS.thanks}>{msg.rating === 'up' ? '👍 Obrigado!' : '👎 Vamos melhorar!'}</Text>
                      ) : (
                        <>
                          <TouchableOpacity style={[RS.btn, RS.upBtn]} onPress={() => handleRating(msg.id, 'up')}>
                            <Ionicons name="thumbs-up-outline" size={13} color="#34D399" />
                          </TouchableOpacity>
                          <TouchableOpacity style={[RS.btn, RS.downBtn]} onPress={() => handleRating(msg.id, 'down')}>
                            <Ionicons name="thumbs-down-outline" size={13} color="#F87171" />
                          </TouchableOpacity>
                        </>
                      )}
                      <TouchableOpacity style={RS.copyBtn} onPress={() => copyMsg(msg.content)}>
                        <Ionicons name="copy-outline" size={13} color={Colors.textMuted} />
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              </View>
            );
          })}
        </ScrollView>

        {/* Dynamic / Static suggestions */}
        {!loading && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={S.sugs} keyboardShouldPersistTaps="handled">
            {sugsToShow.map((s, i) => (
              <TouchableOpacity key={i} style={[S.sugChip, s.urgent && S.sugChipUrgent]} onPress={() => sendPrompt(s.text)} activeOpacity={0.8}>
                <Ionicons name={(s.urgent ? 'alert-circle' : 'flash-outline') as any} size={11} color={s.urgent ? '#F87171' : Colors.accent} style={{ marginRight: 3 }} />
                <Text style={[S.sugText, s.urgent && S.sugTextUrgent]} numberOfLines={1}>{s.text}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {/* Input bar */}
        <View style={S.inputBar}>
          {Platform.OS === 'web' && (
            <TouchableOpacity style={[S.voiceBtn, voiceActive && S.voiceBtnOn]} onPress={toggleVoice} activeOpacity={0.8}>
              <Ionicons name={voiceActive ? 'mic' : 'mic-outline'} size={20} color={voiceActive ? '#EF4444' : Colors.textMuted} />
            </TouchableOpacity>
          )}
          <TextInput
            style={[S.input, voiceActive && { borderColor: `${Colors.danger}80` }]}
            placeholder={voiceActive ? '🎤 A ouvir...' : 'Escreva a sua questão...'}
            placeholderTextColor={voiceActive ? '#EF4444' : Colors.textMuted}
            value={input}
            onChangeText={setInput}
            multiline
            maxLength={800}
            onKeyPress={({ nativeEvent }: any) => {
              if (Platform.OS === 'web' && nativeEvent.key === 'Enter' && !nativeEvent.shiftKey) {
                nativeEvent.preventDefault?.(); send();
              }
            }}
          />
          <TouchableOpacity style={[S.sendBtn, (!input.trim() || loading) && S.sendBtnOff]} onPress={send} disabled={!input.trim() || loading}>
            {loading ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="send" size={18} color="#fff" />}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {/* Histórico Modal */}
      <Modal visible={showHistory} transparent animationType="slide" onRequestClose={() => setShowHistory(false)}>
        <View style={H.overlay}>
          <TouchableOpacity style={H.backdrop} onPress={() => setShowHistory(false)} activeOpacity={1} />
          <View style={[H.sheet, { paddingBottom: insets.bottom + 8 }]}>
            <View style={H.header}>
              <View style={{ flex: 1 }}>
                <Text style={H.title}>Histórico de Conversas</Text>
                <Text style={H.sub}>{conversas.length} conversa{conversas.length !== 1 ? 's' : ''} guardada{conversas.length !== 1 ? 's' : ''}</Text>
              </View>
              <TouchableOpacity style={H.closeBtn} onPress={() => setShowHistory(false)}>
                <Ionicons name="close" size={20} color={Colors.text} />
              </TouchableOpacity>
            </View>
            <TouchableOpacity style={H.novaBtn} onPress={novaConversa} activeOpacity={0.8}>
              <Ionicons name="add-circle-outline" size={18} color={Colors.accent} />
              <Text style={H.novaBtnText}>Nova Conversa</Text>
            </TouchableOpacity>
            {loadingHistory ? (
              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 40 }}>
                <ActivityIndicator size="large" color={Colors.accent} />
              </View>
            ) : conversas.length === 0 ? (
              <View style={H.empty}>
                <Ionicons name="chatbubbles-outline" size={40} color={Colors.textMuted} />
                <Text style={H.emptyTitle}>Nenhuma conversa guardada</Text>
                <Text style={H.emptySub}>As suas conversas são guardadas automaticamente.</Text>
              </View>
            ) : (
              <FlatList
                data={conversas}
                keyExtractor={c => c.id}
                contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 8 }}
                ItemSeparatorComponent={() => <View style={{ height: 6 }} />}
                renderItem={({ item: c }) => (
                  <TouchableOpacity style={[H.item, conversaId === c.id && H.itemActive]} onPress={() => abrirConversa(c)} activeOpacity={0.8}>
                    <View style={H.itemIcon}>
                      <Ionicons name="chatbubble-outline" size={15} color={conversaId === c.id ? Colors.accent : Colors.textMuted} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[H.itemTitle, conversaId === c.id && { color: Colors.accent }]} numberOfLines={1}>{c.titulo}</Text>
                      <Text style={H.itemDate}>{fmtData(c.atualizado_em)} · {(c.mensagens || []).length} msg</Text>
                    </View>
                    <TouchableOpacity style={H.delBtn} onPress={() => apagarConversa(c.id)} disabled={deletingId === c.id} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      {deletingId === c.id ? <ActivityIndicator size="small" color={Colors.danger} /> : <Ionicons name="trash-outline" size={15} color={Colors.danger} />}
                    </TouchableOpacity>
                  </TouchableOpacity>
                )}
              />
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const S = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  banner: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, backgroundColor: Colors.primaryDark, borderBottomWidth: 1, borderBottomColor: Colors.border },
  bannerIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: `${Colors.accent}CC`, alignItems: 'center', justifyContent: 'center' },
  bannerTitle: { fontSize: 14, fontFamily: 'Inter_700Bold', color: Colors.text },
  bannerSub: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.gold },
  provDot: { width: 7, height: 7, borderRadius: 4 },
  hBtn: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.surface },
  msgList: { padding: 12, paddingBottom: 4, flexGrow: 1 },
  row: { flexDirection: 'row', marginBottom: 4, alignItems: 'flex-end' },
  rowUser: { justifyContent: 'flex-end' },
  rowAi: { justifyContent: 'flex-start', gap: 8 },
  aiAvatar: { width: 26, height: 26, borderRadius: 13, backgroundColor: Colors.accent, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  bubble: { borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10 },
  bubbleUser: { backgroundColor: Colors.accent, borderBottomRightRadius: 4 },
  bubbleAi: { backgroundColor: Colors.surfaceLight, borderBottomLeftRadius: 4, borderWidth: 1, borderColor: `${Colors.accent}35` },
  bubbleError: { backgroundColor: `${Colors.danger}12`, borderBottomLeftRadius: 4, borderWidth: 1, borderColor: `${Colors.danger}40` },
  bubbleTextUser: { fontSize: 14, lineHeight: 21, color: Colors.text, fontFamily: 'Inter_400Regular' },
  ts: { fontSize: 10, marginTop: 3 },
  tsUser: { color: 'rgba(255,255,255,0.45)', textAlign: 'right' },
  tsAi: { color: Colors.textMuted },
  actionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: `${Colors.accent}18`, borderWidth: 1, borderColor: `${Colors.accent}40`, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 },
  actionBtnText: { fontSize: 12, color: Colors.accent, fontFamily: 'Inter_500Medium' },
  retryBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 6, backgroundColor: `${Colors.warning}15`, borderWidth: 1, borderColor: `${Colors.warning}40`, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, alignSelf: 'flex-start' },
  retryBtnText: { fontSize: 12, color: Colors.warning, fontFamily: 'Inter_500Medium' },
  sugs: { paddingHorizontal: 12, paddingBottom: 8, gap: 8 },
  sugChip: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surface, borderWidth: 1, borderColor: `${Colors.accent}40`, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7, marginRight: 8, maxWidth: 220 },
  sugChipUrgent: { borderColor: `${Colors.danger}50`, backgroundColor: `${Colors.danger}10` },
  sugText: { fontSize: 13, color: Colors.accent, fontFamily: 'Inter_500Medium' },
  sugTextUrgent: { color: '#F87171' },
  inputBar: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderTopWidth: 1, borderTopColor: Colors.border, backgroundColor: Colors.card },
  voiceBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
  voiceBtnOn: { backgroundColor: `${Colors.danger}20`, borderColor: `${Colors.danger}80` },
  input: { flex: 1, backgroundColor: Colors.surface, borderRadius: 22, paddingHorizontal: 16, paddingVertical: 10, color: Colors.text, fontSize: 14, fontFamily: 'Inter_400Regular', maxHeight: 120, borderWidth: 1, borderColor: Colors.border },
  sendBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: Colors.accent, alignItems: 'center', justifyContent: 'center' },
  sendBtnOff: { opacity: 0.4 },
});

const RS = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4, marginBottom: 8, paddingLeft: 2 },
  btn: { width: 32, height: 32, borderRadius: 9, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  upBtn: { backgroundColor: 'rgba(52,211,153,0.08)', borderColor: 'rgba(52,211,153,0.35)' },
  downBtn: { backgroundColor: 'rgba(248,113,113,0.08)', borderColor: 'rgba(248,113,113,0.35)' },
  copyBtn: { width: 32, height: 32, borderRadius: 9, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface },
  thanks: { fontSize: 12, color: Colors.textMuted, fontFamily: 'Inter_400Regular' },
});

const H = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: { backgroundColor: Colors.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '80%', borderTopWidth: 1, borderColor: Colors.border },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 20, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: Colors.border },
  title: { fontSize: 16, fontFamily: 'Inter_700Bold', color: Colors.text },
  sub: { fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 2 },
  closeBtn: { width: 44, height: 44, borderRadius: 12, backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center' },
  novaBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginVertical: 10, padding: 12, backgroundColor: `${Colors.accent}15`, borderRadius: 12, borderWidth: 1, borderColor: `${Colors.accent}35` },
  novaBtnText: { fontSize: 14, fontFamily: 'Inter_600SemiBold', color: Colors.accent },
  empty: { alignItems: 'center', paddingVertical: 40, paddingHorizontal: 32, gap: 10 },
  emptyTitle: { fontSize: 15, fontFamily: 'Inter_600SemiBold', color: Colors.text },
  emptySub: { fontSize: 13, fontFamily: 'Inter_400Regular', color: Colors.textMuted, textAlign: 'center', lineHeight: 19 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: Colors.surface, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: Colors.border },
  itemActive: { borderColor: Colors.accent, backgroundColor: `${Colors.accent}12` },
  itemIcon: { width: 32, height: 32, borderRadius: 8, backgroundColor: Colors.card, alignItems: 'center', justifyContent: 'center' },
  itemTitle: { fontSize: 13, fontFamily: 'Inter_500Medium', color: Colors.text },
  itemDate: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 2 },
  delBtn: { width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: `${Colors.danger}15` },
});
