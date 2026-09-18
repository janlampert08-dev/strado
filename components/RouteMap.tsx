"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import mapboxgl from "mapbox-gl";
import type { DataDrivenPropertyValueSpecification } from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { SCHWEIZ_ZENTRUM, DEFAULT_ZOOM } from "@/lib/constants";
import { sliceRouteBySpeed, speedColor } from "@/lib/speed";
import { akzentFarbe, isDarkTheme, subscribeToThemeChange, tokenFarbe } from "@/lib/theme";
import { SIGNATUR_RUECKFALL, SIGNATUR_TOKEN, type SignatureKey } from "@/lib/signature";
import { MIN_ACCURACY_M } from "@/components/useRideRecorder";
import type { KartenStrecke, TempolimitSegment } from "@/types/database";
import Skeleton from "@/components/ui/Skeleton";

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
const ROUTES_SOURCE = "routes";
const ROUTES_LINE_LAYER = "routes-line";
const ROUTES_HIT_LAYER = "routes-line-hit";
const SPEED_SOURCE = "speed-segments";
const SPEED_LINE_LAYER = "speed-segments-line";
const ENDPOINTS_SOURCE = "route-endpoints";
const ENDPOINTS_LAYER = "route-endpoints-circle";
const TRAFFIC_SOURCE = "traffic-segments";
const TRAFFIC_LINE_LAYER = "traffic-segments-line";
const HIGHLIGHT_SOURCE = "route-highlight";
const HIGHLIGHT_HALO_LAYER = "route-highlight-halo";
const HIGHLIGHT_LINE_LAYER = "route-highlight-line";
// Aufgezeichneter GPS-Track einer Fahrt (freie Fahrt oder Detailkarte einer
// Aufzeichnung) — unabhängig von den kuratierten Strecken, die über
// ROUTES_SOURCE laufen.
const TRACK_SOURCE = "ride-track";
const TRACK_LINE_LAYER = "ride-track-line";
// Leere Vorgaben für die optionalen Listen-Props auf Modulebene statt als
// Destrukturierungs-Default. `trail = []` im Signatur-Kopf erzeugt bei JEDEM
// Render ein neues Array — und damit eine neue Referenz für die
// Abhängigkeitslisten der beiden Effekte weiter unten, die daraufhin bei
// jedem Render setData() auf der Quelle aufrufen und die Karte neu zeichnen
// lassen. Genau das passiert bei jedem Aufrufer, der die Prop weglässt (z. B.
// die Explore-Karte, die einmal pro Sekunde einen GPS-Fix bekommt): eine
// laufende WebGL-Neuzeichnung ohne jede Änderung, auf dem Gerät im Auto.
// Dieselbe Lösung wie NO_ROUTES in CompletionMap.tsx.
const KEINE_VERKEHRSSEGMENTE: { coords: [number, number][]; color: string }[] = [];
const KEIN_TRACK: [number, number][] = [];

const TERRAIN_SOURCE = "mapbox-dem";
const SKY_LAYER = "sky";
const TERRAIN_EXAGGERATION = 1.4;
const TILTED_PITCH = 60;
const TILTED_BEARING = -17;

// Die Farbe einer Streckenlinie: der Signaturton der Strecke, sonst
// --color-accent. Beides zur Laufzeit aus den Tokens aufgelöst
// (lib/theme.ts), weil ein Mapbox-Layer keine CSS-Variable annimmt.
//
// DIE VORGESCHICHTE, DAMIT SIE SICH NICHT WIEDERHOLT. Hier standen einmal
// ZWEI Farbsysteme neben dem Token-System: die fünf Signaturfarben als
// fertige Hex-Werte aus lib/signature.ts, durchgereicht als colors-Map, und
// acht fest verdrahtete Blautöne als Rückfall, per ID-Hash verteilt. Drei
// Systeme für dieselbe Sache, keines wusste vom anderen, und keines folgte
// dem Thema — obwohl die Karte ihren Stil längst tauschte. PR #254 hat alle
// drei auf --color-accent zusammengezogen, was den Fehler behob und mit ihm
// die Farbe.
//
// Jetzt ist es EIN System: die Signatur der Strecke zeigt in der Liste und
// auf der Karte denselben Ton, und beide holen ihn aus demselben Token in
// app/globals.css. Der Ton folgt dem Thema, weil er zur Laufzeit gelesen
// wird — und die Sammlungen unten werden nach jedem "style.load" neu
// gebaut, also auch nach einem Themenwechsel.
//
// Was NICHT zurückkommt: der ID-Hash. Eine Strecke ohne Signatur bekommt
// den Akzent, keine ausgewürfelte Farbe. Und unterschieden wird zwischen
// Haupt- und Kontextlinie weiterhin über Deckkraft und Linienstärke
// (CONTEXT_ROUTE_OPACITY unten), nicht über den Farbton: auf einem Telefon
// im Sonnenlicht ist Farbe das erste, was zusammenbricht.
function streckenFarbe(signatur?: SignatureKey | null): string {
  if (!signatur) return akzentFarbe();
  return tokenFarbe(SIGNATUR_TOKEN[signatur], SIGNATUR_RUECKFALL[signatur]);
}

// Deckkraft der Kontext-Strecken, sobald eine Strecke als primär markiert ist
// (primaryRouteId, siehe unten): auf dem Aufzeichnungsschirm sollen die
// umliegenden Strecken orientieren, nicht ablenken. 0.35 bleibt im hellen wie
// im dunklen Kartenstil erkennbar, tritt aber klar hinter die hervorgehobene
// Linie zurück.
const CONTEXT_ROUTE_OPACITY = 0.35;

// Volle Deckkraft für die primäre Strecke, gedimmt für alle anderen. Ohne
// primaryRouteId bleibt es bei der bisherigen Darstellung (alles voll
// sichtbar) — der Ausdruck ist dann eine schlichte Konstante. Greift für
// Streckenlinien wie Endpunkte, weil beide Feature-Sammlungen dieselbe
// "id"-Eigenschaft tragen.
function routeOpacity(primaryRouteId: string | null): DataDrivenPropertyValueSpecification<number> {
  if (!primaryRouteId) return 1;
  return ["case", ["==", ["get", "id"], primaryRouteId], 1, CONTEXT_ROUTE_OPACITY];
}

function mapStyleForTheme(): string {
  return isDarkTheme() ? "mapbox://styles/mapbox/dark-v11" : "mapbox://styles/mapbox/streets-v12";
}

/**
 * Die aufgelösten Farben aller vorkommenden Signaturen plus die des
 * Akzents — einmal je Sammlung statt einmal je Strecke.
 *
 * streckenFarbe() läuft über getComputedStyle(document.documentElement),
 * und das ist ein Lesezugriff auf den Layout-Zustand. Bei rund 39
 * sichtbaren Strecken je Aktualisierung wären das 39 Aufrufe für höchstens
 * sechs verschiedene Antworten. Vor der Rückkehr der Farbe war es eine
 * einzige Antwort und dieser Cache eine Variable; jetzt ist es eine Map,
 * die Begründung ist dieselbe.
 */
function farbenFuer(
  routes: KartenStrecke[],
  signaturen: Map<string, SignatureKey> | undefined,
): (id: string) => string {
  const cache = new Map<SignatureKey | "akzent", string>();
  const hol = (key: SignatureKey | null): string => {
    const k = key ?? "akzent";
    let wert = cache.get(k);
    if (wert === undefined) {
      wert = streckenFarbe(key);
      cache.set(k, wert);
    }
    return wert;
  };
  // Einmal vorwärmen, damit der erste Aufruf je Ton nicht mitten in der
  // Feature-Schleife hängt.
  for (const route of routes) hol(signaturen?.get(route.id) ?? null);
  return (id: string) => hol(signaturen?.get(id) ?? null);
}

