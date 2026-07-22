import React from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/context/AuthContext';
import { Colors } from '@/constants/colors';

/**
 * Badge fino que aparece no topo da área principal da aplicação quando a
 * sessão actual foi aberta sem ligação à Internet (a partir da credencial
 * guardada em cache). Desaparece automaticamente assim que a fila offline
 * drena com sucesso (evento `siga:online-sync`) — o que indica que o token
 * foi aceite pelo servidor.
 */
export default function SessaoLocalBadge() {
  const { loggedInOffline, isAuthenticated } = useAuth();
  if (!isAuthenticated || !loggedInOffline) return null;

  return (
    <View style={styles.container}>
      <View style={styles.dot} />
      <Ionicons name="cloud-offline" size={14} color="#7c2d12" style={{ marginRight: 6 }} />
      <Text style={styles.text} numberOfLines={1}>
        Sessão local — entrou sem Internet. Os dados serão validados quando a ligação voltar.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff7ed',
    borderBottomWidth: 1,
    borderBottomColor: '#fdba74',
    paddingHorizontal: 12,
    paddingVertical: 6,
    ...(Platform.OS === 'web' ? { gap: 0 } : {}),
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.warning,
    marginRight: 8,
  },
  text: {
    flex: 1,
    fontSize: 12,
    color: '#7c2d12',
    fontWeight: '500',
  },
});
