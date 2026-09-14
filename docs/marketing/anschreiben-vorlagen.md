# Anschreiben — Vorlagen für die ersten zehn

Gegenstücke zu `docs/marketing/instagram-kanaele-outreach.md`. Zehn Texte
zum Kopieren, dazu die Regeln, aus denen sie gebaut sind — damit Nummer
elf bis zwanzig nicht wieder bei null anfangen. Die Reihenfolge ist die
aus der Kanalliste.

## Vor dem Abschicken

1. **Den Code anlegen.** `/moderation/creator`. Erlaubt sind nur `a-z`,
   `0-9` und Bindestrich, 2–32 Zeichen (`CODE_MUSTER` in
   `lib/creatorLinks.ts`, dieselben Muster als CHECK-Constraints in
   Migration `0084`). Ein Link, der beim ersten Klick auf der Startseite
   landet statt beim Creator, ist schlimmer als kein Link.
2. **Tiefenlink überlegen.** `app.strado.ch/c/<code>?z=/strecken/<id>`
   landet direkt auf einer Strecke statt auf der Karte. Für jeden, dem man
   eine bestimmte Strecke anbietet, ist das der bessere Link.
3. **Das Profil aufmachen.** Letzter Beitrag? Fahrer oder Zuschauer?
   Mediakit in der Bio? Die Prüfliste steht am Ende der Kanalliste.
4. **Das Bild bereitlegen.** `docs/marketing/instagram/out/`. Wer „ich
   schick dir ein Bild" schreibt und dann drei Tage braucht, hat den Faden
   verloren.
5. **Prüfen, ob es das Bild überhaupt gibt.** Die gerenderten Grafiken
   decken **acht** Strecken ab, die App hat **dreizehn** — `daten.mjs` ist
   eine Momentaufnahme vom 2026-09-07 ohne Datenbankverbindung. Wer eine
   Strecke anbietet, die dort fehlt, muss sie zuerst in `daten.mjs`
   ergänzen und `node docs/marketing/instagram/render.mjs` laufen lassen.
   Ein zugesagtes Bild, das es nicht gibt, ist teurer als kein Angebot.

## Was man versprechen darf

**Aufrufe, keine Registrierungen.** `/c/<code>` misst über Vercel Web
Analytics, wie viele den Link angeklickt haben — mehr nicht. Wie viele
danach ein Konto angelegt haben, ist Phase 2 in
`docs/creator-links-plan.md` und **nicht gebaut**. Der Kommentarkopf in
`lib/creatorLinks.ts` sagt es unmissverständlich: „Das misst **Aufrufe,
keine Registrierungen**."

Also: „ich sehe, wie viele über dich reinschauen". Nicht: „ich sage dir,
wie viele sich angemeldet haben". Der Satz kostet nichts und wäre eine
Lüge, die beim ersten Rückfragen auffliegt.

**Kein Premium.** Es gibt keinen Kulanz-Pfad, `subscriptions` hängt an
Stripe. Kommt in keiner Vorlage vor, und soll auch in keiner Antwort
zugesagt werden.

## Der Baukasten

Jede der fünf Vorlagen folgt derselben Ordnung. Wer sie für einen sechsten
Kanal abwandelt, behält die Reihenfolge bei:

1. **Der Ort zuerst, nicht das Produkt.** `AGENTS.md`: „The place name is
   the unit of recognition." Fällanden, Rapperswil, Greifensee — das ist
   der Satz, der entscheidet, ob weitergelesen wird. Nicht „eine App für
   Fahrstrecken".
2. **Der Grund, warum ausgerechnet dieser Kanal.** Ein Satz, der bei keinem
   anderen Empfänger stehen könnte. Fehlt er, ist es ein Serienbrief und
   wird als solcher behandelt.
3. **Das Angebot, bevor die Bitte kommt.** Fertiges Bild, benannte Strecke,
   Klassen-Wertung. Konkret und ohne Gegenleistung formuliert.
4. **Der Ausstieg.** „Auch ohne Nennung", „und wenn nicht, ist auch gut".
   Nimmt den Druck raus und erhöht die Antwortquote — eine Bitte, die man
   ablehnen darf, wird eher beantwortet.
