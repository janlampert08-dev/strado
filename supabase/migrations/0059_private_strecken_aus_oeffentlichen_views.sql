-- ---------------------------------------------------------------------------
-- Private und noch nicht freigegebene Strecken aus den öffentlichen Views
--
-- 0049 hat die Sichtbarkeitsregel für Strecken in der RLS-Policy verankert:
--
--   (status_ok = true and ist_privat = false) or erstellt_von = auth.uid()
--
-- Drei Views laufen jedoch bewusst OHNE security_invoker, also mit den
-- Rechten ihres Owners und damit an dieser Policy vorbei. Das ist für ihren
-- Zweck richtig — route_completions ist per RLS nur dem Besitzer sichtbar,
-- ohne den Owner-Kontext gäbe es überhaupt keine fremden Zeiten oder Fotos
-- zu sehen (0009, 0013, 0014). Der Preis dafür ist, dass jede dieser Views
-- die Sichtbarkeitsregel selbst mitführen muss. Zwei tun das nicht:
--
--   * route_leaderboard (zuletzt 0044) joint überhaupt nicht auf routes.
--     0044 hält das sogar ausdrücklich fest und begründet es damit, dass die
--     Abfrage ohnehin nach route_id filtert. Das schliesst freie Fahrten aus,
--     aber nicht private oder noch nicht moderierte Strecken: ein direkter
--     PostgREST-Aufruf ohne route_id-Filter liefert completion_id, route_id,
--     user_id, display_name, Zeit und Distanz für genau diese Fahrten.
--     lib/leaderboard.ts filtert immer nach route_id, die App zeigt die
--     Zeilen also nie — erreichbar ist der Weg trotzdem, und genau dieser
--     Angreifer (direkte API statt UI) ist der Grund für 0040.
--
--   * route_photos (zuletzt 0044) joint auf route_completions, aber nicht
--     auf routes, und prüft status_ok deshalb nirgends. 0038 B hatte exakt
--     diesen Filter für die Schwester-View public_completion_photos
--     nachgezogen und begründet; 0044 hat route_photos neu geschrieben und
--     ihn nicht mitgenommen.
--
--   * leaderboard_completions (zuletzt 0056) prüft status_ok, aber nicht
--     ist_privat. Die Kombination ist_privat = true und status_ok = true
--     entsteht heute über keinen erreichbaren Schreibpfad — 0049 zählt das
--     im Detail auf und hat die Bedingung trotzdem in die Policy geschrieben,
--     mit der Begründung, dass die Grenze nicht an jedem künftigen
--     Schreibpfad hängen darf. Dieselbe Begründung gilt hier.
--
-- Diese Migration zieht in allen drei Views dasselbe Prädikat nach:
--
--   r.status_ok = true and r.ist_privat = false
--
-- Bewusst NICHT geändert: keine der drei Views bekommt security_invoker.
-- Das würde route_completions wieder unter die Besitzer-RLS stellen und
-- sämtliche Bestenlisten und Streckenfotos leeren. Der Fehler ist der
-- fehlende Filter, nicht das Owner-Rechte-Design.
--
-- Keine App-Änderung nötig: lib/leaderboard.ts und lib/photos.ts filtern
-- beide bereits nach route_id. Es verschwinden ausschliesslich Zeilen, die
-- die Oberfläche ohnehin nie gerendert hat.
--
-- CREATE OR REPLACE statt DROP/CREATE: die SELECT-Spaltenlisten bleiben
-- unverändert, damit bleiben auch die Grants aus 0009/0014/0056 und die
-- abhängige View leaderboard_user_totals (0056) erhalten.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. route_leaderboard — Join auf routes ergänzen.
--
-- Der INNER JOIN macht den Ausschluss freier Fahrten zusätzlich strukturell:
-- route_id is null findet keine Partnerzeile. art = 'strecke' bleibt
-- trotzdem stehen — explizit statt implizit, wie 0044 es für diese View
-- ausdrücklich wollte.
-- ---------------------------------------------------------------------------
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
  case when p.zeigt_avatar then p.avatar_url else null end as avatar_url
