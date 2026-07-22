import React, { useEffect, useRef } from 'react';
import {
  Modal, View, Text, StyleSheet, TouchableOpacity, Animated, Platform, ActivityIndicator,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors } from '@/constants/colors';

export type EstadoActivacao =
  | { tipo: 'fechado' }
  | { tipo: 'a-validar'; codigo: string }
  | { tipo: 'sucesso'; mensagem: string; reciboUrl?: string | null; historicoId?: string | null }
  | { tipo: 'erro'; mensagem: string; tentativas: number; restantes: number }
  | { tipo: 'bloqueado'; mensagem: string };

interface Props {
  estado: EstadoActivacao;
  onClose: () => void;
  onContinuar?: () => void;
  onTentarOutra?: () => void;
  onAbrirRecibo?: (url: string) => void;
}

export default function ActivacaoCodigoModal({ estado, onClose, onContinuar, onTentarOutra, onAbrirRecibo }: Props) {
  const visible = estado.tipo !== 'fechado';
  const fadeIn = useRef(new Animated.Value(0)).current;
  const cardScale = useRef(new Animated.Value(0.92)).current;
  const pulse = useRef(new Animated.Value(1)).current;
  const spin = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) {
      fadeIn.setValue(0);
      cardScale.setValue(0.92);
      return;
    }
    const nd = Platform.OS !== 'web';
    Animated.parallel([
      Animated.timing(fadeIn, { toValue: 1, duration: 220, useNativeDriver: nd }),
      Animated.spring(cardScale, { toValue: 1, damping: 18, stiffness: 160, useNativeDriver: nd }),
    ]).start();
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.06, duration: 800, useNativeDriver: nd }),
        Animated.timing(pulse, { toValue: 1, duration: 800, useNativeDriver: nd }),
      ])
    ).start();
    Animated.loop(
      Animated.timing(spin, { toValue: 1, duration: 1500, useNativeDriver: nd })
    ).start();
  }, [visible]);

  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  let icone: any = 'shield-checkmark';
  let cor = Colors.gold;
  let titulo = '';
  let subtitulo = '';
  let bgGrad: [string, string] = ['rgba(212,146,14,0.22)', 'rgba(212,146,14,0.06)'];

  if (estado.tipo === 'a-validar') {
    icone = 'shield-half';
    cor = Colors.gold;
    titulo = 'A validar código…';
    subtitulo = `A verificar a autenticidade de ${estado.codigo} no servidor seguro. Não feche esta janela.`;
  } else if (estado.tipo === 'sucesso') {
    icone = 'checkmark-circle';
    cor = '#22C55E';
    bgGrad = ['rgba(34,197,94,0.22)', 'rgba(34,197,94,0.06)'];
    titulo = 'Licença Activada!';
    subtitulo = estado.mensagem;
  } else if (estado.tipo === 'erro') {
    icone = 'alert-circle';
    cor = '#F59E0B';
    bgGrad = ['rgba(245,158,11,0.22)', 'rgba(245,158,11,0.06)'];
    titulo = 'Código não aceite';
    subtitulo = estado.mensagem;
  } else if (estado.tipo === 'bloqueado') {
    icone = 'lock-closed';
    cor = '#EF4444';
    bgGrad = ['rgba(239,68,68,0.28)', 'rgba(239,68,68,0.08)'];
    titulo = 'Área bloqueada';
    subtitulo = estado.mensagem;
  }

  return (
    <Modal visible={visible} transparent animationType="none" statusBarTranslucent onRequestClose={estado.tipo === 'a-validar' ? () => {} : onClose}>
      <Animated.View style={[styles.overlay, { opacity: fadeIn }, Platform.OS === 'web' && styles.overlayWeb]}>
        <Animated.View style={[styles.card, { transform: [{ scale: cardScale }], borderColor: cor + '55' }]}>
          <View style={[styles.topAccent, { backgroundColor: cor }]} />

          <View style={styles.iconArea}>
            <Animated.View
              style={[
                styles.iconRing,
                { transform: [estado.tipo === 'a-validar' ? { rotate } : { scale: pulse }], borderColor: cor + '44' },
              ]}
            >
              <LinearGradient colors={bgGrad} style={styles.iconGrad}>
                {estado.tipo === 'a-validar' ? (
                  <ActivityIndicator size="large" color={cor} />
                ) : (
                  <Ionicons name={icone} size={42} color={cor} />
                )}
              </LinearGradient>
            </Animated.View>
          </View>

          <Text style={styles.title}>{titulo}</Text>
          <Text style={styles.subtitle}>{subtitulo}</Text>

          {/* Indicador de tentativas (apenas em erro não bloqueante) */}
          {estado.tipo === 'erro' && estado.restantes > 0 && (
            <View style={[styles.infoBox, { borderColor: '#F59E0B55', backgroundColor: 'rgba(245,158,11,0.08)' }]}>
              <MaterialCommunityIcons name="shield-alert" size={18} color="#F59E0B" />
              <Text style={styles.infoBoxText}>
                Tentativas restantes: <Text style={{ color: '#F59E0B', fontFamily: 'Inter_700Bold' }}>{estado.restantes} de 3</Text>.
                {'\n'}
                <Text style={styles.infoBoxSmall}>Após 3 falhas, a área de activação será bloqueada e só o CEO poderá desbloquear.</Text>
              </Text>
            </View>
          )}

          {/* Caixa de info para bloqueio */}
          {estado.tipo === 'bloqueado' && (
            <View style={[styles.infoBox, { borderColor: '#EF444455', backgroundColor: 'rgba(239,68,68,0.08)' }]}>
              <MaterialCommunityIcons name="account-tie" size={18} color="#EF4444" />
              <Text style={styles.infoBoxText}>
                Por motivos de segurança, contacte o <Text style={{ color: '#EF4444', fontFamily: 'Inter_700Bold' }}>CEO</Text> da instituição
                para reactivar a área de activação. Esta protecção evita ataques de força-bruta sobre códigos de licença.
              </Text>
            </View>
          )}

          {/* Botões */}
          <View style={styles.actions}>
            {estado.tipo === 'sucesso' && (
              <>
                {estado.reciboUrl && (
                  <TouchableOpacity
                    style={[styles.btn, styles.btnSecondary]}
                    onPress={() => onAbrirRecibo?.(estado.reciboUrl!)}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <MaterialCommunityIcons name="receipt" size={15} color={Colors.gold} />
                      <Text style={[styles.btnSecondaryText, { color: Colors.gold }]}>Baixar Recibo</Text>
                    </View>
                  </TouchableOpacity>
                )}
                <TouchableOpacity style={[styles.btn, styles.btnPrimary]} onPress={onContinuar || onClose}>
                  <LinearGradient colors={['#22C55E', '#15803D']} style={styles.btnGrad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                    <Ionicons name="arrow-forward-circle" size={16} color="#fff" />
                    <Text style={styles.btnText}>Aceder à Aplicação</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </>
            )}

            {estado.tipo === 'erro' && estado.restantes > 0 && (
              <>
                <TouchableOpacity style={[styles.btn, styles.btnSecondary]} onPress={onClose}>
                  <Text style={styles.btnSecondaryText}>Fechar</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.btn, styles.btnPrimary]} onPress={onTentarOutra || onClose}>
                  <LinearGradient colors={[Colors.gold, '#D49600']} style={styles.btnGrad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                    <Ionicons name="refresh" size={16} color="#fff" />
                    <Text style={styles.btnText}>Tentar outro código</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </>
            )}

            {estado.tipo === 'bloqueado' && (
              <TouchableOpacity style={[styles.btn, styles.btnPrimary]} onPress={onClose}>
                <LinearGradient colors={['#EF4444', '#B91C1C']} style={styles.btnGrad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                  <Ionicons name="close-circle" size={16} color="#fff" />
                  <Text style={styles.btnText}>Compreendido</Text>
                </LinearGradient>
              </TouchableOpacity>
            )}

            {estado.tipo === 'a-validar' && (
              <Text style={styles.aValidarHint}>
                <Ionicons name="shield-checkmark" size={11} color={Colors.gold} /> Verificação criptográfica em curso…
              </Text>
            )}
          </View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1, justifyContent: 'center', alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.78)', padding: 20,
  },
  overlayWeb: { backdropFilter: 'blur(8px)' as any },
  card: {
    width: '100%', maxWidth: 460,
    backgroundColor: '#0F1419',
    borderWidth: 1, borderRadius: 18,
    paddingVertical: 24, paddingHorizontal: 22,
    shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 30,
    shadowOffset: { width: 0, height: 12 },
    overflow: 'hidden',
  },
  topAccent: {
    position: 'absolute', top: 0, left: 0, right: 0, height: 3,
  },
  iconArea: { alignItems: 'center', marginBottom: 16, marginTop: 4 },
  iconRing: {
    width: 88, height: 88, borderRadius: 44,
    borderWidth: 2, alignItems: 'center', justifyContent: 'center',
  },
  iconGrad: {
    width: 76, height: 76, borderRadius: 38,
    alignItems: 'center', justifyContent: 'center',
  },
  title: {
    fontSize: 20, fontFamily: 'Inter_700Bold',
    color: '#fff', textAlign: 'center', marginBottom: 8,
  },
  subtitle: {
    fontSize: 13, fontFamily: 'Inter_400Regular',
    color: Colors.textSecondary, textAlign: 'center', lineHeight: 19, marginBottom: 14,
  },
  infoBox: {
    flexDirection: 'row', gap: 10,
    borderWidth: 1, borderRadius: 10,
    paddingVertical: 12, paddingHorizontal: 12,
    marginBottom: 16, alignItems: 'flex-start',
  },
  infoBoxText: {
    flex: 1, fontSize: 12, fontFamily: 'Inter_500Medium',
    color: Colors.text, lineHeight: 17,
  },
  infoBoxSmall: { fontSize: 11, color: Colors.textMuted, fontFamily: 'Inter_400Regular' },
  actions: { flexDirection: 'row', gap: 10, justifyContent: 'center', flexWrap: 'wrap' },
  btn: { borderRadius: 10, overflow: 'hidden' },
  btnPrimary: {},
  btnSecondary: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: 18, paddingVertical: 11,
  },
  btnSecondaryText: { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: Colors.text },
  btnGrad: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingHorizontal: 18, paddingVertical: 11,
  },
  btnText: { fontSize: 12, fontFamily: 'Inter_700Bold', color: '#fff' },
  aValidarHint: {
    fontSize: 11, color: Colors.textMuted, fontFamily: 'Inter_500Medium', textAlign: 'center',
  },
});
