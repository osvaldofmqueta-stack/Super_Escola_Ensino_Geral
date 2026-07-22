import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Image,
  ActivityIndicator, Platform, Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useConfig } from '@/context/ConfigContext';

type Semaforo = 'verde' | 'amarelo' | 'vermelho';

const SEM: Record<Semaforo, { bg: string; border: string; icon: any; iconColor: string; label: string; sublabel: string; textColor: string }> = {
  verde: {
    bg: '#040F04', border: '#10B981', icon: 'checkmark-circle', iconColor: '#10B981',
    label: 'ACESSO PERMITIDO', sublabel: 'Propinas em dia — Bem-vindo(a)!', textColor: '#34D399',
  },
  amarelo: {
    bg: '#0D0A00', border: '#F59E0B', icon: 'warning', iconColor: '#F59E0B',
    label: 'ATENÇÃO', sublabel: 'Verificar na secretaria', textColor: '#FBBF24',
  },
  vermelho: {
    bg: '#100404', border: '#EF4444', icon: 'ban', iconColor: '#EF4444',
    label: 'ACESSO BLOQUEADO', sublabel: 'Dirija-se à secretaria para regularizar', textColor: '#F87171',
  },
};

type Estado = 'idle' | 'scanning' | 'loading' | 'result' | 'error' | 'no_camera';

interface KioskResult {
  ok: boolean;
  inadimplente?: boolean;
  bloqueadoReentrada?: boolean;
  tipoMovimento?: 'entrada' | 'saida' | 'bloqueado';
  tipo?: 'aluno' | 'funcionario';
  resultado?: Semaforo;
  motivo?: string;
  mesesAtraso?: number;
  valorDivida?: number;
  anoLetivo?: string;
  aluno?: { nome: string; numeroMatricula: string; foto: string | null; genero: string | null; turma: string | null };
  funcionario?: { nome: string; cargo: string; departamento: string; foto: string | null; role: string };
  mensagem?: string;
  timestamp?: string;
}

const RESET_DELAY_MS = 6000;

function getApiBase(): string {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return window.location.origin;
  }
  return '';
}

function bip(ok: boolean) {
  if (Platform.OS !== 'web') return;
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.frequency.value = ok ? 880 : 220;
    g.gain.value = 0.12;
    o.start();
    setTimeout(() => { try { o.stop(); ctx.close(); } catch {} }, ok ? 130 : 400);
  } catch {}
}

