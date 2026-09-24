-- 0130_strecken_slugs.sql
--
-- WARUM
-- Streckenseiten liegen unter /strecken/<uuid>. Die Adresse ist das, was in
-- einem geteilten Link, in der Suchmaschine und im Browserverlauf steht —
-- und eine UUID sagt dort nichts. Neu: /strecken/aecherlipass-kerns-dallenwil.
-- Die App nimmt weiterhin beide Formen an und leitet eine UUID-Adresse
-- dauerhaft (308) auf den Slug weiter (app/strecken/[id]/page.tsx), alte
-- Links bleiben also gültig.
--
-- WAS
--   1. routes.slug text, eindeutig (partieller Unique-Index, nur wo gesetzt),
--      Form per Check-Constraint: [a-z0-9] in Gruppen, einzelne Bindestriche.
--   2. strecken_slug_text() / strecken_slug_basis(): die Regel als reine
--      Funktionen. Gespiegelt in lib/streckenPfad.ts (streckenSlugBasis),
--      lib/streckenPfad.test.ts hält beide an denselben Beispielen fest.
--        Punkt-zu-Punkt:  name-start-ziel        aecherlipass-kerns-dallenwil
--        Rundfahrt:       name-rundfahrt-ab-start albis-loop-rundfahrt-ab-langnau-am-albis
--      (Rundfahrt = Start- gleich Zielort, ohne Rücksicht auf Grossschreibung
--      — bewusst über die Ortsnamen und nicht über ist_rundfahrt der View,
--      die 500 m Luftlinie misst: der Slug besteht aus Namen, also entscheidet
--      auch der Name.) Umlaute ä→ae ö→oe ü→ue, übrige Akzente auf den
--      Grundbuchstaben (feste Tabelle, unaccent ist nicht installiert), alles
--      andere wird zu '-'. Höchstens 60 Zeichen, am letzten Bindestrich davor
--      abgeschnitten.
--   3. Trigger strecken_slug_setzen (BEFORE INSERT OR UPDATE):
--        - Ein gesetzter Slug ändert sich NIE mehr — auch nicht bei einer
--          Umbenennung, auch nicht, wenn jemand ihn per PostgREST
--          überschreiben will (routes trägt Tabellen-Grants für
--          authenticated, und die eigene, noch nicht freigegebene Strecke
--          darf man per RLS bearbeiten). Ein Link, der einmal geteilt wurde,
--          muss halten.
--        - Solange keiner gesetzt ist, verwirft der Trigger jeden Wert vom
--          Client: den Slug vergibt nur die Datenbank.
--        - Vergeben wird er, sobald die Strecke freigegeben UND öffentlich
--          ist (status_ok and not ist_privat) — bei der Freigabe durch die
--          Moderation (lib/actions/moderation.ts) oder bei einem direkt
--          freigegeben angelegten Datensatz. Private und wartende Strecken
--          bleiben bei der UUID-Adresse: so trägt kein Slug je einen Namen,
--          den die Öffentlichkeit nicht sehen darf, und der schöne Name geht
--          an die Fassung, die tatsächlich freigegeben wurde (Namen ändern
--          sich in der Moderation noch).
--        - Kollision → -2, -3 … (die ältere Strecke behält die Grundform).
--          Eine Advisory-Sperre serialisiert gleichzeitige Freigaben, damit
--          zwei davon nicht denselben freien Namen sehen; der Unique-Index
--          bleibt die eigentliche Garantie.
--        - Ein Slug in UUID-Form (praktisch unmöglich, aber die App
--          unterscheidet UUID und Slug an genau dieser Form) bekommt
--          '-strecke' angehängt.
--   4. Backfill der bestehenden freigegebenen, öffentlichen Strecken, älteste
--      zuerst (über den Trigger, damit es nur eine Regel gibt).
--   5. routes_geojson: slug am ENDE angehängt (CREATE OR REPLACE VIEW kann
--      nicht umsortieren). Rumpf = live gelesener Rumpf
--      (pg_get_viewdef am 2026-09-25, Stand nach 0117), plus slug.
--      security_invoker bleibt ausdrücklich gesetzt: CREATE OR REPLACE
--      ersetzt die reloptions der View durch die der neuen Anweisung, ohne
--      die Klausel liefe die View danach mit den Rechten ihres Owners — an
--      RLS vorbei, also mit privaten Strecken.
--
-- GEMESSEN (2026-09-25, Produktion, nur SELECT)
--   34 Zeilen in routes, 32 davon freigegeben und öffentlich, 2 privat und
--   wartend. Die Regel oben als reine Abfrage über alle 34 gerechnet: keine
--   Kollision, längster Slug 51 Zeichen
--   (san-bernardino-passstrasse-hinterrhein-s-bernardino), keiner leer.
--   Trigger auf routes vorher: private_strecke_kontingent (UPDATE OF
--   ist_privat), routes_kennzahlen_ableiten_trg (UPDATE OF geometry, …),
--   routes_proposal_cooldown (INSERT) — der Backfill setzt nur slug und
--   löst keinen davon aus.
--
-- REIHENFOLGE
--   Unabhängig vom Code. Ohne die Migration liest die App keinen Slug und
--   bleibt bei UUID-Adressen (Feature-Erkennung in lib/routes.ts); mit ihr,
--   aber vor dem Code, trägt die View eine Spalte, die noch niemand liest.
--
-- PRÜFEN DANACH
--   select count(*) filter (where slug is not null) as mit_slug,
--          count(*) filter (where status_ok and not ist_privat) as oeffentlich
--     from public.routes;                       -- beide 32
--   select slug from public.routes where name = 'Ächerlipass';
--                                               -- aecherlipass-kerns-dallenwil
--   select pg_get_viewdef('public.routes_geojson'::regclass) ~ 'slug';  -- t
--   select reloptions from pg_class where oid = 'public.routes_geojson'::regclass;
--                                               -- {security_invoker=true}
--   select has_function_privilege('anon', 'public.strecken_slug_setzen()', 'execute');
--                                               -- f
--   Unveränderlichkeit, als zurückgerollter Test:
--   begin;
--     update public.routes set name = 'X', slug = 'y' where name = 'Ächerlipass'
--       returning slug;                         -- aecherlipass-kerns-dallenwil
--   rollback;
--
-- WEG ZURÜCK
--   Die App kommt ohne die Spalte aus (siehe REIHENFOLGE); eine
--   UUID-Adresse funktioniert immer. Aber: wer die Spalte fallen lässt,
--   bricht jeden bis dahin geteilten Slug-Link — deshalb nur, solange die
--   lesbaren Adressen noch nicht draussen sind.
--   Die View-Spalte lässt sich per CREATE OR REPLACE nicht wieder entfernen;
--   dafür drop view + create view mit dem Rumpf aus 0117 (samt
--   security_invoker und den Grants für anon/authenticated). Solange die
--   View bleibt, genügt es, nur den Trigger zu entfernen:
--   drop trigger strecken_slug_setzen on public.routes;
--   drop function public.strecken_slug_setzen();
--   drop function public.strecken_slug_basis(text, text, text);
--   drop function public.strecken_slug_text(text);
--   alter table public.routes drop column slug;   -- erst nach dem Neuaufbau
--                                                 -- der View; nimmt Index und Check mit

