---
name: JWT_SECRET obrigatório
description: Sem JWT_SECRET definido no ambiente, o servidor gera um segredo aleatório a cada reinício, invalidando todos os JWTs existentes e causando 401 em rotas autenticadas.
---

# JWT_SECRET deve ser sempre um secret estável

## A regra
`JWT_SECRET` **tem de estar definido** como Replit Secret. Sem ele, `server/auth.ts` usa `randomBytes(32).toString('hex')` como fallback — um valor diferente a cada arranque do servidor.

**Why:** Cada reinício do servidor (Replit faz isso frequentemente) gera um segredo novo. Todos os tokens JWT assinados com o segredo anterior ficam inválidos → qualquer chamada autenticada (PUT, POST, DELETE) retorna 401 silenciosamente.

**Sintoma observado:** Utilizador edita "Configuração Escolar", clica em guardar, a UI mostra sucesso (optimistic update), mas na recarga os dados voltam aos valores anteriores. O `ConfigContext.flushSave` apanha o erro 401 e mostra toast de erro, mas como está debounced 1,5s pode passar despercebido.

**How to apply:** Sempre que o sistema estiver num ambiente novo (Replit fork, servidor novo, etc.), verificar se `JWT_SECRET` está definido como secret. Se não estiver, gerar com `crypto.randomBytes(48).toString('hex')` e definir via Replit Secrets.

## Detalhes técnicos
- Ficheiro: `server/auth.ts` linha 6-8
- Expiração do token: `JWT_EXPIRES = "30d"` — com secret estável, tokens duram 30 dias
- O mesmo problema afecta todas as rotas que usam `requireAuth` middleware
