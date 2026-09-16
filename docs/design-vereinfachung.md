# Design-Vereinfachung — Konzept (mobile-first)

Stand: 2026-09-16, gelesen gegen `staging` bei `836ea96`. Dieses Dokument
sagt, **was einfacher und ruhiger werden soll und warum**, nicht wie jede
Zeile am Ende aussieht. Es ersetzt weder
`AGENTS.md` (Verfassung) noch `.agents/frontend.md` (Rollenregeln), sondern
setzt beide voraus. Wenn der Code diesem Dokument widerspricht, gewinnt der
Code — dann gehört diese Datei korrigiert.

Es ist ausdrücklich **kein zweiter UI/UX-Audit**. `docs/audit/uiux.md` deckt
Reibung, Fehlerzustände und Barrierefreiheit ab und ist dort die Autorität;
wo ein Befund von dort hier wieder auftaucht, steht er als Nebenwirkung einer
Vereinfachung dabei und ist als solcher markiert. Befunde, die dort inzwischen
geschlossen sind (etwa §5.1, die Grösse der Start-/Stopp-Schaltflächen — heute
`size="lg"`, 52 px), tauchen hier nicht auf.

---

## Umsetzungsstand (2026-09-16)

Das Konzept ist zum grossen Teil gebaut. Diese Tabelle ist die Kurzfassung;
jeder Commit trägt seine Begründung im Text.

| Teil | Stand |
| --- | --- |
| A1 Schaltflächen, eine Silhouette | **umgesetzt** |
| A2 `ui/Kennzahl`, höchstens vier Kacheln | **umgesetzt** — Strecken-, Fahrt- und Profilseite |
| A3 `ui/IconButton`, 44 px | **umgesetzt** — acht Stellen, schliesst `uiux.md` §5.2 |
| A4 Eine Farbquelle | **umgesetzt** — `SIGNATURE_COLORS`, `ROUTE_BLUE_PALETTE` und `TRACK_COLOR` sind weg |
| A5 `ui/SegmentedControl` | **umgesetzt** — fünf Fassungen werden eine |
| A6 Zeichen werden Icons | **umgesetzt** — `★ ☆ ⋮` |
| A7 `ui/Seitenrahmen` | **umgesetzt** für 16 Seiten; `premium/**` bleibt offen (s. u.) |
| A8 Peek-Fenster | **umgesetzt** |
| B2 Aufzeichnungsschirm | **umgesetzt**, bis auf die Rückfrage beim Beenden (s. u.) |
| B3 Fazit | **umgesetzt**, bis auf zwei bewusste Abweichungen (s. u.) |
| B4 Aktivität wird ein Tab | **umgesetzt** |
| B5 Feed, zwei Zeilen je Karte | **umgesetzt** |
| C2/C3 Premium-Platzierung | **umgesetzt** — Dauerschloss weg, Zeile statt Card, eine Liste |
| 3.9 Profil entschachteln | **umgesetzt** |
| 3b Kauf-Fluss zusammenlegen | **offen — geschützter Bereich, eigener PR** |

### Was bewusst offen ist

- **Der Kauf-Fluss** (`/profil/premium` und `/zahlung` zusammenlegen) berührt
  den Stripe-Pfad. Eigener PR, eigene Abnahme — deshalb sind auch die drei
  Seiten unter `app/profil/premium/**` als einzige nicht auf den
  `Seitenrahmen` umgestellt. Die Grenze ist die Grenze, auch wenn eine
  Container-Breite harmlos wäre.
- **Die Rückfrage beim Beenden einer Aufzeichnung** (`uiux.md` §5.3) ist eine
  Verhaltensänderung, keine Darstellung. Sie gehört abgenommen, nicht
  nebenbei mitgenommen.
- **Das Formular „+ Fahrzeug hinzufügen"** im Fazit bleibt, wo es ist. Der
  Entwurf wollte es in die Garage schicken — aber es ist bereits zugeklappt
  und opt-in, und wer es am Strassenrand braucht, braucht es genau dort: die
  Motorklasse entscheidet über die Wertung. Es zu entfernen wäre eine
  Wegnahme ohne Ersatz gewesen.
- **Fotos bleiben im Fazit.** Sie später nachzutragen gibt es heute nicht
  (`CompletionPhotoGallery` kann nur entfernen); das verlangte einen zweiten
  Upload-Pfad in `lib/actions/completions.ts` und ist ein eigenes Vorhaben.

### Drei sichtbare Kosten, die genannt gehören

1. Die Anmelde-Formulare sind ab `sm` 64 px breiter (`max-w-sm` →
   `max-w-md`). Auf dem Telefon unverändert.
2. Profil und öffentliches Profil sind ab `lg` schmaler (`max-w-4xl` →
   `max-w-3xl`); das Fahrzeug-Raster verliert auf sehr breiten Schirmen eine
   Spalte. Das ist der Preis von drei Breiten statt zwölf. Eine vierte Breite
   nur für zwei Seiten wäre der Anfang zurück zu zwölf.
3. Auf der Karte unterscheiden sich Strecken nicht mehr über den Farbton,
   sondern über Deckkraft und Linienstärke. Beabsichtigt — Farbe ist das
   erste, was auf einem Telefon im Sonnenlicht zusammenbricht.

### Was die Umsetzung zusätzlich gefunden hat

- `TRACK_COLOR` war `#3D5AFE`, also der Akzentwert des **hellen** Themes,
  fest verdrahtet. Die Karte tauschte ihren Stil im Dunkelmodus längst
  korrekt — die aufgezeichnete Spur und der Live-Positionspunkt blieben im
  Tagblau stehen. Genau der Fall, für den der Dunkelmodus da ist: die
  Aufzeichnung bei Nacht. `lib/theme.ts` löst das Token jetzt zur Laufzeit
  auf.
- Der Kommentar in `ThemeToggle.tsx` behauptete „gleiche
  Segmented-Control-Optik wie der Privat/Öffentlich-Umschalter". Das stimmte
  nicht: dort `py-1.5`, hier `py-2`, und die Feed-Reiter waren wieder anders.
- Ohne den Eintrag in der Leiste gäbe es für **abgemeldete** Besucher keinen
  sichtbaren Weg mehr zu den Bestenlisten. Die Reiterleiste wird ihnen
  deshalb jetzt gezeigt — vorher war sie an eine Session gebunden.

---

## 0. Was „mobile-first" hier heisst

Nicht „funktioniert auch auf dem Handy". Sondern: **das Telefon ist das
Gerät, alles andere ist die Zweitverwertung.** Drei Eigenschaften dieses
Geräts entscheiden jeden Streitfall in diesem Dokument:

1. **Der Bildschirm ist klein und die Hand ist eine.** Ein Referenzgerät für
   alle Zahlen unten: iPhone 13, 390 × 844 px, installiert als PWA
   (`display: "standalone"`, `app/manifest.ts`), also mit 47 px Notch oben und
   34 px Home-Indicator unten.
2. **Gelesen wird bei Sonnenlicht, getippt wird mit Handschuhen.** Farbe ist
   das erste, was draussen zusammenbricht; Antippflächen unter dem Daumen sind
   das zweite.
3. **Die Aufmerksamkeit dauert eine halbe Sekunde.** Was in dieser halben
   Sekunde nicht gelesen wird, ist kein Detail, sondern Lärm — und Lärm ist
   genau das, was „unaufgeräumt" bedeutet.

Daraus folgt die Reihenfolge in Abschnitt 3: sortiert nach **Wirkung auf dem
Telefon**, nicht nach Aufwand und nicht nach Anzahl betroffener Dateien.

---

## 1. Was gemessen wurde, und womit

Alle Zahlen unten sind **aus den Klassen und Tokens gerechnet**, nicht im
Gerät nachgemessen. Das genügt für die Grössenordnung und für die
Entscheidung; es genügt nicht als Abnahme. Wer einen der Punkte umsetzt,
misst vorher im Gerät nach — die Rechnung sagt nur, wo sich das Nachmessen
lohnt.

Zwei Zahlen, die den Rahmen setzen:

| | Höhe | Anteil an 844 px |
| --- | --- | --- |
| Kopfleiste (`Header.tsx`, ohne Notch) | 56 px | 6,6 % |
| Bottom-Nav (`--bottom-nav-h`, ohne Home-Indicator) | 64 px | 7,6 % |
| **Bedienrahmen zusammen** | **120 px** | **14,2 %** |

**Das ist in Ordnung und wird nicht angefasst.** 14 % für eine dauerhaft
sichtbare Navigation ist für eine installierte App normal, und beide Leisten
rechnen die sicheren Bereiche bereits korrekt mit ein. Der Befund gehört
trotzdem hierher, weil er sagt, **wo nicht zu sparen ist** — die Enge auf dem
Telefon entsteht nicht am Rahmen, sondern im Inhalt.

---

## 2. Drei Leitsätze

Alles Weitere ist Anwendung dieser drei Sätze. Wer bei einer konkreten
Entscheidung unsicher ist, entscheidet nach ihnen und nicht nach dem
Abschnitt unten.

### Leitsatz 1 — Eine Sache pro Muster, und dieses Muster ist eine Datei

