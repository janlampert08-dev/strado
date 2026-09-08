-- ---------------------------------------------------------------------------
-- Deckungsgrad: zurückgelegte Länge mitrechnen
--
-- Audit-Befund A1, dritter Punkt (docs/audit/README.md, 2026-09-06), bis
-- heute offen. compute_route_coverage_percent() aus 0052 fragt je Abtastpunkt
-- der Strecke nur, ob IRGENDEIN Trackpunkt innerhalb von 80 m liegt. Die
-- Reihenfolge spielt keine Rolle, und wie oft ein Streckenstück befahren
-- wurde, auch nicht.
--
-- Bei einer Strecke, die über dieselbe Strasse zurückführt, ist das der ganze
-- Unterschied: auf einer 20 km langen Hin-und-zurück-Strecke liegt jeder
-- Abtastpunkt des Rückwegs zugleich auf dem Hinweg. Wer nur die 10 km hinaus
-- fährt, deckt rechnerisch 100 % ab und darf veröffentlichen. Das Audit hat
-- genau diesen Fall durch Ausführen der JS-Fassung nachgewiesen; die
-- TypeScript-Seite dieser Änderung misst dafür jetzt 50 %
-- (lib/routeCoverage.test.ts, "Hin-und-zurück-Strecken").
--
-- DIE ÄNDERUNG
--
-- Zusätzlich zum Berührungsanteil wird gemessen, wie viel der Streckenlänge
-- der Track überhaupt zurücklegt. Das Ergebnis ist das Minimum aus beiden:
-- eine Fahrt muss die Strecke berühren UND ihre Länge zurücklegen.
--
-- Die zweite Messung kennt keine Positionen, nur Distanz. Sie lässt sich
-- durch mehrfaches Befahren desselben Stücks nicht schönen, und sie braucht
-- keinen Ordnungsvergleich zwischen zwei Punktfolgen — der wäre in SQL ein
-- Schleifenkonstrukt mit O(Abtastpunkte × Trackpunkte) PostGIS-Aufrufen pro
-- INSERT und für einen BEFORE-Trigger zu teuer. Zwei ST_Length-Aufrufe sind
-- es nicht.
--
-- WAS SIE NICHT TUT
--
-- Sie macht den Deckungsgrad nicht richtungsbewusst im wörtlichen Sinn. Eine
-- Punkt-zu-Punkt-Strecke in der Gegenrichtung zu fahren zählt weiterhin voll,
-- und das ist Absicht: über einen Pass in die andere Richtung zu fahren ist
-- eine eigene, ebenso echte Fahrt. Was sie schliesst, ist der Fall "nur die
-- halbe Strecke gefahren, aber jeder Abtastpunkt berührt".
--
-- GESCHÄFTSREGEL (AGENTS.md, Kernregel 16)
--
-- Das ändert, wer veröffentlichen darf. Eine Fahrt über eine
-- Hin-und-zurück-Strecke, die nur eine Richtung abfährt, kam bisher auf
-- 100 % und war öffentlich; sie kommt jetzt auf rund 50 % und bleibt privat.
-- Gespeichert wird sie unverändert — nur die Bestenliste sieht sie nicht mehr.
--
-- BESTAND
--
-- Bestehende Zeilen werden NICHT neu bewertet. enforce_route_completion_
-- coverage() (0052) rechnet nur bei INSERT und bei einem UPDATE, das den
-- Track oder die betroffenen Spalten anfasst. Eine heute öffentliche Fahrt
-- bleibt öffentlich, bis sie ohnehin geschrieben wird. Wer den Bestand
-- nachziehen will, tut das bewusst und getrennt — diese Migration tut es
-- nicht, weil eine stillschweigende Neubewertung fremder, längst geteilter
-- Fahrten die unangenehmere Überraschung wäre.
--
-- Zum Abschätzen der Menge vor einem solchen Schritt:
--
--   select count(*)
--   from public.route_completions rc
--   join public.routes r on r.id = rc.route_id
--   where rc.art = 'strecke'
--     and rc.ist_oeffentlich
--     and rc.track is not null
--     and st_length(rc.track) < st_length(r.geometry) * 0.75;
--
-- GENAUIGKEIT
--
-- Drei bekannte Abweichungen, alle klein gegen den Abstand zwischen dem
-- Schwellenwert (75 %) und dem Fall, um den es geht (rund 50 %):
--
--   * Der gespeicherte Track ist Douglas-Peucker-vereinfacht (0044,
--     Toleranz 5 m) und damit etwas kürzer als die gefahrene Strecke.
--   * Eine Empfangslücke wird als Sehne gemessen statt als Strassenverlauf.
--     Lücken über MAX_JUMP_KM (2 km) lehnt lib/track.ts ohnehin ab.
--   * Die kuratierte Streckengeometrie ist nicht metergenau die gefahrene
--     Strasse.
--
-- Alle drei verkürzen den Track gegenüber der Strecke, wirken also in
-- Richtung "strenger". Deshalb bleibt es beim vollen Verhältnis ohne
-- Sicherheitszuschlag: ein Zuschlag würde genau den Missbrauchsfall wieder
-- aufmachen, und 75 % Schwelle lassen 25 % Luft.
--
-- Die TypeScript-Fassung (lib/routeCoverage.ts) rechnet mit den ROHEN
-- Trailpunkten statt mit dem vereinfachten Track und misst dadurch minimal
-- grosszügiger. Sie ist auch nur die Vorabanzeige im Fazit-Screen und die
-- App-seitige Sperre; massgeblich für die gespeicherte Zahl ist diese
-- Funktion hier, und sie ist die strengere von beiden — die Abweichung geht
-- also in die sichere Richtung (fail closed), dieselbe Arbeitsteilung wie
-- schon in 0052 und 0059.
-- ---------------------------------------------------------------------------

