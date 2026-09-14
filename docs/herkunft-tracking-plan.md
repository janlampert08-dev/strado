# Herkunft eines Kontos — Plan für die Erweiterung des Trackings

Ziel: Wer über `app.strado.ch/c/max` in die App kommt, sich registriert und
**zwei Monate später** Premium kauft, soll mit diesem Kauf immer noch Max
zugeordnet sein — nachvollziehbar auf Codeebene, nicht als nachträglich
zusammengereimte Korrelation über Registrierungsdaten.

Dieses Dokument ist die ausgearbeitete Fassung von **Phase 2 und 3** aus
`docs/creator-links-plan.md`. Dort steht, warum es Creator-Links überhaupt
gibt und wie Phase 0/1 gebaut wurden; hier steht, wie die Herkunft vom Klick
bis zum Kauf durchgereicht wird. Der alte Plan bleibt gültig, wo er nicht
widersprochen wird — die zwei Stellen, an denen dieses Dokument ihn
korrigiert, sind unten ausdrücklich markiert.

**Stand: umgesetzt am 2026-09-14.** Was unten als Plan formuliert ist, steht
inzwischen im Code — die Beschreibungen sind absichtlich stehen geblieben,
weil sie die Begründungen tragen. Die Zuordnung der Schritte zu den Dateien:

| Schritt | Umgesetzt in |
| --- | --- |
| 1 — Cookie | `lib/herkunft.ts`, gesetzt in `app/c/[code]/route.ts`, getestet in `lib/herkunft.test.ts` |
| 2 — Durchreichen | `signUp()` in `lib/actions/auth.ts` (plus `herkunft_code: null` beim Löschen) |
| 3 — Migration A | `0088_herkunft_und_konversionen.sql` |
| 4 — Migration B | `0089_creator_konversion_abo.sql` |
| 5 — Klicks zählen | **nicht gebaut** (bewusst, siehe dort) |
| 6 — Löschung | `0090_anonymisierung_herkunft.sql` |
| 7 — Auswertung | die Abfrage unten, ohne Oberfläche |
| 8 — Datenschutz | `docs/rechtstexte/datenschutz.md` Ziff. 3.11 und die veröffentlichte Fassung in `janlampert08-dev/stradoinfo` |

Die drei Migrationen sind **noch nicht eingespielt** — siehe
`supabase/migrations/README.md`. Ein Zusatz, der beim Bauen dazukam und
oben nicht stand: ein Creator-Code, über den Registrierungen gelaufen
sind, lässt sich nicht mehr löschen (Fremdschlüssel), und
`lib/actions/creatorLinks.ts` übersetzt diesen Fehler in einen Satz, der
auf Deaktivieren verweist.

**Kein Cookie-Banner.** Das war eine ausdrückliche Entscheidung: genannt
wird das Cookie in der Datenschutzerklärung, abgefragt wird es nicht. Die
Abwägung dazu steht in Schritt 8.

---

## 1. Wo die Kette heute reisst

| Schritt | Was heute passiert | Was fehlt |
| --- | --- | --- |
| Klick auf `/c/max` | `app/c/[code]/route.ts` löst den Code über `creator_link_aufloesen()` auf und leitet mit UTM-Parametern weiter | Nichts wird festgehalten. Vercel Web Analytics zählt einen Seitenaufruf ohne Identität |
| Besucher schaut sich um | Die UTM-Parameter überleben den ersten internen Klick nicht | Keine Kennung, die den Besuch überdauert |
| Registrierung, ggf. Tage später | `signUp()` legt das Konto an, `handle_new_user` (0001) das Profil | Die Herkunft kommt hier gar nicht an |
| Kauf, ggf. Monate später | Der Webhook schreibt über `apply_subscription_state` (0059) eine Zeile in `subscriptions` | Weder Herkunft noch der Zeitpunkt des **ersten** Kaufs stehen irgendwo |

Drei der vier Zeilen sind in `docs/creator-links-plan.md` schon beschrieben.
Die vierte ist der eigentliche Gegenstand dieses Dokuments und der Grund,
warum Phase 2 nicht reicht.

---

## 2. Die Leitentscheidung: Ereignisse erfassen, Regeln ableiten

Der naheliegende Entwurf ist: eine Tabelle `registrierung_herkunft`
(`user_id → code`), und die Frage „welche Käufe gehen auf Max" ist ein JOIN
auf `subscriptions`. Das ist **fast** richtig — es scheitert an vier
Eigenschaften der bestehenden Abo-Tabelle, und alle vier treffen genau den
Fall „Kauf zwei Monate später":

