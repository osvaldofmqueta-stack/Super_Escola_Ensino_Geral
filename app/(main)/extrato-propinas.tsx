import React, { useState, useCallback, useRef, useEffect } from 'react';
import {FlatList, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View} from 'react-native';
import AppLoader from '@/components/AppLoader';
import { Ionicons, MaterialCommunityIcons, FontAwesome5 } from '@expo/vector-icons';
import TopBar from '@/components/TopBar';
import DateInput from '@/components/DateInput';
import { useToast } from '@/context/ToastContext';
import { useAuth, getAuthToken } from '@/context/AuthContext';
import { useConfig } from '@/context/ConfigContext';
import { buildExtratoProfinasHtml, ExtratoHtmlConfig } from '@/utils/extratoHtml';
import RequiredMark from '@/components/RequiredMark';
import { useLocalSearchParams } from 'expo-router';

// ─── Types ───────────────────────────────────────────────────────────────────
interface AlunoInfo {
  id: string;
  nome: string;
  apelido: string;
  numeroMatricula: string;
  turmaNome: string | null;
  cursoNome: string | null;
  nomeEncarregado: string;
}

interface PagamentoExtrato {
  id: string;
  data: string;
  valor: number;
  status: 'pago' | 'pendente' | 'cancelado';
  metodoPagamento: string;
  referencia: string | null;
  observacao: string | null;
  taxaDescricao: string;
  taxaTipo: string;
  mes: number | null;
  trimestre: number | null;
  ano: string;
}

interface Resumo {
  totalPago: number;
  totalPendente: number;
  totalCancelado: number;
  total: number;
}

interface Extrato {
  aluno: AlunoInfo;
  pagamentos: PagamentoExtrato[];
  resumo: Resumo;
  filtros: { dataInicio: string | null; dataFim: string | null };
}

interface AlunoSimple {
  id: string;
  nome: string;
  apelido: string;
  numeroMatricula: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
async function req<T = unknown>(url: string, opts?: RequestInit): Promise<T> {
  const token = await getAuthToken();
  const authHeader: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
  const r = await fetch(url, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...authHeader, ...opts?.headers },
    credentials: 'include',
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data?.error || 'Erro de servidor');
  return data as T;
}

function fmtAOA(v: number) {
  return `${v.toLocaleString('pt-AO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Kz`;
}

function fmtDate(d: string) {
  if (!d) return '—';
  const parts = d.split('-');
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return d;
}

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

function mesLabel(mes: number | null) {
  if (!mes) return '';
  return MESES[(mes - 1) % 12] || '';
}

const STATUS_CFG = {
  pago:      { color: '#66BB6A', bg: '#66BB6A22', label: 'Liquidado', icon: 'checkmark-circle' },
  pendente:  { color: '#FFA726', bg: '#FFA72622', label: 'Em Cobrança', icon: 'time' },
  cancelado: { color: '#888',    bg: '#88888822', label: 'Cancelado', icon: 'close-circle' },
};

const TIPO_LABEL: Record<string, string> = {
  propina: 'Propina', matricula: 'Matrícula', material: 'Material', exame: 'Exame', multa: 'Multa', outro: 'Outro',
};

const METODO_LABEL: Record<string, string> = {
  dinheiro: 'Dinheiro', transferencia: 'Transferência', multicaixa: 'Multicaixa',
};

const COR_OPCOES = [
  { label: 'Azul Escuro', value: '#1a2540' },
  { label: 'Índigo',      value: '#3730a3' },
  { label: 'Verde',       value: '#15643a' },
  { label: 'Vermelho',    value: '#991b1b' },
  { label: 'Castanho',    value: '#78350f' },
  { label: 'Cinza',       value: '#374151' },
];

// ─── Document Editor Component ───────────────────────────────────────────────
interface DocumentEditorProps {
  extrato: Extrato;
  initialConfig: ExtratoHtmlConfig;
  onClose: () => void;
}

