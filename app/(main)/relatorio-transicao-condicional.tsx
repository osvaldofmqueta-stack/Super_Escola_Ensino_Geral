import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '@/constants/colors';
import { useAuth, getAuthToken } from '@/context/AuthContext';
import { useAnoAcademico } from '@/context/AnoAcademicoContext';
import TopBar from '@/components/TopBar';

type SituacaoAluno = 'transita_condicional' | 'reprovado' | 'aprovado';

interface AlunoRelatorio {
  alunoId: string;
  nomeAluno: string;
  turmaId: string;
  turmaNome: string;
  classe: string;
  anoLetivo: string;
  situacao: SituacaoAluno;
  motivoSituacao: string;
  disciplinasCondicionais: { disciplina: string; nota: number }[];
  disciplinasReprovadas: { disciplina: string; nota: number }[];
  restricaoLPAreaAplicada: boolean;
}

interface RelatorioData {
  alunos: AlunoRelatorio[];
  config: {
    notaMin: number;
    notaMinAbsoluta: number;
    maxNegICiclo: number;
    maxNegIICiclo: number;
    restricaoLPArea: boolean;
  };
  totalCondicional: number;
  totalReprovadoExcesso: number;
  anoLetivo: string;
}

function byClasse(alunos: AlunoRelatorio[], classe: string) {
  return alunos.filter(a => a.classe === classe);
}

type FiltroClasse = 'todos' | '7ª Classe' | '8ª Classe' | '10ª Classe' | '11ª Classe';
type FiltroSituacao = 'todos' | 'transita_condicional' | 'reprovado';

