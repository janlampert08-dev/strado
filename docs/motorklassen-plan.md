# Motorklassen — Plan

Ranglisten, die einen 125er-Roller nicht mehr gegen einen Porsche antreten
lassen. Dieses Dokument ist die Referenz für das ganze Vorhaben; es umfasst
vier Pull Requests, alle umgesetzt.

Stand: 2026-09-11 (alle vier PRs umgesetzt). Wenn der Code diesem Dokument widerspricht, gewinnt der
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
nur dem Absender selbst.

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

Drei Terme gehen in die Schätzung ein: Hangabtrieb, Luftwiderstand (mit v³)
und **Beschleunigung** (m·a·v). Der dritte ist in der Praxis der schärfste —
ein 125er kann eine Tonne Masse nicht auf Landstrassentempo katapultieren,
auch wenn er nie besonders schnell wird.

Jede unbekannte Grösse wird so angesetzt, dass die geschätzte Leistung **zu
niedrig** herauskommt: leichtes Fahrzeug, schlanke Stirnfläche, dünne Luft,
verlustarmer Antrieb. Erst wenn selbst darunter mehr Leistung nötig war, als
die Klasse hergibt, ist die Deklaration widerlegt. Was die umgesetzte
`belegeMotorklasse()` tatsächlich liefert:

Dazu kommt ein **Sicherheitsabstand von 30 %** auf die Klassengrenze:
Hochgestuft wird erst, wenn die Schätzung die Grenze um dieses Mass
überschreitet. Der Grund ist nicht Physik, sondern Datenlage — siehe den
nächsten Abschnitt. Was dabei herauskommt:

| Fahrt | Geschätzte Mindestleistung | Klasse belegt |
| --- | --- | --- |
| Motorrad, 90 km/h flach | 4.2 kW | A1 |
| Motorrad, 90 km/h an 9 % | 8.4 kW | A1 |
| Motorrad, 130 km/h flach | 11.8 kW | A1 (Abstand greift) |
| Motorrad, 150 km/h flach | 17.8 kW | **A1 widerlegt** |
| Auto, 120 km/h an 8 % | 41.6 kW | bis 150 PS |
| Auto, zwölfmal 60→140 km/h | 111.3 kW | bis 150 PS (Abstand greift) |
| Auto, zwanzigmal 50→160 km/h | 172.1 kW | **150–300 PS** |

> **Korrektur gegenüber der ersten Fassung dieses Dokuments.** Dort stand,
> 90 km/h an 8 % Steigung seien für ein A1-Fahrzeug unmöglich (≈ 11.7 kW).
> Das galt für mittlere Annahmen (250 kg, c_w·A 0.6). Der umgesetzte Code
> rechnet mit Untergrenzen und kommt dort auf 8.4 kW — die Fahrt ist also
> **nicht** widerlegt. Die Konsequenz ist ehrlich zu benennen: **Für A1 lässt
> sich in der Ebene erst ab rund 140 km/h Dauertempo etwas beweisen**
> (mit Sicherheitsabstand), während ein echter 125er bei 100 bis 110 läuft. In dieser Lücke
> bleibt eine Falschangabe unentdeckt. Der Ausgleich dafür ist der Deckel auf
> das **Durchschnittstempo** in `set_motorklasse()` (0080, A1: 95 km/h): Der
> greift auf jedem Schreibpfad und fasst den anderen Fall — dauerhaft zu
> schnell über die ganze Fahrt statt in der Spitze. Zusammen decken die
> beiden die zwei Formen ab; einzeln keine.

### Die Eichung läuft vorwärts, nicht rückwirkend

Der Plan sah vor, die Schwellen gegen den bestehenden Fahrtenbestand zu
prüfen. **Das geht nicht.** Strado speichert den Track als vereinfachte
Geometrie **ohne Zeitstempel** (0044, `lib/track.ts`); Tempo und
Beschleunigung — die beiden Grössen, aus denen die Schätzung besteht —
lassen sich daraus nicht rekonstruieren. Wer sie aus `dauer_sekunden`
gleichmässig über die Punkte verteilt, glättet genau die Spitzen weg, um die
es geht.

Die Eichung läuft deshalb vorwärts: Die Prüfung rechnet beim Speichern (wo
der rohe Trail noch vorliegt) und schreibt nach `motorklasse_belegt`.
`scripts/motorklassen-kalibrierung.mjs` liest, was dabei herauskam, und
meldet jede Hochstufung. Jede gemeldete Zeile ist so lange ein Fehler, bis
jemand sie am konkreten Fahrzeug nachvollzogen hat.

**Und wenn zu wenige Fahrten anfallen, um überhaupt zu eichen?** Das ist die
Lage zum Startzeitpunkt, und sie ist der Grund für den Sicherheitsabstand von
30 % oben: Er ersetzt die fehlende Evidenz, indem er die Prüfung stumpfer
macht. Zwei Überlegungen tragen diese Wahl:

- Schummeln lohnt sich proportional zum Publikum. Bei wenigen Nutzern ist die
  Falschangabe kaum ein reales Problem — die unfaire Rangliste dagegen schon,
  denn die sieht jeder sofort. Die unkalibrierte Prüfung darf das Feature
  also nicht aufhalten.
