import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import {Animated, FlatList, KeyboardAvoidingView, Modal, PanResponder, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View} from 'react-native';
import AppLoader from '@/components/AppLoader';
import { SkeletonList } from '@/components/Skeleton';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Colors } from '@/constants/colors';
import { useData, Aluno } from '@/context/DataContext';
import { useUsers } from '@/context/UsersContext';
import { alertSucesso, alertErro } from '@/utils/toast';
import { useConfig } from '@/context/ConfigContext';
import TopBar from '@/components/TopBar';
import QRCodeModal from '@/components/QRCodeModal';
import DatePickerField from '@/components/DatePickerField';
import ProvinciaMunicipioSelector from '@/components/ProvinciaMunicipioSelector';
import ExportMenu from '@/components/ExportMenu';
import { StableSearchInput } from '@/components/StableSearchInput';
import { webAlert } from '@/utils/webAlert';
import { useEnterToSave } from '@/hooks/useEnterToSave';
import { api } from '@/lib/api';
import { getAuthToken, useAuth } from '@/context/AuthContext';
import PaginationBar from '@/components/PaginationBar';

// ─── Paginação ───────────────────────────────────────────────────────────────
const PAGE_SIZE = 10;

interface Anotacao {
  id: string;
  alunoId: string;
  texto: string;
  criadoPor: string;
  criadoEm: string;
  atualizadoEm: string;
}

function normalizeEmail(str: string) {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .trim()
    .split(/\s+/)
    .join('.');
}

function gerarSenha() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = 'Enc@';
  for (let i = 0; i < 5; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

function getClasseFromTurma(turmaId: string, turmas: any[]) {
  return turmas.find(t => t.id === turmaId)?.nome ?? '—';
}

function getTurmaInfo(turmaId: string, turmas: any[]) {
  const turma = turmas.find(t => t.id === turmaId);
  if (!turma) return { nome: 'Sem turma', detalhe: 'Ainda não atribuída' };
  return {
    nome: turma.nome ?? '—',
    detalhe: [turma.classe, turma.turno, turma.anoLetivo].filter(Boolean).join(' · '),
  };
}

function calcIdade(dataNascimento: string) {
  const diff = Date.now() - new Date(dataNascimento).getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24 * 365));
}

