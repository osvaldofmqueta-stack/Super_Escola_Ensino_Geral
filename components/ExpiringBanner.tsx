import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth, getAuthToken } from '@/context/AuthContext';
import { useLicense } from '@/context/LicenseContext';

interface ExpiracaoInfo {
  diasRestantes: number | null;
  emGracePeriod?: boolean;
  gracePeriodDias?: number;
  showAvisoBanner?: boolean;
  autoRenew?: boolean;
}

export default function ExpiringBanner() {
  const router = useRouter();
  const { user } = useAuth();
  const { diasRestantes } = useLicense();
  const [info, setInfo] = useState<ExpiracaoInfo | null>(null);
  const [dismissedAt, setDismissedAt] = useState<number>(0);

  useEffect(() => {
    if (!user) return;
    if (user.role === 'aluno' || user.role === 'estudante' || user.role === 'ceo' || user.role === 'encarregado') return;
    let alive = true;
    const fetchInfo = async () => {
      try {
        const tok = (await getAuthToken()) || '';
        const r = await fetch('/api/licenca/expiracao-info', { headers: tok ? { Authorization: `Bearer ${tok}` } : {} });
        if (r.ok && alive) setInfo(await r.json());
      } catch {}
    };
    fetchInfo();
    const t = setInterval(fetchInfo, 60000);
    return () => { alive = false; clearInterval(t); };
  }, [user]);

  if (!user || user.role === 'aluno' || user.role === 'estudante' || user.role === 'ceo' || user.role === 'encarregado') return null;
  const canRenew = user.role === 'admin' || user.role === 'director' || user.role === 'pca';
  if (!info || info.diasRestantes == null) return null;
  if (Date.now() - dismissedAt < 30 * 60 * 1000) return null;

  const d = info.diasRestantes;
  // Mostrar apenas em janelas relevantes: 15, 7, 3, 1, 0, ou em grace period
  const shouldShow = info.showAvisoBanner || info.emGracePeriod || d <= 15;
  if (!shouldShow) return null;

  let cor = '#FF9F0A';
  let icone: 'shield-alert' | 'shield-alert-outline' | 'shield-off' = 'shield-alert-outline';
  let titulo = '';
  let msg = '';

  if (d < 0 && info.emGracePeriod) {
    cor = '#FF453A';
    icone = 'shield-off';
    titulo = 'Subscrição expirada — Período de tolerância activo';
    const restGrace = (info.gracePeriodDias || 2) + d; // d é negativo
    msg = `Restam ${restGrace} dia${restGrace === 1 ? '' : 's'} de tolerância antes do bloqueio total.`;
  } else if (d <= 0) {
    cor = '#FF453A';
    icone = 'shield-off';
    titulo = 'Subscrição expirada';
    msg = 'O acesso será restringido. Renove para retomar todas as funcionalidades.';
  } else if (d <= 1) {
    cor = '#FF453A';
    icone = 'shield-alert';
    titulo = 'Expira amanhã!';
    msg = 'Renove agora para evitar interrupção do serviço.';
  } else if (d <= 3) {
    cor = '#FF453A';
    icone = 'shield-alert';
    titulo = `Expira em ${d} dias`;
    msg = 'Submeta a renovação ao CEO o mais rápido possível.';
  } else if (d <= 7) {
    cor = '#FF9F0A';
    icone = 'shield-alert';
    titulo = `Expira em ${d} dias`;
    msg = 'Está na fase crítica — recomendamos renovar já.';
  } else {
    cor = '#FF9F0A';
    icone = 'shield-alert-outline';
    titulo = `Expira em ${d} dias`;
    msg = 'Planifique a renovação atempadamente.';
  }

  const critico = d > 0 && d < 5;
  const bannerStyle: any = [
    styles.banner,
    { backgroundColor: cor + (critico ? '28' : '14'), borderColor: cor + (critico ? 'AA' : '66') },
    critico && Platform.OS === 'web' && {
      animation: 'siga-pulse-critical 1.4s ease-in-out infinite' as any,
      borderWidth: 2,
      boxShadow: `0 0 14px ${cor}AA, inset 0 0 6px ${cor}33` as any,
    },
  ];

  return (
    <>
      {Platform.OS === 'web' && (
        <style dangerouslySetInnerHTML={{ __html: `
          @keyframes siga-pulse-critical {
            0%, 100% { transform: scale(1); filter: brightness(1); }
            50% { transform: scale(1.015); filter: brightness(1.18); }
          }
        ` }} />
      )}
      <View style={bannerStyle}>
        <View style={[styles.iconBox, { backgroundColor: cor + '22', borderColor: cor + '66' }]}>
          <MaterialCommunityIcons name={icone} size={critico ? 18 : 16} color={cor} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: cor, fontSize: critico ? 13 : 12 }]}>
            {critico ? '⚠ ' : ''}{titulo}{critico ? ' — ACÇÃO URGENTE' : ''}
          </Text>
          <Text style={[styles.msg, critico && { color: 'rgba(255,255,255,0.85)', fontSize: 12 }]}>
            {msg}
            {info.autoRenew ? ' · Renovação automática activa.' : ''}
          </Text>
        </View>
        {canRenew && (
          <TouchableOpacity style={[styles.btn, { backgroundColor: cor }, critico && { paddingHorizontal: 16, paddingVertical: 9 }]} onPress={() => router.push('/licenca' as any)}>
            <Text style={[styles.btnText, critico && { fontSize: 12 }]}>{critico ? 'RENOVAR JÁ' : 'Renovar'}</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={styles.dismiss} onPress={() => setDismissedAt(Date.now())}>
          <MaterialCommunityIcons name="close" size={16} color="rgba(255,255,255,0.5)" />
        </TouchableOpacity>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    ...Platform.select({ web: { position: 'sticky' as any, top: 0, zIndex: 100 } }),
  },
  iconBox: {
    width: 28, height: 28, borderRadius: 8, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  title: { fontSize: 12, fontFamily: 'Inter_700Bold' },
  msg: { fontSize: 11, fontFamily: 'Inter_400Regular', color: 'rgba(255,255,255,0.65)', marginTop: 1 },
  btn: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8 },
  btnText: { fontSize: 11, fontFamily: 'Inter_700Bold', color: '#fff' },
  dismiss: { padding: 6 },
});
