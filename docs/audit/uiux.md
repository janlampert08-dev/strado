# Cornice — UI/UX Audit

Read-only audit of `app/**`, `components/**`, `app/globals.css` against the Core User
Loop in `AGENTS.md`. Every finding below was verified by reading the actual source;
where a claim depends on runtime behaviour (rendered pixel heights, React 19 form
reset, real GPS) it is marked **[verify at runtime]**.

Contrast numbers are computed from the literal hex tokens in `app/globals.css`
(sRGB relative luminance, WCAG 2.1 formula); `color-mix(... , transparent)` values
are approximated as alpha-compositing over the background, which is accurate to
within a few hundredths for these ratios.

---

## Summary of the top findings

| # | Sev | Finding | Where |
|---|-----|---------|-------|
| 1 | Critical | Saving a **route** ride dead-ends: no confirmation, no link to the ride, loop step 6→7 broken | `lib/actions/completions.ts:328`, `components/LiveTrackingForm.tsx:79-89` |
| 2 | High | Light-theme `--color-muted` is **3.11:1** — the app's most-used secondary text colour fails WCAG AA | `app/globals.css:7` |
| 3 | High | `--color-danger/success/warning` are **not** redefined for dark mode → error text at 4.07:1 | `app/globals.css:21-23` vs `:56-105` |
| 4 | High | Icon-only actions (share / report / visibility / photo-delete) have **zero padding** → 14-16 px touch targets | 6 files, see §5.2 |
| 5 | High | React 19 resets uncontrolled `<form action>` fields after the action returns → typed input lost on every failed login/signup/comment | `components/AnmeldenForm.tsx:17`, `RegistrierenForm.tsx:18`, `RatingSection.tsx:46` |
| 6 | High | Photos silently dropped on a manual retry after a failed ride save | `components/MultiPhotoInput.tsx:92`, `RideSummaryForm.tsx:134` |
| 7 | High | Logged-out visitors on a route page get a dead sentence instead of a sign-in CTA — the loop's entry point | `app/strecken/[id]/page.tsx:158-162` |
| 8 | High | "Strecke beenden" / "Fahrt beenden" is a 34 px `text-sm` button, unconfirmed and irreversible, used while riding | `components/LiveTrackingForm.tsx:205`, `FreeRideForm.tsx:260` |
| 9 | Medium | Moderator actions swallow all errors and "Freischalten" has no confirmation | `lib/actions/moderation.ts:22,36`, `components/ModerationActions.tsx:15` |
| 10 | Medium | Optimistic toggles (Kudos/Folgen/Merken) revert silently on failure — no explanation | `KudosButton.tsx:23`, `FollowButton.tsx:19`, `FavoriteButton.tsx:17` |
| 11 | Medium | No `prefers-reduced-motion` handling anywhere in CSS | `app/globals.css` (absent) |
| 12 | Medium | `role="img"` wrapper hides the map's own `NavigationControl` from AT | `ExploreView.tsx:207`, `RouteDetailLayout.tsx:25`, `RouteMap.tsx:403` |

---

## 1. Core loop friction (the 8 steps)

### 1.1 [Critical] Step 6→7: a saved route ride goes nowhere

`logTrackedCompletion` inserts the row, reads `inserted.id` for `attachPhotos`, and
then throws the id away:

```ts
// lib/actions/completions.ts:310-328
.select("id").single();
...
await attachPhotos(supabase, inserted.id, user.id, uploadedUrls);
revalidatePath(...);
return { error: null };          // ← no completionId
```

Because there is no id, `LiveTrackingForm` can only call `onExit()`:

```tsx
// components/LiveTrackingForm.tsx:79-89
useEffect(() => {
  if (submitted && !pending && !state.error) { clearSnapshot(); onExit(); }
}, [...]);
```

**Consequence:** the rider taps "Fahrt speichern", the full-screen Fazit overlay
vanishes, and they are back on the route detail page they started from — no toast,
no "Fahrt gespeichert", no ride page, no share button, no kudos surface. It is
indistinguishable from a crash or a discard. Step 7 ("Community reacts") never gets
handed the ride. `logFreeRide` does this correctly (`FreeRideForm.tsx:87-100`
pushes to `/fahrten/[id]`), so the two ride types behave inconsistently for no
reason the code explains.

**Fix:** widen `CompletionFormState` to `{ error, completionId? }`, return
`inserted.id`, and in `LiveTrackingForm` `router.push('/fahrten/' + completionId)`
instead of `onExit()` — mirroring `FreeRideForm` exactly. Keep `clearSnapshot()`
before the push.

### 1.2 [High] Step 1→2 for logged-out users is a dead end

```tsx
// app/strecken/[id]/page.tsx:158-162
<p className="border-t border-border pt-6 text-sm text-muted">
  Melde dich an, um diese Strecke als gefahren einzutragen und zu bewerten.
</p>
```

Plain muted text (3.11:1, see §6.1), no link. Every shared route link — the app's
primary acquisition channel — lands anonymous visitors on a page whose main call to
action is an unclickable sentence. The `RatingSection` likewise just hides the form
(`canRate={!!user}`) with no prompt.

**Fix:** render the same-sized `accent` CTA as `GefahrenSection` but as
`<Link href={`/anmelden?next=/strecken/${id}`}>Anmelden, um zu starten</Link>`, and
add a one-line sign-in prompt above the comment list.

### 1.3 [Medium, verify at runtime] Step 1→2 on mobile: the start button is likely below the peek fold

`RouteDetailLayout` peeks the detail sheet at `SHEET_PEEK_PX = 320`
(`components/RouteDetailLayout.tsx:11`). Above `GefahrenSection` the sheet renders,
in order: drag grip (~36 px) + `pt-6` (24) + region/title/subline block (~80) +
gap (20) + optional private-route card + action-button row (~34) + gap (20) +
`border-t pt-6` (24) + the 50 px "Strecke starten" button. That is ~288-320 px
before the CTA's baseline, before the optional card. On a 667 px-tall iPhone SE the
primary action of the whole product is at best half-visible in the default state.

