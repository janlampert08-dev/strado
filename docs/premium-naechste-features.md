# Premium nach der Rücknahme von `0077` — was als Nächstes hineingehört

Begleitdokument zur Migration `0086_strecken_anlegen_wieder_offen.sql`. Dort
fällt der bisher erste Vorteil („eigene Strecken erstellen") weg. Hier steht,
was an seine Stelle treten kann — als Plan, nicht als Umsetzung.

## Was Premium nach `0086` noch ist

| Funktion | Ohne Abo | Premium |
| --- | --- | --- |
| Strecken anlegen (öffentlicher Vorschlag) | unbegrenzt | unbegrenzt |
| Private Strecken | 1 | unbegrenzt |
| Fotos pro Fahrt | 6 | 12 |
| Offline gespeicherte Strecken | 3 | unbegrenzt |
| GPX-Export | eigene Fahrten | + kuratierte Strecken |

Das ist nicht nichts, aber es ist dünn — und drei der vier Punkte sind
Obergrenzen, die man erst spürt, wenn man die App schon intensiv nutzt. Ein
neues Konto sieht am ersten Tag keinen Grund zu zahlen.

## Die Regel, an der jeder Vorschlag zu messen ist

**Additives Gating** (`docs/premium-plan.md`, Abschnitt 4): Premium hebt
Obergrenzen an und legt Neues obendrauf; es nimmt nichts weg, was ein
kostenloses Konto vorher konnte. `0077` war der eine Bruch damit, und `0086`
nimmt ihn zurück.

Daraus folgt eine Einschränkung, die fast alle naheliegenden Ideen
aussortiert: **Was heute unbegrenzt ist, darf nicht nachträglich gedeckelt
werden.** „Ab dem dritten Fahrzeug kostet es" ist kein zulässiger Vorschlag,
solange Fahrzeuge heute unbegrenzt sind. Zulässig sind neue Fähigkeiten.

Zweitens: Was hier steht, ist Plan. `lib/premiumVorteile.ts` trägt im Kopf
die Regel, dass nur hineingehört, was es tatsächlich gibt — und die Liste
dort ist über AGB Ziff. 3.2 eine zugesagte Vertragsleistung. Ein Feature
wandert also erst in die Liste, wenn es läuft, und die AGB wird im selben
Schritt mitgezogen.

## Der eigentliche Hebel: die Saison

Es ist September. Ab November fährt in diesem Land praktisch niemand mehr
Motorrad, und auch die Sonntagsrunde im Auto wird selten. Ein Abo, dessen
Nutzen ausschliesslich beim Fahren entsteht, verliert im Winter seine
Begründung — und genau dann wird gekündigt.

**Die stärksten Premium-Funktionen sind deshalb die, die im Winter Wert
haben.** Nicht die, die beim Fahren helfen. Das ist der Massstab, nach dem
die folgende Reihenfolge sortiert ist.

---

## 1. Auswertung und Historie

Im Plan bereits als Premium vorgesehen („Statistiken: Jahresvergleich,
Auswertung pro Fahrzeug", Aufwand mittel). Jahresvergleich, Auswertung pro
Fahrzeug, Entwicklung auf derselben Strecke über eine Saison.

**Warum es passt:** Es wird mit der Zeit wertvoller — die einzige Eigenschaft,
die ein Abo wirklich trägt. Wer zwei Saisons drin hat, kündigt nicht, weil
der Vergleich dann erst entsteht. Und es hat im Winter Wert, wenn niemand
fährt. Keine Fremdkosten, die Daten liegen alle schon da.

**Blocker, der zuerst weg muss:** Audit-Befund **A1**
(`docs/audit/README.md#remediation-status`) ist offen. `dauer_sekunden` ist
eine client-gelieferte Uhr, der Deckungsgrad ist richtungsblind, und `INSERT`
auf `route_completions` ist der Rolle `authenticated` weiterhin gewährt — ein
direkter PostgREST-Schreibzugriff umgeht `lib/actions/completions.ts`
vollständig. Migration `0059` begrenzt, welche Werte eine Zeile tragen darf;
sie macht sie nicht serverseitig hergeleitet.

Statistiken sind das erste Feature, bei dem das zum Verkaufsversprechen wird.
Eine Auswertung auf Zahlen, die der Nutzer selbst schreiben kann, ist kein
Produkt, sondern eine Angriffsfläche. **A1 gehört vor dieses Feature.**

## 2. Saisonrückblick als Bild

Dieselbe Canvas-Maschinerie wie `lib/shareImage.ts`, einmal im Jahr: „deine
Saison 2026" — gefahrene Strecken, Kilometer, die Runde, die am häufigsten
vorkam.

**Warum es passt:** Es trifft genau den Monat, in dem ein Saison-Abo sonst
gekündigt wird, und es ist zugleich das am besten teilbare Objekt, das die
App erzeugen kann. Ein Rückblick, den jemand postet, ist Werbung im
Dezember — dem Monat, in dem sonst niemand über Strecken spricht.

**Aufwand:** klein bis mittel. `lib/shareImage.ts` und `lib/shareLayout.ts`
bestehen; es braucht eine Aggregation und ein zweites Layout.

**Abhängigkeit:** dieselbe wie oben — wenn die Zahlen nicht stimmen, stimmt
der Rückblick nicht.

## 3. Varianten des Teilen-Bildes

`lib/shareImage.ts` zeichnet heute genau ein Format (1080 × 1350). Premium
könnte anbieten: Story-Format 9:16, helle Variante, Auswahl, welche vier
Kennzahlen erscheinen.

**Warum es passt:** additiv im Reinformat — ohne Abo bleibt alles, wie es
ist. Keine Fremdkosten. Und es ist das einzige Premium-Feature auf dieser
Liste, das die Verbreitung der App **erhöht** statt sie unberührt zu lassen.

**Eine Grenze:** Die Wortmarke bleibt auf jeder Variante. Ein „Bild ohne
Branding" wäre die Funktion, die man sich selbst wegverkauft.

## 4. Erweiterte Filter — gebaut, aber noch nicht dran

`components/AdvancedFiltersPanel.tsx` existiert im Repo und wird nirgends
gerendert; der Plan führt es als Premium mit Aufwand „klein (nur einhängen)".

**Aber noch nicht:** Der Kommentar in `components/ExploreView.tsx` sagt, es
wartet, „bis der Bestand es wieder rechtfertigt". Bei acht freigegebenen
Strecken filtert niemand — eine Filterleiste über einer Liste, die auf einen
Bildschirm passt, ist ein leeres Versprechen. Dieses Feature wird gut, wenn
der Bestand dreistellig ist, und das ist genau der Bestand, den `0086`
freimachen soll.

## 5. Wetterfenster

Die Wetteranbindung besteht bereits. Premium: „wann ist diese Strecke diese
Woche trocken".

**Vorbehalt:** der einzige Vorschlag auf dieser Liste mit laufenden
Fremdkosten. Vor der Umsetzung gehört ausgerechnet, was eine Abfrage kostet
und wie oft sie anfiele — sonst wächst mit jedem Abonnenten eine Rechnung
mit, die der Abopreis tragen muss.

---

## Was nicht hinter die Paywall gehört

- **Öffentliche Streckenvorschläge.** Der Grund für `0086`. Sie sind der
  Inhalt, von dem die Plattform lebt.
- **Privatsphäre.** `lib/publicTrack.ts` und `lib/track.ts` schneiden
  Privatzonen aus geteilten GPS-Tracks — das ist die Grenze, an der
  Heimadressen hängen (Protected Area). Schutz verkauft man nicht.
- **Bestenlisten und Kernfunktionen.** AGB Ziff. 3.1 sagt dauerhaft
  kostenlos zu.
- **Eine Benachrichtigung „jemand hat deine Zeit unterboten".** Naheliegend,
  wirksam — und von den eigenen AGB untersagt. Ziff. 11.4 verbietet
  ausdrücklich „jedes Verhalten, das darauf zielt, eine angezeigte oder in
  einer Bestenliste geführte Zeit zu unterbieten", und Ziff. 11.3 hält fest,
  dass Strado „kein Wettbewerb um Geschwindigkeit" ist. Ein Feature, das
  genau dazu anstösst, widerspricht dem Rechtstext und jeder Kommunikation,
  die sich darauf stützt.

## Reihenfolge

1. **A1 schliessen** — nicht als Premium-Arbeit, sondern weil alles darauf
   aufbaut, was danach kommt.
2. **Auswertung und Historie** — der Kern.
3. **Saisonrückblick** — rechtzeitig vor Dezember, sonst verfällt er um ein
   Jahr.
4. **Varianten des Teilen-Bildes** — klein, jederzeit einschiebbar.
5. **Erweiterte Filter**, wenn der Streckenbestand es trägt.
6. **Wetterfenster**, wenn die Kostenrechnung steht.
