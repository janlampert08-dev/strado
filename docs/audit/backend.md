# Cornice — Backend / Server-Logic Audit

Read-only audit of server-side correctness and robustness. Security is covered by a separate
agent; findings here are flagged only where they change *what the system computes or stores*.

Baseline: `npx vitest run` → **186 tests / 21 files, all passing** (Next.js 16.3.3, verified in
`node_modules/next/package.json`). No files were modified; three temporary vitest files used to
verify findings were deleted, and `git status` is clean.

Scenarios marked **verified** were reproduced by executing the project's own functions.

---

## Summary

| # | Severity | Finding | Where |
|---|---|---|---|
| H1 | High | Route leaderboard ranks a purely client-supplied clock | `lib/geo.ts:87`, `lib/leaderboard.ts:164` |
| H2 | High | Out-and-back routes: driving half the route scores 100% coverage | `lib/routeCoverage.ts:21` |
| H3 | High | `proposeRoute` sets `ist_privat` in a second, unchecked write | `lib/actions/routes.ts:222` |
| H4 | High | Stripe webhook marks events processed before the side effect, then swallows its failure | `app/api/stripe/webhook/route.ts:51` |
| M1 | Medium | `movingSeconds` has no jitter deadband (`computeTrailStats` does) | `lib/track.ts:138` |
| M2 | Medium | Ascent under-reports long rides (fixed `nb_points=300`) | `lib/elevation.ts:42` |
| M3 | Medium | Three mutually inconsistent definitions of "Höhenmeter" | `lib/profile.ts:88` et al. |
| M4 | Medium | Zero-row updates reported as success (all of `moderation.ts`) | `lib/actions/moderation.ts` |
| M5 | Medium | Unbounded per-user queries feeding JS aggregation | `lib/profile.ts:60`, `lib/achievements.ts:26` |
| M6 | Medium | Feed ordered by a DATE column only — nondeterministic | `lib/feed.ts:28` |
| M7 | Medium | Query errors rendered as facts (empty feed / 0 kudos / empty mod queue) | `lib/feed.ts:38`, `lib/moderation.ts` |
| M8 | Medium | No deterministic tie-break on any leaderboard | `lib/leaderboard.ts:62` |
| M9 | Medium | Coverage/lap detection is O(samples × trail) inside a Server Action | `lib/routeCoverage.ts:30` |
| M10 | Medium | `buildHoehenprofil` throws on an empty profile; `proposeRoute` unguarded | `lib/elevation.ts:156` |
| L1–L13 | Low | See below | |

---

## High

### H1 — The route leaderboard ranks a number the client fully controls

`lib/geo.ts:87`
```ts
const durationSeconds = Math.round((trail[trail.length - 1].t - trail[0].t) / 1000);
```

`t` is the browser's `Date.now()` at each GPS fix (`lib/geo.ts:54-59`). The only defence is the
average-speed ceiling in `implausibilityReason` (`lib/actions/completions.ts:97`,
`MAX_PLAUSIBLE_KMH = 200`). `getRouteLeaderboard` then ranks `dauer_sekunden` ascending
(`lib/leaderboard.ts:164`), and the `route_leaderboard` view (migration `0028`) applies no further
filter beyond `ist_oeffentlich = true and dauer_sekunden is not null`.

**Verified scenario.** Take a genuine 10 km trail driven at 60 km/h (600 s). Multiply every
timestamp delta by 0.4 and resubmit — geometry untouched, so coverage stays 100%:

```
real: { distanceKm: 10.008, durationSeconds: 600 }  ->  60.0 km/h
fake: { distanceKm: 10.008, durationSeconds: 240 }  -> 150.1 km/h   (< 200, accepted)
```

The result is stored, is public-eligible (coverage 100 ≥ 75), and takes first place. Nothing else
in the pipeline looks at the clock. The same trail can also simply be replayed repeatedly — there
is no duplicate-track detection, only the 5 s cooldown.

Note the doc/code discrepancy this exposes: `lib/leaderboard.ts:73-79` states the lists
"belohnen Distanz/Höhenmeter/Anzahl aufgezeichneter Fahrten … **nie Geschwindigkeit**", but
`getRouteLeaderboard` in the same file is a fastest-time board.

