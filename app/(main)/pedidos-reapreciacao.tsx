/**
 * Art. 38º — Decreto Executivo nº 04/2026
 * Pedido de Reapreciação de Notas
 * © Queta Tech, Lda. — Eng. Osvaldo Fernando Muondo Queta
 */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  FlatList, Modal, Platform, RefreshControl, ScrollView,
  StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import AppLoader from '@/components/AppLoader';
import { SkeletonList } from '@/components/Skeleton';
import TopBar from '@/components/TopBar';
import RequiredMark from '@/components/RequiredMark';
import { Colors } from '@/constants/colors';
import { api } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useData } from '@/context/DataContext';
import { useAnoAcademico } from '@/context/AnoAcademicoContext';
import { useConfig } from '@/context/ConfigContext';
import { webAlert } from '@/utils/webAlert';
import { HScrollTabBar } from '@/components/HScrollTabBar';
import { useTabMemory } from '@/hooks/useTabMemory';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PedidoReapreciacao {
  id: string;
  alunoId: string;
  alunoNome: string;
  turmaId: string;
  turmaNome: string;
  disciplina: string;
  anoLetivo: string;
  trimestre: number;
  tipoAvaliacao: string;
  notaOriginal?: number;
  motivo: string;
  status: string;
  deadlineAt?: string;
  comissaoMembros: ComissaoMembro[];
  decisao?: string;
  notaFinal?: number;
  fundamentoDecisao?: string;
  decididoEm?: string;
  decididoPor?: string;
  solicitadoPor: string;
  createdAt: string;
  // Joined
  nomeAlunoRef?: string;
  apelidoAlunoRef?: string;
  nomeTurmaRef?: string;
  classeRef?: string;
}

interface ComissaoMembro {
  nome: string;
  cargo: string;
  email?: string;
}

interface Stats {
  total: number;
  pendentes: number;
  emAnalise: number;
  deferidos: number;
  indeferidos: number;
}

const TABS = [
  { key: 'pendentes',  label: 'Pendentes',   icon: 'clock-outline'        },
  { key: 'em_analise', label: 'Em Análise',  icon: 'magnify'              },
  { key: 'decididos',  label: 'Decididos',   icon: 'check-decagram'       },
  { key: 'todos',      label: 'Todos',       icon: 'format-list-bulleted' },
] as const;
type TabKey = typeof TABS[number]['key'];

const STATUS_LABELS: Record<string, string> = {
  pendente: 'Pendente', em_analise: 'Em Análise',
  deferido: 'Deferido', indeferido: 'Indeferido', arquivado: 'Arquivado',
};
const STATUS_COLORS: Record<string, string> = {
  pendente: Colors.warning, em_analise: '#7c3aed',
  deferido: Colors.success, indeferido: Colors.danger, arquivado: Colors.textMuted,
};
const TIPO_AVAL_LABELS: Record<string, string> = {
  mini_pauta: 'Mini-Pauta', exame: 'Exame', teste: 'Teste',
  prova_global: 'Prova Global', trabalho: 'Trabalho',
};

function fmtDate(s?: string | null) {
  if (!s) return '—';
  try { return new Date(s).toLocaleDateString('pt-AO', { day: '2-digit', month: 'short', year: 'numeric' }); }
  catch { return s; }
}
function fmtDatetime(s?: string | null) {
  if (!s) return '—';
  try { return new Date(s).toLocaleString('pt-AO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }); }
  catch { return s; }
}

// ─── ModalShell ───────────────────────────────────────────────────────────────

function ModalShell({ title, subtitle, icon, iconColor, onClose, children }: {
  title: string; subtitle?: string; icon: string; iconColor: string;
  onClose: () => void; children: React.ReactNode;
}) {
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.overlay}>
        <View style={s.modalBox}>
          <View style={[s.modalHeader, { borderLeftColor: iconColor }]}>
            <View style={{ flex: 1 }}>
              <Text style={s.modalTitle}>{title}</Text>
              {subtitle && <Text style={s.modalSub}>{subtitle}</Text>}
            </View>
            <TouchableOpacity onPress={onClose} style={s.closeBtn}>
              <Ionicons name="close" size={22} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>
          {children}
        </View>
      </View>
    </Modal>
  );
}

// ─── Card de pedido ───────────────────────────────────────────────────────────

