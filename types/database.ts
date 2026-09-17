/** Woher die gewertete Dauer einer Fahrt stammt (0096/0098). */
export type DauerQuelle = "trail" | "server";

// Handgeschriebene Typen passend zum Schema in supabase/migrations/0001_init.sql.
// Sobald ein Supabase-Projekt verknüpft ist, können diese durch
// `npx supabase gen types typescript --linked` ersetzt/aktualisiert werden.

// Die Feedback-Kategorien leben in lib/constants.ts, weil das Formular
// (components/FeedbackDialog.tsx) sie als Auswahlliste braucht — hier nur
// der davon abgeleitete Typ, damit es keine zweite Werteliste gibt.
import type { FeedbackKategorie } from "@/lib/feedback";

export type FahrzeugTyp = "auto" | "motorrad";
export type Getriebe = "manuell" | "automatik";
// Die Motorklasse, in der eine Fahrt gewertet wird. Schlüssel und Grenzwerte
// stehen in lib/motorklassen.ts und — als zweite Quelle derselben Wahrheit —
// in public.motorklasse() (0080_motorklassen.sql).
export type Motorklasse =
  | "moto_a1"
  | "moto_a35"
  | "moto_a"
  | "auto_bis110"
  | "auto_bis220"
  | "auto_ueber220";
export type Kategorie = "kurvig" | "scenic" | "passstrasse" | "freie_fahrt";
export type SaisonStatus = "ganzjaehrig" | "saisonal";

export interface GeoPoint {
  type: "Point";
  coordinates: [number, number]; // [lng, lat]
}

export interface GeoLineString {
  type: "LineString";
  coordinates: [number, number][]; // [lng, lat][]
}

// Ein Tempolimit-Abschnitt entlang einer Strecke, bezogen auf die
// kumulierte Distanz ab Start (km_von/km_bis). "bekannt: false" markiert
// Abschnitte ohne OSM-maxspeed-Tag, für die ein Ausserorts-Standardwert
// (80 km/h in der Schweiz) angenommen wurde.
export interface TempolimitSegment {
  km_von: number;
  km_bis: number;
  kmh: number;
  bekannt: boolean;
  // true für Abschnitte, deren Wert aus den amtlichen Daten eines Kantons
  // oder einer Stadt stammt (Tabelle amtliche_tempolimits, 0102; Verzeichnis
  // in scripts/amtliche-tempolimits/quellen.mjs). Wo keine Quelle die Strasse
  // abdeckt, bleibt es false — eine Aussage über die Datenlage, nicht über
  // die Strasse.
  amtlich?: boolean;
  // Kennung der amtlichen Quelle (amtliche_tempolimit_quellen.id, z.B. "zh",
  // "stadt-bern"), nur bei amtlich: true.
  quelle?: string;
}

// Eine Quelle amtlicher Tempolimit-Daten (Tabelle amtliche_tempolimit_quellen, 0102).
export interface AmtlicheTempolimitQuelle {
  id: string;
  name: string;
  traeger: string;
  gebiet: string;
  datensatz: string;
  lizenz: string;
  stand: string | null;
  art: "linie" | "zone";
  rang: number;
  rand_m: number;
  anzahl: number;
  geladen_am: string;
}

// Ein Punkt des Höhenprofil-Diagramms (kumulierte Distanz ab Start, Meter ü. M.).
export interface HoehenprofilPunkt {
  km: number;
  m: number;
}

export interface Vehicle {
  id: string;
  user_id: string;
  typ: FahrzeugTyp;
  marke: string;
  modell: string;
  getriebe: Getriebe;
  baujahr: number | null;
  // Beide optional (0080). Ohne leistung_kw hat das Fahrzeug keine
  // Motorklasse; hubraum_ccm braucht nur die Abgrenzung von A1.
  hubraum_ccm: number | null;
  leistung_kw: number | null;
  created_at: string;
}

