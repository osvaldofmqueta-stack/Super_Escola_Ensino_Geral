---
name: tsx binary fix
description: tsx não fica em node_modules/.bin após npm install no Replit — solução é instalar globalmente
---

No ambiente Replit (NixOS), `npm install tsx` não cria o symlink `node_modules/.bin/tsx` mesmo após instalação bem-sucedida. O `npx tsx` funciona mas pede confirmação interactiva ("Ok to proceed? (y)") bloqueando o arranque do servidor.

**Solução que funciona:** Instalar tsx globalmente:
```bash
npm install -g tsx
```
Fica disponível em `/home/runner/workspace/.config/npm/node_global/bin/tsx`.

**No scripts/start.sh usar:**
```bash
TSX_BIN=$(which tsx 2>/dev/null || echo "/home/runner/workspace/.config/npm/node_global/bin/tsx")
exec "$TSX_BIN" server/index.ts
```

**Nota:** O script de symlinks (via Node.js lendo package.json de cada dir) também foi adicionado ao start.sh mas não resolve o problema do tsx especificamente — tsx não é instalado em node_modules pelo npm install neste ambiente.

**Why:** O Replit intercepta ou aborta a criação de symlinks na fase do npm install para certos pacotes. A instalação global funciona porque usa um caminho diferente (`~/.config/npm/node_global/bin/`).

**How to apply:** Sempre que tsx não estiver em node_modules/.bin após npm install (incluindo após reimport do GitHub):
1. `npm install -g tsx` instala globalmente
2. Criar wrapper local: `echo '#!/bin/bash\nexec /home/runner/workspace/.config/npm/node_global/bin/tsx "$@"' > node_modules/.bin/tsx && chmod +x node_modules/.bin/tsx`
3. O start.sh já lida com o caso — instala tsx globalmente e usa `which tsx` como fallback.

**Nota pós-reimport:** Após reimport do GitHub, node_modules fica quase vazio (apenas expo-router). É necessário `npm install` seguido da criação do wrapper tsx. Confirmado 2026-07-10: start.sh já faz isto automaticamente (instala tsx global + symlink) sem intervenção manual — basta rodar `npm install` e restart do workflow.
