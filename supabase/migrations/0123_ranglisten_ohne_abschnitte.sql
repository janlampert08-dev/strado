-- =====================================================================
-- Ranglisten: ein erkannter Streckenabschnitt ist keine eigene Fahrt.
--
-- save_free_ride_with_segments (0050, zuletzt 0081) legt neben einer freien
-- Fahrt fuer jede unterwegs erkannte Strecke eine weitere
-- route_completions-Zeile an, mit eigener distanz_km — dieselben Kilometer,
-- die schon in der Elternfahrt stecken. leaderboard_completions filtert
-- darauf nicht, und die drei Aggregate zaehlen jede Zeile:
--
--   live gemessen am 2026-09-23: eine freie Fahrt von 22.2 km mit einem
--   erkannten Abschnitt von 11.5 km stand in der Rangliste als 2 Fahrten
--   und 33.7 km. Dasselbe Konto: Profil 200 km / 7 Fahrten, Ranglisten
--   211 km / 8 Fahrten.
--
-- app/profil/page.tsx und lib/achievements.ts filtern seit PR #274 auf
-- parent_completion_id is null. Die Views konnten das nicht, weil
-- leaderboard_completions die Spalte bewusst nicht fuehrt (0050: die
-- Verknuepfung Abschnitt → Elternfahrt bleibt dem Besitzer vorbehalten).
-- PR #274 hat die Entscheidung deshalb offen gelassen; der Eigentuemer hat
-- sie am 2026-09-23 getroffen: beheben.
--
-- Die Regel ist dieselbe Zweiteilung wie in .agents/database.md:
--
--   * MENGE ("wie weit", "wie oft", "wie viel Aufstieg"): ohne Abschnitte.
--     fahrten_count, km und hoehenmeter.
--   * MITGLIEDSCHAFT ("welche Strecken"): MIT Abschnitten. strecken_count
--     zaehlt count(distinct route_id) — eine Strecke, die man mitten in
--     einer freien Fahrt gefahren ist, ist gefahren. Das ist der Sinn der
--     Erkennung, und die distinct-Zaehlung dedupliziert ohnehin.
--
-- Wie: leaderboard_completions bekommt eine Spalte ist_abschnitt (boolean)
-- ANGEHAENGT — create or replace view darf Spalten nur am Ende ergaenzen,
-- die bestehenden bleiben in Name, Typ und Reihenfolge gleich. Sie verraet
-- nur, DASS eine Zeile ein Abschnitt ist, nicht WESSEN Fahrt sie
-- entstammt: parent_completion_id selbst bleibt draussen, wie 0050 es
-- will. Danach werden die drei Aggregate mit FILTER neu geschrieben; Name,
-- Spalten und Typen bleiben gleich, also bleibt auch lib/leaderboard.ts
-- unveraendert.
--
-- Rechte: create or replace view behaelt Eigentuemer, Grants und
-- reloptions. Die Views laufen wie bisher mit Eigentuemerrechten (keine
-- security_invoker-Option gesetzt, live geprueft am 2026-09-23) — das ist
-- der Stand seit 0054/0085 und wird hier nicht geaendert.
--
-- Wirkung auf Dritte: Wer einen Abschnitt oeffentlich geschaltet hat,
-- verliert in "Meiste Fahrten" und "Meiste km" genau diesen Doppelzaehler.
-- Am 2026-09-23 betraf das ein Konto mit einem Abschnitt (211.1 → 199.6
-- km, 8 → 7 Fahrten, Strecken unveraendert 1). Mengengeruest: keines — es
-- sind Views, es wird nichts gespeichert oder umgeschrieben.
--
-- REIHENFOLGE: unabhaengig vom Code. Kein Code liest ist_abschnitt; die
-- Migration kann vor oder nach jedem Deploy eingespielt werden.
--
-- WEG ZURUECK: die drei Aggregate mit den Definitionen aus 0054 bzw. 0085
-- (ohne FILTER) neu anlegen. ist_abschnitt kann in leaderboard_completions
-- stehen bleiben — eine angehaengte Spalte, die niemand liest, schadet
-- nicht, und ein drop column auf einer View mit drei Abhaengigen waere der
-- teurere Weg.
-- =====================================================================

set lock_timeout = '5s';

