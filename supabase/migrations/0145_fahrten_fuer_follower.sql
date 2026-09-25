-- =====================================================================
-- 0145 — Fahrten nur für Follower teilen
-- =====================================================================
--
-- Eingespielt am 2026-09-25 (Supabase-Ledger: 0145_fahrten_fuer_follower),
-- nach einem zurückgerollten Funktionstest — siehe supabase/migrations/README.md.
--
-- Bisher kannte eine Fahrt zwei Zustände: privat oder öffentlich
-- (route_completions.ist_oeffentlich, 0017). Neu gibt es einen dritten:
-- sichtbar für die Leute, die dem Fahrer folgen (follows, 0030).
--
-- ENTSCHEIDUNG: eine eigene Spalte fuer_follower, ist_oeffentlich bleibt
-- dabei FALSE. Die Alternative — ist_oeffentlich = true plus ein
-- "nur_follower"-Flag — hätte jede der rund zwanzig Stellen, die heute auf
-- ist_oeffentlich filtern (Ranglisten, Streckenfotos, Pässe-Zähler,
-- Verkehrs- und Tempoprofil, Sitemap, …), zu einem Leck gemacht, sobald
-- eine davon den Zusatzfilter vergisst. So herum ist jede vergessene Stelle
-- nur eine, an der Follower-Fahrten FEHLEN. Fail closed.
--
-- Zustände (CHECK unten):
--   privat       ist_oeffentlich = false, fuer_follower = false
--   Follower     ist_oeffentlich = false, fuer_follower = true
--   öffentlich   ist_oeffentlich = true,  fuer_follower = false
--
-- Was Follower-Fahrten bekommen:  Feed, Fahrerprofil, Fahrt-Detailseite,
--   Karte (public_fahrt_tracks), Fotos, Kudos, Melden.
-- Was sie bewusst NICHT bekommen: Ranglisten und Bestzeiten
--   (route_leaderboard, leaderboard_completions), Streckenfotos
--   (route_photos), den Pässe-Zähler auf dem Profil
--   (oeffentliche_passhoehen). Eine Rangliste, deren Inhalt davon abhängt,
--   wer schaut, ist keine.
--
-- Wer "Follower" ist: jeder, der folgt. Folgen braucht in Strado keine
-- Bestätigung (0030) — die Stufe hält Fremde aus Feed und Suche heraus,
-- ist aber keine Zugangskontrolle gegen jemanden, der gezielt folgt. Das
-- sagt die Oberfläche auch so.
--
-- Moderation: Ein Follower kann eine Follower-Fahrt melden. Damit die
-- Meldung nicht still aus der Warteschlange fällt, liest lib/moderation.ts
-- die Angaben gemeldeter Fahrten über gemeldete_fahrten_fuer_moderation()
-- statt über public_fahrten. Bewusst NICHT über die Views: dort sähe ein
-- Moderator die Fahrt sonst im Feed, auf dem Profil, mit Karte und Fotos —
-- "nur Follower" hiesse dann "Follower und Moderatoren".
--
-- REIHENFOLGE: vor dem Code einspielen. Der alte Code bleibt damit voll
-- funktionsfähig (die Spalte steht auf false, die Views liefern dieselben
-- Zeilen wie vorher plus eine angehängte Spalte). Der neue Code ohne diese
-- Migration kann Streckenfahrten mit "Follower" nicht speichern.
--
-- PRÜFUNG DANACH:
--   select count(*) from public.route_completions where fuer_follower;  -- 0
--   select pg_get_viewdef('public.public_fahrten'::regclass) ilike '%fuer_follower%';  -- true
--
-- WEG ZURÜCK (erst den Code zurücknehmen): die vier Views, die zwei
-- Kudos-Policies, die Moderatoren-Policy, anonymize_account und
-- save_free_ride_with_segments mit ihren Definitionen vor dieser Datei neu
-- anlegen (0070/0045/0029/0031/0046 und der Katalogstand vom 2026-09-25),
-- dann Trigger, Funktionen und Spalte löschen.

-- Wie 0124/0125: ein Sperrkonflikt soll die Migration scheitern lassen,
-- nicht den Feed und das Speichern von Fahrten hinter sich anstauen.
set lock_timeout = '5s';

-- ---------------------------------------------------------------------
-- A) Spalte, Invarianten, Grants
-- ---------------------------------------------------------------------
alter table public.route_completions
  add column fuer_follower boolean not null default false;

comment on column public.route_completions.fuer_follower is
  'Fahrt ist für Follower des Fahrers sichtbar (0145). Nie zusammen mit ist_oeffentlich; öffentliche Views und Ranglisten filtern weiterhin nur auf ist_oeffentlich.';

