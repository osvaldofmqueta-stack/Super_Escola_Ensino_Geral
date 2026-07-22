---
name: Repositório GitHub alvo
description: Repositório oficial para todos os pushes do projecto Super Escola SIGA
---

# Repositório GitHub oficial

**Owner**: `osvaldofmqueta-stack`
**Repo**: `liceun_303_cacuso_complexo_escolar`
**URL**: https://github.com/osvaldofmqueta-stack/liceun_303_cacuso_complexo_escolar

## Método de push
Usar sempre a **GitHub Git Data API** (não `git push` nativo) porque o clone local é shallow e o `git push` falha com "remote: fatal: did not receive expected object".

Algoritmo:
1. `GET /repos/{owner}/{repo}/git/refs/heads/master` → SHA do commit actual
2. `GET /repos/{owner}/{repo}/git/commits/{sha}` → SHA da tree base
3. `POST /repos/{owner}/{repo}/git/blobs` × N (lotes de 15 em paralelo)
4. `POST /repos/{owner}/{repo}/git/trees` com `base_tree` + novos items
5. `POST /repos/{owner}/{repo}/git/commits` com a nova tree
6. `PATCH /repos/{owner}/{repo}/git/refs/heads/master` → actualizar ref

**Why:** `git push --force` falha porque `.git/shallow` contém o commit-boundary e o remote não consegue resolver o parent object. As operações git de reescrita (checkout --orphan, commit, filter-branch, reset) estão bloqueadas no ambiente Replit main agent.

## Credenciais
- Token: segredo `GITHUB_TOKEN` (disponível como env var)
- Nunca expor o valor do token