1. **`subscriptions` ist Zustand, nicht Verlauf.** `apply_subscription_state`
   schreibt `on conflict (user_id) do update` — eine Zeile pro Konto, immer
   wieder überschrieben (`0059`). Es gibt keine Spalte, die den Zeitpunkt des
   ersten Kaufs festhält: `updated_at` ist der letzte Webhook, nicht der
   Kaufmoment. Nach einer Kündigung und einem späteren neuen Abo ist die
   erste Zuordnung restlos weg.
2. **Die Zeile überlebt die Kontolöschung nicht.** `anonymize_account()`
   (`0076`, Zeile 150) löscht sie — muss sie auch, sonst stellt
   `premium_abgleich()` per Cron nachts `ist_premium` wieder her. Ein Konto,
   das Max geworben hat, das ein Jahr zahlte und dann gelöscht wurde, fällt
   damit aus jeder Auswertung heraus.
3. **Die Zuordnungsregel ist nicht in Stein.** „Zählt ein Kauf 90 Tage nach
   der Registrierung noch?" ist eine Geschäftsentscheidung, die sich ändern
   kann. Wer sie beim Auswerten anwendet, kann sie ändern. Wer sie beim
   Erfassen anwendet, hat die Daten für jede andere Regel weggeworfen.
4. **Eine Vergütung braucht einen Beleg.** Sobald Geld fliesst, ist „das
   SELECT sagt 14" keine Grundlage mehr — man braucht eine Zeile, die sagt:
   *dieses Abo, an diesem Tag, diesem Code zugeschrieben*, und die auch dann
   noch so dasteht, wenn das Abo storniert und das Konto gelöscht ist.

Daraus die Linie, an der sich der Rest dieses Plans entlanghangelt:

> **Erfasst wird das Ereignis, abgeleitet wird die Regel.** Ein Kauf schreibt
> eine unveränderliche Zeile mit Code, Zeitpunkt und Abo-ID. Ob dieser Kauf
> im Attributionsfenster liegt, ob er vergütungswürdig ist, ob Stornos
> gegengerechnet werden — das entscheidet die Abfrage, nicht der Trigger.

Was nicht erfasst wurde, ist unwiederbringlich weg; was falsch ausgewertet
wurde, wird nochmal ausgewertet. Das ist die ganze Begründung für die
Append-only-Tabelle weiter unten.

---

## 3. Datenmodell

Drei Tabellen. Keine davon hängt an `profiles`: diese Tabelle trägt seit
`0001` die Policy „Profile sind öffentlich lesbar" mit `using (true)`, jede
neue Spalte dort wäre für `anon` über PostgREST abrufbar. „Wer hat wen
geworben" wäre damit öffentlich. Das ist kein Stilgeschmack, das ist die
Falle.

### a) `registrierung_herkunft` — wer kam über wen

```sql
create table public.registrierung_herkunft (
  user_id uuid primary key references auth.users (id) on delete cascade,
  code text not null references public.creator_links (code),
  erstellt_am timestamptz not null default now()
);
alter table public.registrierung_herkunft enable row level security;
-- Bewusst ohne jede Policy und ohne Grants an anon/authenticated:
-- erreichbar nur über den Service-Role-Client und über SECURITY
-- DEFINER-Funktionen — dieselbe Linie wie subscriptions (0059) und
-- stripe_webhook_events (0026).
```

Eine Zeile pro Konto, geschrieben genau einmal (beim Registrieren), danach
nie geändert. Sie beantwortet „wer" — nicht „was ist daraus geworden".

### b) `creator_konversionen` — das Ereignisprotokoll

Die Tabelle, ohne die der Kauf nach zwei Monaten nicht belegbar ist.

