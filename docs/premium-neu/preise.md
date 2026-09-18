# Preise für Strado Premium — Stand 17. September 2026

Dieses Dokument begründet die Preise, die mit dem Premium-Ausbau gelten:

| Plan | Preis | Laufzeit | Verlängerung |
| --- | --- | --- | --- |
| **Monatsabo** | **CHF 6.90** | 1 Monat | automatisch |
| **Jahresabo** | **CHF 39.00** | 12 Monate | automatisch, erste 14 Tage gratis |
| **Saisonpass** | **CHF 29.00** | 6 Monate ab Kauf | **keine** |

Vorher: CHF 4.90 im Monat, CHF 49.00 im Jahr, kein Testzeitraum, kein Pass.
Die Entscheidung dafür ist am 17. September 2026 vom Eigentümer getroffen
worden; dieses Dokument hält die Gründe fest, nicht umgekehrt.

`docs/premium-plan.md` bleibt das ältere, ausführlichere Dokument zum
Kostenmodell und zur Stripe-Mechanik. Wo es beim Preis widerspricht, gilt
dieses hier — und `lib/actions/billing.ts` liest die Beträge ohnehin aus
Stripe, nie aus einem Dokument.

---

## 1. Was am alten Preis nicht stimmte

**Der Jahresplan war kein Angebot.** CHF 49.00 gegen 12 × 4.90 = CHF 58.80
sind 17 % Ersparnis. Im Markt sind es 30 bis 67 % (Tabelle unten). Ein
Jahresplan, der so wenig spart, wird nicht gewählt — und damit fällt die
einzige Entscheidung, die ein Abo trägt, zwölf Mal im Jahr statt einmal.

**CHF 49 im Jahr war für Töfffahrer am oberen Rand, ohne die Funktionen, die
dort oben üblich sind.** Jede App, die mehr kostet, bringt Navigation und
Offline-Karten mit. Strado hat beides nicht und soll es laut
`docs/markt/konkurrenzanalyse-schweiz.md` §7 auch nicht bauen.

**Der Winter war nicht eingepreist.** Ab November fährt in diesem Land
praktisch niemand mehr Motorrad. Ein Jahresabo, das im September beginnt,
bezahlt fünf Monate, in denen es nichts nützt — und ein Monatsabo wird im
Oktober gekündigt. Die Konkurrenz hat darauf 2026 reagiert; wir hatten keine
Antwort.

**Die Zahlen, gegen die das geprüft wurde, sind klein:** 14 Konten, 3 laufende
Abos, 6 aufgezeichnete Fahrten, 25 Strecken (Abfrage gegen die
Produktionsdatenbank am 2026-09-17). Es gibt also **keine** Konversionsdaten,
die eine Preisentscheidung stützen könnten — was umgekehrt heisst: eine
Preisänderung kostet heute fast nichts. Später kostet sie Bestandsschutz für
jeden, der bis dahin gekauft hat (AGB Ziff. 4.3).

---

## 2. Der Markt, am 17. September 2026 erhoben

Erhoben über App-Store-Seiten (Schweiz) und die Herstellerseiten. Wo die
Abrechnungsperiode auf der Store-Seite fehlt, steht **(geschätzt)** — die
Beträge sind belegt, die Zuordnung zu "pro Jahr" ist es dort nicht. Umgerechnet
mit EUR × 0.94 und USD × 0.80.

| Produkt | CHF/Jahr | Navigation + Offline-Karten | Bemerkung |
| --- | --- | --- | --- |
| Kurviger Tourer | 12 | nein (nur Planung) | 7 Tage gratis |
| **Kurviger Tourer+** | **25** | ja | 7 Tage gratis; IG Motorrad Schweiz: 15 % Rabatt |
| Cardo Ride (ex-Riser) PRO | 24 (US-Seite) | ja | mehrere CH-Preispunkte sichtbar, unklar welcher gilt |
| Motobit Premium | 28 | k. A. | 14 Tage gratis |
| **REVER Pro** | **30** | ja | 14 Tage gratis |
| **Scenic Premium** | **40** | ja | Quartalsplan CHF 20 |
| RideLink Premium | 43 | teilweise | Halbjahr CHF 26 |
| Liberty Rider Premium | 47 (geschätzt) | Sicherheit statt Navigation | 1 Monat gratis; oft über Versicherer gratis |
| The Tours (CH) | 50 (geschätzt) | ja | 6'684 registrierte Konten (open-startup, 17.09.2026) |
| Detecht Premium | 55 | ja | **Halbjahresplan CHF 35** |
| komoot Premium | 59 | teilweise | Regionenpakete für Neukunden eingestellt |
| **calimoto Premium** | **80** | ja | **Season Pass: CHF 53 für 3 Monate, ohne Verlängerung (neu seit 7. August 2026)** |
| **Strava** | **79.95** | nein | monatlich CHF 11.95; Segment-Ranglisten sind der bezahlte Teil |
| ROADS by Porsche | gratis | nein | kuratierte Strecken, keine Bezahlfunktion |
| alppass.ch | gratis | nein | Passstatus, Wetter, werbefrei |

