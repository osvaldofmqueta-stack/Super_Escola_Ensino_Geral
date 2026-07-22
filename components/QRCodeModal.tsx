import React from 'react';
import {
  View, Text, StyleSheet, Modal, TouchableOpacity, Platform, Dimensions, Alert
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import QRCode from 'react-native-qrcode-svg';
import { Colors } from '@/constants/colors';

interface QRCodeModalProps {
  visible: boolean;
  onClose: () => void;
  data: string;
  title: string;
  subtitle?: string;
  schoolName?: string;
}

function buildCartaoHTML(data: string, title: string, subtitle: string, schoolName: string): string {
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(data)}&bgcolor=ffffff&color=0a1828&margin=6&ecc=M`;
  return `<!DOCTYPE html><html lang="pt"><head>
<meta charset="UTF-8">
<title>Cartão QR — ${title}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; background: #f0f2f5; display: flex; flex-direction: column; align-items: center; padding: 32px 16px; min-height: 100vh; }
  .print-btn { display: inline-flex; align-items: center; gap: 8px; margin-bottom: 24px; padding: 12px 28px; background: #1a2540; color: #fff; border: none; border-radius: 8px; font-size: 14px; font-weight: bold; cursor: pointer; box-shadow: 0 4px 12px rgba(0,0,0,0.2); }
  .print-btn:hover { background: #263354; }
  .cards-grid { display: flex; flex-wrap: wrap; gap: 16px; justify-content: center; max-width: 900px; }
  .card { background: #fff; border-radius: 12px; border: 1px solid #dde; width: 220px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1); page-break-inside: avoid; }
  .card-header { background: linear-gradient(135deg, #0a1828 0%, #1a2f4a 100%); padding: 10px 12px; text-align: center; }
  .school-name { color: #f5c842; font-size: 9px; font-weight: bold; text-transform: uppercase; letter-spacing: 1px; }
  .card-title { color: #fff; font-size: 11px; margin-top: 2px; }
  .card-body { padding: 12px; display: flex; flex-direction: column; align-items: center; gap: 8px; }
  .qr-wrap { background: #fff; border: 2px solid #e5e7eb; border-radius: 8px; padding: 8px; }
  .qr-wrap img { display: block; width: 140px; height: 140px; }
  .student-name { font-size: 12px; font-weight: bold; color: #0a1828; text-align: center; line-height: 1.4; }
  .student-num { font-size: 11px; color: #6b7280; text-align: center; margin-top: 2px; }
  .instruction { font-size: 8px; color: #9ca3af; text-align: center; margin-top: 4px; line-height: 1.4; border-top: 1px dashed #e5e7eb; padding-top: 8px; width: 100%; }
  @media print {
    body { background: #fff; padding: 8mm; }
    .print-btn { display: none !important; }
    .cards-grid { gap: 8mm; }
    .card { box-shadow: none; border: 1px solid #ccc; width: 55mm; }
    .qr-wrap img { width: 35mm; height: 35mm; }
    @page { size: A4 portrait; margin: 8mm; }
  }
</style>
</head><body>
<button class="print-btn" onclick="window.print()">🖨️ Imprimir / Guardar PDF</button>
<div class="cards-grid">
  <div class="card">
    <div class="card-header">
      <div class="school-name">${schoolName}</div>
      <div class="card-title">Cartão de Presença</div>
    </div>
    <div class="card-body">
      <div class="qr-wrap">
        <img src="${qrUrl}" alt="QR Code" />
      </div>
      <div class="student-name">${title}</div>
      <div class="student-num">Nº ${subtitle || '—'}</div>
      <div class="instruction">Aponte a câmara do professor para este QR Code para confirmar presença</div>
    </div>
  </div>
</div>
</body></html>`;
}

export default function QRCodeModal({ visible, onClose, data, title, subtitle, schoolName }: QRCodeModalProps) {
  const size = Math.min(Dimensions.get('window').width * 0.6, 220);

  function handleImprimir() {
    if (Platform.OS !== 'web') {
      Alert.alert('Impressão', 'A impressão do cartão está disponível apenas na versão Web/Desktop. Aceda pelo browser para imprimir.');
      return;
    }
    const html = buildCartaoHTML(data, title, subtitle || '', schoolName || 'SIGA');
    const win = (window as any).open('', '_blank', 'width=800,height=600');
    if (win) {
      win.document.write(html);
      win.document.close();
    }
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.container}>
          <View style={styles.header}>
            <Text style={styles.title}>{title}</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={22} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>
          {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}

          <View style={styles.qrWrapper}>
            <QRCode
              value={data || 'SIGA-V3'}
              size={size}
              color={Colors.primaryDark}
              backgroundColor="white"
            />
          </View>

          <View style={styles.dataRow}>
            <Ionicons name="qr-code-outline" size={14} color={Colors.textMuted} />
            <Text style={styles.dataText} numberOfLines={1}>{data}</Text>
          </View>

          {/* Botão Imprimir — gera cartão A4 para papel */}
          <TouchableOpacity style={styles.printButton} onPress={handleImprimir}>
            <Ionicons name="print-outline" size={17} color={Colors.gold} />
            <Text style={styles.printButtonText}>Imprimir Cartão para Papel</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <Text style={styles.closeButtonText}>Fechar</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    width: '100%',
    maxWidth: 480,
    backgroundColor: Colors.backgroundCard,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 24,
    paddingBottom: 24,
    alignItems: 'center',
    gap: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
  },
  title: {
    fontSize: 18,
    fontFamily: 'Inter_700Bold',
    color: Colors.text,
  },
  closeBtn: {
    padding: 4,
  },
  subtitle: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    color: Colors.textSecondary,
    alignSelf: 'flex-start',
  },
  qrWrapper: {
    padding: 16,
    backgroundColor: 'white',
    borderRadius: 16,
    marginVertical: 8,
  },
  dataRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.surface,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    width: '100%',
  },
  dataText: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    color: Colors.textSecondary,
    flex: 1,
  },
  printButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    width: '100%',
    paddingVertical: 13,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: Colors.gold + '66',
    backgroundColor: Colors.gold + '12',
  },
  printButtonText: {
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
    color: Colors.gold,
  },
  closeButton: {
    backgroundColor: Colors.accent,
    paddingVertical: 14,
    paddingHorizontal: 40,
    borderRadius: 14,
    width: '100%',
    alignItems: 'center',
  },
  closeButtonText: {
    fontSize: 15,
    fontFamily: 'Inter_600SemiBold',
    color: Colors.text,
  },
});
