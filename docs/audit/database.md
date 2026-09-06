# Cornice — Database Layer Audit

**Scope:** `supabase/migrations/0001…0057` (60 SQL files, all read in order), `types/database.ts`,
and the query code in `lib/*.ts` / `lib/actions/*.ts`.
**Method:** static reading of the SQL only. No SQL was executed, no Supabase MCP tool was used.
Every finding below cites the file and the statement it is derived from.

**Date:** 2026-09-06

---

## 0. Executive summary

The schema is, on the whole, unusually well reasoned for a project this size. RLS is enabled on
**every** table in `public`; the "public data" surface is deliberately routed through owner-rights
views instead of loosened policies; almost every `SECURITY DEFINER` function pins `search_path` and
binds itself to `auth.uid()` rather than a caller-supplied id; and the migration comments record
*why* each decision was made, including several honest post-mortems (0023, 0034, 0047, 0048).

The defects that remain are almost all of one shape: **a privacy rule that was correctly applied to
one owner-rights view was never back-ported to its siblings.** `public_fahrten` and
`public_completion_photos` got the `status_ok` / `art` coupling; `route_leaderboard` and
`route_photos` did not. That is the source of the two highest-severity findings.

| # | Severity | Finding | Where |
|---|---|---|---|
| F1 | **High** | `route_leaderboard` leaks rides on private and unapproved routes (incl. the private `route_id`) to `anon` | 0044:135–149 |
| F2 | **High** | `route_photos` leaks photos of rides on private/unapproved routes to `anon` | 0044:154–165 |
| F3 | **Medium** | `zeigt_avatar` opt-in is bypassable in one PostgREST request — `profiles.avatar_url` is directly granted | 0034:39–43 vs. 0028/0030/0037 |
| F4 | **Medium** | `public_completion_photos` INNER JOINs `routes` → photos of **free rides** are invisible to every non-owner (functional bug) | 0038:35–47 |
| F5 | **Medium** | Duplicate migration version prefixes (0034, 0041, 0053, 0054) — `supabase db push` cannot record both | 4 pairs |
| F6 | **Medium** | No index supports the feed's `order by datum desc limit 30`; `leaderboard_user_totals` re-aggregates the whole platform 4× per page load | 0001 index set |
| F7 | **Medium** | `types/database.ts` has drifted (missing columns, missing tables) and `Database = any` disables all type checking | types/database.ts:332 |
| F8 | **Low-Med** | `fahrzeug_id` is never validated to belong to the caller — no FK/CHECK/trigger, no app check | 0001:168, lib/actions/completions.ts:225,506 |
| F9 | **Low-Med** | `recent_kudos_received()` returns `avatar_url` raw, ignoring `zeigt_avatar` — the only such function that does | 0057:36 |
| F10 | **Low-Med** | Editing a ride's note can silently un-publish it (coverage trigger recompute) | 0052:184–187 |
| F11 | **Low** | `route_ratings` SELECT is `using (true)` with no coupling to route visibility | 0001:133–135 |
| F12 | **Low** | pg_cron job deletes rejected routes → cascades away users' completions of them | 0055:16–18 |
| F13 | **Low** | Unindexed FK columns on the three report tables (`reporter_id`, `bearbeitet_von`) | 0043, 0046 |
| F14 | **Low** | `display_name` has no write path at all (0034 grant list excludes it) | 0034:33–36 |
| F15 | **Info** | Hard-coded webhook secret still present in the git-tracked migration 0022 | 0022:27 |
| F16 | **Info** | No owner-rights view sets `security_barrier` | all 9 |

---

## 1. RLS coverage

### 1.1 Every table has RLS enabled — verified

| Table | Created | `enable row level security` | Policies present |
|---|---|---|---|
| `profiles` | 0001:9 | 0001:15 | SELECT `true`, UPDATE own. No INSERT/DELETE policy (by design — `handle_new_user()` is `SECURITY DEFINER`). |
| `vehicles` | 0001:45 | 0001:58 | ALL own (0001:64) + SELECT when `zeigt_fahrzeuge` (0015:16). The redundant SELECT-own policy was dropped in 0027:62. |
| `routes` | 0001:72 | 0001:101 | SELECT public/owner (0049), SELECT moderator (0021:27), INSERT authenticated (0001:107), UPDATE owner-unverified (0001:112), UPDATE moderator (0009:21), DELETE moderator (0009:25), DELETE own-rejected (0012:4). |
| `route_ratings` | 0001:119 | 0001:131 | SELECT `true`, ALL own, DELETE moderator (0043:84). |
| `favorites` | 0001:145 | 0001:152 | ALL own. |
| `route_completions` | 0001:164 | 0001:177 | ALL own (0001:183) + UPDATE moderator (0046:80). |
| `stripe_webhook_events` | 0026:12 | 0026:28 | **No policies at all** — correct, service-role only. |
| `kudos` | 0029:9 | 0029:18 | SELECT/INSERT gated on `completion_is_public()` (0031), DELETE own. |
| `follows` | 0030:11 | 0030:21 | SELECT own edges, INSERT, DELETE. |
| `completion_photos` | 0036:8 | 0036:25 | SELECT own, ALL own + ownership of the parent ride (0038:17). |
| `route_reports` | 0043:11 | 0043:32 | INSERT authenticated-self, SELECT/UPDATE moderator. |
| `rating_reports` | 0043:47 | 0043:62 | INSERT authenticated-self, SELECT/UPDATE moderator. |
| `completion_reports` | 0046:11 | 0046:28 | INSERT (self + ride must be in `public_fahrten`), SELECT/UPDATE moderator. |

**No table is missing RLS.** No policy grants anything to the `anon` role by name. The only
`using (true)` policies are on `profiles` (SELECT) and `route_ratings` (SELECT), both deliberate,
and `spatial_ref_sys` (0027:13, a PostGIS reference table — and per `supabase/migrations/README.md`
that whole section is a documented no-op because the table is owned by `supabase_admin`).

### 1.2 Privacy features traced

**Private routes (0021, 0049) — correct at the table level.** 0049 replaced the read policy with
`(status_ok = true and ist_privat = false) or erstellt_von = (select auth.uid())`. `routes_geojson`
is `security_invoker = true` (0021:37) so it inherits that policy. `save_free_ride_with_segments`
re-checks eligibility explicitly (0050:151–158) even though it is `SECURITY INVOKER` and RLS would
already apply. This is good defence in depth. **But see F1/F2** — the leak is not in `routes`, it is
in the two completion-side views that never join `routes` at all.

