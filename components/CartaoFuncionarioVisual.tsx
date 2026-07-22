import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Image, Modal,
  Platform, Dimensions, ScrollView,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import QRCode from 'react-native-qrcode-svg';
import { Colors } from '@/constants/colors';
import { api } from '@/lib/api';

export interface FuncionarioInfo {
  id: string;
  nome: string;
  cargo: string;
  departamento: string;
  role: string;
  foto: string | null;
  validado: boolean;
}

export interface CartaoFuncionarioQrResp {
  token: string;
  expiresAt: number;
  ttlSeconds: number;
  anoLetivo: string;
  funcionario: FuncionarioInfo;
}

export interface CartaoFuncionarioProps {
  nomeEscola: string;
}

const ROLE_LABELS: Record<string, string> = {
  professor: 'Professor(a)',
  diretor_turma: 'Director(a) de Turma',
  admin: 'Administrador',
  director: 'Director',
  chefe_secretaria: 'Chefe de Secretaria',
  secretaria: 'Secretária',
  financeiro: 'Técnico Financeiro',
  rh: 'Recursos Humanos',
  pedagogico: 'Coord. Pedagógico',
  subdiretor_administrativo: 'Subdirector Administrativo',
  ceo: 'Director-Geral',
  pca: 'Presidente do Conselho',
};

const ROLE_COLORS: Record<string, string> = {
  professor: '#3B82F6',
  diretor_turma: '#8B5CF6',
  admin: '#10B981',
  director: '#D4AF37',
  chefe_secretaria: '#F59E0B',
  secretaria: '#6EE7B7',
  financeiro: '#34D399',
  rh: '#F87171',
  pedagogico: '#A78BFA',
  subdiretor_administrativo: '#60A5FA',
  ceo: '#D4AF37',
  pca: '#D4AF37',
};

