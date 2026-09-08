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

## Nicht eingespielt (Stand: 2026-09-06)

`0059_fahrtstatistiken_serverseitig_erzwingen.sql` und
`0060_private_strecken_aus_oeffentlichen_views.sql` sind nach `main` gemergt,
aber **noch nirgends angewendet** — kein SQL ist im Rahmen des Audits gegen
eine Datenbank gelaufen. Sie schließen zwei Audit-Befunde (A1 teilweise, A3
vollständig, siehe `docs/audit/README.md`), solange sie nicht eingespielt
sind, gilt in Produktion aber weiterhin der Zustand davor. Beide brauchen
einen Lauf gegen einen Supabase-Branch, bevor sie an Produktion gehen.

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
verglichen. Drei Migrationen sind **nicht** eingespielt:

| Datei | Zustand in der Datenbank |
| --- | --- |
| `0042_account_deletion.sql` | bewusst nicht eingespielt (siehe oben) — Folge: die Spalte `profiles.geloescht_am` existiert nicht |
| `0058_kontoloeschung_werte_nullen.sql` | nicht eingespielt; setzt `geloescht_am` voraus und scheitert deshalb, solange 0042 fehlt |
| `0054_sichtbarkeit_standardmaessig_aktiv.sql` | nicht eingespielt — die Sichtbarkeits-Schalter stehen in der Produktionsdatenbank weiterhin auf `false` (Opt-in), nicht auf `true` |

Die letzte Zeile ist die folgenreichste: der Code beschreibt ein
Opt-out-Verhalten, das es in Produktion nicht gibt. Auf Produktentscheid
beschreiben die Rechtstexte seit `docs/rechtstexte/datenschutz.md` (Stand
2026-09-07) **den Zustand des Codes**, also Opt-out — nicht mehr den der
Produktionsdatenbank. Damit gilt: **0054 muss eingespielt sein, bevor die
Rechtstexte in dieser Fassung veröffentlicht werden**, sonst behaupten sie
eine weitergehende Sichtbarkeit als tatsächlich stattfindet. Die
datenschutzrechtliche Prüfung der Umkehrung auf Opt-out (Art. 7 DSG,
Art. 25 DSGVO) steht weiterhin aus und ist als offener Punkt 12 in der
Datenschutzerklärung vermerkt.

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
