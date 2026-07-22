import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Modal, SectionList,
  TextInput, Platform, Keyboard, Animated,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons, FontAwesome5, MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Colors } from '@/constants/colors';
import { useAuth } from '@/context/AuthContext';
import { getNavItemsForRole, NavDataItem, NavIconLib } from '@/constants/navData';

// ── Ícone genérico por biblioteca ─────────────────────────────────────────────
function NavIcon({ icon, iconLib, color, size = 20 }: { icon: string; iconLib?: NavIconLib; color: string; size?: number }) {
  if (iconLib === 'mci') return <MaterialCommunityIcons name={icon as any} size={size} color={color} />;
  if (iconLib === 'fa5') return <FontAwesome5 name={icon as any} size={size - 2} color={color} />;
  if (iconLib === 'mi')  return <MaterialIcons name={icon as any} size={size} color={color} />;
  return <Ionicons name={icon as any} size={size} color={color} />;
}

// ── Agrupar itens por secção ──────────────────────────────────────────────────
function groupBySection(items: NavDataItem[]): { title: string; data: NavDataItem[] }[] {
  const map = new Map<string, NavDataItem[]>();
  for (const item of items) {
    const sec = item.section;
    if (!map.has(sec)) map.set(sec, []);
    map.get(sec)!.push(item);
  }
  return Array.from(map.entries()).map(([title, data]) => ({ title, data }));
}

interface GlobalSearchProps {
  visible: boolean;
  onClose: () => void;
}