export interface Route {
  id: string;
  name: string;
  region: string;
  start_ort: string;
  ziel_ort: string;
  start_coord: GeoPoint;
  ziel_coord: GeoPoint;
  geometry: GeoLineString;
  hoehe_m: number | null;
  laenge_km: number;
  max_steigung_prozent: number | null;
  kehren: number | null;
  kategorien: Kategorie[];
  saison_status: SaisonStatus;
  status_ok: boolean;
  abgelehnt_am: string | null;
  charakter_text: string | null;
  tempolimits: TempolimitSegment[] | null;
  hoehenprofil: HoehenprofilPunkt[] | null;
  erstellt_von: string | null;
  // Premium-Feature (siehe 0021_premium_und_private_strecken.sql): private
  // Strecke ohne Moderationspflicht, nur für den Ersteller sichtbar, bis
  // explizit veröffentlicht.
  ist_privat: boolean;
  created_at: string;
}

// Zeilenform von public.routes_geojson (siehe 0002_routes_geojson_view.sql) —
// dieselben Felder wie Route, aber die geography-Spalten als GeoJSON statt WKB.
/**
 * Das Minimum, das components/RouteMap.tsx braucht, um eine Strecke zu
 * zeichnen: Linie, Start- und Zielpunkt, Name fürs Popup, Rundfahrt-Flag für
 * die Endpunkte. Herausgezogen, damit Aufrufer, die nur zeichnen wollen,
 * nicht die ganze Zeile mitschicken müssen — Höhenprofil, Tempolimits und
 * Charaktertext sind zusammen um ein Vielfaches grösser als alles hier und
 * haben auf einer Karte nichts verloren (siehe getKontextStrecken in
 * lib/routes.ts).
 *
 * Damit ist der Typ zugleich das, was RouteMap von einer Strecke verlangt:
 * eine schlank geladene Zeile (ExploreRoute) erfüllt ihn ebenso wie eine
 * vollständige (RouteGeoJSON erweitert ihn), die Karte fordert also keine
 * Spalte ein, die sie nicht anfasst.
 */
export interface KartenStrecke {
  id: string;
  name: string;
  start_geojson: GeoPoint;
  ziel_geojson: GeoPoint;
  geometry_geojson: GeoLineString;
  ist_rundfahrt: boolean;
  /** Optional, weil die Tempolimit-Ebene ohnehin nur bei genau einer Strecke
   *  gezeichnet wird — Kontext-Strecken schicken sie deshalb nicht mit. */
  tempolimits?: TempolimitSegment[] | null;
}

export interface RouteGeoJSON extends KartenStrecke {
  region: string;
  start_ort: string;
  ziel_ort: string;
  hoehe_m: number | null;
  laenge_km: number;
  max_steigung_prozent: number | null;
  kehren: number | null;
  kategorien: Kategorie[];
  saison_status: SaisonStatus;
  status_ok: boolean;
  charakter_text: string | null;
  tempolimits: TempolimitSegment[] | null;
  hoehenprofil: HoehenprofilPunkt[] | null;
  erstellt_von: string | null;
  created_at: string;
  ist_privat: boolean;
}

// Genau die Spalten, die die Explore-Ansicht und der Orientierungs-Layer der
// freien Fahrt brauchen (app/page.tsx, app/fahrten/neu/page.tsx).
//
// getRoutes() lud vorher select("*") und schickte damit für JEDE Strecke auch
// hoehenprofil, charakter_text, kategorien und die Verwaltungsspalten in die
// RSC-Nutzlast der Startseite — Felder, die dort keine Komponente anfasst.
// Die Geometrie muss mit (die Karte zeichnet sie), das Höhenprofil nicht.
//
// Als Pick<> statt als eigenes Interface, damit die Spaltennamen nur an einer
// Stelle stehen und eine spätere Änderung an RouteGeoJSON hier sofort auffällt.
export type ExploreRoute = Pick<
  RouteGeoJSON,
  | "id"
  | "name"
  | "region"
  | "start_ort"
  | "ziel_ort"
  | "start_geojson"
  | "ziel_geojson"
  | "geometry_geojson"
  | "hoehe_m"
  | "laenge_km"
  | "max_steigung_prozent"
  | "kehren"
  | "saison_status"
  | "tempolimits"
  | "ist_rundfahrt"
>;