**Fix.** Layered, cheapest first:
1. Reject non-monotonic timestamps in `parseTrail` (see L9) — closes the naive rewrite.
2. Validate the *distribution* rather than the average: compute per-segment speeds and reject if,
   say, the 95th percentile exceeds a ceiling. A uniformly compressed trail fails this immediately,
   whereas a real trail with one bad fix does not.
3. Anchor the clock server-side: write a "ride started" row when tracking begins and clamp
   `dauer_sekunden` to `now() - server_start`. This is the only defence that actually holds, and it
   fits the existing design principle stated at `lib/actions/completions.ts:52-54`.

---

### H2 — An out-and-back route is 100% "covered" by driving one direction

`lib/routeCoverage.ts:21-35`
```ts
const covered = samples.filter((sample) =>
  trail.some((point) => haversineKm(sample, point) <= CORRIDOR_KM),
).length;
```

Coverage asks *"is any recorded point near this sample?"*, with no notion of order, direction, or
one-sample-one-point. For an out-and-back route whose geometry is A→B→A along the same road, the
outbound samples and the return samples occupy the same physical positions, so a trail covering
only A→B satisfies both halves.

**Verified scenario.** 20.02 km route (10 km out, 10 km back, same road), driver records only the
outbound leg and stops at B:

```
route length km: 20.02   coverage one-way: 100   coverage full: 100
```

Consequences, all in the wrong direction:
- The ride is marked complete and passes the `COVERAGE_THRESHOLD_PERCENT = 75` publication gate
  (`lib/actions/completions.ts:259`).
- `distanz_km` and `dauer_sekunden` are roughly half of a real completion — so on the route
  leaderboard the person who turned around at B beats everyone who drove the whole thing.
- The same hole applies to any route that doubles back on itself, and to figure-eights.

Related but smaller: `evaluateProximity` auto-stops as soon as the driver comes within 150 m of the
end point after leaving the start (`lib/tracking.ts:56-61`). On a route that passes near its own
endpoint mid-way, recording stops early — the coverage check then catches it, but the user loses
the ride.

**Fix.** Coverage needs to be ordinal. The machinery already exists in `lib/lapDetection.ts`
(`buildArcTable`, `arcDelta`, the direction lock) — for a route-started ride, run the same
arc-length progress check and require monotonic progress ≥ threshold. A cheaper stopgap: match
samples to trail points greedily *in order*, so each trail point can satisfy at most one sample and
samples must be satisfied in sequence.

---

### H3 — `proposeRoute` publishes a route the user asked to keep private if a second write fails

`lib/actions/routes.ts:193-226`
```ts
const { data, error } = await supabase.rpc("propose_route_full", { ... });
if (error || !data) { ...return error... }

if (requestedPrivat) {
  await supabase.from("routes").update({ ist_privat: true }).eq("id", data);   // error discarded
}

redirect(`/strecken/${data}`);
```

`propose_route_full` creates the row with `ist_privat` at its default (false) and `status_ok = false`.
Privacy is applied afterwards, in a separate statement whose result is never inspected.

**Failure scenario.** The update errors (transient connection loss, RLS change, statement timeout).
The action still redirects, showing no error. The route now sits at
`status_ok = false, ist_privat = false` — which is *exactly* the predicate `getPendingRoutes`
selects on (`lib/moderation.ts:15-25`):

```sql
.eq("status_ok", false).eq("ist_privat", false).is("abgelehnt_am", null)
```

So the route the user asked to keep private appears in the public moderation queue and can be
approved and published. There is also an unconditional window between the two statements in which
the same is true, even on the happy path.

**Fix.** Add a `p_ist_privat` parameter to `propose_route_full` so creation and privacy are one
transaction (that RPC is already the authoritative writer — it recomputes `laenge_km` itself, per
the comment at line 189-192). Failing that, check the error and tell the user.

---

### H4 — Stripe: the idempotency record is written before the side effect, and the side effect can fail silently

`app/api/stripe/webhook/route.ts:51`
```ts
if (await wasAlreadyProcessed(supabase, event.id, event.type)) {
  return NextResponse.json({ received: true, duplicate: true });
}
```

`wasAlreadyProcessed` (`lib/stripeWebhook.ts:17`) *inserts* the event id and returns `false` on
success — so the event is recorded as handled **before** the switch runs. `setPremium` then only
logs on failure (line 23-28) and the handler unconditionally returns 200.

