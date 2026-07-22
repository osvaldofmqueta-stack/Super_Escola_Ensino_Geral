import React, { useState, useEffect, useRef, useCallback } from 'react';
import { anoLetivoDe } from '@/lib/anoLetivo';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Platform, TextInput, FlatList, Image } from 'react-native';
import AppLoader from '@/components/AppLoader';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors } from '@/constants/colors';
import { webAlert } from '@/utils/webAlert';
import { StableSearchInput } from '@/components/StableSearchInput';

let QRCode: any = null;
if (Platform.OS !== 'web') {
  QRCode = require('react-native-qrcode-svg').default;
}

function buildQrImageUrl(data: string, size = 88): string {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(data)}&bgcolor=132145&color=ffffff&margin=4&ecc=M`;
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface Registro {
  id: string;
  nomeCompleto: string;
  dataNascimento: string;
  genero: string;
  provincia: string;
  municipio: string;
  telefone: string;
  email: string;
  endereco?: string;
  bairro?: string;
  numeroBi?: string;
  numeroCedula?: string;
  nivel: string;
  classe: string;
  cursoNome?: string;
  nomeEncarregado: string;
  telefoneEncarregado: string;
  observacoes?: string;
  status: string;
  senhaProvisoria?: string;
  dataProva?: string;
  notaAdmissao?: number;
  rupeInscricao?: string;
  rupeMatricula?: string;
  pagamentoInscricaoConfirmado?: boolean;
  pagamentoInscricaoConfirmadoEm?: string;
  pagamentoInscricaoConfirmadoPor?: string;
  criadoEm: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(val: string | undefined): string {
  if (!val) return '___/___/______';
  try {
    const d = new Date(val);
    if (isNaN(d.getTime())) return val;
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
  } catch {
    return val;
  }
}

function hoje(): string {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

function anoAtual(): string {
  return anoLetivoDe();
}

function codigoInscricao(reg: Registro): string {
  const ano = anoAtual();
  const idx = reg.id.slice(0, 6).toUpperCase();
  return `INS-${ano}-${idx}`;
}

// ─── QR Data ─────────────────────────────────────────────────────────────────

function buildQrData(reg: Registro): string {
  return JSON.stringify({
    tipo: 'BOLETIM_INSCRICAO',
    codigo: codigoInscricao(reg),
    nome: reg.nomeCompleto,
    nivel: reg.nivel,
    classe: reg.classe,
    status: reg.status,
    data: reg.criadoEm,
  });
}

// ─── HTML Generator ──────────────────────────────────────────────────────────

async function fetchNomeEscola(): Promise<string> {
  try {
    const res = await fetch('/api/config');
    if (!res.ok) return 'QUETA';
    const data = await res.json();
    return data.nomeEscola || 'QUETA';
  } catch {
    return 'QUETA';
  }
}

function generateBoletimHTML(reg: Registro, nomeEscola: string, qrDataUrl: string, origin = ''): string {
  const codigo = codigoInscricao(reg);
  const generoLabel = reg.genero === 'M' ? 'Masculino' : reg.genero === 'F' ? 'Feminino' : reg.genero;

  return `<!DOCTYPE html>
