import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/colors';

interface PaginationBarProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  bottomPad?: number;
}

export default function PaginationBar({ currentPage, totalPages, onPageChange, bottomPad = 0 }: PaginationBarProps) {
  if (totalPages <= 1) return null;

  const pages: (number | '…')[] = [];
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else {
    pages.push(1);
    if (currentPage > 3) pages.push('…');
    for (let i = Math.max(2, currentPage - 1); i <= Math.min(totalPages - 1, currentPage + 1); i++) pages.push(i);
    if (currentPage < totalPages - 2) pages.push('…');
    pages.push(totalPages);
  }

  return (
    <View style={[pgStyles.paginationBar, { paddingBottom: bottomPad + 8 }]}>
      <TouchableOpacity
        style={[pgStyles.pgBtn, currentPage === 1 && pgStyles.pgBtnDisabled]}
        onPress={() => onPageChange(Math.max(1, currentPage - 1))}
        disabled={currentPage === 1}
      >
        <Ionicons name="chevron-back" size={15} color={currentPage === 1 ? Colors.textMuted : Colors.gold} />
      </TouchableOpacity>

      <View style={pgStyles.pgNumbers}>
        {pages.map((p, idx) =>
          p === '…'
            ? <Text key={`ellipsis-${idx}`} style={pgStyles.pgEllipsis}>…</Text>
            : <TouchableOpacity
                key={p}
                style={[pgStyles.pgNumBtn, p === currentPage && pgStyles.pgNumBtnActive]}
                onPress={() => onPageChange(p as number)}
              >
                <Text style={[pgStyles.pgNumTxt, p === currentPage && pgStyles.pgNumTxtActive]}>{p}</Text>
              </TouchableOpacity>
        )}
      </View>

      <Text style={pgStyles.pgLabel}>Pág. <Text style={{ color: Colors.gold, fontFamily: 'Inter_700Bold' }}>{currentPage}</Text> / {totalPages}</Text>

      <TouchableOpacity
        style={[pgStyles.pgBtn, currentPage === totalPages && pgStyles.pgBtnDisabled]}
        onPress={() => onPageChange(Math.min(totalPages, currentPage + 1))}
        disabled={currentPage === totalPages}
      >
        <Ionicons name="chevron-forward" size={15} color={currentPage === totalPages ? Colors.textMuted : Colors.gold} />
      </TouchableOpacity>
    </View>
  );
}

const pgStyles = StyleSheet.create({
  paginationBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 12, paddingTop: 8, backgroundColor: Colors.backgroundCard, borderTopWidth: 1, borderTopColor: Colors.border },
  pgBtn: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.gold + '14', borderWidth: 1, borderColor: Colors.gold + '30' },
  pgBtnDisabled: { backgroundColor: Colors.surface, borderColor: Colors.border, opacity: 0.5 },
  pgNumbers: { flexDirection: 'row', alignItems: 'center', gap: 4, marginHorizontal: 4 },
  pgNumBtn: { minWidth: 26, height: 26, borderRadius: 7, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  pgNumBtnActive: { backgroundColor: Colors.gold },
  pgNumTxt: { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: Colors.textSecondary },
  pgNumTxtActive: { color: '#0D1F35', fontFamily: 'Inter_700Bold' },
  pgEllipsis: { fontSize: 12, color: Colors.textMuted, marginHorizontal: 2 },
  pgLabel: { fontSize: 11, fontFamily: 'Inter_500Medium', color: Colors.textSecondary, marginLeft: 6 },
});
