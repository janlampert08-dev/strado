# Instagram — die ersten neun Posts

Der Start-Content für den Instagram-Kanal von Strado: neun Posts, 19 fertige
Grafiken, die Captions dazu. Alles liegt hier, damit es nicht in einem
Design-Tool liegt, das niemand mehr aufmacht.

- `captions.md` — die Texte zum Kopieren, pro Post mit Datei, Hashtags und
  Alt-Text.
- `daten.mjs` — Streckenzahlen und Slide-Definitionen (der Inhalt).
- `render.mjs` — zeichnet daraus die Grafiken (die Form).
- `out/` — die gerenderten PNG, 1080 × 1350 px.

## Warum es die Grafiken als Code gibt

Die Bildsprache ist nicht neu erfunden, sondern die der App: derselbe dunkle
Verlauf, dieselben Farben, Inter und IBM Plex Mono, die Wortmarke als Kontur
aus `lib/marke.ts`. `lib/shareImage.ts` zeichnet nach der Fahrt ein
Teilen-Bild in genau diesem Format — ein Post soll erkennbar aus derselben App
kommen wie das Bild, das ein Fahrer danach selbst teilt.

Als Code statt als Datei-Export, weil sich die Strecken ändern: eine neue
Strecke in der App heisst eine Zeile in `daten.mjs` und ein neuer Lauf, nicht
eine Stunde Nacharbeit in einem Editor.

## Neu rendern

```bash
node docs/marketing/instagram/render.mjs
```

Braucht Node 20+ und ein Chromium. Gesucht wird es unter
`/opt/pw-browsers/chromium-1194/chrome-linux/chrome`; ein anderer Pfad geht
über `CHROME_BIN=/pfad/zu/chrome`. Inter und IBM Plex Mono werden beim ersten
Lauf von Google Fonts geholt und in `.fonts/` zwischengespeichert (nicht
eingecheckt) — dafür braucht der erste Lauf Netz, spätere nicht mehr.

Gerendert wird über das DevTools-Protokoll und nicht über `--screenshot`:
dessen Bild ist so gross wie das Fenster, der Viewport darin aber 87 px
kleiner, und unten bliebe ein weisser Streifen.

## Reihenfolge und Termine

Drei Posts pro Woche, Montag / Mittwoch / Freitag. Das ist der Takt, der sich
neben allem anderen durchhalten lässt — vier Wochen mit zwei Posts sind mehr
wert als eine Woche mit sieben.

| Woche | Mo | Mi | Fr |
| --- | --- | --- | --- |
| 1 | **1** Sieben Strecken (Karussell) | **9** Warum es Strado gibt | **2** Zürichberg Zeit |
| 2 | **5** Fahrzeugklassen (Karussell) | **6** Reel: Ein Ride in 20 Sekunden | **3** Nordwestschleife |
| 3 | **7** Kein App Store | **8** Welche Strecke fehlt? | **4** Zürichsee Run |

Post 1 zuerst, weil er in einem Wisch zeigt, dass es ein Produkt gibt und
nicht eine Idee. Post 9 direkt danach, weil bei null Followern die Person
hinter dem Produkt der Grund ist, warum jemand folgt. Ab Woche 4 trägt der
Kanal sich aus dem, was Post 8 an Streckenvorschlägen bringt, und aus den
Teilen-Bildern echter Fahrten.

## Was ausserhalb dieses Ordners passieren muss

Der Motor sind nicht diese neun Posts, sondern das Teilen-Bild aus
`lib/shareImage.ts`: jede geteilte Fahrt ist eine Anzeige, die niemand
gestalten muss. Zwei Dinge lohnen sich dafür:

- Die Adresse auf dem Bild muss lesbar sein — sie ist der Weg zurück zur App.
- Der Teilen-Knopf muss direkt nach dem Speichern greifbar sein. Der Moment,
  in dem jemand teilt, dauert eine halbe Minute.

## Drei Regeln, die für jeden weiteren Post gelten

1. **Kein Rekord-Framing.** Art. 90 Abs. 3 SVG macht aus einer inszenierten
   Rekordjagd ein Risiko — für den Kanal und für die Leute, die ihn sehen.
   Gezeigt werden Kurven, Höhenprofile und Landschaft, nicht Sekunden auf
   offener Strasse. Wo Zeiten vorkommen, steht der Satz dabei, der auch auf
   der Info-Seite steht: fahr nur so schnell, wie es sicher und erlaubt ist.
2. **Keine echten Nutzerdaten.** Namen und Zeiten in den Grafiken sind
   erfunden und bleiben es — genau wie auf der Info-Seite. Niemand hat der
   Veröffentlichung seiner Fahrt auf einer Werbefläche zugestimmt, und
   `docs/rechtstexte/datenschutz.md` verspricht das Gegenteil. Screenshots
   aus der laufenden App nur mit eigenem Testaccount.
3. **Keine fremden Bilder.** Streckenfotos selbst aufnehmen. Was hier
   gerendert wird, steht auf eigenen Daten und eigener Marke — dabei bleibt
   es.

## Wenn sich eine Strecke ändert

`daten.mjs` ist eine Momentaufnahme der freigegebenen Strecken aus
`public.routes` (Stand 2026-09-07), abgeschrieben aus der Info-Seite
(`janlampert08-dev/stradoinfo`, `index.html`). Es gibt keine Verbindung zur
Datenbank: wer eine Strecke ergänzt oder umbenennt, zieht sie hier von Hand
nach und rendert neu. Dieselbe Handarbeit wie auf der Info-Seite, aus
demselben Grund — beide Flächen sollen ohne Datenbankzugriff auskommen.
