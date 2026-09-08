"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import mapboxgl from "mapbox-gl";
import type { DataDrivenPropertyValueSpecification } from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { ZURICH_CENTER, DEFAULT_ZOOM } from "@/lib/constants";
import { sliceRouteBySpeed, speedColor } from "@/lib/speed";
import { isDarkTheme, subscribeToThemeChange } from "@/lib/theme";
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
const TRACK_COLOR = "#3D5AFE";
const TERRAIN_SOURCE = "mapbox-dem";
const SKY_LAYER = "sky";
const TERRAIN_EXAGGERATION = 1.4;
const TILTED_PITCH = 60;
const TILTED_BEARING = -17;

// Verwandte Blautöne, damit einzelne Strecken auf der Übersichtskarte
// unterscheidbar sind, ohne aus dem Farbschema auszubrechen.
const ROUTE_BLUE_PALETTE = [
  "#3D5AFE",
  "#0EA5E9",
  "#2563EB",
  "#6366F1",
  "#0284C7",
  "#4F46E5",
  "#38BDF8",
  "#1D4ED8",
];

// Stabiler Hash der Strecken-ID statt Listenindex, damit eine Strecke ihre
// Farbe behält, auch wenn Filter die Reihenfolge/Auswahl ändern. Dient nur
// noch als Fallback, wenn keine Signatur-Farbe übergeben wurde (z.B. auf der
// Detailkarte mit nur einer Strecke).
function colorForRoute(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  }
  return ROUTE_BLUE_PALETTE[hash % ROUTE_BLUE_PALETTE.length];
}

// Farbe kommt primär aus dem Signatur-Merkmal der Strecke (siehe
// lib/signature.ts) — so tragen Kartenlinie und Sidebar-Karte dieselbe
// Bedeutung: gleiches Merkmal, gleiche Farbe.
function resolveColor(colors: Map<string, string> | undefined, id: string): string {
  return colors?.get(id) ?? colorForRoute(id);
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

function toFeatureCollection(
  routes: KartenStrecke[],
  colors?: Map<string, string>,
): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: routes.map((route) => ({
      type: "Feature",
      id: route.id,
      geometry: route.geometry_geojson,
      properties: { id: route.id, name: route.name, color: resolveColor(colors, route.id) },
    })),
  };
}