export interface RouteRating {
  id: string;
  route_id: string;
  user_id: string;
  // 1-5 Sterne, optional. 0025_ratings_ohne_sterne.sql hatte die Wertung
  // herausgenommen und die Spalte nur noch für Alt-Daten stehen lassen;
  // 0095_sterne_wieder_einfuehren.sql hat sie zurückgeholt, samt einer
  // NULL-toleranten Check-Constraint.
  //
  // null heisst deshalb nicht "keine Daten", sondern "nur kommentiert" —
  // ein gültiger Zustand, in dem alle Zeilen zwischen 0025 und 0095
  // stecken. Wer über die Spalte mittelt, muss diese Zeilen aus dem Nenner
  // nehmen; lib/bewertungen.ts tut genau das.
  sterne: number | null;
  kommentar: string | null;
  erstellt_am: string;
}

// Siehe 0043_content_reports.sql. "grund" ist app-seitig auf REPORT_REASONS
// (lib/actions/reports.ts) beschränkt, hier als string statt Union, da der
// DB-Check-Constraint bereits die eigentliche Durchsetzung übernimmt.
export type ReportStatus = "offen" | "erledigt";

export interface RouteReport {
  id: string;
  route_id: string;
  reporter_id: string;
  grund: string;
  kommentar: string | null;
  status: ReportStatus;
  erstellt_am: string;
  bearbeitet_am: string | null;
  bearbeitet_von: string | null;
}

export interface RatingReport {
  id: string;
  rating_id: string;
  reporter_id: string;
  grund: string;
  kommentar: string | null;
  status: ReportStatus;
  erstellt_am: string;
  bearbeitet_am: string | null;
  bearbeitet_von: string | null;
}

export interface Favorite {
  user_id: string;
  route_id: string;
  erstellt_am: string;
}

// Zwei Arten von Fahrt seit 0044_freie_fahrten.sql: die Befahrung einer
// kuratierten Strecke und die freie Fahrt ohne Streckenbezug. Streckenbezogene
// Abfragen (Bestenlisten, Streckenseite, Pässe-/Höhenmeterzähler) müssen
// ausdrücklich auf "strecke" filtern — route_id ist seither nullable.
export type FahrtArt = "strecke" | "frei";

export interface RouteCompletion {
  id: string;
  user_id: string;
  art: FahrtArt;
  // null bei art = "frei" (DB-seitig per CHECK an art gekoppelt).
  route_id: string | null;
  fahrzeug_id: string | null;
  datum: string;
  foto_url: string | null;
  // Beide optional und rein privat — nur gesetzt, wenn der Nutzer den Timer
  // beim Live-Tracking aktiv eingeschaltet hat. Kein Vergleich zwischen Nutzern.
  dauer_sekunden: number | null;
  // Woher dauer_sekunden stammt (0096_fahrtstart_serverseitig.sql).
  // "server": aus fahrt_starts, also die Differenz zweier Serverzeiten — nur
  // solche Fahrten stehen in route_leaderboard. "trail": aus den
  // Zeitstempeln des Client-Trails, für die eigene Statistik brauchbar und
  // für einen Vergleich nicht. Gesetzt wird das ausschliesslich vom Trigger
  // enforce_route_completion_dauer, nie vom Client.
  dauer_quelle: DauerQuelle;
  // Die aus dem Trail gerechnete Dauer, unabhängig von dauer_quelle — das,
  // was die Uhr während der Fahrt gezeigt hat.
  dauer_trail_sekunden: number | null;
  fahrt_start_id: string | null;
  distanz_km: number | null;
  // Opt-in pro Fahrt (siehe 0017_pro_fahrt_sichtbarkeit.sql) — entscheidet im
  // Fazit-Screen bzw. nachträglich im Profil, ob diese Fahrt auf
  // Bestenlisten/öffentlichem Profil erscheint. Standardmässig false.
  ist_oeffentlich: boolean;
  // Deckungsgrad (0-100) ggü. der offiziellen Streckengeometrie, siehe
  // 0019_streckenabdeckung.sql. Unterhalb von COVERAGE_THRESHOLD_PERCENT
  // (lib/routeCoverage.ts) kann ist_oeffentlich nicht true sein.
  // null bei freien Fahrten — es gibt keine Sollgeometrie, gegen die sich
  // decken liesse (siehe 0044_freie_fahrten.sql).
  abdeckung_prozent: number | null;
  // Optionale persönliche Notiz (max. 280 Zeichen), rein privat, siehe
  // 0020_fahrt_notiz.sql.
  notiz: string | null;
  // Ab 0044_freie_fahrten.sql, alle nur bei art = "frei" gesetzt: frei
  // getippter Titel (max. 80 Zeichen) und der per Reverse-Geocoding
  // ermittelte Ortsbezug.
  titel: string | null;
  start_ort: string | null;
  region: string | null;
  // Reine Bewegtzeit ohne Pausen (siehe movingSeconds in lib/track.ts);
  // dauer_sekunden bleibt die verstrichene Gesamtzeit.
  bewegte_zeit_sekunden: number | null;
  // Summierter Anstieg in Metern, best effort aus dem swisstopo-Höhenprofil.
  // Bewusst nicht dasselbe wie routes.hoehe_m (Scheitelhöhe einer Strecke).
  hoehenmeter_aufstieg: number | null;
  hoehenprofil: HoehenprofilPunkt[] | null;
  // Ab 0050_streckenerkennung_in_freier_fahrt.sql: bei einem automatisch aus
  // einer freien Fahrt erkannten Streckenabschnitt Verweis auf die
  // übergeordnete freie Fahrt, sonst null. Nie Teil der öffentlichen Views
  // (public_fahrten & Co.) — nur über die RLS-geschützte Basistabelle
  // sichtbar, siehe save_free_ride_with_segments.
  parent_completion_id: string | null;
  // true, wenn diese Streckenfahrt automatisch erkannt statt explizit über
  // die Streckenseite gestartet wurde. Rein informativ (Badge).
  erkennung_automatisch: boolean;
  created_at: string;
}