Nicht „weniger Komponenten", sondern **eine Quelle je Muster**. Eine
Kennzahl-Kachel, eine Abschnittsüberschrift, ein Seitenrahmen, eine
Icon-Schaltfläche. Der Gewinn ist doppelt: die Oberfläche wird ruhig, weil
zwei Seiten nicht mehr leicht verschieden aussehen können, und eine
Verbesserung für das Telefon (grössere Antippfläche, engerer Zeilenabstand)
wirkt danach an einer Stelle statt an zwanzig.

### Leitsatz 2 — Farbe trägt Bedeutung oder sie geht

Die App hat ein durchdachtes Token-System (`app/globals.css`): ein Akzent,
drei Statusfarben, zwei Grautöne, alle mit nachgerechnetem Kontrast in beiden
Themes. Jede Farbe ausserhalb dieses Systems muss erklären, welche
Unterscheidung sie trifft, die Form, Position oder Text nicht treffen können.
Auf einem Telefon im Sonnenlicht gewinnt diese Erklärung selten.

### Leitsatz 3 — Eine Bildschirmhöhe ist ein Budget, kein Vorschlag

Bevor ein Abschnitt auf eine Seite kommt, gehört beantwortet, was er in der
ersten Bildschirmhöhe verdrängt. Die Startseite (Abschnitt 3.1) ist der Fall,
in dem diese Frage nachweislich nie gestellt wurde.

---

## 3. Die Befunde, nach Wirkung auf dem Telefon

### 3.1 [Kritisch] Die Startseite zeigt im Ruhezustand keine einzige Strecke

Auf dem Telefon liegt die Streckenliste in einem Bottom-Sheet über der Karte
(`components/ExploreView.tsx`, `SHEET_PEEK_PX = 272`). 272 px ist alles, was
ein Besucher sieht, bevor er zieht. Was davon verbraucht wird, bevor die erste
Strecke beginnt:

| Element | Klassen | Höhe |
| --- | --- | --- |
| Ziehgriff | `py-2` + `h-5` (`DragSheet.tsx`, `HANDLE_FALLBACK_PX`) | 36 px |
| Innenabstand oben | `pt-5` | 20 px |
| Suchfeld | `fieldClassName()`, `px-3 py-2 text-base` | 42 px |
| Abstand | `gap-5` | 20 px |
| „Strecken in meiner Nähe" + Trennlinie | `py-1.5 text-sm`, `pb-6`, `border-b` | 59 px |
| Abstand | `gap-5` | 20 px |
| **Summe vor der Liste** | | **197 px** |
| **Rest für Strecken** | | **75 px** |
| Höhe einer Streckenzeile | `h-24` (`ExploreSidebar.tsx`) | **96 px** |

**Angemeldet ist die erste Zeile also angeschnitten, und es ist die einzige.**
72 % der Fläche, die die Startseite im Ruhezustand hat, zeigt Bedienelemente
statt Inhalt.

Abgemeldet ist es schlimmer, und zwar genau dort, wo es am teuersten ist: für
Besucher ohne Konto rendert `ExploreSidebar` zusätzlich die `<h1>` und einen
zweizeiligen Erklärabsatz, zusammen rund 91 px inklusive Abstand. 197 + 91 =
288 px > 272 px — **die Liste beginnt unterhalb der Peek-Kante.** Das ist die
Seite, auf der ein geteilter Link landet, also der erste Eindruck, aus dem
laut `AGENTS.md` das Wachstum kommen soll: „Proximity is worth more than
reach" setzt voraus, dass der Besucher einen Ortsnamen zu sehen bekommt. Er
sieht eine Karte, ein Suchfeld und einen Standort-Knopf.

**Entscheid.** Das Peek-Fenster zeigt Strecken. Vier Eingriffe, zusammen rund
120 px:

- Standort-Chip in die Suchzeile (Icon-Schaltfläche rechts im oder neben dem
  Feld) statt als eigene Zeile mit Trennlinie darunter. → **−78 px**
- `gap-5` → `gap-3` innerhalb des Sheets unterhalb von `md`. → **−24 px**
- Zeilenhöhe `h-24` → `h-20`. Die Zeile trägt Name, eine Kennzahl und die
  Streckenform; 80 px reichen dafür und liegen weiter deutlich über jeder
  Antippgrenze. → **−16 px je Zeile**
- Der Erklärabsatz für Abgemeldete zieht aus dem Sheet heraus — über die
  Karte, wo heute schon die Zufallsstrecken-Pille sitzt, oder in eine einmalig
  schliessbare Zeile. Die `<h1>` bleibt als `sr-only` im Sheet, damit Seite
  und Suchmaschine ihre Überschrift behalten.

**Wirkung (gerechnet):** angemeldet rund 169 px für die Liste — zwei volle
Zeilen plus ein sichtbarer Anschnitt der dritten, der zeigt, dass es
weitergeht. Abgemeldet dasselbe statt nichts.

**Nicht ändern:** `SHEET_PEEK_PX` selbst. Ein höherer Peek verdeckt die Karte,
und die Karte ist die zweite Hälfte dieser Seite. Das Budget wird im Inhalt
geholt, nicht am Fenster.

---

### 3.2 [Hoch] Fünf freie Farben in der wichtigsten Liste — drei davon unter der Kontrastschwelle

`lib/signature.ts` vergibt jeder Strecke eine „Signatur" (Kehren, Steigung,
Höhe, Tempo, Länge) und dazu eine feste Farbe:

```ts
export const SIGNATURE_COLORS: Record<SignatureKey, string> = {
  kehren: "#E8590C", steigung: "#7C3AED", hoehe: "#0EA5E9",
  tempo: "#16A34A", laenge: "#3D5AFE",
};
```

Diese fünf Werte sind **die einzigen Farben der App ausserhalb des
Token-Systems**, die auf einer Kerninhaltsseite als Text erscheinen. In
`ExploreSidebar.tsx` färben sie vier Dinge gleichzeitig: den linken Rand der
Zeile, den Hover-Hintergrund, die SVG-Streckenform samt getöntem Kasten
dahinter — und das Signatur-Label in `text-xs`.

Das Label ist der Punkt. `text-xs` ist kein „grosser Text" im Sinne von WCAG,
die Schwelle ist also 4,5:1. Gerechnet gegen die tatsächlichen
Hintergrund-Tokens:

| Signatur | Farbe | auf `#fafafa` (hell) | auf `#0b0b0d` (dunkel) |
| --- | --- | --- | --- |
| Kehren | `#E8590C` | **3,43** ✗ | 5,49 ✓ |
| Steigung | `#7C3AED` | 5,46 ✓ | **3,45** ✗ |
| Höhe | `#0EA5E9` | **2,66** ✗ | 7,10 ✓ |
| Tempo | `#16A34A` | **3,16** ✗ | 5,97 ✓ |
| Länge | `#3D5AFE` | 4,92 ✓ | **3,83** ✗ |