- Der teure Fehler ist nicht „Schummler nicht erkannt", sondern „ehrliche
  Fahrt hochgestuft". Bei einer Handvoll Nutzern ist eine falsche Hochstufung
  sofort ein spürbarer Anteil der Nutzerbasis, der der App misstraut.

**Folge für die Reihenfolge:** PR 3 muss nicht auf einen Kalibrierungslauf
warten. Was stattdessen ansteht, sobald Fahrten vorliegen: den Abstand
überprüfen und senken.

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
- **Auswahl über die URL** auf `/leaderboards`, wo die Listen die Seite
  ausmachen: Die Seite bleibt Server Component, der Zurück-Knopf
  funktioniert, „A1“ ist teilbar.
  **Auf der Streckenseite dagegen über Client-State** (umgesetzt in
  `RouteLeaderboardPreview`): Diese Seite lädt Karte, Fotos, Bewertungen und
  Wetter mit, und die alle bei jedem Chip-Tipp neu zu berechnen wäre teuer
  für einen Filter, der nur eine Kartenliste betrifft. Der ungefilterte Stand
  kommt weiterhin serverseitig herein, die erste Ansicht ist also sofort
  vollständig; erst ein Klassen-Chip holt über den öffentlichen Endpunkt
  nach.
- **„Meine Klasse“ ist ein Sprung, keine Vorauswahl.** Automatisch
  umzuschalten hiesse, dass ein geteilter Link bei jedem anders aussieht.
- **Auf der Streckenseite nur belegte Klassen.** Global alle sechs Chips (der
  leere Zustand lädt ein), pro Strecke wären fünf leere Chips nur Rauschen.
  Bei weniger als zwei belegten Klassen verschwindet die Leiste ganz — „Alle“
  und die eine Klasse wären dieselbe Liste.
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
| 2 | `lib/klassenbeleg.ts` + Tests, Anbindung in `completions.ts` für beide Fahrtarten, Migration 0081 (RPC der freien Fahrt), Anzeige der Wertung und ihrer Begründung für den Fahrer, `scripts/motorklassen-kalibrierung.mjs`. | **umgesetzt** |
| 3 | Streckenbestzeiten nach Klasse: Chip-Leiste auf Streckenseite und Chooser, `?klasse=` im öffentlichen Endpunkt mit strikter Katalogprüfung. | **umgesetzt** |
| 4 | Globale Ranglisten nach Klasse, „Meine Klasse“, plus Migration 0082 (Backfill, nur freie Fahrten). | **umgesetzt** |

Ein Meldegrund musste nicht dazukommen: `falsche_angaben` steht seit 0043
bzw. 0046 für Strecken, Bewertungen und Fahrten bereit und deckt eine
unplausible Fahrzeugklasse mit ab.

Der Backfill gehört bewusst **separat und später**: Zum Zeitpunkt von 0080
hat noch niemand eine Leistung eingetragen, ein Backfill wäre dort
wirkungslos. Ein `update … set motorklasse = motorklasse` löst den Trigger
für Altfahrten aus; nur Fahrten, die den Tempo-Deckel ihrer Klasse einhalten,
bekommen eine Klasse, die übrigen bleiben ohne.

> **Befund bei der Umsetzung: der Backfill darf Streckenfahrten nicht
> anfassen.** Auf `route_completions` liegt seit 0052 der Trigger
> `route_completions_recompute_coverage`, der bei **jedem** UPDATE einer
> Streckenfahrt den Deckungsgrad neu rechnet und danach
> `ist_oeffentlich := ist_oeffentlich and coverage >= 75` setzt. Seit 0078
> ist die Formel eine andere als zum Zeitpunkt der Bestandsfahrten — eine
> Hin-und-zurück-Strecke, die einst 100 % erreichte, misst heute 50 %. Ein
> Backfill über Streckenfahrten hätte also öffentliche Bestandsfahrten still
> auf privat gesetzt: eine Geschäftsregeländerung als Nebenwirkung einer
> Klassen-Migration, und ein Sichtbarkeitsverlust, den kein Nutzer veranlasst
> hat. `docs/audit/README.md` hält zu 0078 ausdrücklich fest, dass bestehende
> Zeilen nicht neu bewertet werden. **0082 beschränkt sich deshalb auf freie
> Fahrten**, wo der Coverage-Trigger sofort zurückkehrt. Streckenfahrten
> bekommen ihre Klasse erst beim nächsten regulären Schreiben — alles andere
> verlangt zuerst einen bewussten Entscheid über die Neubewertung des
> Deckungsgrads.

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

Vitest läuft mit `environment: "node"`, es gibt kein jsdom. Abgesichert sind
`lib/motorklassen.ts`, `lib/klassenbeleg.ts` und die reinen Helfer in
`lib/leaderboard.ts`. Chips, Pillen,
Formularfelder und Filterleisten haben **keine** automatisierte Abdeckung —
das gehört in jede PR-Beschreibung so benannt, nicht impliziert.
