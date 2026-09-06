# Premium-Abo: Umsetzungsplan

Status: Entwurf zur Entscheidung. Dieses Dokument beschreibt, **was** gebaut
wird, **in welcher Reihenfolge**, und **zu welchem Preis** das Abo verkauft
werden sollte. Es ändert selbst keinen Code.

Alle Preis- und Kostenangaben Dritter sind Stand September 2026 und mit
Quellenangabe versehen — sie ändern sich, vor dem Launch bitte am jeweiligen
Preisblatt gegenprüfen. Wechselkurs im Modell: 1 USD ≈ CHF 0.80, 1 EUR ≈ CHF 0.94.

---

## 1. Zusammenfassung

Die Zahlungsanbindung existiert bereits und ist funktionsfähig, aber die
Premium-Oberfläche ist vollständig deaktiviert (auskommentiert, nicht gelöscht)
und die serverseitige Rechteprüfung ist überall abgeschaltet. Der Weg zum Launch
ist deshalb **kein Greenfield-Projekt**, sondern:

1. eine Handvoll echter Korrektheitsfehler im Webhook-Pfad beheben (Abschnitt 3),
2. eine Abo-Zustandstabelle einführen, weil `profiles.ist_premium` (ein blankes
   Boolean) für einen nahtlosen Lebenszyklus nicht ausreicht,
3. die vorhandene UI reaktivieren und um Planwahl/TWINT erweitern,
4. das Feature-Gating **additiv** wieder einschalten, mit Bestandsschutz.

**Preisempfehlung:** CHF 4.90/Monat, CHF 49.00/Jahr (2 Monate gratis),
Gründerpreis CHF 39.00/Jahr für die ersten 100 Abos, dauerhaft preisgebunden.
Kein Gratis-Testzeitraum zum Start, dafür 14 Tage Geld-zurück auf Zuruf.
Herleitung in Abschnitt 6.

**Härtester Blocker:** `lib/constants.ts` verweist für Impressum/Datenschutz/AGB
auf `https://xyz.ch/...`. Ohne echte Rechtstexte darf kein Geld eingezogen
werden, und TWINT verlangt sie ausdrücklich für die Freischaltung.

---

## 2. Ausgangslage (auditiert)

### Was bereits existiert und funktioniert

| Baustein | Ort | Zustand |
| --- | --- | --- |
| Stripe-Server-SDK | `lib/stripe.ts` | aktiv, ohne `apiVersion`-Pinning |
| Stripe-Client-SDK | `lib/stripeClient.ts` | vorhanden, nur von auskommentiertem Code referenziert |
| Abo anlegen (Payment Element) | `lib/actions/billing.ts` → `createSubscriptionIntent` | funktionsfähig |
| Abo verifizieren nach Zahlung | `lib/actions/billing.ts` → `confirmSubscription` | funktionsfähig, prüft Status **und** bezahlte Rechnung |
| Kundenportal | `lib/actions/billing.ts` → `createPortalSession` | funktionsfähig |
| Webhook inkl. Signaturprüfung | `app/api/stripe/webhook/route.ts` | aktiv, Signatur wird geprüft |
| Idempotenz-Tabelle | `supabase/migrations/0026_*` | vorhanden (`stripe_webhook_events`) |
| Datenmodell | `profiles.ist_premium`, `profiles.zeigt_premium_badge`, `profiles.stripe_customer_id`, `routes.ist_privat` | vorhanden |
| Spalten-Grants gehärtet | `0027_*`, `0034_*` | `ist_premium` nur lesbar, nicht schreibbar; `stripe_customer_id` weder noch |
| Badge in Views vorverrechnet | `0027_*` | Views geben `ist_premium AND zeigt_premium_badge` aus, nie den Rohstatus |

### Was abgeschaltet ist

