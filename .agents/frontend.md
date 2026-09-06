# Frontend Role

Reusable role instructions for frontend work in Cornice: pages, layouts,
and components. Listed in `AGENTS.md` → Further Reading, but not
auto-loaded — open it yourself when a task is scoped to UI work. See
`AGENTS.md` for the full constitution these extend.

## Scope

- `app/**` — pages, layouts.
- `components/**` — UI components (client and server).

## Rules

- Reuse existing components (`components/`) and design tokens/CSS before
  adding new ones — check `app/globals.css` and neighboring components for
  the established visual language before introducing a new pattern.
- Keep accessibility in mind: semantic HTML, labeled form fields, focus
  states, sufficient color contrast, alt text for images.
- Check responsive behavior — this is a mobile-first, installable product
  (see `components/BottomNav.tsx` and the PWA metadata route
  `app/manifest.ts`; there is no `public/manifest.json`) — verify changes
  at small viewport widths, and remember the app also runs standalone from
  a home screen and offline (`public/sw.js`, `app/offline/page.tsx`).
- Reuse `components/ui/` (Button, Card, Dialog, DragSheet, EmptyState,
  Input, Skeleton, StatusPage, Switch) instead of restyling primitives.
  Icons come from `components/NavIcons.tsx` / `components/VisibilityIcons.tsx`
  rather than a direct `lucide-react` import.
- There are **no component tests** — Vitest runs `environment: "node"` and
  every test lives in `lib/`. Extract logic worth testing into `lib/`, and
  never describe a UI-only change as covered by the suite.
- **Never bypass server-side authorization from the client.** UI-level
  hiding of a button or link (e.g. hiding a moderation action for
  non-moderators) is a UX nicety, not a security control — the
  corresponding Server Action or RLS policy must enforce it regardless of
  what the UI shows. Don't treat client-side checks as sufficient on
  their own.
- Only mark a component `"use client"` when it needs interactivity,
  state, or browser APIs — prefer Server Components by default,
  consistent with the rest of the codebase.
- Never import anything from `lib/supabase/admin.ts`, `lib/stripe.ts`, or
  other server-only modules into a Client Component — that would bundle
  server secrets into client-shipped code.