export default function CartaoFuncionarioVisual({ nomeEscola }: CartaoFuncionarioProps) {
  const [qrData, setQrData] = useState<CartaoFuncionarioQrResp | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [erroQr, setErroQr] = useState<string | null>(null);
  const [showFullscreen, setShowFullscreen] = useState(false);
  const [tamanhoReal, setTamanhoReal] = useState(false);
  const [authError, setAuthError] = useState(false);
  const tickTimer = useRef<any>(null);
  const isFetching = useRef(false);

  async function fetchQrToken() {
    if (isFetching.current || authError) return;
    isFetching.current = true;
    try {
      const r = await api.get<CartaoFuncionarioQrResp>('/api/cartao-funcionario/qr-token');
      setQrData(r);
      setErroQr(null);
      setAuthError(false);
      setSecondsLeft(Math.max(0, Math.floor((r.expiresAt - Date.now()) / 1000)));
    } catch (e: any) {
      const msg: string = e?.message || '';
      // On 401/403, stop all automatic retries — session is invalid
      if (msg.startsWith('401') || msg.startsWith('403') || msg.includes('Unauthorized') || msg.includes('autenticado')) {
        setAuthError(true);
        setErroQr('Sessão expirada. Faça login novamente para ver o seu cartão.');
      } else {
        setErroQr(msg || 'Não foi possível gerar o QR.');
      }
      // Clear stale data so the timer stops triggering retries
      setQrData(null);
    } finally {
      isFetching.current = false;
    }
  }

  useEffect(() => {
    fetchQrToken();
    return () => { if (tickTimer.current) clearInterval(tickTimer.current); };
  }, []);

  useEffect(() => {
    if (tickTimer.current) clearInterval(tickTimer.current);
    // Don't start a timer if session is invalid — avoid retry flood
    if (authError) return;
    tickTimer.current = setInterval(() => {
      if (qrData) {
        const s = Math.max(0, Math.floor((qrData.expiresAt - Date.now()) / 1000));
        setSecondsLeft(s);
        if (s === 0) fetchQrToken();
      }
    }, 1000);
    return () => clearInterval(tickTimer.current);
  }, [qrData?.expiresAt, authError]);

  const func = qrData?.funcionario;
  const role = func?.role || '';
  const roleLabel = ROLE_LABELS[role] || 'Funcionário';
  const roleColor = ROLE_COLORS[role] || Colors.gold;
  const initials = func?.nome
    ? func.nome.split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase()
    : 'F';

  const screenW = Dimensions.get('window').width;
  const cardWidth = tamanhoReal
    ? 322
    : Math.min(screenW - 32, Platform.OS === 'web' ? 520 : 360);
  const cardHeight = Math.round(cardWidth / 1.586);

  const qrSize = Math.min(76, Math.round(cardHeight * 0.42));
  const photoSize = Math.min(58, Math.round(cardHeight * 0.32));

  return (
    <View style={{ alignItems: 'center', width: '100%' }}>
      {/* ─── Cartão CR80 ─── */}
      <View style={[s.cardWrap, { width: cardWidth, height: cardHeight }]}>
        {/* Banda lateral (role color) */}
        <View style={[s.statusBand, { backgroundColor: roleColor }]} />

        {/* Fundo degradê */}
        <LinearGradient
          colors={['#081225', '#0E1E40', '#091830']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />

        {/* Elemento decorativo — círculo de fundo */}
        <View style={[s.decorCircle, { borderColor: roleColor + '18' }]} pointerEvents="none" />
        <View style={[s.decorCircle2, { borderColor: roleColor + '10' }]} pointerEvents="none" />

        {/* Conteúdo */}
        <View style={s.cardInner}>
          {/* ─── Cabeçalho ─── */}
          <View style={s.cardHeader}>
            <View style={[s.sigaBadge, { borderColor: roleColor + '80' }]}>
              <Text style={[s.sigaText, { color: roleColor }]}>SIGA</Text>
            </View>
            <Text style={s.schoolName} numberOfLines={1}>{nomeEscola}</Text>
            <View style={[s.statusChip, { backgroundColor: '#10B981' + '22', borderColor: '#10B98180' }]}>
              <View style={[s.chipDot, { backgroundColor: '#10B981' }]} />
              <Text style={[s.chipText, { color: '#10B981' }]}>ACTIVO</Text>
            </View>
          </View>

          {/* ─── Corpo ─── */}
          <View style={s.cardBody}>
            {/* Foto circular */}
            <View style={[s.fotoRing, { borderColor: roleColor, width: photoSize + 6, height: photoSize + 6, borderRadius: (photoSize + 6) / 2 }]}>
              {func?.foto ? (
                <Image source={{ uri: func.foto }} style={[s.fotoImg, { width: photoSize, height: photoSize, borderRadius: photoSize / 2 }]} />
              ) : (
                <View style={[s.fotoPlc, { width: photoSize, height: photoSize, borderRadius: photoSize / 2, backgroundColor: roleColor + '18' }]}>
                  <Text style={[s.fotoIni, { color: roleColor, fontSize: Math.round(photoSize * 0.35) }]}>{initials}</Text>
                </View>
              )}
            </View>

            {/* Informações */}
            <View style={s.info}>
              <Text style={s.nome} numberOfLines={2}>{func?.nome || '—'}</Text>

              <View style={[s.roleChip, { backgroundColor: roleColor + '20', borderColor: roleColor + '55' }]}>
                <Ionicons name="briefcase-outline" size={8} color={roleColor} />
                <Text style={[s.roleChipText, { color: roleColor }]} numberOfLines={1}>{roleLabel}</Text>
              </View>

              {func?.cargo && func.cargo !== roleLabel && (
                <View style={s.infoLine}>
                  <Ionicons name="ribbon-outline" size={9} color={Colors.gold + 'AA'} />
                  <Text style={s.infoLineText} numberOfLines={1}>{func.cargo}</Text>
                </View>
              )}
              <View style={s.infoLine}>
                <Ionicons name="business-outline" size={9} color={Colors.gold + 'AA'} />
                <Text style={s.infoLineText} numberOfLines={1}>{func?.departamento || '—'}</Text>
              </View>

              <View style={s.instBadge}>
                <Ionicons name="shield-checkmark" size={9} color="#10B981" />
                <Text style={s.instBadgeText}>Funcionário da Instituição</Text>
              </View>
            </View>

            {/* QR Code */}
            <View style={s.qrWrap}>
              <View style={s.qrBox}>
                {qrData ? (
                  <>
                    <QRCode value={qrData.token} size={qrSize} backgroundColor="white" color="#000" />
                    <View style={[s.qrTimer, { backgroundColor: secondsLeft < 10 ? '#EF4444' : '#10B981' }]}>
                      <Text style={s.qrTimerText}>{secondsLeft}s</Text>
                    </View>
                  </>
                ) : erroQr ? (
                  <View style={[s.qrState, { width: qrSize, height: qrSize }]}>
                    <Ionicons name="refresh" size={18} color={roleColor} />
                    <Text style={[s.qrStateText, { color: roleColor }]} onPress={fetchQrToken}>Tentar</Text>
                  </View>
                ) : (
                  <View style={[s.qrState, { width: qrSize, height: qrSize }]}>
                    <Ionicons name="hourglass-outline" size={18} color="#999" />
                  </View>
                )}
              </View>
              <Text style={s.qrLabel}>QR Code</Text>
            </View>
          </View>

          {/* ─── Rodapé ─── */}
          <View style={s.cardFooter}>
            <MaterialCommunityIcons name="integrated-circuit-chip" size={11} color={roleColor + 'BB'} />
            <View style={[s.footerDivider, { backgroundColor: roleColor + '30' }]} />
            <Text style={s.footerText} numberOfLines={1}>
              {qrData?.anoLetivo ? `Ano Lectivo ${qrData.anoLetivo}` : 'Cartão Digital de Funcionário'}
            </Text>
            <Text style={[s.footerTextRight, { color: roleColor + 'CC' }]}>
              {func?.id ? `#${String(func.id).slice(-6).toUpperCase()}` : ''}
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

      {/* ─── Info acesso automático ─── */}
      <View style={s.infoCard}>
        <View style={[s.infoIcon, { backgroundColor: '#10B981' + '18', borderColor: '#10B981' + '40' }]}>
          <Ionicons name="shield-checkmark" size={18} color="#10B981" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.infoTitulo}>Acesso Automático</Text>
          <Text style={s.infoDesc}>
            Como funcionário da instituição, o seu cartão é validado automaticamente. Não é necessário nenhum pagamento.
          </Text>
        </View>
      </View>

      {/* ─── Modal Fullscreen ─── */}
      <Modal visible={showFullscreen} animationType="fade" onRequestClose={() => setShowFullscreen(false)} transparent={false}>
        <FuncionarioFullscreen
          token={qrData?.token || ''}
          secondsLeft={secondsLeft}
          roleColor={roleColor}
          roleLabel={roleLabel}
          nome={func?.nome || '—'}
          cargo={func?.cargo || ''}
          departamento={func?.departamento || ''}
          foto={func?.foto || null}
          initials={initials}
          anoLetivo={qrData?.anoLetivo || ''}
          onClose={() => setShowFullscreen(false)}
          onRefresh={fetchQrToken}
        />
      </Modal>
    </View>
  );
}

