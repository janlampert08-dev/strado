-- 0120: Herkunft der Fahrten-Hoehen — ehrliche Quellenangabe statt Behauptung.
--
-- STAND. Routenprofile stammen immer von swisstopo swissALTI3D
-- (lib/actions/routes.ts verlangt profile.length >= 2, sonst kein Profil).
-- Fahrtenprofile dagegen entstehen in deriveElevation()
-- (lib/actions/completions.ts) best effort: kennt swisstopo die Koordinaten
-- nicht (ausserhalb der Schweiz) oder faellt der Dienst aus, gibt es kein
-- Profil und keinen Anstieg — die Fahrt wird trotzdem gespeichert.
-- Bis hierhin stand unter jedem Fahrtenprofil "Hoehen: swisstopo
-- swissALTI3D", auch dort, wo nie ein swisstopo-Wert geflossen ist.
--
-- SPALTE. route_completions.hoehen_quelle text, NULL zulaessig, mit
-- CHECK auf ('swisstopo', 'geschaetzt'):
-- - 'swisstopo' = Profil aus swissALTI3D (deriveElevation ok).
-- - 'geschaetzt' = Fallback/kein Profil (deriveElevation hat null
--   geliefert — Geraet/Fallback, jedenfalls kein swisstopo-Wert).
-- - NULL = Bestand von vor dieser Migration, unbekannt. Wird bewusst NICHT
--   als 'swisstopo' rueckgefuellt: eine Zeile, deren Herkunft niemand kennt,
--   als vermessen zu etikettieren waere genau die Luege, die diese Migration
--   abstellt. Die Anzeige rendert bei NULL keine Zeile (components/
--   ElevationProfile.tsx).
--
-- SICHTBARKEIT. Die Spalte steht in keiner oeffentlichen View
-- (public_fahrten und public_fahrt_tracks listen ihre Spalten ausdruecklich
-- auf) — kein neues Datum an anon. RLS auf route_completions zeigt ohnehin
-- nur eigene Zeilen; gelesen wird ueber die Basistabelle fuers den Besitzer
-- (lib/completions.ts), wie hoehenprofil und tempoprofil daneben.
--
-- KEINE WERTUNG. Die Quelle fliesst in keine Bestenliste, keine Statistik
-- und keinen Trigger ein — reine Anzeige. Ein Direktschreiber kann dort
-- beliebiges JSON ablegen (wie beim Tempoprofil aus 0115), gewinnt damit
-- aber nichts: durchgereicht, nicht geprueft.
--
-- save_free_ride_with_segments: Stand aus 0118 (Ticket + Fenster je
-- Abschnitt), erweitert um die Eltern-Spalte hoehen_quelle aus
-- p_frei->'hoehen_quelle' — plus die zwei Spalten zurueckgeholt, die 0118
-- gegenueber 0115/0081 verloren hat (tempoprofil je INSERT, motorklasse_belegt
-- je INSERT). Das ist die Lehre aus 0088/0090/0092: ein create or replace auf
-- einen aelteren Rumpf dreht 0115 still zurueck. Rumpf, Reihenfolge,
-- Cooldown-Behandlung, Segmentpruefung und search_path sind sonst unveraendert
-- uebernommen. SECURITY INVOKER bleibt, user_id kommt weiter ausschliesslich
-- aus auth.uid(). Die Rechtezeilen stehen wie in 0110 ausdruecklich da (die
-- Falle aus 0047/0048/0091/0097: revoke from public allein laesst den
-- direkten anon-Grant stehen).
--
-- anonymize_account uebernimmt den Rumpf aus 0115 und nullt die Spalte mit —
-- ein geloeschtes Konto behaelt keine Hoehenherkunft zurueck. Wie dort nur
-- service_role.
--
-- ROLLOUT. Schema zuerst, Code danach: lib/actions/completions.ts schreibt
-- die Spalte bei jeder neuen Fahrt (frei wie Strecke); ohne die Migration
-- schlaegt der direkte Insert der Streckenfahrt mit einem Spaltenfehler fehl
-- (die freie Fahrt ignoriert unbekannte JSON-Schluessel still — sie wuerde
-- gespeichert, die Quelle aber nie belegt).
--
-- PRUEFUNG nach dem Einspielen (Katalog):
--   select column_name, data_type, is_nullable from information_schema.columns
--    where table_schema = 'public' and table_name = 'route_completions'
--      and column_name = 'hoehen_quelle';
--   select conname, pg_get_constraintdef(oid) from pg_constraint
--    where conrelid = 'public.route_completions'::regclass
--      and pg_get_constraintdef(oid) like '%hoehen_quelle%';
--   select has_function_privilege('anon', 'public.save_free_ride_with_segments(jsonb,jsonb)', 'execute') as anon,
--          has_function_privilege('authenticated', 'public.save_free_ride_with_segments(jsonb,jsonb)', 'execute') as authenticated;
--   select position('hoehen_quelle' in pg_get_functiondef(p.oid)) > 0 as hat_spalte,
--          has_function_privilege('anon', p.oid, 'execute') as anon,
--          has_function_privilege('service_role', p.oid, 'execute') as service_role
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public' and p.proname = 'anonymize_account';
--   -- public_fahrten / public_fahrt_tracks fuehren die Spalte NICHT:
--   select viewname, definition from pg_views
--    where schemaname = 'public' and viewname in ('public_fahrten', 'public_fahrt_tracks');
--   -- Bestandszaehlung (Erwartung: alles NULL, kein Backfill):
--   select hoehen_quelle, count(*) from public.route_completions group by 1;
--
-- FUNKTIONALER TEST, zurueckgerollt: freie Fahrt mit hoehen_quelle =
-- 'geschaetzt' speichern, eigene Zeile lesen (Spalte gesetzt), als anon ueber
-- public_fahrten unsichtbar (Spalte dort gar nicht vorhanden), dann
-- anonymize_account() fuer das Konto aufrufen und hoehen_quelle als NULL
-- lesen — alles in einem DO-Block, dessen Ergebnis ueber raise exception
-- zurueckkommt und denselben Block zurueckrollt (Muster aus 0098/0101).
-- Weg zurueck: Spalte verwerfen (alter table ... drop column hoehen_quelle)
-- und 0115 bzw. 0118 erneut anwenden — beide Ruempfe stehen dort unveraendert.