Drei Befunde daraus, und alle drei stehen in den Preisen oben:

1. **Wer mit Töff-Apps verglichen wird, landet bei CHF 25 bis 43.** CHF 39
   liegt am oberen Rand dieser Spanne und unter jedem Anbieter, der mehr
   verlangt — aber nicht mehr über Kurviger und REVER mit dem Abstand, den
   CHF 49 hatte.
2. **Wer mit dem verglichen wird, was Strado wirklich ist — kuratierte
   Strecken, Wertung, Community —, landet höher.** Strava verlangt CHF 79.95
   und stellt genau die Ranglisten hinter die Schranke, die Strado gratis
   lässt. Dort ist CHF 39 günstig.
3. **Halbjahres- und Saisonpläne sind 2026 im Töffmarkt normal geworden**
   (calimoto 3 Monate, Detecht 6, Cardo 6, RideLink 6). Sie sind das
   Eingeständnis der Anbieter, dass im Winter gekündigt wird. Der Saisonpass
   nimmt diese Kündigung vorweg, statt sie jeden Herbst zu verlieren.

Nicht belegbar und deshalb nicht verwendet: Nutzerzahlen von The Drivers
(Herstellerangabe "20'000+"), Preise von The Drivers (nicht gefunden),
Churn-Daten für Töff-Apps (öffentlich nicht vorhanden).

---

## 3. Warum genau diese drei Zahlen

**CHF 39.00 im Jahr.** Unter jedem Anbieter mit Navigation ausser Kurviger und
REVER; gegenüber zwölf Monatszahlungen **53 % günstiger**, also erstmals ein
echtes Angebot. Der Betrag liegt über der Gebührenschwelle (Abschnitt 4) und
lässt Raum nach oben, falls je Offline-Karten dazukommen —
`docs/premium-plan.md` nennt dafür CHF 79.

**CHF 6.90 im Monat.** Angehoben, nicht gesenkt, und das ist der Punkt: der
Monatsplan ist die Tür für Unentschlossene, nicht der Plan, in dem jemand
bleiben soll. Bei CHF 4.90 war er die rechnerisch bessere Wahl für jeden, der
nur eine Saison fährt — jetzt ist er die teuerste. Wer zwei Monate probiert und
dann wechselt, hat CHF 13.80 bezahlt; das ist kein Verlust für uns und keiner
für ihn.

**CHF 29.00 für sechs Monate, ohne Verlängerung.** Die Antwort auf den Winter,
und die einzige Zahl hier mit direktem Vorbild: calimoto verlangt CHF 53 für
drei Monate. Sechs Monate ab Kauf statt eines festen Fensters (April bis
September), weil ein festes Fenster jeden bestraft, der im Juli kauft. Pro
Monat CHF 4.83 — günstiger als das Monatsabo, teurer als das Jahresabo. Genau
so soll es liegen: der Pass ist bequem, nicht billig.

**14 Tage gratis auf dem Jahresabo, einmal pro Konto.**
`docs/premium-plan.md` §6 hat einen Testzeitraum abgelehnt — mit der
Begründung, er verlange Mahnlogik und öffne eine Fläche für Kartentests. Beide
Einwände sind heute schwächer: die Mahnlogik steht (Kulanzfrist, `0059`, AGB
Ziff. 8), und Stripe verlangt bereits beim Abschluss ein Zahlungsmittel. Dafür
ist ein Argument dazugekommen: **fast jeder Wettbewerber gibt eine Testphase**
(7 Tage Kurviger, 14 REVER und Motobit, 1 Monat Liberty Rider), und ohne eine
steht Strado als das teurere, unbekanntere Produkt ohne Probe da. Nur auf dem
Jahresplan, weil ein Monat Probe dem Monatsabo entspricht und eine Probe auf
dem Pass ein halber Monat Saison wäre.

