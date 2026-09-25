import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { haversineKm } from "@/lib/geo";
import { computeSignatures, type RouteSignature } from "@/lib/signature";
import type {
  ExploreRoute,
  GeoLineString,
  KartenStrecke,
  RouteGeoJSON,
  SignaturStrecke,
} from "@/types/database";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Die Spalten aus ExploreRoute, als String für PostgREST. Aus dem Typ
// abgeleitet zu halten geht nicht (Typen existieren zur Laufzeit nicht) —
// deshalb hier einmal ausgeschrieben und in types/database.ts dokumentiert.
const EXPLORE_SPALTEN =
  "id, name, region, start_ort, ziel_ort, start_geojson, ziel_geojson, geometry_geojson, geometry_uebersicht_geojson, hoehe_m, laenge_km, max_steigung_prozent, kehren, saison_status, tempolimits, ist_rundfahrt";

// Spaltenstand vor 0117 (ohne Übersichtsgeometrie) — Fallback, solange die
// Migration noch nicht eingespielt ist (Schema zuerst, Code danach).
const EXPLORE_SPALTEN_LEGACY =
  "id, name, region, start_ort, ziel_ort, start_geojson, ziel_geojson, geometry_geojson, hoehe_m, laenge_km, max_steigung_prozent, kehren, saison_status, tempolimits, ist_rundfahrt";

// Vorher select("*"). Das lud für jede freigegebene Strecke zusätzlich
// hoehenprofil, charakter_text, kategorien, status_ok, erstellt_von,
// created_at und ist_privat — und schickte sie in die RSC-Nutzlast der
// Startseite, wo keine Komponente sie liest (nachgeprüft an ExploreView,
// ExploreSidebar, RouteMap, exploreFilters, signature, search, useLiveLapHint).
// Das Höhenprofil ist dabei der teuerste Posten nach der Geometrie: ein
// Array aus Punkten pro Strecke, für die Explore-Liste ohne jede Verwendung.
//
// tempolimits wird weiterhin gelesen, verlässt den Server aber nicht mehr.
// Der einzige Leser im Client war computeSignatures() (lib/signature.ts), und
// der braucht aus den Segmenten nur einen Schnitt je Strecke. Die ganzen
// Arrays waren am 2026-09-25 rund 42 KB der ~100 KB Streckenzeilen auf der
// Startseite. Das Merkmal wird deshalb hier gerechnet — über denselben
// ungefilterten Bestand wie vorher im Browser — und als {key, label} je
// Strecke mitgegeben, als einfaches Objekt, weil es die Server/Client-Grenze
// überquert. Die Karte zeichnet auf der Startseite und bei der freien Fahrt
// nie eine Tempolimit-Ebene (showSpeedLimits fehlt dort), sie vermisst die
// Segmente also nicht.
export async function getRoutes(): Promise<{
  routes: ExploreRoute[];
  signaturen: Record<string, RouteSignature>;
  error: boolean;
}> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("routes_geojson")
    .select(EXPLORE_SPALTEN)
    .eq("status_ok", true)
    .order("name");

  // 0117 noch nicht eingespielt: unbekannte Spalte -> alter Stand.
  if (error) {
    if (/geometry_uebersicht_geojson/i.test(error.message)) {
      const fallback = await supabase
        .from("routes_geojson")
        .select(EXPLORE_SPALTEN_LEGACY)
        .eq("status_ok", true)
        .order("name");
      if (fallback.error) {
        console.error("Strecken konnten nicht geladen werden:", fallback.error.message);
        return { routes: [], signaturen: {}, error: true };
      }
      return { ...mitSignaturen((fallback.data as unknown as ExploreZeile[]) ?? []), error: false };
    }
    console.error("Strecken konnten nicht geladen werden:", error.message);
    return { routes: [], signaturen: {}, error: true };
  }

  // Die Karte zeichnet die vereinfachte Linie; fehlt sie (null), gilt die
  // exakte. Deckungsgrad und Erkennung nutzen diese Funktion nie — sie lesen
  // die volle Geometrie über getRoute()/Kandidaten.
  const zeilen = (data as unknown as ExploreZeile[]) ?? [];
  return {
    ...mitSignaturen(
      zeilen.map(({ geometry_uebersicht_geojson, ...rest }) => ({
        ...rest,
        geometry_geojson: geometry_uebersicht_geojson ?? rest.geometry_geojson,
      })),
    ),
    error: false,
  };
}

