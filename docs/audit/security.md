# Cornice — Application Security Audit

**Scope:** read-only review of `/home/user/strado` @ `330ed1d` (main).
**Method:** static reading of every file in scope, traced end to end (Server Action → RPC/PostgREST → RLS policy / trigger / grant). **No SQL was executed, no MCP tool was pointed at a live Supabase/Stripe/Vercel project**, so every claim about the *live* database state is an inference from `supabase/migrations/**` and is marked where it matters.
**Reference docs read first:** `AGENTS.md`, `SECURITY.md`.

---

## Executive summary

This is an unusually well-defended codebase for its size. Authorization is layered (app check + `.eq("user_id", …)` + RLS + column grants + triggers), `getUser()` is used everywhere instead of `getSession()` (57 call sites, zero `getSession()`), the Stripe webhook verifies signatures and deduplicates events, the service-role client has exactly three justified call sites, and the migration history shows the team repeatedly finding and closing its own holes (0023, 0027, 0033, 0034, 0038, 0040, 0049, 0052).

The findings below are concentrated in one structural gap and a handful of smaller issues:

| # | Severity | Title |
|---|----------|-------|
| 1 | **High** | Ride statistics are not validated server-side — leaderboards forgeable via direct PostgREST insert |
| 2 | **Medium** | Password change requires no re-authentication (session compromise → permanent takeover) |
| 3 | **Medium** | `getOrigin()` trusts `X-Forwarded-Host` → auth-email link poisoning |
| 4 | **Medium** | Auth rate limiting is in-memory + IP-header-derived (per-instance, spoofable off-Vercel) |
| 5 | **Medium** | Retired webhook secret still in plaintext in a committed migration |
| 6 | **Low** | No security headers / CSP |
| 7 | **Low** | Stripe webhook marks events processed before side effects succeed; price not checked |
| 8 | **Low** | `fahrzeug_id` ownership never verified |
| 9 | **Low** | Storage object keys use the unsanitised client filename extension |
| 10 | **Low** | `parseTrail()` accepts non-finite / out-of-range coordinates |
| 11 | **Low** | `updateRoute()` has no length caps (unlike `proposeRoute()`) |
| 12 | **Low** | Stripe customer creation race; `siteUrl()` falls back to `localhost` |
| 13 | **Info** | Duplicate migration numbers |
| 14 | **Info** | Unauthenticated `POST /auth/abmelden` (forced-logout CSRF) |
| 15 | **Info** | `NEXT_PUBLIC_MAPBOX_TOKEN` also used server-side |

**Nothing was found in these categories:** open redirect, IDOR on any Server Action, RLS bypass reachable from a user-controlled path, secret leaked into a client bundle, SSRF, XSS, SQL/PostgREST filter injection, private-route or private-ride disclosure. Details in *What is done well*.

---

## Findings

### 1. High — Ride statistics are not validated server-side; leaderboards are forgeable

**Files**
- `lib/actions/completions.ts:91-107` (`implausibilityReason`), `:247-259`, `:497-504` — all plausibility rules live in TypeScript
- `supabase/migrations/0052_streckenabdeckung_serverseitig_erzwingen.sql:163-213` — the only server-side backstop
- `supabase/migrations/0052_…:172-174` — `if new.art <> 'strecke' then return new; end if;`
- `supabase/migrations/0044_freie_fahrten.sql:23-30, 54-62` — columns added with **no** numeric CHECK constraints
- `supabase/migrations/0056_freie_fahrten_in_bestenlisten.sql:22-77` — `leaderboard_completions` / `leaderboard_user_totals`
- `supabase/migrations/0046_fahrt_meldungen.sql:77-78` — only `UPDATE` was revoked on `route_completions`; `INSERT` was not

**Traced path.** Migration 0052 explicitly closes CWE-602 for **one** field: it recomputes `abdeckung_prozent` from the stored `track` and clamps `ist_oeffentlich`. It does so only for `art = 'strecke'` and only for that one field. Every other number that feeds a leaderboard is written verbatim from the insert:

