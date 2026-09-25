-- =====================================================================
-- 0162 — Eigene Kudos bleiben sichtbar (und zurücknehmbar)
-- =====================================================================
--
-- Seit 0145 sieht man Kudos nur auf Fahrten, die man sehen darf
-- (completion_ist_sichtbar). Wer einer Person nicht mehr folgt — oder von
-- ihr als Follower entfernt wurde (0149) —, sah danach auch seine EIGENEN
-- Kudos auf deren Follower-Fahrten nicht mehr. Ein DELETE sieht nur Zeilen,
-- die man lesen darf; toggleKudos fand die eigene Zeile nicht und konnte
-- den Kudo nicht zurücknehmen. (Drittes Code-Review nach dem Release,
-- 2026-09-25.)
--
-- Eine zusätzliche SELECT-Policy auf die eigenen Zeilen. Sie verrät nichts
-- Neues: nur, dass man selbst einmal Kudos gegeben hat. Die Fahrt selbst
-- und die Zahl (kudos_summary) bleiben für Nicht-Follower unsichtbar.
--
-- Nebenbei: der Kommentar von kudos_summary behauptete noch "nur für
-- öffentliche Fahrten".
--
-- REIHENFOLGE: unabhängig vom Code.
--
-- WEG ZURÜCK:
--   drop policy "Nutzer sehen eigene Kudos" on public.kudos;

create policy "Nutzer sehen eigene Kudos"
  on public.kudos for select
  using ((select auth.uid()) = user_id);

comment on view public.kudos_summary is
  'Kudos-Anzahl pro Fahrt: für öffentliche Fahrten für alle, für Follower-Fahrten nur für Follower und den Fahrer (0145).';
