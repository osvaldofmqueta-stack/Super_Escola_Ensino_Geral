import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/colors';

interface Props {
  sessoesUsadas: number;
  onCompletar: () => void;
}

const MAX_SESSOES = 3;

export default function PerfilIncompletoBanner({ sessoesUsadas, onCompletar }: Props) {
  const sessoesRestantes = Math.max(0, MAX_SESSOES - sessoesUsadas);
  const bloqueado = sessoesRestantes === 0;
  const cor = bloqueado ? Colors.danger : sessoesRestantes === 1 ? '#F97316' : Colors.warning;

  return (
    <View style={[styles.banner, { backgroundColor: cor + '18', borderColor: cor + '55' }]}>
      <View style={[styles.iconBox, { backgroundColor: cor + '25', borderColor: cor + '55' }]}>
        <Ionicons name={bloqueado ? 'lock-closed' : 'person-circle-outline'} size={15} color={cor} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[styles.titulo, { color: cor }]} numberOfLines={1}>
          {bloqueado
            ? 'Perfil bloqueado — preenchimento obrigatório'
            : 'Perfil incompleto'}
        </Text>
        <Text style={styles.sub} numberOfLines={1}>
          {bloqueado
            ? 'Não é possível adiar mais. Complete o perfil para continuar.'
            : `${sessoesRestantes} sessão${sessoesRestantes !== 1 ? 'ões' : ''} restante${sessoesRestantes !== 1 ? 's' : ''} antes do bloqueio`}
        </Text>
      </View>
      <TouchableOpacity
        style={[styles.btn, { backgroundColor: cor }]}
        onPress={onCompletar}
        activeOpacity={0.85}
      >
        <Ionicons name="create-outline" size={13} color="#fff" />
        <Text style={styles.btnText}>{bloqueado ? 'Preencher agora' : 'Completar'}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderBottomWidth: 1,
    ...Platform.select({ web: { position: 'sticky' as any, top: 0, zIndex: 99 } }),
  },
  iconBox: {
    width: 26,
    height: 26,
    borderRadius: 7,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  titulo: {
    fontFamily: 'Inter_700Bold',
    fontSize: 12,
    lineHeight: 16,
  },
  sub: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: 'rgba(255,255,255,0.58)',
    marginTop: 1,
  },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 8,
    flexShrink: 0,
  },
  btnText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 11,
    color: '#fff',
  },
});