export default function GlobalSearch({ visible, onClose }: GlobalSearchProps) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const [query, setQuery] = useState('');
  const inputRef = useRef<TextInput>(null);
  const slideAnim = useRef(new Animated.Value(-80)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  // Todos os itens do perfil actual
  const allItems = useMemo(() => getNavItemsForRole(user?.role ?? ''), [user?.role]);

  // Secções para mostrar (filtradas ou completas)
  const sections = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) {
      return groupBySection(allItems);
    }
    const filtered = allItems.filter(item =>
      item.label.toLowerCase().includes(q) ||
      item.section.toLowerCase().includes(q)
    );
    return groupBySection(filtered);
  }, [query, allItems]);

  const totalResults = useMemo(() => sections.reduce((acc, s) => acc + s.data.length, 0), [sections]);

  useEffect(() => {
    const nd = Platform.OS !== 'web';
    if (visible) {
      setQuery('');
      Animated.parallel([
        Animated.spring(slideAnim, { toValue: 0, useNativeDriver: nd, speed: 24, bounciness: 4 }),
        Animated.timing(opacityAnim, { toValue: 1, duration: 180, useNativeDriver: nd }),
      ]).start(() => {
        setTimeout(() => inputRef.current?.focus(), 60);
      });
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, { toValue: -80, duration: 140, useNativeDriver: nd }),
        Animated.timing(opacityAnim, { toValue: 0, duration: 140, useNativeDriver: nd }),
      ]).start();
    }
  }, [visible]);

  const handleSelect = (item: NavDataItem) => {
    Keyboard.dismiss();
    onClose();
    setTimeout(() => router.push(item.route as any), 150);
  };

  const renderSectionHeader = ({ section }: { section: { title: string; data: NavDataItem[] } }) => (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{section.title}</Text>
      <View style={styles.sectionLine} />
    </View>
  );

  const renderItem = ({ item }: { item: NavDataItem }) => (
    <TouchableOpacity style={styles.resultItem} onPress={() => handleSelect(item)} activeOpacity={0.7}>
      <View style={[styles.resultIcon, { backgroundColor: item.color + '22' }]}>
        <NavIcon icon={item.icon} iconLib={item.iconLib} color={item.color} />
      </View>
      <View style={styles.resultText}>
        <Text style={styles.resultLabel}>{item.label}</Text>
        <Text style={styles.resultSection}>{item.section}</Text>
      </View>
      <Ionicons name="chevron-forward" size={14} color={Colors.textMuted} />
    </TouchableOpacity>
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <Animated.View style={[styles.backdrop, { opacity: opacityAnim }]}>
        <TouchableOpacity style={StyleSheet.absoluteFill} onPress={onClose} activeOpacity={1} />

        <Animated.View
          style={[
            styles.panel,
            { paddingTop: insets.top + 10, transform: [{ translateY: slideAnim }] },
          ]}
        >
          {/* Barra de pesquisa */}
          <View style={styles.searchBar}>
            <Ionicons name="search" size={18} color={Colors.textMuted} style={styles.searchIcon} />
            <TextInput
              ref={inputRef}
              style={styles.input}
              value={query}
              onChangeText={setQuery}
              placeholder="Pesquisar no menu..."
              placeholderTextColor={Colors.textMuted}
              autoCorrect={false}
              autoCapitalize="none"
              returnKeyType="search"
            />
            {query.length > 0 && (
              <TouchableOpacity onPress={() => setQuery('')} style={styles.clearBtn}>
                <Ionicons name="close-circle" size={18} color={Colors.textMuted} />
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={onClose} style={styles.cancelBtn}>
              <Text style={styles.cancelText}>Cancelar</Text>
            </TouchableOpacity>
          </View>

          {/* Contador */}
          <View style={styles.countRow}>
            <Ionicons name="apps" size={13} color={Colors.textMuted} />
            <Text style={styles.countText}>
              {query.trim()
                ? `${totalResults} resultado${totalResults !== 1 ? 's' : ''} para "${query}"`
                : `${totalResults} opções disponíveis`}
            </Text>
          </View>

          {/* Lista agrupada por secção */}
          <SectionList
            sections={sections}
            keyExtractor={item => item.key}
            renderItem={renderItem}
            renderSectionHeader={renderSectionHeader}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            stickySectionHeadersEnabled={false}
            contentContainerStyle={styles.list}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Ionicons name="search-outline" size={36} color={Colors.textMuted} />
                <Text style={styles.emptyText}>Nenhum resultado para "{query}"</Text>
                <Text style={styles.emptyHint}>Tente outro termo de pesquisa</Text>
              </View>
            }
          />
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
  },
  panel: {
    backgroundColor: Colors.backgroundCard,
    maxHeight: '88%',
    borderBottomLeftRadius: 22,
    borderBottomRightRadius: 22,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 20,
  } as any,
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 14,
    marginBottom: 6,
    backgroundColor: Colors.backgroundElevated,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 10 : 4,
    borderWidth: 1,
    borderColor: Colors.accent + '50',
  },
  searchIcon: {
    marginRight: 8,
  },
  input: {
    flex: 1,
    color: Colors.text,
    fontSize: 15,
    fontFamily: 'Inter_400Regular',
    minHeight: 36,
  } as any,
  clearBtn: {
    padding: 4,
  },
  cancelBtn: {
    marginLeft: 10,
    paddingHorizontal: 2,
  },
  cancelText: {
    color: Colors.accent,
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
  },
  countRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 16,
    paddingBottom: 6,
  },
  countText: {
    color: Colors.textMuted,
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
  },
  list: {
    paddingHorizontal: 12,
    paddingBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 14,
    paddingBottom: 6,
    paddingHorizontal: 4,
    gap: 8,
  },
  sectionTitle: {
    color: Colors.textMuted,
    fontSize: 11,
    fontFamily: 'Inter_600SemiBold',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    flexShrink: 0,
  },
  sectionLine: {
    flex: 1,
    height: 1,
    backgroundColor: Colors.border,
  },
  resultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 9,
    paddingHorizontal: 10,
    backgroundColor: Colors.backgroundElevated,
    borderRadius: 10,
    gap: 10,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  resultIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  resultText: {
    flex: 1,
  },
  resultLabel: {
    color: Colors.text,
    fontSize: 14,
    fontFamily: 'Inter_500Medium',
  },
  resultSection: {
    color: Colors.textMuted,
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
    marginTop: 1,
  },
  separator: {
    height: 4,
  },
  emptyState: {
    alignItems: 'center',
    paddingTop: 40,
    gap: 8,
  },
  emptyText: {
    color: Colors.text,
    fontSize: 14,
    fontFamily: 'Inter_500Medium',
  },
  emptyHint: {
    color: Colors.textMuted,
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
  },
});
