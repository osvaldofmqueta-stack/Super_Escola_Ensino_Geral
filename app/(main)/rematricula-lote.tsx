import React, { useState, useEffect } from 'react';
import {
  ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View, Switch,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import TopBar from '@/components/TopBar';
import { Colors } from '@/constants/colors';
import { useData } from '@/context/DataContext';
import { alertSucesso, alertErro } from '@/utils/toast';
import { api } from '@/lib/api';
import { StableSearchInput } from '@/components/StableSearchInput';

// ─── Tipos ────────────────────────────────────────────────────────────────────
type Detalhe = { alunoId: string; nome: string; resultado: 'rematriculado' | 'bloqueado' | 'ja_rematricula' | 'erro'; motivo?: string };
type Resultado = { processados: number; bloqueados: number; erros: number; total: number; detalhes: Detalhe[]; anoLetivoDestino: string };

const RESULTADO_LABEL: Record<string, { label: string; color: string; icon: string }> = {
  rematriculado:   { label: 'Rematriculado',    color: '#22c55e', icon: 'checkmark-circle'     },
  ja_rematricula:  { label: 'Já rematriculado', color: '#94a3b8', icon: 'checkmark-done-circle' },
  bloqueado:       { label: 'Bloqueado',         color: '#f59e0b', icon: 'warning'               },
  erro:            { label: 'Erro',              color: '#ef4444', icon: 'close-circle'           },
};

export default function RematriculaLoteScreen() {
  const { alunos: alunosTodos, turmas } = useData();

  // Listas de anos lectivos disponíveis
  const [anosLetivos, setAnosLetivos] = useState<{ id: string; ano: string }[]>([]);
  const [anoDestino, setAnoDestino] = useState('');

  // Selecção de alunos
  const [busca, setBusca] = useState('');
  const [seleccionados, setSeleccionados] = useState<Set<string>>(new Set());
  const [modoTodos, setModoTodos] = useState(true); // true = todos os activos

  // Opções de bloqueio
  const [bloquearPendencia, setBloquearPendencia] = useState(true);
  const [bloquearReprovados, setBloquearReprovados] = useState(false);

  // Estado
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [filtroResultado, setFiltroResultado] = useState<string>('todos');

  // Carregar anos lectivos
  useEffect(() => {
    fetch('/api/anos-academicos')
      .then(r => r.json())
      .then((data: any[]) => {
        const sorted = (data || []).sort((a, b) => b.ano.localeCompare(a.ano));
        setAnosLetivos(sorted);
        if (sorted.length > 0) setAnoDestino(sorted[0].ano);
      })
      .catch(() => {});
  }, []);

  // Alunos filtrados para selecção manual
  const alunosFiltrados = (alunosTodos as any[])
    .filter(a => a.ativo)
    .filter(a => {
      if (!busca.trim()) return true;
      const q = busca.toLowerCase();
      return `${a.nome} ${a.apelido}`.toLowerCase().includes(q) || (a.numeroMatricula || '').toLowerCase().includes(q);
    })
    .sort((a, b) => `${a.nome} ${a.apelido}`.localeCompare(`${b.nome} ${b.apelido}`, 'pt'));

  const toggleAluno = (id: string) => {
    setSeleccionados(prev => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

  const toggleTodos = () => {
    if (seleccionados.size === alunosFiltrados.length) setSeleccionados(new Set());
    else setSeleccionados(new Set(alunosFiltrados.map(a => a.id)));
  };

  const turmaLabel = (turmaId: string) => {
    const t = (turmas as any[]).find(x => x.id === turmaId);
    return t ? `${t.classe}ª · ${t.nome}` : '—';
  };

  const enviar = async () => {
    if (!anoDestino) { alertErro('Ano lectivo', 'Seleccione o ano lectivo de destino.'); return; }
    const payload: any = { anoLetivoDestino: anoDestino, bloquearComPendencia: bloquearPendencia, bloquearReprovados };
    if (!modoTodos) {
      if (!seleccionados.size) { alertErro('Sem alunos', 'Seleccione pelo menos um aluno.'); return; }
      payload.alunoIds = Array.from(seleccionados);
    }

    setEnviando(true);
    setResultado(null);
    try {
      const res = await api.post<Resultado>('/api/rematricula-lote', payload);
      setResultado(res);
      if (res.processados > 0) alertSucesso(`${res.processados} aluno(s) rematriculados com sucesso!`);
      else alertErro('Sem alterações', `0 rematriculados. ${res.bloqueados} bloqueados, ${res.erros} erros.`);
    } catch (e: any) {
      alertErro('Erro', e?.message || 'Erro ao processar rematrícula.');
    } finally {
      setEnviando(false);
    }
  };

  // Detalhes filtrados
  const detalhesFiltrados = resultado
    ? resultado.detalhes.filter(d => filtroResultado === 'todos' || d.resultado === filtroResultado)
    : [];

  const totalActivos = (alunosTodos as any[]).filter(a => a.ativo).length;

  return (
    <View style={s.root}>
      <TopBar
        title="Rematrícula em Lote"
        subtitle={modoTodos ? `${totalActivos} alunos activos` : `${seleccionados.size} seleccionados`}
      />

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 14, gap: 14 }}>

        {/* ── Bloco: Ano lectivo ── */}
        <View style={s.card}>
          <View style={s.cardHeader}>
            <Ionicons name="calendar-outline" size={18} color={Colors.primary} />
            <Text style={s.cardTitle}>Ano Lectivo de Destino</Text>
          </View>
          <View style={s.anosRow}>
            {anosLetivos.map(a => (
              <TouchableOpacity
                key={a.id}
                style={[s.anoPill, anoDestino === a.ano && s.anoPillActive]}
                onPress={() => setAnoDestino(a.ano)}
              >
                <Text style={[s.anoPillText, anoDestino === a.ano && s.anoPillTextActive]}>{a.ano}</Text>
              </TouchableOpacity>
            ))}
            {anosLetivos.length === 0 && <Text style={{ color: Colors.textMuted, fontSize: 12 }}>A carregar…</Text>}
          </View>
        </View>

        {/* ── Bloco: Opções de bloqueio ── */}
        <View style={s.card}>
          <View style={s.cardHeader}>
            <Ionicons name="shield-checkmark-outline" size={18} color="#f59e0b" />
            <Text style={s.cardTitle}>Regras de Bloqueio</Text>
          </View>
          <Text style={s.cardDesc}>Alunos que cumpram estas condições serão marcados como bloqueados e não rematriculados.</Text>

          <View style={s.switchRow}>
            <View style={{ flex: 1 }}>
              <Text style={s.switchLabel}>Bloquear com pendências financeiras</Text>
              <Text style={s.switchSub}>Propinas ou taxas em atraso</Text>
            </View>
            <Switch
              value={bloquearPendencia}
              onValueChange={setBloquearPendencia}
              trackColor={{ true: Colors.primary }}
            />
          </View>
          <View style={[s.switchRow, { borderTopWidth: 1, borderTopColor: Colors.border, marginTop: 8, paddingTop: 10 }]}>
            <View style={{ flex: 1 }}>
              <Text style={s.switchLabel}>Bloquear reprovados</Text>
              <Text style={s.switchSub}>Média do 3º trimestre inferior a 10</Text>
            </View>
            <Switch
              value={bloquearReprovados}
              onValueChange={setBloquearReprovados}
              trackColor={{ true: Colors.primary }}
            />
          </View>
        </View>

        {/* ── Bloco: Selecção de alunos ── */}
        <View style={s.card}>
          <View style={s.cardHeader}>
            <Ionicons name="people-outline" size={18} color="#0ea5e9" />
            <Text style={s.cardTitle}>Alunos a Rematricular</Text>
          </View>

          {/* Toggle todos / selecção manual */}
          <View style={s.modoRow}>
            <TouchableOpacity
              style={[s.modoBtn, modoTodos && s.modoBtnActive]}
              onPress={() => setModoTodos(true)}
            >
              <Ionicons name="checkmark-done-circle-outline" size={15} color={modoTodos ? '#fff' : Colors.textMuted} />
              <Text style={[s.modoBtnText, modoTodos && { color: '#fff' }]}>Todos os activos ({totalActivos})</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.modoBtn, !modoTodos && s.modoBtnActive]}
              onPress={() => setModoTodos(false)}
            >
              <Ionicons name="list-outline" size={15} color={!modoTodos ? '#fff' : Colors.textMuted} />
              <Text style={[s.modoBtnText, !modoTodos && { color: '#fff' }]}>Seleccionar manualmente</Text>
            </TouchableOpacity>
          </View>

          {/* Lista de selecção manual */}
          {!modoTodos && (
            <>
              <StableSearchInput
                value={busca}
                onChangeText={setBusca}
                placeholder="Pesquisar aluno…"
                style={{ marginBottom: 10 }}
              />
              <TouchableOpacity style={s.selectAllBtn} onPress={toggleTodos}>
                <Ionicons
                  name={seleccionados.size === alunosFiltrados.length && alunosFiltrados.length > 0 ? 'checkbox' : 'square-outline'}
                  size={16} color={Colors.primary}
                />
                <Text style={{ fontSize: 12, color: Colors.primary, marginLeft: 6, fontWeight: '700' }}>
                  {seleccionados.size === alunosFiltrados.length && alunosFiltrados.length > 0 ? 'Desseleccionar todos' : `Seleccionar todos (${alunosFiltrados.length})`}
                </Text>
              </TouchableOpacity>
              <View style={{ maxHeight: 300 }}>
                <ScrollView nestedScrollEnabled showsVerticalScrollIndicator={false}>
                  {alunosFiltrados.map(a => {
                    const sel = seleccionados.has(a.id);
                    return (
                      <TouchableOpacity key={a.id} style={[s.alunoRow, sel && s.alunoRowSel]} onPress={() => toggleAluno(a.id)}>
                        <Ionicons name={sel ? 'checkbox' : 'square-outline'} size={18} color={sel ? Colors.primary : Colors.border} />
                        <View style={{ flex: 1, marginLeft: 10 }}>
                          <Text style={[s.alunoNome, sel && { color: Colors.primary }]}>{a.nome} {a.apelido}</Text>
                          <Text style={s.alunoSub}>{a.numeroMatricula || '—'} · {turmaLabel(a.turmaId)}</Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                  {alunosFiltrados.length === 0 && (
                    <Text style={{ textAlign: 'center', color: Colors.textMuted, fontSize: 13, padding: 20 }}>Nenhum aluno encontrado</Text>
                  )}
                </ScrollView>
              </View>
            </>
          )}
        </View>

        {/* ── Resultado ── */}
        {resultado && (
          <View style={s.card}>
            <View style={s.cardHeader}>
              <Ionicons name="stats-chart-outline" size={18} color="#22c55e" />
              <Text style={s.cardTitle}>Resultado — {resultado.anoLetivoDestino}</Text>
            </View>

            {/* Resumo em pills */}
            <View style={s.resumoRow}>
              {[
                { key: 'rematriculado',  label: 'Rematriculados', n: resultado.processados,  color: '#22c55e' },
                { key: 'bloqueado',      label: 'Bloqueados',      n: resultado.bloqueados,   color: '#f59e0b' },
                { key: 'ja_rematricula', label: 'Já existia',      n: resultado.detalhes.filter(d => d.resultado === 'ja_rematricula').length, color: '#94a3b8' },
                { key: 'erro',           label: 'Erros',            n: resultado.erros,        color: '#ef4444' },
              ].map(r => (
                <TouchableOpacity
                  key={r.key}
                  style={[s.resumoPill, { borderColor: r.color, backgroundColor: r.color + '18' }, filtroResultado === r.key && { backgroundColor: r.color + '33' }]}
                  onPress={() => setFiltroResultado(prev => prev === r.key ? 'todos' : r.key)}
                >
                  <Text style={[s.resumoN, { color: r.color }]}>{r.n}</Text>
                  <Text style={[s.resumoLabel, { color: r.color }]}>{r.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Lista de detalhes */}
            {detalhesFiltrados.slice(0, 100).map((d, i) => {
              const cfg = RESULTADO_LABEL[d.resultado] || RESULTADO_LABEL.erro;
              return (
                <View key={i} style={[s.detalheRow, i > 0 && { borderTopWidth: 1, borderTopColor: Colors.border }]}>
                  <Ionicons name={cfg.icon as any} size={16} color={cfg.color} style={{ marginRight: 8 }} />
                  <Text style={[s.detalheNome, { flex: 1 }]}>{d.nome}</Text>
                  <View>
                    <Text style={[s.detalheTag, { color: cfg.color }]}>{cfg.label}</Text>
                    {d.motivo && <Text style={s.detalheMotivo}>{d.motivo}</Text>}
                  </View>
                </View>
              );
            })}
            {detalhesFiltrados.length > 100 && (
              <Text style={{ textAlign: 'center', color: Colors.textMuted, fontSize: 12, padding: 10 }}>
                … e mais {detalhesFiltrados.length - 100} registos
              </Text>
            )}
          </View>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* ── Barra de acção ── */}
      <View style={s.actionBar}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: Colors.text }}>
            {modoTodos ? `${totalActivos} alunos activos` : `${seleccionados.size} seleccionados`}
          </Text>
          <Text style={{ fontSize: 11, color: Colors.textMuted }}>
            Ano destino: <Text style={{ fontWeight: '700' }}>{anoDestino || '—'}</Text>
          </Text>
        </View>
        <TouchableOpacity
          style={[s.submitBtn, (enviando || !anoDestino) && { opacity: 0.5 }]}
          onPress={enviar}
          disabled={enviando || !anoDestino}
        >
          {enviando
            ? <ActivityIndicator size="small" color="#fff" />
            : <MaterialCommunityIcons name="account-multiple-check" size={18} color="#fff" />
          }
          <Text style={s.submitBtnText}>{enviando ? 'A processar…' : 'Processar Rematrícula'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },

  card: { backgroundColor: Colors.card, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: Colors.border },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  cardTitle: { fontSize: 14, fontWeight: '800', color: Colors.text },
  cardDesc: { fontSize: 12, color: Colors.textMuted, marginBottom: 10, lineHeight: 17 },

  anosRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  anoPill: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.background },
  anoPillActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  anoPillText: { fontSize: 13, fontWeight: '600', color: Colors.textMuted },
  anoPillTextActive: { color: '#fff' },

  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  switchLabel: { fontSize: 13, fontWeight: '700', color: Colors.text },
  switchSub: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },

  modoRow: { flexDirection: 'row', gap: 8, marginBottom: 12, flexWrap: 'wrap' },
  modoBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8,
    borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.background,
  },
  modoBtnActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  modoBtnText: { fontSize: 12, fontWeight: '700', color: Colors.textMuted },

  selectAllBtn: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, marginBottom: 4 },

  alunoRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 8,
    borderRadius: 8, marginBottom: 4,
  },
  alunoRowSel: { backgroundColor: Colors.primary + '12' },
  alunoNome: { fontSize: 13, fontWeight: '600', color: Colors.text },
  alunoSub: { fontSize: 11, color: Colors.textMuted, marginTop: 1 },

  resumoRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  resumoPill: {
    flex: 1, minWidth: 80, alignItems: 'center', padding: 10,
    borderRadius: 10, borderWidth: 2,
  },
  resumoN: { fontSize: 22, fontWeight: '900' },
  resumoLabel: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', marginTop: 2 },

  detalheRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  detalheNome: { fontSize: 13, color: Colors.text },
  detalheTag: { fontSize: 11, fontWeight: '700' },
  detalheMotivo: { fontSize: 10, color: Colors.textMuted },

  actionBar: {
    flexDirection: 'row', alignItems: 'center', padding: 12, gap: 12,
    borderTopWidth: 1, borderTopColor: Colors.border, backgroundColor: Colors.card,
  },
  submitBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#0d9488', paddingHorizontal: 20, paddingVertical: 11, borderRadius: 10,
  },
  submitBtnText: { color: '#fff', fontWeight: '800', fontSize: 14 },
});
