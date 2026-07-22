import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Image, Platform, Dimensions,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Colors } from '@/constants/colors';
import { useAuth } from '@/context/AuthContext';
import { useConfig } from '@/context/ConfigContext';
import { api } from '@/lib/api';
import TopBar from '@/components/TopBar';
import { router } from 'expo-router';

type Semaforo = 'verde' | 'amarelo' | 'vermelho';
const SEM: Record<Semaforo, { bg: string; chip: string; text: string; label: string; icon: any }> = {
  verde:    { bg: '#10B98122', chip: '#10B981', text: '#34D399', label: 'PROPINAS EM DIA', icon: 'checkmark-circle' },
  amarelo:  { bg: '#F59E0B22', chip: '#F59E0B', text: '#FBBF24', label: 'AVISO — VERIFICAR', icon: 'warning' },
  vermelho: { bg: '#EF444422', chip: '#EF4444', text: '#F87171', label: 'EM DÍVIDA — ENCAMINHAR À SECRETARIA', icon: 'alert-circle' },
};

const ROLE_COLORS: Record<string, string> = {
  professor: '#3B82F6', admin: '#8B5CF6', director: '#EF4444',
  secretaria: '#F59E0B', chefe_secretaria: '#D97706', financeiro: '#10B981',
  rh: '#EC4899', ceo: '#6366F1', pca: '#6366F1', pedagogico: '#14B8A6',
  subdiretor_administrativo: '#F97316',
};

interface ResultadoLeitura {
  ok: boolean;
  tipo?: 'aluno' | 'funcionario';
  leituraId?: string;
  aluno?: {
    id: string; nome: string; numeroMatricula: string; foto: string | null; genero: string | null; turma: string | null;
  };
  funcionario?: {
    id: string; nome: string; cargo: string; departamento: string; foto: string | null; role: string;
  };
  resultado?: Semaforo;
  motivo?: string;
  mesesAtraso?: number;
  valorDivida?: number;
  cartaoPago?: boolean;
  anoLetivo?: string;
  timestamp?: string;
  erro?: string;
  mensagem?: string;
}

interface Leitura {
  id: string;
  alunoNome: string;
  alunoApelido: string;
  numeroMatricula: string;
  resultado: Semaforo;
  motivo: string;
  tipoMovimento?: string;
  createdAt: string;
}

const PERFIS_PORTARIA = ['admin', 'director', 'secretaria', 'chefe_secretaria', 'ceo', 'pca',
  'professor', 'financeiro', 'rh', 'pedagogico', 'subdiretor_administrativo'];