// Eine Zeile, wie getRoutes() sie liest: ExploreRoute plus die beiden
// Spalten, die den Server nicht verlassen.
type ExploreZeile = ExploreRoute & {
  tempolimits: SignaturStrecke["tempolimits"];
  geometry_uebersicht_geojson?: ExploreRoute["geometry_geojson"] | null;
};

/**
 * Rechnet die Signatur-Merkmale über den ganzen übergebenen Bestand und nimmt
 * danach die Tempolimits aus den Zeilen. Rein, damit prüfbar
 * (lib/routes.test.ts): der Test hält fest, dass kein tempolimits-Feld mehr
 * in der Nutzlast landet und die Merkmale dieselben sind wie aus
 * computeSignatures() direkt.
 */
export function mitSignaturen(
  zeilen: (ExploreRoute & { tempolimits: SignaturStrecke["tempolimits"] })[],
): { routes: ExploreRoute[]; signaturen: Record<string, RouteSignature> } {
  const signaturen = Object.fromEntries(computeSignatures(zeilen));
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const routes = zeilen.map(({ tempolimits, ...rest }) => rest);
  return { routes, signaturen };
}

// Die IDs der freigegebenen Strecken — dieselbe Menge, die getRoutes()
// liefert (status_ok; private Strecken sind nie freigegeben), aber ohne
// Geometrie. Die Startseite braucht sie für Bewertungen und Passzustand; mit
// dieser schmalen Abfrage laufen beide parallel zu getRoutes() statt in einer
// zweiten Welle danach (app/page.tsx).
//
// Gibt den Fehler mit heraus, statt ihn in eine leere Liste zu verwandeln.
// Eine leere Liste ist hier nicht "keine Strecken", sondern "wir wissen es
// nicht" — und der Aufrufer kann das nur unterscheiden, wenn er es erfährt
// (lib/queryError.ts, dieselbe Regel wie bei getRecentFollowersReceived).
// Bis 2026-09-25 stand hier, ein Fehler sei "dasselbe wie bisher, wenn
// getRoutes() scheiterte". Das stimmte nicht: vorher kamen die IDs aus
// getRoutes() selbst, ein Fehler war also immer an dessen error gekoppelt
// und damit sichtbar. Seit der schmalen Abfrage ist es ein eigener Weg, und
// auf ihm verlor stillschweigend jede Zeile Sterne und Passabzeichen,
// während die Seite Erfolg meldete.
export async function getFreigegebeneStreckenIds(): Promise<{
  ids: string[];
  fehler: boolean;
}> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("routes").select("id").eq("status_ok", true);
  if (error) {
    console.error("Strecken-IDs konnten nicht geladen werden:", error.message);
    return { ids: [], fehler: true };
  }
  return { ids: ((data as { id: string }[] | null) ?? []).map((r) => r.id), fehler: false };
}

