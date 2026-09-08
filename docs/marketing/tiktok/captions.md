# TikTok — Slideshows, Hooks und Captions

Drei fertige Foto-Slideshows zu je acht Slides, dazu die Hooks, die zur
Auswahl standen. Die Grafiken liegen in `out/`, der Inhalt in `daten.mjs`,
das Format erklärt `README.md`.

Schweizer Rechtschreibung: durchgehend `ss` statt `ß`. Wer eine Caption
umschreibt, behält das bei.

---

## Die Hooks

Die erste Slide entscheidet alles. Wer dort nicht hängen bleibt, sieht die
Strecken nie — deshalb steht hier mehr Auswahl, als gerendert ist. Drei sind
gebaut, der Rest ist zum Nachziehen in `daten.mjs`.

Die Spalte „Reibung" ist die Frage, ob die Zeile jemanden anspricht oder nur
etwas mitteilt. Die Spalte „Achtung" steht darunter, weil provokativ und
riskant nicht dasselbe ist — siehe „Wo die Grenze liegt".

| # | Hook | Reibung | Achtung |
| --- | --- | --- | --- |
| 1 | **„Deine Zeit ist gut. Bis du sie vergleichst."** | Der Vergleich ist der Haken, nicht die Strecke. Nimmt dem Zuschauer erst recht, was er zu wissen glaubt — und liefert im selben Atemzug, wo er es nachprüfen kann. | — *(gerendert: `01-deine-zeit`)* |
| 2 | **„Du wohnst seit Jahren in Zürich. Und kennst drei Strassen."** | Lokaler Callout. Wer sich angesprochen fühlt, wischt weiter, um sich zu widersprechen. | — *(gerendert: `02-drei-strassen`)* |
| 3 | **„Die beste Strecke in Zürich kennt genau einer. Und der schickt sie dir nicht."** | FOMO plus Insider. Passt zur Gründergeschichte. | — *(gerendert: `03-kennt-nur-einer`)* |
| 4 | „Du fährst die Strecke seit Jahren. Jemand fährt sie besser." | Vergleich als Behauptung über eine konkrete Person — die schärfste Variante der Nummer 1. | Formuliert Überlegenheit, nicht Tempo. Sobald daraus „schneller" wird, kippt sie in die Liste unten. |
| 5 | „Auf deiner Hausstrecke bist du nicht die Referenz." | Kurz, kalt, sehr teilbar. | — |
| 6 | „Vergleiche deine Zeit auf dem Zürichberg." | Deine Ausgangsidee. Klar, aber sie teilt nur mit — es gibt nichts, dem man widersprechen will. | Als **zweite** Zeile stark, als erste schwach. Nummer 1 ist dieselbe Idee mit Widerhaken. |
| 7 | „Sonntagsausfahrt? Du fährst dieselbe Runde wie alle anderen." | Trifft die Gewohnheit, nicht die Person. Angenehm gemein. | — |
| 8 | „Ich habe jede Kurve in Zürich vermessen." | Autoritäts-Hook, das TikTok-Format schlechthin. Und es stimmt: die Zahlen sind gerechnet, nicht geschätzt. | Nur solange es stimmt. Bei einer neuen Strecke ohne Vermessung fällt der Satz in sich zusammen. |
| 9 | „Deine Lieblingsstrecke steht in einem Chatverlauf von 2021." | Sehr spezifisch, deshalb wahr für viele. Beste Kommentar-Quote der Liste. | — |
| 10 | „Niemand fragt dich, was du fährst. Nur wo." | Identität statt Technik. Am nächsten an der Marke. | Am wenigsten provokativ — gut als zweiter Post, schwach als erster. |
| 11 | „Sieben Strecken in Zürich. Auf fünf davon warst du noch nie." | Zahl plus Wette. Lädt zum Gegenbeweis in den Kommentaren ein. | — |
| 12 | „Strava kennt jeden Veloweg. Und keine einzige gute Kurve." | Vergleichs-Hook, zieht am meisten Reichweite und am meisten Streit. | Vergleichende Werbung ist zulässig, solange sie nicht herabsetzend oder irreführend ist (Art. 3 Abs. 1 lit. e UWG). Diese Formulierung beschreibt einen Unterschied — „Strava ist Müll" wäre die andere Seite der Linie. |
| 13 | „Kein App Store. Kein Abo. Link auf und fahren." | Konvertiert am besten von allen. | Provoziert null. Gehört auf die letzte Slide, nicht auf die erste. |

