<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Cornice — Engineering Constitution

This file is the primary reference for any human or AI agent working in this
repository. Read it before making changes. If something here conflicts with
what you observe in the code, trust the code and flag the discrepancy —
this document can drift out of date, the codebase is the source of truth.

## Product

Cornice is a curated car and motorcycle route platform, initially focused on
Switzerland/Zürich. Users discover and propose scenic driving/riding routes,
track completions ("Fahrten"), rate routes, compete on leaderboards, and can
subscribe to a Premium tier (Stripe) for additional features.

## Core User Loop

This is the loop the product exists to keep turning. Any change that touches
one of these steps should be checked against how it affects the transition
into the next one — a feature that strengthens a single step but breaks the
handoff to the next isn't done.

1. **Discover a route** — `app/page.tsx` / `components/ExploreView.tsx` +
   `components/ExploreSidebar.tsx` (explore/search), `app/strecken/[id]/page.tsx`
   (route detail).
2. **Start a ride** — `components/GefahrenSection.tsx` ("Strecke starten" on a
   route page, gated ride) or `app/fahrten/neu/page.tsx` (free ride, no
   route) → `components/FreeRideForm.tsx` / `components/LiveTrackingForm.tsx`.
3. **Drive** — the recording screen, live map via `components/RouteMap.tsx`.
4. **GPS tracking** — `components/useRideRecorder.ts` (client recorder hook),
   `lib/tracking.ts` (start/end gate + proximity for route mode),
   `lib/trackingStorage.ts` (snapshotting so a killed tab/app can resume),
   `lib/geo.ts` (trail/distance math).
5. **Result / route stats** — `components/RideSummaryForm.tsx` submits the raw
   trail to `lib/actions/completions.ts`, which derives every stat
   server-side (distance, coverage, laps, elevation) rather than trusting
   client-sent numbers: `lib/routeCoverage.ts`, `lib/lapDetection.ts`,
   `lib/elevation.ts`.
6. **Post the ride** — same `lib/actions/completions.ts` submission,
   `components/RideVisibilityToggle.tsx` for visibility, landing on
   `app/fahrten/[id]/page.tsx`.
7. **Community reacts** — `components/KudosButton.tsx` /
   `lib/actions/kudos.ts` on the posted ride; `components/RatingSection.tsx` /
   `lib/actions/ratings.ts` on the route itself; moderation of reactions via
   `components/CompletionActionsMenu.tsx` / `lib/actions/reports.ts`.
8. **Next ride** — `app/feed/page.tsx` (global/following feed) surfaces
   others' rides and routes, closing the loop back to step 1.

## Stack

Versions below are read directly from `package.json` — verify there before
relying on version-specific behavior, especially for Next.js 16, which has
breaking changes from earlier versions (see the block at the top of this file).

- **Next.js** 16.3.3 (App Router, Turbopack build)
- **React** 19.2.8 / **react-dom** 19.2.8
- **TypeScript** ^5
- **Tailwind CSS** ^4 (via `@tailwindcss/postcss`)
- **Supabase**: `@supabase/supabase-js` ^2.112.4, `@supabase/ssr` ^0.12.5
- **Stripe**: `stripe` ^22.6.0 (server), `@stripe/stripe-js` ^9.14.0 /
  `@stripe/react-stripe-js` ^6.8.2 (client, Payment Element)
- **Mapbox GL** ^3.29.0 (routing/maps, `mapbox-gl` + `@types/mapbox-gl`)
- **Vitest** ^4.1.11 (unit tests)
- **ESLint** ^9 with `eslint-config-next`

Node.js: Next.js 16 requires **Node >= 20.9**. CI and local development
should use a current LTS release (Node 22).

## Architecture

- `app/` — Next.js App Router: routes, pages, layouts, and API route
  handlers (`app/api/**`).
- `components/` — reusable UI components (client and server).
- `lib/` — business logic and third-party integrations (Mapbox, weather,
  GPX parsing, leaderboard math, etc.).
- `lib/actions/` — Server Actions (`"use server"`): the primary path for
  authenticated mutations from forms/UI.
