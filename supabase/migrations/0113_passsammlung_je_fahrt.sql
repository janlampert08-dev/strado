-- Die Pass-Sammlung aus einer Quelle.
--
-- Bis hierher gab es zwei: die freie Passsammlung aus 0104 (Katalog
-- `paesse`, gezählt über den Track, 150 m um den Scheitel) und eine
-- Premium-Sammlung auf `staging-premium-neu`, die Strecken der Kategorie
-- "passstrasse" zählte und nur Streckenfahrten kannte. Zwei Zahlen mit
-- derselben Überschrift auf derselben Profilseite — "3 von 34" oben, "2 von
-- 9" darunter. Entscheid des Inhabers vom 2026-09-18: die Premium-Sammlung
-- baut auf 0104 auf. Was ihr dafür fehlte, ist die Fahrt: `meine_paesse()`
-- fasst über alle Zeit zusammen, der Saisonrückblick braucht aber, welche
-- Pässe in EINEM Jahr dazukamen, und die Sammlung braucht, wie oft.
--
-- NUMMER 0113, NICHT 0112. 0112 (`0112_pass_status_und_alarm`) wurde am
-- 2026-09-18 zurückgezogen und nie eingespielt; die README führt es unter
-- dieser Nummer. Eine neue Datei darunter läse sich wie seine Rückkehr.
--
-- Zwei Änderungen, beide SECURITY INVOKER wie in 0104: sie sehen genau die
-- Fahrten, die RLS der aufrufenden Person zeigt, und filtern zusätzlich
-- ausdrücklich auf auth.uid().
--
-- 1. `meine_paesse()` zählt erkannte Abschnitte nicht mehr doppelt. Ein
--    Abschnitt einer freien Fahrt trägt seinen eigenen Track (0081) und
--    eine parent_completion_id; ohne den Filter zählte eine Ausfahrt über
--    den Klausen, auf der zugleich die Strecke "Klausenpass" erkannt wurde,
--    als zwei Fahrten. Dieselbe Regel wie in #274 für Kilometer und
--    Fahrtenzahl. Rückgabetyp unverändert, deshalb `create or replace`;
--    der Rumpf ist der aus 0104 plus diese eine Zeile (live gelesen am
--    2026-09-18 und mit 0104 verglichen).
--
-- 2. `meine_passfahrten()`: je eigene Fahrt und berührtem Pass eine Zeile
--    (pass_id, datum). Daraus rechnet lib/passSammlung.ts erste Fahrt und
--    Anzahl, lib/saisonrueckblick.ts die Pässe eines Jahres. Keine Zeit,
--    kein Tempo (AGB Ziff. 11.3, Audit A1).
--
-- Rückweg: `drop function public.meine_passfahrten();` und für
-- `meine_paesse()` der Rumpf aus 0104.

create or replace function public.meine_paesse()
returns table (pass_id text, erstmals date, fahrten integer)
language sql
security invoker
set search_path = public, pg_temp
stable
as $$
  select
    p.id as pass_id,
    min(rc.datum) as erstmals,
    count(*)::integer as fahrten
  from public.route_completions rc
  join public.paesse p on st_dwithin(rc.track, p.scheitel, 150)
  where rc.user_id = auth.uid()
    and rc.track is not null
    and rc.parent_completion_id is null
  group by p.id;
$$;

create function public.meine_passfahrten()
returns table (pass_id text, datum date)
language sql
security invoker
set search_path = public, pg_temp
stable
as $$
  select p.id as pass_id, rc.datum
  from public.route_completions rc
  join public.paesse p on st_dwithin(rc.track, p.scheitel, 150)
  where rc.user_id = auth.uid()
    and rc.track is not null
    and rc.parent_completion_id is null;
$$;

comment on function public.meine_passfahrten() is
  'Je eigene Fahrt (ohne erkannte Abschnitte) und Pass, dessen Scheitel der Track auf 150 m nahekommt, eine Zeile (pass_id, datum). Grundlage der Premium-Pass-Sammlung und des Saisonrückblicks; dieselbe Regel wie meine_paesse() (0104).';

-- Wie immer ausdrücklich auch von anon: Supabase vergibt an anon einen
-- direkten Grant auf jede neue Funktion in public (die Falle aus 0047,
-- 0048, 0091, 0097). create or replace lässt die Rechte von meine_paesse()
-- stehen; die Zeilen dafür sind Zusicherung, keine Reparatur.
revoke execute on function public.meine_passfahrten() from public, anon;
grant execute on function public.meine_passfahrten() to authenticated;
revoke execute on function public.meine_paesse() from public, anon;
grant execute on function public.meine_paesse() to authenticated;
