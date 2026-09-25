# Entwurf AGB 2026-09 — konsolidierte Fassung (NICHT in Kraft)

> ## Entwurf zur anwaltlichen Prüfung — keine Rechtsberatung
>
> Dieser Text ist von einem KI-Assistenten erstellt und **anwaltlich nicht
> geprüft**. Er stellt **keine Rechtsberatung** dar und trifft keine Aussage
> darüber, ob eine Klausel rechtlich hält. Er ist **nicht veröffentlicht und
> nicht in Kraft**. Geltend ist weiterhin die unter
> `https://strado.ch/legal/agb` veröffentlichte Fassung vom
> **14. September 2026** (HTML im Repo `janlampert08-dev/stradoinfo`).
>
> Diese Datei ersetzt `docs/rechtstexte/agb.md` **nicht**. Sie fasst alles,
> was für die nächste Mitteilung nach Ziff. 14.1 ansteht, in **einem**
> Dokument zusammen, damit es in **einer** Mitteilung angekündigt werden
> kann. Grundlage ist der Stand von `docs/rechtstexte/agb.md` auf `staging`
> (2026-09-23).
>
> Entwurfsdatum: 23. September 2026, ergänzt am 25. September 2026 (Abschnitt D)

## Änderungsübersicht gegenüber der geltenden Fassung (14. September 2026)

**Woher die Änderungen kommen.** Der Entwurf zu Ziff. 11.3/11.4/12.6 vom
15. September 2026 (Zweig `claude/konkurrenzanalyse-schweiz-46t0ka`) ist
inzwischen in `docs/rechtstexte/agb.md` auf `staging` enthalten und dort
für diese drei Ziffern wortgleich; ebenso der Premium-Entwurf vom
17. September 2026 und die Ergänzung von Ziff. 10.1.1. Neu in **diesem**
Entwurf sind Ziff. 1.3, 3.5, 4.5 (letzter Satz), 4.7 und 13.3. Alle Punkte
gehören in dieselbe Mitteilung.

### A. Neu in diesem Entwurf (23. September 2026)

| Ziff. | Bisher (geltend) | Neu | Warum |
| --- | --- | --- | --- |
| **1.3** | „… mit Schwerpunkt Schweiz, vorerst Raum Zürich." | „… für Auto- und Motorradstrecken in der Schweiz." | Das Produkt ist seit dem 2026-09-16 national (Entscheid des Inhabers, `AGENTS.md`). Wortlaut aus `docs/markt/schweizer-identitaet.md` Abschnitt 5. Sitz, Adresse und Gerichtsstand (Zürich) sind nicht betroffen. |
| **3.5** (neu) | — | **Live-Split während der Aufzeichnung**: persönliche Tempohilfe gegen die eigene Bestzeit und die veröffentlichte Streckenbestzeit, nur während der Aufzeichnung, ohne Bedienung, keine eigene Wertung, Zeiten unter Verstoss zählen nicht, alleinige Verantwortung für SVG und Gerätebedienung, jederzeit abschaltbar. | Entscheid des Inhabers vom 2026-09-23. Die Funktion wird hinter einem standardmässig ausgeschalteten Schalter ausgeliefert und erst nach Inkrafttreten dieser Fassung eingeschaltet. Sie berührt Art. 90 und Art. 31 SVG unmittelbarer als jede bisherige Funktion (siehe Prüfliste unten, Punkt 9). |
| **4.5** (letzter Satz) | „Ein kostenloser Testzeitraum wird nicht angeboten. Stattdessen gilt die Geld-zurück-Regel nach Ziff. 7." | Testphase auf dem Jahresabo (aus dem Entwurf vom 17.9., siehe C) **plus**: „Weitere kostenlose Testzeiträume werden nicht angeboten; ausgenommen sind Einladungsangebote nach Ziff. 4.7." | Der Einladungslink mit 7 Tagen Premium (Migration `0121`, live) widerspricht dem Wortlaut der geltenden Ziff. 4.5. Die Migration hält diesen Widerspruch selbst als offen fest. |
| **4.7** (neu) | — | **Einladungsangebote**: ausdrücklich bezeichnet, nur bei Registrierung über den Link, einmal pro Konto, ohne Zahlungsmittel, ohne Abo, enden von selbst ohne Umwandlung in ein Abo; Ziff. 9 gilt nach Ablauf. | Macht das Angebot aus `0121` vertraglich zu dem, was es technisch ist: `premium_gratis` mit `gueltig_bis`, kein Stripe-Objekt, Ablauf über `premium_abgleich()`. |
| **13.3** | Haftungsausschluss für das Verlassen auf Angaben nach Ziff. 3.4 | ergänzt um die Anzeige nach Ziff. 3.5 | Folgeänderung zu 3.5. Ziff. 13.1 (unbeschränkte Haftung bei Absicht, grober Fahrlässigkeit, Körperverletzung, Tod) bleibt vorbehalten. |

**Falls die Testphase aus dem Entwurf vom 17. September nicht Teil der
Mitteilung wird**, lautet Ziff. 4.5 stattdessen: „Ein kostenloser
Testzeitraum wird nicht angeboten; ausgenommen sind ausdrücklich
bezeichnete Einladungsangebote nach Ziff. 4.7 (z. B. 7 Tage Premium bei
Registrierung über einen Einladungslink), die ohne Zahlungsmittel und ohne
automatische Umwandlung in ein Abo enden. Im Übrigen gilt die
Geld-zurück-Regel nach Ziff. 7." Ziff. 4.7 bleibt dann unverändert, ihr
letzter Aufzählungspunkt entfällt.

### B. Übernommen aus dem Entwurf vom 15. September 2026

| Ziff. | Bisher (geltend) | Neu | Warum |
| --- | --- | --- | --- |
| **11.3** | „Zeiten werden nur erfasst, wenn die Nutzenden dies selbst aktivieren." | Plattformweite Bestenlisten nur auf tempounabhängigen Grössen (Fahrten, km, Höhenmeter, Anzahl Strecken); Bestzeitenliste je Strecke als eingegrenzte Nebenwertung (nur öffentlich gestellte, nur verifizierte Fahrten, kein Vorteil); Zeit entsteht bei jeder Aufzeichnung, Opt-in ist die Veröffentlichung. **In diesem Entwurf ergänzt:** Verweis auf Ziff. 3.5 (der Live-Split ändert daran nichts). | Die alte Fassung beschrieb ein Opt-in, das es seit `0017` nicht mehr gibt, und verschwieg die Bestzeitenliste, auf der gewinnt, wer schneller fährt (`lib/leaderboard.ts`). |
| **11.4** | Verbot „jedes Verhaltens, das darauf zielt, eine … Zeit zu unterbieten" | Verbot beschränkt auf das Unterbieten **unter Missachtung der Verkehrsregeln oder unter Gefährdung anderer** | Die alte Fassung verbot das regelkonforme erneute Befahren einer Strecke — das eigene Produkt — unter Androhung der Sperre nach Ziff. 11.7. |
| **12.6** (neu) | — | Definition der **verifizierten Fahrt** (Serverzeit aus Positionsmeldungen während der Fahrt), was sie nicht garantiert, und dass eine fehlende Verbindung die Fahrt nicht entwertet | Grundlage für die Bestzeitenliste nach Ziff. 11.3 und für jede Anzeige „verifiziert" in der App. |
| **3.2** (Satz zu Zeiten) | Auswertung „ohne Zeiten" als Verbot formuliert | als gelieferter Funktionsumfang formuliert | Keine Änderung am Funktionsumfang (`lib/fahrtstatistik.ts`). |

### C. Übernommen aus dem Entwurf vom 17. September 2026 (Premium-Ausbau)

| Ziff. | Änderung in Kurzform | Warum |
| --- | --- | --- |
| **3.2** | Wetterfenster, Pass-Sammlung mit Saisonrückblick, Wartungsheft neu im Abo | Premium-Ausbau, rein additiv (`docs/premium-plan.md` Abschnitt 4) |
| **4.1** | CHF 4.90/49.00 → CHF 6.90/39.00, neu Saisonpass CHF 29.00 für sechs Monate | `docs/premium-neu/preise.md` |
| **4.3** | Preisbindung auch für Abos zu CHF 4.90/49.00 | gleiche Regel wie beim Gründerpreis |
| **4.5** | „kein Testzeitraum" → 14 Tage gratis auf dem Jahresabo, einmal pro Konto | `docs/premium-neu/`; `PREMIUM_TESTPHASE` bleibt bis zum Inkrafttreten aus |
| **4.6, 6.1, 6.3, 6.6, 6.7, 7.1, 7.2** | Saisonpass: keine Verlängerung, keine Kündigung, Geld-zurück gilt auch für ihn | Folgeänderungen zu 4.1 |
| **10.1.1** | Fahrten neu **voreingestellt öffentlich** statt standardmässig privat | Entscheid des Inhabers nach UI/UX-Review; PR `staging-fahrten-standardmaessig-oeffentlich` darf nicht vor dem Inkrafttreten ausgeliefert werden |