export default function RelatorioTransicaoCondicional() {
  const insets = useSafeAreaInsets();
  const { anoSelecionado } = useAnoAcademico();
  const { user } = useAuth();

  const [dados, setDados] = useState<RelatorioData | null>(null);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState('');
  const [filtroClasse, setFiltroClasse] = useState<FiltroClasse>('todos');
  const [filtroSituacao, setFiltroSituacao] = useState<FiltroSituacao>('todos');
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set());

  const podeVer = user
    ? ['ceo','pca','admin','director','chefe_secretaria','secretaria','pedagogico','coordenador_curso'].includes(user.role)
    : false;

  const carregarRelatorio = useCallback(async () => {
    setLoading(true);
    setErro('');
    try {
      const token = await getAuthToken();
      const anoParam = anoSelecionado?.ano ? `?anoLetivo=${encodeURIComponent(anoSelecionado.ano)}` : '';
      const res = await fetch(`/api/relatorio/transicao-condicional${anoParam}`, {
        headers: { Authorization: `Bearer ${token ?? ''}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Erro desconhecido');
      setDados(json as RelatorioData);
    } catch (e: any) {
      setErro(e.message ?? 'Erro ao carregar relatório');
    } finally {
      setLoading(false);
    }
  }, [anoSelecionado]);

  const handlePrint = useCallback(() => {
    if (!dados) return;
    const alunos = alunosFiltrados;
    const anoLetivo = dados.anoLetivo;
    const agora = `${new Date().toLocaleDateString('pt-PT')} ${new Date().toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}`;
    const totalCond   = alunos.filter(a => a.situacao === 'transita_condicional').length;
    const totalReprov = alunos.filter(a => a.situacao === 'reprovado').length;
    const totalLPArea = alunos.filter(a => a.restricaoLPAreaAplicada).length;

    const porClasse = ['7ª Classe','8ª Classe','10ª Classe','11ª Classe'].map(cls => {
      const lst = alunos.filter(a => a.classe === cls);
      return lst.length > 0
        ? `${cls}: ${lst.filter(a=>a.situacao==='transita_condicional').length} cond. / ${lst.filter(a=>a.situacao==='reprovado').length} não transita`
        : null;
    }).filter(Boolean).join(' &nbsp;·&nbsp; ');

    const html = `<!DOCTYPE html><html lang="pt"><head><meta charset="UTF-8"><title>Relatório Transição Condicional — Art. 23 §10</title>
<style>
  body { font-family: Arial, sans-serif; font-size: 11px; margin: 18px; color: #111; }
  h1 { font-size: 15px; margin-bottom: 2px; color: #0d1f35; }
  .decreto { font-size: 10px; color: #555; margin-bottom: 14px; }
  .cfg-box { background: #f8f9fa; border: 1px solid #dee2e6; border-radius: 6px; padding: 10px 14px; margin-bottom: 14px; display: flex; gap: 24px; }
  .cfg-item { text-align: center; }
  .cfg-val { font-size: 20px; font-weight: bold; color: #0d1f35; }
  .cfg-lbl { font-size: 9px; color: #888; }
  .resumo { background: #f0f4ff; border-radius: 6px; padding: 8px 14px; margin-bottom: 14px; font-size: 10px; color: #334; }
  .resumo strong { color: #0d1f35; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 14px; }
  thead th { background: #0d1f35; color: #fff; font-weight: bold; padding: 7px 6px; text-align: left; font-size: 10px; border: 1px solid #0d1f35; }
  td { padding: 5px 6px; border: 1px solid #e0e0e0; font-size: 10px; vertical-align: top; }
  .row-cond td { background: #fffbeb; }
  .row-reprov td { background: #fee2e2; }
  .badge-c { display:inline-block;background:#f59e0b;color:#fff;border-radius:3px;padding:1px 5px;font-size:9px;font-weight:bold; }
  .badge-r { display:inline-block;background:#dc2626;color:#fff;border-radius:3px;padding:1px 5px;font-size:9px;font-weight:bold; }
  .badge-lp { display:inline-block;background:#7c3aed;color:#fff;border-radius:3px;padding:1px 5px;font-size:9px;font-weight:bold;margin-left:3px; }
  .nota-neg { font-weight:bold;color:#dc2626; }
  .footer { font-size: 9px; color: #aaa; border-top: 1px solid #eee; padding-top: 8px; }
  @media print { @page { margin: 12mm; } }
</style></head><body>
<h1>Relatório de Transição Condicional — Art. 23 §10</h1>
<div class="decreto">Decreto Executivo nº 04/2026 &nbsp;|&nbsp; Ano Lectivo: <strong>${anoLetivo}</strong> &nbsp;|&nbsp; Gerado em: ${agora}</div>

<div class="cfg-box">
  <div class="cfg-item"><div class="cfg-val">${dados.config.maxNegICiclo}</div><div class="cfg-lbl">I Ciclo (7ª/8ª)<br>máx. negativos</div></div>
  <div class="cfg-item"><div class="cfg-val">${dados.config.maxNegIICiclo}</div><div class="cfg-lbl">II Ciclo (10ª/11ª)<br>máx. negativos</div></div>
  <div class="cfg-item"><div class="cfg-val" style="font-size:14px;padding-top:3px">${dados.config.restricaoLPArea ? '✓ Activa' : '✗ Inact.'}</div><div class="cfg-lbl">Restrição LP+Área<br>(II Ciclo)</div></div>
  <div class="cfg-item"><div class="cfg-val" style="color:#f59e0b">${totalCond}</div><div class="cfg-lbl">Transita c/<br>condição</div></div>
  <div class="cfg-item"><div class="cfg-val" style="color:#dc2626">${totalReprov}</div><div class="cfg-lbl">Não transita<br>(excesso/restrição)</div></div>
  ${totalLPArea > 0 ? `<div class="cfg-item"><div class="cfg-val" style="color:#7c3aed">${totalLPArea}</div><div class="cfg-lbl">Restrição<br>LP+Área</div></div>` : ''}
</div>

${porClasse ? `<div class="resumo"><strong>Por classe:</strong> ${porClasse}</div>` : ''}

<table>
  <thead><tr>
    <th style="width:22px">#</th>
    <th>Nome do Aluno</th>
    <th>Turma</th>
    <th>Classe</th>
    <th>Situação</th>
    <th>Disciplinas negativas (7–${dados.config.notaMin - 1} val.)</th>
    <th>Motivo / Observações</th>
  </tr></thead>
  <tbody>
    ${alunos.map((a, i) => `<tr class="${a.situacao === 'reprovado' ? 'row-reprov' : 'row-cond'}">
      <td style="text-align:center;color:#888">${i + 1}</td>
      <td><strong>${a.nomeAluno}</strong></td>
      <td>${a.turmaNome}</td>
      <td>${a.classe}</td>
      <td>
        ${a.situacao === 'reprovado'
          ? '<span class="badge-r">NÃO TRANSITA</span>'
          : '<span class="badge-c">TRANSITA C/ CONDIÇÃO</span>'}
        ${a.restricaoLPAreaAplicada ? '<span class="badge-lp">LP+ÁREA</span>' : ''}
      </td>
      <td>${a.disciplinasCondicionais.map(d =>
        `<span class="nota-neg">${d.disciplina}</span> <span style="color:#666">(${d.nota.toFixed(1)} val.)</span>`
      ).join('<br>')}</td>
      <td style="color:#555;font-size:9px">${a.motivoSituacao}</td>
    </tr>`).join('')}
  </tbody>
</table>

<div class="footer">
  Nota mín. aprovação: ${dados.config.notaMin} val. &nbsp;|&nbsp; Nota mín. absoluta: ${dados.config.notaMinAbsoluta} val. &nbsp;|&nbsp;
  I Ciclo: limite ${dados.config.maxNegICiclo} negativo(s) &nbsp;|&nbsp; II Ciclo: limite ${dados.config.maxNegIICiclo} negativo(s) &nbsp;|&nbsp;
  Restrição LP+Área: ${dados.config.restricaoLPArea ? 'Activa' : 'Inactiva'}<br>
  Documento gerado automaticamente pelo SIGA — Super Escola · Queta Tech, Lda.
</div>
</body></html>`;
    if (Platform.OS === 'web') {
      const w = window.open('', '_blank');
      if (w) { w.document.write(html); w.document.close(); w.print(); }
    }
  }, [dados, filtroClasse, filtroSituacao]);

  const toggleExpandido = (id: string) => {
    setExpandidos(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const alunosFiltrados = dados?.alunos.filter(a => {
    if (filtroClasse !== 'todos' && a.classe !== filtroClasse) return false;
    if (filtroSituacao !== 'todos' && a.situacao !== filtroSituacao) return false;
    return true;
  }) ?? [];

  const CLASSES: FiltroClasse[] = ['todos', '7ª Classe', '8ª Classe', '10ª Classe', '11ª Classe'];
  const SITUACOES: { key: FiltroSituacao; label: string; cor: string }[] = [
    { key: 'todos', label: 'Todos', cor: Colors.textMuted },
    { key: 'transita_condicional', label: 'C/ Condição', cor: '#d97706' },
    { key: 'reprovado', label: 'Não Transita', cor: Colors.danger },
  ];

  if (!podeVer) {
    return (
      <View style={s.screen}>
        <TopBar title="Relatório Transição Condicional" />
        <View style={s.centrado}>
          <Ionicons name="lock-closed" size={40} color={Colors.textMuted} />
          <Text style={s.semPermissao}>Sem permissão para aceder a este relatório.</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={s.screen}>
      <TopBar title="Transição Condicional" subtitle="Art. 23 §10 — Relatório" />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 24 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Cabeçalho com botões */}
        <View style={s.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={s.headerTitle}>Transição Condicional</Text>
            <Text style={s.headerSub}>
              {anoSelecionado?.ano ? `Ano Lectivo ${anoSelecionado.ano}` : 'Seleccione o ano lectivo'}
            </Text>
          </View>
          <TouchableOpacity style={s.btnCarregar} onPress={carregarRelatorio} disabled={loading}>
            {loading
              ? <ActivityIndicator size="small" color="#fff" />
              : <><Ionicons name="refresh" size={14} color="#fff" /><Text style={s.btnCarregarTxt}>Gerar</Text></>}
          </TouchableOpacity>
          {dados && (
            <TouchableOpacity style={[s.btnCarregar, { backgroundColor: Colors.success, marginLeft: 8 }]} onPress={handlePrint}>
              <Ionicons name="print" size={14} color="#fff" />
              <Text style={s.btnCarregarTxt}>Imprimir</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Configuração activa */}
        {dados && (
          <View style={s.configCard}>
            <Text style={s.configTitle}>Configuração activa (Art. 23 §10)</Text>
            <View style={s.configRow}>
              <View style={s.configItem}>
                <Text style={s.configValor}>{dados.config.maxNegICiclo}</Text>
                <Text style={s.configLabel}>I Ciclo{'\n'}(7ª/8ª)</Text>
              </View>
              <View style={[s.configItem, { borderLeftWidth: 1, borderLeftColor: Colors.border }]}>
                <Text style={s.configValor}>{dados.config.maxNegIICiclo}</Text>
                <Text style={s.configLabel}>II Ciclo{'\n'}(10ª/11ª)</Text>
              </View>
              <View style={[s.configItem, { borderLeftWidth: 1, borderLeftColor: Colors.border }]}>
                <Text style={[s.configValor, { fontSize: 13 }]}>{dados.config.restricaoLPArea ? '✓' : '✗'}</Text>
                <Text style={s.configLabel}>Restrição{'\n'}LP+Área</Text>
              </View>
            </View>
          </View>
        )}

        {/* Resumo global */}
        {dados && (
          <>
            <View style={s.resumoRow}>
              <View style={[s.resumoCard, { backgroundColor: '#fffbeb' }]}>
                <Text style={[s.resumoNum, { color: '#d97706' }]}>{dados.totalCondicional}</Text>
                <Text style={s.resumoLabel}>Transita C/ Condição</Text>
              </View>
              <View style={[s.resumoCard, { backgroundColor: '#fee2e2', marginLeft: 8 }]}>
                <Text style={[s.resumoNum, { color: Colors.danger }]}>{dados.totalReprovadoExcesso}</Text>
                <Text style={s.resumoLabel}>Não Transita{'\n'}(excesso/restrição)</Text>
              </View>
              {dados.alunos.filter(a => a.restricaoLPAreaAplicada).length > 0 && (
                <View style={[s.resumoCard, { backgroundColor: '#f3e8ff', marginLeft: 8 }]}>
                  <Text style={[s.resumoNum, { color: '#7c3aed' }]}>
                    {dados.alunos.filter(a => a.restricaoLPAreaAplicada).length}
                  </Text>
                  <Text style={s.resumoLabel}>Restrição{'\n'}LP+Área</Text>
                </View>
              )}
            </View>
            {/* Breakdown por classe */}
            {(['7ª Classe','8ª Classe','10ª Classe','11ª Classe'] as const).some(cls => byClasse(dados.alunos, cls).length > 0) && (
              <View style={{ backgroundColor: Colors.surface, borderRadius: 10, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: Colors.border }}>
                <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 11, color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
                  Distribuição por classe
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {(['7ª Classe','8ª Classe','10ª Classe','11ª Classe'] as const).map(cls => {
                    const lst = byClasse(dados.alunos, cls);
                    if (lst.length === 0) return null;
                    const cond = lst.filter(a => a.situacao === 'transita_condicional').length;
                    const reprov = lst.filter(a => a.situacao === 'reprovado').length;
                    const ciclo = cls === '7ª Classe' || cls === '8ª Classe' ? 'I Ciclo' : 'II Ciclo';
                    const cor = ciclo === 'I Ciclo' ? Colors.danger : '#7c3aed';
                    return (
                      <View key={cls} style={{ flex: 1, minWidth: 110, backgroundColor: cor + '10', borderRadius: 8, padding: 10, borderWidth: 1, borderColor: cor + '33' }}>
                        <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 12, color: cor, marginBottom: 2 }}>{cls}</Text>
                        <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 10, color: Colors.textMuted }}>{ciclo}</Text>
                        <View style={{ flexDirection: 'row', gap: 4, marginTop: 6 }}>
                          {cond > 0 && <View style={{ backgroundColor: '#f59e0b22', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 }}>
                            <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 11, color: '#d97706' }}>{cond} cond.</Text>
                          </View>}
                          {reprov > 0 && <View style={{ backgroundColor: '#fee2e2', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 }}>
                            <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 11, color: Colors.danger }}>{reprov} não trans.</Text>
                          </View>}
                        </View>
                      </View>
                    );
                  })}
                </View>
              </View>
            )}
          </>
        )}

        {/* Erro */}
        {!!erro && (
          <View style={s.erroCard}>
            <Ionicons name="alert-circle" size={16} color={Colors.danger} />
            <Text style={s.erroTxt}>{erro}</Text>
          </View>
        )}

        {/* Estado inicial */}
        {!dados && !loading && !erro && (
          <View style={s.centrado}>
            <Ionicons name="document-text-outline" size={48} color={Colors.textMuted} />
            <Text style={s.emptyTxt}>Prima "Gerar" para carregar o relatório de alunos em transição condicional.</Text>
          </View>
        )}

        {/* Filtros */}
        {dados && dados.alunos.length > 0 && (
          <>
            {/* Filtro por classe */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 14, marginBottom: 4 }}
              contentContainerStyle={{ gap: 6 }}>
              {CLASSES.map(cls => (
                <TouchableOpacity key={cls}
                  style={[s.filtroChip, filtroClasse === cls && s.filtroChipActive]}
                  onPress={() => setFiltroClasse(cls)}>
                  <Text style={[s.filtroChipTxt, filtroClasse === cls && s.filtroChipTxtActive]}>
                    {cls === 'todos' ? 'Todas as classes' : cls}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Filtro por situação */}
            <View style={{ flexDirection: 'row', gap: 6, marginBottom: 10 }}>
              {SITUACOES.map(sit => (
                <TouchableOpacity key={sit.key}
                  style={[s.situacaoChip, filtroSituacao === sit.key && { backgroundColor: sit.cor + '22', borderColor: sit.cor }]}
                  onPress={() => setFiltroSituacao(sit.key)}>
                  <Text style={[s.situacaoChipTxt, filtroSituacao === sit.key && { color: sit.cor, fontFamily: 'Inter_700Bold' }]}>
                    {sit.label}
                  </Text>
                </TouchableOpacity>
              ))}
              <Text style={{ flex: 1, textAlign: 'right', fontSize: 11, color: Colors.textMuted, alignSelf: 'center' }}>
                {alunosFiltrados.length} aluno{alunosFiltrados.length !== 1 ? 's' : ''}
              </Text>
            </View>

            {/* Lista de alunos */}
            {alunosFiltrados.length === 0 ? (
              <View style={s.centrado}>
                <Text style={s.emptyTxt}>Nenhum aluno com os filtros seleccionados.</Text>
              </View>
            ) : (
              alunosFiltrados.map((aluno, idx) => {
                const isReprov = aluno.situacao === 'reprovado';
                const expandido = expandidos.has(aluno.alunoId);
                return (
                  <TouchableOpacity key={aluno.alunoId} style={[s.alunoCard, { borderLeftColor: isReprov ? Colors.danger : '#f59e0b', borderLeftWidth: 3 }]}
                    onPress={() => toggleExpandido(aluno.alunoId)} activeOpacity={0.8}>
                    <View style={s.alunoHeader}>
                      <View style={{ flex: 1 }}>
                        <Text style={s.alunoNum}>{idx + 1}. <Text style={s.alunoNome}>{aluno.nomeAluno}</Text></Text>
                        <Text style={s.alunoTurma}>{aluno.turmaNome} · {aluno.classe}</Text>
                      </View>
                      <View style={{ alignItems: 'flex-end', gap: 4 }}>
                        <View style={[s.badge, { backgroundColor: isReprov ? Colors.danger : '#f59e0b' }]}>
                          <Text style={s.badgeTxt}>{isReprov ? 'NÃO TRANSITA' : 'C/ CONDIÇÃO'}</Text>
                        </View>
                        {aluno.restricaoLPAreaAplicada && (
                          <View style={[s.badge, { backgroundColor: '#7c3aed' }]}>
                            <Text style={s.badgeTxt}>LP+ÁREA</Text>
                          </View>
                        )}
                      </View>
                      <Ionicons name={expandido ? 'chevron-up' : 'chevron-down'} size={16} color={Colors.textMuted} style={{ marginLeft: 6 }} />
                    </View>

                    {expandido && (
                      <View style={s.alunoDetalhes}>
                        <Text style={s.motivoTxt}>{aluno.motivoSituacao}</Text>
                        {aluno.disciplinasCondicionais.length > 0 && (
                          <View style={{ marginTop: 8 }}>
                            <Text style={s.discLabel}>Disciplinas negativas (7–{(dados?.config?.notaMin ?? 10) - 1} val.):</Text>
                            {aluno.disciplinasCondicionais.map(d => (
                              <View key={d.disciplina} style={s.discRow}>
                                <View style={[s.discDot, { backgroundColor: '#f59e0b' }]} />
                                <Text style={s.discNome}>{d.disciplina}</Text>
                                <Text style={[s.discNota, { color: '#d97706' }]}>{d.nota.toFixed(1)} val.</Text>
                              </View>
                            ))}
                          </View>
                        )}
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })
            )}
          </>
        )}

        {dados && dados.alunos.length === 0 && (
          <View style={s.centrado}>
            <Ionicons name="checkmark-circle-outline" size={48} color={Colors.success} />
            <Text style={s.emptyTxt}>Nenhum aluno em transição condicional ou com excesso de negativos.</Text>
          </View>
        )}

        {/* Rodapé informativo */}
        <View style={s.rodape}>
          <Ionicons name="information-circle-outline" size={13} color={Colors.textMuted} />
          <Text style={s.rodapeTxt}>
            Relatório baseado nas médias anuais das disciplinas. Inclui classes 7ª, 8ª, 10ª e 11ª. Configure os limites em Configurações → Académico → Negativos para Transição Condicional.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  centrado: { alignItems: 'center', justifyContent: 'center', paddingVertical: 48, gap: 12 },
  semPermissao: { fontFamily: 'Inter_500Medium', fontSize: 14, color: Colors.textMuted, textAlign: 'center' },
  emptyTxt: { fontFamily: 'Inter_400Regular', fontSize: 13, color: Colors.textMuted, textAlign: 'center', maxWidth: 280 },
  headerRow: { flexDirection: 'row', alignItems: 'center', marginTop: 16, marginBottom: 14, gap: 10 },
  headerTitle: { fontFamily: 'Inter_700Bold', fontSize: 16, color: Colors.text },
  headerSub: { fontFamily: 'Inter_400Regular', fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  btnCarregar: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 10, backgroundColor: Colors.accent },
  btnCarregarTxt: { fontFamily: 'Inter_700Bold', fontSize: 12, color: '#fff' },
  configCard: { backgroundColor: Colors.card, borderRadius: 12, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: Colors.border },
  configTitle: { fontFamily: 'Inter_700Bold', fontSize: 11, color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 },
  configRow: { flexDirection: 'row' },
  configItem: { flex: 1, alignItems: 'center', paddingVertical: 4 },
  configValor: { fontFamily: 'Inter_700Bold', fontSize: 22, color: Colors.text },
  configLabel: { fontFamily: 'Inter_400Regular', fontSize: 10, color: Colors.textMuted, textAlign: 'center', marginTop: 2, lineHeight: 14 },
  resumoRow: { flexDirection: 'row', marginBottom: 14 },
  resumoCard: { flex: 1, borderRadius: 12, padding: 14, alignItems: 'center', borderWidth: 1, borderColor: Colors.border },
  resumoNum: { fontFamily: 'Inter_700Bold', fontSize: 28 },
  resumoLabel: { fontFamily: 'Inter_400Regular', fontSize: 11, color: Colors.textMuted, textAlign: 'center', marginTop: 4, lineHeight: 15 },
  erroCard: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fee2e2', borderRadius: 10, padding: 12, marginBottom: 12 },
  erroTxt: { fontFamily: 'Inter_500Medium', fontSize: 12, color: Colors.danger, flex: 1 },
  filtroChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.card },
  filtroChipActive: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  filtroChipTxt: { fontFamily: 'Inter_500Medium', fontSize: 12, color: Colors.textMuted },
  filtroChipTxtActive: { color: '#fff', fontFamily: 'Inter_700Bold' },
  situacaoChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.card },
  situacaoChipTxt: { fontFamily: 'Inter_500Medium', fontSize: 12, color: Colors.textMuted },
  alunoCard: { backgroundColor: Colors.card, borderRadius: 12, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: Colors.border },
  alunoHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  alunoNum: { fontFamily: 'Inter_400Regular', fontSize: 13, color: Colors.textSecondary },
  alunoNome: { fontFamily: 'Inter_700Bold', fontSize: 14, color: Colors.text },
  alunoTurma: { fontFamily: 'Inter_400Regular', fontSize: 11, color: Colors.textMuted, marginTop: 2 },
  badge: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6 },
  badgeTxt: { fontFamily: 'Inter_700Bold', fontSize: 9, color: '#fff', letterSpacing: 0.3 },
  alunoDetalhes: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: Colors.border },
  motivoTxt: { fontFamily: 'Inter_400Regular', fontSize: 11, color: Colors.textSecondary, lineHeight: 16 },
  discLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 11, color: Colors.textMuted, marginBottom: 4 },
  discRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 3 },
  discDot: { width: 6, height: 6, borderRadius: 3 },
  discNome: { flex: 1, fontFamily: 'Inter_500Medium', fontSize: 11, color: Colors.text },
  discNota: { fontFamily: 'Inter_700Bold', fontSize: 12 },
  rodape: { flexDirection: 'row', gap: 6, backgroundColor: Colors.surface, borderRadius: 10, padding: 10, marginTop: 16, alignItems: 'flex-start' },
  rodapeTxt: { fontFamily: 'Inter_400Regular', fontSize: 10, color: Colors.textMuted, flex: 1, lineHeight: 15 },
});
