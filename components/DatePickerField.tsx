import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, Modal, ScrollView,
  StyleSheet, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/colors';

const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];
const DAY_NAMES = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

function parseIso(v: string): { y: number; m: number; d: number } | null {
  if (!v) return null;
  const match = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) return { y: +match[1], m: +match[2] - 1, d: +match[3] };
  return null;
}

function toIso(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function toDisplay(iso: string): string {
  const p = parseIso(iso);
  if (!p) return '';
  return `${String(p.d).padStart(2, '0')}/${String(p.m + 1).padStart(2, '0')}/${p.y}`;
}

function daysInMonth(y: number, m: number): number {
  return new Date(y, m + 1, 0).getDate();
}

function firstWeekday(y: number, m: number): number {
  return new Date(y, m, 1).getDay();
}

// ─── Shared Calendar Modal ──────────────────────────────────────────────────

export interface CalendarModalProps {
  visible: boolean;
  value: string;
  label?: string;
  onSelect: (iso: string) => void;
  onClear?: () => void;
  onClose: () => void;
}

export function CalendarModal({ visible, value, label, onSelect, onClear, onClose }: CalendarModalProps) {
  const today = new Date();
  const todayY = today.getFullYear();
  const todayM = today.getMonth();
  const todayD = today.getDate();

  const [viewY, setViewY] = useState(todayY);
  const [viewM, setViewM] = useState(todayM);
  const [selY, setSelY] = useState<number | null>(null);
  const [selM, setSelM] = useState<number | null>(null);
  const [selD, setSelD] = useState<number | null>(null);
  const [showYears, setShowYears] = useState(false);
  const yearScrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (!visible) return;
    const p = parseIso(value);
    const iy = p ? p.y : todayY;
    const im = p ? p.m : todayM;
    setViewY(iy);
    setViewM(im);
    setSelY(p ? p.y : null);
    setSelM(p ? p.m : null);
    setSelD(p ? p.d : null);
    setShowYears(false);
    setTimeout(() => {
      yearScrollRef.current?.scrollTo({ y: Math.max(0, (iy - (todayY - 100) - 3) * 44), animated: false });
    }, 100);
  }, [visible]);

  function prevMonth() {
    if (viewM === 0) { setViewM(11); setViewY(y => y - 1); }
    else setViewM(m => m - 1);
  }
  function nextMonth() {
    if (viewM === 11) { setViewM(0); setViewY(y => y + 1); }
    else setViewM(m => m + 1);
  }

  function handleDay(d: number) {
    setSelY(viewY); setSelM(viewM); setSelD(d);
  }

  function handleConfirm() {
    if (selY !== null && selM !== null && selD !== null) {
      onSelect(toIso(selY, selM, selD));
    }
    onClose();
  }

  function handleToday() {
    setViewY(todayY); setViewM(todayM);
    setSelY(todayY); setSelM(todayM); setSelD(todayD);
  }

  function handleClear() {
    onClear?.();
    onClose();
  }

  const count = daysInMonth(viewY, viewM);
  const firstDay = firstWeekday(viewY, viewM);
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= count; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const years: number[] = [];
  for (let y = todayY - 100; y <= todayY + 10; y++) years.push(y);

  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={onClose} statusBarTranslucent>
      <TouchableOpacity style={cal.backdrop} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} style={cal.panelWrap} onPress={() => {}}>
          <View style={cal.panel}>

            {/* ── Header ── */}
            <View style={cal.header}>
              {label ? <Text style={cal.headerLabel}>{label}</Text> : null}
              <View style={cal.navRow}>
                <TouchableOpacity style={cal.navBtn} onPress={prevMonth}>
                  <Ionicons name="chevron-back" size={22} color={Colors.accent} />
                </TouchableOpacity>
                <TouchableOpacity style={cal.monthYearBtn} onPress={() => setShowYears(v => !v)}>
                  <Text style={cal.monthYearText}>{MONTH_NAMES[viewM]} {viewY}</Text>
                  <Ionicons name={showYears ? 'chevron-up' : 'chevron-down'} size={14} color={Colors.textSecondary} />
                </TouchableOpacity>
                <TouchableOpacity style={cal.navBtn} onPress={nextMonth}>
                  <Ionicons name="chevron-forward" size={22} color={Colors.accent} />
                </TouchableOpacity>
              </View>
            </View>

            {showYears ? (
              /* ── Year picker ── */
              <ScrollView
                ref={yearScrollRef}
                style={cal.yearList}
                showsVerticalScrollIndicator={false}
              >
                {years.map(y => {
                  const isSelected = y === viewY;
                  return (
                    <TouchableOpacity
                      key={y}
                      style={[cal.yearItem, isSelected && cal.yearItemSel]}
                      onPress={() => { setViewY(y); setShowYears(false); }}
                    >
                      <Text style={[cal.yearItemText, isSelected && cal.yearItemSelText]}>{y}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            ) : (
              <>
                {/* ── Day names ── */}
                <View style={cal.dayNamesRow}>
                  {DAY_NAMES.map(d => (
                    <Text key={d} style={cal.dayName}>{d}</Text>
                  ))}
                </View>

                {/* ── Grid ── */}
                <View style={cal.grid}>
                  {cells.map((day, i) => {
                    const isSel = day !== null && day === selD && viewM === selM && viewY === selY;
                    const isToday = day !== null && day === todayD && viewM === todayM && viewY === todayY;
                    return (
                      <TouchableOpacity
                        key={i}
                        style={[cal.cell, isSel && cal.cellSel, isToday && !isSel && cal.cellToday]}
                        onPress={() => day && handleDay(day)}
                        disabled={!day}
                        activeOpacity={day ? 0.7 : 1}
                      >
                        <Text style={[
                          cal.cellText,
                          !day && cal.cellEmpty,
                          isToday && !isSel && cal.cellTodayText,
                          isSel && cal.cellSelText,
                        ]}>
                          {day || ''}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </>
            )}

            {/* ── Footer ── */}
            <View style={cal.footer}>
              <TouchableOpacity style={cal.footBtnGhost} onPress={handleClear}>
                <Text style={cal.footBtnGhostText}>Limpar</Text>
              </TouchableOpacity>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity style={cal.footBtnGhost} onPress={handleToday}>
                  <Ionicons name="today-outline" size={14} color={Colors.gold} />
                  <Text style={[cal.footBtnGhostText, { color: Colors.gold }]}>Hoje</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[cal.footBtn, selD === null && cal.footBtnDis]}
                  onPress={handleConfirm}
                  disabled={selD === null}
                >
                  <Text style={cal.footBtnText}>OK</Text>
                </TouchableOpacity>
              </View>
            </View>

          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

// ─── Calendar styles ────────────────────────────────────────────────────────

const CELL_SIZE = 40;

const cal = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  panelWrap: {
    width: 320,
    maxWidth: '95%' as any,
  },
  panel: {
    backgroundColor: Colors.backgroundCard,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    overflow: 'hidden',
    ...(Platform.OS === 'web' ? {
      boxShadow: '0 24px 60px rgba(0,0,0,0.6)',
    } as any : {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 12 },
      shadowOpacity: 0.5,
      shadowRadius: 24,
      elevation: 24,
    }),
  },
  header: {
    backgroundColor: Colors.backgroundElevated,
    paddingTop: 16,
    paddingBottom: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerLabel: {
    fontSize: 11,
    fontFamily: 'Inter_600SemiBold',
    color: Colors.textMuted,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  navBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.accent + '18',
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthYearBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: Colors.surface + '60',
  },
  monthYearText: {
    fontSize: 16,
    fontFamily: 'Inter_700Bold',
    color: Colors.text,
  },
  yearList: {
    height: 220,
    marginHorizontal: 16,
    marginVertical: 8,
  },
  yearItem: {
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 10,
  },
  yearItemSel: {
    backgroundColor: Colors.accent,
  },
  yearItemText: {
    fontSize: 16,
    fontFamily: 'Inter_400Regular',
    color: Colors.textSecondary,
  },
  yearItemSelText: {
    color: '#fff',
    fontFamily: 'Inter_700Bold',
  },
  dayNamesRow: {
    flexDirection: 'row',
    paddingHorizontal: 10,
    paddingTop: 12,
    paddingBottom: 4,
  },
  dayName: {
    width: CELL_SIZE,
    textAlign: 'center',
    fontSize: 11,
    fontFamily: 'Inter_600SemiBold',
    color: Colors.textMuted,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 10,
    paddingBottom: 8,
  },
  cell: {
    width: CELL_SIZE,
    height: CELL_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: CELL_SIZE / 2,
  },
  cellSel: {
    backgroundColor: Colors.accent,
  },
  cellToday: {
    borderWidth: 1.5,
    borderColor: Colors.gold,
  },
  cellText: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    color: Colors.text,
  },
  cellEmpty: {
    color: 'transparent',
  },
  cellSelText: {
    color: '#fff',
    fontFamily: 'Inter_700Bold',
  },
  cellTodayText: {
    color: Colors.gold,
    fontFamily: 'Inter_600SemiBold',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    backgroundColor: Colors.backgroundElevated,
  },
  footBtnGhost: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  footBtnGhostText: {
    fontSize: 13,
    fontFamily: 'Inter_500Medium',
    color: Colors.textSecondary,
  },
  footBtn: {
    paddingVertical: 8,
    paddingHorizontal: 20,
    borderRadius: 8,
    backgroundColor: Colors.accent,
  },
  footBtnDis: {
    opacity: 0.35,
  },
  footBtnText: {
    fontSize: 13,
    fontFamily: 'Inter_700Bold',
    color: '#fff',
  },
});

// ─── DatePickerField (com label) ────────────────────────────────────────────

interface DatePickerFieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  style?: any;
  labelStyle?: any;
  hasError?: boolean;
  placeholder?: string;
}

export default function DatePickerField({
  label,
  value,
  onChange,
  required,
  style,
  labelStyle,
  hasError,
  placeholder = 'Seleccionar data',
}: DatePickerFieldProps) {
  const [open, setOpen] = useState(false);

  const displayText = toDisplay(value);

  return (
    <View style={[dpf.group, style]}>
      <View style={dpf.labelRow}>
        <Text style={[dpf.label, labelStyle]}>{label}</Text>
        {required && <Text style={dpf.required}> *</Text>}
      </View>

      <TouchableOpacity
        style={[dpf.inputWrap, hasError && dpf.inputWrapError]}
        onPress={() => setOpen(true)}
        activeOpacity={0.75}
      >
        <Ionicons name="calendar-outline" size={16} color={displayText ? Colors.gold : Colors.textMuted} style={dpf.icon} />
        <Text style={[dpf.inputText, !displayText && dpf.inputPlaceholder]} numberOfLines={1}>
          {displayText || placeholder}
        </Text>
        {displayText ? (
          <TouchableOpacity onPress={() => onChange('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close-circle" size={16} color={Colors.textMuted} />
          </TouchableOpacity>
        ) : (
          <Ionicons name="chevron-down" size={14} color={Colors.textMuted} />
        )}
      </TouchableOpacity>

      <CalendarModal
        visible={open}
        value={value}
        label={label}
        onSelect={v => { onChange(v); setOpen(false); }}
        onClear={() => onChange('')}
        onClose={() => setOpen(false)}
      />
    </View>
  );
}

const dpf = StyleSheet.create({
  group: { marginBottom: 14 },
  labelRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  label: { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: Colors.textSecondary },
  required: { fontSize: 12, color: Colors.accent, fontFamily: 'Inter_600SemiBold' },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 8,
  },
  inputWrapError: {
    borderColor: Colors.danger,
    backgroundColor: Colors.danger + '08',
  },
  icon: { flexShrink: 0 },
  inputText: {
    flex: 1,
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    color: Colors.text,
  },
  inputPlaceholder: {
    color: Colors.textMuted,
  },
});
