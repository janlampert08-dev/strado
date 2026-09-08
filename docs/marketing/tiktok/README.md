# TikTok — drei Foto-Slideshows

Start-Content für den TikTok-Kanal: drei Slideshows zu je acht Slides,
24 fertige Grafiken, die Captions dazu.

- `captions.md` — die Texte zum Kopieren, **plus zwölf Hooks zur Auswahl**
  und der Abschnitt, wo die Grenze zwischen provokativ und dumm liegt.
- `daten.mjs` — welche Slides in welcher Reihenfolge (der Inhalt).
- `render.mjs` — zeichnet daraus die Grafiken (die Form).
- `out/` — die gerenderten PNG, 1080 × 1920 px.

Die Bildsprache ist dieselbe wie im Rest: dunkler Verlauf, Inter und IBM Plex
Mono, die Wortmarke als Kontur aus `lib/marke.ts` — wie `lib/shareImage.ts`
das Teilen-Bild nach der Fahrt zeichnet. Ein Post soll erkennbar aus derselben
App kommen wie das Bild, das ein Fahrer danach selbst teilt.

Die Streckenzahlen werden **nicht** hier gepflegt, sondern in
`../instagram/daten.mjs`, aus dem diese Slideshows sie importieren. Eine
Strecke wird also an genau einer Stelle nachgezogen, nicht an zweien.

## Neu rendern

```bash
node docs/marketing/tiktok/render.mjs
```

Braucht Node 20+ und ein Chromium. Gesucht wird es unter
`/opt/pw-browsers/chromium-1194/chrome-linux/chrome`; ein anderer Pfad geht
über `CHROME_BIN=/pfad/zu/chrome`. Inter und IBM Plex Mono werden beim ersten
Lauf von Google Fonts geholt und in `../.fonts/` zwischengespeichert (nicht
eingecheckt) — der erste Lauf braucht Netz, spätere nicht mehr.

Der Browser-Teil steht in `../gemeinsam.mjs` und wird mit dem
Instagram-Renderer geteilt. Wer dort etwas ändert, rendert **beide** Ordner
neu und schaut sich die Bilder an.

## Das Format ist nicht bloss hochkant

1080 × 1920 ist die leichte Hälfte. Die schwierige ist, dass TikTok eigene
Bedienelemente über das Bild legt:

| Zone | ungefähr | was dort liegt |
| --- | --- | --- |
| unten | 470 px | Caption, Benutzername, Musikzeile, Punkte der Slideshow |
| rechts | 170 px | Like, Kommentar, Teilen, Drehscheibe |
| oben | 150 px | „Folge ich / Für dich" und die Suche |

Deshalb sitzt der gesamte Inhalt in einer Spalte von 830 px Breite zwischen
`y = 150` und `y = 1450`. Unterhalb davon liegt nur das blasse Höhenprofil als
Dekor — wird es verdeckt, geht nichts verloren.

**Das heisst: im Bildbetrachter sieht der leere Streifen unten falsch aus und
ist trotzdem richtig.** Wer versucht, ihn „aufzufüllen", schiebt Text unter
die Caption. Prüfen lässt sich das nur an einem echten Post, nicht hier.

## Zwei Regeln für den Inhalt

**Erfundene Namen.** Die Fahrernamen und Zeiten der Bestenlisten-Slides sind
erfunden und bleiben es — genau wie bei Instagram und auf der Info-Seite.
Echte Nutzernamen und echte Fahrten gehören niemandem, der ihrer
Veröffentlichung auf einer Werbefläche zugestimmt hat (siehe
`docs/rechtstexte/datenschutz.md`).

**Legale Beispielzeiten.** Jede gezeigte Zeit muss auf eine
Durchschnittsgeschwindigkeit hinauslaufen, die man legal fährt. 17:34 auf
12.3 km sind 42 km/h; 48:12 auf 38.5 km sind 48 km/h. Wer eine Zeit ändert,
rechnet nach: `Länge / Zeit`, und das Ergebnis darf nicht nach einer Strasse
klingen, auf der jemand zu schnell war. Eine Werbefläche, die eine Bestzeit
zeigt, die sich nicht legal fahren lässt, wirbt für etwas anderes als für die
App — und zieht genau die Aufmerksamkeit an, die in `captions.md` unter „Wo
die Grenze liegt" beschrieben ist.

## Wenn ein Hook nicht passt

Überschriften mit festen Umbrüchen tragen ein `data-zeilen`-Attribut; nach dem
Laden misst `PASSE_AN` in `render.mjs` nach und verkleinert die Schrift, bis
die Zeilenzahl stimmt. Das rettet einen zu langen Hook davor, still in eine
zusätzliche Zeile zu zerfallen — es ersetzt aber keine kurze Zeile. Wird eine
Überschrift auffällig klein gesetzt, ist der Text zu lang, nicht die Schrift
zu gross.

## Was ausserhalb dieses Ordners passieren muss

- Konto anlegen und **entscheiden: Creator oder Business** — die Musikfrage in
  `captions.md` hängt daran und lässt sich später nur mit Aufwand drehen.
- Die Slides einzeln als Foto-Post hochladen (TikTok „Foto"-Modus), in der
  Reihenfolge der Dateinamen.
- Auf Kommentare antworten. Slideshow `02` ist ausdrücklich darauf gebaut.
