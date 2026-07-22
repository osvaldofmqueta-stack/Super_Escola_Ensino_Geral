import React, { useEffect, useState, useCallback } from 'react';
import {Alert, KeyboardAvoidingView, Linking, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View} from 'react-native';
import AppLoader from '@/components/AppLoader';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Colors } from '@/constants/colors';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';
import { getApiUrl } from '@/lib/query-client';
import { getAuthToken } from '@/context/AuthContext';
import TopBar from '@/components/TopBar';
import { StableSearchInput } from '@/components/StableSearchInput';
import { SkeletonPage } from '@/components/Skeleton';

const ROLES_PODE_ASSINAR = ['director', 'ceo', 'pca', 'admin'];
const ROLES_PODE_EMITIR = ['secretaria', 'chefe_secretaria', 'director', 'ceo', 'pca', 'admin'];

type Pendente = {
  id: string;
  numeroSerie: string;
  alunoId: string;
  aluno_nome: string;
  aluno_apelido: string;
  numeroMatricula: string;
  turma_nome: string;
  turma_classe: string;
  tipo: string;
  trimestre: number | null;
  anoLetivo: string;
  dataEmissao: string;
};

export default function BoletinsSecretaria() {
  const router = useRouter();
  const { user } = useAuth();
  const role = user?.role || '';
  const podeEmitir = ROLES_PODE_EMITIR.includes(role);
  const podeAssinar = ROLES_PODE_ASSINAR.includes(role);

  const [pendentes, setPendentes] = useState<Pendente[]>([]);
  const [loading, setLoading] = useState(true);
  const [showLote, setShowLote] = useState(false);
  const [showIndividual, setShowIndividual] = useState(false);
  const [turmas, setTurmas] = useState<any[]>([]);
  const [alunos, setAlunos] = useState<any[]>([]);
  const [loteForm, setLoteForm] = useState({ turmaId: '', tipo: 'trimestral' as 'trimestral' | 'anual', trimestre: 1 });
  const [indForm, setIndForm] = useState({ alunoId: '', tipo: 'trimestral' as 'trimestral' | 'anual', trimestre: 1, search: '' });
  const [acao, setAcao] = useState<string | null>(null);
  const [searchIICiclo, setSearchIICiclo] = useState('');

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const [p, t, a] = await Promise.all([
        api.get<Pendente[]>('/api/secretaria/boletins/pendentes-assinatura').catch(() => []),
        api.get<any[]>('/api/turmas').catch(() => []),
        api.get<any[]>('/api/alunos').catch(() => []),
      ]);
      setPendentes(p);
      setTurmas(t);
      setAlunos(a);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { if (podeEmitir) carregar(); }, [carregar, podeEmitir]);

  if (!podeEmitir) {
    return (
      <View style={styles.bg}>
        <TopBar title="Boletins de Notas" />
        <View style={styles.permBox}>
          <Ionicons name="lock-closed" size={48} color={Colors.warning} />
          <Text style={styles.permTitle}>Acesso restrito</Text>
          <Text style={styles.permTxt}>Apenas Secretaria, Chefe de Secretaria e Direcção podem aceder à emissão de boletins.</Text>
          <Text style={[styles.permTxt, { marginTop: 4, fontSize: 12 }]}>Director(a) de Turma não tem permissão para emitir boletins.</Text>
        </View>
      </View>
    );
  }

  async function abrirHtml(numeroSerie: string) {
    const base = getApiUrl();
    const token = await getAuthToken();
    const url = `${base}/api/boletins/${numeroSerie}/html?token=${encodeURIComponent(token || '')}`;
    if (Platform.OS === 'web') window.open(url, '_blank');
    else Linking.openURL(url);
  }

  async function imprimirLoteJaEmitido() {
    if (!loteForm.turmaId) return Alert.alert('Atenção', 'Escolha a turma.');
    const base = getApiUrl();
    const token = await getAuthToken();
    const q = `tipo=${loteForm.tipo}${loteForm.tipo === 'trimestral' ? `&trimestre=${loteForm.trimestre}` : ''}`;
    const url = `${base}/api/secretaria/boletins/lote-turma/${loteForm.turmaId}/imprimir?${q}&token=${encodeURIComponent(token || '')}`;
    if (Platform.OS === 'web') window.open(url, '_blank');
    else Linking.openURL(url);
  }

  async function emitirLote() {
    if (!loteForm.turmaId) return Alert.alert('Atenção', 'Escolha a turma.');
    setAcao('lote');
    try {
      const r: any = await api.post(`/api/secretaria/boletins/lote-turma/${loteForm.turmaId}`, {
        tipo: loteForm.tipo, trimestre: loteForm.tipo === 'trimestral' ? loteForm.trimestre : undefined,
      });
      Alert.alert('Lote emitido', `${r.total} boletins gerados.`, [
        { text: 'Imprimir agora', onPress: () => imprimirLoteJaEmitido() },
        { text: 'Fechar', style: 'cancel' },
      ]);
      setShowLote(false);
      carregar();
    } catch (e: any) {
      Alert.alert('Erro', e.message);
    } finally { setAcao(null); }
  }

  async function emitirIndividual() {
    if (!indForm.alunoId) return Alert.alert('Atenção', 'Escolha o aluno.');
    setAcao('ind');
    try {
      const r: any = await api.post('/api/secretaria/boletins/emitir', {
        alunoId: indForm.alunoId, tipo: indForm.tipo, trimestre: indForm.tipo === 'trimestral' ? indForm.trimestre : undefined,
      });
      Alert.alert('Emitido', `Nº de Série: ${r.numeroSerie}`, [
        { text: 'Imprimir', onPress: () => abrirHtml(r.numeroSerie) },
        { text: 'Fechar', style: 'cancel' },
      ]);
      setShowIndividual(false);
      carregar();
    } catch (e: any) {
      Alert.alert('Erro', e.message);
    } finally { setAcao(null); }
  }

  async function assinar(id: string, numeroSerie: string) {
    if (!podeAssinar) return Alert.alert('Sem permissão', 'Apenas directores podem assinar.');
    Alert.alert('Confirmar assinatura', `Assinar boletim ${numeroSerie}?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Assinar', onPress: async () => {
          try {
            await api.post(`/api/secretaria/boletins/${id}/assinar`, {});
            Alert.alert('Assinado', 'O aluno e o encarregado foram notificados.');
            carregar();
          } catch (e: any) { Alert.alert('Erro', e.message); }
        }
      }
    ]);
  }

  const alunosFiltrados = indForm.search
    ? alunos.filter((a) => `${a.nome} ${a.apelido} ${a.numeroMatricula}`.toLowerCase().includes(indForm.search.toLowerCase())).slice(0, 30)
    : alunos.slice(0, 30);

  const alunosFiltradosIICiclo = searchIICiclo.length >= 2
    ? alunos
        .filter((a) =>
          `${a.nome} ${a.apelido} ${a.numeroMatricula}`.toLowerCase().includes(searchIICiclo.toLowerCase())
        )
        .slice(0, 20)
    : [];

  if (loading) return <SkeletonPage variant="list" />;

  return (
    <View style={styles.bg}>
      <TopBar title="Boletins de Notas" />
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <Text style={styles.title}>Emissão de Boletins de Notas</Text>
        <Text style={styles.sub}>O aluno solicita os boletins trimestrais ele próprio. A Secretaria assina os anuais e pode emitir em lote por turma.</Text>

        <View style={styles.actionRow}>
          <TouchableOpacity style={[styles.actionBtn, { backgroundColor: Colors.gold }]} onPress={() => setShowLote(true)}>
            <Ionicons name="people" size={18} color="#fff" />
            <Text style={styles.actionTxt}>Emitir Lote por Turma</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionBtn, { backgroundColor: Colors.success }]} onPress={() => setShowIndividual(true)}>
            <Ionicons name="person" size={18} color="#fff" />
            <Text style={styles.actionTxt}>Emitir Individual</Text>
          </TouchableOpacity>
        </View>

        {/* ── Boletim II Ciclo ── */}
        <View style={styles.iiCicloCard}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <Ionicons name="document-text" size={20} color="#7c3aed" />
            <Text style={styles.iiCicloTitle}>Boletim de Notas — II Ciclo (10ª–12ª)</Text>
          </View>
          <Text style={styles.iiCicloSub}>Formato oficial MED Angola com campos MAC, NPT e MT por trimestre. Suporte a edição e impressão.</Text>
          <StableSearchInput
            value={searchIICiclo}
            onChangeText={setSearchIICiclo}
            placeholder="Pesquisar aluno pelo nome ou nº matrícula…"
            style={{ marginTop: 10 }}
          />
          {searchIICiclo.length >= 2 && (
            <View style={styles.iiCicloList}>
              {alunosFiltradosIICiclo.length === 0 ? (
                <Text style={{ padding: 10, color: '#94a3b8', textAlign: 'center', fontSize: 13 }}>Nenhum aluno encontrado.</Text>
              ) : (
                alunosFiltradosIICiclo.map((a) => (
                  <TouchableOpacity
                    key={a.id}
                    style={styles.iiCicloAluno}
                    onPress={() => router.push(`/boletim-ii-ciclo?alunoId=${a.id}`)}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.iiCicloNome}>{a.nome} {a.apelido}</Text>
                      <Text style={styles.iiCicloMeta}>Nº {a.numeroMatricula} · {a.turma_classe || ''} ({a.turma_nome || ''})</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color="#7c3aed" />
                  </TouchableOpacity>
                ))
              )}
            </View>
          )}
        </View>

        <Text style={[styles.sectionTitle, { marginTop: 24 }]}>
          <Ionicons name="time" size={16} color={Colors.warning} /> Boletins Anuais a Aguardar Assinatura
        </Text>
        {loading ? <AppLoader color={Colors.gold} style={{ marginVertical: 16 }} /> :
          pendentes.length === 0 ? (
            <View style={styles.empty}><Ionicons name="checkmark-done-circle" size={32} color={Colors.success} /><Text style={styles.emptyTxt}>Sem boletins pendentes.</Text></View>
          ) : (
            pendentes.map((p) => (
              <View key={p.id} style={styles.pendCard}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.pendNome}>{p.aluno_nome} {p.aluno_apelido}</Text>
                  <Text style={styles.pendMeta}>Nº {p.numeroMatricula} · {p.turma_classe} ({p.turma_nome}) · {p.anoLetivo}</Text>
                  <Text style={styles.pendSerie}>Nº de Série: {p.numeroSerie}</Text>
                </View>
                <View style={{ gap: 6 }}>
                  <TouchableOpacity style={styles.smallBtn} onPress={() => abrirHtml(p.numeroSerie)}>
                    <Ionicons name="eye" size={14} color={Colors.gold} /><Text style={styles.smallBtnTxt}>Ver</Text>
                  </TouchableOpacity>
                  {podeAssinar && (
                    <TouchableOpacity style={[styles.smallBtn, { backgroundColor: Colors.success }]} onPress={() => assinar(p.id, p.numeroSerie)}>
                      <Ionicons name="checkmark-done" size={14} color="#fff" /><Text style={[styles.smallBtnTxt, { color: '#fff' }]}>Assinar</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            ))
          )}
      </ScrollView>

      {/* MODAL LOTE */}
      <Modal visible={showLote} animationType="slide" transparent onRequestClose={() => setShowLote(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={styles.modalBg}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Emitir Boletins em Lote</Text>
            <Text style={styles.modalLabel}>Turma</Text>
            <ScrollView style={{ maxHeight: 200 }}>
              {turmas.map((t) => (
                <TouchableOpacity key={t.id} style={[styles.opt, loteForm.turmaId === t.id && styles.optSel]} onPress={() => setLoteForm({ ...loteForm, turmaId: t.id })}>
                  <Text style={loteForm.turmaId === t.id ? styles.optTxtSel : styles.optTxt}>{t.classe} · {t.nome}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <Text style={styles.modalLabel}>Tipo</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {(['trimestral', 'anual'] as const).map((tp) => (
                <TouchableOpacity key={tp} style={[styles.opt, loteForm.tipo === tp && styles.optSel, { flex: 1 }]} onPress={() => setLoteForm({ ...loteForm, tipo: tp })}>
                  <Text style={loteForm.tipo === tp ? styles.optTxtSel : styles.optTxt}>{tp === 'anual' ? 'Anual' : 'Trimestral'}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {loteForm.tipo === 'trimestral' && (<>
              <Text style={styles.modalLabel}>Trimestre</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {[1, 2, 3].map((t) => (
                  <TouchableOpacity key={t} style={[styles.opt, loteForm.trimestre === t && styles.optSel, { flex: 1 }]} onPress={() => setLoteForm({ ...loteForm, trimestre: t })}>
                    <Text style={loteForm.trimestre === t ? styles.optTxtSel : styles.optTxt}>{t}º</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>)}
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 16 }}>
              <TouchableOpacity style={[styles.modalBtn, { backgroundColor: '#999' }]} onPress={() => setShowLote(false)}><Text style={styles.modalBtnTxt}>Cancelar</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.modalBtn, { backgroundColor: Colors.gold }]} onPress={emitirLote} disabled={acao === 'lote'}>
                {acao === 'lote' ? <AppLoader color="#fff" size="small" /> : <Text style={styles.modalBtnTxt}>Emitir Lote</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
              </KeyboardAvoidingView>
</Modal>

      {/* MODAL INDIVIDUAL */}
      <Modal visible={showIndividual} animationType="slide" transparent onRequestClose={() => setShowIndividual(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={styles.modalBg}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Emitir Boletim Individual</Text>
            <StableSearchInput
              value={indForm.search}
              onChangeText={(s) => setIndForm({ ...indForm, search: s })}
              inputStyle={styles.input}
              placeholder="Pesquisar aluno por nome ou matrícula…"
              iconColor={Colors.textMuted}
            />
            <ScrollView style={{ maxHeight: 200 }}>
              {alunosFiltrados.map((a) => (
                <TouchableOpacity key={a.id} style={[styles.opt, indForm.alunoId === a.id && styles.optSel]} onPress={() => setIndForm({ ...indForm, alunoId: a.id })}>
                  <Text style={indForm.alunoId === a.id ? styles.optTxtSel : styles.optTxt}>{a.nome} {a.apelido} (Nº {a.numeroMatricula})</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <Text style={styles.modalLabel}>Tipo</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {(['trimestral', 'anual'] as const).map((tp) => (
                <TouchableOpacity key={tp} style={[styles.opt, indForm.tipo === tp && styles.optSel, { flex: 1 }]} onPress={() => setIndForm({ ...indForm, tipo: tp })}>
                  <Text style={indForm.tipo === tp ? styles.optTxtSel : styles.optTxt}>{tp === 'anual' ? 'Anual' : 'Trimestral'}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {indForm.tipo === 'trimestral' && (<>
              <Text style={styles.modalLabel}>Trimestre</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {[1, 2, 3].map((t) => (
                  <TouchableOpacity key={t} style={[styles.opt, indForm.trimestre === t && styles.optSel, { flex: 1 }]} onPress={() => setIndForm({ ...indForm, trimestre: t })}>
                    <Text style={indForm.trimestre === t ? styles.optTxtSel : styles.optTxt}>{t}º</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>)}
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 16 }}>
              <TouchableOpacity style={[styles.modalBtn, { backgroundColor: '#999' }]} onPress={() => setShowIndividual(false)}><Text style={styles.modalBtnTxt}>Cancelar</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.modalBtn, { backgroundColor: Colors.success }]} onPress={emitirIndividual} disabled={acao === 'ind'}>
                {acao === 'ind' ? <AppLoader color="#fff" size="small" /> : <Text style={styles.modalBtnTxt}>Emitir</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
              </KeyboardAvoidingView>
</Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: Colors.background },
  title: { fontSize: 22, fontFamily: 'Inter_700Bold', color: Colors.text },
  sub: { color: Colors.textMuted, marginTop: 4, marginBottom: 14, fontSize: 13 },
  sectionTitle: { fontSize: 14, fontFamily: 'Inter_700Bold', color: Colors.text, marginBottom: 8 },
  actionRow: { flexDirection: 'row', gap: 10, marginTop: 8, flexWrap: 'wrap' },
  actionBtn: { flexDirection: 'row', gap: 6, alignItems: 'center', paddingVertical: 12, paddingHorizontal: 18, borderRadius: 8 },
  actionTxt: { color: '#fff', fontFamily: 'Inter_600SemiBold' },
  pendCard: { flexDirection: 'row', gap: 12, padding: 12, backgroundColor: '#fff', borderRadius: 8, marginBottom: 8, borderWidth: 1, borderColor: '#fcd34d', alignItems: 'center' },
  pendNome: { fontSize: 14, fontFamily: 'Inter_700Bold', color: Colors.text },
  pendMeta: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
  pendSerie: { fontSize: 10, color: Colors.gold, marginTop: 2, fontFamily: 'Inter_600SemiBold' },
  smallBtn: { flexDirection: 'row', gap: 4, alignItems: 'center', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, borderWidth: 1, borderColor: Colors.gold, backgroundColor: '#fff' },
  smallBtnTxt: { fontSize: 11, color: Colors.gold, fontFamily: 'Inter_600SemiBold' },
  empty: { alignItems: 'center', padding: 24, backgroundColor: '#fff', borderRadius: 8 },
  emptyTxt: { color: Colors.textMuted, marginTop: 8 },
  permBox: { padding: 30, alignItems: 'center', justifyContent: 'center', flex: 1 },
  permTitle: { fontSize: 18, fontFamily: 'Inter_700Bold', color: Colors.text, marginTop: 12 },
  permTxt: { color: Colors.textMuted, textAlign: 'center', marginTop: 6 },
  modalBg: { flex: 1, backgroundColor: '#0009', justifyContent: 'center', padding: 20 },
  modalCard: { backgroundColor: '#fff', padding: 20, borderRadius: 12, maxWidth: 600, alignSelf: 'center', width: '100%' },
  modalTitle: { fontSize: 18, fontFamily: 'Inter_700Bold', color: Colors.text, marginBottom: 12 },
  modalLabel: { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: Colors.text, marginTop: 12, marginBottom: 6 },
  opt: { padding: 10, backgroundColor: '#f3f4f6', borderRadius: 6, marginBottom: 4 },
  optSel: { backgroundColor: Colors.gold + '22', borderWidth: 1, borderColor: Colors.gold },
  optTxt: { color: Colors.text, fontSize: 13 },
  optTxtSel: { color: Colors.gold, fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  input: { backgroundColor: '#f3f4f6', padding: 10, borderRadius: 6, marginBottom: 8, color: Colors.text },
  modalBtn: { flex: 1, padding: 12, borderRadius: 8, alignItems: 'center' },
  modalBtnTxt: { color: '#fff', fontFamily: 'Inter_600SemiBold' },
  iiCicloCard: {
    marginTop: 20,
    backgroundColor: '#faf5ff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e9d5ff',
    padding: 14,
  },
  iiCicloTitle: { fontSize: 14, fontFamily: 'Inter_700Bold', color: '#7c3aed' },
  iiCicloSub: { fontSize: 12, color: '#6b21a8', marginBottom: 2 },
  iiCicloList: {
    marginTop: 6,
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#e9d5ff',
    backgroundColor: '#fff',
  },
  iiCicloAluno: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f3e8ff',
  },
  iiCicloNome: { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: '#0f172a' },
  iiCicloMeta: { fontSize: 11, color: '#64748b', marginTop: 2 },
});
