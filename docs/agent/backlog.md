# Backlog

The queue Nachtschicht works from. **Only `ready` items may be built.**
The agent may add items as `proposed`; moving `proposed` → `ready` is the
owner's decision and the only gate on autonomous code changes.

Ordered by priority within each status. Nachtschicht takes the topmost
`ready` item that is not already `in progress`, marks it `in progress` with
the branch name, and opens one PR.

Every item carries **evidence** — the file or finding it comes from. An item
without evidence is a guess and does not belong here.

Status values: `ready` · `in progress` · `proposed` · `done` · `dropped`

---

## ready

### R1 — React 19 clears uncontrolled fields on a failed submit
**Status:** ready
**Evidence:** `docs/audit/README.md`, §B correction — "`AnmeldenForm`,
`RegistrierenForm`, `PasswortVergessenForm`, `PasswortAendernForm`,
`RatingSection` — uncontrolled text fields, still cleared on a failed submit.
… Open."
**Why:** a failed sign-in wipes the e-mail the person just typed. It is the
first step of the core loop and the one place a new user is most likely to
give up. `MultiPhotoInput` already solved the same problem for the file case.
**Scope:** the five named forms. Match the existing mechanism rather than
inventing a second one. No automated coverage exists for `components/` — say
so in the PR.

### R2 — `AGENTS.md` Current State contradicts the audit table
**Status:** ready
**Evidence:** `AGENTS.md` says "A4, A5, A6 and everything in §B are open";
`docs/audit/README.md#remediation-status` marks A4, A5, A6 and most of §B
**Fixed**.
**Why:** `AGENTS.md` is the first thing every agent and contributor reads. A
stale "open" list sends work at problems that are already solved, and the
file itself says a drifted entry is what should be corrected. This is exactly
the failure mode that left the paid path unaudited until 2026-09-07.
**Scope:** documentation only, no code. Verify each row against the code
before rewriting it — do not copy the audit table's word for it either.

### R3 — no component test is possible at all
**Status:** ready
**Evidence:** `AGENTS.md` → "There are no component or E2E tests. Vitest runs
with `environment: 'node'` (no jsdom installed)". Confirmed: all 49 test
files are in `lib/` or `.claude/`.
**Why:** every item like R1 ships unverified, and will keep doing so. This
unblocks the others rather than being valuable on its own.
**Scope:** add jsdom and a `environment: 'jsdom'` project for
`components/**`, plus **one** real test as proof — the R1 forms are the
natural candidate. A new dependency needs justifying against Core Rule 15 in
the PR body. Do not convert existing `lib/` tests.

### R4 — `types/database.ts` exports `Database = any`
**Status:** ready
**Evidence:** `AGENTS.md` → "`types/database.ts` exports `Database = any`;
the row types next to it are hand-maintained and cover only some tables."
**Why:** every Supabase call in the app is unchecked at the point where
schema and code meet, which is where a migration breaks things silently.
**Scope:** incremental and narrow — one PR per small group of tables, not a
generated wholesale replacement. Generating types requires a database
connection, which the agent does not use (manual §5); hand-write from the
migrations.

---

## proposed — owner decision needed

### P1 — three orphaned avatars are publicly fetchable, including a deleted account's
**Evidence:** `docs/audit/README.md` — measured against production
2026-09-08: six objects in `avatars/`, three with no profile pointing at
them, all three answering **HTTP 200**. One belongs to an account with no
`profiles` row at all, i.e. deleted.
**Why it needs you:** `scripts/verwaiste-avatare.mjs` exists and has **never
been run**. It needs the service-role key and a live project. Per manual §6
the agent must not run it, and per §5 it must not touch production. This is a
deploy step for a human: read the dry-run list, then `--loeschen`.
**Cost of waiting:** a deleted user's photo stays retrievable. This is the
highest-value item in the file and the agent cannot do it.

