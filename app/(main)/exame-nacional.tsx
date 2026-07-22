import React from 'react';
import { View, StyleSheet } from 'react-native';
import TopBar from '@/components/TopBar';
import ExameNacionalTab from '@/components/ExameNacionalTab';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Colors } from '@/constants/colors';

export default function ExameNacionalScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <TopBar title="Exame Nacional" onBack={() => router.back()} />
      <ExameNacionalTab />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
});
