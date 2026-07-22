---
name: Alumni Module
description: Arquitectura e decisões do módulo de Antigos Alunos (alumni) implementado no SIGA v3.
---

# Alumni Module

## Ficheiros criados/alterados
- `server/alumni-routes.ts` — backend CRUD + importação de finalistas
- `app/(main)/alumni.tsx` — ecrã principal com stats, filtros, CRUD
- `shared/schema.ts` — tabela `alumni` adicionada no fim
- `server/routes.ts` — import + `await registerAlumniRoutes(app)` após registerMelhoriaNotaRoutes
- `app/(main)/_layout.tsx` — `<Stack.Screen name="alumni" />` adicionado
- `components/DrawerLeft.tsx` — 5 entradas "Antigos Alunos (Alumni)" adicionadas

## Decisões de design
- Rotas GET: `requireAuth` apenas (qualquer utilizador autenticado pode ver)
- Rotas POST/PUT/DELETE/importar: `requireRole(...ADMIN_ROLES)` — apenas admin/director/secretaria/etc.
- ADMIN_ROLES = admin, director, subdirector_pedagogico, chefe_secretaria, secretaria, ceo, pca
- Unique index: `alumni_alunoId_anoFormacao_unique WHERE alunoId IS NOT NULL` — previne duplicados ao importar o mesmo aluno no mesmo ano

**Why:** sem RBAC no backend qualquer prof poderia eliminar registos de alumni; a UI esconde os botões mas a protecção real é no servidor.

## DrawerLeft — lição aprendida
Quando há secções duplicadas no DrawerLeft, string-replace falha com "2 matches". Usar `sed -i "NUMEROa\\LINHA"` é mais fiável para inserir em linha exacta. Os 5 lugares são: linhas ~521, ~599, ~715, ~793, ~919 (mudam com cada edição).