### P6 — a moderator UI for the agent team
**Evidence:** owner request, 2026-09-14. The panel already has the exact
pattern: `feedback` (migration `0083`) is a moderator-only table read by
`getOpenFeedback()` in `lib/moderation.ts` and rendered as a `<section>` on
`/moderation` with `FeedbackActions`. `/moderation/creator` is the precedent
for a sub-page instead.
**What it is for:** the display is the cheap half. The point is the **approve
button** — promoting `proposed` → `ready` is currently a hand-edit of markdown
in git, and it is the one action only the owner can take. Making it one click
removes the only friction in the whole loop.
**Why it needs a decision:** the Routines write their state to git, because git
is the one thing a fired session certainly has. If approval writes to a
Supabase table, the Nachtschicht must read that table — which needs Supabase
access inside a fired session. That is the open connector question. Settle it
first:
- Routines have Supabase → one **additive** migration (`agent_backlog`,
  `agent_journal`, moderator-only RLS), Routines read and write it directly.
- They do not → the page reads GitHub at runtime and approval writes back via
  the GitHub API, which means a new server-side token.
**Constraint:** confirmed 2026-09-14 via `list_projects` — the account holds
**one** project (`stecakpnuijbvjsniqto`, "Strado"), and it is production. Any
migration here lands on production unrehearsed, so it must be purely additive,
the same bar `0080`–`0084` cleared.
**Note:** touches moderation, so it can never auto-merge — it waits for the
owner's review whatever the Gegenleser says.

### P7 — Release Flow claims a staging database that does not exist
**Evidence:** `AGENTS.md` → Release Flow: "`staging` deploys to
`staging.strado.ch`. It has its own Supabase project … so a test purchase
there touches no production data." `mcp__Supabase__list_projects` on
2026-09-14 returned **exactly one** project, `stecakpnuijbvjsniqto` ("Strado",
eu-central-1, ACTIVE_HEALTHY) — matching Current State, which says the opposite
of Release Flow.
**Why it needs you:** either `staging.strado.ch` points at the **production**
database, or at a project under an account this connector cannot see. Only the
Vercel environment variables for the `staging` deployment settle it, and an
agent should not go reading production secrets to find out. If it is the
former, then every migration "rehearsed" on staging was applied to production,
and staging test data is production data. That is a risk to know about, not a
documentation nit.
**Blocks:** all database work, P6 included. This supersedes the earlier P5.

### P2 — A1 leg 2: `dauer_sekunden` is still a client-supplied clock
**Evidence:** `docs/audit/README.md` A1 table — "Open, and it needs a product
decision, not a migration." A 10 km / 600 s trail replayed at ×0.4 passes the
`0059` band.
**Why it needs you:** closing it requires a server-recorded ride start, and
the recorder is deliberately open to signed-out visitors, so any fix changes
the guest flow — a product decision with a growth cost. A tighter speed
heuristic was already considered and rejected: every threshold that catches
the forgery also rejects real rides on a pass.

### P3 — `script-src` still carries `'unsafe-inline'` and `'unsafe-eval'`
**Evidence:** `AGENTS.md` → the nonce replacement "verlangt die CSP pro
Anfrage in `proxy.ts` und macht jede Seite dynamisch — offen, bewusst."
**Why it needs you:** the fix trades away static rendering on every page. That
is a performance and cost decision, not a security one.

### P4 — rename `NEXT_PUBLIC_SITE_URL` to `SITE_URL`
**Evidence:** `AGENTS.md` → the function is only ever called server-side, so
the prefix "buys nothing and costs this freezing".
**Why it needs you:** the repo and the Vercel dashboard have to change
together. A PR alone breaks the deployment.

### P5 — settle where the staging database lives (superseded by P7)
**Evidence:** Release Flow says `staging` has its own Supabase project;
Current State says the linked account holds exactly one project and it is
production.
**Why it needs you:** until this is answered, every migration is a
production migration and the rehearsal step of Release Flow is fiction. It
blocks all database work, including R4's generated half.

---

## done

_(Nachtschicht appends here with the merged PR number and date.)_
