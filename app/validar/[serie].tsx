import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Platform } from 'react-native';
import AppLoader from '@/components/AppLoader';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { Colors } from '@/constants/colors';
import { getApiUrl } from '@/lib/query-client';

type ValRes = {
  valido: boolean;
  erro?: string;
  autenticidade?: string;
  boletim?: {
    numeroSerie: string;
    tipo: string;
    trimestre: number | null;
    anoLetivo: string;
    status: string;
    viaNumero: number;
    dataEmissao: string;
    dataAssinatura: string | null;
    assinadoPor: string | null;
    hash: string;
  };
  aluno?: { nome: string; numeroMatricula: string; classe: string; turma: string };
};

export default function ValidarBoletim() {
  const { serie } = useLocalSearchParams<{ serie: string }>();
  const [data, setData] = useState<ValRes | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!serie) return;
    fetch(`${getApiUrl()}/api/validar/${serie}`)
      .then((r) => r.json())
      .then(setData)
      .catch((e) => setData({ valido: false, erro: e.message }))
      .finally(() => setLoading(false));
  }, [serie]);

  if (loading) {
    return (<View style={styles.center}><AppLoader size="large" color={Colors.gold} /><Text style={styles.muted}>A verificar autenticidade…</Text></View>);
  }
  if (!data?.valido) {
    return (
      <View style={styles.center}>
        <Ionicons name="close-circle" size={64} color="#dc2626" />
        <Text style={styles.errTitle}>Documento Não Autenticado</Text>
        <Text style={styles.muted}>{data?.erro || 'Este documento não consta nos arquivos da instituição.'}</Text>
        <Text style={[styles.muted, { marginTop: 8, fontSize: 11 }]}>Nº pesquisado: {serie}</Text>
      </View>
    );
  }
  const b = data.boletim!;
  const a = data.aluno!;
  return (
    <ScrollView contentContainerStyle={styles.wrap}>
      <View style={styles.header}>
        <Ionicons name="shield-checkmark" size={56} color={Colors.success} />
        <Text style={styles.title}>Documento Autêntico</Text>
        <Text style={styles.subtitle}>{data.autenticidade}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Identificação do Documento</Text>
        <Row label="Nº de Série" value={b.numeroSerie} bold />
        <Row label="Tipo" value={b.tipo === 'anual' ? 'Boletim Anual' : `Boletim do ${b.trimestre}º Trimestre`} />
        <Row label="Ano Lectivo" value={b.anoLetivo} />
        <Row label="Via" value={`${b.viaNumero}ª`} />
        <Row label="Estado" value={b.status === 'assinado' ? 'Assinado pelos Directores' : b.status === 'pendente_assinatura' ? 'Pendente de Assinatura' : 'Emitido'} />
        <Row label="Emitido em" value={new Date(b.dataEmissao).toLocaleString('pt-PT')} />
        {b.dataAssinatura && <Row label="Assinado em" value={new Date(b.dataAssinatura).toLocaleString('pt-PT')} />}
        {b.assinadoPor && <Row label="Director" value={b.assinadoPor} />}
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Aluno</Text>
        <Row label="Nome" value={a.nome} bold />
        <Row label="Nº Matrícula" value={a.numeroMatricula} />
        <Row label="Classe" value={a.classe} />
        <Row label="Turma" value={a.turma} />
      </View>

      <View style={styles.hashBox}>
        <Text style={styles.hashLabel}>Hash de Integridade (SHA-256)</Text>
        <Text style={styles.hashVal}>{b.hash}</Text>
      </View>

      <Text style={styles.footer}>Esta validação é gerada em tempo real a partir dos arquivos oficiais da escola.</Text>
    </ScrollView>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowVal, bold && { fontFamily: 'Inter_700Bold' }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 20, maxWidth: 700, alignSelf: 'center', width: '100%' },
  center: { flex: 1, padding: 30, alignItems: 'center', justifyContent: 'center' },
  header: { alignItems: 'center', marginBottom: 20 },
  title: { fontSize: 22, fontFamily: 'Inter_700Bold', color: Colors.success, marginTop: 8 },
  subtitle: { color: Colors.textMuted, textAlign: 'center', marginTop: 4 },
  errTitle: { fontSize: 20, fontFamily: 'Inter_700Bold', color: '#dc2626', marginTop: 12 },
  card: { backgroundColor: '#fff', padding: 16, borderRadius: 10, marginBottom: 12, borderWidth: 1, borderColor: '#e5e7eb' },
  sectionTitle: { fontSize: 13, fontFamily: 'Inter_700Bold', color: Colors.gold, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  rowLabel: { color: Colors.textMuted, fontSize: 12 },
  rowVal: { color: Colors.text, fontSize: 12, fontFamily: 'Inter_500Medium', maxWidth: '60%', textAlign: 'right' },
  hashBox: { backgroundColor: '#f9fafb', padding: 10, borderRadius: 8, marginTop: 4 },
  hashLabel: { fontSize: 10, color: Colors.textMuted, marginBottom: 4 },
  hashVal: { fontSize: 10, fontFamily: Platform.OS === 'web' ? 'monospace' : undefined, color: Colors.text, lineHeight: 14 },
  muted: { color: Colors.textMuted, marginTop: 4 },
  footer: { textAlign: 'center', fontSize: 10, color: Colors.textMuted, marginTop: 14 },
});