| Ort | Abschaltung |
| --- | --- |
| `components/PremiumCard.tsx` | Datei vollständig auskommentiert |
| `components/PremiumPurchaseView.tsx` | Datei vollständig auskommentiert |
| `components/PremiumCheckoutForm.tsx` | Datei vollständig auskommentiert |
| `app/profil/premium/page.tsx` | leitet auf `/profil` um |
| `app/profil/page.tsx` | Import der `PremiumCard` entfernt |
| `lib/leaderboard.ts:50,179` | `isPremiumBadge: false` hart verdrahtet |
| `lib/actions/profile.ts:85` | `zeigt_premium_badge: false` hart überschrieben |
| `lib/actions/routes.ts:219–224` | Premium-Prüfung für private Strecken entfernt — **private Strecken sind heute für alle offen** |

### Was fehlt

- **Kein Abo-Zustand.** `ist_premium` kennt nur an/aus. Kein Status, kein
  Periodenende, kein „gekündigt, läuft noch bis …“, kein Plan, keine Kulanzfrist
  bei fehlgeschlagener Zahlung. Das ist der Hauptgrund, warum sich Premium heute
  nicht „nahtlos“ anfühlen kann.
- Kein Jahresplan (nur eine `STRIPE_PREMIUM_PRICE_ID`).
- Kein TWINT, keine Wallets.
- Keine Kündigung des Stripe-Abos bei Kontolöschung.
- Keine Tests für den Webhook-Reducer (nur `lib/stripeWebhook.test.ts` für die
  Idempotenz-Hilfsfunktion).

---

## 3. Korrektheitsfehler, die vor dem Launch weg müssen

Diese sind aus dem bestehenden Code gelesen, nicht hypothetisch. Sie betreffen
alle geschützte Bereiche (`/app/api/stripe/`, `/lib/actions/billing.ts`).

**3.1 Idempotenz-Marker wird vor der Verarbeitung gesetzt.**
`wasAlreadyProcessed()` schreibt die Event-ID *bevor* die Seiteneffekte laufen
(`lib/stripeWebhook.ts`). Schlägt danach das `UPDATE` fehl, ist das Event
dauerhaft als „erledigt“ markiert und Stripes Wiederholung wird stumm
verworfen. Ergebnis: ein zahlender Nutzer bleibt ohne Premium, ohne Fehlerbild.
→ Marker in zwei Phasen (`processing` → `completed`) mit Wiederaufnahme nach
Zeitablauf, oder Marker erst nach erfolgreichem Seiteneffekt in derselben
Transaktion.

**3.2 Webhook meldet Erfolg, obwohl der Schreibvorgang scheiterte.**
`setPremium()` loggt den Fehler nur (`console.error`) und der Handler antwortet
`200`. Stripe wiederholt deshalb nicht. → Bei Schreibfehler `500` zurückgeben
und den Idempotenz-Marker nicht als abgeschlossen hinterlassen.

**3.3 Keine Absicherung gegen Ereignisse in falscher Reihenfolge.**
Stripe garantiert keine Reihenfolge. Ein spät zugestelltes
`customer.subscription.updated` (Status `active`) nach einem bereits
verarbeiteten `customer.subscription.deleted` schaltet Premium wieder ein.
→ Bei jedem Abo-Event den Zustand frisch von Stripe holen
(`subscriptions.retrieve`) und schreiben, statt der Nutzlast zu vertrauen;
zusätzlich `event.created` bzw. die Stripe-seitige Version gegen den zuletzt
geschriebenen Stand prüfen.

**3.4 Jeder Aufruf von `createSubscriptionIntent()` legt ein neues Abo an.**
Wer die Kaufseite zweimal öffnet oder neu lädt, erzeugt zwei `incomplete`-Abos;
bezahlt er beide, laufen zwei Abos parallel auf denselben Customer.
→ Vor dem Anlegen bestehende `active`/`trialing`/`incomplete`-Abos des Customers
prüfen und wiederverwenden; Stripe-Idempotenzschlüssel setzen.

**3.5 Kontolöschung kündigt das Abo nicht.**
`0058_kontoloeschung_werte_nullen.sql` nullt `stripe_customer_id` und setzt
`ist_premium = false` — das laufende Stripe-Abo bleibt bestehen und bucht
weiter ab. Danach findet der Webhook das Profil nicht mehr (der Zeiger ist
weg), die Belastung läuft also unsichtbar weiter.
→ Vor der Anonymisierung serverseitig `subscriptions.cancel()` aufrufen (SQL
kann Stripe nicht erreichen, das muss in der Server Action passieren) und die
Löschung nur fortsetzen, wenn die Kündigung bestätigt ist.