**Profile visibility (0015, 0016, 0018, 0054) — enforced in views, not at the column level.** See F3.
`zeigt_fahrzeuge` is the one flag actually backed by RLS (0015:16 on `vehicles`); the other five
(`zeigt_avatar`, `zeigt_paesse`, `zeigt_hoehenmeter`, `zeigt_distanz`, `zeigt_premium_badge`) are
enforced only inside view expressions or in page code.

**Per-ride visibility (0017) — solid.** `ist_oeffentlich` is the single filter every public view
applies, and since 0052 it is additionally recomputed server-side from the stored track on every
insert and update.

**Follower list privacy (0039, 0040) — the best-executed part of the schema.** 0040 correctly
recognised that a page-level check is not an authorization boundary, revoked the direct grant on
`public_follows`, and replaced it with three `SECURITY DEFINER` functions that put the
`zeigt_follower_liste` decision in the `WHERE` clause. 0053's `get_mutual_followers` follows the same
pattern and additionally pins `auth.uid() = p_viewer_id` inside the function so the caller-supplied
`p_viewer_id` cannot be used to walk foreign follow graphs (0053_gefolgt_von_feature.sql:51).

**Vehicle / photo privacy (0038) — correct, and correctly reasoned.** 0038 A closed a real hole
(photos attachable to a stranger's ride), 0038 B added the missing `status_ok` filter to
`public_completion_photos`, 0038 D added the `zeigt_fahrzeuge` bracket to `public_fahrten`. The only
residue is that 0038 B's INNER JOIN later became wrong when 0045 introduced shareable free rides
(F4), and that the same `status_ok` fix was never applied to `route_photos` (F2).

---

## 2. Views

Nine views run with **owner rights** (no `security_invoker`), i.e. they intentionally bypass RLS.
Two run as invoker. None sets `security_barrier`.

| View | Rights | Granted to | Visibility filter (current definition) |
|---|---|---|---|
| `routes_geojson` (0021:36) | **invoker** | inherited | inherits `routes` RLS |
| `fahrt_tracks` (0044:88) | **invoker** | `authenticated` | inherits `route_completions` RLS → own rows only |
| `public_fahrten` (0045:77) | owner | anon, auth | `ist_oeffentlich` **and** (`art='frei' and route_id is null`) **or** (`art='strecke' and r.status_ok`) ✅ |
| `public_fahrt_tracks` (0045:127) | owner | anon, auth | same coupling ✅, only `track_oeffentlich` ✅ |
| `public_completion_photos` (0038:35) | owner | anon, auth | `ist_oeffentlich and r.status_ok`, **INNER JOIN routes** ⚠️ F4 |
| `leaderboard_completions` (0056:22) | owner | anon, auth | `ist_oeffentlich` + art coupling ✅ |
| `leaderboard_user_totals` (0056:63) | owner | anon, auth | inherits the above ✅ |
| `route_leaderboard` (0044:135) | owner | anon, auth | `ist_oeffentlich and dauer_sekunden is not null and art='strecke'` — **no join to `routes`** ❌ F1 |
| `route_photos` (0044:154) | owner | anon, auth | `ist_oeffentlich and art='strecke'` — **no `status_ok`** ❌ F2 |
| `kudos_summary` (0029:56) | owner | anon, auth | `ist_oeffentlich` only — counts only, acceptable |
| `public_follows` (0037:14) | owner | **revoked** (0040:20) | reachable only via the three DEFINER functions ✅ |

### F1 — HIGH: `route_leaderboard` exposes rides on private and unapproved routes

**File/line:** `0044_freie_fahrten.sql:135–149` (current definition; unchanged since).

```sql
create or replace view public.route_leaderboard as
select rc.id as completion_id, rc.route_id, rc.user_id, p.display_name,
       rc.dauer_sekunden, rc.distanz_km, rc.datum, ..., avatar_url
from route_completions rc
  join profiles p on (p.id = rc.user_id)          -- no join to routes at all
where rc.ist_oeffentlich = true
  and rc.dauer_sekunden is not null
  and rc.art = 'strecke';
```

**Why it is reachable.** A private route is created with `status_ok = false, ist_privat = true`
(`lib/actions/routes.ts:193` + `:223`). Its owner can ride it: `getRoute()` succeeds for them
(owner branch of the 0049 policy), and the coverage trigger `enforce_route_completion_coverage`
(0052:176) selects the geometry as the *caller*, which for the owner returns a row — so the insert
succeeds and `ist_oeffentlich` is allowed through when coverage ≥ 75. The resulting row satisfies
every predicate of `route_leaderboard`.

The same applies to any ride on a **pending proposal** (`status_ok = false`, not yet moderated).

**Impact.** `GET /rest/v1/route_leaderboard?select=*` with only the publishable anon key returns, for
every such ride: `route_id` (the private route's UUID), `user_id`, `display_name`, `dauer_sekunden`,
`distanz_km`, `datum`, `avatar_url`. That directly defeats 0021/0049 — the existence of a private
route, who rode it, and how fast, all become public. `lib/leaderboard.ts:161` always filters by
`route_id`, so the app itself never surfaces this; the leak is only via a direct PostgREST call,
which is exactly the threat model 0040 was written to address.

Note this is the *same* class of bug 0045:114–126 explicitly warns about for `public_fahrt_tracks`
("eine View ohne dieselbe Kopplung würde ihren Track aber trotzdem an anon ausliefern") — the warning
was simply never applied back to `route_leaderboard`.

**Fix (new migration):**

```sql
create or replace view public.route_leaderboard as
select rc.id as completion_id, rc.route_id, rc.user_id, p.display_name,
       rc.dauer_sekunden, rc.distanz_km, rc.datum,
       (p.ist_premium and p.zeigt_premium_badge) as ist_premium,
       p.zeigt_premium_badge,
       case when p.zeigt_avatar then p.avatar_url else null end as avatar_url
from public.route_completions rc
  join public.profiles p on p.id = rc.user_id
  join public.routes    r on r.id = rc.route_id     -- new: inner join is correct here,
                                                    -- the view is strecke-only by definition
where rc.ist_oeffentlich = true
  and rc.dauer_sekunden is not null
  and rc.art = 'strecke'
  and r.status_ok = true
  and r.ist_privat = false;
```
Column order and names are preserved, so `create or replace` works and no grant is lost.
Add a regression test asserting that a ride on a `status_ok = false` route does not appear.

### F2 — HIGH: `route_photos` exposes photos of rides on private/unapproved routes

**File/line:** `0044_freie_fahrten.sql:154–165`.

```sql
create or replace view public.route_photos as
select cp.id, rc.route_id, cp.foto_url, rc.datum, p.display_name
from public.completion_photos cp
join public.route_completions rc on rc.id = cp.completion_id
join public.profiles p on p.id = cp.user_id
where rc.ist_oeffentlich = true and rc.art = 'strecke';   -- no r.status_ok
```

0038 B added exactly this missing `status_ok` filter to the sibling view
`public_completion_photos` and documented why ("Fotos einer nachträglich abgelehnten/
zurückgezogenen Strecke blieben dadurch über die View weiterhin abrufbar"). 0044 then rewrote
`route_photos` and did not carry the fix across.

**Impact.** `GET /rest/v1/route_photos?select=*` (no filter — `lib/photos.ts:11` always filters by
`route_id`, PostgREST does not) dumps every photo of every public ride, including rides on rejected,
withdrawn, still-pending, and **private** routes, each with `route_id`, `datum` and `display_name`.

**Fix:** add `join public.routes r on r.id = rc.route_id` and
`and r.status_ok = true and r.ist_privat = false` to the `WHERE`, mirroring 0038 B.

### F4 — MEDIUM: free-ride photos are invisible to everyone but the owner

**File/line:** `0038_completion_photo_and_vehicle_privacy_fixes.sql:35–47`.

`public_completion_photos` uses `join public.routes r on r.id = rc.route_id` — an **inner** join.
When 0045 made free rides shareable, `route_id is null` for those rides, so the inner join drops
every row. `lib/completions.ts:190` uses this view for the non-owner path of the ride detail page,
while the owner path (`:334`) reads `completion_photos` directly. Net effect: the owner of a shared
free ride sees their photos, **nobody else does** — silently, with no error.

This is not a security hole (it fails closed), but it is a real product bug in the core loop
step 6→7 and it is invisible without reading the SQL.

**Fix:** apply the same `art` coupling 0045 used for `public_fahrten`:

```sql
create or replace view public.public_completion_photos as
select cp.id, cp.completion_id, cp.foto_url, cp.position, p.display_name
from public.completion_photos cp
join public.route_completions rc on rc.id = cp.completion_id
left join public.routes r on r.id = rc.route_id
join public.profiles p on p.id = cp.user_id
where rc.ist_oeffentlich = true
  and ((rc.art = 'frei' and rc.route_id is null)
    or (rc.art = 'strecke' and r.status_ok = true and r.ist_privat = false))
order by cp.position asc;
```

### F16 — INFO: no owner-rights view sets `security_barrier`

None of the nine RLS-bypassing views sets `security_barrier = true`. In principle a qualifier the
caller supplies could be evaluated before the view's own filter and leak rows through a non-leakproof
operator. In practice PostgREST only emits built-in comparison operators and cannot inject a
user-defined function, so exploitability is low — but for views whose entire purpose is to bypass
RLS, `with (security_barrier = true)` is cheap insurance and would cost only a planning-time
optimisation fence. Worth adding alongside the F1/F2 rewrite.

---

## 3. SECURITY DEFINER functions

Complete inventory of the current effective set. **All 12 pin `search_path`.** None accepts a
caller-supplied user id that it then trusts.

| Function | Defined | `search_path` | Identity binding | EXECUTE holders (net of 0047/0048) | Assessment |
|---|---|---|---|---|---|
| `handle_new_user()` | 0001:26 | `public` ✅ | trigger only | revoked from PUBLIC (0047:36) | ✅ |
| `enforce_completion_cooldown()` | 0024:18 → 0050:43 | `public` ✅ | `new.user_id` | revoked from PUBLIC (0047:32) | ✅ (see note) |
| `enforce_rating_cooldown()` | 0024:43 → 0041a:20 | `public` ✅ | `new.user_id` | revoked from PUBLIC (0047:33) | ✅ |
| `enforce_route_proposal_cooldown()` | 0041b:23 | `public` ✅ | `new.erstellt_von` | revoked from PUBLIC (0047:34) | ✅ |
| `enforce_completion_photo_limit()` | 0038:60 | `public` ✅ | n/a (count only) | revoked PUBLIC (0047:35) + direct anon/auth (0048:20) | ✅ |
| `completion_is_public(uuid)` | 0031:31 | `public` ✅ | n/a — returns boolean only | anon, authenticated (deliberate, 0047:51) | ✅ minimal disclosure |
| `anonymize_own_account()` | 0042:38 → 0045:167 | `public` ✅ | `auth.uid()`, raises if null | authenticated only (0048:22–25) | ✅ writes only hard-coded values |
| `get_follow_counts(uuid)` | 0040:22 | `public` ✅ | none needed — counts are public by decision (0037) | anon, authenticated | ✅ |
| `get_follower_list(uuid)` | 0040:39 | `public` ✅ | `zeigt_follower_liste` OR `auth.uid() = p_user_id` **in the WHERE** | anon, authenticated | ✅ exemplary |
| `get_following_list(uuid)` | 0040:63 | `public` ✅ | same | anon, authenticated | ✅ |
| `get_mutual_followers(uuid,uuid,int)` | 0053a:29 | `public` ✅ | `auth.uid() = p_viewer_id` enforced **inside** the function | authenticated | ✅ exemplary — the comment at 0053a:7–15 explains precisely why |
| `count_unseen_kudos()` | 0053b:27 | `public` ✅ | no parameters, `auth.uid()` only | authenticated | ✅ |
| `mark_kudos_seen()` | 0053b:57 | `public` ✅ | `auth.uid()`, raises if null | authenticated | ✅ |
| `recent_kudos_received()` | 0057:18 | `public` ✅ | no parameters, `auth.uid()` only | authenticated | ⚠️ **F9** |

`SECURITY INVOKER` functions (correctly *not* definer):
`propose_route` (0004, `search_path` pinned in 0027:35), `propose_route_full` (0033:17,
`set search_path = public`), `save_free_ride_with_segments` (0050:81, `public, extensions`),
`compute_route_coverage_percent` (0052:62), `enforce_route_completion_coverage` (0052:163 — invoker
on purpose so `routes` RLS still applies inside the trigger; the reasoning at 0052:124–131 is
correct), `delete_alte_abgelehnte_vorschlaege` (0055:11, runs as the cron owner).

### F9 — LOW-MED: `recent_kudos_received()` ignores `zeigt_avatar`

**File/line:** `0057_kudos_aktivitaetsliste.sql:36`

```sql
p.avatar_url as giver_avatar_url,
```

Every other place in the schema wraps this column:
`case when p.zeigt_avatar then p.avatar_url else null end` — 0028:28, 0028:48, 0030:62, 0037:19,
0037:21, 0053a:44. 0057 is the sole exception. A user who has turned `zeigt_avatar` off but gives
a kudo has their avatar shown to the ride owner on `/aktivitaet`.

**Fix:**
```sql
create or replace function public.recent_kudos_received() ... as $$
  select k.completion_id, k.user_id as giver_id, p.display_name as giver_display_name,
         case when p.zeigt_avatar then p.avatar_url else null end as giver_avatar_url,
         ...
$$;
```

### Note on `enforce_completion_cooldown` and the batch escape hatch

0050:49 adds `if current_setting('cornice.completion_batch_write', true) = 'true' then return new;`.
The reasoning at 0050:34–42 — that `set_config` lives in `pg_catalog` and PostgREST only exposes
`public` functions as RPC — is correct as of this reading, and the parent row still goes through the
full check before the flag is set (0050:131–137). This is a well-contained exception. It is worth
re-verifying if PostgREST's exposed-schema configuration ever changes.

---

## 4. GRANTs

0047 / 0048 / 0051 form a correct three-step cleanup, and the reasoning recorded in them
(`revoke ... from anon` is a silent no-op when the privilege is inherited from `PUBLIC`; a direct
grant survives `revoke ... from public`) is right and worth preserving.

**Verified: nothing after 0048 re-grants broadly.** Every subsequent grant is narrow:

- 0050:182 → `save_free_ride_with_segments` to `authenticated` only (and 0051 strips the stray
  direct `anon` grant `ALTER DEFAULT PRIVILEGES` had created).
- 0052:119 → `compute_route_coverage_percent` to `authenticated` only, with explicit
  `revoke ... from anon` at :118 applying the 0048 lesson.
- 0053a:75, 0053b:48, 0053b:76, 0057:54 → `authenticated` only, each preceded by
  `revoke ... from public` **and** `revoke ... from anon`.
- 0055:27–28 → both revokes present for the cron function.
- 0056:56, 0056:77 → `select` re-granted on the two leaderboard views after the `drop`/`create`
  (a `drop` does not preserve grants, so this was necessary and correct).

**Column grants on `profiles` are additive and consistent:** 0034:33–43 (base list),
0039:29–30 (`zeigt_follower_liste`), 0045:32–33 (`privatzone_radius_m`). 0053b deliberately grants
nothing for `kudos_gesehen_am`, and the comment at 0053b:17 explains exactly why — correct.

**Two observations, both minor:**

1. `0045:33` grants `select (privatzone_radius_m)` to `authenticated`. Since the `profiles` SELECT
   policy is `using (true)`, any logged-in user can read any other user's privacy-zone radius, which
   reveals whether that user has disabled end-cropping on their shared tracks. The app only ever
   reads the caller's own value. Consider dropping this grant and reading it through the same
   pattern used for `kudos_gesehen_am`, or accept it and document it.
2. `is_moderator` is granted `select` to `anon` (0034:40). 0027:207–209 justifies this as required by
   the moderator RLS policies. That justification is worth re-testing: policy expressions on a
   *referenced* table are not obviously subject to the caller's column privileges. If it turns out
   not to be needed, revoking it removes a free moderator-enumeration endpoint.

---

## 5. Duplicate / conflicting migration numbers — F5 (Medium)

Four version prefixes appear twice:

| Prefix | Files (lexical order, which is what the CLI uses) | Cross-dependency? |
|---|---|---|
| 0034 | `0034_profiles_column_grant_hardening.sql`, `0034_public_fahrten_foto.sql` | none — one touches grants, the other a view |
| 0041 | `0041_rating_cooldown_covers_edits.sql`, `0041_route_proposal_cooldown.sql` | none — different triggers on different tables |
| 0053 | `0053_gefolgt_von_feature.sql`, `0053_kudos_gesehen.sql` | none |
| 0054 | `0054_leaderboard_user_totals.sql`, `0054_sichtbarkeit_standardmaessig_aktiv.sql` | none |

**Ordering risk is currently zero on content.** I checked each pair for a dependency and there is
none in either direction; and in all four cases the lexical ordering (`pr` < `pu`, `rating` <
`route`, `g` < `k`, `l` < `s`) happens to be consistent with any order.

**The real risk is the ledger, not the content.** `supabase_migrations.schema_migrations.version` is
the primary key. Two files sharing `0034` cannot both be recorded under version `0034`. The README
documents how this was already worked around once — the two 0041 files were applied by hand and
recorded as a single entry `0041_cooldowns_nachgezogen`. The consequences:

- `supabase db push` against a fresh environment will either error or silently apply only one file
  of each pair, and a fresh environment built from this directory will **not** match production.
- The "is it applied?" question can no longer be answered by comparing filenames to the ledger,
  which the README already concedes ("maßgeblich ist, ob die **Objekte** existieren").

**Also worth flagging separately:** `supabase/migrations/README.md:9–18` documents that migrations
are **not applied by any automation** — not by CI, not by Vercel. Combined with the duplicate
prefixes, the migration directory is not a reliable description of the live schema. Everything in
this audit describes *the files*; the live database may differ (0042 is explicitly recorded as never
applied). **Recommendation:** add a CI check that fails on a duplicate 4-digit prefix, and a
lightweight drift check that compares `information_schema` objects against an expected list.

**Do not renumber the existing files** (Core Rule 9). Future files should simply continue from 0058.

---

## 6. Data integrity

### What is done well

- `fahrt_art_konsistent` (0044:54) couples `art` / `route_id` / `abdeckung_prozent` so no mixed
  state can exist. Several later views correctly rely on this invariant rather than on
  `route_id is null` alone.
- Length checks on free text: `notiz ≤ 280` (0020:9), `titel ≤ 80` (0044:62).
- `follows_not_self` (0030:16); composite PKs on `favorites`/`kudos`/`follows` make the toggle
  semantics unambiguous.
- `unique (route_id, reporter_id)` etc. on all three report tables prevents report-queue spam.
- `profiles.stripe_customer_id text unique` (0022:13) — makes the webhook lookup unambiguous.
- `abdeckung_prozent` CHECK 0–100 (0019:8) survives the NOT-NULL drop in 0044.
- Enum-style CHECKs on `typ`, `getriebe`, `saison_status`, `art`, `grund`, `status`,
  `privatzone_radius_m`, and the `kategorien <@ array[...]` containment check (0001:91).

### F8 — LOW-MED: `fahrzeug_id` is never checked against the caller

`route_completions.fahrzeug_id` references `vehicles(id)` (0001:168) but nothing requires
`vehicles.user_id = route_completions.user_id`. Neither insert path validates it:

- `lib/actions/completions.ts:225` → `:278` (`logTrackedCompletion`)
- `lib/actions/completions.ts:506` → `:573` → `save_free_ride_with_segments` (`logFreeRide`)

and `save_free_ride_with_segments` (0050:115, :166) passes `(p_frei->>'fahrzeug_id')::uuid` straight
into the insert.

**Impact.** An attacker who knows another user's vehicle UUID can attach it to their own ride. If the
attacker has `zeigt_fahrzeuge = true`, `public_fahrten` (0038:112–114 gates on the *ride owner's*
flag, i.e. the attacker's) will then publish the victim's `typ`/`marke`/`modell`. Exploitation
requires guessing a v4 UUID, so severity is low — but 0038 A fixed the structurally identical hole
for `completion_photos.completion_id` and this one was missed.

**Fix (new migration)** — mirror 0038 A, but as a CHECK-equivalent trigger since a cross-row
constraint cannot be a CHECK:

```sql
create or replace function public.enforce_completion_vehicle_ownership()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.fahrzeug_id is not null and not exists (
    select 1 from public.vehicles v
    where v.id = new.fahrzeug_id and v.user_id = new.user_id
  ) then
    raise exception 'vehicle_not_owned';
  end if;
  return new;
end;
$$;
revoke execute on function public.enforce_completion_vehicle_ownership() from public;
revoke execute on function public.enforce_completion_vehicle_ownership() from anon, authenticated;
create trigger route_completions_vehicle_ownership
  before insert or update on public.route_completions
  for each row execute function public.enforce_completion_vehicle_ownership();
```

### F10 — LOW-MED: editing a note can silently un-publish a ride

`enforce_route_completion_coverage` (0052:163) fires `before insert or update`. On **any** update to
a `strecke` row where `track is not null`, it recomputes coverage and reassigns
`new.ist_oeffentlich := new.ist_oeffentlich and v_coverage >= 75` (0052:184–187).

`updateCompletionNotiz` (`lib/actions/completions.ts:834`) updates only `notiz`, but the trigger
still runs. The DB-side computation is a *different* algorithm from the TS one
(`ST_LineInterpolatePoint` at 100 m against the Douglas-Peucker-simplified track, vs.
`computeRouteCoverage` against the raw trail — 0052:28–48 acknowledges the divergence). For a ride
that originally passed at, say, 76 %, a DB-side recomputation landing at 74 % will flip
`ist_oeffentlich` to `false` as a side effect of editing a note, with no error and no message.

0052:155–161 documents a related known side effect (the toggle-after-account-deletion case) but not
this one.

**Fix options, in order of preference:** (a) skip the recompute when neither `track`,
`abdeckung_prozent` nor `ist_oeffentlich` is being changed — i.e. extend the case-4 guard at
0052:191 to also cover `new.track is not null`; or (b) only *lower* `ist_oeffentlich` when the
recomputed coverage differs materially (e.g. a 5-point hysteresis band).

Note also the threshold `75` is hard-coded at 0052:187, duplicating
`COVERAGE_THRESHOLD_PERCENT = 75` (`lib/routeCoverage.ts:8`). 0052:44–48 flags the same duplication
for `CORRIDOR_M`/`SAMPLE_INTERVAL_M` but not for the threshold. Add it to that comment, or add a
Vitest assertion that the constant is still 75 so a change on the TS side is caught.

### F12 — LOW: the cron job cascades away users' rides

`delete_alte_abgelehnte_vorschlaege()` (0055:16) does
`delete from public.routes where abgelehnt_am is not null and abgelehnt_am < now() - interval '3 days'`.
`route_completions.route_id` is `on delete cascade` (0001:167), so any ride logged on a route that
is later rejected disappears three days after the rejection — along with its `completion_photos`,
`kudos` and `completion_reports`, all of which cascade too. A user can legitimately have ridden their
own proposal while it was pending.

The blast radius is small today but grows with usage, and the deletion is unrecoverable and
unannounced. Consider either excluding routes that have completions
(`and not exists (select 1 from route_completions rc where rc.route_id = routes.id)`) or
switching `route_completions.route_id` to `on delete set null` — the latter conflicts with
`fahrt_art_konsistent`, so the former is simpler.

### Cascade behaviour on account deletion (0042 / 0045) — no orphans

The design deliberately does **not** delete the `auth.users` row (0042:5–16), so no cascade fires.
`anonymize_own_account()` (0045:167) then:
- anonymises `profiles` (all opt-ins off, `is_moderator`/`ist_premium` reset),
- nulls `track` and `track_oeffentlich` on all the user's rides,
- sets `ist_oeffentlich = false` for `art = 'frei'` rides only,
- deletes `vehicles` — and `route_completions.fahrzeug_id` is `on delete set null` (0001:168), so no
  ride is orphaned or deleted.

`lib/actions/auth.ts:253–275` then invalidates the credentials via the admin client, with the user id
taken from a session that was just re-authenticated by password (`:246`) rather than from a
parameter — correctly justified use of the service-role client.

**What survives deliberately:** `kudos` given and received, `follows` edges, `route_ratings`
comments, `completion_photos`, and public `strecke` rides. Kudos and follows still carry the
(now-anonymised) user's UUID, which is a stable pseudonymous identifier. For a GDPR erasure claim
this is defensible but should be a conscious, documented decision — 0042/0045 document the rides and
the tracks, not the social graph. Worth a line in `SECURITY.md`.

One gap: `completion_photos` rows are **not** removed and the uploaded files stay in the public
`route-photos` bucket. A photo of a shared `strecke` ride therefore remains publicly reachable after
account deletion, keyed to `display_name = 'Gelöschtes Konto'`. Given that 0045 removed the GPS
tracks precisely because they were "die sensibelste Spalte", photographs deserve the same treatment.
Recommend extending `anonymize_own_account()` to delete the user's `completion_photos` rows (the
storage objects need a separate server-side sweep).

### Other integrity notes

- `parent_completion_id` (0050:15) has no constraint requiring the parent to be `art = 'frei'` or to
  belong to the same user. Table-level `UPDATE` is revoked (0046:77) and only three columns are
  re-granted, so it cannot be changed after insert; but a direct PostgREST `INSERT` could point it
  at a stranger's completion. Consequence is cosmetic (`getDetectedSegments` filters by
  `user_id`, `lib/completions.ts:77`). Low priority.
- `kudos` has no constraint preventing a user from kudos-ing their own ride. Cosmetic.
- `profiles.display_name` has no length or content CHECK. It is only ever set from
  `raw_user_meta_data` at signup (`lib/actions/auth.ts:119`) — see F14.

### F14 — LOW: `display_name` has no write path

0034:33–36 re-granted `UPDATE` on `profiles` for a fixed column list that excludes `display_name`,
and no code writes it after signup (verified by grepping every `from("profiles")` write:
`lib/actions/profile.ts:76`, `:145`, `lib/actions/billing.ts:43`, `:138`). Users therefore cannot
rename themselves, and any future "change display name" feature will fail with a permissions error
that is easy to misdiagnose. Either grant the column and add a length CHECK, or add a comment on the
column recording that this is intentional.

---

## 7. Indexes and hot queries

### Current index inventory

`vehicles(user_id)`, `routes` GiST on `start_coord` and `geometry`, `routes` GIN on `kategorien`,
`routes(erstellt_von)`, `route_ratings(route_id)`, `route_ratings(user_id)`,
`route_completions(user_id)`, `route_completions(route_id)`, `route_completions(fahrzeug_id)`,
`route_completions(parent_completion_id)`, `favorites(route_id)`, `kudos(completion_id)`,
`follows(followed_id)`, `completion_photos(completion_id)`, `completion_photos(user_id)`,
`{route,rating,completion}_reports(status)`, plus the PK/UNIQUE indexes.

### F6 — MEDIUM: the two hottest read paths have no supporting index

**a) The feed** — `lib/feed.ts:26–33`:

```ts
supabase.from("public_fahrten").select("*").order("datum", {ascending:false}).limit(30)
```

`public_fahrten` (0045:77) is `route_completions ⋈ profiles ⟕ routes ⟕ vehicles` filtered on
`ist_oeffentlich = true`. There is **no index on `ist_oeffentlich` and none on `datum`**, so this is
a full scan of `route_completions` plus three joins plus a full sort, every feed load, discarding all
but 30 rows. It also has no tiebreaker, so pagination (when it arrives) will be unstable — `datum` is
a `date`, so many rows share a value.

```sql
create index route_completions_public_datum_idx
  on public.route_completions (datum desc, id desc)
  where ist_oeffentlich = true;
```
A partial index keeps it small (only shared rides) and lets the planner satisfy both the filter and
the ordering. Change the query to `.order("datum",{ascending:false}).order("id",{ascending:false})`
so the index is a full match and the ordering is deterministic.

**b) The global leaderboards** — `lib/leaderboard.ts:58–71`, called four times per page load
(`:98–103`):

