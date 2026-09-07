# Strado — Code Quality, Testing & Maintainability Audit

Read-only audit of `/home/user/strado` @ `330ed1d` (branch `claude/full-app-audit-k0cmkh`).
Scope: test coverage & test quality, type safety, duplication (AGENTS.md rule 14),
error-handling consistency, dead code, naming/conventions, CI & DX, documentation drift.
Explicitly **out of scope** (covered by other agents): security, DB/RLS, backend
correctness, UI/UX, performance. Where a quality finding has a security or correctness
edge I say so and keep the framing on quality.

## Commands actually run in this session

| Command | Result |
| --- | --- |
| `node ./node_modules/vitest/vitest.mjs run --reporter=verbose` | **21 files, 186 tests, all pass**, 2.34 s |
| `node ./node_modules/typescript/bin/tsc --noEmit` | **exit 0**, no errors |
| `node ./node_modules/eslint/bin/eslint.js` | **exit 0**, no errors or warnings |

(`npm run test` / `npm run lint` do not resolve directly — `node_modules/.bin` is empty in
this environment — so the same binaries were invoked via `node`. `npm run build` was not
run; it needs the full Next toolchain and placeholder env vars.)

---

## Scoreboard

| Dimension | State |
| --- | --- |
| Tests present | 21 files / 186 tests, all green, fast (2.3 s) |
| Source LOC covered by a co-located test file | **2 192 of 21 109 (10.4 %)** |
| Untested LOC | `lib/` 4 909 + `components/` 8 572 + `app/` 2 958 = **16 439 (78 %)** |
| `any` in non-test source | **1** (`types/database.ts:332`) |
| `@ts-ignore` / `@ts-expect-error` | **0** |
| `console.log` in production code | **0** (8 × `console.error`, all deliberate) |
| TODO / FIXME / HACK | **1** (`lib/constants.ts:38`) |
| Unimported components | 1 (`components/PremiumCard.tsx`, fully commented out) |
| tsc strict | **on** |

---

## Strengths (worth protecting)

These are unusual enough to name explicitly, because several findings below are only
"gaps in an otherwise high bar", not sloppiness.

1. **The comments are the best documentation in the repo.** Nearly every non-obvious
   decision carries a rationale comment that names the migration or PR it came from
   (e.g. `lib/routeCoverage.ts:3-7` on why the coverage threshold is 75 %,
   `lib/constants.ts:21-29` on why `REPORT_REASONS` cannot live in a `"use server"` file,
   `next.config.ts:8-16` on why `bodySizeLimit` is 9 MB). This is the single biggest
   maintainability asset here.
2. **The existing tests are genuinely good** — see "Test quality" below. They are not
   happy-path smoke tests.
3. **Server-side recomputation of ride stats is real, not aspirational.**
   `lib/actions/completions.ts:225-252` derives distance/duration/coverage from the raw
   trail and ignores client-sent numbers, exactly as AGENTS.md step 5 claims.
4. **`supabase/migrations/README.md`** is an honest post-mortem of a real production
   incident (migrations merged but never applied) and documents the failure mode rather
   than hiding it.
5. **No duplicated map components.** `RouteDetailMap.tsx` and `CompletionMap.tsx` are thin
   `dynamic(...)` wrappers around the single `RouteMap.tsx`, each with a comment saying so.
   The "several `*Map.tsx` files" concern in the brief does not hold.
6. **`.env.local.example`, CI env block and `process.env.*` references agree exactly** —
   no missing or stale variable in either direction.
7. Type-escape hygiene is excellent: one `any`, zero `@ts-ignore`, three `as unknown as`
   (two of them in test mocks, which is the right place for them).

---

## 1. Test coverage gaps

### 1.1 The shape of the gap

Every test in the repo is a **pure-function unit test in `lib/`**. There is no test that
exercises a Server Action, a Route Handler, a React component, or any code path that
touches Supabase beyond three hand-rolled query-builder stubs. Concretely:

- `lib/actions/**` — **13 files, 2 621 LOC, 0 tests.** This is where every authenticated
  mutation lives.
- `components/**` — **71 files, 8 572 LOC, 0 tests.** Includes `useRideRecorder.ts` (576
  LOC) and `RouteMap.tsx` (906 LOC).
- `app/**` — **2 958 LOC, 0 tests**, including three public API route handlers.
- Data-access `lib/` modules with no test: `completions.ts` (385), `shareImage.ts` (323),
  `moderation.ts` (185), `routes.ts` (124), `signature.ts` (127), `follows.ts` (116),
  `profile.ts` (109), `kudos.ts` (89), `publicTrack.ts` (88), `mapboxDirections.ts` (88),
  `routeShape.ts` (83), `offlineRoutes.ts` (75), `achievements.ts` (68), `weather.ts` (56),
  `feed.ts` (49), `ratings.ts` (46), `theme.ts` (29), `utils/url.ts` (26),
  `queryError.ts` (23), `photos.ts` (17), `favorites.ts` (12), `utils/cn.ts` (8).

### 1.2 Blocking infrastructure gap — no component testing is possible today

**Severity: high (enabler for everything in `components/`)**

`vitest.config.mts:11` sets `environment: "node"`, and `@testing-library/react`, `jsdom`
and `happy-dom` are **not installed** (verified against `node_modules/`). So the 8 572 LOC
in `components/` are not merely untested — they are *untestable* without a config and
dependency change. Similarly there is no `@vitest/coverage-v8`, so `--coverage` cannot run
and no coverage number can be enforced.

**Fix:** add `jsdom` + `@testing-library/react` + `@vitest/coverage-v8` as devDependencies
and switch to per-file environments:

```ts
// vitest.config.mts
test: {
  environment: "node",
  environmentMatchGlobs: [["components/**", "jsdom"]],
  coverage: { provider: "v8", reporter: ["text", "json-summary"] },
}
```

This is a justified dependency addition under rule 15 (there is no installed alternative),
and it should be called out in the PR.

### 1.3 Untested modules ranked by risk

Ranking axes: **money**, **auth/authorization**, **data loss / silent corruption**, **core
user loop** (AGENTS.md steps 1–8).

#### Rank 1 — `lib/actions/completions.ts` (899 LOC, 0 tests)
**Risk: core loop steps 5–6 + data loss + leaderboard integrity.** This is the largest file
in the repo and the single authoritative writer of every ride statistic. It contains six
exported actions and eight private helpers, several of which are **pure and trivially
testable but not exported**, which is why they have no tests:

| Helper | Line | Why it needs a test |
| --- | --- | --- |
| `parseTrail` | `:55` | Rejects malformed JSON, non-array, wrong point shape, `< 5` and `> 20 000` points. Five distinct error strings — a regression here rejects real rides. |
| `implausibilityReason` | `:91` | Four fraud/plausibility gates (zero distance, > 200 km/h, > 12 h, > 2 km jump). Business rules per rule 16. |
| `removeUploadedFotos` | `:133` | Parses a storage path back out of a public URL by string search for `/route-photos/`. A URL-format change silently orphans files. |
| `buildDetectedSegments` | `:417` | Caps at `MAX_DETECTED_SEGMENTS = 20`, filters partial attempts below `MIN_PARTIAL_HINT_FRACTION = 0.3`. |
| segment-retry fallback | `:596-611` | Matches DB errors with `/route_not_eligible\|too_many_segments/` on `error.message` and retries the RPC without segments. **String-matching a database function's error text is a fragile contract with zero test coverage** — if the message changes, a legitimate free ride is lost entirely instead of being saved without segments. |

