-- =====================================================================
-- 0139 — RLS-Policies aufgeräumt (Performance-Advisor, ohne Semantikänderung)
-- =====================================================================
--
-- WARUM
-- Der Performance-Advisor meldet am 2026-09-25 zwei Warnungsarten:
--
--  * auth_rls_initplan (17 Policies): `auth.uid()` steht nackt im Ausdruck.
--    Postgres wertet die Funktion dann für JEDE Zeile neu aus. Als
--    `(select auth.uid())` wird sie zu einem InitPlan und läuft einmal pro
--    Abfrage. auth.uid() ist innerhalb einer Abfrage konstant (liest nur
--    request.jwt.claims), das Ergebnis ist also dasselbe.
--
--  * multiple_permissive_policies (49 Meldungen, 9 Tabelle/Befehl-Paare):
--    Für dieselbe Rolle und denselben Befehl gibt es zwei permissive
--    Policies, Postgres muss beide auswerten. Fast immer steckt eine
--    FOR-ALL-Policy dahinter, die sich mit einer FOR-SELECT/UPDATE/DELETE-
--    Policy überlappt.
--
-- WIE, UND WARUM DAS DIESELBE BERECHTIGUNG IST
-- Postgres verknüpft permissive Policies so (Doku "CREATE POLICY"):
--   - USING aller anwendbaren permissiven Policies mit OR,
--   - WITH CHECK aller anwendbaren permissiven Policies mit OR — NICHT
--     paarweise mit dem eigenen USING. Fehlt WITH CHECK, gilt für diese
--     Policy ihr USING als Check.
-- Daraus folgen die drei Werkzeuge dieser Datei, alle verlustfrei:
--   1. FOR ALL aufteilen in SELECT / INSERT / UPDATE / DELETE mit genau
--      denselben Ausdrücken (USING für SELECT/UPDATE/DELETE, WITH CHECK für
--      INSERT/UPDATE). Eine FOR-ALL-Policy ist nichts anderes als diese vier.
--   2. Zwei Policies derselben Rolle und desselben Befehls zu einer
--      zusammenlegen: USING = (a) or (b), WITH CHECK = (a_check) or (b_check).
--      Genau das rechnet Postgres ohnehin aus. Wo eine Seite kein WITH CHECK
--      hatte, steht ihr USING an dessen Stelle.
--   3. Eine Policy streichen, die von einer anderen derselben Rolle und
--      desselben Befehls vollständig abgedeckt ist (x or x = x;
--      true or x = true).
-- Rollen: alle zusammengelegten Paare hatten dieselbe Rollenliste (entweder
-- beide `public` oder beide `authenticated`), die neuen Policies übernehmen
-- sie unverändert.
-- Namen: wo eine Policy nur umgeschrieben wird, bleibt ihr Name. Wo eine
-- FOR-ALL-Policy aufgeteilt wird, braucht jeder Teil einen eigenen Namen.
-- Der Code referenziert keine Policy-Namen (nur ein Kommentar in
-- lib/actions/creatorLinks.ts, mitgezogen).
--
-- Nicht angefasst: jede Policy, die weder der Advisor meldet noch Teil eines
-- gemeldeten Paars ist. Alle Ausdrücke unten sind wörtlich aus pg_policies
-- (Stand 2026-09-25) übernommen; einzige Änderung ist auth.uid() →
-- (select auth.uid()).
--
-- PRÜFEN (nach dem Einspielen)
--   1. get_advisors(performance): auth_rls_initplan und
--      multiple_permissive_policies sind leer.
--   2. Die Abfragen im PR-Text (Abschnitt "Verification"): keine
--      Policy in public mit nacktem auth.uid(), keine doppelte permissive
--      Policy pro Rolle+Befehl, und die Zeilenzahlen als normaler Nutzer /
--      Moderator / anon sind vorher und nachher gleich.
--
-- ZURÜCK
-- Die "vorher"-Ausdrücke stehen im PR-Text und hier jeweils im Kommentar
-- über jedem Block; ein Rollback ist dieselbe Datei rückwärts (neue
-- Policies droppen, alte mit den alten Ausdrücken neu anlegen). Weil die
-- Berechtigungen gleich bleiben, ist ein Rollback nur aus
-- Performance-Gründen je nötig.
--
-- Die Datei muss als EIN Block laufen (apply_migration und der SQL-Editor
-- tun das: eine Mehrfachanweisung ist eine implizite Transaktion; wie die
-- übrigen Migrationen deshalb ohne eigenes begin/commit). Zwischen drop und
-- create darf keine Abfrage eine Tabelle ohne ihre Policy sehen — bei
-- aktivem RLS hiesse das "keine Zeile", also kein Leck, aber kurzzeitig
-- leere Ergebnisse.