```sql
create table public.creator_konversionen (
  id bigint generated always as identity primary key,
  code text not null references public.creator_links (code),
  -- 'registrierung' | 'abo_start' | 'abo_ende'
  art text not null,
  -- Nullable und NICHT on delete cascade: bei der Kontolöschung wird der
  -- Bezug genullt (siehe Schritt 6), die Zeile selbst bleibt stehen. Sonst
  -- verliert der Creator mit jedem gelöschten Konto eine Zählung, die er
  -- verdient hat.
  user_id uuid references auth.users (id) on delete set null,
  -- Nur bei art in ('abo_start','abo_ende'). Keine Personendaten, aber der
  -- Schlüssel, über den ein Storno gegengerechnet wird.
  stripe_subscription_id text,
  -- Wann das Ereignis stattfand, und wann wir es erfasst haben. Die beiden
  -- driften auseinander, wenn ein Webhook nachgeliefert wird.
  ereignis_am timestamptz not null,
  erfasst_am timestamptz not null default now(),
  -- Die Registrierung des Kontos, redundant mitgeführt: damit ein
  -- Attributionsfenster ("Kauf innerhalb von 90 Tagen") ausgewertet werden
  -- kann, ohne auf ein womöglich gelöschtes Konto zu joinen.
  registriert_am timestamptz not null,
  constraint creator_konversionen_art
    check (art in ('registrierung', 'abo_start', 'abo_ende'))
);

-- Exakt-einmal statt mindestens-einmal: Stripe liefert Webhooks
-- wiederholt aus (AGENTS.md, Kernregel 12), und apply_subscription_state
-- schreibt bei jedem davon dieselbe Zeile erneut. Ohne diesen Index
-- entstünde pro Zustellung eine Konversion.
create unique index creator_konversionen_einmalig
  on public.creator_konversionen (art, stripe_subscription_id)
  where stripe_subscription_id is not null;

create unique index creator_konversionen_registrierung_einmalig
  on public.creator_konversionen (user_id)
  where art = 'registrierung';
```

Append-only im Betrieb: geschrieben wird nur per `insert`, ein `update`
trifft ausschliesslich `user_id` (Anonymisierung). Ein Storno löscht nichts,
er fügt ein `abo_ende` hinzu.

**Kein Betrag in dieser Tabelle.** Die Versuchung ist gross, `betrag_rappen`
mitzuschreiben, um später Provisionen rechnen zu können. Dagegen spricht:
der Betrag steht bei Stripe und ändert sich dort (Rückerstattung,
Rabatt, Steuer), und eine zweite, nie nachgeführte Kopie ist schlechter als
keine. Sobald tatsächlich vergütet wird, ist der Beleg eine eigene, dann
eingefrorene Abrechnungszeile — siehe offene Entscheidung 3.

### c) `creator_klicks` — der Nenner (optional)

```sql
create table public.creator_klicks (
  code text not null references public.creator_links (code),
  tag date not null,
  klicks integer not null default 0,
  primary key (code, tag)
);
```

Ohne das lautet der Trichter „? Klicks → 12 Registrierungen". Vercel Web
Analytics kennt die Klicks, lässt sich aber nicht auf `auth.users` joinen
(und zählt ausserdem nur Production). Ein Tagesaggregat ohne Personenbezug
schliesst die Lücke. **Optional**, weil es die einzige Komponente ist, die
bei jedem Klick schreibt — und weil `/c/<code>` heute bewusst keine
Schreiblast trägt.

---

## 4. Der Weg, Schritt für Schritt

### Schritt 1 — Cookie im Route Handler

`app/c/[code]/route.ts`, unverändert in seiner Struktur, setzt zusätzlich:

```ts
antwort.cookies.set("strado_herkunft", link.code, {
  httpOnly: true,   // kein Client-Code braucht ihn — hält ihn aus XSS-Reichweite
  secure: true,
  sameSite: "lax",  // der Klick ist eine Top-Level-Navigation aus dem
                    // TikTok-/Instagram-Browser; Lax sendet ihn mit
  maxAge: 60 * 60 * 24 * 90,   // siehe offene Entscheidung 1
  path: "/",
});
```

**First Touch gewinnt:** nur setzen, wenn noch keiner da ist — sonst kassiert
der Creator, der zufällig zuletzt verlinkt hat, einen Besucher, den ein
anderer vor drei Wochen geholt hat. Das ist eine Geschäftsregel und gehört
als benannte, getestete Funktion nach `lib/creatorLinks.ts`
(`herkunftCookieWert(vorhanden, neu)`), nicht als `if` in den Handler — im
Handler wäre sie ungetestet, weil es im Projekt keine Component-/E2E-Tests
gibt.

Dass der Handler ab jetzt ein Cookie setzt, ist auch der Punkt, an dem die
Begründung „kein Rate Limit nötig" endgültig hinfällig wäre — sie ist es
schon seit `0084`, und das Limit steht deshalb bereits drin
(`creator:einstieg:<ip>`, 60/min).

### Schritt 2 — `signUp()` reicht den Wert weiter

`lib/actions/auth.ts` ist **Protected Area**. Die Änderung ist klein und
fügt keine neue Berechtigung hinzu: Cookie lesen, Wert über `options.data`
an `supabase.auth.signUp()` geben, sodass er in `raw_user_meta_data` landet —
genau dort, wo `display_name` schon steht.

