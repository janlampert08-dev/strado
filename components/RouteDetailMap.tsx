"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { Box } from "lucide-react";
import TrafficIndicator, { type TrafficChipState } from "@/components/TrafficIndicator";
import { SPEED_LEGEND } from "@/lib/speed";
import {
  CONGESTION_META,
  fetchCongestionLevels,
  sliceRouteByTraffic,
  worstCongestion,
  type CongestionLevel,
} from "@/lib/traffic";
import type { RouteGeoJSON } from "@/types/database";
import { buttonVariants } from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Skeleton from "@/components/ui/Skeleton";

// Siehe ExploreView.tsx für die Begründung des dynamischen Imports.
const RouteMap = dynamic(() => import("@/components/RouteMap"), {
  ssr: false,
  loading: () => <Skeleton className="h-full w-full" />,
});

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

// Etwa ein Abfragepunkt pro 800m — genug, um Stauabschnitte sichtbar entlang
// der Strecke einzufärben, ohne bei langen Alpenpässen Hunderte parallele
// Tilequery-Aufrufe auszulösen.
const MIN_SAMPLES = 6;
const MAX_SAMPLES = 24;
const SAMPLES_PER_KM = 1.2;

export default function RouteDetailMap({ route }: { route: RouteGeoJSON }) {
  const [showSpeedLimits, setShowSpeedLimits] = useState(false);
  const [showTraffic, setShowTraffic] = useState(false);
  const [show3D, setShow3D] = useState(false);
  const hasTempolimits = !!route.tempolimits?.length;

  const coordinates = route.geometry_geojson.coordinates as [number, number][];
  const unavailable = !MAPBOX_TOKEN || coordinates.length < 2;

  // Einzige Verkehrsabfrage der Seite (siehe lib/traffic.ts) — speist sowohl
  // den Verkehrs-Indikator (worstCongestion) als auch die eingefärbten
  // Kartenabschnitte (sliceRouteByTraffic), statt wie zuvor zwei unabhängige
  // Mechanismen zu pflegen. Kein manueller Reset beim Streckenwechsel nötig:
  // die Seite rendert diese Komponente mit key={route.id} (siehe
  // app/strecken/[id]/page.tsx), ein Streckenwechsel montiert sie also neu.
  const [levels, setLevels] = useState<(CongestionLevel | null)[] | null>(null);

  useEffect(() => {
    if (unavailable) return;
    let cancelled = false;

    const sampleCount = Math.min(
      MAX_SAMPLES,
      Math.max(MIN_SAMPLES, Math.round(route.laenge_km * SAMPLES_PER_KM)),
    );

    fetchCongestionLevels(coordinates, sampleCount, MAPBOX_TOKEN!).then((result) => {
      if (!cancelled) setLevels(result);
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route.id]);

  const trafficState: TrafficChipState = unavailable
    ? "none"
    : levels === null
      ? "loading"
      : (worstCongestion(levels.filter((l): l is CongestionLevel => l !== null)) ?? "none");

  // Stabile Referenz statt eines Inline-`[route]`: die Prop landet in der
  // Abhängigkeitsliste des Effekts, der in RouteMap den Kartenausschnitt auf
  // die Strecken legt (fitRoutes). Ein frisches Array bei jedem Render liess
  // ihn bei jedem Umschalten von Tempolimits/Verkehr/3D erneut laufen — die
  // Karte sprang dann auf den vollen Streckenausschnitt zurück und verwarf
  // jedes Hineinzoomen des Nutzers.
  const routesForMap = useMemo(() => [route], [route]);

  const trafficSegments = useMemo(() => {
    if (!levels) return [];
    return sliceRouteByTraffic(coordinates, levels)
      .filter((s): s is { coords: [number, number][]; level: CongestionLevel } => s.level !== null)
      .map((s) => ({ coords: s.coords, color: CONGESTION_META[s.level].color }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [levels]);

  return (
    <div className="relative h-full w-full">
      <div className="h-full w-full" role="img" aria-label={`Kartenansicht der Strecke ${route.name}`}>
        <RouteMap
          routes={routesForMap}
          showSpeedLimits={showSpeedLimits}
          showTraffic={showTraffic}
          show3D={show3D}
          trafficSegments={trafficSegments}
        />
      </div>
      <div className="absolute top-4 left-4 flex flex-col items-start gap-2">
        <div className="flex flex-wrap gap-2">
          {hasTempolimits && (
            <button
              onClick={() => setShowSpeedLimits((v) => !v)}
              className={buttonVariants({ variant: "secondary", size: "sm", className: "bg-background" })}
            >
              {showSpeedLimits ? "Tempolimits ausblenden" : "Tempolimits anzeigen"}
            </button>
          )}
          <TrafficIndicator
            state={trafficState}
            active={showTraffic}
            onToggle={() => setShowTraffic((v) => !v)}
          />
          <button
            onClick={() => setShow3D((v) => !v)}
            aria-pressed={show3D}
            className={buttonVariants({ variant: "secondary", size: "sm", className: "bg-background" })}
          >
            <Box className="h-3.5 w-3.5" aria-hidden="true" />
            {show3D ? "2D-Ansicht" : "3D-Ansicht"}
          </button>
        </div>
        {showSpeedLimits && (
          <Card elevated className="flex flex-col gap-1 px-3 py-2 text-xs text-foreground">
            {SPEED_LEGEND.map((l) => (
              <div key={l.label} className="flex items-center gap-2">
                <span className="h-0.5 w-4" style={{ backgroundColor: l.color }} />
                {l.label}
              </div>
            ))}
          </Card>
        )}
        {showTraffic && trafficSegments.length > 0 && (
          <Card elevated className="flex flex-col gap-1 px-3 py-2 text-xs text-foreground">
            {Object.values(CONGESTION_META).map((meta) => (
              <div key={meta.label} className="flex items-center gap-2">
                <span className="h-0.5 w-4" style={{ backgroundColor: meta.color }} />
                {meta.label}
              </div>
            ))}
          </Card>
        )}
      </div>
    </div>
  );
}
