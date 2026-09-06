-- ---------------------------------------------------------------------------
-- Fahrtstatistiken serverseitig erzwingen
--
-- 0052 hat die Streckenabdeckung serverseitig abgesichert und dabei bewusst
-- nur art = 'strecke' behandelt. Die eigentlichen Bestenlisten-Werte —
-- distanz_km, dauer_sekunden, hoehenmeter_aufstieg — blieben davon
-- unberührt und werden bis heute ausschliesslich in
-- lib/actions/completions.ts geprüft (MAX_PLAUSIBLE_KMH, publicationBlockReason,
-- Trail-Limits).
--
-- Das reicht nicht: die Policy "Nutzer verwalten eigene Fahrten"
-- (0001_init.sql) schränkt per WITH CHECK ausschliesslich user_id ein, und
-- 0046 hat zwar UPDATE entzogen und spaltenweise neu vergeben, INSERT aber
-- nie. Ein angemeldeter Nutzer kann also direkt gegen PostgREST eine Zeile
-- mit frei erfundenen Werten anlegen und damit dauerhaft an die Spitze von
-- leaderboard_user_totals (0054) gehen — ganz ohne Track. Dieselbe
-- CWE-602-Klasse, die 0052 für die Abdeckung geschlossen hat, nur auf die
-- Zahlenspalten angewendet.
--
-- Ansatz wie in 0052: ein BEFORE-Trigger statt eines Grant-Entzugs. Der
-- Trigger feuert unabhängig vom Insert-Pfad — direkt über PostgREST, aus
-- logTrackedCompletion und aus save_free_ride_with_segments (0050) gleich —
-- und braucht deshalb weder einen Entzug von INSERT noch eine Änderung am
-- Client. Beides wäre für den Kern-Flow der App ein deutlich grösserer
-- Eingriff bei gleichem Sicherheitsgewinn.
--
-- Der Trigger PRÜFT, er RECHNET NICHT NEU: distanz_km stammt aus den
-- Rohpunkten, der gespeicherte track ist die vereinfachte Fassung (0044).
-- lib/track.ts hält ausdrücklich fest, dass die Vereinfachung keine Kennzahl
-- verändern darf — ein Überschreiben aus st_length(track) würde jede Distanz
-- systematisch kürzen. Deshalb ein Plausibilitätsband statt einer Ableitung.
--
-- Der Trigger prüft ausserdem nur, wenn sich eine der drei Statistikspalten
-- tatsächlich ändert (Schritt 0 unten). Andernfalls würde er fremde Updates
-- mit in Sippenhaft nehmen, allen voran die Kontolöschung aus 0058.
--
-- Bewusst NICHT abgedeckt (siehe unten, "Bekannte Restrisiken").
-- ---------------------------------------------------------------------------

create or replace function public.enforce_route_completion_stats()
returns trigger
language plpgsql
set search_path = public, extensions
as $$
declare
  v_track_km numeric;
  v_kmh numeric;
