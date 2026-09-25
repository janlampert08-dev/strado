-- 0137: GeoJSON der Strecken einmal beim Schreiben rechnen statt bei jedem Lesen.
--
-- Anlass (gemessen 2026-09-24/25, pg_stat_statements und EXPLAIN ANALYZE auf
-- der Produktion): public.routes_geojson rief ST_AsGeoJSON() pro Zeile VIER
-- Mal auf — Start, Ziel, volle Geometrie, Übersicht — und zwar bei jedem
-- Lesezugriff. Die View ist die meistgelesene des Schemas (Startseite,
-- Streckenseite, Fahrtseite, Teilen, Wetterfenster, Verkehrsprofil-Cron).
--   * Einzelzeile (select * where id = …, die längste Strecke):
--     13.0 ms Ausführung, im Mittel 20–28 ms über Tausende Aufrufe.
--   * 32 öffentliche Strecken, nur die vier GeoJSON-Spalten: Seq Scan
--     20.2 ms, gesamt 50.3 ms.
--   * Vergleich derselben 32 Zeilen: nur ST_AsGeoJSON(geometry) 26.8 ms im
--     Scan; die rohe, gleich grosse geometry plus tempolimits (jsonb) nur
--     auszulesen 1.5 ms. Die Zeit steckt in der Serialisierung, nicht im
--     Lesen der ~1.1 MB (Summe der GeoJSON-Texte: 1 147 844 Bytes).
--   Erwartet danach: die View liest vier gespeicherte json-Spalten; der Scan
--   liegt in der Grössenordnung des zweiten Vergleichs (~1–2 ms für alle 32,
--   eine Zeile deutlich unter 1 ms). Die Menge der übertragenen Bytes ändert
--   sich nicht — dafür gibt es EXPLORE_SPALTEN / Übersichtsgeometrie (0117).
--
-- Wie: vier GESPEICHERTE GENERIERTE Spalten auf public.routes, genau wie
-- geometry_uebersicht in 0117. Die Datenbank hält sie bei jedem INSERT/UPDATE
-- selbst nach (nach den BEFORE-Triggern, also auch nach
-- routes_kennzahlen_ableiten), es gibt keinen Trigger-Code, der vergessen
-- oder umgangen werden könnte.
--
-- Warum Spalten auf routes und keine Nebentabelle: eine Nebentabelle bräuchte
-- eigene RLS, die die von routes exakt nachbildet — sonst läse jeder über
-- sie die Geometrie privater oder abgelehnter Strecken. Spalten auf routes
-- erben die bestehenden Policies ohne jede Zeile Zusatzcode, und die View
-- bleibt security_invoker wie bisher.
--
-- Warum json und nicht jsonb: die View lieferte seit 0002 json. CREATE OR
-- REPLACE VIEW verlangt für bestehende Spalten denselben Typ, und die App
-- (types/database.ts RouteGeoJSON, PostgREST) bekommt so byte-gleich
-- dasselbe wie vorher — ST_AsGeoJSON(...)::json ist genau der Ausdruck, der
-- bisher in der View stand, nur jetzt gespeichert.
--
-- Eine Einschränkung von PostgreSQL: eine generierte Spalte darf keine andere
-- generierte Spalte lesen. geojson_uebersicht wiederholt deshalb den
-- Ausdruck von geometry_uebersicht (0117) statt diese Spalte zu lesen. Wer
-- die Toleranz dort je ändert, muss sie hier mitändern (steht auch im
-- Spaltenkommentar).
--
-- Was sich für Leser ändert: nichts. Die View behält Namen, Reihenfolge und
-- Typen aller 23 Spalten; nur die Ausdrücke dahinter werden Spaltenverweise.
-- Die Grants der View bleiben (CREATE OR REPLACE VIEW behält sie).
-- Nebenwirkung: lib/moderation.ts getPendingRoutes() liest routes mit
-- select("*") und bekommt die vier Spalten für die wenigen wartenden
-- Vorschläge mit. Die rohe geometry (WKB-Hex) war dort schon dabei; das ist
-- eine Handvoll Zeilen und nur für Moderatoren.
--
-- Kosten beim Schreiben: jede Änderung einer routes-Zeile rechnet die vier
-- Ausdrücke neu (PostgreSQL rechnet gespeicherte generierte Spalten bei jedem
-- UPDATE). Strecken werden selten geschrieben (Vorschlag, Freigabe,
-- Ablehnung) — ein paar Millisekunden dort gegen Tausende Lesezugriffe.
-- Das ADD COLUMN schreibt die Tabelle einmal um (34 Zeilen, ~1 MB): kurz,
-- aber mit ACCESS EXCLUSIVE; lock_timeout bricht ab statt zu warten.
--
-- Reihenfolge: unabhängig vom Code — kein Code liest die neuen Spalten direkt.
--
-- Prüfen danach:
--   select count(*) from public.routes
--    where geojson_geometrie::text is distinct from st_asgeojson(geometry)::json::text
--       or geojson_start::text   is distinct from st_asgeojson(start_coord)::json::text
--       or geojson_ziel::text    is distinct from st_asgeojson(ziel_coord)::json::text
--       or geojson_uebersicht::text is distinct from st_asgeojson(geometry_uebersicht)::json::text;
--   -- erwartet 0
--   explain analyze select * from public.routes_geojson where id = '<id>';
--   -- erwartet: kein Aufruf von st_asgeojson mehr im Plan-Output (verbose),
--   -- Ausführung deutlich unter 1 ms
--
-- Weg zurück (in dieser Reihenfolge — die View hängt an den Spalten):
--   create or replace view public.routes_geojson with (security_invoker = true) as
--   … Rumpf aus 0117 …;
--   alter table public.routes
--     drop column geojson_start, drop column geojson_ziel,
--     drop column geojson_geometrie, drop column geojson_uebersicht;

