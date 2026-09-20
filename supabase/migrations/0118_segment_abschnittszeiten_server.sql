-- 0118: Erkannte Abschnitte koennen verifizierte Zeiten tragen.
--
-- Stand bisher: Ein aus einer freien Fahrt erkannter Streckenabschnitt
-- (0050, lib/lapDetection.ts) bekam seine Dauer immer aus den
-- Zeitstempeln des Geraets (dauer_quelle = 'trail') — der
-- enforce_route_completion_dauer-Trigger (0098) stufte jede Zeile ohne
-- Ticket ohnehin herab, und Segmente hatten gar kein Ticket. Damit
-- erschienen sie nie in einer Streckenbestenliste, obwohl die Fahrt
-- waehrenddessen lueckenlos gepulst haben kann.
--
-- Ab hier gilt: Wer waehrend einer freien Fahrt pulst, hinterlaesst eine
-- Puls-Historie (jede Serverzeit mit Position). Beim Speichern wird pro
-- erkanntem Abschnitt geprueft, ob Pulse sein Zeitfenster abdecken und an
-- beiden Enden zum eingereichten Track-Ausschnitt passen (500 m, dieselbe
-- Toleranz wie 0098). Dann traegt der Abschnitt eine Server-Dauer und
-- zaehlt fuer die Bestenliste — sonst bleibt er ehrlich 'trail'.
--
-- Das erfuellt die AGB-Definition (Ziff. 12.6: Dauer aus waehrend der Fahrt
-- gesendeten, server-gestempelten Positionsmeldungen, letzter Puls passend
-- zum Trackende) fuer Abschnitte genauso wie fuer ganze Fahrten.

-- ---------------------------------------------------------------------------
-- 1) Puls-Historie. Nur die letzte Position stand bisher auf fahrt_starts
--    (letzter_puls_am/punkt) — fuer ein Zeitfenster braucht es alle.
--    Volumen: ~3 Zeilen pro Minute Aufzeichnung, also wenige hundert pro
--    Fahrt. Kein Grant an anon/authenticated: gelesen wird ausschliesslich
--    ueber die SECURITY DEFINER-Funktionen unten (Geheimnis bzw. Trigger).
-- ---------------------------------------------------------------------------
create table public.fahrt_pulse (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.fahrt_starts (id) on delete cascade,
  puls_am timestamptz not null default now(),
  punkt geography(Point, 4326) not null
);

create index fahrt_pulse_ticket_zeit_idx
  on public.fahrt_pulse (ticket_id, puls_am);

alter table public.fahrt_pulse enable row level security;

revoke all on public.fahrt_pulse from public, anon, authenticated;

comment on table public.fahrt_pulse is
  'Server-gestempelte Positionsmeldungen je Fahrtstart-Ticket (0118). Grundlage fuer verifizierte Abschnittszeiten; nur ueber SECURITY DEFINER-Funktionen lesbar.';

-- ---------------------------------------------------------------------------
-- 2) fahrt_start_puls schreibt ab hier jede angenommene Meldung mit.
--    Vollstaendige Neufassung von 0098 (dort gelesen vor dem Ersetzen):
--    gleicher Vertrag (Rueckgabe, 5-s-Bremse, kein Puls nach Einloesen),
--    nur zusaetzlich ein History-Insert bei Annahme.
-- ---------------------------------------------------------------------------
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
     and (letzter_puls_am is null or letzter_puls_am < now() - interval '5 seconds');

  get diagnostics v_treffer = row_count;
  if v_treffer = 0 then
    return false;
  end if;

  insert into public.fahrt_pulse (ticket_id, puls_am, punkt)
  values (p_id, v_jetzt, v_punkt);

  return true;
end;
$$;

revoke execute on function public.fahrt_start_puls(uuid, text, double precision, double precision)
  from public, anon, authenticated;
grant execute on function public.fahrt_start_puls(uuid, text, double precision, double precision)
  to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3) Abschnittsdauer aus der Historie — die Vorab-Berechnung fuer die App.
--    Gibt Server-Sekunden zurueck oder NULL (dann gilt trail). Das Geheimnis
--    authentifiziert wie beim Einloesen; der Trigger unten rechnet
--    unabhaengig davon erneut (er kennt kein Geheimnis, dafuer die
--    Besitzkette) und bleibt massgeblich.
-- ---------------------------------------------------------------------------
create or replace function public.segment_dauer_einloesen(
  p_id uuid,
  p_abdruck text,
  p_von_ms bigint,
  p_bis_ms bigint,
  p_start_lng double precision,
  p_start_lat double precision,
  p_end_lng double precision,
  p_end_lat double precision
) returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ticket public.fahrt_starts%rowtype;
  v_erster_am timestamptz;
  v_letzter_am timestamptz;
  v_erster_punkt geography(Point, 4326);
  v_letzter_punkt geography(Point, 4326);
  v_toleranz_m constant double precision := 500;
