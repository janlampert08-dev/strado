-- =====================================================================
-- Motorklassen: Ranglisten, die einen 125er-Roller nicht mehr gegen einen
-- Porsche antreten lassen.
--
-- vehicles.typ kennt bisher nur 'auto' und 'motorrad' (0001) — damit sind
-- ein Roller und eine Ducati dieselbe Kategorie, ein Golf und ein 911
-- ebenfalls. Diese Migration ergaenzt die zwei Angaben, aus denen sich eine
-- brauchbare Klasse ableiten laesst (Hubraum, Leistung), und verankert die
-- abgeleitete Klasse an der FAHRT statt am Fahrzeug.
--
-- Warum an der Fahrt und nicht per Join aufs Fahrzeug:
--   a) fahrzeug_id ist "on delete set null" (0001) — wer sein Fahrzeug
--      loescht, verloere sonst die Klasse aller seiner Fahrten.
--   b) Wer nachtraeglich "11 kW" ins Fahrzeug schreibt, spazierte sonst mit
--      seinen Porsche-Zeiten in die A1-Liste.
--
-- Diese Migration aendert KEINE Rangliste sichtbar: sie legt die Spalten an,
-- fuellt sie fuer neue Fahrten und haengt sie an die Views. Gefiltert wird
-- erst in einem spaeteren Schritt. Der Bestand bleibt ohne Klasse (null) und
-- zaehlt weiterhin in "Alle" — ein Backfill waere hier wirkungslos, weil zu
-- diesem Zeitpunkt noch niemand eine Leistung eingetragen hat.
--
-- Mengengeruest: Die Zeilenzahlen wurden NICHT erhoben — diese Migration
-- entsteht ohne Datenbankzugriff. Vor dem Einspielen zaehlen:
--
--   select count(*) from public.route_completions;
--   select count(*) from public.vehicles;
--
-- Die erste Zahl ist relevant, weil eine STORED generated column (Abschnitt
-- 4) die Tabelle einmal neu schreibt.
-- =====================================================================

-- ---------------------------------------------------------------------------
-- 1) Fahrzeugmerkmale. Beide optional — die Angabe ist freiwillig, ein
--    Fahrzeug ohne sie bleibt ohne Klasse und zaehlt weiter in "Alle".
--
--    Einheit kW, nicht PS: so steht es im Fahrzeugausweis. Die Anzeige
--    rechnet fuer Autos in PS um (lib/motorklassen.ts), gespeichert wird der
--    Wert, den der Nutzer ablesen kann.
-- ---------------------------------------------------------------------------
alter table public.vehicles
  add column hubraum_ccm int,
  add column leistung_kw numeric(6,2);

alter table public.vehicles
  add constraint vehicles_hubraum_ccm_check
    check (hubraum_ccm is null or (hubraum_ccm > 0 and hubraum_ccm <= 10000)),
  add constraint vehicles_leistung_kw_check
    check (leistung_kw is null or (leistung_kw > 0 and leistung_kw <= 2000));

comment on column public.vehicles.hubraum_ccm is
  'Hubraum in cm3, optional. Nur fuer die Abgrenzung der Motorradklasse A1 noetig (bis 125 cm3 UND bis 11 kW); Elektro-Motorraeder tragen hier null.';
comment on column public.vehicles.leistung_kw is
  'Nennleistung in kW wie im Fahrzeugausweis, optional. Ohne diesen Wert gibt es keine Motorklasse.';