- `distanz_km`, `dauer_sekunden`, `bewegte_zeit_sekunden`, `hoehenmeter_aufstieg` — never recomputed, no CHECK constraint (`grep -n "check" 0001/0008/0019/0044/0056` returns only `art`, `titel` length, and `abdeckung_prozent` range).
- `MAX_PLAUSIBLE_KMH`, `MAX_RIDE_SECONDS`, `MAX_JUMP_KM`, `MIN_TRAIL_POINTS`, `MAX_TRAIL_POINTS`, `publicationBlockReason()` are **all** TypeScript-only. Anything that does not go through `logTrackedCompletion`/`logFreeRide` skips them entirely.
- RLS on `route_completions` is `for all using (auth.uid() = user_id) with check (auth.uid() = user_id)` (`0001_init.sql:184`, tightened in `0027:78-80`). It authorises the *row owner*, not the *values*.
- `0046` revoked table-level `UPDATE` and re-granted three columns. It did **not** revoke `INSERT`, so the Supabase default table grant on `INSERT` for `authenticated` should still stand. *(Inference — not verified against the live DB, since this audit ran no SQL. This is the one link in the chain worth confirming with `information_schema.role_table_grants`.)*

**What an attacker can concretely do.** Any signed-up user, with their own JWT and the public publishable key, POSTs straight to `/rest/v1/route_completions`:

- *Free ride* — `{art:'frei', route_id:null, abdeckung_prozent:null, ist_oeffentlich:true, distanz_km:999999, hoehenmeter_aufstieg:999999, dauer_sekunden:60}`. The coverage trigger returns early on line 172 because `art <> 'strecke'`. `track` is nullable, so no geometry is even needed. The row lands in `leaderboard_completions` (0056 accepts `art='frei' and route_id is null`) and `leaderboard_user_totals` sums it → permanent #1 on "meiste km", "meiste Höhenmeter" and "meiste Fahrten".
- *Route ride* — fetch the exact route geometry from the **public, unauthenticated** `GET /api/strecken/{id}` (`app/api/strecken/[id]/route.ts:37` returns `geometry`), replay it as a `track` LINESTRING, and set `dauer_sekunden: 1`. The 0052 trigger recomputes coverage → 100 % → `ist_oeffentlich` stays true. `route_leaderboard` (`0027:165-178`) orders on the raw `dauer_sekunden` → a one-second Albispass at the top of the per-route leaderboard.

Impact is integrity/abuse, not confidentiality — but leaderboards are steps 5–8 of the Core User Loop in `AGENTS.md`, and 0052 shows the project already treats exactly this class as a security bug.

**Recommended fix.** Extend the existing trigger rather than adding a new mechanism:
1. Drop the `art <> 'strecke'` early return; validate both ride kinds.
2. Recompute `distanz_km` and `dauer_sekunden` from the stored `track` (`ST_Length`) instead of trusting the payload, or at minimum add CHECK constraints mirroring the TS rules (`distanz_km > 0`, `dauer_sekunden between 1 and 43200`, `distanz_km/(dauer_sekunden/3600.0) <= 200`, `hoehenmeter_aufstieg between 0 and <sane cap>`).
3. For `art='frei'`, require `track is not null` when `ist_oeffentlich`, and enforce `MIN_PUBLIC_DISTANCE_KM` / `MIN_PUBLIC_MOVING_SECONDS` in SQL.
4. Consider `revoke insert on public.route_completions from anon, authenticated` and routing every write through `save_free_ride_with_segments` / a sibling RPC, so the app is the only insert path.

---

### 2. Medium — Password change requires no re-authentication

**Files:** `lib/actions/auth.ts:195-214` (`updatePassword`), `app/profil/passwort-aendern/page.tsx:8-17`, contrast with `lib/actions/auth.ts:229-278` (`deleteAccount`).

**Traced path.** `/profil/passwort-aendern` gates on `getUser()` only — it is reachable by *any* logged-in user, not just someone arriving from a reset link (the page comment assumes the reset flow, but nothing enforces it). `updatePassword` then calls `supabase.auth.updateUser({ password })` with no current-password check and no recency check on the session.

