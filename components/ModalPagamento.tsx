import React, { useState } from 'react';
import {
  Modal, View, Text, StyleSheet, TouchableOpacity,
  ScrollView, Platform, Pressable,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Colors } from '@/constants/colors';
import { formatAOA } from '@/context/FinanceiroContext';

export interface DadosPagamento {
  referencia: string;
  valor: number;
  descricao: string;
  dataValidade?: string;
  // dados bancários da escola (vêm do config)
  numeroEntidade?: string;
  iban?: string;
  nomeBeneficiario?: string;
  bancoTransferencia?: string;
  telefoneMulticaixaExpress?: string;
  nib?: string;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  dados: DadosPagamento;
}

type Tab = 'entidade' | 'referencia' | 'express';

function InfoRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={[styles.infoValue, highlight && styles.infoValueHighlight]}>{value}</Text>
    </View>
  );
}

function CopyRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(value).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    } else {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <View style={styles.copyRow}>
      <View style={{ flex: 1 }}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={styles.copyValue}>{value}</Text>
      </View>
      <TouchableOpacity onPress={handleCopy} style={[styles.copyBtn, copied && styles.copyBtnDone]}>
        <Ionicons name={copied ? 'checkmark' : 'copy-outline'} size={15} color={copied ? Colors.success : Colors.textMuted} />
      </TouchableOpacity>
    </View>
  );
}