-- ---------------------------------------------------------------------------
-- 2) Die Klassenformel. Rein und immutable, damit sie in einer generierten
--    Spalte (Abschnitt 4) verwendet werden darf. search_path gepinnt wie
--    seit 0073 fuer jede Funktion in diesem Schema.
--
--    Motorraeder folgen den Fuehrerausweiskategorien, weil jeder Fahrer sie
--    auswendig kennt. Autos bekommen kW-Baender: fuer sie gibt es keine
--    vergleichbare gesetzliche Einteilung.
--
--    coalesce(p_ccm, 0) ist Absicht: Ein E-Motorrad hat keinen Hubraum, und
--    mit 11 kW gehoert es sachlich nach A1. Ohne das coalesce fiele es
--    stattdessen nach A 35 kW.
--
--    Das Gegenstueck in TypeScript ist lib/motorklassen.ts. Die Grenzwerte
--    (11 / 125 / 35 / 110 / 220) stehen bewusst an beiden Stellen als
--    Tabelle; lib/motorklassen.test.ts prueft genau diese Werte.
-- ---------------------------------------------------------------------------
create or replace function public.motorklasse(p_typ text, p_ccm int, p_kw numeric)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_kw is null then null
    when p_typ = 'motorrad' then case
      when p_kw <= 11 and coalesce(p_ccm, 0) <= 125 then 'moto_a1'
      when p_kw <= 35 then 'moto_a35'
      else 'moto_a'
    end
    when p_typ = 'auto' then case
      when p_kw <= 110 then 'auto_bis110'
      when p_kw <= 220 then 'auto_bis220'
      else 'auto_ueber220'
    end
    else null
  end;
$$;

comment on function public.motorklasse(text, int, numeric) is
  'Leitet die Motorklasse aus Fahrzeugtyp, Hubraum und Leistung ab. Motorrad: A1 (bis 125 cm3 und 11 kW) / A 35 kW / A offen. Auto: bis 110 kW / bis 220 kW / darueber. Gegenstueck: lib/motorklassen.ts.';

-- Rang innerhalb EINES Fahrzeugtyps. Bewusst kein typuebergreifender Rang:
-- ein Motorrad wird nie in eine Autoklasse hochgestuft und umgekehrt.
create or replace function public.motorklasse_rang(p_klasse text)
returns int
language sql
immutable
set search_path = ''
as $$
  select case p_klasse
    when 'moto_a1'       then 1
    when 'moto_a35'      then 2
    when 'moto_a'        then 3
    when 'auto_bis110'   then 1
    when 'auto_bis220'   then 2
    when 'auto_ueber220' then 3
    else null
  end;
$$;

-- Die hoehere zweier Klassen. Grundlage fuer motorklasse_gewertet: gewertet
-- wird nie die kleinere der beiden.
--
-- Verschiedene Fahrzeugtypen sind nicht vergleichbar (Praefix vor dem ersten
-- '_'); dann gewinnt die deklarierte Klasse. Das ist der Schutz dagegen, dass
-- ein frei geschriebener Belegwert eine Fahrt in eine voellig andere
-- Fahrzeugwelt schiebt.
create or replace function public.motorklasse_hoehere(p_a text, p_b text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_a is null then p_b
    when p_b is null then p_a
    when split_part(p_a, '_', 1) is distinct from split_part(p_b, '_', 1) then p_a
    when coalesce(public.motorklasse_rang(p_b), 0) > coalesce(public.motorklasse_rang(p_a), 0) then p_b
    else p_a
  end;
$$;

comment on function public.motorklasse_hoehere(text, text) is
  'Die hoehere zweier Motorklassen desselben Fahrzeugtyps. Bei unterschiedlichen Typen gewinnt die erste (die deklarierte).';

-- ---------------------------------------------------------------------------
-- 3) Die Klasse an der Fahrt.
--
--    motorklasse         — deklariert, ausschliesslich vom Trigger gesetzt.
--    motorklasse_belegt  — aus dem GPS-Track abgeleitet, wird von
--                          lib/actions/completions.ts geschrieben (folgt in
--                          einem eigenen Schritt; bis dahin immer null).
--    motorklasse_gewertet— die hoehere von beiden. GENERATED ALWAYS: kein
--                          Client kann sie schreiben, PostgreSQL weist jeden
--                          INSERT ab, der sie mitliefert.
--
--    Warum motorklasse_belegt ungeschuetzt bleiben darf, obwohl INSERT auf
--    route_completions weiterhin an authenticated vergeben ist (Audit A1):
--    gewertet wird das MAXIMUM. Ein zu niedrig gesetzter Belegwert bewirkt
--    nichts, ein zu hoher schadet nur dem Absender selbst. Die Spalte ist
--    damit die eine Stelle, an der ein freier Schreibzugriff folgenlos ist.
--    UPDATE ist ohnehin nicht gegrantet: 0046 hat UPDATE auf der Tabelle
--    entzogen und nur ist_oeffentlich, notiz und track_oeffentlich neu
--    vergeben — neue Spalten erben daraus kein Recht.
-- ---------------------------------------------------------------------------
alter table public.route_completions
  add column motorklasse text,
  add column motorklasse_belegt text,
  add column motorklasse_gewertet text
    generated always as (public.motorklasse_hoehere(motorklasse, motorklasse_belegt)) stored;

