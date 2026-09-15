<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Strado — Engineering Constitution

This file is the primary reference for any human or AI agent working in this
repository. Read it before making changes. If something here conflicts with
what you observe in the code, trust the code and flag the discrepancy —
this document can drift out of date, the codebase is the source of truth.

## Product

Strado is a curated car and motorcycle route platform, launching **Zürich
first** — the canton and what is within a comfortable Sunday of it, not
Switzerland as a whole. Users discover and propose scenic driving/riding
routes, track completions ("Fahrten"), rate routes, compete on leaderboards,
and can subscribe to a Premium tier (Stripe) for additional features.

The Zürich-first scope is a growth decision, not a stage we are waiting to
outgrow, and it is the reason to resist "while we're here" additions of
routes elsewhere. A rider who recognises the place on a shared ride — *that's
the road above my village* — forwards it to someone who also drives it; a
rider who recognises nothing has nothing to forward. Word of mouth is local
before it is national, so density inside one region beats coverage across
many, and a half-empty national map reads as an abandoned product while a
full regional one reads as a finished one. Two consequences for everyday
work:

- **The place name is the unit of recognition.** Whatever a non-user sees
  first — the share image from `lib/shareImage.ts`, the OG images, route
  titles — leads with *where* the ride was, not with its statistics. Distance
  and elevation are for the rider who was there; the name is for the person
  deciding whether to tap.
- **Proximity is worth more than reach.** When judging a promotion channel,
  the question is what share of its audience lives within driving distance of
  a route that already exists in the app — not how large that audience is.

The UI, the code comments, and the migration filenames are **German**. Match
that when adding to them; this document and the `.agents/` role files are the
deliberate exception.

## Current State

Facts that are true right now and are expensive to rediscover. Anything
here is a snapshot — if the code disagrees, the code wins, and this section
is what should be corrected.

- **Premium is live.** The purchase page, Payment Element, customer portal,
  the `subscriptions` table and the nightly reconciliation cron all ship.
  Founder seats (Gründerpreis) were sold until 2026-09-07 and are no longer
  offered: the DB functions from `0065`–`0069` remain but are no longer
  called, and `STRIPE_PREMIUM_PRICE_ID_GRUENDER` only names existing
  subscriptions. The "Gold-Abzeichen" opt-in was removed on 2026-09-07 — it
  was never rendered by any component; the column
  `profiles.zeigt_premium_badge` remains in the schema and the views, but no
  longer reaches the app: `lib/leaderboard.ts` neither selects nor evaluates
  it. This section previously said the opposite — that the Premium
  components were commented out and re-enabling them was the active workstream
  — which is why the paid path went unaudited until 2026-09-07: a security
  pass scoped from this file skipped it as not-yet-shipped. Treat everything
  under `app/profil/premium/`, `lib/actions/billing.ts`, `lib/stripe*` and the
  webhook as production code.
  - **The purchase runs on the Checkout Sessions API**
    (`ui_mode: "elements"`), not on Payment Intents: `createCheckoutSession()`
    creates the session, `components/PremiumCheckoutForm.tsx` drives it with
    `CheckoutElementsProvider` / `checkout.confirm()`, and Stripe creates the
    subscription once the session is paid. `confirmSubscription()` and the
    `?abo=` branch of the return page are the leftovers of the previous flow,
    kept only until no redirect payment started before the switch can still
    be in flight — see `.agents/payments.md`.
  - **The return page confirms from the browser, not during render.**
    `app/profil/premium/abschluss/page.tsx` only reads
    (`getPremiumStatus()`) and shows the confirmation;
    `components/AboBestaetigung.tsx` calls the confirmation Server Action
    and retries while a TWINT payment settles. Until 2026-09-08 the page
    called it during its own render, and because the confirmation ends in
    `revalidatePath()` — a mutation Next.js forbids in a render — every
    successful redirect payment landed on an error page after the money had
    moved. Nothing here may confirm, write or revalidate from a render.
- **The domains are live and every link now points at them.** `strado.ch`
  serves the info page and the legal texts under `/legal/…`, `app.strado.ch`
  serves the application, and `contact@strado.ch` is the contact address.
  The apex answers with a permanent 308 to `www.strado.ch` and keeps the
  path, so `strado.ch/legal/agb` resolves; the apex form is what gets
  linked, because it is what the legal texts name. This entry previously
  said nothing was served under either hostname — that was true when it was
  written and stopped being true without the entry noticing, which is why
  the links sat on `cornice-ch.vercel.app` longer than they had to.
  - `LEGAL_BASE_URL_STANDARD` in `lib/constants.ts` is `https://strado.ch`.
    `NEXT_PUBLIC_LEGAL_BASE_URL` no longer needs setting in production; it
    remains an override for preview environments. The rule that governed
    the old value still governs the next one: only an address we own **and**
    that answers belongs there — owning a domain removes the hijacking
    risk, not the dead-link one.
  - The `[[DOMAIN]]` placeholder in `docs/rechtstexte/` is gone, resolved
    rather than split: the platform references (`agb.md` Ziff. 1.1,
    `datenschutz.md` 2.1) name both hosts explicitly, and the legal-text
    references (`impressum.md`, every `/legal/…` link) name `strado.ch`.
    As of 2026-09-07 every other placeholder there is resolved too, in both
    the Markdown drafts and the published HTML: the provider is Jan
    Lampert, Einzelunternehmen (not in the commercial register), c/o
    Softsite AG, Leutschenbachstrasse 45, 8050 Zürich; contact is e-mail
    only, there is no phone line; there is no UID and no MWST number (the
    impressum carries no register section at all); Gerichtsstand is Zürich
    (AGB Ziff. 16.4). `grep -r '\[\[' docs/rechtstexte/` must stay empty.

