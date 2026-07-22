import React, { useState, useEffect, useCallback } from 'react';
import {Image, KeyboardAvoidingView, Modal, Platform, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View, useWindowDimensions} from 'react-native';
import AppLoader from '@/components/AppLoader';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import TopBar from '@/components/TopBar';
import { useToast } from '@/context/ToastContext';
import { useAuth, getAuthToken } from '@/context/AuthContext';
import { useConfig } from '@/context/ConfigContext';
import { useEnterToSave } from '@/hooks/useEnterToSave';
import { StableSearchInput } from '@/components/StableSearchInput';

interface TrabalhoFinal {
  id: string;
  titulo: string;
  autor: string;
  orientador: string;
  anoConclusao: number;
  curso: string;
  imagemCapa: string | null;
  resumo: string;
  visitas: number;
  criadoEm: string;
}

const CURSOS = [
  'Todos',
  'Informática',
  'Contabilidade',
  'Gestão',
  'Construção Civil',
  'Electricidade',
  'Electrónica',
  'Mecânica',
  'Agropecuária',
  'Saúde',
  'Turismo e Hotelaria',
  'Administração Pública',
  'Outro',
];

const CURSO_COLORS: Record<string, string> = {
  'Informática': '#5E6AD2',
  'Contabilidade': '#26A69A',
  'Gestão': '#FFA726',
  'Construção Civil': '#8D6E63',
  'Electricidade': '#FFCA28',
  'Electrónica': '#42A5F5',
  'Mecânica': '#78909C',
  'Agropecuária': '#66BB6A',
  'Saúde': '#EF5350',
  'Turismo e Hotelaria': '#AB47BC',
  'Administração Pública': '#FF7043',
};

function cursoColor(curso: string) {
  return CURSO_COLORS[curso] || '#888';
}

async function req<T = unknown>(url: string, opts?: RequestInit): Promise<T> {
  const token = await getAuthToken();
  const authHeader: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
  const res = await fetch(url, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...authHeader, ...opts?.headers },
    credentials: 'include',
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || 'Erro de servidor');
  return data as T;
}

