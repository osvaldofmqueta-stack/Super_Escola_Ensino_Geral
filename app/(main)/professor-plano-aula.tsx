import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Modal, FlatList, Platform } from 'react-native';
import AppLoader from '@/components/AppLoader';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '@/constants/colors';
import { SkeletonList } from '@/components/Skeleton';
import DateInput from '@/components/DateInput';
import TopBar from '@/components/TopBar';
import { useAuth } from '@/context/AuthContext';
import { useData } from '@/context/DataContext';
import { useConfig } from '@/context/ConfigContext';
import { useAnoAcademico } from '@/context/AnoAcademicoContext';
import { api } from '@/lib/api';
import { webAlert } from '@/utils/webAlert';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FaseAula {
  tempo: string;
  fase: string;
  conteudo: string;
  metodos: string;
  actividades: string;
  estrategiaEnsino: string;
  meiosEnsino: string;
  avaliacao: string;
  obs: string;
}

export interface PlanoAula {
  id: string;
  professorId: string;
  professorNome: string;
  turmaId?: string;
  turmaNome: string;
  disciplina: string;
  unidade: string;
  sumario: string;
  classe: string;
  escola: string;
  perfilEntrada: string;
  perfilSaida: string;
  data: string;
  periodo: string;
  tempo: string;
  duracao: string;
  anoLetivo: string;
  objectivoGeral: string;
  objectivosEspecificos: string;
  fases: FaseAula[];
  status: 'rascunho' | 'submetido' | 'aprovado' | 'rejeitado';
  observacaoDirector?: string;
  aprovadoPor?: string;
  aprovadoEm?: string;
  createdAt: string;
  updatedAt: string;
}

const FASES_DEFAULT: FaseAula[] = [
  { tempo: '5 min', fase: 'Introdução', conteudo: '', metodos: 'Diálogo', actividades: '', estrategiaEnsino: '', meiosEnsino: 'Quadro, Giz, Apagador', avaliacao: 'Diagnóstica', obs: '' },
  { tempo: '30 min', fase: 'Desenvolvimento', conteudo: '', metodos: 'Expositivo, Explicativo', actividades: '', estrategiaEnsino: '', meiosEnsino: 'Quadro, Giz, Manual', avaliacao: 'Formativa', obs: '' },
  { tempo: '10 min', fase: 'Conclusão', conteudo: '', metodos: 'Trabalho independente', actividades: '', estrategiaEnsino: '', meiosEnsino: 'Quadro, Apagador', avaliacao: 'Formativa', obs: '' },
];

const STATUS_CONFIG = {
  rascunho:   { label: 'Rascunho',   color: Colors.textMuted,  icon: 'document-outline' as const },
  submetido:  { label: 'Submetido',  color: Colors.warning,    icon: 'time-outline' as const },
  aprovado:   { label: 'Aprovado',   color: Colors.success,    icon: 'checkmark-circle' as const },
  rejeitado:  { label: 'Rejeitado',  color: Colors.danger,     icon: 'close-circle' as const },
};

// ─── PDF HTML Generator ───────────────────────────────────────────────────────