function toFeatureCollection(
  routes: KartenStrecke[],
  signaturen?: Map<string, SignatureKey>,
): GeoJSON.FeatureCollection {
  const farbe = farbenFuer(routes, signaturen);
  return {
    type: "FeatureCollection",
    features: routes.map((route) => ({
      type: "Feature",
      id: route.id,
      geometry: route.geometry_geojson,
      properties: { id: route.id, name: route.name, color: farbe(route.id) },
    })),
  };
}

// Bei Rundfahrten liegen Start und Ziel am selben Ort — dort nur ein Punkt,
// sonst je ein Punkt am Anfang und am Ende der Strecke.
function toEndpointFeatureCollection(
  routes: KartenStrecke[],
  signaturen?: Map<string, SignatureKey>,
): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];
  const farbe = farbenFuer(routes, signaturen);
  for (const route of routes) {
    const color = farbe(route.id);
    features.push({
      type: "Feature",
      geometry: route.start_geojson,
      properties: { id: route.id, kind: "start", color },
    });
    if (!route.ist_rundfahrt) {
      features.push({
        type: "Feature",
        geometry: route.ziel_geojson,
        properties: { id: route.id, kind: "ziel", color },
      });
    }
  }
  return { type: "FeatureCollection", features };
}

function toSpeedFeatureCollection(
  coords: [number, number][],
  segments: TempolimitSegment[],
): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: sliceRouteBySpeed(coords, segments).map((s) => ({
      type: "Feature",
      geometry: { type: "LineString", coordinates: s.coords },
      properties: { kmh: s.kmh, color: speedColor(s.kmh) },
    })),
  };
}

// Bereits fertig eingefärbte Abschnitte (siehe RouteDetailMap, das sie aus
// lib/traffic.ts ableitet) — RouteMap kennt Stau-Level/-Farben selbst nicht,
// genau wie bei den Signatur-Farben der Strecken.
function toTrafficFeatureCollection(
  segments: { coords: [number, number][]; color: string }[],
): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: segments.map((s) => ({
      type: "Feature",
      geometry: { type: "LineString", coordinates: s.coords },
      properties: { color: s.color },
    })),
  };
}

// Umrechnung Meter -> Bildschirm-Pixel an einer bestimmten Breite/Zoomstufe
// (Standard-Web-Mercator-Formel, 256px-Kacheln, daher zoom+8). Nötig, damit
// der Genauigkeits-Ring in echten Metern skaliert statt in einer festen
// Pixelgrösse, die bei jedem Zoomstand falsch aussehen würde.
function metersToPixelsAtLatitude(meters: number, latitude: number, zoom: number): number {
  const earthCircumferenceM = 40_075_017;
  const latitudeRadians = (latitude * Math.PI) / 180;
  const metersPerPixel = (earthCircumferenceM * Math.cos(latitudeRadians)) / Math.pow(2, zoom + 8);
  return meters / metersPerPixel;
}

// Ausgeschrieben statt ReturnType<typeof createLocationMarkerElement>: der
// Erzeuger ruft faerbeStandortMarker selbst auf, ein abgeleiteter Rückgabetyp
// wäre also zirkulär.
interface StandortMarker {
  wrapper: HTMLDivElement;
  accuracyEl: HTMLDivElement;
  headingEl: HTMLDivElement;
  dotEl: HTMLDivElement;
}

/**
 * Setzt alle vier Farbflächen des Standort-Markers aus --color-accent.
 *
 * Eigene Funktion, weil sie ZWEIMAL laufen muss: einmal beim Erzeugen des
 * Elements und einmal bei jedem Themenwechsel. Der Marker ist ein
 * mapboxgl.Marker, also ein DOM-Overlay über der Karte — map.setStyle()
 * baut ihn nicht neu, und das Element selbst entsteht nur einmal
 * (locationMarkerRef). Wer also mitten in einer Aufzeichnung auf Dunkel
 * umschaltet, behielt den Positionspunkt im Tagblau, während die Spur
 * darunter über "style.load" längst die neue Farbe trug. Der Kommentar bei
 * setupLayers ("liest alle Farben frisch") gilt für Layer, nicht hierfür.
 *
 * Ring und Richtungskegel standen bis zur Review von PR #254 sogar noch als
 * rgba(61,90,254,…) im Code — derselbe helle Akzentwert wie das frühere
 * TRACK_COLOR, nur in anderer Schreibweise, weshalb die Suche danach ihn
 * nicht gefunden hat.
 */
function faerbeStandortMarker(elemente: StandortMarker) {
  const farbe = streckenFarbe();
  elemente.dotEl.style.backgroundColor = farbe;
  elemente.accuracyEl.style.backgroundColor = mitDeckkraft(farbe, 0.15);
  elemente.accuracyEl.style.border = `1px solid ${mitDeckkraft(farbe, 0.35)}`;
  elemente.headingEl.style.background =
    `linear-gradient(to bottom, ${mitDeckkraft(farbe, 0.9)}, ${mitDeckkraft(farbe, 0)})`;
}

/**
 * Eine aufgelöste Farbe mit Deckkraft. Nimmt den 8-stelligen Hex-Weg, weil
 * --color-accent in beiden Themes ein #rrggbb ist; alles andere bekommt die
 * Farbe unverändert zurück, statt einen ungültigen String zu bauen.
 */
function mitDeckkraft(farbe: string, deckkraft: number): string {
  if (!/^#[0-9a-f]{6}$/i.test(farbe)) return farbe;
  const stufe = Math.round(Math.min(Math.max(deckkraft, 0), 1) * 255)
    .toString(16)
    .padStart(2, "0");
  return `${farbe}${stufe}`;
}

// Standort-Marker aus drei übereinanderliegenden, unabhängig positionierten
// Ebenen statt eines einzelnen Punkts — orientiert sich an der üblichen
// Navi-App-Konvention (Apple/Google Maps): ein Genauigkeits-Ring kommuniziert
// die GPS-Unsicherheit, ein Richtungskegel zeigt die Fahrtrichtung, wenn
// bekannt, und der Punkt selbst bleibt immer sichtbar. Wrapper ist bewusst
// 0x0 gross (statt einer festen Grösse) — alle Kinder sind absolut über
// left/top:0 + translate(-50%,-50%) auf denselben Ankerpunkt zentriert, so
// bleibt die Zentrierung korrekt, auch wenn der Ring durch wechselnde
// Genauigkeit laufend seine Grösse ändert.
function createLocationMarkerElement(): StandortMarker {
  const wrapper = document.createElement("div");
  wrapper.style.position = "relative";
  wrapper.style.width = "0px";
  wrapper.style.height = "0px";

  const accuracyEl = document.createElement("div");
  accuracyEl.style.position = "absolute";
  accuracyEl.style.left = "0";
  accuracyEl.style.top = "0";
  accuracyEl.style.borderRadius = "50%";
  accuracyEl.style.transform = "translate(-50%, -50%)";
  accuracyEl.style.transition = "width 0.3s ease, height 0.3s ease";
  accuracyEl.style.pointerEvents = "none";
  accuracyEl.style.display = "none";

  // Kegel statt Pfeil-Icon: per clip-path aus einem Quadrat geschnitten,
  // Spitze zeigt in Fahrtrichtung (0deg = Norden, wie coords.heading). Die
  // Rotation berücksichtigt die Kartenausrichtung (map.getBearing()), sonst
  // würde der Kegel in der 3D-Kippansicht (show3D) in die falsche Richtung
  // zeigen, sobald die Karte selbst gedreht ist.
  const headingEl = document.createElement("div");
  headingEl.style.position = "absolute";
  headingEl.style.left = "0";
  headingEl.style.top = "0";
  headingEl.style.width = "34px";
  headingEl.style.height = "34px";
  headingEl.style.transform = "translate(-50%, -50%) rotate(0deg)";
  headingEl.style.transformOrigin = "50% 50%";
  headingEl.style.clipPath = "polygon(50% 0%, 14% 100%, 50% 74%, 86% 100%)";
  headingEl.style.pointerEvents = "none";
  headingEl.style.display = "none";

  const dotEl = document.createElement("div");
  dotEl.style.position = "absolute";
  dotEl.style.left = "0";
  dotEl.style.top = "0";
  dotEl.style.width = "12px";
  dotEl.style.height = "12px";
  dotEl.style.borderRadius = "50%";
  dotEl.style.border = "2.5px solid #FAFAFA";
  dotEl.style.boxShadow = "0 0 0 1px rgba(19,19,22,0.25), 0 1px 3px rgba(19,19,22,0.35)";
  dotEl.style.transform = "translate(-50%, -50%)";

  wrapper.appendChild(accuracyEl);
  wrapper.appendChild(headingEl);
  wrapper.appendChild(dotEl);

  const elemente: StandortMarker = { wrapper, accuracyEl, headingEl, dotEl };
  faerbeStandortMarker(elemente);
  return elemente;
}

function toTrackFeatureCollection(trail: [number, number][]): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features:
      trail.length > 1
        ? [
            {
              type: "Feature",
              geometry: { type: "LineString", coordinates: trail },
              properties: {},
            },
          ]
        : [],
  };
}

