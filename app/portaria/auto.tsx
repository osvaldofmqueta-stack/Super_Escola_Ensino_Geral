import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Image, ScrollView,
  ActivityIndicator, Platform, Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';

type Semaforo = 'verde' | 'amarelo' | 'vermelho';

interface AutoValidarResp {
  ok: boolean;
  resultado: Semaforo;
  motivo: string;
  mesesAtraso: number;
  valorDivida: number;
  cartaoPago: boolean;
  anoLetivo: string;
  aluno: {
    nome: string;
    numeroMatricula: string;
    foto: string | null;
    genero: string | null;
  };
  timestamp: string;
  erro?: string;
}

const CONFIG: Record<Semaforo, {
  bg: string; border: string; icon: any; iconColor: string;
  label: string; sublabel: string; textColor: string;
}> = {
  verde: {
    bg: '#0A1F0A', border: '#10B981', icon: 'checkmark-circle', iconColor: '#10B981',
    label: 'ACESSO PERMITIDO', sublabel: 'Propinas em dia — bem-vindo(a)!', textColor: '#34D399',
  },
  amarelo: {
    bg: '#1A1400', border: '#F59E0B', icon: 'warning', iconColor: '#F59E0B',
    label: 'ATENÇÃO', sublabel: 'Verificar na secretaria', textColor: '#FBBF24',
  },
  vermelho: {
    bg: '#1F0A0A', border: '#EF4444', icon: 'ban', iconColor: '#EF4444',
    label: 'ACESSO BLOQUEADO', sublabel: 'Regularize as propinas para entrar', textColor: '#F87171',
  },
};