begin
  -- A. Eine freie Fahrt ohne Track kann nichts belegen und darf deshalb nie
  --    öffentlich sein. Gegenstück zu 0052, das für Streckenfahrten genau
  --    dasselbe tut (kein Track -> abdeckung 0, nicht öffentlich); freie
  --    Fahrten fielen dort durch das frühe return bei art <> 'strecke'.
  --
  --    Ohne diese Regel bleibt trotz der Prüfungen unten ein Weg offen: ein
  --    direkter PostgREST-INSERT mit track = null, distanz_km = 2000 und
  --    dauer_sekunden = 36000 trifft exakt 200 km/h, reisst also keine der
  --    Grenzen, und landet als öffentliche freie Fahrt in
  --    leaderboard_completions (seit 0056 zählen freie Fahrten dort mit).
  --
  --    Für die App ändert das nichts: logFreeRide bricht schon vorher mit
  --    "Ungültige Tracking-Daten" ab, wenn sich aus dem Trail keine
  --    Geometrie bauen lässt (lib/actions/completions.ts) — eine echte freie
  --    Fahrt hat also immer einen Track.
  --
  --    Steht bewusst VOR dem frühen return unten: 0046 vergibt UPDATE auf
  --    ist_oeffentlich an authenticated. Ohne diese Reihenfolge liesse sich
  --    die Regel mit "erst privat einfügen, dann öffentlich schalten"
  --    umgehen, weil dabei keine Statistikspalte anfasst wird.
  --
  --    Setzt still auf privat statt zu werfen — dieselbe fail-closed-Linie
  --    wie 0052, damit ein Grenzfall eine Fahrt nie unspeicherbar macht.
  if new.art = 'frei' and new.track is null and new.ist_oeffentlich then
    new.ist_oeffentlich := false;
  end if;

  -- 0. Bei einem UPDATE, das keine der drei Statistikspalten anfasst, gibt es
  --    nichts zu prüfen — unverändert durchlassen. Dieselbe Disziplin wie in
  --    0052 (dort Fall 4).
  --
  --    Das ist nicht bloss Sparsamkeit, sondern notwendig: 0058
  --    (anonymize_own_account) setzt bei der Kontolöschung track = null und
  --    ist_oeffentlich, rührt distanz_km/dauer_sekunden/hoehenmeter_aufstieg
  --    aber nicht an. Liefe die Plausibilitätsprüfung auch dort, würde eine
  --    einzige Altzeile mit unplausiblen Werten (angelegt, bevor es diese
  --    Prüfung gab) die ganze Löschung mit einer Exception abbrechen — das
  --    Konto liesse sich nicht mehr löschen. Gleiches gilt für die
  --    Sichtbarkeits- und Notiz-Updates aus 0046.
  --
  --    track selbst braucht hier keinen Vergleich: 0046 hat UPDATE auf
  --    route_completions entzogen und nur ist_oeffentlich, notiz und
  --    track_oeffentlich neu vergeben. Die Geometrie kann ein Nutzer also
  --    ohnehin nicht direkt ändern.
  if tg_op = 'UPDATE'
     and new.distanz_km is not distinct from old.distanz_km
     and new.dauer_sekunden is not distinct from old.dauer_sekunden
     and new.hoehenmeter_aufstieg is not distinct from old.hoehenmeter_aufstieg then
    return new;
  end if;

  -- 1. Grob unmögliche Werte hart ablehnen. Der App-Pfad prüft das bereits
  --    (implausibilityReason/MAX_PLAUSIBLE_KMH in lib/actions/completions.ts)
  --    und gibt eine freundliche Meldung aus, bevor es hierher kommt — für
  --    eine echte Fahrt darf keine dieser Exceptions je feuern. Sie sind der
  --    Backstop für den direkten PostgREST-Weg.
  if new.distanz_km is not null and new.distanz_km < 0 then
    raise exception 'invalid_distance';
  end if;

  if new.dauer_sekunden is not null and new.dauer_sekunden <= 0 then
    raise exception 'invalid_duration';
  end if;

  if new.hoehenmeter_aufstieg is not null and new.hoehenmeter_aufstieg < 0 then
    raise exception 'invalid_elevation';
  end if;

  -- 2. Distanz gegen die gespeicherte Geometrie PRÜFEN, nicht überschreiben.
  --
  --    Wichtig: track ist bewusst die Douglas-Peucker-vereinfachte Fassung
  --    (0044, lib/track.ts, Toleranz 5 m), während distanz_km aus den
  --    ROHPUNKTEN stammt (computeTrailStats, lib/geo.ts). lib/track.ts hält
  --    ausdrücklich fest, dass die Vereinfachung keine Kennzahl verändern
  --    darf. Ein Überschreiben von distanz_km mit st_length(track) würde
  --    genau diese Zusage brechen und jede Distanz systematisch kürzen —
  --    deshalb hier nur ein Plausibilitätsband statt einer Ableitung.
  --
  --    Das Band ist absichtlich weit: Vereinfachung verkürzt die Geometrie,
  --    GPS-Rauschen verlängert dagegen die Rohsumme (Jitter im Stand). Die
  --    Untergrenze ist die harte Richtung — die Rohsumme kann kaum unter der
  --    vereinfachten Länge liegen. Die Obergrenze fängt nur den groben
  --    Missbrauch ab ("kurzer Track, riesige Distanz").
  if new.track is not null and new.distanz_km is not null then
    v_track_km := (st_length(new.track) / 1000.0)::numeric;
    if new.distanz_km < v_track_km * 0.9 or new.distanz_km > v_track_km * 3 + 1 then
      raise exception 'distance_track_mismatch';
    end if;
  end if;

  -- 3. Dieselbe Plausibilitätsgrenze wie MAX_PLAUSIBLE_KMH in
  --    lib/actions/completions.ts. Fängt den Fall "echter Track, aber
  --    Zeitstempel gestaucht" ab, solange er diese Schwelle reisst.
  if new.distanz_km is not null and new.dauer_sekunden is not null and new.dauer_sekunden > 0 then
    v_kmh := new.distanz_km / (new.dauer_sekunden / 3600.0);
    if v_kmh > 200 then
      raise exception 'implausible_speed';
    end if;
  end if;

  return new;
