# Backend Role

Reusable role instructions for backend work in Strado: API route handlers
(`app/api/**`) and Server Actions (`lib/actions/**`). Listed in `AGENTS.md`
→ Further Reading, but not auto-loaded — open it yourself when a task is
scoped to backend/server work. See `AGENTS.md` for the full constitution
these extend.

## Scope

- `app/api/**` — Route Handlers.
- `lib/actions/**` — Server Actions (`"use server"`).
- `lib/*.ts` — business logic these call into.

## Rules

- Every session-backed mutation must authenticate the caller
  (`supabase.auth.getUser()`) before doing anything, and check
  authorization for the specific resource/action — don't rely on the
  client to only call it correctly.
  The one exception is a mutation with no Supabase session by design: the
  Stripe webhook, where the verified `stripe-signature` replaces
  `getUser()` as the authentication step. Its payload is still external
  input and must be validated on its own (see `.agents/payments.md`).
- Validate all external input (form data, request bodies, path params)
  before using it in a query or passing it to a third-party API. Don't
  trust type annotations alone; they don't exist at runtime.
- Prefer the request-scoped Supabase client (`lib/supabase/server.ts`),
  which runs as the logged-in user and is bound by RLS. `lib/supabase/admin.ts`
  bypasses RLS and is used in exactly two shapes today:
  - **No session at all**, trust established otherwise — the Stripe webhook
    (`app/api/stripe/webhook/route.ts`), authorized by its signature check.
  - **Session verified, RLS deliberately withholding** —
    `lib/actions/billing.ts` and `deleteAccount` in `lib/actions/auth.ts`,
    which call `getUser()` first and then need something the
    `authenticated` role is intentionally not granted (the Stripe columns
    from migration `0027`, the GoTrue admin API).

  The second shape is reachable from a request, so scope every query on it
  to the `getUser()`-derived id — never to an id from the form or URL. A
  third call site of either shape is protected-area work: justify in the PR
  why a precise RLS policy or a narrow `SECURITY DEFINER` function can't do
  it instead.
- Defense-in-depth: where a mutation is already protected by an RLS
  policy, don't skip the application-level check too — see
  `lib/actions/moderation.ts` for the existing pattern of checking
  `isModerator()` in addition to the RLS policy.
- Respect existing rate-limiting/cooldown patterns (`lib/rateLimit.ts` and
  the DB-level triggers in `supabase/migrations/0024_*`) — don't introduce
  a new write path that bypasses them.
- Write tests for new business logic in `lib/`, especially anything with
  edge cases (see the existing `*.test.ts` files for the project's style —
  plain Vitest, no mocking framework beyond what's already in use).
- Preserve the server/client boundary — nothing here should be imported by
  a Client Component.