// Worauf sich der Kartenausschnitt einpasst: gibt es eine primäre Strecke,
// dann ausschliesslich auf sie. Auf dem Aufzeichnungsschirm sind die übrigen
// Strecken blosser Kontext — ein Einpassen auf sie alle würde die gefahrene
// Strecke zur Briefmarke schrumpfen lassen.
function fitTargets(routes: KartenStrecke[], primaryRouteId: string | null): KartenStrecke[] {
  if (!primaryRouteId) return routes;
  const primary = routes.find((r) => r.id === primaryRouteId);
  return primary ? [primary] : routes;
}

// Kamerafahrten von Mapbox laufen in JS, nicht über CSS-Transitions — der
// prefers-reduced-motion-Block in globals.css erreicht sie also nicht. Diese
// Funktion ist die entsprechende Prüfung für jede Dauer, die hier gesetzt
// wird: bei reduzierter Bewegung springt die Kamera, statt zu fahren.
// Bewusst bei jedem Aufruf abgefragt statt einmal gecacht, damit ein
// Umschalten der Systemeinstellung sofort greift.
function bewegungsdauer(ms: number): number {
  if (typeof window === "undefined") return ms;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : ms;
}

// Randabstand beim Einpassen. FIT_PADDING_PX für die Streckenliste,
// FIT_PADDING_EINZELN_PX für eine einzeln hervorgehobene Strecke, über der
// zusätzlich eine Meldung steht (Zufallsvorschlag, siehe unten).
const FIT_PADDING_PX = 48;
const FIT_PADDING_EINZELN_PX = 64;

// So viel Karte muss nach allen Abzügen mindestens übrig bleiben. Mapbox
// rechnet mit einem Padding, das die Leinwand auffrisst, einen unbrauchbaren
// (und je nach Version gar keinen) Ausschnitt aus — auf einem kurzen Gerät
// mit aufgezogenem Sheet wäre genau das der Fall.
const MIN_SICHTHOEHE_PX = 120;

// Unterhalb dieser sichtbaren Resthöhe lohnt sich ein erneutes Einpassen
// nicht mehr: das Sheet deckt die Karte dann praktisch ganz ab, und der
// Ausschnitt, den man auf den verbleibenden Streifen rechnete, stünde beim
// Zuklappen als absurde Zoomstufe da.
const NEU_EINPASSEN_MIN_HOEHE_PX = 200;

/**
 * Der untere Teil der Karte liegt auf Mobile unter dem Bottom-Sheet (und der
 * BottomNav darunter) — die Leinwand ist dort also grösser als das, was man
 * sieht. Ohne diesen Abzug passt Mapbox die Strecke in die *ganze* Leinwand
 * ein: die untere Hälfte verschwindet unter dem Sheet, und der sichtbare Rest
 * wirkt wie ein herangezoomter Ausschnitt statt wie die ganze Strecke.
 */
function fitPadding(map: mapboxgl.Map, basis: number, bottomInsetPx: number) {
  const hoehe = map.getContainer().clientHeight;
  const platz = Math.max(0, hoehe - MIN_SICHTHOEHE_PX);
  const oben = Math.min(basis, platz);
  const unten = Math.min(basis + Math.max(0, bottomInsetPx), platz - oben);
  return { top: oben, bottom: unten, left: basis, right: basis };
}

function fitToRoutes(
  map: mapboxgl.Map,
  routes: KartenStrecke[],
  animate: boolean,
  bottomInsetPx: number,
) {
  if (routes.length === 0) return;
  const bounds = new mapboxgl.LngLatBounds();
  for (const route of routes) {
    for (const coord of route.geometry_geojson.coordinates) {
      bounds.extend(coord as [number, number]);
    }
  }
  map.fitBounds(bounds, {
    padding: fitPadding(map, FIT_PADDING_PX, bottomInsetPx),
    duration: animate ? bewegungsdauer(500) : 0,
  });
}

function fitToTrail(
  map: mapboxgl.Map,
  trail: [number, number][],
  animate: boolean,
  bottomInsetPx: number,
) {
  if (trail.length < 2) return;
  const bounds = new mapboxgl.LngLatBounds();
  for (const coord of trail) bounds.extend(coord);
  map.fitBounds(bounds, {
    padding: fitPadding(map, FIT_PADDING_PX, bottomInsetPx),
    duration: animate ? bewegungsdauer(500) : 0,
  });
}

