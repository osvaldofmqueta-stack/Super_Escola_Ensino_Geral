---
name: Pauta Final/Geral — regras de transição
description: Onde vive a lógica de transição de ano (Art.23º) usada pela Pauta Final/Geral e como é partilhada entre cliente e servidor.
---

`calcularTransicaoAngola()` (decisão de transição TRANSITA / TRANSITA C/ CONDIÇÃO / NÃO TRANSITA, Art.23º) vive em `lib/angola-transicao.ts` — não em `server/`, porque o Editor de Documentos (cliente) precisa de a importar para gerar a Pauta Final/Geral (HTML e Excel) no browser, tal como `lib/formulasDecreto.ts` já era partilhado.

**Why:** o ficheiro original estava em `server/angola-transicao.ts`, mas o cliente (`app/`) não pode importar de `server/`. Mover para `lib/` seguiu o precedente de `formulasDecreto.ts`.

**How to apply:** ao mexer nesta lógica, actualizar em conjunto todos os importadores: `server/routes.ts`, `server/boletim-routes.ts` e `app/(main)/editor-documentos.tsx` (builders HTML e Excel da Pauta Final usam a mesma função e o mesmo mapeamento classe→maxNegativas/restriçãoArt23: classes de exame 6ª/9ª/12ª → maxNeg=0; I Ciclo 7ª/8ª → `maxNegativosICiclo`+`restricaoArt23ICiclo`; II Ciclo 10ª/11ª → `maxNegativosIICiclo`+`restricaoArt23IICiclo`). Ao mover ficheiros partilhados para `lib/`, procurar TODOS os importadores com grep antes de apagar o original — um import esquecido em `server/boletim-routes.ts` já causou falha de arranque.
