-- =====================================================================
-- Bestenlisten je Fahrzeugtyp: die Stufe zwischen "Alle" und einer
-- einzelnen Motorklasse.
--
-- 0080 hat sechs Klassen eingefuehrt, die im UI als eine flache Reihe
-- nebeneinander standen: A1, A 35 kW, A offen, und drei Auto-Baender. Das
-- sind zwei Welten, die nichts miteinander zu tun haben — motorklasse_hoehere()
-- verweigert den Vergleich ueber Fahrzeugtypen hinweg aus genau dem Grund.
-- Die Auswahl bekommt deshalb zwei Stufen: erst Auto oder Motorrad, dann das
-- Leistungsband darin. Die obere Stufe ist keine blosse Ueberschrift, sondern
-- eine eigene Rangliste ("alle Autos"), und die braucht ein eigenes Aggregat.
--
-- Warum nicht in der App aus leaderboard_klassen_totals summieren: Diese View
-- fuehrt eine Zeile pro Nutzer UND Klasse. Wer einen Golf und einen Porsche
-- faehrt, steht dort zweimal unter 'auto'. Ein Zusammenzaehlen im Client
-- muesste alle Zeilen laden — order/limit liessen sich nicht mehr an die
-- Datenbank abgeben —, und der Fehler faellt erst auf, wenn jemand ein
-- zweites Fahrzeug derselben Welt eintraegt. Dasselbe Argument, mit dem 0080
-- leaderboard_klassen_totals neben leaderboard_user_totals gestellt hat.
--
-- Rein additiv: eine neue immutable Funktion und eine neue View. Keine
-- bestehende View, Tabelle, Policy oder Spalte wird angefasst, es wird nichts
-- zurueckgeschrieben und nichts neu geschrieben. Die Migration ist damit
-- ohne Rehearsal auf einer Stagingdatenbank vertretbar (siehe AGENTS.md,
-- "There is no separate staging database") — sie kann nichts verlieren.
--
-- Mengengeruest: keines noetig. Eine View speichert nichts; es findet kein
-- Tabellen-Rewrite statt wie bei der STORED-Spalte aus 0080.
--
-- REIHENFOLGE: gehoert eingespielt VOR dem Deploy des Codes, der sie liest
-- (lib/leaderboard.ts, topByMetric). Bis dahin liefert die Typstufe leere
-- Listen statt eines Fehlers — PostgREST antwortet auf eine unbekannte
-- Relation mit einem Fehler, den topByMetric zu [] macht. Sichtbar waere das
-- als "Noch keine Eintraege" unter "Autos", waehrend "Alle" und die
-- Klassenlisten normal fuellen.
-- =====================================================================

