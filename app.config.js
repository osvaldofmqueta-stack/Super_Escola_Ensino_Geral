const REPLIT_DEV_DOMAIN = process.env.REPLIT_DEV_DOMAIN || "";
const REPLIT_DOMAINS = process.env.REPLIT_DOMAINS || "";
const API_URL = process.env.EXPO_PUBLIC_API_URL || "";

const origin = REPLIT_DOMAINS
  ? `https://${REPLIT_DOMAINS.split(",")[0].trim()}`
  : REPLIT_DEV_DOMAIN
  ? `https://${REPLIT_DEV_DOMAIN}`
  : API_URL
  ? API_URL.replace(/\/$/, "")
  : "";

module.exports = {
  expo: {
    name: "Super Escola",
    slug: "queta-school",
    version: "1.0.1",
    orientation: "portrait",
    icon: "./assets/images/icon.png",
    scheme: "queta",
    userInterfaceStyle: "dark",
    newArchEnabled: false,
    updates: {
      url: "https://u.expo.dev/3d9019cc-6fa3-48c1-8f7a-d415bfc09291",
      fallbackToCacheTimeout: 0,
      enabled: false,
      checkAutomatically: "NEVER",
    },
    // "appVersion" vincula a runtimeVersion à versão do app.
    // Cada vez que bumpes a versão (1.0.1 → 1.0.2), o APK antigo
    // nunca recebe actualizações OTA incompatíveis.
    runtimeVersion: { policy: "appVersion" },
    splash: {
      image: "./assets/images/splash-icon.png",
      resizeMode: "contain",
      backgroundColor: "#0D1F35",
    },
    ios: {
      supportsTablet: false,
      bundleIdentifier: "com.sgaa.angola",
      infoPlist: {
        NSFaceIDUsageDescription:
          "Utilize o Face ID para aceder à sua conta de forma segura.",
        NSCameraUsageDescription:
          "Necessário para digitalizar códigos QR e tirar fotografias.",
      },
    },
    android: {
      package: "com.sgaa.angola",
      usesCleartextTraffic: true,
      adaptiveIcon: {
        backgroundColor: "#0D1F35",
        foregroundImage: "./assets/images/android-icon-foreground.png",
        backgroundImage: "./assets/images/android-icon-background.png",
        monochromeImage: "./assets/images/android-icon-monochrome.png",
      },
      permissions: [
        "android.permission.USE_BIOMETRIC",
        "android.permission.USE_FINGERPRINT",
        "android.permission.CAMERA",
        "android.permission.RECORD_AUDIO",
        "android.permission.ACCESS_FINE_LOCATION",
        "android.permission.ACCESS_COARSE_LOCATION",
        "android.permission.READ_MEDIA_IMAGES",
        "android.permission.READ_EXTERNAL_STORAGE",
        "android.permission.WRITE_EXTERNAL_STORAGE",
        "android.permission.INTERNET",
        "android.permission.VIBRATE",
      ],
    },
    web: {
      favicon: "./assets/images/favicon.png",
      bundler: "metro",
      output: "single",
    },
    plugins: [
      [
        "expo-router",
        {
          origin,
        },
      ],
      "expo-font",
      "expo-web-browser",
      "expo-local-authentication",
      [
        "expo-camera",
        {
          cameraPermission:
            "Necessário para digitalizar códigos QR e tirar fotografias.",
          microphonePermission:
            "Necessário para gravar vídeo.",
        },
      ],
      [
        "expo-image-picker",
        {
          photosPermission:
            "Permite seleccionar fotografias da galeria.",
          cameraPermission:
            "Permite tirar fotografias directamente.",
        },
      ],
      [
        "expo-location",
        {
          locationAlwaysAndWhenInUsePermission:
            "Permite aceder à localização para funcionalidades geográficas.",
        },
      ],
    ],
    experiments: {
      typedRoutes: true,
      reactCompiler: false,
    },
    extra: {
      eas: {
        projectId: "22985233-ee24-42f6-8a52-ab53d04d310a",
      },
    },
  },
};