**3.6 Nicht abgedeckte Ereignisse.**
Behandelt werden `checkout.session.completed` (wird vom heutigen
Payment-Element-Fluss gar nicht mehr erzeugt), `customer.subscription.updated`
und `.deleted`. Es fehlen `customer.subscription.created`, `invoice.paid`,
`invoice.payment_failed` und `customer.subscription.paused/resumed`. Ohne
`invoice.payment_failed` gibt es keine Kulanzfrist und keine Mahnlogik.

**3.7 Keine API-Version gepinnt.**
`lib/stripe.ts` nutzt die Dashboard-Standardversion. `confirmation_secret` (statt
des früheren `payment_intent`) hängt genau an dieser Version — eine
Versionsumstellung im Dashboard bricht den Checkout ohne Deploy. → Pinnen.

---

## 4. Produktumfang: was Premium ist

### Leitregel: additives Gating

Alles, was ein kostenloser Nutzer heute kann, kann er nach dem Launch weiterhin.
Premium hebt Obergrenzen an und legt Neues obendrauf. Das ist keine Feinheit:
Kernregel 16 der Verfassung verbietet stilles Ändern von Geschäftsregeln, und
ein Entzug bestehender Funktionen kostet mehr Vertrauen, als das Abo einbringt.

**Eine begründete Ausnahme:** private Strecken sind heute ungetestet offen
(`lib/actions/routes.ts:219`). Sie sind das einzige Feature mit echtem
Premium-Charakter. Vorschlag: kostenlos **eine** private Strecke (damit die
Funktion erlebbar bleibt), Premium unbegrenzt — und wer vor dem Stichtag bereits
mehrere angelegt hat, behält sie alle und darf sie weiter bearbeiten und
veröffentlichen (Bestandsschutz, nur das Neuanlegen ist begrenzt).

### Funktionsumfang

| Funktion | Kostenlos | Premium | Aufwand | Zusätzliche Fremdkosten |
| --- | --- | --- | --- | --- |
| Private Strecken | 1 | unbegrenzt | klein (Zähler + Gate) | keine |
| Gold-Abzeichen (Opt-in) | – | ja | klein (Reaktivierung) | keine |
| Offline-Strecken (`lib/offlineRoutes.ts`) | 3 | unbegrenzt | klein | keine (IndexedDB, rein lokal) |
| Erweiterte Filter (`AdvancedFiltersPanel.tsx`, gebaut, ungenutzt) | – | ja | klein (nur einhängen) | keine |
| GPX-Export kuratierter Strecken (`lib/gpx.ts`) | eigene Fahrten | + kuratierte Strecken | klein | keine |
| Fotos pro Fahrt (`MAX_PHOTOS`) | 6 (wie heute) | 12 | klein | Storage, vernachlässigbar |
| Statistiken: Jahresvergleich, Auswertung pro Fahrzeug | – | ja | mittel | keine |
| Streckenvorschlag mit Vorrang in der Moderation | – | ja | klein | Zeit des Betreibers |

Bewusst **nicht** hinter die Bezahlschranke: Entdecken, Fahrt starten, GPS-
Aufzeichnung, Fahrt posten, Kudos, Bewertungen, Bestenlisten, Feed. Das ist die
Kernschleife aus AGENTS.md; jede Schranke darin senkt genau die Aktivität, aus
der die Zahlungsbereitschaft überhaupt erst entsteht.

Kein Premium-Feature in dieser Liste erzeugt zusätzliche Aufrufe externer APIs.
Das ist Absicht: die Grenzkosten pro Abonnent bleiben so praktisch bei null
(Abschnitt 5).

### Positionierung

