-- Amtliche Tempolimits der Schweiz: signalisierte Höchstgeschwindigkeiten
-- aus den offenen Geodaten der Kantone und Städte, für das ganze Land statt
-- nur für einzelne Strecken.
--
-- Bisher kannte die App amtliche Werte nur für neun Seed-Strecken im Kanton
-- Zürich, einmalig per Skript eingerechnet (seed/0011). Mit dieser Tabelle
-- liegen alle veröffentlichten Datensätze in der Datenbank, und
-- proposeRoute() gleicht jede neu angelegte Strecke dagegen ab
-- (lib/amtlicheTempolimits.ts).
--
-- Befüllt wird sie nicht von dieser Migration, sondern von
--   node scripts/enrich-amtliche-tempolimits.mjs --hochladen
-- mit dem Secret Key (Service Role, umgeht RLS). Das Verzeichnis der
-- Quellen mit Lizenz und Datenstand ist scripts/amtliche-tempolimits/quellen.mjs.
--
-- SRID 2056 (LV95) statt 4326 wie bei routes.geometry, bewusst: alle
-- Quellen liefern nativ LV95, der Abgleich rechnet in Metern, und
-- ST_DWithin auf einer metrischen geometry-Spalte nutzt den GiST-Index
-- direkt, ohne geography-Umweg.
--
-- 0102, nicht 0101: 0101_anonymisierung_fahrtstarts liegt auf einem offenen
-- Branch.

create table public.amtliche_tempolimit_quellen (
  id text primary key check (id ~ '^[a-z0-9-]{1,40}$'),
  name text not null,
  traeger text not null,
  gebiet text not null,
  datensatz text not null,
  lizenz text not null,
  -- Datenstand laut Anbieter, falls er ihn nennt (Aargau: 2017-01-01).
  stand date,
  art text not null check (art in ('linie', 'zone')),
  -- Bei Überschneidungen gewinnt der kleinere Rang: kommunale Linien (1)
  -- vor kantonalen (2) vor reinen Tempo-30-Zonen (3).
  rang smallint not null check (rang between 1 and 9),
  -- Nur für Zonen: wie weit ein Streckenpunkt mindestens innerhalb der
  -- Fläche liegen muss, damit eine Hauptstrasse am Zonenrand nicht als
  -- Tempo 30 gilt.
  rand_m smallint not null default 0 check (rand_m between 0 and 100),
  anzahl integer not null default 0,
  geladen_am timestamptz not null default now()
);

create table public.amtliche_tempolimits (
  id bigint generated always as identity primary key,
  quelle text not null references public.amtliche_tempolimit_quellen (id) on delete cascade,
  kmh smallint not null check (kmh between 20 and 120),
  geom geometry(Geometry, 2056) not null
    check (geometrytype(geom) in ('LINESTRING', 'MULTILINESTRING', 'POLYGON', 'MULTIPOLYGON'))
);

-- Behördendaten enthalten gelegentlich ungültige Flächen (Selbstschnitte,
-- doppelte Stützpunkte). ST_Intersection in amtliche_tempolimits_entlang()
-- bricht an solchen ab und würde damit jeden Streckenvorschlag in der Nähe
-- um seine amtlichen Werte bringen — daher beim Schreiben reparieren. Linien
-- sind in PostGIS praktisch immer gültig und bleiben unberührt.
create or replace function public.amtliche_tempolimits_geom_reparieren()
returns trigger
language plpgsql
set search_path = public, extensions, pg_temp
as $$
begin
  if geometrytype(new.geom) in ('POLYGON', 'MULTIPOLYGON') and not st_isvalid(new.geom) then
    new.geom := st_multi(st_collectionextract(st_makevalid(new.geom), 3));
  end if;
  return new;
end;
$$;

revoke execute on function public.amtliche_tempolimits_geom_reparieren() from public, anon, authenticated;

create trigger amtliche_tempolimits_geom_reparieren
  before insert or update of geom on public.amtliche_tempolimits
  for each row execute function public.amtliche_tempolimits_geom_reparieren();

create index amtliche_tempolimits_geom_idx on public.amtliche_tempolimits using gist (geom);
create index amtliche_tempolimits_quelle_idx on public.amtliche_tempolimits (quelle);

-- Offene Behördendaten: lesen darf jeder, schreiben nur der Service Role
-- beim Hochladen. Die Grants sind ausdrücklich für anon UND authenticated
-- gesetzt — ein revoke nur von public lässt Supabases direkte Default-Grants
-- stehen (die Falle aus 0047/0048/0091/0097).
alter table public.amtliche_tempolimit_quellen enable row level security;
alter table public.amtliche_tempolimits enable row level security;

create policy amtliche_tempolimit_quellen_lesen on public.amtliche_tempolimit_quellen
  for select to anon, authenticated using (true);
create policy amtliche_tempolimits_lesen on public.amtliche_tempolimits
  for select to anon, authenticated using (true);

revoke all on public.amtliche_tempolimit_quellen from public, anon, authenticated;
revoke all on public.amtliche_tempolimits from public, anon, authenticated;
grant select on public.amtliche_tempolimit_quellen to anon, authenticated;
grant select on public.amtliche_tempolimits to anon, authenticated;

-- Die amtlichen Objekte entlang einer Strecke, auf einen 50-m-Korridor
-- zugeschnitten, als GeoJSON in LV95 (auf 10 cm gerundet). Zuschneiden,
-- weil eine Genfer Zone ganze Quartiere umfasst und sonst mit jeder Strecke
-- vollständig über die Leitung ginge; 50 m liegen über der Abgleich-Toleranz
-- (20 m) und dem grössten Zonenrand (rand_m), die Schnittkante beeinflusst
-- das Ergebnis also nicht.
--
-- SECURITY INVOKER: die Tabellen sind ohnehin lesbar, die Funktion braucht
-- keine Rechte über den Aufrufer hinaus. Nur für authenticated, weil nur
-- proposeRoute() sie braucht und ein Puffer über eine lange Geometrie nicht
-- gratis ist — anon hat keinen Grund, sie aufzurufen.
create or replace function public.amtliche_tempolimits_entlang(p_geometry_geojson jsonb)
returns table (quelle text, rang smallint, rand_m smallint, kmh smallint, geom_geojson jsonb)
language sql
stable
security invoker
set search_path = public, extensions, pg_temp
as $$
  with strecke as (
    select st_transform(st_setsrid(st_geomfromgeojson(p_geometry_geojson::text), 4326), 2056) as g
  ),
  korridor as (
    select g, st_buffer(g, 50) as puffer from strecke
  )
  select
    t.quelle,
    q.rang,
    q.rand_m,
    t.kmh,
    st_asgeojson(st_intersection(t.geom, k.puffer), 1)::jsonb
  from korridor k
  join public.amtliche_tempolimits t on st_dwithin(t.geom, k.g, 50)
  join public.amtliche_tempolimit_quellen q on q.id = t.quelle;
$$;

revoke execute on function public.amtliche_tempolimits_entlang(jsonb) from public, anon;
grant execute on function public.amtliche_tempolimits_entlang(jsonb) to authenticated;