**Failure scenario.** `checkout.session.completed` arrives. The `profiles` update fails — a
transient DB error, or the customer id has not yet been written by `getOrCreateStripeCustomerId`
(`lib/actions/billing.ts:41`), which is itself an unchecked write. Stripe sees 200 and never
retries. The event id is already in `stripe_webhook_events`, so replaying it from the Stripe
dashboard is deduped away. The customer paid and is not premium, and the only trace is a
`console.error`.

Secondary: `setPremium` matches on `stripe_customer_id` and never verifies a row was affected —
PostgREST treats zero matching rows as success, so a mismatched customer id is indistinguishable
from a successful grant. And because dedup is keyed purely on event id, out-of-order delivery is
unhandled: a delayed `customer.subscription.updated` (active) landing after
`customer.subscription.deleted` re-grants premium.

**Fix.** Return a boolean from `setPremium`, respond 500 when it fails so Stripe retries, and only
mark the event processed once the side effect succeeded — or keep the pre-insert (it is the right
primitive for concurrency) but add a `processed_at` column, treat a row with a null `processed_at`
older than a few minutes as retryable, and check `count` on the update. For ordering, compare
`event.created` against a stored last-applied timestamp per customer.

---

## Medium

### M1 — `movingSeconds` counts stationary GPS jitter as movement

`lib/geo.ts:64,81` deliberately deadbands distance (`MIN_SEGMENT_KM = 0.005`) so that jitter at a
standstill is not counted. `lib/track.ts:138-149` does the same job for *time* with no deadband at
all — it only checks that the segment's implied speed exceeds `MOVING_MIN_KMH = 2`:

```ts
const km = haversineKm(...);
if (km / (deltaSeconds / 3600) >= minKmh) seconds += deltaSeconds;
```

At 1 Hz, 2 km/h is 0.55 m per fix. Ordinary urban GPS wander is several times that.

**Verified scenario.** A parked vehicle, 600 s of 1 Hz fixes with ±2 m of wander:

```
parked 600 s -> distance 0 m (deadbanded), movingSeconds 557 s of 600 s
```

Consequences:
- `bewegte_zeit_sekunden` ≈ `dauer_sekunden`, so the column carries no information.
- `app/fahrten/[id]/page.tsx:124-127` only renders "… in Bewegung" when
  `dauerSekunden - bewegteZeitSekunden > 60` — a feature that therefore almost never appears.
- Free-ride Ø-Tempo is computed from the inflated moving time
  (`app/fahrten/[id]/page.tsx:115`), so it reads low.
- The `MIN_PUBLIC_MOVING_SECONDS = 180` publication gate (`lib/track.ts:40`) is really
  "3 minutes of recording", not "3 minutes of movement".

**Fix.** Apply the same 5 m deadband in `movingSeconds` (skip segments shorter than
`MIN_SEGMENT_KM`, anchoring to the last accepted point exactly as `computeTrailStats` does). Raising
`MOVING_MIN_KMH` alone would also penalise genuine crawling in traffic, which the comment at
`lib/track.ts:42-45` explicitly wants to keep.

---

### M2 — Cumulative ascent under-reports long rides, and the leaderboard sums it

`lib/elevation.ts:42` requests a fixed budget of points regardless of geometry length:

```ts
const body = new URLSearchParams({ geom, sr: "2056", nb_points: "300" });
```

`computeAscentM` (line 127) then accumulates on that profile with `MIN_ASCENT_STEP_M = 3`. Sample
spacing is therefore `length / 300` — 33 m for a 10 km ride, 400 m for a 120 km ride — and any
undulation shorter than the spacing is aliased away entirely.

**Verified scenario.** Synthetic Swiss profile: one 900 m pass climb plus ±8 m rolling terrain
(hedges, dips, village humps) every ~600 m. Ground truth sampled at 20 m vs. what `nb_points=300`
actually delivers:

```
 10 km: spacing  33 m | truth  914 m | recorded  914 m
 40 km: spacing 133 m | truth 1188 m | recorded  971 m
120 km: spacing 400 m | truth 3008 m | recorded  900 m   (-70%)
```

`leaderboard_user_totals.hoehenmeter` sums `hoehenmeter_aufstieg` across rides (migration `0056`),
so the "Meiste Höhenmeter" board systematically rewards splitting the same terrain into several
short recordings over posting one long ride. The same fixed budget also degrades
`computeHoeheUndSteigung`'s 150 m gradient window (line 101-110): once spacing exceeds 150 m the
window collapses to a single segment and `max_steigung_prozent` is measured over 400 m instead.

