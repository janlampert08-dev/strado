# Einspiel-Checkliste für 0070–0075

Diese Migrationen sind ohne Datenbankzugriff entstanden. Alles unten ist
deshalb als **Prüfung vor dem Einspielen** formuliert, nicht als Behauptung
über den Ist-Zustand.

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

-- Alle zehn Funktionen aus 0073 vorhanden?
select p.proname, pg_get_function_identity_arguments(p.oid) as args
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname in (
     'subscription_ist_premium','apply_subscription_state','premium_abgleich',
     'darf_private_strecke_anlegen','private_strecke_kontingent_pruefen',
     'gruenderplaetze_belegt','gruenderplaetze_frei',
     'gruenderplatz_beanspruchen','gruenderplatz_bestaetigen',
     'gruenderplatz_bestaetigen_fuer_customer')
 order by 1;
```

Kommen weniger als zehn Zeilen zurück, die fehlenden Zeilen aus `0073`
auskommentieren statt die Migration scheitern zu lassen.

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
select count(*) from public.route_completions rc
  join public.profiles p on p.id = rc.user_id
 where rc.ist_oeffentlich = true
   and rc.fahrzeug_id is not null
   and p.zeigt_fahrzeuge = false;
```

**Danach prüfen**, dass die Klammer wirkt — als abgemeldeter Nutzer bzw.
mit der `anon`-Rolle:

```sql
set role anon;
select count(*) from public.public_fahrten where fahrzeug_typ is not null;
reset role;
```

Diese Zahl muss um (2) kleiner sein als vorher.

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

Gegenprobe, die jetzt scheitern **muss** (als Moderator ausgeführt):

```sql
-- Erwartung: new row violates row-level security policy
update public.route_completions
   set ist_oeffentlich = true
 where user_id <> auth.uid()
 limit 1;
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

Reine Metadatenänderung, keine Rechte, kein Rumpf. Danach:

```sql
select p.proname, p.proconfig
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proconfig is null
 order by 1;
```

Übrig bleiben dürfen nur Funktionen, die es in `0073` nicht gibt.

---

## 0074 — Constraints

`NOT VALID`, greift also nur für neue Schreibvorgänge. Vor einem späteren
`VALIDATE CONSTRAINT` den Bestand zählen:

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
keine Angriffe: erst die Berechnung korrigieren, dann validieren.

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

Der Feed-Index wird erst vollständig genutzt, wenn `lib/feed.ts`
zusätzlich nach `id` sortiert. Das ist eine App-Änderung und liegt im
Performance-PR, nicht hier.

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
- **Keine Korrektur von Altbeständen.** Weder abweichende `laenge_km`
  noch unplausible Bewegtzeiten werden umgeschrieben.