function PedidoCard({ pedido, onPress, isAdmin }: {
  pedido: PedidoReapreciacao; onPress: () => void; isAdmin: boolean;
}) {
  const statusColor = STATUS_COLORS[pedido.status] ?? Colors.textMuted;
  const prazoExpired = pedido.deadlineAt && new Date(pedido.deadlineAt) < new Date() && pedido.status === 'pendente';
  return (
    <TouchableOpacity onPress={onPress} style={s.card} activeOpacity={0.8}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
        <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: statusColor + '22',
          alignItems: 'center', justifyContent: 'center' }}>
          <MaterialCommunityIcons
            name={pedido.status === 'deferido' ? 'check-circle-outline' : pedido.status === 'indeferido' ? 'close-circle-outline' : 'clock-outline'}
            size={20} color={statusColor} />
        </View>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <Text style={s.cardTitle} numberOfLines={1}>
              {pedido.alunoNome || `${pedido.nomeAlunoRef ?? ''} ${pedido.apelidoAlunoRef ?? ''}`.trim()}
            </Text>
            <View style={[s.badge, { backgroundColor: statusColor + '22' }]}>
              <Text style={[s.badgeText, { color: statusColor }]}>{STATUS_LABELS[pedido.status] ?? pedido.status}</Text>
            </View>
          </View>
          <Text style={s.cardSub} numberOfLines={1}>{pedido.disciplina} · {TIPO_AVAL_LABELS[pedido.tipoAvaliacao] ?? pedido.tipoAvaliacao} · T{pedido.trimestre}</Text>
          {isAdmin && (
            <Text style={s.cardMeta}>Turma: {pedido.turmaNome || pedido.nomeTurmaRef || '—'}</Text>
          )}
          <Text style={s.cardMeta} numberOfLines={2}>{pedido.motivo}</Text>
        </View>
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: Colors.border + '33' }}>
        <Text style={s.cardMeta}>Solicitado em {fmtDate(pedido.createdAt)}</Text>
        {pedido.deadlineAt && pedido.status === 'pendente' && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <MaterialCommunityIcons name="timer-outline" size={12} color={prazoExpired ? Colors.danger : Colors.warning} />
            <Text style={{ fontSize: 10, color: prazoExpired ? Colors.danger : Colors.warning, fontWeight: '600' }}>
              {prazoExpired ? 'Prazo esgotado' : `Prazo: ${fmtDatetime(pedido.deadlineAt)}`}
            </Text>
          </View>
        )}
        {pedido.notaFinal != null && (
          <Text style={{ fontSize: 11, color: Colors.success, fontWeight: '700' }}>
            Nota rectificada: {pedido.notaFinal}v
          </Text>
        )}
      </View>
    </TouchableOpacity>
  );
}

// ─── Modal: Novo Pedido ───────────────────────────────────────────────────────

