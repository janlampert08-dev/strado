# Orchestrator re-verification of agent findings

**Every entry below records the state at commit `330ed1d`, the audited
snapshot, and is left as written.** Three of these findings have since been
acted on in this PR — A1 partially, A2 and A3 fully. The
[remediation status table](./README.md#remediation-status) is the single place
that tracks what is fixed; these entries stay as the evidence of what was
originally confirmed, not as a current-state report.

## CONFIRMED — Forgeable ride stats (security agent #1)
- `supabase/migrations/0001_init.sql:183` — policy `"Nutzer verwalten eigene Fahrten" ... for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id)`. The WITH CHECK constrains
  *only* `user_id`; every other column is free.
- `0046_fahrt_meldungen.sql:77-78` revokes UPDATE and re-grants three columns. **No REVOKE INSERT
  anywhere** — grep over all migrations for grant/revoke on `route_completions` returns only
  those two lines. Default Supabase table grant to `authenticated` therefore still allows INSERT.
- No CHECK constraint on `distanz_km`, `dauer_sekunden`, or `hoehenmeter_aufstieg`: grep for
  `check (` across all migrations matching those column names returns nothing. `0044:23-56` adds
  `art`, `fahrt_art_konsistent` and a title-length check — nothing on the numeric stats.
=> Direct PostgREST INSERT with fabricated stats is permitted by schema. Server-action
   plausibility checks in `lib/actions/completions.ts` are bypassable.

## CONFIRMED — route_leaderboard leaks private/pending routes (db agent #1)
- `0014_route_leaderboard_optin.sql:13-14` states the view is **deliberately** not
  `security_invoker`, so it runs as owner and bypasses RLS. `:29` grants SELECT to `anon`.
- `0044_freie_fahrten.sql:135-149` redefines it: `from route_completions rc join profiles p`
  — **no join to `routes`, no `r.status_ok` filter**. The sibling view immediately above it
  (`:130-133`) *does* `join routes r on (r.id = rc.route_id) where r.status_ok = true`.
=> Rows for rides on private or not-yet-approved routes are readable by anon via PostgREST.

## CONFIRMED — route_photos missing status filter (db agent #2)
- `0044:154-165`: joins `completion_photos → route_completions → profiles`, filters only
  `rc.ist_oeffentlich = true and rc.art = 'strecke'`. No `routes` join, no `status_ok`.
- Granted to `anon` at `0009_profil_erweiterungen.sql:46`; `0009:30` documents it as
  deliberately not security_invoker.

## CONFIRMED — Password change lacks re-authentication (security agent #2)
- `lib/actions/auth.ts:195-214` `updatePassword`: `getUser()` then `updateUser({password})`.
  No current-password check.
- `lib/actions/auth.ts:231-248` `deleteAccount`: does `signInWithPassword` re-auth first, and
  the comment above it spells out the exact "unattended open session on a shared device"
  reasoning that applies equally to a password change.
=> Inconsistency is real and self-documented by the codebase.

## CONFIRMED — Route ride has no post-save destination (uiux agent #1)
- `lib/actions/completions.ts:309` does `.select("id").single()` into `inserted`, uses
  `inserted.id` at `:323` for `attachPhotos`, then `:328` returns bare `{ error: null }`.
- `components/LiveTrackingForm.tsx:79-84` therefore can only `clearSnapshot(); onExit();`.
- Contrast with the free-ride path: `FreeRideFormState.completionId` is declared at
  `completions.ts:336` with a comment explaining the client needs it, and
  `components/FreeRideForm.tsx:88-90` does `router.push('/fahrten/' + state.completionId)`.
=> The two ride types diverge. The route ride — the headline flow — ends on the route page
   with no ride detail page, so steps 6→7 of the Core User Loop (post the ride → community
   reacts) are unreachable for it.

## CONFIRMED — danger/success/warning tokens missing from dark theme (uiux agent #3)
- `app/globals.css:21-23` defines them in `:root` only.
- Neither the `@media (prefers-color-scheme: dark)` block (`:57-77`) nor
  `:root[data-theme="dark"]` (`:85-105`) redefines any of the three — verified by extracting
  both blocks and grepping.
- Computed contrast for `--color-danger` #dc2626 on dark background #0b0b0d = **4.07:1**,
  below the WCAG AA 4.5:1 threshold for normal-size text. Matches the agent's figure.
- The comment at `:49-52` explicitly claims a token swap here "genügt für die ganze App",
  which is what makes the omission easy to miss.

## CONFIRMED BY EXECUTION — Out-and-back routes score 100% from half the ride (backend agent H2)
- `lib/routeCoverage.ts:31`: `trail.some((point) => haversineKm(sample, point) <= CORRIDOR_KM)`.
  No ordering, no one-sample-consumes-one-point. For an A→B→A route the outbound and return
  samples lie on the same road, so an outbound-only trail satisfies both halves.
- Ran the real function in-repo against a 20 km each-way route at lat 46.5, trail = outbound
  leg only (temporary vitest file, deleted afterwards; `git status` clean):

      route pts: 401   trail pts: 201   coverage: 100
      ✓ expect(cov).toBe(100) — PASSED

- Consequence: the ride clears `COVERAGE_THRESHOLD_PERCENT = 75`, is publication-eligible, and
  posts half the distance in half the time to a fastest-time board.
- **Re-run and still passing after PR #109 merged** — neither migration `0059` nor `0060`
  touches `computeRouteCoverage`, so this leg of A1 remains open. See the A1 table in
  [`README.md`](./README.md#remediation-status).

## CONFIRMED — proposeRoute can publish a route the user asked to keep private (backend agent H3)
- `lib/actions/routes.ts:223`: `await supabase.from("routes").update({ ist_privat: true })
  .eq("id", data);` — return value discarded, no error branch, then an unconditional
  `redirect()`.
- `lib/moderation.ts:20-22` — `getPendingRoutes` selects exactly
  `status_ok = false AND ist_privat = false AND abgelehnt_am IS NULL`.
- The RPC creates the row at `status_ok = false, ist_privat = false`. A failed follow-up update
  therefore leaves the route sitting in the public moderation queue, full geometry visible to
  moderators, with no error shown to the user.
- Same file also shows the `const { data }` error-discarding pattern the backend audit flags
  under M7 (`lib/queryError.ts` exists but is unused here).
- **Still open** — this is finding A4, not addressed by PR #109.

## CONFIRMED — RouteMap default array params defeat two dependency arrays (performance agent #1)
- `components/RouteMap.tsx:265-266`: `trafficSegments = []`, `trail = []` as destructuring
  defaults — a fresh array identity on every render for callers that omit them.
- `components/CompletionMap.tsx:15` defines `const NO_ROUTES: never[] = []` at module scope and
  passes it at `:30`, i.e. the correct pattern already exists in the codebase and simply was
  not applied in `RouteMap`.
- **Still open** — §B performance item, not addressed by PR #109.

## Orchestrator build measurements corroborate the performance agent's bundle claim
The performance audit could not run `next build` (its `node_modules` was reinstalled mid-run),
so its bundle numbers are marked `[measured]`/`[computed]`/`[estimated]` in its own report. An
independent build corroborates its central positive finding — mapbox-gl is code-split — but the
claim has two halves, and each rests on a different artifact:

- **Loaded through `next/dynamic`.** The mapbox chunk (`15sq2-ftgsxmt.js`, 1.8 MB on disk) is
  listed in `react-loadable-manifest.json` for four route groups: `/`, `/fahrten/[id]`,
  `/fahrten/neu` and `/strecken/[id]`. Separately, `grep` finds exactly five call sites using
  `dynamic(() => import("@/components/RouteMap"))` — `CompletionMap`, `ExploreView`,
  `FreeRideForm`, `LiveTrackingForm` and `RouteDetailMap` — all on the same specifier, which is
  what makes it one shared chunk rather than five.
- **Out of first load on those four routes — but NOT everywhere.** The authoritative artifact
  is `.next/diagnostics/route-bundle-stats.json`, which lists `firstLoadChunkPaths` per route.
  The mapbox chunk appears in exactly one route's first load: **`/strecken/neu`**, whose
  `firstLoadUncompressedJsBytes` is **2,330,360** against 511-795 KB for every other route —
  roughly 4.5x the next largest.

**Cause, and a finding the original audit missed.** The performance audit checked the five
`RouteMap` consumers and correctly found all five behind `next/dynamic` on one specifier. But
`components/RoutePicker.tsx:4` does not go through `RouteMap` at all — it does a **static**
`import mapboxgl from "mapbox-gl"` (plus the stylesheet at `:5`), and
`components/NeueStreckeForm.tsx:5` imports `RoutePicker` statically. So the route-creation page
eagerly ships the 1.8 MB library that every other route lazy-loads. **Open**, not addressed
anywhere in PR #109 or this PR; the fix is the same `next/dynamic` treatment the other five
consumers already use.

**Two corrections are recorded here rather than silently absorbed.** The first draft of this
entry cited `react-loadable-manifest.json` for both halves of the claim; that manifest only maps
loadable chunks and says nothing about entry composition. The second draft cited
`build-manifest.json` and concluded the chunk was "out of the shared entry" — wrong, because
that file is largely a Pages-Router artifact (no `app-build-manifest.json` is emitted by this
build) and absence from it does not mean absence from an App Router route's first load. Both
were flagged in review on PR #122; the third measurement, against the per-route stats, is what
turned up `/strecken/neu`. Full figures in [`baseline.md`](./baseline.md).