### Wo die Grenze liegt

Provokativ heisst hier: **die Behauptung ist frech, nicht die Fahrweise.**
Alle Hooks oben provozieren über Ortskenntnis, Gewohnheit, Zugehörigkeit
oder den Vergleich als solchen. Keiner provoziert über Tempo — und das ist
kein Zufall.

Der Unterschied ist schmal und trotzdem eindeutig. „Jemand fährt sie
besser" ist eine Aussage über eine Rangliste. „Jemand fährt sie schneller
als du — trau dich" ist eine Aufforderung. Das Erste ist das Produkt, das
Zweite ist das Problem.

Diese Zeilen sind draussen, auch wenn sie „ziehen" würden:

- „Wer ist der Schnellste auf dem Zürichberg?"
- „Brich den Rekord."
- „Unter 17 Minuten oder du hast es nicht probiert."
- alles mit Vollgas, Rekordjagd, Duell, „wer traut sich".

Zwei Gründe, beide ernst:

1. **Rechtlich.** Ein Geschwindigkeitsvergleich auf öffentlicher Strasse
   ist kein Wettbewerb, sondern je nach Ausmass eine qualifiziert grobe
   Verkehrsregelverletzung (Art. 90 Abs. 3 SVG, Freiheitsstrafe ab einem
   Jahr — damit ein Verbrechen). Wer öffentlich dazu auffordert, steht
   nicht mehr nur daneben (Art. 259 StGB). Rennen auf öffentlichen
   Strassen sind ohnehin bewilligungspflichtig bzw. verboten (Art. 52
   SVG). Das hier ist keine Rechtsberatung; wenn ein Post näher an diese
   Kante will, gehört er vorher an eine Anwältin oder einen Anwalt.
2. **Praktisch, und das trifft dich zuerst.** TikTok moderiert
   „gefährliches Fahren" eigenständig. Der wahrscheinliche Ausgang ist
   nicht eine Anzeige, sondern ein stiller Reichweitendeckel auf dem
   ganzen Konto — den du nicht siehst und nicht anfechten kannst.

Was stattdessen trägt: verglichen wird **eine Strecke, die man legal
fährt**, und die gezeigten Zeiten sagen das auch. Deshalb steht auf jeder
Ranglisten-Slide der Satz, der auch bei Instagram steht — „Fahr nur so
schnell, wie es sicher und erlaubt ist." — und deshalb sind die
Beispielzeiten so gewählt, wie `README.md` es beschreibt.

---

## 1 · `01-deine-zeit` — Deine Zeit ist gut. Bis du sie vergleichst.

**Dateien:** `out/01-deine-zeit-01.png` … `-08.png` (8 Slides, in dieser Reihenfolge)

Aufbau: Hook → fünf Strecken → Rangliste → Schluss. Der Post ist auf den
Vergleich gebaut: die Strecken-Slides zeigen, worum es geht, die
Ranglisten-Slide zeigt, wogegen.

> Deine Zeit ist gut. Bis du sie vergleichst.
>
> Sieben Strecken in Zürich, alle vermessen: Streckenverlauf, Länge,
> Höhenmeter, maximale Steigung, Kehren. Nicht geschätzt, sondern aus den
> Daten der Strecke gerechnet.
>
> Danach steht deine Zeit in der Rangliste der Strecke — neben allen anderen,
> die dieselbe Strecke gefahren sind.
>
> Gratis im Browser: app.strado.ch
>
> Welche fährst du zuerst?
>
> #strado #zürich #kurvenstrecke #töfffahren #ausfahrt #schweiz

**Alt-Text (Slide 1):** Dunkle Grafik mit dem Schriftzug „Deine Zeit ist gut.
Bis du sie vergleichst."