-- 1. Spalte, Form, Eindeutigkeit -------------------------------------------

alter table public.routes add column if not exists slug text;

alter table public.routes
  add constraint routes_slug_format
  check (slug is null or slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$');

create unique index if not exists routes_slug_key
  on public.routes (slug)
  where slug is not null;

comment on column public.routes.slug is
  'Lesbare Adresse /strecken/<slug>. Vergeben vom Trigger strecken_slug_setzen bei der Freigabe (status_ok und nicht privat), danach unveränderlich — auch bei Umbenennung. Siehe 0130_strecken_slugs.sql und lib/streckenPfad.ts.';

-- 2. Die Regel -------------------------------------------------------------

-- Ein Text als Slug-Teil. Die Zeichentabelle ist dieselbe wie
-- AKZENTE_VON/AKZENTE_NACH in lib/streckenPfad.ts.
create or replace function public.strecken_slug_text(p text)
returns text
language sql
immutable
set search_path = pg_catalog, pg_temp
as $$
  select trim(both '-' from regexp_replace(
    translate(
      replace(replace(replace(replace(replace(replace(
        lower(coalesce(p, '')),
        'ä', 'ae'), 'ö', 'oe'), 'ü', 'ue'), 'ß', 'ss'), 'æ', 'ae'), 'œ', 'oe'),
      'àáâãåāèéêëēìíîïīòóôõøōùúûūýÿñçčšžł',
      'aaaaaaeeeeeiiiiioooooouuuuyynccszl'),
    '[^a-z0-9]+', '-', 'g'))
$$;

create or replace function public.strecken_slug_basis(p_name text, p_start text, p_ziel text)
returns text
language plpgsql
immutable
set search_path = public, pg_catalog, pg_temp
as $$
declare
  n text := coalesce(nullif(public.strecken_slug_text(p_name), ''), 'strecke');
  s text := public.strecken_slug_text(p_start);
  z text := public.strecken_slug_text(p_ziel);
  r text;
begin
  if lower(trim(coalesce(p_start, ''))) = lower(trim(coalesce(p_ziel, ''))) then
    r := n || case when s <> '' then '-rundfahrt-ab-' || s else '' end;
  else
    r := concat_ws('-', n, nullif(s, ''), nullif(z, ''));
  end if;

  if length(r) > 60 then
    -- Am letzten Bindestrich innerhalb der ersten 61 Zeichen abschneiden:
    -- ist Zeichen 61 selbst ein Bindestrich, bleibt das Wort davor ganz.
    r := regexp_replace(left(r, 61), '-[^-]*$', '');
    if length(r) > 60 then
      r := left(r, 60);
    end if;
    r := trim(both '-' from r);
  end if;

  return r;
end;
$$;

-- 3. Vergabe und Unveränderlichkeit ----------------------------------------

-- SECURITY DEFINER, weil die Kollisionsprüfung alle Slugs sehen muss: die
-- Freigabe läuft als Moderator über RLS, und eine Strecke, die nach der
-- Freigabe privat wurde, behält ihren Slug, wäre für die Prüfung aber
-- unsichtbar — die Freigabe scheiterte dann am Unique-Index statt auf -2
-- auszuweichen. Die Funktion liest nur routes.slug und schreibt nur NEW; sie
-- nimmt keinen Parameter, ist als Triggerfunktion nicht per RPC aufrufbar,
-- und EXECUTE wird trotzdem allen Rollen entzogen.
create or replace function public.strecken_slug_setzen()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog, pg_temp
as $$
declare
  basis text;
  kandidat text;
  nummer int := 1;
begin
  if tg_op = 'UPDATE' and old.slug is not null then
    new.slug := old.slug;
    return new;
  end if;

  new.slug := null;

  if not (coalesce(new.status_ok, false) and not coalesce(new.ist_privat, false)) then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtext('public.routes.slug'));

  basis := public.strecken_slug_basis(new.name, new.start_ort, new.ziel_ort);
  if basis ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    basis := basis || '-strecke';
  end if;

  kandidat := basis;
  while exists (select 1 from public.routes r where r.slug = kandidat and r.id <> new.id) loop
    nummer := nummer + 1;
    kandidat := basis || '-' || nummer;
  end loop;

  new.slug := kandidat;
  return new;
