"use client";

import dynamic from "next/dynamic";
import Skeleton from "@/components/ui/Skeleton";
import type { GeoLineString, RouteGeoJSON } from "@/types/database";

const RouteMap = dynamic(() => import("@/components/RouteMap"), {
  ssr: false,
  loading: () => <Skeleton className="h-full w-full" />,
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
  if (route) return <RouteMap routes={[route]} />;

  return (
    <RouteMap
      routes={NO_ROUTES}
      trail={(track?.coordinates as [number, number][]) ?? []}
      tempoSegmente={tempoSegmente ?? NO_TEMPO}
      fitTrail
    />
  );
}
