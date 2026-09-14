# Premium-Ausbau: Umsetzungsplan für vier Features

Umsetzungsplan für die vier Features, die aus `docs/premium-naechste-features.md`
zur Umsetzung ausgewählt wurden, plus die bereits gebauten erweiterten Filter.

Dieses Dokument sagt **wie**, nicht **ob** — das Ob steht im Begleitdokument.
Es ersetzt weder `docs/premium-plan.md` (Kostenmodell, Preis, Stripe-Mechanik)
noch `AGENTS.md` (Verfassung), sondern setzt beide voraus.

**Reihenfolge der Umsetzung:** Abzeichen → GPX-Import → Garage/Wartung →
Sammlungen → Filter. Jedes Feature ist ein eigener PR gegen `staging`. Kein PR
wartet auf einen anderen; die Reihenfolge ist nach Aufwand und Risiko sortiert,
nicht nach technischer Abhängigkeit.

---

## 0. Zwei Korrekturen am Begleitdokument

`docs/premium-naechste-features.md` trägt zwei Aussagen, die zum Zeitpunkt
dieses Plans nicht mehr stimmen. Beide verzerren die Priorisierung, deshalb
stehen sie hier vorn:

1. **„A1 gehört vor dieses Feature"** (als Blocker der Auswertung). Zwei der
   drei Beine von A1 sind geschlossen — Deckungsgrad seit `0078`
   richtungssensitiv, Schreib-Autorisierung durch die Trigger aus `0052`,
   `0059` und `0074`. Offen ist allein `dauer_sekunden`, und die Auswertung
   zeigt deshalb bewusst keine Zeiten. Der Blocker ist durch Zuschnitt gelöst.
2. **„Wetterfenster — der einzige Vorschlag mit laufenden Fremdkosten."**
   `lib/weather.ts` nutzt Open-Meteo: kein API-Key, kostenlos, bereits mit
   `next: { revalidate: 600 }` gecached. Die offene Frage ist die
   Fair-Use-Grenze, nicht der Preis pro Aufruf.

Beide Punkte betreffen nicht die vier Features hier, sind aber beim nächsten
Lesen des Begleitdokuments mitzuziehen.

---

## 1. Die UI-Regel, an der alles zu messen ist

Die Anforderung lautet: sauber integriert, nicht überladen. Das ist keine
Geschmacksfrage, sondern eine Regel mit vier Teilen. Jeder PR unten hält sie
ein, und jede Abweichung muss in der PR-Beschreibung begründet werden.

**1. Jedes Feature bekommt genau einen Ort, und dieser Ort existiert bereits.**

| Feature | Ort | Neu? |
| --- | --- | --- |
| Abzeichen | neben dem Namen + ein Schalter in der bestehenden Sichtbarkeitsliste | nein |
| GPX-Import | `app/fahrten/importieren`, verlinkt aus „Meine Fahrten" im Profil | eine Seite, kein Navigationspunkt |
| Garage/Wartung | `app/profil/fahrzeuge/[id]`, erreichbar über die bestehende Fahrzeugkachel | eine Detailseite zu einem Objekt, das es schon gibt |
| Sammlungen | eigenes `<details>` in der bestehenden Gruppen-Card „Meine Fahrten" | nein |
| Filter | das gebaute Panel in `ExploreView` einhängen | nein |

**2. `BottomNav` wird nicht angefasst.** Fünf Einträge sind das Maximum, das
auf einem Telefon lesbar bleibt. Kein Feature dieses Plans rechtfertigt einen
sechsten.

**3. Die Startseite bekommt nichts dazu.** Sie ist Schritt 1 der Kernschleife.
Ein Premium-Hinweis dort kostet Entdeckung und bringt nichts — der bestehende
Ort für den Kauf-Einstieg (`PremiumCard`, zuunterst im Profil) bleibt der
einzige.

**4. Kein neues visuelles Muster.** Alles baut auf `components/ui/` (Card,
Switch, Dialog, EmptyState, Button, Input), auf `SectionSummary` + natives
`<details>` aus `app/profil/page.tsx` und auf dem Pillen-Muster aus
`components/MotorklasseBadge.tsx` auf. Wer hier eine neue Kachelart erfindet,
hat die Regel gebrochen.

**Zusätzlich, für alle vier:** Logik, die sich lohnt zu prüfen, wandert nach
`lib/`. Vitest läuft mit `environment: "node"`, es gibt keine
Component-Tests — eine Regel, die in einer `.tsx` steht, ist in diesem Projekt
schlicht ungetestet.

---