```ts
.from("leaderboard_user_totals").select(...).order(metric, {ascending:false}).limit(3)
```

`leaderboard_user_totals` (0056:63) is a `GROUP BY` over `leaderboard_completions`, which is itself a
scan of every public completion joined to `profiles` and `routes`. Postgres cannot push `limit 3`
past the aggregate, so **each of the four calls aggregates the entire platform's public ride history
from scratch**. 0054's comment correctly identifies that the old approach scaled with ride count and
moved the summation server-side — but the aggregation cost itself still scales with ride count, and
is now paid four times instead of once.

Fix, in increasing order of effort:
1. The partial index above also helps here (it narrows the `ist_oeffentlich` scan).
2. Fetch the four top-3 lists in **one** query — order by one metric, but select all four; or use
   four `LATERAL` subqueries in a single view.
3. Once the ride count is non-trivial, make `leaderboard_user_totals` a **materialised view**
   refreshed by the existing pg_cron installation (0055:6 already installs the extension), with
   `create unique index on leaderboard_user_totals (user_id)` so `refresh concurrently` works.
   Leaderboards do not need to be second-fresh.

**c) `lib/routes.ts:9–13`** — `routes_geojson` `where status_ok = true order by name`, no index on
either column, and `select("*")` pulls full `geometry_geojson` + `hoehenprofil` + `tempolimits` for
every route on every explore-page load. Currently harmless (0049's comment mentions 7 approved
routes) but it is the query that will hurt first as the catalogue grows. Add
`create index routes_status_ok_name_idx on public.routes (name) where status_ok = true;` and consider
a slimmer projection for the list view (the pattern `listRouteChoices` at `:31` already uses).

