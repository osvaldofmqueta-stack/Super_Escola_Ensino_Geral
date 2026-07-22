---
name: Deploy --force obrigatório para mudanças de backend
description: build-deploy.sh compara timestamps e salta recompilação esbuild se server_dist/ parece actualizado; --force garante que o bundle reflecte as mudanças.
---

**Regra:** Usar `bash scripts/build-deploy.sh --skip-build --force` ao fazer deploy de mudanças em `server/`.

**Porquê:** O script compara mtime de `server_dist/index.js` com ficheiros em `server/`. Se o bundle parecer mais recente, salta o passo esbuild. O fix chega via rsync como código fonte mas o servidor de produção corre o bundle compilado.

**Como aplicar:** `--force` sempre que se editarem ficheiros em `server/`. Para mudanças só de frontend, `--skip-build` sem `--force` é suficiente.
