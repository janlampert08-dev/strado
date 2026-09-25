-- 0138: Welche Strecke über welchen Pass führt — gespeichert statt bei jedem
-- Lesen räumlich gerechnet.
--
-- Anlass (gemessen 2026-09-24/25 auf der Produktion): die View
-- public.strecken_paesse (0104) war ein räumlicher Join
--   routes r join paesse p on st_dwithin(r.geometry, p.scheitel, 400)
-- und wurde bei jedem Aufruf der Startseite (Passabzeichen in der Liste,
-- lib/paesse.ts) und jeder Streckenseite (getPassKontextFuerStrecke) neu
-- gerechnet. pg_stat_statements: 48–55 ms im Mittel, Spitze 1.2 s.
--   * EXPLAIN ANALYZE, ganze View (21 Zeilen aus 34 × 34): 98.7 ms
--     Ausführung, dazu 166.7 ms Planung; je Strecke ~2.8 ms geography-
--     Distanzrechnung gegen den GiST-Index der Scheitel.
--   * Gefiltert auf eine Strecke (route_id = …): 12.8 ms Ausführung.
--   Erwartet danach: ein Index-Lookup in einer Tabelle mit ~21 Zeilen plus
--   eine Primärschlüssel-Prüfung auf routes je Zeile (RLS, s. u.) —
--   Grössenordnung 0.1 ms, unabhängig davon, wie lang die Geometrien sind.
--
-- Warum keine MATERIALIZED VIEW (der naheliegende Ersatz): eine
-- materialisierte View kennt weder RLS noch security_invoker. Die View aus
-- 0104 ist aber ausdrücklich security_invoker, damit sie nur Strecken zeigt,
-- die der Aufrufer über die RLS von routes sehen darf — sonst verriete sie
-- die Existenz (und die ID) privater oder abgelehnter Strecken an einem Pass
-- (Kommentar in 0104, und lib/paesse.ts verlässt sich darauf). Eine
-- materialisierte View wäre für anon ein Leck.
--
-- Stattdessen:
--   1. Tabelle strecken_paesse_zuordnung (route_id, pass_id) mit RLS. Die
--      einzige Lese-Policy lautet "die Strecke ist für mich sichtbar" —
--      exists (select 1 from routes where id = route_id). Die Unterabfrage
--      läuft mit den Rechten und der RLS des Aufrufers, filtert also exakt
--      wie der alte Join (öffentlich freigegeben, eigene private,
--      Moderatoren die nicht-privaten). anon/authenticated dürfen nur lesen.
--   2. Row-Level-Trigger halten die Tabelle nach: AFTER INSERT/UPDATE OF
--      geometry auf routes rechnet die Pässe dieser einen Strecke neu,
--      AFTER INSERT/UPDATE OF scheitel auf paesse die Strecken dieses einen
--      Passes. Löschen erledigen die Fremdschlüssel (on delete cascade).
--      Inkrementell statt REFRESH: jede Schreiboperation rechnet genau eine
--      Zeile gegen den Index der anderen Tabelle (~3 ms), nicht den ganzen
--      Join.
--   3. Die View strecken_paesse bleibt unter ihrem Namen, mit denselben
--      Spalten (route_id uuid, pass_id text), security_invoker und
--      denselben Grants (CREATE OR REPLACE VIEW behält sie) — und liest die
--      Tabelle. Kein Leser im App-Code muss sich ändern (lib/paesse.ts,
--      app/api/cron/verkehrsprofil/route.ts).
--
-- Leser im Schema geprüft (2026-09-25, pg_depend und pg_get_functiondef über
-- alle Funktionen in public): keine View und keine Funktion liest
-- strecken_paesse — auch meine_paesse() und count_unseen_activity() nicht
-- (sie rechnen ihre eigenen Nähen gegen Fahrt-Tracks). Nur der App-Code.
--
-- Sicherheit der Trigger-Funktionen: SECURITY DEFINER, weil die Trigger
-- beim Einfügen einer Strecke durch einen angemeldeten Nutzer in eine
-- Tabelle schreiben, auf die dieser selbst keine Schreibrechte hat. Sie
-- nehmen keine Eingabe ausser der gerade geschriebenen Zeile (NEW) und
-- schreiben nur die daraus abgeleiteten Paare. EXECUTE ist für public, anon
-- und authenticated entzogen — Trigger brauchen es nicht (PostgreSQL prüft
-- EXECUTE bei CREATE TRIGGER, nicht beim Feuern), und direkt aufrufbar
-- sind Trigger-Funktionen ohnehin nicht.
--
-- Die View ist nach dem Umbau einfach genug, um automatisch aktualisierbar
-- zu sein, und anon/authenticated tragen aus 0104-Zeiten Schreib-Grants auf
-- ihr (Supabase-Standardrechte). Das bleibt folgenlos: bei security_invoker
-- prüft PostgreSQL die Rechte auf der Basistabelle als Aufrufer, und dort
-- haben beide Rollen nur SELECT — und RLS kennt keine Schreib-Policy.
--
-- Reihenfolge: unabhängig vom Code.
--
-- Prüfen danach (erwartet: beide Zahlen 0):
--   select count(*) from (
--     select r.id, p.id from public.routes r
--       join public.paesse p on st_dwithin(r.geometry, p.scheitel, 400)
--     except select route_id, pass_id from public.strecken_paesse_zuordnung) a;
--   select count(*) from (
--     select route_id, pass_id from public.strecken_paesse_zuordnung
--     except select r.id, p.id from public.routes r
--       join public.paesse p on st_dwithin(r.geometry, p.scheitel, 400)) b;
--   explain analyze select pass_id from public.strecken_paesse where route_id = '<id>';
--   Und als anon (set role anon): select count(*) from public.strecken_paesse;
--   muss dieselbe Zahl liefern wie der alte Join über freigegebene,
--   öffentliche Strecken.
--
-- Weg zurück:
--   create or replace view public.strecken_paesse with (security_invoker = true) as
--   select r.id as route_id, p.id as pass_id
--   from public.routes r join public.paesse p on st_dwithin(r.geometry, p.scheitel, 400);
--   drop trigger strecken_paesse_nach_strecke on public.routes;
--   drop trigger strecken_paesse_nach_pass on public.paesse;
--   drop function public.strecken_paesse_fuer_strecke();
--   drop function public.strecken_paesse_fuer_pass();
--   drop table public.strecken_paesse_zuordnung;

