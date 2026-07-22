import React, { useState, useEffect, useCallback } from 'react';
import { anoLetivoDe } from '@/lib/anoLetivo';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Platform } from 'react-native';
import AppLoader from '@/components/AppLoader';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors } from '@/constants/colors';

interface Registro {
  id: string;
  nomeCompleto: string;
  dataNascimento: string;
  genero: string;
  provincia: string;
  municipio: string;
  telefone: string;
  email: string;
  nivel: string;
  classe: string;
  cursoNome?: string;
  cursoId?: string;
  notaAdmissao?: number;
  status: string;
  criadoEm: string;
  nomeEncarregado: string;
  telefoneEncarregado: string;
}

function hoje(): string {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

function anoAtual(): string { return anoLetivoDe(); }

function calcAge(dataNasc: string): number {
  if (!dataNasc) return 0;
  const now = new Date();
  const birth = new Date(dataNasc);
  if (isNaN(birth.getTime())) return 0;
  let age = now.getFullYear() - birth.getFullYear();
  const m = now.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--;
  return age;
}

function statusLabel(status: string): string {
  if (status === 'admitido') return 'ADMITIDO';
  if (status === 'matriculado') return 'MATRICULADO';
  if (status === 'nao_admitido' || status === 'não_admitido' || status === 'reprovado_admissao') return 'NÃO ADMITIDO';
  return status.toUpperCase();
}

function statusBadgeHtml(status: string): string {
  if (status === 'admitido') {
    return `<span style="background:#d4edda;color:#155724;padding:2px 7px;border-radius:4px;font-weight:bold;font-size:9px;white-space:nowrap;">ADMITIDO</span>`;
  }
  if (status === 'matriculado') {
    return `<span style="background:#fff3cd;color:#856404;padding:2px 7px;border-radius:4px;font-weight:bold;font-size:9px;white-space:nowrap;">MATRICULADO</span>`;
  }
  if (status === 'nao_admitido' || status === 'não_admitido' || status === 'reprovado_admissao') {
    return `<span style="background:#f8d7da;color:#721c24;padding:2px 7px;border-radius:4px;font-weight:bold;font-size:9px;white-space:nowrap;">NÃO ADMITIDO</span>`;
  }
  return `<span style="background:#e2e3e5;color:#383d41;padding:2px 7px;border-radius:4px;font-weight:bold;font-size:9px;">${status.toUpperCase()}</span>`;
}

function buildTabelaGrupo(
  alunos: Registro[],
  titulo: string,
  startNum: number,
  masc: number,
  fem: number,
): string {
  const rows = alunos.map((a, idx) => {
    const age = calcAge(a.dataNascimento);
    const nota = a.notaAdmissao !== undefined && a.notaAdmissao !== null ? `${a.notaAdmissao}/20` : '—';
    const bg = idx % 2 === 0 ? '#fff' : '#f0faff';
    return `<tr style="background:${bg}">
      <td class="num">${startNum + idx}</td>
      <td class="nome">${a.nomeCompleto.toUpperCase()}</td>
      <td class="centro">${a.genero || '—'}</td>
      <td class="centro">${age > 0 ? age : '—'}</td>
      <td class="centro"><b>${nota}</b></td>
      <td class="centro">${statusBadgeHtml(a.status)}</td>
      <td class="centro">${a.telefone || '—'}</td>
    </tr>`;
  }).join('');

  const total = alunos.length;
  const admitidos = alunos.filter(a => a.status === 'admitido' || a.status === 'matriculado').length;
  const naoAdmitidos = alunos.filter(a => a.status === 'nao_admitido' || a.status === 'não_admitido' || a.status === 'reprovado_admissao').length;

  return `
    <div class="grupo-header">${titulo} — ${total} estudante(s) · M: ${masc} · F: ${fem}${admitidos > 0 ? ` · Admitidos: ${admitidos}` : ''}${naoAdmitidos > 0 ? ` · Não Admitidos: ${naoAdmitidos}` : ''}</div>
    <table>
      <thead>
        <tr>
          <th style="width:30px;">Nº</th>
          <th>Nome do Estudante</th>
          <th style="width:40px;">Sexo</th>
          <th style="width:40px;">Idade</th>
          <th style="width:52px;">Nota Adm.</th>
          <th style="width:92px;">Estado</th>
          <th style="width:90px;">Telefone</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="stats-row">
      <div>Total: <span>${total}</span></div>
      <div>Masculino: <span>${masc}</span></div>
      <div>Feminino: <span>${fem}</span></div>
      ${admitidos > 0 ? `<div>Admitidos: <span style="color:#155724">${admitidos}</span></div>` : ''}
      ${naoAdmitidos > 0 ? `<div>Não Admitidos: <span style="color:#721c24">${naoAdmitidos}</span></div>` : ''}
    </div>
  `;
}

function buildListaHTML(
  registros: Registro[],
  nomeEscola: string,
  filtroClasse: string,
  filtroStatus: string,
): string {
  const lista = registros
    .filter(r => r.classe !== '8ª Classe')
    .filter(r => {
      if (filtroStatus === 'todos') return r.status === 'admitido' || r.status === 'matriculado' || r.status === 'nao_admitido' || r.status === 'não_admitido' || r.status === 'reprovado_admissao';
      if (filtroStatus === 'admitido') return r.status === 'admitido' || r.status === 'matriculado';
      if (filtroStatus === 'nao_admitido') return r.status === 'nao_admitido' || r.status === 'não_admitido' || r.status === 'reprovado_admissao';
      return r.status === filtroStatus;
    })
    .filter(r => filtroClasse === 'todas' || r.classe === filtroClasse)
    .sort((a, b) => a.nomeCompleto.localeCompare(b.nomeCompleto));

  if (lista.length === 0) return '<p>Nenhum estudante encontrado com os critérios seleccionados.</p>';

  const byClasse: Record<string, Record<string, Registro[]>> = {};
  for (const r of lista) {
    if (!byClasse[r.classe]) byClasse[r.classe] = {};
    const cursoKey = r.cursoNome || 'Geral';
    if (!byClasse[r.classe][cursoKey]) byClasse[r.classe][cursoKey] = [];
    byClasse[r.classe][cursoKey].push(r);
  }

  const classesSorted = Object.keys(byClasse).sort((a, b) => a.localeCompare(b));

  const II_CICLO_NUMS = ['10', '11', '12', '13'];
  function isIICiclo(classe: string) {
    return II_CICLO_NUMS.some(n => classe.includes(`${n}ª`) || classe.includes(`${n}a`));
  }

  let tablesHtml = '';
  let globalOrder = 1;

  for (const classe of classesSorted) {
    const cursosObj = byClasse[classe];
    const cursoKeys = Object.keys(cursosObj).sort();
    const hasCourses = cursoKeys.length > 1 || (cursoKeys.length === 1 && cursoKeys[0] !== 'Geral');

    if (isIICiclo(classe) && hasCourses) {
      tablesHtml += `
        <div class="classe-header">${classe} — Distribuição por Curso / Área de Formação</div>
      `;
      for (const curso of cursoKeys) {
        const alunos = cursosObj[curso].sort((a, b) => a.nomeCompleto.localeCompare(b.nomeCompleto));
        const masc = alunos.filter(a => a.genero === 'M').length;
        const fem = alunos.filter(a => a.genero === 'F').length;
        tablesHtml += buildTabelaGrupo(alunos, `${classe} — ${curso}`, globalOrder, masc, fem);
        globalOrder += alunos.length;
      }
    } else {
      const alunos = Object.values(cursosObj).flat().sort((a, b) => a.nomeCompleto.localeCompare(b.nomeCompleto));
      const masc = alunos.filter(a => a.genero === 'M').length;
      const fem = alunos.filter(a => a.genero === 'F').length;
      tablesHtml += buildTabelaGrupo(alunos, classe, globalOrder, masc, fem);
      globalOrder += alunos.length;
    }
  }

  const totalGeral = lista.length;
  const totalMasc = lista.filter(r => r.genero === 'M').length;
  const totalFem = lista.filter(r => r.genero === 'F').length;
  const totalAdmitidos = lista.filter(r => r.status === 'admitido' || r.status === 'matriculado').length;
  const totalNaoAdmitidos = lista.filter(r => r.status === 'nao_admitido' || r.status === 'não_admitido' || r.status === 'reprovado_admissao').length;

  const statusTitle = filtroStatus === 'nao_admitido' ? 'Estudantes Não Admitidos'
    : filtroStatus === 'matriculado' ? 'Estudantes Matriculados'
    : filtroStatus === 'todos' ? 'Lista de Resultados de Admissão (Todos)'
    : 'Estudantes Admitidos';

  return `<!DOCTYPE html>
<html lang="pt">
<head>
<meta charset="UTF-8">
<title>${statusTitle} — ${nomeEscola}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; font-size: 11px; color: #000; background: #fff; padding: 15mm 18mm; }
  .doc-header { text-align: center; margin-bottom: 14px; }
  .doc-header p { font-size: 11px; line-height: 1.6; }
  .doc-header .escola { font-size: 12px; font-weight: bold; text-transform: uppercase; }
  .doc-title { font-size: 14px; font-weight: bold; text-transform: uppercase; text-decoration: underline; letter-spacing: 1px; margin: 10px 0 4px; }
  .doc-meta { font-size: 10px; color: #333; margin-bottom: 14px; }
  .classe-header { background: #1E3A5F; color: #fff; font-weight: bold; font-size: 11px; text-transform: uppercase; padding: 5px 8px; margin: 16px 0 4px; letter-spacing: 0.5px; }
  .grupo-header { background: #0369a1; color: #fff; font-weight: bold; font-size: 10px; padding: 4px 8px; margin: 10px 0 3px; }
  table { border-collapse: collapse; width: 100%; margin-bottom: 6px; font-size: 10px; }
  th { background: #00BCD4; color: #fff; font-weight: bold; border: 1px solid #000; padding: 4px 6px; text-align: center; }
  td { border: 1px solid #000; padding: 3px 5px; }
  tr:nth-child(even) { background: #f0faff; }
  .num { text-align: center; font-weight: bold; width: 30px; }
  .nome { text-align: left; padding-left: 6px; }
  .centro { text-align: center; }
  .stats-row { display: flex; gap: 16px; font-size: 10px; padding: 4px 0; border-top: 1px solid #ccc; margin-bottom: 12px; flex-wrap: wrap; }
  .stats-row span { font-weight: bold; }
  .total-box { background: #e8f5e9; border: 1px solid #ccc; border-radius: 4px; padding: 8px 12px; margin-top: 16px; display: flex; gap: 20px; font-size: 11px; flex-wrap: wrap; }
  .total-box b { font-size: 12px; }
  .sig-row { display: flex; justify-content: space-between; margin-top: 28px; font-size: 10px; }
  .sig-block { text-align: center; }
  .sig-line { width: 160px; border-top: 1px solid #000; margin: 30px auto 4px; }
  .footer { margin-top: 20px; border-top: 1px solid #ccc; padding-top: 6px; display: flex; justify-content: space-between; font-size: 8px; color: #555; }
  .print-btn { position: fixed; bottom: 18px; right: 18px; background: #1E3A5F; color: #fff; border: none; border-radius: 8px; padding: 10px 20px; font-size: 13px; font-weight: bold; cursor: pointer; box-shadow: 0 4px 12px rgba(0,0,0,0.2); z-index: 999; }
  @media print { .print-btn { display: none !important; } @page { size: A4 portrait; margin: 0; } body { padding: 0; } }
</style>
</head>
<body>
  <button class="print-btn" onclick="window.print()">Imprimir / PDF</button>
  <div class="doc-header">
    <img src="${typeof window !== 'undefined' ? window.location.origin : ''}/angola-brasao.png" style="width:62px;height:auto;display:block;margin:0 auto 4px;" alt="Insígnia da República de Angola" onerror="this.style.display='none'" />
    <p>REPÚBLICA DE ANGOLA</p>
    <p>MINISTÉRIO DA EDUCAÇÃO</p>
    <p>ENSINO GERAL</p>
    <p class="escola">${nomeEscola}</p>
    <p class="doc-title">${statusTitle}</p>
    <p class="doc-meta">Ano Lectivo: ${anoAtual()} &nbsp;|&nbsp; Emitido em: ${hoje()} &nbsp;|&nbsp; Total: ${totalGeral} estudante(s)</p>
  </div>

  ${tablesHtml}

  <div class="total-box">
    <div>Total Geral: <b>${totalGeral}</b></div>
    <div>Masculino: <b>${totalMasc}</b></div>
    <div>Feminino: <b>${totalFem}</b></div>
    ${totalAdmitidos > 0 ? `<div>Admitidos/Matriculados: <b style="color:#155724">${totalAdmitidos}</b></div>` : ''}
    ${totalNaoAdmitidos > 0 ? `<div>Não Admitidos: <b style="color:#721c24">${totalNaoAdmitidos}</b></div>` : ''}
  </div>

  <div class="sig-row">
    <div class="sig-block"><div class="sig-line"></div><div>O Secretário(a)</div></div>
    <div class="sig-block"><div class="sig-line"></div><div>O Director(a)</div></div>
  </div>

  <div class="footer">
    <span>${nomeEscola} — Sistema QUETA v3</span>
    <span>Emitido em: ${hoje()}</span>
  </div>
</body>
</html>`;
}

export default function ListaAdmitidosScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [registros, setRegistros] = useState<Registro[]>([]);
  const [nomeEscola, setNomeEscola] = useState('QUETA');
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);

  const [filtroClasse, setFiltroClasse] = useState('todas');
  const [filtroStatus, setFiltroStatus] = useState('admitido');

  const topPad = Platform.OS === 'web' ? 0 : insets.top;
  const bottomPad = Platform.OS === 'web' ? 24 : insets.bottom;

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const [regRes, cfgRes] = await Promise.all([
        fetch('/api/registros'),
        fetch('/api/config'),
      ]);
      if (regRes.ok) {
        const data = await regRes.json();
        setRegistros(Array.isArray(data) ? data : []);
      }
      if (cfgRes.ok) {
        const cfg = await cfgRes.json();
        setNomeEscola(cfg.nomeEscola || 'QUETA');
      }
    } catch {}
    finally { setIsLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const comResultado = registros.filter(r =>
    (r.status === 'admitido' || r.status === 'matriculado' ||
    r.status === 'nao_admitido' || r.status === 'não_admitido' || r.status === 'reprovado_admissao') &&
    r.classe !== '8ª Classe'
  );

  const classes = Array.from(new Set(comResultado.map(r => r.classe))).sort((a, b) => a.localeCompare(b));

  const filtrados = comResultado
    .filter(r => {
      if (filtroStatus === 'todos') return true;
      if (filtroStatus === 'admitido') return r.status === 'admitido' || r.status === 'matriculado';
      if (filtroStatus === 'nao_admitido') return r.status === 'nao_admitido' || r.status === 'não_admitido' || r.status === 'reprovado_admissao';
      return r.status === filtroStatus;
    })
    .filter(r => filtroClasse === 'todas' || r.classe === filtroClasse);

  function handleGerar() {
    if (Platform.OS !== 'web') return;
    setIsGenerating(true);
    const html = buildListaHTML(registros, nomeEscola, filtroClasse, filtroStatus);
    const win = window.open('', '_blank');
    if (win) {
      win.document.write(html);
      win.document.close();
      setTimeout(() => { win.print(); }, 600);
    }
    setIsGenerating(false);
  }

  if (isLoading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <LinearGradient colors={['#061029', '#0D1F35']} style={StyleSheet.absoluteFill} />
        <AppLoader color={Colors.gold} size="large" />
        <Text style={styles.loadingText}>A carregar...</Text>
      </View>
    );
  }

  const totalAdmitidos = comResultado.filter(r => r.status === 'admitido' || r.status === 'matriculado').length;
  const totalNaoAdm = comResultado.filter(r => r.status === 'nao_admitido' || r.status === 'não_admitido' || r.status === 'reprovado_admissao').length;

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#061029', '#0A1628', '#0D1F35']} style={StyleSheet.absoluteFill} />

      <LinearGradient colors={['#061029', '#0A1628']} style={[styles.header, { paddingTop: topPad + 12 }]}>
        <View style={styles.headerInner}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={20} color={Colors.text} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>Lista de Resultados de Admissão</Text>
            <Text style={styles.headerSub}>{filtrados.length} estudante(s) com os filtros actuais</Text>
          </View>
        </View>
      </LinearGradient>

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: bottomPad + 24 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.filtersCard}>
          <Text style={styles.filtersTitle}>Filtros</Text>

          <Text style={styles.filterLabel}>Estado / Resultado</Text>
          <View style={styles.chipRow}>
            {[
              { v: 'admitido', label: 'Admitidos', color: '#155724' },
              { v: 'nao_admitido', label: 'Não Admitidos', color: '#721c24' },
              { v: 'todos', label: 'Todos os Resultados', color: Colors.gold },
            ].map(opt => (
              <TouchableOpacity
                key={opt.v}
                style={[styles.chip, filtroStatus === opt.v && { ...styles.chipActive, borderColor: opt.color + '99' }]}
                onPress={() => setFiltroStatus(opt.v)}
              >
                <Text style={[styles.chipText, filtroStatus === opt.v && { ...styles.chipTextActive, color: opt.color }]}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.filterLabel}>Classe</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 4 }}>
            <View style={styles.chipRow}>
              <TouchableOpacity
                style={[styles.chip, filtroClasse === 'todas' && styles.chipActive]}
                onPress={() => setFiltroClasse('todas')}
              >
                <Text style={[styles.chipText, filtroClasse === 'todas' && styles.chipTextActive]}>
                  Todas as Classes
                </Text>
              </TouchableOpacity>
              {classes.map(cls => (
                <TouchableOpacity
                  key={cls}
                  style={[styles.chip, filtroClasse === cls && styles.chipActive]}
                  onPress={() => setFiltroClasse(cls)}
                >
                  <Text style={[styles.chipText, filtroClasse === cls && styles.chipTextActive]}>
                    {cls}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        </View>

        <View style={styles.summaryCard}>
          <View style={styles.summaryRow}>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryNum}>{filtrados.length}</Text>
              <Text style={styles.summaryLabel}>Total</Text>
            </View>
            <View style={styles.summaryItem}>
              <Text style={[styles.summaryNum, { color: Colors.info }]}>
                {filtrados.filter(r => r.genero === 'M').length}
              </Text>
              <Text style={styles.summaryLabel}>Masculino</Text>
            </View>
            <View style={styles.summaryItem}>
              <Text style={[styles.summaryNum, { color: '#ec4899' }]}>
                {filtrados.filter(r => r.genero === 'F').length}
              </Text>
              <Text style={styles.summaryLabel}>Feminino</Text>
            </View>
            <View style={styles.summaryItem}>
              <Text style={[styles.summaryNum, { color: Colors.success }]}>{totalAdmitidos}</Text>
              <Text style={styles.summaryLabel}>Admitidos</Text>
            </View>
            <View style={styles.summaryItem}>
              <Text style={[styles.summaryNum, { color: Colors.danger }]}>{totalNaoAdm}</Text>
              <Text style={styles.summaryLabel}>Não Adm.</Text>
            </View>
          </View>
        </View>

        {filtrados.length === 0 ? (
          <View style={styles.emptyWrap}>
            <Ionicons name="people-outline" size={36} color={Colors.textMuted} />
            <Text style={styles.emptyText}>Nenhum estudante com estes filtros</Text>
          </View>
        ) : (
          filtrados.slice(0, 20).map((r) => {
            const isAdm = r.status === 'admitido' || r.status === 'matriculado';
            const isNaoAdm = r.status === 'nao_admitido' || r.status === 'não_admitido' || r.status === 'reprovado_admissao';
            const badgeBg = isAdm ? '#d4edda' : isNaoAdm ? '#f8d7da' : '#e2e3e5';
            const badgeColor = isAdm ? '#155724' : isNaoAdm ? '#721c24' : '#383d41';
            return (
              <View key={r.id} style={styles.regRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.regNome}>{r.nomeCompleto}</Text>
                  <Text style={styles.regSub}>
                    {r.classe}{r.cursoNome ? ` · ${r.cursoNome}` : ''} · {r.genero}
                    {r.notaAdmissao !== undefined && r.notaAdmissao !== null ? ` · Nota: ${r.notaAdmissao}/20` : ''}
                  </Text>
                </View>
                <View style={[styles.badge, { backgroundColor: badgeBg }]}>
                  <Text style={[styles.badgeText, { color: badgeColor }]}>{statusLabel(r.status)}</Text>
                </View>
              </View>
            );
          })
        )}

        {filtrados.length > 20 && (
          <Text style={styles.moreText}>
            + {filtrados.length - 20} estudantes adicionais serão incluídos na impressão
          </Text>
        )}

        {Platform.OS === 'web' && filtrados.length > 0 && (
          <TouchableOpacity
            style={[styles.gerarBtn, isGenerating && { opacity: 0.6 }]}
            onPress={handleGerar}
            disabled={isGenerating}
            activeOpacity={0.85}
          >
            {isGenerating
              ? <AppLoader color="#fff" size="small" />
              : <>
                <Ionicons name="print-outline" size={20} color="#fff" />
                <Text style={styles.gerarBtnText}>
                  Gerar Lista para Impressão ({filtrados.length} estudantes)
                </Text>
              </>
            }
          </TouchableOpacity>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#061029' },
  header: { paddingHorizontal: 16, paddingBottom: 14 },
  headerInner: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  backBtn: { padding: 6 },
  headerTitle: { fontSize: 16, fontFamily: 'Inter_700Bold', color: Colors.text },
  headerSub: { fontSize: 11, color: Colors.textMuted, marginTop: 1 },
  loadingText: { color: Colors.textMuted, marginTop: 12, fontSize: 14 },
  scroll: { padding: 16, gap: 14 },
  filtersCard: { backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  filtersTitle: { fontSize: 12, fontFamily: 'Inter_700Bold', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 },
  filterLabel: { fontSize: 11, color: Colors.textMuted, marginBottom: 6, marginTop: 8 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' },
  chipActive: { backgroundColor: Colors.gold + '22', borderColor: Colors.gold + '60' },
  chipText: { fontSize: 12, color: Colors.textMuted, fontFamily: 'Inter_500Medium' },
  chipTextActive: { color: Colors.gold, fontFamily: 'Inter_600SemiBold' },
  summaryCard: { backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-around' },
  summaryItem: { alignItems: 'center' },
  summaryNum: { fontSize: 20, fontFamily: 'Inter_700Bold', color: Colors.text },
  summaryLabel: { fontSize: 10, color: Colors.textMuted, marginTop: 2 },
  regRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)' },
  regNome: { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: Colors.text },
  regSub: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
  badge: { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 },
  badgeText: { fontSize: 10, fontFamily: 'Inter_700Bold', textTransform: 'uppercase' },
  moreText: { textAlign: 'center', color: Colors.textMuted, fontSize: 12, fontStyle: 'italic' },
  emptyWrap: { alignItems: 'center', gap: 8, paddingVertical: 32 },
  emptyText: { color: Colors.textMuted, fontSize: 14 },
  gerarBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#1E3A5F', borderRadius: 12, paddingVertical: 16, marginTop: 8 },
  gerarBtnText: { color: '#fff', fontSize: 15, fontFamily: 'Inter_600SemiBold' },
});
