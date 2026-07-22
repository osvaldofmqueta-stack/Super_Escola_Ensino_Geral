import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Image, Modal,
  Platform, Dimensions, ScrollView,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import QRCode from 'react-native-qrcode-svg';
import { Colors } from '@/constants/colors';
import { api } from '@/lib/api';

export type Semaforo = 'verde' | 'amarelo' | 'vermelho';

export interface CartaoStatusActual {
  resultado: Semaforo;
  motivo: string;
  mesesAtraso: number;
  valorDivida: number;
  cartaoPago: boolean;
}
export interface QrTokenResp {
  token: string;
  expiresAt: number;
  ttlSeconds: number;
  anoLetivo: string;
  statusActual: CartaoStatusActual;
}
export interface CartaoLeitura {
  id: string;
  resultado: Semaforo;
  motivo: string;
  mesesAtraso: number;
  cartaoPago: boolean;
  leitorNome: string | null;
  origemLeitura: string | null;
  createdAt: string;
}
export interface AlunoCartaoProps {
  nome: string;
  matricula: string;
  classeTurma: string;
  periodo: string;
  genero?: string | null;
  foto?: string | null;
  initials: string;
  nomeEscola: string;
  anoLetivo: string;
  pagamentoCartaoData?: string | null;
  pagamentoCartaoRef?: string | null;
  alunoId?: string | null;
  onPagar?: () => void;
  cartaoValor?: number;
}

const SEM_COR: Record<Semaforo, {
  bg: string; border: string; text: string; chip: string;
  chipBg: string; gradTint: string; label: string;
}> = {
  verde: {
    bg: '#10B98114', border: '#10B981', text: '#34D399', chip: '#10B981',
    chipBg: '#10B98120', gradTint: '#0D2218', label: 'ATIVO',
  },
  amarelo: {
    bg: '#F59E0B14', border: '#F59E0B', text: '#FBBF24', chip: '#F59E0B',
    chipBg: '#F59E0B20', gradTint: '#1A1400', label: 'ATENÇÃO',
  },
  vermelho: {
    bg: '#EF444414', border: '#EF4444', text: '#F87171', chip: '#EF4444',
    chipBg: '#EF444420', gradTint: '#1A0808', label: 'INATIVO',
  },
};