- `lib/supabase/` — Supabase client factories:
  - `client.ts` — browser client (publishable key only).
  - `server.ts` — server client bound to the request's cookies/session
    (respects RLS as the logged-in user).
  - `middleware.ts` — session refresh, invoked from `proxy.ts`.
  - `admin.ts` — **service-role client. RLS bypass. Server-only.** See
    Protected Areas below.
- `types/` — shared TypeScript types, including `database.ts` which mirrors
  the SQL schema.
- `supabase/migrations/` — version-controlled database schema, RLS
  policies, functions, and triggers. This is the only way the schema
  changes.

## Core Rules

1. Never modify `main` directly. Every change lands via a pull request.
2. Every feature/fix uses a dedicated branch, named for what it does.
3. Every branch results in a PR — no direct pushes to `main`.
4. Never commit secrets, API keys, tokens, or credentials of any kind —
   not in code, not in migrations, not in comments, not in test fixtures.
5. Never expose server-only credentials (Supabase secret key, Stripe secret
   key, webhook secrets) to client components, client bundles, or
   `NEXT_PUBLIC_*` variables.
6. Never expose the Supabase service-role/secret key outside
   `lib/supabase/admin.ts` and the specific server-only call sites that
   require it.
7. Never bypass Row Level Security (RLS) casually. RLS is the primary
   authorization boundary for direct table access — see Supabase Rules.
8. Database changes require a new migration file in
   `supabase/migrations/`. There is no other path to change schema.
9. Never modify an already-applied (numbered) migration. Create a new one,
   even to fix a mistake in a previous migration — the migration history is
   an append-only audit log.
10. Never manually alter the production schema outside of a migration
    unless there is no safe alternative, and treat that as an exception
    requiring explicit human sign-off, not a default workflow.
11. Stripe webhook handlers must verify the `stripe-signature` header via
    `stripe.webhooks.constructEvent` before trusting any payload content.
