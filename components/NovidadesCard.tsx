import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, Platform, Animated,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/colors';
import { apiRequest } from '@/lib/query-client';

const STORAGE_KEY = 'siga_novidades_vistas_v1';

interface Novidade {
  id: string;
  emoji: string;
  titulo: string;
  descricao: string;
  data: string;
  categoria: string;
  cor: string;
}

function formatData(iso: string): string {
  try {
    const [y, m, d] = iso.split('-');
    const meses = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
    return `${d} ${meses[parseInt(m, 10) - 1]} ${y}`;
  } catch {
    return iso;
  }
}

export default function NovidadesCard() {
  const [novidades, setNovidades] = useState<Novidade[]>([]);
  const [vistas, setVistas] = useState<Set<string>>(new Set());
  const [collapsed, setCollapsed] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const naoVistas = novidades.filter(n => !vistas.has(n.id)).length;

  const carregarVistas = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) setVistas(new Set(JSON.parse(raw)));
    } catch {}
  }, []);

  const marcarVista = useCallback(async (id: string) => {
    setVistas(prev => {
      const next = new Set(prev);
      next.add(id);
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([...next])).catch(() => {});
      return next;
    });
  }, []);

  const marcarTodasVistas = useCallback(async () => {
    const todos = novidades.map(n => n.id);
    const set = new Set(todos);
    setVistas(set);
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(todos)).catch(() => {});
  }, [novidades]);

  useEffect(() => {
    carregarVistas();
    apiRequest('GET', '/api/novidades')
      .then(r => r.json())
      .then((data: Novidade[]) => {
        setNovidades(data);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  if (!loaded || novidades.length === 0) return null;

  return (
    <View style={s.wrap}>
      {/* Cabeçalho */}
      <TouchableOpacity
        style={s.header}
        onPress={() => setCollapsed(c => !c)}
        activeOpacity={0.7}
      >
        <View style={s.headerLeft}>
          <View style={s.headerBar} />
          <Text style={s.headerTitle}>✨ Novidades do Sistema</Text>
          {naoVistas > 0 && (
            <View style={s.badgeWrap}>
              <Text style={s.badgeText}>{naoVistas} nova{naoVistas > 1 ? 's' : ''}</Text>
            </View>
          )}
        </View>
        <View style={s.headerRight}>
          {!collapsed && naoVistas > 0 && (
            <TouchableOpacity onPress={marcarTodasVistas} style={s.lerTodos}>
              <Text style={s.lerTodosText}>Marcar todas</Text>
            </TouchableOpacity>
          )}
          <Ionicons
            name={collapsed ? 'chevron-down' : 'chevron-up'}
            size={16}
            color={Colors.textMuted}
          />
        </View>
      </TouchableOpacity>

      {/* Lista horizontal */}
      {!collapsed && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.lista}
        >
          {novidades.map(nov => {
            const nova = !vistas.has(nov.id);
            return (
              <TouchableOpacity
                key={nov.id}
                style={[s.card, { borderTopColor: nov.cor }]}
                activeOpacity={0.8}
                onPress={() => marcarVista(nov.id)}
              >
                {/* Badge NOVO */}
                {nova && (
                  <View style={[s.novoBadge, { backgroundColor: nov.cor }]}>
                    <Text style={s.novoText}>NOVO</Text>
                  </View>
                )}

                {/* Emoji */}
                <Text style={s.emoji}>{nov.emoji}</Text>

                {/* Categoria */}
                <View style={[s.catBadge, { backgroundColor: nov.cor + '22', borderColor: nov.cor + '44' }]}>
                  <Text style={[s.catText, { color: nov.cor }]}>{nov.categoria}</Text>
                </View>

                {/* Título */}
                <Text style={s.titulo} numberOfLines={2}>{nov.titulo}</Text>

                {/* Descrição */}
                <Text style={s.descricao} numberOfLines={3}>{nov.descricao}</Text>

                {/* Data */}
                <View style={s.dataRow}>
                  <Ionicons name="calendar-outline" size={11} color={Colors.textMuted} />
                  <Text style={s.dataText}>{formatData(nov.data)}</Text>
                </View>

                {/* Indicador lido/não lido */}
                <View style={s.lidoRow}>
                  <View style={[s.lidoDot, { backgroundColor: nova ? nov.cor : Colors.textMuted + '44' }]} />
                  <Text style={[s.lidoText, { color: nova ? nov.cor : Colors.textMuted }]}>
                    {nova ? 'Toca para marcar como lido' : 'Lido'}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const CARD_W = 200;

const s = StyleSheet.create({
  wrap: {
    marginHorizontal: 0,
    marginTop: 6,
    marginBottom: 4,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  headerBar: {
    width: 3,
    height: 16,
    borderRadius: 2,
    backgroundColor: Colors.gold,
  },
  headerTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 14,
    color: Colors.text,
  },
  badgeWrap: {
    backgroundColor: Colors.gold + '22',
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: Colors.gold + '44',
  },
  badgeText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 10,
    color: Colors.gold,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  lerTodos: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: Colors.backgroundElevated,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  lerTodosText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 11,
    color: Colors.textSecondary,
  },

  lista: {
    paddingHorizontal: 16,
    paddingBottom: 14,
    paddingTop: 4,
    gap: 10,
    flexDirection: 'row',
  },

  card: {
    width: CARD_W,
    backgroundColor: Colors.backgroundCard,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    borderTopWidth: 3,
    padding: 14,
    gap: 7,
    position: 'relative',
    overflow: 'hidden',
  },

  novoBadge: {
    position: 'absolute',
    top: 10,
    right: 10,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  novoText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 9,
    color: '#fff',
    letterSpacing: 0.5,
  },

  emoji: {
    fontSize: 28,
    lineHeight: 32,
  },

  catBadge: {
    alignSelf: 'flex-start',
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderWidth: 1,
  },
  catText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },

  titulo: {
    fontFamily: 'Inter_700Bold',
    fontSize: 13,
    color: Colors.text,
    lineHeight: 18,
  },

  descricao: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: Colors.textSecondary,
    lineHeight: 16,
    flex: 1,
  },

  dataRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  dataText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 10,
    color: Colors.textMuted,
  },

  lidoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 2,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  lidoDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  lidoText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 10,
  },
});
