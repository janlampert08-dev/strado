-- Nicht jede Tempolimit-Quelle ist amtlich: OpenStreetMap deckt als einzige
-- das ganze Land ab (Wallis, Tessin, Waadt, Berner Oberland — dort
-- veröffentlicht kein Kanton etwas), ist aber keine Behörde. Ebenso wenig
-- belegt ist die Geschwindigkeit im Bündner Lärmkataster: das Feld heisst
-- nur "speed_2019", und dass es die Signalisation wiedergibt, sagt keine
-- Beschreibung — die Werte sehen bloss danach aus.
--
-- Solche Quellen sollen die Lücken füllen dürfen, ohne dass ihre Werte als
-- amtlich ausgewiesen werden. Deshalb eine Spalte an der Quelle statt einer
-- zweiten Tabelle: derselbe Index, dieselbe Abfrage, ein Feld mehr in der
-- Antwort. Der Abgleich (lib/tempolimitAbgleich.ts) setzt damit
-- `amtlich: false` auf dem Segment, und amtlicherAnteilProzent() zählt es
-- nicht mit.
--
-- 0105, nicht 0104: 0104 bleibt für PR #281 frei, deren Migration wegen der
-- Kollision mit dem eingespielten 0103 umnummeriert werden muss.

alter table public.amtliche_tempolimit_quellen
  add column amtlich boolean not null default true;

comment on column public.amtliche_tempolimit_quellen.amtlich is
  'false für Quellen ohne behördliche Signalisationsangabe (OpenStreetMap, nicht deklarierte Lärmkataster-Werte).';

-- Der Rückgabetyp ändert sich, deshalb drop statt create or replace. Die
-- Rechte werden danach neu gesetzt: ein drop nimmt sie mit.
drop function if exists public.amtliche_tempolimits_entlang(jsonb);

create function public.amtliche_tempolimits_entlang(p_geometry_geojson jsonb)
returns table (quelle text, rang smallint, rand_m smallint, kmh smallint, amtlich boolean, geom_geojson jsonb)
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
  select tr.quelle, q.rang, q.rand_m, tr.kmh, q.amtlich, st_asgeojson(tr.geom, 1)::jsonb
  from treffer tr
  join public.amtliche_tempolimit_quellen q on q.id = tr.quelle
  where not st_isempty(tr.geom);
$$;

revoke execute on function public.amtliche_tempolimits_entlang(jsonb) from public, anon;
grant execute on function public.amtliche_tempolimits_entlang(jsonb) to authenticated;
