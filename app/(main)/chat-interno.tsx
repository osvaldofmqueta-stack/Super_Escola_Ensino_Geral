import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput, KeyboardAvoidingView, Platform, ScrollView, Modal, ActivityIndicator } from 'react-native';
import AppLoader from '@/components/AppLoader';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '@/constants/colors';
import TopBar from '@/components/TopBar';
import { useAuth } from '@/context/AuthContext';
import { useChatInterno, ChatMsg, type ChatAnexo, type ChatReacao } from '@/context/ChatInternoContext';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { StableSearchInput } from '@/components/StableSearchInput';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useRealtimeSocket, WSEvent } from '@/hooks/useRealtimeSocket';

import { getRoleLabel } from '@/utils/genero';
import { labelData, tempoRelativo, grupoData } from '@/lib/tempoRelativo';
import { showToast } from '@/utils/toast';

type MsgListItem = ChatMsg | { _type: 'separator'; label: string; id: string };

// ── Componente de imagem autenticada ────────────────────────────────────────
function ChatImage({ url, style, onPress }: { url: string; style?: object; onPress?: (blobUrl: string) => void }) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    let revoked = false;
    let objectUrl = '';
    (async () => {
      try {
        const { getAuthToken } = await import('@/context/AuthContext');
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

  const s: React.CSSProperties = {
    width: '100%', height: '100%', objectFit: 'cover',
    borderRadius: 'inherit', display: 'block',
    ...(style as React.CSSProperties ?? {}),
  };

  if (loading) {
    return (
      <View style={[chatImgStyles.box, style as any]}>
        <ActivityIndicator size="small" color={Colors.primary} />
      </View>
    );
  }
  if (error || !blobUrl) {
    return (
      <View style={[chatImgStyles.box, chatImgStyles.errorBox, style as any]}>
        <Ionicons name="image-outline" size={28} color={Colors.textMuted} />
        <Text style={chatImgStyles.errorText}>Imagem indisponível</Text>
      </View>
    );
  }

  return (
    <TouchableOpacity activeOpacity={0.88} onPress={() => onPress?.(blobUrl!)} style={style as any}>
      {/* @ts-ignore — usar img nativo no web para carregar com blob URL */}
      <img src={blobUrl} style={s} alt="imagem" />
    </TouchableOpacity>
  );
}

const chatImgStyles = StyleSheet.create({
  box: { alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.surface, overflow: 'hidden' },
  errorBox: { gap: 4 },
  errorText: { fontSize: 11, color: Colors.textMuted, fontFamily: 'Inter_400Regular' },
});

function buildMsgList(msgs: ChatMsg[]): MsgListItem[] {
  if (!msgs.length) return [];
  const result: MsgListItem[] = [];
  let lastDay = '';
  for (const msg of msgs) {
    const day = grupoData(msg.createdAt);
    if (day !== lastDay) {
      result.push({ _type: 'separator', label: day, id: `sep-${day}-${msg.id}` });
      lastDay = day;
    }
    result.push(msg);
  }
  return result;
}

function DaySeparator({ label }: { label: string }) {
  return (
    <View style={sepStyles.row}>
      <View style={sepStyles.line} />
      <Text style={sepStyles.label}>{label}</Text>
      <View style={sepStyles.line} />
    </View>
  );
}

const sepStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', marginVertical: 12, paddingHorizontal: 8 },
  line: { flex: 1, height: 1, backgroundColor: Colors.border },
  label: { fontSize: 11, color: Colors.textMuted, fontWeight: '500', marginHorizontal: 10, letterSpacing: 0.5 },
});

const ROLE_COLORS: Record<string, string> = {
  admin: '#8B5CF6',
  director: '#EF4444',
  secretaria: '#F59E0B',
  chefe_secretaria: '#D97706',
  professor: '#3B82F6',
  financeiro: '#10B981',
  rh: '#EC4899',
  ceo: '#6366F1',
  pca: '#6366F1',
};

function roleColor(role: string) {
  return ROLE_COLORS[role] ?? '#64748B';
}

function Avatar({ name, role, size = 40, isOnline }: { name: string; role: string; size?: number; isOnline?: boolean }) {
  const initials = name
    .split(' ')
    .slice(0, 2)
    .map(w => w[0])
    .join('')
    .toUpperCase();
  const dotSize = Math.max(10, Math.round(size * 0.28));
  return (
    <View style={{ width: size, height: size }}>
      <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2, backgroundColor: roleColor(role) }]}>
        <Text style={[styles.avatarText, { fontSize: size * 0.35 }]}>{initials}</Text>
      </View>
      {isOnline !== undefined && (
        <View style={[
          styles.presenceDot,
          {
            width: dotSize, height: dotSize, borderRadius: dotSize / 2,
            bottom: 0, right: 0,
            backgroundColor: isOnline ? '#22C55E' : '#64748B',
            borderWidth: Math.max(1.5, dotSize * 0.18),
          },
        ]} />
      )}
    </View>
  );
}


interface StaffContact {
  id: string;
  nome: string;
  role: string;
  escola: string;
}