Der Umweg über die Metadaten ist nicht Bequemlichkeit, sondern notwendig:
Bei aktivierter E-Mail-Bestätigung gibt `signUp()` **keine Session** zurück.
Das Profil entsteht erst durch den Trigger `handle_new_user` auf
`auth.users`. In dem Moment gibt es keinen eingeloggten Nutzer, in dessen
Namen sich eine Zeile schreiben liesse.

Zwei Dinge, die dabei leicht untergehen:

- `raw_user_meta_data` ist **client-setzbar** (`supabase.auth.signUp({
  options: { data } })` geht auch aus dem Browser-Client). Der Wert ist
  deshalb ein Vorschlag, keine Tatsache — die Prüfung gehört in den Trigger,
  siehe Schritt 3.
- `deleteAccount()` nullt beim Löschen `user_metadata.display_name` über
  `admin.auth.admin.updateUserById`, weil der Name sonst als Kopie in
  `auth.users` überlebt. Für `herkunft_code` gilt exakt dasselbe: **in
  denselben Merge aufnehmen**, sonst bleibt die Herkunft eines gelöschten
  Kontos in den Auth-Metadaten stehen.

### Schritt 3 — Migration A: Herkunft bei der Registrierung

Neue Migration, Arbeitsname `0088_registrierung_herkunft.sql`
(Nummer beim Anlegen gegen den dann aktuellen Stand prüfen — die Nummern
sind im Repo **nicht** eindeutig, sechs Präfixe existieren doppelt, und
`scripts/check-migration-prefixes.mjs` macht CI bei einer neuen Kollision
rot).

Inhalt:

1. Tabelle `registrierung_herkunft` (3a) und `creator_konversionen` (3b).
2. `create or replace function public.handle_new_user()` — die Funktion aus
   `0001` neu geschrieben, **nicht** die alte Migration angefasst (Regel 9,
   Migrationen sind append-only). Sie tut zusätzlich:

```sql
  v_code := new.raw_user_meta_data ->> 'herkunft_code';

  -- Der Wert kommt aus client-setzbaren Metadaten. Ohne diese Prüfung
  -- könnte jeder beliebige Codes erfinden und die Zahlen eines Creators
  -- fluten. Nur aktive, tatsächlich vergebene Codes zählen.
  if v_code is not null and exists (
    select 1 from public.creator_links where code = v_code and aktiv
  ) then
    insert into public.registrierung_herkunft (user_id, code)
    values (new.id, v_code);

    insert into public.creator_konversionen
      (code, art, user_id, ereignis_am, registriert_am)
    values (v_code, 'registrierung', new.id, now(), now())
    on conflict do nothing;
  end if;
```

Ein unbekannter Code führt zu **nichts** — nicht zu einem Fehler. Eine
Registrierung darf niemals an der Herkunftsmessung scheitern.

Beim Neuschreiben beachten:

- `security definer set search_path = public` beibehalten (siehe `0073`).
- Ausführungsrechte nachziehen. Postgres vergibt `EXECUTE` beim `CREATE` an
  `PUBLIC`, Supabase zusätzlich an `anon`/`authenticated`; `0027` und `0047`
  haben genau diese Rechte für `handle_new_user` schon einmal entzogen, ein
  `create or replace` setzt sie nicht zurück — aber verifizieren statt
  annehmen, `0079` beschreibt den Messbefehl.
- Grants für die zwei neuen Tabellen zuerst vollständig entziehen
  (`revoke all ... from anon, authenticated`), dann nichts geben —
  dieselbe Reihenfolge wie `0034` für `profiles` und `0084` für
  `creator_links`.

### Schritt 4 — Migration B: der Kauf, Monate später

Das Herzstück. Die Frage ist nur: **wo hängt sich die Erfassung ein?**

| Ort | Dagegen |
| --- | --- |
| Im Webhook-Handler (TypeScript) | `app/api/stripe/webhook/route.ts` ist nicht der einzige Schreiber — `confirmSubscription()` in `lib/actions/billing.ts` schreibt denselben Zustand. Beide müssten die Erfassung tragen, und ein dritter Aufrufer später auch. Ausserdem: zusätzlicher Admin-Client-Aufruf ausserhalb der Transaktion, in der der Zustand geschrieben wird |
| In `apply_subscription_state` | Bedeutet, die Funktion aus `0059` per `create or replace` umzuschreiben — 120 Zeilen Protected-Area-Logik mit Advisory Lock, Kulanzfrist und Veralterungsprüfung anfassen, um zehn Zeilen anzuhängen |
| **Trigger auf `subscriptions`** | — |

