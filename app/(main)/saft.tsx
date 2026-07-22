import React, { useState, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator,
  Platform, Alert, TextInput,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import { HScrollTabBar } from '@/components/HScrollTabBar';
import { useTabMemory } from '@/hooks/useTabMemory';
import { getAuthToken } from '@/context/AuthContext';
const Colors = {
  bg: '#f0f2f7',
  surface: '#ffffff',
  text: '#1a2b5f',
  textMuted: '#6b7280',
  border: '#e5e7eb',
  gold: '#c9a84c',
  success: '#16a34a',
  danger: '#dc2626',
  warning: '#d97706',
  info: '#1e6fd9',
  green: '#15803d',
  greenBg: '#f0fdf4',
  greenBorder: '#86efac',
  redBg: '#fef2f2',
  redBorder: '#fca5a5',
  yellowBg: '#fffbeb',
  yellowBorder: '#fcd34d',
};

const MESES = ['','Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
const MESES_FULL = ['','Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

const ANO_ATUAL = new Date().getFullYear();

async function apiFetch(url: string, opts?: RequestInit) {
  const token = (await getAuthToken()) || '';
  const res = await fetch(url, {
    ...opts,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(opts?.headers || {}) },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  return res.json();
}

interface ValidacaoResult {
  ano: number;
  ok: boolean;
  erros: string[];
  avisos: string[];
  stats: Record<string, number>;
}

interface Sequencia { serie: string; ano: number; ultimo_num: number; }
interface Exportacao {
  id: string; ano: number; mes_inicio: number; mes_fim: number;
  total_docs: number; total_valor: number; gerado_por: string;
  gerado_em: string; nome_ficheiro: string;
}

function fmtMoney(v: number) {
  return new Intl.NumberFormat('pt-AO', { minimumFractionDigits: 2 }).format(v || 0);
}
function fmtDate(s: string) {
  if (!s) return '—';
  try { return new Date(s).toLocaleDateString('pt-AO', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' }); }
  catch { return s; }
}

const SERIE_LABEL: Record<string, string> = {
  PROP:'Propinas', MAT:'Matrículas', MUL:'Multas', EXA:'Exames', MATER:'Materiais', INSC:'Inscrições', OUT:'Outros',
};
const SERIE_COLOR: Record<string, string> = {
  PROP:'#1e6fd9', MAT:'#15803d', MUL:'#dc2626', EXA:'#d97706', MATER:'#7c3aed', INSC:'#0891b2', OUT:'#6b7280',
};

interface ConfigFiscal {
  nomeEscola?: string;
  nifEscola?: string;
  provinciaEscola?: string;
  municipioEscola?: string;
  morada?: string;
  telefoneEscola?: string;
  emailEscola?: string;
}

export default function SAFTScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const [ano, setAno] = useState(ANO_ATUAL);
  const [mesInicio, setMesInicio] = useState(1);
  const [mesFim, setMesFim] = useState(12);
  const [tab, setTab] = useState<'validar'|'exportar'|'preview'|'historico'|'verificar'|'configurar'>('validar');
  const [verificarNumero, setVerificarNumero] = useState('');
  const [verificarHash, setVerificarHash] = useState('');
  const [verificarResult, setVerificarResult] = useState<any>(null);
  const [verificarLoading, setVerificarLoading] = useState(false);

  // ── Pré-visualização XML ──
  const [xmlContent, setXmlContent] = useState<string | null>(null);
  const [xmlLoading, setXmlLoading] = useState(false);
  const [xmlError, setXmlError] = useState<string | null>(null);
  const [xmlErrosEstrutura, setXmlErrosEstrutura] = useState<string[]>([]);
  const [xmlStats, setXmlStats] = useState<{ linhas: number; tamanho: string; docs: number; valor: string } | null>(null);
  const [xmlCopiado, setXmlCopiado] = useState(false);
  const previewScrollRef = useRef<ScrollView>(null);

  // ── Config fiscal ──
  const [cfgForm, setCfgForm] = useState<ConfigFiscal>({});
  const [cfgSaving, setCfgSaving] = useState(false);
  const [cfgSaved, setCfgSaved] = useState(false);

  const configQ = useQuery<ConfigFiscal>({
    queryKey: ['config-fiscal'],
    queryFn: async () => {
      const data = await apiFetch('/api/config');
      const fields: ConfigFiscal = {
        nomeEscola: data.nomeEscola || '',
        nifEscola: data.nifEscola || '',
        provinciaEscola: data.provinciaEscola || '',
        municipioEscola: data.municipioEscola || '',
        morada: data.morada || '',
        telefoneEscola: data.telefoneEscola || '',
        emailEscola: data.emailEscola || '',
      };
      setCfgForm(fields);
      return fields;
    },
    enabled: tab === 'configurar',
    staleTime: 30000,
  });

  const saveCfg = useCallback(async () => {
    setCfgSaving(true);
    setCfgSaved(false);
    try {
      await apiFetch('/api/config', { method: 'PATCH', body: JSON.stringify(cfgForm) });
      qc.invalidateQueries({ queryKey: ['config-fiscal'] });
      qc.invalidateQueries({ queryKey: ['saft-validar', ano] });
      setCfgSaved(true);
      setTimeout(() => setCfgSaved(false), 3000);
    } catch (e: any) {
      Alert.alert('Erro ao guardar', e.message);
    } finally {
      setCfgSaving(false);
    }
  }, [cfgForm, qc, ano]);

  const validacaoQ = useQuery<ValidacaoResult>({
    queryKey: ['saft-validar', ano],
    queryFn: () => apiFetch(`/api/saft/validar?ano=${ano}`),
    staleTime: 30000,
  });

  const sequenciasQ = useQuery<Sequencia[]>({
    queryKey: ['saft-sequencias', ano],
    queryFn: () => apiFetch(`/api/saft/sequencias?ano=${ano}`),
    staleTime: 30000,
  });

  const historicoQ = useQuery<Exportacao[]>({
    queryKey: ['saft-historico'],
    queryFn: () => apiFetch('/api/saft/historico'),
    staleTime: 30000,
    enabled: tab === 'historico',
  });

  const numerarMut = useMutation({
    mutationFn: () => apiFetch('/api/saft/numerar-pendentes', { method: 'POST', body: JSON.stringify({ ano }) }),
    onSuccess: (data: any) => {
      Alert.alert('Numeração concluída', `${data.numerados} pagamento(s) numerados com sucesso.`);
      qc.invalidateQueries({ queryKey: ['saft-validar', ano] });
      qc.invalidateQueries({ queryKey: ['saft-sequencias', ano] });
    },
    onError: (e: Error) => Alert.alert('Erro', e.message),
  });

  const carregarPreview = useCallback(async () => {
    if (Platform.OS !== 'web') {
      Alert.alert('Pré-visualização', 'Disponível apenas na versão web do SIGA.');
      return;
    }
    setXmlLoading(true);
    setXmlError(null);
    setXmlContent(null);
    setXmlErrosEstrutura([]);
    setXmlStats(null);
    try {
      const token = (await getAuthToken()) || '';
      const url = `/api/saft/exportar?ano=${ano}&mesInicio=${mesInicio}&mesFim=${mesFim}&preview=1`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || res.statusText);
      }
      const text = await res.text();

      // Estatísticas
      const linhas = text.split('\n').length;
      const tamanhoKb = (new TextEncoder().encode(text).length / 1024).toFixed(1);
      const docs = (text.match(/<Invoice>/g) || []).length;
      const valorMatch = text.match(/<TotalCredit>([\d.]+)<\/TotalCredit>/);
      const valor = valorMatch ? parseFloat(valorMatch[1]).toLocaleString('pt-AO', { minimumFractionDigits: 2 }) : '0,00';
      setXmlStats({ linhas, tamanho: `${tamanhoKb} KB`, docs, valor });

      // Validação estrutural via DOMParser
      const parser = new DOMParser();
      const doc = parser.parseFromString(text, 'application/xml');
      const parseErr = doc.querySelector('parsererror');
      const erros: string[] = [];
      if (parseErr) {
        erros.push('XML malformado: ' + (parseErr.textContent || 'erro de parsing').slice(0, 200).trim());
      } else {
        const ns = 'urn:OECD:StandardAuditFile-Tax:AO_1.01_01';
        const required = ['Header', 'MasterFiles', 'SourceDocuments'];
        for (const tag of required) {
          if (!doc.getElementsByTagNameNS(ns, tag).length && !doc.getElementsByTagName(tag).length) {
            erros.push(`Elemento obrigatório ausente: <${tag}>`);
          }
        }
        const companyId = doc.getElementsByTagName('CompanyID')[0]?.textContent;
        if (!companyId || companyId === '999999999') erros.push('CompanyID (NIF) não configurado ou com valor de fallback.');
        const auditCreationDate = doc.getElementsByTagName('AuditFileCreationDate')[0]?.textContent;
        if (!auditCreationDate) erros.push('AuditFileCreationDate ausente no Header.');
      }
      setXmlErrosEstrutura(erros);
      setXmlContent(text);
    } catch (e: any) {
      setXmlError(e.message || 'Erro ao carregar pré-visualização.');
    } finally {
      setXmlLoading(false);
    }
  }, [ano, mesInicio, mesFim]);

  const copiarXml = useCallback(() => {
    if (!xmlContent) return;
    navigator.clipboard?.writeText(xmlContent).then(() => {
      setXmlCopiado(true);
      setTimeout(() => setXmlCopiado(false), 2000);
    }).catch(() => {});
  }, [xmlContent]);

  const exportar = useCallback(async () => {
    if (Platform.OS !== 'web') {
      Alert.alert('Exportação', 'A exportação SAF-T é disponível apenas na versão web do SIGA.');
      return;
    }
    const url = `/api/saft/exportar?ano=${ano}&mesInicio=${mesInicio}&mesFim=${mesFim}`;
    const a = document.createElement('a');
    a.href = url;
    const token = (await getAuthToken()) || '';
    // Fetch with auth then trigger download
    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => {
        if (!r.ok) return r.json().then(e => { throw new Error(e.error || 'Erro ao exportar'); });
        return r.blob();
      })
      .then(blob => {
        const objUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = objUrl;
        link.download = `SAFT-AO_${ano}_${String(mesInicio).padStart(2,'0')}_${String(mesFim).padStart(2,'0')}.xml`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(objUrl);
        qc.invalidateQueries({ queryKey: ['saft-historico'] });
      })
      .catch((e: Error) => Alert.alert('Erro', e.message));
  }, [ano, mesInicio, mesFim, qc]);

  const v = validacaoQ.data;
  const seqs = sequenciasQ.data || [];

  return (
    <View style={styles.root}>
      {/* Header */}
      <View style={styles.headerBar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={20} color={Colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>SAF-T Angola</Text>
          <Text style={styles.headerSub}>Conformidade AGT — Decreto Presidencial n.º 71/25</Text>
        </View>
        <View style={[styles.badge, { backgroundColor: Colors.greenBg, borderColor: Colors.greenBorder }]}>
          <MaterialCommunityIcons name="shield-check" size={14} color={Colors.green} />
          <Text style={[styles.badgeTxt, { color: Colors.green }]}>AGT</Text>
        </View>
      </View>

      {/* Ano selector */}
      <View style={styles.anoRow}>
        {[ANO_ATUAL - 1, ANO_ATUAL, ANO_ATUAL + 1].map(a => (
          <TouchableOpacity key={a} style={[styles.anoBtn, ano === a && styles.anoBtnActive]} onPress={() => setAno(a)}>
            <Text style={[styles.anoBtnTxt, ano === a && styles.anoBtnTxtActive]}>{a}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Tabs */}
      <HScrollTabBar style={styles.tabs} contentContainerStyle={{ flexDirection: 'row' }} bgColor={Colors.surface} keyboardShouldPersistTaps="handled">
        {([
          ['validar', 'shield-check-outline', 'Validação'],
          ['exportar', 'download-outline', 'Exportar XML'],
          ['preview', 'eye-outline', 'Pré-visualizar'],
          ['historico', 'time-outline', 'Histórico'],
          ['verificar', 'search-outline', 'Verificar'],
          ['configurar', 'settings-outline', 'Dados Fiscais'],
        ] as const).map(([t, icon, label]) => (
          <TouchableOpacity key={t} style={[styles.tab, tab === t && styles.tabActive]} onPress={() => setTab(t)}>
            <Ionicons name={icon as any} size={15} color={tab === t ? Colors.text : Colors.textMuted} />
            <Text style={[styles.tabTxt, tab === t && styles.tabTxtActive]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </HScrollTabBar>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>

        {/* ── VALIDAÇÃO ── */}
        {tab === 'validar' && (
          <>
            {validacaoQ.isLoading ? null : validacaoQ.isError ? (
              <ErrorBox msg={(validacaoQ.error as Error).message} onRetry={() => validacaoQ.refetch()} />
            ) : v ? (
              <>
                {/* Status geral */}
                <View style={[styles.statusCard, v.ok ? styles.statusOk : styles.statusErr]}>
                  <Ionicons name={v.ok ? 'checkmark-circle' : 'warning'} size={32}
                    color={v.ok ? Colors.success : Colors.danger} />
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={[styles.statusTitle, { color: v.ok ? Colors.success : Colors.danger }]}>
                      {v.ok ? 'Conforme com o SAF-T AO' : 'Erros de conformidade detectados'}
                    </Text>
                    <Text style={styles.statusSub}>Ano fiscal {v.ano} · {v.erros.length} erro(s) · {v.avisos.length} aviso(s)</Text>
                  </View>
                </View>

                {/* Erros */}
                {v.erros.length > 0 && (
                  <View style={styles.card}>
                    <Text style={styles.cardTitle}>Erros</Text>
                    {v.erros.map((e, i) => (
                      <View key={i} style={styles.alertRow}>
                        <Ionicons name="close-circle" size={16} color={Colors.danger} />
                        <Text style={[styles.alertTxt, { color: Colors.danger }]}>{e}</Text>
                      </View>
                    ))}
                  </View>
                )}

                {/* Avisos */}
                {v.avisos.length > 0 && (
                  <View style={styles.card}>
                    <Text style={styles.cardTitle}>Avisos</Text>
                    {v.avisos.map((a, i) => (
                      <View key={i} style={styles.alertRow}>
                        <Ionicons name="warning" size={16} color={Colors.warning} />
                        <Text style={[styles.alertTxt, { color: Colors.warning }]}>{a}</Text>
                      </View>
                    ))}
                    {v.avisos.some(a => a.includes('sem numeração')) && (
                      <TouchableOpacity
                        style={[styles.btn, { marginTop: 12 }]}
                        onPress={() => numerarMut.mutate()}
                        disabled={numerarMut.isPending}
                      >
                        {numerarMut.isPending
                          ? <ActivityIndicator size="small" color="#fff" />
                          : <MaterialCommunityIcons name="counter" size={16} color="#fff" />}
                        <Text style={styles.btnTxt}>Numerar todos os pagamentos pendentes</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}

                {/* Stats — séries */}
                <View style={styles.card}>
                  <Text style={styles.cardTitle}>Documentos emitidos em {ano}</Text>
                  <View style={styles.seriesGrid}>
                    {seqs.length === 0 ? (
                      <Text style={styles.empty}>Nenhuma série registada para {ano}</Text>
                    ) : (
                      seqs.map(s => (
                        <View key={s.serie} style={[styles.serieCard, { borderLeftColor: SERIE_COLOR[s.serie] || Colors.info }]}>
                          <Text style={[styles.serieTitulo, { color: SERIE_COLOR[s.serie] || Colors.info }]}>{s.serie}</Text>
                          <Text style={styles.serieLabel}>{SERIE_LABEL[s.serie] || s.serie}</Text>
                          <Text style={styles.serieNum}>{s.ultimo_num}</Text>
                          <Text style={styles.serieSub}>docs emitidos</Text>
                        </View>
                      ))
                    )}
                  </View>
                </View>

                {/* Notas de crédito */}
                {(v.stats?.total_notas_credito ?? 0) > 0 && (
                  <View style={[styles.card, { borderLeftWidth: 3, borderLeftColor: Colors.warning }]}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <Ionicons name="receipt-outline" size={16} color={Colors.warning} />
                      <Text style={[styles.cardTitle, { color: Colors.warning }]}>Notas de Crédito (NC)</Text>
                    </View>
                    <Text style={styles.infoTxt}>
                      {v.stats.total_notas_credito} pagamento(s) cancelado(s)/anulado(s) serão incluídos como documentos do tipo NC no ficheiro XML — conforme exigido pelo XSD SAF-T AO.
                    </Text>
                  </View>
                )}

                {/* Info normativa */}
                <View style={[styles.card, { backgroundColor: '#f0f9ff', borderColor: '#bae6fd' }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <Ionicons name="information-circle" size={18} color={Colors.info} />
                    <Text style={[styles.cardTitle, { color: Colors.info }]}>Sobre o SAF-T Angola (v2)</Text>
                  </View>
                  <Text style={styles.infoTxt}>
                    O SAF-T (Standard Audit File for Tax Purposes) é obrigatório ao abrigo do Decreto Presidencial n.º 71/25, de 20 de Março de 2025.{'\n\n'}
                    • ATCUD derivado do sequencial do documento (0-N){'\n'}
                    • Catálogo de produtos/serviços em MasterFiles{'\n'}
                    • NIF com fallback: BI → Cédula → 999999999{'\n'}
                    • Método de pagamento por documento (NU/TB/CC/CH){'\n'}
                    • Notas de Crédito (NC) para cancelamentos{'\n'}
                    • Cadeia de hash SHA-256 por série{'\n'}
                    • Isenção de IVA: art. 9.º al. b) CIVA (educação){'\n'}
                    • Formato XML conforme XSD assoft SAF-T AO v1.01_01{'\n'}
                    • Submissão anual à AGT (portal e-Fatura Angola)
                  </Text>
                </View>
              </>
            ) : null}
          </>
        )}

        {/* ── EXPORTAR ── */}
        {tab === 'exportar' && (
          <>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Período de exportação</Text>
              <Text style={styles.fieldLabel}>Mês inicial</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  {MESES.slice(1).map((m, i) => {
                    const mes = i + 1;
                    return (
                      <TouchableOpacity
                        key={mes}
                        style={[styles.mesBtn, mesInicio === mes && styles.mesBtnActive]}
                        onPress={() => { setMesInicio(mes); if (mes > mesFim) setMesFim(mes); }}
                      >
                        <Text style={[styles.mesBtnTxt, mesInicio === mes && styles.mesBtnTxtActive]}>{m}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </ScrollView>
              <Text style={styles.fieldLabel}>Mês final</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  {MESES.slice(1).map((m, i) => {
                    const mes = i + 1;
                    return (
                      <TouchableOpacity
                        key={mes}
                        style={[styles.mesBtn, mesFim === mes && styles.mesBtnActive, mes < mesInicio && styles.mesBtnDisabled]}
                        onPress={() => mes >= mesInicio && setMesFim(mes)}
                      >
                        <Text style={[styles.mesBtnTxt, mesFim === mes && styles.mesBtnTxtActive]}>{m}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </ScrollView>

              <View style={styles.exportInfo}>
                <Ionicons name="document-text-outline" size={16} color={Colors.info} />
                <Text style={styles.exportInfoTxt}>
                  Ficheiro: <Text style={{ fontFamily: 'Inter_700Bold' }}>
                    SAFT-AO_{ano}_{String(mesInicio).padStart(2,'0')}_{String(mesFim).padStart(2,'0')}.xml
                  </Text>
                  {'\n'}Período: {MESES_FULL[mesInicio]} a {MESES_FULL[mesFim]} de {ano}
                </Text>
              </View>

              <TouchableOpacity style={[styles.btn, styles.btnGreen]} onPress={exportar}>
                <Ionicons name="download-outline" size={18} color="#fff" />
                <Text style={styles.btnTxt}>Exportar XML SAF-T</Text>
              </TouchableOpacity>

              {Platform.OS !== 'web' && (
                <View style={[styles.alertRow, { marginTop: 8, backgroundColor: Colors.yellowBg, padding: 10, borderRadius: 8, borderWidth: 1, borderColor: Colors.yellowBorder }]}>
                  <Ionicons name="warning-outline" size={16} color={Colors.warning} />
                  <Text style={[styles.alertTxt, { color: Colors.warning }]}>
                    A exportação de ficheiros XML está disponível apenas na versão web.
                  </Text>
                </View>
              )}
            </View>

            <View style={[styles.card, { backgroundColor: Colors.greenBg, borderColor: Colors.greenBorder }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <MaterialCommunityIcons name="shield-check" size={18} color={Colors.green} />
                <Text style={[styles.cardTitle, { color: Colors.green }]}>Conformidade garantida</Text>
              </View>
              <Text style={[styles.infoTxt, { color: '#166534' }]}>
                O ficheiro XML gerado inclui:{'\n'}
                • Numeração sequencial SAF-T (sem lacunas){'\n'}
                • Cadeia de hash SHA-256 por série documental{'\n'}
                • Dados do contribuinte (NIF escola){'\n'}
                • NIF do cliente (encarregado/aluno){'\n'}
                • Isenção IVA: código M07 / art. 9.º al. b) CIVA{'\n'}
                • Formato XSD SAF-T AO v1.01_01
              </Text>
            </View>
          </>
        )}

        {/* ── PRÉ-VISUALIZAÇÃO XML ── */}
        {tab === 'preview' && (
          <>
            {/* Seletor de período */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Período a pré-visualizar</Text>
              <Text style={styles.fieldLabel}>Mês inicial</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  {MESES.slice(1).map((m, i) => {
                    const mes = i + 1;
                    return (
                      <TouchableOpacity key={mes} style={[styles.mesBtn, mesInicio === mes && styles.mesBtnActive]}
                        onPress={() => { setMesInicio(mes); if (mes > mesFim) setMesFim(mes); setXmlContent(null); }}>
                        <Text style={[styles.mesBtnTxt, mesInicio === mes && styles.mesBtnTxtActive]}>{m}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </ScrollView>
              <Text style={styles.fieldLabel}>Mês final</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  {MESES.slice(1).map((m, i) => {
                    const mes = i + 1;
                    return (
                      <TouchableOpacity key={mes}
                        style={[styles.mesBtn, mesFim === mes && styles.mesBtnActive, mes < mesInicio && styles.mesBtnDisabled]}
                        onPress={() => { if (mes >= mesInicio) { setMesFim(mes); setXmlContent(null); } }}>
                        <Text style={[styles.mesBtnTxt, mesFim === mes && styles.mesBtnTxtActive]}>{m}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </ScrollView>
              <TouchableOpacity
                style={[styles.btn, { backgroundColor: Colors.info }]}
                onPress={carregarPreview}
                disabled={xmlLoading}
              >
                {xmlLoading
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Ionicons name="eye-outline" size={18} color="#fff" />}
                <Text style={styles.btnTxt}>
                  {xmlLoading ? 'A gerar XML...' : `Pré-visualizar ${MESES_FULL[mesInicio]}–${MESES_FULL[mesFim]} ${ano}`}
                </Text>
              </TouchableOpacity>
              {Platform.OS !== 'web' && (
                <View style={[styles.alertRow, { marginTop: 8, backgroundColor: Colors.yellowBg, padding: 10, borderRadius: 8, borderWidth: 1, borderColor: Colors.yellowBorder }]}>
                  <Ionicons name="warning-outline" size={16} color={Colors.warning} />
                  <Text style={[styles.alertTxt, { color: Colors.warning }]}>A pré-visualização está disponível apenas na versão web.</Text>
                </View>
              )}
            </View>

            {/* Erro ao carregar */}
            {xmlError && (
              <ErrorBox msg={xmlError} onRetry={carregarPreview} />
            )}

            {/* Resultado */}
            {xmlContent && (
              <>
                {/* Erros estruturais */}
                {xmlErrosEstrutura.length > 0 ? (
                  <View style={[styles.card, { backgroundColor: Colors.redBg, borderColor: Colors.redBorder }]}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                      <Ionicons name="warning" size={18} color={Colors.danger} />
                      <Text style={[styles.cardTitle, { marginBottom: 0, color: Colors.danger }]}>
                        {xmlErrosEstrutura.length} erro(s) estrutural(is) detectado(s)
                      </Text>
                    </View>
                    {xmlErrosEstrutura.map((e, i) => (
                      <View key={i} style={[styles.alertRow, { marginBottom: 4 }]}>
                        <Ionicons name="close-circle" size={14} color={Colors.danger} />
                        <Text style={[styles.alertTxt, { color: Colors.danger, fontSize: 12 }]}>{e}</Text>
                      </View>
                    ))}
                  </View>
                ) : (
                  <View style={[styles.card, { backgroundColor: Colors.greenBg, borderColor: Colors.greenBorder }]}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Ionicons name="checkmark-circle" size={18} color={Colors.success} />
                      <Text style={[styles.cardTitle, { marginBottom: 0, color: Colors.success }]}>
                        XML estruturalmente válido — sem erros detectados
                      </Text>
                    </View>
                  </View>
                )}

                {/* Estatísticas */}
                {xmlStats && (
                  <View style={[styles.card, { paddingVertical: 12 }]}>
                    <Text style={[styles.cardTitle, { marginBottom: 10 }]}>Estatísticas do ficheiro</Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                      {[
                        { icon: 'document-text-outline', label: 'Linhas', val: xmlStats.linhas.toLocaleString('pt-AO') },
                        { icon: 'archive-outline', label: 'Tamanho', val: xmlStats.tamanho },
                        { icon: 'receipt-outline', label: 'Documentos', val: String(xmlStats.docs) },
                        { icon: 'cash-outline', label: 'Total', val: `${xmlStats.valor} Kz` },
                      ].map(s => (
                        <View key={s.label} style={{ flex: 1, minWidth: 110, backgroundColor: Colors.bg, borderRadius: 8, padding: 10, alignItems: 'center', gap: 4 }}>
                          <Ionicons name={s.icon as any} size={18} color={Colors.info} />
                          <Text style={{ fontSize: 15, fontFamily: 'Inter_700Bold', color: Colors.text }}>{s.val}</Text>
                          <Text style={{ fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted }}>{s.label}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                )}

                {/* Viewer XML com destaque de sintaxe */}
                <View style={[styles.card, { padding: 0, overflow: 'hidden' }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.border, backgroundColor: '#1e2030' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <MaterialCommunityIcons name="xml" size={16} color="#a6b0cf" />
                      <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 13, color: '#a6b0cf' }}>
                        SAFT-AO_{ano}_{String(mesInicio).padStart(2,'0')}_{String(mesFim).padStart(2,'0')}.xml
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: xmlCopiado ? '#166534' : '#2d3250', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6 }}
                      onPress={copiarXml}
                    >
                      <Ionicons name={xmlCopiado ? 'checkmark' : 'copy-outline'} size={14} color={xmlCopiado ? '#86efac' : '#a6b0cf'} />
                      <Text style={{ fontSize: 12, fontFamily: 'Inter_500Medium', color: xmlCopiado ? '#86efac' : '#a6b0cf' }}>
                        {xmlCopiado ? 'Copiado!' : 'Copiar'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                  <ScrollView
                    ref={previewScrollRef}
                    horizontal
                    style={{ backgroundColor: '#1a1b26' }}
                    contentContainerStyle={{ minWidth: '100%' }}
                    showsHorizontalScrollIndicator
                  >
                    <ScrollView
                      style={{ backgroundColor: '#1a1b26', maxHeight: 520 }}
                      showsVerticalScrollIndicator
                    >
                      {Platform.OS === 'web' ? (
                        <XmlHighlighter xml={xmlContent} />
                      ) : (
                        <Text style={{ fontFamily: 'monospace', fontSize: 11, color: '#c0caf5', padding: 14, lineHeight: 18 }}>
                          {xmlContent}
                        </Text>
                      )}
                    </ScrollView>
                  </ScrollView>
                </View>
              </>
            )}
          </>
        )}

        {/* ── HISTÓRICO ── */}
        {tab === 'historico' && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Exportações anteriores</Text>
            {historicoQ.isLoading ? null : historicoQ.isError ? (
              <ErrorBox msg={(historicoQ.error as Error).message} onRetry={() => historicoQ.refetch()} />
            ) : (historicoQ.data || []).length === 0 ? (
              <Text style={styles.empty}>Nenhuma exportação registada.</Text>
            ) : (
              (historicoQ.data || []).map(h => (
                <View key={h.id} style={styles.histRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.histNome}>{h.nome_ficheiro || `SAFT-AO_${h.ano}.xml`}</Text>
                    <Text style={styles.histSub}>
                      {MESES_FULL[h.mes_inicio]} – {MESES_FULL[h.mes_fim]} {h.ano} · {h.total_docs} docs · {fmtMoney(h.total_valor)} Kz
                    </Text>
                    <Text style={styles.histMeta}>Por: {h.gerado_por || '—'} · {fmtDate(h.gerado_em)}</Text>
                  </View>
                  <MaterialCommunityIcons name="check-circle" size={18} color={Colors.success} />
                </View>
              ))
            )}
          </View>
        )}

        {/* ── VERIFICAR DOCUMENTO ── */}
        {tab === 'verificar' && (
          <>
            <View style={[styles.card, { borderColor: '#bfdbfe', backgroundColor: '#eff6ff' }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <Ionicons name="shield-checkmark-outline" size={20} color={Colors.info} />
                <Text style={[styles.cardTitle, { marginBottom: 0, color: Colors.info }]}>Verificação de Documento SAF-T</Text>
              </View>
              <Text style={[styles.infoTxt, { color: Colors.info }]}>
                Verifica a autenticidade de um recibo emitido pelo SIGA. Insere o número de série (ex: PROP 2025/47) e opcionalmente o hash impresso no recibo.
              </Text>
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>
                Número de série do documento <Text style={{ color: Colors.danger }}>*</Text>
              </Text>
              <TextInput
                style={[styles.input, !verificarNumero.trim() && { borderColor: Colors.textMuted, borderWidth: 1 }]}
                value={verificarNumero}
                onChangeText={v => { setVerificarNumero(v); setVerificarResult(null); }}
                placeholder="Ex: PROP 2025/47"
                placeholderTextColor={Colors.textMuted}
                autoCapitalize="characters"
              />
              {!verificarNumero.trim() && (
                <Text style={{ fontSize: 11, color: Colors.textMuted, marginTop: 4, fontFamily: 'Inter_400Regular' }}>
                  Obrigatório — preenche o número de série para activar o botão
                </Text>
              )}
              <Text style={[styles.fieldLabel, { marginTop: 12 }]}>Hash (opcional — 8 primeiros caracteres ou completo)</Text>
              <TextInput
                style={styles.input}
                value={verificarHash}
                onChangeText={v => { setVerificarHash(v); setVerificarResult(null); }}
                placeholder="Ex: A3F8C21D ou hash completo SHA-256"
                placeholderTextColor={Colors.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TouchableOpacity
                style={[
                  styles.btn,
                  { marginTop: 14 },
                  (verificarLoading || !verificarNumero.trim())
                    ? { backgroundColor: Colors.textMuted, opacity: 0.5 }
                    : { backgroundColor: Colors.info },
                ]}
                disabled={verificarLoading || !verificarNumero.trim()}
                onPress={async () => {
                  setVerificarLoading(true);
                  setVerificarResult(null);
                  try {
                    const result = await apiFetch('/api/saft/verificar-hash', {
                      method: 'POST',
                      body: JSON.stringify({ numeroSerie: verificarNumero.trim(), hashFornecido: verificarHash.trim() || undefined }),
                    });
                    setVerificarResult(result);
                  } catch (e: any) {
                    Alert.alert('Erro', e.message);
                  } finally {
                    setVerificarLoading(false);
                  }
                }}
              >
                {verificarLoading ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Ionicons name="search" size={16} color="#fff" />
                    <Text style={styles.btnTxt}>Verificar documento</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>

            {verificarResult && (
              <View style={[
                styles.statusCard,
                verificarResult.valido ? styles.statusOk : styles.statusErr,
              ]}>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <MaterialCommunityIcons
                      name={verificarResult.valido ? 'shield-check' : verificarResult.encontrado ? 'shield-alert' : 'shield-off'}
                      size={22}
                      color={verificarResult.valido ? Colors.success : Colors.danger}
                    />
                    <Text style={[styles.statusTitle, { color: verificarResult.valido ? Colors.success : Colors.danger }]}>
                      {verificarResult.mensagem}
                    </Text>
                  </View>
                  {verificarResult.encontrado && (
                    <View style={{ gap: 4, marginTop: 4 }}>
                      {verificarResult.numeroSerie && (
                        <Text style={styles.infoTxt}>N.º Série: <Text style={{ fontFamily: 'Inter_700Bold', color: Colors.text }}>{verificarResult.numeroSerie}</Text></Text>
                      )}
                      {verificarResult.aluno && (
                        <Text style={styles.infoTxt}>Cliente/Aluno: <Text style={{ fontFamily: 'Inter_600SemiBold' }}>{verificarResult.aluno}</Text></Text>
                      )}
                      {verificarResult.valor != null && (
                        <Text style={styles.infoTxt}>Valor: <Text style={{ fontFamily: 'Inter_700Bold' }}>{fmtMoney(verificarResult.valor)} Kz</Text></Text>
                      )}
                      {verificarResult.data && (
                        <Text style={styles.infoTxt}>Data: {fmtDate(verificarResult.data)}</Text>
                      )}
                      {verificarResult.hashCurto && (
                        <Text style={styles.infoTxt}>Hash registado (8 chr): <Text style={{ fontFamily: 'Inter_600SemiBold', letterSpacing: 1 }}>{verificarResult.hashCurto}</Text></Text>
                      )}
                      {verificarResult.hashMatch === false && (
                        <View style={[styles.alertRow, { marginTop: 6 }]}>
                          <Ionicons name="warning" size={16} color={Colors.danger} />
                          <Text style={[styles.alertTxt, { color: Colors.danger }]}>O hash fornecido não corresponde ao registado — este documento pode ter sido alterado.</Text>
                        </View>
                      )}
                    </View>
                  )}
                </View>
              </View>
            )}
          </>
        )}
        {/* ── DADOS FISCAIS ── */}
        {tab === 'configurar' && (
          <>
            {/* Aviso NIF obrigatório */}
            <View style={[styles.card, { backgroundColor: '#fffbeb', borderColor: Colors.yellowBorder }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <Ionicons name="warning-outline" size={18} color={Colors.warning} />
                <Text style={[styles.cardTitle, { marginBottom: 0, color: Colors.warning }]}>NIF obrigatório para SAF-T</Text>
              </View>
              <Text style={[styles.infoTxt, { color: '#92400e' }]}>
                O NIF da escola é obrigatório para gerar ficheiros SAF-T válidos para a AGT. Sem NIF configurado, a exportação ficará inválida.
              </Text>
            </View>

            {configQ.isLoading ? null : configQ.isError ? (
              <ErrorBox msg={(configQ.error as Error).message} onRetry={() => configQ.refetch()} />
            ) : (
              <>
                <View style={styles.card}>
                  <Text style={styles.cardTitle}>Identificação Fiscal</Text>

                  <Text style={styles.fieldLabel}>
                    NIF da Escola <Text style={{ color: Colors.danger }}>*</Text>
                  </Text>
                  <TextInput
                    style={[styles.input, { marginBottom: 14 }, !cfgForm.nifEscola && { borderColor: Colors.warning }]}
                    value={cfgForm.nifEscola}
                    onChangeText={v => setCfgForm(f => ({ ...f, nifEscola: v }))}
                    placeholder="Ex: 5000123456"
                    placeholderTextColor={Colors.textMuted}
                    keyboardType="numeric"
                  />

                  <Text style={styles.fieldLabel}>Nome da Escola</Text>
                  <TextInput
                    style={[styles.input, { marginBottom: 14 }]}
                    value={cfgForm.nomeEscola}
                    onChangeText={v => setCfgForm(f => ({ ...f, nomeEscola: v }))}
                    placeholder="Ex: Escola Secundária N.º 1 de Luanda"
                    placeholderTextColor={Colors.textMuted}
                  />

                  <Text style={styles.fieldLabel}>Morada</Text>
                  <TextInput
                    style={[styles.input, { marginBottom: 14 }]}
                    value={cfgForm.morada}
                    onChangeText={v => setCfgForm(f => ({ ...f, morada: v }))}
                    placeholder="Ex: Rua Comandante Gika, n.º 12"
                    placeholderTextColor={Colors.textMuted}
                  />

                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.fieldLabel}>Província</Text>
                      <TextInput
                        style={[styles.input, { marginBottom: 14 }]}
                        value={cfgForm.provinciaEscola}
                        onChangeText={v => setCfgForm(f => ({ ...f, provinciaEscola: v }))}
                        placeholder="Ex: Luanda"
                        placeholderTextColor={Colors.textMuted}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.fieldLabel}>Município</Text>
                      <TextInput
                        style={[styles.input, { marginBottom: 14 }]}
                        value={cfgForm.municipioEscola}
                        onChangeText={v => setCfgForm(f => ({ ...f, municipioEscola: v }))}
                        placeholder="Ex: Luanda"
                        placeholderTextColor={Colors.textMuted}
                      />
                    </View>
                  </View>
                </View>

                <View style={styles.card}>
                  <Text style={styles.cardTitle}>Contactos</Text>
                  <Text style={styles.fieldLabel}>Telefone</Text>
                  <TextInput
                    style={[styles.input, { marginBottom: 14 }]}
                    value={cfgForm.telefoneEscola}
                    onChangeText={v => setCfgForm(f => ({ ...f, telefoneEscola: v }))}
                    placeholder="Ex: +244 222 000 000"
                    placeholderTextColor={Colors.textMuted}
                    keyboardType="phone-pad"
                  />
                  <Text style={styles.fieldLabel}>E-mail</Text>
                  <TextInput
                    style={[styles.input, { marginBottom: 4 }]}
                    value={cfgForm.emailEscola}
                    onChangeText={v => setCfgForm(f => ({ ...f, emailEscola: v }))}
                    placeholder="Ex: geral@escola.ao"
                    placeholderTextColor={Colors.textMuted}
                    keyboardType="email-address"
                    autoCapitalize="none"
                  />
                </View>

                {/* Pré-visualização do cabeçalho SAF-T */}
                <View style={[styles.card, { backgroundColor: '#f8fafc', borderColor: '#cbd5e1' }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                    <Ionicons name="eye-outline" size={16} color={Colors.textMuted} />
                    <Text style={[styles.cardTitle, { marginBottom: 0, color: Colors.textMuted }]}>Pré-visualização no ficheiro SAF-T</Text>
                  </View>
                  <Text style={[styles.infoTxt, { fontFamily: 'Inter_400Regular', lineHeight: 22 }]}>
                    <Text style={{ fontFamily: 'Inter_700Bold', color: Colors.text }}>CompanyID / NIF: </Text>
                    {cfgForm.nifEscola || <Text style={{ color: Colors.warning }}>⚠ não definido</Text>}{'\n'}
                    <Text style={{ fontFamily: 'Inter_700Bold', color: Colors.text }}>CompanyName: </Text>
                    {cfgForm.nomeEscola || '—'}{'\n'}
                    <Text style={{ fontFamily: 'Inter_700Bold', color: Colors.text }}>Endereço: </Text>
                    {[cfgForm.morada, cfgForm.municipioEscola, cfgForm.provinciaEscola].filter(Boolean).join(', ') || '—'}{'\n'}
                    <Text style={{ fontFamily: 'Inter_700Bold', color: Colors.text }}>País: </Text>AO — Angola
                  </Text>
                </View>

                {/* Botão guardar */}
                {cfgSaved && (
                  <View style={[styles.statusCard, styles.statusOk, { marginBottom: 2 }]}>
                    <Ionicons name="checkmark-circle" size={20} color={Colors.success} />
                    <Text style={[styles.statusTitle, { color: Colors.success, marginLeft: 8, fontSize: 14 }]}>
                      Dados fiscais guardados com sucesso!
                    </Text>
                  </View>
                )}

                <TouchableOpacity
                  style={[styles.btn, styles.btnGreen, !cfgForm.nifEscola && { opacity: 0.6 }]}
                  onPress={saveCfg}
                  disabled={cfgSaving}
                >
                  {cfgSaving
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <Ionicons name="save-outline" size={18} color="#fff" />}
                  <Text style={styles.btnTxt}>
                    {cfgSaving ? 'A guardar...' : 'Guardar dados fiscais'}
                  </Text>
                </TouchableOpacity>
              </>
            )}
          </>
        )}

      </ScrollView>
    </View>
  );
}

function ErrorBox({ msg, onRetry }: { msg: string; onRetry: () => void }) {
  return (
    <View style={[styles.card, { backgroundColor: '#fef2f2', borderColor: '#fca5a5' }]}>
      <Text style={{ color: Colors.danger, fontFamily: 'Inter_600SemiBold', marginBottom: 8 }}>Erro ao carregar</Text>
      <Text style={{ color: Colors.danger, fontSize: 13, marginBottom: 12 }}>{msg}</Text>
      <TouchableOpacity style={[styles.btn, { backgroundColor: Colors.danger }]} onPress={onRetry}>
        <Ionicons name="refresh" size={16} color="#fff" />
        <Text style={styles.btnTxt}>Tentar novamente</Text>
      </TouchableOpacity>
    </View>
  );
}

// ── Destaque de sintaxe XML (web only) ──────────────────────────────────────
function highlightXml(xml: string): string {
  // Escapa HTML primeiro
  const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  let result = '';
  let i = 0;
  const len = xml.length;

  while (i < len) {
    if (xml[i] === '<') {
      // Encontrar o fim do tag
      let end = xml.indexOf('>', i);
      if (end === -1) { result += esc(xml.slice(i)); break; }
      const raw = xml.slice(i, end + 1); // inclui < e >

      if (raw.startsWith('<?')) {
        // Declaração XML
        result += `<span style="color:#6a9955">${esc(raw)}</span>`;
      } else if (raw.startsWith('<!--')) {
        // Comentário (pode ser multi-linha)
        const endComment = xml.indexOf('-->', i);
        if (endComment === -1) { result += esc(xml.slice(i)); break; }
        const comment = xml.slice(i, endComment + 3);
        result += `<span style="color:#608b4e">${esc(comment)}</span>`;
        i = endComment + 3;
        continue;
      } else if (raw.startsWith('</')) {
        // Tag de fecho
        result += `<span style="color:#569cd6">&lt;/</span><span style="color:#4ec9b0">${esc(raw.slice(2, raw.length - 1).trim())}</span><span style="color:#569cd6">&gt;</span>`;
      } else {
        // Tag de abertura / auto-fechada — separar nome e atributos
        const inner = raw.startsWith('<') ? raw.slice(1, raw.endsWith('/>') ? -2 : -1) : raw;
        const spaceIdx = inner.search(/\s/);
        const tagName = spaceIdx === -1 ? inner.trim() : inner.slice(0, spaceIdx);
        const attrStr = spaceIdx === -1 ? '' : inner.slice(spaceIdx);
        const selfClose = raw.endsWith('/>');

        // Colorir atributos: nome="valor"
        const coloredAttrs = attrStr.replace(
          /(\s+)([\w:.-]+)(=)("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g,
          (_m, ws, name, eq, val) =>
            `${ws}<span style="color:#9cdcfe">${esc(name)}</span><span style="color:#d4d4d4">=</span><span style="color:#ce9178">${esc(val)}</span>`
        );

        result += `<span style="color:#569cd6">&lt;</span><span style="color:#4ec9b0">${esc(tagName)}</span>${coloredAttrs}<span style="color:#569cd6">${selfClose ? ' />' : '>'}</span>`;
      }
      i = end + 1;
    } else {
      // Conteúdo de texto
      const next = xml.indexOf('<', i);
      const text = next === -1 ? xml.slice(i) : xml.slice(i, next);
      const trimmed = text.trim();
      if (trimmed) {
        result += `<span style="color:#d4d4d4">${esc(text)}</span>`;
      } else {
        result += esc(text);
      }
      i = next === -1 ? len : next;
    }
  }
  return result;
}

function XmlHighlighter({ xml }: { xml: string }) {
  const html = React.useMemo(() => {
    const lines = xml.split('\n');
    const highlighted = highlightXml(xml);
    const highlightedLines = highlighted.split('\n');
    const lineCount = lines.length;
    const pad = String(lineCount).length;

    const lineNums = Array.from({ length: lineCount }, (_, i) =>
      String(i + 1).padStart(pad, ' ')
    ).join('\n');

    const codeLines = highlightedLines.join('\n');

    return `
      <div style="display:flex;font-family:'Courier New',Courier,monospace;font-size:12px;line-height:18px;tab-size:2;">
        <div style="padding:14px 10px 14px 14px;text-align:right;color:#4a5568;background:#161720;user-select:none;min-width:${pad * 8 + 20}px;white-space:pre;border-right:1px solid #2d3250;">${lineNums}</div>
        <pre style="margin:0;padding:14px;color:#c0caf5;background:#1a1b26;flex:1;overflow:visible;white-space:pre;">${codeLines}</pre>
      </div>`;
  }, [xml]);

  return (
    <div
      // @ts-ignore — web only
      dangerouslySetInnerHTML={{ __html: html }}
      style={{ minWidth: '100%' } as any}
    />
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  headerBar: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: Colors.surface, paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 17, fontFamily: 'Inter_700Bold', color: Colors.text },
  headerSub: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
  badge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, borderWidth: 1,
  },
  badgeTxt: { fontSize: 11, fontFamily: 'Inter_700Bold' },
  anoRow: {
    flexDirection: 'row', gap: 8, padding: 12,
    backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  anoBtn: { paddingHorizontal: 16, paddingVertical: 6, borderRadius: 8, backgroundColor: Colors.bg },
  anoBtnActive: { backgroundColor: Colors.text },
  anoBtnTxt: { fontSize: 13, color: Colors.textMuted, fontFamily: 'Inter_600SemiBold' },
  anoBtnTxtActive: { color: '#fff' },
  tabs: {
    backgroundColor: Colors.surface,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  tab: { alignItems: 'center', paddingVertical: 10, paddingHorizontal: 18, gap: 4 },
  tabActive: { borderBottomWidth: 2, borderBottomColor: Colors.text },
  tabTxt: { fontSize: 11, color: Colors.textMuted, fontFamily: 'Inter_500Medium' },
  tabTxtActive: { color: Colors.text, fontFamily: 'Inter_700Bold' },
  scroll: { flex: 1 },
  scrollContent: { padding: 12, gap: 12 },
  card: {
    backgroundColor: Colors.surface, borderRadius: 12, padding: 16,
    borderWidth: 1, borderColor: Colors.border, marginBottom: 2,
  },
  cardTitle: { fontSize: 14, fontFamily: 'Inter_700Bold', color: Colors.text, marginBottom: 12 },
  statusCard: {
    flexDirection: 'row', alignItems: 'center', padding: 16, borderRadius: 12,
    borderWidth: 1, marginBottom: 2,
  },
  statusOk: { backgroundColor: Colors.greenBg, borderColor: Colors.greenBorder },
  statusErr: { backgroundColor: Colors.redBg, borderColor: Colors.redBorder },
  statusTitle: { fontSize: 15, fontFamily: 'Inter_700Bold' },
  statusSub: { fontSize: 12, color: Colors.textMuted, marginTop: 3 },
  alertRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 8 },
  alertTxt: { flex: 1, fontSize: 13, lineHeight: 19 },
  btn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, backgroundColor: Colors.info, borderRadius: 10,
    paddingVertical: 12, paddingHorizontal: 16,
  },
  btnGreen: { backgroundColor: Colors.green },
  btnTxt: { color: '#fff', fontFamily: 'Inter_700Bold', fontSize: 14 },
  seriesGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  serieCard: {
    borderLeftWidth: 4, backgroundColor: Colors.bg, borderRadius: 8,
    padding: 12, minWidth: 100, flexGrow: 1,
  },
  serieTitulo: { fontSize: 13, fontFamily: 'Inter_700Bold' },
  serieLabel: { fontSize: 10, color: Colors.textMuted, marginBottom: 6 },
  serieNum: { fontSize: 22, fontFamily: 'Inter_700Bold', color: Colors.text },
  serieSub: { fontSize: 10, color: Colors.textMuted },
  infoTxt: { fontSize: 12.5, color: Colors.textMuted, lineHeight: 20 },
  fieldLabel: { fontSize: 12, color: Colors.textMuted, fontFamily: 'Inter_600SemiBold', marginBottom: 8 },
  mesBtn: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8,
    backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.border,
  },
  mesBtnActive: { backgroundColor: Colors.info, borderColor: Colors.info },
  mesBtnDisabled: { opacity: 0.4 },
  mesBtnTxt: { fontSize: 12, color: Colors.textMuted, fontFamily: 'Inter_500Medium' },
  mesBtnTxtActive: { color: '#fff', fontFamily: 'Inter_700Bold' },
  exportInfo: {
    flexDirection: 'row', gap: 8, alignItems: 'flex-start',
    backgroundColor: '#eff6ff', borderRadius: 8, padding: 12,
    borderWidth: 1, borderColor: '#bfdbfe', marginBottom: 14,
  },
  exportInfoTxt: { flex: 1, fontSize: 12, color: Colors.info, lineHeight: 18 },
  histRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  histNome: { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: Colors.text },
  histSub: { fontSize: 11.5, color: Colors.textMuted, marginTop: 2 },
  histMeta: { fontSize: 10.5, color: Colors.textMuted, marginTop: 2, fontStyle: 'italic' },
  empty: { fontSize: 13, color: Colors.textMuted, textAlign: 'center', paddingVertical: 20 },
  input: {
    borderWidth: 1, borderColor: Colors.border, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 10, fontSize: 14,
    color: Colors.text, backgroundColor: Colors.bg, fontFamily: 'Inter_400Regular',
  },
});
