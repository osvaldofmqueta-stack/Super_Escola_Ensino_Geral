import React, { useState, useMemo, useEffect } from 'react';
import {FlatList, KeyboardAvoidingView, Linking, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
import { Colors } from '@/constants/colors';
import TopBar from '@/components/TopBar';
import PaginationBar from '@/components/PaginationBar';
import { useAuth } from '@/context/AuthContext';
import { useData } from '@/context/DataContext';
import { useProfessor, Material } from '@/context/ProfessorContext';
import { timeAgo } from '@/context/NotificacoesContext';
import { webAlert } from '@/utils/webAlert';
import { useEnterToSave } from '@/hooks/useEnterToSave';

type TipoMaterial = 'texto' | 'link' | 'resumo' | 'pdf' | 'docx' | 'ppt';

const FILE_TIPOS: TipoMaterial[] = ['pdf', 'docx', 'ppt'];
const TEXT_TIPOS: TipoMaterial[] = ['resumo', 'texto', 'link'];

const TIPO_META: Record<TipoMaterial, { icon: string; color: string; label: string; mimeTypes?: string[] }> = {
  resumo:  { icon: 'document-text',  color: Colors.gold,    label: 'Resumo' },
  texto:   { icon: 'create',         color: Colors.success,  label: 'Texto' },
  link:    { icon: 'link',            color: Colors.info,     label: 'Link/URL' },
  pdf:     { icon: 'file-pdf-box',   color: '#6AAEE3',       label: 'PDF',  mimeTypes: ['application/pdf'] },
  docx:    { icon: 'file-word-box',  color: '#1565C0',       label: 'Word', mimeTypes: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/msword'] },
  ppt:     { icon: 'file-powerpoint-box', color: '#BF360C', label: 'PowerPoint', mimeTypes: ['application/vnd.openxmlformats-officedocument.presentationml.presentation', 'application/vnd.ms-powerpoint'] },
};

function formatBytes(bytes: number) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ProfessorMateriaisScreen() {
  const { user } = useAuth();
  const { professores, turmas } = useData();
  const { materiais, addMaterial, deleteMaterial } = useProfessor();
  const insets = useSafeAreaInsets();
  const bottomInset = Platform.OS === 'web' ? 34 : insets.bottom;

  const [showForm, setShowForm] = useState(false);
  const [turmaFiltro, setTurmaFiltro] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 10;
  const [titulo, setTitulo] = useState('');
  const [descricao, setDescricao] = useState('');
  const [conteudo, setConteudo] = useState('');
  const [tipo, setTipo] = useState<TipoMaterial>('pdf');
  const [turmaId, setTurmaId] = useState('');
  const [disciplina, setDisciplina] = useState('');
  const [showTurmaList, setShowTurmaList] = useState(false);
  const [showDiscList, setShowDiscList] = useState(false);
  const [selectedMat, setSelectedMat] = useState<Material | null>(null);
  const [arquivoNome, setArquivoNome] = useState('');
  const [arquivoTamanho, setArquivoTamanho] = useState<number>(0);
  const [uploadLoading, setUploadLoading] = useState(false);

  const prof = useMemo(() => professores.find(p => (user?.id && p.utilizadorId === user.id) || p.email === user?.email), [professores, user]);
  const minhasTurmas = useMemo(() => prof ? turmas.filter(t => (prof.turmasIds.includes(t.id) || (t.professoresIds ?? []).includes(prof.id)) && t.ativo) : [], [prof, turmas]);

  const disciplinas = prof?.disciplinas || [];

  const mesMateriais = useMemo(() =>
    materiais.filter(m => m.professorId === prof?.id &&
      (turmaFiltro === 'all' || m.turmaId === turmaFiltro)
    ).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [materiais, prof, turmaFiltro]
  );

  const totalPages = Math.max(1, Math.ceil(mesMateriais.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const pagedMateriais = useMemo(() => mesMateriais.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE), [mesMateriais, safePage]);
  useEffect(() => { setCurrentPage(1); }, [turmaFiltro]);

  const isFileTipo = FILE_TIPOS.includes(tipo);

  async function pickFile() {
    const meta = TIPO_META[tipo];
    setUploadLoading(true);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: meta.mimeTypes || ['*/*'],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        setArquivoNome(asset.name);
        setArquivoTamanho(asset.size || 0);
        if (!titulo) setTitulo(asset.name.replace(/\.[^/.]+$/, ''));

        // Upload the file to the server so the content is persisted as a
        // base64 data URL rather than a temporary blob: URL that breaks on refresh.
        try {
          const blobResponse = await fetch(asset.uri);
          const blob = await blobResponse.blob();
          const formData = new FormData();
          formData.append('file', blob, asset.name);
          const uploadRes = await fetch('/api/upload', { method: 'POST', body: formData });
          if (uploadRes.ok) {
            const { url } = await uploadRes.json();
            setConteudo(url);
          } else {
            // Fallback: store the raw URI (works only in current session)
            setConteudo(asset.uri);
            webAlert('Aviso', 'Não foi possível fazer upload do ficheiro. O ficheiro pode não estar disponível após recarregar a página.');
          }
        } catch {
          // Fallback for native platforms where fetch(blob:) may not work
          setConteudo(asset.uri);
        }
      }
    } catch {
      webAlert('Erro', 'Não foi possível selecionar o ficheiro.');
    } finally {
      setUploadLoading(false);
    }
  }

  async function salvar() {
    if (!titulo.trim() || !turmaId || !disciplina || !prof) return;
    if (isFileTipo && !conteudo) {
      webAlert('Ficheiro em falta', 'Selecione um ficheiro antes de enviar.');
      return;
    }
    if (!isFileTipo && !conteudo.trim()) {
      webAlert('Conteúdo em falta', 'Preencha o conteúdo antes de enviar.');
      return;
    }
    const turma = minhasTurmas.find(t => t.id === turmaId);
    await addMaterial({
      professorId: prof.id,
      turmaId,
      turmaNome: turma?.nome || '',
      disciplina,
      titulo,
      descricao,
      tipo,
      conteudo,
      nomeArquivo: isFileTipo ? arquivoNome : undefined,
      tamanhoArquivo: isFileTipo ? arquivoTamanho : undefined,
    });
    resetForm();
    setShowForm(false);
    webAlert('Sucesso', 'Material enviado à turma!');
  }

  function resetForm() {
    setTitulo(''); setDescricao(''); setConteudo('');
    setTurmaId(''); setDisciplina('');
    setArquivoNome(''); setArquivoTamanho(0);
    setTipo('pdf');
  }

  function abrirFicheiro(mat: Material) {
    if (!mat.conteudo) return;
    if (mat.tipo === 'link') {
      Linking.openURL(mat.conteudo).catch(() => webAlert('Erro', 'Não foi possível abrir o link.'));
    } else if (FILE_TIPOS.includes(mat.tipo as TipoMaterial)) {
      if (Platform.OS === 'web' && mat.conteudo.startsWith('data:')) {
        // Create a download anchor for base64 data URLs on web
        const a = document.createElement('a');
        a.href = mat.conteudo;
        a.download = mat.nomeArquivo || mat.titulo || 'ficheiro';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      } else {
        Linking.openURL(mat.conteudo).catch(() =>
          webAlert('Ficheiro', 'O ficheiro está guardado no dispositivo: ' + (mat.nomeArquivo || mat.conteudo))
        );
      }
    }
  }

  useEnterToSave(salvar, showForm);

  return (
    <View style={styles.container}>
      <TopBar title="Materiais" subtitle="Recursos para as turmas" />

      {/* Filter by turma */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow}>
        <View style={styles.filterInner}>
          <TouchableOpacity
            style={[styles.filterBtn, turmaFiltro === 'all' && styles.filterBtnActive]}
            onPress={() => setTurmaFiltro('all')}
          >
            <Text style={[styles.filterText, turmaFiltro === 'all' && styles.filterTextActive]}>Todas</Text>
          </TouchableOpacity>
          {minhasTurmas.map(t => (
            <TouchableOpacity
              key={t.id}
              style={[styles.filterBtn, turmaFiltro === t.id && styles.filterBtnActive]}
              onPress={() => setTurmaFiltro(t.id)}
            >
              <Text style={[styles.filterText, turmaFiltro === t.id && styles.filterTextActive]}>{t.nome}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      {/* List */}
      <FlatList
        data={pagedMateriais}
        keyExtractor={m => m.id}
        contentContainerStyle={{ padding: 16, paddingBottom: 8 }}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="folder-open-outline" size={52} color={Colors.textMuted} />
            <Text style={styles.emptyText}>Nenhum material enviado</Text>
            <Text style={styles.emptySub}>Clique em + para adicionar um material à turma</Text>
          </View>
        }
        renderItem={({ item: mat }) => {
          const meta = TIPO_META[mat.tipo as TipoMaterial] || TIPO_META.resumo;
          const isFile = FILE_TIPOS.includes(mat.tipo as TipoMaterial);
          return (
            <TouchableOpacity
              style={styles.matCard}
              onPress={() => setSelectedMat(mat)}
              activeOpacity={0.8}
            >
              <View style={[styles.matIcon, { backgroundColor: meta.color + '22' }]}>
                {isFile ? (
                  <MaterialCommunityIcons name={meta.icon as any} size={26} color={meta.color} />
                ) : (
                  <Ionicons name={meta.icon as any} size={22} color={meta.color} />
                )}
              </View>
              <View style={{ flex: 1 }}>
                <View style={styles.matTitleRow}>
                  <Text style={styles.matTitulo} numberOfLines={1}>{mat.titulo}</Text>
                  <View style={[styles.tipoPill, { backgroundColor: meta.color + '22' }]}>
                    <Text style={[styles.tipoPillText, { color: meta.color }]}>{meta.label}</Text>
                  </View>
                </View>
                <Text style={styles.matMeta}>{mat.turmaNome} · {mat.disciplina}</Text>
                {mat.nomeArquivo ? (
                  <Text style={styles.matDesc} numberOfLines={1}>
                    {mat.nomeArquivo}{mat.tamanhoArquivo ? ` · ${formatBytes(mat.tamanhoArquivo)}` : ''}
                  </Text>
                ) : mat.descricao ? (
                  <Text style={styles.matDesc} numberOfLines={1}>{mat.descricao}</Text>
                ) : null}
              </View>
              <View style={{ alignItems: 'flex-end', gap: 6 }}>
                <Text style={styles.matTime}>{timeAgo(mat.createdAt)}</Text>
                <TouchableOpacity
                  onPress={() => webAlert('Eliminar', 'Deseja eliminar este material?', [
                    { text: 'Cancelar', style: 'cancel' },
                    { text: 'Eliminar', style: 'destructive', onPress: () => deleteMaterial(mat.id) }
                  ])}
                  style={styles.deleteBtn}
                >
                  <Ionicons name="trash-outline" size={16} color={Colors.danger} />
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          );
        }}
      />
      <PaginationBar currentPage={safePage} totalPages={totalPages} onPageChange={setCurrentPage} bottomPad={bottomInset} />

      {/* FAB */}
      <TouchableOpacity style={styles.fab} onPress={() => { resetForm(); setShowForm(true); }}>
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>

      {/* Detail Modal */}
      <Modal visible={!!selectedMat} transparent animationType="slide" onRequestClose={() => setSelectedMat(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={styles.overlay}>
          <View style={styles.modalBox}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle} numberOfLines={2}>{selectedMat?.titulo}</Text>
              <TouchableOpacity onPress={() => setSelectedMat(null)} style={styles.closeBtn}>
                <Ionicons name="close" size={22} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>
            {selectedMat && (() => {
              const meta = TIPO_META[selectedMat.tipo as TipoMaterial] || TIPO_META.resumo;
              const isFile = FILE_TIPOS.includes(selectedMat.tipo as TipoMaterial);
              return (
                <>
                  <View style={styles.modalTypeBadge}>
                    {isFile ? (
                      <MaterialCommunityIcons name={meta.icon as any} size={18} color={meta.color} />
                    ) : (
                      <Ionicons name={meta.icon as any} size={16} color={meta.color} />
                    )}
                    <Text style={[styles.modalTypeTxt, { color: meta.color }]}>{meta.label}</Text>
                  </View>
                  <Text style={styles.modalMeta}>
                    {selectedMat.turmaNome} · {selectedMat.disciplina} · {timeAgo(selectedMat.createdAt)}
                  </Text>
                  {selectedMat.descricao ? <Text style={styles.modalDesc}>{selectedMat.descricao}</Text> : null}
                  <View style={styles.modalDivider} />

                  {isFile ? (
                    <View style={styles.fileBox}>
                      <MaterialCommunityIcons name={meta.icon as any} size={40} color={meta.color} />
                      <Text style={styles.fileBoxName}>{selectedMat.nomeArquivo || 'Ficheiro'}</Text>
                      {!!selectedMat.tamanhoArquivo && (
                        <Text style={styles.fileBoxSize}>{formatBytes(selectedMat.tamanhoArquivo)}</Text>
                      )}
                      <TouchableOpacity style={[styles.openBtn, { backgroundColor: meta.color }]} onPress={() => abrirFicheiro(selectedMat)}>
                        <Ionicons name="open-outline" size={16} color="#fff" />
                        <Text style={styles.openBtnText}>Abrir / Descarregar</Text>
                      </TouchableOpacity>
                    </View>
                  ) : selectedMat.tipo === 'link' ? (
                    <TouchableOpacity style={styles.linkBtn} onPress={() => abrirFicheiro(selectedMat)}>
                      <Ionicons name="link" size={16} color={Colors.info} />
                      <Text style={styles.linkBtnText} numberOfLines={2}>{selectedMat.conteudo}</Text>
                      <Ionicons name="open-outline" size={14} color={Colors.info} />
                    </TouchableOpacity>
                  ) : (
                    <ScrollView style={{ maxHeight: 300 }}>
                      <Text style={styles.modalConteudo}>{selectedMat.conteudo}</Text>
                    </ScrollView>
                  )}
                </>
              );
            })()}
          </View>
        </View>
              </KeyboardAvoidingView>
</Modal>

      {/* Add Form Modal */}
      <Modal visible={showForm} transparent animationType="slide" onRequestClose={() => setShowForm(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={styles.overlay}>
          <View style={styles.modalBox}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Novo Material</Text>
              <TouchableOpacity onPress={() => setShowForm(false)} style={styles.closeBtn}>
                <Ionicons name="close" size={22} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>

              {/* Tipo row — files */}
              <Text style={styles.fieldLabel}>Ficheiro</Text>
              <View style={styles.tipoRow}>
                {FILE_TIPOS.map(t => {
                  const meta = TIPO_META[t];
                  return (
                    <TouchableOpacity
                      key={t}
                      style={[styles.tipoBtn, tipo === t && styles.tipoBtnActive, tipo === t && { borderColor: meta.color + '88' }]}
                      onPress={() => { setTipo(t); setConteudo(''); setArquivoNome(''); setArquivoTamanho(0); }}
                    >
                      <MaterialCommunityIcons name={meta.icon as any} size={18} color={tipo === t ? meta.color : Colors.textMuted} />
                      <Text style={[styles.tipoBtnText, tipo === t && { color: meta.color }]}>{meta.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Tipo row — text */}
              <Text style={styles.fieldLabel}>Conteúdo Digital</Text>
              <View style={styles.tipoRow}>
                {TEXT_TIPOS.map(t => {
                  const meta = TIPO_META[t];
                  return (
                    <TouchableOpacity
                      key={t}
                      style={[styles.tipoBtn, tipo === t && styles.tipoBtnActive, tipo === t && { borderColor: meta.color + '88' }]}
                      onPress={() => { setTipo(t); setConteudo(''); setArquivoNome(''); setArquivoTamanho(0); }}
                    >
                      <Ionicons name={meta.icon as any} size={15} color={tipo === t ? meta.color : Colors.textMuted} />
                      <Text style={[styles.tipoBtnText, tipo === t && { color: meta.color }]}>{meta.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Turma */}
              <Text style={styles.fieldLabel}>Turma</Text>
              <TouchableOpacity style={styles.selector} onPress={() => { setShowTurmaList(v => !v); setShowDiscList(false); }}>
                <Text style={turmaId ? styles.selectorValue : styles.selectorPlaceholder}>
                  {turmaId ? minhasTurmas.find(t => t.id === turmaId)?.nome : 'Selecionar turma...'}
                </Text>
                <Ionicons name="chevron-down" size={16} color={Colors.textMuted} />
              </TouchableOpacity>
              {showTurmaList && (
                <View style={styles.dropdownList}>
                  {minhasTurmas.map(t => (
                    <TouchableOpacity key={t.id} style={[styles.dropdownItem, turmaId === t.id && styles.dropdownItemActive]}
                      onPress={() => { setTurmaId(t.id); setShowTurmaList(false); }}>
                      <Text style={[styles.dropdownText, turmaId === t.id && { color: Colors.gold }]}>{t.nome}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {/* Disciplina */}
              <Text style={styles.fieldLabel}>Disciplina</Text>
              <TouchableOpacity style={styles.selector} onPress={() => { setShowDiscList(v => !v); setShowTurmaList(false); }}>
                <Text style={disciplina ? styles.selectorValue : styles.selectorPlaceholder}>
                  {disciplina || 'Selecionar disciplina...'}
                </Text>
                <Ionicons name="chevron-down" size={16} color={Colors.textMuted} />
              </TouchableOpacity>
              {showDiscList && (
                <View style={styles.dropdownList}>
                  {disciplinas.map(d => (
                    <TouchableOpacity key={d} style={[styles.dropdownItem, disciplina === d && styles.dropdownItemActive]}
                      onPress={() => { setDisciplina(d); setShowDiscList(false); }}>
                      <Text style={[styles.dropdownText, disciplina === d && { color: Colors.gold }]}>{d}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {/* Título */}
              <Text style={styles.fieldLabel}>Título</Text>
              <TextInput
                style={styles.input}
                placeholder="Título do material..."
                placeholderTextColor={Colors.textMuted}
                value={titulo}
                onChangeText={setTitulo}
              />

              {/* Descrição */}
              <Text style={styles.fieldLabel}>Descrição (opcional)</Text>
              <TextInput
                style={styles.input}
                placeholder="Breve descrição..."
                placeholderTextColor={Colors.textMuted}
                value={descricao}
                onChangeText={setDescricao}
              />

              {/* Content: file picker or text input */}
              {isFileTipo ? (
                <>
                  <Text style={styles.fieldLabel}>Ficheiro ({TIPO_META[tipo].label})</Text>
                  <TouchableOpacity
                    style={[styles.filePicker, conteudo && styles.filePickerFilled]}
                    onPress={pickFile}
                    disabled={uploadLoading}
                  >
                    <MaterialCommunityIcons
                      name={TIPO_META[tipo].icon as any}
                      size={28}
                      color={conteudo ? TIPO_META[tipo].color : Colors.textMuted}
                    />
                    {arquivoNome ? (
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.filePickerName, { color: TIPO_META[tipo].color }]} numberOfLines={1}>
                          {arquivoNome}
                        </Text>
                        {!!arquivoTamanho && (
                          <Text style={styles.filePickerSize}>{formatBytes(arquivoTamanho)}</Text>
                        )}
                      </View>
                    ) : (
                      <Text style={styles.filePickerText}>
                        {uploadLoading ? 'A carregar...' : `Selecionar ficheiro ${TIPO_META[tipo].label}`}
                      </Text>
                    )}
                    <Ionicons name="cloud-upload-outline" size={20} color={conteudo ? TIPO_META[tipo].color : Colors.textMuted} />
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <Text style={styles.fieldLabel}>{tipo === 'link' ? 'URL / Link' : 'Conteúdo'}</Text>
                  <TextInput
                    style={[styles.input, { height: tipo === 'link' ? 48 : 120, textAlignVertical: 'top' }]}
                    placeholder={tipo === 'link' ? 'https://...' : 'Escreva o conteúdo aqui...'}
                    placeholderTextColor={Colors.textMuted}
                    value={conteudo}
                    onChangeText={setConteudo}
                    multiline={tipo !== 'link'}
                    autoCapitalize="none"
                    keyboardType={tipo === 'link' ? 'url' : 'default'}
                  />
                </>
              )}

              <TouchableOpacity
                style={[styles.saveBtn, (!titulo || !turmaId || !disciplina || !conteudo) && styles.saveBtnDisabled]}
                onPress={salvar}
                disabled={!titulo || !turmaId || !disciplina || !conteudo}
              >
                <Ionicons name="cloud-upload" size={18} color="#fff" />
                <Text style={styles.saveBtnText}>Enviar Material</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
              </KeyboardAvoidingView>
</Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  filterRow: { maxHeight: 52, backgroundColor: Colors.primaryDark, borderBottomWidth: 1, borderBottomColor: Colors.border },
  filterInner: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, gap: 8 },
  filterBtn: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, backgroundColor: Colors.surface },
  filterBtnActive: { backgroundColor: Colors.accent },
  filterText: { fontSize: 13, fontFamily: 'Inter_500Medium', color: Colors.textSecondary },
  filterTextActive: { color: '#fff', fontFamily: 'Inter_600SemiBold' },
  matCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, backgroundColor: Colors.backgroundCard, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: Colors.border },
  matIcon: { width: 48, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  matTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 },
  matTitulo: { flex: 1, fontSize: 14, fontFamily: 'Inter_600SemiBold', color: Colors.text },
  tipoPill: { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  tipoPillText: { fontSize: 10, fontFamily: 'Inter_600SemiBold' },
  matMeta: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.gold, marginTop: 2 },
  matDesc: { fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 3 },
  matTime: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted },
  deleteBtn: { padding: 4 },
  fab: { position: 'absolute', bottom: 80, right: 20, width: 56, height: 56, borderRadius: 28, backgroundColor: Colors.accent, alignItems: 'center', justifyContent: 'center', elevation: 6 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'center', alignItems: 'center' },
  modalBox: { backgroundColor: Colors.backgroundCard, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, maxHeight: '95%', width: '100%', maxWidth: 480 },
  modalHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 8 },
  modalTitle: { flex: 1, fontSize: 17, fontFamily: 'Inter_700Bold', color: Colors.text },
  closeBtn: { padding: 4 },
  modalTypeBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  modalTypeTxt: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  modalMeta: { fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.gold, marginBottom: 4 },
  modalDesc: { fontSize: 13, fontFamily: 'Inter_400Regular', color: Colors.textSecondary, marginBottom: 8 },
  modalDivider: { height: 1, backgroundColor: Colors.border, marginVertical: 12 },
  modalConteudo: { fontSize: 14, fontFamily: 'Inter_400Regular', color: Colors.text, lineHeight: 22 },
  fileBox: { alignItems: 'center', gap: 10, paddingVertical: 20, backgroundColor: Colors.surface, borderRadius: 16, borderWidth: 1, borderColor: Colors.border },
  fileBoxName: { fontSize: 14, fontFamily: 'Inter_600SemiBold', color: Colors.text, textAlign: 'center', paddingHorizontal: 16 },
  fileBoxSize: { fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textMuted },
  openBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 12, marginTop: 4 },
  openBtnText: { fontSize: 14, fontFamily: 'Inter_600SemiBold', color: '#fff' },
  linkBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.info + '11', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: Colors.info + '33' },
  linkBtnText: { flex: 1, fontSize: 13, fontFamily: 'Inter_400Regular', color: Colors.info },
  fieldLabel: { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: Colors.textMuted, marginBottom: 6, marginTop: 14, textTransform: 'uppercase', letterSpacing: 0.8 },
  tipoRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  tipoBtn: { flex: 1, minWidth: 80, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 9, paddingHorizontal: 6, borderRadius: 10, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
  tipoBtnActive: { backgroundColor: Colors.surface },
  tipoBtnText: { fontSize: 11, fontFamily: 'Inter_600SemiBold', color: Colors.textMuted },
  selector: { backgroundColor: Colors.surface, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: Colors.border },
  selectorValue: { fontSize: 14, fontFamily: 'Inter_400Regular', color: Colors.text },
  selectorPlaceholder: { fontSize: 14, fontFamily: 'Inter_400Regular', color: Colors.textMuted },
  dropdownList: { backgroundColor: Colors.surface, borderRadius: 12, marginTop: 4, borderWidth: 1, borderColor: Colors.border, maxHeight: 160, overflow: 'hidden' },
  dropdownItem: { paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.border },
  dropdownItemActive: { backgroundColor: 'rgba(240,165,0,0.1)' },
  dropdownText: { fontSize: 14, fontFamily: 'Inter_400Regular', color: Colors.text },
  input: { backgroundColor: Colors.surface, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, fontFamily: 'Inter_400Regular', color: Colors.text, borderWidth: 1, borderColor: Colors.border },
  filePicker: { backgroundColor: Colors.surface, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 18, flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 2, borderColor: Colors.border, borderStyle: 'dashed' },
  filePickerFilled: { borderStyle: 'solid', borderColor: Colors.gold + '55', backgroundColor: Colors.gold + '08' },
  filePickerText: { flex: 1, fontSize: 14, fontFamily: 'Inter_400Regular', color: Colors.textMuted },
  filePickerName: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  filePickerSize: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textMuted, marginTop: 2 },
  saveBtn: { backgroundColor: Colors.accent, borderRadius: 14, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 16, marginBottom: 8 },
  saveBtnDisabled: { opacity: 0.4 },
  saveBtnText: { fontSize: 15, fontFamily: 'Inter_700Bold', color: '#fff' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, gap: 12, minHeight: 250 },
  emptyText: { fontSize: 16, fontFamily: 'Inter_600SemiBold', color: Colors.textSecondary, textAlign: 'center' },
  emptySub: { fontSize: 13, fontFamily: 'Inter_400Regular', color: Colors.textMuted, textAlign: 'center' },
});