create or replace function public.compute_route_coverage_percent(
  p_route_geometry geography,
  p_track geography
) returns numeric
language sql
stable
set search_path = public, extensions
as $$
  with route as (
    select
      p_route_geometry::geometry as geom,
      -- Explizit auf double precision festgenagelt (ST_Length liefert das
      -- ohnehin): erspart der Fraktionsberechnung unten jede numeric/float8-
      -- Mischarithmetik, deren implizite Cast-Auflösung sonst vom Zufall
      -- der jeweiligen Postgres-Version abhinge.
      ST_Length(p_route_geometry)::double precision as length_m
  ),
  bounded as (
    select
      geom,
      length_m,
      -- >= 1 garantiert (length_m > 0 unten => ceil(...) >= 1), greatest()
      -- nur als explizite zweite Absicherung gegen eine Division durch 0.
      greatest(least(ceil(length_m / 100::double precision)::int, 5000), 1) as sample_count
    from route
    where length_m > 0
  ),
  samples as (
    select
      ST_LineInterpolatePoint(
        bounded.geom,
        n::double precision / bounded.sample_count::double precision
      )::geography as sample_point
    from bounded, generate_series(0, bounded.sample_count) as n
  ),
  -- Zweite, von den Abtastpunkten unabhängige Messung: wie viel der
  -- Streckenlänge der Track zurücklegt. Nach oben offen (ein Umweg gibt über
  -- 100), das least() unten macht daraus ohnehin keinen Vorteil.
  zurueckgelegt as (
    select case
      when p_track is null then 0::numeric
      when (select length_m from route) <= 0 then 100::numeric
      else round(
        100.0 * ST_Length(p_track)::numeric / (select length_m from route)::numeric
      )
    end as prozent
  )
  select case
    when p_track is null or (select count(*) from samples) = 0 then 0
    else least(
      round(
        100.0 * count(*) filter (where ST_DWithin(sample_point, p_track, 80)) / count(*)
      ),
      (select prozent from zurueckgelegt)
    )
  end
  from samples;
$$;

comment on function public.compute_route_coverage_percent(geography, geography) is
  'PostGIS-Portierung von computeRouteCoverage (lib/routeCoverage.ts): das Minimum aus (a) dem Anteil der Streckengeometrie (100m-Schritte), der innerhalb von 80m eines Tracks liegt, und (b) der zurueckgelegten Laenge im Verhaeltnis zur Streckenlaenge. (b) kam mit 0078 dazu und schliesst Audit-Befund A1/3: ohne sie deckt eine nur einfach gefahrene Hin-und-zurueck-Strecke rechnerisch 100% ab. Reiner Anti-Faelschungs-Backstop fuer enforce_route_completion_coverage(), nicht fuer direkten RPC-Aufruf gedacht.';

-- Grants nach create or replace unveraendert wiederholt. Postgres behaelt sie
-- beim Ersetzen zwar bei, aber 0047 und 0048 dieses Verzeichnisses handeln
-- beide davon, dass eine Annahme ueber Grants sich als falsch herausgestellt
-- hat — hier lieber explizit als angenommen. Inhaltlich identisch zu 0052:
-- authenticated braucht EXECUTE, weil die Funktion aus dem SECURITY-INVOKER-
-- Trigger heraus als authenticated laeuft; anon erreicht route_completions
-- ohnehin nie ueber RLS.
revoke execute on function public.compute_route_coverage_percent(geography, geography) from public;
revoke execute on function public.compute_route_coverage_percent(geography, geography) from anon;
grant execute on function public.compute_route_coverage_percent(geography, geography) to authenticated;
