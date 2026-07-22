import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Modal, View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, ActivityIndicator, Platform, KeyboardAvoidingView,
  Animated, Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/colors';
import { getAuthToken } from '@/context/AuthContext';
import { alertSucesso, alertErro } from '@/utils/toast';

const { width: SW } = Dimensions.get('window');

// ─── Dados estáticos ──────────────────────────────────────────────────────────
const PROVINCIAS_AO = [
  'Bengo','Benguela','Bié','Cabinda','Cuando Cubango','Cuanza Norte','Cuanza Sul',
  'Cunene','Huambo','Huíla','Luanda','Lunda Norte','Lunda Sul','Malanje','Moxico',
  'Namibe','Uíge','Zaire',
];
const HABILITACOES  = ['Básico','Médio','Médio-Técnico','Bacharelato','Licenciatura','Mestrado','Doutoramento'];
const NIVEL_ENSINO  = ['Primário','I Ciclo','II Ciclo'];
const GENERO_OPT    = [{ val: 'M', label: 'Masculino', icon: 'male' }, { val: 'F', label: 'Feminino', icon: 'female' }] as const;

// ─── Tipos ────────────────────────────────────────────────────────────────────
interface DadosFaltaInfo {
  temDadosFalta: boolean;
  role: string;
  camposFalta: string[];
  perfil: Record<string, any>;
  lookup?: { disciplinas?: { id: string; nome: string }[]; departamentos?: string[] };
}

interface Props {
  visible: boolean;
  info: DadosFaltaInfo | null;
  onCompleted: () => void;
  onSkip: () => void;
  skipsLeft: number;
}

interface WizardStep {
  id: string;
  label: string;
  icon: string;
  fields: string[];
}

// ─── Wizard step definitions ──────────────────────────────────────────────────
function buildSteps(role: string, campos: string[]): WizardStep[] {
  const has = (f: string) => campos.includes(f);

  if (role === 'professor') {
    const steps: WizardStep[] = [];
    if (has('telefone')) steps.push({ id: 'contacto', label: 'Contacto', icon: 'call', fields: ['telefone'] });
    const profFields = ['habilitacoes', 'nivelEnsino'].filter(f => has(f) || f === 'nivelEnsino');
    if (profFields.length) steps.push({ id: 'profissional', label: 'Profissional', icon: 'school', fields: profFields });
    if (has('disciplinas')) steps.push({ id: 'disciplinas', label: 'Disciplinas', icon: 'book', fields: ['disciplinas'] });
    return steps.length ? steps : [{ id: 'contacto', label: 'Dados', icon: 'person', fields: campos }];
  }
  if (role === 'rh' || role === 'financeiro') {
    const steps: WizardStep[] = [];
    const pessoais = ['dataNascimento','genero','bi','telefone'].filter(has);
    if (pessoais.length) steps.push({ id: 'pessoal', label: 'Pessoal', icon: 'person', fields: pessoais });
    const prof = ['departamento','cargo','habilitacoes'].filter(has);
    if (prof.length) steps.push({ id: 'profissional', label: 'Profissional', icon: 'briefcase', fields: prof });
    return steps.length ? steps : [{ id: 'dados', label: 'Dados', icon: 'person', fields: campos }];
  }
  // aluno
  const steps: WizardStep[] = [];
  const id_ = ['nome','apelido','dataNascimento','genero'].filter(has);
  if (id_.length) steps.push({ id: 'identidade', label: 'Identidade', icon: 'finger-print', fields: id_ });
  const loc = ['provincia','municipio','numeroBi'].filter(has);
  if (loc.length) steps.push({ id: 'localizacao', label: 'Localização', icon: 'location', fields: loc });
  const enc = ['nomeEncarregado','telefoneEncarregado'].filter(has);
  if (enc.length) steps.push({ id: 'encarregado', label: 'Encarregado', icon: 'people', fields: enc });
  return steps.length ? steps : [{ id: 'dados', label: 'Dados', icon: 'person', fields: campos }];
}