function buildPlanoHTML(plano: PlanoAula): string {
  const faseRows = (plano.fases || []).map(f => `
    <tr>
      <td style="font-size:10pt;text-align:center;font-weight:bold;">${f.tempo}</td>
      <td style="font-size:10pt;font-weight:bold;">${f.fase}</td>
      <td style="font-size:9pt;">${(f.conteudo || '').replace(/\n/g, '<br>')}</td>
      <td style="font-size:9pt;">${(f.metodos || '').replace(/\n/g, '<br>')}</td>
      <td style="font-size:9pt;">${(f.actividades || '').replace(/\n/g, '<br>')}</td>
      <td style="font-size:9pt;">${(f.estrategiaEnsino || '').replace(/\n/g, '<br>')}</td>
      <td style="font-size:9pt;">${(f.meiosEnsino || '').replace(/\n/g, '<br>')}</td>
      <td style="font-size:9pt;text-align:center;">${f.avaliacao || ''}</td>
      <td style="font-size:9pt;">${f.obs || ''}</td>
    </tr>`).join('');

  return `<!DOCTYPE html>
<html lang="pt">
<head>
  <meta charset="UTF-8">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Times New Roman', Times, serif; font-size: 11pt; color: #111; background: #fff; }
    .page { width: 297mm; min-height: 210mm; margin: 0 auto; padding: 15mm 18mm; }
    h1 { text-align: center; font-size: 14pt; font-weight: bold; text-transform: uppercase;
         letter-spacing: 1px; margin-bottom: 14px; text-decoration: underline; }
    .info-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 0; border: 1px solid #111;
                 border-collapse: collapse; margin-bottom: 10px; }
    .info-cell { padding: 4px 7px; border: 1px solid #111; font-size: 10pt; line-height: 1.5; }
    .info-cell .lbl { font-weight: bold; }
    .obj-box { border: 1px solid #111; padding: 5px 8px; margin-bottom: 10px; font-size: 10pt; line-height: 1.7; }
    .obj-box .lbl { font-weight: bold; }
    table { width: 100%; border-collapse: collapse; margin-top: 10px; }
    th { background: #ddd; font-size: 10pt; padding: 5px 4px; border: 1px solid #111;
         text-align: center; font-weight: bold; }
    td { border: 1px solid #111; padding: 4px; vertical-align: top; }
    .print-btn {
      display: block; margin: 16px auto; padding: 10px 32px;
      background: #1a2540; color: #fff; border: none; border-radius: 8px;
      font-size: 14px; cursor: pointer; font-weight: bold;
    }
    @media print { .print-btn { display: none; } }
  </style>
</head>
<body>
  <button class="print-btn" onclick="window.print()">🖨 Imprimir / Guardar PDF</button>
  <div class="page">
    <div style="text-align:center;margin-bottom:10px;"><img src="/angola-brasao.png" style="width:55px;height:auto;display:block;margin:0 auto 3px;" alt="Insígnia" onerror="this.style.display='none'" /><p style="font-size:8pt;margin:0;line-height:1.5;">REPÚBLICA DE ANGOLA · MINISTÉRIO DA EDUCAÇÃO · ENSINO GERAL</p></div>
    <h1>Plano de Aula</h1>

    <div class="info-grid">
      <div class="info-cell"><span class="lbl">Nome:</span> ${plano.professorNome}</div>
      <div class="info-cell" style="grid-row:span 2;">
        <span class="lbl">Geral:</span> ${plano.objectivoGeral || ''}
      </div>
      <div class="info-cell" style="grid-row:span 6;">
        <span class="lbl">Objectivos:</span><br><br>
        <span class="lbl">Específicos:</span><br>
        ${(plano.objectivosEspecificos || '').replace(/\n/g, '<br>')}
      </div>
      <div class="info-cell"><span class="lbl">Escola:</span> ${plano.escola}</div>
      <div class="info-cell"><span class="lbl">Data:</span> ${plano.data}</div>
      <div class="info-cell"></div>
      <div class="info-cell"><span class="lbl">Classe:</span> ${plano.classe} &nbsp;&nbsp; <span class="lbl">Turma:</span> ${plano.turmaNome}</div>
      <div class="info-cell"><span class="lbl">Período:</span> ${plano.periodo}</div>
      <div class="info-cell"><span class="lbl">Disciplina:</span> ${plano.disciplina}</div>
      <div class="info-cell"><span class="lbl">Tempo:</span> ${plano.tempo}</div>
      <div class="info-cell"><span class="lbl">Unidade:</span> ${plano.unidade}</div>
      <div class="info-cell"><span class="lbl">Duração:</span> ${plano.duracao}</div>
      <div class="info-cell"><span class="lbl">Sumário:</span> ${plano.sumario}</div>
      <div class="info-cell"><span class="lbl">Ano lectivo:</span> ${plano.anoLetivo}</div>
    </div>

    <div class="obj-box">
      <span class="lbl">Perfil de entrada:</span> ${plano.perfilEntrada || ''}
    </div>
    <div class="obj-box">
      <span class="lbl">Perfil de saída:</span> ${plano.perfilSaida || ''}
    </div>

    <table>
      <thead>
        <tr>
          <th style="width:55px">Tempo</th>
          <th style="width:80px">Fases<br>didácticas</th>
          <th>Conteúdo</th>
          <th style="width:80px">Métodos</th>
          <th>Actividades</th>
          <th style="width:90px">Estratégia de<br>Ensino</th>
          <th style="width:90px">Meios de<br>Ensino</th>
          <th style="width:70px">Avaliação</th>
          <th style="width:50px">Obs</th>
        </tr>
      </thead>
      <tbody>${faseRows}</tbody>
    </table>
  </div>
</body>
</html>`;
}

// ─── Field component ──────────────────────────────────────────────────────────

function Field({
  label, value, onChangeText, multiline = false, placeholder, rows = 1, ...rest
}: {
  label: string; value: string; onChangeText: (v: string) => void;
  multiline?: boolean; placeholder?: string; rows?: number;
  [key: string]: any;
}) {
  return (
    <View style={f.field}>
      <Text style={f.label}>{label}</Text>
      <TextInput
        style={[f.input, multiline && { minHeight: rows * 36, textAlignVertical: 'top' }]}
        value={value}
        onChangeText={onChangeText}
        multiline={multiline}
        placeholder={placeholder || label}
        placeholderTextColor={Colors.textMuted}
        {...rest}
      />
    </View>
  );
}

