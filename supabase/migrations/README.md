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

Der `0041`-Fall ist kein Einzelfall geblieben. Aktuell gibt es **vier**
doppelt vergebene Präfixe, jeweils aus parallelen Branches, die unabhängig
voneinander dieselbe nächste Nummer gezogen haben:

| Präfix | Dateien |
| --- | --- |
| `0034` | `0034_profiles_column_grant_hardening.sql`, `0034_public_fahrten_foto.sql` |
| `0041` | `0041_rating_cooldown_covers_edits.sql`, `0041_route_proposal_cooldown.sql` |
| `0053` | `0053_gefolgt_von_feature.sql`, `0053_kudos_gesehen.sql` |
| `0054` | `0054_leaderboard_user_totals.sql`, `0054_sichtbarkeit_standardmaessig_aktiv.sql` |

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

Die letzte Zeile ist die folgenreichste: der Code und die Rechtstexte
beschrieben bisher ein Opt-out-Verhalten, das es in Produktion nicht gibt.
`docs/rechtstexte/datenschutz.md` beschreibt jetzt den tatsächlichen Zustand.
Vor dem Nachziehen von 0054 ist zu klären, ob die Umkehrung auf Opt-out
datenschutzrechtlich haltbar ist — nicht umgekehrt.
