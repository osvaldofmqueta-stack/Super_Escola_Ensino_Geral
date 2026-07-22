---
name: Ficheiros duplicados com o mesmo nome base (.ts vs .tsx)
description: Two files sharing a base name (e.g. constants/tourSteps.ts and .tsx) cause silent bundler shadowing — imports resolve to the wrong file and named exports come back undefined.
---

Nunca deixar coexistir `algumFicheiro.ts` e `algumFicheiro.tsx` no mesmo directório quando ambos exportam módulos diferentes. O bundler (Metro/Expo) resolve `@/path/algumFicheiro` para apenas UM dos dois de forma não óbvia, e o outro fica órfão e invisível a `grep` de imports — mas continua lá, silenciosamente a ganhar a resolução para todos os importadores.

**Sintoma observado:** `constants/tourSteps.ts` (legado, órfão, sem nenhum import a usar os seus exports `STEPS_*`) coexistia com `constants/tourSteps.tsx` (o real, usado em ~10 ecrãs via `ADMIN_TOUR_STEPS`, `CEO_TOUR_STEPS`, etc.). O bundler resolvia para o `.ts`, por isso todo `import { X_TOUR_STEPS } from '@/constants/tourSteps'` devolvia `undefined`. O componente `GuidedTour` fazia `steps[0]` sem guarda suficiente no primeiro render → `TypeError: Cannot read properties of undefined (reading '0')`, disparado ao abrir QUALQUER tour guiado pela primeira vez numa sessão (login como CEO, clique em "Super Admin", etc. — parecia aleatório/intermitente mas era 100% determinístico por ecrã).

**Como diagnosticar:** se um erro minificado em produção mostra `reading '0'` (ou outro índice numérico) sem stack legível, procurar o padrão correspondente na fonte (`grep` por combinações de variáveis próximas, ex. `useRef(new Animated.Value(...))` + acesso a array por índice) em vez de assumir que é bug de biblioteca (react-navigation/react-native-screens não eram a causa, apesar de parecer inicialmente). Depois de localizar o componente, verificar se algum import relacionado poderia estar a resolver para um ficheiro errado — `grep -rln` pelos nomes exportados costuma revelar se um ficheiro "irmão" com o mesmo basename está a ganhar a resolução.

**Como aplicar:** ao encontrar dois ficheiros com o mesmo nome base e extensões diferentes (`.ts`/`.tsx`) no mesmo directório, tratar como bug latente — apagar o órfão ou fundir o conteúdo, nunca deixar os dois.