**d) `lib/photos.ts:11`** — `route_photos ... .eq("route_id", …).order("datum")`. Served by
`route_completions(route_id)`. Fine.

**e) `lib/leaderboard.ts:161`** — `route_leaderboard .eq("route_id",…).order("dauer_sekunden").limit(200)`.
Served by `route_completions(route_id)`, sort is per-route and small. Fine.

### F13 — LOW: unindexed FK columns

Not covered by any existing index or unique-constraint prefix:
`route_reports(reporter_id)`, `route_reports(bearbeitet_von)`, `rating_reports(reporter_id)`,
`rating_reports(bearbeitet_von)`, `completion_reports(reporter_id)`, `completion_reports(bearbeitet_von)`.

(`route_reports(route_id)`, `rating_reports(rating_id)` and `completion_reports(completion_id)` *are*
covered as the leading column of their `unique(...)` indexes.)

These matter for the referential-integrity check Postgres runs when a referenced row is deleted —
i.e. every moderator route deletion (`lib/actions/moderation.ts:96`) and every rating deletion
(`:120`) currently seq-scans the report tables. Cheap to add.

### N+1 patterns

I found **no true N+1 loops.** The code consistently batches: `lib/ratings.ts:19–23` fetches profiles
with a single `.in()`; `lib/kudos.ts:22–27` batches both the summary and the viewer's own kudos;
`lib/moderation.ts:50`, `:86`, `:141` all use `.in()` follow-ups deliberately instead of embedded
selects, with the reasoning documented at `:36–39`. `getRoute` and `getPublicProfile` are wrapped in
React `cache()` to deduplicate within a request. This is genuinely good.