-- ---------------------------------------------------------------------------
-- 1) Die Basis: unveraendert bis auf die angehaengte Spalte.
--    Der Text ist die live gelesene Definition (pg_get_viewdef, 2026-09-23),
--    nicht die aus einer aelteren Migrationsdatei.
-- ---------------------------------------------------------------------------
create or replace view public.leaderboard_completions as
select
  rc.user_id,
  p.display_name,
  rc.route_id,
  r.laenge_km,
  rc.hoehenmeter_aufstieg,
  coalesce(rc.distanz_km, r.laenge_km) as effektive_distanz_km,
  p.ist_premium and p.zeigt_premium_badge as ist_premium,
  p.zeigt_premium_badge,
  case when p.zeigt_avatar then p.avatar_url else null::text end as avatar_url,
  rc.motorklasse_gewertet as motorklasse,
  rc.parent_completion_id is not null as ist_abschnitt
from public.route_completions rc
join public.profiles p on p.id = rc.user_id
left join public.routes r on r.id = rc.route_id
where rc.ist_oeffentlich = true
  and (
    (rc.art = 'strecke' and r.status_ok = true and r.ist_privat = false)
    or (rc.art = 'frei' and rc.route_id is null)
  );

-- ---------------------------------------------------------------------------
-- 2) Die drei Aggregate: Menge ohne Abschnitte, Mitgliedschaft mit.
--    Spaltennamen, -reihenfolge und -typen wie bisher (count → bigint,
--    coalesce(sum(...), 0::numeric) → numeric).
-- ---------------------------------------------------------------------------
create or replace view public.leaderboard_user_totals as
select
  user_id,
  display_name,
  avatar_url,
  ist_premium,
  zeigt_premium_badge,
  count(*) filter (where not ist_abschnitt) as fahrten_count,
  coalesce(sum(hoehenmeter_aufstieg) filter (where not ist_abschnitt), 0::numeric) as hoehenmeter,
  coalesce(sum(effektive_distanz_km) filter (where not ist_abschnitt), 0::numeric) as km,
  count(distinct route_id) as strecken_count
from public.leaderboard_completions
group by user_id, display_name, avatar_url, ist_premium, zeigt_premium_badge;

create or replace view public.leaderboard_klassen_totals as
select
  user_id,
  motorklasse,
  display_name,
  avatar_url,
  ist_premium,
  zeigt_premium_badge,
  count(*) filter (where not ist_abschnitt) as fahrten_count,
  coalesce(sum(hoehenmeter_aufstieg) filter (where not ist_abschnitt), 0::numeric) as hoehenmeter,
  coalesce(sum(effektive_distanz_km) filter (where not ist_abschnitt), 0::numeric) as km,
  count(distinct route_id) as strecken_count
from public.leaderboard_completions
where motorklasse is not null
group by user_id, motorklasse, display_name, avatar_url, ist_premium, zeigt_premium_badge;

create or replace view public.leaderboard_typ_totals as
select
  user_id,
  public.motorklasse_typ(motorklasse) as fahrzeug_typ,
  display_name,
  avatar_url,
  ist_premium,
  zeigt_premium_badge,
  count(*) filter (where not ist_abschnitt) as fahrten_count,
  coalesce(sum(hoehenmeter_aufstieg) filter (where not ist_abschnitt), 0::numeric) as hoehenmeter,
  coalesce(sum(effektive_distanz_km) filter (where not ist_abschnitt), 0::numeric) as km,
  count(distinct route_id) as strecken_count
from public.leaderboard_completions
where motorklasse is not null
group by user_id, public.motorklasse_typ(motorklasse), display_name, avatar_url, ist_premium, zeigt_premium_badge;

-- ---------------------------------------------------------------------------
-- Pruefung nach dem Einspielen (nur lesend):
--
--   select count(*) filter (where ist_abschnitt) from public.leaderboard_completions;
--   -- Anzahl oeffentlicher Abschnitte; am 2026-09-23: 1
--
--   select user_id, fahrten_count, km, strecken_count
--   from public.leaderboard_user_totals order by km desc;
--   -- das Konto ce4f33eb…: 7 Fahrten, ~199.6 km, 1 Strecke
--
--   select c.relname, c.reloptions from pg_class c
--   where c.relname like 'leaderboard_%totals' or c.relname = 'leaderboard_completions';
--   -- reloptions weiterhin null (Eigentuemerrechte wie vorher)
-- ---------------------------------------------------------------------------
