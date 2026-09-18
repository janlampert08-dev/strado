# Pässe: Status, Kalender, Sammlung, ruhige Zeiten

Was diese Änderung baut, warum sie so gebaut ist, und was sie ausdrücklich
nicht behauptet. Stand 2026-09-18; die Migrationen `0104`/`0105` sind
eingespielt (siehe `supabase/migrations/README.md`).

## Warum

`docs/markt/konkurrenzanalyse-schweiz.md` und die Analyse vom 2026-09-17
zeigen dieselbe Lücke: Die internationalen Apps (calimoto, Kurviger, Scenic,
REVER, Open Road, RoadStr) können Routen — aber keine von ihnen weiss, ob der
Susten heute offen ist. Die Schweizer Seiten, die es wissen (TCS-Passportal,
Pässe.Info, alpen-paesse.ch), sind Webseiten ohne Produkt: keine Aufzeichnung,
keine Sammlung, keine Community.

"Ist der Klausen schon offen?" ist von Oktober bis Juni die Frage, die in
jedem Schweizer Töff-Forum steht. Sie ist der Teil dieses Produkts, den ein
internationaler Wettbewerber nicht nebenbei mitliefert — und sie ist die
einzige Information hier, die jemanden vor einer vergeblichen Anfahrt
bewahrt.

## Die vier Teile

### 1. Passstatus (frei, nicht Premium)

Ein Pass hat einen Zustand: offen, eingeschränkt, gesperrt, Wintersperre,
oder — ehrlich — kein Stand.

**Der Status ist bewusst nicht Premium.** Wer vor einer gesperrten Strasse
steht, hat nichts davon, dass die Information hinter einer Bezahlschranke
korrekt war. Dieselbe Linie zieht `docs/premium-naechste-features.md`.

Zwei Quellen, eine Schreibstelle (`pass_status_anwenden`, 0104):

- **Der Feed**: die Verkehrsmeldungen des ASTRA über
  `opentransportdata.swiss` (DATEX II 2.3, VMZ-CH und Kantonspolizeien),
  abgeholt alle fünf Minuten von `app/api/cron/passstatus`.
- **Die Moderation**: `/moderation` → Abschnitt „Pässe". Eine Setzung von Hand
  gilt für eine gewählte Frist und wird vom Feed in dieser Zeit nicht
  überschrieben.

**Die schwächste Stelle, benannt:** DATEX II verortet eine Meldung über
ALERT-C/TMC-Ortscodes. Die Tabelle dazu ist nicht Teil des offenen
Datensatzes, sie muss beim ASTRA angefragt werden. Bis dahin wird über den
**Meldungstext** zugeordnet (`lib/passMeldungen.ts`): enge Suchbegriffe je
Pass, plus eine Tunnelregel — „Gotthard-Strassentunnel gesperrt" ist keine
Aussage über die Tremola, „Furka-Autoverlad" keine über den Furkapass. Das
kann danebenliegen, und genau dafür gibt es die Übersteuerung.

**Was der Status nicht behauptet:** „Offen" heisst „keine Sperrung gemeldet",
und die App schreibt es auch so hin. Im Kernwinter eines saisonalen Passes
(die Monatsspanne ohne ihre Randmonate) sagt sie lieber nichts, als ohne
Meldung „offen" zu behaupten. Ist der Feed über 30 Minuten still, altert
jeder Feed-Status auf „kein Stand" — ein alter Status ist schlimmer als
keiner.

### 2. Saison und Sperrkalender

Drei Angaben, jede fällt einzeln weg, wenn es sie nicht gibt:

- **Übliche Wintersperre** als Monatsband (Katalogwert, „üblich", keine
  Zusage).
- **Geplante Sperrungen**: autofreie Tage, Veranstaltungen, Bauarbeiten —
  von Moderatoren eingetragen, mit Quelle. Gesetzt sind die vier Tage von
  2026, die an Katalogpässen stattfanden (TCS-Übersicht).
- **Tatsächliche Öffnungen je Jahr**, aus dem Ereignisprotokoll. Diese Liste
  ist im ersten Jahr leer und wird mit jeder Saison wertvoller: „2026 ging
  der Susten am 28. Mai auf" kann nur sagen, wer zugesehen hat. Das ist der
  Teil, den ein Wettbewerber nicht nachkaufen kann.

### 3. Pass-Sammlung

Ein Katalog von 34 Schweizer Passhöhen (Scheitelpunkte aus OpenStreetMap,
Höhen gegen swisstopo geprüft), und dazu die Frage: welche bist du gefahren?