alter table public.route_completions
  add constraint route_completions_motorklasse_check
    check (motorklasse is null or public.motorklasse_rang(motorklasse) is not null) not valid,
  add constraint route_completions_motorklasse_belegt_check
    check (motorklasse_belegt is null or public.motorklasse_rang(motorklasse_belegt) is not null) not valid;

comment on column public.route_completions.motorklasse is
  'Deklarierte Motorklasse, beim Schreiben aus dem referenzierten Fahrzeug abgeleitet und danach eingefroren. Wird ausschliesslich vom Trigger route_completions_motorklasse gesetzt.';
comment on column public.route_completions.motorklasse_belegt is
  'Aus dem GPS-Track belegte Motorklasse — was die Fahrt an Leistung mindestens verlangt hat. Nur aufwaerts wirksam, siehe motorklasse_gewertet.';
comment on column public.route_completions.motorklasse_gewertet is
  'Die hoehere aus motorklasse und motorklasse_belegt. Einzige Spalte, nach der Ranglisten filtern duerfen. GENERATED ALWAYS — nicht schreibbar.';

-- ---------------------------------------------------------------------------
-- 4) Der Trigger. Setzt die deklarierte Klasse und prueft den
--    klassenabhaengigen Tempo-Deckel — beides in einer Funktion, damit die
--    Reihenfolge nicht an der alphabetischen Trigger-Sortierung haengt.
--
--    Er ueberschreibt bedingungslos, was der Client geschickt hat. Das ist
--    derselbe Ansatz, den 0059 gegenueber der urspruenglichen
--    Audit-Empfehlung ("REVOKE INSERT") begruendet: ein Trigger greift auf
--    JEDEM Schreibpfad — direkter PostgREST-Aufruf, logTrackedCompletion,
--    save_free_ride_with_segments (0050) — ohne eine Client-Aenderung.
--
--    Bewusst OHNE security definer: gelesen wird nur eine Zeile aus
--    vehicles, und zwar genau die des Schreibenden (v.user_id =
--    new.user_id). Die RLS-Policy "Nutzer sehen nur eigene Fahrzeuge" (0001,
--    verschaerft in 0027) gibt sie ihm ohnehin frei. Eine SECURITY-DEFINER-
--    Funktion waere hier zusaetzliche Rechteausweitung ohne Gegenwert.
--
--    Der Vergleich auf new.user_id ist die eigentliche Absicherung: er
--    verhindert, dass eine Fahrt die Klasse eines FREMDEN Fahrzeugs
--    uebernimmt. Ein Fremdschluessel allein verlangt kein Leserecht.
-- ---------------------------------------------------------------------------
create or replace function public.set_motorklasse()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_klasse text;
  v_kmh numeric;
  v_max_kmh numeric;