export default function PortariaScreen() {
  const { user } = useAuth();
  const { config } = useConfig();
  const [resultado, setResultado] = useState<ResultadoLeitura | null>(null);
  const [loading, setLoading] = useState(false);
  const [tokenManual, setTokenManual] = useState('');
  const [recentes, setRecentes] = useState<Leitura[]>([]);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const videoRef = useRef<any>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectorRef = useRef<any>(null);
  const detectIntervalRef = useRef<any>(null);
  const lastTokenRef = useRef<string>('');
  const audioCtxRef = useRef<any>(null);

  const podeAceder = PERFIS_PORTARIA.includes(user?.role || '');

  function gerarPoster() {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const appUrl = window.location.origin;
    const validarUrl = `${appUrl}/portaria/auto`;
    const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=320x320&margin=10&data=${encodeURIComponent(validarUrl)}`;
    const nomeEscola = config.nomeEscola || 'Super Escola';
    const mesAtual = new Date().toLocaleDateString('pt-PT', { month: 'long', year: 'numeric' });
    const yr = new Date().getFullYear();
    const anoLetivo = `${yr}/${yr + 1}`;

    const html = `<!DOCTYPE html>
<html lang="pt">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Poster Portaria — ${nomeEscola}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800;900&display=swap');
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Inter',system-ui,sans-serif;background:#060E1A;color:#fff;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}
  .poster{
    width:100%;max-width:680px;background:linear-gradient(160deg,#0A1628 0%,#0D1F3C 60%,#091223 100%);
    border:2px solid #1F3A5F;border-radius:24px;overflow:hidden;
    box-shadow:0 32px 80px rgba(0,0,0,0.7);
    position:relative;
  }
  .gold-band{height:8px;background:linear-gradient(90deg,#B8860B,#FFD700,#B8860B)}
  .content{padding:40px 48px 36px}
  .school-row{display:flex;align-items:center;gap:16px;margin-bottom:32px}
  .shield{
    width:56px;height:56px;background:linear-gradient(135deg,#B8860B,#FFD700);
    border-radius:12px;display:flex;align-items:center;justify-content:center;
    font-size:28px;flex-shrink:0;
  }
  .school-info{}
  .school-name{font-size:22px;font-weight:900;color:#FFD700;letter-spacing:0.3px}
  .school-sub{font-size:12px;color:rgba(255,255,255,0.5);margin-top:2px}
  .divider{height:1px;background:linear-gradient(90deg,transparent,#1F3A5F,transparent);margin-bottom:32px}
  .main-title{text-align:center;font-size:13px;font-weight:700;letter-spacing:3px;color:rgba(255,255,255,0.45);text-transform:uppercase;margin-bottom:12px}
  .headline{text-align:center;font-size:32px;font-weight:900;color:#fff;line-height:1.15;margin-bottom:8px}
  .headline span{color:#FFD700}
  .tagline{text-align:center;font-size:14px;color:rgba(255,255,255,0.55);margin-bottom:36px}
  .qr-area{display:flex;flex-direction:column;align-items:center;gap:0;margin-bottom:36px}
  .qr-wrap{
    background:#fff;padding:16px;border-radius:16px;
    box-shadow:0 8px 32px rgba(0,0,0,0.4),0 0 0 4px rgba(255,215,0,0.25);
    position:relative;
  }
  .qr-wrap img{display:block;border-radius:4px}
  .qr-label{
    margin-top:14px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);
    border-radius:8px;padding:8px 18px;font-size:11px;color:rgba(255,255,255,0.5);
    font-family:monospace;word-break:break-all;max-width:360px;text-align:center;
  }
  .steps{display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;margin-bottom:32px}
  .step{background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:14px 12px;text-align:center}
  .step-num{width:32px;height:32px;background:linear-gradient(135deg,#B8860B,#FFD700);border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 8px;font-size:14px;font-weight:900;color:#060E1A}
  .step-title{font-size:11px;font-weight:700;color:#fff;margin-bottom:4px}
  .step-desc{font-size:10px;color:rgba(255,255,255,0.45);line-height:1.4}
  .legend{display:flex;gap:10px;justify-content:center;flex-wrap:wrap;margin-bottom:32px}
  .legend-item{display:flex;align-items:center;gap:6px;background:rgba(255,255,255,0.04);border-radius:20px;padding:6px 12px;border:1px solid rgba(255,255,255,0.08)}
  .dot{width:10px;height:10px;border-radius:50%;flex-shrink:0}
  .legend-text{font-size:11px;font-weight:600;color:rgba(255,255,255,0.7)}
  .footer-strip{
    background:rgba(0,0,0,0.3);border-top:1px solid rgba(255,255,255,0.06);
    padding:14px 48px;display:flex;justify-content:space-between;align-items:center;
  }
  .footer-left{font-size:10px;color:rgba(255,255,255,0.3)}
  .footer-right{font-size:10px;color:rgba(255,215,0,0.5);font-weight:700}
  @media print{
    body{background:#fff;padding:0}
    .poster{max-width:100%;border:none;border-radius:0;box-shadow:none}
  }
</style>
</head>
<body>
<div class="poster">
  <div class="gold-band"></div>
  <div class="content">
    <div class="school-row">
      <div class="shield">🏫</div>
      <div class="school-info">
        <div class="school-name">${nomeEscola}</div>
        <div class="school-sub">Sistema Integrado de Gestão Académica · Super Escola</div>
      </div>
    </div>
    <div class="divider"></div>
    <div class="main-title">Controlo de Acesso Digital</div>
    <div class="headline">Aponte a câmara<br/>para <span>verificar o acesso</span></div>
    <div class="tagline">O sistema confirma instantaneamente se as suas propinas estão em dia</div>
    <div class="qr-area">
      <div class="qr-wrap">
        <img src="${qrApiUrl}" width="220" height="220" alt="QR Code Portaria"/>
      </div>
      <div class="qr-label">${validarUrl}</div>
    </div>
    <div class="steps">
      <div class="step">
        <div class="step-num">1</div>
        <div class="step-title">Abra a câmara</div>
        <div class="step-desc">Use a câmara do seu telemóvel ou a app Super Escola</div>
      </div>
      <div class="step">
        <div class="step-num">2</div>
        <div class="step-title">Aponte para o QR</div>
        <div class="step-desc">O resultado aparece automaticamente no ecrã</div>
      </div>
      <div class="step">
        <div class="step-num">3</div>
        <div class="step-title">Veja o resultado</div>
        <div class="step-desc">Verde = pode entrar · Vermelho = dirija-se à secretaria</div>
      </div>
    </div>
    <div class="legend">
      <div class="legend-item"><div class="dot" style="background:#10B981"></div><span class="legend-text">Propinas em dia — Acesso Permitido</span></div>
      <div class="legend-item"><div class="dot" style="background:#F59E0B"></div><span class="legend-text">Aviso — Verificar na Secretaria</span></div>
      <div class="legend-item"><div class="dot" style="background:#EF4444"></div><span class="legend-text">Propinas em Atraso — Acesso Bloqueado</span></div>
    </div>
  </div>
  <div class="footer-strip">
    <div class="footer-left">Ano Lectivo ${anoLetivo} · ${mesAtual} · Gerado por ${user?.nome || user?.email || 'Admin'}</div>
    <div class="footer-right">Super Escola v3</div>
  </div>
</div>
<script>
  document.querySelector('img').onload = () => setTimeout(() => window.print(), 600);
</script>
</body>
</html>`;

    const w = window.open('', '_blank', 'width=760,height=900');
    if (w) {
      w.document.write(html);
      w.document.close();
    }
  }

  useEffect(() => {
    if (podeAceder) fetchRecentes();
    return () => stopCamera();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [podeAceder]);

  async function fetchRecentes() {
    try {
      const r = await api.get<{ leituras: Leitura[] }>('/api/cartao/leituras?limit=20');
      setRecentes(r.leituras || []);
    } catch {}
  }

  function bip(ok: boolean) {
    if (Platform.OS !== 'web') return;
    try {
      if (!audioCtxRef.current) audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      const ctx = audioCtxRef.current;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.frequency.value = ok ? 880 : 220;
      g.gain.value = 0.15;
      o.start();
      setTimeout(() => { o.stop(); }, ok ? 120 : 350);
    } catch {}
  }

  async function validarToken(token: string, origem = 'portaria_web') {
    if (!token || token === lastTokenRef.current) return;
    lastTokenRef.current = token;
    setLoading(true);
    try {
      const r = await api.post<ResultadoLeitura>('/api/cartao/validar', { token, origem });
      setResultado(r);
      if (r.ok) {
        bip(r.resultado === 'verde');
        fetchRecentes();
      } else {
        bip(false);
      }
    } catch (e: any) {
      setResultado({ ok: false, mensagem: e?.message || 'Erro a validar' });
      bip(false);
    } finally {
      setLoading(false);
      // Permite re-leitura do mesmo token após 3s
      setTimeout(() => { lastTokenRef.current = ''; }, 3000);
    }
  }

  async function startCamera() {
    if (Platform.OS !== 'web') {
      setScanError('A câmara só está disponível no navegador. No telemóvel, use a app.');
      return;
    }
    setScanError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' }, audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
      setScanning(true);

      // Tentar BarcodeDetector nativo
      if ('BarcodeDetector' in window) {
        try {
          detectorRef.current = new (window as any).BarcodeDetector({ formats: ['qr_code'] });
          detectIntervalRef.current = setInterval(detectFrame, 400);
          return;
        } catch {}
      }
      // Fallback: jsQR via canvas — vamos pedir ao utilizador para usar input manual
      setScanError('O navegador não suporta leitura automática de QR. Pode colar o token manualmente abaixo ou usar o Chrome/Edge.');
    } catch (e: any) {
      setScanError('Não foi possível aceder à câmara: ' + (e?.message || 'permissão negada'));
      setScanning(false);
    }
  }

  function stopCamera() {
    if (detectIntervalRef.current) { clearInterval(detectIntervalRef.current); detectIntervalRef.current = null; }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    setScanning(false);
  }

  async function detectFrame() {
    if (!detectorRef.current || !videoRef.current) return;
    try {
      const codes = await detectorRef.current.detect(videoRef.current);
      if (codes && codes.length > 0) {
        const raw = codes[0].rawValue;
        if (raw && raw.startsWith('SIGAC1.')) {
          validarToken(raw);
        }
      }
    } catch {}
  }

  if (!podeAceder) {
    return (
      <View style={styles.container}>
        <TopBar title="Portaria" />
        <View style={{ padding: 24, alignItems: 'center' }}>
          <Ionicons name="lock-closed" size={48} color={Colors.textMuted} />
          <Text style={{ color: Colors.text, fontSize: 16, marginTop: 12, fontWeight: '700' }}>Acesso restrito</Text>
          <Text style={{ color: Colors.textMuted, fontSize: 13, marginTop: 6, textAlign: 'center' }}>
            Apenas perfis de portaria/secretaria podem aceder a este ecrã.
          </Text>
          <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 16, padding: 10 }}>
            <Text style={{ color: Colors.gold }}>Voltar</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const semCor = resultado?.resultado ? SEM[resultado.resultado] : null;

  return (
    <View style={styles.container}>
      <TopBar title="Portaria — Validação de Cartão" />
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.maxW}>

          {/* ─── Poster de Controlo de Acesso ─── */}
          {Platform.OS === 'web' && (
            <View style={styles.posterCard}>
              <View style={styles.posterCardLeft}>
                <View style={styles.posterIconWrap}>
                  <Ionicons name="print" size={22} color="#FFD700" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.posterCardTitle}>Poster de Portaria (QR para a Parede)</Text>
                  <Text style={styles.posterCardDesc}>
                    Gere e imprima um poster A4 com QR code. Cole na entrada da escola — os alunos apontam a câmara para confirmar o acesso em tempo real.
                  </Text>
                </View>
              </View>
              <TouchableOpacity style={styles.posterBtn} onPress={gerarPoster} activeOpacity={0.85}>
                <Ionicons name="qr-code" size={15} color="#060E1A" />
                <Text style={styles.posterBtnText}>Gerar Poster</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* ─── Folha QR por Aluno ─── */}
          {Platform.OS === 'web' && (
            <View style={[styles.posterCard, { borderColor: 'rgba(34,197,94,0.25)' }]}>
              <View style={styles.posterCardLeft}>
                <View style={[styles.posterIconWrap, { backgroundColor: 'rgba(34,197,94,0.12)', borderColor: 'rgba(34,197,94,0.3)' }]}>
                  <Ionicons name="people" size={22} color="#22C55E" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.posterCardTitle, { color: '#22C55E' }]}>Folha QR por Aluno (Controlo de Entrada)</Text>
                  <Text style={styles.posterCardDesc}>
                    Imprime uma folha A4 com o QR code individual de cada aluno para uso na portaria — substitui o telemóvel quando necessário.
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                style={[styles.posterBtn, { backgroundColor: '#22C55E' }]}
                onPress={() => {
                  if (typeof window !== 'undefined') {
                    window.open('/api/portaria/folha-qr-alunos', '_blank');
                  }
                }}
                activeOpacity={0.85}
              >
                <Ionicons name="print" size={15} color="#060E1A" />
                <Text style={styles.posterBtnText}>Imprimir Folha QR</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Câmara */}
          <View style={styles.cameraCard}>
            <View style={styles.cameraHeader}>
              <Ionicons name="qr-code" size={18} color={Colors.gold} />
              <Text style={styles.cameraTitle}>Leitor de QR Code</Text>
              <View style={{ flex: 1 }} />
              {scanning ? (
                <TouchableOpacity onPress={stopCamera} style={styles.btnStop}>
                  <Ionicons name="stop-circle" size={14} color="#EF4444" />
                  <Text style={styles.btnStopText}>Parar</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity onPress={startCamera} style={styles.btnStart}>
                  <Ionicons name="videocam" size={14} color="#34D399" />
                  <Text style={styles.btnStartText}>Iniciar Câmara</Text>
                </TouchableOpacity>
              )}
            </View>

            <View style={styles.cameraView}>
              {Platform.OS === 'web' ? (
                <View style={{ width: '100%', aspectRatio: 16 / 10, backgroundColor: '#000', borderRadius: 8, overflow: 'hidden' as any, position: 'relative' as any }}>
                  {/* @ts-ignore */}
                  <video ref={videoRef} playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  {scanning && (
                    <View style={[styles.viewfinder, { pointerEvents: 'none' }]}>
                      <View style={[styles.corner, { top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3 }]} />
                      <View style={[styles.corner, { top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3 }]} />
                      <View style={[styles.corner, { bottom: 0, left: 0, borderBottomWidth: 3, borderLeftWidth: 3 }]} />
                      <View style={[styles.corner, { bottom: 0, right: 0, borderBottomWidth: 3, borderRightWidth: 3 }]} />
                    </View>
                  )}
                  {!scanning && (
                    <View style={styles.cameraEmpty}>
                      <Ionicons name="camera-outline" size={48} color="rgba(255,255,255,0.4)" />
                      <Text style={{ color: 'rgba(255,255,255,0.6)', marginTop: 6, fontSize: 12 }}>Carregue em "Iniciar Câmara"</Text>
                    </View>
                  )}
                </View>
              ) : (
                <View style={{ padding: 24, alignItems: 'center' }}>
                  <Ionicons name="phone-portrait" size={36} color={Colors.textMuted} />
                  <Text style={{ color: Colors.textMuted, marginTop: 8, fontSize: 12 }}>
                    Use a versão web no portátil da portaria
                  </Text>
                </View>
              )}
            </View>

            {scanError && (
              <View style={styles.errBox}>
                <Ionicons name="information-circle" size={14} color="#FBBF24" />
                <Text style={styles.errText}>{scanError}</Text>
              </View>
            )}

            {/* Token manual (fallback) */}
            <View style={styles.manualRow}>
              <TextInput
                value={tokenManual}
                onChangeText={setTokenManual}
                placeholder="Cole aqui o token (SIGAC1...)"
                placeholderTextColor={Colors.textMuted}
                style={styles.manualInput}
                autoCapitalize="none"
              />
              <TouchableOpacity
                style={styles.manualBtn}
                onPress={() => { if (tokenManual.trim()) { validarToken(tokenManual.trim(), 'manual'); setTokenManual(''); } }}
                disabled={loading || !tokenManual.trim()}
              >
                <Text style={styles.manualBtnText}>{loading ? '…' : 'Validar'}</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Resultado da última leitura — destaque grande */}
          {resultado && (
            <View style={[
              styles.resCard,
              !resultado.ok && { borderColor: '#EF4444', backgroundColor: '#EF444411' },
              resultado.ok && resultado.tipo === 'funcionario' && { borderColor: '#10B981', backgroundColor: '#10B98111' },
              resultado.ok && resultado.tipo === 'aluno' && semCor && { borderColor: semCor.chip, backgroundColor: semCor.bg },
            ]}>
              {!resultado.ok ? (
                <View style={{ alignItems: 'center', padding: 24 }}>
                  <Ionicons name="close-circle" size={64} color="#EF4444" />
                  <Text style={styles.resErrTitle}>QR INVÁLIDO</Text>
                  <Text style={styles.resErrMsg}>{resultado.mensagem}</Text>
                </View>
              ) : resultado.tipo === 'funcionario' && resultado.funcionario ? (
                // ── Resultado de FUNCIONÁRIO ──────────────────────────────
                <>
                  <View style={[styles.resBanner, { backgroundColor: ROLE_COLORS[resultado.funcionario.role] || '#10B981' }]}>
                    <Ionicons name="shield-checkmark" size={22} color="#fff" />
                    <Text style={styles.resBannerText}>FUNCIONÁRIO DA INSTITUIÇÃO — ACESSO AUTORIZADO</Text>
                  </View>
                  <View style={styles.resBody}>
                    {resultado.funcionario.foto ? (
                      <Image source={{ uri: resultado.funcionario.foto }} style={styles.resFoto} />
                    ) : (
                      <View style={[styles.resFotoPlc, { backgroundColor: (ROLE_COLORS[resultado.funcionario.role] || '#10B981') + '33' }]}>
                        <Text style={[styles.resFotoIni, { color: ROLE_COLORS[resultado.funcionario.role] || '#10B981' }]}>
                          {resultado.funcionario.nome.split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase()}
                        </Text>
                      </View>
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={styles.resNome}>{resultado.funcionario.nome}</Text>
                      <Text style={styles.resInfo}>{resultado.funcionario.cargo}</Text>
                      <Text style={styles.resInfo}>{resultado.funcionario.departamento}</Text>
                      <View style={[styles.resMotivo, { backgroundColor: '#10B98122', borderColor: '#10B981', flexDirection: 'row', alignItems: 'center' }]}>
                        <Ionicons name="checkmark-circle" size={13} color="#34D399" style={{ marginRight: 4 }} />
                        <Text style={[styles.resMotivoText, { color: '#34D399' }]}>Cartão de Funcionário Válido</Text>
                      </View>
                      {resultado.timestamp && (
                        <Text style={styles.resTime}>
                          Lido às {new Date(resultado.timestamp).toLocaleTimeString('pt-PT')}
                        </Text>
                      )}
                    </View>
                  </View>
                </>
              ) : (
                // ── Resultado de ALUNO ────────────────────────────────────
                <>
                  <View style={[styles.resBanner, { backgroundColor: semCor!.chip }]}>
                    <Ionicons name={semCor!.icon} size={22} color="#fff" />
                    <Text style={styles.resBannerText}>{semCor!.label}</Text>
                  </View>

                  <View style={styles.resBody}>
                    {resultado.aluno?.foto ? (
                      <Image source={{ uri: resultado.aluno.foto }} style={styles.resFoto} />
                    ) : (
                      <View style={styles.resFotoPlc}>
                        <Text style={styles.resFotoIni}>
                          {resultado.aluno?.nome.split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase()}
                        </Text>
                      </View>
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={styles.resNome}>{resultado.aluno?.nome}</Text>
                      <Text style={styles.resInfo}>Matrícula: {resultado.aluno?.numeroMatricula}</Text>
                      {resultado.aluno?.turma && <Text style={styles.resInfo}>{resultado.aluno.turma}</Text>}
                      <View style={[styles.resMotivo, { backgroundColor: semCor!.chip + '22', borderColor: semCor!.chip }]}>
                        <Text style={[styles.resMotivoText, { color: semCor!.text }]}>{resultado.motivo}</Text>
                      </View>
                      {resultado.timestamp && (
                        <Text style={styles.resTime}>
                          Lido às {new Date(resultado.timestamp).toLocaleTimeString('pt-PT')}
                        </Text>
                      )}
                    </View>
                  </View>
                </>
              )}
            </View>
          )}

          {/* Histórico */}
          <View style={styles.histCard}>
            <View style={styles.histHeader}>
              <MaterialCommunityIcons name="history" size={16} color={Colors.gold} />
              <Text style={styles.histTitle}>Últimas Validações</Text>
              <View style={{ flex: 1 }} />
              <TouchableOpacity onPress={fetchRecentes}>
                <Ionicons name="refresh" size={14} color={Colors.textMuted} />
              </TouchableOpacity>
            </View>
            {recentes.length === 0 ? (
              <Text style={styles.histEmpty}>Sem leituras recentes.</Text>
            ) : (
              recentes.map(r => {
                const c = SEM[r.resultado];
                return (
                  <View key={r.id} style={styles.histRow}>
                    <View style={[styles.histDot, { backgroundColor: c.chip }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.histAluno}>{r.alunoNome} {r.alunoApelido}</Text>
                      <Text style={styles.histInfo}>{r.numeroMatricula} · {r.motivo}</Text>
                    </View>
                    {r.tipoMovimento && r.tipoMovimento !== 'bloqueado' && (
                      <View style={{
                        backgroundColor: r.tipoMovimento === 'entrada' ? 'rgba(16,185,129,0.15)' : 'rgba(59,130,246,0.15)',
                        borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2,
                        borderWidth: 1, borderColor: r.tipoMovimento === 'entrada' ? '#10B981' : '#3B82F6',
                        marginRight: 4,
                      }}>
                        <Text style={{ color: r.tipoMovimento === 'entrada' ? '#34D399' : '#60A5FA', fontSize: 9, fontWeight: '800' }}>
                          {r.tipoMovimento === 'entrada' ? 'ENTRADA' : 'SAÍDA'}
                        </Text>
                      </View>
                    )}
                    <Text style={styles.histTime}>
                      {new Date(r.createdAt).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                  </View>
                );
              })
            )}
          </View>

        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  scroll: { padding: 16, alignItems: 'center' },
  maxW: { width: '100%', maxWidth: 880, gap: 14 },

  posterCard: {
    backgroundColor: '#0A1628', borderRadius: 14, borderWidth: 1.5, borderColor: '#FFD70033',
    padding: 14, gap: 10,
  },
  posterCardLeft: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, flex: 1 },
  posterIconWrap: {
    width: 44, height: 44, borderRadius: 10, backgroundColor: '#FFD70022',
    borderWidth: 1, borderColor: '#FFD70044', alignItems: 'center', justifyContent: 'center',
  },
  posterCardTitle: { color: '#FFD700', fontSize: 13, fontWeight: '800', marginBottom: 4 },
  posterCardDesc: { color: 'rgba(255,255,255,0.55)', fontSize: 11, lineHeight: 16 },
  posterBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: '#FFD700', paddingHorizontal: 16, paddingVertical: 10,
    borderRadius: 8, alignSelf: 'flex-start',
  },
  posterBtnText: { color: '#060E1A', fontSize: 12, fontWeight: '900' },

  cameraCard: { backgroundColor: '#0F1A2E', borderRadius: 12, borderWidth: 1, borderColor: '#1F2D45', padding: 12 },
  cameraHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  cameraTitle: { color: Colors.gold, fontSize: 13, fontWeight: '700' },
  btnStart: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: '#10B98122', borderWidth: 1, borderColor: '#10B981', borderRadius: 7 },
  btnStartText: { color: '#34D399', fontSize: 11, fontWeight: '700' },
  btnStop: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: '#EF444422', borderWidth: 1, borderColor: '#EF4444', borderRadius: 7 },
  btnStopText: { color: '#F87171', fontSize: 11, fontWeight: '700' },
  cameraView: { borderRadius: 8, overflow: 'hidden' },
  cameraEmpty: { position: 'absolute' as any, top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  viewfinder: { position: 'absolute' as any, top: '15%', left: '15%', right: '15%', bottom: '15%' },
  corner: { position: 'absolute' as any, width: 28, height: 28, borderColor: '#34D399' },

  errBox: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10, padding: 8, backgroundColor: '#F59E0B22', borderRadius: 6, borderWidth: 1, borderColor: '#F59E0B' },
  errText: { color: '#FBBF24', fontSize: 11, flex: 1 },

  manualRow: { flexDirection: 'row', gap: 6, marginTop: 10 },
  manualInput: { flex: 1, backgroundColor: '#1A2438', borderRadius: 7, paddingHorizontal: 10, paddingVertical: 8, color: '#fff', fontSize: 12, borderWidth: 1, borderColor: '#1F2D45' },
  manualBtn: { backgroundColor: Colors.gold, paddingHorizontal: 14, justifyContent: 'center', borderRadius: 7 },
  manualBtnText: { color: '#0A1628', fontWeight: '800', fontSize: 12 },

  resCard: { borderRadius: 12, borderWidth: 2, overflow: 'hidden' },
  resBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, padding: 14 },
  resBannerText: { color: '#fff', fontSize: 15, fontWeight: '900', letterSpacing: 0.8 },
  resBody: { flexDirection: 'row', gap: 14, padding: 16 },
  resFoto: { width: 90, height: 110, borderRadius: 10, borderWidth: 2, borderColor: Colors.gold },
  resFotoPlc: { width: 90, height: 110, borderRadius: 10, borderWidth: 2, borderColor: Colors.gold, backgroundColor: '#1A2438', alignItems: 'center', justifyContent: 'center' },
  resFotoIni: { color: Colors.gold, fontSize: 28, fontWeight: '800' },
  resNome: { color: '#fff', fontSize: 18, fontWeight: '800' },
  resInfo: { color: Colors.textMuted, fontSize: 12, marginTop: 2 },
  resMotivo: { marginTop: 8, padding: 8, borderRadius: 6, borderWidth: 1 },
  resMotivoText: { fontSize: 12, fontWeight: '700' },
  resTime: { color: Colors.textMuted, fontSize: 10, marginTop: 6, fontStyle: 'italic' },
  resErrTitle: { color: '#EF4444', fontSize: 18, fontWeight: '900', marginTop: 8 },
  resErrMsg: { color: Colors.textSecondary, fontSize: 12, textAlign: 'center', marginTop: 6 },

  histCard: { backgroundColor: '#0F1A2E', borderRadius: 10, borderWidth: 1, borderColor: '#1F2D45', padding: 12 },
  histHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  histTitle: { color: Colors.gold, fontSize: 12, fontWeight: '700' },
  histEmpty: { color: Colors.textMuted, fontSize: 11, fontStyle: 'italic', textAlign: 'center', paddingVertical: 12 },
  histRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 7, borderTopWidth: 1, borderTopColor: '#1F2D4555' },
  histDot: { width: 8, height: 8, borderRadius: 4 },
  histAluno: { color: '#fff', fontSize: 12, fontWeight: '600' },
  histInfo: { color: Colors.textMuted, fontSize: 10, marginTop: 1 },
  histTime: { color: Colors.textMuted, fontSize: 10 },
});