**Fix.** Scale `nb_points` with geometry length (target ~50 m spacing, chunking the request if
swisstopo caps it), or resample the returned profile to fixed spacing before accumulating. Note the
existing calibration comment at line 86-91 was done against pass roads of moderate length, where
the bug does not show.

---

### M3 — Three mutually inconsistent definitions of "Höhenmeter" for the same user

| Surface | Computation | File |
|---|---|---|
| Own profile | `routes.hoehe_m`, **deduplicated per route**, all own rides | `app/profil/page.tsx:167-171` |
| Public profile | `routes.hoehe_m`, **per ride, not deduplicated**, public rides only | `lib/profile.ts:79-89` |
| Share-image badge | `routes.hoehe_m`, deduplicated per route, all own rides | `lib/achievements.ts:38-45` |
| Leaderboard | `sum(hoehenmeter_aufstieg)` — cumulative ascent, a different quantity | migration `0056` |

**Failure scenario.** A user drives the same 2 000 m pass ten times and shares every ride. Their own
profile shows **2 000 m**. Their public profile — the one other people see — shows **20 000 m**.
The badge on their share image is computed from the 2 000 m figure. All three are labelled
"Höhenmeter".

This is a documented-intent mismatch, not just drift. `app/profil/page.tsx:164-166` says:

> Pro Strecke nur einmal zählen … entspricht der Dedup-Logik in lib/profile.ts (öffentliches Profil).

`lib/profile.ts` does not dedupe. And it is internally inconsistent in exactly the way that comment
warns against — `passCount` at line 76 is `new Set(...).size` (deduped) while `hoehenmeter` at
line 88 reduces over every ride:

```ts
hoehenmeter = streckenFahrten.reduce((sum, f) => sum + (hoeheById.get(f.route_id!) ?? 0), 0);
```

`lib/elevation.ts:116-119` is right that peak altitude and cumulative ascent are deliberately
different quantities — the problem is that both are surfaced to users under one word.

**Fix.** One shared helper for the peak-altitude figure (deduped), and distinct labels for the
ascent figure. `lib/profile.ts:88` is the outright bug.

---

### M4 — Zero-row updates are reported as success; every moderation action discards its error

PostgREST returns no error when an `UPDATE`/`DELETE` matches zero rows. The codebase knows this and
guards for it in three places — `deleteVehicle` (`lib/actions/vehicles.ts:125-138`),
`deleteOwnRejectedRoute` (`lib/actions/routes.ts:258-281`) and `removeCompletionPhoto`, each with a
comment explaining why. The guard is missing everywhere else:

- `lib/actions/routes.ts:326-345` `updateRoute` filters `.eq("status_ok", false)`. If a moderator
  approved the route between page load and submit, zero rows update, `error` is null, and the action
  redirects to the route page as if the edit saved. The user's changes are silently gone.
- `lib/actions/routes.ts:234-252` `publishPrivateRoute` — no error check at all, returns `void`.
- `lib/actions/routes.ts:378-395` `updateRouteAsModerator`, `:402-413` `deleteRouteAsModerator`.
- **All of `lib/actions/moderation.ts`** — `approveRoute`, `rejectRoute`, `dismissRouteReport`,
  `dismissRatingReport`, `deleteReportedRoute`, `deleteReportedRating`,
  `dismissCompletionReport`, `unpublishReportedCompletion`. Every one is
  `await supabase.from(...).update(...)` with the result thrown away and a `void` return, so the UI
  cannot distinguish "moderated" from "nothing happened".

This is protected-area code where a silent no-op is worst: a moderator believes a reported ride was
unpublished when it is still public.

**Fix.** `.select("id")` on the update and assert a row came back (or `count: "exact"`), and change
the moderation actions to return a state object the UI can react to.

---

### M5 — Unbounded per-user queries feeding client-side aggregation

- `lib/profile.ts:60` — `public_fahrten` for a user with no `.limit()`, then reduced in JS for
  `passCount`/`distanzKm`/`hoehenmeter`, and the full array is handed to the page.
- `lib/achievements.ts:26-30` — every `art='strecke'` completion of a user, loaded **on every ride
  detail page view** (`app/fahrten/[id]/page.tsx:100`) purely to pick one badge string.
- `app/profil/page.tsx:104-162` — three unbounded queries (`completions`, `trackedRides`,
  `favorites`).
