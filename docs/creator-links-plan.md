# Creator-Einstiegslinks — Plan

Ziel: pro Creator einen eigenen Einstiegsweg, damit hinterher beantwortbar
ist, **ob es etwas gebracht hat** — und zwar nicht nur „wie viele haben
geklickt", sondern „wie viele haben sich registriert und sind geblieben".

Ausgangslage: ausser `<Analytics />` von Vercel (`app/layout.tsx`) gibt es
keine Telemetrie. Kein Sentry, kein PostHog, kein Plausible. Dieses Dokument
ist ein Plan, kein Code — es ist noch nichts davon umgesetzt.

## Warum UTM allein nicht reicht

UTM-Parameter sind der erste Schritt und kosten nichts (siehe Phase 0). Sie
haben aber drei harte Grenzen, und alle drei treffen genau die Frage, um die
es geht:

1. **Sie überleben den ersten Klick nicht.** Vercel Web Analytics zählt den
   Seitenaufruf mit `utm_*`. Sobald jemand von der Karte auf eine Strecke und
   von dort auf „Registrieren" klickt, sind die Parameter weg. Die
   Registrierung steht danach ohne Herkunft da.
2. **Vercel Web Analytics kennt keine Identität.** Es gibt dort keinen
   Nutzer, keine Registrierung, kein Abo — nur aggregierte Aufrufe. Ein Join
   auf `auth.users` oder `subscriptions` ist nicht vorgesehen und wird es
   auch nicht.
3. **Eine URL mit vier UTM-Parametern ist auf TikTok/Instagram unbrauchbar.**
   Sie lässt sich in einem Video nicht aussprechen und in einer Caption nicht
   anklicken. Ein Creator braucht `app.strado.ch/c/max`, nicht
   `app.strado.ch/?utm_source=tiktok&utm_medium=creator&utm_campaign=…`.

Der Vorschlag ist deshalb **beides, gestaffelt**: ein eigener kurzer Pfad,
der die Herkunft festhält *und* die UTM-Parameter selbst anhängt. Ein Link
für den Creator, zwei Messsysteme dahinter.

## Die vier Phasen auf einen Blick

| Phase | Was sie beantwortet | Aufwand | Braucht Migration? | Braucht Rechtstext-Änderung? |
| --- | --- | --- | --- | --- |
| 0 — UTM an bestehende Links | Klickt überhaupt jemand? | Minuten | nein | nein |
| 1 — `/c/<code>` | Wie viele Aufrufe pro Creator? | ~ halber Tag | nein | nein |
| 2 — Herkunft bis zur Registrierung | Wie viele **Konten** pro Creator? | ~ 1–2 Tage | ja | **ja** |
| 3 — Auswertung | Welcher Creator bringt zahlende Nutzer? | ~ Stunden | nein | nein |

Nach Phase 1 lässt sich anhalten und beobachten. Phase 2 ist der eigentliche
Punkt der Übung, kostet aber eine Migration *und* eine Änderung an der
veröffentlichten Datenschutzerklärung — die liegt in einem anderen Repo
(`janlampert08-dev/stradoinfo`), das ist der unterschätzte Teil.

---

## Phase 0 — UTM an die Links, die es schon gibt

Ohne Code. Jeder Link, den ein Creator bekommt, wird getaggt:

```
https://app.strado.ch/?utm_source=tiktok&utm_medium=creator&utm_campaign=start26&utm_content=max
```

- `utm_source` — die Plattform (`tiktok`, `instagram`, `youtube`)
- `utm_medium` — konstant `creator`, damit sich bezahlte/organische Wege
  später trennen lassen
- `utm_campaign` — die Aktion (`start26`), nicht der Creator
- `utm_content` — **der Creator**. Das ist das Feld, nach dem du gruppierst.

Vercel Web Analytics führt die UTM-Felder als Dimension: im Dashboard als
Filter, an der API (`/v1/query/web-analytics/visits/aggregate`) als
`by`-Parameter. Die genaue Feldschreibweise im Dashboard bzw. an der API
ablesen, bevor du ein Skript darauf baust — ich habe sie nicht verifiziert.

Zwei Einschränkungen, die man vorher wissen sollte:

- **Nur Production.** Vercel zählt Web-Analytics-Daten für das
  Produktions-Deployment. Klicks auf eine Preview- oder Staging-URL tauchen
  nicht auf.
