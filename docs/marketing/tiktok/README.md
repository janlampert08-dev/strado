# TikTok — drei Foto-Slideshows

Start-Content für den TikTok-Kanal: drei Slideshows zu je acht Slides,
24 fertige Grafiken, die Captions dazu.

- `captions.md` — die Texte zum Kopieren, **plus dreizehn Hooks zur Auswahl**
  und der Abschnitt, wo die Grenze zwischen provokativ und dumm liegt.
- `daten.mjs` — welche Slides in welcher Reihenfolge (der Inhalt).
- `render.mjs` — zeichnet daraus die Grafiken (die Form).
- `out/` — die gerenderten PNG, 1080 × 1920 px.

Die Bildsprache ist dieselbe wie im Rest: dunkler Verlauf, Inter und IBM Plex
Mono, die Wortmarke als Kontur aus `lib/marke.ts` — wie `lib/shareImage.ts`
das Teilen-Bild nach der Fahrt zeichnet. Ein Post soll erkennbar aus derselben
App kommen wie das Bild, das ein Fahrer danach selbst teilt.

## Woher die Daten kommen

Zwei Quellen, und die Trennung ist Absicht:

- **Kennzahlen** (Länge, Höhe, Steigung, Kehren) stehen in
  `../instagram/daten.mjs` und werden hier importiert, nicht abgeschrieben.
  Eine Strecke wird an genau einer Stelle nachgezogen, nicht an zweien.
- **Streckenverläufe** stehen in `../verlaeufe.mjs` und werden **nicht von
  Hand gepflegt**. Sie kommen aus der öffentlichen API von `app.strado.ch`:

  ```bash
  node docs/marketing/hole-verlaeufe.mjs
  ```

  Das Skript holt `/api/strecken` und je Strecke `/api/strecken/<id>`
  (unauthentifiziert, read-only, siehe `app/api/strecken/[id]/route.ts`) und
  dünnt die Geometrie mit Douglas-Peucker auf 12 m Toleranz aus — aus 6931
  Punkten werden 816, was auf 830 px Breite kein sichtbarer Unterschied ist.
  Wer eine Strecke ändert oder ergänzt, lässt es neu laufen.

  Die Strecken der App sind **nicht** die aus `supabase/seed/0001_routes.sql`
  — dort stehen vier ältere (Albispass, Forch, Uetliberg, Reusstal). Deshalb
  die API und nicht die Seed-Dateien.

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

## Warum der Verlauf und nicht das Höhenprofil

Die Strecken-Slides zeigen den **Streckenverlauf** — die Form, die die Strasse
auf der Karte hat. Instagram zeigt an derselben Stelle das Höhenprofil.

Der Grund ist das Format: eine Höhenlinie ist ein flaches Band und lässt in
einer 9:16-Fläche zwei Drittel Luft übrig. Ein Verlauf füllt sie und ist im
Vorbeiwischen wiedererkennbar — die Zürichberg-Schleife erkennt jemand, der
sie fährt, in einer halben Sekunde. Ein Höhenprofil erkennt niemand.

Gezeichnet wird in Web-Mercator (`verlaufPfad()` in `../gemeinsam.mjs`), mit
erhaltenem Seitenverhältnis und zentriert. Gestreckt wäre es die falsche
Strecke. Rundfahrten bekommen einen Punkt für Start/Ziel, lineare Strecken
einen gefüllten Punkt am Start und einen Ring am Ziel.

Die Höhenmeter fallen deswegen nicht weg — sie stehen als Zahl in der
Kennzahlen-Tabelle darunter.

## Das Format ist nicht bloss hochkant

1080 × 1920 ist die leichte Hälfte. Die schwierige ist, dass TikTok eigene
Bedienelemente über das Bild legt:

| Zone | ungefähr | was dort liegt |
| --- | --- | --- |
| unten | 470 px | Caption, Benutzername, Musikzeile, Punkte der Slideshow |
| rechts | 170 px | Like, Kommentar, Teilen, Drehscheibe |
| oben | 150 px | „Folge ich / Für dich" und die Suche |

Deshalb sitzt der gesamte Inhalt in einer Spalte von 830 px Breite zwischen
`y = 150` und `y = 1450`. Unterhalb davon steht bewusst nichts.

**Das heisst: im Bildbetrachter sieht der leere Streifen unten falsch aus und
ist trotzdem richtig.** Wer versucht, ihn „aufzufüllen", schiebt Text unter
die Caption. Dort sass eine Zeit lang ein angeschnittenes Dekor; seit die
Karten den Streckenverlauf zeigen, sah es nach einer zweiten, halb
abgeschnittenen Strecke aus — deshalb ist es weg. Prüfen lässt sich das nur
an einem echten Post, nicht hier.

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
die Grenze liegt" beschrieben ist. Das gilt besonders für Slideshow `01`, die
den Vergleich zum Aufhänger macht.

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
