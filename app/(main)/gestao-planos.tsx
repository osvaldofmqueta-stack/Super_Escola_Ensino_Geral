import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Platform,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Colors } from '@/constants/colors';
import TopBar from '@/components/TopBar';
import { useAuth } from '@/context/AuthContext';
import { HScrollTabBar } from '@/components/HScrollTabBar';
import { useTabMemory } from '@/hooks/useTabMemory';
import {
  TipoNivel, NIVEL_LABEL, NIVEL_COLOR, NIVEL_EMOJI, NIVEL_DESC, NIVEL_FEATURES,
  useLicense,
} from '@/context/LicenseContext';

const FEATURES_DETALHADAS: Record<string, { label: string; icon: string }> = {
  dashboard: { label: 'Dashboard Principal', icon: 'grid-outline' },
  alunos: { label: 'Gestão de Alunos', icon: 'people-outline' },
  professores: { label: 'Gestão de Professores', icon: 'person-outline' },
  turmas: { label: 'Gestão de Turmas', icon: 'albums-outline' },
  salas: { label: 'Gestão de Salas', icon: 'business-outline' },
  notas: { label: 'Lançamento de Notas', icon: 'document-text-outline' },
  presencas: { label: 'Controlo de Presenças', icon: 'checkmark-circle-outline' },
  horario: { label: 'Horários de Aula', icon: 'time-outline' },
  secretaria_hub: { label: 'Hub de Secretaria', icon: 'briefcase-outline' },
  admissao: { label: 'Admissão / Matrículas', icon: 'enter-outline' },
  editor_documentos: { label: 'Editor de Documentos', icon: 'create-outline' },
  boletim_matricula: { label: 'Boletim de Matrícula', icon: 'newspaper-outline' },
  boletim_propina: { label: 'Boletim de Propina', icon: 'wallet-outline' },
  notificacoes: { label: 'Notificações', icon: 'notifications-outline' },
  portal_estudante: { label: 'Portal do Estudante', icon: 'school-outline' },
  gestao_academica: { label: 'Gestão Académica', icon: 'book-outline' },
  gerar_documento: { label: 'Gerar Documentos', icon: 'print-outline' },
  documentos_hub: { label: 'Hub de Documentos', icon: 'folder-outline' },
  professor_hub: { label: 'Portal do Professor', icon: 'person-circle-outline' },
  professor_turmas: { label: 'Turmas do Professor', icon: 'grid-outline' },
  professor_pauta: { label: 'Pauta do Professor', icon: 'list-outline' },
  professor_sumario: { label: 'Sumário', icon: 'clipboard-outline' },
  professor_mensagens: { label: 'Mensagens Internas', icon: 'mail-outline' },
  professor_materiais: { label: 'Materiais de Ensino', icon: 'library-outline' },
  eventos: { label: 'Eventos Escolares', icon: 'calendar-outline' },
  portal_encarregado: { label: 'Portal do Encarregado', icon: 'people-circle-outline' },
  ceo_dashboard: { label: 'Dashboard CEO/PCA', icon: 'stats-chart-outline' },
  financeiro: { label: 'Módulo Financeiro', icon: 'cash-outline' },
  pagamentos_hub: { label: 'Hub de Pagamentos', icon: 'card-outline' },
  extrato_propinas: { label: 'Extrato de Propinas', icon: 'receipt-outline' },
  financeiro_relatorios: { label: 'Relatórios Financeiros', icon: 'bar-chart-outline' },
  biblioteca: { label: 'Biblioteca Escolar', icon: 'library-outline' },
  transferencias: { label: 'Transferências de Alunos', icon: 'swap-horizontal-outline' },
  historico: { label: 'Histórico Académico', icon: 'archive-outline' },
  grelha: { label: 'Grelha de Avaliação', icon: 'grid-outline' },
  disciplinas: { label: 'Gestão de Disciplinas', icon: 'book-outline' },
  quadro_honra: { label: 'Quadro de Honra', icon: 'trophy-outline' },
  exclusoes_faltas: { label: 'Exclusões por Faltas', icon: 'remove-circle-outline' },
  diario_classe: { label: 'Diário de Classe', icon: 'journal-outline' },
  director_turma: { label: 'Director de Turma', icon: 'person-outline' },
  relatorio_faltas: { label: 'Relatório de Faltas', icon: 'alert-circle-outline' },
  chat_interno: { label: 'Chat Interno', icon: 'chatbubbles-outline' },
  calendario_academico: { label: 'Calendário Académico', icon: 'calendar-outline' },
  bolsas: { label: 'Bolsas de Estudo', icon: 'school-outline' },
  desempenho: { label: 'Análise de Desempenho', icon: 'trending-up-outline' },
  visao_geral: { label: 'Visão Geral', icon: 'eye-outline' },
  relatorios: { label: 'Relatórios Gerais', icon: 'document-outline' },
  rh_hub: { label: 'Hub de Recursos Humanos', icon: 'briefcase-outline' },
  pedagogico: { label: 'Painel Pedagógico', icon: 'easel-outline' },
  plano_aula: { label: 'Plano de Aula', icon: 'reader-outline' },
  avaliacao_professores: { label: 'Avaliação de Professores', icon: 'star-outline' },
  trabalhos_finais: { label: 'Trabalhos Finais (PAP)', icon: 'ribbon-outline' },
  rh_controle: { label: 'RH — Controlo Avançado', icon: 'settings-outline' },
  rh_payroll: { label: 'RH — Processamento Salarial', icon: 'wallet-outline' },
  auditoria: { label: 'Módulo de Auditoria', icon: 'shield-checkmark-outline' },

  gestao_acessos: { label: 'Gestão de Acessos e Permissões', icon: 'lock-closed-outline' },
  admin: { label: 'Painel de Administração', icon: 'cog-outline' },
  processos_secretaria: { label: 'Processos da Secretaria', icon: 'document-text-outline' },
  solicitacoes_documentos: { label: 'Solicitações de Documentos', icon: 'mail-outline' },
  arquivo_documentos: { label: 'Arquivo de Documentos', icon: 'archive-outline' },
  gerir_avaliacoes: { label: 'Gerir Abertura de Avaliações', icon: 'create-outline' },
  biblioteca_gestao: { label: 'Gestão da Biblioteca', icon: 'library-outline' },
  funcionarios: { label: 'Registo de Funcionários', icon: 'people-outline' },
  alterar_tipo_contrato: { label: 'Alterar Tipo de Vínculo', icon: 'swap-horizontal-outline' },
  med_integracao: { label: 'Integração MED / SIGE Gov', icon: 'globe-outline' },
  gestao_planos: { label: 'Gestão de Planos de Subscrição', icon: 'card-outline' },
  acta_provas: { label: 'Acta de Presença em Provas', icon: 'document-text-outline' },
  organizar_turmas: { label: 'Organizar Turmas', icon: 'git-branch-outline' },
  finalistas: { label: 'Finalistas (II Ciclo)', icon: 'ribbon-outline' },
  rh_faltas_tempos: { label: 'Controlo de Faltas e Tempos (RH)', icon: 'time-outline' },
  rupes_historico: { label: 'Histórico de RUPE', icon: 'receipt-outline' },
  tesouraria: { label: 'Tesouraria', icon: 'cash-outline' },
  acompanhamento_pautas: { label: 'Acompanhamento de Pautas', icon: 'stats-chart-outline' },
  estudio_emissao: { label: 'Estúdio de Emissão PDF', icon: 'color-wand-outline' },
  centro_emissao: { label: 'Centro de Emissão em Lote', icon: 'layers-outline' },
  consulta_aluno: { label: 'Consulta de Dossier de Aluno', icon: 'person-circle-outline' },
};