function AlunoFormModal({ visible, onClose, onSave, aluno, turmas }: any) {
  const [form, setForm] = useState<Partial<Aluno>>(aluno || {
    nome: '', apelido: '', dataNascimento: '2008-01-01', genero: 'M',
    provincia: 'Luanda', municipio: '', turmaId: turmas[0]?.id || '',
    nomeEncarregado: '', telefoneEncarregado: '', emailEncarregado: '', ativo: true,
    bloqueado: false, permitirAcessoComPendencia: false, publicarNotas: false,
    falecido: false, dataFalecimento: '', observacoesFalecimento: '',
    situacao: 'activo', dataSituacao: '', motivoSituacao: '',
  });

  const set = (k: keyof Aluno, v: any) => setForm(f => ({ ...f, [k]: v }));

  function handleSave() {
    if (!form.nome || !form.apelido || !form.turmaId) {
      webAlert('Campos obrigatórios', 'Preencha nome, apelido e turma.');
      return;
    }
    if (!form.dataNascimento || !/^\d{4}-\d{2}-\d{2}$/.test(form.dataNascimento)) {
      webAlert('Data de nascimento obrigatória', 'Seleccione a data de nascimento do aluno (DD-MM-AAAA).');
      return;
    }
    // Manter coerência: alunos D-AM-T-E ficam inactivos automaticamente.
    const sit = (form.situacao || 'activo').toLowerCase();
    const inactiveSits = ['desistente', 'anulacao_matricula', 'transferido', 'excluido'];
    const payload: Partial<Aluno> = { ...form };
    if (inactiveSits.includes(sit)) {
      payload.ativo = false;
    } else if (sit === 'activo' && form.ativo === false && (!aluno || (aluno as any).situacao !== 'activo')) {
      // Voltou a "activo": reactivar o aluno
      payload.ativo = true;
    }
    onSave(payload);
  }

  const insets = useSafeAreaInsets();
  const bottomPad = Platform.OS === 'web' ? 34 : insets.bottom;

  useEnterToSave(handleSave, visible);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
      <View style={modalStyles.overlay}>
        <View style={[modalStyles.container, { paddingBottom: bottomPad + 16 }]}>
          <View style={modalStyles.header}>
            <Text style={modalStyles.title}>{aluno ? 'Editar Aluno' : 'Nova Matrícula'}</Text>
            <TouchableOpacity onPress={onClose}><Ionicons name="close" size={22} color={Colors.textSecondary} /></TouchableOpacity>
          </View>
          <ScrollView showsVerticalScrollIndicator={false}>

            <Text style={modalStyles.sectionLabel}>IDENTIFICAÇÃO DO ALUNO</Text>
            <View style={modalStyles.field}>
              <Text style={modalStyles.fieldLabel}>Nº de Matrícula</Text>
              <TextInput
                style={modalStyles.input}
                value={form.numeroMatricula ?? ''}
                onChangeText={v => set('numeroMatricula', v)}
                placeholder={aluno ? 'Número de matrícula' : 'Gerado automaticamente se ficar vazio'}
                placeholderTextColor={Colors.textMuted}
                returnKeyType="next"
                blurOnSubmit={false}
              />
            </View>
            {[
              { label: 'Nome', key: 'nome', placeholder: 'Nome' },
              { label: 'Apelido', key: 'apelido', placeholder: 'Apelido' },
            ].map(f => (
              <View key={f.key} style={modalStyles.field}>
                <Text style={modalStyles.fieldLabel}>{f.label}</Text>
                <TextInput
                  style={modalStyles.input}
                  value={(form as any)[f.key] ?? ''}
                  onChangeText={v => set(f.key as keyof Aluno, v)}
                  placeholder={f.placeholder}
                  placeholderTextColor={Colors.textMuted}
                  returnKeyType="done"
                  onSubmitEditing={handleSave}
                />
              </View>
            ))}

            <DatePickerField
              label="Data de Nascimento"
              value={form.dataNascimento ?? ''}
              onChange={v => set('dataNascimento', v)}
              required
              style={modalStyles.field}
              labelStyle={modalStyles.fieldLabel}
            />

            <ProvinciaMunicipioSelector
              provinciaValue={form.provincia ?? ''}
              municipioValue={form.municipio ?? ''}
              onProvinciaChange={v => { set('provincia', v); set('municipio', ''); }}
              onMunicipioChange={v => set('municipio', v)}
              labelStyle={modalStyles.fieldLabel}
              fieldStyle={modalStyles.field}
            />

            <View style={modalStyles.field}>
              <Text style={modalStyles.fieldLabel}>Género</Text>
              <View style={modalStyles.toggleRow}>
                {(['M', 'F'] as const).map(g => (
                  <TouchableOpacity key={g} style={[modalStyles.toggleBtn, form.genero === g && modalStyles.toggleActive]} onPress={() => set('genero', g)}>
                    <Text style={[modalStyles.toggleText, form.genero === g && modalStyles.toggleTextActive]}>{g === 'M' ? 'Masculino' : 'Feminino'}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <Text style={[modalStyles.sectionLabel, { marginTop: 12 }]}>DADOS ACADÉMICOS</Text>

            <View style={modalStyles.field}>
              <Text style={modalStyles.fieldLabel}>Turma</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={modalStyles.toggleRow}>
                  {turmas.map((t: any) => (
                    <TouchableOpacity key={t.id} style={[modalStyles.toggleBtn, form.turmaId === t.id && modalStyles.toggleActive]} onPress={() => set('turmaId', t.id)}>
                      <Text style={[modalStyles.toggleText, form.turmaId === t.id && modalStyles.toggleTextActive]}>{t.nome}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
            </View>

            <View style={modalStyles.field}>
              <Text style={modalStyles.fieldLabel}>ID do Curso / Área <Text style={modalStyles.optionalText}>(opcional)</Text></Text>
              <TextInput
                style={modalStyles.input}
                value={form.cursoId ?? ''}
                onChangeText={v => set('cursoId', v)}
                placeholder="Curso ligado ao aluno, quando aplicável"
                placeholderTextColor={Colors.textMuted}
                returnKeyType="next"
                blurOnSubmit={false}
              />
            </View>

            <Text style={[modalStyles.sectionLabel, { marginTop: 12 }]}>ENCARREGADO DE EDUCAÇÃO</Text>

            {[
              { label: 'Nome Completo', key: 'nomeEncarregado', placeholder: 'Ex: José Manuel Paulo' },
              { label: 'Telefone', key: 'telefoneEncarregado', placeholder: '9XX XXX XXX' },
              { label: 'Email (para acesso ao portal)', key: 'emailEncarregado', placeholder: 'Ex: jose.paulo@gmail.com (opcional)' },
              { label: 'NIF do Encarregado', key: 'encarregadoNif', placeholder: 'Ex: 500123456 (9 dígitos)' },
              { label: 'BI do Encarregado', key: 'encarregadoBi', placeholder: 'Ex: 007123456LA042' },
            ].map(f => (
              <View key={f.key} style={modalStyles.field}>
                <Text style={modalStyles.fieldLabel}>{f.label}</Text>
                <TextInput
                  style={modalStyles.input}
                  value={(form as any)[f.key] ?? ''}
                  onChangeText={v => set(f.key as keyof Aluno, v)}
                  placeholder={f.placeholder}
                  placeholderTextColor={Colors.textMuted}
                  keyboardType={f.key === 'emailEncarregado' ? 'email-address' : f.key === 'encarregadoNif' ? 'numeric' : 'default'}
                  autoCapitalize={f.key === 'emailEncarregado' || f.key === 'encarregadoNif' ? 'none' : 'words'}
                  returnKeyType="done"
                  onSubmitEditing={handleSave}
                />
              </View>
            ))}

            <Text style={[modalStyles.sectionLabel, { marginTop: 12 }]}>ESTADO E ACESSO</Text>

            <View style={modalStyles.switchBlock}>
              {[
                { key: 'ativo', label: 'Aluno activo', desc: 'Mantém o aluno visível e operacional no sistema.' },
                { key: 'bloqueado', label: 'Bloqueado', desc: 'Bloqueia o acesso/regularidade por pendência administrativa.' },
                { key: 'permitirAcessoComPendencia', label: 'Permitir acesso com pendência', desc: 'Autoriza o aluno a aceder mesmo com pendências.' },
                { key: 'publicarNotas', label: 'Publicar notas', desc: 'Permite disponibilizar as notas deste aluno.' },
              ].map(item => (
                <View key={item.key} style={modalStyles.switchRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={modalStyles.switchLabel}>{item.label}</Text>
                    <Text style={modalStyles.switchDesc}>{item.desc}</Text>
                  </View>
                  <TouchableOpacity
                    style={[modalStyles.smallToggle, (form as any)[item.key] && modalStyles.smallToggleOn]}
                    onPress={() => set(item.key as keyof Aluno, !(form as any)[item.key])}
                  >
                    <Text style={[modalStyles.smallToggleText, (form as any)[item.key] && modalStyles.smallToggleTextOn]}>
                      {(form as any)[item.key] ? 'Sim' : 'Não'}
                    </Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>

            <Text style={[modalStyles.sectionLabel, { marginTop: 12 }]}>SITUAÇÃO ACADÉMICA</Text>
            <View style={modalStyles.field}>
              <Text style={modalStyles.fieldLabel}>Estado da Matrícula</Text>
              <View style={[modalStyles.toggleRow, { flexWrap: 'wrap' }]}>
                {([
                  { value: 'activo',              label: 'Activo' },
                  { value: 'desistente',          label: 'Desistente' },
                  { value: 'anulacao_matricula',  label: 'Anulação de Matrícula' },
                  { value: 'transferido',         label: 'Transferido' },
                  { value: 'excluido',            label: 'Excluído' },
                  { value: 'concluido',           label: 'Concluído' },
                ]).map(opt => {
                  const sel = (form.situacao || 'activo') === opt.value;
                  return (
                    <TouchableOpacity
                      key={opt.value}
                      style={[modalStyles.toggleBtn, sel && modalStyles.toggleActive]}
                      onPress={() => set('situacao' as keyof Aluno, opt.value)}
                    >
                      <Text style={[modalStyles.toggleText, sel && modalStyles.toggleTextActive]}>{opt.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <Text style={[modalStyles.switchDesc, { marginTop: 6 }]}>
                Estados Desistente, Anulação, Transferido e Excluído contam como D-AM-T-E nos Mapas de Aproveitamento e desactivam automaticamente o aluno.
              </Text>
            </View>
            {(form.situacao && form.situacao !== 'activo') ? (
              <>
                <DatePickerField
                  label="Data da Situação"
                  value={form.dataSituacao ?? ''}
                  onChange={v => set('dataSituacao' as keyof Aluno, v)}
                  style={modalStyles.field}
                  labelStyle={modalStyles.fieldLabel}
                />
                <View style={modalStyles.field}>
                  <Text style={modalStyles.fieldLabel}>Motivo / Observações</Text>
                  <TextInput
                    style={[modalStyles.input, { minHeight: 70, textAlignVertical: 'top' }]}
                    value={form.motivoSituacao ?? ''}
                    onChangeText={v => set('motivoSituacao' as keyof Aluno, v)}
                    placeholder="Ex.: transferido para a Escola X em 12/03/2026; pedido formal do encarregado…"
                    placeholderTextColor={Colors.textMuted}
                    multiline
                  />
                </View>
              </>
            ) : null}

            <Text style={[modalStyles.sectionLabel, { marginTop: 12 }]}>SITUAÇÃO ESPECIAL</Text>
            <View style={modalStyles.switchRow}>
              <View style={{ flex: 1 }}>
                <Text style={modalStyles.switchLabel}>Registar como falecido</Text>
                <Text style={modalStyles.switchDesc}>Usado para histórico académico e bloqueio de operações futuras.</Text>
              </View>
              <TouchableOpacity
                style={[modalStyles.smallToggle, form.falecido && modalStyles.smallToggleOn]}
                onPress={() => set('falecido', !form.falecido)}
              >
                <Text style={[modalStyles.smallToggleText, form.falecido && modalStyles.smallToggleTextOn]}>
                  {form.falecido ? 'Sim' : 'Não'}
                </Text>
              </TouchableOpacity>
            </View>
            {form.falecido && (
              <>
                <DatePickerField
                  label="Data de Falecimento"
                  value={form.dataFalecimento ?? ''}
                  onChange={v => set('dataFalecimento', v)}
                  style={modalStyles.field}
                  labelStyle={modalStyles.fieldLabel}
                />
                <View style={modalStyles.field}>
                  <Text style={modalStyles.fieldLabel}>Observações</Text>
                  <TextInput
                    style={[modalStyles.input, { minHeight: 82, textAlignVertical: 'top' }]}
                    value={form.observacoesFalecimento ?? ''}
                    onChangeText={v => set('observacoesFalecimento', v)}
                    placeholder="Notas internas sobre a situação"
                    placeholderTextColor={Colors.textMuted}
                    multiline
                  />
                </View>
              </>
            )}

            {!aluno && (
              <View style={modalStyles.infoBox}>
                <Ionicons name="information-circle-outline" size={16} color={Colors.info} />
                <Text style={modalStyles.infoText}>
                  Uma conta de acesso ao portal de encarregado será criada automaticamente e as credenciais serão mostradas ao guardar.
                </Text>
              </View>
            )}
          </ScrollView>

          <TouchableOpacity style={modalStyles.saveBtn} onPress={handleSave}>
            <Ionicons name="checkmark" size={18} color={Colors.text} />
            <Text style={modalStyles.saveBtnText}>Guardar Matrícula</Text>
          </TouchableOpacity>
        </View>
      </View>
          </KeyboardAvoidingView>
</Modal>
  );
}

function CredenciaisModal({ visible, onClose, creds }: { visible: boolean; onClose: () => void; creds: { nome: string; email: string; senha: string; nomeAluno: string; isRegen?: boolean } | null }) {
  if (!creds) return null;
  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
      <View style={credStyles.overlay}>
        <View style={credStyles.container}>
          <View style={credStyles.iconRow}>
            <View style={credStyles.iconCircle}>
              <MaterialCommunityIcons name="account-key" size={32} color={Colors.gold} />
            </View>
          </View>
          <Text style={credStyles.title}>{creds.isRegen ? 'Credenciais Geradas!' : 'Conta Criada!'}</Text>
          <Text style={credStyles.subtitle}>
            {creds.isRegen
              ? `A senha de acesso do encarregado de ${creds.nomeAluno} foi regenerada. A senha anterior já não é válida.`
              : `Foram criadas as credenciais de acesso ao portal para o encarregado de ${creds.nomeAluno}.`
            }
          </Text>

          <View style={credStyles.credBox}>
            <Text style={credStyles.credLabel}>ENCARREGADO</Text>
            <Text style={credStyles.credValue}>{creds.nome}</Text>

            <View style={credStyles.separator} />

            <Text style={credStyles.credLabel}>EMAIL DE ACESSO</Text>
            <View style={credStyles.credRow}>
              <Ionicons name="mail" size={16} color={Colors.gold} />
              <Text style={credStyles.credEmail}>{creds.email}</Text>
            </View>

            <View style={credStyles.separator} />

            <Text style={credStyles.credLabel}>{creds.isRegen ? 'NOVA SENHA' : 'SENHA INICIAL'}</Text>
            <View style={credStyles.credRow}>
              <Ionicons name="lock-closed" size={16} color={Colors.gold} />
              <Text style={credStyles.credSenha}>{creds.senha}</Text>
            </View>
          </View>

          <Text style={credStyles.warningText}>
            Anote estas credenciais e entregue ao encarregado. O encarregado acede ao portal em: <Text style={{ color: Colors.info }}>Portal do Encarregado</Text>
          </Text>

          <TouchableOpacity style={credStyles.closeBtn} onPress={onClose}>
            <Text style={credStyles.closeBtnText}>Entendido</Text>
          </TouchableOpacity>
        </View>
      </View>
          </KeyboardAvoidingView>
</Modal>
  );
}

function SwipeAlunoCard({ aluno, turmas, onPress, onEdit, onQr, onAssignTurma, canEdit, index }: {
  aluno: Aluno;
  turmas: any[];
  onPress: () => void;
  onEdit: () => void;
  onQr: () => void;
  onAssignTurma: () => void;
  canEdit?: boolean;
  index?: number;
}) {
  const REVEAL_WIDTH = 128;
  const slideX = useRef(new Animated.Value(0)).current;
  const swipeOpenRef = useRef(false);

  function closeSwipe() {
    Animated.spring(slideX, { toValue: 0, useNativeDriver: false, tension: 60, friction: 8 }).start();
    swipeOpenRef.current = false;
  }

  const panResponder = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_, gs) => Math.abs(gs.dx) > 6 && Math.abs(gs.dy) < Math.abs(gs.dx),
    onPanResponderMove: (_, gs) => {
      const base = swipeOpenRef.current ? -REVEAL_WIDTH : 0;
      slideX.setValue(Math.max(-REVEAL_WIDTH, Math.min(0, base + gs.dx)));
    },
    onPanResponderRelease: (_, gs) => {
      const shouldOpen = swipeOpenRef.current ? gs.dx < 20 : gs.dx < -40;
      Animated.spring(slideX, { toValue: shouldOpen ? -REVEAL_WIDTH : 0, useNativeDriver: false, tension: 60, friction: 8 }).start();
      swipeOpenRef.current = shouldOpen;
    },
  })).current;

  const turmaName = getClasseFromTurma(aluno.turmaId, turmas);
  const idade = calcIdade(aluno.dataNascimento);
  const semTurma = !aluno.turmaId;
  const turmaObj = turmas.find((t: any) => t.id === aluno.turmaId);
  const isFinalista = turmaObj?.classe === '13ª Classe' || turmaObj?.classe === '13a Classe' || turmaObj?.classe === '13ª' || turmaObj?.classe === '13a';
  const isInativo = !aluno.ativo || (aluno as any).bloqueado;
  const isBloqueado = !!(aluno as any).bloqueado;

  // Cores semânticas
  const avatarAccent = aluno.genero === 'F' ? '#E879B0' : Colors.accent;
  const borderLeftColor = isInativo
    ? '#FFFFFF18'
    : semTurma ? Colors.warning
    : isFinalista ? Colors.gold
    : Colors.accent;

  const statusColor = isInativo ? Colors.textMuted
    : isFinalista ? Colors.gold
    : Colors.success;

  return (
    <View style={[styles.alunoWrapper, { borderLeftColor }]}>
      {/* Acções reveladas */}
      <View style={styles.alunoSwipeReveal}>
        {canEdit && (
          <TouchableOpacity
            style={[styles.alunoSwipeBtn, { backgroundColor: Colors.info }]}
            onPress={() => { onEdit(); closeSwipe(); }}
          >
            <Ionicons name="create-outline" size={17} color="#fff" />
            <Text style={styles.alunoSwipeBtnText}>Editar</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[styles.alunoSwipeBtn, { backgroundColor: Colors.gold + 'EE' }]}
          onPress={() => { onQr(); closeSwipe(); }}
        >
          <Ionicons name="qr-code-outline" size={17} color="#0a1828" />
          <Text style={[styles.alunoSwipeBtnText, { color: '#0a1828' }]}>QR</Text>
        </TouchableOpacity>
      </View>

      {/* Card principal */}
      <Animated.View
        style={[styles.alunoCard, { transform: [{ translateX: slideX }] }, isInativo && styles.alunoCardInativo]}
        {...panResponder.panHandlers}
      >
        <TouchableOpacity
          activeOpacity={0.78}
          onPress={() => { if (swipeOpenRef.current) { closeSwipe(); } else { onPress(); } }}
          style={styles.alunoCardInner}
        >
          {/* Índice */}
          {index !== undefined && (
            <Text style={styles.alunoIndex}>{String(index).padStart(2, '0')}</Text>
          )}

          {/* Avatar */}
          <View style={{ position: 'relative' }}>
            <View style={[styles.avatar, {
              backgroundColor: avatarAccent + '1A',
              borderColor: avatarAccent + '50',
              opacity: isInativo ? 0.5 : 1,
            }]}>
              <Text style={[styles.avatarText, { color: avatarAccent }]}>
                {aluno.nome.charAt(0)}{aluno.apelido.charAt(0)}
              </Text>
            </View>
            <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
          </View>

          {/* Info */}
          <View style={styles.alunoInfo}>
            {/* Linha 1: Nome + badges */}
            <View style={styles.alunoRow}>
              <Text style={[styles.alunoNome, isInativo && { color: Colors.textSecondary, opacity: 0.7 }]} numberOfLines={1}>
                {aluno.nome} {aluno.apelido}
              </Text>
              {isFinalista && (
                <View style={styles.badgeFinalista}>
                  <MaterialCommunityIcons name="school" size={9} color={Colors.gold} />
                  <Text style={styles.badgeFinalistaText}>FINALISTA</Text>
                </View>
              )}
              {isBloqueado && (
                <View style={styles.badgeBloqueado}>
                  <Ionicons name="lock-closed" size={9} color={Colors.danger} />
                </View>
              )}
              {!aluno.ativo && !isBloqueado && (
                <View style={styles.badgeInativo}>
                  <Text style={styles.badgeInativoText}>OFF</Text>
                </View>
              )}
            </View>

            {/* Linha 2: Matrícula + turma */}
            <View style={styles.alunoRow}>
              <Text style={styles.alunoMatricula}>{aluno.numeroMatricula}</Text>
              <Text style={styles.alunoDot}>·</Text>
              <Text style={styles.alunoMeta}>{idade}a</Text>
              <Text style={styles.alunoDot}>·</Text>
              {semTurma ? (
                <TouchableOpacity onPress={onAssignTurma} style={styles.semTurmaBtn}>
                  <Ionicons name="warning-outline" size={9} color={Colors.warning} />
                  <Text style={styles.semTurmaBtnText}>atribuir turma</Text>
                </TouchableOpacity>
              ) : (
                <Text style={styles.alunaTurma}>{turmaName}</Text>
              )}
            </View>

            {/* Linha 3: Localização + género */}
            <View style={styles.alunoRow}>
              <Ionicons name="location-outline" size={10} color={Colors.textMuted} />
              <Text style={styles.alunoProvinvia} numberOfLines={1}>
                {aluno.provincia || '—'} · {aluno.genero === 'M' ? 'M' : 'F'}
              </Text>
              {aluno.nomeEncarregado ? (
                <>
                  <Text style={styles.alunoDot}>·</Text>
                  <Ionicons name="person-outline" size={10} color={Colors.textMuted} />
                  <Text style={styles.encEmail} numberOfLines={1}>{aluno.nomeEncarregado}</Text>
                </>
              ) : null}
            </View>
          </View>

          <Ionicons name="chevron-forward" size={15} color={Colors.textMuted} style={{ opacity: 0.5 }} />
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

export default function AlunosScreen() {
  const router = useRouter();
  const { alunos, turmas, addAluno, updateAluno, deleteAluno, isLoading } = useData();
  const { addUser, users, updateUser } = useUsers();
  const { config } = useConfig();
  const { user: authUser } = useAuth();
  const insets = useSafeAreaInsets();

  const canManageEnrollment = ['ceo', 'pca', 'admin', 'director'].includes(authUser?.role ?? '');
  const matriculasAbertas = Boolean(config?.inscricoesAbertas);
  const canAddAluno = canManageEnrollment || matriculasAbertas;
  const [search, setSearch] = useState('');
  const [filterTurma, setFilterTurma] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [editAluno, setEditAluno] = useState<Aluno | null>(null);
  const [qrData, setQrData] = useState<{ data: string; title: string; subtitle: string } | null>(null);
  const [credenciais, setCredenciais] = useState<{ nome: string; email: string; senha: string; nomeAluno: string } | null>(null);
  const [showCredenciais, setShowCredenciais] = useState(false);
  const [regenerating, setRegenerating] = useState<string | null>(null);
  const [atribuirTurmaAluno, setAtribuirTurmaAluno] = useState<Aluno | null>(null);
  const [anotacoesAluno, setAnotacoesAluno] = useState<Aluno | null>(null);
  const [anotacoes, setAnotacoes] = useState<Anotacao[]>([]);
  const [anotacoesLoading, setAnotacoesLoading] = useState(false);
  const [novaAnotacao, setNovaAnotacao] = useState('');
  const [savingAnotacao, setSavingAnotacao] = useState(false);
  const [bloqueioAluno, setBloqueioAluno] = useState<Aluno | null>(null);
  const [motivoBloqueio, setMotivoBloqueio] = useState('');
  const [savingBloqueio, setSavingBloqueio] = useState(false);
  const [detalheAluno, setDetalheAluno] = useState<Aluno | null>(null);
  const [imprimirFichaAluno, setImprimirFichaAluno] = useState<Aluno | null>(null);
  const [showTurmaModal, setShowTurmaModal] = useState(false);

  const openAnotacoes = useCallback(async (aluno: Aluno) => {
    setAnotacoesAluno(aluno);
    setNovaAnotacao('');
    setAnotacoesLoading(true);
    try {
      const rows = await api.get<Anotacao[]>(`/api/anotacoes-matricula?alunoId=${aluno.id}`);
      setAnotacoes(rows ?? []);
    } catch {
      setAnotacoes([]);
    } finally {
      setAnotacoesLoading(false);
    }
  }, []);

  const handleAddAnotacao = useCallback(async () => {
    if (!anotacoesAluno || !novaAnotacao.trim()) return;
    setSavingAnotacao(true);
    try {
      const nova = await api.post<Anotacao>('/api/anotacoes-matricula', { alunoId: anotacoesAluno.id, texto: novaAnotacao.trim() });
      setAnotacoes(prev => [nova, ...prev]);
      setNovaAnotacao('');
      alertSucesso('Anotação guardada', '');
    } catch {
      alertErro('Erro', 'Não foi possível guardar a anotação.');
    } finally {
      setSavingAnotacao(false);
    }
  }, [anotacoesAluno, novaAnotacao]);

  const handleDeleteAnotacao = useCallback(async (id: string) => {
    try {
      await api.delete(`/api/anotacoes-matricula/${id}`);
      setAnotacoes(prev => prev.filter(a => a.id !== id));
    } catch {
      alertErro('Erro', 'Não foi possível remover a anotação.');
    }
  }, []);

  const openBloqueio = useCallback((aluno: Aluno) => {
    setBloqueioAluno(aluno);
    setMotivoBloqueio((aluno as any).motivoBloqueioRenovacao ?? '');
  }, []);

  const handleToggleBloqueio = useCallback(async () => {
    if (!bloqueioAluno) return;
    setSavingBloqueio(true);
    const jaBloqueiado = !!(bloqueioAluno as any).bloqueioRenovacao;
    const novoEstado = !jaBloqueiado;
    try {
      const updated = await api.patch<Aluno>(`/api/alunos/${bloqueioAluno.id}/bloquear-renovacao`, {
        bloqueioRenovacao: novoEstado,
        motivoBloqueioRenovacao: novoEstado ? motivoBloqueio : '',
      });
      await updateAluno(bloqueioAluno.id, updated as any);
      alertSucesso(novoEstado ? 'Renovação bloqueada' : 'Renovação liberada', '');
      setBloqueioAluno(null);
    } catch {
      alertErro('Erro', 'Não foi possível alterar o bloqueio.');
    } finally {
      setSavingBloqueio(false);
    }
  }, [bloqueioAluno, motivoBloqueio, updateAluno]);

  const bottomPad = Platform.OS === 'web' ? 34 : insets.bottom;

  const alunosSemTurma = useMemo(() => alunos.filter(a => a.ativo && !a.turmaId), [alunos]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return alunos.filter(a => {
      const nome = `${a.nome ?? ''} ${a.apelido ?? ''}`.toLowerCase();
      const matricula = (a.numeroMatricula ?? '').toLowerCase();
      const bi = (a.numeroBi ?? '').toLowerCase();
      const searchMatch = !q || nome.includes(q) || matricula.includes(q) || bi.includes(q);
      const turmaMatch = filterTurma === 'sem-turma'
        ? !a.turmaId
        : !filterTurma || a.turmaId === filterTurma;
      return searchMatch && turmaMatch;
    });
  }, [alunos, search, filterTurma]);

  // Paginação — reset para página 1 quando filtro ou busca mudar
  useEffect(() => { setCurrentPage(1); }, [search, filterTurma]);
  const paginated = useMemo(
    () => filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [filtered, currentPage]
  );

  // Stats rápidos
  const stats = useMemo(() => ({
    total: alunos.length,
    ativos: alunos.filter(a => a.ativo).length,
    inactivos: alunos.filter(a => !a.ativo).length,
    finalistas: alunos.filter(a => {
      const t = turmas.find(t => t.id === a.turmaId);
      return t?.classe === '13ª Classe' || t?.classe === '13a Classe' || t?.classe === '13ª' || t?.classe === '13a';
    }).length,
  }), [alunos, turmas]);

  async function handleAtribuirTurmaRapida(aluno: Aluno, turmaId: string) {
    await updateAluno(aluno.id, { turmaId } as any);
    setAtribuirTurmaAluno(null);
    alertSucesso('Turma atribuída', `${aluno.nome} ${aluno.apelido} foi atribuído à turma.`);
  }

  async function handleSave(form: Partial<Aluno>) {
    const isNew = !editAluno;

    if (editAluno) {
      await updateAluno(editAluno.id, form);
    } else {
      const totalAlunos = alunos.length;
      const novoAluno = await addAluno({
        ...form,
        numeroMatricula: form.numeroMatricula?.trim() || `AL-2025-${String(totalAlunos + 1).padStart(3, '0')}`,
        ativo: true,
      } as any);

      if (isNew && form.nomeEncarregado) {
        try {
          const escola = config?.nomeEscola || 'Super Escola';
          const nomeEnc = form.nomeEncarregado.trim();
          const emailBase = normalizeEmail(nomeEnc);
          const emailEnc = form.emailEncarregado?.trim() || `enc.${emailBase}@escola.ao`;
          const senha = gerarSenha();
          const alunoId = (novoAluno as any)?.id;

          await addUser({
            nome: nomeEnc,
            email: emailEnc,
            senha,
            role: 'encarregado',
            escola,
            ativo: true,
            alunoId: alunoId ?? undefined,
          } as any);

          if (emailEnc) {
            await updateAluno(alunoId, { emailEncarregado: emailEnc } as any).catch(() => {});
          }

          setCredenciais({
            nome: nomeEnc,
            email: emailEnc,
            senha,
            nomeAluno: `${form.nome} ${form.apelido}`,
          });
          setShowCredenciais(true);
        } catch (err) {
          console.warn('Erro ao criar conta encarregado:', err);
        }
      }
    }

    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    alertSucesso(
      editAluno ? 'Aluno actualizado' : 'Aluno registado',
      editAluno
        ? `Os dados de ${form.nome} ${form.apelido} foram actualizados.`
        : `${form.nome} ${form.apelido} foi registado com sucesso.`
    );
    setShowForm(false);
    setEditAluno(null);
  }

  async function handleVerCredenciais(aluno: Aluno) {
    setRegenerating(aluno.id);
    try {
      const escola = config?.nomeEscola || 'Super Escola';
      const nomeEnc = aluno.nomeEncarregado?.trim() || 'Encarregado';
      const emailBase = normalizeEmail(nomeEnc);
      const emailEnc = aluno.emailEncarregado?.trim() || `enc.${emailBase}@escola.ao`;

      // Search by alunoId first, then by email (handles Neon data where alunoId may not be linked)
      const encExistente =
        users.find(u => u.alunoId === aluno.id && u.role === 'encarregado') ||
        users.find(u => u.email.toLowerCase() === emailEnc.toLowerCase());

      if (encExistente) {
        const novaSenha = gerarSenha();
        await updateUser(encExistente.id, { senha: novaSenha });
        setCredenciais({
          nome: encExistente.nome,
          email: encExistente.email,
          senha: novaSenha,
          nomeAluno: `${aluno.nome} ${aluno.apelido}`,
          isRegen: true,
        } as any);
        setShowCredenciais(true);
      } else {
        const senha = gerarSenha();
        // addUser now handles duplicate emails gracefully on the server (upsert)
        const novo = await addUser({
          nome: nomeEnc,
          email: emailEnc,
          senha,
          role: 'encarregado',
          escola,
          ativo: true,
          alunoId: aluno.id,
        } as any);

        await updateAluno(aluno.id, { emailEncarregado: emailEnc } as any).catch(() => {});

        setCredenciais({
          nome: (novo as any).nome ?? nomeEnc,
          email: (novo as any).email ?? emailEnc,
          senha,
          nomeAluno: `${aluno.nome} ${aluno.apelido}`,
        });
        setShowCredenciais(true);
      }
    } catch (err: any) {
      webAlert('Erro', 'Não foi possível gerar as credenciais. ' + (err?.message ?? ''));
    } finally {
      setRegenerating(null);
    }
  }

  function confirmDelete(aluno: Aluno) {
    webAlert('Remover Aluno', `Remover ${aluno.nome} ${aluno.apelido}?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Remover', style: 'destructive', onPress: async () => {
          try {
            await deleteAluno(aluno.id);
            alertSucesso('Aluno removido', `${aluno.nome} ${aluno.apelido} foi removido.`);
          } catch (err: any) {
            // Verificar se é erro 409 — aluno com histórico
            const msg: string = err?.message ?? '';
            if (msg.startsWith('409:')) {
              let detalhe = '';
              try {
                const body = JSON.parse(msg.slice(4).trim());
                detalhe = body.historico ? `\n\n${body.historico.join('\n')}` : '';
              } catch { /* mantém detalhe vazio */ }
              webAlert(
                'Não é possível eliminar',
                `${aluno.nome} ${aluno.apelido} tem histórico no sistema e não pode ser eliminado(a).${detalhe}\n\nPode inativar o aluno para remover o acesso sem perder dados.`,
                [
                  { text: 'Cancelar', style: 'cancel' },
                  {
                    text: 'Inativar Aluno', style: 'default', onPress: async () => {
                      try {
                        await updateAluno(aluno.id, { ativo: false } as any);
                        alertSucesso('Aluno inativado', `${aluno.nome} ${aluno.apelido} foi inativado. O histórico foi preservado.`);
                      } catch {
                        alertErro('Erro', 'Não foi possível inativar o aluno.');
                      }
                    }
                  },
                ]
              );
            } else {
              alertErro('Erro', 'Não foi possível remover o aluno.');
            }
          }
        }
      },
    ]);
  }

  const canEdit = canManageEnrollment;

  const renderAluno = ({ item, index }: { item: Aluno; index: number }) => (
    <SwipeAlunoCard
      aluno={item}
      turmas={turmas}
      onPress={() => router.push({ pathname: '/(main)/aluno-perfil', params: { id: item.id } } as any)}
      onEdit={() => { setEditAluno(item); setShowForm(true); }}
      onQr={() => setQrData({ data: `SIGA|ALUNO|${item.id}|${item.numeroMatricula}|${item.nome} ${item.apelido}`, title: `${item.nome} ${item.apelido}`, subtitle: item.numeroMatricula })}
      onAssignTurma={() => setAtribuirTurmaAluno(item)}
      canEdit={canEdit}
      index={(currentPage - 1) * PAGE_SIZE + index + 1}
    />
  );

  return (
    <View style={styles.screen}>
      <TopBar
        title="Alunos"
        subtitle={`${filtered.length} alunos`}
        rightAction={canAddAluno ? { icon: 'person-add', onPress: () => { setEditAluno(null); setShowForm(true); } } : undefined}
      />

      {/* ── Enrollment period status banner ───────────────────────────────── */}
      {matriculasAbertas ? (
        <View style={enrollStyles.bannerOpen}>
          <Ionicons name="lock-open-outline" size={14} color="#22C55E" />
          <Text style={enrollStyles.bannerOpenText}>Período de matrículas aberto</Text>
          {config?.inscricaoDataFim ? (
            <Text style={enrollStyles.bannerOpenDate}>
              · até {new Date(config.inscricaoDataFim).toLocaleDateString('pt-PT', { day: '2-digit', month: 'short' })}
            </Text>
          ) : null}
        </View>
      ) : (
        <TouchableOpacity
          activeOpacity={canManageEnrollment ? 0.7 : 1}
          style={enrollStyles.bannerClosed}
          onPress={canManageEnrollment ? () => router.push('/(main)/admin' as any) : undefined}
        >
          <Ionicons name="lock-closed-outline" size={14} color="#F59E0B" />
          <Text style={enrollStyles.bannerClosedText}>
            {canManageEnrollment
              ? 'Matrículas encerradas — toque para abrir o período nas Configurações'
              : 'Matrículas encerradas. Contacte o director para abrir o período.'}
          </Text>
          {canManageEnrollment && (
            <Ionicons name="chevron-forward" size={13} color="#F59E0B" />
          )}
        </TouchableOpacity>
      )}

      <View style={styles.searchBar}>
        <StableSearchInput
          value={search}
          onChangeText={setSearch}
          inputStyle={styles.searchInput}
          placeholder="Pesquisar por nome ou matrícula..."
          iconSize={16}
        />
        <ExportMenu
          title="Lista de Alunos"
          columns={[
            { header: 'Nº Matrícula', key: 'numeroMatricula', width: 16 },
            { header: 'Nome Completo', key: 'nomeCompleto', width: 26 },
            { header: 'Turma', key: 'turmaNome', width: 14 },
            { header: 'Género', key: 'genero', width: 10 },
            { header: 'Data Nasc.', key: 'dataNascimento', width: 14 },
            { header: 'Província', key: 'provincia', width: 14 },
            { header: 'Encarregado', key: 'nomeEncarregado', width: 24 },
            { header: 'Tel. Encarregado', key: 'telefoneEncarregado', width: 18 },
            { header: 'Estado', key: 'estado', width: 10 },
          ]}
          rows={filtered.map(a => ({
            numeroMatricula: a.numeroMatricula,
            nomeCompleto: `${a.nome} ${a.apelido}`,
            turmaNome: turmas.find(t => t.id === a.turmaId)?.nome ?? '—',
            genero: a.genero === 'M' ? 'Masculino' : 'Feminino',
            dataNascimento: a.dataNascimento,
            provincia: a.provincia,
            nomeEncarregado: a.nomeEncarregado ?? '',
            telefoneEncarregado: a.telefoneEncarregado ?? '',
            estado: a.ativo ? 'Activo' : 'Inactivo',
          }))}
          school={{ nomeEscola: config?.nomeEscola ?? 'Super Escola' }}
          filename="lista_alunos"
        />
      </View>

      {alunosSemTurma.length > 0 && (
        <TouchableOpacity
          style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.warning + '15', borderRadius: 10, marginHorizontal: 16, marginBottom: 8, padding: 10, borderWidth: 1, borderColor: Colors.warning + '40' }}
          onPress={() => setFilterTurma(filterTurma === 'sem-turma' ? '' : 'sem-turma')}
        >
          <Ionicons name="warning-outline" size={16} color={Colors.warning} />
          <Text style={{ flex: 1, fontSize: 12, fontFamily: 'Inter_600SemiBold', color: Colors.warning }}>
            {alunosSemTurma.length} aluno{alunosSemTurma.length !== 1 ? 's' : ''} sem turma atribuída
          </Text>
          <Text style={{ fontSize: 11, fontFamily: 'Inter_600SemiBold', color: Colors.warning, textDecorationLine: 'underline' }}>
            {filterTurma === 'sem-turma' ? 'Ver todos' : 'Ver'}
          </Text>
        </TouchableOpacity>
      )}

      {/* ── Compact filter row ──────────────────────────────────────────────── */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingBottom: 10 }}>
        <TouchableOpacity
          onPress={() => setShowTurmaModal(true)}
          style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, height: 38, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: filterTurma ? Colors.gold : Colors.border, backgroundColor: filterTurma ? Colors.gold + '15' : Colors.surface }}
        >
          <Ionicons name="layers-outline" size={16} color={filterTurma ? Colors.gold : Colors.textSecondary} />
          <Text style={{ flex: 1, fontSize: 13, fontFamily: 'Inter_500Medium', color: filterTurma ? Colors.gold : Colors.textSecondary }} numberOfLines={1}>
            {filterTurma === 'sem-turma'
              ? 'Sem turma atribuída'
              : filterTurma
                ? turmas.find(t => t.id === filterTurma)?.nome ?? 'Turma seleccionada'
                : 'Todas as turmas'}
          </Text>
          <Ionicons name="chevron-down" size={14} color={filterTurma ? Colors.gold : Colors.textMuted} />
        </TouchableOpacity>
        {filterTurma ? (
          <TouchableOpacity onPress={() => setFilterTurma('')} style={{ width: 38, height: 38, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="close" size={18} color={Colors.textSecondary} />
          </TouchableOpacity>
        ) : null}
      </View>

      {/* ── Barra de estatísticas rápidas ────────────────────────────────────── */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        contentContainerStyle={statStyles.row}>
        {([
          { label: 'Total',      value: stats.total,      color: '#4F8EF7', icon: 'people-outline'           as const },
          { label: 'Activos',    value: stats.ativos,     color: '#22C55E', icon: 'checkmark-circle-outline' as const },
          { label: 'Inactivos',  value: stats.inactivos,  color: '#8B949E', icon: 'pause-circle-outline'     as const },
          { label: 'Finalistas', value: stats.finalistas, color: '#D4AF37', icon: 'school-outline'           as const },
          ...(alunosSemTurma.length > 0
            ? [{ label: 'Sem turma', value: alunosSemTurma.length, color: '#F59E0B', icon: 'warning-outline' as const }]
            : []),
        ] as { label: string; value: number; color: string; icon: any }[]).map(st => (
          <View key={st.label} style={[statStyles.chip, { borderColor: st.color + '45', backgroundColor: st.color + '12' }]}>
            <View style={[statStyles.iconWrap, { backgroundColor: st.color + '22' }]}>
              <Ionicons name={st.icon} size={13} color={st.color} />
            </View>
            <View style={statStyles.texts}>
              <Text style={[statStyles.num, { color: st.color }]}>{st.value}</Text>
              <Text style={statStyles.lbl}>{st.label}</Text>
            </View>
          </View>
        ))}
      </ScrollView>

      {isLoading && alunos.length === 0 ? (
        <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
          <SkeletonList rows={8} withAvatar />
        </View>
      ) : (
        <>
          <FlatList
            data={paginated}
            keyExtractor={i => i.id}
            renderItem={renderAluno}
            contentContainerStyle={[styles.list, { paddingBottom: 4 }]}
            showsVerticalScrollIndicator={false}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
            ListEmptyComponent={
              <View style={styles.empty}>
                <Ionicons name="people-outline" size={40} color={Colors.textMuted} />
                <Text style={styles.emptyText}>Nenhum aluno encontrado</Text>
              </View>
            }
          />
          <PaginationBar
            currentPage={currentPage}
            totalPages={Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))}
            onPageChange={setCurrentPage}
            bottomPad={bottomPad}
          />
        </>
      )}

      {/* ── Turma picker modal ──────────────────────────────────────────────── */}
      <Modal visible={showTurmaModal} animationType="slide" transparent onRequestClose={() => setShowTurmaModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end', zIndex: 1000, elevation: 1000 }}>
          <View style={{ backgroundColor: Colors.backgroundElevated, borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, borderColor: Colors.border, maxHeight: '85%', zIndex: 1001, elevation: 1001 }}>
            {/* Header */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 20, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: Colors.border }}>
              <Text style={{ fontSize: 16, fontFamily: 'Inter_700Bold', color: Colors.text }}>Seleccionar turma</Text>
              <TouchableOpacity onPress={() => setShowTurmaModal(false)}>
                <Ionicons name="close" size={22} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 24, paddingTop: 16, gap: 20 }}>
              {/* Todas */}
              <TouchableOpacity
                onPress={() => { setFilterTurma(''); setShowTurmaModal(false); }}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1.5, borderColor: !filterTurma ? Colors.accent : Colors.border, backgroundColor: !filterTurma ? Colors.accent + '15' : Colors.surface }}
              >
                <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: Colors.accent + '20', alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="grid-outline" size={16} color={Colors.accent} />
                </View>
                <Text style={{ fontSize: 14, fontFamily: 'Inter_600SemiBold', color: !filterTurma ? Colors.accent : Colors.text }}>Todas as turmas</Text>
                {!filterTurma && <Ionicons name="checkmark-circle" size={18} color={Colors.accent} style={{ marginLeft: 'auto' }} />}
              </TouchableOpacity>

              {/* Sem turma */}
              {alunosSemTurma.length > 0 && (
                <TouchableOpacity
                  onPress={() => { setFilterTurma('sem-turma'); setShowTurmaModal(false); }}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1.5, borderColor: filterTurma === 'sem-turma' ? Colors.warning : Colors.border, backgroundColor: filterTurma === 'sem-turma' ? Colors.warning + '15' : Colors.surface }}
                >
                  <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: Colors.warning + '20', alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name="warning-outline" size={16} color={Colors.warning} />
                  </View>
                  <Text style={{ fontSize: 14, fontFamily: 'Inter_600SemiBold', color: filterTurma === 'sem-turma' ? Colors.warning : Colors.text }}>Sem turma atribuída</Text>
                  <View style={{ marginLeft: 'auto', backgroundColor: Colors.warning + '25', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 }}>
                    <Text style={{ fontSize: 11, fontFamily: 'Inter_700Bold', color: Colors.warning }}>{alunosSemTurma.length}</Text>
                  </View>
                </TouchableOpacity>
              )}

              {/* Turmas grouped by class */}
              {(() => {
                const sorted = [...turmas].sort((a, b) => {
                  const nA = parseInt((a.nome || '').replace(/\D.*$/, ''), 10) || 0;
                  const nB = parseInt((b.nome || '').replace(/\D.*$/, ''), 10) || 0;
                  return nA !== nB ? nA - nB : (a.nome || '').localeCompare(b.nome || '', 'pt');
                });
                const groups: Record<string, typeof sorted> = {};
                sorted.forEach(t => {
                  const cls = (t.nome || '').replace(/^(\d+ª)\s.*$/, '$1').replace(/^(\d+).*$/, '$1ª') || '—';
                  const key = cls;
                  if (!groups[key]) groups[key] = [];
                  groups[key].push(t);
                });
                return Object.entries(groups).map(([cls, list]) => (
                  <View key={cls}>
                    <Text style={{ fontSize: 11, fontFamily: 'Inter_700Bold', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>Classe {cls}</Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                      {list.map(t => {
                        const isActive = filterTurma === t.id;
                        const count = alunos.filter(a => a.turmaId === t.id).length;
                        return (
                          <TouchableOpacity
                            key={t.id}
                            onPress={() => { setFilterTurma(t.id); setShowTurmaModal(false); }}
                            style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 9, paddingHorizontal: 13, borderRadius: 10, borderWidth: 1.5, borderColor: isActive ? Colors.gold : Colors.border, backgroundColor: isActive ? Colors.gold + '20' : Colors.surface }}
                          >
                            <Text style={{ fontSize: 14, fontFamily: 'Inter_600SemiBold', color: isActive ? Colors.gold : Colors.text }}>{t.nome}</Text>
                            <View style={{ backgroundColor: isActive ? Colors.gold + '30' : Colors.border + '80', borderRadius: 8, paddingHorizontal: 5, paddingVertical: 1 }}>
                              <Text style={{ fontSize: 10, fontFamily: 'Inter_700Bold', color: isActive ? Colors.gold : Colors.textMuted }}>{count}</Text>
                            </View>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                ));
              })()}
            </ScrollView>
          </View>
        </View>
              </KeyboardAvoidingView>
</Modal>

      {showForm && (
        <AlunoFormModal
          visible={showForm}
          onClose={() => { setShowForm(false); setEditAluno(null); }}
          onSave={handleSave}
          aluno={editAluno}
          turmas={turmas}
        />
      )}

      {qrData && (
        <QRCodeModal
          visible={!!qrData}
          onClose={() => setQrData(null)}
          data={qrData.data}
          title={qrData.title}
          subtitle={qrData.subtitle}
          schoolName={config?.nomeEscola ?? 'SIGA'}
        />
      )}

      <CredenciaisModal
        visible={showCredenciais}
        onClose={() => setShowCredenciais(false)}
        creds={credenciais}
      />

      <Modal visible={!!detalheAluno} animationType="slide" transparent onRequestClose={() => setDetalheAluno(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: Colors.backgroundCard, borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, borderColor: Colors.border, padding: 20, paddingBottom: bottomPad + 20, maxHeight: '90%' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 18, fontFamily: 'Inter_700Bold', color: Colors.text }}>Ficha Completa do Aluno</Text>
                <Text style={{ fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 2 }}>
                  {detalheAluno?.numeroMatricula}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setDetalheAluno(null)}>
                <Ionicons name="close" size={22} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>
            {detalheAluno && (() => {
              const turma = getTurmaInfo(detalheAluno.turmaId, turmas);
              const rows = [
                ['Nome completo', `${detalheAluno.nome} ${detalheAluno.apelido}`],
                ['Data de nascimento', detalheAluno.dataNascimento],
                ['Idade', `${calcIdade(detalheAluno.dataNascimento)} anos`],
                ['Género', detalheAluno.genero === 'F' ? 'Feminino' : 'Masculino'],
                ['Província / Município', `${detalheAluno.provincia || '—'} / ${detalheAluno.municipio || '—'}`],
                ['Turma', turma.nome],
                ['Detalhe da turma', turma.detalhe],
                ['Curso/Área', (detalheAluno as any).cursoId || '—'],
                ['Encarregado', detalheAluno.nomeEncarregado || '—'],
                ['Telefone do encarregado', detalheAluno.telefoneEncarregado || '—'],
                ['Email do encarregado', detalheAluno.emailEncarregado || '—'],
                ['Estado', detalheAluno.ativo ? 'Activo' : 'Inactivo'],
                ['Situação Académica', (() => {
                  const s = (detalheAluno as any).situacao || 'activo';
                  const map: Record<string, string> = {
                    activo: 'Activo',
                    desistente: 'Desistente',
                    anulacao_matricula: 'Anulação de Matrícula',
                    transferido: 'Transferido',
                    excluido: 'Excluído',
                    concluido: 'Concluído',
                  };
                  const label = map[s] || s;
                  const data = (detalheAluno as any).dataSituacao;
                  return data ? `${label} (${data})` : label;
                })()],
                ...((detalheAluno as any).motivoSituacao ? [['Motivo da situação', (detalheAluno as any).motivoSituacao]] : []),
                ['Bloqueado', (detalheAluno as any).bloqueado ? 'Sim' : 'Não'],
                ['Acesso com pendência', detalheAluno.permitirAcessoComPendencia ? 'Permitido' : 'Não permitido'],
                ['Publicação de notas', detalheAluno.publicarNotas ? 'Permitida' : 'Não permitida'],
                ['Falecido', detalheAluno.falecido ? 'Sim' : 'Não'],
                ['Data de registo', detalheAluno.createdAt ? new Date(detalheAluno.createdAt).toLocaleDateString('pt-PT') : '—'],
              ];
              return (
                <>
                  <ScrollView showsVerticalScrollIndicator={false}>
                    <View style={{ alignItems: 'center', marginBottom: 16 }}>
                      <View style={[styles.avatar, { width: 72, height: 72, borderRadius: 22, backgroundColor: detalheAluno.genero === 'F' ? `${Colors.accent}30` : `${Colors.info}30` }]}>
                        <Text style={[styles.avatarText, { fontSize: 24, color: detalheAluno.genero === 'F' ? Colors.accent : Colors.info }]}>
                          {detalheAluno.nome.charAt(0)}{detalheAluno.apelido.charAt(0)}
                        </Text>
                      </View>
                      <Text style={{ fontSize: 16, fontFamily: 'Inter_700Bold', color: Colors.text, marginTop: 10 }}>{detalheAluno.nome} {detalheAluno.apelido}</Text>
                    </View>
                    {rows.map(([label, value]) => (
                      <View key={label} style={{ flexDirection: 'row', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.border }}>
                        <Text style={{ width: 145, fontSize: 12, fontFamily: 'Inter_600SemiBold', color: Colors.textMuted }}>{label}</Text>
                        <Text style={{ flex: 1, fontSize: 13, fontFamily: 'Inter_500Medium', color: Colors.text }}>{value}</Text>
                      </View>
                    ))}
                    {detalheAluno.falecido && (
                      <View style={{ backgroundColor: Colors.danger + '12', borderRadius: 12, borderWidth: 1, borderColor: Colors.danger + '35', padding: 12, marginTop: 12 }}>
                        <Text style={{ fontSize: 12, fontFamily: 'Inter_700Bold', color: Colors.danger, marginBottom: 4 }}>Observações de falecimento</Text>
                        <Text style={{ fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textSecondary }}>{detalheAluno.observacoesFalecimento || 'Sem observações.'}</Text>
                      </View>
                    )}
                  </ScrollView>
                  <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
                    <TouchableOpacity
                      style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#0f172a', borderRadius: 14, paddingVertical: 14 }}
                      onPress={() => { setImprimirFichaAluno(detalheAluno); }}
                    >
                      <MaterialCommunityIcons name="printer" size={18} color="#fff" />
                      <Text style={{ fontSize: 13, fontFamily: 'Inter_700Bold', color: '#fff' }}>Imprimir Ficha</Text>
                    </TouchableOpacity>
                    {canEdit && (
                      <TouchableOpacity
                        style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: Colors.accent, borderRadius: 14, paddingVertical: 14 }}
                        onPress={() => { setEditAluno(detalheAluno); setDetalheAluno(null); setShowForm(true); }}
                      >
                        <Ionicons name="create-outline" size={18} color="#fff" />
                        <Text style={{ fontSize: 13, fontFamily: 'Inter_700Bold', color: '#fff' }}>Editar Dados</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </>
              );
            })()}
          </View>
        </View>
              </KeyboardAvoidingView>
</Modal>

      {/* Modal: escolher trimestre antes de imprimir ficha */}
      {imprimirFichaAluno && (
        <Modal visible animationType="fade" transparent onRequestClose={() => setImprimirFichaAluno(null)}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
            <View style={{ backgroundColor: Colors.backgroundCard, borderRadius: 20, padding: 22, width: '100%', maxWidth: 460, borderWidth: 1, borderColor: Colors.border }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <MaterialCommunityIcons name="printer" size={24} color={Colors.accent} />
                  <Text style={{ fontSize: 17, fontFamily: 'Inter_700Bold', color: Colors.text }}>Imprimir Ficha</Text>
                </View>
                <TouchableOpacity onPress={() => setImprimirFichaAluno(null)}>
                  <Ionicons name="close" size={22} color={Colors.textSecondary} />
                </TouchableOpacity>
              </View>
              <Text style={{ fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textSecondary, marginBottom: 4 }}>
                {imprimirFichaAluno.nome} {imprimirFichaAluno.apelido}
              </Text>
              <Text style={{ fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textSecondary, marginBottom: 18 }}>
                Escolha o período a imprimir. As fichas trimestrais mostram apenas as notas desse trimestre. A anual mostra os 3 trimestres juntos com a média final (MFD) e a situação Aprovado/Reprovado.
              </Text>

              {([
                { key: '1', label: '1º Trimestre', desc: 'Apenas notas do 1º T (MAC, PG1, PG2, MT, NF)', cor: '#1e40af', icon: 'numeric-1-circle' },
                { key: '2', label: '2º Trimestre', desc: 'Apenas notas do 2º T (MAC, PG1, PG2, MT, NF)', cor: '#0e7490', icon: 'numeric-2-circle' },
                { key: '3', label: '3º Trimestre', desc: 'Apenas notas do 3º T (MAC, PG1, PG2, MT, NF)', cor: '#7c2d12', icon: 'numeric-3-circle' },
                { key: 'anual', label: 'Anual (Completa)', desc: 'Os 3 trimestres + MFD + Situação Aprovado/Reprovado', cor: '#15803d', icon: 'calendar-check' },
              ] as const).map(opt => (
                <TouchableOpacity
                  key={opt.key}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.background, marginBottom: 8 }}
                  onPress={async () => {
                    const aluno = imprimirFichaAluno;
                    setImprimirFichaAluno(null);
                    if (typeof window === 'undefined') return;
                    const tok = (await getAuthToken()) || '';
                    window.open(`/api/alunos/${aluno.id}/ficha?trimestre=${opt.key}&token=${encodeURIComponent(tok)}`, '_blank');
                  }}
                >
                  <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: opt.cor, alignItems: 'center', justifyContent: 'center' }}>
                    <MaterialCommunityIcons name={opt.icon as any} size={22} color="#fff" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontFamily: 'Inter_700Bold', color: Colors.text }}>{opt.label}</Text>
                    <Text style={{ fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textSecondary, marginTop: 2 }}>{opt.desc}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={Colors.textSecondary} />
                </TouchableOpacity>
              ))}

              <TouchableOpacity
                style={{ marginTop: 6, paddingVertical: 12, alignItems: 'center', borderRadius: 12, borderWidth: 1, borderColor: Colors.border }}
                onPress={() => setImprimirFichaAluno(null)}
              >
                <Text style={{ fontSize: 13, fontFamily: 'Inter_700Bold', color: Colors.textSecondary }}>Cancelar</Text>
              </TouchableOpacity>
            </View>
          </View>
                  </KeyboardAvoidingView>
</Modal>
      )}

      {/* Modal de atribuição rápida de turma */}
      {atribuirTurmaAluno && (
        <Modal visible animationType="fade" transparent onRequestClose={() => setAtribuirTurmaAluno(null)}>
          <TouchableOpacity
            activeOpacity={1}
            onPress={() => setAtribuirTurmaAluno(null)}
            style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center' }}
          >
            <TouchableOpacity activeOpacity={1} onPress={e => e.stopPropagation()}
              style={{
                backgroundColor: Colors.backgroundCard,
                borderRadius: 18,
                borderWidth: 1, borderColor: Colors.border,
                width: Platform.OS === 'web' ? 420 : '88%',
                maxHeight: Platform.OS === 'web' ? 320 : '70%',
                shadowColor: '#000', shadowOffset: { width: 0, height: 8 },
                shadowOpacity: 0.35, shadowRadius: 24, elevation: 12,
              }}
            >
              {/* Header */}
              <View style={{ paddingHorizontal: 14, paddingTop: 14, paddingBottom: 10 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                    <View style={{
                      width: 36, height: 36, borderRadius: 10,
                      backgroundColor: Colors.accent + '22',
                      borderWidth: 1.5, borderColor: Colors.accent + '45',
                      alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Text style={{ fontSize: 12, fontFamily: 'Inter_700Bold', color: Colors.accent }}>
                        {(atribuirTurmaAluno.nome?.[0] ?? '?')}{(atribuirTurmaAluno.apelido?.[0] ?? '')}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 9, fontFamily: 'Inter_500Medium', color: Colors.accent, letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 1 }}>Atribuir Turma</Text>
                      <Text style={{ fontSize: 13, fontFamily: 'Inter_700Bold', color: Colors.text }} numberOfLines={1}>
                        {atribuirTurmaAluno.nome} {atribuirTurmaAluno.apelido}
                      </Text>
                      <Text style={{ fontSize: 10, fontFamily: 'Inter_400Regular', color: Colors.textMuted }}>
                        {atribuirTurmaAluno.numeroMatricula}
                      </Text>
                    </View>
                  </View>
                  <TouchableOpacity onPress={() => setAtribuirTurmaAluno(null)}
                    style={{ width: 26, height: 26, borderRadius: 7, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name="close" size={13} color={Colors.textSecondary} />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Divider */}
              <View style={{ height: 1, backgroundColor: Colors.border, marginBottom: 8 }} />

              {/* Lista de turmas */}
              <ScrollView showsVerticalScrollIndicator={false}
                style={{ paddingHorizontal: 12 }}
                contentContainerStyle={{ paddingBottom: 12, gap: 6 }}>
                {turmas.length === 0 ? (
                  <View style={{ alignItems: 'center', padding: 24, gap: 8 }}>
                    <Ionicons name="school-outline" size={28} color={Colors.textMuted} />
                    <Text style={{ fontSize: 13, fontFamily: 'Inter_600SemiBold', color: Colors.textSecondary }}>Sem turmas disponíveis</Text>
                  </View>
                ) : (
                  turmas.map((t: any) => {
                    const classeColors: Record<string, string> = {
                      '7ª': '#6366F1', '8ª': '#8B5CF6', '9ª': '#EC4899',
                      '10ª': '#F59E0B', '11ª': '#10B981', '12ª': '#3B82F6',
                      '13ª': '#D4AF37',
                    };
                    const classeKey = Object.keys(classeColors).find(k => (t.classe ?? '').startsWith(k));
                    const cc = classeColors[classeKey ?? ''] ?? Colors.accent;
                    return (
                      <TouchableOpacity
                        key={t.id}
                        style={{
                          flexDirection: 'row', alignItems: 'center',
                          backgroundColor: Colors.surface,
                          borderRadius: 9, borderWidth: 1, borderColor: Colors.border,
                          paddingHorizontal: 10, paddingVertical: 6, gap: 8,
                        }}
                        onPress={() => handleAtribuirTurmaRapida(atribuirTurmaAluno, t.id)}
                        activeOpacity={0.7}
                      >
                        <View style={{
                          width: 30, height: 30, borderRadius: 8,
                          backgroundColor: cc + '18', borderWidth: 1, borderColor: cc + '40',
                          alignItems: 'center', justifyContent: 'center',
                        }}>
                          <Text style={{ fontSize: 9, fontFamily: 'Inter_700Bold', color: cc, textAlign: 'center' }}>
                            {(t.classe ?? '').replace('ª Classe', 'ª').replace('ª classe', 'ª')}
                          </Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 12, fontFamily: 'Inter_700Bold', color: Colors.text }}>{t.nome}</Text>
                          <Text style={{ fontSize: 10, fontFamily: 'Inter_400Regular', color: Colors.textMuted }}>
                            {t.turno} · {t.anoLetivo}
                          </Text>
                        </View>
                        <View style={{
                          width: 22, height: 22, borderRadius: 6,
                          backgroundColor: cc + '15',
                          alignItems: 'center', justifyContent: 'center',
                        }}>
                          <Ionicons name="arrow-forward" size={11} color={cc} />
                        </View>
                      </TouchableOpacity>
                    );
                  })
                )}
              </ScrollView>
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>
      )}

      {/* Modal de Anotações Internas */}
      <Modal visible={!!anotacoesAluno} animationType="slide" transparent onRequestClose={() => setAnotacoesAluno(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: Colors.backgroundCard, borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, borderColor: Colors.border, padding: 20, paddingBottom: bottomPad + 20, maxHeight: '85%' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 17, fontFamily: 'Inter_700Bold', color: Colors.text }}>Anotações Internas</Text>
                <Text style={{ fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 2 }}>{anotacoesAluno?.nome} {anotacoesAluno?.apelido}</Text>
              </View>
              <TouchableOpacity onPress={() => setAnotacoesAluno(null)}>
                <Ionicons name="close" size={22} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.info + '12', borderRadius: 10, borderWidth: 1, borderColor: Colors.info + '30', padding: 10, marginVertical: 12 }}>
              <Ionicons name="lock-closed-outline" size={14} color={Colors.info} />
              <Text style={{ flex: 1, fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.info }}>Visível apenas pela secretaria. Não é partilhado com o aluno ou encarregado.</Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
              <TextInput
                style={{ flex: 1, backgroundColor: Colors.surface, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 12, paddingVertical: 10, fontSize: 13, fontFamily: 'Inter_400Regular', color: Colors.text }}
                value={novaAnotacao}
                onChangeText={setNovaAnotacao}
                placeholder="Escreva uma anotação..."
                placeholderTextColor={Colors.textMuted}
                multiline
              />
              <TouchableOpacity
                onPress={handleAddAnotacao}
                disabled={savingAnotacao || !novaAnotacao.trim()}
                style={{ backgroundColor: !novaAnotacao.trim() ? Colors.surface : Colors.info, borderRadius: 10, paddingHorizontal: 14, justifyContent: 'center', alignItems: 'center', opacity: !novaAnotacao.trim() ? 0.5 : 1 }}
              >
                {savingAnotacao ? <AppLoader size="small" color="#fff" /> : <Ionicons name="send" size={18} color="#fff" />}
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              {anotacoesLoading ? (
                <AppLoader color={Colors.info} style={{ marginTop: 20 }} />
              ) : anotacoes.length === 0 ? (
                <View style={{ alignItems: 'center', paddingVertical: 30, gap: 8 }}>
                  <Ionicons name="document-text-outline" size={36} color={Colors.textMuted} />
                  <Text style={{ fontSize: 13, fontFamily: 'Inter_400Regular', color: Colors.textMuted }}>Sem anotações registadas</Text>
                </View>
              ) : (
                anotacoes.map(a => (
                  <View key={a.id} style={{ backgroundColor: Colors.surface, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, padding: 12, marginBottom: 8 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                      <Text style={{ flex: 1, fontSize: 13, fontFamily: 'Inter_400Regular', color: Colors.text, lineHeight: 20 }}>{a.texto}</Text>
                      <TouchableOpacity onPress={() => handleDeleteAnotacao(a.id)} style={{ paddingLeft: 10 }}>
                        <Ionicons name="trash-outline" size={15} color={Colors.danger} />
                      </TouchableOpacity>
                    </View>
                    <Text style={{ fontSize: 10, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 6 }}>
                      {a.criadoPor} · {new Date(a.criadoEm).toLocaleDateString('pt-PT')}
                    </Text>
                  </View>
                ))
              )}
            </ScrollView>
          </View>
        </View>
              </KeyboardAvoidingView>
</Modal>

      {/* Modal de Bloqueio de Renovação de Matrícula */}
      <Modal visible={!!bloqueioAluno} animationType="slide" transparent onRequestClose={() => setBloqueioAluno(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: Colors.backgroundCard, borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, borderColor: Colors.border, padding: 20, paddingBottom: bottomPad + 20 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <Text style={{ fontSize: 17, fontFamily: 'Inter_700Bold', color: Colors.text }}>Bloqueio de Renovação</Text>
              <TouchableOpacity onPress={() => setBloqueioAluno(null)}>
                <Ionicons name="close" size={22} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <Text style={{ fontSize: 13, fontFamily: 'Inter_400Regular', color: Colors.textSecondary, marginBottom: 12 }}>
              {bloqueioAluno && (bloqueioAluno as any).bloqueioRenovacao
                ? `A renovação de matrícula de ${bloqueioAluno?.nome} ${bloqueioAluno?.apelido} está bloqueada. Pode liberá-la abaixo.`
                : `Bloqueie a renovação de matrícula de ${bloqueioAluno?.nome} ${bloqueioAluno?.apelido} por pendência financeira ou reprovação.`}
            </Text>
            {bloqueioAluno && (bloqueioAluno as any).bloqueioRenovacao && (
              <View style={{ backgroundColor: Colors.danger + '15', borderRadius: 10, borderWidth: 1, borderColor: Colors.danger + '40', padding: 10, marginBottom: 12 }}>
                <Text style={{ fontSize: 12, fontFamily: 'Inter_600SemiBold', color: Colors.danger }}>Motivo actual: {(bloqueioAluno as any).motivoBloqueioRenovacao || 'Não especificado'}</Text>
              </View>
            )}
            {bloqueioAluno && !(bloqueioAluno as any).bloqueioRenovacao && (
              <>
                <Text style={{ fontSize: 11, fontFamily: 'Inter_600SemiBold', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.7, marginBottom: 6 }}>Motivo do Bloqueio</Text>
                <TextInput
                  style={{ backgroundColor: Colors.surface, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 12, paddingVertical: 10, fontSize: 13, fontFamily: 'Inter_400Regular', color: Colors.text, marginBottom: 12 }}
                  value={motivoBloqueio}
                  onChangeText={setMotivoBloqueio}
                  placeholder="Ex: Propinas em atraso, reprovação..."
                  placeholderTextColor={Colors.textMuted}
                  returnKeyType="done"
                  onSubmitEditing={handleToggleBloqueio}
                />
              </>
            )}
            <TouchableOpacity
              onPress={handleToggleBloqueio}
              disabled={savingBloqueio}
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: bloqueioAluno && (bloqueioAluno as any).bloqueioRenovacao ? Colors.success : Colors.danger, borderRadius: 12, paddingVertical: 14 }}
            >
              {savingBloqueio ? <AppLoader color="#fff" /> : (
                <>
                  <Ionicons name={bloqueioAluno && (bloqueioAluno as any).bloqueioRenovacao ? 'lock-open-outline' : 'lock-closed-outline'} size={18} color="#fff" />
                  <Text style={{ fontSize: 15, fontFamily: 'Inter_700Bold', color: '#fff' }}>
                    {bloqueioAluno && (bloqueioAluno as any).bloqueioRenovacao ? 'Liberar Renovação' : 'Bloquear Renovação'}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
              </KeyboardAvoidingView>
</Modal>
    </View>
  );
}

const credStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  container: { backgroundColor: Colors.backgroundCard, borderRadius: 24, borderWidth: 1, borderColor: Colors.border, padding: 24, width: '100%', maxWidth: 420 },
  iconRow: { alignItems: 'center', marginBottom: 16 },
  iconCircle: { width: 68, height: 68, borderRadius: 34, backgroundColor: `${Colors.gold}20`, borderWidth: 1.5, borderColor: `${Colors.gold}50`, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 22, fontFamily: 'Inter_700Bold', color: Colors.text, textAlign: 'center', marginBottom: 8 },
  subtitle: { fontSize: 13, fontFamily: 'Inter_400Regular', color: Colors.textSecondary, textAlign: 'center', marginBottom: 20, lineHeight: 20 },
  credBox: { backgroundColor: Colors.surface, borderRadius: 16, borderWidth: 1, borderColor: Colors.border, padding: 18, marginBottom: 16 },
  credLabel: { fontSize: 10, fontFamily: 'Inter_700Bold', color: Colors.textMuted, letterSpacing: 1, marginBottom: 4 },
  credValue: { fontSize: 16, fontFamily: 'Inter_600SemiBold', color: Colors.text, marginBottom: 2 },
  credRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  credEmail: { fontSize: 14, fontFamily: 'Inter_600SemiBold', color: Colors.info, flex: 1 },
  credSenha: { fontSize: 20, fontFamily: 'Inter_700Bold', color: Colors.gold, letterSpacing: 2 },
  separator: { height: 1, backgroundColor: Colors.border, marginVertical: 12 },
  warningText: { fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textMuted, textAlign: 'center', lineHeight: 18, marginBottom: 20 },
  closeBtn: { backgroundColor: Colors.accent, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  closeBtnText: { fontSize: 15, fontFamily: 'Inter_700Bold', color: Colors.text },
});

const modalStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'center', alignItems: 'center' },
  container: { backgroundColor: Colors.backgroundCard, borderTopLeftRadius: 24, borderTopRightRadius: 24, borderTopWidth: 1, borderColor: Colors.border, padding: 20, maxHeight: '90%', width: '100%', maxWidth: 480 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  title: { fontSize: 18, fontFamily: 'Inter_700Bold', color: Colors.text },
  sectionLabel: { fontSize: 10, fontFamily: 'Inter_700Bold', color: Colors.textMuted, letterSpacing: 1.2, marginBottom: 12 },
  field: { marginBottom: 14 },
  fieldLabel: { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: Colors.textSecondary, marginBottom: 6 },
  input: { backgroundColor: Colors.surface, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, fontFamily: 'Inter_400Regular', color: Colors.text },
  toggleRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  toggleBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
  toggleActive: { backgroundColor: `${Colors.gold}20`, borderColor: Colors.gold },
  toggleText: { fontSize: 13, fontFamily: 'Inter_500Medium', color: Colors.textSecondary },
  toggleTextActive: { color: Colors.goldLight, fontFamily: 'Inter_600SemiBold' },
  infoBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: `${Colors.info}12`, borderRadius: 12, borderWidth: 1, borderColor: `${Colors.info}30`, padding: 12, marginBottom: 8 },
  infoText: { flex: 1, fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.info, lineHeight: 18 },
  optionalText: { color: Colors.textMuted, fontSize: 11, fontFamily: 'Inter_400Regular' },
  switchBlock: { backgroundColor: Colors.surface, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, marginBottom: 14, overflow: 'hidden' },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: Colors.surface, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, padding: 12, marginBottom: 10 },
  switchLabel: { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: Colors.text },
  switchDesc: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 2, lineHeight: 16 },
  smallToggle: { minWidth: 52, alignItems: 'center', paddingHorizontal: 10, paddingVertical: 7, borderRadius: 9, backgroundColor: Colors.backgroundCard, borderWidth: 1, borderColor: Colors.border },
  smallToggleOn: { backgroundColor: Colors.success + '22', borderColor: Colors.success },
  smallToggleText: { fontSize: 12, fontFamily: 'Inter_700Bold', color: Colors.textMuted },
  smallToggleTextOn: { color: Colors.success },
  saveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.accent, borderRadius: 14, paddingVertical: 16, gap: 8, marginTop: 12 },
  saveBtnText: { fontSize: 15, fontFamily: 'Inter_700Bold', color: Colors.text },
});

const statStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    paddingHorizontal: 16, paddingBottom: 12, paddingTop: 2,
  },
  chip: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 12, borderWidth: 1,
    paddingHorizontal: 11, paddingVertical: 9,
    marginRight: 8,
  },
  iconWrap: {
    width: 30, height: 30, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center',
    marginRight: 9,
  },
  texts: {
    flexDirection: 'column',
  },
  num: {
    fontSize: 16,
    fontFamily: 'Inter_700Bold',
    lineHeight: 20,
    marginBottom: 1,
  },
  lbl: {
    fontSize: 10,
    fontFamily: 'Inter_400Regular',
    color: Colors.textMuted,
    lineHeight: 13,
  },
});

const enrollStyles = StyleSheet.create({
  bannerOpen: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#22C55E12', borderBottomWidth: 1, borderBottomColor: '#22C55E30',
    paddingHorizontal: 16, paddingVertical: 8,
  },
  bannerOpenText: { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: '#22C55E' },
  bannerOpenDate: { fontSize: 12, fontFamily: 'Inter_400Regular', color: '#22C55E', opacity: 0.75 },
  bannerClosed: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#F59E0B12', borderBottomWidth: 1, borderBottomColor: '#F59E0B30',
    paddingHorizontal: 16, paddingVertical: 8,
  },
  bannerClosedText: { flex: 1, fontSize: 12, fontFamily: 'Inter_500Medium', color: '#F59E0B' },
});

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },

  // Search bar
  searchBar: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.backgroundCard,
    marginHorizontal: 16, marginVertical: 10,
    borderRadius: 12, borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: 12, gap: 8, height: 44,
  },
  searchInput: { flex: 1, fontSize: 15, fontFamily: 'Inter_400Regular', color: Colors.text },

  // Legacy filter (unused but kept for safety)
  filterScroll: { maxHeight: 46, borderBottomWidth: 1, borderBottomColor: Colors.border },
  filterContent: { paddingHorizontal: 16, gap: 8, alignItems: 'center' },
  filterChip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
  filterChipActive: { backgroundColor: `${Colors.gold}20`, borderColor: Colors.gold },
  filterChipText: { fontSize: 12, fontFamily: 'Inter_500Medium', color: Colors.textSecondary },
  filterChipTextActive: { color: Colors.goldLight, fontFamily: 'Inter_600SemiBold' },

  // Lista
  list: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 4 },
  separator: { height: 6 },

  // ── Card container (borda esquerda colorida) ───────────────────────────────
  alunoWrapper: {
    overflow: 'hidden',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    borderLeftWidth: 3,
    backgroundColor: Colors.backgroundCard,
  },

  // Acções swipe
  alunoSwipeReveal: { position: 'absolute', right: 0, top: 0, bottom: 0, flexDirection: 'row' },
  alunoSwipeBtn: { alignItems: 'center', justifyContent: 'center', gap: 5, paddingHorizontal: 16, minWidth: 64 },
  alunoSwipeBtnText: { fontSize: 10, fontFamily: 'Inter_700Bold', color: '#fff' },

  // Card principal (animated)
  alunoCard: {
    backgroundColor: Colors.backgroundCard,
    paddingVertical: 11,
    paddingHorizontal: 12,
  },
  alunoCardInativo: { opacity: 0.6 },
  alunoCardInner: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
  },

  // Índice numérico
  alunoIndex: {
    fontSize: 11,
    fontFamily: 'Inter_700Bold',
    color: Colors.textMuted,
    width: 22,
    textAlign: 'right',
    opacity: 0.5,
  },

  // Avatar
  avatar: {
    width: 42, height: 42,
    borderRadius: 12,
    borderWidth: 1.5,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontSize: 14, fontFamily: 'Inter_700Bold' },

  // Status dot
  statusDot: {
    position: 'absolute', bottom: -2, right: -2,
    width: 10, height: 10, borderRadius: 5,
    borderWidth: 2, borderColor: Colors.backgroundCard,
  },

  // Info block
  alunoInfo: { flex: 1, gap: 3 },
  alunoRow: { flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'nowrap' },

  // Nome
  alunoNome: {
    fontSize: 13, fontFamily: 'Inter_600SemiBold', color: Colors.text,
    flexShrink: 1,
  },

  // Matrícula (monospaced look)
  alunoMatricula: {
    fontSize: 11, fontFamily: 'Inter_700Bold',
    color: Colors.accent, letterSpacing: 0.3,
  },

  // Turma
  alunaTurma: {
    fontSize: 11, fontFamily: 'Inter_500Medium', color: Colors.textSecondary,
    flexShrink: 1,
  },

  // Meta genérica
  alunoMeta: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textSecondary },
  alunoDot: { fontSize: 11, color: Colors.textMuted, opacity: 0.5 },

  // Localização/género
  alunoProvinvia: {
    fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted,
    flexShrink: 1,
  },

  // Encarregado
  encRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  encEmail: {
    fontSize: 10, fontFamily: 'Inter_400Regular', color: Colors.textMuted,
    flexShrink: 1,
  },

  // Sem turma
  semTurmaBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: Colors.warning + '18', borderRadius: 5,
    paddingHorizontal: 6, paddingVertical: 2,
    borderWidth: 1, borderColor: Colors.warning + '45',
  },
  semTurmaBtnText: { fontSize: 9, fontFamily: 'Inter_600SemiBold', color: Colors.warning },

  // Badges
  badgeFinalista: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: Colors.gold + '20', borderRadius: 5,
    paddingHorizontal: 5, paddingVertical: 2,
    borderWidth: 1, borderColor: Colors.gold + '45',
  },
  badgeFinalistaText: { fontSize: 8, fontFamily: 'Inter_700Bold', color: Colors.gold, letterSpacing: 0.5 },
  badgeBloqueado: {
    backgroundColor: Colors.danger + '18', borderRadius: 5,
    paddingHorizontal: 5, paddingVertical: 2,
    borderWidth: 1, borderColor: Colors.danger + '40',
    alignItems: 'center', justifyContent: 'center',
  },
  badgeInativo: {
    backgroundColor: '#FFFFFF0C', borderRadius: 5,
    paddingHorizontal: 5, paddingVertical: 2,
    borderWidth: 1, borderColor: '#FFFFFF18',
  },
  badgeInativoText: { fontSize: 8, fontFamily: 'Inter_700Bold', color: Colors.textMuted },

  // Actions
  alunoActions: { flexDirection: 'row', gap: 4 },
  actionBtn: { width: 32, height: 32, borderRadius: 9, backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center' },

  // Empty
  empty: { alignItems: 'center', gap: 10, paddingTop: 60 },
  emptyText: { fontSize: 14, fontFamily: 'Inter_400Regular', color: Colors.textMuted },
});