<html lang="pt">
<head>
<meta charset="UTF-8">
<title>Boletim de Inscrição — ${reg.nomeCompleto}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  @page { size: A4 portrait; margin: 0; }
  body {
    font-family: Arial, Helvetica, sans-serif;
    font-size: 10pt;
    color: #000;
    background: #fff;
  }
  .page { width: 100%; }

  /* ── Cabeçalho ── */
  .header-row {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    margin-bottom: 6px;
  }
  .header-text { flex: 1; text-align: center; }
  .header-text p { font-size: 9.5pt; line-height: 1.55; }
  .header-text .bold { font-weight: bold; }
  .header-text .title {
    font-size: 13pt;
    font-weight: bold;
    margin-top: 6px;
    letter-spacing: 0.5px;
    text-transform: uppercase;
    border-bottom: 2px solid #000;
    display: inline-block;
    padding-bottom: 2px;
  }
  .header-text .codigo {
    font-size: 9pt;
    margin-top: 4px;
    color: #333;
  }
  .qr-box {
    width: 88px;
    height: 88px;
    border: 1.5px solid #000;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    padding: 3px;
    background: #fff;
  }
  .qr-box img { width: 100%; height: 100%; object-fit: contain; }
  .qr-label { font-size: 6pt; text-align: center; margin-top: 3px; color: #444; font-weight: bold; }

  /* ── Faixa de alerta ── */
  .alerta {
    background: #1E3A5F;
    color: #fff;
    text-align: center;
    font-weight: bold;
    font-size: 9.5pt;
    padding: 4px 0;
    margin: 8px 0;
    letter-spacing: 0.8px;
    text-transform: uppercase;
  }

  /* ── Secções ── */
  .section-title {
    font-weight: bold;
    font-size: 10pt;
    margin: 10px 0 4px;
    padding: 3px 6px;
    background: #f0f0f0;
    border-left: 3px solid #1E3A5F;
    text-transform: uppercase;
    letter-spacing: 0.3px;
  }
  .separator { border-top: 1px solid #ccc; margin: 8px 0; }

  /* ── Campos ── */
  .field-line {
    display: flex;
    align-items: baseline;
    gap: 4px;
    margin-bottom: 5px;
    font-size: 9.5pt;
    flex-wrap: wrap;
  }
  .field-line .label { white-space: nowrap; color: #444; }
  .field-line .value {
    border-bottom: 1px solid #555;
    flex: 1;
    min-width: 60px;
    padding-bottom: 1px;
    font-weight: 600;
  }
  .field-line .value.empty { font-weight: normal; color: transparent; }
  .multi-field {
    display: flex;
    gap: 16px;
    flex-wrap: wrap;
    margin-bottom: 5px;
    font-size: 9.5pt;
  }
  .multi-field .item {
    display: flex;
    align-items: baseline;
    gap: 4px;
  }
  .multi-field .item .label { color: #444; white-space: nowrap; }
  .multi-field .item .value {
    border-bottom: 1px solid #555;
    min-width: 60px;
    padding-bottom: 1px;
    font-weight: 600;
  }

  /* ── Caixa de status ── */
  .status-box {
    border: 1.5px solid #1E3A5F;
    border-radius: 4px;
    padding: 10px 14px;
    margin: 10px 0;
    display: flex;
    gap: 20px;
    align-items: center;
    background: #f7f9ff;
  }
  .status-box .status-label { font-size: 9pt; color: #444; }
  .status-box .status-value { font-size: 11pt; font-weight: bold; color: #1E3A5F; }
  .status-box .rupe-label { font-size: 8pt; color: #444; text-transform: uppercase; letter-spacing: 0.3px; }
  .status-box .rupe-value { font-size: 10pt; font-weight: bold; color: #4A90D9; letter-spacing: 1px; }

  /* ── Declaração ── */
  .declaracao {
    margin-top: 14px;
    border-top: 2px solid #000;
    padding-top: 10px;
  }
  .declaracao-title {
    font-weight: bold;
    text-align: center;
    font-size: 11pt;
    margin-bottom: 8px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  .decl-text { font-size: 9.5pt; line-height: 1.65; margin-bottom: 6px; text-align: justify; }

  /* ── Assinaturas ── */
  .local-data { text-align: center; margin: 12px 0 6px; font-size: 9.5pt; }
  .signature-area { display: flex; justify-content: space-between; margin-top: 16px; }
  .sig-block { text-align: center; font-size: 9pt; }
  .sig-line { border-top: 1px solid #000; width: 160px; margin: 28px auto 4px; }

  /* ── Rodapé ── */
  .footer {
    margin-top: 16px;
    border-top: 1px solid #ccc;
    padding-top: 6px;
    display: flex;
    justify-content: space-between;
    font-size: 7.5pt;
    color: #555;
  }

  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .no-print { display: none !important; }
  }
</style>
</head>
<body>
<div class="page">

  <!-- CABEÇALHO -->
  <div class="header-row">
    <div style="width:50px;flex-shrink:0;"></div>
    <div class="header-text">
      <img src="${origin}/angola-brasao.png" style="width:62px;height:auto;display:block;margin:0 auto 4px;" alt="Insígnia da República de Angola" onerror="this.style.display='none'" />
      <p>REPÚBLICA DE ANGOLA</p>
      <p>MINISTÉRIO DA EDUCAÇÃO</p>
      <p class="bold">${nomeEscola}</p>
      <p class="title">Boletim de Inscrição</p>
      <p class="codigo">Código: <strong>${codigo}</strong> &nbsp;|&nbsp; Data: <strong>${hoje()}</strong> &nbsp;|&nbsp; Ano Lectivo: <strong>${anoAtual()}</strong></p>
    </div>
    <div style="display:flex;flex-direction:column;align-items:center;flex-shrink:0;">
      <div class="qr-box">
        ${qrDataUrl ? `<img src="${qrDataUrl}" alt="QR Code" />` : '<div style="width:100%;height:100%;border:1px dashed #999;display:flex;align-items:center;justify-content:center;font-size:7pt;color:#999;">QR</div>'}
      </div>
      <div class="qr-label">${codigo}</div>
    </div>
  </div>

  <div class="alerta">Boletim de Inscrição — Processo de Admissão ${anoAtual()}</div>

  <!-- STATUS DA INSCRIÇÃO -->
  <div class="status-box">
    <div>
      <div class="status-label">Estado da Inscrição</div>
      <div class="status-value">${
        reg.status === 'pendente' ? 'Pendente de Análise'
        : reg.status === 'aprovado' ? 'Aprovado para Exame'
        : reg.status === 'admitido' ? 'Admitido'
        : reg.status === 'reprovado_admissao' ? 'Não Admitido'
        : reg.status === 'matriculado' ? 'Matriculado'
        : reg.status
      }</div>
    </div>
    ${reg.rupeInscricao ? `
    <div>
      <div class="rupe-label">Referência RUPE — Inscrição</div>
      <div class="rupe-value">${reg.rupeInscricao}</div>
    </div>` : ''}
    ${reg.dataProva ? `
    <div>
      <div class="status-label">Data do Exame</div>
      <div class="status-value">${reg.dataProva}</div>
    </div>` : ''}
    ${reg.notaAdmissao !== undefined && reg.notaAdmissao !== null ? `
    <div>
      <div class="status-label">Nota de Admissão</div>
      <div class="status-value">${reg.notaAdmissao}/20</div>
    </div>` : ''}
  </div>

  <!-- DADOS PESSOAIS -->
  <div class="section-title">A — Dados Pessoais do Candidato</div>

  <div class="field-line">
    <span class="label">Nome Completo:</span>
    <span class="value">${reg.nomeCompleto}</span>
  </div>

  <div class="multi-field">
    <div class="item">
      <span class="label">Data de Nascimento:</span>
      <span class="value">${formatDate(reg.dataNascimento)}</span>
    </div>
    <div class="item">
      <span class="label">Sexo:</span>
      <span class="value">${generoLabel}</span>
    </div>
  </div>

  <div class="multi-field">
    <div class="item">
      <span class="label">Província:</span>
      <span class="value">${reg.provincia}</span>
    </div>
    <div class="item">
      <span class="label">Município:</span>
      <span class="value">${reg.municipio}</span>
    </div>
  </div>

  <div class="field-line">
    <span class="label">Bairro / Endereço:</span>
    <span class="value">${reg.bairro || ''} ${reg.endereco || ''}</span>
  </div>

  <div class="multi-field">
    <div class="item">
      <span class="label">Telefone:</span>
      <span class="value">${reg.telefone}</span>
    </div>
    <div class="item">
      <span class="label">Email:</span>
      <span class="value">${reg.email}</span>
    </div>
  </div>

  <div class="multi-field">
    <div class="item">
      <span class="label">Nº do BI:</span>
      <span class="value">${reg.numeroBi || '______________________________'}</span>
    </div>
    <div class="item">
      <span class="label">Nº Cédula:</span>
      <span class="value">${reg.numeroCedula || '______________________________'}</span>
    </div>
  </div>

  <!-- DADOS ESCOLARES -->
  <div class="section-title">B — Dados Escolares</div>

  <div class="multi-field">
    <div class="item">
      <span class="label">Nível de Ensino:</span>
      <span class="value">${reg.nivel}</span>
    </div>
    <div class="item">
      <span class="label">Classe Pretendida:</span>
      <span class="value">${reg.classe}</span>
    </div>
    ${reg.cursoNome ? `<div class="item"><span class="label">Curso / Área:</span><span class="value">${reg.cursoNome}</span></div>` : ''}
    <div class="item">
      <span class="label">Ano Lectivo:</span>
      <span class="value">${anoAtual()}</span>
    </div>
  </div>

  ${reg.observacoes ? `
  <div class="field-line">
    <span class="label">Observações:</span>
    <span class="value">${reg.observacoes}</span>
  </div>` : ''}

  <!-- DADOS DO ENCARREGADO -->
  <div class="section-title">C — Dados do Encarregado de Educação</div>

  <div class="field-line">
    <span class="label">Nome Completo do Encarregado:</span>
    <span class="value">${reg.nomeEncarregado}</span>
  </div>

  <div class="field-line">
    <span class="label">Telefone:</span>
    <span class="value">${reg.telefoneEncarregado}</span>
  </div>

  <!-- DECLARAÇÃO SOB COMPROMISSO DE HONRA -->
  <div class="declaracao">
    <div class="declaracao-title">Declaração sob Compromisso de Honra</div>

    <div class="decl-text">
      Eu, <span style="border-bottom:1px solid #000;display:inline-block;min-width:220px;font-weight:600;">${reg.nomeCompleto}</span>,
      do sexo <span style="border-bottom:1px solid #000;display:inline-block;min-width:80px;">${generoLabel}</span>,
      de nacionalidade <span style="border-bottom:1px solid #000;display:inline-block;min-width:90px;">Angolana</span>,
      nascido(a) a <span style="border-bottom:1px solid #000;display:inline-block;min-width:110px;">${formatDate(reg.dataNascimento)}</span>,
      residente no Município de <span style="border-bottom:1px solid #000;display:inline-block;min-width:100px;">${reg.municipio}</span>,
      Província de <span style="border-bottom:1px solid #000;display:inline-block;min-width:100px;">${reg.provincia}</span>,
      declaro, sob compromisso de honra, que todos os dados fornecidos neste formulário são verídicos e correspondem à realidade.
    </div>

    <div class="decl-text">
      Comprometo-me a comparecer ao exame de admissão na data designada pela Direcção da Escola, a cumprir o Regulamento Interno da Instituição e a fornecer, sempre que solicitado, os documentos originais que comprovem as informações aqui prestadas.
    </div>

    <div class="decl-text">
      O Encarregado de Educação, <span style="border-bottom:1px solid #000;display:inline-block;min-width:200px;font-weight:600;">${reg.nomeEncarregado}</span>,
      compromete-se a acompanhar o processo de admissão do seu educando e a regularizar todos os documentos e pagamentos exigidos no prazo estabelecido.
    </div>

    <div class="local-data">
      Luanda,&nbsp;
      <span style="border-bottom:1px solid #000;display:inline-block;min-width:30px;">&nbsp;</span>
      &nbsp;de&nbsp;
      <span style="border-bottom:1px solid #000;display:inline-block;min-width:100px;">&nbsp;</span>
      &nbsp;de&nbsp;<strong>${anoAtual()}</strong>
    </div>

    <div class="signature-area">
      <div class="sig-block">
        <div class="sig-line"></div>
        <div>Assinatura do(a) Candidato(a) / Encarregado</div>
      </div>
      <div class="sig-block">
        <div class="sig-line"></div>
        <div>O Funcionário da Secretaria</div>
      </div>
      <div class="sig-block">
        <div class="sig-line"></div>
        <div>O Director(a) da Escola</div>
      </div>
    </div>
  </div>

  <!-- RODAPÉ -->
  <div class="footer">
    <span>${nomeEscola} — Sistema QUETA v3</span>
    <span>Código: ${codigo}</span>
    <span>Emitido em: ${hoje()}</span>
  </div>

</div>
</body>
</html>`;
}

// ─── Preview Row ──────────────────────────────────────────────────────────────

function PreviewRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={pv.row}>
      <Text style={pv.label}>{label}</Text>
      <Text style={pv.value}>{value || '—'}</Text>
    </View>
  );
}

const pv = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)', gap: 8 },
  label: { fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textMuted, flex: 1 },
  value: { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: Colors.text, flex: 1.5, textAlign: 'right' },
});

// ─── Main Screen ─────────────────────────────────────────────────────────────

export default function BoletimInscricaoScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const registroId = params.id;

  const [registro, setRegistro] = useState<Registro | null>(null);
  const [nomeEscola, setNomeEscola] = useState('QUETA');
  const [isLoading, setIsLoading] = useState(true);
  const [isPrinting, setIsPrinting] = useState(false);

  const [todos, setTodos] = useState<Registro[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isPickMode, setIsPickMode] = useState(false);

  const qrSvgRef = useRef<any>(null);
  const [qrDataUrl, setQrDataUrl] = useState('');

  const topPad = Platform.OS === 'web' ? 0 : insets.top;
  const bottomPad = Platform.OS === 'web' ? 24 : insets.bottom;

  const load = useCallback(async () => {
    if (!registroId) {
      try {
        const [res, escola] = await Promise.all([
          fetch('/api/registros'),
          fetchNomeEscola(),
        ]);
        if (res.ok) {
          const data = await res.json();
          setTodos(Array.isArray(data) ? data : data.registros ?? []);
        }
        setNomeEscola(escola);
      } catch {}
      setIsPickMode(true);
      setIsLoading(false);
      return;
    }
    try {
      const [regRes, escola] = await Promise.all([
        fetch(`/api/registros/${registroId}`),
        fetchNomeEscola(),
      ]);
      if (!regRes.ok) throw new Error('Registo não encontrado');
      const reg = await regRes.json();
      setRegistro(reg);
      setNomeEscola(escola);
    } catch (e: any) {
      webAlert('Erro', e.message || 'Não foi possível carregar o registo.');
    } finally {
      setIsLoading(false);
    }
  }, [registroId]);

  useEffect(() => { load(); }, [load]);

  function selecionarRegistro(reg: Registro) {
    setRegistro(reg);
    setIsPickMode(false);
  }

  const registrosFiltrados = todos.filter(r =>
    r.nomeCompleto.toLowerCase().includes(searchQuery.toLowerCase()) ||
    codigoInscricao(r).toLowerCase().includes(searchQuery.toLowerCase()) ||
    (r.telefone || '').includes(searchQuery)
  );

  function handlePrint() {
    if (!registro || Platform.OS !== 'web') return;
    setIsPrinting(true);

    const doOpen = (dataUrl: string) => {
      const html = generateBoletimHTML(registro, nomeEscola, dataUrl, window.location.origin);
      const win = window.open('', '_blank');
      if (win) {
        win.document.write(html);
        win.document.close();
        setTimeout(() => { win.print(); }, 600);
      }
      setIsPrinting(false);
    };

    // On web use the QR image URL directly from the external service
    const qrUrl = buildQrImageUrl(qrValue, 130);
    doOpen(qrUrl);
  }

  const qrValue = registro ? buildQrData(registro) : 'QUETA-INSCRICAO';
  const codigo = registro ? codigoInscricao(registro) : '—';

  const statusMap: Record<string, { label: string; color: string }> = {
    pendente_pagamento: { label: 'Aguardando Pagamento', color: '#E67E22' },
    pendente: { label: 'Pendente de Análise', color: Colors.warning },
    aprovado: { label: 'Aprovado para Exame', color: Colors.info },
    admitido: { label: 'Admitido', color: Colors.success },
    reprovado_admissao: { label: 'Não Admitido', color: Colors.danger },
    matriculado: { label: 'Matriculado', color: Colors.gold },
  };

  const pagamentoPendente = registro?.status === 'pendente_pagamento' && !registro?.pagamentoInscricaoConfirmado;
  const statusInfo = registro ? (statusMap[registro.status] ?? { label: registro.status, color: Colors.textMuted }) : null;

  if (isLoading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <LinearGradient colors={['#061029', '#0D1F35']} style={StyleSheet.absoluteFill} />
        <AppLoader color={Colors.gold} size="large" />
        <Text style={styles.loadingText}>
          {registroId ? 'A carregar boletim...' : 'A carregar candidatos...'}
        </Text>
      </View>
    );
  }

  if (isPickMode) {
    const statusMap2: Record<string, { label: string; color: string }> = {
      pendente_pagamento: { label: 'Ag. Pagamento', color: '#E67E22' },
      pendente: { label: 'Pendente', color: Colors.warning },
      aprovado: { label: 'Aprovado', color: Colors.info },
      admitido: { label: 'Admitido', color: Colors.success },
      reprovado_admissao: { label: 'Reprovado', color: Colors.danger },
      matriculado: { label: 'Matriculado', color: Colors.gold },
    };
    return (
      <View style={[styles.container]}>
        <LinearGradient colors={['#061029', '#0A1628', '#0D1F35']} style={StyleSheet.absoluteFill} />
        <LinearGradient colors={['#061029', '#0A1628']} style={[styles.header, { paddingTop: topPad + 12 }]}>
          <View style={styles.headerInner}>
            <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
              <Ionicons name="arrow-back" size={20} color={Colors.text} />
            </TouchableOpacity>
            <View style={{ flex: 1 }}>
              <Text style={styles.headerTitle}>Boletim de Inscrição</Text>
              <Text style={styles.headerSub}>Seleccione um candidato</Text>
            </View>
          </View>
        </LinearGradient>

        <View style={pk.searchWrap}>
          <StableSearchInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            inputStyle={pk.searchInput}
            placeholder="Pesquisar por nome, código ou telefone..."
            iconColor={Colors.textMuted}
          />
        </View>

        {registrosFiltrados.length === 0 ? (
          <View style={pk.empty}>
            <Ionicons name="people-outline" size={40} color={Colors.textMuted} />
            <Text style={pk.emptyText}>
              {todos.length === 0
                ? 'Nenhum candidato encontrado no sistema.'
                : 'Nenhum candidato corresponde à pesquisa.'}
            </Text>
          </View>
        ) : (
          <FlatList
            data={registrosFiltrados}
            keyExtractor={item => item.id}
            contentContainerStyle={{ padding: 16, paddingBottom: bottomPad + 24 }}
            ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
            renderItem={({ item }) => {
              const st = statusMap2[item.status] ?? { label: item.status, color: Colors.textMuted };
              return (
                <TouchableOpacity style={pk.card} onPress={() => selecionarRegistro(item)} activeOpacity={0.85}>
                  <View style={pk.cardLeft}>
                    <View style={[pk.badge, { backgroundColor: '#4A90D9' + '22' }]}>
                      <Ionicons name="person" size={18} color={'#4A90D9'} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={pk.cardName} numberOfLines={1}>{item.nomeCompleto}</Text>
                      <Text style={pk.cardSub}>{codigoInscricao(item)} · {item.nivel} – {item.classe}</Text>
                      <Text style={pk.cardSub}>{item.telefone}</Text>
                    </View>
                  </View>
                  <View style={[pk.statusTag, { backgroundColor: st.color + '22' }]}>
                    <Text style={[pk.statusText, { color: st.color }]}>{st.label}</Text>
                  </View>
                </TouchableOpacity>
              );
            }}
          />
        )}
      </View>
    );
  }

  if (!registro) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <LinearGradient colors={['#061029', '#0D1F35']} style={StyleSheet.absoluteFill} />
        <Ionicons name="document-text-outline" size={48} color={Colors.textMuted} />
        <Text style={[styles.loadingText, { marginTop: 12 }]}>Registo não encontrado</Text>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtnFallback}>
          <Text style={styles.backBtnFallbackText}>Voltar</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[styles.container]}>
      <LinearGradient colors={['#061029', '#0A1628', '#0D1F35']} style={StyleSheet.absoluteFill} />

      {/* ── Cabeçalho ── */}
      <LinearGradient colors={['#061029', '#0A1628']} style={[styles.header, { paddingTop: topPad + 12 }]}>
        <View style={styles.headerInner}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={20} color={Colors.text} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>Boletim de Inscrição</Text>
            <Text style={styles.headerSub} numberOfLines={1}>{registro.nomeCompleto}</Text>
          </View>
          {!registroId && (
            <TouchableOpacity
              style={[styles.printBtn, { backgroundColor: 'rgba(255,255,255,0.08)', marginRight: 6 }]}
              onPress={() => setIsPickMode(true)}
              activeOpacity={0.85}
            >
              <Ionicons name="people-outline" size={16} color={Colors.text} />
              <Text style={[styles.printBtnText, { color: Colors.text }]}>Outro</Text>
            </TouchableOpacity>
          )}
          {Platform.OS === 'web' && !pagamentoPendente && (
            <TouchableOpacity
              style={[styles.printBtn, isPrinting && { opacity: 0.6 }]}
              onPress={handlePrint}
              disabled={isPrinting}
              activeOpacity={0.85}
            >
              {isPrinting
                ? <AppLoader color="#fff" size="small" />
                : <Ionicons name="print-outline" size={18} color="#fff" />
              }
              <Text style={styles.printBtnText}>{isPrinting ? 'A preparar...' : 'Imprimir / PDF'}</Text>
            </TouchableOpacity>
          )}
        </View>
      </LinearGradient>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: bottomPad + 32 }]}
        showsVerticalScrollIndicator={false}
      >

        {/* ── Aviso de Pagamento Pendente ── */}
        {pagamentoPendente && (
          <View style={styles.pagamentoPendenteCard}>
            <View style={styles.pagamentoPendenteHeader}>
              <View style={styles.pagamentoPendenteIconWrap}>
                <Ionicons name="time-outline" size={22} color="#E67E22" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.pagamentoPendenteTitle}>Pagamento Pendente de Confirmação</Text>
                <Text style={styles.pagamentoPendenteSubtitle}>
                  O boletim de inscrição só pode ser gerado após a área financeira confirmar o pagamento da taxa de inscrição.
                </Text>
              </View>
            </View>
            {registro?.rupeInscricao ? (
              <View style={styles.pagamentoPendenteRupe}>
                <Ionicons name="receipt-outline" size={14} color="#E67E22" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.pagamentoPendenteRupeLabel}>Referência RUPE — Taxa de Inscrição</Text>
                  <Text style={styles.pagamentoPendenteRupeValue}>{registro.rupeInscricao}</Text>
                </View>
              </View>
            ) : null}
            <View style={styles.pagamentoPendenteSteps}>
              {[
                'Candidato paga a taxa de inscrição (ref. RUPE acima)',
                'Candidato apresenta comprovativo na secretaria',
                'Área financeira confirma o pagamento no sistema',
                'Boletim de inscrição fica disponível para impressão',
              ].map((step, i) => (
                <View key={i} style={styles.pagamentoPendenteStep}>
                  <View style={[styles.pagamentoPendenteStepNum, i === 2 && { backgroundColor: 'rgba(230,126,34,0.3)' }]}>
                    <Text style={styles.pagamentoPendenteStepNumText}>{i + 1}</Text>
                  </View>
                  <Text style={styles.pagamentoPendenteStepText}>{step}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* ── Card de identificação ── */}
        <View style={styles.identCard}>
          <LinearGradient colors={['#1E3A5F', '#0D1F35']} style={StyleSheet.absoluteFill} borderRadius={18} />

          <View style={styles.identTop}>
            <View style={styles.identInfo}>
              <Text style={styles.identNome}>{registro.nomeCompleto}</Text>
              <View style={styles.identMeta}>
                <Ionicons name="school-outline" size={13} color={Colors.textMuted} />
                <Text style={styles.identMetaText}>{registro.nivel} — {registro.classe}</Text>
              </View>
              <View style={styles.identMeta}>
                <Ionicons name="calendar-outline" size={13} color={Colors.textMuted} />
                <Text style={styles.identMetaText}>{formatDate(registro.criadoEm)}</Text>
              </View>
              <View style={[styles.statusBadge, { backgroundColor: (statusInfo?.color ?? Colors.textMuted) + '22' }]}>
                <View style={[styles.statusDot, { backgroundColor: statusInfo?.color ?? Colors.textMuted }]} />
                <Text style={[styles.statusBadgeText, { color: statusInfo?.color ?? Colors.textMuted }]}>
                  {statusInfo?.label}
                </Text>
              </View>
            </View>

            {/* QR Code */}
            <View style={styles.qrWrap}>
              {Platform.OS === 'web' ? (
                <Image
                  source={{ uri: buildQrImageUrl(qrValue, 88) }}
                  style={{ width: 88, height: 88, borderRadius: 6 }}
                  resizeMode="contain"
                />
              ) : QRCode ? (
                <QRCode
                  value={qrValue}
                  size={88}
                  color="#FFFFFF"
                  backgroundColor="#122540"
                  getRef={(ref: any) => { qrSvgRef.current = ref; }}
                />
              ) : null}
              <Text style={styles.qrLabel}>{codigo}</Text>
            </View>
          </View>
        </View>

        {/* ── Código e info rápida ── */}
        <View style={styles.infoRow}>
          <View style={styles.infoItem}>
            <Ionicons name="barcode-outline" size={14} color={Colors.gold} />
            <Text style={styles.infoItemLabel}>Código</Text>
            <Text style={styles.infoItemValue}>{codigo}</Text>
          </View>
          <View style={styles.infoDivider} />
          <View style={styles.infoItem}>
            <Ionicons name="location-outline" size={14} color={Colors.info} />
            <Text style={styles.infoItemLabel}>Localidade</Text>
            <Text style={styles.infoItemValue}>{registro.municipio}, {registro.provincia}</Text>
          </View>
          <View style={styles.infoDivider} />
          <View style={styles.infoItem}>
            <Ionicons name="calendar-outline" size={14} color={Colors.success} />
            <Text style={styles.infoItemLabel}>Ano Lectivo</Text>
            <Text style={styles.infoItemValue}>{anoAtual()}</Text>
          </View>
        </View>

        {/* ── Dados Pessoais ── */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={[styles.cardIcon, { backgroundColor: 'rgba(52,152,219,0.15)' }]}>
              <Ionicons name="person-outline" size={16} color={Colors.info} />
            </View>
            <Text style={styles.cardTitle}>Dados Pessoais</Text>
          </View>
          <PreviewRow label="Nome Completo" value={registro.nomeCompleto} />
          <PreviewRow label="Data de Nascimento" value={formatDate(registro.dataNascimento)} />
          <PreviewRow label="Género" value={registro.genero === 'M' ? 'Masculino' : registro.genero === 'F' ? 'Feminino' : registro.genero} />
          <PreviewRow label="Telefone" value={registro.telefone} />
          <PreviewRow label="Email" value={registro.email} />
          <PreviewRow label="Província" value={registro.provincia} />
          <PreviewRow label="Município" value={registro.municipio} />
          {registro.bairro ? <PreviewRow label="Bairro" value={registro.bairro} /> : null}
          {registro.numeroBi ? <PreviewRow label="Nº do BI" value={registro.numeroBi} /> : null}
          {registro.numeroCedula ? <PreviewRow label="Nº Cédula" value={registro.numeroCedula} /> : null}
        </View>

        {/* ── Dados Escolares ── */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={[styles.cardIcon, { backgroundColor: 'rgba(240,165,0,0.15)' }]}>
              <Ionicons name="school-outline" size={16} color={Colors.gold} />
            </View>
            <Text style={styles.cardTitle}>Dados Escolares</Text>
          </View>
          <PreviewRow label="Nível de Ensino" value={registro.nivel} />
          <PreviewRow label="Classe Pretendida" value={registro.classe} />
          {registro.cursoNome ? <PreviewRow label="Curso / Área" value={registro.cursoNome} /> : null}
          <PreviewRow label="Ano Lectivo" value={anoAtual()} />
          {registro.observacoes ? <PreviewRow label="Observações" value={registro.observacoes} /> : null}
        </View>

        {/* ── Encarregado ── */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={[styles.cardIcon, { backgroundColor: 'rgba(46,204,113,0.15)' }]}>
              <Ionicons name="people-outline" size={16} color={Colors.success} />
            </View>
            <Text style={styles.cardTitle}>Encarregado de Educação</Text>
          </View>
          <PreviewRow label="Nome" value={registro.nomeEncarregado} />
          <PreviewRow label="Telefone" value={registro.telefoneEncarregado} />
        </View>

        {/* ── Processo de Admissão ── */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={[styles.cardIcon, { backgroundColor: 'rgba(204,26,26,0.15)' }]}>
              <Ionicons name="ribbon-outline" size={16} color={Colors.accent} />
            </View>
            <Text style={styles.cardTitle}>Processo de Admissão</Text>
          </View>
          <PreviewRow label="Estado" value={statusInfo?.label ?? registro.status} />
          {registro.rupeInscricao ? <PreviewRow label="RUPE — Inscrição" value={registro.rupeInscricao} /> : null}
          {registro.rupeMatricula ? <PreviewRow label="RUPE — Matrícula" value={registro.rupeMatricula} /> : null}
          {registro.dataProva ? <PreviewRow label="Data do Exame" value={registro.dataProva} /> : null}
          {registro.notaAdmissao !== undefined && registro.notaAdmissao !== null
            ? <PreviewRow label="Nota de Admissão" value={`${registro.notaAdmissao}/20`} />
            : null}
        </View>

        {/* ── Botão de impressão / aviso de pagamento ── */}
        {pagamentoPendente ? (
          <View style={styles.printBlockedBanner}>
            <Ionicons name="lock-closed-outline" size={18} color="#E67E22" />
            <Text style={styles.printBlockedText}>
              Impressão bloqueada — aguardando confirmação do pagamento pela área financeira.
            </Text>
          </View>
        ) : (
          <>
            {Platform.OS !== 'web' && (
              <View style={styles.mobileHint}>
                <Ionicons name="information-circle-outline" size={16} color={Colors.textMuted} />
                <Text style={styles.mobileHintText}>
                  Para imprimir ou exportar como PDF, aceda a este ecrã através de um computador.
                </Text>
              </View>
            )}

            {Platform.OS === 'web' && (
              <TouchableOpacity
                style={[styles.printBtnLarge, isPrinting && { opacity: 0.6 }]}
                onPress={handlePrint}
                disabled={isPrinting}
                activeOpacity={0.85}
              >
                <LinearGradient colors={['#1E3A5F', '#0D1F35']} style={styles.printBtnLargeGrad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                  {isPrinting
                    ? <AppLoader color="#fff" size="small" />
                    : <Ionicons name="print-outline" size={20} color="#fff" />}
                  <Text style={styles.printBtnLargeText}>{isPrinting ? 'A preparar impressão...' : 'Imprimir / Exportar PDF'}</Text>
                </LinearGradient>
              </TouchableOpacity>
            )}
          </>
        )}

      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  header: { paddingBottom: 14 },
  headerInner: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, maxWidth: 720, width: '100%', alignSelf: 'center',
  },
  backBtn: { width: 38, height: 38, borderRadius: 11, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.border },
  headerTitle: { fontSize: 16, fontFamily: 'Inter_700Bold', color: Colors.text },
  headerSub: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 1 },

  printBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.primary, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 11, borderWidth: 1, borderColor: Colors.borderLight },
  printBtnText: { fontSize: 13, fontFamily: 'Inter_700Bold', color: '#fff' },

  scroll: { flex: 1 },
  scrollContent: { padding: 16, gap: 16, maxWidth: 720, width: '100%', alignSelf: 'center' },

  loadingText: { fontSize: 14, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 12 },
  backBtnFallback: { marginTop: 20, backgroundColor: Colors.primary, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 },
  backBtnFallbackText: { fontSize: 14, fontFamily: 'Inter_700Bold', color: '#fff' },

  identCard: { borderRadius: 18, borderWidth: 1, borderColor: Colors.borderLight, overflow: 'hidden', padding: 20 },
  identTop: { flexDirection: 'row', gap: 16, alignItems: 'flex-start' },
  identInfo: { flex: 1, gap: 8 },
  identNome: { fontSize: 18, fontFamily: 'Inter_700Bold', color: Colors.text, lineHeight: 24 },
  identMeta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  identMetaText: { fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textMuted },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, alignSelf: 'flex-start', marginTop: 4 },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusBadgeText: { fontSize: 12, fontFamily: 'Inter_700Bold' },

  qrWrap: { alignItems: 'center', gap: 8, backgroundColor: '#122540', padding: 10, borderRadius: 12, borderWidth: 1, borderColor: Colors.border },
  qrLabel: { fontSize: 9, fontFamily: 'Inter_600SemiBold', color: Colors.textMuted, textAlign: 'center' },

  infoRow: { flexDirection: 'row', backgroundColor: Colors.backgroundCard, borderRadius: 14, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden' },
  infoItem: { flex: 1, alignItems: 'center', paddingVertical: 14, gap: 4 },
  infoItemLabel: { fontSize: 10, fontFamily: 'Inter_400Regular', color: Colors.textMuted, textAlign: 'center' },
  infoItemValue: { fontSize: 11, fontFamily: 'Inter_700Bold', color: Colors.text, textAlign: 'center' },
  infoDivider: { width: 1, backgroundColor: Colors.border, marginVertical: 10 },

  card: { backgroundColor: Colors.backgroundCard, borderRadius: 18, borderWidth: 1, borderColor: Colors.border, padding: 18, gap: 2 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  cardIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontSize: 14, fontFamily: 'Inter_700Bold', color: Colors.text },

  mobileHint: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 12, padding: 14 },
  mobileHintText: { fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textMuted, flex: 1, lineHeight: 18 },

  printBtnLarge: { borderRadius: 16, overflow: 'hidden' },
  printBtnLargeGrad: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 18, gap: 10, borderRadius: 16 },
  printBtnLargeText: { fontSize: 15, fontFamily: 'Inter_700Bold', color: '#fff' },

  printBlockedBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: 'rgba(230,126,34,0.1)',
    borderRadius: 14, borderWidth: 1, borderColor: 'rgba(230,126,34,0.35)',
    padding: 16,
  },
  printBlockedText: { flex: 1, fontSize: 13, fontFamily: 'Inter_500Medium', color: '#E67E22', lineHeight: 19 },

  pagamentoPendenteCard: {
    backgroundColor: 'rgba(230,126,34,0.07)',
    borderRadius: 18, borderWidth: 1.5, borderColor: 'rgba(230,126,34,0.35)',
    padding: 18, gap: 14,
  },
  pagamentoPendenteHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  pagamentoPendenteIconWrap: {
    width: 44, height: 44, borderRadius: 12,
    backgroundColor: 'rgba(230,126,34,0.15)',
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  pagamentoPendenteTitle: { fontSize: 14, fontFamily: 'Inter_700Bold', color: '#E67E22', marginBottom: 4 },
  pagamentoPendenteSubtitle: { fontSize: 12, fontFamily: 'Inter_400Regular', color: 'rgba(255,255,255,0.65)', lineHeight: 18 },
  pagamentoPendenteRupe: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: 'rgba(230,126,34,0.1)', borderRadius: 12,
    borderWidth: 1, borderColor: 'rgba(230,126,34,0.25)', padding: 12,
  },
  pagamentoPendenteRupeLabel: { fontSize: 10, fontFamily: 'Inter_600SemiBold', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.3 },
  pagamentoPendenteRupeValue: { fontSize: 16, fontFamily: 'Inter_700Bold', color: '#E67E22', letterSpacing: 1, marginTop: 2 },
  pagamentoPendenteSteps: { gap: 10 },
  pagamentoPendenteStep: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  pagamentoPendenteStepNum: {
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: 'rgba(230,126,34,0.15)',
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  pagamentoPendenteStepNumText: { fontSize: 11, fontFamily: 'Inter_700Bold', color: '#E67E22' },
  pagamentoPendenteStepText: { fontSize: 12, fontFamily: 'Inter_400Regular', color: 'rgba(255,255,255,0.65)', flex: 1, lineHeight: 17 },
});

const pk = StyleSheet.create({
  searchWrap: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
    marginHorizontal: 16, marginVertical: 12, paddingHorizontal: 14, paddingVertical: 10,
  },
  searchInput: {
    flex: 1, fontSize: 13, fontFamily: 'Inter_400Regular',
    color: Colors.text, outlineStyle: 'none' as any,
  },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32 },
  emptyText: { fontSize: 14, fontFamily: 'Inter_400Regular', color: Colors.textMuted, textAlign: 'center' },
  card: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 16,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', padding: 14, gap: 12,
  },
  cardLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  badge: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  cardName: { fontSize: 14, fontFamily: 'Inter_700Bold', color: Colors.text },
  cardSub: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 2 },
  statusTag: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, flexShrink: 0 },
  statusText: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
});
