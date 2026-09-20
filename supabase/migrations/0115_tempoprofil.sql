-- Tempoprofil je Fahrt: wo man wie schnell gefahren ist — nur für den
-- Fahrer selbst.
--
-- Die gespeicherte Track-Geometrie ist vereinfacht und trägt keine Zeiten
-- mehr (lib/track.ts); aus ihr lässt sich kein Tempo mehr ableiten. Der
-- Client schickt die Rohpunkte mit Zeitstempel (TrailPoint.t, lib/geo.ts),
-- die Server Action rechnet daraus beim Speichern ein geglättetes Profil
-- [{km, kmh}] (lib/tempoprofil.ts: buildTempoprofil) und legt es hier ab —
-- in derselben Form wie das Höhenprofil, damit sich das Diagramm ohne
-- Umrechnung zeichnen lässt. Alte Fahrten bekommen keins (null): das
-- Diagramm und die Einfärbung entfallen dort ersatzlos.
--
-- SICHTBARKEIT. Die Spalte steht in keiner öffentlichen View (public_fahrten
-- und public_fahrt_tracks listen ihre Spalten ausdrücklich auf) und die
-- RLS-Policy auf route_completions ("Nutzer sehen eigene Fahrten", 0001)
-- zeigt ohnehin nur eigene Zeilen — der Lesezugriff läuft wie beim
-- Höhenprofil über die Basistabelle für den Besitzer allein
-- (lib/completions.ts). Der Grund ist zweifach: AGB Ziff. 11.3 ("kein
-- Wettbewerb um Geschwindigkeit") und Art. 90 SVG — eine öffentliche Karte
-- "hier bin ich 140 gefahren" wäre ein Beweismittel gegen den Fahrer.
-- Wer das Profil je in ein Teilen-Bild, den Feed oder eine öffentliche View
-- hängen will, führt diese Abwägung zuerst neu.
--
-- KEINE WERTUNG. Das Profil fliesst in keine Bestenliste, keine Statistik
-- (lib/fahrtstatistik.ts bleibt bewusst tempo-frei) und keinen Trigger —
-- es ist reine Anzeige. Ein Direktschreiber kann sich damit kein besseres
-- Ergebnis verschaffen als ohne.
--
-- save_free_ride_with_segments (0050, Stand 0081) nimmt das Profil für die
-- Elternfahrt aus p_frei->'tempoprofil' und je erkanntem Abschnitt aus dem
-- jeweiligen Segment-JSON. Die Funktion bleibt SECURITY INVOKER, user_id kommt weiter
-- ausschliesslich aus auth.uid(). Die Rechtezeilen stehen wie in 0110
-- ausdrücklich da (die Falle aus 0047/0048/0091/0097: revoke from public
-- allein lässt den direkten anon-Grant stehen).
--
-- anonymize_account übernimmt den Live-Rumpf aus 0110 (Saisonpässe,
-- Fahrtstarts, Pass-Folgen) und nullt die Spalte mit — ein gelöschtes Konto
-- behält kein Bewegungsprofil zurück.

alter table public.route_completions
  add column tempoprofil jsonb;

comment on column public.route_completions.tempoprofil is
  'Geglättetes Tempo je Kilometer [{km, kmh}] aus den Roh-Zeitstempeln beim Speichern (lib/tempoprofil.ts). Nur für den Besitzer lesbar — in keiner öffentlichen View enthalten (AGB Ziff. 11.3, Art. 90 SVG). Null bei allen Fahrten von vor dieser Migration. Fliesst in keine Wertung ein.';

-- save_free_ride_with_segments: Stand aus 0081 (motorklasse_belegt in beiden
-- INSERTs), erweitert um tempoprofil — je eine Spalte und ein Wert in den
-- beiden INSERTs, sonst unverändert übernommen (Rumpf, Reihenfolge,
-- Cooldown-Behandlung, Segmentprüfung, search_path). Das ist die Lehre aus
-- 0088/0090/0092: ein create or replace auf einen älteren Rumpf würde 0081
-- still zurückdrehen.
--
-- Die Funktion bleibt SECURITY INVOKER, user_id kommt weiter ausschliesslich
-- aus auth.uid(). Die Rechtezeilen stehen ausdrücklich da (die Falle aus
-- 0047/0048/0091/0097: revoke from public allein lässt den direkten
-- anon-Grant stehen).
--
-- p_frei->'tempoprofil' bzw. je Segment v_segment->'tempoprofil' kommen aus
-- der Server Action (lib/actions/completions.ts), die sie aus den
-- Roh-Zeitstempeln rechnet — ein Direktschreiber kann dort beliebiges JSON
-- ablegen, gewinnt damit aber nichts: Das Profil fliesst in keine Wertung
-- ein. Wie beim Höhenprofil daneben wird durchgereicht, nicht geprüft.
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
    hoehenmeter_aufstieg, hoehenprofil, tempoprofil,
    track, track_oeffentlich,
    motorklasse_belegt
  ) values (
    auth.uid(), 'frei', null, (p_frei->>'fahrzeug_id')::uuid, (p_frei->>'datum')::date,
    (p_frei->>'distanz_km')::numeric, (p_frei->>'dauer_sekunden')::integer,
    (p_frei->>'bewegte_zeit_sekunden')::integer,
    (p_frei->>'ist_oeffentlich')::boolean, null,
    nullif(p_frei->>'titel', ''), nullif(p_frei->>'notiz', ''),
    p_frei->>'start_ort', p_frei->>'region',
    (p_frei->>'hoehenmeter_aufstieg')::numeric, p_frei->'hoehenprofil', p_frei->'tempoprofil',
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

    insert into public.route_completions (
      user_id, art, route_id, fahrzeug_id, datum,
      distanz_km, dauer_sekunden, bewegte_zeit_sekunden,
      ist_oeffentlich, abdeckung_prozent,
      track, tempoprofil, parent_completion_id, erkennung_automatisch,
      motorklasse_belegt
    ) values (
      auth.uid(), 'strecke', v_segment_route_id, (p_frei->>'fahrzeug_id')::uuid, (p_frei->>'datum')::date,
      (v_segment->>'distanz_km')::numeric, (v_segment->>'dauer_sekunden')::integer,
      (v_segment->>'bewegte_zeit_sekunden')::integer,
      false, (v_segment->>'abdeckung_prozent')::numeric,
      nullif(v_segment->>'track', '')::geography, v_segment->'tempoprofil', v_parent_id, true,
      nullif(v_segment->>'motorklasse_belegt', '')
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
  'Legt eine freie Fahrt und ihre automatisch erkannten Streckenabschnitte (lib/lapDetection.ts) atomar an. SECURITY INVOKER — RLS greift für jede Zeile, user_id kommt ausschliesslich aus auth.uid(). Seit 0115 mit Tempoprofil (p_frei->''tempoprofil'', je Segment v_segment->''tempoprofil'') — reine Anzeige, keine Wertung.';

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
  'Anonymisiert ein Konto anhand der uebergebenen ID. Nur fuer service_role — der Aufrufer muss die Identitaet bereits festgestellt haben (deleteAccount() in lib/actions/auth.ts: Passwort-Neueingabe, dann Stripe-Kuendigung, dann diese Funktion mit der getUser()-ID). Loescht seit 0076 die subscriptions-Zeile, seit 0090 die Creator-Herkunft (in creator_konversionen wird nur der Personenbezug genullt), gibt seit 0092 zugewiesene Creator-Codes wieder frei, loescht seit 0101 die Fahrtstarts, seit der Paesse-Migration die gefolgten Paesse, seit 0110 die Saisonpaesse und seit 0115 das Tempoprofil der Fahrten.';

revoke execute on function public.anonymize_account(uuid) from public, anon, authenticated;
grant execute on function public.anonymize_account(uuid) to service_role;
