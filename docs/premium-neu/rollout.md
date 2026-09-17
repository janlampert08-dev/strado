# Rollout: Premium-Ausbau und neue Preise

Die Reihenfolge ist nicht Geschmackssache. Jeder Schritt hier setzt den
vorherigen voraus, und zwei Schritte sind der Punkt, an dem Geld fliesst.

**Stand dieses Dokuments:** Schritte 1 und 2 sind vorbereitet, aber **nicht
ausgeführt** — der Stripe-Zugang dieser Sitzung ist lesend, und
Umgebungsvariablen bei Vercel sind über keine Programmierschnittstelle
erreichbar, die hier zur Verfügung steht. Beides macht der Eigentümer im
Dashboard.

---

## 0. Was im Repo liegt und noch nichts tut

Der Zweig `staging-premium-neu` enthält drei Migrationen (`0110` Saisonpass,
`0111` Wartungsheft, `0112` Passstatus/Pass-Alarm), den Code für vier neue
Funktionen, die neuen Kaufseiten-Texte und die Entwürfe der Rechtstexte.
**Keine Migration ist eingespielt, kein Preis ist umgestellt.** Solange die
Umgebungsvariablen auf die alten Preise zeigen, verkauft die Anwendung
weiterhin CHF 4.90/49.00 und bietet keinen Saisonpass an — der Plan
verschwindet einfach von der Kaufseite, wenn seine Variable leer ist
(`getPremiumAngebot()`).

---

## 1. Stripe: drei neue Preise anlegen

Im Live-Konto (`strado.ch`), am bestehenden Produkt **Strado Premium**
(`prod_V9O4ecSRP7RMA0`). Bestehende Preise **nicht** archivieren und **nicht**
ändern — Bestandsabos buchen unter ihnen weiter ab (AGB Ziff. 4.3).

| Plan | Betrag | Abrechnung | Steuerverhalten | Vorschlag `lookup_key` |
| --- | --- | --- | --- | --- |
| Monat | CHF 6.90 | wiederkehrend, monatlich | inklusive | `strado_premium_monat_690` |
| Jahr | CHF 39.00 | wiederkehrend, jährlich | inklusive | `strado_premium_jahr_3900` |
| Saisonpass | CHF 29.00 | **einmalig** | inklusive | `strado_premium_saisonpass_2900` |

Der Saisonpass ist ein **einmaliger** Preis. Ein wiederkehrender wäre der
Fehler, der das ganze Versprechen umdreht: die Anwendung behandelt ihn als
Einmalzahlung (`mode: "payment"`), und ein Abo auf dieser ID würde vom Webhook
als fremdes Produkt übersprungen.

Die bestehenden Preise zum Notieren (Stand 2026-09-17, aus dem Live-Konto
gelesen): Monat `price_1UD8K10XojvMPC10RR4tXbBd` (CHF 4.90), Jahr
`price_1UD8K30XojvMPC10gHNGUkin` (CHF 49.00). Der Gründerpreis läuft unter
seiner eigenen, hier nicht benötigten ID weiter.

**Für `staging`** dasselbe im Stripe-**Sandbox**-Konto anlegen. Die Sandbox ist
ein getrenntes Konto und hängt nicht am hier verbundenen Zugang; ohne die drei
Preise dort zeigt `staging` keine Kaufseite.

## 2. Vercel: Umgebungsvariablen umstellen

Für **Production** und **Preview/Staging** getrennt (Staging zeigt auf die
Sandbox-IDs).

| Variable | Neuer Wert |
| --- | --- |
| `STRIPE_PREMIUM_PRICE_ID_MONAT` | neue Monats-ID (CHF 6.90) |
| `STRIPE_PREMIUM_PRICE_ID_JAHR` | neue Jahres-ID (CHF 39.00) |
| `STRIPE_PREMIUM_PRICE_ID_SAISONPASS` | neue Pass-ID (CHF 29.00) |
| `STRIPE_PREMIUM_PRICE_IDS_MONAT_BESTAND` | `price_1UD8K10XojvMPC10RR4tXbBd` |
| `STRIPE_PREMIUM_PRICE_IDS_JAHR_BESTAND` | `price_1UD8K30XojvMPC10gHNGUkin` |

Die beiden BESTAND-Variablen sind **nicht optional**. Ohne sie gilt jedes
Ereignis der Abos zu CHF 4.90/49.00 als fremdes Produkt: Kündigung,
Zahlungsausfall und Verlängerung laufen am Datenbankzustand vorbei, und
Premium bleibt nach einer Kündigung an (`preisHerkunft()` in
`lib/stripeWebhook.ts`, Begründung in `docs/premium-neu/preise.md` §5).
`STRIPE_PREMIUM_PRICE_ID_GRUENDER` bleibt unverändert stehen.

**Wirksam wird die Änderung erst mit dem nächsten Deployment.** Diese
Variablen tragen kein `NEXT_PUBLIC_`, werden also zur Laufzeit gelesen — ein
Redeploy genügt, ein neuer Build ist nicht nötig, aber ohne Neustart der
Funktionen greift sie nicht zuverlässig. Wer die Preise vor dem Merge dieses
Zweigs umstellt, verkauft die neuen Preise mit dem alten Funktionsumfang; das
ist zulässig, aber dann darf die Infoseite nicht hinterherhängen (Schritt 6).

