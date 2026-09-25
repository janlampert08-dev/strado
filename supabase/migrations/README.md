# Migrationen

`supabase/migrations/` ist die einzige Quelle für Schemaänderungen (siehe
AGENTS.md, Regel 8–10). Dieses Verzeichnis beschreibt, **wie** die Dateien in
die Produktionsdatenbank kommen — denn das passiert nicht automatisch.

## Es gibt keine automatische Anwendung

`.github/workflows/ci.yml` führt Lint, Tests und Build aus. Es spielt **keine**
Migrationen ein, und Vercel tut es beim Deploy ebenfalls nicht. Eine neue
Migrationsdatei im Repo ist damit erst dann in der Datenbank, wenn sie jemand
von Hand anwendet (Supabase-Dashboard → SQL Editor, `supabase db push`, oder
das Supabase-MCP-Tool `apply_migration`).

**Konsequenz: Code und Schema können auseinanderlaufen, ohne dass irgendetwas
rot wird.** Genau das ist im September 2026 passiert (siehe unten). Wer eine
Migration schreibt, ist auch dafür verantwortlich, sie einzuspielen — vor
oder zusammen mit dem Deploy des Codes, der sie braucht.

## Vor dem Merge prüfen

```sql
-- Was ist tatsächlich eingespielt?
select version, name from supabase_migrations.schema_migrations order by version;
```

Diese Liste mit den Dateinamen hier abgleichen. Der `name`-Eintrag im Ledger
ist frei wählbar und historisch uneinheitlich (ältere Einträge tragen den
`00NN_`-Präfix nicht) — maßgeblich ist, ob die **Objekte** existieren, nicht
ob die Namen zusammenpassen.

## Eingespielt: 0148_gemeldete_fahrt_verbergen (2026-09-25, Produktion)

"Fahrt verbergen" in der Moderation traf 0 Zeilen (gemessen vor 0145): ein
UPDATE sieht nur Zeilen, die der Aufrufer lesen darf, und auf
route_completions gibt es nur "Nutzer sehen eigene Fahrten". Statt einer
SELECT-Policy für Moderatoren (sie gäbe ihnen alle Fahrten samt vollständiger
Tracks frei) eine SECURITY-DEFINER-Funktion: Rolle prüfen, offene Meldung
verlangen, Fahrt ganz aus der Sicht nehmen (öffentlich und Follower), offene
Meldungen schliessen — in einer Transaktion.

- **Zurückgerollter Funktionstest vorher:** normaler Nutzer → `not_moderator`;
  Moderator ohne offene Meldung → false; mit Meldung → true, Fahrt danach
  privat ohne gekappten Track, 0 offene Meldungen, nur diese eine Fahrt
  betroffen (12 → 11 öffentliche); anon ohne EXECUTE.
- **Gemessen danach:** Ledger `0148_gemeldete_fahrt_verbergen`, anon ohne,
  authenticated mit EXECUTE, weiterhin 12 öffentliche Fahrten.
- Der Code (`unpublishReportedCompletion`) ruft die Funktion auf; der alte
  Code bleibt bis zum Deploy so kaputt wie vorher.
## Eingespielt: 0154_abschnitte_ohne_follower (2026-09-25, Produktion)

Erkannte Abschnitte (`parent_completion_id` gesetzt) werden nie "nur für
Follower": der Trigger aus 0145 verengt sie jetzt auch. Grund: 0151 lässt
Abschnitte der Öffentlichkeit ihrer Fahrt folgen, synchronisiert aber nur
`ist_oeffentlich` — eine eigene Follower-Stufe bliebe beim Privatstellen der
Fahrt stehen. Die Oberfläche bietet Abschnitten ohnehin nur Privat/Öffentlich.

- **Zurückgerollter Test vorher:** Abschnitt auf Follower → bleibt false;
  normale Fahrt auf Follower → true; Triggerfunktion für anon nicht aufrufbar.
- **Gemessen danach:** Ledger `0154_abschnitte_ohne_follower`, Regel im
  Funktionsrumpf, 0 Abschnitte mit `fuer_follower`.
- `lib/followerSichtbarkeit.test.ts` prüft ab jetzt, dass die jüngste
  Definition jeder der vier Views `fuer_follower` nur zusammen mit
  `fahrt_fuer_follower_sichtbar()` freigibt und die Ranglisten keine
  Follower-Fahrten kennen.

## Eingespielt: 0145_fahrten_fuer_follower (2026-09-25, Produktion)

Dritte Sichtbarkeitsstufe für Fahrten: nur für Follower. Neue Spalte
`route_completions.fuer_follower`; `public_fahrten`, `public_fahrt_tracks`,
`public_completion_photos`, `kudos_summary` und die zwei Kudos-Policies
lassen Follower-Fahrten für Follower durch. Moderatoren lesen gemeldete
Fahrten über `gemeldete_fahrten_fuer_moderation()`, nicht über die Views.
Neuer Teilindex `route_completions_geteilt_datum_idx` für den Feed.
Ranglisten, `route_photos` und `oeffentliche_passhoehen` bleiben
unverändert, also ohne Follower-Fahrten.

- **Geschrieben als 0140**, vor dem Einspielen umnummeriert: dieselbe
  Nummer hatte inzwischen `0140_streckentexte_steigung_abgleich` belegt.
- **Gegen den Stand NACH 0139 geschrieben.** Die Moderatoren-Policy heisst
  seit 0139 "Nutzer bearbeiten eigene Fahrten, Moderatoren entöffentlichen";
  0145 ändert per `alter policy` nur deren WITH CHECK und lässt das USING
  stehen, damit 0134 dessen Moderatorenprüfung umstellen kann.
