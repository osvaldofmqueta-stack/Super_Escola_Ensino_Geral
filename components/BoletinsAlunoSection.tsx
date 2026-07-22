import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, Platform, Linking } from 'react-native';
import AppLoader from '@/components/AppLoader';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/colors';
import { api } from '@/lib/api';
import { getApiUrl } from '@/lib/query-client';
import { getAuthToken } from '@/context/AuthContext';

type Trimestre = {
  trimestre: number;
  elegivel: boolean;
  motivo: string;
  propinas: { emDia: boolean; mesesPendentes: number[]; detalhe: string };
  notas: { completo: boolean; totalDisciplinas: number; lancadas: number; faltam: string[] };
  ultimaEmissao: { id: string; numeroSerie: string; viaNumero: number; dataEmissao: string } | null;
};

type Anual = {
  elegivel: boolean;
  motivo: string;
  propinas: { emDia: boolean; mesesPendentes: number[]; detalhe: string };
  notas: { t1: any; t2: any; t3: any };
  ultimoPedido: { id: string; numeroSerie: string; status: string; viaNumero: number; dataEmissao: string } | null;
};

type Eleg = {
  aluno: { id: string; nome: string; apelido: string; turma: string; classe: string };
  anoLetivo: string;
  trimestres: Trimestre[];
  anual: Anual;
};

type HistItem = {
  id: string;
  tipo: 'trimestral' | 'anual';
  trimestre: number | null;
  numeroSerie: string;
  viaNumero: number;
  status: string;
  dataEmissao: string;
  dataAssinatura: string | null;
  assinadoPorDirectorNome: string | null;
};

type TrimIICiclo = {
  trimestre: number;
  elegivel: boolean;
  motivo: string;
  propinas: { emDia: boolean; mesesPendentes: number[]; detalhe: string };
};

type ElegIICiclo = {
  isIICiclo: boolean;
  aluno: { id: string; nome: string; apelido: string; turma: string; classe: string };
  anoLetivo: string;
  trimestres: TrimIICiclo[];
};

const II_CICLO_COLOR = '#7c3aed';