5. **Eine einzige Frage am Schluss.** Beantwortbar in einem Satz. Zwei
   Fragen sind eine zu viel.

**Länge:** Direktnachricht höchstens sieben Zeilen. E-Mail höchstens
fünfzehn. Ein Link, nicht drei.

---

## 1 — @carsncoffee.ch · Direktnachricht

> Hoi zäme
>
> Ich habe Strado gebaut: eine App für Fahrstrecken im Kanton Zürich —
> fahren, Zeit stoppen, mit anderen vergleichen. Dreizehn Strecken sind drin,
> alle zwischen Stadt, Greifensee und See.
>
> Was ich euch anbieten kann, ohne dass es euch etwas kostet: Ich lege eine
> Strecke an, die an eurem Treffpunkt endet, und benenne sie nach euch.
> Karte und Höhenprofil bekommt ihr als fertiges Bild für die Ankündigung —
> auch dann, wenn Strado darauf nirgends vorkommt.
>
> Den Treffpunkt müsst ihr mir nicht verraten: Ich melde mich fürs nächste
> Treffen ganz normal an.
>
> Passt das für euch?
>
> Gruss, Jan

**Warum so:** Der letzte Absatz ist der wichtigste. Auf
[carsncoffee.ch](https://carsncoffee.ch/) steht, dass Ort und Datum nur
Angemeldete erfahren. Wer trotzdem nach dem Treffpunkt fragt, hat die Seite
nicht gelesen — und genau das sieht man einer Anfrage an.

---

## 2 — @vespaclubzuerich · Direktnachricht

> Hoi
>
> Ich schreibe euch wegen einer Sache, die ich gebaut habe, bevor ein
> einziger Rollerfahrer die App benutzt hat: Die Ranglisten in Strado sind
> nach Fahrzeugklassen getrennt. **A1, bis 125 cm³ und 11 kW, ist eine
> eigene Wertung.** Eine Vespa fährt dort nicht gegen einen Porsche, sondern
> gegen andere Vespas.
>
> Strado ist eine App für Fahrstrecken im Kanton Zürich — fahren, Zeit
> stoppen, vergleichen. Dreizehn Strecken, alle in Reichweite einer
> Sonntagsausfahrt.
>
> Kostenloses Angebot: eine A1-Wertung auf einer Strecke eurer Wahl, zeitlich
> begrenzt, als Club-Wertung. Dazu Karte und Höhenprofil als fertiges Bild
> für eure nächste Ausfahrt.
>
> Welche Strecke wäre das bei euch?
>
> Gruss, Jan

**Warum so:** Die Klasse ist hier das ganze Argument, deshalb steht sie in
Zeile eins und nicht im dritten Absatz. Und „gebaut, bevor ein einziger
Rollerfahrer die App benutzt hat" ist nachprüfbar wahr — die Migration
`0080` ging vor jedem Outreach ein. Ein Verein hört heraus, ob eine Nische
gemeint oder nachträglich behauptet ist.

---

## 3 — Küde's Töff-Total, Fällanden · E-Mail an `info@toefftotal.ch`

**Betreff:** Strecken für Ihre Grundkurs-Absolventen — kostenlos

> Guten Tag [Name prüfen — in einem Fahrlehrer-Verzeichnis stand „Küde
> Bachmann"; wenn unklar, „Guten Tag" allein ist besser als ein falscher
> Name]
>
> Ich habe Strado gebaut, eine App für Fahrstrecken im Kanton Zürich:
> fahren, Zeit stoppen, mit anderen vergleichen. Dreizehn Strecken sind
> freigegeben — eine davon, die **Greifensee Schleife**, startet und endet
> in Fällanden. Praktisch vor Ihrer Tür.
>
> Warum ich Ihnen schreibe: Wer bei Ihnen den Grundkurs macht, hat danach
> den Ausweis und keine einzige Strecke im Kopf. Genau diese Lücke füllt die
> App. Die Ranglisten sind dabei nach Kategorie getrennt — A1 und A 35 kW
> haben je eine eigene Wertung, ein 125er tritt nicht gegen eine offene
> Maschine an. Wer frisch vom Grundkurs kommt, kann also tatsächlich vorne
> stehen.
>
> Mein Angebot kostet Sie nichts: Ich stelle Ihnen die Greifensee Schleife
> als Karte mit Höhenprofil zur Verfügung — als Bild, das Sie Ihren
> Kursteilnehmern mitgeben oder posten können, ob Strado darauf erwähnt wird
> oder nicht.
>
> Wenn Sie mögen, richte ich zusätzlich einen eigenen Einstiegslink ein. Ich
> sehe dann, wie viele Leute darüber hereinschauen, und melde Ihnen die Zahl
> zurück.
>
> Hätten Sie Interesse an dem Bild?
>
> Freundliche Grüsse
> Jan Lampert
> contact@strado.ch

**Warum so:** Fällanden im zweiten Satz. Das ist der einzige Empfänger auf
der Liste, bei dem eine bestehende Strecke buchstäblich vor der Tür startet
— das gehört nach vorn und nicht in einen Nebensatz. Nur Facebook gefunden,
kein Instagram; deshalb E-Mail und deshalb „Sie".

---

## 4 — @swiss.biker · Direktnachricht

> Hoi
>
> Du bringst Leuten das Töfffahren bei — ich habe an dem Problem gebaut, das
> danach kommt: Ausweis in der Tasche, und keine Ahnung, wo man hinfahren
> soll.
>
> Strado ist eine App mit Fahrstrecken im Kanton Zürich. Fahren, Zeit
> stoppen, vergleichen. Die Ranglisten sind nach Kategorie getrennt, A1 und
> A 35 kW je eine eigene — wer frisch vom Grundkurs kommt, kann gewinnen
> statt nur Letzter zu werden.
>
> Falls du magst: Ich richte dir einen eigenen Link ein und schicke dir
> fertige Bilder — Karte, Höhenprofil, Zahlen — zu jeder Strecke, die du in
> einem Video zeigen willst. Kostet dich nichts, und verlinken musst du mich
> nur, wenn es dir passt.
>
> Welche Strecke fehlt deinen Schülern am meisten? Die baue ich als nächste.
>
> Gruss, Jan

**Warum so:** Die Schlussfrage gibt ihm Einfluss aufs Produkt statt nur
Reichweite abzufragen. Das ist die teuerste Zusage in allen fünf Vorlagen —
und die einzige, die man nicht machen sollte, wenn man sie nicht einhält.

---

## 5 — @rapperswilzuerichsee · Direktnachricht oder E-Mail

> Guten Tag
>
> Sie posten jeden Donnerstag einen Wochenendtipp — ich hätte einen, der Sie
> nichts kostet.
>
> Ich habe Strado gebaut, eine App mit Fahrstrecken rund um Zürich. Eine
> davon ist der **Zürichsee Run**: 65,7 km einmal um den See, vorbei an
> Rapperswil. Karte, Höhenprofil und die Zahlen dazu liegen als fertiges
> Bild bereit.
>
> Sie können es unverändert verwenden, mit oder ohne Nennung der App. Wenn
> Sie mögen, lege ich einen eigenen Einstiegslink an und melde Ihnen zurück,
> wie viele darüber hereingeschaut haben.
>
> Und falls Ihnen eine Strecke lieber wäre, die in Rapperswil **startet**
> statt den Ort nur zu streifen: Sagen Sie mir, wo, und ich lege sie an.
>
> Freundliche Grüsse
> Jan Lampert
> contact@strado.ch

**Warum so:** Zeile eins nennt ihren eigenen Rhythmus. Wer einen
wiederkehrenden Slot füllen muss, liest „ich hätte einen Tipp" anders als
„dürfte ich Sie um etwas bitten".

---

---

## 6 — @zueritipp · Direktnachricht

> Guten Tag
>
> Sie bitten in Ihrer Bio um Tipps — hier einer, der nichts kostet und nicht
> in der Stadt stattfindet.
>
> Ich habe Strado gebaut: eine App mit dreizehn Fahrstrecken im Kanton Zürich.
> Zürichberg, Greifensee, einmal um den See. Man fährt sie mit Auto oder
> Töff, die App stoppt die Zeit und vergleicht mit anderen. Kein Ticket,
> keine Reservation, kein Eintritt — die kürzeste Runde dauert eine
> Viertelstunde.
>
> Karte, Höhenprofil und die Zahlen zu jeder Strecke liegen als fertiges
> Bild bereit, im Hochformat. Sie können es unverändert verwenden.
>
> Soll ich Ihnen eine Auswahl schicken?
>
> Freundliche Grüsse, Jan

**Warum so:** „Nicht in der Stadt" ist der Haken. Ein Veranstaltungsmagazin
hat Restaurants, Konzerte und Ausstellungen im Überfluss und wenig, das man
am Sonntagmorgen ohne Anmeldung machen kann. Und „die kürzeste Runde dauert
eine Viertelstunde" nimmt die Sorge, es handle sich um einen Tagesausflug.

Wenn ihr Feed duzt, das ganze auf Du umstellen — bei einem Magazinkanal ist
Siezen die sichere Wahl, aber die falsche, wenn der Rest der Kommentarspalte
duzt.

---

## 7 — @acecafeluzern · Direktnachricht

> Hoi zäme
>
> Ein Teil eurer Sonntagsgäste kommt aus dem Raum Zürich — und fährt auf dem
> Weg zu euch irgendeine Strecke, über die danach niemand spricht.
>
> Ich habe Strado gebaut: eine App mit dreizehn Fahrstrecken im Kanton Zürich,
> für Auto **und** Töff. Fahren, Zeit stoppen, vergleichen. Die Ranglisten
> sind nach Fahrzeugklasse getrennt — A1, A 35 kW, A offen, und drei
> Leistungsklassen fürs Auto.
>
> Was ich euch anbieten kann: fertige Bilder zu den Strecken, die auf dem
> Weg zu euch liegen — als Inhalt für eure Kanäle, mit oder ohne Nennung der
> App. Und einen eigenen Link, über den ich sehe, wie viele darüber
> reinschauen, und euch die Zahl melde.
>
> Was ich **nicht** anbiete, damit es gleich klar ist: eine Strecke bis nach
> Rothenburg lege ich nicht an. Die App ist bewusst auf den Kanton Zürich
> begrenzt, und das bleibt vorerst so.
>
> Hätte das für euch einen Nutzen?
>
> Gruss, Jan

**Warum so:** Der vorletzte Absatz ist der Grund, warum diese Vorlage
existiert. Ace Cafe liegt in Rothenburg LU, also ausserhalb des Kantons. Es
wäre leicht, eine Anfahrtsstrecke zu versprechen — und es widerspräche dem
Produktentscheid in `AGENTS.md`, der ausdrücklich vor „while we're here"-
Ergänzungen ausserhalb der Region warnt. Die Grenze offen zu nennen, kostet
in diesem Gespräch nichts und erspart später eine Rücknahme. Ace Cafe ist
ausserdem der einzige Kandidat, der Auto und Töff im selben Kanal bedient —
deshalb stehen beide Klassenfamilien im Text.

---

## 8 — @igmotorradschweiz · E-Mail

**Betreff:** Strecken-App aus Zürich — und die Frage, die Sie als Erstes stellen werden

> Guten Tag
>
> Ich schreibe Ihnen als Einzelunternehmer aus Zürich, der eine App für
> Fahrstrecken gebaut hat: dreizehn Strecken im Kanton, man fährt sie, die App
> zeichnet auf und führt eine Bestenliste. Getrennt nach
> Führerausweiskategorie — A1, A 35 kW, A offen —, weil ein 125er sonst
> gegen eine offene Maschine anträte.
>
> Die Frage, die ein Verband für Verkehrssicherheit als Erstes stellt, will
> ich nicht abwarten: **Verleitet eine Bestenliste zum Rasen?**
>
> Wir haben das in den AGB nicht weggelassen, sondern hingeschrieben. Ziffer
> 11.3: „Strado ist kein Wettbewerb um Geschwindigkeit. Fahrten, die unter
> Missachtung von Verkehrsregeln zustande gekommen sind, dürfen nicht
> veröffentlicht werden." Ziffer 11.4 untersagt ausdrücklich das Verabreden
> von Rennen, das Fahren im Pulk und dichtes Auffahren zum Zweck einer
> gemeinsamen Aufzeichnung — und endet mit dem Satz: „Wer zwischen einer
> Aufzeichnung und der Sicherheit anderer entscheiden muss, bricht die
> Aufzeichnung ab." Nachzulesen unter strado.ch/legal/agb.
>
> Ob das genügt, entscheiden nicht wir. Deshalb die eigentliche Bitte: Wenn
> Sie eine Formulierung für zu schwach halten oder eine Funktion für falsch
> gebaut, sagen Sie es mir. Ich ändere lieber jetzt etwas, als es später zu
> verteidigen.
>
> Und falls Sie es für Ihre Mitglieder brauchbar finden: Karten und
> Höhenprofile der Strecken stelle ich Ihnen kostenlos zur Verfügung, mit
> oder ohne Nennung der App.
>
> Freundliche Grüsse
> Jan Lampert
> contact@strado.ch

**Warum so:** Die einzige Vorlage, die mit dem Einwand statt mit dem Angebot
öffnet. Ein Verband, der gegen die Diskriminierung von Zweiradfahrern
kämpft, hat ein Interesse daran, dass Motorradfahren **nicht** mit Rasen
gleichgesetzt wird — eine Timing-App ist für ihn zuerst ein Risiko. Wer das
ausspricht und die eigenen AGB dagegenhält, wird als Gegenüber behandelt und
nicht als Bittsteller.

Die Zitate sind wörtlich aus `docs/rechtstexte/agb.md` Ziff. 11.3 und 11.4.
**Vor dem Abschicken gegenlesen** — wenn die AGB sich ändern, ändert sich
dieser Brief mit.

Die Bitte um Kritik ist keine Floskel. Wer sie stellt, muss eine Antwort
auch lesen und beantworten wollen.

---

## 9 — Töffclubs · E-Mail, für mehrere Empfänger anpassbar

Verwendbar für TKT Töffklub (Region Zürich/Aargau), TWN-Club Zürich, MC
Linth, MC Skorpion, MC Sportriders, MC Kobra (Raum Winterthur), TCS
Motorradgruppe Aargau. **Die eckigen Klammern sind Pflichtfelder — eine
unausgefüllte davon macht den Brief zum Serienbrief**, und genau das ist die
Fassung, die niemand beantwortet.

**Betreff:** Eine Strecke für Ihre nächste Ausfahrt — kostenlos

> Guten Tag
>
> Ihr Club fährt [was sie tatsächlich tun — geführte Touren, Ausfahrten in
> kleinen Gruppen, mehrtägige Touren; steht auf ihrer Website]. Genau dafür
> hätte ich etwas, das Sie nichts kostet.
>
> Ich habe Strado gebaut: eine App mit dreizehn Fahrstrecken im Kanton Zürich.
> Zu jeder gibt es Karte, Höhenprofil, Länge, Steigung und die Zahl der
> Kehren — als fertiges Bild, das Sie für Ihre Ausfahrts-Ankündigung
> verwenden können, ob Strado darauf erwähnt wird oder nicht.
>
> [Ein Satz mit Ortsbezug — etwa: „Die Greifensee Schleife startet in
> Fällanden, das liegt bei Ihnen praktisch um die Ecke." Wenn kein solcher
> Satz möglich ist, gehört der Club nicht auf die Liste.]
>
> Wenn Sie mögen, richte ich für Ihren Club zusätzlich eine eigene Wertung
> auf einer Strecke ein, zeitlich begrenzt. Die Ranglisten sind nach
> Führerausweiskategorie getrennt — A1, A 35 kW, A offen —, ein 125er tritt
> also nicht gegen eine offene Maschine an.
>
> Hätten Sie Interesse an den Bildern?
>
> Freundliche Grüsse
> Jan Lampert
> contact@strado.ch

**Warum so:** Vereine haben keinen Marketingetat und keine Marketingabsicht
— das Angebot muss deshalb dem Vereinszweck dienen (der nächsten Ausfahrt)
und nicht der Reichweite. Der Klammersatz mit dem Ortsbezug ist die
Qualitätskontrolle: Wer ihn nicht füllen kann, hat keinen Grund zu
schreiben.

---

## 10 — @cars_in_zurich · Direktnachricht

> Hoi
>
> Dir schicke ich kein Bild — du machst bessere.
>
> Ich habe Strado gebaut: eine App mit dreizehn Fahrstrecken im Kanton Zürich.
> Zürichberg, Nordwestschleife, einmal um den See. Fahren, Zeit stoppen,
> vergleichen. Der Grund, warum ich dir schreibe: Das sind dreizehn Strassen,
> die du wahrscheinlich alle kennst, samt Karte und Höhenprofil — als
> Motivliste ist das vielleicht brauchbarer als ein fertiger Post.
>
> Wenn du eine davon fährst und dabei fotografierst, gehört das Bild
> selbstverständlich dir. Ich verlinke dich gern, wenn du magst, und lasse
> es, wenn nicht.
>
> Was mich ehrlich interessieren würde: Welche Strasse im Kanton sieht am
> besten aus und fehlt in der App? Die baue ich als nächste.
>
> Gruss, Jan

**Warum so:** Die grösste Reichweite auf der Liste und die einzige Anfrage,
die man nur einmal stellt — deshalb erst, wenn der Pitch anderswo
funktioniert hat. Ein Fotograf braucht keine fertigen Grafiken; das offen zu
sagen, ist der ganze erste Satz. Angeboten wird, was er brauchen könnte
(Motive) und was ihn nichts kostet (die Wahl, ob verlinkt wird). Die
Schlussfrage behandelt ihn als jemanden, der die Strassen besser kennt als
ich — was zutrifft.

**Nicht schreiben:** eine Bitte um Bilder für die Streckenseiten gegen
„Credit und Verlinkung". Das ist die Anfrage, die Fotografen tausendmal
bekommen, und sie ist der Grund, warum die meisten solche Nachrichten nicht
mehr lesen.

---

## Danach

Zwei Kandidaten aus der Liste haben bewusst keine Vorlage bekommen, weil
sie keine sein wollen:

- **@motolifestyle.ch** publiziert selbst Motorradtouren. Das ist kein
  Pitch-Fall, sondern ein Gespräch: entweder der natürlichste Partner oder
  der einzige echte Konkurrent auf dieser Seite. Eine Vorlage würde die
  Frage vorwegnehmen, die man dort stellen sollte.
- **@autozuerich_official** ist terminabhängig. Die Messe läuft vom 5. bis
  8. November 2026; anfragen sollte man Anfang Oktober, nicht jetzt. Der
  Text hängt daran, was sie bis dahin ankündigen.

## Nachfassen — einmal, nach zehn Tagen

> Hoi zäme — kurz nachgehakt, falls meine Nachricht untergegangen ist. Das
> Angebot steht unverändert: [ein Halbsatz, das Angebot]. Wenn es gerade
> nicht passt, ist das auch völlig in Ordnung, dann melde ich mich nicht
> nochmal.
>
> Gruss, Jan

Einmal. Der letzte Satz ist ernst gemeint und wird eingehalten — ein
zweites Nachfassen kostet mehr Ruf, als die Antwort wert wäre.

## Was in keine Vorlage gehört

- **„Kooperation", „Partnerschaft", „Synergien".** Wörter aus dem
  Mediakit-Register. Sie signalisieren, dass gleich über Geld geredet wird,
  und ziehen die Antwort „was zahlt ihr?" nach sich.
- **Mehr als ein Link.** Zwei Links sehen aus wie eine Rundmail.
- **Follower- oder Nutzerzahlen der App.** Nach unten gibt es dort nichts zu
  gewinnen, und nach oben nichts zu behaupten.
- **Zahlen, die die App nicht misst.** Siehe oben: Aufrufe ja,
  Registrierungen nein.
- **Ein Versprechen auf Premium.** Kein Kulanz-Pfad im Code.
- **Derselbe Text an zwei Empfänger.** Wenn Punkt 2 des Baukastens bei
  beiden passt, ist er nicht spezifisch genug.
