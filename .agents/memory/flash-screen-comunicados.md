---
name: Flash Screen / Comunicados
description: Decisões de implementação do sistema de comunicados Flash Screen e tabela comunicados.
---

## Estrutura atual

- `flashScreen` é um campo JSONB em `config_geral` — campos: `ativa`, `titulo`, `mensagem`, `imagemUrl`, `duracao`, `bgColor`, `dataInicio`, `dataFim`, `destinatarios`
- Tabela `comunicados` (criada via migrations/add_comunicados.sql): histórico de comunicados enviados; `criado_por` é `VARCHAR` (não UUID) porque `utilizadores.id` é `character varying`, não `uuid`

## Comportamento do overlay (FlashScreenOverlay.tsx)

- Dispensa temporária (X ou countdown): `sessionStorage` local, volta após 3 minutos via `setTimeout`
- Dispensa permanente ("Não mostrar novamente"): `localStorage` com chave `@siga_flash_perm_v2_{titulo}_{dataInicio}`
- Filtra por `destinatarios` e `user.role` — não mostra se o role não corresponde
- Só funciona em `Platform.OS === 'web'`

## Admin UI (admin.tsx comunicacoes section)

- IIFE pattern `{activeSection === 'comunicacoes' && (() => { ... })()}` — necessário para declarar constantes locais dentro do JSX
- Histórico carregado com `comunicadosFetched` ref pattern (mesmo padrão do `cursosFetched`)
- Guardar comunicado chama `updateFlashScreen(...)` E `POST /api/comunicados` (para histórico)

**Why:** utilizadores.id foi criado como varchar (não uuid nativo) na migração original; FK para uuid falha.