export default function ModalPagamento({ visible, onClose, dados }: Props) {
  const [tab, setTab] = useState<Tab>('entidade');

  const temEntidade = !!(dados.numeroEntidade);
  const temIBAN = !!(dados.iban);
  const temExpress = !!(dados.telefoneMulticaixaExpress);

  const defaultTab: Tab = temEntidade ? 'entidade' : temIBAN ? 'referencia' : temExpress ? 'express' : 'referencia';

  React.useEffect(() => {
    if (visible) setTab(defaultTab);
  }, [visible]);

  const validadeFormatada = dados.dataValidade
    ? (() => {
        try {
          return new Date(dados.dataValidade!).toLocaleDateString('pt-PT');
        } catch {
          return dados.dataValidade;
        }
      })()
    : undefined;

  const TABS: { key: Tab; label: string; icon: string }[] = [
    { key: 'entidade', label: 'Entidade', icon: 'barcode-outline' },
    { key: 'referencia', label: 'Referência', icon: 'receipt-outline' },
    { key: 'express', label: 'Transf. Express', icon: 'flash-outline' },
  ];

  function renderEntidade() {
    if (!temEntidade) {
      return (
        <View style={styles.emptyState}>
          <Ionicons name="barcode-outline" size={40} color={Colors.textMuted} />
          <Text style={styles.emptyText}>Número de entidade não configurado.</Text>
          <Text style={styles.emptySubText}>Configure os dados bancários nas definições da escola.</Text>
        </View>
      );
    }
    return (
      <View style={styles.tabContent}>
        <View style={styles.alertBox}>
          <Ionicons name="information-circle" size={16} color={Colors.info} />
          <Text style={styles.alertText}>
            Efectue o pagamento em qualquer caixa ATM ou Multicaixa Express usando os dados abaixo.
          </Text>
        </View>

        <View style={styles.dataCard}>
          <CopyRow label="ENTIDADE" value={dados.numeroEntidade!} />
          <View style={styles.separator} />
          <CopyRow label="REFERÊNCIA" value={dados.referencia} />
          <View style={styles.separator} />
          <InfoRow label="MONTANTE" value={formatAOA(dados.valor)} highlight />
          {validadeFormatada && (
            <>
              <View style={styles.separator} />
              <InfoRow label="VALIDADE" value={validadeFormatada} />
            </>
          )}
        </View>

        <View style={styles.stepsCard}>
          <Text style={styles.stepsTitle}>Como pagar no ATM/Multicaixa</Text>
          {[
            'Selecione "Pagamentos de Serviços"',
            `Introduza a Entidade: ${dados.numeroEntidade}`,
            `Introduza a Referência: ${dados.referencia}`,
            `Confirme o montante: ${formatAOA(dados.valor)}`,
            'Confirme o pagamento',
          ].map((step, i) => (
            <View key={i} style={styles.step}>
              <View style={styles.stepNum}>
                <Text style={styles.stepNumText}>{i + 1}</Text>
              </View>
              <Text style={styles.stepText}>{step}</Text>
            </View>
          ))}
        </View>
      </View>
    );
  }

  function renderReferencia() {
    return (
      <View style={styles.tabContent}>
        <View style={styles.alertBox}>
          <Ionicons name="information-circle" size={16} color={Colors.gold} />
          <Text style={styles.alertText}>
            Use esta referência RUPE para efectuar o pagamento no banco ou portal de pagamentos.
          </Text>
        </View>

        <View style={styles.rupeCard}>
          <Text style={styles.rupeLabel}>REFERÊNCIA RUPE</Text>
          <Text style={styles.rupeValue}>{dados.referencia}</Text>
          {validadeFormatada && (
            <Text style={styles.rupeValidade}>Válida até {validadeFormatada}</Text>
          )}
        </View>

        <View style={styles.dataCard}>
          <InfoRow label="RUBRICA" value={dados.descricao} />
          <View style={styles.separator} />
          <InfoRow label="VALOR A PAGAR" value={formatAOA(dados.valor)} highlight />
          {temIBAN && (
            <>
              <View style={styles.separator} />
              <CopyRow label="IBAN" value={dados.iban!} />
            </>
          )}
          {dados.nomeBeneficiario && (
            <>
              <View style={styles.separator} />
              <InfoRow label="BENEFICIÁRIO" value={dados.nomeBeneficiario} />
            </>
          )}
          {dados.bancoTransferencia && (
            <>
              <View style={styles.separator} />
              <InfoRow label="BANCO" value={dados.bancoTransferencia} />
            </>
          )}
          {dados.nib && (
            <>
              <View style={styles.separator} />
              <CopyRow label="NIB" value={dados.nib} />
            </>
          )}
        </View>
      </View>
    );
  }

  function renderExpress() {
    if (!temExpress) {
      return (
        <View style={styles.emptyState}>
          <Ionicons name="flash-outline" size={40} color={Colors.textMuted} />
          <Text style={styles.emptyText}>Transferência Express não configurada.</Text>
          <Text style={styles.emptySubText}>Configure o número de Multicaixa Express nas definições da escola.</Text>
        </View>
      );
    }
    return (
      <View style={styles.tabContent}>
        <View style={[styles.alertBox, { borderColor: Colors.gold + '44', backgroundColor: Colors.gold + '11' }]}>
          <Ionicons name="flash" size={16} color={Colors.gold} />
          <Text style={[styles.alertText, { color: Colors.gold }]}>
            Envie o pagamento via Multicaixa Express para o número abaixo e indique a referência como motivo.
          </Text>
        </View>

        <View style={styles.dataCard}>
          <CopyRow label="NÚMERO MULTICAIXA EXPRESS" value={dados.telefoneMulticaixaExpress!} />
          <View style={styles.separator} />
          <InfoRow label="VALOR A TRANSFERIR" value={formatAOA(dados.valor)} highlight />
          <View style={styles.separator} />
          <CopyRow label="MOTIVO / REFERÊNCIA" value={dados.referencia} />
          {dados.nomeBeneficiario && (
            <>
              <View style={styles.separator} />
              <InfoRow label="NOME DO BENEFICIÁRIO" value={dados.nomeBeneficiario} />
            </>
          )}
        </View>

        <View style={styles.stepsCard}>
          <Text style={styles.stepsTitle}>Como pagar via Multicaixa Express</Text>
          {[
            'Abra a app Multicaixa Express',
            'Selecione "Transferência"',
            `Introduza o número: ${dados.telefoneMulticaixaExpress}`,
            `Indique o valor: ${formatAOA(dados.valor)}`,
            `No campo motivo escreva: ${dados.referencia}`,
            'Confirme o pagamento',
          ].map((step, i) => (
            <View key={i} style={styles.step}>
              <View style={[styles.stepNum, { backgroundColor: Colors.gold + '22', borderColor: Colors.gold + '55' }]}>
                <Text style={[styles.stepNumText, { color: Colors.gold }]}>{i + 1}</Text>
              </View>
              <Text style={styles.stepText}>{step}</Text>
            </View>
          ))}
        </View>
      </View>
    );
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.handle} />

        <View style={styles.header}>
          <View style={styles.headerIcon}>
            <Ionicons name="card" size={20} color={Colors.gold} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>Opções de Pagamento</Text>
            <Text style={styles.headerSub} numberOfLines={1}>{dados.descricao}</Text>
          </View>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Ionicons name="close" size={20} color={Colors.textMuted} />
          </TouchableOpacity>
        </View>

        <View style={styles.tabBar}>
          {TABS.map(t => (
            <TouchableOpacity
              key={t.key}
              style={[styles.tabItem, tab === t.key && styles.tabItemActive]}
              onPress={() => setTab(t.key)}
            >
              <Ionicons
                name={t.icon as any}
                size={14}
                color={tab === t.key ? Colors.gold : Colors.textMuted}
              />
              <Text style={[styles.tabLabel, tab === t.key && styles.tabLabelActive]}>
                {t.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 40 }}
        >
          {tab === 'entidade' && renderEntidade()}
          {tab === 'referencia' && renderReferencia()}
          {tab === 'express' && renderExpress()}
        </ScrollView>

        <View style={styles.footer}>
          <TouchableOpacity style={styles.closeFullBtn} onPress={onClose}>
            <Text style={styles.closeFullText}>Fechar</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#0D1F35',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    maxHeight: '90%',
    paddingBottom: Platform.OS === 'ios' ? 24 : 0,
  },
  handle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignSelf: 'center', marginTop: 12, marginBottom: 4,
  },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 20, paddingVertical: 16,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  headerIcon: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: Colors.gold + '18',
    borderWidth: 1, borderColor: Colors.gold + '44',
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontSize: 16, fontFamily: 'Inter_700Bold', color: Colors.text },
  headerSub: { fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 1 },
  closeBtn: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center', justifyContent: 'center',
  },
  tabBar: {
    flexDirection: 'row',
    paddingHorizontal: 16, paddingVertical: 12, gap: 8,
  },
  tabItem: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 5, paddingVertical: 8, borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  tabItemActive: {
    backgroundColor: Colors.gold + '18',
    borderColor: Colors.gold + '55',
  },
  tabLabel: { fontSize: 11, fontFamily: 'Inter_600SemiBold', color: Colors.textMuted },
  tabLabelActive: { color: Colors.gold },
  tabContent: { paddingHorizontal: 16, paddingTop: 4, gap: 12 },
  alertBox: {
    flexDirection: 'row', gap: 8, alignItems: 'flex-start',
    backgroundColor: Colors.info + '11',
    borderWidth: 1, borderColor: Colors.info + '33',
    borderRadius: 10, padding: 12,
  },
  alertText: { flex: 1, fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textSecondary, lineHeight: 18 },
  dataCard: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  infoRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 12,
  },
  infoLabel: { fontSize: 11, fontFamily: 'Inter_600SemiBold', color: Colors.textMuted, letterSpacing: 0.5 },
  infoValue: { fontSize: 14, fontFamily: 'Inter_600SemiBold', color: Colors.text, textAlign: 'right', flex: 1, marginLeft: 12 },
  infoValueHighlight: { color: Colors.gold, fontSize: 16, fontFamily: 'Inter_700Bold' },
  copyRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 12, gap: 10,
  },
  copyValue: { fontSize: 15, fontFamily: 'Inter_700Bold', color: Colors.text, marginTop: 2, letterSpacing: 0.5 },
  copyBtn: {
    width: 32, height: 32, borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
  },
  copyBtnDone: { borderColor: Colors.success + '55', backgroundColor: Colors.success + '11' },
  separator: { height: 1, backgroundColor: 'rgba(255,255,255,0.06)', marginHorizontal: 14 },
  rupeCard: {
    backgroundColor: '#0A1628',
    borderRadius: 14, borderWidth: 1.5, borderColor: Colors.gold + '44',
    padding: 18, alignItems: 'center', gap: 6,
  },
  rupeLabel: { fontSize: 10, fontFamily: 'Inter_600SemiBold', color: Colors.textMuted, letterSpacing: 1.5 },
  rupeValue: {
    fontSize: 20, fontFamily: 'Inter_700Bold', color: Colors.gold,
    letterSpacing: 1.5, textAlign: 'center',
  },
  rupeValidade: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted },
  stepsCard: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
    padding: 14, gap: 10,
  },
  stepsTitle: { fontSize: 12, fontFamily: 'Inter_700Bold', color: Colors.textSecondary, marginBottom: 4 },
  step: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  stepNum: {
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: Colors.info + '22', borderWidth: 1, borderColor: Colors.info + '55',
    alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1,
  },
  stepNumText: { fontSize: 10, fontFamily: 'Inter_700Bold', color: Colors.info },
  stepText: { fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textSecondary, flex: 1, lineHeight: 20 },
  emptyState: {
    padding: 40, alignItems: 'center', gap: 12,
  },
  emptyText: { fontSize: 14, fontFamily: 'Inter_600SemiBold', color: Colors.textSecondary, textAlign: 'center' },
  emptySubText: { fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textMuted, textAlign: 'center' },
  footer: {
    paddingHorizontal: 16, paddingVertical: 12,
    borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)',
  },
  closeFullBtn: {
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: 12, paddingVertical: 14,
    alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
  },
  closeFullText: { fontSize: 14, fontFamily: 'Inter_600SemiBold', color: Colors.textSecondary },
});
