# Werbetexte für Premium

Was in der App steht, ist ausgeliefert — die Dateien sind genannt. Was
darunter unter "Noch nicht ausgeliefert" steht, sind Vorlagen für die
Infoseite, die Ankündigungsmail und die Kanäle; sie gehören nicht in diesen
PR, weil sie ausserhalb dieses Repos leben.

## Die Regeln, gegen die jeder Satz hier geprüft ist

1. **Nur was es gibt.** `lib/premiumVorteile.ts` ist über AGB Ziff. 3.2 eine
   zugesagte Vertragsleistung. Ein Satz, der mehr verspricht als diese Liste,
   ist kein Marketing, sondern eine Vertragsänderung.
2. **Was gratis bleibt, wird genannt.** Entdecken, Aufzeichnen, Strecken
   erstellen, Ranglisten, Feed und der **Passstatus** (aus dem separaten
   Pass-System) bleiben kostenlos. Ein
   Vorteil, der verschweigt, was es auch ohne Abo gibt, wird beim ersten
   Ausprobieren als Übertreibung gelesen.
3. **Keine Zeiten, kein Tempo.** AGB Ziff. 11.3: Strado ist kein Wettbewerb um
   Geschwindigkeit. Das gilt für Werbetexte genauso wie für Funktionen —
   "schneller als Marco" ist der Satz, den wir nicht schreiben.
4. **Schweizer Rechtschreibung** (ss statt ß), Preise als Bruttobeträge mit
   "CHF", Datumsangaben schweizerisch.
5. **Zeigen statt behaupten** (`docs/markt/schweizer-identitaet.md` §0): nicht
   "die Schweizer App", sondern der Klausen, die MFK, swisstopo, TWINT.

---

## Ausgeliefert in diesem PR

### Kaufseite (`components/PremiumPurchaseView.tsx`)

> **Mehr aus jeder Saison**
>
> Deine Strecken ins Navi, das Wetterfenster für die Woche, jeder Pass, den du
> hattest, und ein Wartungsheft, das mitzählt. Entdecken, Aufzeichnen,
> Ranglisten und Feed bleiben gratis — Premium ist das, was darüber hinausgeht,
> und die Art, wie Strado sich trägt.

Vorher stand dort "Strado unterstützen" und darunter eine Aufzählung dessen,
was gratis bleibt. Das war ehrlich und zu leise: wer auf der Kaufseite landet,
weiss schon, dass die App gratis nutzbar ist — er will wissen, was er bekommt.
Die Unterstützung fällt nicht weg, sie ist der zweite Halbsatz. Sie ist nach
wie vor die einzige ehrliche Begründung für einen Preis über Kurviger
(`docs/markt/konkurrenzanalyse-schweiz.md` §6.5).

### Die Vorteilsliste (`lib/premiumVorteile.ts`)

In dieser Reihenfolge, und die Reihenfolge ist die Korrektur an der alten
Liste: vorne steht, was am ersten Tag einen Grund gibt, hinten die
Obergrenzen, die man erst im zweiten Sommer spürt.

1. Wetterfenster: die trockenen Tage der Woche
2. Pass-Sammlung und Saisonrückblick als Bild
3. Wartungsheft mit MFK- und Service-Erinnerung
4. GPX-Export kuratierter Strecken — fürs Navi
5. Auswertung nach Jahr und Fahrzeug
6. Unbegrenzt Strecken offline speichern
7. Unbegrenzt private Strecken (ohne Abo: eine)
8. 12 statt 6 Fotos pro Fahrt

Punkt 4 ist der unterschätzte: er macht Strado zur Ergänzung der
Navigations-Apps statt zu ihrem Konkurrenten — "die Strecke, die du hier
findest, fährst du mit dem Navi, das du schon hast". Genau das ist die
Position, die `docs/markt/konkurrenzanalyse-schweiz.md` §6.4 offen lässt.

Die ersten drei Zeilen tragen zusätzlich die Kurzform, die Konten ohne Abo im
Profil und in den Einstellungen sehen (`premiumKurzform()`). Deshalb enthalten
sie kein Komma: die Kurzform trennt mit Mittelpunkt.

### Die Zeilen an den Funktionen selbst (`components/PremiumHinweis.tsx`)

Eine je Ort, im gleichen Ton: was hier mit Premium stünde, nicht was gesperrt
ist. Kein Schloss-Symbol — additives Gating nimmt nichts weg.

- Streckenseite: "Mit Premium siehst du, an welchen Tagen diese Woche die
  Strecke trocken ist"
- Profil, Pass-Sammlung: "Mit Premium siehst du jeden Pass mit deiner ersten
  Fahrt und teilst deine Saison als Bild"
- Fahrzeugseite: "Mit Premium führst du hier dein Wartungsheft und Strado
  erinnert dich an MFK und Service"

### Zahlung und Abschluss

Auf der Zahlungsseite steht je Plan, was tatsächlich passiert — beim Pass
"einmalige Zahlung, verlängert sich nicht, keine Kündigung nötig", bei der
Testphase "die ersten 14 Tage sind gratis, kündigst du innerhalb dieser Zeit,
wird nichts abgebucht". Die Schaltfläche trägt den Betrag **und das Datum**,
wenn die erste Zahlung später fällig wird: "Gratis testen — ab 01.10.2026
CHF 39.00". "CHF 0.00" allein wäre die halbe Wahrheit über eine Verpflichtung.

