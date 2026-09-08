# Strado — Full Application Audit

Date: 2026-09-06 · Audited commit: `330ed1d` (branch `claude/full-app-audit-k0cmkh`)

Six parallel audits covering security, database/RLS, backend logic, UI/UX,
performance, and code quality. Each detailed report is a sibling file in this
directory. Findings marked **[verified]** below were independently re-checked
against the source or executed after the originating audit produced them; the
evidence is in [`verification.md`](./verification.md).

## Remediation status

**These reports are a snapshot of commit `330ed1d`.** Every finding below
describes what was true at that commit and is left as written — an audit that
edits its own findings once they are fixed stops being a record of what was
found. What changed since is tracked here instead, and only here.

| Finding | Status | Where |
| --- | --- | --- |
| A1 — forgeable ride statistics | **Two of three legs closed** — see the A1 table below | migrations `0052`, `0059`, `0074`, `0078` |
| A2 — route ride has no post-save destination | **Fixed** | `logTrackedCompletion` returns `completionId`; `LiveTrackingForm` navigates to `/fahrten/[id]` |
| A3 — private routes in anon-readable views | **Fixed** | migration `0060` |
| A4, A5, A6 and everything in §B | Open except the rows below | — |
| §B — dark mode never redefines `--color-danger/success/warning` | **Fixed** | `app/globals.css`: both dark blocks now set `#ef4444` / `#22c55e` / `#f59e0b` (5.23 / 8.63 / 9.16 on the background) |
| §B — light `--color-muted` at 3.11:1 | **Fixed** | `app/globals.css`: `#666b74`, 5.13:1 on the background and 4.92:1 on `--color-surface` |
| §B — `lib/actions/moderation.ts` returns `void` and never looks at an error | **Fixed** | every action returns `ModerationResult`; `ModerationActions` / `ReportedContentActions` render it. A DB error and a zero-row hit are reported separately — zero rows means either RLS denied it or the row is already gone, and "try again" is the wrong advice for the second |
| §B — React 19 wipes the file input across five forms | **Fixed for the photo case only** | `MultiPhotoInput` re-applies `input.files` on the form's `reset` event. **The rest is still open** — see the correction below |
| §B (performance) — `RouteMap`'s `trafficSegments = []` / `trail = []` defaults | **Fixed** | module-scope constants; `RouteDetailMap` also memoises its `routes={[route]}` |
| §B — password change requires no re-authentication | **Fixed** | `updatePassword` verifies the current password unless the session came from a reset link; the marker is set server-side in `app/auth/callback/route.ts` (`lib/passwortWiederherstellung.ts`) |
| §B (performance) — `auth.getUser()` is not memoised (60 call sites, 4 modules use `cache()`) | **Fixed for pages** | thirteen page components now call the memoised `getCurrentUser()`. Route Handlers and Server Actions stay on the direct call by design |
| §B (performance) — `getRoutes()` uses `select("*")` | **Fixed** | explicit column list; new `ExploreRoute` / `MapRoute` types in `types/database.ts` |
| §B (UI/UX) — small tap targets in a product used in a vehicle | **Fixed** | `min-h-9` / `min-h-11` on the existing sizes, new `lg` (52 px) for the controls shown while recording |
| §B — "No CSP or security headers configured" | **Fixed** | `next.config.ts` ships all five headers, and the CSP is now enforced rather than `Report-Only`. Report-Only was never observed by anyone — no `report-uri`/`report-to` was ever set, so every violation went to the visitor's console and nowhere else. The origin list is therefore derived from the code (Mapbox, Stripe, Supabase, open-meteo), with `*.stripe.com` as a wildcard where Stripe can add endpoints at will. `script-src` still carries `'unsafe-inline'`/`'unsafe-eval'`: nonces need the policy built per request in `proxy.ts`, which makes every page dynamic — a separate change |
| §B / backend M3 — three inconsistent definitions of "Höhenmeter" | **Fixed** | One definition, in `lib/hoehenmeter.ts`: the sum of `route_completions.hoehenmeter_aufstieg` (cumulative ascent), which is what the leaderboard already measured (`0056`). Own profile, public profile and the share-image badge all call it, and free rides now count everywhere. Rides without a measurement count as 0, matching `sum()` in the view — deliberately no fallback to `routes.hoehe_m`, which would reintroduce two definitions inside one list. Note this differs from the fix proposed in `backend.md`, which kept peak altitude and only relabelled it: peak altitude does not add up across rides, so there is nothing to keep. `lib/signature.ts` labelled a route's `hoehe_m` "Höhenmeter" too and now says "m hoch". Covered by `lib/hoehenmeter.test.ts` |

