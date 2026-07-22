import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Platform, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors } from '@/constants/colors';
import { webAlert } from '@/utils/webAlert';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AlunoInfo {
  nome: string; apelido?: string; dataNascimento?: string; genero?: string;
  bi?: string; numeroCedula?: string; numeroMatricula?: string;
  situacao?: string; turmaId?: string;
  turmaNome?: string; classe?: string; nivel?: string; turno?: string; anoLetivo?: string;
  cursoId?: string; cursoNome?: string; cursoArea?: string;
  provincia?: string; municipio?: string;
}

interface Disciplina { nome: string; cargaHoraria?: number }
interface DisciplinaDeficiencia { nome: string; mfd: number; anoLetivo: string }

interface ComprovatvoPayload {
  aluno: AlunoInfo | null;
  config: { nomeEscola?: string; directorGeral?: string; municipio?: string };
  disciplinas: Disciplina[];
  disciplinasComDeficiencia: DisciplinaDeficiencia[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(val?: string): string {
  if (!val) return '___/___/______';
  try {
    const d = new Date(val);
    if (isNaN(d.getTime())) return val;
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
  } catch { return val; }
}

function hoje(): string {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

function buildQrUrl(data: string, size = 90): string {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(data)}&bgcolor=132145&color=ffffff&margin=4&ecc=M`;
}

// ─── HTML Generator ──────────────────────────────────────────────────────────

function generateComprovatvoHTML(
  payload: ComprovatvoPayload,
  tipoDoc: 'matricula' | 'reconfirmacao',
  origin = '',
): string {
  const { aluno, config, disciplinas, disciplinasComDeficiencia } = payload;
  const nomeEscola = config.nomeEscola || 'ESCOLA';
  const nomeCompleto = aluno ? `${aluno.nome || ''} ${aluno.apelido || ''}`.trim() : '—';
  const classeLabel = aluno?.classe || '—';
  const turmaNome = aluno?.turmaNome || '—';
  const nivel = aluno?.nivel || '—';
  const turno = aluno?.turno || '—';
  const anoLetivo = aluno?.anoLetivo || '—';
  const cursoNome = aluno?.cursoNome || aluno?.cursoArea || '';
  const numeroMatricula = aluno?.numeroMatricula || '—';
  const bi = aluno?.bi || aluno?.numeroCedula || '—';
  const generoLabel = aluno?.genero === 'M' ? 'Masculino' : aluno?.genero === 'F' ? 'Feminino' : (aluno?.genero || '—');

  const tituloDoc = tipoDoc === 'reconfirmacao'
    ? 'COMPROVATIVO DE RECONFIRMAÇÃO DE MATRÍCULA'
    : 'COMPROVATIVO DE MATRÍCULA';
  const subtituloDoc = tipoDoc === 'reconfirmacao'
    ? 'Reconfirmação de Matrícula'
    : 'Nova Matrícula';

  const qrData = JSON.stringify({
    tipo: 'COMPROVATIVO_MATRICULA',
    nome: nomeCompleto,
    mat: numeroMatricula,
    classe: classeLabel,
    anoLetivo,
    emissao: hoje(),
  });
  const qrUrl = buildQrUrl(qrData, 90);

  // Gerar linhas da tabela de disciplinas
  const discRows = disciplinas.length > 0
    ? disciplinas.map((d, i) => `
      <tr style="background:${i % 2 === 0 ? '#fff' : '#f8fafc'};">
        <td style="padding:4px 8px;border:1px solid #e2e8f0;text-align:center;font-size:9pt;color:#64748b;width:36px;">${i + 1}</td>
        <td style="padding:4px 10px;border:1px solid #e2e8f0;font-size:9.5pt;font-weight:600;">${d.nome}</td>
        <td style="padding:4px 8px;border:1px solid #e2e8f0;text-align:center;font-size:9pt;color:#475569;">${d.cargaHoraria ? d.cargaHoraria + ' h/sem' : '—'}</td>
      </tr>`).join('')
    : `<tr><td colspan="3" style="padding:12px;text-align:center;color:#94a3b8;font-size:9pt;border:1px solid #e2e8f0;">Disciplinas a definir pela secretaria após enquadramento na turma.</td></tr>`;

  // Secção de deficiências (só se existirem)
  const defSection = disciplinasComDeficiencia.length > 0 ? `
    <div style="margin-top:12px;border:2px solid #d97706;border-radius:6px;overflow:hidden;">
      <div style="background:#d97706;color:#fff;padding:7px 12px;display:flex;align-items:center;gap:8px;">
        <span style="font-size:13pt;">⚠</span>
        <div>
          <div style="font-size:10pt;font-weight:800;letter-spacing:0.5px;text-transform:uppercase;">D — Disciplinas com Deficiência (Art. 23º §10)</div>
          <div style="font-size:8pt;opacity:0.9;">Disciplinas em que o aluno transitou condicionalmente — média final entre 7 e ${disciplinasComDeficiencia[0] ? Math.round(disciplinasComDeficiencia[0].mfd) + 1 : 10} valores</div>
        </div>
      </div>
      <div style="padding:10px 12px;background:#fffbeb;">
        <p style="font-size:9pt;color:#78350f;margin-bottom:8px;line-height:1.6;">
          De acordo com o Decreto Executivo nº 04/2026, Art. 23º §10, o aluno transitou para a classe actual com as seguintes disciplinas em deficiência.
          O aluno deverá obter aprovação nestas disciplinas durante o presente ano lectivo.
        </p>
        <table style="width:100%;border-collapse:collapse;">
          <thead>
            <tr style="background:#fef3c7;">
              <th style="padding:5px 8px;border:1px solid #fbbf24;text-align:center;font-size:8.5pt;width:36px;">Nº</th>
              <th style="padding:5px 10px;border:1px solid #fbbf24;text-align:left;font-size:8.5pt;">Disciplina com Deficiência</th>
              <th style="padding:5px 8px;border:1px solid #fbbf24;text-align:center;font-size:8.5pt;width:80px;">Média Final</th>
              <th style="padding:5px 8px;border:1px solid #fbbf24;text-align:center;font-size:8.5pt;width:90px;">Ano Lectivo</th>
            </tr>
          </thead>
          <tbody>
            ${disciplinasComDeficiencia.map((d, i) => `
            <tr style="background:${i % 2 === 0 ? '#fff' : '#fffbeb'};">
              <td style="padding:5px 8px;border:1px solid #fbbf24;text-align:center;font-size:9pt;color:#92400e;">${i + 1}</td>
              <td style="padding:5px 10px;border:1px solid #fbbf24;font-size:9.5pt;font-weight:700;color:#78350f;">${d.nome}</td>
              <td style="padding:5px 8px;border:1px solid #fbbf24;text-align:center;font-size:10pt;font-weight:800;color:#d97706;">${d.mfd.toFixed(1)} val.</td>
              <td style="padding:5px 8px;border:1px solid #fbbf24;text-align:center;font-size:9pt;color:#92400e;">${d.anoLetivo}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>` : '';

  return `<!DOCTYPE html>
<html lang="pt">
<head>
<meta charset="UTF-8">
<title>${tituloDoc} — ${nomeCompleto}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  @page { size: A4 portrait; margin: 14mm 12mm; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 10pt; color: #000; background: #fff; }
  .page { width: 100%; }
  .sec-title { font-weight:800; font-size:9.5pt; padding:4px 10px; background:#f0f4f8; border-left:4px solid #1E3A5F; text-transform:uppercase; letter-spacing:0.4px; margin-bottom:6px; }
  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .no-print { display: none !important; }
  }
</style>
</head>
<body>
<div class="page">

  <!-- CABEÇALHO INSTITUCIONAL -->
  <table style="width:100%;border-collapse:collapse;margin-bottom:0;">
    <tr>
      <td style="width:72px;text-align:center;vertical-align:middle;padding:0 8px 0 0;">
        <img src="${origin}/angola-brasao.png" style="height:68px;width:auto;" alt="" onerror="this.style.display='none'" />
      </td>
      <td style="text-align:center;vertical-align:middle;padding:4px 0;">
        <div style="font-size:7.5pt;text-transform:uppercase;color:#555;letter-spacing:1.2px;font-weight:600;">República de Angola &bull; Ministério da Educação &bull; Ensino Geral</div>
        <div style="font-size:15pt;font-weight:900;color:#000;text-transform:uppercase;margin:4px 0;letter-spacing:0.5px;">${nomeEscola}</div>
        <div style="font-size:8pt;color:#555;">${config.municipio || 'Angola'}</div>
      </td>
      <td style="width:96px;text-align:center;vertical-align:middle;padding:0 0 0 8px;">
        <div style="border:1.5px solid #1E3A5F;padding:3px;display:inline-block;">
          <img src="${qrUrl}" alt="QR Code" style="width:86px;height:86px;display:block;" />
        </div>
        <div style="font-size:6pt;color:#444;margin-top:2px;font-weight:bold;">${numeroMatricula}</div>
      </td>
    </tr>
  </table>
  <div style="border-bottom:3px double #1E3A5F;margin:6px 0 10px;"></div>

  <!-- TÍTULO DO DOCUMENTO -->
  <div style="text-align:center;border-top:2px solid #000;border-bottom:2px solid #000;padding:6px 0;margin-bottom:8px;">
    <div style="font-size:12pt;font-weight:900;letter-spacing:1.5px;text-transform:uppercase;">${tituloDoc}</div>
    <div style="font-size:8.5pt;color:#444;margin-top:2px;">Ano Lectivo ${anoLetivo} &nbsp;&bull;&nbsp; Emitido em: ${hoje()}</div>
  </div>

  <!-- TIPO BADGE -->
  <div style="display:inline-block;background:${tipoDoc === 'reconfirmacao' ? '#2563eb' : '#16a34a'};color:#fff;font-size:8pt;font-weight:700;padding:3px 14px;border-radius:12px;letter-spacing:0.5px;margin-bottom:12px;text-transform:uppercase;">
    ${subtituloDoc}
  </div>

  ${aluno ? `
  <!-- A — IDENTIFICAÇÃO DO ALUNO -->
  <div class="sec-title">A &mdash; Identificação do Aluno</div>
  <table style="width:100%;border-collapse:collapse;border:1px solid #ccc;margin-bottom:10px;">
    <tr>
      <td style="padding:8px 14px;width:40%;font-size:8pt;color:#555;text-transform:uppercase;border-right:1px solid #e5e7eb;">Nome Completo</td>
      <td style="padding:8px 14px;font-size:13pt;font-weight:900;color:#000;">${nomeCompleto}</td>
    </tr>
    <tr style="background:#f8fafc;">
      <td style="padding:6px 14px;font-size:8pt;color:#555;text-transform:uppercase;border-right:1px solid #e5e7eb;">Nº Matrícula</td>
      <td style="padding:6px 14px;font-weight:700;">${numeroMatricula}</td>
    </tr>
    <tr>
      <td style="padding:6px 14px;font-size:8pt;color:#555;text-transform:uppercase;border-right:1px solid #e5e7eb;">BI / Cédula</td>
      <td style="padding:6px 14px;">${bi}</td>
    </tr>
    <tr style="background:#f8fafc;">
      <td style="padding:6px 14px;font-size:8pt;color:#555;text-transform:uppercase;border-right:1px solid #e5e7eb;">Data de Nascimento</td>
      <td style="padding:6px 14px;">${formatDate(aluno.dataNascimento)}</td>
    </tr>
    <tr>
      <td style="padding:6px 14px;font-size:8pt;color:#555;text-transform:uppercase;border-right:1px solid #e5e7eb;">Género</td>
      <td style="padding:6px 14px;">${generoLabel}</td>
    </tr>
  </table>

  <!-- B — DADOS ACADÉMICOS -->
  <div class="sec-title">B &mdash; Dados Académicos</div>
  <table style="width:100%;border-collapse:collapse;border:1px solid #ccc;margin-bottom:10px;">
    <tr>
      ${[
        ['Classe', classeLabel],
        ['Turma', turmaNome],
        ['Nível de Ensino', nivel],
        ['Turno', turno],
        ...(cursoNome ? [['Curso / Área', cursoNome]] : []),
        ['Ano Lectivo', anoLetivo],
      ].map(([label, value], i, arr) => `
      <td style="padding:8px 12px;text-align:center;${i < arr.length - 1 ? 'border-right:1px solid #e5e7eb;' : ''}">
        <div style="font-size:7.5pt;color:#555;text-transform:uppercase;letter-spacing:0.4px;font-weight:600;">${label}</div>
        <div style="font-size:11pt;font-weight:800;color:#000;margin-top:2px;">${value}</div>
      </td>`).join('')}
    </tr>
  </table>
  ` : ''}

  <!-- C — PLANO CURRICULAR -->
  <div class="sec-title">C &mdash; Plano Curricular &mdash; Disciplinas da Classe ${classeLabel}</div>
  <table style="width:100%;border-collapse:collapse;margin-bottom:${defSection ? '0' : '12px'};">
    <thead>
      <tr style="background:#1E3A5F;color:#fff;">
        <th style="padding:6px 8px;border:1px solid #1E3A5F;text-align:center;font-size:8.5pt;width:36px;">Nº</th>
        <th style="padding:6px 10px;border:1px solid #1E3A5F;text-align:left;font-size:8.5pt;">Disciplina</th>
        <th style="padding:6px 8px;border:1px solid #1E3A5F;text-align:center;font-size:8.5pt;width:110px;">Carga Horária</th>
      </tr>
    </thead>
    <tbody>${discRows}</tbody>
    <tfoot>
      <tr style="background:#f8fafc;">
        <td colspan="2" style="padding:5px 10px;border:1px solid #e2e8f0;font-size:8.5pt;font-weight:700;color:#475569;">Total de Disciplinas</td>
        <td style="padding:5px 8px;border:1px solid #e2e8f0;text-align:center;font-size:9pt;font-weight:800;color:#1E3A5F;">${disciplinas.length}</td>
      </tr>
    </tfoot>
  </table>

  ${defSection}

  <!-- DECLARAÇÃO E ASSINATURAS -->
  <div style="margin-top:14px;border-top:2px solid #000;padding-top:10px;">
    <div style="font-weight:bold;text-align:center;font-size:11pt;margin-bottom:8px;text-transform:uppercase;letter-spacing:0.5px;">Declaração</div>
    <div style="font-size:9.5pt;line-height:1.7;text-align:justify;margin-bottom:6px;">
      ${aluno
        ? `O(A) aluno(a) <strong>${nomeCompleto}</strong>, portador(a) do BI/Cédula Nº <strong>${bi}</strong>, fica ciente do plano curricular da <strong>${classeLabel} Classe</strong> &mdash; Turma <strong>${turmaNome}</strong>, relativo ao Ano Lectivo <strong>${anoLetivo}</strong>,${disciplinasComDeficiencia.length > 0 ? ` e das <strong>${disciplinasComDeficiencia.length} disciplina(s) com defici&ecirc;ncia</strong> que necessita de regularizar durante este ano lectivo,` : ''} comprometendo-se a cumprir todas as obriga&ccedil;&otilde;es acad&eacute;micas e o Regulamento Interno da Institui&ccedil;&atilde;o.`
        : `O(A) candidato(a) fica ciente do plano curricular da <strong>${classeLabel} Classe</strong> para o Ano Lectivo <strong>${anoLetivo}</strong>, comprometendo-se a cumprir todas as obriga&ccedil;&otilde;es acad&eacute;micas e o Regulamento Interno da Institui&ccedil;&atilde;o.`
      }
    </div>
    <div style="text-align:center;margin:16px 0 8px;font-size:9.5pt;">
      ${config.municipio || 'Luanda'},&nbsp;
      <span style="border-bottom:1px solid #000;display:inline-block;min-width:28px;">&nbsp;</span>
      &nbsp;de&nbsp;
      <span style="border-bottom:1px solid #000;display:inline-block;min-width:90px;">&nbsp;</span>
      &nbsp;de&nbsp;<strong>${anoLetivo.split('/')[0] || new Date().getFullYear()}</strong>
    </div>
    <table style="width:100%;margin-top:22px;border-collapse:collapse;">
      <tr>
        <td style="text-align:center;font-size:9pt;padding:0 6px;">
          <div style="border-top:1px solid #000;width:160px;margin:32px auto 4px;"></div>
          <div>Assinatura do(a) Aluno(a) / Encarregado</div>
        </td>
        <td style="text-align:center;font-size:9pt;padding:0 6px;">
          <div style="border-top:1px solid #000;width:160px;margin:32px auto 4px;"></div>
          <div>O Funcion&aacute;rio da Secretaria</div>
        </td>
        <td style="text-align:center;font-size:9pt;padding:0 6px;">
          <div style="border-top:1px solid #000;width:160px;margin:32px auto 4px;"></div>
          <div>O Director(a) da Escola</div>
        </td>
      </tr>
    </table>
  </div>

  <!-- RODAPÉ -->
  <table style="width:100%;margin-top:14px;border-top:1px solid #ccc;border-collapse:collapse;padding-top:5px;">
    <tr>
      <td style="font-size:7.5pt;color:#555;padding-top:5px;">${nomeEscola}</td>
      <td style="font-size:7.5pt;color:#555;padding-top:5px;text-align:center;">N&ordm; Matr&iacute;cula: ${numeroMatricula}</td>
      <td style="font-size:7.5pt;color:#555;padding-top:5px;text-align:right;">Emitido em: ${hoje()}</td>
    </tr>
  </table>

</div>
</body>
</html>`;
}

// ─── Main Screen ─────────────────────────────────────────────────────────────

export default function ComprovatvoMatriculaScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{
    alunoId?: string;
    classe?: string;
    cursoNome?: string;
    tipo?: string; // 'matricula' | 'reconfirmacao'
  }>();

  const tipoDoc: 'matricula' | 'reconfirmacao' =
    params.tipo === 'reconfirmacao' ? 'reconfirmacao' : 'matricula';

  const [data, setData] = useState<ComprovatvoPayload | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPrinting, setIsPrinting] = useState(false);
  const [error, setError] = useState('');

  const topPad = Platform.OS === 'web' ? 0 : insets.top;

  const load = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      const url = new URL('/api/comprovativo-matricula', window.location.origin);
      if (params.alunoId) url.searchParams.set('alunoId', params.alunoId);
      if (params.classe) url.searchParams.set('classe', params.classe);
      if (params.cursoNome) url.searchParams.set('cursoNome', params.cursoNome);
      const token = await AsyncStorage.getItem('@siga_token');
      const res = await fetch(url.toString(), {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        const text = await res.text();
        let msg = text;
        try { msg = (JSON.parse(text) as any).error || text; } catch {}
        throw new Error(msg);
      }
      setData(await res.json());
    } catch (e: any) {
      setError(e.message || 'Erro ao carregar dados');
    } finally {
      setIsLoading(false);
    }
  }, [params.alunoId, params.classe, params.cursoNome]);

