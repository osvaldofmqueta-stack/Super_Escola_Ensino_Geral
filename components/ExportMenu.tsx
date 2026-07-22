import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Modal, StyleSheet, Platform } from 'react-native';
import AppLoader from '@/components/AppLoader';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Colors } from '@/constants/colors';
import { exportToExcel, exportToPDF, ExportColumn, ExportSchoolInfo } from '@/lib/exportUtils';

interface ExportMenuProps {
  title: string;
  columns: ExportColumn[];
  rows: Record<string, any>[];
  school?: ExportSchoolInfo;
  filename?: string;
  subtitle?: string;
  landscape?: boolean;
  buttonStyle?: 'icon' | 'full';
  iconColor?: string;
}

export default function ExportMenu({
  title,
  columns,
  rows,
  school,
  filename,
  subtitle,
  landscape,
  buttonStyle = 'icon',
  iconColor,
}: ExportMenuProps) {
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState<'excel' | 'pdf' | null>(null);

  if (Platform.OS !== 'web') return null;

  async function handleExcel() {
    setLoading('excel');
    try {
      exportToExcel(title, columns, rows, filename, school);
    } finally {
      setLoading(null);
      setVisible(false);
    }
  }

  async function handlePDF() {
    setLoading('pdf');
    try {
      exportToPDF(title, columns, rows, school, { landscape, subtitle });
    } finally {
      setLoading(null);
      setVisible(false);
    }
  }

  return (
    <>
      {buttonStyle === 'full' ? (
        <TouchableOpacity style={styles.fullButton} onPress={() => setVisible(true)} activeOpacity={0.75}>
          <Ionicons name="download-outline" size={16} color="#fff" />
          <Text style={styles.fullButtonText}>Exportar</Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity style={styles.iconButton} onPress={() => setVisible(true)} activeOpacity={0.7}>
          <Ionicons name="download-outline" size={20} color={iconColor ?? Colors.gold} />
        </TouchableOpacity>
      )}

      <Modal
        visible={visible}
        transparent
        animationType="fade"
        onRequestClose={() => setVisible(false)}
      >
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={() => setVisible(false)}>
          <View style={styles.sheet} onStartShouldSetResponder={() => true}>
            <View style={styles.sheetHandle} />

            <View style={styles.sheetHeader}>
              <View style={styles.sheetIconWrap}>
                <Ionicons name="download-outline" size={22} color={Colors.gold} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.sheetTitle}>Exportar Lista</Text>
                <Text style={styles.sheetSubtitle}>{title} — {rows.length} registos</Text>
              </View>
              <TouchableOpacity onPress={() => setVisible(false)}>
                <Ionicons name="close" size={20} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <View style={styles.divider} />

            <TouchableOpacity style={styles.option} onPress={handleExcel} activeOpacity={0.75} disabled={loading !== null}>
              <View style={[styles.optionIcon, { backgroundColor: '#1D6F42' + '22' }]}>
                {loading === 'excel'
                  ? <AppLoader size="small" color="#1D6F42" />
                  : <MaterialCommunityIcons name="microsoft-excel" size={22} color="#1D6F42" />
                }
              </View>
              <View style={styles.optionText}>
                <Text style={styles.optionTitle}>Exportar Excel (.xlsx)</Text>
                <Text style={styles.optionDesc}>Abre no Microsoft Excel ou Google Sheets</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
            </TouchableOpacity>

            <TouchableOpacity style={styles.option} onPress={handlePDF} activeOpacity={0.75} disabled={loading !== null}>
              <View style={[styles.optionIcon, { backgroundColor: Colors.danger + '22' }]}>
                {loading === 'pdf'
                  ? <AppLoader size="small" color={Colors.danger} />
                  : <MaterialCommunityIcons name="file-pdf-box" size={22} color={Colors.danger} />
                }
              </View>
              <View style={styles.optionText}>
                <Text style={styles.optionTitle}>Exportar PDF</Text>
                <Text style={styles.optionDesc}>Imprime ou guarda como PDF (A4)</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
            </TouchableOpacity>

            <View style={styles.footer}>
              <Ionicons name="information-circle-outline" size={13} color={Colors.textMuted} />
              <Text style={styles.footerText}>Os dados exportados reflectem os filtros actuais aplicados à lista.</Text>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: Colors.gold + '18',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.gold + '40',
  },
  fullButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.gold + '22',
    borderWidth: 1,
    borderColor: Colors.gold + '55',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  fullButtonText: {
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
    color: Colors.gold,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sheet: {
    backgroundColor: Colors.backgroundCard,
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingBottom: 24,
    paddingTop: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    width: '100%',
    maxWidth: 480,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.border,
    alignSelf: 'center',
    marginBottom: 16,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 14,
  },
  sheetIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: Colors.gold + '18',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.gold + '40',
  },
  sheetTitle: {
    fontSize: 15,
    fontFamily: 'Inter_700Bold',
    color: Colors.text,
  },
  sheetSubtitle: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    color: Colors.textSecondary,
    marginTop: 1,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.border,
    marginBottom: 12,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  optionIcon: {
    width: 44,
    height: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionText: {
    flex: 1,
  },
  optionTitle: {
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
    color: Colors.text,
  },
  optionDesc: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    color: Colors.textSecondary,
    marginTop: 2,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    marginTop: 14,
    paddingHorizontal: 2,
  },
  footerText: {
    flex: 1,
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
    color: Colors.textMuted,
    lineHeight: 16,
  },
});
