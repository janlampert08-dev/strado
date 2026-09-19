-- Ruhige Zeiten je Strecke: wann ist hier wenig los?
--
-- Zwei Quellen, bewusst getrennt gespeichert, weil sie verschiedene Fragen
-- beantworten und verschieden belastbar sind:
--
--   1. strecken_verkehr — das Verkehrsaufkommen der Strasse, abgeleitet aus
--      der Mapbox Directions API (Profil driving-traffic mit depart_at). Mapbox
--      sagt die Fahrzeit für einen künftigen Abfahrtszeitpunkt aus historischen
--      Fahrdaten voraus; das Verhältnis zur schnellsten Stunde der Woche ist der
--      Faktor hier. Berechnet von app/api/cron/verkehrsprofil, gespeichert, weil
--      eine Woche mal vierzehn Stunden 98 Anfragen je Strecke sind.
--
--   2. strecken_startzeiten() — wann auf Strado losgefahren wird, aus den
--      serverseitigen Fahrtstarts (fahrt_starts, 0096). Das ist die
--      Community-Sicht und heute noch dünn; die Funktion schweigt, bis genug
--      Starts beisammen sind.
--
-- Die App führt beides zusammen (lib/ruhigeZeiten.ts), zeigt aber nie eine
-- Zahl, die es nicht gibt: ohne Profil keine Heatmap, unter der Schwelle kein
-- Community-Satz.

create table public.strecken_verkehr (
  route_id uuid not null references public.routes (id) on delete cascade,
  -- ISO-Wochentag, 1 = Montag, wie extract(isodow ...).
  wochentag smallint not null check (wochentag between 1 and 7),
  -- Abfahrtsstunde in Schweizer Ortszeit.
  stunde smallint not null check (stunde between 0 and 23),
  -- Vorhergesagte Fahrzeit geteilt durch die kürzeste der Woche; 1 = die
  -- ruhigste Stunde. Obergrenze als Schreibrand gegen Ausreisser.
  faktor real not null check (faktor >= 1 and faktor <= 5),
  primary key (route_id, wochentag, stunde)
);

create table public.strecken_verkehr_stand (
  route_id uuid primary key references public.routes (id) on delete cascade,
  berechnet_am timestamptz not null,
  -- Fahrzeit der ruhigsten Stunde, in Sekunden: die Basis aller Faktoren.
  basis_sekunden integer not null check (basis_sekunden > 0)
);

alter table public.strecken_verkehr enable row level security;
alter table public.strecken_verkehr_stand enable row level security;

-- Sichtbar, wo die Strecke sichtbar ist. Die Unterabfrage läuft mit den
-- Rechten des Aufrufers, die RLS von routes entscheidet also mit — ein
-- Verkehrsprofil verriete sonst die Existenz einer privaten Strecke.
create policy "Verkehrsprofil sichtbarer Strecken"
  on public.strecken_verkehr for select
  to anon, authenticated
  using (exists (select 1 from public.routes r where r.id = route_id));

create policy "Verkehrsprofil-Stand sichtbarer Strecken"
  on public.strecken_verkehr_stand for select
  to anon, authenticated
  using (exists (select 1 from public.routes r where r.id = route_id));

-- Geschrieben wird nur vom Cron (service_role).
revoke insert, update, delete, truncate on public.strecken_verkehr from anon, authenticated;
revoke insert, update, delete, truncate on public.strecken_verkehr_stand from anon, authenticated;

-- Wann auf einer Strecke losgefahren wird, als Anteile je Wochentag und
-- Tageszeit.
--
-- SECURITY DEFINER, weil fahrt_starts für niemanden lesbar ist (0096) und das
-- auch bleiben soll: eine Zeile trägt user_id und einen sekundengenauen
-- Zeitpunkt. Die Funktion gibt deshalb ausschliesslich Anteile in ganzen
-- Prozent über grobe Fächer heraus, nur für freigegebene öffentliche Strecken,
-- und erst ab 20 Starts im letzten Jahr. Darunter liefert sie keine Zeile: bei
-- drei Starts wäre "33 % Sonntagmorgen" ein Satz über eine Person.
create function public.strecken_startzeiten(p_route_id uuid)
returns table (wochentag smallint, tageszeit text, anteil smallint)
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  with starts as (
    select
      extract(isodow from s.gestartet_am at time zone 'Europe/Zurich')::smallint as wochentag,
      extract(hour from s.gestartet_am at time zone 'Europe/Zurich')::integer as stunde
    from public.fahrt_starts s
    join public.routes r on r.id = s.strecke_id
    where s.strecke_id = p_route_id
      and s.art = 'strecke'
      and r.status_ok = true
      and r.ist_privat = false
      and s.gestartet_am > now() - interval '365 days'
  ),
  gesamt as (
    select count(*) as n from starts
  )
  select
    starts.wochentag,
    case
      when starts.stunde < 10 then 'morgen'
      when starts.stunde < 14 then 'mittag'
      when starts.stunde < 18 then 'nachmittag'
      else 'abend'
    end as tageszeit,
    round(100.0 * count(*) / gesamt.n)::smallint as anteil
  from starts, gesamt
  where gesamt.n >= 20
  group by starts.wochentag, 2, gesamt.n;
$$;

revoke execute on function public.strecken_startzeiten(uuid) from public;
grant execute on function public.strecken_startzeiten(uuid) to anon, authenticated;