const f = StyleSheet.create({
  field: { marginBottom: 12 },
  label: { fontSize: 11, fontFamily: 'Inter_600SemiBold', color: Colors.textSecondary, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.4 },
  input: {
    backgroundColor: Colors.backgroundElevated, borderWidth: 1, borderColor: Colors.border,
    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9,
    fontSize: 13, fontFamily: 'Inter_400Regular', color: Colors.text,
    outlineStyle: 'none' as any,
  },
});

// ─── Fase editor ─────────────────────────────────────────────────────────────

function FaseRow({
  fase, index, onChange, onRemove,
}: {
  fase: FaseAula; index: number; onChange: (i: number, fase: FaseAula) => void; onRemove: (i: number) => void;
}) {
  function upd(key: keyof FaseAula, val: string) {
    onChange(index, { ...fase, [key]: val });
  }

  return (
    <View style={fr.card}>
      <View style={fr.header}>
        <View style={fr.headerLeft}>
          <View style={fr.indexBadge}><Text style={fr.indexTxt}>{index + 1}</Text></View>
          <TextInput
            style={fr.faseName}
            value={fase.fase}
            onChangeText={v => upd('fase', v)}
            placeholder="Nome da fase"
            placeholderTextColor={Colors.textMuted}
          />
        </View>
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          <TextInput
            style={fr.tempoInput}
            value={fase.tempo}
            onChangeText={v => upd('tempo', v)}
            placeholder="Tempo"
            placeholderTextColor={Colors.textMuted}
          />
          <TouchableOpacity onPress={() => onRemove(index)} style={fr.removeBtn}>
            <Ionicons name="trash-outline" size={16} color={Colors.danger} />
          </TouchableOpacity>
        </View>
      </View>

      <View style={fr.body}>
        <View style={fr.row2}>
          <View style={{ flex: 1 }}>
            <Text style={fr.lbl}>Conteúdo</Text>
            <TextInput
              style={fr.ta}
              value={fase.conteudo}
              onChangeText={v => upd('conteudo', v)}
              multiline
              placeholder="Conteúdo da fase..."
              placeholderTextColor={Colors.textMuted}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={fr.lbl}>Métodos</Text>
            <TextInput
              style={fr.ta}
              value={fase.metodos}
              onChangeText={v => upd('metodos', v)}
              multiline
              placeholder="Ex: Expositivo, Diálogo..."
              placeholderTextColor={Colors.textMuted}
            />
          </View>
        </View>

        <View style={{ marginTop: 8 }}>
          <Text style={fr.lbl}>Actividades</Text>
          <TextInput
            style={[fr.ta, { minHeight: 60 }]}
            value={fase.actividades}
            onChangeText={v => upd('actividades', v)}
            multiline
            placeholder="Descreva as actividades do professor e dos alunos..."
            placeholderTextColor={Colors.textMuted}
          />
        </View>

        <View style={fr.row2}>
          <View style={{ flex: 1 }}>
            <Text style={fr.lbl}>Estratégia de Ensino</Text>
            <TextInput
              style={fr.ta}
              value={fase.estrategiaEnsino}
              onChangeText={v => upd('estrategiaEnsino', v)}
              multiline
              placeholder="Ex: Experiência do aluno..."
              placeholderTextColor={Colors.textMuted}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={fr.lbl}>Meios de Ensino</Text>
            <TextInput
              style={fr.ta}
              value={fase.meiosEnsino}
              onChangeText={v => upd('meiosEnsino', v)}
              multiline
              placeholder="Ex: Quadro, Giz, Manual..."
              placeholderTextColor={Colors.textMuted}
            />
          </View>
        </View>

        <View style={fr.row2}>
          <View style={{ flex: 1 }}>
            <Text style={fr.lbl}>Avaliação</Text>
            <TextInput
              style={fr.ta}
              value={fase.avaliacao}
              onChangeText={v => upd('avaliacao', v)}
              placeholder="Ex: Diagnóstica, Formativa..."
              placeholderTextColor={Colors.textMuted}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={fr.lbl}>Observações</Text>
            <TextInput
              style={fr.ta}
              value={fase.obs}
              onChangeText={v => upd('obs', v)}
              placeholder="..."
              placeholderTextColor={Colors.textMuted}
            />
          </View>
        </View>
      </View>
    </View>
  );
}

