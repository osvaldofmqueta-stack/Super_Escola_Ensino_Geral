import React, { useState, useRef } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Platform, KeyboardAvoidingView, ScrollView } from 'react-native';
import AppLoader from '@/components/AppLoader';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors } from '@/constants/colors';
import { getApiUrl } from '@/lib/query-client';

export const PROVISORIO_KEY = '@siga_provisorio';

export default function LoginProvisorioScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [showSenha, setShowSenha] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [focusedField, setFocusedField] = useState<'email' | 'senha' | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const senhaRef = useRef<any>(null);

  function showError(msg: string) {
    setErrorMsg(msg);
    setTimeout(() => setErrorMsg(''), 6000);
  }

  async function handleLogin() {
    if (!email.trim() || !senha.trim()) {
      showError('Introduza o email e a senha provisória.');
      return;
    }
    setIsLoading(true);
    setErrorMsg('');
    try {
      const res = await fetch(new URL('/api/login-provisorio', getApiUrl()).toString(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase(), senha: senha.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        showError(data.error || 'Credenciais inválidas.');
        return;
      }
      await AsyncStorage.setItem(PROVISORIO_KEY, JSON.stringify(data));
      router.replace('/portal-provisorio' as any);
    } catch {
      showError('Não foi possível ligar ao servidor. Tente novamente.');
    } finally {
      setIsLoading(false);
    }
  }

  const topPad = Platform.OS === 'web' ? 56 : insets.top;
  const bottomPad = Platform.OS === 'web' ? 24 : insets.bottom;

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#061029', '#0A1628', '#0D1F35']} style={StyleSheet.absoluteFill} />

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingTop: topPad + 16, paddingBottom: bottomPad + 24 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.pwaWrap}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.replace('/login' as any)} activeOpacity={0.75}>
            <Ionicons name="arrow-back" size={18} color={Colors.text} />
          </TouchableOpacity>

          <View style={styles.headerSection}>
            <View style={styles.iconCircle}>
              <Ionicons name="person-circle-outline" size={40} color={Colors.gold} />
            </View>
            <Text style={styles.title}>Conta Provisória</Text>
            <Text style={styles.subtitle}>
              Acompanhe o seu processo de admissão com as credenciais recebidas na inscrição.
            </Text>
          </View>

          <View style={styles.card}>
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>EMAIL</Text>
              <View style={[styles.inputWrap, focusedField === 'email' && styles.inputWrapFocused]}>
                <Ionicons name="mail-outline" size={17} color={focusedField === 'email' ? Colors.gold : Colors.textMuted} />
                <TextInput
                  style={styles.input}
                  value={email}
                  onChangeText={v => setEmail(v.replace(/\s/g, ''))}
                  placeholder="email@exemplo.ao"
                  placeholderTextColor={Colors.textMuted}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="next"
                  onSubmitEditing={() => senhaRef.current?.focus()}
                  onFocus={() => setFocusedField('email')}
                  onBlur={() => setFocusedField(null)}
                />
              </View>
            </View>

            <View style={styles.field}>
              <Text style={styles.fieldLabel}>SENHA PROVISÓRIA</Text>
              <View style={[styles.inputWrap, focusedField === 'senha' && styles.inputWrapFocused]}>
                <Ionicons name="lock-closed-outline" size={17} color={focusedField === 'senha' ? Colors.gold : Colors.textMuted} />
                <TextInput
                  ref={senhaRef}
                  style={[styles.input, { flex: 1 }]}
                  value={senha}
                  onChangeText={v => setSenha(v.replace(/\s/g, ''))}
                  placeholder="Ex: Silva0102"
                  placeholderTextColor={Colors.textMuted}
                  secureTextEntry={!showSenha}
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="go"
                  onSubmitEditing={handleLogin}
                  onFocus={() => setFocusedField('senha')}
                  onBlur={() => setFocusedField(null)}
                />
                <TouchableOpacity onPress={() => setShowSenha(v => !v)}>
                  <Ionicons name={showSenha ? 'eye-off-outline' : 'eye-outline'} size={18} color={Colors.textMuted} />
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.senhaHint}>
              <Ionicons name="information-circle-outline" size={14} color={Colors.textMuted} />
              <Text style={styles.senhaHintText}>
                A senha provisória é: <Text style={{ color: Colors.text }}>Apelido + Ano de nascimento invertido</Text>{'\n'}
                Ex: Apelido "Silva", nascido em 2010 → <Text style={{ color: Colors.gold }}>Silva0102</Text>
              </Text>
            </View>

            {!!errorMsg && (
              <View style={styles.errorBanner}>
                <Ionicons name="alert-circle-outline" size={15} color="#fff" />
                <Text style={styles.errorBannerText}>{errorMsg}</Text>
              </View>
            )}

            <TouchableOpacity
              style={[styles.loginBtn, isLoading && { opacity: 0.7 }]}
              onPress={handleLogin}
              disabled={isLoading}
              activeOpacity={0.85}
            >
              <LinearGradient colors={['#1A5276', '#2980B9']} style={styles.loginBtnGrad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                {isLoading
                  ? <AppLoader color="#fff" size="small" />
                  : <>
                      <Text style={styles.loginBtnText}>Entrar na Conta Provisória</Text>
                      <Ionicons name="arrow-forward" size={17} color="#fff" />
                    </>
                }
              </LinearGradient>
            </TouchableOpacity>
          </View>

          <View style={styles.footer}>
            <Text style={styles.footerText}>Ainda não tem uma inscrição?</Text>
            <TouchableOpacity onPress={() => router.push('/registro' as any)}>
              <Text style={styles.footerLink}>Fazer inscrição agora</Text>
            </TouchableOpacity>
          </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  scroll: { flexGrow: 1, alignItems: 'center' },
  pwaWrap: { width: '100%', maxWidth: 480, paddingHorizontal: 20, gap: 24, alignSelf: 'center' },
  backBtn: { width: 38, height: 38, borderRadius: 11, backgroundColor: 'rgba(255,255,255,0.07)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', alignSelf: 'flex-start' },
  headerSection: { alignItems: 'center', gap: 12, paddingVertical: 8 },
  iconCircle: { width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(240,165,0,0.1)', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'rgba(240,165,0,0.25)' },
  title: { fontSize: 24, fontFamily: 'Inter_700Bold', color: Colors.text, textAlign: 'center' },
  subtitle: { fontSize: 13, fontFamily: 'Inter_400Regular', color: Colors.textSecondary, textAlign: 'center', lineHeight: 20 },
  card: { backgroundColor: Colors.backgroundCard, borderRadius: 20, borderWidth: 1, borderColor: Colors.border, padding: 24, gap: 18 },
  field: { gap: 8 },
  fieldLabel: { fontSize: 10, fontFamily: 'Inter_600SemiBold', color: 'rgba(255,255,255,0.4)', letterSpacing: 1, textTransform: 'uppercase' },
  inputWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 12, borderWidth: 1.5, borderColor: Colors.border, paddingHorizontal: 14, height: 52, gap: 10 },
  inputWrapFocused: { borderColor: Colors.gold, backgroundColor: 'rgba(240,165,0,0.04)' },
  input: { flex: 1, fontSize: 15, fontFamily: 'Inter_400Regular', color: Colors.text },
  senhaHint: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: 12 },
  senhaHintText: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted, flex: 1, lineHeight: 18 },
  errorBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#C0392B', borderRadius: 10, padding: 12 },
  errorBannerText: { flex: 1, fontSize: 13, fontFamily: 'Inter_500Medium', color: '#fff' },
  loginBtn: { borderRadius: 13, overflow: 'hidden' },
  loginBtnGrad: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 16, gap: 8 },
  loginBtnText: { fontSize: 15, fontFamily: 'Inter_700Bold', color: '#fff' },
  footer: { alignItems: 'center', gap: 6, paddingVertical: 8 },
  footerText: { fontSize: 13, fontFamily: 'Inter_400Regular', color: Colors.textMuted },
  footerLink: { fontSize: 13, fontFamily: 'Inter_700Bold', color: Colors.gold },
});
