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