By contrast `deleteAccount` (line 243) *does* re-authenticate with `signInWithPassword` before the irreversible action, and its comment explains exactly why ("eine unbeaufsichtigt offene Sitzung … geteiltes Gerät, vergessene Abmeldung"). That same reasoning applies more strongly to a password change, which is *how you make a session compromise permanent*.

**What an attacker can concretely do.** Anyone with momentary access to a live session — borrowed/unlocked device, stolen cookie, a future XSS — sets a new password, locking the legitimate owner out and surviving cookie expiry. No knowledge of the old password required.

**Fix.** Require the current password in the change form and re-authenticate before `updateUser` (reuse the `deleteAccount` pattern), *except* when the session came from a recovery link. Enable Supabase Auth's "Secure password change" (requires recent reauth) as the backstop, and revoke other sessions on change.

---

### 3. Medium — `getOrigin()` trusts `X-Forwarded-Host` → auth-email link poisoning

**File:** `lib/utils/url.ts:6-11`; consumers `lib/actions/auth.ts:114-121` (`signUp` → `emailRedirectTo`) and `lib/actions/auth.ts:175-182` (`requestPasswordReset` → `redirectTo`).

```ts
const host = headerList.get("x-forwarded-host") ?? headerList.get("host");
const protocol = headerList.get("x-forwarded-proto") ?? "http";
return `${protocol}://${host}`;
```

Both headers are attacker-controllable on the wire; neither is validated against an allow-list. An attacker triggers a password reset for a victim's address while sending `X-Forwarded-Host: evil.example`, and the `redirectTo` embedded in the Supabase email points at their host — if the token lands there, it is a full account takeover.

**Mitigating factor I could not verify:** Supabase rejects `redirectTo` values that do not match the project's *Redirect URLs* allow-list and falls back to the Site URL. That allow-list lives in the Supabase dashboard, which this read-only audit did not query. **The exposure therefore depends entirely on that configuration** — and a wildcard entry such as `https://*.vercel.app/**`, which preview deployments commonly need, would make it exploitable. Note also the `"http"` protocol default, which would downgrade the link if `x-forwarded-proto` were absent.

**Fix.** Validate the derived host against an allow-list (or just use `NEXT_PUBLIC_SITE_URL`, which already exists in `.env.local.example:27` and is used by `lib/actions/billing.ts:147`), default the protocol to `https` outside development, and independently confirm the Supabase Redirect URLs list contains no wildcards.

---

### 4. Medium — Auth rate limiting is in-memory and IP-header-derived

**File:** `lib/rateLimit.ts:39-72`; consumers `lib/actions/auth.ts:42-48` (sign-in), `:92` (sign-up), `:165-169` (password reset), and the three `app/api/strecken/**` handlers.

Two independent weaknesses, both acknowledged in the module comment but worth stating as findings because they gate *authentication*:

1. **Per-instance state.** `hitLog` is a module-level `Map`. On Vercel each serverless instance has its own copy and cold starts reset it. The "5 sign-in attempts per email per 5 minutes" limit is really "5 attempts *per warm instance*" — an attacker who spreads requests, or simply keeps going while the platform scales out, gets a large multiple of the intended budget. Same for the 3-per-10-min password-reset-email cap, which is the control preventing mailbox flooding of an arbitrary address.
2. **Spoofable key.** `getClientIp` (`:68-72`) takes the *first* value of `X-Forwarded-For`. On Vercel that header is normalised by the platform, so this is fine today; on any other host, or behind an additional proxy, a client-supplied `X-Forwarded-For: 1.2.3.4` rotates the rate-limit key at will and defeats the IP limits completely.

**Fix.** Move the auth limits to shared, durable state (a small Postgres table with the same atomic-trigger pattern already used for `enforce_completion_cooldown`, or Upstash/Vercel KV). Take the client IP from a platform-trusted source and, if the header must be used, read the *right-most* untrusted hop rather than the first. Keep the in-memory limiter only as a cheap first hurdle for the public read APIs.