// ─── Primitivos de UI ─────────────────────────────────────────────────────────
function StyledInput({
  label, value, onChange, placeholder, required, error,
  keyboardType = 'default', autoCapitalize = 'sentences', secureTextEntry,
}: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; required?: boolean; error?: string;
  keyboardType?: any; autoCapitalize?: any; secureTextEntry?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={inp.wrap}>
      <Text style={inp.label}>
        {label}
        {required && <Text style={{ color: Colors.danger }}> *</Text>}
      </Text>
      <View style={[inp.box, focused && inp.boxFocused, !!error && inp.boxError]}>
        <TextInput
          style={inp.text}
          value={value}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor={Colors.textMuted}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          secureTextEntry={secureTextEntry}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
        />
        {!!error && <Ionicons name="alert-circle" size={16} color={Colors.danger} style={{ marginRight: 2 }} />}
      </View>
      {!!error && <Text style={inp.errorText}>{error}</Text>}
    </View>
  );
}

function GeneroSelector({ value, onChange, error }: { value: string; onChange: (v: string) => void; error?: string }) {
  return (
    <View style={inp.wrap}>
      <Text style={inp.label}>Género <Text style={{ color: Colors.danger }}>*</Text></Text>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        {GENERO_OPT.map(g => {
          const active = value === g.val;
          return (
            <TouchableOpacity
              key={g.val}
              style={[gen.btn, active && gen.btnActive]}
              onPress={() => onChange(g.val)}
              activeOpacity={0.8}
            >
              <Ionicons name={g.icon as any} size={16} color={active ? '#fff' : Colors.textMuted} />
              <Text style={[gen.text, active && { color: '#fff' }]}>{g.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      {!!error && <Text style={inp.errorText}>{error}</Text>}
    </View>
  );
}

function PickerField({ label, options, value, onChange, required, error }: {
  label: string; options: string[]; value: string;
  onChange: (v: string) => void; required?: boolean; error?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <View style={inp.wrap}>
      <Text style={inp.label}>
        {label}
        {required && <Text style={{ color: Colors.danger }}> *</Text>}
      </Text>
      <TouchableOpacity
        style={[inp.box, !!error && inp.boxError, { justifyContent: 'space-between', flexDirection: 'row', alignItems: 'center' }]}
        onPress={() => setOpen(o => !o)}
        activeOpacity={0.85}
      >
        <Text style={[inp.text, { flex: 1 }, !value && { color: Colors.textMuted }]}>
          {value || `Seleccionar…`}
        </Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={14} color={Colors.textMuted} />
      </TouchableOpacity>
      {open && (
        <View style={pick.list}>
          <ScrollView style={{ maxHeight: 180 }} showsVerticalScrollIndicator={false} nestedScrollEnabled>
            {options.map(opt => {
              const sel = opt === value;
              return (
                <TouchableOpacity
                  key={opt}
                  style={[pick.item, sel && pick.itemActive]}
                  onPress={() => { onChange(opt); setOpen(false); }}
                >
                  <Text style={[pick.itemText, sel && { color: Colors.gold }]}>{opt}</Text>
                  {sel && <Ionicons name="checkmark" size={14} color={Colors.gold} />}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}
      {!!error && <Text style={inp.errorText}>{error}</Text>}
    </View>
  );
}

function MultiDiscSelect({ disciplinas, selected, onChange, error }: {
  disciplinas: { id: string; nome: string }[];
  selected: string[];
  onChange: (v: string[]) => void;
  error?: string;
}) {
  const toggle = (nome: string) =>
    selected.includes(nome) ? onChange(selected.filter(s => s !== nome)) : onChange([...selected, nome]);

  return (
    <View style={inp.wrap}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <Text style={inp.label}>
          Disciplinas que Lecciona <Text style={{ color: Colors.danger }}>*</Text>
        </Text>
        {selected.length > 0 && (
          <View style={mds.badge}>
            <Text style={mds.badgeText}>{selected.length} seleccionada{selected.length !== 1 ? 's' : ''}</Text>
          </View>
        )}
      </View>
      <ScrollView style={mds.scroll} showsVerticalScrollIndicator={false} nestedScrollEnabled>
        <View style={mds.grid}>
          {disciplinas.map(d => {
            const on = selected.includes(d.nome);
            return (
              <TouchableOpacity
                key={d.id}
                style={[mds.chip, on && mds.chipOn]}
                onPress={() => toggle(d.nome)}
                activeOpacity={0.8}
              >
                {on && <Ionicons name="checkmark-circle" size={12} color={Colors.gold} style={{ marginRight: 4 }} />}
                <Text style={[mds.chipText, on && mds.chipTextOn]} numberOfLines={1}>{d.nome}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>
      {!!error && <Text style={inp.errorText}>{error}</Text>}
    </View>
  );
}

// ─── Progress Bar ─────────────────────────────────────────────────────────────
function WizardProgress({ steps, current, accent }: { steps: WizardStep[]; current: number; accent: string }) {
  const total = steps.length;
  if (total <= 1) return null;

  return (
    <View style={prog.wrap}>
      {steps.map((s, i) => {
        const done    = i < current;
        const active  = i === current;
        const c       = done || active ? accent : Colors.border;
        return (
          <React.Fragment key={s.id}>
            <View style={prog.step}>
              <View style={[prog.dot, { borderColor: c, backgroundColor: done ? accent : active ? accent + '28' : 'transparent' }]}>
                {done
                  ? <Ionicons name="checkmark" size={10} color="#fff" />
                  : <Text style={[prog.dotNum, { color: active ? accent : Colors.textMuted }]}>{i + 1}</Text>
                }
              </View>
              <Text style={[prog.label, active && { color: accent }, done && { color: accent + 'BB' }]}>{s.label}</Text>
            </View>
            {i < total - 1 && (
              <View style={[prog.line, { backgroundColor: done ? accent : Colors.border }]} />
            )}
          </React.Fragment>
        );
      })}
    </View>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function DadosFaltaModal({ visible, info, onCompleted, onSkip, skipsLeft }: Props) {
  const [form,    setForm]    = useState<Record<string, any>>({});
  const [errors,  setErrors]  = useState<Record<string, string>>({});
  const [saving,  setSaving]  = useState(false);
  const [step,    setStep]    = useState(0);
  const fadeAnim  = useRef(new Animated.Value(1)).current;
  const slideAnim = useRef(new Animated.Value(0)).current;

  const role   = info?.role ?? '';
  const campos = info?.camposFalta ?? [];
  const steps  = buildSteps(role, campos);
  const isLast = step === steps.length - 1;

  const accentColor = role === 'professor' ? Colors.info
    : (role === 'rh' || role === 'financeiro') ? '#F97316'
    : Colors.success;

  useEffect(() => {
    if (info?.perfil) {
      const initial: Record<string, any> = {};
      campos.forEach(f => { initial[f] = info.perfil[f] ?? ''; });
      if (role === 'professor' && campos.includes('disciplinas'))
        initial.disciplinas = Array.isArray(info.perfil.disciplinas) ? info.perfil.disciplinas : [];
      setForm(initial);
      setErrors({});
      setStep(0);
    }
  }, [info]);

  const set = useCallback((key: string, val: any) => {
    setForm(prev => ({ ...prev, [key]: val }));
    setErrors(prev => { const e = { ...prev }; delete e[key]; return e; });
  }, []);

  function animateTransition(dir: 1 | -1, cb: () => void) {
    const DIST = 28;
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 0, duration: 110, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: -DIST * dir, duration: 110, useNativeDriver: true }),
    ]).start(() => {
      cb();
      slideAnim.setValue(DIST * dir);
      Animated.parallel([
        Animated.timing(fadeAnim,  { toValue: 1, duration: 190, useNativeDriver: true }),
        Animated.timing(slideAnim, { toValue: 0, duration: 190, useNativeDriver: true }),
      ]).start();
    });
  }

  function validateStep(idx: number): boolean {
    const e: Record<string, string> = {};
    const s = steps[idx];
    if (!s) return true;

    s.fields.forEach(f => {
      const v = form[f];
      if (f === 'disciplinas') {
        if (!Array.isArray(v) || v.length === 0) e[f] = 'Seleccione pelo menos uma disciplina';
      } else if (f === 'genero') {
        if (!v) e[f] = 'Seleccione o género';
      } else if (f === 'nivelEnsino') {
        // optional field
      } else {
        if (!v?.toString().trim()) e[f] = 'Campo obrigatório';
      }
    });

    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function handleNext() {
    if (!validateStep(step)) return;
    if (isLast) { handleSave(); return; }
    animateTransition(1, () => setStep(s => s + 1));
  }

  function handleBack() {
    if (step === 0) return;
    animateTransition(-1, () => setStep(s => s - 1));
  }

  async function handleSave() {
    if (!validateStep(step)) return;
    setSaving(true);
    try {
      const token = await getAuthToken();
      const res = await fetch('/api/meu-perfil/completar-dados', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) { alertErro('Erro', data.error ?? 'Erro ao guardar dados.'); return; }
      alertSucesso('Guardado', 'Perfil actualizado com sucesso!');
      setTimeout(() => onCompleted(), 700);
    } catch {
      alertErro('Erro', 'Não foi possível contactar o servidor.');
    } finally {
      setSaving(false);
    }
  }

  if (!info) return null;

  const currentStep = steps[step];
  const roleLabel   = role === 'professor' ? 'Professor' : (role === 'rh' || role === 'financeiro') ? 'Funcionário' : 'Aluno';

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
      <KeyboardAvoidingView
        style={s.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={s.card}>

          {/* ── Top accent bar ──────────────────────────────────────────── */}
          <View style={[s.topBar, { backgroundColor: accentColor }]} />

          {/* ── Header ──────────────────────────────────────────────────── */}
          <View style={s.header}>
            <View style={[s.headerIconWrap, { backgroundColor: accentColor + '1A' }]}>
              <Ionicons name={currentStep?.icon as any ?? 'person'} size={20} color={accentColor} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.headerTitle}>Perfil Incompleto</Text>
              <Text style={s.headerSub}>
                {steps.length > 1
                  ? `Passo ${step + 1} de ${steps.length} — ${currentStep?.label}`
                  : `Complete o seu perfil de ${roleLabel}`}
              </Text>
            </View>
            <View style={[s.rolePill, { borderColor: accentColor + '44' }]}>
              <Text style={[s.rolePillText, { color: accentColor }]}>{roleLabel}</Text>
            </View>
          </View>

          {/* ── Progress ─────────────────────────────────────────────────── */}
          <WizardProgress steps={steps} current={step} accent={accentColor} />

          {/* ── Fields ───────────────────────────────────────────────────── */}
          <Animated.View style={[s.body, { opacity: fadeAnim, transform: [{ translateX: slideAnim }] }]}>
            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingBottom: 8 }}
            >
              {renderStepFields(currentStep, form, errors, set, info)}
            </ScrollView>
          </Animated.View>

          {/* ── Skip warning ─────────────────────────────────────────────── */}
          {skipsLeft > 0 && skipsLeft <= 2 && (
            <View style={s.skipWarn}>
              <Ionicons name="time-outline" size={13} color={Colors.warning} />
              <Text style={s.skipWarnText}>
                {skipsLeft} tentativa{skipsLeft !== 1 ? 's' : ''} restante{skipsLeft !== 1 ? 's' : ''} para adiar
              </Text>
            </View>
          )}
          {skipsLeft === 0 && (
            <View style={[s.skipWarn, { backgroundColor: Colors.danger + '18', borderColor: Colors.danger + '35' }]}>
              <Ionicons name="lock-closed" size={13} color={Colors.danger} />
              <Text style={[s.skipWarnText, { color: Colors.danger }]}>
                Preenchimento obrigatório para continuar
              </Text>
            </View>
          )}

          {/* ── Footer / Navigation ──────────────────────────────────────── */}
          <View style={s.footer}>
            <View style={s.footerLeft}>
              {step > 0 ? (
                <TouchableOpacity style={s.btnBack} onPress={handleBack} activeOpacity={0.8}>
                  <Ionicons name="arrow-back" size={15} color={Colors.textSecondary} />
                  <Text style={s.btnBackText}>Voltar</Text>
                </TouchableOpacity>
              ) : skipsLeft > 0 ? (
                <TouchableOpacity style={s.btnSkip} onPress={onSkip} activeOpacity={0.8}>
                  <Text style={s.btnSkipText}>Preencher depois</Text>
                </TouchableOpacity>
              ) : null}
            </View>

            {/* Dot indicators */}
            {steps.length > 1 && (
              <View style={s.dots}>
                {steps.map((_, i) => (
                  <View
                    key={i}
                    style={[s.dot, i === step && { backgroundColor: accentColor, width: 16 }]}
                  />
                ))}
              </View>
            )}

            <TouchableOpacity
              style={[s.btnNext, { backgroundColor: accentColor }, saving && { opacity: 0.65 }]}
              onPress={handleNext}
              disabled={saving}
              activeOpacity={0.85}
            >
              {saving ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : isLast ? (
                <>
                  <Ionicons name="checkmark-circle" size={15} color="#fff" />
                  <Text style={s.btnNextText}>Guardar</Text>
                </>
              ) : (
                <>
                  <Text style={s.btnNextText}>Seguinte</Text>
                  <Ionicons name="arrow-forward" size={15} color="#fff" />
                </>
              )}
            </TouchableOpacity>
          </View>

        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Step field renderer (fora do componente para não re-criar) ───────────────
function renderStepFields(
  step: WizardStep | undefined,
  form: Record<string, any>,
  errors: Record<string, string>,
  set: (k: string, v: any) => void,
  info: DadosFaltaInfo,
) {
  if (!step) return null;
  const campos = info.camposFalta;
  const has = (f: string) => campos.includes(f) && step.fields.includes(f);

  return (
    <>
      {/* ── Contacto / Pessoal ── */}
      {has('nome') && (
        <StyledInput label="Nome Próprio" value={form.nome ?? ''} onChange={v => set('nome', v)}
          placeholder="Ex: João" required error={errors.nome} autoCapitalize="words" />
      )}
      {has('apelido') && (
        <StyledInput label="Apelido" value={form.apelido ?? ''} onChange={v => set('apelido', v)}
          placeholder="Ex: Silva" required error={errors.apelido} autoCapitalize="words" />
      )}
      {has('telefone') && (
        <StyledInput label="Telefone" value={form.telefone ?? ''} onChange={v => set('telefone', v)}
          placeholder="923 456 789" required error={errors.telefone} keyboardType="phone-pad" autoCapitalize="none" />
      )}
      {has('dataNascimento') && (
        <StyledInput label="Data de Nascimento" value={form.dataNascimento ?? ''} onChange={v => set('dataNascimento', v)}
          placeholder="AAAA-MM-DD" required error={errors.dataNascimento} autoCapitalize="none" />
      )}
      {has('genero') && (
        <GeneroSelector value={form.genero ?? ''} onChange={v => set('genero', v)} error={errors.genero} />
      )}
      {has('bi') && (
        <StyledInput label="Bilhete de Identidade" value={form.bi ?? ''} onChange={v => set('bi', v.toUpperCase())}
          placeholder="000000000LA000" error={errors.bi} autoCapitalize="characters" />
      )}
      {has('numeroBi') && (
        <StyledInput label="Número do BI (opcional)" value={form.numeroBi ?? ''} onChange={v => set('numeroBi', v.toUpperCase())}
          placeholder="000000000LA000" autoCapitalize="characters" />
      )}

      {/* ── Profissional ── */}
      {has('habilitacoes') && (
        <PickerField label="Habilitações Académicas" options={HABILITACOES}
          value={form.habilitacoes ?? ''} onChange={v => set('habilitacoes', v)}
          required error={errors.habilitacoes} />
      )}
      {has('nivelEnsino') && (
        <PickerField label="Nível de Ensino" options={NIVEL_ENSINO}
          value={form.nivelEnsino ?? (info.perfil.nivelEnsino ?? '')}
          onChange={v => set('nivelEnsino', v)} />
      )}
      {/* Nível de ensino também acessível na step profissional mesmo sem estar em camposFalta */}
      {step.fields.includes('nivelEnsino') && !campos.includes('nivelEnsino') && (
        <PickerField label="Nível de Ensino" options={NIVEL_ENSINO}
          value={form.nivelEnsino ?? (info.perfil.nivelEnsino ?? '')}
          onChange={v => set('nivelEnsino', v)} />
      )}
      {has('departamento') && (
        <>
          <StyledInput label="Departamento" value={form.departamento ?? ''} onChange={v => set('departamento', v)}
            placeholder="Ex: Secretaria, Pedagógico…" required error={errors.departamento} autoCapitalize="words" />
          {(info.lookup?.departamentos ?? []).length > 0 && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: -4, marginBottom: 10 }}>
              {(info.lookup?.departamentos ?? []).map(d => (
                <TouchableOpacity key={d} onPress={() => set('departamento', d)} style={sugg.chip}>
                  <Text style={sugg.text}>{d}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </>
      )}
      {has('cargo') && (
        <StyledInput label="Cargo" value={form.cargo ?? ''} onChange={v => set('cargo', v)}
          placeholder="Ex: Auxiliar Administrativo" required error={errors.cargo} autoCapitalize="words" />
      )}

      {/* ── Disciplinas ── */}
      {has('disciplinas') && (
        <MultiDiscSelect
          disciplinas={info.lookup?.disciplinas ?? []}
          selected={Array.isArray(form.disciplinas) ? form.disciplinas : []}
          onChange={v => set('disciplinas', v)}
          error={errors.disciplinas}
        />
      )}

      {/* ── Localização ── */}
      {has('provincia') && (
        <PickerField label="Província" options={PROVINCIAS_AO}
          value={form.provincia ?? ''} onChange={v => set('provincia', v)}
          required error={errors.provincia} />
      )}
      {has('municipio') && (
        <StyledInput label="Município" value={form.municipio ?? ''} onChange={v => set('municipio', v)}
          placeholder="Ex: Viana, Cacuaco…" required error={errors.municipio} autoCapitalize="words" />
      )}

      {/* ── Encarregado ── */}
      {has('nomeEncarregado') && (
        <StyledInput label="Nome do Encarregado" value={form.nomeEncarregado ?? ''} onChange={v => set('nomeEncarregado', v)}
          placeholder="Nome completo" required error={errors.nomeEncarregado} autoCapitalize="words" />
      )}
      {has('telefoneEncarregado') && (
        <StyledInput label="Telefone do Encarregado" value={form.telefoneEncarregado ?? ''} onChange={v => set('telefoneEncarregado', v)}
          placeholder="923 456 789" required error={errors.telefoneEncarregado} keyboardType="phone-pad" autoCapitalize="none" />
      )}

      {/* ── Aviso aluno — enquadramento académico ── */}
      {info.role === 'aluno' && (
        <View style={notice.wrap}>
          <Ionicons name="information-circle-outline" size={14} color={Colors.info} />
          <Text style={notice.text}>
            O enquadramento académico (turma, curso, classe) será definido pelo administrador após validação do seu registo.
          </Text>
        </View>
      )}
    </>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(5,14,28,0.82)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 460,
    backgroundColor: '#0F2236',
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    maxHeight: '90%',
    ...(Platform.OS === 'web' ? { boxShadow: '0 24px 64px rgba(0,0,0,0.7)' } as any : {
      shadowColor: '#000', shadowOffset: { width: 0, height: 20 }, shadowOpacity: 0.6, shadowRadius: 40, elevation: 30,
    }),
  },
  topBar: { height: 3, width: '100%' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  headerIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 15,
    color: Colors.text,
    letterSpacing: -0.3,
  },
  headerSub: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11.5,
    color: Colors.textMuted,
    marginTop: 1,
  },
  rolePill: {
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  rolePillText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 10.5,
    letterSpacing: 0.3,
  },
  body: {
    paddingHorizontal: 20,
    paddingTop: 14,
    maxHeight: 340,
  },
  skipWarn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginHorizontal: 20,
    marginBottom: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    backgroundColor: 'rgba(212,146,14,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(212,146,14,0.25)',
    borderRadius: 8,
  },
  skipWarnText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11.5,
    color: Colors.warning,
    flex: 1,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  footerLeft: { flex: 1 },
  dots: { flexDirection: 'row', gap: 5, alignItems: 'center' },
  dot: {
    width: 6, height: 6, borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.18)',
    ...(Platform.OS === 'web' ? { transition: 'width 0.2s ease, background-color 0.2s ease' } as any : {}),
  },
  btnBack: { flexDirection: 'row', alignItems: 'center', gap: 4, padding: 4 },
  btnBackText: { fontFamily: 'Inter_500Medium', fontSize: 13, color: Colors.textSecondary },
  btnSkip: { padding: 4 },
  btnSkipText: { fontFamily: 'Inter_400Regular', fontSize: 12.5, color: Colors.textMuted, textDecorationLine: 'underline' },
  btnNext: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 18, paddingVertical: 10,
    borderRadius: 10, minWidth: 110, justifyContent: 'center',
  },
  btnNextText: { fontFamily: 'Inter_600SemiBold', fontSize: 13, color: '#fff' },
});

// Progress bar
const prog = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 10,
  },
  step: { alignItems: 'center', gap: 4 },
  dot: {
    width: 22, height: 22, borderRadius: 11,
    borderWidth: 1.5, alignItems: 'center', justifyContent: 'center',
  },
  dotNum: { fontFamily: 'Inter_700Bold', fontSize: 10 },
  label: { fontFamily: 'Inter_500Medium', fontSize: 9.5, color: Colors.textMuted, textAlign: 'center' },
  line: { flex: 1, height: 1.5, marginBottom: 14, marginHorizontal: 4 },
});

// Input primitives
const inp = StyleSheet.create({
  wrap: { marginBottom: 12 },
  label: { fontFamily: 'Inter_500Medium', fontSize: 12, color: Colors.textSecondary, marginBottom: 6 },
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#162B44',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 12 : 0,
    minHeight: 44,
  },
  boxFocused: { borderColor: Colors.accent + 'BB' },
  boxError: { borderColor: Colors.danger + 'AA' },
  text: {
    flex: 1,
    fontFamily: 'Inter_400Regular',
    fontSize: 13.5,
    color: Colors.text,
    paddingVertical: Platform.OS === 'android' ? 10 : 0,
  },
  errorText: { fontFamily: 'Inter_400Regular', fontSize: 11, color: Colors.danger, marginTop: 4 },
});

// Gender selector
const gen = StyleSheet.create({
  btn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 11, borderRadius: 10,
    backgroundColor: '#162B44', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.08)',
  },
  btnActive: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  text: { fontFamily: 'Inter_500Medium', fontSize: 13, color: Colors.textMuted },
});

// Picker dropdown
const pick = StyleSheet.create({
  list: {
    marginTop: 4,
    backgroundColor: '#162B44',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  item: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 14, paddingVertical: 11,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  itemActive: { backgroundColor: Colors.gold + '12' },
  itemText: { fontFamily: 'Inter_400Regular', fontSize: 13, color: Colors.textSecondary },
});

// Multi-select disciplines
const mds = StyleSheet.create({
  scroll: { maxHeight: 200 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  chip: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 10, paddingVertical: 6,
    backgroundColor: '#162B44', borderRadius: 8,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  chipOn: { borderColor: Colors.gold + '66', backgroundColor: Colors.gold + '14' },
  chipText: { fontFamily: 'Inter_400Regular', fontSize: 11.5, color: Colors.textMuted },
  chipTextOn: { fontFamily: 'Inter_600SemiBold', color: Colors.gold },
  badge: {
    backgroundColor: Colors.gold + '22', borderRadius: 10,
    paddingHorizontal: 7, paddingVertical: 2,
  },
  badgeText: { fontFamily: 'Inter_600SemiBold', fontSize: 10.5, color: Colors.gold },
});

// Suggestions
const sugg = StyleSheet.create({
  chip: {
    backgroundColor: Colors.accent + '15', borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 4,
    borderWidth: 1, borderColor: Colors.accent + '30',
  },
  text: { fontFamily: 'Inter_400Regular', fontSize: 11, color: Colors.accent },
});

// Notice box
const notice = StyleSheet.create({
  wrap: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 7,
    backgroundColor: Colors.info + '12', borderRadius: 8,
    borderWidth: 1, borderColor: Colors.info + '28',
    padding: 10, marginTop: 4,
  },
  text: { flex: 1, fontFamily: 'Inter_400Regular', fontSize: 11.5, color: Colors.info + 'CC', lineHeight: 17 },
});
