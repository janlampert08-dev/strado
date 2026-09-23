-- Importierte Fahrten (GPX aus calimoto, Kurviger, Strava, Garmin …).
--
-- Eine importierte Fahrt ist eine freie Fahrt mit dem Datum aus der Datei.
-- Sie zählt für die eigene Geschichte und die Pass-Sammlung (meine_paesse()
-- geht über track und datum, 0104/0113) — und für nichts, das andere sehen.
--
-- Warum sie privat bleiben MUSS, und zwar hier und nicht nur im Code:
-- eine GPX-Datei lässt sich in einer Minute erzeugen, eine Aufzeichnung
-- verlangt eine Fahrt. Öffentlich würde eine erzeugte Datei die Distanz- und
-- Höhenmeter-Bestenlisten (0054) füllen, und jede öffentliche Fahrt landet im
-- Feed. Die Streckenranglisten sind schon sicher — ohne Fahrtstart-Ticket
-- setzt enforce_route_completion_dauer (0098/0118) dauer_quelle auf 'trail',
-- und route_leaderboard führt nur 'server' (0096).
--
-- Der Constraint deckt beide Schreibwege ab: das INSERT der Import-Aktion und
-- das spätere UPDATE über toggleCompletionVisibility oder einen direkten
-- PostgREST-Aufruf. `importiert` selbst lässt sich nachträglich nicht
-- zurücksetzen — authenticated darf seit 0046 nur ist_oeffentlich, notiz und
-- track_oeffentlich ändern. Diese Migration fasst die Grants nicht an.
--
-- `add column ... default false` schreibt die Tabelle nicht um (konstanter
-- Default, attmissingval). Der Constraint prüft die bestehenden Zeilen beim
-- Anlegen; sie tragen alle importiert = false und bestehen damit.

set lock_timeout = '5s';

alter table public.route_completions
  add column importiert boolean not null default false;

alter table public.route_completions
  add constraint route_completions_import_privat
  check (not importiert or (ist_oeffentlich = false and track_oeffentlich is null));

comment on column public.route_completions.importiert is
  'Aus einer GPX-Datei importiert statt live aufgezeichnet (0124). Immer privat (Constraint route_completions_import_privat), ohne Serverzeit und damit in keiner Rangliste. Für authenticated nicht änderbar (Update-Grant aus 0046).';

-- Rückweg (von Hand, nicht Teil der Migration):
--   alter table public.route_completions drop constraint route_completions_import_privat;
--   alter table public.route_completions drop column importiert;
-- Importierte Fahrten blieben dabei als gewöhnliche private freie Fahrten
-- stehen — vorher mit `delete ... where importiert` entfernen, wenn sie nicht
-- bleiben sollen.