---

### 5. Medium — Retired webhook secret still in plaintext in a committed migration

**File:** `supabase/migrations/0022_stripe_billing.sql:27` — a 64-hex-character literal is compared inside `set_premium_status`.

The function was dropped in `0023_remove_set_premium_status_rpc.sql`, no code references `INTERNAL_WEBHOOK_SECRET` or `set_premium_status` any more (verified by grep), and 0023's own header states the value is compromised. So this is *handled* — but the literal is still in the working tree and in Git history, which is a live violation of Core Rule 4 and of the Credential Handling section of `SECURITY.md`. (Per `AGENTS.md`, the value is deliberately not reproduced anywhere in this report.)

**Fix.** Confirm the credential was actually removed from every `.env`/platform secret store (it is no longer needed at all). Because Core Rule 9 forbids editing an applied migration, do **not** rewrite 0022 in place — either accept it as a documented, dead credential and note it in `SECURITY.md`, or perform a deliberate history purge with the owner's sign-off, as `SECURITY.md` already prescribes.

---

### 6. Low — No security headers / CSP

**File:** `next.config.ts` — no `headers()` function; `proxy.ts:4-6` passes the response straight through from `updateSession`.

The app ships without `Content-Security-Policy`, `X-Frame-Options` / `frame-ancestors`, `Referrer-Policy`, `X-Content-Type-Options`, `Strict-Transport-Security` or `Permissions-Policy`. There is one inline `<script dangerouslySetInnerHTML>` (`app/layout.tsx:78`, a static theme-init constant from `lib/theme.ts` — no user data, safe), which a CSP would need a nonce or hash for.

No XSS was found in this review, so this is defence-in-depth — but it is also the cheapest control here, and `frame-ancestors 'none'` in particular closes clickjacking against the destructive flows (`DeleteAccountSection`, `DeleteProposalButton`, moderation actions).

**Fix.** Add a `headers()` block in `next.config.ts`. Start CSP in `Report-Only` given Mapbox GL, Stripe.js and Supabase Storage all need explicit `connect-src`/`img-src`/`worker-src` entries.

---

### 7. Low — Stripe webhook: events marked processed before side effects succeed; price not checked

**Files:** `app/api/stripe/webhook/route.ts:23-27, 45-53, 56-61`; `lib/stripeWebhook.ts:12-22`.

Signature verification (`:40`) and idempotency (`:51`) are both correct — `wasAlreadyProcessed` inserts the event id first and treats `23505` (unique_violation) as "already seen", which is atomic under concurrent redelivery. Three smaller issues:

1. **Fail-open on the side effect.** The event id is recorded *before* `setPremium` runs, and `setPremium` (`:23-27`) only `console.error`s on failure while the handler still returns `200`. A transient DB error therefore means Stripe's retry is silently swallowed by the dedup check and a paying customer never gets premium. `confirmSubscription` partly compensates for the purchase path, but not for `customer.subscription.updated/deleted`.
2. **No price check.** `checkout.session.completed` (`:56-61`) grants premium for *any* `mode === 'subscription'` session, without comparing against `STRIPE_PREMIUM_PRICE_ID`. Harmless with one product; a footgun the moment a second, cheaper subscription price exists.
3. **No ordering guard.** Nothing compares `event.created` against the profile's last-processed timestamp, so an out-of-order `subscription.updated` can resurrect a stale state.

Positives worth recording: the price comes from `process.env.STRIPE_PREMIUM_PRICE_ID` (`lib/actions/billing.ts:69`), never from the client; `confirmSubscription` takes a client-supplied `subscriptionId` but **binds it to the caller** by checking `subscription.customer !== profile.stripe_customer_id` (`:132`) *and* that the invoice is `paid` (`:135`) — I traced this specifically for a "confirm someone else's subscription" attack and it is correctly closed.

