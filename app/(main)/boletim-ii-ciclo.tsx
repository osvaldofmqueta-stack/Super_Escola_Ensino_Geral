import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, Modal,
  TextInput, ActivityIndicator, Alert, Platform, KeyboardAvoidingView,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import TopBar from '@/components/TopBar';
import { Colors } from '@/constants/colors';
import { api } from '@/lib/api';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface DisciplinaNotas {
  numero: number;
  nome: string;
  t1: { mac: string; npt: string; mt: string };
  t2: { mac: string; npt: string; mt: string };
  t3: { mac: string; npt: string; mt: string };
  obs: string;
}

interface BoletimForm {
  nomeEscola: string;
  cabecalhoLinha1: string;
  cabecalhoLinha2: string;
  cabecalhoLinha3: string;
  areaFormacao: string;
  classe: string;
  turma: string;
  anoLetivo: string;
  nomeAluno: string;
  numero: string;
  processo: string;
  telefone: string;
  municipio: string;
  dia: string;
  mes: string;
  ano: string;
  subdirectorPedagogico: string;
  disciplinas: DisciplinaNotas[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function fmtNota(v: any): string {
  const n = Number(v);
  if (!v || isNaN(n) || n === 0) return '';
  return n % 1 === 0 ? String(n) : n.toFixed(1);
}

function notaColor(v: string): string {
  const n = Number(v);
  if (!v || isNaN(n)) return '#333';
  if (n >= 14) return '#15803d';
  if (n >= 10) return '#1e40af';
  return '#b91c1c';
}

function buildDisciplinas(
  disciplinasDB: any[],
  notasDB: any[],
): DisciplinaNotas[] {
  const nomes: string[] = disciplinasDB.length > 0
    ? disciplinasDB.map((d: any) => String(d.nome))
    : Array.from(new Set(notasDB.map((n: any) => String(n.disciplina))));

  return nomes.map((nome, idx) => {
    const get = (t: number) =>
      notasDB.find(
        (n: any) =>
          String(n.disciplina) === nome && Number(n.trimestre) === t,
      );
    const t1 = get(1);
    const t2 = get(2);
    const t3 = get(3);
    return {
      numero: idx + 1,
      nome,
      t1: {
        mac: fmtNota(t1?.mac),
        npt: fmtNota(t1?.pp1),
        mt: fmtNota(t1?.mt1),
      },
      t2: {
        mac: fmtNota(t2?.mac),
        npt: fmtNota(t2?.pp1),
        mt: fmtNota(t2?.mt1),
      },
      t3: {
        mac: fmtNota(t3?.mac),
        npt: fmtNota(t3?.pp1),
        mt: fmtNota(t3?.mt1),
      },
      obs: '',
    };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Screen
// ─────────────────────────────────────────────────────────────────────────────

export default function BoletimIICicloScreen() {
  const { alunoId } = useLocalSearchParams<{ alunoId: string }>();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<BoletimForm | null>(null);
  const [editModal, setEditModal] = useState(false);
  const [draftForm, setDraftForm] = useState<BoletimForm | null>(null);
  const [editDiscIdx, setEditDiscIdx] = useState<number | null>(null);
  const [printing, setPrinting] = useState(false);
  const [error, setError] = useState('');

  const carregarDados = useCallback(async () => {
    if (!alunoId) { setError('alunoId em falta.'); setLoading(false); return; }
    setLoading(true);
    setError('');
    try {
      const data: any = await api.get(`/api/boletins-ii-ciclo/dados/${alunoId}`);
      const { aluno, notas, config, disciplinas } = data;

      const hoje = new Date();
      const disc = buildDisciplinas(disciplinas || [], notas || []);

      setForm({
        nomeEscola: String(config?.nomeEscola || ''),
        cabecalhoLinha1: String(config?.cabecalhoLinha1 || 'REPÚBLICA DE ANGOLA'),
        cabecalhoLinha2: String(config?.cabecalhoLinha2 || ''),
        cabecalhoLinha3: String(config?.cabecalhoLinha3 || ''),
        areaFormacao: String(aluno?.curso_area_formacao || config?.cabecalhoLinha4 || ''),
        classe: String(aluno?.turma_classe || ''),
        turma: String(aluno?.turma_nome || ''),
        anoLetivo: String(aluno?.turma_ano_letivo || ''),
        nomeAluno: `${aluno?.nome || ''} ${aluno?.apelido || ''}`.trim(),
        numero: String(aluno?.numeroMatricula || ''),
        processo: String(aluno?.numeroMatricula || ''),
        telefone:
          String(aluno?.utilizador_telefone || aluno?.telefoneEncarregado || ''),
        municipio: String(config?.municipioEscola || ''),
        dia: String(hoje.getDate()).padStart(2, '0'),
        mes: String(hoje.getMonth() + 1).padStart(2, '0'),
        ano: String(hoje.getFullYear()),
        subdirectorPedagogico: String(config?.directorPedagogico || ''),
        disciplinas: disc,
      });
    } catch (e: any) {
      setError(e.message || 'Erro ao carregar dados.');
    } finally {
      setLoading(false);
    }
  }, [alunoId]);

  useEffect(() => { carregarDados(); }, [carregarDados]);

  function abrirEdicao() {
    if (!form) return;
    setDraftForm(JSON.parse(JSON.stringify(form)));
    setEditDiscIdx(null);
    setEditModal(true);
  }

  function salvarEdicao() {
    if (!draftForm) return;
    setForm(JSON.parse(JSON.stringify(draftForm)));
    setEditModal(false);
  }

  async function imprimir() {
    if (!form) return;
    setPrinting(true);
    try {
      const token = typeof window !== 'undefined'
        ? localStorage.getItem('token') || ''
        : '';

      const resp = await fetch('/api/boletins-ii-ciclo/html', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(form),
      });

      if (!resp.ok) throw new Error(await resp.text());
      const html = await resp.text();

      if (Platform.OS === 'web') {
        const blob = new Blob([html], { type: 'text/html; charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const win = window.open(url, '_blank');
        if (!win) Alert.alert('Aviso', 'Permita pop-ups no browser para abrir o boletim.');
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
      } else {
        Alert.alert('Impressão', 'Disponível apenas na versão web.');
      }
    } catch (e: any) {
      Alert.alert('Erro', e.message || 'Erro ao gerar boletim.');
    } finally {
      setPrinting(false);
    }
  }

  // ──────────────────────────────────────────────────────────────────
  // RENDER: estados intermédios
  // ──────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={styles.bg}>
        <TopBar title="Boletim — II Ciclo" />
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingTxt}>A carregar dados do aluno…</Text>
        </View>
      </View>
    );
  }

  if (error || !form) {
    return (
      <View style={styles.bg}>
        <TopBar title="Boletim — II Ciclo" />
        <View style={styles.center}>
          <Ionicons name="alert-circle" size={48} color={Colors.danger} />
          <Text style={styles.errorTxt}>{error || 'Dados indisponíveis.'}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={carregarDados}>
            <Text style={styles.retryTxt}>Tentar novamente</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ──────────────────────────────────────────────────────────────────
  // RENDER: documento principal
  // ──────────────────────────────────────────────────────────────────

  return (
    <View style={styles.bg}>
      <TopBar title="Boletim de Notas — II Ciclo" />

      {/* Barra de acções */}
      <View style={styles.actionBar}>
        <TouchableOpacity style={styles.editBtn} onPress={abrirEdicao}>
          <Ionicons name="create-outline" size={18} color="#fff" />
          <Text style={styles.btnTxt}>Editar</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.printBtn, printing && styles.btnDisabled]}
          onPress={imprimir}
          disabled={printing}
        >
          {printing
            ? <ActivityIndicator size="small" color="#fff" />
            : <Ionicons name="print-outline" size={18} color="#fff" />}
          <Text style={styles.btnTxt}>{printing ? 'A gerar…' : 'Imprimir / Exportar'}</Text>
        </TouchableOpacity>
      </View>

      {/* Preview do documento */}
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.doc}>

          {/* ── Cabeçalho institucional ── */}
          <View style={styles.header}>
            <Text style={styles.headerLine}>{form.cabecalhoLinha1}</Text>
            {!!form.cabecalhoLinha2 && <Text style={styles.headerLine}>{form.cabecalhoLinha2}</Text>}
            {!!form.cabecalhoLinha3 && <Text style={styles.headerLine}>{form.cabecalhoLinha3}</Text>}
            <Text style={styles.headerEscola}>{form.nomeEscola}</Text>
          </View>

          {/* ── AO Pai/Encarregado ── */}
          <View style={styles.aoBlock}>
            <Text style={styles.aoTxt}>AO</Text>
            <Text style={styles.aoTxt}>Pai/Encarregado de</Text>
            <Text style={styles.aoTxt}>Educação</Text>
          </View>

          {/* ── Área de Formação ── */}
          {!!form.areaFormacao && (
            <View style={styles.areaBlock}>
              <Text style={styles.areaTxt}>{form.areaFormacao}</Text>
            </View>
          )}

          {/* ── Linha: Classe / Turma / Ano Lectivo ── */}
          <View style={styles.classeRow}>
            <Text style={styles.classeItem}>
              <Text style={styles.classeLabel}>{form.classe} CLASSE,</Text>
            </Text>
            <Text style={styles.classeItem}>
              {'  '}<Text style={styles.classeLabel}>TURMA: </Text>
              <Text style={styles.classeValSub}>{form.turma},</Text>
            </Text>
            <Text style={styles.classeItem}>
              {'  '}<Text style={styles.classeLabel}>ANO LECTIVO: </Text>
              <Text style={styles.classeValSub}>{form.anoLetivo}</Text>
            </Text>
          </View>

          {/* ── Linha: Nome / Número / Processo / Tel ── */}
          <View style={styles.nomeRow}>
            <Text style={styles.nomeLabel}>Nome: </Text>
            <View style={styles.nomeUnderline}><Text style={styles.nomeVal}>{form.nomeAluno}</Text></View>
            <Text style={styles.nomeLabel}>  número </Text>
            <View style={styles.numUnderline}><Text style={styles.nomeVal}>{form.numero}</Text></View>
            <Text style={styles.nomeLabel}> Processo </Text>
            <View style={styles.numUnderline}><Text style={styles.nomeVal}>{form.processo}</Text></View>
          </View>
          <View style={[styles.nomeRow, { marginTop: 4 }]}>
            <Text style={styles.nomeLabel}>Tel: </Text>
            <View style={[styles.nomeUnderline, { minWidth: 140 }]}>
              <Text style={[styles.nomeVal, { color: '#1e40af' }]}>{form.telefone}</Text>
            </View>
          </View>

          {/* ── Tabela de Notas ── */}
          <ScrollView horizontal showsHorizontalScrollIndicator style={styles.tableScroll}>
            <View style={styles.table}>

              {/* Linha 1 de cabeçalho (trimestres) */}
              <View style={[styles.tr, styles.thRow]}>
                <View style={[styles.th, styles.colNr, { height: 48 }]}><Text style={styles.thTxt}>Nº</Text></View>
                <View style={[styles.th, styles.colDisc, { height: 48 }]}><Text style={styles.thTxt}>Disciplinas</Text></View>
                <View style={[styles.thGroup, { width: 168 }]}>
                  <Text style={[styles.thTxt, { textAlign: 'center', padding: 4, borderBottomWidth: 1, borderBottomColor: '#000' }]}>
                    NOTAS DO Iº TRIMESTRE
                  </Text>
                  <View style={styles.thSubRow}>
                    <View style={[styles.th, styles.colMac]}><Text style={styles.thTxt}>MAC</Text></View>
                    <View style={[styles.th, styles.colNpt]}><Text style={styles.thTxt}>NPT</Text></View>
                    <View style={[styles.th, styles.colMt]}><Text style={styles.thTxt}>MT₁</Text></View>
                  </View>
                </View>
                <View style={[styles.thGroup, { width: 168 }]}>
                  <Text style={[styles.thTxt, { textAlign: 'center', padding: 4, borderBottomWidth: 1, borderBottomColor: '#000' }]}>
                    NOTAS DO IIº TRIMESTRE
                  </Text>
                  <View style={styles.thSubRow}>
                    <View style={[styles.th, styles.colMac]}><Text style={styles.thTxt}>MAC</Text></View>
                    <View style={[styles.th, styles.colNpt]}><Text style={styles.thTxt}>NPT</Text></View>
                    <View style={[styles.th, styles.colMt]}><Text style={styles.thTxt}>MT₂</Text></View>
                  </View>
                </View>
                <View style={[styles.thGroup, { width: 168 }]}>
                  <Text style={[styles.thTxt, { textAlign: 'center', padding: 4, borderBottomWidth: 1, borderBottomColor: '#000' }]}>
                    NOTAS DO IIIº TRIMESTRE
                  </Text>
                  <View style={styles.thSubRow}>
                    <View style={[styles.th, styles.colMac]}><Text style={styles.thTxt}>MAC</Text></View>
                    <View style={[styles.th, styles.colNpt]}><Text style={styles.thTxt}>NPT</Text></View>
                    <View style={[styles.th, styles.colMt]}><Text style={styles.thTxt}>MT₃</Text></View>
                  </View>
                </View>
                <View style={[styles.th, styles.colObs, { height: 48 }]}><Text style={styles.thTxt}>Obs.</Text></View>
              </View>

              {/* Linhas de dados */}
              {form.disciplinas.length === 0 ? (
                <View style={styles.tr}>
                  <View style={{ flex: 1, padding: 12, alignItems: 'center' }}>
                    <Text style={{ fontStyle: 'italic', color: '#888' }}>Sem disciplinas registadas nesta turma.</Text>
                  </View>
                </View>
              ) : (
                form.disciplinas.map((disc, idx) => (
                  <TouchableOpacity
                    key={idx}
                    style={[styles.tr, idx % 2 === 1 && styles.trAlt]}
                    onPress={() => { setEditDiscIdx(idx); setDraftForm(JSON.parse(JSON.stringify(form))); setEditModal(true); }}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.td, styles.colNr]}>
                      <Text style={styles.tdNr}>{idx + 1}</Text>
                    </View>
                    <View style={[styles.td, styles.colDisc]}>
                      <Text style={styles.tdDisc} numberOfLines={2}>{disc.nome}</Text>
                    </View>
                    {/* T1 */}
                    <NCell v={disc.t1.mac} />
                    <NCell v={disc.t1.npt} />
                    <NCell v={disc.t1.mt} bold />
                    {/* T2 */}
                    <NCell v={disc.t2.mac} />
                    <NCell v={disc.t2.npt} />
                    <NCell v={disc.t2.mt} bold />
                    {/* T3 */}
                    <NCell v={disc.t3.mac} />
                    <NCell v={disc.t3.npt} />
                    <NCell v={disc.t3.mt} bold />
                    {/* Obs */}
                    <View style={[styles.td, styles.colObs]}>
                      <Text style={styles.tdObs}>{disc.obs}</Text>
                    </View>
                  </TouchableOpacity>
                ))
              )}
            </View>
          </ScrollView>

          {/* ── Rodapé ── */}
          <View style={styles.footer}>
            <Text style={styles.footerEscola}>{form.nomeEscola}</Text>
            <Text style={styles.footerData}>
              {form.municipio}, {form.dia} / {form.mes} / {form.ano}.-
            </Text>
            <View style={styles.assinatura}>
              <Text style={styles.assinaturaTitulo}>O Subdirector Pedagógico</Text>
              <Text style={styles.assinaturaNome}>{form.subdirectorPedagogico}</Text>
            </View>
          </View>

        </View>
      </ScrollView>

      {/* ──────────── MODAL DE EDIÇÃO ──────────── */}
      <Modal visible={editModal} animationType="slide" onRequestClose={() => setEditModal(false)}>
        <KeyboardAvoidingView
          style={{ flex: 1, backgroundColor: '#f1f5f9' }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setEditModal(false)}>
              <Ionicons name="close" size={24} color="#fff" />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>
              {editDiscIdx !== null ? `Editar Notas — ${draftForm?.disciplinas[editDiscIdx]?.nome || ''}` : 'Editar Campos do Boletim'}
            </Text>
            <TouchableOpacity onPress={salvarEdicao}>
              <Text style={styles.salvarTxt}>Guardar</Text>
            </TouchableOpacity>
          </View>

          {draftForm && (
            <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>

              {editDiscIdx !== null ? (
                /* ── Edição de notas de uma disciplina ── */
                <EditDiscForm
                  disc={draftForm.disciplinas[editDiscIdx]}
                  onChange={(updated) => {
                    const copy = JSON.parse(JSON.stringify(draftForm));
                    copy.disciplinas[editDiscIdx] = updated;
                    setDraftForm(copy);
                  }}
                />
              ) : (
                /* ── Edição de campos gerais ── */
                <>
                  <EditSection title="Cabeçalho Institucional">
                    <EditField label="Linha 1" value={draftForm.cabecalhoLinha1} onChange={(v) => setDraftForm({ ...draftForm, cabecalhoLinha1: v })} />
                    <EditField label="Linha 2" value={draftForm.cabecalhoLinha2} onChange={(v) => setDraftForm({ ...draftForm, cabecalhoLinha2: v })} />
                    <EditField label="Linha 3" value={draftForm.cabecalhoLinha3} onChange={(v) => setDraftForm({ ...draftForm, cabecalhoLinha3: v })} />
                    <EditField label="Nome da Escola" value={draftForm.nomeEscola} onChange={(v) => setDraftForm({ ...draftForm, nomeEscola: v })} />
                  </EditSection>

                  <EditSection title="Área e Turma">
                    <EditField label="Área de Formação" value={draftForm.areaFormacao} onChange={(v) => setDraftForm({ ...draftForm, areaFormacao: v })} />
                    <EditField label="Classe" value={draftForm.classe} onChange={(v) => setDraftForm({ ...draftForm, classe: v })} />
                    <EditField label="Turma" value={draftForm.turma} onChange={(v) => setDraftForm({ ...draftForm, turma: v })} />
                    <EditField label="Ano Lectivo" value={draftForm.anoLetivo} onChange={(v) => setDraftForm({ ...draftForm, anoLetivo: v })} />
                  </EditSection>

                  <EditSection title="Dados do Aluno">
                    <EditField label="Nome completo" value={draftForm.nomeAluno} onChange={(v) => setDraftForm({ ...draftForm, nomeAluno: v })} />
                    <EditField label="Número" value={draftForm.numero} onChange={(v) => setDraftForm({ ...draftForm, numero: v })} />
                    <EditField label="Processo" value={draftForm.processo} onChange={(v) => setDraftForm({ ...draftForm, processo: v })} />
                    <EditField label="Telefone" value={draftForm.telefone} onChange={(v) => setDraftForm({ ...draftForm, telefone: v })} keyboardType="phone-pad" />
                  </EditSection>

                  <EditSection title="Rodapé">
                    <EditField label="Município" value={draftForm.municipio} onChange={(v) => setDraftForm({ ...draftForm, municipio: v })} />
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <View style={{ flex: 1 }}>
                        <EditField label="Dia" value={draftForm.dia} onChange={(v) => setDraftForm({ ...draftForm, dia: v })} keyboardType="numeric" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <EditField label="Mês" value={draftForm.mes} onChange={(v) => setDraftForm({ ...draftForm, mes: v })} keyboardType="numeric" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <EditField label="Ano" value={draftForm.ano} onChange={(v) => setDraftForm({ ...draftForm, ano: v })} keyboardType="numeric" />
                      </View>
                    </View>
                    <EditField label="Subdirector Pedagógico" value={draftForm.subdirectorPedagogico} onChange={(v) => setDraftForm({ ...draftForm, subdirectorPedagogico: v })} />
                  </EditSection>

                  <EditSection title="Notas por Disciplina">
                    <Text style={{ fontSize: 13, color: '#475569', marginBottom: 6 }}>
                      Toque numa linha da tabela para editar as notas dessa disciplina.
                    </Text>
                    {draftForm.disciplinas.map((d, i) => (
                      <TouchableOpacity
                        key={i}
                        style={styles.discListItem}
                        onPress={() => setEditDiscIdx(i)}
                      >
                        <Text style={styles.discListNome}>{i + 1}. {d.nome}</Text>
                        <Text style={styles.discListNotas}>
                          T1: {d.t1.mt || '—'} | T2: {d.t2.mt || '—'} | T3: {d.t3.mt || '—'}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </EditSection>
                </>
              )}
            </ScrollView>
          )}
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-componentes
// ─────────────────────────────────────────────────────────────────────────────

function NCell({ v, bold }: { v: string; bold?: boolean }) {
  const empty = !v || v === '0';
  return (
    <View style={[styles.td, styles.colMac]}>
      <Text style={[
        styles.tdN,
        bold && styles.tdNBold,
        !empty && { color: notaColor(v) },
        empty && { color: '#ccc' },
      ]}>
        {empty ? '' : v}
      </Text>
    </View>
  );
}

function EditSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.editSection}>
      <Text style={styles.editSectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function EditField({
  label, value, onChange, keyboardType, multiline,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  keyboardType?: any;
  multiline?: boolean;
}) {
  return (
    <View style={styles.editField}>
      <Text style={styles.editLabel}>{label}</Text>
      <TextInput
        style={[styles.editInput, multiline && { minHeight: 72, textAlignVertical: 'top' }]}
        value={value}
        onChangeText={onChange}
        keyboardType={keyboardType || 'default'}
        multiline={multiline}
        placeholder={`${label}…`}
        placeholderTextColor="#94a3b8"
      />
    </View>
  );
}

function EditDiscForm({
  disc,
  onChange,
}: {
  disc: DisciplinaNotas;
  onChange: (d: DisciplinaNotas) => void;
}) {
  const upd = (key: string, sub: string, v: string) => {
    const copy = JSON.parse(JSON.stringify(disc));
    (copy as any)[key][sub] = v;
    onChange(copy);
  };

  const TrimSection = ({ label, tk }: { label: string; tk: 't1' | 't2' | 't3' }) => (
    <View style={{ marginBottom: 16 }}>
      <Text style={styles.editSectionTitle}>{label}</Text>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={{ flex: 1 }}>
          <EditField label="MAC" value={(disc as any)[tk].mac} onChange={(v) => upd(tk, 'mac', v)} keyboardType="decimal-pad" />
        </View>
        <View style={{ flex: 1 }}>
          <EditField label="NPT" value={(disc as any)[tk].npt} onChange={(v) => upd(tk, 'npt', v)} keyboardType="decimal-pad" />
        </View>
        <View style={{ flex: 1 }}>
          <EditField label="MT" value={(disc as any)[tk].mt} onChange={(v) => upd(tk, 'mt', v)} keyboardType="decimal-pad" />
        </View>
      </View>
    </View>
  );

  return (
    <>
      <TrimSection label="Iº Trimestre" tk="t1" />
      <TrimSection label="IIº Trimestre" tk="t2" />
      <TrimSection label="IIIº Trimestre" tk="t3" />
      <EditField label="Observações" value={disc.obs} onChange={(v) => onChange({ ...disc, obs: v })} />
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: '#e2e8f0' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  loadingTxt: { fontSize: 14, color: '#64748b', marginTop: 8 },
  errorTxt: { fontSize: 14, color: Colors.danger, textAlign: 'center', marginTop: 8 },
  retryBtn: { backgroundColor: Colors.primary, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8, marginTop: 8 },
  retryTxt: { color: '#fff', fontWeight: '600' },

  actionBar: {
    flexDirection: 'row',
    gap: 10,
    padding: 10,
    backgroundColor: '#f8fafc',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  editBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.primary,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 7,
  },
  printBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#16a34a',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 7,
  },
  btnDisabled: { opacity: 0.6 },
  btnTxt: { color: '#fff', fontWeight: '600', fontSize: 13 },

  scrollContent: { padding: 16, alignItems: 'center', paddingBottom: 40 },

  doc: {
    backgroundColor: '#fff',
    width: '100%',
    maxWidth: 800,
    padding: 32,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
    borderRadius: 2,
  },

  header: { alignItems: 'center', marginBottom: 16 },
  headerLine: { fontFamily: Platform.OS === 'web' ? 'Times New Roman' : 'serif', fontWeight: '700', fontSize: 13, textAlign: 'center', lineHeight: 20 },
  headerEscola: {
    fontFamily: Platform.OS === 'web' ? 'Times New Roman' : 'serif',
    fontWeight: '700',
    fontSize: 14,
    textAlign: 'center',
    textDecorationLine: 'underline',
    textTransform: 'uppercase',
    marginTop: 4,
  },

  aoBlock: { alignSelf: 'flex-end', marginRight: 40, marginBottom: 16 },
  aoTxt: { fontFamily: Platform.OS === 'web' ? 'Times New Roman' : 'serif', fontSize: 12 },

  areaBlock: { alignItems: 'center', marginBottom: 14 },
  areaTxt: {
    fontFamily: Platform.OS === 'web' ? 'Times New Roman' : 'serif',
    fontStyle: 'italic',
    fontWeight: '700',
    fontSize: 13,
    textDecorationLine: 'underline',
    textTransform: 'uppercase',
    textAlign: 'center',
  },

  classeRow: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 10, gap: 4 },
  classeItem: { fontFamily: Platform.OS === 'web' ? 'Times New Roman' : 'serif', fontSize: 12 },
  classeLabel: { fontWeight: '700', textDecorationLine: 'underline' },
  classeValSub: { fontWeight: '700', textDecorationLine: 'underline' },

  nomeRow: { flexDirection: 'row', alignItems: 'flex-end', flexWrap: 'wrap', gap: 2, marginBottom: 2 },
  nomeLabel: { fontFamily: Platform.OS === 'web' ? 'Times New Roman' : 'serif', fontStyle: 'italic', fontWeight: '700', fontSize: 12 },
  nomeUnderline: { borderBottomWidth: 1, borderBottomColor: '#000', minWidth: 200, paddingHorizontal: 4, paddingBottom: 1 },
  numUnderline: { borderBottomWidth: 1, borderBottomColor: '#000', minWidth: 60, paddingHorizontal: 4, paddingBottom: 1 },
  nomeVal: { fontFamily: Platform.OS === 'web' ? 'Times New Roman' : 'serif', fontSize: 12 },

  tableScroll: { marginTop: 12 },
  table: { borderWidth: 1, borderColor: '#000' },

  tr: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#000' },
  trAlt: { backgroundColor: '#f9f9f9' },
  thRow: { backgroundColor: '#e8e8e8' },

  th: { borderRightWidth: 1, borderRightColor: '#000', alignItems: 'center', justifyContent: 'center', padding: 4 },
  thGroup: { borderRightWidth: 1, borderRightColor: '#000' },
  thSubRow: { flexDirection: 'row' },
  thTxt: { fontSize: 9, fontWeight: '700', textAlign: 'center', fontFamily: Platform.OS === 'web' ? 'Times New Roman' : 'serif' },

  td: { borderRightWidth: 1, borderRightColor: '#000', alignItems: 'center', justifyContent: 'center', minHeight: 28, padding: 2 },
  tdNr: { fontSize: 10, textAlign: 'center', fontFamily: Platform.OS === 'web' ? 'Times New Roman' : 'serif' },
  tdDisc: { fontSize: 10, textAlign: 'left', paddingHorizontal: 4, fontFamily: Platform.OS === 'web' ? 'Times New Roman' : 'serif' },
  tdN: { fontSize: 10, textAlign: 'center', fontFamily: Platform.OS === 'web' ? 'Times New Roman' : 'serif' },
  tdNBold: { fontWeight: '700' },
  tdObs: { fontSize: 9, textAlign: 'center', fontFamily: Platform.OS === 'web' ? 'Times New Roman' : 'serif' },

  colNr: { width: 28 },
  colDisc: { width: 160 },
  colMac: { width: 40 },
  colNpt: { width: 40 },
  colMt: { width: 44 },
  colObs: { width: 48 },

  footer: { marginTop: 24 },
  footerEscola: { fontFamily: Platform.OS === 'web' ? 'Times New Roman' : 'serif', fontSize: 12, textAlign: 'center', marginBottom: 12 },
  footerData: { fontFamily: Platform.OS === 'web' ? 'Times New Roman' : 'serif', fontSize: 12, marginBottom: 24 },
  assinatura: { marginTop: 16 },
  assinaturaTitulo: { fontFamily: Platform.OS === 'web' ? 'Times New Roman' : 'serif', fontSize: 12 },
  assinaturaNome: { fontFamily: Platform.OS === 'web' ? 'Times New Roman' : 'serif', fontSize: 12, marginTop: 6 },

  // Modal
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingTop: Platform.OS === 'ios' ? 52 : 12,
  },
  modalTitle: { color: '#fff', fontWeight: '700', fontSize: 15, flex: 1, textAlign: 'center', marginHorizontal: 8 },
  salvarTxt: { color: '#fff', fontWeight: '700', fontSize: 15 },

  editSection: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 14,
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
    marginBottom: 4,
  },
  editSectionTitle: { fontWeight: '700', fontSize: 13, color: Colors.primary, marginBottom: 4 },
  editField: { gap: 3 },
  editLabel: { fontSize: 12, color: '#64748b', fontWeight: '600' },
  editInput: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    color: '#0f172a',
    backgroundColor: '#f8fafc',
  },

  discListItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    backgroundColor: '#f8fafc',
    borderRadius: 6,
    marginBottom: 4,
  },
  discListNome: { fontWeight: '600', fontSize: 13, color: '#0f172a', flex: 1 },
  discListNotas: { fontSize: 11, color: '#64748b' },
});