**Fix:** pin "Strecke starten" as a sticky footer inside the sheet (the pattern
already used in `NeueStreckeForm.tsx:374`), or raise `SHEET_PEEK_PX` and reorder so
the CTA sits directly under the title. Verify by measuring the rendered peek.

### 1.4 [Medium] Step 4: resuming an interrupted recording is silent

`useRideRecorder` restores a `localStorage` snapshot on mount with no user-visible
acknowledgement:

```ts
// components/useRideRecorder.ts:527-553
const snapshot = loadTrackingSnapshot(...);
setTimeout(() => {
  if (snapshot?.phase === "finished") { ...; setPhase("finished"); return; }
  start(snapshot?.phase === "tracking" ? snapshot : undefined);
}, 0);
```

Snapshots live up to 24 h (`lib/trackingStorage.ts:39`) and elapsed time is
recomputed from `startTimeMs` (`useRideRecorder.ts:340`). So a rider who abandoned a
recording at 09:00 and reopens the same route at 17:00 taps "Strecke starten" and is
dropped into a running recording showing **8 hours elapsed** and yesterday's trail,
with no explanation and no way to start fresh other than Beenden → Verwerfen →
start again. Conversely a genuine crash-resume gives no reassurance that the earlier
trail survived.

**Fix:** when a snapshot is found, show a short interstitial before starting:
"Unterbrochene Aufzeichnung von 09:14 gefunden — Fortsetzen / Neu starten", with the
snapshot's `savedAt`. This is exactly the case the storage layer was built for; it
just never surfaces.

### 1.5 [Medium] Step 7→8: the ride detail page has no forward exit

`app/fahrten/[id]/page.tsx` ends at the elevation profile (line 352). There is no
"Weitere Fahrten", no link to the feed, no "Diese Strecke nochmal fahren". For a
visitor arriving from a shared link the page is a cul-de-sac; for the owner it is
the last screen of the loop with nothing pointing back to step 1.

**Fix:** append a small footer — for a route ride, a link back to the route and to
`/feed`; for a free ride, `/feed` plus "Strecken in deiner Region".

### 1.6 [Low] Route rides never confirm anything to the community

Because of 1.1 there is also no share affordance immediately after a ride, only
later from `/profil` → ride page. The share button exists
(`ShareRideButton.tsx`) but is never surfaced at the moment of highest motivation.
Fixing 1.1 fixes this for free.

---

## 2. Loading, pending and double-submit

### Good
- Every `useActionState` form disables its submit button while `pending` and swaps
  the label (`Speichern…`, `Wird gesendet…`, `Löschen…`). Double-submit via the
  button is not possible in any form I read.
- `useTransition` guards every non-form mutation (`FavoriteButton`, `FollowButton`,
  `KudosButton`, `CompletionActionsMenu`, `DeleteVehicleButton`,
  `DeleteProposalButton`, `ModerationActions`, `ReportedContentActions`).
- Heavy `mapbox-gl` is `next/dynamic`-loaded with a `Skeleton` placeholder in all
  three call sites (`ExploreView.tsx:32`, `LiveTrackingForm.tsx:16`,
  `FreeRideForm.tsx:21`) — no layout shift, the skeleton fills the same box.
- `RideSummaryForm` tracks `navigator.onLine` and auto-resubmits a failed save when
  the connection returns (`RideSummaryForm.tsx:108-131`). Genuinely good for a
  mountain-pass app.

### 2.1 [Medium] `app/loading.tsx` is shaped like the explore page and used for every route

```tsx
// app/loading.tsx:5-18 — map + sidebar skeleton
<Skeleton className="h-64 shrink-0 md:order-2 md:h-auto md:flex-1" />   // "map"
```

It is the only `loading.tsx` in the app (`find app -name loading.tsx` → 1 result).
Navigating to `/profil`, `/feed`, `/leaderboards`, `/fahrten/[id]` or `/moderation`
therefore flashes a full-viewport map-and-sidebar skeleton that resolves into a
centred single-column page — a large, jarring layout shift on exactly the
navigations that involve server round-trips.

**Fix:** move the current file to `app/(explore)/loading.tsx` or scope it to `/`,
and add a generic centred-column skeleton (header bar + `max-w-2xl` stack of
`Skeleton` rows) for the content routes, plus a card-list one for `/feed`.

### 2.2 [Medium] `ShareRideButton` gives almost no pending feedback

```tsx
// components/ShareRideButton.tsx:139-144
disabled={loading}
className="shrink-0 text-muted ... disabled:opacity-50"
```

`handleShare` does a Supabase round-trip *and* renders a share image on canvas
(`renderShareImage`). On a phone that is easily a second or two, during which the
only feedback is a 16 px icon at 50 % opacity. Users will tap again (the button is
disabled, so nothing breaks — it just feels dead).

**Fix:** swap the icon for a spinner while `loading`, or add
`aria-busy={loading}` plus a visible label.

### 2.3 [Low] Inconsistent pending vocabulary

`Speichern…` / `Wird gespeichert…` / `Wird gesendet…` / `Wird gelöscht…` /
`Löschen…` / `Wird entfernt…` all coexist. `RatingSection.tsx:59-61` shows no
pending label at all (button just greys out). Pick one pattern —
`Wird <partizip>…` — and apply it everywhere including `RatingSection`.

### 2.4 [Low] `RouteActionsMenu` moderator delete shows no progress

```tsx
// components/RouteActionsMenu.tsx:183-186
onConfirm={() => { setDeleteConfirmOpen(false); startDelete(() => deleteRouteAsModerator(route.id)); }}
```

The dialog closes *before* the transition starts, and the "Wird gelöscht…" label
lives on a menu item inside the now-closed dropdown. The moderator sees nothing at
all until the server redirects. **Fix:** keep the dialog open while `deleting` (the
`pending` prop is already wired) and close it in the transition callback.