## 3. Migrationen einspielen — Schema vor Code

In dieser Reihenfolge, jede einzeln und mit den Prüfungen aus
`supabase/migrations/README.md`:

1. **`0110_saisonpass.sql`** — ersetzt `apply_subscription_state` (Rumpf aus
   `0062`), `premium_abgleich` (aus `0059`) und `anonymize_account` (aus
   `0092`). **Vorher** die Live-Rümpfe auslesen und vergleichen; ist
   `0101_anonymisierung_fahrtstarts` (PR #255) schon eingespielt, dessen
   Zusatz in diese Fassung übernehmen, sonst dreht `0110` ihn zurück.
2. **`0111_wartungsheft.sql`** — zwei private Tabellen plus ein zusätzlicher
   Unique-Index auf `vehicles (id, user_id)`.
3. **`0112_pass_status_und_alarm.sql`** — ersetzt `count_unseen_activity` und
   `mark_activity_seen` (Rümpfe aus `0100`), vorher vergleichen.

Warum Schema zuerst: `getPremiumStatus()` liest `saisonpaesse` auf jeder Seite
mit Premium-Bezug, `/aktivitaet` und jede Passstrecke lesen `0112`, und die
Fahrzeugseite liest `0111`. Ein Query-Fehler gilt in diesem Code nicht als
"nichts da" (`lib/queryError.ts`), sondern als Fehler — der Code ohne Schema
liefert also Fehlerseiten.

## 4. Code mergen

`staging-premium-neu` → `staging` (PR), auf `staging.strado.ch` testen, dann
im Sammelzug nach `main` (Release Flow in AGENTS.md).

Auf `staging` mindestens einmal durchspielen, mit einem Konto ohne
Vorgeschichte, gegen die Sandbox:

- Jahresabo mit Testphase: Schaltfläche zeigt "Gratis testen — ab <Datum>
  CHF 39.00", Abschlussseite zeigt "gratis bis <Datum>", Profil zeigt
  "gratis bis".
- Saisonpass: Schaltfläche "Zahlungspflichtig kaufen — CHF 29.00", danach
  Profil "Saisonpass · gültig bis <Datum>", Knopf "Rechnung ansehen".
- Saisonpass zweimal kaufen: der zweite muss abgewiesen werden, solange mehr
  als 30 Tage Restlaufzeit bestehen.
- Mit laufendem Pass ein Abo abschliessen: "erste Zahlung am <Passende>".
- TWINT einmal mit Weiterleitung, weil nur dort die Rückkehr über
  `?sitzung=` läuft.
- Eine Erstattung im Stripe-Dashboard: der Pass muss danach als erstattet
  gelten und Premium fallen (Webhook `charge.refunded`).

## 5. AGB und Datenschutz in Kraft setzen

`docs/rechtstexte/agb.md` trägt die Änderungen als **Entwurf**; Ziff. 14.1
verlangt **30 Tage** Vorlauf per E-Mail **und** in der App, mit Hinweis auf
Zustimmungsfiktion und Widerspruchsrecht. Es liegt bereits ein zweiter,
unveröffentlichter Entwurf vor (Ziff. 11.4/12.6, Stand 15.09.2026) — **beide
gehören in dieselbe Mitteilung**. Vorlage für die Mail:
`docs/premium-neu/werbetexte.md`.

Bis zum Inkrafttreten bleibt die veröffentlichte HTML-Fassung im Repo
`janlampert08-dev/stradoinfo` auf ihrem Stand. Am Tag des Inkrafttretens
gehören dorthin: die neuen AGB, der neue Datenschutzabschnitt (Wartungsheft,
Pass-Alarm, Saisonpass, Sieben-Tage-Vorhersage) und die neuen Preise.

**Das ist die eine Reihenfolge, die unangenehm ist:** Preise und
Funktionsumfang dürfen technisch vor dem Inkrafttreten der AGB live gehen, und
der Eigentümer hat das so entschieden. Wer neu kauft, kauft dann zu den neuen
Preisen unter einer AGB, die die alten nennt. Sauber ist es erst, wenn beides
zusammenfällt; wo es auseinanderfällt, ist die Kaufseite selbst die
verbindliche Angabe — sie nennt Betrag, Laufzeit und Verlängerung vor der
Schaltfläche, und genau das verlangt die Preisbekanntgabeverordnung.

## 6. Infoseite

`janlampert08-dev/stradoinfo`: Preisblock und `Offer`-Schema (CHF 4.90/49.00 →
6.90/39.00 plus Saisonpass 29.00), Premium-Abschnitt nach der Vorlage in
`werbetexte.md`. **Am selben Tag wie Schritt 2** — eine öffentliche Seite, die
einen anderen Preis nennt als die Kasse, ist ein falsch ausgezeichneter Preis.

## 7. Danach

- **Open-Meteo-Lizenz** klären (kommerzielle Nutzung, rund CHF 27/Monat).
- **TCS-Abgleich** prüfen, bevor er gebaut wird (`features.md` §2).
- **Streckenbestand.** 25 Strecken tragen keine Pass-Sammlung. Das ist die
  Arbeit, die nach diesem PR zählt.
- **Die Kachel "Pässe befahren"** umbenennen (eigener PR).
- **Web-Push** für den Pass-Alarm, wenn der Rest steht.