**Empfehlung: ein Trigger auf der Tabelle.** Jeder Weg, auf dem ein Abo
entsteht, geht durch `subscriptions` — der Trigger fängt beide heutigen
Schreiber und jeden künftigen, läuft in derselben Transaktion, und `0059`
bleibt unberührt.

```sql
create function public.creator_konversion_abo()
returns trigger
language plpgsql
security definer set search_path = public, pg_temp
as $$
declare
  v_herkunft public.registrierung_herkunft%rowtype;
  v_registriert timestamptz;
begin
  select * into v_herkunft
  from public.registrierung_herkunft where user_id = new.user_id;

  -- Kein Creator dahinter: nichts zu tun. Der Normalfall.
  if v_herkunft.user_id is null then
    return new;
  end if;

  select created_at into v_registriert
  from public.profiles where id = new.user_id;

  -- subscription_ist_premium() ist dieselbe Funktion, die ueber
  -- profiles.ist_premium entscheidet (0059). Damit heisst "zahlender
  -- Nutzer" hier exakt dasselbe wie ueberall sonst in der App.
  if public.subscription_ist_premium(new.status, new.kulanz_bis) then
    insert into public.creator_konversionen
      (code, art, user_id, stripe_subscription_id, ereignis_am, registriert_am)
    values
      (v_herkunft.code, 'abo_start', new.user_id, new.stripe_subscription_id,
       now(), v_registriert)
    -- Der Unique-Index macht die Wiederholung zum No-op: Stripe liefert
    -- denselben Zustand mehrfach, und jedes invoice.paid schreibt die Zeile
    -- erneut. Erfasst wird der erste Moment, in dem dieses Abo zahlend war.
    on conflict do nothing;
  else
    insert into public.creator_konversionen
      (code, art, user_id, stripe_subscription_id, ereignis_am, registriert_am)
    values
      (v_herkunft.code, 'abo_ende', new.user_id, new.stripe_subscription_id,
       now(), v_registriert)
    on conflict do nothing;
  end if;

  return new;
end;
$$;

create trigger subscriptions_creator_konversion
  after insert or update on public.subscriptions
  for each row execute function public.creator_konversion_abo();
```

Vier Dinge, die an diesem Trigger wichtig sind:

- **Er kennt kein Attributionsfenster.** Er erfasst, dass am Tag X ein über
  Code Y geworbenes Konto zahlend wurde, und schreibt das
  Registrierungsdatum daneben. Ob 60 Tage noch zählen und 200 nicht mehr,
  entscheidet die Auswertung. Siehe Abschnitt 2.
- **`SECURITY DEFINER` ist hier begründungspflichtig** (AGENTS.md). Die
  Begründung: Der Trigger läuft im Kontext dessen, der `subscriptions`
  schreibt — heute immer `service_role`, was ihn nicht bräuchte. Er ist
  trotzdem `definer`, damit `creator_konversionen` keinerlei Grant an
  irgendeine andere Rolle braucht: die Tabelle bleibt für `anon` und
  `authenticated` vollständig unerreichbar, und der einzige Schreibweg
  hinein ist dieser Trigger. Er trifft keine Berechtigungsentscheidung und
  liest keine Eingabe des Aufrufers — nur `NEW` aus einer Tabelle, die
  ausschliesslich `service_role` beschreiben kann.
- **`abo_ende` ist ein Gegenereignis, keine Löschung.** Storno,
  Zahlungsausfall nach Kulanzfrist und Kündigung landen alle hier. Ob ein
  Creator für ein nach drei Tagen storniertes Abo vergütet wird, ist
  Entscheidung 2 — die Daten für beide Antworten liegen vor.
- **Rückerstattungen fehlen bewusst.** Eine Rückerstattung ohne Kündigung
  (`charge.refunded`) ändert `subscriptions` nicht und löst den Trigger
  nicht aus. Solange nicht vergütet wird, ist das folgenlos; sobald
  vergütet wird, ist es die erste Lücke, die geschlossen gehört.

### Schritt 5 — Klicks zählen (optional, Tabelle 3c)

`/c/<code>` zählt `creator_klicks` per `SECURITY DEFINER`-Funktion hoch
(`insert ... on conflict (code, tag) do update set klicks = klicks + 1`).
Kein Personenbezug, keine IP, kein Cookie-Lesen dafür. Kostet einen
zusätzlichen Datenbank-Roundtrip pro Klick — vertretbar bei der erwarteten
Grössenordnung, und das IP-Limit steht bereits davor.

### Schritt 6 — Löschung und Anonymisierung nachziehen