**Concrete fix:** move the five helpers into a new pure module (e.g. `lib/completionRules.ts`),
export them, and add a `lib/completionRules.test.ts` covering: each `parseTrail` rejection
path; each `implausibilityReason` branch plus the just-inside/just-outside boundary of every
threshold; `removeUploadedFotos` path extraction for a normal URL, a URL without the bucket
marker, and a URL with the marker appearing twice; the 20-segment cap; and the
`route_not_eligible` retry classifier (including a *non*-matching error, which must **not**
retry). No Supabase mock needed for any of these.

#### Rank 2 — `app/api/stripe/webhook/route.ts` + `setPremium` (money)
**Severity: high.** `lib/stripeWebhook.ts` is tested (well — see 1.4), but the handler
around it is not, and it has a real defect the test suite cannot see:

- `route.ts:20-28` — `setPremium()` on failure only `console.error`s and returns. The
  handler then returns `200 {received:true}`.
- `route.ts:47-49` — the idempotency row is inserted **before** the side effect runs.

So a transient failure of the `profiles` update means: Stripe is told "received", the event
ID is already recorded as processed, and Stripe's retry is deduplicated away. **A paid
subscription never grants premium and never self-heals.** AGENTS.md rule 12 asks for
idempotency; the implementation gets record-then-act ordering wrong in the unsafe direction.

**Fix:** make `setPremium` return the error, and on failure return a 5xx from the POST
handler *and* delete the idempotency row (or insert it only after the side effect
succeeds). Add tests for: missing `stripe-signature` → 400; `constructEvent` throwing →
400; duplicate event → `{duplicate:true}` with no `setPremium` call; each of the three
event types → correct `ist_premium` value; `setPremium` failure → non-2xx.

Mitigating context: Premium is currently disabled in the UI (see 5.1), so no user can reach
the purchase flow today. That lowers present impact, not the defect's severity when the
feature is switched back on — and switching it back on is explicitly the plan per the
comment at `route.ts:1-4`.

#### Rank 3 — `lib/actions/moderation.ts` (173 LOC, 0 tests, Protected Area)
**Risk: authorization + silent no-op.** Eight moderator-only mutations, each following the
identical shape `getUser()` → `isModerator()` → mutate → `revalidatePath()`. Two problems:

- **Every mutation discards its error** (`:24`, `:38`, `:59`, `:74`, `:96`, `:120`, `:133`,
  `:157`, `:164`). The file contains the string `error` zero times. A failed approval, a
  failed report dismissal, or a failed unpublish is indistinguishable from success.
- All eight return `void`, so `components/ModerationActions.tsx` and
  `components/ReportedContentActions.tsx` structurally *cannot* show a failure.

`unpublishReportedCompletion` (`:149`) is the worst case: it is the tool for taking
reported content out of public view. If the update fails, the moderator sees the item
vanish from the queue (the second update marking reports `erledigt` may still succeed) while
the content stays public.

**Fix:** give each action a `{ error: string | null }` return like the other action modules
already use, propagate the Supabase error, and surface it in the two components. Then add a
test file with a stubbed client asserting: non-moderator → no mutation issued; moderator +
DB error → error returned; `unpublishReportedCompletion` does **not** mark reports resolved
when the unpublish itself failed.

#### Rank 4 — `lib/geo.ts:70 computeTrailStats` (core loop, single function)
**Severity: medium-high, cost to fix: ~20 lines.** This is the odd one out: it lives in a
file that *is* tested (`lib/geo.test.ts` covers `haversineKm`, `estimateApproachMinutes`,
`averageTempolimit`, `estimateRouteDurationMinutes`, `formatMinutes`) but `computeTrailStats`
and `toCoordinates` are skipped — and `computeTrailStats` is the function that produces the
authoritative distance and duration for **every** ride and therefore every leaderboard entry.

Untested edge cases that matter:
- `MIN_SEGMENT_KM = 0.005` jitter suppression — a stationary GPS wobble must add 0 km.
- Duration is `trail[last].t - trail[0].t` using **client-supplied** timestamps. A
  non-monotonic or backwards clock yields a negative duration; only
  `implausibilityReason` (also untested) catches it downstream.
- `trail.length < 2` → `{0, 0}`.
- The `last` cursor only advances on accepted segments — a long slow drift made of
  sub-threshold steps is dropped entirely. That is intentional but nothing pins it.

**Fix:** add a `describe("computeTrailStats")` block to the existing `lib/geo.test.ts`.
Cheapest high-value test in the repo.