// Umkreis um die gefahrene Strecke, in dem umliegende Strecken auf der
// Aufzeichnungskarte als Orientierung mitgezeichnet werden. 25 km decken die
// Nachbarschaft einer Passfahrt ab (Anfahrt, Parallelrouten im selben Tal),
// ohne die halbe Schweiz mitzuschicken.
export const KONTEXT_UMKREIS_KM = 25;
// Harte Obergrenze für die Anzahl. Jede Strecke bringt ihre Linie mit (seit
// 2026-09-23 die Übersichtslinie, siehe getKontextStrecken), deshalb bindet
// nicht der Umkreis allein die
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
// Dasselbe mit der Übersichtslinie (0117) statt der exakten. Kontext-Strecken
// werden gedimmt zur Orientierung gezeichnet, nie für Gate oder Deckungsgrad
// gebraucht — und sie waren der grösste Posten der Streckenseite: auf dem
// Albulapass vier Nachbarn mit zusammen 7 775 exakten Punkten gegen 286 in
// der Übersicht. Die exakte Spalte wird hier gar nicht erst gelesen.
const KARTEN_SPALTEN_UEBERSICHT =
  "id, name, start_geojson, ziel_geojson, geometry_uebersicht_geojson, ist_rundfahrt";

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
    .select(KARTEN_SPALTEN_UEBERSICHT)
    .eq("status_ok", true);

  if (!error) {
    type Zeile = Omit<KartenStrecke, "geometry_geojson"> & {
      geometry_uebersicht_geojson: KartenStrecke["geometry_geojson"] | null;
    };
    const zeilen = (data as unknown as Zeile[]) ?? [];
    // Eine Zeile ohne Übersicht (null) fällt weg statt ihre exakte Linie
    // nachzuladen: die Übersicht ist eine generierte Spalte, null heisst
    // also, es gibt keine Geometrie zum Zeichnen.
    const strecken: KartenStrecke[] = zeilen
      .filter((z) => z.geometry_uebersicht_geojson?.coordinates?.length)
      .map(({ geometry_uebersicht_geojson, ...rest }) => ({
        ...rest,
        geometry_geojson: geometry_uebersicht_geojson!,
      }));
    return waehleKontextStrecken(strecken, route);
  }

  // 0117 noch nicht eingespielt: unbekannte Spalte -> exakte Linien wie
  // vorher (Schema zuerst, Code danach — dasselbe Muster wie getRoutes()).
  if (/geometry_uebersicht_geojson/i.test(error.message)) {
    const fallback = await supabase
      .from("routes_geojson")
      .select(KARTEN_SPALTEN)
      .eq("status_ok", true);
    if (!fallback.error) {
      return waehleKontextStrecken((fallback.data as unknown as KartenStrecke[]) ?? [], route);
    }
    console.error("Kontext-Strecken konnten nicht geladen werden:", fallback.error.message);
    return [];
  }

  console.error("Kontext-Strecken konnten nicht geladen werden:", error.message);
  return [];
}

// Nur was die Sitemap braucht. getRoutes() liefert sonst für jede Strecke
// Geometrie, Höhenprofil, Tempolimits und Charaktertext mit — bei einem
// Aufruf, der davon ausschliesslich id und created_at verwendet.
export interface RouteSitemapEintrag {
  id: string;
  created_at: string;
}