12. Stripe webhook processing must be safe against duplicate delivery
    (Stripe's own docs guarantee at-least-once, not exactly-once). Side
    effects must be idempotent or explicitly deduplicated.
13. Preserve the server/client boundary: Server Components, Server Actions,
    and Route Handlers may use server-only secrets; Client Components may
    not import modules that reference them.
14. Prefer existing utilities/actions/components over writing new ones.
    Check `lib/`, `lib/actions/`, and `components/` before adding
    duplicate logic.
15. Do not introduce unnecessary dependencies. Justify any new dependency
    against what's already installed.
16. Do not silently change business rules (cooldowns, premium gating,
    moderation rules, visibility settings) as a side effect of an unrelated
    change. If a change affects business rules, call it out explicitly.
17. Never claim tests, lint, or build passed unless you actually ran the
    command and observed the result in this session.
18. Do not weaken, disable, or work around security controls (RLS,
    signature verification, auth checks, rate limits) in order to make a
    test or build pass. Fix the underlying issue or the test, not the
    control.

## Protected Areas

The following paths implement security-critical behavior and require
additional care and review before merging changes to them:

- `/proxy.ts` — session refresh middleware, runs on nearly every request.
- `/lib/supabase/` — all Supabase client factories, especially `admin.ts`.
- `/supabase/migrations/` — schema, RLS policies, database functions.
- `/app/api/stripe/` — Stripe webhook handler.
- `/lib/stripe*` — Stripe server/client SDK wrappers.
- `/lib/actions/billing.ts` — subscription creation/confirmation, customer
  portal.
- `/lib/actions/auth.ts` — sign-in/sign-up.
- `/lib/actions/moderation.ts` — route approval/rejection (moderator-only
  mutations).
- `/lib/moderation.ts` — moderator-check helper.
- `/lib/rateLimit.ts` — abuse-prevention cooldown checks.
- `/.github/` — CI/CD configuration.
- `/AGENTS.md`, `/SECURITY.md` — this constitution and the security policy.

Changes to these paths should be minimal, explained in the PR description
(what changed and why it's still safe), and — for anything touching auth,
RLS, or payments — should include regression tests where practical.

## Supabase Rules

**RLS is a security boundary, not a formality.** Any table reachable from
the browser client or a Server Action running as the logged-in user is
only as safe as its RLS policies. `lib/supabase/admin.ts` bypasses RLS
entirely and must stay server-only, called only from contexts where
authorization has already been established some other way (e.g. a
verified Stripe webhook signature).

Before changing a table, in this order:

1. Inspect the current schema and its migration history in
   `supabase/migrations/`.
2. Inspect the current RLS policies on that table.
3. Inspect the queries/actions in `lib/` and `lib/actions/` that read or
   write it, so you understand every code path affected.
4. Inspect `types/database.ts` for the type shape and update it if the
   schema changes.
5. Add or update tests covering the new behavior, especially anything
   authorization-sensitive.

**Never solve an authorization problem by disabling RLS**, granting a
policy to `anon`/`authenticated` more broadly than required, or routing
around it with the admin client from a user-facing code path. If RLS makes
a legitimate use case hard, that's a signal to design a more precise
policy — not to bypass the boundary.

`SECURITY DEFINER` database functions run with elevated privileges
regardless of RLS. Treat any new or modified `SECURITY DEFINER` function
as protected-area work: it needs to justify why it can't run as the
caller, and it must not encode secrets or trust unauthenticated input to
decide what it's allowed to do.

**Think twice before executing SQL.** Any statement that reaches the
database — via the Supabase MCP tools, `psql`, or the Supabase CLI —
requires an explicit confirmation. Claude Code is configured to prompt
for one (`permissions.ask` and the `PreToolUse` hook in `.claude/`).
That prompt is a checkpoint, not a formality, and clicking through it
does not move responsibility to whoever clicked. Before asking for it,
be able to answer:

1. What does the statement do, which tables does it touch, and roughly
   how many rows?
2. Does it write? If so, is it reversible, and what is the way back — a
   backup, an inverse statement, a restore?
3. Does it belong in a migration instead? Every schema change does (Core
   Rule 8); ad-hoc DDL against a live database is not a substitute for
   `supabase/migrations/`.
4. Does it run as the logged-in user under RLS, or does it bypass that
   boundary? If it bypasses, why is that justified here?
5. Is it aimed at production data, and is any `WHERE` clause missing or
   wider than intended?

If an answer is unclear, do not run the statement yet — narrow it, wrap
it in a transaction that can be rolled back, or try it against a branch
or a local stack first. A read-only `SELECT` still deserves question 5:
an unbounded query against production is a load problem rather than a
data problem, but it is still a problem.

Two commands are exempt because they do not reach the database:
`supabase migration new` (writes a file under `supabase/migrations/`) and
`supabase migration list` (reads the ledger). Everything else that can
apply schema — `apply_migration`, `execute_sql`, `supabase db push`,
`supabase migration up|repair|squash|fetch`, `psql` — stays behind the
prompt. The exemption is an allowlist in `.claude/`, not a relaxation of
the rule: a subcommand nobody has vetted still prompts, and
`.claude/hooks/sql-guard.test.ts` is the regression test for that.

## AI Agent Behavior

When an AI agent (Claude Code or otherwise) works in this repository, it
should:

- Inspect existing code, schema, and tests before modifying anything.
- Make small, focused changes scoped to the task at hand.
- Avoid speculative refactors, unrequested abstractions, or "while I'm
  here" cleanups outside the task scope.
- Stay within the task's scope — flag out-of-scope findings rather than
  fixing them inline.
- Explain architectural or security implications of a change in the PR
  description, especially for Protected Areas.
- Actually run lint/test/build and report real results — never assert
  success without having executed the command.
- Never expose secrets: not in code, not in commit messages, not in PR
  descriptions, not in chat/log output. If a credential is discovered
  already exposed (e.g. in Git history), reference it generically and
  report it — never reproduce its value anywhere.

## Definition of Done

A change is done when:

- [ ] The implementation matches the task's actual scope (no scope creep).
- [ ] Relevant tests exist and pass (`npm run test`).
- [ ] Lint passes (`npm run lint`).
- [ ] The production build succeeds (`npm run build`).
- [ ] A security review has been considered for any Protected Area touched.
- [ ] No secrets, keys, or credentials are present in the diff.
- [ ] The PR description explains what changed, why, and lists the
      validation commands actually run and their results.
