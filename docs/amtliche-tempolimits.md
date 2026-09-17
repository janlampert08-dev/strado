# Amtliche Tempolimits in der Schweiz

Stand der Recherche: 2026-09-17. Quellen: opendata.swiss (CKAN-API, Suche
nach «Geschwindigkeit», «Tempo», «vitesse», «velocità»), geocat.ch und die
kantonalen Geoportale. Jede unten als «eingebunden» geführte Quelle wurde
live abgefragt; das maschinenlesbare Verzeichnis dazu ist
`scripts/amtliche-tempolimits/quellen.mjs`.

## Warum es keinen einzelnen Datensatz gibt

Signalisierte Höchstgeschwindigkeiten verfügen in der Schweiz die Kantone
(Kantonsstrassen) und die Gemeinden (Gemeindestrassen), auf Nationalstrassen
das ASTRA. Einen nationalen Geodatensatz, der sie zusammenführt, gibt es
in den durchsuchten Katalogen nicht. Was es gibt, sind
einzelne kantonale und städtische Veröffentlichungen in je eigenem Format
und Umfang. Die App führt sie in `amtliche_tempolimits` (Migration `0102`)
zusammen.

## Eingebunden

| Quelle (`id`) | Träger | Umfang | Art | Dienst | Hinweis |
| --- | --- | --- | --- | --- | --- |
| `zh` | Kanton Zürich, Tiefbauamt | Kantonsstrassen ohne Städte Zürich/Winterthur | Linie | WFS | vorher schon genutzt (seed/0011) |
| `zh-zonen` | Kanton Zürich, Amt für Mobilität | verfügte Tempo-30- und Begegnungszonen | Zone | WFS | |
| `stadt-zuerich` | Stadt Zürich | alle Strassen der Stadt | Linie | WFS | Tageswert massgebend (`T50N30` → 50); Fahrverbote fallen weg |
| `stadt-bern` | Stadt Bern | alle Strassen der Stadt | Linie | ArcGIS REST | Server sperrt Anfragen ohne User-Agent |
| `biel` | Stadt Biel/Bienne | alle Strassen der Stadt | Linie | GeoJSON-Download | Fussgängerzonen (15) fallen weg |
| `ur` | Kanton Uri (LISAG) | Kantonsstrassen | Linie | WFS | in EPSG:4326 auf 3 Dezimalen gerundet (~100 m) — daher LV95 abfragen |
| `ur-gemeinden` | Kanton Uri (LISAG) | Gemeindestrassennetz | Linie | WFS | Layer «übrige Strassen» scheitert am Umlaut im Typnamen |
| `sz` | Kanton Schwyz | Geschwindigkeitsbereiche | Linie | WFS (nur GML) | |
| `ag` | Kanton Aargau | Kantonsstrassen | Linie | GeoPackage im ZIP | **Datenstand 2017-01-01** |
| `bs-zonen` | Kanton Basel-Stadt | Tempo-30- und Begegnungszonen | Zone | WFS | keine Linien für Hauptstrassen |
| `stadt-st-gallen-zonen` | Stadt St. Gallen | Tempo-30-Zonen | Zone | Opendatasoft | nur WGS84 |
| `lu` | Kanton Luzern | Kantonsstrassen | Linie | GeoPackage im ZIP (STAC) | |
| `zg` | Kanton Zug, Amt für Umwelt | Kantons- und Gemeindestrassen | Linie | WFS (Lärmkataster) | nur Abschnitte mit `signaled_speed = true` |
| `so` | Kanton Solothurn | Kantonsstrassen | Linie | Data-API (GeoJSON) | nicht im WFS |
| `gr` | Kanton Graubünden, Tiefbauamt | Haupt- und Verbindungsstrassen, nur signalisierte Abschnitte | Linie | WFS über Geoportal-Proxy (GML) | kein dokumentierter Dienst, **keine Lizenz angegeben** |
| `sh` | Kanton Schaffhausen | Haupt- und übrige Strassen | Linie | WFS (Lärmkataster) | Attribut «signalisierte Geschwindigkeit am Tag» |
| `ju` | Canton du Jura | routes cantonales | Linie | WFS über Geoportal-Proxy (GML) | Download SIN_9_26 als Alternative |
| `fr` | Canton de Fribourg | routes cantonales | Linie | ArcGIS REST | |
| `ge` | Canton de Genève | alle Strassen des Kantons | Zone | ArcGIS REST | Flächen je Tempo-Regime, flächendeckend — daher Rang 2 und kein Randabstand |

19 Quellen, zusammen rund 22 000 Objekte.