Gezählt wird über die **Geometrie**, nicht über die Streckenliste
(`meine_paesse`, 0104): eine Fahrt zählt für einen Pass, wenn ihr Track am
Scheitelpunkt vorbeigeht — auch eine freie Fahrt ohne Strecke. Wer über den
Klausen fährt, hat ihn befahren.

Die Liste zeigt auch die Pässe **ohne** Strecke. Diese Lücke ist die
Aufforderung, eine anzulegen, und zugleich die ehrliche Antwort auf die
Dichte-Frage aus AGENTS.md.

**Nicht angefasst:** die Kachel „Pässe befahren" auf der Profilseite zählt
weiterhin *befahrene Strecken* (auch eine Runde ums Dorf), und
`lib/achievements.ts` beschriftet ihre Meilensteine ebenso. Die Sammlung
steht als eigene Zeile daneben und zählt Passhöhen. Zwei Zahlen unter einer
Überschrift wären schlechter als zwei Zeilen; die Zusammenführung ist eine
Produktentscheidung und gehört in einen eigenen PR.

### 4. Ruhige Zeiten

Wann ist auf einer Strecke wenig los? Zwei Quellen, getrennt gezeigt, weil
sie Verschiedenes beantworten:

- **Verkehrsvorhersage** (Mapbox Directions, `depart_at`, Profil
  `driving-traffic`): je Wochentag und Stunde die vorhergesagte Fahrzeit,
  geteilt durch die ruhigste Stunde der Woche. Berechnet nachts vom Cron für
  drei Strecken je Lauf (98 Anfragen je Strecke).
- **Startzeiten auf Strado** (`strecken_startzeiten`, 0105): wann tatsächlich
  losgefahren wird. Gibt erst ab 20 Starts im letzten Jahr etwas heraus, und
  dann nur Prozente über vier Tagesfächer — bei drei Starts wäre „33 %
  Sonntagmorgen" ein Satz über eine Person.

Unterscheidet sich die Woche kaum, sagt die App genau das statt einer
Empfehlung aus Rauschen.

## Was in der Umgebung gesetzt sein muss

| Variable | Ohne sie |
| --- | --- |
| `ASTRA_API_KEY` | Kein automatischer Status. Der Cron meldet „übersprungen", jeder Pass bleibt „kein Stand", Moderatoren setzen von Hand. Nichts bricht. |
| `MAPBOX_SERVER_TOKEN` | Nur nötig, wenn `NEXT_PUBLIC_MAPBOX_TOKEN` auf URL-Herkunft beschränkt ist; sonst wird der öffentliche Token versucht. Ohne beides: kein Verkehrsprofil, der Abschnitt fehlt. |
| `CRON_SECRET` | War schon nötig; deckt jetzt drei Endpunkte statt einem. |

`vercel.json` fährt `/api/cron/passstatus` alle fünf Minuten und
`/api/cron/verkehrsprofil` nachts. Die Fünf-Minuten-Taktung ist das, was der
Feed selbst verlangt (Vollabruf höchstens täglich, dazwischen Deltas mit
einem Zeitstempel unter fünf Minuten) — sie setzt einen Vercel-Plan voraus,
der Crons häufiger als täglich zulässt (hier: Pro).

## Offen

- **Der Feed ist gegen eine echte Lieferung geprüft** (2026-09-18, 13.7 MB,
  890 Situationen): 5 Treffer, keiner davon falsch. Drei Dinge hat erst diese
  Probe gezeigt, alle drei sind behoben (0107, 0108 und die Kontextregel in
  `lib/passMeldungen.ts`): der Feed schreibt "Pass Gotthard-Pass" statt
  "Gotthardpass", ein blosser Passname trifft auch Dörfer ("Leuk/Susten") und
  Strassen ("Route Du Simplon"), und `<value>`-Elemente ausserhalb der Meldung
  verschoben den Text, an dem eine Aufhebung erkannt wird.
  **Was die Probe nicht zeigen konnte:** es ist September, keine Meldung im
  Bestand trug eine Wintersperre. Die Deutung dieser Meldungen ist gegen
  nachgebaute Texte geprüft, nicht gegen echte — das entscheidet sich erst im
  Oktober.
- **TMC-Ortstabelle**: mit ihr liesse sich die Zuordnung geometrisch statt
  über Namen machen. Anfrage beim ASTRA nötig.
- **Sprachen**: alles Deutsch, wie der Rest der App. Gerade diese Seite hätte
  auf Französisch und Italienisch ein Publikum.