### D. Ergänzt am 25. September 2026 (Fahrten für Follower, Folgeanfragen)

| Ziff. | Änderung in Kurzform | Warum |
| --- | --- | --- |
| **10.1.1** | Dritte Sichtbarkeitsstufe **„Follower"**; neue Einstellung **„Neue Follower bestätigen"**, voreingestellt an | Entscheid des Inhabers vom 2026-09-25 (Migrationen `0145`–`0147`). Engere Sichtbarkeit und mehr Kontrolle — die Funktion darf vor dem Inkrafttreten ausgeliefert werden, die AGB beschreiben sie nur nach |
| **10.2** | Rechteeinräumung auch für Inhalte, die **mit Followern geteilt** sind | Ohne sie deckte das Recht aus 10.2 die Anzeige einer Follower-Fahrt nicht, weil sie nicht „veröffentlicht" ist |
| **11.3** | Follower-Fahrten erscheinen in **keiner Bestzeitenliste** | Eine Liste, deren Inhalt davon abhängt, wer schaut, ist keine |
| **9.6** | Bei der Kontolöschung werden Follower-Fahrten unsichtbar und offene Folgeanfragen gelöscht | `anonymize_account` seit `0145`/`0146` |

## Vor der Veröffentlichung

In dieser Reihenfolge; keiner der Schritte ist mit dem Commit dieser Datei
erledigt.

1. **Anwaltliche Prüfung durch eine in der Schweiz zugelassene Anwältin
   oder einen Anwalt**, insbesondere:
   - **Live-Split (Ziff. 3.5) und Art. 90 SVG**: Ob eine laufende Anzeige
     des Rückstands oder Vorsprungs gegenüber einer Bestzeit — die auf einer
     Strecke mit Tempolimit im Wesentlichen nur durch schnelleres Fahren
     aufzuholen ist — als Anreiz zu Geschwindigkeitsüberschreitungen oder
     als Anleitung zu einem Geschwindigkeitsvergleich auf öffentlichen
     Strassen gewertet werden kann, und ob die Einschränkungen in Ziff. 3.5
     daran etwas ändern. Der Prüfung ist dieser Sachverhalt so vorzulegen,
     nicht abgeschwächt.
   - **Art. 31 SVG (Beherrschung des Fahrzeugs, Aufmerksamkeit) und
     Art. 3 Abs. 1 VRV**: ob eine Anzeige im Blickfeld und ein haptisches
     Signal an Kontrollpunkten die Aufmerksamkeitspflicht berühren, und ob
     die Formulierung „ohne Bedienung, nur zum Ablesen" die Verantwortung
     tragfähig bei den Nutzenden belässt.
   - **Ziff. 11.3, 11.4, 12.6** (offene Punkte 7 und 8 unten).
   - **Ziff. 4.7**: ob das Einladungsangebot neben der Testphase nach
     Ziff. 4.5 als klar abgegrenzt gilt (UWG, Transparenz).
   - **Ziff. 13.3**: Haltbarkeit der Ergänzung in Konsumentenverträgen.
2. **Eine einzige Mitteilung nach Ziff. 14.1**, mindestens **30 Tage** vor
   Inkrafttreten, per **E-Mail und in der App**, mit ausdrücklichem Hinweis
   auf die Zustimmungsfiktion und das Widerspruchsrecht. Sie umfasst alle
   Änderungen der Abschnitte A, B und C — keine zweite Mitteilung für
   einzelne Punkte. Frühestes Inkrafttreten = Versanddatum + 30 Tage; das
   Datum in der Kopfzeile unten ist erst dann einzusetzen.
3. **Veröffentlichte HTML-Fassung im Repo `janlampert08-dev/stradoinfo`
   nachführen** (`legal/agb`), auf das Inkrafttretensdatum hin — nicht
   früher. Bis dahin bleibt dort die Fassung vom 14. September 2026.
4. **Live-Split-Schalter erst nach dem Inkrafttreten einschalten.** Bis
   dahin bleibt er aus — auch auf `staging`-Deployments, die Produktionsdaten
   anzeigen. Dasselbe gilt für `PREMIUM_TESTPHASE` und für die
   Auslieferung von `staging-fahrten-standardmaessig-oeffentlich`.
