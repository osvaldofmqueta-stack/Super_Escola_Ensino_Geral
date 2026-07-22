import React, { useState, useEffect, useCallback } from 'react';
import { anoLetivoDe } from '@/lib/anoLetivo';
import {Alert, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View} from 'react-native';
import AppLoader from '@/components/AppLoader';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors } from '@/constants/colors';
import { PROVISORIO_KEY } from './login-provisorio';

const MATRICULA_NUM_KEY = '@siga_matricula_numero';

function buildQrImageUrl(data: string, size = 100): string {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(data)}&bgcolor=132145&color=ffffff&margin=4&ecc=M`;
}

function hoje(): string {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

function anoAtual(): string { return anoLetivoDe(); }

function formatDate(val: string | undefined): string {
  if (!val) return '___/___/______';
  try {
    const d = new Date(val);
    if (isNaN(d.getTime())) return val;
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
  } catch { return val; }
}

function generateBoletimMatriculaHTML(reg: Registro, numeroMatricula: string, nomeEscola: string): string {
  const codigo = `MAT-${anoAtual()}-${reg.id.slice(0, 6).toUpperCase()}`;
  const generoLabel = reg.genero === 'M' ? 'Masculino' : reg.genero === 'F' ? 'Feminino' : reg.genero;
  const qrData = JSON.stringify({ tipo: 'BOLETIM_MATRICULA', numeroMatricula, nome: reg.nomeCompleto, classe: reg.classe, nivel: reg.nivel });
  const qrUrl = buildQrImageUrl(qrData, 110);

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
  .qr-box { width: 90px; height: 90px; border: 1.5px solid #000; display: flex; align-items: center; justify-content: center; flex-shrink: 0; padding: 3px; background: #fff; }
  .qr-box img { width: 100%; height: 100%; object-fit: contain; }
  .qr-label { font-size: 6pt; text-align: center; margin-top: 3px; color: #444; font-weight: bold; }
  .alerta { background: #1E3A5F; color: #fff; text-align: center; font-weight: bold; font-size: 9.5pt; padding: 4px 0; margin: 8px 0; letter-spacing: 0.8px; text-transform: uppercase; }
  .status-box { border: 1.5px solid #1E3A5F; border-radius: 4px; padding: 10px 14px; margin: 10px 0; display: flex; gap: 20px; align-items: center; background: #f7f9ff; }
  .status-box .status-label { font-size: 9pt; color: #444; }
  .status-box .status-value { font-size: 11pt; font-weight: bold; color: #1E3A5F; }
  .status-box .mat-num { font-size: 12pt; font-weight: bold; color: #0a5e14; letter-spacing: 1px; }
  .section-title { font-weight: bold; font-size: 10pt; margin: 10px 0 4px; padding: 3px 6px; background: #f0f0f0; border-left: 3px solid #1E3A5F; text-transform: uppercase; letter-spacing: 0.3px; }
  .separator { border-top: 1px solid #ccc; margin: 8px 0; }
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
      <img src="/angola-brasao.png" style="width:62px;height:auto;display:block;margin:0 auto 4px;" alt="Insígnia da República de Angola" onerror="this.style.display='none'" />
      <p>REPÚBLICA DE ANGOLA</p>
      <p>MINISTÉRIO DA EDUCAÇÃO</p>
      <p class="bold">${nomeEscola}</p>
      <p class="title">Boletim de Matrícula</p>
      <p class="codigo">Nº de Matrícula: <strong>${numeroMatricula}</strong> &nbsp;|&nbsp; Data: <strong>${hoje()}</strong> &nbsp;|&nbsp; Ano Lectivo: <strong>${anoAtual()}</strong></p>
    </div>
    <div style="display:flex;flex-direction:column;align-items:center;flex-shrink:0;">
      <div class="qr-box"><img src="${qrUrl}" alt="QR" /></div>
      <div class="qr-label">${numeroMatricula}</div>
    </div>
  </div>

  <div class="alerta">Boletim de Matrícula — Ano Lectivo ${anoAtual()}</div>

  <div class="status-box">
    <div>
      <div class="status-label">Estado</div>
      <div class="status-value">Matriculado(a)</div>
    </div>
    <div>
      <div class="status-label">Número de Matrícula</div>
      <div class="mat-num">${numeroMatricula}</div>
    </div>
    <div>
      <div class="status-label">Classe</div>
      <div class="status-value">${reg.classe}</div>
    </div>
    <div>
      <div class="status-label">Nível</div>
      <div class="status-value">${reg.nivel}</div>
    </div>
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
  <div class="multi-field">
    <div class="item"><span class="label">Telefone:</span><span class="value">${reg.telefone}</span></div>
    <div class="item"><span class="label">Email:</span><span class="value">${reg.email}</span></div>
  </div>

  <div class="section-title">B — Dados do Encarregado de Educação</div>
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
      declaro, sob compromisso de honra, que todos os dados fornecidos são verídicos e aceito as condições de matrícula estabelecidas pela instituição.
    </div>
    <div class="decl-text">
      Comprometo-me a cumprir o Regulamento Interno da Escola, a frequentar regularmente as aulas e a respeitar os prazos e obrigações académicas e financeiras.
    </div>
    <div class="decl-text">
      O Encarregado de Educação, <span style="border-bottom:1px solid #000;display:inline-block;min-width:200px;font-weight:600;">${reg.nomeEncarregado}</span>,
      compromete-se a acompanhar o processo educativo do seu educando e a cumprir todas as obrigações estabelecidas.
    </div>
    <div class="local-data">
      Luanda,&nbsp;<span style="border-bottom:1px solid #000;display:inline-block;min-width:30px;">&nbsp;</span>
      &nbsp;de&nbsp;<span style="border-bottom:1px solid #000;display:inline-block;min-width:100px;">&nbsp;</span>
      &nbsp;de&nbsp;<strong>${anoAtual()}</strong>
    </div>
    <div class="signature-area">
      <div class="sig-block"><div class="sig-line"></div><div>Assinatura do(a) Aluno(a) / Encarregado</div></div>
      <div class="sig-block"><div class="sig-line"></div><div>O Funcionário da Secretaria</div></div>
      <div class="sig-block"><div class="sig-line"></div><div>O Director(a) da Escola</div></div>
    </div>
  </div>
  <div class="footer"><span>${nomeEscola} — Sistema QUETA v3</span><span>Nº Matrícula: ${numeroMatricula}</span><span>Emitido em: ${hoje()}</span></div>
</div>
</body>
</html>`;
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
  nivel: string;
  classe: string;
  status: string;
  senhaProvisoria: string;
  dataProva?: string;
  notaAdmissao?: number;
  resultadoAdmissao?: string;
  matriculaCompleta?: boolean;
  rupeInscricao?: string;
  rupeMatricula?: string;
  tipoInscricao?: string;
  pagamentoMatriculaConfirmado?: boolean;
  pagamentoMatriculaConfirmadoEm?: string;
  nomeEncarregado: string;
  criadoEm: string;
}

