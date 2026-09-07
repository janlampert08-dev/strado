# Einspiel-Checkliste für 0070–0075

Diese Migrationen sind ohne Datenbankzugriff entstanden. Alles unten ist
deshalb als **Prüfung vor dem Einspielen** formuliert, nicht als Behauptung
über den Ist-Zustand.

Fünf der sechs Dateien ändern ausschliesslich Schema, Policies oder
Metadaten. **`0074` schreibt Daten** — siehe den Abschnitt dort, samt
Sicherung.

Reihenfolge ist egal — die sechs Dateien hängen nicht voneinander ab. Wer
nur einen Teil einspielen will, kann das.

---

## Vorab: gilt der dokumentierte Applied-Stand noch?

`README.md` in diesem Verzeichnis hält fest, welche Dateien nicht
eingespielt sind. Diese Migrationen setzen davon zwei Dinge voraus:

- **`0021` ist eingespielt** (`routes.ist_privat` existiert) — sonst
  scheitert `0070`.
- **`0059_premium_abo_zustand`, `0062`, `0064`–`0069` sind eingespielt** —
  sonst scheitert `0073` an einer Funktion, die es nicht gibt.

```sql
-- Spalte vorhanden?
select column_name from information_schema.columns
 where table_schema = 'public' and table_name = 'routes'
   and column_name = 'ist_privat';

-- Alle zehn Funktionen aus 0073 vorhanden — mit exakt der Signatur,
-- die 0073 anspricht? Der Name allein genügt nicht: ALTER FUNCTION
-- adressiert die Identität aus Name UND Argumenttypen, eine
-- gleichnamige Funktion mit anderer Signatur ist ein anderes Objekt.
with erwartet(proname, args) as (values
  ('subscription_ist_premium',              'uuid'),
  ('apply_subscription_state',              'uuid, text, text, timestamp with time zone, boolean'),
  ('premium_abgleich',                      ''),
  ('darf_private_strecke_anlegen',          'uuid'),
  ('private_strecke_kontingent_pruefen',    ''),
  ('gruenderplaetze_belegt',                ''),
  ('gruenderplaetze_frei',                  ''),
  ('gruenderplatz_beanspruchen',            'uuid'),
  ('gruenderplatz_bestaetigen',             'uuid'),
  ('gruenderplatz_bestaetigen_fuer_customer','text')
)
select e.proname, e.args,
       (p.oid is not null) as vorhanden
  from erwartet e
  left join pg_proc p
    on p.proname = e.proname
   and pg_get_function_identity_arguments(p.oid) = e.args
   and p.pronamespace = 'public'::regnamespace
 order by 1;
```

Die Signaturen oben sind aus den Migrationen abgeleitet, nicht an einer
Datenbank gemessen — weicht eine ab, ist zuerst zu klären, welche der
beiden Seiten recht hat.

Steht in einer Zeile `vorhanden = false`, **nicht** einspielen und
**nichts** in `0073` auskommentieren. Eine fehlende Funktion heisst, dass
der dokumentierte Applied-Stand nicht mehr stimmt; das gehört
abgeglichen, bevor irgendetwas aus diesem Batch läuft. Eine Migration
für den Einspielvorgang zu bearbeiten macht die Datei zu einem anderen
Objekt als das, was hier geprüft und im PR gelesen wurde.

---

## 0070 — Views: Fahrzeug-Sichtbarkeit und `ist_privat`

**Was verschwindet.** Zwei Mengen. Vorher zählen:

