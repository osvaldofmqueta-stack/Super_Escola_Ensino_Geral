import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '@/constants/colors';
import { useEmpresa } from '@/components/EmpresaBrand';

export default function EmpresaFooter() {
  const info = useEmpresa();
  const ano = new Date().getFullYear();

  return (
    <View style={styles.container}>
      <View style={styles.inner}>
        <Text style={styles.copyright}>
          © {ano} {info.empresaNome || 'Super Escola'} · Todos os direitos reservados
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.primaryDark,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    marginTop: 24,
  },
  inner: {
    paddingVertical: 12,
    paddingHorizontal: 18,
  },
  copyright: {
    fontSize: 10,
    fontFamily: 'Inter_400Regular',
    color: Colors.textMuted,
    textAlign: 'center',
  },
});
