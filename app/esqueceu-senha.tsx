import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  KeyboardAvoidingView, ScrollView, Platform, Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Colors } from '@/constants/colors';

type Passo = 'email' | 'otp' | 'nome' | 'senha' | 'sucesso';

export default function EsqueceuSenhaScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [passo, setPasso] = useState<Passo>('email');
  const [email, setEmail] = useState('');
  const [dica, setDica] = useState('');
  const [nome, setNome] = useState('');
  const [novaSenha, setNovaSenha] = useState('');
  const [confirmarSenha, setConfirmarSenha] = useState('');
  const [showNovaSenha, setShowNovaSenha] = useState(false);
  const [showConfirmar, setShowConfirmar] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [erro, setErro] = useState('');
  const [inscricoesAbertas, setInscricoesAbertas] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);

  const [maskedPhone, setMaskedPhone] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [otpError, setOtpError] = useState('');
  const [otpLoading, setOtpLoading] = useState(false);
  const [otpResendSecs, setOtpResendSecs] = useState(60);
  const [recoveryToken, setRecoveryToken] = useState('');
  const otpResendRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const otpInputRef = useRef<any>(null);

  const progressAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    fetch('/api/public/inscricoes-status')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data?.abertas) return;
        const parsePT = (s: string | null) => {
          if (!s) return null;
          const [d, m, y] = s.split('/').map(Number);
          return d && m && y ? new Date(y, m - 1, d) : null;
        };
        const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
        const fim = parsePT(data.dataFim ?? null);
        const ini = parsePT(data.dataInicio ?? null);
        if (fim && hoje > fim) return;
        if (ini && hoje < ini) return;
        setInscricoesAbertas(true);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const stepIndex: Record<Passo, number> = { email: 0, otp: 1, nome: 1, senha: 2, sucesso: 3 };
    Animated.spring(progressAnim, { toValue: stepIndex[passo], useNativeDriver: false, tension: 60, friction: 10 }).start();
  }, [passo]);

  function startResendCooldown(secs = 60) {
    if (otpResendRef.current) clearInterval(otpResendRef.current);
    setOtpResendSecs(secs);
    otpResendRef.current = setInterval(() => {
      setOtpResendSecs(prev => {
        if (prev <= 1) { clearInterval(otpResendRef.current!); return 0; }
        return prev - 1;
      });
    }, 1000);
  }

  async function handleVerificarEmail() {
    setErro('');
    const trimmed = email.trim();
    if (!trimmed) { setErro('Por favor, introduza o seu email.'); return; }
    if (!trimmed.includes('@')) { setErro('Introduza um email válido.'); return; }
    setIsLoading(true);
    try {
      if (Platform.OS !== 'web') await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const res = await fetch('/api/auth/otp/recuperacao/enviar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: trimmed.toLowerCase() }),
      });
      const data = await res.json();
      if (!res.ok) { setErro(data.error ?? 'Erro ao verificar email.'); return; }

      if (data.semConta) {
        setErro('Email não encontrado no sistema. Verifique se está correcto.');
        return;
      }
      if (data.semTelefone) {
        setDica(data.dica ?? '');
        setPasso('nome');
        return;
      }
      if (data.enviado) {
        setMaskedPhone(data.email ?? data.phone ?? '');
        setOtpCode('');
        setOtpError('');
        startResendCooldown(60);
        setPasso('otp');
        setTimeout(() => otpInputRef.current?.focus(), 400);
        return;
      }
      setErro(data.error ?? 'Erro inesperado. Tente novamente.');
    } catch {
      setErro('Não foi possível contactar o servidor. Verifique a sua ligação.');
    } finally {
      setIsLoading(false);
    }
  }

  async function handleReenviarOtp() {
    setOtpCode('');
    setOtpError('');
    setIsLoading(true);
    try {
      await fetch('/api/auth/otp/recuperacao/enviar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      startResendCooldown(60);
      setTimeout(() => otpInputRef.current?.focus(), 200);
    } catch {}
    finally { setIsLoading(false); }
  }

  async function handleVerificarOtp(codeOverride?: string) {
    const code = codeOverride ?? otpCode;
    if (code.length !== 6 || otpLoading) return;
    setOtpLoading(true);
    setOtpError('');
    try {
      if (Platform.OS !== 'web') await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const res = await fetch('/api/auth/otp/recuperacao/verificar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase(), codigo: code }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (Platform.OS !== 'web') await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
        setOtpError(data.error ?? 'Código inválido. Tente novamente.');
        setOtpCode('');
        setTimeout(() => otpInputRef.current?.focus(), 150);
        return;
      }
      if (Platform.OS !== 'web') await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setRecoveryToken(data.recoveryToken);
      setPasso('senha');
    } catch {
      setOtpError('Não foi possível contactar o servidor. Verifique a sua ligação.');
    } finally {
      setOtpLoading(false);
    }
  }

  async function handleVerificarNome() {
    setErro('');
    if (!nome.trim()) { setErro('Introduza o seu nome completo.'); return; }
    setPasso('senha');
  }

  async function handleRedefinirSenha() {
    setErro('');
    if (!novaSenha.trim()) { setErro('Introduza a nova senha.'); return; }
    if (novaSenha.length < 6) { setErro('A senha deve ter pelo menos 6 caracteres.'); return; }
    if (novaSenha !== confirmarSenha) { setErro('As senhas não coincidem.'); return; }
    setIsLoading(true);
    try {
      if (Platform.OS !== 'web') await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      let res: Response;
      if (recoveryToken) {
        res = await fetch('/api/auth/otp/recuperacao/nova-senha', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ recoveryToken, novaSenha: novaSenha.trim() }),
        });
      } else {
        res = await fetch('/api/public/reset-senha-direto', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: email.trim().toLowerCase(),
            nomeVerificacao: nome.trim(),
            novaSenha: novaSenha.trim(),
          }),
        });
      }

      const data = await res.json();
      if (!res.ok) { setErro(data.error ?? 'Erro ao redefinir senha.'); return; }
      if (Platform.OS !== 'web') await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setPasso('sucesso');
    } catch {
      setErro('Não foi possível contactar o servidor. Verifique a sua ligação.');
    } finally {
      setIsLoading(false);
    }
  }

  const topPad = Platform.OS === 'web' ? 32 : insets.top;
  const bottomPad = Platform.OS === 'web' ? 24 : insets.bottom;

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

  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1, 2, 3],
    outputRange: ['10%', '40%', '75%', '100%'],
  });

  const stepNum = passo === 'email' ? 1 : (passo === 'otp' || passo === 'nome') ? 2 : passo === 'senha' ? 3 : 3;

  function StepDot({ n, atual }: { n: number; atual: number }) {
    const done = atual >= n;
    return (
      <View style={[
        stepDot,
        done && { backgroundColor: Colors.gold, borderColor: Colors.gold }
      ]}>
        {done && atual > n
          ? <Ionicons name="checkmark" size={10} color="#000" />
          : <Text style={{ fontSize: 10, fontFamily: 'Inter_700Bold', color: done ? '#000' : Colors.textMuted }}>{n}</Text>
        }
      </View>
    );
  }

  const stepDot: object = {
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center', justifyContent: 'center',
  };

  const loginBg = (
    <>
      <LinearGradient
        colors={['#0D1A3E', '#0A1432', '#0D1A3E']}
        style={StyleSheet.absoluteFill}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      />
      <View style={[StyleSheet.absoluteFill, { pointerEvents: 'none' } as any]}>
        <View style={styles.circle1} />
        <View style={styles.circle2} />
        <View style={styles.circle3} />
        <View style={styles.strip1} />
        <View style={styles.strip2} />
      </View>
    </>
  );

  if (passo === 'sucesso') {
    return (
      <View style={[styles.container, { backgroundColor: '#0A1432' }]}>
        {loginBg}
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <ScrollView contentContainerStyle={[styles.scroll, { paddingTop: topPad + 40, paddingBottom: bottomPad + 24 }]} keyboardShouldPersistTaps="handled">
            <View style={styles.successCard}>
              <View style={styles.successIconCircle}>
                <Ionicons name="checkmark-circle-outline" size={52} color={Colors.success} />
              </View>
              <Text style={styles.successTitle}>Senha Alterada!</Text>
              <Text style={styles.successDesc}>
                A sua senha foi redefinida com sucesso.{'\n'}Já pode iniciar sessão com a nova senha.
              </Text>
              <TouchableOpacity style={styles.backBtn} onPress={() => router.replace('/login' as any)} activeOpacity={0.85}>
                <LinearGradient colors={['#1A5276', '#2980B9']} style={styles.backBtnGrad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                  <Ionicons name="log-in-outline" size={18} color="#fff" />
                  <Text style={styles.backBtnText}>Entrar no Sistema</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: '#0A1432' }]}>
      {loginBg}

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingTop: topPad + 20, paddingBottom: bottomPad + 24 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <TouchableOpacity
            style={styles.backLink}
            onPress={() => {
              setErro(''); setOtpError('');
              if (passo === 'email') { router.replace('/login' as any); }
              else if (passo === 'otp') { setPasso('email'); setOtpCode(''); }
              else if (passo === 'nome') { setPasso('email'); }
              else if (passo === 'senha') { setPasso(recoveryToken ? 'otp' : 'nome'); }
            }}
            activeOpacity={0.7}
          >
            <Ionicons name="chevron-back" size={20} color={Colors.textSecondary} />
            <Text style={styles.backLinkText}>{passo === 'email' ? 'Voltar ao Login' : 'Passo anterior'}</Text>
          </TouchableOpacity>

          <View style={styles.card}>
            <View style={styles.cardTopAccent} />

            {/* Cabeçalho */}
            <View style={styles.headerRow}>
              <View style={styles.iconBadge}>
                {passo === 'otp'
                  ? <Ionicons name="shield-checkmark-outline" size={18} color={Colors.gold} />
                  : <Ionicons name="key-outline" size={18} color={Colors.gold} />
                }
              </View>
              <View style={styles.headerTexts}>
                <Text style={styles.cardTitle}>Recuperar Acesso</Text>
                <Text style={styles.cardSubtitle}>
                  {passo === 'email' ? 'Passo 1 de 3 — Verificar email'
                    : passo === 'otp'  ? 'Passo 2 de 3 — Código de verificação'
                    : passo === 'nome' ? 'Passo 2 de 3 — Confirmar identidade'
                    : 'Passo 3 de 3 — Nova senha'}
                </Text>
              </View>
            </View>

            {/* Indicador de progresso */}
            <View style={styles.progressTrack}>
              <Animated.View style={[styles.progressBar, { width: progressWidth }]} />
            </View>
            <View style={styles.stepsRow}>
              <StepDot n={1} atual={stepNum} />
              <View style={styles.stepLine} />
              <StepDot n={2} atual={stepNum} />
              <View style={styles.stepLine} />
              <StepDot n={3} atual={stepNum} />
            </View>

            {/* ——— PASSO 1: EMAIL ——— */}
            {passo === 'email' && (
              <View>
                <Text style={styles.instrucoes}>
                  Introduza o email associado à sua conta. Receberá um código de verificação de 6 dígitos nesse email.
                </Text>
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Email da Conta</Text>
                  <View style={[styles.inputBox, focusedField === 'email' && styles.inputBoxFocused]}>
                    <Ionicons name="mail-outline" size={17} color={focusedField === 'email' ? Colors.gold : Colors.textMuted} style={styles.inputIcon} />
                    <TextInput
                      style={styles.inputText}
                      value={email}
                      onChangeText={t => { setEmail(t); setErro(''); }}
                      placeholder="o-seu-email@escola.ao"
                      placeholderTextColor={Colors.textMuted}
                      keyboardType="email-address"
                      autoCapitalize="none"
                      autoCorrect={false}
                      onFocus={() => setFocusedField('email')}
                      onBlur={() => setFocusedField(null)}
                      onSubmitEditing={handleVerificarEmail}
                      returnKeyType="next"
                    />
                  </View>
                  {!!erro && <View style={styles.erroRow}><Ionicons name="alert-circle-outline" size={14} color={Colors.danger} /><Text style={styles.erroText}>{erro}</Text></View>}
                </View>
                <TouchableOpacity style={[styles.sendBtn, isLoading && styles.sendBtnDisabled]} onPress={handleVerificarEmail} disabled={isLoading} activeOpacity={0.88}>
                  <LinearGradient colors={isLoading ? ['#3a3a3a', '#2a2a2a'] : ['#1A5276', '#1F618D', '#2980B9']} style={styles.sendBtnGrad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                    {isLoading
                      ? <><Ionicons name="ellipsis-horizontal" size={20} color={Colors.text} /><Text style={styles.sendBtnText}>A verificar...</Text></>
                      : <><Ionicons name="arrow-forward-circle-outline" size={18} color="#fff" /><Text style={styles.sendBtnText}>Continuar</Text></>
                    }
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            )}

            {/* ——— PASSO 2a: OTP (utilizador com telefone) ——— */}
            {passo === 'otp' && (
              <View>
                <Text style={styles.instrucoes}>
                  Enviámos um código de 6 dígitos para o email{' '}
                  <Text style={{ color: Colors.gold, fontFamily: 'Inter_600SemiBold' }}>{maskedPhone}</Text>.
                  {'\n'}Verifique a sua caixa de entrada e introduza o código abaixo.
                </Text>

                {/* Caixas de dígitos */}
                <TouchableOpacity activeOpacity={1} onPress={() => otpInputRef.current?.focus()} style={{ paddingVertical: 16 }}>
                  <View style={{ flexDirection: 'row', gap: 8, justifyContent: 'center' }}>
                    {[0, 1, 2, 3, 4, 5].map(i => {
                      const filled = !!otpCode[i];
                      const active = otpCode.length === i;
                      return (
                        <View key={i} style={{
                          width: 44, height: 56, borderRadius: 12,
                          borderWidth: 2,
                          borderColor: active ? Colors.gold : filled ? 'rgba(212,175,55,0.45)' : 'rgba(255,255,255,0.13)',
                          backgroundColor: active ? 'rgba(212,175,55,0.07)' : filled ? 'rgba(212,175,55,0.05)' : 'rgba(255,255,255,0.03)',
                          alignItems: 'center', justifyContent: 'center',
                        }}>
                          {filled
                            ? <Text style={{ color: '#fff', fontSize: 20, fontFamily: 'Inter_700Bold' }}>{otpCode[i]}</Text>
                            : active
                              ? <View style={{ width: 2, height: 20, backgroundColor: Colors.gold, borderRadius: 1 }} />
                              : null
                          }
                        </View>
                      );
                    })}
                  </View>
                </TouchableOpacity>

                <TextInput
                  ref={otpInputRef}
                  value={otpCode}
                  onChangeText={v => {
                    const clean = v.replace(/\D/g, '').slice(0, 6);
                    setOtpCode(clean);
                    setOtpError('');
                    if (clean.length === 6) handleVerificarOtp(clean);
                  }}
                  keyboardType="number-pad"
                  maxLength={6}
                  autoFocus
                  style={{ position: 'absolute', opacity: 0, width: 1, height: 1 }}
                />

                {!!otpError && (
                  <View style={[styles.erroRow, { justifyContent: 'center', marginHorizontal: 24, marginBottom: 4 }]}>
                    <Ionicons name="alert-circle-outline" size={14} color={Colors.danger} />
                    <Text style={[styles.erroText, { textAlign: 'center' }]}>{otpError}</Text>
                  </View>
                )}

                <TouchableOpacity
                  style={[styles.sendBtn, (otpLoading || otpCode.length !== 6) && styles.sendBtnDisabled]}
                  onPress={() => handleVerificarOtp()}
                  disabled={otpLoading || otpCode.length !== 6}
                  activeOpacity={0.88}
                >
                  <LinearGradient colors={otpLoading ? ['#3a3a3a', '#2a2a2a'] : ['#1A5276', '#1F618D', '#2980B9']} style={styles.sendBtnGrad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                    {otpLoading
                      ? <><Ionicons name="ellipsis-horizontal" size={20} color={Colors.text} /><Text style={styles.sendBtnText}>A verificar...</Text></>
                      : <><Ionicons name="shield-checkmark-outline" size={18} color="#fff" /><Text style={styles.sendBtnText}>Verificar Código</Text></>
                    }
                  </LinearGradient>
                </TouchableOpacity>

                <View style={{ alignItems: 'center', marginTop: 16, gap: 8 }}>
                  {otpResendSecs > 0 ? (
                    <Text style={{ color: Colors.textMuted, fontSize: 13, fontFamily: 'Inter_400Regular' }}>
                      Reenviar em <Text style={{ color: Colors.gold, fontFamily: 'Inter_600SemiBold' }}>{otpResendSecs}s</Text>
                    </Text>
                  ) : (
                    <TouchableOpacity onPress={handleReenviarOtp} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                      <Text style={{ color: Colors.gold, fontSize: 13, fontFamily: 'Inter_600SemiBold' }}>📧 Reenviar código por email</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            )}

            {/* ——— PASSO 2b: NOME (fallback sem telefone) ——— */}
            {passo === 'nome' && (
              <View>
                <Text style={styles.instrucoes}>
                  {dica
                    ? `Olá, ${dica}! Para confirmar a sua identidade, introduza o seu nome completo tal como está registado no sistema.`
                    : 'Para confirmar a sua identidade, introduza o seu nome completo tal como está registado no sistema.'}
                </Text>
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Nome Completo</Text>
                  <View style={[styles.inputBox, focusedField === 'nome' && styles.inputBoxFocused]}>
                    <Ionicons name="person-outline" size={17} color={focusedField === 'nome' ? Colors.gold : Colors.textMuted} style={styles.inputIcon} />
                    <TextInput
                      style={styles.inputText}
                      value={nome}
                      onChangeText={t => { setNome(t); setErro(''); }}
                      placeholder="O seu nome completo"
                      placeholderTextColor={Colors.textMuted}
                      autoCapitalize="words"
                      onFocus={() => setFocusedField('nome')}
                      onBlur={() => setFocusedField(null)}
                      onSubmitEditing={handleVerificarNome}
                      returnKeyType="next"
                    />
                  </View>
                  {!!erro && <View style={styles.erroRow}><Ionicons name="alert-circle-outline" size={14} color={Colors.danger} /><Text style={styles.erroText}>{erro}</Text></View>}
                </View>
                <TouchableOpacity style={styles.sendBtn} onPress={handleVerificarNome} activeOpacity={0.88}>
                  <LinearGradient colors={['#1A5276', '#1F618D', '#2980B9']} style={styles.sendBtnGrad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                    <Ionicons name="arrow-forward-circle-outline" size={18} color="#fff" />
                    <Text style={styles.sendBtnText}>Continuar</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            )}

            {/* ——— PASSO 3: NOVA SENHA ——— */}
            {passo === 'senha' && (
              <View>
                <Text style={styles.instrucoes}>
                  Escolha uma senha segura com letras maiúsculas, minúsculas, números e símbolos. Mínimo de 6 caracteres.
                </Text>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Nova Senha</Text>
                  <View style={[styles.inputBox, focusedField === 'nova' && styles.inputBoxFocused]}>
                    <Ionicons name="lock-closed-outline" size={17} color={focusedField === 'nova' ? Colors.gold : Colors.textMuted} style={styles.inputIcon} />
                    <TextInput
                      style={styles.inputText}
                      value={novaSenha}
                      onChangeText={t => { setNovaSenha(t); setErro(''); }}
                      placeholder="Mínimo 6 caracteres"
                      placeholderTextColor={Colors.textMuted}
                      secureTextEntry={!showNovaSenha}
                      autoCapitalize="none"
                      onFocus={() => setFocusedField('nova')}
                      onBlur={() => setFocusedField(null)}
                      returnKeyType="next"
                    />
                    <TouchableOpacity onPress={() => setShowNovaSenha(v => !v)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Ionicons name={showNovaSenha ? 'eye-off-outline' : 'eye-outline'} size={18} color={Colors.textMuted} />
                    </TouchableOpacity>
                  </View>

                  {/* Indicador de força da senha */}
                  {!!novaSenha && (() => {
                    const s = getSenhaStrength(novaSenha);
                    return (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 }}>
                        <View style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.1)', overflow: 'hidden' }}>
                          <View style={{ height: '100%', borderRadius: 2, width: s.width as any, backgroundColor: s.color }} />
                        </View>
                        <Text style={{ fontSize: 11, fontFamily: 'Inter_500Medium', color: s.color, minWidth: 68, textAlign: 'right' }}>{s.label}</Text>
                      </View>
                    );
                  })()}
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Confirmar Nova Senha</Text>
                  <View style={[styles.inputBox, focusedField === 'confirmar' && styles.inputBoxFocused]}>
                    <Ionicons name="shield-checkmark-outline" size={17} color={focusedField === 'confirmar' ? Colors.gold : Colors.textMuted} style={styles.inputIcon} />
                    <TextInput
                      style={styles.inputText}
                      value={confirmarSenha}
                      onChangeText={t => { setConfirmarSenha(t); setErro(''); }}
                      placeholder="Repita a nova senha"
                      placeholderTextColor={Colors.textMuted}
                      secureTextEntry={!showConfirmar}
                      autoCapitalize="none"
                      onFocus={() => setFocusedField('confirmar')}
                      onBlur={() => setFocusedField(null)}
                      onSubmitEditing={handleRedefinirSenha}
                      returnKeyType="done"
                    />
                    <TouchableOpacity onPress={() => setShowConfirmar(v => !v)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Ionicons name={showConfirmar ? 'eye-off-outline' : 'eye-outline'} size={18} color={Colors.textMuted} />
                    </TouchableOpacity>
                  </View>

                  {/* Confirmação de match */}
                  {confirmarSenha.length > 0 && novaSenha !== confirmarSenha && (
                    <View style={[styles.erroRow, { marginTop: 6 }]}>
                      <Ionicons name="close-circle-outline" size={14} color={Colors.danger} />
                      <Text style={styles.erroText}>As senhas não coincidem.</Text>
                    </View>
                  )}
                  {confirmarSenha.length > 0 && novaSenha === confirmarSenha && novaSenha.length >= 6 && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 }}>
                      <Ionicons name="checkmark-circle-outline" size={14} color="#2ECC71" />
                      <Text style={{ fontSize: 12, fontFamily: 'Inter_400Regular', color: '#2ECC71' }}>As senhas coincidem.</Text>
                    </View>
                  )}

                  {!!erro && <View style={[styles.erroRow, { marginTop: 6 }]}><Ionicons name="alert-circle-outline" size={14} color={Colors.danger} /><Text style={styles.erroText}>{erro}</Text></View>}
                </View>

                <TouchableOpacity style={[styles.sendBtn, isLoading && styles.sendBtnDisabled]} onPress={handleRedefinirSenha} disabled={isLoading} activeOpacity={0.88}>
                  <LinearGradient colors={isLoading ? ['#3a3a3a', '#2a2a2a'] : ['#1A5276', '#1F618D', '#2980B9']} style={styles.sendBtnGrad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                    {isLoading
                      ? <><Ionicons name="ellipsis-horizontal" size={20} color={Colors.text} /><Text style={styles.sendBtnText}>A guardar...</Text></>
                      : <><Ionicons name="checkmark-circle-outline" size={18} color="#fff" /><Text style={styles.sendBtnText}>Guardar Nova Senha</Text></>
                    }
                  </LinearGradient>
                </TouchableOpacity>

                <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginHorizontal: 0, marginTop: 12, backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)', padding: 12 }}>
                  <Ionicons name="information-circle-outline" size={14} color={Colors.textMuted} style={{ marginTop: 1 }} />
                  <Text style={{ flex: 1, fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textMuted, lineHeight: 18 }}>
                    Dica: use letras maiúsculas (A-Z), minúsculas (a-z), números (0-9) e símbolos (!@#) para uma senha muito forte.
                  </Text>
                </View>
              </View>
            )}

            <View style={{ height: 16 }} />
          </View>

          {inscricoesAbertas && (
            <View style={styles.footer}>
              <Text style={styles.footerText}>
                Ainda não é nosso estudante?{' '}
                <Text style={styles.footerLink} onPress={() => router.push('/registro' as any)}>
                  Solicitar matrícula
                </Text>
              </Text>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
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

  progressTrack: {
    marginHorizontal: 24,
    marginTop: 18,
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    backgroundColor: Colors.gold,
    borderRadius: 2,
  },
  stepsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    marginTop: 8,
    marginBottom: 4,
  },
  stepLine: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },

  instrucoes: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    color: Colors.textSecondary,
    lineHeight: 20,
    paddingHorizontal: 24,
    paddingTop: 14,
    paddingBottom: 4,
  },

  inputGroup: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 4,
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
    flex: 1,
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

  footer: {
    marginTop: 24,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    color: Colors.textMuted,
  },
  footerLink: {
    color: Colors.gold,
    fontFamily: 'Inter_600SemiBold',
  },

  successCard: {
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
  successIconCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: 'rgba(39,174,96,0.12)',
    borderWidth: 2,
    borderColor: 'rgba(39,174,96,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  successTitle: {
    fontSize: 22,
    fontFamily: 'Inter_700Bold',
    color: Colors.text,
    marginBottom: 12,
    textAlign: 'center',
  },
  successDesc: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    color: Colors.textSecondary,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 28,
  },
  backBtn: {
    width: '100%',
    borderRadius: 12,
    overflow: 'hidden',
  },
  backBtnGrad: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
  },
  backBtnText: {
    fontSize: 15,
    fontFamily: 'Inter_700Bold',
    color: '#fff',
  },

  circle1: {
    position: 'absolute', width: 380, height: 380,
    borderRadius: 190, top: -120, right: -100,
    backgroundColor: 'rgba(42,100,160,0.22)',
  },
  circle2: {
    position: 'absolute', width: 220, height: 220,
    borderRadius: 110, bottom: 60, left: -80,
    backgroundColor: 'rgba(160,60,80,0.10)',
  },
  circle3: {
    position: 'absolute', width: 140, height: 140,
    borderRadius: 70, top: '40%', right: '8%',
    backgroundColor: 'rgba(42,100,160,0.08)',
  },
  strip1: {
    position: 'absolute', width: 2, height: 300,
    top: '15%', left: '12%',
    backgroundColor: 'rgba(255,255,255,0.03)',
    transform: [{ rotate: '15deg' }],
  },
  strip2: {
    position: 'absolute', width: 1, height: 220,
    top: '30%', right: '18%',
    backgroundColor: 'rgba(255,255,255,0.025)',
    transform: [{ rotate: '-10deg' }],
  },
});
