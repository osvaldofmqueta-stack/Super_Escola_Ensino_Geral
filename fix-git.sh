#!/bin/bash
# fix-git.sh — Repara o repositório git local e faz push para GitHub
# Execute UMA VEZ no Shell: bash fix-git.sh
#
# Requer a variável GITHUB_TOKEN configurada nos Secrets do Replit
# (já está configurada como secret "GITHUB_TOKEN" neste projecto)

set -e

OWNER="osvaldofmqueta-stack"
REPO="superescola"
BRANCH="master"

if [ -z "$GITHUB_TOKEN" ]; then
  echo "❌ GITHUB_TOKEN não está definido."
  echo "   Vai a Tools → Secrets e confirma que GITHUB_TOKEN existe."
  exit 1
fi

REMOTE_URL="https://${GITHUB_TOKEN}@github.com/${OWNER}/${REPO}.git"

echo "==> A remover .git corrompido..."
rm -rf .git

echo "==> A inicializar repositório limpo..."
git init -b master

echo "==> A adicionar todos os ficheiros..."
git add -A

echo "==> A criar commit inicial..."
git commit -m "chore: reinit repo — Super Escola SIGA todas as funcionalidades actuais"

echo "==> A configurar remote origin (sem token no URL permanente)..."
git remote add origin "https://github.com/${OWNER}/${REPO}.git"

echo "==> A fazer push para GitHub (force, token via credential helper)..."
git -c "credential.helper=" \
    -c "http.extraHeader=Authorization: Bearer ${GITHUB_TOKEN}" \
    push --force origin master

echo ""
echo "✅ Repositório reparado e sincronizado com GitHub!"
echo "   A partir de agora usa: git push origin master"
echo "   (com o token configurado no git credential helper ou via GITHUB_TOKEN)"
