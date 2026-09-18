# PR-Beschreibung (zum Einfügen)

Vorlage für den Pull Request `staging-premium-neu` → `staging`. Liegt im Repo,
weil der GitHub-Zugang dieser Sitzung nicht angemeldet ist und die
Beschreibung sonst verloren geht.

---

## Summary

Premium bekommt drei Funktionen, drei Pläne und neue Preise.

> **Stand 18.09.2026:** `0110` (Saisonpass) und `0111` (Wartungsheft) sind in
> der Produktionsdatenbank, geprüft und mit einem zurückgerollten
> Funktionstest belegt. Eine vierte Funktion — der Pass-Alarm — wurde
> zurückgezogen, weil parallel ein vollständiges Pass-System live ging; die
> Migration `0112` und ihr Code sind aus diesem Zweig entfernt. Offen bleiben
> die drei Stripe-Preise und die fünf Umgebungsvariablen.

**Warum.** Premium bestand aus fünf Punkten, von denen vier Obergrenzen waren
— man spürt sie im zweiten Sommer, nicht am ersten Tag. Der Jahresplan sparte
17 % gegenüber zwölf Monatszahlungen (Markt: 30–67 %), war also kein Angebot.
Und für den Schweizer Winter gab es keine Antwort, während die Konkurrenz 2026
Saison- und Halbjahrespläne eingeführt hat (calimoto, Detecht, Cardo,
RideLink). Begründung mit Marktvergleich: `docs/premium-neu/preise.md`.

**Funktionen** (jede an einem Ort, der schon existiert; `BottomNav`,
Startseite und visuelles Vokabular unberührt — `docs/premium-ausbau-plan.md`
§1):

