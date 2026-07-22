import React, { useState, useMemo } from 'react';
import { useTabMemory } from '@/hooks/useTabMemory';
import {Alert, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View} from 'react-native';
import AppLoader from '@/components/AppLoader';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '@/constants/colors';
import TopBar from '@/components/TopBar';
import { useData } from '@/context/DataContext';
import { useFinanceiro } from '@/context/FinanceiroContext';
import { useConfig } from '@/context/ConfigContext';
import { useAuth } from '@/context/AuthContext';
import { alertSucesso, alertErro } from '@/utils/toast';
import { api } from '@/lib/api';
import { getPdfUrl } from '@/utils/pdfAuth';

const TABS = ['PDFs', 'Multicaixa'] as const;
type Tab = typeof TABS[number];

const PDF_DOCS = [
  {
    id: 'boletim',
    icon: 'school-outline',
    titulo: 'Boletim de Notas',
    desc: 'Notas por trimestre com médias e situação do aluno',
    cor: Colors.info,
    tipo: 'aluno',
  },
  {
    id: 'declaracao-matricula',
    icon: 'document-text-outline',
    titulo: 'Declaração de Matrícula',
    desc: 'Comprova matrícula activa do aluno no ano lectivo',
    cor: Colors.gold,
    tipo: 'aluno',
  },
  {
    id: 'declaracao-frequencia',
    icon: 'clipboard-outline',
    titulo: 'Declaração de Frequência',
    desc: 'Confirma que o aluno frequenta as aulas regularmente',
    cor: '#7c3aed',
    tipo: 'aluno',
  },
  {
    id: 'relatorio-turma',
    icon: 'bar-chart-outline',
    titulo: 'Relatório de Turma',
    desc: 'Aproveitamento geral da turma com taxa de aprovação',
    cor: Colors.success,
    tipo: 'turma',
  },
  {
    id: 'declaracao-habilitacoes',
    icon: 'ribbon-outline',
    titulo: 'Declaração de Habilitações',
    desc: 'Declara habilitações do Ensino Primário com lista de disciplinas e notas',
    cor: Colors.gold,
    tipo: 'aluno',
  },
  {
    id: 'recibos-aluno',
    icon: 'receipt-outline',
    titulo: 'Recibos do Aluno',
    desc: 'Todos os recibos de pagamento de um aluno',
    cor: Colors.warning,
    tipo: 'aluno',
  },
] as const;

type DocId = typeof PDF_DOCS[number]['id'];