alter table public.route_completions
  add constraint route_completions_sichtbarkeit_eindeutig
  check (not (ist_oeffentlich and fuer_follower));

-- Gegenstück zu route_completions_import_privat (0124): importierte Fahrten
-- bleiben privat, auch gegenüber Followern.
alter table public.route_completions
  add constraint route_completions_import_nicht_fuer_follower
  check (not (importiert and fuer_follower));

-- Der Feed (lib/feed.ts, order by datum desc, id desc limit 30) filtert
-- über public_fahrten jetzt auf "öffentlich ODER Follower" — der
-- Teilindex aus 0075 (where ist_oeffentlich) deckt das nicht mehr ab.
create index if not exists route_completions_geteilt_datum_idx
  on public.route_completions (datum desc, id desc)
  where ist_oeffentlich or fuer_follower;

-- authenticated hat seit 0046/0059 nur Spalten-Grants — eine neue Spalte
-- erbt davon nichts.
grant insert (fuer_follower), update (fuer_follower)
  on public.route_completions to authenticated;

-- ---------------------------------------------------------------------
-- B) Dieselben Hürden wie fürs Veröffentlichen
-- ---------------------------------------------------------------------
-- Eine Streckenfahrt unter 75 % Deckung behauptet eine Strecke, die sie
-- nicht gefahren ist (0052), eine freie Fahrt ohne Track belegt nichts
-- (0059) — das gilt für Follower genauso. Wie dort wird verengt statt
-- abgelehnt. Der Name beginnt mit "route_completions_zz_", damit der
-- Trigger nach route_completions_recompute_coverage läuft (Postgres feuert
-- BEFORE-Trigger alphabetisch) und abdeckung_prozent schon neu berechnet ist.
create or replace function public.enforce_follower_sichtbarkeit()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if new.fuer_follower and (
    new.ist_oeffentlich
    or new.importiert
    or (new.art = 'strecke' and coalesce(new.abdeckung_prozent, 0) < 75)
    or (new.art = 'frei' and new.track is null)
  ) then
    new.fuer_follower := false;
    -- Der gekappte Track gehört zu einer geteilten Fahrt. Wird die Fahrt
    -- hier privat, soll keiner liegen bleiben (siehe setCompletionVisibility).
    if not new.ist_oeffentlich then
      new.track_oeffentlich := null;
    end if;
  end if;
  return new;
end;
$$;

create trigger route_completions_zz_follower_sichtbarkeit
  before insert or update on public.route_completions
  for each row execute function public.enforce_follower_sichtbarkeit();

