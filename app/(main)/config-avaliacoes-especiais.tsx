import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, Switch, TextInput, Platform, Alert,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '@/constants/colors';
import { useAuth } from '@/context/AuthContext';
import TopBar from '@/components/TopBar';
import { getApiBase } from '@/lib/server-config';

const ROLES_PERMITIDOS = ["ceo","pca","admin","director","pedagogico","chefe_secretaria"];

function webAlert(title: string, msg?: string) {
  if (Platform.OS === 'web') { alert(msg ? `${title}\n\n${msg}` : title); }
  else Alert.alert(title, msg);
}

interface NumField {
  label: string;
  key: string;
  min: number;
  max: number;
  hint?: string;
}

export default function ConfigAvaliacoesEspeciaisScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { token, user } = useAuth();

  const [loadingRecurso, setLoadingRecurso] = useState(true);
  const [loadingMelhoria, setLoadingMelhoria] = useState(true);
  const [savingRecurso, setSavingRecurso] = useState(false);
  const [savingMelhoria, setSavingMelhoria] = useState(false);

  const [recurso, setRecurso] = useState({
    maxNegativosRecurso: 3,
    notaMinRecurso: 6,
    notaMaxRecurso: 9,
    restricaoLPMatRecurso: true,
  });

  const [melhoria, setMelhoria] = useState({
    melhoriaNotaHabilitada: false,
    maxDisciplinasMelhoria: 5,
    prazoHorasMelhoria: 48,
    notaMinMelhoria: 10,
    notaMaxMelhoria: 16,
  });

  const apiFetch = useCallback(async (path: string, opts: any = {}) => {
    const r = await fetch(`${getApiBase()}${path}`, {
      ...opts,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(opts.headers ?? {}) },
    });
    if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error ?? r.statusText); }
    return r.json();
  }, [token]);

  useEffect(() => {
    apiFetch('/api/exame-recurso/config')
      .then(d => setRecurso(d))
      .catch(() => {})
      .finally(() => setLoadingRecurso(false));

    apiFetch('/api/melhoria-nota/config')
      .then(d => setMelhoria(d))
      .catch(() => {})
      .finally(() => setLoadingMelhoria(false));
  }, []);

  const salvarRecurso = async () => {
    setSavingRecurso(true);
    try {
      const updated = await apiFetch('/api/exame-recurso/config', {
        method: 'PUT',
        body: JSON.stringify(recurso),
      });
      setRecurso(updated);
      webAlert('Configuração guardada', 'As definições do Exame de Recurso foram actualizadas.');
    } catch (e: any) {
      webAlert('Erro', e.message);
    } finally {
      setSavingRecurso(false);
    }
  };

  const salvarMelhoria = async () => {
    setSavingMelhoria(true);
    try {
      const updated = await apiFetch('/api/melhoria-nota/config', {
        method: 'PUT',
        body: JSON.stringify(melhoria),
      });
      setMelhoria(updated);
      webAlert('Configuração guardada', 'As definições do Exame de Melhoria de Nota foram actualizadas.');
    } catch (e: any) {
      webAlert('Erro', e.message);
    } finally {
      setSavingMelhoria(false);
    }
  };

  if (!ROLES_PERMITIDOS.includes(user?.role ?? '')) {
    return (
      <View style={{ flex: 1, backgroundColor: Colors.background }}>
        <TopBar title="Configurações" onBack={() => router.back()} />
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <Ionicons name="lock-closed-outline" size={48} color={Colors.textMuted} />
          <Text style={{ color: Colors.textMuted, marginTop: 12, fontFamily: 'Inter_500Medium' }}>Sem permissão de acesso</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      <TopBar
        title="Configurações de Avaliações"
        subtitle="Recurso (Art. 33º) e Melhoria (Art. 36º)"
        onBack={() => router.back()}
      />

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40 }}>

        {/* ── EXAME DE RECURSO ────────────────────────────────────────────── */}
        <View style={s.sectionHeader}>
          <MaterialCommunityIcons name="refresh-circle" size={20} color="#f97316" />
          <Text style={[s.sectionTitle, { color: '#f97316' }]}>Exame de Recurso — Art. 33º</Text>
        </View>

        <View style={s.infoBox}>
          <Ionicons name="information-circle-outline" size={15} color="#f97316" />
          <Text style={s.infoText}>
            Define o número máximo de negativas permitidas, o intervalo de notas elegíveis e a restrição LP+Matemática para a 9ª Classe.
          </Text>
        </View>

        {loadingRecurso ? (
          <ActivityIndicator color="#f97316" style={{ marginVertical: 30 }} />
        ) : (
          <View style={s.card}>

            <NumericField
              label="Máximo de Negativas Permitidas"
              value={recurso.maxNegativosRecurso}
              onChange={v => setRecurso(r => ({ ...r, maxNegativosRecurso: v }))}
              min={1} max={5}
              hint="Alunos com mais negativas do que este valor não são elegíveis (decreto: 3)"
              color="#f97316"
            />

            <View style={s.divider} />

            <NumericField
              label="Nota Mínima do Intervalo (inclusive)"
              value={recurso.notaMinRecurso}
              onChange={v => setRecurso(r => ({ ...r, notaMinRecurso: v }))}
              min={1} max={10}
              hint="Nota mínima para ser considerada 'negativa elegível' (decreto: 6)"
              color="#f97316"
            />

            <View style={s.divider} />

            <NumericField
              label="Nota Máxima do Intervalo (inclusive)"
              value={recurso.notaMaxRecurso}
              onChange={v => setRecurso(r => ({ ...r, notaMaxRecurso: v }))}
              min={5} max={12}
              hint="Nota máxima para ser considerada 'negativa elegível' (decreto: 9)"
              color="#f97316"
            />

            <View style={s.divider} />

            <View style={s.switchRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.switchLabel}>Restrição LP + Matemática (9ª Classe)</Text>
                <Text style={s.switchHint}>
                  Se activo, alunos da 9ª Classe com LP e Matemática negativas em simultâneo não são elegíveis (Art. 33º §2).
                </Text>
              </View>
              <Switch
                value={recurso.restricaoLPMatRecurso}
                onValueChange={v => setRecurso(r => ({ ...r, restricaoLPMatRecurso: v }))}
                trackColor={{ false: Colors.border, true: '#f97316' }}
                thumbColor={recurso.restricaoLPMatRecurso ? '#fff' : '#ccc'}
              />
            </View>

            <TouchableOpacity
              onPress={salvarRecurso}
              disabled={savingRecurso}
              style={[s.btnSave, { backgroundColor: '#f97316' }]}
            >
              {savingRecurso
                ? <ActivityIndicator color="#fff" size="small" />
                : <>
                  <Ionicons name="save-outline" size={16} color="#fff" />
                  <Text style={s.btnSaveText}>Guardar Configuração de Recurso</Text>
                </>
              }
            </TouchableOpacity>
          </View>
        )}

        {/* ── MELHORIA DE NOTA ────────────────────────────────────────────── */}
        <View style={[s.sectionHeader, { marginTop: 24 }]}>
          <MaterialCommunityIcons name="trending-up" size={20} color="#8b5cf6" />
          <Text style={[s.sectionTitle, { color: '#8b5cf6' }]}>Melhoria de Nota — Art. 36º</Text>
        </View>

        <View style={[s.infoBox, { backgroundColor: '#8b5cf610', borderColor: '#8b5cf640' }]}>
          <Ionicons name="information-circle-outline" size={15} color="#8b5cf6" />
          <Text style={[s.infoText, { color: '#8b5cf6' }]}>
            Alunos com nota entre os valores configurados podem solicitar melhoria dentro do prazo. A nota final é sempre a mais alta obtida.
          </Text>
        </View>

        {loadingMelhoria ? (
          <ActivityIndicator color="#8b5cf6" style={{ marginVertical: 30 }} />
        ) : (
          <View style={s.card}>

            <View style={s.switchRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.switchLabel}>Módulo de Melhoria Habilitado</Text>
                <Text style={s.switchHint}>
                  Quando desactivado, os alunos não podem submeter pedidos de melhoria de nota.
                </Text>
              </View>
              <Switch
                value={melhoria.melhoriaNotaHabilitada}
                onValueChange={v => setMelhoria(m => ({ ...m, melhoriaNotaHabilitada: v }))}
                trackColor={{ false: Colors.border, true: '#8b5cf6' }}
                thumbColor={melhoria.melhoriaNotaHabilitada ? '#fff' : '#ccc'}
              />
            </View>

            <View style={s.divider} />

            <NumericField
              label="Nota Mínima Elegível"
              value={melhoria.notaMinMelhoria}
              onChange={v => setMelhoria(m => ({ ...m, notaMinMelhoria: v }))}
              min={8} max={14}
              hint="Nota mínima para pedir melhoria (decreto: 10)"
              color="#8b5cf6"
            />

            <View style={s.divider} />

            <NumericField
              label="Nota Máxima Elegível"
              value={melhoria.notaMaxMelhoria}
              onChange={v => setMelhoria(m => ({ ...m, notaMaxMelhoria: v }))}
              min={12} max={19}
              hint="Nota máxima para pedir melhoria (decreto: 16)"
              color="#8b5cf6"
            />

            <View style={s.divider} />

            <NumericField
              label="Máximo de Disciplinas por Aluno"
              value={melhoria.maxDisciplinasMelhoria}
              onChange={v => setMelhoria(m => ({ ...m, maxDisciplinasMelhoria: v }))}
              min={1} max={10}
              hint="Número máximo de disciplinas que um aluno pode pedir melhoria (decreto: 5)"
              color="#8b5cf6"
            />

            <View style={s.divider} />

            <NumericField
              label="Prazo para Solicitar (horas)"
              value={melhoria.prazoHorasMelhoria}
              onChange={v => setMelhoria(m => ({ ...m, prazoHorasMelhoria: v }))}
              min={12} max={168}
              hint="Horas após publicação dos resultados para os alunos solicitarem melhoria (decreto: 48h)"
              color="#8b5cf6"
            />

            <TouchableOpacity
              onPress={salvarMelhoria}
              disabled={savingMelhoria}
              style={[s.btnSave, { backgroundColor: '#8b5cf6' }]}
            >
              {savingMelhoria
                ? <ActivityIndicator color="#fff" size="small" />
                : <>
                  <Ionicons name="save-outline" size={16} color="#fff" />
                  <Text style={s.btnSaveText}>Guardar Configuração de Melhoria</Text>
                </>
              }
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function NumericField({ label, value, onChange, min, max, hint, color }: {
  label: string; value: number; onChange: (v: number) => void; min: number; max: number; hint?: string; color: string;
}) {
  const [text, setText] = useState(String(value));

  useEffect(() => { setText(String(value)); }, [value]);

  const apply = () => {
    const n = parseInt(text, 10);
    if (isNaN(n)) { setText(String(value)); return; }
    const clamped = Math.min(max, Math.max(min, n));
    setText(String(clamped));
    onChange(clamped);
  };

  return (
    <View style={{ marginBottom: 4 }}>
      <Text style={s.fieldLabel}>{label}</Text>
      {hint && <Text style={s.fieldHint}>{hint}</Text>}
      <View style={s.numRow}>
        <TouchableOpacity
          onPress={() => { const v = Math.max(min, value - 1); onChange(v); setText(String(v)); }}
          style={[s.numBtn, { borderColor: color }]}
        >
          <Ionicons name="remove" size={18} color={color} />
        </TouchableOpacity>
        <TextInput
          style={[s.numInput, { borderColor: color + '60', color }]}
          value={text}
          onChangeText={setText}
          onBlur={apply}
          onSubmitEditing={apply}
          keyboardType="numeric"
          selectTextOnFocus
        />
        <TouchableOpacity
          onPress={() => { const v = Math.min(max, value + 1); onChange(v); setText(String(v)); }}
          style={[s.numBtn, { borderColor: color }]}
        >
          <Ionicons name="add" size={18} color={color} />
        </TouchableOpacity>
        <Text style={[s.numRange, { color: Colors.textMuted }]}>({min}–{max})</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  sectionTitle: { fontSize: 15, fontFamily: 'Inter_700Bold' },
  infoBox: { flexDirection: 'row', gap: 8, backgroundColor: '#f9741612', borderRadius: 10, padding: 10, marginBottom: 12, alignItems: 'flex-start', borderWidth: 1, borderColor: '#f9741640' },
  infoText: { flex: 1, fontSize: 12, color: '#f97316', fontFamily: 'Inter_400Regular', lineHeight: 17 },
  card: { backgroundColor: Colors.card, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: Colors.border, marginBottom: 8 },
  divider: { height: 1, backgroundColor: Colors.border, marginVertical: 14 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  switchLabel: { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: Colors.text, marginBottom: 3 },
  switchHint: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted, lineHeight: 16 },
  fieldLabel: { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: Colors.text, marginBottom: 3 },
  fieldHint: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginBottom: 8, lineHeight: 15 },
  numRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  numBtn: { width: 36, height: 36, borderRadius: 10, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', backgroundColor: 'transparent' },
  numInput: { width: 64, height: 36, borderRadius: 10, borderWidth: 1.5, textAlign: 'center', fontSize: 16, fontFamily: 'Inter_700Bold', backgroundColor: Colors.background, outlineStyle: 'none' } as any,
  numRange: { fontSize: 11, fontFamily: 'Inter_400Regular' },
  btnSave: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 12, paddingVertical: 13, marginTop: 16 },
  btnSaveText: { color: '#fff', fontFamily: 'Inter_700Bold', fontSize: 14 },
});
