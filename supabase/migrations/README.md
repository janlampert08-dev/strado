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

Der `0041`-Fall ist kein Einzelfall geblieben. Aktuell gibt es **sechs**
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

Die beiden letzten Paare sind der unangenehmste Fall dieser Liste: Bei
`0059` wie bei `0060` liegt jeweils die **Sicherheitsmigration** auf der
Seite, die nicht eingespielt ist — `0059_fahrtstatistiken…` ist der Fix zu
Audit-Befund A1, `0060_private_strecken…` der zu A3. Beide sind nach `main`
gemergt und warten seither.

Seit `scripts/check-migration-prefixes.mjs` (in CI vor Lint/Test/Build)
kann kein siebtes Paar mehr unbemerkt dazukommen. Die sechs bestehenden
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