**Fix.** Record the event id, run the side effect, and only commit the dedup row on success (or record it in the same transaction as the profile update); return a non-2xx when the side effect fails so Stripe retries. Compare the subscription's price id against `STRIPE_PREMIUM_PRICE_ID`.

---

### 8. Low — `fahrzeug_id` ownership is never verified

**Files:** `lib/actions/completions.ts:225` and `:506` (`String(formData.get("fahrzeug_id"))`, inserted as-is); `supabase/migrations/0001_init.sql:168` (FK only, no ownership predicate); `supabase/migrations/0038_…:118` (`left join public.vehicles v on v.id = rc.fahrzeug_id` inside the owner-rights `public_fahrten` view).

`public_fahrten` bypasses RLS by design and gates the vehicle columns on the **ride owner's** `zeigt_fahrzeuge` flag — not the **vehicle owner's**. So a user who attaches someone else's `vehicle_id` to their own public ride discloses that person's `typ/marke/modell` even if the vehicle's owner set `zeigt_fahrzeuge = false`.

**Why only Low:** vehicle UUIDs are never exposed anywhere — `vehicles` is owner-only under RLS (`0001:157`, `0027:119-121`) and no view or API emits a vehicle id — so this requires guessing a v4 UUID. The realistic impact is misattributed vehicle data, not a privacy leak. It is nonetheless the one missing ownership check I found in the mutation layer, and the identical class of bug was fixed for `completion_photos` in `0038` section A.

**Fix.** Mirror the `0038` fix: add `and (fahrzeug_id is null or exists (select 1 from public.vehicles v where v.id = fahrzeug_id and v.user_id = auth.uid()))` to the `route_completions` insert/update `with check`, plus a cheap app-side check in both actions.

---

### 9. Low — Storage object keys use the unsanitised client filename extension

**Files:** `lib/actions/completions.ts:121-122` (`const ext = foto.name.split(".").pop() ?? "jpg"; const path = \`${userId}/${crypto.randomUUID()}.${ext}\``) and `lib/actions/profile.ts:130-131` (same pattern, `avatar.${ext}`, `upsert: true`).

I traced the traversal case specifically and **it does not work**: `ext` is everything after the *last* dot, so it can never itself contain a `.`, and `..` is unreachable. It *can* contain `/` (filename `x.foo/bar` yields `ext = "foo/bar"`), which injects sub-directories — but the storage RLS policies pin the first path segment to `auth.uid()` (`0003_storage.sql:18, 26`), so the write stays inside the user's own folder. No cross-user write is possible.

The stored-XSS variant is also closed: `foto.type.startsWith("image/")` reads the attacker-controlled Content-Type, but `0033_route_length_and_upload_mime_hardening.sql:76-78` restricts both buckets to `image/jpeg|png|webp|gif` at the storage layer, so an `image/svg+xml` upload is rejected by Supabase regardless of what the app check does. Good layering.

Residual: unbounded arbitrary strings in object keys, and no `file_size_limit` on the buckets (the 4 MB / 8 MB caps are app-side only, so a direct client-side Storage upload is uncapped).

**Fix.** Allow-list the extension (`jpg|jpeg|png|webp|gif`, defaulting to `jpg`) rather than passing it through, and set `file_size_limit` on both buckets in a new migration.

---

### 10. Low — `parseTrail()` accepts non-finite and out-of-range coordinates

**File:** `lib/actions/completions.ts:63-71` — checks `typeof p.lng === "number"` but not `Number.isFinite`, and no lat/lng bounds. Compare `parseGeometry` in `lib/actions/routes.ts:45-58`, which does both correctly.

`JSON.parse("1e400")` yields `Infinity`, so a crafted trail can carry `Infinity` coordinates into `computeTrailStats`, `reverseGeocode` (`lib/geocoding.ts:47`) and `toEwktLineString`. In practice the `!(distanzKm > 0)` guard (`:96`) rejects the resulting `NaN`, and the URL interpolation is numeric so no injection is possible — this is a robustness gap, not an exploit.

