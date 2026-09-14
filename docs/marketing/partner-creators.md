# Partner-Creators Schweiz — Recherche und Modellentwurf

Recherche vom 2026-09-14. Anlass: die Idee, Creator dauerhaft zu beteiligen —
sie bewerben die App, kuratieren Strecken für ihre Community und erhalten
**25 % pro abgeschlossenem Abo**.

Dieses Dokument ist nicht dasselbe wie
`docs/marketing/instagram-kanaele-outreach.md`. Das dort beschriebene Modell
ist die **kostenlose Ansprache** auf Instagram: ein Tausch, bei dem niemand
zahlt. Hier geht es um eine **Beteiligung am Umsatz**, und das verschiebt drei
Dinge:

- Man darf grössere Kanäle fragen. Wer ein Mediakit hat, lehnt eine Bitte ab,
  aber nicht unbedingt eine Beteiligung.
- Das Format ist ein anderes. POV-Fahrten leben auf **YouTube und TikTok**,
  nicht auf Instagram — dort liegt der Schwerpunkt des anderen Dokuments.
- Es entsteht ein Vertragsverhältnis mit Buchhaltung, Werbekennzeichnung und
  Datenschutzfragen. Eine Gratis-Anfrage hat das alles nicht.

Die Zahlen unten sind **an der Plattform selbst geprüft**, nicht aus
Suchergebnis-Snippets. Wie, steht unter [Methode](#methode-und-was-sie-nicht-kann);
das Werkzeug liegt als `docs/marketing/creator-check.sh` daneben.

---

## Zuerst der Befund: das Modell ist heute nicht abrechenbar

Drei Lücken, alle im Code nachgeprüft. Keine davon ist ein Grund, die Idee zu
verwerfen — aber jede muss geschlossen sein, **bevor** einem Creator 25 %
zugesagt werden, denn eine Zusage ohne Messung lässt sich nicht einhalten.

**1. Es gibt keine Zuordnung vom Klick bis zum Abo.**
`/c/<code>` ist gebaut (Phase 1 aus `docs/creator-links-plan.md`) und zählt
Aufrufe im Vercel-Dashboard. Die Herkunft bis zur Registrierung
durchzureichen ist **Phase 2 und nicht umgesetzt** — das sagt der Kopf von
`supabase/migrations/0084_creator_links.sql` ausdrücklich: „Was hier NICHT
passiert: die Herkunft bis zur Registrierung durchreichen." Damit ist
„25 % pro Abo" derzeit nicht ungenau, sondern **gar nicht** ermittelbar. Es
lässt sich heute nicht einmal rückwirkend rekonstruieren: was nicht erfasst
wurde, ist weg.

Phase 2 kostet laut Plan 1–2 Tage und verlangt zusätzlich eine Änderung der
**veröffentlichten Datenschutzerklärung** — die liegt im anderen Repo
(`janlampert08-dev/stradoinfo`). Das ist der unterschätzte Teil.

**2. Es gibt keinen Auszahlungspfad.**
Eine Suche über `lib/`, `app/`, `supabase/` und `docs/` nach
`affiliate|provision|auszahlung|payout|Vergütung` trifft **nur**
`docs/creator-links-plan.md` — und dort steht es als offene Frage Nr. 3
(„Ist eine Vergütung geplant?"), nicht als Umsetzung. Kein Stripe Connect,
keine Abrechnung, kein Beleg, kein Guthabenkonto. Für die ersten Partner ist
das kein Blocker — bei fünf Creators rechnet man von Hand. Als Zusage an
zwanzig wird es einer.

**3. Eine Strecke trägt keinen öffentlichen Urhebernamen.**
`routes.erstellt_von` existiert (`types/database.ts`), wird in
`lib/routes.ts` aber ausschliesslich für Besitzprüfungen verwendet — die
Datei joint an keiner Stelle auf `profiles` und wählt keinen Anzeigenamen
aus. „Diese Strecke hat @creator kuratiert" ist damit **kein vorhandenes
Feature**, sondern neue Arbeit. Das ist deshalb wichtig, weil genau diese
Sichtbarkeit für viele Creator mehr wert ist als die 25 % (siehe unten).

Was dagegen **schon funktioniert**: Strecken anlegen kann jedes angemeldete
Konto. `0086_strecken_anlegen_wieder_offen.sql` hat die Premium-Schranke aus
`0077` zurückgenommen. Ein Creator kann also sofort Strecken einreichen; sie
durchlaufen die Moderation (`status_ok = false` beim Einfügen). Der Teil der
Idee steht.

---

## Was 25 % tatsächlich wert sind

`docs/premium-plan.md` empfiehlt **CHF 4.90/Monat** und **CHF 49.00/Jahr**;
die tatsächlich verkauften Preise stehen in Stripe (`STRIPE_PREMIUM_PRICE_ID_MONAT`
/ `_JAHR`), nicht im Code — vor einer Zusage dort gegenprüfen.

| | Umsatz | 25 % | Stripe-Gebühr¹ | bleibt Strado |
| --- | --- | --- | --- | --- |
| Jahresabo | CHF 49.00 | **CHF 12.25** | CHF 2.06 | CHF 34.69 |
| Monatsabo | CHF 4.90 | **CHF 1.23** | CHF 0.48 | CHF 3.19 |
| Monatsabo, 12 Monate gehalten | CHF 58.80 | CHF 14.70 | CHF 5.76 | CHF 38.34 |

¹ 3.6 % + CHF 0.30 für ein CHF-Abo mit Schweizer Karte, gerechnet in
`docs/premium-plan.md` Abschnitt 5.

**Die unbequeme Rechnung.** Ein Kanal mit 30'000 Abonnenten erreicht mit
einem Video vielleicht 3'000 Aufrufe. Davon klickt ein kleiner
einstelliger Prozentsatz, ein Teil registriert sich, und von den
Registrierten schliesst erfahrungsgemäss ein niedriger einstelliger
Prozentsatz ein Abo ab. Das landet pro Video im Bereich **von null bis
wenigen Abos** — also **CHF 0 bis etwa CHF 50**.

Daraus folgt nichts Gutes für den Pitch „verdiene mit": Für einen
professionellen Creator ist das kein Einkommen, und wer es als solches
verkauft, verliert Glaubwürdigkeit im ersten Gespräch. Hinzu kommt, dass der
**Verwaltungsaufwand die Beträge übersteigt** — Rechnung, Zahlungsweg und
Buchung für CHF 12.25 kosten mehr als CHF 12.25.

**Was daraus folgt, und das ist die eigentliche Empfehlung:** Die 25 % sind
kein Verdienstversprechen, sondern ein **Fairness-Signal** — der Beweis, dass
der Creator nicht ausgenutzt wird, wenn die Sache gross wird. Verkauft werden
muss der nicht-monetäre Teil:

- eine Strecke, die seinen Namen trägt,
- eine Bestenliste für seine Community in seiner Fahrzeugklasse,
- Zahlen darüber, was sein Post bewirkt hat — etwas, das ihm sonst niemand
  gibt.

Und damit die 25 % trotzdem etwas bedeuten: **wiederkehrend**, solange das Abo
läuft, nicht nur im ersten Jahr. Das kostet nichts, solange niemand
konvertiert, und ist genau dann viel wert, wenn es funktioniert hat — die
richtige Risikoverteilung für beide Seiten.

### Vier Punkte, die vor der ersten Zusage schriftlich geklärt sein müssen

1. **25 % wovon** — Bruttoumsatz oder nach Stripe-Gebühr? (Empfehlung:
   brutto, weil nachvollziehbar; der Unterschied sind CHF 0.51 im Jahresabo.)
2. **Wie lange** — nur das erste Jahr oder für die Laufzeit des Abos?
   (Empfehlung: Laufzeit, siehe oben.)
3. **Was zählt als vermittelt** — Registrierung, bestätigte E-Mail, oder Abo
   nach Ablauf der Rückerstattungsfrist? Und in welchem Zeitfenster nach dem
   Klick? (`creator-links-plan.md` empfiehlt First Touch, 30 Tage.)
4. **Was bei Rückerstattung und Kündigung** — die Beteiligung muss
   zurückbuchbar sein, sonst zahlt man für einen stornierten Umsatz.

### Rechtliches, kurz und ohne Anspruch auf eine Prüfung

- Es ist ein **Vermittlungsverhältnis**, kein Arbeitsverhältnis. Schriftlich
  festhalten, dass kein Anstellungsverhältnis entsteht.
- **Werbekennzeichnung ist Pflicht**, nicht Stilfrage: Ein bezahlter Post muss
  als solcher erkennbar sein (UWG Art. 3), und YouTube wie TikTok verlangen
  zusätzlich die plattformeigene Kennzeichnung. Das gehört in die
  Vereinbarung, sonst haftet am Ende der Creator für etwas, das wir versäumt
  haben zu verlangen.
- **Der Creator erhält keine Personendaten.** Nur aggregierte Zahlen —
  „14 Registrierungen, 2 Abos", nie wer. Das deckt sich mit dem Aufbau von
  `creator_links`, wo `name` bewusst nicht an `anon` geht.
- **MWST** wird erst ab CHF 100'000 Jahresumsatz relevant
  (`docs/premium-plan.md` Abschnitt 5) — für Strado vorerst nicht. Ein
  Creator, der selbst MWST-pflichtig ist, stellt seine Provision aber mit
  MWST in Rechnung.

---

## Die Zürich-Falle, und warum sie POV-Kanäle besonders trifft

`AGENTS.md` ist im Produktabschnitt unmissverständlich: „Proximity is worth
more than reach." Es gibt **dreizehn** freigegebene Strecken, alle im Kanton
Zürich.

Die Recherche hat gezeigt, dass Schweizer POV-Content fast vollständig
**Alpenpass-Content** ist. Die neuesten Videos der gefundenen Kanäle heissen
„Sustenpass in 4K", „Klausen Pass Ascent from South", „SWISS ALPS. Sustenpass
(RAW Onboard)", „Stelvio Pass on a Kawasaki ZX-10R". Genau davon sagt
`instagram-kanaele-outreach.md` zu Recht: Wer von dort kommt und eine
5,7-km-Runde in Dietlikon findet, kommt nicht wieder.

**Das ist der zentrale Zielkonflikt dieses Vorhabens**, und er löst sich nicht
durch die Beteiligung — Geld macht ein unpassendes Publikum nicht passend.

Es gibt aber einen Ausweg, den es beim Gratis-Outreach nicht gab: **Ein
Partner-Creator kuratiert Strecken.** Wenn ein Berner Motovlogger drei
Strecken um Bern einreicht und seine Community dort fährt, entsteht Dichte in
einer zweiten Region — nicht als Verdünnung, sondern als zweiter Kern.

Das ist allerdings **genau die Ausweitung über Zürich hinaus, die `AGENTS.md`
als Wachstumsentscheidung beschreibt und zu widerstehen empfiehlt**. Deshalb
gehört sie entschieden, nicht nebenbei getan:

> **Offene Entscheidung:** Dürfen Partner-Creators Strecken ausserhalb des
> Kantons Zürich einreichen? Wenn ja, ist das der bewusste Schritt zu einer
> zweiten Region — und dann besser mit **einem** Creator in **einer** Region,
> bis dort dieselbe Dichte steht wie in Zürich. Wenn nein, kommen nur Creator
> mit Zürcher Publikum in Frage, und die Liste unten schrumpft auf Stufe 1
> und 2.

Bis diese Frage entschieden ist, sind Kanäle mit **Ortsbezug zum Kanton
Zürich** die einzigen, bei denen nichts schiefgehen kann.

---

## Stufe 1 — POV und Fahr-Content aus der Schweiz

Der Kern der Anfrage. Alle Zahlen am 2026-09-14 geprüft.

| Kanal | Abos | Videos | Aufrufe | letztes Video | Warum |
| --- | ---: | ---: | ---: | --- | --- |
| [Swiss Drive 4K](https://www.youtube.com/@SwissDrive4K-ch) | **8'200** | 85 | 2,43 Mio. | 2026-09-12 | **Der reinste Treffer der Liste.** Ausschliesslich Fahrvideos „right from the driver's seat", ganze Schweiz, alle vier Jahreszeiten. Kanal existiert erst seit 09/2024 und hat 15 Videos in sieben Wochen — wachsend und hungrig. Keine Social-Links hinterlegt: Ansprache nur über YouTube |
| [SatoPOV](https://www.youtube.com/@SatoPOV) | 273 | 90 | 137 Tsd. | 2026-09-03 | „Bikes • Cars • Travel • Trading", „Currently in Switzerland". Klein, aber **beide Fahrzeugarten** und echtes POV. Seit 07/2025 |
| [Alpenglider / Swiss Moto Adventure](https://www.youtube.com/@Alpenglider) | 747 | 440 | 1,04 Mio. | 2026-09-12 | 440 Videos, seit 2006 dabei, aktiv. Ausdauer statt Reichweite |
| [SwissThrottle](https://www.youtube.com/@SwissThrottle) | 17 | 22 | 16 Tsd. | 2026-09-14 | Zu klein für eine Beteiligung, aber seit 06/2026 und täglich aktiv. **Beobachten**, in drei Monaten nochmal ansehen |
| [IlCapoFLA](https://www.youtube.com/@IlCapoFLA) | 2'140 | 104 | 687 Tsd. | 2025-07-18 | RAW-Onboard-Aufnahmen. **Ruht seit 14 Monaten** — nur anschreiben, wenn er zurückkommt |

**Der Formatverwandte, der keiner ist:**
[SwissWalker](https://www.youtube.com/@SwissWalker) (28'500, aktiv 2026-09-13)
macht POV-Walking-Tours durch Schweizer Städte. Gleiche Kameraführung,
gleiches Publikumsversprechen („nimm mich mit"), falsches Fahrzeug. Erwähnt,
weil das Format beweist, dass Schweizer POV-Publikum existiert — nicht als
Kandidat.

## Stufe 2 — Motovlogger aus der Schweiz, aktiv

| Kanal | Abos | Videos | Aufrufe | letztes Video | Anmerkung |
| --- | ---: | ---: | ---: | --- | --- |
| [KurvenradiusTV](https://www.youtube.com/@KurvenradiusTV) | **33'500** | 200 | 7,68 Mio. | 2026-09-13 | **Die grösste verifizierte Schweizer Motorrad-Reichweite mit echtem Fahrinhalt.** „Motorradfahren mit Hirn", Reifentests, Linienwahl — ein Publikum, das über das *Wie* des Fahrens nachdenkt, nicht über Posing. IG [@kurvenradius_tv](https://www.instagram.com/kurvenradius_tv/) |
| [Pascal Gisler (obscuro94)](https://www.youtube.com/@Pascal_Gisler) | 5'530 | **6'033** | 5,72 Mio. | 2026-09-14 | „Motovlogs und Motorrad-Abenteuer **aus der Schweiz**", „kurvige Schweizer Strassen". 15 Videos in sechs Tagen — die höchste Taktung der ganzen Liste. IG [@obscuro94](https://www.instagram.com/obscuro94) |
| [M!ngan Motovlog](https://www.youtube.com/@mingan-mv) | 5'060 | 921 | 885 Tsd. | 2026-09-14 | Einziger Kandidat mit **allen vier Kanälen**: YouTube, IG, TikTok ([743 Follower](https://www.tiktok.com/@mingan_motovlog)), Twitch — plus eigene Seite mingan.ch und Merch-Shop. Fährt eine Honda CMX 500 Rebel: **Klasse A offen, aber Einsteiger-Segment** |
| [Dragonrider](https://www.youtube.com/@swissDragonrider) | 2'000 | 173 | 1,03 Mio. | 2025-09-15 | Arbeitet **bei Yamaha Schweiz**. Das ist Zugang zur Branche, nicht nur Reichweite. Ruht aber seit einem Jahr |
| [DoubleX / SwissBiker](https://www.youtube.com/@DoubleXRider) | 1'000 | 181 | 160 Tsd. | 2026-04-24 | **Dieselbe Person wie [@swiss.biker](https://www.instagram.com/swiss.biker/)** aus Stufe A des Instagram-Dokuments — der Kanal verlinkt beide Profile. Ein Video heisst „Midnight Ride **Zürich**". Fahrlehrer, also Zugang zu Fahranfängern |

**Reichweite ohne Puls — nicht anschreiben:**
[ZeroCool Moto](https://www.youtube.com/@NikMatic) (7'290 Abos) hat **zuletzt
2020 hochgeladen**; er ist laut eigener Beschreibung auf Instagram
[@zerocoolmoto](https://www.instagram.com/zerocoolmoto/) weiterhin aktiv — wer
ihn will, geht dorthin, nicht über YouTube.
[Ténéré on Tour](https://www.youtube.com/@Ténéréontour) (487, letztes 2018)
und [ACE Crew](https://www.youtube.com/@CrazyShiat) (223, letztes 2022) sind
still.

## Stufe 3 — Zürcher Auto-Szene

Hier stimmt der Ortsbezug ohne Einschränkung.

| Kanal | Abos | Aufrufe | letztes Video | Warum |
| --- | ---: | ---: | --- | --- |
| [cscarphotography](https://www.youtube.com/@cscarphotography) | **30'600** | 23,8 Mio. | 2026-09-10 | Jeremy, Zürich. Neuestes Video: „**Zurich's** Supercar Madness Returns". Schreibt auf TikTok Mundart („Abonnier und chum in Live ine") — echtes lokales Publikum, nicht internationale Spotting-Ware. Auch [TikTok](https://www.tiktok.com/@cscarphotography) (1'128 Follower, 102'800 Likes) und IG |
| [polloloco_cars](https://www.youtube.com/@polloloco_cars) | 5'050 | 6,60 Mio. | 2026-09-14 | Sagt es selbst: „My main content is carspotting **in Zurich**". 1'149 Videos, postet täglich. TikTok [@carspotting_pollo](https://www.tiktok.com/@carspotting_pollo), IG [@polloloco.cars](https://www.instagram.com/polloloco.cars/) |
| [rayzon.cars47](https://www.youtube.com/@rayzon.carspott47) | 184 | 78 Tsd. | 2026-09-13 | „Supercars In Switzerland", seit 03/2025, sehr aktiv. Klein, aber am Anfang — und damit ansprechbar |
| [Auto-Zimmerli / Retoo](https://www.youtube.com/@Auto-Zimmerli) | 7'990 | 170 Tsd. | 2026-09-14 | Oldtimer-Treffen, neuestes Video vom OSMT Zug. **Youngtimer/Oldtimer-Publikum fährt tatsächlich Landstrassen** statt zu posieren |

**Tot, trotz guter Zahlen:**
[Amazing Cars Switzerland](https://www.youtube.com/@AmazingCarsSwitzerland)
(9'220, letztes 2025-10-16 — und die Videos heissen „SWISS MOUNTAIN PASS
DRIVE", also ohnehin Alpen),
[theswisssupercars](https://www.youtube.com/@theswisssupercars) (5'520,
letztes 2021-01-21),
[Autowelt Schweiz](https://www.youtube.com/@autoweltschweiz) (3'920, letztes
2023-05-13).

## Stufe 4 — Fahrschulen: der unterschätzte Kanal

`instagram-kanaele-outreach.md` nennt Fahrschulen „die am meisten
unterschätzte Gruppe", weil dort die Klassen A1 und A 35 kW entstehen. Auf
YouTube ist diese Gruppe **grösser als die gesamte Motovlog-Szene**.

| Kanal | Abos | Aufrufe | letztes Video | Ort |
| --- | ---: | ---: | --- | --- |
| [Fahrschule schaltchnüppel](https://www.youtube.com/@fahrschule_schaltchnueppel) | **18'700** | 5,64 Mio. | 2026-09-04 | **Winterthur und Umgebung** — Kanton Zürich. Ralf, Fahrschule seit 2007, [linktr.ee/schaltchnueppel](https://linktr.ee/schaltchnueppel) |
| [derfahrlehrer](https://www.youtube.com/@derfahrlehrer701) | 930 | 603 Tsd. | 2025-06-07 | CH. „Erste Motorradfahrstunde mit Sozius", „Prüfungsrouten" — thematisch näher dran geht kaum |
| [Fahrschule Schweiz](https://www.youtube.com/@fahrschuleschweiz510) | 11'400 | 1,73 Mio. | **2021-10-01** | Ruht seit fünf Jahren. Die Zahl täuscht |

**Fahrschule schaltchnüppel ist der beste Einzelkandidat der ganzen Liste**,
wenn man Ortsbezug, Aktivität und Publikumspassung zusammen bewertet:
18'700 Abonnenten, Kanton Zürich, aktiv, und sein Publikum besteht
ausnahmslos aus Leuten, die gerade fahren lernen und **noch keine einzige
Strecke kennen**. Das ist die Zielgruppe der App in Reinform.

## Stufe 5 — Medien mit Preisliste

Reichweite ja, aber es sind Unternehmen; eine Umsatzbeteiligung ersetzt dort
keinen Werbeetat. Interessant eher als Berichterstattung über die App.

| Kanal | Abos | letztes Video | Was es ist |
| --- | ---: | --- | --- |
| [Vision E Drive](https://www.youtube.com/@VisionEDrive) | 39'100 | 2026-09-13 | E-Mobilität Schweiz, sehr aktiv, Community-Abende. Elektro ist in der App eine eigene Leistungsklasse |
| [Star TV](https://www.youtube.com/@startvtube) | 25'600 | 2026-09-14 | Schweizer Privatsender |
| [GO! Mobilitätsmagazin](https://www.youtube.com/@gomagschweiz) | 18'500 | 2026-09-13 | Moderatorin Cyndie Allemann (ehem. Rennfahrerin), verbunden mit bluewin |
| [moto.ch](https://www.youtube.com/@motoch) | 17'100 | 2026-09-08 | TÖFF-Magazin, Redaktion **Buckhauserstrasse 24, 8048 Zürich** |

## Nicht Schweiz, auch wenn der Name es sagt

Das Länderfeld auf YouTube ist die Kanalanmeldung, nicht das Publikum —
diese hier tragen „Swiss" im Namen und sitzen anderswo:
[Misha Charoudin](https://www.youtube.com/@mgcharoudin) (2,23 Mio., gemeldet
Niederlande, Nürburgring),
[LNR Moto](https://www.youtube.com/@LNRmoto) (34'900, Niederlande),
[Exclusive Swiss Cars](https://www.youtube.com/@exclusiveswisscars) (3'980,
Niederlande),
[Royal Swiss Auto Services](https://www.youtube.com/@RoyalSwissAutoServices)
(3'240, VAE),
[Swissvox](https://www.youtube.com/@swissvox) (12'900, Thailand).

Und [Swiss View](https://www.youtube.com/@SwissView1) ist mit **443'000
Abonnenten** die grösste Schweizer Reichweite, die die Recherche gefunden
hat — aber es sind Drohnenaufnahmen. Niemand dort fährt.

---

## Was man anbieten kann, in der Reihenfolge des Werts

Die ersten drei kosten heute nichts und sind gebaut oder fast gebaut. Die
letzten beiden sind Arbeit — und genau die, für die sich ein Creator
interessiert.

1. **Ein eigener Einstiegslink.** `app.strado.ch/c/<code>`, Verwaltung unter
   `/moderation/creator`. Gebaut. Nicht `strado.ch/c/…` — der Apex leitet mit
   308 auf die Info-Seite um, die diesen Pfad nicht kennt.
2. **Die Zahlen offenlegen.** Aufrufe heute, Registrierungen ab Phase 2. Die
   meisten Kanäle erfahren nie, was ein Post bewirkt hat.
3. **Fertige Grafiken.** 19 Instagram-Posts und drei TikTok-Slideshows liegen
   gerendert in `docs/marketing/*/out/`.
4. **Eine Bestenliste für seine Community in seiner Fahrzeugklasse.** Hier
   zahlt sich `0080_motorklassen` aus: Der Fahrschul-Kanal bekommt eine
   A1-Wertung, in der ein 125er gewinnen kann. Prüfen, wie viel Arbeit eine
   nach Creator gefilterte Rangliste ist — die Klassenlogik existiert, die
   Filterung nach Herkunft nicht.
5. **Eine Strecke, die seinen Namen trägt.** Der stärkste Anreiz und der
   einzige, der **heute nicht existiert** (siehe Befund 3). Einreichen kann er
   sofort; sichtbar zugeschrieben wird es nicht.

**Nicht versprechen, solange es nicht geklärt ist:** Premium verschenken. Es
gibt keinen Kulanz-Pfad im Code, `subscriptions` hängt an Stripe. Ein
Creator, der die App bewerben soll, braucht sie aber selbst — das ist der
erste Fall, der eine Lösung verlangt.

---

## Reihenfolge

**Vor der ersten Anfrage:** die vier Vertragspunkte oben entscheiden und die
Zürich-Frage beantworten. Ohne das ist jedes Gespräch eine Zusage, die man
nicht halten kann.

1. **Fahrschule schaltchnüppel** (Winterthur, 18'700). Ortsbezug, Aktivität
   und Publikum passen gleichzeitig — bei keinem anderen ist das so.
2. **Swiss Drive 4K** (8'200, reines POV). Der Kanal, den die Anfrage
   eigentlich meint. Wachsend, keine Preisliste, nur über YouTube
   erreichbar. Hier lohnt es, gleich mit einer konkreten Strecke zu kommen.
3. **polloloco_cars** und **cscarphotography** — beide Zürich, beide täglich
   aktiv, zusammen rund 36'000 Abonnenten auf YouTube plus TikTok.
   cscarphotography ist der reichweitenstärkste Kandidat mit echtem
   Ortsbezug; deshalb erst, wenn der Pitch bei einem Kleineren einmal
   funktioniert hat.
4. **KurvenradiusTV** (33'500). Grösste Schweizer Motorrad-Reichweite mit
   Fahrinhalt. Sein Publikum denkt über Fahrtechnik nach — die Bestenliste
   nach Klasse ist für ihn das interessantere Argument als die Karte.
5. **Pascal Gisler** und **M!ngan** — beide klein, beide täglich aktiv, beide
   ausdrücklich „aus der Schweiz". M!ngan deckt als einziger vier Plattformen
   ab und ist damit der beste Test, auf welcher davon ein Link überhaupt
   konvertiert.
6. **DoubleX / SwissBiker** — falls die Instagram-Anfrage aus dem anderen
   Dokument schon lief, ist das **dieselbe Person**. Nicht zweimal
   anschreiben.

Pro Anfrage ein eigener `/c/<code>`, sonst ist die zweite Welle nicht von der
ersten zu unterscheiden.

---

## Methode, und was sie nicht kann

Alle YouTube-Zahlen stammen aus `ytInitialData` der Kanalseite, das Datum des
letzten Videos aus dem RSS-Feed des Kanals. Beides ohne API-Schlüssel, beides
wiederholbar:

```
./docs/marketing/creator-check.sh SwissDrive4K-ch KurvenradiusTV
```

Das Datum ist der Teil, der die Liste von der Instagram-Liste unterscheidet.
Vier Kanäle mit zusammen über 30'000 Abonnenten sind hier als **tot**
aussortiert, obwohl sie in jeder Follower-Rangliste gut dastünden — allen
voran Fahrschule Schweiz (11'400 Abonnenten, letztes Video 2021).

Was die Methode **nicht** kann, und wo man selbst nachsehen muss:

- **TikTok drosselt.** Von acht abgefragten Profilen kamen zwei durch
  (M!ngan 743 Follower, cscarphotography 1'128). Alle anderen TikTok-Angaben
  in diesem Dokument fehlen deshalb — das heisst **nicht**, dass die Konten
  klein sind.
- **Instagram antwortet mit HTTP 429**, wie schon bei der Recherche zum
  anderen Dokument. Die dortigen Follower-Zahlen bleiben ungeprüft.
- **Das Länderfeld ist die Anmeldung, nicht das Publikum.** Ein Kanal mit
  „Land: Schweiz" kann ein deutsches Publikum haben und umgekehrt. Wo es
  darauf ankam, wurde stattdessen die Kanalbeschreibung oder ein Videotitel
  zitiert.
- **Abonnentenzahlen sind gerundet** (YouTube zeigt „33'500", nicht 33'512).
- **Aufrufe sagen nichts über die letzten Monate.** Ein Kanal mit 7 Mio.
  Aufrufen kann sie 2019 gesammelt haben.

Vor dem Abschicken jeder Anfrage gilt unverändert, was im anderen Dokument
steht: Profil selbst öffnen, letzten Beitrag ansehen, Kommentare lesen
(fahren die Leute selbst, oder schauen sie zu?), und nachsehen, ob ein
Mediakit in der Beschreibung steht.
