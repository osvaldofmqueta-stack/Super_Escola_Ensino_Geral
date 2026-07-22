import React, { useEffect, useMemo, useRef } from 'react';
import { Modal, View, Text, Pressable, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors as COLORS } from '@/constants/colors';

interface Props {
  visible: boolean;
  html: string;
  trimestre: number;
  anoLetivo: string;
  turmaNome?: string;
  onClose: () => void;
  onPrinted?: () => void;
}

export default function PautaFinalPreviewModal({ visible, html, trimestre, anoLetivo, turmaNome, onClose, onPrinted }: Props) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  // Use a blob URL so the iframe can be printed correctly across browsers
  const blobUrl = useMemo(() => {
    if (!visible || Platform.OS !== 'web' || !html) return '';
    try {
      const blob = new Blob([html], { type: 'text/html' });
      return URL.createObjectURL(blob);
    } catch {
      return '';
    }
  }, [visible, html]);

  useEffect(() => {
    return () => {
      if (blobUrl) {
        try { URL.revokeObjectURL(blobUrl); } catch {}
      }
    };
  }, [blobUrl]);

  const handlePrint = () => {
    if (Platform.OS !== 'web') return;
    try {
      const iframe = iframeRef.current;
      if (iframe?.contentWindow) {
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
        onPrinted?.();
        return;
      }
    } catch {}
    // Fallback: open in new window and print
    const win = window.open('', '_blank');
    if (win) {
      win.document.write(html);
      win.document.close();
      setTimeout(() => { try { win.focus(); win.print(); } catch {} }, 300);
      onPrinted?.();
    }
  };

  const handleOpenNewTab = () => {
    if (Platform.OS !== 'web') return;
    const win = window.open('', '_blank');
    if (win) { win.document.write(html); win.document.close(); onPrinted?.(); }
  };

  if (Platform.OS !== 'web') {
    return null;
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.modal}>
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Pré-visualização — Pauta Final{turmaNome ? ` — Turma ${turmaNome}` : ''}</Text>
              <Text style={styles.subtitle}>{trimestre}º Trimestre · {anoLetivo}</Text>
            </View>
            <Pressable onPress={onClose} style={styles.closeBtn} hitSlop={8}>
              <Ionicons name="close" size={22} color={COLORS.text} />
            </Pressable>
          </View>

          <View style={styles.previewArea}>
            {blobUrl ? (
              // @ts-expect-error react-native-web supports DOM iframe
              <iframe
                ref={iframeRef as any}
                src={blobUrl}
                title="Pauta Final"
                style={{
                  width: '100%',
                  height: '100%',
                  border: 'none',
                  background: '#fff',
                }}
              />
            ) : (
              <View style={styles.loading}>
                <Text style={styles.loadingText}>A preparar pré-visualização…</Text>
              </View>
            )}
          </View>

          <View style={styles.footer}>
            <Text style={styles.hint}>
              Confirma o aspecto antes de imprimir — só gasta papel se carregares em "Imprimir".
            </Text>
            <View style={styles.actions}>
              <Pressable onPress={onClose} style={[styles.btn, styles.btnGhost]}>
                <Ionicons name="close-circle-outline" size={18} color={COLORS.text} />
                <Text style={styles.btnGhostText}>Fechar</Text>
              </Pressable>
              <Pressable onPress={handleOpenNewTab} style={[styles.btn, styles.btnSecondary]}>
                <Ionicons name="open-outline" size={18} color="#fff" />
                <Text style={styles.btnSecondaryText}>Abrir em nova aba</Text>
              </Pressable>
              <Pressable onPress={handlePrint} style={[styles.btn, styles.btnPrimary]}>
                <Ionicons name="print" size={18} color="#fff" />
                <Text style={styles.btnPrimaryText}>Imprimir / Guardar PDF</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(5, 12, 24, 0.75)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  modal: {
    width: '100%',
    maxWidth: 1200,
    height: '92%',
    backgroundColor: COLORS.backgroundCard,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
    flexDirection: 'column',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor: COLORS.cardAlt,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
  },
  subtitle: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  closeBtn: {
    padding: 6,
    borderRadius: 8,
  },
  previewArea: {
    flex: 1,
    backgroundColor: '#1a2840',
    padding: 12,
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    color: COLORS.textMuted,
    fontSize: 13,
  },
  footer: {
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    backgroundColor: COLORS.cardAlt,
    gap: 10,
  },
  hint: {
    fontSize: 11.5,
    color: COLORS.textMuted,
    fontStyle: 'italic',
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'flex-end',
  },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  btnGhost: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  btnGhostText: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: '600',
  },
  btnSecondary: {
    backgroundColor: '#3a5070',
  },
  btnSecondaryText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  btnPrimary: {
    backgroundColor: COLORS.primary,
  },
  btnPrimaryText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
});
