# The autonomous team — operating manual

This directory is the memory of a team of agents that runs on a schedule
with no session continuity. Every Routine fires into a **fresh session**:
nothing it learned last night is in its context this morning. The only thing
that carries across a firing is what is written down here and committed.

That is the whole design. The Routines are a clock; these files are the team.

Like `AGENTS.md` and `.agents/`, this file is written in English — it is
agent-facing operating documentation, not product surface. Anything that
reaches a user stays German.

## The organising idea

A thousand-person company does not send a thousand times more work to the
person at the top. It sends *less*, because every layer consumes the layer
below it before anything reaches the owner. Scale comes from internal gates,
not from parallel output.

So the rule that governs everything here:

> **Fan out wide on reading. Stay narrow on writing.**

Thirty agents reading thirty modules in parallel is safe and cheap and is
where the budget should go. Thirty agents opening thirty pull requests is a
denial-of-service attack on the owner's attention. Read-only fan-out inside a
single firing — via subagents — is encouraged and costs no review time.
Writing is rationed by the WIP ladder below.

## The seats

| Routine | Cadence (CEST) | Job | Writes code? |
| --- | --- | --- | --- |
| **Wächter** | every 3 h | production health, CI, open-PR sweep, CVEs | only to fix what is broken |
| **Nachtschicht** | 02:23 daily | one `ready` backlog item → one PR to `staging` | yes |
| **Gegenleser** | on PR events + 04:11 daily | adversarial review of agent PRs; merges the ones that pass | no — reviews and merges |
| **Abnahme** | 05:47 daily | drives the real app in a browser through the core loop | no — files findings |
| **Sicherheitsdienst** | Wed 06:09 | independent audit of Protected Areas, wide read-only fan-out | no — files findings |
| **Recherche** | Mon 09:17 | competition, market, feature landscape | docs only |
| **Wachstum** | Thu 08:31 | SEO, conversion, performance — **primarily `app.strado.ch`**, secondarily the info site | yes, scoped |
| **Morgenbericht** | 07:12 daily | folds the day's journal into one digest and sends it | no |

**Morgenbericht is the only Routine that contacts the owner.** He chose
*digest only, never interrupt*, and that is a hard rule: no other Routine may
send a push notification, including for a production outage. An outage at
03:00 gets fixed at 03:00 if it is fixable and reported at 07:12 either way.

## The WIP ladder

The bottleneck is the owner's review capacity, not the token budget.
Throughput rises only as gates come online, never ahead of them.

| Stage | Condition | Max open agent PRs |
| --- | --- | --- |
| 1 | now | **2** |
| 2 | Gegenleser has reviewed 10 PRs with no escaped defect | 3 |
| 3 | Abnahme running and catching real regressions | 5 |

At the limit the Nachtschicht does **not** open another PR. It drives an
existing one to green, works review findings, or verifies a `proposed` item
more deeply. A raise is recorded here with the date and the evidence for it —
no raise happens silently.

## Auto-merge

A PR may merge itself into `staging` **only** when every one of these holds:

1. It was authored by an agent, and its base is `staging`. Never `main` —
   `main` advances only by the owner's batch promotion (`AGENTS.md` → Release
   Flow).
2. CI is green on the current head and `mergeable_state` is `clean`.
3. The Gegenleser reviewed *this head* and found nothing blocking.
4. No human review is pending or requesting changes.
5. **The diff touches no Protected Area** (`AGENTS.md` → Protected Areas).
   Anything under `proxy.ts`, `lib/supabase/`, `supabase/migrations/`,
   `app/api/stripe/`, `lib/stripe*`, `lib/actions/billing.ts`,
   `lib/actions/auth.ts`, `app/auth/`, `lib/utils/url.ts`,
   `lib/actions/moderation.ts`, `lib/moderation.ts`, `lib/actions/reports.ts`,
   `lib/actions/completions.ts`, `lib/actions/profile.ts`, `lib/publicTrack.ts`,
   `lib/track.ts`, `app/api/strecken/`, `lib/apiCors.ts`, `lib/rateLimit.ts`,
   `lib/validation.ts`, `lib/staging.ts`, `.github/`, `.claude/`, `AGENTS.md`
   or `SECURITY.md` waits for the owner. Always. That is not negotiable by a
   reviewer's judgement.
6. It contains **no migration file**. A migration is applied by hand and the
   staging-database question is unresolved; a merged migration that nobody
   applies is worse than an open PR.

The Gegenleser performs the merge. The Nachtschicht never merges its own
work — an agent does not grade its own homework, and that separation is the
entire reason auto-merge is safe enough to allow.

## Hard limits, all seats

1. **Never merge to `main`.** Promotion is the owner's decision.
2. **Never apply a migration.** Writing the file is fine; applying it is not.
   `.claude/hooks/sql-guard.sh` is a checkpoint, not a formality.
3. **Never touch production data**, including
   `scripts/verwaiste-avatare.mjs --loeschen`.
4. **Only `ready` backlog items get built.** An agent may add `proposed`
   items — that is how ideas reach the owner — but may never promote one
   itself. This is the only gate on what gets built at all.
5. **Never weaken a security control to get something green** (`AGENTS.md`
   Core Rule 18). No skipped tests, no disabled checks, no widened RLS.
6. **Never claim a command passed without running it** (Core Rule 17). The
   Gegenleser checks this specifically, because it is the easiest lie for a
   tired agent to tell.
7. **Never send a push notification** except from Morgenbericht.

## What every firing does

1. `git fetch origin` and read this file, `backlog.md`, and the recent
   journal entries. They are the only memory that exists.
