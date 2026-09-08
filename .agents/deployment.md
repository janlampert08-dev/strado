# Deployment Role

Reusable role instructions for shipping Strado to production: Vercel
(hosting/build), Supabase (schema + storage), Stripe (webhook endpoint).
Listed in `AGENTS.md` → Further Reading, but not auto-loaded — open it
yourself when a change is about to go live, or when verifying that what is
on `main` is actually what is running. See `AGENTS.md` for the full
constitution these extend.

The "Definition of Done" in `AGENTS.md` ends at the merge: tests, lint,
build, security review, no secrets. This document covers what happens
*after* that, because a merged change is not a deployed change.

## Scope

- `.github/workflows/ci.yml` — what CI does and does not do.
- `supabase/migrations/**` — applying schema to the live database (see
  `supabase/migrations/README.md`).
- Vercel project settings: environment variables, build, domains,
  rollbacks.
- Stripe endpoint configuration (`app/api/stripe/webhook/route.ts`).
- Supabase Storage buckets (`avatars`, route photos) and their policies.

## What is automatic, and what is not

Know this before ticking anything below:

- **CI runs on every PR and every push to `main`** — `npm audit`, lint,
  tests, production build, with placeholder env values. It does not
  deploy and it does not touch the database.
- **Vercel builds and deploys `main`.** It does not apply migrations
  either.
- **Migrations are applied by hand** — Supabase SQL Editor,
  `supabase db push`, or the Supabase MCP `apply_migration`. Whoever
  writes a migration is responsible for applying it.

The consequence, spelled out in `supabase/migrations/README.md`: code and
schema can drift apart with everything green. That has already caused two
production outages (September 2026). Treat the migration checks below as
the load-bearing part of this list, not paperwork.

## Definition of Done — Deployment

### 1. Before the deploy

- [ ] The change is on `main` via a merged PR, with the per-change
      Definition of Done (`AGENTS.md`) actually ticked — not just merged.
- [ ] CI is green **on the merge commit on `main`**, not only on the PR
      branch. A clean PR can still break `main` after a semantic conflict.
- [ ] Every migration in this deploy's diff is applied to the production
      database, verified against the ledger rather than assumed:
      ```sql
      select version, name from supabase_migrations.schema_migrations
      order by version desc;
      ```
      Reconcile every migration version in this deploy against that list —
      do not cut the query short, an unapplied migration can sit far below
      the most recent rows. Names in the ledger are historically
      inconsistent, so they prove nothing; the objects do. And `version` is
      a primary key while the repo has four duplicated prefixes (`0034`,
      `0041`, `0053`, `0054`), so a single matching row does **not** prove
      both files of a duplicated pair ran — check each one's objects
      separately. For a
      migration that *changes* something — a policy, a function body, an
      index, a constraint, a backfill — existence is not enough either:
      read back the current definition, and check the data the migration
      was supposed to move.
- [ ] Schema goes first, code second. Every migration in a deploy is
      backwards compatible with the code currently running, so the
      moments before and after the deploy are both valid states. Anything
      destructive (drop/rename/narrow a column, tighten a constraint)
      is split across two deploys: additive migration → code deploy →
      cleanup migration.
- [ ] `types/database.ts` reflects the schema that is actually live.
- [ ] Every new or changed environment variable is set in Vercel for
      **Production and Preview**, before the deploy that reads it. Values
      live in the platform secret store — never in the repo, never in a
      migration, never in CI (`ci.yml` uses placeholders on purpose).
- [ ] `NEXT_PUBLIC_*` variables are baked into the bundle at build time —
      after changing one, trigger a **rebuild**, not just a redeploy of
      the existing build.
- [ ] `NEXT_PUBLIC_SITE_URL` is set explicitly for the target
      environment. Unset, `lib/actions/billing.ts` falls back to
      `http://localhost:3000` and Stripe Customer Portal return links
      resolve in whatever browser follows them — the user's own machine,
      not a developer's. With nothing listening there the return flow just
      fails; with something listening it hands them an unrelated local
      app.
- [ ] Any new Supabase Storage bucket exists in the production project
      with its access policies, and `next.config.ts` → `images.
      remotePatterns` still covers the host serving those files.