---

## 3. Error states and recovery

### Good
- `StatusPage` unifies `error.tsx` / `not-found.tsx` / `offline/page.tsx`; all copy
  is German, all offer a way out.
- The offline page explicitly reassures about an in-flight recording
  (`app/offline/page.tsx:20`) and lists IndexedDB-cached routes — a thoughtful touch.
- Every Server Action returns a specific, actionable German string; no raw Supabase
  errors leak. Rate-limit errors say what to do ("Bitte warte einen Moment").
- `useRideRecorder` distinguishes `PERMISSION_DENIED` (terminal, tells you to grant
  permission) from transient signal loss (`useRideRecorder.ts:491-499`), and clears
  a stale error as soon as a fix arrives (line 395). It also warns about a GPS gap
  after backgrounding (line 240-250) rather than letting the trail validation fail
  later. This is well above average.
- Errors are announced: 16 `role="alert"` sites, one `role="status"`.

### 3.1 [Medium] Moderator actions swallow every failure

```ts
// lib/actions/moderation.ts:16-28
export async function approveRoute(routeId: string) {
  ...
  if (!user || !(await isModerator(user.id))) return;   // silent
  await supabase.from("routes").update({...}).eq("id", routeId);   // error ignored
  revalidatePath("/moderation");
}
```

All six moderation actions return `void` and ignore the Supabase error. A revoked
moderator role, an RLS rejection or a network failure produces a button click,
a revalidation, and an unchanged list — with no message. The same is true for
`dismiss*Report` / `delete*` in `ReportedContentActions`.

**Fix:** return `{ error: string | null }` like every other action family in this
codebase and render it next to the buttons (the `ConfirmDialog` already supports an
error slot pattern — see `CompletionActionsMenu.tsx:178-182`).

### 3.2 [Medium] Optimistic toggles fail silently

```tsx
// components/KudosButton.tsx:27-33
const { ok } = await toggleKudos(completionId);
if (!ok) { setGiven(!next); setCount(c => c + (next ? -1 : 1)); }
```

Identical in `FollowButton.tsx:22-25` and `FavoriteButton.tsx:19-22`. The actions
return only `{ ok: boolean }` (`lib/actions/kudos.ts:18`, `follows.ts:14`,
`favorites.ts:10`) and collapse four distinct causes into it: not logged in, invalid
id, 500 ms cooldown hit, DB/RLS error. The user sees the heart fill and then
un-fill with no explanation — most likely reading it as a bug.

**Fix:** return a discriminated result (`{ ok: false, reason: "auth" | "cooldown" |
"error" }`) and show a one-line message; at minimum, an `aria-live` "Konnte nicht
gespeichert werden." under the button.

### 3.3 [Low] `RideVisibilityToggle` error card can be clipped

```tsx
// components/RideVisibilityToggle.tsx:53-60
<Card elevated className="absolute top-full right-0 z-10 mt-1 w-48 ...">
```

This toggle is rendered inside the profile's ride rows, which live in a
`overflow-hidden rounded-lg` list (`app/profil/page.tsx:322`). An absolutely
positioned error card on the last row will be clipped by that `overflow-hidden`.
**[verify at runtime]** — the ancestor chain suggests clipping. **Fix:** render the
error inline in the row, or use the same `Dialog` pattern as
`CompletionActionsMenu`.

### 3.4 [Low] No `global-error.tsx`

