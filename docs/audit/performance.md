# Cornice — Performance & Frontend Architecture Audit

Read-only audit of `/home/user/strado` (Next.js 16.3.3 App Router + Turbopack, React 19.2.8,
Tailwind 4, Mapbox GL 3.29, Supabase). No files in the repo were modified.

**Method / evidence quality.** `node_modules` is not installed in the repo and the sandbox
blocks writes there, so `next build` could not be run and there is **no measured bundle
report**. To verify Next 16 semantics I installed `next@16.3.3`, `lucide-react` and
`mapbox-gl` into a scratch directory and read the bundled docs at
`node_modules/next/dist/docs/` plus Next's own source. Every claim below is tagged:

- **[measured]** — read from a file, counted with `wc`/`du`, or verified against Next/Mapbox source or bundled docs.
- **[computed]** — arithmetic on measured inputs (e.g. seed-data coordinate counts × bytes-per-point).
- **[estimated]** — reasoned magnitude, not verified. Treat as a hypothesis to confirm with a profiler.

Scope excludes DB indexes, UI/UX design, and security (covered by other agents). A few
security-adjacent build-hygiene items are noted only where they overlap with build health.

---

## Findings at a glance

| # | Severity | Area | Finding | File |
|---|---|---|---|---|
| 1 | **High** | Rendering | `trail = []` / `trafficSegments = []` default params defeat every dependency array → 2 redundant Mapbox `setData` + repaints **per render** during a live ride | `components/RouteMap.tsx:265-266` |
| 2 | **High** | Rendering | `map.easeTo(…, duration: 800)` restarted every GPS fix → the WebGL canvas never idles for the whole ride | `components/RouteMap.tsx:868` |
| 3 | **High** | Rendering / IO | Snapshot writes re-serialise the whole trail to `localStorage` every 10 s → O(n²) synchronous main-thread IO over a ride | `components/useRideRecorder.ts:456`, `lib/trackingStorage.ts:51` |
| 4 | **High** | Data / payload | `getRoutes()` `select("*")` ships every route's full geometry + elevation + speed limits to the client on `/` and `/fahrten/neu` | `lib/routes.ts:9-13` |
| 5 | **High** | Data fetching | `auth.getUser()` runs in the proxy **and** in each page (twice on `/fahrten/[id]`) → 2–3 sequential auth round-trips before first byte | `proxy.ts:4`, `app/fahrten/[id]/page.tsx:42,73` |
| 6 | **Medium** | Rendering | `routes={[route]}` inline literal re-runs the whole route-layer rebuild **and re-fits the camera** on every toggle | `components/RouteDetailMap.tsx:89` |
| 7 | **Medium** | PWA | Service-worker cache name is static → old build assets are **never** evicted; unbounded growth | `public/sw.js:7,17-24` |
| 8 | **Medium** | Images | Photo lightbox uses a raw `<img>` on the **original** upload (≤ 8 MB), bypassing the optimizer | `components/PhotoGallery.tsx:117`, `components/CompletionPhotoGallery.tsx:165` |
| 9 | **Medium** | Data fetching | No caching anywhere: zero `use cache` / `revalidate` / `cacheComponents`, zero `<Suspense>` | project-wide |
| 10 | **Medium** | Data fetching | Unbounded lists: profile ride history, ratings, photos, moderation queue, explore | `lib/profile.ts:60`, `lib/ratings.ts:13`, `lib/photos.ts:12` |
| 11 | **Medium** | Bundle | `LiveTrackingForm` (+ recorder, summary form, photo input) eagerly bundled into `/strecken/[id]` for every visitor | `components/GefahrenSection.tsx:4` |
| 12 | **Medium** | Rendering | `ElevationProfile` rebuilds min/max + full SVG path on every `pointermove` | `components/ElevationProfile.tsx:18-27` |
| 13 | **Low** | Rendering | Explore list thumbnails render the **full** route geometry into a 64×48 px SVG | `components/ExploreSidebar.tsx:68`, `lib/routeShape.ts:75` |
| 14 | **Low** | Rendering | `computeSignatures` is O(n²) | `lib/signature.ts:50` |
| 15 | **Low** | Images | No `formats: ['image/avif','image/webp']`, no raised `minimumCacheTTL` | `next.config.ts:29-40` |
| 16 | **Low** | Memory | `openDb()` never closes its IndexedDB connection | `lib/offlineRoutes.ts:43-54` |
| 17 | **Low** | Rendering | `DragSheet` animates `height` (layout) instead of `transform` (compositor) | `components/ui/DragSheet.tsx:97-100` |
| 18 | **Low** | Bundle | `RouteMap` imports a constant from the recorder hook module | `components/RouteMap.tsx:10` |

---

## What is already done well

Genuinely above average — call these out before the criticism, and do not regress them.

- **`mapbox-gl` is correctly code-split.** [measured] All five consumers load it through
  `next/dynamic(… , { ssr: false })` — `ExploreView.tsx:32`, `LiveTrackingForm.tsx:16`,
  `RouteDetailMap.tsx:21`, `CompletionMap.tsx:10`, `FreeRideForm.tsx:21`. All five point at
  the same specifier `@/components/RouteMap`, so the bundler emits **one** shared async
  chunk, not five. The static `import mapboxgl from "mapbox-gl"` lives only inside
  `RouteMap.tsx:5` and `RoutePicker.tsx:4`, and `RoutePicker` is only reachable from
  `NeueStreckeForm` (`/strecken/neu`) — so the ~504 KB gzipped library
  ([measured]: `gzip -c dist/mapbox-gl.js | wc -c` = 503,888 B; 5,831 B for the CSS) never
  lands in the initial bundle of any read-path route. This is the single most important
  bundle decision in the app and it is right.
- **`lucide-react` named imports are correct.** [measured] All 39 import sites use named
  imports (`import { Trophy } from "lucide-react"`). `lucide-react` is in Next 16.3.3's
  **default** `optimizePackageImports` allowlist — verified at
  `node_modules/next/dist/server/config.js:1125` — and the package ships
  `"sideEffects": false`. Deep imports (`lucide-react/dist/esm/icons/…`) would buy nothing
  and would break on a minor upgrade. `components/NavIcons.tsx` / `VisibilityIcons.tsx`
  re-export rather than wrap, which preserves tree-shaking. **No change needed here.**
- **No server-only code leaks into client bundles.** [measured] Grepping all 64
  `"use client"` files for `@/lib/supabase/server`, `admin`, `@/lib/stripe`, `stripe`:
  the only hit is `ShareRideButton.tsx:5` importing `@/lib/supabase/client`, which is the
  correct browser factory.
- **The recorder is defensively written.** Snapshot writes and live-trail publishes are
  already throttled (10 s / 5 s, `useRideRecorder.ts:29,34`) with a comment explaining the
  O(n²) risk; `watchPosition`, `setInterval` and the Wake Lock are cleaned up in
  `releaseTracking()` and in an unmount effect (`useRideRecorder.ts:213-219`); the
  wake-lock re-request on `visibilitychange` handles the browser auto-release; the
  `PERMISSION_DENIED` path is distinguished from a transient signal loss. Refs are used
  consistently to keep the `watchPosition` closure fresh instead of re-arming the watch.