- `lib/moderation.ts` — all four queue queries unbounded.
- `lib/routes.ts:7-21` — `getRoutes()` is `select("*")` on `routes_geojson`, i.e. full geometry,
  `hoehenprofil` and `tempolimits` for every route, on every explore page load *and* every
  `/api/strecken` request.

Today these are payload and CPU problems. They become correctness problems the moment PostgREST's
`db-max-rows` is configured (there is no `supabase/config.toml` in the repo, so this depends on
hosted project settings): the aggregations would then silently reduce a truncated set and report
wrong lifetime totals as fact.

**Fix.** Aggregate in SQL. The pattern already exists and is well-argued —
`leaderboard_user_totals` (migration `0054`) was introduced for precisely this reason, and its
header comment makes the case better than I can. Apply the same treatment to profile totals and
achievements, and paginate the lists.

---

### M6 — The feed is ordered by a DATE column with no tiebreaker

`lib/feed.ts:25-29`
```ts
.order("datum", { ascending: false })
.limit(FEED_LIMIT)   // 30
```

`datum` is a Postgres `date` (day granularity, set from `todayInZurich()`), so every ride posted
today ties. Postgres gives no ordering guarantee among tied rows, and the chosen plan can vary — so
a freshly posted ride may not appear at the top, and on a busy day rides can shuffle in and out of
the 30-row window between reloads.

`app/profil/page.tsx:126-129` gets this exactly right and documents why:

> Neueste zuerst — created_at als Tiebreaker, da datum nur ein Datum (kein Zeitstempel) ist und
> mehrere Fahrten am selben Tag sonst in unbestimmter Reihenfolge stünden.

The feed simply wasn't brought in line.

**Fix.** Expose `created_at` on `public_fahrten` and add `.order("created_at", {ascending:false})`.
This is also the prerequisite for stable keyset pagination, which the `FEED_LIMIT` comment
anticipates.

---

### M7 — Query errors rendered as facts

`lib/queryError.ts` exists precisely for this and its comment names the exact symptoms
("0 km gefahren", "keine Fotos"). It is applied in `lib/profile.ts` and `lib/completions.ts` — and
not in:

- `lib/feed.ts:38` `const { data } = await query` → a failed query renders
  "Noch keine geteilten Fahrten."
- `lib/kudos.ts:22-27` → a failed summary renders 0 kudos on every card.
- `lib/achievements.ts:24` → a failed query renders 0 passes / 0 Höhenmeter, and
  `featuredMilestone` returns null so the badge disappears.
- **`lib/moderation.ts` — all four functions.** A failed query renders an empty moderation queue:
  the moderator is told there is nothing to review.
- `lib/photos.ts:10`, `lib/ratings.ts:11`, `lib/favorites.ts:5`, `lib/follows.ts:18,41`.

**Fix.** `throwOnQueryError` at each of these sites; the `app/error.tsx` boundary already exists.
The moderation queue is the one to do first.

---

### M8 — No deterministic tie-break on any leaderboard, and the route board can collapse to one user

`lib/leaderboard.ts:62-66`
```ts
.order(metric, { ascending: false, nullsFirst: false })
.limit(TOP_N)   // 3
```

No secondary sort key. Users tied on `fahrten_count` (very common at low counts) reorder arbitrarily
between requests, and *which* of the tied users makes the top 3 is nondeterministic. Same at
`:164` for `dauer_sekunden`.

Separately, `getRouteLeaderboard` fetches the 200 fastest **rides** and dedupes to 10 **users**
(`:133`, `:169`). One prolific user with 200 fast times on a route reduces the visible board to a
single entry — the "fetch more and dedupe in JS" comment at line 129-133 assumes times are spread
across users.

**Fix.** Add `user_id` (or `completion_id`) as a stable secondary sort. For the route board, do the
per-user minimum in SQL — a `distinct on (route_id, user_id) … order by dauer_sekunden` view — so
the app can `limit(10)` directly and the dedupe/fetch-limit interaction disappears.

---

### M9 — Coverage and lap detection are quadratic and run several times per submission

`lib/routeCoverage.ts:30-32` is `samples.filter(s => trail.some(...))`: for a 50 km route
(~500 samples at `SAMPLE_INTERVAL_KM = 0.1`) against a raw trail near `MAX_TRAIL_POINTS = 20 000`,
that is 10 M haversine evaluations — synchronous, on the request thread, inside a Server Action.
`buildDetectedSegments` (`lib/actions/completions.ts:437`) runs it again per detected lap.