- [ ] The deploy has a way back (see section 4) *before* it starts.

### 2. Protected Areas touched by this deploy

Only relevant if the deploy contains changes to these paths — but if it
does, these are not optional (`AGENTS.md` → Protected Areas).

- [ ] **Stripe** (`app/api/stripe/**`, `lib/stripe*`,
      `lib/actions/billing.ts`): the webhook endpoint is registered in
      the Stripe dashboard for *this* environment, the subscribed event
      types cover every `case` in the handler's switch, and
      `STRIPE_WEBHOOK_SECRET` is the secret of that specific endpoint —
      it is per-endpoint, so test-mode and live-mode values differ and
      are not interchangeable.
- [ ] **Supabase clients** (`lib/supabase/**`): `SUPABASE_SECRET_KEY` is
      still server-only — no `NEXT_PUBLIC_` prefix, no import path that
      reaches a Client Component. A leak here is unrecoverable without a
      key rotation.
- [ ] **Migrations/RLS** (`supabase/migrations/**`): every new table has
      RLS enabled with policies scoped no wider than required — and so
      does every table whose policies this deploy *changes*. A migration
      can leave RLS switched on and still widen an existing policy, which
      reads as a normal query and returns other users' rows; check the
      scope of each changed policy, both that the intended access still
      works and that the unintended access is still refused. Any new
      `SECURITY DEFINER` function is justified and does not trust
      unauthenticated input. Run the Supabase advisors after applying and
      compare against the known baseline — `public.spatial_ref_sys`
      reporting `rls_disabled_in_public` is a permanent, documented
      finding (it is owned by `supabase_admin`; see the migrations
      README). Anything *else* new is a real finding.
- [ ] **Session middleware** (`proxy.ts`, `lib/supabase/middleware.ts`):
      it runs on nearly every request — a regression here signs out every
      user at once, so verify a signed-in session survives the deploy.
- [ ] No secrets, keys, or credentials appear in the diff, the commit
      messages, the build logs, or the deploy output.

### 3. After the deploy

Verification runs against the deployed URL, not localhost.

- [ ] The deployment reached **Ready**, and the build log has no new
      warnings or errors compared to the previous one.
- [ ] The core user loop still turns end to end (`AGENTS.md` → Core User
      Loop): discover a route → start a ride → record → save with
      derived stats → the ride appears in the feed → kudos/rating work.
      A deploy that leaves any handoff between those steps broken is not
      done.
- [ ] Auth works both ways: signed out (explore, route detail) and signed
      in (a gated mutation), plus a fresh sign-in.
- [ ] Runtime errors in Vercel show nothing new since the deploy.
      `serverSourceMaps` is on (`next.config.ts`), so server stack traces
      carry real file/line — use them instead of guessing.
- [ ] If payments were touched: recent Stripe webhook deliveries return
      `200`, and a redelivery of the same event is a no-op
      (`lib/stripeWebhook.ts` deduplication).
- [ ] If the map was touched: tiles and directions render on the
      production domain. Mapbox tokens are usually URL-restricted, so
      this can only fail on the real domain.
- [ ] Mobile viewport check for anything user-facing — this is a
      mobile-first product.

### 4. Rollback

- [ ] There is a known way back before the deploy, and it is understood
      that **a Vercel rollback reverts code, not schema.** The database
      keeps whatever migrations were applied.
- [ ] Destructive migrations therefore have their inverse written down
      (or are split into the two-step sequence in section 1) *before*
      being applied — "we can roll back" is only true for the code half.
- [ ] For anything that destroys **values** rather than shape — `drop`,
      a rewriting `update`, a `delete` — the inverse migration is not a
      recovery plan. It restores the column, not what was in it, and the
      two-step sequence buys compatibility, not recoverability. Before
      applying one: a restore path that has actually been verified, or a
      forward-recovery plan that has actually been tested.
- [ ] If a rollback happens: say so explicitly, record what was rolled
      back and what schema state the database was left in, and treat the
      re-deploy as a new pass through this list.

### 5. Record

