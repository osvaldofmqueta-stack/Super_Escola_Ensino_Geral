import React, { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  Switch, Platform, StyleSheet, ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import TopBar from '@/components/TopBar';
import { Colors } from '@/constants/colors';
import { useConfig } from '@/context/ConfigContext';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';
import { alertSucesso, alertErro } from '@/utils/toast';
import { webAlert } from '@/utils/webAlert';

const GREEN = '#10B981';
const STEPS = [
  { id: 1, label: 'Apresentação',  icon: 'information-circle-outline' },
  { id: 2, label: 'Banco',         icon: 'business-outline' },
  { id: 3, label: 'Credenciais',   icon: 'key-outline' },
  { id: 4, label: 'Teste',         icon: 'wifi-outline' },
  { id: 5, label: 'Activar',       icon: 'checkmark-circle-outline' },
];

const BANCOS = [
  { code: 'BFA', label: 'BFA — Banco de Fomento Angola' },
  { code: 'BAI', label: 'BAI — Banco Angolano de Investimentos' },
  { code: 'BPC', label: 'BPC — Banco de Poupança e Crédito' },
  { code: 'BIC', label: 'BIC — Banco de Investimento e Comércio' },
  { code: 'ATL', label: 'Atlântico — Banco Millennium Atlântico' },
  { code: 'EMIS', label: 'EMIS — via rede interbancária' },
  { code: 'BCI', label: 'BCI — Banco de Crédito e Investimento' },
  { code: 'BDA', label: 'BDA — Banco de Desenvolvimento de Angola' },
  { code: 'SOL', label: 'Sol Crédito' },
  { code: 'UBA', label: 'UBA — United Bank for Africa' },
  { code: 'STD', label: 'Standard Bank Angola' },
  { code: 'FNB', label: 'Finibanco Angola' },
  { code: 'Outro', label: 'Outro banco...' },
];

export default function EmisConfiguracaoScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { config, updateConfig } = useConfig();

  const [step, setStep] = useState(1);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ sucesso: boolean; mensagem: string } | null>(null);
  const [customBancoCode, setCustomBancoCode] = useState(config.emisProvedorCustomCode || '');
  const [customBancoNome, setCustomBancoNome] = useState(
    !BANCOS.slice(0, -1).some(b => b.code === config.emisProvedor) ? (config.bancoTransferencia || '') : ''
  );
  const [showApiKey, setShowApiKey] = useState(false);

  const isCeo = user?.role === 'ceo';
  const ambiente = (config.emisAmbiente as string) || 'sandbox';
  const webhookUrl = Platform.OS === 'web' && typeof window !== 'undefined'
    ? `${window.location.origin}/api/emis/webhook`
    : '[https://SEU-DOMINIO.replit.app]/api/emis/webhook';

  function goNext() { if (step < STEPS.length) setStep(s => s + 1); }
  function goBack() { if (step > 1) setStep(s => s - 1); }

  async function testarLigacao() {
    if (!config.numeroEntidade?.trim()) {
      alertErro('Campo obrigatório', 'Preencha o Número de Entidade (Passo 3) primeiro.');
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      const result = await api.post<{ sucesso: boolean; mensagem: string }>('/api/emis/testar-ligacao', {
        entidadeId: config.numeroEntidade,
        apiKey: config.emisApiKey,
        apiUrl: config.emisApiUrl,
        ambiente,
      });
      setTestResult(result);
    } catch {
      setTestResult({ sucesso: false, mensagem: 'Erro de rede. Verifique a URL da API e tente novamente.' });
    } finally {
      setTesting(false);
    }
  }

  async function activarServico(valor: boolean) {
    await updateConfig({ emisHabilitado: valor } as never);
    if (valor) {
      alertSucesso('Serviço activado!', 'As referências bancárias passam a ser geradas automaticamente via API.');
    }
  }

  function copyToClipboard(text: string) {
    if (Platform.OS === 'web' && navigator?.clipboard) {
      navigator.clipboard.writeText(text);
      alertSucesso('Copiado!', 'O URL foi copiado para a área de transferência.');
    } else {
      webAlert('URL do Webhook', text);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      <TopBar
        title="Configuração EMIS / Multicaixa"
        subtitle={`Passo ${step} de ${STEPS.length} — ${STEPS[step - 1].label}`}
        leftAction={{ icon: 'arrow-back', onPress: () => router.back() }}
      />

      {/* Barra de progresso */}
      <View style={s.progressBar}>
        {STEPS.map((st, i) => (
          <React.Fragment key={st.id}>
            <TouchableOpacity
              onPress={() => { if (st.id < step || (st.id === step + 1 && step < STEPS.length)) setStep(st.id); }}
              style={s.progressStep}
            >
              <View style={[
                s.progressDot,
                step > st.id && { backgroundColor: GREEN },
                step === st.id && { backgroundColor: GREEN, borderWidth: 2, borderColor: GREEN + '44', width: 32, height: 32 },
                step < st.id && { backgroundColor: Colors.surface, borderWidth: 2, borderColor: Colors.border },
              ]}>
                {step > st.id
                  ? <Ionicons name="checkmark" size={14} color="#fff" />
                  : <Ionicons name={st.icon as any} size={step === st.id ? 16 : 13} color={step === st.id ? '#fff' : Colors.textMuted} />
                }
              </View>
              <Text style={[s.progressLabel, step === st.id && { color: GREEN, fontFamily: 'Inter_700Bold' }]}>
                {st.label}
              </Text>
            </TouchableOpacity>
            {i < STEPS.length - 1 && (
              <View style={[s.progressLine, step > st.id && { backgroundColor: GREEN }]} />
            )}
          </React.Fragment>
        ))}
      </View>

      <ScrollView
        contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >

        {/* ── PASSO 1: APRESENTAÇÃO ─────────────────────────────── */}
        {step === 1 && (
          <View style={{ gap: 14 }}>
            <LinearGradient
              colors={[GREEN + '20', GREEN + '08']}
              style={s.heroBanner}
            >
              <View style={s.heroIcon}>
                <Ionicons name="card" size={36} color={GREEN} />
              </View>
              <Text style={s.heroTitle}>Referências Bancárias Multicaixa</Text>
              <Text style={s.heroDesc}>
                Permita que os encarregados paguem propinas directamente no ATM ou app Multicaixa Express,
                sem deslocações à secretaria. O sistema confirma o pagamento automaticamente em segundos.
              </Text>
            </LinearGradient>

            <Text style={s.sectionTitle}>Como funciona?</Text>
            {[
              { icon: 'receipt-outline', color: Colors.info, title: 'Referência gerada', desc: 'A secretaria (ou o próprio aluno/encarregado) clica em "Gerar Referência" e o sistema contacta o banco via API.' },
              { icon: 'card-outline', color: Colors.gold, title: 'Pagamento no ATM', desc: 'O encarregado vai a qualquer caixa ATM Multicaixa ou abre a app Multicaixa Express, escolhe Pagamentos → Por Referência e introduz a entidade e referência.' },
              { icon: 'checkmark-circle-outline', color: GREEN, title: 'Confirmação automática', desc: 'O banco notifica o SIGA via webhook. O sistema marca o pagamento como Pago e remove os alertas de dívida em segundos.' },
            ].map((item, i) => (
              <View key={i} style={s.howCard}>
                <View style={[s.howIcon, { backgroundColor: item.color + '18' }]}>
                  <Ionicons name={item.icon as any} size={22} color={item.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.howTitle}>{item.title}</Text>
                  <Text style={s.howDesc}>{item.desc}</Text>
                </View>
              </View>
            ))}

            <Text style={s.sectionTitle}>Pré-requisito</Text>
            <View style={s.infoBox}>
              <Ionicons name="information-circle-outline" size={18} color={Colors.info} />
              <Text style={s.infoText}>
                É necessário assinar um contrato de <Text style={{ fontFamily: 'Inter_700Bold' }}>cobrança por referência bancária</Text> com um banco angolano (BFA, BAI, BIC, etc.).
                {'\n\n'}O banco fornecerá o <Text style={{ fontFamily: 'Inter_700Bold' }}>Número de Entidade</Text>, a <Text style={{ fontFamily: 'Inter_700Bold' }}>API Key</Text> e a <Text style={{ fontFamily: 'Inter_700Bold' }}>URL da API</Text>.
                {'\n\n'}Enquanto não tiver contrato, pode usar o modo <Text style={{ fontFamily: 'Inter_700Bold', color: Colors.warning }}>Sandbox</Text> para testar o fluxo completo sem custos.
              </Text>
            </View>

            {!isCeo && (
              <View style={[s.infoBox, { backgroundColor: Colors.warning + '12', borderColor: Colors.warning + '40' }]}>
                <Ionicons name="shield-checkmark" size={18} color={Colors.warning} />
                <Text style={[s.infoText, { color: Colors.warning }]}>
                  A activação requer perfil <Text style={{ fontFamily: 'Inter_700Bold' }}>CEO</Text>. Pode consultar esta configuração mas não guardar alterações.
                </Text>
              </View>
            )}
          </View>
        )}

        {/* ── PASSO 2: BANCO & AMBIENTE ─────────────────────────── */}
        {step === 2 && (
          <View style={{ gap: 14 }}>
            <Text style={s.sectionTitle}>Ambiente de operação</Text>
            <Text style={s.sectionDesc}>
              Use <Text style={{ fontFamily: 'Inter_700Bold', color: Colors.warning }}>Sandbox</Text> para testes sem custos.
              Mude para <Text style={{ fontFamily: 'Inter_700Bold', color: GREEN }}>Produção</Text> apenas quando tiver as credenciais reais do banco.
            </Text>

            <View style={{ flexDirection: 'row', gap: 10 }}>
              {(['sandbox', 'producao'] as const).map(amb => {
                const isActive = ambiente === amb;
                const cor = amb === 'sandbox' ? Colors.warning : GREEN;
                return (
                  <TouchableOpacity
                    key={amb}
                    style={[s.ambBtn, isActive && { borderColor: cor, backgroundColor: cor + '15' }]}
                    onPress={() => isCeo && updateConfig({ emisAmbiente: amb } as never)}
                    disabled={!isCeo}
                  >
                    <Ionicons name={amb === 'sandbox' ? 'construct-outline' : 'shield-checkmark'} size={22} color={isActive ? cor : Colors.textMuted} />
                    <Text style={[s.ambLabel, isActive && { color: cor }]}>
                      {amb === 'sandbox' ? 'Sandbox\n(Teste)' : 'Produção\n(Real)'}
                    </Text>
                    {isActive && (
                      <View style={[s.ambCheck, { backgroundColor: cor }]}>
                        <Ionicons name="checkmark" size={10} color="#fff" />
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>

            {ambiente === 'producao' && (
              <View style={[s.warnBox]}>
                <Ionicons name="warning" size={16} color={Colors.warning} />
                <Text style={[s.infoText, { color: Colors.warning }]}>
                  Modo Produção activo — as referências geradas serão cobradas em ATM e Multicaixa Express reais.
                  Certifique-se de que as credenciais estão correctas antes de activar.
                </Text>
              </View>
            )}

            <Text style={[s.sectionTitle, { marginTop: 6 }]}>Banco parceiro</Text>
            <Text style={s.sectionDesc}>
              Seleccione o banco com que a escola tem contrato de cobrança por referência.
            </Text>

            <View style={{ gap: 8 }}>
              {BANCOS.map(banco => {
                const isActive = config.emisProvedor === banco.code ||
                  (banco.code === 'Outro' && !BANCOS.slice(0, -1).some(b => b.code === config.emisProvedor) && !!config.emisProvedor);
                return (
                  <TouchableOpacity
                    key={banco.code}
                    style={[s.bancoRow, isActive && { borderColor: GREEN, backgroundColor: GREEN + '0C' }]}
                    onPress={() => {
                      if (!isCeo) return;
                      if (banco.code === 'Outro') {
                        updateConfig({ emisProvedor: 'Outro', bancoTransferencia: '' } as never);
                      } else {
                        updateConfig({ emisProvedor: banco.code, bancoTransferencia: banco.label.split(' — ')[0] } as never);
                      }
                    }}
                    disabled={!isCeo}
                  >
                    <View style={[s.bancoRadio, isActive && { backgroundColor: GREEN, borderColor: GREEN }]}>
                      {isActive && <View style={s.bancoRadioDot} />}
                    </View>
                    <Text style={[s.bancoLabel, isActive && { color: GREEN, fontFamily: 'Inter_700Bold' }]}>
                      {banco.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Campos banco personalizado */}
            {(config.emisProvedor === 'Outro' || (!BANCOS.slice(0, -1).some(b => b.code === config.emisProvedor) && !!config.emisProvedor)) && (
              <View style={[s.card, { borderColor: GREEN + '30', backgroundColor: GREEN + '06' }]}>
                <Text style={[s.fieldLabel, { color: GREEN }]}>Sigla / Código do banco</Text>
                <TextInput
                  style={[s.input, { marginTop: 6, marginBottom: 12 }]}
                  placeholder="Ex: BNI, BCGA…"
                  placeholderTextColor={Colors.textMuted}
                  value={customBancoCode}
                  onChangeText={setCustomBancoCode}
                  autoCapitalize="characters"
                  maxLength={10}
                  editable={isCeo}
                />
                <Text style={s.fieldLabel}>Nome completo do banco</Text>
                <TextInput
                  style={[s.input, { marginTop: 6 }]}
                  placeholder="Ex: Banco Nacional de Investimento"
                  placeholderTextColor={Colors.textMuted}
                  value={customBancoNome}
                  onChangeText={setCustomBancoNome}
                  editable={isCeo}
                />
                {isCeo && customBancoCode.trim() && customBancoNome.trim() && (
                  <TouchableOpacity
                    style={[s.btnPrimary, { marginTop: 12, backgroundColor: GREEN }]}
                    onPress={() => {
                      updateConfig({ emisProvedor: customBancoCode.trim(), bancoTransferencia: customBancoNome.trim() } as never);
                      alertSucesso('Banco guardado', `${customBancoNome} (${customBancoCode}) registado.`);
                    }}
                  >
                    <Text style={s.btnPrimaryText}>Guardar Banco</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>
        )}

        {/* ── PASSO 3: CREDENCIAIS ──────────────────────────────── */}
        {step === 3 && (
          <View style={{ gap: 14 }}>
            <View style={s.infoBox}>
              <Ionicons name="information-circle-outline" size={18} color={Colors.info} />
              <Text style={s.infoText}>
                Estas credenciais são fornecidas pelo banco após a assinatura do contrato de cobrança por referência.
                Em modo Sandbox pode deixar a API Key e URL vazios — o sistema simulará as referências localmente.
              </Text>
            </View>

            {[
              {
                label: 'Nome do beneficiário',
                sublabel: 'Nome oficial da escola, como consta nos documentos do banco',
                placeholder: 'Ex: Escola Secundária N.º 1 de Luanda',
                value: config.nomeBeneficiario || '',
                onChange: (v: string) => updateConfig({ nomeBeneficiario: v }),
                icon: 'school-outline',
                required: true,
                secure: false,
                keyboard: 'default' as const,
              },
              {
                label: 'Número de Entidade',
                sublabel: 'Identificador da escola na rede Multicaixa (5 dígitos)',
                placeholder: 'Ex: 12345',
                value: config.numeroEntidade || '',
                onChange: (v: string) => updateConfig({ numeroEntidade: v }),
                icon: 'barcode-outline',
                required: true,
                secure: false,
                keyboard: 'number-pad' as const,
              },
              {
                label: 'API Key / Token',
                sublabel: 'Chave secreta de autenticação fornecida pelo banco',
                placeholder: 'Token de autenticação (sensível)',
                value: config.emisApiKey || '',
                onChange: (v: string) => updateConfig({ emisApiKey: v } as never),
                icon: 'key-outline',
                required: false,
                secure: true,
                keyboard: 'default' as const,
              },
              {
                label: 'URL da API',
                sublabel: 'Endpoint REST do banco para geração de referências',
                placeholder: 'https://api.banco.ao/cobranca/v1/',
                value: config.emisApiUrl || '',
                onChange: (v: string) => updateConfig({ emisApiUrl: v } as never),
                icon: 'globe-outline',
                required: false,
                secure: false,
                keyboard: 'url' as const,
              },
              {
                label: 'IBAN',
                sublabel: 'IBAN bancário da escola (para referência nos recibos)',
                placeholder: 'Ex: AO06.0040.0000.0000.1234.1019.2',
                value: config.iban || '',
                onChange: (v: string) => updateConfig({ iban: v }),
                icon: 'card-outline',
                required: false,
                secure: false,
                keyboard: 'default' as const,
              },
            ].map((field, i) => (
              <View key={i} style={s.card}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <Ionicons name={field.icon as any} size={16} color={GREEN} />
                  <Text style={s.fieldLabel}>
                    {field.label}
                    {field.required && <Text style={{ color: Colors.danger }}> *</Text>}
                  </Text>
                </View>
                <Text style={s.fieldSublabel}>{field.sublabel}</Text>
                <View style={{ position: 'relative' }}>
                  <TextInput
                    style={[s.input, { marginTop: 8, paddingRight: field.secure ? 44 : 12 }]}
                    placeholder={field.placeholder}
                    placeholderTextColor={Colors.textMuted}
                    value={field.value}
                    onChangeText={field.onChange}
                    secureTextEntry={field.secure && !showApiKey}
                    autoCapitalize="none"
                    keyboardType={field.keyboard}
                    editable={isCeo}
                  />
                  {field.secure && (
                    <TouchableOpacity
                      style={{ position: 'absolute', right: 10, top: 18 }}
                      onPress={() => setShowApiKey(v => !v)}
                    >
                      <Ionicons name={showApiKey ? 'eye-off-outline' : 'eye-outline'} size={18} color={Colors.textMuted} />
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            ))}

            <View style={[s.infoBox, { backgroundColor: Colors.warning + '10', borderColor: Colors.warning + '40' }]}>
              <Ionicons name="shield-outline" size={18} color={Colors.warning} />
              <Text style={[s.infoText, { color: Colors.warning }]}>
                A API Key é guardada de forma segura na base de dados da escola. Nunca a partilhe por email ou mensagem.
              </Text>
            </View>
          </View>
        )}

        {/* ── PASSO 4: TESTE DE LIGAÇÃO ─────────────────────────── */}
        {step === 4 && (
          <View style={{ gap: 14 }}>
            <Text style={s.sectionTitle}>Testar ligação à API do banco</Text>
            <Text style={s.sectionDesc}>
              Verifique se as credenciais introduzidas no passo anterior estão correctas antes de activar o serviço.
            </Text>

            {/* Resumo das credenciais */}
            <View style={s.card}>
              <Text style={[s.fieldLabel, { marginBottom: 10 }]}>Configuração actual</Text>
              {[
                { label: 'Ambiente', value: ambiente === 'producao' ? '🔴 Produção' : '🟡 Sandbox (Teste)' },
                { label: 'Banco', value: config.emisProvedor || '—' },
                { label: 'Entidade', value: config.numeroEntidade || '—' },
                { label: 'API Key', value: config.emisApiKey ? '••••••••' + (config.emisApiKey as string).slice(-4) : '(vazio — modo sandbox)' },
                { label: 'URL da API', value: (config.emisApiUrl as string) || '(vazio — modo sandbox)' },
              ].map((row, i) => (
                <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 7, borderBottomWidth: i < 4 ? 1 : 0, borderBottomColor: Colors.border }}>
                  <Text style={{ fontSize: 12, fontFamily: 'Inter_600SemiBold', color: Colors.textMuted }}>{row.label}</Text>
                  <Text style={{ fontSize: 12, fontFamily: 'Inter_700Bold', color: Colors.text, maxWidth: '60%', textAlign: 'right' }} numberOfLines={1}>{row.value}</Text>
                </View>
              ))}
            </View>

            {/* Resultado do teste */}
            {testResult && (
              <View style={[s.testResult, { borderColor: testResult.sucesso ? GREEN + '55' : Colors.danger + '55', backgroundColor: testResult.sucesso ? GREEN + '10' : Colors.danger + '10' }]}>
                <Ionicons name={testResult.sucesso ? 'checkmark-circle' : 'close-circle'} size={22} color={testResult.sucesso ? GREEN : Colors.danger} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13, fontFamily: 'Inter_700Bold', color: testResult.sucesso ? GREEN : Colors.danger, marginBottom: 4 }}>
                    {testResult.sucesso ? 'Ligação bem-sucedida!' : 'Falha na ligação'}
                  </Text>
                  <Text style={{ fontSize: 12, fontFamily: 'Inter_400Regular', color: testResult.sucesso ? GREEN : Colors.danger, lineHeight: 17 }}>
                    {testResult.mensagem}
                  </Text>
                </View>
              </View>
            )}

            <TouchableOpacity
              style={[s.btnPrimary, { backgroundColor: Colors.info, opacity: testing ? 0.6 : 1 }]}
              onPress={testarLigacao}
              disabled={testing}
            >
              {testing
                ? <ActivityIndicator size="small" color="#fff" />
                : <Ionicons name="wifi" size={18} color="#fff" />
              }
              <Text style={s.btnPrimaryText}>{testing ? 'A testar ligação…' : 'Testar Ligação à API'}</Text>
            </TouchableOpacity>

            {!config.numeroEntidade?.trim() && (
              <View style={[s.infoBox, { backgroundColor: Colors.danger + '10', borderColor: Colors.danger + '30' }]}>
                <Ionicons name="alert-circle-outline" size={18} color={Colors.danger} />
                <Text style={[s.infoText, { color: Colors.danger }]}>
                  O Número de Entidade é obrigatório para testar a ligação. Volte ao Passo 3 e preencha-o.
                </Text>
              </View>
            )}

            <View style={s.infoBox}>
              <Ionicons name="construct-outline" size={18} color={Colors.info} />
              <Text style={s.infoText}>
                Em modo Sandbox, o teste verifica apenas a configuração local. Em Produção, contacta a API real do banco.
                {'\n\n'}Se a ligação falhar, verifique se a URL da API está correcta e se a API Key não expirou.
              </Text>
            </View>
          </View>
        )}

        {/* ── PASSO 5: WEBHOOK & ACTIVAR ────────────────────────── */}
        {step === 5 && (
          <View style={{ gap: 14 }}>
            <Text style={s.sectionTitle}>URL do Webhook</Text>
            <Text style={s.sectionDesc}>
              Forneça este endereço ao banco para que ele notifique o SIGA quando um pagamento for confirmado no ATM.
            </Text>

            <View style={[s.card, { borderColor: GREEN + '40', backgroundColor: GREEN + '06' }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                <Ionicons name="link-outline" size={15} color={GREEN} />
                <Text style={[s.fieldLabel, { color: GREEN }]}>Endpoint de confirmação de pagamento</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text selectable style={{ flex: 1, fontSize: 12, fontFamily: 'Inter_600SemiBold', color: Colors.text, lineHeight: 18 }}>
                  {webhookUrl}
                </Text>
                <TouchableOpacity
                  style={{ padding: 8, borderRadius: 8, backgroundColor: GREEN + '18' }}
                  onPress={() => copyToClipboard(webhookUrl)}
                >
                  <Ionicons name="copy-outline" size={16} color={GREEN} />
                </TouchableOpacity>
              </View>
              <Text style={{ fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 8 }}>
                Método: POST · Content-Type: application/json
              </Text>
            </View>

            <Text style={s.sectionTitle}>Segurança do Webhook (recomendado)</Text>
            <Text style={s.sectionDesc}>
              Para evitar chamadas falsas, configure uma senha secreta compartilhada com o banco.
            </Text>

            <View style={s.card}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
                <Ionicons name="shield-checkmark-outline" size={20} color={Colors.gold} style={{ marginTop: 1 }} />
                <View style={{ flex: 1 }}>
                  <Text style={[s.howTitle, { color: Colors.gold }]}>Variável de ambiente: EMIS_WEBHOOK_SECRET</Text>
                  <Text style={s.howDesc}>
                    1. Aceda às <Text style={{ fontFamily: 'Inter_700Bold' }}>Secrets</Text> do Replit (ícone de cadeado na barra lateral).{'\n'}
                    2. Crie uma variável chamada <Text style={{ fontFamily: 'Inter_700Bold' }}>EMIS_WEBHOOK_SECRET</Text> com uma senha forte (ex.: uma string aleatória de 32 caracteres).{'\n'}
                    3. Informe o banco desta senha — eles devem enviá-la no header <Text style={{ fontFamily: 'Inter_700Bold' }}>X-Webhook-Secret</Text> em cada chamada.{'\n'}
                    4. Reinicie o servidor após adicionar a variável.
                  </Text>
                </View>
              </View>
            </View>

            {/* Payload aceite pelo webhook EMIS */}
            <View style={s.card}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <Ionicons name="code-slash-outline" size={16} color={Colors.textMuted} />
                <Text style={s.fieldLabel}>Payload aceite pelo SIGA (bancos / EMIS)</Text>
              </View>
              <View style={{ backgroundColor: Colors.surface, borderRadius: 8, padding: 12 }}>
                <Text selectable style={{ fontSize: 11, fontFamily: Platform.select({ web: 'monospace', default: 'Inter_400Regular' }), color: Colors.textSecondary, lineHeight: 18 }}>
                  {'{\n  "referencia": "12345 987654321",\n  "valor": 15000.00,\n  "dataPagamento": "2026-06-14T10:30:00Z"\n}'}
                </Text>
              </View>
              <Text style={{ fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 8 }}>
                Suporta também: <Text style={{ fontFamily: 'Inter_600SemiBold' }}>reference, ref, transactionRef, amount, montante</Text>
              </Text>
            </View>

            {/* AppyPay */}
            <Text style={s.sectionTitle}>Integração AppyPay (alternativa)</Text>
            <Text style={s.sectionDesc}>
              A AppyPay é um gateway angolano que integra Multicaixa Express e referências bancárias numa única API.
              Configure este URL como webhook na sua conta AppyPay.
            </Text>
            <View style={[s.card, { borderColor: '#7C3AED40', backgroundColor: '#F5F3FF' }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                <Ionicons name="logo-electron" size={15} color="#7C3AED" />
                <Text style={[s.fieldLabel, { color: '#7C3AED' }]}>Webhook URL — AppyPay</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text selectable style={{ flex: 1, fontSize: 12, fontFamily: 'Inter_600SemiBold', color: Colors.text, lineHeight: 18 }}>
                  {webhookUrl.replace('/api/emis/webhook', '/api/appypay/webhook')}
                </Text>
                <TouchableOpacity
                  style={{ padding: 8, borderRadius: 8, backgroundColor: '#7C3AED18' }}
                  onPress={() => copyToClipboard(webhookUrl.replace('/api/emis/webhook', '/api/appypay/webhook'))}
                >
                  <Ionicons name="copy-outline" size={16} color="#7C3AED" />
                </TouchableOpacity>
              </View>
              <View style={{ backgroundColor: Colors.surface, borderRadius: 8, padding: 10, marginTop: 10 }}>
                <Text selectable style={{ fontSize: 10, fontFamily: Platform.select({ web: 'monospace', default: 'Inter_400Regular' }), color: Colors.textSecondary, lineHeight: 16 }}>
                  {'{\n  "status": "completed",\n  "amount": 15000,\n  "reference": "12345 987654321",\n  "customData": { "rupeId": "..." },\n  "paidAt": "2026-06-14T10:30:00Z"\n}'}
                </Text>
              </View>
              <Text style={{ fontSize: 11, fontFamily: 'Inter_400Regular', color: '#6D28D9', marginTop: 8 }}>
                Opcional: defina <Text style={{ fontFamily: 'Inter_600SemiBold' }}>APPYPAY_WEBHOOK_SECRET</Text> nos Secrets do Replit para validar a assinatura (header X-AppyPay-Signature).
              </Text>
            </View>

            {/* Toggle de activação */}
            <Text style={[s.sectionTitle, { marginTop: 4 }]}>Activar o serviço</Text>
            <View style={[s.card, { borderWidth: 2, borderColor: (config.emisHabilitado ? GREEN : Colors.danger) + '60' }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: (config.emisHabilitado ? GREEN : Colors.danger) + '18', alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name={config.emisHabilitado ? 'checkmark-circle' : 'close-circle'} size={24} color={config.emisHabilitado ? GREEN : Colors.danger} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontFamily: 'Inter_700Bold', color: Colors.text }}>Pagamentos Online</Text>
                  <Text style={{ fontSize: 12, fontFamily: 'Inter_400Regular', color: config.emisHabilitado ? GREEN : Colors.danger, marginTop: 2 }}>
                    {config.emisHabilitado ? 'ACTIVO — Referências geradas via API do banco' : 'INACTIVO — Modo sandbox (referências simuladas)'}
                  </Text>
                </View>
                <Switch
                  value={!!config.emisHabilitado}
                  onValueChange={v => isCeo && activarServico(v)}
                  trackColor={{ false: Colors.danger + '88', true: GREEN + '88' }}
                  thumbColor={config.emisHabilitado ? GREEN : Colors.danger}
                  disabled={!isCeo}
                />
              </View>
            </View>

            {config.emisHabilitado && (
              <LinearGradient colors={[GREEN + '20', GREEN + '08']} style={[s.heroBanner, { paddingVertical: 20 }]}>
                <Ionicons name="checkmark-circle" size={40} color={GREEN} />
                <Text style={[s.heroTitle, { marginTop: 10 }]}>Serviço activo!</Text>
                <Text style={[s.heroDesc, { textAlign: 'center' }]}>
                  As referências bancárias Multicaixa passam a ser geradas automaticamente.
                  Os encarregados podem pagar em qualquer ATM ou app Multicaixa Express.
                </Text>
              </LinearGradient>
            )}

            {!isCeo && (
              <View style={[s.infoBox, { backgroundColor: Colors.warning + '12', borderColor: Colors.warning + '40' }]}>
                <Ionicons name="shield-checkmark" size={18} color={Colors.warning} />
                <Text style={[s.infoText, { color: Colors.warning }]}>
                  Apenas o <Text style={{ fontFamily: 'Inter_700Bold' }}>CEO</Text> pode activar/desactivar o serviço.
                </Text>
              </View>
            )}
          </View>
        )}
      </ScrollView>

      {/* Botões de navegação */}
      <View style={[s.footer, { paddingBottom: insets.bottom + 10 }]}>
        <TouchableOpacity
          style={[s.btnSecondary, step === 1 && { opacity: 0.4 }]}
          onPress={step === 1 ? () => router.back() : goBack}
        >
          <Ionicons name="arrow-back" size={16} color={Colors.text} />
          <Text style={s.btnSecondaryText}>{step === 1 ? 'Fechar' : 'Anterior'}</Text>
        </TouchableOpacity>

        {step < STEPS.length ? (
          <TouchableOpacity style={[s.btnPrimary, { flex: 1 }]} onPress={goNext}>
            <Text style={s.btnPrimaryText}>Seguinte</Text>
            <Ionicons name="arrow-forward" size={16} color="#fff" />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[s.btnPrimary, { flex: 1, backgroundColor: GREEN }]}
            onPress={() => router.back()}
          >
            <Ionicons name="checkmark" size={16} color="#fff" />
            <Text style={s.btnPrimaryText}>Concluir</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  content: { padding: 16, gap: 0 },

  progressBar: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14,
    backgroundColor: Colors.backgroundElevated,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  progressStep: { alignItems: 'center', gap: 4, minWidth: 52 },
  progressDot: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: GREEN,
    alignItems: 'center', justifyContent: 'center',
  },
  progressLabel: {
    fontSize: 9, fontFamily: 'Inter_500Medium',
    color: Colors.textMuted, textAlign: 'center',
  },
  progressLine: {
    flex: 1, height: 2,
    backgroundColor: Colors.border, marginBottom: 14,
  },

  heroBanner: {
    borderRadius: 16, padding: 24,
    alignItems: 'center', gap: 10,
  },
  heroIcon: {
    width: 72, height: 72, borderRadius: 20,
    backgroundColor: GREEN + '20',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 4,
  },
  heroTitle: {
    fontSize: 18, fontFamily: 'Inter_700Bold',
    color: Colors.text, textAlign: 'center',
  },
  heroDesc: {
    fontSize: 13, fontFamily: 'Inter_400Regular',
    color: Colors.textSecondary, lineHeight: 20, textAlign: 'center',
  },

  sectionTitle: {
    fontSize: 13, fontFamily: 'Inter_700Bold',
    color: Colors.text, marginTop: 4,
  },
  sectionDesc: {
    fontSize: 12, fontFamily: 'Inter_400Regular',
    color: Colors.textSecondary, lineHeight: 18, marginTop: -6,
  },

  howCard: {
    flexDirection: 'row', gap: 12, alignItems: 'flex-start',
    backgroundColor: Colors.backgroundCard,
    borderRadius: 12, borderWidth: 1, borderColor: Colors.border,
    padding: 12,
  },
  howIcon: {
    width: 42, height: 42, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  howTitle: { fontSize: 13, fontFamily: 'Inter_700Bold', color: Colors.text, marginBottom: 3 },
  howDesc: { fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textSecondary, lineHeight: 17 },

  infoBox: {
    flexDirection: 'row', gap: 10, alignItems: 'flex-start',
    backgroundColor: Colors.info + '0D',
    borderRadius: 12, borderWidth: 1, borderColor: Colors.info + '30',
    padding: 12,
  },
  infoText: {
    flex: 1, fontSize: 12, fontFamily: 'Inter_400Regular',
    color: Colors.info, lineHeight: 18,
  },
  warnBox: {
    flexDirection: 'row', gap: 10, alignItems: 'flex-start',
    backgroundColor: Colors.warning + '12',
    borderRadius: 12, borderWidth: 1, borderColor: Colors.warning + '40',
    padding: 12,
  },

  ambBtn: {
    flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 18, borderRadius: 14,
    borderWidth: 2, borderColor: Colors.border,
    backgroundColor: Colors.surface,
    position: 'relative',
  },
  ambLabel: {
    fontSize: 13, fontFamily: 'Inter_600SemiBold',
    color: Colors.textMuted, textAlign: 'center', lineHeight: 18,
  },
  ambCheck: {
    position: 'absolute', top: 8, right: 8,
    width: 18, height: 18, borderRadius: 9,
    alignItems: 'center', justifyContent: 'center',
  },

  bancoRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: Colors.backgroundCard,
    borderRadius: 12, borderWidth: 1, borderColor: Colors.border,
    paddingVertical: 12, paddingHorizontal: 14,
  },
  bancoRadio: {
    width: 20, height: 20, borderRadius: 10,
    borderWidth: 2, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  bancoRadioDot: {
    width: 8, height: 8, borderRadius: 4, backgroundColor: '#fff',
  },
  bancoLabel: {
    fontSize: 13, fontFamily: 'Inter_500Medium', color: Colors.text,
  },

  card: {
    backgroundColor: Colors.backgroundCard,
    borderRadius: 14, borderWidth: 1, borderColor: Colors.border,
    padding: 14,
  },
  fieldLabel: {
    fontSize: 12, fontFamily: 'Inter_700Bold', color: Colors.text,
  },
  fieldSublabel: {
    fontSize: 11, fontFamily: 'Inter_400Regular',
    color: Colors.textMuted, lineHeight: 16, marginTop: 2,
  },
  input: {
    backgroundColor: Colors.surface,
    borderRadius: 10, borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: 12, paddingVertical: 11,
    fontSize: 13, fontFamily: 'Inter_400Regular', color: Colors.text,
  },

  testResult: {
    flexDirection: 'row', gap: 12, alignItems: 'flex-start',
    borderRadius: 12, borderWidth: 1, padding: 14,
  },

  btnPrimary: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, backgroundColor: Colors.accent,
    borderRadius: 12, paddingVertical: 14,
  },
  btnPrimaryText: {
    fontSize: 14, fontFamily: 'Inter_700Bold', color: '#fff',
  },
  btnSecondary: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: Colors.surface, borderRadius: 12,
    borderWidth: 1, borderColor: Colors.border,
    paddingVertical: 14, paddingHorizontal: 18,
  },
  btnSecondaryText: {
    fontSize: 14, fontFamily: 'Inter_600SemiBold', color: Colors.text,
  },

  footer: {
    flexDirection: 'row', gap: 10,
    paddingHorizontal: 16, paddingTop: 12,
    backgroundColor: Colors.background,
    borderTopWidth: 1, borderTopColor: Colors.border,
  },
});
