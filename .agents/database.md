# Database Role

Reusable role instructions for database/schema work in Strado:
`supabase/migrations/**`, RLS policies, and `types/database.ts`. Listed in
`AGENTS.md` → Further Reading, but not auto-loaded — open it yourself when a
task touches schema. See `AGENTS.md` for the full constitution these extend,
and the "Supabase Rules" section in particular.

## Scope

- `supabase/migrations/**` — schema, RLS policies, functions, triggers,
  indexes, PostGIS geometry columns.
- `types/database.ts` — hand-maintained types mirroring the schema.

## Rules

- **Never modify an already-applied (numbered) migration.** Every change,
  including fixes to a previous migration's mistake, is a new migration
  file with the next number. The migration history is an append-only
  audit log of exactly what has been run against the database.
- **Check the highest number on `main` *and* on any open PR before
  choosing yours.** `0034`, `0041`, `0053` and `0054` each already exist
  twice, from parallel branches picking the same next number.
  `supabase_migrations.schema_migrations.version` is a primary key, so a
  duplicate prefix cannot be recorded twice — one half silently never
  registers, and reconciling a deploy by version number becomes ambiguous.
  If you cannot avoid a collision, document it in
  `supabase/migrations/README.md` in the same commit.
- Before writing a migration: read the current schema and RLS state for
  the table(s) involved by scanning prior migrations that touch them (they
  are the only source of truth — there is no separate schema dump to
  trust instead).
- **Never disable RLS as a shortcut** to make a query work. If a policy is
  blocking a legitimate access pattern, write a more precise policy that
  allows exactly that pattern — don't turn RLS off or grant broader access
  than the use case needs.
- Any `SECURITY DEFINER` function is a privilege escalation relative to
  RLS — justify why the caller can't do it as themselves, keep the
  function narrowly scoped to one operation, and never embed a secret or
  password inside the function body as its access control (see the
  history in `0022_stripe_billing.sql` / `0023_remove_set_premium_status_rpc.sql`
  for why: a secret embedded in migration SQL is committed to Git history
  in plaintext forever, and `grant execute ... to anon` makes it callable
  directly from the browser with the public key).
- **Moderator checks in policies go through `(select public.ist_moderator())`.**
  Since `0134_rechte_nachziehen` neither `anon` nor `authenticated` may read
  `profiles.is_moderator` (it made every moderator account enumerable with
  the public key). A policy that still writes
  `exists (select 1 from profiles where id = auth.uid() and is_moderator)`
  fails with "permission denied for table profiles" for every caller — and
  on a `public`-role policy on `routes` that means the whole map for
  signed-out visitors. The app reads its own flag through the same
  function (`lib/moderatorStatus.ts`).
- PostGIS geometry columns: keep SRID consistent with existing route
  geometry columns, and check spatial indexes exist for columns queried by
  proximity/bounding box.
- **A row is not always a ride: `route_completions` holds parent rides and
  detected segments in one table.** `save_free_ride_with_segments`
  (`0050`, rewritten in `0081`) writes one extra row per route recognised
  inside a free ride, each carrying its own `distanz_km` — the same
  kilometres that are already in the parent row. Any new aggregate has to
  pick a side, and the two sides are not interchangeable:
  - **Quantity** ("how far did I ride", "how often", "how much ascent")
    filters `parent_completion_id is null`. Without it one physical ride
    counts as 1 + N rides and its distance 1 + N times.
  - **Membership** ("which routes have I ridden") does *not* filter —
    getting credit for a route picked up mid-ride is the point of
    detection, and such counters dedupe per route anyway.

  `app/profil/page.tsx` and `lib/achievements.ts` run both queries side by
  side and say which is which. Ascent happens to be unaffected today
  (segments carry `null` there), but filter it with the rest rather than
  carving out an exception nobody will remember. `public_fahrten` and
  `leaderboard_completions` deliberately do **not** carry the column
  (`0050`), so the same split cannot be made there without a migration —
  see PR #274.
- Update `types/database.ts` in the same change as any schema migration
  that adds/removes/renames a column or table so the two never drift.
- Add or update tests for any new query logic in `lib/` that depends on
  the new schema shape.
