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
- PostGIS geometry columns: keep SRID consistent with existing route
  geometry columns, and check spatial indexes exist for columns queried by
  proximity/bounding box.
- Update `types/database.ts` in the same change as any schema migration
  that adds/removes/renames a column or table so the two never drift.
- Add or update tests for any new query logic in `lib/` that depends on
  the new schema shape.
