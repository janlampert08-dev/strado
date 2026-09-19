# Was Premium jetzt ist — die neuen Funktionen

Begleitdokument zum Premium-Ausbau vom 17. September 2026. Es beschreibt, was
gebaut wurde, warum diese und nicht andere, und wo die Grenze zwischen gratis
und bezahlt liegt. Vier waren ausgewählt, **drei sind es geworden** — warum
der Pass-Alarm herausfiel, steht in Abschnitt 2. Der Plan davor steht in
`docs/premium-naechste-features.md` (Auswahl) und
`docs/premium-ausbau-plan.md` (Umsetzungsregeln); beide gelten weiter, wo sie
nicht hier korrigiert werden.

## Der Massstab

Aus `docs/premium-naechste-features.md`, unverändert richtig: **die stärksten
Premium-Funktionen sind die, die im Winter Wert haben.** Nicht die, die beim
Fahren helfen. Ein Abo, dessen Nutzen ausschliesslich zwischen April und
Oktober entsteht, wird im November gekündigt — und der Saisonpass
(`docs/premium-neu/preise.md`) ist die Preisantwort darauf, diese Funktionen
sind die inhaltliche.

Dazu die Regel, die keine dieser Funktionen brechen durfte:

- **Additives Gating** (`docs/premium-plan.md` §4): Premium hebt Grenzen an
  und legt Neues obendrauf. Was ein kostenloses Konto heute kann, kann es
  danach weiterhin.
- **Nicht hinter die Schranke gehören** Sicherheit, Privatsphäre,
  Bestenlisten, öffentliche Streckenvorschläge — und alles, was zum
  Schnellerfahren anstösst (AGB Ziff. 11.3/11.4). Keine davon zeigt Zeiten
  oder Tempo.
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

## 2. Pass-Alarm — gebaut und wieder zurückgezogen

Diese Funktion stand in der Auswahl, ist gebaut worden und ist **nicht Teil
des Ausbaus**. Der Grund ist nicht Zweifel am Nutzen, sondern eine Kollision,
die während der Arbeit entstand: am 17. September 2026 ist aus einem
parallelen Zweig ein vollständiges Pass-System in die Produktion gegangen —
`paesse` führt den Pass als eigenes Objekt (Höhe, Kantone, Scheitelpunkt,
Monate der Wintersperre), dazu `pass_status`, `pass_ereignisse`,
`pass_sperrtage`, `pass_folgen` (die Abos) und `strecken_paesse`. Die
Aktivitätsliste, der Zähler in der Kopfleiste und die Kontolöschung sind dort
bereits erweitert.

Unsere Fassung hätte eine gleichnamige Tabelle mit anderem Schlüssel angelegt
(`route_id` statt `pass_id`) und beim Ersetzen zweier Funktionen den
Pass-Anteil des anderen Zweigs aus dem Abzeichen entfernt. Zwei Systeme für
dieselbe Frage — "ist der Pass offen?" — wären ausserdem zwei Wahrheiten
gewesen, und die schlechtere hätten wir gebaut: unsere kannte nur Strecken,
nicht Pässe.

Entscheid des Eigentümers am 18. September 2026: **das Live-System gilt.**
Migration und Code sind aus dem Zweig entfernt (`supabase/migrations/README.md`
unter 0112 hält fest, was daran zu lernen war). Was bleibt: die TCS-Adresse in
`lib/constants.ts` als Quelle für die Statuspflege.

**Was das für Premium heisst:** Der Ausbau bringt drei Funktionen statt vier.
Ob ein Pass-Abo bezahlt oder kostenlos sein soll, entscheidet jetzt der
Zweig, der es gebaut hat — und die Regel dieses Dokuments gilt dort genauso:
der **Status** ist sicherheitsrelevant und gehört nicht hinter eine Schranke,
die **Meldung** wäre die verkaufbare Leistung.

