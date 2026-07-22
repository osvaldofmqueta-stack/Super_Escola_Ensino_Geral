#!/bin/bash
# ═══════════════════════════════════════════════════════════════════
#  Super Escola — Script de Build para Capacitor (APK Android)
#  Uso: bash scripts/build-capacitor.sh
# ═══════════════════════════════════════════════════════════════════

set -e

PROD_SERVER="${EXPO_PUBLIC_API_URL:-}"

echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║     Super Escola — Build Capacitor Android       ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""
echo "▸ Servidor de produção: $PROD_SERVER"
echo ""

# 1. Construir o frontend web com a URL de produção
echo "[ 1/4 ] A construir o frontend web..."
EXPO_PUBLIC_API_URL="$PROD_SERVER" npx expo export -p web
echo "       ✅ Build web concluído → dist/"

# 2. Sincronizar com a plataforma Android
echo "[ 2/4 ] A sincronizar com Android..."
npx cap sync android
echo "       ✅ Sincronização concluída"

# 3. Abrir no Android Studio (opcional — comentar se preferir linha de comandos)
echo "[ 3/4 ] A preparar para build..."
echo ""
echo "══════════════════════════════════════════════════"
echo "  PRÓXIMO PASSO — Escolhe como gerar o APK:"
echo ""
echo "  OPÇÃO A — Android Studio (recomendado):"
echo "  $ npx cap open android"
echo "  → Build → Generate Signed Bundle / APK"
echo ""
echo "  OPÇÃO B — Linha de comandos (debug):"
echo "  $ cd android && ./gradlew assembleDebug"
echo "  → APK em: android/app/build/outputs/apk/debug/"
echo ""
echo "  OPÇÃO C — Release (produção):"
echo "  $ cd android && ./gradlew assembleRelease"
echo "  → APK em: android/app/build/outputs/apk/release/"
echo "══════════════════════════════════════════════════"
echo ""
echo "[ 4/4 ] ✅ Projecto pronto para gerar APK!"