**Kein Club-Rabatt.** Kurviger gibt 15 % über IG Motorrad Schweiz, und der
Kanal wäre für Strado offen (Töffclubs, Fahrschulen, Händler — dieselbe Achse
wie `docs/marketing/`). Bewusst nicht jetzt: bei drei Abos ist ein
Rabattcode-System Aufwand ohne Wirkung, und ein Rabatt vor dem ersten
Vollpreisverkauf setzt den Anker falsch. Als Kanal bleibt es vorgemerkt.

---

## 4. Was ein Verkauf abwirft

Stripe-Gebühren für Schweizer Karten: 2.9 % + CHF 0.30, ausländische Karten
3.25 % + CHF 0.30, dazu 2 % Währungsumrechnung, wo sie anfällt
(`docs/premium-plan.md` §5.3 rechnet mit 3.6 % + CHF 0.30 als Mischsatz —
hier übernommen).

| Plan | Brutto | Gebühr (gemischt) | Netto | Anteil |
| --- | --- | --- | --- | --- |
| Monat | CHF 6.90 | CHF 0.55 | CHF 6.35 | 8.0 % |
| Jahr | CHF 39.00 | CHF 1.70 | CHF 37.30 | 4.4 % |
| Saisonpass | CHF 29.00 | CHF 1.34 | CHF 27.66 | 4.6 % |

Feste Kosten: rund CHF 41 im Monat (Vercel Pro, Supabase Pro, Domain/Mail —
`docs/premium-plan.md` §5.1). Gewinnschwelle daraus: **13 Jahresabos** (CHF
37.30 / 12 = 3.11 im Monat) oder **7 Monatsabos** oder **9 laufende
Saisonpässe**. Rechnet man Arbeitszeit mit, verschiebt sich das um eine
Grössenordnung; die Zahl ist die Infrastrukturschwelle, nicht der
Break-even eines Unternehmens.

MWST: steuerpflichtig ab CHF 100'000 Jahresumsatz, das sind rund 2'560
Jahresabos — nicht relevant. Alle Preise sind trotzdem **Bruttopreise inkl.
allfälliger MWST** ausgewiesen (Preisbekanntgabeverordnung), damit die
Steuerpflicht später keine Preiserhöhung erzwingt.

---

## 5. Bestandsschutz — die Stelle, an der es teuer werden kann

Wer heute CHF 4.90 oder CHF 49.00 zahlt, zahlt das weiter (AGB Ziff. 4.3).
Stripe bucht diese Abos unter der **alten Preis-ID** ab, und genau daran hängt
ein Fehler, der beim ersten Entwurf beinahe passiert wäre: die Anwendung
erkennt ein Abo als "eigenes" nur, wenn seine Preis-ID in einer
Umgebungsvariablen steht (`preisHerkunft()` in `lib/stripeWebhook.ts`).
Zeigten `STRIPE_PREMIUM_PRICE_ID_MONAT`/`_JAHR` nur noch auf die neuen Preise,
wäre jedes Ereignis der Bestandsabos **fremd**: Kündigungen, Zahlungsausfälle
und Verlängerungen liefen am Datenbankzustand vorbei, und Premium bliebe nach
einer Kündigung für immer an.

Deshalb gibt es `STRIPE_PREMIUM_PRICE_IDS_MONAT_BESTAND` und
`…_JAHR_BESTAND` (kommagetrennt). Beim Umstellen der Preise gehören die alten
IDs dort hinein — **im selben Schritt**, nicht danach.
`docs/premium-neu/rollout.md` führt die Reihenfolge.

---

## 6. Was den Preis später ändern würde

- **Offline-Karten oder Navigation** im Funktionsumfang → CHF 7.90/79.00
  wären vertretbar (calimoto-Niveau). Beides ist laut Konkurrenzanalyse §7
  nicht empfohlen.
- **Ein dichter Streckenbestand.** Der Preis steht heute auf einem Bestand von
  25 Strecken. Ab dreistellig trägt er sich aus dem Inhalt statt aus der
  Unterstützer-Erzählung — dann ist eine Erhöhung begründbar, vorher nicht.
- **Ausweitung über die Schweiz hinaus** → eigener Plan statt Erhöhung.
- **MWST-Pflicht** → Bruttopreis halten, 7.5 % Marge abgeben.
- **Erhöhungen gelten nur für neue Abschlüsse.** Bestandsabos behalten ihren
  Preis; technisch heisst das jedes Mal eine neue Price-ID und eine Zeile mehr
  in den BESTAND-Variablen.