function NovoPedidoModal({ anoLetivo, onClose, onSaved }: {
  anoLetivo: string; onClose: () => void; onSaved: () => void;
}) {
  const { alunos, turmas } = useData();
  const [turmaId, setTurmaId] = useState('');
  const [alunoId, setAlunoId] = useState('');
  const [disciplina, setDisciplina] = useState('');
  const [trimestre, setTrimestre] = useState(1);
  const [tipoAvaliacao, setTipoAvaliacao] = useState('mini_pauta');
  const [notaOriginal, setNotaOriginal] = useState('');
  const [motivo, setMotivo] = useState('');
  const [saving, setSaving] = useState(false);
  const [disciplinas, setDisciplinas] = useState<string[]>([]);

  const turmaAlunos = useMemo(() =>
    (alunos as any[]).filter((a: any) => a.turmaId === turmaId),
    [alunos, turmaId]
  );

  useEffect(() => {
    if (!turmaId) { setDisciplinas([]); return; }
    api.get<{ nome: string }[]>(`/api/turmas/${turmaId}/disciplinas`)
      .then(rows => setDisciplinas(rows.map(r => r.nome)))
      .catch(() => setDisciplinas([]));
  }, [turmaId]);

  const save = async () => {
    if (!alunoId || !disciplina || !motivo.trim()) {
      return webAlert('Campos obrigatórios', 'Seleccione o aluno, a disciplina e escreva o motivo.');
    }
    if (motivo.trim().length < 10) {
      return webAlert('Motivo insuficiente', 'O motivo deve ter pelo menos 10 caracteres (Art. 38º §2).');
    }
    setSaving(true);
    try {
      const turma = (turmas as any[]).find((t: any) => t.id === turmaId);
      const aluno = (alunos as any[]).find((a: any) => a.id === alunoId);
      await api.post('/api/pedidos-reapreciacao', {
        alunoId, turmaId, disciplina, anoLetivo, trimestre, tipoAvaliacao,
        notaOriginal: notaOriginal ? parseFloat(notaOriginal) : undefined,
        motivo: motivo.trim(),
        alunoNome: aluno ? `${aluno.nome} ${aluno.apelido}`.trim() : '',
        turmaNome: turma?.nome ?? '',
      });
      onSaved();
    } catch (e) { webAlert('Erro', (e as Error).message); }
    finally { setSaving(false); }
  };

  return (
    <ModalShell title="Novo Pedido de Reapreciação" subtitle="Art. 38º — Decreto Executivo 04/2026"
      icon="file-document-edit-outline" iconColor={Colors.primary} onClose={onClose}>
      <ScrollView style={{ padding: 16 }} showsVerticalScrollIndicator={false}>
        <Text style={s.label}>Turma<RequiredMark /></Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
          {(turmas as any[]).map((t: any) => (
            <TouchableOpacity key={t.id} onPress={() => { setTurmaId(t.id); setAlunoId(''); setDisciplina(''); }}
              style={[s.chip, turmaId === t.id && s.chipActive]}>
              <Text style={[s.chipText, turmaId === t.id && { color: Colors.gold }]}>{t.nome}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={s.label}>Aluno<RequiredMark /></Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
          {turmaAlunos.length === 0 && (
            <Text style={{ fontSize: 12, color: Colors.textMuted, fontStyle: 'italic' }}>
              {turmaId ? 'Nenhum aluno nesta turma.' : 'Seleccione a turma primeiro.'}
            </Text>
          )}
          {turmaAlunos.slice(0, 30).map((a: any) => (
            <TouchableOpacity key={a.id} onPress={() => setAlunoId(a.id)}
              style={[s.chip, alunoId === a.id && s.chipActive]}>
              <Text style={[s.chipText, alunoId === a.id && { color: Colors.gold }]}>{a.nome} {a.apelido}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={s.label}>Disciplina<RequiredMark /></Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
          {disciplinas.map(d => (
            <TouchableOpacity key={d} onPress={() => setDisciplina(d)}
              style={[s.chip, disciplina === d && s.chipActive]}>
              <Text style={[s.chipText, disciplina === d && { color: Colors.gold }]}>{d}</Text>
            </TouchableOpacity>
          ))}
          {turmaId && disciplinas.length === 0 && (
            <Text style={{ fontSize: 12, color: Colors.textMuted, fontStyle: 'italic' }}>A carregar disciplinas...</Text>
          )}
        </View>

        <Text style={s.label}>Trimestre<RequiredMark /></Text>
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
          {[1, 2, 3].map(t => (
            <TouchableOpacity key={t} onPress={() => setTrimestre(t)}
              style={[s.chip, trimestre === t && s.chipActive, { flex: 1, justifyContent: 'center' }]}>
              <Text style={[s.chipText, trimestre === t && { color: Colors.gold }]}>{t}º Trimestre</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={s.label}>Tipo de Avaliação</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
          {Object.entries(TIPO_AVAL_LABELS).map(([k, v]) => (
            <TouchableOpacity key={k} onPress={() => setTipoAvaliacao(k)}
              style={[s.chip, tipoAvaliacao === k && s.chipActive]}>
              <Text style={[s.chipText, tipoAvaliacao === k && { color: Colors.gold }]}>{v}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={s.label}>Nota Original (opcional)</Text>
        <TextInput style={[s.input, { marginBottom: 12 }]}
          value={notaOriginal} onChangeText={setNotaOriginal}
          keyboardType="decimal-pad" placeholder="ex: 7.5"
          placeholderTextColor={Colors.textMuted} />

        <Text style={s.label}>Motivo / Fundamentação<RequiredMark /></Text>
        <TextInput style={[s.input, { height: 90, textAlignVertical: 'top', paddingTop: 8, marginBottom: 16 }]}
          value={motivo} onChangeText={setMotivo} multiline
          placeholder="Descreva detalhadamente o motivo do pedido (art. 38º §2)..."
          placeholderTextColor={Colors.textMuted} />

        <View style={{ backgroundColor: Colors.warning + '15', borderRadius: 10, padding: 12, marginBottom: 16,
          flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
          <MaterialCommunityIcons name="information-outline" size={16} color={Colors.warning} />
          <Text style={{ fontSize: 12, color: Colors.warning, flex: 1, lineHeight: 18 }}>
            O pedido de reapreciação deve ser submetido dentro do prazo estabelecido pela direcção após a divulgação das notas.
            A comissão decidirá no prazo legal (Art. 38º).
          </Text>
        </View>

        <TouchableOpacity style={[s.saveBtn, saving && { opacity: 0.6 }]} onPress={save} disabled={saving}>
          {saving ? <AppLoader color="#fff" /> : (
            <>
              <MaterialCommunityIcons name="send" size={18} color="#fff" />
              <Text style={s.saveBtnText}>Submeter Pedido</Text>
            </>
          )}
        </TouchableOpacity>
        <View style={{ height: 16 }} />
      </ScrollView>
    </ModalShell>
  );
}

// ─── Modal: Constituir Comissão ───────────────────────────────────────────────

function ComissaoModal({ pedido, onClose, onSaved }: {
  pedido: PedidoReapreciacao; onClose: () => void; onSaved: () => void;
}) {
  const [membros, setMembros] = useState<ComissaoMembro[]>(
    pedido.comissaoMembros?.length ? pedido.comissaoMembros : [
      { nome: '', cargo: 'Presidente', email: '' },
      { nome: '', cargo: 'Vogal', email: '' },
      { nome: '', cargo: 'Secretário', email: '' },
    ]
  );
  const [saving, setSaving] = useState(false);

  const updateMembro = (idx: number, field: keyof ComissaoMembro, val: string) => {
    setMembros(prev => prev.map((m, i) => i === idx ? { ...m, [field]: val } : m));
  };

  const save = async () => {
    const validos = membros.filter(m => m.nome.trim());
    if (validos.length < 1) return webAlert('Erro', 'Adicione pelo menos um membro à comissão.');
    setSaving(true);
    try {
      await api.put(`/api/pedidos-reapreciacao/${pedido.id}`, { comissaoMembros: validos });
      onSaved();
    } catch (e) { webAlert('Erro', (e as Error).message); }
    finally { setSaving(false); }
  };

  return (
    <ModalShell title="Constituir Comissão" subtitle="Art. 38º §3 — Comissão de Reapreciação"
      icon="account-group-outline" iconColor="#7c3aed" onClose={onClose}>
      <ScrollView style={{ padding: 16 }} showsVerticalScrollIndicator={false}>
        <View style={{ backgroundColor: '#7c3aed11', borderRadius: 10, padding: 12, marginBottom: 16 }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: '#7c3aed', marginBottom: 4 }}>
            Pedido: {pedido.disciplina} · T{pedido.trimestre}
          </Text>
          <Text style={{ fontSize: 12, color: Colors.textSecondary }}>{pedido.alunoNome || `${pedido.nomeAlunoRef ?? ''} ${pedido.apelidoAlunoRef ?? ''}`}</Text>
        </View>

        {membros.map((m, idx) => (
          <View key={idx} style={{ marginBottom: 14 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: '#7c3aed22',
                alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: '#7c3aed' }}>{idx + 1}</Text>
              </View>
              <TextInput style={[s.input, { flex: 1, marginBottom: 0 }]}
                value={m.cargo} onChangeText={v => updateMembro(idx, 'cargo', v)}
                placeholder="Cargo (Presidente, Vogal...)" placeholderTextColor={Colors.textMuted} />
            </View>
            <TextInput style={[s.input, { marginBottom: 6 }]}
              value={m.nome} onChangeText={v => updateMembro(idx, 'nome', v)}
              placeholder="Nome completo do membro*" placeholderTextColor={Colors.textMuted} />
            <TextInput style={s.input}
              value={m.email ?? ''} onChangeText={v => updateMembro(idx, 'email', v)}
              placeholder="Email (opcional)" placeholderTextColor={Colors.textMuted}
              keyboardType="email-address" autoCapitalize="none" />
          </View>
        ))}

        <TouchableOpacity onPress={() => setMembros(prev => [...prev, { nome: '', cargo: 'Vogal', email: '' }])}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, marginBottom: 16 }}>
          <Ionicons name="add-circle-outline" size={18} color={Colors.primary} />
          <Text style={{ fontSize: 13, color: Colors.primary, fontWeight: '600' }}>Adicionar Membro</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[s.saveBtn, { backgroundColor: '#7c3aed' }, saving && { opacity: 0.6 }]}
          onPress={save} disabled={saving}>
          {saving ? <AppLoader color="#fff" /> : (
            <>
              <MaterialCommunityIcons name="account-check" size={18} color="#fff" />
              <Text style={s.saveBtnText}>Constituir Comissão</Text>
            </>
          )}
        </TouchableOpacity>
        <View style={{ height: 16 }} />
      </ScrollView>
    </ModalShell>
  );
}

// ─── Modal: Decisão ───────────────────────────────────────────────────────────

function DecisaoModal({ pedido, onClose, onSaved }: {
  pedido: PedidoReapreciacao; onClose: () => void; onSaved: () => void;
}) {
  const [decisao, setDecisao] = useState<'deferido' | 'deferido_parcial' | 'indeferido'>('deferido');
  const [notaFinal, setNotaFinal] = useState(String(pedido.notaOriginal ?? ''));
  const [fundamentoDecisao, setFundamentoDecisao] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!fundamentoDecisao.trim()) return webAlert('Erro', 'A fundamentação da decisão é obrigatória (Art. 38º §5).');
    if ((decisao === 'deferido' || decisao === 'deferido_parcial') && !notaFinal) {
      return webAlert('Erro', 'Introduza a nota final rectificada.');
    }
    setSaving(true);
    try {
      await api.put(`/api/pedidos-reapreciacao/${pedido.id}`, {
        decisao,
        notaFinal: notaFinal ? parseFloat(notaFinal) : null,
        fundamentoDecisao: fundamentoDecisao.trim(),
      });
      onSaved();
    } catch (e) { webAlert('Erro', (e as Error).message); }
    finally { setSaving(false); }
  };

  const opcoesDecisao = [
    { key: 'deferido',         label: 'Deferido',          icon: 'check-circle-outline',  cor: Colors.success },
    { key: 'deferido_parcial', label: 'Parcialmente Deferido', icon: 'check-circle-outline', cor: Colors.warning },
    { key: 'indeferido',       label: 'Indeferido',         icon: 'close-circle-outline',  cor: Colors.danger  },
  ] as const;

  return (
    <ModalShell title="Registar Decisão" subtitle="Art. 38º §5 — Decisão da Comissão"
      icon="gavel" iconColor={Colors.gold} onClose={onClose}>
      <ScrollView style={{ padding: 16 }} showsVerticalScrollIndicator={false}>
        <View style={{ backgroundColor: Colors.backgroundElevated, borderRadius: 10, padding: 12, marginBottom: 16 }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: Colors.text }}>
            {pedido.alunoNome || `${pedido.nomeAlunoRef ?? ''} ${pedido.apelidoAlunoRef ?? ''}`}
          </Text>
          <Text style={{ fontSize: 12, color: Colors.textSecondary }}>
            {pedido.disciplina} · {TIPO_AVAL_LABELS[pedido.tipoAvaliacao] ?? pedido.tipoAvaliacao} · T{pedido.trimestre}
          </Text>
          {pedido.notaOriginal != null && (
            <Text style={{ fontSize: 12, color: Colors.textMuted, marginTop: 2 }}>Nota original: {pedido.notaOriginal}v</Text>
          )}
        </View>

        <Text style={s.label}>Decisão<RequiredMark /></Text>
        <View style={{ gap: 8, marginBottom: 16 }}>
          {opcoesDecisao.map(op => {
            const ativo = decisao === op.key;
            return (
              <TouchableOpacity key={op.key} onPress={() => setDecisao(op.key as any)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 10, padding: 12,
                  borderWidth: 1.5, borderColor: ativo ? op.cor : Colors.border,
                  backgroundColor: ativo ? op.cor + '15' : Colors.backgroundCard }}>
                <MaterialCommunityIcons name={op.icon} size={22} color={ativo ? op.cor : Colors.textMuted} />
                <Text style={{ fontSize: 14, fontWeight: '700', color: ativo ? op.cor : Colors.textSecondary, flex: 1 }}>{op.label}</Text>
                <MaterialCommunityIcons name={ativo ? 'radiobox-marked' : 'radiobox-blank'} size={20} color={ativo ? op.cor : Colors.border} />
              </TouchableOpacity>
            );
          })}
        </View>

        {(decisao === 'deferido' || decisao === 'deferido_parcial') && (
          <>
            <Text style={s.label}>Nota Final Rectificada<RequiredMark /></Text>
            <TextInput style={[s.input, { marginBottom: 12 }]}
              value={notaFinal} onChangeText={setNotaFinal}
              keyboardType="decimal-pad" placeholder="ex: 10.5"
              placeholderTextColor={Colors.textMuted} />
          </>
        )}

        <Text style={s.label}>Fundamentação da Decisão<RequiredMark /></Text>
        <TextInput style={[s.input, { height: 90, textAlignVertical: 'top', paddingTop: 8, marginBottom: 16 }]}
          value={fundamentoDecisao} onChangeText={setFundamentoDecisao} multiline
          placeholder="Justifique detalhadamente a decisão tomada pela comissão (Art. 38º §5)..."
          placeholderTextColor={Colors.textMuted} />

        <TouchableOpacity style={[s.saveBtn, { backgroundColor: Colors.gold }, saving && { opacity: 0.6 }]}
          onPress={save} disabled={saving}>
          {saving ? <AppLoader color="#fff" /> : (
            <>
              <MaterialCommunityIcons name="gavel" size={18} color="#fff" />
              <Text style={s.saveBtnText}>Registar Decisão</Text>
            </>
          )}
        </TouchableOpacity>
        <View style={{ height: 16 }} />
      </ScrollView>
    </ModalShell>
  );
}

// ─── Modal: Detalhe do Pedido ─────────────────────────────────────────────────

function DetalhePedidoModal({ pedido, isAdmin, onClose, onRefresh }: {
  pedido: PedidoReapreciacao; isAdmin: boolean; onClose: () => void; onRefresh: () => void;
}) {
  const [showComissao, setShowComissao] = useState(false);
  const [showDecisao, setShowDecisao] = useState(false);
  const statusColor = STATUS_COLORS[pedido.status] ?? Colors.textMuted;

  const handleComissaoSaved = () => { setShowComissao(false); onRefresh(); };
  const handleDecisaoSaved = () => { setShowDecisao(false); onRefresh(); onClose(); };

  const alunoNome = pedido.alunoNome || `${pedido.nomeAlunoRef ?? ''} ${pedido.apelidoAlunoRef ?? ''}`.trim();

  return (
    <ModalShell title="Detalhe do Pedido" subtitle="Art. 38º — Pedido de Reapreciação"
      icon="file-document-outline" iconColor={statusColor} onClose={onClose}>
      <ScrollView style={{ padding: 16 }} showsVerticalScrollIndicator={false}>
        {/* Status banner */}
        <View style={{ backgroundColor: statusColor + '18', borderRadius: 10, padding: 14, marginBottom: 16,
          borderWidth: 1, borderColor: statusColor + '33' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <MaterialCommunityIcons
              name={pedido.status === 'deferido' ? 'check-circle' : pedido.status === 'indeferido' ? 'close-circle' : 'clock'}
              size={20} color={statusColor} />
            <Text style={{ fontSize: 16, fontWeight: '800', color: statusColor }}>
              {STATUS_LABELS[pedido.status] ?? pedido.status}
            </Text>
          </View>
          {pedido.status === 'pendente' && pedido.deadlineAt && (
            <Text style={{ fontSize: 11, color: statusColor }}>Prazo: {fmtDatetime(pedido.deadlineAt)}</Text>
          )}
          {pedido.notaFinal != null && (
            <Text style={{ fontSize: 13, fontWeight: '700', color: Colors.success, marginTop: 4 }}>
              Nota rectificada: {pedido.notaFinal}v (original: {pedido.notaOriginal ?? '—'}v)
            </Text>
          )}
        </View>

        {/* Info do pedido */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Informações do Pedido</Text>
          <InfoRow label="Aluno" value={alunoNome} />
          <InfoRow label="Turma" value={pedido.turmaNome || pedido.nomeTurmaRef || '—'} />
          <InfoRow label="Disciplina" value={pedido.disciplina} />
          <InfoRow label="Trimestre" value={`${pedido.trimestre}º Trimestre`} />
          <InfoRow label="Tipo de Avaliação" value={TIPO_AVAL_LABELS[pedido.tipoAvaliacao] ?? pedido.tipoAvaliacao} />
          <InfoRow label="Nota Original" value={pedido.notaOriginal != null ? `${pedido.notaOriginal}v` : '—'} />
          <InfoRow label="Solicitado por" value={pedido.solicitadoPor || '—'} />
          <InfoRow label="Data de Submissão" value={fmtDate(pedido.createdAt)} />
        </View>

        {/* Motivo */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Motivo do Pedido</Text>
          <Text style={{ fontSize: 13, color: Colors.text, lineHeight: 20 }}>{pedido.motivo}</Text>
        </View>

        {/* Comissão */}
        {pedido.comissaoMembros?.length > 0 && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>Comissão de Reapreciação</Text>
            {pedido.comissaoMembros.map((m, i) => (
              <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: '#7c3aed22',
                  alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 10, fontWeight: '700', color: '#7c3aed' }}>{i + 1}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: Colors.text }}>{m.nome}</Text>
                  <Text style={{ fontSize: 11, color: Colors.textMuted }}>{m.cargo}{m.email ? ` · ${m.email}` : ''}</Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Decisão */}
        {(pedido.decisao || pedido.fundamentoDecisao) && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>Decisão da Comissão</Text>
            {pedido.fundamentoDecisao && (
              <Text style={{ fontSize: 13, color: Colors.text, lineHeight: 20, marginBottom: 6 }}>
                {pedido.fundamentoDecisao}
              </Text>
            )}
            {pedido.decididoPor && (
              <InfoRow label="Decidido por" value={pedido.decididoPor} />
            )}
            {pedido.decididoEm && (
              <InfoRow label="Data da decisão" value={fmtDate(pedido.decididoEm)} />
            )}
          </View>
        )}

        {/* Acções admin */}
        {isAdmin && (
          <View style={{ gap: 10, marginTop: 8 }}>
            {(pedido.status === 'pendente' || pedido.status === 'em_analise') && (
              <TouchableOpacity
                style={[s.saveBtn, { backgroundColor: '#7c3aed' }]}
                onPress={() => setShowComissao(true)}>
                <MaterialCommunityIcons name="account-group" size={18} color="#fff" />
                <Text style={s.saveBtnText}>
                  {pedido.comissaoMembros?.length ? 'Actualizar Comissão' : 'Constituir Comissão'}
                </Text>
              </TouchableOpacity>
            )}
            {pedido.status === 'em_analise' && (
              <TouchableOpacity
                style={[s.saveBtn, { backgroundColor: Colors.gold }]}
                onPress={() => setShowDecisao(true)}>
                <MaterialCommunityIcons name="gavel" size={18} color="#fff" />
                <Text style={s.saveBtnText}>Registar Decisão</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
        <View style={{ height: 20 }} />
      </ScrollView>

      {showComissao && (
        <ComissaoModal pedido={pedido} onClose={() => setShowComissao(false)} onSaved={handleComissaoSaved} />
      )}
      {showDecisao && (
        <DecisaoModal pedido={pedido} onClose={() => setShowDecisao(false)} onSaved={handleDecisaoSaved} />
      )}
    </ModalShell>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
      paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: Colors.border + '33', gap: 8 }}>
      <Text style={{ fontSize: 12, color: Colors.textMuted, flex: 1 }}>{label}</Text>
      <Text style={{ fontSize: 12, color: Colors.text, fontWeight: '600', flex: 2, textAlign: 'right' }}>{value}</Text>
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function PedidosReapreciacaoScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { anoAtivo } = useAnoAcademico();
  const { config } = useConfig();

  const [activeTab, setActiveTab] = useState<TabKey>('pendentes');
  const [pedidos, setPedidos] = useState<PedidoReapreciacao[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showNovo, setShowNovo] = useState(false);
  const [pedidoDetalhe, setPedidoDetalhe] = useState<PedidoReapreciacao | null>(null);

  const anoLetivo = anoAtivo?.ano ?? '';
  const isAdmin = ['admin', 'director', 'ceo'].includes(user?.role ?? '');
  const habilitado = !!(config as any).reapreciacaoHabilitada;

  const fetchData = useCallback(async () => {
    if (!anoLetivo) return;
    setLoading(true);
    try {
      const [ps, st] = await Promise.all([
        api.get<PedidoReapreciacao[]>(`/api/pedidos-reapreciacao?anoLetivo=${encodeURIComponent(anoLetivo)}`),
        api.get<Stats>(`/api/pedidos-reapreciacao/stats?anoLetivo=${encodeURIComponent(anoLetivo)}`),
      ]);
      // Garantir que comissaoMembros é array
      const parsed = ps.map(p => ({
        ...p,
        comissaoMembros: Array.isArray(p.comissaoMembros) ? p.comissaoMembros : [],
      }));
      setPedidos(parsed);
      setStats(st);
    } catch (e) {
      console.error('reapreciacao fetch:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [anoLetivo]);

  useEffect(() => { fetchData(); }, [fetchData]);
  const onRefresh = () => { setRefreshing(true); fetchData(); };

  const filtered = useMemo(() => {
    if (activeTab === 'todos') return pedidos;
    if (activeTab === 'decididos') return pedidos.filter(p => p.status === 'deferido' || p.status === 'indeferido');
    return pedidos.filter(p => p.status === activeTab);
  }, [pedidos, activeTab]);

  const podeSubmeter = isAdmin || ['aluno', 'encarregado'].includes(user?.role ?? '');

  if (!habilitado) {
    return (
      <View style={[s.container, { paddingTop: insets.top }]}>
        <TopBar title="Pedido de Reapreciação" subtitle="Art. 38º — Decreto 04/2026" />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
          <MaterialCommunityIcons name="lock-outline" size={48} color={Colors.textMuted} />
          <Text style={{ fontSize: 16, fontWeight: '700', color: Colors.text, marginTop: 16, textAlign: 'center' }}>
            Módulo não habilitado
          </Text>
          <Text style={{ fontSize: 13, color: Colors.textMuted, marginTop: 8, textAlign: 'center', lineHeight: 20 }}>
            O Pedido de Reapreciação (Art. 38º) não está activo.{'\n'}
            Active em Configurações Gerais → "Reapreciação de Notas".
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      <TopBar title="Pedido de Reapreciação" subtitle="Art. 38º — Decreto Executivo 04/2026" />

      {/* Stats strip */}
      {stats && (
        <View style={s.statsStrip}>
          {[
            { label: 'Pendentes',  value: stats.pendentes,  color: Colors.warning  },
            { label: 'Em Análise', value: stats.emAnalise,  color: '#7c3aed'       },
            { label: 'Deferidos',  value: stats.deferidos,  color: Colors.success  },
            { label: 'Indefiridos',value: stats.indeferidos,color: Colors.danger   },
          ].map(stat => (
            <View key={stat.label} style={s.statItem}>
              <Text style={[s.statValue, { color: stat.color }]}>{stat.value}</Text>
              <Text style={s.statLabel}>{stat.label}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Tabs */}
      <HScrollTabBar style={s.tabBar} contentContainerStyle={s.tabBarContent} keyboardShouldPersistTaps="handled">
        {TABS.map(tab => {
          let count = 0;
          if (tab.key === 'pendentes') count = stats?.pendentes ?? 0;
          if (tab.key === 'em_analise') count = stats?.emAnalise ?? 0;
          if (tab.key === 'todos') count = pedidos.length;
          return (
            <TouchableOpacity
              key={tab.key}
              style={[s.tab, activeTab === tab.key && s.tabActive]}
              onPress={() => setActiveTab(tab.key)}>
              <MaterialCommunityIcons
                name={tab.icon as any}
                size={15}
                color={activeTab === tab.key ? Colors.gold : Colors.textSecondary} />
              <Text style={[s.tabText, activeTab === tab.key && s.tabTextActive]}>
                {tab.label}{count > 0 ? ` (${count})` : ''}
              </Text>
            </TouchableOpacity>
          );
        })}
      </HScrollTabBar>

      {loading && !refreshing ? (
        <View style={{ padding: 16 }}><SkeletonList rows={5} /></View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={item => item.id}
          contentContainerStyle={{ padding: 12, paddingBottom: insets.bottom + 80 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.gold} />}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', padding: 48 }}>
              <MaterialCommunityIcons name="file-search-outline" size={48} color={Colors.textMuted} />
              <Text style={{ fontSize: 15, fontWeight: '700', color: Colors.text, marginTop: 16 }}>
                Nenhum pedido {activeTab === 'pendentes' ? 'pendente' : activeTab === 'em_analise' ? 'em análise' : activeTab === 'decididos' ? 'decidido' : ''}
              </Text>
              <Text style={{ fontSize: 12, color: Colors.textMuted, marginTop: 6, textAlign: 'center' }}>
                {activeTab === 'todos' ? 'Ainda não há pedidos de reapreciação neste ano lectivo.' : ''}
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <PedidoCard
              pedido={item}
              isAdmin={isAdmin}
              onPress={() => setPedidoDetalhe(item)}
            />
          )}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        />
      )}

      {/* FAB — Novo Pedido */}
      {podeSubmeter && (
        <TouchableOpacity
          style={[s.fab, { bottom: insets.bottom + 16 }]}
          onPress={() => setShowNovo(true)}>
          <Ionicons name="add" size={26} color="#fff" />
        </TouchableOpacity>
      )}

      {showNovo && (
        <NovoPedidoModal
          anoLetivo={anoLetivo}
          onClose={() => setShowNovo(false)}
          onSaved={() => { setShowNovo(false); fetchData(); }}
        />
      )}
      {pedidoDetalhe && (
        <DetalhePedidoModal
          pedido={pedidoDetalhe}
          isAdmin={isAdmin}
          onClose={() => setPedidoDetalhe(null)}
          onRefresh={fetchData}
        />
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  statsStrip: {
    flexDirection: 'row', backgroundColor: Colors.backgroundCard,
    paddingVertical: 10, paddingHorizontal: 12,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
    gap: 4,
  },
  statItem: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: 18, fontWeight: '800' },
  statLabel: { fontSize: 9, color: Colors.textMuted, marginTop: 1, textAlign: 'center' },

  tabBar: { backgroundColor: Colors.backgroundCard, borderBottomWidth: 1, borderBottomColor: Colors.border },
  tabBarContent: { paddingHorizontal: 8, paddingVertical: 4, gap: 4 },
  tab: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8,
  },
  tabActive: { backgroundColor: Colors.gold + '18' },
  tabText: { fontSize: 12, color: Colors.textSecondary, fontWeight: '600' },
  tabTextActive: { color: Colors.gold, fontWeight: '700' },

  card: {
    backgroundColor: Colors.backgroundCard,
    borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: Colors.border,
  },
  cardTitle: { fontSize: 14, fontWeight: '700', color: Colors.text, flex: 1 },
  cardSub: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  cardMeta: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },

  badge: {
    paddingHorizontal: 7, paddingVertical: 2, borderRadius: 5,
  },
  badgeText: { fontSize: 10, fontWeight: '700' },

  fab: {
    position: 'absolute', right: 20,
    width: 54, height: 54, borderRadius: 27,
    backgroundColor: Colors.primary,
    alignItems: 'center', justifyContent: 'center',
    elevation: 6, shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 5,
  },

  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  modalBox: {
    backgroundColor: Colors.backgroundCard,
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    maxHeight: '92%',
    paddingBottom: Platform.OS === 'ios' ? 24 : 8,
  },
  modalHeader: {
    flexDirection: 'row', alignItems: 'flex-start',
    padding: 20, borderBottomWidth: 1, borderBottomColor: Colors.border,
    borderLeftWidth: 4, borderLeftColor: Colors.primary,
    gap: 12,
  },
  modalTitle: { fontSize: 16, fontWeight: '800', color: Colors.text },
  modalSub: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  closeBtn: { padding: 2 },

  section: {
    backgroundColor: Colors.backgroundElevated,
    borderRadius: 10, padding: 14, marginBottom: 12, gap: 4,
  },
  sectionTitle: {
    fontSize: 11, fontWeight: '700', color: Colors.textMuted,
    letterSpacing: 0.8, marginBottom: 6,
    textTransform: 'uppercase',
  },

  label: { fontSize: 12, fontWeight: '700', color: Colors.textSecondary, marginBottom: 6 },
  input: {
    backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border,
    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 13, color: Colors.text,
  },
  chip: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8,
    borderWidth: 1, borderColor: Colors.border,
    backgroundColor: Colors.backgroundElevated,
  },
  chipActive: { borderColor: Colors.gold, backgroundColor: Colors.gold + '15' },
  chipText: { fontSize: 12, color: Colors.textSecondary, fontWeight: '600' },

  saveBtn: {
    backgroundColor: Colors.primary, borderRadius: 12,
    paddingVertical: 14, alignItems: 'center', justifyContent: 'center',
    flexDirection: 'row', gap: 8,
  },
  saveBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },
});
