# Motorklassen — Plan

Ranglisten, die einen 125er-Roller nicht mehr gegen einen Porsche antreten
lassen. Dieses Dokument ist die Referenz für das ganze Vorhaben; es umfasst
vier Pull Requests, von denen PR 1 umgesetzt ist.

Stand: 2026-09-11. Wenn der Code diesem Dokument widerspricht, gewinnt der
Code — dann gehört diese Datei korrigiert.

## Problem

`vehicles.typ` kennt seit `0001_init.sql` nur `auto` und `motorrad`. Damit
sind ein Roller und eine Ducati dieselbe Kategorie und ein Golf und ein 911
ebenfalls. Sichtbar wird das an zwei Stellen, sehr unterschiedlich stark:

| Rangliste | Quelle | Wie stark betroffen |
| --- | --- | --- |
| Meiste Fahrten / Höhenmeter / km / Entdecker | `leaderboard_user_totals` | Mässig — das sind Volumenwerte, ein Roller sammelt km ebenso, nur langsamer. |
| **Streckenbestzeiten** | `route_leaderboard` | **Hier bricht es.** Ein 11-kW-Roller kann eine Passzeit eines 300-PS-Autos physikalisch nicht erreichen. |

## Entscheide

Getroffen, nicht mehr offen:

1. **Klassen aus Leistung und Hubraum**, nicht aus dem Fahrzeugtyp allein
   (löst das Problem nicht) und nicht aus dem Leistungsgewicht (verlangt das
   Leergewicht, das kaum jemand auswendig weiss).
2. **Die Angabe ist freiwillig.** Ohne sie zählt eine Fahrt weiter in der
   Gesamtwertung, aber in keiner Klassenliste. Ein Pflichtfeld würde das
   Inline-Formular im Fahrt-Fazit zur Hürde machen — im schlechtesten Moment.
3. **Die Klasse ist keine geschützte Profilangabe.** Sie folgt nicht
   `zeigt_fahrzeuge`, anders als `fahrzeug_typ`/`marke`/`modell` in
   `public_fahrten` (0038, 0070). Begründung: Die Klasse ist die Achse, auf
   der jemand antritt — wie die Distanz einer Fahrt —, und sie erscheint nur,
   wo der Nutzer die Fahrt ohnehin selbst veröffentlicht hat. Marke und
   Modell bleiben geschützt.
4. **Der Filter ist für alle frei**, keine Premium-Funktion. Es ist die
   Korrektur einer unfairen Rangliste, kein Zusatznutzen.
5. **Gewertet wird die höhere** aus deklarierter und aus dem Track belegter
   Klasse.
6. **Die serverseitige Zeitnahme ist nicht Teil dieses Vorhabens** — siehe
   „Ausserhalb“.

## Klassenkatalog

Motorräder folgen den Führerausweiskategorien, weil jeder Fahrer sie
auswendig kennt; für Autos gibt es keine vergleichbare gesetzliche
Einteilung, deshalb kW-Bänder. Gespeichert wird durchgehend kW (so steht es
im Fahrzeugausweis), angezeigt bei Autos PS.

| Schlüssel | Rang | Anzeige | Regel | Beispiele |
| --- | --- | --- | --- | --- |
| `moto_a1` | 1 | A1 | ≤ 125 cm³ **und** ≤ 11 kW | Vespa GTS 125, Yamaha MT-125 |
| `moto_a35` | 2 | A 35 kW | ≤ 35 kW | Honda CB500F, KTM 390 Duke |
| `moto_a` | 3 | A offen | > 35 kW | Ducati Panigale, BMW R 1250 GS |
| `auto_bis110` | 1 | bis 150 PS | ≤ 110 kW | Golf 1.5 TSI, Dacia Duster |
| `auto_bis220` | 2 | 150–300 PS | 110–220 kW | Golf GTI, Tesla Model 3 Long Range |
| `auto_ueber220` | 3 | über 300 PS | > 220 kW | Porsche 911, Tesla Model 3 Performance |
| `null` | — | Ohne Klasse | keine Leistung hinterlegt | zählt in „Alle“, in keiner Klassenliste |