#### Rank 5 — `lib/actions/auth.ts` (279 LOC) and `lib/utils/url.ts` (26 LOC)
**Risk: auth.** `safeInternalPath` (`lib/utils/url.ts:22`) is a pure open-redirect guard
with four documented rejection rules (`null`, no leading `/`, leading `//`, leading `/\`).
It is imported by `lib/actions/vehicles.ts`, `app/auth/callback/route.ts` and
`app/profil/fahrzeuge/neu/page.tsx`, and has **zero tests** despite being a 5-line pure
function — the single best test-value-per-line in the codebase. Add
`lib/utils/url.test.ts` covering all four rejections plus `"/profil"`, `"/profil?x=1"`, and
adversarial inputs `"//evil.example"`, `"/\\evil.example"`, `"https://evil.example"`,
`"\t//evil"`.

#### Rank 6 — `lib/moderation.ts` (185 LOC, Protected Area)
The three `getOpen*Reports` functions each do a two-step join-by-hand (fetch reports, then
fetch context, then `Map`-merge). `getOpenCompletionReports:163` deliberately drops reports
whose ride is no longer public — a real business rule with no test. `getOpenRatingReports:96`
uses a non-null assertion `ratingById.get(r.rating_id)!` justified by an `on delete cascade`;
if that assumption ever breaks it is a runtime `TypeError` on the moderation queue.

#### Rank 7 — `lib/completions.ts`, `lib/feed.ts`, `lib/profile.ts`, `lib/kudos.ts`
Read paths for the loop's steps 6–8. `freieFahrtTitel` (`lib/completions.ts:18`) is pure,
three-branch, used in three places, and untested.

#### Rank 8 — `lib/signature.ts` (127 LOC)
Not risky (display-only) but it is **pure, deterministic, and percentile-based** —
`percentileRanks` (`:36`) has real edge cases (all-null input, single present value,
ties, `Number.isFinite` filtering) and `computeSignatures` has a documented invariant
("must always be called on the unfiltered set"). A test would cost ~40 lines and lock in
the invariant. Highest test-value-to-effort ratio after `computeTrailStats` and
`safeInternalPath`.

#### Rank 9 — `components/useRideRecorder.ts` (576 LOC, core loop steps 3–4)
Blocked by 1.2. When jsdom lands, the priority cases are: snapshot resume after a killed
tab (interacts with the already-tested `lib/trackingStorage.ts`), `MIN_ACCURACY_M`
filtering, and wake-lock failure not breaking recording (`:193-201`).

### 1.4 Quality of the existing tests — good, with specific holes

I read all 21 test files. **These are not happy-path tests.** Evidence:

- `lib/track.test.ts` — "does not blow the stack on a long, nearly straight track"
  (recursion-depth regression), "stays within one percent of the original distance on a
  curvy track" (property-style assertion, not a golden value), "gives up rather than
  publishing a track that is shorter than two radii" (privacy fail-closed).
- `lib/lapDetection.test.ts` (429 LOC, 15 cases) — the strongest file. Covers reverse
  traversal, two laps in a row, an aborted lap that must report progress but not count,
  gap-abort, *and* the subtle "re-entry after a gap happens to land near lap close" case.
  This is adversarial thinking, not coverage-chasing.
- `lib/trackingStorage.test.ts` — "does not hand a snapshot to a different user on the
  same browser" and "survives a storage that throws (private browsing, quota)".
- `lib/stripeWebhook.test.ts:31` — asserts the **rethrow** on a non-`23505` error, i.e. it
  tests that the code does *not* silently treat an unrelated DB failure as a duplicate.
- Technique is solid: `vi.useFakeTimers()` + `setSystemTime` for the Zurich DST rollover
  in `lib/format.test.ts`, `vi.stubGlobal("localStorage", …)`, mocked `fetch` including a
  rejected promise in `lib/geocoding.test.ts`.

Specific holes in the existing tests:

| Test file | Missing case | Severity |
| --- | --- | --- |
| `lib/rateLimit.test.ts` | `isRateLimited` is never tested with `error != null`. `lib/rateLimit.ts:18` destructures only `{ data }` — **a DB error makes the limiter fail open** (`data` is null → "not limited"). Neither the behaviour nor the intent is pinned. | High |
| `lib/rateLimit.test.ts` | `MAX_TRACKED_KEYS = 5000` eviction path (`lib/rateLimit.ts:55-60`) never exercised — an unbounded-growth guard with no test. | Medium |
| `lib/rateLimit.test.ts` | `getClientIp` with `x-forwarded-for: ""` or `" , 1.2.3.4"` (returns `""`, an empty rate-limit bucket key shared by all such callers). | Medium |
| `lib/stripeWebhook.test.ts` | The mock's `insert()` ignores its argument, so nothing asserts that the correct `{id, type}` is written. | Low |
| `lib/routeCoverage.test.ts` | No test at the `COVERAGE_THRESHOLD_PERCENT = 75` boundary, even though that exact number gates public visibility (`lib/actions/completions.ts:257`). | Medium |
| `lib/geo.test.ts` | `computeTrailStats`, `toCoordinates` — see 1.3 rank 4. | High |
| `lib/elevation.test.ts` | `fetchElevationProfile`'s network paths (non-ok response, non-array JSON, throw) are untested although `lib/geocoding.test.ts` demonstrates exactly how to do it. | Medium |
| All | No assertion anywhere that a *thrown* `throwOnQueryError` produces the intended message — `lib/queryError.ts` itself has no test. | Low |

**One convention flaw:** 19 of 21 test files write `it("…")` in English;
`lib/lapDetection.test.ts` and `lib/nav.test.ts` are entirely in German. Either is fine, the
mix is not — the verbose reporter output reads as two different suites. Pick one (English
matches the majority and the surrounding tooling) and note it in AGENTS.md.

---

## 2. Type safety

### 2.1 `export type Database = any` — the one real hole
**Severity: high. `types/database.ts:331-332`**

```ts
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Database = any;
```

Header at `types/database.ts:1-3` confirms the file is **hand-maintained**, with a note that
`npx supabase gen types typescript --linked` should replace it. Consequence: every
Supabase client is `SupabaseClient<any>`, so **table names, column names and row shapes are
completely unchecked**. `tsc --noEmit` passes cleanly on `supabase.from("routez").select("nmae")`.

This is what forces the codebase's pervasive workaround — every query re-declares its own
row shape inline via `.returns<{…}[]>()` or `as X[]`. I counted these inline shape
declarations across `lib/` and `app/`; they are the dominant source of duplication in the
repo (see 3.2). The hand-written interfaces in `types/database.ts` (`Route`, `Vehicle`,
`PublicFahrt`, …) are only as correct as someone's memory of 57 migrations, and the code
trusts them blindly via unchecked casts like `data as RouteGeoJSON` (`lib/routes.ts:122`)
and `(data as RoutePhoto[]) ?? []` (`lib/photos.ts:16`).

**Fix (staged):** (a) generate the types once with the Supabase CLI into
`types/supabase-generated.ts`; (b) `export type Database = GeneratedDatabase` and keep the
existing hand-written view-shape interfaces as derived aliases; (c) add a CI step
`supabase gen types … --linked | diff - types/supabase-generated.ts` so schema drift fails
the build. Step (c) also closes the migration-drift gap described in
`supabase/migrations/README.md`.

**Interim, zero-cost fix:** the 15 `.returns<…>()` inline shapes for the *same* tables should
at minimum reference `types/database.ts` interfaces via `Pick<Route, "id" | "name">` instead
of re-typing the fields. That converts a silent drift into a compile error.

### 2.2 Non-null assertions — 28, in three distinct risk classes
**Severity: low-medium**

- **Env vars (10):** `lib/supabase/{server,client,admin,middleware}.ts`, `lib/stripe.ts:5`,
  `lib/stripeClient.ts:14`, `lib/actions/billing.ts:69`,
  `app/api/stripe/webhook/route.ts:40`. Idiomatic, but there is **no runtime env
  validation anywhere** — a missing `SUPABASE_SECRET_KEY` in production surfaces as an
  opaque Supabase client error at first use, not at boot. Fix: a small
  `lib/env.ts` that reads and asserts each variable once at module load with a named error.
- **Narrowing the compiler cannot see (15):** `app/fahrten/[id]/page.tsx` uses `route!`
  eight times (`:207`, `:214`, `:218`, `:230`, `:231`, `:233`, `:346`) guarded by the
  separate boolean `istFreieFahrt`; `app/fahrer/[id]/page.tsx:79,83` uses `viewer!` guarded
  by `showFollow`. Fix: replace the boolean with a discriminated union
  (`{art:"strecke", route: RouteGeoJSON} | {art:"frei", route: null}`) so narrowing works
  and the assertions disappear.
- **Assumption-backed (3):** `lib/moderation.ts:96` `ratingById.get(r.rating_id)!` (backed
  by an `ON DELETE CASCADE`, documented at `:92-95`), `lib/profile.ts:88`
  `hoeheById.get(f.route_id!)` (backed by a `.filter(f => f.route_id !== null)` two lines
  up), `components/ElevationProfile.tsx:36` `svgRef.current!`. Acceptable; the first two
  deserve the tests named in 1.3.

### 2.3 tsconfig strictness
`strict: true` is on — good. Missing, all of which the codebase would likely pass today:

| Flag | Why it would help here |
| --- | --- |
| `noUncheckedIndexedAccess` | The codebase indexes arrays constantly (`ranks[key][i]` at `lib/signature.ts:115`, `sorted[…]`, `parts.find(…)?.value`). This is the highest-value missing flag. |
| `noUnusedLocals` / `noUnusedParameters` | Would have caught the dead exports in §5 at build time. |
| `exactOptionalPropertyTypes` | Relevant given the many `x?: T` / `T \| null` mixes in `types/database.ts`. |

`skipLibCheck: true` is fine for a Next app.

### 2.4 Other
- `as unknown as` appears 3×: twice in test mocks (correct usage), once in
  `lib/rateLimit.ts:27` `(data as unknown as Record<string, string>)[timestampColumn]` —
  unavoidable given a dynamic column name and `Database = any`; it disappears once 2.1 is fixed.
- 10 `eslint-disable` comments, all narrow and justified (7 × `@next/next/no-img-element`
  for object-URL previews, 3 × `react-hooks/exhaustive-deps` on map-init effects). No
  blanket file-level disables.

---

## 3. Duplication (AGENTS.md rule 14)

### 3.1 `UUID_RE` duplicated next to a tested utility that exists
**Severity: medium. `lib/routes.ts:5` vs `lib/validation.ts:1`**

Byte-identical regex literal in both files. `lib/validation.ts` exports `isValidUuid`, is
covered by 6 tests, and is imported by `lib/actions/{kudos,favorites,follows,ratings,reports}.ts`
and both `app/api/strecken/**` handlers. `lib/routes.ts` re-declares it privately and uses
it at `:81` and `:112`.

**Fix:** delete `lib/routes.ts:5`, `import { isValidUuid } from "@/lib/validation"`. One line.

### 3.2 Six copies of the average-speed calculation, two with different semantics
**Severity: medium (correctness drift, not just tidiness)**

| Location | Expression | Zero/null case |
| --- | --- | --- |
| `lib/shareImage.ts:242` | `distanceKm / (durationSeconds/3600)` | `null` |
| `app/profil/page.tsx:324` | `distanz_km / (dauer_sekunden/3600)` | **`0`** |
| `app/fahrten/[id]/page.tsx:117` | uses **`bewegteZeitSekunden ?? dauerSekunden`** | `null` |
| `components/DetectedSegmentsCard.tsx:25` | `distanzKm / (dauerSekunden/3600)` | `null` |
| `components/LiveTrackingForm.tsx:241` | `distanceKm / (seconds/3600)` | `null` |
| `components/FreeRideForm.tsx:108` | `distanceKm / (seconds/3600)` | `null` |

Two real inconsistencies already: the profile list renders `0 km/h` where every other
surface renders `—`, and only the ride detail page prefers *moving* time, so the same ride
shows a different average speed on `/profil` and on `/fahrten/[id]`.

**Fix:** add to `lib/format.ts` (which already owns `formatDuration` / `formatKm`):

```ts
export function averageKmh(distanceKm: number | null, seconds: number | null): number | null
```

decide once whether moving time or elapsed time is authoritative (this is a business rule
under rule 16 — call it out in the PR), and replace all six call sites.

### 3.3 The pass/elevation aggregation exists three times
**Severity: medium**

The same "dedupe completions by `route_id`, sum `routes.hoehe_m`" aggregation is
implemented independently in:

- `lib/achievements.ts:29-46` (`getUserAchievementStats`) — Map-based dedupe.
- `app/profil/page.tsx:120-124` + `:165-171` — identical select string
  (`"route_id, routes(hoehe_m)"`), identical Map-based dedupe, identical reduce.
- `lib/profile.ts:76-89` — Set-based dedupe over `public_fahrten` instead.

The code even admits it: `app/profil/page.tsx:164` says *"entspricht der Dedup-Logik in
lib/profile.ts"*. `lib/achievements.ts:19-21` says it exists so callers that don't load the
whole profile page can reuse it — and then `app/profil/page.tsx` doesn't use it.

**Fix:** have `app/profil/page.tsx` call `getUserAchievementStats(user.id)` and delete its
inline copy (removes one of the six parallel queries too). Keep `lib/profile.ts` separate
only if the `public_fahrten`-vs-`route_completions` source difference is deliberate — and
if it is, say so in a comment, because right now the two produce different numbers for the
same user by design and nothing records that.

### 3.4 Two implementations of "what is this site's origin?"
**Severity: low. `lib/actions/billing.ts:146` vs `lib/utils/url.ts:6`**

`siteUrl()` reads `NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"`; `getOrigin()` derives
it from `x-forwarded-host`/`x-forwarded-proto`. A third variant lives in
`app/layout.tsx:24` (`VERCEL_PROJECT_PRODUCTION_URL`). Three places to get wrong on a
domain change. Fix: one `lib/utils/url.ts` helper with a documented precedence order
(request headers → `NEXT_PUBLIC_SITE_URL` → `VERCEL_PROJECT_PRODUCTION_URL` → localhost)
plus a test for the precedence.

### 3.5 The dropdown-menu pattern, copied twice
**Severity: low. `components/CompletionActionsMenu.tsx:17,55-65` vs `components/RouteActionsMenu.tsx:21,44-53`**

Both declare a near-identical `ITEM_CLASS` string (they differ only by
`disabled:pointer-events-none disabled:opacity-50`) and both contain a byte-identical
click-outside `useEffect`. `RouteActionsMenu.tsx:22` even says *"Gleiches Grundmuster wie
RouteActionsMenu.tsx"* in the other file's comment.

**Fix:** `components/ui/` already exists (Button, Card, Dialog, Input, Skeleton, Switch,
DragSheet, EmptyState, StatusPage) — add `components/ui/DropdownMenu.tsx` owning the
click-outside effect and the item class, and a `useClickOutside(ref, onClose)` hook. Two
files converge; a third such menu becomes cheap. Only two copies exist today, which is why
this is low and not medium.

### 3.6 Inline row shapes instead of shared types
**Severity: low, but it is the largest raw duplication in the repo**

`.returns<{…}[]>()` blocks re-declare column shapes at `lib/completions.ts:80-90` and
`:305-325`, `app/profil/page.tsx:131-146` and `:151-158`, `lib/moderation.ts:143-152`,
`lib/achievements.ts:31`, `lib/publicTrack.ts:22,58,74`. `app/profil/page.tsx:131-146`
duplicates most of `lib/completions.ts:305-325`. Root cause is §2.1; interim fix is
`Pick<>`/`Omit<>` over the `types/database.ts` interfaces.

### 3.7 Not duplication (checked and cleared)
- `*Map.tsx` — thin wrappers, see Strengths §5.
- `*Button.tsx` — `KudosButton`, `FollowButton`, `FavoriteButton`, `BackButton`,
  `ShareRideButton`, `PublishRouteButton`, `OfflineRouteButton`, `OfflineRetryButton`,
  `DeleteProposalButton`, `DeleteVehicleButton`, `CompletionReportButton` all have
  genuinely distinct bodies and mostly route through `components/ui/Button`.
- `ModerationActions.tsx` vs `ReportedContentActions.tsx` — different actions, different shapes.

---

## 4. Error-handling consistency

### 4.1 `lib/queryError.ts` is doctrine, applied in 3 of ~20 eligible modules
**Severity: high**

`lib/queryError.ts:3-13` states the rule clearly and correctly: a query error is not
"no rows", and conflating them renders an outage as a fact — *"0 km gefahren", "keine
Fotos"*. `throwOnQueryError` is imported by exactly three files: `lib/completions.ts`,
`lib/profile.ts`, `lib/kudos.ts`.

Modules that read from Supabase and **never mention `error` at all** (verified by grep):

| File | Lines | Consequence of a silent failure |
| --- | --- | --- |
| `lib/feed.ts:38` | `const { data } = await query;` | The whole feed renders as the empty state — "no rides yet" for every user during an outage. This is the exact scenario `queryError.ts` names. |
| `lib/moderation.ts:7,17,…` (9 sites) | all discard | Empty moderation queue looks like "nothing to moderate". Protected Area. |
| `lib/actions/moderation.ts` (9 mutations) | all discard | See 1.3 rank 3. Protected Area. |
| `lib/ratings.ts:11,20,39` | all discard | Comments silently vanish from a route page. |
| `lib/follows.ts` (6 sites) | all discard | Follower counts silently read 0. |
| `lib/photos.ts:10` | discards | Photo gallery silently empty. |
| `lib/favorites.ts:5` | discards | `isFavorite` returns `false` on error → the heart un-fills. |
| `lib/rateLimit.ts:18` | discards | **Fails open** — an error means "not rate limited". |
| `app/profil/page.tsx:79-84` | all five destructure `{ data }` only | The user's own profile shows "0 Pässe, 0 km, 0 Höhenmeter" on any query failure — precisely the sentence in `queryError.ts:8`. |
| `app/profil/einstellungen/page.tsx:34` | discards | Settings render with defaults instead of the user's real values. |

**Fix:** apply `throwOnQueryError` uniformly to every read that feeds a rendered fact.
Where an empty result is a legitimate degraded state (e.g. `lib/weather.ts`,
`lib/traffic.ts` — optional external enrichment), keep the swallow but say so in a comment,
as those files already do. For `lib/rateLimit.ts:18`, fail **closed** on error (an error
should mean "treat as limited") and add the test named in 1.4.

### 4.2 Three error strategies inside one file
**Severity: medium. `lib/routes.ts`**

- `getRoutes():16` → `console.error` + return `{routes: [], error: true}` (caller-visible flag)
- `listRouteChoices():40` → `console.error` + return `[]` (flag lost)
- `listRouteDetectionCandidates():92` → `console.error` + return `[]` (flag lost)
- `getRoute():119` → `console.error` + **throw** (with a `PGRST116` → `null` special case)

Four functions, three contracts. `getRoute`'s comment (`:99-101`) explains why it throws;
nothing explains why its two neighbours don't. **Fix:** converge on `throwOnQueryError`
plus the `PGRST116`/`maybeSingle` "not found" distinction, and delete the ad-hoc
`{error: boolean}` channel.

### 4.3 Swallowed errors — mostly legitimate, two worth changing
**Severity: low**

19 `catch {}` blocks. I read all of them; 17 are correct and commented (JSON parse guards
at `lib/actions/routes.ts:72,112` and `lib/actions/completions.ts:59`; optional external
services at `lib/weather.ts:53`, `lib/traffic.ts:96`, `lib/elevation.ts:63`,
`lib/geocoding.ts:58`; storage-throws at `lib/trackingStorage.ts:52,70,91,99`; wake-lock at
`components/useRideRecorder.ts:199`; the `cookies().set` no-op in a Server Component at
`lib/supabase/server.ts:21`, which is the documented `@supabase/ssr` pattern). Two are worth
revisiting:

- `components/OfflineRouteButton.tsx:46` — a quota-exceeded save failure produces **no user
  feedback at all**; the comment says the button stays usable for a retry, but the user is
  never told the download failed. Add an inline error state.
- `lib/actions/billing.ts:122` — `stripe.subscriptions.retrieve` failure returns `false`,
  making a transient Stripe outage indistinguishable from "your payment was not valid" to a
  user who has already been charged. Money path. Distinguish transient from terminal
  (return a discriminated result) once Premium is re-enabled.

### 4.4 Console usage — clean
8 `console.error` calls, zero `console.log`/`warn`/`debug`. All eight are on genuine error
paths. No action needed; this is better than most codebases.

---

## 5. Dead code

### 5.1 An entire feature is shipped as comments
**Severity: medium (maintenance + doc drift + bundle)**

| File | Lines | Executable lines |
| --- | --- | --- |
| `components/PremiumCheckoutForm.tsx` | 153 | **0** |
| `components/PremiumPurchaseView.tsx` | 22 | **0** |
| `components/PremiumCard.tsx` | 40 | **0** (also the only unimported component in the repo) |
| `app/profil/premium/page.tsx` | 40 | 3 (a `redirect("/profil")`) |

215 lines of commented-out JSX/TSX. Behind them, live but unreachable code remains:
`lib/actions/billing.ts` (177 LOC, Protected Area), `lib/stripe.ts`, `lib/stripeClient.ts`,
`app/api/stripe/webhook/route.ts`, plus four Stripe npm dependencies
(`stripe`, `@stripe/stripe-js`, `@stripe/react-stripe-js`) and four `STRIPE_*` env vars
that CI must supply.

The comments justify this as "reactivate later without backend changes" — a reasonable
intent, executed in the one way that guarantees rot: commented code is not type-checked,
not linted, not tested, and does not appear in refactors. When Premium returns, this code
will be stale against a Next 16 / Stripe SDK that has moved on (the code even carries a
note at `lib/actions/billing.ts:74-77` about an API-shape change that already happened
once).

**Fix:** delete the four commented files. Git history is the archive — reference the last
commit SHA that contained them in a short note in AGENTS.md. Keep the webhook and
`lib/actions/billing.ts` live (they are legitimately still needed for existing
subscriptions, as `webhook/route.ts:1-4` argues), but add a one-line "Premium UI disabled;
these paths are dormant" marker to AGENTS.md so the next reader isn't misled.

### 5.2 Genuinely unused exports
**Severity: low.** Verified by whole-repo grep (each has zero references outside its own
definition):

| Symbol | Location |
| --- | --- |
| `elevationShapePath` | `lib/routeShape.ts:11` (35 LOC of dead SVG path math) |
| `Favorite` | `types/database.ts:147` |
| `RouteCompletion` | `types/database.ts:159` — telling: the central row type of the core table is unused because every query re-declares its shape inline (see 3.6) |
| `RouteReport` | `types/database.ts:123` |
| `RatingReport` | `types/database.ts:135` |

**Fix:** delete `elevationShapePath`; for the four types, either delete them or (better)
start using them at the `.returns<>()` call sites per 3.6 — they are dead *because* of the
duplication finding, so fixing 3.6 revives them.

### 5.3 TODO / FIXME / HACK — exactly one, and it ships to users
**Severity: medium (user-facing / legal), trivially fixable — fixed 2026-09-06**

`lib/constants.ts:38`:
```ts
// TODO: Platzhalter-Domain durch die echte Marketing-Domain ersetzen.
export const LEGAL_URLS = { impressum: "https://xyz.ch/impressum", … }
```
These placeholder URLs are rendered live on `app/anmelden/page.tsx:16,25`,
`components/RegistrierenForm.tsx:56,65` and `app/profil/einstellungen/page.tsx:179,187,195`
— i.e. the Impressum, Datenschutz and AGB links a Swiss user sees at sign-up all point at
`xyz.ch`. One constant to change; flagging it because a single TODO in 21 k LOC is easy to
lose and this one has legal weight.

**Resolved.** The three pages now exist under `/legal/impressum`,
`/legal/datenschutz` and `/legal/agb` in the marketing repo
(`janlampert08-dev/cornice.ch`), and `LEGAL_URLS` is derived from
`NEXT_PUBLIC_LEGAL_BASE_URL`, defaulting to `https://cornice-ch.vercel.app` —
the address the pages actually answer on. One
detail the original finding understated: `xyz.ch` is not merely a dead link but
a domain that belongs to someone else and could serve anything, under a label
that says "Impressum". Still open, and tracked as a launch blocker rather than
here: the operator's identity and address are blank in the published texts, and
**no domain has been registered at all**, so the default deliberately names
the vercel.app address rather than a wished-for one. Defaulting to a domain
nobody owns would be the same defect as `xyz.ch`, only harder to spot.

### 5.4 Unreachable branches
None found. `lib/signature.ts:69-81` `formatSignature` has an exhaustive `switch` over a
5-member union with no `default` — correct (TS exhaustiveness). `lib/moderation.ts:163`
`if (!fahrt) return []` is reachable and documented.

---

## 6. Consistency & conventions

### 6.1 The German/English convention is real, consistent, and undocumented
**Severity: medium (the risk is drift, not the current state)**

The de-facto convention, reverse-engineered from the code:

| Layer | Language | Examples |
| --- | --- | --- |
| DB columns & tables | German `snake_case` | `ist_oeffentlich`, `dauer_sekunden`, `abdeckung_prozent`, `route_completions` |
| Domain field names in TS | German `camelCase` | `istOeffentlich` (17×), `dauerSekunden` (34×), `distanzKm` (31×) |
| Domain function names | German when the concept is German | `freieFahrtTitel`, `computeSignatures` (mixed!) |
| Infrastructure / generic code | English | `throwOnQueryError`, `simplifyTrack`, `haversineKm`, `getClientIp` |
| URL routes (user-facing) | German | `/strecken`, `/fahrten`, `/anmelden`, `/leaderboards` (← English outlier) |
| Component filenames | English, with 7 German exceptions | `NeueStreckeForm`, `NeuesFahrzeugForm`, `AnmeldenForm`, `RegistrierenForm`, `PasswortAendernForm`, `PasswortVergessenForm`, `GefahrenSection` |
| Code comments | German (dominant), English in a few files | `lib/stripeWebhook.ts` and `lib/track.ts` comments are English |
| Migration filenames | German (dominant) | `0044_freie_fahrten.sql`, but `0027_security_performance_hardening.sql`, `0033_route_length_and_upload_mime_hardening.sql` |
| Test descriptions | English (19 files) | German in `lib/lapDetection.test.ts`, `lib/nav.test.ts` |

This is a *coherent* system — German for the product domain, English for infrastructure —
and it is nowhere written down. **AGENTS.md does not mention language at all.** Every AI
agent and new contributor will re-derive it, badly.

**Fix:** add a short "Language" section to AGENTS.md stating the table above. Then fix the
two clear violations that are cheap: unify test descriptions on one language, and note
`/leaderboards` as a deliberate exception (or rename to `/bestenlisten`, which the German
identifiers `bestenlisten` in comments already imply).

### 6.2 A naming/domain mismatch that will confuse future readers
**Severity: low.** Migration `0025_ratings_ohne_sterne.sql` removed star ratings; the
feature is now **comments only** (`lib/actions/ratings.ts:29-36` requires a `kommentar` and
never writes `sterne`). But the table is still `route_ratings`, the action is
`submitRating`, the component is `RatingSection.tsx`, and the report table is
`rating_reports`. The name says "rating", the thing is a comment. Renaming the table is a
migration cost that probably isn't worth paying; **renaming the TS layer is free** and would
stop AGENTS.md ("users … rate routes", see 8.1) and future readers from being misled.

### 6.3 `"use client"` / `"use server"` placement — clean
**Severity: none.** 63 of 71 component files carry `"use client"` on line 1; the 8 that
don't are server components or pure modules. The two apparent violations
(`PremiumCheckoutForm.tsx:7`, `PremiumPurchaseView.tsx:4`) are inside comment blocks (§5.1).
All 12 `lib/actions/*.ts` have `"use server"` on line 1. The two `lib/` files that mention
`"use server"` in prose (`lib/publicTrack.ts:7`, `lib/constants.ts:22`) are *explaining why
they deliberately are not* Server Action modules — `lib/publicTrack.ts:7-10` in particular
("would be an externally callable endpoint") is exactly the right reasoning. This boundary
is handled better than in most Next codebases.

### 6.4 Import ordering — unenforced, hence arbitrary
**Severity: low.** The loose convention is "external/`next` first, then `@/`", but inside
the `@/` block the order is random: `app/feed/page.tsx:3-13` interleaves
`@/components`, `@/lib`, `@/components/ui`, `@/lib/utils`;
`components/RideSummaryForm.tsx:4-10` interleaves `@/lib/actions`, `@/components`,
`@/types`, `@/components/ui`.

**Fix (zero new dependencies — `eslint-plugin-import` is already a transitive dep of
`eslint-config-next`):** add to `eslint.config.mjs`:
```js
rules: { "import/order": ["warn", {
  groups: ["builtin","external","internal","parent","sibling","index","type"],
  pathGroups: [{ pattern: "@/**", group: "internal" }],
  "newlines-between": "always", alphabetize: { order: "asc" },
}]}
```

### 6.5 Data access inside a page component
**Severity: low-medium. `app/profil/page.tsx:87-162`**

This 460-line page issues five raw Supabase queries inline, with inline row types, while
every comparable read path lives in `lib/` (`lib/profile.ts`, `lib/completions.ts`,
`lib/follows.ts`). AGENTS.md's Architecture section says `lib/` is where business logic
lives. This is the only page that breaks the pattern at this scale, and it is also the
source of findings 3.3, 3.6 and 4.1. Extract to `lib/profile.ts` (or a new
`lib/ownProfile.ts`) — that single refactor closes four findings at once.

### 6.6 Inconsistent UUID validation across mutations
**Severity: low.** Six action modules validate ID parameters with `isValidUuid`
(`kudos`, `favorites`, `follows`, `ratings`, `reports` ×3). Six do not
(`completions`, `routes`, `vehicles`, `moderation`, `profile`, `billing`) — so
`deleteCompletion(completionId)`, `toggleCompletionVisibility`, `removeCompletionPhoto`,
`deleteVehicle`, `publishPrivateRoute`, `deleteRouteAsModerator` take an unvalidated string
straight to `.eq("id", …)`. RLS and the `uuid` column type make this safe, so this is a
consistency finding rather than a vulnerability — but "half the actions guard, half don't"
is exactly the state in which someone later assumes the wrong half. Apply it uniformly.

---

## 7. Developer experience & CI

### 7.1 What CI actually runs
`.github/workflows/ci.yml` — on PR to `main` and push to `main`, Node 22, npm cache,
concurrency-cancel, `permissions: contents: read`, placeholder env block with a comment
explaining why each value must be non-empty. Steps: `npm ci` → `npm audit --audit-level=high`
→ `npm run lint` → `npm run test` → `npm run build`.

That is a solid baseline — lint **and** test **and** build all run, which is more than many
repos manage. Supporting config is also good: `CODEOWNERS`, `dependabot.yml` (npm +
github-actions, weekly), a `PULL_REQUEST_TEMPLATE.md` that mirrors AGENTS.md's Definition
of Done verbatim.

### 7.2 CI gaps

| Gap | Severity | Fix |
| --- | --- | --- |
| **No standalone typecheck step.** `next build` type-checks app code, but it is the *last* step, ~2 minutes in, and a type error is reported as a build failure. `tsc --noEmit` takes seconds and covers `**/*.ts` including test files. | Medium | Add `"typecheck": "tsc --noEmit"` to `package.json` scripts and run it **before** lint. Verified: it passes cleanly today. |
| **No migration lint.** `supabase/migrations/README.md` documents that migrations are applied *by hand* and that code/schema drift caused a production incident — yet nothing in CI checks anything about migrations. | High | Two cheap checks: (a) fail on duplicate numeric prefixes (see 7.3); (b) once §2.1 lands, diff generated types against the committed file. |
| **No coverage measurement or threshold.** `@vitest/coverage-v8` is not installed, so nobody can see the 10.4 % number. | Medium | Install it, report coverage in CI, and set a **ratchet** (fail if coverage drops) rather than an absolute bar. |
| **`npm audit --audit-level=high` gates every PR.** A new advisory in any transitive dep turns every unrelated PR red. | Low | Keep it, but move it to a separate non-blocking job or a scheduled workflow so it can't block unrelated work. |
| **No `.nvmrc` / `engines`.** CI pins Node 22, AGENTS.md says ">= 20.9", nothing pins local dev. | Low | Add `.nvmrc` with `22` and `"engines": {"node": ">=20.9"}`. |
| **No CI on the migrations or the `.agents/` docs.** | Low | n/a |

### 7.3 Duplicate migration numbers — and the repo's own rule already forbids it
**Severity: medium**

Four duplicated numeric prefixes:

```
0034_profiles_column_grant_hardening.sql   0034_public_fahrten_foto.sql        (both 2026-09-01)
0041_rating_cooldown_covers_edits.sql      0041_route_proposal_cooldown.sql    (documented legacy)
0053_gefolgt_von_feature.sql               0053_kudos_gesehen.sql              (2026-09-03)
0054_leaderboard_user_totals.sql           0054_sichtbarkeit_standardmaessig_aktiv.sql (2026-09-04)
```

`supabase/migrations/README.md` acknowledges only the `0041` pair and then states:
*"Neue Dateien bekommen eine eindeutige, fortlaufende Nummer."* That README was last
changed on **2026-09-03**; the `0053` pair is from 2026-09-03 and the `0054` pair from
2026-09-04. **The rule was violated twice on and after the day it was written.** With
lexical ordering, `0053_gefolgt_von_feature.sql` sorts before `0053_kudos_gesehen.sql`
purely by filename — apply order is not deterministic from the number alone.

**Fix:** a 5-line CI step:
```bash
# The four pairs below are already applied and must not be renamed (rule 9).
known="0034 0041 0053 0054"
dupes=$(ls supabase/migrations/*.sql | xargs -n1 basename | cut -c1-4 | sort | uniq -d)
for d in $dupes; do
  case " $known " in
    *" $d "*) ;;
    *) echo "New duplicate migration prefix: $d"; exit 1 ;;
  esac
done
```
Note the shape: an earlier draft of this snippet ended in `|| true`, which swallows the
`exit 1` and makes the step pass on exactly the failure it exists to catch. The loop above
fails on anything outside the allowlist and says nothing when the set is clean.

### 7.4 `scripts/` — undocumented and unreferenced
**Severity: low.** Seven `.mjs` data-pipeline scripts (Overpass/OSM fetch, swisstopo
elevation enrichment, Kanton-Zürich speed-limit WFS matching, seed-SQL generation) plus 16
committed JSON/GeoJSON outputs in `scripts/output/`. Each script has an excellent header
comment with a usage line and, in `enrich-routes.mjs:5-12`, a genuine calibration write-up
(validated against Julierpass 26/26 hairpins). But:

- **Neither `README.md` nor `AGENTS.md` mentions `scripts/` at all.** AGENTS.md's
  Architecture section lists `app/`, `components/`, `lib/`, `lib/actions/`,
  `lib/supabase/`, `types/`, `supabase/migrations/` — and stops.
- They are plain `.mjs`, so `tsc` and `vitest` never see them, and `eslint.config.mjs` does
  not ignore them either (they pass, but by luck).
- No npm script wraps them; the invocation is only in a comment.

**Fix:** one paragraph in README.md and a line in AGENTS.md's Architecture list. Optionally
`"seed:routes": "node scripts/fetch-routes.mjs"` etc. in `package.json`.

### 7.5 `.agents/` — five role docs that nothing loads
**Severity: low.** `.agents/{backend,database,frontend,payments,security}.md` (228 lines
total) are well-written role checklists. Each opens with *"Not auto-loaded by any tooling"*.
**AGENTS.md never mentions the directory**, so an agent reading only `CLAUDE.md` →
`AGENTS.md` will never discover them. Fix: one line in AGENTS.md pointing at `.agents/`
and saying when to load each.

### 7.6 `.claude/` — a genuine strength
`.claude/settings.json` puts every SQL-executing MCP tool and CLI behind `permissions.ask`,
and `.claude/hooks/sql-guard.sh` is a carefully written `PreToolUse` hook that catches SQL
smuggled through pipes (`echo "DROP TABLE …" | psql`) which the prefix-matching permission
rules would miss. The regex deliberately matches only command position so the word "psql"
in a commit message doesn't trigger it. This is the best-engineered piece of tooling config
in the repo. `.claude/launch.json` provides a working dev-server config.

### 7.7 Local setup vs `.env.local.example`
**Severity: medium (README is stale)**

`README.md` step 3 says: *"Schema anlegen: Inhalt von `supabase/migrations/0001_init.sql`
im Supabase SQL Editor ausführen"*. There are **57 migration files**. Following the README
literally produces a database missing everything from `0002` onward — free rides, kudos,
follows, reports, Stripe, the leaderboard views. A new contributor cannot get a working
local environment from the README.

Also missing from README: `npm run test`, `npm run lint`, any mention of `scripts/`, any
mention of `supabase/migrations/README.md` (which contains the actually-correct apply
procedure).

Also: `README.md`'s final section is **truncated mid-sentence**:
```
## Bewusste Einschränkungen

 siehe
`route_completions` in `supabase/migrations/0001_init.sql`.
```
The heading has no content — the sentence begins with a stray space and " siehe".

**Fix:** replace step 3 with a pointer to `supabase/migrations/README.md` as the single
source of truth for applying the schema, add a "Befehle" section listing dev/build/lint/test,
and either restore or delete the truncated section.

Deliberately *not* `npx supabase db push` on its own: §7.3 above and
[`database.md`](./database.md) both show that the four duplicate prefixes make
`schema_migrations.version` — a primary key — unable to record both halves of a pair, so the
push is not reliably repeatable and a fresh schema can end up differing from production. The
README already documents hand-applying the 0041 pair as one entry. Recommending the command
before those prefixes are reconciled would contradict this report's own findings; the
ordered/manual procedure in the migrations README is the honest instruction until then. The env-var list in the README matches
`.env.local.example` correctly — that part is fine.

---

## 8. Documentation drift (AGENTS.md explicitly asks for this)

### 8.1 Product section — two claims no longer true
**Severity: medium. `AGENTS.md` "Product"**

> "Users discover and propose scenic driving/riding routes, track completions ('Fahrten'),
> **rate routes**, compete on leaderboards, and **can subscribe to a Premium tier (Stripe)**
> for additional features."

- **"rate routes"** — star ratings were removed in `0025_ratings_ohne_sterne.sql`.
  `lib/actions/ratings.ts:29-36` requires a comment and never writes `sterne`. The feature
  is comments, not ratings.
- **"can subscribe to a Premium tier"** — no user can. The entire purchase UI is commented
  out (§5.1) and `app/profil/premium/page.tsx` redirects to `/profil`.
  `lib/actions/billing.ts:3-5` states plainly: *"diese Actions sind dadurch von keiner Seite
  mehr aus erreichbar"*.

An agent reading AGENTS.md will build against a product that doesn't exist. Fix both
sentences and add "(currently disabled — see `components/PremiumCard.tsx`)" to the Premium
clause.

### 8.2 Stack section — accurate, with two omissions
**Severity: low.** I verified every version against `package.json`:

| AGENTS.md claim | package.json | ✓ |
| --- | --- | --- |
| Next.js 16.3.3 | `"next": "16.3.3"` | ✓ |
| React 19.2.8 / react-dom 19.2.8 | ✓ | ✓ |
| TypeScript ^5 | ✓ | ✓ |
| Tailwind ^4 via `@tailwindcss/postcss` | ✓ | ✓ |
| `@supabase/supabase-js` ^2.112.4, `@supabase/ssr` ^0.12.5 | ✓ | ✓ |
| `stripe` ^22.6.0, `@stripe/stripe-js` ^9.14.0, `@stripe/react-stripe-js` ^6.8.2 | ✓ | ✓ |
| `mapbox-gl` ^3.29.0 + `@types/mapbox-gl` | ✓ | ✓ |
| Vitest ^4.1.11 | ✓ | ✓ |
| ESLint ^9 with `eslint-config-next` | ✓ (`eslint-config-next` pinned `16.3.3`, not `^9`) | ~ |

**Missing from the list:** `lucide-react` ^1.38.0 (the icon system, used in ~30 components)
and `@vercel/analytics` ^2.0.1 (loaded in `app/layout.tsx`). Both are direct runtime
dependencies. Add them.

### 8.3 Core User Loop paths — all 8 steps verified correct
**Severity: none — this is a strength.** I checked every path named in AGENTS.md steps 1–8
against the filesystem. **All 24 exist and all do what the document says.** For a document
listing that many concrete paths across a 21 k-LOC codebase, that is unusual and worth
saying.

The only additions worth making: step 4 doesn't mention `components/useLiveLapHint.ts`
(112 LOC, part of live tracking), and step 5 doesn't mention `lib/track.ts` (238 LOC —
`simplifyTrack`, `movingSeconds`, `cropTrackEnds`, `publicationBlockReason`), which is
arguably the most important module in the whole stat-derivation path and is the second-best
tested file in the repo.

### 8.4 Architecture section — three omissions
**Severity: low.** The list omits `scripts/` (7 pipeline scripts + 16 committed data files),
`lib/utils/` (`cn.ts`, `url.ts` — a subdirectory with a different convention from the flat
`lib/`), and `public/sw.js` + `lib/offlineRoutes.ts` + `components/Offline*.tsx` (a whole
offline/PWA feature that AGENTS.md never mentions, including `app/offline/page.tsx` and
`app/manifest.ts`).

### 8.5 Protected Areas vs CODEOWNERS — enforcement gap
**Severity: medium**

AGENTS.md lists 12 Protected Areas. `.github/CODEOWNERS` covers 9. **Missing from
CODEOWNERS:**

| Protected Area (AGENTS.md) | In CODEOWNERS? |
| --- | --- |
| `/lib/actions/auth.ts` | ❌ |
| `/lib/actions/moderation.ts` | ❌ |
| `/lib/moderation.ts` | ❌ |
| `/lib/rateLimit.ts` | ❌ |

So sign-in/sign-up, all moderator mutations, the moderator-check helper, and the abuse
cooldown can all be merged without the review AGENTS.md declares mandatory. Note the
overlap with 1.3 rank 3: `lib/actions/moderation.ts` is simultaneously the least
error-handled, least tested, and least review-gated Protected Area in the repo.

**Fix:** add the four paths to `.github/CODEOWNERS`. Two-minute change.

### 8.6 AGENTS.md rule 14 vs reality
The rule ("Prefer existing utilities/actions/components … Check `lib/`, `lib/actions/`, and
`components/` before adding duplicate logic") is violated in the five places catalogued in
§3 — and in every case the *existing* utility was already there and already tested
(`isValidUuid`, `formatKm`/`formatDuration`, `getUserAchievementStats`, `getOrigin`,
`components/ui/`). This is the most-violated rule in the constitution, which suggests it
needs a mechanical assist (the `import/order` + `noUnusedLocals` + coverage-ratchet changes
in §7) rather than more prose.

### 8.7 The self-referential block at the top of AGENTS.md
`AGENTS.md:1-9` ("This is NOT the Next.js you know … re-added by `next dev`") is machine-
generated boilerplate that instructs readers to consult
`node_modules/next/dist/docs/`. In this checkout `node_modules` is a partial install, so
that path is not reliably present. Not a defect, but worth knowing that the instruction is
unfollowable in CI and in fresh clones before `npm ci`.

---

## Prioritised fix list

**Do first (high value, low cost, no behaviour change):**
1. `lib/routes.ts:5` → import `isValidUuid` from `lib/validation` (§3.1) — 1 line.
2. Add the four missing Protected Areas to `.github/CODEOWNERS` (§8.5) — 4 lines.
3. Add `"typecheck": "tsc --noEmit"` and run it in CI before lint (§7.2) — verified passing.
4. Add the duplicate-migration-prefix check to CI (§7.3) — 5 lines.
5. Fix the two false claims in AGENTS.md's Product paragraph and add a Language section (§8.1, §6.1).
6. Replace the placeholder legal URLs in `lib/constants.ts:38` (§5.3).
7. Add `describe("computeTrailStats")` to `lib/geo.test.ts` and create `lib/utils/url.test.ts` (§1.3 ranks 4–5).

**Do next (real defects):**
8. `app/api/stripe/webhook/route.ts` — propagate `setPremium` failure and don't let the
   idempotency row swallow the retry (§1.3 rank 2).
9. `lib/actions/moderation.ts` — return `{error}` from all 8 actions; surface it in the two
   components (§1.3 rank 3, §4.1).
10. Apply `throwOnQueryError` to `lib/feed.ts`, `lib/moderation.ts`, `lib/ratings.ts`,
    `lib/follows.ts`, `lib/photos.ts`, `lib/favorites.ts`, `app/profil/page.tsx` (§4.1);
    make `lib/rateLimit.ts:18` fail closed.
11. Extract `averageKmh` into `lib/format.ts` and unify the six call sites — this is a
    business-rule decision (moving vs elapsed time), call it out per rule 16 (§3.2).

**Then (structural):**
12. Generate `types/database.ts` from the live schema and add a drift check (§2.1) — this
    is the root cause of §3.6 and §5.2.
13. Install `jsdom` + `@testing-library/react` + `@vitest/coverage-v8`; set a coverage
    ratchet (§1.2, §7.2).
14. Extract the pure helpers out of `lib/actions/completions.ts` into a testable module and
    test them (§1.3 rank 1).
15. Move `app/profil/page.tsx`'s five inline queries into `lib/` (§6.5) — closes §3.3, §3.6
    and part of §4.1 at the same time.
16. Delete the 215 lines of commented-out Premium UI (§5.1) and the dead exports (§5.2).
17. Fix `README.md`'s setup step 3 and its truncated final section (§7.7).
