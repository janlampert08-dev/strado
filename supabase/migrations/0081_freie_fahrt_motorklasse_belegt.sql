-- =====================================================================
-- save_free_ride_with_segments um motorklasse_belegt erweitern.
--
-- 0080 hat route_completions.motorklasse_belegt angelegt — die aus dem
-- GPS-Track geschaetzte Mindestklasse, die die Datenbank in der generierten
-- Spalte motorklasse_gewertet mit der deklarierten Klasse zum Maximum
-- verrechnet. logTrackedCompletion schreibt sie direkt in die Tabelle und
-- braucht deshalb nichts weiter.
--
-- Die freie Fahrt laeuft dagegen ueber diese Funktion (0050), und deren
-- INSERTs zaehlen ihre Spalten ausdruecklich auf. Ein zusaetzlicher
-- jsonb-Schluessel in p_frei wuerde dort stillschweigend ignoriert: die
-- Fahrt wuerde gespeichert, die Klasse aber nie belegt — ein Fehler, der
-- nirgends rot wird. Deshalb diese Migration.
--
-- Geaendert gegenueber der Fassung aus 0050 ist AUSSCHLIESSLICH: je eine
-- Spalte und ein Wert in den beiden INSERTs. Rumpf, Reihenfolge,
-- Cooldown-Behandlung, Segmentpruefung und search_path sind unveraendert
-- uebernommen.
--
-- Warum nullif(..., '') statt eines direkten Casts: p_frei->>'x' liefert
-- fuer einen fehlenden Schluessel NULL und fuer JSON-null ebenfalls NULL,
-- aber ein leerer String kaeme als '' durch und wuerde den CHECK aus 0080
-- reissen. Dieselbe Absicherung wie bei track/titel/notiz nebenan.
--
-- Warum die Segmente ihren EIGENEN Belegwert bekommen und nicht den der
-- Elternfahrt: Sonst wuerde die Spitzenleistung einer schnellen Etappe eine
-- ruhige Runde auf einer anderen Strecke mit hochstufen. buildDetectedSegments
-- (lib/actions/completions.ts) rechnet je Segment aus dessen eigenem
-- Trail-Ausschnitt.
--
-- CREATE OR REPLACE erhaelt die bestehenden Rechte: der Entzug fuer anon aus
-- 0051 und das EXECUTE fuer authenticated aus 0050 bleiben unangetastet.
-- Mengengeruest: keine Datenaenderung, nur eine Funktionsdefinition.
-- =====================================================================

create or replace function public.save_free_ride_with_segments(
  p_frei jsonb,
  p_segments jsonb default '[]'::jsonb
) returns table(out_id uuid, out_art text, out_route_id uuid)
language plpgsql
-- Pinnt nur die Namensauflösung für die ::geography-Casts unten (auf
-- Supabase-Projekten teils in "extensions" statt "public" installiert),
-- keine erhöhten Rechte — bleibt SECURITY INVOKER, RLS greift unverändert
-- für jede Zeile. Ohne das könnte "type geography does not exist"
-- auftreten, falls der ambiente search_path der aufrufenden Rolle
-- (authenticated) das PostGIS-Schema nicht enthält.
set search_path = public, extensions
as $$
declare
  v_parent_id uuid;
  v_segment jsonb;
  v_segment_route_id uuid;
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

  -- Ab hier: Kindzeilen derselben, bereits gegen den Cooldown geprüften
  -- Aktion (siehe enforce_completion_cooldown oben).
  perform set_config('cornice.completion_batch_write', 'true', true);

  for v_segment in select * from jsonb_array_elements(p_segments) loop
    v_segment_route_id := (v_segment->>'route_id')::uuid;

    -- Sichtbarkeitsprüfung nochmal hier, nicht nur in der aufrufenden
    -- TypeScript-Kandidatenauswahl (lib/routes.ts: listLoopRouteCandidates).
    -- RLS auf routes (status_ok/ist_privat, siehe 0049) würde eine fremde
    -- private oder nicht freigegebene Strecke ohnehin nicht liefern — diese
    -- Funktion läuft SECURITY INVOKER, RLS greift also bereits. Die
    -- Bedingung steht trotzdem explizit hier: falls ein direkter RPC-Aufruf
    -- (unter Umgehung der App) eine solche route_id unterschiebt, soll das
    -- lesbar als "route_not_eligible" scheitern statt sich implizit allein
    -- auf die Policy zu verlassen.
    if not exists (
      select 1 from public.routes r
      where r.id = v_segment_route_id
        and r.status_ok = true
        and (r.ist_privat = false or r.erstellt_von = auth.uid())
    ) then
      raise exception 'route_not_eligible';
    end if;

    insert into public.route_completions (
      user_id, art, route_id, fahrzeug_id, datum,
      distanz_km, dauer_sekunden, bewegte_zeit_sekunden,
      ist_oeffentlich, abdeckung_prozent,
      track, parent_completion_id, erkennung_automatisch,
      motorklasse_belegt
    ) values (
      auth.uid(), 'strecke', v_segment_route_id, (p_frei->>'fahrzeug_id')::uuid, (p_frei->>'datum')::date,
      (v_segment->>'distanz_km')::numeric, (v_segment->>'dauer_sekunden')::integer,
      (v_segment->>'bewegte_zeit_sekunden')::integer,
      false, (v_segment->>'abdeckung_prozent')::numeric,
      nullif(v_segment->>'track', '')::geography, v_parent_id, true,
      nullif(v_segment->>'motorklasse_belegt', '')
    )
    returning route_completions.id into out_id;

    out_art := 'strecke';
    out_route_id := v_segment_route_id;
    return next;
  end loop;
end;
$$;

comment on function public.save_free_ride_with_segments(jsonb, jsonb) is
  'Legt eine freie Fahrt und ihre automatisch erkannten Streckenabschnitte (lib/lapDetection.ts) atomar an. SECURITY INVOKER — RLS greift fuer jede Zeile, user_id kommt ausschliesslich aus auth.uid(). Seit 0081 wird motorklasse_belegt mitgeschrieben, je Zeile aus dem zugehoerigen Trail-Ausschnitt.';