Eine eigene Migration, die `anonymize_account(uuid)` per `create or replace`
neu schreibt (`0076` selbst **nicht** anfassen — Regel 9) und zwei Zeilen
ergänzt:

```sql
  delete from public.registrierung_herkunft where user_id = p_user_id;

  -- Zeile bleibt, Personenbezug geht: der Creator behaelt seine Zaehlung,
  -- das geloeschte Konto ist darin nicht mehr auffindbar.
  update public.creator_konversionen
  set user_id = null
  where user_id = p_user_id;
```

> **Korrektur zu `docs/creator-links-plan.md`.** Der alte Plan schlägt für
> dieses Problem ein separates Tagesaggregat vor
> (`creator_link_statistik`), das die Löschung überlebt. Das ist nicht
> nötig: das Ereignisprotokoll überlebt sie selbst, wenn beim Löschen nur
> der Bezug genullt statt die Zeile entfernt wird. Eine Tabelle weniger,
> und die Zahlen bleiben auf Ereignisebene nachvollziehbar statt nur als
> Tagessumme.

> **Zweite Korrektur.** Der alte Plan setzt auf
> `references auth.users on delete set null` bzw. `on delete cascade` als
> Automatik. Die greift hier nie: `deleteAccount()` **löscht die Zeile in
> `auth.users` nicht**. Es ruft `anonymize_account()` und entwertet die
> Zugangsdaten anschliessend über `updateUserById` (neue E-Mail, neues
> Zufallspasswort). Wer sich auf `on delete` verlässt, baut eine Löschung,
> die nie stattfindet.

### Schritt 7 — Auswertung

Zuerst **ohne Code**, als SQL im Supabase-Editor. Der Trichter, der die Frage
beantwortet:

```sql
select
  k.code,
  count(*) filter (where k.art = 'registrierung')                  as registrierungen,
  count(*) filter (where k.art = 'abo_start')                      as abos,
  count(*) filter (
    where k.art = 'abo_start'
      and k.ereignis_am <= k.registriert_am + interval '90 days'
  )                                                                as abos_im_fenster,
  count(*) filter (where k.art = 'abo_ende')                       as beendet
from public.creator_konversionen k
group by k.code
order by abos desc;
```

Das Attributionsfenster steht hier als `interval` in der Abfrage — genau
dort gehört es hin, und genau deshalb lässt es sich ändern, ohne die Daten
anzufassen. „Hat Max etwas gebracht?" ist damit eine Zeile Änderung entfernt
von „hat Max etwas gebracht, das länger als 30 Tage gehalten hat?".

Eine Moderationsansicht unter `/moderation/creator` (die Seite existiert
bereits) lohnt sich erst, wenn diese Zahlen wöchentlich gebraucht werden.
Falls doch eine View: `security_invoker = true` setzen und den Zugriff über
die Basistabellen regeln — die Befundtabelle in
`docs/audit/README.md#remediation-status` enthält Findings zu genau diesem
Thema.

### Schritt 8 — Datenschutzerklärung, in zwei Repos

Der Teil, der vergessen wird und den Rest blockiert.

`docs/rechtstexte/datenschutz.md`, Abschnitt 3, sagt heute wörtlich: „Strado
setzt **keine Werbe- oder Trackingcookies**", und listet darunter jeden
verwendeten Speicher in einer Tabelle. Nach Schritt 1 stimmt beides nicht
mehr vollständig. Nötig ist:

- eine neue Tabellenzeile: *Zuordnung des Einstiegswegs (Creator-Link)* /
  Cookie `strado_herkunft` / *First-Party, 90 Tage, wird an niemanden
  weitergegeben*;
- eine Formulierung davor, die zu dieser Zeile passt;
- in Abschnitt 4 (Bearbeitungszwecke) die Messung der eigenen Werbewege.

**Und das ist ein Change über zwei Repositories.** Die veröffentlichte
Fassung liegt als HTML in `janlampert08-dev/stradoinfo`
(`legal/datenschutz.html`, die Tabelle ab Zeile 334) und wird unter
`strado.ch/legal/datenschutz` ausgeliefert. Der Markdown-Entwurf hier ist
erst dann die geltende Fassung, wenn die HTML-Seite nachgezogen ist — und
der Link auf diese Seite steht im Registrierungsformular, also genau in dem
Schritt, in dem das Cookie ausgewertet wird.