`detectLaps` adds its own: `findBestProjection` (`lib/lapDetection.ts:204-219`) iterates **all**
arc samples for every trail point even when the continuity window rejects them — the window is a
`continue` inside the loop, not a bound on it. At `SAMPLE_INTERVAL_KM = 0.025` a 20 km route has
800 samples; with a 1 000-point simplified trail and 100 nearby candidate routes that is 80 M
segment projections.

The bbox prefilter (`:457`) is what keeps this survivable today, and it is a good call — but the
cost scales with the route catalogue, which is the thing the product is trying to grow.

**Fix.** Hash the trail into a grid keyed on ~`CORRIDOR_KM` cells so each coverage sample is an
O(1) neighbour lookup instead of a full scan. In `findBestProjection`, binary-search the window
bounds (`samples` is sorted by `s`) rather than scanning past them.

---

### M10 — `buildHoehenprofil` throws on an empty profile, and `proposeRoute` does not guard it

`lib/elevation.ts:156-159`
```ts
const last = profile.length - 1;
if (points[points.length - 1]?.km !== Number((profile[last].dist / 1000).toFixed(2))) {
```

With `profile = []`, `last` is `-1` and `profile[-1].dist` throws a `TypeError`.
`fetchElevationProfile` returns `json.map(...)` for *any* array (line 60-62), including `[]`.

`lib/actions/completions.ts:361` guards this correctly (`if (!profile || profile.length < 2)`).
`lib/actions/routes.ts:181-187` does not — it only checks `if (profile)`:

```ts
const profile = await fetchElevationProfile(geometry.coordinates);
if (profile) {
  const stats = computeHoeheUndSteigung(profile);   // Math.max(...[]) === -Infinity
  hoehenprofil = buildHoehenprofil(profile);        // throws on []
}
```

**Failure scenario.** A user draws a route that crosses the Swiss border and swisstopo answers 200
with an empty array. `proposeRoute` throws an unhandled `TypeError` → 500, and the user's drawn
route is lost. (`computeHoeheUndSteigung([])` would also yield `hoeheM: -Infinity`.) The asymmetry
between the two call sites is the tell that this was fixed once, in one place.

**Fix.** Move the guard into `fetchElevationProfile` — return `null` when the parsed array has
fewer than two points — so both callers inherit it and neither can regress.

---

## Low