Der Funktionsumfang allein trägt CHF 4.90 nicht — ehrlicherweise ist das ein
Unterstützer-Abo mit Vergünstigungen. Genau so sollte es auch benannt werden
(„Cornice unterstützen", Abzeichen als sichtbarer Dank). Das erhöht die
Zahlungsbereitschaft bei dünnem Funktionsumfang und vermeidet den Reflex,
zunehmend Kernfunktionen einzuzäunen, um den Preis zu rechtfertigen.

---

## 5. Kostenmodell

### 5.1 Fixkosten pro Monat

| Posten | Kosten | Anmerkung |
| --- | --- | --- |
| Vercel Pro | $20 ≈ CHF 16 | **Pflicht ab dem ersten Franken Umsatz** — Hobby ist nicht für kommerzielle Nutzung lizenziert |
| Supabase Pro | $25 ≈ CHF 20 | 8 GB DB, 100 GB Storage, 250 GB Egress, 100k MAU inklusive |
| Domain + Mail | ≈ CHF 5 | |
| Mapbox | CHF 0 | innerhalb der Freikontingente, siehe 5.2 |
| **Summe** | **≈ CHF 41** | |
| Open-Meteo Commercial (bedingt) | ≈ CHF 27 | siehe 5.4 |

### 5.2 Grenzkosten pro aktivem Nutzer und Monat

Annahmen für einen aktiven Nutzer: 15 Streckendetail-Aufrufe, 12 Kartensitzungen,
4 Fahrten, 15 Fotos, ~200 MB Egress.

| Posten | Menge | Preis über Freikontingent | Kosten |
| --- | --- | --- | --- |
| Mapbox Tilequery (Verkehr) | 15 Aufrufe × ~15 Stichproben = 225 | ~$1.00/1000 | **$0.225** |
| Mapbox Map Loads (Web) | 12 Sitzungen | ~$5.00/1000 | $0.060 |
| Mapbox Directions + Geocoding | ~1 Streckenvorschlag | ~$2.00/1000 | $0.002 |
| Supabase Egress | 0.2 GB | $0.09/GB | $0.018 |
| Supabase Storage (Zuwachs) | 0.023 GB | $0.021/GB | $0.0005 |
| **Summe** | | | **≈ $0.31 ≈ CHF 0.25** |

Solange die Freikontingente reichen, sind das **CHF 0.00**. Die Kontingente
reichen bis:

- **Tilequery: ~440 aktive Nutzer/Monat** (100'000 ÷ 225) — die erste und mit
  Abstand engste Decke.
- Map Loads: ~4'100 aktive Nutzer/Monat (50'000 ÷ 12).
- Supabase Egress: ~1'250 aktive Nutzer/Monat (250 GB ÷ 0.2 GB).

`components/RouteDetailMap.tsx` fragt 6–24 Punkte pro Streckenaufruf ab
(`SAMPLES_PER_KM = 1.2`), unabhängig davon, ob dieselbe Strecke Sekunden vorher
schon abgefragt wurde. Ein serverseitiger Cache pro Strecke mit 5–10 Minuten
Gültigkeit teilt diese Kosten durch die Anzahl gleichzeitiger Betrachter und
verschiebt die Decke um eine Grössenordnung. **Das ist der wirksamste
Kostenhebel im ganzen Projekt und liegt ausserhalb des Premium-Themas** — hier
nur als Befund vermerkt, nicht als Teil dieses Vorhabens.

### 5.3 Zahlungsgebühren (Stripe Schweiz)

Schweizer Karten 2.9 % + CHF 0.30; ausländische Karten 3.25 % + CHF 0.30;
Währungsumrechnung + 2 %; Stripe Billing nutzungsbasiert 0.7 % des
Abo-Volumens. Für ein CHF-Abo mit Schweizer Karte also **3.6 % + CHF 0.30**.

| Plan | Bruttopreis | Gebühr | Anteil |
| --- | --- | --- | --- |
| Monat | CHF 4.90 | CHF 0.48 | **9.7 %** |
| Jahr | CHF 49.00 | CHF 2.06 | **4.2 %** |
| Jahr (Gründerpreis) | CHF 39.00 | CHF 1.70 | 4.4 % |

Die fixen 30 Rappen sind bei einem Kleinbetrags-Abo der teuerste Einzelposten —
sie allein kosten beim Monatsabo 6.1 % des Umsatzes. Das ist das stärkste
betriebswirtschaftliche Argument für den Jahresplan, unabhängig von Churn und
Liquidität.

### 5.4 Bedingte Kosten und Lizenzfragen

- **Open-Meteo** (`lib/weather.ts`) ist gratis nur für nichtkommerzielle
  Nutzung. Sobald Cornice Geld einnimmt, ist die Lage mindestens auslegungs-
  bedürftig. Vor dem Launch klären und im Zweifel den kommerziellen Tarif
  (≈ CHF 27/Monat) buchen. Kein Blocker für den Code, aber einer für den Launch.
- **geo.admin.ch Höhenprofil** (`lib/elevation.ts`): Nutzungsbedingungen der
  Bundesgeodaten auf kommerzielle Nutzung und Abfragevolumen prüfen.
- **MWST:** Steuerpflicht ab CHF 100'000 weltweitem Jahresumsatz, Normalsatz
  8.1 %. Das entspricht ~1'700 Jahresabos — vorerst nicht relevant. Der Preis
  muss trotzdem **von Anfang an als Bruttopreis inkl. MWST** kommuniziert
  werden (Preisbekanntgabeverordnung), damit die spätere Steuerpflicht keine
  Preiserhöhung erzwingt, sondern 7.5 % Marge kostet. Im Modell unten bereits
  als Reserve mitgedacht.

### 5.5 Deckungsbeitrag und Gewinnschwelle

| | Monatsabo CHF 4.90 | Jahresabo CHF 49.00 |
| --- | --- | --- |
| Bruttoumsatz pro Monat | 4.90 | 4.08 |
| ./. Stripe | −0.48 | −0.17 |
| ./. Infrastruktur (Grenzkosten) | −0.25 | −0.25 |
| **Deckungsbeitrag** | **CHF 4.17 (85 %)** | **CHF 3.66 (90 %)** |
| Gewinnschwelle bei CHF 41 Fixkosten | **10 Abos** | **12 Abos** |
| Gewinnschwelle inkl. Open-Meteo (CHF 68) | 17 Abos | 19 Abos |

Der eigentliche Kostenblock ist nicht die Infrastruktur, sondern die
**Kuratierung und Moderation** — die Zeit, die in geprüfte Strecken fliesst.
Rechnet man dafür auch nur 4 Stunden pro Monat zu CHF 60 an, verschiebt sich
die Gewinnschwelle auf ~66 Abos. Das ist die realistische Zielmarke, nicht die
10 aus der Infrastrukturrechnung. Der Preis muss deshalb nach Wert und Markt
gesetzt werden, nicht nach Serverkosten.

---

## 6. Preisempfehlung

### Marktvergleich

| Produkt | Preis | Einordnung |
| --- | --- | --- |
| Kurviger Tourer+ | €29.99/Jahr ≈ CHF 28 | Navigation + Offline-Karten |
| REVER Pro | $39.99/Jahr ≈ CHF 32 | Routenplanung + Tracking |
| Calimoto Premium | €59.99/Jahr ≈ CHF 56 | Vollnavigation, grosse Nutzerbasis |
| Strava | ≈ CHF 8–10/Monat | Referenz für „Community-Abo" |

Cornice bietet weniger Funktion als alle drei Motorrad-Apps (keine Navigation,
keine Offline-Karten), aber etwas, das keine von ihnen hat: **kuratierte,
geprüfte Strecken für einen konkreten Raum**, plus Community-Mechanik. Der
Preis sollte deshalb unter Kurviger liegen und über die Unterstützer-Erzählung
getragen werden, nicht über einen Funktionsvergleich.

### Empfehlung

| Plan | Preis | Begründung |
| --- | --- | --- |
| **Monat** | **CHF 4.90 inkl. MWST** | Zahl steht bereits in der (auskommentierten) Oberfläche; niedrige Einstiegshürde, klarer Vergleich zu „ein Kaffee" |
| **Jahr** | **CHF 49.00 inkl. MWST** | 2 Monate gratis (−17 %), Standardrabatt; senkt die Gebührenlast von 9.7 % auf 4.2 % und die Kündigungsentscheidungen von 12 auf 1 pro Jahr |
| **Gründerpreis Jahr** | **CHF 39.00**, dauerhaft preisgebunden, erste 100 Abos | Erzeugt Dringlichkeit ohne Rabattschleife, belohnt frühe Unterstützer, bleibt über der Gebührenschwelle |

**Kein Gratis-Testzeitraum zum Start.** Ein Trial verlangt Mahnlogik,
Trial-Ende-Kommunikation und öffnet eine Fläche für Kartentests — Aufwand und
Risiko, bevor überhaupt bekannt ist, ob jemand zahlen will. Stattdessen: **14
Tage Geld-zurück auf Anfrage**, per Hand über das Stripe-Dashboard erstattet.
Null Code, in der Praxis konversionsstark, jederzeit zurücknehmbar. Der Webhook
akzeptiert `trialing` bereits, ein Trial lässt sich also später ohne
Codeänderung nachrüsten.

**Zahlungsmittel:** Karten + Apple Pay/Google Pay + **TWINT**. TWINT unterstützt
laut Stripe-Dokumentation wiederkehrende Zahlungen und Abos (Maximalbetrag CHF
5'000) und ist im Schweizer Markt der wichtigste Konversionshebel überhaupt.
Voraussetzung ist die TWINT-Freischaltung, die eine erreichbare Website mit
Firmenname, vollständiger Adresse und Kontaktangaben in Impressum/AGB verlangt —
siehe Blocker in Abschnitt 8.

### Was den Preis später ändern würde

- Offline-Karten oder Navigation im Funktionsumfang → CHF 7.90/79.00 wären
  vertretbar (Calimoto-Niveau).
- Ausweitung über die Schweiz hinaus → separater Regionen- oder Weltplan statt
  Preiserhöhung.
- MWST-Pflicht → Bruttopreis halten, 7.5 % Marge abgeben (siehe 5.4).
- Preiserhöhungen gelten **nur für Neuabos**; Bestandsabos behalten ihren Preis
  (Stripe: neue Price-ID statt Änderung der bestehenden).

---

## 7. Umsetzung in Phasen

Jede Phase ist für sich abschliessbar und einzeln zu mergen. Migrationen laufen
**nicht** automatisch (`supabase/migrations/README.md`) — wer eine schreibt,
spielt sie ein, vor dem Deploy des Codes, der sie braucht.

### Phase 0 — Voraussetzungen (kein Anwendungscode)

1. Rechtstexte veröffentlichen und `LEGAL_URLS` in `lib/constants.ts` auf die
   echte Domain zeigen lassen. AGB brauchen mindestens: Laufzeit, automatische
   Verlängerung, Kündigungsfrist, Preis inkl. MWST, Erstattungsregel.
2. Stripe: Produkt „Cornice Premium" mit drei Preisen (Monat 4.90, Jahr 49.00,
   Gründer 39.00, alle CHF, wiederkehrend). TWINT im Dashboard beantragen.
3. Vercel auf Pro heben (Lizenzpflicht ab Umsatz).
4. Open-Meteo-Lizenzfrage klären (5.4).
5. Webhook-Endpunkt in Production registrieren, Ereignisliste aus 3.6.

### Phase 1 — Abo-Zustand und Webhook-Korrektheit (geschützter Bereich)

**Migration `0059_premium_abo_zustand.sql`:**

```sql
create table public.subscriptions (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  stripe_subscription_id text unique not null,
  stripe_customer_id text not null,
  status text not null,              -- Stripe-Status, unverändert gespiegelt
  price_id text not null,
  current_period_end timestamptz not null,
  cancel_at_period_end boolean not null default false,
  kulanz_bis timestamptz,            -- gesetzt bei past_due, siehe unten
  stripe_updated_at timestamptz not null,  -- Schutz gegen Events ausser der Reihe
  updated_at timestamptz not null default now()
);
alter table public.subscriptions enable row level security;
-- Keine Policy für anon/authenticated: ausschliesslich über den
-- Service-Role-Client erreichbar, wie stripe_webhook_events (0026).
```

`profiles.ist_premium` bleibt **die einzige Lesequelle** für die Anwendung —
alle bestehenden Views, Policies und Abfragen hängen daran. Der Webhook leitet
den Wert aus der `subscriptions`-Zeile ab und schreibt ihn:

```
ist_premium = status in ('active','trialing')
           or (status = 'past_due' and now() < kulanz_bis)
```

**Webhook-Umbau** (`app/api/stripe/webhook/route.ts`):

- Reducer als reine Funktion nach `lib/stripeWebhook.ts` ziehen:
  `Stripe.Subscription → { istPremium, status, periodEnd, … }`. Damit ist der
  Zustandsübergang ohne Netzwerk oder Datenbank testbar.
- Bei jedem Abo-Ereignis den Zustand frisch von Stripe holen statt der Nutzlast
  zu vertrauen (behebt 3.3).
- `stripe_updated_at` als Wächter: ältere Ereignisse werden verworfen.
- Idempotenz zweiphasig (behebt 3.1); `500` bei Schreibfehler (behebt 3.2).
- Ereignisse ergänzen (3.6). `invoice.payment_failed` setzt
  `kulanz_bis = now() + 7 Tage` und lässt Premium bestehen.
- `checkout.session.completed` entfernen — dieser Fluss existiert nicht mehr.

**Tests (`lib/stripeWebhook.test.ts` erweitern):** Reducer je Status;
Wiederholung desselben Events; Event ausser der Reihe; `past_due` innerhalb und
ausserhalb der Kulanzfrist; Schreibfehler → `500`.

### Phase 2 — Berechtigungsschicht

Neu: `lib/premium.ts` als einzige Antwort auf „darf dieser Nutzer X?".

```ts
export type PremiumStatus = {
  aktiv: boolean;
  plan: "monat" | "jahr" | null;
  laeuftAbAm: Date | null;      // gekündigt, aber noch gültig
  inKulanzfrist: boolean;       // Zahlung offen, Zugang bleibt
};
export async function getPremiumStatus(userId: string): Promise<PremiumStatus>;
export async function requirePremium(userId: string): Promise<boolean>;
```

Kein Aufrufer prüft `ist_premium` direkt. Grenzwerte (1 private Strecke, 3
Offline-Strecken, 6 Fotos) liegen als benannte Konstanten in `lib/premium.ts`,
nicht verstreut in Komponenten.

### Phase 3 — Kauf-Oberfläche

- `components/PremiumCard.tsx`, `PremiumPurchaseView.tsx`,
  `PremiumCheckoutForm.tsx` und `app/profil/premium/page.tsx` reaktivieren
  (Kommentare entfernen, nicht neu schreiben).
- Planwahl (Monat/Jahr) ergänzen; `createSubscriptionIntent(plan)` nimmt die
  Price-ID aus einer serverseitigen Zuordnung entgegen — **nie** eine vom
  Client übergebene Price-ID verwenden.
- Doppelte Abos verhindern (3.4).
- TWINT und Wallets über das Payment Element aktivieren (Dashboard-seitig, keine
  Codeänderung nötig — dynamische Zahlungsmethoden).
- Erfolgszustand hängt an `confirmSubscription()` (existiert bereits), nicht am
  Webhook: der Nutzer sieht Premium sofort, auch wenn das Ereignis Sekunden
  später eintrifft.
- Fehlerbilder ausformulieren: Karte abgelehnt, 3-D-Secure abgebrochen,
  TWINT-Zeitüberschreitung, doppelter Rückweg.

### Phase 4 — Feature-Gating (Geschäftsregeln, explizit)

- `lib/actions/routes.ts`: Premium-Prüfung wieder einschalten, mit Freikontingent
  1 und Bestandsschutz (Migration `0060_private_strecken_bestandsschutz.sql`
  markiert Konten mit ≥ 1 privaten Strecke zum Stichtag).
- `lib/leaderboard.ts`: `isPremiumBadge` aus der View lesen statt `false`.
- `lib/actions/profile.ts`: `zeigt_premium_badge` wieder aus dem Formular
  übernehmen, serverseitig gegen `ist_premium` geprüft.
- Offline-, Foto- und Filtergrenzen aus `lib/premium.ts`.
- **Alle Grenzen serverseitig durchsetzen.** Ein Clientlimit ist eine
  Anzeigehilfe, keine Schranke.

### Phase 5 — Lebenszyklus

- Kündigung über das Stripe-Kundenportal (existiert); Profilseite zeigt
  „Premium bis TT.MM.JJJJ" bei `cancel_at_period_end`.
- Herabstufung: private Strecken werden **nie gelöscht** — sie bleiben privat
  und für den Eigentümer sichtbar, nur das Neuanlegen ist gesperrt.
  Gold-Abzeichen verschwindet automatisch (`ist_premium` fällt weg, die Views
  verrechnen bereits mit `AND`).
- Erneutes Abonnieren nutzt denselben Customer.
- Mahnwesen: Stripe Smart Retries + Stripe-eigene E-Mails. Keine eigene
  Mailinfrastruktur.
- Kontolöschung kündigt zuerst bei Stripe (3.5) — Änderung in
  `lib/actions/profile.ts` bzw. dem Löschpfad, plus Test.

### Phase 6 — Absicherung und Beobachtbarkeit

- Sicherheitsprüfung aller berührten geschützten Bereiche, im PR beschrieben.
- Stripe-CLI-Ereignisse gegen die Vorschauumgebung durchspielen (alle Ereignisse
  aus 3.6, inklusive Wiederholung und falscher Reihenfolge).
- Kennzahlen: Aufrufe der Kaufseite → begonnene Checkouts → bezahlte Abos,
  Abwanderung pro Plan, unfreiwillige Abwanderung (Zahlung fehlgeschlagen und
  nicht erholt), MRR, Infrastrukturkosten pro aktivem Nutzer gegen ARPU.
- Startcheckliste: Rechtstexte live, TWINT freigeschaltet, Webhook in
  Production registriert und einmal echt zugestellt, Migrationen eingespielt und
  im Ledger geprüft, Erstattungsweg dokumentiert.

---

## 8. Blocker und offene Entscheidungen

**Blocker (verhindern den Launch, nicht die Entwicklung):**

1. Rechtstexte unter der echten Domain — Voraussetzung für TWINT und für den
   Verkauf an Verbraucher überhaupt.
2. Open-Meteo-Lizenz für kommerzielle Nutzung geklärt.
3. Vercel Pro (Lizenzpflicht ab Umsatz).

**Zu entscheiden, bevor Phase 4 beginnt:**

1. Private Strecken: Freikontingent 1 mit Bestandsschutz — oder bleiben sie
   ganz kostenlos und Premium trägt sich allein über Abzeichen, Grenzen und
   Unterstützer-Erzählung? Das ist die einzige Stelle, an der der Plan etwas
   einschränkt, was heute offen ist.
2. Gründerpreis: 100 Abos — oder zeitlich befristen statt mengenmässig?
3. Geld-zurück-Fenster: 14 Tage auf Zuruf, oder gar keine Zusage?

---

## Quellen

- [Stripe Preise Schweiz](https://stripe.com/ch/pricing)
- [Stripe: TWINT-Zahlungen](https://docs.stripe.com/payments/twint)
- [Mapbox Preise nach Produkt](https://docs.mapbox.com/accounts/guides/pricing/) ·
  [Mapbox Pricing](https://www.mapbox.com/pricing)
- [Supabase-Preisübersicht 2026](https://makerkit.dev/blog/saas/supabase-pricing)
- [Vercel-Preisübersicht 2026](https://flexprice.io/blog/vercel-pricing-breakdown)
- [MWST Schweiz 2026: Sätze und Umsatzgrenze](https://www.snapbill.ch/de/blog/mwst-schweiz-grundlagen)
- [Calimoto/Kurviger-Vergleich 2026](https://kurvo.app/blog/calimoto-vs-kurviger) ·
  [REVER Pro](https://www.getmotobit.com/the-5-best-motorcycle-apps/)