type Status = 'aprovado' | 'admitido' | 'reprovado_admissao' | 'matriculado' | string;

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: string; bg: string }> = {
  aprovado: { label: 'Aprovado para Exame', color: '#3498DB', icon: 'checkmark-circle-outline', bg: 'rgba(52,152,219,0.1)' },
  admitido: { label: 'Admitido', color: Colors.success, icon: 'trophy-outline', bg: 'rgba(39,174,96,0.1)' },
  reprovado_admissao: { label: 'Não Admitido', color: Colors.danger, icon: 'close-circle-outline', bg: 'rgba(231,76,60,0.1)' },
  matriculado: { label: 'Matrícula Concluída', color: Colors.gold, icon: 'ribbon-outline', bg: 'rgba(240,165,0,0.1)' },
};

function InfoRow({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Ionicons name={icon as any} size={14} color={Colors.textMuted} style={styles.infoRowIcon} />
      <View>
        <Text style={styles.infoRowLabel}>{label}</Text>
        <Text style={styles.infoRowValue}>{value || '—'}</Text>
      </View>
    </View>
  );
}

function TimelineStep({ num, label, done, active }: { num: number; label: string; done: boolean; active: boolean }) {
  return (
    <View style={tlStyles.step}>
      <View style={[tlStyles.circle, done && tlStyles.circleDone, active && tlStyles.circleActive]}>
        {done
          ? <Ionicons name="checkmark" size={12} color="#fff" />
          : <Text style={[tlStyles.num, active && tlStyles.numActive]}>{num}</Text>
        }
      </View>
      <Text style={[tlStyles.label, (done || active) && tlStyles.labelActive]}>{label}</Text>
    </View>
  );
}