export default function RouteMap({
  routes,
  signaturen,
  userLocation,
  userAccuracyM = null,
  userHeadingDeg = null,
  showSpeedLimits = false,
  showTraffic = false,
  show3D = false,
  hoveredRouteId = null,
  primaryRouteId = null,
  flyToRouteId = null,
  bottomInsetPx = 0,
  trafficSegments = KEINE_VERKEHRSSEGMENTE,
  trail = KEIN_TRACK,
  fitTrail = false,
  fitRoutes = true,
  routesClickable = true,
  centerOnFirstLocation = false,
  followLocation = false,
  ohneBedienelemente = false,
}: {
  // Alle Strecken, die gezeichnet werden. Die Reihenfolge ist gleichgültig,
  // sie landen gemeinsam in einer Feature-Sammlung. Genau eine Strecke ist
  // kein Sonderfall des Zeichnens, wohl aber für showSpeedLimits — siehe
  // dort.
  //
  // KartenStrecke statt RouteGeoJSON: die Karte liest nur sieben Spalten, und
  // getRoutes() lädt seit e1571b9 auch nur noch die, die die Explore-Ansicht
  // braucht. Eine vollständige Zeile erfüllt den engeren Typ strukturell
  // weiterhin, die übrigen Aufrufer bleiben also unverändert — und die
  // Kontext-Strecken des Aufzeichnungsschirms, die nur die Zeichenfelder
  // tragen, erfüllen ihn ebenfalls.
  routes: KartenStrecke[];
  // Das Signatur-Merkmal je Strecken-ID (lib/signature.ts). Bestimmt die
  // Linienfarbe, damit eine Strecke in der Liste und auf der Karte denselben
  // Ton trägt — die Explore-Ansicht berechnet die Signaturen ohnehin für die
  // Seitenleiste und reicht dieselbe Map hierher.
  //
  // Optional, und ohne sie bleibt alles beim Akzent: die Detailkarte und
  // die beiden Aufzeichnungsschirme zeigen eine bzw. eine hervorgehobene
  // Strecke, dort ordnet Farbe nichts.
  signaturen?: Map<string, SignatureKey>;
  // null blendet den Standort-Marker aus, statt ihn auf einer alten Position
  // stehen zu lassen.
  userLocation?: [number, number] | null;
  // GPS-Genauigkeitsradius in Metern (position.coords.accuracy) bzw.
  // Kompasskurs in Grad (position.coords.heading) — optional, da nicht jeder
  // Aufrufer sie hat (z.B. ExploreView ruft nur einmalig getCurrentPosition).
  userAccuracyM?: number | null;
  userHeadingDeg?: number | null;
  // Tempolimit-Ebene einblenden. Sie wird nur gezeichnet, wenn GENAU EINE
  // Strecke übergeben ist (und diese tempolimits trägt): die Segmente werden
  // entlang einer Geometrie aufgetragen, für mehrere Linien gäbe es keine
  // eindeutige. Bei mehr als einer Strecke bleibt die Ebene stumm leer —
  // gedacht ist sie für die Detailkarte (RouteDetailMap).
  showSpeedLimits?: boolean;
  // Stau-Ebene ein- und ausblenden. Nur der Schalter: die Daten kommen
  // fertig eingefärbt über trafficSegments von aussen (siehe
  // toTrafficFeatureCollection oben). Ohne Segmente schaltet das Flag eine
  // leere Ebene sichtbar.
  showTraffic?: boolean;
  // Geländerelief samt geneigter Kamera (Pitch und Bearing), nicht nur eine
  // Schattierung. Das Umschalten bewegt also die Ansicht — bei reduzierter
  // Bewegung springt sie, statt zu fahren (bewegungsdauer()).
  show3D?: boolean;
  // Diese Strecke bekommt Halo und kräftige Linie. Teilt sich den
  // Hervorhebungs-Layer mit primaryRouteId; gesetzt wird er vom Zeiger über
  // der Seitenleiste, weshalb er beim Rendern Vorrang hat.
  hoveredRouteId?: string | null;
  // Die "eigene" Strecke unter mehreren: sie wird wie ein Hover hervorgehoben
  // (derselbe Highlight-Layer), alle übrigen treten in der Deckkraft zurück,
  // und der Kartenausschnitt passt sich nur auf sie ein. Für den
  // Aufzeichnungsschirm einer Streckenfahrt gedacht, wo die umliegenden
  // Strecken der Orientierung dienen, die gefahrene aber die Hauptlinie
  // bleiben muss. Ohne diesen Wert ändert sich nichts am bisherigen
  // Verhalten (Explore-Karte, Detailkarte).
  primaryRouteId?: string | null;
  // Kartenausschnitt einmalig auf genau diese Strecke legen, sobald sich der
  // Wert ändert — unabhängig von fitRoutes, das der gesamten (gefilterten)
  // Liste folgt. Genutzt vom Zufallsvorschlag der Startseite
  // (ExploreView.tsx). null lässt die Kamera in Ruhe.
  flyToRouteId?: string | null;
  // Fertig eingefärbte Stau-Abschnitte. RouteMap kennt Stau-Level und
  // -Farben nicht selbst — sie kommen aus lib/traffic.ts über
  // RouteDetailMap, genau wie die Signatur-Farben oben.
  trafficSegments?: { coords: [number, number][]; color: string }[];
  // Aufgezeichneter GPS-Track: live wachsend während einer Aufzeichnung
  // (FreeRideForm) oder fertig auf der Fahrt-Detailseite (CompletionMap).
  trail?: [number, number][];
  // Kartenausschnitt auf den Track legen. Für einen fertigen Track gedacht —
  // während einer laufenden Aufzeichnung würde das den Ausschnitt bei jedem
  // GPS-Fix neu setzen und gegen jedes manuelle Verschieben arbeiten.
  fitTrail?: boolean;
  // Kartenausschnitt auf die übergebenen Strecken legen (beim Aufbau und bei
  // jedem Wechsel der Streckenliste). Abschaltbar für FreeRideForm: dort
  // dienen die Strecken nur der Orientierung, und ein Einpassen auf sie
  // würde gegen centerOnFirstLocation/followLocation arbeiten.
  fitRoutes?: boolean;
  // Klick auf eine Streckenlinie öffnet die Streckendetailseite. Während
  // einer laufenden Aufzeichnung (LiveTrackingForm, FreeRideForm) abgeschaltet:
  // dort liegt die Karte im Vollbild, und ein versehentlicher Tap auf eine
  // Linie würde die Komponente aushängen und die Fahrt mitten im Rennen
  // abbrechen.
  //
  // Bewusst getrennt von fitRoutes: LiveTrackingForm braucht das Einpassen
  // (die Streckenübersicht vor dem Start), aber eben nicht die Navigation.
  routesClickable?: boolean;
  // Einmalig auf den ersten ermittelten Standort zentrieren. Für die
  // Aufzeichnung einer freien Fahrt, wo es keine Strecke gibt, auf die sich
  // die Karte beim Aufbau legen könnte.
  centerOnFirstLocation?: boolean;
  // Kartenausschnitt der laufenden GPS-Position nachführen (wie eine
  // Navi-App) statt nur den Standort-Marker zu bewegen — für die aktive
  // Aufzeichnung einer Fahrt (LiveTrackingForm/FreeRideForm). Greift erst,
  // nachdem centerOnFirstLocation (falls gesetzt) die Karte einmalig
  // positioniert hat, und pausiert, solange die Nutzerin die Karte selbst
  // verschiebt.
  followLocation?: boolean;
  /** Zoom- und Kompass-Knöpfe weglassen (Vorschaukarten, z. B. im Fazit). */
  ohneBedienelemente?: boolean;
  // Pixel am unteren Rand der Karte, die von etwas anderem verdeckt werden —
  // auf Mobile das Bottom-Sheet plus die BottomNav darunter (gemeldet von
  // DragSheet.tsx, siehe ExploreView/RouteDetailLayout). Die Leinwand füllt
  // dort den ganzen Container; ohne diesen Wert passt sich ein Einpassen auf
  // Fläche ein, die man gar nicht sieht — siehe fitPadding() oben.
  bottomInsetPx?: number;
}) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const styleLoadedRef = useRef(false);
  // Gegenstück zu styleLoadedRef als Zustand: eine Ref löst kein erneutes
  // Rendern aus, ein Effekt, der auf styleLoadedRef.current abbricht, läuft
  // also nie von selbst nach. Dieser Zähler steigt nach jedem erfolgreichen
  // style.load und lässt genau die Effekte nachziehen, die ihn in ihren
  // Abhängigkeiten führen.
  const [stilGeneration, setStilGeneration] = useState(0);
  // Deckt die Lücke zwischen Container-Mount und dem ersten sichtbaren
  // Kartenbild ab (Style- und Tile-Ladezeit von Mapbox GL selbst, unabhängig
  // vom bereits vorhandenen Skeleton für den Code-Split in RouteDetailMap/
  // ExploreView) — ohne das wäre die Karte für ein bis zwei Sekunden leer.
  const [isReady, setIsReady] = useState(false);
  const routesRef = useRef(routes);
  // Nur der Wert beim Aufbau zählt: die Knöpfe werden einmal angehängt.
  const ohneBedienelementeRef = useRef(ohneBedienelemente);
  const trailRef = useRef(trail);
  const routesClickableRef = useRef(routesClickable);
  const fitRoutesRef = useRef(fitRoutes);
  const hasCenteredOnLocationRef = useRef(false);
  const locationMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const locationElementsRef = useRef<ReturnType<typeof createLocationMarkerElement> | null>(null);
  // Per Hand verschoben, während followLocation aktiv ist — pausiert das
  // automatische Nachführen, statt der Nutzerin die Karte bei jedem
  // GPS-Fix wieder unter dem Finger wegzuziehen. "dragstart" feuert nur bei
  // Nutzer-Gesten, nicht bei den programmatischen easeTo()-Aufrufen unten.
  const isDraggingRef = useRef(false);
  const bottomInsetRef = useRef(bottomInsetPx);
  useEffect(() => {
    bottomInsetRef.current = bottomInsetPx;
  }, [bottomInsetPx]);
  // Hat die Nutzerin die Kamera selbst bewegt, bleibt ihr Ausschnitt stehen:
  // ein Rastpunktwechsel des Sheets passt dann nicht mehr nach. Mapbox hängt
  // an einer Nutzergeste ein originalEvent an, an den programmatischen
  // Fahrten unten nicht — daran lassen sich die beiden auseinanderhalten.
  const nutzerBewegteKameraRef = useRef(false);
  // Mit welchem Abzug zuletzt eingepasst wurde. Ohne das schöbe der Effekt zu
  // bottomInsetPx unten direkt nach dem Erstaufbau eine zweite, identische
  // Kamerafahrt nach — er läuft mit, sobald stilGeneration steigt.
  const eingepasstMitInsetRef = useRef<number | null>(null);

  // Wie routesRef: setupLayers() läuft nach jedem "style.load" und liest
  // die Sammlungen aus Refs statt aus den Props, weil es ausserhalb des
  // Render-Laufs aufgerufen wird.
  const signaturenRef = useRef(signaturen);

  useEffect(() => {
    routesRef.current = routes;
  }, [routes]);

  useEffect(() => {
    signaturenRef.current = signaturen;
  }, [signaturen]);

  useEffect(() => {
    routesClickableRef.current = routesClickable;
  }, [routesClickable]);

  useEffect(() => {
    fitRoutesRef.current = fitRoutes;
  }, [fitRoutes]);


  useEffect(() => {
    trailRef.current = trail;
  }, [trail]);

  const trafficSegmentsRef = useRef(trafficSegments);
  useEffect(() => {
    trafficSegmentsRef.current = trafficSegments;
  }, [trafficSegments]);

  // Refs statt der Props direkt, weil setupLayers() unten nicht nur beim
  // Erstaufbau läuft, sondern auch nach jedem Themenwechsel (map.setStyle()
  // entfernt alle selbst hinzugefügten Layer/Sources) — ohne Refs würde die
  // Closure die zum Zeitpunkt der Effekt-Ausführung (Mount) aktuellen, dann
  // veralteten Prop-Werte einfrieren.
  const showSpeedLimitsRef = useRef(showSpeedLimits);
  useEffect(() => {
    showSpeedLimitsRef.current = showSpeedLimits;
  }, [showSpeedLimits]);

  const showTrafficRef = useRef(showTraffic);
  useEffect(() => {
    showTrafficRef.current = showTraffic;
  }, [showTraffic]);

  const show3DRef = useRef(show3D);
  useEffect(() => {
    show3DRef.current = show3D;
  }, [show3D]);

  const hoveredRouteIdRef = useRef(hoveredRouteId);
  useEffect(() => {
    hoveredRouteIdRef.current = hoveredRouteId;
  }, [hoveredRouteId]);

  const primaryRouteIdRef = useRef(primaryRouteId);
  useEffect(() => {
    primaryRouteIdRef.current = primaryRouteId;
  }, [primaryRouteId]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current || !MAPBOX_TOKEN) return;
    mapboxgl.accessToken = MAPBOX_TOKEN;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: mapStyleForTheme(),
      center: SCHWEIZ_ZENTRUM,
      zoom: DEFAULT_ZOOM,
      // Standard-Attribution aus, unten durch die kompakte Variante ersetzt:
      // statt der ausgeschriebenen Zeile "© Mapbox © OpenStreetMap Improve
      // this map" nur ein ⓘ-Knopf, der sie auf Klick zeigt.
      //
      // Mapbox verlangt Hinweis *und* Logo auf jeder Karte; ein Ausblenden
      // per CSS wäre ein Verstoss gegen die Nutzungsbedingungen, siehe
      // app/globals.css und
      // https://docs.mapbox.com/help/getting-started/attribution/
      //
      // Bewusste Abweichung von Mapbox' Empfehlung: die JSDoc zu `compact`
      // (node_modules/mapbox-gl/dist/mapbox-gl.d.ts) rät, nicht einzuklappen,
      // solange die volle Zeile bequem auf die Karte passt — von selbst
      // klappt mapbox-gl erst unter 640px Kartenbreite ein. Wir erzwingen es
      // auch auf breiten Karten, weil die Zeile dort mit den eigenen
      // Overlays kollidiert; der Hinweis bleibt über den ⓘ-Knopf jederzeit
      // erreichbar. Wer das zurückdrehen will, entfernt hier
      // `attributionControl: false` samt der AttributionControl-Zeile unten
      // (dann greift wieder das responsive Standardverhalten).
      attributionControl: false,
      // Ohne locale melden sich die Bedienelemente englisch ("Zoom in",
      // "Reset bearing to north") in einem lang="de"-Dokument.
      locale: {
        "AttributionControl.ToggleAttribution": "Quellenangabe ein-/ausblenden",
        "GeolocateControl.FindMyLocation": "Meinen Standort finden",
        "GeolocateControl.LocationNotAvailable": "Standort nicht verfügbar",
        "LogoControl.Title": "Mapbox-Logo",
        "Map.Title": "Karte",
        "NavigationControl.ResetBearing": "Nach Norden ausrichten",
        "NavigationControl.ZoomIn": "Hineinzoomen",
        "NavigationControl.ZoomOut": "Herauszoomen",
        "ScrollZoomBlocker.CtrlMessage": "Zum Zoomen Strg gedrückt halten",
        "ScrollZoomBlocker.CmdMessage": "Zum Zoomen ⌘ gedrückt halten",
        "TouchPanBlocker.Message": "Zum Bewegen der Karte zwei Finger benutzen",
      },
    });

    map.addControl(new mapboxgl.AttributionControl({ compact: true }));
    // Zoom und Kompass nur, wo die Karte zum Erkunden da ist. Auf einer
    // Vorschau (Fazit) sind drei 32-px-Knöpfe Lärm auf einer Fläche, die
    // nur eine Linie zeigen soll. Die Attribution bleibt immer — sie ist
    // Pflicht (globals.css, Mapbox-Abschnitt).
    if (!ohneBedienelementeRef.current) {
      map.addControl(new mapboxgl.NavigationControl(), "top-right");
    }
    mapRef.current = map;

    let hasFitBounds = false;

    // Läuft beim Erstaufbau und erneut nach jedem map.setStyle()-Aufruf
    // (siehe Themenwechsel-Effekt unten): "style.load" feuert in beiden
    // Fällen, "load" dagegen nur einmalig. setStyle() ersetzt den kompletten
    // Style inkl. aller selbst hinzugefügten Sources/Layer — sie müssen hier
    // deshalb bei jedem Aufruf neu aufgebaut werden.
    map.on("style.load", () => {
      // Deutsche Strassen-/Orts-Labels statt der Browser-/Systemsprache der
      // Nutzerin — muss nach jedem "style.load" (auch nach setStyle() beim
      // Themenwechsel) erneut gesetzt werden, da ein Style-Wechsel die
      // Sprachauswahl der Text-Layer zurücksetzt.
      map.setLanguage("de");

      // Knapp unterhalb der Strassennummern-Schilder (z.B. A1-Schild) einfügen:
      // road-label (Strassennamen-Text) liegt in der Streets-v12-Style-
      // Reihenfolge VOR road-number-shield, also landet unsere Strecke über
      // den Namens-Labels, aber unter den Schildern — Schilder bleiben
      // sichtbar, Namens-Labels werden von der Strecke überdeckt. Existiert
      // der Layer nicht (Style-Update), fällt es auf das alte Verhalten
      // zurück (Strecke ganz oben, wie vor dieser Anpassung).
      const shieldLayerId = "road-number-shield";
      const firstSymbolId = map.getStyle().layers?.some((l) => l.id === shieldLayerId)
        ? shieldLayerId
        : undefined;

      map.addSource(ROUTES_SOURCE, {
        type: "geojson",
        data: toFeatureCollection(routesRef.current, signaturenRef.current),
      });

      map.addLayer(
        {
          id: ROUTES_LINE_LAYER,
          type: "line",
          source: ROUTES_SOURCE,
          layout: { "line-join": "round", "line-cap": "round" },
          paint: {
            "line-color": ["get", "color"],
            "line-width": ["interpolate", ["linear"], ["zoom"], 8, 2, 14, 4],
            "line-opacity": routeOpacity(primaryRouteIdRef.current),
          },
        },
        firstSymbolId,
      );

      // Unsichtbarer, deutlich breiterer Layer über derselben Quelle — dient
      // ausschliesslich als grössere Trefferfläche für Klick/Tap (siehe
      // map.on("click", ROUTES_HIT_LAYER, ...) unten). Die sichtbare Linie
      // bleibt schmal (Kartenoptik), aber gerade auf Touch-Geräten ist eine
      // 2-4px breite Linie kaum präzise zu treffen.
      map.addLayer(
        {
          id: ROUTES_HIT_LAYER,
          type: "line",
          source: ROUTES_SOURCE,
          layout: { "line-join": "round", "line-cap": "round" },
          paint: {
            "line-color": "#000000",
            "line-opacity": 0,
            "line-width": ["interpolate", ["linear"], ["zoom"], 8, 20, 14, 28],
          },
        },
        firstSymbolId,
      );

      map.addSource(TRACK_SOURCE, {
        type: "geojson",
        data: toTrackFeatureCollection(trailRef.current),
      });
      map.addLayer(
        {
          id: TRACK_LINE_LAYER,
          type: "line",
          source: TRACK_SOURCE,
          layout: { "line-join": "round", "line-cap": "round" },
          paint: {
            "line-color": streckenFarbe(),
            "line-width": ["interpolate", ["linear"], ["zoom"], 8, 2.5, 14, 4.5],
          },
        },
        firstSymbolId,
      );

      const single = routesRef.current.length === 1 ? routesRef.current[0] : null;
      map.addSource(SPEED_SOURCE, {
        type: "geojson",
        data:
          single?.tempolimits?.length
            ? toSpeedFeatureCollection(
                single.geometry_geojson.coordinates as [number, number][],
                single.tempolimits,
              )
            : { type: "FeatureCollection", features: [] },
      });
      map.addLayer(
        {
          id: SPEED_LINE_LAYER,
          type: "line",
          source: SPEED_SOURCE,
          layout: {
            "line-join": "round",
            "line-cap": "round",
            visibility: showSpeedLimitsRef.current ? "visible" : "none",
          },
          paint: {
            "line-color": ["get", "color"],
            "line-width": ["interpolate", ["linear"], ["zoom"], 8, 3, 14, 6],
          },
        },
        firstSymbolId,
      );

      // Stau-Abschnitte direkt auf der Streckenlinie eingefärbt — analog zu
      // SPEED_LINE_LAYER, aus vorab (in RouteDetailMap) abgefragten und
      // eingefärbten Segmenten statt einer eigenen, alle Strassen der Umgebung
      // abdeckenden Verkehrs-Kachelebene.
      map.addSource(TRAFFIC_SOURCE, {
        type: "geojson",
        data: toTrafficFeatureCollection(trafficSegmentsRef.current),
      });
      map.addLayer(
        {
          id: TRAFFIC_LINE_LAYER,
          type: "line",
          source: TRAFFIC_SOURCE,
          layout: {
            "line-join": "round",
            "line-cap": "round",
            visibility: showTrafficRef.current ? "visible" : "none",
          },
          paint: {
            "line-color": ["get", "color"],
            "line-width": ["interpolate", ["linear"], ["zoom"], 8, 3, 14, 6],
          },
        },
        firstSymbolId,
      );

      // Hervorhebungs-Layer für den per Sidebar-Hover markierten Track: weisser
      // Halo (analog zum Stroke der Endpunkt-Punkte) plus farbige Linie darüber,
      // damit ein Hover auf der Karte sofort auffindbar ist. Derselbe Layer
      // trägt die primäre Strecke (primaryRouteId) — statt eines dritten
      // Linien-Renderings daneben.
      // Hover hat Vorrang vor der primären Strecke — beide bedienen denselben
      // Layer, aber gleichzeitig treten sie nirgends auf (die Explore-Karte
      // kennt keine primäre Strecke, der Aufzeichnungsschirm keinen Hover).
      const highlightId = hoveredRouteIdRef.current ?? primaryRouteIdRef.current;
      const hoveredRoute = highlightId
        ? routesRef.current.find((r) => r.id === highlightId)
        : undefined;
      map.addSource(HIGHLIGHT_SOURCE, {
        type: "geojson",
        data: hoveredRoute
          ? {
              type: "FeatureCollection",
              features: [
                {
                  type: "Feature",
                  geometry: hoveredRoute.geometry_geojson,
                  properties: { color: streckenFarbe() },
                },
              ],
            }
          : { type: "FeatureCollection", features: [] },
      });
      map.addLayer(
        {
          id: HIGHLIGHT_HALO_LAYER,
          type: "line",
          source: HIGHLIGHT_SOURCE,
          layout: { "line-join": "round", "line-cap": "round" },
          paint: {
            "line-color": "#FAFAFA",
            "line-width": ["interpolate", ["linear"], ["zoom"], 8, 6, 14, 11],
          },
        },
        firstSymbolId,
      );
      map.addLayer(
        {
          id: HIGHLIGHT_LINE_LAYER,
          type: "line",
          source: HIGHLIGHT_SOURCE,
          layout: { "line-join": "round", "line-cap": "round" },
          paint: {
            "line-color": ["get", "color"],
            "line-width": ["interpolate", ["linear"], ["zoom"], 8, 3.5, 14, 6],
          },
        },
        firstSymbolId,
      );

      map.addSource(ENDPOINTS_SOURCE, {
        type: "geojson",
        data: toEndpointFeatureCollection(routesRef.current, signaturenRef.current),
      });
      map.addLayer(
        {
          id: ENDPOINTS_LAYER,
          type: "circle",
          source: ENDPOINTS_SOURCE,
          paint: {
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 8, 3.5, 14, 5.5],
            "circle-color": ["get", "color"],
            "circle-stroke-width": 1.5,
            "circle-stroke-color": "#FAFAFA",
            // Auch die Start-/Zielpunkte der Kontext-Strecken treten zurück;
            // ohne das blieben ausgerechnet die auffälligsten Elemente der
            // fremden Strecken in voller Deckkraft stehen.
            "circle-opacity": routeOpacity(primaryRouteIdRef.current),
            "circle-stroke-opacity": routeOpacity(primaryRouteIdRef.current),
          },
        },
        firstSymbolId,
      );

      // Höhendaten-Quelle immer hinzugefügt (auch wenn 3D initial aus ist) —
      // setTerrain()/setTerrain(null) beim Umschalten (siehe eigener Effekt
      // unten) braucht sie so oder so, und ein separates addSource beim
      // ersten Aktivieren würde nur unnötig verzögern.
      map.addSource(TERRAIN_SOURCE, {
        type: "raster-dem",
        url: "mapbox://mapbox.mapbox-terrain-dem-v1",
        tileSize: 512,
        maxzoom: 14,
      });
      map.addLayer({
        id: SKY_LAYER,
        type: "sky",
        paint: { "sky-type": "atmosphere", "sky-atmosphere-sun-intensity": 8 },
      });
      if (show3DRef.current) {
        map.setTerrain({ source: TERRAIN_SOURCE, exaggeration: TERRAIN_EXAGGERATION });
        map.easeTo({ pitch: TILTED_PITCH, bearing: TILTED_BEARING, duration: 0 });
      }

      // Nur beim allerersten Style-Aufbau auf die Strecken zoomen — bei einem
      // späteren Themenwechsel (erneutes "style.load") soll die aktuelle
      // Kartenansicht der Nutzerin erhalten bleiben statt zurückzuspringen.
      if (!hasFitBounds) {
        if (routesRef.current.length > 0 && fitRoutesRef.current) {
          fitToRoutes(
            map,
            fitTargets(routesRef.current, primaryRouteIdRef.current),
            false,
            bottomInsetRef.current,
          );
        } else {
          fitToTrail(map, trailRef.current, false, bottomInsetRef.current);
        }
        eingepasstMitInsetRef.current = bottomInsetRef.current;
        hasFitBounds = true;
      }

      styleLoadedRef.current = true;
      setStilGeneration((n) => n + 1);
      setIsReady(true);
    });

    // Delegierte Layer-Listener bleiben auch über einen Style-Wechsel hinweg
    // gültig (Mapbox GL prüft den Layer erst zur Klick-/Hover-Zeit) — daher
    // ausserhalb von "style.load" registriert, sonst würden sie sich bei
    // jedem Themenwechsel duplizieren.
    map.on("mouseenter", ROUTES_HIT_LAYER, () => {
      // Kein Zeigefinger, wo der Klick bewusst nichts tut.
      if (!routesClickableRef.current) return;
      map.getCanvas().style.cursor = "pointer";
    });
    map.on("mouseleave", ROUTES_HIT_LAYER, () => {
      map.getCanvas().style.cursor = "";
    });
    map.on("click", ROUTES_HIT_LAYER, (e) => {
      if (!routesClickableRef.current) return;
      const id = e.features?.[0]?.properties?.id;
      if (id) router.push(`/strecken/${id}`);
    });

    // Jede von Hand begonnene Kamerabewegung — Ziehen, Zoomen, Drehen —
    // schaltet das automatische Nachpassen an den Sheet-Rastpunkt ab (siehe
    // den Effekt zu bottomInsetPx unten). "movestart" deckt auch das Zoomen
    // per Pinch und Doppeltipp ab, die kein "dragstart" auslösen.
    map.on("movestart", (e) => {
      if (e.originalEvent) nutzerBewegteKameraRef.current = true;
    });

    map.on("dragstart", () => {
      isDraggingRef.current = true;
    });
    map.on("dragend", () => {
      isDraggingRef.current = false;
    });

    return () => {
      map.remove();
      mapRef.current = null;
      styleLoadedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Kartenstil folgt dem Farbschema live: heller Style bei Hell/System-hell,
  // dunkler Style bei Dunkel/System-dunkel, auch wenn die Nutzerin das Thema
  // umschaltet, während die Karte bereits offen ist (statt nur beim
  // nächsten Mount). map.setStyle() entfernt vorübergehend alle Sources/
  // Layer, deshalb styleLoadedRef währenddessen zurücksetzen — die
  // Update-Effekte unten prüfen dieses Flag, bevor sie auf Sources
  // zugreifen, und setupLayers() (via "style.load") baut alles neu auf.
  useEffect(() => {
    let currentStyle = mapStyleForTheme();
    return subscribeToThemeChange(() => {
      const map = mapRef.current;
      if (!map) return;

      // Der Standort-Marker ist ein DOM-Overlay und überlebt setStyle() —
      // siehe faerbeStandortMarker. Vor dem Stilwechsel und unabhängig
      // davon, ob er überhaupt einen auslöst: die Farbe des Markers hängt
      // am Token, nicht am Kartenstil.
      const elemente = locationElementsRef.current;
      if (elemente) faerbeStandortMarker(elemente);

      const nextStyle = mapStyleForTheme();
      if (nextStyle === currentStyle) return;
      currentStyle = nextStyle;
      styleLoadedRef.current = false;
      map.setStyle(nextStyle);
    });
  }, []);

  // Kartendaten aktualisieren, wenn sich die gefilterte Streckenliste oder
  // die Signatur-Zuordnung ändert.
  //
  // Am Thema hängt der Effekt weiterhin NICHT: ein Themenwechsel tauscht
  // über den Effekt weiter unten den Kartenstil, das löst "style.load" aus,
  // und setupLayers() baut beide Sammlungen neu — mit frisch aus den Tokens
  // gelesenen Farben. Das galt, als alle Linien den Akzent trugen, und gilt
  // für die Signaturtöne unverändert, weil sie denselben Weg nehmen.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleLoadedRef.current) return;
    const source = map.getSource(ROUTES_SOURCE) as mapboxgl.GeoJSONSource | undefined;
    if (!source) return;
    source.setData(toFeatureCollection(routes, signaturen));

    const endpointsSource = map.getSource(ENDPOINTS_SOURCE) as mapboxgl.GeoJSONSource | undefined;
    endpointsSource?.setData(toEndpointFeatureCollection(routes, signaturen));

    const single = routes.length === 1 ? routes[0] : null;
    const speedSource = map.getSource(SPEED_SOURCE) as mapboxgl.GeoJSONSource | undefined;
    speedSource?.setData(
      single?.tempolimits?.length
        ? toSpeedFeatureCollection(
            single.geometry_geojson.coordinates as [number, number][],
            single.tempolimits,
          )
        : { type: "FeatureCollection", features: [] },
    );

    map.setPaintProperty(ROUTES_LINE_LAYER, "line-opacity", routeOpacity(primaryRouteId));
    map.setPaintProperty(ENDPOINTS_LAYER, "circle-opacity", routeOpacity(primaryRouteId));
    map.setPaintProperty(ENDPOINTS_LAYER, "circle-stroke-opacity", routeOpacity(primaryRouteId));

    if (fitRoutes) {
      // Eine neue Streckenauswahl ist ein neuer Ausschnitt — das überschreibt
      // ein Hineinzoomen von Hand, und die Sperre dafür fällt damit auch.
      nutzerBewegteKameraRef.current = false;
      fitToRoutes(map, fitTargets(routes, primaryRouteId), true, bottomInsetRef.current);
      eingepasstMitInsetRef.current = bottomInsetRef.current;
    }
  }, [routes, signaturen, fitRoutes, primaryRouteId]);

  // Ändert sich die vom Sheet verdeckte Fläche (auf-, zu- oder ganz
  // weggezogen, Drehung des Geräts), passt sich der Ausschnitt an die neue
  // *sichtbare* Kartenfläche an — genau das, was beim Öffnen einer Strecke
  // vorher fehlte: die Strecke wurde in die volle Leinwand eingepasst und
  // stand dann zur Hälfte unter dem Sheet.
  //
  // Zwei Bremsen: hat die Nutzerin die Kamera selbst bewegt, bleibt ihr
  // Ausschnitt stehen; und deckt das Sheet die Karte fast ganz ab, wird nicht
  // auf den letzten Streifen gerechnet (siehe NEU_EINPASSEN_MIN_HOEHE_PX).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleLoadedRef.current) return;
    if (!fitRoutes || nutzerBewegteKameraRef.current) return;
    if (eingepasstMitInsetRef.current === bottomInsetPx) return;
    if (map.getContainer().clientHeight - bottomInsetPx < NEU_EINPASSEN_MIN_HOEHE_PX) return;
    fitToRoutes(
      map,
      fitTargets(routesRef.current, primaryRouteIdRef.current),
      true,
      bottomInsetPx,
    );
    eingepasstMitInsetRef.current = bottomInsetPx;
  }, [bottomInsetPx, fitRoutes, stilGeneration]);

  // Markiert die per Sidebar-Hover (oder Tastaturfokus) ausgewählte bzw. die
  // primäre Strecke auf der Karte — eigener Source/Layer statt feature-state,
  // weil hier ohnehin eine ganze Strecke (nicht nur ein Feature-Property)
  // ausgetauscht wird.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleLoadedRef.current) return;
    const source = map.getSource(HIGHLIGHT_SOURCE) as mapboxgl.GeoJSONSource | undefined;
    if (!source) return;

    const highlightId = hoveredRouteId ?? primaryRouteId;
    const route = highlightId
      ? routesRef.current.find((r) => r.id === highlightId)
      : undefined;

    source.setData(
      route
        ? {
            type: "FeatureCollection",
            features: [
              {
                type: "Feature",
                geometry: route.geometry_geojson,
                properties: { color: streckenFarbe() },
              },
            ],
          }
        : { type: "FeatureCollection", features: [] },
    );
  }, [hoveredRouteId, primaryRouteId, routes]);

  // Zufallsvorschlag der Startseite: rein additiv neben fitRoutes — die
  // Streckenliste selbst ändert sich dabei nicht, es wird also kein
  // bestehendes Einpassen ersetzt, sondern eines nachgeschoben. Grösseres
  // Padding als fitToRoutes (64 statt 48), weil hier eine einzelne Strecke
  // gezeigt wird und die Meldung darüber Platz braucht.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleLoadedRef.current || !flyToRouteId) return;
    const route = routesRef.current.find((r) => r.id === flyToRouteId);
    if (!route) return;
    const bounds = new mapboxgl.LngLatBounds();
    for (const coord of route.geometry_geojson.coordinates) {
      bounds.extend(coord as [number, number]);
    }
    map.fitBounds(bounds, {
      padding: fitPadding(map, FIT_PADDING_EINZELN_PX, bottomInsetRef.current),
      duration: bewegungsdauer(800),
    });
    // stilGeneration in den Abhängigkeiten, damit ein Klick, der vor dem
    // style.load eintrifft, nicht verpufft: der Effekt bricht dann oben ab
    // und läuft nach, sobald der Stil steht. Ohne das erschiene der
    // Vorschlag, aber die Kamera bliebe stehen.
  }, [flyToRouteId, stilGeneration]);

  // Hält die gezeichnete Track-Linie aktuell — während einer Aufzeichnung
  // bei jedem neuen GPS-Punkt, auf der Detailseite einmalig.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleLoadedRef.current) return;
    const source = map.getSource(TRACK_SOURCE) as mapboxgl.GeoJSONSource | undefined;
    if (!source) return;
    source.setData(toTrackFeatureCollection(trail));
    if (fitTrail) fitToTrail(map, trail, true, bottomInsetRef.current);
  }, [trail, fitTrail]);

  // Aktualisiert die eingefärbten Stau-Abschnitte, sobald RouteDetailMap eine
  // neue Verkehrsabfrage abgeschlossen hat.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleLoadedRef.current) return;
    const source = map.getSource(TRAFFIC_SOURCE) as mapboxgl.GeoJSONSource | undefined;
    source?.setData(toTrafficFeatureCollection(trafficSegments));
  }, [trafficSegments]);

  // Sichtbarkeit des Tempolimit-Layers reagiert auf den "Tempolimits
  // anzeigen"-Toggle, statt bei jedem Kartenaufbau neu (und nur einmalig)
  // entschieden zu werden — sonst bleibt ein späteres Umschalten wirkungslos.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleLoadedRef.current) return;
    if (!map.getLayer(SPEED_LINE_LAYER)) return;
    map.setLayoutProperty(SPEED_LINE_LAYER, "visibility", showSpeedLimits ? "visible" : "none");
  }, [showSpeedLimits]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleLoadedRef.current) return;
    if (!map.getLayer(TRAFFIC_LINE_LAYER)) return;
    map.setLayoutProperty(TRAFFIC_LINE_LAYER, "visibility", showTraffic ? "visible" : "none");
  }, [showTraffic]);

  // 3D-Umschalter: Terrain-Exaggeration + Kamerawinkel zusammen setzen, statt
  // nur die Höhendaten zu aktivieren — ohne pitch bliebe die Ansicht
  // senkrecht von oben und der Relief-Effekt wäre kaum sichtbar.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleLoadedRef.current) return;
    if (show3D) {
      map.setTerrain({ source: TERRAIN_SOURCE, exaggeration: TERRAIN_EXAGGERATION });
      map.easeTo({ pitch: TILTED_PITCH, bearing: TILTED_BEARING, duration: bewegungsdauer(800) });
    } else {
      map.setTerrain(null);
      map.easeTo({ pitch: 0, bearing: 0, duration: bewegungsdauer(800) });
    }
  }, [show3D]);

  // Standort-Marker anzeigen/aktualisieren, sobald die Sidebar den Standort
  // ermittelt hat. Ring/Kegel-Grösse hängt vom aktuellen Kartenzoom bzw. der
  // Kartenausrichtung ab, nicht nur von Position/Genauigkeit/Kurs selbst —
  // "zoom"/"rotate" lösen daher ebenfalls ein Neuberechnen aus (z.B. wenn der
  // Nutzer während einer laufenden Aufzeichnung zoomt, ohne dass währenddessen
  // ein neuer GPS-Fix eintrifft).
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (!userLocation) {
      locationMarkerRef.current?.remove();
      locationMarkerRef.current = null;
      locationElementsRef.current = null;
      return;
    }

    function applyVisuals() {
      const els = locationElementsRef.current;
      if (!els || !userLocation || !map) return;
      const zoom = map.getZoom();

      if (userAccuracyM != null && userAccuracyM > 0) {
        const diameterPx = metersToPixelsAtLatitude(userAccuracyM, userLocation[1], zoom) * 2;
        // Bei sehr schlechtem Fix (z.B. Tunnel, dichter Wald) auf eine
        // sinnvolle Maximalgrösse begrenzen, statt den Ring über die ganze
        // Karte wachsen zu lassen.
        const clampedPx = Math.min(diameterPx, 400);
        els.accuracyEl.style.width = `${clampedPx}px`;
        els.accuracyEl.style.height = `${clampedPx}px`;
        els.accuracyEl.style.display = "block";
      } else {
        els.accuracyEl.style.display = "none";
      }

      if (userHeadingDeg != null && !Number.isNaN(userHeadingDeg)) {
        const bearing = map.getBearing();
        els.headingEl.style.transform = `translate(-50%, -50%) rotate(${userHeadingDeg - bearing}deg)`;
        els.headingEl.style.display = "block";
      } else {
        els.headingEl.style.display = "none";
      }
    }

    // Ungenaue Fixe (> MIN_ACCURACY_M) aktualisieren weiterhin Marker/Ring
    // unten, verschieben aber nicht die Kamera — dieselbe Schwelle, mit der
    // useRideRecorder dieselben Fixe von Distanz/Trail ausschliesst. Ohne
    // diesen Gate würde ein einzelner schlechter Fix (Tunnel, dichte
    // Bebauung) die Ansicht kurzzeitig vom tatsächlichen Standort wegreissen.
    const accuracyOk = userAccuracyM == null || userAccuracyM <= MIN_ACCURACY_M;

    if (centerOnFirstLocation && !hasCenteredOnLocationRef.current) {
      hasCenteredOnLocationRef.current = true;
      map.easeTo({ center: userLocation, zoom: 14, duration: 0 });
    } else if (followLocation && !isDraggingRef.current && accuracyOk) {
      // Nur der Kartenmittelpunkt wandert mit — Zoom/Pitch/Bearing bleiben,
      // wie die Nutzerin sie zuletzt eingestellt hat. Kurze Animation statt
      // eines harten Sprungs, da GPS-Fixes alle paar Sekunden eintreffen.
      // Unabhängig von centerOnFirstLocation/hasCenteredOnLocationRef: ein
      // Aufrufer, der nur followLocation setzt (keine initiale Zentrierung),
      // soll trotzdem ab dem ersten Fix nachgeführt werden.
      map.easeTo({ center: userLocation, duration: bewegungsdauer(800) });
    }

    if (locationMarkerRef.current) {
      locationMarkerRef.current.setLngLat(userLocation);
    } else {
      const elements = createLocationMarkerElement();
      locationElementsRef.current = elements;
      locationMarkerRef.current = new mapboxgl.Marker({ element: elements.wrapper })
        .setLngLat(userLocation)
        .addTo(map);
    }

    applyVisuals();
    map.on("zoom", applyVisuals);
    map.on("rotate", applyVisuals);
    return () => {
      map.off("zoom", applyVisuals);
      map.off("rotate", applyVisuals);
    };
  }, [userLocation, userAccuracyM, userHeadingDeg, centerOnFirstLocation, followLocation]);

  if (!MAPBOX_TOKEN) {
    return (
      <div className="flex h-full w-full items-center justify-center rounded-xl border border-muted/25 text-sm text-muted">
        NEXT_PUBLIC_MAPBOX_TOKEN fehlt in .env.local
      </div>
    );
  }

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" />
      {!isReady && (
        <Skeleton className="pointer-events-none absolute inset-0 h-full w-full" />
      )}
    </div>
  );
}
