#!/usr/bin/env bash
# Workflow EAS Build — corre separado do agente Replit
set -e

echo ""
echo "══════════════════════════════════════════════════════"
echo "   Super Escola — Build APK Android"
echo "══════════════════════════════════════════════════════"
echo ""

# Usar o token do ambiente (Replit Secret EXPO_TOKEN)
if [ -z "$EXPO_TOKEN" ]; then
  echo "❌  EXPO_TOKEN não configurado nos Secrets do Replit."
  exit 1
fi

echo "▶  Token detectado: ${EXPO_TOKEN:0:8}..."

# Garantir eas-cli disponível
if ! command -v eas &>/dev/null; then
  echo "▶  A instalar eas-cli..."
  npm install -g eas-cli@18.11.0 --quiet 2>&1
fi

echo "▶  eas-cli: $(eas --version 2>/dev/null)"
echo ""

# Configurar variáveis
export EAS_NO_VCS=1
export EAS_PROJECT_ROOT="/home/runner/workspace"

echo "▶  A submeter build..."
echo "   EAS_NO_VCS=1 (sem git)"
echo "   Servidor: ${EXPO_PUBLIC_API_URL:-'(definir EXPO_PUBLIC_API_URL)'}"
echo ""

cd /home/runner/workspace

eas build \
  --platform android \
  --profile preview \
  --non-interactive \
  --no-wait

echo ""
echo "✅  Build submetida!"
echo "   Acompanha em: https://expo.dev/accounts/osvaldo.queta/projects/queta-school/builds"
