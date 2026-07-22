---
name: npm install setup
description: Requirements and known issues for npm install in this project, including the @expo/ngrok-bin workaround and font copying step.
---

# npm install setup

**Rule:** Always use `legacy-peer-deps=true` in `.npmrc` before running `npm install`.

**Why:** `@vitejs/plugin-react@6` has a peer conflict with `babel-plugin-react-compiler` that causes install to fail without `--legacy-peer-deps`.

**How to apply:** The `.npmrc` file at project root must contain:
```
legacy-peer-deps=true
PUPPETEER_SKIP_DOWNLOAD=true
```

Then run: `npm install` (no flags needed since .npmrc handles it).

# Inter fonts

**Rule:** After every `npx expo export -p web`, copy ALL Inter fonts to `dist/fonts/`:
```bash
mkdir -p dist/fonts
find node_modules/@expo-google-fonts/inter -name "Inter_*.ttf" -exec cp {} dist/fonts/ \;
```
Use `bash scripts/build-web.sh` — it now automates this step.

**Why:** The Expo web export does not include the font files in `dist/fonts/`. The server serves them from `dist/fonts/` but they're not part of the Expo bundle.

# @expo/ngrok-bin Invalid Version — npm install crash

**Problem:** `npm install` crashes with `TypeError: Invalid Version: ` because `@expo/ngrok-bin` platform packages (e.g. `ngrok-bin-win32-x64@2.3.41`) have an empty version string in the npm registry packument. npm Arborist crashes at ideal-tree build.

**Why:** These are optional platform packages used by Expo tunnel mode (not needed for web builds). Their npm registry metadata has `"version": ""` which is invalid. The firewall-proxied registry at `package-firewall.replit.local` returns this broken metadata.

**Workaround:** Create stub package.json + index.js for all 11 platform variants in node_modules before running npm install:
```bash
for pkg in darwin-arm64 darwin-x64 freebsd-ia32 freebsd-x64 linux-arm linux-arm64 linux-ia32 linux-x64 sunos-x64 win32-ia32 win32-x64; do
  dir="node_modules/@expo/ngrok-bin-${pkg}"
  mkdir -p "$dir"
  echo "{\"name\":\"@expo/ngrok-bin-${pkg}\",\"version\":\"2.3.41\",\"description\":\"stub\",\"main\":\"index.js\"}" > "$dir/package.json"
  echo '// stub' > "$dir/index.js"
done
```

**Limitation:** The stubs prevent Arborist from crashing during the ideal-tree build, but npm may still report "Invalid Version" and exit early. If full npm install is needed, this may require repeated attempts or an alternative package manager.

# react-native-gesture-handler missing files

**Problem:** `react-native-gesture-handler@2.28.0` has an incomplete install — several compiled JS files are missing in `lib/module/`. This causes `npx expo export -p web` to fail.

**Missing files (stubs created):**
- `lib/module/handlers/NativeViewGestureHandler.js` — must export `NativeViewGestureHandler`, `nativeViewGestureHandlerProps`, AND `nativeViewProps` (spread as array)
- `lib/module/handlers/gestures/nativeGesture.js` — must export `NativeGesture` class extending `BaseGesture`
- `lib/module/web/handlers/NativeViewGestureHandler.js` — must be default export class extending `GestureHandler`
- `lib/module/web_hammer/NativeViewGestureHandler.js` — must be default export class extending `IndiscreteGestureHandler`

**Why:** The stubs are lost when node_modules is reinstalled. Must be recreated before each Expo web export if the package was freshly installed.

**How to detect:** `npx expo export -p web` fails with "Unable to resolve module ./handlers/NativeViewGestureHandler" or "n.nativeViewProps is not iterable".
