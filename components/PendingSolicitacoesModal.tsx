import React, { useState, useEffect, useRef } from 'react';
import { Modal, View, Text, StyleSheet, TouchableOpacity, Platform, useWindowDimensions, Animated } from 'react-native';
import AppLoader from '@/components/AppLoader';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Colors } from '@/constants/colors';
import { apiRequest } from '@/lib/query-client';
import { alertSucesso, alertErro } from '@/utils/toast';
import { openPdfInTab } from '@/utils/pdfAuth';

interface TipoTemplate { id: string; nome: string; tipo: string; }
interface TiposHabilitados { tiposPadrao: string[]; tiposTemplate: TipoTemplate[]; }

export interface Solicitacao {
  id: string;
  alunoId: string;
  tipo: string;
  motivo: string;
  observacao?: string;
  status: string;
  resposta?: string;
  createdAt: string;
  nomeAluno?: string;
  apelidoAluno?: string;
  alunoNumMatricula?: string;
  nomeTurma?: string;
  classeAluno?: string;
}

const TIPO_BUILD_URL: Record<string, (alunoId: string, finalidade: string, trimestre: string) => string> = {
  'Declaração de Matrícula':          (id, fin) => `/api/pdf/declaracao/${id}?tipo=matricula&finalidade=${encodeURIComponent(fin)}&autoprint=true`,
  'Certificado de Notas':             (id, _fin, tri) => `/api/pdf/boletim/${id}?trimestre=${tri}&autoprint=true`,
  'Certificado de Frequência':        (id, fin) => `/api/pdf/declaracao/${id}?tipo=frequencia&finalidade=${encodeURIComponent(fin)}&autoprint=true`,
  'Declaração de Conclusão de Curso': (id, fin) => `/api/pdf/declaracao/${id}?tipo=conclusao&finalidade=${encodeURIComponent(fin)}&autoprint=true`,
  'Histórico Escolar':                (id) => `/api/pdf/historico-academico/${id}?autoprint=true`,
  'Diploma':                          (id) => `/api/pdf/declaracao/${id}?tipo=habilitacoes&autoprint=true`,
  'Outros':                           (id, fin) => `/api/pdf/declaracao/${id}?tipo=matricula&finalidade=${encodeURIComponent(fin)}&autoprint=true`,
};

const TIPO_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  'Declaração de Matrícula': 'document-text',
  'Certificado de Notas': 'bar-chart',
  'Certificado de Frequência': 'checkmark-circle',
  'Declaração de Conclusão de Curso': 'school',
  'Histórico Escolar': 'time',
  'Diploma': 'ribbon',
  'Outros': 'document',
};

const TIPO_COLORS: Record<string, string> = {
  'Declaração de Matrícula': Colors.info,
  'Certificado de Notas': Colors.success,
  'Certificado de Frequência': '#8B5CF6',
  'Declaração de Conclusão de Curso': Colors.gold,
  'Histórico Escolar': Colors.warning,
  'Diploma': Colors.gold,
  'Outros': Colors.textSecondary,
};

const TRIMESTRES = ['1', '2', '3'];

interface Props {
  visible: boolean;
  solicitacoes: Solicitacao[];
  onClose: () => void;
  onAdiar: () => void;
  onUpdate: (updated: Solicitacao) => void;
}