export default function KioskPortariaScreen() {
  const { config } = useConfig();
  const [estado, setEstado] = useState<Estado>('idle');
  const [resultado, setResultado] = useState<KioskResult | null>(null);
  const [erroMsg, setErroMsg] = useState('');
  const [countdown, setCountdown] = useState(0);

  const videoRef = useRef<any>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectorRef = useRef<any>(null);
  const detectIntervalRef = useRef<any>(null);
  const lastTokenRef = useRef('');
  const resetTimerRef = useRef<any>(null);
  const countdownRef = useRef<any>(null);

  const screenW = Dimensions.get('window').width;
  const screenH = Dimensions.get('window').height;

  useEffect(() => {
    if (Platform.OS === 'web') {
      startCamera();
    } else {
      setEstado('no_camera');
    }
    return cleanup;
  }, []);

  function cleanup() {
    stopCamera();
    if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    if (countdownRef.current) clearInterval(countdownRef.current);
  }

  async function startCamera() {
    try {
      if (typeof (window as any).BarcodeDetector === 'undefined') {
        setEstado('no_camera');
        setErroMsg('Este navegador não suporta leitura de QR. Use Chrome 83+ ou Edge.');
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(() => {});
      }
      detectorRef.current = new (window as any).BarcodeDetector({ formats: ['qr_code'] });
      setEstado('scanning');
      detectIntervalRef.current = setInterval(detectFrame, 300);
    } catch (e: any) {
      if (e?.name === 'NotAllowedError') {
        setEstado('no_camera');
        setErroMsg('Permissão de câmara negada. Clique em "Permitir câmara" no navegador.');
      } else {
        setEstado('no_camera');
        setErroMsg('Câmara não disponível: ' + (e?.message || String(e)));
      }
    }
  }

  function stopCamera() {
    if (detectIntervalRef.current) { clearInterval(detectIntervalRef.current); detectIntervalRef.current = null; }
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
    if (videoRef.current) { try { videoRef.current.srcObject = null; } catch {} }
  }

  async function detectFrame() {
    if (!videoRef.current || !detectorRef.current) return;
    if (videoRef.current.readyState < 2) return;
    try {
      const codes = await detectorRef.current.detect(videoRef.current);
      if (codes?.length > 0) {
        const raw = codes[0].rawValue;
        if (raw && raw !== lastTokenRef.current) {
          await handleToken(raw);
        }
      }
    } catch {}
  }

  async function handleToken(token: string) {
    if (token === lastTokenRef.current) return;
    lastTokenRef.current = token;
    setEstado('loading');
    stopDetection();

    try {
      const res = await fetch(`${getApiBase()}/api/portaria/kiosk-validar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const data: KioskResult = await res.json();
      setResultado(data);
      setEstado('result');
      const isGood = data.ok && (data.resultado === 'verde' || data.tipo === 'funcionario');
      bip(isGood);
      scheduleReset();
    } catch (e: any) {
      setErroMsg('Erro de rede: ' + (e?.message || 'tente novamente'));
      bip(false);
      setEstado('error');
      scheduleReset();
    }
  }

  function stopDetection() {
    if (detectIntervalRef.current) { clearInterval(detectIntervalRef.current); detectIntervalRef.current = null; }
  }

  function scheduleReset() {
    if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    if (countdownRef.current) clearInterval(countdownRef.current);

    const secs = Math.ceil(RESET_DELAY_MS / 1000);
    setCountdown(secs);
    countdownRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) { clearInterval(countdownRef.current); return 0; }
        return prev - 1;
      });
    }, 1000);

    resetTimerRef.current = setTimeout(() => {
      lastTokenRef.current = '';
      setResultado(null);
      setErroMsg('');
      setEstado('scanning');
      detectIntervalRef.current = setInterval(detectFrame, 300);
    }, RESET_DELAY_MS);
  }

  function handleReset() {
    if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    if (countdownRef.current) clearInterval(countdownRef.current);
    lastTokenRef.current = '';
    setResultado(null);
    setErroMsg('');
    setEstado('scanning');
    detectIntervalRef.current = setInterval(detectFrame, 300);
  }

  const nomeEscola = config?.nomeEscola || 'Super Escola';
  const hora = new Date().toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });

  const bgColor = estado === 'result' && resultado
    ? resultado.inadimplente
      ? '#120000'
      : resultado.ok
        ? (resultado.tipo === 'funcionario' ? '#030D1A' : SEM[resultado.resultado!]?.bg || '#060E1A')
        : '#060E1A'
    : '#060E1A';

  const borderColor = estado === 'result' && resultado
    ? resultado.inadimplente
      ? '#EF4444'
      : resultado.ok
        ? (resultado.tipo === 'funcionario' ? '#3B82F6' : SEM[resultado.resultado!]?.border || 'transparent')
        : 'transparent'
    : 'transparent';

  return (
    <View style={[s.root, { backgroundColor: bgColor }]}>
      {/* Top accent border */}
      {estado === 'result' && resultado && (resultado.ok || resultado.inadimplente) && (
        <View style={[s.topBand, { backgroundColor: borderColor }]} />
      )}

      {/* Header */}
      <View style={s.header}>
        <View style={s.shield}>
          <Ionicons name="shield-checkmark" size={20} color="#D4AF37" />
        </View>
        <Text style={s.schoolName}>{nomeEscola}</Text>
        <View style={s.headerRight}>
          <Text style={s.clockText}>{hora}</Text>
          <View style={[s.liveDot, estado === 'scanning' ? s.liveDotActive : {}]} />
        </View>
      </View>

      {/* Camera (always behind, hidden when result) */}
      {Platform.OS === 'web' && (
        <video
          ref={videoRef}
          style={{
            position: 'absolute',
            top: 0, left: 0, right: 0, bottom: 0,
            width: '100%', height: '100%',
            objectFit: 'cover',
            opacity: estado === 'scanning' ? 0.35 : 0,
            transition: 'opacity 0.4s ease',
            zIndex: 0,
          } as any}
          muted
          playsInline
          autoPlay
        />
      )}

      {/* IDLE / SCANNING state */}
      {(estado === 'idle' || estado === 'scanning') && (
        <View style={[s.content, { zIndex: 1 }]}>
          <View style={s.scanArea}>
            <View style={s.scanFrame}>
              <View style={[s.corner, s.cornerTL]} />
              <View style={[s.corner, s.cornerTR]} />
              <View style={[s.corner, s.cornerBL]} />
              <View style={[s.corner, s.cornerBR]} />
              <Ionicons name="qr-code-outline" size={64} color="rgba(212,175,55,0.5)" style={{ alignSelf: 'center' }} />
            </View>
            <Text style={s.scanLabel}>Apresente o QR Code</Text>
            <Text style={s.scanSub}>O cartão digital do aluno ou funcionário</Text>
          </View>
        </View>
      )}

      {/* LOADING state */}
      {estado === 'loading' && (
        <View style={[s.content, { zIndex: 1 }]}>
          <ActivityIndicator size="large" color="#D4AF37" />
          <Text style={s.loadingText}>A verificar…</Text>
        </View>
      )}

      {/* ERROR state */}
      {estado === 'error' && (
        <View style={[s.content, { zIndex: 1 }]}>
          <Ionicons name="alert-circle" size={80} color="#EF4444" />
          <Text style={s.errorTitle}>Erro de leitura</Text>
          <Text style={s.errorSub}>{erroMsg}</Text>
          <View style={s.countdownRow}>
            <Text style={s.countdownText}>Próxima leitura em {countdown}s</Text>
            <TouchableOpacity style={s.resetBtn} onPress={handleReset} activeOpacity={0.8}>
              <Ionicons name="refresh" size={16} color="#fff" />
              <Text style={s.resetBtnText}>Reiniciar já</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* NO CAMERA state */}
      {estado === 'no_camera' && (
        <View style={[s.content, { zIndex: 1 }]}>
          <Ionicons name="videocam-off" size={72} color="rgba(255,255,255,0.3)" />
          <Text style={s.errorTitle}>Câmara indisponível</Text>
          <Text style={s.errorSub}>{erroMsg || 'Não foi possível aceder à câmara.'}</Text>
          <TouchableOpacity style={s.resetBtn} onPress={startCamera} activeOpacity={0.8}>
            <Ionicons name="refresh" size={16} color="#fff" />
            <Text style={s.resetBtnText}>Tentar novamente</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* RESULT state */}
      {estado === 'result' && resultado && (
        <View style={[s.content, { zIndex: 1 }]}>
          {resultado.bloqueadoReentrada ? (
            <BloqueadoReentradaResult r={resultado} countdown={countdown} onReset={handleReset} />
          ) : resultado.inadimplente ? (
            <InadimplenteResult r={resultado} countdown={countdown} onReset={handleReset} />
          ) : resultado.ok ? (
            resultado.tipo === 'funcionario' ? (
              <FuncionarioResult r={resultado} borderColor="#3B82F6" countdown={countdown} onReset={handleReset} />
            ) : (
              <AlunoResult r={resultado} countdown={countdown} onReset={handleReset} />
            )
          ) : (
            <View style={s.errorCard}>
              <Ionicons name="warning" size={72} color="#F59E0B" />
              <Text style={[s.errorTitle, { color: '#FBBF24' }]}>QR Inválido</Text>
              <Text style={s.errorSub}>{resultado.mensagem || 'Token inválido ou expirado.'}</Text>
              <View style={s.countdownRow}>
                <Text style={s.countdownText}>Próxima leitura em {countdown}s</Text>
                <TouchableOpacity style={s.resetBtn} onPress={handleReset} activeOpacity={0.8}>
                  <Ionicons name="refresh" size={16} color="#fff" />
                  <Text style={s.resetBtnText}>Reiniciar já</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      )}

      {/* Footer */}
      <View style={s.footer}>
        <Text style={s.footerText}>Kiosk de Portaria · Super Escola v3</Text>
      </View>
    </View>
  );
}

function BloqueadoReentradaResult({ r, countdown, onReset }: { r: KioskResult; countdown: number; onReset: () => void }) {
  const hora = new Date(r.timestamp || Date.now()).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const dia = new Date(r.timestamp || Date.now()).toLocaleDateString('pt-PT', { day: '2-digit', month: 'long', year: 'numeric' });
  const iniciais = (r.aluno?.nome || '?').split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase();

  return (
    <View style={s.resultCard}>
      <View style={{
        width: 100, height: 100, borderRadius: 50,
        backgroundColor: 'rgba(249,115,22,0.15)', borderWidth: 2, borderColor: '#F97316',
        alignItems: 'center', justifyContent: 'center', marginBottom: 8,
      }}>
        <Ionicons name="time" size={56} color="#F97316" />
      </View>
      <Text style={[s.semLabel, { color: '#FB923C', fontSize: 24 }]}>RE-ENTRADA BLOQUEADA</Text>
      <View style={{
        flexDirection: 'row', alignItems: 'center', gap: 6,
        backgroundColor: 'rgba(249,115,22,0.15)', borderRadius: 20,
        paddingHorizontal: 14, paddingVertical: 5,
        borderWidth: 1, borderColor: 'rgba(249,115,22,0.4)', marginTop: 4,
      }}>
        <Ionicons name="lock-closed" size={13} color="#F97316" />
        <Text style={{ color: '#F97316', fontSize: 12, fontWeight: '800', letterSpacing: 0.5 }}>
          JÁ ENTROU E SAIU HOJE
        </Text>
      </View>
      {r.aluno && (
        <View style={[s.personCard, { borderColor: '#F97316', marginTop: 10 }]}>
          {r.aluno.foto ? (
            <Image source={{ uri: r.aluno.foto }} style={[s.foto, { opacity: 0.8 }]} />
          ) : (
            <View style={[s.fotoPlc, { borderColor: '#F97316', backgroundColor: '#1C0D00' }]}>
              <Text style={[s.fotoIni, { color: '#F97316' }]}>{iniciais}</Text>
            </View>
          )}
          <View style={s.personInfo}>
            <Text style={s.personName} numberOfLines={2}>{r.aluno.nome || '—'}</Text>
            <Text style={s.personSub}>{r.aluno.numeroMatricula || ''}</Text>
          </View>
        </View>
      )}
      <View style={{
        width: '100%', borderRadius: 10, borderWidth: 1,
        borderColor: 'rgba(249,115,22,0.4)', backgroundColor: 'rgba(249,115,22,0.08)',
        padding: 12, alignItems: 'center', gap: 4, marginTop: 8,
      }}>
        <Text style={{ color: '#FB923C', fontSize: 13, fontWeight: '700', textAlign: 'center' }}>
          Este QR Code já foi utilizado hoje
        </Text>
        <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, textAlign: 'center' }}>
          Por segurança, não é permitido re-entrar no mesmo dia
        </Text>
      </View>
      <Text style={s.timestamp}>{hora} · {dia}</Text>
      <View style={s.countdownRow}>
        <Text style={s.countdownText}>Próxima leitura em {countdown}s</Text>
        <TouchableOpacity style={s.resetBtn} onPress={onReset} activeOpacity={0.8}>
          <Ionicons name="refresh" size={16} color="#fff" />
          <Text style={s.resetBtnText}>Reiniciar já</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function InadimplenteResult({ r, countdown, onReset }: { r: KioskResult; countdown: number; onReset: () => void }) {
  const hora = new Date(r.timestamp || Date.now()).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const dia = new Date(r.timestamp || Date.now()).toLocaleDateString('pt-PT', { day: '2-digit', month: 'long', year: 'numeric' });
  const iniciais = (r.aluno?.nome || '?').split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase();

  return (
    <View style={s.resultCard}>
      {/* Ícone de bloqueio em destaque */}
      <View style={{
        width: 100, height: 100, borderRadius: 50,
        backgroundColor: 'rgba(239,68,68,0.15)',
        borderWidth: 2, borderColor: '#EF4444',
        alignItems: 'center', justifyContent: 'center',
        marginBottom: 8,
      }}>
        <Ionicons name="ban" size={60} color="#EF4444" />
      </View>

      <Text style={[s.semLabel, { color: '#F87171', fontSize: 30 }]}>ACESSO BLOQUEADO</Text>
      <View style={{
        flexDirection: 'row', alignItems: 'center', gap: 6,
        backgroundColor: 'rgba(239,68,68,0.18)', borderRadius: 20,
        paddingHorizontal: 16, paddingVertical: 6,
        borderWidth: 1, borderColor: 'rgba(239,68,68,0.4)',
        marginTop: 4,
      }}>
        <Ionicons name="alert-circle" size={15} color="#EF4444" />
        <Text style={{ color: '#F87171', fontSize: 13, fontWeight: '800', letterSpacing: 0.5 }}>
          INADIMPLENTE
        </Text>
      </View>

      {/* Dados do aluno */}
      <View style={[s.personCard, { borderColor: '#EF4444', marginTop: 8 }]}>
        {r.aluno?.foto ? (
          <Image source={{ uri: r.aluno.foto }} style={[s.foto, { opacity: 0.7 }]} />
        ) : (
          <View style={[s.fotoPlc, { borderColor: '#EF4444', backgroundColor: '#1A0808' }]}>
            <Text style={[s.fotoIni, { color: '#F87171' }]}>{iniciais}</Text>
          </View>
        )}
        <View style={s.personInfo}>
          <Text style={s.personName} numberOfLines={2}>{r.aluno?.nome || '—'}</Text>
          <Text style={s.personSub}>{r.aluno?.numeroMatricula || ''}</Text>
          {r.aluno?.turma && <Text style={s.personSub2}>{r.aluno.turma}</Text>}
          <Text style={s.personSub2}>Ano {r.anoLetivo}</Text>
        </View>
      </View>

      {/* Motivo / dívida */}
      <View style={{
        width: '100%', borderRadius: 10, borderWidth: 1,
        borderColor: 'rgba(239,68,68,0.4)', backgroundColor: 'rgba(239,68,68,0.08)',
        padding: 14, alignItems: 'center', gap: 6,
      }}>
        <Text style={{ color: '#F87171', fontSize: 14, fontWeight: '700', textAlign: 'center' }}>
          {r.motivo || `${r.mesesAtraso} mês(es) em atraso`}
        </Text>
        <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, textAlign: 'center' }}>
          Dirija-se à secretaria para regularizar a situação
        </Text>
      </View>

      <Text style={s.timestamp}>{hora} · {dia}</Text>

      <View style={s.countdownRow}>
        <Text style={s.countdownText}>Próxima leitura em {countdown}s</Text>
        <TouchableOpacity style={s.resetBtn} onPress={onReset} activeOpacity={0.8}>
          <Ionicons name="refresh" size={16} color="#fff" />
          <Text style={s.resetBtnText}>Reiniciar já</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function AlunoResult({ r, countdown, onReset }: { r: KioskResult; countdown: number; onReset: () => void }) {
  const sem = r.resultado ? SEM[r.resultado] : SEM.vermelho;
  const hora = new Date(r.timestamp || Date.now()).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const dia = new Date(r.timestamp || Date.now()).toLocaleDateString('pt-PT', { day: '2-digit', month: 'long', year: 'numeric' });
  const iniciais = (r.aluno?.nome || '?').split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase();
  const isEntrada = r.tipoMovimento !== 'saida';

  return (
    <View style={s.resultCard}>
      <Ionicons name={sem.icon} size={88} color={sem.iconColor} style={{ marginBottom: 8 }} />
      <Text style={[s.semLabel, { color: sem.textColor }]}>{sem.label}</Text>
      <View style={{
        flexDirection: 'row', alignItems: 'center', gap: 6,
        backgroundColor: isEntrada ? 'rgba(16,185,129,0.15)' : 'rgba(59,130,246,0.15)',
        borderRadius: 20, paddingHorizontal: 16, paddingVertical: 6,
        borderWidth: 1, borderColor: isEntrada ? 'rgba(16,185,129,0.4)' : 'rgba(59,130,246,0.4)',
        marginTop: 4,
      }}>
        <Ionicons name={isEntrada ? 'enter-outline' : 'exit-outline'} size={16} color={isEntrada ? '#34D399' : '#60A5FA'} />
        <Text style={{ color: isEntrada ? '#34D399' : '#60A5FA', fontSize: 16, fontWeight: '800', letterSpacing: 1.5 }}>
          {isEntrada ? 'ENTRADA' : 'SAÍDA'}
        </Text>
      </View>
      <Text style={s.semSub}>{sem.sublabel}</Text>

      <View style={[s.personCard, { borderColor: sem.border }]}>
        {r.aluno?.foto ? (
          <Image source={{ uri: r.aluno.foto }} style={s.foto} />
        ) : (
          <View style={[s.fotoPlc, { borderColor: sem.border }]}>
            <Text style={[s.fotoIni, { color: sem.textColor }]}>{iniciais}</Text>
          </View>
        )}
        <View style={s.personInfo}>
          <Text style={s.personName} numberOfLines={2}>{r.aluno?.nome || '—'}</Text>
          <Text style={s.personSub}>{r.aluno?.numeroMatricula || ''}</Text>
          {r.aluno?.turma && <Text style={s.personSub2}>{r.aluno.turma}</Text>}
          <Text style={s.personSub2}>Ano {r.anoLetivo}</Text>
        </View>
      </View>

      {r.motivo ? (
        <View style={[s.motivoBox, { borderColor: sem.border + '55', backgroundColor: sem.border + '12' }]}>
          <Text style={[s.motivoText, { color: sem.textColor }]}>{r.motivo}</Text>
          {(r.mesesAtraso || 0) > 0 && (
            <Text style={s.dividaText}>Dívida estimada: {(r.valorDivida || 0).toLocaleString('pt-AO')} Kz</Text>
          )}
        </View>
      ) : null}

      <Text style={s.timestamp}>{hora} · {dia}</Text>

      <View style={s.countdownRow}>
        <Text style={s.countdownText}>Próxima leitura em {countdown}s</Text>
        <TouchableOpacity style={s.resetBtn} onPress={onReset} activeOpacity={0.8}>
          <Ionicons name="refresh" size={16} color="#fff" />
          <Text style={s.resetBtnText}>Reiniciar já</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function FuncionarioResult({ r, borderColor, countdown, onReset }: { r: KioskResult; borderColor: string; countdown: number; onReset: () => void }) {
  const hora = new Date(r.timestamp || Date.now()).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const iniciais = (r.funcionario?.nome || '?').split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase();

  return (
    <View style={s.resultCard}>
      <Ionicons name="checkmark-circle" size={88} color="#3B82F6" style={{ marginBottom: 8 }} />
      <Text style={[s.semLabel, { color: '#60A5FA' }]}>ACESSO AUTORIZADO</Text>
      <Text style={s.semSub}>Funcionário identificado</Text>

      <View style={[s.personCard, { borderColor }]}>
        {r.funcionario?.foto ? (
          <Image source={{ uri: r.funcionario.foto }} style={s.foto} />
        ) : (
          <View style={[s.fotoPlc, { borderColor }]}>
            <Text style={[s.fotoIni, { color: '#60A5FA' }]}>{iniciais}</Text>
          </View>
        )}
        <View style={s.personInfo}>
          <Text style={s.personName} numberOfLines={2}>{r.funcionario?.nome || '—'}</Text>
          <Text style={s.personSub}>{r.funcionario?.cargo || ''}</Text>
          <Text style={s.personSub2}>{r.funcionario?.departamento || ''}</Text>
        </View>
      </View>

      <Text style={s.timestamp}>{hora}</Text>

      <View style={s.countdownRow}>
        <Text style={s.countdownText}>Próxima leitura em {countdown}s</Text>
        <TouchableOpacity style={s.resetBtn} onPress={onReset} activeOpacity={0.8}>
          <Ionicons name="refresh" size={16} color="#fff" />
          <Text style={s.resetBtnText}>Reiniciar já</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: {
    flex: 1, position: 'relative',
    minHeight: '100%' as any,
  },
  topBand: { width: '100%', height: 8, zIndex: 10 },

  header: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12,
    backgroundColor: 'rgba(0,0,0,0.45)',
    zIndex: 5,
  },
  shield: {
    width: 36, height: 36, borderRadius: 8,
    backgroundColor: 'rgba(212,175,55,0.15)',
    borderWidth: 1, borderColor: 'rgba(212,175,55,0.35)',
    alignItems: 'center', justifyContent: 'center',
  },
  schoolName: { flex: 1, color: '#f4e9c8', fontSize: 15, fontWeight: '800', letterSpacing: 0.3 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  clockText: { color: 'rgba(244,233,200,0.5)', fontSize: 13, fontWeight: '600', fontVariant: ['tabular-nums'] as any },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.2)' },
  liveDotActive: { backgroundColor: '#10B981' },

  content: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    padding: 24,
  },

  // Scanning
  scanArea: { alignItems: 'center', gap: 16 },
  scanFrame: {
    width: 220, height: 220, borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.04)',
    alignItems: 'center', justifyContent: 'center',
    position: 'relative',
  },
  corner: { position: 'absolute', width: 28, height: 28, borderColor: '#D4AF37', borderWidth: 3 },
  cornerTL: { top: 0, left: 0, borderBottomWidth: 0, borderRightWidth: 0, borderTopLeftRadius: 6 },
  cornerTR: { top: 0, right: 0, borderBottomWidth: 0, borderLeftWidth: 0, borderTopRightRadius: 6 },
  cornerBL: { bottom: 0, left: 0, borderTopWidth: 0, borderRightWidth: 0, borderBottomLeftRadius: 6 },
  cornerBR: { bottom: 0, right: 0, borderTopWidth: 0, borderLeftWidth: 0, borderBottomRightRadius: 6 },
  scanLabel: { color: '#f4e9c8', fontSize: 20, fontWeight: '800', letterSpacing: 0.5, textAlign: 'center' },
  scanSub: { color: 'rgba(244,233,200,0.45)', fontSize: 13, textAlign: 'center' },

  // Loading
  loadingText: { color: 'rgba(255,255,255,0.6)', fontSize: 15, marginTop: 16 },

  // Error / no camera
  errorCard: { alignItems: 'center', gap: 10, maxWidth: 400, width: '100%' },
  errorTitle: { color: '#fff', fontSize: 24, fontWeight: '900', textAlign: 'center', marginTop: 8 },
  errorSub: { color: 'rgba(255,255,255,0.55)', fontSize: 14, textAlign: 'center', lineHeight: 20, marginBottom: 8 },

  // Result
  resultCard: { alignItems: 'center', gap: 12, width: '100%', maxWidth: 460 },
  semLabel: { fontSize: 28, fontWeight: '900', letterSpacing: 1.2, textAlign: 'center' },
  semSub: { color: 'rgba(255,255,255,0.55)', fontSize: 14, textAlign: 'center' },

  personCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    width: '100%', backgroundColor: '#0D1A2E',
    borderRadius: 14, borderWidth: 1.5, padding: 14,
  },
  foto: { width: 72, height: 88, borderRadius: 8 },
  fotoPlc: {
    width: 72, height: 88, borderRadius: 8, borderWidth: 2,
    backgroundColor: '#1A2438', alignItems: 'center', justifyContent: 'center',
  },
  fotoIni: { fontSize: 26, fontWeight: '900' },
  personInfo: { flex: 1 },
  personName: { color: '#fff', fontSize: 18, fontWeight: '800', marginBottom: 4 },
  personSub: { color: 'rgba(255,255,255,0.5)', fontSize: 12, marginTop: 2 },
  personSub2: { color: 'rgba(255,255,255,0.35)', fontSize: 11, marginTop: 1 },

  motivoBox: {
    width: '100%', borderRadius: 10, borderWidth: 1,
    padding: 12, alignItems: 'center',
  },
  motivoText: { fontSize: 14, fontWeight: '700', textAlign: 'center' },
  dividaText: { color: 'rgba(255,255,255,0.45)', fontSize: 12, marginTop: 4 },

  timestamp: { color: 'rgba(255,255,255,0.3)', fontSize: 11 },

  countdownRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4 },
  countdownText: { color: 'rgba(255,255,255,0.35)', fontSize: 12 },
  resetBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 8,
    paddingHorizontal: 14, paddingVertical: 8,
  },
  resetBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },

  footer: {
    paddingVertical: 10, alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
    zIndex: 5,
  },
  footerText: { color: 'rgba(255,255,255,0.2)', fontSize: 10, letterSpacing: 0.5 },
});