begin
  if new.fahrzeug_id is null then
    v_klasse := null;
  else
    select public.motorklasse(v.typ, v.hubraum_ccm, v.leistung_kw)
      into v_klasse
      from public.vehicles v
     where v.id = new.fahrzeug_id
       and v.user_id = new.user_id;
  end if;

  new.motorklasse := v_klasse;

  -- Klassenabhaengiger Deckel fuer das Durchschnittstempo, als Ergaenzung zur
  -- pauschalen 200-km/h-Grenze aus 0059. Grob — ein Durchschnitt versteckt
  -- Spitzen —, aber auf jedem Schreibpfad wirksam.
  --
  -- Nur die beiden Motorradklassen bekommen einen: dort ist die Grenze
  -- physikalisch eindeutig. Ein A1-Fahrzeug leistet 11 kW und erreicht damit
  -- eben rund 100 km/h; 95 km/h im SCHNITT ueber eine ganze Fahrt sind
  -- ausgeschlossen, mit reichlich Luft nach oben gegenueber allem, was eine
  -- echte Fahrt erreicht. Fuer Autos gibt es keinen entsprechend scharfen
  -- Wert — ein 110-kW-Wagen faehrt jede Autobahnetappe mit, die ein 300-PS-
  -- Wagen auch faehrt. Dort greift weiterhin nur die 200er-Grenze aus 0059.
  --
  -- Fuer eine ehrliche Fahrt darf das nie feuern. Wie die Exceptions in 0059
  -- ist das der Backstop, nicht die Benutzerfuehrung.
  v_max_kmh := case new.motorklasse
    when 'moto_a1'  then 95
    when 'moto_a35' then 130
    else null
  end;

  if v_max_kmh is not null
     and new.distanz_km is not null
     and new.dauer_sekunden is not null
     and new.dauer_sekunden > 0 then
    v_kmh := new.distanz_km / (new.dauer_sekunden / 3600.0);
    if v_kmh > v_max_kmh then
      raise exception 'implausible_speed_for_class';
    end if;
  end if;

  return new;
end;
$$;

comment on function public.set_motorklasse() is
  'Leitet route_completions.motorklasse aus dem referenzierten eigenen Fahrzeug ab (ignoriert den Clientwert) und lehnt ein fuer die Klasse unmoegliches Durchschnittstempo ab. Gegenstueck zu enforce_route_completion_stats() (0059).';

-- Reine Trigger-Funktion: feuert unabhaengig von EXECUTE-Rechten (siehe 0047
-- Abschnitt A) — der Entzug schliesst nur den unnoetigen direkten RPC-Weg.
revoke execute on function public.set_motorklasse() from public;
revoke execute on function public.set_motorklasse() from anon, authenticated;

-- Reihenfolge der BEFORE-Trigger auf route_completions (alphabetisch):
--   route_completions_enforce_stats      (0059)
--   route_completions_motorklasse        (hier)
--   route_completions_recompute_coverage (0052)
-- Alle drei fassen disjunkte Spalten an, die Reihenfolge ist also
-- unkritisch — festgehalten wie in 0059, damit sie nicht geraten werden muss.
drop trigger if exists route_completions_motorklasse on public.route_completions;
create trigger route_completions_motorklasse
  before insert or update on public.route_completions
  for each row
  execute function public.set_motorklasse();

