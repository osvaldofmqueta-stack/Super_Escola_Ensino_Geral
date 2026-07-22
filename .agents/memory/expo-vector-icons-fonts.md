---
name: expo-vector-icons fonts em falta
description: @expo/vector-icons v15 referencia vendor/react-native-vector-icons/Fonts/ que não existe após npm install; causa falha do expo export.
---

# Problema
`@expo/vector-icons` v15.1.1 referencia `./vendor/react-native-vector-icons/Fonts/Feather.ttf` (e outros TTF) nos seus ficheiros `.js` da pasta `build/`. Mas essa pasta `Fonts/` não existe no pacote instalado — só existe `glyphmaps/` e os ficheiros JS.

O erro manifesta-se durante `npx expo export -p web` com:
```
Error: Unable to resolve module ./vendor/react-native-vector-icons/Fonts/Feather.ttf
```

**Why:** `@expo/vector-icons` vende `react-native-vector-icons` internamente mas não inclui os ficheiros TTF no npm bundle. São esperados ficheiros externos.

# Fix
```bash
npm install react-native-vector-icons --no-save --legacy-peer-deps
ln -sf /home/runner/workspace/node_modules/react-native-vector-icons/Fonts \
  node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts
```

**How to apply:** Sempre que `npx expo export -p web` falhar com erro de `Feather.ttf` ou qualquer outro TTF de vector-icons. O symlink é perdido após `npm install` limpar node_modules — repetir se necessário.

# Nota adicional
O `dist/` é servido como build estático. Qualquer alteração ao frontend (`app/`) exige reconstrução com `npx expo export -p web` + restart do workflow. Se o build for interrompido a meio, o `dist/` fica corrompido (sem `index.html`) — o app mostra "Not Found". Restaurar via git checkout ou reconstruir.