-- ---------------------------------------------------------------------
-- Teil 1 — nur auth.uid() einpacken (auth_rls_initplan)
-- ---------------------------------------------------------------------

-- saisonpaesse — vorher: (user_id = auth.uid())
drop policy "Nutzer lesen ihre eigenen Saisonpaesse" on public.saisonpaesse;
create policy "Nutzer lesen ihre eigenen Saisonpaesse" on public.saisonpaesse
  for select to authenticated
  using (user_id = (select auth.uid()));

-- subscriptions — vorher: (user_id = auth.uid())
drop policy "Nutzer lesen ihr eigenes Abo" on public.subscriptions;
create policy "Nutzer lesen ihr eigenes Abo" on public.subscriptions
  for select to authenticated
  using (user_id = (select auth.uid()));

-- private_strecken_bestandsschutz — vorher: (user_id = auth.uid())
drop policy "Nutzer lesen den eigenen Bestandsschutz" on public.private_strecken_bestandsschutz;
create policy "Nutzer lesen den eigenen Bestandsschutz" on public.private_strecken_bestandsschutz
  for select to authenticated
  using (user_id = (select auth.uid()));

-- kudos — vorher DELETE: (auth.uid() = user_id)
--         vorher INSERT check: ((auth.uid() = user_id) AND completion_is_public(completion_id))
-- Die SELECT-Policy "Kudos auf öffentlichen Fahrten sind sichtbar" enthält
-- kein auth.uid() und bleibt stehen.
drop policy "Nutzer entfernen eigene Kudos" on public.kudos;
create policy "Nutzer entfernen eigene Kudos" on public.kudos
  for delete
  using ((select auth.uid()) = user_id);

drop policy "Nutzer geben Kudos nur auf öffentliche Fahrten" on public.kudos;
create policy "Nutzer geben Kudos nur auf öffentliche Fahrten" on public.kudos
  for insert
  with check ((select auth.uid()) = user_id and public.completion_is_public(completion_id));

-- follows — vorher SELECT: ((auth.uid() = follower_id) OR (auth.uid() = followed_id))
--           vorher INSERT check: (auth.uid() = follower_id)
--           vorher DELETE: (auth.uid() = follower_id)
drop policy "Nutzer sehen eigene Folge-Beziehungen" on public.follows;
create policy "Nutzer sehen eigene Folge-Beziehungen" on public.follows
  for select
  using ((select auth.uid()) = follower_id or (select auth.uid()) = followed_id);

drop policy "Nutzer folgen anderen Nutzern" on public.follows;
create policy "Nutzer folgen anderen Nutzern" on public.follows
  for insert
  with check ((select auth.uid()) = follower_id);

drop policy "Nutzer entfolgen" on public.follows;
create policy "Nutzer entfolgen" on public.follows
  for delete
  using ((select auth.uid()) = follower_id);

-- route_reports — vorher INSERT check: (reporter_id = auth.uid())  [authenticated]
--                 vorher SELECT/UPDATE: exists(profiles … id = auth.uid() and is_moderator)
--                 UPDATE hatte kein WITH CHECK und bekommt keins (USING gilt als Check).
drop policy "Angemeldete Nutzer können Strecken melden" on public.route_reports;
create policy "Angemeldete Nutzer können Strecken melden" on public.route_reports
  for insert to authenticated
  with check (reporter_id = (select auth.uid()));