-- ---------------------------------------------------------------------
-- C) Wer eine Follower-Fahrt sehen darf
-- ---------------------------------------------------------------------
-- SECURITY DEFINER, weil die Kudos-Policies als Aufrufer laufen. Verrät
-- nichts, was der Aufrufer nicht ohnehin weiss: ob ER dem Fahrer folgt.
create or replace function public.fahrt_fuer_follower_sichtbar(p_owner uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select auth.uid() is not null and (
    p_owner = auth.uid()
    or exists (
      select 1 from public.follows f
      where f.follower_id = auth.uid() and f.followed_id = p_owner
    )
  );
$$;

comment on function public.fahrt_fuer_follower_sichtbar(uuid) is
  'True, wenn der Aufrufer eine Fahrt mit fuer_follower = true sehen darf: Besitzer oder Follower des Besitzers (0145). Prüft fuer_follower selbst NICHT — immer als "rc.fuer_follower and …" verwenden.';

-- Angaben gemeldeter Fahrten für die Moderationswarteschlange
-- (lib/moderation.ts). Dieselben Spalten und Streckenbedingungen wie
-- public_fahrten, aber für Moderatoren und nur bei offener Meldung — auch
-- für Follower-Fahrten, die ein Moderator sonst nicht sieht.
create or replace function public.gemeldete_fahrten_fuer_moderation(p_ids uuid[])
returns table (
  completion_id uuid,
  art text,
  titel text,
  start_ort text,
  route_name text,
  notiz text
)
language sql
stable
security definer
set search_path to 'public'
as $$
  select rc.id, rc.art, rc.titel, rc.start_ort, r.name, rc.notiz
  from public.route_completions rc
  left join public.routes r on r.id = rc.route_id
  where rc.id = any(p_ids)
    and (rc.ist_oeffentlich or rc.fuer_follower)
    and (
      (rc.art = 'frei' and rc.route_id is null)
      or (rc.art = 'strecke' and r.status_ok = true and r.ist_privat = false)
    )
    and exists (
      select 1 from public.profiles m
      where m.id = auth.uid() and m.is_moderator
    )
    and exists (
      select 1 from public.completion_reports cr
      where cr.completion_id = rc.id and cr.status = 'offen'
    );
$$;

-- Ersetzt completion_is_public (0031) in den Kudos-Policies.
-- completion_is_public bleibt unverändert bestehen: "öffentlich" heisst
-- dort weiterhin öffentlich.
create or replace function public.completion_ist_sichtbar(p_completion_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1
    from public.route_completions rc
    where rc.id = p_completion_id
      and (
        rc.ist_oeffentlich
        or (rc.fuer_follower and public.fahrt_fuer_follower_sichtbar(rc.user_id))
      )
  );
$$;

-- Funktionen in Views werden mit den Rechten des Abfragenden ausgeführt,
-- anon braucht EXECUTE also auch (liefert für anon immer false).
revoke execute on function public.fahrt_fuer_follower_sichtbar(uuid) from public;
revoke execute on function public.completion_ist_sichtbar(uuid) from public;
revoke execute on function public.gemeldete_fahrten_fuer_moderation(uuid[]) from public, anon;
grant execute on function public.gemeldete_fahrten_fuer_moderation(uuid[]) to authenticated;
-- Supabase gibt anon/authenticated für jede neue Funktion einen direkten
-- Grant; "from public" allein reicht nicht (0047/0048/0091).
revoke execute on function public.enforce_follower_sichtbarkeit() from public, anon, authenticated;
grant execute on function public.fahrt_fuer_follower_sichtbar(uuid) to anon, authenticated;
grant execute on function public.completion_ist_sichtbar(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------
-- D) Views: Katalogstand vom 2026-09-25, nur die WHERE-Bedingung erweitert
--    (public_fahrten zusätzlich mit angehängter Spalte fuer_follower,
--    damit die Oberfläche die Stufe anzeigen kann).
-- ---------------------------------------------------------------------
create or replace view public.public_fahrten as
select
  rc.user_id,
  rc.route_id,
  r.name as route_name,
  coalesce(r.region, rc.region) as region,
  r.laenge_km,
  rc.datum,
  rc.distanz_km,
  rc.id as completion_id,
  p.display_name,
  case when p.zeigt_avatar then p.avatar_url else null::text end as avatar_url,
  rc.dauer_sekunden,
  rc.foto_url,
  rc.notiz,
  rc.abdeckung_prozent,
  case when (p.zeigt_fahrzeuge or rc.user_id = auth.uid()) then v.typ else null::text end as fahrzeug_typ,
  case when (p.zeigt_fahrzeuge or rc.user_id = auth.uid()) then v.marke else null::text end as fahrzeug_marke,
  case when (p.zeigt_fahrzeuge or rc.user_id = auth.uid()) then v.modell else null::text end as fahrzeug_modell,
  rc.art,
  rc.titel,
  rc.start_ort,
  rc.bewegte_zeit_sekunden,
  rc.hoehenmeter_aufstieg,
  rc.dauer_quelle,
  rc.fuer_follower
from public.route_completions rc
join public.profiles p on p.id = rc.user_id
left join public.routes r on r.id = rc.route_id
left join public.vehicles v on v.id = rc.fahrzeug_id
where (
    rc.ist_oeffentlich = true
    or (rc.fuer_follower and public.fahrt_fuer_follower_sichtbar(rc.user_id))
  )
  and (
    (rc.art = 'frei' and rc.route_id is null)
    or (rc.art = 'strecke' and r.status_ok = true and r.ist_privat = false)
  );

comment on view public.public_fahrten is
  'Öffentliche Fahrten für alle, Follower-Fahrten (0145) zusätzlich für Follower des Fahrers. Läuft bewusst mit den Rechten des View-Owners (bypasst RLS); die Sichtbarkeit entscheidet die WHERE-Bedingung. Ranglisten lesen NICHT hieraus.';

create or replace view public.public_fahrt_tracks as
select
  rc.id as completion_id,
  (st_asgeojson(rc.track_oeffentlich))::json as track_geojson
from public.route_completions rc
left join public.routes r on r.id = rc.route_id
where (
    rc.ist_oeffentlich = true
    or (rc.fuer_follower and public.fahrt_fuer_follower_sichtbar(rc.user_id))
  )
  and rc.track_oeffentlich is not null
  and (
    (rc.art = 'frei' and rc.route_id is null)
    or (rc.art = 'strecke' and r.status_ok = true and r.ist_privat = false)
  );

comment on view public.public_fahrt_tracks is
  'Gekappter Track (Privatzone) öffentlicher Fahrten, bei Follower-Fahrten nur für Follower (0145). Läuft mit den Rechten des View-Owners.';

create or replace view public.public_completion_photos as
select
  cp.id,
  cp.completion_id,
  cp.foto_url,
  cp."position",
  p.display_name
from public.completion_photos cp
join public.route_completions rc on rc.id = cp.completion_id
join public.routes r on r.id = rc.route_id
join public.profiles p on p.id = cp.user_id
where (
    rc.ist_oeffentlich = true
    or (rc.fuer_follower and public.fahrt_fuer_follower_sichtbar(rc.user_id))
  )
  and r.status_ok = true
  and r.ist_privat = false
order by cp."position";

comment on view public.public_completion_photos is
  'Fotos einer einzelnen sichtbaren Streckenfahrt (öffentlich, oder Follower-Fahrt für Follower, 0145), für app/fahrten/[id]/page.tsx. Läuft mit den Rechten des View-Owners.';

create or replace view public.kudos_summary as
select
  k.completion_id,
  count(*) as kudos_count
from public.kudos k
join public.route_completions rc on rc.id = k.completion_id
where rc.ist_oeffentlich = true
   or (rc.fuer_follower and public.fahrt_fuer_follower_sichtbar(rc.user_id))
group by k.completion_id;

-- ---------------------------------------------------------------------
-- E) Kudos: auf allem, was man sehen darf
-- ---------------------------------------------------------------------
-- alter policy statt drop/create: die Namen stammen aus 0139 und bleiben,
-- obwohl "öffentlich" jetzt zu eng ist — 0134 und künftiges Aufräumen
-- finden die Policies so dort, wo sie sie erwarten.
alter policy "Kudos auf öffentlichen Fahrten sind sichtbar" on public.kudos
  using (public.completion_ist_sichtbar(completion_id));

