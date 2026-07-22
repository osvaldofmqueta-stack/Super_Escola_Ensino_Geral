import React, { useState, useEffect, useRef, useCallback } from 'react';
import { anoLetivoDe } from '@/lib/anoLetivo';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Platform, TextInput, FlatList } from 'react-native';
import AppLoader from '@/components/AppLoader';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors } from '@/constants/colors';
import { webAlert } from '@/utils/webAlert';
import { StableSearchInput } from '@/components/StableSearchInput';

function buildQrImageUrl(data: string, size = 88): string {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(data)}&bgcolor=132145&color=ffffff&margin=4&ecc=M`;
}

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
  dataProva?: string;
  notaAdmissao?: number;
  rupeMatricula?: string;
  pagamentoMatriculaConfirmado?: boolean;
  criadoEm: string;
}

function formatDate(val: string | undefined): string {
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

function anoAtual(): string { return anoLetivoDe(); }

function codigoMatricula(reg: Registro): string {
  return `MAT-${anoAtual()}-${reg.id.slice(0, 6).toUpperCase()}`;
}

function buildQrData(reg: Registro): string {
  return JSON.stringify({
    tipo: 'BOLETIM_MATRICULA',
    codigo: codigoMatricula(reg),
    nome: reg.nomeCompleto,
    nivel: reg.nivel,
    classe: reg.classe,
    curso: reg.cursoNome || '',
    status: reg.status,
  });
}

async function fetchNomeEscola(): Promise<string> {
  try {
    const res = await fetch('/api/config');
    if (!res.ok) return 'QUETA';
    const data = await res.json();
    return data.nomeEscola || 'QUETA';
  } catch { return 'QUETA'; }
}

function generateBoletimMatriculaHTML(reg: Registro, nomeEscola: string, qrDataUrl: string, origin = ''): string {
  const codigo = codigoMatricula(reg);
  const generoLabel = reg.genero === 'M' ? 'Masculino' : reg.genero === 'F' ? 'Feminino' : reg.genero;
  const statusLabel = reg.status === 'matriculado' ? 'Matriculado(a)' : 'Admitido(a) — Pagamento Confirmado';

  return `<!DOCTYPE html>
