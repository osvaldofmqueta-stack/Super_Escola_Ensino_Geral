import React, { useState } from 'react';
import {
  View, Text, StyleSheet, Platform, Modal,
  TouchableOpacity, FlatList,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/colors';

interface SelectFieldProps {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
  style?: any;
  labelStyle?: any;
}

export default function SelectField({
  label,
  value,
  options,
  onChange,
  placeholder = 'Seleccionar',
  required,
  style,
  labelStyle,
}: SelectFieldProps) {
  const [modalVisible, setModalVisible] = useState(false);

  if (Platform.OS === 'web') {
    return (
      <View style={[styles.group, style]}>
        <View style={styles.labelRow}>
          <Text style={[styles.label, labelStyle]}>{label}</Text>
          {required && <Text style={styles.required}>*</Text>}
        </View>
        <div style={{ position: 'relative', display: 'block' }}>
          <View style={[styles.inputWrap, { pointerEvents: 'none' } as any]}>
            <Text style={[styles.displayText, !value && styles.placeholder]}>
              {value || placeholder}
            </Text>
            <Ionicons name="chevron-down" size={14} color={Colors.textMuted} />
          </View>
          <select
            value={value || ''}
            onChange={e => onChange(e.target.value)}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              opacity: 0,
              cursor: 'pointer',
              border: 'none',
              zIndex: 2,
            }}
          >
            <option value="" disabled>{placeholder}</option>
            {options.map(opt => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        </div>
      </View>
    );
  }

  return (
    <View style={[styles.group, style]}>
      <View style={styles.labelRow}>
        <Text style={[styles.label, labelStyle]}>{label}</Text>
        {required && <Text style={styles.required}>*</Text>}
      </View>
      <TouchableOpacity style={styles.inputWrap} onPress={() => setModalVisible(true)} activeOpacity={0.75}>
        <Text style={[styles.displayText, !value && styles.placeholder]}>
          {value || placeholder}
        </Text>
        <Ionicons name="chevron-down" size={14} color={Colors.textMuted} />
      </TouchableOpacity>

      <Modal visible={modalVisible} transparent animationType="slide" onRequestClose={() => setModalVisible(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setModalVisible(false)}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>{label}</Text>
            <FlatList
              data={options}
              keyExtractor={item => item}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.modalOption, item === value && styles.modalOptionActive]}
                  onPress={() => { onChange(item); setModalVisible(false); }}
                >
                  <Text style={[styles.modalOptionText, item === value && styles.modalOptionTextActive]}>
                    {item}
                  </Text>
                  {item === value && <Ionicons name="checkmark" size={16} color={Colors.accent} />}
                </TouchableOpacity>
              )}
            />
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  group: { marginBottom: 14 },
  labelRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6, gap: 3 },
  label: { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: Colors.textSecondary },
  required: { fontSize: 12, color: Colors.accent, fontFamily: 'Inter_600SemiBold' },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  displayText: {
    flex: 1,
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    color: Colors.text,
  },
  placeholder: { color: Colors.textMuted },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalSheet: {
    backgroundColor: Colors.backgroundCard,
    borderRadius: 20,
    padding: 16,
    maxHeight: '70%',
    width: '100%',
    maxWidth: 480,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  modalHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.border,
    alignSelf: 'center',
    marginBottom: 14,
  },
  modalTitle: {
    fontSize: 15,
    fontFamily: 'Inter_700Bold',
    color: Colors.text,
    marginBottom: 12,
  },
  modalOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 13,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  modalOptionActive: { backgroundColor: 'rgba(204,26,26,0.06)', borderRadius: 8, paddingHorizontal: 8 },
  modalOptionText: { fontSize: 14, fontFamily: 'Inter_400Regular', color: Colors.text },
  modalOptionTextActive: { fontFamily: 'Inter_600SemiBold', color: Colors.accent },
});