Der Rang gilt nur **innerhalb** eines Fahrzeugtyps — ein Motorrad wird nie in
eine Autoklasse hochgestuft und umgekehrt. Der Präfix im Schlüssel trägt
diese Trennung.

Bewusst nicht enthalten: eine eigene Elektro-Klasse (kW misst bei einem
E-Fahrzeug genau das Richtige) und eine Mofa-Klasse (nachrüstbar, sobald sie
jemand vermisst — die Formel liegt an einer Stelle).

## Datenmodell

Die Klasse hängt an der **Fahrt**, nicht am Fahrzeug. Zwei Gründe:
`fahrzeug_id` ist `on delete set null`, wer sein Fahrzeug löscht verlöre
sonst die Klasse aller Fahrten; und wer nachträglich „11 kW“ ins Fahrzeug
schreibt, spazierte sonst mit seinen Porsche-Zeiten in die A1-Liste.

Drei Spalten auf `route_completions` (`0080_motorklassen.sql`):

| Spalte | Wer schreibt sie | Zweck |
| --- | --- | --- |
| `motorklasse` | ausschliesslich der Trigger `route_completions_motorklasse` | deklariert, aus dem eigenen Fahrzeug abgeleitet und eingefroren |
| `motorklasse_belegt` | `lib/actions/completions.ts` (ab PR 2) | was die Fahrt an Leistung mindestens verlangt hat |
| `motorklasse_gewertet` | niemand — `generated always … stored` | die höhere von beiden; **einzige** Spalte, nach der Ranglisten filtern dürfen |

Die generierte Spalte ist der stärkste Baustein: PostgreSQL weist jeden
Schreibversuch ab, der sie mitliefert — auch einen direkten
PostgREST-Aufruf. Preis: Eine spätere Verschiebung der Klassengrenzen
rechnet sie **nicht** neu; das kostet dann eine eigene Migration mit
Tabellen-Rewrite.

`motorklasse_belegt` darf client-schreibbar bleiben, obwohl `INSERT` auf
`route_completions` weiterhin gegrantet ist (Audit A1): Gewertet wird das
Maximum, ein zu niedriger Wert bewirkt also nichts und ein zu hoher schadet
nur dem Absender selbst. **Folgenlos ist das aber nur, weil der Tempo-Deckel
die gewertete Klasse prüft** — siehe oben.

### Funktionen und Trigger

- `public.motorklasse(typ, ccm, kw)` — die Formel, `immutable`,
  `search_path` gepinnt. Gegenstück: `lib/motorklassen.ts`.
- `public.motorklasse_rang(klasse)` — Rang innerhalb des Typs.
- `public.motorklasse_hoehere(a, b)` — Grundlage der generierten Spalte.
- `public.set_motorklasse()` — BEFORE-Trigger. Setzt die deklarierte Klasse
  aus dem Fahrzeug und prüft den klassenabhängigen Tempo-Deckel. Bewusst
  **ohne** `security definer`: gelesen wird nur die eigene Fahrzeugzeile
  (`v.user_id = new.user_id`), die RLS ohnehin freigibt. Der Vergleich auf
  `new.user_id` ist die eigentliche Absicherung — ein Fremdschlüssel allein
  verlangt kein Leserecht.

  Zwei Eigenschaften, die die CodeRabbit-Review zu PR 1 erst erzwungen hat:

  - **Auf dem Update-Pfad friert die Klasse ein.** `fahrzeug_id` ist
    `on delete set null` — wer sein Fahrzeug löscht, löst damit ein UPDATE auf
    *jeder* seiner Fahrten aus. Die erste Fassung des Triggers fand dann kein
    Fahrzeug mehr und setzte die Klasse auf `null`: der Fremdschlüssel
    zerstörte genau das, wogegen die Spalte an der Fahrt gedacht war.
  - **Der Tempo-Deckel prüft die gewertete, nicht die deklarierte Klasse.**
    `motorklasse_belegt` ist client-schreibbar, und ohne `fahrzeug_id` bleibt
    die deklarierte Klasse `null`. Ein direkter Insert mit
    `motorklasse_belegt = 'moto_a1'` und ohne Fahrzeug landete sonst in der
    A1-Rangliste, während der Deckel auf `null` ins Leere lief — die Fahrt
    käme mit allem durch, was unter der pauschalen 200er-Grenze aus 0059
    liegt.