drop policy "Moderatoren sehen gemeldete Strecken" on public.route_reports;
create policy "Moderatoren sehen gemeldete Strecken" on public.route_reports
  for select
  using (exists (select 1 from public.profiles
                 where profiles.id = (select auth.uid()) and profiles.is_moderator = true));

drop policy "Moderatoren bearbeiten gemeldete Strecken" on public.route_reports;
create policy "Moderatoren bearbeiten gemeldete Strecken" on public.route_reports
  for update
  using (exists (select 1 from public.profiles
                 where profiles.id = (select auth.uid()) and profiles.is_moderator = true));

-- rating_reports — dieselben drei Policies wie route_reports.
drop policy "Angemeldete Nutzer können Kommentare melden" on public.rating_reports;
create policy "Angemeldete Nutzer können Kommentare melden" on public.rating_reports
  for insert to authenticated
  with check (reporter_id = (select auth.uid()));

drop policy "Moderatoren sehen gemeldete Kommentare" on public.rating_reports;
create policy "Moderatoren sehen gemeldete Kommentare" on public.rating_reports
  for select
  using (exists (select 1 from public.profiles
                 where profiles.id = (select auth.uid()) and profiles.is_moderator = true));

drop policy "Moderatoren bearbeiten gemeldete Kommentare" on public.rating_reports;
create policy "Moderatoren bearbeiten gemeldete Kommentare" on public.rating_reports
  for update
  using (exists (select 1 from public.profiles
                 where profiles.id = (select auth.uid()) and profiles.is_moderator = true));

-- ---------------------------------------------------------------------
-- Teil 2 — überlappende Policies (multiple_permissive_policies)
-- ---------------------------------------------------------------------

-- completion_photos (Rolle public)
-- vorher ALL "Nutzer verwalten eigene Fahrt-Fotos":
--   USING (auth.uid() = user_id)
--   CHECK ((auth.uid() = user_id) AND exists(route_completions rc
--          where rc.id = completion_photos.completion_id and rc.user_id = auth.uid()))
-- vorher SELECT "Nutzer sehen eigene Fahrt-Fotos": USING (auth.uid() = user_id)
-- Die SELECT-Policy ist wörtlich derselbe Ausdruck wie der SELECT-Anteil der
-- ALL-Policy (x or x = x) → gestrichen (Werkzeug 3), die ALL-Policy bleibt
-- mit eingepacktem auth.uid().
drop policy "Nutzer sehen eigene Fahrt-Fotos" on public.completion_photos;
drop policy "Nutzer verwalten eigene Fahrt-Fotos" on public.completion_photos;
create policy "Nutzer verwalten eigene Fahrt-Fotos" on public.completion_photos
  for all
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and exists (select 1 from public.route_completions rc
                where rc.id = completion_photos.completion_id
                  and rc.user_id = (select auth.uid()))
  );

-- creator_links (Rolle authenticated, beide)
-- vorher ALL "Moderatoren verwalten Creator-Links": USING = CHECK = ist_moderator
-- vorher SELECT "Creator sehen ihre eigenen Links": USING (creator_user_id = uid)
-- ALL aufgeteilt (Werkzeug 1), SELECT zusammengelegt (Werkzeug 2).
drop policy "Moderatoren verwalten Creator-Links" on public.creator_links;
drop policy "Creator sehen ihre eigenen Links" on public.creator_links;

create policy "Creator und Moderatoren sehen Creator-Links" on public.creator_links
  for select to authenticated
  using (
    creator_user_id = (select auth.uid())
    or exists (select 1 from public.profiles
               where profiles.id = (select auth.uid()) and profiles.is_moderator = true)
  );

create policy "Moderatoren legen Creator-Links an" on public.creator_links
  for insert to authenticated
  with check (exists (select 1 from public.profiles
                      where profiles.id = (select auth.uid()) and profiles.is_moderator = true));

