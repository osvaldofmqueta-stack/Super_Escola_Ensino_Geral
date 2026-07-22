#!/bin/bash
set -e

echo "=== A iniciar servidor ==="

# Garantir dependências Python (dulwich para push_github.py)
python3 -c "import dulwich" 2>/dev/null || pip install dulwich --quiet 2>/dev/null || true
CHROMIUM=$(which chromium 2>/dev/null || which chromium-browser 2>/dev/null || echo "/run/current-system/sw/bin/chromium")

# Garantir que os assets do expo-router existem (podem desaparecer após npm install)
python3 -c "
import base64, os
png = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==')
d = 'node_modules/expo-router/assets'
os.makedirs(d, exist_ok=True)
for n in ['file.png','pkg.png','forward.png','sitemap.png','arrow_down.png','unmatched.png','error.png','logotype.png']:
    p = os.path.join(d, n)
    if not os.path.exists(p):
        open(p,'wb').write(png)
" 2>/dev/null || true

# Criar symlinks em node_modules/.bin (Replit não os cria automaticamente)
node -e "
const fs=require('fs'),path=require('path'),nm='./node_modules',bd=path.join(nm,'.bin');
if(!fs.existsSync(bd))fs.mkdirSync(bd,{recursive:true});
fs.readdirSync(nm).filter(d=>!d.startsWith('.')&&d!=='.bin').forEach(dir=>{
  try{
    const pkg=JSON.parse(fs.readFileSync(path.join(nm,dir,'package.json'),'utf8'));
    if(!pkg.bin)return;
    const b=typeof pkg.bin==='string'?{[dir]:pkg.bin}:pkg.bin;
    Object.entries(b).forEach(([n,s])=>{
      const l=path.join(bd,n),t=path.resolve(nm,dir,s);
      if(!fs.existsSync(l)&&fs.existsSync(t)){try{fs.symlinkSync(t,l);fs.chmodSync(t,0o755);}catch{}}
    });
  }catch{}
});
console.log('[start] Symlinks .bin verificados.');
" 2>/dev/null || true

if [ ! -f "dist/index.html" ]; then
  echo "=== Frontend não encontrado — a construir em segundo plano ==="
  (CI=1 PUPPETEER_SKIP_DOWNLOAD=true npx expo export -p web > /tmp/expo-build.log 2>&1; echo "=== Build concluído ===" >> /tmp/expo-build.log) &
fi

if [ -f "/tmp/dist-rebuild-requested" ]; then
  echo "=== Rebuild do frontend solicitado — a construir em segundo plano ==="
  (rm -f /tmp/dist-rebuild-requested; CI=1 PUPPETEER_SKIP_DOWNLOAD=true npx expo export -p web > /tmp/expo-build.log 2>&1; echo "=== Build concluído ===" >> /tmp/expo-build.log) &
fi

export PUPPETEER_SKIP_DOWNLOAD=true
export PUPPETEER_EXECUTABLE_PATH="$CHROMIUM"
export SERVE_STATIC_WEB=1

# Resolver tsx: local (.bin) > global (npm prefix) > PATH
TSX_BIN=""
if [ -f "node_modules/.bin/tsx" ]; then
  TSX_BIN="node_modules/.bin/tsx"
else
  GLOBAL_PREFIX=$(npm config get prefix 2>/dev/null || echo "")
  if [ -n "$GLOBAL_PREFIX" ] && [ -f "$GLOBAL_PREFIX/bin/tsx" ]; then
    TSX_BIN="$GLOBAL_PREFIX/bin/tsx"
    # Criar symlink local para reutilização
    ln -sf "$TSX_BIN" node_modules/.bin/tsx 2>/dev/null || true
  elif which tsx > /dev/null 2>&1; then
    TSX_BIN=$(which tsx)
  fi
fi

if [ -z "$TSX_BIN" ] || [ ! -f "$TSX_BIN" ]; then
  echo "ERRO: tsx não encontrado. A instalar..."
  npm install -g tsx 2>&1 | tail -3
  GLOBAL_PREFIX=$(npm config get prefix 2>/dev/null || echo "")
  TSX_BIN="$GLOBAL_PREFIX/bin/tsx"
fi

if [ ! -f "$TSX_BIN" ]; then
  echo "ERRO FATAL: tsx não disponível. O servidor não pode arrancar."
  exit 1
fi

exec "$TSX_BIN" server/index.ts