// Zeilenform von public.fahrt_tracks (0044_freie_fahrten.sql) — der eigene
// GPS-Track als GeoJSON. Die View läuft mit den Rechten des Aufrufers, RLS
// liefert also ausschliesslich eigene Fahrten.
export interface FahrtTrack {
  completion_id: string;
  user_id: string;
  track_geojson: GeoLineString;
}

export interface Profile {
  id: string;
  display_name: string | null;
  is_moderator: boolean;
  zeigt_fahrzeuge: boolean;
  // Vier unabhängige Opt-ins fürs öffentliche Profil, siehe
  // 0018_granulare_profil_sichtbarkeit.sql. Die Sichtbarkeit einzelner
  // Fahrten selbst läuft separat über route_completions.ist_oeffentlich.
  zeigt_avatar: boolean;
  zeigt_paesse: boolean;
  zeigt_hoehenmeter: boolean;
  zeigt_distanz: boolean;
  avatar_url: string | null;
  // Siehe 0021_premium_und_private_strecken.sql. ist_premium wird vom
  // Stripe-Webhook bzw. dem nächtlichen Abgleich fortgeschrieben (0059)
  // und kann zusätzlich von Hand gesetzt sein.
  //
  // Für die ANZEIGE des Abzeichens ist keine dieser beiden Spalten die
  // richtige: dafür steht zeigt_premium_abzeichen weiter unten.
  ist_premium: boolean;
  // Opt-in. Nur wirksam zusammen mit ist_premium — verknüpft wird in der
  // Datenbank, nicht hier.
  zeigt_premium_badge: boolean;
  // Generiert aus (ist_premium and zeigt_premium_badge), siehe
  // 0087_premium_abzeichen_spalte.sql. Nicht beschreibbar; das Opt-in
  // läuft über zeigt_premium_badge. Die einzige Spalte, die eine
  // öffentliche Leseabfrage für das Abzeichen anfassen sollte — sie legt
  // den rohen Abo-Status nicht offen.
  zeigt_premium_abzeichen: boolean;
  // Radius der Privatzone in Metern (0 = aus), siehe
  // 0045_freie_fahrten_teilen.sql und cropTrackEnds in lib/track.ts.
  privatzone_radius_m: number;
  // Zeitpunkt der Kontolöschung, null bei aktiven Konten (siehe
  // 0058_kontoloeschung_werte_nullen.sql). Ein gelöschtes Konto trägt in
  // allen übrigen Spalten nur noch null bzw. false — der Zeitstempel ist
  // das Einzige, woran es noch als gelöscht erkennbar ist. Ohne
  // Spalten-Grant an anon/authenticated: nur über den Service-Role-Client
  // lesbar.
  geloescht_am: string | null;
  created_at: string;
}

