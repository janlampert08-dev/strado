import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { haversineKm } from "@/lib/geo";
import type { ExploreRoute, GeoLineString, KartenStrecke, RouteGeoJSON } from "@/types/database";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Die Spalten aus ExploreRoute, als String für PostgREST. Aus dem Typ
// abgeleitet zu halten geht nicht (Typen existieren zur Laufzeit nicht) —
// deshalb hier einmal ausgeschrieben und in types/database.ts dokumentiert.
const EXPLORE_SPALTEN =
  "id, name, region, start_ort, ziel_ort, start_geojson, ziel_geojson, geometry_geojson, hoehe_m, laenge_km, max_steigung_prozent, kehren, saison_status, tempolimits, ist_rundfahrt";

// Vorher select("*"). Das lud für jede freigegebene Strecke zusätzlich
// hoehenprofil, charakter_text, kategorien, status_ok, erstellt_von,
// created_at und ist_privat — und schickte sie in die RSC-Nutzlast der
// Startseite, wo keine Komponente sie liest (nachgeprüft an ExploreView,
// ExploreSidebar, RouteMap, exploreFilters, signature, search, useLiveLapHint).
// Das Höhenprofil ist dabei der teuerste Posten nach der Geometrie: ein
// Array aus Punkten pro Strecke, für die Explore-Liste ohne jede Verwendung.
export async function getRoutes(): Promise<{ routes: ExploreRoute[]; error: boolean }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("routes_geojson")
    .select(EXPLORE_SPALTEN)
    .eq("status_ok", true)
    .order("name");

  if (error) {
    console.error("Strecken konnten nicht geladen werden:", error.message);
    return { routes: [], error: true };
  }

  return { routes: (data as unknown as ExploreRoute[]) ?? [], error: false };
}

// Umkreis um die gefahrene Strecke, in dem umliegende Strecken auf der
// Aufzeichnungskarte als Orientierung mitgezeichnet werden. 25 km decken die
// Nachbarschaft einer Passfahrt ab (Anfahrt, Parallelrouten im selben Tal),
// ohne die halbe Schweiz mitzuschicken.
export const KONTEXT_UMKREIS_KM = 25;
// Harte Obergrenze für die Anzahl. Jede Strecke bringt ihre volle Geometrie
// mit (RouteMap braucht sie), deshalb bindet nicht der Umkreis allein die
// Datenmenge, sondern diese Zahl: zwölf Linien sind auf einer Karte noch
// lesbar, und mehr hilft der Orientierung ohnehin nicht.
export const KONTEXT_MAX_STRECKEN = 12;

// Achsenparalleles Rechteck um eine Streckengeometrie. Als Bezugsgrösse
// besser als ein einzelner Punkt: eine 40 km lange Strecke hat keinen Ort,
// sie hat eine Ausdehnung.
interface Box {
  minLng: number;
  maxLng: number;
  minLat: number;
  maxLat: number;
}

function geometrieBox(route: KartenStrecke): Box | null {
  const coords = route.geometry_geojson.coordinates as [number, number][];
  let minLng = Infinity;
  let maxLng = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;
  for (const [lng, lat] of coords) {
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }
  if (!Number.isFinite(minLng) || !Number.isFinite(minLat)) return null;
  return { minLng, maxLng, minLat, maxLat };
}

// Die einander nächsten Längengrade zweier Rechtecke. Überlappen sie, ist
// der Abstand auf dieser Achse null — dann zählt nur noch die Breite.
function naechsteLaengen(a: Box, b: Box): [number, number] {
  if (a.maxLng < b.minLng) return [a.maxLng, b.minLng];
  if (b.maxLng < a.minLng) return [a.minLng, b.maxLng];
  const gemeinsam = Math.max(a.minLng, b.minLng);
  return [gemeinsam, gemeinsam];
}

// Die Breitengrade, an denen gemessen wird — als Liste, weil bei
// überlappenden Breitenbändern mehr als ein Kandidat in Frage kommt.
//
// Auf der Breitenachse ist der Abstand dann zwar null, der Breitengrad
// entscheidet aber trotzdem mit, wie weit eine Längendifferenz in
// Kilometern ist: Meridiane laufen zu den Polen hin zusammen, ein Grad
// Länge misst bei 47.5° weniger als bei 46.5°. Wer hier einfach den
// unteren Rand des gemeinsamen Bandes nimmt, misst auf der Nordhalbkugel
// den *weitesten* Punkt statt des nächsten und überschätzt den Abstand —
// womit die Funktion genau die Zusicherung bräche, die sie unten gibt.
// Deshalb kommen beide Ränder zurück und der Aufrufer nimmt den kleineren
// der beiden Abstände.
function breitenKandidaten(a: Box, b: Box): [number, number][] {
  if (a.maxLat < b.minLat) return [[a.maxLat, b.minLat]];
  if (b.maxLat < a.minLat) return [[a.minLat, b.maxLat]];
  const unten = Math.max(a.minLat, b.minLat);
  const oben = Math.min(a.maxLat, b.maxLat);
  return unten === oben
    ? [[unten, unten]]
    : [
        [unten, unten],
        [oben, oben],
      ];
}