export default function CartaoEstudanteVisual(props: AlunoCartaoProps) {
  const [qr, setQr] = useState<QrTokenResp | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [erroQr, setErroQr] = useState<string | null>(null);
  const [showFullscreen, setShowFullscreen] = useState(false);
  const [showHistorico, setShowHistorico] = useState(false);
  const [tamanhoReal, setTamanhoReal] = useState(false);
  const [leituras, setLeituras] = useState<CartaoLeitura[]>([]);
  const [carregandoLeit, setCarregandoLeit] = useState(false);
  const [authError, setAuthError] = useState(false);
  const refreshTimer = useRef<any>(null);
  const tickTimer = useRef<any>(null);
  const isFetching = useRef(false);

  async function fetchQrToken() {
    if (isFetching.current || authError) return;
    isFetching.current = true;
    try {
      const r = await api.get<QrTokenResp>('/api/cartao/qr-token');
      setQr(r);
      setErroQr(null);
      setAuthError(false);
      setSecondsLeft(Math.max(0, Math.floor((r.expiresAt - Date.now()) / 1000)));
    } catch (e: any) {
      const msg: string = e?.message || '';
      if (msg.startsWith('401') || msg.startsWith('403') || msg.includes('Unauthorized') || msg.includes('autenticado')) {
        setAuthError(true);
        setErroQr('Sessão expirada. Faça login novamente para ver o seu cartão.');
      } else {
        setErroQr(msg || 'Não foi possível gerar o QR.');
      }
      // Clear stale data so the timer stops triggering retries
      setQr(null);
    } finally {
      isFetching.current = false;
    }
  }

  useEffect(() => {
    fetchQrToken();
    return () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      if (tickTimer.current) clearInterval(tickTimer.current);
    };
  }, []);

  useEffect(() => {
    if (tickTimer.current) clearInterval(tickTimer.current);
    // Don't start a timer if session is invalid — avoid retry flood
    if (authError) return;
    tickTimer.current = setInterval(() => {
      if (qr) {
        const s = Math.max(0, Math.floor((qr.expiresAt - Date.now()) / 1000));
        setSecondsLeft(s);
        if (s === 0) fetchQrToken();
      }
    }, 1000);
    return () => clearInterval(tickTimer.current);
  }, [qr?.expiresAt, authError]);

  async function fetchLeituras() {
    setCarregandoLeit(true);
    try {
      const r = await api.get<{ leituras: CartaoLeitura[] }>('/api/cartao/leituras?limit=10');
      setLeituras(r.leituras || []);
    } catch {} finally { setCarregandoLeit(false); }
  }
  useEffect(() => { fetchLeituras(); }, []);

  const status = qr?.statusActual;
  const semaforo: Semaforo = status?.resultado || 'amarelo';
  const semCor = SEM_COR[semaforo];
  const propinasEmAtraso = semaforo === 'vermelho';
  const cartaoPago = status?.cartaoPago ?? false;
  const cartaoAtivo = !propinasEmAtraso && cartaoPago;
  const cartaoPendente = !propinasEmAtraso && !cartaoPago && qr !== null;

  const screenW = Dimensions.get('window').width;
  const cardWidth = tamanhoReal
    ? 322
    : Math.min(screenW - 32, Platform.OS === 'web' ? 520 : 360);
  const cardHeight = Math.round(cardWidth / 1.586);

  const qrSize = Math.min(76, Math.round(cardHeight * 0.42));
  const photoSize = Math.min(58, Math.round(cardHeight * 0.32));

  const statusLabel = propinasEmAtraso ? 'INATIVO' : cartaoAtivo ? 'ATIVO' : cartaoPendente ? 'PENDENTE' : 'AVISO';
  const statusColor = propinasEmAtraso ? '#EF4444' : cartaoAtivo ? '#10B981' : cartaoPendente ? '#6B7280' : '#F59E0B';

  return (
    <View style={{ alignItems: 'center', width: '100%' }}>
      {/* ─── Cartão CR80 ─── */}
      <View style={[s.cardWrap, { width: cardWidth, height: cardHeight }]}>
        {/* Banda lateral (estado propina) */}
        <View style={[s.statusBand, { backgroundColor: semCor.chip }]} />

        {/* Fundo degradê com tint do estado */}
        <LinearGradient
          colors={['#081225', '#0E1E40', semCor.gradTint]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />

        {/* Decorativos */}
        <View style={[s.decorCircle, { borderColor: semCor.chip + '15' }]} pointerEvents="none" />
        <View style={[s.decorCircle2, { borderColor: semCor.chip + '0A' }]} pointerEvents="none" />

        {/* Conteúdo */}
        <View style={s.cardInner}>
          {/* ─── Cabeçalho ─── */}
          <View style={s.cardHeader}>
            <View style={[s.sigaBadge, { borderColor: semCor.chip + '70' }]}>
              <Text style={[s.sigaText, { color: semCor.chip }]}>SIGA</Text>
            </View>
            <Text style={s.schoolName} numberOfLines={1}>{props.nomeEscola}</Text>
            <View style={[s.statusChip, { backgroundColor: statusColor + '20', borderColor: statusColor + '70' }]}>
              <View style={[s.chipDot, { backgroundColor: statusColor }]} />
              <Text style={[s.chipText, { color: statusColor }]}>{statusLabel}</Text>
            </View>
          </View>

          {/* ─── Corpo ─── */}
          <View style={s.cardBody}>
            {/* Foto circular */}
            <View style={[s.fotoRing, {
              borderColor: semCor.chip,
              width: photoSize + 6, height: photoSize + 6,
              borderRadius: (photoSize + 6) / 2,
            }]}>
              {props.foto ? (
                <Image source={{ uri: props.foto }} style={[s.fotoImg, { width: photoSize, height: photoSize, borderRadius: photoSize / 2 }]} />
              ) : (
                <View style={[s.fotoPlc, { width: photoSize, height: photoSize, borderRadius: photoSize / 2, backgroundColor: semCor.chip + '18' }]}>
                  <Text style={[s.fotoIni, { color: semCor.chip, fontSize: Math.round(photoSize * 0.35) }]}>{props.initials}</Text>
                </View>
              )}
            </View>

            {/* Informações */}
            <View style={s.info}>
              <Text style={s.nome} numberOfLines={2}>{props.nome}</Text>

              <View style={s.infoLine}>
                <Ionicons name="id-card-outline" size={9} color={Colors.gold + 'AA'} />
                <Text style={s.infoLineText}>{props.matricula}</Text>
              </View>
              <View style={s.infoLine}>
                <Ionicons name="school-outline" size={9} color={Colors.gold + 'AA'} />
                <Text style={s.infoLineText} numberOfLines={1}>{props.classeTurma}</Text>
              </View>
              <View style={s.infoLine}>
                <Ionicons name="time-outline" size={9} color={Colors.gold + 'AA'} />
                <Text style={s.infoLineText}>{props.periodo}</Text>
              </View>

              {/* Estado financeiro em miniatura */}
              <View style={[s.financRow, { backgroundColor: semCor.bg, borderColor: semCor.border + '80' }]}>
                <Ionicons
                  name={semaforo === 'verde' ? 'checkmark-circle' : semaforo === 'amarelo' ? 'warning' : 'alert-circle'}
                  size={9}
                  color={semCor.text}
                />
                <Text style={[s.financText, { color: semCor.text }]} numberOfLines={2}>
                  {status?.motivo || 'A verificar estado…'}
                </Text>
              </View>
            </View>

            {/* QR Code */}
            <View style={s.qrWrap}>
              <View style={[s.qrBox, propinasEmAtraso && { borderColor: '#EF444440', borderWidth: 1 }]}>
                {qr && !cartaoPendente ? (
                  <>
                    <QRCode value={qr.token} size={qrSize} backgroundColor="white" color="#000" />
                    {propinasEmAtraso ? (
                      <View style={s.qrBloqueioOverlay}>
                        <Ionicons name="ban" size={Math.round(qrSize * 0.45)} color="#EF4444" />
                      </View>
                    ) : (
                      <View style={[s.qrTimer, { backgroundColor: secondsLeft < 10 ? '#EF4444' : '#0EA5E9' }]}>
                        <Text style={s.qrTimerText}>{secondsLeft}s</Text>
                      </View>
                    )}
                  </>
                ) : cartaoPendente ? (
                  <View style={[s.qrState, { width: qrSize, height: qrSize, backgroundColor: '#1A1A2E', borderRadius: 4 }]}>
                    <Ionicons name="lock-closed" size={20} color="#6B7280" />
                  </View>
                ) : erroQr ? (
                  <View style={[s.qrState, { width: qrSize, height: qrSize }]}>
                    <Ionicons name="refresh" size={18} color={semCor.chip} />
                    <Text style={[s.qrStateText, { color: semCor.chip }]} onPress={fetchQrToken}>Tentar</Text>
                  </View>
                ) : (
                  <View style={[s.qrState, { width: qrSize, height: qrSize }]}>
                    <Ionicons name="hourglass-outline" size={18} color="#999" />
                  </View>
                )}
              </View>
              <Text style={s.qrLabel}>
                {propinasEmAtraso ? 'BLOQUEADO' : cartaoPendente ? 'INACTIVO' : 'QR Code'}
              </Text>
            </View>
          </View>

          {/* ─── Rodapé ─── */}
          <View style={[s.cardFooter, propinasEmAtraso && { borderTopColor: '#EF444430' }]}>
            <MaterialCommunityIcons name="integrated-circuit-chip" size={11} color={semCor.chip + 'BB'} />
            <View style={[s.footerDivider, { backgroundColor: semCor.chip + '30' }]} />
            <Text style={[s.footerText, propinasEmAtraso && { color: '#F87171' }, cartaoPendente && { color: '#6B7280' }]} numberOfLines={1}>
              {propinasEmAtraso
                ? `Regularize as propinas em atraso`
                : cartaoPago
                  ? `Cartão Digital · ${props.anoLetivo}`
                  : `Cartão Digital — Pendente de Activação`}
            </Text>
          </View>
        </View>
      </View>

      {/* ─── Acções ─── */}
      <View style={s.actions}>
        <TouchableOpacity style={s.actBtn} onPress={() => setShowFullscreen(true)} activeOpacity={0.8}>
          <Ionicons name="expand-outline" size={14} color={Colors.gold} />
          <Text style={s.actBtnTxt}>Tela Cheia</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.actBtn} onPress={() => setTamanhoReal(v => !v)} activeOpacity={0.8}>
          <MaterialCommunityIcons name={tamanhoReal ? 'resize' : 'resize-bottom-right'} size={14} color={Colors.gold} />
          <Text style={s.actBtnTxt}>{tamanhoReal ? 'Tamanho Auto' : 'Tamanho Real'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.actBtn} onPress={fetchQrToken} activeOpacity={0.8}>
          <Ionicons name="refresh" size={14} color={Colors.gold} />
          <Text style={s.actBtnTxt}>Renovar QR</Text>
        </TouchableOpacity>
      </View>

      {/* ─── Histórico de leituras ─── */}
      <View style={s.histCard}>
        <TouchableOpacity
          style={s.histHeader}
          onPress={() => { setShowHistorico(v => !v); if (!showHistorico) fetchLeituras(); }}
          activeOpacity={0.8}
        >
          <MaterialCommunityIcons name="history" size={14} color={Colors.gold} />
          <Text style={s.histTitle}>Últimas Validações na Portaria ({leituras.length})</Text>
          <Ionicons name={showHistorico ? 'chevron-up' : 'chevron-down'} size={14} color={Colors.textMuted} />
        </TouchableOpacity>

        {showHistorico && (
          <View style={{ paddingTop: 8 }}>
            {carregandoLeit ? (
              <Text style={s.histEmpty}>A carregar…</Text>
            ) : leituras.length === 0 ? (
              <Text style={s.histEmpty}>Ainda não há leituras registadas.</Text>
            ) : (
              leituras.map(l => {
                const c = SEM_COR[l.resultado];
                return (
                  <View key={l.id} style={s.histRow}>
                    <View style={[s.histDot, { backgroundColor: c.chip }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={s.histDate}>
                        {new Date(l.createdAt).toLocaleString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </Text>
                      <Text style={s.histMot} numberOfLines={1}>{l.motivo} · Lido por {l.leitorNome || '—'}</Text>
                    </View>
                    <Text style={[s.histResult, { color: c.text }]}>{l.resultado.toUpperCase()}</Text>
                  </View>
                );
              })
            )}
          </View>
        )}
      </View>

      {/* ─── Banner de bloqueio por propinas ─── */}
      {status && propinasEmAtraso && (
        <View style={s.bloqueadoBanner}>
          <View style={s.bloqueadoIconWrap}>
            <Ionicons name="alert-circle" size={22} color="#EF4444" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.bloqueadoTitulo}>Acesso à Instituição Bloqueado</Text>
            <Text style={s.bloqueadoDesc}>
              {status.mesesAtraso > 0
                ? `Tens ${status.mesesAtraso} ${status.mesesAtraso === 1 ? 'mês' : 'meses'} de propinas em atraso. Regulariza o pagamento para reactivar o cartão.`
                : 'As tuas propinas estão em atraso. Regulariza para recuperar o acesso.'}
            </Text>
          </View>
        </View>
      )}

      {/* ─── Botão activar cartão (só aparece se não pago E propinas ok) ─── */}
      {status && !status.cartaoPago && !propinasEmAtraso && props.onPagar && (
        <TouchableOpacity style={s.pagarBtn} onPress={props.onPagar} activeOpacity={0.85}>
          <Ionicons name="phone-portrait-outline" size={16} color="#fff" />
          <Text style={s.pagarBtnText}>
            Activar Cartão Digital — {(props.cartaoValor || 2500).toLocaleString('pt-AO')} Kz
          </Text>
        </TouchableOpacity>
      )}

      {/* ─── Modal Fullscreen ─── */}
      <Modal visible={showFullscreen} animationType="fade" onRequestClose={() => setShowFullscreen(false)} transparent={false}>
        <CartaoFullscreen
          token={qr?.token || ''}
          secondsLeft={secondsLeft}
          semaforo={semaforo}
          motivo={status?.motivo || ''}
          nome={props.nome}
          matricula={props.matricula}
          classeTurma={props.classeTurma}
          anoLetivo={props.anoLetivo}
          foto={props.foto}
          initials={props.initials}
          onClose={() => setShowFullscreen(false)}
          onRefresh={fetchQrToken}
        />
      </Modal>
    </View>
  );
}

// ─── Modal Fullscreen ────────────────────────────────────────────────────────
function CartaoFullscreen({
  token, secondsLeft, semaforo, motivo, nome, matricula, classeTurma, anoLetivo,
  foto, initials, onClose, onRefresh,
}: {
  token: string; secondsLeft: number; semaforo: Semaforo; motivo: string;
  nome: string; matricula: string; classeTurma: string; anoLetivo: string;
  foto?: string | null; initials: string;
  onClose: () => void; onRefresh: () => void;
}) {
  useEffect(() => {
    let wakeLock: any = null;
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && (navigator as any).wakeLock) {
      (navigator as any).wakeLock.request('screen').then((w: any) => { wakeLock = w; }).catch(() => {});
    }
    return () => { if (wakeLock?.release) wakeLock.release().catch(() => {}); };
  }, []);

  const semCor = SEM_COR[semaforo];
  const screen = Dimensions.get('window');
  const qrSize = Math.min(screen.width * 0.72, screen.height * 0.48, 380);
  const isExpiring = secondsLeft < 10;
  const isBloqueado = semaforo === 'vermelho';

  const statusMsg = semaforo === 'verde'
    ? 'PROPINAS EM DIA — ACESSO AUTORIZADO'
    : semaforo === 'amarelo'
      ? 'ATENÇÃO — VERIFICAR NA SECRETARIA'
      : 'PROPINAS EM ATRASO — ACESSO BLOQUEADO';

  return (
    <View style={fs.root}>
      <LinearGradient colors={['#060E1A', '#091528', '#060E1A']} style={StyleSheet.absoluteFill} />

      {/* Barra de estado */}
      <LinearGradient
        colors={[semCor.chip + 'EE', semCor.chip + 'CC']}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
        style={fs.statusBar}
      >
        <Ionicons
          name={semaforo === 'verde' ? 'checkmark-circle' : semaforo === 'amarelo' ? 'warning' : 'ban'}
          size={16}
          color="#fff"
        />
        <Text style={fs.statusText}>{statusMsg}</Text>
      </LinearGradient>

      <TouchableOpacity style={fs.closeBtn} onPress={onClose} activeOpacity={0.7}>
        <Ionicons name="close" size={24} color="rgba(255,255,255,0.8)" />
      </TouchableOpacity>

      <ScrollView contentContainerStyle={fs.body}>
        {/* Identificação */}
        <View style={[fs.identCard, { borderColor: semCor.chip + '55' }]}>
          {foto ? (
            <Image source={{ uri: foto }} style={[fs.foto, { borderColor: semCor.chip }]} />
          ) : (
            <View style={[fs.fotoPlc, { borderColor: semCor.chip, backgroundColor: semCor.chip + '15' }]}>
              <Text style={[fs.fotoIni, { color: semCor.chip }]}>{initials}</Text>
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={fs.nome}>{nome}</Text>
            <Text style={fs.sub}>{matricula} · {classeTurma}</Text>
            <Text style={fs.dept}>Ano Lectivo {anoLetivo}</Text>
          </View>
        </View>

        {/* QR Code grande */}
        <View style={[fs.qrCard, (isExpiring || isBloqueado) && { borderColor: '#EF4444' }]}>
          {token ? (
            <View style={{ position: 'relative' }}>
              <QRCode value={token} size={qrSize} backgroundColor="white" color="#000" />
              {isBloqueado && (
                <View style={[fs.qrBloqueioOverlay, { width: qrSize, height: qrSize }]}>
                  <Ionicons name="ban" size={Math.round(qrSize * 0.42)} color="#EF4444" />
                  <Text style={fs.qrBloqueioText}>ACESSO BLOQUEADO</Text>
                </View>
              )}
            </View>
          ) : (
            <View style={[fs.qrPlc, { width: qrSize, height: qrSize }]}>
              <Ionicons name="hourglass-outline" size={42} color={Colors.textMuted} />
            </View>
          )}
        </View>

        {/* Countdown (só se não bloqueado) */}
        {!isBloqueado && (
          <View style={[fs.countdownRow, isExpiring && { borderColor: '#EF444440' }]}>
            <Ionicons name="timer-outline" size={15} color={isExpiring ? '#EF4444' : '#0EA5E9'} />
            <Text style={[fs.countdownText, { color: isExpiring ? '#EF4444' : 'rgba(255,255,255,0.8)' }]}>
              QR válido por {secondsLeft}s · Renova-se automaticamente
            </Text>
            <TouchableOpacity onPress={onRefresh} style={fs.refreshBtn} activeOpacity={0.7}>
              <Ionicons name="refresh" size={13} color="#fff" />
            </TouchableOpacity>
          </View>
        )}

        {/* Motivo */}
        {motivo ? (
          <View style={[fs.motivoBox, { borderColor: semCor.border + '55', backgroundColor: semCor.bg }]}>
            <Text style={[fs.motivoText, { color: semCor.text }]}>{motivo}</Text>
          </View>
        ) : null}

        <Text style={fs.hint}>Mostre este código ao funcionário da portaria</Text>
      </ScrollView>
    </View>
  );
}

// ─── Estilos do cartão ────────────────────────────────────────────────────────
const s = StyleSheet.create({
  cardWrap: {
    flexDirection: 'row',
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 10,
  },
  statusBand: { width: 9, height: '100%' },
  cardInner: { flex: 1, padding: 11, position: 'relative' },

  decorCircle: {
    position: 'absolute', width: 200, height: 200, borderRadius: 100,
    borderWidth: 40, top: -80, right: -60,
  },
  decorCircle2: {
    position: 'absolute', width: 140, height: 140, borderRadius: 70,
    borderWidth: 25, bottom: -50, right: 60,
  },

  cardHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8,
  },
  sigaBadge: {
    paddingHorizontal: 5, paddingVertical: 2, borderRadius: 4, borderWidth: 1,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  sigaText: { fontSize: 8, fontWeight: '900', letterSpacing: 0.8 },
  schoolName: { color: 'rgba(255,255,255,0.9)', fontSize: 10.5, fontWeight: '800', flex: 1, letterSpacing: 0.2 },
  statusChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 7, paddingVertical: 3, borderRadius: 12, borderWidth: 1,
  },
  chipDot: { width: 5, height: 5, borderRadius: 3 },
  chipText: { fontSize: 8, fontWeight: '900', letterSpacing: 0.5 },

  cardBody: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, flex: 1 },

  fotoRing: {
    borderWidth: 2, alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3, shadowRadius: 4,
  },
  fotoImg: { borderRadius: 100 },
  fotoPlc: { alignItems: 'center', justifyContent: 'center' },
  fotoIni: { fontWeight: '800' },

  info: { flex: 1, gap: 3 },
  nome: { color: '#FFFFFF', fontSize: 12.5, fontWeight: '800', letterSpacing: 0.1, lineHeight: 16 },
  infoLine: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  infoLineText: { color: 'rgba(255,255,255,0.62)', fontSize: 9.5, flex: 1 },
  financRow: {
    flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3,
    paddingHorizontal: 5, paddingVertical: 3, borderRadius: 5, borderWidth: 1,
  },
  financText: { fontSize: 8.5, fontWeight: '600', flex: 1, lineHeight: 11 },

  qrWrap: { alignItems: 'center', gap: 3 },
  qrBox: {
    backgroundColor: '#FFFFFF', padding: 5, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center', position: 'relative',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2, shadowRadius: 4,
  },
  qrTimer: {
    position: 'absolute', top: -7, right: -7,
    paddingHorizontal: 5, paddingVertical: 1.5, borderRadius: 8,
    minWidth: 24, alignItems: 'center',
  },
  qrTimerText: { color: '#fff', fontSize: 8, fontWeight: '900' },
  qrState: { alignItems: 'center', justifyContent: 'center', gap: 3 },
  qrStateText: { fontSize: 9, fontWeight: '700' },
  qrBloqueioOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(255,255,255,0.85)', borderRadius: 4,
    alignItems: 'center', justifyContent: 'center',
  },
  qrLabel: { color: 'rgba(255,255,255,0.3)', fontSize: 7.5, fontWeight: '600', letterSpacing: 0.5 },

  cardFooter: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.07)',
    paddingTop: 5, marginTop: 5,
  },
  footerDivider: { width: 1, height: 10, borderRadius: 1 },
  footerText: { color: 'rgba(255,255,255,0.45)', fontSize: 8.5, flex: 1 },

  actions: {
    flexDirection: 'row', gap: 8, marginBottom: 12,
    flexWrap: 'wrap', justifyContent: 'center', maxWidth: 520,
  },
  actBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 9,
    backgroundColor: '#0D1A30', borderWidth: 1, borderColor: Colors.gold + '45',
  },
  actBtnTxt: { color: Colors.gold, fontSize: 11, fontWeight: '700' },

  histCard: {
    backgroundColor: '#0D1A30', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
    padding: 12, marginBottom: 10, width: '100%', maxWidth: 520,
  },
  histHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  histTitle: { color: Colors.gold, fontSize: 11, fontWeight: '700', flex: 1 },
  histEmpty: { color: Colors.textMuted, fontSize: 11, fontStyle: 'italic', textAlign: 'center', paddingVertical: 8 },
  histRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, borderTopWidth: 1, borderTopColor: '#1F2D4555' },
  histDot: { width: 8, height: 8, borderRadius: 4 },
  histDate: { color: '#fff', fontSize: 11, fontWeight: '600' },
  histMot: { color: Colors.textMuted, fontSize: 10, marginTop: 1 },
  histResult: { fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },

  pagarBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: Colors.accent, paddingHorizontal: 18, paddingVertical: 12,
    borderRadius: 10, marginTop: 4, width: '100%', maxWidth: 520,
  },
  pagarBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },

  bloqueadoBanner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    backgroundColor: '#2D0A0A', borderWidth: 1.5, borderColor: '#EF4444',
    borderRadius: 12, padding: 14, marginTop: 4, width: '100%', maxWidth: 520,
  },
  bloqueadoIconWrap: { marginTop: 1 },
  bloqueadoTitulo: { color: '#F87171', fontSize: 12, fontWeight: '800', marginBottom: 3 },
  bloqueadoDesc: { color: 'rgba(255,255,255,0.75)', fontSize: 11, lineHeight: 16 },
});