create policy "Moderatoren bearbeiten Creator-Links" on public.creator_links
  for update to authenticated
  using (exists (select 1 from public.profiles
                 where profiles.id = (select auth.uid()) and profiles.is_moderator = true))
  with check (exists (select 1 from public.profiles
                      where profiles.id = (select auth.uid()) and profiles.is_moderator = true));

create policy "Moderatoren löschen Creator-Links" on public.creator_links
  for delete to authenticated
  using (exists (select 1 from public.profiles
                 where profiles.id = (select auth.uid()) and profiles.is_moderator = true));

-- route_completions (Rolle public, beide)
-- vorher ALL "Nutzer verwalten eigene Fahrten": USING = CHECK = (uid = user_id)
-- vorher UPDATE "Moderatoren können Fahrten entöffentlichen":
--   USING ist_moderator, CHECK ((ist_oeffentlich = false) AND (track_oeffentlich IS NULL))
-- UPDATE zusammengelegt: USING eigen OR moderator, CHECK eigen OR entöffentlicht.
-- Das ist exakt, weil Postgres die CHECKs auch vorher schon unabhängig vom
-- USING mit OR verknüpft hat: ein Eigentümer, der gleichzeitig Moderator
-- ist, durfte schon immer beides; ein Moderator durfte fremde Fahrten schon
-- immer nur so ändern, dass sie danach privat sind — und ein Moderator, der
-- eine fremde Zeile so ändert, dass user_id danach seine eigene ist, bestand
-- den CHECK auch vorher über den Eigentümer-Zweig. Nichts davon ist neu.
drop policy "Nutzer verwalten eigene Fahrten" on public.route_completions;
drop policy "Moderatoren können Fahrten entöffentlichen" on public.route_completions;

create policy "Nutzer sehen eigene Fahrten" on public.route_completions
  for select
  using ((select auth.uid()) = user_id);

create policy "Nutzer erfassen eigene Fahrten" on public.route_completions
  for insert
  with check ((select auth.uid()) = user_id);

create policy "Nutzer bearbeiten eigene Fahrten, Moderatoren entöffentlichen" on public.route_completions
  for update
  using (
    (select auth.uid()) = user_id
    or exists (select 1 from public.profiles
               where profiles.id = (select auth.uid()) and profiles.is_moderator = true)
  )
  with check (
    (select auth.uid()) = user_id
    or (ist_oeffentlich = false and track_oeffentlich is null)
  );

create policy "Nutzer löschen eigene Fahrten" on public.route_completions
  for delete
  using ((select auth.uid()) = user_id);

-- route_ratings (Rolle public, alle drei)
-- vorher ALL "Nutzer verwalten eigene Bewertungen": USING = CHECK = (uid = user_id)
-- vorher SELECT "Bewertungen sind öffentlich lesbar": USING true   (bleibt unverändert)
-- vorher DELETE "Moderatoren können Bewertungen löschen": USING ist_moderator (nacktes auth.uid())
-- SELECT: true or eigen = true → der SELECT-Anteil der ALL-Policy fällt weg
-- (Werkzeug 3). DELETE zusammengelegt (Werkzeug 2).
drop policy "Nutzer verwalten eigene Bewertungen" on public.route_ratings;
drop policy "Moderatoren können Bewertungen löschen" on public.route_ratings;

create policy "Nutzer bewerten Strecken" on public.route_ratings
  for insert
  with check ((select auth.uid()) = user_id);

create policy "Nutzer bearbeiten eigene Bewertungen" on public.route_ratings
  for update
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Nutzer und Moderatoren löschen Bewertungen" on public.route_ratings
  for delete
  using (
    (select auth.uid()) = user_id
    or exists (select 1 from public.profiles
               where profiles.id = (select auth.uid()) and profiles.is_moderator = true)
  );

