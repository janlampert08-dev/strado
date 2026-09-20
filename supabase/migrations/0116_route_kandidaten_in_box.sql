-- 0116: Streckenerkennung per PostGIS vorfiltern.
--
-- Bisher lädt listRouteDetectionCandidates() bei JEDER freien Fahrt alle
-- Geometrien (id, name, volle Linie) und filtert in JS per Bbox. Bei
-- wachsendem Bestand wächst damit jede Fahrt mit — Bytes und
-- Projektionskosten, obwohl nur die Nachbarschaft zählt.
--
-- Diese Funktion schränkt serverseitig auf das übergebene Rechteck ein
-- (Trail-Bbox plus Marge, Aufrufer: lib/routes.ts). Der &&-Operator nutzt
-- den GIST-Index routes_geometry_idx. Rückgabe sind bewusst nur die
-- Spalten, die detectLaps() braucht — kein Höhenprofil, keine Tempolimits.
--
-- Zugriff: nur authenticated (Erkennung läuft in der Speicher-Action als
-- der speichernde Nutzer). Kein anon-Grant: die Funktion würde sonst die
-- Existenz privater Strecken Dritter preisgeben — derselbe Grund, aus dem
-- listRouteDetectionCandidates() nur eigene private Strecken liefert.
create or replace function public.route_kandidaten_in_box(
  p_min_lng double precision,
  p_min_lat double precision,
  p_max_lng double precision,
  p_max_lat double precision,
  p_viewer_id uuid
)
returns table (
  id uuid,
  name text,
  geometry_geojson json,
  ist_rundfahrt boolean
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    r.id,
    r.name,
    ST_AsGeoJSON(r.geometry)::json as geometry_geojson,
    ST_DWithin(r.start_coord, r.ziel_coord, 500) as ist_rundfahrt
  from public.routes r
  where r.status_ok = true
    and (r.ist_privat = false or r.erstellt_von = p_viewer_id)
    and r.geometry::geometry && ST_MakeEnvelope(p_min_lng, p_min_lat, p_max_lng, p_max_lat, 4326)
$$;

revoke execute on function public.route_kandidaten_in_box(double precision, double precision, double precision, double precision, uuid) from public, anon;
grant execute on function public.route_kandidaten_in_box(double precision, double precision, double precision, double precision, uuid) to authenticated;

comment on function public.route_kandidaten_in_box(double precision, double precision, double precision, double precision, uuid) is
  'Bbox-Vorfilter für die Streckenerkennung freier Fahrten (lib/routes.ts). Gibt nur freigegebene Strecken zurück (plus eigene private) — kein Ersatz für die RLS-Prüfung in save_free_ride_with_segments.';
