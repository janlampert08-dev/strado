# Anschreiben — Vorlagen für die ersten fünf

Gegenstücke zu `docs/marketing/instagram-kanaele-outreach.md`. Fünf Texte
zum Kopieren, dazu die Regeln, aus denen sie gebaut sind — damit Nummer
sechs bis zwanzig nicht wieder bei null anfangen.

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
> fahren, Zeit stoppen, mit anderen vergleichen. Acht Strecken sind drin,
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
> stoppen, vergleichen. Acht Strecken, alle in Reichweite einer
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
> fahren, Zeit stoppen, mit anderen vergleichen. Acht Strecken sind
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