- **The published pages now say Strado, and name `contact@strado.ch`.**
  `janlampert08-dev/stradoinfo` was renamed and merged on 2026-09-07, so
  the three legal pages linked from the sign-up form no longer carry the
  old product name. `contact@strado.ch` was confirmed to receive mail on
  2026-09-07 (owner-verified, not assumed). It is the *only* contact
  channel the impressum names — the phone line was dropped on purpose —
  and Art. 3 Abs. 1 lit. s UWG requires that channel to work, so a change
  of mailbox is a legal-text change, not just an ops one.

- **`NEXT_PUBLIC_SITE_URL` is set in Vercel, but a value set there does not
  reach a build that already happened.** Next.js inlines every
  `NEXT_PUBLIC_*` variable at build time — server code included, not just
  the client bundle (`node_modules/next/dist/docs/01-app/02-guides/environment-variables.md`,
  "After being built, your app will no longer respond to changes to these
  environment variables"). Changing one in the dashboard therefore does
  nothing until the next deployment. This is the trap to remember for any
  `NEXT_PUBLIC_*` value: setting it is only half the change.
  - `siteUrl()` in `lib/siteUrl.ts` resolves
    `NEXT_PUBLIC_SITE_URL` → `VERCEL_PROJECT_PRODUCTION_URL` → localhost.
    The middle one carries no `NEXT_PUBLIC_` prefix, so it *is* read at
    runtime — which is what keeps a stale build off `localhost`.
  - Because the function is only ever called server-side, the
    `NEXT_PUBLIC_` prefix buys nothing and costs this freezing. Renaming it
    to `SITE_URL` would make it a true runtime value; that needs the repo
    and the Vercel dashboard changed together, so it has not been done.
- **Die CSP wird durchgesetzt, nicht mehr nur berichtet.** `next.config.ts`
  liefert seit dem Wechsel eine echte `Content-Security-Policy` statt
  `Content-Security-Policy-Report-Only` aus. Der Report-Only-Modus war als
  Beobachtungsphase gedacht, hat aber nie beobachtet — es war kein
  `report-uri`/`report-to` gesetzt. Folge für neue Arbeit: ein Skript, ein
  Iframe, ein `fetch` oder ein Bild von einer neuen Fremd-Origin wird im
  Browser blockiert, bis die Origin in der passenden Direktive steht. Das
  fällt lokal auf, weil die Policy auch im Dev-Modus scharf ist (mit zwei
  ausdrücklichen Dev-Ausnahmen: HMR-Websocket und das Debug-Skript von
  `@vercel/analytics`). `script-src` trägt weiterhin `'unsafe-inline'` und
  `'unsafe-eval'`; der Ersatz durch Nonces verlangt die CSP pro Anfrage in
  `proxy.ts` und macht jede Seite dynamisch — offen, bewusst.
- **Migrations are applied by hand.** Green CI means nothing about the live
  schema — nothing applies a migration for you. As of 2026-09-14 the repo and
  the production database do match: `0083_feedback` went in on 2026-09-13, and
  `0080_motorklassen`, `0081_freie_fahrt_motorklasse_belegt`,
  `0082_motorklasse_backfill_freie_fahrten` and `0084_creator_links` followed
  the same day, in that order; `0085_bestenlisten_nach_fahrzeugtyp` went in on
  2026-09-14, **ahead of the code that reads it** — that code is still on a
  branch, which is the intended order (schema first, code second). Each was
  verified against the objects rather than against the ledger —
  `apply_migration` stamps a timestamp as `version`, so a search for the file
  number finds nothing. `0086_strecken_anlegen_wieder_offen` went in on
  2026-09-14, also **ahead of its code** — which is harmless here and not
  merely tolerable: it widens a policy rather than narrowing one, so until
  PR #220 ships the Server Action simply keeps refusing and nothing changes.
  Its header comment says "acht freigegebene Strecken"; the live count is
  **thirteen** — the eight comes from the frozen snapshot in
  `docs/marketing/instagram/daten.mjs`, and the migration file stays as
  written because Rule 9 forbids touching an applied one. The two files
  that remain
  un-applied (`0042`, `0058`) are superseded by `0076` and must **not** be
  applied — see `supabase/migrations/README.md`, which is the only place that
  distinction survives, plus `.agents/deployment.md`.
  `0088_herkunft_und_konversionen` through `0093_creator_funktionen_anon_entziehen`
  went in on 2026-09-14, in that order, **ahead of the code that uses them**
  (PR #236). They start at `0088` because `0087_premium_abzeichen_spalte`
  (PR #235) took `0087` the same day; both branches had picked `0087`
  independently off a `main` that ended at `0086`.
  `scripts/check-migration-prefixes.mjs` cannot catch that — it only sees
  one branch — so the check that matters is the one `.agents/database.md`
  actually asks for: read the open PRs before choosing a number.
  Two lessons from applying them are worth more than the list:
  - **A `create or replace` on a live function needs the live body read
    first.** `0088` and `0090`/`0092` rewrite `handle_new_user` and
    `anonymize_account`. Both were read out of the database and compared
    against the versions the migrations build on (`0001` and `0076`)
    before anything was written; had `0087` touched either, the replace
    would have silently reverted it.
  - **`revoke execute ... from public` is never enough.** `0091` did only
    that for `creator_kennzahlen()` / `creator_verlauf()` and asserted in a
    comment that `anon` therefore had nothing. It had a **direct** grant —
    Supabase's default privileges hand one to `anon` for every new function
    in `public`, and a revoke from PUBLIC does not touch it. Same trap as
    `0047` and `0048`, third time. It exposed nothing (both functions
    filter on `auth.uid()`, which is NULL for `anon`; called as `anon` they
    return zero rows — measured), and `0093` closed it. Write
    `from anon, authenticated` explicitly, the way `0088` did for the
    sequence.
  - **`0094_creator_verlauf_nur_aufrufe` went in on 2026-09-15** (ledger
    `20260915075341`), again **ahead of the code that uses it** — PR #236
    and #243 are both still open. It is the review nacharbeit on the six
    above, and the only one of the set that *narrows* something already
    live, which is precisely why it went in early rather than late: until
    the code deploys, nothing in production calls the function, so the two
    columns are gone before anyone can fetch them.
    `creator_verlauf()` returned `registrierungen` and `abos` per day to
    any `authenticated` creator; nothing ever drew them, and at small
    numbers a day-bucket holding a single registration names the day one
    account was created — which `profiles.created_at`, world-readable
    since `0034`, then turns into a person. That contradicts the published
    privacy policy word for word, so the migration drops both columns
    (drop + create, the return type changes). It also wraps the herkunft
    block of `handle_new_user` in its own `exception` block — `0088`
    promises in a comment that a registration can never fail on the
    measurement, and without a handler a foreign-key error there aborts
    the signup — and adds the index the per-day query wants. The live body
    of `handle_new_user` was read out and compared against `0088` first,
    as the first lesson above demands; it matched statement for statement.
    **The check afterwards had a gap the earlier six did not have:**
    `execute_sql` was blocked after the write, so it ran through
    `generate_typescript_types`, `get_advisors` and `list_migrations` —
    return type, grants and ledger were confirmed, but the index was not
    seen individually and there were no rolled-back functional tests. A
    later session closed the first half against the catalog: the index
    stands as `(code, art, ereignis_am)`, `handle_new_user` carries both
    the `exception` block and `pg_temp`, and `creator_verlauf` is granted
    to `authenticated` but **not** to `anon` — the trap that caught `0047`,
    `0048` and `0091`. What stays unmeasured is only the functional test:
    the `exception` branch is read, not exercised.
    `supabase/migrations/README.md` names exactly what that leaves
    unmeasured, with the queries to close it.
    **Still open after it, and a product decision rather than a
    migration:** `creator_kennzahlen()` hands out live running totals, so
    a creator who polls it can still correlate an increment against
    `profiles.created_at`. Closing that means a k-threshold, coarser
    buckets, or narrowing the `0034` grant — the last of which would also
    close the standing finding named in `0087`'s own header. The privacy
    text now says this plainly rather than promising more than it keeps.
  - **There is no separate staging database — confirmed, and staying that
    way.** The linked Supabase account holds exactly one project, and it is
    production; the owner confirmed on 2026-09-14 that `staging` points at
    it and that this is deliberate, not an oversight to be fixed. The
    rehearsal that "Release Flow" below describes therefore cannot happen
    at all: a migration is applied once, and that once is production.
    Three things follow for every piece of work from here on. A migration
    that drops, rewrites or backfills is a production operation with no dry
    run — plan the way back before applying it, not after. Every test ride,
    account and route created on `staging` **is** production data, and
    shows up in production counts. And a sandbox purchase on `staging`
    writes real rows into the production tables that hang off the payment
    path — `creator_konversionen` (0088, live since 2026-09-14) is the
    newest of them; only the Stripe side is genuinely separate.
- **Migration numbers are not unique.** `0034`, `0041`, `0053`, `0054`, `0059`
  and `0060` each exist twice — six pairs, not four. Reconciling a deploy by
  version number alone is ambiguous, so check the objects. In the `0059` and
  `0060` pairs the second half was the security migration (the fixes for audit
  findings A1 and A3); both were applied on 2026-09-08, so each of the six
  prefixes now has both halves live. `scripts/check-migration-prefixes.mjs` runs in CI
  and fails on a *new* collision; the six existing pairs are listed there as
  legacy.
- **Where a user came from is recorded from 2026-09-14 on.** A click on
  `app.strado.ch/c/<code>` leaves a first-party cookie carrying only the
  creator's code (`lib/herkunft.ts`, 90 days, First Touch wins); `signUp()`
  passes it through `raw_user_meta_data`, and `handle_new_user` validates it
  against `creator_links` before writing `registrierung_herkunft` (`0088`).
  A trigger on `subscriptions` (`0089`) then records in
  `creator_konversionen` when such an account first becomes paying — which
  is the whole point: a purchase two months after the sign-up is still
  attributable. Three things to know before touching it. The conversion log
  is **append-only and deliberately window-free** — whether a purchase 200
  days later still counts is decided in the evaluating query, never in the
  trigger, because an unrecorded event is gone while a misapplied rule can
  be reapplied. It **survives account deletion**: `anonymize_account`
  (`0090`) drops the origin row but only nulls `user_id` on the log, so the
  creator keeps the count and the person keeps their deletion. And a
  creator code that has produced registrations **can no longer be deleted**
  (foreign key); deactivating is the intended move, and
  `lib/actions/creatorLinks.ts` translates the constraint into that
  sentence. The cookie is named in the privacy policy — both in
  `docs/rechtstexte/datenschutz.md` (Ziff. 3.11) and in the published HTML
  in `janlampert08-dev/stradoinfo` — with no consent banner: that was a
  deliberate decision, so a change to the cookie's name, lifetime or
  contents is a legal-text change in two repositories.
  - **Creators have accounts, and there is no `ist_creator` column.** A
    creator *is* someone with a row in `creator_links` carrying their
    `creator_user_id` (`0091`); the assignment is the role. That avoids a
    second source of truth, and it keeps the fact off `profiles`, which is
    world-readable since `0001`. Moderators assign it while creating a code
    or afterwards, under `/moderation/creator`; the assigned account then
    sees `/creator` with clicks, accounts and subscriptions for its own
    codes. What it must never see is *who* — so the dashboard reads
    `creator_kennzahlen()` / `creator_verlauf()`, `SECURITY DEFINER`
    functions that aggregate inside the database and hand out numbers only.
    Never open `creator_konversionen` row-wise to reach the same figures:
    it carries `user_id`, and any row-level grant answers the second
    question along with the first. The same two functions feed the
    moderation view (a moderator gets every row) — one rule, one source.
    Clicks are counted per code and day in `creator_klicks` with no IP, no
    time and no identity, via `creator_klick_zaehlen()` called from
    `after()` in the redirect handler. That counter is **indicative, not
    payable**: codes are public and the RPC is reachable with the anon key,
    so the handler's IP limit does not bind it. Registrations and
    subscriptions are the trustworthy numbers — they go through `signUp()`
    and Stripe.
- **Open audit findings are tracked in
  `docs/audit/README.md#remediation-status`**, not in GitHub issues. Read
  that table before concluding you have found something new — most of the
  original findings are closed. A2, A3, A4, A5 and A6 are marked **Fixed**
  there, each naming the code that closed it, and so is all but a handful of
  §B. What remains open is narrower than the headline suggests:
  - **A1, leg 2 — the ride clock.** Two of A1's three legs are closed. The
    A1 table further down `docs/audit/README.md` spells out which, and it is
    the authority — not this line, which has been wrong about A1 before.
    `dauer_sekunden` itself *is* derived server-side — `logTrackedCompletion`
    recomputes it with `computeTrailStats()` and deliberately ignores whatever
    number the client posted. What it cannot check is the **timestamps in the
    trail it derives from**: a genuine trail replayed with compressed times
    yields a shorter duration that still passes the `0059` speed band. Closing
    it needs a ride start the server recorded itself, and the recorder is open
    to signed-out visitors, so any fix changes the guest flow. A product
    decision, not a migration.
  - **§B — React 19 clears uncontrolled fields on a failed submit.** Fixed for
    the photo input only (`MultiPhotoInput`). `AnmeldenForm`,
    `RegistrierenForm`, `PasswortVergessenForm`, `PasswortAendernForm` and
    `RatingSection` still lose typed text when a submit fails.
  - **§B — ascent sampling.** Fixed for rides; route metrics stay at 300
    points on purpose.

  Until 2026-09-14 this entry said the opposite — "A1 is partially fixed; A4,
  A5, A6 and everything in §B are open". That was this file quoting the
  table's catch-all row while dropping its qualifier: the row reads "Open
  **except the rows above and below**", and the rows immediately above it are
  A4, A5 and A6, each marked Fixed. A conditional became a flat claim, and the
  claim then sent work at findings that had already been closed. Same
  mechanism as the Premium entry further up, and the same lesson: this file is
  the only one loaded automatically, so a stale summary here outranks the
  correct detail everywhere else.
- **There are no component or E2E tests.** Vitest runs with
  `environment: "node"` (no jsdom installed, so a component test cannot be
  written without adding that first) and every test file lives in `lib/`. A change
  confined to `components/` or `app/` has no automated coverage — say so
  rather than implying the suite covered it.
- **The brand is one outline, not a font.** `lib/marke.ts` holds the "strado"
  wordmark as SVG path data (Familjen Grotesk Bold, SIL OFL, converted to
  outlines). `components/Wortmarke.tsx`, `app/icon.tsx`,
  `app/apple-icon.tsx`, both `opengraph-image.tsx` files and the canvas in
  `lib/shareImage.ts` all draw from it, so the mark survives Satori and
  Canvas, which cannot use a CSS webfont. The app still loads only Inter and
  IBM Plex Mono — do not add a third font to render the logo. Note the
  wordmark is set lowercase while running copy says "Strado".
  - **The signet is no longer the "s".** As of 2026-09-14 it is the "o",
    flattened into a closed circuit — and drawn geometry (two ellipses),
    not the glyph scaled: squashing a typeface thins its horizontals while
    the verticals stay heavy, and the bold "o"'s counter seals shut at icon
    size. Three consequences. It is **wider than tall** (ratio ≈ 1.7,
    `viewBox` `0 0 92 54`, so `SIGNET.breite`/`hoehe`/`seitenverhaeltnis`
    replace the old square `kante`/`einzug`): size it by height and let the
    width follow — a square class squashes it, and a Satori `<img>` needs
    both dimensions in that ratio. It is the first mark with a **hole**, and
    the counter is wound against the outer contour on purpose, because
    Satori and Canvas both fill nonzero, under which a same-wound counter
    is area rather than a hole. Where it appears, besides the icon routes:
    the pull-to-refresh indicator (`components/PullToRefreshArea.tsx` — it
    turns one lap as you pull, `animate-spin` while reloading, and it
    replaced a separately drawn road that answered to nothing), the three
    status pages via `StatusPage`'s `marke` prop (offline, not-found,
    error), the **global** feed's empty state only
    (`app/feed/page.tsx` — the following-feed keeps its feed icon, because
    there the missing thing is people, not Strado), and the badge in
    `components/PremiumWillkommen.tsx`. `EmptyState` sizes its icon
    `h-7 w-auto` for exactly this reason — `w-7` would squash a non-square
    mark. Everywhere else the wordmark stays: **the header above all**. On
    2026-09-14 the header showed the signet below `sm`, with a lap-rotation
    on tap (`signet-runde`) and `HeaderSkeleton` mirroring the split; all
    three were taken back out on 2026-09-15, because the name is what makes
    an app known and the header is the one surface where every user reads it
    on every page view. Don't reintroduce a mark-only header without
    settling that trade first. The wordmark's own `marke-anschlag` (tilt
    plus colour wash, `app/globals.css`) was never part of that and still
    runs.
  - **The PWA metadata carries two more renders of it.**
    `app/icon-maskable/route.tsx` is the Android `purpose: "maskable"`
    icon — without it Android shrinks the plain icon into a circle on white,
    which the flat ring survives far worse than the old "s" did; the mark
    sits at 46 % of the edge so the crop never reaches it.
    `app/startbild/route.tsx` draws the iOS launch image, sized from the
    query string, which is why it validates against the table in
    `lib/startbilder.ts` (tested) rather than trusting the URL: iOS only
    accepts a launch image whose media query matches the device exactly, so
    that table is ten iPhone sizes, and every `<link>` it produces rides in
    the head of every page.
  - **One mark does not redraw itself: `app/favicon.ico`.** Every other
    surface draws from `lib/marke.ts` at request time; the `.ico` is a
    finished image in the repo, and the page head serves it *alongside*
    `/icon` — the browser tab usually takes the `.ico`. So it went stale
    the moment the signet changed, and favicon and app icon showed two
    different marks for a day. Whoever edits `SIGNET.pfad` runs
    `node scripts/generate-favicon.mjs` afterwards, which reads the path
    back out of `lib/marke.ts` and rewrites all three frames (16/32/48).
    The 16 px frame deliberately draws the mark larger than the others
    (88 % of the edge against 80 %, and 70 % in the icon routes): at that
    size the ring's counter closes at the icon routes' proportion. The
    script leans on `sharp` from Next.js's own dependency tree rather than
    declaring it — it runs by hand and says so loudly if that ever breaks.
- `types/database.ts` exports `Database = any`; the row types next to it are
  hand-maintained and cover only some tables.

## Core User Loop

This is the loop the product exists to keep turning. Any change that touches
one of these steps should be checked against how it affects the transition
into the next one — a feature that strengthens a single step but breaks the
handoff to the next isn't done.

1. **Discover a route** — `app/page.tsx` / `components/ExploreView.tsx` +
   `components/ExploreSidebar.tsx` (explore/search), `app/strecken/[id]/page.tsx`
   (route detail).
2. **Start a ride** — `components/GefahrenSection.tsx` ("Strecke starten" on a
   route page) or `app/fahrten/neu/page.tsx` (free ride, no route) →
   `components/FreeRideForm.tsx` / `components/LiveTrackingForm.tsx`.
   **Recording is open to signed-out visitors**; the account requirement sits
   at the *save*, not at the start. `GefahrenSection` takes
   `userId: string | null` plus a `guestContinuationToken`, so treat "no
   session" as a supported state in this step, not an error path.
3. **Drive** — the recording screen, live map via `components/RouteMap.tsx`.
4. **GPS tracking** — `components/useRideRecorder.ts` (client recorder hook),
   `lib/tracking.ts` (start/end gate + proximity for route mode),
   `lib/trackingStorage.ts` (snapshotting so a killed tab/app can resume —
   and the guest handoff: `GUEST_TRACKING_USER_ID`,
   `issueGuestContinuationToken`, `adoptGuestTrackingSnapshot`, which carry
   a signed-out recording across sign-up),
   `lib/geo.ts` (trail/distance math).
5. **Result / route stats** — `components/RideSummaryForm.tsx` is the shared
   presentational summary form; it receives a bound `formAction`
   (`logTrackedCompletion` or `logFreeRide`) and posts the raw trail to
   `lib/actions/completions.ts`, which derives the stats server-side rather
   than trusting client-sent numbers: `lib/routeCoverage.ts`,
   `lib/lapDetection.ts`, `lib/elevation.ts`.
   **One leg of this is still open, and it is narrower than this section
   used to claim** — see audit finding A1 in
   `docs/audit/README.md#remediation-status`, whose own table is the
   authority. Two of its three legs are closed: coverage became
   direction-sensitive with `0078`, and the write-authorization leg is
   closed as a forgery route by triggers (`0052` recomputes
   `abdeckung_prozent` and can only narrow `ist_oeffentlich`, `0059`
   cross-checks `distanz_km` against `st_length(track)`, `0074` bounds the
   rest) — `INSERT` is still granted, but a direct PostgREST write no
   longer picks its own coverage or visibility. What remains open is
   **`dauer_sekunden` alone**: it *is* derived server-side from the trail,
   but the trail's timestamps come from the client, and a genuine track
   replayed with times compressed ×0.4 stays inside the 200 km/h band from
   `0059`. So distance, ascent and coverage carry weight; duration and any
   speed derived from it do not. `lib/fahrtstatistik.ts` is built on
   exactly that split, and its header explains why.
6. **Post the ride** — same `lib/actions/completions.ts` submission,
   `components/RideVisibilityToggle.tsx` for visibility, landing on
   `app/fahrten/[id]/page.tsx`.
7. **Community reacts** — `components/KudosButton.tsx` /
   `lib/actions/kudos.ts` on the posted ride; `components/RatingSection.tsx` /
   `lib/actions/ratings.ts` on the route itself; moderation of reactions via
   `components/CompletionActionsMenu.tsx` / `lib/actions/reports.ts`.
8. **The reaction gets back to the rider** — `app/aktivitaet/page.tsx`
   (`lib/kudos.ts` → `getRecentKudosReceived`, `components/MarkKudosSeen.tsx`,
   `components/ActivityKudosList.tsx`, seen-state from migration `0057`) plus
   the unseen-kudos badge in `components/Header.tsx`. This is the step that
   makes step 7 visible to the person who rode; a reaction nobody is told
   about does not close the loop.
9. **Next ride** — `app/feed/page.tsx` (global/following feed) surfaces
   others' rides and routes, closing the loop back to step 1.

## Stack

Versions below are read directly from `package.json` — verify there before
relying on version-specific behavior, especially for Next.js 16, which has
breaking changes from earlier versions (see the block at the top of this file).

- **Next.js** 16.3.4 (App Router, Turbopack build)
- **React** 19.3.0 / **react-dom** 19.3.0
- **TypeScript** ^5
- **Tailwind CSS** ^4 (via `@tailwindcss/postcss`)
- **Supabase**: `@supabase/supabase-js` ^2.116.0, `@supabase/ssr` ^0.12.7
- **Stripe**: `stripe` ^22.6.1 (server), `@stripe/stripe-js` ^9.16.0 /
  `@stripe/react-stripe-js` ^6.9.0 (client, Payment Element)
- **Mapbox GL** ^3.30.0 (routing/maps, `mapbox-gl` + `@types/mapbox-gl`)
- **lucide-react** ^1.43.0 (icons — wrapped in `components/NavIcons.tsx` /
  `components/VisibilityIcons.tsx`, don't import it directly in new code)
- **@vercel/analytics** ^2.0.1 (`<Analytics />` in `app/layout.tsx`; the only
  telemetry in the app — there is no Sentry or other error reporting)
- **Vitest** ^5.0.0 (unit tests, `environment: "node"` — there is no jsdom,
  so component tests are not currently possible)
- **ESLint** ^9 with `eslint-config-next`

Node.js: Next.js 16 requires **Node >= 20.9**; this repo runs on **Node
24.x** (current Active LTS). One source of truth, three consumers: `.nvmrc`
holds the version, `package.json` → `engines.node` mirrors it, and CI reads
`.nvmrc` via `node-version-file`. Vercel honours `engines.node` over its own
project setting, so the build environment follows the repo instead of a
dashboard field nobody sees in a diff. Before this was pinned, CI ran 22 and
Vercel ran 24 — a gap that already cost one red production build (`@types/geojson`,
PR #154), because a build that passes on one runtime is not evidence about
the other.

## Architecture

- `app/` — Next.js App Router: routes, pages, layouts, and Route Handlers.
  Route Handlers are **not** only under `app/api/**` — `app/auth/callback/`
  (PKCE `exchangeCodeForSession`) and `app/auth/abmelden/` are handlers too,
  and both are security-relevant. Metadata routes (`icon.tsx`,
  `apple-icon.tsx`, `opengraph-image.tsx`, `manifest.ts`, `robots.ts`,
  `sitemap.ts`) also live here — the PWA manifest is `app/manifest.ts`, there
  is no `public/manifest.json`.
- `components/` — reusable UI components (client and server).
  `components/ui/` holds the shared design-system primitives (Button, Card,
  Dialog, DragSheet, EmptyState, Input, Skeleton, StatusPage, Switch) — reuse
  these rather than restyling from scratch.
- `lib/` — business logic and third-party integrations (Mapbox, weather,
  GPX parsing, leaderboard math, etc.).
- `lib/utils/` — small cross-cutting helpers: `cn.ts` (class merge) and
  `url.ts`, which holds `safeInternalPath()` — the app's only open-redirect
  guard, used by the auth callback and `signIn()`.
- `lib/actions/` — Server Actions (`"use server"`): the primary path for
  authenticated mutations from forms/UI.
- `lib/supabase/` — Supabase client factories:
  - `client.ts` — browser client (publishable key only).
  - `server.ts` — server client bound to the request's cookies/session
    (respects RLS as the logged-in user).
  - `middleware.ts` — session refresh, invoked from `proxy.ts`.
  - `admin.ts` — **service-role client. RLS bypass. Server-only.** Used in
    two distinct patterns, both deliberate (see Supabase Rules): (a) no
    session at all, trust established otherwise — the Stripe webhook
    (`app/api/stripe/webhook/route.ts`); (b) a verified session exists, but
    RLS deliberately withholds what the call needs —
    `lib/actions/billing.ts` (`stripe_customer_id` / `ist_premium` are not
    granted to `authenticated` since migration `0027`) and
    `lib/actions/auth.ts` (`deleteAccount` → GoTrue admin API). Both of
    those scope every admin query to the `getUser()`-derived id, which is
    what makes pattern (b) safe — any new call site owes the same check.
- `types/` — shared TypeScript types, including `database.ts` which mirrors
  the SQL schema.
- `supabase/migrations/` — version-controlled database schema, RLS
  policies, functions, and triggers. This is the only way the schema
  changes.

## Further Reading — load these when the trigger applies

Only this file is loaded automatically. The documents below are more
detailed than it is and are the reason it can stay short — but nothing
opens them for you. **Read the matching one before starting work in its
area**; each is a few hundred lines at most.

| Read this | Before working on |
| --- | --- |
| `.agents/backend.md` | Server Actions (`lib/actions/**`), Route Handlers |
| `.agents/frontend.md` | `app/**` pages, `components/**` |
| `.agents/database.md` | `supabase/migrations/**`, RLS, `types/database.ts` |
| `.agents/payments.md` | Stripe: webhook, `lib/stripe*`, billing actions |
| `.agents/security.md` | Any Protected Area; use as a pre-merge checklist |
| `.agents/deployment.md` | Applying migrations, shipping to Vercel/Stripe |
| `docs/audit/README.md` | Completions, leaderboards, RLS views, auth — check the remediation table before reporting a "new" finding |
| `docs/premium-plan.md` | Anything premium, Stripe, or entitlement-shaped |
| `supabase/migrations/README.md` | Whenever migration order or the applied/unapplied gap matters |

`README.md` is the human setup guide and is not a substitute for any of
these.

## Release Flow

As of 2026-09-08, `staging` is the integration branch: individual feature
and fix branches land there first via PR, not directly on `main`. Changes
sit on `staging` and get tested there. Once verified, several individual
features/fixes are promoted from `staging` to `main` together, in one
batch — not one PR to `main` per feature. `main` stays the deploy branch:
it only ever advances via a batch promotion from a tested `staging`, never
via a single feature branch merged straight into it.

**Branch naming.** Feature branches carry a `staging-` prefix followed by a
slug of what they do: `staging-zugang-nur-fuer-moderatoren`. The separator
is a hyphen, not a slash, and that is not a style preference — git stores
`refs/heads/staging` as a file, so it cannot at the same time hold a
directory `refs/heads/staging/`. As long as a branch named `staging` exists,
`git branch staging/foo` fails with *cannot lock ref*. Anyone who wants the
slash form has to rename the integration branch first (`develop`, say), and
that means moving the Vercel domain binding and the Stripe sandbox webhook
with it.

**The staging environment.** `staging` deploys to `staging.strado.ch` and
talks to the Stripe **sandbox**, so a test purchase there costs no real money.

> **The database half of that sentence is settled, and the answer is no.**
> This paragraph used to continue "It has its own Supabase project … so a
> test purchase there touches no production data". That was wrong. The
> owner confirmed on 2026-09-14 that `staging` talks to the **production**
> database — the single project `stecakpnuijbvjsniqto` ("Strado",
> eu-central-1) — and that it stays that way. The Stripe half is unaffected:
> the sandbox is genuinely separate, so a test purchase still costs no real
> money.
>
> **Treat `staging` as production for anything that writes.** A test
> account, a test ride, a sandbox purchase — all of it lands in the same
> tables real users are in. That is a known, accepted trade, not a bug to
> report; what it forbids is the assumption that staging is a safe place to
> try a destructive statement.

Three things follow:

- It is **locked to logged-in moderators** (`proxy.ts`, `lib/staging.ts`).
  Vercel's Deployment Protection has to stay off so Stripe can deliver its
  sandbox webhooks, so this gate is the only thing standing in front of it.
  The gate keys off the deployment's git branch as well as the hostname —
  Vercel serves every deployment under several addresses, and the hostname
  alone missed all but one of them.
- `app/robots.ts` answers `disallow: /` there. Two public copies of the same
  content compete for the same search terms otherwise.
- `/api/**` is exempt from the gate, deliberately: the Stripe webhook
  arrives server-to-server with no session, and the `/api/strecken/**`
  endpoints are unauthenticated by design.

**There is no migration rehearsal.** This section used to promise one — "a
migration is applied to the staging database before it is applied to
production" — and that promise is void: there is one database (see the box
above). A migration is applied exactly once, and that application is the
production application. What `staging` still buys is a rehearsal of the
**code** against the real schema, which is worth having; what it does not
buy is a second chance at a statement that writes.

## Core Rules

1. Never modify `main` directly. Every change lands via a pull request.
2. Every feature/fix uses a dedicated branch, named for what it does, and
   targets `staging` first (see Release Flow above) — not `main`.
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
- `/lib/actions/auth.ts` — sign-in/sign-up, password change, account
  deletion (uses the service-role client for the GoTrue admin API).
- `/app/auth/` — Route Handlers outside `app/api/`: `callback/route.ts`
  performs the PKCE `exchangeCodeForSession` and redirects on a
  user-supplied `?next=`; `abmelden/route.ts` ends the session.
- `/lib/utils/url.ts` — `safeInternalPath()`, the app's only open-redirect
  guard. Every `?next=` in the app depends on it.
- `/lib/actions/moderation.ts` — route approval/rejection (moderator-only
  mutations).
- `/lib/actions/creatorLinks.ts` — moderator-only mutations on
  `creator_links`, including the assignment that *is* the creator role
  (`0091`): whoever is written there sees `/creator`. Same triple gate as
  `moderation.ts` (RLS policy, `isModerator()`, page access), and the empty
  field deliberately means "nobody" while a malformed one is an error — so
  a tampered value cannot silently revoke a role.
- `/app/c/` — the public entry-point handler. Fully unauthenticated, like
  `/app/api/strecken/`: it resolves a code, sets the origin cookie and
  counts a click in `after()`. Protected by IP rate limiting and
  `normalisiereCode()` only, and it redirects on a user-supplied `?z=`,
  which is why that value goes through `safeInternalPath()`.
- `/lib/herkunft.ts` — the origin cookie. Its **name, lifetime and
  contents are quoted verbatim** in the privacy policy, in this repo
  (`docs/rechtstexte/datenschutz.md` Ziff. 3.11) and in the published HTML
  in `janlampert08-dev/stradoinfo`. A change here is a legal-text change in
  two repositories, not a refactor; `lib/herkunft.test.ts` pins the values
  for that reason.
- `/lib/moderation.ts` — moderator-check helper.
- `/lib/actions/reports.ts` — the user-facing side of moderation; what it
  writes is what the moderation queue acts on.
- `/lib/actions/completions.ts` — server-side stat derivation, the coverage
  threshold that gates publication, and the ride photo upload path.
- `/lib/actions/profile.ts` — granular visibility settings and avatar
  upload (server-side file type/size validation).
- `/lib/publicTrack.ts`, `/lib/track.ts` — privacy-zone cropping of shared
  GPS tracks. This is the privacy boundary for every published ride: a
  regression here exposes riders' home addresses.
- `/app/api/strecken/` — three fully unauthenticated public endpoints,
  protected only by IP rate limiting and `lib/validation.ts`. The list and
  the detail endpoint additionally answer with
  `Access-Control-Allow-Origin: *` (`lib/apiCors.ts`), so a browser on any
  origin — the info page on `strado.ch` above all — may read them. That is
  safe only as long as no credentials ride along: never add
  `Access-Control-Allow-Credentials` there, and never let these endpoints
  answer with anything beyond the anonymous RLS view. The leaderboard
  endpoint deliberately carries no such header.
- `/lib/apiCors.ts` — that header, in one place.
- `/lib/rateLimit.ts` — abuse-prevention cooldown checks (per-user, DB
  backed) and the per-IP limiter the public API depends on.
- `/lib/abobremse.ts` — the rate-limit budgets for the Stripe actions in
  `lib/actions/billing.ts`, together with the retry schedule
  (`components/AboBestaetigung.tsx`) they are measured against. The two
  belong in one file because the budget is only safe relative to the
  schedule: tightening the confirm limit, or widening the retry ladder,
  can produce "paid, but no premium" — the most expensive failure the
  billing path has. `lib/abobremse.test.ts` holds the gap open; a change
  here that makes it fail is the warning, not the obstacle.
- `/lib/validation.ts` — `isValidUuid`, the input guard on those endpoints.
- `/lib/staging.ts` — decides whether a request is running against the
  staging deployment. `proxy.ts` locks staging to logged-in moderators on
  the strength of it, and `app/robots.ts` blocks indexing on the same
  signal. A change that narrows it opens staging to the public.
- `/.github/` — CI/CD configuration.
- `/.claude/` — `settings.json` (`permissions.ask`) and
  `hooks/sql-guard.sh`. The "Think twice before executing SQL" rule below
  leans on these; weakening them silently removes that checkpoint.
- `/AGENTS.md`, `/SECURITY.md` — this constitution and the security policy.

Changes to these paths should be minimal, explained in the PR description
(what changed and why it's still safe), and — for anything touching auth,
RLS, or payments — should include regression tests where practical.

`.github/CODEOWNERS` should stay in sync with this list: a path that is
protected here but has no owner rule there is protected by convention
only, and a PR touching it can merge without the review this section
asks for.

## Supabase Rules

**RLS is a security boundary, not a formality.** Any table reachable from
the browser client or a Server Action running as the logged-in user is
only as safe as its RLS policies. `lib/supabase/admin.ts` bypasses RLS
entirely and must stay server-only, called only from contexts where
authorization has already been established some other way.

There are two such contexts in the codebase today, and they are not
interchangeable:

- **No session, trust from elsewhere.** `app/api/stripe/webhook/route.ts`
  — the verified `stripe-signature` authenticates the *request*: it proves
  Stripe sent it. It does not make the *payload* trusted. `event.data.object`
  is still external input, so a handler must check the event type and
  validate the shape and business invariants of every field it writes from.
  The current handler does; a new `case` must too.
- **Session verified, RLS deliberately withholding.**
  `lib/actions/billing.ts` and `lib/actions/auth.ts` (`deleteAccount`)
  call `getUser()` first, then use the admin client to reach something the
  `authenticated` role is intentionally not granted — the Stripe columns
  locked down in migration `0027`, and the GoTrue admin API.

The second pattern is the dangerous one, because a request path *does*
reach it. Anything on that path must scope every query to the
`getUser()`-derived id and never to an id from the request. Adding a
third call site is protected-area work: justify why a more precise RLS
policy or a narrowly-scoped `SECURITY DEFINER` function can't do the job
instead, and say so in the PR description.

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

One command is exempt, because it never opens a connection:
`supabase migration new`, which only writes a file under
`supabase/migrations/`. Everything else stays behind the prompt —
`apply_migration`, `execute_sql`, `supabase db push`,
`supabase migration up|repair|squash|fetch`, `psql`, and
`supabase migration list`, which reads
`supabase_migrations.schema_migrations` on the remote database and so
falls under the rule above like any other read. The exemption is an
allowlist in `.claude/`, not a relaxation of the rule: a subcommand
nobody has vetted still prompts, and `.claude/hooks/sql-guard.test.ts`
is the regression test for that.

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
