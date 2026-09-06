# Cornice

Kuratierte Auto-/Motorrad-Fahrstrecken — primär Raum Zürich/Schweiz.

## Setup

1. `npm ci` ausführen (Node 22 — Next.js 16 verlangt mindestens 20.9).
2. `.env.local` aus `.env.local.example` erstellen und befüllen:
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`
     aus einem Supabase-Projekt (Settings → API). Lokale Entwicklung per
     `supabase start` würde Docker voraussetzen, das hier nicht verfügbar ist —
     daher direkt gegen ein Cloud-Projekt (supabase.com) entwickeln.
   - `NEXT_PUBLIC_MAPBOX_TOKEN` von account.mapbox.com/access-tokens.
3. Schema anlegen: Inhalt von `supabase/migrations/0001_init.sql` im Supabase
   SQL Editor ausführen (oder via `npx supabase db push`, sobald das Projekt
   mit `npx supabase link` verknüpft ist).
4. `npm run dev` und `http://localhost:3000` öffnen.

## Projektstruktur

- `app/` — Next.js App Router (Seiten, Layout, Route Handler unter
  `app/api/` und `app/auth/`, Metadaten-Routen wie `manifest.ts`)
- `components/` — UI-Komponenten (z. B. `RouteMap.tsx`);
  `components/ui/` enthält die geteilten Bausteine
- `lib/` — Geschäftslogik und Integrationen (Mapbox, Wetter, GPX, Scoring)
- `lib/actions/` — Server Actions (`"use server"`), der Weg für Mutationen
- `lib/supabase/` — Client-Factories (`client`, `server`, `middleware`, `admin`)
- `lib/utils/` — `cn.ts` und `url.ts` (`safeInternalPath`, Open-Redirect-Schutz)
- `types/` — Geteilte TypeScript-Typen (`database.ts` spiegelt das SQL-Schema)
- `supabase/migrations/` — SQL-Schema inkl. PostGIS und Row Level Security
- `docs/` — Audit-Berichte (`docs/audit/`) und der Premium-Plan
- `.agents/`, `AGENTS.md` — Regeln für Menschen und KI-Agenten in diesem Repo

## Design-Sprache

"Precision Rounded": Hintergrund `#FAFAFA`, Text `#131316`, Akzent `#3D5AFE`,
Sekundärtext `#8A8F98`, dazu Oberflächen-/Rahmen-/Statustokens
(`--color-surface`, `--color-border[-strong]`, `--color-danger/-success/-warning`)
und eine Radius-Skala (`--radius-sm/md/lg`) — siehe `app/globals.css`. Inter
für Fliesstext, IBM Plex Mono für tabellarische Zahlen (Ränge, km,
Höhenmeter). Schatten sind bewusst selten und nur für tatsächlich schwebende
Flächen reserviert (`--shadow-elevated`: Dropdowns, Dialoge, Live-Tracking-
Overlay) — ruhende Flächen bekommen weiterhin nur eine Haarlinie
(`--color-border`). Geteilte UI-Bausteine (Button, Card, Input, Dialog,
Skeleton, StatusPage) liegen in `components/ui/`.

## Bewusste Einschränkungen

- **Einsprachig Deutsch.** Kein i18n-Framework, kein Locale-Routing;
  `<html lang="de">`, alle Texte inline, Zahlen/Daten über `de-CH`.
- **Keine Komponenten- oder E2E-Tests.** Vitest läuft mit
  `environment: "node"`, alle Testdateien liegen in `lib/`. Logik, die
  getestet werden soll, gehört deshalb nach `lib/`.
- **Migrationen werden von Hand eingespielt** — siehe
  `supabase/migrations/README.md`. Grünes CI sagt nichts über das
  Live-Schema aus.
- **Premium ist derzeit abgeschaltet**, und zwar durch auskommentierten
  Code (`components/Premium*.tsx`, `app/profil/premium/`), nicht über ein
  Feature-Flag. Das Backend läuft weiter. Plan: `docs/premium-plan.md`.
- `types/database.ts` exportiert `Database = any`; die Zeilen-Typen daneben
  werden von Hand gepflegt und decken nur einen Teil der Tabellen ab.

Historisch: `0001_init.sql` kommentiert `route_completions` mit „Bewusst
KEINE Zeitmessung/Dauer pro Fahrt". Das gilt **nicht mehr** — `0008` führte
Dauer und Distanz ein, `0032` machte die Dauer öffentlich, und die
Bestenlisten ranken danach. Der Kommentar in der Migration bleibt stehen,
weil eingespielte Migrationen nicht nachträglich geändert werden
(AGENTS.md, Regel 9).