- **Wetterfenster** — sieben Tage je Strecke, Stufe plus Grund ("trocken,
  18°", "Glätte möglich"), dazu die besten Tage der Favoriten im Profil.
  Aktuelles Wetter bleibt gratis, die Vorhersage ist Premium.
- **Pass-Sammlung und Saisonrückblick** — welche Pässe dieses Konto hatte, mit
  erster Fahrt und Scheitelhöhe, und ein Bild für Feed und Story. Ohne Abo die
  Zahl ("3 von 12"), keine Sperrfläche. Keine Zeiten, kein Tempo (AGB 11.3).
- **Wartungsheft** — Service, Pneu, Bremsen und **MFK** je Fahrzeug, mit
  Erinnerung. Kilometerstand ist ausdrücklich eine Untergrenze ("mindestens"),
  weil nicht jede Fahrt aufgezeichnet wird. Lesen und Löschen bleiben nach
  Ablauf des Abos erlaubt.

**Preise** (CHF, brutto): Monat 6.90, Jahr 39.00 (−53 % gegenüber dem
Monatsplan), neu ein **Saisonpass** zu 29.00 für sechs Monate **ohne
Verlängerung**, dazu **14 Tage gratis** auf dem Jahresabo, einmal pro Konto.
Bestandsabos behalten ihren Preis.

**Kaufseite:** der Nutzen zuerst ("Mehr aus jeder Saison"), die Unterstützung
als zweiter Satz. Pflichtangaben je Plan direkt über der Schaltfläche, und die
Schaltfläche nennt Betrag **und** Datum, wenn die erste Zahlung später fällig
wird.

## Protected Areas — was hier eingegriffen wird und warum es trägt

`supabase/migrations/**`, `lib/actions/billing.ts`, `app/api/stripe/**`,
`lib/stripe*`, `app/profil/**`.

- **`0110_saisonpass`** führt die zweite Quelle für Premium ein.
  `profiles.ist_premium` ist ab jetzt "Abo läuft **oder** Pass gültig"; die
  drei Schreiber (`apply_subscription_state` aus `0062`, `premium_abgleich`
  aus `0059`, neu `apply_saisonpass`) rechnen alle über dieselbe Funktion
  `saisonpass_gueltig()`. `premium_abgleich` musste mitziehen, weil ein Pass
  an seinem Ende **kein** Stripe-Ereignis auslöst — ohne das bliebe Premium
  nach Ablauf für immer an.
- **Der Pass ist eine Einmalzahlung, kein Abo mit sofortiger Kündigung.**
  Checkout kann `cancel_at` nicht beim Anlegen setzen; die Kündigung liefe in
  einem zweiten Aufruf nach der Zahlung, und fällt der aus, verlängert sich
  ein Produkt, das "verlängert sich nicht" heisst. Dazu legt TWINT für ein Abo
  eine wiederkehrende Belastungsermächtigung an. Beides ist bei einer
  Einmalzahlung ausgeschlossen.
- **Bestandspreise bleiben konfiguriert.** `preisHerkunft()` behandelt eine
  unbekannte Preis-ID als fremdes Produkt. Zeigten `…_MONAT`/`…_JAHR` nur noch
  auf die neuen Preise, liefen Kündigung und Zahlungsausfall der Abos zu
  CHF 4.90/49.00 am Datenbankzustand vorbei — Premium bliebe nach einer
  Kündigung an. Dafür gibt es `STRIPE_PREMIUM_PRICE_IDS_MONAT_BESTAND` und
  `…_JAHR_BESTAND`.
- **Eine Session ohne Zahlung gilt nur dann als Kauf, wenn der Server sie so
  gebaut hat.** `no_payment_required` war bisher immer eine Ablehnung; jetzt
  zählt es, aber ausschliesslich bei der serverseitig gesetzten Markierung
  `variante = testphase|anschluss` und zusätzlich nur mit einem Abo im Status
  `trialing`. Die Bindung an den eigenen Customer bleibt unverändert die
  Prüfung, die "Premium mit fremder Session-ID" verhindert.
- **Neue Tabellen** (`saisonpaesse`, `wartungseintraege`,
  `wartungserinnerungen`) haben RLS an, Grants ausgeschrieben für `public, anon, authenticated` (die
  Falle aus `0047`/`0048`/`0091`/`0097`) und Premium-Gating in der
  Insert-Policy **und** in der Server Action. Lesen und Löschen eigener Daten
  bleiben ohne Abo erlaubt.
- **Beide Migrationen sind eingespielt (2026-09-18) und nachgemessen.**
  Prüfabfragen, der funktionale Rollback-Test und der Weg zurück stehen je
  Migration in `supabase/migrations/README.md`. Zwei Dinge daraus gehören in
  jede künftige Migration: der Live-Rumpf von `anonymize_account` war **nicht**
  der aus `0092` (er trug bereits `0101` und die Pässe-Migration — ein
  `create or replace` auf dem alten Rumpf hätte beide still zurückgedreht),
  und eine in Teilen eingespielte Migration lässt neue Funktionen so lange für
  `anon` ausführbar, bis ihr `revoke`-Teil läuft.

## Geschäftsregeln, die sich ändern (Kernregel 16)

- Premium umfasst drei Leistungen mehr; AGB Ziff. 3.2 zieht im
  **Entwurf** mit.
- Neue Preise und ein neuer Plan; AGB Ziff. 4.1/4.3/4.5/4.6 im Entwurf,
  Bestandsschutz geregelt.
- Erstmals eine Gratis-Testphase (Jahresplan, einmal pro Konto) — die
  Gegenposition in `docs/premium-plan.md` §6 ist in
  `docs/premium-neu/preise.md` §3 ausdrücklich revidiert.
- **Nichts wird entzogen.** Alle bisherigen Gratis-Funktionen bleiben
  kostenlos; die drei neuen Leistungen kommen obendrauf.

## Rechtstexte

`docs/rechtstexte/agb.md` und `datenschutz.md` sind als **Entwurf**
geändert und **nicht in Kraft**: Ziff. 14.1 verlangt 30 Tage Vorlauf per
E-Mail und in der App. Es liegt bereits ein zweiter unveröffentlichter Entwurf
vor (Ziff. 11.4/12.6) — beide gehören in **eine** Mitteilung. Vorlage:
`docs/premium-neu/werbetexte.md`. Die veröffentlichte HTML-Fassung im Repo
`janlampert08-dev/stradoinfo` ist unberührt.

## Nicht in diesem PR, aber Voraussetzung fürs Livegehen

1. Drei Preise in Stripe anlegen (live **und** Sandbox) — der Zugang dieser
   Sitzung ist lesend.
2. Fünf Umgebungsvariablen bei Vercel setzen, inklusive der beiden
   BESTAND-Listen.
3. Infoseite (`stradoinfo`): Preisblock und `Offer`-Schema.
4. Open-Meteo-Lizenz für die kommerzielle Nutzung klären.

Alles mit Reihenfolge und Begründung in `docs/premium-neu/rollout.md`.

## Validation

In diesem Worktree ausgeführt:

- `npx tsc --noEmit` → keine Ausgabe, Exit 0 (nach `npx next typegen`; ohne
  das meldet `app/layout.tsx` vorbestehend `LayoutProps`).
- `npm run lint` → 0 Fehler, 5 Warnungen, alle vorbestehend
  (`no-img-element` in den Icon-/OG-Routen).
- `npm run test` → **929 grün**, 15 rot. Die 15 liegen ausschliesslich in
  `.claude/hooks/sql-guard.test.ts` und sind **vorbestehend**: auf einem
  unveränderten `origin/staging`-Worktree fallen dieselben 15 (gemessen, nicht
  vermutet — die Hook-Tests laufen in dieser Windows-Umgebung nicht).
- `npm run build` → erfolgreich.
- `node scripts/check-migration-prefixes.mjs` → "Keine neuen Kollisionen. 102
  Präfixe geprüft."
- Gegen die Produktionsdatenbank: `0110` und `0111` eingespielt, danach
  Grants, RLS, Policies und die drei ersetzten Funktionsrümpfe nachgemessen,
  plus ein zurückgerollter Funktionstest (Kauf, zweite Zustellung derselben
  Session, Anschlusskauf, Ablauf über `premium_abgleich()`). Danach geprüft:
  `saisonpaesse` leer, kein Testkunde am Profil, Zahl der Premium-Konten
  unverändert. In Stripe wurde nur gelesen.

## Definition of Done

- [x] Scope: Premium-Ausbau, Preise, Texte — nichts daneben.
- [x] Tests vorhanden und grün (siehe oben; UI hat wie immer keine
      Testabdeckung, Logik liegt in `lib/`).
- [x] Lint grün.
- [x] Build grün.
- [x] Protected Areas: Begründung oben, RLS und Grants je Migration geprüft.
- [x] Keine Secrets im Diff.
- [x] Beschreibung nennt die tatsächlich gelaufenen Befehle und ihr Ergebnis.
