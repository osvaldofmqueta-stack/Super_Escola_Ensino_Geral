import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/colors';
import { CalendarModal } from './DatePickerField';

function parseIso(v: string): { y: number; m: number; d: number } | null {
  if (!v) return null;
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return { y: +m[1], m: +m[2] - 1, d: +m[3] };
  return null;
}

function toDisplay(iso: string): string {
  const p = parseIso(iso);
  if (!p) return '';
  return `${String(p.d).padStart(2, '0')}/${String(p.m + 1).padStart(2, '0')}/${p.y}`;
}

interface DateInputProps {
  value: string;
  onChangeText: (v: string) => void;
  style?: any;
  placeholderTextColor?: string;
  placeholder?: string;
  label?: string;
}

export default function DateInput({
  value,
  onChangeText,
  style,
  placeholderTextColor,
  placeholder = 'DD/MM/AAAA',
  label,
}: DateInputProps) {
  const [open, setOpen] = useState(false);
  const displayText = toDisplay(value);

  return (
    <>
      <TouchableOpacity
        style={[di.wrap, style]}
        onPress={() => setOpen(true)}
        activeOpacity={0.75}
      >
        <Ionicons
          name="calendar-outline"
          size={15}
          color={displayText ? Colors.gold : Colors.textMuted}
          style={di.icon}
        />
        <Text style={[di.text, !displayText && { color: placeholderTextColor ?? Colors.textMuted }]} numberOfLines={1}>
          {displayText || placeholder}
        </Text>
        {displayText ? (
          <TouchableOpacity
            onPress={() => onChangeText('')}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="close-circle" size={15} color={Colors.textMuted} />
          </TouchableOpacity>
        ) : (
          <Ionicons name="chevron-down" size={13} color={Colors.textMuted} />
        )}
      </TouchableOpacity>

      <CalendarModal
        visible={open}
        value={value}
        label={label}
        onSelect={v => { onChangeText(v); setOpen(false); }}
        onClear={() => onChangeText('')}
        onClose={() => setOpen(false)}
      />
    </>
  );
}

const di = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  icon: { flexShrink: 0 },
  text: {
    flex: 1,
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    color: Colors.text,
  },
});