**In jedem Theme fallen mehrere durch, und keine einzige Farbe wird je
umdefiniert** — die Werte sind Konstanten in einer `.ts`-Datei und wissen
nichts von `prefers-color-scheme`. Genau dieselbe Lücke, die `globals.css` für
die drei Statusfarben bereits einmal geschlossen hat; der Kommentar dort
beschreibt den Mechanismus wörtlich („ein Redefinieren hier genügt für die
ganze App" — stimmt nur für Tokens, die auch redefiniert werden).

Dazu kommt das mobile Argument, das auch ohne Kontrastrechnung trägt: **fünf
Farben mit nicht-lernbarer Bedeutung sind auf einem 390-px-Bildschirm kein
Ordnungssystem, sondern Buntheit.** Niemand merkt sich, dass Violett
„Steigung" heisst — direkt neben der Farbe steht ohnehin das Icon und das Wort.

**Entscheid.** Die Signatur behält Icon und Text und verliert die Farbe.
Konkret:

- Label und Icon: `text-muted`, das Icon `text-muted`. Lesbarkeit kommt aus
  dem getesteten Token (5,13:1 hell / geprüft dunkel), nicht aus einem Hex.
- Linker Rand der Zeile und Streckenform: `--color-accent`. Ein Akzent, wie
  überall sonst in der App.
- Der getönte Kasten hinter der Form: `--color-surface`.
- `SIGNATURE_COLORS` und `withAlpha()` entfallen ersatzlos; `computeSignatures()`
  liefert weiter `key` und `label`, nur ohne `color`. Die Perzentil-Logik — der
  eigentliche Wert dieser Datei — bleibt unangetastet, inklusive ihrer Tests.

**Nebenwirkung:** Die Karte (`RouteMap.tsx`) bekommt ihre Linienfarben heute
aus derselben Quelle (`ExploreView.tsx` reicht `colors` durch). Nach der
Umstellung sind alle Strecken auf der Karte akzentfarben. Das ist beabsichtigt
und auf dem Telefon eine Verbesserung: die Hervorhebung der gerade berührten
Strecke trägt die Unterscheidung, nicht fünf gleichzeitig sichtbare Farbtöne.
Wer eine zweite Farbe will, nimmt `--color-foreground` für „alle anderen" und
`--color-accent` für „diese" — zwei Werte, beide aus dem Token-System.

#### 3.2b Und dieselbe Umstellung findet in der Karte eine zweite und eine dritte Palette

Beim Nachsehen, woher die Karte ihre Farben nimmt, stehen in `RouteMap.tsx`
noch zwei weitere Sätze fester Werte:

```ts
const TRACK_COLOR = "#3D5AFE";              // Zeile 33, aufgezeichneter GPS-Track
const ROUTE_BLUE_PALETTE = [                 // Zeile 54, Fallback ohne Signaturfarbe
  "#3D5AFE", "#0EA5E9", "#2563EB", "#6366F1",
  "#0284C7", "#4F46E5", "#38BDF8", "#1D4ED8",
];
```

Damit hat die App **drei** Farbsysteme für dieselbe Sache — fünf
Signaturfarben, acht Blautöne als Fallback und das Token-System — und keines
weiss vom anderen.

Der teure Teil daran ist nicht die Menge, sondern ein Detail: `#3D5AFE` **ist**
`--color-accent`, aber der Wert aus dem hellen Theme. Im Dunkelmodus wechselt
`--color-accent` auf `#6b83ff`, und die Karte wechselt mit — `mapStyleForTheme()`
tauscht den Mapbox-Stil bei Dunkel- und System-dunkel-Einstellung tatsächlich
aus und hört danach sogar auf Änderungen. **Die Linien tauschen nicht mit.** Der
aufgezeichnete Track und der Live-Positionspunkt (`dotEl.style.backgroundColor`,
Zeile 239) bleiben im hellen Akzentblau über einer dunklen Karte stehen. Das
trifft genau den Fall, für den der Dunkelmodus da ist: die Aufzeichnung bei
Nacht.

**Entscheid.** `TRACK_COLOR` und `ROUTE_BLUE_PALETTE` entfallen zusammen mit
`SIGNATURE_COLORS`; alle Linien nehmen den Akzent. Mapbox kann eine CSS-Variable
nicht selbst auflösen — der ehrliche Weg ist, den Wert einmal über
`getComputedStyle(document.documentElement).getPropertyValue("--color-accent")`
zu lesen und im selben Listener neu zu setzen, der ohnehin schon den Kartenstil
tauscht. Damit folgt die Linie dem Theme, ohne dass ein zweiter Hex-Wert
irgendwo notiert werden muss.

---

### 3.3 [Hoch] Antippflächen von 16 × 16 px, drei davon nebeneinander

Auf der Fahrt-Detailseite stehen in der Kopfzeile drei reine Icon-Schaltflächen
mit `gap-3` nebeneinander. Keine hat Innenabstand:

| Datei | Steuerung | Fläche |
| --- | --- | --- |
| `ShareRideButton.tsx` | Fahrt als Bild teilen | `h-4 w-4` → 16 px |
| `CompletionReportButton.tsx` | Fahrt melden | `h-4 w-4` → 16 px |
| `RideVisibilityToggle.tsx` | Sichtbarkeit umschalten | `h-4 w-4` → 16 px |
| `RatingSection.tsx` | Kommentar melden | `h-3.5 w-3.5` → 14 px |

WCAG 2.2 SC 2.5.8 verlangt 24 px, Apple und Android nennen 44 px bzw. 48 dp.
Zwölf Pixel Abstand zwischen „teilen" und „melden" ist auf einem Daumen keine
Trennung — und „melden" ist eine Moderationshandlung, die man nicht aus
Versehen auslöst.

Das ist `docs/audit/uiux.md` §5.2 und dort **weiterhin offen** (§5.1 desselben
Abschnitts ist inzwischen geschlossen, die Aufzeichnungs-Schaltflächen stehen
auf `size="lg"`). Es steht hier nicht, um den Audit zu wiederholen, sondern
weil die Vereinfachung die Behebung mitliefert:

**Entscheid.** Eine Primitive `components/ui/IconButton.tsx` mit einer
Mindestfläche von 44 px (`min-h-11 min-w-11`, Icon `h-5 w-5`), demselben
Fokusring wie `Button` und optionalem `-m-2` für Fälle, in denen der optische
Abstand erhalten bleiben muss. Sie ersetzt in einem Zug die vier oben, die
beiden „Weitere Aktionen"-Auslöser (siehe 3.6) und die Foto-Entfernen-Kreuze in
`CompletionPhotoGallery.tsx` / `MultiPhotoInput.tsx`.

Der Nebeneffekt auf die Optik ist der eigentliche Grund, warum das hier und
nicht im Audit steht: 16-px-Icons ohne Fläche sehen aus wie ein Textzeichen,
das versehentlich in eine Kopfzeile geraten ist. Mit einer einheitlichen,
runden 44-px-Fläche liest sich dieselbe Zeile als drei Schaltflächen — weniger
Erklärung, weniger Zielen, ruhigeres Bild.

---

### 3.4 [Mittel] Kacheltürme: sieben Kästen für Zahlen, die vor der Fahrt niemand liest

Drei Seiten bauen dasselbe „Bento"-Raster jeweils von Hand:

| Seite | Kacheln | Betont | Rest |
| --- | --- | --- | --- |
| `app/strecken/[id]/page.tsx` | **7** | Länge, Höhe | Max. Steigung, Kehren, Ø Tempolimit, Fahrzeit, Wetter |
| `app/fahrten/[id]/page.tsx` | 4 | Distanz, Zeit | Ø Tempo, Aufstieg/Höhe |
| `app/profil/page.tsx` | 4 | Pässe, Höhenmeter | Km gefahren, Anzahl Fahrten |

Drei Probleme auf einmal:

**Erstens die Höhe.** In `grid-cols-2` sind sieben Kacheln auf dem Telefon
vier Zeilen à rund 78 px plus Abstände — **rund 350 px**, 41 % der
Bildschirmhöhe, für Zahlen, die vor dem Losfahren kaum jemand liest.
Dazwischen steht auf derselben Seite noch die Karte, das Höhenprofil, die
Bestenlisten-Vorschau, die Kategorien, die Fotos und die Kommentare.

**Zweitens die willkürliche Betonung.** Die jeweils ersten beiden Kacheln
tragen `text-title font-semibold`, der Rest nur `font-mono` — ausser auf der
Profilseite, wo der Rest `text-lg` trägt. Dieselbe Rolle, drei Schriftgrössen,
kein Grund. Das ist genau die Art Unterschied, die eine App unruhig aussehen
lässt, ohne dass jemand benennen kann, woran es liegt.

**Drittens gibt es die Komponente längst — zweimal.**
`components/KennzahlKachel.tsx` ist genau das, wird aber nur von `/creator`
benutzt und sieht anders aus (`text-2xl` serifenlos statt `text-title`
monospace). Also zwei Entwürfe für eine Rolle, einer davon in einer
Komponente, einer 15-mal von Hand.

**Entscheid.**

- Eine Primitive `components/ui/Kennzahl.tsx` mit genau zwei Stufen:
  `wichtig` (`text-title`, monospace, `tabular-nums`) und normal
  (`text-base`). `KennzahlKachel` wird darauf zurückgeführt und behält seine
  Trichter-Zusatzzeile als Aufsatz.
- **Höchstens vier Kacheln pro Raster.** Auf der Streckenseite bleiben Länge,
  Höhe, Kehren, Fahrzeit. Max. Steigung, Ø Tempolimit und Wetter wandern in
  eine einzige Zeile aus Wert-Paaren unter dem Raster (`text-sm`, mit `·`
  getrennt) — dieselbe Information, ein Sechstel der Fläche.
- Das Wetter ist ohnehin kein Streckenmerkmal, sondern eine Momentaufnahme.
  Als volle Kachel neben „Kehren" behauptet es eine Dauerhaftigkeit, die es
  nicht hat.

**Wirkung (gerechnet):** die Streckenseite verliert rund 190 px oberhalb der
Bestenlisten-Vorschau — auf dem Telefon knapp ein Viertel Bildschirmhöhe.

---

### 3.5 [Mittel] Zwei Schaltflächenformen, direkt nebeneinander

`components/ui/Button.tsx`:

```
primary   → rounded-full   accent → rounded-full   danger → rounded-full
secondary → rounded-lg     ghost  → rounded-lg
```

Auf der Profilseite stehen beide in einem `grid-cols-2` nebeneinander: „+
Strecke erstellen" als Pille, „Öffentliches Profil ansehen" als Rechteck mit
12 px Radius, gleiche Breite, gleiche Höhe, gleiche Zeile. Das liest sich
nicht als Hierarchie, sondern als zwei Bausätze. Dasselbe Paar erscheint in
jedem Aufzeichnungs-Fazit („Speichern" / „Verwerfen").

Dazu kommen die Chips: `motorklassenChipStil.ts` und der Standort-Chip in
`ExploreSidebar` sind `rounded-full`, die Feed-Reiter ebenfalls — die Pille ist
in dieser App längst die Normalform.

**Entscheid.** Alle fünf Varianten auf `rounded-full`. Die Hierarchie trägt,
was sie tragen soll: Fläche und Rahmen (gefüllt → Umriss → ohne Rahmen), nicht
die Silhouette. `Card`, Felder und Dialoge behalten `--radius-lg`; der
Unterschied zwischen „Fläche" (eckig-weich) und „Handlung" (rund) wird damit
zur Regel statt zum Zufall.

Gegenrechnung, der Vollständigkeit halber: Pillen brauchen etwas mehr
Seitenabstand, damit die Beschriftung nicht am Rand klebt. `px-3`/`px-4`/`px-6`
sind dafür ausreichend — nachzumessen bei „Öffentliches Profil ansehen", der
längsten Beschriftung der App in `size="sm"`.

---

### 3.6 [Mittel] Zwölf Seitenrahmen für 26 Seiten

Es gibt keinen Seitenrahmen als Komponente. Jede Seite schreibt ihr `<main>`
selbst, und dabei sind zwölf verschiedene Fassungen entstanden:

```
5×  max-w-sm  flex-1 justify-center gap-6 px-6
2×  max-w-3xl gap-6 px-6 py-10
2×  max-w-2xl gap-8 px-5 py-8 sm:px-6 sm:py-10 lg:max-w-4xl
2×  max-w-2xl gap-6 px-5 py-8 sm:px-6 sm:py-10
1×  max-w-2xl gap-8 … lg:max-w-5xl
1×  max-w-2xl gap-8 … lg:max-w-3xl
1×  max-w-2xl gap-6 … lg:max-w-3xl
1×  max-w-md  gap-8 px-5 py-8 sm:px-6
1×  max-w-md  gap-4 overflow-y-auto px-5 py-8 sm:px-6
1×  max-w-lg  gap-6 overflow-y-auto px-5 py-8 sm:px-6
…
```

Auf dem Telefon ist davon fast nur der Seitenabstand sichtbar — und der ist
`px-6` (24 px) auf acht Seiten und `px-5 sm:px-6` (20 px mobil) auf den
übrigen zwölf. **Vier Pixel Unterschied im Rand, je nachdem wo man ist —
und zwar genau auf dem Telefon, denn ab `sm` laufen beide wieder auf 24 px
zusammen.** Einzeln unsichtbar, in der
Summe genau das Gefühl, dass die App „nicht ganz sitzt": beim Wechsel von der
Streckenseite zum Profil springt die Textkante.

**Entscheid.** `components/ui/Seitenrahmen.tsx` mit drei Breiten
(`schmal` = `max-w-md` für Formulare und Auth, `normal` = `max-w-2xl
lg:max-w-3xl`, `weit` = `max-w-2xl lg:max-w-5xl` für die Bestenlisten) und
**einem** Satz Seitenabstände für alle: `px-5 sm:px-6`. Die Kartenseiten
(Startseite, Streckenseite, `strecken/neu`) bleiben aussen vor — sie haben
eine eigene, bewusste Geometrie aus Karte plus Sheet.

Das ist der langweiligste Punkt dieses Dokuments und der mit dem besten
Verhältnis von Aufwand zu Wirkung: rein mechanisch, kein Risiko, und danach
existiert **ein** Ort, an dem sich der Rhythmus fürs Telefon verstellen lässt.

---

### 3.7 [Mittel] Vier Muster, die bereits eine Komponente haben — und trotzdem von Hand stehen

| Muster | Quelle existiert | Handarbeit daneben |
| --- | --- | --- |
| Abschnittsüberschrift | `ui/SectionHeading.tsx` | **26 Vorkommen in 14 Dateien** mit exakt derselben Klassenkette |
| Kennzahl-Kachel | `KennzahlKachel.tsx` | 15 (siehe 3.4) |
| Segmented Control (Privat/Öffentlich, Ja/Nein, Theme, Feed-Reiter) | — | **5 Fassungen**, `rounded-lg` gegen `rounded-full`, `py-1.5` gegen `py-2` |
| „Weitere Aktionen" | — | 2: `RouteActionsMenu` zeichnet ein Text-`⋮`, `CompletionActionsMenu` ein Lucide-Icon |

Das `⋮` ist dabei der mobil relevanteste Einzelfall: als Textzeichen wird es
von der Plattformschrift gerendert, also auf Android und iOS verschieden
breit, verschieden hoch und verschieden schwer — dieselbe Schaltfläche sieht
auf zwei Telefonen unterschiedlich aus.

**Entscheid.** `SectionHeading` überall einsetzen (rein mechanisch),
`ui/SegmentedControl.tsx` neu (eine Fassung, `rounded-full`, Segmenthöhe
`min-h-11` für den Daumen), beide Menü-Auslöser auf den `IconButton` aus 3.3.

---

### 3.8 [Niedrig] 50 Icons, und ein Wrapper, der nichts tut

`components/NavIcons.tsx` und `VisibilityIcons.tsx` sind reine Re-Exporte:

```ts
export { MapPin as MapPinIcon, Trophy as RankingIcon, … } from "lucide-react";
```

`AGENTS.md` (Stack) und `.agents/frontend.md` verlangen, Icons über diese
Wrapper zu beziehen statt direkt. Tatsächlich importieren **39 Dateien 50
verschiedene Icons direkt aus `lucide-react`**, die Wrapper decken 13 ab. Die
Regel ist also faktisch tot, und sie war auch nie viel wert: ein Re-Export
ohne eigenen Vertrag benennt ein Icon um und normiert nichts — keine Grösse,
keine Strichstärke.

Zwei ehrliche Optionen, und dieses Dokument empfiehlt die erste:

1. **Den Wrapper echt machen.** Ein Modul `components/ui/Icon.tsx`, das den
   Icon-Satz der App exportiert und dabei Grösse und Strichstärke festlegt.
   Der mobile Grund: Lucide zeichnet standardmässig mit Strichstärke 2 — bei
   `h-3.5 w-3.5` (14 px, kommt in der App vor) ist das ein schwerer, bei
   `h-6 w-6` ein dünner Strich. Eine gemeinsame Regel („unter 20 px: 1.75;
   darüber: 1.5") macht die Icon-Sprache über die App hinweg gleich schwer.
   Nebenbei: 50 Icons für 26 Seiten sind zu viele — beim Umstellen lässt sich
   der Satz zusammenstreichen (`Route` und `RouteIcon`, `Timer` und `Clock`,
   `Gauge` zweimal in unterschiedlicher Rolle).
2. Die Regel aus `AGENTS.md` streichen und direkt importieren. Weniger
   Arbeit, aber dann fehlt der Ort, an dem die Strichstärke je geregelt werden
   könnte.

Was nicht bleiben darf, ist der Zustand: eine Regel, die in zwei Dokumenten
steht und in 40 Dateien nicht gilt. Nach `AGENTS.md` („trust the code and flag
the discrepancy") ist das hier die Meldung.

---

### 3.9 [Niedrig] Profil: drei Rahmen um eine Liste

`app/profil/page.tsx` ist die dichteste Seite der App. Ihre Struktur:

```
<section>                          ← Abstand gap-3
  <h2>STATISTIKEN</h2>             ← versal, gesperrt, gedämpft
  <Card>                           ← Rahmen 1
    <dl> 4× <Card surface>         ← Rahmen 2 (viermal)
    <details open> Auszeichnungen  ← Rahmen 3
    <details open> Aktivität
    <details open> Auswertung      (mit Abo)
  </Card>
</section>
```

Auf einem 390-px-Bildschirm ist eine Karte in einer Karte in einem
beschrifteten Abschnitt **drei ineinandergeschachtelte Rahmenlinien um
denselben Inhalt**, und die äusserste umschliesst am Ende fast die ganze
Seitenbreite — sie rahmt also nichts ein, was nicht ohnehin abgegrenzt wäre.
Dasselbe noch einmal bei „Meine Fahrten" (`Card` → `details` → `ul` mit
eigenem `rounded-lg border`, also vier Ebenen bis zur Fahrtzeile).

**Entscheid.** Eine Ebene entfällt: die Gruppen-`Card` um die
`<details>`-Blöcke. Die Überschrift plus die `divide-y`-Trennlinien zwischen
den aufklappbaren Abschnitten leisten die Gruppierung bereits.

Zur Grössenordnung, damit niemand zu viel erwartet: die äussere `Card` trägt
selbst kein Padding — das `p-4` sitzt auf den `<details>` darin. Ihr Wegfall
holt also zunächst nur den Rahmen und die Rundung, nicht die Breite. Die Breite
kommt erst, wenn mit dem Rahmen auch das `p-4` der Kinder geht und die Liste
auf dem Telefon bis an den Seitenrand des `Seitenrahmen` läuft: **32 px**, die
den Fahrtnamen in der Zeile darunter spürbar länger werden lassen. Genau so
ist es gemeint — der Rahmen verschwindet mitsamt seinem Innenabstand, nicht
nur seine Linie.

**Zusätzlich, und das ist eine Produktentscheidung, keine Stilfrage:** Auf dem
Telefon starten `Auszeichnungen` und `Aktivität` **zugeklappt**, auf Desktop
weiter offen. Die Aktivitäts-Heatmap ist ein Jahresraster — auf 390 px ist sie
entweder unlesbar klein oder quer scrollbar, und sie steht heute zwischen den
Kennzahlen und den Fahrten, also mitten im Weg zu dem, weswegen man die Seite
öffnet. `<details open>` ist serverseitig pro Breakpoint nicht steuerbar; der
saubere Weg ist ein `open` per CSS (`@media (min-width: 640px)`) oder ein
kleiner Client-Anteil. Das ist der einzige Punkt dieses Dokuments, der mehr
als Umbau ist — er ändert, was ohne Zutun sichtbar ist, und gehört deshalb
ausdrücklich abgenommen, nicht nebenbei mitgenommen.

---

## 3b. Die Struktur selbst — 27 Flächen, und die falschen fünf in der Leiste

Alles bis hier räumt *innerhalb* der Seiten auf. Dieser Abschnitt fragt, ob
es die Seiten in dieser Zahl und Anordnung überhaupt geben soll. Er ist
später entstanden als der Rest und ist der eingreifendere Teil des
Konzepts — entsprechend braucht er eine Abnahme, keine Umsetzung auf Zuruf.

Ein begleitender Canvas zeichnet dasselbe: Ist-Struktur, die drei
Richtungen nebeneinander und den ausgearbeiteten Vorschlag. Die Quellen
dazu liegen unter `.design/` (siehe `.design/README.md`); die Zahlen dort
sind dieselben wie hier.

### 3b.1 Der Befund: eine Vertauschung

Die App hat **27 Seiten**. Das ist für ein Produkt mit Konten, Zahlung und
Moderation nicht viel — der Befund liegt nicht in der Zahl. Er liegt darin,
welche davon einen der fünf Plätze in der mobilen Leiste bekommen haben.

Legt man die neun Schritte des Kernloops (`AGENTS.md`) gegen die Flächen,
tragen **sechs** Seiten den Loop: `/`, `/strecken/[id]`, `/fahrten/neu`,
`/fahrten/[id]`, `/aktivitaet`, `/feed`. Die Schritte 3, 4 und 5 haben gar
keine eigene Adresse — sie laufen als Vollbild im Recorder ab, und das ist
gesund, nicht lückenhaft.

Die Leiste trägt heute: Strecken, Feed, Fahrt starten, **Bestenlisten**,
Profil. Daneben, als 20-px-Flamme im Kopf: **Aktivität**.

- `/leaderboards` kommt in **keinem** der neun Schritte vor — und hält
  einen der fünf Plätze.
- `/aktivitaet` **ist** Schritt 8, derjenige, der die Schleife schliesst —
  und hat als einziger Loop-Schritt keinen Platz in der Leiste.

`AGENTS.md` schreibt zu Schritt 8: „eine Reaktion, von der niemand
erfährt, schliesst den Loop nicht". Die Navigation widerspricht dem Satz.
Das ist kein Argument gegen Ranglisten — die Rangliste je Strecke sitzt
bereits auf der Streckenseite, wo sie zu Schritt 1 gehört. Es ist ein
Argument gegen den **Platz**.

Dazu zwei Dubletten, die keine Navigationsfrage sind, sondern eine
Modellfrage:

- **Ein Begriff, zwei Seiten.** `/profil` (570 Zeilen, sieben Abschnitte)
  und `/fahrer/[id]` (236) zeigen dieselben Begriffe — Identität, Zahlen,
  Garage, Fahrten — mit verschiedenen Kacheln, Schriftgrössen und Rahmen.
  Die Kennzahlen sind auf der einen vier verschachtelte `Card surface`, auf
  der anderen ein `Card as="dl"` ohne Kacheln.
- **Vier Seiten sind Formulare.** Fahrzeug anlegen, Passwort ändern, Abo
  verwalten, Zahlung — jedes eine eigene Adresse mit Kopf, Leiste und
  Rückweg, für im Schnitt vier Felder.

### 3b.2 Drei Richtungen, entlang verschiedener Achsen

Nicht drei Abstufungen derselben Idee — jede verschiebt etwas anderes, und
jede hat einen echten Preis.

| | Leiste | Dafür | Dagegen |
| --- | --- | --- | --- |
| **A — Drei Ziele** | Entdecken · Fahren · Ich | Die aufgeräumteste Leiste: drei Ziele statt fünf, 130 px Tippfläche statt 78. Jede Fläche hat genau eine Absicht. | Schritt 8 verschwindet wieder — Aktivität steckt in „Ich" und ist so versteckt wie heute im Kopf, nur anderswo. Der Feed kostet zwei Tipper statt einem. |
| **B — Die Leiste ist der Loop** | Strecken · Feed · Fahren · Aktivität · Ich | Die einzige Richtung, in der **jeder** Loop-Schritt einen Platz hat. Kein Segmentwechsel auf dem Weg durch die Schleife, und fünf Tabs bleiben fünf Tabs — kein neuer Platzbedarf. | Die Leiste wird nicht schlanker, nur richtiger belegt. Die Rangliste verliert Sichtbarkeit. |
| **C — Die Karte ist die App** | keine | Die ruhigste Fassung: 64 px zurück an den Inhalt, und die App sieht aus wie nichts sonst. Karte und Sheet sind gebaut. | Schritt 9 bricht weg. Ohne sichtbaren Feed schliesst die Schleife nicht mehr von der fremden Fahrt zur eigenen nächsten — der Schritt, der aus einer Karte ein Produkt macht. |

**Empfehlung: B.** Der Auftrag war, es einfacher zu machen und den Kernloop
trotzdem ins Zentrum zu stellen. A ist einfacher, stellt den Loop aber
schlechter dar als heute. C ist am einfachsten und bricht ihn. B ist die
einzige, die beides hält — und sie ist zugleich die kleinste Änderung an
der bestehenden Mechanik.

### 3b.3 Was B konkret heisst

Zwei Tausche in der Leiste:

- `Bestenlisten` verlässt sie und wird der **dritte Reiter im Feed**, neben
  „Alle" und „Folge ich", die es dort schon gibt (`app/feed/page.tsx`).
- `Aktivität` verlässt den Kopf und wird ein **Tab**.

Und sieben Flächen weniger, unabhängig von der Leiste:

| Fällt weg | Geht nach | Anmerkung |
| --- | --- | --- |
| `/leaderboards` | Reiter im Feed | **Produktentscheid** — Sichtbarkeit sinkt |
| `/verifiziert` | Sheet hinter dem Abzeichen | ein Erklärtext ist keine Seite |
| `/profil` | geht in `/fahrer/[id]` auf | eine Profilfläche statt zwei |
| `/profil/fahrzeuge/neu` | Dialog in der Garage | vier Felder |
| `/profil/passwort-aendern` | Dialog im Abschnitt Konto | dort sitzt schon das Löschen |
| `/profil/einstellungen/abo` | Abschnitt in den Einstellungen | der Weg ins Stripe-Portal ist eine Schaltfläche |
| `/profil/premium/zahlung` | geht in `/profil/premium` auf | **geschützter Bereich**, eigener PR |

**27 → 20 Flächen.** `/profil/premium/abschluss` bleibt: die Rückkehr von
Stripe braucht eine echte Adresse.

### 3b.4 Was daran abgenommen gehört, bevor jemand baut

Zwei Punkte sind keine Designentscheide und stehen mir nicht zu:

1. **Die Bestenlisten verlieren ihren Platz in der Leiste.** Ich kann
   begründen, warum der Platz falsch belegt ist. Ob die globale Rangliste
   als Top-Level-Ziel trotzdem gewollt ist, ist eine Produktfrage.
2. **Der Kauf-Fluss wird zusammengelegt.** Das berührt
   `app/profil/premium/**` und damit den Stripe-Pfad — geschützter Bereich
   nach `AGENTS.md`. Eigener PR, eigene Abnahme, und nicht im selben
   Schritt wie eine Navigationsänderung.

Alles Übrige in 3b.3 ist Umbau ohne Regeländerung: dieselben Server
Actions, dieselben RLS-Policies, dieselben Geschäftsregeln (Kernregel 16).

### 3b.5 Reihenfolge

Vor Abschnitt 5, nicht danach — die Struktur entscheidet, welche Seiten es
überhaupt noch gibt, und es ist Verschwendung, eine Seite aufzuräumen, die
danach verschwindet.

| # | Inhalt | Risiko |
| --- | --- | --- |
| S1 | Aktivität wird ein Tab, Bestenlisten wird ein Feed-Reiter | mittel — **braucht Abnahme** |
| S2 | Eine Profilfläche statt zwei | mittel — zwei Seiten, eine Vorlage |
| S3 | Drei Formularseiten werden Dialoge | gering |
| S4 | `/verifiziert` wird ein Sheet | gering |
| S5 | Kauf-Fluss zusammenlegen | **geschützter Bereich, eigene Abnahme** |

Danach erst die neun PRs aus Abschnitt 5 — auf dann noch 20 Flächen statt
27, also auch weniger Arbeit.

---

## 4. Ausdrücklich verworfen

Diese drei Ideen liegen nahe, sind geprüft und sollen **nicht** umgesetzt
werden. Sie stehen hier, damit niemand sie ein zweites Mal prüfen muss.

### 4.1 Dokument-Scrolling statt App-Shell

23 von 26 Seiten sind `flex h-dvh flex-col` mit einem inneren
`flex-1 overflow-y-auto`. Folge im mobilen Browser: die Adressleiste klappt
beim Scrollen nie ein, weil nicht das Dokument scrollt — je nach Browser
bleiben 60–100 px dauerhaft belegt. Zurück auf Dokument-Scrolling wäre
einfacherer Code und mehr Platz.

**Trotzdem nein.** Die App ist als installierte PWA gedacht
(`display: "standalone"`), und dort gibt es keine Adressleiste
zurückzugewinnen — der Gewinn trifft nur den Browser-Besuch. Dagegen steht
echter Aufwand: `PullToRefreshArea` liest `scrollTop` vom letzten Kind seines
Wrappers, die sticky Kopfleiste und die fixierte Bottom-Nav hängen an der
Geometrie, und die Kartenseiten brauchen die App-Shell ohnehin. Schlechtes
Verhältnis.

### 4.2 Kopfleiste nur mit Signet

Naheliegend, spart auf dem Telefon Breite. `AGENTS.md` hält fest, dass genau
das am 2026-09-14 eingeführt und am 2026-09-15 wieder entfernt wurde: „the
name is what makes an app known and the header is the one surface where every
user reads it on every page view". Der Handel ist entschieden; dieses Konzept
öffnet ihn nicht erneut.

### 4.3 Eine UI-Bibliothek einziehen

Kernregel 15 (`AGENTS.md`) verlangt für jede neue Abhängigkeit eine
Begründung gegen das Vorhandene. Das Vorhandene — Tailwind 4 plus ein
durchdachtes Token-System plus dreizehn eigene Primitiven — ist nicht das
Problem. Das Problem ist, dass an zwanzig Stellen daran vorbeigearbeitet
wurde. Eine Bibliothek fügt dem eine vierzehnte Sprache hinzu.

---

## 5. Schnitt in Pull Requests

Jeder PR geht gegen `staging` (Release Flow, `AGENTS.md`), ist für sich
lieferbar und ändert **keine Geschäftsregeln**. Reihenfolge nach Wirkung auf
dem Telefon, nicht nach Aufwand:

| # | Inhalt | Abschnitt | Art | Risiko |
| --- | --- | --- | --- | --- |
| 1 | Peek-Budget der Startseite | 3.1 | Layout | mittel — einzige Seite mit Sheet-Geometrie |
| 2 | Signaturfarben, `TRACK_COLOR` und Blau-Palette → Akzent-Token | 3.2, 3.2b | Farbe | gering, aber sichtbarste Änderung |
| 3 | `ui/IconButton`, alle Icon-Schaltflächen darauf | 3.3 | Primitive | gering |
| 4 | `ui/Kennzahl`, Raster auf max. 4 Kacheln | 3.4 | Primitive + Layout | gering |
| 5 | Alle Schaltflächen `rounded-full` | 3.5 | Stil | gering |
| 6 | `ui/Seitenrahmen`, einheitlicher Seitenabstand | 3.6 | Mechanisch | sehr gering |
| 7 | `SectionHeading` überall, `ui/SegmentedControl` | 3.7 | Mechanisch + Primitive | gering |
| 8 | Icon-Vertrag klären (Option 1 aus 3.8) | 3.8 | Aufräumen | sehr gering |
| 9 | Profil entschachteln, mobil zugeklappt | 3.9 | Layout + **Produktentscheid** | mittel |

PR 1 und 2 zusammen sind das, was ein Nutzer als „die App ist aufgeräumter
geworden" wahrnimmt. PR 6 bis 8 sind das, was verhindert, dass es wieder
auseinanderläuft. PR 9 braucht eine Abnahme.

---

## 6. Wie das geprüft wird

**Die Wahrheit über UI-Änderungen steht in keinem Testlauf dieser App.**
Vitest läuft projektweit auf `environment: "node"`, und jede Testdatei liegt
in `lib/`. Seit dem 2026-09-15 ist `jsdom` zwar als devDependency da, aber
nur, damit eine einzelne Datei per `// @vitest-environment jsdom` umschalten
kann — `lib/eingabenBewahren.test.ts` ist die einzige, und sie prüft
DOM-Mechanik (ein echtes `<form>`, ein abgesetztes `reset`), keine
Komponenten. Es gibt **keine Testing Library**, nichts rendert eine
Komponente.

Für dieses Konzept heisst das unverändert: eine Änderung in `components/`
oder `app/` hat **keine automatisierte Abdeckung** — wer das Gegenteil in
eine PR-Beschreibung schreibt, sagt die Unwahrheit. Und es heisst zusätzlich,
dass die neu entstehenden Primitiven (`IconButton`, `Kennzahl`,
`SegmentedControl`, `Seitenrahmen`) **nicht** dadurch abgesichert sind, dass
sie Komponenten sind. Ihr Wert liegt woanders: sie machen den Fehler
einmalig statt zwanzigfach.

Was tatsächlich prüfbar ist:

- `npm run lint`, `npm run test`, `npm run build` — für jeden PR, und nur
  behaupten, was wirklich gelaufen ist (Kernregel 17).
- **Reine Logik gehört nach `lib/`, dann ist sie testbar.** Für dieses Konzept
  betrifft das genau eine Stelle: `lib/signature.ts` behält seine Perzentil-
  Funktion und ihre Tests, verliert nur die Farbtabelle. Der Test darf danach
  nicht mehr auf `color` prüfen.
- **Von Hand, im Gerät, und zwar zuerst auf dem Telefon:** 390 × 844,
  hell und dunkel, installiert und im Browser. Die Rechnungen aus Abschnitt 1
  und 3.1 sind Schätzungen — die Abnahme ist ein Screenshot der Startseite im
  Ruhezustand, auf dem drei Streckennamen zu lesen sind.
- **Kontrast nachrechnen statt schätzen**, wenn eine Farbe angefasst wird.
  Die Tabelle in 3.2 ist so entstanden; `globals.css` führt die Werte für die
  Tokens bereits im Kommentar mit, und dieser Gewohnheit ist zu folgen.

---

## 7. Was dieses Konzept nicht anfasst

- **Die Sprache.** Oberfläche, Kommentare und Migrationsnamen bleiben Deutsch.
- **Die Zürich-Ausrichtung.** Keine Vereinfachung darf den Ortsnamen aus der
  ersten Zeile verdrängen — er ist laut `AGENTS.md` die Einheit des
  Wiedererkennens. Punkt 3.1 verstärkt das ausdrücklich.
- **Geschäftsregeln.** Premium-Gating, Moderationsregeln, Sichtbarkeiten und
  Cooldowns bleiben, wie sie sind (Kernregel 16). Wo eine Umstellung eine
  Regel berührt, ist es keine Umstellung mehr, sondern ein eigener Vorgang.
- **Geschützte Bereiche.** Kein Punkt in diesem Dokument braucht eine
  Änderung unter `lib/actions/`, `supabase/migrations/`, `lib/supabase/`,
  `proxy.ts` oder den Stripe-Pfaden. Sollte sich das bei der Umsetzung ändern,
  ist das das Signal, den betreffenden Punkt zu stoppen und neu zu schneiden.
- **Die Tokens selbst.** `app/globals.css` ist der gute Teil dieser Codebasis.
  Dieses Konzept fügt dort nichts hinzu — es sorgt dafür, dass die App die
  Tokens benutzt, die schon da sind.

---

## Anhang A — Baustein-Spezifikation

Die Abschnitte oben sagen, **was** falsch ist und **warum**. Dieser Anhang
sagt, **welche Werte** an die Stelle treten — so weit ausgeschrieben, dass
niemand beim Umsetzen mehr raten oder neu entscheiden muss.

**Keine neue Farbe, kein neuer Radius, keine neue Schrift.** Alles darin
steht bereits in `app/globals.css`. Neu sind vier Primitiven und die
Entscheidung, sie überall zu benutzen. Der begleitende Canvas zeigt
dieselben sieben Blöcke gezeichnet (Seite „Bausteine", Quellen unter
`.design/Bausteine.dc.html`).

### A1 — Schaltflächen: eine Silhouette

`components/ui/Button.tsx` trägt fünf Varianten in zwei Silhouetten.
`primary`/`accent`/`danger` sind `rounded-full`, `secondary`/`ghost` sind
`rounded-lg`. Im `grid-cols-2` der Profilseite stehen beide in derselben
Zeile, gleich breit und gleich hoch.

**Alle fünf auf `rounded-full`.** Die Rangfolge trägt Fläche und Rahmen —
gefüllt, Umriss, ohne Rahmen —, nicht die Silhouette. `Card`, Eingabefelder
und Dialoge behalten `--radius-lg`; damit wird „rund = Handlung,
weich-eckig = Fläche" zur Regel statt zum Zufall. Die Chips
(`motorklassenChipStil.ts`, Standort, Feed-Reiter) sind ohnehin schon Pillen.

| Grösse | Mindesthöhe | Wofür |
| --- | --- | --- |
| `sm` | 36 px | Nebensächliches ausserhalb des Fahrzeugs |
| `md` | 44 px | Standard — die Daumengrenze |
| `lg` | 52 px | Aufzeichnung, mit Handschuhen |

Die Höhen bleiben, wie sie sind. Nachzumessen ist nur, ob „Öffentliches
Profil ansehen" als Pille in `sm` noch in die halbe Zeile passt — es ist
die längste Beschriftung der App in dieser Grösse.

### A2 — `ui/Kennzahl.tsx` (neu)

Ersetzt 15 handgeschriebene Kacheln auf drei Seiten und führt
`KennzahlKachel.tsx` (heute nur auf `/creator`) darauf zurück.

| Teil | Wert |
| --- | --- |
| Beschriftung | 14 px / 400 / `--color-muted` |
| Wert | `--text-title` / 600 / mono / `tabular-nums` |
| Fläche | `--color-surface`, `--radius-lg`, 16 px Innenabstand |
| Raster | `grid-cols-2 sm:grid-cols-4`, `gap-3` |

**Genau eine Betonungsstufe.** Die heutige Aufteilung — erste zwei Kacheln
`text-title`/600, der Rest einmal `font-mono`, einmal `text-lg` — hat keinen
Grund und ist an drei Stellen verschieden umgesetzt.

**Höchstens vier Kacheln je Raster.** Was darüber hinausgeht, wird eine
Zeile darunter in `text-sm text-muted`, mit `·` getrennt:

```
Max. Steigung 12 % · Ø 62 km/h · 8 °C leicht bewölkt
```

Auf der Streckenseite sind das **190 px statt 348** — die
Bestenlisten-Vorschau rückt damit über die Falz. Bleiben als Kacheln:
Länge, Höhe, Kehren, Fahrzeit.

### A3 — `ui/IconButton.tsx` (neu)

| Teil | Wert |
| --- | --- |
| Fläche | `min-h-11 min-w-11` (44 px), `rounded-full` |
| Rahmen | `--color-border`, im Ruhezustand sichtbar |
| Icon | 20 px, `--color-muted`, bei Hover `--color-foreground` |
| Fokus | derselbe Ring wie `Button` |
| Optional | `-m-2`, wo der optische Abstand erhalten bleiben muss |

Ersetzt in einem Zug: Teilen, Melden, Sichtbarkeit umschalten, Kommentar
melden, **beide** „Weitere Aktionen"-Auslöser und die Foto-Entfernen-Kreuze.
Schliesst nebenbei `docs/audit/uiux.md` §5.2.

### A4 — Farbe: drei Systeme werden eines

`SIGNATURE_COLORS` (5 Werte) und `ROUTE_BLUE_PALETTE` (8 Werte) entfallen.
`computeSignatures()` liefert weiter `key` und `label` — die Perzentil-Logik
und ihre Tests bleiben unangetastet —, nur ohne `color`.

| Element | Vorher | Nachher |
| --- | --- | --- |
| Signatur-Label und -Icon | einer von fünf Hex-Werten | `--color-muted` |
| Linker Rand der Listenzeile | derselbe Hex, 55 % | `--color-accent` |
| Getönter Kasten hinter der Form | derselbe Hex, 12 % | `--color-surface` |
| Streckenform (SVG) | derselbe Hex | `--color-accent` |
| Kartenlinien | 5 Signatur- + 8 Fallback-Farben | `--color-accent`, andere mit 35 % Deckkraft |
| `TRACK_COLOR`, Live-Punkt | fest `#3D5AFE` | Akzent-Token, themenabhängig |

Der letzte Punkt ist der, der heute einen echten Fehler produziert:
`mapStyleForTheme()` tauscht den Mapbox-Stil bei Dunkelmodus und hört sogar
auf spätere Wechsel — die Linien tauschen nicht mit, weil `#3D5AFE` der
**helle** Akzentwert ist. Mapbox kann keine CSS-Variable auflösen; der Weg
ist, den Wert einmal über
`getComputedStyle(document.documentElement).getPropertyValue("--color-accent")`
zu lesen und im selben Listener neu zu setzen.

### A5 — `ui/SegmentedControl.tsx` (neu)

Fünf Fassungen desselben Bedienelements heute: Privat/Öffentlich in
`RideSummaryForm` und `NeueStreckeForm`, Ja/Nein für Rundfahrt, der
Theme-Schalter und die Feed-Reiter.

| Teil | Wert |
| --- | --- |
| Hülle | `rounded-full`, 1 px `--color-border`, 4 px Innenabstand |
| Segment | 36 px hoch, `rounded-full`, 13 px / 500 |
| Gewählt | `--color-foreground` gefüllt, Text `--color-background` |
| Ungewählt | `--color-muted`, kein Rahmen |
| Gesamthöhe | 44 px |

### A6 — Zeichen sind keine Icons

Drei Stellen zeichnen ihr Symbol als Textzeichen: `★`/`☆` in
`FavoriteButton.tsx`, `⋮` in `RouteActionsMenu.tsx`. Was die
Plattformschrift daraus macht, ist auf jedem Gerät anders breit, hoch und
schwer — dieselbe Schaltfläche sieht auf zwei Telefonen verschieden aus.
Alle drei werden SVG aus dem Icon-Satz, in einem `IconButton`.

Dazu der Vertrag für die 50 Icons aus 39 Dateien (Abschnitt 3.8):
`ui/Icon.tsx` legt die Strichstärke fest — **unter 20 px: 1.75, darüber:
1.5** — und streicht beim Umstellen die Doppelungen (`Route`/`RouteIcon`,
`Timer`/`Clock`, `Gauge` in zwei Rollen).

### A7 — `ui/Seitenrahmen.tsx` (neu)

| Breite | Wert | Wofür |
| --- | --- | --- |
| `schmal` | `max-w-md` | Formulare, Anmeldung |
| `normal` | `max-w-2xl lg:max-w-3xl` | alles Übrige |
| `weit` | `max-w-2xl lg:max-w-5xl` | Bestenlisten |

Ein Satz Ränder für alle: `px-5 sm:px-6`, `py-8 sm:py-10`, `gap-6`. Die
Kartenseiten (Startseite, Streckenseite, `strecken/neu`) bleiben aussen
vor — sie haben eine eigene, bewusste Geometrie aus Karte plus Sheet.

### A8 — Das Peek-Fenster der Startseite

Abschnitt 3.1 nennt die vier Eingriffe; hier die Zielwerte:

| Element | Heute | Nachher |
| --- | --- | --- |
| Ziehgriff | 36 px | 36 px |
| Innenabstand oben | `pt-5` (20 px) | `pt-3` (12 px) |
| Suchzeile | Feld 42 px, Chip-Zeile 59 px darunter | eine Zeile, 44 px: Feld + Standort-`IconButton` |
| Abstände | `gap-5` (2 × 20 px) | `gap-3` (2 × 12 px) |
| Trennlinie | nach `pb-6` | direkt |
| **Summe vor der Liste** | **197 px** | **105 px** |
| Zeilenhöhe | `h-24` (96 px) | `h-20` (80 px) |
| **Sichtbare Liste** | **75 px — keine volle Zeile** | **167 px — zwei Zeilen plus Anschnitt** |

`SHEET_PEEK_PX` bleibt bei 272. Der Erklärabsatz für Abgemeldete zieht aus
dem Sheet heraus; die `<h1>` bleibt `sr-only` darin.

**Alle Zahlen hier sind aus den Klassen gerechnet.** Die Abnahme ist ein
Screenshot der Startseite im Ruhezustand, auf dem drei Streckennamen zu
lesen sind — siehe Abschnitt 6.

---

## Anhang B — Der Userflow: vier Übergänge

Die neun Schritte funktionieren einzeln. Was klemmt, sind die Stellen
dazwischen — und `AGENTS.md` sagt genau das: *„a feature that strengthens a
single step but breaks the handoff to the next isn't done."* Dieser Anhang
nimmt die vier Übergänge, an denen es heute hakt.

Die Schritte **3 und 4** stehen absichtlich nicht darunter: Fahren und
Aufzeichnen laufen als Vollbild ohne Seitenwechsel ab. Das ist gesund, nicht
lückenhaft — was dieser Schirm braucht, steht in B2.

### B1 — 1 → 2: Entdecken wird Fahren

Der Übergang beginnt damit, dass überhaupt eine Strecke zu sehen ist.
Abschnitt 3.1 und Anhang A8 haben die Zahlen: abgemeldet **null** sichtbare
Strecken, angemeldet eine angeschnittene. Dazu auf der Streckenseite:
„Strecke starten" steht unter dem Titel *und* einer Zeile aus drei
Schaltflächen in zwei verschiedenen Formen.

**Nachher:** zwei volle Zeilen plus Anschnitt in beiden Fällen; „Strecke
starten" auf voller Breite direkt unter dem Ortsnamen, die drei
Nebenhandlungen als 44-px-Icon-Flächen daneben.

### B2 — Der Aufzeichnungsschirm (Schritte 3 und 4)

Kein Strukturproblem, ein Lesbarkeitsproblem. `LiveTrackingForm.tsx` zeigt
fünf Werte in `grid-cols-3`; die Beschriftungen stehen in **`text-xs`, also
12 px** — auf dem einzigen Schirm der App, der in Bewegung gelesen wird.
Dazu dieselbe willkürliche Betonung wie bei den Kacheln (Distanz und Zeit
`text-xl`, der Rest `text-lg`).

| Teil | Heute | Nachher |
| --- | --- | --- |
| Werte | 5 Stück, 20 px und 18 px gemischt | **zwei** gross (44 px): die gefahrene Zeit und „noch … km" |
| Der Rest | eigene Spalten | eine Zeile, 15 px: `8.40 km gefahren · 62 km/h · 640 m` |
| Beschriftungen | 12 px | 15 px |
| Wachhinweis | 12 px `text-muted` neben dem Stopp-Knopf | eigene Pille über der Karte, 14 px, mit Symbol |
| Beenden | ein Tipper, unwiderruflich | volle Breite, 52 px — **und eine Rückfrage**, solange das Streckenende nicht erreicht ist |

Die Rückfrage ist `docs/audit/uiux.md` §5.3 und eine Verhaltensänderung, also
abnahmepflichtig: ein Fehltipp bei km 3 einer 20-km-Strecke beendet heute
den Versuch, und es gibt kein „Weiterfahren".

Warum ausgerechnet die **Zeit** und das **„noch"** gross werden: die Zeit ist
das, was die Bestenliste misst, und „noch 5.8 km" ist der einzige Wert, aus
dem sich in dem Moment eine Entscheidung ableiten lässt. Distanz, Tempo und
Höhe sind interessant, aber nicht handlungsleitend.

### B3 — 5 → 6: Fazit wird gespeicherte Fahrt

Der Moment mit der höchsten Zufriedenheit und der geringsten Geduld: man
steht am Strassenrand, im Helm, und will wissen, dass es gespeichert ist.
`RideSummaryForm.tsx` stellt dorthin **sechs Abschnitte** — Fazit, Fahrzeug,
Notiz, Sichtbarkeit, Fotos, Knöpfe — und der Speichern-Knopf liegt unter der
Falz. Mittendrin öffnet „+ Fahrzeug hinzufügen" ein Formular mit **sechs
Feldern** (Typ, Getriebe, Marke, Modell, Baujahr, Leistung).

**Nachher, drei Abschnitte:**

1. **Das Ergebnis**, gross: die Zeit in 52 px, daneben „Neue Bestzeit", wenn
   es eine ist; darunter eine Zeile `14.21 km · 46 km/h · 640 m · 97 %`.
2. **Fahrzeug als Chips** statt Auswahlliste — die meisten Konten haben ein
   bis drei. Das Pluszeichen führt in die Garage, nicht in ein Formular am
   Strassenrand.
3. **Sichtbarkeit** bleibt sichtbar. Das ist die folgenreiche Entscheidung
   (Feed und Bestenliste, ja oder nein) und gehört nicht hinter eine Klappe.

**Notiz und Fotos klappen zu**, als eine Zeile „Notiz & Fotos — optional".
Der Speichern-Knopf sitzt fest am unteren Rand, immer sichtbar; `Verwerfen`
darunter als Textlink.

**Zwei Einschränkungen, ehrlich benannt.** Die Standard-Sichtbarkeit bleibt,
wie sie ist — das ist eine Geschäftsregel (Kernregel 16), keine Stilfrage.
Und Fotos bleiben **im** Fazit: sie später hinzuzufügen gibt es heute nicht
(`CompletionPhotoGallery` kann nur entfernen), das verlangte einen zweiten
Upload-Pfad in `lib/actions/completions.ts`. Das ist ein eigenes Vorhaben,
kein Nebeneffekt einer Layout-Änderung.

### B4 — 7 → 8: Die Reaktion erreicht die Fahrerin

Abschnitt 3b.1 hat es: der Schritt, der die Schleife schliesst, ist der
einzige ohne Platz in der Leiste. Aktivität wird ein Tab, Bestenlisten
werden der dritte Reiter im Feed.

### B5 — 9 → 1: Fremde Fahrt wird eigene nächste

Der Schritt, der aus einer Karte ein Produkt macht. Er lebt von zwei Dingen:
wie viele fremde Fahrten auf einen Blick passen, und ob man sie wiedererkennt.

`app/feed/page.tsx` baut heute **vier Zeilen je Karte** — Fahrer mit Avatar
und Datum, dann Titel mit Distanz, dann Region mit Art-Chip, dann Kudos in
einer eigenen rechtsbündigen Zeile. Auf 390 px passen damit rund zwei
Fahrten auf einen Schirm. Und die erste Zeile trägt den **Namen des
Fahrers**, nicht den Ortsnamen — obwohl `AGENTS.md` den Ortsnamen die
„unit of recognition" nennt.

**Nachher, zwei Zeilen:**

```
[Avatar]  Albispass                              [Streckenform]
          M. Brunner · Zürichsee · 14.2 km            [🔥 12]
```

Fünf Fahrten statt zwei, der Ortsname zuerst, Kudos als 44-px-Fläche. Die
Streckenform rechts ist dasselbe SVG-Muster wie in der Explore-Liste
(`lib/routeShape.ts`) — eine Wiedererkennungshilfe, die es schon gibt und die
im Feed bisher fehlt.

---

## Anhang C — Premium: wo es auftaucht, und wie leise

Das **Ob** ist entschieden: `docs/premium-plan.md` setzt additives Gating —
Premium hebt Grenzen an und legt Neues obendrauf, es nimmt nichts weg. Dieser
Anhang sagt nur, wie das aussieht. Er ändert keine Preise, keine Grenzen und
keinen Funktionsumfang.

### C1 — Die fünf Stellen heute

| Ort | Wie | Urteil |
| --- | --- | --- |
| `RouteActionsMenu.tsx` | **deaktivierter** Menüeintrag „GPX exportieren (Premium)" | Ein Schloss als Dauerzustand — auf jeder Streckenseite, für jedes Gratis-Konto, immer |
| `app/profil/page.tsx`, zuunterst | `PremiumCard`: Aufzählung plus gefüllter Knopf | Falscher Ort. Das Profil ist die Selbstdarstellung des Nutzers. Immerhin unten und ohne Unterbrechung |
| `OfflineRouteButton.tsx` | Beschriftung „(Premium)" **plus** Hinweis bei vollem Kontingent | Der Hinweis ist richtig. Die Dauerbeschriftung nicht |
| `MultiPhotoInput.tsx` | 6 statt 12 Fotos | Vorbildlich — unsichtbar, bis es zählt |
| `app/profil/premium/` | die Kaufseite | Der Ort dafür |

Dazu ein Wartungsproblem, das der Code selbst benennt: die Vorteilsliste
steht in **drei Kopien**. Eine davon warb nach Migration `0086` weiter mit
„Eigene Strecken erstellen", obwohl das Erstellen längst wieder kostenlos
war.

### C2 — Drei Regeln

1. **Premium erscheint am Punkt der Reibung, nicht als Dauerzustand.** Ein
   Bedienelement trägt im Ruhezustand nie „(Premium)". Es arbeitet. Erst
   wenn die Gratis-Grenze wirklich erreicht ist, erscheint das Angebot —
   inline, einmal, mit der konkreten Zahl. `OfflineRouteButton` macht das
   über `kontingentKnapp` bereits richtig; nur die Beschriftung fällt weg.
2. **Kein deaktiviertes Bedienelement trägt den Preis.** Der GPX-Eintrag
   bleibt bedienbar; das Antippen zeigt das Angebot. Ein Tipper mehr für
   Gratis-Konten, dafür null dauerhafte Unruhe für alle — auch für die, die
   nie exportieren wollten.
3. **Eine Liste, ein Ort.** Die Vorteile leben in `lib/premiumVorteile.ts`.
   Drei Kopien werden eine; die Profilseite zeigt **eine Zeile**, keine
   Aufzählung.

**Und optisch:** der Verkauf bekommt nie den gefüllten Akzent. Der gehört
den Handlungen des Nutzers — „Strecke starten", „Fahrt speichern". Premium
wirbt im Umriss oder als Textlink.

### C3 — Die vier Momente

Mehr gibt es nicht.

| # | Wann | Wie |
| --- | --- | --- |
| 1 | Das Offline-Kontingent ist voll | Inline-Hinweis unter der Schaltfläche, mit der Zahl und einem Textlink. **Gibt es heute schon** |
| 2 | Jemand tippt GPX-Export an | Der Eintrag ist aktiv; das Antippen zeigt den Hinweis samt Link |
| 3 | Einstellungen | Eine Zeile unter Gleichen: „Premium — Offline ohne Limit, 12 Fotos, GPX" mit Chevron |
| 4 | Profil, zuunterst | Eine Zeile plus Umriss-Schaltfläche statt Card mit Aufzählung |

### C4 — Was nie passiert

- **Kein Banner** über dem Feed, der Karte oder im Aufzeichnungsschirm. Was
  zahlende Nutzer hervorbringt, ist die Nutzung selbst.
- **Kein Schloss an einer Stelle, an der vorher nichts war.** Ein Schloss
  dort liest sich als Wegnahme — genau das, was additives Gating vermeiden
  soll (`app/profil/page.tsx` begründet das im Code bereits ausführlich).
- **Keine Schranke in der Kernschleife.** Entdecken, Fahrt starten,
  Aufzeichnen, Posten, Kudos, Bewertungen, Bestenlisten und Feed bleiben
  frei. `docs/premium-plan.md` nennt den Grund: jede Schranke darin senkt
  genau die Aktivität, aus der die Zahlungsbereitschaft erst entsteht.
- **Kein Zählerstand als Dauerhinweis** („2 von 3 Strecken offline"). Eine
  Grenze wird erwähnt, wenn sie erreicht ist — nicht, während man auf sie
  zuläuft.

### C5 — Was daran abgenommen gehört

Nichts davon berührt eine Geschäftsregel: dieselben Grenzen, dieselben
Preise, derselbe Funktionsumfang. Regel 2 ist die einzige echte
Verhaltensänderung — ein heute deaktivierter Eintrag wird bedienbar — und
sie erweitert nichts, was ohne Abo möglich wäre: der Export selbst bleibt
gesperrt, nur die Erklärung wandert vom Dauerzustand in den Moment.