<html lang="pt">
<head>
<meta charset="UTF-8">
<title>Boletim de Matrícula — ${reg.nomeCompleto}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  @page { size: A4 portrait; margin: 0; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 10pt; color: #000; background: #fff; }
  .page { width: 100%; }
  .header-row { display: flex; align-items: flex-start; gap: 12px; margin-bottom: 6px; }
  .header-text { flex: 1; text-align: center; }
  .header-text p { font-size: 9.5pt; line-height: 1.55; }
  .header-text .bold { font-weight: bold; }
  .header-text .title { font-size: 13pt; font-weight: bold; margin-top: 6px; letter-spacing: 0.5px; text-transform: uppercase; border-bottom: 2px solid #000; display: inline-block; padding-bottom: 2px; }
  .header-text .codigo { font-size: 9pt; margin-top: 4px; color: #333; }
  .qr-box { width: 88px; height: 88px; border: 1.5px solid #000; display: flex; align-items: center; justify-content: center; flex-shrink: 0; padding: 3px; background: #fff; }
  .qr-box img { width: 100%; height: 100%; object-fit: contain; }
  .qr-label { font-size: 6pt; text-align: center; margin-top: 3px; color: #444; font-weight: bold; }
  .alerta { background: #1E3A5F; color: #fff; text-align: center; font-weight: bold; font-size: 9.5pt; padding: 4px 0; margin: 8px 0; letter-spacing: 0.8px; text-transform: uppercase; }
  .status-box { border: 1.5px solid #1E3A5F; border-radius: 4px; padding: 10px 14px; margin: 10px 0; display: flex; gap: 20px; align-items: center; flex-wrap: wrap; background: #f7f9ff; }
  .status-box .status-label { font-size: 9pt; color: #444; }
  .status-box .status-value { font-size: 11pt; font-weight: bold; color: #1E3A5F; }
  .status-box .mat-num { font-size: 11pt; font-weight: bold; color: #0a5e14; letter-spacing: 1px; }
  .section-title { font-weight: bold; font-size: 10pt; margin: 10px 0 4px; padding: 3px 6px; background: #f0f0f0; border-left: 3px solid #1E3A5F; text-transform: uppercase; letter-spacing: 0.3px; }
  .field-line { display: flex; align-items: baseline; gap: 4px; margin-bottom: 5px; font-size: 9.5pt; flex-wrap: wrap; }
  .field-line .label { white-space: nowrap; color: #444; }
  .field-line .value { border-bottom: 1px solid #555; flex: 1; min-width: 60px; padding-bottom: 1px; font-weight: 600; }
  .multi-field { display: flex; gap: 16px; flex-wrap: wrap; margin-bottom: 5px; font-size: 9.5pt; }
  .multi-field .item { display: flex; align-items: baseline; gap: 4px; }
  .multi-field .item .label { color: #444; white-space: nowrap; }
  .multi-field .item .value { border-bottom: 1px solid #555; min-width: 60px; padding-bottom: 1px; font-weight: 600; }
  .declaracao { margin-top: 14px; border-top: 2px solid #000; padding-top: 10px; }
  .declaracao-title { font-weight: bold; text-align: center; font-size: 11pt; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.5px; }
  .decl-text { font-size: 9.5pt; line-height: 1.65; margin-bottom: 6px; text-align: justify; }
  .local-data { text-align: center; margin: 12px 0 6px; font-size: 9.5pt; }
  .signature-area { display: flex; justify-content: space-between; margin-top: 16px; }
  .sig-block { text-align: center; font-size: 9pt; }
  .sig-line { border-top: 1px solid #000; width: 160px; margin: 28px auto 4px; }
  .footer { margin-top: 16px; border-top: 1px solid #ccc; padding-top: 6px; display: flex; justify-content: space-between; font-size: 7.5pt; color: #555; }
  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } .no-print { display: none !important; } }
</style>
</head>
<body>
<div class="page">
  <div class="header-row">
    <div style="width:50px;flex-shrink:0;"></div>
    <div class="header-text">
      <img src="${origin}/angola-brasao.png" style="width:62px;height:auto;display:block;margin:0 auto 4px;" alt="Insígnia da República de Angola" onerror="this.style.display='none'" />
      <p>REPÚBLICA DE ANGOLA</p>
      <p>MINISTÉRIO DA EDUCAÇÃO</p>
      <p class="bold">${nomeEscola}</p>
      <p class="title">Boletim de Matrícula</p>
      <p class="codigo">Código: <strong>${codigo}</strong> &nbsp;|&nbsp; Data: <strong>${hoje()}</strong> &nbsp;|&nbsp; Ano Lectivo: <strong>${anoAtual()}</strong></p>
    </div>
    <div style="display:flex;flex-direction:column;align-items:center;flex-shrink:0;">
      <div class="qr-box">
        ${qrDataUrl ? `<img src="${qrDataUrl}" alt="QR Code" />` : '<div style="width:100%;height:100%;border:1px dashed #999;display:flex;align-items:center;justify-content:center;font-size:7pt;color:#999;">QR</div>'}
      </div>
      <div class="qr-label">${codigo}</div>
    </div>
  </div>

  <div class="alerta">Boletim de Matrícula — Secretaria — Ano Lectivo ${anoAtual()}</div>

  <div class="status-box">
    <div>
      <div class="status-label">Estado da Matrícula</div>
      <div class="status-value">${statusLabel}</div>
    </div>
    <div>
      <div class="status-label">Nº de Matrícula</div>
      <div class="mat-num">${codigo}</div>
    </div>
    <div>
      <div class="status-label">Classe</div>
      <div class="status-value">${reg.classe}</div>
    </div>
    <div>
      <div class="status-label">Nível</div>
      <div class="status-value">${reg.nivel}</div>
    </div>
    ${reg.cursoNome ? `<div><div class="status-label">Curso / Área</div><div class="status-value">${reg.cursoNome}</div></div>` : ''}
    ${reg.notaAdmissao !== undefined && reg.notaAdmissao !== null ? `<div><div class="status-label">Nota de Admissão</div><div class="status-value">${reg.notaAdmissao}/20</div></div>` : ''}
  </div>

  <div class="section-title">A — Dados Pessoais do Aluno</div>
  <div class="field-line"><span class="label">Nome Completo:</span><span class="value">${reg.nomeCompleto}</span></div>
  <div class="multi-field">
    <div class="item"><span class="label">Data de Nascimento:</span><span class="value">${formatDate(reg.dataNascimento)}</span></div>
    <div class="item"><span class="label">Sexo:</span><span class="value">${generoLabel}</span></div>
  </div>
  <div class="multi-field">
    <div class="item"><span class="label">Província:</span><span class="value">${reg.provincia}</span></div>
    <div class="item"><span class="label">Município:</span><span class="value">${reg.municipio}</span></div>
  </div>
  ${reg.bairro || reg.endereco ? `<div class="field-line"><span class="label">Bairro / Endereço:</span><span class="value">${reg.bairro || ''} ${reg.endereco || ''}</span></div>` : ''}
  <div class="multi-field">
    <div class="item"><span class="label">Telefone:</span><span class="value">${reg.telefone}</span></div>
    <div class="item"><span class="label">Email:</span><span class="value">${reg.email}</span></div>
  </div>
  ${reg.numeroBi ? `<div class="multi-field"><div class="item"><span class="label">Nº do BI:</span><span class="value">${reg.numeroBi}</span></div>${reg.numeroCedula ? `<div class="item"><span class="label">Nº Cédula:</span><span class="value">${reg.numeroCedula}</span></div>` : ''}</div>` : ''}

  <div class="section-title">B — Dados Escolares</div>
  <div class="multi-field">
    <div class="item"><span class="label">Nível de Ensino:</span><span class="value">${reg.nivel}</span></div>
    <div class="item"><span class="label">Classe:</span><span class="value">${reg.classe}</span></div>
    ${reg.cursoNome ? `<div class="item"><span class="label">Curso / Área:</span><span class="value">${reg.cursoNome}</span></div>` : ''}
    <div class="item"><span class="label">Ano Lectivo:</span><span class="value">${anoAtual()}</span></div>
  </div>

  <div class="section-title">C — Dados do Encarregado de Educação</div>
  <div class="field-line"><span class="label">Nome Completo do Encarregado:</span><span class="value">${reg.nomeEncarregado}</span></div>
  <div class="field-line"><span class="label">Telefone:</span><span class="value">${reg.telefoneEncarregado}</span></div>

  <div class="declaracao">
    <div class="declaracao-title">Declaração sob Compromisso de Honra</div>
    <div class="decl-text">
      Eu, <span style="border-bottom:1px solid #000;display:inline-block;min-width:220px;font-weight:600;">${reg.nomeCompleto}</span>,
      do sexo <span style="border-bottom:1px solid #000;display:inline-block;min-width:80px;">${generoLabel}</span>,
      de nacionalidade <span style="border-bottom:1px solid #000;display:inline-block;min-width:90px;">Angolana</span>,
      nascido(a) a <span style="border-bottom:1px solid #000;display:inline-block;min-width:110px;">${formatDate(reg.dataNascimento)}</span>,
      residente no Município de <span style="border-bottom:1px solid #000;display:inline-block;min-width:100px;">${reg.municipio}</span>,
      Província de <span style="border-bottom:1px solid #000;display:inline-block;min-width:100px;">${reg.provincia}</span>,
      declaro, sob compromisso de honra, que todos os dados fornecidos neste formulário são verídicos e correspondem à realidade, e que aceito as condições de matrícula estabelecidas pela instituição.
    </div>
    <div class="decl-text">
      Comprometo-me a cumprir o Regulamento Interno da Escola, a frequentar regularmente as aulas e a respeitar os prazos e obrigações académicas e financeiras estabelecidos pela Direcção da Escola.
    </div>
    <div class="decl-text">
      O Encarregado de Educação, <span style="border-bottom:1px solid #000;display:inline-block;min-width:200px;font-weight:600;">${reg.nomeEncarregado}</span>,
      compromete-se a acompanhar o processo educativo do seu educando e a cumprir todas as obrigações estabelecidas pela instituição.
    </div>
    <div class="local-data">
      Luanda,&nbsp;
      <span style="border-bottom:1px solid #000;display:inline-block;min-width:30px;">&nbsp;</span>
      &nbsp;de&nbsp;
      <span style="border-bottom:1px solid #000;display:inline-block;min-width:100px;">&nbsp;</span>
      &nbsp;de&nbsp;<strong>${anoAtual()}</strong>
    </div>
    <div class="signature-area">
      <div class="sig-block"><div class="sig-line"></div><div>Assinatura do(a) Aluno(a) / Encarregado</div></div>
      <div class="sig-block"><div class="sig-line"></div><div>O Funcionário da Secretaria</div></div>
      <div class="sig-block"><div class="sig-line"></div><div>O Director(a) da Escola</div></div>
    </div>
  </div>

  <div class="footer">
    <span>${nomeEscola} — Sistema QUETA v3</span>
    <span>Código: ${codigo}</span>
    <span>Emitido em: ${hoje()}</span>
  </div>
</div>
</body>
</html>`;
}

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

export default function BoletimMatriculaScreen() {
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

  const topPad = Platform.OS === 'web' ? 0 : insets.top;
  const bottomPad = Platform.OS === 'web' ? 24 : insets.bottom;

  const load = useCallback(async () => {
    if (!registroId) {
      try {
        const [res, escola] = await Promise.all([fetch('/api/registros'), fetchNomeEscola()]);
        if (res.ok) {
          const data = await res.json();
          const list: Registro[] = Array.isArray(data) ? data : data.registros ?? [];
          setTodos(list.filter(r => r.status === 'admitido' || r.status === 'matriculado'));
        }
        setNomeEscola(escola);
      } catch {}
      setIsPickMode(true);
      setIsLoading(false);
      return;
    }
    try {
      const [regRes, escola] = await Promise.all([fetch(`/api/registros/${registroId}`), fetchNomeEscola()]);
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
    codigoMatricula(r).toLowerCase().includes(searchQuery.toLowerCase()) ||
    (r.telefone || '').includes(searchQuery) ||
    (r.cursoNome || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  function handlePrint() {
    if (!registro || Platform.OS !== 'web') return;
    setIsPrinting(true);
    const qrUrl = buildQrImageUrl(buildQrData(registro), 130);
    const html = generateBoletimMatriculaHTML(registro, nomeEscola, qrUrl, window.location.origin);
    const win = window.open('', '_blank');
    if (win) {
      win.document.write(html);
      win.document.close();
      setTimeout(() => { win.print(); }, 600);
    }
    setIsPrinting(false);
  }

  const statusMap: Record<string, { label: string; color: string }> = {
    admitido: { label: 'Admitido', color: Colors.success },
    matriculado: { label: 'Matriculado', color: Colors.gold },
  };

  if (isLoading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <LinearGradient colors={['#061029', '#0D1F35']} style={StyleSheet.absoluteFill} />
        <AppLoader color={Colors.gold} size="large" />
        <Text style={styles.loadingText}>A carregar...</Text>
      </View>
    );
  }

  if (isPickMode) {
    return (
      <View style={styles.container}>
        <LinearGradient colors={['#061029', '#0A1628', '#0D1F35']} style={StyleSheet.absoluteFill} />
        <LinearGradient colors={['#061029', '#0A1628']} style={[styles.header, { paddingTop: topPad + 12 }]}>
          <View style={styles.headerInner}>
            <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
              <Ionicons name="arrow-back" size={20} color={Colors.text} />
            </TouchableOpacity>
            <View style={{ flex: 1 }}>
              <Text style={styles.headerTitle}>Boletim de Matrícula</Text>
              <Text style={styles.headerSub}>Seleccione um estudante admitido ou matriculado</Text>
            </View>
          </View>
        </LinearGradient>

        <View style={pk.searchWrap}>
          <StableSearchInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            inputStyle={pk.searchInput}
            placeholder="Pesquisar por nome, código, curso ou telefone..."
            iconColor={Colors.textMuted}
          />
        </View>

        {todos.length === 0 ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <Ionicons name="people-outline" size={40} color={Colors.textMuted} />
            <Text style={{ color: Colors.textMuted, fontSize: 14 }}>Nenhum estudante admitido ou matriculado</Text>
          </View>
        ) : (
          <FlatList
            data={registrosFiltrados}
            keyExtractor={r => r.id}
            contentContainerStyle={{ padding: 16, paddingBottom: bottomPad + 24, gap: 10 }}
            renderItem={({ item: r }) => {
              const s = statusMap[r.status] ?? { label: r.status, color: Colors.textMuted };
              return (
                <TouchableOpacity style={pk.card} onPress={() => selecionarRegistro(r)} activeOpacity={0.8}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <View style={pk.avatar}>
                      <Text style={pk.avatarText}>{r.nomeCompleto[0]}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={pk.nome}>{r.nomeCompleto}</Text>
                      <Text style={pk.sub}>{r.nivel} · {r.classe}{r.cursoNome ? ` · ${r.cursoNome}` : ''}</Text>
                      <Text style={pk.codigo}>{codigoMatricula(r)}</Text>
                    </View>
                    <View style={[pk.badge, { backgroundColor: s.color + '22' }]}>
                      <Text style={[pk.badgeText, { color: s.color }]}>{s.label}</Text>
                    </View>
                  </View>
                </TouchableOpacity>
              );
            }}
          />
        )}
      </View>
    );
  }

  if (!registro) return null;

  const codigo = codigoMatricula(registro);
  const statusInfo = statusMap[registro.status] ?? { label: registro.status, color: Colors.textMuted };

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#061029', '#0A1628', '#0D1F35']} style={StyleSheet.absoluteFill} />
      <LinearGradient colors={['#061029', '#0A1628']} style={[styles.header, { paddingTop: topPad + 12 }]}>
        <View style={styles.headerInner}>
          <TouchableOpacity onPress={() => { setRegistro(null); setIsPickMode(true); }} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={20} color={Colors.text} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>Boletim de Matrícula</Text>
            <Text style={styles.headerSub}>{registro.nomeCompleto}</Text>
          </View>
          <TouchableOpacity
            style={[styles.printBtn, isPrinting && { opacity: 0.6 }]}
            onPress={handlePrint}
            disabled={isPrinting || Platform.OS !== 'web'}
          >
            <Ionicons name="print-outline" size={16} color="#fff" />
            <Text style={styles.printBtnText}>Imprimir PDF</Text>
          </TouchableOpacity>
        </View>
      </LinearGradient>

      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: bottomPad + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.codBox}>
          <View style={[styles.statusBadge, { backgroundColor: statusInfo.color + '22' }]}>
            <Text style={[styles.statusText, { color: statusInfo.color }]}>{statusInfo.label}</Text>
          </View>
          <Text style={styles.codLabel}>Código de Matrícula</Text>
          <Text style={styles.codValue}>{codigo}</Text>
          <Text style={styles.codSub}>Ano Lectivo {anoAtual()}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Dados Pessoais</Text>
          <PreviewRow label="Nome Completo" value={registro.nomeCompleto} />
          <PreviewRow label="Data de Nascimento" value={formatDate(registro.dataNascimento)} />
          <PreviewRow label="Sexo" value={registro.genero === 'M' ? 'Masculino' : 'Feminino'} />
          <PreviewRow label="Província" value={registro.provincia} />
          <PreviewRow label="Município" value={registro.municipio} />
          <PreviewRow label="Telefone" value={registro.telefone} />
          <PreviewRow label="Email" value={registro.email} />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Dados Escolares</Text>
          <PreviewRow label="Nível de Ensino" value={registro.nivel} />
          <PreviewRow label="Classe" value={registro.classe} />
          {registro.cursoNome ? <PreviewRow label="Curso / Área" value={registro.cursoNome} /> : null}
          {registro.notaAdmissao !== undefined && registro.notaAdmissao !== null ? (
            <PreviewRow label="Nota de Admissão" value={`${registro.notaAdmissao}/20`} />
          ) : null}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Encarregado de Educação</Text>
          <PreviewRow label="Nome" value={registro.nomeEncarregado} />
          <PreviewRow label="Telefone" value={registro.telefoneEncarregado} />
        </View>

        {Platform.OS === 'web' && (
          <TouchableOpacity style={styles.printBtnLarge} onPress={handlePrint} disabled={isPrinting}>
            {isPrinting
              ? <AppLoader color="#fff" size="small" />
              : <>
                <Ionicons name="print-outline" size={20} color="#fff" />
                <Text style={styles.printBtnLargeText}>Gerar e Imprimir Boletim de Matrícula</Text>
              </>
            }
          </TouchableOpacity>
        )}
      </ScrollView>
    </View>
  );
}

const pk = StyleSheet.create({
  searchWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.07)', margin: 16, marginBottom: 8, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  searchInput: { flex: 1, color: Colors.text, fontSize: 13, fontFamily: 'Inter_400Regular' },
  card: { backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)' },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.info + '30', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: Colors.info, fontSize: 16, fontFamily: 'Inter_700Bold' },
  nome: { fontSize: 14, fontFamily: 'Inter_600SemiBold', color: Colors.text },
  sub: { fontSize: 11, color: Colors.textMuted, marginTop: 1 },
  codigo: { fontSize: 10, color: Colors.gold, marginTop: 1, fontFamily: 'Inter_600SemiBold' },
  badge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-start' },
  badgeText: { fontSize: 10, fontFamily: 'Inter_700Bold', textTransform: 'uppercase' },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#061029' },
  header: { paddingHorizontal: 16, paddingBottom: 14 },
  headerInner: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  backBtn: { padding: 6 },
  headerTitle: { fontSize: 16, fontFamily: 'Inter_700Bold', color: Colors.text },
  headerSub: { fontSize: 11, color: Colors.textMuted, marginTop: 1 },
  printBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: Colors.success, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7 },
  printBtnText: { color: '#fff', fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  loadingText: { color: Colors.textMuted, marginTop: 12, fontSize: 14 },
  scrollContent: { padding: 16, gap: 14 },
  codBox: { backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 14, padding: 20, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  statusBadge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, marginBottom: 10 },
  statusText: { fontSize: 12, fontFamily: 'Inter_700Bold', textTransform: 'uppercase' },
  codLabel: { fontSize: 11, color: Colors.textMuted, marginBottom: 4 },
  codValue: { fontSize: 20, fontFamily: 'Inter_700Bold', color: Colors.gold, letterSpacing: 1 },
  codSub: { fontSize: 11, color: Colors.textMuted, marginTop: 4 },
  section: { backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)' },
  sectionTitle: { fontSize: 11, fontFamily: 'Inter_700Bold', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  printBtnLarge: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: Colors.success, borderRadius: 12, paddingVertical: 16, marginTop: 8 },
  printBtnLargeText: { color: '#fff', fontSize: 15, fontFamily: 'Inter_600SemiBold' },
});
