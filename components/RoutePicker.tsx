"use client";

import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { ZURICH_CENTER, DEFAULT_ZOOM } from "@/lib/constants";
import { isDarkTheme, subscribeToThemeChange } from "@/lib/theme";

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
const LINE_SOURCE = "picker-line";

function mapStyleForTheme(): string {
  return isDarkTheme() ? "mapbox://styles/mapbox/dark-v11" : "mapbox://styles/mapbox/streets-v12";
}

export default function RoutePicker({
  waypoints,
  previewCoords,
  onPick,
}: {
  waypoints: [number, number][];
  previewCoords: [number, number][] | null;
  onPick: (point: [number, number]) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);
  const onPickRef = useRef(onPick);
  const waypointsRef = useRef(waypoints);
  const previewCoordsRef = useRef(previewCoords);

  useEffect(() => {
    onPickRef.current = onPick;
  }, [onPick]);

  useEffect(() => {
    waypointsRef.current = waypoints;
  }, [waypoints]);

  useEffect(() => {
    previewCoordsRef.current = previewCoords;
  }, [previewCoords]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current || !MAPBOX_TOKEN) return;
    mapboxgl.accessToken = MAPBOX_TOKEN;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: mapStyleForTheme(),
      center: ZURICH_CENTER,
      zoom: DEFAULT_ZOOM,
      // Kompakte Attribution (ⓘ-Knopf) statt ausgeschriebener Zeile — siehe
      // RouteMap.tsx für die ausführliche Begründung.
      attributionControl: false,
    });

    map.addControl(new mapboxgl.AttributionControl({ compact: true }));
    map.addControl(new mapboxgl.NavigationControl(), "top-right");
    map.on("click", (e) => onPickRef.current([e.lngLat.lng, e.lngLat.lat]));

    // "style.load" statt "load": feuert auch nach einem späteren
    // map.setStyle()-Aufruf beim Themenwechsel (siehe eigener Effekt unten),
    // der Source/Layer sonst kommentarlos entfernt.
    map.on("style.load", () => {
      // Deutsche Strassen-/Orts-Labels — muss nach jedem "style.load" (auch
      // nach setStyle() beim Themenwechsel) erneut gesetzt werden, siehe
      // RouteMap.tsx für die ausführliche Begründung.
      map.setLanguage("de");

      map.addSource(LINE_SOURCE, {
        type: "geojson",
        data: {
          type: "Feature",
          properties: {},
          geometry: { type: "LineString", coordinates: previewCoordsRef.current ?? [] },
        },
      });
      map.addLayer({
        id: LINE_SOURCE,
        type: "line",
        source: LINE_SOURCE,
        layout: { "line-join": "round", "line-cap": "round" },
        paint: { "line-color": "#3D5AFE", "line-width": 3 },
      });
    });

    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Kartenstil folgt dem Farbschema live, auch wenn die Nutzerin während des
  // Streckeneinzeichnens das Thema umschaltet (siehe RouteMap.tsx für die
  // ausführliche Begründung des gleichen Musters).
  useEffect(() => {
    let currentStyle = mapStyleForTheme();
    return subscribeToThemeChange(() => {
      const map = mapRef.current;
      if (!map) return;
      const nextStyle = mapStyleForTheme();
      if (nextStyle === currentStyle) return;
      currentStyle = nextStyle;
      map.setStyle(nextStyle);
    });
  }, []);

  // Zentriert die Karte einmalig auf den Standort der Nutzerin, sobald
  // verfügbar (Fallback bleibt ZURICH_CENTER) — nur solange noch keine
  // Wegpunkte gesetzt sind, damit ein verspätet eintreffendes Ergebnis eine
  // bereits begonnene Route nicht verschiebt. Berechtigungsverweigerung/
  // Timeout wird bewusst still ignoriert, kein Fehlerdialog nötig.
  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (waypointsRef.current.length > 0) return;
        mapRef.current?.easeTo({
          center: [pos.coords.longitude, pos.coords.latitude],
          zoom: 12,
          duration: 800,
        });
      },
      () => {},
      { maximumAge: 60_000, timeout: 5000 },
    );
  }, []);

  // Nummerierte Marker je gesetztem Wegpunkt.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    markersRef.current.forEach((m) => m.remove());
    markersRef.current = waypoints.map((point, i) => {
      const el = document.createElement("div");
      el.textContent = String(i + 1);
      el.style.cssText =
        "background:#131316;color:#FAFAFA;width:22px;height:22px;display:flex;" +
        "align-items:center;justify-content:center;font:600 12px/1 Inter,sans-serif;" +
        (i === 0 ? "background:#3D5AFE;" : "");
      return new mapboxgl.Marker({ element: el }).setLngLat(point).addTo(map);
    });
  }, [waypoints]);

  // Vorschau-Route (echtes Strassenrouting) einzeichnen.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const source = map.getSource(LINE_SOURCE) as mapboxgl.GeoJSONSource | undefined;
    source?.setData({
      type: "Feature",
      properties: {},
      geometry: { type: "LineString", coordinates: previewCoords ?? [] },
    });
  }, [previewCoords]);

  if (!MAPBOX_TOKEN) {
    return (
      <div className="flex h-full w-full items-center justify-center rounded-lg border border-border text-sm text-muted">
        NEXT_PUBLIC_MAPBOX_TOKEN fehlt in .env.local
      </div>
    );
  }

  return <div ref={containerRef} className="h-full w-full" />;
}
