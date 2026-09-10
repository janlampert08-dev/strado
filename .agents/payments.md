# Payments Role

Reusable role instructions for Stripe/billing work in Strado:
`app/api/stripe/**`, `lib/stripe*`, `lib/actions/billing.ts`. Listed in
`AGENTS.md` → Further Reading, but not auto-loaded — open it yourself when a
task touches payments. See `AGENTS.md` for the full constitution these
extend.

## Scope

- `app/api/stripe/webhook/route.ts` — webhook handler.
- `lib/stripe.ts` (server SDK), `lib/stripeClient.ts` (client SDK loader).
- `lib/stripeWebhook.ts` — `wasAlreadyProcessed`, the event-ID dedup that
  the idempotency rule below depends on.
- `lib/stripeCheckout.ts` — the pure predicates behind the purchase path:
  which open Checkout Session may be reused, whether a returned session is
  the caller's own *and* paid, and whether its subscription is active.
  These live outside `lib/actions/` because a `"use server"` file may only
  export async functions and so cannot be unit-tested; the tests are in
  `lib/stripeCheckout.test.ts`.
- `lib/actions/billing.ts` — subscription creation/confirmation, customer
  portal.

**The purchase runs on the Checkout Sessions API**, not on Payment Intents.
`createCheckoutSession()` creates a `mode: "subscription"`,
`ui_mode: "elements"` session and hands the client its `client_secret`;
`components/PremiumCheckoutForm.tsx` initializes the Checkout SDK with it
(`CheckoutElementsProvider` from `@stripe/react-stripe-js/checkout`),
renders the Payment Element and confirms with `checkout.confirm()`. The
subscription is created by Stripe when the session is paid — nothing here
calls `subscriptions.create` any more. `confirmCheckoutSession()` verifies
the result server-side.

`confirmSubscription()` is the leftover of the previous Payment-Intent
flow, kept only so a redirect payment (TWINT) begun before the switch can
still be confirmed when it returns to `?abo=`. Remove it — and the `?abo=`
branch in `components/AboBestaetigung.tsx` — once no such payment can be
in flight. Don't build anything new on it.

**Both confirmations are Server Actions and must be called as such.** They
write the subscription state and then call `revalidatePath()`; Next.js
throws on a revalidation during render, so calling them from a page's
render kills the page. `app/profil/premium/abschluss/page.tsx` did exactly
that until 2026-09-08 — every successful redirect payment ended on an error
page, after the money had moved. The page now only reads
(`getPremiumStatus()`); `components/AboBestaetigung.tsx` does the
confirming from the browser.

`docs/premium-plan.md` is the older plan document and predates this; where
it disagrees with the code, the code wins (`AGENTS.md`).

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
  subscription status (`active`/`trialing` per the webhook; `active` +
  a `complete`/`paid` Checkout Session per the manual confirmation path in
  `confirmCheckoutSession`), not from client-supplied state. The client only
  supplies IDs (checkout session ID) — never a trust-me boolean. Every such
  ID reaches the server from the browser or the address bar, so bind it to
  the caller's own `stripe_customer_id` before acting on it.
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
