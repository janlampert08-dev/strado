# Instagram-Kanäle für kostenlose Ansprache

Recherche vom 2026-09-14. Ziel: Kanäle, die man **ohne Budget** anschreiben
kann — also solche, bei denen ein Tausch (Inhalt, Strecke, Sichtbarkeit)
plausibler ist als eine Rechnung.

## Zwei Filter schneiden die Liste zu

**1. Nähe schlägt Reichweite.** `AGENTS.md`, Produktabschnitt: „Proximity is
worth more than reach." Die Frage ist nicht, wie gross ein Kanal ist, sondern
welcher Anteil seines Publikums in Fahrdistanz zu einer Strecke wohnt, die es
in der App **schon gibt**. Was es gibt, steht in
`docs/marketing/instagram/daten.mjs`: acht freigegebene Strecken, alle Kanton
Zürich, die längste 65,7 km, die höchste erreicht 783 m.

Daraus folgt eine Absage, die man sich sonst teuer erkauft: **Alpenpass- und
Grand-Tour-Accounts sind kein Ziel.** Deren Publikum will Furka, Susten,
Gotthard. Wer von dort kommt und eine 5,7-km-Runde in Dietlikon findet, kommt
nicht wieder.

**2. Die App rangiert sechs Klassen, nicht eine.**
`supabase/migrations/0080_motorklassen.sql` und `lib/motorklassen.ts`:

| Motorrad | Auto |
| --- | --- |
| **A1** — bis 125 cm³ und bis 11 kW | **bis 150 PS** (110 kW) |
| **A 35 kW** | **150–300 PS** (110–220 kW) |
| **A offen** — über 35 kW | **über 300 PS** (220 kW+) |

Die Migration sagt im Kopfkommentar selbst, wofür das gebaut ist:
„Ranglisten, die einen 125er-Roller nicht mehr gegen einen Porsche antreten
lassen." Damit ist die Zielgruppe ausdrücklich **breiter als die Auto-Szene,
die auf Instagram am lautesten ist**. Ein 125er-Roller, ein A2-Einsteiger und
ein Golf mit 110 kW haben in dieser App je eine eigene Bestenliste, die sie
gewinnen können — auf einem Supercar-Account haben sie nichts verloren.

Das ist der Grund, warum diese Liste über Carspotting hinausgeht: Roller-
Clubs, Fahrschulen, Frauen-Communities und Regionalmedien bedienen genau die
vier Klassen, in denen die meisten Fahrer tatsächlich sitzen.

---

## Stufe A — beste Passung, zuerst anschreiben

Gemeinsamer Nenner: Ortsbezug zum Kanton Zürich **und** ein Publikum, das
selbst fährt.