The one heavy pattern is **over-fetching**, not N+1: `select("*")` on `public_fahrten` in
`lib/feed.ts:27`, `lib/profile.ts:60` and `lib/completions.ts:173` pulls all 21 view columns
including `notiz`, `abdeckung_prozent` and the three vehicle columns for 30 feed rows. 0032:16–18
already made the deliberate choice to keep the track geometry out of this view for exactly that
reason; the same argument now applies to the column list. Naming the ~10 columns the feed card
actually renders would be a cheap win.

---

## 8. `types/database.ts` drift — F7 (Medium)

The file's own header states it matches `0001_init.sql`, and it has fallen behind in several places.
Nothing here is exploitable, but every one of these gaps is silently invisible because of the last
line of the file.

**`Database = any` (line 332).** Every client is created as `createSupabaseClient<Database>` and
`Database` is `any` — so no query in the codebase is type-checked against the schema at all. Every
row shape is asserted by hand (`data as PublicFahrt[]`, `.returns<{...}>()`). A column that is
renamed or dropped in a migration produces a runtime `undefined`, never a build error. This is the
single highest-leverage fix in this section: run
`npx supabase gen types typescript --linked > types/supabase.ts` and point `Database` at it.

**Missing columns:**

| Interface | Missing | Added by |
|---|---|---|
| `Profile` | `zeigt_follower_liste` | 0039:20 — and it *is* read at `lib/profile.ts:266` and written at `lib/actions/profile.ts:83` |
| `Profile` | `kudos_gesehen_am` | 0053b:14 |
| `Profile` | `stripe_customer_id` | 0022:13 (deliberately not client-readable — but the type describes the table, so a comment would be better than omission) |
| `RouteCompletion` | `track` | 0044:43 |
| `RouteCompletion` | `track_oeffentlich` | 0045:51 |