Three findings below are **new** — neither audit raised them. All three sit
in the privacy boundary and share one shape: an error that silently produced
*less* privacy than the user asked for.

| New finding | Status | Where |
| --- | --- | --- |
| `privacyRadiusM()` fell back to the 200 m default on a read error, and discarded the error unexamined. For an account set to 500 m that is 300 m less cropping at exactly the two ends of the track where the home address is | **Fixed** | `lib/publicTrack.ts` falls back to `MAX_PRIVACY_RADIUS_M` and logs; covered by `lib/publicTrack.test.ts` |
| `updateVisibilitySettings()` fell back to the same default for an out-of-range form value, then re-cropped every already-shared ride with it — a silent widening, reported as "Gespeichert." | **Fixed** | `lib/actions/profile.ts` rejects the submission instead |
| A replaced or deleted avatar stays in the **public** `avatars` bucket. `upsert` only replaces the same extension, and `anonymize_account()` nulls `avatar_url` without touching the file. The key is `{user_id}/avatar.{ext}` and the user id is in every `/fahrer/[id]` URL, so the picture of a deleted account stays fetchable by trying four extensions | **Fixed** | `uploadAvatar()` removes the other extensions; `deleteAccount()` removes all four |

A correction to this table's own earlier wording, raised in review on
#149 and confirmed by grepping the components: it previously claimed "the
other four forms use controlled fields and were never affected". That is
**wrong**. `AnmeldenForm` and `RegistrierenForm` have uncontrolled
`email` / `password` / `display_name` fields, so React 19's post-action
`form.reset()` does clear typed input after a failed sign-in or sign-up —
exactly what the audit described. What *is* true, and is the reason the
photo case was singled out:

- `RideSummaryForm` — every field is controlled, so nothing is lost there
  except the file input, which is what `MultiPhotoInput` now restores.
- `AvatarUpload` — the other `<input type="file">` in the app. It submits
  on change and shows no preview, so a cleared input is visible rather
  than silent; the person picks a file again. Different mechanism, not a
  silent loss.
- `AnmeldenForm`, `RegistrierenForm`, `PasswortVergessenForm`,
  `PasswortAendernForm`, `RatingSection` — uncontrolled text fields,
  still cleared on a failed submit. Annoying, not silent: the person sees
  the empty field. Open.

The avatar fix is forward-looking only. Objects orphaned **before** it —
every account that already swapped a JPG for a PNG, and every account
already deleted — are still in the bucket and still fetchable. Clearing
them is a storage operation, not a migration:
`scripts/verwaiste-avatare.mjs` does the sweep (list `avatars/`, diff
against `profiles.avatar_url`, report; `--loeschen` to delete). **It has
never been run**, here or anywhere — it needs the service-role key and a
live project, and neither was used while writing it. Treat its first run
as a deploy step: read the dry-run list before letting it delete
anything.

A1's three legs have moved apart and are worth taking one at a time. The
original recommendation — "`REVOKE INSERT` and route all writes through a
`SECURITY DEFINER` function" — has since been **overtaken and deliberately
declined**, not merely left undone: `0059` argues in its own header why a
`BEFORE` trigger was chosen instead, and that argument holds. A trigger
fires on every write path (direct PostgREST, `logTrackedCompletion`,
`save_free_ride_with_segments`) without a client change; the revoke would
have been a much larger cut through the core flow for the same gain.