end;
$$;

revoke execute on function public.strecken_slug_setzen() from public, anon, authenticated;
revoke execute on function public.strecken_slug_basis(text, text, text) from public, anon, authenticated;
revoke execute on function public.strecken_slug_text(text) from public, anon, authenticated;

drop trigger if exists strecken_slug_setzen on public.routes;
create trigger strecken_slug_setzen
  before insert or update on public.routes
  for each row execute function public.strecken_slug_setzen();

-- 4. Backfill, älteste zuerst ----------------------------------------------

do $$
declare
  zeile record;
begin
  for zeile in
    select id from public.routes
    where slug is null and status_ok and not ist_privat
    order by created_at, id
  loop
    -- Der Trigger ersetzt den Wert; das SET ist nur der Anlass.
    update public.routes set slug = null where id = zeile.id;
  end loop;
end;
$$;

-- 5. View ------------------------------------------------------------------

create or replace view public.routes_geojson
with (security_invoker = true) as
 select id,
    name,
    region,
    start_ort,
    ziel_ort,
    st_asgeojson(start_coord)::json as start_geojson,
    st_asgeojson(ziel_coord)::json as ziel_geojson,
    st_asgeojson(geometry)::json as geometry_geojson,
    hoehe_m,
    laenge_km,
    max_steigung_prozent,
    kehren,
    kategorien,
    saison_status,
    status_ok,
    charakter_text,
    tempolimits,
    hoehenprofil,
    st_dwithin(start_coord, ziel_coord, 500::double precision) as ist_rundfahrt,
    erstellt_von,
    created_at,
    ist_privat,
    st_asgeojson(geometry_uebersicht)::json as geometry_uebersicht_geojson,
    slug
   from public.routes;