**Missing tables/views entirely:** `completion_reports` (0046 — `RouteReport`/`RatingReport` exist,
the third does not), `kudos` (0029), `follows` (0030), `stripe_webhook_events` (0026),
`leaderboard_completions` / `leaderboard_user_totals` / `route_leaderboard` / `kudos_summary` /
`public_follows`. Row shapes for three of those live in `lib/leaderboard.ts:15–30` and `:117–125`
instead, which is a reasonable local convention but means `types/database.ts` is no longer the
single source of truth its header claims.

**One stale comment:** `RouteCompletion.abdeckung_prozent` (line 176–181) says the threshold is
enforced by `lib/routeCoverage.ts`. Since 0052 it is enforced by a database trigger regardless of the
insert path — worth updating, because that is the more important fact.

**Accurate and up to date:** `PublicFahrt` matches the 0045 view exactly (all 21 columns, correct
nullability); `Route`, `RouteGeoJSON`, `Vehicle`, `RouteRating`, `Favorite`, `FahrtTrack`,
`PublicFahrtTrack`, `RoutePhoto`, `CompletionPhoto`, `PublicCompletionPhoto` all match.

---

## 9. Remaining lower-severity findings

### F3 — MEDIUM: the `zeigt_avatar` opt-in is bypassable in one request

