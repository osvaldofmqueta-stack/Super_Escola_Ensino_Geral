---
name: Expo Web Build Fix
description: How to fix expo export -p web failures — missing assets, fonts, and patches needed before each build
---

# Fix for `expo export -p web` failures

## Correct build command (VERIFIED WORKING)
```bash
node_modules/.bin/expo export -p web --output-dir /tmp/expo-dist
# Then copy outputs:
cp /tmp/expo-dist/index.html dist/
cp -r /tmp/expo-dist/_expo dist/
cp -r /tmp/expo-dist/assets dist/ 2>/dev/null || true
cp /tmp/expo-dist/favicon.ico dist/ 2>/dev/null || true
# Always re-copy fonts after build:
mkdir -p dist/fonts
cp node_modules/@expo-google-fonts/inter/400Regular/Inter_400Regular.ttf dist/fonts/
cp node_modules/@expo-google-fonts/inter/500Medium/Inter_500Medium.ttf dist/fonts/
cp node_modules/@expo-google-fonts/inter/600SemiBold/Inter_600SemiBold.ttf dist/fonts/
cp node_modules/@expo-google-fonts/inter/700Bold/Inter_700Bold.ttf dist/fonts/
```

**Why output to /tmp/expo-dist?** Keeps the intermediate build separate from committed dist/ files.

## Full pre-build fix script (run BEFORE every expo export)

```bash
# 1. Patch source-map (metro-source-map async API fix)
node -e "
const fs = require('fs');
const f = 'node_modules/metro-source-map/src/source-map.js';
let c = fs.readFileSync(f, 'utf8');
if (c.includes('new _sourceMap.default.SourceMapConsumer(sourceMap).eachMapping')) {
  c = c.replace('new _sourceMap.default.SourceMapConsumer(sourceMap).eachMapping', 'new _Consumer.default(sourceMap).eachMapping');
  fs.writeFileSync(f, c);
  console.log('Patch 1 aplicado');
} else {
  console.log('Patch 1 já aplicado');
}
"

# 2. React-native shims
mkdir -p node_modules/react-native/Libraries/Core
echo '// shim for web build' > node_modules/react-native/Libraries/Core/InitializeCore.js
echo 'module.exports = () => [];' > node_modules/react-native/rn-get-polyfills.js

# 3. Create missing expo-router PNG assets (Sitemap.js, Unmatched.js)
mkdir -p node_modules/expo-router/assets
for name in arrow_down.png error.png file.png forward.png pkg.png sitemap.png unmatched.png; do
  [ -f "node_modules/expo-router/assets/$name" ] && continue
  printf '\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\x0cIDATx\x9cc\xf8\x0f\x00\x00\x01\x01\x00\x05\x18\xd8N\x00\x00\x00\x00IEND\xaeB`\x82' > "node_modules/expo-router/assets/$name"
done

# 4. Fix @expo-google-fonts/inter — .ttf.png files renamed, need real .ttf copies
for dir in node_modules/@expo-google-fonts/inter/*/; do
  for png in "$dir"*.ttf.png; do
    [ -f "$png" ] || continue
    ttf="${png%.png}"
    [ -f "$ttf" ] || cp "$png" "$ttf"
  done
done

# 5. Download missing @expo/vector-icons fonts (one-time; persists in node_modules)
FONTS_DIR="node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts"
BASE_URL="https://cdn.jsdelivr.net/npm/@expo/vector-icons@15.1.1/build/vendor/react-native-vector-icons/Fonts"
for font in Fontisto.ttf Foundation.ttf Ionicons.ttf MaterialCommunityIcons.ttf MaterialIcons.ttf Octicons.ttf SimpleLineIcons.ttf Zocial.ttf FontAwesome5_Brands.ttf FontAwesome5_Regular.ttf FontAwesome5_Solid.ttf FontAwesome6_Brands.ttf FontAwesome6_Regular.ttf FontAwesome6_Solid.ttf; do
  [ -f "$FONTS_DIR/$font" ] || curl -fsSL "$BASE_URL/$font" -o "$FONTS_DIR/$font"
done
```

**Why:** These files are missing from node_modules either due to expo-font/expo-asset patches (which rename TTF→PNG), npm install incomplete, or version-specific packaging changes.

## Problem 1: `(intermediate value).eachMapping is not a function`
`node_modules/metro-source-map/src/source-map.js` uses `new _sourceMap.default.SourceMapConsumer()` which returns a Promise in source-map 0.7.x. Replace with `new _Consumer.default()`.

## Problem 2: `Cannot find module 'react-native/Libraries/Core/InitializeCore'`
Metro startup requires this file. Create shim as above.

## Problem 3: expo-router/assets/*.png missing
`Sitemap.js` and `Unmatched.js` require PNG assets. Create minimal 1×1 PNG stubs.

## Problem 4: @expo-google-fonts/inter — .ttf files missing
expo-font patch converts TTF→PNG for some weights. Copy .ttf.png files as .ttf so Metro can resolve them.

## Problem 5: @expo/vector-icons — many TTF fonts missing
Fonts like Fontisto, Ionicons, MaterialIcons, etc. are missing from the vendor/Fonts directory. Download from jsDelivr CDN (verified v15.1.1 works).

## Fonts
After each build, `dist/fonts/` must be refreshed. Copy Inter fonts from the now-fixed node_modules paths.

## Notes
- These patches are in node_modules and lost after `npm install`. Re-apply before building.
- Build takes ~15 seconds with warm Metro cache (previously took 3+ min when failing).
- `npx expo export` also works once patches are applied; `expo-internal` binary not needed.
