# Die Schweizer Identität als USP — was die App dafür tun kann

Begleitdokument zum Rebranding Zürich → Schweiz (2026-09-16). Die
Marktlage steht in `konkurrenzanalyse-schweiz.md`; hier steht, **was in der
App und auf der Infoseite konkret passieren müsste**, damit „Schweizer App"
mehr ist als ein Wort im Untertitel.

Die Vorschläge sind sortiert nach Aufwand und nach Belegkraft, nicht nach
Begeisterung. Jeder nennt die Datei, in der er stattfände. Nichts davon ist
umgesetzt — dieser Rebrand hat Text, Metadaten und eine Kartenkonstante
angefasst, sonst nichts.

---

## 0. Die eine Regel vorweg: zeigen statt behaupten

„Schweizer App" ist als Satz wertlos — jede Konkurrenz-App kann ihn morgen
in ihren Store-Eintrag schreiben, und mehrere haben es getan. Was keine von
ihnen nachmacht, ist der **Beleg**: eine Höhenangabe von swisstopo, ein
amtliches Tempolimit, ein Gerichtsstand in Zürich, TWINT an der Kasse.

Die gute Nachricht: **die Belege existieren bereits im Code.** Sie werden
nur nirgends gezeigt. Der grösste Teil der Liste unten ist deshalb kein
Neubau, sondern Sichtbarmachen.

Die unbequeme Kehrseite derselben Regel: ein Beleg, der nicht stimmt,
kostet mehr als er einbringt. Abschnitt 4 sammelt die Stellen, an denen die
Schweiz-Erzählung heute nicht trägt — **die gehören gelesen, bevor der
erste Claim gesetzt wird.**

---

## 1. Sofort und billig: was schon da ist, aber niemand sieht

### 1.1 swisstopo namentlich nennen — der stärkste einzelne Beleg

`lib/elevation.ts` holt jedes Höhenprofil und jeden Höhenmeter einer Fahrt
vom **swissALTI3D-Dienst von swisstopo** (~2 m Auflösung, WGS84 → LV95
transformiert). Das ist das Bundesamt für Landestopografie. Keine
internationale App tut das — sie nehmen SRTM oder Mapbox-Terrain mit 30 m
Raster, und genau deshalb weichen ihre Höhenmeter an Pässen sichtbar ab.

Heute erfährt das niemand. Vorschlag: eine Quellenzeile unter dem
Höhenprofil (`components/ElevationProfile.tsx`) und in den Kennzahlen einer
Fahrt:

> Höhen: swisstopo swissALTI3D

Und — das ist der Teil, der Vertrauen schafft statt es nur zu behaupten —
**der Fallback wird ebenso benannt.** `lib/actions/completions.ts` fällt bei
Koordinaten ausserhalb der Schweiz oder bei einem Ausfall auf eine flache
Berechnung zurück. Dann muss dort „Höhen: geschätzt" stehen. Eine App, die
sagt, wann sie es *nicht* genau weiss, wird bei der Angabe geglaubt, wo sie
es weiss.

Aufwand: klein. Belegkraft: die höchste in dieser Liste.

### 1.2 Die amtlichen Tempolimits — vorhanden, getestet, ungenutzt

`amtlicherAnteilProzent()` in `lib/speed.ts` rechnet aus, welcher Anteil
einer Strecke gegen den amtlichen Datensatz „Signalisierte Geschwindigkeit"
(GDS 102) abgeglichen ist. Die Funktion hat einen Test
(`lib/speed.test.ts`) — und **keinen einzigen Aufrufer in `components/`
oder `app/`**. Sie wurde geschrieben und nie gezeigt.

Vorschlag: in der Tempolimit-Legende von `components/RouteDetailMap.tsx`
eine Zeile ergänzen, etwa „78 % amtlich abgeglichen (Kanton ZH, GDS 102)",
Rest aus OpenStreetMap. Zwei Dinge auf einmal: ein Qualitätsmerkmal, das
keine internationale App hat, und die ehrliche Auskunft, wo die Abdeckung
endet.

Achtung, direkt mit 4.2 zu lesen: der Datensatz ist **Kanton Zürich**. Ein
national ausgerichtetes Produkt, das genau eine Kantonsquelle hat, sollte
das beim Namen nennen, statt „amtlich" pauschal zu versprechen.