begin
  if p_abdruck is null or p_abdruck !~ '^[0-9a-f]{64}$' then
    return null;
  end if;
  -- Fenster-Sanity: positiv, geordnet, hoechstens 24 Stunden weit.
  if p_von_ms is null or p_bis_ms is null
     or p_von_ms <= 0 or p_bis_ms <= p_von_ms
     or p_bis_ms - p_von_ms > 86400000 then
    return null;
  end if;

  select * into v_ticket
    from public.fahrt_starts
   where id = p_id
     and geheimnis_abdruck = p_abdruck
     and gestartet_am > now() - interval '24 hours'
     and (user_id is null or user_id = auth.uid());
  if v_ticket.id is null then
    return null;
  end if;

  select min(puls_am), max(puls_am) into v_erster_am, v_letzter_am
    from public.fahrt_pulse
   where ticket_id = p_id
     and puls_am >= to_timestamp(p_von_ms / 1000.0)
     and puls_am <= to_timestamp(p_bis_ms / 1000.0);

  -- Weniger als zwei verschiedene Pulse: keine messbare Dauer.
  if v_erster_am is null or v_letzter_am is null or v_letzter_am <= v_erster_am then
    return null;
  end if;

  select punkt into v_erster_punkt
    from public.fahrt_pulse
   where ticket_id = p_id and puls_am = v_erster_am
   limit 1;
  select punkt into v_letzter_punkt
    from public.fahrt_pulse
   where ticket_id = p_id and puls_am = v_letzter_am
   limit 1;

  -- Beide Fensterraender muessen zum eingereichten Abschnitt passen —
  -- dieselbe 500-m-Toleranz wie der 0098-Trigger am Trackende.
  if st_distance(
       v_erster_punkt,
       st_setsrid(st_makepoint(p_start_lng, p_start_lat), 4326)::geography
     ) > v_toleranz_m then
    return null;
  end if;
  if st_distance(
       v_letzter_punkt,
       st_setsrid(st_makepoint(p_end_lng, p_end_lat), 4326)::geography
     ) > v_toleranz_m then
    return null;
  end if;

  return greatest(1, extract(epoch from (v_letzter_am - v_erster_am))::integer);
end;
$$;

revoke execute on function public.segment_dauer_einloesen(uuid, text, bigint, bigint, double precision, double precision, double precision, double precision) from public, anon;
grant execute on function public.segment_dauer_einloesen(uuid, text, bigint, bigint, double precision, double precision, double precision, double precision) to authenticated;

comment on function public.segment_dauer_einloesen(uuid, text, bigint, bigint, double precision, double precision, double precision, double precision) is
  'Server-Dauer eines erkannten Abschnitts aus der Puls-Historie (0118). Vorab-Berechnung fuer die App; massgeblich bleibt der Trigger, der unabhaengig erneut rechnet.';

-- ---------------------------------------------------------------------------
-- 4) Fenster-Spalten: Selektoren (Client-Zeiten), nie Messwerte. Die Dauer
--    kommt immer aus puls_am (Serveruhr) — ein geweitetes Fenster kann die
--    Zeit nur verlaengern, nie verkuerzen, und beide Raender muessen zum
--    Track passen.
-- ---------------------------------------------------------------------------
alter table public.route_completions
  add column if not exists segment_fenster_von bigint,
  add column if not exists segment_fenster_bis bigint;

comment on column public.route_completions.segment_fenster_von is
  'Abschnittsfenster-Beginn als Client-ms (0118). Nur Selektor fuer die Puls-Historie, kein Messwert.';
comment on column public.route_completions.segment_fenster_bis is
  'Abschnittsfenster-Ende als Client-ms (0118). Nur Selektor fuer die Puls-Historie, kein Messwert.';