set lock_timeout = '5s';

-- Der Abstand steht an genau zwei Stellen (beide Trigger); 400 m wie in 0104.
create table public.strecken_paesse_zuordnung (
  route_id uuid not null references public.routes (id) on delete cascade,
  pass_id text not null references public.paesse (id) on delete cascade on update cascade,
  primary key (route_id, pass_id)
);

-- Der Primärschlüssel deckt route_id ab; pass_id braucht einen eigenen
-- Index für die Kaskade beim Löschen eines Passes und für den Trigger.
create index strecken_paesse_zuordnung_pass_idx
  on public.strecken_paesse_zuordnung (pass_id);

comment on table public.strecken_paesse_zuordnung is
  'Gespeicherter Join routes × paesse (Scheitel innerhalb 400 m der Streckengeometrie), 0138. Von Triggern auf routes/paesse gepflegt, nie von Hand schreiben. Gelesen über die View strecken_paesse; RLS zeigt nur Zeilen, deren Strecke der Aufrufer sehen darf.';

alter table public.strecken_paesse_zuordnung enable row level security;

create policy "Zuordnung sichtbar wie die Strecke"
  on public.strecken_paesse_zuordnung
  for select
  to anon, authenticated
  using (exists (select 1 from public.routes r where r.id = route_id));

-- Supabase vergibt auf neue Tabellen in public standardmässig alle Rechte an
-- anon/authenticated. Hier wird nur gelesen.
revoke all on public.strecken_paesse_zuordnung from anon, authenticated;
grant select on public.strecken_paesse_zuordnung to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Trigger
-- ---------------------------------------------------------------------------

create function public.strecken_paesse_fuer_strecke()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  delete from public.strecken_paesse_zuordnung where route_id = new.id;
  if new.geometry is not null then
    insert into public.strecken_paesse_zuordnung (route_id, pass_id)
    select new.id, p.id
    from public.paesse p
    where st_dwithin(new.geometry, p.scheitel, 400);
  end if;
  return null;
end;
$$;

create function public.strecken_paesse_fuer_pass()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  delete from public.strecken_paesse_zuordnung where pass_id = new.id;
  if new.scheitel is not null then
    insert into public.strecken_paesse_zuordnung (route_id, pass_id)
    select r.id, new.id
    from public.routes r
    where st_dwithin(r.geometry, new.scheitel, 400);
  end if;
  return null;
end;
$$;

revoke execute on function public.strecken_paesse_fuer_strecke() from public, anon, authenticated;
revoke execute on function public.strecken_paesse_fuer_pass() from public, anon, authenticated;

-- AFTER: routes_kennzahlen_ableiten (BEFORE) hat die Geometrie dann schon
-- in ihrer endgültigen Form, und der Fremdschlüssel findet die neue Zeile.
create trigger strecken_paesse_nach_strecke
  after insert or update of geometry on public.routes
  for each row execute function public.strecken_paesse_fuer_strecke();

create trigger strecken_paesse_nach_pass
  after insert or update of scheitel on public.paesse
  for each row execute function public.strecken_paesse_fuer_pass();

-- ---------------------------------------------------------------------------
-- Bestand und View
-- ---------------------------------------------------------------------------

insert into public.strecken_paesse_zuordnung (route_id, pass_id)
select r.id, p.id
from public.routes r
join public.paesse p on st_dwithin(r.geometry, p.scheitel, 400);

-- Gleicher Name, gleiche Spalten und Typen, weiterhin security_invoker; die
-- Grants aus 0104 bleiben erhalten. Die Sichtbarkeitsprüfung, die vorher der
-- Join auf routes leistete, macht jetzt die Policy der Tabelle.
create or replace view public.strecken_paesse
  with (security_invoker = true) as
select z.route_id, z.pass_id
from public.strecken_paesse_zuordnung z;