**L1 — `removeCompletionPhoto` deletes the storage object before the row.**
`lib/actions/completions.ts:877-890`. If the row delete then fails, a `completion_photos` row
survives pointing at a deleted object and the gallery shows a broken image. `deleteCompletion`
(`:689-700`) does it the other way and documents exactly why ("schlägt das Entfernen der Dateien
fehl, bleiben sie zwar verwaist zurück, aber es steht keine Fahrt mehr da, deren Fotos plötzlich
fehlen"). Mirror that order.

**L2 — Read-then-write toggles are racy.** `toggleKudos` (`lib/actions/kudos.ts:32-41`),
`toggleFavorite` (`favorites.ts:24-33`), `toggleFollow` (`follows.ts:28-37`),
`toggleCompletionVisibility` (`completions.ts:727-789`) all SELECT then INSERT/DELETE/UPDATE. Two
concurrent requests both see "absent"; the second insert fails with 23505 and returns `ok:false`,
so the UI reverts an optimistic update that in fact succeeded. Use
`upsert(..., {ignoreDuplicates:true})`, or for visibility a single
`update ... set ist_oeffentlich = not ist_oeffentlich` guarded by the eligibility predicate.

**L3 — `isRateLimited` fails open.** `lib/rateLimit.ts:18-26` discards the query error; on failure
`data` is null and the function returns `false`. For `route_completions`, `route_ratings` and
`routes` a DB trigger backstops this (migrations `0024`/`0041`), and the code says so. For `kudos`,
`favorites`, `follows`, `vehicles` and all three report tables there is no trigger — the cooldown is
the only limit and it silently disappears on error. Also, `toggleKudos`'s cooldown keys on the
user's most recent kudos row, so it blocks *un*-kudoing within 500 ms of giving one.

**L4 — `isRateLimitedByKey` limitations.** Per-instance and non-shared, which the comment at
`lib/rateLimit.ts:32-38` states honestly. Two smaller points: `getClientIp` (`:68-72`) trusts the
first `x-forwarded-for` entry, so the limit is only as good as the platform overwriting that header;
and the cleanup sweep (`:57-61`) runs only on the non-limited path, so a map that reaches
`MAX_TRACKED_KEYS` through hits alone never shrinks.

**L5 — Two outbound calls have no timeout.** `lib/mapboxDirections.ts:76` (`fetchDrivingRoute`) has
neither `AbortSignal.timeout` nor a try/catch — a network failure rejects into `NeueStreckeForm`.
`lib/traffic.ts` `fetchCongestionLevels` catches but does not time out, and fires `sampleCount`
parallel Mapbox tilequery requests **per route-detail render**, scaled by route length
(`components/RouteDetailMap.tsx:56-61`), with no caching — a per-pageview cost multiplier.
`lib/weather.ts:34` also has no timeout (it does have `next: { revalidate: 600 }`). Contrast
`lib/geocoding.ts:55` and `lib/elevation.ts:55`, which both do this correctly and explain why.

**L6 — Public API routes: no cache headers, and a session round-trip on every call.**
`app/api/strecken/route.ts` and siblings build on `createClient()` (cookie-bound), so they are
inherently uncacheable despite serving entirely public data, and the proxy matcher (`proxy.ts:8-12`)
does not exclude `/api`, so each request also pays `supabase.auth.getUser()`. `/api/strecken` also
returns every route with no pagination. An anon client plus `Cache-Control: s-maxage=…` would
address all three. (Route handlers are dynamic by default here — Cache Components is not enabled in
`next.config.ts` — so nothing is being cached implicitly.)

**L7 — `signUp`'s duplicate-name check can be defeated by a pre-existing duplicate.**
`lib/actions/auth.ts:104-108` uses `.maybeSingle()`, which errors when more than one row matches.
The error is discarded, `existing` is null, and the check passes. Self-limiting, but `.limit(1)`
fixes it.

**L8 — `sampleRoute` resets its accumulator instead of subtracting.** `lib/routeCoverage.ts:44`
`accumulated = 0` discards the overshoot, so on coarse geometry sample spacing drifts above 0.1 km.
Harmless for a percentage, but `lib/lapDetection.ts:113` solves the same problem correctly
(`nextTarget = cumulative[i] + SAMPLE_INTERVAL_KM`). Worth aligning so the two don't diverge further.

**L9 — Non-monotonic and out-of-range trail points are not rejected.** `parseTrail`
(`lib/actions/completions.ts:63-71`) checks types only — no monotonicity, no finiteness, no lat/lon
bounds. Consequences: `lapDetection`'s gap check `point.t - state.lastT > MAX_GAP_SECONDS`
(`:294`) never fires on a backwards jump, and `buildDetectedSegments`' window filter
`p.t >= lap.entryT && p.t <= lap.exitT` (`:431`) can pull in unrelated points. Coverage still gates
the outcome, so this is not exploitable on its own — but it is the cheap half of the H1 fix, and
the pattern already exists in `lib/actions/routes.ts:45-57` (`isValidCoordinate`, with
`Number.isFinite` and range checks) for route geometry.

**L10 — `uploadAvatar` orphans the previous file when the extension changes.**
`lib/actions/profile.ts:130-134` writes `${user.id}/avatar.${ext}` with `upsert: true`; uploading
`me.png` then `me.jpg` leaves `avatar.png` in the bucket permanently.

**L11 — `revalidatePath` coverage is inconsistent, but inert today.** `logTrackedCompletion`
(`lib/actions/completions.ts:325-327`) revalidates `/strecken/[id]`, `/profil` and `/leaderboards`
but not `/feed` or `/fahrer/[id]`, while `logFreeRide` (`:640-644`) and `deleteCompletion`
(`:702-706`) do both. No page opts into caching — there is no `use cache`, no
`export const revalidate`, no `dynamic` export and no `cacheComponents` in `next.config.ts`, and
every page reads cookies through `createClient()`, so all render dynamically. Per
`node_modules/next/dist/docs/01-app/03-api-reference/04-functions/revalidatePath.md`, a Server
Function `revalidatePath` also refreshes previously visited pages on next navigation, which papers
over the gap. **Not a bug today** — but it becomes one the day any of these pages adopts `use cache`,
and the inconsistency is worth closing while it is free.

**L12 — Two-step mutations that can half-apply.** `unpublishReportedCompletion`
(`lib/actions/moderation.ts:157-168`) unpublishes the ride and then closes the reports in a second
statement; if the second fails, the queue keeps an entry for a ride already handled.
`updateVisibilitySettings` (`lib/actions/profile.ts:74-102`) commits the profile before
`recomputePublicTracks`; that one at least returns an explicit error and is idempotent on retry
because it re-crops from `fahrt_tracks` rather than from the already-cropped geometry — a detail
worth preserving. Both fail in the safe direction.

**L13 — `recomputePublicTracks` updates one row per round trip.** `lib/publicTrack.ts:78-86` loops
sequentially; a user with many public rides pays N serial UPDATEs inside a Server Action. The
comment explains why a single SQL UPDATE isn't possible — but the loop could at least run in
batches.

---

## Strengths

These are load-bearing and worth not regressing.

- **Every ride metric is derived server-side from the raw trail, with the client's own numbers
  ignored** (`lib/actions/completions.ts:234-251`). This is the single most important decision in
  the codebase and it holds throughout — including the subtlety that simplification is applied only
  to stored geometry while metrics come from raw points (`lib/track.ts:89-96`,
  `lib/lapDetection.ts:4-10`). H1 is the one gap, and it is a gap in *which* input is trusted, not
  in the architecture.
- **Auto-detected segments require two independent signals to agree** — ordered arc-length progress
  from `detectLaps` plus an independent `computeRouteCoverage` recheck on the extracted window
  (`lib/actions/completions.ts:435,443`) — with an explicit conservative bias: a rejected window is
  dropped silently because a missed detection costs nothing and a wrongly granted ride costs a lot.
- **`lib/lapDetection.ts` is unusually careful work.** The `missedSinceHit` reasoning (lines
  327-364) and the window-vs-segment-range fix (lines 182-194) both document a real bug, the trail
  that exposed it, and why the obvious cheaper fix doesn't hold. 19 KB of tests back it.
- **`lib/queryError.ts`** is the right abstraction over the error-vs-no-rows trap, with a comment
  that explains the failure mode better than most such code. M7 is about reach, not quality.
- **Photo upload/rollback discipline** — `uploadFotos` unwinds prior uploads on any later failure
  (`:153-168`), and `attachPhotos` deliberately does *not* surface its error because doing so would
  bait the user into resubmitting and creating a duplicate ride (`:170-191`). That trade-off is
  correctly reasoned.
- **`save_free_ride_with_segments` (migration `0050`)** — atomic, `SECURITY INVOKER`, `user_id` from
  `auth.uid()` only, re-validates route eligibility server-side rather than trusting the TS
  candidate list, and narrows the cooldown exemption to a transaction-local setting that PostgREST
  cannot reach. The app's retry-without-segments fallback (`completions.ts:603-614`) correctly
  prioritises the ride over best-effort detection, and the row-ordering assumption behind the
  summary zip (`:633-638`) is genuinely guaranteed by the RPC's sequential loop.
- **Real parallelisation in the heavy pages** — `app/strecken/[id]/page.tsx:73-90` (nine concurrent
  queries), `app/profil/page.tsx:84-162`, `app/fahrten/[id]/page.tsx:84` — plus `React.cache()` on
  `getRoute`, `getPublicProfile` and `getCompletionDetail` to dedupe the
  `generateMetadata` + page + `opengraph-image` triple-fetch.
- **Timeouts and null-fallbacks on the optional external services**, with the reasoning stated
  ("das Höhenprofil ist Beiwerk … darf weder das Speichern einer Fahrt noch einen Streckenvorschlag
  aufhalten", `lib/elevation.ts:44-49`), and the failure mode it was written to fix recorded.
- **`redirect()` is never called inside a try/catch** — checked at all thirteen call sites in
  `lib/actions/` and `app/`. Next's control-flow error is never swallowed.
- **Stripe idempotency uses a primary-key insert** (`lib/stripeWebhook.ts`), which is the correct
  race-free primitive. H4 is about sequencing relative to the side effect, not the primitive.
- `haversineKm` is correct across the antimeridian (the `sin(dLon/2)²` form wraps naturally), and
  the local-projection helpers scope their `cos(lat)` approximation to distances where it is
  provably fine, with the reasoning written down (`lib/track.ts:47-51`,
  `lib/lapDetection.ts:432-436`).
