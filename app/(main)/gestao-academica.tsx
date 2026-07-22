import React, { useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Dimensions, Platform,
} from 'react-native';
import { Ionicons, MaterialIcons, FontAwesome5, MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '@/constants/colors';
import { useData } from '@/context/DataContext';
import { useAuth } from '@/context/AuthContext';
import { useAnoAcademico } from '@/context/AnoAcademicoContext';
import TopBar from '@/components/TopBar';

const { width } = Dimensions.get('window');
const isWide = width >= 768;

// ─── Helpers ────────────────────────────────────────────────────────────────
function fmtDate(d: Date) {
  return d.toLocaleDateString('pt-PT', { day: '2-digit', month: 'short', year: 'numeric' });
}

function now() { return new Date().toLocaleDateString('pt-PT'); }

// ─── Types ──────────────────────────────────────────────────────────────────
interface ModuloCardProps {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  stats: { label: string; value: string | number; color: string }[];
  color: string;
  onPress: () => void;
  locked?: boolean;
  alerts?: number;
}

interface AlertaItem {
  tipo: 'warning' | 'danger' | 'info';
  titulo: string;
  descricao: string;
  icon: string;
  acao?: string;
  route?: string;
}

// ─── Módulo Card ────────────────────────────────────────────────────────────
function ModuloCard({ icon, title, subtitle, stats, color, onPress, locked, alerts }: ModuloCardProps) {
  return (
    <TouchableOpacity
      style={[styles.moduloCard, isWide && styles.moduloCardWide]}
      onPress={onPress}
      activeOpacity={0.82}
    >
      <View style={styles.moduloTop}>
        <View style={[styles.moduloIconWrap, { backgroundColor: color + '20' }]}>
          {icon}
        </View>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={styles.moduloTitle}>{title}</Text>
            {locked && (
              <View style={styles.lockedBadge}>
                <Ionicons name="lock-closed" size={9} color={Colors.textMuted} />
                <Text style={styles.lockedText}>Só leitura</Text>
              </View>
            )}
            {!!alerts && alerts > 0 && (
              <View style={[styles.alertBadge, { backgroundColor: Colors.danger }]}>
                <Text style={styles.alertBadgeText}>{alerts}</Text>
              </View>
            )}
          </View>
          <Text style={styles.moduloSubtitle}>{subtitle}</Text>
        </View>
        <Ionicons name={locked ? 'eye-outline' : 'chevron-forward'} size={18} color={Colors.textMuted} />
      </View>

      {stats.length > 0 && (
        <View style={styles.moduloStats}>
          {stats.map((s, i) => (
            <View key={i} style={styles.moduloStatItem}>
              <Text style={[styles.moduloStatVal, { color: s.color }]}>{s.value}</Text>
              <Text style={styles.moduloStatLabel}>{s.label}</Text>
            </View>
          ))}
        </View>
      )}

      <View style={[styles.moduloBar, { backgroundColor: color }]} />
    </TouchableOpacity>
  );
}

// ─── Alerta Card ────────────────────────────────────────────────────────────
function AlertaCard({ item, onPress }: { item: AlertaItem; onPress?: () => void }) {
  const cor = item.tipo === 'danger' ? Colors.danger : item.tipo === 'warning' ? Colors.warning : Colors.info;
  return (
    <TouchableOpacity
      style={[styles.alertaCard, { borderLeftColor: cor }]}
      onPress={onPress}
      activeOpacity={onPress ? 0.75 : 1}
    >
      <View style={[styles.alertaIconWrap, { backgroundColor: cor + '20' }]}>
        <Ionicons name={item.icon as any} size={18} color={cor} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.alertaTitulo}>{item.titulo}</Text>
        <Text style={styles.alertaDesc}>{item.descricao}</Text>
      </View>
      {item.acao && (
        <View style={[styles.alertaAcaoBtn, { backgroundColor: cor + '20', borderColor: cor + '50' }]}>
          <Text style={[styles.alertaAcaoText, { color: cor }]}>{item.acao}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

// ─── Actividade Item ────────────────────────────────────────────────────────
function ActividadeItem({ icon, color, titulo, descricao, data }: {
  icon: string; color: string; titulo: string; descricao: string; data: string;
}) {
  return (
    <View style={styles.actividadeRow}>
      <View style={[styles.actividadeDot, { backgroundColor: color }]} />
      <View style={[styles.actividadeIconWrap, { backgroundColor: color + '18' }]}>
        <Ionicons name={icon as any} size={14} color={color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.actividadeTitulo}>{titulo}</Text>
        <Text style={styles.actividadeDesc}>{descricao}</Text>
      </View>
      <Text style={styles.actividadeData}>{data}</Text>
    </View>
  );
}

// ─── Main Screen ─────────────────────────────────────────────────────────────
export default function GestaoAcademicaScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { alunos, professores, turmas, notas, presencas } = useData();
  const { anoSelecionado, trimestreAtual } = useAnoAcademico();

  const [expandAlertas, setExpandAlertas] = useState(true);
  const [expandActividades, setExpandActividades] = useState(true);

  // ── Stats computadas ──────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const alunosAtivos = alunos.filter(a => a.ativo);
    const professoresAtivos = professores.filter(p => p.ativo);
    const turmasAtivas = turmas.filter(t => t.ativo);

    // Presenças de hoje
    const hoje = now();
    const presencasHoje = presencas.filter(p => p.data === hoje);
    const faltasHoje = presencasHoje.filter(p => p.status === 'F').length;

    // Presenças gerais — taxa de presença
    const totalPresencas = presencas.length;
    const totalPresentes = presencas.filter(p => p.status === 'P').length;
    const taxaPresenca = totalPresencas > 0 ? Math.round((totalPresentes / totalPresencas) * 100) : 100;

    // Notas do ano lectivo actual
    const notasAno = anoSelecionado
      ? notas.filter(n => n.anoLetivo === anoSelecionado.ano)
      : notas;
    const mediaGeral = notasAno.length > 0
      ? notasAno.reduce((s, n) => s + (n.nf ?? n.mac ?? 0), 0) / notasAno.length
      : 0;
    const disciplinas = new Set(notasAno.map(n => n.disciplina)).size;

    // Alunos com faltas excessivas (> 15)
    const alunosComFaltas = alunosAtivos.filter(a => {
      const faltas = presencas.filter(p => p.alunoId === a.id && p.status === 'F').length;
      return faltas > 15;
    }).length;

    // Turmas sem director
    const turmasSemDirector = turmasAtivas.filter(t => !t.professorId).length;

    // Alunos sem notas no ano actual
    const alunosSemNotas = anoSelecionado
      ? alunosAtivos.filter(a => !notasAno.some(n => n.alunoId === a.id)).length
      : 0;

    // Distribuição género
    const masculino = alunosAtivos.filter(a => a.genero === 'M').length;
    const feminino = alunosAtivos.filter(a => a.genero === 'F').length;

    // Aprovados / Reprovados
    const aprovados = alunosAtivos.filter(a => {
      const notasA = notasAno.filter(n => n.alunoId === a.id);
      if (!notasA.length) return false;
      const media = notasA.reduce((s, n) => s + (n.nf ?? n.mac ?? 0), 0) / notasA.length;
      return media >= 10;
    }).length;
    const reprovados = alunosAtivos.filter(a => {
      const notasA = notasAno.filter(n => n.alunoId === a.id);
      if (!notasA.length) return false;
      const media = notasA.reduce((s, n) => s + (n.nf ?? n.mac ?? 0), 0) / notasA.length;
      return media < 10;
    }).length;

    return {
      totalAlunos: alunosAtivos.length,
      totalProfessores: professoresAtivos.length,
      totalTurmas: turmasAtivas.length,
      faltasHoje,
      presencasHoje: presencasHoje.length,
      taxaPresenca,
      mediaGeral,
      disciplinas,
      totalNotas: notasAno.length,
      alunosComFaltas,
      turmasSemDirector,
      alunosSemNotas,
      masculino,
      feminino,
      aprovados,
      reprovados,
    };
  }, [alunos, professores, turmas, notas, presencas, anoSelecionado]);

  // ── Alertas ────────────────────────────────────────────────────────────────
  const alertas = useMemo<AlertaItem[]>(() => {
    const list: AlertaItem[] = [];

    if (stats.alunosComFaltas > 0) {
      list.push({
        tipo: 'danger',
        titulo: `${stats.alunosComFaltas} aluno(s) com faltas excessivas`,
        descricao: 'Mais de 15 faltas registadas. Comunicar ao encarregado de educação.',
        icon: 'warning',
        acao: 'Ver Presenças',
        route: '/(main)/presencas',
      });
    }
    if (stats.turmasSemDirector > 0) {
      list.push({
        tipo: 'warning',
        titulo: `${stats.turmasSemDirector} turma(s) sem director de turma`,
        descricao: 'Atribuir um professor responsável a cada turma activa.',
        icon: 'alert-circle',
        acao: 'Ver Turmas',
        route: '/(main)/turmas',
      });
    }
    if (stats.alunosSemNotas > 0 && anoSelecionado) {
      list.push({
        tipo: 'warning',
        titulo: `${stats.alunosSemNotas} aluno(s) sem notas em ${anoSelecionado.ano}`,
        descricao: 'Notas ainda não foram lançadas para estes alunos.',
        icon: 'book-outline',
        acao: 'Lançar Notas',
        route: '/(main)/notas',
      });
    }
    if (stats.taxaPresenca < 75 && stats.totalAlunos > 0) {
      list.push({
        tipo: 'danger',
        titulo: `Taxa de presença abaixo do mínimo (${stats.taxaPresenca}%)`,
        descricao: 'A taxa de frequência está abaixo de 75%. Verificar registos de presença.',
        icon: 'calendar-clear',
        acao: 'Ver Presenças',
        route: '/(main)/presencas',
      });
    }
    if (list.length === 0) {
      list.push({
        tipo: 'info',
        titulo: 'Tudo em ordem',
        descricao: 'Não há alertas académicos activos no momento.',
        icon: 'checkmark-circle',
      });
    }
    return list;
  }, [stats, anoSelecionado]);

  // ── Actividades Recentes (imutáveis — derivadas dos dados) ─────────────────
  const actividades = useMemo(() => {
    const items: { icon: string; color: string; titulo: string; descricao: string; data: string; ts: number }[] = [];

    // Últimas notas lançadas
    const notasOrdenadas = [...notas]
      .filter(n => n.data)
      .sort((a, b) => b.data.localeCompare(a.data))
      .slice(0, 5);
    notasOrdenadas.forEach(n => {
      const aluno = alunos.find(a => a.id === n.alunoId);
      if (aluno) {
        items.push({
          icon: 'create',
          color: Colors.success,
          titulo: 'Notas lançadas',
          descricao: `${n.disciplina} — ${aluno.nome} ${aluno.apelido} (${n.nf > 0 ? n.nf.toFixed(1) : '—'})`,
          data: n.data,
          ts: new Date(n.data.split('/').reverse().join('-')).getTime() || 0,
        });
      }
    });

    // Últimas presenças registadas
    const presencasOrdenadas = [...presencas]
      .filter(p => p.data)
      .sort((a, b) => b.data.localeCompare(a.data))
      .slice(0, 5);
    const presDataMap = new Map<string, { data: string; turmaId: string; count: number }>();
    presencasOrdenadas.forEach(p => {
      const key = `${p.data}-${p.turmaId}`;
      const prev = presDataMap.get(key);
      if (!prev) presDataMap.set(key, { data: p.data, turmaId: p.turmaId, count: 1 });
      else prev.count += 1;
    });
    presDataMap.forEach(v => {
      const turma = turmas.find(t => t.id === v.turmaId);
      items.push({
        icon: 'calendar-check' as any,
        color: Colors.info,
        titulo: 'Presença registada',
        descricao: `${turma?.nome || 'Turma'} — ${v.count} registo(s) em ${v.data}`,
        data: v.data,
        ts: new Date(v.data.split('/').reverse().join('-')).getTime() || 0,
      });
    });

    // Últimos alunos matriculados
    const alunosOrdenados = [...alunos]
      .filter(a => a.ativo && a.createdAt)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 3);
    alunosOrdenados.forEach(a => {
      const turma = turmas.find(t => t.id === a.turmaId);
      items.push({
        icon: 'person-add',
        color: Colors.gold,
        titulo: 'Aluno matriculado',
        descricao: `${a.nome} ${a.apelido} — ${turma?.nome || '—'} (${a.numeroMatricula})`,
        data: fmtDate(new Date(a.createdAt)),
        ts: new Date(a.createdAt).getTime() || 0,
      });
    });

    // Últimos professores registados
    const profsOrdenados = [...professores]
      .filter(p => p.ativo && p.createdAt)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 2);
    profsOrdenados.forEach(p => {
      items.push({
        icon: 'school',
        color: Colors.accent,
        titulo: 'Professor registado',
        descricao: `${p.nome} ${p.apelido} — ${p.disciplinas.slice(0, 2).join(', ')}`,
        data: fmtDate(new Date(p.createdAt)),
        ts: new Date(p.createdAt).getTime() || 0,
      });
    });

    return items
      .sort((a, b) => b.ts - a.ts)
      .slice(0, 12);
  }, [notas, presencas, alunos, professores, turmas]);

  const nav = (route: string) => router.push(route as any);

  return (
    <View style={styles.container}>
      <TopBar
        title="Gestão Académica"
        subtitle={anoSelecionado?.ano || 'Ano lectivo'}
      />

      <ScrollView showsVerticalScrollIndicator={false} style={styles.scroll}>

        {/* ── Resumo Geral ───────────────────────────────────────────────── */}
        <LinearGradient colors={['#0D1F35', '#112257']} style={styles.resumoCard}>
          <Text style={styles.resumoTitle}>Resumo do Ano Lectivo</Text>
          <Text style={styles.resumoAno}>{anoSelecionado?.ano || '—'}</Text>
          <View style={styles.resumoStats}>
            <View style={styles.resumoStat}>
              <Text style={[styles.resumoVal, { color: Colors.info }]}>{stats.totalAlunos}</Text>
              <Text style={styles.resumoLbl}>Alunos</Text>
            </View>
            <View style={styles.resumoDivider} />
            <View style={styles.resumoStat}>
              <Text style={[styles.resumoVal, { color: Colors.gold }]}>{stats.totalProfessores}</Text>
              <Text style={styles.resumoLbl}>Professores</Text>
            </View>
            <View style={styles.resumoDivider} />
            <View style={styles.resumoStat}>
              <Text style={[styles.resumoVal, { color: Colors.success }]}>{stats.totalTurmas}</Text>
              <Text style={styles.resumoLbl}>Turmas</Text>
            </View>
            <View style={styles.resumoDivider} />
            <View style={styles.resumoStat}>
              <Text style={[styles.resumoVal, { color: stats.taxaPresenca >= 75 ? Colors.success : Colors.warning }]}>
                {stats.taxaPresenca}%
              </Text>
              <Text style={styles.resumoLbl}>Frequência</Text>
            </View>
          </View>
          <View style={styles.resumoSecondRow}>
            <View style={styles.resumoSmallStat}>
              <Ionicons name="checkmark-circle" size={14} color={Colors.success} />
              <Text style={styles.resumoSmallText}>{stats.aprovados} aprovados</Text>
            </View>
            <View style={styles.resumoSmallStat}>
              <Ionicons name="close-circle" size={14} color={Colors.accent} />
              <Text style={styles.resumoSmallText}>{stats.reprovados} reprovados</Text>
            </View>
            <View style={styles.resumoSmallStat}>
              <Ionicons name="trending-up" size={14} color={Colors.gold} />
              <Text style={styles.resumoSmallText}>Média {stats.mediaGeral.toFixed(1)}</Text>
            </View>
          </View>

          {/* ── Barra de Progresso dos Trimestres ── */}
          {anoSelecionado && (() => {
            const trimestres = (anoSelecionado.trimestres || []).slice().sort((a, b) => a.numero - b.numero);
            if (trimestres.length === 0) return null;
            const today = new Date().toISOString().split('T')[0];

            const ordinal = (n: number) => n === 1 ? '1.º' : n === 2 ? '2.º' : '3.º';

            // Calcula progresso dentro do trimestre activo
            let progressoAtivo = 0;
            if (trimestreAtual) {
              const inicio = new Date(trimestreAtual.dataInicio).getTime();
              const fim = new Date(trimestreAtual.dataFim).getTime();
              const agora = new Date().getTime();
              progressoAtivo = Math.min(100, Math.max(0, ((agora - inicio) / (fim - inicio)) * 100));
            }

            return (
              <View style={styles.trimestreWrap}>
                <View style={styles.trimestreHeader}>
                  <Ionicons name="time-outline" size={13} color={Colors.gold} />
                  <Text style={styles.trimestreHeaderText}>
                    {trimestreAtual
                      ? `${ordinal(trimestreAtual.numero)} Trimestre em curso`
                      : 'Progresso do Ano Lectivo'}
                  </Text>
                </View>

                {/* Segmentos */}
                <View style={styles.trimestreSegmentos}>
                  {[1, 2, 3].map(num => {
                    const t = trimestres.find(x => x.numero === num);
                    const isAtivo = trimestreAtual?.numero === num;
                    const isPast = t ? today > t.dataFim : false;
                    const isFuture = t ? today < t.dataInicio : !isPast && !isAtivo;

                    return (
                      <View key={num} style={[styles.trimestreSegmento, num < 3 && { marginRight: 6 }]}>
                        {/* Track */}
                        <View style={[
                          styles.trimestreTrack,
                          isPast && { backgroundColor: Colors.success + '60' },
                          isAtivo && { backgroundColor: 'rgba(212,175,55,0.25)' },
                          isFuture && { backgroundColor: 'rgba(255,255,255,0.08)' },
                        ]}>
                          {/* Fill */}
                          {isPast && (
                            <View style={[styles.trimestreFill, { width: '100%', backgroundColor: Colors.success }]} />
                          )}
                          {isAtivo && (
                            <View style={[styles.trimestreFill, { width: `${progressoAtivo}%`, backgroundColor: Colors.gold }]} />
                          )}
                        </View>

                        {/* Label */}
                        <View style={styles.trimestreLabelRow}>
                          {isAtivo && (
                            <View style={styles.trimestrepointDot} />
                          )}
                          {isPast && (
                            <Ionicons name="checkmark" size={10} color={Colors.success} />
                          )}
                          <Text style={[
                            styles.trimestreLabel,
                            isAtivo && { color: Colors.gold, fontFamily: 'Inter_700Bold' },
                            isPast && { color: Colors.success },
                            isFuture && { color: 'rgba(255,255,255,0.3)' },
                          ]}>
                            T{num}
                          </Text>
                        </View>
                      </View>
                    );
                  })}
                </View>

                {/* Indicador textual */}
                <Text style={styles.trimestreIndicador}>
                  {trimestreAtual
                    ? `📍 Estás no ${ordinal(trimestreAtual.numero)} Trimestre${progressoAtivo > 0 ? ` · ${Math.round(progressoAtivo)}% concluído` : ''}`
                    : today < (trimestres[0]?.dataInicio || '') ? '⏳ Ano lectivo ainda não começou' : '✅ Ano lectivo concluído'}
                </Text>
              </View>
            );
          })()}
        </LinearGradient>

        {/* ── Módulos de Gestão ──────────────────────────────────────────── */}
        <Text style={styles.sectionTitle}>Módulos de Gestão</Text>
        <View style={[styles.modulosGrid, isWide && styles.modulosGridWide]}>

          {/* Alunos */}
          <ModuloCard
            icon={<Ionicons name="people" size={24} color={Colors.info} />}
            title="Alunos"
            subtitle="Matrícula, transferência e dados dos alunos"
            color={Colors.info}
            stats={[
              { label: 'Activos', value: stats.totalAlunos, color: Colors.info },
              { label: 'Masculino', value: stats.masculino, color: Colors.textSecondary },
              { label: 'Feminino', value: stats.feminino, color: Colors.textSecondary },
            ]}
            alerts={stats.alunosComFaltas}
            onPress={() => nav('/(main)/alunos')}
          />

          {/* Professores */}
          <ModuloCard
            icon={<FontAwesome5 name="chalkboard-teacher" size={20} color={Colors.gold} />}
            title="Professores"
            subtitle="Corpo docente, disciplinas e turmas atribuídas"
            color={Colors.gold}
            stats={[
              { label: 'Activos', value: stats.totalProfessores, color: Colors.gold },
              { label: 'Turmas s/ Director', value: stats.turmasSemDirector, color: stats.turmasSemDirector > 0 ? Colors.warning : Colors.success },
            ]}
            alerts={stats.turmasSemDirector}
            onPress={() => nav('/(main)/professores')}
          />

          {/* Turmas */}
          <ModuloCard
            icon={<MaterialIcons name="class" size={24} color={Colors.success} />}
            title="Turmas"
            subtitle="Organização das turmas, turnos e classes"
            color={Colors.success}
            stats={[
              { label: 'Activas', value: stats.totalTurmas, color: Colors.success },
              { label: 'Sem Director', value: stats.turmasSemDirector, color: stats.turmasSemDirector > 0 ? Colors.warning : Colors.success },
            ]}
            onPress={() => nav('/(main)/turmas')}
          />

          {/* Presenças */}
          <ModuloCard
            icon={<MaterialCommunityIcons name="calendar-check" size={24} color="#8B5CF6" />}
            title="Presenças"
            subtitle="Registo diário de presenças e faltas"
            color="#8B5CF6"
            stats={[
              { label: 'Taxa Frequência', value: `${stats.taxaPresenca}%`, color: stats.taxaPresenca >= 75 ? Colors.success : Colors.warning },
              { label: 'Faltas Hoje', value: stats.faltasHoje, color: stats.faltasHoje > 0 ? Colors.danger : Colors.success },
              { label: 'C/ Excesso', value: stats.alunosComFaltas, color: stats.alunosComFaltas > 0 ? Colors.danger : Colors.success },
            ]}
            alerts={stats.alunosComFaltas}
            onPress={() => nav('/(main)/presencas')}
          />

          {/* Notas e Pautas */}
          <ModuloCard
            icon={<Ionicons name="ribbon" size={24} color={Colors.accent} />}
            title="Notas e Pautas"
            subtitle="Lançamento de notas por trimestre e disciplina"
            color={Colors.accent}
            stats={[
              { label: 'Lançamentos', value: stats.totalNotas, color: Colors.accent },
              { label: 'Disciplinas', value: stats.disciplinas, color: Colors.textSecondary },
              { label: 'Média Geral', value: stats.mediaGeral.toFixed(1), color: stats.mediaGeral >= 10 ? Colors.success : Colors.warning },
            ]}
            alerts={stats.alunosSemNotas}
            onPress={() => nav('/(main)/notas')}
          />

          {/* Pautas (Grelha) */}
          <ModuloCard
            icon={<MaterialCommunityIcons name="table-large" size={24} color="#06B6D4" />}
            title="Pautas por Turma"
            subtitle="Grelha completa de notas por turma e disciplina"
            color="#06B6D4"
            stats={[
              { label: 'Aprovados', value: stats.aprovados, color: Colors.success },
              { label: 'Reprovados', value: stats.reprovados, color: Colors.accent },
            ]}
            onPress={() => nav('/(main)/grelha')}
          />

          {/* Exame Extraordinário — Art. 23º §3 e §4 */}
          <ModuloCard
            icon={<MaterialCommunityIcons name="clipboard-alert-outline" size={24} color={Colors.warning} />}
            title="Exame Extraordinário"
            subtitle="Art. 23º §3 e §4 — Alunos com matrícula condicional e exames do 1.º trimestre"
            color={Colors.warning}
            stats={[
              { label: 'Condicionais', value: stats.reprovados > 0 ? '!' : '—', color: Colors.warning },
            ]}
            onPress={() => nav('/(main)/exame-extraordinario')}
          />

          {/* Exame de Recurso — Art. 33º */}
          <ModuloCard
            icon={<MaterialCommunityIcons name="refresh-circle" size={24} color="#f97316" />}
            title="Exame de Recurso"
            subtitle="Art. 33º — Identificar alunos elegíveis para recurso por turma/classe"
            color="#f97316"
            stats={[
              { label: 'Art. 33º', value: '↻', color: '#f97316' },
            ]}
            onPress={() => nav('/(main)/exame-recurso')}
          />

          {/* Exame de Melhoria de Nota — Art. 36º */}
          <ModuloCard
            icon={<MaterialCommunityIcons name="trending-up" size={24} color="#8b5cf6" />}
            title="Melhoria de Nota"
            subtitle="Art. 36º — Gerir solicitações de melhoria dos alunos (nota 10–16)"
            color="#8b5cf6"
            stats={[
              { label: 'Art. 36º', value: '↑', color: '#8b5cf6' },
            ]}
            onPress={() => nav('/(main)/melhoria-nota')}
          />

          {/* Horário */}
          <ModuloCard
            icon={<MaterialCommunityIcons name="clock-time-four" size={24} color={Colors.warning} />}
            title="Horário"
            subtitle="Horários das turmas e distribuição das aulas"
            color={Colors.warning}
            stats={[
              { label: 'Turmas', value: stats.totalTurmas, color: Colors.warning },
            ]}
            onPress={() => nav('/(main)/horario')}
          />

          {/* Disciplinas */}
          <ModuloCard
            icon={<MaterialCommunityIcons name="book-open-page-variant" size={24} color="#EC4899" />}
            title="Disciplinas"
            subtitle="Catálogo de disciplinas e áreas de conhecimento"
            color="#EC4899"
            stats={[
              { label: 'Disciplinas', value: stats.disciplinas, color: '#EC4899' },
            ]}
            onPress={() => nav('/(main)/disciplinas')}
          />

          {/* Histórico — Só Leitura */}
          <ModuloCard
            icon={<Ionicons name="time" size={24} color={Colors.textSecondary} />}
            title="Histórico Académico"
            subtitle="Registo permanente e imutável por aluno e turma"
            color={Colors.textSecondary}
            stats={[
              { label: 'Alunos', value: stats.totalAlunos, color: Colors.textSecondary },
              { label: 'Aprovados', value: stats.aprovados, color: Colors.success },
            ]}
            locked
            onPress={() => nav('/(main)/historico')}
          />

          {/* Exclusões & Faltas */}
          <ModuloCard
            icon={<MaterialCommunityIcons name="account-cancel" size={24} color={Colors.danger} />}
            title="Exclusões & Faltas"
            subtitle="Levantamento mensal de faltas, exclusões e anulações de matrícula"
            color={Colors.danger}
            stats={[
              { label: 'Turmas', value: stats.totalTurmas, color: Colors.danger },
            ]}
            onPress={() => nav('/(main)/exclusoes-faltas')}
          />

          {/* Quadro de Honra */}
          <ModuloCard
            icon={<MaterialCommunityIcons name="trophy" size={24} color="#FFD700" />}
            title="Quadro de Honra"
            subtitle="Melhores alunos por turma e geral, melhor da escola"
            color="#FFD700"
            stats={[
              { label: 'Alunos Activos', value: stats.totalAlunos, color: '#FFD700' },
            ]}
            onPress={() => nav('/(main)/quadro-honra')}
          />
        </View>

        {/* ── Alertas e Pendências ───────────────────────────────────────── */}
        <TouchableOpacity
          style={styles.secHeader}
          onPress={() => setExpandAlertas(v => !v)}
          activeOpacity={0.8}
        >
          <View style={styles.secHeaderLeft}>
            <Ionicons name="alert-circle" size={16} color={Colors.warning} />
            <Text style={styles.sectionTitle2}>Alertas e Pendências</Text>
            <View style={[styles.countBadge, alertas[0]?.tipo !== 'info' ? { backgroundColor: Colors.danger + '30', borderColor: Colors.danger + '50' } : {}]}>
              <Text style={[styles.countText, alertas[0]?.tipo !== 'info' ? { color: Colors.danger } : {}]}>
                {alertas[0]?.tipo === 'info' ? '✓' : alertas.length}
              </Text>
            </View>
          </View>
          <Ionicons name={expandAlertas ? 'chevron-up' : 'chevron-down'} size={16} color={Colors.textMuted} />
        </TouchableOpacity>

        {expandAlertas && (
          <View style={styles.alertasWrap}>
            {alertas.map((a, i) => (
              <AlertaCard
                key={i}
                item={a}
                onPress={a.route ? () => nav(a.route!) : undefined}
              />
            ))}
          </View>
        )}

        {/* ── Actividades Recentes (Imutável) ────────────────────────────── */}
        <TouchableOpacity
          style={styles.secHeader}
          onPress={() => setExpandActividades(v => !v)}
          activeOpacity={0.8}
        >
          <View style={styles.secHeaderLeft}>
            <Ionicons name="list" size={16} color={Colors.info} />
            <Text style={styles.sectionTitle2}>Actividades Recentes</Text>
            <View style={styles.lockedBadge}>
              <Ionicons name="lock-closed" size={9} color={Colors.textMuted} />
              <Text style={styles.lockedText}>Somente leitura</Text>
            </View>
          </View>
          <Ionicons name={expandActividades ? 'chevron-up' : 'chevron-down'} size={16} color={Colors.textMuted} />
        </TouchableOpacity>

        {expandActividades && (
          <View style={styles.actividadesCard}>
            {actividades.length === 0 ? (
              <View style={styles.emptyActividade}>
                <Ionicons name="time-outline" size={32} color={Colors.textMuted} />
                <Text style={styles.emptyActividadeText}>Nenhuma actividade registada ainda.</Text>
              </View>
            ) : (
              <>
                <View style={styles.actividadeHeader}>
                  <Ionicons name="information-circle-outline" size={14} color={Colors.textMuted} />
                  <Text style={styles.actividadeHeaderText}>
                    O histórico de actividades é gerado automaticamente e não pode ser editado.
                  </Text>
                </View>
                {actividades.map((a, i) => (
                  <ActividadeItem key={i} {...a} />
                ))}
                <TouchableOpacity
                  style={styles.verHistoricoBtn}
                  onPress={() => nav('/(main)/historico')}
                >
                  <Ionicons name="time" size={15} color={Colors.gold} />
                  <Text style={styles.verHistoricoText}>Ver Histórico Académico Completo</Text>
                  <Ionicons name="chevron-forward" size={14} color={Colors.gold} />
                </TouchableOpacity>
              </>
            )}
          </View>
        )}

        {/* ── Acções Rápidas ─────────────────────────────────────────────── */}
        <Text style={styles.sectionTitle}>Acções Rápidas</Text>
        <View style={styles.quickActions}>
          {[
            { icon: 'person-add', label: 'Nova\nMatrícula', color: Colors.info, route: '/(main)/alunos' },
            { icon: 'document-text', label: 'Emitir\nDocumento', color: Colors.gold, route: '/(main)/secretaria-hub' },
            { icon: 'calendar-outline', label: 'Registar\nPresenças', color: '#8B5CF6', route: '/(main)/presencas' },
            { icon: 'ribbon', label: 'Lançar\nNotas', color: Colors.accent, route: '/(main)/notas' },
            { icon: 'book-outline', label: 'Disciplinas', color: '#EC4899', route: '/(main)/disciplinas' },
            { icon: 'print', label: 'Imprimir\nPauta', color: '#06B6D4', route: '/(main)/grelha' },
          ].map((q, i) => (
            <TouchableOpacity key={i} style={styles.quickAction} onPress={() => nav(q.route)} activeOpacity={0.78}>
              <View style={[styles.quickActionIcon, { backgroundColor: q.color + '22' }]}>
                <Ionicons name={q.icon as any} size={22} color={q.color} />
              </View>
              <Text style={styles.quickActionLabel}>{q.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={{ height: insets.bottom + 32 }} />
      </ScrollView>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  scroll: { flex: 1 },

  // Resumo
  resumoCard: {
    margin: 16, borderRadius: 18, padding: 20,
    shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 12, elevation: 6,
  },
  resumoTitle: { fontSize: 11, fontFamily: 'Inter_600SemiBold', color: Colors.textMuted, letterSpacing: 0.8, textTransform: 'uppercase' },
  resumoAno: { fontSize: 20, fontFamily: 'Inter_700Bold', color: '#fff', marginTop: 2, marginBottom: 16 },
  resumoStats: { flexDirection: 'row', alignItems: 'center' },
  resumoStat: { flex: 1, alignItems: 'center' },
  resumoDivider: { width: 1, height: 36, backgroundColor: 'rgba(255,255,255,0.12)' },
  resumoVal: { fontSize: 22, fontFamily: 'Inter_700Bold' },
  resumoLbl: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 2 },
  resumoSecondRow: {
    flexDirection: 'row', gap: 16, marginTop: 16, paddingTop: 14,
    borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)',
  },
  resumoSmallStat: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  resumoSmallText: { fontSize: 12, fontFamily: 'Inter_500Medium', color: Colors.textSecondary },

  // Trimestre Progress Bar
  trimestreWrap: {
    marginTop: 16, paddingTop: 14,
    borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)',
  },
  trimestreHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  trimestreHeaderText: { fontSize: 11, fontFamily: 'Inter_600SemiBold', color: Colors.gold, letterSpacing: 0.3 },
  trimestreSegmentos: { flexDirection: 'row', alignItems: 'center' },
  trimestreSegmento: { flex: 1 },
  trimestreTrack: {
    height: 8, borderRadius: 4, overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  trimestreFill: { height: '100%', borderRadius: 4 },
  trimestreLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 5 },
  trimestrepointDot: {
    width: 6, height: 6, borderRadius: 3,
    backgroundColor: Colors.gold,
  },
  trimestreLabel: { fontSize: 11, fontFamily: 'Inter_600SemiBold', color: 'rgba(255,255,255,0.5)' },
  trimestreIndicador: {
    fontSize: 11, fontFamily: 'Inter_500Medium',
    color: 'rgba(255,255,255,0.55)', marginTop: 8,
  },

  // Section titles
  sectionTitle: { fontSize: 13, fontFamily: 'Inter_700Bold', color: Colors.text, marginHorizontal: 16, marginTop: 8, marginBottom: 12, letterSpacing: 0.3 },
  sectionTitle2: { fontSize: 13, fontFamily: 'Inter_700Bold', color: Colors.text },

  // Módulos
  modulosGrid: { paddingHorizontal: 16, gap: 12 },
  modulosGridWide: { flexDirection: 'row', flexWrap: 'wrap' },
  moduloCard: {
    backgroundColor: Colors.backgroundCard, borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: Colors.border,
    overflow: 'hidden', position: 'relative',
  },
  moduloCardWide: { width: (width - 44) / 2 },
  moduloTop: { flexDirection: 'row', alignItems: 'center' },
  moduloIconWrap: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  moduloTitle: { fontSize: 14, fontFamily: 'Inter_700Bold', color: Colors.text },
  moduloSubtitle: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 2 },
  moduloStats: { flexDirection: 'row', gap: 16, marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: Colors.border },
  moduloStatItem: { alignItems: 'center' },
  moduloStatVal: { fontSize: 16, fontFamily: 'Inter_700Bold' },
  moduloStatLabel: { fontSize: 10, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 1 },
  moduloBar: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, borderTopLeftRadius: 16, borderBottomLeftRadius: 16 },
  lockedBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: Colors.border, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  lockedText: { fontSize: 9, fontFamily: 'Inter_500Medium', color: Colors.textMuted },
  alertBadge: { width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  alertBadgeText: { fontSize: 9, fontFamily: 'Inter_700Bold', color: '#fff' },

  // Section header (collapsible)
  secHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginHorizontal: 16, marginTop: 20, marginBottom: 10 },
  secHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  countBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8, backgroundColor: Colors.border, borderWidth: 1, borderColor: Colors.border },
  countText: { fontSize: 11, fontFamily: 'Inter_700Bold', color: Colors.textSecondary },

  // Alertas
  alertasWrap: { paddingHorizontal: 16, gap: 10 },
  alertaCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: Colors.backgroundCard, borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: Colors.border, borderLeftWidth: 4,
  },
  alertaIconWrap: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  alertaTitulo: { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: Colors.text },
  alertaDesc: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 2 },
  alertaAcaoBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1 },
  alertaAcaoText: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },

  // Actividades
  actividadesCard: {
    marginHorizontal: 16, backgroundColor: Colors.backgroundCard, borderRadius: 16,
    borderWidth: 1, borderColor: Colors.border, overflow: 'hidden',
  },
  actividadeHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: Colors.info + '12', paddingHorizontal: 14, paddingVertical: 8,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  actividadeHeaderText: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted, flex: 1 },
  actividadeRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 14, paddingVertical: 11,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  actividadeDot: { width: 6, height: 6, borderRadius: 3 },
  actividadeIconWrap: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  actividadeTitulo: { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: Colors.text },
  actividadeDesc: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 1 },
  actividadeData: { fontSize: 10, fontFamily: 'Inter_400Regular', color: Colors.textMuted },
  emptyActividade: { alignItems: 'center', paddingVertical: 32, gap: 8 },
  emptyActividadeText: { fontSize: 13, fontFamily: 'Inter_400Regular', color: Colors.textMuted },
  verHistoricoBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 13, borderTopWidth: 1, borderTopColor: Colors.border,
    backgroundColor: Colors.gold + '08',
  },
  verHistoricoText: { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: Colors.gold },

  // Quick Actions
  quickActions: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 16, gap: 10 },
  quickAction: {
    width: (width - 56) / 3, alignItems: 'center', gap: 8,
    backgroundColor: Colors.backgroundCard, borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: Colors.border,
  },
  quickActionIcon: { width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  quickActionLabel: { fontSize: 11, fontFamily: 'Inter_500Medium', color: Colors.textSecondary, textAlign: 'center' },
});