function DocumentEditor({ extrato, initialConfig, onClose }: DocumentEditorProps) {
  const [cfg, setCfg] = useState<ExtratoHtmlConfig>(initialConfig);
  const [activeSection, setActiveSection] = useState<'identificacao' | 'assinaturas' | 'conteudo' | 'visual'>('identificacao');
  const iframeRef = useRef<any>(null);

  const html = buildExtratoProfinasHtml(extrato, cfg);

  const update = useCallback((patch: Partial<ExtratoHtmlConfig>) => {
    setCfg(prev => ({ ...prev, ...patch }));
  }, []);

  const handlePrint = () => {
    if (Platform.OS === 'web') {
      const iframe = document.getElementById('editor-preview-iframe') as HTMLIFrameElement;
      if (iframe?.contentWindow) iframe.contentWindow.print();
    }
  };

  const SECTIONS = [
    { id: 'identificacao', label: 'Identificação', icon: 'document-text-outline' },
    { id: 'assinaturas',   label: 'Assinaturas',   icon: 'pen-outline' },
    { id: 'conteudo',      label: 'Conteúdo',       icon: 'list-outline' },
    { id: 'visual',        label: 'Visual',          icon: 'color-palette-outline' },
  ] as const;

  return (
    <View style={edStyles.root}>
      {/* ── Top Bar ── */}
      <View style={edStyles.topBar}>
        <TouchableOpacity style={edStyles.closeBtn} onPress={onClose}>
          <Ionicons name="arrow-back" size={20} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={edStyles.topTitle}>Editor de Documento</Text>
          <Text style={edStyles.topSub}>Extracto de Propinas — {extrato.aluno.nome} {extrato.aluno.apelido}</Text>
        </View>
        <TouchableOpacity style={edStyles.printBtn} onPress={handlePrint}>
          <Ionicons name="print-outline" size={16} color="#fff" />
          <Text style={edStyles.printBtnText}>Imprimir / PDF</Text>
        </TouchableOpacity>
      </View>

      <View style={edStyles.body}>
        {/* ── Editor Panel (left) ── */}
        <View style={edStyles.editorPanel}>
          {/* Section Tabs */}
          <View style={edStyles.sectionTabs}>
            {SECTIONS.map(s => (
              <TouchableOpacity
                key={s.id}
                style={[edStyles.sectionTab, activeSection === s.id && edStyles.sectionTabActive]}
                onPress={() => setActiveSection(s.id)}
              >
                <Ionicons name={s.icon as any} size={14} color={activeSection === s.id ? '#5E6AD2' : '#666'} />
                <Text style={[edStyles.sectionTabText, activeSection === s.id && edStyles.sectionTabTextActive]}>
                  {s.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <ScrollView style={edStyles.editorScroll} contentContainerStyle={{ padding: 16, gap: 14 }}>

            {/* ── IDENTIFICAÇÃO ── */}
            {activeSection === 'identificacao' && (
              <View style={{ gap: 14 }}>
                <EditorSection title="Cabeçalho do Documento">
                  <EditorField
                    label="Título do Documento"
                    value={cfg.tituloDocumento || ''}
                    placeholder="Extracto de Propinas"
                    onChangeText={v => update({ tituloDocumento: v })}
                  />
                  <EditorField
                    label="Subtítulo"
                    value={cfg.subtituloDocumento || ''}
                    placeholder="Histórico de Pagamentos e Propinas"
                    onChangeText={v => update({ subtituloDocumento: v })}
                  />
                  <EditorField
                    label="Nome da Escola / Instituição"
                    value={cfg.nomeEscola || ''}
                    placeholder="Escola Secundária"
                    onChangeText={v => update({ nomeEscola: v })}
                  />
                </EditorSection>
                <EditorSection title="Emissão">
                  <EditorField
                    label="Emitido por"
                    value={cfg.emitidoPor || ''}
                    placeholder="Secretaria"
                    onChangeText={v => update({ emitidoPor: v })}
                  />
                </EditorSection>
              </View>
            )}

            {/* ── ASSINATURAS ── */}
            {activeSection === 'assinaturas' && (
              <View style={{ gap: 14 }}>
                <EditorSection title="1ª Assinatura — Direcção">
                  <EditorField
                    label="Cargo / Título"
                    value={cfg.tituloDirector || ''}
                    placeholder="O Director Geral"
                    onChangeText={v => update({ tituloDirector: v })}
                  />
                  <EditorField
                    label="Nome do Director"
                    value={cfg.directorGeral || ''}
                    placeholder="(deixe vazio para linha em branco)"
                    onChangeText={v => update({ directorGeral: v })}
                  />
                </EditorSection>

                <EditorSection title="2ª Assinatura — Secretaria">
                  <EditorField
                    label="Cargo / Título"
                    value={cfg.tituloSecretaria || ''}
                    placeholder="O Chefe de Secretaria"
                    onChangeText={v => update({ tituloSecretaria: v })}
                  />
                  <EditorField
                    label="Nome do Secretário(a)"
                    value={cfg.chefeSecretaria || ''}
                    placeholder="(deixe vazio para linha em branco)"
                    onChangeText={v => update({ chefeSecretaria: v })}
                  />
                </EditorSection>

                <EditorSection title="3ª Assinatura — Encarregado">
                  <EditorToggle
                    label="Mostrar campo de assinatura do encarregado"
                    value={cfg.mostrarAssinaturaEncarregado !== false}
                    onValueChange={v => update({ mostrarAssinaturaEncarregado: v })}
                  />
                </EditorSection>
              </View>
            )}

            {/* ── CONTEÚDO ── */}
            {activeSection === 'conteudo' && (
              <View style={{ gap: 14 }}>
                <EditorSection title="Secções do Documento">
                  <EditorToggle
                    label="Mostrar cards de resumo (Pago / Pendente / Cancelado)"
                    value={cfg.mostrarResumoCards !== false}
                    onValueChange={v => update({ mostrarResumoCards: v })}
                  />
                  <View style={{ height: 1, backgroundColor: '#1e3055', marginVertical: 4 }} />
                  <EditorToggle
                    label="Mostrar QR Code e Código de Barras"
                    value={cfg.mostrarQrBarcode !== false}
                    onValueChange={v => update({ mostrarQrBarcode: v })}
                  />
                  <View style={{ height: 1, backgroundColor: '#1e3055', marginVertical: 4 }} />
                  <EditorToggle
                    label="Mostrar secção de assinaturas"
                    value={cfg.mostrarAssinaturas !== false}
                    onValueChange={v => update({ mostrarAssinaturas: v })}
                  />
                  <View style={{ height: 1, backgroundColor: '#1e3055', marginVertical: 4 }} />
                  <EditorToggle
                    label="Mostrar nota de rodapé"
                    value={cfg.mostrarRodape !== false}
                    onValueChange={v => update({ mostrarRodape: v })}
                  />
                </EditorSection>

                <EditorSection title="Observações (campo extra)">
                  <EditorField
                    label="Texto de observações"
                    value={cfg.observacoes || ''}
                    placeholder="Adicione notas ou informações adicionais aqui…"
                    onChangeText={v => update({ observacoes: v })}
                    multiline
                  />
                  <Text style={edStyles.fieldHint}>Aparece acima do QR code no documento.</Text>
                </EditorSection>

                <EditorSection title="Nota de Rodapé Personalizada">
                  <EditorField
                    label="Nota adicional no rodapé"
                    value={cfg.notaRodape || ''}
                    placeholder="Ex: Documento válido mediante carimbo da secretaria."
                    onChangeText={v => update({ notaRodape: v })}
                    multiline
                  />
                </EditorSection>
              </View>
            )}

            {/* ── VISUAL ── */}
            {activeSection === 'visual' && (
              <View style={{ gap: 14 }}>
                <EditorSection title="Cor Principal do Documento">
                  <Text style={edStyles.fieldLabel}>Seleccione a cor primária</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                    {COR_OPCOES.map(c => (
                      <TouchableOpacity
                        key={c.value}
                        style={[edStyles.corBtn, { backgroundColor: c.value }, cfg.corPrimaria === c.value && edStyles.corBtnSelected]}
                        onPress={() => update({ corPrimaria: c.value })}
                      >
                        <Text style={edStyles.corBtnLabel}>{c.label}</Text>
                        {cfg.corPrimaria === c.value && (
                          <Ionicons name="checkmark" size={12} color="#fff" />
                        )}
                      </TouchableOpacity>
                    ))}
                  </View>
                </EditorSection>

                <EditorSection title="Informação do QR Code">
                  <View style={edStyles.qrInfoBox}>
                    <Ionicons name="qr-code-outline" size={20} color="#5E6AD2" />
                    <View style={{ flex: 1 }}>
                      <Text style={edStyles.qrInfoTitle}>Dados codificados no QR</Text>
                      <Text style={edStyles.qrInfoText}>
                        • Referência do documento{'\n'}
                        • Nome e matrícula do aluno{'\n'}
                        • Turma e escola{'\n'}
                        • Total liquidado e em cobrança{'\n'}
                        • Número de transacções{'\n'}
                        • Data de emissão e período{'\n'}
                        • Emitido por
                      </Text>
                    </View>
                  </View>
                  <View style={edStyles.barcodeInfoBox}>
                    <Ionicons name="barcode-outline" size={20} color="#5E6AD2" />
                    <View style={{ flex: 1 }}>
                      <Text style={edStyles.qrInfoTitle}>Código de Barras</Text>
                      <Text style={edStyles.qrInfoText}>
                        Formato CODE128 com o número de matrícula do aluno.
                        Compatível com leitores de código de barras padrão.
                      </Text>
                    </View>
                  </View>
                </EditorSection>
              </View>
            )}

          </ScrollView>
        </View>

        {/* ── Preview Panel (right) ── */}
        {Platform.OS === 'web' && (
          <View style={edStyles.previewPanel}>
            <View style={edStyles.previewHeader}>
              <Ionicons name="eye-outline" size={14} color="#5E6AD2" />
              <Text style={edStyles.previewHeaderText}>Pré-Visualização A4 — actualiza automaticamente</Text>
            </View>
            <iframe
              id="editor-preview-iframe"
              srcDoc={html}
              style={{
                flex: 1,
                border: 'none',
                width: '100%',
                height: '100%',
                background: '#d0d0d0',
              } as any}
              title="Preview do Documento"
            />
          </View>
        )}
      </View>
    </View>
  );
}

// ─── Editor Sub-components ────────────────────────────────────────────────────
function EditorSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={edStyles.section}>
      <Text style={edStyles.sectionTitle}>{title}</Text>
      <View style={edStyles.sectionBody}>{children}</View>
    </View>
  );
}

function EditorField({
  label, value, placeholder, onChangeText, multiline,
}: {
  label: string;
  value: string;
  placeholder?: string;
  onChangeText: (v: string) => void;
  multiline?: boolean;
}) {
  return (
    <View style={{ marginBottom: 10 }}>
      <Text style={edStyles.fieldLabel}>{label}</Text>
      <TextInput
        style={[edStyles.fieldInput, multiline && edStyles.fieldInputMulti]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#3a4a66"
        multiline={multiline}
        numberOfLines={multiline ? 3 : 1}
      />
    </View>
  );
}

function EditorToggle({ label, value, onValueChange }: { label: string; value: boolean; onValueChange: (v: boolean) => void }) {
  return (
    <View style={edStyles.toggleRow}>
      <Text style={edStyles.toggleLabel}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: '#1e3055', true: '#5E6AD244' }}
        thumbColor={value ? '#5E6AD2' : '#3a4a66'}
      />
    </View>
  );
}

// ─── Main Screen ─────────────────────────────────────────────────────────────
export default function ExtratoPropinas() {
  const { alunoId: alunoIdParam } = useLocalSearchParams<{ alunoId?: string }>();

  const [alunoSearch, setAlunoSearch] = useState('');
  const [allAlunos, setAllAlunos] = useState<AlunoSimple[]>([]);
  const [loadingAlunos, setLoadingAlunos] = useState(false);
  const [alunosFetched, setAlunosFetched] = useState(false);
  const [selectedAluno, setSelectedAluno] = useState<AlunoSimple | null>(null);
  const [showAlunoDropdown, setShowAlunoDropdown] = useState(false);

  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');

  const [loading, setLoading] = useState(false);
  const [extrato, setExtrato] = useState<Extrato | null>(null);
  const [showEditor, setShowEditor] = useState(false);

  const { showToast } = useToast();
  const { user } = useAuth();
  const { config } = useConfig();

  // Auto-select aluno when navigating from student profile
  useEffect(() => {
    if (!alunoIdParam) return;
    (async () => {
      try {
        const rows = await req<AlunoSimple[]>('/api/alunos');
        setAllAlunos(rows);
        setAlunosFetched(true);
        const found = rows.find(a => a.id === alunoIdParam);
        if (found) {
          setSelectedAluno(found);
          setAlunoSearch(`${found.nome} ${found.apelido} — Nº ${found.numeroMatricula}`);
        }
      } catch {
        // silently ignore — user can still select manually
      }
    })();
  }, [alunoIdParam]);

  const fetchAlunos = async () => {
    if (alunosFetched) return;
    setLoadingAlunos(true);
    try {
      const rows = await req<AlunoSimple[]>('/api/alunos');
      setAllAlunos(rows);
      setAlunosFetched(true);
    } catch (e) {
      showToast((e as Error).message, 'error');
    } finally {
      setLoadingAlunos(false);
    }
  };

  const filteredAlunos = allAlunos.filter(a => {
    const q = alunoSearch.toLowerCase();
    return !q || `${a.nome} ${a.apelido}`.toLowerCase().includes(q) || a.numeroMatricula.toLowerCase().includes(q);
  }).slice(0, 20);

  const handleSelectAluno = (a: AlunoSimple) => {
    setSelectedAluno(a);
    setAlunoSearch(`${a.nome} ${a.apelido} — Nº ${a.numeroMatricula}`);
    setShowAlunoDropdown(false);
    setExtrato(null);
  };

  const gerarExtrato = async () => {
    if (!selectedAluno) {
      showToast('Seleccione um aluno primeiro.', 'error');
      return;
    }
    setLoading(true);
    setExtrato(null);
    try {
      const params = new URLSearchParams({ alunoId: selectedAluno.id });
      if (dataInicio) params.append('dataInicio', dataInicio);
      if (dataFim) params.append('dataFim', dataFim);
      const data = await req<Extrato>(`/api/extrato-propinas?${params}`);
      setExtrato(data);
      if (data.pagamentos.length === 0) {
        showToast('Nenhum pagamento encontrado para o período seleccionado.', 'info');
      }
    } catch (e) {
      showToast((e as Error).message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const limpar = () => {
    setSelectedAluno(null);
    setAlunoSearch('');
    setDataInicio('');
    setDataFim('');
    setExtrato(null);
    setAlunosFetched(false);
    setAllAlunos([]);
  };

  const initialEditorConfig: ExtratoHtmlConfig = {
    nomeEscola:       (config as any)?.nomeEscola || '',
    directorGeral:    (config as any)?.directorGeral || '',
    chefeSecretaria:  (config as any)?.chefeSecretaria || '',
    emitidoPor:       (user as any)?.nome || (user as any)?.email || 'Secretaria',
    tituloDocumento:  'Extracto de Propinas',
    subtituloDocumento: 'Histórico de Pagamentos e Propinas',
    tituloDirector:   'O Director Geral',
    tituloSecretaria: 'O Chefe de Secretaria',
    mostrarResumoCards: true,
    mostrarQrBarcode: true,
    mostrarAssinaturas: true,
    mostrarRodape: true,
    mostrarAssinaturaEncarregado: true,
    corPrimaria: '#1a2540',
  };

  return (
    <View style={styles.root}>
      <TopBar title="Extrato de Pagamentos" subtitle="Propinas e taxas por aluno" />

      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">

        {/* ── Painel de Pesquisa ── */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <FontAwesome5 name="file-invoice-dollar" size={16} color="#5E6AD2" />
            <Text style={styles.cardTitle}>Gerar Extracto</Text>
          </View>

          <Text style={styles.label}>Aluno / Estudante<RequiredMark /></Text>
          <TouchableOpacity
            style={styles.alunoPickerBtn}
            onPress={() => { fetchAlunos(); setShowAlunoDropdown(true); }}
          >
            <Ionicons name="person-outline" size={16} color="#888" />
            <Text style={[styles.alunoPickerText, selectedAluno && { color: '#fff' }]} numberOfLines={1}>
              {selectedAluno ? `${selectedAluno.nome} ${selectedAluno.apelido} — Nº ${selectedAluno.numeroMatricula}` : 'Seleccionar aluno…'}
            </Text>
            <Ionicons name="chevron-down" size={16} color="#888" />
          </TouchableOpacity>

          <View style={styles.dateRow}>
            <View style={styles.dateField}>
              <Text style={styles.label}>Data Início</Text>
              <DateInput
                style={styles.dateInput}
                value={dataInicio}
                onChangeText={setDataInicio}
                placeholderTextColor="#555"
              />
            </View>
            <View style={styles.dateField}>
              <Text style={styles.label}>Data Fim</Text>
              <DateInput
                style={styles.dateInput}
                value={dataFim}
                onChangeText={setDataFim}
                placeholderTextColor="#555"
              />
            </View>
          </View>

          <Text style={styles.dateTip}>
            Deixe as datas em branco para mostrar todos os pagamentos.
          </Text>

          <View style={styles.btnRow}>
            <TouchableOpacity style={styles.btnClear} onPress={limpar}>
              <Ionicons name="refresh-outline" size={16} color="#aaa" />
              <Text style={styles.btnClearText}>Limpar</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.btnGerar} onPress={gerarExtrato} disabled={loading || !selectedAluno}>
              {loading
                ? <AppLoader color="#fff" size="small" />
                : <>
                    <Ionicons name="document-text-outline" size={16} color="#fff" />
                    <Text style={styles.btnGerarText}>Gerar Extracto</Text>
                  </>
              }
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Extrato ── */}
        {extrato && (
          <View style={styles.extratoContainer}>

            {/* Cabeçalho */}
            <View style={styles.extratoHeader}>
              <View style={styles.extratoHeaderTop}>
                <View style={styles.logoBox}>
                  <MaterialCommunityIcons name="school" size={24} color="#5E6AD2" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.extratoTitle}>EXTRACTO DE PAGAMENTOS</Text>
                  <Text style={styles.extratoSubtitle}>{config.nomeEscola}</Text>
                </View>
              </View>

              <View style={styles.divider} />

              <View style={styles.alunoInfoGrid}>
                <InfoRow label="Nome Completo" value={`${extrato.aluno.nome} ${extrato.aluno.apelido}`} />
                <InfoRow label="Nº Matrícula" value={extrato.aluno.numeroMatricula} />
                {extrato.aluno.turmaNome && <InfoRow label="Turma" value={extrato.aluno.turmaNome} />}
                {extrato.aluno.cursoNome && <InfoRow label="Curso" value={extrato.aluno.cursoNome} />}
                {extrato.aluno.nomeEncarregado && <InfoRow label="Encarregado" value={extrato.aluno.nomeEncarregado} />}
                {extrato.filtros.dataInicio && (
                  <InfoRow label="Período" value={`${fmtDate(extrato.filtros.dataInicio || '')} — ${fmtDate(extrato.filtros.dataFim || 'Presente')}`} />
                )}
                <InfoRow label="Data de Emissão" value={fmtDate(new Date().toISOString().slice(0, 10))} />
              </View>
            </View>

            {/* Resumo / Totais */}
            <View style={styles.resumoRow}>
              <ResumoCard label="Total Liquidado" value={extrato.resumo.totalPago} color="#66BB6A" icon="checkmark-circle" />
              <ResumoCard label="Em Cobrança" value={extrato.resumo.totalPendente} color="#FFA726" icon="time" />
              <ResumoCard label="Cancelado" value={extrato.resumo.totalCancelado} color="#888" icon="close-circle" />
            </View>

            <View style={styles.totalGeralBox}>
              <Text style={styles.totalGeralLabel}>Total de Transacções: {extrato.resumo.total}</Text>
              <Text style={styles.totalGeralValue}>{fmtAOA(extrato.resumo.totalPago + extrato.resumo.totalPendente)}</Text>
            </View>

            {/* Tabela de movimentos */}
            <View style={styles.tableHeader}>
              <Text style={[styles.thCell, { flex: 1.4 }]}>Data</Text>
              <Text style={[styles.thCell, { flex: 2.5 }]}>Descrição</Text>
              <Text style={[styles.thCell, { flex: 1.2 }]}>Método</Text>
              <Text style={[styles.thCell, { flex: 1.4, textAlign: 'right' }]}>Valor</Text>
              <Text style={[styles.thCell, { flex: 1.1, textAlign: 'center' }]}>Estado</Text>
            </View>

            {extrato.pagamentos.length === 0 ? (
              <View style={styles.emptyExtrato}>
                <Ionicons name="document-outline" size={40} color="#444" />
                <Text style={styles.emptyExtratoText}>Nenhum pagamento no período seleccionado</Text>
              </View>
            ) : (
              extrato.pagamentos.map((p, idx) => {
                const cfg = STATUS_CFG[p.status] || STATUS_CFG.pendente;
                const descricao = [
                  p.taxaDescricao || TIPO_LABEL[p.taxaTipo] || p.taxaTipo,
                  p.mes ? mesLabel(p.mes) : '',
                  p.ano,
                ].filter(Boolean).join(' · ');

                return (
                  <View key={p.id} style={[styles.tableRow, idx % 2 === 1 && styles.tableRowAlt]}>
                    <Text style={[styles.tdCell, { flex: 1.4, color: '#ccc' }]}>{fmtDate(p.data)}</Text>
                    <View style={{ flex: 2.5 }}>
                      <Text style={[styles.tdCell, { color: '#fff' }]} numberOfLines={1}>{descricao}</Text>
                      {p.referencia ? <Text style={styles.tdRef} numberOfLines={1}>Ref: {p.referencia}</Text> : null}
                      {p.observacao ? <Text style={styles.tdRef} numberOfLines={1}>{p.observacao}</Text> : null}
                    </View>
                    <Text style={[styles.tdCell, { flex: 1.2, color: '#aaa' }]} numberOfLines={1}>
                      {METODO_LABEL[p.metodoPagamento] || p.metodoPagamento}
                    </Text>
                    <Text style={[styles.tdCell, {
                      flex: 1.4, textAlign: 'right',
                      color: p.status === 'pago' ? '#66BB6A' : p.status === 'pendente' ? '#FFA726' : '#888',
                      fontFamily: 'Inter_600SemiBold',
                    }]}>
                      {fmtAOA(p.valor)}
                    </Text>
                    <View style={{ flex: 1.1, alignItems: 'center' }}>
                      <View style={[styles.statusBadge, { backgroundColor: cfg.bg }]}>
                        <Text style={[styles.statusText, { color: cfg.color }]}>{cfg.label}</Text>
                      </View>
                    </View>
                  </View>
                );
              })
            )}

            {/* Rodapé */}
            <View style={styles.extratoFooter}>
              <View style={styles.divider} />
              <View style={styles.footerTotals}>
                <View style={styles.footerTotalRow}>
                  <Text style={styles.footerTotalLabel}>Total Liquidado</Text>
                  <Text style={[styles.footerTotalValue, { color: '#66BB6A' }]}>{fmtAOA(extrato.resumo.totalPago)}</Text>
                </View>
                {extrato.resumo.totalPendente > 0 && (
                  <View style={styles.footerTotalRow}>
                    <Text style={styles.footerTotalLabel}>Total Em Cobrança</Text>
                    <Text style={[styles.footerTotalValue, { color: '#FFA726' }]}>{fmtAOA(extrato.resumo.totalPendente)}</Text>
                  </View>
                )}
                <View style={[styles.footerTotalRow, styles.footerGrandTotal]}>
                  <Text style={styles.footerGrandLabel}>TOTAL GERAL</Text>
                  <Text style={styles.footerGrandValue}>{fmtAOA(extrato.resumo.totalPago + extrato.resumo.totalPendente)}</Text>
                </View>
              </View>
              <Text style={styles.footerNote}>
                Documento gerado em {new Date().toLocaleString('pt-PT')} por {(user as any)?.nome || (user as any)?.email}{'\n'}
                Este extracto é meramente informativo e não substitui recibo oficial.
              </Text>
            </View>

            {/* Botão Editor de Documento */}
            {Platform.OS === 'web' && (
              <TouchableOpacity style={styles.btnEditorDoc} onPress={() => setShowEditor(true)}>
                <Ionicons name="create-outline" size={18} color="#fff" />
                <Text style={styles.btnEditorDocText}>Abrir Editor de Documento</Text>
                <View style={styles.editorBadge}>
                  <Ionicons name="qr-code-outline" size={11} color="#fff" />
                  <Ionicons name="barcode-outline" size={11} color="#fff" />
                  <Text style={styles.editorBadgeText}>QR + Barras</Text>
                </View>
              </TouchableOpacity>
            )}
          </View>
        )}

      </ScrollView>

      {/* ── Modal de selecção de aluno ── */}
      <Modal visible={showAlunoDropdown} transparent animationType="fade" onRequestClose={() => setShowAlunoDropdown(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowAlunoDropdown(false)}>
          <View style={styles.alunoModal} onStartShouldSetResponder={() => true}>
            <View style={styles.alunoModalHeader}>
              <Text style={styles.alunoModalTitle}>Seleccionar Aluno</Text>
              <TouchableOpacity onPress={() => setShowAlunoDropdown(false)}>
                <Ionicons name="close" size={20} color="#fff" />
              </TouchableOpacity>
            </View>
            <View style={styles.alunoSearchBox}>
              <Ionicons name="search" size={16} color="#888" />
              <TextInput
                style={styles.alunoSearchInput}
                placeholder="Nome ou número de matrícula…"
                placeholderTextColor="#666"
                value={alunoSearch.includes('—') ? '' : alunoSearch}
                onChangeText={v => { setAlunoSearch(v); setSelectedAluno(null); }}
                autoFocus
              />
            </View>
            {loadingAlunos ? (
              <View style={styles.modalCenter}>
                <AppLoader color="#5E6AD2" />
              </View>
            ) : (
              <FlatList
                data={filteredAlunos}
                keyExtractor={i => i.id}
                style={{ maxHeight: 360 }}
                ListEmptyComponent={
                  <View style={styles.modalCenter}>
                    <Text style={{ color: '#888', fontSize: 14 }}>Nenhum aluno encontrado</Text>
                  </View>
                }
                renderItem={({ item }) => (
                  <TouchableOpacity style={styles.alunoItem} onPress={() => handleSelectAluno(item)}>
                    <View style={styles.alunoItemIcon}>
                      <Ionicons name="person" size={18} color="#5E6AD2" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.alunoItemName}>{item.nome} {item.apelido}</Text>
                      <Text style={styles.alunoItemNum}>Nº {item.numeroMatricula}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color="#555" />
                  </TouchableOpacity>
                )}
              />
            )}
          </View>
        </TouchableOpacity>
              </KeyboardAvoidingView>
</Modal>

      {/* ── Modal Editor de Documento ── */}
      {showEditor && extrato && Platform.OS === 'web' && (
        <Modal visible={showEditor} transparent={false} animationType="slide" onRequestClose={() => setShowEditor(false)}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <DocumentEditor
            extrato={extrato}
            initialConfig={initialEditorConfig}
            onClose={() => setShowEditor(false)}
          />
                  </KeyboardAvoidingView>
</Modal>
      )}
    </View>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}:</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

function ResumoCard({ label, value, color, icon }: { label: string; value: number; color: string; icon: string }) {
  return (
    <View style={[styles.resumoCard, { borderColor: color + '44' }]}>
      <Ionicons name={icon as any} size={20} color={color} />
      <Text style={[styles.resumoValue, { color }]}>{value.toLocaleString('pt-AO', { minimumFractionDigits: 0 })} Kz</Text>
      <Text style={styles.resumoLabel}>{label}</Text>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0D1F35' },
  container: { padding: 16, paddingBottom: 60, gap: 16 },

  card: { backgroundColor: '#111f3d', borderRadius: 14, borderWidth: 1, borderColor: '#1e3055', padding: 18 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 },
  cardTitle: { color: '#fff', fontSize: 15, fontFamily: 'Inter_700Bold' },

  label: { color: '#aaa', fontSize: 12, fontFamily: 'Inter_500Medium', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  alunoPickerBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1a2a4a', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 13, gap: 10, marginBottom: 14, borderWidth: 1, borderColor: '#253a5e' },
  alunoPickerText: { flex: 1, color: '#666', fontSize: 14, fontFamily: 'Inter_400Regular' },

  dateRow: { flexDirection: 'row', gap: 12, marginBottom: 8 },
  dateField: { flex: 1 },
  dateInput: { backgroundColor: '#1a2a4a', color: '#fff', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, fontSize: 14, fontFamily: 'Inter_400Regular', borderWidth: 1, borderColor: '#253a5e' },
  dateTip: { color: '#555', fontSize: 12, fontFamily: 'Inter_400Regular', marginBottom: 16 },

  btnRow: { flexDirection: 'row', gap: 10 },
  btnClear: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#1a2a4a', borderRadius: 10, paddingVertical: 12, borderWidth: 1, borderColor: '#253a5e' },
  btnClearText: { color: '#aaa', fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  btnGerar: { flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#5E6AD2', borderRadius: 10, paddingVertical: 12 },
  btnGerarText: { color: '#fff', fontSize: 14, fontFamily: 'Inter_700Bold' },

  // Extrato
  extratoContainer: { gap: 0 },
  extratoHeader: { backgroundColor: '#0a1828', borderRadius: 14, borderWidth: 1, borderColor: '#1e3055', padding: 18, marginBottom: 12 },
  extratoHeaderTop: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 14 },
  logoBox: { width: 48, height: 48, borderRadius: 12, backgroundColor: '#5E6AD222', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#5E6AD244' },
  extratoTitle: { color: '#fff', fontSize: 14, fontFamily: 'Inter_700Bold', letterSpacing: 1 },
  extratoSubtitle: { color: '#888', fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 2 },
  divider: { height: 1, backgroundColor: '#1e3055', marginVertical: 14 },
  alunoInfoGrid: { gap: 8 },
  infoRow: { flexDirection: 'row', gap: 8 },
  infoLabel: { color: '#666', fontSize: 13, fontFamily: 'Inter_500Medium', width: 120 },
  infoValue: { color: '#ddd', fontSize: 13, fontFamily: 'Inter_400Regular', flex: 1 },

  resumoRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  resumoCard: { flex: 1, backgroundColor: '#0a1828', borderRadius: 12, borderWidth: 1, padding: 12, alignItems: 'center', gap: 4 },
  resumoValue: { fontSize: 13, fontFamily: 'Inter_700Bold', textAlign: 'center' },
  resumoLabel: { color: '#888', fontSize: 11, fontFamily: 'Inter_400Regular', textAlign: 'center' },

  totalGeralBox: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#0a1828', borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10, marginBottom: 12, borderWidth: 1, borderColor: '#1e3055' },
  totalGeralLabel: { color: '#888', fontSize: 13, fontFamily: 'Inter_500Medium' },
  totalGeralValue: { color: '#fff', fontSize: 14, fontFamily: 'Inter_700Bold' },

  tableHeader: { flexDirection: 'row', backgroundColor: '#0a1828', paddingHorizontal: 12, paddingVertical: 8, borderTopLeftRadius: 10, borderTopRightRadius: 10, borderWidth: 1, borderColor: '#1e3055' },
  thCell: { color: '#666', fontSize: 11, fontFamily: 'Inter_600SemiBold', textTransform: 'uppercase', letterSpacing: 0.5 },
  tableRow: { flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#0f1e38', alignItems: 'center' },
  tableRowAlt: { backgroundColor: '#0a1525' },
  tdCell: { fontSize: 12, fontFamily: 'Inter_400Regular' },
  tdRef: { color: '#555', fontSize: 11, fontFamily: 'Inter_400Regular', marginTop: 2 },
  statusBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  statusText: { fontSize: 10, fontFamily: 'Inter_600SemiBold' },

  emptyExtrato: { alignItems: 'center', justifyContent: 'center', paddingVertical: 40, gap: 10, backgroundColor: '#0a1525', borderRadius: 10, borderWidth: 1, borderColor: '#1e3055' },
  emptyExtratoText: { color: '#666', fontSize: 14, fontFamily: 'Inter_400Regular' },

  extratoFooter: { backgroundColor: '#0a1828', borderRadius: 14, borderWidth: 1, borderColor: '#1e3055', padding: 18, marginTop: 8 },
  footerTotals: { gap: 8 },
  footerTotalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  footerTotalLabel: { color: '#888', fontSize: 13, fontFamily: 'Inter_400Regular' },
  footerTotalValue: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  footerGrandTotal: { paddingTop: 10, borderTopWidth: 1, borderTopColor: '#1e3055', marginTop: 4 },
  footerGrandLabel: { color: '#fff', fontSize: 14, fontFamily: 'Inter_700Bold', letterSpacing: 0.5 },
  footerGrandValue: { color: '#5E6AD2', fontSize: 16, fontFamily: 'Inter_700Bold' },
  footerNote: { color: '#444', fontSize: 11, fontFamily: 'Inter_400Regular', marginTop: 14, lineHeight: 16, textAlign: 'center' },

  btnEditorDoc: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#5E6AD2', borderRadius: 10, paddingVertical: 14, marginTop: 12 },
  btnEditorDocText: { color: '#fff', fontSize: 14, fontFamily: 'Inter_700Bold' },
  editorBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#ffffff22', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  editorBadgeText: { color: '#fff', fontSize: 10, fontFamily: 'Inter_600SemiBold' },

  // Aluno modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  alunoModal: { backgroundColor: '#0e1e3d', borderRadius: 18, width: '100%', maxWidth: 480, overflow: 'hidden' },
  alunoModalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 18, backgroundColor: '#0a1830' },
  alunoModalTitle: { color: '#fff', fontSize: 16, fontFamily: 'Inter_700Bold' },
  alunoSearchBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1a2a4a', marginHorizontal: 16, marginVertical: 12, borderRadius: 10, paddingHorizontal: 12, gap: 8, height: 42 },
  alunoSearchInput: { flex: 1, color: '#fff', fontSize: 14, fontFamily: 'Inter_400Regular' },
  alunoItem: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: '#1a2a4a', gap: 12 },
  alunoItemIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#5E6AD222', alignItems: 'center', justifyContent: 'center' },
  alunoItemName: { color: '#fff', fontSize: 14, fontFamily: 'Inter_500Medium' },
  alunoItemNum: { color: '#888', fontSize: 12, fontFamily: 'Inter_400Regular' },
  modalCenter: { paddingVertical: 30, alignItems: 'center' },
});

// ─── Editor Styles ────────────────────────────────────────────────────────────
const edStyles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#060f1f' },

  topBar: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 14, paddingVertical: 10,
    backgroundColor: '#060f1f', borderBottomWidth: 1, borderBottomColor: '#1e3055',
  },
  closeBtn: { padding: 8, borderRadius: 8, backgroundColor: '#1a2a4a' },
  topTitle: { color: '#fff', fontSize: 15, fontFamily: 'Inter_700Bold' },
  topSub: { color: '#888', fontSize: 11, fontFamily: 'Inter_400Regular', marginTop: 1 },
  printBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#26A69A', paddingHorizontal: 14, paddingVertical: 9, borderRadius: 8,
  },
  printBtnText: { color: '#fff', fontFamily: 'Inter_600SemiBold', fontSize: 13 },

  body: { flex: 1, flexDirection: 'row' },

  // Editor Panel
  editorPanel: { width: 340, backgroundColor: '#080f24', borderRightWidth: 1, borderRightColor: '#1e3055' },

  sectionTabs: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#1e3055' },
  sectionTab: { flex: 1, alignItems: 'center', paddingVertical: 10, paddingHorizontal: 4, gap: 3 },
  sectionTabActive: { borderBottomWidth: 2, borderBottomColor: '#5E6AD2' },
  sectionTabText: { color: '#555', fontSize: 10, fontFamily: 'Inter_500Medium', textAlign: 'center' },
  sectionTabTextActive: { color: '#5E6AD2' },

  editorScroll: { flex: 1 },

  section: { backgroundColor: '#0e1e3d', borderRadius: 10, borderWidth: 1, borderColor: '#1e3055', overflow: 'hidden', marginBottom: 4 },
  sectionTitle: {
    color: '#5E6AD2', fontSize: 10, fontFamily: 'Inter_700Bold',
    textTransform: 'uppercase', letterSpacing: 1,
    paddingHorizontal: 14, paddingVertical: 9,
    backgroundColor: '#0a1830', borderBottomWidth: 1, borderBottomColor: '#1e3055',
  },
  sectionBody: { padding: 14 },

  fieldLabel: { color: '#888', fontSize: 11, fontFamily: 'Inter_600SemiBold', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 5 },
  fieldInput: {
    backgroundColor: '#1a2a4a', color: '#fff', borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 9, fontSize: 13,
    fontFamily: 'Inter_400Regular', borderWidth: 1, borderColor: '#253a5e',
  },
  fieldInputMulti: { height: 72, textAlignVertical: 'top', paddingTop: 9 },
  fieldHint: { color: '#3a4a66', fontSize: 10, fontFamily: 'Inter_400Regular', marginTop: 4 },

  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, minHeight: 36 },
  toggleLabel: { color: '#aaa', fontSize: 12, fontFamily: 'Inter_400Regular', flex: 1, lineHeight: 16 },

  corBtn: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, flexDirection: 'row', gap: 5, alignItems: 'center' },
  corBtnSelected: { borderWidth: 2, borderColor: '#fff' },
  corBtnLabel: { color: '#fff', fontSize: 11, fontFamily: 'Inter_600SemiBold' },

  qrInfoBox: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', backgroundColor: '#5E6AD211', borderRadius: 8, padding: 12, marginBottom: 10 },
  barcodeInfoBox: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', backgroundColor: '#5E6AD211', borderRadius: 8, padding: 12 },
  qrInfoTitle: { color: '#5E6AD2', fontSize: 11, fontFamily: 'Inter_700Bold', marginBottom: 5 },
  qrInfoText: { color: '#888', fontSize: 10, fontFamily: 'Inter_400Regular', lineHeight: 16 },

  // Preview Panel
  previewPanel: { flex: 1, flexDirection: 'column', backgroundColor: '#d0d0d0' },
  previewHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 8,
    backgroundColor: '#0e1e3d', borderBottomWidth: 1, borderBottomColor: '#1e3055',
  },
  previewHeaderText: { color: '#5E6AD2', fontSize: 11, fontFamily: 'Inter_600SemiBold' },
});
