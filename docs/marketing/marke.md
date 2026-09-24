# Marke — wie Strado aussieht, klingt und sich zeigt

Stand 2026-09-25. Fasst zusammen, was über die Marke bereits entschieden ist
(verstreut über `AGENTS.md`, `lib/marke.ts`, `app/globals.css`,
`docs/markt/schweizer-identitaet.md` und die Kanal-READMEs), und ergänzt die
Profil-Einrichtung auf Instagram und TikTok aus dem Audit vom 2026-09-24.
Wo hier etwas anderem widerspricht, gilt der Code — und diese Datei wird
korrigiert.

## 1. Worum es geht, in einem Satz

**Strado ist die Schweizer Adresse für Pässe und Kurvenstrecken — ob der
Pass offen ist, wie die Strecke verläuft, und wie du sie gefahren bist.**

- Position: „SchweizMobil für den motorisierten Verkehr" — sprachlich
  besetzen, nicht grafisch imitieren (keine Anmutung von Amtlichkeit, siehe
  `schweizer-identitaet.md` 4.4).
- Der wiederkehrende Grund, Strado zu folgen: **„Pass offen oder zu?"**.
  Kein Mitbewerber bespielt das in den sozialen Kanälen (alpen-paesse.ch:
  114 Follower, 0 Posts; Stand 2026-09-24).
- Bestzeiten sind die spielerische Signatur — immer legal, nie Rekordjagd.

## 2. Name und Schreibweise

- **Strado** im Satz, **strado** nur als Wortmarke (Kontur, nicht Text).
- Accounts: `@strado.ch` auf Instagram und TikTok, App: `app.strado.ch`,
  Info: `strado.ch`, Kontakt: `contact@strado.ch`.
- Schweizer Hochdeutsch: **ss statt ß**, „Töff" neben „Motorrad",
  „Passstrasse", Zahlen mit Apostroph (`2'429 m`), Dezimalpunkt (`12.8 %`),
  Preise `CHF 6.90`.
- Anrede: **du**, überall.

## 3. Zeichen

- **Wortmarke:** „strado" in Familjen Grotesk Bold, Laufweite −0.03 em, als
  Kontur in `lib/marke.ts`. Nie neu setzen, nie verzerren, nie
  nachzeichnen — die Datei ist die Quelle.
- **Signet:** das flachgedrückte „o" als geschlossener Rundkurs
  (`lib/marke.ts`). Es trägt **keine zweite Bedeutung** — kein
  Premium-Abzeichen, kein Kreuz, keine Flagge. Beides ist zweimal
  gescheitert (`AGENTS.md`, Abschnitt Premium-Badge).