-- ---------------------------------------------------------------------------
-- 5) Leistungswerte einfrieren, sobald sie zaehlen.
--
--    Die Klasse einer bereits gespeicherten Fahrt aendert sich durch ein
--    spaeteres Bearbeiten des Fahrzeugs nicht (Abschnitt 3). Diese Sperre
--    schliesst die zweite Haelfte: Wer seine Angaben korrigieren will,
--    legt ein neues Fahrzeug an — was in der Garage sichtbar ist —, statt
--    ein Fahrzeug mit Fahrtenhistorie still umzuwidmen. Sie ist auch der
--    Schutz fuer einen spaeteren Backfill, der aus dem dann aktuellen
--    Fahrzeugstand ableiten wuerde.
--
--    Die App bietet heute gar keinen Bearbeitungspfad fuer Fahrzeuge
--    (lib/actions/vehicles.ts kennt nur anlegen und loeschen) — die Policy
--    "Nutzer verwalten eigene Fahrzeuge" (0001) erlaubt UPDATE per
--    PostgREST aber sehr wohl. Deshalb gehoert die Sperre in die Datenbank
--    und nicht in die Server Action.
--
--    marke, modell, getriebe und baujahr bleiben frei aenderbar: sie gehen
--    in keine Klasse ein.
-- ---------------------------------------------------------------------------
create or replace function public.vehicles_leistung_einfrieren()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.typ is not distinct from old.typ
     and new.hubraum_ccm is not distinct from old.hubraum_ccm
     and new.leistung_kw is not distinct from old.leistung_kw then
    return new;
  end if;

  if exists (
    select 1 from public.route_completions rc where rc.fahrzeug_id = old.id
  ) then
    raise exception 'vehicle_class_locked';
  end if;

  return new;
end;
$$;

comment on function public.vehicles_leistung_einfrieren() is
  'Verhindert das nachtraegliche Aendern von typ/hubraum_ccm/leistung_kw an einem Fahrzeug, auf das bereits eine Fahrt verweist. Korrektur erfolgt ueber ein neues Fahrzeug.';

revoke execute on function public.vehicles_leistung_einfrieren() from public;
revoke execute on function public.vehicles_leistung_einfrieren() from anon, authenticated;

drop trigger if exists vehicles_leistung_gesperrt on public.vehicles;
create trigger vehicles_leistung_gesperrt
  before update on public.vehicles
  for each row
  execute function public.vehicles_leistung_einfrieren();

-- ---------------------------------------------------------------------------
-- 6) Indizes. Partiell, weil motorklasse_gewertet anfangs fast ueberall null
--    ist und ein Vollindex nur die Schreibpfade belasten wuerde.
-- ---------------------------------------------------------------------------
create index if not exists route_completions_motorklasse_idx
  on public.route_completions (motorklasse_gewertet)
  where motorklasse_gewertet is not null;

create index if not exists route_completions_route_klasse_zeit_idx
  on public.route_completions (route_id, motorklasse_gewertet, dauer_sekunden)
  where motorklasse_gewertet is not null;

-- ---------------------------------------------------------------------------
-- 7) Views.
--
--    Nur ANHAENGEN, deshalb genuegt create or replace — anders als in 0056,
--    wo eine Spalte umbenannt wurde und beide Views gedroppt werden mussten.
--    Damit bleiben die Grants unangetastet und leaderboard_user_totals
--    (0056) braucht ueberhaupt keine Aenderung.
--
--    Datenschutz-Entscheid, ausdruecklich festgehalten (Kernregel 16):
--    Die Klasse ist NICHT an zeigt_fahrzeuge gekoppelt, anders als
--    fahrzeug_typ/marke/modell in public_fahrten (0038, 0070). Begruendung:
--    Die Klasse ist die Achse, auf der jemand antritt — wie die Distanz
--    einer Fahrt —, nicht eine Angabe ueber sein Fahrzeug. Sie erscheint
--    ausserdem nur, wo der Nutzer die Fahrt ohnehin selbst veroeffentlicht
--    hat. Marke und Modell bleiben geschuetzt wie bisher; public_fahrten
--    wird von dieser Migration nicht angefasst.
-- ---------------------------------------------------------------------------
create or replace view public.leaderboard_completions as
select
  rc.user_id,
  p.display_name,
  rc.route_id,
  r.laenge_km,
  rc.hoehenmeter_aufstieg,
  coalesce(rc.distanz_km, r.laenge_km) as effektive_distanz_km,
  (p.ist_premium and p.zeigt_premium_badge) as ist_premium,
  p.zeigt_premium_badge,
  case when p.zeigt_avatar then p.avatar_url else null end as avatar_url,
  rc.motorklasse_gewertet as motorklasse