// ─── Estilos do Fullscreen ───────────────────────────────────────────────────
const fs = StyleSheet.create({
  root: { flex: 1 },
  statusBar: {
    paddingVertical: 14, paddingHorizontal: 20,
    flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'center',
  },
  statusText: { color: '#fff', fontSize: 12, fontWeight: '900', letterSpacing: 0.7, textAlign: 'center', flex: 1 },
  closeBtn: {
    position: 'absolute', top: 56, right: 16, zIndex: 10,
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.1)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center', justifyContent: 'center',
  },
  body: { alignItems: 'center', paddingTop: 36, paddingBottom: 40, paddingHorizontal: 24, gap: 16 },

  identCard: {
    flexDirection: 'row', alignItems: 'center', gap: 16, width: '100%', maxWidth: 420,
    backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 16, borderWidth: 1, padding: 16,
  },
  foto: { width: 72, height: 72, borderRadius: 36, borderWidth: 3 },
  fotoPlc: {
    width: 72, height: 72, borderRadius: 36, borderWidth: 3,
    alignItems: 'center', justifyContent: 'center',
  },
  fotoIni: { fontSize: 26, fontWeight: '900' },
  nome: { color: '#fff', fontSize: 19, fontWeight: '800', marginBottom: 3 },
  sub: { color: 'rgba(255,255,255,0.6)', fontSize: 13, marginTop: 1 },
  dept: { color: 'rgba(255,255,255,0.4)', fontSize: 11, marginTop: 2 },

  qrCard: {
    backgroundColor: '#fff', padding: 14, borderRadius: 18,
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.1)',
    shadowColor: '#000', shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3, shadowRadius: 12,
    position: 'relative',
  },
  qrPlc: { alignItems: 'center', justifyContent: 'center' },
  qrBloqueioOverlay: {
    position: 'absolute', borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.9)',
    alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  qrBloqueioText: { color: '#EF4444', fontSize: 13, fontWeight: '900', letterSpacing: 0.5 },

  countdownRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 10, borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)', paddingHorizontal: 14, paddingVertical: 8,
    width: '100%', maxWidth: 420,
  },
  countdownText: { fontSize: 13, flex: 1 },
  refreshBtn: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center',
  },

  motivoBox: {
    width: '100%', maxWidth: 420, borderRadius: 10, borderWidth: 1,
    padding: 14, alignItems: 'center',
  },
  motivoText: { fontSize: 14, fontWeight: '700', textAlign: 'center' },
  hint: { color: 'rgba(255,255,255,0.35)', fontSize: 12, textAlign: 'center', fontStyle: 'italic' },
});