// Kürzester Abstand zwischen zwei Rechtecken. Bewusst über die Rechtecke und
// nicht über ihre Mittelpunkte: eine lange Strecke kann auf zehn Kilometer
// an der gefahrenen vorbeiführen, während ihr Mittelpunkt fünfzig Kilometer
// weit weg liegt — über den Mittelpunkt gemessen fiele sie aus der Auswahl,
// obwohl sie genau die Nachbarschaft ist, die zur Orientierung taugt.
//
// Punktgenau wäre der Abstand der Geometrien selbst; das kostet für jedes
// Paar das Produkt ihrer Stützpunkte. Das Rechteck schätzt nach unten ab
// (nie weiter als die echte Linie) und nimmt dafür ein paar Strecken mehr
// auf, als nötig wären — auf einer Orientierungskarte der harmlosere Fehler.
function boxAbstandKm(a: Box, b: Box): number {
  const [lngA, lngB] = naechsteLaengen(a, b);
  return Math.min(
    ...breitenKandidaten(a, b).map(([latA, latB]) =>
      haversineKm([lngA, latA], [lngB, latB]),
    ),
  );
}

// Wählt aus allen freigegebenen Strecken diejenigen aus, die rund um die
// gefahrene Strecke liegen — die Auswahl selbst, ohne Datenbankzugriff,
// damit sie prüfbar bleibt. Die gefahrene Strecke ist nicht enthalten: sie
// wird auf dem Aufzeichnungsschirm gesondert übergeben und hervorgehoben.
export function waehleKontextStrecken(
  alle: KartenStrecke[],
  route: KartenStrecke,
  umkreisKm: number = KONTEXT_UMKREIS_KM,
  maxAnzahl: number = KONTEXT_MAX_STRECKEN,
): KartenStrecke[] {
  const bezug = geometrieBox(route);
  if (!bezug) return [];
  return alle
    .filter((kandidat) => kandidat.id !== route.id)
    .map((kandidat) => ({ kandidat, box: geometrieBox(kandidat) }))
    .filter((eintrag): eintrag is { kandidat: KartenStrecke; box: Box } => eintrag.box !== null)
    .map(({ kandidat, box }) => ({ kandidat, distanzKm: boxAbstandKm(bezug, box) }))
    .filter(({ distanzKm }) => distanzKm <= umkreisKm)
    .sort((a, b) => a.distanzKm - b.distanzKm)
    .slice(0, maxAnzahl)
    .map(({ kandidat }) => kandidat);
}

// Die Spalten, die components/RouteMap.tsx zum Zeichnen braucht — und keine
// mehr. routes_geojson führt zusätzlich Höhenprofil, Tempolimits und
// Charaktertext, zusammen um ein Vielfaches grösser als alles hier; sie
// gingen sonst bei jedem Aufruf der Streckenseite mit über die Leitung, auch
// für Besucher, die nie aufzeichnen.
const KARTEN_SPALTEN = "id, name, start_geojson, ziel_geojson, geometry_geojson, ist_rundfahrt";

// Die umliegenden Strecken für die Karte des Aufzeichnungsschirms
// (components/LiveTrackingForm.tsx). Eigene, schmale Abfrage statt
// getRoutes(): dieselbe View, dieselbe RLS-Sicht auf freigegebene Strecken,
// nur ohne die Spalten, die eine Karte nicht zeichnet. Ein Ladefehler kostet
// bloss die Orientierungshilfe, nicht die Aufzeichnung — dann bleibt die
// Karte bei der gefahrenen Strecke allein (gleiches Verhalten wie bei der
// freien Fahrt, siehe app/fahrten/neu/page.tsx).
export async function getKontextStrecken(route: RouteGeoJSON): Promise<KartenStrecke[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("routes_geojson")
    .select(KARTEN_SPALTEN)
    .eq("status_ok", true);

  if (error) {
    console.error("Kontext-Strecken konnten nicht geladen werden:", error.message);
    return [];
  }

  return waehleKontextStrecken((data as unknown as KartenStrecke[]) ?? [], route);
}

// Nur was die Sitemap braucht. getRoutes() liefert sonst für jede Strecke
// Geometrie, Höhenprofil, Tempolimits und Charaktertext mit — bei einem
// Aufruf, der davon ausschliesslich id und created_at verwendet.
export interface RouteSitemapEintrag {
  id: string;
  created_at: string;
}

export async function listRoutesForSitemap(): Promise<RouteSitemapEintrag[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("routes_geojson")
    .select("id, created_at")
    .eq("status_ok", true)
    .order("name");

  if (error) {
    console.error("Sitemap-Strecken konnten nicht geladen werden:", error.message);
    return [];
  }

  return (data as RouteSitemapEintrag[]) ?? [];
}

