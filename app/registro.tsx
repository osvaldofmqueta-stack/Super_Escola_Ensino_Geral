import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Platform, KeyboardAvoidingView, Modal } from 'react-native';
import AppLoader from '@/components/AppLoader';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Colors } from '@/constants/colors';
import DatePickerField from '@/components/DatePickerField';
import ProvinciaMunicipioSelector from '@/components/ProvinciaMunicipioSelector';
import { consultarNIF } from '@/lib/nifLookup';

const NIVEIS = ['Primário', 'I Ciclo', 'II Ciclo'];
const CLASSES_POR_NIVEL: Record<string, string[]> = {
  'Primário': ['1ª Classe', '2ª Classe', '3ª Classe', '4ª Classe', '5ª Classe', '6ª Classe'],
  'I Ciclo': ['7ª Classe', '8ª Classe', '9ª Classe'],
  'II Ciclo': ['10ª Classe', '11ª Classe', '12ª Classe', '13ª Classe'],
};

const STEP_LABELS = ['Dados Pessoais', 'Contacto', 'Escolaridade'];

interface CursoOption { id: string; nome: string; codigo: string; areaFormacao: string; }

interface FormData {
  nif: string;
  nomeCompleto: string;
  dataNascimento: string;
  genero: 'M' | 'F';
  provincia: string;
  municipio: string;
  telefone: string;
  email: string;
  endereco: string;
  bairro: string;
  numeroBi: string;
  numeroCedula: string;
  nivel: string;
  classe: string;
  cursoId: string;
  nomeEncarregado: string;
  telefoneEncarregado: string;
  observacoes: string;
  tipoInscricao: 'novo' | 'reconfirmacao';
}

function InputField({
  label, value, onChangeText, placeholder, required, keyboardType, multiline, hint, autoCapitalize, error,
}: {
  label: string; value: string; onChangeText: (v: string) => void;
  placeholder?: string; required?: boolean; keyboardType?: any; multiline?: boolean; hint?: string; autoCapitalize?: any; error?: string;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.fieldGroup}>
      <View style={styles.fieldLabelRow}>
        <Text style={styles.fieldLabel}>{label}</Text>
        {required && <Text style={styles.fieldRequired}>*</Text>}
      </View>
      {hint && <Text style={styles.fieldHint}>{hint}</Text>}
      <View style={[styles.inputWrap, focused && styles.inputWrapFocused, multiline && styles.inputWrapMulti, !!error && styles.inputWrapError]}>
        <TextInput
          style={[styles.input, multiline && styles.inputMulti]}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={Colors.textMuted}
          keyboardType={keyboardType || 'default'}
          autoCapitalize={autoCapitalize ?? 'words'}
          multiline={multiline}
          numberOfLines={multiline ? 4 : 1}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          textAlignVertical={multiline ? 'top' : 'center'}
        />
      </View>
      {!!error && <Text style={styles.fieldError}>{error}</Text>}
    </View>
  );
}