// Zeilenform von public.public_fahrten (siehe 0015/0018/0030/0032) — stark
// eingeschränkte, öffentliche Sicht auf gefahrene Strecken fürs öffentliche
// Profil, den Community-Feed (app/feed/page.tsx) und die Fahrt-
// Detailseite (app/fahrten/[id]/page.tsx).
export interface PublicFahrt {
  user_id: string;
  // Seit 0045_freie_fahrten_teilen.sql führt die View beide Fahrtarten: bei
  // einer freien Fahrt sind route_id, route_name und laenge_km null, und
  // region kommt aus coalesce(r.region, rc.region) — auch das kann null
  // sein, wenn das Reverse-Geocoding beim Speichern nichts geliefert hat.
  route_id: string | null;
  route_name: string | null;
  region: string | null;
  laenge_km: number | null;
  distanz_km: number | null;
  datum: string;
  completion_id: string;
  // Ab 0030_follows_and_feed.sql. avatar_url ist bereits serverseitig auf
  // null gesetzt, wenn der Fahrer zeigt_avatar nicht aktiviert hat.
  display_name: string | null;
  avatar_url: string | null;
  // Ab 0032_public_fahrten_dauer.sql — bei öffentlichen Fahrten schon
  // länger über route_leaderboard/leaderboard_completions offengelegt.
  dauer_sekunden: number | null;
  // Ab 0034_public_fahrten_foto.sql — für die Fotos-Sektion auf der
  // Fahrt-Detailseite (app/fahrten/[id]/page.tsx). Schon länger über
  // route_photos auf der Streckenseite öffentlich sichtbar.
  foto_url: string | null;
  // Ab 0035_public_fahrten_notiz.sql — sobald eine Fahrt öffentlich ist,
  // teilt sich ihre Notiz dieselbe Sichtbarkeit (siehe View-Kommentar).
  notiz: string | null;
  abdeckung_prozent: number | null;
  fahrzeug_typ: FahrzeugTyp | null;
  fahrzeug_marke: string | null;
  fahrzeug_modell: string | null;
  // Ab 0045_freie_fahrten_teilen.sql: die View trägt beide Fahrtarten.
  // Bei art = "frei" sind route_id/route_name/laenge_km null und titel,
  // start_ort und hoehenmeter_aufstieg treten an ihre Stelle.
  art: FahrtArt;
  titel: string | null;
  start_ort: string | null;
  bewegte_zeit_sekunden: number | null;
  hoehenmeter_aufstieg: number | null;
  // Ab 0099 in der View. Optional getypt, weil die View bis zum Einspielen
  // der Migration ohne die Spalte antwortet — dann ist der Wert undefined
  // und lib/completions.ts faellt auf "trail" zurueck.
  dauer_quelle?: DauerQuelle;
}

// Zeilenform von public.public_fahrt_tracks (0045) — der an den Enden
// gekappte Track einer öffentlichen Fahrt. Bewusst eine eigene View statt
// einer Spalte in public_fahrten, damit der Feed nicht bei jedem Aufruf
// dreissig vollständige Geometrien lädt.
export interface PublicFahrtTrack {
  completion_id: string;
  track_geojson: GeoLineString;
}

// Zeilenform von public.route_photos — nur die für eine öffentliche
// Foto-Galerie nötigen, unkritischen Felder (kein user_id, kein fahrzeug_id).
export interface RoutePhoto {
  id: string;
  route_id: string;
  foto_url: string;
  datum: string;
  display_name: string | null;
}

// Zeilenform von public.completion_photos (0036_completion_photos.sql) — der
// direkte, RLS-geschützte Eigentümer-Pfad (getCompletionDetail, eigene
// Fahrt egal ob privat/öffentlich).
export interface CompletionPhoto {
  id: string;
  completion_id: string;
  user_id: string;
  foto_url: string;
  position: number;
  created_at: string;
}

