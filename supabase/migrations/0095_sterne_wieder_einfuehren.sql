-- Sterne-Bewertung wieder einführen — die Rücknahme von
-- 0025_ratings_ohne_sterne.sql.
--
-- 0025 nahm die 1–5 Sterne heraus ("Nutzer sollen nur noch kommentieren
-- können") und liess die Spalte bewusst stehen: "damit bereits vergebene
-- Sterne nicht verloren gehen, falls sie später doch noch ausgewertet werden
-- sollen". Genau dieser Fall tritt jetzt ein.
--
-- Das ist eine Umkehr einer Produktentscheidung, keine Fehlerbehebung — sie
-- gehört in die PR-Beschreibung (Kernregel 16) und nicht bloss hierher.
--
-- ---------------------------------------------------------------------------
-- Was diese Migration NICHT tut
-- ---------------------------------------------------------------------------
-- Sie setzt die Spalte nicht wieder auf `not null`. Zwischen 0025 und heute
-- sind reine Kommentarzeilen ohne Sterne entstanden; ein `not null` liesse
-- sich gegen sie gar nicht erst anlegen, und ein Backfill müsste Sterne
-- erfinden, die niemand vergeben hat. Eine Bewertung darf deshalb weiterhin
-- aus einem blossen Kommentar bestehen. Die App verlangt nur, dass mindestens
-- eines von beidem da ist — diese Regel steht in lib/actions/ratings.ts und
-- bleibt dort: sie betrifft, was ein Formular absenden darf, nicht was in der
-- Tabelle stehen kann (Altzeilen erfüllen sie ohnehin).
--
-- ---------------------------------------------------------------------------
-- Warum die Prüfung in die Datenbank gehört
-- ---------------------------------------------------------------------------
-- route_ratings trägt volle Tabellen-Grants (es gab nie ein
-- Spalten-Hardening wie bei profiles in 0034), und die RLS-Policy "Nutzer
-- verwalten eigene Bewertungen" (0001, präzisiert in 0027) lässt jedes
-- angemeldete Konto seine eigene Zeile schreiben. Ein direkter
-- PostgREST-Request kann die Server Action also umgehen. Ohne Constraint
-- schriebe er `sterne = 9999` und verschöbe damit den öffentlich
-- angezeigten Durchschnitt einer fremden Strecke — dieselbe Klasse von
-- Befund wie A1 bei den Fahrten: was angezeigt wird, darf nicht allein vom
-- Client abhängen.
--
-- Der Constraint heisst wieder route_ratings_sterne_check, wie der von 0001,
-- den 0025 fallen liess. Kein Namenskonflikt: er existiert seit 0025 nicht
-- mehr.
--
-- Bestand: alle Zeilen erfüllen die Bedingung bereits. Vor 0025 galt
-- `check (sterne between 1 and 5)`, danach hat die App die Spalte nicht mehr
-- geschrieben — es kann also nur 1–5 oder null geben. Deshalb ohne
-- `not valid`/`validate constraint`: es gibt nichts zu prüfen, was scheitern
-- könnte, und die Tabelle ist klein.

alter table public.route_ratings
  add constraint route_ratings_sterne_check
  check (sterne is null or sterne between 1 and 5);

comment on column public.route_ratings.sterne is
  '1-5 Sterne, optional. null heisst "nur kommentiert" — so entstanden alle Zeilen zwischen 0025 und 0095, in denen die App die Spalte nicht schrieb. Die Untergrenze "mindestens Sterne ODER Kommentar" setzt lib/actions/ratings.ts durch.';