- **Es misst Aufrufe, keine Registrierungen.** Genau deshalb gibt es Phase 2.

Es gibt daneben `track()` aus `@vercel/analytics` für eigene Events — damit
liesse sich ein „Registrierung abgeschlossen"-Event mit dem Creator-Code als
`eventData` senden. Das ist ein brauchbarer Mittelweg, aber ein Aggregat
ohne Rückbindung an das Konto: „Creator X brachte 12 Registrierungen" geht,
„welche 12" und „sind die geblieben" nicht. Und es hängt an einem
Event-Kontingent des Vercel-Tarifs. Mein Vorschlag: überspringen und gleich
Phase 2 bauen, sobald Phase 1 zeigt, dass überhaupt Klicks kommen.

---

## Phase 1 — `/c/<code>` als einziger Einstiegspunkt

Ein Route Handler unter `app/c/[code]/route.ts`, der prüft, protokolliert
(ab Phase 2) und weiterleitet.

### Warum ein Route Handler und nicht ein Query-Parameter auf `/`

Der entscheidende Grund ist Phase 2: **ein Server Component darf in Next.js
kein Cookie setzen.** Das geht nur in einer Server Action oder einem Route
Handler. Ein `?c=` auf der Startseite müsste die Herkunft also über einen
Umweg (Client-Komponente → Server Action) festhalten — mehr Code, mehr
Fehlerquellen, und die Logik läge verteilt auf jeder Seite, die ein Creator
verlinken könnte.

Und nicht in `proxy.ts`: die Middleware läuft laut ihrem Matcher auf nahezu
jeder Anfrage und ist Protected Area (siehe `AGENTS.md`). Für eine Handvoll
Klicks pro Tag gehört dort nichts hinein.

### Dateien

**`lib/creatorLinks.ts`** (neu, reine Funktionen — deshalb in `lib/`, wo
Vitest mit `environment: "node"` sie erreicht):

```ts
// Die Liste der gültigen Codes. In Phase 1 bewusst eine Konstante und keine
// Tabelle: kein DB-Roundtrip pro Klick, testbar, und ein neuer Creator ist
// ein Ein-Zeilen-PR. Ab Phase 2 zieht die Tabelle creator_links nach, weil
// der DB-Trigger denselben Code prüfen muss und keine TS-Konstante lesen kann.
export const CREATOR_CODES = { max: { name: "…", kanal: "tiktok" } } as const;

export function istBekannterCode(roh: string): boolean;   // Format + Mitgliedschaft
export function einstiegsZiel(code: string, ziel?: string): string; // Pfad + UTM
```

`einstiegsZiel()` baut `/` (oder das über `?z=` mitgegebene interne Ziel)
und hängt die UTM-Parameter aus Phase 0 an — so sieht Vercel Web Analytics
den Besuch weiterhin mit vollständiger Herkunft, obwohl der Creator nur
`app.strado.ch/c/max` verteilt hat. **Ein Link, beide Messsysteme.**

Das `?z=`-Ziel läuft durch `safeInternalPath()` aus `lib/utils/url.ts` — den
Open-Redirect-Schutz, den die App schon hat (`AGENTS.md` Regel 14: vorhandene
Helfer nutzen). Ohne das wäre `/c/max?z=https://boese.example` ein
Weiterleitungs-Missbrauch auf einer Domain, der Leute vertrauen.

**`app/c/[code]/route.ts`** (neu, dünn):

```ts
export async function GET(request, { params }) {
  const { code } = await params;
  // Unbekannter Code: still auf "/" ohne UTM. Kein 404 — ein toter
  // Creator-Link soll einen echten Besucher nicht auf eine Fehlerseite
  // werfen, und er soll auch nichts zählen.
  ...
  // 307, nicht 308: ein permanenter Redirect wird vom Browser dauerhaft
  // gecacht. Spätestens ab Phase 2 würde der Handler dann beim zweiten
  // Klick gar nicht mehr laufen und kein Cookie mehr setzen.
  // Dazu Cache-Control: no-store.
}
```

**`lib/creatorLinks.test.ts`** (neu): Format-Prüfung, unbekannte Codes,
Gross-/Kleinschreibung, UTM-Aufbau, `?z=`-Abweisung bei externen Zielen.

Keine Änderung an `proxy.ts` nötig — der Matcher deckt `/c/...` bereits ab,
und `updateSession()` stört nicht.