// Genau die Spalten, die der öffentliche Endpunkt ausgibt (siehe
// app/api/strecken/route.ts). Vorher lief er über getRoutes() und lud
// Geometrie und Höhenprofil, die er anschliessend verwarf — bei einem
// unauthentifizierten, nur per IP begrenzten Endpunkt der teuerste Teil
// der Anfrage.
export type RouteApiZeile = Pick<
  RouteGeoJSON,
  | "id"
  | "name"
  | "region"
  | "start_ort"
  | "ziel_ort"
  | "ist_rundfahrt"
  | "laenge_km"
  | "hoehe_m"
  | "max_steigung_prozent"
  | "kehren"
  | "kategorien"
  | "saison_status"
  | "tempolimits"
>;

export async function listRoutesForApi(): Promise<RouteApiZeile[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("routes_geojson")
    .select(
      "id, name, region, start_ort, ziel_ort, ist_rundfahrt, laenge_km, hoehe_m, max_steigung_prozent, kehren, kategorien, saison_status, tempolimits",
    )
    .eq("status_ok", true)
    .order("name");

  if (error) {
    console.error("Strecken konnten nicht geladen werden:", error.message);
    return [];
  }

  return (data as RouteApiZeile[]) ?? [];
}

// Für die Streckenauswahl in TrackLeaderboardChooser (app/leaderboards) —
// die dortige Karte braucht nur id+name, kein select("*") mit voller
// Geometrie/Höhenprofil/Tempolimits wie getRoutes() oben.
export interface RouteChoice {
  id: string;
  name: string;
}

export async function listRouteChoices(): Promise<RouteChoice[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("routes_geojson")
    .select("id, name")
    .eq("status_ok", true)
    .order("name");

  if (error) {
    console.error("Streckenliste konnte nicht geladen werden:", error.message);
    return [];
  }

  return (data as RouteChoice[]) ?? [];
}

// Kandidaten für die automatische Streckenerkennung innerhalb einer freien
// Fahrt (lib/lapDetection.ts) — Strecken, die der Nutzer überhaupt
// completen dürfte: freigegeben, und private Strecken nur die eigenen. Ohne
// diesen Filter könnte das blosse Vorbeifahren an einer fremden privaten
// Strecke deren Existenz indirekt verraten (siehe PR-Beschreibung). Dieselbe
// Bedingung wird in der RPC-Funktion save_free_ride_with_segments
// (0050_streckenerkennung_in_freier_fahrt.sql) nochmal serverseitig geprüft
// — diese Abfrage allein ist kein Sicherheitsmechanismus, nur die
// Vorauswahl für den Normalfall (App-Nutzung).
//
// Genutzt sowohl vom Erkennungsschritt in logFreeRide als auch — falls
// später ein Live-Hinweis während der Fahrt dazukommt — von einem
// entsprechenden Read-Pfad fürs Frontend; eine Stelle statt zwei. Nur die
// für die Erkennung tatsächlich gebrauchten Spalten (nicht select("*")) —
// diese Abfrage läuft bei jeder freien Fahrt, tempolimits/hoehenprofil/
// kategorien & Co. werden dafür nie angefasst.
//
// Enthält Rundfahrten UND Punkt-zu-Punkt-Strecken: detectLaps() wertet beide
// aus, aber mit unterschiedlichem Fortschrittsmodell (Ring vs. offene
// Strecke, siehe lib/lapDetection.ts) — deshalb wird ist_rundfahrt
// mitgelesen und weitergereicht statt hier zu filtern.
export interface RouteDetectionCandidate {
  id: string;
  name: string;
  geometry_geojson: GeoLineString;
  ist_rundfahrt: boolean;
}

export async function listRouteDetectionCandidates(
  viewerId: string,
): Promise<RouteDetectionCandidate[]> {
  // viewerId fliesst unten als Rohtext in einen .or()-Filterstring ein
  // (PostgREST kennt dafür keine parametrisierte Alternative) — hier
  // validieren statt blind zu vertrauen, dass der Aufrufer immer eine echte
  // auth.uid() übergibt.
  if (!UUID_RE.test(viewerId)) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("routes_geojson")
    .select("id, name, geometry_geojson, ist_rundfahrt")
    .eq("status_ok", true)
    .or(`ist_privat.eq.false,erstellt_von.eq.${viewerId}`);

  if (error) {
    console.error("Kandidatenstrecken konnten nicht geladen werden:", error.message);
    return [];
  }

  return (data as RouteDetectionCandidate[]) ?? [];
}

// Wirft bei einem echten Ladefehler (statt "nicht gefunden" mit null
// zurückzugeben), damit der aufrufenden Seite ein error.tsx-Boundary greift
// und nicht fälschlich eine 404 angezeigt wird.
//
// Mit React cache() umschlossen: generateMetadata, die Page selbst und
// opengraph-image.tsx rufen getRoute(id) für denselben Request unabhängig
// voneinander auf — ohne Memoisierung wäre das dieselbe DB-Abfrage
// dreifach pro Seitenaufruf.
export const getRoute = cache(async function getRoute(id: string): Promise<RouteGeoJSON | null> {
  if (!UUID_RE.test(id)) return null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("routes_geojson")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    if (error.code === "PGRST116") return null;
    console.error("Strecke konnte nicht geladen werden:", error.message);
    throw new Error("Strecke konnte nicht geladen werden.");
  }

  return data as RouteGeoJSON;
});
