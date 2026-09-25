-- =====================================================================
-- 0155 — Follower-Zahlen für mehrere Konten in einem Aufruf
-- =====================================================================
--
-- WARUM
-- Die Profilsuche im Feed (searchProfiles in lib/actions/profile.ts) zeigt
-- zu jedem Treffer die Follower-Zahl und rief dafür get_follow_counts je
-- Treffer einzeln auf — bis zu acht parallele RPCs pro Tastendruck-Suche,
-- jede mit eigenem PostgREST-Roundtrip.
--
-- WAS SICH ÄNDERT
-- Neue Funktion get_follow_counts_many(user_ids uuid[]), die für jede
-- übergebene ID eine Zeile (user_id, followers, following) liefert — auch
-- für Konten ohne Follower (dann 0). Rein additiv: get_follow_counts(uuid)
-- bleibt unverändert, das öffentliche Profil (lib/follows.ts) nutzt sie
-- weiter.
--
-- Dieselbe Semantik wie get_follow_counts, aus dem Katalog gelesen
-- (pg_get_functiondef, 2026-09-25) statt aus 0040 abgeschrieben:
--   * LANGUAGE sql, STABLE, SECURITY DEFINER — public_follows ist seit 0040
--     nicht mehr an anon/authenticated gegrantet, die Funktion ist der
--     Zugriffspfad. Sie liefert wie das Original ausschliesslich Zählwerte,
--     keine Namen und keine Liste; die Zahlen sind laut 0037/0040
--     ausnahmslos öffentlich (zeigt_follower_liste schützt nur die Liste).
--   * Gezählt wird über dieselbe Sicht public.public_follows mit denselben
--     Bedingungen (followed_id bzw. follower_id = Konto).
--   * Fester search_path (public, pg_temp; das Original hat public — pg_temp
--     ans Ende gestellt schliesst zusätzlich die Temp-Schema-Falle).
--   * EXECUTE wie beim Original an anon und authenticated: die öffentliche
--     Profilsuche läuft auch ohne Anmeldung.
--
-- Zusätzlich zum Original: höchstens 100 verschiedene IDs je Aufruf
-- (weitere werden ignoriert, NULL-Einträge ebenso). Die App schickt
-- höchstens acht; die Grenze hält einen direkten PostgREST-Aufruf mit
-- tausenden IDs klein. Mehr als mit get_follow_counts ohnehin abrufbar ist,
-- verrät die Funktion nicht.
--
-- Reihenfolge: unabhängig. Der Code fällt auf die Einzelaufrufe zurück,
-- solange es die Funktion nicht gibt (PGRST202 / 42883), und main ruft sie
-- gar nicht auf. Einspielen jederzeit, vor oder nach dem Deploy.
--
-- PRÜFEN
--   select p.oid::regprocedure, p.prosecdef, p.provolatile, p.proconfig,
--          p.proacl::text
--     from pg_proc p
--    where p.oid = 'public.get_follow_counts_many(uuid[])'::regprocedure;
--   -- erwartet: prosecdef = true, provolatile = 's',
--   --           proconfig = {"search_path=public, pg_temp"},
--   --           anon und authenticated mit X
--
--   -- Gleiche Zahlen wie das Original, für jedes Konto mit Follows:
--   select m.user_id, m.followers, m.following, o.followers, o.following
--     from public.get_follow_counts_many(
--            array(select distinct followed_id from public.follows)) m
--     cross join lateral public.get_follow_counts(m.user_id) o
--    where (m.followers, m.following) is distinct from (o.followers, o.following);
--   -- erwartet: 0 Zeilen
--
-- ZURÜCK
--   drop function if exists public.get_follow_counts_many(uuid[]);
--   Der Code fällt danach wieder auf get_follow_counts je Konto zurück.

create or replace function public.get_follow_counts_many(user_ids uuid[])
returns table(user_id uuid, followers integer, following integer)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    u.id as user_id,
    (select count(*) from public.public_follows f where f.followed_id = u.id)::integer as followers,
    (select count(*) from public.public_follows f where f.follower_id = u.id)::integer as following
  from (
    select distinct x.id
      from unnest(user_ids) as x(id)
     where x.id is not null
     limit 100
  ) u;
$$;

comment on function public.get_follow_counts_many(uuid[]) is
  'Follower-/Following-Zahlen für mehrere Konten (höchstens 100 je Aufruf), gleiche Semantik wie get_follow_counts(uuid): ausnahmslos öffentliche Zählwerte über public_follows, SECURITY DEFINER weil public_follows seit 0040 nicht direkt gegrantet ist. Für die Profilsuche (0155).';

grant execute on function public.get_follow_counts_many(uuid[]) to anon, authenticated;