-- ---------------------------------------------------------------------------
-- 5) save_free_ride_with_segments nimmt je Abschnitt Ticket + Fenster an.
--    SECURITY INVOKER bleibt (RLS greift), user_id weiter nur aus auth.uid().
--    Fremdes/fehlendes Ticket: stille Herabstufung auf trail statt Abbruch —
--    Erkennung ist best effort, die freie Fahrt selbst nicht.
-- ---------------------------------------------------------------------------
create or replace function public.save_free_ride_with_segments(
  p_frei jsonb,
  p_segments jsonb default '[]'::jsonb
) returns table(out_id uuid, out_art text, out_route_id uuid)
language plpgsql
set search_path = public, extensions
as $$
declare
  v_parent_id uuid;
  v_segment jsonb;
  v_segment_route_id uuid;
  v_ticket_id uuid;
  v_max_segments constant int := 20;
begin
  if jsonb_typeof(p_segments) is distinct from 'array' then
    raise exception 'p_segments must be a json array';
  end if;
  if jsonb_array_length(p_segments) > v_max_segments then
    raise exception 'too_many_segments';
  end if;

  insert into public.route_completions (
    user_id, art, route_id, fahrzeug_id, datum,
    distanz_km, dauer_sekunden, bewegte_zeit_sekunden,
    ist_oeffentlich, abdeckung_prozent,
    titel, notiz, start_ort, region,
    hoehenmeter_aufstieg, hoehenprofil,
    track, track_oeffentlich
  ) values (
    auth.uid(), 'frei', null, (p_frei->>'fahrzeug_id')::uuid, (p_frei->>'datum')::date,
    (p_frei->>'distanz_km')::numeric, (p_frei->>'dauer_sekunden')::integer,
    (p_frei->>'bewegte_zeit_sekunden')::integer,
    (p_frei->>'ist_oeffentlich')::boolean, null,
    nullif(p_frei->>'titel', ''), nullif(p_frei->>'notiz', ''),
    p_frei->>'start_ort', p_frei->>'region',
    (p_frei->>'hoehenmeter_aufstieg')::numeric, p_frei->'hoehenprofil',
    nullif(p_frei->>'track', '')::geography, nullif(p_frei->>'track_oeffentlich', '')::geography
  )
  returning route_completions.id into v_parent_id;

  out_id := v_parent_id;
  out_art := 'frei';
  out_route_id := null;
  return next;

  if jsonb_array_length(p_segments) = 0 then
    return;
  end if;

  perform set_config('cornice.completion_batch_write', 'true', true);

  for v_segment in select * from jsonb_array_elements(p_segments) loop
    v_segment_route_id := (v_segment->>'route_id')::uuid;

    if not exists (
      select 1 from public.routes r
      where r.id = v_segment_route_id
        and r.status_ok = true
        and (r.ist_privat = false or r.erstellt_von = auth.uid())
    ) then
      raise exception 'route_not_eligible';
    end if;

    -- Ticket-Vorpruefung: fremd oder unbekannt heisst trail statt Abbruch.
    -- Die endgueltige Pruefung (Pulse zum Track) macht der Trigger.
    v_ticket_id := nullif(v_segment->>'fahrt_start_id', '')::uuid;
    if v_ticket_id is not null and not exists (
      select 1 from public.fahrt_starts t
      where t.id = v_ticket_id
        and (t.user_id is null or t.user_id = auth.uid())
    ) then
      v_ticket_id := null;
    end if;

    insert into public.route_completions (
      user_id, art, route_id, fahrzeug_id, datum,
      distanz_km, dauer_sekunden, bewegte_zeit_sekunden,
      ist_oeffentlich, abdeckung_prozent,
      track, parent_completion_id, erkennung_automatisch,
      dauer_quelle, fahrt_start_id,
      segment_fenster_von, segment_fenster_bis
    ) values (
      auth.uid(), 'strecke', v_segment_route_id, (p_frei->>'fahrzeug_id')::uuid, (p_frei->>'datum')::date,
      (v_segment->>'distanz_km')::numeric, (v_segment->>'dauer_sekunden')::integer,
      (v_segment->>'bewegte_zeit_sekunden')::integer,
      false, (v_segment->>'abdeckung_prozent')::numeric,
      nullif(v_segment->>'track', '')::geography, v_parent_id, true,
      case when v_ticket_id is null then 'trail' else coalesce(nullif(v_segment->>'dauer_quelle', ''), 'trail') end,
      v_ticket_id,
      nullif(v_segment->>'segment_fenster_von', '')::bigint,
      nullif(v_segment->>'segment_fenster_bis', '')::bigint
    )
    returning route_completions.id into out_id;

    out_art := 'strecke';
    out_route_id := v_segment_route_id;
    return next;
  end loop;
end;
$$;