- **0134 enthält `fuer_follower` in seiner festen Insert-Spaltenliste**
  (#460, vor dem Einspielen von 0134). Ohne das nähme sein `revoke insert`
  den Spalten-Grant aus 0145 mit. Gemessen danach: authenticated hat INSERT
  und UPDATE auf `fuer_follower`.
- **Live-Körper vorher erneut gelesen:** `anonymize_account`,
  `save_free_ride_with_segments` und die vier Views entsprachen dem Stand,
  auf dem die Datei aufbaut.
- **Zurückgerollter Funktionstest vor dem Einspielen** (ganze Migration +
  Prüfungen in einer Transaktion, Abschluss per `raise exception`): anon
  0/0 (Fahrt/Track), Fremder 0/0, Follower 1/1, Besitzer 1; Kudos vom
  Follower angenommen, vom Fremden abgelehnt; Follower kann melden;
  Moderator sieht die Fahrt in keiner View, aber über die RPC (1), der
  Follower über die RPC nicht (0); öffentlich + Follower zugleich wird zu
  öffentlich; keine Fahrt ist zugleich beides.
- **Gemessen danach:** Ledger `0145_fahrten_fuer_follower`, 0 Fahrten mit
  `fuer_follower`, `public_fahrten` führt die Spalte, anon sieht weiter 12
  Fahrten. `gemeldete_fahrten_fuer_moderation`: authenticated ja, anon
  nein; Triggerfunktion für niemanden aufrufbar;
  `fahrt_fuer_follower_sichtbar`: anon ja (gewollt, Views brauchen es).
- **Nebenbefund, nicht von 0145:** ein Moderator trifft mit einem UPDATE
  auf `route_completions` heute **0 Zeilen** (gemessen vor 0145) — RLS gibt
  ihm UPDATE, aber keine SELECT-Policy auf fremde Fahrten, und ohne SELECT
  sieht das UPDATE die Zeile nicht. "Fahrt verbergen" in der Moderation
  meldet deshalb "nichts getroffen". Eigener Fix nötig (SELECT-Policy für
  Moderatoren über `ist_moderator()` oder eine SECURITY-DEFINER-Funktion).
- **Weg zurück:** siehe Kopf der Datei.
- **Bekannte Grenzen (zweites Code-Review, bewusst so ausgeliefert):**
  - *Neu-Einspielen von vorn scheitert an 0134:* dessen Insert-Grant nennt
    `fuer_follower` (#460), die Spalte entsteht erst in 0145. In der
    Produktion war die Reihenfolge richtig (0145 vor 0134 eingespielt); ein
    `supabase db reset` oder ein Branch muss 0145 vor 0134 einspielen. 0134
    ist eingespielt und wird nicht mehr geändert.
  - *Moderation sieht bei gemeldeten Follower-Fahrten nur den Text* (Titel,
    Startort, Strecke, Notiz über `gemeldete_fahrten_fuer_moderation`), die
    Fahrtseite selbst bleibt für Nicht-Follower 404 — Fotos und Karte lassen
    sich also nicht prüfen, verbergen (0148) geht trotzdem.
  - *Streckenfahrten ohne gespeicherten Track* (nur nach einer
    Kontolöschung) verlieren beim Wechsel öffentlich → Follower ihren
    Deckungsgrad (0052, Fall 4) und bleiben privat. Am 2026-09-25 gemessen:
    0 solche Fahrten, und die Konten dazu können sich nicht mehr anmelden.

## Stand 2026-09-25 (abends): 0130–0140

**Eingespielt** (per `apply_migration`, jeweils danach gemessen):

- **0139** RLS aufgeräumt — 0 nackte `auth.uid()`, 0 doppelte permissive
  Policies; anon sieht dieselben Zeilen wie vorher (32 Strecken, Bewertungen,
  0 Fahrten direkt, 4 freigegebene Fahrzeuge).
- **0131** Serverzeit-Plausibilität — beide bestehenden server-Segmente
  bestehen die neue Prüfung (fahrt_pulse_pruefen = NULL).
- **0140** Streckentexte Ächerli/Raten — je genau eine Zeile geändert.
- **0137** GeoJSON vorberechnet — routes_geojson 0.16 ms statt ~50 ms für
  alle öffentlichen Strecken (warm gemessen).
- **0138** strecken_paesse als Tabelle — anon sieht 21 Zuordnungen, wie
  der alte Live-Join.
- **0130** Slugs — **nach 0137** eingespielt; die View-Definition in der
  Datei liest deshalb die 0137-Spalten. 32 öffentliche Strecken mit Slug,
  0 private.
- **0135** premium_gratis_bis() — anon ohne EXECUTE.

**Bewusst noch NICHT eingespielt — erst nach der nächsten Promotion
staging → main**, weil der heute auf app.strado.ch laufende Code sonst
bricht (eine Datenbank für beide):

- **0132** Privatzonen-Radius verbergen — alter Code liest die Spalte auf der
  Einstellungsseite.
- **0133** Gastticket-Bremse — alter Code ruft die Ticket-RPCs für Gäste als
  anon; ohne EXECUTE bräche die Gast-Aufzeichnung.
- **0134** Rechte nachziehen — alter Code liest `is_moderator` direkt;
  Moderation und Staging-Gate wären zu.

## Stand 2026-09-25: 0126–0129 eingespielt, 0115–0122 gemessen

- **0126–0129** am 2026-09-25 per `apply_migration` eingespielt, Ledger-Namen
  = Dateinamen. Danach gemessen: beide `*_foto_im_eigenen_ordner`-Constraints
  validiert; Buckets avatars 4 MB / route-photos 8 MB; 9 von 9 Indizes aus 0128;
  `anonymize_own_account()` ohne EXECUTE für authenticated/anon, service_role
  behält `anonymize_account(uuid)`.
- **0115–0120, 0122** stehen NICHT unter ihrem Dateinamen im Ledger, sind aber
  in der Produktion: am 2026-09-25 an den Objekten geprüft (tempoprofil,
  route_kandidaten_in_box, geometry_uebersicht, fahrt_pulse +
  segment_fenster_*, route_completions_route_zeit_idx, hoehen_quelle,
  fahrt_start_ticket_gehort und dessen Aufruf in save_free_ride_with_segments).
- **0058** bleibt uneingespielt. Es erteilte authenticated den Grant auf
  `anonymize_own_account()` erneut (0058:120) — wer es nachzieht, macht 0129
  rückgängig und muss den revoke danach wiederholen.

## Angewendet: 0123_ranglisten_ohne_abschnitte (gemessen 2026-09-24)

> **Stand am 2026-09-24 korrigiert.** Diese Überschrift sagte bis dahin „Noch
> nicht angewendet". Gemessen am Katalog: die Definition von
> `leaderboard_completions` nennt `parent_completion_id`
> (`pg_get_viewdef('public.leaderboard_completions'::regclass)`), die
> Migration steht also in der Produktion. **Nicht** gemessen sind die
> Aggregatswerte selbst; der Abschnitt darunter beschreibt weiterhin den
> Stand beim Schreiben der Migration.

Ranglisten zählen erkannte Streckenabschnitte nicht mehr als eigene Fahrten.
`leaderboard_completions` bekommt eine angehängte Spalte `ist_abschnitt`, die
drei Aggregate (`leaderboard_user_totals`, `…_klassen_totals`,
`…_typ_totals`) zählen Fahrten, Kilometer und Höhenmeter mit
`filter (where not ist_abschnitt)`; `strecken_count` bleibt ungefiltert.
Entscheid des Eigentümers vom 2026-09-23 (PR #274 hatte ihn offen gelassen).

- **Reihenfolge:** unabhängig vom Code, kein Code liest die neue Spalte.
- **Wirkung am 2026-09-23:** ein Konto mit einem öffentlichen Abschnitt,
  211.1 → 199.6 km und 8 → 7 Fahrten; alle anderen unverändert. Vorher als
  reine Abfrage nachgerechnet, die Aggregat-SQL gegen die Live-Daten geprüft.
- **Prüfung danach** und **Weg zurück:** stehen im Kopf und am Ende der Datei.
- **Grenzfall:** Wer nur einen öffentlichen Abschnitt, aber keine öffentliche
  Elternfahrt hat, steht danach mit 0 Fahrten / 0 km in den Mengenlisten
  (für "Meiste Strecken" zählt er richtig). Heute betrifft das niemanden.

## 0115 — angewendet (gemessen 2026-09-24)

> **Stand am 2026-09-24 korrigiert.** Diese Überschrift sagte bis dahin „noch
> nicht angewendet". Gemessen am Katalog: `route_completions` führt
> `tempoprofil` **und** `hoehen_quelle`. Das musste auch so sein — `staging`
> schreibt beide Spalten längst auf dem normalen Speicherpfad
> (`lib/actions/completions.ts`), wäre die Zeile richtig gewesen, wäre nicht
> der Import kaputt, sondern **jedes Speichern einer Fahrt**. Der Fehler fiel
> beim Review von #362 auf.

`0115_tempoprofil.sql` legt `route_completions.tempoprofil` an ([{km, kmh}],
nur für den Besitzer lesbar, in keiner öffentlichen View) und erweitert
`save_free_ride_with_segments` sowie `anonymize_account` darum. Der Code auf
`staging-tempo-karte` schreibt die Spalte bei jeder neuen Fahrt (frei wie
Strecke) und liest sie auf der Fahrt-Detailseite — **ohne die Migration
schlägt jedes Speichern mit einem Spaltenfehler fehl** (Schritt 5 der
Kernschleife). Reihenfolge: Schema zuerst, Code danach.

Was nach dem Einspielen zu prüfen ist:

- Spalte da? `\d route_completions` zeigt `tempoprofil jsonb`.
- `save_free_ride_with_segments(jsonb, jsonb)`: Grant für `authenticated`,
  **keiner** für `anon` (Falle aus 0047/0048/0091/0097).
- `anonymize_account(uuid)`: nur `service_role`, und der Rumpf nullt
  `tempoprofil` mit.
- `public_fahrten` und `public_fahrt_tracks` führen die Spalte **nicht** —
  beide listen ihre Spalten ausdrücklich auf, ein `select *` gibt es dort
  nicht.
- Funktionaler Test, zurückgerollt: Fahrt speichern, Profil lesen (eigene
  Zeile sichtbar), als `anon` über `public_fahrten` unsichtbar.

## Eingespielt: 0120_hoehen_quelle (2026-09-21, Produktion)

Vom Inhaber eingespielt und gemeldet; der Katalog-Gegen check aus dem
Migrationsheader (Spalte, Check-Constraint, Grants auf
`save_free_ride_with_segments` und `anonymize_account`, Spalte in keiner
öffentlichen View) steht noch aus — von hier aus gibt es keinen
Datenbankzugang, nur das Wort. Wer ihn nachholt, ersetzt diesen Absatz
durch das Gemessene.

## Angewendet: 0121_premium_promo_link (gemessen 2026-09-24)

> **Stand am 2026-09-24 korrigiert.** Diese Überschrift sagte bis dahin „Noch
> nicht angewendet". Gemessen am Katalog: die Tabellen
> `premium_promo_codes` und `premium_gratis` und die Funktion
> `premium_gratis_gueltig` existieren alle drei. **Nicht** gemessen sind die
> Grants und die Funktionsrümpfe — die Prüfliste weiter unten bleibt damit
> offen, nicht erledigt.

Signup-Link mit 7 Tagen Gratis-Premium (`app.strado.ch/registrieren?promo=7-tage-gratis`).
Neue Tabellen `premium_promo_codes` und `premium_gratis`, neue Funktion
`premium_gratis_gueltig(uuid)`, und Erweiterungen von
`handle_new_user()` (0094-Koerper), `apply_subscription_state()` (0110),
`premium_abgleich()` (0110), `saisonpass_erstatten()` (0110) und
`anonymize_account()` (0120).

Vor dem Einspielen den Live-Koerper von `anonymize_account` lesen und
vergleichen (AGENTS.md, "create or replace auf einer Live-Funktion"):
```sql
select prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'anonymize_account';
```

Nach dem Einspielen pruefen:
```sql
select code, tage, aktiv from public.premium_promo_codes;
select has_function_privilege('anon', 'public.premium_gratis_gueltig(uuid)', 'execute') as anon,
       has_function_privilege('authenticated', 'public.premium_gratis_gueltig(uuid)', 'execute') as authenticated,
       has_function_privilege('service_role', 'public.premium_gratis_gueltig(uuid)', 'execute') as service_role;
select position('premium_gratis' in pg_get_functiondef(p.oid)) > 0 as kennt_gratis
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname in
   ('handle_new_user', 'apply_subscription_state', 'premium_abgleich', 'saisonpass_erstatten', 'anonymize_account');
```

## Eingespielt: 0101_anonymisierung_fahrtstarts (2026-09-16, Produktion)

Nacharbeit zur Datenschutzerklärung (`strado`#255 / `stradoinfo`#19) und
zugleich eine echte Lücke: `anonymize_account()` hat `fahrt_starts` nie
angefasst.

**Warum die Fremdschlüssel nicht reichten.** `fahrt_starts.user_id` und
`.eingeloest_von` tragen seit `0096` beide `on delete cascade`. Die Kaskade
feuert nur nie, weil `deleteAccount()` die Zeile in `auth.users` **nicht
löscht**, sondern das Konto anonymisiert und die Zugangsdaten per
`updateUserById()` entwertet. Genau diesen Satz schreiben `0090` und `0092`
bereits in ihre Köpfe; `0096` ist zwei Tage später entstanden und hat ihn
nicht gelesen. Die Folge: `letzter_puls_punkt` — eine GPS-Position aus
derselben Fahrt, deren `route_completions.track` die Funktion zwei
Anweisungen weiter oben ausdrücklich auf NULL setzt — blieb nach einer
Kontolöschung stehen.

**Vorher geprüft.** Der Rumpf wurde aus der Produktionsdatenbank
ausgelesen (`pg_get_functiondef`) und gegen `0092` verglichen: Anweisung für
Anweisung deckungsgleich, keine Abweichung, die ein `create or replace`
still zurückgedreht hätte. Das ist die Lehre aus `0088`/`0090`/`0092`, und
sie gilt hier genauso.

**Danach geprüft, gegen den Katalog:**

```sql
select
  position('delete from public.fahrt_starts' in pg_get_functiondef(p.oid)) > 0 as hat_delete,
  position('eingeloest_von = p_user_id' in pg_get_functiondef(p.oid)) > 0    as beide_spalten,
  position('creator_links' in pg_get_functiondef(p.oid)) > 0                 as rumpf_0092_intakt,
  p.prosecdef, p.proconfig,
  has_function_privilege('anon',          p.oid, 'execute') as anon,
  has_function_privilege('authenticated', p.oid, 'execute') as authenticated,
  has_function_privilege('service_role',  p.oid, 'execute') as service_role
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'anonymize_account';
```

Ergebnis: alle drei `position`-Prüfungen `true`, `prosecdef = true`,
`search_path = public, pg_temp`, und **`anon = false`, `authenticated =
false`, `service_role = true`** — die Rechte, die `0076` gesetzt hat, stehen
unverändert. Die Fallgrube aus `0047`/`0048`/`0091`/`0097` hat hier nicht
zugeschlagen, weil `create or replace` Rechte ohnehin nicht anfasst; die
`revoke`/`grant`-Zeilen am Ende der Datei sind Zusicherung, keine Reparatur.

**Und funktional, zurückgerollt.** Ein `DO`-Block hat zwei Zeilen in
`fahrt_starts` angelegt — eine mit `user_id` (eigenes Ticket), eine mit
`user_id = null` und `eingeloest_von` (Gast, der sich zwischen Start und
Speichern angemeldet hat) —, dann `anonymize_account()` für dieses Konto
aufgerufen und das Ergebnis über `raise exception` zurückgegeben, was
denselben Block zurückrollt. Ergebnis: **0 verbleibende Zeilen** für beide
Fälle, und das Profil war innerhalb des Blocks anonymisiert
(`display_name` von gesetzt auf NULL) — der Beweis, dass wirklich die
Funktion lief und nicht nur das Prädikat. Danach gemessen: 17 aktive
Profile, 17 mit Namen, 7 Fahrten, alle mit Track — nichts zurückgeblieben.

Die beiden Spalten sind bewusst beide im `where`: ein Gast zeichnet ohne
Konto auf (`user_id` NULL) und meldet sich erst beim Speichern an — dann
steht die Person **nur** in `eingeloest_von`. Wer nur über `user_id`
löscht, lässt genau den Fall stehen, für den `0096` die zweite Spalte
eingeführt hat.

**Der Weg zurück**, falls nötig: `0092` erneut anwenden — der Rumpf dort ist
derselbe minus der letzten Anweisung.

**Was diese Migration NICHT löst.** Gast-Zeilen ohne jedes Konto
(`user_id` und `eingeloest_von` beide NULL) hängen an keiner Kontolöschung.
Sie räumt der Lauf in `fahrt_start_anlegen` (`0096`) ab — und der hängt
hinter `random() < 0.02`, läuft also nur, wenn jemand eine Fahrt startet,
und dann in 2 % der Fälle. Eine Frist sichert das nicht zu; die
Datenschutzerklärung sagt deshalb „in der Regel innert 48 Stunden" und
nennt als harte Grenze die **24 Stunden**, nach denen `fahrt_start_puls`
und `fahrt_start_einloesen` die Zeile beide nicht mehr annehmen. Wer daraus
eine echte Frist machen will, braucht einen Cron wie `premium_abgleich()`
(`0059`) — eigene Entscheidung, keine Nacharbeit zu dieser.

## Eingespielt: 0114_oeffentliche_passhoehen (2026-09-19, Produktion)

"Pässe befahren" zählt Passhöhen statt Strecken (Entscheid des Inhabers vom
2026-09-19). Eigenes Profil und Auszeichnungen lesen `meine_paesse()`; für
fremde Profile gibt `oeffentliche_passhoehen(p_user_id)` nur eine Zahl
heraus — über dieselben Fahrten wie `public_fahrten` (WHERE-Bedingung live
gelesen), ohne erkannte Abschnitte, und `NULL`, wenn `zeigt_paesse` aus ist
oder das Konto gelöscht. SECURITY DEFINER mit festem `search_path`, für
`anon` und `authenticated` ausdrücklich gewährt (öffentliche Profile sind
ohne Anmeldung lesbar).

Eingespielt vor dem Code. Geprüft: `anon` darf ausführen, `prosecdef = true`,
ein Konto ohne `zeigt_paesse` liefert `NULL`, alle übrigen 0 (Stand
2026-09-19: noch kein öffentlicher Track über einen der 34 Scheitel).

**Rückweg:** `drop function public.oeffentliche_passhoehen(uuid);`

## Eingespielt: 0113_passsammlung_je_fahrt (2026-09-18, Produktion)

**Eingespielt am 2026-09-18** nach dem Merge von #291, vor der Promotion
nach `main`. Geprüft am Katalog: `meine_passfahrten()` für `anon` nicht
ausführbar, für `authenticated` schon; `meine_paesse()` trägt den Filter
`parent_completion_id`, `anon` weiterhin ohne Recht. Funktional im
zurückgerollten Test als echtes Konto aufgerufen (Aufruf ohne Fehler).

Die Premium-Pass-Sammlung liest seit dem Entscheid des Inhabers vom
2026-09-18 denselben Katalog wie die freie Passsammlung aus `0104`. Dafür
kommt `meine_passfahrten()` hinzu (je eigene Fahrt und berührtem Pass eine
Zeile `pass_id, datum`, SECURITY INVOKER, nur `authenticated`), und
`meine_paesse()` filtert erkannte Abschnitte heraus
(`parent_completion_id is null`) — vorher zählte eine Ausfahrt mit einem
erkannten Passabschnitt als zwei Fahrten. Der Live-Rumpf von
`meine_paesse()` wurde vorher ausgelesen und stimmte mit `0104` überein.

**0113, nicht 0112:** 0112 ist das zurückgezogene
`0112_pass_status_und_alarm` (unten).

**Reihenfolge:** Migration vor dem Code. Ohne `meine_passfahrten()` zeigt die
Premium-Sammlung "liessen sich gerade nicht laden"; die übrige Profilseite
bleibt heil.

**Rückweg:** `drop function public.meine_passfahrten();` und `meine_paesse()`
mit dem Rumpf aus `0104`.

**Nach dem Einspielen prüfen:**

```sql
select has_function_privilege('anon', 'public.meine_passfahrten()', 'execute');          -- false
select has_function_privilege('authenticated', 'public.meine_passfahrten()', 'execute'); -- true
select position('parent_completion_id' in pg_get_functiondef('public.meine_paesse()'::regprocedure)) > 0; -- true
```

## Eingespielt: 0109_profilname_aendern (geschrieben 2026-09-17 als 0103, Produktion 2026-09-18)

**Eingespielt am 2026-09-18** nach dem Merge von #291. Geprüft am Katalog:
`anon = false`, `authenticated = true`, `prosecdef = true`, Index
`profiles_display_name_lower_eindeutig` vorhanden. Funktional in einem
zurückgerollten `DO`-Block als echtes Konto: Name eines anderen Kontos plus
Nullbreite-Leerzeichen → `ungueltig`, plus NBSP → `vergeben`,
Vollbreiten-Buchstaben → normalisiert `ok`, ein Zeichen → `zu_kurz`;
danach keine Testzeile übrig.

Neue Funktion `profilname_aendern(p_name text)`, `SECURITY DEFINER`, nur für
`authenticated` (EXECUTE ausdrücklich von `public` und `anon` entzogen).
Ändert ausschliesslich `display_name` der Zeile von `auth.uid()`, nach den
Regeln von `signUp()` (2–50 Zeichen, case-insensitiv eindeutig). Rein
additiv, kein Eingriff in Tabellen, Policies oder Grants — der Rückweg ist
`drop function public.profilname_aendern(text);` plus
`drop index public.profiles_display_name_lower_eindeutig;`.

**Nummer 0109, nicht 0103.** Geschrieben als 0103; beim Zusammenführen am
2026-09-18 waren 0103 (`amtliche_tempolimits_entlang_schneller`) und 0104
(`paesse`) in Produktion vergeben, 0105 doppelt. 0109 war auf keinem
Remote-Branch belegt (`git ls-tree` über alle, 2026-09-18).

**Nach dem Review gehärtet (2026-09-18):** NFKC-Normalisierung und
Leerraum-Zusammenfassung vor jeder Prüfung, Steuer- und unsichtbare
Formatzeichen werden mit `ungueltig` abgewiesen (vorher galt "Jan" +
Nullbreite-Leerzeichen als freier Name), und ein partieller Unique-Index
`profiles_display_name_lower_eindeutig` auf `lower(display_name)` macht
die Eindeutigkeit gegen gleichzeitige Umbenennungen und gegen
`handle_new_user` verbindlich. Vorher gemessen: 15 Profile, keine
Dublette; gelöschte Konten tragen `display_name = null` und fallen heraus.

**Reihenfolge:** Migration zuerst, dann der Code (`staging-profilname-aendern`).
Ohne die Funktion zeigt das Formular in den Einstellungen eine allgemeine
Fehlermeldung, stürzt aber nicht ab.

**Nach dem Einspielen prüfen:**

```sql
select has_function_privilege('anon', 'public.profilname_aendern(text)', 'execute');          -- false
select has_function_privilege('authenticated', 'public.profilname_aendern(text)', 'execute'); -- true
```

## Eingespielt: 0105_tempolimits_quellen_amtlich (2026-09-18, Produktion)

Spalte `amtlich` an `amtliche_tempolimit_quellen` (Vorgabe true) und
`amtliche_tempolimits_entlang()` gibt sie mit zurück. Nötig, weil seither
zwei Quellen dabei sind, die keine amtliche Signalisationsangabe sind:
OpenStreetMap (deckt als einzige Wallis, Tessin, Waadt und das Berner
Oberland ab) und der Bündner Lärmkataster (Feld heisst nur `speed_2019`).

Der Rückgabetyp ändert sich, deshalb `drop` + `create` statt
`create or replace`; die Rechte werden danach neu gesetzt, weil ein Drop sie
mitnimmt. Gemessen danach: `anon` darf nicht ausführen, `authenticated` schon.

**0105, nicht 0104** — und damit doppelt: 0104 war für PR #281 gedacht,
wurde aber am selben Tag von `0104_paesse` belegt, und `0105_strecken_verkehr`
ging ebenfalls am 2026-09-18 ein. Beide 0105er sind eingespielt; siehe
"Doppelte Nummernpräfixe". PR #281 ist auf `0109` ausgewichen.

**Daten am 2026-09-18 nachgeladen:** acht weitere amtliche Quellen, vor allem
Lärmkataster, die die signalisierte Geschwindigkeit als Modelleingang führen
und oft auch Gemeindestrassen abdecken — SG (18 842, inkl. Gemeindestrassen
und Stadt St. Gallen), GR-Lärmkataster (15 719, nicht als amtlich
ausgewiesen), TG (4 969), LU (4 115), UR (501), dazu Emmen (1 069),
Winterthur (154) und BL (289) als Zonen. Bestand danach: 27 Quellen,
67 712 Objekte, 0 ungültige Geometrien.

## Eingespielt: 0102 und 0103 (amtliche Tempolimits, 2026-09-17, Produktion)

| Datei | Ledger | Was |
| --- | --- | --- |
| `0102_amtliche_tempolimits` | `20260917163713` | Tabellen `amtliche_tempolimit_quellen` / `amtliche_tempolimits` (LV95, GiST), Reparatur-Trigger für Flächen, `amtliche_tempolimits_entlang(jsonb)` |
| `0103_amtliche_tempolimits_entlang_schneller` | `20260917165008` | dieselbe Funktion, Puffer per ST_Subdivide zerlegt |

**0102, nicht 0101:** `0101_anonymisierung_fahrtstarts` lag beim Schreiben auf
einem offenen Branch und ist inzwischen eingespielt.

**Nummernkollision 0103:** `staging-profilname-aendern` (PR #281) trägt ebenfalls
`0103_profilname_aendern.sql`, noch nicht eingespielt. Die eingespielte Nummer
gilt; jene Datei heisst inzwischen `0109_profilname_aendern.sql` (0104 war
bis dahin von `0104_paesse` belegt).

**Eingespielt vor dem Code**, wie vorgesehen: ohne die Funktion würde
`proposeRoute()` bei jedem Vorschlag einen Fehler loggen (und die
Kartendaten nehmen).

**Warum 0103 am selben Tag folgte:** 0102 brauchte für den Zürichsee Run
(65 km) 14,8 s — über dem Statement-Timeout von `authenticated`, lange
Strecken wären still ohne amtliche Werte geblieben. Mit 0103 gemessen: alle
26 freigegebenen Strecken zwischen 54 und 809 ms, über die echte Funktion
plus `lib/tempolimitAbgleich.ts`, Ergebnis je Strecke identisch mit dem
Offline-Abgleich des Skripts.

**Befüllt** am 2026-09-17 mit
`node --env-file=.env.local --no-warnings scripts/enrich-amtliche-tempolimits.mjs --hochladen`:
19 Quellen, 22 054 Objekte, 0 ungültige Geometrien. Zwei Lehren aus dem Lauf,
beide im Skript behoben: Genfer Flächen in Stapeln von 1000 rissen das
Statement-Timeout (jetzt 50 Zeilen / 200 kB für Zonen), und 310 Linien aus
Bern, Freiburg und Zürich fielen nach dem Runden auf 10 cm auf einen Punkt
zusammen (jetzt werden doppelte Punkte entfernt).

**Gemessen** gegen die Objekte, nicht gegen das Ledger:

```sql
-- anon/authenticated: nur SELECT; Funktion: authenticated ja, anon nein
select grantee, privilege_type from information_schema.role_table_grants
 where table_name in ('amtliche_tempolimits', 'amtliche_tempolimit_quellen') order by 1, 2;
select has_function_privilege('anon', 'public.amtliche_tempolimits_entlang(jsonb)', 'execute');
select id, anzahl, geladen_am from public.amtliche_tempolimit_quellen order by id;
```

Ergebnis: SELECT für beide Rollen, sonst nichts; RLS auf beiden Tabellen an;
`anon` darf die Funktion nicht ausführen, `authenticated` schon.

**Eingespielt am 2026-09-17:** `supabase/seed/0013_tempolimits_amtlich_schweiz.sql`,
19 UPDATEs in einer Transaktion. Danach gemessen: 19 von 28 Strecken tragen
amtliche Abschnitte, Anteil je Strecke identisch mit dem Abgleich vorher
(Albis Loop, Albulapass, Greifensee, Hirzel 100 %; Ibergeregg, Oberalp, Ofen,
San Bernardino 99 %; Flüela 96 %; Zürichsee Run 93 %; Bernina 89 %; Klausen
78 %; Zürichberg 71 %; Furka 54 %; Lukmanier 50 %; Susten 38 %; Jaun 26 %;
Glaubenbielen 14 %; Gotthard 1 %). Ohne amtliche Daten bleiben Julier,
Grimsel, Nufenen, Simplon, Grosser St. Bernhard, Col des Mosses und
Col de la Croix — dort veröffentlicht der Kanton nichts.

**Der Weg zurück** ist eine Sicherung der vorherigen Werte; sie lagen vor dem
Einspielen alle auf Kartendaten (kein einziges `amtlich: true`). Die Datei
lässt sich jederzeit neu erzeugen (`--live`) — die Streckenliste wächst
gerade schnell, also vor einem erneuten Einspielen neu erzeugen.

## Eingespielt: 0106_startzeiten_schwelle_je_fach (2026-09-18, Produktion)

Nacharbeit zu `0105` und `0104`, aus der Review desselben Zweigs. Beide
Befunde betreffen bereits eingespielte Objekte, deshalb eine eigene Datei.

- **Die Schwelle in `strecken_startzeiten` zählte die falsche Menge.** `0105`
  gibt erst ab 20 Starts etwas heraus und begründet das damit, dass "33 %
  Sonntagmorgen" bei drei Starts ein Satz über eine Person wäre. Geprüft wurde
  aber die Gesamtzahl, und die Ausgabe hat 7 × 4 = 28 Fächer: bei n = 20 wurde
  ein Fach mit **einem** Start als "5 %" ausgeliefert, und weil jeder Wert ein
  Vielfaches von 5 ist, ist der Nenner ablesbar. `fahrt_starts` enthält auch
  Starts ohne veröffentlichte Fahrt, und die Funktion ist an `anon` vergeben —
  derselbe Mechanismus wie in `0094`. Jetzt gilt zusätzlich `having count(*) >= 5`
  je Fach; Fächer darunter fallen weg, statt gerundet zu werden.
- **`pg_temp` fehlte im `search_path` von `count_unseen_activity` und
  `mark_activity_seen`.** Aus `0100` geerbt und in `0104` mitgenommen. Beide
  Rümpfe sind unverändert, nur der `search_path` ist ergänzt.

Am Katalog geprüft: alle drei Funktionen tragen `search_path=public, pg_temp`,
`strecken_startzeiten` enthält `having count(*) >= 5`, die Grants sind
unverändert (`anon` nur auf `strecken_startzeiten`).

**Rückweg:** die drei Funktionen aus `0104`/`0105` erneut anlegen — sie sind
dort vollständig ausgeschrieben.

## Eingespielt: 0107 und 0108 (Suchbegriffe, 2026-09-18, Produktion)

Beides Datenänderungen am Passkatalog, ausgelöst vom **ersten Probelauf gegen
den echten Feed** (13.7 MB, 890 Situationen, mit dem Schlüssel des Eigentümers).

`0104` hatte die Suchbegriffe geschätzt. Der Feed schreibt Pässe aber anders,
nämlich mit Gattungswort und Bindestrich — "zwischen Pass Gotthard-Pass und
Ortschaft Motto Bartola", französisch "Col Col du St-Gothard". Die Form
"Gotthardpass" kommt in der ganzen Lieferung nicht vor.

Umgekehrt haben die kurzen Formen **drei falsche Treffer** erzeugt, weil
Passnamen in der Schweiz auch Dörfer und Strassen sind:

| Meldung | Fälschlich erkannt als |
| --- | --- |
| "A9 Sion ↔ Brig zwischen Anschluss **Leuk/Susten**-Ost …" | Sustenpass |
| "Route de la Lienne ↔ **Route Du Simplon** …" | Simplonpass |
| "A9 Brig ↔ Domodossola … Ortschaft **Simplon-Dorf** …" | Simplonpass |

`0107` ersetzt deshalb alle Begriffslisten durch die Schreibweisen des Feeds
(Bindestrichform, französische und italienische Fassung) und nimmt die blossen
Ortsnamen heraus. `0108` nimmt zusätzlich "Panoramastrasse" beim Glaubenbielen
weg: die Baustellenmeldung am Jaunpass heisst wörtlich "Instandsetzung
Panoramastrasse Jaunpass", und der 80 km entfernte Glaubenbielen stand damit
auf "eingeschränkt".

Dazu kommt die Kontextregel in `lib/passMeldungen.ts` (kein Schemateil): ein
Begriff ohne eigenes Gattungswort zählt nur, wenn unmittelbar davor
"Pass"/"Col"/"Passo" steht.

### Gegen die echte Lieferung gemessen

| | vorher | nachher |
| --- | --- | --- |
| Treffer insgesamt | 4 | 5 |
| davon falsch | 3 | **0** |
| Situationen, deren erster Text ein Aufzählungswert war | 523 | **0** |

Die fünf verbliebenen Treffer sind vier Baustellenmeldungen an der
Gotthard-Passstrasse und eine am Jaunpass, alle als "eingeschränkt" gedeutet —
was sie auch sind. Die Gegenprobe mit erfundenen, aber echt geformten
Meldungen trifft weiterhin: "Pass Gotthard-Pass … gesperrt",
"Sustenpass: Wintersperre", "Col du Grimsel … route fermée".

**Rückweg:** `0104` enthält die ursprünglichen Begriffslisten im Wortlaut.

## Eingespielt: 0104_paesse und 0105_strecken_verkehr (2026-09-18, Produktion)

Beide am 2026-09-18 über `apply_migration` eingespielt, **vor** dem Merge des
Codes — die Reihenfolge, die AGENTS.md verlangt (Schema zuerst).

| Datei | Was |
| --- | --- |
| `0104_paesse` | `paesse` (Katalog, 34 Zeilen), View `strecken_paesse` (security_invoker), `pass_status`, `pass_ereignisse`, `verkehrsmeldungen`, `feed_abgleich`, `pass_sperrtage` (4 Zeilen), `pass_folgen`, Spalte `profiles.paesse_gesehen_am`, Funktionen `pass_status_anwenden/-setzen/-freigeben`, `pass_ereignis_meldenswert`, `recent_pass_meldungen`, `meine_paesse`; Ersatz von `count_unseen_activity`, `mark_activity_seen` und `anonymize_account` auf den **live gelesenen** Rümpfen |
| `0105_strecken_verkehr` | `strecken_verkehr`, `strecken_verkehr_stand`, `strecken_startzeiten(uuid)` |

### Beim ersten Versuch gescheitert, und woran

`quelle_url text check (quelle_url ~ '^https://[^[:space:]]{4,500}$')` bricht
schon beim Anlegen der Tabelle ab: **PostgreSQL lässt in einem regulären
Ausdruck höchstens 255 Wiederholungen zu** (`invalid repetition count(s)`).
Die ganze Migration lief in einer Transaktion, es blieb also nichts halb
angelegt. Die Längengrenze steht jetzt als eigene Bedingung neben dem
Ausdruck. Wer hier eine Obergrenze braucht: `char_length(...) <= n`, nie
`{m,n}` mit n über 255.

### Nachher am Katalog geprüft (nicht am Ledger)

- **Die Grant-Falle hat nicht zugeschlagen** (sie hat `0047`, `0048`, `0091`
  und `0097` erwischt): `has_function_privilege('anon', …, 'execute')` ist bei
  `pass_status_anwenden`, `pass_status_setzen`, `pass_status_freigeben`,
  `recent_pass_meldungen` und `meine_paesse` **false**. Bewusst `true` ist es
  bei `pass_ereignis_meldenswert` (reines Prädikat ohne Datenzugriff) und bei
  `strecken_startzeiten` (die öffentliche Seite fragt sie; sie gibt erst ab
  20 Starts etwas heraus, und dann nur Prozente über grobe Fächer).
- `pass_status_anwenden` ist nur an `service_role` vergeben — der Cron.
- RLS ist auf allen neun neuen Tabellen an. `verkehrsmeldungen` hat bewusst
  **keine** Policy und keine Grants (nur `service_role`), wie `fahrt_starts`
  und `stripe_webhook_events`; der Advisor meldet das als INFO.
- `strecken_paesse` taucht **nicht** unter `security_definer_view` auf —
  `security_invoker = true` ist angekommen. Private und noch nicht
  freigegebene Strecken bleiben damit hinter der RLS von `routes`.
- `feed_abgleich`: Grants nur auf `(quelle, erfolg_am)`; Fehlertexte sind für
  `anon`/`authenticated` nicht lesbar.
- **Die Zuordnung Strecke ↔ Pass stimmt an den Objekten**: 21 der 34 Pässe
  haben genau eine Strecke, jede die richtige (Susten → „Sustenpass",
  Gotthard → „Gotthardpass (Tremola)"), und keine der Zürcher Runden hat
  fälschlich einen Pass gefunden. 400 m Toleranz, gemessen an echten Daten.
- `add column paesse_gesehen_am … default now()` ist wie in `0100` billig
  (`now()` ist stabil → `attmissingval`, keine Tabellenumschreibung); alle
  14 Profile teilen sich denselben Zeitstempel, genau die Absicht.

### Funktionstest (zurückgerollte Transaktion, Produktion)

Ein `DO`-Block, dessen Ergebnis über `raise exception` zurückkam und damit
denselben Block zurückrollte (Muster aus `0098`). Geprüft am Susten:

| Schritt | Erwartet | Gemessen |
| --- | --- | --- |
| Feed meldet Wintersperre | Status entsteht, Ereignis wird geschrieben | `true` |
| Derselbe Zustand nochmals | kein zweites Ereignis, `seit` bleibt stehen | `false`, `seit` unverändert |
| Pass geht auf | Ereignis mit `vorher = 'wintersperre'`, meldenswert | `true`, `vorher = wintersperre`, meldenswert `true` |
| Moderation übersteuert, dann schreibt der Feed | Feed prallt ab | `false`, Zustand blieb `gesperrt`/`moderation` |

Danach gemessen: `pass_status`, `pass_ereignisse`, `pass_folgen`,
`verkehrsmeldungen` und `strecken_verkehr` sind leer, `paesse` hat 34 Zeilen,
`pass_sperrtage` die vier gesetzten — der Rollback hat gegriffen.

### Was das noch nicht misst

Der Feed selbst. Ohne `ASTRA_API_KEY` in der Umgebung meldet
`app/api/cron/passstatus` „übersprungen" und schreibt nichts; jeder Pass
bleibt auf „kein Stand", bis ihn ein Moderator setzt. Die Zuordnung von
Meldungstexten zu Pässen ist gegen erfundene DATEX-Lieferungen getestet
(`lib/passMeldungen.test.ts`), **nicht** gegen echte — das geht erst mit
Schlüssel.

## 0110_saisonpass — vollständig angewendet am 2026-09-18

> Eingespielt in vier Schritten (Ledger `0110_saisonpass_tabelle`,
> `0110_saisonpass_funktionen`, `0110_saisonpass_rechte_entziehen`,
> `0110_saisonpass_projektion`). Danach gemessen:
>
> - `apply_subscription_state` und `premium_abgleich` rechnen über
>   `saisonpass_gueltig()`; `anonymize_account` löscht die Pässe **und** trägt
>   weiterhin die Ergänzungen aus `0101` (`fahrt_starts`) und der
>   Pässe-Migration (`pass_folgen`).
> - Alle sechs Funktionen: `anon` = false, `authenticated` = false,
>   `service_role` = true.
> - `saisonpaesse`: RLS an, eine Select-Policy, Spalten-Grants ohne die
>   Stripe-Kennungen.
>
> **Funktionaler Test, zurückgerollt** (`DO`-Block mit `raise exception` am
> Ende, Muster aus `0098`): erster Kauf legt an und setzt `ist_premium`;
> **dieselbe Checkout-Session ein zweites Mal ändert nichts** (eine Zeile —
> Webhook und Browser bestätigen beide); Laufzeit sechs Monate; ein zweiter
> Pass beginnt exakt am `gueltig_bis` des ersten (Anschluss, keine
> verschluckte Zeit); nach künstlichem Ablauf nimmt `premium_abgleich()` die
> Person in die Ergebnisliste und `ist_premium` fällt auf false. Danach
> geprüft: `saisonpaesse` leer, kein Testkunde am Profil, Zahl der
> Premium-Konten unverändert.
>
> Zwei Lehren, die jede künftige Migration angehen:
>
> 1. **Der Live-Körper von `anonymize_account` war nicht der aus `0092`.** Er
>    trug bereits `0101` und die Pässe-Migration. Die Datei wurde vor dem
>    Einspielen auf den Live-Stand gehoben; ein `create or replace` auf dem
>    `0092`-Körper hätte beide still zurückgedreht. Genau dafür steht die
>    `prosrc`-Abfrage im Kopf dieser Datei.
> 2. **Neue Funktionen bekommen von Supabase automatisch `EXECUTE` für
>    `anon` und `authenticated`.** Weil die Datei in Teilen eingespielt wurde
>    und die `revoke`-Zeilen im letzten Teil standen, waren
>    `apply_saisonpass` und `saisonpass_erstatten` einige Minuten lang über
>    den anonymen Schlüssel aufrufbar — die Falle aus `0047`, `0048`, `0091`,
>    `0097`, diesmal durch die Stückelung. **Wer eine Migration in Teilen
>    einspielt, nimmt die Rechte in denselben Teil wie die Funktion oder
>    misst sie unmittelbar danach nach.**

### Ursprüngliche Beschreibung

Der Saisonpass: Premium für sechs Monate, einmal bezahlt, ohne Verlängerung
(`docs/premium-neu/preise.md`). Liegt auf dem Zweig `staging-premium-neu` und
ist **nicht eingespielt**.

Was sie anlegt und ändert:

| Objekt | Was |
| --- | --- |
| `saisonpaesse` | eine Zeile je Kauf: Stripe-Kennungen, Betrag, Währung, `gueltig_ab`/`gueltig_bis`, `erstattet_am`. RLS an, `select` für die eigene Zeile und nur auf den Spalten ohne Stripe-Kennungen (Muster aus `0063`), kein Schreibrecht für `authenticated` |
| `saisonpass_gueltig(uuid)` | die einzige Definition, wann ein Pass Premium gewährt |
| `apply_saisonpass(...)` | trägt einen bezahlten Pass ein; idempotent je Checkout-Session, serialisiert je Nutzer über denselben Advisory-Lock wie `apply_subscription_state`, hängt einen zweiten Pass an das Ende des laufenden |
| `saisonpass_erstatten(text)` | nimmt einen vollständig erstatteten Pass zurück und zieht die Projektion nach |
| `apply_subscription_state` | **ersetzt** (`create or replace`), Rumpf aus `0062` mit genau einer Änderung: `profiles.ist_premium` ist ab jetzt "Abo läuft ODER Pass gültig" |
| `premium_abgleich()` | **ersetzt**, Rumpf aus `0059`, Soll-Menge über Abos UND Pässe (ein Pass löst an seinem Ende kein Stripe-Ereignis aus), anonymisierte Profile ausgenommen |
| `anonymize_account(uuid)` | **ersetzt**, Rumpf aus `0092` plus `delete from saisonpaesse` |

**Reihenfolge: Schema zuerst, Code danach.** `getPremiumStatus()` liest
`saisonpaesse` auf jeder Seite, die Premium kennt, und `lib/actions/billing.ts`
ruft `apply_saisonpass` nach der Zahlung. Ohne die Migration schlägt der
Statusabruf fehl, und — teurer — ein bezahlter Pass liesse sich nicht
eintragen.

**Vor dem Einspielen** die Live-Rümpfe der drei ersetzten Funktionen auslesen
und gegen `0062`/`0059`/`0092` vergleichen (die Lehre aus `0088`/`0090`):

```sql
select pg_get_functiondef(p.oid)
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('apply_subscription_state', 'premium_abgleich', 'anonymize_account');
```

Weicht einer ab, hat ein anderer Zweig ihn inzwischen angefasst — dann die
Änderung auf den neuen Rumpf setzen, statt die Datei wie sie ist einzuspielen.
**Bekannte Berührung:** `0101_anonymisierung_fahrtstarts` (PR #255) sitzt
ebenfalls auf `anonymize_account`. Wer zuletzt einspielt, muss beide Zusätze
im Rumpf haben — sonst dreht der zweite den ersten still zurück. Ist `0101`
schon drin, gehört dessen `delete from fahrt_starts …` in diese Fassung
übernommen, bevor sie läuft.

**Danach prüfen** — die Grant-Falle zuerst (`0047`, `0048`, `0091`, `0097`):

```sql
-- Erwartet: alle drei neuen Funktionen anon=false, authenticated=false.
select p.proname,
       has_function_privilege('anon', p.oid, 'EXECUTE') as anon,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') as authed
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('saisonpass_gueltig', 'apply_saisonpass', 'saisonpass_erstatten');

-- Erwartet: SELECT nur für authenticated und nur auf den acht freigegebenen
-- Spalten; kein INSERT/UPDATE/DELETE für anon oder authenticated.
select grantee, privilege_type, column_name
from information_schema.column_privileges
where table_schema = 'public' and table_name = 'saisonpaesse'
order by grantee, column_name;

-- Erwartet: RLS an, genau eine Policy (select, authenticated).
select relrowsecurity from pg_class where relname = 'saisonpaesse';
select polname, polcmd, polroles::regrole[] from pg_policy
where polrelid = 'public.saisonpaesse'::regclass;
```

**Funktionaler Test, zurückgerollt** (im `DO`-Block mit `raise exception` am
Ende, wie bei `0098`):

1. `apply_saisonpass` mit der Kunden-Kennung eines Testkontos aufrufen →
   `true`, eine Zeile, `profiles.ist_premium = true`.
2. Denselben Aufruf mit derselben Session-ID wiederholen → `true`, weiterhin
   **eine** Zeile (Idempotenz — Webhook und Browser bestätigen beide).
3. Zweiter Aufruf mit anderer Session-ID → `gueltig_ab` der neuen Zeile
   gleich `gueltig_bis` der ersten (Anschluss, keine verschluckte Zeit).
4. `apply_subscription_state` mit einem beendeten Abo (`status = 'canceled'`)
   → `ist_premium` bleibt `true`, solange ein Pass gilt. Das ist die eine
   Zeile, die `0110` an `0062` ändert.
5. `gueltig_bis` einer Zeile in die Vergangenheit setzen, `premium_abgleich()`
   → die Person kommt in der Ergebnisliste vor, `ist_premium` ist `false`.
6. `saisonpass_erstatten` mit der PaymentIntent-Kennung → `erstattet_am`
   gesetzt, `ist_premium` `false` (sofern kein Abo läuft).

**Der Weg zurück:** die drei Funktionen auf die Rümpfe aus `0062`/`0059`/`0092`
zurücksetzen und `saisonpass_gueltig`/`apply_saisonpass`/`saisonpass_erstatten`
droppen. Die Tabelle bleibt stehen — solange ein verkaufter Pass läuft, ist
sie der Beleg dafür, und ein Drop wäre der Verlust des Zugangs, den jemand
bezahlt hat.

## 0112_pass_status_und_alarm — zurückgezogen, nie eingespielt

> **Die Datei ist aus dem Zweig entfernt (2026-09-18), und das ist kein
> Versehen.** Sie hätte `public.pass_status` angelegt — eine Tabelle, die seit
> dem 2026-09-17 in der Produktion steht, aus einem parallelen Zweig, mit
> einem anderen Schlüssel (`pass_id` text statt `route_id`) und in einem
> grösseren System: `paesse` führt den Pass als eigenes Objekt mit Höhe,
> Kantonen, Scheitelpunkt und Wintersperre, dazu `pass_ereignisse`,
> `pass_sperrtage`, `pass_folgen` (die Abos) und `strecken_paesse` (die
> Zuordnung zur Strecke). `count_unseen_activity`, `mark_activity_seen` und
> `anonymize_account` sind dort bereits erweitert.
>
> Eingespielt hätte `0112` also erstens auf dem Tabellennamen abgebrochen und
> zweitens — über `create or replace` — den Pass-Summanden des anderen Zweigs
> aus dem Aktivitäts-Abzeichen entfernt. Zwei Systeme für dieselbe Frage
> ("ist der Pass offen?") wären ausserdem zwei Wahrheiten.
>
> Entscheid des Eigentümers am 2026-09-18: **das Live-System gilt**, unsere
> Fassung wird zurückgezogen. Mit ihr ging der zugehörige Code
> (`lib/passStatus*`, `lib/actions/passAlarm.ts`, die drei
> `PassStatus*`/`PassAlarm*`-Komponenten, die Erweiterung von
> `lib/actions/moderation.ts` und der Aktivitätsliste). Was bleibt: die
> TCS-Adresse in `lib/constants.ts` und die Pass-Sammlung, die ohne eigenes
> Schema auskommt.

## 0111_wartungsheft — angewendet am 2026-09-18

> Vollständig eingespielt (Ledger `0111_wartungsheft_eintraege`,
> `0111_wartungsheft_erinnerungen`). Gemessen danach: beide Tabellen mit RLS
> und je vier Policies, Tabellenrechte für `authenticated` nur `SELECT` und
> `DELETE` (Schreiben läuft über die Spalten-Grants), `anon` hat nichts, und
> `wartungseintraege_obergrenze()` ist für `anon` wie `authenticated` nicht
> ausführbar. Der zusätzliche Unique-Index auf `vehicles (id, user_id)` ist
> da; `vehicles` hatte ihn vorher nicht.

### Ursprüngliche Beschreibung

`0111_wartungsheft.sql` liegt auf `staging-premium-wartungsheft` und ist
**nicht angewendet**. Die Nummer `0111` ist vom Koordinator dieses
Premium-Ausbaus reserviert (0110–0112 für drei parallele Zweige); `0101`–`0109`
gehören zu Zweigen, die dieses Verzeichnis noch nicht sieht — wer vor dem
Einspielen prüft, prüft gegen die offenen PRs, nicht gegen diesen Baum
(`scripts/check-migration-prefixes.mjs` sieht nur einen Zweig).

**Was sie anlegt.** Zwei private Tabellen, `wartungseintraege` (Serviceheft
pro Fahrzeug: Art, Datum, optional Kilometerstand, Kosten, Notiz) und
`wartungserinnerungen` (höchstens eine Zeile pro Fahrzeug: MFK-Termin,
Serviceintervall in km und/oder Monaten), dazu einen Unique-Constraint
`vehicles_id_user_id_key` auf `public.vehicles (id, user_id)` als Ziel der
zusammengesetzten Fremdschlüssel und eine Trigger-Funktion
`wartungseintraege_obergrenze()` (höchstens 1000 Einträge je Fahrzeug).

**Rein additiv.** Nichts Bestehendes ändert sein Verhalten; der einzige
Eingriff an einer bestehenden Tabelle ist der zusätzliche Unique-Index auf
`vehicles`, fachlich redundant zum Primärschlüssel. Er nimmt kurz
`ACCESS EXCLUSIVE` — deshalb steht ein `set local lock_timeout = '5s'` am
Anfang der Datei; scheitert sie daran, lieber gleich noch einmal, als die
Tabelle zu stauen (dieselbe Überlegung wie bei `0095`).

**Reihenfolge: Schema zuerst, Code danach.** `lib/wartungsdaten.ts` wirft bei
einem Abfragefehler (`lib/queryError.ts`), statt ihn als leeres Wartungsheft
auszugeben — ohne die Migration antwortet `app/profil/fahrzeuge/[id]` also mit
einer Fehlerseite, und `/profil` ebenfalls, sobald das Konto Premium hat
(`getWartungsHinweise`). Also nicht mergen, bevor die Migration steht.

### Vor dem Einspielen prüfen

```sql
-- Sind die Namen frei? Erwartet: 0 Zeilen.
select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('wartungseintraege', 'wartungserinnerungen', 'vehicles_id_user_id_key');

-- Wie viele Fahrzeuge trägt die Tabelle, die den Index bekommt?
select count(*) from public.vehicles;
```

### Nach dem Einspielen prüfen — an den Objekten, nicht am Ledger

```sql
-- 1. Die Grant-Falle (0047/0048/0091/0097): anon darf NICHTS.
--    Erwartet: nur 'authenticated'-Zeilen, kein 'anon'.
select grantee, privilege_type, table_name
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in ('wartungseintraege', 'wartungserinnerungen')
order by table_name, grantee, privilege_type;

-- 2. Spalten-Grants: INSERT ohne id/created_at, UPDATE ohne
--    fahrzeug_id/user_id.
select table_name, column_name, privilege_type, grantee
from information_schema.column_privileges
where table_schema = 'public'
  and table_name in ('wartungseintraege', 'wartungserinnerungen')
order by table_name, privilege_type, column_name;

-- 3. RLS an, acht Policies (je Tabelle: select, insert, update, delete),
--    und die Premium-Bedingung genau in insert und update.
select tablename, policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('wartungseintraege', 'wartungserinnerungen')
order by tablename, cmd;

select relname, relrowsecurity from pg_class
where relname in ('wartungseintraege', 'wartungserinnerungen');

-- 4. Kein anon-Recht auf die Trigger-Funktion.
select has_function_privilege('anon', 'public.wartungseintraege_obergrenze()', 'EXECUTE') as anon,
       has_function_privilege('authenticated', 'public.wartungseintraege_obergrenze()', 'EXECUTE') as auth;

-- 5. Die Fremdschlüssel zeigen auf das PAAR, mit Kaskade.
select conname, pg_get_constraintdef(oid)
from pg_constraint
where conrelid in ('public.wartungseintraege'::regclass, 'public.wartungserinnerungen'::regclass)
order by conname;

-- 6. Die Indizes stehen (der erste deckt auch den Fremdschlüssel).
select indexname, indexdef from pg_indexes
where schemaname = 'public'
  and tablename in ('wartungseintraege', 'wartungserinnerungen', 'vehicles')
order by tablename, indexname;
```

**Funktionaler Test, zurückgerollt** (`DO`-Block, Ergebnis über
`raise exception` zurücklesen — dieselbe Form wie bei `0098`; die Ausnahme
rollt den Block zurück, es bleibt nichts stehen). Drei Punkte sind es wert:

1. Ein Eintrag mit **fremder** `fahrzeug_id` und eigener `user_id` muss am
   Fremdschlüssel scheitern (`wartungseintraege_fahrzeug_fkey`) — das ist die
   Eigentumsklammer, und sie soll auch dann halten, wenn eine Policy je
   gelockert wird.
2. Ein Konto **ohne** `ist_premium` darf nicht einfügen (Policy), aber seine
   vorhandenen Zeilen lesen und löschen. Das ist die Zusage in der
   Oberfläche: nach dem Abo-Ende bleiben die Daten der Person.
3. `delete from public.vehicles where id = …` muss beide Tabellen mitnehmen
   (Kaskade). Damit ist auch die Kontolöschung abgedeckt, denn
   `anonymize_account()` (Rumpf in `0092`) löscht genau diese Zeilen —
   **die Funktion wird von 0111 absichtlich nicht angefasst**.

### Rückweg

```sql
-- Code zuerst zurücknehmen, dann:
drop function if exists public.meine_paesse();
drop function if exists public.recent_pass_meldungen();
drop function if exists public.pass_status_freigeben(text);
drop function if exists public.pass_status_setzen(text, text, text, timestamptz);
drop function if exists public.pass_status_anwenden(text, text, text, text, timestamptz);
drop function if exists public.strecken_startzeiten(uuid);
drop table if exists public.strecken_verkehr, public.strecken_verkehr_stand;
drop table if exists public.pass_folgen, public.pass_sperrtage, public.verkehrsmeldungen,
                     public.feed_abgleich, public.pass_ereignisse, public.pass_status;
drop view if exists public.strecken_paesse;
drop table if exists public.paesse;
drop function if exists public.pass_ereignis_meldenswert(text, text);
alter table public.profiles drop column if exists paesse_gesehen_am;
```

`count_unseen_activity()`, `mark_activity_seen()` und `anonymize_account()`
müssen danach **auf die Rümpfe vor 0104 zurückgesetzt** werden (aus `0100`
bzw. `0101`), sonst greifen sie auf gelöschte Tabellen und Spalten zu. Der
Rückweg ist damit nicht „drop und fertig": diese drei zuerst zurückschreiben,
dann die Drops.

drop table if exists public.wartungserinnerungen;
drop table if exists public.wartungseintraege;
drop function if exists public.wartungseintraege_obergrenze();
alter table public.vehicles drop constraint if exists vehicles_id_user_id_key;
```

Verliert alle Wartungsdaten unwiderruflich. Sobald Premium-Konten Einträge
haben, ist der Rückweg ein Datenverlust und kein Rollback — vorher
exportieren.

## Eingespielt: 0096–0098 (Fahrtstart serverseitig, 2026-09-15, Produktion)

| Datei | Was |
| --- | --- |
| `0096_fahrtstart_serverseitig` | `fahrt_starts`, `fahrt_start_anlegen()`, `fahrt_start_einloesen()`, Trigger `enforce_route_completion_dauer`, Spalten `dauer_quelle`/`dauer_trail_sekunden`/`fahrt_start_id`, `route_leaderboard` auf `dauer_quelle = 'server'` verengt |
| `0097_fahrtstart_einloesen_nur_angemeldet` | **Nacharbeit:** `revoke execute … from anon`, `auth.uid()`-Pflicht, fremde angemeldete Tickets gesperrt |
| `0098_fahrtstart_puls` | **Nacharbeit:** `fahrt_start_puls()`, Spalten `letzter_puls_am`/`letzter_puls_punkt`/`puls_anzahl`; gewertete Dauer = letzter Puls − Start; Trigger verlangt letzten Puls ≤ 500 m vom Trackende |

Alle drei sind **vor** dem Merge dieses PRs eingespielt — die Reihenfolge, die
der PR selbst verlangt ("Nicht mergen, bevor die Migration steht").

**Sofortige Folge:** die drei Zeilen, die `route_leaderboard` vorher führte
(auf einer Strecke), sind aus der Liste. Der PR-Text sagte, die Liste sei
ohnehin leer — gezählt wurden vorher `3`. Die Fahrten selbst sind unberührt,
sie tragen nur `dauer_quelle = 'trail'`.

### Zwei Befunde nach dem Einspielen von 0096

**Die Grant-Falle, zum vierten Mal.** `0096` warnt im eigenen Kommentar vor
`0047`/`0048`/`0091` — Supabase vergibt jeder neuen Funktion in `public` eine
**direkte** Ausführungsberechtigung an `anon`, die `revoke … from public` nicht
anfasst — und tappt dann hinein. Am Katalog gemessen war
`has_function_privilege('anon', 'fahrt_start_einloesen(uuid,text)', 'EXECUTE')`
gleich `true`. Wirkung: `auth.uid()` ist für `anon` NULL, ein Aufruf hat ein
frisches Ticket eingelöst (Rückgabe `12`) und `eingeloest_von` NULL gelassen —
was der Trigger als fremdes Ticket behandelt. Wer ID und Geheimnis kennt,
konnte eine fremde Fahrt um ihre Wertung bringen. `0097` schliesst das.

**Die Uhr liess sich mitten in der Fahrt anhalten.** Schwerer als der Grant.
`fahrt_start_einloesen` fror die Dauer beim **ersten** Aufruf ein, und nichts
band diesen Aufruf ans Ende der Fahrt: gemessen trug ein zwölf Sekunden nach
dem Anlegen eingelöstes Ticket `dauer_sekunden = 12`. Das Geheimnis liegt im
Tracking-Snapshot des Browsers, die Funktion ist per PostgREST erreichbar —
damit war die ×0.4-Fälschung aus A1 Bein 2 weiterhin möglich, ohne einen
Zeitstempel anzufassen. `0098` nimmt die Dauer vom Einlöse-Zeitpunkt weg und
hängt sie an den letzten Puls; der Trigger verlangt, dass dieser am Ende des
eingereichten Tracks liegt.

### Funktionstest 0098 (zurückgerollte Transaktion, Produktion)

Zwei Fahrten in einem `DO`-Block angelegt, Ergebnis über `raise exception`
ausgelesen — die Ausnahme rollt denselben Block zurück, es blieb nichts
stehen (`fahrt_starts` danach 0 Zeilen, `route_completions` unverändert 13).

```
A  letzter Puls 20 m vom Trackende   -> dauer_quelle=server, dauer=300
   (der Client hatte 999 behauptet; der Trigger hat sie überschrieben)
B  letzter Puls 6 km vor dem Ende    -> dauer_quelle=trail, fahrt_start_id=NULL
```

Zwei Konten nötig, weil `enforce_completion_cooldown` zwei Fahrten desselben
Kontos in Folge ablehnt. `art = 'frei'` verlangt `abdeckung_prozent = null`
(Constraint `fahrt_art_konsistent`).

### Nach der Einspielung geprüft

```
fahrt_start_anlegen            anon=true  authenticated=true
fahrt_start_puls               anon=true  authenticated=true   (Gäste pulsen)
fahrt_start_einloesen          anon=false authenticated=true
enforce_route_completion_dauer anon=false authenticated=false
Tabelle fahrt_starts: SELECT für anon und authenticated je false
RLS an, 0 Policies (Absicht)
Trigger-Reihenfolge auf route_completions (alphabetisch):
  enforce_route_completion_dauer -> fahrt_notiz_nur_vom_besitzer_trg
  -> route_completions_cooldown -> route_completions_enforce_stats
  -> route_completions_motorklasse -> route_completions_recompute_coverage
```

`0096` begründet die Triggerreihenfolge damit, dass
`enforce_route_completion_dauer` alphabetisch vor
`enforce_route_completion_stats` komme. Der Statistik-Trigger heisst in der
Datenbank `route_completions_enforce_stats`. Das Ergebnis stimmt (`e` < `r`),
die Begründung nicht.

### Was weiterhin offen ist

Die Position **in** einem Puls kommt vom Client wie jeder GPS-Fix. Fälschen
heisst ab hier: die Fahrt in Echtzeit simulieren, über die volle Dauer, gegen
eine Serveruhr getaktet — statt eine Datei nachträglich zu stauchen. Eine
höhere Hürde, kein Beweis. Die 500 m Toleranz sind der Preis für einen
verlorenen Schlusspuls (ein Intervall bei 90 km/h) und zugleich das Stück,
das ein Angreifer am Ende abschneiden kann.

### Rückweg

```sql
drop trigger if exists enforce_route_completion_dauer on public.route_completions;
drop function if exists public.enforce_route_completion_dauer();
-- route_leaderboard zurück auf den Stand vor 0096: dieselbe Definition ohne
--   and rc.dauer_quelle = 'server'
drop function if exists public.fahrt_start_puls(uuid, text, double precision, double precision);
drop function if exists public.fahrt_start_einloesen(uuid, text);
drop function if exists public.fahrt_start_anlegen(text, text, uuid);
alter table public.route_completions
  drop column if exists fahrt_start_id,
  drop column if exists dauer_trail_sekunden,
  drop column if exists dauer_quelle;
drop table if exists public.fahrt_starts;
```

## Eingespielt: 0095_sterne_wieder_einfuehren (2026-09-16, Produktion)

**Alle drei Schritte sind durch** — `not valid` angelegt, Gegenprobe
gelaufen, `validate constraint` bestätigt. Der Constraint ist damit
vollständig gültig; eine Zeile ausserhalb 1–5 kann es nicht mehr geben,
auch nicht per direktem PostgREST-Request an der Server Action vorbei.

Was die Gegenprobe ergab, und warum das die Vorsicht nicht entwertet:
`route_ratings` hielt **drei Zeilen, alle mit `sterne is null`** — reine
Kommentarzeilen, genau der Bestand, den `0025` hinterlässt. Null Zeilen
ausserhalb der Skala. Die befürchtete `sterne = 9999` gab es also nicht.
`not valid` war trotzdem die richtige Form: die Entscheidung fiel, *bevor*
jemand nachgesehen hatte, und eine Anweisung, die von ungesehenen Daten
abhängt, ist bei einer Datenbank ohne Probelauf das falsche Werkzeug —
unabhängig davon, wie der Blick nachher ausfällt.

### Nachher geprüft

```
route_ratings_sterne_check  contype=c  convalidated=true
  CHECK (((sterne IS NULL) OR ((sterne >= 1) AND (sterne <= 5))))
```

Funktionstest in einer zurückgerollten Transaktion. Der Cooldown-Trigger aus
`0024`/`0041` steht jedem Schreibversuch im Weg, deshalb
`set local session_replication_role = 'replica'` — das legt die **Trigger**
still, während CHECK-Constraints weiter greifen, also genau das, was geprüft
werden soll:

```
sterne=1     -> angenommen (richtig)
sterne=3     -> angenommen (richtig)
sterne=5     -> angenommen (richtig)
sterne=0     -> abgewiesen (richtig)
sterne=6     -> abgewiesen (richtig)
sterne=9999  -> abgewiesen (richtig)
sterne=NULL  -> angenommen (richtig: nur kommentiert)
```

Danach gegengeprüft: weiterhin 3 Zeilen, alle `sterne is null` — der Test ist
vollständig zurückgerollt. Und `current_setting('lock_timeout')` steht wieder
auf `0`: das `set local` aus der Migration hat die Sitzung **nicht**
überlebt, also genau das Verhalten, um dessentwillen es in Review-Runde 3
von `set` auf `set local` geändert wurde.

### Rückweg

```sql
alter table public.route_ratings drop constraint route_ratings_sterne_check;
```

---

Die Anleitung, nach der vorgegangen wurde, steht unverändert darunter —
sie ist der Grund, warum die drei Schritte getrennt sind.

**Was sie tut.** Sie holt die Prüfung `sterne between 1 and 5` zurück, die
`0025_ratings_ohne_sterne` fallen liess, als die Sterne-Wertung aus dem
Produkt genommen wurde. NULL-tolerant, weil eine Bewertung seit `0025` aus
einem blossen Kommentar bestehen darf und die Zeilen aus dieser Zeit
`sterne is null` tragen.

**Sie ist `not valid`.** Ein gewöhnliches `add constraint` prüft den Bestand
mit und scheitert an der ersten verletzenden Zeile. Ob es eine gibt, weiss
niemand: `route_ratings` trägt volle Tabellen-Grants, die Policy "Nutzer
verwalten eigene Bewertungen" prüft nur die `user_id`, und seit `0025` band
nichts mehr den Wert — ein direkter PostgREST-Request konnte in diesem
ganzen Zeitraum schreiben, was er wollte. Mit einer Datenbank und ohne
Probelauf ist eine Anweisung, die von ungesehenen Daten abhängt, die falsche
Form.

`not valid` bindet jedes INSERT und jedes UPDATE sofort — also alles, wogegen
der Constraint schützen soll — und lässt allein die Altzeilen ungeprüft. **An
bestehenden Zeilen** kann es damit nicht scheitern, und es nimmt keinen
Table-Scan.

Umsonst ist es deshalb nicht. Zweierlei nimmt `not valid` einem nicht ab:

- **Die Sperre bleibt.** Jedes `alter table ... add constraint` nimmt
  `access exclusive` auf die Tabelle, mit `not valid` genauso wie ohne — nur
  eben kurz, weil kein Scan darunter liegt. Gewährt werden muss sie
  trotzdem: hält eine laufende Transaktion `route_ratings`, wartet die
  Anweisung, und hinter der wartenden Anforderung stauen sich Lesen **und**
  Schreiben, weil PostgreSQL nachfolgende Anfragen in die Warteschlange
  einreiht statt an ihr vorbei. Deshalb trägt die Migrationsdatei ein
  `set local lock_timeout = '5s'` vor der Anweisung: dann scheitert im
  Konfliktfall die Migration und nicht die App, und ein zweiter Versuch
  kostet nichts.
- **Die Altzeilen bleiben ungeprüft, aber nicht folgenlos.** Was das später
  kostet, steht unter "Was bleibt, nachdem sie eingespielt ist".

### Einspielen

```sql
-- 1. Die Migration selbst, wörtlich so wie in der Datei — der lock_timeout
--    steht dort mit drin, damit er auch dann gilt, wenn die Datei über
--    `supabase db push` oder `apply_migration` läuft und niemand diesen
--    Abschnitt gelesen hat. Scheitern kann sie nicht an bestehenden Zeilen,
--    wohl aber daran, dass die Tabellensperre nicht frei wird; dann lieber
--    abbrechen und gleich noch einmal, als die Tabelle stauen zu lassen.
--    `set LOCAL` endet mit der Transaktion — ein blosses `set` gälte für die
--    ganze Sitzung und hinge danach an allem, was auf derselben (wiederver-
--    wendeten) Migrationsverbindung noch folgt. Von Hand in psql deshalb in
--    `begin; ... commit;` klammern: ohne Transaktion ist `set local` wirkungslos.
set local lock_timeout = '5s';

alter table public.route_ratings
  add constraint route_ratings_sterne_check
  check (sterne is null or sterne between 1 and 5)
  not valid;
```

### Danach, als eigener Schritt

```sql
-- 2. Gegenprobe: gibt es Altzeilen ausserhalb der Skala?
select id, route_id, sterne from public.route_ratings
where sterne is not null and sterne not between 1 and 5;

-- 3. NUR wenn Schritt 2 null Zeilen liefert:
alter table public.route_ratings validate constraint route_ratings_sterne_check;
```

Schritt 2 und 3 stehen bewusst **nicht** in der Migrationsdatei. Liefert die
Gegenprobe Zeilen, ist die Frage fachlich — löschen, kappen oder auf null
setzen — und gehört einem Menschen. Stünde `validate constraint` in der
Datei, scheiterte sie in genau diesem Fall und risse den `not valid`-Teil in
derselben Transaktion mit zurück; das bedingte Scheitern wäre also nur
verschoben, nicht vermieden.

### Was fehlt, solange sie nicht eingespielt ist

Der Code bricht **nicht**: `route_ratings.sterne` existiert seit `0025` als
nullable Spalte, die App schreibt und liest sie ohne den Constraint genauso
wie mit ihm. Was fehlt, ist allein die Schranke gegen einen direkten
PostgREST-Schreibzugriff.

Der Schaden daraus ist **ungültig gespeicherte Daten**, nicht ein
verschobener Durchschnitt: `bewertungAusSternen()` in `lib/bewertungen.ts`
filtert seit dem Review auf die Spannweite 1–5 und nicht bloss auf "endliche
Zahl", ein `sterne = 9999` fällt in der Anzeige also heraus
(`lib/bewertungen.test.ts` hält den Fall fest). Eine frühere Fassung dieser
Beschreibung behauptete den verschobenen Durchschnitt — das stimmte, solange
die App nur auf Endlichkeit filterte, und wurde mit demselben Commit falsch,
der die Filterung verschärfte.

### Was bleibt, nachdem sie eingespielt ist

`not valid` heisst **nicht**, dass die Altzeilen dauerhaft unbehelligt
bleiben. Es heisst nur: beim Anlegen des Constraints wurden sie nicht
geprüft. Jedes spätere UPDATE prüft die ganze neue Zeilenversion — auch die
Spalten, die es gar nicht anfasst. Eine Altzeile mit `sterne = 9999` lässt
sich danach also nicht mehr ändern, auch dann nicht, wenn die Änderung bloss
den Kommentar betrifft; PostgreSQL weist sie mit
`route_ratings_sterne_check` ab.

Wen das trifft, und wen nicht:

- **Die Server Action nicht.** `submitRating()` in `lib/actions/ratings.ts`
  schreibt beide Felder immer mit — sie repariert eine solche Zeile also
  im Vorbeigehen, statt an ihr zu scheitern.
- **Löschen nicht.** Ein Constraint prüft kein DELETE; `deleteRating()`
  kommt an jede Zeile heran.
- **Ein direkter PATCH auf nur eine Spalte schon** — also genau der
  Zugriffsweg, über den der ungültige Wert überhaupt erst hätte entstehen
  können.

Die Reparatur ist dieselbe wie die Gegenprobe oben: Schritt 2 findet die
betroffenen Zeilen, und die fachliche Entscheidung (auf null setzen, kappen,
löschen) räumt sie weg. Danach geht Schritt 3 durch, und ab dann kann es
solche Zeilen nicht mehr geben.

## Eingespielt: 0100_folge_benachrichtigungen (2026-09-16, Produktion)

Neue Follower erscheinen auf `/aktivitaet` (PR #250). Eingespielt **vor**
dem Merge des Codes — die Reihenfolge war hier nicht bloss die bevorzugte:
ohne `recent_follows_received()` wirft `/aktivitaet`, weil
`getRecentFollowersReceived` einen Query-Fehler bewusst nicht als "keine
Follower" durchgehen lässt (`lib/queryError.ts`). Eine Fehlerseite, kein
stiller Rückfall. (`count_unseen_activity()` hätte die Kopfleiste still auf
0 degradieren lassen, `mark_activity_seen()` hätte nichts markiert — beides
ohne Ausfall.)

### Vorher geprüft

`follows_gesehen_am` existierte nicht, die drei Funktionen existierten
nicht — nichts halb angewandt, die Migration konnte sauber laufen.

### Nachher am Katalog geprüft (nicht am Ledger)

```
recent_follows_received   secdef=t  search_path=public  anon=false  authenticated=true
count_unseen_activity     secdef=t  search_path=public  anon=false  authenticated=true
mark_activity_seen        secdef=t  search_path=public  anon=false  authenticated=true

profiles.follows_gesehen_am  timestamptz  not null  default now()
  anon SELECT=false   authenticated SELECT=false   authenticated UPDATE=false
```

Die Grant-Falle aus `0047`/`0048`/`0091`/`0097` ist damit **nicht** ein
fünftes Mal zugeschnappt: das ausdrückliche `revoke execute … from anon`
neben dem `from public` hat getragen. Die Spalte trägt wie
`kudos_gesehen_am` keinerlei Grant.

Alle 17 Profile tragen **denselben** `follows_gesehen_am` — das ist der
Beweis, dass `add column … default now()` den schnellen Weg genommen hat
(`now()` ist stable, der Default wird einmal ausgewertet und als
`attmissingval` hinterlegt, kein Table-Rewrite). Genau das ist die Absicht:
Bestandsnutzer bekommen ihre Follower-Historie nicht als "neu" vorgesetzt.

### Funktionstest (zurückgerollte Transaktion, Produktion)

`DO`-Block, Ergebnis über `raise exception` ausgelesen — die Ausnahme rollt
denselben Block zurück. Ein bestehendes Konto bekam sein Lesezeichen
künstlich zehn Tage in die Vergangenheit gesetzt:

```
angemeldet:  liste=1  neu_vorher=t  zaehler_vorher=1
nach mark:   neu=f    zaehler=0
als anon:    liste=0  zaehler=0     mark=Ausnahme: not authenticated
```

Der dritte Block ist der wichtige: ohne Sitzung liefern beide Lesefunktionen
nichts (`auth.uid()` ist NULL, der Vergleich nie wahr) und die Schreibfunktion
verweigert. Danach gegengeprüft: 17 Profile, 10 Follows, **0** Lesezeichen in
der Vergangenheit — der Testschreibvorgang ist vollständig zurückgerollt.

### Rückweg

```sql
drop function if exists public.mark_activity_seen();
drop function if exists public.count_unseen_activity();
drop function if exists public.recent_follows_received();
alter table public.profiles drop column if exists follows_gesehen_am;
```

Die Nummer ist **0100**, und sie war vorher **0097** — eine echte
Kollision, keine blosse Luecke. `0097` gehoert seit dem 15. September
`0097_fahrtstart_einloesen_nur_angemeldet` aus PR #249, und diese Migration
ist **in der Produktion eingespielt**. Zwei gleich nummerierte Dateien, von
denen eine bereits angewandt ist, machen jede spaetere Abstimmung nach
Nummer mehrdeutig (`AGENTS.md`: "Migration numbers are not unique" —
sechs Altpaare, kein siebtes). `staging` traegt inzwischen `0095` bis
`0099`, also ist `0100` die naechste freie Nummer.

`scripts/check-migration-prefixes.mjs` konnte das nicht sehen: es kennt nur
den eigenen Zweig. Der Check, der hier zaehlt, ist der, den
`.agents/database.md` verlangt — die offenen PRs lesen, bevor man eine
Nummer waehlt. Hier hat er gefehlt, und die Kollision ist erst beim
Zusammenfuehren aufgefallen.

Rein additiv: eine Spalte (`profiles.follows_gesehen_am`, `not null default
now()`, ohne Spalten-Grant) und drei neue Funktionen. Keine bestehende
Funktion wird ersetzt, keine Policy verengt, kein Backfill. Der Rückweg ist
entsprechend kurz — `drop function` für die drei, `drop column` für die
eine —, und es gibt keinen Zustand, in dem ein halb angewendeter Stand Daten
verlöre.

Zwei Dinge, die beim Anwenden zu prüfen sind, beide aus den Lehren von
`0047`/`0048`/`0091`:

```sql
-- 1. Kein direkter EXECUTE-Grant an anon (Supabase vergibt ihn per
--    Default-Privileg an JEDE neue Funktion in public; ein revoke von
--    PUBLIC entfernt ihn NICHT).
select p.proname, r.rolname, has_function_privilege(r.rolname, p.oid, 'execute')
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
cross join (values ('anon'), ('authenticated')) as r(rolname)
where n.nspname = 'public'
  and p.proname in ('recent_follows_received', 'count_unseen_activity', 'mark_activity_seen');
-- Erwartet: anon = false, authenticated = true, für alle drei.

-- 2. Die Spalte trägt keinen Grant (sonst verriete sie, wann ein
--    beliebiger Nutzer zuletzt seine Aktivität angesehen hat).
select grantee, privilege_type from information_schema.column_privileges
where table_name = 'profiles' and column_name = 'follows_gesehen_am';
-- Erwartet: keine Zeile für anon/authenticated.
```
## Eingespielt: 0094_creator_verlauf_nur_aufrufe (2026-09-15, Produktion)

| Datei | Ledger-`version` | Was |
| --- | --- | --- |
| `0094_creator_verlauf_nur_aufrufe` | `20260915075341` | `creator_verlauf()` gibt nur noch Aufrufe zurück; `handle_new_user()` bekommt den `exception`-Block; Index `creator_konversionen_code_art_zeit` |

**Eingespielt, bevor der Code deployt ist** — PR #236 und #243 sind beide
noch offen. Die Richtung ist hier die unangenehme: `0094` verengt etwas,
das seit dem 2026-09-14 live ist. Genau deshalb ist es die richtige
Reihenfolge — solange der Code nicht deployt ist, liest die Funktion in
Produktion niemand, und die zwei Spalten sind weg, bevor sie jemand
abrufen kann.

Drei Änderungen:

| Was | Warum |
| --- | --- |
| `creator_verlauf()` gibt nur noch `klicks` zurück | `0091` gab zusätzlich `registrierungen` und `abos` **pro Tag** an jeden `authenticated` Creator. Gezeichnet hat die Oberfläche davon nie etwas. Bei kleinen Zahlen benennt ein Tagesbucket mit einer einzigen Registrierung den Tag, an dem ein Konto entstand — und `profiles.created_at` ist seit `0034` an `anon` gegrantet. Die veröffentlichte Datenschutzerklärung sagt wörtlich „weder Name noch Zeitpunkt". |
| `handle_new_user()` fängt Fehler der Herkunftserfassung ab | `0088` sichert im Kommentar zu, eine Registrierung dürfe nie an der Messung scheitern. Ohne Handler tut sie das: der Trigger hängt an `auth.users`, und ein Fremdschlüsselfehler (Code wird zwischen `exists`-Test und `insert` gelöscht) bricht die Registrierung ab. `on conflict do nothing` deckt nur Unique-Verletzungen. |
| Index `creator_konversionen_code_art_zeit` | Vorsorge für die erste zeitfilternde Auswertung. Sie muss dafür einen halboffenen Bereich auf `ereignis_am` schreiben, nicht `ereignis_am::date = :tag` — die Begründung steht im Migrationskopf. |

`drop function` + `create` statt `create or replace`, weil sich der
Rückgabetyp ändert — das kann `replace` nicht. Der `drop` nimmt die ACL mit,
die Grants werden darunter neu gesetzt, inklusive des ausdrücklichen
`revoke ... from anon` aus der Lehre von `0093`.

### Vorher geprüft

Der `create or replace` auf `handle_new_user()` ist die Stelle, an der ein
Einspielen still eine fremde Änderung zurückdrehen kann. Der live laufende
Rumpf wurde deshalb ausgelesen und gegen die Fassung aus `0088` gestellt:
in den **Anweisungen identisch**, Unterschiede nur in den Kommentaren — die
am 2026-09-14 angewendete Fassung trug gekürzte, umlautfreie Kommentare.
Seither hatte also niemand an der Funktion gearbeitet.

Der Rückweg wurde vorher geschrieben, nicht erst im Ernstfall: die
vollständige `0091`-Fassung von `creator_verlauf()` aus
`pg_get_functiondef()` und der `0088`-Rumpf von `handle_new_user()` lagen
beide vor dem ersten Schreibbefehl vor.

Nebenbefund derselben Vorprüfung: Dieser Abschnitt führte bis hierher auch
`0087_premium_abzeichen_spalte` als offen. Es war bereits am 2026-09-14 um
20:07 eingespielt (Ledger `20260914200727`, Abschnitt dazu im Branch von
PR #235). Massgeblich war wie immer das Objekt und nicht die Prosa: die
Spalte existiert, ist `generated ... stored`, der Ausdruck lautet
`(ist_premium AND zeigt_premium_badge)`, `select` liegt bei `anon` und
`authenticated`.

### Nachher geprüft

| Prüfung | Ergebnis | Woher |
| --- | --- | --- |
| Rückgabe nur noch drei Spalten | `{ code, tag, klicks }` | `generate_typescript_types` |
| `anon` darf `creator_verlauf` nicht | nicht in der anon-Liste (dort nur `creator_klick_zaehlen`, `creator_link_aufloesen` — beide gewollt) | `get_advisors` (security) |
| `authenticated` darf | in der authenticated-Liste | `get_advisors` (security) |
| `handle_new_user` für niemanden ausführbar | in keiner der beiden Listen | `get_advisors` (security) |
| Index steht, mit der erwarteten Definition | `(code, art, ereignis_am)` | `execute_sql` (`pg_indexes`), spätere Sitzung |
| `exception`-Block und `pg_temp` im Rumpf | beides vorhanden | `execute_sql` (`pg_get_functiondef`), spätere Sitzung |
| `anon` steht **nicht** unter den Grants | `authenticated`, `postgres`, `service_role` | `execute_sql` (`role_routine_grants`), spätere Sitzung |
| Ledger-Eintrag | `20260915075341` | `list_migrations` |

**Der Index ist inzwischen einzeln gesehen.** Der Abschnitt führte ihn
zunächst als offen, weil `execute_sql` nach dem Schreiben blockiert war.
In einer späteren Sitzung ist die Abfrage unten gelaufen, und er steht mit
genau der Definition aus dem Migrationskopf:

    CREATE INDEX creator_konversionen_code_art_zeit
      ON public.creator_konversionen USING btree (code, art, ereignis_am)

Damit sind alle Objekte aus `0094` am Objekt geprüft und nicht nur aus der
Unteilbarkeit des Skripts geschlossen.

**Ebenfalls nicht ausgeführt: Funktionstests in zurückgerollten
Transaktionen**, wie sie es für `0088`–`0093` gab. Der Zugriff auf
`execute_sql` wurde nach dem Schreiben blockiert, die Gegenprobe lief
deshalb über die drei Lesewerkzeuge oben. Der `exception`-Zweig von
`handle_new_user()` ist damit gegengelesen, aber nicht gemessen — er lässt
sich ohnehin nur messen, indem man den Wettlauf nachstellt (Code zwischen
`exists`-Test und `insert` löschen), und das heisst, an einer lebenden
Tabelle zu schrauben.

Prüfabfragen für eine Sitzung mit SQL-Zugriff:

```sql
-- Nur noch drei Spalten?
-- creator_verlauf ist eine Funktion, keine Relation — in
-- information_schema.columns steht dafür nichts, die Abfrage käme leer
-- zurück und würde Leere als Bestätigung lesen.
select pg_get_function_result('public.creator_verlauf(integer)'::regprocedure);

-- anon hat nichts?
select has_function_privilege('anon', 'public.creator_verlauf(integer)', 'execute');

-- Index da?
select indexname from pg_indexes
where tablename = 'creator_konversionen';

-- Exception-Block drin, search_path mit pg_temp?
select p.proconfig, position('exception' in p.prosrc) > 0
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'handle_new_user';
```

Rückweg: `0091`s Fassung der Funktion wieder anlegen (Datei lesen, Grants
mitnehmen), `handle_new_user` aus `0088` zurückschreiben, `drop index
creator_konversionen_code_art_zeit`. Verlustfrei — es hängen keine Daten
daran; `creator_konversionen` und `creator_klicks` waren beim Einspielen
leer und sind es geblieben.

## Eingespielt: 0088–0093 (Creator-Herkunft und Creator-Konten, 2026-09-14, Produktion)

Sechs Migrationen, in dieser Reihenfolge angewendet:

| Datei | Ledger-`version` | Was sie anlegt |
| --- | --- | --- |
| `0088_herkunft_und_konversionen` | `20260914220140` | `registrierung_herkunft`, `creator_konversionen`, `handle_new_user()` um die Herkunft erweitert |
| `0089_creator_konversion_abo` | `20260914220301` | Trigger auf `subscriptions`, der den ersten zahlenden Zustand festhält |
| `0090_anonymisierung_herkunft` | `20260914220354` | `anonymize_account()` räumt die Herkunft auf |
| `0091_creator_konten` | `20260914220441` | `creator_links.creator_user_id`, Lese-Policy für Creator, `creator_klicks`, drei Funktionen |
| `0092_anonymisierung_creator_zuweisung` | `20260914220506` | `anonymize_account()` gibt zugewiesene Codes frei |
| `0093_creator_funktionen_anon_entziehen` | `20260914220654` | **Nachtrag, siehe unten** |

**Warum nicht 0087:** diese Nummer gehört `0087_premium_abzeichen_spalte`
aus PR #235, am selben Tag eingespielt. Beide Branches hatten unabhängig
voneinander `0087` gewählt, weil `main` bei `0086` endete.
`schema_migrations.version` ist ein Primärschlüssel — eine der beiden hätte
sich nie eingetragen. Genau dieser Fall ist der Grund, warum
`.agents/database.md` verlangt, die höchste Nummer **auf `main` und in
jedem offenen PR** zu prüfen; `scripts/check-migration-prefixes.mjs` kann
das nicht, es sieht nur einen Branch.

### Vorher geprüft

Zwei Migrationen schreiben bestehende Funktionen per `create or replace`
neu. Vor dem Einspielen wurden deshalb die **live laufenden Rümpfe**
ausgelesen und mit denen verglichen, auf denen die Migrationen aufbauen:
`handle_new_user` trug exakt die Fassung aus `0001`, `anonymize_account`
exakt die aus `0076`. `0087` hatte keine von beiden angefasst. Ohne diesen
Abgleich hätte ein `create or replace` stillschweigend eine fremde Änderung
zurückgedreht.

Der Rückweg wurde **vor** dem ersten Schreibbefehl geschrieben, nicht
danach — inklusive der beiden Originalrümpfe. Alle sechs sind additiv;
zurück geht es über `drop` in umgekehrter Reihenfolge plus die zwei
Funktionen auf `0001`/`0076`.

### Nachher geprüft, an den Objekten

Drei neue Tabellen, alle mit RLS und **ohne** Tabellenrechte für
`anon`/`authenticated`; die Spalte und der Teilindex auf `creator_links`;
zwei Policies dort (die Moderations-Policy aus `0084` plus die neue
Lese-Policy); der Trigger auf `subscriptions`; vier neue Funktionen; beide
ersetzten Funktionen mit ihren neuen Anweisungen.

Dazu drei **Funktionstests in zurückgerollten Transaktionen**, weil ein
Schema-Check nicht zeigt, ob etwas läuft:

- Der Schreibweg des Registrierungs-Triggers (beide Inserts in der Form,
  die er verwendet) — funktioniert.
- Der Abo-Trigger auf beiden Pfaden: ohne Herkunft schreibt er nichts und
  wirft nicht; mit Herkunft genau eine `abo_start`-Zeile mit gesetztem
  `registriert_am`. Ein **wiederholter** Schreibvorgang bleibt bei einer
  Zeile — die Idempotenz gegen Stripes Mehrfachzustellung ist damit
  gemessen, nicht angenommen. Das war der wichtigste Test: der Trigger
  hängt an der Tabelle, in die der Stripe-Webhook schreibt.
- `creator_klick_zaehlen()` als Rolle `anon`: zwei Aufrufe ergeben eine
  Zeile mit `klicks = 2`, ein erfundener Code legt nichts an und wirft
  nicht.

Bestandsdaten danach unverändert: 16 Profile, 4 Abos, 1 Link, 6 Fahrzeuge,
11 Fahrten. Die drei neuen Tabellen sind leer.

**Nicht ausgeführt:** `anonymize_account()` selbst. Die Funktion löscht
Fahrzeuge und nullt GPS-Tracks; sie an einem echten Konto zu erproben, auch
in einer zurückgerollten Transaktion, wäre ein unnötiges Risiko an
Produktionsdaten. Geprüft wurde stattdessen, dass ihr Rumpf die drei neuen
Anweisungen trägt und der Rest wortgleich der aus `0076` ist.

### Der Nachtrag 0093 — und die Falle, die zum dritten Mal zuschlug

Die Prüfung der Ausführungsrechte **nach** dem Einspielen ergab:

```
creator_kennzahlen -> {anon, authenticated, postgres, service_role}
creator_verlauf    -> {anon, authenticated, postgres, service_role}
```

`0091` entzieht beiden `from public` und gibt nur `authenticated` — der
Kommentar daneben behauptet ausdrücklich, `anon` bekomme damit nichts. Das
ist falsch: Supabase vergibt neuen Funktionen im Schema `public` einen
**direkten** Grant an `anon`, und ein `revoke ... from public` fasst den
nicht an. Dieselbe Falle wie in `0047` (PUBLIC) und `0048` (die direkten
anon-Grants, die `0047` übrig liess) — hier zum dritten Mal.

**Offengelegt hat es nichts.** Beide Funktionen filtern auf
`auth.uid()`, das für `anon` NULL ist; als Rolle `anon` aufgerufen liefern
sie **null Zeilen** (nachgemessen, nicht geschlossen). `0093` stellt
lediglich die erklärte Absicht wieder her — bevor eine spätere Lockerung
der Filterbedingung aus einem folgenlosen Recht ein folgenreiches macht.

`creator_klick_zaehlen()` behält seinen anon-Grant: dort ist er gewollt,
weil der Klickende meistens kein Konto hat.

Die Lehre für die nächste Migration mit einer neuen Funktion: `revoke
execute ... from public` genügt nie. Es braucht zusätzlich
`from anon, authenticated` — so, wie es `0088` bei der Sequenz getan hat,
die deshalb sauber ist.


## Eingespielt: 0087_premium_abzeichen_spalte (2026-09-14, Produktion)

Legt `profiles.zeigt_premium_abzeichen` an — eine gespeicherte generierte
Spalte `(ist_premium and zeigt_premium_badge)` — und erteilt `select`
darauf an `anon` und `authenticated`. Rein additiv: keine bestehende Zeile
geändert, kein bestehender Grant angefasst, keine Policy berührt.

**Eingespielt bevor der Code deployt war**, wie bei `0085` und `0086`.

Wer ohne die Spalte tatsächlich scheitert, ist enger als hier zuerst stand —
die Behauptung „Profil, Feed, Fahrt-Detail und Bestenlisten" war falsch und
ist am 2026-09-14 im Review nachgerechnet worden:

| Pfad | ohne `0087` |
| --- | --- |
| `lib/profile.ts`, `app/profil/page.tsx` | **Spaltenfehler** — beide selektieren sie direkt aus `profiles` |
| Feed, Fahrt-Detail | kein Fehler: `lib/premiumAbzeichen.ts` verwirft den Fehler und liefert eine leere Menge, die Seite rendert ohne Abzeichen |
| Bestenlisten | kein Fehler: sie lesen `ist_premium` aus den Views und fassen die neue Spalte nie an |

„Schema zuerst" bleibt damit richtig — aber wegen der Profilseiten, nicht
wegen aller vier.

Vorher an den Objekten geprüft (nicht am Ledger), Ergebnis:

```
profiles.zeigt_premium_abzeichen   fehlte          -> anzulegen
profiles.ist_premium/-_badge       vorhanden       (0021)
leaderboard_typ_totals             vorhanden       (0085)
leaderboard_klassen_totals         vorhanden       (0080)
feedback / creator_links           vorhanden       (0083 / 0084)
routes-INSERT-Policy ohne Premium  vorhanden       (0086)
Zeilen in profiles                 16
```

Nachher zurückgelesen: Spalte existiert, `is_generated = ALWAYS`, Ausdruck
`(ist_premium AND zeigt_premium_badge)`, beide Grants gesetzt, 16 Zeilen
unverändert, **genau eine** Zeile trägt `true` — deckungsgleich mit der
Gegenprobe `ist_premium and zeigt_premium_badge` (5 Konten haben ein Abo,
eines davon hat das Abzeichen eingeschaltet).

Rückweg, falls nötig: `alter table public.profiles drop column
zeigt_premium_abzeichen;` — verlustfrei, die Spalte ist abgeleitet.

**Für den Folge-PR, der `select (ist_premium)` entzieht:** `anon` hält seit
`0034` auch `select` auf `zeigt_premium_badge`, und die beiden verbleibenden
Spalten rekonstruieren den rohen Wert (`badge = true` bei
`abzeichen = false` heisst: kein laufendes Abo). Es müssen also **beide**
entzogen werden, sonst verschiebt sich das Leck nur. Heute ist das keine
Ausweitung — `ist_premium` selbst ist ohnehin freigegeben.

Ledger-Eintrag: `20260914200727` / `0087_premium_abzeichen_spalte`.


## Eingespielt: 0086_strecken_anlegen_wieder_offen (2026-09-14, Produktion)

Nimmt die Premium-/Moderationspflicht aus `0077` auf der INSERT-Policy von
`public.routes` zurück. **Eingespielt bevor der Code deployt war** — das ist
hier die harmlose Richtung: die Policy wird weiter, nicht enger. Bis der
Code aus PR #220 ausgeliefert ist, blockiert die Server Action kostenlose
Konten weiterhin mit einer lesbaren Meldung; es passiert schlicht nichts.
Anders als bei `0077` gibt es kein Zeitfenster, in dem jemand etwas nicht
mehr darf.

Vorher gezählt (die Migration entstand ohne Datenbankzugriff, das
Mengengerüst wurde hier nachgeholt):

```
routen_gesamt            14
oeffentlich_sichtbar     13   (status_ok, nicht privat)
routen_privat             1
in_moderation             1
bestandsschutz_konten     0   (0064 — niemand ist davon betroffen)
premium_konten            5
```

**Korrektur an der Begründung im Migrationskopf:** dort steht „mit acht
freigegebenen Strecken". Tatsächlich sind es **dreizehn**. Die Acht stammt
aus `docs/marketing/instagram/daten.mjs`, einer Momentaufnahme vom
2026-09-07, die im eigenen Kopf warnt, dass sie keine Verbindung zur
Datenbank hat. Die Datei `0086_…sql` bleibt unverändert — Kernregel 9
verbietet, eine eingespielte Migration anzufassen, auch wenn nur ein
Kommentar danebenliegt. Die Zahl steht hier richtig, und das Argument trägt
bei dreizehn genauso: der Zufluss an Strecken ist die knappste Ressource.

Zustand vorher, zurückgelesen:

```
with_check = ((erstellt_von = (SELECT auth.uid())) AND (status_ok = false)
              AND (EXISTS (SELECT 1 FROM profiles p
                           WHERE p.id = (SELECT auth.uid())
                             AND (p.ist_premium OR p.is_moderator))))
```

Nachher gegengelesen, nicht angenommen:

```sql
select policyname, cmd, roles::text, with_check,
       with_check like '%ist_premium%'  as enthaelt_noch_premium,
       with_check like '%is_moderator%' as enthaelt_noch_moderator
from pg_policies
where schemaname = 'public' and tablename = 'routes'
  and policyname = 'Angemeldete Nutzer können Strecken vorschlagen';
```

Ergebnis:

```
with_check = ((erstellt_von = (SELECT auth.uid())) AND (status_ok = false))
enthaelt_noch_premium    false
enthaelt_noch_moderator  false
roles                    {authenticated}
```

Das ist exakt das Prädikat aus `0027`.

Nachbarn geprüft — alle sieben Policies auf `routes` stehen unverändert
(SELECT ×2, INSERT ×1, UPDATE ×2, DELETE ×2), und beide beteiligten
Funktionen sind weiterhin **SECURITY INVOKER**:

```sql
select p.proname, p.prosecdef as security_definer
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('darf_private_strecke_anlegen','propose_route_full');
-- beide: security_definer = false
```

Das ist der Punkt, auf den es sicherheitsseitig ankommt: weil
`propose_route_full` unter RLS läuft, gilt diese Policy auch für einen
direkten `POST /rest/v1/rpc/propose_route_full` und nicht nur für die
Server Action.

**Rückweg,** falls er gebraucht wird: das `0077`-Prädikat per neuer
Migration wieder setzen. Es entstehen und verschwinden keine Objekte, ein
Rückweg kostet nichts ausser einer weiteren Datei.

**Gehört dazu, ist aber kein SQL:** AGB Ziff. 3.1 und 3.2 (PR #220 hier,
`stradoinfo#14` für die veröffentlichte Fassung). Solange die
AGB-Änderung nicht ausgeliefert ist, weist der Rechtstext eine Leistung
als Abo-Bestandteil aus, die die Datenbank bereits freigegeben hat.

## Eingespielt: 0085_bestenlisten_nach_fahrzeugtyp (2026-09-14, Produktion)

Eingespielt **vor** dem Deploy des Codes, der sie liest — der liegt zu diesem
Zeitpunkt auf dem Branch der PR #217 und ist weder auf `staging` noch auf
`main`. Damit ist die Reihenfolge aus `.agents/deployment.md` eingehalten
(Schema zuerst, Code danach), und die Migration ist rückwärtskompatibel zum
laufenden Code: Der kennt die neue View schlicht nicht.

| Datei | Ledger-`version` |
| --- | --- |
| `0085_bestenlisten_nach_fahrzeugtyp` | `20260914121835` |

Inhalt: neue immutable Funktion `public.motorklasse_typ(text)`, neue View
`public.leaderboard_typ_totals`, `grant select` an `anon` und
`authenticated`. **Rein additiv** — keine bestehende Relation, Policy oder
Spalte angefasst, nichts zurückgeschrieben, kein Tabellen-Rewrite. Ein
Mengengerüst war deshalb nicht nötig: eine View speichert nichts.

**Vorabprüfung** (der Punkt, an dem `create or replace` gefährlich wäre):
Beide Namen existierten vorher **nicht** — die Anweisungen haben also
angelegt und nicht still eine fremde Definition überschrieben. Die drei
Abhängigkeiten (`leaderboard_completions` samt Spalte `motorklasse`,
`leaderboard_klassen_totals`) waren vorhanden.

### Gegenprobe, alles zurückgelesen statt angenommen

| Prüfung | Ergebnis |
| --- | --- |
| `motorklasse_typ('moto_a1')` / `('moto_a')` | ✅ `motorrad` |
| `motorklasse_typ('auto_bis110')` / `('auto_ueber220')` | ✅ `auto` |
| `motorklasse_typ('quatsch')` / `(null)` | ✅ `null` — kein Rückfall auf einen Typ |
| Funktion `immutable` | ✅ `provolatile = 'i'` (Voraussetzung fürs `GROUP BY`) |
| `search_path` gepinnt | ✅ `search_path=""` wie seit 0073 |
| `select` für `anon` / `authenticated` | ✅ beide `true` |
| Summe `fahrten_count` typ vs. klassen | ✅ **0 = 0** — die Invariante, beide filtern `motorklasse is not null` |
| Summe `fahrten_count` in `leaderboard_user_totals` | ✅ **8**, liegt erwartungsgemäss darüber |

**Die neue View ist leer, und das liegt nicht an ihr.** Erhoben statt
vermutet: 6 Fahrzeuge, davon **0 mit `leistung_kw`**; 9 Fahrten, davon **0
mit `motorklasse_gewertet`**; 8 Fahrten in `leaderboard_completions`. Also
trägt bislang überhaupt keine Fahrt eine Klasse — derselbe Befund, mit dem
`0082` seinerzeit auf 0 Zeilen lief. `leaderboard_klassen_totals` ist
deshalb genauso leer. Die Klassen- und Typlisten füllen sich, sobald jemand
eine Leistung einträgt und danach fährt.

### Advisors nach dem Einspielen

Gegen die Baseline verglichen. **Ein** neuer Befund, und der war erwartet:
`security_definer_view` für `leaderboard_typ_totals` — identisch zu
`leaderboard_completions`, `leaderboard_klassen_totals`,
`leaderboard_user_totals`, `route_leaderboard` und den übrigen sechs. Das
ist das bewusste Muster aus `0013_leaderboard_view.sql` (die View rechnet
mit den Rechten ihres Owners, weil sie die Sichtbarkeitsregeln selbst
kodiert), keine Regression. Alles Übrige unverändert: `spatial_ref_sys`
(dokumentierter Dauerbefund), `postgis` im `public`-Schema,
`rls_enabled_no_policy` auf `gruender_plaetze` und
`stripe_webhook_events`, die `SECURITY DEFINER`-Funktionslisten,
`auth_leaked_password_protection`.

### Rückweg, falls er gebraucht wird

Sauberer Inverser, es gibt keine Daten wiederherzustellen:

```sql
drop view if exists public.leaderboard_typ_totals;
drop function if exists public.motorklasse_typ(text);
```

## Reihenfolge der Motorklassen-Migrationen

Alle drei gehören **vor** den Deploy des Codes, der sie braucht, und in
dieser Reihenfolge:

| # | Datei | gehört eingespielt |
| --- | --- | --- |
| 1 | `0080_motorklassen.sql` | vor dem Deploy von PR 1 |
| 2 | `0081_freie_fahrt_motorklasse_belegt.sql` | unmittelbar nach 0080, vor dem Deploy von PR 2 |
| 3 | `0082_motorklasse_backfill_freie_fahrten.sql` | nach 0080; an keinem Deploy hängend, und direkt nach 0080 ohnehin ein No-op |

Warum die Reihenfolge hier ausdrücklich steht: Die Abschnitte unten sind
nach Neuigkeit sortiert, also 0082 vor 0081 vor 0080 — die Lesereihenfolge
ist nicht die Einspielreihenfolge.

## Eingespielt: 0080, 0081, 0082 und 0084 (2026-09-13, Produktion)

Alle vier in einer Sitzung, in dieser Reihenfolge, **vor** dem Deploy des
Codes, der sie braucht — der Motorklassen- und Creator-Code lag zu diesem
Zeitpunkt auf `staging`, nicht auf `main`. Ledger-Einträge (`apply_migration`
stempelt einen Zeitstempel als `version`, nicht die Dateinummer — eine Suche
nach `0080` findet sie also nicht):

| Datei | Ledger-`version` |
| --- | --- |
| `0080_motorklassen` | `20260913184239` |
| `0081_freie_fahrt_motorklasse_belegt` | `20260913190118` |
| `0082_motorklasse_backfill_freie_fahrten` | `20260913191520` |
| `0084_creator_links` | `20260913191653` |

**Mengengerüst vorab erhoben** (die Zahlen, die `0080` und `0082` im Kopf
verlangen): `route_completions` 9 Zeilen, `vehicles` 6 Zeilen. Der
Tabellen-Rewrite durch die `STORED`-Spalte betraf damit 9 Zeilen.

### Gegenprobe, alles zurückgelesen statt angenommen

| Prüfung | Ergebnis |
| --- | --- |
| `vehicles.hubraum_ccm` / `leistung_kw` | ✅ `integer` / `numeric` |
| `route_completions.motorklasse_gewertet` | ✅ `is_generated = ALWAYS` |
| Funktionen 0080 (5 Stück) | ✅ alle vorhanden |
| Formel-Stichprobe | ✅ `motorrad 11kW/125→moto_a1`, `11kW/250→moto_a35`, `auto 111kW→auto_bis220`, ohne kW → `NULL` |
| Trigger | ✅ `route_completions_motorklasse`, `vehicles_leistung_gesperrt` |
| Indizes | ✅ beide partiellen Indizes |
| `EXECUTE` auf `set_motorklasse()` | ✅ `anon` false, `authenticated` false |
| Views tragen `motorklasse` **als letzte Spalte** | ✅ `leaderboard_completions`, `route_leaderboard` |
| `save_free_ride_with_segments` | ✅ `SECURITY INVOKER`, `motorklasse_belegt` in **beiden** INSERTs, Grants aus 0050/0051 erhalten (`anon` false, `authenticated` true) |
| `0082`-Wirkung | ✅ **0 Zeilen** — kein Fahrzeug trägt `leistung_kw`, der dokumentierte No-op-Fall |
| `creator_links` RLS + Policy | ✅ `relrowsecurity = true`, 1 Policy, 4 CHECK-Constraints |
| `creator_links` Grants | ✅ `anon` **keine**, `authenticated` `INSERT/SELECT/UPDATE/DELETE` |
| `creator_link_aufloesen` | ✅ `SECURITY DEFINER`, `search_path=public, pg_temp`, `EXECUTE` von `PUBLIC` entzogen, an `anon` vergeben |
| Nutzdaten unverändert | ✅ 9 Fahrten / 6 Fahrzeuge vor und nach |

**Verhaltenstest als `anon`** (in einer Transaktion mit `rollback`, Testzeile
danach nachweislich weg) — das ist die Zusage aus dem Creator-PR, hier gegen
die echte Datenbank statt gegen ein Wegwerf-Postgres:

| Fall | Ergebnis |
| --- | --- |
| Rückgabesignatur | `TABLE(code text, kanal text, kampagne text)` — `name` fehlt **strukturell** |
| bekannter Code | `code / kanal / kampagne`, **kein `name`** |
| unbekannter Code | keine Zeile |
| `null` als Code | keine Zeile — kein Auflisten möglich |
| direkter Tabellenzugriff als `anon` | verweigert, kein Grant |

### Ohne Staging-Probe — und diesmal ist geklärt, warum

`0083` musste diese Abweichung schon einmal benennen. Jetzt ist die offene
Frage beantwortet: Das verknüpfte Supabase-Konto führt **genau ein Projekt**
(`Strado`, `stecakpnuijbvjsniqto`). Ein eigenes Staging-Projekt existiert
darunter nicht. Entweder liegt es unter einem fremden Konto oder es gibt es
nicht mehr — so oder so ist `staging.strado.ch` aus diesem Konto heraus nicht
getrennt probefahrbar. **Das gehört entschieden, bevor eine Migration kommt,
die nicht rein additiv ist:** hier waren alle vier additiv (nur neue Objekte,
keine bestehende Tabelle umgebaut, keine Zeile inhaltlich geändert), bei einer
destruktiven Migration wäre das Fehlen der Generalprobe ein Stopp-Grund.

Weg zurück, falls nötig: `0084` per `drop table public.creator_links cascade`
plus `drop function public.creator_link_aufloesen(text)`; `0080` per Droppen
der zwei Trigger, fünf Funktionen, zwei Indizes und fünf Spalten;
`0081` durch Wiedereinspielen der Fassung aus `0050`. `0082` hat nichts
geschrieben und braucht keinen Rückweg.

### Nebenbefund, nicht durch diese Migrationen verursacht

`leaderboard_klassen_totals` trägt für `anon` neben `SELECT` auch
`INSERT/UPDATE/DELETE/TRUNCATE` — die Supabase-Default-Privilegien, die `0034`
und `0084` mit „erst entziehen, dann gezielt geben“ umgehen; `0080` vergibt
nur `SELECT`, ohne vorher zu entziehen. **Folgenlos:**
`pg_relation_is_updatable` liefert für die View `0`, PostgreSQL weist jeden
Schreibversuch also unabhängig vom Grant ab, und `INSTEAD OF`-Trigger gibt es
keine. Bemerkenswert ist vor allem, dass **alle** bestehenden Views dasselbe
Bild zeigen (`leaderboard_completions`, `leaderboard_user_totals`,
`route_leaderboard`, `public_fahrten`) — der Grant-Zuschnitt ist also
Hausstand, nicht Regression. Aufräumen wäre ein eigener Vorgang über alle
Views hinweg, kein Anhängsel an diese Migration.

## Eingespielt: 0082_motorklasse_backfill_freie_fahrten (2026-09-13)

*Die Überschrift stand bis zum 2026-09-13 auf „Noch NICHT eingespielt“.
Der Abschnitt darunter beschreibt weiterhin die Vorab-Überlegungen; das
Ergebnis des Laufs steht oben unter „Eingespielt: 0080, 0081, 0082 und
0084“.*

Neu mit PR „Motorklassen: globale Ranglisten“. Traegt die Motorklasse fuer
bestehende **freie** Fahrten nach, indem ein UPDATE den Trigger aus 0080
ausloest. **Setzt 0080 voraus.**

Vor dem Einspielen zaehlen — die zweite Zahl ist die erwartete Wirkung:

```sql
select count(*) from public.route_completions
 where art = 'frei' and fahrzeug_id is not null and motorklasse is null;

select count(*) from public.route_completions rc
  join public.vehicles v on v.id = rc.fahrzeug_id
 where rc.art = 'frei' and rc.motorklasse is null and v.leistung_kw is not null;
```

Ist die zweite Zahl 0, ist die Migration ein No-op — der Normalfall direkt
nach 0080, weil dann noch niemand eine Leistung eingetragen hat. Sie ist
idempotent und kann spaeter gefahrlos erneut laufen; sinnvoll ist das erst,
wenn Fahrzeuge Leistungsangaben tragen.

Die zweite Zahl ist zugleich die Zahl der Zeilen, die überhaupt geschrieben
werden: Fahrten an Fahrzeugen ohne Leistungsangabe fasst die Migration nicht
an, weil `public.motorklasse()` dafür immer `null` liefert (0080) und ein
UPDATE die Zeile also nur schreiben würde, ohne etwas ändern zu können.

**Streckenfahrten sind bewusst ausgenommen.** Der Trigger
`route_completions_recompute_coverage` (0052) feuert auf jedem UPDATE und
setzt fuer `art = 'strecke'` `ist_oeffentlich := ist_oeffentlich and
coverage >= 75` — mit der seit 0078 geaenderten Formel. Ein Backfill ueber
Streckenfahrten wuerde also oeffentliche Bestandsfahrten still auf privat
setzen. `docs/audit/README.md` haelt zu 0078 fest: „Existing rows are not
re-scored; the trigger only runs on write." Das bleibt so.

Die Migration meldet ihr Ergebnis per `raise notice` mit **drei** Zahlen —
diese Zeile gehört nach dem Lauf ins Protokoll:

| Zahl | bedeutet |
| --- | --- |
| gesetzt | Fahrten, die jetzt tatsächlich eine Klasse tragen |
| uebersprungen | Fahrten, die am klassenabhängigen Tempo-Deckel aus 0080 scheiterten und unverändert ohne Klasse bleiben |
| unberuehrt | Fahrten, deren Fahrzeug keine Leistungsangabe trägt — gar nicht erst geschrieben |

Die dritte Zahl kam durch die CodeRabbit-Review zu PR 4 dazu: vorher zählte
die Migration diese Fahrten als „gesetzt“ und meldete damit eine Wirkung, die
es nicht gab. Wer die erste Zahl als Deploy-Protokoll liest, hätte sich auf
eine falsche Zahl verlassen.

## Eingespielt: 0081_freie_fahrt_motorklasse_belegt (2026-09-13)

*Überschrift am 2026-09-13 umgestellt, siehe oben.*

Neu mit PR „Motorklassen: belegte Klasse aus dem Track“. Erweitert
`save_free_ride_with_segments` (0050) um `motorklasse_belegt` in beiden
INSERTs. **Setzt 0080 voraus** (die Spalte muss existieren) und gehört
unmittelbar danach eingespielt.

**Auch diese Migration muss vor dem Deploy von PR 2 liegen, nicht nur mit ihm
zusammen — und der Ausfall ist hier ein stiller.** `logFreeRide()` in
`lib/actions/completions.ts` schickt `motorklasse_belegt` im jsonb-Argument
mit. Eine PostgreSQL-Funktion liest aus einem `jsonb` nur die Schlüssel, nach
denen sie fragt; ein unbekannter Schlüssel löst keinen Fehler aus, sondern
wird ignoriert. Läuft der Code also gegen die alte Fassung der Funktion, wird
jede freie Fahrt ohne Belegwert gespeichert — ohne Fehlermeldung, ohne
Log-Eintrag, und nachtragen lässt es sich nicht: der rohe Trail mit
Zeitstempeln existiert nur während des Speicherns (0044). Die Fahrten aus
diesem Fenster sind dauerhaft unbelegt.

`create or replace` erhält die Rechte: der Entzug für `anon` aus 0051 und das
`EXECUTE` für `authenticated` aus 0050 bleiben. Keine Datenänderung.

Danach prüfen, dass **beide** INSERTs die Spalte tragen — nicht nur, dass der
Name irgendwo in der Definition vorkommt:

```sql
-- Die Definition an jedem INSERT auf route_completions aufteilen: es muss
-- genau zwei geben (Fahrt und Segmente), und jeder muss die Spalte nennen.
select (count(*) = 2) and bool_and(teil like '%motorklasse_belegt%') as ok
  from unnest(
         (string_to_array(
            pg_get_functiondef(
              'public.save_free_ride_with_segments(jsonb,jsonb)'::regprocedure),
            'insert into public.route_completions'))[2:]
       ) as teil;
```

Die Signatur steht ausgeschrieben, damit die Abfrage nicht versehentlich eine
gleichnamige Funktion in einem anderen Schema prüft; existiert die Funktion
nicht, bricht der Cast mit einem Fehler ab statt leer zurückzukommen. Der Test
ist textuell und hängt daran, wie 0081 die INSERTs schreibt — wer die
Migration umformuliert, passt ihn mit an.

## Eingespielt: 0080_motorklassen (2026-09-13)

*Überschrift am 2026-09-13 umgestellt, siehe oben.*

Neu mit PR „Motorklassen: Datenmodell und Klassenformel“.

**Diese Migration muss VOR dem Deploy von PR 1 eingespielt sein, nicht nur
zusammen mit ihm.** `insertVehicleFromFormData()` in `lib/actions/vehicles.ts`
— die gemeinsame Grundlage von `addVehicle` und `addVehicleInline` — schickt
`hubraum_ccm` und `leistung_kw` bei **jedem** Insert mit, auch wenn beide
Felder leer sind und `null` übertragen wird. Auf dem Schema vor 0080 gibt es
diese Spalten nicht, also schlägt **jedes** Anlegen eines Fahrzeugs fehl, nicht
nur eines mit Leistungsangabe. Eine frühere Fassung dieses Abschnitts sagte
„schlägt fehl, sobald `hubraum_ccm`/`leistung_kw` mitgeschickt werden“ — das
klang nach einer Bedingung und war eine Fehleinschätzung; gefunden hat sie die
CodeRabbit-Review zu PR 1.

Das Fahrzeug-Anlegen ist Teil des Kern-Loops (Schritt 5, Fahrt-Fazit): Ohne die
Migration bricht der Weg dorthin ab, sobald jemand ein Fahrzeug hinzufügen
will.

Vor dem Einspielen zählen — die Migration entstand ohne Datenbankzugriff, die
Zahlen sind nicht erhoben:

```sql
select count(*) from public.route_completions;  -- STORED generated column
select count(*) from public.vehicles;           -- schreibt die Tabelle einmal neu
```

In **einer** Sitzung einspielen: Spalten, Funktionen, Trigger und Views hängen
voneinander ab. Danach prüfen, dass alle Objekte existieren:

```sql
select proname from pg_proc
 where proname in ('motorklasse','motorklasse_rang','motorklasse_hoehere',
                   'set_motorklasse','vehicles_leistung_einfrieren');
select tgname from pg_trigger
 where tgname in ('route_completions_motorklasse','vehicles_leistung_gesperrt');
select column_name, is_generated from information_schema.columns
 where table_name = 'route_completions' and column_name like 'motorklasse%';
select count(*) from public.leaderboard_klassen_totals;
```

Der letzte Punkt ist der wichtigste und nicht selbstverständlich:
`motorklasse_gewertet` ist `generated always … stored` und wird aus einer
Spalte berechnet, die ein BEFORE-Trigger setzt. PostgreSQL berechnet
generierte Spalten nach den BEFORE-Triggern — nach dem Einspielen mit einer
echten Testfahrt gegenprüfen, dass `motorklasse_gewertet` tatsächlich gefüllt
ist und nicht null bleibt.

Keine der drei `create or replace view` benennt eine Spalte um; die Views
hängen nur an. Grants bleiben deshalb erhalten, und
`leaderboard_user_totals` braucht keine Änderung.


## Eingespielt: 0084_creator_links (2026-09-13)

*Überschrift am 2026-09-13 umgestellt, siehe oben.*

`0080_creator_links.sql` legt die Tabelle der Creator-Einstiegscodes an
(`/c/<code>`, verwaltet unter `/moderation/creator`) plus die
`SECURITY DEFINER`-Funktion `creator_link_aufloesen(text)`, über die der
öffentliche Weg läuft.

**Der Code dazu ist bereits gemergt und funktioniert ohne die Tabelle
nicht.** Ohne sie liefert `/c/<code>` für jeden Code die Startseite ohne
Zuordnung, und `/moderation/creator` zeigt eine leere Liste — beides ohne
sichtbaren Fehler. Das ist genau das Muster, das weiter oben unter
„Nachgezogene Migrationen" steht: grünes CI sagt nichts über das Schema.

Reihenfolge wie üblich: erst Staging-Datenbank, dann Produktion.

Gegengeprüft wird an den Objekten, nicht am Ledger:

```sql
-- Tabelle da?
select count(*) from public.creator_links;

-- Funktion da, und hat anon nur sie und nicht die Tabelle?
select has_function_privilege('anon', 'public.creator_link_aufloesen(text)', 'execute') as fn,
       has_table_privilege('anon', 'public.creator_links', 'select')                    as tabelle;
-- erwartet: fn = true, tabelle = false
```

Die Migration wurde vor dem Merge gegen ein leeres Postgres 16 mit
nachgebildeter `auth`/`profiles`-Umgebung durchgespielt: Constraints,
Policy, Grants und die Funktion verhalten sich wie beschrieben. Das ersetzt
die Einspielung nicht, es ersetzt nur die Überraschung dabei.

## Nachgezogene Migrationen (2026-09-02/03)

Bei einer vollständigen Prüfung der Datenbank fiel auf, dass mehrere bereits
nach `main` gemergte Migrationen nie eingespielt worden waren. Die Folge waren
zwei Fehlerbilder in Produktion: das Speichern einer Fahrt schlug fehl, und
die Meldefunktion für Strecken/Bewertungen (PR #73) lief ins Leere, weil die
Zieltabellen gar nicht existierten.

Nachträglich angewendet:

| Datei(en) im Repo | Eintrag im Ledger |
| --- | --- |
| `0041_rating_cooldown_covers_edits.sql`, `0041_route_proposal_cooldown.sql` | `0041_cooldowns_nachgezogen` |
| `0043_content_reports.sql` | `0043_content_reports_nachgezogen` |
| `0044_freie_fahrten.sql` | `0044_freie_fahrten` |
| `0045_freie_fahrten_teilen.sql` | `0045_freie_fahrten_teilen` |
| `0046_fahrt_meldungen.sql` | `0046_fahrt_meldungen` |

`0042_account_deletion.sql` wurde **bewusst nicht** nachgezogen: sein einziger
Inhalt, `anonymize_own_account()`, existiert in der Datenbank bereits in der
neueren Fassung aus `0045_freie_fahrten_teilen.sql`. Ein Nachziehen von 0042
würde diese Funktion auf den älteren Stand zurücksetzen und das Nullen der
Track-Spalten wieder verlieren.

Die beiden `0041_*`-Dateien teilen sich denselben Zahlenpräfix. Das ist eine
Altlast aus zwei parallelen Branches; sie bleibt bestehen, weil eine
eingespielte Migration nicht nachträglich umbenannt wird.

## Doppelte Nummernpräfixe

Der `0041`-Fall ist kein Einzelfall geblieben. Aktuell gibt es **sieben**
doppelt vergebene Präfixe, jeweils aus parallelen Branches, die unabhängig
voneinander dieselbe nächste Nummer gezogen haben:

| Präfix | Dateien |
| --- | --- |
| `0034` | `0034_profiles_column_grant_hardening.sql`, `0034_public_fahrten_foto.sql` |
| `0041` | `0041_rating_cooldown_covers_edits.sql`, `0041_route_proposal_cooldown.sql` |
| `0053` | `0053_gefolgt_von_feature.sql`, `0053_kudos_gesehen.sql` |
| `0054` | `0054_leaderboard_user_totals.sql`, `0054_sichtbarkeit_standardmaessig_aktiv.sql` |
| `0059` | `0059_fahrtstatistiken_serverseitig_erzwingen.sql`, `0059_premium_abo_zustand.sql` |
| `0060` | `0060_premium_funktionen_execute_entziehen.sql`, `0060_private_strecken_aus_oeffentlichen_views.sql` |
| `0105` | `0105_strecken_verkehr.sql` (Ledger `20260918121129`), `0105_tempolimits_quellen_amtlich.sql` (Ledger `20260918122212`) — beide eingespielt |

Die beiden letzten Paare sind der unangenehmste Fall dieser Liste: Bei
`0059` wie bei `0060` liegt jeweils die **Sicherheitsmigration** auf der
Seite, die nicht eingespielt ist — `0059_fahrtstatistiken…` ist der Fix zu
Audit-Befund A1, `0060_private_strecken…` der zu A3. Beide sind nach `main`
gemergt und warten seither.

Seit `scripts/check-migration-prefixes.mjs` (in CI vor Lint/Test/Build)
kann kein neues Paar mehr unbemerkt dazukommen — *innerhalb eines Branches*.
Das siebte (`0105`) entstand trotzdem: zwei Branches, beide für sich grün,
beide Hälften vor dem Zusammenführen eingespielt. Die sieben bestehenden
stehen dort als Altbestand und sind vom Fehlschlag ausgenommen; die Liste
darf nur kürzer werden.

Warum das zählt: `supabase_migrations.schema_migrations.version` ist ein
Primary Key. Zwei Dateien mit demselben Präfix können dort **nicht beide**
unter ihrer Nummer stehen — eine Hälfte wird entweder unter einem
abweichenden `version`-Wert eingetragen (wie beim `0041`-Paar oben) oder gar
nicht. Ein Ledger-Eintrag `0053` beweist deshalb nicht, dass beide
`0053_*`-Dateien gelaufen sind.

Beim Abgleich vor einem Deploy zählt bei diesen Präfixen deshalb der
tatsächliche **Effekt** jeder einzelnen Datei — und blosse Existenz eines
Objekts reicht dafür nicht, denn die betroffenen Dateien ändern unter
anderem Grants, View- und Funktionsdefinitionen, Trigger und
Spalten-Defaults. Pro Datei prüfen: aktuelle Definition zurücklesen
(`pg_get_viewdef`, `pg_get_functiondef`, `pg_policies`), Grants über
`aclexplode(...)`, Trigger und Constraints, Spalten-Defaults, und bei
einem Backfill die Daten selbst. Das ist dieselbe Anforderung wie in
`.agents/deployment.md` — bei doppelten Präfixen gilt sie nur zwingend
für beide Hälften einzeln.

**Vor dem Anlegen einer neuen Datei** die höchste Nummer nicht nur auf `main`
prüfen, sondern auch in allen offenen PRs — dort entsteht die Kollision.
Lässt sie sich nicht vermeiden, gehört sie im selben Commit in diese Tabelle.

## Eingespielt: 0059_fahrtstatistiken und 0060_private_strecken (2026-09-08)

Die beiden Sicherheitsmigrationen aus den doppelten Präfixen sind seit
2026-09-08 in Produktion, Ledger-Einträge unter ihren Dateinamen. Der
Abschnitt hier hiess bis dahin „Nicht eingespielt (Stand: 2026-09-06)" und
beschrieb den Gegenzustand — sie schliessen Audit-Befund A1 (Bein 1) und A3.

Vorher gezählt statt gehofft; alle fünf Zahlen waren **0**:

| Vorprüfung | Ergebnis |
| --- | --- |
| Zeilen ausserhalb der vier Bänder aus `0059` (Distanz, Dauer, Höhenmeter, Tempo) | 0 |
| Zeilen ausserhalb des Track-Distanz-Bandes (`0.9 × st_length` … `3 × st_length + 1`) | 0 |
| öffentliche freie Fahrten ohne Track | 0 |
| Strecken mit `ist_privat = true and status_ok = true` | 0 |
| Fahrten auf nicht freigegebenen oder privaten Strecken | 0 |

Deshalb verschwindet aus keiner der drei Views eine sichtbare Zeile, und
keine Bestandszeile wird durch die `NOT VALID`-Constraints eingefroren. Die
Namen der vier Constraints kollidieren nicht mit denen aus `0074` — geprüft,
bevor `add constraint` lief, weil ein Namenskonflikt die ganze Migration
abgebrochen hätte.

Gegenprobe nach dem Einspielen:

| Prüfung | Ergebnis |
| --- | --- |
| Trigger `route_completions_enforce_stats` vorhanden | ja |
| `enforce_route_completion_stats` EXECUTE | nur `postgres`, `service_role` |
| die vier Constraints vorhanden | 4 von 4 |
| `route_leaderboard` / `route_photos` / `leaderboard_completions` tragen den Filter | ja / ja / ja |
| Zeilen in diesen Views danach | 3 / 0 / 7 (unverändert) |

Was damit **nicht** erledigt ist: A1 Bein 2 — `dauer_sekunden` bleibt eine
clientseitige Uhr. `0059` benennt das am Dateiende selbst als Restrisiko, und
es braucht eine Produktänderung (serverseitig gestartete Fahrt), keine
Migration.

## Neu bewertet: 0042 und 0058 sind Altlast, nicht Rückstand

Beide standen hier als „nicht eingespielt" mit der Begründung, `0058` setze
`profiles.geloescht_am` voraus und `0042` lege die Spalte an. Diese Begründung
ist **überholt**: `0076_anonymize_account_parametrisiert.sql` legt die Spalte
selbst an (`add column if not exists`, ausdrücklich „damit diese Migration
unabhängig davon läuft, ob 0042/0058 je nachgezogen werden"). Am 2026-09-08 in
`information_schema.columns` nachgesehen — die Spalte existiert.

Damit dreht sich die Frage um: nicht mehr „warum geht 0058 nicht?", sondern
„was fehlt noch aus 0058?" — und die Antwort ist **nichts**. Der Vergleich
Zeile für Zeile:

| Beitrag von `0058` | Zustand heute |
| --- | --- |
| `geloescht_am` anlegen | erledigt durch `0076` |
| `display_name = null` statt Platzhaltername | in `anonymize_account()` (`0076`) |
| `stripe_customer_id = null` | ebenda |
| Sichtbarkeits-Flags, `is_moderator`, `ist_premium` auf false | ebenda |
| `vehicles` löschen, Tracks nullen | ebenda (aus `0045` übernommen) |
| — | `0076` löscht zusätzlich die `subscriptions`-Zeile, was `0058` nicht tut |

**Keine der beiden Dateien darf noch eingespielt werden**, und das ist eine
schärfere Aussage als „muss nicht".

Der Ablauf im Einzelnen, weil eine frühere Fassung dieses Absatzes ihn falsch
beschrieb (Korrektur vom 2026-09-14): `0058` bricht schon **vor** dem
gefährlichen Teil ab. Zeile 60 macht ein blankes
`alter table public.profiles add column geloescht_am timestamptz;` — ohne
`if not exists`, und die Spalte gibt es seit `0076` längst. Die Migration
scheitert also an genau der Stelle, und in einer Transaktion angewendet wird
gar nichts geschrieben.

Das ist aber kein Grund zur Entwarnung, sondern nur der Grund, warum bisher
nichts passiert ist. Entfernte jemand diese eine Zeile, um die Datei „wieder
lauffähig" zu machen, käme der Rest zum Zug: ein
`create or replace function public.anonymize_own_account()` mit dem alten,
eigenständigen Rumpf. Das überschriebe die dünne Hülle aus `0076`, drehte die
Löschung auf den Stand davor zurück (stehenbleibende `subscriptions`-Zeile →
`premium_abgleich()` setzt das gelöschte Konto nachts wieder auf Premium) und
erteilte obendrein den Grant an `authenticated` neu, den
`supabase/migrations/ausstehend/` gerade entziehen soll. Dieselbe Falle wie
bei `0042`, nur eine Migration weiter.

Sie bleiben im Verzeichnis liegen, weil eine Migrationshistorie append-only
ist (Kernregel 9) — aber als Historie, nicht als offener Posten.

## Eingespielt: 0079 (2026-09-08)

`0079_kontingent_trigger_execute_entziehen.sql` entzieht
`private_strecke_kontingent_pruefen()` das EXECUTE-Recht von `PUBLIC`, `anon`
und `authenticated`. `0067` hatte die Trigger-Funktion angelegt und den Entzug
vergessen — genau die Falle, die weiter unten unter „Was aus einer Migration
heraus nicht geht" beschrieben ist, diesmal in der Variante „gar nicht erst
versucht". Der Supabase-Advisor meldete sie unter
`anon_security_definer_function_executable`.

Gemessen, nicht angenommen: vorher `PUBLIC, anon, authenticated, postgres,
service_role`, nachher `postgres, service_role`. Damit steht sie wie jede
andere Trigger-Funktion im Schema (`enforce_completion_cooldown`,
`enforce_completion_photo_limit`, `enforce_rating_cooldown`,
`enforce_route_proposal_cooldown`, `handle_new_user`). `darf_private_strecke_anlegen()`
behält `authenticated` — die ist bewusst für den angemeldeten Aufrufer da.

## Eingespielt: 0083_feedback (2026-09-13)

`0083_feedback.sql` legt die Tabelle `public.feedback` samt Policies,
Spalten-Grants und Cooldown-Trigger an — die Datenbankseite von „Feedback
senden" in den Einstellungen. Eingespielt in **Produktion** am 2026-09-13,
vor dem Deploy des Codes, der sie braucht (PR #202).

**Ohne Staging-Probe.** Der Abschnitt „The staging environment" in
`AGENTS.md` beschreibt eine eigene Supabase-Instanz für Staging; von der
Sitzung aus, die diese Migration eingespielt hat, war sie nicht erreichbar —
das verknüpfte Supabase-Konto führt genau ein Projekt, und dessen Ledger ist
der Produktionsstand. Ob das Staging-Projekt unter einem anderen
Supabase-Konto liegt oder nicht mehr existiert, ist damit **nicht**
beantwortet; wer das nächste Mal eine Migration einspielt, klärt es besser
vorher, statt es wie hier zu umgehen.

Vertretbar war es, weil die Migration rein additiv ist: sie legt nur neue
Objekte an, fasst keine bestehende Tabelle und keine bestehende Zeile an.
Der Weg zurück wäre `drop table public.feedback cascade` plus
`drop function public.enforce_feedback_cooldown()`.

**Der Ledger-Eintrag heisst `20260913122119 0083_feedback`**, nicht `0083` —
das MCP-Werkzeug `apply_migration` stempelt einen Zeitstempel als `version`.
Ein `select ... where version = '0083'` findet also nichts, obwohl die
Migration läuft. Dasselbe Muster wie bei den Einträgen ab
`20260901151128` weiter oben; massgeblich sind die Objekte.

Gegenprobe nach dem Einspielen, alles gemessen statt angenommen:

| Prüfung | Ergebnis |
| --- | --- |
| `feedback` existiert, RLS aktiv | ja / `relrowsecurity = true` |
| Policies (`pg_policies`) | 3: INSERT (authenticated), SELECT + UPDATE (Moderatoren) |
| `with_check` der Update-Policy | `bearbeitet_von = auth.uid()` — gesetzt, also nicht der Defekt aus 0071 |
| Grants `authenticated` | `INSERT(user_id, kategorie, nachricht)`, `SELECT`, `UPDATE(status, bearbeitet_am, bearbeitet_von)` |
| Grants `anon` | keine (kein Eintrag) |
| Check-Constraints | 3: `kategorie`, `char_length(nachricht) 10…2000`, `status` |
| Fremdschlüssel | `user_id` → `auth.users` ON DELETE CASCADE, `bearbeitet_von` → ON DELETE SET NULL |
| Index | `feedback_status_erstellt_am_idx (status, erstellt_am)` |
| Trigger | `feedback_cooldown` vorhanden |
| `has_function_privilege(…, 'enforce_feedback_cooldown()', 'EXECUTE')` | `anon` false, `authenticated` false |
| Zeilen | 0 |

Nicht geprüft, weil dafür in die Produktionstabelle geschrieben werden
müsste: dass der Cooldown-Trigger bei einer zweiten Einsendung innerhalb von
60 Sekunden tatsächlich `cooldown_active` wirft. Sein Aufbau entspricht
Zeile für Zeile den Triggern aus `0024`/`0041`, die laufen.

Der Präfix `0083` war bewusst gewählt statt `0080`: `0080` lag damals in
zwei offenen Branches (`claude/creator-tracking-links-plan-j6oiwl`,
`claude/motorklassen-vergleich-feature-20uan8`), `0081` und `0082` je in
einem weiteren.

Beim Zusammenführen auf `staging` ist genau diese Kollision dann doch
aufgetreten — zwei Dateien mit dem Präfix `0080`, jede für sich grün,
zusammen rot. Aufgelöst durch Umbenennen der Creator-Migration auf
`0084`; die Motorklassen-Seite behielt `0080`, weil `0081` und `0082`
auf ihr aufbauen und sonst drei Dateien statt einer umzunummerieren
gewesen wären. Keine der beiden war eingespielt, das Umbenennen fällt
also nicht unter Kernregel 9. Das siebte Kollisionspaar ist damit nicht
entstanden.

## Was aus einer Migration heraus nicht geht

`public.spatial_ref_sys` (PostGIS-Referenztabelle) gehört `supabase_admin`,
nicht `postgres`. Weder `alter table ... enable row level security`
(Fehler 42501) noch ein `revoke` der Schreibrechte von `anon`/`authenticated`
funktioniert aus einer Migration heraus — Letzteres schlägt nicht einmal fehl,
sondern ist eine stille No-Op, weil der Grantor `supabase_admin` ist.
`0027_security_performance_hardening.sql` Abschnitt A behauptet, das erledigt
zu haben, ist aber wirkungslos geblieben. Der Supabase-Advisor meldet die
Tabelle deshalb dauerhaft als `rls_disabled_in_public`.

Allgemeiner: **ein `revoke` gegen einen Grantee, der die Berechtigung gar nicht
direkt hält, ist keine Fehlermeldung, sondern eine stille No-Op** (nur eine
`WARNING`). Wer Rechte entzieht, sieht vorher in `aclexplode(...)` nach, woher
das Recht kommt — von `PUBLIC`, von einem direkten Grant, oder von beidem.
`0027` Abschnitt B ist an genau dieser Falle gescheitert und wurde erst durch
`0047`/`0048` tatsächlich wirksam.

Diese Falle hat 2026-09-06 erneut zugeschlagen, diesmal in der anderen
Richtung: `0059_premium_abo_zustand.sql` entzog das Ausführungsrecht seiner
drei neuen Funktionen mit `revoke ... from public`. Wirkungslos — `anon` und
`authenticated` halten es bei Funktionen als **direkten** Grant aus Supabases
Default-Privilegien, nicht über `PUBLIC`. Nach dem Einspielen war
`apply_subscription_state` mit dem öffentlichen anon-Key aufrufbar, und die
Funktion setzt `ist_premium` für die im ersten Parameter genannte
`stripe_customer_id`: Gratis-Premium für jeden, der die Funktion aufruft.
`0060_premium_funktionen_execute_entziehen.sql` hat es korrigiert.

**Merksatz: bei Funktionen immer `revoke execute ... from anon, authenticated`
schreiben — und danach nachsehen, ob es gewirkt hat.** Der Einzeiler dafür:

```sql
select p.proname, coalesce(a.grantee::regrole::text, 'PUBLIC') as grantee
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
cross join lateral aclexplode(p.proacl) a
where n.nspname = 'public' and p.proname = 'DIE_FUNKTION';
```

## Stand der Einspielung (Prüfung 2026-09-06)

Beim Einspielen von 0059 wurde der Ledger erneut mit den Dateien im Repo
verglichen. Drei Migrationen waren damals **nicht** eingespielt; eine davon
ist seit 2026-09-07 nachgezogen.

> **Nachtrag 2026-09-14.** Die Begründungsspalte unten stand hier bis heute
> falsch: sie sagte, `profiles.geloescht_am` existiere nicht und `0058`
> scheitere deshalb. Beim Einspielen von `0087` wurde die Spalte in
> `information_schema.columns` nachgesehen — sie **existiert**, angelegt von
> `0076` per `add column if not exists`. Der Abschnitt „Neu bewertet" weiter
> oben hatte das am 2026-09-08 bereits festgehalten; diese Tabelle ist ihm nur
> nie gefolgt. Am Ergebnis ändert sich nichts, im Gegenteil — es wird
> schärfer: Beide Dateien sind nicht bloss unnötig, sie dürfen nicht
> eingespielt werden, weil `0058` die Hülle aus `0076` überschreiben und den
> Grant an `authenticated` neu erteilen würde.

| Datei | Zustand in der Datenbank |
| --- | --- |
| `0042_account_deletion.sql` | bewusst nicht eingespielt, und **nie nachzuziehen** — siehe „Neu bewertet: 0042 und 0058 sind Altlast, nicht Rückstand" |
| `0058_kontoloeschung_werte_nullen.sql` | nicht eingespielt, und **nie nachzuziehen** — ebenda |
| `0054_sichtbarkeit_standardmaessig_aktiv.sql` | **eingespielt am 2026-09-07** — die sechs Sichtbarkeits-Schalter stehen in der Produktionsdatenbank bei neuen Konten auf `true` (Opt-out) |

Zu 0054 ein Vorbehalt beim Nachprüfen: die Nummer ist doppelt vergeben
(`0054_leaderboard_user_totals.sql` trägt sie auch), der Ledger allein
beweist deshalb nicht, welche Hälfte eingespielt ist. Verifiziert wurde am
2026-09-07 an den Objekten — die Spaltenvorgaben in `pg_attrdef` für
`zeigt_fahrzeuge`, `zeigt_avatar`, `zeigt_paesse`, `zeigt_hoehenmeter`,
`zeigt_distanz` und `zeigt_follower_liste` stehen auf `true`. Damit
beschreiben Code, Produktionsdatenbank und Rechtstexte
(`docs/rechtstexte/datenschutz.md` und die veröffentlichte Fassung unter
`strado.ch/legal/datenschutz`, beide Stand 2026-09-07) denselben
Opt-out-Zustand. Die datenschutzrechtliche Prüfung der Umkehrung auf
Opt-out (Art. 7 DSG, Art. 25 DSGVO) steht weiterhin aus und ist als
offener Punkt 12 in der Datenschutzerklärung vermerkt.

## Eingespielt: 0077 (2026-09-08, vor dem Deploy)

`0077_strecken_erstellen_premium.sql` ist **eingespielt**, Ledger-Eintrag
`20260908073158` unter dem Namen `0077_strecken_erstellen_premium`. Sie
zieht die INSERT-Policy auf `routes` auf `ist_premium or is_moderator`
zusammen — eigene Strecken anlegen ist damit Premium (Produktentscheid
2026-09-07, bewusster Bruch mit dem additiven Gating aus
`docs/premium-plan.md` Abschnitt 4; die AGB ziehen in einem eigenen PR
nach). Verifiziert über `pg_policies`: `with_check` trägt den
`exists(...)`-Teil auf `profiles`.

**Sie ist auf ausdrückliche Anweisung vor dem Deploy dieses Codes
eingespielt worden — die Reihenfolge, vor der der Rest dieses Abschnitts
warnt.** Bis der Code aus diesem Branch ausgeliefert ist, gilt deshalb:
kostenlose Konten sehen weiterhin das Formular, und das Speichern
scheitert mit „Strecke konnte nicht gespeichert werden" statt mit dem
Premium-Hinweis, den erst der neue Code zeigt. Das ist ein
Übergangszustand, kein Fehler — er endet mit dem Deploy. Der Rückweg,
falls das Fenster zu lang wird:

```sql
alter policy "Angemeldete Nutzer können Strecken vorschlagen" on public.routes
  with check ((erstellt_von = (select auth.uid())) and (status_ok = false));
```

Umgekehrt (Code ohne Migration) wäre der Direktweg über PostgREST für
kostenlose Konten offen geblieben — die Server Action allein ist nur die
höfliche Hälfte der Schranke.

Gegenprobe als `authenticated`, nicht als `postgres`:

```sql
select policyname, cmd, with_check
from pg_policies
where schemaname = 'public' and tablename = 'routes'
  and policyname = 'Angemeldete Nutzer können Strecken vorschlagen';
-- with_check muss den exists(...)-Teil auf profiles tragen.
```

Erwartung: ein Konto ohne `ist_premium` und ohne `is_moderator` bekommt
auf `insert into routes` wie auf `rpc/propose_route_full` den Fehler
`new row violates row-level security policy`; ein Premium- oder
Moderatorkonto legt wie bisher an. UPDATE/DELETE-Policies auf `routes`
sind unverändert — bestehende Strecken bleiben bearbeitbar.

## Premium-Migrationen 0059–0062 (eingespielt 2026-09-06)

| Datei | Ledger-Eintrag | Bemerkung |
| --- | --- | --- |
| `0059_premium_abo_zustand.sql` | `0059_premium_abo_zustand` | mit der oben beschriebenen `revoke`-Lücke |
| `0060_premium_funktionen_execute_entziehen.sql` | `0060_premium_funktionen_execute_entziehen` | schliesst diese Lücke |
| `0061_fahrt_fotos_privater_bucket.sql` | `0061_fahrt_fotos_privater_bucket` | **nach** dem Deploy von `ad1c301` eingespielt, siehe unten |
| `0062_apply_subscription_state_identitaetspruefung.sql` | `0062_apply_subscription_state_identitaetspruefung` | ersetzt `apply_subscription_state` aus 0059 |

Der Ledger ist damit nicht mehr lückenlos aufsteigend: 0062 trägt einen
früheren Zeitstempel als 0061, weil 0061 auf den Produktions-Deploy warten
musste. Der Ledger sortiert nach Zeitstempel, nicht nach Dateinummer — beim
Abgleich mit dem Verzeichnis also nach Namen suchen, nicht nach Position.

## Premium-Migrationen 0063–0065 (eingespielt 2026-09-06)

| Datei | Was sie tut |
| --- | --- |
| `0063_eigene_abozeile_lesbar.sql` | gibt die **eigene** Zeile in `subscriptions` für `authenticated` frei — Policy auf `user_id = auth.uid()` plus Spalten-Grant ohne die Stripe-Kennungen |
| `0064_private_strecken_bestandsschutz.sql` | Freikontingent 1 private Strecke, Bestandsschutz-Tabelle, `darf_private_strecke_anlegen()` |
| `0065_gruenderplaetze.sql` | Verzeichnis der vergebenen Gründerpreis-Plätze, `gruenderplatz_beanspruchen()` und `gruenderplaetze_frei()` |

Der Gründerpreis wird seit 2026-09-07 nicht mehr verkauft. Die Tabelle und
die Funktionen aus 0065–0069 bleiben als Bestand stehen (sie benennen die
bereits vergebenen Plätze), werden aber von der Anwendung nicht mehr
aufgerufen — `lib/actions/billing.ts` und der Webhook kennen sie nicht mehr.

Alle drei liefen gegen eine praktisch leere Produktionsdatenbank: 0 Abos,
0 private Strecken, 0 Premium-Konten. Der Bestandsschutz-Backfill in 0064 hat
entsprechend **0 Zeilen** geschrieben.

## Premium-Migrationen 0066–0068 (eingespielt 2026-09-07)

Alle drei gehen auf CodeRabbit-Befunde zu PR #123 zurück.

| Datei | Was sie korrigiert |
| --- | --- |
| `0066_gruenderplaetze_erst_nach_zahlung.sql` | 0065 hat den Gründerplatz beim Klick auf „Weiter zur Zahlung" **verbraucht**. Hundert abgebrochene Checkouts hätten die Zusage aus AGB Ziff. 4.3 aufgezehrt, ohne dass ein Abo zustande kam. Jetzt: Reservierung mit Ablauf, endgültig erst mit verifizierter Zahlung. |
| `0067_private_strecken_grenze_am_schreibrand.sql` | 0064 stellte die Regel als Funktion bereit, aber nur die Server Action rief sie auf. Die Policy „Nutzer können eigene unverifizierte Strecken bearbeiten" liess einen direkten PostgREST-`UPDATE` auf `ist_privat` daran vorbei. Jetzt ein Trigger am Schreibrand. |
| `0068_gruenderplatz_ueber_customer_bestaetigen.sql` | Der Webhook kennt nur die Stripe-Kunden-Kennung, nicht die Benutzer-Kennung. Ohne diese Auflösung bliebe ein per TWINT bezahlter Platz reserviert, wenn die zahlende Person nicht zurückkehrt. |

Als Rolle `authenticated` gegengeprüft — die Umgehung ist zu:

| Prüfung | Ergebnis |
| --- | --- |
| Reservierung zählt gegen das Kontingent | belegt=1 |
| abgelaufene Reservierung zählt nicht mehr | belegt=0 |
| bestätigter Platz zählt dauerhaft | belegt=1, frei=99 |
| 1. private Strecke per direktem `UPDATE` | erlaubt (im Kontingent) |
| 2. private Strecke per direktem `UPDATE` | **blockiert:** `private_strecken_kontingent_erschoepft` |

`0067` ist der einzige `SECURITY DEFINER` in dieser Reihe, und mit Grund: der
Trigger zählt **alle** privaten Strecken des Kontos und liest den
Bestandsschutz. Als Aufrufer wäre beides von RLS gefiltert — eine Schranke,
die weniger sieht, als sie schützen soll, ist keine. `search_path` ist
gepinnt, die Funktion nimmt keine Parameter und entscheidet nur anhand von
`new.erstellt_von`, das die Schreib-Policy ohnehin auf das eigene Konto
begrenzt hat.

## Premium-Migration 0069 (eingespielt 2026-09-07)

`0069_gruenderplatz_reservierung_dicht_machen.sql` schliesst zwei Lücken in
0066 — beide aus einem CodeRabbit-Befund zu PR #123. Wie 0065–0068 ist sie
seit dem Ende des Gründerpreises (2026-09-07) nur noch Bestand: die
Funktionen existieren, kein Code ruft sie mehr auf.

1. **Die abgelaufene eigene Zeile umging die Kontingentprüfung.**
   `gruenderplatz_beanspruchen` prüfte mit `if found then` nur, ob eine Zeile
   für das Konto existiert, nicht ob deren Frist noch läuft. Eine abgelaufene
   Zeile bekam eine frische Frist, ohne dass nachgezählt wurde. Die Begründung
   in 0066 („für dieses Konto ist der Platz schon gezählt") gilt nur, solange
   die Reservierung **läuft** — genau diese Bedingung fehlte.
2. **Bestätigen nahm den Advisory Lock nicht,** Reservieren schon. Beide
   nehmen ihn jetzt.

Die Frist gilt neu **24 Stunden statt einer**. Massgeblich ist nicht die Dauer
des Checkouts, sondern wie lange Stripe die Zahlung noch annimmt: der
Gründerpreis steht fest, sobald das Abo entsteht, und ein Abo im Status
`incomplete` bleibt rund 23 Stunden bezahlbar. Mit einer Stunde konnte die
Reservierung ablaufen, jemand anders den letzten Platz nehmen — und die erste
Zahlung trotzdem noch zum Gründerpreis durchgehen.

Bewusst **nicht** umgesetzt: die Bestätigung abzulehnen, wenn die Reservierung
abgelaufen oder das Kontingent voll ist. Sie läuft erst, nachdem Stripe die
Zahlung bestätigt hat — der Preis ist dann abgebucht. Die Zeile zu verweigern
macht die Abbuchung nicht rückgängig, sie versteckt sie: das Verzeichnis
zählte 100, während 101 Leute den Gründerpreis zahlen. Die Schranke gehört an
den Anfang des Kaufs.

Gegen die Produktionsdatenbank in einer Transaktion mit `rollback` geprüft,
`p_maximum = 1`:

| Schritt | Ergebnis |
| --- | --- |
| A reserviert mit Frist 0 min | `true` |
| B nimmt den einzigen Platz | `true` |
| A erneut, Frist abgelaufen | **`false`** (vor 0069: `true`) |
| B verlängert seine laufende Frist | `true` (keine Regression) |
| B bestätigt nach Zahlung | `true`, belegt=1 |
| A nach B's Bestätigung | **`false`** |

Danach: 0 Zeilen, belegt=0, frei=100 — der Rollback hat gegriffen, es liegen
keine Testdaten in der Tabelle. Die Ausführungsrechte haben das
`create or replace` überstanden: alle fünf Gründerplatz-Funktionen stehen
weiterhin nur `postgres` und `service_role` offen, nicht `anon` oder
`authenticated`.

### Warum 0063 überhaupt sein muss

`lib/premium.ts` beantwortet "darf diese Person X?" über den an die Session
gebundenen Client, nicht über den Service-Role-Client. Der Admin-Client
umgeht RLS vollständig; ihn für eine *Berechtigungsfrage* in einem
nutzerseitigen Pfad zu verwenden hiesse, die Schranke genau dort aufzugeben,
wo sie zählt. Statt eines Umwegs also eine genauere Policy — so verlangt es
der Abschnitt „Supabase Rules" in `AGENTS.md`.

Nach dem Einspielen als Rolle `authenticated` gegengeprüft, nicht nur als
`postgres`:

| Prüfung | Ergebnis |
| --- | --- |
| `subscriptions.status` lesen | erlaubt |
| `subscriptions.stripe_customer_id` lesen | **verweigert** |
| `subscriptions.stripe_subscription_id` lesen | **verweigert** |
| `update subscriptions` | **verweigert** |
| eigenen Bestandsschutz eintragen | **verweigert** |
| fremde Abo-Zeilen | 0 Zeilen (RLS filtert) |
| `darf_private_strecke_anlegen()` | `erlaubt=t vorhanden=0 grenze=1 grund=kontingent_frei` |

Der Einzeiler dafür steht als `do $$ … set local role authenticated … $$`
im PR zu diesen Migrationen. **Rechte immer als die betroffene Rolle prüfen,
nicht als `postgres`** — als Superuser sieht jede Schranke offen aus.

### Funktionsrechte auf einen Blick

```sql
select p.proname, coalesce(string_agg(distinct a.grantee::regrole::text, ', '), '(niemand)')
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
left join lateral aclexplode(p.proacl) a on a.privilege_type = 'EXECUTE'
where n.nspname = 'public' group by p.proname;
```

Soll-Zustand: `darf_private_strecke_anlegen` bei `authenticated` (die
angemeldete Person fragt ihr eigenes Kontingent ab, die Funktion nimmt keine
Parameter); `gruenderplatz_beanspruchen`, `gruenderplaetze_frei`,
`apply_subscription_state`, `subscription_ist_premium` und `premium_abgleich`
**nur** bei `service_role`.

### 0061 ist die Ausnahme von der Reihenfolgenregel

Sonst gilt: Migration vor oder mit dem Deploy. 0061 macht den Bucket
`route-photos` privat und entwertet damit jede bereits ausgelieferte
öffentliche Foto-URL. Eingespielt, solange der alte Code läuft, zeigt jede
Fahrt sofort kaputte Bilder. Deshalb: erst der signierende Code
(`lib/storageUrls.ts`), dann die Migration.

Praktisch war das Risiko null — `storage.objects` enthielt zum Zeitpunkt der
Einspielung **kein einziges** Objekt im Bucket und `completion_photos` keine
Zeile. Der Bucket war also zu, bevor das erste Foto darin lag. Für künftige
Migrationen mit derselben Eigenschaft bleibt die Regel trotzdem: erst Deploy,
dann Einspielung, und vorher zählen, wie viele Objekte betroffen wären.

Nach der Einspielung geprüft:

```sql
select id, public from storage.buckets;                 -- route-photos: false
-- qual traegt die USING-Bedingung, with_check die von INSERT/UPDATE. Nur
-- qual abzufragen liesse eine Schreibpolicy uebersehen, die den Bucket
-- ausschliesslich ueber with_check einschraenkt — coalesce, weil die
-- jeweils andere Spalte null ist und `null like ...` nichts trifft.
select policyname, cmd, roles::text, qual, with_check
from pg_policies
where schemaname = 'storage' and tablename = 'objects'
  and (coalesce(qual, '') like '%route-photos%'
    or coalesce(with_check, '') like '%route-photos%');
-- Erwartet: "Nutzer lesen eigene Fahrt-Fotos" (SELECT, authenticated),
-- "Nutzer löschen eigene Fahrt-Fotos" (DELETE, authenticated) und
-- "Nutzer laden Fotos in eigenen Ordner hoch" (INSERT, authenticated —
-- diese steht nur in with_check). Die bedingungslose Lesepolicy für
-- {public} ist weg.
```

## 0096 — überholter Abschnitt (eingespielt am 2026-09-15)

> **Überholt, am 2026-09-24 als solcher gekennzeichnet.** Maßgeblich ist
> **„Eingespielt: 0096–0098 (Fahrtstart serverseitig, 2026-09-15,
> Produktion)"** weiter oben in dieser Datei — dieser Abschnitt hier ist der
> stehengebliebene Vorgänger von vor dem Einspielen und sagte deshalb noch
> „noch nicht angewendet", samt der daraus gezogenen Anweisung „Also nicht
> mergen". Am Katalog gegengeprüft: `fahrt_starts` existiert, die Definition
> von `route_leaderboard` nennt `dauer_quelle`, `fahrt_start_puls` (aus
> `0098`) existiert. Was hier steht, bleibt als **Prüfliste** brauchbar —
> Trigger-Reihenfolge und Grants sind damit nicht gemessen; als Stand ist es
> nicht mehr zu lesen.

`0096_fahrtstart_serverseitig.sql` **verengt** Bein 2 des Audit-Befunds A1 (die
fälschbare Fahrtdauer) — sie schliesst es nicht: das Ticket bindet eine Person
und eine Uhr, nicht den eingereichten Trail. Die A1-Tabelle in
`docs/audit/README.md` sagt genau, was offen bleibt. Die Migration liegt auf
einem Zweig und ist **nicht eingespielt**. *(Überholt — siehe den Kasten
über dieser Zeile: eingespielt am 2026-09-15.)*

Reihenfolge: **Schema zuerst, Code danach.** Der Code auf dem Zweig schreibt
`dauer_quelle`, `dauer_trail_sekunden` und `fahrt_start_id` und ruft
`fahrt_start_anlegen`/`fahrt_start_einloesen`. Ohne die Migration schlägt
jedes Speichern einer Fahrt mit einem Spaltenfehler fehl — anders als bei
`0087`, wo nur zwei Seiten betroffen waren, träfe es hier Schritt 5 der
Kernschleife. Also nicht mergen, bevor die Migration steht. *(Erledigt: die
Migration steht seit dem 2026-09-15, der Code ist gemergt.)*

Was nach dem Einspielen zu prüfen ist (die Lücke, die `0094` hatte, war
genau, dass das unterblieb):

- Liegt der Trigger `enforce_route_completion_dauer` **vor**
  `enforce_route_completion_stats`? Gleichartige Trigger laufen alphabetisch;
  `pg_trigger` nach `tgname` sortiert zeigt es.
- Hat `fahrt_start_einloesen` einen Grant für `authenticated` und **keinen**
  für `anon`? Dieselbe Falle wie `0047`, `0048` und `0091`.
- Hat `fahrt_start_anlegen` Grants für **beide** Rollen? Ein Gast muss
  aufzeichnen können.
- Liefert `route_leaderboard` wirklich nur noch Zeilen mit
  `dauer_quelle = 'server'`? Danach ist jede bestehende Bestzeit aus der
  Liste verschwunden — das ist beabsichtigt und heute fast folgenlos, weil
  die Liste ohnehin leer ist.
- Steht der Ausdrucks-Index `fahrt_starts_gast_eimer_idx` auf
  `(left(geheimnis_abdruck, 2), gestartet_am)`? Ohne ihn zählt die
  Gast-Mengenbremse bei jedem Ticket über die ganze Tabelle. `\d+
  fahrt_starts` zeigt es; `0094` hat genau diese Prüfung ausgelassen.
- Ein funktionaler Test, zurückgerollt, in vier Teilen:
  - Ticket anlegen und einlösen — das zweite Einlösen desselben Kontos muss
    **dieselbe Zahl** zurückgeben, nicht NULL (idempotent, siehe den Kommentar
    an `fahrt_start_einloesen`). NULL bedeutet umgekehrt immer, dass das
    `update` keine Zeile getroffen hat — weil die ID unbekannt ist, der
    Abdruck nicht dazu passt, ein fremdes Konto fragt oder der **erste**
    Stempel später als 24 Stunden nach dem Start käme.
  - Eine Zeile mit fremdem `fahrt_start_id` einfügen und prüfen, dass der
    Trigger sie auf `trail` herabstuft.
  - Sechs Gasttickets mit demselben Abdruck-Präfix in derselben Minute: das
    sechste muss `Zu viele Fahrtstarts` werfen, ein gleichzeitiges mit einem
    **anderen** Präfix aber durchkommen. Das ist der ganze Punkt der 256
    Eimer — ein voller Eimer darf nicht alle Gäste aussperren.
  - Ein Abdruck, der kein Kleinbuchstaben-Hex ist, muss `Ungueltiger Abdruck`
    werfen; daran hängt die Gleichverteilung über die Eimer.

Der Weg zurück ist einfach, weil die Migration nichts löscht: Trigger und
Funktionen droppen, die View auf die Fassung aus `0080` zurücksetzen, die drei
Spalten stehen lassen. `fahrt_starts` kann liegen bleiben.
