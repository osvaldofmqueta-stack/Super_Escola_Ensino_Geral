#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
#  api-push.sh — Envia ficheiros para GitHub via API (contorna git corrompido)
#  Uso: bash scripts/api-push.sh [ficheiro1 ficheiro2 ...]
#  Sem argumentos → envia os ficheiros modificados nesta sessão
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

TOKEN="${GITHUB_PAT:-${GITHUB_PERSONAL_ACCESS_TOKEN:-}}"
REPO="osvaldofmqueta-stack/superescola"
BRANCH="master"

if [ -z "$TOKEN" ]; then
  echo "❌  GITHUB_PAT não definido. Configura o secret no Replit."
  exit 1
fi

# ── Ficheiros a enviar ─────────────────────────────────────────────────────
if [ "$#" -gt 0 ]; then
  FILES=("$@")
else
  FILES=(
    "scripts/release.sh"
    "scripts/api-push.sh"
    "components/DrawerLeft.tsx"
    "components/DrawerRight.tsx"
    "components/HScrollTabBar.tsx"
    "app/+html.tsx"
  )
fi

COMMIT_MSG="deploy: $(date '+%d/%m/%Y %H:%M') — via api-push"

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║    Super Escola — GitHub API Push (sem git)         ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""
echo "📤 Repositório : $REPO  |  Branch: $BRANCH"
echo "📝 Commit msg  : $COMMIT_MSG"
echo ""

# ── Script Node.js inline que faz o push via API ──────────────────────────
node - "$TOKEN" "$REPO" "$BRANCH" "$COMMIT_MSG" "${FILES[@]}" <<'NODEJS'
const https  = require('https');
const fs     = require('fs');
const path   = require('path');

const [,, TOKEN, REPO, BRANCH, COMMIT_MSG, ...FILES] = process.argv;

function apiRequest(method, endpoint, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: 'api.github.com',
      path: endpoint,
      method,
      headers: {
        'Authorization': `token ${TOKEN}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'SuperEscola-api-push/1.0',
        'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
      },
    };
    const req = https.request(opts, (res) => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        try { resolve(JSON.parse(raw)); }
        catch { resolve(raw); }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function pushFile(filePath) {
  if (!fs.existsSync(filePath)) {
    console.log(`  ⚠️  ${filePath} — não encontrado, ignorado.`);
    return true;
  }

  // 1. SHA actual no GitHub
  const info = await apiRequest('GET', `/repos/${REPO}/contents/${encodeURIComponent(filePath)}?ref=${BRANCH}`);
  const remoteSha = info && info.sha ? info.sha : null;

  // 2. Conteúdo em base64
  const content = fs.readFileSync(filePath).toString('base64');

  // 3. Payload
  const payload = { message: COMMIT_MSG, content, branch: BRANCH };
  if (remoteSha) payload.sha = remoteSha;

  // 4. PUT
  const result = await apiRequest('PUT', `/repos/${REPO}/contents/${encodeURIComponent(filePath)}`, payload);

  if (result && (result.content || result.commit)) {
    console.log(`  ✅ ${filePath}`);
    return true;
  } else {
    const msg = (result && result.message) ? result.message : JSON.stringify(result).slice(0, 120);
    console.log(`  ❌ ${filePath} — ${msg}`);
    return false;
  }
}

(async () => {
  let errors = 0;
  for (const f of FILES) {
    const ok = await pushFile(f);
    if (!ok) errors++;
  }
  console.log('');
  if (errors === 0) {
    console.log('╔══════════════════════════════════════════════════════╗');
    console.log('║  ✅ Todos os ficheiros enviados com sucesso!        ║');
    console.log('║                                                      ║');
    console.log('║  O GitHub recebeu as alterações com sucesso.       ║');
    console.log('╚══════════════════════════════════════════════════════╝');
  } else {
    console.log(`⚠️  ${errors} ficheiro(s) falharam.`);
    process.exit(1);
  }
  console.log('');
})();
NODEJS