function ChipSelector({
  label, options, value, onSelect, required, error,
}: {
  label: string; options: string[]; value: string;
  onSelect: (v: string) => void; required?: boolean; error?: string;
}) {
  return (
    <View style={styles.fieldGroup}>
      <View style={styles.fieldLabelRow}>
        <Text style={styles.fieldLabel}>{label}</Text>
        {required && <Text style={styles.fieldRequired}>*</Text>}
      </View>
      <View style={[styles.chipsWrap, !!error && { borderWidth: 1, borderColor: Colors.danger, borderRadius: 10, padding: 8 }]}>
        {options.map(opt => (
          <TouchableOpacity
            key={opt}
            style={[styles.chip, value === opt && styles.chipActive]}
            onPress={() => onSelect(opt)}
            activeOpacity={0.75}
          >
            {value === opt && (
              <Ionicons name="checkmark" size={11} color={Colors.accent} style={{ marginRight: 3 }} />
            )}
            <Text style={[styles.chipText, value === opt && styles.chipTextActive]}>{opt}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {!!error && <Text style={styles.fieldError}>{error}</Text>}
    </View>
  );
}

function CredenciaisModal({ visible, dados, onClose }: {
  visible: boolean;
  dados: { nomeCompleto: string; email: string; senha: string; rupeInscricao?: string } | null;
  onClose: () => void;
}) {
  if (!dados) return null;
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={credStyles.overlay}>
        <View style={credStyles.container}>
          <View style={credStyles.iconCircle}>
            <Ionicons name="checkmark-circle" size={48} color={Colors.success} />
          </View>
          <Text style={credStyles.title}>Inscrição Submetida!</Text>
          <Text style={credStyles.subtitle}>
            Guarde as suas credenciais e a referência de pagamento. São necessárias para continuar o processo.
          </Text>

          {/* Payment RUPE */}
          {!!dados.rupeInscricao && (
            <View style={[credStyles.box, { borderColor: Colors.gold + '50', backgroundColor: 'rgba(240,165,0,0.06)', marginBottom: 10 }]}>
              <View style={credStyles.row}>
                <Ionicons name="receipt-outline" size={15} color={Colors.gold} />
                <View style={{ flex: 1 }}>
                  <Text style={credStyles.rowLabel}>Taxa de Inscrição — Referência RUPE</Text>
                  <Text style={[credStyles.rowValue, { color: Colors.gold, letterSpacing: 1.5, fontSize: 16 }]}>{dados.rupeInscricao}</Text>
                  <Text style={{ fontSize: 10, color: Colors.textMuted, marginTop: 3, fontFamily: 'Inter_400Regular' }}>
                    Pague em qualquer balcão Multicaixa ou banco. Após o pagamento, dirija-se à secretaria com o comprovativo para confirmar.
                  </Text>
                </View>
              </View>
            </View>
          )}

          <View style={credStyles.box}>
            <View style={credStyles.row}>
              <Ionicons name="mail-outline" size={15} color={Colors.gold} />
              <View style={{ flex: 1 }}>
                <Text style={credStyles.rowLabel}>Email de Acesso</Text>
                <Text style={credStyles.rowValue}>{dados.email}</Text>
              </View>
            </View>
            <View style={credStyles.divider} />
            <View style={credStyles.row}>
              <Ionicons name="lock-closed-outline" size={15} color={Colors.gold} />
              <View style={{ flex: 1 }}>
                <Text style={credStyles.rowLabel}>Senha Provisória</Text>
                <Text style={credStyles.rowValue}>{dados.senha}</Text>
              </View>
            </View>
          </View>

          <View style={credStyles.notice}>
            <Ionicons name="information-circle-outline" size={14} color={Colors.textMuted} />
            <Text style={credStyles.noticeText}>
              Pague a taxa de inscrição e apresente o comprovativo na secretaria. Só após a confirmação do pagamento a sua candidatura será analisada.
            </Text>
          </View>

          <TouchableOpacity style={credStyles.btn} onPress={onClose}>
            <Text style={credStyles.btnText}>Ir para o Login Provisório</Text>
            <Ionicons name="arrow-forward" size={16} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

export default function RegistroScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  useEffect(() => {
    fetch('/api/public/inscricoes-status')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data && !data.abertas) {
          router.replace('/login' as any);
        }
      })
      .catch(() => {});
  }, []);

  const [isLoading, setIsLoading] = useState(false);
  const [step, setStep] = useState(1);
  const [errorMsg, setErrorMsg] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [credenciais, setCredenciais] = useState<{ nomeCompleto: string; email: string; senha: string; rupeInscricao?: string } | null>(null);
  const [cursosDisponiveis, setCursosDisponiveis] = useState<CursoOption[]>([]);
  const [loadingCursos, setLoadingCursos] = useState(false);
  const [nifLookupLoading, setNifLookupLoading] = useState(false);
  const [nifLookupStatus, setNifLookupStatus] = useState<'idle' | 'found' | 'not_found' | 'error'>('idle');
  const [nifFoundName, setNifFoundName] = useState('');

  const [form, setForm] = useState<FormData>({
    nif: '',
    nomeCompleto: '',
    dataNascimento: '',
    genero: 'M',
    provincia: '',
    municipio: '',
    telefone: '',
    email: '',
    endereco: '',
    bairro: '',
    numeroBi: '',
    numeroCedula: '',
    nivel: '',
    classe: '',
    cursoId: '',
    nomeEncarregado: '',
    telefoneEncarregado: '',
    observacoes: '',
    tipoInscricao: 'novo',
  });

  const set = (key: keyof FormData, value: any) => setForm(f => ({ ...f, [key]: value }));

  async function lookupNIF(nif: string) {
    if (!nif?.trim() || nif.trim().length < 9) return;
    setNifLookupLoading(true);
    setNifLookupStatus('idle');
    setNifFoundName('');
    try {
      const data = await consultarNIF(nif);
      if (data) {
        set('nomeCompleto', data.nome);
        setNifFoundName(data.nome);
        setNifLookupStatus('found');
      } else {
        setNifLookupStatus('not_found');
      }
    } catch {
      setNifLookupStatus('error');
    } finally {
      setNifLookupLoading(false);
    }
  }

  useEffect(() => {
    if (form.nivel === 'II Ciclo' && form.classe === '10ª Classe') {
      setLoadingCursos(true);
      fetch('/api/cursos')
        .then(r => r.json())
        .then((data: CursoOption[]) => {
          setCursosDisponiveis((data || []).filter((c: any) => c.ativo !== false));
        })
        .catch(() => {})
        .finally(() => setLoadingCursos(false));
    } else {
      setCursosDisponiveis([]);
      set('cursoId', '');
    }
  }, [form.nivel, form.classe]);

  function showError(msg: string) {
    setErrorMsg(msg);
    setTimeout(() => setErrorMsg(''), 6000);
  }

  function clearErrors() {
    setFieldErrors({});
    setErrorMsg('');
  }

  function validarTelefone(tel: string): boolean {
    const digits = tel.replace(/[\s+\-()]/g, '');
    if (digits.startsWith('244')) return digits.length === 12;
    return /^9\d{8}$/.test(digits);
  }

  const BLOCKED_EMAIL_DOMAINS = [
    'mailinator.com','guerrillamail.com','guerrillamailblock.com','tempmail.com',
    'temp-mail.org','throwam.com','yopmail.com','sharklasers.com','guerrillamail.info',
    'grr.la','guerrillamail.biz','guerrillamail.de','guerrillamail.net','guerrillamail.org',
    'spam4.me','trashmail.com','trashmail.me','trashmail.net','dispostable.com',
    'mailnull.com','spamgourmet.com','maildrop.cc','fakeinbox.com','getairmail.com',
    'filzmail.com','discard.email','mailnesia.com','spamhereplease.com',
    '10minutemail.com','10minutemail.net','10minutemail.org',
    'tempr.email','tempail.com','crazymailing.com','getnada.com','mytemp.email',
    'mail-temporaire.fr','jetable.fr.nf','moncourrier.fr.nf','monemail.fr.nf',
    'speed.1s.fr','sofimail.com','mailzilla.com','moakt.com','emailtemporario.com.br',
  ];

  function validarNIForBI(v: string): boolean {
    return /^\d{9}[A-Z]{2}\d{3}$/.test(v.trim().toUpperCase());
  }

  function validarEmail(email: string): { valid: boolean; erro: string } {
    const e = email.trim().toLowerCase();
    if (!e) return { valid: false, erro: 'O email de contacto é obrigatório.' };
    const regex = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/;
    if (!regex.test(e)) return { valid: false, erro: 'Introduza um email válido (ex: nome@dominio.ao).' };
    const domain = e.split('@')[1];
    if (BLOCKED_EMAIL_DOMAINS.includes(domain)) {
      return { valid: false, erro: 'Não é permitido usar email temporário ou descartável. Use um email real.' };
    }
    return { valid: true, erro: '' };
  }

  function validateStep1() {
    clearErrors();
    const erros: Record<string, string> = {};
    let ok = true;

    const nome = form.nomeCompleto.trim();
    if (!nome) {
      erros.nomeCompleto = 'O nome completo é obrigatório.';
      ok = false;
    } else if (nome.split(/\s+/).length < 2) {
      erros.nomeCompleto = 'Introduza o nome completo (mínimo nome e apelido).';
      ok = false;
    }

    if (!form.dataNascimento || !form.dataNascimento.match(/^\d{4}-\d{2}-\d{2}$/)) {
      erros.dataNascimento = 'Seleccione a data de nascimento (DD-MM-AAAA).';
      ok = false;
    } else {
      const nasc = new Date(form.dataNascimento);
      const hoje = new Date();
      const idade = hoje.getFullYear() - nasc.getFullYear();
      if (isNaN(nasc.getTime()) || idade < 3 || idade > 70) {
        erros.dataNascimento = 'Data de nascimento inválida. Verifique o ano introduzido.';
        ok = false;
      }
    }

    if (!form.provincia) {
      erros.provincia = 'Seleccione a província de naturalidade.';
      ok = false;
    } else if (!form.municipio) {
      erros.municipio = 'Seleccione o município.';
      ok = false;
    }

    if (form.nif.trim() && !validarNIForBI(form.nif)) {
      erros.nif = 'NIF inválido. Formato: 9 dígitos + 2 letras + 3 dígitos (ex: 003519344HA042).';
      ok = false;
    }

    if (Object.keys(erros).length > 0) setFieldErrors(erros);
    return ok;
  }

  function validateStep2() {
    clearErrors();
    const erros: Record<string, string> = {};
    let ok = true;

    if (!form.telefone.trim()) {
      erros.telefone = 'O número de telefone é obrigatório.';
      ok = false;
    } else if (!validarTelefone(form.telefone.trim())) {
      erros.telefone = 'Número inválido. Ex: 923 456 789 ou +244 923 456 789';
      ok = false;
    }

    const emailCheck = validarEmail(form.email);
    if (!emailCheck.valid) {
      erros.email = emailCheck.erro;
      ok = false;
    }

    if (form.numeroBi.trim() && !validarNIForBI(form.numeroBi)) {
      erros.numeroBi = 'Nº do BI inválido. Formato: 9 dígitos + 2 letras + 3 dígitos (ex: 000000000LA000).';
      ok = false;
    }

    if (Object.keys(erros).length > 0) setFieldErrors(erros);
    return ok;
  }

  function validateStep3() {
    clearErrors();
    const erros: Record<string, string> = {};
    let ok = true;

    if (!form.nivel) {
      erros.nivel = 'Seleccione o nível de ensino.';
      ok = false;
    } else if (!form.classe) {
      erros.classe = 'Seleccione a classe pretendida.';
      ok = false;
    } else if (form.nivel === 'II Ciclo' && form.classe === '10ª Classe' && cursosDisponiveis.length > 0 && !form.cursoId) {
      erros.cursoId = 'Seleccione o curso/área de formação para a 10ª Classe do II Ciclo.';
      ok = false;
    }

    if (!form.nomeEncarregado.trim()) {
      erros.nomeEncarregado = 'O nome do encarregado é obrigatório.';
      ok = false;
    } else if (form.nomeEncarregado.trim().split(/\s+/).length < 2) {
      erros.nomeEncarregado = 'Introduza o nome completo do encarregado.';
      ok = false;
    }

    if (!form.telefoneEncarregado.trim()) {
      erros.telefoneEncarregado = 'O contacto do encarregado é obrigatório.';
      ok = false;
    } else if (!validarTelefone(form.telefoneEncarregado.trim())) {
      erros.telefoneEncarregado = 'Número inválido. Ex: 923 456 789 ou +244 923 456 789';
      ok = false;
    }

    if (Object.keys(erros).length > 0) setFieldErrors(erros);
    return ok;
  }

  function handleNext() {
    if (step === 1 && validateStep1()) { setStep(2); clearErrors(); }
    else if (step === 2 && validateStep2()) { setStep(3); clearErrors(); }
    else if (step === 3) handleSubmit();
  }

  async function handleSubmit() {
    if (!validateStep3()) return;
    setIsLoading(true);
    setErrorMsg('');
    try {
      if (Platform.OS !== 'web') await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const res = await fetch('/api/registros', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nomeCompleto: form.nomeCompleto.trim(),
          dataNascimento: form.dataNascimento.trim(),
          genero: form.genero,
          provincia: form.provincia,
          municipio: form.municipio,
          telefone: form.telefone.trim(),
          email: form.email.trim().toLowerCase(),
          endereco: form.endereco.trim(),
          bairro: form.bairro.trim(),
          numeroBi: form.numeroBi.trim(),
          numeroCedula: form.numeroCedula.trim(),
          nivel: form.nivel,
          classe: form.classe,
          cursoId: form.cursoId || null,
          nomeEncarregado: form.nomeEncarregado.trim(),
          telefoneEncarregado: form.telefoneEncarregado.trim(),
          observacoes: form.observacoes.trim(),
          tipoInscricao: form.tipoInscricao,
          origemInscricao: 'web',
          status: 'pendente',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao enviar');
      if (Platform.OS !== 'web') await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setCredenciais({
        nomeCompleto: data.nomeCompleto,
        email: data.email,
        senha: data.senhaProvisoria || '',
        rupeInscricao: data.rupeInscricao || '',
      });
    } catch (e: any) {
      showError(e.message || 'Não foi possível enviar. Tente novamente.');
    } finally {
      setIsLoading(false);
    }
  }

  const classeOptions = form.nivel ? CLASSES_POR_NIVEL[form.nivel] || [] : [];
  const topPad = Platform.OS === 'web' ? 56 : insets.top;
  const bottomPad = Platform.OS === 'web' ? 24 : insets.bottom;

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#061029', '#0A1628', '#0F1F40']} style={styles.header}>
        <View style={[styles.headerTop, { paddingTop: topPad + 6 }]}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.replace('/login' as any)} activeOpacity={0.75}>
            <Ionicons name="arrow-back" size={19} color={Colors.text} />
          </TouchableOpacity>
          <View style={styles.headerTexts}>
            <Text style={styles.headerTitle}>Solicitação de Inscrição de Exame de Acesso</Text>
            <Text style={styles.headerSubtitle}>Preencha todos os campos obrigatórios</Text>
          </View>
        </View>

        <View style={styles.stepsContainer}>
          {[1, 2, 3].map((s, idx) => (
            <React.Fragment key={s}>
              {idx > 0 && (
                <View style={[styles.stepLine, step > idx && styles.stepLineDone]} />
              )}
              <View style={styles.stepItem}>
                <View style={[styles.stepCircle, step === s && styles.stepCircleActive, step > s && styles.stepCircleDone]}>
                  {step > s
                    ? <Ionicons name="checkmark" size={12} color="#fff" />
                    : <Text style={[styles.stepNum, step === s && styles.stepNumActive]}>{s}</Text>
                  }
                </View>
                <Text style={[styles.stepLabel, step >= s && styles.stepLabelActive]} numberOfLines={1}>
                  {STEP_LABELS[s - 1]}
                </Text>
              </View>
            </React.Fragment>
          ))}
        </View>
      </LinearGradient>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: bottomPad + 110 }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >

          {/* ── STEP 1: Dados Pessoais ─── */}
          {step === 1 && (
            <View style={styles.stepCard}>
              <View style={styles.stepCardHead}>
                <View style={[styles.stepCardIcon, { backgroundColor: 'rgba(52,152,219,0.12)' }]}>
                  <Ionicons name="person-outline" size={16} color="#3498DB" />
                </View>
                <Text style={styles.stepCardTitle}>Dados do Estudante</Text>
              </View>

              {/* NIF Lookup */}
              <View style={styles.fieldGroup}>
                <View style={styles.fieldLabelRow}>
                  <Text style={styles.fieldLabel}>NIF (opcional)</Text>
                </View>
                <Text style={styles.fieldHint}>Introduza o NIF para preencher automaticamente o nome</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View style={[styles.inputWrap, { flex: 1 }, !!fieldErrors.nif && styles.inputWrapError]}>
                    <TextInput
                      style={styles.input}
                      value={form.nif}
                      onChangeText={v => { set('nif', v); setNifLookupStatus('idle'); setNifFoundName(''); if (fieldErrors.nif) setFieldErrors(e => ({ ...e, nif: '' })); }}
                      onBlur={() => lookupNIF(form.nif)}
                      placeholder="Ex: 003519344HA042"
                      placeholderTextColor={Colors.textMuted}
                      autoCapitalize="characters"
                    />
                  </View>
                  <TouchableOpacity
                    style={[nifBtnStyleReg, nifLookupLoading && { opacity: 0.6 }]}
                    onPress={() => lookupNIF(form.nif)}
                    disabled={nifLookupLoading}
                    activeOpacity={0.8}
                  >
                    {nifLookupLoading
                      ? <AppLoader size="small" color="#fff" />
                      : <Ionicons name="search" size={16} color="#fff" />}
                  </TouchableOpacity>
                </View>
                {nifLookupStatus === 'found' && (
                  <View style={nifBadgeStyleReg}>
                    <Ionicons name="checkmark-circle" size={14} color={Colors.success} />
                    <Text style={[nifBadgeTxtReg, { color: Colors.success }]}>Nome preenchido: {nifFoundName}</Text>
                  </View>
                )}
                {(nifLookupStatus === 'not_found' || nifLookupStatus === 'error') && (
                  <View style={nifBadgeStyleReg}>
                    <Ionicons name="warning-outline" size={14} color="#F39C12" />
                    <Text style={[nifBadgeTxtReg, { color: '#F39C12' }]}>NIF não encontrado — preencha o nome manualmente</Text>
                  </View>
                )}
                {!!fieldErrors.nif && <Text style={styles.fieldError}>{fieldErrors.nif}</Text>}
              </View>

              <InputField label="Nome Completo" value={form.nomeCompleto} onChangeText={v => { set('nomeCompleto', v); if (fieldErrors.nomeCompleto) setFieldErrors(e => ({ ...e, nomeCompleto: '' })); }} placeholder="Nome completo do estudante" required error={fieldErrors.nomeCompleto} />

              <View style={styles.fieldGroup}>
                <DatePickerField
                  label="Data de Nascimento"
                  value={form.dataNascimento}
                  onChange={v => { set('dataNascimento', v); if (fieldErrors.dataNascimento) setFieldErrors(e => ({ ...e, dataNascimento: '' })); }}
                  required
                  hasError={!!fieldErrors.dataNascimento}
                />
                {!!fieldErrors.dataNascimento && <Text style={styles.fieldError}>{fieldErrors.dataNascimento}</Text>}
              </View>

              <ChipSelector label="Género" options={['M', 'F']} value={form.genero} onSelect={v => set('genero', v)} required />

              <ProvinciaMunicipioSelector
                provinciaValue={form.provincia}
                municipioValue={form.municipio}
                onProvinciaChange={v => { set('provincia', v); set('municipio', ''); if (fieldErrors.provincia) setFieldErrors(e => ({ ...e, provincia: '' })); }}
                onMunicipioChange={v => { set('municipio', v); if (fieldErrors.municipio) setFieldErrors(e => ({ ...e, municipio: '' })); }}
                required
                provinciaError={fieldErrors.provincia}
                municipioError={fieldErrors.municipio}
              />
            </View>
          )}

          {/* ── STEP 2: Contacto & Identificação ─── */}
          {step === 2 && (
            <View style={styles.stepCard}>
              <View style={styles.stepCardHead}>
                <View style={[styles.stepCardIcon, { backgroundColor: 'rgba(240,165,0,0.12)' }]}>
                  <Ionicons name="call-outline" size={16} color={Colors.gold} />
                </View>
                <Text style={styles.stepCardTitle}>Contacto & Identificação</Text>
              </View>

              <View style={styles.sectionLabel}>
                <Ionicons name="call-outline" size={12} color={Colors.textMuted} />
                <Text style={styles.sectionLabelText}>Contacto</Text>
              </View>

              <InputField label="Telefone" value={form.telefone} onChangeText={v => { set('telefone', v); if (fieldErrors.telefone) setFieldErrors(e => ({ ...e, telefone: '' })); }} placeholder="+244 9XX XXX XXX" required keyboardType="phone-pad" autoCapitalize="none" error={fieldErrors.telefone} />

              <View style={styles.emailAlertBox}>
                <Ionicons name="warning-outline" size={16} color="#F39C12" style={{ marginTop: 1 }} />
                <Text style={styles.emailAlertText}>
                  <Text style={{ fontFamily: 'Inter_700Bold', color: '#F39C12' }}>Atenção:</Text>{' '}
                  Use um email real e válido. Caso esqueça a sua senha, o link de recuperação será enviado para este endereço. Um email inválido impedirá o acesso à sua conta.
                </Text>
              </View>

              <InputField label="Email de Contacto" value={form.email} onChangeText={v => { set('email', v); if (fieldErrors.email) setFieldErrors(e => ({ ...e, email: '' })); }} placeholder="email@exemplo.ao" required keyboardType="email-address" autoCapitalize="none" hint="Use um email real — necessário para recuperar a senha e aceder à conta provisória" error={fieldErrors.email} />

              <View style={styles.sectionLabel}>
                <Ionicons name="location-outline" size={12} color={Colors.textMuted} />
                <Text style={styles.sectionLabelText}>Localização</Text>
              </View>

              <InputField label="Endereço" value={form.endereco} onChangeText={v => set('endereco', v)} placeholder="Rua, número, bloco..." />
              <InputField label="Bairro" value={form.bairro} onChangeText={v => set('bairro', v)} placeholder="Ex: Bairro Miramar, Rangel..." />

              <View style={styles.sectionLabel}>
                <Ionicons name="card-outline" size={12} color={Colors.textMuted} />
                <Text style={styles.sectionLabelText}>Identificação Oficial</Text>
              </View>

              <InputField label="Número do BI" value={form.numeroBi} onChangeText={v => { set('numeroBi', v); if (fieldErrors.numeroBi) setFieldErrors(e => ({ ...e, numeroBi: '' })); }} placeholder="000000000LA000" autoCapitalize="characters" error={fieldErrors.numeroBi} />
              <InputField label="Número da Cédula" value={form.numeroCedula} onChangeText={v => set('numeroCedula', v)} placeholder="Ex: 12345678" autoCapitalize="none" />
            </View>
          )}

          {/* ── STEP 3: Escolaridade & Encarregado ─── */}
          {step === 3 && (
            <View style={styles.stepCard}>
              <View style={styles.stepCardHead}>
                <View style={[styles.stepCardIcon, { backgroundColor: 'rgba(240,165,0,0.12)' }]}>
                  <Ionicons name="school-outline" size={16} color={Colors.gold} />
                </View>
                <Text style={styles.stepCardTitle}>Escolaridade & Encarregado</Text>
              </View>

              {/* Tipo de inscrição */}
              <View style={styles.fieldGroup}>
                <View style={styles.fieldLabelRow}>
                  <Text style={styles.fieldLabel}>Tipo de Matrícula</Text>
                  <Text style={styles.fieldRequired}>*</Text>
                </View>
                <Text style={styles.fieldHint}>Seleccione se é um novo aluno ou uma reconfirmação (reprovado do ano anterior)</Text>
                <View style={styles.chipsWrap}>
                  {([
                    { value: 'novo', label: 'Novo Aluno', icon: 'person-add-outline' },
                    { value: 'reconfirmacao', label: 'Reconfirmação', icon: 'refresh-outline' },
                  ] as const).map(opt => (
                    <TouchableOpacity
                      key={opt.value}
                      style={[styles.chip, form.tipoInscricao === opt.value && styles.chipActive, { paddingHorizontal: 12, paddingVertical: 8 }]}
                      onPress={() => set('tipoInscricao', opt.value)}
                      activeOpacity={0.75}
                    >
                      {form.tipoInscricao === opt.value && (
                        <Ionicons name="checkmark" size={11} color={Colors.accent} style={{ marginRight: 3 }} />
                      )}
                      <Ionicons name={opt.icon} size={12} color={form.tipoInscricao === opt.value ? Colors.accent : Colors.textMuted} style={{ marginRight: 4 }} />
                      <Text style={[styles.chipText, form.tipoInscricao === opt.value && styles.chipTextActive]}>{opt.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                {form.tipoInscricao === 'reconfirmacao' && (
                  <View style={[styles.emailAlertBox, { marginTop: 8 }]}>
                    <Ionicons name="information-circle-outline" size={14} color="#3498DB" style={{ marginTop: 1 }} />
                    <Text style={[styles.emailAlertText, { color: '#3498DB' }]}>
                      Reconfirmação: aplica-se a alunos que reprovaram e pretendem continuar na mesma classe. As vagas para novos alunos são calculadas após as reconfirmações serem processadas.
                    </Text>
                  </View>
                )}
              </View>

              <ChipSelector
                label="Nível de Ensino"
                options={NIVEIS}
                value={form.nivel}
                onSelect={v => { set('nivel', v); set('classe', ''); if (fieldErrors.nivel) setFieldErrors(e => ({ ...e, nivel: '' })); }}
                required
                error={fieldErrors.nivel}
              />

              {classeOptions.length > 0 && (
                <ChipSelector
                  label="Classe"
                  options={classeOptions}
                  value={form.classe}
                  onSelect={v => { set('classe', v); set('cursoId', ''); if (fieldErrors.classe) setFieldErrors(e => ({ ...e, classe: '' })); }}
                  required
                  error={fieldErrors.classe}
                />
              )}

              {form.classe === '10ª Classe' && (
                <View style={styles.fieldGroup}>
                  <View style={styles.fieldLabelRow}>
                    <Text style={styles.fieldLabel}>Curso</Text>
                    <Text style={styles.fieldRequired}>*</Text>
                  </View>
                  <Text style={styles.fieldHint}>Apenas disponível para a 10ª Classe — II Ciclo</Text>
                  {!!fieldErrors.cursoId && <Text style={styles.fieldError}>{fieldErrors.cursoId}</Text>}
                  {loadingCursos ? (
                    <View style={styles.cursoLoadingBox}>
                      <Text style={styles.cursoLoadingText}>A carregar cursos...</Text>
                    </View>
                  ) : cursosDisponiveis.length === 0 ? (
                    <View style={styles.cursoEmptyBox}>
                      <Ionicons name="information-circle-outline" size={16} color={Colors.textMuted} />
                      <Text style={styles.cursoEmptyText}>Sem cursos parametrizados. Contacte a secretaria.</Text>
                    </View>
                  ) : (
                    <View style={styles.cursoGrid}>
                      {cursosDisponiveis.reduce<Record<string, CursoOption[]>>((acc, c) => {
                        if (!acc[c.areaFormacao]) acc[c.areaFormacao] = [];
                        acc[c.areaFormacao].push(c);
                        return acc;
                      }, {}) && Object.entries(
                        cursosDisponiveis.reduce<Record<string, CursoOption[]>>((acc, c) => {
                          if (!acc[c.areaFormacao]) acc[c.areaFormacao] = [];
                          acc[c.areaFormacao].push(c);
                          return acc;
                        }, {})
                      ).map(([area, lista]) => (
                        <View key={area} style={styles.cursoAreaGroup}>
                          <Text style={styles.cursoAreaLabel}>{area}</Text>
                          {lista.map(curso => (
                            <TouchableOpacity
                              key={curso.id}
                              style={[styles.cursoOption, form.cursoId === curso.id && styles.cursoOptionActive]}
                              onPress={() => set('cursoId', curso.id)}
                              activeOpacity={0.75}
                            >
                              {form.cursoId === curso.id && (
                                <Ionicons name="checkmark-circle" size={15} color={Colors.accent} style={{ marginRight: 6 }} />
                              )}
                              <View style={{ flex: 1 }}>
                                <Text style={[styles.cursoOptionNome, form.cursoId === curso.id && styles.cursoOptionNomeActive]}>
                                  {curso.nome}
                                </Text>
                                {!!curso.codigo && (
                                  <Text style={styles.cursoOptionCodigo}>{curso.codigo}</Text>
                                )}
                              </View>
                            </TouchableOpacity>
                          ))}
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              )}

              <View style={styles.sectionLabel}>
                <Ionicons name="people-outline" size={12} color={Colors.textMuted} />
                <Text style={styles.sectionLabelText}>Encarregado de Educação</Text>
              </View>

              <InputField label="Nome do Encarregado" value={form.nomeEncarregado} onChangeText={v => { set('nomeEncarregado', v); if (fieldErrors.nomeEncarregado) setFieldErrors(e => ({ ...e, nomeEncarregado: '' })); }} placeholder="Nome completo do encarregado" required error={fieldErrors.nomeEncarregado} />
              <InputField label="Telefone de Contacto" value={form.telefoneEncarregado} onChangeText={v => { set('telefoneEncarregado', v); if (fieldErrors.telefoneEncarregado) setFieldErrors(e => ({ ...e, telefoneEncarregado: '' })); }} placeholder="+244 9XX XXX XXX" required keyboardType="phone-pad" autoCapitalize="none" error={fieldErrors.telefoneEncarregado} />
              <InputField label="Observações Adicionais" value={form.observacoes} onChangeText={v => set('observacoes', v)} placeholder="Necessidades especiais, transferência, etc..." multiline />

              <View style={styles.approvalNotice}>
                <View style={styles.approvalNoticeHeader}>
                  <Ionicons name="shield-checkmark-outline" size={15} color={Colors.gold} />
                  <Text style={styles.approvalNoticeTitle}>Processo de Admissão</Text>
                </View>
                <Text style={styles.approvalNoticeText}>
                  Após submissão receberá credenciais de acesso provisório para acompanhar o processo de admissão:
                </Text>
                <View style={styles.approvalSteps}>
                  {['Pagamento da taxa de inscrição', 'Análise da candidatura', 'Exame de admissão', 'Publicação de resultados', 'Completar matrícula'].map((s, i) => (
                    <View key={i} style={styles.approvalStep}>
                      <View style={styles.approvalStepNum}><Text style={styles.approvalStepNumText}>{i + 1}</Text></View>
                      <Text style={styles.approvalStepText}>{s}</Text>
                    </View>
                  ))}
                </View>
              </View>
            </View>
          )}
        </ScrollView>

        {!!errorMsg && (
          <View style={styles.errorBanner}>
            <Ionicons name="alert-circle-outline" size={16} color="#fff" />
            <Text style={styles.errorBannerText}>{errorMsg}</Text>
          </View>
        )}

        <View style={[styles.footer, { paddingBottom: bottomPad + 16 }]}>
          <View style={styles.footerActions}>
            {step > 1 && (
              <TouchableOpacity style={styles.prevBtn} onPress={() => setStep(s => s - 1)} activeOpacity={0.8}>
                <Ionicons name="arrow-back" size={16} color={Colors.textSecondary} />
                <Text style={styles.prevBtnText}>Anterior</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[styles.nextBtn, isLoading && styles.nextBtnDisabled]}
              onPress={handleNext}
              disabled={isLoading}
              activeOpacity={0.88}
            >
              <LinearGradient
                colors={step === 3 ? [Colors.success, '#27AE60'] : ['#1A5276', '#2980B9']}
                style={styles.nextBtnGrad}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                {isLoading
                  ? <Text style={styles.nextBtnText}>A enviar...</Text>
                  : <>
                      <Text style={styles.nextBtnText}>{step === 3 ? 'Submeter Inscrição' : 'Continuar'}</Text>
                      <Ionicons name={step === 3 ? 'checkmark-circle-outline' : 'arrow-forward'} size={17} color="#fff" />
                    </>
                }
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>

      <CredenciaisModal
        visible={!!credenciais}
        dados={credenciais}
        onClose={() => { setCredenciais(null); router.replace('/login-provisorio' as any); }}
      />
    </View>
  );
}

const nifBtnStyleReg = {
  width: 44, height: 44, borderRadius: 10, backgroundColor: Colors.accent,
  alignItems: 'center' as const, justifyContent: 'center' as const,
};
const nifBadgeStyleReg = {
  flexDirection: 'row' as const, alignItems: 'center' as const, gap: 5,
  marginTop: 6, paddingHorizontal: 10, paddingVertical: 6,
  borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.04)',
};
const nifBadgeTxtReg = {
  fontSize: 12, fontFamily: 'Inter_500Medium', flex: 1,
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { paddingBottom: 20 },
  headerTop: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 18, gap: 12 },
  backBtn: { width: 38, height: 38, borderRadius: 11, backgroundColor: 'rgba(255,255,255,0.07)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  headerTexts: { flex: 1 },
  headerTitle: { fontSize: 17, fontFamily: 'Inter_700Bold', color: Colors.text },
  headerSubtitle: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 2 },

  stepsContainer: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 4 },
  stepItem: { alignItems: 'center', gap: 4 },
  stepLine: { flex: 1, height: 2, backgroundColor: 'rgba(255,255,255,0.1)', marginBottom: 16 },
  stepLineDone: { backgroundColor: Colors.success },
  stepCircle: { width: 26, height: 26, borderRadius: 13, backgroundColor: Colors.backgroundElevated, borderWidth: 2, borderColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  stepCircleActive: { borderColor: '#2980B9', backgroundColor: 'rgba(41,128,185,0.15)' },
  stepCircleDone: { backgroundColor: Colors.success, borderColor: Colors.success },
  stepNum: { fontSize: 11, fontFamily: 'Inter_700Bold', color: Colors.textMuted },
  stepNumActive: { color: '#2980B9' },
  stepLabel: { fontSize: 9, fontFamily: 'Inter_500Medium', color: Colors.textMuted, textAlign: 'center' },
  stepLabelActive: { color: Colors.text },

  scroll: { flex: 1 },
  scrollContent: { padding: 16, gap: 0, maxWidth: 480, width: '100%', alignSelf: 'center' },
  stepCard: { backgroundColor: Colors.backgroundCard, borderRadius: 18, borderWidth: 1, borderColor: Colors.border, padding: 20, gap: 20 },
  stepCardHead: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: Colors.border },
  stepCardIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  stepCardTitle: { fontSize: 15, fontFamily: 'Inter_700Bold', color: Colors.text },

  emailAlertBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: 'rgba(243,156,18,0.08)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(243,156,18,0.3)',
    padding: 12,
  },
  emailAlertText: {
    flex: 1,
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    color: 'rgba(255,255,255,0.7)',
    lineHeight: 18,
  },

  fieldGroup: { gap: 7 },
  fieldLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  fieldLabel: { fontSize: 11, fontFamily: 'Inter_600SemiBold', color: 'rgba(255,255,255,0.45)', letterSpacing: 0.7, textTransform: 'uppercase' },
  fieldRequired: { fontSize: 12, color: Colors.accent, fontFamily: 'Inter_700Bold' },
  fieldHint: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: -3 },
  inputWrap: { backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 12, borderWidth: 1.5, borderColor: Colors.border, paddingHorizontal: 14, height: 52, justifyContent: 'center' },
  inputWrapFocused: { borderColor: Colors.gold, backgroundColor: 'rgba(240,165,0,0.04)' },
  inputWrapMulti: { height: 110, paddingVertical: 12, justifyContent: 'flex-start' },
  inputWrapError: { borderColor: Colors.danger, backgroundColor: 'rgba(231,76,60,0.04)' },
  fieldError: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.danger, marginTop: 4 },
  input: { fontSize: 15, fontFamily: 'Inter_400Regular', color: Colors.text },
  inputMulti: { textAlignVertical: 'top', lineHeight: 22 },

  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 13, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.12)', backgroundColor: 'rgba(255,255,255,0.04)' },
  chipActive: { backgroundColor: 'rgba(204,26,26,0.12)', borderColor: Colors.accent },
  chipText: { fontSize: 13, fontFamily: 'Inter_500Medium', color: Colors.textSecondary },
  chipTextActive: { color: Colors.accent, fontFamily: 'Inter_700Bold' },

  sectionLabel: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: 4, paddingBottom: 2, borderTopWidth: 1, borderTopColor: Colors.border, marginTop: 4 },
  sectionLabelText: { fontSize: 11, fontFamily: 'Inter_600SemiBold', color: Colors.textMuted, letterSpacing: 0.5, textTransform: 'uppercase' },

  approvalNotice: { backgroundColor: 'rgba(240,165,0,0.06)', borderRadius: 14, borderWidth: 1, borderColor: 'rgba(240,165,0,0.18)', padding: 16, gap: 12, marginTop: 4 },
  approvalNoticeHeader: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  approvalNoticeTitle: { fontSize: 13, fontFamily: 'Inter_700Bold', color: Colors.gold },
  approvalNoticeText: { fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textSecondary, lineHeight: 18 },
  approvalSteps: { gap: 8 },
  approvalStep: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  approvalStepNum: { width: 20, height: 20, borderRadius: 10, backgroundColor: 'rgba(240,165,0,0.2)', alignItems: 'center', justifyContent: 'center' },
  approvalStepNumText: { fontSize: 10, fontFamily: 'Inter_700Bold', color: Colors.gold },
  approvalStepText: { fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textSecondary, flex: 1 },

  cursoGrid: { gap: 10 },
  cursoAreaGroup: { gap: 6 },
  cursoAreaLabel: { fontSize: 10, fontFamily: 'Inter_600SemiBold', color: Colors.gold, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 2 },
  cursoOption: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 11, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.1)', paddingHorizontal: 14, paddingVertical: 12 },
  cursoOptionActive: { backgroundColor: 'rgba(204,26,26,0.1)', borderColor: Colors.accent },
  cursoOptionNome: { fontSize: 13, fontFamily: 'Inter_500Medium', color: Colors.textSecondary },
  cursoOptionNomeActive: { color: Colors.text, fontFamily: 'Inter_600SemiBold' },
  cursoOptionCodigo: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 1 },
  cursoLoadingBox: { backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 10, borderWidth: 1, borderColor: Colors.border, padding: 16, alignItems: 'center' },
  cursoLoadingText: { fontSize: 13, fontFamily: 'Inter_400Regular', color: Colors.textMuted },
  cursoEmptyBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 10, borderWidth: 1, borderColor: Colors.border, padding: 14 },
  cursoEmptyText: { fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textMuted, flex: 1 },

  errorBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#C0392B', paddingHorizontal: 16, paddingVertical: 12, marginHorizontal: 16, marginBottom: 8, borderRadius: 10 },
  errorBannerText: { flex: 1, fontSize: 13, fontFamily: 'Inter_500Medium', color: '#fff' },
  footer: { backgroundColor: Colors.primaryDark, borderTopWidth: 1, borderTopColor: Colors.border, padding: 16, paddingTop: 12, alignItems: 'center' },
  footerActions: { flexDirection: 'row', gap: 12, maxWidth: 480, width: '100%' },
  prevBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 18, paddingVertical: 15, borderRadius: 13, borderWidth: 1, borderColor: Colors.border, backgroundColor: 'rgba(255,255,255,0.05)' },
  prevBtnText: { fontSize: 14, fontFamily: 'Inter_600SemiBold', color: Colors.textSecondary },
  nextBtn: { flex: 1, borderRadius: 13, overflow: 'hidden' },
  nextBtnDisabled: { opacity: 0.6 },
  nextBtnGrad: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 16, gap: 8 },
  nextBtnText: { fontSize: 15, fontFamily: 'Inter_700Bold', color: '#fff', letterSpacing: 0.1 },
});

const credStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  container: { backgroundColor: '#0F1F40', borderRadius: 24, padding: 28, width: '100%', maxWidth: 420, alignItems: 'center', gap: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' },
  iconCircle: { width: 72, height: 72, borderRadius: 36, backgroundColor: 'rgba(39,174,96,0.15)', alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 22, fontFamily: 'Inter_700Bold', color: Colors.text, textAlign: 'center' },
  subtitle: { fontSize: 13, fontFamily: 'Inter_400Regular', color: Colors.textSecondary, textAlign: 'center', lineHeight: 20 },
  box: { width: '100%', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 14, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  rowLabel: { fontSize: 10, fontFamily: 'Inter_600SemiBold', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  rowValue: { fontSize: 15, fontFamily: 'Inter_700Bold', color: Colors.text, marginTop: 2 },
  divider: { height: 1, backgroundColor: Colors.border },
  notice: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: 12, width: '100%' },
  noticeText: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted, flex: 1, lineHeight: 17 },
  btn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.success, paddingVertical: 14, paddingHorizontal: 24, borderRadius: 13, width: '100%', justifyContent: 'center' },
  btnText: { fontSize: 14, fontFamily: 'Inter_700Bold', color: '#fff' },
});