-- ---------------------------------------------------------------------------
-- 1) Der Fahrzeugtyp einer Motorklasse.
--
--    Die Klassenschluessel tragen ihn schon im Praefix ('moto_a1',
--    'auto_bis110') — motorklasse_hoehere() (0080) vergleicht genau dieses
--    Praefix, um Motorrad- und Autoklassen nicht zu vermischen. Diese
--    Funktion macht daraus den Wert, der in vehicles.typ steht ('motorrad'),
--    damit die View unten mit demselben Vokabular antwortet, das die App
--    ohnehin fuer Fahrzeuge benutzt. Ohne sie muesste die App an der
--    Abfragestelle 'motorrad' in 'moto' uebersetzen — eine Abbildung, die
--    dann in JEDER Abfrage noch einmal richtig sein muesste.
--
--    Gegenstueck in TypeScript: filterTyp()/klassenFuerFilter() in
--    lib/motorklassen.ts, gespeist aus dem Feld `typ` des Klassenkatalogs.
--
--    immutable und search_path gepinnt wie jede Funktion seit 0073 — beides
--    ist Voraussetzung dafuer, dass sie unten im GROUP BY stehen darf.
-- ---------------------------------------------------------------------------
create or replace function public.motorklasse_typ(p_klasse text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case split_part(p_klasse, '_', 1)
    when 'moto' then 'motorrad'
    when 'auto' then 'auto'
    else null
  end;
$$;

comment on function public.motorklasse_typ(text) is
  'Der Fahrzeugtyp einer Motorklasse, im Vokabular von vehicles.typ: moto_* -> motorrad, auto_* -> auto. Gegenstueck: filterTyp() in lib/motorklassen.ts.';

-- ---------------------------------------------------------------------------
-- 2) Das Aggregat pro Nutzer UND Fahrzeugtyp.
--
--    Baut auf leaderboard_completions auf wie leaderboard_klassen_totals
--    (0080) und erbt damit dessen Sichtbarkeitsregeln unveraendert: nur
--    ist_oeffentlich, nur freigegebene oeffentliche Strecken bzw. freie
--    Fahrten, avatar_url bereits mit dem zeigt_avatar-Opt-in verrechnet
--    (0028). Diese View trifft KEINE eigene Datenschutzentscheidung — sie
--    gruppiert nur eine Ebene groeber. Marke und Modell bleiben wie bisher
--    ausserhalb; die Klasse selbst ist nicht an zeigt_fahrzeuge gekoppelt,
--    und dieser Entscheid aus 0080 Abschnitt 7 gilt hier unveraendert
--    weiter: der Fahrzeugtyp ist die Achse, auf der jemand antritt, keine
--    Angabe ueber sein Fahrzeug.
--
--    Der Filter auf motorklasse is not null haelt Fahrten ohne Fahrzeug oder
--    ohne Leistungsangabe heraus — sie zaehlen weiterhin in
--    leaderboard_user_totals ("Alle") mit. "Alle" ist deshalb mehr als Autos
--    plus Motorraeder, und das ist gewollt.
--
--    Laeuft wie leaderboard_completions mit den Rechten des View-Owners,
--    siehe 0013_leaderboard_view.sql.
-- ---------------------------------------------------------------------------
create or replace view public.leaderboard_typ_totals as
select
  user_id,
  public.motorklasse_typ(motorklasse) as fahrzeug_typ,
  display_name,
  avatar_url,
  ist_premium,
  zeigt_premium_badge,
  count(*) as fahrten_count,
  coalesce(sum(hoehenmeter_aufstieg), 0) as hoehenmeter,
  coalesce(sum(effektive_distanz_km), 0) as km,
  count(distinct route_id) as strecken_count
from public.leaderboard_completions
where motorklasse is not null
group by
  user_id,
  public.motorklasse_typ(motorklasse),
  display_name,
  avatar_url,
  ist_premium,
  zeigt_premium_badge;

grant select on public.leaderboard_typ_totals to anon, authenticated;

comment on view public.leaderboard_typ_totals is
  'Pro-Nutzer-und-Fahrzeugtyp-Aggregat von leaderboard_completions fuer die Bestenlisten der oberen Auswahlstufe ("Autos" / "Motorraeder"). Eine Ebene groeber als leaderboard_klassen_totals (0080), eine feiner als leaderboard_user_totals (0054/0056).';

-- =====================================================================
-- Verbleibende Risiken:
--
-- 1. Der Index aus 0080 (route_completions.motorklasse_gewertet) hilft dieser
--    View nicht beim Gruppieren — sie liest leaderboard_completions ohnehin
--    ganz, genau wie leaderboard_klassen_totals es seit 0080 tut. Bei den
--    heutigen Zeilenzahlen (zweistellig) ist das folgenlos; ab einer
--    Groessenordnung, in der es das nicht mehr ist, braucht nicht diese View
--    einen Index, sondern das Aggregat eine materialisierte Form — und das
--    gilt dann fuer alle drei Bestenlisten-Views gemeinsam.
--
-- 2. Die Leistungsangabe bleibt eine Selbstauskunft (0080, Risiko 1). Diese
--    Migration aendert daran nichts: Sie gruppiert, was 0080 eingeordnet hat.
-- =====================================================================
