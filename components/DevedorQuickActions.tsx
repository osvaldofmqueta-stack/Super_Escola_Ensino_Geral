import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Modal, Platform, ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Colors } from '@/constants/colors';
import { useFinanceiro } from '@/context/FinanceiroContext';
import { showToast } from '@/utils/toast';
import { api } from '@/lib/api';

interface DevedorInfo {
  alunoId: string;
  nome: string;
  turma: string;
  meses: number;
  valor: number;
}

function formatV(v: number): string {
  try { return new Intl.NumberFormat('pt-PT', { maximumFractionDigits: 0 }).format(v); }
  catch { return String(Math.round(v)); }
}

export default function DevedorQuickActions({
  visible, devedor, onClose,
}: {
  visible: boolean;
  devedor: DevedorInfo | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const { bloquearAluno, desbloquearAluno, isAlunoBloqueado } = useFinanceiro();
  const [busy, setBusy] = useState<string | null>(null);

  if (!visible || !devedor) return null;

  const bloqueado = isAlunoBloqueado(devedor.alunoId);

  const handleEnviarLembrete = async () => {
    setBusy('lembrete');
    try {
      await api.post('/api/mensagens', {
        alunoId: devedor.alunoId,
        conteudo: `Caro(a) ${devedor.nome}, regista-se um montante vencido de ${formatV(devedor.valor)} Kz (${devedor.meses} ${devedor.meses === 1 ? 'mês' : 'meses'}). Por favor regularize a sua situação financeira.`,
        tipo: 'cobranca',
      });
      showToast(`Lembrete enviado a ${devedor.nome}`, 'success');
      onClose();
    } catch (err: any) {
      showToast(err?.message || 'Falha ao enviar lembrete', 'error');
    } finally { setBusy(null); }
  };

  const handleGerarRupe = () => {
    onClose();
    router.push({ pathname: '/(main)/financeiro' as any, params: { alunoId: devedor.alunoId, action: 'gerar-rupe' } } as any);
  };

  const handleVerFicha = () => {
    onClose();
    router.push({ pathname: '/(main)/aluno-perfil' as any, params: { id: devedor.alunoId } } as any);
  };

  const handleToggleBloqueio = async () => {
    setBusy('bloqueio');
    try {
      if (bloqueado) {
        await desbloquearAluno(devedor.alunoId);
        showToast(`${devedor.nome} desbloqueado`, 'success');
      } else {
        await bloquearAluno(devedor.alunoId);
        showToast(`${devedor.nome} bloqueado`, 'warning');
      }
      onClose();
    } catch (err: any) {
      showToast(err?.message || 'Operação falhou', 'error');
    } finally { setBusy(null); }
  };

  const Body = (
    <View style={styles.sheet}>
      <View style={styles.handle} />
      <View style={styles.header}>
        <View style={[styles.iconWrap, { backgroundColor: Colors.danger + '22' }]}>
          <Ionicons name="alert-circle" size={22} color={Colors.danger} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title} numberOfLines={1}>{devedor.nome}</Text>
          <Text style={styles.subtitle} numberOfLines={1}>{devedor.turma}</Text>
        </View>
        <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}>
          <Ionicons name="close" size={22} color={Colors.textMuted} />
        </TouchableOpacity>
      </View>

      <View style={styles.statsRow}>
        <View style={[styles.statBox, { borderColor: Colors.danger + '44', backgroundColor: Colors.danger + '0C' }]}>
          <Text style={styles.statLabel}>DÍVIDA TOTAL</Text>
          <Text style={[styles.statValue, { color: Colors.danger }]}>{formatV(devedor.valor)} Kz</Text>
        </View>
        <View style={[styles.statBox, { borderColor: Colors.warning + '44', backgroundColor: Colors.warning + '0C' }]}>
          <Text style={styles.statLabel}>MESES VENCIDOS</Text>
          <Text style={[styles.statValue, { color: Colors.warning }]}>{devedor.meses}</Text>
        </View>
      </View>

      {bloqueado && (
        <View style={styles.bloqueadoTag}>
          <Ionicons name="lock-closed" size={12} color={Colors.danger} />
          <Text style={styles.bloqueadoTagText}>Acesso bloqueado</Text>
        </View>
      )}

      <ScrollView style={{ maxHeight: 320 }}>
        <TouchableOpacity
          style={[styles.actionRow, busy === 'lembrete' && styles.actionRowBusy]}
          onPress={handleEnviarLembrete}
          disabled={!!busy}
          activeOpacity={0.75}
        >
          <View style={[styles.actionIcon, { backgroundColor: '#2980B9' + '22' }]}>
            <Ionicons name="mail" size={18} color="#2980B9" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.actionTitle}>Enviar lembrete</Text>
            <Text style={styles.actionSub}>Mensagem automática de cobrança</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionRow} onPress={handleGerarRupe} disabled={!!busy} activeOpacity={0.75}>
          <View style={[styles.actionIcon, { backgroundColor: Colors.gold + '22' }]}>
            <Ionicons name="document-text" size={18} color={Colors.gold} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.actionTitle}>Gerar RUPE</Text>
            <Text style={styles.actionSub}>Referência bancária para pagamento</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionRow} onPress={handleVerFicha} disabled={!!busy} activeOpacity={0.75}>
          <View style={[styles.actionIcon, { backgroundColor: Colors.success + '22' }]}>
            <Ionicons name="person" size={18} color={Colors.success} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.actionTitle}>Ver ficha completa</Text>
            <Text style={styles.actionSub}>Histórico financeiro e académico</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
        </TouchableOpacity>

        <View style={styles.divider} />

        <TouchableOpacity
          style={[
            styles.actionRow,
            { backgroundColor: bloqueado ? Colors.success + '0C' : Colors.danger + '0C' },
            busy === 'bloqueio' && styles.actionRowBusy,
          ]}
          onPress={handleToggleBloqueio}
          disabled={!!busy}
          activeOpacity={0.75}
        >
          <View style={[styles.actionIcon, { backgroundColor: (bloqueado ? Colors.success : Colors.danger) + '22' }]}>
            <Ionicons name={bloqueado ? 'lock-open' : 'lock-closed'} size={18} color={bloqueado ? Colors.success : Colors.danger} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.actionTitle, { color: bloqueado ? Colors.success : Colors.danger }]}>
              {bloqueado ? 'Desbloquear acesso' : 'Bloquear acesso'}
            </Text>
            <Text style={styles.actionSub}>
              {bloqueado ? 'Restaurar acesso ao portal do aluno' : 'Suspende o acesso ao portal do aluno'}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
        </TouchableOpacity>
      </ScrollView>
    </View>
  );

  if (Platform.OS === 'web') {
    return (
      <View style={styles.webOverlay as any}>
        <TouchableOpacity style={styles.webBackdrop as any} activeOpacity={1} onPress={onClose} />
        <View style={styles.webCenter as any}>{Body}</View>
      </View>
    );
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={onClose} />
        {Body}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  webOverlay: {
    position: 'fixed' as any, top: 0, left: 0, right: 0, bottom: 0,
    zIndex: 99999, justifyContent: 'center', alignItems: 'center',
  },
  webBackdrop: {
    position: 'absolute' as any, top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(4,10,28,0.6)',
  },
  webCenter: {
    width: '90%', maxWidth: 460,
  },
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(4,10,28,0.6)', justifyContent: 'flex-end',
  },
  modalBackdrop: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
  },
  sheet: {
    backgroundColor: Colors.background, borderRadius: 24, paddingBottom: 18,
    borderWidth: 1, borderColor: Colors.border,
    shadowColor: '#000', shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.4, shadowRadius: 24,
    elevation: 20, overflow: 'hidden',
  },
  handle: {
    alignSelf: 'center', width: 40, height: 4, borderRadius: 2,
    backgroundColor: Colors.border, marginTop: 8, marginBottom: 8,
  },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, paddingBottom: 12,
  },
  iconWrap: {
    width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
  },
  title: { fontSize: 16, fontFamily: 'Inter_700Bold', color: Colors.text },
  subtitle: { fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 1 },
  statsRow: {
    flexDirection: 'row', gap: 10, paddingHorizontal: 16, marginBottom: 14,
  },
  statBox: {
    flex: 1, borderWidth: 1, borderRadius: 12, padding: 12,
  },
  statLabel: {
    fontSize: 9, fontFamily: 'Inter_700Bold', color: Colors.textMuted, letterSpacing: 0.6, marginBottom: 4,
  },
  statValue: { fontSize: 18, fontFamily: 'Inter_700Bold' },
  bloqueadoTag: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    alignSelf: 'flex-start', marginHorizontal: 16, marginBottom: 10,
    paddingHorizontal: 8, paddingVertical: 4,
    backgroundColor: Colors.danger + '15', borderRadius: 999,
    borderWidth: 1, borderColor: Colors.danger + '44',
  },
  bloqueadoTagText: {
    fontSize: 10, fontFamily: 'Inter_700Bold', color: Colors.danger, letterSpacing: 0.5,
  },
  actionRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 12,
    borderTopWidth: 1, borderTopColor: Colors.border + '66',
  },
  actionRowBusy: { opacity: 0.5 },
  actionIcon: {
    width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center',
  },
  actionTitle: { fontSize: 14, fontFamily: 'Inter_600SemiBold', color: Colors.text },
  actionSub: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 1 },
  divider: { height: 6 },
});
