-- Gasttickets: eine Bremse, die niemand umgehen kann, und ein Aufraeumen, das
-- auch wirklich stattfindet.
--
-- WARUM
--
-- 0096 hat die Mengenbremse fuer Gaeste auf 256 Eimer verteilt, gewaehlt nach
-- den ersten zwei Hex-Zeichen des Abdrucks — 5 Tickets pro Eimer und Minute.
-- Das schuetzt echte Gaeste davor, dass jemand einen globalen Zaehler
-- vollhaelt. Es begrenzt aber nicht die Menge: den Abdruck waehlt der
-- Aufrufer, und fahrt_start_anlegen war fuer anon freigegeben, also per
-- PostgREST direkt erreichbar (an der IP-Bremse in lib/actions/fahrtstart.ts
-- vorbei). Ein Skript, das die 256 Praefixe durchgeht, legte so bis zu
-- 256 x 5 = 1280 Zeilen pro Minute an, unbegrenzt lange. Jedes dieser
-- Tickets nahm danach 24 Stunden lang alle 5 Sekunden einen Puls an (bis zu
-- 17'280 Zeilen in fahrt_pulse pro Ticket). Und aufgeraeumt wurde nur
-- zufaellig (2 % der Aufrufe), nur nie eingeloeste Tickets, und erst nach
-- 48 Stunden — wer nur pulst und nie neue Tickets anlegt, loest das
-- Aufraeumen gar nicht aus.
--
-- 0096 nennt die dichte Loesung selbst: "Gasttickets ueber den
-- Service-Role-Client holen". Genau das tut der Code zu dieser Migration
-- (lib/actions/fahrtstart.ts): angemeldete Fahrer rufen weiter mit ihrer
-- Sitzung auf, Gaeste ueber den Service-Role-Client — erst dann, wenn der
-- anon-Aufruf mit "permission denied" (42501) scheitert. Damit gilt fuer
-- jeden Gastaufruf die IP-Bremse der Server Action, und die Datenbank sieht
-- keine Aufrufe mehr, die an ihr vorbeigehen.
--
-- WAS SICH AENDERT
--
-- 1. anon verliert EXECUTE auf fahrt_start_anlegen und fahrt_start_puls.
--    authenticated und service_role behalten es. service_role hat keine
--    Sitzung, auth.uid() ist dort NULL — die Funktion nimmt also denselben
--    Gastzweig wie bisher.
-- 2. Gastzweig von fahrt_start_anlegen: statt 256 Eimern eine globale
--    Obergrenze, 10 Gasttickets pro Minute und 120 pro Stunde. Das ist die
--    Grenze, die 0096 verworfen hat, weil ein Angreifer sie vollhalten kann.
--    Das gilt weiter, aber nur noch durch die Server Action hindurch (IP-
--    Bremse, 20 pro IP und Minute), und der Schaden bleibt, was 0096
--    beschreibt: ein Gast faehrt dann auf dauer_quelle = 'trail', die Fahrt
--    geht nicht verloren, nur ihre Ranglistenwertung. Angemeldete Konten sind
--    nicht betroffen. Dagegen steht eine Menge, die ohne Obergrenze
--    unbegrenzt waechst — das ist die teurere Seite.
-- 3. fahrt_start_puls schreibt pro Ticket hoechstens 2160 Zeilen in
--    fahrt_pulse (6 Stunden im schnellen 10-Sekunden-Takt aus
--    lib/fahrtstart.ts, 12 Stunden im normalen). Danach wird der Puls
--    weiterhin am Ticket vermerkt (letzter_puls_am/-punkt, puls_anzahl) —
--    die gewertete Dauer einer ganzen Fahrt haengt nur daran und bleibt
--    also richtig. Es fehlt nur die Pulsspur fuer Abschnitte ab dieser
--    Grenze; enforce_route_completion_dauer findet dort keinen passenden
--    letzten Puls und wertet den Abschnitt als 'trail'. Bisher laengste
--    Fahrt: 164 Pulse.
-- 4. Aufraeumen per pg_cron alle 15 Minuten statt zufaellig: nie eingeloeste
--    Gasttickets nach 26 Stunden (nach 24 sind sie weder einloes- noch
--    pulsbar, siehe fahrt_start_einloesen/fahrt_start_puls), nie eingeloeste
--    Tickets angemeldeter Konten wie bisher nach 48. fahrt_pulse haengt mit
--    on delete cascade daran.
--
-- OBERGRENZE, DIE DARAUS FOLGT
--
-- Offene Gasttickets: hoechstens 120/h x ~26.25 h = 3150. Pulszeilen daran:
-- hoechstens 3150 x 2160 = 6.8 Mio — und dafuer muesste jemand 3150 Tickets
-- einen ganzen Tag lang alle 5 Sekunden bepulsen, rund 600 Aufrufe pro
-- Sekunde durch die Server Action (IP-Bremse 90 Pulse pro IP und Minute).
-- Vorher gab es keine Obergrenze. Eingeloeste Tickets bleiben liegen wie
-- bisher; sie gehoeren zu gespeicherten Fahrten angemeldeter Konten.
--
-- GEMESSEN am 2026-09-25 (Produktion, nur SELECT):
--   fahrt_starts 35 Zeilen (112 kB), davon 9 Gast, 8 Gast offen,
--   25 offen und aelter als 48 h (das Zufallsaufraeumen hat sie nie
--   erwischt). fahrt_pulse 367 Zeilen (144 kB), max. puls_anzahl 164.
--   Hoechste Gastrate bisher: 1 pro Minute, 4 pro Stunde (alle Tickets
--   zusammen ebenfalls hoechstens 4 pro Stunde).
--   Grants: anon/authenticated/service_role haben EXECUTE auf beiden
--   Funktionen. pg_cron 1.6.4 ist installiert (Job
--   abgelehnte-vorschlaege-loeschen aus 0055).
--
-- Die Rumpfe unten sind die LIVE-Rumpfe (pg_get_functiondef am 2026-09-25)
-- mit genau den beschriebenen Aenderungen.
--
-- REIHENFOLGE: Code zuerst, dann diese Migration. Umgekehrt scheitern
-- Gastaufrufe bis zum Deploy mit 42501 — die alte Server Action kennt den
-- Ausweg ueber den Service-Role-Client noch nicht. Auch das bricht nichts:
-- die Aufzeichnung laeuft weiter und wird als 'trail' gespeichert (siehe
-- Kommentar in fahrtStartAnlegen), nur ohne Ranglistenwertung.
--
-- PRUEFEN danach:
--   select proacl from pg_proc where proname in
--     ('fahrt_start_anlegen', 'fahrt_start_puls');         -- kein anon=X
--   select jobname, schedule from cron.job
--    where jobname = 'fahrtstarts-aufraeumen';              -- */15 * * * *
--   select public.fahrt_starts_aufraeumen();                 -- einmal von Hand
--   select count(*) from public.fahrt_starts
--    where verbraucht_am is null and gestartet_am < now() - interval '48 hours';  -- 0
--   Auf staging als Gast eine Fahrt starten: in fahrt_starts entsteht eine
--   Zeile mit user_id null, fahrt_pulse fuellt sich.
--
-- ZURUECK: die Rumpfe von fahrt_start_anlegen (0096, Eimer-Bremse und
-- Zufallsaufraeumen) und fahrt_start_puls (0098) wieder einspielen — beide
-- waren am 2026-09-25 live inhaltlich gleich wie dort, nur ohne Kommentare —,
-- dann
--   grant execute on function public.fahrt_start_anlegen(text, text, uuid) to anon;
--   grant execute on function public.fahrt_start_puls(uuid, text, double precision, double precision) to anon;
--   select cron.unschedule('fahrtstarts-aufraeumen');
--   drop function public.fahrt_starts_aufraeumen();
--   create index fahrt_starts_gast_eimer_idx on public.fahrt_starts
--     (left(geheimnis_abdruck, 2), gestartet_am) where user_id is null;
--   drop index public.fahrt_starts_gast_zeit_idx;
-- Der Code bleibt dabei gueltig: er ruft zuerst mit der Sitzung auf, und das
-- klappt dann auch fuer anon wieder.

set lock_timeout = '5s';

-- --------------------------------------------------------------------------
-- Index fuer die globale Gastgrenze
-- --------------------------------------------------------------------------
-- Die Zaehlung unten fragt "Gasttickets der letzten Stunde". Der Eimer-Index
-- aus 0096 fuehrt mit left(geheimnis_abdruck, 2) und passt dafuer nicht mehr;
-- ohne Eimer braucht ihn nichts mehr.
create index if not exists fahrt_starts_gast_zeit_idx
  on public.fahrt_starts (gestartet_am)
  where user_id is null;

drop index if exists public.fahrt_starts_gast_eimer_idx;

-- --------------------------------------------------------------------------
-- Anlegen
-- --------------------------------------------------------------------------
create or replace function public.fahrt_start_anlegen(
  p_abdruck text,
  p_art text,
  p_strecke_id uuid default null
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
  v_uid uuid := auth.uid();
  -- Grenzen fuer alle Gaeste zusammen (0133). Bisher hoechstens 4 Gasttickets
  -- pro Stunde; die Grenze liegt 30-fach darueber.
  v_gast_pro_minute constant integer := 10;
  v_gast_pro_stunde constant integer := 120;
begin
  if p_abdruck is null or p_abdruck !~ '^[0-9a-f]{64}$' then
    raise exception 'Ungueltiger Abdruck';
  end if;
  if p_art not in ('strecke', 'frei') then
    raise exception 'Ungueltige Art';
  end if;

  if v_uid is null then
    -- Gastzweig. Seit 0133 nicht mehr fuer anon ausfuehrbar: Gaeste kommen
    -- ueber den Service-Role-Client der Server Action, hinter deren
    -- IP-Bremse. Die Grenze hier ist die Obergrenze fuer den Fall, dass
    -- diese Bremse nicht reicht (viele Adressen, viele Serverinstanzen —
    -- isRateLimitedByKey zaehlt je Instanz im Speicher).
    --
    -- Eine Sperre fuer alle Gaeste: Zaehlen und Einfuegen muessen
    -- serialisiert sein, sonst sehen gleichzeitige Aufrufe denselben
    -- count(*). Bei ein paar Gasttickets pro Stunde kostet das nichts.
    perform pg_advisory_xact_lock(hashtext('fahrt_start_anlegen:gast'), 0);
    if (select count(*) from public.fahrt_starts
         where user_id is null
           and gestartet_am > now() - interval '1 minute') >= v_gast_pro_minute
       or (select count(*) from public.fahrt_starts
         where user_id is null
           and gestartet_am > now() - interval '1 hour') >= v_gast_pro_stunde then
      raise exception 'Zu viele Fahrtstarts';
    end if;
  else
    perform pg_advisory_xact_lock(hashtext('fahrt_start_anlegen'), hashtext(v_uid::text));
    if (select count(*) from public.fahrt_starts
         where user_id = v_uid
           and gestartet_am > now() - interval '1 minute') >= 10 then
      raise exception 'Zu viele Fahrtstarts';
    end if;
  end if;

  -- Kein beilaeufiges Aufraeumen mehr: das macht seit 0133 der Cron-Job
  -- fahrtstarts-aufraeumen (fahrt_starts_aufraeumen unten).

  insert into public.fahrt_starts (geheimnis_abdruck, user_id, strecke_id, art)
  values (p_abdruck, v_uid, p_strecke_id, p_art)
  returning id into v_id;

  return v_id;
end;
$$;

-- --------------------------------------------------------------------------
-- Puls
-- --------------------------------------------------------------------------
create or replace function public.fahrt_start_puls(
  p_id uuid,
  p_abdruck text,
  p_lat double precision,
  p_lng double precision
) returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_treffer integer;
  v_jetzt timestamptz := now();
  v_punkt geography(Point, 4326);
  v_anzahl integer;
  -- Hoechstens so viele Zeilen in fahrt_pulse je Ticket (0133): 6 Stunden im
  -- schnellen Takt (10 s), 12 im normalen (20 s). Bisher laengste Fahrt:
  -- 164 Pulse.
  v_max_pulszeilen constant integer := 2160;
begin
  if p_abdruck is null or p_abdruck !~ '^[0-9a-f]{64}$' then
    return false;
  end if;
  if p_lat is null or p_lng is null
     or p_lat < -90 or p_lat > 90 or p_lng < -180 or p_lng > 180 then
    return false;
  end if;

  v_punkt := st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography;

  update public.fahrt_starts
     set letzter_puls_am = v_jetzt,
         letzter_puls_punkt = v_punkt,
         puls_anzahl = puls_anzahl + 1
   where id = p_id
     and geheimnis_abdruck = p_abdruck
     and verbraucht_am is null
     and gestartet_am > now() - interval '24 hours'
     and (letzter_puls_am is null or letzter_puls_am < now() - interval '5 seconds')
  returning puls_anzahl into v_anzahl;

  get diagnostics v_treffer = row_count;
  if v_treffer = 0 then
    return false;
  end if;

  -- Ueber der Grenze zaehlt der Puls weiter fuer die Dauer der ganzen Fahrt
  -- (letzter_puls_am oben), hinterlaesst aber keine Zeile mehr. Die Pulsspur
  -- braucht nur die Abschnittswertung, und die faellt fuer Abschnitte jenseits
  -- der Grenze auf 'trail' zurueck.
  if v_anzahl <= v_max_pulszeilen then
    insert into public.fahrt_pulse (ticket_id, puls_am, punkt)
    values (p_id, v_jetzt, v_punkt);
  end if;

  return true;
end;
$$;

-- --------------------------------------------------------------------------
-- Grants
-- --------------------------------------------------------------------------
-- create or replace behaelt die bestehenden Grants; hier wird nur anon
-- entzogen. revoke from public zusaetzlich, falls die Funktion je neu
-- angelegt wurde (Supabase vergibt EXECUTE an PUBLIC, 0047/0048).
revoke execute on function public.fahrt_start_anlegen(text, text, uuid) from public, anon;
revoke execute on function public.fahrt_start_puls(uuid, text, double precision, double precision) from public, anon;
grant execute on function public.fahrt_start_anlegen(text, text, uuid) to authenticated, service_role;
grant execute on function public.fahrt_start_puls(uuid, text, double precision, double precision) to authenticated, service_role;

-- --------------------------------------------------------------------------
-- Aufraeumen
-- --------------------------------------------------------------------------
-- Kein SECURITY DEFINER, wie delete_alte_abgelehnte_vorschlaege (0055): der
-- Cron-Job laeuft als postgres, dem die Tabelle gehoert.
--
-- Gasttickets nach 26 Stunden: ab 24 nimmt weder fahrt_start_einloesen noch
-- fahrt_start_puls sie an, zwei Stunden Abstand reichen. Tickets
-- angemeldeter Konten wie bisher nach 48 — sie tragen nichts, was
-- Gasttickets nicht auch tragen, aber sie sind zurechenbar und einzeln
-- gedeckelt; hier gibt es keinen Grund, das Verhalten zu aendern.
-- strecken_startzeiten zaehlt nur, was noch da ist; nie eingeloeste Tickets
-- sind dort schon bisher nach 48 Stunden verschwunden.
create or replace function public.fahrt_starts_aufraeumen()
returns void
language sql
set search_path = public, pg_temp
as $$
  delete from public.fahrt_starts
   where verbraucht_am is null
     and (
       (user_id is null and gestartet_am < now() - interval '26 hours')
       or gestartet_am < now() - interval '48 hours'
     );
$$;

comment on function public.fahrt_starts_aufraeumen() is
  'Loescht nie eingeloeste Fahrtstart-Tickets (Gast nach 26 h, sonst nach 48 h); fahrt_pulse faellt per Cascade mit. Laeuft alle 15 Minuten per pg_cron (Job fahrtstarts-aufraeumen, 0133).';

revoke execute on function public.fahrt_starts_aufraeumen() from public;
revoke execute on function public.fahrt_starts_aufraeumen() from anon, authenticated;

-- Upsert per Jobname, die Migration bleibt erneut anwendbar (siehe 0055).
select cron.schedule(
  'fahrtstarts-aufraeumen',
  '*/15 * * * *',
  $$select public.fahrt_starts_aufraeumen();$$
);
