import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, Modal, Platform, Animated, KeyboardAvoidingView, ScrollView, Dimensions, Image, ImageBackground, Easing } from 'react-native';
import AppLoader from '@/components/AppLoader';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { checkBiometricAvailable, authenticateBiometric } from '@/lib/biometric-bridge';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { Colors } from '@/constants/colors';
import { useAuth, saveAuthToken } from '@/context/AuthContext';
import { useConfig } from '@/context/ConfigContext';
import type { AuthUser } from '@/context/AuthContext';
import { getRoleLabel } from '@/utils/genero';
import { useUsers } from '@/context/UsersContext';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { getApiUrl } from '@/lib/query-client';
import { saveOfflineCredential, checkOfflineCredential } from '@/lib/offlineLogin';
import { isNetworkError } from '@/lib/offlineQueue';
import { AcademicIconsBg } from '@/components/AcademicIconsBg';
import DateInput from '@/components/DateInput';

const { width, height } = Dimensions.get('window');

function WebFormWrapper({ onSubmit, children }: { onSubmit: () => void; children: React.ReactNode }) {
  if (Platform.OS !== 'web') return <>{children}</>;
  return React.createElement('form' as any, {
    onSubmit: (e: any) => { e.preventDefault(); onSubmit(); },
    style: { display: 'contents' },
  }, children);
}

// ─── Dashboard Preview Background (desktop + mobile) ─────────────────────
function DashboardPreviewBg() {
  const nd = Platform.OS !== 'web';
  const p0 = useRef(new Animated.Value(1)).current;
  const p1 = useRef(new Animated.Value(0)).current;
  const p2 = useRef(new Animated.Value(0)).current;
  const panels = [p0, p1, p2];
  const activeRef = useRef(0);

  useEffect(() => {
    const tick = setInterval(() => {
      const cur = activeRef.current;
      const nxt = (cur + 1) % 3;
      activeRef.current = nxt;
      Animated.parallel([
        Animated.timing(panels[cur], { toValue: 0, duration: 1200, useNativeDriver: nd }),
        Animated.timing(panels[nxt], { toValue: 1, duration: 1200, useNativeDriver: nd }),
      ]).start();
    }, 5000);
    return () => clearInterval(tick);
  }, []);

  const NAV = [
    { ic: 'grid-outline', active: [true, false, false] },
    { ic: 'people-outline', active: [false, false, false] },
    { ic: 'school-outline', active: [false, false, false] },
    { ic: 'cash-outline', active: [false, true, false] },
    { ic: 'document-text-outline', active: [false, false, false] },
    { ic: 'analytics-outline', active: [false, false, false] },
    { ic: 'briefcase-outline', active: [false, false, true] },
    { ic: 'calendar-outline', active: [false, false, false] },
  ];

  function KpiRow({ items }: { items: { label: string; value: string; delta: string; color: string; icon: string }[] }) {
    return (
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {items.map((k, i) => (
          <View key={i} style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.09)', borderRadius: 10, borderWidth: 1, borderColor: k.color + '40', padding: 10, gap: 4 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ width: 26, height: 26, borderRadius: 7, backgroundColor: k.color + '33', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: k.color + '55' }}>
                <Ionicons name={k.icon as any} size={13} color={k.color} />
              </View>
              <Text style={{ color: k.color, fontSize: 9, fontFamily: 'Inter_700Bold' }}>{k.delta}</Text>
            </View>
            <Text style={{ color: '#fff', fontSize: 18, fontFamily: 'Inter_700Bold' }}>{k.value}</Text>
            <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 8, fontFamily: 'Inter_400Regular' }} numberOfLines={2}>{k.label}</Text>
          </View>
        ))}
      </View>
    );
  }

  function BarChart({ bars, title }: { bars: { label: string; v: number; color: string }[]; title: string }) {
    return (
      <View style={{ flex: 2, backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.13)', padding: 12, overflow: 'hidden' }}>
        <Text style={{ color: '#fff', fontSize: 10, fontFamily: 'Inter_600SemiBold', marginBottom: 12 }}>{title}</Text>
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'flex-end', gap: 6 }}>
          {bars.map((b, i) => (
            <View key={i} style={{ flex: 1, alignItems: 'center', gap: 4 }}>
              <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 7, fontFamily: 'Inter_700Bold' }}>{b.v}</Text>
              <View style={{ width: '100%', height: Math.round((b.v / 100) * 90), backgroundColor: b.color, borderRadius: 4, opacity: 0.9 }} />
              <Text style={{ color: 'rgba(255,255,255,0.55)', fontSize: 7, fontFamily: 'Inter_500Medium' }}>{b.label}</Text>
            </View>
          ))}
        </View>
      </View>
    );
  }

  function ActivityFeed({ items, title }: { items: { icon: string; color: string; text: string; time: string }[]; title: string }) {
    return (
      <View style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.13)', padding: 10, overflow: 'hidden' }}>
        <Text style={{ color: '#fff', fontSize: 9, fontFamily: 'Inter_600SemiBold', marginBottom: 8 }}>{title}</Text>
        <View style={{ gap: 7 }}>
          {items.map((a, i) => (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
              <View style={{ width: 22, height: 22, borderRadius: 6, backgroundColor: a.color + '30', alignItems: 'center', justifyContent: 'center', flexShrink: 0, borderWidth: 1, borderColor: a.color + '50' }}>
                <Ionicons name={a.icon as any} size={11} color={a.color} />
              </View>
              <Text style={{ flex: 1, color: 'rgba(255,255,255,0.75)', fontSize: 8, fontFamily: 'Inter_400Regular' }} numberOfLines={1}>{a.text}</Text>
              <Text style={{ color: 'rgba(255,255,255,0.35)', fontSize: 7, fontFamily: 'Inter_400Regular' }}>{a.time}</Text>
            </View>
          ))}
        </View>
      </View>
    );
  }

  // ── Painel 0: Académico ──────────────────────────────────────────────────
  const academicKpi = [
    { label: 'Alunos Matriculados', value: '192', delta: '+12', color: '#22C55E', icon: 'people-outline' },
    { label: 'Professores Activos', value: '23', delta: '+2', color: '#3B82F6', icon: 'school-outline' },
    { label: 'Turmas Activas', value: '8', delta: '0', color: '#D4AF37', icon: 'grid-outline' },
    { label: 'Taxa de Aprovação', value: '87%', delta: '+4%', color: '#22C55E', icon: 'analytics-outline' },
  ];
  const academicBars = [
    { label: 'Port.', v: 78, color: '#3B82F6' }, { label: 'Mat.', v: 65, color: '#EF4444' },
    { label: 'FQ', v: 72, color: '#D4AF37' }, { label: 'Bio', v: 85, color: '#22C55E' },
    { label: 'Hist.', v: 70, color: '#A78BFA' }, { label: 'Geo', v: 80, color: '#F97316' },
    { label: 'EF', v: 92, color: '#06B6D4' },
  ];
  const academicAct = [
    { icon: 'checkmark-circle-outline', color: '#22C55E', text: 'Pauta de Português 9ªA fechada', time: '08:41' },
    { icon: 'person-add-outline', color: '#3B82F6', text: 'Novo aluno matriculado: Carlos M.', time: '08:23' },
    { icon: 'alert-circle-outline', color: '#EF4444', text: 'Falta não justificada — 3 alunos', time: '07:30' },
    { icon: 'document-text-outline', color: '#A78BFA', text: 'Boletim gerado — 8ª Turma B', time: '06:50' },
    { icon: 'star-outline', color: '#D4AF37', text: 'Quadro de Honra actualizado', time: '06:20' },
  ];
  const riskStudents = [
    { nome: 'David Cardoso', turma: '9ª A', nota: '7.2', faltas: '32%' },
    { nome: 'Marta Simões', turma: '8ª B', nota: '8.0', faltas: '28%' },
    { nome: 'João Teixeira', turma: '7ª A', nota: '6.5', faltas: '35%' },
  ];

  // ── Painel 1: Financeiro ──────────────────────────────────────────────────
  const finKpi = [
    { label: 'Receita Mensal', value: '450K', delta: '+8%', color: '#22C55E', icon: 'cash-outline' },
    { label: 'Propinas em Atraso', value: '14', delta: '-3', color: '#EF4444', icon: 'alert-circle-outline' },
    { label: 'Pagamentos Hoje', value: '8', delta: '+2', color: '#3B82F6', icon: 'checkmark-circle-outline' },
    { label: 'Isenções Activas', value: '3', delta: '0', color: '#D4AF37', icon: 'ribbon-outline' },
  ];
  const finBars = [
    { label: 'Jan', v: 72, color: '#3B82F6' }, { label: 'Fev', v: 68, color: '#3B82F6' },
    { label: 'Mar', v: 80, color: '#22C55E' }, { label: 'Abr', v: 76, color: '#3B82F6' },
    { label: 'Mai', v: 90, color: '#22C55E' }, { label: 'Jun', v: 85, color: '#3B82F6' },
  ];
  const finAct = [
    { icon: 'checkmark-circle-outline', color: '#22C55E', text: 'Propina paga — Ana Fernandes', time: '08:55' },
    { icon: 'cash-outline', color: '#D4AF37', text: 'RUPE emitido — Pedro Neto', time: '08:30' },
    { icon: 'alert-circle-outline', color: '#EF4444', text: 'Atraso detectado — 3 alunos', time: '08:00' },
    { icon: 'receipt-outline', color: '#3B82F6', text: 'Recibo gerado #00412', time: '07:45' },
    { icon: 'card-outline', color: '#A78BFA', text: 'Pagamento Multicaixa confirmado', time: '07:20' },
  ];
  const devedores = [
    { nome: 'Lucas Mateus', turma: '9ª A', meses: '3 meses', valor: '45.000 Kz' },
    { nome: 'Sofia Costa', turma: '8ª B', meses: '2 meses', valor: '30.000 Kz' },
    { nome: 'André Silva', turma: '7ª A', meses: '1 mês', valor: '15.000 Kz' },
  ];

  // ── Painel 2: Recursos Humanos ──────────────────────────────────────────
  const rhKpi = [
    { label: 'Total Funcionários', value: '41', delta: '+1', color: '#3B82F6', icon: 'briefcase-outline' },
    { label: 'Salário Total Mensal', value: '2.84M', delta: '+2%', color: '#D4AF37', icon: 'cash-outline' },
    { label: 'Faltas Este Mês', value: '7', delta: '-2', color: '#EF4444', icon: 'close-circle-outline' },
    { label: 'Contratos Activos', value: '38', delta: '0', color: '#22C55E', icon: 'document-text-outline' },
  ];
  const rhBars = [
    { label: 'Prof.', v: 70, color: '#3B82F6' }, { label: 'Adm.', v: 45, color: '#D4AF37' },
    { label: 'Aux.', v: 30, color: '#A78BFA' }, { label: 'Fin.', v: 25, color: '#22C55E' },
    { label: 'TI', v: 15, color: '#F97316' }, { label: 'RH', v: 10, color: '#06B6D4' },
  ];
  const rhAct = [
    { icon: 'checkmark-circle-outline', color: '#22C55E', text: 'Folha salarial processada — Maio', time: '09:10' },
    { icon: 'person-add-outline', color: '#3B82F6', text: 'Novo contrato: Eng. Tomas F.', time: '08:45' },
    { icon: 'alert-circle-outline', color: '#EF4444', text: 'Falta injustificada — M. Costa', time: '08:20' },
    { icon: 'document-text-outline', color: '#D4AF37', text: 'IRT calculado — 41 funcionários', time: '07:55' },
    { icon: 'ribbon-outline', color: '#A78BFA', text: 'Avaliação de desempenho aberta', time: '07:30' },
  ];
  const rhFuncionarios = [
    { nome: 'Maria Santos', cargo: 'Directora', dept: 'Direcção', salario: '95.000 Kz' },
    { nome: 'Carlos Pinto', cargo: 'Professor', dept: 'Académico', salario: '72.000 Kz' },
    { nome: 'Luísa Neves', cargo: 'Secretária', dept: 'Secretaria', salario: '58.000 Kz' },
  ];

  const panelTitles = ['Painel de Controlo', 'Gestão Financeira', 'Recursos Humanos'];
  const panelSubs = ['Bom dia, Director • Ano 2025–2026', 'Gestão de Propinas e Pagamentos', 'Pessoal, Salários e Contratos'];
  const navActiveIdx = [0, 3, 6];

  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: '#0A1228', overflow: 'hidden' } as any]}>
      <View style={{ flex: 1, ...(Platform.OS === 'web' ? { filter: 'blur(1.5px)' } : {}) } as any}>

        {/* ── Top Bar (fixo) ── */}
        <View style={{ height: 52, backgroundColor: 'rgba(13,27,62,0.98)', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, gap: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.07)' }}>
          <View style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: 'rgba(212,175,55,0.18)', borderWidth: 1, borderColor: 'rgba(212,175,55,0.3)', alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: '#D4AF37', fontSize: 10, fontFamily: 'Inter_700Bold' }}>SIGA</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: '#fff', fontSize: 12, fontFamily: 'Inter_600SemiBold' }}>Escola Secundária N.º 1 de Luanda</Text>
            <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10, fontFamily: 'Inter_400Regular' }}>Sistema Integrado de Gestão Académica</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(212,175,55,0.12)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: 'rgba(212,175,55,0.2)' }}>
            <Ionicons name="time-outline" size={12} color="#D4AF37" />
            <Text style={{ color: '#D4AF37', fontSize: 11, fontFamily: 'Inter_600SemiBold' }}>08:52:02</Text>
          </View>
          <Ionicons name="notifications-outline" size={18} color="rgba(255,255,255,0.5)" />
          <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: '#1a5e8a', alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: '#fff', fontSize: 13, fontFamily: 'Inter_700Bold' }}>G</Text>
          </View>
        </View>

        {/* ── Body ── */}
        <View style={{ flex: 1, flexDirection: 'row' }}>
          {/* Sidebar (fixo) */}
          <View style={{ width: 52, backgroundColor: 'rgba(10,18,45,0.9)', borderRightWidth: 1, borderRightColor: 'rgba(255,255,255,0.05)', paddingTop: 16, alignItems: 'center', gap: 6 }}>
            {NAV.map((n, i) => (
              <View key={i} style={{ width: 36, height: 36, borderRadius: 9, backgroundColor: n.active[0] && activeRef.current === 0 || n.active[1] && activeRef.current === 1 || n.active[2] && activeRef.current === 2 ? 'rgba(212,175,55,0.18)' : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name={n.ic as any} size={16} color={n.active[activeRef.current] ? '#D4AF37' : 'rgba(255,255,255,0.28)'} />
              </View>
            ))}
          </View>

          {/* Content area — panels crossfade here */}
          <View style={{ flex: 1, position: 'relative' }}>

            {/* ── Panel 0: Académico ── */}
            <Animated.View style={[StyleSheet.absoluteFill, { opacity: p0, padding: 14, gap: 12, overflow: 'hidden' } as any]}>
              <View>
                <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 10, fontFamily: 'Inter_400Regular' }}>{panelSubs[0]}</Text>
                <Text style={{ color: '#fff', fontSize: 14, fontFamily: 'Inter_700Bold' }}>{panelTitles[0]}</Text>
              </View>
              <KpiRow items={academicKpi} />
              <View style={{ flex: 1, flexDirection: 'row', gap: 10, overflow: 'hidden' }}>
                <BarChart bars={academicBars} title="Desempenho por Disciplina" />
                <View style={{ flex: 1.4, gap: 8 }}>
                  <View style={{ backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.13)', padding: 10 }}>
                    <Text style={{ color: '#fff', fontSize: 9, fontFamily: 'Inter_600SemiBold', marginBottom: 8 }}>Distribuição por Turno</Text>
                    <View style={{ flexDirection: 'row', gap: 6 }}>
                      {[{ l: 'Manhã', v: 55, c: '#3B82F6' }, { l: 'Tarde', v: 32, c: '#D4AF37' }, { l: 'Noite', v: 13, c: '#A78BFA' }].map((t, i) => (
                        <View key={i} style={{ flex: 1, gap: 4 }}>
                          <View style={{ height: 5, backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 3, overflow: 'hidden' }}>
                            <View style={{ width: `${t.v}%` as any, height: '100%', backgroundColor: t.c, borderRadius: 3 }} />
                          </View>
                          <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 8 }}>{t.l}</Text>
                          <Text style={{ color: t.c, fontSize: 9, fontFamily: 'Inter_700Bold' }}>{t.v}%</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                  <ActivityFeed items={academicAct} title="Actividade Recente" />
                </View>
              </View>
              <View style={{ backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.13)', padding: 10 }}>
                <Text style={{ color: '#fff', fontSize: 9, fontFamily: 'Inter_600SemiBold', marginBottom: 8 }}>Alunos em Risco</Text>
                <View style={{ gap: 5 }}>
                  {riskStudents.map((s, i) => (
                    <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: 'rgba(239,68,68,0.07)', borderRadius: 7, paddingHorizontal: 8, paddingVertical: 5 }}>
                      <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: '#EF444430', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#EF444460' }}>
                        <Text style={{ color: '#EF4444', fontSize: 9, fontFamily: 'Inter_700Bold' }}>{s.nome[0]}</Text>
                      </View>
                      <Text style={{ flex: 1, color: 'rgba(255,255,255,0.8)', fontSize: 9, fontFamily: 'Inter_500Medium' }}>{s.nome}</Text>
                      <Text style={{ color: 'rgba(255,255,255,0.45)', fontSize: 8 }}>{s.turma}</Text>
                      <View style={{ backgroundColor: '#EF444425', borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, borderColor: '#EF444440' }}>
                        <Text style={{ color: '#EF4444', fontSize: 8, fontFamily: 'Inter_700Bold' }}>{s.nota}</Text>
                      </View>
                      <View style={{ backgroundColor: '#F59E0B20', borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, borderColor: '#F59E0B40' }}>
                        <Text style={{ color: '#F59E0B', fontSize: 8, fontFamily: 'Inter_700Bold' }}>{s.faltas}</Text>
                      </View>
                    </View>
                  ))}
                </View>
              </View>
            </Animated.View>

            {/* ── Panel 1: Financeiro ── */}
            <Animated.View style={[StyleSheet.absoluteFill, { opacity: p1, padding: 14, gap: 12, overflow: 'hidden' } as any]}>
              <View>
                <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 10, fontFamily: 'Inter_400Regular' }}>{panelSubs[1]}</Text>
                <Text style={{ color: '#fff', fontSize: 14, fontFamily: 'Inter_700Bold' }}>{panelTitles[1]}</Text>
              </View>
              <KpiRow items={finKpi} />
              <View style={{ flex: 1, flexDirection: 'row', gap: 10, overflow: 'hidden' }}>
                <BarChart bars={finBars} title="Receitas por Mês (×1000 Kz)" />
                <View style={{ flex: 1.4, gap: 8 }}>
                  <View style={{ backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.13)', padding: 10 }}>
                    <Text style={{ color: '#fff', fontSize: 9, fontFamily: 'Inter_600SemiBold', marginBottom: 8 }}>Estado das Propinas</Text>
                    <View style={{ flexDirection: 'row', gap: 6 }}>
                      {[{ l: 'Pagas', v: 78, c: '#22C55E' }, { l: 'Pendente', v: 15, c: '#F59E0B' }, { l: 'Atraso', v: 7, c: '#EF4444' }].map((t, i) => (
                        <View key={i} style={{ flex: 1, gap: 4 }}>
                          <View style={{ height: 5, backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 3, overflow: 'hidden' }}>
                            <View style={{ width: `${t.v}%` as any, height: '100%', backgroundColor: t.c, borderRadius: 3 }} />
                          </View>
                          <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 8 }}>{t.l}</Text>
                          <Text style={{ color: t.c, fontSize: 9, fontFamily: 'Inter_700Bold' }}>{t.v}%</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                  <ActivityFeed items={finAct} title="Últimas Transacções" />
                </View>
              </View>
              <View style={{ backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.13)', padding: 10 }}>
                <Text style={{ color: '#fff', fontSize: 9, fontFamily: 'Inter_600SemiBold', marginBottom: 8 }}>Maiores Devedores</Text>
                <View style={{ gap: 5 }}>
                  {devedores.map((d, i) => (
                    <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: 'rgba(239,68,68,0.07)', borderRadius: 7, paddingHorizontal: 8, paddingVertical: 5 }}>
                      <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: '#EF444430', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#EF444460' }}>
                        <Text style={{ color: '#EF4444', fontSize: 9, fontFamily: 'Inter_700Bold' }}>{d.nome[0]}</Text>
                      </View>
                      <Text style={{ flex: 1, color: 'rgba(255,255,255,0.8)', fontSize: 9, fontFamily: 'Inter_500Medium' }}>{d.nome}</Text>
                      <Text style={{ color: 'rgba(255,255,255,0.45)', fontSize: 8 }}>{d.turma}</Text>
                      <View style={{ backgroundColor: '#EF444425', borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, borderColor: '#EF444440' }}>
                        <Text style={{ color: '#EF4444', fontSize: 8, fontFamily: 'Inter_700Bold' }}>{d.meses}</Text>
                      </View>
                      <View style={{ backgroundColor: '#F59E0B20', borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, borderColor: '#F59E0B40' }}>
                        <Text style={{ color: '#F59E0B', fontSize: 8, fontFamily: 'Inter_700Bold' }}>{d.valor}</Text>
                      </View>
                    </View>
                  ))}
                </View>
              </View>
            </Animated.View>

            {/* ── Panel 2: RH ── */}
            <Animated.View style={[StyleSheet.absoluteFill, { opacity: p2, padding: 14, gap: 12, overflow: 'hidden' } as any]}>
              <View>
                <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 10, fontFamily: 'Inter_400Regular' }}>{panelSubs[2]}</Text>
                <Text style={{ color: '#fff', fontSize: 14, fontFamily: 'Inter_700Bold' }}>{panelTitles[2]}</Text>
              </View>
              <KpiRow items={rhKpi} />
              <View style={{ flex: 1, flexDirection: 'row', gap: 10, overflow: 'hidden' }}>
                <BarChart bars={rhBars} title="Funcionários por Departamento" />
                <View style={{ flex: 1.4, gap: 8 }}>
                  <View style={{ backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.13)', padding: 10 }}>
                    <Text style={{ color: '#fff', fontSize: 9, fontFamily: 'Inter_600SemiBold', marginBottom: 8 }}>Tipos de Contrato</Text>
                    <View style={{ flexDirection: 'row', gap: 6 }}>
                      {[{ l: 'Efectivo', v: 65, c: '#22C55E' }, { l: 'Prazo', v: 28, c: '#3B82F6' }, { l: 'Estágio', v: 7, c: '#D4AF37' }].map((t, i) => (
                        <View key={i} style={{ flex: 1, gap: 4 }}>
                          <View style={{ height: 5, backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 3, overflow: 'hidden' }}>
                            <View style={{ width: `${t.v}%` as any, height: '100%', backgroundColor: t.c, borderRadius: 3 }} />
                          </View>
                          <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 8 }}>{t.l}</Text>
                          <Text style={{ color: t.c, fontSize: 9, fontFamily: 'Inter_700Bold' }}>{t.v}%</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                  <ActivityFeed items={rhAct} title="Actividade RH" />
                </View>
              </View>
              <View style={{ backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.13)', padding: 10 }}>
                <Text style={{ color: '#fff', fontSize: 9, fontFamily: 'Inter_600SemiBold', marginBottom: 8 }}>Funcionários — Últimas Actualizações</Text>
                <View style={{ gap: 5 }}>
                  {rhFuncionarios.map((f, i) => (
                    <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: 'rgba(59,130,246,0.07)', borderRadius: 7, paddingHorizontal: 8, paddingVertical: 5 }}>
                      <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: '#3B82F630', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#3B82F660' }}>
                        <Text style={{ color: '#3B82F6', fontSize: 9, fontFamily: 'Inter_700Bold' }}>{f.nome[0]}</Text>
                      </View>
                      <Text style={{ flex: 1, color: 'rgba(255,255,255,0.8)', fontSize: 9, fontFamily: 'Inter_500Medium' }}>{f.nome}</Text>
                      <Text style={{ color: 'rgba(255,255,255,0.45)', fontSize: 8 }}>{f.cargo}</Text>
                      <View style={{ backgroundColor: '#22C55E20', borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, borderColor: '#22C55E40' }}>
                        <Text style={{ color: '#22C55E', fontSize: 8, fontFamily: 'Inter_700Bold' }}>{f.salario}</Text>
                      </View>
                    </View>
                  ))}
                </View>
              </View>
            </Animated.View>

          </View>
        </View>
      </View>

      {/* Overlay suave */}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(8,15,35,0.28)' }]} pointerEvents="none" />
    </View>
  );
}