```sql
-- (1) Fahrten auf privaten, freigegebenen Strecken, die aus den drei
--     Views fallen. Erwartung laut 0060: 0 — dort steht, dass kein
--     erreichbarer Schreibpfad diese Kombination erzeugt. Nicht gemessen.
select count(*) from public.route_completions rc
  join public.routes r on r.id = rc.route_id
 where rc.ist_oeffentlich = true
   and rc.art = 'strecke'
   and r.status_ok = true
   and r.ist_privat = true;

-- (2) Fahrten, bei denen bisher ein Fahrzeug sichtbar war, obwohl der
--     Besitzer zeigt_fahrzeuge abgeschaltet hat. Das ist die Menge, die
--     der Fix betrifft — hier sind Treffer NICHT beruhigend, sondern
--     genau der Befund.
--
--     Die Prädikate spiegeln die FERTIGE public_fahrten aus 0070 (Joins,
--     art/route-Zweige, v.typ statt fahrzeug_id) — sonst zählt diese
--     Abfrage Zeilen mit, die in der View gar nicht vorkommen, und die
--     Gegenprobe unten geht nicht auf. Der Besitzer-Zweig
--     (rc.user_id = auth.uid()) fehlt bewusst: die Gegenprobe läuft als
--     anon, dort ist auth.uid() null.
select count(*) from public.route_completions rc
  join public.profiles p on p.id = rc.user_id
  left join public.routes r on r.id = rc.route_id
  left join public.vehicles v on v.id = rc.fahrzeug_id
 where rc.ist_oeffentlich = true
   and (
     (rc.art = 'frei' and rc.route_id is null)
     or (rc.art = 'strecke' and r.status_ok = true and r.ist_privat = false)
   )
   and v.typ is not null
   and p.zeigt_fahrzeuge = false;
```

Dieselbe Zählung **vorher** über die noch alte View, als Ausgangswert:

```sql
set role anon;
select count(*) from public.public_fahrten where fahrzeug_typ is not null;
reset role;
```

```sql
-- (3) Der zweite Anteil am Rückgang: Fahrten auf privaten Strecken, die
--     aus der View fallen (Menge 1) und dabei ein sichtbares Fahrzeug
--     hatten. Laut 0060 erwartet: 0.
select count(*) from public.route_completions rc
  join public.profiles p on p.id = rc.user_id
  join public.routes r on r.id = rc.route_id
  left join public.vehicles v on v.id = rc.fahrzeug_id
 where rc.ist_oeffentlich = true
   and rc.art = 'strecke'
   and r.status_ok = true
   and r.ist_privat = true
   and v.typ is not null;
```

**Danach prüfen**, dass die Klammer wirkt — dieselbe `anon`-Zählung
erneut. Sie muss um genau **(2) + (3)** kleiner sein als vorher: (2) sind
die Fahrten, die in der View bleiben und nur ihr Fahrzeug verlieren, (3)
die, die ganz herausfallen und dabei eines mitgenommen haben. Erwartung
für (3) ist 0; ist sie es, ist der Rückgang genau (2).

**Nicht enthalten:** `route_leaderboard`, `route_photos` und
`leaderboard_completions` — die deckt `0060_private_strecken_aus_oeffentlichen_views.sql`
ab, das wegen der Nummernkollision weiterhin offen ist (A3).

---

## 0071 — Moderator-Policy

**Vorher**: keine Datenprüfung nötig, die Migration ändert nur eine Policy.

**Danach** muss der einzige legitime Aufrufer weiter funktionieren:
Moderation → eine gemeldete Fahrt entöffentlichen
(`lib/actions/moderation.ts:157`). Das schreibt
`{ ist_oeffentlich: false, track_oeffentlich: null }` und erfüllt das neue
`WITH CHECK` per Konstruktion.

Zwei Gegenproben, die jetzt scheitern **müssen** (als Moderator
ausgeführt). `<fremde-fahrt-id>` ist eine Fahrt eines anderen Kontos —
die Moderationswarteschlange (`/moderation`) liefert eine.

Postgres kennt kein `LIMIT` beim `UPDATE`; die Zeile wird deshalb
namentlich adressiert statt über eine Trefferbegrenzung.

```sql
-- (a) Veröffentlichen statt entöffentlichen.
--     Erwartung: new row violates row-level security policy
update public.route_completions
   set ist_oeffentlich = true
 where id = '<fremde-fahrt-id>';

-- (b) Die private Notiz eines Fremden überschreiben, im selben UPDATE,
--     das die Fahrt regelkonform entöffentlicht — das WITH CHECK allein
--     lässt das durch, der Trigger aus 0071 nicht.
--     Erwartung: notiz darf nur vom Besitzer der Fahrt geaendert werden
update public.route_completions
   set ist_oeffentlich = false,
       track_oeffentlich = null,
       notiz = 'überschrieben'
 where id = '<fremde-fahrt-id>';
```

Und eine, die weiter **gelingen** muss — der einzige legitime Aufrufer:

```sql
update public.route_completions
   set ist_oeffentlich = false, track_oeffentlich = null
 where id = '<fremde-fahrt-id>';
```

---

## 0072 — `routes`-Kennzahlen-Trigger