from route_completions rc
  join profiles p on (p.id = rc.user_id)
  left join routes r on (r.id = rc.route_id)
where rc.ist_oeffentlich = true
  and (
    (rc.art = 'strecke' and r.status_ok = true and r.ist_privat = false)
    or (rc.art = 'frei' and rc.route_id is null)
  );

-- Pro-Nutzer-UND-Klasse-Aggregat. Bewusst eine eigene View neben
-- leaderboard_user_totals (0054/0056) statt einer Erweiterung von dessen
-- GROUP BY: wer ein Auto UND ein Motorrad faehrt, erschiene dort sonst
-- doppelt, und "Alle" waere keine Gesamtsumme mehr.
--
-- Der Filter auf motorklasse is not null haelt Fahrten ohne Fahrzeug oder
-- ohne Leistungsangabe aus den Klassenlisten heraus — sie zaehlen weiterhin
-- in leaderboard_user_totals ("Alle") mit.
create or replace view public.leaderboard_klassen_totals as
select
  user_id,
  motorklasse,
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
group by user_id, motorklasse, display_name, avatar_url, ist_premium, zeigt_premium_badge;

grant select on public.leaderboard_klassen_totals to anon, authenticated;

comment on view public.leaderboard_klassen_totals is
  'Pro-Nutzer-und-Motorklasse-Aggregat von leaderboard_completions fuer die nach Klassen getrennten Bestenlisten. Laeuft wie leaderboard_completions mit den Rechten des View-Owners, siehe 0013_leaderboard_view.sql. leaderboard_user_totals bleibt daneben fuer die Gesamtwertung zustaendig.';

-- Bestzeiten einer Strecke: nur die Spalte anhaengen, gefiltert wird in der
-- Abfrage (lib/leaderboard.ts). Definition sonst unveraendert gegenueber 0060.
create or replace view public.route_leaderboard as
select
  rc.id as completion_id,
  rc.route_id,
  rc.user_id,
  p.display_name,
  rc.dauer_sekunden,
  rc.distanz_km,
  rc.datum,
  (p.ist_premium and p.zeigt_premium_badge) as ist_premium,
  p.zeigt_premium_badge,
  case when p.zeigt_avatar then p.avatar_url else null end as avatar_url,
  rc.motorklasse_gewertet as motorklasse
from route_completions rc
  join profiles p on (p.id = rc.user_id)
  join routes r on (r.id = rc.route_id)
where r.status_ok = true
  and r.ist_privat = false
  and rc.ist_oeffentlich = true
  and rc.dauer_sekunden is not null
  and rc.art = 'strecke';

-- =====================================================================
-- Verbleibende Risiken, ausdruecklich benannt:
--
-- 1. Die Leistungsangabe ist eine Selbstauskunft. Diese Migration macht sie
--    nur unveraenderlich, nicht wahr. Die Gegenpruefung aus dem GPS-Track
--    (motorklasse_belegt) folgt in einem eigenen Schritt; bis dahin wirkt
--    allein der grobe Tempo-Deckel aus Abschnitt 4.
--
-- 2. Ein direkter PostgREST-INSERT kann motorklasse_belegt weglassen und
--    damit die feine Pruefung umgehen. Bewusst nicht weiter abgesichert:
--    Wer so schreiben kann, faelscht nach Audit-Befund A1 Bein 2 ohnehin
--    gleich dauer_sekunden — was mehr einbringt als eine geschoente Klasse.
--    Diese Tuer schliesst eine serverseitige Zeitnahme, nicht diese Migration.
--
-- 3. motorklasse_gewertet ist STORED: eine spaetere Verschiebung der
--    Klassengrenzen rechnet die Spalte NICHT neu. Das kostet dann eine
--    eigene Migration mit Tabellen-Rewrite — und ist ohnehin eine
--    Geschaeftsregelaenderung, die nicht nebenbei passieren darf.
-- =====================================================================