// ─── Modal Fullscreen ────────────────────────────────────────────────────────
function FuncionarioFullscreen({
  token, secondsLeft, roleColor, roleLabel, nome, cargo, departamento,
  foto, initials, anoLetivo, onClose, onRefresh,
}: {
  token: string; secondsLeft: number; roleColor: string; roleLabel: string;
  nome: string; cargo: string; departamento: string; anoLetivo: string;
  foto: string | null; initials: string;
  onClose: () => void; onRefresh: () => void;
}) {
  useEffect(() => {
    let wakeLock: any = null;
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && (navigator as any).wakeLock) {
      (navigator as any).wakeLock.request('screen').then((w: any) => { wakeLock = w; }).catch(() => {});
    }
    return () => { if (wakeLock?.release) wakeLock.release().catch(() => {}); };
  }, []);

  const screen = Dimensions.get('window');
  const qrSize = Math.min(screen.width * 0.72, screen.height * 0.48, 380);
  const isExpiring = secondsLeft < 10;

  return (
    <View style={fs.root}>
      {/* Fundo degradê */}
      <LinearGradient colors={['#060E1A', '#091528', '#060E1A']} style={StyleSheet.absoluteFill} />

      {/* Barra de estado */}
      <LinearGradient
        colors={[roleColor + 'EE', roleColor + 'CC']}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
        style={fs.statusBar}
      >
        <Ionicons name="shield-checkmark" size={16} color="#fff" />
        <Text style={fs.statusText}>{roleLabel.toUpperCase()} — ACESSO AUTORIZADO</Text>
      </LinearGradient>

      <TouchableOpacity style={fs.closeBtn} onPress={onClose} activeOpacity={0.7}>
        <Ionicons name="close" size={24} color="rgba(255,255,255,0.8)" />
      </TouchableOpacity>

      <ScrollView contentContainerStyle={fs.body}>
        {/* Identificação */}
        <View style={[fs.identCard, { borderColor: roleColor + '55' }]}>
          {foto ? (
            <Image source={{ uri: foto }} style={[fs.foto, { borderColor: roleColor }]} />
          ) : (
            <View style={[fs.fotoPlc, { borderColor: roleColor, backgroundColor: roleColor + '15' }]}>
              <Text style={[fs.fotoIni, { color: roleColor }]}>{initials}</Text>
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={fs.nome}>{nome}</Text>
            <Text style={fs.sub}>{cargo || roleLabel}</Text>
            {departamento ? <Text style={fs.dept}>{departamento}</Text> : null}
            {anoLetivo ? <Text style={fs.dept}>Ano Lectivo {anoLetivo}</Text> : null}
          </View>
        </View>

        {/* QR Code grande */}
        <View style={[fs.qrCard, isExpiring && { borderColor: '#EF4444' }]}>
          {token ? (
            <QRCode value={token} size={qrSize} backgroundColor="white" color="#000" />
          ) : (
            <View style={[fs.qrPlc, { width: qrSize, height: qrSize }]}>
              <Ionicons name="hourglass-outline" size={42} color="#555" />
            </View>
          )}
        </View>

        {/* Countdown */}
        <View style={fs.countdownRow}>
          <Ionicons name="timer-outline" size={15} color={isExpiring ? '#EF4444' : '#10B981'} />
          <Text style={[fs.countdownText, { color: isExpiring ? '#EF4444' : 'rgba(255,255,255,0.8)' }]}>
            QR válido por {secondsLeft}s · Renova-se automaticamente
          </Text>
          <TouchableOpacity onPress={onRefresh} style={fs.refreshBtn} activeOpacity={0.7}>
            <Ionicons name="refresh" size={13} color="#fff" />
          </TouchableOpacity>
        </View>

        {/* Badge */}
        <View style={[fs.instBadge, { backgroundColor: '#10B981' + '15', borderColor: '#10B981' + '40' }]}>
          <Ionicons name="shield-checkmark" size={15} color="#10B981" />
          <Text style={fs.instBadgeText}>Funcionário da Instituição — Acesso Autorizado</Text>
        </View>

        <Text style={fs.hint}>Mostre este código ao funcionário da portaria</Text>
      </ScrollView>
    </View>
  );
}

// ─── Estilos ─────────────────────────────────────────────────────────────────
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
  roleChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 5, paddingVertical: 2, borderRadius: 5, borderWidth: 1,
    alignSelf: 'flex-start', marginBottom: 1,
  },
  roleChipText: { fontSize: 8.5, fontWeight: '700' },
  infoLine: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  infoLineText: { color: 'rgba(255,255,255,0.62)', fontSize: 9.5, flex: 1 },
  instBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2 },
  instBadgeText: { color: '#10B981', fontSize: 8.5, fontWeight: '700' },

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
  qrLabel: { color: 'rgba(255,255,255,0.3)', fontSize: 7.5, fontWeight: '600', letterSpacing: 0.5 },

  cardFooter: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.07)',
    paddingTop: 5, marginTop: 5,
  },
  footerDivider: { width: 1, height: 10, borderRadius: 1 },
  footerText: { color: 'rgba(255,255,255,0.45)', fontSize: 8.5, flex: 1 },
  footerTextRight: { fontSize: 8, fontWeight: '700', letterSpacing: 0.5 },

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

  infoCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    backgroundColor: '#091A0E', borderWidth: 1.5, borderColor: '#10B98145',
    borderRadius: 12, padding: 14, width: '100%', maxWidth: 520,
  },
  infoIcon: {
    width: 38, height: 38, borderRadius: 10, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  infoTitulo: { color: '#10B981', fontSize: 12, fontWeight: '800', marginBottom: 3 },
  infoDesc: { color: 'rgba(255,255,255,0.7)', fontSize: 11, lineHeight: 16 },
});

const fs = StyleSheet.create({
  root: { flex: 1 },
  statusBar: {
    paddingVertical: 14, paddingHorizontal: 20,
    flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'center',
  },
  statusText: { color: '#fff', fontSize: 13, fontWeight: '900', letterSpacing: 0.8 },
  closeBtn: {
    position: 'absolute', top: 56, right: 16, zIndex: 10,
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.1)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center', justifyContent: 'center',
  },
  body: { alignItems: 'center', paddingTop: 36, paddingBottom: 40, paddingHorizontal: 24, gap: 16 },

  identCard: {
    flexDirection: 'row', alignItems: 'center', gap: 16, width: '100%', maxWidth: 420,
    backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 16, borderWidth: 1,
    padding: 16,
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
  },
  qrPlc: { alignItems: 'center', justifyContent: 'center' },

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

  instBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 14, paddingVertical: 9, borderRadius: 10, borderWidth: 1,
    width: '100%', maxWidth: 420,
  },
  instBadgeText: { color: '#10B981', fontSize: 13, fontWeight: '700' },
  hint: { color: 'rgba(255,255,255,0.35)', fontSize: 12, textAlign: 'center', fontStyle: 'italic' },
});