| A1 leg | Status today |
| --- | --- |
| No write authorization on the stat columns | **Closed as a forgery route, by a different mechanism than the one recommended.** `INSERT` is still granted, but `enforce_route_completion_coverage` (`0052`) *recomputes* `abdeckung_prozent` from the stored geometry on every insert and update and can only ever narrow `ist_oeffentlich`; `enforce_route_completion_stats` (`0059`) rejects impossible values and cross-checks `distanz_km` against `st_length(track)`; `0074` bounds the remaining columns; RLS pins `user_id` to `auth.uid()`. A direct PostgREST write no longer chooses its own coverage or visibility. What it can still do is pick values *inside* those bands — which is leg 2. |
| `dauer_sekunden` is a client-supplied clock | **Open, and it needs a product decision, not a migration.** The band from `0059` (≤ 200 km/h average) leaves room: a genuine 10 km / 600 s trail replayed with timestamps ×0.4 becomes 240 s at 150 km/h and passes. Closing it needs a ride start the server recorded itself — and the recorder is open to signed-out visitors (`GefahrenSection` takes `userId: string \| null`), so there is no session to hang that start on for a guest ride. Any fix therefore changes the guest flow. A tighter speed heuristic was considered and rejected here: every threshold that catches ×0.4 compression on a pass road also rejects real rides, and a rule that quietly discards genuine rides is worse than the forgery it prevents. |
| Coverage ignores direction | **Closed** by `0078` and `lib/routeCoverage.ts`, though by a different mechanism than "make it order-aware". The coverage value is now the **minimum** of the touch ratio and the distance actually travelled relative to the route's length. The audit's case — a 20 km out-and-back driven one way — measured 100 % before and measures **50 %** now (`lib/routeCoverage.test.ts`, "Hin-und-zurück-Strecken"). A point-to-point route driven in reverse still scores 100 %, deliberately: driving a pass the other way is its own real ride. Existing rows are not re-scored; the trigger only runs on write. |

**Business rule change** (Core Rule 16): a ride over an out-and-back route
that covers only one direction used to be publishable and no longer is. It
is still saved — it just does not reach the leaderboards.

Deriving `distanz_km` server-side is not available as a fix here: the stored
track is Douglas-Peucker simplified and `lib/track.ts:93` states that
simplification must never alter a metric, so `st_length(track)` would shorten
every recorded distance. Hence a validating band rather than a derivation. The
migration enumerates the same residual risks at its end.

Neither migration has been applied. No SQL was executed against any database at
any point in this audit or its follow-up work, so both still need a run against
a Supabase branch before they go anywhere near production.

| Report | Scope |
| --- | --- |
| [`security.md`](./security.md) | Auth, Server Actions, RLS bypass, Stripe, secrets, uploads |
| [`database.md`](./database.md) | 57 migrations, RLS policies, views, `SECURITY DEFINER`, grants, indexes |
| [`backend.md`](./backend.md) | Server Actions, ride pipeline, scoring, integrations, caching |
| [`uiux.md`](./uiux.md) | Core loop, states, mobile/in-vehicle use, accessibility, forms |
| [`performance.md`](./performance.md) | Bundles, server/client boundary, render cost, PWA |
| [`quality.md`](./quality.md) | Tests, types, duplication, dead code, CI, doc drift |
| [`baseline.md`](./baseline.md) | Verified lint/test/build results and bundle measurements |

## Verified baseline

| Command | Result |
| --- | --- |
| `npm ci` | pass — 421 packages, 0 vulnerabilities |
| `npx vitest run` | pass — 21 files, 186 tests |
| `npx eslint` | pass — 0 problems |
| `npx next build` (no env) | **fail** — see A6 |
| `npx next build` (placeholder env) | pass — 30 pages |

## Headline assessment

The security posture is unusually strong for a codebase this size: RLS is
enabled on every table, all 12 `SECURITY DEFINER` functions pin `search_path`
and bind to `auth.uid()`, `getUser()` is used at all 57 auth checkpoints and
`getSession()` nowhere, and the raw GPS `track` column is deliberately kept out
of every RLS-bypassing view. No open redirect, IDOR, XSS, SSRF, injection, or
client-side secret leak was found — `app/auth/callback/route.ts` builds its
redirect from `request.url` and puts `next` through `safeInternalPath`.

That conclusion is about redirects. It is separate from the `getOrigin()`
finding in §B, which is not an open redirect: `getOrigin()` only builds the
absolute URL Supabase embeds in confirmation and reset emails. If — and only
if — the Supabase Redirect URL allow-list is permissive, a forged
`X-Forwarded-Host` could poison those links. The allow-list was not readable
from here, so that one stays conditional and unverified.

The problems cluster elsewhere, and they share one shape: **a rule enforced in
one place was not carried across to its siblings.** The leaderboard trusts
client data the ride pipeline distrusts. Two anon-granted views lost a filter
their neighbours kept. The free-ride flow returns an id the route-ride flow
throws away. That pattern, not any single bug, is the thing to fix.

---

## A. Fix first

### A1 — Leaderboards are forgeable three independent ways

The product's competitive core cannot currently be trusted. Three separate
audits converged here from different directions:

1. **No write authorization on the stat columns.** `0001_init.sql:183` is
   `for all … with check (auth.uid() = user_id)` — it constrains *only*
   `user_id`. `0046` revoked `UPDATE` and re-granted three columns, but
   **nothing ever revoked `INSERT`**, and there is no `CHECK` on
   `distanz_km`, `dauer_sekunden`, or `hoehenmeter_aufstieg`. Every
   plausibility rule lives in `lib/actions/completions.ts`, which a direct
   PostgREST `INSERT` skips entirely. **[verified: grants and constraints
   traced across all 57 migrations]**
2. **The clock is client-supplied.** `dauer_sekunden` is `last.t - first.t`
   from browser timestamps (`lib/geo.ts:87`), gated only on average speed
   ≤ 200 km/h. A genuine 10 km / 600 s trail replayed with timestamp deltas
   ×0.4 becomes 240 s at 150 km/h — passes every check, coverage still 100%.
3. **Coverage ignores direction.** `lib/routeCoverage.ts:30` asks only "is any
   trail point near this sample?" — no ordering, no one-sample-one-point. A
   20 km out-and-back route driven one way scores **100%**. **[verified by
   executing the real function: `expect(cov).toBe(100)` passed]**

**Fix:** `REVOKE INSERT` and route all writes through a `SECURITY DEFINER`
function that recomputes stats server-side (the pattern `0052` already
established for coverage — it just returns early for `art <> 'strecke'`); add
`CHECK` constraints as defence in depth; make coverage order-aware.

### A2 — Route rides have nowhere to land: the core loop is severed

`lib/actions/completions.ts` has `inserted.id` in hand at `:323` and returns a
bare `{ error: null }` at `:328`. `components/LiveTrackingForm.tsx:79-84` can
therefore only call `onExit()` — the rider is dropped back on the route page
with no ride page, no share, no kudos. Steps 6→7 of the Core User Loop are
unreachable for the app's headline flow. The free-ride path directly below
*does* return `completionId` and navigates to `/fahrten/[id]`. **[verified]**

**Fix:** return the id and navigate, matching `FreeRideForm.tsx:88-90`. This is
the smallest change on this list and the largest product impact.

### A3 — Two anon-readable views leak private and unapproved routes

Both are deliberately non-`security_invoker` (documented as such at `0014:13`
and `0009:30`), so they bypass RLS and run as owner, and both are granted to
`anon`:

- **`route_leaderboard`** (`0044:135-149`) has **no join to `routes` at all**.
  The sibling view fourteen lines above it keeps `join routes r … where
  r.status_ok = true`. Rides on private or still-pending routes are readable
  by anyone via PostgREST.
- **`route_photos`** (`0044:154-165`) lost the `status_ok` filter that `0038`
  had added to its sibling `public_completion_photos` — and documented why.

**[verified: view definitions, grants, and `security_invoker` status]**

The app never surfaces these rows (`lib/leaderboard.ts:161` always filters by
`route_id`), so this is reachable only by direct API call — which is precisely
the threat model `0040` was written for.

### A4 — A route the user asked to keep private can enter the public queue

`lib/actions/routes.ts:222` sets `ist_privat` in a second, **unchecked**
`update` after the RPC, then redirects unconditionally. If it fails, the row
sits at `status_ok=false, ist_privat=false` — exactly the predicate
`getPendingRoutes` (`lib/moderation.ts:15-24`) selects on. The route enters
public moderation with its full geometry, and the user is shown no error.
**[verified: both the discarded update and the queue predicate]**

### A5 — Stripe: paid customers can silently not get premium

The webhook records the event as processed *before* running the side effect,
and `setPremium` only `console.error`s on failure. A transient DB error
returns 200, Stripe never retries, and replay is deduped away. The price id is
also never checked against `STRIPE_PREMIUM_PRICE_ID`.

**Fix:** run the side effect first, mark processed only on success, and let
failures return non-2xx so Stripe's at-least-once delivery does its job.

### A6 — `next build` fails without environment variables

`lib/stripe.ts:5` constructs the Stripe client at module scope with
`process.env.STRIPE_SECRET_KEY!`, so collecting page data for
`/api/stripe/webhook` throws `Neither apiKey nor config.authenticator
provided`. Any build without full secrets — a fork, a fresh clone, a CI job
with a missing variable — fails with an error that doesn't name the cause.
**[verified: reproduced, then confirmed the build passes with placeholders]**

**Fix:** lazy-init behind a function, or construct with a guarded fallback.

---

## B. Fix soon

**Security & privacy**
- Password change requires no re-authentication (`lib/actions/auth.ts:195`),
  while `deleteAccount` right below it does — and its comment gives the exact
  "unattended session on a shared device" reasoning that applies. **[verified]**