const CEO_ACCOUNT = {
  email: 'ceo@sige.ao',
  senha: 'Sige@2025',
  role: 'ceo' as const,
  nome: 'Administrador QUETA',
  id: 'usr_ceo',
  escola: 'Super Escola',
};

const FINANCEIRO_ACCOUNT = {
  email: 'financeiro@sige.ao',
  senha: 'Financeiro@2025',
  role: 'financeiro' as const,
  nome: 'Gestor Financeiro',
  id: 'usr_financeiro_001',
  escola: 'Super Escola',
};

const SECRETARIA_ACCOUNT = {
  email: 'secretaria@sige.ao',
  senha: 'Secretaria@2025',
  role: 'secretaria' as const,
  nome: 'Secretária Académica',
  id: 'usr_secretaria_001',
  escola: 'Super Escola',
};

const RH_ACCOUNT = {
  email: 'rh@sige.ao',
  senha: 'RH@2025',
  role: 'rh' as const,
  nome: 'Gestor de Recursos Humanos',
  id: 'usr_rh_001',
  escola: 'Super Escola',
};

const AUTH_STEPS = [
  { label: 'A verificar as suas credenciais', icon: 'shield-checkmark-outline' as const },
  { label: 'A validar o acesso institucional', icon: 'server-outline' as const },
  { label: 'A preparar o seu espaço de trabalho', icon: 'grid-outline' as const },
];

function AuthLoadingOverlay({ visible }: { visible: boolean }) {
  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const ring1Scale = useRef(new Animated.Value(0.6)).current;
  const ring1Opacity = useRef(new Animated.Value(0)).current;
  const ring2Scale = useRef(new Animated.Value(0.6)).current;
  const ring2Opacity = useRef(new Animated.Value(0)).current;
  const ring3Scale = useRef(new Animated.Value(0.6)).current;
  const ring3Opacity = useRef(new Animated.Value(0)).current;
  const iconScale = useRef(new Animated.Value(0.7)).current;
  const iconOpacity = useRef(new Animated.Value(0)).current;
  const stepOpacities = useRef(AUTH_STEPS.map(() => new Animated.Value(0))).current;
  const stepTranslations = useRef(AUTH_STEPS.map(() => new Animated.Value(12))).current;
  const nd = Platform.OS !== 'web';

  useEffect(() => {
    if (visible) {
      Animated.timing(overlayOpacity, { toValue: 1, duration: 280, useNativeDriver: nd }).start();

      Animated.parallel([
        Animated.spring(iconScale, { toValue: 1, damping: 14, stiffness: 120, useNativeDriver: nd }),
        Animated.timing(iconOpacity, { toValue: 1, duration: 350, useNativeDriver: nd }),
      ]).start();

      const pulseRing = (scale: Animated.Value, opacity: Animated.Value, delay: number) => {
        const loop = Animated.loop(
          Animated.sequence([
            Animated.delay(delay),
            Animated.parallel([
              Animated.timing(scale, { toValue: 1.8, duration: 1400, easing: Easing.out(Easing.ease), useNativeDriver: nd }),
              Animated.timing(opacity, { toValue: 0, duration: 1400, easing: Easing.out(Easing.ease), useNativeDriver: nd }),
            ]),
            Animated.parallel([
              Animated.timing(scale, { toValue: 0.6, duration: 0, useNativeDriver: nd }),
              Animated.timing(opacity, { toValue: 0.5, duration: 0, useNativeDriver: nd }),
            ]),
          ])
        );
        loop.start();
        return loop;
      };

      setTimeout(() => pulseRing(ring1Scale, ring1Opacity, 0), 300);
      setTimeout(() => pulseRing(ring2Scale, ring2Opacity, 0), 700);
      setTimeout(() => pulseRing(ring3Scale, ring3Opacity, 0), 1100);

      AUTH_STEPS.forEach((_, i) => {
        setTimeout(() => {
          Animated.parallel([
            Animated.timing(stepOpacities[i], { toValue: 1, duration: 400, useNativeDriver: nd }),
            Animated.spring(stepTranslations[i], { toValue: 0, damping: 18, stiffness: 160, useNativeDriver: nd }),
          ]).start();
        }, 500 + i * 420);
      });
    } else {
      Animated.timing(overlayOpacity, { toValue: 0, duration: 220, useNativeDriver: nd }).start(() => {
        ring1Scale.setValue(0.6); ring1Opacity.setValue(0);
        ring2Scale.setValue(0.6); ring2Opacity.setValue(0);
        ring3Scale.setValue(0.6); ring3Opacity.setValue(0);
        iconScale.setValue(0.7); iconOpacity.setValue(0);
        stepOpacities.forEach(a => a.setValue(0));
        stepTranslations.forEach(a => a.setValue(12));
      });
    }
  }, [visible]);

  if (!visible) return null;

  return (
    <Animated.View style={[authLoadStyles.overlay, { opacity: overlayOpacity }]}>
      <View style={authLoadStyles.card}>
        <View style={authLoadStyles.orbitArea}>
          <Animated.View style={[authLoadStyles.ring, { opacity: ring1Opacity, transform: [{ scale: ring1Scale }] }]} />
          <Animated.View style={[authLoadStyles.ring, authLoadStyles.ring2, { opacity: ring2Opacity, transform: [{ scale: ring2Scale }] }]} />
          <Animated.View style={[authLoadStyles.ring, authLoadStyles.ring3, { opacity: ring3Opacity, transform: [{ scale: ring3Scale }] }]} />
          <Animated.View style={[authLoadStyles.iconWrap, { opacity: iconOpacity, transform: [{ scale: iconScale }] }]}>
            <LinearGradient
              colors={['rgba(240,165,0,0.25)', 'rgba(26,82,118,0.4)']}
              style={authLoadStyles.iconGrad}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <Ionicons name="shield-checkmark" size={40} color={Colors.gold} />
            </LinearGradient>
          </Animated.View>
        </View>

        <View style={authLoadStyles.textBlock}>
          <Text style={authLoadStyles.title}>A autenticar</Text>
          <Text style={authLoadStyles.subtitle}>Aguarde um momento...</Text>
        </View>

        <View style={authLoadStyles.steps}>
          {AUTH_STEPS.map((step, i) => (
            <Animated.View
              key={i}
              style={[
                authLoadStyles.stepRow,
                {
                  opacity: stepOpacities[i],
                  transform: [{ translateY: stepTranslations[i] }],
                },
              ]}
            >
              <View style={authLoadStyles.stepDot}>
                <Ionicons name={step.icon} size={13} color={Colors.gold} />
              </View>
              <Text style={authLoadStyles.stepLabel}>{step.label}</Text>
            </Animated.View>
          ))}
        </View>
      </View>
    </Animated.View>
  );
}

const authLoadStyles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(10,22,52,0.82)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
  },
  card: {
    width: 300,
    backgroundColor: 'rgba(22,40,80,0.92)',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(240,165,0,0.22)',
    padding: 32,
    alignItems: 'center',
    gap: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.5,
    shadowRadius: 40,
    elevation: 30,
  },
  orbitArea: {
    width: 120,
    height: 120,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 1.5,
    borderColor: 'rgba(240,165,0,0.55)',
  },
  ring2: {
    borderColor: 'rgba(26,82,118,0.5)',
  },
  ring3: {
    borderColor: 'rgba(240,165,0,0.3)',
  },
  iconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'rgba(240,165,0,0.35)',
  },
  iconGrad: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textBlock: {
    alignItems: 'center',
    gap: 4,
  },
  title: {
    fontSize: 18,
    fontFamily: 'Inter_700Bold',
    color: '#fff',
    letterSpacing: 0.2,
  },
  subtitle: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    color: 'rgba(255,255,255,0.45)',
    letterSpacing: 0.3,
  },
  steps: {
    width: '100%',
    gap: 10,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(240,165,0,0.1)',
  },
  stepDot: {
    width: 26,
    height: 26,
    borderRadius: 8,
    backgroundColor: 'rgba(240,165,0,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepLabel: {
    flex: 1,
    fontSize: 11,
    fontFamily: 'Inter_500Medium',
    color: 'rgba(255,255,255,0.6)',
    lineHeight: 16,
  },
});

const ALL_FEATURES = [
  { icon: 'people-outline',           text: 'Gestão de Alunos, Turmas e Matrículas' },
  { icon: 'school-outline',           text: 'Pautas, Notas e Controlo de Presenças' },
  { icon: 'qr-code-outline',          text: 'Registo de Presenças por QR Code' },
  { icon: 'cash-outline',             text: 'Propinas, Multas, RUPE e Isenções' },
  { icon: 'receipt-outline',          text: 'Folha Salarial, IRT e INSS (RH)' },
  { icon: 'document-text-outline',    text: 'Boletins, Declarações e Documentos PDF' },
  { icon: 'create-outline',           text: 'Editor de Documentos Oficiais' },
  { icon: 'bar-chart-outline',        text: 'Relatórios e Exportação Excel' },
  { icon: 'person-add-outline',       text: 'Inscrições Online de Novos Alunos' },
  { icon: 'phone-portrait-outline',   text: 'Portal do Estudante e do Encarregado' },
  { icon: 'globe-outline',            text: 'Integração com MED / SIGE Gov' },
  { icon: 'chatbubbles-outline',      text: 'Chat Interno e Notificações Push' },
  { icon: 'library-outline',          text: 'Biblioteca e Gestão de Recursos' },
  { icon: 'calendar-outline',         text: 'Calendário Académico e Horários' },
  { icon: 'shield-checkmark-outline', text: 'Controlo de Acessos por Perfil (12 Funções)' },
  { icon: 'analytics-outline',        text: 'Auditoria, Supervisão e Relatórios CEO' },
  { icon: 'star-outline',             text: 'Quadro de Honra e Avaliação de Professores' },
  { icon: 'briefcase-outline',        text: 'Gestão de RH — Faltas, Férias e Contratos' },
];

const VISIBLE_COUNT = 5;
const CYCLE_INTERVAL = 3000;

function CyclingFeatures() {
  const [offset, setOffset] = useState(0);
  const [paused, setPaused] = useState(false);
  const fadeAnims = useRef(Array.from({ length: VISIBLE_COUNT }, () => new Animated.Value(1))).current;
  const nd = Platform.OS !== 'web';

  useEffect(() => {
    if (paused) return;
    const timer = setInterval(() => {
      const exitIdx = 0;
      Animated.timing(fadeAnims[exitIdx], { toValue: 0, duration: 250, useNativeDriver: nd }).start(() => {
        setOffset(prev => (prev + 1) % ALL_FEATURES.length);
        fadeAnims[exitIdx].setValue(0);
        Animated.timing(fadeAnims[exitIdx], { toValue: 1, duration: 350, useNativeDriver: nd }).start();
      });
    }, CYCLE_INTERVAL);
    return () => clearInterval(timer);
  }, [paused]);

  const visible = useMemo(() => {
    return Array.from({ length: VISIBLE_COUNT }, (_, i) => ALL_FEATURES[(offset + i) % ALL_FEATURES.length]);
  }, [offset]);

  const hoverProps = Platform.OS === 'web'
    ? { onMouseEnter: () => setPaused(true), onMouseLeave: () => setPaused(false) }
    : {};

  return (
    <View style={cycleStyles.container} {...(hoverProps as any)}>
      {visible.map((f, i) => (
        <Animated.View key={`${offset}-${i}`} style={[cycleStyles.row, { opacity: i === 0 ? fadeAnims[0] : 1 }]}>
          <View style={cycleStyles.iconWrap}>
            <Ionicons name={f.icon as any} size={15} color={Colors.gold} />
          </View>
          <Text style={cycleStyles.text}>{f.text}</Text>
        </Animated.View>
      ))}
      <View style={cycleStyles.dotsRow}>
        {ALL_FEATURES.map((_, i) => (
          <View
            key={i}
            style={[
              cycleStyles.dot,
              i >= offset && i < offset + VISIBLE_COUNT ? cycleStyles.dotActive : null,
            ]}
          />
        ))}
      </View>
    </View>
  );
}

