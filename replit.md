# SIGA v3 — Super Escola

A comprehensive school management system (Integrated Academic Management System) for Angolan educational institutions. Handles academic records, financial management, HR, timetables, document generation (PDFs), and more.

## Stack

- **Frontend**: Expo SDK 54 (React Native + React Native Web), Expo Router, TanStack Query
- **Backend**: Express.js + TypeScript, port 5000
- **Database**: PostgreSQL via Drizzle ORM — uses `NEON_DATABASE_URL` (external Neon) or falls back to Replit's `DATABASE_URL`
- **PDF generation**: Puppeteer + Chromium (server-side HTML templates)
- **Auth**: JWT-based custom authentication

## Running on Replit

The **Start application** workflow runs `bash scripts/start.sh`, which:
1. Repairs `node_modules/.bin` symlinks and ensures `expo-router` assets exist
2. Builds the Expo web frontend in background if `dist/index.html` is missing
3. Starts the Express server with `tsx server/index.ts` on port 5000

The pre-built frontend lives in `dist/` (committed to the repo). The server serves it statically when `SERVE_STATIC_WEB=1`.

## Secrets

| Secret | Purpose |
|--------|---------|
| `SESSION_SECRET` | Express session secret; also the JWT signing fallback if `JWT_SECRET` is unset — configured |
| `NEON_DATABASE_URL` | External Neon Postgres connection string — configured; the app uses Neon **exclusively** (`server/db-sync.ts` never falls back to Replit's managed `DATABASE_URL` when this is set — confirmed in logs: "A usar base de dados Neon") |
| `JWT_SECRET` | Stable secret for signing auth tokens — configured |
| `RESEND_API_KEY` | Email delivery (login/OTP emails) — configured, confirmed active in logs |
| `HETZNER_HOST` / `HETZNER_SSH_KEY` | External Hetzner server operations (backups/deploy scripts) — configured |
| `GITHUB_PAT` | GitHub-related operations from scripts — configured |
| `TERMII_API_KEY` | SMS delivery via Termii — optional, not configured after re-import |
| `VAPID_PRIVATE_KEY` | Web push notifications — optional, not configured |
| `TELEGRAM_BOT_TOKEN` | Telegram notifications — optional, not configured |
| `GOOGLE_AI_API_KEY` | AI features — optional, not configured |

Note: after a re-import from GitHub, only `SESSION_SECRET` carries over automatically. All other secrets (`NEON_DATABASE_URL`, `JWT_SECRET`, `RESEND_API_KEY`, `GITHUB_PAT`, `HETZNER_HOST`, `HETZNER_SSH_KEY`) must be re-added manually — re-configured 2026-07-22.

Note: on each re-import, `.server_fp` no longer matches the container's hardware, so the server logs "modo DEGRADADO" from the anti-clonagem protection on boot — this is only a warning (recorded in `alertas_seguranca`), it does not block requests or functionality.

Note: Replit's built-in Postgres database (`DATABASE_URL`) is not used by this app — all data lives in Neon.

## Key directories

- `app/` — Expo Router screens (~70+ screens for CEO, Admin, Teacher, Student roles)
- `server/` — Express backend (`index.ts` entry, `routes.ts` API gateway ~18k lines)
- `server/templates/` — HTML templates for PDF documents
- `shared/schema.ts` — Drizzle ORM schema (source of truth for the database)
- `dist/` — Pre-built Expo web output (served statically in production)
- `scripts/` — Utility scripts (`start.sh`, `check-undefined-styles.js`)

## User preferences

<!-- Add any remembered preferences here -->

## Setup notes

- After a fresh import/clone, `node_modules` may be missing or incomplete — run `npm install` before starting the workflow.
- `NEON_DATABASE_URL` is optional: if unset, the server automatically falls back to Replit's built-in `DATABASE_URL` (confirmed working — migrations run and seed data loads on first boot). The fallback skips Neon-specific URL sanitization and permission probing.
- `JWT_SECRET` is optional: if unset, auth falls back to `SESSION_SECRET` (already configured as a Replit secret).
- On first load the splash screen ("SUPER ESCOLA") can take several seconds to clear because the web bundle is ~8.5MB — this is normal, not a hang.
