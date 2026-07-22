#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
#  Super Escola — Gerador de APK e Actualizações OTA
#
#  Uso:
#    bash scripts/build-apk.sh                    # gera APK (servidor padrão)
#    bash scripts/build-apk.sh http://OUTRO_IP    # gera APK com outro servidor
#    bash scripts/build-apk.sh --ota              # envia actualização OTA (sem APK)
#    bash scripts/build-apk.sh --ota "descrição"  # OTA com mensagem personalizada
#    bash scripts/build-apk.sh --no-bump          # APK sem incrementar versão
#
#  O que este script faz automaticamente:
#    ✅ Incrementa o patch da versão em app.config.js  (1.0.1 → 1.0.2)
#    ✅ autoIncrement no EAS  → versionCode Android sobe sempre
#    ✅ runtimeVersion = appVersion → APK antigo nunca recebe OTA incompatível
#    ✅ Garante newArchEnabled: true  → reanimated 4.x funciona
#
#  Pré-requisito: EXPO_TOKEN configurado (Replit Secrets ou export manual)
# ─────────────────────────────────────────────────────────────────────────────
set -e

SERVER_URL="${EXPO_PUBLIC_API_URL:-}"
OTA_MODE=false
OTA_MSG="Actualização automática"
NO_BUMP=false

for arg in "$@"; do
  case "$arg" in
    --ota)      OTA_MODE=true ;;
    --no-bump)  NO_BUMP=true ;;
    http://*|https://*) SERVER_URL="$arg" ;;
    *) [ "$OTA_MODE" = true ] && OTA_MSG="$arg" ;;
  esac
done

# ── Verificar EXPO_TOKEN ───────────────────────────────────────────────────
if [ -z "$EXPO_TOKEN" ]; then
  echo ""
  echo "❌  EXPO_TOKEN não está configurado."
  echo ""
  echo "   Corre primeiro:"
  echo "   export EXPO_TOKEN=\"o-teu-token-aqui\""
  echo ""
  echo "   Obtém o token em: https://expo.dev/accounts/osvaldo.queta/settings/access-tokens"
  exit 1
fi

# ── Ler versão actual do app.config.js ───────────────────────────────────────
APP_CONFIG="$(pwd)/app.config.js"
CURRENT_VERSION=$(node -e "const c=require('$APP_CONFIG'); console.log(c.expo.version);" 2>/dev/null || echo "1.0.0")

# ── Bump automático da versão (patch) ─────────────────────────────────────────
if [ "$NO_BUMP" = false ] && [ "$OTA_MODE" = false ]; then
  NEW_VERSION=$(node -e "
    const parts = '$CURRENT_VERSION'.split('.').map(Number);
    parts[2] = (parts[2] || 0) + 1;
    console.log(parts.join('.'));
  ")

  # Substituir versão no app.config.js
  sed -i "s/version: \"$CURRENT_VERSION\"/version: \"$NEW_VERSION\"/" "$APP_CONFIG"

  echo ""
  echo "🔖  Versão actualizada: $CURRENT_VERSION → $NEW_VERSION"
  CURRENT_VERSION="$NEW_VERSION"
fi

echo ""
echo "╔══════════════════════════════════════════════════════╗"
if [ "$OTA_MODE" = true ]; then
echo "║       Super Escola — Actualização OTA (sem APK)      ║"
else
echo "║        Super Escola — Build APK (Android)            ║"
fi
echo "╠══════════════════════════════════════════════════════╣"
echo "║  Versão   : $CURRENT_VERSION"
echo "║  Servidor : $SERVER_URL"
if [ "$OTA_MODE" = false ]; then
echo "║  Perfil   : preview (APK directo, sem Play Store)    ║"
echo "║  Package  : com.sgaa.angola                          ║"
echo "║  Arch     : New Architecture (newArchEnabled: true)  ║"
fi
echo "╚══════════════════════════════════════════════════════╝"
echo ""

# ── Verificar/instalar eas-cli ────────────────────────────────────────────
if ! command -v eas &>/dev/null; then
  echo "▶  A instalar eas-cli..."
  npm install -g eas-cli@18.11.0 --quiet
fi

# ── Verificar autenticação ────────────────────────────────────────────────
echo "▶  A verificar autenticação no Expo..."
EXPO_USER=$(EXPO_TOKEN="$EXPO_TOKEN" EAS_NO_VCS=1 eas whoami 2>/dev/null | grep -v "^$" | tail -1 || echo "")
if [ -z "$EXPO_USER" ]; then
  echo "❌  Token inválido ou expirado."
  echo "   Actualiza o token: https://expo.dev/accounts/osvaldo.queta/settings/access-tokens"
  exit 1
fi
echo "   ✅  Autenticado como: $EXPO_USER"
echo ""

export EXPO_PUBLIC_API_URL="$SERVER_URL"
export EAS_NO_VCS=1
export EAS_PROJECT_ROOT="$(pwd)"

# ══════════════════════════════════════════════════════════════════════════
# MODO OTA
# ══════════════════════════════════════════════════════════════════════════
if [ "$OTA_MODE" = true ]; then
  echo "▶  A enviar actualização OTA para o canal 'preview'..."
  echo "   Mensagem: $OTA_MSG"
  echo ""

  EXPO_TOKEN="$EXPO_TOKEN" eas update \
    --channel preview \
    --message "$OTA_MSG" \
    --non-interactive 2>&1

  echo ""
  echo "════════════════════════════════════════════════════════"
  echo "✅  Actualização OTA enviada! A app actualiza na próxima abertura."
  echo "════════════════════════════════════════════════════════"
  exit 0
fi

# ══════════════════════════════════════════════════════════════════════════
# MODO APK
# ══════════════════════════════════════════════════════════════════════════
echo "▶  A enviar projecto para o EAS Cloud Build..."
echo "   Versão    : $CURRENT_VERSION"
echo "   versionCode: auto-incrementado pelo EAS (sempre maior que o anterior)"
echo "   O APK fica pronto em 10–20 minutos."
echo ""
echo "   Acompanha em: https://expo.dev/accounts/osvaldo.queta/projects/queta-school/builds"
echo ""

EXPO_TOKEN="$EXPO_TOKEN" eas build \
  --profile preview \
  --platform android \
  --non-interactive \
  --no-wait \
  2>&1 | tee /tmp/eas-build.log

echo ""
echo "════════════════════════════════════════════════════════"
BUILD_URL=$(grep -o 'https://expo\.dev/accounts[^ ]*' /tmp/eas-build.log | tail -1 || true)
if [ -n "$BUILD_URL" ]; then
  echo "✅  Build submetida! Versão: $CURRENT_VERSION"
  echo "   Link: $BUILD_URL"
else
  echo "✅  Build submetida! Versão: $CURRENT_VERSION"
  echo "   Verifica em:"
  echo "   https://expo.dev/accounts/osvaldo.queta/projects/queta-school/builds"
fi
echo ""
echo "Quando o APK estiver pronto:"
echo "  1. Descarrega o .apk do link acima"
echo "  2. DESINSTALA o APK antigo do telemóvel primeiro"
echo "  3. Activa 'Instalar de fontes desconhecidas' nas Definições do Android"
echo "  4. Abre o novo .apk para instalar"
echo ""
echo "⚠️  IMPORTANTE: Desinstala sempre o APK antigo antes de instalar o novo!"
echo "   Evita conflitos de versão no Android."
echo "════════════════════════════════════════════════════════"
