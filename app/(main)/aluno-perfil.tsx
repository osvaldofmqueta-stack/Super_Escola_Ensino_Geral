import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View} from 'react-native';
import AppLoader from '@/components/AppLoader';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '@/constants/colors';
import { useData, Aluno } from '@/context/DataContext';
import { useConfig } from '@/context/ConfigContext';
import { useUsers } from '@/context/UsersContext';
import { useFinanceiro, formatAOA } from '@/context/FinanceiroContext';
import { useAnoAcademico } from '@/context/AnoAcademicoContext';
import { alertSucesso, alertErro } from '@/utils/toast';
import { webAlert } from '@/utils/webAlert';
import { api } from '@/lib/api';
import { getAuthToken, useAuth } from '@/context/AuthContext';
import DatePickerField from '@/components/DatePickerField';
import ProvinciaMunicipioSelector from '@/components/ProvinciaMunicipioSelector';
import { useEnterToSave } from '@/hooks/useEnterToSave';
import { useTabMemory } from '@/hooks/useTabMemory';
import QRCodeModal from '@/components/QRCodeModal';
import { openPdfInTab } from '@/utils/pdfAuth';

import { HScrollTabBar } from '@/components/HScrollTabBar';
import { calcMFD_auto } from '../../lib/formulasDecreto';
// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
function calcIdade(dataNascimento: string) {
  if (!dataNascimento) return '—';
  const diff = Date.now() - new Date(dataNascimento).getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24 * 365)) + ' anos';
}

function fmtData(d: string) {
  if (!d) return '—';
  try { return new Date(d).toLocaleDateString('pt-PT'); } catch { return d; }
}

function fmtValor(v: number) {
  return v?.toLocaleString('pt-AO', { minimumFractionDigits: 2 }) + ' Kz';
}

function gradeColor(n: number) {
  if (n >= 14) return Colors.success;
  if (n >= 10) return Colors.warning;
  return Colors.danger;
}

