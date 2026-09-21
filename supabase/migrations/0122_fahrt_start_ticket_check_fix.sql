-- Fix für 0120: save_free_ride_with_segments prüft Ticket-Besitz über
-- fahrt_starts, aber diese Tabelle hat RLS ohne Policies (nur über SECURITY
-- DEFINER Funktionen erreichbar). Da save_free_ride_with_segments
-- SECURITY INVOKER ist, scheitert die Vorprüfung mit
-- "permission denied for table fahrt_starts".
--
-- Lösung: SECURITY DEFINER Helper-Funktion für die Ticket-Prüfung, die
-- save_free_ride_with_segments nutzt. Die Helper-Prüfung ist bewusst
-- grosszügig: Fremd oder unbekannt heisst nur "trail statt server", der
-- Trigger enforce_route_completion_dauer macht die finale Prüfung.

create or replace function public.fahrt_start_ticket_gehort(
  p_ticket_id uuid,
  p_user_id uuid
) returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Prüft, ob das Ticket dem User gehört (oder ein Gastticket ist).
  -- Gibt true zurück, wenn das Ticket einlösbar wäre.
  return exists (
    select 1 from public.fahrt_starts t
    where t.id = p_ticket_id
      and (t.user_id is null or t.user_id = p_user_id)
  );
end;
$$;

revoke execute on function public.fahrt_start_ticket_gehort(uuid, uuid) from public, anon;
grant execute on function public.fahrt_start_ticket_gehort(uuid, uuid) to authenticated;

comment on function public.fahrt_start_ticket_gehort(uuid, uuid) is
  'Prüft, ob ein Fahrtstart-Ticket dem angegebenen User gehört (oder ein Gastticket ist). SECURITY DEFINER, damit die RLS-freie Tabelle fahrt_starts gelesen werden kann. Wird von save_free_ride_with_segments (0120) für die Vorprüfung genutzt.';

-- save_free_ride_with_segments aktualisieren: statt direktem SELECT auf
-- fahrt_starts die Helper-Funktion nutzen. SECURITY INVOKER bleibt, damit
-- RLS auf route_completions greift (user_id = auth.uid()).

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
    hoehenmeter_aufstieg, hoehenprofil, hoehen_quelle, tempoprofil,
    track, track_oeffentlich,
    motorklasse_belegt
  ) values (
    auth.uid(), 'frei', null, (p_frei->>'fahrzeug_id')::uuid, (p_frei->>'datum')::date,
    (p_frei->>'distanz_km')::numeric, (p_frei->>'dauer_sekunden')::integer,
    (p_frei->>'bewegte_zeit_sekunden')::integer,
    (p_frei->>'ist_oeffentlich')::boolean, null,
    nullif(p_frei->>'titel', ''), nullif(p_frei->>'notiz', ''),
    p_frei->>'start_ort', p_frei->>'region',
    (p_frei->>'hoehenmeter_aufstieg')::numeric, p_frei->'hoehenprofil',
    nullif(p_frei->>'hoehen_quelle', ''), p_frei->'tempoprofil',
    nullif(p_frei->>'track', '')::geography, nullif(p_frei->>'track_oeffentlich', '')::geography,
    nullif(p_frei->>'motorklasse_belegt', '')
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

    -- Ticket-Vorpruefung über SECURITY DEFINER Helper: fremd oder unbekannt
    -- heisst trail statt Abbruch. Die endgueltige Pruefung (Pulse zum Track)
    -- macht der Trigger enforce_route_completion_dauer.
    v_ticket_id := nullif(v_segment->>'fahrt_start_id', '')::uuid;
    if v_ticket_id is not null and not public.fahrt_start_ticket_gehort(v_ticket_id, auth.uid()) then
      v_ticket_id := null;
    end if;

    insert into public.route_completions (
      user_id, art, route_id, fahrzeug_id, datum,
      distanz_km, dauer_sekunden, bewegte_zeit_sekunden,
      ist_oeffentlich, abdeckung_prozent,
      track, tempoprofil, parent_completion_id, erkennung_automatisch,
      motorklasse_belegt,
      dauer_quelle, fahrt_start_id,
      segment_fenster_von, segment_fenster_bis
    ) values (
      auth.uid(), 'strecke', v_segment_route_id, (p_frei->>'fahrzeug_id')::uuid, (p_frei->>'datum')::date,
      (v_segment->>'distanz_km')::numeric, (v_segment->>'dauer_sekunden')::integer,
      (v_segment->>'bewegte_zeit_sekunden')::integer,
      false, (v_segment->>'abdeckung_prozent')::numeric,
      nullif(v_segment->>'track', '')::geography, v_segment->'tempoprofil', v_parent_id, true,
      nullif(v_segment->>'motorklasse_belegt', ''),
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
revoke execute on function public.save_free_ride_with_segments(jsonb, jsonb) from anon;
grant execute on function public.save_free_ride_with_segments(jsonb, jsonb) to authenticated;

comment on function public.save_free_ride_with_segments(jsonb, jsonb) is
  'Legt eine freie Fahrt und ihre automatisch erkannten Streckenabschnitte (lib/lapDetection.ts) atomar an. SECURITY INVOKER — RLS greift für jede Zeile, user_id kommt ausschliesslich aus auth.uid(). Seit 0115 mit Tempoprofil (p_frei->''tempoprofil'', je Segment v_segment->''tempoprofil'') — reine Anzeige, keine Wertung. Seit 0120 mit Hoehenherkunft der Elternfahrt (p_frei->''hoehen_quelle'': swisstopo/geschaetzt, NULL = unbekannt) — ebenfalls reine Anzeige. Seit 0122 Ticket-Prüfung über fahrt_start_ticket_gehort (SECURITY DEFINER), damit die RLS-freie Tabelle fahrt_starts gelesen werden kann.';