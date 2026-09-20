-- 0115: Bestzeiten nach Strecke und Zeit — der Zugriff, den jede
-- Bestzeiten-Karte und jeder Klassen-Chip auslöst.
--
-- 0080 legte (route_id, motorklasse_gewertet, dauer_sekunden) an, partiell
-- auf motorklasse_gewertet is not null. Seitdem liest
-- getRouteLeaderboardKlassen() die belegten Klassen mit EINER Abfrage
-- (nur route_id, Limit 200, Reduktion in JS) statt mit sechs limit(1) —
-- und getRouteLeaderboard() liest ohne Klassenfilter, also inklusive der
-- Fahrten ohne Klasse. Beide treffen genau diesen Index.
--
-- Additiv, if not exists, keine Sperre über Sekunden hinaus. Kein
-- Funktions- oder View-Eingriff, keine Grant-Änderung.
create index if not exists route_completions_route_zeit_idx
  on public.route_completions (route_id, dauer_sekunden);