2. Do the seat's job.
3. **Write a journal entry before ending the turn**, even when nothing
   happened — a silent firing is indistinguishable from a broken Routine.
4. Commit and push. The container is ephemeral; unpushed work is lost.

## The journal

One file per firing, so two Routines can never conflict on a write:

```
docs/agent/journal/YYYY-MM-DD-<seat>-HHMM.md
```

Journal entries live on the long-lived `agent/journal` branch, which is
**never merged** into `staging` or `main` — bookkeeping must not show up in
code review. Actual code changes go on normal `claude/<slug>` branches.

Morgenbericht folds the day's entries into `docs/agent/journal/YYYY-Www.md`
on the same branch and deletes the raw files.

Entry format — short, factual, no narration:

```markdown
## 2026-09-14 03:41 UTC — Wächter
- Checked: Vercel runtime errors (0), Supabase advisors (2 info), CI on main (green), open PRs (1: #214 green, clean)
- Did: nothing
- For the digest: nothing
```

## Known traps

Things that have already cost time here. Read before acting on them.

- **`AGENTS.md` drifts.** As of 2026-09-14 its Current State says "A4, A5,
  A6 and everything in §B are open". The remediation table in
  `docs/audit/README.md` says almost all of those are **fixed**. The table
  wins — and `AGENTS.md`'s own rule is that the code wins over both. Never
  open a PR "fixing" something on the strength of a summary.
- **No bot reviews this repo.** CodeRabbit is installed but only reviews
  repositories with 10+ stars; on #215 it said so explicitly. Before the
  Gegenleser existed there was nothing between an agent's PR and the owner.
- **Migration numbers are not unique** — six prefixes exist twice. Reconcile
  by inspecting objects, never by version number.
- **`0042` and `0058` must never be applied.** Superseded by `0076`.
- **The staging database story is unresolved.** Release Flow says `staging`
  has its own Supabase project; Current State says the account holds exactly
  one project and it is production. Until a human settles it, treat every
  database as production.
- **`NEXT_PUBLIC_*` is frozen at build time**, server code included.
- **Staging is locked to logged-in moderators** (`proxy.ts`, `lib/staging.ts`),
  so browser QA against `staging.strado.ch` needs a moderator session. What is
  reachable without one: `/api/**`, which is exempt by design.
- **Recording is open to signed-out visitors.** `GefahrenSection` takes
  `userId: string | null`. Much of the core loop is therefore testable with no
  account at all — the account requirement sits at the *save*, not the start.
- **The CSP is enforced, including in dev.** A new third-party origin is
  blocked until it is added to the right directive.
- **There are no component or E2E tests.** Vitest runs `environment: "node"`.
  A change confined to `components/` or `app/` has no automated coverage — say
  so rather than implying the suite covered it.

## Turning it off

Routines are listed and deleted with the Routine tools, or from the owner's
Routines list on claude.ai. Disabling **Morgenbericht** alone makes the team
silent but still working — disable it *last*, not first. Disabling
**Gegenleser** stops all auto-merging immediately, which is the fastest way
to put every change back in front of the owner without stopping the work.

## The Routines as actually created

Created 2026-09-14. Cron is evaluated in **UTC**; the local column assumes
CEST (UTC+2). When Switzerland returns to CET on 2026-10-25 every local time
shifts one hour earlier — fix the cron then, or accept the drift.

The order is the pipeline: build → review and merge → QA → report.

| Seat | Trigger ID | Cron (UTC) | Local | Enabled |
| --- | --- | --- | --- | --- |
| Nachtschicht | `trig_01SbsHJKQ8BCzJXp1YhwHcrs` | `23 0 * * *` | 02:23 | yes |
| Gegenleser | `trig_01EeZk9yMt2kJzP1M1C94KoH` | `11 2 * * *` | 04:11 | yes |
| Abnahme | `trig_01XbVbyNqLQFRnercdt8hTX1` | `47 3 * * *` | 05:47 | yes |
| Morgenbericht | `trig_01WPfZ79CNFhEbyev3B5rF9F` | `12 5 * * *` | 07:12 | yes |
| Wächter | `trig_01MFmwC1TVd7YmBaXfRastd2` | `41 */3 * * *` | every 3 h | yes |
| Sicherheitsdienst | `trig_01Lxsfe4Xa6AEAnzKG9gWxfv` | `9 4 * * 3` | Wed 06:09 | yes |
| Wachstum | `trig_018VzL8y6PDWim8o8Q8pnhNg` | `31 6 * * 4` | Thu 08:31 | yes |
| Recherche | `trig_016L1skSpvaKgoTRf7gKjQgz` | `17 7 * * 1` | Mon 09:17 | yes |

Each seat's prompt lives in its Routine, not here — one copy, so the two
cannot drift apart.

### Known gap: the fired sessions may have no connectors

Every Routine was created through the Routine tool, which **cannot attach MCP
connectors** in this organization — passing them is rejected outright. Each
creation returned: *"this trigger stores no MCP connectors, so the sessions it
fires will run without connector (`mcp__<server>__*`) tools."*

If that is literally true, a fired session has no GitHub, Vercel or Supabase
tools, and there is no `gh` CLI here. The Gegenleser could then not merge,
the Nachtschicht could not open a PR, and most of this would be inert. It is
**not yet known**, because the GitHub server in this environment comes from
the harness rather than from a user connector and may well survive.

The Wächter prompt therefore opens with a tool self-check and writes the
answer into its first journal entry. **Read that entry before trusting any of
this.** If the tools are missing, the fix is to re-create these eight from the
Routines UI on claude.ai, where the owner's own connectors attach; the prompts
can be copied out of the existing Routines first.
