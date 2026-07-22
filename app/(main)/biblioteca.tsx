import React, { useState, useEffect, useCallback, useRef } from 'react';
import {FlatList, Image, KeyboardAvoidingView, Modal, Platform, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View, useWindowDimensions} from 'react-native';
import AppLoader from '@/components/AppLoader';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { Colors } from '@/constants/colors';
import DateInput from '@/components/DateInput';
import TopBar from '@/components/TopBar';
import { SkeletonList } from '@/components/Skeleton';
import { useToast } from '@/context/ToastContext';
import { useAuth, getAuthToken } from '@/context/AuthContext';
import { usePermissoes } from '@/context/PermissoesContext';
import { StableSearchInput } from '@/components/StableSearchInput';

import { HScrollTabBar } from '@/components/HScrollTabBar';
import { useTabMemory } from '@/hooks/useTabMemory';
// ─── Types ───────────────────────────────────────────────────────────────────
interface Livro {
  id: string;
  titulo: string;
  autor: string;
  isbn: string;
  categoria: string;
  editora: string;
  anoPublicacao: number | null;
  quantidadeTotal: number;
  quantidadeDisponivel: number;
  localizacao: string;
  descricao: string;
  capaUrl: string;
  ativo: boolean;
  createdAt: string;
}

interface Emprestimo {
  id: string;
  livroId: string;
  livroTitulo: string;
  alunoId: string | null;
  nomeLeitor: string;
  tipoLeitor: string;
  dataEmprestimo: string;
  dataPrevistaDevolucao: string;
  dataDevolucao: string | null;
  status: 'emprestado' | 'devolvido' | 'atrasado';
  observacao: string | null;
  registadoPor: string;
  createdAt: string;
}

interface Solicitacao {
  id: string;
  livroId: string;
  livroTitulo: string;
  alunoId: string | null;
  nomeLeitor: string;
  tipoLeitor: string;
  diasSolicitados: number;
  status: 'pendente' | 'aprovado' | 'rejeitado';
  motivoRejeicao: string | null;
  registadoPor: string;
  createdAt: string;
}

interface DesejosLivro {
  id: string;
  titulo: string;
  autor: string;
  motivo: string;
  alunoId: string | null;
  nomeLeitor: string;
  status: 'pendente' | 'adquirido' | 'rejeitado';
  registadoPor: string;
  createdAt: string;
}

const TIPOS_LEITOR = ['aluno', 'professor', 'funcionário', 'externo'];

async function req<T = unknown>(url: string, opts?: RequestInit): Promise<T> {
  const tok = await getAuthToken();
  const r = await fetch(url, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(tok ? { Authorization: `Bearer ${tok}` } : {}),
      ...opts?.headers,
    },
    credentials: 'include',
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data?.error || 'Erro de servidor');
  return data as T;
}

function fmtDate(d: string) {
  if (!d) return '—';
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? d : dt.toLocaleDateString('pt-PT');
}

function diasAtraso(dataPrevista: string): number {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const prev = new Date(dataPrevista);
  return Math.floor((hoje.getTime() - prev.getTime()) / 86400000);
}

function catColor(cat: string) {
  const map: Record<string, string> = {
    'Matemática': '#5E6AD2', 'Ciências': '#26A69A', 'Língua Portuguesa': '#FF7043',
    'História': '#AB47BC', 'Geografia': '#42A5F5', 'Física': '#FFA726',
    'Química': '#EF5350', 'Biologia': '#66BB6A', 'Literatura': '#EC407A',
    'Filosofia': '#7E57C2', 'Informática': '#29B6F6', 'Inglês': '#FF7139',
    'Geral': '#888',
  };
  return map[cat] || '#888';
}

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