export default function TrabalhosFinals() {
  const { config } = useConfig();
  const tem13 = (config as any).temDecimaTermeira !== false;
  const [trabalhos, setTrabalhos] = useState<TrabalhoFinal[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [anoFiltro, setAnoFiltro] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState<TrabalhoFinal | null>(null);
  const [selectedItem, setSelectedItem] = useState<TrabalhoFinal | null>(null);
  const { showToast } = useToast();
  const { user } = useAuth();

  const canWrite = !['aluno', 'encarregado'].includes(user?.role || '');

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const rows = await req<TrabalhoFinal[]>('/api/trabalhos-finais');
      setTrabalhos(rows);
    } catch (e) {
      showToast((e as Error).message, 'error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const onRefresh = () => { setRefreshing(true); load(true); };

  const anos = Array.from(new Set(trabalhos.map(t => String(t.anoConclusao)))).sort((a, b) => Number(b) - Number(a));

  const filtered = trabalhos.filter(t => {
    const q = search.toLowerCase();
    const matchSearch = !q ||
      t.titulo.toLowerCase().includes(q) ||
      t.autor.toLowerCase().includes(q) ||
      t.orientador.toLowerCase().includes(q) ||
      t.curso.toLowerCase().includes(q);
    const matchAno = !anoFiltro || String(t.anoConclusao) === anoFiltro;
    return matchSearch && matchAno;
  });

  const handleDelete = async (id: string) => {
    try {
      await req(`/api/trabalhos-finais/${id}`, { method: 'DELETE' });
      showToast('Trabalho removido com sucesso.', 'success');
      load(true);
    } catch (e) {
      showToast((e as Error).message, 'error');
    }
  };

  const handleView = async (item: TrabalhoFinal) => {
    setSelectedItem(item);
    try {
      const result = await req<{ visitas: number }>(`/api/trabalhos-finais/${item.id}/visita`, { method: 'POST' });
      setTrabalhos(prev =>
        prev.map(t => t.id === item.id ? { ...t, visitas: result.visitas } : t)
      );
      setSelectedItem(prev => prev && prev.id === item.id ? { ...prev, visitas: result.visitas } : prev);
    } catch {
    }
  };

  const topVisitados = [...trabalhos].sort((a, b) => (b.visitas || 0) - (a.visitas || 0)).slice(0, 3).filter(t => (t.visitas || 0) > 0);

  const { width: screenWidth } = useWindowDimensions();
  const [containerWidth, setContainerWidth] = useState(screenWidth);
  const usableWidth = containerWidth || screenWidth;
  const CARD_MIN = 150;
  const numCols = Math.max(2, Math.min(7, Math.floor((usableWidth - 32) / (CARD_MIN + 10))));
  const cardWidth = Math.floor((usableWidth - 32 - (numCols - 1) * 10) / numCols);

  return (
    <View style={styles.root} onLayout={(e) => setContainerWidth(e.nativeEvent.layout.width)}>
      <TopBar
        title="Repositório de Trabalhos Finais"
        subtitle={tem13 ? '13ª Classe — Ensino Técnico Profissional' : 'Ensino Técnico Profissional'}
      />

      <View style={styles.searchRow}>
        <View style={styles.searchBox}>
          <StableSearchInput
            value={search}
            onChangeText={setSearch}
            inputStyle={styles.searchInput}
            placeholder="Pesquisar tema, autor, orientador…"
            iconColor="#666"
          />
        </View>
        {canWrite && (
          <TouchableOpacity
            style={styles.addBtn}
            onPress={() => { setEditItem(null); setShowModal(true); }}
          >
            <Ionicons name="add" size={18} color="#fff" />
            <Text style={styles.addBtnTxt}>Novo Trabalho</Text>
          </TouchableOpacity>
        )}
      </View>

      {anos.length > 0 && (
        <View style={[styles.filterScroll, { flexDirection: 'row', flexWrap: 'wrap', gap: 8, maxHeight: undefined, height: undefined }]}>
          <TouchableOpacity
            style={[styles.anoChip, !anoFiltro && styles.anoChipActive]}
            onPress={() => setAnoFiltro('')}
          >
            <Text style={[styles.anoChipText, !anoFiltro && { color: '#fff' }]}>Todos os Anos</Text>
          </TouchableOpacity>
          {anos.map(a => (
            <TouchableOpacity
              key={a}
              style={[styles.anoChip, anoFiltro === a && styles.anoChipActive]}
              onPress={() => setAnoFiltro(a)}
            >
              <Text style={[styles.anoChipText, anoFiltro === a && { color: '#fff' }]}>{a}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      <View style={styles.countRow}>
        <Text style={styles.countText}>{filtered.length} trabalho{filtered.length !== 1 ? 's' : ''} encontrado{filtered.length !== 1 ? 's' : ''}</Text>
      </View>

      {loading ? (
        <View style={styles.center}><AppLoader color="#5E6AD2" size="large" /></View>
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={shelfStyles.scrollContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#5E6AD2" />}
        >
          {topVisitados.length > 0 && (
            <View style={styles.topBox}>
              <View style={styles.topHeader}>
                <Ionicons name="flame" size={16} color="#FFA726" />
                <Text style={styles.topTitle}>Mais Visitados</Text>
              </View>
              {topVisitados.map((t, idx) => {
                const medals = ['🥇', '🥈', '🥉'];
                return (
                  <TouchableOpacity key={t.id} style={styles.topItem} onPress={() => handleView(t)}>
                    <Text style={styles.topMedal}>{medals[idx]}</Text>
                    <View style={styles.topInfo}>
                      <Text style={styles.topItemTitle} numberOfLines={1}>{t.titulo}</Text>
                      <Text style={styles.topItemAutor} numberOfLines={1}>{t.autor} · {t.curso}</Text>
                    </View>
                    <View style={styles.topVisitasBox}>
                      <Ionicons name="eye" size={13} color="#FFA726" />
                      <Text style={styles.topVisitasNum}>{t.visitas}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {filtered.length === 0 ? (
            <View style={styles.emptyBox}>
              <MaterialCommunityIcons name="book-education-outline" size={56} color="#444" />
              <Text style={styles.emptyText}>Nenhum trabalho final encontrado</Text>
              {canWrite && <Text style={styles.emptySub}>Toque em + para registar o primeiro trabalho</Text>}
            </View>
          ) : (
            <BookShelf
              items={filtered}
              numCols={numCols}
              cardWidth={cardWidth}
              canWrite={canWrite}
              onEdit={(item) => { setEditItem(item); setShowModal(true); }}
              onDelete={handleDelete}
              onView={handleView}
            />
          )}
        </ScrollView>
      )}

      <TrabalhoModal
        visible={showModal}
        item={editItem}
        onClose={() => setShowModal(false)}
        onSaved={() => { setShowModal(false); load(true); }}
      />

      <DetailModal
        item={selectedItem}
        onClose={() => setSelectedItem(null)}
        canWrite={canWrite}
        onEdit={() => { setEditItem(selectedItem); setSelectedItem(null); setShowModal(true); }}
      />
    </View>
  );
}

function ShelfCard({ item, cardWidth, canWrite, onEdit, onDelete, onView }: {
  item: TrabalhoFinal;
  cardWidth: number;
  canWrite: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onView: () => void;
}) {
  const color = cursoColor(item.curso);
  const coverHeight = Math.round(cardWidth * 1.45);

  return (
    <TouchableOpacity
      style={[shelfStyles.card, { width: cardWidth }]}
      onPress={onView}
      activeOpacity={0.85}
    >
      <View style={[shelfStyles.coverWrap, { height: coverHeight }]}>
        {item.imagemCapa ? (
          <Image source={{ uri: item.imagemCapa }} style={shelfStyles.coverImg} resizeMode="cover" />
        ) : (
          <View style={[shelfStyles.coverPlaceholder, { backgroundColor: color + '22' }]}>
            <MaterialCommunityIcons name="book-open-page-variant" size={Math.max(28, Math.round(cardWidth * 0.28))} color={color} />
            <Text style={[shelfStyles.placeholderCurso, { color, fontSize: Math.max(9, Math.round(cardWidth * 0.075)) }]} numberOfLines={2}>
              {item.curso}
            </Text>
          </View>
        )}
        <View style={[shelfStyles.cursoBadge, { backgroundColor: color + 'dd' }]}>
          <Text style={shelfStyles.cursoBadgeText} numberOfLines={1}>{item.anoConclusao}</Text>
        </View>
        {item.visitas > 0 && (
          <View style={shelfStyles.visitasBadge}>
            <Ionicons name="eye" size={10} color="#fff" />
            <Text style={shelfStyles.visitasBadgeText}>{item.visitas}</Text>
          </View>
        )}
        {canWrite && (
          <View style={shelfStyles.actionsOverlay}>
            <TouchableOpacity style={shelfStyles.overlayBtn} onPress={onEdit} hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}>
              <Ionicons name="pencil" size={13} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity style={[shelfStyles.overlayBtn, { backgroundColor: '#EF535088' }]} onPress={onDelete} hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}>
              <Ionicons name="trash" size={13} color="#fff" />
            </TouchableOpacity>
          </View>
        )}
      </View>
      <View style={shelfStyles.titleWrap}>
        <Text style={[shelfStyles.titleText, { fontSize: Math.max(10, Math.round(cardWidth * 0.085)) }]} numberOfLines={2}>
          {item.titulo}
        </Text>
        <Text style={[shelfStyles.autorText, { fontSize: Math.max(9, Math.round(cardWidth * 0.072)) }]} numberOfLines={1}>
          {item.autor}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

function BookShelf({ items, numCols, cardWidth, canWrite, onEdit, onDelete, onView }: {
  items: TrabalhoFinal[];
  numCols: number;
  cardWidth: number;
  canWrite: boolean;
  onEdit: (item: TrabalhoFinal) => void;
  onDelete: (id: string) => void;
  onView: (item: TrabalhoFinal) => void;
}) {
  const rows: TrabalhoFinal[][] = [];
  for (let i = 0; i < items.length; i += numCols) {
    rows.push(items.slice(i, i + numCols));
  }

  return (
    <View style={shelfStyles.bookcase}>
      {rows.map((row, rowIdx) => (
        <View key={rowIdx} style={shelfStyles.shelfRow}>
          <View style={shelfStyles.booksRow}>
            {row.map(item => (
              <ShelfCard
                key={item.id}
                item={item}
                cardWidth={cardWidth}
                canWrite={canWrite}
                onEdit={() => onEdit(item)}
                onDelete={() => onDelete(item.id)}
                onView={() => onView(item)}
              />
            ))}
            {Array.from({ length: numCols - row.length }).map((_, i) => (
              <View key={`spacer-${i}`} style={{ width: cardWidth }} />
            ))}
          </View>
          <View style={shelfStyles.plank}>
            <View style={shelfStyles.plankEdge} />
          </View>
        </View>
      ))}
    </View>
  );
}

function DetailModal({ item, onClose, canWrite, onEdit }: {
  item: TrabalhoFinal | null;
  onClose: () => void;
  canWrite: boolean;
  onEdit: () => void;
}) {
  if (!item) return null;
  const color = cursoColor(item.curso);
  return (
    <Modal visible={!!item} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
      <View style={dStyles.overlay}>
        <View style={dStyles.sheet}>
          <View style={dStyles.header}>
            <Text style={dStyles.headerTitle} numberOfLines={2}>{item.titulo}</Text>
            <TouchableOpacity onPress={onClose}><Ionicons name="close" size={22} color="#fff" /></TouchableOpacity>
          </View>
          <ScrollView style={dStyles.body}>
            <View style={dStyles.coverContainer}>
              {item.imagemCapa ? (
                <Image source={{ uri: item.imagemCapa }} style={dStyles.cover} resizeMode="cover" />
              ) : (
                <View style={[dStyles.coverPlaceholder, { backgroundColor: color + '22' }]}>
                  <MaterialCommunityIcons name="book-open-page-variant" size={64} color={color} />
                  <Text style={[dStyles.coverPlaceholderText, { color }]}>Sem imagem de capa</Text>
                </View>
              )}
            </View>

            <View style={dStyles.metaRow}>
              <View style={[dStyles.cursoBadge, { backgroundColor: color + '22', borderColor: color + '55' }]}>
                <Text style={[dStyles.cursoText, { color }]}>{item.curso}{tem13 ? ' — 13ª Classe' : ''}</Text>
              </View>
              <View style={dStyles.visitasBox}>
                <Ionicons name="eye" size={15} color="#FFA726" />
                <Text style={dStyles.visitasNum}>{item.visitas || 0}</Text>
                <Text style={dStyles.visitasLabel}>visita{(item.visitas || 0) !== 1 ? 's' : ''}</Text>
              </View>
            </View>

            <View style={dStyles.infoGrid}>
              <View style={dStyles.infoItem}>
                <Text style={dStyles.infoLabel}>Autor</Text>
                <Text style={dStyles.infoValue}>{item.autor}</Text>
              </View>
              <View style={dStyles.infoItem}>
                <Text style={dStyles.infoLabel}>Orientador</Text>
                <Text style={dStyles.infoValue}>{item.orientador}</Text>
              </View>
              <View style={dStyles.infoItem}>
                <Text style={dStyles.infoLabel}>Ano de Conclusão</Text>
                <Text style={dStyles.infoValue}>{item.anoConclusao}</Text>
              </View>
            </View>

            {!!item.resumo && (
              <View style={dStyles.resumoBox}>
                <Text style={dStyles.resumoLabel}>Resumo / Descrição</Text>
                <Text style={dStyles.resumoText}>{item.resumo}</Text>
              </View>
            )}
          </ScrollView>
          {canWrite && (
            <View style={dStyles.footer}>
              <TouchableOpacity style={dStyles.editBtn} onPress={onEdit}>
                <Ionicons name="pencil" size={16} color="#fff" />
                <Text style={dStyles.editBtnText}>Editar</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
          </KeyboardAvoidingView>
</Modal>
  );
}

function TrabalhoModal({ visible, item, onClose, onSaved }: {
  visible: boolean;
  item: TrabalhoFinal | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { showToast } = useToast();
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [form, setForm] = useState({
    titulo: '',
    autor: '',
    orientador: '',
    anoConclusao: String(new Date().getFullYear()),
    curso: 'Informática',
    imagemCapa: '',
    resumo: '',
  });

  useEffect(() => {
    if (item) {
      setForm({
        titulo: item.titulo,
        autor: item.autor,
        orientador: item.orientador,
        anoConclusao: String(item.anoConclusao),
        curso: item.curso,
        imagemCapa: item.imagemCapa || '',
        resumo: item.resumo || '',
      });
    } else {
      setForm({
        titulo: '',
        autor: '',
        orientador: '',
        anoConclusao: String(new Date().getFullYear()),
        curso: 'Informática',
        imagemCapa: '',
        resumo: '',
      });
    }
  }, [item, visible]);

  const upd = (k: keyof typeof form) => (v: string) => setForm(f => ({ ...f, [k]: v }));

  const handlePickImage = async () => {
    if (Platform.OS === 'web') {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.onchange = async (e: any) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setUploading(true);
        try {
          const fd = new FormData();
          fd.append('file', file);
          const tok = await getAuthToken();
          const res = await fetch('/api/upload', {
            method: 'POST',
            body: fd,
            credentials: 'include',
            headers: tok ? { Authorization: `Bearer ${tok}` } : undefined,
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data?.error || 'Erro ao carregar imagem');
          setForm(f => ({ ...f, imagemCapa: data.url }));
          showToast('Imagem carregada com sucesso.', 'success');
        } catch (err) {
          showToast((err as Error).message, 'error');
        } finally {
          setUploading(false);
        }
      };
      input.click();
    } else {
      showToast('Cole o URL da imagem no campo abaixo.', 'info');
    }
  };

  const save = async () => {
    if (!form.titulo.trim() || !form.autor.trim() || !form.orientador.trim() || !form.curso) {
      showToast('Tema, autor, orientador e curso são obrigatórios.', 'error');
      return;
    }
    const ano = parseInt(form.anoConclusao);
    if (isNaN(ano) || ano < 1990 || ano > new Date().getFullYear() + 1) {
      showToast('Ano de conclusão inválido.', 'error');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        titulo: form.titulo.trim(),
        autor: form.autor.trim(),
        orientador: form.orientador.trim(),
        anoConclusao: ano,
        curso: form.curso,
        imagemCapa: form.imagemCapa.trim() || null,
        resumo: form.resumo.trim(),
      };
      if (item) {
        await req(`/api/trabalhos-finais/${item.id}`, { method: 'PUT', body: JSON.stringify(payload) });
        showToast('Trabalho actualizado com sucesso.', 'success');
      } else {
        await req('/api/trabalhos-finais', { method: 'POST', body: JSON.stringify(payload) });
        showToast('Trabalho registado com sucesso.', 'success');
      }
      onSaved();
    } catch (e) {
      showToast((e as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const color = cursoColor(form.curso);

  useEnterToSave(save, visible);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
      <View style={mStyles.overlay}>
        <View style={mStyles.sheet}>
          <View style={mStyles.header}>
            <Text style={mStyles.headerTitle}>{item ? 'Editar Trabalho' : 'Registar Trabalho Final'}</Text>
            <TouchableOpacity onPress={onClose}><Ionicons name="close" size={22} color="#fff" /></TouchableOpacity>
          </View>
          <ScrollView style={mStyles.body} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 20 }}>

            <MLabel>Tema / Título *</MLabel>
            <MInput value={form.titulo} onChangeText={upd('titulo')} placeholder="Título do trabalho final" multiline style={{ height: 64, textAlignVertical: 'top' }} />

            <MLabel>Autor (Nome do Aluno) *</MLabel>
            <MInput value={form.autor} onChangeText={upd('autor')} placeholder="Nome completo do autor" returnKeyType="done" onSubmitEditing={save} />

            <MLabel>Orientador *</MLabel>
            <MInput value={form.orientador} onChangeText={upd('orientador')} placeholder="Nome do professor orientador" returnKeyType="done" onSubmitEditing={save} />

            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <MLabel>Ano de Conclusão *</MLabel>
                <MInput value={form.anoConclusao} onChangeText={upd('anoConclusao')} placeholder="Ex: 2024" keyboardType="numeric" maxLength={4} returnKeyType="done" onSubmitEditing={save} />
              </View>
            </View>

            <MLabel>Curso Técnico Profissional *</MLabel>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
              {CURSOS.filter(c => c !== 'Todos').map(c => (
                <TouchableOpacity
                  key={c}
                  style={[mStyles.chip, form.curso === c && { backgroundColor: cursoColor(c), borderColor: cursoColor(c) }]}
                  onPress={() => setForm(f => ({ ...f, curso: c }))}
                >
                  <Text style={[mStyles.chipText, form.curso === c && { color: '#fff' }]}>{c}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <MLabel>Imagem da Capa</MLabel>
            <TouchableOpacity style={mStyles.imagePickerBtn} onPress={handlePickImage} disabled={uploading}>
              {uploading ? (
                <AppLoader color="#5E6AD2" size="small" />
              ) : (
                <>
                  <Ionicons name="image-outline" size={18} color="#5E6AD2" />
                  <Text style={mStyles.imagePickerText}>{form.imagemCapa ? 'Alterar Imagem' : 'Seleccionar Imagem da Capa'}</Text>
                </>
              )}
            </TouchableOpacity>
            {!!form.imagemCapa && (
              <View style={mStyles.imagePreviewContainer}>
                <Image source={{ uri: form.imagemCapa }} style={mStyles.imagePreview} resizeMode="cover" />
                <TouchableOpacity style={mStyles.removeImageBtn} onPress={() => setForm(f => ({ ...f, imagemCapa: '' }))}>
                  <Ionicons name="close-circle" size={22} color="#EF5350" />
                </TouchableOpacity>
              </View>
            )}
            <MLabel>URL da imagem (opcional)</MLabel>
            <MInput value={form.imagemCapa} onChangeText={upd('imagemCapa')} placeholder="https://... ou cole aqui o link da imagem" />

            <MLabel>Resumo / Descrição</MLabel>
            <MInput value={form.resumo} onChangeText={upd('resumo')} placeholder="Breve resumo do trabalho..." multiline style={{ height: 90, textAlignVertical: 'top' }} />
          </ScrollView>
          <View style={mStyles.footer}>
            <TouchableOpacity style={mStyles.cancelBtn} onPress={onClose}>
              <Text style={{ color: '#aaa', fontWeight: '600' }}>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity style={mStyles.saveBtn} onPress={save} disabled={saving}>
              {saving ? <AppLoader color="#fff" size="small" /> : (
                <Text style={{ color: '#fff', fontWeight: '700' }}>{item ? 'Guardar' : 'Registar'}</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
          </KeyboardAvoidingView>
</Modal>
  );
}

function MLabel({ children }: { children: React.ReactNode }) {
  return <Text style={mStyles.label}>{children}</Text>;
}

function MInput(props: React.ComponentProps<typeof TextInput>) {
  return (
    <TextInput
      {...props}
      style={[mStyles.input, props.style]}
      placeholderTextColor="#555"
    />
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0D1F35' },
  searchRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', paddingHorizontal: 16, paddingVertical: 10, gap: 10 },
  searchBox: { flex: 1, minWidth: 180, flexDirection: 'row', alignItems: 'center', backgroundColor: '#1a2a4a', borderRadius: 10, paddingHorizontal: 12, gap: 8, height: 44 },
  searchInput: { flex: 1, color: '#fff', fontSize: 16, fontFamily: 'Inter_400Regular' },
  addBtn: { flexShrink: 0, flexDirection: 'row', alignItems: 'center', gap: 6, height: 44, paddingHorizontal: 16, borderRadius: 22, backgroundColor: '#5E6AD2' },
  addBtnTxt: { color: '#fff', fontSize: 13, fontFamily: 'Inter_700Bold' },
  filterScroll: { marginBottom: 6, maxHeight: 44 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: '#1a2a4a', borderWidth: 1, borderColor: '#253a5e' },
  chipActive: { backgroundColor: '#5E6AD2', borderColor: '#5E6AD2' },
  chipText: { color: '#aaa', fontSize: 13, fontFamily: 'Inter_500Medium' },
  anoChip: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 16, backgroundColor: '#1a2a4a', borderWidth: 1, borderColor: '#253a5e' },
  anoChipActive: { backgroundColor: '#243a6a', borderColor: '#5E6AD2' },
  anoChipText: { color: '#aaa', fontSize: 12, fontFamily: 'Inter_500Medium' },
  countRow: { paddingHorizontal: 16, paddingVertical: 4 },
  countText: { color: '#666', fontSize: 12, fontFamily: 'Inter_400Regular' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyBox: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60, gap: 12 },
  emptyText: { color: '#aaa', fontSize: 16, fontFamily: 'Inter_500Medium' },
  emptySub: { color: '#666', fontSize: 13, fontFamily: 'Inter_400Regular' },
  card: {
    backgroundColor: '#111f3d',
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#1e3055',
    marginBottom: 2,
  },
  cardImageContainer: { position: 'relative' },
  cardImage: { width: '100%', height: 160 },
  cardImagePlaceholder: { width: '100%', height: 160, alignItems: 'center', justifyContent: 'center' },
  cursoBadge: { position: 'absolute', bottom: 8, left: 8, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  cursoBadgeText: { color: '#fff', fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  cardBody: { padding: 12, gap: 4 },
  cardTitulo: { color: '#fff', fontSize: 14, fontFamily: 'Inter_600SemiBold', lineHeight: 20 },
  cardMeta: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  cardMetaText: { color: '#aaa', fontSize: 12, fontFamily: 'Inter_400Regular', flex: 1 },
  cardFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 },
  anoBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#1a2a4a', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  anoText: { color: '#5E6AD2', fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  cardActions: { flexDirection: 'row', gap: 6 },
  actionBtn: { width: 30, height: 30, borderRadius: 8, backgroundColor: '#1a2a4a', alignItems: 'center', justifyContent: 'center' },
  visitasBadge: { position: 'absolute', top: 8, right: 8, flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: 'rgba(0,0,0,0.65)', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 10 },
  visitasBadgeText: { color: '#fff', fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  topBox: { backgroundColor: '#111f3d', borderRadius: 14, borderWidth: 1, borderColor: '#1e3055', padding: 14, marginBottom: 12 },
  topHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  topTitle: { color: '#FFA726', fontSize: 14, fontFamily: 'Inter_700Bold' },
  topItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#1a2a4a' },
  topMedal: { fontSize: 20, width: 28, textAlign: 'center' },
  topInfo: { flex: 1 },
  topItemTitle: { color: '#fff', fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  topItemAutor: { color: '#888', fontSize: 12, fontFamily: 'Inter_400Regular' },
  topVisitasBox: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#FFA72622', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  topVisitasNum: { color: '#FFA726', fontSize: 13, fontFamily: 'Inter_700Bold' },
});

const dStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  sheet: { backgroundColor: '#0e1e3d', borderRadius: 18, width: '100%', maxWidth: 520, maxHeight: '92%', overflow: 'hidden' },
  header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', padding: 20, paddingBottom: 16, backgroundColor: '#0a1830', gap: 12 },
  headerTitle: { flex: 1, color: '#fff', fontSize: 16, fontFamily: 'Inter_700Bold', lineHeight: 22 },
  body: { flex: 1, padding: 20 },
  coverContainer: { alignItems: 'center', marginBottom: 16 },
  cover: { width: 180, height: 250, borderRadius: 12 },
  coverPlaceholder: { width: 180, height: 250, borderRadius: 12, alignItems: 'center', justifyContent: 'center', gap: 12 },
  coverPlaceholderText: { fontSize: 13, fontFamily: 'Inter_500Medium' },
  cursoBadge: { alignSelf: 'center', paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, borderWidth: 1, marginBottom: 20 },
  cursoText: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  infoGrid: { gap: 14, marginBottom: 16 },
  infoItem: { gap: 3 },
  infoLabel: { color: '#666', fontSize: 12, fontFamily: 'Inter_400Regular', textTransform: 'uppercase', letterSpacing: 0.5 },
  infoValue: { color: '#fff', fontSize: 15, fontFamily: 'Inter_500Medium' },
  metaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, gap: 10 },
  visitasBox: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#FFA72620', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12, borderWidth: 1, borderColor: '#FFA72633' },
  visitasNum: { color: '#FFA726', fontSize: 18, fontFamily: 'Inter_700Bold' },
  visitasLabel: { color: '#FFA726', fontSize: 12, fontFamily: 'Inter_400Regular' },
  resumoBox: { backgroundColor: '#1a2a4a', borderRadius: 10, padding: 14, gap: 6 },
  resumoLabel: { color: '#888', fontSize: 12, fontFamily: 'Inter_600SemiBold', textTransform: 'uppercase', letterSpacing: 0.5 },
  resumoText: { color: '#ccc', fontSize: 14, fontFamily: 'Inter_400Regular', lineHeight: 20 },
  footer: { padding: 16, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#1a2a4a' },
  editBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#5E6AD2', borderRadius: 10, paddingVertical: 12 },
  editBtnText: { color: '#fff', fontSize: 15, fontFamily: 'Inter_600SemiBold' },
});

const shelfStyles = StyleSheet.create({
  scrollContent: {
    padding: 16,
    paddingBottom: 120,
  },
  bookcase: {
    gap: 0,
  },
  shelfRow: {
    marginBottom: 6,
  },
  booksRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-end',
    gap: 10,
    paddingHorizontal: 0,
  },
  plank: {
    height: 16,
    backgroundColor: '#2c1f10',
    borderTopWidth: 3,
    borderTopColor: '#6b4c2a',
    borderBottomWidth: 2,
    borderBottomColor: '#140e06',
    marginTop: 4,
    marginBottom: 12,
    borderRadius: 2,
  },
  plankEdge: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: '#a87040',
    opacity: 0.35,
    borderRadius: 2,
  },
  card: {
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#0d1120',
  },
  coverWrap: { width: '100%', position: 'relative' },
  coverImg: { width: '100%', height: '100%' },
  coverPlaceholder: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    padding: 6,
  },
  placeholderCurso: {
    fontFamily: 'Inter_600SemiBold',
    textAlign: 'center',
    lineHeight: 14,
  },
  cursoBadge: {
    position: 'absolute',
    bottom: 6,
    left: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  cursoBadgeText: { color: '#fff', fontSize: 10, fontFamily: 'Inter_700Bold' },
  visitasBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(0,0,0,0.65)',
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 8,
  },
  visitasBadgeText: { color: '#fff', fontSize: 10, fontFamily: 'Inter_600SemiBold' },
  actionsOverlay: {
    position: 'absolute',
    top: 6,
    left: 6,
    flexDirection: 'column',
    gap: 4,
  },
  overlayBtn: {
    width: 26,
    height: 26,
    borderRadius: 7,
    backgroundColor: 'rgba(94,106,210,0.80)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleWrap: {
    padding: 8,
    gap: 3,
    backgroundColor: '#111f3d',
  },
  titleText: {
    color: '#e8eaf6',
    fontFamily: 'Inter_600SemiBold',
    lineHeight: 15,
  },
  autorText: {
    color: '#7986cb',
    fontFamily: 'Inter_400Regular',
  },
});

const mStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  sheet: { backgroundColor: '#0e1e3d', borderRadius: 18, width: '100%', maxWidth: 520, maxHeight: '94%', overflow: 'hidden' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, paddingBottom: 16, backgroundColor: '#0a1830' },
  headerTitle: { color: '#fff', fontSize: 17, fontFamily: 'Inter_700Bold', flex: 1 },
  body: { flex: 1, paddingHorizontal: 20, paddingTop: 16 },
  label: { color: '#aaa', fontSize: 12, fontFamily: 'Inter_500Medium', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  input: { backgroundColor: '#1a2a4a', color: '#fff', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, fontSize: 14, fontFamily: 'Inter_400Regular', marginBottom: 14, borderWidth: 1, borderColor: '#253a5e' },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, backgroundColor: '#1a2a4a', borderWidth: 1, borderColor: '#253a5e' },
  chipText: { color: '#aaa', fontSize: 13, fontFamily: 'Inter_500Medium' },
  imagePickerBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: '#5E6AD2', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 12, justifyContent: 'center' },
  imagePickerText: { color: '#5E6AD2', fontSize: 14, fontFamily: 'Inter_500Medium' },
  imagePreviewContainer: { position: 'relative', alignSelf: 'center', marginBottom: 12 },
  imagePreview: { width: 120, height: 160, borderRadius: 10 },
  removeImageBtn: { position: 'absolute', top: -8, right: -8 },
  footer: { flexDirection: 'row', padding: 16, gap: 10, borderTopWidth: 1, borderTopColor: '#1a2a4a' },
  cancelBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 13, borderRadius: 10, backgroundColor: '#1a2a4a' },
  saveBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 13, borderRadius: 10, backgroundColor: '#5E6AD2' },
});