export default function ChatInternoScreen() {
  const { user } = useAuth();
  const { conversations, sendMensagem, markConversationRead, isLoading, loadMensagens } = useChatInterno();
  const insets = useSafeAreaInsets();
  const { isDesktop } = useBreakpoint();
  const bottomInset = Platform.OS === 'web' ? 24 : insets.bottom;
  const queryClient = useQueryClient();

  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);
  const [showNewChat, setShowNewChat] = useState(false);
  const [searchContact, setSearchContact] = useState('');
  const [pendingAnexos, setPendingAnexos] = useState<ChatAnexo[]>([]);
  const [uploadingFile, setUploadingFile] = useState(false);
  // Indicador "a escrever..."
  const [typingUsers, setTypingUsers] = useState<Record<string, string>>({}); // userId → nome
  const typingTimerRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const isTypingSentRef = useRef(false);
  const typingStopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Lightbox de imagem
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  // Emoji picker (reações)
  const [emojiPickerMsgId, setEmojiPickerMsgId] = useState<string | null>(null);
  const EMOJIS_RAPIDOS = ['👍', '❤️', '😂', '😮', '😢', '🙏', '🔥', '👏'];

  const flatListRef = useRef<FlatList>(null);

  // Busca contactos do servidor — filtrado por role do utilizador logado
  const { data: contactsData } = useQuery({
    queryKey: ['chat-contacts'],
    queryFn: () => api.get<{ contacts: StaffContact[] }>('/api/chat-interno/contacts').then(r => r.contacts ?? []),
    staleTime: 0,
    gcTime: 5 * 60 * 1000,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
  });

  // Utilizadores online — polling a cada 30s
  const { data: onlineData } = useQuery({
    queryKey: ['chat-online-users'],
    queryFn: () => api.get<{ onlineIds: string[] }>('/api/chat-interno/online-users').then(r => r.onlineIds ?? []),
    staleTime: 20_000,
    refetchInterval: 30_000,
  });

  const onlineSet = useMemo(() => new Set<string>(onlineData ?? []), [onlineData]);

  // Actualização em tempo real via WebSocket (presence_update + typing)
  const handleWsEvent = useCallback((ev: WSEvent) => {
    if (ev.type === 'presence_update' && ev.onlineIds) {
      queryClient.setQueryData(['chat-online-users'], ev.onlineIds);
    } else if (ev.type === 'typing' && ev.fromUserId) {
      const uid = ev.fromUserId;
      const nome = ev.fromUserName ?? '';
      if (ev.isTyping) {
        setTypingUsers(prev => ({ ...prev, [uid]: nome }));
        // Auto-limpar após 4s caso não chegue typing_stop
        if (typingTimerRef.current[uid]) clearTimeout(typingTimerRef.current[uid]);
        typingTimerRef.current[uid] = setTimeout(() => {
          setTypingUsers(prev => { const n = { ...prev }; delete n[uid]; return n; });
        }, 4000);
      } else {
        if (typingTimerRef.current[uid]) { clearTimeout(typingTimerRef.current[uid]); delete typingTimerRef.current[uid]; }
        setTypingUsers(prev => { const n = { ...prev }; delete n[uid]; return n; });
      }
    }
  }, [queryClient]);

  const { sendWs } = useRealtimeSocket(user?.role, handleWsEvent);

  // Enviar typing_start quando o utilizador começa a escrever
  const handleInputChange = useCallback((text: string) => {
    setInputText(text);
    if (!selectedUserId || !user?.id || Platform.OS !== 'web') return;
    if (text.trim() && !isTypingSentRef.current) {
      isTypingSentRef.current = true;
      sendWs({ type: 'typing_start', toUserId: selectedUserId, fromUserName: user.nome ?? '' });
    }
    // Parar typing após 2s de inactividade
    if (typingStopTimerRef.current) clearTimeout(typingStopTimerRef.current);
    if (text.trim()) {
      typingStopTimerRef.current = setTimeout(() => {
        isTypingSentRef.current = false;
        sendWs({ type: 'typing_stop', toUserId: selectedUserId, fromUserName: user.nome ?? '' });
      }, 2000);
    } else {
      isTypingSentRef.current = false;
      sendWs({ type: 'typing_stop', toUserId: selectedUserId, fromUserName: user.nome ?? '' });
    }
  }, [selectedUserId, user, sendWs]);

  // Garante que conversas existentes aparecem mesmo que o utilizador não esteja
  // na lista de contactos do servidor (e.g. conta entretanto desactivada)
  const staffContacts: StaffContact[] = useMemo(() => {
    const fromApi: StaffContact[] = contactsData ?? [];
    const existingIds = new Set(fromApi.map(c => c.id));
    const fromConversations: StaffContact[] = conversations
      .filter(c => !existingIds.has(c.userId))
      .map(c => ({ id: c.userId, nome: c.userName, role: c.userRole, escola: '' }));
    return [...fromApi, ...fromConversations].sort((a, b) => a.nome.localeCompare(b.nome));
  }, [contactsData, conversations]);

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
    [conversations, selectedUserId],
  );

  const selectedContact = useMemo(
    () => staffContacts.find(c => c.id === selectedUserId),
    [staffContacts, selectedUserId],
  );

  useEffect(() => {
    if (selectedUserId) {
      markConversationRead(selectedUserId);
    }
  }, [selectedUserId, conversations]);

  useEffect(() => {
    if (flatListRef.current && selectedConv?.msgs.length) {
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [selectedConv?.msgs.length]);

  async function handleSend() {
    if ((!inputText.trim() && pendingAnexos.length === 0) || !selectedUserId || sending) return;
    const contact = selectedContact ?? { nome: selectedConv?.userName ?? '', role: selectedConv?.userRole ?? '' };
    // Parar indicador de typing ao enviar
    if (isTypingSentRef.current) {
      isTypingSentRef.current = false;
      if (typingStopTimerRef.current) { clearTimeout(typingStopTimerRef.current); typingStopTimerRef.current = null; }
      sendWs({ type: 'typing_stop', toUserId: selectedUserId, fromUserName: user?.nome ?? '' });
    }
    setSending(true);
    const anexosToSend = [...pendingAnexos];
    try {
      await sendMensagem(selectedUserId, contact.nome, contact.role, inputText.trim(), anexosToSend);
      setInputText('');
      setPendingAnexos([]);
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
      // Pré-visualização local imediata (antes do upload)
      const isImg = file.type.startsWith('image/');
      const localPreviewUrl = isImg ? URL.createObjectURL(file) : undefined;
      const placeholderId = `pending-${Date.now()}`;
      if (localPreviewUrl) {
        setPendingAnexos(prev => [...prev, {
          url: localPreviewUrl,
          nome: file.name,
          tipo: 'image',
          tamanho: file.size,
          _localPreview: true,
          _placeholderId: placeholderId,
        } as any]);
      }
      setUploadingFile(true);
      try {
        const { getAuthToken } = await import('@/context/AuthContext');
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
        // Substituir placeholder pela URL real do servidor
        if (localPreviewUrl) {
          setPendingAnexos(prev => prev.map(a =>
            (a as any)._placeholderId === placeholderId ? { ...anexo, _localPreview: false } : a
          ));
          URL.revokeObjectURL(localPreviewUrl);
        } else {
          setPendingAnexos(prev => [...prev, anexo]);
        }
      } catch {
        // Remover placeholder em caso de erro
        if (localPreviewUrl) {
          setPendingAnexos(prev => prev.filter(a => (a as any)._placeholderId !== placeholderId));
          URL.revokeObjectURL(localPreviewUrl);
        }
        showToast('Não foi possível fazer upload do ficheiro.', 'error');
      } finally {
        setUploadingFile(false);
      }
    };
    input.click();
  }

  function startChat(contact: StaffContact) {
    setSelectedUserId(contact.id);
    setShowNewChat(false);
    setSearchContact('');
  }

  async function toggleReacao(msgId: string, emoji: string) {
    try {
      const { getAuthToken } = await import('@/context/AuthContext');
      const tok = await getAuthToken();
      await fetch(`/api/chat-interno/reacoes/${msgId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: `Bearer ${tok}` } : {}) },
        body: JSON.stringify({ emoji }),
      });
      // Recarrega mensagens para actualizar reacoes
      await loadMensagens();
    } catch {
      showToast('Não foi possível reagir.', 'error');
    }
  }

  function renderBubble(msg: ChatMsg) {
    const mine = msg.remetenteId === user?.id;
    const anexos: ChatAnexo[] = Array.isArray(msg.anexos) ? msg.anexos : [];
    const images = anexos.filter(a => a.tipo === 'image');
    const files  = anexos.filter(a => a.tipo !== 'image');
    const hasOnlyImage = images.length > 0 && !msg.corpo && files.length === 0;
    const reacoes: ChatReacao[] = Array.isArray(msg.reacoes) ? msg.reacoes.filter(r => r.count > 0) : [];

    const metaBlock = (overlay = false) => (
      <View style={[styles.bubbleMeta, overlay && styles.bubbleMetaOverlay]}>
        <Text style={[styles.bubbleTime, overlay ? styles.bubbleTimeOverlay : (mine ? styles.bubbleTimeMine : styles.bubbleTimeTheirs)]}>
          {tempoRelativo(msg.createdAt)}
        </Text>
        {mine && (
          <View style={styles.readStatus}>
            <Ionicons
              name={msg.lida ? 'checkmark-done' : 'checkmark'}
              size={12}
              color={overlay ? 'rgba(255,255,255,0.9)' : (msg.lida ? '#93C5FD' : 'rgba(255,255,255,0.5)')}
            />
          </View>
        )}
      </View>
    );

    return (
      <View key={msg.id} style={[styles.bubbleRow, mine ? styles.bubbleRowMine : styles.bubbleRowTheirs]}>
        {!mine && <Avatar name={msg.remetenteNome} role={msg.remetenteRole} size={28} />}

        <View style={{ maxWidth: '78%' }}>
          {/* Imagens — bolha estilo WhatsApp */}
          {images.map((a, i) => {
            const isOnlyItem = hasOnlyImage && images.length === 1;
            return (
              <View key={i} style={[
                styles.imgBubble,
                mine ? styles.imgBubbleMine : styles.imgBubbleTheirs,
                i > 0 && { marginTop: 2 },
              ]}>
                <ChatImage
                  url={a.url}
                  style={styles.imgBubbleImg}
                  onPress={(blobUrl) => setLightboxUrl(blobUrl)}
                />
                {/* Timestamp sobreposto na imagem, como WhatsApp */}
                {isOnlyItem && metaBlock(true)}
              </View>
            );
          })}

          {/* Ficheiros */}
          {files.map((a, i) => (
            <TouchableOpacity key={i} activeOpacity={0.8}
              onPress={() => Platform.OS === 'web' && (window as any).open(a.url, '_blank')}
              style={[styles.fileBubble, mine ? styles.fileBubbleMine : styles.fileBubbleTheirs, i > 0 && { marginTop: 2 }]}>
              <View style={styles.fileIconWrap}>
                <Ionicons name="document-text" size={22} color={mine ? '#fff' : Colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.fileName, { color: mine ? '#fff' : Colors.text }]} numberOfLines={2}>{a.nome}</Text>
                <Text style={[styles.fileSize, { color: mine ? 'rgba(255,255,255,0.6)' : Colors.textMuted }]}>
                  {a.tamanho ? `${(a.tamanho / 1024).toFixed(0)} KB` : 'Documento'}
                </Text>
              </View>
              <Ionicons name="cloud-download-outline" size={18} color={mine ? 'rgba(255,255,255,0.7)' : Colors.textMuted} />
            </TouchableOpacity>
          ))}

          {/* Texto e meta (quando há texto ou múltiplos itens) */}
          {(!!msg.corpo || !hasOnlyImage) && (
            <TouchableOpacity
              activeOpacity={0.97}
              onLongPress={() => setEmojiPickerMsgId(msg.id)}
              delayLongPress={400}
            >
              <View style={[
                styles.bubble,
                mine ? styles.bubbleMine : styles.bubbleTheirs,
                !msg.corpo && { paddingVertical: 4, paddingHorizontal: 10 },
                (images.length > 0 || files.length > 0) && { marginTop: 2 },
              ]}>
                {!!msg.corpo && (
                  <Text style={[styles.bubbleText, mine ? styles.bubbleTextMine : styles.bubbleTextTheirs]}>
                    {msg.corpo}
                  </Text>
                )}
                {metaBlock(false)}
              </View>
            </TouchableOpacity>
          )}

          {/* Reações emoji — abaixo da bolha, ao estilo WhatsApp/Slack */}
          {reacoes.length > 0 && (
            <View style={[styles.reacoesRow, mine ? styles.reacoesRowMine : styles.reacoesRowTheirs]}>
              {reacoes.map(r => (
                <TouchableOpacity
                  key={r.emoji}
                  onPress={() => toggleReacao(msg.id, r.emoji)}
                  style={[styles.reacaoBadge, r.myReaction && styles.reacaoBadgeMine]}
                  activeOpacity={0.75}
                >
                  <Text style={styles.reacaoEmoji}>{r.emoji}</Text>
                  {r.count > 1 && <Text style={[styles.reacaoCount, r.myReaction && styles.reacaoCountMine]}>{r.count}</Text>}
                </TouchableOpacity>
              ))}
              {/* Botão + para adicionar mais reações */}
              <TouchableOpacity onPress={() => setEmojiPickerMsgId(msg.id)} style={styles.reacaoAdd} activeOpacity={0.7}>
                <Text style={styles.reacaoAddText}>＋</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    );
  }

  const chatName = selectedConv?.userName ?? selectedContact?.nome ?? '';
  const chatRole = selectedConv?.userRole ?? selectedContact?.role ?? '';

  return (
    <View style={styles.root}>
      <TopBar title="Chat Interno" />

      <View style={[styles.body, isDesktop && styles.bodyDesktop]}>
        {/* ── Sidebar (conversas) ── */}
        <View style={[styles.sidebar, isDesktop ? styles.sidebarDesktop : (selectedUserId ? styles.sidebarHidden : styles.sidebarFull)]}>
          <View style={styles.sidebarHeader}>
            <Text style={styles.sidebarTitle}>Conversas</Text>
            <TouchableOpacity onPress={() => setShowNewChat(true)} style={styles.newChatBtn}>
              <Ionicons name="create-outline" size={20} color={Colors.primary} />
            </TouchableOpacity>
          </View>

          {!isLoading && conversations.length === 0 ? (
            <View style={styles.emptyState}>
              <MaterialCommunityIcons name="chat-outline" size={48} color={Colors.textMuted} />
              <Text style={styles.emptyText}>Sem conversas ainda</Text>
              <Text style={styles.emptySubtext}>Toque em   para iniciar uma conversa</Text>
              <TouchableOpacity onPress={() => setShowNewChat(true)} style={styles.emptyBtn}>
                <Ionicons name="create-outline" size={16} color="#fff" />
                <Text style={styles.emptyBtnText}>Nova Conversa</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <ScrollView showsVerticalScrollIndicator={false}>
              {conversations.map(conv => (
                <TouchableOpacity
                  key={conv.userId}
                  style={[styles.convItem, selectedUserId === conv.userId && styles.convItemActive]}
                  onPress={() => setSelectedUserId(conv.userId)}
                >
                  <Avatar name={conv.userName} role={conv.userRole} size={44} isOnline={onlineSet.has(conv.userId)} />
                  <View style={styles.convInfo}>
                    <View style={styles.convTopRow}>
                      <Text style={styles.convName} numberOfLines={1}>{conv.userName}</Text>
                      <Text style={styles.convTime}>{labelData(conv.lastMsg.createdAt)}</Text>
                    </View>
                    <View style={styles.convBottomRow}>
                      {typingUsers[conv.userId] ? (
                        <Text style={[styles.convPreview, { color: Colors.primary, fontStyle: 'italic' }]} numberOfLines={1}>
                          a escrever...
                        </Text>
                      ) : (
                        <Text style={[styles.convPreview, conv.unread > 0 && styles.convPreviewUnread]} numberOfLines={1}>
                          {conv.lastMsg.remetenteId === user?.id ? 'Você: ' : ''}{conv.lastMsg.corpo}
                        </Text>
                      )}
                      {conv.unread > 0 ? (
                        <View style={styles.unreadBadge}>
                          <Text style={styles.unreadBadgeText}>{conv.unread}</Text>
                        </View>
                      ) : conv.lastMsg.remetenteId === user?.id && conv.lastMsg.lida ? (
                        <View style={styles.convReadTag}>
                          <Ionicons name="checkmark-done" size={11} color="#93C5FD" />
                          <Text style={styles.convReadTagText}>Leu</Text>
                        </View>
                      ) : null}
                    </View>
                    <View style={styles.convBottomMeta}>
                      <Text style={[styles.roleChip, { color: roleColor(conv.userRole) }]}>
                        {getRoleLabel(conv.userRole, (conv as any).genero)}
                      </Text>
                      {onlineData && (
                        <View style={styles.presenceLabel}>
                          <View style={[styles.presenceLabelDot, { backgroundColor: onlineSet.has(conv.userId) ? '#22C55E' : '#64748B' }]} />
                          <Text style={[styles.presenceLabelText, { color: onlineSet.has(conv.userId) ? '#22C55E' : Colors.textMuted }]}>
                            {onlineSet.has(conv.userId) ? 'Online' : 'Offline'}
                          </Text>
                        </View>
                      )}
                    </View>
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
        </View>

        {/* ── Painel de chat ── */}
        {selectedUserId ? (
          <KeyboardAvoidingView
            style={styles.chatPanel}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            keyboardVerticalOffset={80}
          >
            {/* Header da conversa */}
            <View style={styles.chatHeader}>
              {!isDesktop && (
                <TouchableOpacity onPress={() => setSelectedUserId(null)} style={styles.backBtn}>
                  <Ionicons name="arrow-back" size={22} color={Colors.text} />
                </TouchableOpacity>
              )}
              <Avatar name={chatName} role={chatRole} size={38} isOnline={selectedUserId ? onlineSet.has(selectedUserId) : undefined} />
              <View style={styles.chatHeaderInfo}>
                <Text style={styles.chatHeaderName}>{chatName}</Text>
                {onlineData && selectedUserId ? (
                  <View style={styles.headerPresence}>
                    <View style={[styles.headerPresenceDot, { backgroundColor: onlineSet.has(selectedUserId) ? '#22C55E' : '#64748B' }]} />
                    <Text style={[styles.headerPresenceText, { color: onlineSet.has(selectedUserId) ? '#22C55E' : Colors.textMuted }]}>
                      {onlineSet.has(selectedUserId) ? 'Online agora' : 'Offline'}
                    </Text>
                  </View>
                ) : (
                  <Text style={[styles.chatHeaderRole, { color: roleColor(chatRole) }]}>
                    {getRoleLabel(chatRole, undefined)}
                  </Text>
                )}
              </View>
              <TouchableOpacity onPress={loadMensagens} style={styles.refreshBtn}>
                <Ionicons name="refresh-outline" size={18} color={Colors.textMuted} />
              </TouchableOpacity>
            </View>

            {/* Mensagens */}
            <FlatList
              ref={flatListRef}
              data={buildMsgList(selectedConv?.msgs ?? [])}
              keyExtractor={item => item.id}
              renderItem={({ item }) => {
                if ('_type' in item && item._type === 'separator') {
                  return <DaySeparator label={item.label} />;
                }
                return renderBubble(item as ChatMsg);
              }}
              contentContainerStyle={[styles.messagesContent, { paddingBottom: bottomInset + 8 }]}
              showsVerticalScrollIndicator={false}
              ListEmptyComponent={
                <View style={styles.emptyChat}>
                  <MaterialCommunityIcons name="message-text-outline" size={40} color={Colors.textMuted} />
                  <Text style={styles.emptyChatText}>Inicie a conversa com {chatName}</Text>
                </View>
              }
              onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
            />

            {/* Indicador "a escrever..." */}
            {selectedUserId && typingUsers[selectedUserId] && (
              <View style={styles.typingIndicator}>
                <View style={styles.typingDots}>
                  <View style={[styles.typingDot, styles.typingDot1]} />
                  <View style={[styles.typingDot, styles.typingDot2]} />
                  <View style={[styles.typingDot, styles.typingDot3]} />
                </View>
                <Text style={styles.typingText}>{typingUsers[selectedUserId]} está a escrever...</Text>
              </View>
            )}

            {/* Pré-visualização de anexos pendentes — estilo WhatsApp */}
            {pendingAnexos.length > 0 && (
              <View style={styles.pendingBar}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pendingScroll}>
                  {pendingAnexos.map((a, i) => (
                    <View key={i} style={styles.pendingItem}>
                      {a.tipo === 'image' ? (
                        <View style={styles.pendingImgWrap}>
                          {/* img nativo para pré-visualização local (blob URL) */}
                          {Platform.OS === 'web' ? (
                            // @ts-ignore
                            <img src={a.url} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 12 }} alt="preview" />
                          ) : null}
                          {(a as any)._localPreview && (
                            <View style={styles.pendingUploadingOverlay}>
                              <ActivityIndicator size="small" color="#fff" />
                            </View>
                          )}
                        </View>
                      ) : (
                        <View style={styles.pendingFileWrap}>
                          <Ionicons name="document-text" size={28} color={Colors.primary} />
                          <Text style={styles.pendingFileName} numberOfLines={2}>{a.nome}</Text>
                        </View>
                      )}
                      <TouchableOpacity
                        onPress={() => setPendingAnexos(prev => prev.filter((_, j) => j !== i))}
                        style={styles.pendingRemoveBtn}>
                        <Ionicons name="close" size={10} color="#fff" />
                      </TouchableOpacity>
                    </View>
                  ))}
                </ScrollView>
                <Text style={styles.pendingHint}>
                  {pendingAnexos.length} ficheiro{pendingAnexos.length > 1 ? 's' : ''} pronto{pendingAnexos.length > 1 ? 's' : ''} · toque Enviar para partilhar
                </Text>
              </View>
            )}

            {/* Input */}
            <View style={[styles.inputRow, { paddingBottom: bottomInset + 8 }]}>
              {Platform.OS === 'web' && (
                <TouchableOpacity
                  style={[styles.attachBtn, uploadingFile && { opacity: 0.5 }]}
                  onPress={handlePickFile}
                  disabled={uploadingFile}
                  activeOpacity={0.75}
                >
                  {uploadingFile
                    ? <ActivityIndicator size="small" color={Colors.textMuted} />
                    : <Ionicons name="attach-outline" size={20} color={Colors.textMuted} />}
                </TouchableOpacity>
              )}
              <TextInput
                style={styles.textInput}
                placeholder="Escreva uma mensagem..."
                placeholderTextColor={Colors.textMuted}
                value={inputText}
                onChangeText={handleInputChange}
                multiline
                maxLength={1000}
                onSubmitEditing={Platform.OS === 'web' ? undefined : handleSend}
                blurOnSubmit={false}
              />
              <TouchableOpacity
                style={[styles.sendBtn, ((!inputText.trim() && pendingAnexos.length === 0) || sending) && styles.sendBtnDisabled]}
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
          isDesktop && (
            <View style={styles.noConvSelected}>
              <MaterialCommunityIcons name="chat-processing-outline" size={56} color={Colors.textMuted} />
              <Text style={styles.noConvText}>Selecione uma conversa</Text>
              <Text style={styles.noConvSubtext}>ou inicie uma nova</Text>
              <TouchableOpacity onPress={() => setShowNewChat(true)} style={styles.emptyBtn}>
                <Ionicons name="create-outline" size={16} color="#fff" />
                <Text style={styles.emptyBtnText}>Nova Conversa</Text>
              </TouchableOpacity>
            </View>
          )
        )}
      </View>

      {/* Modal: Nova conversa */}
      <Modal visible={showNewChat} transparent animationType="fade" onRequestClose={() => setShowNewChat(false)}>
        {/* Overlay fecha ao clicar fora do sheet */}
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={StyleSheet.absoluteFillObject}
            activeOpacity={1}
            onPress={() => setShowNewChat(false)}
          />
          {/* Sheet — stopPropagation impede fecho ao clicar dentro (web) */}
          <View
            style={styles.modalSheet}
            onStartShouldSetResponder={() => true}
            onResponderGrant={e => e.stopPropagation()}
            {...(Platform.OS === 'web' ? { onClick: (e: any) => e.stopPropagation() } : {})}
          >
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Nova Conversa</Text>
              <TouchableOpacity onPress={() => setShowNewChat(false)}>
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
                <Text style={styles.noContacts}>Nenhum funcionário encontrado.</Text>
              ) : (
                filteredContacts.map((c: StaffContact) => (
                  <TouchableOpacity key={c.id} style={styles.contactItem} onPress={() => startChat(c)}>
                    <Avatar name={c.nome} role={c.role} size={40} isOnline={onlineData ? onlineSet.has(c.id) : undefined} />
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text style={styles.contactName}>{c.nome}</Text>
                      <View style={styles.contactMeta}>
                        <Text style={[styles.contactRole, { color: roleColor(c.role) }]}>
                          {getRoleLabel(c.role, (c as any).genero)}
                        </Text>
                        {onlineData && (
                          <View style={styles.presenceLabel}>
                            <View style={[styles.presenceLabelDot, { backgroundColor: onlineSet.has(c.id) ? '#22C55E' : '#64748B' }]} />
                            <Text style={[styles.presenceLabelText, { color: onlineSet.has(c.id) ? '#22C55E' : Colors.textMuted }]}>
                              {onlineSet.has(c.id) ? 'Online' : 'Offline'}
                            </Text>
                          </View>
                        )}
                      </View>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Emoji Picker — long-press na mensagem */}
      {emojiPickerMsgId !== null && (
        <Modal visible transparent animationType="fade" onRequestClose={() => setEmojiPickerMsgId(null)}>
          <TouchableOpacity activeOpacity={1} style={styles.emojiPickerBg} onPress={() => setEmojiPickerMsgId(null)}>
            <TouchableOpacity activeOpacity={1} style={styles.emojiPickerBox} onPress={e => e.stopPropagation?.()}>
              <Text style={styles.emojiPickerTitle}>Reagir</Text>
              <View style={styles.emojiPickerRow}>
                {EMOJIS_RAPIDOS.map(e => (
                  <TouchableOpacity
                    key={e}
                    style={styles.emojiBtn}
                    activeOpacity={0.7}
                    onPress={async () => {
                      setEmojiPickerMsgId(null);
                      await toggleReacao(emojiPickerMsgId, e);
                    }}
                  >
                    <Text style={styles.emojiBtnText}>{e}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>
      )}

      {/* Lightbox de imagem — toque fora ou X para fechar */}
      {lightboxUrl !== null && (
        <Modal visible transparent animationType="fade" onRequestClose={() => setLightboxUrl(null)}>
          <TouchableOpacity
            activeOpacity={1}
            onPress={() => setLightboxUrl(null)}
            style={styles.lightboxBg}>
            <TouchableOpacity activeOpacity={1} style={styles.lightboxInner} onPress={e => e.stopPropagation?.()}>
              {Platform.OS === 'web' && (
                // @ts-ignore
                <img
                  src={lightboxUrl}
                  style={{
                    maxWidth: '90vw', maxHeight: '85vh',
                    objectFit: 'contain', borderRadius: 12,
                    display: 'block',
                  }}
                  alt="imagem ampliada"
                />
              )}
            </TouchableOpacity>
            <TouchableOpacity style={styles.lightboxClose} onPress={() => setLightboxUrl(null)}>
              <Ionicons name="close-circle" size={36} color="#fff" />
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  body: { flex: 1 },
  bodyDesktop: { flexDirection: 'row' },

  // Sidebar
  sidebar: { backgroundColor: Colors.card, borderRightWidth: 1, borderRightColor: Colors.border },
  sidebarDesktop: { width: 320 },
  sidebarFull: { flex: 1 },
  sidebarHidden: { display: 'none' },
  sidebarHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  sidebarTitle: { fontSize: 17, fontWeight: '700', color: Colors.text },
  newChatBtn: { padding: 4 },

  // Conversation item
  convItem: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  convItemActive: { backgroundColor: Colors.primary + '15' },
  convInfo: { flex: 1, marginLeft: 12 },
  convTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  convName: { fontSize: 15, fontWeight: '600', color: Colors.text, flex: 1, marginRight: 6 },
  convTime: { fontSize: 11, color: Colors.textMuted },
  convBottomRow: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  convPreview: { fontSize: 13, color: Colors.textMuted, flex: 1, marginRight: 6 },
  convPreviewUnread: { color: Colors.text, fontWeight: '600' },
  roleChip: { fontSize: 11, fontWeight: '500', marginTop: 2 },
  unreadBadge: {
    backgroundColor: Colors.primary, borderRadius: 10,
    minWidth: 18, height: 18, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4,
  },
  unreadBadgeText: { fontSize: 11, fontWeight: '700', color: '#fff' },
  convReadTag: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  convReadTagText: { fontSize: 11, color: '#93C5FD', fontWeight: '600' },

  // Empty state (sidebar)
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  emptyText: { color: Colors.text, fontSize: 15, fontWeight: '600', marginTop: 12 },
  emptySubtext: { color: Colors.textMuted, fontSize: 13, marginTop: 4, textAlign: 'center' },
  emptyBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: Colors.primary, borderRadius: 8,
    paddingHorizontal: 16, paddingVertical: 10, marginTop: 16,
  },
  emptyBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },

  // Chat panel
  chatPanel: { flex: 1, flexDirection: 'column' },
  chatHeader: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: Colors.border, backgroundColor: Colors.card,
  },
  backBtn: { marginRight: 10, padding: 4 },
  chatHeaderInfo: { flex: 1, marginLeft: 10 },
  chatHeaderName: { fontSize: 15, fontWeight: '700', color: Colors.text },
  chatHeaderRole: { fontSize: 12, fontWeight: '500', marginTop: 1 },
  refreshBtn: { padding: 6 },

  // Messages
  messagesContent: { paddingHorizontal: 12, paddingTop: 12, flexGrow: 1 },
  bubbleRow: { flexDirection: 'row', marginBottom: 8, alignItems: 'flex-end' },
  bubbleRowMine: { justifyContent: 'flex-end' },
  bubbleRowTheirs: { justifyContent: 'flex-start' },
  bubble: {
    borderRadius: 16, paddingHorizontal: 14, paddingVertical: 8,
    shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 4, shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  bubbleMine: { backgroundColor: Colors.primary, borderBottomRightRadius: 4, marginLeft: 8 },
  bubbleTheirs: { backgroundColor: Colors.card, borderBottomLeftRadius: 4, marginLeft: 8, borderWidth: 1, borderColor: Colors.border },
  bubbleText: { fontSize: 14, lineHeight: 20 },
  bubbleTextMine: { color: '#fff' },
  bubbleTextTheirs: { color: Colors.text },
  bubbleMeta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', marginTop: 4, gap: 4 },
  bubbleMetaOverlay: {
    position: 'absolute', bottom: 8, right: 10,
    backgroundColor: 'rgba(0,0,0,0.35)', borderRadius: 8,
    paddingHorizontal: 6, paddingVertical: 2,
  },
  bubbleTime: { fontSize: 10 },
  bubbleTimeMine: { color: 'rgba(255,255,255,0.65)' },
  bubbleTimeTheirs: { color: Colors.textMuted },
  bubbleTimeOverlay: { color: 'rgba(255,255,255,0.92)', fontSize: 10 },
  readStatus: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  readStatusText: { fontSize: 10, color: '#93C5FD', fontWeight: '600' },

  // Image bubble — estilo WhatsApp
  imgBubble: {
    borderRadius: 16, overflow: 'hidden',
    width: 260, height: 200,
    shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 6, shadowOffset: { width: 0, height: 2 },
    elevation: 3, marginLeft: 8,
  },
  imgBubbleMine: { borderBottomRightRadius: 4, alignSelf: 'flex-end' },
  imgBubbleTheirs: { borderBottomLeftRadius: 4, alignSelf: 'flex-start' },
  imgBubbleImg: { width: 260, height: 200, borderRadius: 16, overflow: 'hidden' },

  // File bubble
  fileBubble: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10,
    marginLeft: 8, minWidth: 220,
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4, shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  fileBubbleMine: { backgroundColor: Colors.primary, borderBottomRightRadius: 4 },
  fileBubbleTheirs: { backgroundColor: Colors.card, borderBottomLeftRadius: 4, borderWidth: 1, borderColor: Colors.border },
  fileIconWrap: {
    width: 40, height: 40, borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center',
  },
  fileName: { fontSize: 13, fontFamily: 'Inter_500Medium', lineHeight: 17 },
  fileSize: { fontSize: 11, fontFamily: 'Inter_400Regular', marginTop: 2 },

  // Pending attachments bar
  pendingBar: {
    borderTopWidth: 1, borderTopColor: Colors.border,
    backgroundColor: Colors.card, paddingTop: 8, paddingBottom: 4,
  },
  pendingScroll: { paddingHorizontal: 12, gap: 8 },
  pendingItem: { position: 'relative' },
  pendingImgWrap: {
    width: 90, height: 90, borderRadius: 12,
    backgroundColor: Colors.surface, overflow: 'hidden',
  },
  pendingUploadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center', justifyContent: 'center', borderRadius: 12,
  },
  pendingFileWrap: {
    width: 90, height: 90, borderRadius: 12,
    backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: Colors.border, gap: 4, paddingHorizontal: 6,
  },
  pendingFileName: { fontSize: 10, color: Colors.textMuted, textAlign: 'center', fontFamily: 'Inter_400Regular' },
  pendingRemoveBtn: {
    position: 'absolute', top: -5, right: -5,
    backgroundColor: '#EF4444', borderRadius: 10,
    width: 20, height: 20, alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: Colors.card,
  },
  pendingHint: {
    fontSize: 11, color: Colors.textMuted, textAlign: 'center',
    fontFamily: 'Inter_400Regular', paddingHorizontal: 12, paddingVertical: 4,
  },

  // Lightbox
  lightboxBg: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.88)',
    alignItems: 'center', justifyContent: 'center',
  },
  lightboxInner: { alignItems: 'center', justifyContent: 'center' },
  lightboxClose: {
    position: 'absolute', top: 40, right: 20,
  },

  // Reações emoji
  reacoesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4, marginLeft: 8 },
  reacoesRowMine: { justifyContent: 'flex-end' },
  reacoesRowTheirs: { justifyContent: 'flex-start' },
  reacaoBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: Colors.surface,
    borderRadius: 12, paddingHorizontal: 7, paddingVertical: 3,
    borderWidth: 1, borderColor: Colors.border,
  },
  reacaoBadgeMine: {
    backgroundColor: 'rgba(79,70,229,0.12)', borderColor: Colors.primary,
  },
  reacaoEmoji: { fontSize: 15 },
  reacaoCount: { fontSize: 11, color: Colors.textMuted, fontFamily: 'Inter_500Medium' },
  reacaoCountMine: { color: Colors.primary },
  reacaoAdd: {
    width: 26, height: 24, borderRadius: 12,
    backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: Colors.border,
  },
  reacaoAddText: { fontSize: 13, color: Colors.textMuted, lineHeight: 18 },

  // Emoji Picker
  emojiPickerBg: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center', justifyContent: 'center',
  },
  emojiPickerBox: {
    backgroundColor: Colors.card,
    borderRadius: 20, padding: 20,
    alignItems: 'center',
    shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 16, shadowOffset: { width: 0, height: 8 },
    elevation: 12,
    minWidth: 280,
  },
  emojiPickerTitle: {
    fontSize: 13, fontFamily: 'Inter_600SemiBold', color: Colors.textMuted,
    marginBottom: 14, textTransform: 'uppercase', letterSpacing: 1,
  },
  emojiPickerRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', justifyContent: 'center' },
  emojiBtn: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: Colors.border,
  },
  emojiBtnText: { fontSize: 26 },

  // Empty chat
  emptyChat: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60 },
  emptyChatText: { color: Colors.textMuted, fontSize: 14, marginTop: 12, textAlign: 'center' },

  // Input
  inputRow: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 10,
    paddingHorizontal: 12, paddingTop: 10,
    borderTopWidth: 1, borderTopColor: Colors.border, backgroundColor: Colors.card,
  },
  textInput: {
    flex: 1, backgroundColor: Colors.background, borderRadius: 20,
    paddingHorizontal: 16, paddingVertical: 10,
    fontSize: 14, color: Colors.text,
    borderWidth: 1, borderColor: Colors.border,
    maxHeight: 120, minHeight: 42,
  },
  sendBtn: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center',
  },
  sendBtnDisabled: { opacity: 0.4 },
  attachBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: Colors.border,
  },

  // No conv selected (desktop placeholder)
  noConvSelected: {
    flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  noConvText: { fontSize: 18, fontWeight: '600', color: Colors.text, marginTop: 12 },
  noConvSubtext: { fontSize: 14, color: Colors.textMuted },

  // Avatar
  avatar: { alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontWeight: '700' },
  presenceDot: {
    position: 'absolute',
    borderColor: Colors.card,
  },

  // Indicador "a escrever..."
  typingIndicator: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 16, paddingVertical: 7,
    backgroundColor: Colors.card,
    borderTopWidth: 1, borderTopColor: Colors.border,
  },
  typingDots: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  typingDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.primary, opacity: 0.5 },
  typingDot1: {},
  typingDot2: {},
  typingDot3: {},
  typingText: { fontSize: 12, color: Colors.textMuted, fontStyle: 'italic', fontFamily: 'Inter_400Regular' },

  // Presença inline (lista de conversas + modal)
  convBottomMeta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 },
  presenceLabel: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  presenceLabelDot: { width: 6, height: 6, borderRadius: 3 },
  presenceLabelText: { fontSize: 10, fontWeight: '500' },

  // Cabeçalho da conversa — estado de presença
  headerPresence: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 1 },
  headerPresenceDot: { width: 7, height: 7, borderRadius: 4 },
  headerPresenceText: { fontSize: 12, fontWeight: '600' },

  // Modal de nova conversa — meta do contacto
  contactMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 },

  // Modal
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center', alignItems: 'center', padding: 20,
  },
  modalSheet: {
    backgroundColor: Colors.card, borderRadius: 16,
    width: '100%', maxWidth: 480, maxHeight: '80%',
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 16,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  modalTitle: { fontSize: 17, fontWeight: '700', color: Colors.text },
  searchBox: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: 16, marginVertical: 12,
    backgroundColor: Colors.background, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 8,
    borderWidth: 1, borderColor: Colors.border,
  },
  searchInput: { flex: 1, fontSize: 16, color: Colors.text },
  contactList: { paddingHorizontal: 16, paddingBottom: 16 },
  contactItem: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  contactName: { fontSize: 15, fontWeight: '600', color: Colors.text },
  contactRole: { fontSize: 12, fontWeight: '500', marginTop: 2 },
  noContacts: { color: Colors.textMuted, fontSize: 14, textAlign: 'center', marginTop: 20 },
});
