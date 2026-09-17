# Was Premium jetzt ist — die vier neuen Funktionen

Begleitdokument zum Premium-Ausbau vom 17. September 2026. Es beschreibt, was
gebaut wurde, warum diese vier und nicht andere, und wo die Grenze zwischen
gratis und bezahlt liegt. Der Plan davor steht in
`docs/premium-naechste-features.md` (Auswahl) und
`docs/premium-ausbau-plan.md` (Umsetzungsregeln); beide gelten weiter, wo sie
nicht hier korrigiert werden.

## Der Massstab

Aus `docs/premium-naechste-features.md`, unverändert richtig: **die stärksten
Premium-Funktionen sind die, die im Winter Wert haben.** Nicht die, die beim
Fahren helfen. Ein Abo, dessen Nutzen ausschliesslich zwischen April und
Oktober entsteht, wird im November gekündigt — und der Saisonpass
(`docs/premium-neu/preise.md`) ist die Preisantwort darauf, diese vier
Funktionen sind die inhaltliche.

Dazu die Regel, die keine dieser Funktionen brechen durfte:

- **Additives Gating** (`docs/premium-plan.md` §4): Premium hebt Grenzen an
  und legt Neues obendrauf. Was ein kostenloses Konto heute kann, kann es
  danach weiterhin.
- **Nicht hinter die Schranke gehören** Sicherheit, Privatsphäre,
  Bestenlisten, öffentliche Streckenvorschläge — und alles, was zum
  Schnellerfahren anstösst (AGB Ziff. 11.3/11.4). Keine der vier zeigt
  Zeiten oder Tempo.
- **Ein Ort je Funktion, und dieser Ort existiert schon**
  (`docs/premium-ausbau-plan.md` §1). `BottomNav` ist unverändert, die
  Startseite hat nichts dazubekommen, es gibt kein neues visuelles Muster.
  Der Hinweis für Konten ohne Abo ist überall derselbe:
  `components/PremiumHinweis.tsx`.

---

## 1. Wetterfenster — "an welchen Tagen ist die Strecke trocken?"

**Was:** Eine Einschätzung der nächsten sieben Tage je Strecke — pro Tag eine
Stufe (`gut` / `möglich` / `schlecht`) mit dem Grund in zwei Worten
("trocken, 18°", "Schauer möglich", "Glätte möglich", "Sturmböen"). Dazu im
Profil eine Zeile je Favorit: die besten Tage dieser Woche.

**Wo:** direkt unter der bestehenden Wetterzeile auf der Streckenseite; im
Profil innerhalb des bestehenden `<details>` "Favoriten".

**Grenze:** Das aktuelle Wetter am Start bleibt für alle sichtbar, wie bisher.
Premium ist die Vorhersage.

**Wie es rechnet:** `lib/wetterfenster.ts` (rein, 36 Tests). Trocken ist
≤ 0.5 mm bei unter 30 % Regenwahrscheinlichkeit; ab 2 mm mit ≥ 50 % oder ab
5 mm ist es Regen. Nachtminimum ≤ 0 °C ergibt "Glätte möglich", Böen ab
60 km/h eine Warnung, Maximum unter 7 °C eine Warnung für Motorräder.
Mehrere Warnungen an einem Tag: die schlechteste gewinnt. **Fehlen Daten,
gibt es keine Stufe** statt einer guten — eine Prognose, die im Zweifel
"passt schon" sagt, schickt jemanden in den Regen.

Zwei Eigenheiten, die bewusst so sind: die Vorhersage berücksichtigt den
**höchsten Punkt** der Strecke, wenn er deutlich über dem Start liegt (auf
einem Pass ist das Wetter oben das, was zählt — Open-Meteo rechnet die
Temperatur auf die übergebene Höhe), und der Massstab ist **strenger für
Motorräder**; welcher gilt, entscheidet die Garage und steht in der Zeile
darunter.

**Kosten:** Open-Meteo, kein Schlüssel, eine Abfrage je Strecke pro Stunde
(serverseitiger Cache, geteilt über alle Nutzenden). Offen und **vor dem
Livegang zu klären**: Open-Meteos Gratisnutzung ist für nichtkommerzielle
Zwecke gedacht. Die Funktion hängt an einem bezahlten Abo, was die Frage nach
der kommerziellen Lizenz (rund CHF 27/Monat, `docs/premium-plan.md` §5.4)
schärfer stellt als die bisherige Wetterzeile. Kein Code-Problem, ein
Launch-Punkt.

