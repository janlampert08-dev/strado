-- =====================================================================
-- route_completions: Textspalten und Bewegtzeit der freien Fahrt
-- begrenzen.
--
-- Befund aus docs/audit/2026-09-07-followup.md, Abschnitt Datenbank.
--
-- 0044 hat für die freie Fahrt titel auf 80 Zeichen begrenzt, 0020
-- notiz auf 280 — start_ort, region und bewegte_zeit_sekunden blieben
-- unbegrenzt. Alle drei erreichen über public_fahrten den globalen
-- Feed und damit anon.
--
-- Relevant ist das, weil INSERT auf route_completions weiterhin
-- gegrantet ist (Audit-Befund A1, offen): Ein Direktschreiber über
-- PostgREST umgeht lib/actions/completions.ts vollständig und kann
-- beliebig grosse Strings in den Feed stellen.
--
-- bewegte_zeit_sekunden ist der zweite Fall: 0059_fahrtstatistiken…
-- begrenzt distanz_km, dauer_sekunden und hoehenmeter_aufstieg, die
-- Bewegtzeit aber nicht — obwohl sie auf der Fahrtseite gerendert wird
-- und bewegte_zeit_sekunden > dauer_sekunden logisch unmöglich ist.
--
-- Die Grenzen sind absichtlich grosszügig: Sie sollen Missbrauch
-- kappen, nicht echte Eingaben. 120 Zeichen decken jeden Schweizer
-- Ortsnamen samt Zusatz ab; die Anwendung selbst schreibt hier nur
-- reverse-geokodierte Werte.
--
-- NOT VALID: Die Constraints gelten ab sofort für jeden Schreibvorgang,
-- Bestandszeilen werden nicht geprüft. Das ist hier kein Verzicht,
-- sondern Absicht — ein VALIDATE würde die Migration an genau den
-- Altdaten scheitern lassen, die es zu finden gilt, und die
-- Kontolöschung (die dieselben Zeilen anfasst) gleich mit blockieren.
--
-- Vor einem späteren VALIDATE CONSTRAINT zählen:
--
--   select count(*) from public.route_completions
--    where char_length(start_ort) > 120
--       or char_length(region) > 120
--       or bewegte_zeit_sekunden < 0
--       or (dauer_sekunden is not null
--           and bewegte_zeit_sekunden > dauer_sekunden);
--
-- Der letzte Teil dürfte Treffer liefern: movingSeconds hat laut
-- Audit vom 2026-09-06 (§B, offen) kein Jitter-Deadband, während
-- computeTrailStats eines hat. Solche Zeilen sind Altlast der
-- Berechnung, kein Angriff — sie gehören korrigiert, bevor validiert
-- wird, nicht per Constraint erschlagen.
-- =====================================================================

alter table public.route_completions
  add constraint fahrt_start_ort_laenge
    check (start_ort is null or char_length(start_ort) <= 120) not valid,

  add constraint fahrt_region_laenge
    check (region is null or char_length(region) <= 120) not valid,

  add constraint fahrt_bewegtzeit_plausibel
    check (
      bewegte_zeit_sekunden is null
      or (
        bewegte_zeit_sekunden >= 0
        and (dauer_sekunden is null or bewegte_zeit_sekunden <= dauer_sekunden)
      )
    ) not valid;

comment on constraint fahrt_start_ort_laenge on public.route_completions is
  'Obergrenze fuer den Ortsbezug einer freien Fahrt. Der Wert erreicht ueber public_fahrten den globalen Feed und damit anon, und INSERT auf dieser Tabelle ist weiterhin gegrantet (A1) — ohne Grenze koennte ein Direktschreiber beliebig grosse Strings in den Feed stellen. NOT VALID: gilt fuer neue Schreibvorgaenge, Bestand ungeprueft (0074).';

comment on constraint fahrt_region_laenge on public.route_completions is
  'Wie fahrt_start_ort_laenge, fuer die Region der freien Fahrt (0074).';

comment on constraint fahrt_bewegtzeit_plausibel on public.route_completions is
  'Bewegtzeit muss nicht-negativ und hoechstens so gross wie die Gesamtdauer sein — alles andere ist logisch unmoeglich. 0059_fahrtstatistiken begrenzt distanz_km/dauer_sekunden/hoehenmeter_aufstieg, diese Spalte aber nicht. NOT VALID, weil Altzeilen aus dem fehlenden Jitter-Deadband in movingSeconds die Bedingung verletzen duerften (0074).';