set lock_timeout = '5s';

alter table public.routes
  add column geojson_start json
    generated always as (ST_AsGeoJSON(start_coord)::json) stored,
  add column geojson_ziel json
    generated always as (ST_AsGeoJSON(ziel_coord)::json) stored,
  add column geojson_geometrie json
    generated always as (ST_AsGeoJSON(geometry)::json) stored,
  add column geojson_uebersicht json
    generated always as (
      ST_AsGeoJSON(ST_Simplify(geometry::geometry, 0.0005)::geography)::json
    ) stored;

comment on column public.routes.geojson_start is
  'ST_AsGeoJSON(start_coord), gespeichert (0137). Nur über routes_geojson.start_geojson lesen.';
comment on column public.routes.geojson_ziel is
  'ST_AsGeoJSON(ziel_coord), gespeichert (0137). Nur über routes_geojson.ziel_geojson lesen.';
comment on column public.routes.geojson_geometrie is
  'ST_AsGeoJSON(geometry), gespeichert (0137). Nur über routes_geojson.geometry_geojson lesen.';
comment on column public.routes.geojson_uebersicht is
  'ST_AsGeoJSON der Übersichtslinie, gespeichert (0137). Wiederholt den Ausdruck von geometry_uebersicht (0117), weil eine generierte Spalte keine andere lesen darf — Toleranz dort und hier gemeinsam ändern.';

-- Rumpf = LIVE-Rumpf (pg_get_viewdef am 2026-09-25, identisch mit 0117);
-- nur die vier ST_AsGeoJSON-Ausdrücke sind durch die Spalten ersetzt.
-- ist_rundfahrt bleibt gerechnet: ein ST_DWithin zweier Punkte kostet nichts.
create or replace view public.routes_geojson
with (security_invoker = true) as
select
  id,
  name,
  region,
  start_ort,
  ziel_ort,
  geojson_start as start_geojson,
  geojson_ziel as ziel_geojson,
  geojson_geometrie as geometry_geojson,
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
  geojson_uebersicht as geometry_uebersicht_geojson
from public.routes;
