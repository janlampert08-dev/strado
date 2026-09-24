"use client";

import KartePlatzhalter from "@/components/ui/KartePlatzhalter";
import dynamic from "next/dynamic";
import type { GeoLineString, RouteGeoJSON } from "@/types/database";

const RouteMap = dynamic(() => import("@/components/RouteMap"), {
  ssr: false,
  loading: () => <KartePlatzhalter />,
});

const NO_ROUTES: never[] = [];
const NO_TEMPO: { coords: [number, number][]; stufe: number }[] = [];

// Zwei Fälle: eine Streckenfahrt zeigt die Streckengeometrie, eine freie
// Fahrt den aufgezeichneten GPS-Track (die einzige Geometrie, die sie hat).
// Dritter Fall (0115): Der Besitzer sieht seine eigene Spur nach gefahrenem
// Tempo eingefärbt — dann trägt die farbige Ebene die Linie und die
// einfarbige tritt zurück (RouteMap blendet sie aus). Fremde Betrachter
// bekommen nie Segmente, sie sehen die bisherige Darstellung.
export default function CompletionMap({
  route,
  track,
  tempoSegmente,
}: {
  route?: RouteGeoJSON | null;
  track?: GeoLineString | null;
  tempoSegmente?: { coords: [number, number][]; stufe: number }[] | null;
}) {
  // Die Karte steht mitten in der Fahrtseite: kooperative Gesten, damit
  // ein Wisch die Seite scrollt statt die Karte, und keine Zoomknöpfe —
  // gezoomt wird mit zwei Fingern, die Knöpfe waren drei weisse 32-px-
  // Flächen auf der dunklen Karte.
  if (route) return <RouteMap routes={[route]} kooperativeGesten ohneBedienelemente />;

  return (
    <RouteMap
      kooperativeGesten
      ohneBedienelemente
      routes={NO_ROUTES}
      trail={(track?.coordinates as [number, number][]) ?? []}
      tempoSegmente={tempoSegmente ?? NO_TEMPO}
      fitTrail
    />
  );
}