const cycleStyles = StyleSheet.create({
  container: { gap: 12, marginBottom: 40 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
  },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: 9,
    backgroundColor: 'rgba(240,165,0,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(240,165,0,0.26)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    fontSize: 13,
    fontFamily: 'Inter_500Medium',
    color: 'rgba(255,255,255,0.65)',
    flex: 1,
  },
  dotsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 4,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  dotActive: {
    backgroundColor: Colors.gold,
    opacity: 0.75,
  },
});

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { login, logout, lastUser, clearLastUser, user, isLoading: authLoading } = useAuth();
  const { config } = useConfig();
  const { users, findByCredentials } = useUsers();
  const { isDesktop } = useBreakpoint();

  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [showSenha, setShowSenha] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [focusedField, setFocusedField] = useState<'email' | 'senha' | null>(null);
  const [fieldError, setFieldError] = useState<{ field: 'email' | 'senha'; message: string } | null>(null);
  const [emailExists, setEmailExists] = useState(false);
  const [credentialsValid, setCredentialsValid] = useState(false);
  const emailCheckAnim = useRef(new Animated.Value(0)).current;
  const credCheckAnim = useRef(new Animated.Value(0)).current;
  const checkDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricType, setBiometricType] = useState<'fingerprint' | 'faceid' | 'none'>('none');
  const [showBiometricWelcome, setShowBiometricWelcome] = useState(false);
  const [inscricoesAbertas, setInscricoesAbertas] = useState(false);
  const [inscricaoDataInicio, setInscricaoDataInicio] = useState<string | null>(null);
  const [inscricaoDataFim, setInscricaoDataFim] = useState<string | null>(null);
  const [alertModal, setAlertModal] = useState<{ visible: boolean; title: string; message: string; type: 'error' | 'success' }>({ visible: false, title: '', message: '', type: 'error' });

  const [primeiroAcesso, setPrimeiroAcesso] = useState<{ visible: boolean; user: AuthUser | null; route: string }>({ visible: false, user: null, route: '' });
  const [paNovaSenha, setPaNovaSenha] = useState('');
  const [paConfirmar, setPaConfirmar] = useState('');
  const [paErro, setPaErro] = useState('');
  const [paLoading, setPaLoading] = useState(false);
  const [paSucesso, setPaSucesso] = useState(false);
  const [paShowNova, setPaShowNova] = useState(false);
  const [paShowConfirmar, setPaShowConfirmar] = useState(false);

  const [dadosEmFalta, setDadosEmFalta] = useState<{
    visible: boolean; campos: string[]; role: string;
    dadosAtuais: Record<string, string>; route: string; tentativas: number;
  }>({ visible: false, campos: [], role: '', dadosAtuais: {}, route: '', tentativas: 0 });
  const [defForm, setDefForm] = useState<Record<string, string>>({});
  const [defLoading, setDefLoading] = useState(false);
  const [defErro, setDefErro] = useState('');
  const [defPularLoading, setDefPularLoading] = useState(false);
  const DADOS_EM_FALTA_MAX_TENTATIVAS = 3;
  // Utilizador aguarda confirmação dos dados em falta — login adiado para evitar
  // que isAuthenticated dispare a navegação antes de o modal aparecer.
  const [pendingLoginUser, setPendingLoginUser] = useState<AuthUser | null>(null);

  const [approvalPending, setApprovalPending] = useState<{ token: string; email: string; expiresAt?: string } | null>(null);
  const [duplicateSessao, setDuplicateSessao] = useState<{ device: string; ip: string; loginAt: number; lastSeen: number } | null>(null);
  const approvalPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const approvalCountdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const approvalDotAnim = useRef(new Animated.Value(0)).current;
  const [approvalSecsLeft, setApprovalSecsLeft] = useState(600);

  const [otpPending, setOtpPending] = useState<{ phone: string; maskedEmail?: string; channel: string; email: string; tooSoon?: boolean } | null>(null);
  const [otpCode, setOtpCode] = useState('');
  const [otpLoading, setOtpLoading] = useState(false);
  const [otpError, setOtpError] = useState('');
  const [otpResendSecs, setOtpResendSecs] = useState(60);
  const [showPasteInput, setShowPasteInput] = useState(false);
  const pasteInputRef = useRef<any>(null);
  const otpResendRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const otpInputRef = useRef<any>(null);

  // ── Magic link: detectar ?otp=XXXXXX&e=email na URL ao montar (web only) ──
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    try {
      const params = new URLSearchParams(window.location.search);
      const otpParam = params.get('otp');
      const emailParam = params.get('e');
      if (!otpParam || !emailParam || !/^\d{6}$/.test(otpParam)) return;
      // Limpar params da URL sem reload
      const cleanUrl = window.location.pathname;
      window.history.replaceState({}, '', cleanUrl);
      // Submeter directamente ao servidor
      (async () => {
        setOtpLoading(true);
        try {
          const res = await fetch('/api/auth/otp/verificar-login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: emailParam, codigo: otpParam }),
          });
          const data = await res.json();
          if (!res.ok) {
            setOtpLoading(false);
            return;
          }
          await saveAuthToken(data.token);
          const u: AuthUser = {
            id: data.user.id, nome: data.user.nome, email: data.user.email,
            role: data.user.role, escola: data.user.escola ?? '',
            biometricEnabled: false, avatar: data.user.avatar || undefined,
            telefone: data.user.telefone ?? '', genero: data.user.genero ?? '',
            dataNascimento: data.user.dataNascimento ?? '',
            ...(data.user.alunoId ? { alunoId: data.user.alunoId } : {}),
            ...(data.user.cursoId ? { cursoId: data.user.cursoId } : {}),
          };
          await completarLoginComVerificacaoDados(u, getDestinationRoute(data.user.role, data.licencaExpirada));
        } catch {
          setOtpLoading(false);
        }
      })();
    } catch {}
  }, []);

  // ── Web OTP API: detectar SMS automaticamente no Android Chrome ─────────────
  useEffect(() => {
    if (!otpPending || Platform.OS !== 'web') return;
    if (typeof navigator === 'undefined') return;
    const creds = (navigator as any).credentials;
    if (!creds?.get) return;

    const ac = new AbortController();

    creds.get({
      otp: { transport: ['sms'] },
      signal: ac.signal,
    } as any).then((otp: any) => {
      if (!otp?.code) return;
      const digits = String(otp.code).replace(/\D/g, '').slice(0, 6);
      if (digits.length === 6) {
        setOtpCode(digits);
        setOtpError('');
        handleOtpVerify(digits);
      }
    }).catch(() => {});

    return () => ac.abort();
  }, [otpPending]);

  // ── Clipboard: ler automaticamente quando o ecrã OTP aparece (web only) ──
  useEffect(() => {
    if (!otpPending || Platform.OS !== 'web') return;
    if (typeof navigator === 'undefined' || !navigator.clipboard?.readText) return;
    navigator.clipboard.readText().then(text => {
      const digits = (text ?? '').replace(/\D/g, '').slice(0, 6);
      if (digits.length === 6) {
        setOtpCode(digits);
        setOtpError('');
        handleOtpVerify(digits);
      }
    }).catch(() => {});
  }, [otpPending]);

  useEffect(() => {
    if (!approvalPending) {
      if (approvalPollRef.current) clearInterval(approvalPollRef.current);
      if (approvalCountdownRef.current) clearInterval(approvalCountdownRef.current);
      approvalDotAnim.stopAnimation();
      return;
    }
    // Calcular segundos restantes a partir do expiresAt recebido do servidor
    const expiresMs = approvalPending.expiresAt ? new Date(approvalPending.expiresAt).getTime() : Date.now() + 10 * 60 * 1000;
    const calcSecs = () => Math.max(0, Math.round((expiresMs - Date.now()) / 1000));
    setApprovalSecsLeft(calcSecs());
    approvalCountdownRef.current = setInterval(() => {
      const s = calcSecs();
      setApprovalSecsLeft(s);
      if (s <= 0) {
        if (approvalCountdownRef.current) clearInterval(approvalCountdownRef.current);
      }
    }, 1000);

    Animated.loop(Animated.sequence([
      Animated.timing(approvalDotAnim, { toValue: 1, duration: 900, useNativeDriver: true }),
      Animated.timing(approvalDotAnim, { toValue: 0, duration: 900, useNativeDriver: true }),
    ])).start();

    approvalPollRef.current = setInterval(async () => {
      try {
        const r = await fetch(`/api/auth/login-check?token=${approvalPending.token}`);
        const d = await r.json();
        if (d.status === 'approved' && d.token) {
          clearInterval(approvalPollRef.current!);
          if (approvalCountdownRef.current) clearInterval(approvalCountdownRef.current);
          setApprovalPending(null);
          await saveAuthToken(d.token);
          const u: AuthUser = {
            id: d.user.id, nome: d.user.nome, email: d.user.email, role: d.user.role,
            escola: d.user.escola ?? '', biometricEnabled: false,
            avatar: d.user.avatar || undefined, telefone: d.user.telefone ?? '',
            genero: d.user.genero ?? '', dataNascimento: d.user.dataNascimento ?? '',
            ...(d.user.alunoId ? { alunoId: d.user.alunoId } : {}),
            ...(d.user.cursoId ? { cursoId: d.user.cursoId } : {}),
          };
          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
          if (d.primeiroAcesso) {
            setPrimeiroAcesso({ visible: true, user: u, route: getDestinationRoute(d.user.role, d.licencaExpirada) });
            return;
          }
          await completarLoginComVerificacaoDados(u, getDestinationRoute(d.user.role, d.licencaExpirada));
        } else if (d.status === 'denied') {
          clearInterval(approvalPollRef.current!);
          if (approvalCountdownRef.current) clearInterval(approvalCountdownRef.current);
          setApprovalPending(null);
          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
          showAlert('Acesso Bloqueado', 'O proprietário da conta recusou o pedido de acesso. Se foi você a tentar entrar, verifique as suas credenciais e tente novamente.');
        } else if (d.status === 'expired') {
          clearInterval(approvalPollRef.current!);
          if (approvalCountdownRef.current) clearInterval(approvalCountdownRef.current);
          setApprovalPending(null);
          showAlert('Tempo Expirado', 'O link de aprovação expirou (10 minutos). Por favor, tente entrar novamente.');
        }
      } catch (_) {}
    }, 3000);
    return () => {
      if (approvalPollRef.current) clearInterval(approvalPollRef.current);
      if (approvalCountdownRef.current) clearInterval(approvalCountdownRef.current);
    };
  }, [approvalPending]);

  function showAlert(title: string, message: string, type: 'error' | 'success' = 'error') {
    setAlertModal({ visible: true, title, message, type });
  }

  // Após qualquer login bem-sucedido (não apenas primeiro-acesso), verifica se há
  // dados pessoais em falta antes de navegar. Se houver, mostra o modal de
  // preenchimento em vez de avançar directamente para a rota de destino.
  //
  // IMPORTANTE: login(u) é chamado APÓS a verificação para não activar
  // isAuthenticated prematuramente — o que causaria uma navegação imediata
  // via app/index.tsx antes de o modal dos dados em falta ser apresentado.
  async function completarLoginComVerificacaoDados(u: AuthUser, route: string) {
    try {
      const { getAuthToken: getToken } = await import('@/context/AuthContext');
      const tok = await getToken();
      const r = await fetch('/api/minha-conta/dados-em-falta', {
        headers: tok ? { Authorization: `Bearer ${tok}` } : {},
      });
      const d = await r.json();
      if (d.temDadosEmFalta && d.campos?.length > 0) {
        const initial: Record<string, string> = {};
        for (const c of d.campos) initial[c] = d.dadosAtuais?.[c] ?? '';
        setDefForm(initial);
        // Guardar utilizador para fazer login após o modal ser resolvido
        setPendingLoginUser(u);
        setDadosEmFalta({ visible: true, campos: d.campos, role: d.role, dadosAtuais: d.dadosAtuais ?? {}, route, tentativas: Number(d.tentativas ?? 0) });
        return;
      }
    } catch { /* silent — segue para a app normalmente */ }
    await login(u);
    router.replace(route as any);
  }

  // Regista que o utilizador saltou o preenchimento dos dados em falta (limite de
  // DADOS_EM_FALTA_MAX_TENTATIVAS vezes; ao esgotar, o botão de saltar desaparece).
  async function handlePularDadosEmFalta() {
    setDefPularLoading(true);
    try {
      const { getAuthToken: getToken } = await import('@/context/AuthContext');
      const tok = await getToken();
      await fetch('/api/minha-conta/dados-em-falta/pular', {
        method: 'POST',
        headers: tok ? { Authorization: `Bearer ${tok}` } : {},
      });
    } catch { /* silent — mesmo que falhe, deixamos o utilizador seguir */ }
    setDefPularLoading(false);
    setDadosEmFalta(prev => ({ ...prev, visible: false }));
    if (pendingLoginUser) { await login(pendingLoginUser); setPendingLoginUser(null); }
    router.replace(dadosEmFalta.route as any);
  }

  const isWeb = Platform.OS === 'web';
  const fadeAnim = useRef(new Animated.Value(isWeb ? 1 : 0)).current;
  const logoScale = useRef(new Animated.Value(isWeb ? 1 : 0.85)).current;
  const logoOpacity = useRef(new Animated.Value(isWeb ? 1 : 0)).current;
  const cardSlide = useRef(new Animated.Value(isWeb ? 0 : 40)).current;
  const cardOpacity = useRef(new Animated.Value(isWeb ? 1 : 0)).current;
  const footerOpacity = useRef(new Animated.Value(isWeb ? 1 : 0)).current;
  const biometricPulse = useRef(new Animated.Value(1)).current;
  const biometricGlow = useRef(new Animated.Value(0)).current;
  const senhaRef = useRef<TextInput>(null);

  useEffect(() => {
    initLogin();
  }, []);

  useEffect(() => {
    if (!authLoading && user) {
      router.replace(getRouteForRole(user.role) as any);
    }
  }, [user, authLoading]);

  function getRouteForRole(role: string): string {
    if (role === 'ceo' || role === 'pca') return '/(main)/ceo';
    if (role === 'admin') return '/(main)/admin';
    if (role === 'director') return '/(main)/dashboard';
    if (role === 'chefe_secretaria') return '/(main)/secretaria-hub';
    if (role === 'secretaria') return '/(main)/secretaria-hub';
    if (role === 'financeiro') return '/(main)/financeiro';
    if (role === 'pedagogico') return '/(main)/pedagogico';
    if (role === 'professor') return '/(main)/professor-hub';
    if (role === 'rh') return '/(main)/rh-hub';
    if (role === 'aluno') return '/(main)/portal-estudante';
    if (role === 'encarregado') return '/(main)/portal-encarregado';
    return '/(main)/dashboard';
  }

  // Se a licença estiver expirada e o papel não for isento (CEO, PCA, aluno), redireciona para /licenca
  function getDestinationRoute(role: string, licencaExpirada?: boolean): string {
    const isentoLicenca = role === 'ceo' || role === 'pca' || role === 'aluno' || role === 'encarregado';
    if (licencaExpirada && !isentoLicenca) return '/licenca';
    return getRouteForRole(role);
  }

  useEffect(() => {
    if (showBiometricWelcome) {
      startBiometricAnimation();
    }
  }, [showBiometricWelcome]);

  useEffect(() => {
    const nd = Platform.OS !== 'web';
    if (emailExists) {
      Animated.spring(emailCheckAnim, { toValue: 1, damping: 14, stiffness: 160, useNativeDriver: nd }).start();
    } else {
      Animated.timing(emailCheckAnim, { toValue: 0, duration: 150, useNativeDriver: nd }).start();
    }
  }, [emailExists]);

  useEffect(() => {
    const nd = Platform.OS !== 'web';
    if (credentialsValid) {
      Animated.spring(credCheckAnim, { toValue: 1, damping: 14, stiffness: 160, useNativeDriver: nd }).start();
    } else {
      Animated.timing(credCheckAnim, { toValue: 0, duration: 150, useNativeDriver: nd }).start();
    }
  }, [credentialsValid]);

  useEffect(() => {
    if (checkDebounceRef.current) clearTimeout(checkDebounceRef.current);
    const emailTrimmed = email.trim();
    const senhaTrimmed = senha.trim();
    if (!emailTrimmed) {
      setEmailExists(false);
      setCredentialsValid(false);
      return;
    }
    checkDebounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch('/api/check-credentials', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: emailTrimmed, senha: senhaTrimmed }),
        });
        if (res.ok) {
          const data = await res.json();
          setEmailExists(!!data.emailExists);
          setCredentialsValid(!!data.valid);
        }
      } catch { /* silent */ }
    }, 600);
    return () => { if (checkDebounceRef.current) clearTimeout(checkDebounceRef.current); };
  }, [email, senha]);

  async function initLogin() {
    try {
      const res = await fetch('/api/public/inscricoes-status');
      if (res.ok) {
        const data = await res.json();
        const dataInicio = data.dataInicio ?? null;
        const dataFim = data.dataFim ?? null;
        setInscricaoDataInicio(dataInicio);
        setInscricaoDataFim(dataFim);
        // Enrollment is only truly open if the flag is on AND
        // today is within the configured date range (if dates are set)
        let dentroDoPeríodo = !!data.abertas;
        if (dentroDoPeríodo && (dataInicio || dataFim)) {
          const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
          const parsePT = (s: string | null) => {
            if (!s) return null;
            const [d, m, y] = s.split('/').map(Number);
            return d && m && y ? new Date(y, m - 1, d) : null;
          };
          const fim = parsePT(dataFim);
          const ini = parsePT(dataInicio);
          if (fim && hoje > fim) dentroDoPeríodo = false;
          if (ini && hoje < ini) dentroDoPeríodo = false;
        }
        setInscricoesAbertas(dentroDoPeríodo);
      }
    } catch { /* network silencioso */ }

    const hasHardware = await checkBiometricAvailability();

    const shouldShowBiometric =
      Platform.OS !== 'web' &&
      hasHardware &&
      lastUser?.biometricEnabled === true;

    if (shouldShowBiometric) {
      setShowBiometricWelcome(true);
      animateEntrance();
      setTimeout(() => triggerBiometricAuth(), 800);
    } else {
      setShowBiometricWelcome(false);
      animateEntrance();
    }
  }

  function animateEntrance() {
    const nd = Platform.OS !== 'web';
    Animated.spring(logoScale, { toValue: 1, useNativeDriver: nd, damping: 16, stiffness: 100 }).start();
    Animated.sequence([
      Animated.timing(logoOpacity, { toValue: 1, duration: 700, useNativeDriver: nd }),
      Animated.parallel([
        Animated.timing(cardOpacity, { toValue: 1, duration: 500, useNativeDriver: nd }),
        Animated.timing(cardSlide, { toValue: 0, duration: 500, useNativeDriver: nd }),
        Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: nd }),
      ]),
      Animated.timing(footerOpacity, { toValue: 1, duration: 400, useNativeDriver: nd }),
    ]).start();
  }

  function startBiometricAnimation() {
    const nd = Platform.OS !== 'web';
    Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(biometricPulse, { toValue: 1.12, duration: 900, useNativeDriver: nd }),
          Animated.timing(biometricGlow, { toValue: 1, duration: 900, useNativeDriver: nd }),
        ]),
        Animated.parallel([
          Animated.timing(biometricPulse, { toValue: 1, duration: 900, useNativeDriver: nd }),
          Animated.timing(biometricGlow, { toValue: 0, duration: 900, useNativeDriver: nd }),
        ]),
      ])
    ).start();
  }

  async function checkBiometricAvailability(): Promise<boolean> {
    try {
      const { available, type } = await checkBiometricAvailable();
      if (available) {
        setBiometricAvailable(true);
        setBiometricType(type === 'faceid' ? 'faceid' : 'fingerprint');
        return true;
      }
    } catch {}
    return false;
  }

  async function triggerBiometricAuth() {
    if (!lastUser) return;
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const result = await authenticateBiometric(`Bem-vindo de volta, ${lastUser.nome.split(' ')[0]}`);

      if (result.success) {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        setIsLoading(true);
        const authUser: AuthUser = { ...lastUser, biometricEnabled: true, avatar: lastUser.avatar };
        await login(authUser);
        router.replace(getRouteForRole(lastUser.role) as any);
      }
    } catch (e) {
      console.error('Biometric auth error:', e);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleBiometricAuth() {
    const { available: bioAvailableNow } = await checkBiometricAvailable();
    if (!bioAvailableNow) {
      showAlert('Não disponível', 'Autenticação biométrica não está disponível neste dispositivo.');
      return;
    }
    if (showBiometricWelcome && lastUser) {
      await triggerBiometricAuth();
      return;
    }
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const escolaNome = config?.nomeEscola || 'Super Escola';
      const result = await authenticateBiometric(`Autentique-se para aceder ao ${escolaNome}`);
      if (result.success) {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        const emailTrimmed = email.toLowerCase().trim();
        if (!emailTrimmed) {
          showAlert('Email necessário', 'Introduza primeiro o seu email e depois use a autenticação biométrica.');
          return;
        }
        setIsLoading(true);
        const bioAvatar = lastUser?.email?.toLowerCase() === emailTrimmed ? lastUser?.avatar : undefined;
        if (emailTrimmed === CEO_ACCOUNT.email) {
          const u: AuthUser = { id: CEO_ACCOUNT.id, nome: CEO_ACCOUNT.nome, email: CEO_ACCOUNT.email, role: CEO_ACCOUNT.role, escola: escolaNome, biometricEnabled: true, avatar: bioAvatar };
          await login(u); router.replace(getRouteForRole(CEO_ACCOUNT.role) as any);
        } else if (emailTrimmed === FINANCEIRO_ACCOUNT.email) {
          const u: AuthUser = { id: FINANCEIRO_ACCOUNT.id, nome: FINANCEIRO_ACCOUNT.nome, email: FINANCEIRO_ACCOUNT.email, role: FINANCEIRO_ACCOUNT.role, escola: escolaNome, biometricEnabled: true, avatar: bioAvatar };
          await login(u); router.replace(getRouteForRole(FINANCEIRO_ACCOUNT.role) as any);
        } else if (emailTrimmed === SECRETARIA_ACCOUNT.email) {
          const u: AuthUser = { id: SECRETARIA_ACCOUNT.id, nome: SECRETARIA_ACCOUNT.nome, email: SECRETARIA_ACCOUNT.email, role: SECRETARIA_ACCOUNT.role, escola: escolaNome, biometricEnabled: true, avatar: bioAvatar };
          await login(u); router.replace(getRouteForRole(SECRETARIA_ACCOUNT.role) as any);
        } else if (emailTrimmed === RH_ACCOUNT.email) {
          const u: AuthUser = { id: RH_ACCOUNT.id, nome: RH_ACCOUNT.nome, email: RH_ACCOUNT.email, role: RH_ACCOUNT.role, escola: escolaNome, biometricEnabled: true, avatar: bioAvatar };
          await login(u); router.replace(getRouteForRole(RH_ACCOUNT.role) as any);
        } else {
          const found = users.find(u => u.email.toLowerCase() === emailTrimmed && u.ativo);
          if (found) {
            const u: AuthUser = { id: found.id, nome: found.nome, email: found.email, role: found.role, escola: found.escola, biometricEnabled: true, avatar: bioAvatar, telefone: (found as any).telefone ?? '', genero: (found as any).genero ?? '', dataNascimento: (found as any).dataNascimento ?? '', ...((found as any).alunoId ? { alunoId: (found as any).alunoId } : {}), ...((found as any).cursoId ? { cursoId: (found as any).cursoId } : {}) };
            await login(u); router.replace(getRouteForRole(found.role) as any);
          } else {
            showAlert('Utilizador não encontrado', 'Não existe conta activa com esse email.');
          }
        }
      }
    } catch (e) {
      console.error('Biometric auth error:', e);
    } finally {
      setIsLoading(false);
    }
  }

  const MIN_LOADING_MS = 2200;

  async function handleLogin(force = false) {
    setFieldError(null);
    if (!email.trim() && !senha.trim()) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      setFieldError({ field: 'email', message: 'Preencha o email para continuar.' });
      return;
    }
    if (!email.trim()) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      setFieldError({ field: 'email', message: 'Introduza o seu email institucional.' });
      return;
    }
    if (!senha.trim()) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      setFieldError({ field: 'senha', message: 'Introduza a sua senha de acesso.' });
      return;
    }
    setIsLoading(true);
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const loadingStart = Date.now();
    const waitMinTime = () => {
      const elapsed = Date.now() - loadingStart;
      const remaining = MIN_LOADING_MS - elapsed;
      return remaining > 0 ? new Promise(r => setTimeout(r, remaining)) : Promise.resolve();
    };
    const emailTrimmed = email.toLowerCase().trim();
    const savedAvatar = lastUser?.email?.toLowerCase() === emailTrimmed ? lastUser?.avatar : undefined;
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailTrimmed, senha, ...(force ? { force: true } : {}) }),
      });
      const data = await res.json();
      if (res.status === 409 && data.alreadyLoggedIn) {
        await waitMinTime();
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
        setIsLoading(false);
        setDuplicateSessao(data.sessao ?? {});
        return;
      }
      if (res.status === 429 && data.bloqueado) {
        await waitMinTime();
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
        showAlert(
          'Acesso Temporariamente Bloqueado',
          data.error ?? `Demasiadas tentativas falhadas. Tente novamente mais tarde.`
        );
        setIsLoading(false);
        return;
      }
      if (!res.ok) {
        await waitMinTime();
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
        const errField = data.field as 'email' | 'senha' | undefined;
        if (errField === 'email' || errField === 'senha') {
          setFieldError({ field: errField, message: data.error ?? 'Erro de acesso.' });
        } else {
          showAlert('Acesso Negado', data.error ?? 'O email ou a senha estão incorrectos.\nVerifique os dados e tente novamente.');
        }
        setIsLoading(false);
        return;
      }
      if (data.otpRequired) {
        await waitMinTime();
        setIsLoading(false);
        setOtpCode('');
        setOtpError('');
        setOtpPending({ phone: data.phone ?? '', maskedEmail: data.email ?? '', channel: data.channel ?? 'console', email: emailTrimmed, tooSoon: data.tooSoon });
        startOtpResendCooldown(60);
        setTimeout(() => otpInputRef.current?.focus(), 400);
        return;
      }
      if (data.pending && data.approvalToken) {
        await waitMinTime();
        setIsLoading(false);
        setApprovalPending({ token: data.approvalToken, email: emailTrimmed, expiresAt: data.expiresAt });
        return;
      }
      await saveAuthToken(data.token);
      const prevBiometric = lastUser?.email?.toLowerCase() === emailTrimmed ? (lastUser?.biometricEnabled ?? false) : false;
      const u: AuthUser = {
        id: data.user.id,
        nome: data.user.nome,
        email: data.user.email,
        role: data.user.role,
        escola: data.user.escola ?? '',
        biometricEnabled: prevBiometric,
        avatar: data.user.avatar || savedAvatar || undefined,
        telefone: data.user.telefone ?? '',
        genero: data.user.genero ?? '',
        dataNascimento: data.user.dataNascimento ?? '',
        ...(data.user.alunoId ? { alunoId: data.user.alunoId } : {}),
        ...(data.user.cursoId ? { cursoId: data.user.cursoId } : {}),
      };
      // Guarda credencial offline (hash) + snapshot do user para reabrir a sessão sem rede.
      await saveOfflineCredential(emailTrimmed, senha, {
        id: u.id,
        nome: u.nome,
        email: u.email,
        role: u.role,
        escola: u.escola,
        avatar: u.avatar,
        telefone: u.telefone,
        genero: u.genero,
        dataNascimento: u.dataNascimento,
        ...(u.alunoId ? { alunoId: u.alunoId } : {}),
        ...(u.cursoId ? { cursoId: u.cursoId } : {}),
      });
      await waitMinTime();
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      if (data.primeiroAcesso) {
        setIsLoading(false);
        setPrimeiroAcesso({ visible: true, user: u, route: getDestinationRoute(data.user.role, data.licencaExpirada) });
        return;
      }
      await completarLoginComVerificacaoDados(u, getDestinationRoute(data.user.role, data.licencaExpirada));
    } catch (e) {
      // Sem rede? Tenta autenticar localmente com a credencial guardada.
      if (isNetworkError(e)) {
        try {
          const result = await checkOfflineCredential(emailTrimmed, senha);
          if (result.ok) {
            const snap = result.user;
            // Preferimos o snapshot guardado com a credencial; se vier vazio (formato
            // antigo) caímos no `lastUser` como compatibilidade.
            const restored: AuthUser | null = snap.id
              ? {
                  id: snap.id,
                  nome: snap.nome,
                  email: snap.email,
                  role: snap.role,
                  escola: snap.escola ?? '',
                  biometricEnabled: lastUser?.email?.toLowerCase() === emailTrimmed ? (lastUser?.biometricEnabled ?? false) : false,
                  avatar: snap.avatar,
                  telefone: (snap as any).telefone ?? '',
                  genero: (snap as any).genero ?? '',
                  dataNascimento: (snap as any).dataNascimento ?? '',
                  ...((snap as any).alunoId ? { alunoId: (snap as any).alunoId } : {}),
                  ...((snap as any).cursoId ? { cursoId: (snap as any).cursoId } : {}),
                }
              : (lastUser && lastUser.email.toLowerCase() === emailTrimmed
                  ? { ...lastUser, avatar: lastUser.avatar }
                  : null);
            if (restored) {
              await waitMinTime();
              await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
              await login(restored, { offline: true });
              router.replace(getRouteForRole(restored.role) as any);
              return;
            }
          }
          await waitMinTime();
          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
          if (result.ok === true) {
            // Senha bateu mas o perfil local foi limpo (ex.: logout) e a credencial
            // está num formato antigo sem snapshot do utilizador.
            showAlert(
              'Acesso Offline Indisponível',
              'A sua senha está correcta, mas o perfil local foi limpo deste dispositivo. Para poder voltar a entrar sem Internet, faça um login com ligação à Internet pelo menos uma vez.'
            );
          } else if (result.reason === 'wrong-password') {
            setFieldError({ field: 'senha', message: 'Senha incorrecta para o acesso offline.' });
          } else if (result.reason === 'no-credential') {
            showAlert(
              'Sem Ligação à Internet',
              'Não conseguimos contactar o servidor e este dispositivo ainda não tem acesso offline guardado para este email. Faça pelo menos um login com Internet primeiro.'
            );
          } else {
            showAlert(
              'Sem Ligação à Internet',
              'Não foi possível contactar o servidor. Use exactamente o mesmo email e senha do último acesso online neste dispositivo.'
            );
          }
          setIsLoading(false);
          return;
        } catch {
          await waitMinTime();
          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
          showAlert(
            'Sem Ligação à Internet',
            'Não foi possível contactar o servidor. Use exactamente o mesmo email e senha do último acesso online neste dispositivo.'
          );
          setIsLoading(false);
          return;
        }
      }
      await waitMinTime();
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      showAlert('Erro de Ligação', 'Não foi possível contactar o servidor. Verifique a sua ligação e tente novamente.');
      setIsLoading(false);
    }
  }

  async function handleAlterarSenhaPrimeiroAcesso() {
    setPaErro('');
    if (!paNovaSenha.trim()) { setPaErro('Introduza a nova senha.'); return; }
    if (paNovaSenha.length < 8) { setPaErro('A senha deve ter pelo menos 8 caracteres.'); return; }
    if (!/[A-Z]/.test(paNovaSenha)) { setPaErro('A senha deve ter pelo menos uma letra maiúscula.'); return; }
    if (!/[0-9]/.test(paNovaSenha)) { setPaErro('A senha deve ter pelo menos um número.'); return; }
    if (paNovaSenha !== paConfirmar) { setPaErro('As senhas não coincidem.'); return; }
    setPaLoading(true);
    try {
      const res = await fetch('/api/primeiro-acesso/alterar-senha', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${await (await import('@/context/AuthContext')).getAuthToken()}` },
        body: JSON.stringify({ novaSenha: paNovaSenha }),
      });
      const data = await res.json();
      if (!res.ok) { setPaErro(data.error ?? 'Erro ao alterar a senha.'); setPaLoading(false); return; }
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setPaSucesso(true);
      setTimeout(async () => {
        setPrimeiroAcesso(prev => ({ ...prev, visible: false }));
        await completarLoginComVerificacaoDados(primeiroAcesso.user!, primeiroAcesso.route);
      }, 1800);
    } catch {
      setPaErro('Não foi possível contactar o servidor. Tente novamente.');
      setPaLoading(false);
    }
  }

  async function handleCompletarDadosEmFalta() {
    setDefErro('');
    const campos = dadosEmFalta.campos;
    for (const c of campos) {
      if (!defForm[c]?.trim()) {
        const labels: Record<string, string> = {
          telefone: 'Telefone', dataNascimento: 'Data de nascimento', genero: 'Género',
          bi: 'BI / NIF', encarregadoNome: 'Nome do encarregado', encarregadoTelefone: 'Telefone do encarregado',
          encarregadoRelacao: 'Relação com o aluno',
        };
        setDefErro(`O campo "${labels[c] ?? c}" é obrigatório.`);
        return;
      }
    }
    setDefLoading(true);
    try {
      const { getAuthToken: getToken } = await import('@/context/AuthContext');
      const tok = await getToken();
      const res = await fetch('/api/minha-conta/completar-perfil', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: `Bearer ${tok}` } : {}) },
        body: JSON.stringify(defForm),
      });
      const data = await res.json();
      if (!res.ok) { setDefErro(data.error ?? 'Erro ao guardar os dados.'); setDefLoading(false); return; }
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setDadosEmFalta(prev => ({ ...prev, visible: false }));
      if (pendingLoginUser) { await login(pendingLoginUser); setPendingLoginUser(null); }
      router.replace(dadosEmFalta.route as any);
    } catch {
      setDefErro('Não foi possível guardar. Tente novamente.');
      setDefLoading(false);
    }
  }

  function handleSwitchAccount() {
    clearLastUser();
    setShowBiometricWelcome(false);
    biometricPulse.stopAnimation();
    biometricGlow.stopAnimation();
  }

  function startOtpResendCooldown(secs = 60) {
    if (otpResendRef.current) clearInterval(otpResendRef.current);
    setOtpResendSecs(secs);
    otpResendRef.current = setInterval(() => {
      setOtpResendSecs(prev => {
        if (prev <= 1) { clearInterval(otpResendRef.current!); return 0; }
        return prev - 1;
      });
    }, 1000);
  }

  async function handleOtpVerify(codeOverride?: string) {
    const code = codeOverride ?? otpCode;
    if (code.length !== 6 || otpLoading) return;
    setOtpLoading(true);
    setOtpError('');
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      const res = await fetch('/api/auth/otp/verificar-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: otpPending?.email, codigo: code }),
      });
      const data = await res.json();
      if (!res.ok) {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
        setOtpError(data.error ?? 'Código inválido. Tente novamente.');
        setOtpCode('');
        setTimeout(() => otpInputRef.current?.focus(), 100);
        return;
      }
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      await saveAuthToken(data.token);
      const emailTrimmed = otpPending?.email ?? '';
      const savedAvatar = lastUser?.email?.toLowerCase() === emailTrimmed ? lastUser?.avatar : undefined;
      const prevBiometric = lastUser?.email?.toLowerCase() === emailTrimmed ? (lastUser?.biometricEnabled ?? false) : false;
      const u: AuthUser = {
        id: data.user.id, nome: data.user.nome, email: data.user.email,
        role: data.user.role, escola: data.user.escola ?? '',
        biometricEnabled: prevBiometric, avatar: data.user.avatar || savedAvatar || undefined,
        telefone: data.user.telefone ?? '', genero: data.user.genero ?? '',
        dataNascimento: data.user.dataNascimento ?? '',
        ...(data.user.alunoId ? { alunoId: data.user.alunoId } : {}),
        ...(data.user.cursoId ? { cursoId: data.user.cursoId } : {}),
      };
      setOtpPending(null);
      if (data.primeiroAcesso) {
        setIsLoading(false);
        setPrimeiroAcesso({ visible: true, user: u, route: getDestinationRoute(data.user.role, data.licencaExpirada) });
        return;
      }
      await completarLoginComVerificacaoDados(u, getDestinationRoute(data.user.role, data.licencaExpirada));
    } catch {
      setOtpError('Não foi possível contactar o servidor. Verifique a sua ligação.');
    } finally {
      setOtpLoading(false);
    }
  }

  async function handleOtpResend() {
    if (!otpPending) return;
    setOtpCode('');
    setOtpError('');
    setOtpLoading(true);
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: otpPending.email, senha }),
      });
      const data = await res.json();
      if (data.otpRequired) {
        startOtpResendCooldown(60);
        setTimeout(() => otpInputRef.current?.focus(), 200);
      } else {
        setOtpPending(null);
      }
    } catch {
      setOtpError('Não foi possível reenviar o código. Verifique a ligação.');
    } finally {
      setOtpLoading(false);
    }
  }

  const topPad = Platform.OS === 'web' ? 48 : insets.top;
  // Em mobile web (não desktop), adiciona espaço extra no fundo para o botão
  // não ficar tapado pela barra de navegação do browser ou pelo banner do APK
  const bottomPad = Platform.OS === 'web'
    ? (isDesktop ? 32 : 96)
    : insets.bottom;

  const biometricIconName = biometricType === 'faceid' ? 'scan-outline' : 'finger-print-outline';
  const biometricLabel = biometricType === 'faceid' ? 'Face ID' : 'Impressão Digital';

  const getInitials = (nome: string) => {
    const parts = nome.trim().split(' ');
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };


  const biometricWelcomeScreen = (
    <Animated.View style={[styles.biometricWelcomeContainer, { opacity: cardOpacity, transform: [{ translateY: cardSlide }] }]}>
      <View style={styles.bwCard}>
        <View style={styles.cardTopAccent} />

        <View style={styles.bwAvatarSection}>
          <View style={styles.bwAvatarOuter}>
            {lastUser?.avatar ? (
              <Image
                source={{ uri: lastUser.avatar }}
                style={styles.bwAvatarPhoto}
              />
            ) : (
              <View style={styles.bwAvatarInner}>
                <Text style={styles.bwAvatarInitials}>{getInitials(lastUser?.nome || '')}</Text>
              </View>
            )}
          </View>
          <View style={styles.bwRoleBadge}>
            <Text style={styles.bwRoleText}>{getRoleLabel(lastUser?.role || '', lastUser?.genero)}</Text>
          </View>
        </View>

        <View style={styles.bwTextSection}>
          <Text style={styles.bwGreeting}>Bem-vindo de volta</Text>
          <Text style={styles.bwName}>{lastUser?.nome}</Text>
          <Text style={styles.bwSchool}>{lastUser?.escola}</Text>
        </View>

        <TouchableOpacity
          style={styles.bwBiometricButton}
          onPress={triggerBiometricAuth}
          activeOpacity={0.8}
          disabled={isLoading}
        >
          <Animated.View
            style={[
              styles.bwBiometricGlow,
              {
                opacity: biometricGlow,
                transform: [{ scale: biometricPulse }],
              },
            ]}
          />
          <Animated.View style={[styles.bwBiometricIconWrap, { transform: [{ scale: biometricPulse }] }]}>
            {isLoading ? (
              <Ionicons name="checkmark-circle" size={52} color={Colors.gold} />
            ) : (
              <Ionicons name={biometricIconName} size={52} color={Colors.gold} />
            )}
          </Animated.View>
          <Text style={styles.bwBiometricLabel}>
            {isLoading ? 'A autenticar...' : `Toque para usar ${biometricLabel}`}
          </Text>
        </TouchableOpacity>

        <View style={styles.bwDividerRow}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>ou</Text>
          <View style={styles.dividerLine} />
        </View>

        <TouchableOpacity
          style={styles.bwSwitchBtn}
          onPress={handleSwitchAccount}
          activeOpacity={0.8}
        >
          <Ionicons name="person-outline" size={15} color={Colors.textMuted} />
          <Text style={styles.bwSwitchText}>Usar outra conta</Text>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );

  const formCard = (
    <Animated.View style={[styles.card, !isDesktop && { backgroundColor: 'rgba(9,18,50,0.96)', borderColor: 'rgba(212,175,55,0.28)' }, { opacity: cardOpacity, transform: [{ translateY: cardSlide }] }]}>
      <View style={styles.cardTopAccent} />

      <View style={styles.cardHeaderRow}>
        <View style={styles.lockBadge}>
          <Ionicons name="shield-checkmark" size={16} color={Colors.gold} />
        </View>
        <View style={styles.cardHeaderTexts}>
          <Text style={styles.cardTitle}>Iniciar Sessão</Text>
        </View>
      </View>

      <WebFormWrapper onSubmit={handleLogin}>
      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>Email Institucional</Text>
        <View style={[
          styles.inputBox,
          focusedField === 'email' && styles.inputBoxFocused,
          fieldError?.field === 'email' && styles.inputBoxError,
        ]}>
          <Ionicons
            name="mail-outline"
            size={17}
            color={fieldError?.field === 'email' ? '#e74c3c' : focusedField === 'email' ? Colors.gold : Colors.textMuted}
            style={styles.inputIcon}
          />
          <TextInput
            style={styles.inputText}
            value={email}
            onChangeText={v => { setEmail(v.replace(/\s/g, '')); setEmailExists(false); setCredentialsValid(false); if (fieldError?.field === 'email') setFieldError(null); }}
            placeholder="utilizador@escola.ao"
            placeholderTextColor={Colors.textMuted}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            returnKeyType="next"
            onSubmitEditing={() => senhaRef.current?.focus()}
            onFocus={() => setFocusedField('email')}
            onBlur={() => setFocusedField(null)}
            nativeID="login-email"
            {...(Platform.OS === 'web' ? { name: 'email', id: 'login-email' } as any : {})}
          />
          <Animated.View style={{
            opacity: emailCheckAnim,
            transform: [{ scale: emailCheckAnim.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] }) }],
            marginLeft: 6,
          }}>
            <Ionicons name="checkmark-circle" size={18} color="#22C55E" />
          </Animated.View>
        </View>
        {fieldError?.field === 'email' && (
          <View style={styles.fieldErrorRow}>
            <Ionicons name="alert-circle-outline" size={13} color="#e74c3c" />
            <Text style={styles.fieldErrorText}>{fieldError.message}</Text>
          </View>
        )}
      </View>

      <View style={styles.inputGroup}>
        <View style={styles.senhaLabelRow}>
          <Text style={styles.inputLabel}>Senha de Acesso</Text>
          <TouchableOpacity onPress={() => router.push('/esqueceu-senha' as any)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={styles.forgotLink}>Esqueceu a senha?</Text>
          </TouchableOpacity>
        </View>
        <View style={[
          styles.inputBox,
          focusedField === 'senha' && styles.inputBoxFocused,
          fieldError?.field === 'senha' && styles.inputBoxError,
        ]}>
          <Ionicons
            name="lock-closed-outline"
            size={17}
            color={fieldError?.field === 'senha' ? '#e74c3c' : focusedField === 'senha' ? Colors.gold : Colors.textMuted}
            style={styles.inputIcon}
          />
          <TextInput
            ref={senhaRef}
            style={styles.inputText}
            value={senha}
            onChangeText={v => { setSenha(v.replace(/\s/g, '')); setCredentialsValid(false); if (fieldError?.field === 'senha') setFieldError(null); }}
            placeholder="••••••••••"
            placeholderTextColor={Colors.textMuted}
            secureTextEntry={!showSenha}
            autoCapitalize="none"
            autoComplete="current-password"
            returnKeyType="go"
            onSubmitEditing={handleLogin}
            onFocus={() => setFocusedField('senha')}
            onBlur={() => setFocusedField(null)}
            nativeID="login-password"
            {...(Platform.OS === 'web' ? { name: 'password', id: 'login-password' } as any : {})}
          />
          <View style={styles.inputRightIcons}>
            <Animated.View style={{
              opacity: credCheckAnim,
              transform: [{ scale: credCheckAnim.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] }) }],
            }}>
              <Ionicons name="checkmark-circle" size={15} color="#22C55E" />
            </Animated.View>
            <TouchableOpacity
              onPress={() => setShowSenha(!showSenha)}
              style={styles.eyeBtn}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name={showSenha ? 'eye-off-outline' : 'eye-outline'} size={17} color={Colors.textMuted} />
            </TouchableOpacity>
          </View>
        </View>
        {fieldError?.field === 'senha' && (
          <View style={styles.fieldErrorRow}>
            <Ionicons name="alert-circle-outline" size={13} color="#e74c3c" />
            <Text style={styles.fieldErrorText}>{fieldError.message}</Text>
          </View>
        )}
      </View>

      <TouchableOpacity
        style={[styles.loginBtn, isLoading && styles.loginBtnDisabled]}
        onPress={handleLogin}
        disabled={isLoading}
        activeOpacity={0.88}
      >
        <LinearGradient
          colors={['#1a5e8a', '#2471a3', '#2e86c1']}
          style={styles.loginBtnGrad}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
        >
          {isLoading ? (
            <AppLoader size="small" color="#fff" />
          ) : (
            <Ionicons name="log-in-outline" size={20} color="#fff" />
          )}
          <Text style={styles.loginBtnText}>{isLoading ? 'A autenticar...' : 'Autenticar'}</Text>
        </LinearGradient>
      </TouchableOpacity>
      </WebFormWrapper>

      {biometricAvailable && Platform.OS !== 'web' && (
        <View style={styles.biometricWrap}>
          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>ou</Text>
            <View style={styles.dividerLine} />
          </View>
          <TouchableOpacity style={styles.biometricBtn} onPress={handleBiometricAuth} activeOpacity={0.8}>
            <View style={styles.biometricIconWrap}>
              <Ionicons
                name={biometricIconName}
                size={24}
                color={Colors.gold}
              />
            </View>
            <Text style={styles.biometricText}>
              {biometricType === 'faceid' ? 'Entrar com Face ID' : 'Entrar com Impressão Digital'}
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </Animated.View>
  );

  // Converte "DD/MM/AAAA" → Date (meia-noite local)
  function parseDatePT(s: string | null): Date | null {
    if (!s) return null;
    const parts = s.split('/');
    if (parts.length !== 3) return null;
    const [d, m, y] = parts.map(Number);
    if (!d || !m || !y) return null;
    return new Date(y, m - 1, d);
  }

  function calcularDiasRestantes(dataFim: string | null, dataInicio: string | null): { label: string; cor: string } | null {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const fim = parseDatePT(dataFim);
    const inicio = parseDatePT(dataInicio);
    if (fim) {
      const diff = Math.round((fim.getTime() - hoje.getTime()) / 86400000);
      if (diff > 1) return { label: `${diff} dias restantes`, cor: '#22C55E' };
      if (diff === 1) return { label: '1 dia restante', cor: '#F59E0B' };
      if (diff === 0) return { label: 'Encerra hoje', cor: '#F59E0B' };
      return { label: 'Período encerrado', cor: '#EF4444' };
    }
    if (inicio) {
      const diff = Math.round((inicio.getTime() - hoje.getTime()) / 86400000);
      if (diff > 0) return { label: `Começa em ${diff} dia${diff > 1 ? 's' : ''}`, cor: '#3B82F6' };
      return { label: 'Em andamento', cor: '#22C55E' };
    }
    return null;
  }

  const countdown = calcularDiasRestantes(inscricaoDataFim, inscricaoDataInicio);
  const mostrarCardInscricao = inscricoesAbertas || !!(inscricaoDataInicio || inscricaoDataFim);

  const kioskCard = (
    <Animated.View style={[styles.registerSection, { opacity: fadeAnim }]}>
      <TouchableOpacity
        activeOpacity={0.88}
        onPress={() => {
          if (Platform.OS === 'web') {
            (window as any).location.href = '/portaria/kiosk';
          } else {
            router.push('/portaria/kiosk' as any);
          }
        }}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 14,
          backgroundColor: 'rgba(14,40,22,0.85)',
          borderRadius: 16,
          borderWidth: 1,
          borderColor: 'rgba(34,197,94,0.28)',
          paddingHorizontal: 16,
          paddingVertical: 14,
        }}
      >
        <View style={{
          width: 44,
          height: 44,
          borderRadius: 12,
          backgroundColor: 'rgba(34,197,94,0.15)',
          borderWidth: 1,
          borderColor: 'rgba(34,197,94,0.35)',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <Ionicons name="qr-code-outline" size={22} color="#22C55E" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 13, fontFamily: 'Inter_700Bold', color: '#22C55E', letterSpacing: 0.1 }}>
            Portaria — Registo por QR Code
          </Text>
          <Text style={{ fontSize: 11, fontFamily: 'Inter_400Regular', color: 'rgba(255,255,255,0.45)', marginTop: 2 }}>
            Marcar presença sem necessidade de login
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color="rgba(34,197,94,0.6)" />
      </TouchableOpacity>
    </Animated.View>
  );

  const registerCard = (
    <Animated.View style={[styles.registerSection, { opacity: fadeAnim }]}>
      <View style={[styles.registerCard, !isDesktop && { backgroundColor: 'rgba(20,50,90,0.88)', borderColor: 'rgba(52,152,219,0.30)' }]}>
        <View style={styles.registerLeft}>
          <View style={styles.registerIconWrap}>
            <Ionicons name="person-add-outline" size={18} color="#3498DB" />
          </View>
          <View style={styles.registerTexts}>
            <Text style={styles.registerTitle}>Novo Estudante?</Text>
            <Text style={styles.registerDesc}>Solicite a sua matrícula online</Text>
            {(inscricaoDataInicio || inscricaoDataFim) && (
              <Text style={{ fontSize: 10, color: '#22C55E', marginTop: 2, fontFamily: 'Inter_500Medium' }}>
                {inscricaoDataInicio && inscricaoDataFim
                  ? `Período: ${inscricaoDataInicio} — ${inscricaoDataFim}`
                  : inscricaoDataInicio
                    ? `Desde ${inscricaoDataInicio}`
                    : `Até ${inscricaoDataFim}`}
              </Text>
            )}
            {countdown && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 }}>
                <Ionicons name="time-outline" size={11} color={countdown.cor} />
                <Text style={{ fontSize: 11, color: countdown.cor, fontFamily: 'Inter_700Bold' }}>
                  {countdown.label}
                </Text>
              </View>
            )}
          </View>
        </View>
        {inscricoesAbertas ? (
          <TouchableOpacity
            style={styles.registerBtn}
            onPress={() => router.push('/registro' as any)}
            activeOpacity={0.85}
          >
            <Text style={styles.registerBtnText}>Inscrição</Text>
            <Ionicons name="arrow-forward" size={13} color="#3498DB" />
          </TouchableOpacity>
        ) : (
          <View style={[styles.registerBtn, { backgroundColor: '#EF444418', borderColor: '#EF444444', borderWidth: 1, opacity: 0.7 }]}>
            <Ionicons name="lock-closed" size={12} color="#EF4444" />
            <Text style={[styles.registerBtnText, { color: '#EF4444', marginLeft: 4 }]}>Encerrado</Text>
          </View>
        )}
      </View>
      <TouchableOpacity
        style={[styles.provisorioBtn, !inscricoesAbertas && { opacity: 0.45, borderColor: '#555' }]}
        onPress={() => inscricoesAbertas && router.push('/login-provisorio' as any)}
        activeOpacity={inscricoesAbertas ? 0.85 : 1}
        disabled={!inscricoesAbertas}
      >
        <Ionicons name={inscricoesAbertas ? "person-circle-outline" : "lock-closed-outline"} size={15} color={inscricoesAbertas ? Colors.gold : '#888'} />
        <Text style={[styles.provisorioBtnText, !inscricoesAbertas && { color: '#888' }]}>Já tenho uma inscrição — Acompanhar processo</Text>
        <Ionicons name="chevron-forward" size={13} color={inscricoesAbertas ? Colors.gold : '#888'} />
      </TouchableOpacity>
    </Animated.View>
  );

  const footerView = (
    <Animated.View style={[styles.footer, { opacity: footerOpacity }]}>
      <View style={styles.angolaBanner}>
        <View style={[styles.angolaStripe, { backgroundColor: '#CC0000' }]} />
        <View style={[styles.angolaStripe, { backgroundColor: '#000000' }]} />
      </View>
      <Text style={styles.footerText}>{config.nomeEscola}</Text>
      <Text style={styles.footerSub}>Isaias Osvaldo & Gemima Delfina - Queta</Text>
    </Animated.View>
  );

  const alertModalView = (
    <Modal
      visible={alertModal.visible}
      transparent
      animationType="fade"
      onRequestClose={() => setAlertModal(p => ({ ...p, visible: false }))}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalCard}>
          <View style={[styles.modalIconWrap, { backgroundColor: alertModal.type === 'error' ? '#FF453A22' : '#22C55E22' }]}>
            <Ionicons
              name={alertModal.type === 'error' ? 'alert-circle' : 'checkmark-circle'}
              size={36}
              color={alertModal.type === 'error' ? '#FF453A' : '#22C55E'}
            />
          </View>
          <Text style={styles.modalTitle}>{alertModal.title}</Text>
          <Text style={styles.modalMessage}>{alertModal.message}</Text>
          <TouchableOpacity
            style={[styles.modalBtn, { backgroundColor: alertModal.type === 'error' ? '#FF453A' : '#22C55E' }]}
            onPress={() => setAlertModal(p => ({ ...p, visible: false }))}
            activeOpacity={0.85}
          >
            <Text style={styles.modalBtnText}>OK, entendi</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );

  function formatTs(ms: number): string {
    if (!ms) return '—';
    return new Date(ms).toLocaleString('pt-AO', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
  }

  const duplicateSessaoModal = (
    <Modal
      visible={!!duplicateSessao}
      transparent
      animationType="fade"
      onRequestClose={() => setDuplicateSessao(null)}
    >
      <View style={styles.modalOverlay}>
        <View style={[styles.modalCard, { maxWidth: 380, paddingHorizontal: 24, paddingTop: 28, paddingBottom: 24 }]}>
          <View style={[styles.modalIconWrap, { backgroundColor: '#F0A50022', marginBottom: 14 }]}>
            <Ionicons name="warning" size={38} color="#F0A500" />
          </View>
          <Text style={styles.modalTitle}>Sessão Já Activa</Text>
          <Text style={[styles.modalMessage, { marginBottom: 16 }]}>
            Esta conta já se encontra ligada noutro dispositivo ou browser. Não é permitido ter duas sessões simultâneas com as mesmas credenciais.
          </Text>

          {duplicateSessao && (
            <View style={{ width: '100%', backgroundColor: 'rgba(240,165,0,0.07)', borderRadius: 12, padding: 14, marginBottom: 20, borderWidth: 1, borderColor: 'rgba(240,165,0,0.15)', gap: 8 }}>
              <Text style={{ fontSize: 11, fontFamily: 'Inter_600SemiBold', color: 'rgba(240,165,0,0.7)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 }}>Sessão activa</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Ionicons name="phone-portrait-outline" size={15} color="rgba(255,255,255,0.5)" />
                <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.75)', fontFamily: 'Inter_400Regular', flex: 1 }}>{duplicateSessao.device || 'Dispositivo desconhecido'}</Text>
              </View>
              {!!duplicateSessao.ip && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Ionicons name="globe-outline" size={15} color="rgba(255,255,255,0.5)" />
                  <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.75)', fontFamily: 'Inter_400Regular', flex: 1 }}>{duplicateSessao.ip}</Text>
                </View>
              )}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Ionicons name="time-outline" size={15} color="rgba(255,255,255,0.5)" />
                <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.75)', fontFamily: 'Inter_400Regular', flex: 1 }}>Ligado em {formatTs(duplicateSessao.loginAt)}</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Ionicons name="pulse-outline" size={15} color="rgba(255,255,255,0.5)" />
                <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.75)', fontFamily: 'Inter_400Regular', flex: 1 }}>Última actividade: {formatTs(duplicateSessao.lastSeen)}</Text>
              </View>
            </View>
          )}

          <View style={{ width: '100%', gap: 10 }}>
            <TouchableOpacity
              style={{ backgroundColor: '#E53E3E', borderRadius: 12, paddingVertical: 13, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 }}
              onPress={() => { setDuplicateSessao(null); handleLogin(true); }}
              activeOpacity={0.85}
            >
              <Ionicons name="power" size={17} color="#fff" />
              <Text style={[styles.modalBtnText, { fontSize: 14 }]}>Forçar Entrada (encerrar outra sessão)</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={{ backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 12, paddingVertical: 13, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' }}
              onPress={() => setDuplicateSessao(null)}
              activeOpacity={0.85}
            >
              <Text style={{ fontSize: 14, fontFamily: 'Inter_600SemiBold', color: 'rgba(255,255,255,0.55)' }}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );

  const paRequisitos = [
    { ok: paNovaSenha.length >= 8, label: 'Mínimo 8 caracteres' },
    { ok: /[A-Z]/.test(paNovaSenha), label: 'Uma letra maiúscula' },
    { ok: /[0-9]/.test(paNovaSenha), label: 'Um número' },
    { ok: paNovaSenha.length > 0 && paNovaSenha === paConfirmar, label: 'Senhas coincidem' },
  ];

  const primeiroAcessoModal = (
    <Modal
      visible={primeiroAcesso.visible}
      transparent
      animationType="fade"
      onRequestClose={() => {}}
    >
      <View style={styles.modalOverlay}>
        <View style={[styles.modalCard, { maxWidth: 400, paddingHorizontal: 24 }]}>
          {paSucesso ? (
            <>
              <View style={[styles.modalIconWrap, { backgroundColor: '#22C55E22' }]}>
                <Ionicons name="checkmark-circle" size={40} color="#22C55E" />
              </View>
              <Text style={styles.modalTitle}>Senha definida!</Text>
              <Text style={styles.modalMessage}>A sua senha foi criada com sucesso. A redireccioná-lo para o sistema…</Text>
            </>
          ) : (
            <>
              <View style={[styles.modalIconWrap, { backgroundColor: '#D4AF3722' }]}>
                <Ionicons name="key-outline" size={36} color={Colors.gold} />
              </View>
              <Text style={styles.modalTitle}>Bem-vindo à Super Escola!</Text>
              <Text style={[styles.modalMessage, { marginBottom: 16 }]}>
                É o seu primeiro acesso. Por segurança, defina uma senha pessoal antes de continuar.
              </Text>

              <View style={{ width: '100%', gap: 10, marginBottom: 12 }}>
                <View style={{ position: 'relative' }}>
                  <TextInput
                    style={{
                      backgroundColor: 'rgba(255,255,255,0.07)',
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: paErro && !paNovaSenha ? '#FF453A' : 'rgba(255,255,255,0.12)',
                      color: '#fff',
                      fontSize: 15,
                      paddingVertical: 13,
                      paddingHorizontal: 16,
                      paddingRight: 48,
                      fontFamily: 'Inter_400Regular',
                    }}
                    placeholder="Nova senha"
                    placeholderTextColor="rgba(255,255,255,0.35)"
                    secureTextEntry={!paShowNova}
                    value={paNovaSenha}
                    onChangeText={v => { setPaNovaSenha(v); setPaErro(''); }}
                    autoCapitalize="none"
                    autoComplete="new-password"
                    nativeID="new-password"
                    {...(Platform.OS === 'web' ? { name: 'new-password', id: 'new-password' } as any : {})}
                  />
                  <TouchableOpacity
                    style={{ position: 'absolute', right: 14, top: 0, bottom: 0, justifyContent: 'center' }}
                    onPress={() => setPaShowNova(p => !p)}
                  >
                    <Ionicons name={paShowNova ? 'eye-off-outline' : 'eye-outline'} size={20} color="rgba(255,255,255,0.4)" />
                  </TouchableOpacity>
                </View>

                <View style={{ position: 'relative' }}>
                  <TextInput
                    style={{
                      backgroundColor: 'rgba(255,255,255,0.07)',
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: paErro && paNovaSenha !== paConfirmar && paConfirmar ? '#FF453A' : 'rgba(255,255,255,0.12)',
                      color: '#fff',
                      fontSize: 15,
                      paddingVertical: 13,
                      paddingHorizontal: 16,
                      paddingRight: 48,
                      fontFamily: 'Inter_400Regular',
                    }}
                    placeholder="Confirmar nova senha"
                    placeholderTextColor="rgba(255,255,255,0.35)"
                    secureTextEntry={!paShowConfirmar}
                    value={paConfirmar}
                    onChangeText={v => { setPaConfirmar(v); setPaErro(''); }}
                    autoCapitalize="none"
                    autoComplete="new-password"
                    nativeID="confirm-password"
                    {...(Platform.OS === 'web' ? { name: 'confirm-password', id: 'confirm-password' } as any : {})}
                  />
                  <TouchableOpacity
                    style={{ position: 'absolute', right: 14, top: 0, bottom: 0, justifyContent: 'center' }}
                    onPress={() => setPaShowConfirmar(p => !p)}
                  >
                    <Ionicons name={paShowConfirmar ? 'eye-off-outline' : 'eye-outline'} size={20} color="rgba(255,255,255,0.4)" />
                  </TouchableOpacity>
                </View>
              </View>

              <View style={{ width: '100%', gap: 5, marginBottom: 14 }}>
                {paRequisitos.map((r, i) => (
                  <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                    <Ionicons
                      name={r.ok ? 'checkmark-circle' : 'ellipse-outline'}
                      size={14}
                      color={r.ok ? '#22C55E' : 'rgba(255,255,255,0.3)'}
                    />
                    <Text style={{ fontSize: 12, fontFamily: 'Inter_400Regular', color: r.ok ? '#22C55E' : 'rgba(255,255,255,0.45)' }}>
                      {r.label}
                    </Text>
                  </View>
                ))}
              </View>

              {!!paErro && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                  <Ionicons name="alert-circle-outline" size={15} color="#FF453A" />
                  <Text style={{ fontSize: 13, color: '#FF453A', fontFamily: 'Inter_400Regular', flex: 1 }}>{paErro}</Text>
                </View>
              )}

              <TouchableOpacity
                style={[styles.modalBtn, {
                  backgroundColor: paRequisitos.every(r => r.ok) ? Colors.gold : 'rgba(212,175,55,0.3)',
                  width: '100%',
                  opacity: paLoading ? 0.7 : 1,
                }]}
                onPress={handleAlterarSenhaPrimeiroAcesso}
                disabled={paLoading}
                activeOpacity={0.85}
              >
                {paLoading ? (
                  <Text style={[styles.modalBtnText, { color: '#0A1432' }]}>A guardar…</Text>
                ) : (
                  <Text style={[styles.modalBtnText, { color: '#0A1432' }]}>Definir Senha e Entrar</Text>
                )}
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    </Modal>
  );

  const CAMPO_LABELS: Record<string, string> = {
    telefone: 'Telefone',
    dataNascimento: 'Data de Nascimento (AAAA-MM-DD)',
    genero: 'Género',
    bi: 'BI / NIF',
    nif: 'NIF',
    encarregadoNome: 'Nome do Encarregado de Educação',
    encarregadoTelefone: 'Telefone do Encarregado',
    encarregadoRelacao: 'Relação com o Aluno (ex: Pai, Mãe, Tio)',
    morada: 'Morada',
  };
  const CAMPO_KEYBOARDS: Record<string, any> = {
    telefone: 'phone-pad', dataNascimento: 'default',
    bi: 'default', nif: 'default',
    encarregadoTelefone: 'phone-pad',
  };
  const GENERO_OPTS = ['Masculino', 'Feminino'];

  const dadosEmFaltaModal = (
    <Modal visible={dadosEmFalta.visible} transparent animationType="fade" onRequestClose={() => {}}>
      <View style={styles.modalOverlay}>
        <View style={[styles.modalCard, { maxWidth: 440, paddingHorizontal: 24, maxHeight: '92%' }]}>
          <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
            <View style={{ height: 3, backgroundColor: '#3B82F6', borderRadius: 2, marginHorizontal: -24, marginBottom: 20, borderTopLeftRadius: 16, borderTopRightRadius: 16 }} />
            <View style={[styles.modalIconWrap, { backgroundColor: '#3B82F622', marginBottom: 10 }]}>
              <Ionicons name="person-outline" size={34} color="#3B82F6" />
            </View>
            <Text style={[styles.modalTitle, { fontSize: 17 }]}>Complete o seu Perfil</Text>
            <Text style={[styles.modalMessage, { marginBottom: 18 }]}>
              {dadosEmFalta.role === 'aluno'
                ? 'Por favor, preencha os seus dados pessoais e do seu encarregado de educação. Estes dados são necessários para a sua matrícula.'
                : 'Para garantir o correcto funcionamento do sistema, complete os seus dados pessoais antes de continuar.'}
            </Text>

            <View style={{ width: '100%', gap: 10, marginBottom: 14 }}>
              {dadosEmFalta.campos.map((campo) => {
                if (campo === 'genero') {
                  return (
                    <View key={campo}>
                      <Text style={{ color: 'rgba(255,255,255,0.55)', fontSize: 11, fontFamily: 'Inter_500Medium', marginBottom: 5 }}>
                        Género *
                      </Text>
                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        {GENERO_OPTS.map(g => (
                          <TouchableOpacity
                            key={g}
                            style={{
                              flex: 1, paddingVertical: 11, borderRadius: 10, borderWidth: 1,
                              borderColor: defForm.genero === g ? '#3B82F6' : 'rgba(255,255,255,0.12)',
                              backgroundColor: defForm.genero === g ? '#3B82F622' : 'rgba(255,255,255,0.05)',
                              alignItems: 'center',
                            }}
                            onPress={() => { setDefForm(f => ({ ...f, genero: g })); setDefErro(''); }}
                          >
                            <Text style={{ color: defForm.genero === g ? '#3B82F6' : 'rgba(255,255,255,0.6)', fontSize: 14, fontFamily: 'Inter_600SemiBold' }}>{g}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>
                  );
                }
                if (campo === 'dataNascimento') {
                  return (
                    <View key={campo}>
                      <Text style={{ color: 'rgba(255,255,255,0.55)', fontSize: 11, fontFamily: 'Inter_500Medium', marginBottom: 5 }}>
                        Data de Nascimento *
                      </Text>
                      <View style={{
                        backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 12, borderWidth: 1,
                        borderColor: defErro && !defForm[campo]?.trim() ? '#FF453A' : 'rgba(255,255,255,0.12)',
                      }}>
                        <DateInput
                          value={defForm.dataNascimento ?? ''}
                          onChangeText={v => { setDefForm(f => ({ ...f, dataNascimento: v })); setDefErro(''); }}
                          placeholder="Seleccionar data de nascimento"
                          placeholderTextColor="rgba(255,255,255,0.3)"
                          label="Data de Nascimento"
                        />
                      </View>
                      {!!defForm.dataNascimento && (() => {
                        const dn = defForm.dataNascimento; // YYYY-MM-DD
                        const hoje = new Date();
                        const nasc = new Date(dn + 'T00:00:00');
                        const idadeAnos = hoje.getFullYear() - nasc.getFullYear()
                          - (hoje.getMonth() < nasc.getMonth() || (hoje.getMonth() === nasc.getMonth() && hoje.getDate() < nasc.getDate()) ? 1 : 0);
                        const ehAniversario = hoje.getMonth() === nasc.getMonth() && hoje.getDate() === nasc.getDate();
                        const idadeValida = !isNaN(nasc.getTime()) && idadeAnos >= 0 && idadeAnos < 130;
                        return (
                          <View style={{ marginTop: 6, marginLeft: 2, gap: 2 }}>
                            <Text style={{ color: 'rgba(255,255,255,0.35)', fontSize: 11, fontFamily: 'Inter_400Regular' }}>
                              Seleccionado: {dn}
                            </Text>
                            {idadeValida && (
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                                <Text style={{ fontSize: 13, color: ehAniversario ? '#F0A500' : 'rgba(255,255,255,0.55)', fontFamily: 'Inter_600SemiBold' }}>
                                  {ehAniversario ? '🎂 ' : ''}{idadeAnos} anos{ehAniversario ? ' — Feliz Aniversário! 🎉' : ''}
                                </Text>
                              </View>
                            )}
                          </View>
                        );
                      })()}
                    </View>
                  );
                }
                return (
                  <View key={campo}>
                    <Text style={{ color: 'rgba(255,255,255,0.55)', fontSize: 11, fontFamily: 'Inter_500Medium', marginBottom: 5 }}>
                      {CAMPO_LABELS[campo] ?? campo} *
                    </Text>
                    <TextInput
                      style={{
                        backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 12, borderWidth: 1,
                        borderColor: defErro && !defForm[campo]?.trim() ? '#FF453A' : 'rgba(255,255,255,0.12)',
                        color: '#fff', fontSize: 14, paddingVertical: 12, paddingHorizontal: 14,
                        fontFamily: 'Inter_400Regular',
                      }}
                      placeholder={CAMPO_LABELS[campo] ?? campo}
                      placeholderTextColor="rgba(255,255,255,0.3)"
                      keyboardType={CAMPO_KEYBOARDS[campo] ?? 'default'}
                      value={defForm[campo] ?? ''}
                      onChangeText={v => { setDefForm(f => ({ ...f, [campo]: v })); setDefErro(''); }}
                      autoCapitalize={campo === 'bi' || campo === 'nif' ? 'characters' : 'none'}
                    />
                  </View>
                );
              })}
            </View>

            {!!defErro && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                <Ionicons name="alert-circle-outline" size={15} color="#FF453A" />
                <Text style={{ fontSize: 13, color: '#FF453A', fontFamily: 'Inter_400Regular', flex: 1 }}>{defErro}</Text>
              </View>
            )}

            <TouchableOpacity
              style={[styles.modalBtn, { backgroundColor: '#3B82F6', width: '100%', opacity: defLoading ? 0.7 : 1, marginBottom: 8 }]}
              onPress={handleCompletarDadosEmFalta}
              disabled={defLoading}
              activeOpacity={0.85}
            >
              <Text style={[styles.modalBtnText, { color: '#fff' }]}>{defLoading ? 'A guardar…' : 'Guardar e Entrar'}</Text>
            </TouchableOpacity>
            {dadosEmFalta.tentativas < DADOS_EM_FALTA_MAX_TENTATIVAS ? (
              <TouchableOpacity
                style={{ alignItems: 'center', paddingVertical: 8, opacity: defPularLoading ? 0.6 : 1 }}
                onPress={handlePularDadosEmFalta}
                disabled={defPularLoading}
              >
                <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', fontFamily: 'Inter_400Regular' }}>
                  Preencher mais tarde{DADOS_EM_FALTA_MAX_TENTATIVAS - dadosEmFalta.tentativas === 1 ? ' (última vez)' : ` (${DADOS_EM_FALTA_MAX_TENTATIVAS - dadosEmFalta.tentativas}x restantes)`}
                </Text>
              </TouchableOpacity>
            ) : (
              <View style={{ alignItems: 'center', paddingVertical: 8, flexDirection: 'row', gap: 6, justifyContent: 'center' }}>
                <Ionicons name="lock-closed-outline" size={12} color="rgba(255,69,58,0.7)" />
                <Text style={{ fontSize: 11, color: 'rgba(255,69,58,0.7)', fontFamily: 'Inter_400Regular', textAlign: 'center' }}>
                  Já adiou o preenchimento {DADOS_EM_FALTA_MAX_TENTATIVAS} vezes — é necessário completar os dados para continuar.
                </Text>
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );

  const bgDecorations = (
    <View style={[StyleSheet.absoluteFill, { pointerEvents: 'none' } as any]}>
      <View style={styles.circle1} />
      <View style={styles.circle2} />
      <View style={styles.circle3} />
      <View style={styles.strip1} />
      <View style={styles.strip2} />
    </View>
  );

  if (otpPending) {
    return (
      <View style={[styles.container, { backgroundColor: '#0A1228', alignItems: 'center', justifyContent: 'center', padding: 24 }]}>
        <DashboardPreviewBg />
        <LinearGradient
          colors={['rgba(8,15,35,0.88)', 'rgba(8,15,35,0.97)']}
          style={StyleSheet.absoluteFill}
        />

        <View style={{
          backgroundColor: '#0F2347',
          borderRadius: 22,
          padding: 28,
          width: '100%',
          maxWidth: 420,
          borderWidth: 1,
          borderColor: 'rgba(255,255,255,0.09)',
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 20 },
          shadowOpacity: 0.55,
          shadowRadius: 40,
          elevation: 20,
        }}>
          <View style={{ height: 3, backgroundColor: Colors.gold, borderRadius: 2, marginHorizontal: -28, marginTop: -28, marginBottom: 28, borderTopLeftRadius: 22, borderTopRightRadius: 22 }} />

          {/* Ícone + título */}
          <View style={{ alignItems: 'center', marginBottom: 24 }}>
            <View style={{
              width: 76, height: 76, borderRadius: 38,
              backgroundColor: 'rgba(212,175,55,0.1)',
              borderWidth: 2, borderColor: 'rgba(212,175,55,0.3)',
              alignItems: 'center', justifyContent: 'center', marginBottom: 16,
            }}>
              <Ionicons name="shield-checkmark-outline" size={34} color={Colors.gold} />
            </View>
            <Text style={{ color: '#fff', fontSize: 19, fontFamily: 'Inter_700Bold', textAlign: 'center', letterSpacing: 0.2 }}>
              Verificação em 2 Passos
            </Text>
            <Text style={{ color: 'rgba(255,255,255,0.55)', fontSize: 13, fontFamily: 'Inter_400Regular', textAlign: 'center', marginTop: 8, lineHeight: 20 }}>
              Enviámos um código de verificação para{'\n'}
              <Text style={{ color: Colors.gold, fontFamily: 'Inter_600SemiBold' }}>
                {otpPending.maskedEmail || otpPending.email.replace(/(.{2})(.*)(@.*)/, '$1***$3')}
              </Text>
            </Text>
            <View style={{ marginTop: 12, backgroundColor: 'rgba(34,197,94,0.08)', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9, borderWidth: 1, borderColor: 'rgba(34,197,94,0.22)', flexDirection: 'row', alignItems: 'center', gap: 7 }}>
              <Ionicons name="mail-outline" size={14} color="#22C55E" />
              <Text style={{ color: '#22C55E', fontSize: 12, fontFamily: 'Inter_500Medium', flex: 1 }}>
                Verifique a sua caixa de email — incluindo a pasta de spam
              </Text>
            </View>
          </View>

          {/* Caixas de dígitos */}
          <TouchableOpacity activeOpacity={1} onPress={() => otpInputRef.current?.focus()}>
            <View style={{ flexDirection: 'row', gap: 8, justifyContent: 'center', marginBottom: 6 }}>
              {[0, 1, 2, 3, 4, 5].map(i => {
                const filled = !!otpCode[i];
                const active = otpCode.length === i;
                return (
                  <View key={i} style={{
                    width: 46, height: 58, borderRadius: 12,
                    borderWidth: 2,
                    borderColor: active ? Colors.gold : filled ? 'rgba(212,175,55,0.45)' : 'rgba(255,255,255,0.13)',
                    backgroundColor: active ? 'rgba(212,175,55,0.07)' : filled ? 'rgba(212,175,55,0.05)' : 'rgba(255,255,255,0.03)',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                    {filled
                      ? <Text style={{ color: '#fff', fontSize: 22, fontFamily: 'Inter_700Bold' }}>{otpCode[i]}</Text>
                      : active
                        ? <View style={{ width: 2, height: 22, backgroundColor: Colors.gold, borderRadius: 1 }} />
                        : null
                    }
                  </View>
                );
              })}
            </View>
          </TouchableOpacity>

          {/* Input OTP — textContentType="oneTimeCode" activa auto-fill no iOS;
              autoComplete="one-time-code" activa auto-fill no Android/Web.
              No web precisa de ter dimensões reais para o Chrome/Android detectar
              o banner de autopreenchimento do email. */}
          <TextInput
            ref={otpInputRef}
            value={otpCode}
            onChangeText={v => {
              const clean = v.replace(/\D/g, '').slice(0, 6);
              setOtpCode(clean);
              setOtpError('');
              if (clean.length === 6) handleOtpVerify(clean);
            }}
            keyboardType="number-pad"
            maxLength={6}
            autoFocus
            textContentType="oneTimeCode"
            autoComplete="one-time-code"
            importantForAutofill="yes"
            style={Platform.OS === 'web'
              ? { position: 'absolute', opacity: 0.01, width: 308, height: 58, top: 0, left: 0, zIndex: 10, color: 'transparent', backgroundColor: 'transparent' }
              : { position: 'absolute', opacity: 0, width: 1, height: 1, top: 0, left: 0 }}
          />

          {/* Erro */}
          {!!otpError && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, justifyContent: 'center', marginTop: 8, marginBottom: 2 }}>
              <Ionicons name="alert-circle-outline" size={14} color="#e74c3c" />
              <Text style={{ color: '#e74c3c', fontSize: 13, fontFamily: 'Inter_400Regular', textAlign: 'center', flex: 1 }}>{otpError}</Text>
            </View>
          )}

          {/* Botão verificar */}
          <TouchableOpacity
            style={[{ borderRadius: 13, overflow: 'hidden', marginTop: 18 }, (otpLoading || otpCode.length !== 6) && { opacity: 0.55 }]}
            onPress={() => handleOtpVerify()}
            disabled={otpLoading || otpCode.length !== 6}
            activeOpacity={0.88}
          >
            <LinearGradient
              colors={['#1a5e8a', '#2471a3', '#2e86c1']}
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 16 }}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
            >
              {otpLoading
                ? <Ionicons name="ellipsis-horizontal" size={22} color="#fff" />
                : <Ionicons name="shield-checkmark" size={20} color="#fff" />
              }
              <Text style={{ color: '#fff', fontSize: 16, fontFamily: 'Inter_700Bold' }}>
                {otpLoading ? 'A verificar...' : 'Verificar Código'}
              </Text>
            </LinearGradient>
          </TouchableOpacity>

          {/* Colar do clipboard */}
          {Platform.OS === 'web' && (
            <View style={{ marginTop: 14, alignItems: 'center' }}>
              {!showPasteInput ? (
                <TouchableOpacity
                  style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, backgroundColor: 'rgba(212,175,55,0.08)', borderRadius: 10, paddingVertical: 10, paddingHorizontal: 18, borderWidth: 1, borderColor: 'rgba(212,175,55,0.22)' }}
                  onPress={async () => {
                    // Tentar ler o clipboard diretamente primeiro
                    try {
                      if (navigator.clipboard?.readText) {
                        const text = await navigator.clipboard.readText();
                        const digits = (text ?? '').replace(/\D/g, '').slice(0, 6);
                        if (digits.length === 6) {
                          setOtpCode(digits);
                          setOtpError('');
                          handleOtpVerify(digits);
                          return;
                        }
                      }
                    } catch {}
                    // Se falhou (sem permissão ou sem código), mostrar campo de paste manual
                    setShowPasteInput(true);
                    setTimeout(() => pasteInputRef.current?.focus(), 100);
                  }}
                  activeOpacity={0.75}
                >
                  <Ionicons name="clipboard-outline" size={15} color={Colors.gold} />
                  <Text style={{ color: Colors.gold, fontSize: 13, fontFamily: 'Inter_600SemiBold' }}>
                    Colar código copiado
                  </Text>
                </TouchableOpacity>
              ) : (
                <View style={{ width: '100%', alignItems: 'center', gap: 6 }}>
                  <Text style={{ color: 'rgba(255,255,255,0.55)', fontSize: 12, fontFamily: 'Inter_400Regular' }}>
                    Prima e segure no campo abaixo → Colar
                  </Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, width: '100%' }}>
                    <TextInput
                      ref={pasteInputRef}
                      placeholder="Cole o código aqui..."
                      placeholderTextColor="rgba(255,255,255,0.3)"
                      keyboardType="number-pad"
                      autoFocus
                      style={{
                        flex: 1,
                        backgroundColor: 'rgba(212,175,55,0.08)',
                        borderWidth: 1,
                        borderColor: 'rgba(212,175,55,0.4)',
                        borderRadius: 10,
                        paddingVertical: 10,
                        paddingHorizontal: 14,
                        color: '#fff',
                        fontSize: 18,
                        fontFamily: 'Inter_600SemiBold',
                        letterSpacing: 6,
                        textAlign: 'center',
                      }}
                      onChangeText={v => {
                        const digits = v.replace(/\D/g, '').slice(0, 6);
                        if (digits.length === 6) {
                          setOtpCode(digits);
                          setOtpError('');
                          setShowPasteInput(false);
                          handleOtpVerify(digits);
                        }
                      }}
                    />
                    <TouchableOpacity
                      onPress={() => setShowPasteInput(false)}
                      style={{ padding: 8 }}
                    >
                      <Ionicons name="close-circle" size={22} color="rgba(255,255,255,0.35)" />
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>
          )}

          {/* Reenvio / cancelar */}
          <View style={{ alignItems: 'center', marginTop: 16, gap: 10 }}>
            {otpResendSecs > 0 ? (
              <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13, fontFamily: 'Inter_400Regular' }}>
                Reenviar em{' '}
                <Text style={{ color: Colors.gold, fontFamily: 'Inter_600SemiBold' }}>{otpResendSecs}s</Text>
              </Text>
            ) : (
              <TouchableOpacity
                onPress={handleOtpResend}
                disabled={otpLoading}
                hitSlop={{ top: 10, bottom: 10, left: 16, right: 16 }}
              >
                <Text style={{ color: Colors.gold, fontSize: 13, fontFamily: 'Inter_600SemiBold', opacity: otpLoading ? 0.5 : 1 }}>
                  📧 Reenviar código por email
                </Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              onPress={() => { setOtpPending(null); setOtpCode(''); setOtpError(''); if (otpResendRef.current) clearInterval(otpResendRef.current); }}
              hitSlop={{ top: 10, bottom: 10, left: 16, right: 16 }}
            >
              <Text style={{ color: 'rgba(255,255,255,0.35)', fontSize: 13, fontFamily: 'Inter_400Regular' }}>
                Cancelar e tentar novamente
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  if (approvalPending) {
    const approvalMins = Math.floor(approvalSecsLeft / 60);
    const approvalSecs = approvalSecsLeft % 60;
    const approvalCountdownStr = `${approvalMins}:${String(approvalSecs).padStart(2, '0')}`;
    const approvalProgress = Math.max(0, approvalSecsLeft / 600);
    const approvalUrgent = approvalSecsLeft <= 60;
    const approvalExpired = approvalSecsLeft <= 0;
    return (
      <View style={[styles.container, { backgroundColor: '#0A1228', alignItems: 'center', justifyContent: 'center', padding: 24 }]}>
        <DashboardPreviewBg />
        <LinearGradient
          colors={['rgba(8,15,35,0.85)', 'rgba(8,15,35,0.97)']}
          style={StyleSheet.absoluteFill}
        />
        <View style={{
          backgroundColor: '#0F2347', borderRadius: 20, padding: 36,
          width: '100%', maxWidth: 400, alignItems: 'center',
          borderWidth: 1, borderColor: approvalUrgent ? 'rgba(231,76,60,0.35)' : 'rgba(255,255,255,0.08)',
          shadowColor: '#000', shadowOffset: { width: 0, height: 20 }, shadowOpacity: 0.5, shadowRadius: 40,
        }}>
          {/* Ícone */}
          <View style={{
            width: 72, height: 72, borderRadius: 36,
            backgroundColor: approvalExpired ? 'rgba(231,76,60,0.12)' : 'rgba(200,154,42,0.12)',
            borderWidth: 2, borderColor: approvalExpired ? 'rgba(231,76,60,0.35)' : 'rgba(200,154,42,0.35)',
            alignItems: 'center', justifyContent: 'center', marginBottom: 20,
          }}>
            <Text style={{ fontSize: 32 }}>{approvalExpired ? '⏰' : '🔐'}</Text>
          </View>

          <Text style={{ color: '#fff', fontSize: 20, fontFamily: 'Inter_700Bold', marginBottom: 8, textAlign: 'center' }}>
            {approvalExpired ? 'Link Expirado' : 'Aguardar Aprovação'}
          </Text>

          {!approvalExpired && (
            <Text style={{ color: 'rgba(255,255,255,0.65)', fontSize: 14, fontFamily: 'Inter_400Regular', textAlign: 'center', lineHeight: 22, marginBottom: 20 }}>
              Enviámos um email para{'\n'}
              <Text style={{ color: '#C89A2A', fontFamily: 'Inter_600SemiBold' }}>{approvalPending.email}</Text>
              {'\n\n'}Clique em <Text style={{ color: '#27AE60', fontFamily: 'Inter_600SemiBold' }}>Sim, autorizo</Text> no email{'\n'}para entrar na aplicação.
            </Text>
          )}
          {approvalExpired && (
            <Text style={{ color: 'rgba(255,255,255,0.65)', fontSize: 14, fontFamily: 'Inter_400Regular', textAlign: 'center', lineHeight: 22, marginBottom: 20 }}>
              O link de aprovação expirou.{'\n'}Por favor, tente fazer login novamente.
            </Text>
          )}

          {/* Barra de progresso + contador */}
          {!approvalExpired && (
            <View style={{ width: '100%', marginBottom: 20 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                  {[0, 1, 2].map(i => (
                    <Animated.View key={i} style={{
                      width: 7, height: 7, borderRadius: 3.5,
                      backgroundColor: approvalUrgent ? '#E74C3C' : '#C89A2A',
                      opacity: approvalDotAnim.interpolate({ inputRange: [0, 1], outputRange: i === 1 ? [0.3, 1] : [i === 0 ? 1 : 0.3, i === 0 ? 0.3 : 1] }),
                    }} />
                  ))}
                  <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, fontFamily: 'Inter_400Regular', marginLeft: 4 }}>
                    A aguardar resposta...
                  </Text>
                </View>
                <Text style={{
                  color: approvalUrgent ? '#E74C3C' : '#C89A2A',
                  fontSize: 15, fontFamily: 'Inter_700Bold',
                }}>
                  {approvalCountdownStr}
                </Text>
              </View>
              {/* Barra de progresso */}
              <View style={{ height: 4, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden' }}>
                <View style={{
                  height: '100%', borderRadius: 2,
                  backgroundColor: approvalUrgent ? '#E74C3C' : '#C89A2A',
                  width: `${approvalProgress * 100}%` as any,
                }} />
              </View>
            </View>
          )}

          {/* Aviso de spam */}
          {!approvalExpired && (
            <View style={{ backgroundColor: 'rgba(39,174,96,0.08)', borderWidth: 1, borderColor: 'rgba(39,174,96,0.2)', borderRadius: 10, padding: 12, marginBottom: 20, width: '100%' }}>
              <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12, fontFamily: 'Inter_400Regular', textAlign: 'center', lineHeight: 19 }}>
                💡 Se não receber o email, verifique a{'\n'}
                <Text style={{ color: '#27AE60', fontFamily: 'Inter_600SemiBold' }}>pasta de spam ou lixo electrónico</Text>.
              </Text>
            </View>
          )}

          <TouchableOpacity
            onPress={() => setApprovalPending(null)}
            style={{ paddingVertical: 12, paddingHorizontal: 32, borderRadius: 12, borderWidth: 1, borderColor: approvalExpired ? 'rgba(200,154,42,0.4)' : 'rgba(255,255,255,0.15)', backgroundColor: approvalExpired ? 'rgba(200,154,42,0.08)' : 'transparent' }}
          >
            <Text style={{ color: approvalExpired ? '#C89A2A' : 'rgba(255,255,255,0.5)', fontSize: 14, fontFamily: 'Inter_500Medium' }}>
              {approvalExpired ? 'Tentar novamente' : 'Cancelar e tentar novamente'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (isDesktop) {
    return (
      <View style={[styles.container, { backgroundColor: '#0A1432' }]}>
        {/* Dashboard como fundo full-screen */}
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: logoOpacity }]}>
          <DashboardPreviewBg />
          {/* Vinheta escura sobre o fundo para destacar o cartão */}
          <LinearGradient
            colors={['rgba(8,15,35,0.65)', 'rgba(8,15,35,0.55)', 'rgba(8,15,35,0.65)']}
            style={[StyleSheet.absoluteFill, { pointerEvents: 'none' } as any]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          />
        </Animated.View>

        {bgDecorations}

        {/* Cartão de login centrado */}
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.desktopCenteredScroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {formCard}
          {mostrarCardInscricao && registerCard}
        </ScrollView>

        {alertModalView}
        {primeiroAcessoModal}
        {dadosEmFaltaModal}
        {duplicateSessaoModal}
        <AuthLoadingOverlay visible={isLoading} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: '#0A1228' }]}>
      {/* Mesmo dashboard animado do desktop — também no mobile */}
      <DashboardPreviewBg />

      {/* Gradiente — transparente no topo, sólido em baixo */}
      <LinearGradient
        colors={['rgba(8,15,35,0.10)', 'rgba(8,15,35,0.40)', 'rgba(8,15,35,0.80)', 'rgba(10,18,40,0.97)']}
        style={StyleSheet.absoluteFill}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
      />

      {/* Layout FIXO — sem scroll */}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={{ flex: 1, justifyContent: 'flex-end', paddingHorizontal: 18, paddingBottom: Math.max(bottomPad, 16) }}>

          {/* Label institucional */}
          {!showBiometricWelcome && (
            <Animated.View style={{ opacity: logoOpacity, alignItems: 'center', marginBottom: 10 }}>
              <View style={styles.taglineRow}>
                <View style={styles.taglineLine} />
                <Text style={styles.taglineText}>ACESSO INSTITUCIONAL</Text>
                <View style={styles.taglineLine} />
              </View>
            </Animated.View>
          )}

          {/* Formulário principal */}
          {showBiometricWelcome ? biometricWelcomeScreen : formCard}

          {/* Linha rápida: inscrição + portaria */}
          {!showBiometricWelcome && (
            <Animated.View style={{ opacity: fadeAnim, marginTop: 10, gap: 8 }}>
              {/* Card inscrição compacto */}
              {mostrarCardInscricao && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: 'rgba(52,152,219,0.10)', borderRadius: 14, borderWidth: 1, borderColor: 'rgba(52,152,219,0.22)', paddingHorizontal: 14, paddingVertical: 11 }}>
                  <View style={{ width: 32, height: 32, borderRadius: 9, backgroundColor: 'rgba(52,152,219,0.15)', alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name="person-add-outline" size={15} color="#3498DB" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 12, fontFamily: 'Inter_600SemiBold', color: '#fff' }}>Novo Estudante?</Text>
                    <Text style={{ fontSize: 10, fontFamily: 'Inter_400Regular', color: 'rgba(255,255,255,0.45)' }}>Solicite a sua matrícula online</Text>
                  </View>
                  {inscricoesAbertas ? (
                    <TouchableOpacity onPress={() => router.push('/registro' as any)} style={{ backgroundColor: 'rgba(52,152,219,0.15)', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: 'rgba(52,152,219,0.3)' }}>
                      <Text style={{ color: '#3498DB', fontSize: 11, fontFamily: 'Inter_600SemiBold' }}>Inscrição</Text>
                    </TouchableOpacity>
                  ) : (
                    <View style={{ backgroundColor: '#EF444418', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: '#EF444440' }}>
                      <Text style={{ color: '#EF4444', fontSize: 10, fontFamily: 'Inter_600SemiBold' }}>Encerrado</Text>
                    </View>
                  )}
                </View>
              )}

              {/* Portaria compacta */}
              <TouchableOpacity
                activeOpacity={0.88}
                onPress={() => {
                  if (Platform.OS === 'web') { (window as any).location.href = '/portaria/kiosk'; }
                  else { router.push('/portaria/kiosk' as any); }
                }}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: 'rgba(14,40,22,0.85)', borderRadius: 14, borderWidth: 1, borderColor: 'rgba(34,197,94,0.28)', paddingHorizontal: 14, paddingVertical: 11 }}
              >
                <View style={{ width: 32, height: 32, borderRadius: 9, backgroundColor: 'rgba(34,197,94,0.15)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(34,197,94,0.35)' }}>
                  <Ionicons name="qr-code-outline" size={16} color="#22C55E" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 12, fontFamily: 'Inter_700Bold', color: '#22C55E' }}>Portaria — Registo por QR Code</Text>
                  <Text style={{ fontSize: 10, fontFamily: 'Inter_400Regular', color: 'rgba(255,255,255,0.4)' }}>Marcar presença sem login</Text>
                </View>
                <Ionicons name="chevron-forward" size={14} color="rgba(34,197,94,0.6)" />
              </TouchableOpacity>
            </Animated.View>
          )}

          {/* Rodapé mínimo */}
          <Animated.View style={{ opacity: footerOpacity, alignItems: 'center', marginTop: 12, gap: 4 }}>
            <View style={styles.angolaBanner}>
              <View style={[styles.angolaStripe, { backgroundColor: '#CC0000' }]} />
              <View style={[styles.angolaStripe, { backgroundColor: '#000000' }]} />
            </View>
            <Text style={styles.footerText}>{config.nomeEscola}</Text>
          </Animated.View>

        </View>
      </KeyboardAvoidingView>

      {alertModalView}
      {primeiroAcessoModal}
      {dadosEmFaltaModal}
      {duplicateSessaoModal}
      <AuthLoadingOverlay visible={isLoading} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, ...(Platform.OS === 'web' ? { minHeight: '100vh' as any } : {}) },
  serverConfigBtn: {
    position: 'absolute',
    bottom: 14,
    right: 16,
    padding: 8,
    zIndex: 99,
  },

  desktopRow: {
    flex: 1,
    flexDirection: 'row',
  },
  desktopLeft: {
    flex: 1,
    position: 'relative',
    borderRightWidth: 1,
    borderRightColor: 'rgba(255,255,255,0.07)',
    overflow: 'hidden',
  },
  desktopLeftContent: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 56,
    paddingVertical: 40,
  },
  studentsPanel: {
    height: 260,
    position: 'relative',
    alignItems: 'center',
  },
  studentsImg: {
    width: '100%',
    height: '100%',
  },
  studentsFade: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 100,
  },
  desktopLogoWrap: {
    alignItems: 'flex-start',
    marginBottom: 32,
    position: 'relative',
  },
  desktopLogoImage: {
    width: 260,
    height: 90,
  },
  desktopBrandTitle: {
    fontSize: 32,
    fontFamily: 'Inter_700Bold',
    color: Colors.text,
    lineHeight: 42,
    marginBottom: 12,
  },
  desktopBrandSub: {
    fontSize: 15,
    fontFamily: 'Inter_400Regular',
    color: Colors.textSecondary,
    lineHeight: 24,
    maxWidth: 380,
    marginBottom: 36,
  },
  desktopFeatures: {
    gap: 16,
    marginBottom: 48,
  },
  desktopFeatureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  desktopFeatureIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(240,165,0,0.13)',
    borderWidth: 1,
    borderColor: 'rgba(240,165,0,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  desktopFeatureText: {
    fontSize: 14,
    fontFamily: 'Inter_500Medium',
    color: Colors.textSecondary,
  },
  desktopLeftFooter: {
    alignItems: 'flex-start',
    gap: 6,
  },
  desktopRight: {
    width: 480,
    borderLeftWidth: 1,
    borderLeftColor: 'rgba(255,255,255,0.05)',
  },
  desktopRightScroll: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 48,
    paddingVertical: 48,
    gap: 16,
  },
  desktopCenteredScroll: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 48,
    gap: 16,
  },

  circle1: {
    position: 'absolute', width: 380, height: 380,
    borderRadius: 190, top: -120, right: -100,
    backgroundColor: 'rgba(42,100,160,0.22)',
  },
  circle2: {
    position: 'absolute', width: 220, height: 220,
    borderRadius: 110, bottom: 60, left: -80,
    backgroundColor: 'rgba(160,60,80,0.10)',
  },
  circle3: {
    position: 'absolute', width: 140, height: 140,
    borderRadius: 70, top: '42%', right: -40,
    backgroundColor: 'rgba(210,160,40,0.10)',
  },
  strip1: {
    position: 'absolute', width: 2, height: height * 0.4,
    top: '15%', left: '12%',
    backgroundColor: 'rgba(255,255,255,0.03)',
    transform: [{ rotate: '15deg' }],
  },
  strip2: {
    position: 'absolute', width: 1, height: height * 0.3,
    top: '30%', right: '18%',
    backgroundColor: 'rgba(255,255,255,0.025)',
    transform: [{ rotate: '-10deg' }],
  },

  scroll: { flexGrow: 1, alignItems: 'center', paddingHorizontal: 20 },

  logoSection: { alignItems: 'center', marginBottom: 32, width: '100%' },
  logoContainer: { alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  logoGlowBig: {
    position: 'absolute',
    width: 260, height: 140,
    borderRadius: 70,
    backgroundColor: 'rgba(26,82,118,0.2)',
  },
  logoImage: {
    width: Math.min(width - 60, 280),
    height: 110,
  },
  taglineRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 6 },
  taglineLine: { flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.08)', maxWidth: 50 },
  taglineText: {
    fontSize: 10,
    fontFamily: 'Inter_600SemiBold',
    color: 'rgba(255,255,255,0.3)',
    letterSpacing: 2.5,
    textTransform: 'uppercase',
  },

  card: {
    width: '100%',
    maxWidth: 440,
    backgroundColor: 'rgba(9,18,52,0.93)',
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: 'rgba(212,175,55,0.22)',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.50,
    shadowRadius: 30,
    elevation: 18,
    gap: 14,
    padding: 20,
    paddingTop: 22,
    ...(Platform.OS === 'web' ? ({ backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)' } as any) : {}),
  },
  cardTopAccent: {
    position: 'absolute',
    top: 0, left: 0, right: 0,
    height: 3,
    backgroundColor: Colors.gold,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
  },

  cardHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  lockBadge: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: 'rgba(212,175,55,0.18)',
    borderWidth: 1.5, borderColor: 'rgba(212,175,55,0.38)',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#D4AF37',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.30,
    shadowRadius: 8,
    elevation: 4,
  },
  cardHeaderTexts: { flex: 1 },
  cardTitle: { fontSize: 18, fontFamily: 'Inter_700Bold', color: Colors.text },
  cardSubtitle: { fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 2 },

  inputGroup: { gap: 8 },
  inputLabel: {
    fontSize: 11, fontFamily: 'Inter_600SemiBold',
    color: 'rgba(255,255,255,0.65)',
    letterSpacing: 0.9,
    textTransform: 'uppercase',
  },
  senhaLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  forgotLink: {
    fontSize: 12,
    fontFamily: 'Inter_500Medium',
    color: Colors.gold,
    opacity: 0.85,
  },
  inputBox: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.10)',
    height: 50,
    paddingHorizontal: 6,
  },
  inputBoxFocused: {
    borderColor: 'rgba(212,175,55,0.70)',
    backgroundColor: 'rgba(212,175,55,0.07)',
    shadowColor: '#D4AF37',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 4,
  },
  inputBoxError: {
    borderColor: '#e74c3c',
    backgroundColor: 'rgba(231,76,60,0.05)',
  },
  fieldErrorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 5,
    marginLeft: 2,
  },
  fieldErrorText: {
    color: '#e74c3c',
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    flex: 1,
  },
  inputIcon: { marginHorizontal: 10, flexShrink: 0 },
  inputText: {
    flex: 1,
    minWidth: 0,
    fontSize: 16,
    fontFamily: 'Inter_400Regular',
    color: Colors.text,
    height: '100%',
  },
  inputRightIcons: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
    gap: 2,
    paddingRight: 2,
  },
  eyeBtn: { width: 34, alignItems: 'center', justifyContent: 'center' },

  loginBtn: {
    borderRadius: 15, overflow: 'hidden', marginTop: 6,
    shadowColor: '#1a82cc',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.55,
    shadowRadius: 18,
    elevation: 12,
  },
  loginBtnDisabled: { opacity: 0.65 },
  loginBtnGrad: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 10, paddingVertical: 15,
  },
  loginBtnText: { fontSize: 15, fontFamily: 'Inter_700Bold', color: '#fff', letterSpacing: 0.3 },

  biometricWrap: { gap: 12 },
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  dividerLine: { flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.08)' },
  dividerText: { fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textMuted },
  biometricBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 10, paddingVertical: 14,
    backgroundColor: 'rgba(240,165,0,0.07)',
    borderRadius: 13,
    borderWidth: 1,
    borderColor: 'rgba(240,165,0,0.2)',
  },
  biometricIconWrap: {
    width: 34, height: 34, borderRadius: 10,
    backgroundColor: 'rgba(240,165,0,0.12)',
    alignItems: 'center', justifyContent: 'center',
  },
  biometricText: { fontSize: 14, fontFamily: 'Inter_500Medium', color: Colors.gold },

  registerSection: { width: '100%', maxWidth: 440 },
  registerCard: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: 'rgba(52,152,219,0.07)',
    borderRadius: 16, borderWidth: 1,
    borderColor: 'rgba(52,152,219,0.15)',
    padding: 16,
  },
  registerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  registerIconWrap: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: 'rgba(52,152,219,0.12)',
    alignItems: 'center', justifyContent: 'center',
  },
  registerTexts: { flex: 1 },
  registerTitle: { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: Colors.text },
  registerDesc: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 1 },
  registerBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingVertical: 8, paddingHorizontal: 14,
    backgroundColor: 'rgba(52,152,219,0.12)',
    borderRadius: 10, borderWidth: 1,
    borderColor: 'rgba(52,152,219,0.25)',
  },
  registerBtnText: { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: '#3498DB' },

  provisorioBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginTop: 8, paddingVertical: 11, paddingHorizontal: 14,
    backgroundColor: 'rgba(240,165,0,0.07)',
    borderRadius: 12, borderWidth: 1,
    borderColor: 'rgba(240,165,0,0.18)',
  },
  provisorioBtnText: {
    flex: 1, fontSize: 12, fontFamily: 'Inter_500Medium', color: Colors.gold,
  },

  footer: { alignItems: 'center', marginTop: 20, gap: 6 },
  angolaBanner: { flexDirection: 'row', height: 4, width: 36, borderRadius: 2, overflow: 'hidden', gap: 1 },
  angolaStripe: { flex: 1 },
  footerText: { fontSize: 11, fontFamily: 'Inter_400Regular', color: 'rgba(255,255,255,0.38)' },
  footerSub: { fontSize: 10, fontFamily: 'Inter_400Regular', color: 'rgba(255,255,255,0.24)' },

  biometricWelcomeContainer: {
    width: '100%',
    maxWidth: 440,
    alignItems: 'center',
  },
  bwCard: {
    width: '100%',
    backgroundColor: 'rgba(22,40,80,0.72)',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    overflow: 'hidden',
    padding: 28,
    alignItems: 'center',
    gap: 20,
  },
  bwAvatarSection: {
    alignItems: 'center',
    gap: 10,
    marginTop: 8,
  },
  bwAvatarOuter: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: 'rgba(240,165,0,0.15)',
    borderWidth: 2,
    borderColor: 'rgba(240,165,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bwAvatarInner: {
    width: 74,
    height: 74,
    borderRadius: 37,
    backgroundColor: 'rgba(26,82,118,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bwAvatarPhoto: {
    width: 74,
    height: 74,
    borderRadius: 37,
    borderWidth: 3,
    borderColor: Colors.gold,
  },
  bwAvatarInitials: {
    fontSize: 28,
    fontFamily: 'Inter_700Bold',
    color: Colors.gold,
  },
  bwRoleBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    backgroundColor: 'rgba(240,165,0,0.1)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(240,165,0,0.2)',
  },
  bwRoleText: {
    fontSize: 11,
    fontFamily: 'Inter_600SemiBold',
    color: Colors.gold,
    letterSpacing: 0.5,
  },
  bwTextSection: {
    alignItems: 'center',
    gap: 4,
  },
  bwGreeting: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    color: Colors.textMuted,
  },
  bwName: {
    fontSize: 22,
    fontFamily: 'Inter_700Bold',
    color: Colors.text,
    textAlign: 'center',
  },
  bwSchool: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    color: Colors.textSecondary,
    textAlign: 'center',
    marginTop: 2,
  },
  bwBiometricButton: {
    alignItems: 'center',
    gap: 10,
    paddingVertical: 20,
    paddingHorizontal: 32,
    width: '100%',
  },
  bwBiometricGlow: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(240,165,0,0.18)',
  },
  bwBiometricIconWrap: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: 'rgba(240,165,0,0.1)',
    borderWidth: 2,
    borderColor: 'rgba(240,165,0,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bwBiometricLabel: {
    fontSize: 14,
    fontFamily: 'Inter_500Medium',
    color: Colors.textSecondary,
  },
  bwDividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    width: '100%',
  },
  bwSwitchBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 20,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  bwSwitchText: {
    fontSize: 13,
    fontFamily: 'Inter_500Medium',
    color: Colors.textMuted,
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  modalCard: {
    backgroundColor: '#0F1F40',
    borderRadius: 20,
    paddingVertical: 32,
    paddingHorizontal: 28,
    alignItems: 'center',
    width: '100%',
    maxWidth: 360,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 24,
  },
  modalIconWrap: {
    width: 68,
    height: 68,
    borderRadius: 34,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontFamily: 'Inter_700Bold',
    color: Colors.text,
    textAlign: 'center',
    marginBottom: 10,
  },
  modalMessage: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: 24,
  },
  modalBtn: {
    borderRadius: 12,
    paddingVertical: 13,
    paddingHorizontal: 40,
    alignItems: 'center',
  },
  modalBtnText: {
    fontSize: 15,
    fontFamily: 'Inter_600SemiBold',
    color: '#fff',
  },
});
