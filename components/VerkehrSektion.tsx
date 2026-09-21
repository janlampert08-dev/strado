"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import SectionHeading from "@/components/ui/SectionHeading";
import Card from "@/components/ui/Card";
import Skeleton from "@/components/ui/Skeleton";
import { AutoIcon } from "@/components/NavIcons";
import {
  CONGESTION_META,
  fetchCongestionLevels,
  sliceRouteByTraffic,
  verkehrSamplesFuerLaenge,
  worstCongestion,
  type CongestionLevel,
} from "@/lib/traffic";
import {
  startzeitenSatz,
  type Startzeit,
  type VerkehrsPunkt,
} from "@/lib/ruhigeZeiten";
import {
  baueVerkehrseinschaetzung,
  jetztInZuerich,
  prognoseFuerStunde,
} from "@/lib/verkehrslage";
import type { RouteGeoJSON } from "@/types/database";

// Wie die Hintergrundkarte (RouteDetailMap): kein SSR für Mapbox GL.
const RouteMap = dynamic(() => import("@/components/RouteMap"), {
  ssr: false,
  loading: () => <Skeleton className="h-full w-full" />,
});

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

// Der Verkehrsblock im Reiter Details — nur für Strecken ohne Pass. Mit
// Pass trägt die Pass-Sektion die Entscheidung ("kann ich los?"); ohne
// Pass gab es bisher nur die Wochenprognose weiter unten und den Live-Chip
// auf der Hintergrundkarte. Diese Sektion führt beides in einer
// Jetzt-Einschätzung zusammen und zeigt den Verkehrsfluss als eigene Karte
// im Reiter statt nur hinter dem Sheet.
export default function VerkehrSektion({
  route,
  punkte,
  startzeiten,
}: {
  route: RouteGeoJSON;
  punkte: VerkehrsPunkt[];
  startzeiten: Startzeit[];
}) {
  const coordinates = route.geometry_geojson.coordinates as [number, number][];
  const liveMoeglich = !!MAPBOX_TOKEN && coordinates.length >= 2;

  // Dieselbe Live-Abfrage wie die Hintergrundkarte (lib/traffic.ts) — erst
  // beim Öffnen des Reiters, nicht mit der Seite (AbschnittTabs montiert
  // nur das aktive Panel).
  const [levels, setLevels] = useState<(CongestionLevel | null)[] | null>(null);

  useEffect(() => {
    if (!liveMoeglich) return;
    let abgebrochen = false;
    fetchCongestionLevels(
      coordinates,
      verkehrSamplesFuerLaenge(route.laenge_km),
      MAPBOX_TOKEN!,
    ).then((ergebnis) => {
      if (!abgebrochen) setLevels(ergebnis);
    });
    return () => {
      abgebrochen = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route.id]);

  const live = useMemo(
    () =>
      worstCongestion(
        (levels ?? []).filter((l): l is CongestionLevel => l !== null),
      ),
    [levels],
  );

  // Die Stunde ist eine Aussage über jetzt — einmal je Mount, nicht je
  // Render: um Mitternacht kippt sie ohnehin mit dem nächsten Öffnen.
  const { wochentag, stunde } = useMemo(() => jetztInZuerich(), []);
  const prognoseFaktor = useMemo(
    () => prognoseFuerStunde(punkte, wochentag, stunde),
    [punkte, wochentag, stunde],
  );

  const einschaetzung = useMemo(
    () =>
      baueVerkehrseinschaetzung({
        live,
        prognoseFaktor,
        hatPrognose: punkte.length > 0,
        hatGemeinschaft: startzeitenSatz(startzeiten) !== null,
        liveLaedt: liveMoeglich && levels === null,
      }),
    [live, prognoseFaktor, punkte.length, startzeiten, liveMoeglich, levels],
  );

  // Stabile Referenz wie in RouteDetailMap: ein frisches Array je Render
  // liesse den fitRoutes-Effekt laufen und verwarf jedes Hineinzoomen.
  const routenFuerKarte = useMemo(() => [route], [route]);

  const verkehrsSegmente = useMemo(() => {
    if (!levels) return [];
    return sliceRouteByTraffic(coordinates, levels)
      .filter(
        (s): s is { coords: [number, number][]; level: CongestionLevel } =>
          s.level !== null,
      )
      .map((s) => ({ coords: s.coords, color: CONGESTION_META[s.level].color }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [levels]);

  const zeigtVerkehr = verkehrsSegmente.length > 0;

  return (
    <section className="flex flex-col gap-3">
      <SectionHeading icon={AutoIcon}>Verkehr</SectionHeading>

      <Card className="px-4 py-3">
        <p className="text-sm font-medium">{einschaetzung.titel}</p>
        {einschaetzung.detail && (
          <p className="mt-1 text-sm text-muted">{einschaetzung.detail}</p>
        )}
        {einschaetzung.quellen.length > 0 && (
          <p className="mt-1 text-xs text-muted">
            Quellen: {einschaetzung.quellen.join(" · ")}
          </p>
        )}
      </Card>

      <div className="h-56 w-full overflow-hidden rounded-xl border border-border">
        <RouteMap
          routes={routenFuerKarte}
          trafficSegments={verkehrsSegmente}
          showTraffic={zeigtVerkehr}
          ohneBedienelemente
          routesClickable={false}
        />
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {zeigtVerkehr ? (
          Object.values(CONGESTION_META).map((meta) => (
            <span
              key={meta.label}
              className="flex items-center gap-1.5 text-xs text-muted"
            >
              <span
                aria-hidden="true"
                className="h-0.5 w-4"
                style={{ backgroundColor: meta.color }}
              />
              {meta.label}
            </span>
          ))
        ) : (
          <span className="text-xs text-muted">
            {liveMoeglich
              ? "Verkehrsfluss: Mapbox"
              : "Ohne Live-Verkehrsdaten — die Linie zeigt die Strecke."}
          </span>
        )}
      </div>
    </section>
  );
}