alter table public.route_completions
  add column hoehen_quelle text
    check (hoehen_quelle in ('swisstopo', 'geschaetzt'));

comment on column public.route_completions.hoehen_quelle is
  'Herkunft des Fahrten-Hoehenprofils (0120): swisstopo = Profil aus swissALTI3D (deriveElevation ok), geschaetzt = Fallback/kein swisstopo-Wert (deriveElevation hat null geliefert). NULL bei allen Fahrten von vor dieser Migration — unbekannt, wird bewusst nicht rueckgefuellt. Nur fuer den Besitzer lesbar, in keiner oeffentlichen View. Reine Anzeige, fliesst in keine Wertung ein.';

-- save_free_ride_with_segments: Stand aus 0118 (Ticket + Fenster je
-- Abschnitt), erweitert um hoehen_quelle in der Elternfahrt sowie um die aus
-- 0115/0081 uebernommenen Spalten tempoprofil und motorklasse_belegt in
-- beiden INSERTs. Sonst unveraendert uebernommen (Rumpf, Reihenfolge,
-- Cooldown-Behandlung, Segmentpruefung, search_path).
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
  'Legt eine freie Fahrt und ihre automatisch erkannten Streckenabschnitte (lib/lapDetection.ts) atomar an. SECURITY INVOKER — RLS greift für jede Zeile, user_id kommt ausschliesslich aus auth.uid(). Seit 0115 mit Tempoprofil (p_frei->''tempoprofil'', je Segment v_segment->''tempoprofil'') — reine Anzeige, keine Wertung. Seit 0120 mit Hoehenherkunft der Elternfahrt (p_frei->''hoehen_quelle'': swisstopo/geschaetzt, NULL = unbekannt) — ebenfalls reine Anzeige.';

-- anonymize_account: Rumpf aus 0115, zusaetzlich hoehen_quelle = null.
create or replace function public.anonymize_account(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_user_id is null then
    raise exception 'anonymize_account: p_user_id darf nicht NULL sein';
  end if;

  update public.profiles
  set
    display_name = null,
    avatar_url = null,
    stripe_customer_id = null,
    zeigt_fahrzeuge = false,
    zeigt_avatar = false,
    zeigt_paesse = false,
    zeigt_hoehenmeter = false,
    zeigt_distanz = false,
    zeigt_follower_liste = false,
    zeigt_premium_badge = false,
    is_moderator = false,
    ist_premium = false,
    geloescht_am = coalesce(geloescht_am, now())
  where id = p_user_id;

  update public.route_completions
  set
    track = null,
    track_oeffentlich = null,
    tempoprofil = null,
    hoehen_quelle = null,
    ist_oeffentlich = case when art = 'frei' then false else ist_oeffentlich end
  where user_id = p_user_id;

  delete from public.vehicles where user_id = p_user_id;

  delete from public.subscriptions where user_id = p_user_id;

  delete from public.saisonpaesse where user_id = p_user_id;

  delete from public.registrierung_herkunft where user_id = p_user_id;

  update public.creator_konversionen
  set user_id = null
  where user_id = p_user_id;

  update public.creator_links
  set creator_user_id = null
  where creator_user_id = p_user_id;

  delete from public.fahrt_starts
   where user_id = p_user_id
      or eingeloest_von = p_user_id;

  delete from public.pass_folgen where user_id = p_user_id;
end;
$$;

comment on function public.anonymize_account(uuid) is
  'Anonymisiert ein Konto anhand der uebergebenen ID. Nur fuer service_role — der Aufrufer muss die Identitaet bereits festgestellt haben (deleteAccount() in lib/actions/auth.ts: Passwort-Neueingabe, dann Stripe-Kuendigung, dann diese Funktion mit der getUser()-ID). Loescht seit 0076 die subscriptions-Zeile, seit 0090 die Creator-Herkunft (in creator_konversionen wird nur der Personenbezug genullt), gibt seit 0092 zugewiesene Creator-Codes wieder frei, loescht seit 0101 die Fahrtstarts, seit der Paesse-Migration die gefolgten Paesse, seit 0110 die Saisonpaesse, seit 0115 das Tempoprofil der Fahrten und seit 0120 deren Hoehenherkunft.';

revoke execute on function public.anonymize_account(uuid) from public, anon, authenticated;
grant execute on function public.anonymize_account(uuid) to service_role;
