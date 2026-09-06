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
eingespielte Migration nicht nachträglich umbenannt wird. Neue Dateien bekommen
eine eindeutige, fortlaufende Nummer.

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

Die letzte Zeile ist die folgenreichste: der Code und die Rechtstexte
beschrieben bisher ein Opt-out-Verhalten, das es in Produktion nicht gibt.
`docs/rechtstexte/datenschutz.md` beschreibt jetzt den tatsächlichen Zustand.
Vor dem Nachziehen von 0054 ist zu klären, ob die Umkehrung auf Opt-out
datenschutzrechtlich haltbar ist — nicht umgekehrt.

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
select policyname, cmd, roles::text from pg_policies
where schemaname = 'storage' and tablename = 'objects'
  and qual like '%route-photos%';
-- nur noch "Nutzer lesen eigene Fahrt-Fotos" (SELECT, authenticated)
-- und "Nutzer löschen eigene Fahrt-Fotos" (DELETE, authenticated);
-- die bedingungslose Lesepolicy für {public} ist weg.
```