| Kanal | Was es ist | Reichweite* | Warum |
| --- | --- | --- | --- |
| [@carsncoffee.ch](https://www.instagram.com/carsncoffee.ch/) | Kuratiertes Auto-Treffen **Zürich und Zug**, Eintritt frei, Anmeldung nötig | n/v | Genaueste Überschneidung überhaupt. Kein Medienhaus, also kein Preisschild. [carsncoffee.ch](https://carsncoffee.ch/), auch auf TikTok |
| [@vespaclubzuerich](https://www.instagram.com/vespaclubzuerich/) | Vespa Club Zürich, offiziell, **seit 1951**, 65 Beiträge | ~750 | **Die A1-Klasse in Reinform.** Verein mit Ausfahrten, kein Gewerbe. Dachverband [Vespa Club Schweiz](https://vespaclub.ch/) hat 57 Regionalclubs und ~1'400 Fahrer — ein Ja hier öffnet 56 weitere Türen |
| [@swiss.biker](https://www.instagram.com/swiss.biker/) | SwissBiker — **Fahrlehrer** und Video-Creator, in Zürich | ~5,7 Tsd. | Klein genug, dass eine Nachricht gelesen wird. Fahrlehrer heisst: sein Publikum fährt gerade erst los und sucht Strecken |
| [@rapperswilzuerichsee](https://www.instagram.com/rapperswilzuerichsee/) | Rapperswil Zürichsee Tourismus, **Wochenendtipps jeden Donnerstag** | ~7,7 Tsd. | Liegt am Zürichsee Run (65,7 km) und neben dem Ziel von A3 Asphalt (Pfäffikon SZ). Ein wiederkehrender Content-Slot, der jede Woche gefüllt werden muss — das ist eine offene Tür, kein Gefallen |
| [@zueritipp](https://www.instagram.com/zueritipp/) | Züritipp, Veranstaltungsmagazin für Zürich und Umgebung, 3'480 Beiträge | ~47 Tsd. | Bittet in der Bio ausdrücklich um **Tipps per DM**. Grösste Zürcher Reichweite, die man ohne Mediakit erreichen kann |
| [@acecafeluzern](https://www.instagram.com/acecafeluzern/) | ACE CAFE Luzern, Rothenburg LU — einziges Ace Cafe der Schweiz, Treffpunkt für **Töff und Auto**, seit 2015 | ~36 Tsd. | Deckt beide Fahrzeugarten in einem Kanal. Und es ist selbst ein Fahrziel: eine Strecke, die dort endet, ist für beide Seiten Inhalt. `info@acecafeluzern.ch` |
| [@igmotorradschweiz](https://www.instagram.com/igmotorradschweiz/) | IG Motorrad Schweiz, „Die Motorradlobby", Verein, ~3'000 Mitglieder, Sitz Zürich | n/v | Verein, nicht Firma — Kooperation ist Vereinszweck, nicht Umsatz. [ig-motorrad.ch](https://www.ig-motorrad.ch/) |
| [@cars_in_zurich](https://www.instagram.com/cars_in_zurich/) | Automobilfotograf aus Zürich, ~2'980 Beiträge | ~65 Tsd. | Grösste Zürcher Reichweite mit echtem Ortsbezug. Fotografiert selbst — eine Strecke ist ein Motiv |
| [@autozuerich_official](https://www.instagram.com/autozuerich_official/) | Auto Zürich Car Show, 39. Ausgabe, **5.–8. November 2026** | ~8 Tsd. | Terminanker: eine Messe braucht im Vorfeld Inhalte. Ab Anfang Oktober anfragen, nicht in der Messewoche |

\* siehe [Zahlen sind ungeprüft](#zahlen-sind-ungeprüft)

---

## Stufe B — Fahrschulen: dort entstehen die Klassen A1 und A 35 kW

Die am meisten unterschätzte Gruppe. Ein Fahrschüler hat gerade den Ausweis,
kennt noch keine Strecke, und sucht genau das, was die App anbietet. Die
Schulen wiederum brauchen Inhalte, die nicht nach Werbung aussehen.

| Kanal | Was es ist | Reichweite* |
| --- | --- | --- |
| [@fahrschule_albisgueetli](https://www.instagram.com/fahrschule_albisgueetli/) | Familienbetrieb seit 40 Jahren, Zürich/Wettswil, Motorradkurse + Auto + Verkehrskunde | n/v |
| [@fahrschule_drivingteam_zurich](https://www.instagram.com/fahrschule_drivingteam_zurich/) | Driving Team, Zürich-Altstetten, alle Kategorien A1 / A 35 kW / A, Prüfung am Albisgütli | n/v |
| [@blink.fahrschule](https://www.instagram.com/blink.fahrschule/) | BLINK, von einem jungen IT-Team gegründet, mehrere Standorte CH | n/v |
| **Küde's Töff-Total**, Fällanden | Fahrschule + Werkstatt + 600 m² Shop, Bruggacherstrasse 30, 8117 Fällanden. Nur Facebook gefunden, kein Instagram — `info@toefftotal.ch` | — |

**Küde's Töff-Total verdient den Extra-Blick:** Fällanden ist der Start- und
Zielpunkt der *Greifensee Schleife*. Näher an einer bestehenden Strecke sitzt
kein anderer Kandidat auf dieser Liste.

Weitere Anbieter ohne gefundenen Instagram-Auftritt, aber mit
Motorradgrundkursen im Kanton: [Fahrschule Florin](https://www.fahrschule-florin.ch/kurse/motorrad-grundkurse)
(ZH und AG), [motorradgrundkurs4you.ch](https://www.motorradgrundkurs4you.ch/motorrad-grundkurs-zuerich/),
[motorradgrundkurszuerich.ch](https://www.motorradgrundkurszuerich.ch/) (Roller **und** Motorrad).

---

## Stufe C — Clubs und Verbände

Vereine antworten eher als Influencer, weil Kooperation ihr Zweck ist und
nicht ihr Geschäftsmodell.

**Auto**

- [@acs.zurich](https://www.instagram.com/acs.zurich/) (~1'045) — ACS Sektion
  Zürich: „Pannendienst | Fahrkurse | Motorsport | E-Sports". Veranstaltet
  auch den [Zurich Classic Car Award](https://www.acs.ch/de/sektionen/zuerich/Oldtimer/ZCCA.php)
  am Bürkliplatz (Mitte August, ~80 Fahrzeuge; zuletzt wegen der
  Platzsanierung nach Zug ausgewichen)
- [@tcszuerich](https://www.instagram.com/tcszuerich/) (~1'359) — TCS Sektion
  Zürich, Standorte **Volketswil, Schlieren, Neftenbach, Au-Wädenswil**; alle
  vier im Streckengebiet
- [@acs.ch](https://www.instagram.com/acs.ch/) (~2'819),
  [@touringclub.schweiz](https://www.instagram.com/touringclub.schweiz/) — die
  nationalen Dachkanäle

**Motorrad**

- [@swiss_moto_federation](https://www.instagram.com/swiss_moto_federation/)
  (~7 Tsd.) — Swiss Moto, nationaler Verband, ~140 angeschlossene Clubs;
  [Clubsuche nach Kanton](https://www.swissmoto.org/clubsuche)
- **TKT Töffklub** — „aus der Region **Zürich und dem Aargau**",
  [toeffklub.ch](https://www.toeffklub.ch)
- **TWN-Club Zürich** (seit 1951) — [twnclub.ch](http://twnclub.ch)
- **MC Skorpion**, **MC Sportriders**, **MC Kobra** — Raum Winterthur
- **Motorradclub Linth** (über 70 Mitglieder), **TCS Motorradgruppe Aargau**
  (geführte Touren, max. 8 Fahrer), **MC Mamba St. Gallen**,
  **Motorradclub Altstätten**, **Moto-Club Hemmental** (SH)
- **Töff Treff Zürich** (Facebook) — spontane und geplante Ausfahrten,
  ausdrücklich damit jemand aus der Nähe mitfahren kann
- **Vespa Outlaws Switzerland** — [vespaoutlawsswitzerland.ch](https://vespaoutlawsswitzerland.ch/),
  „der Club für kilometerhungrige Vespa-Fans"

Übersichten: [paesse.info](https://www.paesse.info/motorradclubs-und-vereine/),
[motosuisse.ch](https://www.motosuisse.ch/de/toeffclubs.html),
[toeff-fruend.ch](https://www.toeff-fruend.ch/links/ctflink1.htm).

---

## Stufe D — Frauen auf zwei Rädern

Eigener Abschnitt, weil diese Communities aktiv Einsteigerinnen abholen —
also überproportional in A1 und A 35 kW sitzen — und weil sie klein und
ansprechbar sind.

- [@biker.girls.switzerland](https://www.instagram.com/biker.girls.switzerland/)
  (~1'496) — Swiss Bikergirls
- [Girls on Bikes](https://girlsonbikes.ch/) — Schweizer Community, erklärtes
  Ziel ist der leichtere Einstieg in die Motorradwelt: Kurse, gemeinsame
  Ausfahrten, Events
- **SHE RIDES** — Frauen-Motorrad-Community für DACH inkl. Schweiz, Touren und
  Workshops
- [@petrolettes](https://www.instagram.com/petrolettes/) (~16 Tsd.) —
  weltweite Frauen-Rallye („RÄLLLY", 6.–7. Juni 2026). International, deshalb
  nur bedingt nah — aber ein Schweizer Ableger wäre ein Aufhänger

---

## Stufe E — Regionalmedien und Tourismus

Nicht auto-affin, dafür **wohnortgenau**. Für eine App, deren acht Strecken
alle im selben Kanton liegen, ist das der bessere Tausch als schweizweite
Reichweite.

| Kanal | Was es ist | Reichweite* |
| --- | --- | --- |
| [@tsri.ch](https://www.instagram.com/tsri.ch/) | Tsüri.ch, Stadtmagazin Zürich, zehn Jahre Lokaljournalismus | ~63 Tsd. |
| [@zueritipp](https://www.instagram.com/zueritipp/) | Züritipp (siehe Stufe A) | ~47 Tsd. |
| [@stadt_winterthur](https://www.instagram.com/stadt_winterthur/) | Stadt Winterthur, offiziell | ~10 Tsd. |
| [@kulturstadt.winterthur](https://www.instagram.com/kulturstadt.winterthur/) | Departement Kultur Winterthur | ~8,1 Tsd. |
| [@rapperswilzuerichsee](https://www.instagram.com/rapperswilzuerichsee/) | Tourismus Rapperswil-Zürichsee (siehe Stufe A) | ~7,7 Tsd. |
| [@ausflugszieleschweiz](https://www.instagram.com/ausflugszieleschweiz/) | ausflugsziele.ch, Ausflugsideen Schweiz | ~4,8 Tsd. |
| [@visitzurich](https://www.instagram.com/visitzurich/) | Zürich Tourismus | n/v |
| [@stadtzh](https://www.instagram.com/stadtzh/) / [@kantonzuerich](https://www.zh.ch/de/news-uebersicht/medienmitteilungen/2023/03/kantonzuerich-der-kanton-zuerich-ist-neu-auf-instagram.html) | Stadt und Kanton Zürich, offiziell | n/v |

Das **Zürcher Oberland** (Dreieck Zürich–Winterthur–Rapperswil) ist die
Region, in der Binzmer Backfire und Greifensee Schleife liegen; Tourismus-
und Gemeindekanäle von dort sind die nächste Grabung, wenn diese Runde
funktioniert.

---

## Stufe F — Fachpresse und Magazine

| Kanal | Was es ist | Reichweite* |
| --- | --- | --- |
| [@motolifestyle.ch](https://www.instagram.com/motolifestyle.ch/) | moto-lifestyle.ch, „Online-Lifestyle-Magazin für Motorradfahrer", 616 Beiträge. **Publiziert selbst Motorradtouren** | ~1,2 Tsd. |
| [moto.ch](https://www.moto.ch/) | Führendes Schweizer Töff-Magazin (Fusion von MOTO SPORT SCHWEIZ und TÖFF, 2024), 14 Ausgaben/Jahr. **Redaktion Buckhauserstrasse 24, 8048 Zürich** | Print + Online + YouTube |
| [@autoillustrierte](https://www.instagram.com/autoillustrierte/) | auto-illustrierte, Schweizer Automagazin, 1'027 Beiträge | ~3,3 Tsd. |
| [@automobilrevue](https://www.instagram.com/automobilrevue/) | AUTOMOBIL REVUE, seit 1906, Grenchen | n/v |
| [@autozeit.ch](https://www.autozeit.ch/) | AUTOZEIT, Old- und Youngtimer Schweiz | n/v |
| [theriders.ch](https://theriders.ch/) | Neue digitale Plattform für die Schweizer Motorradszene | n/v |
| [toeff-forum.ch](https://www.toeff-forum.ch/) / [swissbikers.ch](https://www.swissbikers.ch/forum/) | Die zwei Schweizer Töff-Foren — kein IG, aber dort findet Tourenplanung wirklich statt | Forum |

**@motolifestyle.ch ist der interessanteste Fall der ganzen Liste:** ein
Magazin, das Motorradtouren als Kerninhalt publiziert. Entweder der
natürlichste Partner (sie beschreiben Strecken, die App vermisst sie) oder
der einzige echte Konkurrent auf dieser Seite. Beides lohnt ein Gespräch.

---

## Stufe G — Nischen

Jede hier ist klein, aber jede bringt eine Fahrzeugart mit, die in einer der
sechs Klassen eine eigene Bestenliste hätte.

**Roller und Töffli (A1)** — [Vespa Club Schweiz](https://vespaclub.ch/)
(57 Clubs), [mofakult.ch](https://www.mofakult.ch/) (Schweizer Mofa-Community,
Töfflibuebe-Kultur), [mofahub.ch](https://mofahub.ch/) (Marktplatz),
**Jost's Töff-Lade AG**, Herzogenmühlestrasse 20, 8051 Zürich (Roller und
Scooter). Die Töffli-Szene ist eine spezifisch schweizerische Nostalgie mit
eigener Tour-Tradition — und ein Mofa landet über `leistung_kw` sachlich in
A1.

**JDM** — [JDM Swiss Shop](https://www.jdmswissshop.ch/), JDM-Treffen bei
[Enter Technikwelt Solothurn](https://enter.ch/de/events/jdm-treffen/),
Nozomi Car Meet (Flugplatz Interlaken)

**US-Cars** — [@us_performance_cars](https://www.instagram.com/us_performance_cars/)
(~1'497, CH seit 1997), [South Side Cruisers](https://www.south-side-cruisers.ch/us-car-treffen),
[us-cars.ch Treffpunkte](https://us-cars.ch/treffpunkte/) (u. a. monatliche
Treffen in Suhr AG)

**Elektro** — [@teslaschweiz](https://www.instagram.com/teslaschweiz/)
(~1'051, Tesla Community Schweiz), [Tesla Owners Switzerland](https://teslaowners.ch/)
(Verein, Zürich), [@tesla.switzerland](https://www.instagram.com/tesla.switzerland/)
(~63 Tsd., Fanpage)

**Enduro / Supermoto / Adventure** —
[@swissenduroseries](https://www.instagram.com/swissenduroseries/) (~6,8 Tsd.,
Swiss National Enduro Series), [@supermoto4fun](https://www.instagram.com/supermoto4fun/)
(~8,9 Tsd.), [@motoffroad_adventure](https://www.instagram.com/motoffroad_adventure/)
(~7,6 Tsd.)

**Vanlife** — [@vanlifeschweiz](https://www.instagram.com/vanlifeschweiz/)
(~15 Tsd., Schweizer Vanlife-Community, Partner von @meetnsleep_schweiz).
Fährt Strecken aus einem anderen Grund, aber fährt sie

**Oldtimer / Youngtimer** — [Youngtimer Connection](https://www.youngtimer-connection.ch/)
(monatliche Treffen, spontane Ausfahrten), [SwissClassics Revue](http://www.swissclassics.com/de/veranstaltungskalender),
[dreamcar.ch](https://www.dreamcar.ch/category/treffen/)

**Trackdays** — [sportfahrer.ch](https://www.sportfahrer.ch/) (Open Pitlane),
[TCS Fahrtrainings](https://www.tcs.ch/de/kurse-fahrzeugchecks/kurse-fahrtrainings/sportlich-fahren/),
Kartbahn Zürich Rümlang

**Geführte Reisen** — [@toeffreisen.ch](https://www.instagram.com/toeffreisen.ch/)
(~499, Bern, seit über 25 Jahren, 541 Beiträge)

---

## Stufe H — Gewerbe mit Ortsbezug

Händler und Werkstätten sind kein Medium, aber sie haben ein lokales
Publikum, eine Kundenkartei und ein Interesse daran, dass ihre Kundschaft
fährt statt parkiert.

| Kanal | Ort | Reichweite* |
| --- | --- | --- |
| [@hostettlermoto](https://www.instagram.com/hostettlermoto/) | hostettler moto ag, 8 Standorte CH | ~7,7 Tsd. |
| [@hostettlermotozuerichsued](https://www.instagram.com/hostettlermotozuerichsued/) | **Zürich Süd** | ~1'415 |
| [@hostettlermotoeschenbach](https://www.instagram.com/hostettlermotoeschenbach/) | Eschenbach | ~1'003 |
| [@motocenterwinterthur](https://www.instagram.com/motocenterwinterthur/) | Moto Center Winterthur, 700 Fahrzeuge, **20 Min. von Zürich** | n/v |
| [@moto_welt_winterthur](https://www.instagram.com/moto_welt_winterthur/) | Moto Welt GmbH | n/v |
| [@carmotion_ag](https://www.instagram.com/carmotion_ag/) | **Effretikon (Kt. ZH)**, Occasionen | ~5 Tsd. |
| [@swisstuningag](https://www.instagram.com/swisstuningag/) | Swiss Tuning AG | ~9 Tsd. |
| [@tuning.switzerland](https://www.instagram.com/tuning.switzerland/) | Tuning-Szene CH, 197 Beiträge | ~11 Tsd. |
| [@rsc_sportcar_rent](https://www.instagram.com/rsc_sportcar_rent/) | Sportwagenvermietung Zürich | ~1'379 |
| [@motorradhandel.ch](https://www.instagram.com/motorradhandel.ch/) | Occasionsplattform | n/v |
| [@autoscout24ch](https://www.instagram.com/autoscout24ch/) | AutoScout24 Schweiz | ~10 Tsd. |

Ohne gefundenen Instagram-Auftritt, aber mit hartem Ortsbezug:
**Töff Bekleidung Uster** (Zentralstrasse 5, 8610 Uster — direkt am
Greifensee), **M & T Boutique Zürich** (Motorrad- und Töffbekleidung),
**Swiss Race Performance** Regensdorf, **Honda Motorrad Zürich** (Volketswil).

Ein eigener Gedanke zu den Sportwagen-Vermietern: Wer für einen Tag einen
Ferrari mietet, hat danach die Frage „und wo fahre ich jetzt hin?". Eine
Strecke mitzugeben kostet sie nichts und uns nichts — das ist der sauberste
Tausch auf dieser ganzen Liste.

---

## Stufe I — schweizweite Auto-Szene, zweite Welle

Grösser, aber unschärfer: ein guter Teil des Publikums sitzt in Genf, Basel
oder Lugano.

[@carmeets_schweiz](https://www.instagram.com/carmeets_schweiz/) (n/v) ·
[@swisscarmeet](https://www.instagram.com/swisscarmeet/) (~3,5 Tsd.) ·
[@swiss_car_scene](https://www.instagram.com/swiss_car_scene/) (n/v) ·
[@car.spot.swiss](https://www.instagram.com/car.spot.swiss/) (~42 Tsd., bietet
ausdrücklich „shooting collaborations" an) ·
[@swisscarfreaks](https://www.instagram.com/swisscarfreaks/) (~5,5 Tsd.) ·
[@swisscarpage](https://www.instagram.com/swisscarpage/) (~2,8 Tsd., seit 2016) ·
[@carspotting.zuerich](https://www.instagram.com/carspotting.zuerich/) (~2,8 Tsd.) ·
[@zurichcarspotting](https://www.instagram.com/zurichcarspotting/) (n/v) ·
[@swiss_carspot](https://www.instagram.com/swiss_carspot/) (<1 Tsd.) ·
[@car_freaks_schweiz](https://www.instagram.com/car_freaks_schweiz/) (n/v) ·
[@exclusiveswisscars](https://www.instagram.com/exclusiveswisscars/) (~39 Tsd.) ·
[@swiscars](https://www.instagram.com/swiscars/) (~26 Tsd., Genf) ·
[@swiss.cars.ch](https://www.instagram.com/swiss.cars.ch/) (~485) ·
[@onlycarsswiss](https://www.instagram.com/onlycarsswiss/) (~3,2 Tsd.)

Plattformen mit Terminlisten, die Einträge aufnehmen:
[tuningzone.ch](https://tuningzone.ch/), [tuning-schweiz.ch](https://tuning-schweiz.ch/)
(mit eigener App — [laut streetlife.ch](https://www.streetlife.ch/artikel/diese-app-vereint-die-schweizer-tuning-community)
neu lanciert; eine App, die dieselbe Szene bündeln will, ist entweder Partner
oder Konkurrenz und lohnt einen Blick).

---

## Nicht anschreiben

Bewusst ausgeschlossen, mit Grund — das spart die Anfrage und die
Enttäuschung.

- [@zurich.carspotter](https://www.instagram.com/zurich.carspotter/) (~23 Tsd.,
  333 Beiträge) — sammelt **Modellautos im Massstab 1:18**. Ortsbezug im
  Namen, Publikum fährt nicht. Der verführerischste Fehlgriff der Liste.
- [@swizzcars](https://www.instagram.com/swizzcars/) (~194 Tsd.) — Sammler,
  schreibt ausdrücklich, dass Besuche und Shootings nicht stattfinden.
- [@autogespot_switzerland](https://www.instagram.com/autogespot_switzerland/)
  (~98 Tsd.) — Ableger einer globalen Spotting-Plattform, keine
  Entscheidungsgewalt vor Ort.
- [@carageluzern](https://www.instagram.com/carageluzern/) (~68 Tsd.) —
  offizieller **Koenigsegg**-Händler. Falsche Klasse in jeder Hinsicht.
- **Die Spitze der Schweizer Auto-/Motorrad-Rangliste** bei
  [HypeAuditor](https://hypeauditor.com/top-instagram-cars-motorbikes-switzerland/):
  [@gtoscud](https://www.instagram.com/gtoscud/) (~264 Tsd.),
  [@kyanind](https://www.instagram.com/kyanind/) (~213 Tsd.),
  [@michi_stuntrider](https://www.instagram.com/michi_stuntrider/) (~153 Tsd.),
  [@timsteness](https://www.instagram.com/timsteness/) (~70 Tsd.),
  [@lowidewheels](https://www.instagram.com/lowidewheels/) (~76 Tsd.),
  [@sternthal.ch](https://www.instagram.com/sternthal.ch/) (~52 Tsd.). Alle
  arbeiten mit Mediakit und Preisliste. Später, nicht jetzt.
- **Rennfahrer-Accounts** ([@louisdeletraz](https://www.instagram.com/louisdeletraz/),
  [@sebastien_buemi](https://www.instagram.com/sebastien_buemi/)) — Publikum
  schaut Rennen, fährt keine Landstrassen.
- [@szene_isch_zueri](https://www.instagram.com/szene_isch_zueri/) (~363 Tsd.) —
  grösste Zürcher Reichweite überhaupt, aber
  [SRF berichtete über das „Geschäft mit der Erniedrigung"](https://www.srf.ch/news/schweiz/szene-isch-zueri-so-funktioniert-das-geschaeft-mit-der-erniedrigung)
  hinter dem Netzwerk (dazu `szene_isch_aargau`, `swiss_reelz`, `army_szene`).
  Markenrisiko grösser als der Nutzen.
- **Reise- und Alpenpass-Accounts allgemein** — Publikum sucht Furka, die App
  hat Dietlikon. Interessant erst, wenn Strecken ausserhalb des Kantons
  dazukommen — und das wäre genau die Ausweitung, die `AGENTS.md` vermeiden
  will.

---

## Was man ohne Geld anbieten kann

Eine Anfrage ohne Gegenwert ist eine Bitte. Diese Dinge kosten nichts:

1. **Fertige Grafiken.** `docs/marketing/instagram/out/` hat 19 gerenderte
   Posts (1080 × 1350), `docs/marketing/tiktok/out/` drei Slideshows
   (1080 × 1920), Captions in `captions.md`. Für einen Kanal mit wöchentlicher
   Pflicht ist fertiger Inhalt das stärkste Pfand.
2. **Ein eigener Einstiegslink.** `/c/<code>` ist gebaut, Verwaltung unter
   `/moderation/creator` (`docs/creator-links-plan.md`, Phase 0 und 1
   umgesetzt). `app.strado.ch/c/vespazh` statt einer URL mit vier
   UTM-Parametern. **Die Zahlen dahinter offenlegen** ist das eigentliche
   Angebot — die meisten Kanäle erfahren nie, was ein Post bewirkt hat.
3. **Eine Strecke nach ihnen benennen oder von ihnen kuratieren lassen.**
   Kostet eine Zeile in der Datenbank.
4. **Eine Klassen-Bestenliste für ihre Community.** Hier zahlt sich das
   Klassensystem aus: Der Vespa Club bekommt eine A1-Wertung, in der ein
   125er gewinnen kann, ohne gegen einen 911 anzutreten. Das ist ein Angebot,
   das eine generische „Bestenliste" nicht macht.
5. **Die Route zum nächsten Treffen** als Karte und Höhenprofil — brauchbar
   für ihre Ankündigung, ob die App erwähnt wird oder nicht.

Was **nicht** ohne Handarbeit geht: **Premium verschenken.** Es gibt keinen
Kulanz-Pfad im Code, `subscriptions` hängt an Stripe. Erst versprechen, wenn
geklärt ist, wie es eingetragen wird.

---

## Reihenfolge

1. **@carsncoffee.ch** und **@vespaclubzuerich** zuerst. Zwei Fahrzeugwelten,
   beide mit Ortsbezug, beide Verein oder Community statt Gewerbe. Die
   Vespa-Anfrage ist zusätzlich der Test, ob das Klassen-Argument trägt — und
   ein Ja öffnet 56 weitere Regionalclubs.
2. **Küde's Töff-Total** (Fällanden, per E-Mail) und **@swiss.biker**. Beide
   sitzen am Punkt, an dem jemand gerade fahren lernt.
3. **@rapperswilzuerichsee** und **@zueritipp** — beide haben einen
   wiederkehrenden Slot zu füllen und bitten aktiv um Zulieferung. Der
   niedrigste Widerstand auf der ganzen Liste.
4. **@acecafeluzern** und **@igmotorradschweiz**, dann die Töffclubs per
   E-Mail (Clubs antworten auf E-Mail, nicht auf DM).
5. **@cars_in_zurich** und **@motolifestyle.ch** erst, wenn der Pitch einmal
   funktioniert hat — eine Anfrage an 65 Tsd. Follower hat man nur einmal.
6. **@autozuerich_official** ab Anfang Oktober, mit Blick auf die Messe vom
   5.–8. November 2026.

Pro Anfrage ein eigener `/c/<code>`, sonst ist die zweite Welle nicht von der
ersten zu unterscheiden.

---

## Zahlen sind ungeprüft

Die Follower-Angaben stammen **aus Suchergebnis-Snippets, nicht von Instagram
selbst** — jeder direkte Profilabruf lief in dieser Sitzung in HTTP 429. Sie
sind Grössenordnungen, keine Messwerte, und ein Teil ist womöglich Monate alt.
`n/v` heisst: kein Wert gefunden, nicht „klein".

Ebenso ungeprüft ist, ob ein hier genannter Betrieb **überhaupt einen
Instagram-Auftritt hat**, wo keiner verlinkt ist: bei Küde's Töff-Total, Töff
Bekleidung Uster und einigen Clubs wurde nur eine Website oder eine
Facebook-Seite gefunden. Das ist kein Beweis für Abwesenheit, nur für
Nichtfinden.

Vor dem Abschicken jeder Anfrage das Profil selbst öffnen:

- **Wann war der letzte Beitrag?** Ein Kanal, der seit acht Monaten schweigt,
  bringt nichts, egal wie viele Follower dastehen.
- **Fahrer oder Zuschauer?** Die Kommentare verraten das schneller als die
  Biografie.
- **Mediakit oder Preisliste in der Bio?** Dann ist es keine Gratis-Anfrage
  mehr.