alter policy "Nutzer geben Kudos nur auf öffentliche Fahrten" on public.kudos
  with check ((select auth.uid()) = user_id and public.completion_ist_sichtbar(completion_id));

-- ---------------------------------------------------------------------
-- F) Moderatoren nehmen eine Fahrt ganz aus der Sicht, auch für Follower
-- ---------------------------------------------------------------------
-- 0139 hat die Moderatoren-Policy mit der eigenen Update-Policy
-- zusammengelegt. Geändert wird nur das WITH CHECK, das USING bleibt, wie
-- es ist: 0134 schreibt dessen Moderatorenprüfung auf ist_moderator() um,
-- und diese Datei soll dort weder vorgreifen noch zurückdrehen.
alter policy "Nutzer bearbeiten eigene Fahrten, Moderatoren entöffentlichen"
  on public.route_completions
  with check (
    (select auth.uid()) = user_id
    or (ist_oeffentlich = false and fuer_follower = false and track_oeffentlich is null)
  );

-- ---------------------------------------------------------------------
-- G) Kontolöschung: Katalogstand vom 2026-09-25 plus fuer_follower = false.
--    Die Follower eines gelöschten Kontos sehen danach nichts mehr davon.
-- ---------------------------------------------------------------------
create or replace function public.anonymize_account(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
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
    zeigt_tempo = false,
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
    fuer_follower = false,
    ist_oeffentlich = case when art = 'frei' then false else ist_oeffentlich end
  where user_id = p_user_id;

  delete from public.vehicles where user_id = p_user_id;

  delete from public.subscriptions where user_id = p_user_id;

  delete from public.saisonpaesse where user_id = p_user_id;

  delete from public.premium_gratis where user_id = p_user_id;

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

-- ---------------------------------------------------------------------
-- H) Freie Fahrt speichern: Katalogstand vom 2026-09-25 plus fuer_follower
--    für die Elternfahrt. Erkannte Abschnitte bleiben wie bisher privat.
--    Fehlt der Schlüssel (alter Client), gilt false.
-- ---------------------------------------------------------------------
create or replace function public.save_free_ride_with_segments(p_frei jsonb, p_segments jsonb default '[]'::jsonb)
returns table(out_id uuid, out_art text, out_route_id uuid)
language plpgsql
set search_path to 'public', 'extensions'
as $function$
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
    ist_oeffentlich, fuer_follower, abdeckung_prozent,
    titel, notiz, start_ort, region,
    hoehenmeter_aufstieg, hoehenprofil, hoehen_quelle, tempoprofil,
    track, track_oeffentlich,
    motorklasse_belegt
  ) values (
    auth.uid(), 'frei', null, (p_frei->>'fahrzeug_id')::uuid, (p_frei->>'datum')::date,
    (p_frei->>'distanz_km')::numeric, (p_frei->>'dauer_sekunden')::integer,
    (p_frei->>'bewegte_zeit_sekunden')::integer,
    (p_frei->>'ist_oeffentlich')::boolean,
    coalesce((p_frei->>'fuer_follower')::boolean, false),
    null,
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
$function$;
