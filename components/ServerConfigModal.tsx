import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  Modal, ActivityIndicator, ScrollView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/colors';
import {
  getStoredServerUrl, setServerUrl, testServerConnection,
  getDefaultServerUrl, resetServerUrl,
} from '@/lib/server-config';
import { getApiUrl } from '@/lib/query-client';

interface Props {
  visible: boolean;
  onClose: () => void;
  onSaved?: () => void;
}

export default function ServerConfigModal({ visible, onClose, onSaved }: Props) {
  const defaultUrl = getDefaultServerUrl();
  const [url, setUrl] = useState('');
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(null);

  useEffect(() => {
    if (visible) {
      const stored = getStoredServerUrl();
      setUrl(stored || defaultUrl);
      setStatus(null);
    }
  }, [visible]);

  async function handleTest() {
    setTesting(true);
    setStatus(null);
    const result = await testServerConnection(url);
    setStatus(result);
    setTesting(false);
  }

  async function handleSave() {
    setSaving(true);
    setStatus(null);
    const result = await testServerConnection(url);
    if (!result.ok) {
      setStatus(result);
      setSaving(false);
      return;
    }
    await setServerUrl(url);
    setStatus({ ok: true, message: 'Guardado! Reinicie a app para aplicar.' });
    setSaving(false);
    setTimeout(() => { onSaved?.(); onClose(); }, 1500);
  }

  async function handleReset() {
    await resetServerUrl();
    setUrl(defaultUrl);
    setStatus({ ok: true, message: `Reposto para o endereço padrão.` });
  }

  const currentActive = getApiUrl();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.overlay}>
        <View style={s.card}>
          <View style={s.header}>
            <View style={s.headerLeft}>
              <Ionicons name="server-outline" size={20} color={Colors.primary ?? '#D4AF37'} />
              <Text style={s.title}>Configuração do Servidor</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={s.closeBtn}>
              <Ionicons name="close" size={22} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            <Text style={s.label}>Endereço actual</Text>
            <View style={s.currentBox}>
              <Ionicons name="globe-outline" size={14} color={Colors.textMuted ?? '#888'} />
              <Text style={s.currentUrl} numberOfLines={1}>{currentActive}</Text>
            </View>

            <Text style={s.label}>Novo endereço do servidor</Text>
            <Text style={s.hint}>
              Introduza o IP ou domínio do servidor. Ex: http://192.168.1.100 ou https://meuservidor.com
            </Text>
            <TextInput
              style={s.input}
              value={url}
              onChangeText={(t) => { setUrl(t); setStatus(null); }}
              placeholder="https://meuservidor.com"
              placeholderTextColor={Colors.textMuted ?? '#888'}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              returnKeyType="done"
            />

            {status && (
              <View style={[s.statusBox, status.ok ? s.statusOk : s.statusErr]}>
                <Ionicons
                  name={status.ok ? 'checkmark-circle' : 'alert-circle'}
                  size={16}
                  color={status.ok ? '#4ade80' : '#f87171'}
                />
                <Text style={[s.statusText, { color: status.ok ? '#4ade80' : '#f87171' }]}>
                  {status.message}
                </Text>
              </View>
            )}

            <View style={s.actions}>
              <TouchableOpacity style={s.btnSecondary} onPress={handleTest} disabled={testing || saving}>
                {testing
                  ? <ActivityIndicator size="small" color={Colors.primary ?? '#D4AF37'} />
                  : <Ionicons name="wifi-outline" size={16} color={Colors.primary ?? '#D4AF37'} />
                }
                <Text style={s.btnSecondaryText}>Testar ligação</Text>
              </TouchableOpacity>

              <TouchableOpacity style={s.btnPrimary} onPress={handleSave} disabled={testing || saving}>
                {saving
                  ? <ActivityIndicator size="small" color="#0a1828" />
                  : <Ionicons name="save-outline" size={16} color="#0a1828" />
                }
                <Text style={s.btnPrimaryText}>Guardar</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={s.resetBtn} onPress={handleReset}>
              <Ionicons name="refresh-outline" size={14} color={Colors.textMuted ?? '#888'} />
              <Text style={s.resetText}>Repor endereço padrão ({defaultUrl})</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  card: {
    backgroundColor: '#0f2035',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    paddingBottom: Platform.OS === 'ios' ? 40 : 28,
    borderTopWidth: 1,
    borderTopColor: 'rgba(212,175,55,0.2)',
    maxHeight: '85%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    color: '#f4e9c8',
    fontSize: 16,
    fontWeight: '700',
  },
  closeBtn: {
    padding: 4,
  },
  label: {
    color: '#f4e9c8',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 6,
    marginTop: 4,
  },
  hint: {
    color: 'rgba(244,233,200,0.5)',
    fontSize: 12,
    marginBottom: 10,
    lineHeight: 17,
  },
  currentBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 8,
    padding: 10,
    marginBottom: 16,
  },
  currentUrl: {
    color: 'rgba(244,233,200,0.6)',
    fontSize: 12,
    flex: 1,
  },
  input: {
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.3)',
    borderRadius: 10,
    padding: 14,
    color: '#f4e9c8',
    fontSize: 14,
    marginBottom: 14,
  },
  statusBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 8,
    padding: 10,
    marginBottom: 14,
  },
  statusOk: { backgroundColor: 'rgba(74,222,128,0.1)' },
  statusErr: { backgroundColor: 'rgba(248,113,113,0.1)' },
  statusText: {
    fontSize: 13,
    flex: 1,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  btnSecondary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.4)',
    borderRadius: 10,
    paddingVertical: 12,
  },
  btnSecondaryText: {
    color: '#D4AF37',
    fontSize: 13,
    fontWeight: '600',
  },
  btnPrimary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#D4AF37',
    borderRadius: 10,
    paddingVertical: 12,
  },
  btnPrimaryText: {
    color: '#0a1828',
    fontSize: 13,
    fontWeight: '700',
  },
  resetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
  },
  resetText: {
    color: 'rgba(244,233,200,0.4)',
    fontSize: 11,
  },
});