  useEffect(() => { load(); }, [load]);

  function handlePrint() {
    if (!data || Platform.OS !== 'web') return;
    setIsPrinting(true);
    try {
      const html = generateComprovatvoHTML(data, tipoDoc, window.location.origin);
      const win = window.open('', '_blank');
      if (win) {
        win.document.write(html);
        win.document.close();
        setTimeout(() => { win.print(); }, 700);
      }
    } finally {
      setTimeout(() => setIsPrinting(false), 1500);
    }
  }

  const nomeAluno = data?.aluno
    ? `${data.aluno.nome || ''} ${data.aluno.apelido || ''}`.trim()
    : (params.classe ? `${params.classe}ª Classe` : 'Comprovativo');

  const hasDeficiencias = (data?.disciplinasComDeficiencia?.length ?? 0) > 0;

  return (
    <View style={[s.container, { paddingTop: topPad }]}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="arrow-back" size={20} color={Colors.text} />
        </TouchableOpacity>
        <View style={s.headerCenter}>
          <Text style={s.headerTitle} numberOfLines={1}>
            {tipoDoc === 'reconfirmacao' ? 'Reconfirmação' : 'Comprovativo de Matrícula'}
          </Text>
          <Text style={s.headerSub} numberOfLines={1}>{nomeAluno}</Text>
        </View>
        {Platform.OS === 'web' && data && !isLoading && (
          <TouchableOpacity
            style={[s.printBtn, isPrinting && { opacity: 0.6 }]}
            onPress={handlePrint}
            disabled={isPrinting}
          >
            <Ionicons name="print-outline" size={16} color="#fff" />
            <Text style={s.printBtnText}>{isPrinting ? 'A preparar...' : 'Imprimir / PDF'}</Text>
          </TouchableOpacity>
        )}
      </View>

      {isLoading ? (
        <View style={s.center}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={s.loadingText}>A carregar dados...</Text>
        </View>
      ) : error ? (
        <View style={s.center}>
          <Ionicons
            name={error.toLowerCase().includes('autenticad') ? 'lock-closed-outline' : 'alert-circle-outline'}
            size={48}
            color={Colors.danger}
          />
          <Text style={s.errorText}>{error}</Text>
          {error.toLowerCase().includes('autenticad') ? (
            <TouchableOpacity style={s.retryBtn} onPress={() => router.replace('/login' as any)}>
              <Text style={s.retryBtnText}>Ir para Login</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={s.retryBtn} onPress={load}>
              <Text style={s.retryBtnText}>Tentar novamente</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : data ? (
        <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent}>

          {/* Tipo badge */}
          <View style={[s.typeBadge, { backgroundColor: tipoDoc === 'reconfirmacao' ? '#2563eb' : Colors.success }]}>
            <Ionicons name={tipoDoc === 'reconfirmacao' ? 'refresh-circle' : 'school'} size={14} color="#fff" />
            <Text style={s.typeBadgeText}>
              {tipoDoc === 'reconfirmacao' ? 'Reconfirmação de Matrícula' : 'Nova Matrícula'}
            </Text>
          </View>

          {/* Aluno info */}
          {data.aluno && (
            <View style={s.card}>
              <Text style={s.cardTitle}>Identificação do Aluno</Text>
              <Text style={s.alunoNome}>{nomeAluno}</Text>
              <View style={s.row}>
                <InfoItem label="Nº Matrícula" value={data.aluno.numeroMatricula || '—'} />
                <InfoItem label="Classe" value={data.aluno.classe || '—'} />
                <InfoItem label="Turma" value={data.aluno.turmaNome || '—'} />
              </View>
              <View style={s.row}>
                <InfoItem label="Nível" value={data.aluno.nivel || '—'} />
                <InfoItem label="Turno" value={data.aluno.turno || '—'} />
                <InfoItem label="Ano Lectivo" value={data.aluno.anoLetivo || '—'} />
              </View>
              {data.aluno.cursoNome && (
                <InfoItem label="Curso / Área" value={data.aluno.cursoNome} />
              )}
            </View>
          )}

          {/* Disciplinas */}
          <View style={s.card}>
            <View style={s.sectionHeader}>
              <Ionicons name="list-outline" size={16} color={Colors.primary} />
              <Text style={s.cardTitle}>
                Plano Curricular — Disciplinas da {data.aluno?.classe || params.classe || '?'}ª Classe
              </Text>
              <View style={s.countBadge}>
                <Text style={s.countBadgeText}>{data.disciplinas.length}</Text>
              </View>
            </View>
            {data.disciplinas.length === 0 ? (
              <Text style={s.emptyText}>Disciplinas a definir após enquadramento na turma.</Text>
            ) : (
              data.disciplinas.map((d, i) => (
                <View key={i} style={[s.discRow, i % 2 === 0 && s.discRowAlt]}>
                  <Text style={s.discNum}>{i + 1}</Text>
                  <Text style={s.discNome}>{d.nome}</Text>
                  {d.cargaHoraria ? (
                    <View style={s.cargaChip}>
                      <Text style={s.cargaText}>{d.cargaHoraria} h/sem</Text>
                    </View>
                  ) : null}
                </View>
              ))
            )}
          </View>

          {/* Deficiências */}
          {hasDeficiencias && (
            <View style={[s.card, s.defCard]}>
              <View style={s.defHeader}>
                <Ionicons name="warning" size={18} color="#d97706" />
                <View style={{ flex: 1 }}>
                  <Text style={s.defTitle}>Disciplinas com Deficiência</Text>
                  <Text style={s.defSubtitle}>Art. 23º §10 — Decreto Executivo nº 04/2026</Text>
                </View>
                <View style={s.defCountBadge}>
                  <Text style={s.defCountText}>{data.disciplinasComDeficiencia.length}</Text>
                </View>
              </View>
              <Text style={s.defDesc}>
                O aluno transitou condicionalmente com as seguintes disciplinas em deficiência. Deve obter aprovação durante este ano lectivo.
              </Text>
              {data.disciplinasComDeficiencia.map((d, i) => (
                <View key={i} style={s.defDiscRow}>
                  <View style={s.defDiscLeft}>
                    <Text style={s.defDiscNum}>{i + 1}</Text>
                    <Text style={s.defDiscNome}>{d.nome}</Text>
                    <Text style={s.defDiscAno}>{d.anoLetivo}</Text>
                  </View>
                  <View style={s.mfdBadge}>
                    <Text style={s.mfdVal}>{d.mfd.toFixed(1)}</Text>
                    <Text style={s.mfdLabel}>MFD</Text>
                  </View>
                </View>
              ))}
            </View>
          )}

          {/* Print button (large, for mobile fallback) */}
          {Platform.OS === 'web' ? (
            <TouchableOpacity style={[s.bigPrintBtn, isPrinting && { opacity: 0.6 }]} onPress={handlePrint} disabled={isPrinting}>
              <LinearGradient colors={['#1E3A5F', '#0D1F35']} style={s.bigPrintGrad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                {isPrinting
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Ionicons name="print-outline" size={20} color="#fff" />}
                <Text style={s.bigPrintText}>{isPrinting ? 'A preparar impressão...' : 'Imprimir / Exportar PDF'}</Text>
              </LinearGradient>
            </TouchableOpacity>
          ) : (
            <View style={s.mobileBanner}>
              <Ionicons name="information-circle-outline" size={18} color="#e67e22" />
              <Text style={s.mobileBannerText}>Para imprimir ou exportar como PDF, aceda a este ecrã num computador.</Text>
            </View>
          )}

        </ScrollView>
      ) : null}
    </View>
  );
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.infoItem}>
      <Text style={s.infoLabel}>{label}</Text>
      <Text style={s.infoValue}>{value}</Text>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.border, backgroundColor: Colors.surface },
  backBtn: { padding: 6 },
  headerCenter: { flex: 1 },
  headerTitle: { fontSize: 15, fontFamily: 'Inter_700Bold', color: Colors.text },
  headerSub: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted },
  printBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.primary, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 },
  printBtnText: { fontSize: 12, fontFamily: 'Inter_700Bold', color: '#fff' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  loadingText: { fontSize: 14, fontFamily: 'Inter_400Regular', color: Colors.textMuted },
  errorText: { fontSize: 14, fontFamily: 'Inter_500Medium', color: Colors.danger, textAlign: 'center' },
  retryBtn: { backgroundColor: Colors.primary, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8 },
  retryBtnText: { fontSize: 13, fontFamily: 'Inter_700Bold', color: '#fff' },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, gap: 12, paddingBottom: 40 },
  typeBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20 },
  typeBadgeText: { fontSize: 12, fontFamily: 'Inter_700Bold', color: '#fff' },
  card: { backgroundColor: Colors.surface, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, padding: 14 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  cardTitle: { fontSize: 13, fontFamily: 'Inter_700Bold', color: Colors.text, flex: 1 },
  alunoNome: { fontSize: 17, fontFamily: 'Inter_700Bold', color: Colors.text, marginBottom: 10 },
  row: { flexDirection: 'row', gap: 8, marginBottom: 6 },
  infoItem: { flex: 1, backgroundColor: Colors.backgroundSecondary, borderRadius: 8, padding: 8 },
  infoLabel: { fontSize: 10, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginBottom: 2 },
  infoValue: { fontSize: 13, fontFamily: 'Inter_700Bold', color: Colors.text },
  countBadge: { backgroundColor: Colors.primary, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
  countBadgeText: { fontSize: 11, fontFamily: 'Inter_700Bold', color: '#fff' },
  emptyText: { fontSize: 13, fontFamily: 'Inter_400Regular', color: Colors.textMuted, textAlign: 'center', paddingVertical: 12 },
  discRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 7, paddingHorizontal: 4 },
  discRowAlt: { backgroundColor: Colors.backgroundSecondary, borderRadius: 6 },
  discNum: { fontSize: 11, fontFamily: 'Inter_500Medium', color: Colors.textMuted, width: 22, textAlign: 'center' },
  discNome: { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: Colors.text, flex: 1 },
  cargaChip: { backgroundColor: Colors.primary + '18', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  cargaText: { fontSize: 10, fontFamily: 'Inter_600SemiBold', color: Colors.primary },
  defCard: { borderColor: '#d97706', borderWidth: 1.5 },
  defHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 8 },
  defTitle: { fontSize: 13, fontFamily: 'Inter_700Bold', color: '#92400e' },
  defSubtitle: { fontSize: 10, fontFamily: 'Inter_400Regular', color: '#a16207', marginTop: 1 },
  defCountBadge: { backgroundColor: '#d97706', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
  defCountText: { fontSize: 11, fontFamily: 'Inter_700Bold', color: '#fff' },
  defDesc: { fontSize: 11, fontFamily: 'Inter_400Regular', color: '#78350f', backgroundColor: '#fffbeb', borderRadius: 6, padding: 8, marginBottom: 10, lineHeight: 17 },
  defDiscRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: '#fef3c7' },
  defDiscLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  defDiscNum: { fontSize: 11, fontFamily: 'Inter_500Medium', color: '#a16207', width: 22, textAlign: 'center' },
  defDiscNome: { fontSize: 13, fontFamily: 'Inter_700Bold', color: '#78350f', flex: 1 },
  defDiscAno: { fontSize: 10, fontFamily: 'Inter_400Regular', color: '#a16207' },
  mfdBadge: { alignItems: 'center', backgroundColor: '#fef3c7', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: '#fbbf24' },
  mfdVal: { fontSize: 14, fontFamily: 'Inter_900Black', color: '#d97706' },
  mfdLabel: { fontSize: 8, fontFamily: 'Inter_600SemiBold', color: '#92400e' },
  bigPrintBtn: { borderRadius: 14, overflow: 'hidden', marginTop: 4 },
  bigPrintGrad: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 16, gap: 10 },
  bigPrintText: { fontSize: 14, fontFamily: 'Inter_700Bold', color: '#fff' },
  mobileBanner: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: '#fef3c7', borderRadius: 10, padding: 12 },
  mobileBannerText: { fontSize: 12, fontFamily: 'Inter_500Medium', color: '#92400e', flex: 1, lineHeight: 18 },
});