- `public.vehicles_leistung_einfrieren()` — sperrt `typ`/`hubraum_ccm`/
  `leistung_kw` an einem Fahrzeug, auf das bereits eine Fahrt verweist.
  Korrektur läuft über ein neues Fahrzeug, was in der Garage sichtbar ist.
  Gehört in die Datenbank, weil die Policy „Nutzer verwalten eigene
  Fahrzeuge“ (0001) `UPDATE` per PostgREST erlaubt, auch wenn die App gar
  keinen Bearbeitungspfad anbietet.

### Views

Alle drei Änderungen **hängen nur an** und kommen deshalb mit
`create or replace` aus — anders als 0056, wo eine Spalte umbenannt wurde und
gedroppt werden musste. Die Grants bleiben unangetastet,
`leaderboard_user_totals` braucht gar keine Änderung.

- `leaderboard_completions` — `+ rc.motorklasse_gewertet as motorklasse`
- `route_leaderboard` — dieselbe Spalte; gefiltert wird in der Abfrage
- `leaderboard_klassen_totals` — **neu**, `group by user_id, motorklasse`.
  Bewusst eine eigene View neben `leaderboard_user_totals`: wer ein Auto
  **und** ein Motorrad fährt, erschiene dort sonst doppelt und „Alle“ wäre
  keine Gesamtsumme mehr.

## Schummelsicherheit

Eine selbst eingetippte kW-Zahl lässt sich nicht *bestätigen*, aber
*widerlegen*. Vier Ebenen, aufsteigend nach Wirkung:

1. **Klasse an der Fahrt einfrieren** (Trigger) — verhindert rückwirkendes
   Umdeklarieren. In PR 1 enthalten.
2. **Leistungswerte einfrieren, sobald sie zählen** — Korrektur nur über ein
   neues Fahrzeug. In PR 1 enthalten.
3. **Die Klasse aus dem Track widerlegen** — der eigentliche Hebel, PR 2.
4. **Sichtbarkeit statt Sperre** — Klasse und Spitzenwert nebeneinander,
   Meldegrund „Fahrzeugklasse passt nicht“. PR 2.

### Warum nur nach oben korrigiert wird

Dass jemand schneller war, als seine Klasse hergibt, ist ein harter
physikalischer Widerspruch. Dass jemand langsamer war, beweist nichts —
Verkehr, Nässe, Vorsicht. Die Einseitigkeit ist deshalb die Bedingung dafür,
dass diese Prüfung **keine ehrliche Fahrt bestrafen kann**: Der Porsche in A1
wird nicht abgelehnt und nicht angezeigt, er landet in „über 300 PS“.

Dasselbe Muster gibt es im Repo bereits: `lib/bewegungsprofil.ts` beurteilt
aus dem Track, ob eine Bewegung überhaupt von einem Strassenfahrzeug stammen
kann — reine Funktion, im Browser als Hinweis und serverseitig als
Speicherbedingung, mit der ausdrücklichen Haltung, dass Falsch-Positive
teurer sind als Falsch-Negative.

### Das Signal ist die Steigung, nicht die Höchstgeschwindigkeit

In der Ebene und bergab kann ein Roller kurz mithalten; am Berg schlägt das
Leistungsgewicht unmittelbar durch — und Bergstrassen sind das, was Strado
aufzeichnet. Für einen A1-Roller (11 kW, ~250 kg mit Fahrer, c_w·A ≈ 0.6 m²):

| Situation | Nötige Leistung am Rad | Mit 11 kW? |
| --- | --- | --- |
| 70 km/h an 8 % Steigung | ≈ 7.4 kW | machbar |
| 100 km/h in der Ebene | ≈ 9.1 kW | am Anschlag |
| 90 km/h an 8 % Steigung | ≈ 11.7 kW | **unmöglich** |
| 130 km/h in der Ebene | ≈ 19 kW | **unmöglich** |