from route_completions rc
  join profiles p on (p.id = rc.user_id)
  join routes r on (r.id = rc.route_id)
where r.status_ok = true
  and r.ist_privat = false
  and rc.ist_oeffentlich = true
  and rc.dauer_sekunden is not null
  and rc.art = 'strecke';

comment on view public.route_leaderboard is
  'Bestzeiten einer einzelnen Strecke für die Streckenseite. Läuft bewusst mit den Rechten des View-Owners (bypasst RLS), seit 0059 gefiltert auf r.status_ok = true UND r.ist_privat = false — vorher fehlte der Join auf routes ganz, wodurch Fahrten auf privaten und noch nicht moderierten Strecken über einen direkten PostgREST-Aufruf lesbar waren.';

-- ---------------------------------------------------------------------------
-- 2. route_photos — derselbe Join, dasselbe Prädikat.
--
-- Der INNER JOIN ist hier korrekt, weil die View per Definition nur
-- Streckenfotos zeigt (0044). Nicht zu verwechseln mit
-- public_completion_photos (0038), wo derselbe INNER JOIN ein eigener Fehler
-- ist: dort sollen auch Fotos freier Fahrten erscheinen, und route_id is null
-- lässt sie herausfallen. Das ist bewusst NICHT Teil dieser Migration.
-- ---------------------------------------------------------------------------
create or replace view public.route_photos as
select
  cp.id,
  rc.route_id,
  cp.foto_url,
  rc.datum,
  p.display_name
from public.completion_photos cp
join public.route_completions rc on rc.id = cp.completion_id
join public.routes r on r.id = rc.route_id
join public.profiles p on p.id = cp.user_id
where r.status_ok = true
  and r.ist_privat = false
  and rc.ist_oeffentlich = true
  and rc.art = 'strecke'
order by rc.datum desc, cp.position asc;

comment on view public.route_photos is
  'Fotos öffentlicher Fahrten einer Strecke für die Streckenseite. Läuft bewusst mit den Rechten des View-Owners (bypasst RLS), seit 0059 gefiltert auf r.status_ok = true UND r.ist_privat = false — derselbe Filter, den 0038 B für public_completion_photos nachgezogen hatte und den die 0044-Fassung dieser View nicht übernommen hat.';

-- ---------------------------------------------------------------------------
-- 3. leaderboard_completions — ist_privat im Streckenzweig ergänzen.
--
-- Unverändert gegenüber 0056 bis auf diese eine Bedingung. Der LEFT JOIN und
-- die Fallunterscheidung nach art bleiben, wie 0056 sie begründet: freie
-- Fahrten haben route_id is null und keine Partnerzeile in routes, dürfen
-- aber seit 0056 mitzählen. ist_privat gehört deshalb ausschliesslich in den
-- Streckenzweig — im Frei-Zweig ist r vollständig NULL, und r.ist_privat =
-- false wäre dort NULL und würde jede freie Fahrt aus den globalen
-- Bestenlisten werfen.
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
  case when p.zeigt_avatar then p.avatar_url else null end as avatar_url
from route_completions rc
  join profiles p on (p.id = rc.user_id)
  left join routes r on (r.id = rc.route_id)
where rc.ist_oeffentlich = true
  and (
    (rc.art = 'strecke' and r.status_ok = true and r.ist_privat = false)
    or (rc.art = 'frei' and rc.route_id is null)
  );

comment on view public.leaderboard_completions is
  'Aggregierte oeffentliche Fahrdaten fuer die globalen Bestenlisten (meiste Fahrten/km/Hoehenmeter/Strecken). Seit 0056 zaehlen freie Fahrten mit (vorher 0044: streckenbasiert). hoehenmeter_aufstieg (kumulierter Anstieg) ersetzt fuer beide Fahrtarten die vorherige Scheitelhoehe-basierte Zahl. Seit 0059 zusaetzlich auf r.ist_privat = false gefiltert (Streckenzweig), passend zur Policy aus 0049.';
