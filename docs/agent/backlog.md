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

### P5 — settle where the staging database lives
**Evidence:** Release Flow says `staging` has its own Supabase project;
Current State says the linked account holds exactly one project and it is
production.
**Why it needs you:** until this is answered, every migration is a
production migration and the rehearsal step of Release Flow is fiction. It
blocks all database work, including R4's generated half.

---

## done

_(Nachtschicht appends here with the merged PR number and date.)_