- `zeigt_avatar` is bypassable in one request: six views carefully gate
  `avatar_url`, but `0034:39` grants `select (avatar_url)` on `profiles` to
  `anon` under a `using (true)` policy.
- Auth rate limiting is per-instance in-memory (`lib/rateLimit.ts:39`), so the
  5-per-email sign-in cap is really per warm lambda. It also **fails open** on
  a DB error, untested.
- A retired 64-hex webhook secret remains in plaintext at
  `0022_stripe_billing.sql:27` (function dropped in `0023`). Rotation should be
  confirmed per `SECURITY.md`.
- `getOrigin()` trusts `X-Forwarded-Host` (`lib/utils/url.ts:8`). Impact hinges
  on the Supabase Redirect URL allow-list, which was not readable from here —
  **unverified**; a wildcard preview entry would make it serious.
- No CSP or security headers configured.

**Correctness**
- `movingSeconds` has no jitter deadband although `computeTrailStats` does:
  10 minutes parked yields 0 m distance but **557 of 600 s counted as moving**.
  The 3-minute publication gate is really "3 minutes recorded".
- Ascent under-reports long rides — `nb_points` is hardcoded to 300 regardless
  of distance. A 120 km ride records 900 m against 3008 m of truth, so the
  Höhenmeter board rewards splitting one long ride into several.
- Three inconsistent definitions of "Höhenmeter": the same pass driven ten
  times shows 2000 on your own profile and 20000 on your public one.
- `lib/actions/moderation.ts` — a Protected Area — contains the word `error`
  **zero** times across 8 mutations, all returning `void`. Zero-row updates
  read as success.
- `lib/queryError.ts` states the right doctrine and is used in 3 of ~20
  eligible modules. `app/profil/page.tsx:79-84` discards five errors, rendering
  "0 Pässe, 0 km, 0 Höhenmeter" as fact during an outage.

**UI/UX**
- Dark mode never redefines `--color-danger/success/warning`
  (`globals.css:21-23`), so every `role="alert"` renders at **4.07:1** —
  below the 4.5:1 AA threshold. The file's own comment claims a token swap
  suffices for the whole app, which is what makes it easy to miss.
  **[verified: contrast recomputed]**
- Light-theme `--color-muted` is **3.11:1** and carries nearly all secondary
  text — unreadable in daylight, which is when this app is used.
- The "Strecke beenden" button is the smallest control in the recording UI
  (~34px vs ~50px for "starten"), unconfirmed and irreversible.
- Icon-only buttons at 14–16px sit adjacent in the ride-detail header;
  `CompletionActionsMenu.tsx:106` already does it correctly with `p-1.5`.
- Logged-out visitors on a route page — the landing point for every shared
  link — get an unclickable sentence instead of a sign-in CTA.
- React 19 resets uncontrolled `<form action>` fields on error, wiping typed
  input across five forms. Worse in `MultiPhotoInput`: previews survive in
  state while `input.files` is empty, so a retry silently saves zero photos.
- ~~**Legal links point at `https://xyz.ch`** (`lib/constants.ts:38-42`) and ship
  in the sign-up form and settings page. For a Swiss product handling location
  data and payments this is a compliance exposure, not a cosmetic TODO.~~
  **[verified — fixed 2026-09-06]** The pages now exist under `/legal/…` in
  `janlampert08-dev/cornice.ch` and `LEGAL_URLS` points at them, defaulting
  to `cornice-ch.vercel.app` with `NEXT_PUBLIC_LEGAL_BASE_URL` as the
  override. No own domain is registered yet, so the default names the address
  that answers today rather than one nobody owns. Two things the fix does *not* close: the operator's
  identity and address are still blank in the published texts, and the texts
  have not had legal review.

**Performance**
- `RouteMap.tsx:265-266` uses `trafficSegments = []` / `trail = []` as
  destructuring defaults — a fresh identity every render, defeating two
  dependency arrays and forcing ~2 no-op WebGL repaints/second for a whole
  ride. `CompletionMap.tsx:15` already has the module-scope-constant fix.
  **[verified]**
- The follow camera runs an 800 ms `easeTo` on every ~1 Hz GPS fix, so the
  canvas never idles.
- Snapshot writes are O(n²) synchronous main-thread IO: a 2 h ride ends at a
  ~346 KB blocking `localStorage` write having written ~124 MB cumulatively.
- `getRoutes()` uses `select("*")`, shipping full geometry, `hoehenprofil` and
  `tempolimits` for every route to the client on `/`.