export default function DocumentosHub() {
  const insets = useSafeAreaInsets();
  const { alunos, turmas } = useData();
  const { config } = useConfig();
  const { taxas } = useFinanceiro();
  const { user } = useAuth();
  const isFinanceiroOnly = user?.role === 'financeiro';

  // Documentos pedagógicos (boletins, declarações, relatórios) só podem ser
  // emitidos pela Secretaria Pedagógica. O Gestor Financeiro só vê os recibos.
  const PDF_DOCS_VISIBLE = useMemo(() => {
    if (isFinanceiroOnly) {
      return PDF_DOCS.filter(d => d.id === 'recibos-aluno');
    }
    return PDF_DOCS;
  }, [isFinanceiroOnly]);

  const [tab, setTab] = useTabMemory<Tab>('documentos-hub', 'PDFs');
  const [search, setSearch] = useState('');
  const [selectedAluno, setSelectedAluno] = useState<string>('');
  const [selectedTurma, setSelectedTurma] = useState<string>('');
  const [trimestre, setTrimestre] = useState<string>('1');
  const [loading, setLoading] = useState<string | null>(null);

  const [mcxAluno, setMcxAluno] = useState<string>('');
  const [mcxSearch, setMcxSearch] = useState('');
  const [mcxLoading, setMcxLoading] = useState(false);
  const [refGerada, setRefGerada] = useState<any>(null);
  const [taxasSelecionadas, setTaxasSelecionadas] = useState<string[]>([]);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewTitle, setPreviewTitle] = useState('Pré-visualização');

  const alunosFiltrados = useMemo(() => {
    const q = search.toLowerCase();
    return alunos.filter(a =>
      a.ativo &&
      (`${a.nome} ${a.apelido}`.toLowerCase().includes(q) || a.numeroMatricula?.toLowerCase().includes(q))
    ).slice(0, 30);
  }, [alunos, search]);

  const mcxAlunosFiltrados = useMemo(() => {
    const q = mcxSearch.toLowerCase();
    return alunos.filter(a =>
      a.ativo &&
      (`${a.nome} ${a.apelido}`.toLowerCase().includes(q) || a.numeroMatricula?.toLowerCase().includes(q))
    ).slice(0, 30);
  }, [alunos, mcxSearch]);

  const alunoSel = useMemo(() => alunos.find(a => a.id === selectedAluno), [alunos, selectedAluno]);
  const turmaSel = useMemo(() => turmas.find(t => t.id === selectedTurma), [turmas, selectedTurma]);
  const mcxAlunoSel = useMemo(() => alunos.find(a => a.id === mcxAluno), [alunos, mcxAluno]);

  async function abrirPreview(url: string, title: string) {
    if (Platform.OS === 'web') {
      setPreviewTitle(title);
      setPreviewUrl(await getPdfUrl(url));
    }
  }

  function handlePrintPreview() {
    if (Platform.OS !== 'web') return;
    const iframe = document.getElementById('doc-hub-preview-iframe') as HTMLIFrameElement | null;
    if (iframe?.contentWindow) {
      iframe.contentWindow.print();
    }
  }

  async function handleDownloadPreview() {
    if (Platform.OS !== 'web' || !previewUrl) return;
    try {
      const res = await fetch(previewUrl, { credentials: 'include' });
      const html = await res.text();
      const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${(previewTitle || 'documento').replace(/\s+/g, '-')}-${Date.now()}.html`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch { /* silent */ }
  }

  function gerarBoletim() {
    if (!selectedAluno) return alertErro('Seleccione um aluno');
    const url = `/api/pdf/boletim/${selectedAluno}?trimestre=${trimestre}&autoprint=false`;
    abrirPreview(url, 'Boletim de Notas');
  }

  function gerarDeclaracao(tipo: 'matricula' | 'frequencia') {
    if (!selectedAluno) return alertErro('Seleccione um aluno');
    const url = `/api/pdf/declaracao/${selectedAluno}?tipo=${tipo}&autoprint=false`;
    const titulo = tipo === 'matricula' ? 'Declaração de Matrícula' : 'Declaração de Frequência';
    abrirPreview(url, titulo);
  }

  function gerarHabilitacoes() {
    if (!selectedAluno) return alertErro('Seleccione um aluno');
    const url = `/api/pdf/declaracao/${selectedAluno}?tipo=habilitacoes&autoprint=false`;
    abrirPreview(url, 'Declaração de Habilitações');
  }

  function gerarRelatorio() {
    if (!selectedTurma) return alertErro('Seleccione uma turma');
    const url = `/api/pdf/relatorio-turma/${selectedTurma}?trimestre=${trimestre}&autoprint=false`;
    abrirPreview(url, 'Relatório de Turma');
  }

  function gerarRecibos() {
    if (!selectedAluno) return alertErro('Seleccione um aluno');
    const url = `/api/pdf/recibos-aluno/${selectedAluno}?autoprint=false`;
    abrirPreview(url, 'Recibos do Aluno');
  }

  function handlePDF(id: DocId) {
    setLoading(id);
    try {
      switch (id) {
        case 'boletim': gerarBoletim(); break;
        case 'declaracao-matricula': gerarDeclaracao('matricula'); break;
        case 'declaracao-frequencia': gerarDeclaracao('frequencia'); break;
        case 'declaracao-habilitacoes': gerarHabilitacoes(); break;
        case 'relatorio-turma': gerarRelatorio(); break;
        case 'recibos-aluno': gerarRecibos(); break;
      }
    } finally {
      setTimeout(() => setLoading(null), 800);
    }
  }

  async function gerarRefMulticaixa() {
    if (!mcxAluno) return alertErro('Seleccione um aluno');
    if (!taxasSelecionadas.length) return alertErro('Seleccione pelo menos uma taxa');

    setMcxLoading(true);
    try {
      const res = await api.post<any>('/api/pdf/multicaixa/gerar', {
        alunoId: mcxAluno,
        taxaId: taxasSelecionadas[0],
        valor: taxas.find(t => t.id === taxasSelecionadas[0])?.valor ?? 0,
        mes: new Date().getMonth() + 1,
        ano: new Date().getFullYear().toString(),
      });
      setRefGerada(res);
      alertSucesso('Referência gerada com sucesso!');
    } catch (e: any) {
      alertErro(e.message || 'Erro ao gerar referência');
    } finally {
      setMcxLoading(false);
    }
  }

  function abrirPDFMulticaixa() {
    if (!refGerada?.rupe?.id) return;
    abrirPreview(`/api/pdf/multicaixa/${refGerada.rupe.id}?autoprint=false`, 'Guia Multicaixa');
  }

  const entidade = config.numeroEntidade || '11333';
  const telefone = config.telefoneMulticaixaExpress || '';

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom }]}>

      {/* ── A4 Preview Modal ─────────────────────────────────────────────── */}
      {Platform.OS === 'web' && (
        <Modal
          visible={!!previewUrl}
          animationType="fade"
          transparent={false}
          onRequestClose={() => setPreviewUrl(null)}
        >
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <View style={styles.previewModal}>
            <View style={styles.previewHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.previewHeaderTitle}>{previewTitle}</Text>
                <Text style={styles.previewHeaderSub}>Formato A4 · Pré-visualização antes de imprimir</Text>
              </View>
              <TouchableOpacity style={styles.previewPrintBtn} onPress={handlePrintPreview}>
                <Ionicons name="print-outline" size={16} color="#fff" />
                <Text style={styles.previewPrintTxt}>Imprimir</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.previewDownloadBtn} onPress={handleDownloadPreview}>
                <Ionicons name="download-outline" size={16} color="#fff" />
                <Text style={styles.previewPrintTxt}>Guardar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.previewCloseBtn}
                onPress={() => setPreviewUrl(null)}
              >
                <Ionicons name="close" size={22} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <View style={styles.previewBody}>
              {previewUrl && (
                <iframe
                  id="doc-hub-preview-iframe"
                  src={previewUrl}
                  style={{ flex: 1, border: 'none', width: '100%', height: '100%', minHeight: 600, background: '#f0f0f0' } as any}
                  title={previewTitle}
                />
              )}
            </View>
          </View>
                  </KeyboardAvoidingView>
</Modal>
      )}

      <TopBar title="Documentos & Multicaixa" />
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">

        <View style={styles.tabBar}>
          {TABS.map(t => (
            <TouchableOpacity
              key={t}
              style={[styles.tabBtn, tab === t && styles.tabBtnActive]}
              onPress={() => setTab(t)}
            >
              <Text style={[styles.tabLabel, tab === t && styles.tabLabelActive]}>{t}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {tab === 'PDFs' && (
          <View>
            <Text style={styles.sectionTitle}>Seleccionar Aluno / Turma</Text>

            <View style={styles.card}>
              <Text style={styles.cardLabel}>Pesquisar Aluno</Text>
              <View style={styles.searchRow}>
                <Ionicons name="search" size={16} color={Colors.textMuted} style={{ marginRight: 8 }} />
                <TextInput
                  style={styles.searchInput}
                  value={search}
                  onChangeText={setSearch}
                  placeholder="Nome ou número de matrícula..."
                  placeholderTextColor={Colors.textMuted}
                />
              </View>
              {search.length > 0 && (
                <View style={styles.dropdown}>
                  {alunosFiltrados.length === 0 ? (
                    <Text style={styles.emptyText}>Nenhum aluno encontrado</Text>
                  ) : (
                    alunosFiltrados.map(a => (
                      <TouchableOpacity
                        key={a.id}
                        style={[styles.dropItem, selectedAluno === a.id && styles.dropItemActive]}
                        onPress={() => { setSelectedAluno(a.id); setSearch(''); }}
                      >
                        <Text style={[styles.dropItemText, selectedAluno === a.id && { color: Colors.info }]}>
                          {a.nome} {a.apelido}
                        </Text>
                        <Text style={styles.dropItemMeta}>{a.numeroMatricula}</Text>
                      </TouchableOpacity>
                    ))
                  )}
                </View>
              )}
              {alunoSel && (
                <View style={styles.selectedBadge}>
                  <Ionicons name="person" size={14} color={Colors.info} />
                  <Text style={styles.selectedBadgeText}>{alunoSel.nome} {alunoSel.apelido}</Text>
                  <TouchableOpacity onPress={() => setSelectedAluno('')}>
                    <Ionicons name="close-circle" size={16} color={Colors.textMuted} />
                  </TouchableOpacity>
                </View>
              )}
            </View>

            <View style={styles.card}>
              <Text style={styles.cardLabel}>Turma (para relatório de turma)</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 6 }}>
                {turmas.filter(t => t.ativo).map(t => (
                  <TouchableOpacity
                    key={t.id}
                    style={[styles.turmaChip, selectedTurma === t.id && styles.turmaChipActive]}
                    onPress={() => setSelectedTurma(t.id)}
                  >
                    <Text style={[styles.turmaChipText, selectedTurma === t.id && { color: Colors.info }]}>{t.nome}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            <View style={styles.card}>
              <Text style={styles.cardLabel}>Trimestre</Text>
              <View style={styles.row}>
                {['1', '2', '3'].map(t => (
                  <TouchableOpacity
                    key={t}
                    style={[styles.triBtn, trimestre === t && styles.triBtnActive]}
                    onPress={() => setTrimestre(t)}
                  >
                    <Text style={[styles.triBtnText, trimestre === t && { color: 'white' }]}>{t}º</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <Text style={styles.sectionTitle}>Documentos Disponíveis</Text>
            {isFinanceiroOnly && (
              <View style={[styles.alertBox, { borderColor: Colors.warning, marginBottom: 10 }]}>
                <Ionicons name="information-circle-outline" size={16} color={Colors.warning} />
                <Text style={[styles.alertText, { color: Colors.warning }]}>
                  Os documentos pedagógicos (boletins, declarações, relatórios) só podem ser emitidos pela Secretaria Pedagógica.
                </Text>
              </View>
            )}
            {PDF_DOCS_VISIBLE.map(doc => (
              <TouchableOpacity
                key={doc.id}
                style={styles.docCard}
                onPress={() => handlePDF(doc.id)}
                activeOpacity={0.75}
              >
                <View style={[styles.docIcon, { backgroundColor: doc.cor + '20' }]}>
                  <Ionicons name={doc.icon as any} size={24} color={doc.cor} />
                </View>
                <View style={styles.docInfo}>
                  <Text style={styles.docTitulo}>{doc.titulo}</Text>
                  <Text style={styles.docDesc}>{doc.desc}</Text>
                  <View style={styles.docMeta}>
                    <View style={[styles.docBadge, { backgroundColor: doc.cor + '15' }]}>
                      <Text style={[styles.docBadgeText, { color: doc.cor }]}>
                        {doc.tipo === 'aluno' ? 'Por Aluno' : 'Por Turma'}
                      </Text>
                    </View>
                  </View>
                </View>
                {loading === doc.id ? (
                  <AppLoader size="small" color={doc.cor} />
                ) : (
                  <Ionicons name="open-outline" size={18} color={Colors.textMuted} />
                )}
              </TouchableOpacity>
            ))}

            <View style={styles.infoBox}>
              <Ionicons name="information-circle-outline" size={16} color={Colors.info} />
              <Text style={styles.infoText}>
                {`Os documentos abrem numa nova aba. Use o botão "Imprimir / Guardar PDF" para exportar.`}
              </Text>
            </View>
          </View>
        )}

        {tab === 'Multicaixa' && (
          <View>
            <View style={styles.mcxHeader}>
              <View style={[styles.mcxIcon, { backgroundColor: '#00A65120' }]}>
                <MaterialCommunityIcons name="bank-transfer" size={32} color="#00A651" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.mcxTitulo}>Multicaixa Express</Text>
                <Text style={styles.mcxSubtitulo}>
                  {config.numeroEntidade
                    ? `Entidade: ${config.numeroEntidade}`
                    : 'Configure o número de entidade nas definições'}
                </Text>
              </View>
            </View>

            {!config.numeroEntidade && (
              <View style={[styles.alertBox, { borderColor: Colors.warning }]}>
                <Ionicons name="warning-outline" size={16} color={Colors.warning} />
                <Text style={[styles.alertText, { color: Colors.warning }]}>
                  Configure o número de entidade Multicaixa nas Definições → Dados Bancários para activar os pagamentos.
                </Text>
              </View>
            )}

            <View style={styles.card}>
              <Text style={styles.cardLabel}>Pesquisar Aluno</Text>
              <View style={styles.searchRow}>
                <Ionicons name="search" size={16} color={Colors.textMuted} style={{ marginRight: 8 }} />
                <TextInput
                  style={styles.searchInput}
                  value={mcxSearch}
                  onChangeText={setMcxSearch}
                  placeholder="Nome ou número de matrícula..."
                  placeholderTextColor={Colors.textMuted}
                />
              </View>
              {mcxSearch.length > 0 && (
                <View style={styles.dropdown}>
                  {mcxAlunosFiltrados.map(a => (
                    <TouchableOpacity
                      key={a.id}
                      style={[styles.dropItem, mcxAluno === a.id && styles.dropItemActive]}
                      onPress={() => { setMcxAluno(a.id); setMcxSearch(''); setRefGerada(null); }}
                    >
                      <Text style={[styles.dropItemText, mcxAluno === a.id && { color: '#00A651' }]}>
                        {a.nome} {a.apelido}
                      </Text>
                      <Text style={styles.dropItemMeta}>{a.numeroMatricula}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
              {mcxAlunoSel && (
                <View style={[styles.selectedBadge, { borderColor: '#00A65155' }]}>
                  <Ionicons name="person" size={14} color="#00A651" />
                  <Text style={[styles.selectedBadgeText, { color: '#00A651' }]}>{mcxAlunoSel.nome} {mcxAlunoSel.apelido}</Text>
                  <TouchableOpacity onPress={() => { setMcxAluno(''); setRefGerada(null); }}>
                    <Ionicons name="close-circle" size={16} color={Colors.textMuted} />
                  </TouchableOpacity>
                </View>
              )}
            </View>

            {mcxAlunoSel && !refGerada && (
              <TouchableOpacity
                style={[styles.primaryBtn, { backgroundColor: '#00A651' }]}
                onPress={gerarRefMulticaixa}
                disabled={mcxLoading}
              >
                {mcxLoading ? (
                  <AppLoader color="white" />
                ) : (
                  <>
                    <MaterialCommunityIcons name="bank-transfer-out" size={20} color="white" style={{ marginRight: 8 }} />
                    <Text style={styles.primaryBtnText}>Gerar Referência Multicaixa</Text>
                  </>
                )}
              </TouchableOpacity>
            )}

            {refGerada && (
              <View>
                <View style={styles.refCard}>
                  <Text style={styles.refCardLabel}>ENTIDADE</Text>
                  <Text style={styles.refCardEntidade}>{entidade}</Text>
                  <Text style={styles.refCardLabel}>REFERÊNCIA</Text>
                  <Text style={styles.refCardRef}>{refGerada.referencia}</Text>
                  <View style={styles.refCardDivider} />
                  <View style={styles.refCardRow}>
                    <Text style={styles.refCardInfoLabel}>Validade</Text>
                    <Text style={styles.refCardInfoVal}>{refGerada.dataValidade}</Text>
                  </View>
                  <View style={styles.refCardRow}>
                    <Text style={styles.refCardInfoLabel}>Estado</Text>
                    <View style={{ backgroundColor: '#00A65120', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 }}>
                      <Text style={{ color: '#00A651', fontSize: 12, fontWeight: '700' }}>ACTIVA</Text>
                    </View>
                  </View>
                </View>

                <View style={styles.instrucoes}>
                  <Text style={styles.instrTitulo}>Como pagar na ATM / Balcão</Text>
                  {[
                    `Seleccione "Pagamento de Serviços"`,
                    `Entidade: ${entidade}`,
                    `Referência: ${refGerada.referencia}`,
                    'Confirme o valor e guarde o comprovativo',
                  ].map((step, i) => (
                    <View key={i} style={styles.instrRow}>
                      <View style={styles.instrNum}><Text style={styles.instrNumText}>{i + 1}</Text></View>
                      <Text style={styles.instrText}>{step}</Text>
                    </View>
                  ))}

                  {telefone ? (
                    <>
                      <Text style={[styles.instrTitulo, { marginTop: 12 }]}>Multicaixa Express (App / USSD)</Text>
                      {[
                        'Abra a app Multicaixa Express',
                        `Seleccione "Pagar" → "Serviços"`,
                        `Entidade ${entidade} · Referência ${refGerada.referencia}`,
                        `Ou marque *840# e siga as instruções`,
                        `Ou transfira para ${telefone} com a referência na descrição`,
                      ].map((step, i) => (
                        <View key={i} style={styles.instrRow}>
                          <View style={styles.instrNum}><Text style={styles.instrNumText}>{i + 1}</Text></View>
                          <Text style={styles.instrText}>{step}</Text>
                        </View>
                      ))}
                    </>
                  ) : null}
                </View>

                <TouchableOpacity
                  style={[styles.primaryBtn, { backgroundColor: '#1a2b5f' }]}
                  onPress={abrirPDFMulticaixa}
                >
                  <Ionicons name="print-outline" size={20} color="white" style={{ marginRight: 8 }} />
                  <Text style={styles.primaryBtnText}>Imprimir / Guardar PDF da Referência</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.primaryBtn, { backgroundColor: Colors.border, marginTop: 8 }]}
                  onPress={() => { setRefGerada(null); setMcxAluno(''); setMcxSearch(''); }}
                >
                  <Text style={[styles.primaryBtnText, { color: Colors.text }]}>Gerar Nova Referência</Text>
                </TouchableOpacity>
              </View>
            )}

            <View style={styles.infoBox}>
              <Ionicons name="shield-checkmark-outline" size={16} color={Colors.info} />
              <Text style={styles.infoText}>
                As referências são válidas por 30 dias. Após o pagamento, o encarregado deve apresentar o comprovativo na secretaria.
              </Text>
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  scroll: { padding: 16, paddingBottom: 40 },
  tabBar: { flexDirection: 'row', backgroundColor: Colors.surface, borderRadius: 12, padding: 4, marginBottom: 16 },
  tabBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
  tabBtnActive: { backgroundColor: Colors.info },
  tabLabel: { fontSize: 14, fontWeight: '600', color: Colors.textMuted },
  tabLabelActive: { color: 'white' },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: Colors.textMuted, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10, marginTop: 4 },
  card: { backgroundColor: Colors.surface, borderRadius: 12, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: Colors.border },
  cardLabel: { fontSize: 12, color: Colors.textMuted, fontWeight: '600', marginBottom: 8, textTransform: 'uppercase', letterSpacing: .5 },
  searchRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.background, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 },
  searchInput: { flex: 1, fontSize: 16, color: Colors.text, outlineWidth: 0 } as any,
  dropdown: { backgroundColor: Colors.surface, borderRadius: 8, marginTop: 6, borderWidth: 1, borderColor: Colors.border, maxHeight: 200 },
  dropItem: { padding: 10, borderBottomWidth: 1, borderBottomColor: Colors.border },
  dropItemActive: { backgroundColor: Colors.info + '10' },
  dropItemText: { fontSize: 14, color: Colors.text, fontWeight: '500' },
  dropItemMeta: { fontSize: 11, color: Colors.textMuted, marginTop: 1 },
  selectedBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.info + '15', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, marginTop: 8, borderWidth: 1, borderColor: Colors.info + '40' },
  selectedBadgeText: { flex: 1, fontSize: 13, color: Colors.info, fontWeight: '600' },
  row: { flexDirection: 'row', gap: 8, marginTop: 6 },
  triBtn: { flex: 1, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: Colors.border, alignItems: 'center' },
  triBtnActive: { backgroundColor: Colors.info, borderColor: Colors.info },
  triBtnText: { fontSize: 13, fontWeight: '700', color: Colors.text },
  turmaChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: Colors.border, marginRight: 8, backgroundColor: Colors.background },
  turmaChipActive: { borderColor: Colors.info, backgroundColor: Colors.info + '15' },
  turmaChipText: { fontSize: 12, fontWeight: '600', color: Colors.text },
  docCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: Colors.surface, borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: Colors.border },
  docIcon: { width: 44, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  docInfo: { flex: 1 },
  docTitulo: { fontSize: 14, fontWeight: '700', color: Colors.text, marginBottom: 2 },
  docDesc: { fontSize: 12, color: Colors.textMuted, lineHeight: 16 },
  docMeta: { flexDirection: 'row', gap: 6, marginTop: 4 },
  docBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  docBadgeText: { fontSize: 10, fontWeight: '700' },
  infoBox: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', backgroundColor: Colors.info + '12', borderRadius: 10, padding: 12, marginTop: 12, borderWidth: 1, borderColor: Colors.info + '30' },
  infoText: { flex: 1, fontSize: 12, color: Colors.textMuted, lineHeight: 17 },
  alertBox: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', backgroundColor: Colors.warning + '12', borderRadius: 10, padding: 12, marginBottom: 12, borderWidth: 1 },
  alertText: { flex: 1, fontSize: 12, lineHeight: 17 },
  mcxHeader: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: Colors.surface, borderRadius: 12, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: '#00A65140' },
  mcxIcon: { width: 56, height: 56, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  mcxTitulo: { fontSize: 16, fontWeight: '700', color: Colors.text },
  mcxSubtitulo: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  primaryBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderRadius: 12, paddingVertical: 14, marginBottom: 10 },
  primaryBtnText: { fontSize: 14, fontWeight: '700', color: 'white' },
  refCard: { backgroundColor: '#1a2b5f', borderRadius: 14, padding: 20, marginBottom: 12 },
  refCardLabel: { fontSize: 9, color: 'rgba(255,255,255,.6)', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 4 },
  refCardEntidade: { fontSize: 28, fontWeight: '900', color: 'white', fontFamily: Platform.OS === 'web' ? 'monospace' : undefined, letterSpacing: 4, marginBottom: 14 },
  refCardRef: { fontSize: 32, fontWeight: '900', color: '#fbbf24', fontFamily: Platform.OS === 'web' ? 'monospace' : undefined, letterSpacing: 6, marginBottom: 14 },
  refCardDivider: { height: 1, backgroundColor: 'rgba(255,255,255,.15)', marginVertical: 10 },
  refCardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 },
  refCardInfoLabel: { fontSize: 12, color: 'rgba(255,255,255,.6)' },
  refCardInfoVal: { fontSize: 13, fontWeight: '700', color: 'white' },
  instrucoes: { backgroundColor: Colors.surface, borderRadius: 12, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: Colors.border },
  instrTitulo: { fontSize: 12, fontWeight: '700', color: Colors.text, letterSpacing: .5, marginBottom: 10, borderLeftWidth: 3, borderLeftColor: '#00A651', paddingLeft: 8 },
  instrRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 8 },
  instrNum: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#00A651', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 },
  instrNumText: { fontSize: 11, fontWeight: '700', color: 'white' },
  instrText: { flex: 1, fontSize: 13, color: Colors.text, lineHeight: 19 },
  emptyText: { padding: 12, color: Colors.textMuted, textAlign: 'center', fontSize: 13 },
  previewModal: { flex: 1, backgroundColor: '#111827', flexDirection: 'column' },
  previewHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: Colors.surface, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.border },
  previewHeaderTitle: { fontSize: 14, fontWeight: '700', color: Colors.text },
  previewHeaderSub: { fontSize: 11, color: Colors.textMuted, marginTop: 1 },
  previewPrintBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.info, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  previewPrintTxt: { fontSize: 13, fontWeight: '700', color: '#fff' },
  previewDownloadBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#166534', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  previewCloseBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: Colors.border },
  previewBody: { flex: 1, backgroundColor: '#f0f0f0' },
});
