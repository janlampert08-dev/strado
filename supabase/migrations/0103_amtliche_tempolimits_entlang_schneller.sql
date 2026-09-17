-- amtliche_tempolimits_entlang() aus 0102 war für lange Strecken zu langsam:
-- gemessen am 2026-09-17 in Produktion 14,8 s für den Zürichsee Run (65 km),
-- also über dem Statement-Timeout der Rolle authenticated. proposeRoute()
-- fängt den Fehler ab und nimmt dann die Kartendaten — gerade lange Strecken
-- wären damit still ohne amtliche Werte geblieben.
--
-- Ursache: der 50-m-Puffer um die ganze Strecke ist ein einziges Polygon mit
-- tausenden Stützpunkten. Der Index grenzt über dessen Bounding-Box kaum ein
-- (sie umfasst halb Zürich), und jede exakte Prüfung und jeder Schnitt läuft
-- gegen die volle Geometrie.
--
-- Neu: der Puffer wird mit ST_Subdivide in Stücke von höchstens 64
-- Stützpunkten zerlegt. Jedes Stück findet über den GiST-Index nur seine
-- Nachbarschaft; gemessen 0,3 s für dieselbe Strecke, gleiche Längen je Quelle.
--
-- Zugeschnitten wird mit ST_ClipByBox2D auf die Bounding-Box des Stücks plus
-- 110 m, nicht auf das Stück selbst. Sonst lägen die Schnittkanten zwischen
-- zwei Stücken mitten im Korridor, und der Zonenrand-Abstand (rand_m, höchstens
-- 100 m laut Check in 0102) würde an ihnen fälschlich greifen: ein Punkt eines
-- Stücks liegt immer mehr als 100 m von der Kante seiner erweiterten Box. Ein
-- Objekt kann dadurch in mehreren Fragmenten zurückkommen; der Abgleich in
-- lib/tempolimitAbgleich.ts nimmt ohnehin den besten Treffer je Punkt.
--
-- Signatur, Rückgabe und Rechte bleiben wie in 0102.

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
  stuecke as (
    select st_subdivide(st_buffer(g, 50, 'quad_segs=2'), 64) as puffer from strecke
  ),
  treffer as (
    select t.quelle, t.kmh, st_clipbybox2d(t.geom, st_expand(st_envelope(s.puffer), 110)::box2d) as geom
    from stuecke s
    join public.amtliche_tempolimits t on st_intersects(t.geom, s.puffer)
  )
  select tr.quelle, q.rang, q.rand_m, tr.kmh, st_asgeojson(tr.geom, 1)::jsonb
  from treffer tr
  join public.amtliche_tempolimit_quellen q on q.id = tr.quelle
  where not st_isempty(tr.geom);
$$;

revoke execute on function public.amtliche_tempolimits_entlang(jsonb) from public, anon;
grant execute on function public.amtliche_tempolimits_entlang(jsonb) to authenticated;
