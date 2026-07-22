import React, { useState, useCallback } from 'react';
import {
  ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View, Modal, ActivityIndicator,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import TopBar from '@/components/TopBar';
import { Colors } from '@/constants/colors';
import { useData } from '@/context/DataContext';
import { alertSucesso, alertErro } from '@/utils/toast';
import { api } from '@/lib/api';
import { useConfig } from '@/context/ConfigContext';

// ─── Linha vazia padrão ───────────────────────────────────────────────────────
const novaLinha = () => ({
  nome: '', apelido: '', dataNascimento: '', genero: 'M' as 'M' | 'F',
  nomeEncarregado: '', telefoneEncarregado: '',
  turmaId: '', numeroBi: '', nomePai: '', nomeMae: '',
});

type Linha = ReturnType<typeof novaLinha>;

// ─── Componente de célula de texto ────────────────────────────────────────────
function Cell({ value, onChange, placeholder, width, numeric }: {
  value: string; onChange: (v: string) => void;
  placeholder?: string; width: number; numeric?: boolean;
}) {
  return (
    <TextInput
      style={[s.cell, { width }]}
      value={value}
      onChangeText={onChange}
      placeholder={placeholder || ''}
      placeholderTextColor={Colors.textMuted}
      keyboardType={numeric ? 'numeric' : 'default'}
    />
  );
}

export default function MatriculaLoteScreen() {
  const { turmas } = useData();
  const { config } = useConfig();
  const [linhas, setLinhas] = useState<Linha[]>([novaLinha(), novaLinha(), novaLinha()]);
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<{ inseridos: number; erros: { linha: number; erro: string }[]; total: number } | null>(null);
  const [showTurmaModal, setShowTurmaModal] = useState<number | null>(null); // index da linha

  const turmasList = (turmas as any[]).sort((a, b) => {
    const na = parseInt(String(a.classe)) || 0;
    const nb = parseInt(String(b.classe)) || 0;
    return na !== nb ? na - nb : a.nome.localeCompare(b.nome, 'pt');
  });

  const set = useCallback((i: number, campo: keyof Linha, valor: string) => {
    setLinhas(prev => prev.map((l, idx) => idx === i ? { ...l, [campo]: valor } : l));
  }, []);

  const addLinhas = (n: number) => setLinhas(prev => [...prev, ...Array.from({ length: n }, novaLinha)]);
  const removeRow = (i: number) => setLinhas(prev => prev.filter((_, idx) => idx !== i));

  const limpar = () => setLinhas([novaLinha(), novaLinha(), novaLinha()]);

  const enviar = async () => {
    const preenchidas = linhas.filter(l => l.nome.trim() || l.apelido.trim());
    if (!preenchidas.length) { alertErro('Sem dados', 'Preencha pelo menos uma linha.'); return; }

    // Validar datas no formato AAAA-MM-DD
    for (let i = 0; i < preenchidas.length; i++) {
      const l = preenchidas[i];
      if (l.dataNascimento && !/^\d{4}-\d{2}-\d{2}$/.test(l.dataNascimento)) {
        alertErro('Data inválida', `Linha ${i + 1}: data no formato AAAA-MM-DD (ex: 2008-05-12).`);
        return;
      }
    }

    setEnviando(true);
    try {
      const res = await api.post<{ inseridos: number; erros: { linha: number; erro: string }[]; total: number }>(
        '/api/alunos/matricula-lote-novos',
        { alunos: preenchidas }
      );
      setResultado(res);
      if (res.inseridos > 0) {
        alertSucesso(`${res.inseridos} aluno(s) matriculados com sucesso!`);
        setLinhas([novaLinha(), novaLinha(), novaLinha()]);
      }
    } catch (e: any) {
      alertErro('Erro', e?.message || 'Erro ao enviar.');
    } finally {
      setEnviando(false);
    }
  };

  const turmaLabel = (turmaId: string) => {
    const t = turmasList.find(x => x.id === turmaId);
    return t ? `${t.classe}ª · ${t.nome}` : 'Seleccionar turma';
  };

  const preenchidas = linhas.filter(l => l.nome.trim() || l.apelido.trim()).length;

  return (
    <View style={s.root}>
      <TopBar title="Matrícula em Lote" subtitle={`${preenchidas} aluno(s) a registar`} />

      {/* ── Cabeçalho informativo ── */}
      <View style={s.infoBar}>
        <Ionicons name="information-circle-outline" size={16} color="#0ea5e9" />
        <Text style={s.infoText}>
          Preencha a tabela abaixo. Campos obrigatórios: <Text style={{ fontWeight: '700' }}>Nome, Apelido, Encarregado e Telefone</Text>.
          Data no formato <Text style={{ fontWeight: '700' }}>AAAA-MM-DD</Text>.
        </Text>
      </View>

      {/* ── Tabela ── */}
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 12 }}>
        {/* Cabeçalho das colunas */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View>
            <View style={[s.row, s.headerRow]}>
              <Text style={[s.hdr, { width: 36 }]}>#</Text>
              <Text style={[s.hdr, { width: 130 }]}>Nome *</Text>
              <Text style={[s.hdr, { width: 130 }]}>Apelido *</Text>
              <Text style={[s.hdr, { width: 110 }]}>Dt. Nasc.</Text>
              <Text style={[s.hdr, { width: 60 }]}>Género</Text>
              <Text style={[s.hdr, { width: 160 }]}>Encarregado *</Text>
              <Text style={[s.hdr, { width: 120 }]}>Telefone *</Text>
              <Text style={[s.hdr, { width: 130 }]}>Nº BI</Text>
              <Text style={[s.hdr, { width: 150 }]}>Turma</Text>
              <Text style={[s.hdr, { width: 36 }]}></Text>
            </View>

            {/* Linhas */}
            {linhas.map((l, i) => (
              <View key={i} style={[s.row, i % 2 === 0 ? s.rowEven : s.rowOdd]}>
                {/* Nº */}
                <Text style={[s.numCell, { width: 36 }]}>{i + 1}</Text>

                {/* Nome */}
                <Cell width={130} value={l.nome} onChange={v => set(i, 'nome', v)} placeholder="Nome" />

                {/* Apelido */}
                <Cell width={130} value={l.apelido} onChange={v => set(i, 'apelido', v)} placeholder="Apelido" />

                {/* Data Nascimento */}
                <Cell width={110} value={l.dataNascimento} onChange={v => set(i, 'dataNascimento', v)} placeholder="2008-05-12" />

                {/* Género toggle */}
                <TouchableOpacity
                  style={[s.generoBtn, { width: 60, backgroundColor: l.genero === 'M' ? '#3b82f622' : '#ec489922' }]}
                  onPress={() => set(i, 'genero', l.genero === 'M' ? 'F' : 'M')}
                >
                  <Text style={{ color: l.genero === 'M' ? '#3b82f6' : '#ec4899', fontWeight: '700', fontSize: 12 }}>
                    {l.genero}
                  </Text>
                </TouchableOpacity>

                {/* Encarregado */}
                <Cell width={160} value={l.nomeEncarregado} onChange={v => set(i, 'nomeEncarregado', v)} placeholder="Nome completo" />

                {/* Telefone */}
                <Cell width={120} value={l.telefoneEncarregado} onChange={v => set(i, 'telefoneEncarregado', v)} placeholder="+244 9XX XXX XXX" numeric />

                {/* BI */}
                <Cell width={130} value={l.numeroBi} onChange={v => set(i, 'numeroBi', v)} placeholder="BI (opcional)" />

                {/* Turma */}
                <TouchableOpacity
                  style={[s.cell, { width: 150, justifyContent: 'center', paddingHorizontal: 8 }]}
                  onPress={() => setShowTurmaModal(i)}
                >
                  <Text style={{ fontSize: 11, color: l.turmaId ? Colors.text : Colors.textMuted }} numberOfLines={1}>
                    {l.turmaId ? turmaLabel(l.turmaId) : 'Seleccionar…'}
                  </Text>
                </TouchableOpacity>

                {/* Remover */}
                <TouchableOpacity style={{ width: 36, alignItems: 'center', justifyContent: 'center' }} onPress={() => removeRow(i)}>
                  <Ionicons name="trash-outline" size={16} color={Colors.danger} />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        </ScrollView>

        {/* ── Botões de adicionar linhas ── */}
        <View style={s.addRow}>
          {[1, 5, 10].map(n => (
            <TouchableOpacity key={n} style={s.addBtn} onPress={() => addLinhas(n)}>
              <Ionicons name="add" size={14} color={Colors.primary} />
              <Text style={s.addBtnText}>+ {n} linha{n > 1 ? 's' : ''}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── Resultado do envio anterior ── */}
        {resultado && (
          <View style={[s.resultBox, { borderColor: resultado.erros.length ? Colors.warning : Colors.success }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <Ionicons
                name={resultado.erros.length ? 'warning-outline' : 'checkmark-circle-outline'}
                size={20}
                color={resultado.erros.length ? Colors.warning : Colors.success}
              />
              <Text style={{ fontWeight: '700', color: Colors.text }}>
                {resultado.inseridos}/{resultado.total} inseridos com sucesso
              </Text>
            </View>
            {resultado.erros.map((e, i) => (
              <Text key={i} style={s.erroLinha}>Linha {e.linha}: {e.erro}</Text>
            ))}
            <TouchableOpacity onPress={() => setResultado(null)} style={{ marginTop: 8, alignSelf: 'flex-end' }}>
              <Text style={{ color: Colors.textMuted, fontSize: 12 }}>Fechar</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={{ height: 120 }} />
      </ScrollView>

      {/* ── Barra de acções fixa em baixo ── */}
      <View style={s.actionBar}>
        <TouchableOpacity style={s.clearBtn} onPress={limpar}>
          <Ionicons name="refresh-outline" size={16} color={Colors.textMuted} />
          <Text style={s.clearBtnText}>Limpar</Text>
        </TouchableOpacity>
        <Text style={s.countText}>{preenchidas} aluno(s) · máx. 200</Text>
        <TouchableOpacity
          style={[s.submitBtn, (enviando || !preenchidas) && { opacity: 0.5 }]}
          onPress={enviar}
          disabled={enviando || !preenchidas}
        >
          {enviando
            ? <ActivityIndicator size="small" color="#fff" />
            : <Ionicons name="cloud-upload-outline" size={16} color="#fff" />
          }
          <Text style={s.submitBtnText}>{enviando ? 'A registar…' : 'Registar Alunos'}</Text>
        </TouchableOpacity>
      </View>

      {/* ── Modal de selecção de turma ── */}
      <Modal visible={showTurmaModal !== null} transparent animationType="fade" onRequestClose={() => setShowTurmaModal(null)}>
        <View style={s.modalOverlay}>
          <View style={s.modalBox}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <Text style={s.modalTitle}>Seleccionar Turma</Text>
              <TouchableOpacity onPress={() => setShowTurmaModal(null)}>
                <Ionicons name="close" size={22} color={Colors.textMuted} />
              </TouchableOpacity>
            </View>

            {/* Opção nenhuma turma */}
            <TouchableOpacity
              style={[s.turmaOpcao, { borderColor: Colors.border }]}
              onPress={() => { if (showTurmaModal !== null) set(showTurmaModal, 'turmaId', ''); setShowTurmaModal(null); }}
            >
              <Text style={{ color: Colors.textMuted, fontSize: 13 }}>— Sem turma definida</Text>
            </TouchableOpacity>

            <ScrollView style={{ maxHeight: 380 }} showsVerticalScrollIndicator={false}>
              {turmasList.map((t: any) => (
                <TouchableOpacity
                  key={t.id}
                  style={[s.turmaOpcao, showTurmaModal !== null && linhas[showTurmaModal]?.turmaId === t.id && { backgroundColor: Colors.primary + '22', borderColor: Colors.primary }]}
                  onPress={() => {
                    if (showTurmaModal !== null) set(showTurmaModal, 'turmaId', t.id);
                    setShowTurmaModal(null);
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: Colors.text }}>{t.nome}</Text>
                    <Text style={{ fontSize: 11, color: Colors.textMuted }}>{t.classe}ª Classe · {t.turno || 'Manhã'}</Text>
                  </View>
                  {showTurmaModal !== null && linhas[showTurmaModal]?.turmaId === t.id && (
                    <Ionicons name="checkmark-circle" size={18} color={Colors.primary} />
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  infoBar: {
    flexDirection: 'row', gap: 8, alignItems: 'flex-start',
    backgroundColor: '#0ea5e911', borderLeftWidth: 3, borderLeftColor: '#0ea5e9',
    padding: 10, margin: 12, borderRadius: 8,
  },
  infoText: { flex: 1, fontSize: 12, color: Colors.textSecondary, lineHeight: 17 },

  // Tabela
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 40 },
  headerRow: { backgroundColor: '#1e293b', paddingVertical: 8 },
  rowEven: { backgroundColor: Colors.card },
  rowOdd: { backgroundColor: Colors.background },
  hdr: { fontSize: 10, fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase', paddingHorizontal: 4, textAlign: 'center' },
  numCell: { fontSize: 11, color: Colors.textMuted, textAlign: 'center', fontWeight: '700' },
  cell: {
    height: 36, borderWidth: 1, borderColor: Colors.border,
    borderRadius: 6, fontSize: 12, color: Colors.text,
    backgroundColor: Colors.card, paddingHorizontal: 8, marginHorizontal: 2,
  },
  generoBtn: {
    height: 36, borderRadius: 6, marginHorizontal: 2,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.border,
  },

  // Adicionar linhas
  addRow: { flexDirection: 'row', gap: 8, marginTop: 10, flexWrap: 'wrap' },
  addBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 12, paddingVertical: 7,
    backgroundColor: Colors.primary + '15', borderRadius: 8,
    borderWidth: 1, borderColor: Colors.primary + '40',
  },
  addBtnText: { fontSize: 12, color: Colors.primary, fontWeight: '700' },

  // Resultado
  resultBox: {
    marginTop: 16, padding: 14, borderRadius: 10,
    borderWidth: 2, backgroundColor: Colors.card,
  },
  erroLinha: { fontSize: 12, color: Colors.danger, marginBottom: 3 },

  // Barra de acções
  actionBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 12, borderTopWidth: 1, borderTopColor: Colors.border,
    backgroundColor: Colors.card, gap: 10,
  },
  clearBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 9,
    backgroundColor: Colors.background, borderRadius: 8, borderWidth: 1, borderColor: Colors.border,
  },
  clearBtnText: { fontSize: 13, color: Colors.textMuted, fontWeight: '600' },
  countText: { flex: 1, fontSize: 12, color: Colors.textMuted, textAlign: 'center' },
  submitBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: Colors.primary, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10,
  },
  submitBtnText: { color: '#fff', fontWeight: '800', fontSize: 14 },

  // Modal turma
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  modalBox: { backgroundColor: Colors.card, borderRadius: 16, padding: 18, width: '100%', maxHeight: '80%' },
  modalTitle: { fontSize: 15, fontWeight: '800', color: Colors.text },
  turmaOpcao: {
    flexDirection: 'row', alignItems: 'center', padding: 12,
    borderRadius: 9, borderWidth: 1, borderColor: Colors.border, marginBottom: 6,
  },
});