- **`RouteMap` uses the ref-mirror pattern correctly** so the map is constructed exactly
  once and survives `setStyle()` on theme change (`RouteMap.tsx:328-390, 408-413`).
- **Server-side parallelism is deliberate.** `app/strecken/[id]/page.tsx:69-92` and
  `app/profil/page.tsx:78-86` batch independent queries into `Promise.all` with comments
  explaining why. `app/fahrten/neu/page.tsx:28` does the same.
- **React `cache()` is used to dedupe per-request reads** where `generateMetadata` and the
  page both need the same row: `getRoute` (`lib/routes.ts:107`), `getCompletionDetail`
  (`lib/completions.ts:165`), `getPublicProfile` (`lib/profile.ts:36`).
- **Column selection is already narrowed where it matters most.**
  `listRouteChoices` and `listRouteDetectionCandidates` (`lib/routes.ts:31,75`) avoid
  `select("*")` with explicit comments; `hoehenprofil` is deliberately kept out of the
  `public_fahrten` view for exactly this reason (`lib/completions.ts:277`).
- **Leaderboards sort and limit in the database** (`lib/leaderboard.ts:66,165`) rather
  than pulling the table into JS — the comment says this was a deliberate fix.
- **Fonts are correct.** [measured] `next/font/google` with `variable` for both faces and
  `subsets: ["latin"]` (`app/layout.tsx:7-18`). Self-hosted, preloaded, `font-display:
  swap` by default, `size-adjust` fallback metrics generated automatically → no
  render-blocking third-party font request and near-zero font CLS. `IBM_Plex_Mono` is
  scoped to two weights.
- **The theme FOUC is handled properly** with a blocking inline script
  (`app/layout.tsx:65,78`) instead of a `useEffect`.