### Die Link-Form

```
https://app.strado.ch/c/max
```

**Nicht `strado.ch/c/max`.** Der Apex antwortet mit 308 auf `www.strado.ch`
und behält den Pfad (siehe `AGENTS.md`, „Die Domains sind live") — der Link
landete also auf der Info-Seite, die diesen Pfad nicht kennt. Wenn ein
Creator-Link trotzdem auf der Hauptdomain stehen soll, braucht es eine
Weiterleitung im `stradoinfo`-Repo; das ist eine eigene Entscheidung.

### Auf Staging testen

`/c/…` ist im Staging-Gate (`proxy.ts`, `istVomGateAusgenommen`) **nicht**
ausgenommen. Auf `staging.strado.ch` funktioniert der Link also nur als
eingeloggter Moderator. Das ist richtig so und sollte so bleiben — die
Ausnahmeliste dort ist bewusst kurz.

---

## Phase 2 — die Herkunft bis zur Registrierung durchreichen

Erst hier wird aus „Klicks" eine Antwort auf „hat es was gebracht".

### a) Cookie im Route Handler

```ts
antwort.cookies.set("strado_herkunft", code, {
  httpOnly: true,      // kein Client-Code braucht ihn — hält ihn aus XSS-Reichweite
  secure: true,
  sameSite: "lax",     // der Klick kommt als Top-Level-Navigation aus dem
                       // TikTok-/Instagram-Browser; Lax sendet ihn mit
  maxAge: 60 * 60 * 24 * 30,   // 30 Tage
  path: "/",
});
```

**First Touch gewinnt**: nur setzen, wenn noch keiner da ist. Sonst kassiert
der Creator, der zufällig zuletzt verlinkt hat, die Registrierung eines
Besuchers, den ein anderer vor drei Wochen geholt hat. Das ist eine
Geschäftsregel — sie gehört in eine benannte, getestete Funktion in
`lib/creatorLinks.ts`, nicht als `if` in den Handler.

### b) `signUp()` reicht den Wert weiter

`lib/actions/auth.ts` ist **Protected Area**. Die Änderung ist klein: Cookie
lesen, Wert über `options.data` an `supabase.auth.signUp()` geben, damit er
in `raw_user_meta_data` landet. Kein neuer Admin-Client, keine neue
Berechtigung.

Der Umweg über die Metadaten ist nötig, weil `signUp()` bei aktivierter
E-Mail-Bestätigung **keine Session** zurückgibt: das Profil entsteht erst
durch den Trigger `handle_new_user` auf `auth.users` (Migration `0001`). Es
gibt in diesem Moment also keinen eingeloggten Nutzer, in dessen Namen sich
eine Zeile schreiben liesse.

### c) Migration `0080_creator_herkunft.sql`

Drei Objekte und eine Trigger-Änderung:

```sql
-- 1. Die Quelle der Wahrheit für gültige Codes.
create table public.creator_links (
  code text primary key check (code ~ '^[a-z0-9-]{2,32}$'),
  name text not null,
  kanal text,
  aktiv boolean not null default true,
  erstellt_am timestamptz not null default now()
);
alter table public.creator_links enable row level security;
-- Keine Policy für anon/authenticated: niemand ausser service_role und
-- (optional) Moderatoren muss diese Liste lesen können.

-- 2. Wer kam über wen.
create table public.registrierung_herkunft (
  user_id uuid primary key references auth.users (id) on delete cascade,
  code text not null references public.creator_links (code),
  erstellt_am timestamptz not null default now()
);
alter table public.registrierung_herkunft enable row level security;
-- Ebenfalls ohne Policy.
```

**Warum eine eigene Tabelle und keine Spalte in `profiles`:** `profiles`
trägt seit `0001` die Policy „Profile sind öffentlich lesbar" mit
`using (true)`. Jede neue Spalte dort ist damit für **jeden** lesbar, auch
für `anon` über PostgREST. „Wer hat wen geworben" wäre öffentlich abrufbar.
Das ist kein Stilgeschmack, das ist die Falle.

**Die Trigger-Änderung** (`create or replace function handle_new_user()`):
Code aus `new.raw_user_meta_data ->> 'herkunft_code'` lesen, gegen
`creator_links` mit `aktiv = true` prüfen, nur dann die Zeile schreiben.
Unbekannter Code → nichts, kein Fehler (eine Registrierung darf niemals an
der Herkunftsmessung scheitern).

Die Prüfung im Trigger ist Pflicht, nicht Kür: `raw_user_meta_data` lässt
sich über den Browser-Client (`supabase.auth.signUp({ options: { data } })`)
frei setzen. Ohne die Prüfung könnte jeder beliebige Codes erfinden und die
Zahlen eines Creators fluten.

Beim Neuschreiben der Funktion:
- `security definer set search_path = public` beibehalten (siehe `0073`).
- Ausführungsrechte prüfen und ggf. entziehen — Postgres vergibt `EXECUTE`
  beim `CREATE` an `PUBLIC`, Supabase zusätzlich an `anon`/`authenticated`.
  `0079` beschreibt genau diese Falle samt Messbefehl.

**Optional, aber empfohlen:** ein Tagesaggregat
`creator_link_statistik (code, tag, registrierungen)`, das dieselbe
Triggerfunktion hochzählt. Grund ist die Kontolöschung: `anonymize_account()`
(`0076`) müsste in einer eigenen Migration die Zeile aus
`registrierung_herkunft` löschen — wer gelöscht werden will, soll nicht als
„kam über Creator X" stehen bleiben. Das Aggregat überlebt diese Löschung und
hält die Zahl des Creators korrekt. Ohne Aggregat verlierst du mit jedem
gelöschten Konto eine Registrierung aus der Statistik. (`0076` selbst **nicht**
anfassen — Regel 9, Migrationen sind append-only.)

### d) Datenschutzerklärung — der Teil, den man vergisst

`docs/rechtstexte/datenschutz.md`, Abschnitt 3, sagt heute wörtlich: „Strado
setzt **keine Werbe- oder Trackingcookies**" und listet darunter jeden
einzelnen verwendeten Speicher in einer Tabelle. Ein Herkunfts-Cookie muss
dort als Zeile stehen, und die Aussage davor muss dazu passen.

Meine Einschätzung — die eine juristische Prüfung nicht ersetzt: es ist ein
First-Party-Cookie, es geht an niemanden weiter, es bildet kein Profil über
mehrere Websites, es dient der Messung der eigenen Werbewege. Es ist damit
kein Werbecookie im üblichen Sinn, aber es ist eindeutig
nennungspflichtig (Transparenz, Art. 19 DSG). Zustimmungspflichtig ist es
nach Schweizer DSG nach meinem Verständnis nicht; für EU-Besucher gilt eine
andere Rechtslage. Diese Abwägung gehört dir, nicht mir — nur die
**Nennung** ist aus meiner Sicht nicht verhandelbar.

**Und das ist ein Change über zwei Repos:** die veröffentlichte Fassung liegt
in `janlampert08-dev/stradoinfo` und wird unter `strado.ch/legal/datenschutz`
ausgeliefert. Der Markdown-Entwurf hier ist erst dann die geltende Fassung,
wenn die HTML-Seite dort nachgezogen ist.

**Die cookiefreie Alternative**, falls du das umgehen willst: der Route
Handler leitet direkt auf `/registrieren?c=<code>` weiter, der Code reist als
Formularfeld mit (wie `next` es schon tut, siehe `RegistrierenForm.tsx`), kein
Cookie. Kostet Attribution bei jedem, der erst schaut und später
zurückkommt — also vermutlich die Mehrheit. Als Zwischenschritt tragbar, als
Endzustand nicht.

---

## Phase 3 — Auswertung

Erst einmal **ohne Code**: ein SQL-Schnipsel, das du im Supabase-SQL-Editor
laufen lässt (und das in dieses Dokument gehört, sobald es steht). Der
Trichter, der die Frage „hat es was gebracht" tatsächlich beantwortet:

```
Code → Registrierungen → davon mit ≥ 1 Fahrt → davon mit Premium-Abo
```

Die Joins gehen auf `route_completions` und `subscriptions` und existieren
alle schon. Eine Moderationsseite unter `/moderation/creator` lohnt sich
erst, wenn du diese Zahlen wöchentlich brauchst — bis dahin ist sie Code, der
gepflegt werden will, für eine Abfrage, die du dreimal machst.

Falls doch eine View: `security_invoker = true` setzen und den Zugriff über
die Basistabellen regeln. Die Befundtabelle in
`docs/audit/README.md#remediation-status` enthält Findings zu genau diesem
Thema (RLS und Views) — vorher lesen.

---

## Fallen

| Falle | Warum sie beisst | Was zu tun ist |
| --- | --- | --- |
| `profiles` ist öffentlich lesbar (`using (true)`, `0001`) | Jede neue Spalte dort ist für `anon` abrufbar | Eigene Tabelle mit RLS ohne Policy |
| Apex 308 → `www.strado.ch` | `strado.ch/c/max` landet auf der Info-Seite | Creator-Links auf `app.strado.ch` ausstellen |
| `raw_user_meta_data` ist client-setzbar | Erfundene Codes fluten die Zahlen | Prüfung gegen `creator_links` **im Trigger** |
| 308-Redirect wird dauerhaft gecacht | Der Handler läuft beim zweiten Klick nicht mehr, kein Cookie | 307 + `Cache-Control: no-store` |
| Migrationen werden **von Hand** eingespielt | Grünes CI sagt nichts über das Schema aus | Erst Staging-DB, dann Produktion, Objekte prüfen — `supabase/migrations/README.md` |
| Migrationsnummern sind nicht eindeutig | Sechs Präfixe existieren doppelt | `scripts/check-migration-prefixes.mjs` läuft in CI; neue Kollision = rot |
| Die CSP ist scharf (`lib/csp.ts`) | Ein fremdes Analytics-Skript wird stumm blockiert | Alles first-party halten — dann keine CSP-Änderung |
| Vercel Web Analytics zählt nur Production | Staging-/Preview-Klicks fehlen im Dashboard | Beim Testen nicht wundern |
| `NEXT_PUBLIC_*` friert beim Build ein | Eine Creator-Liste über eine Env-Variable wäre nach dem Deploy nicht änderbar | Codes im Repo oder in der DB, nicht in `NEXT_PUBLIC_*` |
| Keine Component-/E2E-Tests im Projekt | `app/c/[code]/route.ts` und der `signUp()`-Pfad bleiben ungetestet | Logik nach `lib/` ziehen, Lücke im PR benennen |

---

## Offene Entscheidungen

Die kann ich nicht für dich treffen — sie ändern aber, was gebaut wird:

1. **First Touch oder Last Touch?** Empfehlung: First Touch (siehe oben).
2. **Einzelzeile pro Konto oder nur Tagesaggregat?** Das Aggregat hat keinen
   Personenbezug und macht die Löschfrage gegenstandslos. Es kann dafür nie
   beantworten, ob ein Creator *zahlende* Nutzer bringt — und diese Frage
   kommt, sobald das erste Abo aus einer Kampagne stammt. Rückwirkend geht
   das nicht: was nicht erfasst wurde, ist weg. Empfehlung: Einzelzeile,
   plus Aggregat, plus Löschung bei Kontolöschung.
3. **Ist eine Vergütung geplant?** Wenn ja, brauchst du vorher eine
   belastbare Definition von „gebracht" (Registrierung? bestätigte E-Mail?
   erste Fahrt? Abo nach 30 Tagen?) — sie bestimmt, was du überhaupt messen
   musst.
4. **Sollen Creator ihre eigenen Zahlen sehen?** Das ist eine eigene
   Oberfläche mit einer eigenen Auth-Entscheidung und deutlich mehr Arbeit.
   Empfehlung: erst einmal manuell melden.
5. **Wohin landet der Klick?** `/` (die Karte) ist der stärkste erste
   Eindruck. Eine creator-spezifische Begrüssung („Max hat dich geschickt")
   wäre möglich, ist aber eine eigene Seite mit eigenem Text.

---

## Umsetzung

Nach `AGENTS.md` → Release Flow: Branch `staging-creator-links`, PR gegen
`staging`, nicht gegen `main`. Die Migration wird **zuerst** auf der
Staging-Datenbank eingespielt, dann auf Produktion — von Hand, mit
Objektprüfung.

Definition of Done je Phase, wie im Repo üblich: `npm run test`,
`npm run lint`, `npm run build` tatsächlich laufen lassen und die Ergebnisse
in die PR-Beschreibung schreiben. Für Phase 2 zusätzlich: `lib/actions/auth.ts`
ist Protected Area, die PR-Beschreibung muss begründen, warum die Änderung
sicher ist.
