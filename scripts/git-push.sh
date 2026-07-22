#!/usr/bin/env bash
# Push para GitHub usando o GITHUB_PAT do Replit.
# Uso: bash scripts/git-push.sh
#      bash scripts/git-push.sh "mensagem do commit"

set -e

PAT="${GITHUB_PAT:-}"
REPO="https://github.com/osvaldofmqueta-stack/liceun_303_cacuso_complexo_escolar"
BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "main")
[ "$BRANCH" = "HEAD" ] && BRANCH="main"

if [ -z "$PAT" ]; then
  echo "❌  GITHUB_PAT não definido nos Secrets do Replit."
  echo "    Adiciona o secret GITHUB_PAT e tenta novamente."
  exit 1
fi

MSG="${1:-deploy: $(date '+%d/%m/%Y %H:%M')}"

git add -A
DIFF=$(git diff --cached --stat 2>/dev/null || echo "")
if [ -z "$DIFF" ]; then
  echo "⚠  Sem alterações para commit."
else
  git commit -m "$MSG"
  echo "✓ Commit: $MSG"
fi

REMOTE_URL="${REPO/https:\/\//https://osvaldofmqueta-stack:${PAT}@}"
git push "$REMOTE_URL" "HEAD:${BRANCH}" --force
echo "✓ Push concluído → github.com/osvaldofmqueta-stack/liceun_303_cacuso_complexo_escolar"