const NIVEL_ORDER: TipoNivel[] = ['prata', 'ouro', 'rubi'];

function featuresSoDesteNivel(nivel: TipoNivel): string[] {
  if (nivel === 'prata') return NIVEL_FEATURES.prata;
  if (nivel === 'ouro') return NIVEL_FEATURES.ouro.filter(f => !NIVEL_FEATURES.prata.includes(f));
  return NIVEL_FEATURES.rubi.filter(f => !NIVEL_FEATURES.ouro.includes(f));
}

export default function GestaoPlanosScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const { licenca } = useLicense();
  const [tabAtiva, setTabAtiva] = useState<TipoNivel>('rubi');
  const [expandido, setExpandido] = useState<Record<TipoNivel, boolean>>({
    prata: false, ouro: false, rubi: true,
  });

  const nivelAtual = licenca?.nivel || 'rubi';
  const bottomPad = Platform.OS === 'web' ? 24 : insets.bottom;

  // ── Guarda CEO — apenas o CEO tem acesso à gestão de planos/subscrição ──
  if (user?.role !== 'ceo') {
    return (
      <View style={s.container}>
        <TopBar title="Gestão de Planos" onBack={() => router.back()} />
        <View style={s.accessDenied}>
          <View style={s.accessDeniedIcon}>
            <Ionicons name="lock-closed" size={36} color={Colors.danger} />
          </View>
          <Text style={s.accessDeniedTitle}>Acesso Restrito</Text>
          <Text style={s.accessDeniedText}>
            A gestão de planos e subscrição é exclusiva do CEO.{'\n'}
            Contacte o CEO da instituição para questões relacionadas com a subscrição.
          </Text>
          <TouchableOpacity style={s.accessDeniedBtn} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={16} color="#fff" />
            <Text style={s.accessDeniedBtnText}>Voltar</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  function toggleExpandido(n: TipoNivel) {
    setExpandido(prev => ({ ...prev, [n]: !prev[n] }));
  }

  const featList = featuresSoDesteNivel(tabAtiva);

  return (
    <View style={s.container}>
      <TopBar title="Gestão de Planos" onBack={() => router.back()} />

      {/* Nível actual badge */}
      <View style={[s.atualBanner, { backgroundColor: NIVEL_COLOR[nivelAtual] + '18', borderColor: NIVEL_COLOR[nivelAtual] + '44' }]}>
        <Text style={{ fontSize: 20 }}>{NIVEL_EMOJI[nivelAtual]}</Text>
        <View style={{ flex: 1 }}>
          <Text style={[s.atualLabel, { color: NIVEL_COLOR[nivelAtual] }]}>
            Nível Activo: {NIVEL_LABEL[nivelAtual]}
          </Text>
          <Text style={s.atualSub}>{NIVEL_DESC[nivelAtual]}</Text>
        </View>
      </View>

      {/* Comparação de planos */}
      <HScrollTabBar style={s.tabRow} contentContainerStyle={{ flexDirection: 'row', flex: 1 }} keyboardShouldPersistTaps="handled">
        {NIVEL_ORDER.map(n => (
          <TouchableOpacity
            key={n}
            style={[s.tab, tabAtiva === n && { borderBottomColor: NIVEL_COLOR[n], borderBottomWidth: 3 }]}
            onPress={() => setTabAtiva(n)}
          >
            <Text style={{ fontSize: 16 }}>{NIVEL_EMOJI[n]}</Text>
            <Text style={[s.tabText, tabAtiva === n && { color: NIVEL_COLOR[n], fontFamily: 'Inter_700Bold' }]}>
              {NIVEL_LABEL[n]}
            </Text>
            <View style={[s.featCount, { backgroundColor: NIVEL_COLOR[n] + '22' }]}>
              <Text style={[s.featCountText, { color: NIVEL_COLOR[n] }]}>
                {NIVEL_FEATURES[n].length}
              </Text>
            </View>
          </TouchableOpacity>
        ))}
      </HScrollTabBar>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, paddingBottom: bottomPad + 24 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Card do plano seleccionado */}
        <View style={[s.planCard, { borderColor: NIVEL_COLOR[tabAtiva] + '55' }]}>
          <View style={s.planCardHeader}>
            <Text style={{ fontSize: 32 }}>{NIVEL_EMOJI[tabAtiva]}</Text>
            <View style={{ flex: 1 }}>
              <Text style={[s.planCardTitle, { color: NIVEL_COLOR[tabAtiva] }]}>
                Plano {NIVEL_LABEL[tabAtiva]}
              </Text>
              <Text style={s.planCardDesc}>{NIVEL_DESC[tabAtiva]}</Text>
            </View>
            {nivelAtual === tabAtiva && (
              <View style={[s.activeBadge, { backgroundColor: NIVEL_COLOR[tabAtiva] + '22', borderColor: NIVEL_COLOR[tabAtiva] + '55' }]}>
                <Text style={[s.activeBadgeText, { color: NIVEL_COLOR[tabAtiva] }]}>Activo</Text>
              </View>
            )}
          </View>
          <View style={[s.planStat, { backgroundColor: NIVEL_COLOR[tabAtiva] + '12' }]}>
            <Text style={[s.planStatNum, { color: NIVEL_COLOR[tabAtiva] }]}>
              {NIVEL_FEATURES[tabAtiva].length}
            </Text>
            <Text style={s.planStatLabel}>funcionalidades disponíveis</Text>
          </View>
        </View>

        {/* Comparação: o que este nível adiciona */}
        {tabAtiva !== 'prata' && (
          <View style={s.diffBanner}>
            <MaterialCommunityIcons name="plus-circle" size={16} color={Colors.success} />
            <Text style={s.diffText}>
              +{featList.length} funcionalidades exclusivas face ao plano inferior
            </Text>
          </View>
        )}

        {/* Lista de funcionalidades */}
        <Text style={s.sectionTitle}>
          {tabAtiva === 'prata' ? 'Funcionalidades Base' : `Funcionalidades Exclusivas do ${NIVEL_LABEL[tabAtiva]}`}
        </Text>

        {featList.map(key => {
          const feat = FEATURES_DETALHADAS[key];
          if (!feat) return null;
          return (
            <View key={key} style={s.featItem}>
              <View style={[s.featIconBox, { backgroundColor: NIVEL_COLOR[tabAtiva] + '18' }]}>
                <Ionicons name={feat.icon as any} size={16} color={NIVEL_COLOR[tabAtiva]} />
              </View>
              <Text style={s.featLabel}>{feat.label}</Text>
              <Ionicons name="checkmark-circle" size={16} color={Colors.success} />
            </View>
          );
        })}

        {/* O que o plano inferior já inclui */}
        {tabAtiva !== 'prata' && (
          <>
            <Text style={[s.sectionTitle, { marginTop: 24 }]}>
              Também inclui tudo do Plano {tabAtiva === 'ouro' ? NIVEL_LABEL.prata : NIVEL_LABEL.ouro}
            </Text>
            <View style={[s.includedBanner, { backgroundColor: NIVEL_COLOR[tabAtiva === 'ouro' ? 'prata' : 'ouro'] + '12', borderColor: NIVEL_COLOR[tabAtiva === 'ouro' ? 'prata' : 'ouro'] + '33' }]}>
              <Text style={{ fontSize: 18 }}>{NIVEL_EMOJI[tabAtiva === 'ouro' ? 'prata' : 'ouro']}</Text>
              <Text style={[s.includedText, { color: NIVEL_COLOR[tabAtiva === 'ouro' ? 'prata' : 'ouro'] }]}>
                {tabAtiva === 'ouro'
                  ? `${NIVEL_FEATURES.prata.length} funcionalidades do Plano ${NIVEL_LABEL.prata} incluídas`
                  : `${NIVEL_FEATURES.ouro.length} funcionalidades do Plano ${NIVEL_LABEL.ouro} incluídas`}
              </Text>
            </View>
          </>
        )}

        {/* Pricing info */}
        <View style={s.pricingCard}>
          <MaterialCommunityIcons name="currency-usd" size={20} color={Colors.gold} />
          <View style={{ flex: 1 }}>
            <Text style={s.pricingTitle}>Preço por Renovação</Text>
            <Text style={s.pricingDesc}>
              Calculado com base no número de alunos matriculados × preço por aluno configurável (padrão: 50 KZ/aluno).
            </Text>
            <Text style={[s.pricingFormula, { color: Colors.gold }]}>
              Valor = Nº Alunos × Preço/Aluno − Crédito Acumulado
            </Text>
          </View>
        </View>

        {/* Ir para CEO para gerar */}
        <TouchableOpacity
          style={s.gerarBtn}
          onPress={() => router.push('/(main)/ceo' as any)}
        >
          <MaterialCommunityIcons name="key-plus" size={18} color="#fff" />
          <Text style={s.gerarBtnText}>Gerar Código de Activação</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  atualBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    margin: 16, borderRadius: 14, padding: 14,
    borderWidth: 1,
  },
  atualLabel: { fontSize: 15, fontFamily: 'Inter_700Bold' },
  atualSub: { fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 2 },
  tabRow: {
    flexDirection: 'row', backgroundColor: Colors.primaryDark,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  tab: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 12, borderBottomWidth: 3, borderBottomColor: 'transparent',
  },
  tabText: { fontSize: 13, fontFamily: 'Inter_500Medium', color: Colors.textSecondary },
  featCount: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 },
  featCountText: { fontSize: 10, fontFamily: 'Inter_700Bold' },

  planCard: {
    backgroundColor: Colors.backgroundCard, borderRadius: 16, padding: 16,
    borderWidth: 1, marginBottom: 12,
  },
  planCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  planCardTitle: { fontSize: 18, fontFamily: 'Inter_700Bold' },
  planCardDesc: { fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 2 },
  activeBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, borderWidth: 1 },
  activeBadgeText: { fontSize: 11, fontFamily: 'Inter_700Bold' },
  planStat: { borderRadius: 10, padding: 12, alignItems: 'center' },
  planStatNum: { fontSize: 32, fontFamily: 'Inter_700Bold' },
  planStatLabel: { fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 2 },

  diffBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: Colors.success + '12', borderRadius: 10,
    padding: 10, marginBottom: 12,
    borderWidth: 1, borderColor: Colors.success + '33',
  },
  diffText: { fontSize: 13, fontFamily: 'Inter_500Medium', color: Colors.success, flex: 1 },

  sectionTitle: {
    fontSize: 11, fontFamily: 'Inter_600SemiBold', color: Colors.textMuted,
    textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10,
  },
  featItem: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: Colors.backgroundCard, borderRadius: 10, padding: 12,
    marginBottom: 6, borderWidth: 1, borderColor: Colors.border,
  },
  featIconBox: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  featLabel: { flex: 1, fontSize: 13, fontFamily: 'Inter_500Medium', color: Colors.text },

  includedBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderRadius: 10, padding: 12, marginBottom: 12, borderWidth: 1,
  },
  includedText: { fontSize: 13, fontFamily: 'Inter_500Medium', flex: 1 },

  pricingCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    backgroundColor: Colors.backgroundCard, borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: Colors.gold + '33', marginTop: 16, marginBottom: 12,
  },
  pricingTitle: { fontSize: 14, fontFamily: 'Inter_700Bold', color: Colors.text, marginBottom: 4 },
  pricingDesc: { fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textSecondary, marginBottom: 4 },
  pricingFormula: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },

  gerarBtn: {
    backgroundColor: Colors.gold, borderRadius: 14, flexDirection: 'row',
    alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 16,
  },
  gerarBtnText: { fontSize: 15, fontFamily: 'Inter_700Bold', color: '#fff' },

  // Acesso negado
  accessDenied: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  accessDeniedIcon: { width: 80, height: 80, borderRadius: 24, backgroundColor: Colors.danger + '18', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.danger + '40', marginBottom: 20 },
  accessDeniedTitle: { fontSize: 22, fontFamily: 'Inter_700Bold', color: Colors.text, marginBottom: 12 },
  accessDeniedText: { fontSize: 14, fontFamily: 'Inter_400Regular', color: Colors.textMuted, textAlign: 'center', lineHeight: 22, marginBottom: 28 },
  accessDeniedBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.accent, borderRadius: 12, paddingHorizontal: 24, paddingVertical: 14 },
  accessDeniedBtnText: { fontSize: 15, fontFamily: 'Inter_700Bold', color: '#fff' },
});
