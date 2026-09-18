# Premium, neu geschnitten — 17. September 2026

Dieses Verzeichnis gehört zu einem Vorhaben: Premium hatte zu wenig Inhalt,
einen Jahresplan, der keiner war, und keine Antwort auf den Schweizer Winter.
Was hier steht, ist die Begründung; was im Code steht, ist die Umsetzung.

| Datei | Inhalt |
| --- | --- |
| [`preise.md`](preise.md) | CHF 6.90 / 39.00 / 29.00 — Marktvergleich vom 17.09.2026, Deckungsbeitrag, Bestandsschutz, was den Preis später ändern würde |
| [`features.md`](features.md) | Die neuen Funktionen, die Grenze zwischen gratis und bezahlt, was bewusst nicht gebaut wurde — und warum der Pass-Alarm wieder herausfiel |
| [`werbetexte.md`](werbetexte.md) | Kaufseite, Vorteilsliste, Hinweiszeilen (ausgeliefert) sowie Infoseite, Pflichtmitteilung und Kanäle (Vorlagen) |
| [`rollout.md`](rollout.md) | Die Reihenfolge: Stripe, Vercel, Migrationen, Merge, Rechtstexte, Infoseite |

## Die Entscheidung in vier Sätzen

- **Preise:** Monat CHF 6.90, Jahr CHF 39.00 (statt 49.00), neu ein
  **Saisonpass** zu CHF 29.00 für sechs Monate **ohne Verlängerung**, dazu
  **14 Tage gratis** auf dem Jahresabo, einmal pro Konto. Kein Club-Rabatt.
- **Funktionen:** Wetterfenster, Pass-Sammlung mit Saisonrückblick,
  Wartungsheft mit MFK-Erinnerung. Ein vierter Kandidat — der Pass-Alarm —
  ist gebaut und wieder zurückgezogen worden, weil parallel ein vollständiges
  Pass-System live ging (`features.md` §2).
- **Ton:** der Nutzen zuerst, die Unterstützung als zweiter Satz. Überschrift
  "Mehr aus jeder Saison".
- **Grenze:** Entdecken, Aufzeichnen, Strecken anlegen, Ranglisten, Feed und
  der **Passstatus** bleiben kostenlos. Bezahlt ist, was darüber hinausgeht.

## Woran sich das messen lassen muss

Die Zahl, die dieses Vorhaben am stärksten begrenzt, steht nicht im Code:
**25 Strecken, 14 Konten, 3 Abos** (Produktionsdatenbank, 17.09.2026). Drei
neue Funktionen machen aus einem dünnen Angebot ein dichtes — sie machen aus
einer leeren Karte keine volle. Eine Pass-Sammlung über eine einzelne
Passstrasse ist kein Erlebnis, und ein Pass-Alarm braucht Pässe.

Das ist kein Argument gegen diesen Ausbau: er verschiebt Premium von
"Obergrenzen, die man im zweiten Sommer spürt" zu "Gründen am ersten Tag", und
der Saisonpass nimmt die Kündigung vorweg, die sonst jeden Herbst kommt. Aber
die nächste Arbeit ist Streckenarbeit, nicht Produktarbeit.

## Verhältnis zu den älteren Dokumenten

- `docs/premium-plan.md` — Kostenmodell, Stripe-Mechanik, die ursprüngliche
  Preisempfehlung. Gilt weiter, ausser beim Preis: dort gilt `preise.md`.
- `docs/premium-naechste-features.md` — die Auswahl, aus der diese Funktionen
  stammen. Ihr Massstab ("was im Winter Wert hat") ist der Grund, warum es
  diese sind.
- `docs/premium-ausbau-plan.md` — die UI-Regeln, an die sich jede hält (ein
  Ort je Funktion, `BottomNav` unberührt, kein neues Muster). Seine vier
  geplanten Features (Abzeichen, GPX-Import, Garage, Sammlungen) sind damit
  teilweise erledigt: die Garage ist das Wartungsheft, der Rest bleibt offen.
- `docs/markt/konkurrenzanalyse-schweiz.md` — der Markt, gegen den der Preis
  geprüft ist. Abschnitt 6.5 (Preis) und 6.4 ("warum liegt die App auf dem
  Telefon, wenn keine Fahrt ansteht") sind die beiden Stellen, die dieses
  Vorhaben beantwortet.

## Stand am 18. September 2026

- **Datenbank:** `0110` (Saisonpass) und `0111` (Wartungsheft) sind
  eingespielt und nachgemessen, einschliesslich eines zurückgerollten
  Funktionstests für Kauf, Idempotenz, Anschlusskauf und Ablauf.
  `supabase/migrations/README.md` führt beides mit den Prüfabfragen.
- **Code:** auf `staging-premium-neu`, noch nicht gemergt.
- **Offen beim Eigentümer:** die drei Stripe-Preise anlegen und die fünf
  Umgebungsvariablen setzen (`rollout.md` §1 und §2). Bis dahin verkauft die
  App die alten Preise und zeigt keinen Saisonpass — der Plan verschwindet
  einfach, solange seine Preis-ID fehlt.