**Fix.** Reuse `isValidCoordinate` from `lib/actions/routes.ts` (or lift it into `lib/validation.ts`, per Core Rule 14) inside `parseTrail`.

---

### 11. Low — `updateRoute()` has no length caps

**File:** `lib/actions/routes.ts:303-346`. `name`, `region`, `start_ort`, `ziel_ort` and `charakter_text` are written with no length limit, while `proposeRoute` caps `name` at 100 and `charakter_text` at 500 (`:27-28, 139, 149-151`). With `serverActions.bodySizeLimit: "9mb"` (`next.config.ts:17`) and no DB CHECK on these columns (`0001_init.sql:82-91`), an owner or moderator can store multi-megabyte strings that then render on `/strecken/[id]` and in the moderation queue. `updateRouteAsModerator` (`:353-396`) has the same gap.

**Fix.** Apply the same `MAX_NAME_LENGTH` / `MAX_CHARAKTER_TEXT_LENGTH` slices in both update actions, and add matching CHECK constraints in a new migration.

---

### 12. Low — Stripe customer creation race; `siteUrl()` falls back to `localhost`

**File:** `lib/actions/billing.ts:23-47` and `:146-148`.

`getOrCreateStripeCustomerId` does read-then-create-then-write with no lock or upsert. Two concurrent calls (double-click on checkout) create two Stripe customers for one user; the second `update` wins, orphaning the first — and since the webhook maps `stripe_customer_id → profile`, an event for the orphaned customer updates nobody. Separately, `siteUrl()` silently falls back to `http://localhost:3000`, so a missing `NEXT_PUBLIC_SITE_URL` in production sends the Stripe billing-portal `return_url` to localhost.

Both paths are currently unreachable (the Premium UI is disabled — `components/PremiumCard.tsx`), which is why this is Low.

**Fix.** Serialise on `profiles.id` (`select … for update`, or a conditional `update … where stripe_customer_id is null` and re-read), and make a missing `NEXT_PUBLIC_SITE_URL` a hard failure outside development.

---

### 13. Info — Duplicate migration numbers

`0034_profiles_column_grant_hardening.sql` / `0034_public_fahrten_foto.sql`, `0041_rating_cooldown_covers_edits.sql` / `0041_route_proposal_cooldown.sql`, `0053_gefolgt_von_feature.sql` / `0053_kudos_gesehen.sql`, `0054_leaderboard_user_totals.sql` / `0054_sichtbarkeit_standardmaessig_aktiv.sql`.

Lexical filename ordering makes this deterministic today, but `AGENTS.md` treats the migration history as an append-only audit log, and two files claiming the same sequence number make "which grant landed last?" ambiguous to a reader — exactly the question that matters for the column-grant hardening in the 0034 pair. Cosmetic; do not renumber applied migrations (Core Rule 9), just avoid it going forward.

---

### 14. Info — Unauthenticated `POST /auth/abmelden`

**File:** `app/auth/abmelden/route.ts:4-8`. A plain route handler, so it does not get the Server Action origin check. Any site can `<form method="POST" action="https://…/auth/abmelden">` and force a logout. Nuisance-level (no data impact, no state change beyond ending a session).

**Fix.** Verify `Origin`/`Sec-Fetch-Site`, or convert it to a Server Action.

---

### 15. Info — `NEXT_PUBLIC_MAPBOX_TOKEN` is also used server-side

`lib/geocoding.ts:43` and `lib/mapboxDirections.ts:68` read the *public* Mapbox token for server-side Geocoding/Directions calls. That is not a secret leak (the token is public by design and already in the browser bundle via `RouteMap.tsx`/`RoutePicker.tsx`/`RouteDetailMap.tsx`), but it means the same token pays for server-side API usage and cannot be URL-restricted without breaking the server calls.

**Fix.** Use a separate, secret, unrestricted token (`MAPBOX_SERVER_TOKEN`) for the server calls and apply URL restrictions to the public one.

---

## What is done well

Recording these explicitly, both for balance and so a future change does not undo them by accident.

