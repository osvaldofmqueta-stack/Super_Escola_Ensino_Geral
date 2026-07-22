import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, Modal,
  ScrollView, Alert, Platform, Dimensions
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { Colors } from '@/constants/colors';
import { useData, Presenca } from '@/context/DataContext';
import { useConfig } from '@/context/ConfigContext';
import { useAuth } from '@/context/AuthContext';
import TopBar from '@/components/TopBar';
import PaginationBar from '@/components/PaginationBar';
import ProfessorLoadingSkeleton from '@/components/ProfessorLoadingSkeleton';
import { alertSucesso, alertErro, showToast } from '@/utils/toast';
import ExportMenu from '@/components/ExportMenu';
import { useLookup } from '@/hooks/useLookup';

// ─── Calendário Visual de Presenças ──────────────────────────────────────────
const CELL = 22;
const CELL_GAP = 3;
const NAME_W = 108;
const DOW_PT = ['D','S','T','Q','Q','S','S'];
const MONTH_PT = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

type CellInfo = { status: 'P'|'F'|'J'|null; isConsecutive: boolean; isStart: boolean; isEnd: boolean; };

function CalendarioPresencas({
  turmaAlunos, presencas, filterTurma, disciplina, onSelectDate,
}: {
  turmaAlunos: any[]; presencas: Presenca[]; filterTurma: string;
  disciplina: string; onSelectDate: (d: string) => void;
}) {
  const today = new Date();
  const [calMonth, setCalMonth] = useState({ year: today.getFullYear(), month: today.getMonth() });

  const days = useMemo(() => {
    const { year, month } = calMonth;
    const n = new Date(year, month + 1, 0).getDate();
    return Array.from({ length: n }, (_, i) =>
      `${year}-${String(month + 1).padStart(2,'0')}-${String(i + 1).padStart(2,'0')}`
    );
  }, [calMonth]);

  const statusMap = useMemo(() => {
    const map: Record<string, Record<string,'P'|'F'|'J'>> = {};
    for (const p of presencas) {
      if (p.turmaId !== filterTurma || p.disciplina !== disciplina) continue;
      if (!map[p.alunoId]) map[p.alunoId] = {};
      map[p.alunoId][p.data] = p.status as 'P'|'F'|'J';
    }
    return map;
  }, [presencas, filterTurma, disciplina]);

  function cellInfo(alunoId: string, dateStr: string, idx: number): CellInfo {
    const s = statusMap[alunoId] ?? {};
    const status = s[dateStr] ?? null;
    if (status !== 'F') return { status, isConsecutive: false, isStart: false, isEnd: false };
    const prevF = idx > 0 ? s[days[idx - 1]] === 'F' : false;
    const nextF = idx < days.length - 1 ? s[days[idx + 1]] === 'F' : false;
    const isConsecutive = prevF || nextF;
    return { status: 'F', isConsecutive, isStart: isConsecutive && !prevF, isEnd: isConsecutive && !nextF };
  }

  const isCurrentMonth = calMonth.year === today.getFullYear() && calMonth.month === today.getMonth();
  const todayStr = today.toISOString().split('T')[0];

  function navigateMonth(delta: number) {
    setCalMonth(prev => {
      let m = prev.month + delta, y = prev.year;
      if (m < 0) { m = 11; y--; }
      if (m > 11) { m = 0; y++; }
      if (y > today.getFullYear() || (y === today.getFullYear() && m > today.getMonth())) return prev;
      return { year: y, month: m };
    });
  }

  return (
    <View style={{ flex: 1 }}>
      {/* Month navigator */}
      <View style={calSt.monthNav}>
        <TouchableOpacity style={calSt.navBtn} onPress={() => navigateMonth(-1)}>
          <Ionicons name="chevron-back" size={16} color={Colors.gold} />
        </TouchableOpacity>
        <Text style={calSt.monthLabel}>{MONTH_PT[calMonth.month]} {calMonth.year}</Text>
        <TouchableOpacity style={[calSt.navBtn, isCurrentMonth && { opacity: 0.3 }]} onPress={() => navigateMonth(1)} disabled={isCurrentMonth}>
          <Ionicons name="chevron-forward" size={16} color={Colors.gold} />
        </TouchableOpacity>
      </View>

      {/* Legend */}
      <View style={calSt.legend}>
        {([
          { color: Colors.success, label: 'Presente', filled: true },
          { color: Colors.danger,  label: 'Consecutivas', filled: true },
          { color: Colors.danger,  label: 'Isolada', filled: false },
          { color: Colors.warning, label: 'Justificada', filled: true },
        ] as const).map(({ color, label, filled }) => (
          <View key={label} style={calSt.legendItem}>
            <View style={[calSt.legendDot, { backgroundColor: filled ? color : 'transparent', borderColor: color, borderWidth: filled ? 0 : 2 }]}>
              {!filled && <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color }} />}
            </View>
            <Text style={calSt.legendTxt}>{label}</Text>
          </View>
        ))}
      </View>

      {/* Grid */}
      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={{ paddingHorizontal: 12, paddingBottom: 16 }}>

            {/* Day headers */}
            <View style={calSt.headerRow}>
              <View style={{ width: NAME_W }} />
              {days.map((d, i) => {
                const date = new Date(d + 'T12:00:00');
                const isToday = d === todayStr;
                return (
                  <TouchableOpacity key={d} style={[calSt.dayHeader, isToday && calSt.dayHeaderToday]} onPress={() => onSelectDate(d)}>
                    <Text style={[calSt.dow, isToday && { color: Colors.gold }]}>{DOW_PT[date.getDay()]}</Text>
                    <Text style={[calSt.dayNum, isToday && { color: Colors.gold, fontFamily: 'Inter_700Bold' }]}>{date.getDate()}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Student rows */}
            {turmaAlunos.map((aluno, ai) => (
              <View key={aluno.id} style={[calSt.studentRow, ai % 2 === 0 && calSt.studentRowEven]}>
                <View style={{ width: NAME_W, paddingRight: 6, justifyContent: 'center' }}>
                  <Text style={calSt.studentName} numberOfLines={1}>{aluno.nome} {aluno.apelido.charAt(0)}.</Text>
                </View>
                {days.map((d, idx) => {
                  const { status, isConsecutive, isStart, isEnd } = cellInfo(aluno.id, d, idx);
                  const isToday = d === todayStr;

                  // Cell styling
                  let bg = 'transparent';
                  let borderColor = Colors.border;
                  let borderRadius = 6;
                  let borderTopLeftRadius = 6, borderBottomLeftRadius = 6;
                  let borderTopRightRadius = 6, borderBottomRightRadius = 6;
                  let showDot = false;
                  let showCheck = false;

                  if (status === 'P') {
                    bg = Colors.success + '28'; borderColor = Colors.success + '55'; showCheck = true;
                  } else if (status === 'J') {
                    bg = Colors.warning + '30'; borderColor = Colors.warning + '66';
                  } else if (status === 'F') {
                    if (isConsecutive) {
                      bg = Colors.danger;
                      borderColor = Colors.danger;
                      const rL = isStart ? 6 : 0;
                      const rR = isEnd ? 6 : 0;
                      borderTopLeftRadius = rL; borderBottomLeftRadius = rL;
                      borderTopRightRadius = rR; borderBottomRightRadius = rR;
                      borderRadius = 0;
                    } else {
                      showDot = true;
                      bg = 'transparent'; borderColor = Colors.danger;
                    }
                  }

                  const cellStyle: any = {
                    width: CELL, height: CELL,
                    marginHorizontal: isConsecutive && status === 'F' ? 0 : CELL_GAP / 2,
                    alignItems: 'center', justifyContent: 'center',
                    backgroundColor: bg,
                    borderWidth: 1, borderColor,
                    borderTopLeftRadius, borderBottomLeftRadius,
                    borderTopRightRadius, borderBottomRightRadius,
                  };
                  if (!isConsecutive || status !== 'F') cellStyle.marginHorizontal = CELL_GAP / 2;

                  return (
                    <TouchableOpacity key={d} style={cellStyle} onPress={() => onSelectDate(d)} activeOpacity={0.7}>
                      {showDot && <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: Colors.danger }} />}
                      {showCheck && <Ionicons name="checkmark" size={10} color={Colors.success} />}
                      {status === 'J' && <Text style={{ fontSize: 8, color: Colors.warning, fontFamily: 'Inter_700Bold' }}>J</Text>}
                      {isToday && <View style={calSt.todayRing} />}
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))}

            {turmaAlunos.length === 0 && (
              <View style={{ paddingTop: 40, alignItems: 'center', gap: 8 }}>
                <Ionicons name="calendar-outline" size={32} color={Colors.textMuted} />
                <Text style={{ color: Colors.textMuted, fontSize: 13, fontFamily: 'Inter_400Regular' }}>Seleccione uma turma</Text>
              </View>
            )}
          </View>
        </ScrollView>
      </ScrollView>
    </View>
  );
}

const calSt = StyleSheet.create({
  monthNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 8, backgroundColor: Colors.backgroundCard, borderBottomWidth: 1, borderBottomColor: Colors.border },
  navBtn: { width: 34, height: 34, borderRadius: 10, backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center' },
  monthLabel: { fontSize: 14, fontFamily: 'Inter_700Bold', color: Colors.text },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: Colors.backgroundCard, borderBottomWidth: 1, borderBottomColor: Colors.border },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 12, height: 12, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  legendTxt: { fontSize: 10, fontFamily: 'Inter_400Regular', color: Colors.textSecondary },
  headerRow: { flexDirection: 'row', alignItems: 'flex-end', paddingBottom: 4, marginBottom: 2 },
  dayHeader: { width: CELL + CELL_GAP, alignItems: 'center', paddingBottom: 4 },
  dayHeaderToday: { borderBottomWidth: 2, borderBottomColor: Colors.gold },
  dow: { fontSize: 8, fontFamily: 'Inter_500Medium', color: Colors.textMuted, textTransform: 'uppercase' },
  dayNum: { fontSize: 10, fontFamily: 'Inter_500Medium', color: Colors.textSecondary },
  studentRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 3 },
  studentRowEven: { backgroundColor: Colors.backgroundCard + '60' },
  studentName: { fontSize: 11, fontFamily: 'Inter_600SemiBold', color: Colors.text },
  todayRing: { position: 'absolute', inset: -1, borderRadius: 7, borderWidth: 1.5, borderColor: Colors.gold, pointerEvents: 'none' },
});

const { width } = Dimensions.get('window');

function QRScannerModal({ visible, onClose, onScan }: any) {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const insets = useSafeAreaInsets();
  const bottomPad = Platform.OS === 'web' ? 34 : insets.bottom;

  function handleBarCodeScanned({ data }: { data: string }) {
    if (scanned) return;
    setScanned(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onScan(data);
  }

  if (!permission) {
    return (
      <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
        <View style={scanStyles.overlay}>
          <View style={[scanStyles.container, { paddingBottom: bottomPad + 16 }]}>
            <Text style={scanStyles.loadingText}>A carregar câmara...</Text>
          </View>
        </View>
      </Modal>
    );
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        {!permission.granted ? (
          <View style={[scanStyles.permissionView, { paddingTop: insets.top + 20 }]}>
            <Ionicons name="camera-outline" size={48} color={Colors.textMuted} />
            <Text style={scanStyles.permissionText}>Permissão de câmara necessária para digitalizar QR codes.</Text>
            <TouchableOpacity style={scanStyles.permBtn} onPress={requestPermission}>
              <Text style={scanStyles.permBtnText}>Permitir Câmara</Text>
            </TouchableOpacity>
            <TouchableOpacity style={scanStyles.cancelBtn} onPress={onClose}>
              <Text style={scanStyles.cancelBtnText}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={{ flex: 1 }}>
            <CameraView
              style={{ flex: 1 }}
              facing="back"
              onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
              barcodeScannerSettings={{ barcodeTypes: ['qr', 'code128', 'code39'] }}
            />
            <View style={[scanStyles.overlay2, { paddingBottom: bottomPad + 20, paddingTop: insets.top + 16 }]}>
              <TouchableOpacity style={scanStyles.closeOverlay} onPress={onClose}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
              <View style={scanStyles.frame}>
                <View style={[scanStyles.corner, scanStyles.cornerTL]} />
                <View style={[scanStyles.corner, scanStyles.cornerTR]} />
                <View style={[scanStyles.corner, scanStyles.cornerBL]} />
                <View style={[scanStyles.corner, scanStyles.cornerBR]} />
              </View>
              <Text style={scanStyles.scanHint}>Aponte para o QR Code do aluno</Text>
              {scanned && (
                <TouchableOpacity style={scanStyles.rescanBtn} onPress={() => setScanned(false)}>
                  <Text style={scanStyles.rescanText}>Digitalizar Novamente</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}
      </View>
    </Modal>
  );
}

export default function PresencasScreen() {
  const { alunos, turmas, presencas, addPresenca, updatePresenca, isLoading: dataLoading } = useData();
  const { config } = useConfig();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [filterTurma, setFilterTurma] = useState('');
  const [showTurmaModal, setShowTurmaModal] = useState(false);
  const [showDisciplinaModal, setShowDisciplinaModal] = useState(false);
  const { values: disciplinasFallback } = useLookup('disciplinas_fallback', [
    'Matemática', 'Português', 'Física', 'Química', 'Biologia',
    'História', 'Geografia', 'Inglês', 'Educação Física', 'Filosofia',
  ]);
  const [disciplinasDisponiveis, setDisciplinasDisponiveis] = useState<string[]>([
    'Matemática', 'Português', 'Física', 'Química', 'Biologia',
    'História', 'Geografia', 'Inglês', 'Educação Física', 'Filosofia',
  ]);
  const [disciplina, setDisciplina] = useState('Matemática');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const today = new Date().toISOString().split('T')[0];

  function navigateDate(delta: number) {
    setDate(prev => {
      const d = new Date(prev + 'T12:00:00');
      d.setDate(d.getDate() + delta);
      const next = d.toISOString().split('T')[0];
      if (next > today) return today;
      const minDate = new Date(today + 'T12:00:00');
      minDate.setDate(minDate.getDate() - 14);
      if (next < minDate.toISOString().split('T')[0]) return prev;
      return next;
    });
  }

  function formatDateDisplay(iso: string) {
    const [y, m, day] = iso.split('-');
    const months = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
    return `${day} ${months[parseInt(m, 10) - 1]} ${y}`;
  }

  useEffect(() => {
    if (!filterTurma && turmas.length > 0) {
      setFilterTurma(turmas[0].id);
    }
  }, [turmas]);

  useEffect(() => {
    if (!filterTurma) {
      setDisciplinasDisponiveis(disciplinasFallback);
      return;
    }
    fetch(`/api/turmas/${filterTurma}/disciplinas`)
      .then(r => r.json())
      .then((list: { nome: string }[]) => {
        if (list && list.length > 0) {
          const nomes = list.map((d: { nome: string }) => d.nome);
          setDisciplinasDisponiveis(nomes);
          setDisciplina(prev => nomes.includes(prev) ? prev : nomes[0]);
        } else {
          setDisciplinasDisponiveis(disciplinasFallback);
        }
      })
      .catch(() => setDisciplinasDisponiveis(disciplinasFallback));
  }, [filterTurma, disciplinasFallback]);

  const [showScanner, setShowScanner] = useState(false);
  const [pendingAluno, setPendingAluno] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'lista' | 'calendario'>('lista');
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 20;
  const bottomPad = Platform.OS === 'web' ? 34 : insets.bottom;

  const turmaAtual = useMemo(() => turmas.find(t => t.id === filterTurma), [turmas, filterTurma]);
  const faltasBloqueadas = !!(turmaAtual?.faltasBloqueadas);

  const minDate = useMemo(() => {
    const d = new Date(today + 'T12:00:00');
    d.setDate(d.getDate() - 14);
    return d.toISOString().split('T')[0];
  }, [today]);

  const turmaAlunos = useMemo(() => {
    return alunos.filter(a => a.turmaId === filterTurma && a.ativo);
  }, [alunos, filterTurma]);

  const totalPages = Math.max(1, Math.ceil(turmaAlunos.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const pagedAlunos = useMemo(
    () => turmaAlunos.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [turmaAlunos, safePage]
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [filterTurma, disciplina, date]);

  const todayPresencas = useMemo(() => {
    return presencas.filter(p => p.data === date && p.turmaId === filterTurma && p.disciplina === disciplina);
  }, [presencas, date, filterTurma, disciplina]);

  // Art. 23º §7 — faltas injustificadas do trimestre actual por aluno (nesta disciplina/turma)
  const currentTrimestre = useMemo(() => {
    const m = new Date(date + 'T12:00:00').getMonth() + 1;
    if (m >= 2 && m <= 4) return 1;
    if (m >= 5 && m <= 8) return 2;
    if (m >= 9 && m <= 11) return 3;
    return 1;
  }, [date]);

  const mesesTrimestre = useMemo<number[]>(() => {
    const map: Record<number, number[]> = { 1: [2,3,4], 2: [5,6,7,8], 3: [9,10,11] };
    return map[currentTrimestre] ?? [2,3,4];
  }, [currentTrimestre]);

  const faltasTrimestre = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const p of presencas) {
      if (p.turmaId !== filterTurma || p.disciplina !== disciplina || p.status !== 'F') continue;
      const m = new Date(p.data + 'T12:00:00').getMonth() + 1;
      if (!mesesTrimestre.includes(m)) continue;
      counts[p.alunoId] = (counts[p.alunoId] ?? 0) + 1;
    }
    return counts;
  }, [presencas, filterTurma, disciplina, mesesTrimestre]);

  function getAlunoStatus(alunoId: string): 'P' | 'F' | 'J' | null {
    const p = todayPresencas.find(p => p.alunoId === alunoId);
    return p ? p.status : null;
  }

  // Limite mínimo Art. 23º §7 (1 tempo/sem → 3F; real depende da carga horária; alerta conservador)
  const LIMITE_ART23_MIN = 3;

  async function markPresenca(alunoId: string, status: 'P' | 'F' | 'J') {
    if (faltasBloqueadas) return;
    const existing = todayPresencas.find(p => p.alunoId === alunoId);

    // Aviso Art. 23º §7 — ao mudar para F (novo registo OU correcção P/J→F)
    if (status === 'F' && existing?.status !== 'F') {
      const faltasActuais = faltasTrimestre[alunoId] ?? 0;
      // +1 porque esta falta de hoje ainda não está contada no trimestre
      const novaContagem = faltasActuais + 1;
      if (novaContagem >= LIMITE_ART23_MIN) {
        const aluno = turmaAlunos.find(a => a.id === alunoId);
        const nomeAluno = aluno ? `${aluno.nome} ${aluno.apelido}` : 'Este aluno';
        showToast(
          `⚠️ ${nomeAluno} atinge ${novaContagem}F/trim. (Art.23§7 — lim. 3–5F)`,
          'error'
        );
      }
    }

    if (existing) {
      if (existing.status === status) return; // já tem esse estado, nada a fazer
      await updatePresenca(existing.id, { status });
    } else {
      await addPresenca({ alunoId, turmaId: filterTurma, disciplina, data: date, status });
    }
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }

  async function markAll(status: 'P' | 'F') {
    if (faltasBloqueadas) return;
    let alunosEmRisco: string[] = [];
    for (const aluno of turmaAlunos) {
      const existing = todayPresencas.find(p => p.alunoId === aluno.id);
      if (!existing) {
        await addPresenca({ alunoId: aluno.id, turmaId: filterTurma, disciplina, data: date, status });
        if (status === 'F' && (faltasTrimestre[aluno.id] ?? 0) + 1 >= LIMITE_ART23_MIN) {
          alunosEmRisco.push(`${aluno.nome} ${aluno.apelido}`);
        }
      } else if (existing.status !== status) {
        // Actualizar registos existentes (ex: corrigir P→F ou F→P)
        await updatePresenca(existing.id, { status });
        if (status === 'F' && existing.status !== 'F' && (faltasTrimestre[aluno.id] ?? 0) + 1 >= LIMITE_ART23_MIN) {
          alunosEmRisco.push(`${aluno.nome} ${aluno.apelido}`);
        }
      }
    }
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    alertSucesso(
      status === 'P' ? 'Presenças registadas' : 'Faltas registadas',
      `Todos os alunos foram marcados como ${status === 'P' ? 'Presentes' : 'Faltosos'}.`
    );
    if (status === 'F' && alunosEmRisco.length > 0) {
      setTimeout(() => {
        Alert.alert(
          '⚠️ Alunos em risco — Art. 23º §7',
          `Os seguintes alunos atingem o limite mínimo de faltas injustificadas neste trimestre (Decreto 04/2026):\n\n${alunosEmRisco.slice(0, 5).join('\n')}${alunosEmRisco.length > 5 ? `\n...e mais ${alunosEmRisco.length - 5}` : ''}`,
          [{ text: 'OK' }]
        );
      }, 400);
    }
  }

  function handleQRScan(data: string) {
    setShowScanner(false);
    const parts = data.split('|');
    const isValido = (parts[0] === 'SIGA' || parts[0] === 'SGAA') && parts[1] === 'ALUNO';
    if (isValido) {
      const alunoId = parts[2];
      const aluno = alunos.find(a => a.id === alunoId);
      if (aluno) {
        markPresenca(alunoId, 'P');
        showToast(`${aluno.nome} ${aluno.apelido} marcado como Presente.`, 'success');
      } else {
        showToast('QR Code não reconhecido. Aluno não encontrado.', 'error');
      }
    } else {
      showToast('QR Code inválido. Não pertence ao SIGA.', 'error');
    }
  }

  const stats = useMemo(() => {
    const present = todayPresencas.filter(p => p.status === 'P').length;
    const absent = todayPresencas.filter(p => p.status === 'F').length;
    const justified = todayPresencas.filter(p => p.status === 'J').length;
    return { present, absent, justified, total: turmaAlunos.length };
  }, [todayPresencas, turmaAlunos]);

  const statusColors = { P: Colors.success, F: Colors.danger, J: Colors.warning };
  const statusLabels = { P: 'P', F: 'F', J: 'J' };

  const renderAluno = ({ item }: { item: typeof alunos[0] }) => {
    const status = getAlunoStatus(item.id);
    const isMarcado = !!status;
    return (
      <View style={[styles.row, isMarcado && styles.rowMarcado]}>
        <View style={[styles.initials, { backgroundColor: status ? `${statusColors[status]}20` : Colors.surface }]}>
          <Text style={[styles.initialsText, { color: status ? statusColors[status] : Colors.textMuted }]}>
            {item.nome.charAt(0)}{item.apelido.charAt(0)}
          </Text>
        </View>
        <View style={styles.rowInfo}>
          <Text style={styles.rowNome}>{item.nome} {item.apelido}</Text>
          <Text style={styles.rowMeta}>
            {item.numeroMatricula}
            {isMarcado && !faltasBloqueadas && (
              <Text style={styles.corrigirHint}>  · toque para corrigir</Text>
            )}
            {(faltasTrimestre[item.id] ?? 0) > 0 && (
              <Text style={{
                color: (faltasTrimestre[item.id] ?? 0) >= 4 ? Colors.danger
                  : (faltasTrimestre[item.id] ?? 0) >= 2 ? Colors.warning
                  : Colors.textMuted,
                fontFamily: 'Inter_600SemiBold',
              }}>
                {`  · ${faltasTrimestre[item.id]}F`}
              </Text>
            )}
          </Text>
        </View>
        <View style={styles.statusBtns}>
          {(['P', 'F', 'J'] as const).map(s => (
            <TouchableOpacity
              key={s}
              style={[
                styles.statusBtn,
                status === s && { backgroundColor: statusColors[s], borderColor: statusColors[s] },
                isMarcado && status !== s && !faltasBloqueadas && styles.statusBtnCorrect,
              ]}
              onPress={() => markPresenca(item.id, s)}
              disabled={faltasBloqueadas}
            >
              <Text style={[
                styles.statusBtnText,
                status === s && { color: Colors.text },
                isMarcado && status !== s && !faltasBloqueadas && { color: Colors.textSecondary },
              ]}>{s}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    );
  };

  const turmaAtualNome = turmaAtual?.nome ?? 'Seleccionar Turma';

  if (dataLoading) {
    return (
      <View style={styles.screen}>
        <TopBar title="Presenças" subtitle="A sincronizar dados..." />
        <ProfessorLoadingSkeleton />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <TopBar title="Presenças" subtitle={formatDateDisplay(date)} rightAction={{ icon: 'qr-code-outline', onPress: () => setShowScanner(true) }} />

      {/* Date navigator */}
      <View style={styles.dateNav}>
        <TouchableOpacity
          style={[styles.dateNavBtn, date <= minDate && { opacity: 0.3 }]}
          onPress={() => navigateDate(-1)}
          disabled={date <= minDate}
        >
          <Ionicons name="chevron-back" size={18} color={Colors.gold} />
        </TouchableOpacity>
        <View style={styles.dateNavCenter}>
          {date === today ? (
            <View style={styles.dateNavTodayBadge}>
              <Text style={styles.dateNavTodayText}>Hoje</Text>
            </View>
          ) : (
            <TouchableOpacity onPress={() => setDate(today)}>
              <Text style={styles.dateNavGoToday}>Ir para hoje</Text>
            </TouchableOpacity>
          )}
          <Text style={styles.dateNavLabel}>{formatDateDisplay(date)}</Text>
        </View>
        <TouchableOpacity
          style={[styles.dateNavBtn, date >= today && { opacity: 0.3 }]}
          onPress={() => navigateDate(1)}
          disabled={date >= today}
        >
          <Ionicons name="chevron-forward" size={18} color={Colors.gold} />
        </TouchableOpacity>
      </View>

      <View style={styles.selectorsRow}>
        <TouchableOpacity style={styles.selectorBtn} onPress={() => setShowTurmaModal(true)}>
          <Ionicons name="people-outline" size={15} color={Colors.gold} />
          <Text style={styles.selectorLabel} numberOfLines={1}>{turmaAtualNome}</Text>
          <Ionicons name="chevron-down" size={14} color={Colors.textMuted} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.selectorBtn} onPress={() => setShowDisciplinaModal(true)}>
          <Ionicons name="book-outline" size={15} color={Colors.accent} />
          <Text style={styles.selectorLabel} numberOfLines={1}>{disciplina}</Text>
          <Ionicons name="chevron-down" size={14} color={Colors.textMuted} />
        </TouchableOpacity>
        {/* Vista toggle */}
        <View style={styles.viewToggle}>
          <TouchableOpacity
            style={[styles.viewToggleBtn, viewMode === 'lista' && styles.viewToggleBtnActive]}
            onPress={() => setViewMode('lista')}
          >
            <Ionicons name="list-outline" size={15} color={viewMode === 'lista' ? Colors.gold : Colors.textMuted} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.viewToggleBtn, viewMode === 'calendario' && styles.viewToggleBtnActive]}
            onPress={() => setViewMode('calendario')}
          >
            <Ionicons name="calendar-outline" size={15} color={viewMode === 'calendario' ? Colors.gold : Colors.textMuted} />
          </TouchableOpacity>
        </View>
      </View>

      <Modal visible={showTurmaModal} transparent animationType="fade" onRequestClose={() => setShowTurmaModal(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowTurmaModal(false)}>
          <View style={styles.pickerSheet}>
            <Text style={styles.pickerTitle}>Seleccionar Turma</Text>
            <ScrollView showsVerticalScrollIndicator={false}>
              {turmas.map(t => (
                <TouchableOpacity key={t.id} style={[styles.pickerItem, filterTurma === t.id && styles.pickerItemActive]}
                  onPress={() => { setFilterTurma(t.id); setShowTurmaModal(false); }}>
                  <Text style={[styles.pickerItemText, filterTurma === t.id && styles.pickerItemTextActive]}>{t.nome}</Text>
                  {filterTurma === t.id && <Ionicons name="checkmark" size={16} color={Colors.gold} />}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

      <Modal visible={showDisciplinaModal} transparent animationType="fade" onRequestClose={() => setShowDisciplinaModal(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowDisciplinaModal(false)}>
          <View style={styles.pickerSheet}>
            <Text style={styles.pickerTitle}>Seleccionar Disciplina</Text>
            <ScrollView showsVerticalScrollIndicator={false}>
              {disciplinasDisponiveis.map(d => (
                <TouchableOpacity key={d} style={[styles.pickerItem, disciplina === d && styles.pickerItemActive]}
                  onPress={() => { setDisciplina(d); setShowDisciplinaModal(false); }}>
                  <Text style={[styles.pickerItemText, disciplina === d && styles.pickerItemTextActive]}>{d}</Text>
                  {disciplina === d && <Ionicons name="checkmark" size={16} color={Colors.accent} />}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

      {faltasBloqueadas && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, margin: 12, padding: 12, backgroundColor: Colors.danger + '18', borderRadius: 10, borderWidth: 1, borderColor: Colors.danger + '44' }}>
          <Ionicons name="lock-closed" size={18} color={Colors.danger} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: Colors.danger, fontWeight: '700', fontSize: 13 }}>Lançamento de Faltas Bloqueado</Text>
            <Text style={{ color: Colors.danger, fontSize: 12, marginTop: 2 }}>O Director de Turma bloqueou o registo de presenças para esta turma. Contacte o Director de Turma para desbloquear.</Text>
          </View>
        </View>
      )}

      {viewMode === 'lista' ? (
        <>
          <View style={styles.statsBar}>
            {[
              { label: 'Presentes', value: stats.present, color: Colors.success },
              { label: 'Faltas', value: stats.absent, color: Colors.danger },
              { label: 'Justific.', value: stats.justified, color: Colors.warning },
              { label: 'Total', value: stats.total, color: Colors.textSecondary },
            ].map(s => (
              <View key={s.label} style={styles.statItem}>
                <Text style={[styles.statValue, { color: s.color }]}>{s.value}</Text>
                <Text style={styles.statLabel}>{s.label}</Text>
              </View>
            ))}
          </View>

          <View style={styles.bulkActions}>
            <TouchableOpacity style={[styles.bulkBtn, { borderColor: `${Colors.success}40`, opacity: faltasBloqueadas ? 0.4 : 1 }]} onPress={() => markAll('P')} disabled={faltasBloqueadas}>
              <Ionicons name="checkmark-done" size={14} color={Colors.success} />
              <Text style={[styles.bulkBtnText, { color: Colors.success }]}>Todos Presentes</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.bulkBtn, { borderColor: `${Colors.danger}40`, opacity: faltasBloqueadas ? 0.4 : 1 }]} onPress={() => markAll('F')} disabled={faltasBloqueadas}>
              <Ionicons name="close" size={14} color={Colors.danger} />
              <Text style={[styles.bulkBtnText, { color: Colors.danger }]}>Todos Faltaram</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.bulkBtn, { borderColor: `${Colors.gold}40` }]} onPress={() => setShowScanner(true)}>
              <Ionicons name="qr-code" size={14} color={Colors.gold} />
              <Text style={[styles.bulkBtnText, { color: Colors.gold }]}>QR Code</Text>
            </TouchableOpacity>
            <ExportMenu
              title={`Presenças — ${turmas.find(t => t.id === filterTurma)?.nome ?? ''} — ${date}`}
              columns={[
                { header: 'Nº Matrícula', key: 'matricula', width: 14 },
                { header: 'Nome Completo', key: 'nome', width: 26 },
                { header: 'Turma', key: 'turma', width: 12 },
                { header: 'Disciplina', key: 'disciplina', width: 16 },
                { header: 'Data', key: 'data', width: 12 },
                { header: 'Estado', key: 'estado', width: 12 },
              ]}
              rows={turmaAlunos.map(a => {
                const p = todayPresencas.find(pr => pr.alunoId === a.id);
                return {
                  matricula: a.numeroMatricula,
                  nome: `${a.nome} ${a.apelido}`,
                  turma: turmas.find(t => t.id === filterTurma)?.nome ?? '',
                  disciplina,
                  data: date,
                  estado: p ? (p.status === 'P' ? 'Presente' : p.status === 'F' ? 'Falta' : 'Justificado') : 'Não marcado',
                };
              })}
              school={{ nomeEscola: config?.nomeEscola ?? 'Super Escola' }}
              filename={`presencas_${filterTurma}_${date}`}
              subtitle={`Disciplina: ${disciplina}`}
            />
          </View>

          <FlatList
            data={pagedAlunos}
            keyExtractor={i => i.id}
            renderItem={renderAluno}
            contentContainerStyle={[styles.list, { paddingBottom: 20 }]}
            showsVerticalScrollIndicator={false}
            ItemSeparatorComponent={() => <View style={{ height: 6 }} />}
            ListEmptyComponent={<View style={styles.empty}><Ionicons name="people-outline" size={36} color={Colors.textMuted} /><Text style={styles.emptyText}>Seleccione uma turma</Text></View>}
          />

          <PaginationBar currentPage={safePage} totalPages={totalPages} onPageChange={setCurrentPage} bottomPad={bottomPad} />
        </>
      ) : (
        <CalendarioPresencas
          turmaAlunos={turmaAlunos}
          presencas={presencas}
          filterTurma={filterTurma}
          disciplina={disciplina}
          onSelectDate={(d) => { setDate(d); setViewMode('lista'); }}
        />
      )}

      <QRScannerModal visible={showScanner} onClose={() => setShowScanner(false)} onScan={handleQRScan} />
    </View>
  );
}

const scanStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center' },
  container: { backgroundColor: Colors.backgroundCard, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, alignItems: 'center', gap: 16, width: '100%', maxWidth: 480 },
  loadingText: { fontSize: 14, fontFamily: 'Inter_400Regular', color: Colors.textSecondary },
  permissionView: { flex: 1, backgroundColor: Colors.background, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16 },
  permissionText: { fontSize: 14, fontFamily: 'Inter_400Regular', color: Colors.textSecondary, textAlign: 'center' },
  permBtn: { backgroundColor: Colors.accent, paddingHorizontal: 28, paddingVertical: 14, borderRadius: 14 },
  permBtnText: { fontSize: 15, fontFamily: 'Inter_600SemiBold', color: Colors.text },
  cancelBtn: { paddingVertical: 10 },
  cancelBtnText: { fontSize: 14, fontFamily: 'Inter_500Medium', color: Colors.textSecondary },
  overlay2: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  closeOverlay: { position: 'absolute', top: 0, right: 16, width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  frame: { width: 220, height: 220, position: 'relative' },
  corner: { position: 'absolute', width: 30, height: 30, borderColor: Colors.gold },
  cornerTL: { top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3 },
  cornerTR: { top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3 },
  cornerBL: { bottom: 0, left: 0, borderBottomWidth: 3, borderLeftWidth: 3 },
  cornerBR: { bottom: 0, right: 0, borderBottomWidth: 3, borderRightWidth: 3 },
  scanHint: { color: Colors.text, fontSize: 14, fontFamily: 'Inter_500Medium', marginTop: 20, textAlign: 'center' },
  rescanBtn: { marginTop: 16, backgroundColor: Colors.accent, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 },
  rescanText: { fontSize: 14, fontFamily: 'Inter_600SemiBold', color: Colors.text },
});

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  dateNav: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.backgroundCard, borderBottomWidth: 1, borderBottomColor: Colors.border, paddingVertical: 8, paddingHorizontal: 4 },
  dateNavBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
  dateNavCenter: { flex: 1, alignItems: 'center', gap: 2 },
  dateNavLabel: { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: Colors.text },
  dateNavTodayBadge: { backgroundColor: Colors.gold + '22', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 2 },
  dateNavTodayText: { fontSize: 10, fontFamily: 'Inter_700Bold', color: Colors.gold },
  dateNavGoToday: { fontSize: 10, fontFamily: 'Inter_500Medium', color: Colors.accent, textDecorationLine: 'underline' },
  selectorsRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 10, alignItems: 'center' },
  selectorBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.backgroundCard, borderWidth: 1, borderColor: Colors.border, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
  selectorLabel: { flex: 1, fontSize: 13, fontFamily: 'Inter_600SemiBold', color: Colors.text },
  viewToggle: { flexDirection: 'row', backgroundColor: Colors.surface, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden' },
  viewToggleBtn: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  viewToggleBtnActive: { backgroundColor: Colors.gold + '22' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  pickerSheet: { backgroundColor: Colors.backgroundCard, borderRadius: 18, borderWidth: 1, borderColor: Colors.border, width: '100%', maxWidth: 380, maxHeight: 420, padding: 8, paddingTop: 4 },
  pickerTitle: { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: Colors.textMuted, paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.border, marginBottom: 4 },
  pickerItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 12, borderRadius: 10 },
  pickerItemActive: { backgroundColor: `${Colors.gold}15` },
  pickerItemText: { fontSize: 14, fontFamily: 'Inter_500Medium', color: Colors.textSecondary },
  pickerItemTextActive: { color: Colors.text, fontFamily: 'Inter_600SemiBold' },
  statsBar: { flexDirection: 'row', backgroundColor: Colors.backgroundCard, marginHorizontal: 16, marginVertical: 8, borderRadius: 14, borderWidth: 1, borderColor: Colors.border, paddingVertical: 12 },
  statItem: { flex: 1, alignItems: 'center', gap: 2 },
  statValue: { fontSize: 20, fontFamily: 'Inter_700Bold' },
  statLabel: { fontSize: 10, fontFamily: 'Inter_400Regular', color: Colors.textMuted },
  bulkActions: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, marginBottom: 8 },
  bulkBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 8, borderRadius: 10, borderWidth: 1, backgroundColor: Colors.backgroundCard },
  bulkBtnText: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  list: { padding: 16 },
  row: { backgroundColor: Colors.backgroundCard, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowMarcado: { borderColor: Colors.border },
  initials: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  initialsText: { fontSize: 14, fontFamily: 'Inter_700Bold' },
  rowInfo: { flex: 1, gap: 2 },
  rowNome: { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: Colors.text },
  rowMeta: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted },
  corrigirHint: { fontSize: 10, fontFamily: 'Inter_400Regular', color: Colors.accent, fontStyle: 'italic' },
  statusBtns: { flexDirection: 'row', gap: 5 },
  statusBtn: { width: 30, height: 30, borderRadius: 8, backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.border },
  statusBtnCorrect: { borderColor: Colors.border, backgroundColor: Colors.surface, opacity: 0.55 },
  statusBtnText: { fontSize: 11, fontFamily: 'Inter_700Bold', color: Colors.textMuted },
  empty: { alignItems: 'center', gap: 10, paddingTop: 60 },
  emptyText: { fontSize: 14, fontFamily: 'Inter_400Regular', color: Colors.textMuted },
});