- `RouteDetailMap.tsx:89` passes `routes={[route]}` inline, so the map snaps
  back to full extent whenever a legend toggle is flipped.
- The service worker hardcodes `cornice-shell-v1` and never evicts, so every
  deploy adds a full generation of chunks.
- Zero `<Suspense>` app-wide: `/strecken/[id]` blocks first paint on an
  external open-meteo call with no timeout.

**Quality**
- **10.4% of source LOC sits next to a test** (2,192 of 21,109). All 186 tests
  are pure-function unit tests in `lib/`; none touches a Server Action, Route
  Handler, or component — and components are untestable today
  (`vitest.config.mts:11` is `environment: "node"`, no jsdom installed).
  Where tests do exist, quality is genuinely high, not happy-path.
- `export type Database = any` (`types/database.ts:332`) disables schema type
  checking everywhere and drives ~15 inline `.returns<{…}>()` re-declarations.
  It is the only `any` in the codebase. **[verified]**
- Six copies of the average-speed formula, already diverged — the same ride
  shows different speeds on two pages.
- 215 lines of fully commented-out Premium UI while `lib/actions/billing.ts`,
  the webhook, and 3 Stripe deps stay live and unreachable.
- Four duplicate migration prefixes (`0034`, `0041`, `0053`, `0054`). No
  cross-dependencies and lexical order happens to be safe, but
  `schema_migrations.version` is a primary key, so `supabase db push` cannot
  record both halves of a pair — the directory is not a reliable description of
  production. CI has no migration lint despite the README documenting a real
  drift incident.
- CODEOWNERS covers 9 of 12 Protected Areas, missing `lib/actions/auth.ts`,
  `lib/actions/moderation.ts`, `lib/moderation.ts`, `lib/rateLimit.ts` — so
  `lib/actions/moderation.ts` is simultaneously the least tested, least
  error-handled, and least review-gated Protected Area.

---

## C. Worth protecting

Findings the audits explicitly flagged as correct, to avoid regressing them:

- `mapbox-gl` (1785 KB) is correctly code-split — all five consumers use
  `next/dynamic(…, {ssr:false})` on the same specifier, so one shared chunk.
  **[verified in the build's `react-loadable-manifest.json`]**
- `lucide-react` named imports need no change: it is in Next 16.3.3's default
  `optimizePackageImports` list and ships `sideEffects:false`.
- `proxy.ts` is the correct Next 16 convention, not a legacy artifact.
- Ride stats are derived server-side; client numbers are never trusted (which
  is what makes A1 a gap in coverage rather than a design flaw).
- The crash-resume snapshot layer with per-user keys and 24 h TTL; offline save
  with automatic replay of the exact `FormData`.
- Native `<dialog>` for free focus trap, Escape, and focus restore.
- `0034_profiles_column_grant_hardening.sql` catching that `0027`'s column
  REVOKEs were no-ops against Supabase's table-level grants.
- `confirmSubscription` binding a client-supplied subscription id to the
  caller's own customer *and* requiring `invoice.status === 'paid'`.
- `.claude/hooks/sql-guard.sh` catches SQL piped past prefix-matching
  permission rules.
- Rationale comments that cite the originating migration are the best
  documentation in the repo.

---

## D. Documentation drift

`AGENTS.md` asks that discrepancies be flagged:

- "rate routes" — star ratings were removed in `0025`; it is comments now.
- "can subscribe to a Premium tier" — no user can currently reach it.
- Stack versions are accurate, verified line by line; `lucide-react` and
  `@vercel/analytics` are absent from the list.
- All 24 Core User Loop paths exist and do what they claim.
- `supabase/migrations/README.md` states the unique-sequential-number rule that
  was then violated twice on and after the day it was written; root `README.md`
  step 3 says to run only `0001_init.sql` when there are 57 migrations, and its
  final section is truncated mid-sentence.

---

## Method and limits

Six independent agents audited in parallel, each restricted to reading. No SQL
was executed and no Supabase, Stripe, or Vercel MCP tool was pointed at a live
project — the database findings are derived from the migration files, so they
describe the schema those files *would* produce. Given the duplicate-prefix
issue above, confirming them against production is worthwhile.

Findings marked **[verified]** were re-checked independently of the agent that
raised them. The performance audit could not run `next build` (its
`node_modules` was reinstalled mid-run); its bundle claims are marked
`[measured]`/`[computed]`/`[estimated]` in its own report, and the central
code-splitting claim was separately confirmed against a real build.