## 2. Pass-Alarm — "sobald der Klausen offen ist"

**Was:** Ein Status je Passstrasse (`offen` / `gesperrt` / `Wintersperre`, mit
voraussichtlicher Öffnung, Hinweis, Quelle und **Prüfdatum**), gepflegt von
der Moderation. Wer Premium hat, kann einen Alarm setzen; beim Wechsel auf
"offen" erscheint die Meldung in `/aktivitaet` und im Zähler der Kopfleiste.

**Wo:** Statuszeile unter dem Streckentitel; Schalter auf derselben Seite;
Pflege im bestehenden Moderationsbereich.

**Grenze — und sie ist die wichtigste dieses Ausbaus:** Der **Status ist für
alle kostenlos**, auch ohne Konto. Er ist sicherheitsrelevant, und
`docs/premium-naechste-features.md` sagt zu Recht, dass Schutz nicht verkauft
wird. Bezahlt ist ausschliesslich die **Benachrichtigung**.

**Ehrlichkeit über die Daten:** Das Prüfdatum steht immer dabei, und nach
sieben Tagen wird es als "nicht mehr aktuell" markiert. Ein falsch als "offen"
gemeldeter Pass ist schlimmer als keine Angabe
(`docs/markt/schweizer-identitaet.md` §2.1).

**Datenquelle.** Die amtliche Auskunft ist das **TCS-Passportal**
(`TCS_PASS_PORTAL_URL` in `lib/constants.ts`, vom Eigentümer am 2026-09-17 als
offizielle Quelle benannt): 77 Pässe mit Status, Temperatur, dem Zeitraum der
Wintersperre und einem Zeitstempel. Die Moderationsmaske verlinkt sie direkt
neben dem Feld "Quelle" und trägt "TCS" als Vorgabe ein — gepflegt wird also
**von Hand, aber gegen die richtige Quelle**.

Ein automatischer Abgleich ist die naheliegende Folgearbeit und bewusst nicht
Teil dieses PRs:

- Die Seite lädt ihre Daten über ein eingebettetes Widget nach; es braucht
  erst die Feststellung, über welchen Endpunkt sie kommen und ob er stabil
  ist.
- Die Seite nennt **keine Nutzungsbedingungen für die Weiterverwendung**. Ob
  ein automatischer Abgleich zulässig ist, ist zu klären, bevor er läuft —
  nicht danach. Ein Anruf beim TCS ist der kürzere Weg als jede
  Rechtsauslegung.
- Namensabgleich: TCS führt Passnamen, Strado führt Strecken. Die Zuordnung
  braucht eine Spalte (etwa `routes.pass_name`) oder eine Zuordnungstabelle;
  geraten wird sie nicht.

Bis dahin gilt: was ungeprüft nicht weiterverwendet werden darf, wird auch
nicht abgeschrieben. Der Status bleibt Handarbeit, und das Prüfdatum sagt
genau, wie alt sie ist.

**Kein Push, keine E-Mail.** `public/sw.js` hat keinen Push-Handler, und es
gibt keine Mailinfrastruktur. Die Meldung erreicht die Person beim nächsten
Öffnen der App. Echter Web-Push (VAPID, Abo-Tabelle, Einwilligung,
Datenschutztext) ist ein eigenes Vorhaben — und der einzige Punkt, an dem
diese Funktion heute hinter ihrem Versprechen zurückbleibt: "sobald" heisst
in der App, nicht auf dem Sperrbildschirm.

## 3. Pass-Sammlung und Saisonrückblick — "deine Schweiz, Pass für Pass"

**Was:** Welche Passstrassen dieses Konto schon gefahren hat, mit dem Datum
der ersten Fahrt und der Scheitelhöhe, und daneben die, die noch fehlen. Dazu
einmal im Jahr "Meine Saison" als Bild für Feed (1080 × 1350) und Story
(1080 × 1920).

**Wo:** eigenes `<details>` im Kennzahlenblock des Profils, direkt nach der
bestehenden Auswertung.

**Grenze:** Ohne Abo steht dort die **Zahl** ("3 von 12 Pässen gefahren") plus
der Hinweis. Die Zahl ist der Teaser, nicht die Sperre — wer sie sieht, sieht
etwas Wahres über sich selbst.