function normalizeEmail(str: string) {
  return str.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9\s]/g, '').trim().split(/\s+/).join('.');
}
function gerarSenha() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = 'Enc@';
  for (let i = 0; i < 5; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers — sort turmas by numeric class then alphabetically
// ─────────────────────────────────────────────────────────────────────────────
function sortTurmas(arr: any[]) {
  return [...arr].sort((a, b) => {
    const numA = parseInt((a.nome || a.classe || '').replace(/\D.*$/, ''), 10) || 0;
    const numB = parseInt((b.nome || b.classe || '').replace(/\D.*$/, ''), 10) || 0;
    if (numA !== numB) return numA - numB;
    return (a.nome || '').localeCompare(b.nome || '', 'pt');
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab labels
// ─────────────────────────────────────────────────────────────────────────────
const TABS = ['Perfil', 'Notas', 'Faltas', 'Financeiro', 'Anotações', 'Acessos', 'Histórico'] as const;
type Tab = typeof TABS[number];

// ─────────────────────────────────────────────────────────────────────────────
// Inline edit form — same fields as AlunoFormModal but built into the page
// ─────────────────────────────────────────────────────────────────────────────
function EditForm({ aluno, turmas, onSave, onCancel }: { aluno: Aluno; turmas: any[]; onSave: (f: Partial<Aluno>) => void; onCancel: () => void }) {
  const [form, setForm] = useState<Partial<Aluno>>({ ...aluno });
  const set = (k: keyof Aluno, v: any) => setForm(f => ({ ...f, [k]: v }));

  function handleSave() {
    if (!form.nome || !form.apelido || !form.turmaId) {
      webAlert('Campos obrigatórios', 'Preencha nome, apelido e turma.');
      return;
    }
    onSave(form);
  }

  useEnterToSave(handleSave, true);

  const insets = useSafeAreaInsets();

  return (
    <ScrollView style={ef.scroll} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}>
      <Text style={ef.section}>IDENTIFICAÇÃO DO ALUNO</Text>

      <Text style={ef.label}>Nº de Matrícula</Text>
      <TextInput style={ef.input} value={form.numeroMatricula ?? ''} onChangeText={v => set('numeroMatricula', v)} placeholder="Número de matrícula" placeholderTextColor={Colors.textMuted} />

      <Text style={ef.label}>Nome</Text>
      <TextInput style={ef.input} value={form.nome ?? ''} onChangeText={v => set('nome', v)} placeholder="Nome" placeholderTextColor={Colors.textMuted} />

      <Text style={ef.label}>Apelido</Text>
      <TextInput style={ef.input} value={form.apelido ?? ''} onChangeText={v => set('apelido', v)} placeholder="Apelido" placeholderTextColor={Colors.textMuted} />

      <DatePickerField label="Data de Nascimento" value={form.dataNascimento ?? ''} onChange={v => set('dataNascimento', v)} required style={{ marginBottom: 12 }} labelStyle={ef.label} />

      <ProvinciaMunicipioSelector
        provinciaValue={form.provincia ?? ''}
        municipioValue={form.municipio ?? ''}
        onProvinciaChange={v => { set('provincia', v); set('municipio', ''); }}
        onMunicipioChange={v => set('municipio', v)}
        labelStyle={ef.label}
        fieldStyle={{ marginBottom: 12 }}
      />

      <Text style={ef.label}>Género</Text>
      <View style={ef.toggleRow}>
        {(['M', 'F'] as const).map(g => (
          <TouchableOpacity key={g} style={[ef.toggleBtn, form.genero === g && ef.toggleActive]} onPress={() => set('genero', g)}>
            <Text style={[ef.toggleText, form.genero === g && ef.toggleTextActive]}>{g === 'M' ? 'Masculino' : 'Feminino'}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={[ef.section, { marginTop: 16 }]}>DADOS ACADÉMICOS</Text>

      <Text style={ef.label}>Turma</Text>
      <View style={ef.toggleRow}>
        {sortTurmas(turmas).map((t: any) => (
          <TouchableOpacity key={t.id} style={[ef.toggleBtn, form.turmaId === t.id && ef.toggleActive]} onPress={() => set('turmaId', t.id)}>
            <Text style={[ef.toggleText, form.turmaId === t.id && ef.toggleTextActive]}>{t.nome}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={[ef.section, { marginTop: 16 }]}>IDENTIFICAÇÃO OFICIAL</Text>

      {[
        { label: 'Nº do Bilhete de Identidade', key: 'numeroBi', caps: 'characters' as const },
        { label: 'Nº da Cédula', key: 'numeroCedula', caps: 'characters' as const },
        { label: 'Data de Emissão do BI', key: 'biDataEmissao', caps: 'none' as const, hint: 'ex: 03 de Janeiro de 2015' },
        { label: 'Arquivo de Emissão do BI', key: 'biLocalEmissao', caps: 'words' as const, hint: 'ex: Luanda' },
      ].map(f => (
        <View key={f.key}>
          <Text style={ef.label}>{f.label}</Text>
          {f.hint && <Text style={{ fontSize: 11, color: Colors.textMuted, marginBottom: 4 }}>{f.hint}</Text>}
          <TextInput
            style={ef.input}
            value={(form as any)[f.key] ?? ''}
            onChangeText={v => set(f.key as keyof Aluno, v)}
            placeholder={f.label}
            placeholderTextColor={Colors.textMuted}
            autoCapitalize={f.caps}
          />
        </View>
      ))}

      <Text style={[ef.section, { marginTop: 16 }]}>ENCARREGADO DE EDUCAÇÃO</Text>

      {[
        { label: 'Nome do Pai', key: 'nomePai' },
        { label: 'Nome da Mãe', key: 'nomeMae' },
        { label: 'Nome do Encarregado', key: 'nomeEncarregado' },
        { label: 'Telefone', key: 'telefoneEncarregado' },
        { label: 'Email (portal)', key: 'emailEncarregado' },
        { label: 'Profissão do Encarregado', key: 'encarregadoProfissao' },
        { label: 'Local de Trabalho', key: 'encarregadoLocalTrabalho' },
        { label: 'Residência', key: 'encarregadoResidencia' },
        { label: '2º Contacto', key: 'encarregadoContacto2' },
      ].map(f => (
        <View key={f.key}>
          <Text style={ef.label}>{f.label}</Text>
          <TextInput
            style={ef.input}
            value={(form as any)[f.key] ?? ''}
            onChangeText={v => set(f.key as keyof Aluno, v)}
            placeholder={f.label}
            placeholderTextColor={Colors.textMuted}
            keyboardType={f.key === 'emailEncarregado' ? 'email-address' : 'default'}
            autoCapitalize={f.key === 'emailEncarregado' ? 'none' : 'words'}
          />
        </View>
      ))}

      <Text style={[ef.section, { marginTop: 16 }]}>ESTADO E ACESSO</Text>

      {[
        { key: 'ativo', label: 'Aluno activo', desc: 'Mantém o aluno visível e operacional.' },
        { key: 'bloqueado', label: 'Bloqueado', desc: 'Bloqueia o acesso por pendência administrativa.' },
        { key: 'permitirAcessoComPendencia', label: 'Acesso com pendência', desc: 'Autoriza acesso mesmo com pendências.' },
        { key: 'publicarNotas', label: 'Publicar notas', desc: 'Permite disponibilizar as notas deste aluno.' },
      ].map(item => (
        <View key={item.key} style={ef.switchRow}>
          <View style={{ flex: 1 }}>
            <Text style={ef.switchLabel}>{item.label}</Text>
            <Text style={ef.switchDesc}>{item.desc}</Text>
          </View>
          <TouchableOpacity style={[ef.pill, (form as any)[item.key] && ef.pillOn]} onPress={() => set(item.key as keyof Aluno, !(form as any)[item.key])}>
            <Text style={[ef.pillText, (form as any)[item.key] && ef.pillTextOn]}>{(form as any)[item.key] ? 'Sim' : 'Não'}</Text>
          </TouchableOpacity>
        </View>
      ))}

      <Text style={[ef.section, { marginTop: 16 }]}>SITUAÇÃO ESPECIAL</Text>
      <View style={ef.switchRow}>
        <View style={{ flex: 1 }}>
          <Text style={ef.switchLabel}>Registar como falecido</Text>
          <Text style={ef.switchDesc}>Para histórico académico e bloqueio de operações futuras.</Text>
        </View>
        <TouchableOpacity style={[ef.pill, form.falecido && ef.pillOn]} onPress={() => set('falecido', !form.falecido)}>
          <Text style={[ef.pillText, form.falecido && ef.pillTextOn]}>{form.falecido ? 'Sim' : 'Não'}</Text>
        </TouchableOpacity>
      </View>
      {form.falecido && (
        <>
          <DatePickerField label="Data de Falecimento" value={form.dataFalecimento ?? ''} onChange={v => set('dataFalecimento', v)} style={{ marginBottom: 12 }} labelStyle={ef.label} />
          <Text style={ef.label}>Observações</Text>
          <TextInput style={[ef.input, { minHeight: 80, textAlignVertical: 'top' }]} value={form.observacoesFalecimento ?? ''} onChangeText={v => set('observacoesFalecimento', v)} placeholder="Notas internas sobre a situação" placeholderTextColor={Colors.textMuted} multiline />
        </>
      )}

      <View style={{ flexDirection: 'row', gap: 10, marginTop: 24 }}>
        <TouchableOpacity style={[ef.btn, { flex: 1, backgroundColor: Colors.surface }]} onPress={onCancel}>
          <Ionicons name="close" size={16} color={Colors.textSecondary} />
          <Text style={[ef.btnText, { color: Colors.textSecondary }]}>Cancelar</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[ef.btn, { flex: 2, backgroundColor: Colors.accent }]} onPress={handleSave}>
          <Ionicons name="checkmark" size={16} color="#fff" />
          <Text style={[ef.btnText, { color: '#fff' }]}>Guardar Alterações</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const ef = StyleSheet.create({
  scroll: { flex: 1 },
  section: { fontSize: 10, fontFamily: 'Inter_700Bold', color: Colors.textMuted, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 8, marginTop: 4 },
  label: { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: Colors.textSecondary, marginBottom: 5 },
  input: { backgroundColor: Colors.surface, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 12, paddingVertical: 10, fontSize: 13, fontFamily: 'Inter_400Regular', color: Colors.text, marginBottom: 12 },
  toggleRow: { flexDirection: 'row', gap: 8, marginBottom: 12, flexWrap: 'wrap' },
  toggleBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface },
  toggleActive: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  toggleText: { fontSize: 13, fontFamily: 'Inter_500Medium', color: Colors.textSecondary },
  toggleTextActive: { color: '#fff', fontFamily: 'Inter_600SemiBold' },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.border },
  switchLabel: { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: Colors.text },
  switchDesc: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 2 },
  pill: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface },
  pillOn: { backgroundColor: Colors.success + '20', borderColor: Colors.success },
  pillText: { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: Colors.textMuted },
  pillTextOn: { color: Colors.success },
  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 12 },
  btnText: { fontSize: 14, fontFamily: 'Inter_700Bold' },
});

// ─────────────────────────────────────────────────────────────────────────────
// Main Screen
// ─────────────────────────────────────────────────────────────────────────────
export default function AlunoPerfil() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { alunos, turmas, notas, presencas, updateAluno, deleteAluno } = useData();
  const { config } = useConfig();
  const { addUser, users, updateUser } = useUsers();
  const { taxas, multaConfig, getMesesEmAtraso, calcularMulta, getSaldoAluno, getRUPEsAluno } = useFinanceiro();
  const { anoSelecionado } = useAnoAcademico();

  const { user: authUser } = useAuth();

  const podeGerirAlunos = authUser
    ? ['ceo','pca','admin','director','chefe_secretaria','secretaria','pedagogico','coordenador_curso'].includes(authUser.role)
    : false;

  const [tab, setTab] = useState<Tab>('Perfil');
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pagamentos, setPagamentos] = useState<any[]>([]);
  const [pagamentosLoading, setPagamentosLoading] = useState(false);
  const [anotacoes, setAnotacoes] = useState<any[]>([]);
  const [anotacoesLoading, setAnotacoesLoading] = useState(false);
  const [novaAnotacao, setNovaAnotacao] = useState('');
  const [savingAnotacao, setSavingAnotacao] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [credenciais, setCredenciais] = useState<{ nome: string; email: string; senha: string } | null>(null);
  const [credHistorico, setCredHistorico] = useState<any[]>([]);
  const [credHistoricoLoading, setCredHistoricoLoading] = useState(false);
  const [timeline, setTimeline] = useState<any[]>([]);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [showBloqueio, setShowBloqueio] = useState(false);
  const [showFichaModal, setShowFichaModal] = useState(false);
  const [motivoBloqueio, setMotivoBloqueio] = useState('');
  const [savingBloqueio, setSavingBloqueio] = useState(false);

  // ── Notas: navegação por ano/classe ─────────────────────────────────────────
  const [notasTurmaId, setNotasTurmaId] = useState<string | null>(null);

  // ── Categorias e flag nuclear das disciplinas ───────────────────────────────
  const [discCatMap, setDiscCatMap] = useState<Record<string, string>>({});
  const [discNuclearMap, setDiscNuclearMap] = useState<Record<string, boolean>>({});
  useEffect(() => {
    fetch('/api/disciplinas')
      .then(r => r.json())
      .then((rows: any[]) => {
        if (!Array.isArray(rows)) return;
        const cats: Record<string, string> = {};
        const nucs: Record<string, boolean> = {};
        rows.forEach((d: any) => {
          if (d.nome) {
            cats[d.nome] = d.categoriaFormacao || '';
            nucs[d.nome] = !!(d.nuclear);
          }
        });
        setDiscCatMap(cats);
        setDiscNuclearMap(nucs);
      })
      .catch(() => {});
  }, []);

  // ── Justificações de falta ──────────────────────────────────────────────────
  const [justificacoes, setJustificacoes] = useState<any[]>([]);
  const [justLoading, setJustLoading] = useState(false);
  const [showJustModal, setShowJustModal] = useState(false);
  const [justPresencaIds, setJustPresencaIds] = useState<string[]>([]);
  const [justTexto, setJustTexto] = useState('');
  const [justUploadLoading, setJustUploadLoading] = useState(false);
  const [justComprovUrl, setJustComprovUrl] = useState('');
  const [justComprovNome, setJustComprovNome] = useState('');
  const [justSaving, setJustSaving] = useState(false);
  const fileInputRef = useRef<any>(null);

  const aluno = alunos.find(a => a.id === id) ?? null;
  const turma = turmas.find(t => t.id === aluno?.turmaId);

  const alunoNotas = useMemo(() => notas.filter(n => n.alunoId === id), [notas, id]);
  const alunoPresencas = useMemo(() => presencas.filter(p => p.alunoId === id), [presencas, id]);

  // ── Presença summary por disciplina ────────────────────────────────────────
  const faltasSummary = useMemo(() => {
    const map: Record<string, { P: number; F: number; J: number }> = {};
    alunoPresencas.forEach(p => {
      if (!map[p.disciplina]) map[p.disciplina] = { P: 0, F: 0, J: 0 };
      map[p.disciplina][p.status]++;
    });
    return Object.entries(map).map(([disciplina, counts]) => ({ disciplina, ...counts, total: counts.P + counts.F + counts.J }));
  }, [alunoPresencas]);

  // ── Notas: turmas disponíveis (para navegação por ano/classe) ───────────────
  const notasTurmasDisponiveis = useMemo(() => {
    const tem13 = (config as any).temDecimaTermeira !== false;
    const ids = [...new Set(alunoNotas.map((n: any) => n.turmaId).filter(Boolean))];
    return ids
      .map(tid => turmas.find(t => t.id === tid))
      .filter(Boolean)
      .filter((t: any) => tem13 || !String(t.classe || '').startsWith('13'))
      .sort((a: any, b: any) => {
        const na = parseInt((a.classe || '').replace(/\D/g, ''), 10) || 0;
        const nb = parseInt((b.classe || '').replace(/\D/g, ''), 10) || 0;
        return na - nb;
      });
  }, [alunoNotas, turmas, config]);

  // Auto-inicializar turmaId quando os dados chegam
  useEffect(() => {
    if (notasTurmasDisponiveis.length > 0 && !notasTurmaId) {
      const preferred = notasTurmasDisponiveis.find((t: any) => t.id === aluno?.turmaId)
        ?? notasTurmasDisponiveis[notasTurmasDisponiveis.length - 1];
      setNotasTurmaId((preferred as any)?.id ?? null);
    }
  }, [notasTurmasDisponiveis.length]);

  // ── Notas filtradas pela turma seleccionada ──────────────────────────────────
  const alunoNotasTurma = useMemo(() =>
    notasTurmaId ? alunoNotas.filter((n: any) => n.turmaId === notasTurmaId) : alunoNotas,
    [alunoNotas, notasTurmaId]
  );

  // ── Turma seleccionada para as notas (classe e número) ──────────────────────
  const notasTurmaAtual = useMemo(() =>
    turmas.find((t: any) => t.id === notasTurmaId) ?? null,
    [turmas, notasTurmaId]
  );
  const notasTurmaClasseNum = useMemo(() => {
    const c = (notasTurmaAtual as any)?.classe ?? '';
    return parseInt(String(c).replace(/\D/g, ''), 10) || 0;
  }, [notasTurmaAtual]);

  // ── Notas summary por disciplina e trimestre ────────────────────────────────
  const notasPorDisciplina = useMemo(() => {
    const map: Record<string, { [t: number]: { mt: number; mac: number; npt: number; nf: number; ex1: number } }> = {};
    alunoNotasTurma.forEach((n: any) => {
      if (!map[n.disciplina]) map[n.disciplina] = {};
      const mac = (n.mac ?? 0) > 0 ? (n.mac ?? 0) : (n.mac1 ?? 0);
      // NPT = Nota Prova Trimestral (campo ppt na BD) — não confundir com pp1 (NPP/Prova do Professor)
      const npt = n.ppt ?? 0;
      // nf = Nota Final do trimestre (inclui NPT); fallback para mt1 quando nf não foi calculado
      const nf = (n.nf ?? 0) > 0 ? (n.nf ?? 0) : (n.mt1 ?? 0);
      // ex1 = NEN (Nota do Exame Nacional) — usado no T3 das classes de exame nuclear
      map[n.disciplina][n.trimestre] = { mt: n.mt1 ?? 0, mac, npt, nf, ex1: n.ex1 ?? 0 };
    });
    return map;
  }, [alunoNotasTurma]);

  // ── Fetch pagamentos ────────────────────────────────────────────────────────
  useEffect(() => {
    if (tab === 'Financeiro' && id) {
      setPagamentosLoading(true);
      api.get(`/api/pagamentos?alunoId=${id}`)
        .then((r: any) => setPagamentos(r.data ?? []))
        .catch(() => setPagamentos([]))
        .finally(() => setPagamentosLoading(false));
    }
  }, [tab, id]);

  // ── Fetch justificações de falta ────────────────────────────────────────────
  const fetchJustificacoes = useCallback(() => {
    if (!id) return;
    setJustLoading(true);
    api.get(`/api/justificacoes-falta?alunoId=${id}`)
      .then((r: any) => setJustificacoes(Array.isArray(r) ? r : (r?.data ?? [])))
      .catch(() => setJustificacoes([]))
      .finally(() => setJustLoading(false));
  }, [id]);

  useEffect(() => {
    if (tab === 'Faltas' && id) fetchJustificacoes();
  }, [tab, id, fetchJustificacoes]);

  // ── Upload comprovativo de justificação ─────────────────────────────────────
  const handleUploadComprovativo = useCallback(async (file: File) => {
    setJustUploadLoading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const token = await getAuthToken();
      const resp = await fetch('/api/upload', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });
      const data = await resp.json();
      if (data?.url) {
        setJustComprovUrl(data.url);
        setJustComprovNome(file.name);
      } else {
        alertErro('Upload falhou', data?.error || 'Não foi possível carregar o ficheiro.');
      }
    } catch {
      alertErro('Erro', 'Não foi possível carregar o ficheiro.');
    } finally {
      setJustUploadLoading(false);
    }
  }, []);

  // ── Submeter justificação ───────────────────────────────────────────────────
  const handleSubmitJustificacao = useCallback(async () => {
    if (!aluno || justPresencaIds.length === 0) return;
    if (!justTexto.trim()) { alertErro('Atenção', 'Escreva a justificação.'); return; }
    setJustSaving(true);
    try {
      await api.post('/api/justificacoes-falta/livre', {
        alunoId: aluno.id,
        presencaIds: justPresencaIds,
        justificativa: justTexto.trim(),
        comprovativoUrl: justComprovUrl || null,
        comprovativoNome: justComprovNome || null,
        disciplina: null,
        solicitadoPor: aluno.nome + ' ' + (aluno.apelido || ''),
      });
      alertSucesso('Enviado', 'Justificação submetida com sucesso. Aguarda aprovação.');
      setShowJustModal(false);
      setJustPresencaIds([]);
      setJustTexto('');
      setJustComprovUrl('');
      setJustComprovNome('');
      fetchJustificacoes();
    } catch (e: any) {
      alertErro('Erro', e?.message || 'Não foi possível enviar a justificação.');
    } finally {
      setJustSaving(false);
    }
  }, [aluno, justPresencaIds, justTexto, justComprovUrl, justComprovNome, fetchJustificacoes]);

  // ── Fetch anotações ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (tab === 'Anotações' && id) {
      setAnotacoesLoading(true);
      api.get(`/api/anotacoes-matricula?alunoId=${id}`)
        .then((r: any) => setAnotacoes(r.data ?? []))
        .catch(() => setAnotacoes([]))
        .finally(() => setAnotacoesLoading(false));
    }
  }, [tab, id]);

  // ── Fetch histórico de credenciais ──────────────────────────────────────────
  const fetchCredHistorico = () => {
    if (!id) return;
    setCredHistoricoLoading(true);
    api.get(`/api/credenciais-historico/${id}`)
      .then((r: any) => setCredHistorico(r.data ?? []))
      .catch(() => setCredHistorico([]))
      .finally(() => setCredHistoricoLoading(false));
  };

  useEffect(() => {
    if (tab === 'Acessos' && id) fetchCredHistorico();
  }, [tab, id]);

  useEffect(() => {
    if (tab === 'Histórico' && id) {
      setTimelineLoading(true);
      api.get(`/api/alunos/${id}/timeline`)
        .then((r: any) => setTimeline(r.data ?? []))
        .catch(() => setTimeline([]))
        .finally(() => setTimelineLoading(false));
    }
  }, [tab, id]);

  if (!aluno) {
    return (
      <View style={{ flex: 1, backgroundColor: Colors.background, justifyContent: 'center', alignItems: 'center' }}>
        <Ionicons name="person-outline" size={48} color={Colors.textMuted} />
        <Text style={{ color: Colors.textMuted, fontFamily: 'Inter_400Regular', marginTop: 12 }}>Aluno não encontrado</Text>
        <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 20 }}>
          <Text style={{ color: Colors.accent, fontFamily: 'Inter_600SemiBold' }}>Voltar</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Save edit ───────────────────────────────────────────────────────────────
  async function handleSaveEdit(form: Partial<Aluno>) {
    setSaving(true);
    try {
      await updateAluno(aluno!.id, form);
      alertSucesso('Dados actualizados', `Os dados de ${form.nome} ${form.apelido} foram actualizados.`);
      setEditing(false);
    } catch {
      alertErro('Erro', 'Não foi possível guardar as alterações.');
    } finally {
      setSaving(false);
    }
  }

  // ── Anotações actions ───────────────────────────────────────────────────────
  async function handleAddAnotacao() {
    if (!novaAnotacao.trim()) return;
    setSavingAnotacao(true);
    try {
      const r = await api.post('/api/anotacoes-matricula', { alunoId: id, texto: novaAnotacao.trim() }) as any;
      setAnotacoes(prev => [r.data, ...prev]);
      setNovaAnotacao('');
    } catch { alertErro('Erro', 'Não foi possível guardar a anotação.'); }
    finally { setSavingAnotacao(false); }
  }

  async function handleDeleteAnotacao(anotacaoId: string) {
    try {
      await api.delete(`/api/anotacoes-matricula/${anotacaoId}`);
      setAnotacoes(prev => prev.filter(a => a.id !== anotacaoId));
    } catch { alertErro('Erro', 'Não foi possível eliminar a anotação.'); }
  }

  // ── Credenciais ─────────────────────────────────────────────────────────────
  async function handleVerCredenciais() {
    setRegenerating(true);
    try {
      const escola = config?.nomeEscola || 'Super Escola';
      const nomeEnc = aluno!.nomeEncarregado?.trim() || 'Encarregado';
      const emailBase = normalizeEmail(nomeEnc);
      const emailEnc = aluno!.emailEncarregado?.trim() || `enc.${emailBase}@escola.ao`;

      // Search by alunoId first, then by email (handles Neon data where alunoId may not be linked)
      const encExistente =
        users.find(u => u.alunoId === aluno!.id && u.role === 'encarregado') ||
        users.find(u => u.email.toLowerCase() === emailEnc.toLowerCase());

      let emailFinal = emailEnc;
      let acaoRealizada: 'gerado' | 'regenerado' = 'gerado';

      if (encExistente) {
        const novaSenha = gerarSenha();
        await updateUser(encExistente.id, { senha: novaSenha });
        setCredenciais({ nome: encExistente.nome, email: encExistente.email, senha: novaSenha });
        emailFinal = encExistente.email;
        acaoRealizada = 'regenerado';
      } else {
        // addUser now handles duplicate emails gracefully on the server (upsert)
        const senha = gerarSenha();
        const novo = await addUser({ nome: nomeEnc, email: emailEnc, senha, role: 'encarregado', escola, ativo: true, alunoId: aluno!.id } as any);
        await updateAluno(aluno!.id, { emailEncarregado: emailEnc } as any).catch(() => {});
        setCredenciais({ nome: (novo as any).nome ?? nomeEnc, email: (novo as any).email ?? emailEnc, senha });
        emailFinal = (novo as any).email ?? emailEnc;
        acaoRealizada = 'gerado';
      }

      // Registar no histórico de credenciais (fire-and-forget)
      api.post('/api/credenciais-historico', {
        alunoId: aluno!.id,
        tipo: 'encarregado',
        email: emailFinal,
        acao: acaoRealizada,
      }).then(() => {
        // Atualiza o histórico se a tab Acessos estiver visível
        if (tab === 'Acessos') fetchCredHistorico();
      }).catch(() => {});

    } catch (err: any) {
      webAlert('Erro', 'Não foi possível gerar as credenciais. ' + (err?.message ?? ''));
    }
    finally { setRegenerating(false); }
  }

  // ── Bloqueio de Renovação ───────────────────────────────────────────────────
  async function handleToggleBloqueio() {
    if (!aluno) return;
    const bloqueado = !!(aluno as any).bloqueioRenovacao;
    if (!bloqueado && !motivoBloqueio.trim()) {
      webAlert('Motivo obrigatório', 'Indique o motivo do bloqueio.');
      return;
    }
    setSavingBloqueio(true);
    try {
      await api.patch(`/api/alunos/${aluno.id}/bloquear-renovacao`, {
        bloqueioRenovacao: !bloqueado,
        motivoBloqueioRenovacao: bloqueado ? null : motivoBloqueio.trim(),
      });
      await updateAluno(aluno.id, { bloqueioRenovacao: !bloqueado } as any);
      alertSucesso(bloqueado ? 'Renovação liberada' : 'Renovação bloqueada', '');
      setShowBloqueio(false);
      setMotivoBloqueio('');
    } catch { alertErro('Erro', 'Não foi possível alterar o bloqueio.'); }
    finally { setSavingBloqueio(false); }
  }

  // ── Eliminar aluno ─────────────────────────────────────────────────────────
  function handleDelete() {
    if (!aluno) return;
    webAlert(
      'Remover Aluno',
      `Tem a certeza que quer remover ${aluno.nome} ${aluno.apelido}? Esta acção é irreversível.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Remover',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteAluno(aluno.id);
              router.back();
            } catch { alertErro('Erro', 'Não foi possível remover o aluno.'); }
          },
        },
      ]
    );
  }

  // ─── Header colours by gender ─────────────────────────────────────────────
  const avatarBg = aluno.genero === 'F' ? `${Colors.accent}30` : `${Colors.info}30`;
  const avatarColor = aluno.genero === 'F' ? Colors.accent : Colors.info;

  return (
    <View style={[s.screen, { paddingTop: insets.top }]}>

      {/* ── Compact unified header ─────────────────────────────────────────── */}
      <View style={s.header}>

        {/* Row 1: back + avatar + identity + cancel */}
        <View style={s.headerRow}>
          <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
            <Ionicons name="chevron-back" size={20} color={Colors.text} />
          </TouchableOpacity>

          {!editing && (
            <View style={[s.avatarSm, { backgroundColor: avatarBg }]}>
              <Text style={[s.avatarSmText, { color: avatarColor }]}>{aluno.nome.charAt(0)}{aluno.apelido.charAt(0)}</Text>
            </View>
          )}

          <View style={{ flex: 1 }}>
            <Text style={s.topTitle} numberOfLines={1}>{aluno.nome} {aluno.apelido}</Text>
            <Text style={s.topSub} numberOfLines={1}>
              {aluno.numeroMatricula}
              {turma ? ` · ${turma.classe} · ${turma.nome}` : ' · Sem turma'}
            </Text>
          </View>

          {!editing && (
            <View style={s.badgeRow}>
              <View style={[s.badge, aluno.ativo ? s.badgeGreen : s.badgeRed]}>
                <Text style={[s.badgeText, { color: aluno.ativo ? Colors.success : Colors.danger }]}>{aluno.ativo ? 'Activo' : 'Inactivo'}</Text>
              </View>
              {(aluno as any).bloqueado && (
                <View style={[s.badge, s.badgeRed]}>
                  <Text style={[s.badgeText, { color: Colors.danger }]}>Bloq.</Text>
                </View>
              )}
              {aluno.falecido && (
                <View style={[s.badge, { backgroundColor: Colors.textMuted + '20', borderColor: Colors.textMuted + '40' }]}>
                  <Text style={[s.badgeText, { color: Colors.textMuted }]}>Falecido</Text>
                </View>
              )}
            </View>
          )}

          {editing && (
            <TouchableOpacity onPress={() => setEditing(false)} style={s.editBtn}>
              <Ionicons name="close" size={16} color={Colors.textSecondary} />
              <Text style={[s.editBtnText, { color: Colors.textSecondary }]}>Cancelar</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Row 2 (view mode only): action chips + tabs in one combined strip */}
        {!editing && (
          <>
            {/* Action chips */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ borderTopWidth: 1, borderTopColor: Colors.border }} contentContainerStyle={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6 }}>
              {podeGerirAlunos && <ActionChip icon="create-outline" label="Editar" color={Colors.accent} onPress={() => setEditing(true)} />}
              <ActionChip icon="qr-code-outline" label="QR Code" color={Colors.gold} onPress={() => setShowQr(true)} />
              <ActionChip icon="newspaper-outline" label="Boletim" color={Colors.warning} onPress={() => router.push({ pathname: '/(main)/boletim-matricula', params: { alunoId: aluno.id } } as any)} />
              <ActionChip icon="document-text-outline" label="Caderneta" color={Colors.success} onPress={() => router.push({ pathname: '/(main)/boletim-propina', params: { alunoId: aluno.id } } as any)} />
              <ActionChip icon="school-outline" label="Comprovativo" color="#0891b2" onPress={() => router.push(`/comprovativo-matricula?alunoId=${aluno.id}&tipo=${(aluno as any).situacao === 'reconfirmado' || (aluno as any).tipoInscricao === 'reconfirmacao' ? 'reconfirmacao' : 'matricula'}` as any)} />
              <ActionChip icon="printer" label="Imprimir Ficha" color="#16a34a" onPress={() => setShowFichaModal(true)} isMaterial />
              {podeGerirAlunos && <ActionChip icon="account-key" label={regenerating ? 'A gerar...' : 'Credenciais'} color="#F97316" onPress={handleVerCredenciais} isMaterial disabled={regenerating} />}
              {podeGerirAlunos && <ActionChip icon={(aluno as any).bloqueioRenovacao ? 'lock-open-outline' : 'lock-closed-outline'} label={(aluno as any).bloqueioRenovacao ? 'Libertar' : 'Bloquear'} color={(aluno as any).bloqueioRenovacao ? Colors.success : Colors.warning} onPress={() => setShowBloqueio(true)} />}
              {podeGerirAlunos && <ActionChip icon="trash-outline" label="Eliminar" color={Colors.danger} onPress={handleDelete} />}
            </ScrollView>

            {/* Tab bar */}
            <HScrollTabBar style={s.tabBar} contentContainerStyle={s.tabBarContent} keyboardShouldPersistTaps="handled">
              {TABS.map(t => (
                <TouchableOpacity key={t} onPress={() => setTab(t)} style={s.tabBtn}>
                  <Text style={[s.tabText, tab === t && s.tabTextActive]} numberOfLines={1}>{t}</Text>
                  {tab === t && <View style={s.tabUnderline} />}
                </TouchableOpacity>
              ))}
            </HScrollTabBar>
          </>
        )}
      </View>

      {/* ── Content ─────────────────────────────────────────────────────────── */}
      <View style={{ flex: 1, paddingHorizontal: 16, paddingTop: 4 }}>

        {/* EDIT MODE */}
        {editing && (
          <EditForm aluno={aluno} turmas={turmas} onSave={handleSaveEdit} onCancel={() => setEditing(false)} />
        )}

        {/* TAB: PERFIL */}
        {!editing && tab === 'Perfil' && (
          <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 30 }}>

            <SectionCard title="Identificação Pessoal">
              <InfoRow label="Nome completo" value={`${aluno.nome} ${aluno.apelido}`} />
              <InfoRow label="Nº de Matrícula" value={aluno.numeroMatricula} />
              <InfoRow label="Data de Nascimento" value={fmtData(aluno.dataNascimento)} />
              <InfoRow label="Idade" value={calcIdade(aluno.dataNascimento)} />
              <InfoRow label="Género" value={aluno.genero === 'M' ? 'Masculino' : 'Feminino'} />
              <InfoRow label="Província" value={aluno.provincia || '—'} />
              <InfoRow label="Município" value={aluno.municipio || '—'} />
              <InfoRow label="Data de Registo" value={fmtData(aluno.createdAt)} last />
            </SectionCard>

            <SectionCard title="Dados Académicos">
              <InfoRow label="Turma" value={turma?.nome ?? '—'} />
              <InfoRow label="Classe" value={turma?.classe ?? '—'} />
              <InfoRow label="Turno" value={turma?.turno ?? '—'} />
              <InfoRow label="Ano Lectivo" value={turma?.anoLetivo ?? '—'} />
              <InfoRow label="Curso/Área" value={(aluno as any).cursoId || '—'} last />
            </SectionCard>

            {((aluno as any).numeroBi || (aluno as any).numeroCedula || (aluno as any).biDataEmissao) && (
              <SectionCard title="Identificação Oficial">
                {(aluno as any).numeroBi && <InfoRow label="Nº BI" value={(aluno as any).numeroBi} />}
                {(aluno as any).numeroCedula && <InfoRow label="Nº Cédula" value={(aluno as any).numeroCedula} />}
                {(aluno as any).biDataEmissao && <InfoRow label="Data Emissão BI" value={(aluno as any).biDataEmissao} />}
                {(aluno as any).biLocalEmissao && <InfoRow label="Arquivo Emissão" value={(aluno as any).biLocalEmissao} last />}
              </SectionCard>
            )}

            <SectionCard title="Encarregado de Educação">
              <InfoRow label="Nome do Pai" value={(aluno as any).nomePai || '—'} />
              <InfoRow label="Nome da Mãe" value={(aluno as any).nomeMae || '—'} />
              <InfoRow label="Encarregado" value={aluno.nomeEncarregado || '—'} />
              <InfoRow label="Telefone" value={aluno.telefoneEncarregado || '—'} />
              <InfoRow label="Email (portal)" value={aluno.emailEncarregado || '—'} />
              {(aluno as any).encarregadoProfissao && <InfoRow label="Profissão" value={(aluno as any).encarregadoProfissao} />}
              {(aluno as any).encarregadoLocalTrabalho && <InfoRow label="Local de Trabalho" value={(aluno as any).encarregadoLocalTrabalho} />}
              {(aluno as any).encarregadoResidencia && <InfoRow label="Residência" value={(aluno as any).encarregadoResidencia} />}
              {(aluno as any).encarregadoContacto2 && <InfoRow label="2º Contacto" value={(aluno as any).encarregadoContacto2} last />}
              {!(aluno as any).encarregadoProfissao && !(aluno as any).encarregadoContacto2 && <InfoRow label="" value="" last />}
            </SectionCard>

            <SectionCard title="Estado e Acesso">
              <StatusRow label="Aluno activo" value={aluno.ativo} />
              <StatusRow label="Bloqueado" value={!!(aluno as any).bloqueado} danger />
              <StatusRow label="Acesso com pendência" value={!!aluno.permitirAcessoComPendencia} />
              <StatusRow label="Publicar notas" value={!!aluno.publicarNotas} last />
            </SectionCard>

            {aluno.falecido && (
              <View style={s.dangerBox}>
                <Ionicons name="alert-circle" size={16} color={Colors.danger} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 12, fontFamily: 'Inter_700Bold', color: Colors.danger, marginBottom: 4 }}>Aluno Falecido</Text>
                  {aluno.dataFalecimento && <Text style={{ fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textSecondary }}>Data: {fmtData(aluno.dataFalecimento)}</Text>}
                  {aluno.observacoesFalecimento && <Text style={{ fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textSecondary, marginTop: 4 }}>{aluno.observacoesFalecimento}</Text>}
                </View>
              </View>
            )}
          </ScrollView>
        )}

        {/* TAB: NOTAS */}
        {!editing && tab === 'Notas' && (
          <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 30 }}>

            {/* ── Selector de Ano/Classe ─────────────────────────────────── */}
            {notasTurmasDisponiveis.length > 1 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false}
                style={{ marginTop: 14, marginBottom: 2 }}
                contentContainerStyle={{ gap: 8, paddingBottom: 2 }}>
                {notasTurmasDisponiveis.map((t: any) => {
                  const isActive = t.id === notasTurmaId;
                  return (
                    <TouchableOpacity key={t.id}
                      onPress={() => setNotasTurmaId(t.id)}
                      style={{
                        paddingHorizontal: 16, paddingVertical: 7, borderRadius: 20, borderWidth: 1.5,
                        backgroundColor: isActive ? Colors.accent + '18' : 'transparent',
                        borderColor: isActive ? Colors.accent : Colors.border,
                        flexDirection: 'row', alignItems: 'center', gap: 6,
                      }}>
                      <MaterialCommunityIcons
                        name={isActive ? 'school' : 'school-outline'}
                        size={13} color={isActive ? Colors.accent : Colors.textMuted} />
                      <Text style={{
                        fontSize: 12,
                        fontFamily: isActive ? 'Inter_700Bold' : 'Inter_500Medium',
                        color: isActive ? Colors.accent : Colors.textMuted,
                      }}>
                        {t.classe ?? t.nome}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}

            {/* ── Subtítulo da turma seleccionada ────────────────────────── */}
            {notasTurmaId && (() => {
              const t = notasTurmasDisponiveis.find((x: any) => x.id === notasTurmaId) as any;
              if (!t) return null;
              return (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: notasTurmasDisponiveis.length > 1 ? 8 : 14, marginBottom: 2, opacity: 0.7 }}>
                  <MaterialCommunityIcons name="calendar-range" size={12} color={Colors.textMuted} />
                  <Text style={{ fontSize: 11, fontFamily: 'Inter_500Medium', color: Colors.textMuted }}>
                    {t.nome} · Ano Lectivo {t.anoLetivo}
                  </Text>
                </View>
              );
            })()}

            {/* ── Painel: Transição Condicional (Art. 23 §10) ──────────────── */}
            {(() => {
              const notaMin = Number((config as any).notaMinimaAprovacao ?? 10);
              const notaMinAbs = 7;
              const classe = (notasTurmaAtual as any)?.classe ?? '';
              const classeNum = parseInt(String(classe).replace(/\D/g, ''), 10) || 0;
              const isICiclo  = classeNum === 7 || classeNum === 8;
              const isIICiclo = classeNum === 10 || classeNum === 11;
              if (!isICiclo && !isIICiclo) return null;

              const maxNeg = isICiclo
                ? Number((config as any).maxNegativosICiclo  ?? 2)
                : Number((config as any).maxNegativosIICiclo ?? 3);

              const restricaoLPAreaConfig = !!(config as any).restricaoLPAreaIICiclo;

              // MFD por disciplina (simplificado: média dos trimestres nf disponíveis)
              const mfds = Object.entries(notasPorDisciplina).map(([disc, trims]) => {
                const vals = [trims[1], trims[2], trims[3]]
                  .map(r => r ? (r.nf > 0 ? r.nf : r.mt > 0 ? r.mt : 0) : 0)
                  .filter(v => v > 0);
                const mfd = vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
                return { disc, mfd };
              }).filter(d => d.mfd !== null);

              const reprovadas   = mfds.filter(d => d.mfd! < notaMinAbs);
              const condicionais = mfds.filter(d => d.mfd! >= notaMinAbs && d.mfd! < notaMin);
              const numNeg = mfds.filter(d => d.mfd! < notaMin).length;

              if (mfds.length === 0) return null;
              if (reprovadas.length > 0) return null; // reprovação directa, não é condicional

              // Verificar restrição LP+Área (II Ciclo, Art. 23 §10)
              const restricaoLPArea = restricaoLPAreaConfig && isIICiclo;
              const negativasNomes  = mfds.filter(d => d.mfd! < notaMin).map(d => d.disc);
              const temLP           = negativasNomes.some(n => /portugu[eê]s/i.test(n));
              const nuclearesNeg    = negativasNomes.filter(n => !/portugu[eê]s/i.test(n));
              const restricaoActiva = restricaoLPArea && temLP && nuclearesNeg.length >= 2;

              if (numNeg === 0) return (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#dcfce7', borderRadius: 10, padding: 10, marginTop: 10, marginBottom: 4 }}>
                  <Ionicons name="checkmark-circle" size={16} color="#16a34a" />
                  <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 12, color: '#166534' }}>Aprovado — sem negativas</Text>
                </View>
              );

              const excesso = numNeg > maxNeg;
              const cor   = excesso || restricaoActiva ? Colors.danger : '#f59e0b';
              const corBg = excesso || restricaoActiva ? '#fee2e2' : '#fffbeb';
              const icone = excesso || restricaoActiva ? 'close-circle' : 'alert-circle';
              const corTexto = excesso || restricaoActiva ? '#991b1b' : '#92400e';
              const corSub   = excesso || restricaoActiva ? '#b91c1c' : '#78350f';

              return (
                <View style={{ backgroundColor: corBg, borderRadius: 12, padding: 14, marginTop: 10, marginBottom: 4, borderWidth: 1, borderColor: cor + '44' }}>

                  {/* Título do painel */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                    <Ionicons name={icone as any} size={18} color={cor} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 13, color: corTexto }}>
                        {excesso
                          ? `NÃO TRANSITA — Excesso de negativos`
                          : restricaoActiva
                            ? `NÃO TRANSITA — Restrição LP + Área`
                            : `TRANSITA COM CONDIÇÃO`}
                      </Text>
                      <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 10, color: Colors.textMuted, marginTop: 1 }}>
                        Art. 23 §10 · Decreto Executivo nº 04/2026 · {isICiclo ? 'I Ciclo (7ª/8ª)' : 'II Ciclo (10ª/11ª)'}
                      </Text>
                    </View>
                  </View>

                  {/* Indicador de limite */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: cor + '18', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, marginBottom: 10 }}>
                    <Ionicons name="stats-chart" size={13} color={cor} />
                    <Text style={{ fontFamily: 'Inter_500Medium', fontSize: 11, color: corTexto, flex: 1 }}>
                      {numNeg} negativa{numNeg !== 1 ? 's' : ''} · limite do decreto:{' '}
                      <Text style={{ fontFamily: 'Inter_700Bold' }}>{maxNeg}</Text>
                      {excesso ? ` · ⚠ excede por ${numNeg - maxNeg}` : numNeg < maxNeg ? ` · ✓ dentro do limite` : ` · no limite`}
                    </Text>
                  </View>

                  {/* Disciplinas negativas */}
                  {condicionais.length > 0 && (
                    <View style={{ gap: 4, marginBottom: restricaoActiva ? 10 : 0 }}>
                      <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 10, color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 2 }}>
                        Disciplinas negativas (7–{notaMin - 1} val.)
                      </Text>
                      {condicionais.map(d => {
                        const isLP = /portugu[eê]s/i.test(d.disc);
                        const isNuclear = !isLP && restricaoActiva && nuclearesNeg.includes(d.disc);
                        return (
                          <View key={d.disc} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: cor }} />
                            <Text style={{ fontFamily: 'Inter_500Medium', fontSize: 11, color: corSub, flex: 1 }}>
                              {d.disc}
                              {isLP && restricaoActiva ? <Text style={{ color: Colors.danger, fontFamily: 'Inter_700Bold' }}> [LP]</Text> : null}
                              {isNuclear ? <Text style={{ color: '#7c3aed', fontFamily: 'Inter_700Bold' }}> [Área]</Text> : null}
                            </Text>
                            <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 12, color: cor }}>
                              {d.mfd!.toFixed(1)} val.
                            </Text>
                          </View>
                        );
                      })}
                    </View>
                  )}

                  {/* Aviso específico da restrição LP+Área */}
                  {restricaoActiva && (
                    <View style={{ flexDirection: 'row', gap: 7, backgroundColor: '#7c3aed18', borderRadius: 8, padding: 9, marginBottom: 4, alignItems: 'flex-start' }}>
                      <Ionicons name="ban" size={13} color="#7c3aed" />
                      <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 10, color: '#5b21b6', flex: 1, lineHeight: 14 }}>
                        <Text style={{ fontFamily: 'Inter_700Bold' }}>Restrição LP+Área activa:</Text> Língua Portuguesa negativa simultaneamente com {nuclearesNeg.length} disciplina{nuclearesNeg.length !== 1 ? 's' : ''} da área ({nuclearesNeg.join(', ')}) — NÃO TRANSITA (Art. 23 §10)
                      </Text>
                    </View>
                  )}

                  {/* Rodapé informativo */}
                  <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 9, color: Colors.textMuted, marginTop: 6 }}>
                    ⓘ Valores provisórios calculados a partir das notas trimestrais lançadas. Confirme com o relatório oficial da secretaria.
                  </Text>
                </View>
              );
            })()}

            {Object.keys(notasPorDisciplina).length === 0 ? (
              <EmptyState icon="school-outline" text="Sem notas registadas para este período" />
            ) : (
              <>
                {/* ── Cabeçalho da tabela ─────────────────────────────────── */}
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={{ minWidth: 680 }}>
                <View style={s.notasHeader}>
                  <Text style={[s.notasHeaderCell, { flex: 2.5, textAlign: 'left' }]}>Disciplina</Text>
                  <Text style={[s.notasHeaderCell, s.notasMacCell]}>MAC1</Text>
                  <Text style={[s.notasHeaderCell, s.notasMacCell]}>NPT1</Text>
                  <Text style={s.notasHeaderCell}>T1</Text>
                  <Text style={[s.notasHeaderCell, s.notasMacCell]}>MAC2</Text>
                  <Text style={[s.notasHeaderCell, s.notasMacCell]}>NPT2</Text>
                  <Text style={s.notasHeaderCell}>T2</Text>
                  <Text style={[s.notasHeaderCell, s.notasMacCell]}>MAC3</Text>
                  <Text style={[s.notasHeaderCell, s.notasMacCell]}>NPT3</Text>
                  <Text style={s.notasHeaderCell}>T3</Text>
                  <Text style={[s.notasHeaderCell, { color: Colors.accent }]}>MFD</Text>
                </View>

                {/* ── Linhas das disciplinas agrupadas por categoria ───────── */}
                {(() => {
                  const CAT_ORDER = [
                    { key: 'formacao_geral',      label: 'Formação Geral',      color: Colors.info },
                    { key: 'formacao_especifica',  label: 'Formação Específica', color: Colors.gold },
                    { key: 'opcional',             label: 'Opcionais',           color: Colors.success },
                    { key: '__other__',            label: 'Outras Disciplinas',  color: Colors.textMuted },
                  ];
                  const entries = Object.entries(notasPorDisciplina);
                  const hasAnyCat = entries.some(([disc]) => !!discCatMap[disc]);
                  if (!hasAnyCat) {
                    // fallback sem categorias: lista plana como antes
                    return entries.map(([disc, trims]) => {
                      const r1 = trims[1] ?? null; const r2 = trims[2] ?? null; const r3 = trims[3] ?? null;
                      const t1 = r1 && r1.mt > 0 ? r1.mt : null; const t2 = r2 && r2.mt > 0 ? r2.mt : null; const t3 = r3 && r3.mt > 0 ? r3.mt : null;
                      const mac1 = r1 && r1.mac > 0 ? r1.mac : null;
                      const mac2 = r2 && r2.mac > 0 ? r2.mac : null;
                      const mac3 = r3 && r3.mac > 0 ? r3.mac : null;
                      const npt1 = r1 && r1.npt > 0 ? r1.npt : null;
                      const npt2 = r2 && r2.npt > 0 ? r2.npt : null;
                      const npt3 = r3 && r3.npt > 0 ? r3.npt : null;
                      // MFD: com decreto activo usa calcMFD_auto; senão média de nf/mt
                      const mfd = (() => {
                        const mt1v = r1?.mt ?? 0; const mt2v = r2?.mt ?? 0; const mt3v = r3?.mt ?? 0;
                        const hasData = mt1v > 0 || mt2v > 0 || mt3v > 0;
                        if (!hasData) return null;
                        if (!!(config as any).usarFormulasDecreto && notasTurmaClasseNum > 0) {
                          return calcMFD_auto(mt1v, mt2v, mt3v, r3?.ex1 ?? 0, !!discNuclearMap[disc], notasTurmaClasseNum);
                        }
                        const vals = [r1, r2, r3].map(r => r ? (r.nf > 0 ? r.nf : r.mt > 0 ? r.mt : 0) : 0).filter(v => v > 0);
                        return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
                      })();
                      return (
                        <View key={disc} style={s.notasRow}>
                          <Text style={[s.notasCell, { flex: 2.5, textAlign: 'left', fontFamily: 'Inter_500Medium' }]} numberOfLines={2}>{disc}</Text>
                          <MacCell value={mac1} /><NptCell value={npt1} /><GradeCell value={t1} />
                          <MacCell value={mac2} /><NptCell value={npt2} /><GradeCell value={t2} />
                          <MacCell value={mac3} /><NptCell value={npt3} /><GradeCell value={t3} />
                          <GradeCell value={mfd !== null ? parseFloat(mfd.toFixed(1)) : null} bold />
                        </View>
                      );
                    });
                  }
                  return CAT_ORDER.map(cat => {
                    const catEntries = entries.filter(([disc]) => {
                      const dc = discCatMap[disc] || '';
                      return cat.key === '__other__'
                        ? !CAT_ORDER.slice(0, 3).some(c => c.key === dc)
                        : dc === cat.key;
                    });
                    if (catEntries.length === 0) return null;
                    return (
                      <View key={cat.key}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12, marginBottom: 4, paddingBottom: 4, borderBottomWidth: 1, borderBottomColor: cat.color + '33' }}>
                          <View style={{ width: 3, height: 13, borderRadius: 2, backgroundColor: cat.color }} />
                          <Text style={{ fontSize: 10, fontFamily: 'Inter_700Bold', color: cat.color, letterSpacing: 1, textTransform: 'uppercase' }}>{cat.label}</Text>
                        </View>
                        {catEntries.map(([disc, trims]) => {
                          const r1 = trims[1] ?? null; const r2 = trims[2] ?? null; const r3 = trims[3] ?? null;
                          const t1 = r1 && r1.mt > 0 ? r1.mt : null; const t2 = r2 && r2.mt > 0 ? r2.mt : null; const t3 = r3 && r3.mt > 0 ? r3.mt : null;
                          const mac1 = r1 && r1.mac > 0 ? r1.mac : null;
                          const mac2 = r2 && r2.mac > 0 ? r2.mac : null;
                          const mac3 = r3 && r3.mac > 0 ? r3.mac : null;
                          const npt1 = r1 && r1.npt > 0 ? r1.npt : null;
                          const npt2 = r2 && r2.npt > 0 ? r2.npt : null;
                          const npt3 = r3 && r3.npt > 0 ? r3.npt : null;
                          // MFD: com decreto activo usa calcMFD_auto; senão média de nf/mt
                          const mfd = (() => {
                            const mt1v = r1?.mt ?? 0; const mt2v = r2?.mt ?? 0; const mt3v = r3?.mt ?? 0;
                            const hasData = mt1v > 0 || mt2v > 0 || mt3v > 0;
                            if (!hasData) return null;
                            if (!!(config as any).usarFormulasDecreto && notasTurmaClasseNum > 0) {
                              return calcMFD_auto(mt1v, mt2v, mt3v, r3?.ex1 ?? 0, !!discNuclearMap[disc], notasTurmaClasseNum);
                            }
                            const vals = [r1, r2, r3].map(r => r ? (r.nf > 0 ? r.nf : r.mt > 0 ? r.mt : 0) : 0).filter(v => v > 0);
                            return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
                          })();
                          return (
                            <View key={disc} style={s.notasRow}>
                              <Text style={[s.notasCell, { flex: 2.5, textAlign: 'left', fontFamily: 'Inter_500Medium' }]} numberOfLines={2}>{disc}</Text>
                              <MacCell value={mac1} /><NptCell value={npt1} /><GradeCell value={t1} />
                              <MacCell value={mac2} /><NptCell value={npt2} /><GradeCell value={t2} />
                              <MacCell value={mac3} /><NptCell value={npt3} /><GradeCell value={t3} />
                              <GradeCell value={mfd !== null ? parseFloat(mfd.toFixed(1)) : null} bold />
                            </View>
                          );
                        })}
                      </View>
                    );
                  });
                })()}
                </View>
                </ScrollView>

                {/* ── Média Geral da turma seleccionada ──────────────────── */}
                {alunoNotasTurma.length > 0 && (() => {
                  const nfs = alunoNotasTurma.map((n: any) => n.nf).filter((v: any) => v > 0);
                  const mediaGeral = nfs.length > 0 ? nfs.reduce((a: number, b: number) => a + b, 0) / nfs.length : null;
                  return (
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, borderTopWidth: 1, borderTopColor: Colors.border, marginTop: 6 }}>
                      <Text style={{ fontSize: 13, fontFamily: 'Inter_600SemiBold', color: Colors.textSecondary }}>Média Geral</Text>
                      {mediaGeral !== null && (
                        <Text style={{ fontSize: 22, fontFamily: 'Inter_700Bold', color: gradeColor(mediaGeral) }}>
                          {mediaGeral.toFixed(1)}<Text style={{ fontSize: 12, color: Colors.textMuted }}>/20</Text>
                        </Text>
                      )}
                    </View>
                  );
                })()}

                {/* ── Botão Solicitar Melhoria de Nota ───────────────────── */}
                {(() => {
                  const cfg = config as any;
                  if (!cfg.melhoriaNotaHabilitada) return null;
                  return (
                    <TouchableOpacity
                      onPress={() => (router as any).push('/(main)/melhoria-nota')}
                      style={{
                        flexDirection: 'row', alignItems: 'center', gap: 10,
                        backgroundColor: '#8b5cf620', borderRadius: 12,
                        borderWidth: 1.5, borderColor: '#8b5cf650',
                        padding: 12, marginTop: 14, marginBottom: 4,
                      }}
                    >
                      <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: '#8b5cf622', alignItems: 'center', justifyContent: 'center' }}>
                        <Ionicons name="trending-up-outline" size={18} color="#8b5cf6" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 13, fontFamily: 'Inter_600SemiBold', color: Colors.text }}>Exame de Melhoria de Nota</Text>
                        <Text style={{ fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 1 }}>Art. 36º — Solicitar melhoria em disciplinas com nota 10–16</Text>
                      </View>
                      <Ionicons name="chevron-forward" size={16} color="#8b5cf6" />
                    </TouchableOpacity>
                  );
                })()}

                {/* ── Histórico resumido dos outros anos ─────────────────── */}
                {notasTurmasDisponiveis.length > 1 && (() => {
                  const outros = notasTurmasDisponiveis.filter((t: any) => t.id !== notasTurmaId);
                  return (
                    <View style={{ marginTop: 18 }}>
                      <Text style={{ fontSize: 10, fontFamily: 'Inter_700Bold', color: Colors.textMuted, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 10 }}>
                        Resumo de outros anos
                      </Text>
                      {outros.map((t: any) => {
                        const notasT = alunoNotas.filter((n: any) => n.turmaId === t.id);
                        const nfs = notasT.map((n: any) => n.nf).filter((v: any) => v > 0);
                        const med = nfs.length > 0 ? nfs.reduce((a: number, b: number) => a + b, 0) / nfs.length : null;
                        return (
                          <TouchableOpacity key={t.id}
                            onPress={() => setNotasTurmaId(t.id)}
                            style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: Colors.border, gap: 10 }}>
                            <MaterialCommunityIcons name="school-outline" size={16} color={Colors.textMuted} />
                            <View style={{ flex: 1 }}>
                              <Text style={{ fontSize: 13, fontFamily: 'Inter_600SemiBold', color: Colors.text }}>{t.classe ?? t.nome}</Text>
                              <Text style={{ fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted }}>{t.nome} · {t.anoLetivo} · {notasT.length} registos</Text>
                            </View>
                            {med !== null && (
                              <Text style={{ fontSize: 16, fontFamily: 'Inter_700Bold', color: gradeColor(med) }}>{med.toFixed(1)}</Text>
                            )}
                            <MaterialCommunityIcons name="chevron-right" size={18} color={Colors.textMuted} />
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  );
                })()}
              </>
            )}
          </ScrollView>
        )}

        {/* TAB: FALTAS */}
        {!editing && tab === 'Faltas' && (
          <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 30 }}>
            {/* Botão Nova Justificação */}
            {alunoPresencas.some(p => p.status === 'F') && (
              <TouchableOpacity
                style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.warning + '20', borderRadius: 12, borderWidth: 1, borderColor: Colors.warning + '50', padding: 12, marginTop: 12, marginBottom: 4 }}
                onPress={() => {
                  setJustPresencaIds([]);
                  setJustTexto('');
                  setJustComprovUrl('');
                  setJustComprovNome('');
                  setShowJustModal(true);
                }}
              >
                <MaterialCommunityIcons name="file-document-edit-outline" size={20} color={Colors.warning} />
                <Text style={{ flex: 1, fontSize: 13, fontFamily: 'Inter_600SemiBold', color: Colors.warning }}>
                  Justificar Falta(s)
                </Text>
                <MaterialCommunityIcons name="chevron-right" size={18} color={Colors.warning} />
              </TouchableOpacity>
            )}

            {faltasSummary.length === 0 ? (
              <EmptyState icon="calendar-outline" text="Sem registos de presença para este aluno" />
            ) : (
              <>
                {/* Totals */}
                <View style={s.faltasTotals}>
                  {(['P', 'F', 'J'] as const).map(st => {
                    const total = faltasSummary.reduce((acc, row) => acc + (row[st] ?? 0), 0);
                    const color = st === 'P' ? Colors.success : st === 'F' ? Colors.danger : Colors.warning;
                    const label = st === 'P' ? 'Presenças' : st === 'F' ? 'Faltas' : 'Justificadas';
                    return (
                      <View key={st} style={[s.faltasTotalCard, { borderColor: color + '40', backgroundColor: color + '12' }]}>
                        <Text style={{ fontSize: 24, fontFamily: 'Inter_700Bold', color }}>{total}</Text>
                        <Text style={{ fontSize: 11, fontFamily: 'Inter_500Medium', color: Colors.textSecondary, marginTop: 2 }}>{label}</Text>
                      </View>
                    );
                  })}
                </View>

                {/* Per discipline */}
                <View style={s.notasHeader}>
                  <Text style={[s.notasHeaderCell, { flex: 3 }]}>Disciplina</Text>
                  <Text style={s.notasHeaderCell}>P</Text>
                  <Text style={s.notasHeaderCell}>F</Text>
                  <Text style={s.notasHeaderCell}>J</Text>
                  <Text style={s.notasHeaderCell}>%</Text>
                </View>
                {faltasSummary.map(row => {
                  const pct = row.total > 0 ? Math.round((row.P / row.total) * 100) : 0;
                  return (
                    <View key={row.disciplina} style={s.notasRow}>
                      <Text style={[s.notasCell, { flex: 3, fontFamily: 'Inter_500Medium' }]} numberOfLines={2}>{row.disciplina}</Text>
                      <Text style={[s.notasCell, { color: Colors.success }]}>{row.P}</Text>
                      <Text style={[s.notasCell, { color: Colors.danger }]}>{row.F}</Text>
                      <Text style={[s.notasCell, { color: Colors.warning }]}>{row.J}</Text>
                      <Text style={[s.notasCell, { color: pct >= 75 ? Colors.success : Colors.danger }]}>{pct}%</Text>
                    </View>
                  );
                })}
              </>
            )}

            {/* Pedidos de justificação */}
            {justificacoes.length > 0 && (
              <View style={{ marginTop: 20 }}>
                <Text style={{ fontSize: 10, fontFamily: 'Inter_700Bold', color: Colors.textMuted, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 10 }}>
                  Pedidos de Justificação
                </Text>
                {justLoading && <AppLoader size="small" />}
                {justificacoes.map(j => {
                  const STATUS_INFO: Record<string, { color: string; label: string; icon: string }> = {
                    pendente:   { color: Colors.warning, label: 'Pendente',   icon: 'clock-outline' },
                    aprovada:   { color: Colors.info,    label: 'Aprovada',   icon: 'check-circle-outline' },
                    concluida:  { color: Colors.success, label: 'Concluída',  icon: 'check-all' },
                    rejeitada:  { color: Colors.danger,  label: 'Rejeitada',  icon: 'close-circle-outline' },
                  };
                  const si = STATUS_INFO[j.status] || STATUS_INFO['pendente'];
                  const dt = j.createdAt ? new Date(j.createdAt).toLocaleDateString('pt-PT') : '';
                  return (
                    <View key={j.id} style={{ backgroundColor: Colors.backgroundCard, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, padding: 12, marginBottom: 8, borderLeftWidth: 3, borderLeftColor: si.color }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <MaterialCommunityIcons name={si.icon as any} size={14} color={si.color} />
                          <Text style={{ fontSize: 12, fontFamily: 'Inter_700Bold', color: si.color }}>{si.label}</Text>
                        </View>
                        <Text style={{ fontSize: 11, color: Colors.textMuted }}>{dt}</Text>
                      </View>
                      <Text style={{ fontSize: 13, color: Colors.text, fontFamily: 'Inter_400Regular', marginBottom: 4 }} numberOfLines={2}>{j.justificativa}</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                        <Text style={{ fontSize: 11, color: Colors.textMuted }}>
                          {j.qtdFaltas} falta(s) · {j.tipo === 'gratuita' ? 'Directa' : 'Paga'}
                        </Text>
                        {j.comprovativoNome && (
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                            <MaterialCommunityIcons name="paperclip" size={12} color={Colors.info} />
                            <Text style={{ fontSize: 11, color: Colors.info }} numberOfLines={1}>{j.comprovativoNome}</Text>
                          </View>
                        )}
                      </View>
                      {j.motivoRejeicao && (
                        <Text style={{ fontSize: 11, color: Colors.danger, marginTop: 6, fontFamily: 'Inter_500Medium' }}>
                          Motivo: {j.motivoRejeicao}
                        </Text>
                      )}
                    </View>
                  );
                })}
              </View>
            )}
          </ScrollView>
        )}

        {/* TAB: FINANCEIRO */}
        {!editing && tab === 'Financeiro' && (
          <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 30 }}>
            {/* ── Saldo + Estado de Propinas ─────────────────────────────── */}
            {(() => {
              const anoLetivo = anoSelecionado?.ano || new Date().getFullYear().toString();
              const saldoRow = getSaldoAluno(aluno.id);
              const saldo = Number(saldoRow?.saldo || 0);
              const taxaPropina = taxas.find((t: any) => t.tipo === 'propina' && t.ativo);
              const valorPropina = Number(taxaPropina?.valor || 0);
              const mesesAtraso = getMesesEmAtraso(aluno.id, anoLetivo);
              const multa = calcularMulta(valorPropina, mesesAtraso);
              const totalDevido = mesesAtraso * valorPropina + multa;

              const MESES_LBL: Record<number, string> = {
                1:'Janeiro',2:'Fevereiro',3:'Março',4:'Abril',5:'Maio',6:'Junho',
                7:'Julho',8:'Agosto',9:'Setembro',10:'Outubro',11:'Novembro',12:'Dezembro',
              };
              const mesAtual = new Date().getMonth() + 1;
              const mesesLetivos = [2,3,4,5,6,7,8,9,10,11];
              const pagamentosAluno = pagamentos;
              const mesesPagosSet = new Set(pagamentosAluno.filter((p: any) => p.status === 'pago').map((p: any) => p.mes));
              const mesesPendentesSet = new Set(pagamentosAluno.filter((p: any) => p.status === 'pendente').map((p: any) => p.mes));
              const mesesAtrasoArr = mesesLetivos.filter(m => m <= mesAtual && !mesesPagosSet.has(m) && !mesesPendentesSet.has(m));
              const pagamentoMesAtual = pagamentosAluno.find((p: any) => p.mes === mesAtual && Number(p.ano) === Number(anoLetivo));
              const statusMesAtual: 'pago'|'pendente'|'atraso'|'sem' = pagamentoMesAtual
                ? (pagamentoMesAtual.status === 'pago' ? 'pago' : (mesesAtrasoArr.includes(mesAtual) ? 'atraso' : 'pendente'))
                : (mesesAtrasoArr.includes(mesAtual) ? 'atraso' : 'sem');
              const badge = ({
                pago:     { cor: Colors.success, texto: 'Mês corrente regularizado',       icon: 'checkmark-circle' as const },
                pendente: { cor: Colors.gold,    texto: 'Propina do mês em cobrança',      icon: 'time' as const },
                atraso:   { cor: Colors.danger,  texto: 'Propina do mês em atraso',        icon: 'alert-circle' as const },
                sem:      { cor: Colors.info,    texto: 'Propina do mês ainda não emitida',icon: 'information-circle' as const },
              })[statusMesAtual];
              const diaInicioMulta = Number((multaConfig as any)?.diaInicioMulta || 10);

              return (
                <View style={{ backgroundColor: Colors.backgroundElevated, borderRadius: 14, borderWidth: 1, borderColor: Colors.border, padding: 14, marginTop: 8, marginBottom: 12, gap: 12 }}>
                  {/* Status header */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: `${badge.cor}20`, alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name={badge.icon} size={20} color={badge.cor} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 13, color: badge.cor, fontFamily: 'Inter_700Bold' }}>{badge.texto}</Text>
                      <Text style={{ fontSize: 11, color: Colors.textMuted, fontFamily: 'Inter_400Regular', marginTop: 2 }}>
                        {MESES_LBL[mesAtual]} {anoLetivo} · Limite sem multa: dia {diaInicioMulta}
                      </Text>
                    </View>
                  </View>

                  {/* Saldo + Meses em atraso + Multa */}
                  <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                    <View style={{ flex: 1, minWidth: 110, backgroundColor: Colors.surface, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, padding: 10 }}>
                      <Text style={{ fontSize: 10, color: Colors.textMuted, fontFamily: 'Inter_600SemiBold', textTransform: 'uppercase', letterSpacing: 0.6 }}>Saldo</Text>
                      <Text style={{ fontSize: 16, color: saldo > 0 ? Colors.success : Colors.text, fontFamily: 'Inter_700Bold', marginTop: 4 }}>{formatAOA(saldo)}</Text>
                    </View>
                    <View style={{ flex: 1, minWidth: 110, backgroundColor: mesesAtraso > 0 ? `${Colors.danger}10` : Colors.surface, borderRadius: 10, borderWidth: 1, borderColor: mesesAtraso > 0 ? `${Colors.danger}40` : Colors.border, padding: 10 }}>
                      <Text style={{ fontSize: 10, color: Colors.textMuted, fontFamily: 'Inter_600SemiBold', textTransform: 'uppercase', letterSpacing: 0.6 }}>Meses em atraso</Text>
                      <Text style={{ fontSize: 16, color: mesesAtraso > 0 ? Colors.danger : Colors.text, fontFamily: 'Inter_700Bold', marginTop: 4 }}>{mesesAtraso}</Text>
                    </View>
                    <View style={{ flex: 1, minWidth: 110, backgroundColor: multa > 0 ? `${Colors.gold}10` : Colors.surface, borderRadius: 10, borderWidth: 1, borderColor: multa > 0 ? `${Colors.gold}40` : Colors.border, padding: 10 }}>
                      <Text style={{ fontSize: 10, color: Colors.textMuted, fontFamily: 'Inter_600SemiBold', textTransform: 'uppercase', letterSpacing: 0.6 }}>Multa estimada</Text>
                      <Text style={{ fontSize: 16, color: multa > 0 ? Colors.gold : Colors.text, fontFamily: 'Inter_700Bold', marginTop: 4 }}>{formatAOA(multa)}</Text>
                    </View>
                  </View>

                  {/* Total devido */}
                  {totalDevido > 0 && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: 10 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Ionicons name="warning-outline" size={14} color={Colors.danger} />
                        <Text style={{ fontSize: 11, color: Colors.textMuted, fontFamily: 'Inter_600SemiBold', textTransform: 'uppercase', letterSpacing: 0.6 }}>Total em dívida</Text>
                      </View>
                      <Text style={{ fontSize: 15, color: Colors.danger, fontFamily: 'Inter_700Bold' }}>{formatAOA(totalDevido)}</Text>
                    </View>
                  )}

                  {/* Quick actions */}
                  <View style={{ flexDirection: 'row', gap: 8, borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: 10, flexWrap: 'wrap' }}>
                    <TouchableOpacity
                      onPress={() => router.push({ pathname: '/(main)/boletim-propina', params: { alunoId: aluno.id } } as any)}
                      style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: Colors.success + '18', borderWidth: 1, borderColor: Colors.success + '55', borderRadius: 10, paddingVertical: 10, paddingHorizontal: 14 }}
                    >
                      <Ionicons name="document-text" size={14} color={Colors.success} />
                      <Text style={{ fontSize: 12, color: Colors.success, fontFamily: 'Inter_700Bold' }}>Caderneta</Text>
                    </TouchableOpacity>
                    {Platform.OS === 'web' && (
                      <TouchableOpacity
                        onPress={() => openPdfInTab(`/api/pdf/recibos-aluno/${aluno.id}`)}
                        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: Colors.info + '18', borderWidth: 1, borderColor: Colors.info + '55', borderRadius: 10, paddingVertical: 10, paddingHorizontal: 14 }}
                      >
                        <Ionicons name="receipt" size={14} color={Colors.info} />
                        <Text style={{ fontSize: 12, color: Colors.info, fontFamily: 'Inter_700Bold' }}>Todos os Recibos</Text>
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity
                      onPress={() => router.push(`/extrato-propinas?alunoId=${aluno.id}`)}
                      style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, borderRadius: 10, paddingVertical: 10 }}
                    >
                      <Ionicons name="document-text-outline" size={14} color={Colors.text} />
                      <Text style={{ fontSize: 12, color: Colors.text, fontFamily: 'Inter_600SemiBold' }}>Extrato</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => router.push(`/financeiro?alunoId=${aluno.id}`)}
                      style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: Colors.accent, borderRadius: 10, paddingVertical: 10 }}
                    >
                      <Ionicons name="cash-outline" size={14} color="#fff" />
                      <Text style={{ fontSize: 12, color: '#fff', fontFamily: 'Inter_700Bold' }}>Financeiro</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })()}

            {/* ── Referências Bancárias Pendentes ──────────────────────── */}
            {(() => {
              const rupesAluno = getRUPEsAluno(aluno.id);
              const ativas = rupesAluno.filter((r: any) => r.status === 'ativo');
              if (ativas.length === 0) return null;
              return (
                <View style={{ marginBottom: 14 }}>
                  <Text style={{ fontSize: 12, fontFamily: 'Inter_700Bold', color: Colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.7, marginBottom: 8, marginTop: 4 }}>
                    Referências Bancárias Multicaixa
                  </Text>
                  {ativas.map((r: any) => (
                    <View key={r.id} style={{ backgroundColor: `${Colors.info}0A`, borderRadius: 12, borderWidth: 1.5, borderColor: `${Colors.info}50`, padding: 12, marginBottom: 8, gap: 6 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Text style={{ fontSize: 10, fontFamily: 'Inter_600SemiBold', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                          {r.categoria === 'deposito_saldo' ? 'Recarga de Saldo' : 'Propina Escolar'}
                        </Text>
                        <View style={{ backgroundColor: `${Colors.info}20`, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 }}>
                          <Text style={{ fontSize: 10, fontFamily: 'Inter_700Bold', color: Colors.info }}>● Activa</Text>
                        </View>
                      </View>
                      <Text selectable style={{ fontSize: 16, fontFamily: 'Inter_700Bold', color: Colors.info, letterSpacing: 2 }}>{r.referencia}</Text>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Text style={{ fontSize: 13, fontFamily: 'Inter_700Bold', color: Colors.text }}>{formatAOA(r.valor)}</Text>
                        <Text style={{ fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.warning }}>Válido até {new Date(r.dataValidade).toLocaleDateString('pt-PT')}</Text>
                      </View>
                      <Text style={{ fontSize: 10, fontFamily: 'Inter_400Regular', color: Colors.textMuted }}>
                        Pagável em qualquer ATM Multicaixa ou app Multicaixa Express
                      </Text>
                    </View>
                  ))}
                </View>
              );
            })()}

            {pagamentosLoading ? (
              <View style={{ alignItems: 'center', paddingTop: 60 }}>
                <AppLoader color={Colors.accent} />
                <Text style={{ color: Colors.textMuted, fontFamily: 'Inter_400Regular', marginTop: 12 }}>A carregar pagamentos...</Text>
              </View>
            ) : pagamentos.length === 0 ? (
              <EmptyState icon="card-outline" text="Sem pagamentos registados para este aluno" />
            ) : (
              <>
                {/* Totals */}
                {(() => {
                  const totalPago = pagamentos.filter(p => p.status === 'pago').reduce((a: number, p: any) => a + (p.valor ?? 0), 0);
                  const totalPendente = pagamentos.filter(p => p.status === 'pendente').reduce((a: number, p: any) => a + (p.valor ?? 0), 0);
                  return (
                    <View style={{ flexDirection: 'row', gap: 12, marginBottom: 16, marginTop: 8 }}>
                      <View style={[s.statBox, { borderColor: Colors.success + '40', backgroundColor: Colors.success + '0D' }]}>
                        <Text style={{ fontSize: 10, fontFamily: 'Inter_600SemiBold', color: Colors.textMuted, marginBottom: 5, letterSpacing: 0.6 }}>TOTAL PAGO</Text>
                        <Text style={{ fontSize: 16, fontFamily: 'Inter_700Bold', color: Colors.success }}>{fmtValor(totalPago)}</Text>
                      </View>
                      <View style={[s.statBox, { borderColor: (totalPendente > 0 ? Colors.danger : Colors.textMuted) + '40', backgroundColor: (totalPendente > 0 ? Colors.danger : Colors.textMuted) + '0D' }]}>
                        <Text style={{ fontSize: 10, fontFamily: 'Inter_600SemiBold', color: Colors.textMuted, marginBottom: 5, letterSpacing: 0.6 }}>PENDENTE</Text>
                        <Text style={{ fontSize: 16, fontFamily: 'Inter_700Bold', color: totalPendente > 0 ? Colors.danger : Colors.textMuted }}>{fmtValor(totalPendente)}</Text>
                      </View>
                    </View>
                  );
                })()}

                {pagamentos.map((p: any) => {
                  const statusColor = p.status === 'pago' ? Colors.success : p.status === 'pendente' ? Colors.warning : Colors.textMuted;
                  return (
                    <View key={p.id} style={s.pagRow}>
                      <View style={[s.pagStatusDot, { backgroundColor: statusColor }]} />
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 13, fontFamily: 'Inter_600SemiBold', color: Colors.text }}>{p.descricao ?? p.taxaId ?? 'Pagamento'}</Text>
                        <Text style={{ fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 2 }}>
                          {p.mes ? `Mês ${p.mes}` : ''}{p.trimestre ? ` · T${p.trimestre}` : ''} · {fmtData(p.data)}
                        </Text>
                        {p.referencia && <Text style={{ fontSize: 10, fontFamily: 'Inter_400Regular', color: Colors.textMuted }}>Ref: {p.referencia}</Text>}
                      </View>
                      <View style={{ alignItems: 'flex-end', gap: 6 }}>
                        <Text style={{ fontSize: 14, fontFamily: 'Inter_700Bold', color: Colors.text }}>{fmtValor(p.valor)}</Text>
                        <Text style={{ fontSize: 10, fontFamily: 'Inter_600SemiBold', color: statusColor }}>{(p.status ?? '').toUpperCase()}</Text>
                        {p.status === 'pago' && Platform.OS === 'web' && (
                          <TouchableOpacity
                            onPress={() => openPdfInTab(`/api/pdf/recibo/${p.id}`)}
                            style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.info + '22', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: Colors.info + '55' }}
                          >
                            <Ionicons name="receipt-outline" size={11} color={Colors.info} />
                            <Text style={{ fontSize: 10, fontFamily: 'Inter_600SemiBold', color: Colors.info }}>Recibo</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                  );
                })}
              </>
            )}
          </ScrollView>
        )}

        {/* TAB: ANOTAÇÕES */}
        {!editing && tab === 'Anotações' && (
          <View style={{ flex: 1 }}>
            <View style={s.infoBox}>
              <Ionicons name="lock-closed-outline" size={13} color={Colors.info} />
              <Text style={{ flex: 1, fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.info }}>Visível apenas pela secretaria. Não é partilhado com o aluno.</Text>
            </View>
            <View style={s.anotacaoInput}>
              <TextInput
                style={{ flex: 1, fontSize: 13, fontFamily: 'Inter_400Regular', color: Colors.text, minHeight: 44 }}
                value={novaAnotacao}
                onChangeText={setNovaAnotacao}
                placeholder="Escreva uma anotação interna..."
                placeholderTextColor={Colors.textMuted}
                multiline
              />
              <TouchableOpacity onPress={handleAddAnotacao} disabled={savingAnotacao || !novaAnotacao.trim()} style={[s.sendBtn, { opacity: novaAnotacao.trim() ? 1 : 0.4 }]}>
                {savingAnotacao ? <AppLoader size="small" color="#fff" /> : <Ionicons name="send" size={16} color="#fff" />}
              </TouchableOpacity>
            </View>
            <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 30 }}>
              {anotacoesLoading ? (
                <AppLoader color={Colors.info} style={{ marginTop: 30 }} />
              ) : anotacoes.length === 0 ? (
                <EmptyState icon="document-text-outline" text="Sem anotações registadas" />
              ) : (
                anotacoes.map((a: any) => (
                  <View key={a.id} style={s.anotacaoRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 13, fontFamily: 'Inter_400Regular', color: Colors.text, lineHeight: 20 }}>{a.texto}</Text>
                      <Text style={{ fontSize: 10, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 6 }}>{a.criadoPor} · {fmtData(a.criadoEm)}</Text>
                    </View>
                    <TouchableOpacity onPress={() => handleDeleteAnotacao(a.id)}>
                      <Ionicons name="trash-outline" size={15} color={Colors.danger} />
                    </TouchableOpacity>
                  </View>
                ))
              )}
            </ScrollView>
          </View>
        )}

        {/* TAB: ACESSOS — Histórico de Credenciais */}
        {!editing && tab === 'Histórico' && (
          <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 30 }}>
            <View style={[s.infoBox, { marginTop: 6, marginBottom: 16 }]}>
              <Ionicons name="time-outline" size={14} color={Colors.accent} />
              <Text style={{ flex: 1, fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textSecondary }}>
                Linha cronológica de todos os eventos académicos do aluno: matrícula, mudanças de situação e transferências.
              </Text>
            </View>

            {timelineLoading ? (
              <View style={{ alignItems: 'center', paddingTop: 40 }}>
                <AppLoader color={Colors.accent} />
                <Text style={{ color: Colors.textMuted, fontFamily: 'Inter_400Regular', marginTop: 12, fontSize: 13 }}>A carregar histórico...</Text>
              </View>
            ) : timeline.length === 0 ? (
              <EmptyState icon="time-outline" text="Sem eventos académicos registados" />
            ) : (
              <>
                <Text style={{ fontSize: 10, fontFamily: 'Inter_600SemiBold', color: Colors.textMuted, letterSpacing: 1.1, textTransform: 'uppercase', marginBottom: 14 }}>
                  {timeline.length} {timeline.length === 1 ? 'Evento' : 'Eventos'}
                </Text>
                {timeline.map((ev: any, idx: number) => {
                  const isLast = idx === timeline.length - 1;
                  const dataStr = ev.data
                    ? new Date(ev.data).toLocaleDateString('pt-PT', { day: '2-digit', month: 'short', year: 'numeric' })
                    : '—';
                  const cor = ev.cor || Colors.accent;
                  return (
                    <View key={idx} style={{ flexDirection: 'row', gap: 12 }}>
                      {/* Linha vertical + círculo */}
                      <View style={{ alignItems: 'center', width: 32 }}>
                        <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: cor + '22', borderWidth: 2, borderColor: cor, alignItems: 'center', justifyContent: 'center', zIndex: 1 }}>
                          <Ionicons name={(ev.icon || 'ellipse') as any} size={15} color={cor} />
                        </View>
                        {!isLast && <View style={{ flex: 1, width: 2, backgroundColor: Colors.border, marginTop: 4, marginBottom: 0 }} />}
                      </View>

                      {/* Conteúdo do evento */}
                      <View style={{ flex: 1, paddingBottom: isLast ? 0 : 20, paddingTop: 4 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 2 }}>
                          <Text style={{ fontSize: 13, fontFamily: 'Inter_700Bold', color: Colors.text, flexShrink: 1 }}>{ev.titulo}</Text>
                          {ev.status && (
                            <View style={{ paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, backgroundColor: cor + '18', borderWidth: 1, borderColor: cor + '55' }}>
                              <Text style={{ fontSize: 10, fontFamily: 'Inter_600SemiBold', color: cor, textTransform: 'uppercase' }}>{ev.status}</Text>
                            </View>
                          )}
                        </View>
                        {!!ev.descricao && (
                          <Text style={{ fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textSecondary, marginBottom: 4, lineHeight: 17 }}>{ev.descricao}</Text>
                        )}
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                          <Ionicons name="calendar-outline" size={11} color={Colors.textMuted} />
                          <Text style={{ fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted }}>{dataStr}</Text>
                          {!!ev.registadoPor && (
                            <>
                              <Text style={{ fontSize: 11, color: Colors.textMuted }}> · </Text>
                              <Ionicons name="person-outline" size={11} color={Colors.textMuted} />
                              <Text style={{ fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted }}>{ev.registadoPor}</Text>
                            </>
                          )}
                        </View>
                      </View>
                    </View>
                  );
                })}
              </>
            )}
          </ScrollView>
        )}

        {!editing && tab === 'Acessos' && (
          <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 30 }}>

            {/* Info banner */}
            <View style={[s.infoBox, { marginTop: 6, marginBottom: 12 }]}>
              <MaterialCommunityIcons name="account-key" size={14} color="#F97316" />
              <Text style={{ flex: 1, fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textSecondary }}>
                Registo de todas as vezes que as credenciais de acesso do encarregado foram geradas ou regeneradas.
              </Text>
            </View>

            {/* Quick action to generate */}
            <TouchableOpacity
              onPress={handleVerCredenciais}
              disabled={regenerating}
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#F97316' + '18', borderWidth: 1, borderColor: '#F97316' + '55', borderRadius: 12, paddingVertical: 12, marginBottom: 16, opacity: regenerating ? 0.6 : 1 }}
            >
              {regenerating
                ? <AppLoader size="small" color="#F97316" />
                : <MaterialCommunityIcons name="account-key" size={16} color="#F97316" />
              }
              <Text style={{ fontSize: 13, fontFamily: 'Inter_700Bold', color: '#F97316' }}>
                {regenerating ? 'A gerar...' : 'Gerar / Regenerar Credenciais'}
              </Text>
            </TouchableOpacity>

            {/* History list */}
            {credHistoricoLoading ? (
              <View style={{ alignItems: 'center', paddingTop: 40 }}>
                <AppLoader color="#F97316" />
                <Text style={{ color: Colors.textMuted, fontFamily: 'Inter_400Regular', marginTop: 12, fontSize: 13 }}>A carregar histórico...</Text>
              </View>
            ) : credHistorico.length === 0 ? (
              <EmptyState icon="key-outline" text="Ainda não foram geradas credenciais para este encarregado" />
            ) : (
              <>
                <Text style={{ fontSize: 10, fontFamily: 'Inter_600SemiBold', color: Colors.textMuted, letterSpacing: 1.1, textTransform: 'uppercase', marginBottom: 10 }}>
                  {credHistorico.length} {credHistorico.length === 1 ? 'Evento' : 'Eventos'}
                </Text>
                {credHistorico.map((h: any, idx: number) => {
                  const isGerado = h.acao === 'gerado';
                  const cor = isGerado ? Colors.success : Colors.warning;
                  const icone = isGerado ? 'key' : 'key-variant';
                  const label = isGerado ? 'Credenciais geradas' : 'Credenciais regeneradas';
                  const dataHora = h.geradoEm
                    ? new Date(h.geradoEm).toLocaleString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
                    : '—';
                  return (
                    <View key={h.id ?? idx} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.border }}>
                      {/* Icon col */}
                      <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: cor + '20', alignItems: 'center', justifyContent: 'center', marginTop: 2 }}>
                        <MaterialCommunityIcons name={icone as any} size={18} color={cor} />
                      </View>
                      {/* Text col */}
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <Text style={{ fontSize: 13, fontFamily: 'Inter_700Bold', color: Colors.text }}>{label}</Text>
                          <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, backgroundColor: cor + '20', borderWidth: 1, borderColor: cor + '55' }}>
                            <Text style={{ fontSize: 10, fontFamily: 'Inter_600SemiBold', color: cor, textTransform: 'uppercase' }}>{h.acao}</Text>
                          </View>
                        </View>
                        {h.email ? (
                          <Text style={{ fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.info, marginTop: 3 }}>{h.email}</Text>
                        ) : null}
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 }}>
                          <Ionicons name="person-circle-outline" size={12} color={Colors.textMuted} />
                          <Text style={{ fontSize: 11, fontFamily: 'Inter_500Medium', color: Colors.textMuted }}>{h.geradoPor || 'Secretaria'}</Text>
                          <Text style={{ fontSize: 11, color: Colors.textMuted }}> · </Text>
                          <Ionicons name="time-outline" size={12} color={Colors.textMuted} />
                          <Text style={{ fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted }}>{dataHora}</Text>
                        </View>
                      </View>
                    </View>
                  );
                })}
              </>
            )}
          </ScrollView>
        )}
      </View>

      {/* ── Credenciais modal ─────────────────────────────────────────────── */}
      <Modal visible={!!credenciais} animationType="fade" transparent onRequestClose={() => setCredenciais(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
          <View style={{ backgroundColor: Colors.backgroundElevated, borderRadius: 20, padding: 24, width: '100%', maxWidth: 380, borderWidth: 1, borderColor: Colors.border }}>
            <View style={{ alignItems: 'center', marginBottom: 16 }}>
              <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: Colors.gold + '20', justifyContent: 'center', alignItems: 'center', marginBottom: 10 }}>
                <MaterialCommunityIcons name="account-key" size={28} color={Colors.gold} />
              </View>
              <Text style={{ fontSize: 17, fontFamily: 'Inter_700Bold', color: Colors.text }}>Credenciais Geradas</Text>
            </View>
            {credenciais && (
              <View style={{ backgroundColor: Colors.surface, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, padding: 14, gap: 10 }}>
                <View>
                  <Text style={{ fontSize: 10, fontFamily: 'Inter_600SemiBold', color: Colors.textMuted, letterSpacing: 1 }}>ENCARREGADO</Text>
                  <Text style={{ fontSize: 14, fontFamily: 'Inter_600SemiBold', color: Colors.text, marginTop: 2 }}>{credenciais.nome}</Text>
                </View>
                <View style={{ height: 1, backgroundColor: Colors.border }} />
                <View>
                  <Text style={{ fontSize: 10, fontFamily: 'Inter_600SemiBold', color: Colors.textMuted, letterSpacing: 1 }}>EMAIL</Text>
                  <Text style={{ fontSize: 13, fontFamily: 'Inter_500Medium', color: Colors.info, marginTop: 2 }}>{credenciais.email}</Text>
                </View>
                <View style={{ height: 1, backgroundColor: Colors.border }} />
                <View>
                  <Text style={{ fontSize: 10, fontFamily: 'Inter_600SemiBold', color: Colors.textMuted, letterSpacing: 1 }}>SENHA</Text>
                  <Text style={{ fontSize: 18, fontFamily: 'Inter_700Bold', color: Colors.gold, letterSpacing: 2, marginTop: 2 }}>{credenciais.senha}</Text>
                </View>
              </View>
            )}
            <TouchableOpacity onPress={() => setCredenciais(null)} style={{ marginTop: 18, backgroundColor: Colors.accent, borderRadius: 12, paddingVertical: 13, alignItems: 'center' }}>
              <Text style={{ fontSize: 14, fontFamily: 'Inter_700Bold', color: '#fff' }}>Entendido</Text>
            </TouchableOpacity>
          </View>
        </View>
              </KeyboardAvoidingView>
</Modal>

      {/* ── Modal de Justificação de Faltas ──────────────────────────────── */}
      <Modal visible={showJustModal} animationType="slide" transparent onRequestClose={() => setShowJustModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' }}>
            <View style={{ backgroundColor: Colors.backgroundElevated, borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, borderColor: Colors.border, padding: 22, paddingBottom: insets.bottom + 16, maxHeight: '88%' }}>
              {/* Header */}
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <MaterialCommunityIcons name="file-document-edit-outline" size={24} color={Colors.warning} />
                  <Text style={{ fontSize: 17, fontFamily: 'Inter_700Bold', color: Colors.text }}>Justificar Falta(s)</Text>
                </View>
                <TouchableOpacity onPress={() => setShowJustModal(false)}>
                  <Ionicons name="close" size={22} color={Colors.textMuted} />
                </TouchableOpacity>
              </View>

              <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 420 }}>
                {/* Seleccionar faltas */}
                <Text style={{ fontSize: 11, fontFamily: 'Inter_700Bold', color: Colors.textMuted, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 }}>
                  Seleccionar Faltas
                </Text>
                {alunoPresencas.filter(p => p.status === 'F').length === 0 ? (
                  <Text style={{ fontSize: 13, color: Colors.textMuted, marginBottom: 12 }}>Sem faltas pendentes.</Text>
                ) : (
                  alunoPresencas.filter(p => p.status === 'F').sort((a, b) => (a.data || '').localeCompare(b.data || '')).map(p => {
                    const sel = justPresencaIds.includes(p.id);
                    const dt = p.data ? new Date(p.data).toLocaleDateString('pt-PT') : '';
                    return (
                      <TouchableOpacity
                        key={p.id}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 10, borderWidth: 1, borderColor: sel ? Colors.warning : Colors.border, backgroundColor: sel ? Colors.warning + '12' : Colors.surface, marginBottom: 6 }}
                        onPress={() => setJustPresencaIds(ids => sel ? ids.filter(x => x !== p.id) : [...ids, p.id])}
                      >
                        <MaterialCommunityIcons name={sel ? 'checkbox-marked' : 'checkbox-blank-outline'} size={20} color={sel ? Colors.warning : Colors.textMuted} />
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 13, fontFamily: 'Inter_500Medium', color: Colors.text }}>{p.disciplina}</Text>
                          <Text style={{ fontSize: 11, color: Colors.textMuted }}>{dt}</Text>
                        </View>
                        {sel && <MaterialCommunityIcons name="check-circle" size={16} color={Colors.warning} />}
                      </TouchableOpacity>
                    );
                  })
                )}

                {/* Texto da justificação */}
                <Text style={{ fontSize: 11, fontFamily: 'Inter_700Bold', color: Colors.textMuted, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8, marginTop: 8 }}>
                  Justificação *
                </Text>
                <TextInput
                  style={{ backgroundColor: Colors.surface, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, padding: 12, fontSize: 13, fontFamily: 'Inter_400Regular', color: Colors.text, minHeight: 80, textAlignVertical: 'top', marginBottom: 12 }}
                  placeholder="Descreva o motivo da(s) falta(s)..."
                  placeholderTextColor={Colors.textMuted}
                  multiline
                  value={justTexto}
                  onChangeText={setJustTexto}
                />

                {/* Upload comprovativo */}
                <Text style={{ fontSize: 11, fontFamily: 'Inter_700Bold', color: Colors.textMuted, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 }}>
                  Comprovativo (opcional)
                </Text>
                {justComprovNome ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: Colors.success + '12', borderRadius: 10, borderWidth: 1, borderColor: Colors.success + '40', padding: 10, marginBottom: 12 }}>
                    <MaterialCommunityIcons name="file-check-outline" size={20} color={Colors.success} />
                    <Text style={{ flex: 1, fontSize: 13, color: Colors.success }} numberOfLines={1}>{justComprovNome}</Text>
                    <TouchableOpacity onPress={() => { setJustComprovUrl(''); setJustComprovNome(''); }}>
                      <Ionicons name="close-circle" size={18} color={Colors.danger} />
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: Colors.surface, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, borderStyle: 'dashed', padding: 12, marginBottom: 12 }}
                    onPress={() => {
                      if (Platform.OS === 'web') {
                        if (fileInputRef.current) fileInputRef.current.click();
                      }
                    }}
                    disabled={justUploadLoading}
                  >
                    {justUploadLoading ? (
                      <AppLoader size="small" />
                    ) : (
                      <MaterialCommunityIcons name="paperclip" size={20} color={Colors.info} />
                    )}
                    <Text style={{ fontSize: 13, color: Colors.info, fontFamily: 'Inter_500Medium' }}>
                      {justUploadLoading ? 'A carregar...' : 'Anexar documento / imagem'}
                    </Text>
                  </TouchableOpacity>
                )}

                {/* Web hidden file input */}
                {Platform.OS === 'web' && (
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*,application/pdf,.doc,.docx"
                    style={{ display: 'none' }}
                    onChange={(e: any) => {
                      const f = e.target?.files?.[0];
                      if (f) handleUploadComprovativo(f);
                      e.target.value = '';
                    }}
                  />
                )}
              </ScrollView>

              {/* Botões */}
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
                <TouchableOpacity
                  style={{ flex: 1, paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, alignItems: 'center' }}
                  onPress={() => setShowJustModal(false)}
                >
                  <Text style={{ fontSize: 14, fontFamily: 'Inter_600SemiBold', color: Colors.textSecondary }}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={{ flex: 2, paddingVertical: 14, borderRadius: 12, backgroundColor: justPresencaIds.length === 0 || !justTexto.trim() ? Colors.border : Colors.warning, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 }}
                  onPress={handleSubmitJustificacao}
                  disabled={justSaving || justPresencaIds.length === 0 || !justTexto.trim()}
                >
                  {justSaving ? <AppLoader size="small" color="#fff" /> : <MaterialCommunityIcons name="send" size={16} color="#fff" />}
                  <Text style={{ fontSize: 14, fontFamily: 'Inter_700Bold', color: '#fff' }}>
                    {justSaving ? 'A enviar...' : `Enviar Justificação (${justPresencaIds.length} falta(s))`}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── QR Code modal ─────────────────────────────────────────────────── */}
      <QRCodeModal
        visible={showQr}
        onClose={() => setShowQr(false)}
        data={`SIGA|ALUNO|${aluno.id}|${aluno.numeroMatricula}|${aluno.nome} ${aluno.apelido}`}
        title={`${aluno.nome} ${aluno.apelido}`}
        subtitle={aluno.numeroMatricula}
        schoolName={config?.nomeEscola ?? 'SIGA'}
      />

      {/* ── Imprimir Ficha — selector de trimestre ───────────────────────── */}
      <Modal visible={showFichaModal} animationType="fade" transparent onRequestClose={() => setShowFichaModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
          <View style={{ backgroundColor: Colors.backgroundElevated, borderRadius: 20, padding: 22, width: '100%', maxWidth: 460, borderWidth: 1, borderColor: Colors.border }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <MaterialCommunityIcons name="printer" size={24} color={Colors.accent} />
                <Text style={{ fontSize: 17, fontFamily: 'Inter_700Bold', color: Colors.text }}>Imprimir Ficha</Text>
              </View>
              <TouchableOpacity onPress={() => setShowFichaModal(false)}>
                <Ionicons name="close" size={22} color={Colors.textMuted} />
              </TouchableOpacity>
            </View>
            <Text style={{ fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginBottom: 4 }}>
              {aluno.nome} {aluno.apelido}
            </Text>
            <Text style={{ fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginBottom: 18 }}>
              Escolha o período a imprimir. As fichas trimestrais mostram apenas as notas desse trimestre. A anual mostra os 3 trimestres juntos com a média final (MFD) e a situação Aprovado/Reprovado.
            </Text>

            {([
              { key: '1', label: '1º Trimestre', desc: 'Apenas notas do 1º T (MAC, PG1, PG2, MT, NF)', cor: '#1e40af', icon: 'numeric-1-circle' },
              { key: '2', label: '2º Trimestre', desc: 'Apenas notas do 2º T (MAC, PG1, PG2, MT, NF)', cor: '#0e7490', icon: 'numeric-2-circle' },
              { key: '3', label: '3º Trimestre', desc: 'Apenas notas do 3º T (MAC, PG1, PG2, MT, NF)', cor: '#7c2d12', icon: 'numeric-3-circle' },
              { key: 'anual', label: 'Anual (Completa)', desc: 'Os 3 trimestres + MFD + Situação Aprovado/Reprovado', cor: '#15803d', icon: 'calendar-check' },
            ] as const).map(opt => (
              <TouchableOpacity
                key={opt.key}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.background, marginBottom: 8 }}
                onPress={async () => {
                  setShowFichaModal(false);
                  if (typeof window === 'undefined') return;
                  const tok = (await getAuthToken()) || '';
                  window.open(`/api/alunos/${aluno.id}/ficha?trimestre=${opt.key}&token=${encodeURIComponent(tok)}`, '_blank');
                }}
              >
                <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: opt.cor, alignItems: 'center', justifyContent: 'center' }}>
                  <MaterialCommunityIcons name={opt.icon as any} size={22} color="#fff" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontFamily: 'Inter_700Bold', color: Colors.text }}>{opt.label}</Text>
                  <Text style={{ fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 2 }}>{opt.desc}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
              </TouchableOpacity>
            ))}

            <TouchableOpacity
              style={{ marginTop: 6, paddingVertical: 12, alignItems: 'center', borderRadius: 12, borderWidth: 1, borderColor: Colors.border }}
              onPress={() => setShowFichaModal(false)}
            >
              <Text style={{ fontSize: 13, fontFamily: 'Inter_700Bold', color: Colors.textMuted }}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
              </KeyboardAvoidingView>
</Modal>

      {/* ── Bloqueio de Renovação modal ────────────────────────────────────── */}
      <Modal visible={showBloqueio} animationType="slide" transparent onRequestClose={() => setShowBloqueio(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: Colors.backgroundElevated, borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, borderColor: Colors.border, padding: 22, paddingBottom: insets.bottom + 20 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <Text style={{ fontSize: 16, fontFamily: 'Inter_700Bold', color: Colors.text }}>Bloqueio de Renovação</Text>
              <TouchableOpacity onPress={() => setShowBloqueio(false)}>
                <Ionicons name="close" size={22} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {(aluno as any).bloqueioRenovacao ? (
              <>
                <View style={{ backgroundColor: Colors.danger + '15', borderRadius: 10, borderWidth: 1, borderColor: Colors.danger + '40', padding: 12, marginBottom: 16 }}>
                  <Text style={{ fontSize: 12, fontFamily: 'Inter_600SemiBold', color: Colors.danger }}>
                    Motivo actual: {(aluno as any).motivoBloqueioRenovacao || 'Não especificado'}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={handleToggleBloqueio}
                  disabled={savingBloqueio}
                  style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: Colors.success, borderRadius: 12, paddingVertical: 14 }}
                >
                  {savingBloqueio ? <AppLoader color="#fff" /> : (
                    <>
                      <Ionicons name="lock-open-outline" size={18} color="#fff" />
                      <Text style={{ fontSize: 14, fontFamily: 'Inter_700Bold', color: '#fff' }}>Libertar Renovação</Text>
                    </>
                  )}
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text style={{ fontSize: 13, fontFamily: 'Inter_400Regular', color: Colors.textSecondary, marginBottom: 12 }}>
                  Bloqueie a renovação de matrícula por pendência financeira ou reprovação.
                </Text>
                <Text style={{ fontSize: 11, fontFamily: 'Inter_600SemiBold', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.7, marginBottom: 6 }}>Motivo</Text>
                <TextInput
                  style={{ backgroundColor: Colors.surface, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 12, paddingVertical: 10, fontSize: 13, fontFamily: 'Inter_400Regular', color: Colors.text, marginBottom: 14 }}
                  value={motivoBloqueio}
                  onChangeText={setMotivoBloqueio}
                  placeholder="Ex: Propinas em atraso, reprovação..."
                  placeholderTextColor={Colors.textMuted}
                  returnKeyType="done"
                  onSubmitEditing={handleToggleBloqueio}
                />
                <TouchableOpacity
                  onPress={handleToggleBloqueio}
                  disabled={savingBloqueio}
                  style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: Colors.danger, borderRadius: 12, paddingVertical: 14 }}
                >
                  {savingBloqueio ? <AppLoader color="#fff" /> : (
                    <>
                      <Ionicons name="lock-closed-outline" size={18} color="#fff" />
                      <Text style={{ fontSize: 14, fontFamily: 'Inter_700Bold', color: '#fff' }}>Bloquear Renovação</Text>
                    </>
                  )}
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
              </KeyboardAvoidingView>
</Modal>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────
function ActionChip({ icon, label, color, onPress, isMaterial, disabled }: {
  icon: string; label: string; color: string; onPress: () => void; isMaterial?: boolean; disabled?: boolean;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: color + '50', backgroundColor: color + '15', opacity: disabled ? 0.5 : 1 }}
    >
      {isMaterial
        ? <MaterialCommunityIcons name={icon as any} size={15} color={color} />
        : <Ionicons name={icon as any} size={15} color={color} />}
      <Text style={{ fontSize: 12, fontFamily: 'Inter_600SemiBold', color }}>{label}</Text>
    </TouchableOpacity>
  );
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={s.section}>
      <Text style={s.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function InfoRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <View style={[s.infoRow, last && { borderBottomWidth: 0 }]}>
      <Text style={s.infoLabel}>{label}</Text>
      <Text style={s.infoValue}>{value || '—'}</Text>
    </View>
  );
}

function StatusRow({ label, value, danger, last }: { label: string; value: boolean; danger?: boolean; last?: boolean }) {
  const activeColor = danger ? Colors.danger : Colors.success;
  return (
    <View style={[s.infoRow, last && { borderBottomWidth: 0 }]}>
      <Text style={s.infoLabel}>{label}</Text>
      <View style={[s.statusPill, { backgroundColor: (value ? activeColor : Colors.textMuted) + '18', borderColor: (value ? activeColor : Colors.textMuted) + '40' }]}>
        <Text style={{ fontSize: 11, fontFamily: 'Inter_600SemiBold', color: value ? activeColor : Colors.textMuted }}>{value ? 'Sim' : 'Não'}</Text>
      </View>
    </View>
  );
}

function GradeCell({ value, bold }: { value: number | null; bold?: boolean }) {
  if (value === null || value === undefined) return <Text style={s.notasCell}>—</Text>;
  return (
    <Text style={[s.notasCell, { color: gradeColor(value), fontFamily: bold ? 'Inter_700Bold' : 'Inter_600SemiBold' }]}>{value}</Text>
  );
}

function MacCell({ value }: { value: number | null }) {
  if (value === null || value === undefined || value <= 0) {
    return <Text style={[s.notasCell, s.notasMacCell, { color: Colors.textMuted }]}>—</Text>;
  }
  return (
    <Text style={[s.notasCell, s.notasMacCell, { color: Colors.textMuted }]}>{Math.round(value * 10) / 10}</Text>
  );
}

function NptCell({ value }: { value: number | null }) {
  if (value === null || value === undefined || value <= 0) {
    return <Text style={[s.notasCell, s.notasMacCell, { color: Colors.textMuted }]}>—</Text>;
  }
  return (
    <Text style={[s.notasCell, s.notasMacCell, { color: Colors.info }]}>{Math.round(value * 10) / 10}</Text>
  );
}

function EmptyState({ icon, text }: { icon: string; text: string }) {
  return (
    <View style={{ alignItems: 'center', paddingTop: 60, gap: 12 }}>
      <Ionicons name={icon as any} size={44} color={Colors.textMuted} />
      <Text style={{ fontSize: 13, fontFamily: 'Inter_400Regular', color: Colors.textMuted, textAlign: 'center' }}>{text}</Text>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },

  // Header
  header: {},
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, paddingVertical: 8 },
  avatarSm: { width: 30, height: 30, borderRadius: 9, justifyContent: 'center', alignItems: 'center' },
  avatarSmText: { fontSize: 13, fontFamily: 'Inter_700Bold' },

  // Top bar
  topBar: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.border },
  backBtn: { width: 44, height: 44, borderRadius: 10, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.surface },
  topTitle: { fontSize: 14, fontFamily: 'Inter_700Bold', color: Colors.text },
  topSub: { fontSize: 10, fontFamily: 'Inter_400Regular', color: Colors.textMuted },
  editBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: Colors.accent + '50', backgroundColor: Colors.accent + '12' },
  editBtnText: { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: Colors.accent },

  // Hero
  hero: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: Colors.border },
  avatar: { width: 60, height: 60, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  avatarText: { fontSize: 22, fontFamily: 'Inter_700Bold' },
  heroName: { fontSize: 16, fontFamily: 'Inter_700Bold', color: Colors.text },
  heroSub: { fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 2 },
  badgeRow: { flexDirection: 'row', gap: 4, flexWrap: 'wrap' },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 20, borderWidth: 1 },
  badgeGreen: { backgroundColor: Colors.success + '15', borderColor: Colors.success + '40' },
  badgeRed: { backgroundColor: Colors.danger + '15', borderColor: Colors.danger + '40' },
  badgeText: { fontSize: 9, fontFamily: 'Inter_600SemiBold' },
  credBtn: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.gold + '15', borderWidth: 1, borderColor: Colors.gold + '30' },

  // Tab bar — flat underline style
  tabBar: { borderBottomWidth: 1, borderBottomColor: Colors.border },
  tabBarContent: { flexDirection: 'row' },
  tabBtn: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 0, alignItems: 'center', position: 'relative', minWidth: 75 },
  tabText: { fontSize: 12, fontFamily: 'Inter_500Medium', color: Colors.textMuted, paddingBottom: 8 },
  tabTextActive: { color: Colors.accent, fontFamily: 'Inter_700Bold' },
  tabUnderline: { height: 2, borderRadius: 2, backgroundColor: Colors.accent, width: '100%', position: 'absolute', bottom: 0, left: 0 },

  // Flat sections (replaced cards)
  section: { marginTop: 20 },
  sectionTitle: { fontSize: 10, fontFamily: 'Inter_700Bold', color: Colors.textMuted, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 2, paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: Colors.border },
  infoRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: Colors.border },
  infoLabel: { width: 150, fontSize: 12, fontFamily: 'Inter_500Medium', color: Colors.textMuted },
  infoValue: { flex: 1, fontSize: 13, fontFamily: 'Inter_500Medium', color: Colors.text },
  statusPill: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20, borderWidth: 1 },

  // Kept for backward compat (used by anotações infoBox)
  card: { backgroundColor: Colors.backgroundCard, borderRadius: 14, borderWidth: 1, borderColor: Colors.border, padding: 14, marginTop: 14 },
  cardTitle: { fontSize: 10, fontFamily: 'Inter_700Bold', color: Colors.textMuted, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 10 },

  // Notas
  notasHeader: { flexDirection: 'row', paddingVertical: 8, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: Colors.border, marginTop: 8 },
  notasHeaderCell: { flex: 1, fontSize: 10, fontFamily: 'Inter_700Bold', color: Colors.textMuted, textAlign: 'center', letterSpacing: 0.6 },
  notasRow: { flexDirection: 'row', paddingVertical: 12, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: Colors.border },
  notasCell: { flex: 1, fontSize: 13, fontFamily: 'Inter_400Regular', color: Colors.text, textAlign: 'center' },
  notasMacCell: { flex: 0.8, fontSize: 11 },

  // Faltas
  faltasTotals: { flexDirection: 'row', gap: 10, marginTop: 12, marginBottom: 4 },
  faltasTotalCard: { flex: 1, borderRadius: 12, borderWidth: 1, padding: 14, alignItems: 'center' },

  // Financeiro
  statBox: { flex: 1, borderRadius: 10, borderWidth: 1, padding: 14, alignItems: 'center' },
  pagRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.border },
  pagStatusDot: { width: 7, height: 7, borderRadius: 4 },

  // Anotações
  anotacaoRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.border },
  anotacaoInput: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, backgroundColor: Colors.backgroundCard, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, padding: 10, marginVertical: 12 },
  sendBtn: { width: 36, height: 36, borderRadius: 10, backgroundColor: Colors.info, justifyContent: 'center', alignItems: 'center' },
  infoBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.info + '12', borderRadius: 10, borderWidth: 1, borderColor: Colors.info + '30', padding: 10, marginTop: 12 },

  // Misc
  dangerBox: { flexDirection: 'row', gap: 10, backgroundColor: Colors.danger + '12', borderRadius: 12, borderWidth: 1, borderColor: Colors.danger + '35', padding: 12, marginTop: 14 },
});
