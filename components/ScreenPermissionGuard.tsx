import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Colors } from '@/constants/colors';
import { usePermissoes, PermKey } from '@/context/PermissoesContext';
import { useAuth } from '@/context/AuthContext';

interface Props {
  permKey: PermKey;
  children: React.ReactNode;
  label?: string;
}

export default function ScreenPermissionGuard({ permKey, children, label }: Props) {
  const { user } = useAuth();
  const { hasPermission } = usePermissoes();
  const router = useRouter();

  if (!user) return null;

  const isSuperUser = user.role === 'ceo' || user.role === 'pca';
  if (isSuperUser || hasPermission(permKey)) {
    return <>{children}</>;
  }

  return (
    <View style={styles.container}>
      <View style={styles.box}>
        <View style={styles.iconWrap}>
          <Ionicons name="lock-closed" size={36} color={Colors.danger} />
        </View>
        <Text style={styles.title}>Acesso Restrito</Text>
        <Text style={styles.desc}>
          Não tem permissão para aceder a{label ? ` "${label}"` : ' esta funcionalidade'}.{'\n'}
          Contacte o administrador para obter acesso.
        </Text>
        <TouchableOpacity style={styles.btn} onPress={() => router.back()} activeOpacity={0.8}>
          <Ionicons name="arrow-back" size={16} color="#fff" />
          <Text style={styles.btnText}>Voltar</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  box: {
    backgroundColor: Colors.backgroundCard,
    borderRadius: 20,
    padding: 32,
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    maxWidth: 380,
    width: '100%',
  },
  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Colors.danger + '18',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  title: {
    fontSize: 20,
    fontFamily: 'Inter_700Bold',
    color: Colors.text,
  },
  desc: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 20,
  },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.accent,
    borderRadius: 10,
    paddingHorizontal: 20,
    paddingVertical: 11,
    marginTop: 8,
  },
  btnText: {
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
    color: '#fff',
  },
});