**Warum es zieht:** Es ist die einzige der vier Funktionen, die mit der Zeit
wertvoller wird und im Dezember ihren besten Monat hat — und der Rückblick ist
zugleich das am besten teilbare Objekt, das die App erzeugen kann. Ortsnamen
stehen vorn, Kennzahlen hinten (AGENTS.md: der Ortsname ist die Einheit der
Wiedererkennung), und **keine Zeiten, kein Tempo** (AGB Ziff. 11.3). Die
Wortmarke bleibt auf jeder Variante; ein "Bild ohne Branding" wäre die
Funktion, die man sich selbst wegverkauft.

**Bekannte Unschärfe, Produktentscheid offen:** Die bestehende Profilkachel
"Pässe befahren" zählt *jede* gefahrene Strecke, nicht nur Passstrassen. Sie
kann also höher stehen als "3 von 12". Empfehlung aus der Umsetzung: die
Kachel in einem eigenen PR umbenennen ("Strecken befahren"), statt ihre
Bedeutung zu ändern — an ihr hängen Auszeichnungen und das Abzeichen auf
geteilten Bildern.

## 4. Wartungsheft mit MFK- und Service-Erinnerung

**Was:** Je Fahrzeug ein Wartungsheft (Service, Pneuwechsel, MFK, Bremsen,
Batterie, Kette, Sonstiges — mit Datum, Kilometerstand, Kosten, Notiz) und
Erinnerungen: nächste MFK als Datum, Serviceintervall in Kilometern und/oder
Monaten. Status `ok` / `bald` / `fällig` / `überfällig`.

**Wo:** neue Fahrzeug-Detailseite, erreichbar über die bestehende
Fahrzeugkachel. Im Profil erscheint eine Zeile nur dann, wenn etwas ansteht.

**Grenze:** Anlegen und Ändern ist Premium (RLS **und** Server Action).
**Lesen und Löschen bleiben immer erlaubt** — auch nachdem ein Abo ausgelaufen
ist. Die Einträge sind die Daten der Person, nicht unsere Geisel, und die
Oberfläche sagt das auch.

**Die Zahl, die Strado ehrlich nennen kann:** Der Kilometerstand ist eine
**Untergrenze** — er ist der letzte eingetragene Stand plus die seither
aufgezeichneten Fahrten mit diesem Fahrzeug. Nicht jede Fahrt wird
aufgezeichnet, also steht in der Oberfläche "mindestens" und "Service in
höchstens X km". Eine Fälligkeit kann dadurch zu spät gemeldet werden, nie zu
früh — die Richtung, in der ein Fehler harmlos ist.

**Warum es zu diesem Publikum passt:** Die MFK ist ein schweizerischer
Termin, den ein internationales Produkt nicht kennt, und das Heft ist im
Winter nützlich, wenn niemand fährt. Es ist ausserdem privat: nichts davon
erscheint im öffentlichen Profil, in keiner Liste, in keiner Fahrt.

---

## Was bewusst nicht gebaut wurde

- **Push-Benachrichtigungen** (keine Infrastruktur, eigenes Vorhaben mit
  Einwilligung und Rechtstext).
- **Erweiterte Filter.** `components/AdvancedFiltersPanel.tsx` liegt gebaut im
  Repo und wird nicht gerendert — bei 25 Strecken filtert niemand. Der Plan
  dafür gilt weiter (`docs/premium-ausbau-plan.md` §6), sobald der Bestand
  dreistellig ist.
- **GPX-Import, Sammlungen** aus `docs/premium-ausbau-plan.md` §3/§5. Nicht
  verworfen, nur nicht in diesem Zug.
- **Ein Abzeichen neben dem Namen.** Zweimal gebaut, zweimal entfernt (siehe
  AGENTS.md). Vor einem dritten Versuch gehört entschieden, wie es aussehen
  soll — die Marke als Statuszeichen war das Problem, nicht die Technik.
- **Eine Benachrichtigung "jemand hat deine Zeit unterboten".** Von den
  eigenen AGB untersagt (Ziff. 11.4), und zu Recht.

## Offene Punkte, die keine Codearbeit sind

1. **Open-Meteo-Lizenz** für die kommerzielle Nutzung (Abschnitt 1).
2. **TCS-Abgleich**: Zulässigkeit und Endpunkt klären (Abschnitt 2).
3. **Streckenbestand.** Alle vier Funktionen skalieren mit Strecken, nicht mit
   Code: eine Pass-Sammlung über eine einzige Passstrasse ist kein Erlebnis,
   und ein Pass-Alarm braucht Pässe. Das ist die eigentliche Arbeit nach
   diesem PR.
4. **Die Kachel "Pässe befahren"** (Abschnitt 3).