- **`proxy.ts` is the correct Next 16 convention** — verified in the bundled docs
  (`01-app/01-getting-started/16-proxy.md:15`: "Starting with Next.js 16, Middleware is now
  called Proxy"). Not a finding.
- **Build config is honest.** [measured] `next.config.ts` has **no** `typescript.ignoreBuildErrors`
  and **no** `eslint.ignoreDuringBuilds`. `tsconfig.json` has `"strict": true`.
  `.github/workflows/ci.yml` actually runs `npm run lint`, `npm run test` and `npm run build`
  on every PR, plus `npm audit --audit-level=high`. `images.remotePatterns` is scoped to the
  Supabase storage **path**, not the whole host. `productionBrowserSourceMaps` is off;
  `serverSourceMaps` is on with a comment explaining it is server-only.
- **`DragSheet` does not thrash its children.** Its `setDragHeight` on `pointermove`
  re-renders `DragSheet` only — `children` arrives as a prop from `ExploreView`, so the
  element reference is unchanged and React bails out of the `ExploreSidebar` subtree.
  Correct by construction; do not "fix" this.

---

## 1. Server / client boundary

### 1.1 `mapbox-gl` — verified correct, no action

See "done well" above. The only nuance: `RoutePicker.tsx` imports `mapbox-gl` **statically**
(`RoutePicker.tsx:4-5`) and is imported statically by `NeueStreckeForm.tsx:5`. That is
acceptable because `/strecken/neu` is a page whose entire purpose is drawing a route on a
map — the map is not optional there. Worth knowing, not worth changing.

### 1.2 Client-component inventory

[measured] 64 files carry `"use client"`. The large ones are all legitimately interactive:
`RouteMap.tsx` (906 lines, WebGL), `useRideRecorder.ts` (576, geolocation),
`NeueStreckeForm.tsx` (390), `RideSummaryForm.tsx` (370), `LiveTrackingForm.tsx` (299),
`FreeRideForm.tsx` (283), `ExploreSidebar.tsx` (265), `ExploreView.tsx` (253). Static
presentational pieces (`Header.tsx`, `Avatar.tsx`, `Card`, `EmptyState`, `VehicleGrid`,
`AchievementBadges`, `RouteLeaderboardPreview`, `DetectedSegmentsCard`) are correctly
server components. **No component was found that is client-side without needing to be.**

### 1.3 Finding 11 — `LiveTrackingForm` is eagerly bundled for every route visitor

**Severity: Medium** · `components/GefahrenSection.tsx:4`

```ts
import LiveTrackingForm from "@/components/LiveTrackingForm";
```

`GefahrenSection` renders a single "Strecke starten" button until `open` is true
(`GefahrenSection.tsx:25-37`), but the static import means every visitor to
`/strecken/[id]` downloads, parses and evaluates the whole recording subtree:
`LiveTrackingForm` (299 lines) → `useRideRecorder` (576) → `lib/trackingStorage`,
`lib/tracking`, `lib/geo` → `RideSummaryForm` (370) → `MultiPhotoInput` (134) +
`lib/actions/vehicles` + `lib/routeCoverage` + `lib/elevation` (262) + `lib/format`.

**Impact** [estimated]: ~1,600 lines of app code plus its server-action references, on the
critical path of the most-visited detail page, for a feature only a fraction of visitors
start. Order of ~15–25 KB gzipped and, more importantly, parse/eval time on a mid-range
phone during hydration.

**Fix** — one line, same pattern already used five times in this codebase:

```ts
const LiveTrackingForm = dynamic(() => import("@/components/LiveTrackingForm"), {
  ssr: false,
  loading: () => <Skeleton className="h-40 w-full" />,
});
```

Safe here: the component only mounts after a user gesture, and the existing comment at
`GefahrenSection.tsx:18-22` already guarantees it is never unmounted mid-recording.

### 1.4 Finding 18 — `RouteMap` imports a constant from a hook module

**Severity: Low** · `components/RouteMap.tsx:10`

```ts
import { MIN_ACCURACY_M } from "@/components/useRideRecorder";
```

This is a *value* import, so the map chunk pulls in `useRideRecorder`'s module graph
(`lib/trackingStorage`, `lib/tracking`, `lib/geo`). Tree-shaking should strip the unused
exports since they are pure, but it makes the map chunk's boundary depend on a hook it does
not use, and it creates an import cycle in spirit (the recorder's consumers render the map).

**Fix**: move `MIN_ACCURACY_M` to `lib/constants.ts` and import it from both places.
Zero behaviour change.

### 1.5 `lib/elevation.ts` mixes a server fetch with client-pure helpers

**Severity: Low (architecture)** · `lib/elevation.ts:37`

`fetchElevationProfile()` performs a swisstopo HTTP call and lives in the same module as
`interpolateElevation()`, which `LiveTrackingForm.tsx:7` imports into the client. ESM
tree-shaking should drop the fetch path, but nothing enforces it. The project does not use
the `server-only` package anywhere [measured — zero hits], so there is no compile-time guard
on any of the server modules.

**Fix**: split the pure math (`interpolateElevation`, `computeAscentM`, `countKehren`) out
of the fetching module, and add `import "server-only"` to `lib/elevation.ts`,
`lib/supabase/admin.ts`, `lib/stripe.ts`. Cheap, and it turns a class of accident into a
build error.

---

## 2. Bundle weight

### 2.1 lucide-react — no action (see "done well")

### 2.2 Finding 4 — the explore page ships every route's full geometry

**Severity: High** · `lib/routes.ts:9-13`, consumed by `app/page.tsx:6` and `app/fahrten/neu/page.tsx:34`

```ts
const { data, error } = await supabase
  .from("routes_geojson")
  .select("*")            // ← geometry_geojson + hoehenprofil + tempolimits + charakter_text
  .eq("status_ok", true)
  .order("name");
```

`RouteGeoJSON` (`types/database.ts:79-102`) includes `geometry_geojson` (the full
`LineString`), `hoehenprofil` (~85 points) and `tempolimits` (dozens of segments). Every one
of those rows crosses the RSC boundary into `ExploreView` (a client component) — so the
payload is serialised **into the HTML** as flight data *and* re-parsed on the client.

**Measured inputs** (from the committed seed SQL — the only real data available):

| Route (seed) | coordinates | GeoJSON size |
|---|---|---|
| `0001_routes.sql` #1 | 739 | ~15.9 KB |
| `0001_routes.sql` #2 | 388 | ~8.3 KB |
| `0001_routes.sql` #3 | 622 | ~13.4 KB |
| `0001_routes.sql` #4 | 901 | ~19.4 KB |
| `0006_zimmerberg_rundfahrt.sql` | 2,270 | ~48.8 KB |
| **total, 5 routes** | **4,920** | **~105.7 KB** |

[computed at ~22 B per `[8.530829,47.36282]` pair]. Plus ~15 KB of `hoehenprofil` across
9 routes and ~21 KB of `tempolimits` from the seed files → **~140 KB of route JSON on `/`
today, with only five routes seeded.**

The scaling is the problem. `lib/actions/routes.ts:38` sets `MAX_COORDINATES = 20_000` per
accepted route → **one** user-proposed route can legally carry ~440 KB of geometry
[computed]. At 100 published routes averaging the current seed size, `/` would ship
**~2 MB** of JSON before any UI.

`hoehenprofil` and `tempolimits` are **not used at all** by `ExploreView` / `ExploreSidebar`
/ `RouteMap` in overview mode — `RouteMap` only reads `tempolimits` when
`routes.length === 1` (`RouteMap.tsx:489-499`), i.e. the detail map, which loads its route
separately via `getRoute()`. `computeSignatures` does call `averageTempolimit`
(`lib/signature.ts:96`), so that one field is needed; `hoehenprofil` is pure dead weight.

**Fix, in increasing order of effort:**

1. **Drop unused columns now** (5 minutes, ~15 KB today, linear savings later). Replace
   `select("*")` in `getRoutes()` with the explicit column list the explore path actually
   reads: `id, name, region, start_ort, ziel_ort, start_geojson, ziel_geojson,
   geometry_geojson, hoehe_m, laenge_km, max_steigung_prozent, kehren, kategorien,
   saison_status, ist_rundfahrt, tempolimits`. Note `charakter_text` and `hoehenprofil` are
   never read by `ExploreSidebar`.
2. **Simplify the geometry server-side for the overview.** The explore map draws lines at
   zoom 8–14 where a 2,270-point line is far below one point per pixel. A
   Ramer–Douglas–Peucker pass at ~10 m tolerance typically removes 70–90 % of points on
   road geometry [estimated] with no visible difference at overview zoom. Do it once in a
   generated `geometry_simplified` column (a migration — outside this audit's remit, flag
   to the DB agent) or in `getRoutes()` before returning.
3. **Stop shipping geometry through the RSC payload at all.** Serve the overview as a
   single `FeatureCollection` from a route handler that the map fetches after mount, or as
   vector tiles. This also lets it be cached at the CDN, which the current
   cookie-bound page can never be.

Note the same query runs on `/fahrten/neu` (`app/fahrten/neu/page.tsx:34`) purely for
map orientation lines during a recording — the page that most needs a fast start and the
least battery. There, `listRouteDetectionCandidates` already demonstrates the narrow-column
pattern; the map could use the same shape.

### 2.3 No bundle budget in CI

**Severity: Low** · `.github/workflows/ci.yml`

CI builds but never inspects the output. Given how much of this app's performance rides on
`mapbox-gl` staying out of the initial chunk, a regression there would be silent.

**Fix**: add a step that greps `.next/build-manifest.json` (or runs
`@next/bundle-analyzer` with `ANALYZE=1`) and fails if the shared first-load JS exceeds a
threshold. This is the cheapest insurance against Finding 2.1 regressing.

---

## 3. Rendering — the live-tracking path

This is the hot path: it runs continuously for the duration of a ride, on a phone, with the
screen forced awake by a Wake Lock. Everything here costs battery directly.

### 3.1 Finding 1 — default array params defeat every dependency array

**Severity: High** · `components/RouteMap.tsx:265-266`

```ts
export default function RouteMap({
  …
  trafficSegments = [],        // ← line 265: fresh [] on every render
  trail = [],                  // ← line 266: fresh [] on every render
  …
})
```

Destructuring defaults are evaluated **per call**. Any caller that does not pass `trail`
(that is: `LiveTrackingForm`, `RouteDetailMap`, `ExploreView`) hands `RouteMap` a brand-new
array identity on every single render. Three effects key off those identities:

```ts
// RouteMap.tsx:358-360 — ref mirror, harmless but confirms the pattern
useEffect(() => { trailRef.current = trail; }, [trail]);

// RouteMap.tsx:757-764 — NOT harmless
useEffect(() => {
  …
  source.setData(toTrackFeatureCollection(trail));   // allocates + uploads an empty FC
  if (fitTrail) fitToTrail(map, trail, true);
}, [trail, fitTrail]);

// RouteMap.tsx:768-773 — NOT harmless
useEffect(() => {
  …
  source?.setData(toTrafficFeatureCollection(trafficSegments));
}, [trafficSegments]);
```

`GeoJSONSource.setData()` marks the source dirty and schedules a map repaint even when the
data is an empty `FeatureCollection`. So **every** `RouteMap` render triggers two source
updates and a WebGL repaint that produce no visual change.

**Impact** [computed from the render rate]:

- During a gated ride (`LiveTrackingForm`), the tree re-renders on each GPS fix and on each
  1 Hz `setElapsedSeconds` tick (`useRideRecorder.ts:264-266`) → **≈ 2 renders/s** →
  **≈ 4 wasted `setData` calls and ≈ 2 forced repaints per second, for the entire ride.**
  Over a 2-hour ride that is ~28,800 no-op source uploads.
- On `/` (`ExploreView`), every list-row hover flips `hoveredRouteId`
  (`ExploreSidebar.tsx:186-189` → `ExploreView.tsx:107`), re-rendering `RouteMap` → two
  no-op `setData` + a repaint **per hover**.
- On `/strecken/[id]`, every 3D/traffic/speed-limit toggle does the same.

**Fix** — hoist the empties to module scope. Two lines, zero behaviour change:

```ts
const NO_TRAIL: [number, number][] = [];
const NO_TRAFFIC: { coords: [number, number][]; color: string }[] = [];

export default function RouteMap({ …, trafficSegments = NO_TRAFFIC, trail = NO_TRAIL, … })
```

`components/CompletionMap.tsx:15` already does exactly this (`const NO_ROUTES: never[] = []`)
with the right instinct — the pattern just was not applied inside `RouteMap` itself.

Additionally, guard the effects so an unchanged payload short-circuits:

```ts
useEffect(() => {
  const map = mapRef.current;
  if (!map || !styleLoadedRef.current) return;
  const source = map.getSource(TRACK_SOURCE) as mapboxgl.GeoJSONSource | undefined;
  if (!source) return;
  if (trail.length === 0 && lastTrailLenRef.current === 0) return;   // ← nothing to do
  lastTrailLenRef.current = trail.length;
  source.setData(toTrackFeatureCollection(trail));
  if (fitTrail) fitToTrail(map, trail, true);
}, [trail, fitTrail]);
```

### 3.2 Finding 2 — the follow camera never lets the GPU idle

**Severity: High** · `components/RouteMap.tsx:861-869`

```ts
} else if (followLocation && !isDraggingRef.current && accuracyOk) {
  map.easeTo({ center: userLocation, duration: 800 });
}
```

`watchPosition` is configured with `enableHighAccuracy: true, maximumAge: 2000`
(`useRideRecorder.ts:500`), which on most handsets yields a fix roughly every 1 s. Each fix
starts a fresh **800 ms** camera animation. Because 800 ms < 1 s only marginally, and because
the previous animation is still settling when the next begins, the map is in near-continuous
animation for the whole ride. Mapbox GL only repaints when the camera moves or a source
changes — so this converts an otherwise mostly-idle canvas into a **sustained ~60 fps WebGL
redraw** with full tile/label re-projection, for hours.

Combined with Finding 1 (two forced repaints/s) and Finding 3 (a synchronous localStorage
write every 10 s), the recording screen has no idle frames at all.

**Impact** [estimated — this needs a device power profile to confirm]: continuous WebGL
compositing plus label re-layout is typically the largest single power draw on a map screen
after the display itself. Cutting the animated fraction from ~100 % to ~30 % is a meaningful
battery win on a multi-hour ride.

**Fix options**, cheapest first:

1. Shorten the ease so the camera settles and the canvas goes idle between fixes:
   `map.easeTo({ center: userLocation, duration: 300, essential: true })`. Still smooth,
   ~70 % of each second idle.
2. Skip the update when the camera is already essentially there — compare against
   `map.getCenter()` and bail below a few metres, so a stationary rider (traffic light,
   coffee stop) produces no animation at all.
3. Add `essential: true` regardless, so the follow behaviour is not silently disabled for
   users with `prefers-reduced-motion`.

Also note `RouteMap.tsx:882-887`: the `zoom`/`rotate` listeners for the accuracy ring are
`off`'d and `on`'d again on every fix, because the effect's deps include `userLocation`,
`userAccuracyM`, `userHeadingDeg`. Cheap individually, but it is ~2 listener churns per
second for the whole ride, and it is avoidable by splitting the marker-position update
(deps: position) from the listener registration (deps: `[]`, reading position from a ref).

### 3.3 Finding 3 — snapshot writes are O(n²) synchronous main-thread IO

**Severity: High** · `components/useRideRecorder.ts:456-465` → `lib/trackingStorage.ts:51`

```ts
// trackingStorage.ts:51
localStorage.setItem(key(userId, storageKey), JSON.stringify(snapshot));
```

The snapshot contains the **entire** trail so far (`useRideRecorder.ts:458`). It is throttled
to every 10 s (`SNAPSHOT_INTERVAL_MS`), and the author's comment at
`useRideRecorder.ts:23-29` explicitly identifies the O(n²) shape — but the throttle only
reduces the constant, it does not change the complexity.

**Impact** [computed]. A `TrailPoint` serialises to
`{"lng":8.530829,"lat":47.36282,"t":1757155200000}` ≈ 48 bytes. At 1 fix/s:

| Ride length | points at end | final snapshot | cumulative bytes written |
|---|---|---|---|
| 30 min | 1,800 | ~86 KB | ~7.8 MB |
| 2 h | 7,200 | ~346 KB | ~124 MB |
| 4 h | 14,400 | ~691 KB | ~497 MB |

`localStorage.setItem` is **synchronous and blocking** — it serialises on the main thread and
then hits disk. A ~350 KB write on a mid-range Android phone is commonly 5–30 ms
[estimated], during which the map's rAF loop, the GPS callback and any touch handling all
stall. That is a visible hitch every 10 s late in a long ride, plus the raw IO energy cost of
writing ~124 MB over a 2-hour ride.

There is a second, quieter failure: `localStorage` is typically capped at ~5 MB per origin.
A 4-hour ride's ~691 KB snapshot fits, but a 12-hour tour would not, and
`saveTrackingSnapshot` swallows the `QuotaExceededError` (`trackingStorage.ts:52-54`). Crash
recovery would silently stop working with no signal to the user — exactly when a long ride
makes it most valuable.

**Fix**: make the snapshot append-only. The project already has an IndexedDB helper
(`lib/offlineRoutes.ts`) — the pattern is in-house:

- Keep a small metadata record (`phase`, `distanceKm`, `startTimeMs`, `hasStarted`,
  `hasLeftStart`, `pointCount`) in `localStorage` as today — it is tiny and fixed-size.
- Append trail points to an IndexedDB object store in **chunks** (e.g. one record per 200
  points, keyed `${rideKey}:${chunkIndex}`). Each write is then O(chunk), not O(n), and
  IndexedDB writes are asynchronous — they do not block the main thread.
- Recovery reads the metadata plus all chunks for the key and concatenates.

That turns 124 MB of blocking writes into ~350 KB of non-blocking ones over a 2-hour ride
[computed], and removes the quota ceiling.

Two smaller wins in the same area:

- `useRideRecorder.ts:171-181` — `publishLiveTrail` builds **two** full-length arrays every
  5 s (`.map()` for `liveTrail` and `[...trailRef.current]` for `liveTrailPoints`).
  `liveTrailPoints` exists only for `useLiveLapHint`, which `LiveTrackingForm` never uses —
  the gated-route path pays for it and throws it away. Gate it behind a
  `{ withTimestamps?: boolean }` option so `LiveTrackingForm` skips the second allocation
  and the second state update entirely (halving the renders that `publishLiveTrail` causes).
- `useRideRecorder.ts:295` — `setTrailJson(JSON.stringify(trailRef.current))` on stop, then
  `RideSummaryForm.tsx:150` renders it as `<input type="hidden" value={trailJson} />`. For a
  2-hour ride that is a ~346 KB string held in React state, in the DOM, and diffed on every
  summary-form render [computed]. Consider building the `FormData` entry at submit time via
  the `formAction` closure instead of round-tripping it through the DOM.

### 3.4 Finding 6 — `routes={[route]}` re-fits the camera on every toggle

**Severity: Medium** · `components/RouteDetailMap.tsx:89`

```tsx
<RouteMap
  routes={[route]}          // ← new array identity on every render
  showSpeedLimits={showSpeedLimits}
  showTraffic={showTraffic}
  show3D={show3D}
  trafficSegments={trafficSegments}
/>
```

`RouteDetailMap` holds four pieces of state (`showSpeedLimits`, `showTraffic`, `show3D`,
`levels`), each of which re-renders it and hands `RouteMap` a fresh `routes` array. That
triggers `RouteMap.tsx:702-724`:

```ts
useEffect(() => {
  …
  source.setData(toFeatureCollection(routes, colors));                    // O(coords)
  endpointsSource?.setData(toEndpointFeatureCollection(routes, colors));
  speedSource?.setData( … toSpeedFeatureCollection(coords, tempolimits) ); // O(coords)
  if (fitRoutes) fitToRoutes(map, routes, true);                          // ← camera jump
}, [routes, colors, fitRoutes]);
```

`fitRoutes` defaults to `true` (`RouteMap.tsx:268`), so **`fitToRoutes(map, routes, true)`
runs on every toggle** — a 500 ms animated `fitBounds` back to the route's full extent.

**Impact**: this is a user-visible bug as much as a perf one. Pan/zoom into a hairpin, tap
"3D-Ansicht" or "Tempolimits anzeigen", and the map snaps back to the whole route. It also
fires when the traffic fetch resolves (`RouteDetailMap.tsx:62` `setLevels`), so the view
resets a second or two after page load, unprompted. On the Zimmerberg route [measured: 2,270
coordinates] each toggle also rebuilds three `FeatureCollection`s and re-runs
`sliceRouteBySpeed` over all 2,270 points.

**Fix**:

```ts
const routes = useMemo(() => [route], [route]);
```

`LiveTrackingForm.tsx:50` already does precisely this and the comment there
(`LiveTrackingForm.tsx:46-49`) diagnoses the exact bug. Additionally, split the camera fit
out of the data-update effect so it keys on route identity rather than array identity —
re-fitting because a legend toggled is never wanted.

`components/CompletionMap.tsx:26` has the same inline `routes={[route]}`, but that component
holds no state so it only re-renders if its server parent does. Fix it anyway for
consistency (it is one line and the file already defines `NO_ROUTES` for the other branch).

### 3.5 Finding 12 — `ElevationProfile` recomputes everything per pointer move

**Severity: Medium** · `components/ElevationProfile.tsx:18-27, 52-54`

```ts
const mMin = Math.min(...punkte.map((p) => p.m));        // line 18
const mMax = Math.max(...punkte.map((p) => p.m));        // line 19
const linePath = punkte.map(…).join(" ");                // line 26
const areaPath = `${linePath} L ${WIDTH} ${HEIGHT} L 0 ${HEIGHT} Z`;  // line 27
const gipfel = punkte.reduce((a, b) => (b.m > a.m ? b : a));          // line 29
…
function onPointerActivity(e) { setHoverIndex(nearestIndex(e.clientX)); }  // line 52-54
```

None of these are memoised, and `onPointerMove` fires at the pointer's sampling rate
(60–120 Hz, higher on some Android devices). Each event triggers a re-render that redoes
four full array passes and rebuilds a ~1.7 KB path string [computed: ~85 seed points ×
~20 chars], then hands React a changed `d` attribute for both `<path>` elements — so the
browser also re-parses and re-rasterises the SVG geometry every frame, even though the
curve itself never changes.

**Impact** [estimated]: 60–120 redundant path rebuilds per second while scrubbing. Not
catastrophic at 85 points, but it is pure waste on the exact interaction where smoothness is
noticeable, and it scales with `hoehenprofil` length.

**Fix**: wrap the geometry in `useMemo(…, [punkte])`; only `hoverPunkt` depends on state.
Optionally coalesce pointer events with `requestAnimationFrame` so at most one update lands
per frame.

### 3.6 Finding 17 — `DragSheet` animates `height`

**Severity: Low** · `components/ui/DragSheet.tsx:97-100`

The sheet's size is driven by a `--sheet-h` custom property applied to `height`. Height is a
layout-triggering property: every frame of the drag forces a full layout + paint of the
sheet **and its contents** — the entire route list. `transform: translateY()` would stay on
the compositor.

**Fix**: give the sheet its full expanded height and translate it down by
`expandedHeight - currentHeight`, animating `transform` instead. The React side is already
efficient (children bail out); only the CSS property choice costs.

### 3.7 No `React.memo` anywhere

**Severity: Low (informational)** · [measured: zero occurrences of `memo(` across `components/`]

Given the render rates above, two components would benefit from `React.memo` once
Finding 1 and Finding 6 are fixed — otherwise memoisation just papers over the unstable
props:

- `RouteMap` — its render output is two `<div>`s, so memoising saves little React work, but
  it would make the effect re-runs impossible to trigger accidentally from a parent's
  unrelated state. **Fix the prop identities first; then memo is belt-and-braces.**
- `ExploreSidebar` — re-renders on every `hoveredRouteId` change. Today that is ~5 rows; at
  200 routes it is 200 list items with inline `style` objects and SVG paths reconciled per
  hover event. Memoising will not help until `onHoverRoute` and the other handler props are
  stable — `onToggleKategorie` / `onResetKategorien` / `onAdvancedFiltersChange` are
  `useCallback`'d but depend on `urlFilters`, which is itself memoised on `searchParams`, so
  they are stable in practice. `setHoveredRouteId` is a stable setter. So `React.memo` on
  `ExploreSidebar` would actually work — but it is only worth doing once the route count
  grows.

### 3.8 Leak audit — clean

[measured] Every `addEventListener` in `components/` and `lib/` has a matching
`removeEventListener` in the same effect's cleanup (10 pairs). `subscribeToThemeChange`
(`lib/theme.ts:19-28`) returns a proper unsubscriber and all three callers use it.
`setInterval` / `requestAnimationFrame` are cleared. `map.remove()` (`RouteMap.tsx:673`)
tears down all Mapbox listeners. `watchPosition` and the Wake Lock are released in
`releaseTracking()` and in the unmount effect.

One near-miss: `useRideRecorder.start()` assigns `intervalRef.current = setInterval(…)`
at line 354 on the resume path without clearing a pre-existing interval. In the current
call graph `start()` only runs once from the mount effect, so it cannot fire twice — but a
defensive `if (intervalRef.current) clearInterval(intervalRef.current)` before both
assignments (lines 264 and 354) costs nothing and removes the footgun.

---

## 4. Data fetching & caching

### 4.1 Finding 5 — 2–3 sequential auth round-trips before first byte

**Severity: High** · `proxy.ts:4` → `lib/supabase/middleware.ts:38`, plus every page

`supabase.auth.getUser()` performs a network request to the Supabase Auth API
(`GET /auth/v1/user`) — it is not a local JWT decode. It is called:

1. In the proxy, on **every** matched request (`lib/supabase/middleware.ts:38`).
2. Again in the page's own server component — [measured] 56 call sites across `app/` and `lib/`.
3. On `/fahrten/[id]`, a **third** time, because `generateMetadata` (line 42) and the page
   (line 73) each call it independently, and unlike `getRoute` there is no `cache()` wrapper
   around the user lookup.

**Impact** [estimated at 30–80 ms per Supabase auth round-trip from a Vercel function in the
same region]: 60–240 ms of pure serialised latency added to TTFB on `/fahrten/[id]`, and
30–160 ms on every other page. These are strictly sequential — the proxy must finish before
the page starts.

The proxy matcher makes it worse:

```ts
matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"]
```

This matches `/api/stripe/webhook`, `/manifest.webmanifest`, `/robots.txt`, `/sitemap.xml`,
`/icon`, `/apple-icon` and `/opengraph-image` — none of which need a session refresh. Every
Stripe webhook delivery currently pays an auth round-trip before the handler runs, which
also eats into Stripe's delivery timeout budget.

**Fixes:**

1. **Dedupe within a request.** Add to `lib/supabase/server.ts`:

   ```ts
   import { cache } from "react";
   export const getCurrentUser = cache(async () => {
     const supabase = await createClient();
     const { data: { user } } = await supabase.auth.getUser();
     return user;
   });
   ```

   Replace the 56 inline `auth.getUser()` calls with it. On `/fahrten/[id]` this removes one
   full round-trip immediately, and it makes the double-call class of bug impossible to
   reintroduce. This is exactly the pattern the codebase already applies to `getRoute`
   (`lib/routes.ts:107`) and `getPublicProfile` (`lib/profile.ts:36`) — apply it to the one
   call that runs on literally every page.

2. **Narrow the proxy matcher** to exclude `api`, and the metadata routes:

   ```ts
   matcher: ["/((?!api|_next/static|_next/image|favicon.ico|manifest.webmanifest|robots.txt|sitemap.xml|icon|apple-icon|opengraph-image|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"]
   ```

   Verify against the auth flows in `app/auth/` first — if any API route relies on the
   proxy refreshing the cookie, exclude only `api/stripe`. (`proxy.ts` is a Protected Area
   per `AGENTS.md`; this change belongs in its own PR with the reasoning spelled out.)

### 4.2 Finding 9 — no caching strategy at all

**Severity: Medium** · project-wide

[measured] Zero occurrences of: `export const revalidate`, `export const dynamic`,
`'use cache'`, `cacheLife`, `cacheTag`, `unstable_cache`, and zero `<Suspense>` boundaries.
`next.config.ts` does not set `cacheComponents`.

Every page calls `createClient()` → `cookies()`, which opts the whole route into dynamic
rendering. So **every page is rendered from scratch on every request**, including pages
whose content barely changes:

- `/` — the curated route list changes when a moderator approves a route, i.e. rarely.
- `/leaderboards` — aggregate totals, tolerant of minutes of staleness.
- `/strecken/[id]` — route metadata is static; only the weather, traffic and the viewer's
  own state are live.

**Verified against the bundled docs** (`01-app/03-api-reference/05-config/01-next-config-js/cacheComponents.md`):
in Next 16 the flag is `cacheComponents: true` (top-level, **not** `experimental`) — it
replaces `experimental.ppr`, `experimental.useCache` and `experimental.dynamicIO`, and it
makes PPR the default. `use cache` requires it
(`01-app/03-api-reference/01-directives/use-cache.md`). The key constraint, quoted from the
doc: *"To use cookies or headers, read them outside cached scopes and pass values as
arguments."*

That constraint fits this codebase well, because the expensive query is
**viewer-independent**: `getRoutes()` returns the same rows for everyone (RLS filters on
`status_ok`, not on the user). So it can be lifted out of the request scope:

```ts
// lib/routes.ts
export async function getPublicRoutes() {
  "use cache";
  cacheLife("hours");
  cacheTag("routes");
  // …fetch with a non-cookie-bound client…
}
```

and revalidated with `revalidateTag("routes")` from the moderation action
(`lib/actions/moderation.ts`).

**Recommended sequencing** — this is a real migration, not a config flip:

1. **First, add `<Suspense>` boundaries.** This is free, needs no config change, and
   delivers the biggest immediate win. Today `app/strecken/[id]/page.tsx:75-92` awaits a
   `Promise.all` that includes `fetchCurrentWeather` — an **external HTTP call to
   api.open-meteo.com** — before rendering *anything*. The route name, stats and map all
   wait on a third-party weather API. Same for `getRouteLeaderboard` and `getRoutePhotos`.
   Wrapping the weather card, the leaderboard preview and the photo gallery in their own
   `<Suspense fallback={…}>` boundaries with the fetch moved into child server components
   lets the page shell stream immediately. [estimated] This alone should cut perceived
   load on `/strecken/[id]` by however long open-meteo takes — typically 100–400 ms, and
   unbounded if the API is slow (there is no timeout on that `fetch`;
   `lib/weather.ts:34-40` sets only `next: { revalidate: 600 }`).
2. **Then** evaluate `cacheComponents: true` behind a branch, following
   `01-app/02-guides/migrating-to-cache-components.md`. Note the doc's warning that it
   requires the Node.js runtime and changes navigation semantics (React `<Activity>` keeps
   previous routes mounted) — which interacts with the recorder's "never unmount during a
   ride" invariant (`GefahrenSection.tsx:18-22`). **Test the recording flow specifically
   before adopting it.**

Also: `app/loading.tsx` is the only loading boundary in the app. Because it sits at the root,
navigating to any nested route blanks the *entire* page. Per-segment `loading.tsx` files
(at minimum for `strecken/[id]`, `fahrten/[id]`, `feed`, `profil`) would keep the shell
stable during navigation.

### 4.3 Finding 10 — unbounded lists

**Severity: Medium**

[measured] Only 4 real `.limit()` calls exist in the whole data layer
(`lib/feed.ts:29` FEED_LIMIT=30, `lib/leaderboard.ts:66,165`, `lib/actions/profile.ts:39`).
Everything else is unbounded:

| Query | File | Bound |
|---|---|---|
| all approved routes, full geometry | `lib/routes.ts:11` | none |
| a user's entire public ride history | `lib/profile.ts:60` | none |
| the signed-in user's entire ride history | `app/profil/page.tsx:~118` | none |
| all ratings for a route | `lib/ratings.ts:13` | none |
| all photos for a route | `lib/photos.ts:12` | none |
| the whole moderation queue | `lib/moderation.ts:19` | none |

`lib/profile.ts:57-90` is the worst of these: it pulls **every** row of `public_fahrten` for
a user with `select("*")` and then computes `passCount`, `distanzKm` and `hoehenmeter` in
JavaScript — and follows up with a *second*, sequential query against `routes` to sum
elevation (`lib/profile.ts:82-89`). So a rider with 500 logged rides transfers 500 full rows
and renders 500 list items, just to display three numbers plus a list nobody scrolls to the
bottom of. Three sequential round-trips: `profiles` → `[vehicles, public_fahrten]` → `routes`.

**Fix**: split the aggregate from the list. Compute the three totals in SQL (a view or RPC —
coordinate with the DB agent, per `AGENTS.md` core rule 8 this needs a migration), and page
the ride list with `.range()` plus a "load more" control. `getFeed`'s `FEED_LIMIT = 30`
(`lib/feed.ts:14`) already establishes the pattern and its comment acknowledges paging is
deferred — the feed has a bound, the profile does not.

### 4.4 Waterfalls — mostly good

[measured] `Promise.all` is used deliberately on the pages that need it. Two remaining
sequential stages worth noting:

- `app/strecken/[id]/page.tsx:69-92` — correctly two stages (`[getRoute, getUser]`, then the
  nine dependents). The second stage genuinely depends on `route` and `user`. Fine.
- `lib/profile.ts` — three stages, as described above. The third (`routes` for elevation)
  is avoidable with a SQL aggregate.
- `app/aktivitaet/page.tsx:20-27` and `app/strecken/[id]/bearbeiten/page.tsx` have no
  `Promise.all`, but each has only one dependent query. Fine.

---

## 5. Images

### 5.1 Finding 8 — the lightbox serves the original upload

**Severity: Medium** · `components/PhotoGallery.tsx:117`, `components/CompletionPhotoGallery.tsx:165`

```tsx
{/* eslint-disable-next-line @next/next/no-img-element */}
<img
  src={openPhoto.foto_url}
  alt={`Foto von ${openPhoto.display_name ?? "Nutzer"}`}
  className="max-h-[80vh] max-w-[90vw] object-contain"
/>
```

Thumbnails are done right — `next/image` with `fill` and `sizes="33vw"`
(`PhotoGallery.tsx:57-63`). But the lightbox bypasses the optimizer entirely and fetches the
**unmodified original from Supabase Storage**. Uploads are accepted up to **8 MB**
(`lib/actions/completions.ts:35,117`) and there is no client- or server-side downscaling —
[measured] no `canvas`, `toBlob` or resize logic in `MultiPhotoInput.tsx`, `AvatarUpload.tsx`
or the upload actions; the file goes to storage as-is
(`lib/actions/completions.ts:122-123`).

**Impact**: tapping a photo on mobile can pull a multi-megabyte JPEG straight off a modern
phone camera, over cellular. There is also no `width`/`height`, so the image pops in with
layout shift, and the eslint rule was suppressed rather than addressed.

**Fix**:

```tsx
<Image
  src={openPhoto.foto_url}
  alt={…}
  width={1600}
  height={1200}
  sizes="90vw"
  className="h-auto max-h-[80vh] w-auto max-w-[90vw] object-contain"
  onClick={(e) => e.stopPropagation()}
/>
```

The `remotePatterns` entry in `next.config.ts:33-39` already permits these URLs, so no config
change is needed. If the intrinsic aspect ratio is unknown, `fill` inside a sized wrapper
works too. Separately, consider downscaling on upload (a `canvas` pass to ~2048 px longest
edge before `FormData.append`) — that cuts storage, egress and optimizer CPU at the source,
and would let the 8 MB limit drop.

### 5.2 Finding 15 — image config leaves easy wins on the table

**Severity: Low** · `next.config.ts:29-40`

[verified against `01-app/03-api-reference/02-components/image.md:698-760, 774-786`]
Next 16 defaults: `formats: ['image/webp']`, `qualities: [75]`, `minimumCacheTTL: 14400`
(4 hours).

For a photo-heavy app, two additions are near-free:

```ts
images: {
  remotePatterns: [ /* unchanged */ ],
  formats: ["image/avif", "image/webp"],
  // Photo paths are `${userId}/${crypto.randomUUID()}.${ext}` (completions.ts:122) and
  // avatars are cache-busted with `?v=${Date.now()}` (profile.ts:141) — both immutable,
  // so a long TTL is safe and avoids re-optimising the same bytes every 4 hours.
  minimumCacheTTL: 31536000,
},
```

AVIF is typically 20–30 % smaller than WebP at equal quality [estimated, well-documented
industry figure], at the cost of slower first-time optimisation — which the raised
`minimumCacheTTL` offsets. Both are verified-safe given the immutable URL scheme
[measured at `lib/actions/completions.ts:122` and `lib/actions/profile.ts:141`].

Minor: `sizes="33vw"` on the 3-column grids is generous — the grid lives inside a
`max-w-2xl` (672 px) column, so on a 1920 px viewport `33vw` = 634 px requests a 750 w
candidate for a ~215 px slot. `sizes="(min-width: 640px) 215px, 33vw"` would be accurate.

---

## 6. Fonts

**No findings.** `app/layout.tsx:7-18` uses `next/font/google` with `variable` for both
faces, `subsets: ["latin"]`, and `IBM_Plex_Mono` restricted to weights `["500","600"]`.
This self-hosts the files under `/_next/static/media/`, emits `<link rel="preload">` for the
used faces, applies `font-display: swap` and auto-generates `size-adjust` fallback metrics —
so there is no third-party connection and near-zero font-driven CLS. The `--font-*` CSS
variables are applied on `<html>` (line 75) so they are available before body paint.

The one thing to keep in mind: those font files are served from `/_next/static/media/`,
which the service worker caches cache-first — see Finding 7 for why that cache never shrinks.

---

## 7. PWA / service worker

### 7.1 Finding 7 — the asset cache grows forever

**Severity: Medium** · `public/sw.js:7, 17-24, 45-56`

```js
const CACHE_NAME = "cornice-shell-v1";              // line 7 — never changes

self.addEventListener("activate", (event) => {      // line 17
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      …
  );
});
```

Two compounding problems:

1. `CACHE_NAME` is a hardcoded literal. The `activate` handler deletes caches whose name
   *differs* from it — but since the name never changes, it never deletes anything.
2. `activate` only fires when the **bytes of `sw.js` change**. `sw.js` is a static file in
   `public/` that changes only when someone edits it. So after the first install, the
   activate handler effectively never runs again.

Meanwhile the fetch handler (lines 45-56) unconditionally adds every `/_next/static/*`
response to that one cache. Build asset paths are content-hashed, so **every deploy adds a
complete new generation of chunks** — and nothing ever removes the old ones.

**Impact** [computed]: the `mapbox-gl` chunk alone is ~504 KB gzipped, and it is
cache-first, so it lands in the cache on the first map view after every deploy. With the
framework chunks, fonts and route chunks, a realistic per-deploy footprint is ~1–2 MB
[estimated]. After 20 deploys that is 20–40 MB of dead assets. On iOS the per-origin storage
budget is comparatively tight, and when it is exceeded Safari may evict the *entire* origin's
storage — which would also take out the IndexedDB store holding downloaded offline routes
(`lib/offlineRoutes.ts`) and, in the worst case, the recorder's crash-recovery snapshot.
For an app whose selling point includes offline route access, silently losing that store is
a real failure mode.

**Fix** — version the cache per build and prune on activate:

```js
// Injected at build time; falls back so local `next start` still works.
const BUILD_ID = self.__CORNICE_BUILD_ID__ || "dev";
const CACHE_NAME = `cornice-shell-${BUILD_ID}`;
```

The existing `activate` handler then does the right thing automatically, because the name
actually changes. To make `sw.js` itself change per build, either serve it from a route
handler (`app/sw.js/route.ts`) that interpolates `process.env.VERCEL_GIT_COMMIT_SHA`, or
have a prebuild step stamp the file.

Belt-and-braces alternative if you would rather not add a build step: bound the cache
explicitly — on each `put`, read `cache.keys()` and evict the oldest entries beyond a fixed
count (say 60). Less precise, but self-limiting.

### 7.2 The offline page is never refreshed

**Severity: Low** · `public/sw.js:9, 11-15`

`PRECACHE_URLS = [OFFLINE_URL]` is fetched once at install. Because `sw.js` never changes,
the `/offline` HTML cached on a user's very first visit is the one they will see forever —
including stale `/_next/static/…` references that may no longer resolve. Fixing Finding 7.1
(a per-build cache name → a per-build install) fixes this as a side effect.

### 7.3 Otherwise the strategy is sound

Network-first for navigations with an offline fallback (lines 36-41) is the right call for an
auth'd app — it correctly avoids serving stale authenticated HTML, and the code comment says
so explicitly. Cache-first for content-hashed `/_next/static/` (lines 45-56) is safe.
`request.method !== "GET"` and cross-origin requests are skipped (lines 28-31), so Supabase
and Mapbox traffic is untouched. `app/manifest.ts` exists, so the PWA is installable.

### 7.4 Finding 16 — IndexedDB connections are never closed

**Severity: Low** · `lib/offlineRoutes.ts:43-54`

```ts
async function withStore<T>(mode, fn) {
  const db = await openDb();          // ← a fresh connection per operation
  return new Promise((resolve, reject) => { … });   // ← db.close() is never called
}
```

Every `saveOfflineRoute` / `removeOfflineRoute` / `getOfflineRoute` / `getAllOfflineRoutes`
opens a new `IDBDatabase` and leaves it open. On `OfflineRoutesList` (which deletes in a
loop) these accumulate for the lifetime of the page. Beyond the leak, open connections
**block a future `DB_VERSION` upgrade** — an `onupgradeneeded` would fire `onblocked`
instead and the migration would hang.

**Fix**: memoise a single connection promise at module scope, or `db.close()` in a `finally`.
Roughly five lines.

---

## 8. Build & config health

[measured] All clean:

- `next.config.ts` — **no** `typescript.ignoreBuildErrors`, **no** `eslint.ignoreDuringBuilds`.
- `tsconfig.json` — `"strict": true`, `isolatedModules`, `moduleResolution: "bundler"`.
- `eslint.config.mjs` — extends `core-web-vitals` **and** `typescript`; the `globalIgnores`
  list only re-states eslint-config-next's own defaults, it does not silence project code.
- `.github/workflows/ci.yml` — lint, test and build all actually run on PRs and on `main`,
  with `npm audit --audit-level=high`. Placeholder env vars are clearly labelled as such.
- `productionBrowserSourceMaps` is not enabled (no source maps shipped to browsers).
- `experimental.serverSourceMaps: true` costs build time and server bundle size only, and
  the comment justifies it.

Two small suggestions:

- `tsconfig.json` `"target": "ES2017"` is conservative for an app that requires Node ≥ 20.9
  and modern browsers (WebGL2, Wake Lock API, `<dialog>`). Raising to `ES2022` lets TS emit
  native class fields, `??=`, `.at()` etc. instead of downlevel helpers — a small but free
  bundle reduction. Verify against your browser support matrix first.
- Add a bundle-size check to CI (see §2.3).

---

## Recommended order of work

Ordered by (impact ÷ risk), not by severity alone.

**Tier 1 — one-line changes, no behavioural risk, immediate wins**

1. Finding 1 — hoist `NO_TRAIL` / `NO_TRAFFIC` to module scope in `RouteMap.tsx`. Removes
   ~4 no-op Mapbox source updates + ~2 forced repaints per second for an entire ride.
2. Finding 6 — `useMemo(() => [route], [route])` in `RouteDetailMap.tsx`. Fixes a
   user-visible camera-reset bug and a full geometry rebuild per toggle.
3. Finding 15 — add `formats` and `minimumCacheTTL` to `next.config.ts`.
4. Finding 2 (partial) — drop the follow `easeTo` duration from 800 ms to ~300 ms and add
   `essential: true`.

**Tier 2 — small, contained, high value**

5. Finding 5 — add a `cache()`-wrapped `getCurrentUser()` and use it everywhere; narrow the
   proxy matcher to exclude `api` and the metadata routes. (Protected Area — own PR.)
6. Finding 4 step 1 — replace `select("*")` in `getRoutes()` with an explicit column list.
7. Finding 8 — swap the two lightbox `<img>` tags for `next/image`.
8. Finding 11 — `next/dynamic` for `LiveTrackingForm` in `GefahrenSection`.
9. Finding 12 — `useMemo` the `ElevationProfile` geometry.
10. Finding 7 — version the service-worker cache name per build.

**Tier 3 — larger, needs design and testing**

11. Finding 3 — move the trail snapshot to chunked IndexedDB. Biggest battery/jank win on
    long rides, but it touches crash recovery, so it needs tests for the resume path.
12. Finding 9 — `<Suspense>` boundaries first (especially around the weather fetch on
    `/strecken/[id]`), then evaluate `cacheComponents: true` on a branch. **Verify the
    recording flow specifically** — `<Activity>`-based navigation changes unmount semantics
    and the recorder depends on never being unmounted mid-ride.
13. Finding 10 — paginate the profile ride list; move the profile aggregates into SQL
    (needs a migration — coordinate with the DB agent).
14. Finding 4 steps 2–3 — geometry simplification for the overview map, then move it off the
    RSC payload entirely so it can be CDN-cached.

---

## Appendix — claims I could not verify

Called out explicitly so nothing here is mistaken for a measurement.

- **No bundle sizes were measured for this app.** `npm ci` / `npm install` fail in the repo
  (`ENOTEMPTY` on `node_modules`, which the sandbox does not allow writing to), so
  `next build` never ran. Every KB figure attributed to *app* code is an estimate; the
  `mapbox-gl` and route-JSON figures are measured or computed from real files.
- **No runtime profiling.** Render counts are derived by reading the state-update sites and
  the throttle constants, not from React DevTools. Confirm with the Profiler while an
  actual ride is recording.
- **No power measurement.** The battery claims in Findings 2 and 3 are reasoned from
  "continuous WebGL repaint" and "synchronous disk IO", both well-established costs, but the
  magnitude on a specific handset is unverified.
- **Route counts in production are unknown.** The scaling arguments in Findings 4, 13 and 14
  use the 5 seeded routes as the measured baseline and `MAX_COORDINATES = 20_000` as the
  measured ceiling. Where the real data sits between them determines whether those are
  today-problems or next-year-problems.
