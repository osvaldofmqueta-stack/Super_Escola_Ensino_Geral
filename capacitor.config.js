/** @type {import('@capacitor/cli').CapacitorConfig} */
const config = {
  appId: 'com.sgaa.angola',
  appName: 'Super Escola',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    cleartext: false,
  },
  android: {
    allowMixedContent: true,
    captureInput: true,
    webContentsDebuggingEnabled: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 3000,
      launchAutoHide: true,
      backgroundColor: '#0D1F35',
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
    },
    NativeBiometric: {
      useFallbackAuthentication: true,
    },
  },
};

module.exports = config;
