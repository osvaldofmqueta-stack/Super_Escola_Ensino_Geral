import React, { useEffect, useRef } from 'react';
import { View, Animated, Platform, StyleSheet, Text } from 'react-native';
import { Colors } from '@/constants/colors';

function SkeletonBar({ width, height = 14, style }: { width: number | string; height?: number; style?: any }) {
  const anim = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const nd = Platform.OS !== 'web';
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 800, useNativeDriver: nd }),
        Animated.timing(anim, { toValue: 0.4, duration: 800, useNativeDriver: nd }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);

  return (
    <Animated.View
      style={[
        {
          width,
          height,
          borderRadius: 6,
          backgroundColor: Colors.surfaceLight,
          opacity: anim,
        },
        style,
      ]}
    />
  );
}

function SkeletonCard() {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <SkeletonBar width={120} height={16} />
        <SkeletonBar width={60} height={12} />
      </View>
      <View style={styles.cardBody}>
        <SkeletonBar width="90%" height={12} style={{ marginBottom: 8 }} />
        <SkeletonBar width="70%" height={12} style={{ marginBottom: 8 }} />
        <SkeletonBar width="50%" height={12} />
      </View>
    </View>
  );
}

export default function ProfessorLoadingSkeleton({ title, subtitle }: { title?: string; subtitle?: string }) {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <SkeletonBar width={180} height={20} style={{ marginBottom: 6 }} />
          <SkeletonBar width={120} height={13} />
        </View>
      </View>

      <View style={styles.selectorRow}>
        <SkeletonBar width="100%" height={46} style={{ borderRadius: 10 }} />
      </View>

      <View style={styles.statsRow}>
        {[1, 2, 3].map(i => (
          <View key={i} style={styles.statCard}>
            <SkeletonBar width={36} height={36} style={{ borderRadius: 18, marginBottom: 8 }} />
            <SkeletonBar width={40} height={20} style={{ marginBottom: 4 }} />
            <SkeletonBar width={60} height={11} />
          </View>
        ))}
      </View>

      {[1, 2, 3, 4].map(i => (
        <SkeletonCard key={i} />
      ))}

      <View style={styles.hint}>
        <SkeletonBar width={20} height={20} style={{ borderRadius: 10, marginRight: 8 }} />
        <SkeletonBar width={180} height={13} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    padding: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    paddingTop: 8,
  },
  headerLeft: {
    flex: 1,
  },
  selectorRow: {
    marginBottom: 16,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 20,
  },
  statCard: {
    flex: 1,
    backgroundColor: Colors.backgroundCard,
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
  },
  card: {
    backgroundColor: Colors.backgroundCard,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  cardBody: {
    gap: 0,
  },
  hint: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
});