// Bei Rundfahrten liegen Start und Ziel am selben Ort — dort nur ein Punkt,
// sonst je ein Punkt am Anfang und am Ende der Strecke.
function toEndpointFeatureCollection(
  routes: KartenStrecke[],
  colors?: Map<string, string>,
): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];
  for (const route of routes) {
    const color = resolveColor(colors, route.id);
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

// Standort-Marker aus drei übereinanderliegenden, unabhängig positionierten
// Ebenen statt eines einzelnen Punkts — orientiert sich an der üblichen
// Navi-App-Konvention (Apple/Google Maps): ein Genauigkeits-Ring kommuniziert
// die GPS-Unsicherheit, ein Richtungskegel zeigt die Fahrtrichtung, wenn
// bekannt, und der Punkt selbst bleibt immer sichtbar. Wrapper ist bewusst
// 0x0 gross (statt einer festen Grösse) — alle Kinder sind absolut über
// left/top:0 + translate(-50%,-50%) auf denselben Ankerpunkt zentriert, so
// bleibt die Zentrierung korrekt, auch wenn der Ring durch wechselnde
// Genauigkeit laufend seine Grösse ändert.
function createLocationMarkerElement() {
  const wrapper = document.createElement("div");
  wrapper.style.position = "relative";
  wrapper.style.width = "0px";
  wrapper.style.height = "0px";

  const accuracyEl = document.createElement("div");
  accuracyEl.style.position = "absolute";
  accuracyEl.style.left = "0";
  accuracyEl.style.top = "0";
  accuracyEl.style.borderRadius = "50%";
  accuracyEl.style.backgroundColor = "rgba(61, 90, 254, 0.15)";
  accuracyEl.style.border = "1px solid rgba(61, 90, 254, 0.35)";
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
  headingEl.style.background =
    "linear-gradient(to bottom, rgba(61,90,254,0.9), rgba(61,90,254,0))";
  headingEl.style.pointerEvents = "none";
  headingEl.style.display = "none";

  const dotEl = document.createElement("div");
  dotEl.style.position = "absolute";
  dotEl.style.left = "0";
  dotEl.style.top = "0";
  dotEl.style.width = "12px";
  dotEl.style.height = "12px";
  dotEl.style.borderRadius = "50%";
  dotEl.style.backgroundColor = "#3D5AFE";
  dotEl.style.border = "2.5px solid #FAFAFA";
  dotEl.style.boxShadow = "0 0 0 1px rgba(19,19,22,0.25), 0 1px 3px rgba(19,19,22,0.35)";
  dotEl.style.transform = "translate(-50%, -50%)";

  wrapper.appendChild(accuracyEl);
  wrapper.appendChild(headingEl);
  wrapper.appendChild(dotEl);

  return { wrapper, accuracyEl, headingEl, dotEl };
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

function fitToRoutes(map: mapboxgl.Map, routes: KartenStrecke[], animate: boolean) {
  if (routes.length === 0) return;
  const bounds = new mapboxgl.LngLatBounds();
  for (const route of routes) {
    for (const coord of route.geometry_geojson.coordinates) {
      bounds.extend(coord as [number, number]);
    }
  }
  map.fitBounds(bounds, { padding: 48, duration: animate ? 500 : 0 });
}

function fitToTrail(map: mapboxgl.Map, trail: [number, number][], animate: boolean) {
  if (trail.length < 2) return;
  const bounds = new mapboxgl.LngLatBounds();
  for (const coord of trail) bounds.extend(coord);
  map.fitBounds(bounds, { padding: 48, duration: animate ? 500 : 0 });
}

export default function RouteMap({
  routes,
  userLocation,
  userAccuracyM = null,
  userHeadingDeg = null,
  showSpeedLimits = false,
  showTraffic = false,
  show3D = false,
  colors,
  hoveredRouteId = null,
  primaryRouteId = null,
  trafficSegments = [],
  trail = [],
  fitTrail = false,
  fitRoutes = true,
  routesClickable = true,
  centerOnFirstLocation = false,
  followLocation = false,
}: {
  routes: KartenStrecke[];
  userLocation?: [number, number] | null;
  // GPS-Genauigkeitsradius in Metern (position.coords.accuracy) bzw.
  // Kompasskurs in Grad (position.coords.heading) — optional, da nicht jeder
  // Aufrufer sie hat (z.B. ExploreView ruft nur einmalig getCurrentPosition).
  userAccuracyM?: number | null;
  userHeadingDeg?: number | null;
  showSpeedLimits?: boolean;
  showTraffic?: boolean;
  show3D?: boolean;
  colors?: Map<string, string>;
  hoveredRouteId?: string | null;
  // Die "eigene" Strecke unter mehreren: sie wird wie ein Hover hervorgehoben
  // (derselbe Highlight-Layer), alle übrigen treten in der Deckkraft zurück,
  // und der Kartenausschnitt passt sich nur auf sie ein. Für den
  // Aufzeichnungsschirm einer Streckenfahrt gedacht, wo die umliegenden
  // Strecken der Orientierung dienen, die gefahrene aber die Hauptlinie
  // bleiben muss. Ohne diesen Wert ändert sich nichts am bisherigen
  // Verhalten (Explore-Karte, Detailkarte).
  primaryRouteId?: string | null;
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
}) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const styleLoadedRef = useRef(false);
  // Deckt die Lücke zwischen Container-Mount und dem ersten sichtbaren
  // Kartenbild ab (Style- und Tile-Ladezeit von Mapbox GL selbst, unabhängig
  // vom bereits vorhandenen Skeleton für den Code-Split in RouteDetailMap/
  // ExploreView) — ohne das wäre die Karte für ein bis zwei Sekunden leer.
  const [isReady, setIsReady] = useState(false);
  const routesRef = useRef(routes);
  const colorsRef = useRef(colors);
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

  useEffect(() => {
    routesRef.current = routes;
  }, [routes]);

  useEffect(() => {
    routesClickableRef.current = routesClickable;
  }, [routesClickable]);

  useEffect(() => {
    fitRoutesRef.current = fitRoutes;
  }, [fitRoutes]);

  useEffect(() => {
    colorsRef.current = colors;
  }, [colors]);

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
      center: ZURICH_CENTER,
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
    });

    map.addControl(new mapboxgl.AttributionControl({ compact: true }));
    map.addControl(new mapboxgl.NavigationControl(), "top-right");
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
        data: toFeatureCollection(routesRef.current, colorsRef.current),
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
            "line-color": TRACK_COLOR,
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
                  properties: { color: resolveColor(colorsRef.current, hoveredRoute.id) },
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
        data: toEndpointFeatureCollection(routesRef.current, colorsRef.current),
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
          fitToRoutes(map, fitTargets(routesRef.current, primaryRouteIdRef.current), false);
        } else {
          fitToTrail(map, trailRef.current, false);
        }
        hasFitBounds = true;
      }

      styleLoadedRef.current = true;
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
      const nextStyle = mapStyleForTheme();
      if (nextStyle === currentStyle) return;
      currentStyle = nextStyle;
      styleLoadedRef.current = false;
      map.setStyle(nextStyle);
    });
  }, []);

  // Kartendaten aktualisieren, wenn sich die gefilterte Streckenliste oder die
  // Signatur-Farben ändern.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleLoadedRef.current) return;
    const source = map.getSource(ROUTES_SOURCE) as mapboxgl.GeoJSONSource | undefined;
    if (!source) return;
    source.setData(toFeatureCollection(routes, colors));

    const endpointsSource = map.getSource(ENDPOINTS_SOURCE) as mapboxgl.GeoJSONSource | undefined;
    endpointsSource?.setData(toEndpointFeatureCollection(routes, colors));

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

    if (fitRoutes) fitToRoutes(map, fitTargets(routes, primaryRouteId), true);
  }, [routes, colors, fitRoutes, primaryRouteId]);

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
                properties: { color: resolveColor(colorsRef.current, route.id) },
              },
            ],
          }
        : { type: "FeatureCollection", features: [] },
    );
  }, [hoveredRouteId, primaryRouteId, routes]);

  // Hält die gezeichnete Track-Linie aktuell — während einer Aufzeichnung
  // bei jedem neuen GPS-Punkt, auf der Detailseite einmalig.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleLoadedRef.current) return;
    const source = map.getSource(TRACK_SOURCE) as mapboxgl.GeoJSONSource | undefined;
    if (!source) return;
    source.setData(toTrackFeatureCollection(trail));
    if (fitTrail) fitToTrail(map, trail, true);
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
      map.easeTo({ pitch: TILTED_PITCH, bearing: TILTED_BEARING, duration: 800 });
    } else {
      map.setTerrain(null);
      map.easeTo({ pitch: 0, bearing: 0, duration: 800 });
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
      map.easeTo({ center: userLocation, duration: 800 });
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
