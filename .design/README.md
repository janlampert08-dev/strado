# Canvas-Quellen zum Strukturkonzept

Die Artboards, aus denen der Struktur-Canvas zum Konzept in
`docs/design-vereinfachung.md` gebaut wird. Sie stehen hier, weil ein
veröffentlichter Canvas sonst nur als fertige Seite existiert und niemand
mehr nachvollziehen kann, woher eine Zahl darin stammt.

| Datei | Zeigt |
| --- | --- |
| `Main.dc.html` | Soll-Struktur — der ausgearbeitete Vorschlag |
| `Ist.dc.html` | Ist-Struktur — die 27 Flächen, gruppiert |
| `Kernloop.dc.html` | Die neun Schritte gegen die Flächen gelegt |
| `RichtungA.dc.html` | Alternative A — Drei Ziele |
| `RichtungB.dc.html` | Alternative B — Die Leiste ist der Loop |
| `RichtungC.dc.html` | Alternative C — Die Karte ist die App |
| `canvas.json` | Seiten, Anordnung, Notizen |

## Stand der Zahlen

Alles darin ist gegen `staging` bei `836ea96` gezählt, am 2026-09-16 — wie
das Konzeptdokument selbst. Zählungen veralten: wer eine Zahl anzweifelt,
zählt sie nach, statt sie zu übernehmen.

## Farben und Masse

Keine eigene Palette. Die Werte sind aus `app/globals.css` übernommen und
hier als feste Werte notiert, weil ein Artboard keine Custom Properties der
App sieht:

| Token | Wert |
| --- | --- |
| `--color-background` | `#fafafa` |
| `--color-foreground` | `#131316` |
| `--color-accent` | `#3d5afe` |
| `--color-muted` | `#666b74` |
| `--color-border` | `rgba(19,19,22,.12)` |
| `--color-surface` | `#f3f3f4` |
| `--color-accent-subtle` | `#ebedfa` |
| Radien | 8 / 12 / 16 px |
| `--bottom-nav-h` | 64 px |

Wer die Tokens in `globals.css` ändert, ändert sie hier von Hand mit — die
Verbindung ist eine Notiz, kein Import.

## Neu bauen

Die veröffentlichte Seite entsteht aus diesen Dateien und wird nicht
mitversioniert (`.gitignore`). Sie wird über die `design`-Skill von Claude
Code neu zusammengesetzt und an dieselbe Adresse veröffentlicht; die
Quelldateien hier sind der Eingang dafür. Die zusammengebaute Datei selbst
wird nie von Hand bearbeitet.