-- routes (Rolle public, alle sechs betroffenen)
-- vorher SELECT "Freigegebene Strecken sind öffentlich lesbar":
--   ((status_ok AND NOT ist_privat) OR erstellt_von = uid)
-- vorher SELECT "Moderatoren sehen auch unveröffentlichte, nicht-private Streck…":
--   (NOT ist_privat AND ist_moderator)
-- vorher UPDATE "Moderatoren können alle Strecken freischalten": USING ist_moderator, kein CHECK
-- vorher UPDATE "Nutzer können eigene unverifizierte Strecken bearbeiten":
--   USING (erstellt_von = uid AND status_ok = false), kein CHECK
-- vorher DELETE "Moderatoren können Strecken ablehnen (löschen)": USING ist_moderator
-- vorher DELETE "Nutzer können eigene abgelehnte Vorschläge löschen":
--   USING (erstellt_von = uid AND abgelehnt_am IS NOT NULL)
-- Alle drei Paare zusammengelegt (Werkzeug 2). UPDATE: beide Policies hatten
-- kein WITH CHECK, also galt je ihr USING als Check, OR-verknüpft; die
-- zusammengelegte Policy ohne WITH CHECK nimmt ihr (OR-)USING als Check —
-- derselbe Ausdruck. Die INSERT-Policy "Angemeldete Nutzer können Strecken
-- vorschlagen" bleibt unverändert.
drop policy "Freigegebene Strecken sind öffentlich lesbar" on public.routes;
drop policy "Moderatoren sehen auch unveröffentlichte, nicht-private Streck" on public.routes;
drop policy "Moderatoren können alle Strecken freischalten" on public.routes;
drop policy "Nutzer können eigene unverifizierte Strecken bearbeiten" on public.routes;
drop policy "Moderatoren können Strecken ablehnen (löschen)" on public.routes;
drop policy "Nutzer können eigene abgelehnte Vorschläge löschen" on public.routes;

create policy "Strecken sichtbar: freigegeben, eigene, für Moderatoren" on public.routes
  for select
  using (
    (status_ok = true and ist_privat = false)
    or erstellt_von = (select auth.uid())
    or (ist_privat = false
        and exists (select 1 from public.profiles
                    where profiles.id = (select auth.uid()) and profiles.is_moderator = true))
  );

create policy "Strecken bearbeiten: eigene unverifizierte, Moderatoren alle" on public.routes
  for update
  using (
    exists (select 1 from public.profiles
            where profiles.id = (select auth.uid()) and profiles.is_moderator = true)
    or (erstellt_von = (select auth.uid()) and status_ok = false)
  );

create policy "Strecken löschen: eigene abgelehnte, Moderatoren alle" on public.routes
  for delete
  using (
    exists (select 1 from public.profiles
            where profiles.id = (select auth.uid()) and profiles.is_moderator = true)
    or (erstellt_von = (select auth.uid()) and abgelehnt_am is not null)
  );

-- vehicles (Rolle public, beide)
-- vorher ALL "Nutzer verwalten eigene Fahrzeuge": USING = CHECK = (uid = user_id)
-- vorher SELECT "Fahrzeuge sichtbar wenn freigegeben":
--   exists(profiles p where p.id = vehicles.user_id and p.zeigt_fahrzeuge)
-- ALL aufgeteilt (Werkzeug 1), SELECT zusammengelegt (Werkzeug 2).
drop policy "Nutzer verwalten eigene Fahrzeuge" on public.vehicles;
drop policy "Fahrzeuge sichtbar wenn freigegeben" on public.vehicles;

create policy "Fahrzeuge sichtbar: eigene oder freigegebene" on public.vehicles
  for select
  using (
    (select auth.uid()) = user_id
    or exists (select 1 from public.profiles p
               where p.id = vehicles.user_id and p.zeigt_fahrzeuge = true)
  );

create policy "Nutzer erfassen eigene Fahrzeuge" on public.vehicles
  for insert
  with check ((select auth.uid()) = user_id);

create policy "Nutzer bearbeiten eigene Fahrzeuge" on public.vehicles
  for update
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Nutzer löschen eigene Fahrzeuge" on public.vehicles
  for delete
  using ((select auth.uid()) = user_id);
