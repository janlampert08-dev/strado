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
-- der Bestand wird beim Anlegen nicht durchgescannt. Die Altdaten sind
-- damit nicht ausgenommen — sie werden weiter unten direkt korrigiert,
-- weil ein NOT VALID-Constraint auch das UPDATE einer bereits
-- verletzenden Zeile abweist (Begründung unten). Nach der Korrektur
-- verletzt keine Zeile mehr; NOT VALID spart nur den Table-Scan samt
-- Lock beim Einspielen. Das VALIDATE kann jederzeit nachgezogen werden.
--
-- Nach den Korrekturen unten sollte diese Zählung 0 ergeben; sie bleibt
-- als Gegenprobe vor einem späteren VALIDATE CONSTRAINT stehen:
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
-- Berechnung, kein Angriff — sie gehören korrigiert, kein Constraint
-- erschlägt sie.
--
-- Genau deshalb steht die Korrektur hier und nicht in einer späteren
-- Migration: NOT VALID heisst "Bestand wird beim Anlegen nicht
-- geprüft", nicht "Bestand ist ausgenommen". Postgres prüft den
-- Constraint bei jedem INSERT UND jedem UPDATE — auch beim UPDATE einer
-- Zeile, die schon vorher verletzt hat. Eine verletzende Altzeile wäre
-- damit eingefroren, und mit ihr die Kontolöschung: anonymize_account()
-- (0058/0076) fährt ein
--
--   update public.route_completions set track = null, ... where user_id = ...
--
-- über alle Fahrten des Kontos. Eine einzige unplausible Bewegtzeit
-- darin, und die Löschung bricht ab.
--
-- Die Korrektur ist bewusst konservativ und verändert nur, was der
-- Constraint ohnehin nicht mehr durchlässt:
--   * start_ort/region werden auf 120 Zeichen gekürzt (der Wert bleibt
--     lesbar, nur der Überhang fällt weg).
--   * bewegte_zeit_sekunden > dauer_sekunden wird auf dauer_sekunden
--     gedeckelt — die Bewegtzeit ist ein Teil der Gesamtdauer, mehr
--     als 100 % davon ist keine Messung, sondern ein Rechenfehler.
--   * eine negative Bewegtzeit wird null: sie lässt sich nicht in einen
--     plausiblen Wert überführen, und null heisst hier "unbekannt", was
--     der Wahrheit näher kommt als eine gedeckelte Null.
-- Angezeigte Kennzahlen können sich dadurch ändern; betroffen sind nur
-- Zeilen, deren Wert schon vorher nachweislich falsch war.
-- =====================================================================

update public.route_completions
set start_ort = left(start_ort, 120)
where start_ort is not null and char_length(start_ort) > 120;

update public.route_completions
set region = left(region, 120)
where region is not null and char_length(region) > 120;

update public.route_completions
set bewegte_zeit_sekunden = null
where bewegte_zeit_sekunden is not null and bewegte_zeit_sekunden < 0;

update public.route_completions
set bewegte_zeit_sekunden = dauer_sekunden
where bewegte_zeit_sekunden is not null
  and dauer_sekunden is not null
  and bewegte_zeit_sekunden > dauer_sekunden;

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
  'Obergrenze fuer den Ortsbezug einer freien Fahrt. Der Wert erreicht ueber public_fahrten den globalen Feed und damit anon, und INSERT auf dieser Tabelle ist weiterhin gegrantet (A1) — ohne Grenze koennte ein Direktschreiber beliebig grosse Strings in den Feed stellen. NOT VALID spart nur den Table-Scan beim Anlegen; verletzende Altzeilen sind in derselben Migration gekuerzt worden (0074).';

comment on constraint fahrt_region_laenge on public.route_completions is
  'Wie fahrt_start_ort_laenge, fuer die Region der freien Fahrt (0074).';

comment on constraint fahrt_bewegtzeit_plausibel on public.route_completions is
  'Bewegtzeit muss nicht-negativ und hoechstens so gross wie die Gesamtdauer sein — alles andere ist logisch unmoeglich. 0059_fahrtstatistiken begrenzt distanz_km/dauer_sekunden/hoehenmeter_aufstieg, diese Spalte aber nicht. Altzeilen aus dem fehlenden Jitter-Deadband in movingSeconds sind in derselben Migration gedeckelt bzw. genullt worden, bevor der Constraint dazukam — ein NOT VALID-Constraint weist sonst auch das UPDATE einer schon verletzenden Zeile ab und friert sie ein, Kontoloeschung inklusive (0074).';
