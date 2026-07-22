import React from "react";
import { reloadAppAsync } from "expo";
import {
  StyleSheet,
  View,
  Pressable,
  Text,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export type ErrorFallbackProps = {
  error: Error;
  resetError: () => void;
};

export function ErrorFallback({ error, resetError }: ErrorFallbackProps) {
  let insets = { top: 0, bottom: 0, left: 0, right: 0 };
  try {
    insets = useSafeAreaInsets();
  } catch {}

  const handleRestart = async () => {
    try {
      await reloadAppAsync();
    } catch {
      resetError();
    }
  };

  return (
    <View
      style={[
        styles.container,
        {
          paddingTop: insets.top + 24,
          paddingBottom: insets.bottom + 24,
        },
      ]}
    >
      <View style={styles.iconContainer}>
        <Text style={styles.icon}>⚠️</Text>
      </View>

      <Text style={styles.title}>Algo correu mal</Text>

      <Text style={styles.message}>
        A aplicação encontrou um erro inesperado.{'\n'}
        Prima o botão abaixo para reiniciar.
      </Text>

      {error?.message ? (
        <View style={styles.devBox}>
          <Text style={styles.devText} numberOfLines={10}>
            {error.message}
          </Text>
        </View>
      ) : null}

      <Pressable
        onPress={handleRestart}
        style={({ pressed }) => [
          styles.button,
          { opacity: pressed ? 0.85 : 1 },
        ]}
      >
        <Text style={styles.buttonText}>Reiniciar aplicação</Text>
      </Pressable>

      {!__DEV__ && (
        <Pressable onPress={resetError} style={styles.secondaryBtn}>
          <Text style={styles.secondaryText}>Tentar novamente</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0D1F35',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255, 200, 0, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 200, 0, 0.25)',
  },
  icon: {
    fontSize: 40,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 12,
  },
  message: {
    fontSize: 15,
    color: 'rgba(255, 255, 255, 0.65)',
    textAlign: 'center',
    lineHeight: 23,
    marginBottom: 28,
  },
  devBox: {
    backgroundColor: 'rgba(255, 59, 48, 0.12)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 59, 48, 0.3)',
    padding: 14,
    marginBottom: 24,
    width: '100%',
  },
  devText: {
    fontSize: 11,
    color: '#FF6B6B',
    fontFamily: Platform.select({ android: 'monospace', ios: 'Menlo', default: 'monospace' }),
    lineHeight: 17,
  },
  button: {
    backgroundColor: '#F5C518',
    paddingVertical: 15,
    paddingHorizontal: 32,
    borderRadius: 12,
    minWidth: 220,
    alignItems: 'center',
    marginBottom: 14,
    shadowColor: '#F5C518',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 6,
  },
  buttonText: {
    color: '#0D1F35',
    fontWeight: '700',
    fontSize: 16,
  },
  secondaryBtn: {
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  secondaryText: {
    color: 'rgba(255, 255, 255, 0.45)',
    fontSize: 14,
  },
});
