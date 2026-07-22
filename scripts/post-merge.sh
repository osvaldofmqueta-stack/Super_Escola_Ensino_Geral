#!/bin/bash
set -e

echo "[post-merge] A instalar dependências..."
npm install --legacy-peer-deps

echo "[post-merge] A aplicar correcções de compatibilidade..."

# Fix: hermes-parser dist missing inside babel-plugin-syntax-hermes-parser nested copy
HERMES_BROKEN="node_modules/babel-plugin-syntax-hermes-parser/node_modules/hermes-parser/dist"
HERMES_SRC="node_modules/expo/node_modules/hermes-parser/dist"
if [ -d "$HERMES_SRC" ] && [ -d "$HERMES_BROKEN" ]; then
  cp -r "$HERMES_SRC"/. "$HERMES_BROKEN"/
  echo "[post-merge] hermes-parser dist corrigido."
fi

# Fix: compression negotiator missing language.js and mediaType.js
NEG_BROKEN="node_modules/compression/node_modules/negotiator/lib"
NEG_SRC="node_modules/negotiator/lib"
if [ -d "$NEG_SRC" ] && [ -d "$NEG_BROKEN" ]; then
  cp -f "$NEG_SRC/language.js" "$NEG_BROKEN/language.js" 2>/dev/null || true
  cp -f "$NEG_SRC/mediaType.js" "$NEG_BROKEN/mediaType.js" 2>/dev/null || true
  echo "[post-merge] negotiator libs corrigidas."
fi

# Fix: drizzle-kit binary not in node_modules/.bin after install (npx cache only)
# Symlink from npx cache so `npm run db:push` works
DRIZZLE_NPX_BIN=$(ls /home/runner/.npm/_npx/*/node_modules/.bin/drizzle-kit 2>/dev/null | head -1)
if [ -n "$DRIZZLE_NPX_BIN" ] && [ ! -f "node_modules/.bin/drizzle-kit" ]; then
  DRIZZLE_NPX_MOD=$(dirname "$DRIZZLE_NPX_BIN")/../drizzle-kit
  ln -sf "$(realpath "$DRIZZLE_NPX_MOD")" node_modules/drizzle-kit 2>/dev/null || true
  ln -sf "$(realpath "$DRIZZLE_NPX_BIN")" node_modules/.bin/drizzle-kit 2>/dev/null || true
  echo "[post-merge] drizzle-kit symlinked from npx cache."
fi

echo "[post-merge] Concluído."
