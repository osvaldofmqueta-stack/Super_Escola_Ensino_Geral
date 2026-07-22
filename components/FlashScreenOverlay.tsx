import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, Animated, TouchableOpacity, Image, Platform, Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useConfig, FlashDestinario } from '@/context/ConfigContext';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';

// Regista visualização uma única vez por sessão por comunicado (chave = titulo+dataInicio)
const _sessaoVistas = new Set<string>();

const { width } = Dimensions.get('window');
const PERM_KEY_PREFIX = '@siga_flash_perm_v2_';
const REMINDER_MS = 3 * 60 * 1000;

function getPermKey(titulo: string, dataInicio: string): string {
  return `${PERM_KEY_PREFIX}${titulo}_${dataInicio || 'nd'}`;
}

function isPermanentlyDismissed(titulo: string, dataInicio: string): boolean {
  try {
    if (typeof localStorage === 'undefined') return false;
    return !!localStorage.getItem(getPermKey(titulo, dataInicio));
  } catch { return false; }
}

function setPermDismissed(titulo: string, dataInicio: string) {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(getPermKey(titulo, dataInicio), '1');
    }
  } catch {}
}

function matchesRole(destinatarios: FlashDestinario, role?: string): boolean {
  if (!role) return false;
  if (destinatarios === 'todos') return true;
  switch (destinatarios) {
    case 'alunos': return role === 'aluno';
    case 'alunos_encarregados': return role === 'aluno' || role === 'encarregado';
    case 'encarregados': return role === 'encarregado';
    case 'professores': return role === 'professor' || role === 'diretor_turma';
    case 'funcionarios': return [
      'financeiro', 'rh', 'secretaria', 'chefe_secretaria',
      'subdiretor_administrativo', 'pedagogico', 'coordenador_curso',
    ].includes(role);
    case 'administradores': return ['admin', 'director', 'ceo', 'pca'].includes(role);
    default: return true;
  }
}