**Authentication & session handling**
- `supabase.auth.getUser()` is used at all 57 auth checkpoints; `getSession()` (which trusts an unverified cookie) appears **nowhere**. This is the single most commonly-missed Supabase pitfall.
- `safeInternalPath` (`lib/utils/url.ts:21-26`) correctly rejects absolute URLs, protocol-relative `//evil.example` **and** the `/\evil.example` backslash variant, and every consumer (`app/auth/callback/route.ts:20`, `lib/actions/vehicles.ts:101`) falls back to a fixed internal default. I attempted `/%2f/`, `/https://…` and CRLF variants against `NextResponse.redirect` — **no open redirect**.
- Sign-in returns one constant error string for both wrong-password and unknown-account; `requestPasswordReset` returns the same constant success shape whether or not the address exists *and* when rate-limited, so the limiter does not become an enumeration oracle. `signUp` uses Supabase's documented `identities.length === 0` signal rather than a separate lookup.
- `deleteAccount` re-authenticates with the password before an irreversible action, anonymises via a self-bound `auth.uid()` RPC, and only then uses the admin client — with `user.id` taken from the just-verified session, never from input.

**Authorization**
- Every mutating Server Action follows the same shape: `getUser()` → explicit pre-check with `.eq("user_id", user.id)` → mutation *also* filtered on `user_id` → RLS as the third layer. I checked all 12 files in `lib/actions/` individually and found **no missing ownership check** on any user-owned row (rides, photos, vehicles, ratings, kudos, favourites, follows, routes, reports).
- The "pre-check so a zero-row RLS rejection isn't reported as success" pattern (`deleteVehicle:131-138`, `removeCompletionPhoto:864-875`, `deleteOwnRejectedRoute:273-281`) is applied consistently and is genuinely good defensive design.
- Moderator actions check `isModerator()` in the application **and** rely on a moderator RLS policy — explicit defence-in-depth, with the reason written down (`lib/actions/moderation.ts:7-11`).
- `toggleFollow` blocks self-follow in the app and via the `follows_not_self` DB constraint.

**RLS, grants and the database boundary**
- `0034_profiles_column_grant_hardening.sql` is exemplary: it found that 0027's column-level `REVOKE`s were **no-ops** against Supabase's default table-level grants, said so plainly, and fixed it by revoking at table level and re-granting an explicit column list. That closed a real privilege escalation (self-promotion to `is_moderator`, self-granted `ist_premium`).
- Views are deliberately split into `security_invoker = true` (owner-only: `routes_geojson`, `fahrt_tracks`) and owner-rights aggregates (`public_fahrten`, `leaderboard_*`, `public_fahrt_tracks`), with every owner-rights view carrying a `comment on view` explaining why it bypasses RLS and what it filters instead.
- The raw GPS `track` column — the most sensitive field in the schema, since it starts at the rider's home — is kept out of every RLS-bypassing view, with the invariant written into the column comment (`0044:38-42`). The public variant is cropped by `cropTrackEnds` at the configured privacy radius, and `recomputePublicTracks` (`lib/publicTrack.ts:51-88`) **retroactively re-crops already-shared rides** when the radius is tightened, returning a boolean so a partial failure surfaces as an error instead of a false "Gespeichert."
- Every `SECURITY DEFINER` function I checked (`completion_is_public`, `get_follow_counts`, `get_follower_list`, `get_following_list`, `get_mutual_followers`, `count_unseen_kudos`, `mark_kudos_seen`, `recent_kudos_received`, `anonymize_own_account`, all cooldown triggers) pins `set search_path = public`, binds itself to `auth.uid()` rather than a caller-supplied id, and returns the narrowest possible shape. `get_mutual_followers` even enforces `auth.uid() = p_viewer_id` *inside* the function, with a comment explaining that without it the follow graph would be enumerable.
- `save_free_ride_with_segments` is deliberately `SECURITY INVOKER`, takes `user_id` from `auth.uid()` only, re-checks route eligibility in SQL rather than trusting the TypeScript pre-selection, and caps the segment count.
- The private-route boundary is anchored in the policy, not the write paths — `0049` rewrote the read policy to `(status_ok and not ist_privat) or erstellt_von = auth.uid()` and documented that the previous version was safe only by accident. Verified: neither `getRoute` nor `/api/strecken/*` can leak a private or unapproved route.
- The `0047`/`0048`/`0051` sequence — discovering that `revoke … from public` does not undo a direct `anon` grant, then fixing it — is the kind of follow-through that is usually missing.

