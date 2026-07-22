---
name: Committed dist/ can be stale after GitHub re-import
description: The pre-built frontend in dist/ is git-tracked; if it was committed mid-build or from an older source state, the app serves a broken page (JS parse error "Unexpected token '<'") because some _expo/static/js bundle files referenced in index.html are missing on disk.
---

After a re-import, `dist/index.html` can exist (so `scripts/start.sh` skips rebuilding) while referencing hashed JS bundle filenames that don't actually exist in `dist/_expo/static/js/web/`. Requests for the missing files fall through to the Express SPA catch-all and get back `index.html` with `Content-Type: text/html` and HTTP 200, which the browser then fails to parse as JS ("Unexpected token '<'"), leaving the app stuck on the splash screen forever (the loading screen's `MutationObserver`/4.5s fallback never see React mount because it never runs).

**Why:** `dist/` is committed to the repo (see `expo-build-replit.md`) to avoid a 3-5 minute rebuild on every deploy/re-import, but if a past commit captured an incomplete or inconsistent build, that staleness ships forward silently — `start.sh` only checks that `dist/index.html` *exists*, not that its referenced bundles are present.

**How to apply:** If the app boots (server logs look normal, DB connects) but the browser stays on the "SUPER ESCOLA" splash indefinitely with a console error like `Unexpected token '<'`, check that every `_expo/static/js/web/*.js` file referenced in `dist/index.html` actually exists and returns `Content-Type: text/javascript` (not `text/html`) when curled. If not, rebuild with `rm -rf dist && CI=1 PUPPETEER_SKIP_DOWNLOAD=true npx expo export -p web` (~2-3 min) and re-commit `dist/`.
