-- =====================================================================
-- routes: laenge_km, start_coord und ziel_coord serverseitig aus der
-- Geometrie ableiten.
--
-- Befund N4 aus docs/audit/2026-09-07-followup.md.
--
-- Ausgangslage: routes ist die einzige Kerntabelle ohne Grant-Härtung
-- (grep über alle Migrationen nach "revoke.*routes": 0 Treffer). Die
-- Tabellen-Grants stehen damit auf Supabases Default, authenticated
-- darf also über PostgREST spaltenunbeschränkt INSERTen und UPDATEn.
--
-- 0033 A leitet laenge_km aus ST_Length() ab — aber nur innerhalb von
-- propose_route_full. Ein direkter POST/PATCH auf /rest/v1/routes setzt
-- laenge_km, geometry, start_coord, ziel_coord und hoehe_m frei, und
-- laenge_km fliesst über coalesce(rc.distanz_km, r.laenge_km) in die
-- Kilometer-Bestenliste.
--
-- ---------------------------------------------------------------------
-- Warum hier NICHT das naheliegende REVOKE steht
-- ---------------------------------------------------------------------
-- Der Audit-Bericht schlug ursprünglich "revoke insert, update on
-- public.routes from anon, authenticated" plus enge Spalten-Grants vor.
-- Das hätte den Streckenvorschlag gebrochen:
--
--   propose_route_full ist SECURITY INVOKER, nicht DEFINER
--   (0027_security_performance_hardening.sql:30 sagt das ausdrücklich).
--
-- Die Funktion INSERTet also mit den Rechten des Aufrufers. Ein REVOKE
-- INSERT trifft sie damit genauso wie den Direktweg, und
-- Spalten-Grants, die laenge_km/start_coord/ziel_coord ausschliessen,
-- ebenso — die Funktion schreibt genau diese Spalten.
--
-- Dieselbe Klasse Falle wie beim Kontolöschungs-RPC: der legitime und
-- der illegitime Pfad hängen am selben Recht.
--
-- Ein BEFORE-Trigger löst das ohne jede Rechteänderung: Er überschreibt
-- die abgeleiteten Werte bei JEDEM Schreibvorgang mit dem, was aus der
-- Geometrie folgt. Für propose_route_full ist er ein No-op — die
-- Funktion rechnet bereits dasselbe. Für den Direktweg ist er die
-- Schranke. Der Angriff (frei gewähltes laenge_km in der Bestenliste)
-- ist damit zu, ohne dass ein Grant angefasst wird.
--
-- Was das NICHT abdeckt, bewusst: Wer eine eigene, noch nicht
-- freigegebene Strecke besitzt, darf ihre geometry weiterhin ändern —
-- die UPDATE-Policy aus 0001:112 erlaubt das für status_ok = false, und
-- laenge_km folgt dann eben der neuen Geometrie. Das bleibt in sich
-- stimmig; gefälscht werden kann die Kennzahl nicht mehr.
--
-- Risiko: niedrig. Kein Grant, keine Policy, keine Spalte ändert sich.
-- Der Trigger ist deterministisch und idempotent. Bestandszeilen
-- bleiben unberührt — er greift erst beim nächsten Schreiben. Ob
-- Altbestände von laenge_km abweichen, lässt sich vor dem Einspielen
-- prüfen:
--
--   select id, name, laenge_km,
--          round((st_length(geometry) / 1000.0)::numeric, 3) as abgeleitet
--     from public.routes
--    where abs(laenge_km - st_length(geometry) / 1000.0) > 0.05;
--
-- Treffer wären Strecken, deren gespeicherte Länge nicht zu ihrer
-- Geometrie passt. Diese Migration korrigiert sie NICHT — ein
-- stillschweigendes Umschreiben bestehender Bestenlisten-Werte wäre
-- eine Datenänderung, die eine eigene Entscheidung verdient.
-- =====================================================================

create or replace function public.routes_kennzahlen_ableiten()
returns trigger
language plpgsql
-- extensions im Pfad, weil ST_Length/ST_StartPoint/ST_EndPoint dort
-- liegen (PostGIS wird auf Supabase nach extensions installiert).
set search_path = public, extensions, pg_temp
as $$
declare
  v_geom geometry;
begin
  -- geometry ist NOT NULL (0001), der Guard ist trotzdem da: ein
  -- künftiges ALTER könnte das lockern, und ein Trigger, der dann mit
  -- einer NULL-Geometrie rechnet, würde die Zeile mit NULL-Kennzahlen
  -- durchlassen statt sie abzuweisen.
  if new.geometry is null then
    raise exception 'routes.geometry darf nicht NULL sein';
  end if;

  v_geom := new.geometry::geometry;

  new.laenge_km := st_length(new.geometry) / 1000.0;
  new.start_coord := st_startpoint(v_geom)::geography;
  new.ziel_coord := st_endpoint(v_geom)::geography;

  return new;
end;
$$;

comment on function public.routes_kennzahlen_ableiten() is
  'Leitet laenge_km, start_coord und ziel_coord bei jedem INSERT/UPDATE aus routes.geometry ab und ueberschreibt mitgeschickte Werte. Schliesst den Direktweg ueber PostgREST, ohne Grants anzufassen — propose_route_full ist SECURITY INVOKER (0027), ein REVOKE INSERT haette den legitimen Vorschlagspfad mitgebrochen. Siehe 0072.';

drop trigger if exists routes_kennzahlen_ableiten_trg on public.routes;

create trigger routes_kennzahlen_ableiten_trg
  before insert or update of geometry, laenge_km, start_coord, ziel_coord
  on public.routes
  for each row
  execute function public.routes_kennzahlen_ableiten();

-- Der Trigger feuert bewusst nur, wenn eine der vier Spalten im UPDATE
-- vorkommt. updateRoute (lib/actions/routes.ts:342) schreibt nur
-- name/region/start_ort/ziel_ort/charakter_text/kategorien und
-- publishPrivateRoute nur ist_privat — beide lösen ihn also gar nicht
-- erst aus und zahlen keine Geometrie-Rechnung.
--
-- Bei INSERT feuert er immer — die "of"-Spaltenliste gilt in Postgres
-- ausschliesslich für UPDATE. Das ist auch nötig, weil sonst ein
-- INSERT, das die Kennzahlen einfach weglässt, sie ungeprüft auf NULL
-- liesse.
--
-- Nebeneffekt, der hier erwünscht ist: BEFORE-ROW-Trigger laufen vor
-- der Constraint-Prüfung. Ein INSERT ohne laenge_km scheitert deshalb
-- NICHT am NOT NULL — der Trigger hat den Wert bis dahin gesetzt. Ein
-- Client kann die Kennzahlen also weglassen; er kann sie nur nicht
-- mehr bestimmen.