**Stripe**
- Signature verified before any payload is trusted; raw `req.text()` body used (not a re-serialised object); missing header rejected with 400.
- Idempotency via primary-key insert, so concurrent duplicate deliveries are handled atomically rather than with a read-then-write race.
- Price id comes from the environment; the client cannot influence the amount. `confirmSubscription` binds the client-supplied subscription id to the caller's own `stripe_customer_id` **and** requires `invoice.status === 'paid'`.
- `stripe_customer_id` is `SELECT`-revoked from `anon`/`authenticated` and touched only through the service-role client.

**Secrets**
- No server secret is reachable from a client component (verified by grepping `process.env` in every `"use client"` file: only `NEXT_PUBLIC_MAPBOX_TOKEN` and `NODE_ENV`). `lib/stripe.ts` and `lib/supabase/admin.ts` are imported only from Server Actions and route handlers.
- Only three `createAdminClient()` call sites exist — the Stripe webhook (after signature verification), `billing.ts` (with `user.id` from a verified session), and `deleteAccount` (after password re-auth) — and each carries a written justification, as `AGENTS.md` requires.
- CI uses obvious placeholders, `.gitignore` covers `.env*`/`*.key`/`*.pem`, and no live credential exists in the tree apart from finding 5.

**Input handling & injection**
- `escapeLikePattern` / the inline equivalent in `searchProfiles` escape `%`, `_` and `\` before they reach PostgREST `ilike` — a genuinely easy one to miss.
- `listRouteDetectionCandidates` validates `viewerId` as a UUID *because* it is interpolated into a PostgREST `.or()` filter string, with the reason in a comment (`lib/routes.ts:78-82`).
- `isValidUuid` gates every id-taking action before it reaches the DB.
- All outbound fetches (`mapboxDirections`, `weather`, `geocoding`, `elevation`) use hardcoded hosts with only numeric interpolation, or `URLSearchParams`. **No SSRF.** All have timeouts and fail closed to `null`.
- One `dangerouslySetInnerHTML`, containing a static module constant. **No XSS found.**

**Abuse resistance**
- Cooldowns are enforced by DB triggers with `pg_advisory_xact_lock` (`0024`, `0041`, `0050`) — the app-side check is explicitly documented as fast feedback only, not the control.
- Per-ride photo limits are enforced by trigger (`0038` section C), not just the app-side `.slice()`.
- `0052` recomputes coverage server-side and clamps `ist_oeffentlich` — the right instinct, just applied to only one field (finding 1).

---

## Verification notes / limits

- **No SQL executed and no live project queried.** All statements about grants, policies, triggers and constraints are read from `supabase/migrations/**`. The migrations are internally consistent and self-documenting, but a live `information_schema` / `pg_policies` diff is the only way to confirm production matches — and `0034`'s own header is proof that it can drift.
- **Finding 1's key link — that `authenticated` still holds `INSERT` on `public.route_completions` — is inferred**, not verified. Confirm with `select privilege_type from information_schema.role_table_grants where table_name='route_completions' and grantee='authenticated'` before sizing the fix.
- **Finding 3's exploitability depends on the Supabase Redirect URLs allow-list**, which lives in the dashboard and was not read. Treat the header-trust issue as real regardless; treat the takeover as conditional on that config.
- Not in scope / not reviewed: dependency CVEs beyond noting that CI runs `npm audit --audit-level=high`; the service worker and offline route caching (`lib/offlineRoutes.ts`, `components/ServiceWorkerRegister.tsx`); Mapbox/swisstopo/Open-Meteo quota abuse economics; `scripts/`.