> **Diese Werte sind am Schreibtisch gerechnet und nicht gegen echte
> Strado-Tracks kalibriert.** Vor dem Merge von PR 2 laufen die Schwellen über
> den vorhandenen Fahrtenbestand, mit einer Abnahmebedingung: **keine
> bestehende Fahrt darf hochgestuft werden**, solange ihr Fahrzeug plausibel
> ist. Erst dann ist die Schwelle brauchbar.

### Zwei Ebenen, weil die Datenbank die Physik nicht kann

Das Höhenprofil kommt aus einer externen Abfrage, die SQL nicht hat.

| Ebene | Wo | Wirkt auf | Schärfe |
| --- | --- | --- | --- |
| Tempo-Deckel je Klasse | Trigger `set_motorklasse()` | jeden Schreibpfad, auch direktes PostgREST | grob — ein Durchschnitt versteckt Spitzen |
| Leistungsprüfung aus Track + Höhenprofil | `lib/actions/completions.ts` | den Weg durch die App | fein |

Der Deckel gilt nur für die zwei Motorradklassen (A1: 95 km/h Schnitt,
A 35 kW: 130 km/h). Für Autos gibt es keinen entsprechend scharfen Wert — ein
110-kW-Wagen fährt jede Autobahnetappe mit, die ein 300-PS-Wagen auch fährt;
dort greift weiterhin nur die 200er-Grenze aus 0059.

### Grenze, die offen bleibt

Ein direkter PostgREST-Schreibvorgang umgeht die feine Prüfung und kann
`motorklasse_belegt` weglassen. Bewusst nicht weiter abgesichert: Wer so
schreiben kann, fälscht nach Audit-Befund A1 Bein 2 ohnehin gleich
`dauer_sekunden` — was mehr einbringt als eine geschönte Klasse. Diese Tür
schliesst die serverseitige Zeitnahme, nicht dieses Feature. Erreicht wird:
Für jeden, der die App benutzt, bringt eine Falschangabe nichts.

## Oberfläche

Keine neuen Primitive — Chips sind eine `Button`-Variante, die Klassenpille
(`components/MotorklasseBadge.tsx`) eine Badge in den bestehenden Tokens.

- **„Alle“ ist die Voreinstellung.** Ohne `?klasse=` sieht die Seite aus wie
  heute; niemand verliert eine Rangliste, in der er gerade vorne steht.
- **Auswahl über die URL**, nicht über React-State: Die Seite bleibt Server
  Component, der Zurück-Knopf funktioniert, „A1“ ist teilbar.
- **„Meine Klasse“ ist ein Sprung, keine Vorauswahl.** Automatisch
  umzuschalten hiesse, dass ein geteilter Link bei jedem anders aussieht.
- **Auf der Streckenseite nur belegte Klassen.** Global alle sechs Chips (der
  leere Zustand lädt ein), pro Strecke wären fünf leere Chips nur Rauschen.
- **Leerer Zustand fordert auf:** „Noch keine Zeit in A1 auf dieser Strecke —
  du kannst die erste sein.“
- **Klasse und Spitzenwert stehen nebeneinander.** „A1 · Spitze 168 km/h“
  widerlegt sich vor jedem Leser von selbst.
- **Eine Hochstufung wird erklärt, nie als Vorwurf formuliert.** Der
  häufigste Grund ist ein Tippfehler, nicht Betrug.

## Umsetzung

Die Reihenfolge ist so gewählt, dass **keine Klassenliste je ungeschützt
läuft**: Die Prüfmechanik landet vor der ersten Rangliste.

| PR | Inhalt | Status |
| --- | --- | --- |
| 1 | Migration 0080, `lib/motorklassen.ts` + Tests, die zwei Felder im Fahrzeugformular (auch inline im Fahrt-Fazit), Klassenpille in Garage und Fahrzeugwahl. Keine Rangliste ändert sich. | **umgesetzt** |
| 2 | `lib/klassenbeleg.ts` + Tests, Anbindung in `completions.ts`, Anzeige der Wertung und ihrer Begründung, Meldegrund. Enthält den Kalibrierungslauf. | offen |
| 3 | Streckenbestzeiten nach Klasse: Chip-Leiste, `?klasse=` im öffentlichen Endpunkt mit strikter Katalogprüfung. | offen |
| 4 | Globale Ranglisten nach Klasse, „Meine Klasse“, plus Migration 0081 (Backfill). | offen |

