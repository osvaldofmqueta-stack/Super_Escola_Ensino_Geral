const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// Excluir a pasta android/ (Capacitor) do bundler Metro
config.resolver.blockList = [
  ...(Array.isArray(config.resolver.blockList) ? config.resolver.blockList : []),
  /\/android\/.*/,
];

const GESTURE_HANDLER_SHIM = path.resolve(__dirname, "shims/react-native-gesture-handler.js");
const GESTURE_HANDLER_DIR = path.resolve(__dirname, "node_modules/react-native-gesture-handler");

const _defaultResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  // Fix: expo's nested expo-modules-core has no src/ dir — redirect to top-level package
  if (moduleName === "expo-modules-core") {
    return {
      filePath: path.resolve(__dirname, "node_modules/expo-modules-core/src/index.ts"),
      type: "sourceFile",
    };
  }

  // Resolução explícita do alias @/ → raiz do projecto
  if (moduleName.startsWith("@/")) {
    const relative = moduleName.slice(2);
    const filePath = path.resolve(__dirname, relative);
    const exts = ["", ".ts", ".tsx", ".js", ".jsx"];
    for (const ext of exts) {
      const fullPath = filePath + ext;
      try {
        require.resolve(fullPath);
        return { filePath: fullPath, type: "sourceFile" };
      } catch {}
    }
    const indexExts = ["/index.ts", "/index.tsx", "/index.js"];
    for (const ext of indexExts) {
      const fullPath = filePath + ext;
      try {
        require.resolve(fullPath);
        return { filePath: fullPath, type: "sourceFile" };
      } catch {}
    }
  }

  if (moduleName === "fontfaceobserver") {
    return {
      filePath: path.resolve(__dirname, "shims/fontfaceobserver.js"),
      type: "sourceFile",
    };
  }

  if (moduleName === "react-native-keyboard-controller" && platform === "web") {
    return {
      filePath: path.resolve(__dirname, "shims/react-native-keyboard-controller.js"),
      type: "sourceFile",
    };
  }

  // Web: redirecionar react-native-gesture-handler inteiro para shim
  // Intercept: import do pacote pelo app
  if (platform === "web" && moduleName === "react-native-gesture-handler") {
    return { filePath: GESTURE_HANDLER_SHIM, type: "sourceFile" };
  }

  // Web: intercept imports internos do react-native-gesture-handler (sub-módulos nativos)
  if (platform === "web" && context.originModulePath) {
    const origin = context.originModulePath;
    const isFromGestureHandler = origin.startsWith(GESTURE_HANDLER_DIR);
    if (isFromGestureHandler) {
      // Qualquer import relativo dentro do gesture-handler que não existe no web
      // é substituído pelo shim vazio para evitar erros de resolução
      try {
        if (_defaultResolveRequest) {
          return _defaultResolveRequest(context, moduleName, platform);
        }
        return context.resolveRequest(context, moduleName, platform);
      } catch {
        return { filePath: GESTURE_HANDLER_SHIM, type: "sourceFile" };
      }
    }
  }

  if (_defaultResolveRequest) {
    return _defaultResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