export default function PortalProvisorioScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [registro, setRegistro] = useState<Registro | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isActing, setIsActing] = useState(false);
  const [rupeModal, setRupeModal] = useState<{ visible: boolean; tipo: 'inscricao' | 'matricula'; rupe: any } | null>(null);
  const [modalCompletar, setModalCompletar] = useState(false);
  const [modalSucesso, setModalSucesso] = useState<{ visible: boolean; numeroMatricula: string }>({ visible: false, numeroMatricula: '' });
  const [errorModal, setErrorModal] = useState<{ visible: boolean; message: string }>({ visible: false, message: '' });
  const [matriculaNumero, setMatriculaNumero] = useState('');

  const topPad = Platform.OS === 'web' ? 56 : insets.top;
  const bottomPad = Platform.OS === 'web' ? 24 : insets.bottom;

  const loadRegistro = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(PROVISORIO_KEY);
      if (!raw) { router.replace('/login-provisorio' as any); return; }
      const stored = JSON.parse(raw) as Registro;
      const res = await fetch(`/api/registros/${stored.id}`);
      if (!res.ok) throw new Error();
      const fresh = await res.json();
      await AsyncStorage.setItem(PROVISORIO_KEY, JSON.stringify(fresh));
      setRegistro(fresh);
    } catch {
      const raw = await AsyncStorage.getItem(PROVISORIO_KEY);
      if (raw) setRegistro(JSON.parse(raw));
    } finally {
      setIsLoading(false);
    }
    const matNum = await AsyncStorage.getItem(MATRICULA_NUM_KEY).catch(() => null);
    if (matNum) setMatriculaNumero(matNum);
  }, []);

  useEffect(() => { loadRegistro(); }, []);

  async function handleGerarRUPE(tipo: 'inscricao' | 'matricula') {
    if (!registro) return;
    const campo = tipo === 'inscricao' ? 'rupeInscricao' : 'rupeMatricula';
    if ((registro as any)[campo]) {
      setRupeModal({ visible: true, tipo, rupe: { referencia: (registro as any)[campo] } });
      return;
    }
    setIsActing(true);
    try {
      const res = await fetch(`/api/registros/${registro.id}/gerar-rupe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo, valor: tipo === 'inscricao' ? 5000 : 10000 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setRegistro(data.registro);
      await AsyncStorage.setItem(PROVISORIO_KEY, JSON.stringify(data.registro));
      setRupeModal({ visible: true, tipo, rupe: data });
    } catch (e: any) {
      setErrorModal({ visible: true, message: e.message || 'Não foi possível gerar o RUPE.' });
    } finally {
      setIsActing(false);
    }
  }

  function handleCompletarMatricula() {
    if (!registro) return;
    setModalCompletar(true);
  }

  async function executarCompletarMatricula() {
    if (!registro) return;
    setModalCompletar(false);
    setIsActing(true);
    try {
      const res = await fetch(`/api/registros/${registro.id}/completar-matricula`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      if (data.numeroMatricula) {
        await AsyncStorage.setItem(MATRICULA_NUM_KEY, data.numeroMatricula);
        setMatriculaNumero(data.numeroMatricula);
      }
      await loadRegistro();
      setModalSucesso({ visible: true, numeroMatricula: data.numeroMatricula || '' });
    } catch (e: any) {
      setErrorModal({ visible: true, message: e.message || 'Não foi possível completar a matrícula.' });
    } finally {
      setIsActing(false);
    }
  }

  async function handleImprimirBoletimMatricula(numMatricula?: string) {
    if (!registro || Platform.OS !== 'web') return;
    const matNum = numMatricula || matriculaNumero || 'SEM-NUMERO';
    const schoolRes = await fetch('/api/config').catch(() => null);
    const school = schoolRes?.ok ? (await schoolRes.json()) : {};
    const nomeEscola = school.nomeEscola || 'QUETA';
    const html = generateBoletimMatriculaHTML(registro, matNum, nomeEscola);
    const win = window.open('', '_blank');
    if (win) {
      win.document.write(html);
      win.document.close();
      setTimeout(() => { win.print(); }, 600);
    }
  }

  async function handleSair() {
    await AsyncStorage.removeItem(PROVISORIO_KEY);
    router.replace('/login' as any);
  }

  if (isLoading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <LinearGradient colors={['#061029', '#0D1F35']} style={StyleSheet.absoluteFill} />
        <AppLoader color={Colors.gold} size="large" />
      </View>
    );
  }

  if (!registro) return null;

  const status: Status = registro.status;
  const cfg = STATUS_CONFIG[status] ?? { label: status, color: Colors.textMuted, icon: 'help-circle-outline', bg: 'rgba(255,255,255,0.05)' };

  const nome = registro.nomeCompleto || '';
  const partes = nome.trim().split(/\s+/);
  const primeiroNome = partes[0] || '';

  const timelineSteps = ['Inscrição', 'Análise', 'Exame', 'Resultado', 'Matrícula'];
  const timelineActive = { aprovado: 2, admitido: 3, reprovado_admissao: 3, matriculado: 4 }[status] ?? 1;

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#061029', '#0A1628', '#0D1F35']} style={StyleSheet.absoluteFill} />

      {/* Header */}
      <LinearGradient colors={['#061029', '#0A1628']} style={[styles.header, { paddingTop: topPad + 8 }]}>
        <View style={styles.headerInner}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.headerGreeting}>Olá, {primeiroNome}</Text>
            <Text style={styles.headerSubtitle}>Conta Provisória — Processo de Admissão</Text>
          </View>
          <TouchableOpacity onPress={handleSair} style={styles.sairBtn} activeOpacity={0.8}>
            <Ionicons name="log-out-outline" size={18} color={Colors.textMuted} />
          </TouchableOpacity>
        </View>

        {/* Status badge */}
        <View style={[styles.statusBadge, { backgroundColor: cfg.bg }]}>
          <Ionicons name={cfg.icon as any} size={16} color={cfg.color} />
          <Text style={[styles.statusBadgeText, { color: cfg.color }]}>{cfg.label}</Text>
        </View>

        {/* Timeline */}
        <View style={styles.timeline}>
          {timelineSteps.map((label, i) => (
            <React.Fragment key={i}>
              {i > 0 && <View style={[tlStyles.connector, i <= timelineActive && tlStyles.connectorDone]} />}
              <TimelineStep
                num={i + 1}
                label={label}
                done={i < timelineActive}
                active={i === timelineActive}
              />
            </React.Fragment>
          ))}
        </View>
        </View>
      </LinearGradient>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: bottomPad + 24 }]}
        showsVerticalScrollIndicator={false}
      >

        {/* ── APROVADO PARA EXAME ── */}
        {status === 'aprovado' && (
          <>
            <View style={styles.card}>
              <View style={styles.cardHead}>
                <View style={[styles.cardIcon, { backgroundColor: 'rgba(52,152,219,0.12)' }]}>
                  <Ionicons name="calendar-outline" size={16} color="#3498DB" />
                </View>
                <Text style={styles.cardTitle}>Data do Exame de Admissão</Text>
              </View>
              {registro.dataProva ? (
                <View style={styles.dataProvaBox}>
                  <Ionicons name="calendar" size={32} color={Colors.gold} />
                  <View>
                    <Text style={styles.dataProvaLabel}>Exame marcado para</Text>
                    <Text style={styles.dataProvaValue}>{registro.dataProva}</Text>
                  </View>
                </View>
              ) : (
                <View style={styles.pendingBox}>
                  <Ionicons name="hourglass-outline" size={20} color={Colors.textMuted} />
                  <Text style={styles.pendingText}>A secretaria ainda não publicou a data do exame. Consulte esta página regularmente.</Text>
                </View>
              )}
            </View>

            <View style={styles.card}>
              <View style={styles.cardHead}>
                <View style={[styles.cardIcon, { backgroundColor: 'rgba(240,165,0,0.12)' }]}>
                  <Ionicons name="receipt-outline" size={16} color={Colors.gold} />
                </View>
                <Text style={styles.cardTitle}>Pagamento da Inscrição via RUPE</Text>
              </View>
              <Text style={styles.cardDesc}>
                Para garantir o seu lugar no exame de admissão, efectue o pagamento da taxa de inscrição através do sistema RUPE.
              </Text>
              {registro.rupeInscricao ? (
                <View style={styles.rupeBox}>
                  <Text style={styles.rupeLabel}>Referência RUPE</Text>
                  <Text style={styles.rupeRef}>{registro.rupeInscricao}</Text>
                  <Text style={styles.rupeInfo}>Pague em qualquer balcão Multicaixa ou banco</Text>
                </View>
              ) : (
                <TouchableOpacity style={styles.actionBtn} onPress={() => handleGerarRUPE('inscricao')} disabled={isActing} activeOpacity={0.85}>
                  {isActing ? <AppLoader color="#fff" size="small" /> : <>
                    <Ionicons name="qr-code-outline" size={16} color="#fff" />
                    <Text style={styles.actionBtnText}>Gerar RUPE de Inscrição</Text>
                  </>}
                </TouchableOpacity>
              )}
            </View>
          </>
        )}

        {/* ── ADMITIDO ── */}
        {status === 'admitido' && (
          <>
            <View style={[styles.card, styles.cardSuccess]}>
              <View style={styles.cardHead}>
                <Ionicons name="trophy-outline" size={22} color={Colors.success} />
                <Text style={[styles.cardTitle, { color: Colors.success }]}>Parabéns! Foi Admitido(a)</Text>
              </View>
              {registro.notaAdmissao !== undefined && registro.notaAdmissao !== null && (
                <View style={styles.notaBox}>
                  <Text style={styles.notaLabel}>Nota do Exame de Admissão</Text>
                  <Text style={styles.notaValue}>{registro.notaAdmissao}/20</Text>
                </View>
              )}
              <Text style={styles.cardDesc}>
                Foi admitido(a) para a {registro.classe}. Complete a sua matrícula para oficializar a sua inscrição na escola.
              </Text>
            </View>

            <View style={styles.card}>
              <View style={styles.cardHead}>
                <View style={[styles.cardIcon, { backgroundColor: 'rgba(240,165,0,0.12)' }]}>
                  <Ionicons name="receipt-outline" size={16} color={Colors.gold} />
                </View>
                <Text style={styles.cardTitle}>Pagamento da Matrícula via RUPE</Text>
              </View>
              <Text style={styles.cardDesc}>Antes de completar a matrícula, efectue o pagamento da taxa de matrícula.</Text>
              {registro.rupeMatricula ? (
                <View style={styles.rupeBox}>
                  <Text style={styles.rupeLabel}>Referência RUPE — Matrícula</Text>
                  <Text style={styles.rupeRef}>{registro.rupeMatricula}</Text>
                  <Text style={styles.rupeInfo}>Pague em qualquer balcão Multicaixa ou banco</Text>
                </View>
              ) : (
                <TouchableOpacity style={styles.actionBtn} onPress={() => handleGerarRUPE('matricula')} disabled={isActing} activeOpacity={0.85}>
                  {isActing ? <AppLoader color="#fff" size="small" /> : <>
                    <Ionicons name="qr-code-outline" size={16} color="#fff" />
                    <Text style={styles.actionBtnText}>Gerar RUPE de Matrícula</Text>
                  </>}
                </TouchableOpacity>
              )}
            </View>

            {/* Pagamento não confirmado — aviso */}
            {!registro.pagamentoMatriculaConfirmado && (
              <View style={styles.pagamentoAvisoBox}>
                <Ionicons name="time-outline" size={18} color={Colors.warning} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.pagamentoAvisoTitle}>Aguardando confirmação de pagamento</Text>
                  <Text style={styles.pagamentoAvisoDesc}>
                    Dirija-se à secretaria com o comprovativo de pagamento do RUPE de matrícula. O botão ficará disponível após a secretaria confirmar o seu pagamento.
                  </Text>
                </View>
              </View>
            )}

            <TouchableOpacity
              style={[styles.completarBtn, (isActing || !registro.pagamentoMatriculaConfirmado) && { opacity: 0.4 }]}
              onPress={handleCompletarMatricula}
              disabled={isActing || !registro.pagamentoMatriculaConfirmado}
              activeOpacity={0.85}
            >
              <LinearGradient
                colors={registro.pagamentoMatriculaConfirmado ? [Colors.success, '#27AE60'] : ['#555', '#444']}
                style={styles.completarBtnGrad}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                {isActing ? <AppLoader color="#fff" size="small" /> : <>
                  <Ionicons name={registro.pagamentoMatriculaConfirmado ? "checkmark-circle-outline" : "lock-closed-outline"} size={20} color="#fff" />
                  <Text style={styles.completarBtnText}>
                    {registro.pagamentoMatriculaConfirmado ? 'Completar Matrícula' : 'Pagamento Pendente'}
                  </Text>
                </>}
              </LinearGradient>
            </TouchableOpacity>
          </>
        )}

        {/* ── REPROVADO ── */}
        {status === 'reprovado_admissao' && (
          <View style={[styles.card, styles.cardDanger]}>
            <View style={styles.cardHead}>
              <Ionicons name="close-circle-outline" size={22} color={Colors.danger} />
              <Text style={[styles.cardTitle, { color: Colors.danger }]}>Não Admitido(a)</Text>
            </View>
            {registro.notaAdmissao !== undefined && registro.notaAdmissao !== null && (
              <View style={styles.notaBox}>
                <Text style={styles.notaLabel}>Nota do Exame</Text>
                <Text style={[styles.notaValue, { color: Colors.danger }]}>{registro.notaAdmissao}/20</Text>
              </View>
            )}
            <Text style={styles.cardDesc}>
              Lamentamos informar que não foi admitido(a) neste processo de admissão. A sua conta provisória foi encerrada.
            </Text>
            <Text style={[styles.cardDesc, { color: Colors.textMuted, marginTop: 8 }]}>
              Poderá candidatar-se novamente no próximo processo de admissão.
            </Text>
          </View>
        )}

        {/* ── MATRICULADO ── */}
        {status === 'matriculado' && (
          <>
            <View style={[styles.card, { borderColor: 'rgba(240,165,0,0.3)' }]}>
              <View style={styles.cardHead}>
                <Ionicons name="ribbon-outline" size={22} color={Colors.gold} />
                <Text style={[styles.cardTitle, { color: Colors.gold }]}>Matrícula Concluída!</Text>
              </View>
              {!!matriculaNumero && (
                <View style={{ backgroundColor: 'rgba(39,174,96,0.1)', borderRadius: 10, borderWidth: 1, borderColor: 'rgba(39,174,96,0.3)', padding: 12, alignItems: 'center', gap: 2 }}>
                  <Text style={{ fontSize: 10, fontFamily: 'Inter_600SemiBold', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 }}>Número de Matrícula</Text>
                  <Text style={{ fontSize: 18, fontFamily: 'Inter_700Bold', color: Colors.success, letterSpacing: 1 }}>{matriculaNumero}</Text>
                </View>
              )}
              <Text style={styles.cardDesc}>
                A sua matrícula foi concluída com sucesso. A sua conta de estudante foi activada e pode aceder ao portal oficial com as mesmas credenciais.
              </Text>
              {Platform.OS === 'web' && (
                <TouchableOpacity
                  style={styles.boletimBtn}
                  onPress={() => handleImprimirBoletimMatricula()}
                  activeOpacity={0.85}
                >
                  <Ionicons name="print-outline" size={16} color={Colors.gold} />
                  <Text style={styles.boletimBtnText}>Imprimir Boletim de Matrícula</Text>
                  <Ionicons name="chevron-forward" size={14} color={Colors.textMuted} />
                </TouchableOpacity>
              )}
            </View>

            <TouchableOpacity
              style={styles.completarBtn}
              onPress={() => router.replace('/login' as any)}
              activeOpacity={0.85}
            >
              <LinearGradient colors={[Colors.gold, '#E67E22']} style={styles.completarBtnGrad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                <Ionicons name="log-in-outline" size={20} color="#fff" />
                <Text style={styles.completarBtnText}>Aceder à Conta Oficial</Text>
              </LinearGradient>
            </TouchableOpacity>
          </>
        )}

        {/* ── Dados da Inscrição ── */}
        <View style={styles.card}>
          <View style={styles.cardHead}>
            <View style={[styles.cardIcon, { backgroundColor: 'rgba(255,255,255,0.06)' }]}>
              <Ionicons name="document-text-outline" size={16} color={Colors.textSecondary} />
            </View>
            <Text style={styles.cardTitle}>Dados da Inscrição</Text>
            <TouchableOpacity onPress={loadRegistro} style={styles.refreshBtn}>
              <Ionicons name="refresh-outline" size={16} color={Colors.textMuted} />
            </TouchableOpacity>
          </View>
          <InfoRow icon="person-outline" label="Nome Completo" value={registro.nomeCompleto} />
          <InfoRow icon="calendar-outline" label="Data de Nascimento" value={registro.dataNascimento} />
          <InfoRow icon="mail-outline" label="Email" value={registro.email} />
          <InfoRow icon="school-outline" label="Nível / Classe" value={`${registro.nivel} — ${registro.classe}`} />
          <InfoRow icon="location-outline" label="Província / Município" value={`${registro.provincia} / ${registro.municipio}`} />
          <InfoRow icon="people-outline" label="Encarregado" value={registro.nomeEncarregado} />

          <TouchableOpacity
            style={styles.boletimBtn}
            onPress={() => router.push(`/boletim-inscricao?id=${registro.id}` as any)}
            activeOpacity={0.85}
          >
            <Ionicons name="document-text-outline" size={16} color={Colors.gold} />
            <Text style={styles.boletimBtnText}>Ver / Imprimir Boletim de Inscrição</Text>
            <Ionicons name="chevron-forward" size={14} color={Colors.textMuted} />
          </TouchableOpacity>
        </View>

      </ScrollView>

      {/* RUPE Modal */}
      {rupeModal && (
        <Modal visible={rupeModal.visible} transparent animationType="fade" onRequestClose={() => setRupeModal(null)}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <View style={modalStyles.overlay}>
            <View style={modalStyles.container}>
              <Ionicons name="receipt-outline" size={40} color={Colors.gold} />
              <Text style={modalStyles.title}>Referência RUPE Gerada</Text>
              <Text style={modalStyles.subtitle}>{rupeModal.tipo === 'inscricao' ? 'Taxa de Inscrição' : 'Taxa de Matrícula'}</Text>
              <View style={modalStyles.refBox}>
                <Text style={modalStyles.ref}>{rupeModal.rupe?.referencia}</Text>
              </View>
              {rupeModal.rupe?.valor && <Text style={modalStyles.valor}>{rupeModal.rupe.valor.toLocaleString()} Kz</Text>}
              {rupeModal.rupe?.validade && <Text style={modalStyles.validade}>Válido até: {rupeModal.rupe.validade}</Text>}
              <Text style={modalStyles.info}>Utilize esta referência para efectuar o pagamento em qualquer banco ou caixa Multicaixa Express.</Text>
              <TouchableOpacity style={modalStyles.btn} onPress={() => setRupeModal(null)}>
                <Text style={modalStyles.btnText}>Fechar</Text>
              </TouchableOpacity>
            </View>
          </View>
                  </KeyboardAvoidingView>
</Modal>
      )}

      {/* Confirmar Matrícula Modal */}
      <Modal visible={modalCompletar} transparent animationType="fade" onRequestClose={() => setModalCompletar(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={modalStyles.overlay}>
          <View style={modalStyles.container}>
            <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: 'rgba(39,174,96,0.15)', alignItems: 'center', justifyContent: 'center', marginBottom: 4 }}>
              <Ionicons name="school-outline" size={28} color={Colors.success} />
            </View>
            <Text style={modalStyles.title}>Completar Matrícula</Text>
            <Text style={[modalStyles.info, { textAlign: 'center' }]}>
              Confirma que pretende finalizar a sua matrícula?{'\n'}Esta acção é irreversível.
            </Text>
            <View style={{ flexDirection: 'row', gap: 10, width: '100%', marginTop: 4 }}>
              <TouchableOpacity
                style={[modalStyles.btn, { flex: 1, backgroundColor: 'rgba(255,255,255,0.07)', borderWidth: 1, borderColor: Colors.border }]}
                onPress={() => setModalCompletar(false)}
              >
                <Text style={[modalStyles.btnText, { color: Colors.textSecondary }]}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[modalStyles.btn, { flex: 1, backgroundColor: Colors.success }]}
                onPress={executarCompletarMatricula}
                disabled={isActing}
              >
                {isActing
                  ? <AppLoader color="#fff" size="small" />
                  : <Text style={modalStyles.btnText}>Confirmar</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        </View>
              </KeyboardAvoidingView>
</Modal>

      {/* Sucesso Matrícula Modal */}
      <Modal visible={modalSucesso.visible} transparent animationType="fade" onRequestClose={() => setModalSucesso({ visible: false, numeroMatricula: '' })}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={modalStyles.overlay}>
          <View style={modalStyles.container}>
            <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: 'rgba(39,174,96,0.15)', alignItems: 'center', justifyContent: 'center', marginBottom: 4 }}>
              <Ionicons name="checkmark-circle" size={36} color={Colors.success} />
            </View>
            <Text style={[modalStyles.title, { color: Colors.success }]}>Matrícula Concluída!</Text>
            {!!modalSucesso.numeroMatricula && (
              <View style={modalStyles.refBox}>
                <Text style={[modalStyles.ref, { fontSize: 13 }]}>Nº de Matrícula</Text>
                <Text style={[modalStyles.ref, { color: Colors.success, fontSize: 20 }]}>{modalSucesso.numeroMatricula}</Text>
              </View>
            )}
            <Text style={[modalStyles.info, { textAlign: 'center' }]}>
              A sua conta oficial foi activada. Pode agora aceder com as mesmas credenciais no login principal.
            </Text>
            {Platform.OS === 'web' && !!modalSucesso.numeroMatricula && (
              <TouchableOpacity
                style={[modalStyles.btn, { backgroundColor: 'rgba(240,165,0,0.15)', borderWidth: 1, borderColor: 'rgba(240,165,0,0.4)', flexDirection: 'row', gap: 8, justifyContent: 'center' }]}
                onPress={() => handleImprimirBoletimMatricula(modalSucesso.numeroMatricula)}
              >
                <Ionicons name="print-outline" size={16} color={Colors.gold} />
                <Text style={[modalStyles.btnText, { color: Colors.gold }]}>Imprimir Boletim de Matrícula</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={[modalStyles.btn, { backgroundColor: Colors.success }]} onPress={() => { setModalSucesso({ visible: false, numeroMatricula: '' }); handleSair(); }}>
              <Text style={modalStyles.btnText}>Aceder à Conta Oficial</Text>
            </TouchableOpacity>
          </View>
        </View>
              </KeyboardAvoidingView>
</Modal>

      {/* Erro Modal */}
      <Modal visible={errorModal.visible} transparent animationType="fade" onRequestClose={() => setErrorModal({ visible: false, message: '' })}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={modalStyles.overlay}>
          <View style={modalStyles.container}>
            <Ionicons name="alert-circle-outline" size={40} color={Colors.danger} />
            <Text style={[modalStyles.title, { color: Colors.danger }]}>Erro</Text>
            <Text style={[modalStyles.info, { textAlign: 'center' }]}>{errorModal.message}</Text>
            <TouchableOpacity style={[modalStyles.btn, { backgroundColor: Colors.danger }]} onPress={() => setErrorModal({ visible: false, message: '' })}>
              <Text style={modalStyles.btnText}>Fechar</Text>
            </TouchableOpacity>
          </View>
        </View>
              </KeyboardAvoidingView>
</Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { paddingBottom: 16, alignItems: 'center' },
  headerInner: { maxWidth: 480, width: '100%', paddingHorizontal: 20, gap: 12 },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  headerGreeting: { fontSize: 20, fontFamily: 'Inter_700Bold', color: Colors.text },
  headerSubtitle: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 2 },
  sairBtn: { width: 36, height: 36, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.07)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.border },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, alignSelf: 'flex-start' },
  statusBadgeText: { fontSize: 13, fontFamily: 'Inter_700Bold' },
  timeline: { flexDirection: 'row', alignItems: 'flex-start', marginTop: 4 },

  scroll: { flex: 1 },
  scrollContent: { padding: 16, gap: 16, maxWidth: 480, width: '100%', alignSelf: 'center' },

  card: { backgroundColor: Colors.backgroundCard, borderRadius: 18, borderWidth: 1, borderColor: Colors.border, padding: 18, gap: 14 },
  cardSuccess: { borderColor: 'rgba(39,174,96,0.3)', backgroundColor: 'rgba(39,174,96,0.05)' },
  cardDanger: { borderColor: 'rgba(231,76,60,0.3)', backgroundColor: 'rgba(231,76,60,0.05)' },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  cardIcon: { width: 32, height: 32, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontSize: 15, fontFamily: 'Inter_700Bold', color: Colors.text, flex: 1 },
  cardDesc: { fontSize: 13, fontFamily: 'Inter_400Regular', color: Colors.textSecondary, lineHeight: 20 },
  refreshBtn: { width: 30, height: 30, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.06)', alignItems: 'center', justifyContent: 'center' },

  pendingBox: { flexDirection: 'row', gap: 10, alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 12, padding: 14 },
  pendingText: { fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textMuted, flex: 1, lineHeight: 18 },

  dataProvaBox: { flexDirection: 'row', gap: 14, alignItems: 'center', backgroundColor: 'rgba(240,165,0,0.08)', borderRadius: 12, padding: 16, borderWidth: 1, borderColor: 'rgba(240,165,0,0.2)' },
  dataProvaLabel: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted },
  dataProvaValue: { fontSize: 18, fontFamily: 'Inter_700Bold', color: Colors.gold, marginTop: 2 },

  rupeBox: { backgroundColor: 'rgba(240,165,0,0.08)', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: 'rgba(240,165,0,0.2)', gap: 4 },
  rupeLabel: { fontSize: 10, fontFamily: 'Inter_600SemiBold', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  rupeRef: { fontSize: 16, fontFamily: 'Inter_700Bold', color: Colors.gold, letterSpacing: 1 },
  rupeInfo: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted },

  actionBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#1A5276', borderRadius: 12, paddingVertical: 14 },
  actionBtnText: { fontSize: 14, fontFamily: 'Inter_700Bold', color: '#fff' },

  notaBox: { alignItems: 'center', paddingVertical: 12, gap: 4 },
  notaLabel: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 },
  notaValue: { fontSize: 36, fontFamily: 'Inter_700Bold', color: Colors.success },

  completarBtn: { borderRadius: 14, overflow: 'hidden' },
  completarBtnGrad: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 18, gap: 10 },
  completarBtnText: { fontSize: 16, fontFamily: 'Inter_700Bold', color: '#fff' },
  pagamentoAvisoBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: 'rgba(240,165,0,0.08)', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(240,165,0,0.25)', padding: 14 },
  pagamentoAvisoTitle: { fontSize: 13, fontFamily: 'Inter_700Bold', color: Colors.warning, marginBottom: 3 },
  pagamentoAvisoDesc: { fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textSecondary, lineHeight: 17 },

  infoRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' },
  infoRowIcon: { marginTop: 2 },
  infoRowLabel: { fontSize: 10, fontFamily: 'Inter_600SemiBold', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  infoRowValue: { fontSize: 14, fontFamily: 'Inter_400Regular', color: Colors.text, marginTop: 2 },

  boletimBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: 'rgba(240,165,0,0.08)', borderRadius: 12, paddingVertical: 13, paddingHorizontal: 14, borderWidth: 1, borderColor: 'rgba(240,165,0,0.25)', marginTop: 6 },
  boletimBtnText: { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: Colors.gold, flex: 1 },
});

const tlStyles = StyleSheet.create({
  step: { alignItems: 'center', gap: 4 },
  circle: { width: 22, height: 22, borderRadius: 11, backgroundColor: Colors.backgroundElevated, borderWidth: 2, borderColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  circleDone: { backgroundColor: Colors.success, borderColor: Colors.success },
  circleActive: { borderColor: Colors.gold, backgroundColor: 'rgba(240,165,0,0.15)' },
  num: { fontSize: 9, fontFamily: 'Inter_700Bold', color: Colors.textMuted },
  numActive: { color: Colors.gold },
  label: { fontSize: 7, fontFamily: 'Inter_400Regular', color: Colors.textMuted, textAlign: 'center' },
  labelActive: { color: Colors.text },
  connector: { flex: 1, height: 2, backgroundColor: 'rgba(255,255,255,0.1)', marginBottom: 18 },
  connectorDone: { backgroundColor: Colors.success },
});

const modalStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  container: { backgroundColor: '#0F1F40', borderRadius: 24, padding: 28, width: '100%', maxWidth: 380, alignItems: 'center', gap: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' },
  title: { fontSize: 20, fontFamily: 'Inter_700Bold', color: Colors.text, textAlign: 'center' },
  subtitle: { fontSize: 13, fontFamily: 'Inter_400Regular', color: Colors.textSecondary },
  refBox: { backgroundColor: 'rgba(240,165,0,0.1)', borderRadius: 12, paddingHorizontal: 20, paddingVertical: 14, borderWidth: 1, borderColor: 'rgba(240,165,0,0.3)', width: '100%', alignItems: 'center' },
  ref: { fontSize: 17, fontFamily: 'Inter_700Bold', color: Colors.gold, letterSpacing: 1, textAlign: 'center' },
  valor: { fontSize: 20, fontFamily: 'Inter_700Bold', color: Colors.text },
  validade: { fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textMuted },
  info: { fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textMuted, textAlign: 'center', lineHeight: 18 },
  btn: { backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 12, paddingVertical: 14, paddingHorizontal: 32, width: '100%', alignItems: 'center' },
  btnText: { fontSize: 14, fontFamily: 'Inter_700Bold', color: Colors.text },
});
