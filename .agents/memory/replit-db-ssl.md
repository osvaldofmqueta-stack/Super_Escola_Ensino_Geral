---
name: Replit DB SSL fix
description: Replit's built-in PostgreSQL uses hostname "helium" with no SSL; db-sync.ts must detect this and disable SSL.
---

# Replit built-in DB requires ssl:false

**The rule:** When `DATABASE_URL` points to hostname `helium`, the `pg` Pool must be created with `ssl: false`. With `ssl: { rejectUnauthorized: false }` the connection still fails (all 5 retry attempts), crashing the server.

**Why:** Replit's internal Helium PostgreSQL service does not use TLS. The original code always set `ssl: { rejectUnauthorized: false }` assuming a Neon cloud DB. This breaks when using Replit's own DB.

**How to apply:** In `server/db-sync.ts`, the `isLocalDatabase(url)` helper checks the hostname and returns `true` for `localhost`, `127.0.0.1`, `::1`, `helium`, and private IP ranges. The Pool is then created with `ssl: useSSL ? { rejectUnauthorized: false } : false`.

The app reads `NEON_DATABASE_URL ?? DATABASE_URL`. In Replit, `DATABASE_URL` is auto-provisioned as a secret pointing to `helium`. If the user later provides a real Neon URL as `NEON_DATABASE_URL`, SSL will be enabled correctly.
