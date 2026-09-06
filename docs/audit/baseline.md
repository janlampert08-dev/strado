# Verified baseline (run by orchestrator, 2026-09-06)

Env: Node v22.22.2, npm 10.9.7, clean `npm ci` (421 packages, 0 vulnerabilities).

| Command | Result |
|---|---|
| `npm ci` | PASS — 0 vulnerabilities reported by npm audit |
| `npx vitest run` | PASS — 21 files, 186 tests, 1.71s |
| `npx eslint` | PASS — 0 problems |
| `npx tsc --noEmit` (standalone) | FAIL — `app/layout.tsx(67,50): TS2304: Cannot find name 'LayoutProps'` (needs Next-generated `.next/types`; passes inside `next build`) |
| `npx next build` (no env) | **FAIL** — `Failed to collect configuration for /api/stripe/webhook` → `Neither apiKey nor config.authenticator provided` at `lib/stripe.ts:5` |
| `npx next build` (placeholder env) | PASS — 30 pages generated |

## Bundle measurements (.next/static/chunks, placeholder-env build)
- Total client chunks: **3.4 MB** (uncompressed on disk)
- Largest chunk: **1785 KB** = mapbox-gl. Present in `react-loadable-manifest.json`, i.e. it IS behind `next/dynamic` — not in the shared entry.
- Next largest: 261 KB, 224 KB, 126 KB, 110 KB.

## Route rendering modes
28 of 35 routes are `ƒ` (dynamic, server-rendered on demand). The 7 static
ones are `/offline`, `/profil/premium`, `/_not-found` and the four metadata
routes `/icon`, `/apple-icon`, `/opengraph-image` and `/manifest.webmanifest`.