- [ ] `supabase/migrations/README.md` is updated whenever migrations are
      applied out of order, skipped deliberately, or backfilled. The
      ledger records *that* a migration ran and the live schema shows
      what exists; the README is the only place the **why** survives —
      which is what makes the three reconcilable later. An exception that
      is not written down there becomes an unexplained gap between repo
      and database.
- [ ] Anything discovered during the deploy that this list did not catch
      is added to it. A checklist that does not grow after an incident is
      the reason the next incident looks the same.

## Open switch-overs — read this before calling the product launched

These are known, deliberate gaps: the code is shipped and correct, but the
environment around it is not yet the one it will run in. They are listed here
rather than in a ticket because this is the file the next deploy opens. Each
was measured on 2026-09-08, not assumed.

### Stripe still runs against the sandbox account

Production is wired to the **sandbox** Stripe account, not the live one. The
evidence is in the data: every row in `public.subscriptions` carries a price id
belonging to `acct_…1xloovE5j4` (confirmed `livemode: false` by reading the
price back), while the live account holds **zero** subscriptions. Three
production profiles therefore have `ist_premium = true` from test payments.

Nothing here is broken — it is pre-launch state. But the switch is one change
with five parts, and doing four of them is worse than doing none:

- [ ] Live `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` and the
      live `STRIPE_PREMIUM_PRICE_ID_*` in Vercel Production. The publishable
      key is `NEXT_PUBLIC_*`, so this needs a **rebuild**, not a redeploy.
- [ ] **Register the live webhook endpoint.** The live account currently has
      none — neither a v1 `webhook_endpoint` nor a v2 event destination. Only
      the sandbox has one, and it points at `strado-orcin.vercel.app`. Point
      the live one at `https://app.strado.ch/api/stripe/webhook` with the same
      seven events the sandbox endpoint subscribes to, and put *that
      endpoint's* secret in `STRIPE_WEBHOOK_SECRET` — the secret is
      per-endpoint, sandbox and live values are not interchangeable.
      Without it: cancellations, payment failures, renewals and
      asynchronously-completed payments never reach the app. A purchase still
      works, but only because `confirmSubscription()` writes when the buyer
      returns to the confirmation page — whoever does not return has paid and
      has no Premium. That is finding A5's shape, re-entering through the
      environment instead of the code.
- [ ] **Pick the right monthly price.** The live account has two active
      CHF 4.90 monthly prices. The one without a `lookup_key` carries
      `tax_behavior: unspecified`; the intended one is
      `cornice_premium_monat` with `tax_behavior: inclusive`. Wrong id means
      wrong tax treatment on every invoice.
- [ ] **TWINT.** AGB Ziff. 12 names TWINT as an accepted payment method; in
      the live account it is `available: false` and switched off, which is an
      account-activation matter, not a code one. Either get it enabled before
      launch or change the AGB — a published term naming a payment method that
      does not exist is the wrong half to leave standing.
- [ ] **Clean up the test-mode leftovers** once live keys are in: the four
      sandbox `subscriptions` rows and the three `ist_premium` flags derived
      from them. Left in place they make the nightly `premium-abgleich` chase
      subscription ids that do not exist in the live account.

### Preview deployments have no Supabase configuration

`NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` are set
for Production but not for Preview, so every preview build throws
"Your project's URL and Key are required to create a Supabase client!" on `/`
(six occurrences across five visitors, last seen 2026-09-08). This is not
cosmetic: it disables the "verify on Preview first" step this document asks
for in section 1, which is precisely the step that would have caught the
sandbox/live confusion above. Set both for Preview and redeploy a preview to
confirm.

### Supabase Auth: leaked-password protection is off

`get_advisors(type: "security")` reports `auth_leaked_password_protection` as
disabled. It is a single switch in the Supabase dashboard (Auth → Passwords)
that checks new passwords against HaveIBeenPwned. There is no migration for
it and no MCP tool — it has to be clicked.

## A deploy is not done when

- The code is on `main` but the migration it needs is not applied. This
  is the failure mode with the worst signal: nothing is red, and the
  feature just silently does not work.
- It was verified only on Preview. Preview and Production have different
  environment variables, a different Stripe mode, and — if configured
  that way — a different Supabase project.
- The build succeeded and nothing else was checked. A successful build
  says the code compiles, not that the product works.