## Wie abgeglichen wird

`lib/tempolimitAbgleich.ts`, genutzt von `proposeRoute()` und vom Skript:

- **Linien** gelten, wenn die Achse höchstens 20 m vom Streckenpunkt liegt
  **und** höchstens 35° von der Fahrtrichtung abweicht. Die Richtungsprüfung
  verhindert, dass eine Querstrasse an Kreuzungen ihr Limit abgibt.
- **Zonen** gelten, wenn der Punkt in der Fläche liegt — bei Tempo-30-Zonen
  mindestens 15 m vom Rand entfernt, weil die Hauptstrasse am Zonenrand
  nicht zur Zone gehört.
- **Rang** bei Überlagerung: kommunale Linien (1) vor kantonalen Linien und
  Genf (2) vor Tempo-30-Zonen (3).
- Werte ausserhalb 20–120 km/h fallen weg.
- Lücken bis 50 m zwischen zwei gleichen amtlichen Abschnitten werden
  aufgefüllt.

Wo nichts passt, bleibt die Schätzung aus Kartendaten (OSM/Mapbox) mit
`amtlich: false`. Die öffentliche API sagt in `tempolimit_quelle`, wie gross
der amtliche Anteil ist.

## Lücken

Kein Bundesdatensatz: api3.geo.admin.ch hat keine Tempolimit-Ebene, geodienste.ch
kein Thema dazu. Autobahnen sind deshalb nur dort amtlich, wo eine Stadt sie
in ihren Daten führt (Stadt Zürich).

**Geprüft und bewusst nicht eingebunden:**

- **NE** (RT51 «Vitesses signalées»): WFS anonym erreichbar, liefert aber
  jedes Objekt ~1300-fach (2,2 Mio. Treffer), der Gesamtabruf endet in
  HTTP 502. Kostenlos über den SITN-Geoshop bestellbar — ein Kandidat für
  einen manuellen Import.
- **BL** (Strassenemissionskataster 2020): enthält eine Geschwindigkeit `v`,
  aber den Modellwert der Lärmberechnung, nicht nachweislich die
  Signalisation (Gellertstrasse Basel mit 60).
- **Stadt Luzern** (verkehrsberuhigte Zonen): nur Freitext, darunter
  «mögliche» Tempo-30-Zonen.
- **UR «übrige Strassen»**: Typname mit Umlaut wird vom Server abgelehnt.

**Ohne öffentlichen, maschinenlesbaren Datensatz** (Stand 2026-09-17):

- **BE (Kanton)**: WFS Verkehrsthemen enthält nur Gewichts-/Masslimiten.
- **SG, AR, AI**: nichts in den Diensten; Lärmkataster SG nur als WMS.
- **TG**: «SLEK-Geschwindigkeit» nur über den ThurGIS-Shop, WFS mit 401.
- **VS, TI, OW, GL**: keine Geschwindigkeitsebene in den öffentlichen Diensten.
- **VD**: «Limitation de vitesse des routes cantonales» auf viageo als «Non
  diffusée»; GeoThemes nur mit Token.
- **NW**: «Tempozonen NW» nur im WebOffice-Viewer.
- **Gemeinden**: Pully, Nyon, Yverdon, Vevey/Cartoriviera, Ville de Fribourg,
  Winterthur, Horgen — nur Viewer, WMS oder Bestellung mit
  Weitergabeverbot.
- **Lausanne**: Zone modérée und 30 km/h de nuit nur über viageo-Bestellung.

Der Julierpass bleibt auch mit den Daten aus GR ohne amtlichen Wert: der
nächste Abschnitt des Datensatzes liegt rund 5 km von der Strecke entfernt.
Der Datensatz führt offenbar nicht jede Kantonsstrasse, vermutlich nur
abweichend signalisierte Abschnitte — beim Kanton nicht bestätigt.

## Aktualisieren

```sh
# Quellen neu laden (Cache in scripts/output/_amtlich/ verwerfen) und prüfen
node --no-warnings scripts/enrich-amtliche-tempolimits.mjs --quellen --frisch
# in die Datenbank schreiben (Secret Key)
node --env-file=.env.local --no-warnings scripts/enrich-amtliche-tempolimits.mjs --hochladen
# bestehende Strecken neu abgleichen → SQL zum Einspielen von Hand
node --no-warnings scripts/enrich-amtliche-tempolimits.mjs --live > supabase/seed/00NN_….sql
```

Eine neue Quelle ist ein Eintrag in `quellen.mjs`; passt ihr Dienst zu
keinem Lader in `laden.mjs`, kommt dort einer dazu.
