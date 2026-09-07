# Security Role

Reusable role instructions for security review in Strado. Listed in
`AGENTS.md` → Further Reading, but not auto-loaded — open it yourself when
asked to review a change for security implications, or use as a checklist
before merging changes to a Protected Area (see `AGENTS.md`).

## Default posture: read-only review

This role reviews and reports; it does not fix by default. If a real
vulnerability is found, it may be fixed only if the fix is small, safe,
and testable, with a regression test added and the fix clearly documented
— otherwise, document the finding and let the owning change decide how to
address it.

## Checklist

**Authentication & session**
- Is every privileged action gated on `supabase.auth.getUser()` (not just
  the presence of a cookie)?
- Does `proxy.ts` / `lib/supabase/middleware.ts` still refresh sessions on
  the paths that need it?

**Authorization / IDOR**
- Can a request substitute another user's/route's ID and access or modify
  data that isn't theirs? Check both the RLS policy and any
  application-level check.
- Are moderator-only or owner-only actions checked server-side, not just
  hidden in the UI?

**RLS**
- Does every table reachable from `lib/supabase/client.ts` or
  `lib/supabase/server.ts` have RLS enabled with policies that match the
  intended access model?
- Is `lib/supabase/admin.ts` (RLS bypass) only used in contexts where
  authorization was independently established? Two shapes are current:
  a verified webhook signature with no session
  (`app/api/stripe/webhook/route.ts`), and a verified session reaching for
  something RLS deliberately withholds (`lib/actions/billing.ts`,
  `deleteAccount` in `lib/actions/auth.ts`). The second **is** reachable
  from a user-controlled request path — so check that every query on it is
  scoped to the `getUser()`-derived id and not to an id from the request.
  Any new call site needs its own justification in the PR.

**Secrets**
- Any credential, key, or secret in a diff — code, migration, comment,
  test fixture, or committed env file? Block it.
- Any server-only env var (`SUPABASE_SECRET_KEY`, `STRIPE_SECRET_KEY`,
  `STRIPE_WEBHOOK_SECRET`) referenced from a Client Component or a module
  that a Client Component imports?

**Stripe / payments**
- Does the webhook handler verify `stripe-signature` via
  `constructEvent` before trusting the payload?
- Is processing idempotent/safe if Stripe redelivers the same event
  (at-least-once delivery is expected, not exactly-once)?
- Is the Stripe secret key, webhook secret, or price ID ever exposed to
  the client bundle?

**API abuse / rate limiting**
- Do write-heavy endpoints (completions, ratings) still go through the
  existing cooldown checks (`lib/rateLimit.ts` and the DB-level triggers
  in `supabase/migrations/0024_*`)? A new write path that skips them
  reopens the abuse vector those were built to close.

**File uploads**
- Are uploaded file types/sizes validated server-side, not just via the
  `accept` attribute?
- Does Supabase Storage RLS on the bucket restrict who can read/write
  which paths?

**Redirects**
- Does every user-supplied `?next=` still go through `safeInternalPath()`
  (`lib/utils/url.ts`)? It is the app's only open-redirect guard, and the
  auth callback, `signIn()` and several forms all depend on it. A new
  redirect target that skips it is a finding.

**Guest recording**
- The signed-out recording handoff (`lib/trackingStorage.ts`:
  `GUEST_TRACKING_USER_ID`, `issueGuestContinuationToken`,
  `adoptGuestTrackingSnapshot`) carries a ride across sign-up. Is the
  continuation token still single-use, and does adopting a snapshot still
  end in a ride owned by the `getUser()` id — never by an id the client
  supplied?

**Location privacy**
- Published tracks are cropped by `lib/publicTrack.ts` / `lib/track.ts`
  (`cropTrackEnds`, `privacyRadiusM`) so a ride doesn't reveal where the
  rider lives. Does every newly exposed track column, view, or API field
  come from the cropped public track and not the raw `track`? The raw
  column is deliberately absent from every RLS-bypassing view — keep it
  that way.

**Ride statistics**
- Audit finding A1 is only partially fixed (see
  `docs/audit/README.md#remediation-status`): `INSERT` on
  `route_completions` is still granted, so checks in
  `lib/actions/completions.ts` are bypassable by a direct PostgREST write.
  Does the change under review add a new consumer that treats these
  numbers as trustworthy?

**Server/client boundary**
- Any accidental leak of a server-only value into serialized props,
  client component state, or a `NEXT_PUBLIC_*` variable that shouldn't be
  public?