**Die Datenquelle bleibt offen, und sie ist dieselbe:** Das TCS-Passportal
(`TCS_PASS_PORTAL_URL`, vom Eigentümer am 17. September 2026 als offizielle
Quelle benannt) führt 77 Pässe mit Status, Temperatur, Wintersperre und
Zeitstempel. Ein automatischer Abgleich ist nicht gebaut — die Seite lädt
ihre Daten über ein eingebettetes Widget nach und nennt keine
Nutzungsbedingungen für die Weiterverwendung. Das ist vor dem Bauen zu
klären, nicht danach; ein Anruf beim TCS ist der kürzere Weg als jede
Rechtsauslegung.

## 3. Pass-Sammlung und Saisonrückblick — "deine Schweiz, Pass für Pass"

**Was:** Welche Pässe aus dem Passkatalog (`paesse`, 0104) dieses Konto
schon gefahren hat, mit dem Datum der ersten Fahrt, der Anzahl und der
Scheitelhöhe, und daneben die, die noch fehlen. Dazu einmal im Jahr "Meine
Saison" als Bild für Feed (1080 × 1350) und Story (1080 × 1920).

**Eine Quelle (seit 2026-09-18).** Gebaut war die Sammlung zuerst auf
Strecken der Kategorie "passstrasse" und nur auf Streckenfahrten. Parallel
ging das Pass-System mit einer eigenen, freien Passsammlung live (Zeile
"Passsammlung X von Y" auf dem Profil, /paesse). Zwei verschiedene Zahlen
unter derselben Überschrift — Entscheid des Inhabers: die Premium-Sammlung
liest denselben Katalog und zählt über `meine_passfahrten()` (0113), also
über den Track, einschliesslich freier Fahrten.

**Wo:** eigenes `<details>` im Kennzahlenblock des Profils, direkt nach der
bestehenden Auswertung.

**Grenze:** Die **Zahl** gehört allen — sie steht für jedes Konto in der
Zeile "Passsammlung" und auf /paesse. Ohne Abo steht an der Stelle der
Sammlung nur der Hinweis; mit Abo die Liste Pass für Pass und der
Saisonrückblick.

**Warum es zieht:** Es ist die einzige der drei Funktionen, die mit der Zeit
wertvoller wird und im Dezember ihren besten Monat hat — und der Rückblick ist
zugleich das am besten teilbare Objekt, das die App erzeugen kann. Ortsnamen
stehen vorn, Kennzahlen hinten (AGENTS.md: der Ortsname ist die Einheit der
Wiedererkennung), und **keine Zeiten, kein Tempo** (AGB Ziff. 11.3). Die
Wortmarke bleibt auf jeder Variante; ein "Bild ohne Branding" wäre die
Funktion, die man sich selbst wegverkauft.

**Entschieden am 2026-09-19:** Die Profilkachel "Pässe befahren" zählte bis
dahin jede gefahrene Strecke. Entscheid des Inhabers: sie zählt Passhöhen.
Eigenes Profil, Auszeichnungen und Teilen-Abzeichen lesen `meine_paesse()`,
das öffentliche Profil `oeffentliche_passhoehen()` (0114, nur öffentlich
geteilte Fahrten, nur mit `zeigt_paesse`). Die eigene Zeile "Passsammlung"
ist in der Kachel aufgegangen — eine Pass-Zahl auf dem Profil, nicht zwei.
Die Rechtstexte ("Anzahl Pässe") stimmen damit wörtlich.

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
2. **TCS-Abgleich**: Zulässigkeit und Endpunkt klären (Abschnitt 2) — die
   Frage bleibt offen, auch ohne unseren Pass-Alarm.
3. **Streckenbestand.** Alle drei Funktionen skalieren mit Strecken, nicht mit
   Code: eine Pass-Sammlung über eine einzige Passstrasse ist kein Erlebnis,
   und ein Pass-Alarm braucht Pässe. Das ist die eigentliche Arbeit nach
   diesem PR.
4. **Die Kachel "Pässe befahren"** (Abschnitt 3).