Der Backfill gehört bewusst **separat und später**: Zum Zeitpunkt von 0080
hat noch niemand eine Leistung eingetragen, ein Backfill wäre dort
wirkungslos. Ein `update … set motorklasse = motorklasse` löst den Trigger
für Altfahrten aus; nur Fahrten, die den Tempo-Deckel ihrer Klasse einhalten,
bekommen eine Klasse, die übrigen bleiben ohne.

## Ausserhalb dieses Vorhabens

- **Serverseitige Zeitnahme (Audit A1, Bein 2).** `dauer_sekunden` stammt aus
  Browser-Zeitstempeln; ein ×0.4 gestauchter Track passiert alle Schranken
  aus 0059. Klassenlisten vervielfachen die Zahl gewinnbarer erster Plätze
  und damit den Anreiz. Vorschlag für später: ein Lebenszeichen mit
  Server-Uhr während der Aufzeichnung als *zusätzliches* Gütesiegel
  („bestätigte Zeit“), **nie** als Speicherbedingung — Strado zeichnet
  offline auf, genau dort, wo die interessanten Strassen sind.
- **Leistungsgewicht statt kW-Bändern.** Physikalisch ehrlicher, verlangt
  aber das Leergewicht. Die Formel liegt in einer Funktion; der Wechsel
  kostet später eine Migration, keine neue Oberfläche.
- **Fahrzeugkatalog mit Autovervollständigung.** Würde Ehrlichkeit zum
  bequemsten Weg machen. Nachrüstbar, hier nur eine Abhängigkeit ohne Not.
- **Fahrzeugausweis-Upload.** Abgelehnt: Halter und Adresse drauf, also
  besonders schützenswerte Daten mit Aufbewahrungs- und Löschpflichten, dazu
  Moderationsaufwand pro Fahrzeug — und ein Bild ist in fünf Minuten
  ausgeliehen. Viel Risiko, wenig Gewinn gegenüber der Track-Prüfung.
- **Klassen-Abzeichen.** Erhöht den Anreiz zum Schummeln, solange die Uhr
  offen ist.

## Risiken

| Risiko | Umgang |
| --- | --- |
| Migrationen laufen von Hand; grünes CI sagt nichts über das Live-Schema. | 0080 in einer Sitzung einspielen — Spalten, Funktionen und Views hängen zusammen. Vorher zählen, nachher Objekte prüfen, wie bei 0059/0060 dokumentiert. |
| Zwei Quellen einer Formel (`public.motorklasse()` und `lib/motorklassen.ts`). | Grenzwerte stehen an beiden Stellen ausgeschrieben, mit gegenseitigem Verweis; `lib/motorklassen.test.ts` prüft genau diese Werte. |
| Falsch-Positive der Belegprüfung — eine ehrliche Fahrt wird hochgestuft. | Der teuerste Fehler. Abnahmebedingung in PR 2; im Zweifel Schwelle lockern. |
| Leere Klassenlisten am Starttag. | Die PR-Reihenfolge löst das: zwischen 1 und 3 sammeln sich Fahrzeugdaten. 0081 holt den Rest. |
| Generierte Spalte ist nicht rückwirkend. | Bewusst in Kauf genommen; eine Grenzverschiebung ist ohnehin eine Geschäftsregeländerung. |

## Was die Testsuite nicht abdeckt

Vitest läuft mit `environment: "node"`, es gibt kein jsdom. Abgesichert ist
nur `lib/motorklassen.ts` (und ab PR 2 `lib/klassenbeleg.ts`). Chips, Pillen,
Formularfelder und Filterleisten haben **keine** automatisierte Abdeckung —
das gehört in jede PR-Beschreibung so benannt, nicht impliziert.