revoke execute on function public.save_free_ride_with_segments(jsonb, jsonb) from public;
grant execute on function public.save_free_ride_with_segments(jsonb, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 6) Trigger: Segment-Zweig vor dem bisherigen Pfad. Verlangt die
--    eingeloste Besitzkette (Ticket vom selben Nutzer verbraucht — wer das
--    Ticket kennt, hat es auch eingelost) plus Pulsabdeckung beider
--    Fensterrraender. Scheitert etwas, gilt trail mit der eingereichten
--    Trail-Dauer — Herabstufung, keine Ablehnung.
-- ---------------------------------------------------------------------------
create or replace function public.enforce_route_completion_dauer()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_start public.fahrt_starts%rowtype;
  v_toleranz_m constant double precision := 500;
  v_erster_am timestamptz;
  v_letzter_am timestamptz;
  v_erster_punkt geography(Point, 4326);
  v_letzter_punkt geography(Point, 4326);
begin
  if new.fahrt_start_id is null then
    new.dauer_quelle := 'trail';
    return new;
  end if;

  select * into v_start
    from public.fahrt_starts
   where id = new.fahrt_start_id;

  -- Segment aus freier Fahrt (parent_completion_id gesetzt): eigene Dauer
  -- aus der Puls-Historie statt der Ticket-Gesamtdauer.
  if new.parent_completion_id is not null then
    if v_start.id is null
       or v_start.verbraucht_am is null
       or v_start.eingeloest_von is distinct from new.user_id
       or (v_start.user_id is not null and v_start.user_id is distinct from new.user_id)
       or new.segment_fenster_von is null
       or new.segment_fenster_bis is null
       or new.segment_fenster_von >= new.segment_fenster_bis
       or new.track is null then
      new.fahrt_start_id := null;
      new.dauer_quelle := 'trail';
      return new;
    end if;

    select min(puls_am), max(puls_am) into v_erster_am, v_letzter_am
      from public.fahrt_pulse
     where ticket_id = new.fahrt_start_id
       and puls_am >= to_timestamp(new.segment_fenster_von / 1000.0)
       and puls_am <= to_timestamp(new.segment_fenster_bis / 1000.0);

    if v_erster_am is null or v_letzter_am is null or v_letzter_am <= v_erster_am then
      new.fahrt_start_id := null;
      new.dauer_quelle := 'trail';
      return new;
    end if;

    select punkt into v_erster_punkt
      from public.fahrt_pulse
     where ticket_id = new.fahrt_start_id and puls_am = v_erster_am
     limit 1;
    select punkt into v_letzter_punkt
      from public.fahrt_pulse
     where ticket_id = new.fahrt_start_id and puls_am = v_letzter_am
     limit 1;

    if st_distance(
         v_erster_punkt,
         st_startpoint(new.track::geometry)::geography
       ) > v_toleranz_m
       or st_distance(
         v_letzter_punkt,
         st_endpoint(new.track::geometry)::geography
       ) > v_toleranz_m then
      new.fahrt_start_id := null;
      new.dauer_quelle := 'trail';
      return new;
    end if;

    new.dauer_quelle := 'server';
    new.dauer_sekunden := greatest(1, extract(epoch from (v_letzter_am - v_erster_am))::integer);
    return new;
  end if;

  -- Unbekanntes, nicht eingeloestes oder fremdes Ticket: Herabstufung, keine
  -- Ablehnung. Eine echte Fahrt wegzuwerfen waere der groessere Schaden.
  if v_start.id is null
     or v_start.verbraucht_am is null
     or v_start.dauer_sekunden is null
     or v_start.eingeloest_von is distinct from new.user_id then
    new.fahrt_start_id := null;
    new.dauer_quelle := 'trail';
    return new;
  end if;

  if v_start.letzter_puls_punkt is null or new.track is null then
    new.fahrt_start_id := null;
    new.dauer_quelle := 'trail';
    return new;
  end if;

  if st_distance(
       v_start.letzter_puls_punkt,
       st_endpoint(new.track::geometry)::geography
     ) > v_toleranz_m then
    new.fahrt_start_id := null;
    new.dauer_quelle := 'trail';
    return new;
  end if;

  new.dauer_quelle := 'server';
  new.dauer_sekunden := v_start.dauer_sekunden;
  return new;
end;
$$;

revoke execute on function public.enforce_route_completion_dauer() from public, anon, authenticated;

drop trigger if exists enforce_route_completion_dauer on public.route_completions;
create trigger enforce_route_completion_dauer
  before insert or update on public.route_completions
  for each row execute function public.enforce_route_completion_dauer();
