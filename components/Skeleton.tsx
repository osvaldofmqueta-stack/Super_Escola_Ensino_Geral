import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Platform, View, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AppLoader from '@/components/AppLoader';
import { Colors } from '@/constants/colors';

export function SkeletonBlock({
  width,
  height,
  radius = 6,
  style,
}: {
  width: number | string;
  height: number;
  radius?: number;
  style?: any;
}) {
  const opacity = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    const nd = Platform.OS !== 'web';
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.9, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: nd }),
        Animated.timing(opacity, { toValue: 0.4, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: nd }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);
  return (
    <Animated.View
      style={[
        { width: width as any, height, borderRadius: radius, backgroundColor: Colors.border, opacity },
        style,
      ]}
    />
  );
}

export function SkeletonList({ rows = 5, withAvatar = false }: { rows?: number; withAvatar?: boolean }) {
  return (
    <View style={{ gap: 8 }}>
      {Array.from({ length: rows }).map((_, i) => (
        <View
          key={i}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            padding: 12,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: Colors.border,
            backgroundColor: Colors.cardBackground,
          }}
        >
          {withAvatar && <SkeletonBlock width={36} height={36} radius={18} />}
          <View style={{ flex: 1, gap: 6 }}>
            <SkeletonBlock width={'70%' as any} height={12} />
            <SkeletonBlock width={'45%' as any} height={10} />
            <SkeletonBlock width={'30%' as any} height={9} />
          </View>
          <SkeletonBlock width={70} height={20} radius={10} />
        </View>
      ))}
    </View>
  );
}

export function SkeletonGrid({ items = 6, columns = 3 }: { items?: number; columns?: number }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {Array.from({ length: items }).map((_, i) => (
        <View
          key={i}
          style={{
            flexBasis: `${100 / columns - 2}%` as any,
            flexGrow: 1,
            padding: 12,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: Colors.border,
            backgroundColor: Colors.cardBackground,
            gap: 8,
          }}
        >
          <SkeletonBlock width={'60%' as any} height={14} />
          <SkeletonBlock width={'90%' as any} height={10} />
          <SkeletonBlock width={'40%' as any} height={10} />
        </View>
      ))}
    </View>
  );
}

export function SkeletonTable({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <View style={{ borderWidth: 1, borderColor: Colors.border, borderRadius: 8, overflow: 'hidden' }}>
      {Array.from({ length: rows }).map((_, r) => (
        <View
          key={r}
          style={{
            flexDirection: 'row',
            gap: 8,
            paddingVertical: 10,
            paddingHorizontal: 12,
            borderBottomWidth: r === rows - 1 ? 0 : 1,
            borderColor: Colors.border,
            backgroundColor: r === 0 ? Colors.background : Colors.cardBackground,
          }}
        >
          {Array.from({ length: cols }).map((_, c) => (
            <SkeletonBlock key={c} width={'18%' as any} height={r === 0 ? 11 : 14} />
          ))}
        </View>
      ))}
    </View>
  );
}

export function SkeletonStatCards({ items = 4 }: { items?: number }) {
  return (
    <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
      {Array.from({ length: items }).map((_, i) => (
        <View
          key={i}
          style={{
            flex: 1,
            minWidth: 70,
            padding: 12,
            borderRadius: 10,
            borderWidth: 1,
            borderColor: Colors.border,
            backgroundColor: Colors.cardBackground,
            gap: 8,
          }}
        >
          <SkeletonBlock width={28} height={28} radius={8} />
          <SkeletonBlock width={'80%' as any} height={16} />
          <SkeletonBlock width={'55%' as any} height={11} />
        </View>
      ))}
    </View>
  );
}

export function SkeletonDashboard() {
  return (
    <View style={{ padding: 16, gap: 14 }}>
      <SkeletonStatCards items={4} />
      <SkeletonBlock width={'50%' as any} height={13} />
      <SkeletonGrid items={6} columns={3} />
      <SkeletonBlock width={'45%' as any} height={13} />
      <SkeletonList rows={5} withAvatar />
    </View>
  );
}

export function SkeletonPage({
  variant = 'list',
  tabs = 0,
  statItems = 4,
  rows = 6,
}: {
  variant?: 'list' | 'stats-list' | 'table' | 'stats-table' | 'tabs-stats';
  tabs?: number;
  statItems?: number;
  rows?: number;
}) {
  const insets = useSafeAreaInsets();
  const showStats = variant === 'stats-list' || variant === 'stats-table' || variant === 'tabs-stats';
  const showList = variant === 'list' || variant === 'stats-list' || variant === 'tabs-stats';
  const showTable = variant === 'table' || variant === 'stats-table';
  return (
    <View style={{ flex: 1, backgroundColor: Colors.background, paddingTop: insets.top }}>
      {/* Barra de topo simulada */}
      <View style={{
        height: 52,
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        gap: 12,
        borderBottomWidth: 1,
        borderBottomColor: Colors.border,
      }}>
        <SkeletonBlock width={20} height={20} radius={6} />
        <SkeletonBlock width={160} height={14} />
        <View style={{ flex: 1 }} />
        <SkeletonBlock width={30} height={30} radius={8} />
      </View>

      <View style={{ padding: 14, gap: 12 }}>
        {/* Barra de pesquisa simulada */}
        <SkeletonBlock width={'100%' as any} height={38} radius={10} />

        {/* Separadores de tab */}
        {tabs > 0 && (
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {Array.from({ length: tabs }).map((_, i) => (
              <SkeletonBlock key={i} width={72} height={28} radius={14} />
            ))}
          </View>
        )}

        {/* Cartões de estatísticas */}
        {showStats && <SkeletonStatCards items={statItems} />}

        {/* Lista */}
        {showList && <SkeletonList rows={rows} withAvatar />}

        {/* Tabela */}
        {showTable && <SkeletonTable rows={rows} />}
      </View>
    </View>
  );
}

export function SyncPill({ label = 'A sincronizar com o servidor…' }: { label?: string }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        alignSelf: 'center',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 14,
        backgroundColor: Colors.info + '14',
        borderWidth: 1,
        borderColor: Colors.info + '44',
        marginVertical: 8,
      }}
    >
      <AppLoader size="small" color={Colors.info} />
      <Text style={{ color: Colors.info, fontSize: 11, fontWeight: '600' }}>{label}</Text>
    </View>
  );
}
