# The autonomous agent — operating manual

This directory is the memory of an agent that runs on a schedule with no
session continuity. Four Routines fire into **fresh sessions**: nothing they
learned last night is in their context this morning. The only thing that
carries across a firing is what is written down here and committed.

That is the whole design. The Routines are a clock; these files are the agent.

Like `AGENTS.md` and `.agents/`, this file is written in English — it is
agent-facing operating documentation, not product surface. Anything that
reaches a user stays German.

## The four Routines

| Routine | Cadence (CEST) | Job | Reaches the owner |
| --- | --- | --- | --- |
| **Wächter** | every 3 h | production health, CI on `main`, open-PR sweep, dependency CVEs | never directly — writes a journal entry |
| **Nachtschicht** | 02:00 daily | take the top *ready* backlog item, implement it, open **one** PR to `staging` | never |
| **Recherche** | Mon 09:00 | competition, market, feature landscape → a document | never |
| **Morgenbericht** | 07:00 daily | fold the day's journal entries into one digest and send it | **push + e-mail, once a day** |

The owner chose *digest only, never interrupt*. That is a hard rule, not a
default: **no Routine other than Morgenbericht may send a push
notification**, and that includes a production outage. An outage at 03:00
gets fixed at 03:00 if it is fixable and reported at 07:00 either way.

## Hard limits

1. **WIP limit: at most 2 open agent-authored PRs at any time.** Count open
   PRs authored by the agent before opening another. At the limit,
   Nachtschicht does *not* open a third — it picks verification, test or
   research work from the backlog instead, or drives an existing PR to green.
   The bottleneck in this project is review capacity, not token budget.
2. **One PR per Nachtschicht firing.** Never two.
3. **Only items already on the backlog**, and only those marked `ready`. The
   agent may *propose* new items (status `proposed`) but may not build them
   until the owner moves them to `ready`. Adding a `proposed` item is always
   allowed and is how ideas get in front of the owner.
4. **Never merge.** Not to `staging`, not to `main`. Promotion is a human
   decision (`AGENTS.md` → Release Flow).
5. **Never apply a migration.** Migrations are applied by hand, the staging
   database story is unresolved (see Known Traps), and `.claude/hooks/sql-guard.sh`
   exists to make that a checkpoint. Writing a migration file is fine;
   applying it is not.
6. **Never touch production data.** That includes
   `scripts/verwaiste-avatare.mjs --loeschen`.
7. **Protected Areas** (`AGENTS.md`) are not off-limits, but a change to one
   must be minimal, explained in the PR body, and carry a test where
   practical. If a Protected Area change cannot be explained in two
   sentences, it belongs on the backlog as `proposed`, not in a PR.
8. **`AGENTS.md` Definition of Done applies unchanged.** `npm run lint`,
   `npm run test`, `npm run build` — actually run, results quoted in the PR
   body. Never assert a command passed without having run it.

## What every firing does

1. `git fetch origin` and read this file, `backlog.md`, and the last few
   journal entries. They are the only memory that exists.
2. Do the Routine's job.
3. **Write a journal entry before ending the turn**, even when nothing
   happened — a silent firing is indistinguishable from a Routine that
   stopped working.
4. Commit and push. The container is ephemeral; unpushed work is lost.

## The journal

One file per firing, so two Routines can never conflict on a write:

```
docs/agent/journal/YYYY-MM-DD-<routine>-HHMM.md
```

Journal entries live on the long-lived `agent/journal` branch, which is
**never merged** into `staging` or `main` — bookkeeping must not show up in
code review. Nachtschicht's actual code changes go on a normal
`claude/<slug>` branch and are reviewed like anything else.

Morgenbericht folds the day's entries into `docs/agent/journal/YYYY-Www.md`
on the same branch and deletes the raw files, so the directory stays
readable.

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
  open a PR "fixing" something on the strength of a summary; verify against
  the code first.
- **Migration numbers are not unique** — six prefixes exist twice. Reconcile
  by inspecting objects, never by version number.
- **`0042` and `0058` must never be applied.** They are superseded by `0076`.
- **The staging database story is unresolved.** Release Flow says `staging`
  has its own Supabase project; Current State says the linked account holds
  exactly one project and it is production. Until that contradiction is
  settled by a human, treat every database as production.
- **`NEXT_PUBLIC_*` is frozen at build time**, server code included. Setting
  one in Vercel does nothing until the next deployment.
- **No component or E2E tests exist.** Vitest runs `environment: "node"` and
  every test lives in `lib/`. A change confined to `components/` or `app/`
  has *no* automated coverage — say so in the PR rather than implying the
  suite covered it.
- **The CSP is enforced, including in dev.** A new third-party origin is
  blocked until it is added to the right directive.

## Turning it off

Routines are listed and deleted with the Routine tools (`list_triggers`,
`delete_trigger`), or from the owner's Routines list. Disabling
Morgenbericht alone makes the whole system silent but still working —
disable *it* last, not first.