5. **`AGENTS.md` nachführen**: den Absatz zu AGB Ziff. 11.4/12.6 („not in
   force") und den Absatz „three things deliberately still say Zürich"
   (AGB Ziff. 1.3) auf den neuen Stand bringen, den Live-Split und das
   Einladungsangebot mit ihrer AGB-Ziffer vermerken, und festhalten, dass
   `docs/rechtstexte/agb.md` mit Inkrafttreten auf diese Fassung
   nachgezogen ist.

**Zum Einladungslink bis dahin.** Solange diese Fassung nicht in Kraft ist,
gilt Ziff. 4.5 der Fassung vom 14. September 2026 — der Link aus `0121`
steht bis dahin gegen den geltenden Vertragstext. Ob er bis zum
Inkrafttreten weiter verteilt wird, entscheidet der Inhaber; dieser Entwurf
heilt die Zeit davor nicht.

## Offene Entscheide des Inhabers

- **Einladungsangebot und Testphase**: Ziff. 4.7 ist so gefasst, dass ein
  Einladungsangebot die spätere Testphase auf dem Jahresabo **nicht**
  ausschliesst (es ist weder Abo noch Saisonpass, und so prüft es auch der
  Code). Soll es sie ausschliessen, ist der letzte Punkt von Ziff. 4.7 und
  der vorletzte Satz von Ziff. 4.5 anzupassen.
- **Live-Split nur mit eigener Bestzeit?** Ziff. 3.5 deckt beide
  Vergleichswerte ab, wie beschlossen. Ein Vergleich nur gegen die eigene
  Bestzeit wäre gegenüber Art. 90 SVG die zurückhaltendere Variante; die
  Klausel liesse sich durch Streichen des zweiten Vergleichswerts darauf
  verengen.
- **Kostenlos oder Premium?** Ziff. 3.5 legt das bewusst nicht fest. Wird
  der Live-Split Teil des Abos, ist Ziff. 3.2 zu ergänzen und Ziff. 3.3.2
  zu beachten — die Abschaltbarkeit nach Ziff. 3.5.6 stünde dann in
  Spannung zu einer bezahlten Leistung.
- **Was Ziff. 3.5 der Umsetzung vorschreibt**, damit der Text stimmt: ein
  Schalter für die Nutzenden selbst (3.5.6), keine Eingabe während der
  Fahrt (3.5.3), der angezeigte Abstand wird weder gespeichert noch
  veröffentlicht (3.5.2), die Streckenbestzeit stammt nur aus der
  Bestzeitenliste nach Ziff. 11.3 (verifizierte, öffentlich gestellte
  Fahrten), und der Betreiberschalter kann einzelne Strecken ausnehmen
  (3.5.6). Weicht die Umsetzung ab, ist der Text anzupassen, nicht
  umgekehrt stillschweigend hinzunehmen.

---

**Stand der geltenden Fassung: 14. September 2026**
**Stand dieses Entwurfs: 23. September 2026 — nicht in Kraft; Inkrafttreten
frühestens 30 Tage nach der Mitteilung nach Ziff. 14.1 (Datum offen)**

## 1. Geltungsbereich und Anbieterin

**1.1** Diese Allgemeinen Geschäftsbedingungen (nachfolgend „AGB") regeln die
Nutzung der Plattform Strado (Website und Webanwendung, nachfolgend „Strado"
oder „Plattform"), die unter `https://strado.ch` (Website mit den
Rechtstexten) und `https://app.strado.ch` (Webanwendung) erreichbar ist.

**1.2** Anbieterin und Vertragspartnerin ist:

Jan Lampert, Einzelunternehmen (nicht im Handelsregister eingetragen)
c/o Softsite AG, Leutschenbachstrasse 45, 8050 Zürich, Schweiz
E-Mail: contact@strado.ch

(nachfolgend „Anbieterin"). Weitere Angaben finden sich im Impressum unter
`https://strado.ch/legal/impressum`.

**1.3** Strado ist eine kuratierte Plattform für Auto- und Motorradstrecken
in der Schweiz. Nutzende können Strecken
entdecken, eigene Fahrten per GPS aufzeichnen und speichern, Fahrten
veröffentlichen, Strecken bewerten und vorschlagen sowie anderen Nutzenden
folgen.

**1.4** Diese AGB gelten für alle Nutzenden — sowohl für die kostenlose
Nutzung als auch für das kostenpflichtige Premium-Abo. Abweichende oder
ergänzende Bedingungen der Nutzenden gelten nur, wenn die Anbieterin ihnen
ausdrücklich schriftlich zustimmt.

**1.5** Vertragssprache ist Deutsch. Massgebend ist ausschliesslich die
deutsche Fassung dieser AGB.

## 2. Konto, Vertragsschluss und Voraussetzungen

**2.1** Für die meisten Funktionen ist ein Benutzerkonto nötig. Die
Registrierung erfolgt mit E-Mail-Adresse, Passwort und einem frei gewählten
Anzeigenamen. Die E-Mail-Adresse muss über den zugesandten Bestätigungslink
verifiziert werden.

**2.2** Der Nutzungsvertrag über die kostenlose Nutzung kommt mit der
erfolgreichen Registrierung zustande. Ein Anspruch auf Registrierung besteht
nicht.

**2.3** Nutzende müssen handlungsfähig sein. Minderjährige und Personen unter
umfassender Beistandschaft dürfen ein Konto nur mit Zustimmung ihrer
gesetzlichen Vertretung eröffnen; ein kostenpflichtiges Abo dürfen sie nur mit
deren ausdrücklicher Zustimmung abschliessen.

**2.4** Die Angaben bei der Registrierung müssen wahrheitsgemäss sein. Der
Anzeigename darf keine Rechte Dritter verletzen und nicht irreführend sein
(insbesondere darf er keine fremde Identität vortäuschen).

**2.5** Zugangsdaten sind vertraulich zu halten und dürfen nicht an Dritte
weitergegeben werden. Besteht der Verdacht einer unbefugten Nutzung, ist die
Anbieterin unverzüglich zu informieren und das Passwort zu ändern.

**2.6** Pro Person ist grundsätzlich ein Konto zulässig. Mehrfachkonten zur
Umgehung von Nutzungsgrenzen, Sperren oder Cooldowns sind nicht gestattet.

## 3. Leistungsumfang

### 3.1 Kostenlose Nutzung

Ohne Abo stehen insbesondere zur Verfügung: das Entdecken und Durchsuchen der
kuratierten Strecken, das Starten und Aufzeichnen von Fahrten (Streckenfahrten
und freie Fahrten), das Speichern und optionale Veröffentlichen von Fahrten,
Kudos, Bewertungen, Bestenlisten und der Community-Feed sowie das Erstellen
eigener Strecken — als öffentlicher Vorschlag nach Prüfung durch die
Moderation (Ziff. 10.5) in unbegrenzter Zahl, als private Strecke nur für die
eigene Nutzung begrenzt auf eine (Ziff. 3.2).

### 3.2 Premium-Abo

Das kostenpflichtige Premium-Abo („Strado Premium") ergänzt die kostenlose
Nutzung. Es umfasst:

- eine Auswertung der eigenen Fahrten nach Jahr und nach Fahrzeug
  (Anzahl, Kilometer, Höhenmeter; derzeit **ohne** Zeiten und ohne
  Geschwindigkeiten — das beschreibt den gelieferten Funktionsumfang, nicht
  ein Verbot),
- unbegrenzt viele private Strecken — solche, die nur für die eigene Nutzung
  sichtbar sind (kostenlos: eine),
- bis zu zwölf Fotos pro Fahrt (kostenlos: sechs),
- unbegrenzt viele offline gespeicherte Strecken (kostenlos: drei),
- GPX-Export auch für kuratierte Strecken (kostenlos: nur eigene Fahrten),
- das **Wetterfenster**: eine Einschätzung der nächsten sieben Tage je
  Strecke, wie sie für eine Fahrt taugen (aus einer fremden Wetterquelle
  abgeleitet — Ziff. 12 gilt, es ist eine Prognose und keine Zusage),
- die **Pass-Sammlung**: die Übersicht der selbst gefahrenen Passstrassen mit
  dem Datum der ersten Fahrt, und den **Saisonrückblick** als Bild zum
  Teilen,
- das **Wartungsheft** je Fahrzeug mit Erinnerungen an Service und
  Motorfahrzeugkontrolle (MFK). Die Erinnerung ist eine Rechenhilfe auf den
  selbst eingetragenen Angaben und den aufgezeichneten Fahrten; für Fristen
  und Termine bleiben die Nutzenden verantwortlich.

**Kein Bestandteil des Abos** sind die Kernfunktionen aus Ziff. 3.1 — sie
bleiben dauerhaft kostenlos. Das gilt ausdrücklich auch für das **Erstellen
eigener Strecken**: Es war zwischen dem 7. September 2026 und dem Inkrafttreten
dieser Fassung dem Abo vorbehalten und ist seither wieder ohne Abo möglich. Ein
Abo hebt allein die Zahl der privaten Strecken auf; öffentliche Vorschläge sind
auch ohne Abo unbegrenzt.

Wer ohne Abo bereits mehrere private Strecken angelegt hat, behält diese
vollständig und darf sie weiter bearbeiten und veröffentlichen; begrenzt ist
ausschliesslich das Neuanlegen (Bestandsschutz).

### 3.3 Weiterentwicklung und Änderungen des Funktionsumfangs

**3.3.1** Strado wird laufend weiterentwickelt. Die Anbieterin darf einzelne
Funktionen ändern, ergänzen oder ersetzen, solange der wesentliche
Leistungsumfang des Abos dadurch nicht beeinträchtigt wird.

**3.3.2** Wird eine wesentliche Premium-Leistung dauerhaft eingestellt, werden
betroffene Abonnentinnen und Abonnenten vorgängig per E-Mail informiert. Sie
können das Abo in diesem Fall auf den Zeitpunkt der Änderung kündigen; bereits
im Voraus bezahlte Beträge werden für die nicht genutzte Restlaufzeit anteilig
zurückerstattet.

### 3.4 Kuratierte Strecken sind Vorschläge, keine Navigation

**3.4.1** Strado ist **keine Navigations-App**. Die Plattform zeigt Strecken,
Karten, Höhenprofile, Wetter- und Verkehrsangaben zu Informationszwecken.

**3.4.2** Angaben zu Strassenzustand, Befahrbarkeit, Saison (Passöffnung),
Verkehrslage, Wetter und insbesondere zu **Tempolimits** stammen teilweise aus
externen Datenquellen und aus automatisierten Auswertungen. Sie können
unvollständig, veraltet oder falsch sein. Für Abschnitte ohne hinterlegte
Signalisation wird ein Standardwert angenommen. **Diese Angaben sind
unverbindlich und ersetzen weder die Signalisation vor Ort noch die eigene
Beurteilung der Verkehrslage.** Massgebend ist ausschliesslich die tatsächliche
Signalisation und die geltende Strassenverkehrsgesetzgebung.

**3.4.3** Angezeigte Fahrzeiten sind **Schätzungen, keine Zusagen**. Die zu
einer Strecke angezeigte Dauer wird rechnerisch aus Länge, Streckencharakter
und hinterlegten Tempolimits abgeleitet; sie berücksichtigt weder die
tatsächliche Verkehrslage noch Baustellen, kurzfristige Sperrungen, Witterung
oder die individuelle Fahrweise. Auch die in Bestenlisten angezeigten Zeiten
anderer Nutzender sind keine Zusage, dass eine Strecke in dieser Zeit gefahren
werden kann oder darf. **Ein Anspruch darauf, eine bestimmte Zeit zu erreichen,
besteht nicht; das Erreichen einer angezeigten Zeit ist kein Ziel der Nutzung
von Strado.**

### 3.5 Live-Split während der Aufzeichnung

**3.5.1 Was angezeigt wird.** Während der Aufzeichnung einer Streckenfahrt
kann Strado den zeitlichen Abstand zur **eigenen Bestzeit** der Nutzenden auf
dieser Strecke und zur **veröffentlichten Bestzeit** der Strecke (Ziff. 11.3)
anzeigen, z. B. „−0:12", und an Kontrollpunkten der Strecke ein kurzes
haptisches Signal (Vibration) auslösen („Live-Split"). Der Live-Split ist eine
**persönliche Orientierungshilfe** über den Verlauf der eigenen Fahrt. Er ist
keine Aufforderung, eine Zeit zu erreichen oder zu unterbieten, und keine
Zielvorgabe; Ziff. 3.4.3 gilt entsprechend.

**3.5.2 Nur während der Aufzeichnung.** Der Live-Split wird ausschliesslich
während einer laufenden Aufzeichnung angezeigt. Er wird weder veröffentlicht
noch mit der Fahrt gespeichert und begründet keine eigene Wertung,
Rangliste oder Auszeichnung. Für Bestzeitenlisten gilt allein Ziff. 11.3.

**3.5.3 Keine Bedienung während der Fahrt.** Der Live-Split ist so
gestaltet, dass er nur abgelesen wird; er verlangt während der Fahrt keine
Eingabe. Die Aufmerksamkeit gilt jederzeit der Strasse und dem Verkehr.
Nutzende dürfen die Anzeige nur ablesen, wenn und soweit dies die
Verkehrslage gefahrlos erlaubt, und sie dürfen das Gerät während der Fahrt
nicht bedienen (Ziff. 11.2). Wer die Anzeige nicht gefahrlos ablesen kann,
schaltet den Live-Split vor der Abfahrt ab oder verzichtet auf ihn.

**3.5.4 Kein Anreiz zur Geschwindigkeitsüberschreitung.** Der Live-Split
lädt nicht dazu ein, Geschwindigkeitsbegrenzungen oder andere Verkehrsregeln
zu missachten, und belohnt dies nicht. Zeiten, die unter Missachtung von
Verkehrsregeln oder unter Gefährdung anderer zustande gekommen sind, zählen
nicht; sie dürfen nicht veröffentlicht werden (Ziff. 11.3) und können nach
Ziff. 10.6 aus den Bestenlisten entfernt werden. Die Melde- und
Moderationsregeln nach Ziff. 10.5 und 10.6 sowie die Pflichten und
Sanktionen nach Ziff. 11.1 bis 11.4 und 11.7 gelten unverändert.

**3.5.5 Verantwortung.** Die Nutzenden bleiben **allein verantwortlich**
für die Einhaltung des Strassenverkehrsgesetzes (SVG) und seiner
Ausführungsvorschriften, insbesondere der signalisierten und allgemeinen
Höchstgeschwindigkeiten und der Pflicht, das Fahrzeug ständig zu beherrschen
und der Strasse und dem Verkehr die nötige Aufmerksamkeit zuzuwenden, sowie
für die Einhaltung der Vorschriften über die Bedienung von Geräten während
der Fahrt. Die angezeigten Abstände beruhen auf Aufzeichnungen, die nach
Ziff. 12.4 ungenau sein können.

**3.5.6 Abschaltung.** Die Nutzenden können den Live-Split jederzeit
abschalten. Die Anbieterin kann ihn jederzeit ganz, für einzelne Strecken
oder Streckenabschnitte oder für einzelne Konten abschalten oder in Umfang
und Darstellung ändern, insbesondere aus Gründen der Verkehrssicherheit. Ein
Anspruch auf den Live-Split besteht nicht.

## 4. Preise und Mehrwertsteuer

**4.1** Für das Premium-Abo gelten die folgenden Preise:

| Plan | Preis | Laufzeit | Verlängerung |
| --- | --- | --- | --- |
| Monatsabo | **CHF 6.90** | 1 Monat | automatisch (Ziff. 6.3) |
| Jahresabo | **CHF 39.00** | 12 Monate | automatisch (Ziff. 6.3) |
| Saisonpass | **CHF 29.00** | 6 Monate | **keine** (Ziff. 4.6) |

**4.2** Alle Preise sind Endpreise in Schweizer Franken **inklusive allfälliger
Mehrwertsteuer** und allfälliger weiterer Abgaben. Es kommen keine weiteren
Kosten der Anbieterin hinzu. Allfällige Gebühren der Bank oder des
Zahlungsdienstleisters der Nutzenden (z. B. Fremdwährungs- oder
Auslandszuschläge bei einer nicht auf CHF lautenden Karte) gehen zulasten der
Nutzenden.

**4.3 Frühere Preise.** Nicht mehr angeboten werden der Gründerpreis von
CHF 39.00 pro Jahr (bis 7. September 2026) sowie das Monatsabo zu CHF 4.90 und
das Jahresabo zu CHF 49.00 (bis zum Inkrafttreten dieser Fassung). Abos, die
zu einem dieser Preise abgeschlossen wurden, behalten ihn, solange das Abo
ununterbrochen läuft; wird es gekündigt oder wegen Zahlungsverzugs beendet,
erlischt die Preisbindung, und ein späterer Neuabschluss erfolgt zum dann
gültigen Normalpreis. Der Gründerpreis liegt betragsmässig gleich hoch wie das
heutige Jahresabo, bleibt aber ein eigener Plan, weil er anders benannt wird
und eine eigene Preisbindung trägt.

**4.4** Preisänderungen gelten grundsätzlich nur für **neu abgeschlossene
Abos**. Bestehende Abos behalten ihren Preis; Ziff. 14.2 bleibt vorbehalten.

**4.5 Gratis-Testphase auf dem Jahresabo.** Beim **erstmaligen** Abschluss
eines Jahresabos sind die **ersten 14 Tage kostenlos**. Wird das Abo
innerhalb dieser Frist gekündigt (Ziff. 6.4), wird nichts belastet; andernfalls
wird am Ende der Testphase das Jahresentgelt fällig und automatisch eingezogen.
Ein Zahlungsmittel ist bereits beim Abschluss zu hinterlegen. Die Testphase
wird **einmal pro Konto** gewährt und entfällt, wenn für das Konto zuvor
bereits ein Abo oder ein Saisonpass bestand. Für Monatsabo und Saisonpass gibt
es keine Testphase. Weitere kostenlose Testzeiträume werden nicht angeboten;
ausgenommen sind Einladungsangebote nach Ziff. 4.7. Unabhängig davon gilt die
Geld-zurück-Regel nach Ziff. 7.

**4.6 Saisonpass.** Der Saisonpass ist eine **einmalige Zahlung** und schaltet
die Premium-Leistungen nach Ziff. 3.2 für **sechs Monate ab dem Kauf** frei.
Er **verlängert sich nicht**, wird nicht automatisch belastet und muss nicht
gekündigt werden; nach Ablauf endet der Zugang, und das Konto nutzt Strado
kostenlos weiter (Ziff. 9 gilt für bereits gespeicherte Inhalte). Wird
während eines laufenden Saisonpasses ein weiterer gekauft, **schliesst dessen
Laufzeit an das Ende des laufenden an**; es geht keine bezahlte Zeit verloren.
Wird während eines laufenden Saisonpasses ein Abo abgeschlossen, beginnt die
Zahlungspflicht dafür erst mit dem Ende des Passes.

**4.7 Einladungsangebote.** Die Anbieterin kann ausdrücklich als solche
bezeichnete Einladungsangebote machen, namentlich eine bestimmte Anzahl Tage
Premium bei der Registrierung über einen Einladungslink (z. B. 7 Tage
Premium). Für Einladungsangebote gilt:

- Sie stehen nur Konten offen, die über den betreffenden Einladungslink neu
  registriert werden, und werden **einmal pro Konto** gewährt. Bestehende
  Konten können ein Einladungsangebot nicht nachträglich einlösen.
- Es wird **kein Zahlungsmittel** verlangt, und es entsteht **kein Abo**. Das
  Angebot endet mit Ablauf der genannten Dauer von selbst, ohne Kündigung,
  ohne Belastung und **ohne automatische Umwandlung in ein kostenpflichtiges
  Abo**.
- Während der Dauer stehen die Premium-Leistungen nach Ziff. 3.2 zur
  Verfügung. Nach Ablauf nutzt das Konto Strado kostenlos weiter; für die
  bereits gespeicherten Inhalte gilt Ziff. 9.
- Ein Anspruch auf ein Einladungsangebot besteht nicht. Die Anbieterin kann
  einen Einladungslink jederzeit beenden; bereits gewährte Tage laufen davon
  unberührt zu Ende.
- Mehrfachkonten zur wiederholten Nutzung eines Einladungsangebots sind nach
  Ziff. 2.6 unzulässig.
- Ein Einladungsangebot ist weder ein Abo noch ein Saisonpass. Es schliesst
  die Testphase nach Ziff. 4.5 nicht aus. Ziff. 7 findet keine Anwendung,
  weil kein Entgelt bezahlt wird.

## 5. Zahlungsmittel und Zahlungsabwicklung

**5.1** Die Zahlungsabwicklung erfolgt über **Stripe** (Stripe Payments Europe
Ltd. bzw. die jeweils vertragschliessende Stripe-Gesellschaft). Die Anbieterin
speichert selbst keine vollständigen Karten- oder Kontodaten; diese werden
ausschliesslich von Stripe verarbeitet.

**5.2** Akzeptiert werden Kreditkarten, Apple Pay und Google Pay sowie
**TWINT**. Welche Zahlungsmittel im Einzelfall angezeigt werden, hängt vom
Gerät, vom Land und von der Verfügbarkeit beim Zahlungsdienstleister ab. Ein
Anspruch auf ein bestimmtes Zahlungsmittel besteht nicht.

**5.3** Das Entgelt wird beim Abschluss des Abos und danach jeweils zu Beginn
jeder Verlängerungsperiode im Voraus fällig und automatisch über das
hinterlegte Zahlungsmittel eingezogen. Mit dem Abschluss ermächtigen die
Nutzenden die Anbieterin bzw. Stripe zu diesem wiederkehrenden Einzug.

**5.4** Rechnungen und Zahlungsbelege werden über Stripe bereitgestellt und
sind im Kundenportal (Ziff. 6.4) abrufbar.

**5.5** Das hinterlegte Zahlungsmittel ist aktuell zu halten. Die Änderung
erfolgt selbständig über das Kundenportal.

## 6. Vertragslaufzeit, automatische Verlängerung und Kündigung

**6.1 Beginn.** Das Premium-Abo beginnt mit der erfolgreichen Bestätigung der
ersten Zahlung; bei einem Abo mit Testphase (Ziff. 4.5) mit deren Beginn. Die
Premium-Funktionen stehen ab diesem Zeitpunkt zur Verfügung. Der Saisonpass
beginnt mit der Bestätigung der Zahlung (Ziff. 4.6).

**6.2 Laufzeit.** Die Mindestlaufzeit beträgt beim Monatsabo einen Monat, beim
Jahresabo (auch bei einem früheren Gründerpreis-Abo nach Ziff. 4.3) zwölf
Monate, gerechnet ab dem Tag des Abschlusses.

**6.3 Automatische Verlängerung.** **Das Abo verlängert sich automatisch um
jeweils dieselbe Laufzeit** (ein Monat bzw. zwölf Monate) zum jeweils für
dieses Abo geltenden Preis, **sofern es nicht vorher gekündigt wird**. Mit
jeder Verlängerung wird das Entgelt für die neue Periode fällig und
automatisch eingezogen. **Der Saisonpass verlängert sich nicht** (Ziff. 4.6);
dieser Absatz und Ziff. 6.4 gelten für ihn nicht.

**6.4 Kündigung durch die Nutzenden — Frist und Weg.** Das Abo kann
**jederzeit und ohne Einhaltung einer Kündigungsfrist** gekündigt werden. Die
Kündigung wird auf das **Ende der laufenden Abrechnungsperiode** wirksam; die
Premium-Funktionen bleiben bis dahin vollständig nutzbar. Es findet keine
anteilige Rückerstattung für die laufende Periode statt; vorbehalten bleibt
Ziff. 7.

Der Kündigungsweg ist das **Stripe-Kundenportal**, das in der App über die
Profilseite erreichbar ist. Dort lässt sich das Abo mit wenigen Klicks
beenden; ebenso lassen sich Zahlungsmittel und Rechnungsadresse ändern und
Rechnungen abrufen. Nach der Kündigung zeigt das Profil bis zum Periodenende
an, bis zu welchem Datum Premium noch aktiv ist.

Alternativ genügt eine formlose Kündigungserklärung per E-Mail an
contact@strado.ch. Massgebend ist der Zugang der Erklärung bei der Anbieterin.

**6.5 Kündigung durch die Anbieterin.** Die Anbieterin kann das Abo ebenfalls
auf das Ende der laufenden Abrechnungsperiode kündigen. Aus wichtigem Grund —
insbesondere bei schwerwiegenden oder wiederholten Verstössen gegen diese AGB
(Ziff. 10 und 11) — kann sie das Abo fristlos kündigen und das Konto sperren.
Bei einer fristlosen Kündigung ohne von den Nutzenden zu vertretenden Grund
wird das Entgelt für die nicht genutzte Restlaufzeit anteilig zurückerstattet.

**6.6 Kontolöschung.** Wird das Konto gelöscht, während ein Abo oder ein
Saisonpass läuft, wird es mit der Löschung beendet. Bereits bezahlte Entgelte für die laufende
Periode werden nicht zurückerstattet; Ziff. 7 bleibt vorbehalten. **Die
Kündigung des Abos erfolgt nicht automatisch dadurch, dass ein Zahlungsmittel
ungültig wird** — sie muss über Ziff. 6.4 erklärt werden.

**6.7 Saisonpass.** Ein Saisonpass endet mit Ablauf seiner sechs Monate, ohne
Kündigung und ohne weitere Zahlung. Eine vorzeitige Beendigung ist nicht
vorgesehen; Ziff. 7 bleibt vorbehalten.

## 7. 14 Tage Geld zurück

**7.1** Die Anbieterin gewährt **freiwillig** eine Geld-zurück-Regel: Wer
innerhalb von **14 Tagen** nach dem erstmaligen Abschluss eines Premium-Abos
oder eines Saisonpasses nicht zufrieden ist, erhält auf formlose Anfrage an
contact@strado.ch das bezahlte Entgelt vollständig zurück. Eine Begründung ist
nicht nötig. Bei einem Abo mit Testphase (Ziff. 4.5) läuft die Frist ab der
ersten Belastung — vorher ist nichts bezahlt, was zurückzuerstatten wäre.

**7.2** Mit der Rückerstattung wird das Abo bzw. der Saisonpass beendet und
der Zugang zu den Premium-Funktionen endet. Rückerstattung und Kündigung werden dabei als zwei
getrennte Vorgänge ausgeführt; die Beendigung des Abos ist Teil der Zusage.

**7.3** Die Regel gilt einmal pro Person und Konto und nur beim erstmaligen
Abschluss, nicht bei Verlängerungen oder bei einem erneuten Abschluss nach
einer früheren Rückerstattung.

**7.4 Rechtliche Einordnung.** Diese Regel ist eine **freiwillige Zusage der
Anbieterin (Kulanz)**, kein gesetzliches Widerrufsrecht. Das schweizerische
Recht kennt für online abgeschlossene Verträge kein allgemeines
Widerrufsrecht. Ein allfälliges zwingendes Widerrufs- oder Rücktrittsrecht
nach dem Recht des Wohnsitzstaates der Nutzenden bleibt unberührt und geht
dieser Regel vor.

> **Prüfpunkt für die anwaltliche Durchsicht:** Nutzende mit Wohnsitz in der
> EU/im EWR können sich unter Umständen auf ein 14-tägiges Widerrufsrecht nach
> Verbraucherrichtlinie berufen. Zu klären ist, ob und wie eine
> Widerrufsbelehrung ergänzt werden muss und ob der Vertrieb bewusst auf die
> Schweiz beschränkt werden soll.

## 8. Zahlungsverzug

**8.1** Scheitert eine Abbuchung (z. B. wegen abgelaufener Karte, fehlender
Deckung oder abgelehnter TWINT-Zahlung), versucht der Zahlungsdienstleister
die Zahlung automatisch mehrfach erneut und informiert die Nutzenden per
E-Mail.

**8.2 Kulanzfrist.** Ab der ersten fehlgeschlagenen Zahlung einer Rechnung
bleiben die Premium-Funktionen für **sieben (7) Tage** weiterhin freigeschaltet
(„Kulanzfrist"). Die Frist wird **einmal pro Rechnung** gewährt; weitere
Fehlschläge derselben Rechnung verlängern sie nicht.

**8.3** Geht die Zahlung innerhalb der Kulanzfrist ein, läuft das Abo
unverändert weiter.

**8.4** Geht die Zahlung nicht innerhalb der Kulanzfrist ein, werden die
Premium-Funktionen deaktiviert. Das Konto bleibt als kostenloses Konto
bestehen; die Folgen richten sich nach Ziff. 9. Die Anbieterin kann das Abo
nach erfolglosem Ablauf der Kulanzfrist beenden.

**8.5** Der Anspruch auf das Entgelt für die bereits begonnene Periode bleibt
bestehen. Die Anbieterin behält sich vor, offene Beträge nachzufordern; auf
Verzugszinsen und Mahngebühren wird verzichtet, solange kein Inkassoverfahren
eingeleitet werden muss.

## 9. Folgen von Herabstufung, Kündigung und Kontolöschung für Inhalte

**9.1 Grundsatz: Inhalte werden nicht gelöscht.** Endet das Premium-Abo — durch
Kündigung, durch Ablauf nach erfolgloser Kulanzfrist oder auf anderem Weg —
werden **keine Nutzerinhalte gelöscht**. Das gilt ausdrücklich auch für
**private Strecken**: Sie bleiben bestehen, bleiben privat und bleiben für die
Eigentümerin oder den Eigentümer sichtbar und nutzbar. Gesperrt ist lediglich
das **Neuanlegen** weiterer Strecken.

**9.2 Fahrten, Fotos und Statistiken** bleiben unverändert erhalten und
zugänglich. Bereits gespeicherte Fotos bleiben bestehen, auch wenn eine Fahrt
mehr Fotos enthält, als das kostenlose Kontingent erlauben würde; neue Fotos
können nur noch bis zur kostenlosen Obergrenze hinzugefügt werden.

**9.3 Profil.** Profilangaben und Sichtbarkeits-Einstellungen bleiben durch
das Ende des Abos unberührt.

**9.4 Offline gespeicherte Strecken** liegen ausschliesslich lokal im Browser
der Nutzenden und werden durch das Ende des Abos nicht entfernt. Neue Strecken
können nur noch bis zur kostenlosen Obergrenze offline gespeichert werden.

**9.5 Wiederaufnahme.** Wird später erneut ein Abo abgeschlossen, stehen alle
Premium-Funktionen ohne Datenverlust wieder zur Verfügung.

**9.6 Kontolöschung.** Bei einer Kontolöschung wird das Profil anonymisiert
statt vollständig entfernt: Anzeigename und Profilbild werden entfernt, die
Fahrzeuge gelöscht und die GPS-Tracks aller Fahrten entfernt; freie Fahrten
werden auf privat gestellt, nur mit Followern geteilte Fahrten sind für
niemanden mehr sichtbar, und offene Folgeanfragen werden gelöscht. **Bereits
veröffentlichte Streckenfahrten bleiben —
ohne Namensbezug — in Bestenlisten und Statistiken erhalten**, damit diese
nicht rückwirkend verfälscht werden. Die Einzelheiten und die Möglichkeit,
darüber hinaus eine weitergehende Löschung zu verlangen, sind in der
Datenschutzerklärung beschrieben.

## 10. Nutzerinhalte, Rechte und Moderationsvorbehalt

**10.1 Eigene Inhalte.** Nutzende laden eigene Inhalte hoch: Streckenvorschläge,
GPS-Tracks, Fotos, Bewertungstexte, Fahrt-Titel und -Notizen sowie
Profilangaben („Nutzerinhalte"). Die Rechte an diesen Inhalten verbleiben bei
den Nutzenden.

**10.1.1 Voreingestellte Sichtbarkeit von Fahrten und Profilangaben.** Eine
Fahrt ist **privat** (nur für die Nutzerin oder den Nutzer selbst), **für
Follower** sichtbar (zusätzlich für die Personen, die dem Konto folgen) oder
**öffentlich**. Neu aufgezeichnete Fahrten sind **voreingestellt öffentlich**:
Vor dem Speichern ist die Sichtbarkeit sichtbar auf „Öffentlich" gesetzt und
lässt sich mit einem Tipp auf „Follower" oder „Privat" umstellen; nachträglich
ist die Einstellung pro Fahrt jederzeit änderbar. Fahrten, die die
Voraussetzungen für eine Veröffentlichung nicht erfüllen (etwa eine zu kurze
Fahrt oder eine zu geringe Abdeckung der Strecke), bleiben privat; das gilt
für beide geteilten Stufen. Automatisch erkannte Streckenabschnitte sind
privat oder öffentlich und folgen der Fahrt. Geteilt — öffentlich oder mit
Followern — wird nie der vollständige GPS-Track, sondern eine um die
Privatzone gekappte Fassung.
Bereits gespeicherte Fahrten bleiben unverändert. Die Profilangaben Profilbild, Fahrzeuge, Anzahl Pässe,
Höhenmeter, Distanz und Follower-Liste sind demgegenüber bei **neu angelegten
Konten** auf dem öffentlichen Profil **voreingestellt sichtbar** und lassen
sich in den Profileinstellungen jederzeit einzeln abschalten. Bei bestehenden
Konten bleibt die dort gespeicherte Einstellung unverändert.

**10.1.2 Folgen und Folgeanfragen.** Nutzende können anderen Nutzenden folgen.
Mit der Einstellung „Neue Follower bestätigen", die für alle Konten
**voreingestellt eingeschaltet** ist, wird daraus eine Anfrage, die die
Gefolgten annehmen oder ablehnen; erst mit der Annahme entsteht die
Folgebeziehung. Wird die Einstellung ausgeschaltet, bleiben offene Anfragen
bestehen und werden einzeln beantwortet. Bestehende Folgebeziehungen bleiben
beim Einschalten bestehen; Gefolgte können Follower jederzeit entfernen.
Einzelheiten regelt die Datenschutzerklärung.

**10.2 Rechteeinräumung.** Nutzende räumen der Anbieterin an den von ihnen
**veröffentlichten** oder **mit Followern geteilten** Inhalten ein räumlich
und zeitlich unbeschränktes, nicht ausschliessliches, unentgeltliches Recht
ein, diese im Rahmen des Betriebs von Strado zu speichern, zu vervielfältigen,
zu bearbeiten (insbesondere Skalierung, Zuschnitt und die Kappung von
Track-Enden zur Wahrung der Privatsphäre) und öffentlich bzw. — bei mit
Followern geteilten Inhalten — den Followern zugänglich zu machen. Bei einem
Streckenvorschlag, der freigegeben wird, umfasst dies auch die dauerhafte
Aufnahme in den kuratierten Streckenbestand. Das Recht endet mit der Löschung
des jeweiligen Inhalts, soweit dessen Entfernung technisch und im Hinblick auf
die Integrität der Plattform (z. B. Bestenlisten) möglich ist.

**10.3 Zusicherung.** Nutzende sichern zu, dass sie über die nötigen Rechte an
ihren Inhalten verfügen und dass diese keine Rechte Dritter verletzen —
insbesondere Urheber-, Persönlichkeits- und Markenrechte. Fotos, auf denen
Dritte erkennbar sind, dürfen nur mit deren Einwilligung veröffentlicht
werden.

**10.4 Unzulässige Inhalte.** Nicht zulässig sind insbesondere: rechtswidrige,
gewaltverherrlichende, diskriminierende, beleidigende oder pornografische
Inhalte, Werbung und Spam, falsche Angaben zu Strecken, manipulierte oder
nicht selbst gefahrene GPS-Aufzeichnungen sowie Inhalte, die zu Verstössen
gegen das Strassenverkehrsrecht anleiten oder solche verherrlichen.

**10.5 Moderationsvorbehalt.** Strado ist eine **kuratierte** Plattform.

- Streckenvorschläge werden vor der Veröffentlichung geprüft. Ein Anspruch auf
  Freigabe besteht nicht; die Ablehnung muss nicht begründet werden.
  Abgelehnte Vorschläge werden nach kurzer Zeit automatisch entfernt.
- Nutzende können Strecken, Bewertungen und Fahrten melden.
- Die Anbieterin darf gemeldete oder anderweitig auffällige Inhalte prüfen und
  bei Verstoss gegen Ziff. 10.4 **ohne Vorankündigung** bearbeiten, auf
  „nicht öffentlich" stellen oder löschen. Bei wiederholten oder schweren
  Verstössen kann sie zusätzlich das Konto sperren oder nach Ziff. 6.5
  fristlos kündigen.
- Eine Pflicht zur aktiven, lückenlosen Überwachung sämtlicher Inhalte
  besteht nicht.

**10.6 Bestenlisten.** Die Anbieterin darf Einträge aus Bestenlisten entfernen,
wenn begründete Zweifel an ihrer Echtheit bestehen oder wenn sie offenkundig
durch einen Verstoss gegen Verkehrsregeln zustande gekommen sind.

## 11. Pflichten der Nutzenden, insbesondere im Strassenverkehr

**11.1** Die Nutzung von Strado entbindet nicht von der Pflicht, sämtliche
Verkehrsregeln einzuhalten. **Massgebend sind stets die Signalisation vor Ort,
die tatsächlichen Strassen- und Witterungsverhältnisse und die
Strassenverkehrsgesetzgebung.**

**11.2** Die Bedienung des Geräts während der Fahrt ist untersagt, soweit sie
gesetzlich nicht erlaubt ist. Die Aufzeichnung einer Fahrt ist vor der Abfahrt
zu starten und nach dem Anhalten zu beenden.

**11.3 Kein Wettbewerb um Geschwindigkeit.** Strado ist **kein Wettbewerb um
Geschwindigkeit**. Die **plattformweiten** Bestenlisten beruhen ausschliesslich
auf Grössen, die nicht vom Tempo abhängen: Anzahl der Fahrten, gefahrene
Kilometer, Höhenmeter und Anzahl unterschiedlicher Strecken. Tempo verbessert
dort keine Platzierung.

Daneben führt Strado je Strecke eine **Bestzeitenliste**. Sie ist eine
Nebenwertung und kein Ziel der Plattform: Sie erfasst nur Fahrten, die die
Nutzenden selbst öffentlich gestellt haben, sie führt nur verifizierte Zeiten
(Ziff. 12.6), und sie fliesst in keine plattformweite Rangliste ein. Aus einer
Platzierung folgt **kein Vorteil auf Strado** — keine Funktion, kein
Premium-Bestandteil, keine Sichtbarkeit ausserhalb der betreffenden
Streckenseite. Die ersten drei Plätze werden dort mit einem Pokalsymbol
markiert; mehr als diese Markierung folgt aus ihnen nicht.

Eine Zeit entsteht bei jeder aufgezeichneten Fahrt. Was die Nutzenden
entscheiden, ist nicht die Messung, sondern die **Veröffentlichung**: Wer eine
Fahrt privat lässt oder nur mit Followern teilt, erscheint in keiner
Bestzeitenliste. Wer sie öffentlich
stellt, **kann** dort erscheinen — vorausgesetzt, es handelt sich um die Fahrt
einer freigegebenen, nicht privaten Strecke und die Zeit ist verifiziert
(Ziff. 12.6). Eine freie Fahrt ohne Strecke und eine Fahrt ohne verifizierte
Zeit erscheinen nie. Die Sichtbarkeit lässt sich jederzeit nachträglich
ändern.

Fahrten, die unter Missachtung von Verkehrsregeln zustande gekommen sind,
dürfen nicht veröffentlicht werden.

Der Live-Split nach Ziff. 3.5 ändert an diesem Grundsatz nichts: Er zeigt
während der Fahrt nur den Abstand zu bereits bestehenden Zeiten an und
begründet keine weitere Wertung.

**11.4** **Strado darf nicht in einer Weise genutzt werden, die andere
gefährdet.** Untersagt sind insbesondere das Verabreden oder Austragen von
Rennen, das Fahren im Pulk oder dichtes Auffahren zum Zweck einer gemeinsamen
Aufzeichnung sowie jedes Fahrverhalten, das darauf zielt, eine angezeigte oder
in einer Bestenliste geführte Zeit **unter Missachtung der Verkehrsregeln oder
unter Gefährdung anderer** zu unterbieten. Wer zwischen einer Aufzeichnung und
der Sicherheit anderer entscheiden muss, bricht die Aufzeichnung ab.

**11.5** Nutzende sind für die Verkehrstauglichkeit ihres Fahrzeugs, für
gültige Fahrberechtigungen und für den Versicherungsschutz selbst
verantwortlich.

**11.6** Untersagt sind ferner: automatisiertes Auslesen der Plattform
(Scraping), das Umgehen technischer Schutzmassnahmen, Zugriffsversuche auf
fremde Konten oder Daten sowie Handlungen, die den Betrieb beeinträchtigen
(z. B. Überlastungsversuche).

**11.7 Sperre.** Die Anbieterin kann ein Konto vorübergehend oder dauerhaft
sperren, wenn Nutzende schwerwiegend oder wiederholt gegen diese AGB verstossen
— insbesondere gegen Ziff. 10.4, Ziff. 11.1 bis 11.4 oder Ziff. 11.6 — oder
wenn konkrete Anhaltspunkte für eine Nutzung bestehen, die andere gefährdet.
Die Sperre wird mitgeteilt und begründet; Nutzende können ihr formlos
widersprechen. Bei einem laufenden Abo gilt zusätzlich Ziff. 6.5.

## 12. Verfügbarkeit und Genauigkeit

**12.1** Die Anbieterin bemüht sich um eine möglichst hohe Verfügbarkeit,
schuldet aber keine bestimmte Verfügbarkeit. Strado wird auf der
Infrastruktur von Drittanbietern betrieben; deren Störungen kann die
Anbieterin nicht ausschliessen.

**12.2** Wartungsarbeiten, Weiterentwicklungen und Störungen können zu
vorübergehenden Unterbrüchen führen. Bei einem länger andauernden Unterbruch,
der die Premium-Funktionen erheblich beeinträchtigt, wird das Entgelt für die
betroffene Zeit auf Anfrage anteilig gutgeschrieben.

**12.3** Einzelne Funktionen hängen von externen Diensten ab (Karten,
Wetterdaten, Höhenprofile, Verkehrsdaten). Fallen diese aus, kann die
betroffene Funktion vorübergehend fehlen, ohne dass darin ein Mangel des
Gesamtangebots liegt.

**12.4 Aufzeichnung und Messwerte.** Die Aufzeichnung einer Fahrt hängt vom
Gerät der Nutzenden, vom Betriebssystem und vom Satellitenempfang ab. Die
Anbieterin garantiert weder, dass eine Aufzeichnung zustande kommt oder
vollständig ist, noch dass die daraus abgeleiteten Werte — Zeit, Distanz,
Höhenmeter, Rundenerkennung und die Zuordnung zu einer Strecke — genau sind.
Empfangslücken (Tunnel, enge Täler, dichte Bebauung oder Bewaldung), eine
unterbrochene Aufzeichnung, ein gesperrter Bildschirm oder Energiesparfunktionen
des Geräts können Werte verfälschen oder eine Fahrt unbrauchbar machen.
**Zeiten in Bestenlisten sind keine geeichte Zeitmessung.** Aus einer
fehlenden, unvollständigen oder ungenauen Aufzeichnung entsteht kein Anspruch;
im Übrigen gilt Ziff. 13.

**12.5 Zurückweisung einer Aufzeichnung.** Die Anbieterin darf eine
Aufzeichnung beim Speichern zurückweisen, wenn deren Werte oder Bewegungsmuster
nicht von einer Fahrt mit einem Strassenfahrzeug stammen können — etwa bei
unrealistischer Durchschnittsgeschwindigkeit, unrealistischer Dauer oder zu
grossen Lücken zwischen zwei Messpunkten. Die Zurückweisung wird begründet
angezeigt; ein Anspruch auf Speicherung besteht in diesen Fällen nicht.

**12.6 Verifizierte Fahrten.** Eine Fahrt gilt als **verifiziert**, wenn ihre
Dauer nicht aus den Zeitstempeln des Geräts stammt, sondern aus
Positionsmeldungen, die während der Fahrt an den Server gesendet und dort mit
der Serveruhr gestempelt wurden, und wenn die zuletzt gemeldete Position zum
Ende der eingereichten Aufzeichnung passt. Nur verifizierte Fahrten werden mit
einer Zeit in einer Streckenbestenliste geführt.

**Verifiziert heisst nicht, dass die Anbieterin die Fahrt beobachtet oder
bestätigt hat.** Die gemeldeten Positionen stammen wie jede andere
GPS-Information vom Gerät der Nutzenden. Die Verifikation erschwert eine
Fälschung erheblich, schliesst sie aber nicht aus; Ziff. 12.4 und Ziff. 10.4
gelten unverändert.

Besteht während der Fahrt keine Verbindung, bleibt die Fahrt vollständig
erhalten — sie wird lediglich nicht verifiziert und erscheint dann ohne Zeit in
der Streckenbestenliste. Distanz, Höhenmeter und Streckenabdeckung sind davon
nicht betroffen. Ein Anspruch auf Verifikation besteht nicht.

## 13. Haftung

**13.1** Die Anbieterin haftet für Schäden, die sie oder ihre Hilfspersonen
absichtlich oder grobfahrlässig verursacht haben, sowie bei Körperverletzung
und Tod uneingeschränkt nach Gesetz. Diese Haftung kann nicht wegbedungen
werden.

**13.2** Im Übrigen ist die Haftung — insbesondere für leichte Fahrlässigkeit —
**ausgeschlossen**, soweit das Gesetz dies zulässt. Ausgeschlossen ist
namentlich die Haftung für entgangenen Gewinn, Datenverlust, mittelbare
Schäden und Folgeschäden.

**13.3** Die Anbieterin haftet insbesondere **nicht** für Schäden, die
entstehen, weil sich Nutzende auf Angaben zu Strecken, Tempolimits,
Strassenzustand, Saison, Wetter oder Verkehrslage verlassen haben (Ziff. 3.4)
oder weil sie ihre Fahrweise an der Anzeige des Live-Splits (Ziff. 3.5)
ausgerichtet haben, oder aus der Teilnahme am Strassenverkehr im
Zusammenhang mit einer über Strado gefundenen Strecke. Ziff. 13.1 bleibt
vorbehalten.

**13.4** Für Nutzerinhalte Dritter — insbesondere Bewertungen,
Streckenvorschläge und Fotos — übernimmt die Anbieterin keine Haftung. Sie
macht sich diese Inhalte nicht zu eigen.

**13.5** Nutzende stellen die Anbieterin von Ansprüchen Dritter frei, die
darauf beruhen, dass sie rechtswidrige Inhalte veröffentlicht oder diese AGB
schuldhaft verletzt haben. Dies umfasst angemessene Kosten der Rechtsverfolgung.

**13.6** Für Datenverlust haftet die Anbieterin nur, soweit Ziff. 13.1 dies
vorschreibt. Nutzenden wird empfohlen, wichtige Aufzeichnungen selbst zu
sichern (z. B. als GPX-Export).

## 14. Änderungen dieser AGB und der Preise

**14.1 AGB-Änderungen.** Die Anbieterin kann diese AGB ändern, wenn dies
aufgrund geänderter Rechtslage, geänderter Rechtsprechung, geänderter
technischer oder wirtschaftlicher Rahmenbedingungen oder aufgrund einer
Weiterentwicklung von Strado sachlich gerechtfertigt ist. Nutzende werden
mindestens **30 Tage** vor Inkrafttreten per E-Mail und in der App informiert.
Widersprechen sie nicht bis zum Inkrafttreten, gelten die neuen AGB als
angenommen; auf diese Folge wird in der Mitteilung ausdrücklich hingewiesen.
Bei Widerspruch endet der Vertrag zum Zeitpunkt des Inkrafttretens, bei einem
laufenden Abo spätestens auf das Ende der laufenden Abrechnungsperiode; bereits
bezahlte Entgelte für die Zeit danach werden anteilig zurückerstattet.

**14.2 Preisänderungen für bestehende Abos.** Preiserhöhungen für bestehende
Abos werden mindestens **60 Tage** im Voraus per E-Mail angekündigt. Nutzende
können das Abo in diesem Fall bis zum Wirksamwerden der Erhöhung auf diesen
Zeitpunkt kündigen. Frühere Gründerpreis-Abos nach Ziff. 4.3 bleiben von
Erhöhungen ausgenommen, solange das Abo ununterbrochen läuft.

> **Prüfpunkt für die anwaltliche Durchsicht:** Die Zustimmungsfiktion in
> Ziff. 14.1 ist in Konsumentenverträgen nicht unbegrenzt zulässig. Zu prüfen
> ist, ob sie in dieser Form haltbar ist oder ob für wesentliche Änderungen
> eine ausdrückliche Zustimmung eingeholt werden muss.

## 15. Datenschutz

Wie personenbezogene Daten bearbeitet werden — insbesondere GPS-Standortdaten,
Fotos und Zahlungsdaten —, ist in der Datenschutzerklärung unter
`https://strado.ch/legal/datenschutz` beschrieben. Sie ist nicht Bestandteil dieser
AGB, sondern eine Information nach dem Datenschutzgesetz.

## 16. Schlussbestimmungen

**16.1 Übertragung.** Nutzende dürfen ihre Rechte und Pflichten aus diesem
Vertrag nicht ohne Zustimmung der Anbieterin auf Dritte übertragen. Konten sind
nicht übertragbar.

**16.2 Teilnichtigkeit.** Sollte eine Bestimmung dieser AGB ganz oder teilweise
unwirksam sein, bleibt die Wirksamkeit der übrigen Bestimmungen unberührt. Die
unwirksame Bestimmung ist durch eine wirksame zu ersetzen, die dem
wirtschaftlichen Zweck am nächsten kommt.

**16.3 Anwendbares Recht.** Auf diesen Vertrag ist ausschliesslich
**schweizerisches Recht** anwendbar, unter Ausschluss der Kollisionsnormen und
des Übereinkommens der Vereinten Nationen über Verträge über den
internationalen Warenkauf (CISG). Zwingende Konsumentenschutzbestimmungen des
Staates, in dem die Nutzenden ihren gewöhnlichen Aufenthalt haben, bleiben
vorbehalten.

**16.4 Gerichtsstand.** Ausschliesslicher Gerichtsstand für alle
Streitigkeiten aus oder im Zusammenhang mit diesem Vertrag ist
**Zürich, Schweiz** — dies unter dem ausdrücklichen Vorbehalt
zwingender gesetzlicher Gerichtsstände. Konsumentinnen und Konsumenten können
insbesondere in jedem Fall am Gericht ihres Wohnsitzes oder am Sitz der
Anbieterin klagen; auf diesen Gerichtsstand können sie nicht im Voraus
verzichten.

---

## Verwendete Platzhalter

Keine mehr. Alle Platzhalter sind am 2026-09-07 durch die tatsächlichen
Werte ersetzt worden; eine Suche nach doppelten eckigen Klammern im gesamten
Dokument muss leer bleiben und ist Teil der Prüfung vor jeder weiteren
Änderung.

## Offene Punkte für die anwaltliche Prüfung

1. **Widerrufsrecht bei Nutzenden aus der EU/dem EWR** (Ziff. 7.4) — soll der
   Vertrieb auf die Schweiz beschränkt werden, oder braucht es eine
   Widerrufsbelehrung?
2. **Zustimmungsfiktion bei AGB-Änderungen** (Ziff. 14.1) — in dieser Form
   haltbar?
3. **Rückerstattung bei fristloser Kündigung durch die Anbieterin**
   (Ziff. 6.5) — die anteilige Rückerstattung ist eine geschäftliche
   Entscheidung, die bestätigt werden muss.
4. **Umgang mit bereits veröffentlichten Inhalten nach Kontolöschung**
   (Ziff. 9.6) — die Formulierung muss mit der Datenschutzerklärung und mit
   dem tatsächlichen Verhalten der Löschfunktion übereinstimmen.
5. **Gründerpreis-Bindung** (Ziff. 4.3) — der Gründerpreis wird seit dem
   2026-09-07 nicht mehr angeboten; die Preisbindung gilt nur noch für die
   davor abgeschlossenen Abos und bleibt für diese eine bindende Zusage über
   viele Jahre. Die Ausnahme in Ziff. 14.2 ist darauf abgestimmt; zu prüfen
   bleibt nur noch die Haltbarkeit der Zusage selbst.
6. ~~**Mengenbegrenzung privater Strecken** (Ziff. 3.2)~~ — erledigt
   2026-09-07: Das Erstellen eigener Strecken ist eine Premium-Funktion,
   Ziff. 3.2 und 9.1 sind entsprechend gefasst, der Bestandsschutz für davor
   ohne Abo angelegte Strecken steht in Ziff. 3.2.
7. **Bestenlisten und Raserartikel** (Ziff. 11.3, 11.4, 12.6) — neu mit dem
   Entwurf vom 2026-09-15. Ziff. 11.4 untersagte bisher *jedes* Verhalten,
   das auf das Unterbieten einer geführten Zeit zielt, und stellte damit auch
   das regelkonforme erneute Befahren einer Strecke unter die Kontosperre aus
   Ziff. 11.7 — ein Verbot des eigenen Produkts. Der Entwurf beschränkt es
   auf das Unterbieten unter Missachtung der Verkehrsregeln oder unter
   Gefährdung anderer. Zu prüfen ist, ob diese Abgrenzung gegenüber
   **Art. 90 Abs. 3 und 4 SVG** (Raserartikel) trägt, und ob die
   Kombination aus tempounabhängigen Ranglisten (Ziff. 11.3) und einer
   opt-in-Zeit je Fahrt die Plattform hinreichend vom Vorwurf distanziert,
   zu einem Geschwindigkeitsvergleich auf öffentlichen Strassen anzuleiten
   (vgl. Ziff. 10.4, letzter Halbsatz).
8. **Verifizierte Fahrten als Aussage gegenüber Nutzenden** (Ziff. 12.6) —
   ebenfalls neu. „Verifiziert" ist ein Vertrauensversprechen; Ziff. 12.6
   grenzt es ausdrücklich ab (die Positionen stammen weiterhin vom Gerät der
   Nutzenden, eine Fälschung wird erschwert, nicht ausgeschlossen). Zu
   prüfen ist, ob diese Abgrenzung gegen den Vorwurf der irreführenden
   Angabe nach **Art. 3 Abs. 1 lit. b UWG** ausreicht, wenn die Bezeichnung
   in der Oberfläche prominent verwendet wird.
9. **Live-Split** (Ziff. 3.5, 11.3, 13.3) — neu mit dem Entwurf vom
   2026-09-23. Der Sachverhalt ohne Beschönigung: Die Anzeige zeigt während
   der Fahrt laufend, wie weit die Nutzenden hinter oder vor einer Bestzeit
   liegen, und auf einer Strecke mit gleichen Tempolimits lässt sich ein
   Rückstand im Wesentlichen nur durch schnelleres Fahren aufholen. Zu
   prüfen ist, (a) ob die Funktion als Anreiz zu
   Geschwindigkeitsüberschreitungen oder als Anleitung zu einem
   Geschwindigkeitsvergleich auf öffentlichen Strassen im Sinne von
   **Art. 90 SVG** (einschliesslich Abs. 3 und 4) gewertet werden kann und
   ob die Einschränkungen in Ziff. 3.5.1 bis 3.5.4 daran etwas ändern;
   (b) ob Anzeige und haptisches Signal mit **Art. 31 SVG** (Beherrschung
   des Fahrzeugs) und **Art. 3 Abs. 1 VRV** (Aufmerksamkeit, keine
   Verrichtung, welche die Bedienung des Fahrzeugs erschwert) vereinbar
   sind und ob Ziff. 3.5.3 und 3.5.5 die Verantwortung tragfähig bei den
   Nutzenden belassen; (c) ob der Haftungsausschluss in Ziff. 13.3 in
   Konsumentenverträgen hält; (d) ob ein Vergleich nur gegen die eigene
   Bestzeit das Risiko wesentlich senken würde.
10. **Einladungsangebote** (Ziff. 4.5, 4.7) — neu mit dem Entwurf vom
    2026-09-23. Zu prüfen ist, ob die Abgrenzung zur Testphase und zum
    Satz „weitere kostenlose Testzeiträume werden nicht angeboten"
    transparent genug ist (Art. 8 UWG), und wie mit Konten umzugehen ist,
    die das Angebot vor dem Inkrafttreten dieser Fassung erhalten haben.
