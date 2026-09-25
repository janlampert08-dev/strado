-- =====================================================================
-- 0152 — Öffentliche Views: Schreibrechte für anon/authenticated entzogen
-- =====================================================================
--
-- WARUM
-- Die Views unten sind gefilterte Leseprojektionen. Beim Anlegen hat
-- Supabase den Rollen anon und authenticated per Default-Privilegien aber
-- auch INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER und REFERENCES gegeben
-- (Audit 2026-09-25 mit dem Skill supabase-postgres-best-practices).
-- Schreiben scheitert heute nur, weil keine der Views automatisch
-- aktualisierbar ist (Joins/Aggregate). Das ist Zufall, keine Absicht:
-- eine spätere, einfachere View-Definition wäre plötzlich beschreibbar,
-- und als SECURITY-DEFINER-View mit den Rechten des Eigentümers.
--
-- WAS SICH ÄNDERT
-- Nichts, was die App tut: sie liest diese Views nur (SELECT bleibt).
-- service_role ist nicht betroffen.
--
-- PRÜFEN (nach dem Einspielen)
--   select table_name, grantee, privilege_type
--   from information_schema.role_table_grants
--   where table_schema = 'public'
--     and grantee in ('anon', 'authenticated')
--     and privilege_type <> 'SELECT'
--     and table_name in ('public_fahrten', 'public_fahrt_tracks',
--       'public_completion_photos', 'route_photos', 'route_leaderboard',
--       'leaderboard_completions', 'leaderboard_user_totals',
--       'leaderboard_typ_totals', 'leaderboard_klassen_totals',
--       'kudos_summary', 'public_follows');
--   → keine Zeilen.
--
-- ZURÜCK
-- grant insert, update, delete, truncate, trigger, references on <views>
-- to anon, authenticated;  (nicht empfohlen)

revoke insert, update, delete, truncate, trigger, references
  on public.public_fahrten,
     public.public_fahrt_tracks,
     public.public_completion_photos,
     public.route_photos,
     public.route_leaderboard,
     public.leaderboard_completions,
     public.leaderboard_user_totals,
     public.leaderboard_typ_totals,
     public.leaderboard_klassen_totals,
     public.kudos_summary,
     public.public_follows
  from anon, authenticated;