**Vorher**: Abweichende Altbestände sichtbar machen. Die Migration
korrigiert sie bewusst nicht.

```sql
select id, name, laenge_km,
       round((st_length(geometry) / 1000.0)::numeric, 3) as abgeleitet
  from public.routes
 where abs(laenge_km - st_length(geometry) / 1000.0) > 0.05
 order by abs(laenge_km - st_length(geometry) / 1000.0) desc;
```

Treffer sind Strecken, deren gespeicherte Länge nicht zu ihrer Geometrie
passt — bei einer Plattform mit Kilometer-Bestenliste eine eigene
Entscheidung, kein Migrationsdetail.

**Danach**: einen Streckenvorschlag über die UI anlegen
(`/strecken/neu`). Das ist der Pfad, den ein `REVOKE INSERT` gebrochen
hätte und den dieser Trigger bewusst unangetastet lässt —
`propose_route_full` ist `SECURITY INVOKER` (`0027:30`).

---

## 0073 — `search_path`

Reine Metadatenänderung, keine Rechte, kein Rumpf. Danach zählt nicht,
ob `proconfig` gesetzt ist, sondern **was** darin steht — ein von früher
stehengebliebenes `search_path=public` wäre nicht null und trotzdem nicht
das, was `0073` setzt:

```sql
-- Erwartung: alle zehn Zeilen mit gepinnt = true.
with erwartet(proname, args) as (values
  ('subscription_ist_premium',              'uuid'),
  ('apply_subscription_state',              'uuid, text, text, timestamp with time zone, boolean'),
  ('premium_abgleich',                      ''),
  ('darf_private_strecke_anlegen',          'uuid'),
  ('private_strecke_kontingent_pruefen',    ''),
  ('gruenderplaetze_belegt',                ''),
  ('gruenderplaetze_frei',                  ''),
  ('gruenderplatz_beanspruchen',            'uuid'),
  ('gruenderplatz_bestaetigen',             'uuid'),
  ('gruenderplatz_bestaetigen_fuer_customer','text')
)
select e.proname, e.args, p.proconfig,
       p.proconfig @> array['search_path=public, pg_temp'] as gepinnt
  from erwartet e
  left join pg_proc p
    on p.proname = e.proname
   and pg_get_function_identity_arguments(p.oid) = e.args
   and p.pronamespace = 'public'::regnamespace
 order by 1;
```

Der Gegenblick — was im Schema sonst noch ohne `search_path` dasteht:

```sql
select p.proname, pg_get_function_identity_arguments(p.oid) as args
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proconfig is null
 order by 1, 2;
```

Übrig bleiben dürfen nur Funktionen, die es in `0073` nicht gibt — dazu
gehören seit diesem Batch auch `routes_kennzahlen_ableiten` (0072) und
`fahrt_notiz_nur_vom_besitzer` (0071) **nicht** mehr: beide pinnen ihren
`search_path` selbst.

---

## 0074 — Constraints

Diese Migration **schreibt Daten**, als einzige im Batch. Sie kürzt
überlange `start_ort`/`region` auf 120 Zeichen, deckelt eine
`bewegte_zeit_sekunden` über der Gesamtdauer auf die Gesamtdauer und
nullt eine negative. Der Grund steht im Kopf der Datei: `NOT VALID`
heisst nur "beim Anlegen nicht durchscannen", nicht "Bestand ausgenommen"
— Postgres prüft den Constraint auch beim `UPDATE` einer bereits
verletzenden Zeile. Ohne die Korrektur wäre eine solche Zeile eingefroren
und mit ihr die Kontolöschung, die über alle Fahrten des Kontos
aktualisiert.

**Vorher zählen**, damit die Zahl der geänderten Zeilen nachher nicht
überrascht:

```sql
select
  count(*) filter (where char_length(start_ort) > 120) as start_ort_zu_lang,
  count(*) filter (where char_length(region) > 120)    as region_zu_lang,
  count(*) filter (where bewegte_zeit_sekunden < 0)    as bewegtzeit_negativ,
  count(*) filter (where dauer_sekunden is not null
                     and bewegte_zeit_sekunden > dauer_sekunden) as bewegtzeit_ueber_dauer
  from public.route_completions;
```

Die letzte Spalte dürfte Treffer liefern — `movingSeconds` hat kein
Jitter-Deadband (Audit 2026-09-06, §B, offen). Das sind Rechenaltlasten,
keine Angriffe. Die Migration deckelt sie auf einen möglichen Wert; die
Berechnung selbst bleibt ein offener Befund und gehört danach korrigiert,
sonst entstehen dieselben Zeilen neu.