- **Schweizerkreuz:** erlaubt (Art. 49 MSchG erfüllt), **Wappenschild
  nicht**. Lieber im Satz („aus Zürich, für die ganze Schweiz") als in der
  Marke.
- **Profilbild** (beide Kanäle gleich): Signet oder „strado"-Wortmarke in
  `#6B83FF` auf dunklem Grund `#0B0B0D`, bei 110 px noch lesbar — also im
  Zweifel das Signet allein.

## 4. Farbe

| Rolle | Wert | Wo |
|---|---|---|
| Akzent | `#6B83FF` | Flächen, Linien, Karte, Grafik. In beiden Schemata dasselbe Blau. |
| Akzent als Schrift (hell) | `#4460E0` | `--color-accent-ink`: Text auf hellem Grund, sonst zu wenig Kontrast. |
| Grund dunkel / hell | `#0B0B0D` / `#FAFAFA` | `--color-background` |
| Schrift dunkel / hell | `#F2F2F4` / `#131316` | `--color-foreground` |

- **Ein Akzent.** Blau heisst in der App „das kannst du antippen" — in
  Grafiken sparsam einsetzen, nicht als Deko-Fläche.
- Verkehrsfarben (grün → rot) und Status-Töne sind Kartenkonvention, keine
  Markenfarben (`lib/traffic.ts`).
- Quelle der Wahrheit: `app/globals.css`.

## 5. Schrift

| Rolle | Schrift |
|---|---|
| Titel, Wortmarke | Familjen Grotesk (600/700) |
| Oberfläche, Fliesstext, Zahlen | Geist |
| Daten, Messwerte, Zeiten | IBM Plex Mono |

In Grafiken dieselben drei, sonst nichts. Zahlen, die untereinander stehen,
mit tabellarischen Ziffern.

## 6. Tonfall

**Ruhig, präzise, schweizerisch.** Die Richtung aus der Design-Kritik vom
2026-09-17: „quiet premium dark" plus „Swiss alpine precision".

- **Zeigen statt behaupten.** Eine echte Zahl (46 Kehren, 2'429 m, 12.8 %)
  schlägt jedes Adjektiv. Keine Superlative ohne Beleg.
- **Ortsnamen zuerst.** Wiedererkennung hängt am Ort (`AGENTS.md`): „Susten,
  46 Kehren" statt „epische Passstrasse".
- **Kurz.** Ein Satz pro Aussage, aktiv, ohne Ausrufezeichen-Ketten.
- **Keine Emojis als Gliederung.** Höchstens eines am Bio-Anfang.
- **Nie**: „Race", „Rekord", „schneller als", „Vollgas", #racing,
  „Raser". Art. 90 Abs. 3 SVG — eine inszenierte Rekordjagd ist ein Risiko
  für den Kanal und für alle, die zuschauen
  (`instagram/README.md`, Regel 1).
- **Immer dabei, wo Zeiten vorkommen:** die Durchschnittsgeschwindigkeit,
  und sie muss legal klingen (`tiktok/README.md`, „Legale Beispielzeiten").

## 7. Daten in Werbung

- **Erfundene Namen und Zeiten** in allen Grafiken — niemand hat der
  Veröffentlichung seiner Fahrt auf einer Werbefläche zugestimmt
  (`datenschutz.md`). Screenshots nur aus einem eigenen Testkonto.
- **Aggregiertes** ist erlaubt („Saison 2026: 1'240 km auf Strado
  gefahren"), einzelne Personen nie — ausser mit ausdrücklicher
  Zustimmung.
- **Eigene Bilder.** Streckenfotos und Clips selbst aufnehmen oder mit
  schriftlicher Erlaubnis (Creator, Community).

## 8. Profile einrichten

### Instagram `@strado.ch`

- **Namensfeld** (durchsuchbar): `Strado · Pässe Schweiz`
- **Bio:**
  ```
  Pässe & Kurvenstrecken der Schweiz
  Passstatus live · Höhenprofil · Rangliste
  Aus Zürich · kein App Store nötig ↓
  ```
- **Link:** direkt, kein Linktree:
  `https://app.strado.ch/paesse?utm_source=instagram&utm_medium=social&utm_campaign=bio`
- **Highlights (4):** „Pässe offen?" (Status-Stories), „Strecken",
  „Bestzeiten" (nur legale Schnitte), „So geht's" (App ohne App Store:
  „Zum Home-Bildschirm").
- **Angeheftet (3):** Status-Video der Woche · beste „schnellste legale
  Zeit" · Gründervideo „Warum ich Strado baue".
- **Folge-Liste** auf ~30 relevante Konten kürzen (Clubs, Pässe, Partner;
  Stand 2026-09-24: 102 gefolgt, 13 Follower).

### TikTok `@strado.ch`

- **Namensfeld:** `Strado | Pässe & Strecken`
- **Bio:**
  ```
  Alle Schweizer Pässe: offen oder zu? 🏔️
  Strecken, Höhenprofile, Bestzeiten – legal.
  Gratis im Browser ↓
  ```
- **Link:** klickbarer Link braucht ein Business-Konto — Abwägung: dafür
  nur noch die kommerzielle Musikbibliothek (siehe `tiktok/README.md`). Bis
  dahin „app.strado.ch" in die Caption und als angehefteten Kommentar; nie
  „Link in Bio" schreiben, wenn es keinen gibt.
  Ziel: `https://app.strado.ch/paesse?utm_source=tiktok&utm_medium=social&utm_campaign=bio`
- **Aufräumen:** die zwei „Race now"-/#racing-Videos vom 13.09. archivieren
  oder neu betexten (Stimmung behalten, Anspruch streichen).

### Überall

- Linkziel ist **/paesse**, nicht die Startseite: dort steht die Antwort auf
  die Frage, mit der jemand im Herbst und Frühling kommt.
- Zweiter Zähler: die `/c/<code>`-Links (`docs/creator-links-plan.md`),
  etwa `/c/ig`, `/c/tt`.
- UTM-Schema: `utm_source` = Kanal, `utm_medium` = `social` | `event` |
  `creator` | `press`, `utm_campaign` = Anlass (`bio`, `wintersperre-2026`, …).

Siehe `docs/marketing/content-saeulen.md` für Inhalte und Kalender.