Einschätzung, die keine juristische Prüfung ersetzt: First-Party-Cookie,
keine Weitergabe, kein Profil über mehrere Websites, Zweck ist die Messung
der eigenen Werbewege. Damit kein Werbecookie im üblichen Sinn, aber
eindeutig **nennungspflichtig** (Transparenz, Art. 19 DSG).
Zustimmungspflichtig nach Schweizer DSG nach meinem Verständnis nicht; für
EU-Besucher gilt eine andere Rechtslage. Die Abwägung gehört dir — die
Nennung ist aus meiner Sicht nicht verhandelbar.

**Die cookiefreie Alternative**, falls Schritt 8 vermieden werden soll: Der
Route Handler leitet auf `/registrieren?c=<code>` weiter, der Code reist als
verstecktes Formularfeld mit (wie `next` es schon tut, siehe
`RegistrierenForm.tsx`). Kostet die Zuordnung bei jedem, der erst schaut und
später zurückkommt — also vermutlich bei der Mehrheit, und damit genau bei
dem Fall, um den es in diesem Dokument geht. Als Zwischenschritt tragbar,
als Endzustand nicht.

---

## 5. Reihenfolge und Aufwand

| # | Schritt | Ergebnis | Aufwand | Migration | Rechtstext |
| --- | --- | --- | --- | --- | --- |
| 1 | Cookie im Handler | Herkunft überlebt den Klick | ~2 h | nein | **ja** (blockierend) |
| 2 | `signUp()` reicht durch | Herkunft erreicht `auth.users` | ~1 h | nein | nein |
| 3 | Migration A | Herkunft + Protokoll stehen in der DB | ~3 h | **ja** | nein |
| 4 | Migration B (Trigger) | **Der Kauf nach zwei Monaten ist zugeordnet** | ~3 h | **ja** | nein |
| 6 | Löschung nachziehen | Zahlen überleben Kontolöschungen | ~1 h | **ja** | nein |
| 7 | Auswertung (SQL) | Der Trichter | ~1 h | nein | nein |
| 5 | Klicks zählen | Der Nenner | ~2 h | **ja** | nein |

Schritt 5 steht bewusst am Ende: er ist der einzige, der Schreiblast auf den
öffentlichen Pfad legt, und der einzige, der komplett entfallen kann.

Die Schritte 1–4 gehören in **einen** PR — einzeln ergeben sie kein
lauffähiges Ganzes (ein Cookie, das niemand liest; eine Tabelle, die niemand
füllt). Schritt 6 kann derselbe PR sein, muss aber vor dem ersten echten
Kauf über einen Creator-Link live sein.

---

## 6. Fallen

