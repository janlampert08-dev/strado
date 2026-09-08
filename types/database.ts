// Handgeschriebene Typen passend zum Schema in supabase/migrations/0001_init.sql.
// Sobald ein Supabase-Projekt verknüpft ist, können diese durch
// `npx supabase gen types typescript --linked` ersetzt/aktualisiert werden.

export type FahrzeugTyp = "auto" | "motorrad";
export type Getriebe = "manuell" | "automatik";
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
  // true nur für Abschnitte innerhalb Kanton Zürich, die mit dem amtlichen
  // "Signalisierte Geschwindigkeit"-Datensatz (GDS 102) abgeglichen wurden.
  amtlich?: boolean;
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

export interface RouteRating {
  id: string;
  route_id: string;
  user_id: string;
  // Sterne-Bewertung entfernt (siehe 0025_ratings_ohne_sterne.sql) — Spalte
  // bleibt in der DB für evtl. schon vorhandene Alt-Daten, wird von der App
  // aber nicht mehr geschrieben oder angezeigt.
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
  // Siehe 0021_premium_und_private_strecken.sql. ist_premium ist vorerst
  // manuell gesetzt (kein Zahlungsanbieter angebunden).
  ist_premium: boolean;
  zeigt_premium_badge: boolean;
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

// Minimales Database-Interface für den generischen Supabase-Client-Typparameter.
// Wird in Phase 2/3 durch generierte Typen ersetzt.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Database = any;