### 1.3 TWINT nach vorne holen

TWINT ist in der Zahlungsstrecke bereits aktiv (die CSP in `lib/csp.ts`
führt die Origins ausdrücklich, `app/profil/premium/abschluss/page.tsx`
nennt es „für ein Schweizer Produkt der wichtigste Weg"). Sichtbar wird es
aber erst *im* Stripe-Element, also nach der Kaufentscheidung.

Vorschlag: auf der Kaufseite (`components/PremiumPurchaseView.tsx`) neben
dem Preis „Bezahlen mit TWINT oder Karte · Preise in CHF, inkl. MWST-frei".
TWINT ist in der Schweiz ein Vertrauenssignal und international praktisch
unbekannt — es ist damit ein Beleg, den ein deutscher Wettbewerber nicht
kopiert, ohne einen Schweizer Zahlungsvertrag zu schliessen.

### 1.4 Schweizer Rechtschreibung als Hausregel festschreiben

Die UI schreibt durchgehend `ss` statt `ß` („Strasse", „muss",
„ausserhalb") — richtig, und es ist der Marker, den ein deutscher Leser
sofort sieht. Die Regel steht aber nirgends, und in Code-Kommentaren ist sie
bereits an acht Stellen gebrochen („Maß", „Größe", „Straße" in
`app/icon.tsx`, `components/ExploreSidebar.tsx`, `lib/stripeWebhook.ts` u. a.).

Vorschlag: eine Zeile in `AGENTS.md` unter „Product" — und, weil eine Regel
ohne Prüfung driftet, ein Test in `lib/` nach dem Muster der bestehenden:
kein `ß` in `app/`, `components/`, `lib/`. Ein einziges `ß` in einer
Fehlermeldung macht aus der Schweizer App eine deutsche mit Schweizer
Anstrich, und zwar für genau die Leserschaft, die es merkt.

### 1.5 Der Fusszeilen-Satz auf der Infoseite

`stradoinfo` trägt auf jeder Seite „Kuratierte Fahrstrecken für Auto &
Motorrad — gestartet in Zürich." Mit dem Rebrand ist das die falsche
Aussage an der richtigen Stelle. Vorschlag:

> Kuratierte Fahrstrecken für Auto & Motorrad — aus der Schweiz, für
> Schweizer Strassen.

Das ist zugleich die Stelle, an der ein **„Swiss made"-Anspruch** juristisch
am ehesten geprüft würde: Für Dienstleistungen verlangt Art. 49 MSchG Sitz
**und** tatsächliche Verwaltung in der Schweiz. Einzelunternehmen in Zürich,
Betrieb von dort — das ist erfüllt. Zur Bildmarke siehe 4.4.

---

## 2. Mittlerer Aufwand: Funktionen, die nur eine Schweizer App bauen kann

### 2.1 Passöffnungen — der stärkste Kandidat

`konkurrenzanalyse-schweiz.md` §6.4 stellt die Frage, warum die App auf dem
Telefon liegt, wenn gerade keine Fahrt ansteht. Für ein Schweizer Produkt
gibt es darauf eine Antwort, die ein internationales nicht geben kann:
**welche Pässe gerade offen sind.**

Das ist von Mitte Oktober bis Mitte Juni die meistgestellte Frage unter
Schweizer Töfffahrern, sie ist kalendergetrieben statt fahrtgetrieben, und
sie ist echtes Ortswissen. Die Kategorie `passstrasse` existiert bereits in
`KATEGORIEN` (`lib/constants.ts`).

Skizze: ein Status je Passstrecke (`offen` / `gesperrt` / `Wintersperre` mit
Datum), gepflegt über die bestehende Moderationsoberfläche — also **keine
neue Datenquelle und kein Vertrag**, sondern eine Spalte, ein
Moderationsfeld und ein Filterchip. Später gegen eine Quelle abgleichbar
(TCS ist bereits verlinkt, `components/RouteActionsMenu.tsx`).

Kosten ehrlich: Pflegeaufwand während der Saison. Ein falsch als „offen"
markierter Pass ist schlimmer als gar keine Angabe — deshalb gehört das
Datum der letzten Prüfung sichtbar dazu.

### 2.2 Der Kanton als geografische Einheit

Mit dem nationalen Zuschnitt fehlt der Karte ein grober Griff. Heute gibt es
ein Freitextsuchfeld (`lib/search.ts` sucht über Name, Region, Start, Ziel)
— das genügte für eine Region und genügt für 26 nicht.

Vorschlag: `route.region` auf Kantonskürzel normalisieren und als Filter
anbieten (Chips oder eine Karte der Schweiz, eingefärbt nach Anzahl
Strecken). Zwei Wirkungen: die Suche wird wieder bedienbar, **und** die
Schweiz wird als Form sichtbar statt nur als Wort — das ist der
SchweizMobil-Effekt, auf den §5 der Konkurrenzanalyse zielt.

Nebenwirkung, die man wollen muss: eine solche Karte zeigt auch die leeren
Kantone. Das ist kein Argument dagegen, sondern der Grund, sie erst zu
zeigen, wenn die Dichte es trägt — und in der Zwischenzeit die Erzählung zu
liefern („hier wird gerade aufgebaut, schlag deine Strecke vor"), die aus
einer Lücke eine Einladung macht.

### 2.3 Die Positionierung sprachlich besetzen

Aus §5 und Empfehlung 5 der Konkurrenzanalyse, hier nur wiederholt, weil es
nach dem Rebrand erst umsetzbar ist: **„Das kuratierte Streckennetz für
Motorisierte."** SchweizMobil existiert für Wandern, Velo und Mountainbike,
hat Millionen bewusster Nutzer und hört exakt dort auf, wo ein Motor
anfängt. Die Position ist institutionell frei, in der Schweiz sofort
verstanden — und aus einem einzelnen Kanton heraus war sie nicht zu
beanspruchen. Genau das ist der eigentliche Gewinn dieses Rebrands.

Nicht zu verwechseln mit einer Behauptung, offiziell zu sein. „Netz" ja,
„national" ja, Bundesverwaltungs-Anmutung nein (siehe 4.4).

---

## 3. Ausserhalb der App

- **Kanäle statt Funktionen.** Die Konkurrenzanalyse (Empfehlung 8) nennt
  Töffclubs (Swiss Moto, ~140 Clubs), Fahrschulen, Händler und
  Schweizer Moto-Medien (moto.ch, motortipps.ch). Das Creator-Link-System
  (`/c/<code>`, `lib/herkunft.ts`) ist dafür bereits gebaut und misst
  Registrierungen und Abos pro Kanal — der Rebrand macht diese Liste zum
  ersten Mal national adressierbar statt auf Zürcher Reichweite begrenzt.
- **Die Unterstützer-Erzählung ist jetzt erst tragfähig.** CHF 49/Jahr
  liegen über Kurviger und REVER bei kleinerem Funktionsumfang; die einzige
  ehrliche Begründung ist die lokale Herkunft (§6.5: „Das macht die
  Schweizer Identität zum Preisargument"). Die Kaufseite sollte das sagen —
  konkret, nicht als Pathos: wer die App baut, wo sie betrieben wird, unter
  welchem Recht.
- **Sprachen sind ein Vertriebsthema, nicht nur ein Feature.** Siehe 4.1.

---

## 4. Wo die Erzählung heute nicht trägt

Diese vier Punkte sind der Grund, warum dieses Dokument existiert. Sie
lassen sich lösen oder benennen — was nicht geht, ist sie zu übergehen und
trotzdem „Schweizer App" darüberzuschreiben.

### 4.1 Die App ist deutschsprachig, die Schweiz ist es nicht

`app/layout.tsx` setzt `lang="de"`, das Manifest `de-CH`, die Formatierung
ist fest auf `de-CH` verdrahtet (`lib/format.ts`, bewusst und gut
begründet). Rechtssprache ist Deutsch (AGB Ziff. 1.5). Damit ist Strado
heute eine **Deutschschweizer** App — rund zwei Drittel des Landes, und die
Romandie und das Tessin haben die Pässe, die den Unterschied machen
(Grand-Saint-Bernard, Susten von Süden, Nufenen, Gotthard-Tremola).

Das ist kein Grund, den nationalen Anspruch zurückzunehmen — The Tours
fährt fünf Sprachen, und niemand verlangt das als Eintrittspreis. Es ist ein
Grund, **es nicht zu verschweigen** und zwei billige Dinge trotzdem zu tun:

1. **Ortsnamen nicht eindeutschen.** `components/RouteMap.tsx` und
   `components/RoutePicker.tsx` rufen `map.setLanguage("de")`. Das ist für
   Strassenlabels sinnvoll, ersetzt bei Mapbox aber auch Ortsnamen durch
   deutsche Exonyme, wo es welche gibt — „Sitten" für Sion ist in der
   Schweiz veraltet bis befremdlich. Nachsehen, wie die Karte westlich von
   Fribourg und südlich des Gotthards tatsächlich aussieht, bevor eine
   Romandie-Strecke aufgenommen wird. Die Karte ist das erste, was ein
   welscher Nutzer sieht.
2. **Streckennamen in der Ortssprache lassen.** Der Name ist die Einheit der
   Wiedererkennung (AGENTS.md, „Product"); „Col du Pillon" ist der Name,
   unter dem jemand die Strasse kennt, und übersetzt erkennt ihn niemand.

Eine französische Oberfläche ist mittelfristig der Preis für „national".
Bis dahin ist die ehrliche Formulierung „aus der Schweiz" — nicht „für die
ganze Schweiz in Ihrer Sprache".

### 4.2 Das Amtliche ist zürcherisch

Siehe 1.2: Der Tempolimit-Abgleich hängt an einem Datensatz des Kantons
Zürich. Nach dem Rebrand ist das eine Abdeckungslücke in 25 von 26
Kantonen. Zwei gangbare Wege, beide vertretbar:

- Den Anteil anzeigen und die Quelle benennen (1.2) — ehrlich, sofort, und
  ein Grund, die Abdeckung auszubauen.
- Weitere Kantone anschliessen, wo offene Daten existieren. Das ist Arbeit
  pro Kanton (`scripts/enrich-zh-tempolimits.mjs` ist die Vorlage), skaliert
  nicht von selbst, und gehört priorisiert nach Passdichte, nicht nach
  Einwohnerzahl.

Was nicht geht: „amtliche Tempolimits" als nationales Merkmal bewerben.

### 4.3 Die Daten liegen nicht in der Schweiz

Supabase betreibt das Projekt in **eu-central-1 (Frankfurt)**, Vercel und
Stripe sind US-Anbieter mit EU-Verarbeitung. Wer „Schweizer App" sagt,
bekommt früher oder später die Frage nach dem Serverstandort — und in
dieser Zielgruppe nicht selten.

Die Antwort gehört vorbereitet, nicht improvisiert, und sie ist gut genug,
solange sie zutrifft: Schweizer Anbieterin, Schweizer Recht, Gerichtsstand
Zürich (AGB Ziff. 16.4), Verarbeitung in der EU unter DSG und DSGVO, kein
Verkauf von Daten. Vorher zu prüfen: dass `docs/rechtstexte/datenschutz.md`
und die veröffentlichte Fassung den Standort tatsächlich so benennen — eine
Marketingaussage, die der Datenschutzerklärung widerspricht, ist teurer als
gar keine.

Ein Umzug in ein Schweizer Rechenzentrum (Exoscale, Infomaniak) wäre der
harte Beleg. Supabase bietet keine Schweizer Region an; das ist damit kein
Konfigurationsschalter, sondern ein Plattformwechsel — hier nur der
Vollständigkeit halber genannt, nicht empfohlen.

### 4.4 Schweizerkreuz: erlaubt, Wappen: nicht

Falls die Marke ein Kreuz aufnehmen soll (naheliegend, sobald „Schweizer
App" die Erzählung trägt), gilt seit der Swissness-Vorlage 2017:

- Das **Schweizerkreuz** darf für Dienstleistungen verwendet werden, wenn
  die Voraussetzungen von Art. 49 MSchG erfüllt sind — Sitz und
  tatsächliche Verwaltung in der Schweiz. Für Strado trifft das zu.
- Das **Schweizerwappen** (Kreuz im Wappenschild) bleibt dem Bund
  vorbehalten. Ein Schild darunter macht aus dem zulässigen Zeichen ein
  unzulässiges.
- Eine Anmutung amtlicher Herkunft ist auch ohne Wappen heikel: „offiziell",
  „Bundes-", eine SchweizMobil-nahe Gestaltung. Die Position aus 2.3 ist
  sprachlich zu besetzen, nicht grafisch zu imitieren.

Gestalterisch ist ausserdem einzuwenden: Das Signet ist seit 2026-09-14 das
flachgedrückte „o" als geschlossener Rundkurs, und `AGENTS.md` hält fest,
was zweimal danebengegangen ist, als die Marke eine zweite Bedeutung tragen
sollte. Ein Kreuz im Signet wäre der dritte Versuch derselben Art. Die
Schweizer Herkunft gehört eher in den Satz darunter als in die Marke.

---

### 4.5 Die Karte ist fast leer, und das ist der grösste Einwand

Ein Review zu PR #259 hat am 2026-09-16 in der Produktionsdatenbank
gezählt: **neun freigegebene öffentliche Strecken**, davon sieben im Raum
Zürich, je eine in Graubünden und Zug. (`AGENTS.md` nennt an anderer Stelle
dreizehn, gemessen am 2026-09-14 — wer die Zahl braucht, zählt sie selbst
nach, statt eine der beiden zu zitieren.)

Neun Strecken auf sechsundzwanzig Kantone sind genau die halbleere
Landkarte, vor der der alte Zürich-Abschnitt gewarnt hat. Daran ändert kein
Wort in diesem Dokument etwas: **die Schweizer Identität ist eine
Positionierung, kein Ersatz für Strecken.** Alles unter Abschnitt 1 und 2
macht die vorhandenen Strecken glaubwürdiger; keiner dieser Punkte macht sie
zahlreicher.

Zwei Folgerungen, die ernst gemeint sind:

- **Erst die Dichte, dann die Landkarte.** Der Kantonsfilter aus 2.2 und
  jede Darstellung, die die Schweiz als Fläche zeigt, zeigen zugleich die
  Lücken. Sie gehören dahinter, nicht davor — die Reihenfolge in Abschnitt 6
  ist genau deshalb so sortiert.
- **Der Weiterleitungstest bleibt die Schranke.** Die Versuchung nach einem
  nationalen Rebrand ist, die Karte mit Agglomerationsrunden aus weiteren
  Kantonen zu füllen. Das erzeugt Punkte, keine Dichte, und die
  Konkurrenzanalyse (§6.3) hat den Fehler schon einmal am Zürcher Bestand
  gezeigt.

## 5. Die AGB hängen noch nach

`docs/rechtstexte/agb.md` Ziff. 1.3 lautet weiterhin:

> Strado ist eine kuratierte Plattform für Auto- und Motorradstrecken mit
> Schwerpunkt Schweiz, vorerst Raum Zürich.

Vorgeschlagene Fassung:

> Strado ist eine kuratierte Plattform für Auto- und Motorradstrecken in der
> Schweiz.

**Bewusst nicht in diesem Rebrand geändert.** Eine AGB-Änderung verlangt
nach Ziff. 14.1 dreissig Tage Vorlauf per E-Mail und in der App. Es liegt
bereits ein unveröffentlichter Entwurf vor (die Umformulierung von
Ziff. 11.4 und die neue Ziff. 12.6 zur verifizierten Fahrt, siehe
`AGENTS.md`), der auf dieselbe Mitteilung wartet. Beide gehören in **eine**
Mitteilung — zwei Ankündigungen in kurzem Abstand kosten doppelt Vertrauen
und bringen nichts.

Unberührt bleiben Anbieteradresse, Impressum und Gerichtsstand: die nennen
Zürich als **Sitz der Anbieterin**, nicht als Einzugsgebiet, und sind vom
Rebrand nicht betroffen.

---

## 6. Reihenfolge, wenn nur wenig Zeit ist

1. **1.1 swisstopo benennen** — grösste Belegkraft pro Aufwand, und sie
   wirkt auf jeder Streckenseite und jeder Fahrt.
2. **1.3 TWINT auf der Kaufseite** — wirkt genau dort, wo Vertrauen zu Geld
   wird.
3. **1.2 amtlicher Anteil anzeigen** — Code ist geschrieben und getestet,
   es fehlt die Zeile in der Legende.
4. **4.1 Kartensprache nachsehen**, bevor die erste welsche Strecke kommt.
5. **2.2 Kantonsfilter**, sobald mehr als etwa 25 Strecken drin sind —
   vorher ist die Liste kurz genug.
6. **2.1 Passöffnungen** als erstes grösseres Vorhaben nach dem Rebrand.