export default function PortariaAutoScreen() {
  const { isAuthenticated, isLoading: authLoading, user } = useAuth();
  const [estado, setEstado] = useState<'loading' | 'done' | 'error' | 'not_auth' | 'not_aluno'>('loading');
  const [resultado, setResultado] = useState<AutoValidarResp | null>(null);
  const [erroMsg, setErroMsg] = useState('');
  const screenH = Dimensions.get('window').height;

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      setEstado('not_auth');
      return;
    }
    if (user?.role !== 'aluno') {
      setEstado('not_aluno');
      return;
    }
    validar();
  }, [authLoading, isAuthenticated, user]);

  async function validar() {
    setEstado('loading');
    try {
      const r = await api.post<AutoValidarResp>('/api/portaria/auto-validar', {});
      setResultado(r);
      setEstado('done');
    } catch (e: any) {
      setErroMsg(e?.message || 'Erro ao validar. Tente novamente.');
      setEstado('error');
    }
  }

  if (authLoading || estado === 'loading') {
    return (
      <View style={s.root}>
        <ActivityIndicator size="large" color="#10B981" />
        <Text style={s.loadingText}>A verificar o seu acesso…</Text>
      </View>
    );
  }

  if (estado === 'not_auth') {
    return (
      <View style={s.root}>
        <Ionicons name="lock-closed" size={64} color="#F59E0B" />
        <Text style={s.notAuthTitle}>Sessão Necessária</Text>
        <Text style={s.notAuthDesc}>
          Para verificar o seu acesso, inicie sessão na app Super Escola primeiro.
        </Text>
        <TouchableOpacity style={s.loginBtn} onPress={() => router.replace('/login')} activeOpacity={0.85}>
          <Ionicons name="log-in-outline" size={18} color="#fff" />
          <Text style={s.loginBtnText}>Iniciar Sessão</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (estado === 'not_aluno') {
    return (
      <View style={s.root}>
        <Ionicons name="information-circle" size={64} color="#0EA5E9" />
        <Text style={s.notAuthTitle}>Apenas para Alunos</Text>
        <Text style={s.notAuthDesc}>
          Esta página é exclusiva para alunos verificarem o seu acesso à escola.
        </Text>
        <TouchableOpacity style={s.loginBtn} onPress={() => router.back()} activeOpacity={0.85}>
          <Text style={s.loginBtnText}>Voltar</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (estado === 'error') {
    return (
      <View style={s.root}>
        <Ionicons name="alert-circle" size={64} color="#EF4444" />
        <Text style={s.notAuthTitle}>Erro de Verificação</Text>
        <Text style={s.notAuthDesc}>{erroMsg}</Text>
        <TouchableOpacity style={s.loginBtn} onPress={validar} activeOpacity={0.85}>
          <Ionicons name="refresh" size={18} color="#fff" />
          <Text style={s.loginBtnText}>Tentar novamente</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!resultado) return null;

  const cfg = CONFIG[resultado.resultado];
  const hora = new Date(resultado.timestamp).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const dia = new Date(resultado.timestamp).toLocaleDateString('pt-PT', { day: '2-digit', month: 'long', year: 'numeric' });

  return (
    <ScrollView
      contentContainerStyle={[s.resultRoot, { minHeight: screenH, backgroundColor: cfg.bg }]}
      bounces={false}
    >
      {/* Border top band */}
      <View style={[s.topBand, { backgroundColor: cfg.border }]} />

      {/* Status icon + label */}
      <View style={s.iconArea}>
        <Ionicons name={cfg.icon} size={96} color={cfg.iconColor} />
        <Text style={[s.resultLabel, { color: cfg.textColor }]}>{cfg.label}</Text>
        <Text style={s.resultSublabel}>{cfg.sublabel}</Text>
      </View>

      {/* Student card */}
      <View style={[s.alunoCard, { borderColor: cfg.border }]}>
        {resultado.aluno.foto ? (
          <Image source={{ uri: resultado.aluno.foto }} style={s.alunoFoto} />
        ) : (
          <View style={[s.alunoFotoPlc, { borderColor: cfg.border }]}>
            <Text style={[s.alunoIni, { color: cfg.textColor }]}>
              {resultado.aluno.nome.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()}
            </Text>
          </View>
        )}
        <View style={s.alunoInfo}>
          <Text style={s.alunoNome} numberOfLines={2}>{resultado.aluno.nome}</Text>
          <Text style={s.alunoMatricula}>{resultado.aluno.numeroMatricula}</Text>
          <Text style={s.alunoAno}>Ano lectivo {resultado.anoLetivo}</Text>
        </View>
      </View>

      {/* Motivo */}
      <View style={[s.motivoBox, { borderColor: cfg.border + '66', backgroundColor: cfg.border + '14' }]}>
        <Text style={[s.motivoText, { color: cfg.textColor }]}>{resultado.motivo}</Text>
        {resultado.mesesAtraso > 0 && (
          <Text style={s.dividaText}>
            Dívida estimada: {resultado.valorDivida.toLocaleString('pt-AO')} Kz
          </Text>
        )}
      </View>

      {/* Timestamp */}
      <Text style={s.timestamp}>Verificado às {hora} · {dia}</Text>

      {/* Action buttons */}
      <View style={s.actions}>
        <TouchableOpacity style={[s.actionBtn, { borderColor: cfg.border }]} onPress={validar} activeOpacity={0.85}>
          <Ionicons name="refresh" size={16} color={cfg.textColor} />
          <Text style={[s.actionBtnText, { color: cfg.textColor }]}>Verificar novamente</Text>
        </TouchableOpacity>
        {resultado.resultado !== 'verde' && (
          <TouchableOpacity
            style={[s.actionBtn, { borderColor: '#F59E0B', marginTop: 8 }]}
            onPress={() => router.replace('/(main)/portal-estudante')}
            activeOpacity={0.85}
          >
            <Ionicons name="card-outline" size={16} color="#FBBF24" />
            <Text style={[s.actionBtnText, { color: '#FBBF24' }]}>Regularizar propinas</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Footer branding */}
      <View style={s.footer}>
        <Text style={s.footerText}>Super Escola · Sistema de Gestão Académica</Text>
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  root: {
    flex: 1, backgroundColor: '#060E1A', alignItems: 'center', justifyContent: 'center',
    padding: 32, gap: 16,
  },
  loadingText: { color: 'rgba(255,255,255,0.6)', fontSize: 14, marginTop: 12 },
  notAuthTitle: { color: '#fff', fontSize: 22, fontWeight: '800', textAlign: 'center', marginTop: 8 },
  notAuthDesc: { color: 'rgba(255,255,255,0.6)', fontSize: 14, textAlign: 'center', lineHeight: 20 },
  loginBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 16,
    backgroundColor: '#1D4ED8', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 10,
  },
  loginBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  resultRoot: { alignItems: 'center', padding: 24, paddingTop: 0 },
  topBand: { width: '100%', height: 10, marginBottom: 32 },
  iconArea: { alignItems: 'center', marginBottom: 24, gap: 8 },
  resultLabel: { fontSize: 28, fontWeight: '900', letterSpacing: 1.5, textAlign: 'center' },
  resultSublabel: { color: 'rgba(255,255,255,0.65)', fontSize: 14, textAlign: 'center' },

  alunoCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14, width: '100%', maxWidth: 420,
    backgroundColor: '#0F1A2E', borderRadius: 14, borderWidth: 1.5, padding: 14, marginBottom: 16,
  },
  alunoFoto: { width: 70, height: 86, borderRadius: 8 },
  alunoFotoPlc: {
    width: 70, height: 86, borderRadius: 8, borderWidth: 2,
    backgroundColor: '#1A2438', alignItems: 'center', justifyContent: 'center',
  },
  alunoIni: { fontSize: 24, fontWeight: '900' },
  alunoInfo: { flex: 1 },
  alunoNome: { color: '#fff', fontSize: 17, fontWeight: '800', marginBottom: 4 },
  alunoMatricula: { color: 'rgba(255,255,255,0.5)', fontSize: 12 },
  alunoAno: { color: 'rgba(255,255,255,0.4)', fontSize: 11, marginTop: 2 },

  motivoBox: {
    width: '100%', maxWidth: 420, borderRadius: 10, borderWidth: 1, padding: 14, marginBottom: 16,
    alignItems: 'center',
  },
  motivoText: { fontSize: 15, fontWeight: '700', textAlign: 'center' },
  dividaText: { color: 'rgba(255,255,255,0.55)', fontSize: 12, marginTop: 6 },

  timestamp: { color: 'rgba(255,255,255,0.35)', fontSize: 11, marginBottom: 20 },

  actions: { width: '100%', maxWidth: 420, gap: 0 },
  actionBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderWidth: 1, borderRadius: 10, paddingVertical: 12, paddingHorizontal: 20,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  actionBtnText: { fontSize: 13, fontWeight: '700' },

  footer: { marginTop: 32, paddingBottom: 16 },
  footerText: { color: 'rgba(255,255,255,0.2)', fontSize: 10, letterSpacing: 0.5 },
});
