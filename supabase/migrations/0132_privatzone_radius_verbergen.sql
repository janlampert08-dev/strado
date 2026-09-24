-- Privatzonen-Radius nicht mehr für jeden lesbar (profiles.privatzone_radius_m).
--
-- Anlass: Datenschutz-Audit vom 2026-09-25. 0045 hat authenticated einen
-- Spalten-Grant zum LESEN von privatzone_radius_m gegeben, damit die eigene
-- Einstellung angezeigt und beim Speichern einer Fahrt angewandt werden kann.
-- Die SELECT-Policy auf profiles ist aber zeilenoffen ("Profile sind
-- öffentlich lesbar": using (true)) — der Grant gab also jedem eingeloggten
-- Nutzer per direktem PostgREST-Request den Radius JEDES anderen Nutzers.
-- Zusammen mit der alten Kappung (genau r um den rohen Start, siehe
-- lib/privatzone.ts) reichten damit zwei, drei geteilte Fahrten ab derselben
-- Haustür, um sie zu triangulieren. Dieselbe Falle hat 0053 bei
-- kudos_gesehen_am ausdrücklich vermieden; hier wird sie nachträglich
-- geschlossen.
--
-- Gemessen am 2026-09-25 (information_schema.column_privileges, pg_proc,
-- pg_views): authenticated hat SELECT und UPDATE auf der Spalte, anon nur
-- INSERT/REFERENCES (Tabellen-Default von Supabase), keine Funktion und keine
-- View im Schema public verwendet die Spalte. Gelesen wird sie nur von
-- lib/publicTrack.ts (Radius beim Kappen) und app/profil/einstellungen
-- (Vorbelegung der Auswahl); beide lesen ab jetzt über meine_privatzone().
-- Der Code fällt auf den alten Spaltenweg zurück, solange die Funktion fehlt
-- (PGRST202) — er darf also VOR dieser Migration deployt werden. Umgekehrt
-- (Migration vor Code) schlüge das Lesen im alten Code fehl: privacyRadiusM
-- kappt dann mit 500 m (sicher), die Einstellungsseite liesse aber die ganze
-- Profilabfrage scheitern. Deshalb: erst Code, dann Migration.
--
-- Das Schreiben bleibt, wie es ist: grant update (privatzone_radius_m) aus
-- 0045 plus die Update-Policy auf die eigene Zeile. Ein UPDATE braucht nur
-- Lese-Rechte auf die Spalten, die es in WHERE/RETURNING benutzt (hier id),
-- nicht auf die geschriebene Spalte; lib/actions/profile.ts fragt nichts
-- zurück.
--
-- Prüfen nach dem Einspielen:
--   select grantee, privilege_type from information_schema.column_privileges
--    where table_schema = 'public' and table_name = 'profiles'
--      and column_name = 'privatzone_radius_m' and grantee in ('anon', 'authenticated');
--   -- erwartet: kein SELECT mehr, UPDATE für authenticated bleibt
--   select has_function_privilege('anon', 'public.meine_privatzone()', 'execute');           -- false
--   select has_function_privilege('authenticated', 'public.meine_privatzone()', 'execute');  -- true
-- In der App: Einstellungen öffnen (Auswahl zeigt den gespeicherten Wert),
-- Radius ändern, Seite neu laden (neuer Wert steht da).
--
-- Zurückrollen:
--   grant select (privatzone_radius_m) on public.profiles to authenticated;
--   drop function public.meine_privatzone();
-- (Der Code kommt mit beiden Zuständen zurecht.)

set lock_timeout = '5s';

revoke select (privatzone_radius_m) on public.profiles from anon, authenticated;

-- Der eigene Radius, festgelegt auf auth.uid(). null ohne Sitzung oder ohne
-- Profilzeile; der Aufrufer (privacyRadiusM) macht daraus die strengste Stufe.
create or replace function public.meine_privatzone()
returns smallint
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p.privatzone_radius_m
  from public.profiles p
  where p.id = (select auth.uid());
$$;

comment on function public.meine_privatzone() is
  'Privatzonen-Radius der angemeldeten Person (0132). Einziger Leseweg für authenticated, seit der Spalten-Grant auf profiles.privatzone_radius_m entzogen ist — sonst läse jeder den Radius jedes anderen.';

revoke all on function public.meine_privatzone() from public, anon;
grant execute on function public.meine_privatzone() to authenticated;

comment on column public.profiles.privatzone_radius_m is
  'Privatzone in Metern (0, 100, 200, 500) für geteilte Tracks. Seit 0132 nicht mehr für anon/authenticated lesbar; der Besitzer liest über meine_privatzone(). Die Kappung selbst ist verschleiert (lib/privatzone.ts).';