| Falle | Warum sie beisst | Was zu tun ist |
| --- | --- | --- |
| `subscriptions` ist Upsert-Zustand | Der erste Kaufzeitpunkt existiert nirgends; nach Kündigung + Neuabo ist er weg | Ereignisprotokoll, Abschnitt 3b |
| `anonymize_account()` löscht die Abo-Zeile (`0076`) | Ein zahlender, später gelöschter Nutzer verschwindet aus jedem JOIN | Protokollzeile bleibt, `user_id` wird genullt |
| `deleteAccount()` löscht `auth.users` **nicht** | `on delete cascade`/`set null` feuert nie | Löschung ausdrücklich in `anonymize_account()` schreiben |
| `user_metadata` überlebt die Löschung | `herkunft_code` bliebe in `auth.users` stehen | In denselben `updateUserById`-Merge aufnehmen wie `display_name` |
| `raw_user_meta_data` ist client-setzbar | Erfundene Codes fluten die Zahlen | Prüfung gegen `creator_links` **im Trigger** |
| Stripe liefert Webhooks mehrfach | Jede Zustellung schriebe eine Konversion | Unique-Index auf `(art, stripe_subscription_id)` |
| `profiles` ist öffentlich lesbar (`using (true)`) | Jede Spalte dort wäre für `anon` abrufbar | Eigene Tabellen, RLS ohne Policy, keine Grants |
| `0059` ist Protected Area | `apply_subscription_state` umschreiben heisst Kulanz-/Lock-Logik anfassen | Trigger auf der Tabelle statt Änderung der Funktion |
| Migrationen werden **von Hand** eingespielt | Grünes CI sagt nichts über das Schema | Erst Staging, dann Produktion, Objekte prüfen (`supabase/migrations/README.md`) |
| Migrationsnummern sind nicht eindeutig | Sechs Präfixe existieren doppelt | Nummer beim Anlegen prüfen; CI ist rot bei neuer Kollision |
| **Staging benutzt die Produktionsdatenbank** (bestätigt 2026-09-14) | Ein Test-Kauf in der Stripe-Sandbox schreibt eine echte Konversionszeile | Bekannt und so gewollt. Auf Staging mit klar erkennbaren Test-Codes arbeiten und sie hinterher aus der Auswertung nehmen — löschen geht nicht, der Fremdschlüssel hält sie |
| 308-Redirect wird dauerhaft gecacht | Der Handler liefe beim zweiten Klick nicht, kein Cookie | 307 + `Cache-Control: no-store` — steht schon so drin |
| In-App-Browser („In Safari öffnen") | Der Wechsel verliert das Cookie | Nicht lösbar, nur einzupreisen: die Zuordnung ist eine Untergrenze |
| Bestandsnutzer klicken den Link | Kein neues Konto, also keine Zuordnung | Bewusst so: gemessen wird Werbung, nicht Reaktivierung — oder Entscheidung 4 |
| Keine Component-/E2E-Tests im Projekt | Handler und `signUp()`-Pfad bleiben ungetestet | Logik nach `lib/` ziehen (First-Touch-Regel, Fensterberechnung), Lücke im PR benennen |
| Vercel Web Analytics zählt nur Production | Staging-Klicks fehlen im Dashboard | Beim Testen nicht wundern |

---

## 7. Offene Entscheidungen

Diese ändern, was gebaut wird — sie gehören dir, nicht mir.

1. **Wie lange gilt die Herkunft?** Cookie-Laufzeit (technische Obergrenze)
   und Attributionsfenster (Auswertungsregel) sind zwei verschiedene Zahlen.
   Vorschlag: Cookie 90 Tage, Fenster in der Auswertung zunächst unbegrenzt,
   weil die Daten beides hergeben. Wer Lifetime-Attribution verspricht,
   verspricht sie auf Basis eines Cookies, das ein Browser-Reset löscht —
   das gehört in jede Creator-Vereinbarung.
2. **Was zählt als „gebracht"?** Registrierung, bestätigte E-Mail, erste
   Fahrt, oder ein Abo, das 14 Tage überlebt hat? Das Protokoll kann alle
   vier beantworten, aber die Zusage an den Creator muss vor der ersten
   Auszahlung feststehen.
3. **Wird vergütet?** Wenn ja, braucht es über diesen Plan hinaus: eine
   eingefrorene Abrechnungszeile (Betrag zum Zeitpunkt der Auszahlung),
   die Behandlung von Rückerstattungen (`charge.refunded`, heute nicht
   erfasst) und eine schriftliche Vereinbarung. Dann wird aus einer
   Messung ein Finanzbeleg, mit allem, was daran hängt.
4. **Zählt ein bereits registrierter Nutzer, der über einen Creator-Link
   zurückkommt?** Heute: nein. Anders wäre es ein eigenes Ereignis
   (`rueckkehr`) und eine eigene Definition.
5. **Sehen Creator ihre eigenen Zahlen?** Eigene Oberfläche, eigene
   Auth-Entscheidung, deutlich mehr Arbeit. Vorschlag: zunächst manuell
   melden.
6. **Klicks serverseitig zählen?** Ohne den Nenner ist die Conversion-Rate
   nicht berechenbar; mit ihm schreibt der öffentliche Pfad bei jedem Klick.

---

## 8. Umsetzung

Nach `AGENTS.md` → Release Flow: PR gegen `staging`, nicht gegen `main`.

**Einen Probelauf für die Migrationen gibt es nicht.** Staging und
Produktion sind dieselbe Datenbank — am 2026-09-14 bestätigt und so
gewollt. Die Migrationen werden also einmal angewendet, von Hand, und
diese eine Anwendung ist die produktive; geprüft wird an den Objekten, nicht
am Ledger (`supabase/migrations/README.md` nennt die Abfragen). Alle drei
sind additiv, der Weg zurück steht ebenfalls dort.

Definition of Done wie im Repo üblich: `npm run test`, `npm run lint`,
`npm run build` tatsächlich laufen lassen und die Ergebnisse in die
PR-Beschreibung schreiben. Zusätzlich für diesen Plan:

- `lib/actions/auth.ts` ist Protected Area — die PR-Beschreibung muss
  begründen, warum die Änderung sicher ist (kein neuer Admin-Client, keine
  neue Berechtigung, der durchgereichte Wert wird in der Datenbank geprüft).
- Die neue `SECURITY DEFINER`-Funktion braucht die Begründung aus
  Schritt 4 in der PR-Beschreibung.
- Tests in `lib/`: First-Touch-Regel, Code-Normalisierung im
  Cookie-Pfad, Fensterberechnung. Dass Handler und `signUp()` selbst
  ungetestet bleiben, gehört ausdrücklich in die PR-Beschreibung.
