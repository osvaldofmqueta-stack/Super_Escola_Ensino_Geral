#!/usr/bin/env bash
# Startup script that handles running the server with tsx
set -e

# Create .bin symlinks if they don't exist
if [ ! -d "node_modules/.bin" ]; then
  mkdir -p node_modules/.bin
fi

# Ensure tsx symlink exists
if [ ! -f "node_modules/.bin/tsx" ] && [ -f "node_modules/tsx/dist/cli.mjs" ]; then
  ln -sf "$(pwd)/node_modules/tsx/dist/cli.mjs" node_modules/.bin/tsx
  chmod +x node_modules/.bin/tsx
fi

# Find tsx executable
TSX_BIN=""
if [ -f "node_modules/.bin/tsx" ]; then
  TSX_BIN="node_modules/.bin/tsx"
elif [ -f "node_modules/tsx/dist/cli.mjs" ]; then
  TSX_BIN="node_modules/tsx/dist/cli.mjs"
fi

if [ -z "$TSX_BIN" ]; then
  echo "ERROR: tsx not found. Installing..."
  npm install --no-save --ignore-scripts tsx
  TSX_BIN="node_modules/.bin/tsx"
fi

echo "[start] Using tsx: $TSX_BIN"
exec node "$TSX_BIN" server/index.ts