## 2. Feature 1 — Das Abzeichen

**Was:** Das Signet — das flachgedrückte „o" aus `lib/marke.ts` — erscheint
klein hinter dem Anzeigenamen einer Person, die Premium hat und das Abzeichen
eingeschaltet hat. Ein- und ausschaltbar.

**Warum zuerst:** Es ist das kleinste Stück Arbeit auf dieser Liste und das
einzige, das `docs/premium-plan.md` in der Positionierung ausdrücklich
verlangt („Abzeichen als sichtbarer Dank"). Die halbe Infrastruktur steht
bereits.

### Was schon existiert

- `profiles.zeigt_premium_badge` — Spalte aus `0021`, mit Kommentar
  („Opt-in: dezentes Premium-Symbol neben dem Namen"). Default `false`.
- `0034` hat die Spalte im `grant select` **und** im `grant update` für
  `authenticated` — der Nutzer darf sie also heute schon selbst setzen.
- Die drei Bestenlisten-Views (`0027`, `0028`, `0056`) liefern bereits
  `(p.ist_premium and p.zeigt_premium_badge) as ist_premium` aus. Die
  datenschutzrichtige Projektion ist gebaut.
- `0076` (Kontoanonymisierung) setzt die Spalte auf `false` zurück.

Entfernt wurde am 2026-09-07 nur die App-Seite: `lib/actions/profile.ts`
schreibt die Spalte nicht mehr, `lib/leaderboard.ts` liest sie nicht mehr,
gerendert hat sie nie jemand.

### Migration `0087_premium_abzeichen_spalte.sql`

Eine generierte Spalte, und sonst nichts:

```sql
alter table public.profiles
  add column zeigt_premium_abzeichen boolean
  generated always as (ist_premium and zeigt_premium_badge) stored;

grant select (zeigt_premium_abzeichen) on public.profiles to anon, authenticated;
```

**Warum überhaupt eine Spalte, wenn die App die beiden Werte auch selbst
verknüpfen könnte:** weil sie es dann aus `profiles.ist_premium` täte. Dieses
Feld ist seit `0034` roh an `anon` und `authenticated` freigegeben — ein
direkter PostgREST-Request liest heute den Abo-Status jeder Person, auch der,
die kein Abzeichen zeigen will. Genau das wollten `0027` und `0028` für die
Views verhindern.

Das ist ein **bestehender Befund, nicht einer dieses Features** — und er wird
hier bewusst nicht mitrepariert (`AGENTS.md`: ausserhalb des Auftrags
Gefundenes wird gemeldet, nicht nebenbei behoben). Die generierte Spalte sorgt
dafür, dass der neue Code sich gar nicht erst darauf stützt: wird
`select (ist_premium)` später in einem eigenen PR entzogen, muss an diesem
Feature keine Zeile angefasst werden.

**Nicht vergessen:** `types/database.ts` im selben Commit (`Profile`).

### Die Komponente

`components/PremiumSignet.tsx` — Server Component, kein `"use client"`:

- Inline-SVG aus `SIGNET` (`lib/marke.ts`), `fill="currentColor"`, damit es
  wie die Wortmarke die Textfarbe erbt.
- **Grösse über die Höhe, nie über die Breite.** Das Signet ist 92 × 54, also
  1.704 : 1. `h-[…] w-auto` — eine quadratische Klasse quetscht es. Dieselbe
  Falle ist in `EmptyState` (`h-7 w-auto`) schon dokumentiert.
- **Untergrenze 8 px.** Die vertikale Wandstärke beträgt (27 − 14.5) / 54 =
  23 % der Höhe; bei 8 px sind das 1.8 px Wand und 4.3 px Loch. Darunter
  schliesst sich die Punze — derselbe Effekt, wegen dem `app/favicon.ico` den
  16-px-Rahmen grösser zeichnet als die anderen. Konkret:
  `className="h-[max(8px,0.62em)] w-auto"`.
- Farbe: `text-accent`. Ein gedecktes Grau liest sich neben einem Namen wie
  „deaktiviert", nicht wie Dank.
- Barrierefreiheit: `role="img"` mit `aria-label="Premium-Unterstützer"` plus
  `title` fürs Zeigegerät. Nicht `aria-hidden` — dann verschwindet die
  Information für Screenreader vollständig.
- Abstand zum Namen: `ml-1.5`, und der Name-plus-Signet-Block bekommt
  `inline-flex items-center`, damit das Signet auf der Grundlinie sitzt und
  bei einem Namensumbruch mitwandert statt allein in der nächsten Zeile zu
  landen.

### Wo es erscheint — und wo nicht

Erscheint (sechs Stellen, alle „ein Mensch wird als Mensch gezeigt"):

1. Fremdes Fahrerprofil, Kopf (`app/fahrer/[id]`)
2. Eigenes Profil, Kopf (`app/profil`) — damit man sieht, was man eingeschaltet hat
3. Feed-Karte, Autorzeile (`app/feed`)
4. Fahrt-Detailseite, Autorzeile (`app/fahrten/[id]`)
5. Bestenlisten-Zeilen (`app/leaderboards`, `RouteLeaderboardPreview`)
6. Kudos-Liste (`components/ActivityKudosList.tsx`)

Erscheint **nicht**: Moderationsansichten, Bewertungsliste, Follower-Modal,
Profilsuche. Dort ist ein Name ein Datenfeld in einer dichten Liste, kein
Auftritt.

**Zur Sorge „überladen":** Der eigentliche Schutz ist, dass die Spalte per
Default `false` ist. Niemandes Oberfläche ändert sich, bis jemand den Schalter
selbst umlegt. Ein 15 px breites Zeichen bei einer Minderheit von Konten ist
kein Lärm.

**Zur Bestenliste im Besonderen:** AGB Ziff. 11.3 hält fest, dass Strado kein
Wettbewerb um Geschwindigkeit ist. Ein bezahltes Zeichen neben einer
Platzierung darf nicht wie ein Rangabzeichen wirken. Die Grösse trägt das —
wenn es im Test doch wie Status wirkt, ist die Bestenliste die erste Stelle,
die wieder herausfällt, nicht die letzte.

### Datenbeschaffung

Zwei Quellen, gleiche Bedeutung — das ist Absicht und gehört kommentiert,
damit es niemand „vereinheitlicht":

- **Bestenlisten:** die Views liefern die verknüpfte Zahl bereits als
  `ist_premium`. `lib/leaderboard.ts` selektiert sie zusätzlich und reicht
  sie als `zeigtAbzeichen` durch. **Kein SQL nötig.**
- **Alles andere** liest `profiles` direkt (`lib/profile.ts`, `lib/feed.ts`,
  `lib/completions.ts`, `lib/kudos.ts`): dort kommt die neue Spalte
  `zeigt_premium_abzeichen` in die Select-Liste.

### Der Schalter

In `components/VisibilitySettings.tsx`, als weiterer Eintrag im bestehenden
`FIELDS`-Array — kein neuer Block, keine eigene Card:

```
{ name: "zeigtPremiumAbzeichen", formKey: "zeigt_premium_badge",
  label: "Premium-Abzeichen neben dem Namen zeigen",
  description: "Ein kleines Strado-Zeichen hinter deinem Namen. Andere sehen daran, dass du Strado unterstützt." }
```

Zwei Feinheiten, ohne die es falsch wird:

1. **Nur für Abonnenten rendern.** Ein toter Schalter für alle anderen ist
   genau die Überladung, die es zu vermeiden gilt. `VisibilitySettings`
   bekommt dafür ein `istPremium`-Prop; die Seite
   (`app/profil/einstellungen/page.tsx`) hat den Status über
   `getPremiumStatus()` ohnehin.
2. **Ein verstecktes Markierungsfeld daneben**
   (`<input type="hidden" name="premium_abzeichen_vorhanden" value="1">`),
   und `updateVisibilitySettings` schreibt `zeigt_premium_badge` **nur**,
   wenn diese Markierung ankommt. Sonst passiert Folgendes: Ein Abo läuft
   aus, der Schalter verschwindet aus der Oberfläche, die nächste beliebige
   Einstellungsänderung schickt das Feld nicht mehr mit — und die bestehende
   `=== "true"`-Auswertung liest das als „aus" und löscht die Einstellung
   still. Beim erneuten Abschluss wäre sie weg, ohne dass es jemand angefasst
   hätte.

Der Kommentar in `lib/actions/profile.ts`, der begründet, warum die Spalte
nicht mehr geschrieben wird, wird durch die neue Begründung ersetzt.

### Prüfen

`lib/premiumAbzeichen.ts` mit der einen Entscheidung
(`zeigtAbzeichen(istPremium, optIn)`) plus Test — trivial, aber es ist die
einzige Stelle, an der die Regel überhaupt prüfbar ist, und sie hält die
Verknüpfung für die Nicht-View-Pfade an einem Ort.

### Aufwand

Klein. Eine Migration, eine Komponente, sechs Einbaustellen, ein Schalter.

---

## 3. Feature 2 — GPX-Import

**Was:** Eine `.gpx`-Datei aus Calimoto, Kurviger, REVER, Garmin oder Strava
hochladen und als freie Fahrt in Strado speichern.

**Warum:** Es ist das einzige Feature dieses Plans, das am ersten Tag eines
Kontos etwas wert ist. Alles andere in Premium sind Obergrenzen, die man erst
spürt, wenn man die App längst nutzt.

### Der architektonische Glücksfall

`logFreeRide` (`lib/actions/completions.ts:611`) nimmt heute schon einen
rohen Trail aus dem `FormData` entgegen, leitet **alle** Kennzahlen
serverseitig ab (`computeTrailStats`, `movingSeconds`,
`implausibilityReason`, `publicationBlockReason`) und ignoriert bewusst jede
vom Client geschickte Zahl. `TrailPoint` ist `{ lng, lat, t }` — genau das,
was ein `<trkpt lat lon>` mit `<time>` hergibt.

Der Import braucht deshalb **keinen zweiten Speicherpfad**. Er braucht einen
Parser, der aus einer Datei einen `TrailPoint[]` macht, und dann denselben
Weg wie jede andere freie Fahrt.

### `lib/gpxImport.ts` — und warum ohne neue Abhängigkeit

Ein allgemeiner XML-Parser (`fast-xml-parser` o. ä.) wäre eine neue
Abhängigkeit (Kernregel 15) auf einem Pfad, der **fremde Dateien**
entgegennimmt. Entity-Expansion und externe Entitäten sind dort die
klassische Angriffsfläche, und sie abzuschalten heisst, die Konfiguration
eines Pakets zu prüfen, das viel mehr kann als hier gebraucht wird.

Gebraucht wird genau eine Grammatik: `<trkpt lat="…" lon="…">` mit optionalem
`<ele>` und `<time>`, gruppiert in `<trkseg>`. Ein fokussierter Scanner dafür
ist kleiner als die Konfiguration des Pakets, vollständig in Vitest prüfbar
und kennt keine Entitäten. **Entscheidung: selbst geschrieben, gehärtet:**

- Dateigrösse vor dem Parsen begrenzen (Vorschlag: 10 MB) — serverseitig,
  nicht nur im `accept`-Attribut.
- Keine Entity-Auflösung; `&lt;`-artige Referenzen werden in Attributwerten
  nur für die fünf vordefinierten Entitäten aufgelöst.
- Punkte hart deckeln, bevor daraus Objekte werden.
- `lat` ∈ [−90, 90], `lon` ∈ [−180, 180], sonst Punkt verwerfen.

### Die vier echten Fallstricke

1. **Zu viele Punkte.** `MAX_TRAIL_POINTS = 20_000` (`lib/track.ts`). Ein
   Garmin-Track mit 1-Sekunden-Takt sprengt das bei einer Tagestour. Lösung:
   nach dem Parsen `simplifyTrack(points, TRACK_SIMPLIFY_TOLERANCE_M)` — die
   Funktion existiert und wird im Aufzeichnungspfad schon genau dafür genutzt.
   Erst danach die Grenze prüfen.
2. **Zu lang.** `MAX_RIDE_SECONDS = 12 * 3600` in `implausibilityReason`. Eine
   mehrtägige Tour in einer Datei wird abgelehnt. Das ist richtig so, muss
   aber als **verständliche Meldung** herauskommen („Diese Datei enthält mehr
   als 12 Stunden am Stück — bitte pro Tag eine Datei"), nicht als
   „unplausibel". Optionaler Ausbau: pro `<trkseg>` eine Fahrt anbieten.
3. **Keine Zeitstempel.** Manche Exporte (vor allem geplante Routen statt
   gefahrener Tracks) haben keine `<time>`. Ohne Zeit gibt es keine Dauer und
   keine Bewegtzeit, und `publicationBlockReason` hängt an
   `MIN_PUBLIC_MOVING_SECONDS`. Solche Dateien werden **abgelehnt**, mit
   klarer Begründung: eine geplante Route ist keine gefahrene Fahrt. Wer eine
   Route importieren will, meint das Streckenformular.
4. **Der Bewegungsprofil-Filter.** `lib/bewegungsprofil.ts` wirft Zug- und
   Flugspuren heraus. Für echte Importe ist das unproblematisch, aber der
   Pfad muss ihn durchlaufen wie jede andere Fahrt — nicht umgehen.

### Migration `0088_fahrt_quelle_import.sql`

Hier liegt die eigentliche Sorgfalt dieses Features.

```sql
alter table public.route_completions
  add column quelle text not null default 'aufzeichnung'
  check (quelle in ('aufzeichnung', 'import'));
```

**Und — im selben Migrationsschritt — der Ausschluss aus den Bestenlisten.**
Eine importierte Fahrt trägt Zeitstempel und Geometrie aus einer fremden
Datei. Das ist A1 in Reinform, nur ohne jede Schranke: wer eine Datei
schreiben kann, schreibt sich beliebige Kilometer. `leaderboard_completions`
(zuletzt `0056`) zählt heute **alle** Fahrten, freie eingeschlossen. Also:

- `leaderboard_completions` und `leaderboard_user_totals` droppen und neu
  anlegen mit `where rc.quelle <> 'import'` — **inklusive ihrer Grants**,
  die ein `DROP` nicht überlebt. `0056` macht genau das vor und erklärt auch,
  warum `CREATE OR REPLACE` hier nicht reicht.

Weil die Spalte den Default `'aufzeichnung'` trägt, ändert die Migration für
jede bestehende Zeile nichts. Sie ist additiv und darf deshalb ohne
Staging-Probe laufen — anders als eine Migration, die etwas umschreibt (siehe
den Vorbehalt zur Staging-Datenbank in `AGENTS.md`).

**Was der Import darf und was nicht:**

| | importierte Fahrt |
| --- | --- |
| In der eigenen Auswertung, Heatmap, Garage-Kilometern | **ja** |
| Öffentlich teilbar (Feed, Profil) | **ja**, mit sichtbarer Markierung |
| In Bestenlisten | **nein**, per View ausgeschlossen |
| Löst Streckenerkennung aus (`save_free_ride_with_segments`) | **nein** |

Der letzte Punkt ist leicht zu übersehen und der gefährlichste: ein erkannter
Streckenabschnitt aus einer importierten Datei wäre eine Streckenfahrt — und
die zählt. Der Importpfad ruft die Erkennung nicht auf.

Die Markierung in der Oberfläche ist eine Pille im Muster von
`MotorklasseBadge` („Importiert"), auf der Fahrt-Detailseite und in der
Fahrtenliste. Nicht versteckt: eine Fahrt, die nicht in der Wertung ist, muss
das zeigen, sonst sucht jemand den Fehler in der Bestenliste.

### Oberfläche

Eigene Seite `app/fahrten/importieren`, mit **einem** Einstieg: ein
`+ Importieren`-Link im Kopf der bestehenden Section „Meine Fahrten" im
Profil — dasselbe Idiom, das die Fahrzeuge-Section für `+ Hinzufügen` schon
benutzt. Kein Eintrag in `BottomNav`, kein Einschub in den Recorder unter
`/fahrten/neu`: der Recorder ist die Kernschleife, und ein zweiter
Handlungsaufruf dort kostet mehr, als der Import einbringt.

Die Seite selbst ist bewusst schmal: Dateiwahl, danach dieselbe
`RideSummaryForm`, die auch der Recorder benutzt — mit vorbelegten, aus der
Datei abgeleiteten Werten und deaktiviertem Öffentlich-Schalter, bis die
Ableitung durch ist. Für den Nutzer sieht das Speichern einer importierten
Fahrt aus wie das Speichern einer gefahrenen. Das ist der Punkt.

**Premium-Gate:** ganze Funktion, additiv (eine neue Fähigkeit, keine
bestehende Grenze). Der Gate sitzt in der Server Action, nicht nur in der
Oberfläche.

### Aufwand

Mittel — das grösste Stück dieses Plans. Parser plus Tests, eine Migration
mit zwei View-Neuanlagen, eine Seite, eine Server Action.

---

## 4. Feature 3 — Garage mit Wartungsheft

**Was:** Pro Fahrzeug Serviceeinträge (Kette, Öl, Reifen, Bremsen, Inspektion,
frei) mit Datum, und daraus abgeleitet „seit dem letzten Mal: X km".

**Warum:** Es ist das einzige Feature, das im Winter Wert hat — und Winter
ist der Monat, in dem ein Saison-Abo gekündigt wird. Genau der Massstab, den
das Begleitdokument selbst aufstellt.

### Die Zahl, die Strado ehrlich nennen kann

Strado kennt die Kilometer pro Fahrzeug bereits: `route_completions` trägt
`fahrzeug_id` und `distanz_km`. „Kilometer seit dem letzten Kettenservice" ist
damit eine Summe über die Fahrten seit dem Servicedatum — **ohne** dass
jemand einen Kilometerstand pflegen muss.

Der ehrliche Haken, und er gehört in die Beschriftung: das sind die auf
Strado aufgezeichneten Kilometer, nicht die des Fahrzeugs. Wer die Hälfte
seiner Fahrten nicht aufzeichnet, sieht die Hälfte. Deshalb:

- Die Anzeige heisst **„1 240 km auf Strado seit dem Service"**, nicht
  „1 240 km gefahren".
- Ein Serviceeintrag darf **optional** einen echten Kilometerstand tragen. Wer
  ihn pflegt, bekommt zusätzlich die Differenz zweier Stände — die richtige
  Zahl für alle, die sie wollen.
- Ein Intervall (`intervall_km`) ist ebenfalls optional. Ohne Intervall gibt
  es eine Zahl, mit Intervall einen Fortschritt.

**Keine Warnung, keine rote Fälligkeit.** Eine App, die „Kettenservice
überfällig" behauptet, obwohl sie nur einen Teil der Fahrten kennt, ist
schlechter als eine, die nur zählt. Ein dezenter Fortschrittsbalken ab
gesetztem Intervall reicht; Farbe erst, wenn der Kilometerstand gepflegt wird.

### Migration `0089_wartungen.sql`

```sql
create table public.wartungen (
  id uuid primary key default gen_random_uuid(),
  fahrzeug_id uuid not null references public.vehicles (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  art text not null check (art in ('kette','oel','reifen','bremsen','inspektion','sonstiges')),
  datum date not null default current_date,
  km_stand int check (km_stand between 0 and 2000000),
  intervall_km int check (intervall_km between 1 and 100000),
  notiz text check (char_length(notiz) <= 280),
  created_at timestamptz not null default now()
);
```

- `user_id` **redundant zum Fahrzeug, absichtlich** — es macht die RLS-Policy
  zu einem Spaltenvergleich statt zu einem Subselect auf `vehicles`.
  Konsistenz sichert ein Trigger oder ein `check`, der `user_id` gegen das
  Fahrzeug prüft; ohne das könnte jemand einen Eintrag mit fremder
  `fahrzeug_id` und eigener `user_id` anlegen.
- RLS: `select`/`all` genau auf `auth.uid() = user_id`, Muster wie
  `vehicles` in `0001_init.sql`. **Keine öffentliche View** — ein Wartungsheft
  ist privat und bleibt es.
- Index auf `(fahrzeug_id, datum desc)`.
- `types/database.ts` im selben Commit.

### Oberfläche

Neu: `app/profil/fahrzeuge/[id]` — die Detailseite zu einem Fahrzeug, die es
bisher nicht gibt. Die Fahrzeugkachel in `components/VehicleGrid.tsx` wird
anklickbar; die Löschen-Aktion zieht von der Kachel auf die Detailseite um,
was das Raster nebenbei aufräumt.

Auf der Detailseite: Kopf mit Fahrzeug und `MotorklasseBadge` (existiert),
darunter die Kilometer auf Strado, darunter das Wartungsheft als
`Card` + `divide-y` — dasselbe Listenmuster wie überall sonst. Hinzufügen
über `Dialog` (`components/ui/Dialog.tsx`), nicht über eine weitere Seite.

**Ohne Abo** zeigt die Detailseite alles ausser dem Wartungsheft, und an
dessen Stelle einen einzelnen `EmptyState` mit dem Kauf-Einstieg. Nicht
gesperrte Felder, nicht ausgegraute Schaltflächen — ein leerer Zustand mit
einem Satz.

### Prüfen

`lib/wartung.ts`: Kilometer seit einem Datum, Fortschritt gegen ein
Intervall, Auswahl des jüngsten Eintrags je Art. Reine Funktionen, alle
Randfälle (kein Eintrag, kein Intervall, Eintrag in der Zukunft, Fahrzeug
ohne Fahrten) als Tests.

### Aufwand

Mittel. Eine Tabelle, eine Detailseite, ein Dialog, ein Rechenmodul.

---

## 5. Feature 4 — Sammlungen

**Was:** Mehrere Strecken zu einer benannten, sortierten Sammlung bündeln —
und als **eine** GPX-Datei exportieren.

**Warum:** Planung ist Winterarbeit, und es hebt den bestehenden
GPX-Vorteil von „eine Strecke" auf „ein Tag".

### Abgrenzung zu Favoriten

Favoriten bleiben, wie sie sind: unbegrenzt, gratis, ungeordnet, ein Klick.
Eine Sammlung ist das Gegenteil — benannt, sortiert, exportierbar. Die beiden
dürfen sich nicht überlappen, sonst fragt sich jeder, welches von beidem er
gerade will.

### Migration `0090_sammlungen.sql`

```sql
create table public.sammlungen (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  created_at timestamptz not null default now()
);

create table public.sammlung_strecken (
  sammlung_id uuid not null references public.sammlungen (id) on delete cascade,
  route_id uuid not null references public.routes (id) on delete cascade,
  position int not null,
  primary key (sammlung_id, route_id)
);
```

- RLS auf beiden, alles an `auth.uid()`. `sammlung_strecken` prüft über die
  Sammlung — hier ist der Subselect richtig, weil die Tabelle keine eigene
  `user_id` haben soll (sie hat keinen eigenen Besitzer).
- `position` als `int` mit Lücken (10, 20, 30 …), damit Umsortieren ein
  einzelnes `update` bleibt.
- Sammlungen sind **privat**. Eine geteilte Sammlung ist ein eigenes Produkt
  (öffentliche URL, Moderation, Missbrauch) und gehört nicht in diesen PR.

### Kontingent

**Gratis eine Sammlung, mit Abo unbegrenzt** — genau das Muster der privaten
Strecken (`MAX_PRIVATE_STRECKEN_GRATIS = 1`), aus demselben Grund: die
Funktion bleibt erlebbar statt ein gesperrtes Symbol zu sein. Die Konstante
gehört nach `lib/premiumLimits.ts` zu den anderen, und die Durchsetzung in
die Datenbank — eine App-seitige Zählung ist ein Wettlauf, wie der Kommentar
zu `darf_private_strecke_anlegen` in `lib/premium.ts` bereits erklärt.

### Sammel-GPX

`lib/gpx.ts` baut heute ein Dokument mit **einem** `<trk>`. GPX 1.1 erlaubt
mehrere. Also eine zweite Funktion `buildSammlungGpx(routes)`, die pro Strecke
ein `<trk>` mit `<name>` schreibt, in der Reihenfolge der Sammlung — nicht
`buildGpx` umbauen, der Einzelexport bleibt, wie er ist. Wegpunkte: Start der
ersten und Ziel der letzten Strecke, sonst wird die Datei im Navi zu einer
Punktwolke.

### Oberfläche

Ein weiteres `<details>` in der bestehenden Gruppen-Card „Meine Fahrten" im
Profil, direkt unter „Favoriten" — `SectionSummary` mit Anzahl, exakt wie die
Nachbarn. Kein neuer Abschnitt, keine neue Seite für die Liste.

Eine Sammlung öffnen führt auf `app/sammlungen/[id]` (Liste, Sortierung,
Export). Strecken kommen über den bestehenden `RouteActionsMenu` auf der
Streckenseite hinein — dort steht der GPX-Export schon, „Zu Sammlung
hinzufügen" ist der natürliche Nachbar.

### Aufwand

Mittel. Zwei Tabellen, eine Seite, eine Menüaktion, eine GPX-Funktion.

---

## 6. Feature 5 — Erweiterte Filter, mit einem Vorbehalt

`components/AdvancedFiltersPanel.tsx` ist gebaut, `lib/exploreFilters.ts` ist
getestet, beide werden von keiner Seite gerendert. Einhängen ist eine Stunde.

**Zwei Gründe, es trotzdem zuletzt zu tun — und einer, es anders zu tun als
geplant:**

1. **Der Bestand trägt es noch nicht.** Dreizehn freigegebene Strecken. Eine
   Filterleiste über einer Liste, die auf einen Bildschirm passt, ist ein
   leeres Versprechen — der Kommentar in `ExploreView.tsx:28` sagt das seit
   Monaten und hat recht. Das Feature wird gut bei dreistelligem Bestand.
2. **Filtern ist Entdecken.** `docs/premium-plan.md` führt die erweiterten
   Filter als Premium-Funktion. AGB Ziff. 3.1 sagt dem Entdecken dauerhaft
   kostenlose Nutzung zu, und Entdecken ist Schritt 1 der Kernschleife. Einen
   Filter hinter das Abo zu stellen, verengt genau den Schritt, aus dem die
   Zahlungsbereitschaft überhaupt erst entsteht.

**Vorschlag:** Die Filter kommen **gratis**, sobald der Bestand sie
rechtfertigt. Premium bekommt stattdessen **gespeicherte Suchen** — eine
benannte Filterkombination, die man wieder aufruft. Das ist eine neue
Fähigkeit statt einer Schranke, bleibt additiv, und es ist dieselbe Mechanik
wie bei Sammlungen: Strado speichert etwas für dich.

Damit ändert sich auch, was in `PREMIUM_VORTEILE` landet: nicht „Erweiterte
Filter", sondern „Gespeicherte Suchen". **Das ist eine Produktentscheidung,
keine technische — sie gehört ausdrücklich bestätigt, bevor jemand baut.**

---

## 7. Migrationen in Reihenfolge

Höchste vergebene Nummer ist `0086`. Es gibt zurzeit **keinen offenen Pull
Request** (geprüft), also keine Kollisionsgefahr — das ist vor dem Anlegen
jeder Nummer erneut zu prüfen, weil `0034`, `0041`, `0053`, `0054`, `0059`
und `0060` je doppelt existieren.

| Nr. | Datei | Inhalt | Additiv? |
| --- | --- | --- | --- |
| `0087` | `premium_abzeichen_spalte` | generierte Spalte + Grant | ja |
| `0088` | `fahrt_quelle_import` | `quelle`-Spalte + zwei Views neu | ja (Default) |
| `0089` | `wartungen` | Tabelle + RLS + Index | ja |
| `0090` | `sammlungen` | zwei Tabellen + RLS + Kontingentfunktion | ja |

Alle vier sind rein additiv — sie legen an und nehmen nichts weg. Das ist der
Grund, warum sie ohne die Generalprobe auf einer Staging-Datenbank laufen
dürfen, die es laut `AGENTS.md` möglicherweise gar nicht separat gibt. Eine
Migration, die etwas umschreibt oder löscht, bekäme diesen Freibrief nicht.

**Reihenfolge Schema vor Code**, wie im Repo üblich: die Migration wird von
Hand angewendet, bevor der lesende Code auf `staging` landet. Eine Spalte, die
noch niemand liest, schadet nicht; Code, der eine fehlende Spalte liest, bricht.

---

## 8. Was jeder dieser PRs mitziehen muss

Nicht optional, nicht „im Folge-PR":

1. **`types/database.ts`** — im selben Commit wie die Migration.
2. **`lib/premiumVorteile.ts`** — erst, **wenn das Feature läuft**. Ein
   geplantes Feature gehört nicht in diese Liste; der Dateikopf sagt das,
   und der Grund ist, dass die Liste über AGB Ziff. 3.2 eine zugesagte
   Vertragsleistung ist.
3. **AGB Ziff. 3.2** — im selben PR wie Punkt 2, in `docs/rechtstexte/agb.md`
   **und** in den veröffentlichten Seiten im Repo `stradoinfo`. Zwei Repos,
   ein Vorgang. Kernregel 16: eine geänderte Geschäftsregel wird ausdrücklich
   benannt, nie nebenbei geändert.
4. **`npm run test`, `npm run lint`, `npm run build`** tatsächlich ausführen
   und das Ergebnis in die PR-Beschreibung schreiben. Kernregel 17.
5. **Sicherheitsblick** für alles, was `lib/actions/**` oder
   `supabase/migrations/**` berührt — das ist bei dreien der vier Features
   der Fall (`.agents/security.md` als Checkliste).

Und was **nicht** hineingehört: „while I'm here"-Aufräumen. Der rohe
`ist_premium`-Grant aus Abschnitt 2 ist der Testfall — er wird gemeldet und
umgangen, nicht in diesem PR repariert.

---

## 9. Entscheidungen, die vor dem Bauen zu treffen sind

Vier Punkte, an denen dieser Plan eine Annahme trifft, die jemand bestätigen
muss:

1. **Abzeichen in der Bestenliste — ja oder nein?** Der Plan sagt ja, weil die
   Bestenliste die Stelle ist, an der die meisten Menschen andere Menschen
   sehen. Das Gegenargument ist AGB Ziff. 11.3: ein bezahltes Zeichen neben
   einer Platzierung darf nicht wie Rang wirken.
2. **Dürfen importierte Fahrten öffentlich sein?** Der Plan sagt ja (Feed und
   Profil), mit sichtbarer Markierung und ohne Bestenlistenwertung. Strenger
   wäre: importierte Fahrten bleiben privat. Das wäre defensiv, macht das
   Feature aber deutlich weniger attraktiv.
3. **Gespeicherte Suchen statt Filter als Premium-Vorteil?** Abschnitt 6.
   Weicht bewusst von `docs/premium-plan.md` ab.
4. **Kontingent für Sammlungen: eine gratis, oder ganz hinter dem Abo?** Der
   Plan sagt eine gratis, analog zu privaten Strecken.

Nichts davon blockiert den Anfang: Feature 1 ist von allen vieren unabhängig
und kann sofort gebaut werden.
