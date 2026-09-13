-- =====================================================================
-- Motorklasse fuer bestehende FREIE Fahrten nachtragen.
--
-- 0080 hat route_completions.motorklasse eingefuehrt und laesst sie von
-- einem BEFORE-Trigger aus dem referenzierten Fahrzeug ableiten. Der Trigger
-- greift nur beim Schreiben — alle Fahrten, die vor 0080 entstanden sind,
-- tragen deshalb keine Klasse und erscheinen in keiner Klassenliste.
--
-- Ein UPDATE loest den Trigger aus, ohne selbst einen Wert setzen zu
-- muessen: set_motorklasse() ueberschreibt new.motorklasse bedingungslos aus
-- dem Fahrzeug. "set motorklasse = motorklasse" ist hier also kein
-- Schreibvorgang, sondern nur der Anlass.
--
-- ---------------------------------------------------------------------
-- WARUM NUR FREIE FAHRTEN — und warum Streckenfahrten AUSDRUECKLICH NICHT
-- ---------------------------------------------------------------------
--
-- Auf route_completions liegt seit 0052 der Trigger
-- route_completions_recompute_coverage, und der feuert BEFORE INSERT OR
-- UPDATE. Fuer art = 'strecke' rechnet er bei JEDEM Update den
-- Deckungsgrad aus der gespeicherten Geometrie neu und setzt anschliessend
--
--     new.ist_oeffentlich := new.ist_oeffentlich and v_coverage >= 75;
--
-- Seit 0078 ist die Deckungsgradformel eine andere als zu dem Zeitpunkt,
-- als die Bestandsfahrten geschrieben wurden: sie nimmt jetzt das Minimum
-- aus Beruehrungsanteil und tatsaechlich zurueckgelegter Laenge. Eine
-- Hin-und-zurueck-Strecke, die einst 100 % erreichte, misst heute 50 %.
--
-- Ein Backfill ueber Streckenfahrten wuerde diese Neubewertung also fuer
-- jede einzelne Bestandsfahrt ausloesen — und dabei oeffentliche Fahrten
-- still auf privat setzen. Das waere eine Geschaeftsregelaenderung als
-- Nebenwirkung einer Klassen-Migration (Kernregel 16) und ein Verlust an
-- Sichtbarkeit, den kein Nutzer veranlasst hat. docs/audit/README.md haelt
-- zu 0078 ausdruecklich fest: "Existing rows are not re-scored; the trigger
-- only runs on write." Das bleibt so.
--
-- Streckenfahrten bekommen ihre Klasse deshalb erst, wenn sie das naechste
-- Mal regulaer geschrieben werden. Wer sie frueher will, braucht zuerst
-- eine bewusste Entscheidung ueber die Neubewertung des Deckungsgrads —
-- das ist ein eigenes Vorhaben, keine Zeile in dieser Migration.
--
-- Fuer freie Fahrten ist der Weg frei: enforce_route_completion_coverage()
-- kehrt fuer art <> 'strecke' sofort zurueck, und
-- enforce_route_completion_stats() (0059) kehrt bei unveraenderten
-- Kennzahlen ebenfalls sofort zurueck. Der Cooldown-Trigger aus 0024 haengt
-- nur an INSERT.
--
-- ---------------------------------------------------------------------
-- MENGENGERUEST — vor dem Einspielen zaehlen
-- ---------------------------------------------------------------------
--
--   -- Wie viele Zeilen diese Migration anfasst:
--   select count(*) from public.route_completions
--    where art = 'frei' and fahrzeug_id is not null and motorklasse is null;
--
--   -- Wie viele davon ueberhaupt eine Klasse bekommen koennen
--   -- (nur Fahrzeuge mit Leistungsangabe):
--   select count(*) from public.route_completions rc
--     join public.vehicles v on v.id = rc.fahrzeug_id
--    where rc.art = 'frei' and rc.motorklasse is null and v.leistung_kw is not null;
--
-- Die zweite Zahl ist die erwartete Wirkung. Ist sie 0, ist diese Migration
-- ein No-op — der Normalfall unmittelbar nach 0080, weil dann noch niemand
-- eine Leistung eingetragen hat. Sie ist bewusst so gebaut, dass sie
-- spaeter gefahrlos ein zweites Mal laufen kann (siehe unten).
-- =====================================================================

do $$
declare
  v_id uuid;
  v_gesetzt int := 0;
  v_uebersprungen int := 0;
  v_ohne_leistung int := 0;
