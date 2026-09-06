# Payments Role

Reusable role instructions for Stripe/billing work in Cornice:
`app/api/stripe/**`, `lib/stripe*`, `lib/actions/billing.ts`. Listed in
`AGENTS.md` → Further Reading, but not auto-loaded — open it yourself when a
task touches payments. See `AGENTS.md` for the full constitution these
extend.

## Scope

- `app/api/stripe/webhook/route.ts` — webhook handler.
- `lib/stripe.ts` (server SDK), `lib/stripeClient.ts` (client SDK loader).
- `lib/stripeWebhook.ts` — `wasAlreadyProcessed`, the event-ID dedup that
  the idempotency rule below depends on.
- `lib/actions/billing.ts` — subscription creation/confirmation, customer
  portal.

Note the premium **UI** is currently commented out and
`app/profil/premium/` redirects away, while everything above stays live.
`docs/premium-plan.md` is the plan to re-enable it — read it before
changing anything here, so your change lands with that plan rather than
across it.

## Rules

- **Signature verification is mandatory and non-negotiable.** Every
  webhook request must go through `stripe.webhooks.constructEvent(body,
  signature, STRIPE_WEBHOOK_SECRET)` before any field of the payload is
  trusted. Never parse `req.json()` directly for a webhook body.
- **Idempotency**: Stripe guarantees at-least-once delivery, so the same
  event can arrive more than once. Handlers must be safe to run twice —
  either because the operation is naturally idempotent (e.g. setting a
  boolean flag to a fixed value, as the current handler does) or via
  explicit event-ID deduplication. If you add a new webhook case whose
  side effect is not naturally idempotent (e.g. incrementing a counter,
  sending a notification, creating a row), it needs explicit dedup —
  don't assume "we haven't seen duplicates yet" is a guarantee.
- **Subscription state**: derive `ist_premium` from Stripe's own
  subscription status (`active`/`trialing` per the webhook;
  `active` + paid invoice per the manual confirmation path in
  `confirmSubscription`), not from client-supplied state. The client only
  supplies IDs (customer ID, subscription ID) — never a trust-me boolean.
- **No client-side secrets.** `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` is the
  only Stripe value that belongs in client code. `STRIPE_SECRET_KEY`,
  `STRIPE_WEBHOOK_SECRET`, and `STRIPE_PREMIUM_PRICE_ID` are server-only.
- The webhook handler updates `profiles.ist_premium` via the service-role
  client (`lib/supabase/admin.ts`) because it has no logged-in Supabase
  session — that RLS bypass is justified by the signature check above.
  `lib/actions/billing.ts` also uses the admin client, but for a different
  reason: it *does* have a verified session, and reaches for the admin
  client only because `stripe_customer_id` and `ist_premium` are not
  granted to the `authenticated` role (migration `0027`). That second
  pattern sits on a user-reachable request path, so every query on it must
  be scoped to the `getUser()`-derived id and never to an id taken from the
  request. Adding a further call site of either kind is protected-area
  work — see `AGENTS.md` → Supabase Rules.
- Add/extend tests around any new webhook event handling or subscription
  state derivation logic.