Only `app/error.tsx` exists. An error thrown in the root layout (e.g. the Supabase
client factory during `Header`'s `auth.getUser()`) escapes to Next's default
white-screen error page, in English. **Fix:** add `app/global-error.tsx` reusing
`StatusPage`.

---

## 4. Empty states

`components/ui/EmptyState.tsx` is used in 8 places (feed, profile rides, profile
favourites, vehicles, explore search, follow lists ×2, activity kudos) — good, and
three of those correctly supply an `action` link, which is exactly what an empty
state should do.

### 4.1 [Medium] Eight more empty states bypass it

| Location | Current | Should be |
|---|---|---|
| `app/leaderboards/page.tsx:32` | `<p>Noch keine Einträge.</p>` | `EmptyState icon={Trophy}` |
| `components/TrackLeaderboardChooser.tsx:75,78` | two bare `<p>` | `EmptyState` + action "Strecke fahren" |
| `app/moderation/page.tsx:58` | `<p>Keine offenen Vorschläge.</p>` | `EmptyState icon={ShieldCheck}` |
| `components/RatingSection.tsx:66` | `<p>Noch keine Kommentare.</p>` | `EmptyState icon={MessageSquare}` |
| `app/profil/einstellungen/page.tsx:143` | `<p>Noch keine Streckenvorschläge…</p>` | `EmptyState` + "Strecke vorschlagen" link |
| `app/fahrer/[id]/page.tsx:171` | `<p>Noch keine öffentlichen Fahrten.</p>` | `EmptyState` |
| `components/OfflineRoutesList.tsx:46-52` | hand-rolled icon + text (a near-copy of `EmptyState`) | `EmptyState icon={MapPin}` |
| `components/AchievementBadges.tsx:47` | `<p>Noch keine Auszeichnungen…</p>` | `EmptyState icon={Award}` |

The `OfflineRoutesList` one is a literal re-implementation (centred flex column,
muted icon, muted text) — the strongest evidence the primitive isn't reached for by
default.

### 4.2 [Low] `VehicleGrid`'s empty state has no action

`components/VehicleGrid.tsx:33` — "Noch keine Fahrzeuge hinterlegt." with no
"+ Fahrzeug hinzufügen" link, unlike its sibling empty states on the same page.
(The add link exists but sits in the section header above, easy to miss.)

---

## 5. Mobile / in-vehicle usability

### Good
- `viewport-fit=cover` + `--safe-top`/`--safe-bottom` used consistently, including
  inside the full-screen recording overlays (`LiveTrackingForm.tsx:154`,
  `FreeRideForm.tsx:224`).
- Global `main { padding-bottom: calc(4.25rem + safe-bottom) }` under `md` so the
  fixed `BottomNav` never covers content (`globals.css:171-175`), with the two
  scroll containers that aren't `<main>` opting in explicitly.
- `-webkit-tap-highlight-color: transparent` + `overscroll-behavior-y: none` on
  `body`.
- Screen Wake Lock is requested on start *and* re-requested on `visibilitychange`,
  correctly checking `sentinel.released` rather than `=== null`
  (`useRideRecorder.ts:225-254`). Failure is non-fatal (Safari).
- Live stats use `font-mono tabular-nums` at `text-xl` — digits don't jitter while
  driving.
- `BottomNav` tabs are ~59 px tall with icon + label. Fine.

### 5.1 [High] The two most safety-critical buttons are the smallest

```tsx
// components/LiveTrackingForm.tsx:205-211
<button onClick={recorder.stop} className={buttonVariants({ variant: "accent" })}>
  Strecke beenden
</button>
```

`buttonVariants` default size `md` = `px-4 py-2 text-sm` (`ui/Button.tsx:22`) → a
~34 px-tall, ~140 px-wide control. Same for "Fahrt beenden"
(`FreeRideForm.tsx:260-266`). Meanwhile the *entry* button "Strecke starten" is
`px-10 py-3.5 text-base` (~50 px, `GefahrenSection.tsx:31`). The button pressed
while wearing gloves at the side of a mountain road is half the size of the one
pressed while sitting at home.

**Fix:** add a `lg` size to `ui/Button.tsx` (`px-6 py-4 text-base`, min-height 56 px)
and use it for both stop buttons and for "Strecke starten"; make them full-width in
the recording panel.

### 5.2 [High] Icon-only buttons with zero padding

| File:line | Control | Effective target |
|---|---|---|
| `components/ShareRideButton.tsx:141-143` | Teilen | 16×16 px |
| `components/CompletionReportButton.tsx:23-25` | Fahrt melden | 16×16 px |
| `components/RatingSection.tsx:85-87` | Kommentar melden | 14×14 px |
| `components/RideVisibilityToggle.tsx:49-51` | Sichtbarkeit umschalten | 16×16 px |
| `components/CompletionPhotoGallery.tsx:109-111` | Foto entfernen | 24×24 px |
| `components/MultiPhotoInput.tsx:112-114` | Foto entfernen | 24×24 px |

The first three sit **adjacent** in the ride-detail header row with `gap-3`
(`app/fahrten/[id]/page.tsx:157`) — three sub-20 px targets 12 px apart, one of
which ("melden") is a moderation action you do not want mis-tapped. WCAG 2.5.8
requires 24 px; the platform guidance is 44 px (iOS) / 48 dp (Android).

**Fix:** give every icon-only button `p-2` (→ 32 px) or `p-2.5` (→ 36 px) plus
`-m-2` if the visual spacing must stay. `CompletionActionsMenu.tsx:106` already
does this right (`rounded-full border p-1.5`) — copy that.

### 5.3 [Medium] Stopping a recording is one unconfirmed, irreversible tap

`recorder.stop()` transitions to `finished`, releases the GPS watch and the wake
lock (`useRideRecorder.ts:285-315`). There is no "weiterfahren" from the Fazit
screen — only save or discard. A mis-tap of "Strecke beenden" at km 3 of a 20 km
pass ends the attempt; the only recovery is to discard and start over, losing the
first 3 km.

**Fix:** either confirm the stop while `elapsedSeconds` is small / the end gate
hasn't been reached, or add a "Weiter aufzeichnen" button on the Fazit screen that
re-arms the watch from the existing trail (the snapshot machinery already supports
resuming a `tracking` snapshot — `useRideRecorder.ts:337-359`).

### 5.4 [Medium] The wake-lock caveat is 12 px muted text next to the stop button

```tsx
// components/LiveTrackingForm.tsx:230-232 (and FreeRideForm.tsx:276-278)
<p className="text-xs text-muted">
  Bildschirm eingeschaltet lassen — GPS-Tracking im Browser pausiert sonst.
</p>
```

`text-xs` at 3.11:1 in light mode (§6.1), on a screen read in daylight through a
helmet visor. This is the single most important instruction in the whole recording
UI — losing it costs the ride. It also contradicts itself on devices where the wake
lock *did* succeed.

**Fix:** show it only when `wakeLock` was not acquired, at `text-sm text-foreground`
with a warning icon; drop it entirely when the sentinel is live.

### 5.5 [Medium] `DragSheet` keyboard/gesture gaps

```tsx
// components/ui/DragSheet.tsx:107-113
role="button" tabIndex={0} aria-expanded={expanded}
onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setExpanded(c => !c); }}
```

- `Space` is not `preventDefault()`-ed, so pressing it both toggles the sheet **and**
  scrolls the page behind it.
- No `Escape` to collapse.
- `aria-expanded` on a `role="button"` with no `aria-controls` gives AT no idea what
  expanded.
- The grip is the only handle; the sheet cannot be dismissed by dragging the content
  area, which is the platform-standard gesture.

**Fix:** `e.preventDefault()` in the handler, add `Escape`, add
`aria-controls`/`id` on the sheet body.

### 5.6 [Low] PWA manifest is light-mode only

`app/manifest.ts` sets `theme_color`/`background_color` to `#fafafa`. Installed on a
dark-mode phone, the splash screen and status bar are white while the app is
`#0b0b0d`. `app/layout.tsx:56-59` already does this correctly for the browser via a
`themeColor` media array; the manifest doesn't. Also no `maskable` icon purpose, so
Android will letterbox the icon.

---

## 6. Accessibility

### Good
- `Dialog` is a native `<dialog>` + `showModal()` — focus trap, `inert` background,
  `Escape` and focus restoration come from the browser, and the code documents why
  (`ui/Dialog.tsx:21-47`). Both photo lightboxes add arrow-key navigation on top and
  use `figure`/`figcaption`.
- `Switch` is a real `<input type="checkbox">` visually hidden inside a `<label>` —
  correct semantics, correct form serialisation (`ui/Switch.tsx:20`).
- All `<img>`/`<Image>` have meaningful alt text or `alt=""` for decorative previews
  (`MultiPhotoInput.tsx:107`). Every lucide icon I checked carries `aria-hidden`.
- Auth forms use wrapping `<label>`, `required`, `minLength`, and correct
  `autoComplete` (`email`, `current-password`, `new-password`, `username`).
- `aria-pressed` on the category chips, follow, kudos and offline-download toggles;
  `aria-current="page"` in `BottomNav`; `sr-only` rank text on the leaderboard medals
  (`app/leaderboards/page.tsx:47`).
- `CountUp` respects `prefers-reduced-motion` (`CountUp.tsx:9`).

### 6.1 [High] Light-theme muted text fails WCAG AA

```css
/* app/globals.css:7 */
--color-muted: #8a8f98;
```

| Pair | Ratio | AA (4.5) |
|---|---|---|
| muted on `--color-background` `#fafafa` | **3.11 : 1** | ✗ |
| muted on `--color-surface` (`≈#f3f3f3`) | **2.93 : 1** | ✗ |
| muted (dark) `#8f95a3` on `#0b0b0d` | 6.55 : 1 | ✓ |

`text-muted` is the app's default secondary text: every `dt` label in every stat
grid, every date, every hint, every empty-state string, the explore location error,
the "Fahre zum Startpunkt" guidance, the wake-lock warning — nearly all at
`text-xs`/`text-sm`, so the 3:1 large-text exemption does not apply.

**Fix:** darken the light-mode token to roughly `#5f646d` (≈ 5.3:1 on `#fafafa`,
≈ 5.0:1 on surface). The dark-mode value already passes and needs no change.

### 6.2 [High] Status colours are never redefined for dark mode

`--color-danger/success/warning` are declared once at `globals.css:21-23` and are
absent from both the `@media (prefers-color-scheme: dark)` block (`:56-78`) and the
`:root[data-theme="dark"]` block (`:85-105`).

| Token | on dark `#0b0b0d` | AA |
|---|---|---|
| `--color-danger` `#dc2626` | **4.07 : 1** | ✗ |
| `--color-success` `#1a7f37` | **3.87 : 1** | ✗ |
| `--color-warning` `#b45309` | **3.92 : 1** | ✗ |

Every `role="alert"` error message in the app renders in `text-danger text-sm`. In
dark mode — which is what a rider uses at dusk — form errors are below AA. The
`danger` *button* variant (`ui/Button.tsx:17`, `bg-danger text-background`) has the
same problem for its label.

**Fix:** add dark overrides, e.g. `--color-danger:#f87171` (≈ 7.5:1),
`--color-success:#4ade80`, `--color-warning:#fbbf24`. The file's own comment says
"ein Redefinieren hier genügt für die ganze App" — these three were simply missed.

### 6.3 [Medium] Non-text contrast: borders at 1.3:1

`--color-border` = 12 % (light) / 14 % (dark) of the foreground → **≈1.29:1** and
**≈1.39:1** against the background. WCAG 1.4.11 requires 3:1 for the boundary of a
UI component. This affects:

- `fieldClassName` (`ui/Input.tsx:12`) — every text input, textarea and select
  boundary. Inputs are effectively invisible until focused.
- `Button variant="secondary"` (`ui/Button.tsx:15`) — the outline *is* the button.
- `Switch`'s off state (`ui/Switch.tsx:23`, `bg-border`) — an unchecked toggle is
  nearly indistinguishable from the card behind it.
- `EmptyState`'s dashed border.

**Fix:** introduce `--color-border-interactive` at ~30-35 % (the existing
`--color-border-strong` is 30 % → ≈2.6:1, still short; ~40 % gets to 3:1) and use it
for input/button/switch boundaries, keeping the hairline `--color-border` for
purely decorative dividers.

### 6.4 [Medium] No `prefers-reduced-motion` support in CSS

`grep -r "prefers-reduced-motion"` finds exactly one hit, in `CountUp.tsx`. Nothing
in `globals.css`. Unmitigated motion includes: `animate-pulse` on every `Skeleton`,
`active:scale-95` on every button, `transition-[height]` on the drag sheet,
`group-open:rotate-180` chevrons, and the map's `easeTo` pitch/bearing animations
(`RouteMap.tsx:800-803`, an 800 ms 3-D tilt).

**Fix:** add the standard block to `globals.css`:

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

and gate the `easeTo` calls in `RouteMap` on `matchMedia`.

### 6.5 [Medium] `role="img"` on the map hides its controls from AT

```tsx
// components/ExploreView.tsx:207-211  (and RouteDetailLayout.tsx:25-29)
<div className="absolute inset-0 ..." role="img"
     aria-label="Kartenansicht der Strecken — die vollständige Liste steht in der Seitenleiste.">
  <RouteMap ... />
```

`role="img"` prunes all descendants from the accessibility tree. `RouteMap` adds a
`NavigationControl` (`RouteMap.tsx:403`) whose zoom buttons are real, keyboard-
focusable `<button>`s — they become unreachable/unlabelled for screen-reader users
while remaining in the tab order (a focusable element inside a `role="img"` is a
known conflict). The text alternative is a good idea; the role is the wrong vehicle.

**Fix:** drop `role="img"` and instead put the alternative in a `<p className="sr-only">`
sibling, or wrap only the canvas (not the control container) — the simplest correct
option is `aria-hidden` on the canvas element plus an sr-only description.

Related: `NeueStreckeForm.tsx:139-142` puts an `aria-label` on a bare `<div>` with no
role — that label is silently ignored by AT.

### 6.6 [Medium] `ThemeToggle` is a radiogroup without radiogroup keyboard behaviour

```tsx
// components/ThemeToggle.tsx:75-92
<div role="radiogroup" aria-label="Farbschema">
  <button role="radio" aria-checked={...} />   // ×3
```

All three are in the tab order and arrow keys do nothing. A `radiogroup` must
implement roving `tabIndex` (only the checked radio tabbable) and Left/Right/Up/Down
selection.

**Fix:** either implement roving tabindex + arrow handling, or drop the ARIA and use
three plain toggle buttons with `aria-pressed` — the pattern already used for the
Privat/Öffentlich segmented control in `RideSummaryForm.tsx:286-311`.

### 6.7 [Medium] Placeholder-only form controls

No `<label>`, no `aria-label`:

| File:line | Control |
|---|---|
| `components/ExploreSidebar.tsx:81-87` | route search — the app's main search box |
| `components/ProfileSearch.tsx:61-68` | user search |
| `components/RideSummaryForm.tsx:157-169` | vehicle `<select>` (only an `<h3>` above) |
| `components/RideSummaryForm.tsx:188-227` | inline Typ/Getriebe selects, Marke, Modell, Baujahr |
| `components/RatingSection.tsx:47-53` | comment textarea |
| `components/TrackLeaderboardChooser.tsx:57-70` | route `<select>` |

Placeholders vanish on input and are not a reliable accessible name.
**Fix:** add `aria-label` at minimum; prefer real labels (the app already does this
well in `AdvancedFiltersPanel`, `VisibilitySettings`, all auth forms).

### 6.8 [Medium] Dropdown menus lack Escape and focus management

`RouteActionsMenu.tsx:44-53` and `CompletionActionsMenu.tsx:56-65` both:
- close only on `mousedown` outside — no `Escape`, no close on scroll or focus-out;
- never move focus into the panel on open, nor restore it on close;
- expose `aria-expanded` but no `aria-haspopup`, no `role="menu"/"menuitem"`, no
  arrow-key traversal.

A keyboard user can Tab into the items (they follow in DOM order) but cannot dismiss
the menu without clicking. **Fix:** add a `keydown` listener for `Escape` that
closes and returns focus to the trigger, and add `aria-haspopup="menu"`.

### 6.9 [Medium] No live region for search/filter results

`ExploreSidebar` re-renders the route list on every keystroke and filter chip tap
(`ExploreSidebar.tsx:156-262`) with no result count and no `aria-live`. A screen
reader user gets no feedback that "12 Strecken" became "0 Strecken". Same in
`ProfileSearch` (`:71-91`).

**Fix:** add `<p aria-live="polite" className="sr-only">{routes.length} Strecken
gefunden</p>`; a visible count would help sighted users too (currently the only
signal that a filter did anything is the list changing length).

### 6.10 [Low] `ActivityHeatmap` is `title`-only

`components/ActivityHeatmap.tsx:31` — each 10×10 px cell carries a native `title`.
Touch devices never show it, and screen readers get 365 unlabelled divs.
**Fix:** `role="img"` with a summarising `aria-label` on the grid ("Aktivität der
letzten 52 Wochen: 34 Fahrten"), and make the cells `aria-hidden`.

### 6.11 [Low] No skip link

`app/layout.tsx` renders `{children}` directly; `Header` is re-rendered per page and
there is no "Zum Inhalt springen" link. With `BottomNav` plus the header nav, a
keyboard user tabs through 6-8 links on every page before reaching content.

---

## 7. Consistency

### Good
- `components/ui/*` (Button, Card, Input, Dialog, DragSheet, EmptyState, Skeleton,
  StatusPage, Switch) is genuinely adopted: 56 of ~100 files import from it, and
  `buttonVariants()`/`fieldClassName()` let links and native `<select>`s share the
  same styling without duplicate components. This is much better than typical.
- Design tokens are centralised and the file documents *why* each exists; the
  comments explicitly call out the ad-hoc opacity ladders they replaced.
- `lib/nav.ts` is a single source for header and bottom nav.
- Bento stat grids, `font-mono tabular-nums` for all numerics, and the
  `SectionSummary`/`<details>` pattern repeat coherently across profile, route and
  ride pages.

### 7.1 [Medium] Two different "more actions" triggers

`RouteActionsMenu.tsx:100` renders a literal `⋮` text glyph in a `rounded-lg px-3 py-1.5`
button; `CompletionActionsMenu.tsx:106-108` renders a lucide `MoreHorizontal` in a
`rounded-full p-1.5` button. Same affordance, same `aria-label="Weitere Aktionen"`,
two visual languages — and the text glyph will render differently per platform font.

### 7.2 [Medium] Three hand-rolled segmented controls

The Privat/Öffentlich pair is re-implemented with slightly different classes in
`RideSummaryForm.tsx:285-312`, `NeueStreckeForm.tsx:334-359` (plus a Ja/Nein
Rundfahrt pair at `:187-210`) and echoed by `ThemeToggle.tsx:76-92`
(`rounded-lg` vs `rounded-full`, `px-3 py-1.5` vs `px-3 py-2`). Extract a
`ui/SegmentedControl` — the comment in `ThemeToggle.tsx:58-60` already claims they
are "gleiche Optik", which they aren't.

### 7.3 [Low] Ad-hoc field styling in a dialog

`CompletionActionsMenu.tsx:211` writes its own textarea classes
(`rounded-md border-border bg-background ... focus-visible:ring-accent/40`) instead
of `fieldClassName()`, giving it a different radius and focus ring from every other
textarea in the app.

### 7.4 [Low] `Card`'s `p-0` override

`app/profil/einstellungen/page.tsx:177` passes `p-0` to `Card`, which has no default
padding — harmless but a sign the padding contract isn't clear. Consider a
`padded` prop.

---

## 8. Destructive actions

### Good — nearly everything is confirmed
| Action | Confirmation | Copy quality |
|---|---|---|
| Konto löschen | `Dialog` + password re-auth | Explains anonymisation, what survives, irreversibility (`DeleteAccountSection.tsx:26-31`) |
| Fahrt löschen | `Dialog` | Names photos, kudos, GPS track (`CompletionActionsMenu.tsx:170-173`) |
| Fahrzeug entfernen | `ConfirmDialog` | ✓ |
| Vorschlag löschen | `ConfirmDialog` | ✓ |
| Strecke löschen (Mod) | `ConfirmDialog` | Names the route (`RouteActionsMenu.tsx:178`) |
| Route zurücksetzen (Wegpunkte) | `ConfirmDialog` | ✓ |
| Fahrt verwerfen | `ConfirmDialog` | "noch nicht gespeichert … endgültig verloren" (`RideSummaryForm.tsx:361-363`) |
| Meldung → löschen/verbergen | `ConfirmDialog` | ✓, and "verbergen" for rides rather than delete — a good product call |

### 8.1 [Medium] Photo deletion has no confirmation

```tsx
// components/CompletionPhotoGallery.tsx:105-112
<button onClick={() => handleRemove(photo.id)} aria-label="Foto entfernen" className="... h-6 w-6 ...">
```

`removeCompletionPhoto` deletes the row and the storage object permanently. A 24 px
button overlapping the photo thumbnail, one tap, no confirm, no undo — and it is the
only unconfirmed destructive action in the app. The optimistic revert on failure is
handled well (`:71-80`), which makes the missing confirm stand out more.

**Fix:** wrap in `ConfirmDialog` like every sibling, or add an undo window.

### 8.2 [Medium] "Freischalten" publishes with no confirmation

`ModerationActions.tsx:15-21`: approving makes a user's route visible to everyone
and revalidates `/`. Rejecting — the *less* consequential direction — is confirmed.
The asymmetry invites accidental publication, and combined with §3.1 the moderator
gets no feedback either way.

### 8.3 [Low] Discarding a ride from the tracking screen skips the confirm

`LiveTrackingForm.tsx:214-220` — while `!hasStarted`, "Abbrechen" calls `handleExit`
→ `discard()` immediately, clearing the snapshot. Nothing has been recorded yet so
the loss is small, but if a resumed snapshot was loaded (§1.4) this silently
destroys an earlier trail.

---

## 9. Forms

### Good
- All server-side validation returns specific German messages with limits spelled
  out (`Marke und Modell dürfen höchstens N Zeichen…`).
- Live character counters on every length-limited field, with matching `maxLength`
  (`RideSummaryForm.tsx:265`, `FreeRideForm.tsx:185`, `CompletionActionsMenu.tsx:200`).
- `AdvancedFiltersPanel` sets `inputMode="numeric"` on all four number fields
  (`:48,58,70,82`) — the only place that does, and the right thing.
- `NeueStreckeForm` is a genuinely well-designed progressive form: numbered steps,
  fields revealed as they become meaningful, live route length and reverse-geocoded
  start/end preview before submit, sticky submit button, submit disabled until a
  road route resolves.
- `Input` auto-adds a labelled show/hide toggle for every password field.

### 9.1 [High, verify at runtime] Failed submits wipe uncontrolled fields

React 19 resets uncontrolled fields of a `<form action={fn}>` once the action
resolves — including when it resolves with an error. None of these forms
re-populate from state:

| File:line | Fields lost on error |
|---|---|
| `components/AnmeldenForm.tsx:17-25` | email + password on every wrong password |
| `components/RegistrierenForm.tsx:18-43` | username, email, password — on "Benutzername bereits vergeben", the user retypes everything |
| `components/PasswortAendernForm.tsx:16-26` | new password |
| `components/RatingSection.tsx:46-53` | the whole comment (`defaultValue` restores the *previous saved* text, not what was typed) |
| `components/NeueStreckeForm.tsx:330` | `charakter_text` (name/tags/waypoints are controlled and survive) |
| `components/NeuesFahrzeugForm.tsx:16-43` | Marke, Modell, Baujahr |
| `components/EditRouteForm.tsx:46,58` | reverts to the original `defaultValue`, discarding edits |

The signup case is the worst: a rate-limit or duplicate-username error costs the
user all three fields plus their password.

**Fix:** return the submitted values in the action state and feed them back as
`defaultValue`, or make the fields controlled (as `NeueStreckeForm` already does for
`name`). Verify the reset behaviour in the browser first — it is the documented
React 19 behaviour but worth a 30-second check.

### 9.2 [High] Selected photos are silently dropped on retry

`MultiPhotoInput` keeps previews in React state but the actual `File`s only in a
hidden `<input type="file">` synced via `DataTransfer` (`:44-48, 92-101`). A form
reset (see 9.1) clears `input.files` while `entries` — and therefore the visible
thumbnails — remain. The user sees their six photos, taps "Fahrt speichern" again,
and the ride saves with zero photos and no warning.

(The offline auto-retry path is safe: it replays `lastSubmitFormDataRef`, a snapshot
taken in `onSubmit` that still holds the files — `RideSummaryForm.tsx:136-142`.)

**Fix:** re-sync the input from `entries` after the action settles
(`useEffect(() => syncInputFiles(entries), [pending])`), or upload photos through a
separate action and submit only URLs.

### 9.3 [Medium] Missing mobile input attributes

- `RideSummaryForm.tsx:219-227` — Baujahr is `type="number"` without
  `inputMode="numeric"`; Marke/Modell (`:205-218`) have no `autoComplete`,
  `autoCapitalize="words"` or `enterKeyHint`.
- `NeuesFahrzeugForm.tsx:42` — same for Baujahr.
- `ExploreSidebar.tsx:81` / `ProfileSearch.tsx:61` — `type="search"` but no
  `enterKeyHint="search"`, no `autoComplete="off"`, no `autoCorrect="off"`
  (Swiss place names get autocorrected).
- `FreeRideForm.tsx:189-198` — ride title has no `autoCapitalize="sentences"`.

### 9.4 [Medium] Validation is submit-only

No form validates inline. `RegistrierenForm` relies on `minLength={8}` for the
browser bubble, then on a server round-trip for everything else; the "Benutzername
bereits vergeben" check can only fail after submit. `NeueStreckeForm` disables
submit until a route resolves but never says *why* it's disabled
(`:380`, `disabled={pending || !activeDirections}`).

**Fix:** at minimum add helper text under the password field ("mindestens 8
Zeichen") and a reason next to the disabled submit button.

### 9.5 [Medium] `autoFocus` on the route name field fights the map on mobile

`NeueStreckeForm.tsx:293` sets `autoFocus` on the Name input, which appears the
instant the second waypoint lands. On a phone that pops the on-screen keyboard over
the map mid-drawing, right when the user is still tapping waypoints.

**Fix:** drop `autoFocus` on touch (`matchMedia("(pointer: coarse)")`) or scroll the
step into view instead of focusing it.

### 9.6 [Low] `RatingSection` gives no success feedback

`:46-62` — on success the action returns `{ error: null }`, the page revalidates,
and the button label flips from "Kommentieren" to "Kommentar aktualisieren". No
confirmation message. `VisibilitySettings.tsx:116-119` does this right with a
`role="status"` "Gespeichert." — reuse that.

---

## 10. Language consistency

Overall the German is consistent, idiomatic Swiss-flavoured (`ss` for `ß`,
`de-CH` locale for all dates and numbers) and the informal *du* is used throughout
without a single *Sie* slip. Domain terms are stable: Strecke, Fahrt, freie Fahrt,
Fazit, Wegpunkt, Bestenlisten, Deckungsgrad/Streckenabdeckung, Kudos.

### 10.1 [Medium] "Offline download"

```tsx
// components/OfflineRouteButton.tsx:67
{saved ? "Offline entfernen" : "Offline download"}
```

The only English word in the user-facing UI, and it is inconsistent with its own
paired label. **Fix:** "Offline speichern" (paired with "Offline entfernen"), or
"Offline verfügbar machen".

### 10.2 [Low] Two names for the same concept

"Streckenabdeckung" (`app/fahrten/[id]/page.tsx:273`) vs "Deckungsgrad"
(comments and `LiveTrackingForm.tsx:289` prose: "deckt nur X% der offiziellen
Strecke ab") vs "abdeckung_prozent". Pick one user-facing term.

Similarly "Getrackte Fahrten" (`app/profil/page.tsx:311`) vs "Geteilte Fahrten"
(`app/fahrer/[id]/page.tsx:168`) vs "Meine Fahrten" (`:305`) for overlapping sets —
defensible, but a first-time user has to work it out.

### 10.3 [Low] Dead premium copy

`app/profil/premium/page.tsx` and `components/PremiumCard.tsx` are entirely
commented out; `PremiumPurchaseView`, `PremiumCheckoutForm` and
`lib/actions/billing.ts` remain live and reachable only by direct URL. Out of scope
to fix here, but the "Premium" concept still appears in `VisibilitySettings.tsx:108`
comments and in `types/database.ts` — worth a decision.

---

## 11. What is genuinely good

Worth preserving through any refactor:

1. **Server-derived ride stats.** `RideSummaryForm` submits only the raw trail; every
   number is recomputed server-side (`lib/actions/completions.ts:52-83`). The UI
   never lies about what was recorded, and the hidden-field comment says so.
2. **Crash resilience of the recorder.** Throttled snapshots (10 s), a 24 h TTL, a
   user-scoped storage key that prevents one rider resuming another's trail on a
   shared phone, and legacy-key purging (`lib/trackingStorage.ts:18-94`). Very few
   apps of this size get this right.
3. **GPS honesty.** Accuracy filtering for distance but not for the marker, a
   distinct terminal message for `PERMISSION_DENIED`, automatic clearing of transient
   errors, and a proactive warning about background GPS gaps before the user finds
   out at save time (`useRideRecorder.ts:227-250`).
4. **Offline-aware saving.** Online/offline listeners, an honest "wird automatisch
   übertragen" message, and an automatic replay of the exact `FormData` when the
   connection returns.
5. **Native `<dialog>` instead of a modal library**, with a comment explaining the
   Safari focus/scroll workaround. Escape, focus trap, focus restore and background
   `inert` all come free and correct.
6. **URL as the source of truth for explore filters** (`ExploreView.tsx:59-102`) —
   shareable, survives back/forward and reload, debounced writes, and it handles the
   external-change case with the documented "adjust state during render" pattern.
7. **The design-token layer.** One border token, one surface token, semantic status
   colours, fluid `--text-display`/`--text-title`, and dark mode achieved purely by
   redefining variables so no component carries `dark:` classes. The three
   status-colour omissions (§6.2) are the exception that proves the system works.
8. **Confirmation discipline** on destructive actions, with copy that says what is
   lost rather than "Are you sure?".
9. **The route proposal flow** — progressive disclosure with a real step indicator,
   live routing feedback, geocoded preview, and a sticky submit.
10. **Code comments that explain intent**, including the UX trade-off behind each
    decision. They made this audit possible without running the app, and several
    findings above are simply cases where the comment's stated goal isn't fully met.

---

## Suggested order of work

1. §1.1 route-ride dead end (Critical, small diff, biggest loop impact)
2. §6.1 + §6.2 contrast tokens (two CSS blocks, app-wide effect)
3. §9.1 + §9.2 form reset / lost photos (data loss)
4. §5.1 + §5.2 touch targets (one `lg` size + `p-2` on six buttons)
5. §1.2 logged-out CTA
6. §3.1 + §3.2 silent failures
7. §6.4 reduced motion, §6.7 labels, §6.5 map role (quick a11y wins)
8. §2.1 loading skeletons, §4.1 empty-state consolidation, §10.1 wording