function formatDate(iso: string) {
  try {
    const d = new Date(iso);
    return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()}`;
  } catch { return iso; }
}

type GerarState = 'idle' | 'loading' | 'success' | 'error';

const GERAR_STEPS = [
  { label: 'A preparar dados do aluno…', icon: 'server-outline' as const },
  { label: 'A construir o documento…',   icon: 'document-text-outline' as const },
  { label: 'A abrir para impressão…',    icon: 'print-outline' as const },
];

export default function PendingSolicitacoesModal({ visible, solicitacoes, onClose, onAdiar, onUpdate }: Props) {
  const { width, height } = useWindowDimensions();
  const router = useRouter();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [allDone, setAllDone] = useState(false);
  const [gerarState, setGerarState] = useState<GerarState>('idle');
  const [gerarStep, setGerarStep] = useState(0);
  const [selectedTrimestre, setSelectedTrimestre] = useState('1');
  const progressAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // ── Tipos habilitados (fetched from server) ──────────────────────────────
  const [tiposHabilitados, setTiposHabilitados] = useState<TiposHabilitados | null>(null);

  useEffect(() => {
    if (!visible) return;
    apiRequest('GET', '/api/doc-templates/tipos-habilitados')
      .then(r => r.json())
      .then((data: TiposHabilitados) => setTiposHabilitados(data))
      .catch(() => {});
  }, [visible]);

  // Build the set of allowed tipos (standard + active templates)
  const tiposPermitidos = React.useMemo(() => {
    if (!tiposHabilitados) return null; // null = still loading, show all
    const set = new Set<string>([
      ...tiposHabilitados.tiposPadrao,
      ...tiposHabilitados.tiposTemplate.map(t => t.nome),
    ]);
    return set;
  }, [tiposHabilitados]);

  // Filter: only show requests with a supported, unlocked type
  const pendentes = solicitacoes.filter(s => {
    if (s.status !== 'pendente' && s.status !== 'em_processamento') return false;
    if (tiposPermitidos === null) return true; // loading: show all
    return tiposPermitidos.has(s.tipo);
  });

  // Determine if current request is template-based (not a hardcoded PDF type)
  const tipoTemplateInfo = React.useMemo(() => {
    if (!tiposHabilitados || !pendentes[currentIndex]) return null;
    const tipo = pendentes[currentIndex].tipo;
    if (tiposHabilitados.tiposPadrao.includes(tipo)) return null; // standard PDF type
    return tiposHabilitados.tiposTemplate.find(t => t.nome === tipo) ?? null;
  }, [tiposHabilitados, pendentes, currentIndex]);

  const total = pendentes.length;
  const current = pendentes[currentIndex] ?? null;

  const needsTrimestre = current?.tipo === 'Certificado de Notas';

  useEffect(() => {
    if (visible) { setCurrentIndex(0); setAllDone(false); setGerarState('idle'); setGerarStep(0); }
  }, [visible]);

  useEffect(() => {
    if (visible && pendentes.length === 0 && solicitacoes.length > 0) setAllDone(true);
  }, [pendentes.length, visible]);

  useEffect(() => {
    if (gerarState === 'loading') {
      const nd = Platform.OS !== 'web';
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 0.6, duration: 600, useNativeDriver: nd }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 600, useNativeDriver: nd }),
        ])
      ).start();
    } else {
      pulseAnim.setValue(1);
    }
  }, [gerarState]);

  function advance() {
    setGerarState('idle');
    setGerarStep(0);
    if (currentIndex < pendentes.length - 1) setCurrentIndex(i => i + 1);
    else setAllDone(true);
  }

  async function marcarConcluido(sol: Solicitacao) {
    setLoadingAction('concluido');
    try {
      const res = await apiRequest('PUT', `/api/solicitacoes-documentos/${sol.id}`, { status: 'concluido' });
      if (res.ok) {
        const updated = await res.json();
        onUpdate({ ...sol, ...updated, status: 'concluido' });
        alertSucesso('Solicitação concluída');
        setTimeout(advance, 300);
      }
    } catch { alertErro('Erro ao actualizar estado'); }
    finally { setLoadingAction(null); }
  }

  async function gerarDocumento(sol: Solicitacao) {
    setGerarState('loading');
    setGerarStep(0);

    try {
      // Step 1 — mark as em_processamento
      await new Promise(r => setTimeout(r, 600));
      await apiRequest('PUT', `/api/solicitacoes-documentos/${sol.id}`, { status: 'em_processamento' });
      onUpdate({ ...sol, status: 'em_processamento' });

      // Step 2 — building document
      setGerarStep(1);
      await new Promise(r => setTimeout(r, 700));

      // Step 3 — open PDF
      setGerarStep(2);
      await new Promise(r => setTimeout(r, 500));

      const buildUrl = TIPO_BUILD_URL[sol.tipo] ?? TIPO_BUILD_URL['Outros'];
      const baseUrl = buildUrl(sol.alunoId, sol.motivo || 'Emissão solicitada pelo estudante', selectedTrimestre);
      await openPdfInTab(baseUrl);

      // Mark concluido
      await new Promise(r => setTimeout(r, 400));
      const res = await apiRequest('PUT', `/api/solicitacoes-documentos/${sol.id}`, { status: 'concluido', resposta: 'Documento emitido com sucesso.' });
      if (res.ok) {
        const updated = await res.json();
        onUpdate({ ...sol, ...updated, status: 'concluido' });
      }

      setGerarState('success');
      alertSucesso('Documento aberto para impressão');
      setTimeout(advance, 1400);
    } catch (err) {
      setGerarState('error');
      alertErro('Erro ao gerar o documento');
      setTimeout(() => setGerarState('idle'), 2500);
    }
  }

  function saltarParaProximo() {
    setGerarState('idle');
    setGerarStep(0);
    if (currentIndex < pendentes.length - 1) setCurrentIndex(i => i + 1);
  }

  const progress = total > 0 ? ((currentIndex + 1) / total) : 1;
  const tipoColor = current ? (TIPO_COLORS[current.tipo] || Colors.gold) : Colors.gold;
  const tipoIcon = current ? (TIPO_ICONS[current.tipo] || 'document-text') : 'document-text';
  const nomeCompleto = current
    ? [current.nomeAluno, current.apelidoAluno].filter(Boolean).join(' ') || current.alunoId
    : '';
  const isWide = width >= 760;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={() => {}}>
      <View style={[s.overlay, isWide && s.overlayWide]}>
        <View style={[s.container, isWide && s.containerWide, { maxHeight: isWide ? Math.min(height - 64, 620) : '82%' }]}>

          {allDone || total === 0 ? (
            <View style={s.successWrap}>
              <View style={s.successIconWrap}>
                <MaterialCommunityIcons name="check-all" size={36} color={Colors.success} />
              </View>
              <Text style={s.successTitle}>Todas Tratadas!</Text>
              <Text style={s.successSub}>Não há pedidos de documentos pendentes.</Text>
              <TouchableOpacity style={s.btnFecharSuccess} onPress={onClose} activeOpacity={0.85}>
                <Ionicons name="checkmark-circle" size={16} color="#fff" />
                <Text style={s.btnFecharSuccessText}>Fechar</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              {/* HEADER */}
              <View style={s.header}>
                <View style={s.headerLeft}>
                  <View style={[s.iconBadge, { backgroundColor: tipoColor + '20' }]}>
                    <MaterialCommunityIcons name="file-document-multiple" size={22} color={tipoColor} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.title}>Solicitações Pendentes</Text>
                    <Text style={s.subtitle}>Validação de documentos pendente — siga para tratar</Text>
                  </View>
                </View>
                <View style={s.lockBadge}>
                  <Ionicons name="lock-closed" size={11} color={Colors.warning} />
                  <Text style={s.lockText}>Obrigatório</Text>
                </View>
              </View>

              {/* PROGRESS */}
              <View style={s.progressWrap}>
                <View style={s.progressTrack}>
                  <View style={[s.progressFill, { width: `${progress * 100}%`, backgroundColor: tipoColor }]} />
                </View>
                <Text style={s.progressText}>{currentIndex + 1}/{total}</Text>
              </View>

              {/* CARD */}
              {current && (
                <View style={[s.card, { borderColor: tipoColor + '35' }]}>
                  <View style={[s.cardAccent, { backgroundColor: tipoColor }]} />
                  <View style={s.cardTop}>
                    <View style={[s.tipoIconWrap, { backgroundColor: tipoColor + '18', borderColor: tipoColor + '30' }]}>
                      <Ionicons name={tipoIcon} size={26} color={tipoColor} />
                    </View>
                    <View style={s.cardInfo}>
                      <Text style={[s.cardTipo, { color: tipoColor }]} numberOfLines={1}>{current.tipo}</Text>
                      <Text style={s.cardAluno} numberOfLines={1}>
                        {nomeCompleto}
                        {current.nomeTurma ? ` · ${current.nomeTurma}` : ''}
                        {current.classeAluno ? ` (${current.classeAluno}ª Classe)` : ''}
                      </Text>
                      <View style={s.cardMeta}>
                        {current.alunoNumMatricula ? (
                          <View style={s.metaChip}>
                            <Ionicons name="card-outline" size={12} color={Colors.gold} />
                            <Text style={s.cardMatricula}>Nº {current.alunoNumMatricula}</Text>
                          </View>
                        ) : null}
                        <View style={[s.statusBadge, {
                          backgroundColor: current.status === 'em_processamento' ? Colors.info + '20' : Colors.warning + '20',
                          borderColor: current.status === 'em_processamento' ? Colors.info + '50' : Colors.warning + '50',
                        }]}>
                          <Text style={[s.statusText, { color: current.status === 'em_processamento' ? Colors.info : Colors.warning }]}>
                            {current.status === 'em_processamento' ? 'Em Processamento' : 'Pendente'}
                          </Text>
                        </View>
                        <View style={s.metaChip}>
                          <Ionicons name="calendar-outline" size={12} color={Colors.textMuted} />
                          <Text style={s.dateText}>{formatDate(current.createdAt)}</Text>
                        </View>
                      </View>
                    </View>
                  </View>

                  {current.motivo ? (
                    <View style={s.motivoWrap}>
                      <Text style={s.motivoLabel}>Finalidade</Text>
                      <View style={s.motivoBox}>
                        <Ionicons name="chatbubble-ellipses-outline" size={15} color={Colors.textMuted} />
                        <Text style={s.motivo} numberOfLines={3}>{current.motivo}</Text>
                      </View>
                    </View>
                  ) : null}

                  {/* TRIMESTRE PICKER — only for Certificado de Notas */}
                  {needsTrimestre && gerarState === 'idle' && (
                    <View style={s.trimestreSection}>
                      <Text style={s.trimestreLabel}>
                        <Ionicons name="layers-outline" size={11} color={Colors.textMuted} />
                        {'  '}Trimestre do boletim
                      </Text>
                      <View style={s.trimestreRow}>
                        {TRIMESTRES.map(t => (
                          <TouchableOpacity
                            key={t}
                            style={[
                              s.trimestreBtn,
                              selectedTrimestre === t && { backgroundColor: tipoColor, borderColor: tipoColor },
                            ]}
                            onPress={() => setSelectedTrimestre(t)}
                            activeOpacity={0.8}
                          >
                            <Text style={[
                              s.trimestreBtnText,
                              selectedTrimestre === t && { color: '#fff', fontFamily: 'Inter_700Bold' },
                            ]}>
                              {t}º Trimestre
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>
                  )}
                </View>
              )}

              {/* GENERATION PROGRESS */}
              {gerarState === 'loading' && (
                <View style={s.gerarProgress}>
                  {GERAR_STEPS.map((step, i) => {
                    const done = i < gerarStep;
                    const active = i === gerarStep;
                    return (
                      <View key={i} style={s.gerarStep}>
                        <View style={[
                          s.gerarStepIcon,
                          done && { backgroundColor: Colors.success + '25', borderColor: Colors.success + '50' },
                          active && { backgroundColor: tipoColor + '25', borderColor: tipoColor + '60' },
                          !done && !active && { opacity: 0.3 },
                        ]}>
                          {done
                            ? <Ionicons name="checkmark" size={14} color={Colors.success} />
                            : active
                              ? <AppLoader size="small" color={tipoColor} />
                              : <Ionicons name={step.icon} size={14} color={Colors.textMuted} />
                          }
                        </View>
                        <Text style={[
                          s.gerarStepLabel,
                          done && { color: Colors.success },
                          active && { color: Colors.text },
                          !done && !active && { opacity: 0.35 },
                        ]}>
                          {step.label}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              )}

              {/* SUCCESS STATE */}
              {gerarState === 'success' && (
                <View style={s.gerarSuccess}>
                  <View style={[s.gerarSuccessIcon, { borderColor: Colors.success + '50', backgroundColor: Colors.success + '15' }]}>
                    <Ionicons name="print-outline" size={22} color={Colors.success} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.gerarSuccessTitle}>Documento aberto!</Text>
                    <Text style={s.gerarSuccessSub}>O diálogo de impressão foi activado no novo separador.</Text>
                  </View>
                </View>
              )}

              {/* ERROR STATE */}
              {gerarState === 'error' && (
                <View style={[s.gerarSuccess, { backgroundColor: Colors.danger + '12', borderColor: Colors.danger + '30' }]}>
                  <View style={[s.gerarSuccessIcon, { borderColor: Colors.danger + '50', backgroundColor: Colors.danger + '15' }]}>
                    <Ionicons name="alert-circle-outline" size={22} color={Colors.danger} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.gerarSuccessTitle, { color: Colors.danger }]}>Erro ao gerar</Text>
                    <Text style={s.gerarSuccessSub}>Verifica a ligação e tenta novamente.</Text>
                  </View>
                </View>
              )}

              {/* ACTIONS */}
              {current && gerarState === 'idle' && (
                <View style={s.actions}>
                  {tipoTemplateInfo ? (
                    /* Template-based: open editor-documentos with template pre-selected */
                    <TouchableOpacity
                      style={[s.btnGerar, { backgroundColor: tipoColor }]}
                      onPress={async () => {
                        try {
                          await apiRequest('PUT', `/api/solicitacoes-documentos/${current.id}`, { status: 'em_processamento' });
                          onUpdate({ ...current, status: 'em_processamento' });
                        } catch { /* silent */ }
                        onClose();
                        router.push({
                          pathname: '/(main)/editor-documentos' as any,
                          params: {
                            templateId: tipoTemplateInfo.id,
                            alunoId: current.alunoId,
                            solicitacaoId: current.id,
                          },
                        });
                      }}
                      activeOpacity={0.85}
                    >
                      <Ionicons name="document-text" size={15} color="#fff" />
                      <Text style={s.btnGerarText}>Emitir via Modelo</Text>
                    </TouchableOpacity>
                  ) : (
                    /* Standard PDF type: use hardcoded builder */
                    <TouchableOpacity
                      style={[s.btnGerar, { backgroundColor: tipoColor }]}
                      onPress={() => gerarDocumento(current)}
                      activeOpacity={0.85}
                      disabled={loadingAction !== null}
                    >
                      <Ionicons name="print" size={15} color="#fff" />
                      <Text style={s.btnGerarText}>Gerar & Imprimir</Text>
                    </TouchableOpacity>
                  )}

                  <TouchableOpacity
                    style={s.btnConcluido}
                    onPress={() => marcarConcluido(current)}
                    activeOpacity={0.85}
                    disabled={loadingAction !== null}
                  >
                    {loadingAction === 'concluido'
                      ? <AppLoader size="small" color={Colors.success} />
                      : <>
                          <Ionicons name="checkmark-circle-outline" size={15} color={Colors.success} />
                          <Text style={s.btnConcluidoText}>Marcar Concluído</Text>
                        </>
                    }
                  </TouchableOpacity>
                </View>
              )}

              {/* FOOTER */}
              {gerarState === 'idle' && (
                <View style={s.footer}>
                  <TouchableOpacity style={s.btnAdiar} onPress={onAdiar} activeOpacity={0.8}>
                    <Ionicons name="time-outline" size={13} color={Colors.danger} />
                    <Text style={s.btnAdiarText}>Adiar — resolver mais tarde</Text>
                    {pendentes.length > 1 && currentIndex < pendentes.length - 1 && (
                      <TouchableOpacity onPress={saltarParaProximo} activeOpacity={0.8} style={s.saltarInline}>
                        <Text style={s.saltarInlineText}>Saltar</Text>
                        <Ionicons name="arrow-forward" size={12} color={Colors.textMuted} />
                      </TouchableOpacity>
                    )}
                  </TouchableOpacity>

                  <View style={s.lockWarning}>
                    <Ionicons name="alert-circle-outline" size={12} color={Colors.warning} />
                    <Text style={s.lockWarningText}>
                      {total - currentIndex} solicitaç{total - currentIndex !== 1 ? 'ões' : 'ão'} por resolver. Resolva todas ou adie para continuar.
                    </Text>
                  </View>
                </View>
              )}
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(2,8,18,0.76)',
    justifyContent: 'flex-end',
  },
  overlayWide: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  container: {
    backgroundColor: '#112B48',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: Platform.OS === 'ios' ? 28 : 16,
    borderTopWidth: 2,
    borderTopColor: Colors.gold,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -12 },
    shadowOpacity: 0.45,
    shadowRadius: 28,
    elevation: 24,
  },
  containerWide: {
    width: '100%',
    maxWidth: 760,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: Colors.gold + '35',
    borderTopWidth: 3,
    overflow: 'hidden',
  },

  /* Header */
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gold + '18',
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  iconBadge: {
    width: 46, height: 46, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.gold + '28',
  },
  title: { fontSize: 18, fontFamily: 'Inter_700Bold', color: Colors.text },
  subtitle: { fontSize: 12, color: Colors.textMuted, marginTop: 3, fontFamily: 'Inter_400Regular' },
  lockBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: Colors.warning + '15',
    paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 20, borderWidth: 1, borderColor: Colors.warning + '35',
  },
  lockText: { fontSize: 10, fontFamily: 'Inter_700Bold', color: Colors.warning },

  /* Progress */
  progressWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 16, paddingVertical: 12,
  },
  progressTrack: {
    flex: 1, height: 6, borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.08)', overflow: 'hidden',
  },
  progressFill: { height: '100%', borderRadius: 2 },
  progressText: { fontSize: 10, fontFamily: 'Inter_700Bold', color: Colors.textSecondary, minWidth: 24, textAlign: 'right' },

  /* Card */
  card: {
    marginHorizontal: 16,
    backgroundColor: '#0B1D32',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.gold + '25',
    gap: 13,
    overflow: 'hidden',
  },
  cardAccent: {
    position: 'absolute',
    left: 0, top: 0, bottom: 0,
    width: 4,
  },
  cardTop: { flexDirection: 'row', gap: 14, alignItems: 'flex-start' },
  tipoIconWrap: {
    width: 58, height: 58, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
    borderWidth: 1,
  },
  cardInfo: { flex: 1, gap: 4 },
  cardTipo: { fontSize: 17, fontFamily: 'Inter_700Bold' },
  cardAluno: { fontSize: 13, color: Colors.textSecondary, fontFamily: 'Inter_500Medium' },
  cardMeta: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 5, flexWrap: 'wrap' },
  metaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: 'rgba(255,255,255,0.035)',
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  cardMatricula: { fontSize: 11, color: Colors.gold, fontFamily: 'Inter_600SemiBold' },
  statusBadge: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 9, paddingVertical: 4,
    borderRadius: 20, borderWidth: 1,
  },
  statusText: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  dateText: { fontSize: 11, color: Colors.textMuted, fontFamily: 'Inter_400Regular' },
  motivoWrap: { gap: 6 },
  motivoLabel: {
    fontSize: 10,
    color: Colors.textMuted,
    fontFamily: 'Inter_700Bold',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  motivoBox: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.035)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 11,
    paddingVertical: 10,
  },
  motivo: { flex: 1, fontSize: 12, color: Colors.textSecondary, lineHeight: 17, fontFamily: 'Inter_400Regular' },

  /* Trimestre picker */
  trimestreSection: { gap: 8, paddingTop: 2 },
  trimestreLabel: {
    fontSize: 10,
    color: Colors.textMuted,
    fontFamily: 'Inter_700Bold',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  trimestreRow: { flexDirection: 'row', gap: 8 },
  trimestreBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: Colors.border,
    backgroundColor: 'rgba(255,255,255,0.04)',
    alignItems: 'center',
  },
  trimestreBtnText: {
    fontSize: 12,
    fontFamily: 'Inter_500Medium',
    color: Colors.textSecondary,
  },

  /* Generation progress */
  gerarProgress: {
    marginHorizontal: 16,
    marginTop: 12,
    backgroundColor: '#0B1D32',
    borderRadius: 16,
    padding: 14,
    gap: 10,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  gerarStep: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  gerarStepIcon: {
    width: 28, height: 28, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  gerarStepLabel: {
    fontSize: 13,
    fontFamily: 'Inter_500Medium',
    color: Colors.textMuted,
    flex: 1,
  },

  /* Generation success / error */
  gerarSuccess: {
    marginHorizontal: 16,
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Colors.success + '12',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.success + '30',
  },
  gerarSuccessIcon: {
    width: 44, height: 44, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5,
    flexShrink: 0,
  },
  gerarSuccessTitle: {
    fontSize: 14, fontFamily: 'Inter_700Bold', color: Colors.success, marginBottom: 2,
  },
  gerarSuccessSub: {
    fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted, lineHeight: 16,
  },

  /* Actions */
  actions: {
    flexDirection: 'row', gap: 8,
    paddingHorizontal: 16, marginTop: 12,
  },
  btnGerar: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 7, paddingVertical: 14, borderRadius: 12,
  },
  btnGerarText: { color: '#fff', fontSize: 13, fontFamily: 'Inter_700Bold' },
  btnConcluido: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 7, paddingVertical: 14, borderRadius: 12,
    borderWidth: 1.5, borderColor: Colors.success,
    backgroundColor: Colors.success + '10',
  },
  btnConcluidoText: { color: Colors.success, fontSize: 13, fontFamily: 'Inter_700Bold' },

  /* Footer */
  footer: {
    paddingHorizontal: 16, paddingTop: 10, gap: 8,
  },
  btnAdiar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
    paddingVertical: 7, borderRadius: 8,
  },
  btnAdiarText: { fontSize: 12, color: Colors.danger, fontFamily: 'Inter_500Medium' },
  saltarInline: {
    flexDirection: 'row', alignItems: 'center', gap: 2,
    marginLeft: 8, paddingHorizontal: 6, paddingVertical: 2,
    borderRadius: 6, borderWidth: 1, borderColor: Colors.border,
  },
  saltarInlineText: { fontSize: 11, color: Colors.textMuted, fontFamily: 'Inter_500Medium' },
  lockWarning: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: Colors.warning + '0D',
    borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7,
    borderWidth: 1, borderColor: Colors.warning + '25',
  },
  lockWarningText: {
    flex: 1, fontSize: 10, color: Colors.warning,
    fontFamily: 'Inter_400Regular', lineHeight: 14,
  },

  /* Success */
  successWrap: {
    alignItems: 'center', paddingVertical: 28, paddingHorizontal: 24, gap: 8,
  },
  successIconWrap: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: Colors.success + '18',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: Colors.success + '40',
  },
  successTitle: { fontSize: 16, fontFamily: 'Inter_700Bold', color: Colors.text, textAlign: 'center' },
  successSub: { fontSize: 12, color: Colors.textMuted, textAlign: 'center', fontFamily: 'Inter_400Regular' },
  btnFecharSuccess: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: Colors.success, paddingHorizontal: 22,
    paddingVertical: 10, borderRadius: 10, marginTop: 6,
  },
  btnFecharSuccessText: { color: '#fff', fontSize: 13, fontFamily: 'Inter_700Bold' },
});
