#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
#  Super Escola — Patches pré-build (aplicar ANTES de cada `expo export -p web`)
#
#  Resolve os seguintes problemas:
#   1. "Cannot find module 'react-native/Libraries/Core/InitializeCore'"
#   2. "(intermediate value).eachMapping is not a function" (metro-source-map)
#   3. expo-router/assets/*.png em falta (Sitemap, Unmatched)
#   4. @expo-google-fonts/inter — ficheiros .ttf em falta (patch expo-font)
#   5. @expo/vector-icons — fontes TTF em falta no diretório vendor/Fonts
#
#  Seguro para correr múltiplas vezes (idempotente).
# ─────────────────────────────────────────────────────────────────────────────

GREEN='\033[0;32m'; CYAN='\033[0;36m'; YELLOW='\033[1;33m'; NC='\033[0m'
ok()   { echo -e "   ${GREEN}✓${NC} $1"; }
info() { echo -e "   ${CYAN}→${NC} $1"; }
warn() { echo -e "   ${YELLOW}⚠${NC}  $1"; }

echo ""
echo "  ── Patches pré-build Expo Web ──────────────────────────"

# ── 1. metro-source-map: eachMapping async API fix ───────────────────────────
SOURCE_MAP_FILE="node_modules/metro-source-map/src/source-map.js"
if [ -f "$SOURCE_MAP_FILE" ]; then
  node -e "
const fs = require('fs');
const f = '$SOURCE_MAP_FILE';
let c = fs.readFileSync(f, 'utf8');
if (c.includes('new _sourceMap.default.SourceMapConsumer(sourceMap).eachMapping')) {
  c = c.replace(
    'new _sourceMap.default.SourceMapConsumer(sourceMap).eachMapping',
    'new _Consumer.default(sourceMap).eachMapping'
  );
  fs.writeFileSync(f, c);
  console.log('patch1:applied');
} else {
  console.log('patch1:already');
}
" 2>/dev/null | grep -q "patch1:applied" && ok "metro-source-map: patch eachMapping aplicado" || ok "metro-source-map: patch já estava aplicado"
else
  warn "metro-source-map/src/source-map.js não encontrado — a ignorar patch 1"
fi

# ── 2. react-native shims ─────────────────────────────────────────────────────
mkdir -p node_modules/react-native/Libraries/Core
if [ ! -f "node_modules/react-native/Libraries/Core/InitializeCore.js" ] || \
   ! grep -q "shim for web build" "node_modules/react-native/Libraries/Core/InitializeCore.js" 2>/dev/null; then
  echo '// shim for web build' > node_modules/react-native/Libraries/Core/InitializeCore.js
  ok "react-native/Libraries/Core/InitializeCore.js: shim criado"
else
  ok "react-native shim InitializeCore: já existe"
fi

if [ ! -f "node_modules/react-native/rn-get-polyfills.js" ] || \
   ! grep -q "shim" "node_modules/react-native/rn-get-polyfills.js" 2>/dev/null; then
  echo '// shim for web build' > node_modules/react-native/rn-get-polyfills.js
  echo 'module.exports = () => [];' >> node_modules/react-native/rn-get-polyfills.js
  ok "react-native/rn-get-polyfills.js: shim criado"
else
  ok "react-native shim rn-get-polyfills: já existe"
fi

# ── 3. expo-router/assets/*.png em falta ─────────────────────────────────────
ROUTER_ASSETS="node_modules/expo-router/assets"
mkdir -p "$ROUTER_ASSETS"
ASSETS_CREATED=0
MINIMAL_PNG=$'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\x0cIDATx\x9cc\xf8\x0f\x00\x00\x01\x01\x00\x05\x18\xd8N\x00\x00\x00\x00IEND\xaeB`\x82'
for name in arrow_down.png error.png file.png forward.png pkg.png sitemap.png unmatched.png; do
  if [ ! -f "$ROUTER_ASSETS/$name" ]; then
    printf '\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\x0cIDATx\x9cc\xf8\x0f\x00\x00\x01\x01\x00\x05\x18\xd8N\x00\x00\x00\x00IEND\xaeB`\x82' > "$ROUTER_ASSETS/$name"
    ASSETS_CREATED=$((ASSETS_CREATED + 1))
  fi