// ─── Main Screen ─────────────────────────────────────────────────────────────
export default function BibliotecaScreen() {
  const [tab, setTab] = useState<'catalogo' | 'emprestimos' | 'desejos' | 'stats' | 'presencas'>('catalogo');
  const [livros, setLivros] = useState<Livro[]>([]);
  const [emprestimos, setEmprestimos] = useState<Emprestimo[]>([]);
  const [solicitacoes, setSolicitacoes] = useState<Solicitacao[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const { showToast } = useToast();
  const { user, isLoading: authLoading } = useAuth();
  const { hasPermission } = usePermissoes();
  const canManage = hasPermission('biblioteca_gestao');

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      if (canManage) {
        await req('/api/emprestimos/sync-atrasos', { method: 'POST' }).catch(() => {});
      }
      const [ls, es] = await Promise.all([
        req<Livro[]>('/api/livros'),
        req<Emprestimo[]>('/api/emprestimos'),
      ]);
      setLivros(ls);
      setEmprestimos(es);
      if (canManage) {
        const sols = await req<Solicitacao[]>('/api/solicitacoes-emprestimo?status=pendente');
        setSolicitacoes(sols);
      }
    } catch (e) {
      showToast((e as Error).message, 'error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [canManage]);

  useEffect(() => {
    if (!authLoading) load();
  }, [load, authLoading]);

  const onRefresh = () => { setRefreshing(true); load(true); };

  const ativos = emprestimos.filter(e => e.status === 'emprestado' || e.status === 'atrasado');
  const atrasados = emprestimos.filter(e => e.status === 'atrasado');
  const devolvidos = emprestimos.filter(e => e.status === 'devolvido');
  const totalLivros = livros.reduce((s, l) => s + l.quantidadeTotal, 0);
  const totalDisp = livros.reduce((s, l) => s + l.quantidadeDisponivel, 0);
  const totalEmprestados = totalLivros - totalDisp;
  const pendentesCount = solicitacoes.length;

  const tabs = [
    { key: 'catalogo', label: 'Catálogo', icon: 'library' },
    { key: 'emprestimos', label: 'Empréstimos', icon: 'swap-horizontal',
      badge: atrasados.length + (canManage ? pendentesCount : 0) },
    { key: 'presencas', label: 'Presenças', icon: 'people' },
    { key: 'desejos', label: 'Desejos', icon: 'heart' },
    { key: 'stats', label: 'Relatórios', icon: 'bar-chart' },
  ] as const;

  return (
    <View style={styles.root}>
      <TopBar title="Biblioteca Escolar" subtitle="Gestão de livros e empréstimos" />

      <HScrollTabBar style={styles.tabBar} contentContainerStyle={{ flexDirection: 'row' }} keyboardShouldPersistTaps="handled">
        {tabs.map(t => (
          <TouchableOpacity
            key={t.key}
            style={[styles.tab, tab === t.key && styles.tabActive]}
            onPress={() => setTab(t.key)}
          >
            <Ionicons name={t.icon as any} size={16} color={tab === t.key ? '#5E6AD2' : '#666'} />
            <Text style={[styles.tabLabel, tab === t.key && styles.tabLabelActive]}>{t.label}</Text>
            {'badge' in t && (t as any).badge > 0 && (
              <View style={styles.badge}><Text style={styles.badgeText}>{(t as any).badge}</Text></View>
            )}
          </TouchableOpacity>
        ))}
      </HScrollTabBar>

      {loading ? (
        <View style={{ padding: 12 }}>
          <SkeletonList rows={6} withAvatar />
        </View>
      ) : (
        <>
          {tab === 'catalogo' && (
            <CatalogoTab
              livros={livros}
              canManage={canManage}
              user={user}
              onReload={() => load(true)}
              refreshing={refreshing}
              onRefresh={onRefresh}
            />
          )}
          {tab === 'emprestimos' && (
            <EmprestimosTab
              emprestimos={emprestimos}
              livros={livros}
              solicitacoes={solicitacoes}
              canManage={canManage}
              user={user}
              onReload={() => load(true)}
              refreshing={refreshing}
              onRefresh={onRefresh}
            />
          )}
          {tab === 'presencas' && (
            <PresencasTab
              user={user}
              refreshing={refreshing}
              onRefresh={onRefresh}
            />
          )}
          {tab === 'desejos' && (
            <DesejosTab
              canManage={canManage}
              user={user}
              refreshing={refreshing}
              onRefresh={onRefresh}
            />
          )}
          {tab === 'stats' && (
            <StatsTab
              livros={livros}
              emprestimos={emprestimos}
              totalLivros={totalLivros}
              totalDisp={totalDisp}
              totalEmprestados={totalEmprestados}
              atrasados={atrasados}
              devolvidos={devolvidos}
              refreshing={refreshing}
              onRefresh={onRefresh}
            />
          )}
        </>
      )}
    </View>
  );
}

// ─── Catálogo Tab ─────────────────────────────────────────────────────────────
function CatalogoTab({ livros, canManage, user, onReload, refreshing, onRefresh }: {
  livros: Livro[];
  canManage: boolean;
  user: any;
  onReload: () => void;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  const { showToast } = useToast();
  const { width: winWidth } = useWindowDimensions();
  const [containerWidth, setContainerWidth] = useState(winWidth);
  const [search, setSearch] = useState('');
  const [catFiltro, setCatFiltro] = useState('Todas');
  const [showModal, setShowModal] = useState(false);
  const [editLivro, setEditLivro] = useState<Livro | null>(null);
  const [detailLivro, setDetailLivro] = useState<Livro | null>(null);
  const [solicitarLivro, setSolicitarLivro] = useState<Livro | null>(null);
  const [showCatModal, setShowCatModal] = useState(false);

  const cats = ['Todas', ...Array.from(new Set(livros.map(l => l.categoria))).sort()];

  // Use measured container width for accurate column/card sizing
  const usableWidth = containerWidth || winWidth;
  const numCols = usableWidth >= 1100 ? 7 : usableWidth >= 800 ? 6 : usableWidth >= 600 ? 5 : usableWidth >= 420 ? 4 : 3;
  const padding = 12;
  const gap = 8;
  const cardWidth = Math.floor((usableWidth - padding * 2 - gap * (numCols - 1)) / numCols);

  const livrosAtivos = livros.filter(l => l.ativo !== false);
  const livrosInativos = livros.filter(l => l.ativo === false);

  const filtered = livrosAtivos.filter(l => {
    const q = search.toLowerCase();
    const matchSearch = !q || l.titulo.toLowerCase().includes(q) || l.autor.toLowerCase().includes(q) || l.isbn.includes(q);
    const matchCat = catFiltro === 'Todas' || (l.categoria || '').trim() === catFiltro.trim();
    return matchSearch && matchCat;
  });

  return (
    <View style={styles.flex} onLayout={(e) => setContainerWidth(e.nativeEvent.layout.width)}>
      {/* Search + Add */}
      <View style={styles.searchRow}>
        <View style={styles.searchBox}>
          <StableSearchInput
            value={search}
            onChangeText={setSearch}
            inputStyle={styles.searchInput}
            placeholder="Pesquisar título, autor, ISBN…"
            iconColor="#666"
          />
        </View>
        <TouchableOpacity
          style={[styles.catFilterBtn, catFiltro !== 'Todas' && styles.catFilterBtnActive]}
          onPress={() => setShowCatModal(true)}
        >
          <Ionicons name="pricetag-outline" size={14} color={catFiltro !== 'Todas' ? '#fff' : '#aaa'} />
          <Text style={[styles.catFilterBtnText, catFiltro !== 'Todas' && { color: '#fff' }]} numberOfLines={1}>
            {catFiltro === 'Todas' ? 'Categoria' : catFiltro}
          </Text>
          {catFiltro !== 'Todas' && (
            <TouchableOpacity onPress={() => setCatFiltro('Todas')} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
              <Ionicons name="close-circle" size={14} color="#fff" />
            </TouchableOpacity>
          )}
        </TouchableOpacity>
        {canManage && (
          <TouchableOpacity style={styles.addBtn} onPress={() => { setEditLivro(null); setShowModal(true); }}>
            <Ionicons name="add" size={16} color="#fff" />
            <Text style={styles.addBtnTxt}>Novo Livro</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Count bar */}
      <View style={shelfStyles.countBar}>
        <Text style={shelfStyles.countText}>
          {filtered.length} livro{filtered.length !== 1 ? 's' : ''}
          {catFiltro !== 'Todas' ? ` em "${catFiltro}"` : ' no catálogo'}
        </Text>
        <Text style={shelfStyles.totalText}>
          {livrosAtivos.reduce((s, l) => s + l.quantidadeTotal, 0)} exemplares activos
        </Text>
      </View>

      {livrosInativos.length > 0 && (
        <View style={styles.inactiveHint}>
          <Ionicons name="eye-off-outline" size={14} color="#F59E0B" />
          <Text style={styles.inactiveHintText}>
            {livrosInativos.length} livro{livrosInativos.length !== 1 ? 's' : ''} inativo{livrosInativos.length !== 1 ? 's' : ''} oculto{livrosInativos.length !== 1 ? 's' : ''}
          </Text>
        </View>
      )}

      {/* Category Picker Modal — centered */}
      <Modal visible={showCatModal} transparent animationType="fade" onRequestClose={() => setShowCatModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={centeredOverlay}>
          <View style={mStyles.sheet}>
            <View style={mStyles.header}>
              <View style={mStyles.headerLeft}>
                <Ionicons name="pricetag-outline" size={18} color="#5E6AD2" />
                <Text style={mStyles.headerTitle}>Filtrar por Categoria</Text>
              </View>
              <TouchableOpacity onPress={() => setShowCatModal(false)} style={mStyles.closeBtn}>
                <Ionicons name="close" size={20} color="#aaa" />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 420 }} contentContainerStyle={{ padding: 14, gap: 8 }} showsVerticalScrollIndicator={false}>
              {cats.map(c => {
                const isActive = catFiltro === c;
                const cc = c === 'Todas' ? '#5E6AD2' : catColor(c);
                return (
                  <TouchableOpacity
                    key={c}
                    style={[catPickerStyles.catRow, isActive && { borderColor: cc, backgroundColor: cc + '18' }]}
                    onPress={() => { setCatFiltro(c); setShowCatModal(false); }}
                  >
                    <View style={[catPickerStyles.catDot, { backgroundColor: isActive ? cc : '#444' }]} />
                    <Text style={[catPickerStyles.catLabel, isActive && { color: cc, fontWeight: '700' }]}>{c}</Text>
                    {c !== 'Todas' && (
                      <Text style={catPickerStyles.catCount}>
                        {livros.filter(l => l.categoria === c).length} livro{livros.filter(l => l.categoria === c).length !== 1 ? 's' : ''}
                      </Text>
                    )}
                    {isActive && <Ionicons name="checkmark-circle" size={18} color={cc} />}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </View>
              </KeyboardAvoidingView>
</Modal>

      {/* Bookshelf grid — ScrollView with shelf planks */}
      <ScrollView
        style={styles.flex}
        contentContainerStyle={{ padding, paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#5E6AD2" />}
        showsVerticalScrollIndicator={false}
      >
        {filtered.length === 0 ? (
          <View style={styles.emptyBox}>
            <Ionicons name="library-outline" size={48} color="#444" />
            <Text style={styles.emptyText}>Nenhum livro encontrado</Text>
            {canManage && <Text style={styles.emptySub}>Toque em + para adicionar o primeiro livro</Text>}
          </View>
        ) : (
          <View style={shelfStyles.bookcase}>
            {Array.from({ length: Math.ceil(filtered.length / numCols) }, (_, rowIdx) => {
              const row = filtered.slice(rowIdx * numCols, rowIdx * numCols + numCols);
              return (
                <View key={rowIdx} style={shelfStyles.shelfRow}>
                  <View style={shelfStyles.booksRow}>
                    {row.map(livro => (
                      <ShelfBookCard
                        key={livro.id}
                        livro={livro}
                        cardWidth={cardWidth}
                        onPress={() => setDetailLivro(livro)}
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
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* Book Detail Modal */}
      <BookDetailModal
        visible={!!detailLivro}
        livro={detailLivro}
        canManage={canManage}
        onClose={() => setDetailLivro(null)}
        onEdit={() => { setEditLivro(detailLivro); setDetailLivro(null); setShowModal(true); }}
        onSolicitar={() => { setSolicitarLivro(detailLivro); setDetailLivro(null); }}
      />

      <LivroModal
        visible={showModal}
        livro={editLivro}
        onClose={() => setShowModal(false)}
        onSaved={() => { setShowModal(false); onReload(); }}
      />

      <SolicitarModal
        visible={!!solicitarLivro}
        livro={solicitarLivro}
        user={user}
        onClose={() => setSolicitarLivro(null)}
        onSaved={() => {
          setSolicitarLivro(null);
          showToast('Pedido enviado! Aguarda aprovação da biblioteca.', 'success');
        }}
      />
    </View>
  );
}

// ─── Shelf Book Card (compact bookshelf style) ────────────────────────────────
function ShelfBookCard({ livro, cardWidth, onPress }: {
  livro: Livro;
  cardWidth: number;
  onPress: () => void;
}) {
  const coverHeight = Math.round(cardWidth * 1.45);
  const cc = catColor(livro.categoria);
  const available = livro.quantidadeDisponivel > 1; // needs >1 to allow borrowing
  const lastCopy = livro.quantidadeDisponivel === 1;
  const none = livro.quantidadeDisponivel === 0;
  const dotColor = none ? '#EF5350' : lastCopy ? '#FFA726' : '#66BB6A';

  return (
    <TouchableOpacity
      activeOpacity={0.82}
      onPress={onPress}
      style={[shelfStyles.card, { width: cardWidth }]}
    >
      {/* Book spine shadow + cover */}
      <View style={[shelfStyles.coverWrap, { height: coverHeight }]}>
        {livro.capaUrl ? (
          <Image source={{ uri: livro.capaUrl }} style={shelfStyles.coverImg} resizeMode="cover" />
        ) : (
          <View style={[shelfStyles.coverPlaceholder, { backgroundColor: cc + '28' }]}>
            <View style={[shelfStyles.spineAccent, { backgroundColor: cc }]} />
            <Ionicons name="book" size={Math.max(18, cardWidth * 0.28)} color={cc} style={{ opacity: 0.9 }} />
            <Text style={[shelfStyles.coverCatText, { color: cc, fontSize: Math.max(8, cardWidth * 0.1) }]} numberOfLines={3}>
              {livro.categoria}
            </Text>
          </View>
        )}
        {/* Availability dot */}
        <View style={[shelfStyles.availDot, { backgroundColor: dotColor }]} />
        {/* Last copy warning badge */}
        {lastCopy && (
          <View style={shelfStyles.lastCopyBadge}>
            <Text style={shelfStyles.lastCopyText}>!1</Text>
          </View>
        )}
      </View>
      {/* Tiny title below */}
      <View style={shelfStyles.titleWrap}>
        <Text style={[shelfStyles.titleText, { fontSize: Math.max(9, Math.min(11, cardWidth * 0.12)) }]} numberOfLines={2}>
          {livro.titulo}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

// ─── Book Detail Modal ────────────────────────────────────────────────────────
function BookDetailModal({ visible, livro, canManage, onClose, onEdit, onSolicitar }: {
  visible: boolean;
  livro: Livro | null;
  canManage: boolean;
  onClose: () => void;
  onEdit: () => void;
  onSolicitar: () => void;
}) {
  if (!livro) return null;
  const cc = catColor(livro.categoria);
  const canBorrow = livro.quantidadeDisponivel > 1;
  const lastCopy = livro.quantidadeDisponivel === 1;
  const none = livro.quantidadeDisponivel === 0;
  const dispColor = none ? '#EF5350' : lastCopy ? '#FFA726' : '#66BB6A';
  const dispLabel = none ? 'Esgotado' : `${livro.quantidadeDisponivel} disponível(is)`;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
      <View style={centeredOverlay}>
        <View style={[mStyles.sheet, { maxWidth: 520 }]}>
          <View style={mStyles.header}>
            <View style={mStyles.headerLeft}>
              <Ionicons name="book" size={18} color="#5E6AD2" />
              <Text style={mStyles.headerTitle} numberOfLines={1}>{livro.titulo}</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={mStyles.closeBtn}>
              <Ionicons name="close" size={20} color="#aaa" />
            </TouchableOpacity>
          </View>

          <ScrollView style={{ maxHeight: 500 }} contentContainerStyle={{ padding: 16 }} showsVerticalScrollIndicator={false}>
            {/* Cover + info row */}
            <View style={detailStyles.topRow}>
              <View style={detailStyles.coverBox}>
                {livro.capaUrl ? (
                  <Image source={{ uri: livro.capaUrl }} style={detailStyles.coverImg} resizeMode="cover" />
                ) : (
                  <View style={[detailStyles.coverPlaceholder, { backgroundColor: cc + '22' }]}>
                    <Ionicons name="book" size={40} color={cc} />
                  </View>
                )}
              </View>
              <View style={{ flex: 1, gap: 8 }}>
                <Text style={detailStyles.title}>{livro.titulo}</Text>
                <Text style={detailStyles.autor}>{livro.autor}</Text>
                {livro.editora ? <Text style={detailStyles.editora}>{livro.editora}</Text> : null}
                {livro.anoPublicacao ? <Text style={detailStyles.editora}>{livro.anoPublicacao}</Text> : null}

                {/* Categoria */}
                <View style={[detailStyles.catBadge, { backgroundColor: cc + '22', borderColor: cc + '44' }]}>
                  <View style={[detailStyles.catDot, { backgroundColor: cc }]} />
                  <Text style={[detailStyles.catText, { color: cc }]}>{livro.categoria}</Text>
                </View>

                {/* Stock */}
                <View style={detailStyles.stockRow}>
                  <View style={[detailStyles.stockBadge, { backgroundColor: dispColor + '22', borderColor: dispColor + '44' }]}>
                    <View style={[{ width: 7, height: 7, borderRadius: 4, backgroundColor: dispColor }]} />
                    <Text style={[detailStyles.stockText, { color: dispColor }]}>{dispLabel}</Text>
                  </View>
                  <Text style={detailStyles.stockTotal}>{livro.quantidadeTotal} no total</Text>
                </View>
              </View>
            </View>

            {/* ISBN & Location */}
            {(livro.isbn || livro.localizacao) ? (
              <View style={detailStyles.metaRow}>
                {livro.isbn ? (
                  <View style={detailStyles.metaItem}>
                    <Ionicons name="barcode-outline" size={13} color="#666" />
                    <Text style={detailStyles.metaText}>ISBN: {livro.isbn}</Text>
                  </View>
                ) : null}
                {livro.localizacao ? (
                  <View style={detailStyles.metaItem}>
                    <Ionicons name="location-outline" size={13} color="#666" />
                    <Text style={detailStyles.metaText}>{livro.localizacao}</Text>
                  </View>
                ) : null}
              </View>
            ) : null}

            {/* Description */}
            {livro.descricao ? (
              <View style={detailStyles.descBox}>
                <Text style={detailStyles.descLabel}>Sinopse</Text>
                <Text style={detailStyles.descText}>{livro.descricao}</Text>
              </View>
            ) : null}

            {/* Last copy warning */}
            {lastCopy && (
              <View style={detailStyles.warnBox}>
                <Ionicons name="warning" size={15} color="#FFA726" />
                <Text style={detailStyles.warnText}>
                  Último exemplar reservado para consulta em sala. Aguarde a devolução de um exemplar para empréstimo.
                </Text>
              </View>
            )}
            {none && (
              <View style={[detailStyles.warnBox, { backgroundColor: '#EF535011', borderColor: '#EF535033' }]}>
                <Ionicons name="close-circle" size={15} color="#EF5350" />
                <Text style={[detailStyles.warnText, { color: '#EF5350' }]}>
                  Sem exemplares disponíveis. Aguarde a devolução.
                </Text>
              </View>
            )}
          </ScrollView>

          <View style={mStyles.footer}>
            <TouchableOpacity style={mStyles.cancelBtn} onPress={onClose}>
              <Text style={{ color: '#aaa', fontWeight: '600' }}>Fechar</Text>
            </TouchableOpacity>
            {canManage ? (
              <TouchableOpacity style={mStyles.saveBtn} onPress={onEdit}>
                <Ionicons name="pencil" size={15} color="#fff" />
                <Text style={{ color: '#fff', fontWeight: '700', marginLeft: 6 }}>Editar</Text>
              </TouchableOpacity>
            ) : canBorrow ? (
              <TouchableOpacity style={mStyles.saveBtn} onPress={onSolicitar}>
                <Ionicons name="hand-right-outline" size={15} color="#fff" />
                <Text style={{ color: '#fff', fontWeight: '700', marginLeft: 6 }}>Solicitar Empréstimo</Text>
              </TouchableOpacity>
            ) : (
              <View style={[mStyles.saveBtn, { backgroundColor: '#333' }]}>
                <Ionicons name="time-outline" size={15} color="#888" />
                <Text style={{ color: '#888', fontWeight: '700', marginLeft: 6 }}>Indisponível</Text>
              </View>
            )}
          </View>
        </View>
      </View>
          </KeyboardAvoidingView>
</Modal>
  );
}

// ─── Solicitar Empréstimo Modal ───────────────────────────────────────────────
function SolicitarModal({ visible, livro, user, onClose, onSaved }: {
  visible: boolean;
  livro: Livro | null;
  user: any;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { showToast } = useToast();
  const [dias, setDias] = useState('14');
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (visible) setDias('14'); }, [visible]);

  const dayOptions = [7, 14, 21, 30];

  const save = async () => {
    if (!livro) return;
    const d = parseInt(dias);
    if (!d || d < 1 || d > 60) { showToast('Indique um número de dias válido (1–60).', 'error'); return; }
    setSaving(true);
    try {
      const nomeLeitor = user?.nome || 'Aluno';
      await req('/api/solicitacoes-emprestimo', {
        method: 'POST',
        body: JSON.stringify({
          livroId: livro.id,
          alunoId: user?.id || null,
          nomeLeitor,
          tipoLeitor: user?.role === 'professor' ? 'professor' : 'aluno',
          diasSolicitados: d,
          registadoPor: nomeLeitor,
        }),
      });
      onSaved();
    } catch (e) {
      showToast((e as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  };

  if (!livro) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
      <View style={centeredOverlay}>
        <View style={[mStyles.sheet, { maxHeight: 500 }]}>
          <View style={mStyles.header}>
            <Text style={mStyles.headerTitle}>Solicitar Empréstimo</Text>
            <TouchableOpacity onPress={onClose} style={mStyles.closeBtn}><Ionicons name="close" size={20} color="#aaa" /></TouchableOpacity>
          </View>

          <View style={{ padding: 20, gap: 16 }}>
            <View style={solStyles.bookPreview}>
              {livro.capaUrl ? (
                <Image source={{ uri: livro.capaUrl }} style={solStyles.previewImg} resizeMode="cover" />
              ) : (
                <View style={[solStyles.previewPlaceholder, { backgroundColor: catColor(livro.categoria) + '33' }]}>
                  <Ionicons name="book" size={28} color={catColor(livro.categoria)} />
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={solStyles.previewTitulo} numberOfLines={2}>{livro.titulo}</Text>
                <Text style={solStyles.previewAutor}>{livro.autor}</Text>
                <Text style={solStyles.previewDisp}>{livro.quantidadeDisponivel} exemplar(es) disponível(is)</Text>
              </View>
            </View>

            <View>
              <Text style={solStyles.daysLabel}>Quantos dias precisa?</Text>
              <View style={solStyles.dayBtns}>
                {dayOptions.map(d => (
                  <TouchableOpacity
                    key={d}
                    style={[solStyles.dayBtn, dias === String(d) && solStyles.dayBtnActive]}
                    onPress={() => setDias(String(d))}
                  >
                    <Text style={[solStyles.dayBtnText, dias === String(d) && { color: '#fff' }]}>{d}d</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TextInput
                style={solStyles.daysInput}
                value={dias}
                onChangeText={setDias}
                placeholder="Outro número de dias"
                placeholderTextColor="#555"
                keyboardType="numeric"
                maxLength={2}
                returnKeyType="done"
                onSubmitEditing={save}
              />
            </View>

            <View style={solStyles.infoBox}>
              <Ionicons name="information-circle-outline" size={16} color="#5E6AD2" />
              <Text style={solStyles.infoText}>
                O pedido será enviado à biblioteca para aprovação. Será notificado quando estiver pronto.
              </Text>
            </View>
          </View>

          <View style={mStyles.footer}>
            <TouchableOpacity style={mStyles.cancelBtn} onPress={onClose}>
              <Text style={{ color: '#aaa', fontWeight: '600' }}>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity style={mStyles.saveBtn} onPress={save} disabled={saving}>
              {saving
                ? <AppLoader color="#fff" size="small" />
                : <Text style={{ color: '#fff', fontWeight: '700' }}>Enviar Pedido</Text>
              }
            </TouchableOpacity>
          </View>
        </View>
      </View>
          </KeyboardAvoidingView>
</Modal>
  );
}

// ─── Livro Modal ──────────────────────────────────────────────────────────────
function LivroModal({ visible, livro, onClose, onSaved }: {
  visible: boolean; livro: Livro | null; onClose: () => void; onSaved: () => void;
}) {
  const { showToast } = useToast();
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [capaMode, setCapaMode] = useState<'upload' | 'url'>('upload');
  const [customCat, setCustomCat] = useState('');
  const [form, setForm] = useState({
    titulo: '', autor: '', isbn: '', categoria: 'Geral', editora: '',
    anoPublicacao: '', quantidadeTotal: '1', localizacao: '', descricao: '', capaUrl: '', ativo: true,
  });

  const PREDEFINED_CATS = ['Geral', 'Matemática', 'Ciências', 'Língua Portuguesa', 'História', 'Geografia',
    'Física', 'Química', 'Biologia', 'Literatura', 'Filosofia', 'Informática',
    'Inglês', 'Francês', 'Educação Física', 'Artes', 'Religião', 'Outros'];

  const isCustomCat = !PREDEFINED_CATS.includes(form.categoria);

  useEffect(() => {
    if (livro) {
      const isPredefined = PREDEFINED_CATS.includes(livro.categoria);
      setForm({
        titulo: livro.titulo, autor: livro.autor, isbn: livro.isbn,
        categoria: livro.categoria, editora: livro.editora,
        anoPublicacao: livro.anoPublicacao?.toString() || '',
        quantidadeTotal: livro.quantidadeTotal.toString(),
        localizacao: livro.localizacao, descricao: livro.descricao,
        capaUrl: livro.capaUrl || '', ativo: livro.ativo !== false,
      });
      setCustomCat(isPredefined ? '' : livro.categoria);
      setCapaMode(livro.capaUrl ? 'url' : 'upload');
    } else {
      setForm({ titulo: '', autor: '', isbn: '', categoria: 'Geral', editora: '', anoPublicacao: '', quantidadeTotal: '1', localizacao: '', descricao: '', capaUrl: '', ativo: true });
      setCustomCat('');
      setCapaMode('upload');
    }
  }, [livro, visible]);

  const pickAndUploadImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.85,
        allowsEditing: true,
        aspect: [2, 3],
      });
      if (result.canceled) return;
      setUploading(true);
      const asset = result.assets[0];
      const fd = new FormData();
      if (Platform.OS === 'web') {
        const resp = await fetch(asset.uri);
        const blob = await resp.blob();
        fd.append('file', blob, 'capa.jpg');
      } else {
        fd.append('file', { uri: asset.uri, type: asset.mimeType || 'image/jpeg', name: 'capa.jpg' } as any);
      }
      const tok = await getAuthToken();
      const uploadResp = await fetch('/api/upload', {
        method: 'POST',
        headers: tok ? { Authorization: `Bearer ${tok}` } : {},
        body: fd,
      });
      const data = await uploadResp.json();
      if (!uploadResp.ok) throw new Error(data.error);
      upd('capaUrl')(data.url);
      showToast('Capa carregada com sucesso!', 'success');
    } catch {
      showToast('Erro ao carregar a imagem.', 'error');
    } finally {
      setUploading(false);
    }
  };

  const upd = (k: keyof typeof form) => (v: string) => setForm(f => ({ ...f, [k]: v }));

  const save = async () => {
    if (!form.titulo.trim() || !form.autor.trim()) {
      showToast('Título e autor são obrigatórios.', 'error'); return;
    }
    setSaving(true);
    try {
      const qty = parseInt(form.quantidadeTotal) || 1;
      const payload = {
        titulo: form.titulo.trim(), autor: form.autor.trim(), isbn: form.isbn.trim(),
        categoria: (form.categoria || 'Geral').trim(), editora: form.editora.trim(),
        anoPublicacao: form.anoPublicacao ? parseInt(form.anoPublicacao) : null,
        quantidadeTotal: qty,
        quantidadeDisponivel: livro ? undefined : qty,
        localizacao: form.localizacao.trim(), descricao: form.descricao.trim(),
        capaUrl: form.capaUrl.trim(), ativo: form.ativo,
      };
      if (livro) {
        await req(`/api/livros/${livro.id}`, { method: 'PUT', body: JSON.stringify(payload) });
        showToast(`«${payload.titulo}» atualizado com sucesso.`, 'success');
      } else {
        await req('/api/livros', { method: 'POST', body: JSON.stringify(payload) });
        showToast(`«${payload.titulo}» adicionado! ${qty} exemplar(es).`, 'success');
      }
      onSaved();
    } catch (e) {
      showToast((e as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
      <View style={centeredOverlay}>
        <View style={mStyles.sheet}>
          <View style={mStyles.header}>
            <View style={mStyles.headerLeft}>
              <Ionicons name={livro ? 'pencil' : 'add-circle'} size={20} color="#5E6AD2" />
              <Text style={mStyles.headerTitle}>{livro ? 'Editar Livro' : 'Adicionar Livro'}</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={mStyles.closeBtn}>
              <Ionicons name="close" size={20} color="#aaa" />
            </TouchableOpacity>
          </View>

          <ScrollView style={mStyles.body} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <View style={mStyles.section}>
              <View style={mStyles.sectionHeader}>
                <Ionicons name="information-circle-outline" size={14} color="#5E6AD2" />
                <Text style={mStyles.sectionTitle}>IDENTIFICAÇÃO</Text>
              </View>
              <MLabel>Título *</MLabel>
              <MInput value={form.titulo} onChangeText={upd('titulo')} placeholder="Título do livro" returnKeyType="next" blurOnSubmit={false} />
              <MLabel>Autor *</MLabel>
              <MInput value={form.autor} onChangeText={upd('autor')} placeholder="Nome do autor" returnKeyType="next" blurOnSubmit={false} />
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <MLabel>ISBN</MLabel>
                  <MInput value={form.isbn} onChangeText={upd('isbn')} placeholder="ISBN" keyboardType="numeric" returnKeyType="next" blurOnSubmit={false} />
                </View>
                <View style={{ flex: 1 }}>
                  <MLabel>Ano Publicação</MLabel>
                  <MInput value={form.anoPublicacao} onChangeText={upd('anoPublicacao')} placeholder="Ex: 2018" keyboardType="numeric" returnKeyType="next" blurOnSubmit={false} />
                </View>
              </View>
              <MLabel>Editora</MLabel>
              <MInput value={form.editora} onChangeText={upd('editora')} placeholder="Nome da editora" returnKeyType="next" blurOnSubmit={false} />
            </View>

            <View style={mStyles.section}>
              <View style={mStyles.sectionHeader}>
                <Ionicons name="pricetag-outline" size={14} color="#5E6AD2" />
                <Text style={mStyles.sectionTitle}>CATEGORIA</Text>
                <View style={mStyles.catSelectedBadge}>
                  <Text style={mStyles.catSelectedText}>{form.categoria}</Text>
                </View>
              </View>
              <View style={mStyles.catGrid}>
                {PREDEFINED_CATS.map(c => {
                  const cc = catColor(c);
                  const isActive = form.categoria === c && !isCustomCat;
                  return (
                    <TouchableOpacity
                      key={c}
                      style={[mStyles.catGridItem, isActive && { borderColor: cc, backgroundColor: cc + '20' }]}
                      onPress={() => { upd('categoria')(c); setCustomCat(''); }}
                    >
                      <View style={[mStyles.catDot, { backgroundColor: isActive ? cc : 'rgba(255,255,255,0.15)' }]} />
                      <Text style={[mStyles.catGridText, isActive && { color: cc, fontWeight: '700' }]} numberOfLines={1}>{c}</Text>
                      {isActive && <Ionicons name="checkmark" size={11} color={cc} />}
                    </TouchableOpacity>
                  );
                })}
              </View>
              <View style={mStyles.customCatRow}>
                <Ionicons name="add-circle-outline" size={15} color="#5E6AD2" />
                <Text style={mStyles.customCatLabel}>Outra categoria:</Text>
              </View>
              <TextInput
                style={[mStyles.input, isCustomCat && { borderColor: '#5E6AD2' }]}
                value={customCat}
                onChangeText={v => {
                  setCustomCat(v);
                  if (v.trim()) upd('categoria')(v.trim());
                  else upd('categoria')('Geral');
                }}
                placeholder="Escreva uma categoria personalizada…"
                placeholderTextColor="#555"
                selectionColor="#5E6AD2"
                returnKeyType="next"
                blurOnSubmit={false}
              />
            </View>

            <View style={mStyles.section}>
              <View style={mStyles.sectionHeader}>
                <Ionicons name="cube-outline" size={14} color="#5E6AD2" />
                <Text style={mStyles.sectionTitle}>INVENTÁRIO & LOCALIZAÇÃO</Text>
              </View>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ width: 90 }}>
                  <MLabel>Exemplares</MLabel>
                  <MInput value={form.quantidadeTotal} onChangeText={upd('quantidadeTotal')} placeholder="1" keyboardType="numeric" returnKeyType="next" blurOnSubmit={false} />
                </View>
                <View style={{ flex: 1 }}>
                  <MLabel>Prateleira / Localização</MLabel>
                  <MInput value={form.localizacao} onChangeText={upd('localizacao')} placeholder="Ex: Estante A, Prateleira 3" returnKeyType="done" onSubmitEditing={save} />
                </View>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, paddingVertical: 10, paddingHorizontal: 2, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Ionicons name="checkmark-circle-outline" size={16} color={form.ativo ? '#66BB6A' : '#555'} />
                  <Text style={{ color: form.ativo ? '#66BB6A' : '#888', fontSize: 13, fontWeight: '600' }}>
                    {form.ativo ? 'Livro ativo no catálogo' : 'Livro inativo (oculto)'}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => setForm(f => ({ ...f, ativo: !f.ativo }))}
                  style={{ width: 44, height: 24, borderRadius: 12, backgroundColor: form.ativo ? '#66BB6A' : '#333', justifyContent: 'center', paddingHorizontal: 3 }}
                >
                  <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: '#fff', alignSelf: form.ativo ? 'flex-end' : 'flex-start' }} />
                </TouchableOpacity>
              </View>
            </View>

            <View style={mStyles.section}>
              <View style={mStyles.sectionHeader}>
                <Ionicons name="image-outline" size={14} color="#5E6AD2" />
                <Text style={mStyles.sectionTitle}>CAPA & DESCRIÇÃO</Text>
              </View>
              {form.capaUrl ? (
                <View style={mStyles.capaPreviewBox}>
                  <Image source={{ uri: form.capaUrl }} style={mStyles.capaImgLarge} resizeMode="cover" onError={() => {}} />
                  <TouchableOpacity style={mStyles.capaRemoveBtn} onPress={() => upd('capaUrl')('')}>
                    <Ionicons name="close-circle" size={20} color="#EF5350" />
                    <Text style={{ color: '#EF5350', fontSize: 12, fontWeight: '600' }}>Remover capa</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={mStyles.capaEmpty}>
                  <Ionicons name="book-outline" size={36} color="#333" />
                  <Text style={{ color: '#555', fontSize: 12, marginTop: 6 }}>Sem capa definida</Text>
                </View>
              )}
              <View style={mStyles.capaModeRow}>
                <TouchableOpacity
                  style={[mStyles.capaModeBtn, capaMode === 'upload' && mStyles.capaModeBtnActive]}
                  onPress={() => setCapaMode('upload')}
                >
                  <Ionicons name="cloud-upload-outline" size={14} color={capaMode === 'upload' ? '#fff' : '#777'} />
                  <Text style={[mStyles.capaModeBtnText, capaMode === 'upload' && { color: '#fff' }]}>Carregar ficheiro</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[mStyles.capaModeBtn, capaMode === 'url' && mStyles.capaModeBtnActive]}
                  onPress={() => setCapaMode('url')}
                >
                  <Ionicons name="link-outline" size={14} color={capaMode === 'url' ? '#fff' : '#777'} />
                  <Text style={[mStyles.capaModeBtnText, capaMode === 'url' && { color: '#fff' }]}>Colar URL</Text>
                </TouchableOpacity>
              </View>
              {capaMode === 'upload' ? (
                <TouchableOpacity style={mStyles.uploadBtn} onPress={pickAndUploadImage} disabled={uploading}>
                  {uploading ? <AppLoader size="small" color="#5E6AD2" /> : <Ionicons name="cloud-upload-outline" size={20} color="#5E6AD2" />}
                  <Text style={mStyles.uploadBtnText}>
                    {uploading ? 'A carregar…' : form.capaUrl ? 'Substituir imagem' : 'Escolher imagem da galeria'}
                  </Text>
                </TouchableOpacity>
              ) : (
                <>
                  <MLabel>URL da Capa</MLabel>
                  <MInput value={form.capaUrl} onChangeText={upd('capaUrl')} placeholder="https://exemplo.com/capa.jpg" returnKeyType="done" blurOnSubmit={false} onSubmitEditing={save} />
                </>
              )}
              <MLabel>Sinopse / Descrição</MLabel>
              <MInput value={form.descricao} onChangeText={upd('descricao')} placeholder="Breve descrição do livro..." multiline style={{ height: 72, textAlignVertical: 'top' }} />
            </View>
            <View style={{ height: 8 }} />
          </ScrollView>

          <View style={mStyles.footer}>
            <TouchableOpacity style={mStyles.cancelBtn} onPress={onClose}>
              <Text style={{ color: '#aaa', fontWeight: '600' }}>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity style={mStyles.saveBtn} onPress={save} disabled={saving}>
              {saving
                ? <AppLoader color="#fff" size="small" />
                : <>
                    <Ionicons name={livro ? 'save-outline' : 'add-circle-outline'} size={16} color="#fff" />
                    <Text style={{ color: '#fff', fontWeight: '700', marginLeft: 6 }}>{livro ? 'Guardar Alterações' : 'Adicionar Livro'}</Text>
                  </>
              }
            </TouchableOpacity>
          </View>
        </View>
      </View>
          </KeyboardAvoidingView>
</Modal>
  );
}

// ─── Empréstimos Tab ──────────────────────────────────────────────────────────
function EmprestimosTab({ emprestimos, livros, solicitacoes, canManage, user, onReload, refreshing, onRefresh }: {
  emprestimos: Emprestimo[]; livros: Livro[]; solicitacoes: Solicitacao[];
  canManage: boolean; user: any;
  onReload: () => void; refreshing: boolean; onRefresh: () => void;
}) {
  const { showToast } = useToast();
  const [filtro, setFiltro] = useState<'todos' | 'ativos' | 'atrasados' | 'devolvidos'>('ativos');
  const [showModal, setShowModal] = useState(false);
  const [search, setSearch] = useState('');
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectMotivo, setRejectMotivo] = useState('');
  const [processing, setProcessing] = useState<string | null>(null);

  const filtered = emprestimos.filter(e => {
    const matchFiltro =
      filtro === 'todos' ? true :
      filtro === 'ativos' ? (e.status === 'emprestado' || e.status === 'atrasado') :
      (e.status as string) === filtro;
    const q = search.toLowerCase();
    const matchSearch = !q || e.nomeLeitor.toLowerCase().includes(q) || e.livroTitulo.toLowerCase().includes(q);
    return matchFiltro && matchSearch;
  });

  const devolver = async (emp: Emprestimo) => {
    try {
      const hoje = new Date().toISOString().slice(0, 10);
      await req(`/api/emprestimos/${emp.id}`, {
        method: 'PUT',
        body: JSON.stringify({ status: 'devolvido', dataDevolucao: hoje }),
      });
      showToast('Devolução registada com sucesso.', 'success');
      onReload();
    } catch (e) {
      showToast((e as Error).message, 'error');
    }
  };

  const aprovar = async (sol: Solicitacao) => {
    setProcessing(sol.id);
    try {
      await req(`/api/solicitacoes-emprestimo/${sol.id}`, {
        method: 'PUT',
        body: JSON.stringify({ status: 'aprovado', aprovadoPor: user?.nome || 'Biblioteca' }),
      });
      showToast(`Empréstimo aprovado para ${sol.nomeLeitor}.`, 'success');
      onReload();
    } catch (e) {
      showToast((e as Error).message, 'error');
    } finally {
      setProcessing(null);
    }
  };

  const rejeitar = async () => {
    if (!rejectId) return;
    setProcessing(rejectId);
    try {
      await req(`/api/solicitacoes-emprestimo/${rejectId}`, {
        method: 'PUT',
        body: JSON.stringify({ status: 'rejeitado', motivoRejeicao: rejectMotivo || null }),
      });
      showToast('Pedido rejeitado.', 'info');
      setRejectId(null);
      setRejectMotivo('');
      onReload();
    } catch (e) {
      showToast((e as Error).message, 'error');
    } finally {
      setProcessing(null);
    }
  };

  return (
    <ScrollView
      style={styles.flex}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#5E6AD2" />}
      keyboardShouldPersistTaps="handled"
    >
      {/* Pedidos Pendentes */}
      {canManage && solicitacoes.length > 0 && (
        <View style={empStyles.pendentesSection}>
          <View style={empStyles.pendenteHeader}>
            <Ionicons name="time" size={16} color="#FFA726" />
            <Text style={empStyles.pendenteTitle}>Pedidos Pendentes de Aprovação</Text>
            <View style={empStyles.pendenteCount}>
              <Text style={empStyles.pendenteCountText}>{solicitacoes.length}</Text>
            </View>
          </View>
          {solicitacoes.map(sol => (
            <View key={sol.id} style={empStyles.pedidoCard}>
              <View style={{ flex: 1 }}>
                <Text style={empStyles.pedidoTitulo} numberOfLines={1}>{sol.livroTitulo}</Text>
                <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center', marginTop: 3 }}>
                  <Ionicons name="person-outline" size={12} color="#888" />
                  <Text style={empStyles.pedidoLeitor}>{sol.nomeLeitor}</Text>
                  <View style={empStyles.diasChip}>
                    <Ionicons name="calendar-outline" size={10} color="#5E6AD2" />
                    <Text style={empStyles.diasChipText}>{sol.diasSolicitados} dias</Text>
                  </View>
                </View>
                <Text style={empStyles.pedidoData}>Solicitado em {fmtDate(sol.createdAt)}</Text>
              </View>
              <View style={empStyles.pedidoBtns}>
                <TouchableOpacity
                  style={[empStyles.aprovarBtn, processing === sol.id && { opacity: 0.5 }]}
                  onPress={() => aprovar(sol)}
                  disabled={!!processing}
                >
                  {processing === sol.id
                    ? <AppLoader size="small" color="#fff" />
                    : <Ionicons name="checkmark" size={16} color="#fff" />
                  }
                </TouchableOpacity>
                <TouchableOpacity
                  style={[empStyles.rejeitarBtn, processing === sol.id && { opacity: 0.5 }]}
                  onPress={() => setRejectId(sol.id)}
                  disabled={!!processing}
                >
                  <Ionicons name="close" size={16} color="#fff" />
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* Search + Add */}
      <View style={styles.searchRow}>
        <View style={styles.searchBox}>
          <StableSearchInput
            value={search}
            onChangeText={setSearch}
            inputStyle={styles.searchInput}
            placeholder="Pesquisar leitor ou título…"
            iconColor="#666"
          />
        </View>
        {canManage && (
          <TouchableOpacity style={styles.addBtn} onPress={() => setShowModal(true)}>
            <Ionicons name="add" size={16} color="#fff" />
            <Text style={styles.addBtnTxt}>Novo Empréstimo</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.filterRow}>
        {([
          { key: 'ativos', label: 'Ativos' },
          { key: 'atrasados', label: 'Atrasados' },
          { key: 'devolvidos', label: 'Devolvidos' },
          { key: 'todos', label: 'Todos' },
        ] as const).map(f => (
          <TouchableOpacity
            key={f.key}
            style={[styles.filterChip, filtro === f.key && styles.filterChipActive]}
            onPress={() => setFiltro(f.key)}
          >
            <Text style={[styles.filterChipText, filtro === f.key && { color: '#fff' }]}>{f.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {filtered.length === 0 ? (
        <View style={[styles.emptyBox, { marginTop: 24 }]}>
          <Ionicons name="swap-horizontal-outline" size={48} color="#444" />
          <Text style={styles.emptyText}>Nenhum empréstimo encontrado</Text>
        </View>
      ) : (
        <View style={{ padding: 16, gap: 10, paddingBottom: 120 }}>
          {filtered.map(item => (
            <EmprestimoCard key={item.id} emp={item} canManage={canManage} onDevolver={() => devolver(item)} />
          ))}
        </View>
      )}

      {canManage && (
        <NovoEmprestimoModal
          visible={showModal}
          livros={livros}
          user={user}
          onClose={() => setShowModal(false)}
          onSaved={() => { setShowModal(false); onReload(); }}
        />
      )}

      <Modal visible={!!rejectId} transparent animationType="fade" onRequestClose={() => setRejectId(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={centeredOverlay}>
          <View style={[mStyles.sheet, { maxHeight: 320 }]}>
            <View style={mStyles.header}>
              <Text style={mStyles.headerTitle}>Rejeitar Pedido</Text>
              <TouchableOpacity onPress={() => setRejectId(null)} style={mStyles.closeBtn}><Ionicons name="close" size={20} color="#aaa" /></TouchableOpacity>
            </View>
            <View style={{ padding: 20, gap: 12 }}>
              <Text style={{ color: '#aaa', fontSize: 13 }}>Indique o motivo da rejeição (opcional):</Text>
              <TextInput
                style={[mStyles.input, { height: 80, textAlignVertical: 'top' }]}
                value={rejectMotivo}
                onChangeText={setRejectMotivo}
                placeholder="Ex: Livro reservado, exemplar danificado…"
                placeholderTextColor="#555"
                multiline
                numberOfLines={3}
              />
            </View>
            <View style={mStyles.footer}>
              <TouchableOpacity style={mStyles.cancelBtn} onPress={() => setRejectId(null)}>
                <Text style={{ color: '#aaa', fontWeight: '600' }}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[mStyles.saveBtn, { backgroundColor: '#EF5350' }]} onPress={rejeitar} disabled={!!processing}>
                {processing ? <AppLoader color="#fff" size="small" /> : <Text style={{ color: '#fff', fontWeight: '700' }}>Rejeitar</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
              </KeyboardAvoidingView>
</Modal>
    </ScrollView>
  );
}

function EmprestimoCard({ emp, canManage, onDevolver }: { emp: Emprestimo; canManage: boolean; onDevolver: () => void }) {
  const isAtrasado = emp.status === 'atrasado';
  const isDevolvido = emp.status === 'devolvido';
  const dias = !isDevolvido ? diasAtraso(emp.dataPrevistaDevolucao) : 0;
  const statusColor = isAtrasado ? '#EF5350' : isDevolvido ? '#66BB6A' : '#5E6AD2';
  const statusLabel = isAtrasado ? 'Atrasado' : isDevolvido ? 'Devolvido' : 'Emprestado';

  return (
    <View style={[eStyles.card, isAtrasado && eStyles.cardAtrasado]}>
      <View style={eStyles.cardTop}>
        <View style={eStyles.livroInfo}>
          <Text style={eStyles.livroTitulo} numberOfLines={1}>{emp.livroTitulo}</Text>
          <View style={eStyles.leitorRow}>
            <Ionicons name="person-outline" size={12} color="#888" />
            <Text style={eStyles.leitorNome}>{emp.nomeLeitor}</Text>
            <View style={[eStyles.tipoBadge, { backgroundColor: tipoColor(emp.tipoLeitor) + '22' }]}>
              <Text style={[eStyles.tipoText, { color: tipoColor(emp.tipoLeitor) }]}>{emp.tipoLeitor}</Text>
            </View>
          </View>
        </View>
        <View style={[eStyles.statusBadge, { backgroundColor: statusColor + '22', borderColor: statusColor + '44' }]}>
          <Text style={[eStyles.statusText, { color: statusColor }]}>{statusLabel}</Text>
        </View>
      </View>
      <View style={eStyles.datesRow}>
        <DatePill icon="calendar-outline" label="Empréstimo" date={fmtDate(emp.dataEmprestimo)} />
        <DatePill icon="time-outline" label="Previsto" date={fmtDate(emp.dataPrevistaDevolucao)} warn={isAtrasado} />
        {isDevolvido && <DatePill icon="checkmark-circle-outline" label="Devolvido" date={fmtDate(emp.dataDevolucao || '')} ok />}
      </View>
      {isAtrasado && dias > 0 && (
        <View style={eStyles.atrasoAlert}>
          <Ionicons name="warning" size={13} color="#EF5350" />
          <Text style={eStyles.atrasoText}>{dias} dia{dias !== 1 ? 's' : ''} de atraso — penalização pode ser aplicada</Text>
        </View>
      )}
      {!isDevolvido && canManage && (
        <TouchableOpacity style={eStyles.devolverBtn} onPress={onDevolver}>
          <Ionicons name="return-down-back" size={14} color="#fff" />
          <Text style={eStyles.devolverText}>Registar Devolução</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

function DatePill({ icon, label, date, warn, ok }: { icon: string; label: string; date: string; warn?: boolean; ok?: boolean }) {
  const color = warn ? '#EF5350' : ok ? '#66BB6A' : '#888';
  return (
    <View style={eStyles.datePill}>
      <Ionicons name={icon as any} size={11} color={color} />
      <View>
        <Text style={[eStyles.dateLabel, { color: '#666' }]}>{label}</Text>
        <Text style={[eStyles.dateVal, { color }]}>{date}</Text>
      </View>
    </View>
  );
}

function tipoColor(tipo: string) {
  const m: Record<string, string> = { aluno: '#5E6AD2', professor: '#26A69A', funcionário: '#FF7043', externo: '#888' };
  return m[tipo] || '#888';
}

// ─── Novo Empréstimo Modal ─────────────────────────────────────────────────────
interface AlunoResult {
  id: string;
  nome: string;
  apelido: string;
  turmaId: string | null;
  turmaNome: string | null;
  sala: string | null;
  curso: string | null;
  classe: string | null;
}

function NovoEmprestimoModal({ visible, livros, user, onClose, onSaved }: {
  visible: boolean; livros: Livro[]; user: any; onClose: () => void; onSaved: () => void;
}) {
  const { showToast } = useToast();
  const [saving, setSaving] = useState(false);
  const [livroSearch, setLivroSearch] = useState('');
  const [livroSel, setLivroSel] = useState<Livro | null>(null);
  const [livroFocused, setLivroFocused] = useState(false);
  const [form, setForm] = useState({
    nomeLeitor: '', tipoLeitor: 'aluno',
    dataEmprestimo: new Date().toISOString().slice(0, 10),
    dataPrevistaDevolucao: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
    observacao: '',
  });

  // Student search state
  const [alunoSearch, setAlunoSearch] = useState('');
  const [alunoResults, setAlunoResults] = useState<AlunoResult[]>([]);
  const [alunoSel, setAlunoSel] = useState<AlunoResult | null>(null);
  const [alunoFocused, setAlunoFocused] = useState(false);
  const [alunoSearching, setAlunoSearching] = useState(false);
  const alunoSearchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!visible) {
      setLivroSel(null); setLivroSearch(''); setLivroFocused(false);
      setAlunoSel(null); setAlunoSearch(''); setAlunoResults([]); setAlunoFocused(false);
      setForm({ nomeLeitor: '', tipoLeitor: 'aluno', dataEmprestimo: new Date().toISOString().slice(0, 10), dataPrevistaDevolucao: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10), observacao: '' });
    }
  }, [visible]);

  // Debounced student search
  useEffect(() => {
    if (form.tipoLeitor !== 'aluno') return;
    if (alunoSel) return;
    if (alunoSearchTimeout.current) clearTimeout(alunoSearchTimeout.current);
    if (!alunoSearch.trim()) { setAlunoResults([]); return; }
    alunoSearchTimeout.current = setTimeout(async () => {
      setAlunoSearching(true);
      try {
        const res2 = await req<AlunoResult[]>(`/api/biblioteca/alunos-search?q=${encodeURIComponent(alunoSearch.trim())}`);
        setAlunoResults(res2);
      } catch { setAlunoResults([]); }
      finally { setAlunoSearching(false); }
    }, 350);
  }, [alunoSearch, form.tipoLeitor, alunoSel]);

  const selectAluno = (a: AlunoResult) => {
    setAlunoSel(a);
    setForm(f => ({ ...f, nomeLeitor: `${a.nome} ${a.apelido}`.trim() }));
    setAlunoSearch('');
    setAlunoResults([]);
    setAlunoFocused(false);
  };

  const clearAluno = () => {
    setAlunoSel(null);
    setForm(f => ({ ...f, nomeLeitor: '' }));
  };

  // Books with at least 1 available copy, filtered by search term
  const livrosFiltrados = livros.filter(l => {
    if (l.quantidadeDisponivel < 1) return false;
    if (!livroSearch.trim()) return true;
    const q = livroSearch.toLowerCase();
    return l.titulo.toLowerCase().includes(q) || l.autor.toLowerCase().includes(q);
  });

  const showDropdown = !livroSel && (livroFocused || livroSearch.length > 0);
  const showAlunoDropdown = !alunoSel && alunoResults.length > 0;

  const upd = (k: keyof typeof form) => (v: string) => setForm(f => ({ ...f, [k]: v }));

  const save = async () => {
    if (!livroSel) { showToast('Selecione um livro.', 'error'); return; }
    if (form.tipoLeitor === 'aluno' && !alunoSel) { showToast('Selecione o estudante.', 'error'); return; }
    if (!form.nomeLeitor.trim()) { showToast('Nome do leitor é obrigatório.', 'error'); return; }
    setSaving(true);
    try {
      await req('/api/emprestimos', {
        method: 'POST',
        body: JSON.stringify({
          livroId: livroSel.id,
          alunoId: alunoSel?.id || null,
          nomeLeitor: form.nomeLeitor.trim(),
          tipoLeitor: form.tipoLeitor,
          dataEmprestimo: form.dataEmprestimo,
          dataPrevistaDevolucao: form.dataPrevistaDevolucao,
          observacao: form.observacao || null,
          registadoPor: user?.nome || 'Sistema',
        }),
      });
      showToast('Empréstimo registado com sucesso.', 'success');
      onSaved();
    } catch (e) {
      showToast((e as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
      <View style={centeredOverlay}>
        <View style={mStyles.sheet}>
          <View style={mStyles.header}>
            <Text style={mStyles.headerTitle}>Registar Empréstimo</Text>
            <TouchableOpacity onPress={onClose} style={mStyles.closeBtn}><Ionicons name="close" size={20} color="#aaa" /></TouchableOpacity>
          </View>
          <ScrollView style={mStyles.body} contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
            <MLabel>Livro *</MLabel>
            {livroSel ? (
              <View>
                <View style={mStyles.livroSel}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: '#fff', fontWeight: '700' }} numberOfLines={1}>{livroSel.titulo}</Text>
                    <Text style={{ color: '#aaa', fontSize: 12 }}>{livroSel.quantidadeDisponivel} exemplar(es) disponível(is)</Text>
                  </View>
                  <TouchableOpacity onPress={() => setLivroSel(null)}>
                    <Ionicons name="close-circle" size={18} color="#EF5350" />
                  </TouchableOpacity>
                </View>
                <View style={mStyles.autorAutoFill}>
                  <Ionicons name="person-outline" size={13} color="#5E6AD2" />
                  <Text style={mStyles.autorAutoFillLabel}>Autor:</Text>
                  <Text style={mStyles.autorAutoFillValue} numberOfLines={1}>{livroSel.autor || '—'}</Text>
                </View>
              </View>
            ) : (
              <>
                <StableSearchInput
                  value={livroSearch}
                  onChangeText={setLivroSearch}
                  inputStyle={[mStyles.input, livroFocused && { borderColor: '#5E6AD2' }]}
                  placeholder="Toque para pesquisar por título ou autor…"
                  iconColor="#555"
                />
                {showDropdown && (
                  <View style={mStyles.livroDropdown}>
                    {livrosFiltrados.slice(0, 6).map(l => (
                      <TouchableOpacity key={l.id} style={mStyles.livroOption} onPress={() => { setLivroSel(l); setLivroSearch(''); setLivroFocused(false); }}>
                        <Text style={mStyles.livroOptionTitle} numberOfLines={1}>{l.titulo}</Text>
                        <Text style={mStyles.livroOptionSub}>{l.autor} · {l.quantidadeDisponivel} disponível(is)</Text>
                      </TouchableOpacity>
                    ))}
                    {livrosFiltrados.length === 0 && (
                      <Text style={{ color: '#666', padding: 10, fontSize: 13 }}>
                        {livroSearch.trim() ? 'Nenhum livro encontrado' : 'Sem livros disponíveis no acervo'}
                      </Text>
                    )}
                  </View>
                )}
              </>
            )}
            <MLabel>Tipo de Leitor</MLabel>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
              {TIPOS_LEITOR.map(t => (
                <TouchableOpacity key={t} style={[mStyles.chip, form.tipoLeitor === t && mStyles.chipActive]} onPress={() => upd('tipoLeitor')(t)}>
                  <Text style={[mStyles.chipText, form.tipoLeitor === t && { color: '#fff' }]}>{t}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Student search (when tipoLeitor = aluno) */}
            {form.tipoLeitor === 'aluno' ? (
              <>
                <MLabel>Estudante *</MLabel>
                {alunoSel ? (
                  <View style={{ marginBottom: 10 }}>
                    <View style={mStyles.alunoSel}>
                      <Ionicons name="person" size={16} color="#5E6AD2" />
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: '#fff', fontWeight: '700' }}>{alunoSel.nome} {alunoSel.apelido}</Text>
                        {alunoSel.turmaNome && (
                          <Text style={{ color: '#aaa', fontSize: 12 }}>
                            {alunoSel.turmaNome}{alunoSel.sala ? ` · Sala ${alunoSel.sala}` : ''}
                            {alunoSel.curso ? ` · ${alunoSel.curso}` : ''}
                          </Text>
                        )}
                      </View>
                      <TouchableOpacity onPress={clearAluno}>
                        <Ionicons name="close-circle" size={18} color="#EF5350" />
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : (
                  <View style={{ marginBottom: 10 }}>
                    <StableSearchInput
                      value={alunoSearch}
                      onChangeText={setAlunoSearch}
                      inputStyle={[mStyles.input, alunoFocused && { borderColor: '#5E6AD2' }]}
                      placeholder="Pesquisar estudante por nome…"
                      iconColor="#555"
                    />
                    {alunoSearching && <AppLoader size="small" color="#5E6AD2" style={{ position: 'absolute', right: 12, top: 10 }} />}
                    {showAlunoDropdown && (
                      <View style={mStyles.livroDropdown}>
                        {alunoResults.map(a => (
                          <TouchableOpacity key={a.id} style={mStyles.livroOption} onPress={() => selectAluno(a)}>
                            <Text style={mStyles.livroOptionTitle}>{a.nome} {a.apelido}</Text>
                            <Text style={mStyles.livroOptionSub}>
                              {a.turmaNome || 'Sem turma'}{a.sala ? ` · Sala ${a.sala}` : ''}{a.curso ? ` · ${a.curso}` : ''}
                            </Text>
                          </TouchableOpacity>
                        ))}
                        {alunoResults.length === 0 && !alunoSearching && alunoSearch.trim() && (
                          <Text style={{ color: '#666', padding: 10, fontSize: 13 }}>Nenhum estudante encontrado</Text>
                        )}
                      </View>
                    )}
                  </View>
                )}
              </>
            ) : (
              <>
                <MLabel>Nome do Leitor *</MLabel>
                <MInput value={form.nomeLeitor} onChangeText={upd('nomeLeitor')} placeholder="Nome completo" returnKeyType="done" onSubmitEditing={save} />
              </>
            )}

            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <MLabel>Data de Empréstimo</MLabel>
                <DateInput style={mStyles.input} value={form.dataEmprestimo} onChangeText={upd('dataEmprestimo')} />
              </View>
              <View style={{ flex: 1 }}>
                <MLabel>Data Prevista de Devolução</MLabel>
                <DateInput style={mStyles.input} value={form.dataPrevistaDevolucao} onChangeText={upd('dataPrevistaDevolucao')} />
              </View>
            </View>
            <MLabel>Observações</MLabel>
            <MInput value={form.observacao} onChangeText={upd('observacao')} placeholder="Observações opcionais" multiline style={{ height: 60, textAlignVertical: 'top' }} />
          </ScrollView>
          <View style={mStyles.footer}>
            <TouchableOpacity style={mStyles.cancelBtn} onPress={onClose}>
              <Text style={{ color: '#aaa', fontWeight: '600' }}>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity style={mStyles.saveBtn} onPress={save} disabled={saving}>
              {saving ? <AppLoader color="#fff" size="small" /> : <Text style={{ color: '#fff', fontWeight: '700' }}>Registar</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </View>
          </KeyboardAvoidingView>
</Modal>
  );
}

// ─── Desejos (Wishlist) Tab ──────────────────────────────────────────────────
function DesejosTab({ canManage, user, refreshing, onRefresh }: {
  canManage: boolean; user: any; refreshing: boolean; onRefresh: () => void;
}) {
  const { showToast } = useToast();
  const [desejos, setDesejos] = useState<DesejosLivro[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [filtro, setFiltro] = useState<'pendente' | 'adquirido' | 'rejeitado' | 'todos'>('todos');
  const [processing, setProcessing] = useState<string | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const rows = await req<DesejosLivro[]>('/api/desejos-livros');
      setDesejos(rows);
    } catch (e) {
      showToast((e as Error).message, 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, []);

  const handleRefresh = () => { load(true); };

  const atualizar = async (id: string, status: string) => {
    setProcessing(id);
    try {
      await req(`/api/desejos-livros/${id}`, { method: 'PUT', body: JSON.stringify({ status }) });
      showToast(status === 'adquirido' ? 'Marcado como adquirido!' : 'Pedido rejeitado.', 'success');
      load(true);
    } catch (e) {
      showToast((e as Error).message, 'error');
    } finally {
      setProcessing(null);
    }
  };

  const filtered = desejos.filter(d => filtro === 'todos' ? true : d.status === filtro);

  const statusColor = (s: string) => s === 'adquirido' ? '#66BB6A' : s === 'rejeitado' ? '#EF5350' : '#FFA726';
  const statusLabel = (s: string) => s === 'adquirido' ? 'Adquirido' : s === 'rejeitado' ? 'Rejeitado' : 'Pendente';

  return (
    <View style={styles.flex}>
      <View style={styles.searchRow}>
        <View style={{ flex: 1, flexDirection: 'row', gap: 6 }}>
          {(['todos', 'pendente', 'adquirido', 'rejeitado'] as const).map(f => (
            <TouchableOpacity
              key={f}
              style={[styles.filterChip, filtro === f && styles.filterChipActive]}
              onPress={() => setFiltro(f)}
            >
              <Text style={[styles.filterChipText, filtro === f && { color: '#fff' }]}>
                {f === 'todos' ? 'Todos' : statusLabel(f)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <TouchableOpacity style={styles.addBtn} onPress={() => setShowAdd(true)}>
          <Ionicons name="add" size={16} color="#fff" />
          <Text style={styles.addBtnTxt}>Novo Desejo</Text>
        </TouchableOpacity>
      </View>

      {/* Info box */}
      <View style={desejosStyles.infoBox}>
        <Ionicons name="heart" size={14} color="#EC407A" />
        <Text style={desejosStyles.infoText}>
          Aqui podes sugerir livros que gostarias de ver na biblioteca — para compra ou doação.
        </Text>
      </View>

      {loading ? (
        <View style={styles.center}><AppLoader color="#5E6AD2" /></View>
      ) : filtered.length === 0 ? (
        <View style={styles.emptyBox}>
          <Ionicons name="heart-outline" size={48} color="#444" />
          <Text style={styles.emptyText}>Nenhum desejo registado</Text>
          <Text style={styles.emptySub}>Toca em + para sugerir um livro</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.flex}
          contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 120 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#5E6AD2" />}
        >
          {filtered.map(d => {
            const sc = statusColor(d.status);
            return (
              <View key={d.id} style={desejosStyles.card}>
                <View style={desejosStyles.cardTop}>
                  <View style={{ flex: 1 }}>
                    <Text style={desejosStyles.titulo} numberOfLines={1}>{d.titulo}</Text>
                    {d.autor ? <Text style={desejosStyles.autor}>{d.autor}</Text> : null}
                    {d.motivo ? (
                      <View style={desejosStyles.motivoBox}>
                        <Ionicons name="chatbubble-outline" size={11} color="#666" />
                        <Text style={desejosStyles.motivo} numberOfLines={2}>{d.motivo}</Text>
                      </View>
                    ) : null}
                    <View style={desejosStyles.metaRow}>
                      <Ionicons name="person-outline" size={11} color="#666" />
                      <Text style={desejosStyles.metaText}>{d.nomeLeitor}</Text>
                      <Text style={desejosStyles.metaDate}>{fmtDate(d.createdAt)}</Text>
                    </View>
                  </View>
                  <View style={[desejosStyles.statusBadge, { backgroundColor: sc + '22', borderColor: sc + '44' }]}>
                    <Text style={[desejosStyles.statusText, { color: sc }]}>{statusLabel(d.status)}</Text>
                  </View>
                </View>
                {canManage && d.status === 'pendente' && (
                  <View style={desejosStyles.actions}>
                    <TouchableOpacity
                      style={desejosStyles.adquirirBtn}
                      onPress={() => atualizar(d.id, 'adquirido')}
                      disabled={processing === d.id}
                    >
                      {processing === d.id
                        ? <AppLoader size="small" color="#fff" />
                        : <>
                            <Ionicons name="checkmark-circle" size={14} color="#fff" />
                            <Text style={desejosStyles.adquirirText}>Adquirido</Text>
                          </>
                      }
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={desejosStyles.rejeitarBtn}
                      onPress={() => atualizar(d.id, 'rejeitado')}
                      disabled={processing === d.id}
                    >
                      <Ionicons name="close" size={14} color="#fff" />
                      <Text style={desejosStyles.rejeitarText}>Rejeitar</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            );
          })}
        </ScrollView>
      )}

      <AddDesejoModal
        visible={showAdd}
        user={user}
        onClose={() => setShowAdd(false)}
        onSaved={() => { setShowAdd(false); load(true); showToast('Sugestão enviada! Obrigado.', 'success'); }}
      />
    </View>
  );
}

function AddDesejoModal({ visible, user, onClose, onSaved }: {
  visible: boolean; user: any; onClose: () => void; onSaved: () => void;
}) {
  const { showToast } = useToast();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ titulo: '', autor: '', motivo: '' });

  useEffect(() => { if (visible) setForm({ titulo: '', autor: '', motivo: '' }); }, [visible]);

  const upd = (k: keyof typeof form) => (v: string) => setForm(f => ({ ...f, [k]: v }));

  const save = async () => {
    if (!form.titulo.trim()) { showToast('O título é obrigatório.', 'error'); return; }
    setSaving(true);
    try {
      await req('/api/desejos-livros', {
        method: 'POST',
        body: JSON.stringify({
          titulo: form.titulo.trim(),
          autor: form.autor.trim(),
          motivo: form.motivo.trim(),
          alunoId: user?.id || null,
          nomeLeitor: user?.nome || 'Utilizador',
          registadoPor: user?.nome || 'Utilizador',
        }),
      });
      onSaved();
    } catch (e) {
      showToast((e as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
      <View style={centeredOverlay}>
        <View style={[mStyles.sheet, { maxHeight: 480 }]}>
          <View style={mStyles.header}>
            <View style={mStyles.headerLeft}>
              <Ionicons name="heart" size={18} color="#EC407A" />
              <Text style={mStyles.headerTitle}>Sugerir Livro</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={mStyles.closeBtn}>
              <Ionicons name="close" size={20} color="#aaa" />
            </TouchableOpacity>
          </View>
          <View style={{ padding: 20, gap: 4 }}>
            <MLabel>Título do livro *</MLabel>
            <MInput value={form.titulo} onChangeText={upd('titulo')} placeholder="Ex: O Príncipe" returnKeyType="next" blurOnSubmit={false} />
            <MLabel>Autor</MLabel>
            <MInput value={form.autor} onChangeText={upd('autor')} placeholder="Ex: Maquiavel" returnKeyType="done" onSubmitEditing={save} />
            <MLabel>Motivo / Justificação</MLabel>
            <MInput
              value={form.motivo}
              onChangeText={upd('motivo')}
              placeholder="Porque achas importante ter este livro na biblioteca?"
              multiline
              style={{ height: 70, textAlignVertical: 'top' }}
            />
            <View style={[solStyles.infoBox, { marginTop: 8 }]}>
              <Ionicons name="information-circle-outline" size={15} color="#5E6AD2" />
              <Text style={solStyles.infoText}>
                A tua sugestão será analisada pela equipa da biblioteca para possível aquisição.
              </Text>
            </View>
          </View>
          <View style={mStyles.footer}>
            <TouchableOpacity style={mStyles.cancelBtn} onPress={onClose}>
              <Text style={{ color: '#aaa', fontWeight: '600' }}>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[mStyles.saveBtn, { backgroundColor: '#EC407A' }]} onPress={save} disabled={saving}>
              {saving
                ? <AppLoader color="#fff" size="small" />
                : <>
                    <Ionicons name="heart" size={15} color="#fff" />
                    <Text style={{ color: '#fff', fontWeight: '700', marginLeft: 6 }}>Enviar Sugestão</Text>
                  </>
              }
            </TouchableOpacity>
          </View>
        </View>
      </View>
          </KeyboardAvoidingView>
</Modal>
  );
}

// ─── Estatísticas Tab ─────────────────────────────────────────────────────────
function StatsTab({ livros, emprestimos, totalLivros, totalDisp, totalEmprestados, atrasados, devolvidos, refreshing, onRefresh }: {
  livros: Livro[]; emprestimos: Emprestimo[];
  totalLivros: number; totalDisp: number; totalEmprestados: number;
  atrasados: Emprestimo[]; devolvidos: Emprestimo[];
  refreshing: boolean; onRefresh: () => void;
}) {
  const now = new Date();
  const [mesSel, setMesSel] = useState(now.getMonth() + 1);
  const [anoSel, setAnoSel] = useState(now.getFullYear());
  const [statsData, setStatsData] = useState<{ topLivros: { titulo: string; total: number }[]; totalEmprestimos: number; totalAtrasados: number } | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [penalizados, setPenalizados] = useState<{ alunoId: string; nomeLeitor: string; totalAtrasos: number }[]>([]);
  const [topLeitores, setTopLeitores] = useState<{ alunoId: string; nomeLeitor: string; total: number }[]>([]);
  const [topVisitantes, setTopVisitantes] = useState<{ alunoId: string; nomeAluno: string; turmaNome: string | null; total: number }[]>([]);

  useEffect(() => {
    setStatsLoading(true);
    Promise.all([
      req<any>(`/api/emprestimos/stats/mensal?mes=${mesSel}&ano=${anoSel}`),
      req<any>('/api/biblioteca/penalidades'),
    ]).then(([stats, pen]) => {
      setStatsData(stats);
      setPenalizados(pen.penalizados || []);
    }).catch(() => {}).finally(() => setStatsLoading(false));
  }, [mesSel, anoSel]);

  useEffect(() => {
    Promise.all([
      req<any>('/api/biblioteca/top-leitores'),
      req<any>('/api/biblioteca/top-visitantes'),
    ]).then(([leitores, visitantes]) => {
      setTopLeitores(leitores);
      setTopVisitantes(visitantes);
    }).catch(() => {});
  }, []);

  const catCounts = livros.reduce<Record<string, number>>((acc, l) => {
    acc[l.categoria] = (acc[l.categoria] || 0) + 1; return acc;
  }, {});
  const topCats = Object.entries(catCounts).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const taxaOcupacao = totalLivros > 0 ? Math.round((totalEmprestados / totalLivros) * 100) : 0;

  const anos = [now.getFullYear(), now.getFullYear() - 1, now.getFullYear() - 2];

  return (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 120 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#5E6AD2" />}
    >
      {/* Total overview */}
      <View style={sStyles.kpiGrid}>
        <KpiCard icon="library" label="Títulos" value={livros.length.toString()} color="#5E6AD2" />
        <KpiCard icon="albums" label="Exemplares" value={totalLivros.toString()} color="#26A69A" />
        <KpiCard icon="checkmark-circle" label="Disponíveis" value={totalDisp.toString()} color="#66BB6A" />
        <KpiCard icon="swap-horizontal" label="Emprestados" value={totalEmprestados.toString()} color="#FFA726" />
        <KpiCard icon="warning" label="Atrasados" value={atrasados.length.toString()} color="#EF5350" />
        <KpiCard icon="return-down-back" label="Devolvidos" value={devolvidos.length.toString()} color="#42A5F5" />
      </View>

      {/* Taxa ocupação */}
      <View style={sStyles.section}>
        <Text style={sStyles.sectionTitle}>Taxa de Ocupação dos Exemplares</Text>
        <View style={sStyles.progressRow}>
          <View style={sStyles.progressBg}>
            <View style={[sStyles.progressFill, { width: `${taxaOcupacao}%` as any, backgroundColor: taxaOcupacao > 80 ? '#EF5350' : taxaOcupacao > 50 ? '#FFA726' : '#66BB6A' }]} />
          </View>
          <Text style={sStyles.progressLabel}>{taxaOcupacao}%</Text>
        </View>
        <Text style={sStyles.progressSub}>{totalEmprestados} de {totalLivros} exemplares emprestados</Text>
      </View>

      {/* Monthly report */}
      <View style={sStyles.section}>
        <View style={sStyles.reportHeader}>
          <Ionicons name="bar-chart" size={16} color="#5E6AD2" />
          <Text style={sStyles.sectionTitle}>Relatório Mensal de Empréstimos</Text>
          <TouchableOpacity
            style={sStyles.pdfBtn}
            onPress={() => {
              const url = `/api/pdf/biblioteca/relatorio-mensal?mes=${mesSel}&ano=${anoSel}`;
              if (typeof window !== 'undefined') {
                window.open(url, '_blank');
              }
            }}
          >
            <Ionicons name="document-text-outline" size={13} color="#fff" />
            <Text style={sStyles.pdfBtnText}>PDF</Text>
          </TouchableOpacity>
        </View>

        {/* Month + Year selector */}
        <View style={sStyles.monthPicker}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {MESES.map((m, i) => (
              <TouchableOpacity
                key={i}
                style={[sStyles.monthBtn, mesSel === i + 1 && sStyles.monthBtnActive]}
                onPress={() => setMesSel(i + 1)}
              >
                <Text style={[sStyles.monthBtnText, mesSel === i + 1 && { color: '#fff' }]}>{m}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={sStyles.yearRow}>
            {anos.map(a => (
              <TouchableOpacity
                key={a}
                style={[sStyles.yearBtn, anoSel === a && sStyles.yearBtnActive]}
                onPress={() => setAnoSel(a)}
              >
                <Text style={[sStyles.yearBtnText, anoSel === a && { color: '#fff' }]}>{a}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {statsLoading ? (
          <AppLoader color="#5E6AD2" style={{ marginVertical: 16 }} />
        ) : statsData ? (
          <>
            <View style={sStyles.monthKpiRow}>
              <View style={sStyles.monthKpi}>
                <Text style={sStyles.monthKpiVal}>{statsData.totalEmprestimos}</Text>
                <Text style={sStyles.monthKpiLabel}>Empréstimos no mês</Text>
              </View>
              <View style={sStyles.monthKpi}>
                <Text style={[sStyles.monthKpiVal, { color: '#EF5350' }]}>{statsData.totalAtrasados}</Text>
                <Text style={sStyles.monthKpiLabel}>Em atraso</Text>
              </View>
            </View>

            {statsData.topLivros.length > 0 ? (
              <>
                <Text style={sStyles.topLivrosTitle}>Livros mais emprestados</Text>
                {statsData.topLivros.map((l, idx) => (
                  <View key={idx} style={sStyles.topLivroRow}>
                    <View style={sStyles.topRankBadge}>
                      <Text style={sStyles.topRankText}>{idx + 1}</Text>
                    </View>
                    <Text style={sStyles.topLivroTitulo} numberOfLines={1}>{l.titulo}</Text>
                    <View style={sStyles.topLivroBar}>
                      <View style={[sStyles.topLivroFill, {
                        width: `${Math.round((l.total / statsData.topLivros[0].total) * 100)}%` as any
                      }]} />
                    </View>
                    <Text style={sStyles.topLivroCount}>{l.total}×</Text>
                  </View>
                ))}
              </>
            ) : (
              <View style={styles.emptyBox}>
                <Ionicons name="bar-chart-outline" size={32} color="#444" />
                <Text style={[styles.emptyText, { fontSize: 13 }]}>Sem empréstimos em {MESES[mesSel - 1]}/{anoSel}</Text>
              </View>
            )}
          </>
        ) : null}
      </View>

      {/* Books by category */}
      {topCats.length > 0 && (
        <View style={sStyles.section}>
          <Text style={sStyles.sectionTitle}>Livros por Categoria</Text>
          {topCats.map(([cat, count]) => (
            <View key={cat} style={sStyles.catRow}>
              <View style={[sStyles.catDot, { backgroundColor: catColor(cat) }]} />
              <Text style={sStyles.catName} numberOfLines={1}>{cat}</Text>
              <View style={sStyles.catBarBg}>
                <View style={[sStyles.catBarFill, { width: `${Math.round((count / livros.length) * 100)}%` as any, backgroundColor: catColor(cat) }]} />
              </View>
              <Text style={sStyles.catCount}>{count}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Penalized students */}
      {penalizados.length > 0 && (
        <View style={[sStyles.section, { borderColor: '#EF535033' }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 }}>
            <Ionicons name="ban" size={16} color="#EF5350" />
            <Text style={[sStyles.sectionTitle, { color: '#EF5350' }]}>Estudantes Penalizados ({penalizados.length})</Text>
          </View>
          <Text style={{ color: '#666', fontSize: 12, marginBottom: 10 }}>
            Estudantes com 2 ou mais devoluções em atraso — bloqueados de novos empréstimos.
          </Text>
          {penalizados.map((p, i) => (
            <View key={i} style={sStyles.penalizadoRow}>
              <View style={sStyles.penalizadoIcon}>
                <Ionicons name="ban" size={14} color="#EF5350" />
              </View>
              <Text style={sStyles.penalizadoNome}>{p.nomeLeitor}</Text>
              <View style={sStyles.penalizadoChip}>
                <Text style={sStyles.penalizadoChipText}>{p.totalAtrasos} atraso{p.totalAtrasos !== 1 ? 's' : ''}</Text>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* Late loans */}
      {atrasados.length > 0 && (
        <View style={sStyles.section}>
          <Text style={[sStyles.sectionTitle, { color: '#EF5350' }]}>Em Atraso ({atrasados.length})</Text>
          {atrasados.map(e => {
            const dias = diasAtraso(e.dataPrevistaDevolucao);
            return (
              <View key={e.id} style={sStyles.atrasoRow}>
                <View style={{ flex: 1 }}>
                  <Text style={sStyles.atrasoTitulo} numberOfLines={1}>{e.livroTitulo}</Text>
                  <Text style={sStyles.atrasoLeitor}>{e.nomeLeitor} · Previsto: {fmtDate(e.dataPrevistaDevolucao)}</Text>
                </View>
                <View style={sStyles.atrasoChip}>
                  <Text style={sStyles.atrasoChipText}>{dias}d</Text>
                </View>
              </View>
            );
          })}
        </View>
      )}

      {/* Top borrowers */}
      {topLeitores.length > 0 && (
        <View style={sStyles.section}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 }}>
            <Ionicons name="trophy" size={16} color="#FFA726" />
            <Text style={sStyles.sectionTitle}>Estudantes que mais emprestam</Text>
          </View>
          {topLeitores.map((l, idx) => (
            <View key={l.alunoId} style={sStyles.topLivroRow}>
              <View style={[sStyles.topRankBadge, { backgroundColor: idx === 0 ? '#FFA72622' : '#5E6AD222' }]}>
                <Text style={[sStyles.topRankText, { color: idx === 0 ? '#FFA726' : '#5E6AD2' }]}>{idx + 1}</Text>
              </View>
              <Text style={sStyles.topLivroTitulo} numberOfLines={1}>{l.nomeLeitor}</Text>
              <View style={sStyles.topLivroBar}>
                <View style={[sStyles.topLivroFill, { width: `${Math.round((Number(l.total) / Number(topLeitores[0].total)) * 100)}%` as any, backgroundColor: '#FFA726' }]} />
              </View>
              <Text style={[sStyles.topLivroCount, { color: '#FFA726' }]}>{l.total}×</Text>
            </View>
          ))}
        </View>
      )}

      {/* Top visitors */}
      {topVisitantes.length > 0 && (
        <View style={sStyles.section}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 }}>
            <Ionicons name="people" size={16} color="#26A69A" />
            <Text style={sStyles.sectionTitle}>Estudantes que mais visitam</Text>
          </View>
          {topVisitantes.map((v, idx) => (
            <View key={v.alunoId} style={sStyles.topLivroRow}>
              <View style={[sStyles.topRankBadge, { backgroundColor: idx === 0 ? '#26A69A22' : '#5E6AD222' }]}>
                <Text style={[sStyles.topRankText, { color: idx === 0 ? '#26A69A' : '#5E6AD2' }]}>{idx + 1}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={sStyles.topLivroTitulo} numberOfLines={1}>{v.nomeAluno}</Text>
                {v.turmaNome && <Text style={{ color: '#666', fontSize: 10 }}>{v.turmaNome}</Text>}
              </View>
              <View style={sStyles.topLivroBar}>
                <View style={[sStyles.topLivroFill, { width: `${Math.round((Number(v.total) / Number(topVisitantes[0].total)) * 100)}%` as any, backgroundColor: '#26A69A' }]} />
              </View>
              <Text style={[sStyles.topLivroCount, { color: '#26A69A' }]}>{v.total}×</Text>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

// ─── Presenças Biblioteca Tab ─────────────────────────────────────────────────
interface PresencaBiblioteca {
  id: string;
  alunoId: string;
  nomeAluno: string;
  turmaId: string | null;
  turmaNome: string | null;
  sala: string | null;
  curso: string | null;
  dataPresenca: string;
  horaEntrada: string;
  registadoPor: string;
  createdAt: string;
}

function PresencasTab({ user, refreshing, onRefresh }: { user: any; refreshing: boolean; onRefresh: () => void }) {
  const { showToast } = useToast();
  const [presencas, setPresencas] = useState<PresencaBiblioteca[]>([]);
  const [loading, setLoading] = useState(true);
  const [dataSel, setDataSel] = useState(new Date().toISOString().slice(0, 10));
  const [showModal, setShowModal] = useState(false);
  const [alunoSearch, setAlunoSearch] = useState('');
  const [alunoResults, setAlunoResults] = useState<AlunoResult[]>([]);
  const [alunoSel, setAlunoSel] = useState<AlunoResult | null>(null);
  const [alunoFocused, setAlunoFocused] = useState(false);
  const [alunoSearching, setAlunoSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const alunoTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const rows = await req<PresencaBiblioteca[]>(`/api/biblioteca/presencas?data=${dataSel}`);
      setPresencas(rows);
    } catch (e) { showToast((e as Error).message, 'error'); }
    finally { setLoading(false); }
  }, [dataSel]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!alunoSearch.trim() || alunoSel) { setAlunoResults([]); return; }
    if (alunoTimeout.current) clearTimeout(alunoTimeout.current);
    alunoTimeout.current = setTimeout(async () => {
      setAlunoSearching(true);
      try {
        const res2 = await req<AlunoResult[]>(`/api/biblioteca/alunos-search?q=${encodeURIComponent(alunoSearch.trim())}`);
        setAlunoResults(res2);
      } catch { setAlunoResults([]); }
      finally { setAlunoSearching(false); }
    }, 350);
  }, [alunoSearch, alunoSel]);

  const registarPresenca = async () => {
    if (!alunoSel) { showToast('Selecione um estudante.', 'error'); return; }
    setSaving(true);
    try {
      await req('/api/biblioteca/presencas', {
        method: 'POST',
        body: JSON.stringify({
          alunoId: alunoSel.id,
          nomeAluno: `${alunoSel.nome} ${alunoSel.apelido}`.trim(),
          turmaId: alunoSel.turmaId || null,
          turmaNome: alunoSel.turmaNome || null,
          sala: alunoSel.sala || null,
          curso: alunoSel.curso || null,
          registadoPor: user?.nome || 'Sistema',
        }),
      });
      showToast('Presença registada!', 'success');
      setShowModal(false);
      setAlunoSel(null);
      setAlunoSearch('');
      setAlunoResults([]);
      load(true);
    } catch (e) {
      showToast((e as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const hoje = new Date().toISOString().slice(0, 10);
  const isHoje = dataSel === hoje;

  return (
    <View style={styles.flex}>
      {/* Header row */}
      <View style={[styles.searchRow, { justifyContent: 'space-between' }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <TextInput
            style={[mStyles.input, { flex: 0, width: 140, marginBottom: 0, fontSize: 13 }]}
            value={dataSel}
            onChangeText={setDataSel}
            placeholderTextColor="#555"
            selectionColor="#5E6AD2"
          />
          {!isHoje && (
            <TouchableOpacity
              style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: '#1a1a2e', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' }}
              onPress={() => setDataSel(hoje)}
            >
              <Text style={{ color: '#5E6AD2', fontSize: 12, fontWeight: '600' }}>Hoje</Text>
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity style={styles.addBtn} onPress={() => setShowModal(true)}>
          <Ionicons name="add" size={16} color="#fff" />
          <Text style={styles.addBtnTxt}>Novo Registo</Text>
        </TouchableOpacity>
      </View>

      {/* Summary */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, marginBottom: 8 }}>
        <Ionicons name="people" size={14} color="#26A69A" />
        <Text style={{ color: '#26A69A', fontSize: 13, fontWeight: '700' }}>{presencas.length} visita{presencas.length !== 1 ? 's' : ''}</Text>
        <Text style={{ color: '#555', fontSize: 13 }}>em {dataSel.split('-').reverse().join('/')}</Text>
      </View>

      {loading ? (
        <View style={styles.center}><AppLoader color="#5E6AD2" /></View>
      ) : presencas.length === 0 ? (
        <View style={styles.emptyBox}>
          <Ionicons name="people-outline" size={40} color="#333" />
          <Text style={styles.emptyText}>Sem presenças registadas</Text>
          <Text style={styles.emptySub}>Clique em + para registar a entrada de um estudante</Text>
        </View>
      ) : (
        <FlatList
          data={presencas}
          keyExtractor={i => i.id}
          contentContainerStyle={{ padding: 12, gap: 8, paddingBottom: 120 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#5E6AD2" />}
          renderItem={({ item: p }) => (
            <View style={{ backgroundColor: '#13131f', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)', flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: '#26A69A22', alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="person" size={18} color="#26A69A" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>{p.nomeAluno}</Text>
                <Text style={{ color: '#888', fontSize: 12 }}>
                  {p.turmaNome || 'Sem turma'}{p.sala ? ` · Sala ${p.sala}` : ''}{p.curso ? ` · ${p.curso}` : ''}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 2 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#26A69A22', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
                  <Ionicons name="time-outline" size={11} color="#26A69A" />
                  <Text style={{ color: '#26A69A', fontSize: 12, fontWeight: '700' }}>{p.horaEntrada}</Text>
                </View>
              </View>
            </View>
          )}
        />
      )}

      {/* Register presence modal */}
      <Modal visible={showModal} transparent animationType="fade" onRequestClose={() => setShowModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={centeredOverlay}>
          <View style={[mStyles.sheet, { maxHeight: 460 }]}>
            <View style={mStyles.header}>
              <View style={mStyles.headerLeft}>
                <Ionicons name="people" size={18} color="#26A69A" />
                <Text style={mStyles.headerTitle}>Registar Presença</Text>
              </View>
              <TouchableOpacity onPress={() => { setShowModal(false); setAlunoSel(null); setAlunoSearch(''); setAlunoResults([]); }} style={mStyles.closeBtn}>
                <Ionicons name="close" size={20} color="#aaa" />
              </TouchableOpacity>
            </View>
            <View style={{ padding: 16, gap: 4 }}>
              <MLabel>Estudante *</MLabel>
              {alunoSel ? (
                <View style={mStyles.alunoSel}>
                  <Ionicons name="person" size={16} color="#26A69A" />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: '#fff', fontWeight: '700' }}>{alunoSel.nome} {alunoSel.apelido}</Text>
                    {alunoSel.turmaNome && (
                      <Text style={{ color: '#aaa', fontSize: 12 }}>
                        {alunoSel.turmaNome}{alunoSel.sala ? ` · Sala ${alunoSel.sala}` : ''}{alunoSel.curso ? ` · ${alunoSel.curso}` : ''}
                      </Text>
                    )}
                  </View>
                  <TouchableOpacity onPress={() => setAlunoSel(null)}>
                    <Ionicons name="close-circle" size={18} color="#EF5350" />
                  </TouchableOpacity>
                </View>
              ) : (
                <View>
                  <StableSearchInput
                    value={alunoSearch}
                    onChangeText={setAlunoSearch}
                    inputStyle={[mStyles.input, alunoFocused && { borderColor: '#26A69A' }]}
                    placeholder="Pesquisar estudante por nome…"
                    iconColor="#555"
                  />
                  {alunoSearching && <AppLoader size="small" color="#26A69A" style={{ position: 'absolute', right: 12, top: 10 }} />}
                  {!alunoSel && alunoFocused && alunoResults.length > 0 && (
                    <View style={mStyles.livroDropdown}>
                      {alunoResults.map(a => (
                        <TouchableOpacity key={a.id} style={mStyles.livroOption} onPress={() => { setAlunoSel(a); setAlunoSearch(''); setAlunoResults([]); setAlunoFocused(false); }}>
                          <Text style={mStyles.livroOptionTitle}>{a.nome} {a.apelido}</Text>
                          <Text style={mStyles.livroOptionSub}>
                            {a.turmaNome || 'Sem turma'}{a.sala ? ` · Sala ${a.sala}` : ''}{a.curso ? ` · ${a.curso}` : ''}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                  {!alunoSel && alunoFocused && alunoResults.length === 0 && !alunoSearching && alunoSearch.trim() && (
                    <Text style={{ color: '#666', fontSize: 12, marginTop: 4 }}>Nenhum estudante encontrado</Text>
                  )}
                </View>
              )}

              <View style={[solStyles.infoBox, { marginTop: 12 }]}>
                <Ionicons name="time-outline" size={15} color="#26A69A" />
                <Text style={[solStyles.infoText, { color: '#888' }]}>
                  A hora de entrada será registada automaticamente com a hora actual.
                  Apenas uma presença por estudante por dia.
                </Text>
              </View>
            </View>
            <View style={mStyles.footer}>
              <TouchableOpacity style={mStyles.cancelBtn} onPress={() => { setShowModal(false); setAlunoSel(null); setAlunoSearch(''); setAlunoResults([]); }}>
                <Text style={{ color: '#aaa', fontWeight: '600' }}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[mStyles.saveBtn, { backgroundColor: '#26A69A' }]} onPress={registarPresenca} disabled={saving}>
                {saving ? <AppLoader color="#fff" size="small" /> : (
                  <>
                    <Ionicons name="checkmark" size={15} color="#fff" />
                    <Text style={{ color: '#fff', fontWeight: '700', marginLeft: 6 }}>Registar</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
              </KeyboardAvoidingView>
</Modal>
    </View>
  );
}

function KpiCard({ icon, label, value, color }: { icon: string; label: string; value: string; color: string }) {
  return (
    <View style={[sStyles.kpiCard, { borderColor: color + '40' }]}>
      <View style={[sStyles.kpiIcon, { backgroundColor: color + '22' }]}>
        <Ionicons name={icon as any} size={20} color={color} />
      </View>
      <Text style={[sStyles.kpiValue, { color }]}>{value}</Text>
      <Text style={sStyles.kpiLabel}>{label}</Text>
    </View>
  );
}

function MLabel({ children }: { children: string }) {
  return <Text style={mStyles.label}>{children}</Text>;
}
function MInput({ style, ...props }: React.ComponentProps<typeof TextInput> & { style?: any }) {
  return <TextInput style={[mStyles.input, style]} placeholderTextColor="#555" selectionColor="#5E6AD2" {...props} />;
}

// ─── Shared overlay style for centered modals ──────────────────────────────
const centeredOverlay: any = {
  flex: 1,
  backgroundColor: 'rgba(0,0,0,0.72)',
  justifyContent: 'center',
  alignItems: 'center',
  padding: 16,
};

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  tabBar: { backgroundColor: '#0d0d1f', borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.08)' },
  tab: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 11, paddingHorizontal: 16, position: 'relative' },
  tabActive: { borderBottomWidth: 2, borderBottomColor: '#5E6AD2' },
  tabLabel: { color: '#666', fontSize: 11, fontWeight: '600' },
  tabLabelActive: { color: '#5E6AD2' },
  badge: { backgroundColor: '#EF5350', borderRadius: 8, minWidth: 16, height: 16, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  badgeText: { color: '#fff', fontSize: 9, fontWeight: '800' },
  searchRow: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 10 },
  searchBox: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: '#1a1a2e', borderRadius: 10, paddingHorizontal: 12, gap: 8, height: 40, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  searchInput: { flex: 1, color: '#fff', fontSize: 16 },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 38, paddingHorizontal: 12, borderRadius: 20, backgroundColor: '#5E6AD2' },
  addBtnTxt: { color: '#fff', fontSize: 12, fontFamily: 'Inter_700Bold' },
  catFilterBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, height: 40, borderRadius: 10, backgroundColor: '#1a1a2e', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', maxWidth: 130 },
  catFilterBtnActive: { backgroundColor: '#5E6AD2', borderColor: '#5E6AD2' },
  catFilterBtnText: { color: '#aaa', fontSize: 12, fontWeight: '600', flex: 1 },
  filterRow: { flexDirection: 'row', paddingHorizontal: 12, paddingBottom: 10, gap: 8 },
  filterChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: '#1a1a2e', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  filterChipActive: { backgroundColor: '#5E6AD2', borderColor: '#5E6AD2' },
  filterChipText: { color: '#aaa', fontSize: 12, fontWeight: '600' },
  emptyBox: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60, gap: 10 },
  emptyText: { color: '#555', fontSize: 15, fontWeight: '600' },
  emptySub: { color: '#444', fontSize: 13 },
  inactiveHint: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#F59E0B18', borderRadius: 8, padding: 8, marginTop: 4, borderWidth: 1, borderColor: '#F59E0B30' },
  inactiveHintText: { color: '#F59E0B', fontSize: 12, fontWeight: '500' },
});

// Shelf book card styles
const shelfStyles = StyleSheet.create({
  bookcase: { gap: 0 },
  shelfRow: { marginBottom: 6 },
  booksRow: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    alignItems: 'flex-end',
    gap: 8,
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
  card: { backgroundColor: '#13131f', borderRadius: 6, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)', shadowColor: '#000', shadowOffset: { width: 2, height: 4 }, shadowOpacity: 0.35, shadowRadius: 4, elevation: 5 },
  coverWrap: { width: '100%', position: 'relative', overflow: 'hidden' },
  coverImg: { width: '100%', height: '100%' },
  coverPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4, padding: 4 },
  spineAccent: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4 },
  coverCatText: { fontWeight: '700', textAlign: 'center', opacity: 0.9 },
  availDot: { position: 'absolute', top: 5, right: 5, width: 8, height: 8, borderRadius: 4, borderWidth: 1, borderColor: 'rgba(0,0,0,0.3)' },
  lastCopyBadge: { position: 'absolute', bottom: 4, right: 4, backgroundColor: '#FFA726', borderRadius: 4, paddingHorizontal: 4, paddingVertical: 1 },
  lastCopyText: { color: '#fff', fontSize: 8, fontWeight: '800' },
  titleWrap: { paddingHorizontal: 5, paddingVertical: 5, backgroundColor: '#0d0d1a' },
  titleText: { color: '#ccc', fontWeight: '600', lineHeight: 14 },
  countBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 14, paddingBottom: 6 },
  countText: { color: '#666', fontSize: 12 },
  totalText: { color: '#5E6AD2', fontSize: 12, fontWeight: '700' },
});

// Book detail modal styles
const detailStyles = StyleSheet.create({
  topRow: { flexDirection: 'row', gap: 14, marginBottom: 14 },
  coverBox: { width: 90, borderRadius: 8, overflow: 'hidden', elevation: 4, shadowColor: '#000', shadowOffset: { width: 2, height: 4 }, shadowOpacity: 0.4, shadowRadius: 6 },
  coverImg: { width: 90, height: 130, borderRadius: 8 },
  coverPlaceholder: { width: 90, height: 130, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  title: { color: '#fff', fontSize: 15, fontWeight: '800', lineHeight: 20 },
  autor: { color: '#bbb', fontSize: 13 },
  editora: { color: '#777', fontSize: 12 },
  catBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, borderWidth: 1, alignSelf: 'flex-start' },
  catDot: { width: 7, height: 7, borderRadius: 4 },
  catText: { fontSize: 11, fontWeight: '700' },
  stockRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stockBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, borderWidth: 1 },
  stockText: { fontSize: 12, fontWeight: '700' },
  stockTotal: { color: '#666', fontSize: 11 },
  metaRow: { flexDirection: 'row', gap: 10, flexWrap: 'wrap', marginBottom: 12 },
  metaItem: { flexDirection: 'row', gap: 4, alignItems: 'center' },
  metaText: { color: '#777', fontSize: 12 },
  descBox: { backgroundColor: '#0d1120', borderRadius: 10, padding: 12, marginBottom: 10 },
  descLabel: { color: '#aaa', fontSize: 11, fontWeight: '700', marginBottom: 6 },
  descText: { color: '#ccc', fontSize: 13, lineHeight: 19 },
  warnBox: { flexDirection: 'row', gap: 8, backgroundColor: '#FFA72611', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: '#FFA72633', marginBottom: 8 },
  warnText: { color: '#FFA726', fontSize: 12, flex: 1, lineHeight: 17 },
});

// Solicitar modal styles
const solStyles = StyleSheet.create({
  bookPreview: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', backgroundColor: '#0d1120', borderRadius: 12, padding: 12 },
  previewImg: { width: 56, height: 80, borderRadius: 6 },
  previewPlaceholder: { width: 56, height: 80, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  previewTitulo: { color: '#fff', fontSize: 14, fontWeight: '700', lineHeight: 18 },
  previewAutor: { color: '#aaa', fontSize: 12, marginTop: 3 },
  previewDisp: { color: '#66BB6A', fontSize: 11, marginTop: 6 },
  daysLabel: { color: '#aaa', fontSize: 13, fontWeight: '600', marginBottom: 10 },
  dayBtns: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  dayBtn: { flex: 1, paddingVertical: 8, borderRadius: 10, backgroundColor: '#1a2040', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', alignItems: 'center' },
  dayBtnActive: { backgroundColor: '#5E6AD2', borderColor: '#5E6AD2' },
  dayBtnText: { color: '#aaa', fontSize: 13, fontWeight: '700' },
  daysInput: { backgroundColor: '#1a1a2e', color: '#fff', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', fontSize: 14 },
  infoBox: { flexDirection: 'row', gap: 8, backgroundColor: '#5E6AD211', borderRadius: 10, padding: 12 },
  infoText: { color: '#888', fontSize: 12, flex: 1, lineHeight: 17 },
});

// Emprestimos styles
const empStyles = StyleSheet.create({
  pendentesSection: { margin: 12, backgroundColor: '#FFA72611', borderRadius: 14, borderWidth: 1, borderColor: '#FFA72633', overflow: 'hidden' },
  pendenteHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderBottomWidth: 1, borderBottomColor: '#FFA72633' },
  pendenteTitle: { color: '#FFA726', fontSize: 13, fontWeight: '700', flex: 1 },
  pendenteCount: { backgroundColor: '#FFA726', borderRadius: 10, minWidth: 20, height: 20, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  pendenteCountText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  pedidoCard: { flexDirection: 'row', alignItems: 'center', padding: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' },
  pedidoTitulo: { color: '#fff', fontSize: 13, fontWeight: '700' },
  pedidoLeitor: { color: '#aaa', fontSize: 12 },
  pedidoData: { color: '#555', fontSize: 11, marginTop: 2 },
  diasChip: { flexDirection: 'row', gap: 3, alignItems: 'center', backgroundColor: '#5E6AD222', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 },
  diasChipText: { color: '#5E6AD2', fontSize: 10, fontWeight: '700' },
  pedidoBtns: { flexDirection: 'row', gap: 6 },
  aprovarBtn: { width: 44, height: 44, borderRadius: 10, backgroundColor: '#66BB6A', alignItems: 'center', justifyContent: 'center' },
  rejeitarBtn: { width: 44, height: 44, borderRadius: 10, backgroundColor: '#EF5350', alignItems: 'center', justifyContent: 'center' },
});

// Emprestimo card styles
const eStyles = StyleSheet.create({
  card: { backgroundColor: '#13131f', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)' },
  cardAtrasado: { borderColor: '#EF535044', backgroundColor: '#EF535011' },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 },
  livroInfo: { flex: 1, marginRight: 10 },
  livroTitulo: { color: '#fff', fontSize: 14, fontWeight: '700' },
  leitorRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 },
  leitorNome: { color: '#aaa', fontSize: 12 },
  tipoBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  tipoText: { fontSize: 10, fontWeight: '700' },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, borderWidth: 1 },
  statusText: { fontSize: 11, fontWeight: '700' },
  datesRow: { flexDirection: 'row', gap: 14, marginBottom: 8 },
  datePill: { flexDirection: 'row', gap: 5, alignItems: 'flex-start' },
  dateLabel: { fontSize: 10 },
  dateVal: { fontSize: 12, fontWeight: '600' },
  atrasoAlert: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 8 },
  atrasoText: { color: '#EF5350', fontSize: 12, fontWeight: '600' },
  devolverBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#26A69A', borderRadius: 8, paddingVertical: 8 },
  devolverText: { color: '#fff', fontSize: 13, fontWeight: '700' },
});

// Desejos styles
const desejosStyles = StyleSheet.create({
  infoBox: { flexDirection: 'row', gap: 8, marginHorizontal: 12, marginBottom: 10, backgroundColor: '#EC407A11', borderRadius: 10, padding: 10, borderWidth: 1, borderColor: '#EC407A33' },
  infoText: { color: '#aaa', fontSize: 12, flex: 1, lineHeight: 16 },
  card: { backgroundColor: '#13131f', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)' },
  cardTop: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  titulo: { color: '#fff', fontSize: 14, fontWeight: '700' },
  autor: { color: '#888', fontSize: 12, marginTop: 2 },
  motivoBox: { flexDirection: 'row', gap: 5, marginTop: 6, alignItems: 'flex-start' },
  motivo: { color: '#777', fontSize: 12, flex: 1, fontStyle: 'italic' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 6 },
  metaText: { color: '#666', fontSize: 11 },
  metaDate: { color: '#555', fontSize: 11, marginLeft: 'auto' },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, borderWidth: 1, alignSelf: 'flex-start' },
  statusText: { fontSize: 11, fontWeight: '700' },
  actions: { flexDirection: 'row', gap: 8, marginTop: 10 },
  adquirirBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, backgroundColor: '#66BB6A' },
  adquirirText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  rejeitarBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, backgroundColor: '#EF5350' },
  rejeitarText: { color: '#fff', fontSize: 12, fontWeight: '700' },
});

// Modal styles
const mStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', padding: 16 },
  sheet: { backgroundColor: '#0f1423', borderRadius: 20, maxHeight: '92%', width: '100%', maxWidth: 640 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 18, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.08)' },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  headerTitle: { color: '#fff', fontSize: 16, fontWeight: '700' },
  closeBtn: { width: 44, height: 44, borderRadius: 10, backgroundColor: '#1a1a2e', alignItems: 'center', justifyContent: 'center' },
  body: { maxHeight: 480 },
  footer: { flexDirection: 'row', gap: 10, padding: 16, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)' },
  cancelBtn: { flex: 1, paddingVertical: 13, alignItems: 'center', borderRadius: 10, backgroundColor: '#1a1a2e' },
  saveBtn: { flex: 2, flexDirection: 'row', paddingVertical: 13, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: '#5E6AD2' },
  label: { color: '#aaa', fontSize: 12, fontWeight: '600', marginBottom: 6, marginTop: 10 },
  input: { backgroundColor: '#13131f', color: '#fff', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', fontSize: 14, marginBottom: 4 },
  chip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14, backgroundColor: '#13131f', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  chipActive: { backgroundColor: '#5E6AD2', borderColor: '#5E6AD2' },
  chipText: { color: '#aaa', fontSize: 11, fontWeight: '600' },
  livroSel: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#13131f', borderRadius: 10, padding: 10, marginBottom: 0, gap: 10, borderWidth: 1, borderColor: '#5E6AD244' },
  autorAutoFill: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#5E6AD210', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7, marginBottom: 4, borderWidth: 1, borderColor: '#5E6AD230' },
  autorAutoFillLabel: { color: '#5E6AD2', fontSize: 11, fontWeight: '700' },
  autorAutoFillValue: { color: '#ccc', fontSize: 12, flex: 1 },
  alunoSel: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#13131f', borderRadius: 10, padding: 10, marginBottom: 8, gap: 10, borderWidth: 1, borderColor: '#5E6AD244' },
  livroDropdown: { backgroundColor: '#0d1120', borderRadius: 10, marginBottom: 8, borderWidth: 1, borderColor: '#5E6AD244', overflow: 'hidden', maxHeight: 240 },
  livroOption: { padding: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' },
  livroOptionTitle: { color: '#fff', fontSize: 13, fontWeight: '600' },
  livroOptionSub: { color: '#888', fontSize: 11, marginTop: 2 },
  capaImgLarge: { width: 90, height: 130, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  capaPreviewBox: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 14, backgroundColor: '#0a0d1a', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  capaRemoveBtn: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  capaEmpty: { alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: '#0a0d1a', height: 80, marginBottom: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)', borderStyle: 'dashed' },
  capaModeRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  capaModeBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 9, borderRadius: 10, backgroundColor: '#13131f', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  capaModeBtnActive: { backgroundColor: '#5E6AD2', borderColor: '#5E6AD2' },
  capaModeBtnText: { color: '#777', fontSize: 12, fontWeight: '600' },
  uploadBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 16, borderRadius: 12, backgroundColor: '#5E6AD215', borderWidth: 1.5, borderColor: '#5E6AD244', borderStyle: 'dashed', marginBottom: 4 },
  uploadBtnText: { color: '#5E6AD2', fontSize: 14, fontWeight: '600' },
  customCatRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12, marginBottom: 6 },
  customCatLabel: { color: '#888', fontSize: 12, fontWeight: '600' },
  section: { marginHorizontal: 16, marginBottom: 14, backgroundColor: '#0d1120', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 12 },
  sectionTitle: { color: '#aaa', fontSize: 11, fontWeight: '700', letterSpacing: 0.8, flex: 1 },
  catSelectedBadge: { backgroundColor: '#5E6AD222', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: '#5E6AD244' },
  catSelectedText: { color: '#5E6AD2', fontSize: 11, fontWeight: '700' },
  catGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  catGridItem: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 10, backgroundColor: '#13131f', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  catDot: { width: 7, height: 7, borderRadius: 4 },
  catGridText: { color: '#aaa', fontSize: 12 },
});

// Category picker styles
const catPickerStyles = StyleSheet.create({
  catRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)', backgroundColor: '#13131f' },
  catDot: { width: 10, height: 10, borderRadius: 5 },
  catLabel: { color: '#ccc', fontSize: 13, flex: 1, fontWeight: '500' },
  catCount: { color: '#555', fontSize: 11 },
});

// Stats styles
const sStyles = StyleSheet.create({
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  kpiCard: { width: '31%', backgroundColor: '#13131f', borderRadius: 12, padding: 12, alignItems: 'center', gap: 6, borderWidth: 1 },
  kpiIcon: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  kpiValue: { fontSize: 20, fontWeight: '800' },
  kpiLabel: { color: '#666', fontSize: 11, fontWeight: '600' },
  section: { backgroundColor: '#13131f', borderRadius: 14, padding: 14, gap: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)' },
  reportHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionTitle: { color: '#fff', fontSize: 14, fontWeight: '700', flex: 1 },
  pdfBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#5E6AD2', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  pdfBtnText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  progressBg: { flex: 1, height: 8, borderRadius: 4, backgroundColor: '#1a1a2e', overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 4 },
  progressLabel: { color: '#fff', fontSize: 14, fontWeight: '700', minWidth: 36, textAlign: 'right' },
  progressSub: { color: '#666', fontSize: 12 },
  catRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  catDot: { width: 8, height: 8, borderRadius: 4 },
  catName: { color: '#aaa', fontSize: 12, width: 100 },
  catBarBg: { flex: 1, height: 6, borderRadius: 3, backgroundColor: '#1a1a2e', overflow: 'hidden' },
  catBarFill: { height: '100%', borderRadius: 3 },
  catCount: { color: '#fff', fontSize: 12, fontWeight: '700', minWidth: 20, textAlign: 'right' },
  atrasoRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' },
  atrasoTitulo: { color: '#fff', fontSize: 13, fontWeight: '600' },
  atrasoLeitor: { color: '#888', fontSize: 11, marginTop: 2 },
  atrasoChip: { backgroundColor: '#EF535022', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: '#EF535044' },
  atrasoChipText: { color: '#EF5350', fontSize: 12, fontWeight: '800' },
  // Monthly report
  monthPicker: { gap: 10 },
  monthBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: '#1a1a2e', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  monthBtnActive: { backgroundColor: '#5E6AD2', borderColor: '#5E6AD2' },
  monthBtnText: { color: '#888', fontSize: 12, fontWeight: '600' },
  yearRow: { flexDirection: 'row', gap: 8 },
  yearBtn: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 16, backgroundColor: '#1a1a2e', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  yearBtnActive: { backgroundColor: '#5E6AD2', borderColor: '#5E6AD2' },
  yearBtnText: { color: '#888', fontSize: 12, fontWeight: '600' },
  monthKpiRow: { flexDirection: 'row', gap: 12 },
  monthKpi: { flex: 1, backgroundColor: '#0d1120', borderRadius: 10, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)' },
  monthKpiVal: { color: '#5E6AD2', fontSize: 28, fontWeight: '800' },
  monthKpiLabel: { color: '#666', fontSize: 11, marginTop: 2 },
  topLivrosTitle: { color: '#aaa', fontSize: 12, fontWeight: '700', marginTop: 4 },
  topLivroRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 5 },
  topRankBadge: { width: 22, height: 22, borderRadius: 6, backgroundColor: '#5E6AD222', alignItems: 'center', justifyContent: 'center' },
  topRankText: { color: '#5E6AD2', fontSize: 11, fontWeight: '800' },
  topLivroTitulo: { flex: 1, color: '#ddd', fontSize: 12 },
  topLivroBar: { width: 60, height: 6, borderRadius: 3, backgroundColor: '#1a1a2e', overflow: 'hidden' },
  topLivroFill: { height: '100%', borderRadius: 3, backgroundColor: '#5E6AD2' },
  topLivroCount: { color: '#5E6AD2', fontSize: 12, fontWeight: '700', minWidth: 24, textAlign: 'right' },
  // Penalizados
  penalizadoRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' },
  penalizadoIcon: { width: 26, height: 26, borderRadius: 8, backgroundColor: '#EF535022', alignItems: 'center', justifyContent: 'center' },
  penalizadoNome: { color: '#fff', fontSize: 13, flex: 1 },
  penalizadoChip: { backgroundColor: '#EF535022', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: '#EF535044' },
  penalizadoChipText: { color: '#EF5350', fontSize: 11, fontWeight: '700' },
});
