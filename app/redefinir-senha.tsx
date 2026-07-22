import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, KeyboardAvoidingView, ScrollView, Platform, ImageBackground } from 'react-native';
import AppLoader from '@/components/AppLoader';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Colors } from '@/constants/colors';

type Stage = 'verificando' | 'invalido' | 'formulario' | 'sucesso';

export default function RedefinirSenhaScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { token } = useLocalSearchParams<{ token: string }>();

  const [stage, setStage] = useState<Stage>('verificando');
  const [emailMascarado, setEmailMascarado] = useState('');
  const [novaSenha, setNovaSenha] = useState('');
  const [confirmarSenha, setConfirmarSenha] = useState('');
  const [showNova, setShowNova] = useState(false);
  const [showConfirmar, setShowConfirmar] = useState(false);
  const [focusedField, setFocusedField] = useState<'nova' | 'confirmar' | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [erro, setErro] = useState('');
  const confirmarRef = useRef<any>(null);

  useEffect(() => {
    if (!token) {
      setStage('invalido');
      return;
    }
    verificarToken();
  }, [token]);

  async function verificarToken() {
    try {
      const res = await fetch(`/api/verify-reset-token?token=${encodeURIComponent(token as string)}`);
      const data = await res.json();
      if (!res.ok || !data.valid) {
        setStage('invalido');
        return;
      }
      const email: string = data.email ?? '';
      const partes = email.split('@');
      if (partes.length === 2) {
        const nome = partes[0];
        const mascarado = nome.length <= 2
          ? '*'.repeat(nome.length) + '@' + partes[1]
          : nome[0] + '*'.repeat(nome.length - 2) + nome[nome.length - 1] + '@' + partes[1];
        setEmailMascarado(mascarado);
      }
      setStage('formulario');
    } catch {
      setStage('invalido');
    }
  }

  async function handleRedefinir() {
    setErro('');
    if (!novaSenha.trim()) {
      setErro('Introduza a nova senha.');
      return;
    }
    if (novaSenha.length < 6) {
      setErro('A senha deve ter pelo menos 6 caracteres.');
      return;
    }
    if (novaSenha !== confirmarSenha) {
      setErro('As senhas não coincidem. Verifique e tente novamente.');
      return;
    }

    setIsLoading(true);
    try {
      if (Platform.OS !== 'web') {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }
      const res = await fetch('/api/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, novaSenha }),
      });
      const data = await res.json();

      if (!res.ok) {
        setErro(data.error ?? 'Ocorreu um erro. Tente novamente.');
        if (data.error?.includes('expirado') || data.error?.includes('inválido')) {
          setTimeout(() => setStage('invalido'), 1500);
        }
        return;
      }

      if (Platform.OS !== 'web') {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      }
      setStage('sucesso');
    } catch {
      setErro('Não foi possível contactar o servidor. Verifique a sua ligação.');
    } finally {
      setIsLoading(false);
    }
  }

  function getSenhaStrength(senha: string): { label: string; color: string; width: string } {
    if (!senha) return { label: '', color: 'transparent', width: '0%' };
    if (senha.length < 6) return { label: 'Muito fraca', color: '#E74C3C', width: '20%' };
    if (senha.length < 8) return { label: 'Fraca', color: '#E67E22', width: '40%' };
    const hasMixed = /[a-z]/.test(senha) && /[A-Z]/.test(senha);
    const hasNumbers = /\d/.test(senha);
    const hasSpecial = /[^a-zA-Z0-9]/.test(senha);
    if (hasMixed && hasNumbers && hasSpecial) return { label: 'Muito forte', color: '#27AE60', width: '100%' };
    if ((hasMixed && hasNumbers) || (hasMixed && hasSpecial)) return { label: 'Forte', color: '#2ECC71', width: '80%' };
    return { label: 'Média', color: '#F39C12', width: '60%' };
  }

  const topPad = Platform.OS === 'web' ? 32 : insets.top;
  const bottomPad = Platform.OS === 'web' ? 24 : insets.bottom;
  const strength = getSenhaStrength(novaSenha);

  const renderContent = () => {
    if (stage === 'verificando') {
      return (
        <View style={styles.centeredCard}>
          <AppLoader size="large" color={Colors.gold} style={{ marginBottom: 16 }} />
          <Text style={styles.centeredTitle}>A verificar o link...</Text>
          <Text style={styles.centeredDesc}>Aguarde enquanto validamos o seu pedido.</Text>
        </View>
      );
    }

    if (stage === 'invalido') {
      return (
        <View style={styles.centeredCard}>
          <View style={[styles.centeredIcon, { backgroundColor: 'rgba(231,76,60,0.1)', borderColor: 'rgba(231,76,60,0.3)' }]}>
            <Ionicons name="close-circle-outline" size={44} color="#E74C3C" />
          </View>
          <Text style={styles.centeredTitle}>Link Inválido ou Expirado</Text>
          <Text style={styles.centeredDesc}>
            Este link de redefinição de senha é inválido ou já expirou.{'\n'}Os links são válidos por apenas 1 hora.
          </Text>
          <TouchableOpacity
            style={styles.mainBtn}
            onPress={() => router.replace('/esqueceu-senha' as any)}
            activeOpacity={0.85}
          >
            <LinearGradient
              colors={['#1A5276', '#2980B9']}
              style={styles.mainBtnGrad}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            >
              <Ionicons name="refresh-outline" size={18} color="#fff" />
              <Text style={styles.mainBtnText}>Solicitar Novo Link</Text>
            </LinearGradient>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.replace('/login' as any)} style={styles.secondaryBtn}>
            <Text style={styles.secondaryBtnText}>Voltar ao Login</Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (stage === 'sucesso') {
      return (
        <View style={styles.centeredCard}>
          <View style={[styles.centeredIcon, { backgroundColor: 'rgba(39,174,96,0.1)', borderColor: 'rgba(39,174,96,0.3)' }]}>
            <Ionicons name="checkmark-circle-outline" size={44} color={Colors.success} />
          </View>
          <Text style={styles.centeredTitle}>Senha Redefinida!</Text>
          <Text style={styles.centeredDesc}>
            A sua senha foi alterada com sucesso. Pode agora iniciar sessão com a sua nova senha.
          </Text>
          <TouchableOpacity
            style={styles.mainBtn}
            onPress={() => router.replace('/login' as any)}
            activeOpacity={0.85}
          >
            <LinearGradient
              colors={['#1A5276', '#2980B9']}
              style={styles.mainBtnGrad}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            >
              <Ionicons name="log-in-outline" size={18} color="#fff" />
              <Text style={styles.mainBtnText}>Ir para o Login</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <View style={styles.card}>
        <View style={styles.cardTopAccent} />

        <View style={styles.headerRow}>
          <View style={styles.iconBadge}>
            <Ionicons name="lock-open-outline" size={18} color={Colors.gold} />
          </View>
          <View style={styles.headerTexts}>
            <Text style={styles.cardTitle}>Nova Senha</Text>
            <Text style={styles.cardSubtitle}>Criar nova senha de acesso</Text>
          </View>
        </View>

        {!!emailMascarado && (
          <View style={styles.emailInfo}>
            <Ionicons name="mail-outline" size={14} color={Colors.gold} />
            <Text style={styles.emailInfoText}>Conta: <Text style={{ color: Colors.gold }}>{emailMascarado}</Text></Text>
          </View>
        )}

        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Nova Senha</Text>
          <View style={[styles.inputBox, focusedField === 'nova' && styles.inputBoxFocused]}>
            <Ionicons
              name="lock-closed-outline"
              size={17}
              color={focusedField === 'nova' ? Colors.gold : Colors.textMuted}
              style={styles.inputIcon}
            />
            <TextInput
              style={styles.inputText}
              value={novaSenha}
              onChangeText={t => { setNovaSenha(t); setErro(''); }}
              placeholder="Mínimo 6 caracteres"
              placeholderTextColor={Colors.textMuted}
              secureTextEntry={!showNova}
              autoCapitalize="none"
              returnKeyType="next"
              onSubmitEditing={() => confirmarRef.current?.focus()}
              onFocus={() => setFocusedField('nova')}
              onBlur={() => setFocusedField(null)}
            />
            <TouchableOpacity onPress={() => setShowNova(v => !v)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name={showNova ? 'eye-off-outline' : 'eye-outline'} size={17} color={Colors.textMuted} />
            </TouchableOpacity>
          </View>

          {!!novaSenha && (
            <View style={styles.strengthWrap}>
              <View style={styles.strengthBar}>
                <View style={[styles.strengthFill, { width: strength.width as any, backgroundColor: strength.color }]} />
              </View>
              <Text style={[styles.strengthLabel, { color: strength.color }]}>{strength.label}</Text>
            </View>
          )}
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Confirmar Senha</Text>
          <View style={[styles.inputBox, focusedField === 'confirmar' && styles.inputBoxFocused]}>
            <Ionicons
              name="shield-checkmark-outline"
              size={17}
              color={focusedField === 'confirmar' ? Colors.gold : Colors.textMuted}
              style={styles.inputIcon}
            />
            <TextInput
              ref={confirmarRef}
              style={styles.inputText}
              value={confirmarSenha}
              onChangeText={t => { setConfirmarSenha(t); setErro(''); }}
              placeholder="Repita a nova senha"
              placeholderTextColor={Colors.textMuted}
              secureTextEntry={!showConfirmar}
              autoCapitalize="none"
              onFocus={() => setFocusedField('confirmar')}
              onBlur={() => setFocusedField(null)}
              onSubmitEditing={handleRedefinir}
              returnKeyType="done"
            />
            <TouchableOpacity onPress={() => setShowConfirmar(v => !v)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name={showConfirmar ? 'eye-off-outline' : 'eye-outline'} size={17} color={Colors.textMuted} />
            </TouchableOpacity>
          </View>

          {confirmarSenha.length > 0 && novaSenha !== confirmarSenha && (
            <View style={styles.erroRow}>
              <Ionicons name="close-circle-outline" size={14} color={Colors.danger} />
              <Text style={styles.erroText}>As senhas não coincidem.</Text>
            </View>
          )}
          {confirmarSenha.length > 0 && novaSenha === confirmarSenha && novaSenha.length >= 6 && (
            <View style={styles.okRow}>
              <Ionicons name="checkmark-circle-outline" size={14} color={Colors.success} />
              <Text style={styles.okText}>As senhas coincidem.</Text>
            </View>
          )}
        </View>

        {!!erro && (
          <View style={styles.erroCard}>
            <Ionicons name="alert-circle-outline" size={15} color={Colors.danger} />
            <Text style={styles.erroCardText}>{erro}</Text>
          </View>
        )}

        <TouchableOpacity
          style={[styles.sendBtn, isLoading && styles.sendBtnDisabled]}
          onPress={handleRedefinir}
          disabled={isLoading}
          activeOpacity={0.88}
        >
          <LinearGradient
            colors={isLoading ? ['#3a3a3a', '#2a2a2a'] : ['#1A5276', '#1F618D', '#2980B9']}
            style={styles.sendBtnGrad}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
          >
            {isLoading ? (
              <>
                <Ionicons name="ellipsis-horizontal" size={20} color={Colors.text} />
                <Text style={styles.sendBtnText}>A redefinir...</Text>
              </>
            ) : (
              <>
                <Ionicons name="checkmark-circle-outline" size={18} color="#fff" />
                <Text style={styles.sendBtnText}>Redefinir Senha</Text>
              </>
            )}
          </LinearGradient>
        </TouchableOpacity>

        <View style={styles.notaBox}>
          <Ionicons name="information-circle-outline" size={14} color={Colors.textMuted} />
          <Text style={styles.notaText}>
            Escolha uma senha segura com letras maiúsculas, minúsculas, números e símbolos.
          </Text>
        </View>
      </View>
    );
  };

  return (
    <ImageBackground
      source={require('../assets/login-bg.png')}
      style={styles.container}
      resizeMode="cover"
    >
      <LinearGradient
        colors={['rgba(6,16,41,0.93)', 'rgba(10,22,40,0.89)', 'rgba(15,31,64,0.86)']}
        style={StyleSheet.absoluteFill}
      />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingTop: topPad + 20, paddingBottom: bottomPad + 24 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {stage === 'formulario' && (
            <TouchableOpacity
              style={styles.backLink}
              onPress={() => router.replace('/login' as any)}
              activeOpacity={0.7}
            >
              <Ionicons name="chevron-back" size={20} color={Colors.textSecondary} />
              <Text style={styles.backLinkText}>Ir para o Login</Text>
            </TouchableOpacity>
          )}
          {renderContent()}
        </ScrollView>
      </KeyboardAvoidingView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: 20,
    maxWidth: 480,
    alignSelf: 'center',
    width: '100%',
    justifyContent: 'center',
  },

  backLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 20,
    alignSelf: 'flex-start',
  },
  backLinkText: {
    fontSize: 14,
    fontFamily: 'Inter_500Medium',
    color: Colors.textSecondary,
  },

  centeredCard: {
    backgroundColor: 'rgba(15,35,71,0.92)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
    padding: 32,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 10,
  },
  centeredIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  centeredTitle: {
    fontSize: 20,
    fontFamily: 'Inter_700Bold',
    color: Colors.text,
    marginBottom: 10,
    textAlign: 'center',
  },
  centeredDesc: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    color: Colors.textSecondary,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 24,
  },
  mainBtn: {
    width: '100%',
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 12,
  },
  mainBtnGrad: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
  },
  mainBtnText: {
    fontSize: 15,
    fontFamily: 'Inter_700Bold',
    color: '#fff',
  },
  secondaryBtn: {
    paddingVertical: 10,
  },
  secondaryBtnText: {
    fontSize: 13,
    fontFamily: 'Inter_500Medium',
    color: Colors.textMuted,
  },

  card: {
    backgroundColor: 'rgba(15,35,71,0.92)',
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 10,
  },
  cardTopAccent: {
    height: 3,
    backgroundColor: Colors.gold,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 4,
  },
  iconBadge: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: 'rgba(240,165,0,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(240,165,0,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTexts: { flex: 1 },
  cardTitle: {
    fontSize: 17,
    fontFamily: 'Inter_700Bold',
    color: Colors.text,
  },
  cardSubtitle: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    color: Colors.textMuted,
    marginTop: 2,
  },

  emailInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginHorizontal: 24,
    marginTop: 14,
    backgroundColor: 'rgba(240,165,0,0.06)',
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: 'rgba(240,165,0,0.15)',
  },
  emailInfoText: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    color: Colors.textSecondary,
  },

  inputGroup: {
    paddingHorizontal: 24,
    paddingTop: 18,
    gap: 6,
  },
  inputLabel: {
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  inputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 14,
    height: 48,
    gap: 10,
  },
  inputBoxFocused: {
    borderColor: Colors.gold,
    backgroundColor: 'rgba(240,165,0,0.06)',
  },
  inputIcon: { opacity: 0.85 },
  inputText: {
    flex: 1,
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    color: Colors.text,
  },

  strengthWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
  },
  strengthBar: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.1)',
    overflow: 'hidden',
  },
  strengthFill: {
    height: '100%',
    borderRadius: 2,
  },
  strengthLabel: {
    fontSize: 11,
    fontFamily: 'Inter_500Medium',
    minWidth: 60,
    textAlign: 'right',
  },

  erroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
  },
  erroText: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    color: Colors.danger,
  },
  okRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
  },
  okText: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    color: Colors.success,
  },

  erroCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginHorizontal: 24,
    marginTop: 14,
    backgroundColor: 'rgba(231,76,60,0.08)',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(231,76,60,0.2)',
  },
  erroCardText: {
    flex: 1,
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    color: '#E74C3C',
    lineHeight: 18,
  },

  sendBtn: {
    marginHorizontal: 24,
    marginTop: 20,
    borderRadius: 12,
    overflow: 'hidden',
  },
  sendBtnDisabled: { opacity: 0.65 },
  sendBtnGrad: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
  },
  sendBtnText: {
    fontSize: 15,
    fontFamily: 'Inter_700Bold',
    color: '#fff',
  },

  notaBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    margin: 20,
    marginTop: 14,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    padding: 12,
  },
  notaText: {
    flex: 1,
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    color: Colors.textMuted,
    lineHeight: 18,
  },
});