export default function FlashScreenOverlay() {
  const { config } = useConfig();
  const { user } = useAuth();
  const flash = config.flashScreen;

  const [visible, setVisible] = useState(false);
  const [countdown, setCountdown] = useState(5);

  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.92)).current;

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoCloseRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reminderRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const visibleRef = useRef(false);

  const flashRef = useRef(flash);
  const userRef = useRef(user);
  useEffect(() => { flashRef.current = flash; }, [flash]);
  useEffect(() => { userRef.current = user; }, [user]);

  const clearTimers = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (autoCloseRef.current) { clearTimeout(autoCloseRef.current); autoCloseRef.current = null; }
    if (reminderRef.current) { clearTimeout(reminderRef.current); reminderRef.current = null; }
  }, []);

  const scheduleReminder = useCallback(() => {
    if (reminderRef.current) clearTimeout(reminderRef.current);
    reminderRef.current = setTimeout(() => {
      const f = flashRef.current;
      const u = userRef.current;
      if (!visibleRef.current && f.ativa && f.titulo) {
        const dest = (f.destinatarios || 'todos') as FlashDestinario;
        if (!isPermanentlyDismissed(f.titulo, f.dataInicio) && matchesRole(dest, u?.role)) {
          showCard();
        }
      }
    }, REMINDER_MS);
  }, []);

  const showCard = useCallback(() => {
    const f = flashRef.current;
    if (timerRef.current) clearInterval(timerRef.current);
    if (autoCloseRef.current) clearTimeout(autoCloseRef.current);

    const dur = f.duracao || 5;
    setCountdown(dur);
    setVisible(true);
    visibleRef.current = true;

    // Registar visualização (uma vez por sessão por comunicado)
    const chave = `${f.titulo}_${f.dataInicio || ''}`;
    if (f.titulo && !_sessaoVistas.has(chave)) {
      _sessaoVistas.add(chave);
      api.post('/api/comunicados/marcar-visualizacao', {
        titulo: f.titulo,
        dataInicio: f.dataInicio || '',
      }).catch(() => {});
    }

    const nd = false;
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 400, useNativeDriver: nd }),
      Animated.spring(scale, { toValue: 1, damping: 18, stiffness: 100, useNativeDriver: nd }),
    ]).start();

    let remaining = dur;
    timerRef.current = setInterval(() => {
      remaining -= 1;
      setCountdown(remaining);
      if (remaining <= 0 && timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    }, 1000);

    autoCloseRef.current = setTimeout(() => dismissTemp(), dur * 1000);
  }, [opacity, scale]);

  const dismissTemp = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (autoCloseRef.current) { clearTimeout(autoCloseRef.current); autoCloseRef.current = null; }
    const nd = false;
    Animated.parallel([
      Animated.timing(opacity, { toValue: 0, duration: 300, useNativeDriver: nd }),
      Animated.timing(scale, { toValue: 0.92, duration: 300, useNativeDriver: nd }),
    ]).start(() => {
      setVisible(false);
      visibleRef.current = false;
      scheduleReminder();
    });
  }, [opacity, scale, scheduleReminder]);

  const dismissPermanent = useCallback(() => {
    const f = flashRef.current;
    setPermDismissed(f.titulo, f.dataInicio);
    clearTimers();
    const nd = false;
    Animated.parallel([
      Animated.timing(opacity, { toValue: 0, duration: 300, useNativeDriver: nd }),
      Animated.timing(scale, { toValue: 0.92, duration: 300, useNativeDriver: nd }),
    ]).start(() => {
      setVisible(false);
      visibleRef.current = false;
    });
  }, [opacity, scale, clearTimers]);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    if (!flash.ativa || !flash.titulo) { clearTimers(); return; }

    const today = new Date().toISOString().split('T')[0];
    if (flash.dataInicio && today < flash.dataInicio) return;
    if (flash.dataFim && today > flash.dataFim) return;

    const dest = (flash.destinatarios || 'todos') as FlashDestinario;
    if (!matchesRole(dest, user?.role)) return;
    if (isPermanentlyDismissed(flash.titulo, flash.dataInicio)) return;

    showCard();
    return clearTimers;
  }, [flash.ativa, flash.titulo, flash.mensagem, flash.duracao, flash.destinatarios]);

  if (!visible) return null;

  const bg = flash.bgColor || '#0A1628';

  return (
    <Animated.View style={[styles.overlay, { opacity, backgroundColor: bg + 'F2' }]}>
      <Animated.View style={[styles.card, { transform: [{ scale }] }]}>

        <View style={styles.topBar}>
          <View style={styles.systemBadge}>
            <Ionicons name="megaphone" size={12} color="#FFD700" />
            <Text style={styles.systemLabel}>COMUNICADO OFICIAL</Text>
          </View>
          <TouchableOpacity style={styles.closeBtn} onPress={dismissTemp}>
            <Ionicons name="close" size={18} color="#999" />
          </TouchableOpacity>
        </View>

        {!!flash.imagemUrl && (
          <Image
            source={{ uri: flash.imagemUrl }}
            style={styles.image}
            resizeMode="cover"
            onError={() => {}}
          />
        )}
        {!flash.imagemUrl && (
          <View style={styles.iconPlaceholder}>
            <Ionicons name="notifications" size={52} color="#FFD700" />
          </View>
        )}

        <View style={styles.content}>
          <Text style={styles.title}>{flash.titulo}</Text>
          {!!flash.mensagem && (
            <Text style={styles.message}>{flash.mensagem}</Text>
          )}
        </View>

        <TouchableOpacity style={styles.dismissBtn} onPress={dismissTemp}>
          <Text style={styles.dismissBtnText}>
            {countdown > 0 ? `Fechar em ${countdown}s` : 'Fechar'}
          </Text>
          <View style={styles.progressTrack}>
            <Animated.View
              style={[
                styles.progressBar,
                { width: `${(countdown / (flash.duracao || 5)) * 100}%` },
              ]}
            />
          </View>
        </TouchableOpacity>

        <TouchableOpacity style={styles.permDismissBtn} onPress={dismissPermanent}>
          <Ionicons name="notifications-off-outline" size={13} color="rgba(255,255,255,0.35)" />
          <Text style={styles.permDismissText}>Não mostrar novamente</Text>
        </TouchableOpacity>

      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: '#0F1E3E',
    borderRadius: 24,
    width: '100%',
    maxWidth: 440,
    borderWidth: 1,
    borderColor: 'rgba(255,215,0,0.25)',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.5,
    shadowRadius: 24,
  } as any,
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.07)',
  },
  systemBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,215,0,0.12)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  systemLabel: {
    fontSize: 10,
    fontFamily: 'Inter_700Bold',
    color: '#FFD700',
    letterSpacing: 1,
  },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: {
    width: '100%',
    height: 180,
  },
  iconPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 28,
    backgroundColor: 'rgba(255,215,0,0.06)',
  },
  content: {
    padding: 20,
    paddingBottom: 12,
  },
  title: {
    fontSize: 20,
    fontFamily: 'Inter_700Bold',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 10,
    lineHeight: 28,
  },
  message: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    color: 'rgba(255,255,255,0.75)',
    textAlign: 'center',
    lineHeight: 21,
  },
  dismissBtn: {
    marginHorizontal: 20,
    marginBottom: 8,
    backgroundColor: 'rgba(255,215,0,0.12)',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,215,0,0.3)',
    overflow: 'hidden',
  },
  dismissBtnText: {
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
    color: '#FFD700',
    marginBottom: 8,
  },
  progressTrack: {
    width: '80%',
    height: 3,
    backgroundColor: 'rgba(255,215,0,0.15)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#FFD700',
    borderRadius: 2,
  },
  permDismissBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginBottom: 16,
    paddingVertical: 6,
  },
  permDismissText: {
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
    color: 'rgba(255,255,255,0.35)',
  },
});