// Der Streckenbestand, reduziert auf die Spalten, aus denen sich ein
// Signatur-Merkmal berechnet. computeSignatures() vergleicht eine Strecke
// immer mit allen anderen — die Streckenseite braucht den Bestand also
// vollständig, aber ohne Geometrie, Höhenprofil und Namen: bei dreissig
// Strecken ist die Geometrie der mit Abstand teuerste Posten, und gezeichnet
// wird hier nichts davon.
export async function getSignaturbestand(): Promise<SignaturStrecke[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("routes")
    .select("id, hoehe_m, laenge_km, max_steigung_prozent, kehren, tempolimits")
    .eq("status_ok", true);

  // Ohne Bestand kein Vergleich, und ohne Vergleich kein Merkmal — die
  // Streckenseite lässt das Abzeichen dann weg, statt eine Fehlermeldung
  // für eine Auszeichnung zu zeigen.
  if (error) {
    console.error("Signaturbestand konnte nicht geladen werden:", error.message);
    return [];
  }

  return (data as unknown as SignaturStrecke[]) ?? [];
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
> &
  // Nur gesetzt, wenn der Aufrufer es ausdrücklich anfordert — siehe
  // listRoutesForApi().
  Partial<Pick<RouteGeoJSON, "hoehenprofil">>;

// mitHoehenprofil nur auf ausdrückliche Anforderung (?hoehenprofil=1 am
// Endpunkt): das Profil ist nach der Geometrie der grösste Posten pro
// Strecke — rund 101 Punkte, siehe buildHoehenprofil() — und wächst mit
// jeder freigegebenen Strecke mit. Wer nur die Liste will, soll dafür nicht
// zahlen; wer wie die Info-Seite ein Profil zeichnen will, spart sich einen
// zweiten Abruf mitsamt vollständiger Geometrie.
export async function listRoutesForApi(mitHoehenprofil = false): Promise<RouteApiZeile[]> {
  const supabase = await createClient();
  // Beide Spaltenlisten ausgeschrieben statt eine aus der anderen
  // zusammengesetzt: der Typ-Parser von postgrest-js liest den Select-String
  // zur Compile-Zeit und versteht nur ein Literal, kein `${...}`.
  const abfrage = mitHoehenprofil
    ? supabase
        .from("routes_geojson")
        .select(
          "id, name, region, start_ort, ziel_ort, ist_rundfahrt, laenge_km, hoehe_m, max_steigung_prozent, kehren, kategorien, saison_status, tempolimits, hoehenprofil",
        )
    : supabase
        .from("routes_geojson")
        .select(
          "id, name, region, start_ort, ziel_ort, ist_rundfahrt, laenge_km, hoehe_m, max_steigung_prozent, kehren, kategorien, saison_status, tempolimits",
        );
  const { data, error } = await abfrage.eq("status_ok", true).order("name");

  if (error) {
    console.error("Strecken konnten nicht geladen werden:", error.message);
    return [];
  }

  return (data as RouteApiZeile[]) ?? [];
}

// Für die Streckenauswahl in TrackLeaderboardChooser (app/ranglisten) —
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

  // Strecken mit Bestzeiten zuerst, innerhalb beider Gruppen alphabetisch.
  // Die Auswahl startet auf dem ersten Eintrag — alphabetisch war das eine
  // Strecke ohne jede Zeit, und die Seite zeigte beim Öffnen einen
  // Leerzustand, obwohl es anderswo Zeiten gab. Scheitert die Abfrage, bleibt
  // es bei der alphabetischen Reihenfolge: das ist eine Sortierhilfe, kein
  // Inhalt.
  const strecken = (data as RouteChoice[]) ?? [];
  const { data: zeiten } = await supabase.from("route_leaderboard").select("route_id").limit(2000);
  const mitZeiten = new Set(((zeiten as { route_id: string }[] | null) ?? []).map((z) => z.route_id));
  if (mitZeiten.size === 0) return strecken;
  return [
    ...strecken.filter((r) => mitZeiten.has(r.id)),
    ...strecken.filter((r) => !mitZeiten.has(r.id)),
  ];
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

// Bbox um einen Trail, mit Marge in Grad (1° ≈ 100 km — grob, aber für einen
// reinen Datenbank-Vorfilter genau wie in lib/lapDetection.ts zulässig).
// Exportiert für Tests; die Marge deckt Korridor plus Zielungenauigkeit ab.
export interface TrailBox {
  minLng: number;
  maxLng: number;
  minLat: number;
  maxLat: number;
}

export function trailBox(
  punkte: { lng: number; lat: number }[],
  margeKm = 2,
): TrailBox | null {
  if (punkte.length === 0) return null;
  let minLng = Infinity;
  let maxLng = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;
  for (const p of punkte) {
    if (!Number.isFinite(p.lng) || !Number.isFinite(p.lat)) return null;
    if (p.lng < minLng) minLng = p.lng;
    if (p.lng > maxLng) maxLng = p.lng;
    if (p.lat < minLat) minLat = p.lat;
    if (p.lat > maxLat) maxLat = p.lat;
  }
  const marge = margeKm / 100;
  return { minLng: minLng - marge, maxLng: maxLng + marge, minLat: minLat - marge, maxLat: maxLat + marge };
}

// Kandidaten über den PostGIS-Bbox-Filter (0116_route_kandidaten_in_box):
// statt aller Geometrien kommen nur die der Nachbarschaft. Fällt die RPC
// weg (Migration noch nicht eingespielt — Schema zuerst, Code danach),
// geht es ohne Änderung weiter über listRouteDetectionCandidates().
export async function listRouteDetectionCandidatesInBox(
  viewerId: string,
  box: TrailBox,
): Promise<RouteDetectionCandidate[]> {
  if (!UUID_RE.test(viewerId)) return [];
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("route_kandidaten_in_box", {
      p_min_lng: box.minLng,
      p_min_lat: box.minLat,
      p_max_lng: box.maxLng,
      p_max_lat: box.maxLat,
      p_viewer_id: viewerId,
    });
    if (error || !data) throw new Error(error?.message ?? "rpc leer");
    return (data as RouteDetectionCandidate[]) ?? [];
  } catch (e) {
    console.error(
      "Bbox-Kandidaten fehlgeschlagen, falle auf alle zurück:",
      e instanceof Error ? e.message : e,
    );
    return listRouteDetectionCandidates(viewerId);
  }
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