// Zeilenform von public.public_completion_photos — Fotos einer einzelnen
// öffentlichen Fahrt für Nicht-Besitzer (Fahrt-Detailseite), analog zu
// PublicFahrt/RoutePhoto: keine user_id, nur der Anzeige-Name.
export interface PublicCompletionPhoto {
  id: string;
  completion_id: string;
  foto_url: string;
  position: number;
  display_name: string | null;
}

// Zeilenform von public.feedback (siehe 0083_feedback.sql) — Rückmeldungen
// aus den Einstellungen. Einsenden darf jeder Angemeldete, lesen und
// bearbeiten nur Moderatoren; die Spalten-Grants der Migration lassen beim
// Einsenden nur user_id, kategorie und nachricht zu.
export type FeedbackStatus = "offen" | "erledigt";

export interface Feedback {
  id: string;
  user_id: string;
  kategorie: FeedbackKategorie;
  nachricht: string;
  status: FeedbackStatus;
  erstellt_am: string;
  bearbeitet_am: string | null;
  bearbeitet_von: string | null;
}

// Die drei Felder, die eine Weiterleitung unter /c/<code> braucht — genau
// das, was creator_link_aufloesen(text) zurückgibt (0084). Ohne `name`:
// die Spalte ist personenbezogen und verlässt die Moderationsansicht nicht.
export interface CreatorLinkZiel {
  code: string;
  kanal: string;
  kampagne: string | null;
}

// Zeilenform von public.creator_links, wie sie die Moderationsansicht
// unter /moderation/creator zeigt. Nur für Moderatoren lesbar (RLS, 0084).
export interface CreatorLink extends CreatorLinkZiel {
  name: string;
  aktiv: boolean;
  erstellt_am: string;
  /** Das Konto, dem der Code gehört (0091) — zugleich die Creator-Rolle:
   *  wer hier steht, sieht /creator. null, solange keines zugewiesen ist
   *  oder nachdem das zugewiesene gelöscht wurde (0092). */
  creator_user_id: string | null;
}

// Zeilenform von public.registrierung_herkunft (0088): über welchen
// Creator-Link ein Konto entstanden ist.
//
// Die Anwendung liest diese Tabelle heute nicht — sie hat keine Policy und
// keine Grants an anon/authenticated, geschrieben wird sie allein vom
// Trigger handle_new_user, gelesen vom Trigger creator_konversion_abo
// (0089). Der Typ steht hier trotzdem, weil diese Datei das Schema
// spiegelt und .agents/database.md verlangt, dass beide nicht
// auseinanderlaufen.
// Zeilenform von public.creator_klicks (0091) — ein Zähler je Code und
// Tag, ohne IP, ohne Uhrzeit, ohne Kennung. Die App liest die Tabelle nie
// direkt (RLS an, keine Grants); der Typ steht hier, weil diese Datei das
// Schema spiegelt, auch für Tabellen, an die nur die Datenbank selbst
// herankommt.
export interface CreatorKlick {
  code: string;
  /** ISO-Datum (YYYY-MM-DD). */
  tag: string;
  klicks: number;
}

export interface RegistrierungHerkunft {
  user_id: string;
  code: string;
  erstellt_am: string;
}

export type CreatorKonversionArt = "registrierung" | "abo_start" | "abo_ende";

// Zeilenform von public.creator_konversionen (0088) — das
// Ereignisprotokoll, das einen Premium-Kauf noch Monate nach der
// Registrierung dem Creator zuordnet.
//
// user_id ist nullable: bei der Kontolöschung wird der Personenbezug
// genullt, die Zeile bleibt stehen (0090). stripe_subscription_id ist bei
// art === "registrierung" null und sonst gesetzt — ein CHECK-Constraint
// hält beides zusammen.
export interface CreatorKonversion {
  // bigint; PostgREST liefert ihn als JSON-Zahl.
  id: number;
  code: string;
  art: CreatorKonversionArt;
  user_id: string | null;
  stripe_subscription_id: string | null;
  ereignis_am: string;
  erfasst_am: string;
  registriert_am: string;
}

// Minimales Database-Interface für den generischen Supabase-Client-Typparameter.
// Wird in Phase 2/3 durch generierte Typen ersetzt.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Database = any;
