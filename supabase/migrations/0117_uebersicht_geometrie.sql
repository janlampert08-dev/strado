-- 0117: Vereinfachte Geometrie für die Übersichtskarte.
--
-- Die Startseite lädt heute für JEDE Strecke die volle Geometrie
-- (getRoutes(), EXPLORE_SPALTEN in lib/routes.ts). Bei nationalem Bestand
-- wächst das mit jeder Strecke — für eine Karte auf Zoom 6.9 unnötig fein.
--
-- geometry_uebersicht ist eine gespeicherte, automatisch nachgeführte
-- Vereinfachung (Toleranz ~50 m). 26 Zeilen Bestand machen das Hinzufügen
-- billig; danach pflegt die Datenbank die Spalte selbst, ganz ohne
-- Trigger-Code im App-Repo. Die exakte Geometrie bleibt massgeblich für
-- Deckungsgrad (lib/routeCoverage.ts) und Erkennung (lib/lapDetection.ts) —
-- die Übersicht nutzt nur diese Spalte.
alter table public.routes
  add column if not exists geometry_uebersicht geography(LineString, 4326)
  generated always as (ST_Simplify(geometry::geometry, 0.0005)::geography) stored;

-- Ans View-Ende angehängt: CREATE OR REPLACE VIEW erlaubt kein Umsortieren.
create or replace view public.routes_geojson
with (security_invoker = true) as
select
  id,
  name,
  region,
  start_ort,
  ziel_ort,
  ST_AsGeoJSON(start_coord)::json as start_geojson,
  ST_AsGeoJSON(ziel_coord)::json as ziel_geojson,
  ST_AsGeoJSON(geometry)::json as geometry_geojson,
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
  ST_DWithin(start_coord, ziel_coord, 500) as ist_rundfahrt,
  erstellt_von,
  created_at,
  ist_privat,
  ST_AsGeoJSON(geometry_uebersicht)::json as geometry_uebersicht_geojson
from public.routes;

comment on column public.routes.geometry_uebersicht is
  'Vereinfachte Linie nur für Übersichtskarten (0117). Nie für Deckungsgrad oder Streckenerkennung verwenden — dort zählt die exakte geometry.';