done
[ $ASSETS_CREATED -gt 0 ] && ok "expo-router/assets: $ASSETS_CREATED PNG stubs criados" || ok "expo-router/assets: PNGs já existem"

# ── 4. @expo-google-fonts/inter — copiar .ttf.png → .ttf ─────────────────────
INTER_DIR="node_modules/@expo-google-fonts/inter"
FONTS_FIXED=0
if [ -d "$INTER_DIR" ]; then
  for dir in "$INTER_DIR"/*/; do
    for png in "$dir"*.ttf.png; do
      [ -f "$png" ] || continue
      ttf="${png%.png}"
      if [ ! -f "$ttf" ]; then
        cp "$png" "$ttf"
        FONTS_FIXED=$((FONTS_FIXED + 1))
      fi
    done
  done
fi
[ $FONTS_FIXED -gt 0 ] && ok "@expo-google-fonts/inter: $FONTS_FIXED ficheiros .ttf restaurados" || ok "@expo-google-fonts/inter: ficheiros .ttf já existem"

# ── 5. jest-worker — módulo crítico para Metro ───────────────────────────────
JEST_WORKER="node_modules/jest-worker/build/index.js"
if [ ! -f "$JEST_WORKER" ]; then
  warn "jest-worker/build/index.js em falta — a tentar reinstalar..."
  npm install jest-worker --legacy-peer-deps --no-save --silent 2>/dev/null && \
    ok "jest-worker reinstalado com sucesso" || \
    warn "Falha ao reinstalar jest-worker — build pode falhar"
else
  ok "jest-worker: OK"
fi

# ── 6. @expo/vector-icons — fontes TTF em falta ───────────────────────────────
ICONS_FONTS_DIR="node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts"
if [ -d "$ICONS_FONTS_DIR" ]; then
  BASE_URL="https://cdn.jsdelivr.net/npm/@expo/vector-icons@15.1.1/build/vendor/react-native-vector-icons/Fonts"
  DOWNLOADED=0
  MISSING=0
  for font in Fontisto.ttf Foundation.ttf Ionicons.ttf MaterialCommunityIcons.ttf MaterialIcons.ttf Octicons.ttf SimpleLineIcons.ttf Zocial.ttf FontAwesome5_Brands.ttf FontAwesome5_Regular.ttf FontAwesome5_Solid.ttf FontAwesome6_Brands.ttf FontAwesome6_Regular.ttf FontAwesome6_Solid.ttf; do
    if [ ! -f "$ICONS_FONTS_DIR/$font" ]; then
      MISSING=$((MISSING + 1))
      if curl -fsSL --connect-timeout 10 --retry 2 "$BASE_URL/$font" -o "$ICONS_FONTS_DIR/$font" 2>/dev/null; then
        DOWNLOADED=$((DOWNLOADED + 1))
      else
        rm -f "$ICONS_FONTS_DIR/$font"
      fi
    fi
  done
  [ $MISSING -eq 0 ] && ok "@expo/vector-icons: todas as fontes já presentes" || ok "@expo/vector-icons: $DOWNLOADED/$MISSING fonte(s) descarregada(s)"
else
  warn "@expo/vector-icons Fonts dir não encontrado — a ignorar"
fi

# ── 7. tsx — fix missing .bin/tsx shebang wrapper ────────────────────────────
TSX_BIN="node_modules/.bin/tsx"
TSX_CLI="node_modules/tsx/dist/cli.cjs"
if [ -f "$TSX_CLI" ]; then
  NEED_FIX=0
  if [ ! -f "$TSX_BIN" ]; then
    NEED_FIX=1
  elif ! head -1 "$TSX_BIN" | grep -q "^#!"; then
    NEED_FIX=1
  fi
  if [ "$NEED_FIX" -eq 1 ]; then
    ABS_CLI="$(pwd)/$TSX_CLI"
    printf '#!/usr/bin/env node\nrequire(%s)\n' "\"$ABS_CLI\"" > "$TSX_BIN"
    chmod +x "$TSX_BIN"
    ok "tsx: wrapper .bin/tsx criado com shebang"
  else
    ok "tsx: .bin/tsx já existe e tem shebang"
  fi
else
  warn "tsx/dist/cli.cjs não encontrado — a ignorar patch tsx"
fi

echo "  ────────────────────────────────────────────────────────"
echo ""
