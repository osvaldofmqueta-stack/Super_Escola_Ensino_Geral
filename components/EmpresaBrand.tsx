import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity, Linking } from 'react-native';
import { Colors } from '@/constants/colors';
import { api } from '@/lib/api';

interface EmpresaInfo {
  empresaNome?: string;
  empresaTelefone?: string;
  empresaEmail?: string;
  empresaLogo?: string;
  empresaWebsite?: string;
}

let cache: EmpresaInfo | null = null;
const listeners = new Set<(info: EmpresaInfo) => void>();

export async function refreshEmpresaCache() {
  try {
    const data = await api.get<EmpresaInfo>('/api/config');
    cache = {
      empresaNome: (data as any)?.empresaNome || (data as any)?.nomeEscola || 'Super Escola',
      empresaTelefone: (data as any)?.empresaTelefone || '',
      empresaEmail: (data as any)?.empresaEmail || '',
      empresaLogo: (data as any)?.empresaLogo || '',
      empresaWebsite: (data as any)?.empresaWebsite || '',
    };
    listeners.forEach(l => l(cache!));
  } catch {
    /* silencioso — endpoint público */
  }
}

export function useEmpresa(): EmpresaInfo {
  const [info, setInfo] = useState<EmpresaInfo>(cache || { empresaNome: 'Super Escola' });
  useEffect(() => {
    if (!cache) refreshEmpresaCache();
    const fn = (i: EmpresaInfo) => setInfo(i);
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  }, []);
  return info;
}

function getIniciais(nome?: string): string {
  if (!nome || !nome.trim()) return 'SE';
  const partes = nome.trim().split(/\s+/);
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes[1][0]).toUpperCase();
}

interface Props {
  size?: number;
  onPress?: () => void;
}

export default function EmpresaBrand({ size = 32, onPress }: Props) {
  const info = useEmpresa();
  const iniciais = getIniciais(info.empresaNome);
  const Wrapper: any = onPress ? TouchableOpacity : View;
  const wrapperProps = onPress ? { onPress, activeOpacity: 0.7 } : {};

  return (
    <Wrapper
      {...wrapperProps}
      style={[styles.brand, { width: size, height: size, borderRadius: size / 2 }]}
    >
      {info.empresaLogo ? (
        <Image
          source={{ uri: info.empresaLogo }}
          style={{ width: size, height: size, borderRadius: size / 2 }}
          resizeMode="cover"
        />
      ) : (
        <Text style={[styles.iniciais, { fontSize: size * 0.42 }]}>{iniciais}</Text>
      )}
    </Wrapper>
  );
}

const styles = StyleSheet.create({
  brand: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.gold,
    borderWidth: 1.5,
    borderColor: Colors.gold,
    overflow: 'hidden',
  },
  iniciais: {
    fontFamily: 'Inter_700Bold',
    color: Colors.primaryDark,
    letterSpacing: 0.5,
  },
});