---

## 2 · `02-drei-strassen` — Du kennst drei Strassen

**Dateien:** `out/02-drei-strassen-01.png` … `-08.png`

Aufbau: Hook → fünf Strecken → Frage in die Kommentare → Schluss. Die
Kommentar-Slide sitzt hier vor dem Schluss, weil dieser Post auf Antworten
zielt und nicht auf Klicks.

> Du wohnst seit Jahren in Zürich. Und kennst drei Strassen.
>
> Binzmer Backfire, Dietlikon Dash, Greifensee Schleife, Nordwestschleife,
> A3 Asphalt — mit Streckenverlauf, Kehren und Steigung. Alle vermessen.
>
> Und jetzt die Frage, wegen der ich das poste: welche fehlt? Schreib sie in
> die Kommentare — Start, Ziel, und warum sie sich lohnt. Die meistgenannte
> kommt als Nächstes rein.
>
> app.strado.ch
>
> #strado #zürich #geheimtipp #kurvenstrecke #motorradtour #schweiz

**Alt-Text (Slide 1):** Dunkle Grafik mit dem Schriftzug „Du wohnst seit
Jahren in Zürich. Und kennst drei Strassen."

**Nach dem Posten:** Jede genannte Strecke ist ein Kontakt. Antworte auf jeden
Kommentar, und sag Bescheid, wenn eine davon wirklich reinkommt.

---

## 3 · `03-kennt-nur-einer` — Die beste Strecke kennt einer

**Dateien:** `out/03-kennt-nur-einer-01.png` … `-08.png`

Aufbau: Hook → warum es Strado gibt → vier Strecken → Rangliste → Schluss.
Das ist der Post mit Geschichte; er läuft langsamer an und bleibt länger.

> Die beste Strecke in Zürich kennt genau einer. Und der schickt sie dir nicht.
>
> Nicht aus Bosheit — sie stand einfach nie irgendwo. Sie stand in Köpfen und
> in Chatverläufen, die man nach drei Wochen nicht mehr findet. Jede Ausfahrt
> fing mit derselben Frage an: wo fahren wir eigentlich hin?
>
> Deshalb gibt es Strado. Die Strecken an einem Ort, mit Verlauf und Karte,
> und danach eine Rangliste pro Strecke.
>
> Gestartet in Zürich. app.strado.ch
>
> #strado #zürich #buildinpublic #kurvenstrecke #töfffahren #schweiz

**Alt-Text (Slide 1):** Dunkle Grafik mit dem Schriftzug „Die beste Strecke in
Zürich kennt genau einer."

---

## Ton, Takt und das Musikproblem

**Ton.** Slideshows laufen mit Sound, aber die Mehrheit liest mit. Der Text
auf der Slide muss ohne Ton funktionieren — er tut es hier, das Audio ist
Beiwerk.

**Und jetzt der Haken:** ein TikTok-**Business-Konto** darf nur aus der
Commercial Music Library greifen, die angesagten Sounds sind dort gesperrt.
Bei einer Foto-Slideshow ist genau der Sound aber ein grosser Teil der
Reichweite. Entscheide das bewusst — Creator-Konto mit voller
Musikauswahl, oder Business-Konto mit Statistiken und lizenzsicherem, aber
unauffälligem Ton. Für den Start ist das Creator-Konto meist das bessere
Geschäft.

**Takt.** Poste die drei nicht am selben Tag. Einer pro Woche, dazwischen
läuft der Instagram-Plan aus `../instagram/README.md`. Vergleiche danach die
Haltezeit auf Slide 1 bis 2 — daran, und an nichts anderem, siehst du, welcher
Hook trägt. Der Gewinner wird zur Vorlage für die nächsten drei.

**Reihenfolge.** `01` zuerst: er zeigt in einem Wisch, dass es ein Produkt
gibt. `03` als zweiter, weil bei null Followern die Person hinter dem
Produkt der Grund ist, warum jemand bleibt. `02` als dritter, wenn genug
Leute da sind, dass Kommentare auch kommen.