export default function BoletinsAlunoSection() {
  const [eleg, setEleg] = useState<Eleg | null>(null);
  const [hist, setHist] = useState<HistItem[]>([]);
  const [eligIICiclo, setEligIICiclo] = useState<ElegIICiclo | null>(null);
  const [loading, setLoading] = useState(true);
  const [solicitando, setSolicitando] = useState<string | null>(null);
  const [abrindoIICiclo, setAbrindoIICiclo] = useState<number | null>(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const [e, h] = await Promise.all([
        api.get<Eleg>('/api/aluno/boletins/elegibilidade'),
        api.get<HistItem[]>('/api/aluno/boletins'),
      ]);
      setEleg(e);
      setHist(h);

      // Carregar elegibilidade II Ciclo em paralelo (silencioso se falhar)
      try {
        const eiic = await api.get<ElegIICiclo>('/api/aluno/boletins-ii-ciclo/elegibilidade');
        setEligIICiclo(eiic);
      } catch {
        setEligIICiclo(null);
      }
    } catch (err: any) {
      console.warn('[boletins] erro:', err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  async function abrirHtml(numeroSerie: string) {
    const base = getApiUrl();
    const token = await getAuthToken();
    const url = `${base}/api/boletins/${numeroSerie}/html?token=${encodeURIComponent(token || '')}`;
    if (Platform.OS === 'web') {
      window.open(url, '_blank');
    } else {
      Linking.openURL(url).catch(() => Alert.alert('Erro', 'Não foi possível abrir o boletim.'));
    }
  }

  async function abrirBoletimIICiclo(trimestre: number) {
    if (!eligIICiclo) return;
    setAbrindoIICiclo(trimestre);
    try {
      const base = getApiUrl();
      const token = await getAuthToken();
      const url = `${base}/api/alunos/${eligIICiclo.aluno.id}/boletim-ii-ciclo?trimestre=${trimestre}&token=${encodeURIComponent(token || '')}`;
      if (Platform.OS === 'web') {
        window.open(url, '_blank');
      } else {
        Linking.openURL(url).catch(() => Alert.alert('Erro', 'Não foi possível abrir o boletim.'));
      }
    } finally {
      setAbrindoIICiclo(null);
    }
  }

  async function solicitar(tipo: 'trimestral' | 'anual', trimestre?: number) {
    const key = `${tipo}-${trimestre ?? 'anual'}`;
    setSolicitando(key);
    try {
      const r: any = await api.post('/api/aluno/boletins/solicitar', { tipo, trimestre });
      if (tipo === 'trimestral') {
        Alert.alert('Boletim emitido', `Nº de Série: ${r.numeroSerie}\n\nO seu boletim está pronto. Pode imprimi-lo agora.`, [
          { text: 'Ver / Imprimir', onPress: () => abrirHtml(r.numeroSerie) },
          { text: 'Fechar', style: 'cancel' },
        ]);
      } else {
        Alert.alert('Pedido enviado', 'O seu pedido de Boletim Anual foi enviado e aguarda assinatura dos directores. Receberá uma notificação quando estiver pronto.');
      }
      await carregar();
    } catch (err: any) {
      const msg = err?.message || 'Erro ao solicitar.';
      Alert.alert('Não foi possível emitir', msg.replace(/^\d+:\s*/, '').replace(/^\{.*"error":"|"[,}].*$/g, ''));
    } finally {
      setSolicitando(null);
    }
  }

  if (loading) return (<View style={styles.loadingBox}><AppLoader color={Colors.gold} /><Text style={styles.loadingTxt}>A verificar elegibilidade…</Text></View>);
  if (!eleg) return (<View style={styles.errBox}><Text style={styles.errTxt}>Não foi possível carregar o seu estado de boletins.</Text></View>);

  return (
    <View style={styles.wrap}>
      <View style={styles.headerCard}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Ionicons name="ribbon" size={22} color={Colors.gold} />
          <Text style={styles.headerTitle}>Os Meus Boletins</Text>
        </View>
        <Text style={styles.headerSub}>Ano Lectivo {eleg.anoLetivo} · {eleg.aluno.classe}, Turma {eleg.aluno.turma}</Text>
      </View>

      {/* ── BOLETINS TRIMESTRAIS (I Ciclo / formato padrão) ── */}
      {[1, 2, 3].map((t) => {
        const item = eleg.trimestres.find((x) => x.trimestre === t)!;
        const k = `trimestral-${t}`;
        return (
          <View key={t} style={styles.card}>
            <View style={styles.cardTop}>
              <View style={[styles.iconCircle, { backgroundColor: item.elegivel ? Colors.success + '22' : '#9993' }]}>
                <Text style={[styles.iconCircleTxt, { color: item.elegivel ? Colors.success : Colors.textMuted }]}>{t}º</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>Boletim do {t}º Trimestre</Text>
                <Text style={[styles.cardMotivo, { color: item.elegivel ? Colors.success : Colors.warning }]}>{item.motivo}</Text>
              </View>
            </View>

            {item.notas.faltam.length > 0 && item.notas.faltam.length < 5 && (
              <Text style={styles.smallMuted}>Faltam: {item.notas.faltam.join(', ')}</Text>
            )}
            {item.propinas.mesesPendentes.length > 0 && (
              <Text style={styles.smallMuted}>{item.propinas.detalhe}</Text>
            )}

            {item.ultimaEmissao && (
              <View style={styles.ultEmiss}>
                <Ionicons name="document-text" size={13} color={Colors.gold} />
                <Text style={styles.ultEmissTxt}>Já emitido (Nº {item.ultimaEmissao.numeroSerie}, {item.ultimaEmissao.viaNumero}ª via)</Text>
              </View>
            )}

            <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
              <TouchableOpacity
                style={[styles.btnPrim, !item.elegivel && styles.btnDisabled]}
                disabled={!item.elegivel || solicitando === k}
                onPress={() => solicitar('trimestral', t)}
              >
                {solicitando === k ? <AppLoader color="#fff" size="small" /> : (
                  <>
                    <Ionicons name={item.elegivel ? 'checkmark-circle' : 'lock-closed'} size={14} color="#fff" />
                    <Text style={styles.btnTxt}>{item.ultimaEmissao ? 'Reimprimir (taxa)' : 'Solicitar Boletim'}</Text>
                  </>
                )}
              </TouchableOpacity>
              {item.ultimaEmissao && (
                <TouchableOpacity style={styles.btnSec} onPress={() => abrirHtml(item.ultimaEmissao!.numeroSerie)}>
                  <Ionicons name="print" size={14} color={Colors.gold} />
                  <Text style={styles.btnSecTxt}>Imprimir</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        );
      })}

      {/* ── BOLETIM ANUAL ── */}
      <View style={[styles.card, { borderColor: Colors.gold + '55', borderWidth: 1.5 }]}>
        <View style={styles.cardTop}>
          <View style={[styles.iconCircle, { backgroundColor: Colors.gold + '22' }]}>
            <Ionicons name="ribbon" size={20} color={Colors.gold} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>Boletim Anual (Final do Ano)</Text>
            <Text style={[styles.cardMotivo, { color: eleg.anual.elegivel ? Colors.success : Colors.warning }]}>{eleg.anual.motivo}</Text>
            <Text style={[styles.smallMuted, { marginTop: 4 }]}>Requer assinatura do Director Geral e Director Pedagógico antes da emissão final.</Text>
          </View>
        </View>

        {eleg.anual.ultimoPedido && (
          <View style={[styles.ultEmiss, { backgroundColor: eleg.anual.ultimoPedido.status === 'assinado' ? Colors.success + '15' : '#fef3c7' }]}>
            <Ionicons name={eleg.anual.ultimoPedido.status === 'assinado' ? 'checkmark-done-circle' : 'time'} size={14} color={eleg.anual.ultimoPedido.status === 'assinado' ? Colors.success : '#92400e'} />
            <Text style={[styles.ultEmissTxt, { color: eleg.anual.ultimoPedido.status === 'assinado' ? Colors.success : '#92400e' }]}>
              {eleg.anual.ultimoPedido.status === 'assinado' ? 'Assinado e disponível' : 'Aguarda assinatura dos directores'} (Nº {eleg.anual.ultimoPedido.numeroSerie})
            </Text>
          </View>
        )}

        <View style={{ flexDirection: 'row', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
          <TouchableOpacity
            style={[styles.btnPrim, !eleg.anual.elegivel && styles.btnDisabled, { backgroundColor: Colors.gold }]}
            disabled={!eleg.anual.elegivel || solicitando === 'anual-anual' || eleg.anual.ultimoPedido?.status === 'pendente_assinatura'}
            onPress={() => solicitar('anual')}
          >
            {solicitando === 'anual-anual' ? <AppLoader color="#fff" size="small" /> : (
              <>
                <Ionicons name="paper-plane" size={14} color="#fff" />
                <Text style={styles.btnTxt}>{eleg.anual.ultimoPedido?.status === 'assinado' ? 'Pedir Reimpressão (taxa)' : 'Solicitar Boletim Anual'}</Text>
              </>
            )}
          </TouchableOpacity>
          {eleg.anual.ultimoPedido?.status === 'assinado' && (
            <TouchableOpacity style={styles.btnSec} onPress={() => abrirHtml(eleg.anual.ultimoPedido!.numeroSerie)}>
              <Ionicons name="print" size={14} color={Colors.gold} />
              <Text style={styles.btnSecTxt}>Imprimir</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* ── BOLETIM II CICLO (só para alunos do II Ciclo com propinas regularizadas) ── */}
      {eligIICiclo?.isIICiclo && (
        <View style={[styles.card, styles.cardIICiclo]}>
          <View style={styles.cardTop}>
            <View style={[styles.iconCircle, { backgroundColor: II_CICLO_COLOR + '18' }]}>
              <Ionicons name="school" size={20} color={II_CICLO_COLOR} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>Boletim de Notas — II Ciclo</Text>
              <Text style={styles.smallMuted}>
                Formato oficial angolano · Colunas MAC / NPP / NPT / MT1
              </Text>
              <Text style={[styles.smallMuted, { marginTop: 2 }]}>
                Disponível mediante regularização das propinas do trimestre.
              </Text>
            </View>
          </View>

          <View style={styles.iicicloGrid}>
            {[1, 2, 3].map((t) => {
              const item = eligIICiclo.trimestres.find((x) => x.trimestre === t)!;
              const isAbrir = abrindoIICiclo === t;
              return (
                <View key={t} style={styles.iicicloRow}>
                  <View style={styles.iicicloRowLeft}>
                    <View style={[
                      styles.iicicloNumBadge,
                      { backgroundColor: item.elegivel ? II_CICLO_COLOR + '18' : '#e5e7eb' },
                    ]}>
                      <Text style={[
                        styles.iicicloNumTxt,
                        { color: item.elegivel ? II_CICLO_COLOR : Colors.textMuted },
                      ]}>{t}º T</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[
                        styles.iicicloMotivo,
                        { color: item.elegivel ? Colors.success : Colors.warning },
                      ]}>
                        {item.elegivel
                          ? 'Propinas em dia'
                          : item.propinas.mesesPendentes.length > 0
                            ? `${item.propinas.mesesPendentes.length} mes(es) por regularizar`
                            : 'Propinas pendentes'}
                      </Text>
                    </View>
                  </View>
                  <TouchableOpacity
                    style={[
                      styles.iicicloBtn,
                      item.elegivel ? styles.iiCicloBtnAtivo : styles.iiCicloBtnBloqueado,
                    ]}
                    disabled={!item.elegivel || isAbrir}
                    onPress={() => abrirBoletimIICiclo(t)}
                    activeOpacity={0.75}
                  >
                    {isAbrir
                      ? <AppLoader color={item.elegivel ? '#fff' : Colors.textMuted} size="small" />
                      : (
                        <>
                          <Ionicons
                            name={item.elegivel ? 'document-text-outline' : 'lock-closed-outline'}
                            size={13}
                            color={item.elegivel ? '#fff' : Colors.textMuted}
                          />
                          <Text style={[
                            styles.iiCicloBtnTxt,
                            { color: item.elegivel ? '#fff' : Colors.textMuted },
                          ]}>
                            {item.elegivel ? 'Ver / Imprimir' : 'Bloqueado'}
                          </Text>
                        </>
                      )}
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>
        </View>
      )}

      {/* ── HISTÓRICO ── */}
      {hist.length > 0 && (
        <View style={{ marginTop: 14 }}>
          <Text style={styles.histTitle}>Histórico de Boletins</Text>
          {hist.map((h) => (
            <TouchableOpacity key={h.id} style={styles.histRow} onPress={() => abrirHtml(h.numeroSerie)}>
              <Ionicons name={h.tipo === 'anual' ? 'ribbon' : 'document-text'} size={16} color={Colors.gold} />
              <View style={{ flex: 1 }}>
                <Text style={styles.histRowTxt}>
                  {h.tipo === 'anual' ? 'Anual' : `${h.trimestre}º Trim.`} · Nº {h.numeroSerie} · {h.viaNumero}ª via
                </Text>
                <Text style={styles.histRowSub}>
                  {new Date(h.dataEmissao).toLocaleDateString('pt-PT')} · Estado: {h.status === 'assinado' ? 'Assinado' : h.status === 'pendente_assinatura' ? 'Aguarda Assinatura' : 'Emitido'}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 18 },
  headerCard: { backgroundColor: Colors.gold + '12', borderRadius: 10, padding: 12, marginBottom: 10, borderLeftWidth: 4, borderLeftColor: Colors.gold },
  headerTitle: { fontSize: 16, fontFamily: 'Inter_700Bold', color: Colors.text },
  headerSub: { fontSize: 12, color: Colors.textMuted, marginTop: 4 },
  card: { backgroundColor: Colors.card || '#fff', borderRadius: 10, padding: 12, marginBottom: 10, borderWidth: 1, borderColor: '#e5e7eb' },
  cardIICiclo: { borderColor: II_CICLO_COLOR + '40', borderWidth: 1.5 },
  cardTop: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  iconCircle: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  iconCircleTxt: { fontSize: 13, fontFamily: 'Inter_700Bold' },
  cardTitle: { fontSize: 14, fontFamily: 'Inter_700Bold', color: Colors.text, marginBottom: 2 },
  cardMotivo: { fontSize: 12, fontFamily: 'Inter_500Medium' },
  smallMuted: { fontSize: 11, color: Colors.textMuted, marginTop: 6, lineHeight: 15 },
  ultEmiss: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8, padding: 6, borderRadius: 6, backgroundColor: Colors.gold + '15' },
  ultEmissTxt: { fontSize: 11, color: Colors.text, flex: 1 },
  btnPrim: { flexDirection: 'row', gap: 6, alignItems: 'center', backgroundColor: Colors.success, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 6 },
  btnSec: { flexDirection: 'row', gap: 6, alignItems: 'center', backgroundColor: 'transparent', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 6, borderWidth: 1, borderColor: Colors.gold },
  btnDisabled: { backgroundColor: '#999', opacity: 0.6 },
  btnTxt: { color: '#fff', fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  btnSecTxt: { color: Colors.gold, fontSize: 12, fontFamily: 'Inter_600SemiBold' },

  // II Ciclo styles
  iicicloGrid: { marginTop: 12, gap: 8 },
  iicicloRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6, borderTopWidth: 1, borderTopColor: '#f3f4f6' },
  iicicloRowLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  iicicloNumBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, alignItems: 'center', justifyContent: 'center', minWidth: 44 },
  iicicloNumTxt: { fontSize: 12, fontFamily: 'Inter_700Bold' },
  iicicloMotivo: { fontSize: 11, fontFamily: 'Inter_500Medium' },
  iicicloBtn: { flexDirection: 'row', gap: 5, alignItems: 'center', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 6, minWidth: 110, justifyContent: 'center' },
  iiCicloBtnAtivo: { backgroundColor: II_CICLO_COLOR },
  iiCicloBtnBloqueado: { backgroundColor: '#f3f4f6', borderWidth: 1, borderColor: '#e5e7eb' },
  iiCicloBtnTxt: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },

  histTitle: { fontSize: 13, fontFamily: 'Inter_700Bold', color: Colors.text, marginBottom: 6 },
  histRow: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, backgroundColor: Colors.card || '#fff', borderRadius: 8, marginBottom: 6, borderWidth: 1, borderColor: '#e5e7eb' },
  histRowTxt: { fontSize: 12, color: Colors.text, fontFamily: 'Inter_600SemiBold' },
  histRowSub: { fontSize: 10, color: Colors.textMuted, marginTop: 2 },
  loadingBox: { padding: 20, alignItems: 'center' },
  loadingTxt: { color: Colors.textMuted, marginTop: 6, fontSize: 12 },
  errBox: { padding: 16, backgroundColor: '#fee2e2', borderRadius: 8 },
  errTxt: { color: '#991b1b', fontSize: 12 },
});