begin
  -- Fahrten an Fahrzeugen ohne Leistungsangabe: zaehlen, aber NICHT
  -- anfassen. public.motorklasse() gibt fuer p_kw is null immer null zurueck
  -- (0080, erste when-Zeile), ein UPDATE wuerde die Zeile also schreiben,
  -- ohne dass eine Klasse entstehen kann.
  --
  -- Beides ist wichtig. Nicht schreiben: jede angefasste Zeile ist Risiko
  -- (drei BEFORE-Trigger feuern mit), und eine Zeile anzufassen, die sich
  -- nachweislich nicht aendern kann, ist reines Risiko ohne Gegenwert.
  -- Trotzdem zaehlen: die Notice unten ist das Deploy-Protokoll, und "wie
  -- viele Fahrten haben eine Klasse bekommen" ist eine andere Frage als "wie
  -- viele Zeilen wurden geschrieben". Eine fruehere Fassung zaehlte diese
  -- Fahrten als "gesetzt" und meldete damit eine Wirkung, die es nicht gab —
  -- gefunden hat das die CodeRabbit-Review zu PR 4.
  select count(*)
    into v_ohne_leistung
    from public.route_completions rc
    join public.vehicles v on v.id = rc.fahrzeug_id
   where rc.art = 'frei'
     and rc.motorklasse is null
     and v.leistung_kw is null;

  for v_id in
    -- Der Join traegt die Bedingung "fahrzeug_id is not null" schon; er ist
    -- sicher, weil fahrzeug_id `on delete set null` ist und ein geloeschtes
    -- Fahrzeug die Spalte deshalb leert, statt eine tote Referenz zu lassen.
    select rc.id
      from public.route_completions rc
      join public.vehicles v on v.id = rc.fahrzeug_id
     where rc.art = 'frei'
       -- Idempotent: bereits klassifizierte Fahrten bleiben unberuehrt, ein
       -- zweiter Lauf findet nur noch das, was beim ersten uebrig blieb.
       and rc.motorklasse is null
       -- Ohne Leistungsangabe entsteht keine Klasse (siehe oben). Mit ihr
       -- entsteht immer eine: vehicles.typ ist seit 0001 auf 'auto' und
       -- 'motorrad' eingeschraenkt, und fuer beide liefert
       -- public.motorklasse() einen Wert. v_gesetzt zaehlt damit genau die
       -- Fahrten, die tatsaechlich eine Klasse tragen.
       and v.leistung_kw is not null
  loop
    begin
      update public.route_completions
         set motorklasse = motorklasse
       where id = v_id;
      v_gesetzt := v_gesetzt + 1;
    exception
      -- set_motorklasse() lehnt ein fuer die Klasse unmoegliches
      -- Durchschnittstempo ab (0080). Eine Bestandsfahrt, die das reisst,
      -- soll den ganzen Backfill nicht zu Fall bringen: sie bleibt einfach
      -- ohne Klasse und damit ausserhalb der Klassenlisten — genau der
      -- Zustand, den sie vorher schon hatte.
      when others then
        v_uebersprungen := v_uebersprungen + 1;
    end;
  end loop;

  raise notice 'Motorklasse nachgetragen: % Fahrten gesetzt, % uebersprungen (Tempo-Deckel), % unberuehrt (Fahrzeug ohne Leistungsangabe).',
    v_gesetzt, v_uebersprungen, v_ohne_leistung;
end;
$$;

-- =====================================================================
-- Was diese Migration NICHT tut, ausdruecklich benannt:
--
-- 1. Sie fuellt motorklasse_belegt nicht. Die Belegpruefung
--    (lib/klassenbeleg.ts) braucht den rohen Trail MIT Zeitstempeln; die
--    Datenbank speichert nur die vereinfachte Geometrie ohne (0044). Eine
--    rueckwirkende Belegpruefung ist damit unmoeglich, nicht bloss
--    aufwendig. Backfill-Fahrten tragen also allein die deklarierte Klasse.
--
-- 2. Sie ruehrt Streckenfahrten nicht an (Begruendung oben).
--
-- 3. Sie korrigiert nichts an Fahrzeugen. Wer keine Leistung eingetragen
--    hat, bleibt ohne Klasse — die Angabe ist freiwillig. Diese Fahrten
--    werden gar nicht erst geschrieben und erscheinen in der Notice als
--    dritte Zahl.
-- =====================================================================