const fr = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface, borderRadius: 14, borderWidth: 1,
    borderColor: Colors.border, marginBottom: 12, overflow: 'hidden',
  },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: Colors.backgroundElevated, paddingHorizontal: 12, paddingVertical: 8,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  indexBadge: {
    width: 24, height: 24, borderRadius: 12, backgroundColor: Colors.gold,
    alignItems: 'center', justifyContent: 'center',
  },
  indexTxt: { fontSize: 12, fontFamily: 'Inter_700Bold', color: '#fff' },
  faseName: {
    flex: 1, fontSize: 14, fontFamily: 'Inter_600SemiBold', color: Colors.text,
    outlineStyle: 'none' as any,
  },
  tempoInput: {
    fontSize: 12, fontFamily: 'Inter_500Medium', color: Colors.gold,
    backgroundColor: Colors.gold + '18', borderRadius: 8, paddingHorizontal: 10,
    paddingVertical: 4, outlineStyle: 'none' as any, minWidth: 60, textAlign: 'center',
  },
  removeBtn: { padding: 4 },
  body: { padding: 12 },
  row2: { flexDirection: 'row', gap: 10, marginTop: 8 },
  lbl: { fontSize: 10, fontFamily: 'Inter_600SemiBold', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4 },
  ta: {
    backgroundColor: Colors.backgroundElevated, borderWidth: 1, borderColor: Colors.border,
    borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7,
    fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.text,
    minHeight: 44, textAlignVertical: 'top', outlineStyle: 'none' as any,
  },
});

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function ProfessorPlanoAulaScreen() {
  const { user } = useAuth();
  const { professores, turmas } = useData();
  const { config } = useConfig();
  const { anoSelecionado } = useAnoAcademico();
  const insets = useSafeAreaInsets();

  const prof = useMemo(
    () => professores.find(p => (user?.id && p.utilizadorId === user.id) || p.email === user?.email),
    [professores, user]
  );

  const minhasTurmas = useMemo(
    () => prof ? turmas.filter(t => (prof.turmasIds?.includes(t.id) || (t.professoresIds ?? []).includes(prof.id)) && t.ativo) : [],
    [prof, turmas]
  );

  const anoAtual = anoSelecionado?.ano || String(new Date().getFullYear());

  const [planos, setPlanos] = useState<PlanoAula[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [view, setView] = useState<'list' | 'form' | 'preview'>('list');
  const [editPlano, setEditPlano] = useState<PlanoAula | null>(null);
  const [previewHTML, setPreviewHTML] = useState('');

  // Form state
  const [form, setForm] = useState<Omit<PlanoAula, 'id' | 'createdAt' | 'updatedAt' | 'professorId' | 'professorNome' | 'status' | 'observacaoDirector' | 'aprovadoPor' | 'aprovadoEm'>>({
    turmaId: '', turmaNome: '', disciplina: '', unidade: '', sumario: '',
    classe: '', escola: config.nomeEscola,
    perfilEntrada: '', perfilSaida: '',
    data: new Date().toISOString().split('T')[0],
    periodo: '1.º Período', tempo: '45 min', duracao: '45 min',
    anoLetivo: anoAtual,
    objectivoGeral: '', objectivosEspecificos: '',
    fases: FASES_DEFAULT,
  });

  const loadPlanos = useCallback(async () => {
    if (!prof) { setLoading(false); return; }
    setLoading(true);
    try {
      const data = await api.get<PlanoAula[]>(`/api/planos-aula/professor/${prof.id}`);
      setPlanos(data || []);
    } catch { setPlanos([]); }
    finally { setLoading(false); }
  }, [prof]);

  useEffect(() => { loadPlanos(); }, [loadPlanos]);

  function startNew() {
    setEditPlano(null);
    setForm({
      turmaId: minhasTurmas[0]?.id || '', turmaNome: minhasTurmas[0]?.nome || '',
      disciplina: prof?.disciplinas?.[0] || '', unidade: '', sumario: '',
      classe: minhasTurmas[0]?.classe || '', escola: config.nomeEscola,
      perfilEntrada: '', perfilSaida: '',
      data: new Date().toISOString().split('T')[0],
      periodo: '1.º Período', tempo: '45 min', duracao: '45 min',
      anoLetivo: anoAtual,
      objectivoGeral: '', objectivosEspecificos: '',
      fases: JSON.parse(JSON.stringify(FASES_DEFAULT)),
    });
    setView('form');
  }

  function startEdit(plano: PlanoAula) {
    setEditPlano(plano);
    setForm({
      turmaId: plano.turmaId || '', turmaNome: plano.turmaNome, disciplina: plano.disciplina,
      unidade: plano.unidade, sumario: plano.sumario, classe: plano.classe, escola: plano.escola,
      perfilEntrada: plano.perfilEntrada, perfilSaida: plano.perfilSaida,
      data: plano.data, periodo: plano.periodo, tempo: plano.tempo, duracao: plano.duracao,
      anoLetivo: plano.anoLetivo, objectivoGeral: plano.objectivoGeral,
      objectivosEspecificos: plano.objectivosEspecificos,
      fases: JSON.parse(JSON.stringify(plano.fases || FASES_DEFAULT)),
    });
    setView('form');
  }

  function openPreview(plano: PlanoAula) {
    setPreviewHTML(buildPlanoHTML(plano));
    setView('preview');
  }

  async function handleSave(submeter = false) {
    if (!prof) return;
    if (!form.disciplina.trim()) {
      webAlert('Aviso', 'A disciplina é obrigatória.');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...form,
        professorId: prof.id,
        professorNome: prof.nome,
        status: submeter ? 'submetido' : (editPlano?.status === 'aprovado' ? 'aprovado' : 'rascunho'),
      };
      if (editPlano) {
        const updated = await api.put<PlanoAula>(`/api/planos-aula/${editPlano.id}`, payload);
        setPlanos(prev => prev.map(p => p.id === editPlano.id ? { ...p, ...updated } : p));
      } else {
        const created = await api.post<PlanoAula>('/api/planos-aula', payload);
        setPlanos(prev => [created, ...prev]);
      }
      setView('list');
    } catch (e: any) {
      webAlert('Erro', e?.message || 'Não foi possível guardar o plano.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    webAlert('Eliminar', 'Tem a certeza que deseja eliminar este plano?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar', style: 'destructive', onPress: async () => {
          try {
            await api.delete(`/api/planos-aula/${id}`);
            setPlanos(prev => prev.filter(p => p.id !== id));
          } catch { webAlert('Erro', 'Não foi possível eliminar.'); }
        }
      }
    ]);
  }

  function updateFase(i: number, fase: FaseAula) {
    setForm(prev => {
      const fases = [...prev.fases];
      fases[i] = fase;
      return { ...prev, fases };
    });
  }

  function addFase() {
    setForm(prev => ({
      ...prev,
      fases: [...prev.fases, { tempo: '10 min', fase: 'Nova Fase', conteudo: '', metodos: '', actividades: '', estrategiaEnsino: '', meiosEnsino: '', avaliacao: '', obs: '' }],
    }));
  }

  function removeFase(i: number) {
    setForm(prev => ({ ...prev, fases: prev.fases.filter((_, idx) => idx !== i) }));
  }

  function handlePrint() {
    if (Platform.OS === 'web') {
      const iframe = document.getElementById('plano-preview-iframe') as HTMLIFrameElement;
      if (iframe?.contentWindow) iframe.contentWindow.print();
    }
  }

  // ─── Render list ──────────────────────────────────────────────────────────

  function renderList() {
    if (loading) {
      return (
        <View style={{ padding: 16 }}>
          <SkeletonList rows={6} />
        </View>
      );
    }

    if (!prof) {
      return (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
          <Ionicons name="person-outline" size={56} color={Colors.textMuted} />
          <Text style={{ fontSize: 18, fontFamily: 'Inter_700Bold', color: Colors.text, marginTop: 16, textAlign: 'center' }}>
            Perfil de professor não encontrado
          </Text>
          <Text style={{ fontSize: 14, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 8, textAlign: 'center', lineHeight: 20 }}>
            O seu perfil de professor ainda não foi configurado. Contacte o administrador da escola para que o seu perfil seja criado.
          </Text>
        </View>
      );
    }

    return (
      <View style={{ flex: 1 }}>
        <TouchableOpacity style={s.newBtn} onPress={startNew}>
          <Ionicons name="add-circle" size={20} color="#fff" />
          <Text style={s.newBtnTxt}>Novo Plano de Aula</Text>
        </TouchableOpacity>

        {planos.length === 0 ? (
          <View style={s.emptyWrap}>
            <Ionicons name="document-outline" size={52} color={Colors.textMuted} />
            <Text style={s.emptyTitle}>Nenhum plano criado</Text>
            <Text style={s.emptySub}>Crie o seu primeiro plano de aula para esta disciplina.</Text>
          </View>
        ) : (
          <FlatList
            data={planos}
            keyExtractor={p => p.id}
            contentContainerStyle={{ padding: 16, gap: 10 }}
            renderItem={({ item: plano }) => {
              const st = STATUS_CONFIG[plano.status] || STATUS_CONFIG.rascunho;
              return (
                <View style={s.card}>
                  <View style={s.cardTop}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.cardDisciplina}>{plano.disciplina}</Text>
                      <Text style={s.cardSumario} numberOfLines={1}>{plano.sumario || plano.unidade || '—'}</Text>
                      <Text style={s.cardMeta}>{plano.turmaNome || '—'} · {plano.data || '—'} · {plano.anoLetivo}</Text>
                    </View>
                    <View style={[s.statusBadge, { borderColor: st.color + '55', backgroundColor: st.color + '18' }]}>
                      <Ionicons name={st.icon} size={12} color={st.color} />
                      <Text style={[s.statusTxt, { color: st.color }]}>{st.label}</Text>
                    </View>
                  </View>

                  {plano.observacaoDirector && (
                    <View style={s.obsBox}>
                      <Ionicons name="chatbubble-outline" size={12} color={Colors.info} />
                      <Text style={s.obsText} numberOfLines={2}>{plano.observacaoDirector}</Text>
                    </View>
                  )}

                  <View style={s.cardActions}>
                    <TouchableOpacity style={s.actionBtn} onPress={() => openPreview(plano)}>
                      <Ionicons name="print-outline" size={16} color={Colors.info} />
                      <Text style={[s.actionBtnTxt, { color: Colors.info }]}>PDF</Text>
                    </TouchableOpacity>
                    {plano.status !== 'aprovado' && (
                      <TouchableOpacity style={s.actionBtn} onPress={() => startEdit(plano)}>
                        <Ionicons name="create-outline" size={16} color={Colors.gold} />
                        <Text style={[s.actionBtnTxt, { color: Colors.gold }]}>Editar</Text>
                      </TouchableOpacity>
                    )}
                    {plano.status === 'rascunho' && (
                      <TouchableOpacity
                        style={[s.actionBtn, { borderColor: Colors.success + '44', backgroundColor: Colors.success + '12' }]}
                        onPress={async () => {
                          try {
                            const updated = await api.put<PlanoAula>(`/api/planos-aula/${plano.id}`, { status: 'submetido' });
                            setPlanos(prev => prev.map(p => p.id === plano.id ? { ...p, ...updated } : p));
                          } catch { webAlert('Erro', 'Não foi possível submeter.'); }
                        }}
                      >
                        <Ionicons name="send-outline" size={16} color={Colors.success} />
                        <Text style={[s.actionBtnTxt, { color: Colors.success }]}>Submeter</Text>
                      </TouchableOpacity>
                    )}
                    {plano.status !== 'aprovado' && (
                      <TouchableOpacity style={[s.actionBtn, { borderColor: Colors.danger + '44' }]} onPress={() => handleDelete(plano.id)}>
                        <Ionicons name="trash-outline" size={16} color={Colors.danger} />
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              );
            }}
          />
        )}
      </View>
    );
  }

  // ─── Render form ──────────────────────────────────────────────────────────

  function renderForm() {
    return (
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 100 }} keyboardShouldPersistTaps="handled">
        <Text style={s.sectionTitle}>
          <Ionicons name="information-circle-outline" size={16} color={Colors.gold} /> Informações Gerais
        </Text>

        <View style={s.formRow2}>
          <View style={{ flex: 1 }}>
            <Text style={f.label}>Turma</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                {minhasTurmas.map(t => (
                  <TouchableOpacity
                    key={t.id}
                    style={[s.chip, form.turmaId === t.id && { backgroundColor: Colors.gold, borderColor: Colors.gold }]}
                    onPress={() => setForm(prev => ({ ...prev, turmaId: t.id, turmaNome: t.nome, classe: t.classe }))}
                  >
                    <Text style={[s.chipTxt, form.turmaId === t.id && { color: '#fff' }]}>{t.nome}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          </View>
        </View>

        <View style={s.formRow2}>
          <View style={{ flex: 1 }}>
            <Field label="Disciplina" value={form.disciplina} onChangeText={v => setForm(p => ({ ...p, disciplina: v }))} placeholder="Ex: Geografia" returnKeyType="next" blurOnSubmit={false} />
          </View>
          <View style={{ flex: 1 }}>
            <Field label="Unidade" value={form.unidade} onChangeText={v => setForm(p => ({ ...p, unidade: v }))} placeholder="Ex: O Território Angolano" returnKeyType="next" blurOnSubmit={false} />
          </View>
        </View>

        <Field label="Sumário" value={form.sumario} onChangeText={v => setForm(p => ({ ...p, sumario: v }))} placeholder="Tema da aula" returnKeyType="next" blurOnSubmit={false} />

        <View style={s.formRow2}>
          <View style={{ flex: 1 }}>
            <Field label="Classe" value={form.classe} onChangeText={v => setForm(p => ({ ...p, classe: v }))} placeholder="Ex: 8ª" returnKeyType="next" blurOnSubmit={false} />
          </View>
          <View style={{ flex: 1 }}>
            <View style={f.field}>
              <Text style={f.label}>Data</Text>
              <DateInput style={f.input} value={form.data} onChangeText={v => setForm(p => ({ ...p, data: v }))} />
            </View>
          </View>
        </View>

        <View style={s.formRow3}>
          <View style={{ flex: 1 }}>
            <Field label="Período" value={form.periodo} onChangeText={v => setForm(p => ({ ...p, periodo: v }))} placeholder="Ex: 1.º Período" returnKeyType="next" blurOnSubmit={false} />
          </View>
          <View style={{ flex: 1 }}>
            <Field label="Tempo" value={form.tempo} onChangeText={v => setForm(p => ({ ...p, tempo: v }))} placeholder="Ex: 45 min" returnKeyType="next" blurOnSubmit={false} />
          </View>
          <View style={{ flex: 1 }}>
            <Field label="Duração" value={form.duracao} onChangeText={v => setForm(p => ({ ...p, duracao: v }))} placeholder="Ex: 45 min" returnKeyType="done" onSubmitEditing={() => handleSave(false)} />
          </View>
        </View>

        <View style={s.formRow2}>
          <View style={{ flex: 1 }}>
            <Field label="Ano Lectivo" value={form.anoLetivo} onChangeText={v => setForm(p => ({ ...p, anoLetivo: v }))} />
          </View>
          <View style={{ flex: 1 }}>
            <Field label="Escola" value={form.escola} onChangeText={v => setForm(p => ({ ...p, escola: v }))} />
          </View>
        </View>

        <Text style={[s.sectionTitle, { marginTop: 8 }]}>
          <Ionicons name="flag-outline" size={16} color={Colors.gold} /> Objectivos
        </Text>
        <Field label="Objectivo Geral" value={form.objectivoGeral} onChangeText={v => setForm(p => ({ ...p, objectivoGeral: v }))} multiline rows={2} placeholder="Ex: Conhecer o território angolano" />
        <Field label="Objectivos Específicos" value={form.objectivosEspecificos} onChangeText={v => setForm(p => ({ ...p, objectivosEspecificos: v }))} multiline rows={4} placeholder="• Definir divisão administrativa&#10;• Identificar as etapas de evolução..." />

        <Text style={[s.sectionTitle, { marginTop: 8 }]}>
          <Ionicons name="person-outline" size={16} color={Colors.gold} /> Perfis
        </Text>
        <Field label="Perfil de Entrada" value={form.perfilEntrada} onChangeText={v => setForm(p => ({ ...p, perfilEntrada: v }))} multiline rows={2} placeholder="O que os alunos já sabem..." />
        <Field label="Perfil de Saída" value={form.perfilSaida} onChangeText={v => setForm(p => ({ ...p, perfilSaida: v }))} multiline rows={2} placeholder="O que os alunos serão capazes de fazer..." />

        <View style={s.fasesHeader}>
          <Text style={s.sectionTitle}>
            <Ionicons name="list-outline" size={16} color={Colors.gold} /> Fases da Aula
          </Text>
          <TouchableOpacity style={s.addFaseBtn} onPress={addFase}>
            <Ionicons name="add" size={16} color={Colors.gold} />
            <Text style={s.addFaseTxt}>Adicionar Fase</Text>
          </TouchableOpacity>
        </View>

        {form.fases.map((fase, i) => (
          <FaseRow key={i} fase={fase} index={i} onChange={updateFase} onRemove={removeFase} />
        ))}

        <View style={s.formActions}>
          <TouchableOpacity style={s.cancelBtn} onPress={() => setView('list')} disabled={saving}>
            <Text style={s.cancelBtnTxt}>Cancelar</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.saveBtn} onPress={() => handleSave(false)} disabled={saving}>
            {saving ? <AppLoader size="small" color="#fff" /> : <Ionicons name="save-outline" size={18} color="#fff" />}
            <Text style={s.saveBtnTxt}>Guardar Rascunho</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.saveBtn, { backgroundColor: Colors.success }]}
            onPress={() => handleSave(true)}
            disabled={saving}
          >
            <Ionicons name="send-outline" size={18} color="#fff" />
            <Text style={s.saveBtnTxt}>Submeter</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    );
  }

  // ─── Render preview ───────────────────────────────────────────────────────

  function renderPreview() {
    return (
      <View style={{ flex: 1 }}>
        <View style={s.previewBar}>
          <TouchableOpacity onPress={() => setView('list')} style={{ padding: 4 }}>
            <Ionicons name="arrow-back" size={20} color={Colors.text} />
          </TouchableOpacity>
          <Text style={s.previewBarTitle}>Pré-visualização do Plano</Text>
          <TouchableOpacity style={s.printBtnInner} onPress={handlePrint}>
            <Ionicons name="print" size={16} color="#fff" />
            <Text style={s.printBtnTxt}>Imprimir / PDF</Text>
          </TouchableOpacity>
        </View>
        {Platform.OS === 'web' ? (
          <iframe
            id="plano-preview-iframe"
            srcDoc={previewHTML}
            style={{ flex: 1, border: 'none', width: '100%', height: '100%', minHeight: 600 } as any}
            title="Plano de Aula"
          />
        ) : (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 }}>
            <Ionicons name="document-text" size={48} color={Colors.gold} />
            <Text style={{ color: Colors.text, fontFamily: 'Inter_600SemiBold', fontSize: 16, textAlign: 'center' }}>
              Impressão disponível na versão web
            </Text>
          </View>
        )}
      </View>
    );
  }

  // ─── Main render ─────────────────────────────────────────────────────────

  return (
    <View style={[s.container, { paddingBottom: insets.bottom }]}>
      {view !== 'preview' && (
        <TopBar
          title="Planos de Aula"
          subtitle={view === 'form' ? (editPlano ? 'Editar plano' : 'Novo plano') : `${planos.length} plano(s)`}
          rightAction={view === 'form' ? undefined : { icon: 'add-circle-outline', onPress: startNew }}
        />
      )}

      {view === 'list' && renderList()}
      {view === 'form' && renderForm()}
      {view === 'preview' && renderPreview()}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  newBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: Colors.gold, borderRadius: 12, margin: 16, padding: 14,
  },
  newBtnTxt: { fontSize: 15, fontFamily: 'Inter_700Bold', color: '#fff' },

  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 32 },
  emptyTitle: { fontSize: 17, fontFamily: 'Inter_700Bold', color: Colors.text },
  emptySub: { fontSize: 13, fontFamily: 'Inter_400Regular', color: Colors.textMuted, textAlign: 'center' },

  card: {
    backgroundColor: Colors.surface, borderRadius: 14, borderWidth: 1,
    borderColor: Colors.border, overflow: 'hidden',
  },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 14 },
  cardDisciplina: { fontSize: 15, fontFamily: 'Inter_700Bold', color: Colors.text },
  cardSumario: { fontSize: 13, fontFamily: 'Inter_400Regular', color: Colors.textSecondary, marginTop: 2 },
  cardMeta: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 4 },

  statusBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderRadius: 8, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 4,
  },
  statusTxt: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },

  obsBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 6,
    backgroundColor: Colors.info + '12', borderTopWidth: 1, borderTopColor: Colors.border,
    paddingHorizontal: 14, paddingVertical: 8,
  },
  obsText: { flex: 1, fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textSecondary },

  cardActions: {
    flexDirection: 'row', gap: 8, padding: 10,
    borderTopWidth: 1, borderTopColor: Colors.border,
    backgroundColor: Colors.backgroundElevated,
  },
  actionBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderWidth: 1, borderColor: Colors.border, borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 6, backgroundColor: Colors.surface,
  },
  actionBtnTxt: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },

  sectionTitle: {
    fontSize: 13, fontFamily: 'Inter_700Bold', color: Colors.textSecondary,
    textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 12,
  },

  formRow2: { flexDirection: 'row', gap: 10 },
  formRow3: { flexDirection: 'row', gap: 10 },

  chip: {
    borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6,
    borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface,
  },
  chipTxt: { fontSize: 13, fontFamily: 'Inter_500Medium', color: Colors.textSecondary },

  fasesHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 12, marginTop: 8,
  },
  addFaseBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderRadius: 8, borderWidth: 1, borderColor: Colors.gold + '55',
    paddingHorizontal: 12, paddingVertical: 6,
  },
  addFaseTxt: { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: Colors.gold },

  formActions: {
    flexDirection: 'row', gap: 10, marginTop: 24, flexWrap: 'wrap',
  },
  cancelBtn: {
    borderRadius: 10, borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: 18, paddingVertical: 12, backgroundColor: Colors.surface,
  },
  cancelBtnTxt: { fontSize: 14, fontFamily: 'Inter_500Medium', color: Colors.textSecondary },
  saveBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: Colors.gold, borderRadius: 10, paddingVertical: 12,
  },
  saveBtnTxt: { fontSize: 14, fontFamily: 'Inter_700Bold', color: '#fff' },

  previewBar: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border,
    padding: 12, paddingHorizontal: 16,
  },
  previewBarTitle: { flex: 1, fontSize: 14, fontFamily: 'Inter_700Bold', color: Colors.text },
  printBtnInner: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: Colors.info, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8,
  },
  printBtnTxt: { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: '#fff' },
});