end;
$$;

comment on function public.enforce_route_completion_stats() is
  'Lehnt unmögliche Statistikwerte ab und prüft distanz_km gegen die gespeicherte Geometrie — unabhängig vom Insert-/Update-Pfad. CWE-602-Backstop für die Bestenlisten-Spalten, Gegenstück zu enforce_route_completion_coverage() (0052).';

-- Reine Trigger-Funktion: feuert unabhängig von EXECUTE-Rechten (siehe 0047,
-- Abschnitt A) — der Entzug schliesst nur den unnötigen direkten RPC-Weg.
revoke execute on function public.enforce_route_completion_stats() from public;
revoke execute on function public.enforce_route_completion_stats() from anon, authenticated;

-- Feuert vor route_completions_recompute_coverage (0052): BEFORE-Trigger
-- laufen in alphabetischer Reihenfolge, "enforce" < "recompute". Die beiden
-- fassen disjunkte Spalten an, die Reihenfolge ist also unkritisch —
-- festgehalten nur, damit sie beim nächsten Trigger nicht geraten werden muss.
drop trigger if exists route_completions_enforce_stats on public.route_completions;
create trigger route_completions_enforce_stats
  before insert or update on public.route_completions
  for each row
  execute function public.enforce_route_completion_stats();

-- ---------------------------------------------------------------------------
-- Deklarative Obergrenzen als zweite, vom Trigger unabhängige Schicht.
--
-- NOT VALID: die Constraints gelten ab sofort für jede neue und jede
-- geänderte Zeile, der Bestand wird aber nicht geprüft. Das ist hier
-- Absicht — ob die Produktionsdaten sie erfüllen, lässt sich aus dem
-- Migrationsverzeichnis nicht beantworten, und eine fehlschlagende
-- Migration wäre der schlechtere Ausgang. Nach einer Sichtprüfung
-- (select count(*) ... where not (<Bedingung>)) kann jede einzeln per
--   alter table public.route_completions validate constraint <name>;
-- in einer eigenen Migration nachgezogen werden.
--
-- Grenzen bewusst grosszügig: sie sollen Unsinn abfangen, nicht eine
-- aussergewöhnlich lange Alpentour.
-- ---------------------------------------------------------------------------
alter table public.route_completions
  add constraint fahrt_distanz_plausibel
    check (distanz_km is null or (distanz_km >= 0 and distanz_km <= 2000)) not valid,
  add constraint fahrt_dauer_plausibel
    check (dauer_sekunden is null or (dauer_sekunden > 0 and dauer_sekunden <= 86400)) not valid,
  add constraint fahrt_hoehenmeter_plausibel
    check (hoehenmeter_aufstieg is null or (hoehenmeter_aufstieg >= 0 and hoehenmeter_aufstieg <= 30000)) not valid,
  add constraint fahrt_tempo_plausibel
    check (
      distanz_km is null
      or dauer_sekunden is null
      or dauer_sekunden <= 0
      or distanz_km * 3600 <= 200 * dauer_sekunden
    ) not valid;

-- ---------------------------------------------------------------------------
-- Bekannte Restrisiken (bewusst offen gelassen, nicht übersehen)
--
-- 1. dauer_sekunden bleibt clientseitig. Sie stammt aus Browser-Zeitstempeln
--    (last.t - first.t, lib/geo.ts) und lässt sich nicht aus der Geometrie
--    ableiten — im Track stecken keine Zeiten. Wer die Deltas staucht, ohne
--    die 200-km/h-Grenze zu reissen, kommt weiterhin durch. Dagegen hilft nur
--    eine serverseitig gestartete Fahrt (Startzeitpunkt in der DB), also eine
--    Produktänderung, keine Migration.
--
-- 2. Ein INSERT ohne Track umgeht das Distanzband komplett — es gibt dann
--    keine Geometrie, gegen die geprüft werden könnte. Übrig bleiben die
--    absoluten Obergrenzen unten. Öffentlich werden kann eine solche Zeile
--    aber nicht mehr: für art = 'strecke' verhindert das 0052 (kein Track
--    -> abdeckung 0, nicht öffentlich), für art = 'frei' Schritt A oben.
--    Sie bleibt also als private Zeile anlegbar und zählt nirgends mit.
--
-- 3. Ein frei gezeichneter, plausibler Track bleibt möglich. Das ist
--    dasselbe Restrisiko, das 0052 für die Abdeckung schon benennt.
-- ---------------------------------------------------------------------------
