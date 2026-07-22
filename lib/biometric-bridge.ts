import { Platform } from 'react-native';

function isCapacitor(): boolean {
  if (typeof window === 'undefined') return false;
  const cap = (window as any).Capacitor;
  return !!(cap && typeof cap.isNativePlatform === 'function' && cap.isNativePlatform());
}

export type BiometricType = 'faceid' | 'fingerprint' | 'none';

export interface BiometricResult {
  success: boolean;
  error?: string;
}

async function checkCapacitorBiometric(): Promise<{ available: boolean; type: BiometricType }> {
  try {
    const { NativeBiometric } = await import('capacitor-native-biometric');
    const result = await NativeBiometric.isAvailable();
    if (!result.isAvailable) return { available: false, type: 'none' };
    const type: BiometricType = result.biometryType === 2 ? 'faceid' : 'fingerprint';
    return { available: true, type };
  } catch {
    return { available: false, type: 'none' };
  }
}

async function checkExpoBiometric(): Promise<{ available: boolean; type: BiometricType }> {
  try {
    const LocalAuth = await import('expo-local-authentication');
    const hasHardware = await LocalAuth.hasHardwareAsync();
    const isEnrolled = await LocalAuth.isEnrolledAsync();
    if (!hasHardware || !isEnrolled) return { available: false, type: 'none' };
    const types = await LocalAuth.supportedAuthenticationTypesAsync();
    const type: BiometricType = types.includes(LocalAuth.AuthenticationType.FACIAL_RECOGNITION)
      ? 'faceid'
      : 'fingerprint';
    return { available: true, type };
  } catch {
    return { available: false, type: 'none' };
  }
}

export async function checkBiometricAvailable(): Promise<{ available: boolean; type: BiometricType }> {
  if (Platform.OS === 'web' && !isCapacitor()) return { available: false, type: 'none' };
  if (isCapacitor()) return checkCapacitorBiometric();
  return checkExpoBiometric();
}

async function authenticateCapacitor(promptMessage: string): Promise<BiometricResult> {
  try {
    const { NativeBiometric } = await import('capacitor-native-biometric');
    await NativeBiometric.verifyIdentity({
      reason: promptMessage,
      title: 'Autenticação Biométrica',
      subtitle: 'Super Escola',
      description: promptMessage,
      useFallback: true,
      fallbackTitle: 'Usar código',
    });
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e?.message };
  }
}

async function authenticateExpo(promptMessage: string): Promise<BiometricResult> {
  try {
    const LocalAuth = await import('expo-local-authentication');
    const result = await LocalAuth.authenticateAsync({
      promptMessage,
      cancelLabel: 'Cancelar',
      fallbackLabel: 'Usar código',
      disableDeviceFallback: false,
    });
    return { success: result.success };
  } catch (e: any) {
    return { success: false, error: e?.message };
  }
}

export async function authenticateBiometric(promptMessage: string): Promise<BiometricResult> {
  if (isCapacitor()) return authenticateCapacitor(promptMessage);
  return authenticateExpo(promptMessage);
}