Der Weg zurück ist ein Backup: `left()` und der Deckel sind nicht
umkehrbar. Auf einer Datenbank mit nennenswertem Bestand deshalb vorher
sichern — mindestens die betroffenen Zeilen:

```sql
create table if not exists public.fahrt_werte_vor_0074 as
select id, start_ort, region, bewegte_zeit_sekunden, dauer_sekunden
  from public.route_completions
 where char_length(start_ort) > 120
    or char_length(region) > 120
    or bewegte_zeit_sekunden < 0
    or (dauer_sekunden is not null
        and bewegte_zeit_sekunden > dauer_sekunden);
```

**Danach** muss dieselbe Zählung oben überall 0 ergeben; erst dann ist
ein `VALIDATE CONSTRAINT` gefahrlos.

App-Seite im selben PR: `parseTrail` (`lib/actions/completions.ts`) weist
Trails mit rückwärts laufenden Zeitstempeln jetzt ab. Das ist der Weg,
auf dem eine negative Bewegtzeit überhaupt entsteht — sonst quittiert der
neue Constraint das Speichern mit einem rohen Datenbankfehler.

---

## 0075 — Indizes

`CREATE INDEX` **ohne** `CONCURRENTLY` sperrt die Tabelle für
Schreibvorgänge. Bei der in `README.md` für den `0063`-Batch
festgehaltenen Datenmenge (0 Abos, 0 private Strecken, 0 Premium-Konten)
sind das Sekundenbruchteile.

Bei nennenswertem Bestand stattdessen ausserhalb einer Transaktion:

```sql
create index concurrently profiles_display_name_trgm_idx
  on public.profiles using gin (display_name extensions.gin_trgm_ops)
  where display_name is not null;

create index concurrently route_completions_oeffentlich_datum_idx
  on public.route_completions (datum desc, id desc)
  where ist_oeffentlich = true;
```

`pg_trgm` wird nicht blind mit `create extension if not exists ... with
schema extensions` angelegt: liegt die Erweiterung schon woanders — auf
älteren Supabase-Instanzen typischerweise in `public` — ist das ein
stilles No-op und der Indexaufbau scheitert danach an
`extensions.gin_trgm_ops`. Der `DO`-Block der Migration schiebt sie in
diesem Fall nach `extensions`. Vorher sehen, was ansteht:

```sql
select n.nspname as schema
  from pg_extension e join pg_namespace n on n.oid = e.extnamespace
 where e.extname = 'pg_trgm';
```

Kommt nichts zurück, wird sie angelegt; kommt `extensions`, passiert
nichts; kommt etwas anderes, wird sie verschoben. Bestehende
Trigramm-Indizes überstehen das — sie verweisen per OID auf die Opklasse.

Der Feed-Index wird erst vollständig genutzt, wenn `lib/feed.ts`
zusätzlich nach `completion_id` sortiert — so heisst `rc.id` in der View
(`0070`). Diese App-Änderung liegt im Performance-PR, nicht hier.

---

## Was diese Migrationen ausdrücklich NICHT tun

- **Kein Umbenennen der kollidierenden Präfixe.** `0059_fahrtstatistiken…`
  und `0060_private_strecken…` bleiben liegen. Das Umbenennen setzt einen
  Abgleich des Ledgers **und** der betroffenen Objektdefinitionen je
  Umgebung voraus — sonst wird aus einer angewendeten Migration wieder
  eine ausstehende. `scripts/check-migration-prefixes.mjs` verhindert
  ab jetzt nur, dass ein siebtes Paar entsteht.
- **Kein `REVOKE` auf `routes`.** Begründung in `0072`: der legitime
  Vorschlagspfad hängt am selben Recht.
- **Keine Korrektur abweichender `laenge_km`.** `0072` leitet die Werte
  ab jetzt beim Schreiben ab, rechnet den Bestand aber nicht nach — was
  in der Kilometer-Bestenliste steht, ist eine Produktentscheidung.
  Ausgenommen von diesem Punkt ist `0074`: dort *wird* korrigiert, weil
  ein `NOT VALID`-Constraint die verletzenden Zeilen sonst einfriert
  (Begründung im Abschnitt zu `0074`).
