---
name: Bloqueio automático de login por inadimplência
description: Como funciona o bloqueio de acesso do aluno por propina em atraso, e onde a lógica está localizada.
---

Existe um bloqueio automático de login para alunos com propinas em atraso, controlado por `config_geral.bloqueioFinanceiroHabilitado` (bool) e `config_geral.diasAtrasoBloqueio` (dias de tolerância antes de bloquear).

**Como funciona:**
- O cálculo de "dias em atraso" reutiliza a mesma fórmula do scheduler de avisos (`runAvisosPropinaEmAtraso` em `server/scheduler.ts`): vencimento = dia `multaConfig.dataLimitePagamento` do mês/ano do pagamento pendente.
- A verificação corre na rota `POST /api/login`, logo após o check de `banido`, apenas para `role === 'aluno'`.
- `alunos.permitirAcessoComPendencia = true` isenta o aluno do bloqueio (flag já existia no schema antes desta feature, usada agora como "excepção manual").
- Resposta ao bloquear: HTTP 403 com `{ error, bloqueadoFinanceiro: true }`.

**Why:** pedido do utilizador para impedir automaticamente o acesso de alunos com dívida antiga, sem depender de acção manual da secretaria. Threshold combinado escolhido: 10 dias, bloqueia apenas login (não notas/documentos).

**How to apply:** se pedirem para também bloquear notas/documentos, replicar a mesma função `verificarBloqueioFinanceiro(alunoId)` (server/routes.ts) nas rotas relevantes — ela já está isolada para reutilização.