---

## Noch nicht ausgeliefert — Vorlagen

### Infoseite `strado.ch` (Repo `janlampert08-dev/stradoinfo`)

Der Preisblock und das `Offer`-Schema führen heute CHF 4.90 und CHF 49.00.
**Beides muss am selben Tag umgestellt werden wie die Stripe-Preise**, sonst
bewirbt die öffentliche Seite einen Preis, der beim Abbuchen ein anderer ist.
Neu:

| Plan | Preis |
| --- | --- |
| Gratis | CHF 0 — Strecken entdecken, Fahrten aufzeichnen, eigene Strecken anlegen, Ranglisten, Passstatus |
| Premium, Monatsabo | CHF 6.90 |
| Premium, Jahresabo | CHF 39.00 (14 Tage gratis) |
| Premium, Saisonpass | CHF 29.00 für 6 Monate, ohne Verlängerung |

Textvorschlag für den Premium-Abschnitt der Infoseite:

> **Premium: mehr aus jeder Saison**
>
> Das Wetterfenster zeigt dir, an welchen Tagen diese Woche die Strecke trocken
> ist. Die Pass-Sammlung hält fest, welche Pässe du schon hattest — und im
> Dezember wird daraus dein Saisonrückblick. Dazu das Wartungsheft mit
> MFK-Erinnerung und jede kuratierte Strecke als GPX für dein Navi.
>
> CHF 39.00 im Jahr, die ersten 14 Tage gratis. Oder CHF 29.00 für die halbe
> Saison, ohne Verlängerung. Entdecken, Aufzeichnen und die Ranglisten bleiben
> kostenlos.

### Ankündigung an bestehende Konten (Pflicht, nicht Kür)

AGB Ziff. 14.1 verlangt vor dem Inkrafttreten einer neuen Fassung **30 Tage**
Vorlauf, per E-Mail **und** in der App, mit Hinweis auf Zustimmungsfiktion und
Widerspruchsrecht. Die Preisrunde und der Premium-Ausbau sind so eine
Änderung, und es liegt bereits ein zweiter, unveröffentlichter Entwurf vor
(Ziff. 11.4/12.6). **Beide gehören in eine Mitteilung, nicht in zwei.**

> Betreff: Neue Premium-Funktionen, neue Preise — und was für dich gilt
>
> Hallo
>
> Strado bekommt drei neue Premium-Funktionen: das Wetterfenster für die
> nächsten sieben Tage, die Pass-Sammlung mit Saisonrückblick und ein
> Wartungsheft mit MFK-Erinnerung.
>
> Damit ändern sich die Preise für **neue** Abos: CHF 6.90 im Monat, CHF 39.00
> im Jahr (statt 49.00), neu ein Saisonpass für CHF 29.00, der sechs Monate
> gilt und sich nicht verlängert. **Dein bestehendes Abo behält seinen Preis**,
> solange es ununterbrochen läuft.
>
> Gleichzeitig treten überarbeitete AGB in Kraft, am <Datum, mind. 30 Tage>.
> Was sich ändert, steht unter <Link>. Widersprichst du nicht bis dahin, gelten
> sie als angenommen; widersprichst du, kannst du bis zu diesem Datum kündigen.
>
> Gute Fahrt
> Strado

Kein Superlativ, keine Dringlichkeit, kein Rabatt. Eine Pflichtmitteilung, die
wie Werbung klingt, wird als Werbung überlesen — und dann ist die Frist
formell gelaufen, aber nicht angekommen.

### Kanäle (Instagram, TikTok — `docs/marketing/`)

Je Funktion ein Beitrag, jeder mit einem Ort im Bild, nicht mit einem
Screenshot der Preisliste:

- **Wetterfenster:** ein Wochenraster über einem Passfoto. "Sonntag trocken,
  18°. Samstag lieber nicht."
- **Pass-Sammlung:** die Liste mit Scheitelhöhen. "Sieben von zwölf. Vier
  Wochenenden."
- **Wartungsheft:** die MFK-Zeile. "Der Termin, den niemand freiwillig im
  Kopf behält."

Was in keinem Beitrag vorkommt: Geschwindigkeit, Zeiten, Ranglistenplätze auf
Tempo. Das ist nicht Vorsicht, sondern die eigene Positionierung — und AGB
Ziff. 11.3.

### Was wir nicht behaupten

- Nicht "offiziell" oder "amtlich". Der Passstatus ist von Hand gepflegt und
  nennt sein Prüfdatum; verbindlich ist die Signalisation vor Ort. Das
  Schweizerkreuz ist erlaubt, das Wappen nicht
  (`docs/markt/schweizer-identitaet.md` §4.4).
- Nicht "Navigation". Strado zeigt Strecken und exportiert GPX; es navigiert
  nicht (AGB Ziff. 3.4).
- Keine Nutzerzahlen, solange sie zweistellig sind.
- Keine leeren Kantone als "national" verkaufen. 25 Strecken sind 25
  Strecken — die Karte füllt Streckenarbeit, nicht Copy.