Six view/function definitions carefully wrap the column
(`case when p.zeigt_avatar then p.avatar_url else null end`: 0028:28, 0028:48, 0030:62, 0037:19,
0037:21, 0053a:44). But `0034:39–43` grants `select (… avatar_url …)` on `profiles` to **`anon`**,
and the `profiles` SELECT policy is `using (true)` (0001:17).

So `GET /rest/v1/profiles?id=eq.<uuid>&select=avatar_url` returns the avatar of any user, whatever
`zeigt_avatar` says. `lib/profile.ts:93` also returns the raw `avatar_url` alongside `zeigtAvatar`
and leaves the gating to the page.

This is precisely the failure mode 0040 identified and fixed for `public_follows`
("anyone with the publishable key can bypass it entirely by querying the view straight through
PostgREST"). Mitigating factor: the avatars bucket is public (0015:61), so the URL is not itself a
secret — but the *association* between a user id and their photo is what the opt-in is about.

The same argument applies more weakly to `zeigt_paesse` / `zeigt_hoehenmeter` / `zeigt_distanz`:
those gate aggregates that any caller can recompute for themselves from
`public_fahrten?user_id=eq.<uuid>&select=distanz_km,route_id`. They are presentation preferences,
not access controls, and should be documented as such so nobody later relies on them.

**Fix:** `revoke select (avatar_url) on public.profiles from anon, authenticated;` and add a
`get_public_profile_avatar(uuid)` `SECURITY DEFINER` function (or add the gated column to an existing
public view), following the 0040 pattern. Check first that no session-client code path reads
`avatar_url` for the *current* user — `lib/actions/profile.ts:145` writes it and
`lib/completions.ts:332` reads it for the owner, so the owner path needs an `auth.uid() = id`
exception, exactly like `get_follower_list`.

### F11 — LOW: `route_ratings` is world-readable with no route coupling

`0001:133` — `create policy "Bewertungen sind öffentlich lesbar" on public.route_ratings for select
using (true)`. There is no coupling to `routes.status_ok` or `routes.ist_privat`, and no insert-side
check that the rated route is visible to the rater. A comment left on a still-pending proposal or on
the author's own private route is readable by anyone via
`GET /rest/v1/route_ratings?select=*`, together with the `user_id` and the `route_id` — which again
discloses the existence of a private route.

Consistent with F1/F2, the fix is to couple the policy to route visibility:

```sql
drop policy "Bewertungen sind öffentlich lesbar" on public.route_ratings;
create policy "Bewertungen freigegebener Strecken sind öffentlich lesbar"
  on public.route_ratings for select
  using (
    exists (select 1 from public.routes r
            where r.id = route_ratings.route_id
              and r.status_ok = true and r.ist_privat = false)
    or user_id = (select auth.uid())
  );
```
Note this subquery runs as the caller and `routes` RLS already hides private routes from third
parties, so the `exists` will correctly return false for them — but state the condition explicitly
rather than relying on that, per the precedent set in 0050:142–150.

### F15 — INFO: the compromised webhook secret is still in the tree

`0022_stripe_billing.sql:27` contains a 64-hex-character literal compared against
`p_webhook_secret`. 0023 removed the function and the migration comment (0023:15–20) correctly states
that the value is compromised by being in version control and is no longer used anywhere. Per Core
Rule 9 the file must not be edited, and per the AI-agent rules the value is not reproduced here.

Two follow-ups worth confirming as done: (a) the corresponding `INTERNAL_WEBHOOK_SECRET` has been
removed from every `.env` and deployment environment, and (b) if the value was ever reused for
anything else, it has been rotated there. Recording the resolution in `SECURITY.md` would close it
out — otherwise every future reader has to re-derive that 0023 already handled it.

---

## 10. What is done well — worth preserving

These are not filler; they are patterns a future change should be measured against.

1. **RLS is enabled on 100 % of tables**, including the one table that intentionally has no policies
   at all (`stripe_webhook_events`, 0026:28 — default-deny with a comment explaining why).
2. **The owner-rights views are a deliberate, documented architecture, not an accident.** Every one
   carries a `comment on view` saying it bypasses RLS and why (0027:162, 0028:35, 0035:46, 0036:63,
   0037:26, 0045:111, 0054:46). The Supabase `security_definer_view` advisor warning is explicitly
   accepted with a reason (0027:128–130) rather than silently ignored.
3. **`SECURITY DEFINER` discipline is excellent.** All 12 definer functions pin `search_path`; none
   trusts a caller-supplied user id. `get_mutual_followers` (0053a) is a textbook example: it *does*
   take a viewer id, recognises the escalation risk in a comment, and neutralises it with
   `auth.uid() = p_viewer_id` inside the function body.
4. **Client-supplied values are systematically distrusted.** 0033 A recomputes `laenge_km` from the
   geometry; `logTrackedCompletion` recomputes distance/duration/coverage from the raw trail
   (`lib/actions/completions.ts:232–250`); 0052 then enforces coverage a *third* time at the database
   level so the PostgREST bypass is closed too. Three independent layers, each documented.
5. **Rate limits are enforced where they cannot be bypassed.** 0024 replaced a TOCTOU-prone
   app-side check with `pg_advisory_xact_lock` + trigger, kept the app check as fast feedback, and
   0041a later found and fixed the upsert-becomes-update hole in it.
6. **The grant post-mortems (0034, 0047, 0048, 0051) are genuinely valuable.** Each records the exact
   mechanism that made the previous attempt a silent no-op — column revoke vs. table grant,
   `PUBLIC` vs. direct grantee. `README.md:72–75` distils this into a rule. Keep that.
7. **Business-rule reversals are called out, never slipped in.** 0054b (visibility defaults flipping
   to on) and 0056 (free rides entering the leaderboards) both open by naming AGENTS.md Rule 16 and
   stating the reversal explicitly, and 0054b deliberately does *not* mass-update existing rows.
8. **Batched reads throughout `lib/`** — no N+1 loop anywhere in the audited code, and React
   `cache()` used to deduplicate per-request fetches.
9. **The GPS track privacy model is careful.** Two columns (`track` / `track_oeffentlich`), an
   invoker view for the owner and an owner-rights view for everyone else, cropping computed in TS
   because the SQL approximation was judged not accurate enough for a privacy promise (0045:14–19),
   a default-on 200 m radius, and re-cropping of historical rides when the radius changes
   (`lib/actions/profile.ts:97`).

---

## 11. Suggested remediation order

Each item is a **new** migration (Core Rule 9 — nothing already applied gets edited).

| Order | Migration | Addresses |
|---|---|---|
| 1 | `0058_route_leaderboard_und_route_photos_streckensichtbarkeit.sql` — add the `routes` join + `status_ok`/`ist_privat` filter to both views | F1, F2 |
| 2 | `0059_public_completion_photos_freie_fahrten.sql` — LEFT JOIN + `art` coupling | F4 |
| 3 | `0060_avatar_opt_in_erzwingen.sql` — revoke `select (avatar_url)`, add a gated accessor | F3 |
| 4 | `0061_recent_kudos_avatar_opt_in.sql` — wrap `avatar_url` in the `zeigt_avatar` case | F9 |
| 5 | `0062_feed_und_report_indizes.sql` — partial `(datum desc, id desc)` index + the six FK indexes | F6, F13 |
| 6 | `0063_fahrzeug_besitz_erzwingen.sql` — ownership trigger | F8 |
| 7 | `0064_abdeckungs_trigger_nur_bei_relevanter_aenderung.sql` — narrow the recompute | F10 |
| 8 | `0065_bewertungen_an_streckensichtbarkeit_koppeln.sql` | F11 |
| 9 | `0066_cron_loescht_keine_befahrenen_strecken.sql` | F12 |
| — | Not a migration: regenerate `types/database.ts`, replace `Database = any` | F7 |
| — | Not a migration: CI check rejecting duplicate migration prefixes + a schema-drift check | F5 |

Items 1–4 are privacy fixes to Protected Areas (`supabase/migrations/`) and per AGENTS.md should
each carry a regression test and a PR description explaining what changed and why it is still safe.
Items 1 and 2 are the ones that change what an unauthenticated caller can read today.

---

## 12. Caveats on this audit

- **Files only.** No SQL was executed and no Supabase MCP tool was used, as instructed. Per
  `supabase/migrations/README.md:9–18` migrations are applied by hand, so the live schema may differ
  from what these files describe. `0042_account_deletion.sql` is documented there as deliberately
  never applied. Anything in this report should be confirmed against
  `select version, name from supabase_migrations.schema_migrations order by version` and
  `pg_policies` / `information_schema.role_table_grants` before being acted on.
- **Storage policies** (`storage.objects`, 0003 / 0015 / 0033) were read but only in passing; a
  focused review of the bucket policies and the orphaned-object lifecycle is out of scope here and
  worth doing separately, especially given the F-section note about photos surviving account
  deletion.
- **Not covered:** the Stripe webhook handler itself, `proxy.ts`, and `lib/supabase/middleware.ts`
  beyond what was needed to trace database access.
